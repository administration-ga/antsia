/**
 * video-preparation — préparer une vidéo avant l'envoi (lot SD-03) : la sonder,
 * décider (`videoUploadPlan`), la convertir au besoin, et rendre le fichier qui
 * partira — toujours un MP4 ou un WebM — avec sa durée mesurée.
 *
 * C'est l'enchaînement que le composeur de Story faisait en ligne, sorti ici
 * pour servir le composeur de publication (et, demain, la création d'un Clip,
 * SD-14). Il ne décide rien : la politique décide, la sonde exécute. Ce module
 * ne touche pas le DOM lui-même : ses capacités arrivent par un ENVIRONNEMENT
 * injectable (`VideoRuntime`), celui du navigateur par défaut — jsdom n'a ni
 * décodeur vidéo ni `MediaRecorder`, les tests en simulent un.
 *
 * Trois issues, jamais une exception :
 *   - `ready`     — le fichier à envoyer (l'original, ou le converti) et sa
 *                   durée, que le serveur bornera (une durée DÉCLARÉE) ;
 *   - `refused`   — la phrase à montrer, dans la langue de l'écran, qui dit
 *                   quoi faire ;
 *   - `cancelled` — la personne a annulé : rien n'est retenu, rien n'est dit.
 *
 * ⚠️ Le poids du converti n'est PAS jugé ici : `MediaRecorder` vise un débit
 * sans le tenir à l'octet, et c'est la règle de l'appelant (celle de son
 * brouillon) qui pèse le fichier rendu, comme elle pèse un fichier choisi.
 */

import type { TFunction } from "i18next"

import {
	isTranscodeAborted,
	probeVideoFile,
	sniffFileMp4VideoCodecs,
	transcodeVideo,
	type TranscodeOptions,
	type TranscodeResult,
} from "./video-upload-probe"
import {
	VIDEO_TRANSCODE_TARGETS,
	videoUploadPlan,
	type VideoUploadLimits,
	type VideoUploadProbe,
} from "./video-upload-policy"

/** Ce dont la préparation a besoin du navigateur — injecté pour être testé. */
export interface VideoRuntime {
	createObjectUrl: (file: Blob) => string
	revokeObjectUrl: (url: string) => void
	probe: (objectUrl: string) => Promise<VideoUploadProbe>
	sniffMp4Codecs: (file: Blob) => Promise<readonly string[] | null>
	/** Le sous-ensemble de `VIDEO_TRANSCODE_TARGETS` que CE navigateur sait produire. */
	recorderTargets: () => readonly string[]
	transcode: (
		objectUrl: string,
		options: TranscodeOptions,
		onProgress?: (fraction: number) => void,
	) => Promise<TranscodeResult>
}

/** L'environnement réel : objectURL, élément <video>, `MediaRecorder`. */
export const browserVideoRuntime: VideoRuntime = {
	createObjectUrl: (file) => URL.createObjectURL(file),
	revokeObjectUrl: (url) => URL.revokeObjectURL(url),
	probe: (objectUrl) => probeVideoFile(objectUrl),
	sniffMp4Codecs: sniffFileMp4VideoCodecs,
	recorderTargets: () =>
		VIDEO_TRANSCODE_TARGETS.filter(
			(target) =>
				typeof MediaRecorder !== "undefined" &&
				MediaRecorder.isTypeSupported(target),
		),
	transcode: transcodeVideo,
}

/** Où en est la préparation — ce que l'écran annonce. */
export type VideoPreparationPhase =
	| { phase: "probing" }
	| { phase: "converting"; progress: number }

export type VideoPreparation =
	| {
			status: "ready"
			/** Le fichier qui part : l'original MP4/WebM, ou le converti. */
			file: File
			/** La durée mesurée (sonde ou conversion) ; absente si non mesurable. */
			durationMs: number | undefined
			converted: boolean
	  }
	| { status: "refused"; message: string }
	| { status: "cancelled" }

export interface PrepareVideoOptions {
	/** Les bornes de la surface : une Story ou une publication. */
	limits: VideoUploadLimits
	t: TFunction
	onPhase?: (phase: VideoPreparationPhase) => void
	/** L'annulation par la personne (bouton « Annuler la conversion », départ de l'écran). */
	signal?: AbortSignal
}

export type PrepareVideo = (
	file: File,
	options: PrepareVideoOptions,
) => Promise<VideoPreparation>

/** Le conteneur nu, sans paramètres de codec. */
function baseMime(mimeType: string): string {
	const semicolon = mimeType.indexOf(";")
	return (semicolon >= 0 ? mimeType.slice(0, semicolon) : mimeType).trim().toLowerCase()
}

