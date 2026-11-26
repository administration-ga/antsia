// Dupliqué de socle/packages/agent-features/src/features/stories/story-video-policy.test.ts @ ad2e7fdc2 — adaptations : borne unique du moteur pour une Story (`STORY_VIDEO_LIMITS`, cinq minutes et cinquante mégaoctets) au lieu des bornes par destination — cas « neuf minutes sur iRéseau », « au-delà de dix minutes », « huit minutes sans conversion » ramenés à cette borne, cas « sans destination connue » retiré ; refus lus par l'i18n du moteur (`t` français, mêmes fragments attendus) ; cas ajouté : refus en anglais ; SD-03 : module renommé `video-upload-policy`, bornes en paramètre (`STORY_VIDEO_UPLOAD_LIMITS`), cas ajoutés pour les bornes d'une PUBLICATION (`POST_VIDEO_UPLOAD_LIMITS` : soixante mégaoctets, cinq minutes), le refus guidé du .mov qu'un navigateur ne lit pas, le tri des fichiers proposés ; issue antsia#142 : chaque plan refusé porte son code à liste fermée (`refusal`) ; M2 (25/11/2026) : le plan reçoit le POIDS de la source (`sizeBytes`) — cas d'un MP4 trop lourd mais convertible, compressé au lieu d'être refusé, et du plafond de la source à convertir.
import { describe, expect, it } from "vitest"

import { POST_VIDEO_MAX_BYTES, POST_VIDEO_MAX_DURATION_MS } from "@antsia/social-domain/content"
import { STORY_VIDEO_LIMITS } from "@antsia/social-domain/stories"

import { createAppI18n } from "../../i18n"
import {
	isDirectUploadVideoType,
	isVideoCandidateType,
	POST_VIDEO_UPLOAD_LIMITS,
	STORY_VIDEO_UPLOAD_LIMITS,
	VIDEO_TRANSCODE_MAX_DURATION_MS,
	VIDEO_TRANSCODE_MAX_SOURCE_BYTES,
	VIDEO_TRANSCODE_TARGETS,
	VIDEO_UPLOAD_ACCEPT,
	videoDurationLabel,
	videoUploadPlan,
	transcodeVideoBitrate,
	type VideoUploadLimits,
	type VideoUploadProbe,
} from "./video-upload-policy"

const i18n = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "reseau" })
const t = i18n.getFixedT("fr")
const tEn = i18n.getFixedT("en")

const NOM = "instant.mov"
const MB = 1024 * 1024
/** Le poids d'une vidéo ordinaire, sous toutes les bornes d'envoi. */
const LIGHT = 8 * MB

/** Un plan sous les bornes d'une Story, comme le composeur de Story le demande. */
function storyPlan(
	input: { fileName: string; mimeType: string; probe: VideoUploadProbe; recorderTargets: readonly string[]; sizeBytes?: number },
	translate = t,
) {
	return videoUploadPlan({ sizeBytes: LIGHT, ...input, limits: STORY_VIDEO_UPLOAD_LIMITS }, translate)
}

