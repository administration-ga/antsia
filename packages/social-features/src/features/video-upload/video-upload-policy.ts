// Dupliqué de socle/packages/agent-features/src/features/stories/story-video-policy.ts @ ad2e7fdc2 — adaptations : destinations `reseau`/`icom` (ADR-0079 du socle) retirées avec le moteur, paramètre `surfaces` supprimé ; refus traduits par i18n (`t` en dernier paramètre) au lieu des phrases du domaine du socle ; SD-03 : module renommé `video-upload-policy` et sorti des Stories (`features/video-upload`) pour servir aussi le composeur de publication — les BORNES deviennent un paramètre (`limits` : `STORY_VIDEO_UPLOAD_LIMITS` ou `POST_VIDEO_UPLOAD_LIMITS`, lues dans le domaine), identifiants neutres (`videoUploadPlan`, `VideoUploadProbe`, `VIDEO_TRANSCODE_*`), refus lus dans `reseau:videoPreparation.refusal.*` et durées dites par `videoDurationLabel`.
/**
 * video-upload-policy — ce qu'on FAIT d'une vidéo choisie pour une Story ou
 * pour une publication.
 *
 * Le contrat produit (2026-08-20) : « on doit pouvoir tout lire ». Une vidéo
 * publiée doit se jouer chez TOUS les membres — Chrome, Firefox, Safari,
 * Windows, Android. Or les téléphones livrent des conteneurs que la moitié
 * des navigateurs ne décodent pas (.mov d'iPhone en tête). La réponse n'est
 * pas de refuser (frustrant) ni d'accepter (invisible chez les autres) :
 * c'est de CONVERTIR côté composeur, vers MP4 ou WebM — la liste que le
 * serveur garantit (`STORY_VIDEO_MIME_TYPES`, `POST_VIDEO_UPLOAD_MIME_TYPES`
 * depuis le lot SD-03, domaine).
 *
 * Ce module DÉCIDE (pur, testé) ; `video-upload-probe.ts` exécute (DOM) et
 * `video-preparation.ts` enchaîne les deux. Trois issues :
 *   - `upload`    — le fichier est déjà MP4/WebM décodable : tel quel ;
 *   - `transcode` — autre conteneur, mais CE navigateur sait le décoder :
 *     conversion locale vers la première cible que `MediaRecorder` sait
 *     produire ici, à un débit calculé pour tenir dans le budget d'octets ;
 *   - `refuse`    — indécodable ici (on ne convertit pas ce qu'on ne sait pas
 *     lire), trop long, trop long À CONVERTIR, ou aucun encodeur disponible.
 *     Message dans la langue de l'écran, qui nomme la borne et dit quoi faire.
 *
 * ⚠️ La sonde est PAR NAVIGATEUR : un Safari décode le .mov et le convertit ;
 * un Chrome ne le décode pas et le refuse en guidant. La liste SERVEUR reste
 * l'arbitre final : rien d'illisible n'entre, quel que soit le client.
 *
 * ⚠️ Les BORNES sont celles du domaine du moteur, passées par l'appelant
 * (`limits`) : une Story (`STORY_VIDEO_LIMITS` — cinq minutes, cinquante
 * mégaoctets) ou une publication (`POST_VIDEO_MAX_BYTES`,
 * `POST_VIDEO_MAX_DURATION_MS` — soixante mégaoctets, cinq minutes). Elles
 * sont importées, jamais recopiées ; le serveur lève `STORY_VIDEO_TOO_LONG`
 * ou `POST_VIDEO_TOO_LONG` sur la même borne de durée — une durée DÉCLARÉE :
 * le stockage ne la connaît pas.
 *
 * Aucun import DOM : les capacités (`recorderTargets`) sont INJECTÉES —
 * `MediaRecorder.isTypeSupported` n'existe pas en environnement node.
 */

import type { TFunction } from "i18next"

import { POST_VIDEO_MAX_BYTES, POST_VIDEO_MAX_DURATION_MS } from "@antsia/social-domain/content"
import { STORY_VIDEO_LIMITS } from "@antsia/social-domain/stories"

