/**
 * video-preparation — l'enchaînement sonde → politique → conversion, sur un
 * environnement SIMULÉ (jsdom et node n'ont ni décodeur vidéo ni
 * `MediaRecorder`). La conversion réelle d'un .mov se recette dans Safari.
 */
import { describe, expect, it, vi } from "vitest"

import { createAppI18n } from "../../i18n"
import {
	convertedVideoName,
	measuredVideoDuration,
	prepareVideoForUpload,
	rememberVideoDuration,
	type VideoPreparationPhase,
	type VideoRuntime,
} from "./video-preparation"
import { TRANSCODE_ABORTED, type TranscodeOptions } from "./video-upload-probe"
import { POST_VIDEO_UPLOAD_LIMITS, VIDEO_TRANSCODE_MAX_DURATION_MS } from "./video-upload-policy"

const t = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "reseau" }).getFixedT("fr")

function video(name: string, type: string, size = 2_048): File {
	return new File([new Uint8Array(size)], name, { type })
}

/** Un navigateur simulé : ce qu'il sait lire, encoder, et ce que rend sa conversion. */
function runtime(options: {
	decodable?: boolean
	durationMs?: number | null
	codecs?: readonly string[] | null
	targets?: readonly string[]
	transcode?: VideoRuntime["transcode"]
} = {}) {
	const urls: string[] = []
	const revoked: string[] = []
	const transcodeCalls: TranscodeOptions[] = []
	const value: VideoRuntime = {
		createObjectUrl: (file) => {
			const url = `blob:${(file as File).name}`
			urls.push(url)
			return url
		},
		revokeObjectUrl: (url) => {
			revoked.push(url)
		},
		probe: async () => ({ decodable: options.decodable ?? true, durationMs: options.durationMs === undefined ? 9_000 : options.durationMs }),
		sniffMp4Codecs: vi.fn(async () => options.codecs ?? null),
		recorderTargets: () => options.targets ?? ["video/mp4"],
		transcode:
			options.transcode ??
			(async (_url, transcodeOptions, onProgress) => {
				transcodeCalls.push(transcodeOptions)
				onProgress?.(0.5)
				onProgress?.(1)
				return { blob: new Blob([new Uint8Array(1_024)], { type: "video/mp4" }), mimeType: "video/mp4", durationMs: 8_960 }
			}),
	}
	return { value, urls, revoked, transcodeCalls }
}

