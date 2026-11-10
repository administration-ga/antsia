// Dupliqué de socle/packages/agent-features/src/features/stories/story-video-probe.ts @ ad2e7fdc2 — adaptations : câblage DOM inchangé (échecs signalés par des codes internes jamais affichés) ; en-tête de provenance ; SD-03 : module renommé `video-upload-probe` et sorti des Stories (`features/video-upload`), ANNULATION de la conversion par un `AbortSignal` facultatif (`TranscodeOptions.signal`, échec nommé `TRANSCODE_ABORTED`, ressources libérées), nettoyage aussi quand l'arrêt de l'enregistreur échoue.
"use client"

/**
 * video-upload-probe — la MAIN d'œuvre vidéo des composeurs (Story,
 * publication) : sonder un fichier, et le CONVERTIR vers MP4/WebM quand la
 * politique le demande.
 *
 * Les DÉCISIONS vivent dans `video-upload-policy.ts` (pur, testé) et
 * l'enchaînement dans `video-preparation.ts` (testé avec un environnement
 * simulé) ; ce module n'est que du câblage DOM — jsdom n'a ni décodeur vidéo
 * ni `MediaRecorder`, il est donc documenté plutôt que testé, et il reste
 * VOLONTAIREMENT bête : pas d'état, pas de retry, une promesse par geste.
 *
 * ── La conversion, en une phrase ─────────────────────────────────────────
 * On JOUE la vidéo source dans un <video> hors document (en la décodant avec
 * le décodeur natif du navigateur — c'est pour cela que « décodable ici » est
 * un prérequis), on recopie chaque image sur un canvas dont on capture le
 * flux, on récupère l'audio par le graphe WebAudio (MediaElementSource →
 * MediaStreamDestination : rien ne sort au haut-parleur, tout va au flux), et
 * `MediaRecorder` encode le tout vers la cible.
 *
 * ⚠️ La conversion coûte le TEMPS RÉEL de la vidéo, et l'onglet doit rester
 * visible : une fenêtre masquée suspend `requestAnimationFrame`, le canvas
 * cesse d'être redessiné, et l'enregistrement continue sur une image figée
 * sans qu'aucune erreur ne le dise. C'est `videoUploadPlan` qui borne l'attente
 * (`VIDEO_TRANSCODE_MAX_DURATION_MS`) ; ce module ne fait qu'appliquer la
 * ceinture qu'on lui passe — et s'arrêter quand on l'annule (`signal`).
 *
 * ⚠️ À n'appeler que depuis une chaîne de GESTE utilisateur (le choix de
 * fichier) : `video.play()` et `AudioContext.resume()` l'exigent.
 */

import { sniffMp4VideoCodecs } from "./video-upload-codecs"
import type { VideoUploadProbe } from "./video-upload-policy"

/**
 * Les codecs vidéo d'un FICHIER mp4, par tranches (`File.slice`) — le `moov`
 * vit souvent en fin de fichier, et le lire ainsi coûte quelques kilooctets,
 * jamais le fichier entier. `null` = illisible, fail-open (cf. la doctrine du
 * sniffeur) : la politique laisse alors partir tel quel, comme avant.
 */
export function sniffFileMp4VideoCodecs(
	file: Blob,
): Promise<readonly string[] | null> {
	return sniffMp4VideoCodecs(
		(offset, length) => file.slice(offset, offset + length).arrayBuffer(),
		file.size,
	)
}

/** Grand côté maximal du rendu converti — au-delà, l'encodage temps réel rame. */
const TRANSCODE_MAX_EDGE_PX = 1_280

/** L'échec d'une conversion ANNULÉE — un code interne, jamais affiché. */
export const TRANSCODE_ABORTED = "transcode:aborted"

/** Cette erreur dit-elle qu'on a annulé la conversion (et non qu'elle a échoué) ? */
export function isTranscodeAborted(error: unknown): boolean {
	return error instanceof Error && error.message === TRANSCODE_ABORTED
}