describe("videoUploadPlan — upload, conversion ou refus", () => {
	it("un MP4 décodable et court part TEL QUEL, durée arrondie", () => {
		const plan = storyPlan({
			fileName: "clip.mp4",
			mimeType: "video/mp4",
			probe: { decodable: true, durationMs: 12_400.6 },
			recorderTargets: [...VIDEO_TRANSCODE_TARGETS],
		})
		expect(plan).toEqual({ action: "upload", durationMs: 12_401 })
	})

	it("un WebM à paramètres de codec reste un WebM — le conteneur NU décide", () => {
		const plan = storyPlan({
			fileName: "clip.webm",
			mimeType: "video/webm;codecs=vp9,opus",
			probe: { decodable: true, durationMs: 8_000 },
			recorderTargets: [...VIDEO_TRANSCODE_TARGETS],
		})
		expect(plan.action).toBe("upload")
	})

	it("un .mov DÉCODABLE se convertit vers la première cible supportée", () => {
		const plan = storyPlan({
			fileName: NOM,
			mimeType: "video/quicktime",
			probe: { decodable: true, durationMs: 9_000 },
			recorderTargets: ["video/webm;codecs=vp9", "video/webm"],
		})
		expect(plan.action).toBe("transcode")
		if (plan.action === "transcode") {
			expect(plan.targetMime).toBe("video/webm;codecs=vp9")
			expect(plan.durationMs).toBe(9_000)
			expect(plan.videoBitsPerSecond).toBeGreaterThan(0)
			expect(plan.hardStopMs).toBeGreaterThan(0)
		}
	})

	it("un .mov INDÉCODABLE se refuse en guidant — on ne convertit pas ce qu'on ne sait pas lire", () => {
		const plan = storyPlan({
			fileName: NOM,
			mimeType: "video/quicktime",
			probe: { decodable: false, durationMs: null },
			recorderTargets: [...VIDEO_TRANSCODE_TARGETS],
		})
		expect(plan.action).toBe("refuse")
		if (plan.action === "refuse") {
			expect(plan.refusal).toBe("not-decodable")
			expect(plan.error).toContain(NOM)
			expect(plan.error).toContain("MP4")
		}
	})

	it("une durée NON MESURABLE passe — la borne serveur reste l'arbitre", () => {
		const plan = storyPlan({
			fileName: "clip.mp4",
			mimeType: "video/mp4",
			probe: { decodable: true, durationMs: null },
			recorderTargets: [...VIDEO_TRANSCODE_TARGETS],
		})
		expect(plan).toEqual({ action: "upload", durationMs: undefined })
	})

	it("aucun encodeur disponible → refus explicite, jamais un envoi illisible", () => {
		const plan = storyPlan({
			fileName: NOM,
			mimeType: "video/quicktime",
			probe: { decodable: true, durationMs: 5_000 },
			recorderTargets: [],
		})
		expect(plan.action).toBe("refuse")
		if (plan.action === "refuse") {
			expect(plan.refusal).toBe("no-encoder")
			expect(plan.error).toContain("convertir")
		}
	})
})

describe("la borne de durée d'une Story est celle du moteur — cinq minutes", () => {
	const longClip = (durationMs: number, translate = t) =>
		storyPlan(
			{
				fileName: "long.mp4",
				mimeType: "video/mp4",
				probe: { decodable: true, durationMs },
				recorderTargets: [...VIDEO_TRANSCODE_TARGETS],
			},
			translate,
		)

	it("reprend les bornes du domaine, sans les recopier", () => {
		expect(STORY_VIDEO_UPLOAD_LIMITS).toEqual(STORY_VIDEO_LIMITS)
	})

	it("laisse passer quatre minutes", () => {
		expect(STORY_VIDEO_LIMITS.maxDurationMs).toBe(5 * 60_000)
		expect(longClip(4 * 60_000).action).toBe("upload")
	})

	it("refuse au-delà de cinq minutes", () => {
		const plan = longClip(5 * 60_000 + 1)
		expect(plan.action).toBe("refuse")
		if (plan.action === "refuse") {
			expect(plan.refusal).toBe("too-long")
			expect(plan.error).toContain("5 minutes")
			expect(plan.error).toContain("long.mp4")
		}
	})

	it("dit la borne entière dans la phrase de refus", () => {
		const plan = longClip(6 * 60_000)
		expect(plan.action).toBe("refuse")
		if (plan.action === "refuse") {
			expect(plan.error).toBe(
				"« long.mp4 » est trop longue. Une vidéo dure au plus 5 minutes.",
			)
		}
	})

	it("parle la langue de l'écran", () => {
		const plan = longClip(6 * 60_000, tEn)
		expect(plan.action === "refuse" && plan.error).toBe(
			"“long.mp4” is too long. A video lasts at most 5 minutes.",
		)
	})
})