describe("prepareVideoForUpload — ce qui part, et ce qui ne part pas", () => {
	it("un MP4 lisible part TEL QUEL avec sa durée arrondie ; l'adresse locale est libérée", async () => {
		const env = runtime({ durationMs: 12_400.6, codecs: ["avc1"] })
		const file = video("visite.mp4", "video/mp4")
		const result = await prepareVideoForUpload(file, { limits: POST_VIDEO_UPLOAD_LIMITS, t }, env.value)
		expect(result).toEqual({ status: "ready", file, durationMs: 12_401, converted: false })
		expect(env.transcodeCalls).toEqual([])
		expect(env.revoked).toEqual(env.urls)
	})

	it("un .mov que le navigateur lit est CONVERTI : progression annoncée, fichier MP4 renommé, durée enregistrée", async () => {
		const env = runtime({ durationMs: 9_000 })
		const phases: VideoPreparationPhase[] = []
		const result = await prepareVideoForUpload(
			video("IMG_0412.MOV", "video/quicktime"),
			{ limits: POST_VIDEO_UPLOAD_LIMITS, t, onPhase: (phase) => phases.push(phase) },
			env.value,
		)
		expect(phases).toEqual([
			{ phase: "probing" },
			{ phase: "converting", progress: 0 },
			{ phase: "converting", progress: 0.5 },
			{ phase: "converting", progress: 1 },
		])
		expect(env.transcodeCalls).toHaveLength(1)
		expect(env.transcodeCalls[0]?.targetMime).toBe("video/mp4")
		expect(result.status).toBe("ready")
		if (result.status === "ready") {
			expect(result.converted).toBe(true)
			expect(result.file.name).toBe("IMG_0412.mp4")
			expect(result.file.type).toBe("video/mp4")
			expect(result.durationMs).toBe(8_960)
		}
		expect(env.revoked).toEqual(env.urls)
	})

	it("un MP4 en HEVC (codec prouvé non universel) passe aussi par la conversion", async () => {
		const env = runtime({ codecs: ["hvc1"] })
		const result = await prepareVideoForUpload(video("iphone.mp4", "video/mp4"), { limits: POST_VIDEO_UPLOAD_LIMITS, t }, env.value)
		expect(env.value.sniffMp4Codecs).toHaveBeenCalledTimes(1)
		expect(result.status === "ready" && result.converted).toBe(true)
	})

	it("un .mov que le navigateur ne lit pas est REFUSÉ avec la marche à suivre, sans conversion", async () => {
		const env = runtime({ decodable: false, durationMs: null })
		const result = await prepareVideoForUpload(video("IMG_0412.MOV", "video/quicktime"), { limits: POST_VIDEO_UPLOAD_LIMITS, t }, env.value)
		expect(result.status).toBe("refused")
		if (result.status === "refused") {
			expect(result.message).toContain("IMG_0412.MOV")
			expect(result.message).toContain("Safari")
			expect(result.message).toContain("MP4")
		}
		expect(env.transcodeCalls).toEqual([])
		expect(env.value.sniffMp4Codecs).not.toHaveBeenCalled()
	})

	it("une vidéo au-delà de cinq minutes est refusée avant toute conversion", async () => {
		const env = runtime({ durationMs: 6 * 60_000 })
		const result = await prepareVideoForUpload(video("long.mp4", "video/mp4"), { limits: POST_VIDEO_UPLOAD_LIMITS, t }, env.value)
		expect(result).toEqual({ status: "refused", message: "« long.mp4 » est trop longue. Une vidéo dure au plus 5 minutes." })
	})

	it("un .mov trop long À CONVERTIR est refusé en disant d'enregistrer un MP4", async () => {
		const env = runtime({ durationMs: VIDEO_TRANSCODE_MAX_DURATION_MS + 1 })
		const result = await prepareVideoForUpload(video("souvenir.mov", "video/quicktime"), { limits: POST_VIDEO_UPLOAD_LIMITS, t }, env.value)
		expect(result.status === "refused" && result.message).toContain("3 minutes")
		expect(env.transcodeCalls).toEqual([])
	})

	it("une conversion qui échoue devient un refus dit, jamais une exception", async () => {
		const env = runtime({ transcode: async () => { throw new Error("transcode:recorder") } })
		const result = await prepareVideoForUpload(video("souvenir.mov", "video/quicktime"), { limits: POST_VIDEO_UPLOAD_LIMITS, t }, env.value)
		expect(result).toEqual({ status: "refused", message: "La conversion de la vidéo a échoué. Enregistrez-la au format MP4, puis réessayez." })
		expect(env.revoked).toEqual(env.urls)
	})

	it("l'ANNULATION pendant la conversion rend `cancelled` et libère l'adresse locale", async () => {
		const controller = new AbortController()
		const env = runtime({
			transcode: (_url, options) =>
				new Promise((_resolve, reject) => {
					options.signal?.addEventListener("abort", () => reject(new Error(TRANSCODE_ABORTED)), { once: true })
				}),
		})
		const pending = prepareVideoForUpload(video("souvenir.mov", "video/quicktime"), { limits: POST_VIDEO_UPLOAD_LIMITS, t, signal: controller.signal }, env.value)
		await vi.waitFor(() => expect(env.urls).toHaveLength(1))
		await Promise.resolve()
		controller.abort()
		expect(await pending).toEqual({ status: "cancelled" })
		expect(env.revoked).toEqual(env.urls)
	})

	it("déjà annulée, la préparation ne touche à rien", async () => {
		const controller = new AbortController()
		controller.abort()
		const env = runtime()
		expect(await prepareVideoForUpload(video("clip.mp4", "video/mp4"), { limits: POST_VIDEO_UPLOAD_LIMITS, t, signal: controller.signal }, env.value)).toEqual({ status: "cancelled" })
		expect(env.urls).toEqual([])
	})
})

describe("le nom du converti et la durée qui voyage avec le fichier", () => {
	it("garde le nom de l'original et prend l'extension du nouveau conteneur", () => {
		expect(convertedVideoName("IMG_0412.MOV", "video/mp4")).toBe("IMG_0412.mp4")
		expect(convertedVideoName("fête.de.famille.mkv", "video/webm")).toBe("fête.de.famille.webm")
		expect(convertedVideoName("sans-extension", "video/webm;codecs=vp9")).toBe("sans-extension.webm")
		expect(convertedVideoName(".mov", "video/mp4")).toBe(".mov.mp4")
		expect(convertedVideoName("", "video/mp4")).toBe("video.mp4")
	})

	it("retient une durée mesurée, arrondie ; oublie ce qui n'en est pas une", () => {
		const measured = video("a.mp4", "video/mp4")
		rememberVideoDuration(measured, 12_400.6)
		expect(measuredVideoDuration(measured)).toBe(12_401)
		const unknown = video("b.mp4", "video/mp4")
		for (const value of [undefined, Number.NaN, Number.POSITIVE_INFINITY, -1]) rememberVideoDuration(unknown, value)
		expect(measuredVideoDuration(unknown)).toBeUndefined()
	})
})