/**
 * Le nom du converti : celui de l'original, avec l'extension de son nouveau
 * conteneur (`IMG_0412.MOV` → `IMG_0412.mp4`) — c'est ce nom que l'écran montre.
 */
export function convertedVideoName(original: string, mimeType: string): string {
	const extension = baseMime(mimeType) === "video/mp4" ? "mp4" : "webm"
	const dot = original.lastIndexOf(".")
	const stem = (dot > 0 ? original.slice(0, dot) : original).trim()
	return `${stem.length > 0 ? stem : "video"}.${extension}`
}

const CANCELLED: VideoPreparation = { status: "cancelled" }

/**
 * Prépare une vidéo choisie. Ne lève jamais : un échec de conversion devient
 * un refus dit (`conversionFailed`), une annulation devient `cancelled`.
 */
export async function prepareVideoForUpload(
	file: File,
	options: PrepareVideoOptions,
	runtime: VideoRuntime = browserVideoRuntime,
): Promise<VideoPreparation> {
	const { limits, t, onPhase, signal } = options
	if (signal?.aborted) return CANCELLED
	const sourceUrl = runtime.createObjectUrl(file)
	try {
		onPhase?.({ phase: "probing" })
		const probe = await runtime.probe(sourceUrl)
		if (signal?.aborted) return CANCELLED
		// Un MP4 se regarde SOUS le conteneur : l'iPhone « Haute efficacité »
		// y range du HEVC, décodable ici (matériel Apple) et illisible chez
		// la moitié des membres. Le sniff lit quelques kilooctets.
		const containerCodecs =
			baseMime(file.type) === "video/mp4" ? await runtime.sniffMp4Codecs(file) : null
		if (signal?.aborted) return CANCELLED
		const plan = videoUploadPlan(
			{
				fileName: file.name,
				mimeType: file.type,
				probe,
				containerCodecs,
				recorderTargets: runtime.recorderTargets(),
				limits,
			},
			t,
		)
		if (plan.action === "refuse") return { status: "refused", message: plan.error }
		if (plan.action === "upload") {
			return { status: "ready", file, durationMs: plan.durationMs, converted: false }
		}
		onPhase?.({ phase: "converting", progress: 0 })
		const result = await runtime.transcode(
			sourceUrl,
			{
				targetMime: plan.targetMime,
				videoBitsPerSecond: plan.videoBitsPerSecond,
				hardStopMs: plan.hardStopMs,
				...(signal ? { signal } : {}),
			},
			(fraction) => {
				if (!signal?.aborted) onPhase?.({ phase: "converting", progress: fraction })
			},
		)
		if (signal?.aborted) return CANCELLED
		const converted = new File(
			[result.blob],
			convertedVideoName(file.name, result.mimeType),
			{ type: result.mimeType },
		)
		// La durée ENREGISTRÉE fait foi (la ceinture a pu couper) ; sinon celle de la sonde.
		const durationMs = result.durationMs > 0 ? result.durationMs : plan.durationMs
		return { status: "ready", file: converted, durationMs, converted: true }
	} catch (error) {
		if (signal?.aborted || isTranscodeAborted(error)) return CANCELLED
		return { status: "refused", message: t("reseau:videoPreparation.conversionFailed") }
	} finally {
		runtime.revokeObjectUrl(sourceUrl)
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// La durée qui VOYAGE avec le fichier jusqu'à la déclaration
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Le registre est global (`Symbol.for`) pour la même raison que celui des
 * images préparées : deux copies du paquet dans un bundle doivent se voir.
 * `WeakMap` : un fichier abandonné n'est pas retenu en mémoire.
 */
const DURATION_REGISTRY = Symbol.for("@antsia/social-features/video-upload/measured-durations")

function durationRegistry(): WeakMap<Blob, number> {
	const holder = globalThis as typeof globalThis & { [DURATION_REGISTRY]?: WeakMap<Blob, number> }
	holder[DURATION_REGISTRY] ??= new WeakMap<Blob, number>()
	return holder[DURATION_REGISTRY]
}

/**
 * Attache au fichier préparé la durée mesurée : le brouillon de médias la
 * relit (`measuredVideoDuration`) et la déclare au serveur avec le média.
 * Une durée non mesurable (absente, non finie, négative) n'est pas retenue.
 */
export function rememberVideoDuration(file: Blob, durationMs: number | undefined): void {
	if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs < 0) return
	durationRegistry().set(file, Math.round(durationMs))
}

/** La durée mesurée d'un fichier préparé, ou `undefined`. */
export function measuredVideoDuration(file: Blob): number | undefined {
	return durationRegistry().get(file)
}