describe("SD-03 — les bornes d'une PUBLICATION", () => {
	const postPlan = (
		input: { fileName: string; mimeType: string; probe: VideoUploadProbe; recorderTargets?: readonly string[]; sizeBytes?: number },
		translate = t,
	) =>
		videoUploadPlan(
			{ recorderTargets: [...VIDEO_TRANSCODE_TARGETS], sizeBytes: LIGHT, ...input, limits: POST_VIDEO_UPLOAD_LIMITS },
			translate,
		)

	it("reprennent le domaine : soixante mégaoctets, cinq minutes", () => {
		expect(POST_VIDEO_UPLOAD_LIMITS).toEqual({ maxBytes: POST_VIDEO_MAX_BYTES, maxDurationMs: POST_VIDEO_MAX_DURATION_MS })
		expect(POST_VIDEO_UPLOAD_LIMITS.maxBytes).toBe(60 * 1024 * 1024)
		expect(POST_VIDEO_UPLOAD_LIMITS.maxDurationMs).toBe(5 * 60_000)
	})

	it("un MP4 de quatre minutes part tel quel ; au-delà de cinq, refus qui nomme la borne", () => {
		expect(postPlan({ fileName: "visite.mp4", mimeType: "video/mp4", probe: { decodable: true, durationMs: 4 * 60_000 } })).toEqual({
			action: "upload",
			durationMs: 4 * 60_000,
		})
		const refused = postPlan({ fileName: "conference.mp4", mimeType: "video/mp4", probe: { decodable: true, durationMs: 5 * 60_000 + 1 } })
		expect(refused).toEqual({ action: "refuse", refusal: "too-long", error: "« conference.mp4 » est trop longue. Une vidéo dure au plus 5 minutes." })
	})

	it("un .mov choisi dans Safari (décodable, encodeur MP4) se convertit vers MP4, dans le budget de soixante mégaoctets", () => {
		const plan = postPlan({ fileName: "IMG_0412.MOV", mimeType: "video/quicktime", probe: { decodable: true, durationMs: VIDEO_TRANSCODE_MAX_DURATION_MS }, recorderTargets: ["video/mp4"] })
		expect(plan.action).toBe("transcode")
		if (plan.action === "transcode") {
			expect(plan.targetMime).toBe("video/mp4")
			expect(plan.durationMs).toBe(VIDEO_TRANSCODE_MAX_DURATION_MS)
			// La preuve qui compte : le fichier visé, au pire de la conversion, tient sous la borne.
			const projectedBytes = ((plan.videoBitsPerSecond + 128_000) * (plan.hardStopMs / 1_000)) / 8
			expect(projectedBytes).toBeLessThan(POST_VIDEO_UPLOAD_LIMITS.maxBytes)
			expect(plan.hardStopMs).toBeLessThanOrEqual(VIDEO_TRANSCODE_MAX_DURATION_MS + 2_000)
		}
	})

	it("un .mov choisi dans Chrome (indécodable) est refusé avec la marche à suivre, en français et en anglais", () => {
		const probe = { decodable: false, durationMs: null }
		const fr = postPlan({ fileName: "IMG_0412.MOV", mimeType: "video/quicktime", probe })
		expect(fr).toEqual({
			action: "refuse",
			refusal: "not-decodable",
			error: "« IMG_0412.MOV » ne peut pas être lue par ce navigateur. Choisissez-la depuis Safari (iPhone, iPad ou Mac), qui la convertit, ou enregistrez-la d'abord au format MP4, puis réessayez.",
		})
		expect(postPlan({ fileName: "IMG_0412.MOV", mimeType: "video/quicktime", probe }, tEn)).toEqual({
			action: "refuse",
			refusal: "not-decodable",
			error: "This browser cannot play “IMG_0412.MOV”. Choose it from Safari (iPhone, iPad or Mac), which converts it, or save it as MP4 first, then try again.",
		})
	})

	it("une publication a plus d'octets qu'une Story : la conversion y garde un meilleur débit", () => {
		// Trois minutes : sous ce seuil, les deux atteignent le plafond de qualité.
		const durationMs = VIDEO_TRANSCODE_MAX_DURATION_MS
		const story = transcodeVideoBitrate({ durationMs, maxBytes: STORY_VIDEO_UPLOAD_LIMITS.maxBytes, maxDurationMs: VIDEO_TRANSCODE_MAX_DURATION_MS })
		const post = transcodeVideoBitrate({ durationMs, maxBytes: POST_VIDEO_UPLOAD_LIMITS.maxBytes, maxDurationMs: VIDEO_TRANSCODE_MAX_DURATION_MS })
		expect(post).toBeGreaterThan(story)
	})

	it("des bornes plus courtes que la conversion bornent aussi la ceinture", () => {
		const short: VideoUploadLimits = { maxBytes: POST_VIDEO_MAX_BYTES, maxDurationMs: 60_000 }
		const plan = videoUploadPlan({ fileName: NOM, mimeType: "video/quicktime", sizeBytes: LIGHT, probe: { decodable: true, durationMs: null }, recorderTargets: ["video/mp4"], limits: short }, t)
		expect(plan.action === "transcode" && plan.hardStopMs).toBe(60_000 + 1_500)
	})
})