/** Les deux bornes d'une vidéo, sur un axe chacune — celles du domaine. */
export interface VideoUploadLimits {
	maxBytes: number
	maxDurationMs: number
}

/** Une Story : cinquante mégaoctets, cinq minutes (`STORY_VIDEO_LIMITS`). */
export const STORY_VIDEO_UPLOAD_LIMITS: VideoUploadLimits = STORY_VIDEO_LIMITS

/**
 * Une publication (lot SD-03) : soixante mégaoctets (décision du propriétaire
 * du 9/11/2026, lot EX-17) et cinq minutes (la borne des Stories, à valider
 * par le propriétaire).
 */
export const POST_VIDEO_UPLOAD_LIMITS: VideoUploadLimits = {
	maxBytes: POST_VIDEO_MAX_BYTES,
	maxDurationMs: POST_VIDEO_MAX_DURATION_MS,
}

/**
 * Ce que le sélecteur de fichiers propose pour une vidéo : TOUT conteneur. Le
 * tri se fait APRÈS, par la sonde et `videoUploadPlan` — restreindre ici à
 * MP4/WebM cacherait justement le .mov que l'on sait convertir.
 */
export const VIDEO_UPLOAD_ACCEPT = "video/*"

/** Un fichier se présente-t-il comme une vidéo, quel qu'en soit le conteneur ? */
export function isVideoCandidateType(mimeType: string): boolean {
	return baseMime(mimeType).toLowerCase().startsWith("video/")
}

/** Ce que la sonde a appris du fichier (cf. `probeVideoFile`). */
export interface VideoUploadProbe {
	/** `false` = l'élément <video> a émis `error` sur l'objectURL. */
	decodable: boolean
	/** `loadedmetadata` → durée en ms ; `null` si non mesurable (Infinity, timeout). */
	durationMs: number | null
}

/**
 * Les cibles de conversion, par ordre de PRÉFÉRENCE. MP4 d'abord (Safari
 * enregistre en H.264/AAC, le plus universel), puis WebM VP9, puis WebM tout
 * court. L'appelant les filtre par `MediaRecorder.isTypeSupported`.
 */