/** Ce que la politique a calculé pour cette vidéo-ci (cf. `videoUploadPlan`). */
export interface TranscodeOptions {
	/** Le conteneur cible, tel que `MediaRecorder.isTypeSupported` l'accepte. */
	targetMime: string
	/** Le débit vidéo qui fait tenir le résultat dans le budget d'octets. */
	videoBitsPerSecond: number
	/** La ceinture : au-delà, on arrête, même si la source continue. */
	hardStopMs: number
	/** L'annulation par la personne : on s'arrête, on libère tout, on rejette. */
	signal?: AbortSignal
}

function releaseVideo(node: HTMLVideoElement): void {
	try {
		node.pause()
		node.removeAttribute("src")
		node.load()
	} catch {
		// Rien à faire d'un échec de nettoyage.
	}
}

/**
 * Sonde un fichier vidéo (par son objectURL) : décodable ICI ? quelle durée ?
 *
 * `timeout` = fail-open `durationMs: null` — un conteneur exotique qui ne
 * répond pas n'est pas forcément mort, et c'est la politique qui tranche.
 */
export function probeVideoFile(
	objectUrl: string,
	timeoutMs = 8_000,
): Promise<VideoUploadProbe> {
	return new Promise((resolve) => {
		const node = document.createElement("video")
		node.preload = "metadata"
		node.muted = true

		let settled = false
		const settle = (probe: VideoUploadProbe) => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			releaseVideo(node)
			resolve(probe)
		}

		const timer = setTimeout(
			() => settle({ decodable: true, durationMs: null }),
			timeoutMs,
		)

		node.addEventListener("loadedmetadata", () => {
			const seconds = node.duration
			settle({
				decodable: true,
				durationMs:
					Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : null,
			})
		})
		node.addEventListener("error", () =>
			settle({ decodable: false, durationMs: null }),
		)

		node.src = objectUrl
	})
}

export interface TranscodeResult {
	blob: Blob
	/** Le conteneur NU du blob — c'est lui qui part en Content-Type. */
	mimeType: string
	/** La durée RÉELLEMENT enregistrée, mesurée sur la source. */
	durationMs: number
}

/** `video/webm;codecs=vp9` → `video/webm` — le serveur ne connaît que le nu. */
function baseMime(mimeType: string): string {
	const semicolon = mimeType.indexOf(";")
	return (semicolon >= 0 ? mimeType.slice(0, semicolon) : mimeType).trim()
}

/**
 * Convertit la vidéo de l'objectURL vers la cible du plan. Rejette sur tout
 * échec — l'appelant refuse alors le fichier avec la phrase de la politique —,
 * et par `TRANSCODE_ABORTED` quand `signal` est annulé.
 */