describe("M2 — une vidéo de téléphone trop lourde est compressée au lieu d'être refusée", () => {
	const postPlan = (input: { fileName?: string; mimeType?: string; sizeBytes: number; durationMs: number | null; recorderTargets?: readonly string[] }, translate = t) =>
		videoUploadPlan(
			{
				fileName: input.fileName ?? "anniversaire.mp4",
				mimeType: input.mimeType ?? "video/mp4",
				sizeBytes: input.sizeBytes,
				probe: { decodable: true, durationMs: input.durationMs },
				recorderTargets: input.recorderTargets ?? [...VIDEO_TRANSCODE_TARGETS],
				containerCodecs: ["avc1"],
				limits: POST_VIDEO_UPLOAD_LIMITS,
			},
			translate,
		)

	it("un MP4 H.264 jusqu'à la borne d'envoi part tel quel, comme avant", () => {
		expect(postPlan({ sizeBytes: POST_VIDEO_UPLOAD_LIMITS.maxBytes, durationMs: 45_000 })).toEqual({ action: "upload", durationMs: 45_000 })
	})

	it("un MP4 H.264 de 150 Mo et 45 s (1080p d'Android) passe par la conversion, à 2,5 Mbit/s au plus, sous la borne", () => {
		const plan = postPlan({ sizeBytes: 150 * MB, durationMs: 45_000 })
		expect(plan.action).toBe("transcode")
		if (plan.action !== "transcode") return
		expect(plan.targetMime).toBe("video/mp4")
		expect(plan.durationMs).toBe(45_000)
		expect(plan.videoBitsPerSecond).toBe(2_500_000)
		const projectedBytes = ((plan.videoBitsPerSecond + 128_000) * (45_000 + 1_500)) / 1_000 / 8
		expect(projectedBytes).toBeLessThan(POST_VIDEO_UPLOAD_LIMITS.maxBytes)
	})

	it("un WebM trop lourd se compresse aussi ; la cible est la première que ce navigateur sait produire", () => {
		const plan = postPlan({ fileName: "clip.webm", mimeType: "video/webm", sizeBytes: 90 * MB, durationMs: 30_000, recorderTargets: ["video/webm;codecs=vp9"] })
		expect(plan.action === "transcode" && plan.targetMime).toBe("video/webm;codecs=vp9")
	})

	it("trois minutes au plus à compresser : le débit se calcule pour tenir les soixante mégaoctets", () => {
		const plan = postPlan({ sizeBytes: 400 * MB, durationMs: VIDEO_TRANSCODE_MAX_DURATION_MS })
		expect(plan.action).toBe("transcode")
		if (plan.action !== "transcode") return
		expect(plan.videoBitsPerSecond).toBeLessThanOrEqual(2_500_000)
		const projectedBytes = ((plan.videoBitsPerSecond + 128_000) * plan.hardStopMs) / 1_000 / 8
		expect(projectedBytes).toBeLessThan(POST_VIDEO_UPLOAD_LIMITS.maxBytes)
		expect(plan.hardStopMs).toBe(VIDEO_TRANSCODE_MAX_DURATION_MS + 1_500)
	})

	it("trop lourde ET plus de trois minutes : refus qui dit quoi faire, sans conseiller le MP4 qu'elle est déjà", () => {
		const plan = postPlan({ sizeBytes: 300 * MB, durationMs: 4 * 60_000 })
		expect(plan).toEqual({
			action: "refuse",
			refusal: "too-long-to-convert",
			error: "« anniversaire.mp4 » pèse plus de 60 Mo : elle doit être compressée ici, en temps réel, et au-delà de 3 minutes c'est trop long à attendre. Raccourcissez-la, ou filmez en 1080p, puis réessayez.",
		})
	})

	it("trop lourde et aucun encodeur dans ce navigateur : refus nommé, jamais un envoi voué au refus du serveur", () => {
		const plan = postPlan({ sizeBytes: 120 * MB, durationMs: 30_000, recorderTargets: [] })
		expect(plan).toEqual({
			action: "refuse",
			refusal: "no-encoder",
			error: "« anniversaire.mp4 » pèse plus de 60 Mo et ce navigateur ne sait pas la compresser. Choisissez-la depuis un autre navigateur, ou raccourcissez-la, puis réessayez.",
		})
	})

	it("le plafond de la source protège le navigateur : un gigaoctet au plus à convertir, borne comprise", () => {
		expect(VIDEO_TRANSCODE_MAX_SOURCE_BYTES).toBe(1024 * MB)
		expect(postPlan({ sizeBytes: VIDEO_TRANSCODE_MAX_SOURCE_BYTES, durationMs: 60_000 }).action).toBe("transcode")
		const fr = postPlan({ sizeBytes: VIDEO_TRANSCODE_MAX_SOURCE_BYTES + 1, durationMs: 60_000 })
		expect(fr).toEqual({
			action: "refuse",
			refusal: "too-large-to-convert",
			error: "« anniversaire.mp4 » est trop lourde pour être convertie dans ce navigateur (1 Go au plus). Raccourcissez-la, ou filmez en 1080p, puis réessayez.",
		})
		expect(postPlan({ sizeBytes: VIDEO_TRANSCODE_MAX_SOURCE_BYTES + 1, durationMs: 60_000 }, tEn)).toMatchObject({
			refusal: "too-large-to-convert",
			error: "“anniversaire.mp4” is too large to be converted in this browser (1 GB at most). Shorten it, or film in 1080p, then try again.",
		})
	})

	it("le plafond vaut pour toute conversion : un .mov de plus d'un gigaoctet est refusé avant d'être joué", () => {
		const plan = videoUploadPlan({ fileName: "IMG_0412.MOV", mimeType: "video/quicktime", sizeBytes: 2 * 1024 * MB, probe: { decodable: true, durationMs: 90_000 }, recorderTargets: ["video/mp4"], limits: POST_VIDEO_UPLOAD_LIMITS }, t)
		expect(plan.action === "refuse" && plan.refusal).toBe("too-large-to-convert")
		// Le .mov ordinaire d'un iPhone (80 Mo) se convertit comme avant.
		expect(videoUploadPlan({ fileName: "IMG_0412.MOV", mimeType: "video/quicktime", sizeBytes: 80 * MB, probe: { decodable: true, durationMs: 90_000 }, recorderTargets: ["video/mp4"], limits: POST_VIDEO_UPLOAD_LIMITS }, t).action).toBe("transcode")
	})

	it("une vidéo plus longue que la borne produit reste refusée « trop longue », quel que soit son poids", () => {
		expect(postPlan({ sizeBytes: 300 * MB, durationMs: 6 * 60_000 })).toMatchObject({ action: "refuse", refusal: "too-long" })
	})

	it("une Story suit la même règle sous ses cinquante mégaoctets", () => {
		const plan = videoUploadPlan({ fileName: "actu.mp4", mimeType: "video/mp4", sizeBytes: 55 * MB, probe: { decodable: true, durationMs: 20_000 }, recorderTargets: ["video/mp4"], containerCodecs: ["avc1"], limits: STORY_VIDEO_UPLOAD_LIMITS }, t)
		expect(plan.action).toBe("transcode")
	})
})