export const VIDEO_TRANSCODE_TARGETS = [
	"video/mp4",
	"video/webm;codecs=vp9",
	"video/webm",
] as const

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA CONVERSION SE PAIE EN TEMPS RÉEL — d'où un budget PROPRE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `transcodeVideo` JOUE la source et enregistre ce qui défile : convertir cinq
 * minutes prend cinq minutes, onglet visible (une fenêtre masquée suspend
 * `requestAnimationFrame` et fige l'image sans rien dire). Tant qu'une vidéo
 * durait trente secondes, la borne produit suffisait de garde-fou ; à
 * plusieurs minutes, elle ne suffit plus.
 *
 * Trois minutes est donc la borne de la CONVERSION, et elle ne rétrécit pas
 * la vidéo : un MP4 ou un WebM part tel quel, sans conversion, jusqu'à la
 * borne produit complète. Seuls les autres conteneurs (.mov, .avi, .mkv…)
 * passent par ici — et au-delà de trois minutes, le refus dit quoi faire.
 */
export const VIDEO_TRANSCODE_MAX_DURATION_MS = 3 * 60 * 1000

/** L'audio du converti, à retrancher du budget avant d'en tirer la vidéo. */
const TRANSCODE_AUDIO_BPS = 128_000

/** Le débit vidéo le plus haut qu'on demande : un écran de téléphone plein. */
const TRANSCODE_VIDEO_BPS_CEILING = 2_500_000

/** Le plancher : en dessous, l'image ne vaut plus la peine d'être publiée. */
const TRANSCODE_VIDEO_BPS_FLOOR = 400_000

/**
 * La marge sous le budget : `MediaRecorder` vise un débit, il ne le tient pas
 * à l'octet (les scènes chargées dépassent). 15 % d'avance évitent qu'une
 * conversion réussie se fasse refuser au téléversement.
 */
const TRANSCODE_SIZE_SAFETY = 0.85

/** La marge au-delà de la borne : on n'arrête pas un flux à la milliseconde. */
const TRANSCODE_HARD_STOP_MARGIN_MS = 1_500

export type VideoUploadPlan =
	| { action: "upload"; durationMs: number | undefined }
	| {
			action: "transcode"
			targetMime: string
			durationMs: number | undefined
			/** Le débit à demander au `MediaRecorder` pour tenir le budget. */
			videoBitsPerSecond: number
			/** La ceinture : au-delà, la conversion s'arrête d'elle-même. */
			hardStopMs: number
	  }
	| { action: "refuse"; error: string }

/** Le conteneur nu, sans paramètres de codec — `video/webm;codecs=vp9` → `video/webm`. */
function baseMime(mimeType: string): string {
	const semicolon = mimeType.indexOf(";")
	return (semicolon >= 0 ? mimeType.slice(0, semicolon) : mimeType).trim()
}

/** Les conteneurs qui partent TELS QUELS — le miroir de la liste serveur. */
const DIRECT_UPLOAD_MIMES: readonly string[] = ["video/mp4", "video/webm"]

/** Ce conteneur part-il tel quel (MP4, WebM), sans conversion de conteneur ? */
export function isDirectUploadVideoType(mimeType: string): boolean {
	return DIRECT_UPLOAD_MIMES.includes(baseMime(mimeType))
}

/** « 5 minutes », « 1 minute », « 45 secondes » — dans la langue de l'écran. */
export function videoDurationLabel(ms: number, t: TFunction): string {
	if (ms >= 60_000 && ms % 60_000 === 0) {
		return t("reseau:videoPreparation.units.minutes", { count: ms / 60_000 })
	}
	return t("reseau:videoPreparation.units.seconds", {
		count: Math.round(ms / 1_000),
	})
}

/**
 * Les codecs vidéo qu'un MP4 peut porter en restant lisible par TOUTE la
 * flotte — H.264 (`avc1`/`avc3`), et rien d'autre. Le HEVC des iPhone en
 * « Haute efficacité » (`hvc1`/`hev1`), l'AV1 (`av01`) et le VP9-en-MP4
 * (`vp09`) se décodent CHEZ L'AUTEUR (matériel Apple, Chrome récent) mais pas
 * chez Firefox ni la plupart des Chrome sous Windows : « décodable ici »,
 * l'unique test de la sonde, dit vrai et publie pourtant un écran noir pour
 * la moitié du réseau.
 */
export const MP4_UNIVERSAL_VIDEO_CODECS: readonly string[] = ["avc1", "avc3"]

/**
 * Ce MP4 doit-il passer par la CONVERSION malgré son conteneur accepté ?
 *
 * `null`/vide = codecs ILLISIBLES par le sniffeur (`video-upload-codecs.ts`) —
 * fail-open : le départ tel quel d'avant reste la règle, la sonde de décodage
 * et le serveur restent les gardes. Ce contrôle ne peut que RESSERRER vers la
 * conversion un fichier dont on a PROUVÉ le codec non universel, jamais
 * bloquer davantage.
 */
export function mp4CodecsRequireTranscode(
	codecs: readonly string[] | null | undefined,
): boolean {
	if (codecs == null || codecs.length === 0) return false
	return codecs.some((codec) => !MP4_UNIVERSAL_VIDEO_CODECS.includes(codec))
}

/**
 * Le débit vidéo qui fait tenir la conversion dans le budget d'octets.
 *
 * Une durée INCONNUE se calcule au PIRE cas (la borne de durée) : la ceinture
 * de `transcodeVideo` laisse aller jusque-là, et un débit calculé sur une
 * durée optimiste produirait un fichier refusé au téléversement — après avoir
 * fait attendre.
 */
export function transcodeVideoBitrate(input: {
	durationMs: number | null
	maxBytes: number
	maxDurationMs: number
}): number {
	const seconds =
		Math.max(
			1_000,
			input.durationMs !== null && input.durationMs > 0
				? input.durationMs
				: input.maxDurationMs,
		) / 1_000
	const budgetBps = (input.maxBytes * 8 * TRANSCODE_SIZE_SAFETY) / seconds
	const videoBps = budgetBps - TRANSCODE_AUDIO_BPS
	return Math.round(
		Math.min(
			TRANSCODE_VIDEO_BPS_CEILING,
			Math.max(TRANSCODE_VIDEO_BPS_FLOOR, videoBps),
		),
	)
}

export function videoUploadPlan(
	input: {
		fileName: string
		mimeType: string
		probe: VideoUploadProbe
		/** Sous-ensemble de `VIDEO_TRANSCODE_TARGETS` supporté par CE navigateur. */
		recorderTargets: readonly string[]
		/**
		 * Les fourcc des pistes vidéo du conteneur, lus par le sniffeur MP4
		 * (`sniffMp4VideoCodecs`) — `null`/absent = inconnus, fail-open : le
		 * conteneur accepté part tel quel. Ne concerne que `video/mp4` ; les
		 * autres conteneurs se décident au mime seul, comme avant.
		 */
		containerCodecs?: readonly string[] | null
		/** Les bornes de la surface : une Story ou une publication. */
		limits: VideoUploadLimits
	},
	t: TFunction,
): VideoUploadPlan {
	const { fileName, probe, limits } = input

	if (!probe.decodable) {
		return {
			action: "refuse",
			error: t("reseau:videoPreparation.refusal.notDecodable", { name: fileName }),
		}
	}

	// La durée se refuse AVANT tout téléversement ou conversion : le serveur
	// refuserait après des dizaines de mégaoctets envoyés, et convertir douze
	// minutes pour les jeter serait pire. Une durée non mesurable passe — la
	// conversion mesure la sienne, et la borne serveur reste l'arbitre.
	if (probe.durationMs !== null && probe.durationMs > limits.maxDurationMs) {
		return {
			action: "refuse",
			error: t("reseau:videoPreparation.refusal.tooLong", {
				name: fileName,
				duration: videoDurationLabel(limits.maxDurationMs, t),
			}),
		}
	}

	const durationMs =
		probe.durationMs === null ? undefined : Math.round(probe.durationMs)

	// Le conteneur accepté ne suffit pas : un MP4 peut porter du HEVC ou de
	// l'AV1, décodables chez l'auteur et illisibles chez la moitié de la
	// flotte. Codec universel prouvé, ou codecs inconnus (fail-open) → tel
	// quel ; codec non universel PROUVÉ → la conversion, comme un .mov.
	const container = baseMime(input.mimeType)
	if (
		DIRECT_UPLOAD_MIMES.includes(container) &&
		!(
			container === "video/mp4" &&
			mp4CodecsRequireTranscode(input.containerCodecs)
		)
	) {
		return { action: "upload", durationMs }
	}

	// À partir d'ici il FAUT convertir. Le budget de conversion est propre au
	// composeur : il ne dit rien de ce qu'une vidéo a le droit de durer, il dit
	// ce que le navigateur a le droit de faire attendre.
	if (
		probe.durationMs !== null &&
		probe.durationMs > VIDEO_TRANSCODE_MAX_DURATION_MS
	) {
		return {
			action: "refuse",
			error: t("reseau:videoPreparation.refusal.tooLongToConvert", {
				name: fileName,
				duration: videoDurationLabel(VIDEO_TRANSCODE_MAX_DURATION_MS, t),
			}),
		}
	}

	const targetMime = input.recorderTargets[0]
	if (targetMime === undefined) {
		return {
			action: "refuse",
			error: t("reseau:videoPreparation.refusal.noEncoder", { name: fileName }),
		}
	}
	// La ceinture ne laissera pas dépasser le budget de CONVERSION : le débit
	// se calcule sur cette durée-là, pas sur les cinq minutes que la vidéo
	// aurait le droit de durer en MP4.
	const convertibleMs = Math.min(limits.maxDurationMs, VIDEO_TRANSCODE_MAX_DURATION_MS)
	return {
		action: "transcode",
		targetMime,
		durationMs,
		videoBitsPerSecond: transcodeVideoBitrate({
			durationMs: probe.durationMs,
			maxBytes: limits.maxBytes,
			maxDurationMs: convertibleMs,
		}),
		hardStopMs: convertibleMs + TRANSCODE_HARD_STOP_MARGIN_MS,
	}
}