export async function transcodeVideo(
	objectUrl: string,
	options: TranscodeOptions,
	onProgress?: (fraction: number) => void,
): Promise<TranscodeResult> {
	const { targetMime, videoBitsPerSecond, hardStopMs, signal } = options
	if (signal?.aborted) throw new Error(TRANSCODE_ABORTED)
	const source = document.createElement("video")
	source.playsInline = true
	// PAS de `muted` : l'audio doit exister pour être capturé. Le graphe
	// WebAudio le confisque du haut-parleur (aucun nœud vers `destination`).
	source.src = objectUrl

	await new Promise<void>((resolve, reject) => {
		const onAbort = () => {
			releaseVideo(source)
			reject(new Error(TRANSCODE_ABORTED))
		}
		signal?.addEventListener("abort", onAbort, { once: true })
		source.addEventListener(
			"loadedmetadata",
			() => {
				signal?.removeEventListener("abort", onAbort)
				resolve()
			},
			{ once: true },
		)
		source.addEventListener(
			"error",
			() => {
				signal?.removeEventListener("abort", onAbort)
				reject(new Error("transcode:metadata"))
			},
			{ once: true },
		)
	})

	const scale = Math.min(
		1,
		TRANSCODE_MAX_EDGE_PX / Math.max(source.videoWidth, source.videoHeight, 1),
	)
	const canvas = document.createElement("canvas")
	canvas.width = Math.max(2, Math.round(source.videoWidth * scale))
	canvas.height = Math.max(2, Math.round(source.videoHeight * scale))
	const context = canvas.getContext("2d")
	if (context === null) {
		releaseVideo(source)
		throw new Error("transcode:canvas")
	}

	const audioContext = new AudioContext()
	const audioSource = audioContext.createMediaElementSource(source)
	const audioSink = audioContext.createMediaStreamDestination()
	audioSource.connect(audioSink)
	await audioContext.resume()

	const canvasStream = canvas.captureStream(30)
	const stream = new MediaStream([
		...canvasStream.getVideoTracks(),
		...audioSink.stream.getAudioTracks(),
	])

	const recorder = new MediaRecorder(stream, {
		mimeType: targetMime,
		videoBitsPerSecond,
	})
	const chunks: BlobPart[] = []
	recorder.addEventListener("dataavailable", (event) => {
		if (event.data.size > 0) chunks.push(event.data)
	})

	const cleanup = () => {
		for (const track of stream.getTracks()) track.stop()
		void audioContext.close().catch(() => {})
		releaseVideo(source)
	}

	return await new Promise<TranscodeResult>((resolve, reject) => {
		let frame = 0
		let stopped = false
		let cancelled = false
		let settled = false
		let recordedMs = 0

		/** Une seule issue, quel que soit l'ordre des évènements. */
		const settle = (outcome: () => void) => {
			if (settled) return
			settled = true
			signal?.removeEventListener("abort", onAbort)
			outcome()
		}
		const fail = (code: string) => {
			cleanup()
			settle(() => reject(new Error(cancelled ? TRANSCODE_ABORTED : code)))
		}

		const stop = () => {
			if (stopped) return
			stopped = true
			cancelAnimationFrame(frame)
			recordedMs = Math.round(source.currentTime * 1_000)
			try {
				recorder.stop()
			} catch {
				fail("transcode:stop")
			}
		}

		// L'annulation passe par l'arrêt ordinaire : l'enregistreur s'arrête,
		// les pistes sont coupées, et l'issue est un rejet nommé.
		function onAbort() {
			cancelled = true
			if (stopped) {
				fail(TRANSCODE_ABORTED)
				return
			}
			stop()
		}
		signal?.addEventListener("abort", onAbort, { once: true })

		const draw = () => {
			if (stopped) return
			context.drawImage(source, 0, 0, canvas.width, canvas.height)
			const elapsedMs = source.currentTime * 1_000
			if (onProgress) {
				const total = Number.isFinite(source.duration)
					? source.duration * 1_000
					: hardStopMs
				onProgress(Math.min(1, total > 0 ? elapsedMs / total : 0))
			}
			// La CEINTURE : une source à la durée illisible ne convertit jamais
			// plus que ce que la politique a autorisé — le serveur refuserait
			// au-delà, et l'attente n'aurait plus de fin annoncée.
			if (elapsedMs >= hardStopMs) {
				stop()
				return
			}
			frame = requestAnimationFrame(draw)
		}

		recorder.addEventListener("stop", () => {
			cleanup()
			if (cancelled) {
				settle(() => reject(new Error(TRANSCODE_ABORTED)))
				return
			}
			if (chunks.length === 0) {
				settle(() => reject(new Error("transcode:empty")))
				return
			}
			settle(() =>
				resolve({
					blob: new Blob(chunks, { type: baseMime(recorder.mimeType || targetMime) }),
					mimeType: baseMime(recorder.mimeType || targetMime),
					durationMs: recordedMs,
				}),
			)
		})
		recorder.addEventListener("error", () => fail("transcode:recorder"))
		source.addEventListener("ended", stop, { once: true })
		source.addEventListener("error", () => fail("transcode:source"), {
			once: true,
		})

		if (signal?.aborted) {
			cancelled = true
			fail(TRANSCODE_ABORTED)
			return
		}
		source.currentTime = 0
		recorder.start(250)
		frame = requestAnimationFrame(draw)
		source.play().catch(() => fail("transcode:autoplay"))
	})
}