describe("ce que le sélecteur propose et ce qui part tel quel", () => {
	it("propose TOUTE vidéo : le .mov doit pouvoir être choisi pour être converti", () => {
		expect(VIDEO_UPLOAD_ACCEPT).toBe("video/*")
		for (const type of ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska", "VIDEO/MP4"]) expect(isVideoCandidateType(type)).toBe(true)
		for (const type of ["image/png", "audio/mp4", "application/pdf", ""]) expect(isVideoCandidateType(type)).toBe(false)
	})

	it("seuls MP4 et WebM partent sans conversion de conteneur", () => {
		expect(isDirectUploadVideoType("video/mp4")).toBe(true)
		expect(isDirectUploadVideoType("video/webm;codecs=vp9")).toBe(true)
		expect(isDirectUploadVideoType("video/quicktime")).toBe(false)
	})

	it("dit une durée en minutes entières, sinon en secondes", () => {
		expect(videoDurationLabel(5 * 60_000, t)).toBe("5 minutes")
		expect(videoDurationLabel(60_000, t)).toBe("1 minute")
		expect(videoDurationLabel(45_000, t)).toBe("45 secondes")
		expect(videoDurationLabel(3 * 60_000, tEn)).toBe("3 minutes")
	})
})

describe("le budget de CONVERSION est propre au composeur", () => {
	const mov = (durationMs: number) =>
		storyPlan({
			fileName: NOM,
			mimeType: "video/quicktime",
			probe: { decodable: true, durationMs },
			recorderTargets: [...VIDEO_TRANSCODE_TARGETS],
		})

	it("convertit jusqu'à trois minutes", () => {
		expect(mov(VIDEO_TRANSCODE_MAX_DURATION_MS).action).toBe("transcode")
	})

	it("refuse de convertir au-delà, en disant quoi faire", () => {
		const plan = mov(VIDEO_TRANSCODE_MAX_DURATION_MS + 1)
		expect(plan.action).toBe("refuse")
		if (plan.action === "refuse") {
			expect(plan.refusal).toBe("too-long-to-convert")
			expect(plan.error).toContain("3 minutes")
			expect(plan.error).toContain("MP4")
		}
	})

	it("ne rétrécit PAS la vidéo : le même MP4 de quatre minutes part sans conversion", () => {
		// Le budget borne le TRAVAIL du navigateur, pas ce qu'une vidéo a le
		// droit de durer. Confondre les deux ferait passer la conversion pour
		// une borne produit.
		const plan = storyPlan({
			fileName: "long.mp4",
			mimeType: "video/mp4",
			probe: { decodable: true, durationMs: 4 * 60_000 },
			recorderTargets: [...VIDEO_TRANSCODE_TARGETS],
		})
		expect(4 * 60_000).toBeGreaterThan(VIDEO_TRANSCODE_MAX_DURATION_MS)
		expect(plan.action).toBe("upload")
	})

	it("arrête la conversion au budget, jamais aux cinq minutes de la vidéo", () => {
		const plan = mov(60_000)
		expect(plan.action).toBe("transcode")
		if (plan.action === "transcode") {
			expect(plan.hardStopMs).toBeLessThanOrEqual(
				VIDEO_TRANSCODE_MAX_DURATION_MS + 2_000,
			)
		}
	})
})

describe("transcodeVideoBitrate — tenir dans le budget d'octets", () => {
	const { maxBytes, maxDurationMs } = STORY_VIDEO_LIMITS

	it("reste sous le plafond de qualité pour un clip court", () => {
		expect(
			transcodeVideoBitrate({ durationMs: 10_000, maxBytes, maxDurationMs }),
		).toBe(2_500_000)
	})

	it("descend le débit quand la vidéo s'allonge, pour que le fichier tienne", () => {
		const bps = transcodeVideoBitrate({
			durationMs: 3 * 60_000,
			maxBytes,
			maxDurationMs,
		})
		expect(bps).toBeLessThan(2_500_000)
		// La preuve qui compte : le fichier visé PASSE la borne d'octets.
		const projectedBytes = ((bps + 128_000) * 180) / 8
		expect(projectedBytes).toBeLessThan(maxBytes)
	})

	it("calcule au PIRE cas quand la durée est inconnue", () => {
		// Sans durée, la ceinture laisse aller jusqu'à la borne : un débit
		// calculé sur une durée optimiste produirait un fichier refusé APRÈS
		// l'attente de la conversion.
		expect(
			transcodeVideoBitrate({ durationMs: null, maxBytes, maxDurationMs }),
		).toBe(
			transcodeVideoBitrate({
				durationMs: maxDurationMs,
				maxBytes,
				maxDurationMs,
			}),
		)
	})

	it("ne descend jamais sous un plancher d'image regardable", () => {
		expect(
			transcodeVideoBitrate({
				durationMs: 60 * 60_000,
				maxBytes: 1_024,
				maxDurationMs,
			}),
		).toBe(400_000)
	})
})
