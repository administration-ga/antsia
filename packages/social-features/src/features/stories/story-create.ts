// Dupliqué de socle/packages/agent-features/src/features/stories/story-create.ts @ ad2e7fdc2 — adaptations : destinations `reseau`/`icom` (ADR-0079 du socle) retirées avec le moteur, qui n'a qu'une surface et une seule borne vidéo (la plus stricte du socle) — cases et libellés « iRéseau » / « iCom (Statuts) », invite croisée, origine du composeur, refus et indices par surface supprimés ; bornes lues dans `@antsia/social-domain/stories` et `/content` ; phrases de refus et unités (Mo, minutes, secondes) traduites par i18n (`t` en dernier paramètre, clés `stories:storyCreate.*`) au lieu des libellés du domaine du socle ; texte des refus du moteur par leur code (`storyEngineErrorText` : espaces `rules` et `errors`).
/**
 * story-create — ce qu'on ACCEPTE de publier en story, et quand le bouton
 * « Publier » s'allume.
 *
 * Le socle testait ses surfaces en environnement `node`, SANS
 * testing-library : ce qui reste dans le corps d'un composant n'y était
 * vérifiable qu'à l'œil. Le refus opposé à un fichier, la longueur de la
 * légende et la condition de publication vivent donc ici ; `StoryCreateSheet`
 * ne fait que les rendre.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * UN MIROIR ALLÉGÉ, JAMAIS UNE SECONDE GARDE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Même doctrine que `rejectionFor` (`reseau-personnel/useMediaDraft.ts`) : ces
 * vérifications évitent un téléversement perdu, elles ne REMPLACENT pas celles
 * du serveur, qui relit les métadonnées RÉELLES du stockage
 * (`verifyDeclaredMedia` puis `assertStoryMedia`). Les bornes sont importées du
 * domaine, jamais recopiées ; les phrases de refus vivent dans les locales de
 * l'écran (le domaine du moteur ne parle pas : il lève un code de règle).
 *
 * ⚠️ Une story n'est PAS une publication à un média près. Trois écarts, tous
 * dans le domaine serveur : un seul média (jamais quatre), une légende de 200
 * caractères (jamais 2 000), et sa propre borne vidéo. C'est pourquoi ce
 * module ne réutilise pas `rejectionFor` telle quelle — elle compte des
 * médias existants et applique les plafonds du fil.
 *
 * ⚠️ Le socle bornait la vidéo PAR DESTINATION (le fil ou les Statuts d'iCom,
 * ADR-0079). Le moteur n'a qu'une surface — la même story vit sur la barre du
 * fil et dans les Actus d'iCom — et retient la borne la plus stricte : un seul
 * jeu de bornes, `STORY_VIDEO_LIMITS`, partout.
 */

import type { TFunction } from "i18next"

import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { POST_IMAGE_MIME_TYPES } from "@antsia/social-domain/content"
import {
	STORY_CAPTION_MAX_LENGTH,
	STORY_IMAGE_MAX_BYTES,
	STORY_VIDEO_LIMITS,
} from "@antsia/social-domain/stories"

/**
 * Ce que le sélecteur de fichiers ACCEPTE.
 *
 * ⚠️ Volontairement LARGE (`image/*,video/*`) là où le composeur du fil liste
 * les types un à un. La raison est l'entrée CAMÉRA : sur iOS comme sur
 * Android, un `accept` restreint à une liste de types désactive la capture
 * directe dans une partie des navigateurs — on obtient un sélecteur de
 * fichiers là où l'on voulait l'appareil photo. Le tri se fait donc APRÈS, par
 * `storyDraftFrom`, qui refuse ce que le domaine refuse.
 */
export const STORY_ACCEPT = "image/*,video/*"

/** Le média d'une story, une fois accepté. */
export type StoryMediaKind = "image" | "video"

/**
 * Ce dont ce module a besoin d'un fichier. `File` du navigateur le satisfait ;
 * l'environnement `node` des tests n'en a pas, et n'en a pas besoin.
 */
export interface StoryFileLike {
	name: string
	type: string
	size: number
}

/** Accepté (`kind`), ou refusé avec la phrase à montrer (`error`). */
export type StoryDraft = { kind: StoryMediaKind } | { error: string }

/** Le brouillon est-il publiable ? Rétrécit le type au passage. */
export function isStoryDraftReady(
	draft: StoryDraft | null,
): draft is { kind: StoryMediaKind } {
	return draft !== null && "kind" in draft
}

/** « 50 Mo » — les bornes sont des multiples exacts du mébioctet. */
export function storyBytesLabel(bytes: number, t: TFunction): string {
	return t("stories:storyCreate.units.megabytes", {
		value: Math.round(bytes / (1024 * 1024)),
	})
}

/** « 5 minutes », « 1 minute », « 45 secondes ». */
export function storyDurationLabel(ms: number, t: TFunction): string {
	if (ms >= 60_000 && ms % 60_000 === 0) {
		return t("stories:storyCreate.units.minutes", { count: ms / 60_000 })
	}
	return t("stories:storyCreate.units.seconds", {
		count: Math.round(ms / 1_000),
	})
}

/**
 * Le brouillon tiré d'un fichier — ou le refus, dit dans la langue de l'écran.
 *
 * L'ordre des contrôles suit celui du serveur (`assertStoryMedia`) : le TYPE
 * d'abord, le POIDS ensuite. L'inverse dirait « trop lourde » d'un fichier
 * qu'on n'aurait de toute façon pas accepté, et enverrait la personne
 * compresser pour rien.
 *
 * ⚠️ Les VIDÉOS acceptent ici N'IMPORTE QUEL conteneur (`video/*`) — plus
 * large que la liste serveur (`STORY_VIDEO_MIME_TYPES` : MP4/WebM), et c'est
 * voulu : le composeur SONDE puis CONVERTIT les autres conteneurs (.mov
 * d'iPhone en tête) vers MP4/WebM avant le téléversement (« on doit pouvoir
 * tout lire »). C'est `videoUploadPlan` (`features/video-upload`) qui refuse ce
 * qui ne se convertit pas.
 */
export function storyDraftFrom(file: StoryFileLike, t: TFunction): StoryDraft {
	const isImage = (POST_IMAGE_MIME_TYPES as readonly string[]).includes(
		file.type,
	)
	const isVideo = !isImage && file.type.startsWith("video/")

	if (!isImage && !isVideo) {
		return {
			error: t("stories:storyCreate.refusal.notMedia", { name: file.name }),
		}
	}
	if (file.size <= 0) {
		return { error: t("stories:storyCreate.refusal.empty", { name: file.name }) }
	}

	if (isImage) {
		return file.size > STORY_IMAGE_MAX_BYTES
			? {
					error: t("stories:storyCreate.refusal.imageTooLarge", {
						name: file.name,
						size: storyBytesLabel(STORY_IMAGE_MAX_BYTES, t),
					}),
				}
			: { kind: "image" }
	}
	if (file.size > STORY_VIDEO_LIMITS.maxBytes) {
		return {
			error: t("stories:storyCreate.refusal.videoTooLarge", {
				name: file.name,
				size: storyBytesLabel(STORY_VIDEO_LIMITS.maxBytes, t),
			}),
		}
	}
	return { kind: "video" }
}

/** Ce que la légende a de dicible à l'écran. */
export interface StoryCaptionState {
	/** Négatif quand la borne est dépassée — le compteur doit le MONTRER. */
	remaining: number
	tooLong: boolean
}

/**
 * L'état de la légende. Le décompte descend sous zéro plutôt que de se figer :
 * « −18 » dit combien retirer, « 0 » ne dit rien.
 */
export function evaluateStoryCaption(caption: string): StoryCaptionState {
	const length = caption.trim().length
	return {
		remaining: STORY_CAPTION_MAX_LENGTH - length,
		tooLong: length > STORY_CAPTION_MAX_LENGTH,
	}
}

/** L'audience d'une story — la même que celle d'une publication du fil. */
export type StoryAudience = "public" | "connections"

export interface CanPublishOptions {
	caption?: string
	/** Un envoi déjà en cours : le bouton reste éteint jusqu'à la réponse. */
	submitting?: boolean
}

/**
 * Le bouton « Publier » s'allume-t-il ?
 *
 * Un média ACCEPTÉ et une audience CHOISIE, rien d'autre. Le média est
 * obligatoire, et c'est la différence avec le composeur du fil, qui publie du
 * texte seul : une story SANS son média n'est rien — le serveur va jusqu'à
 * omettre du plateau une story dont le média n'est pas servable (cf. `storyDto`).
 */
export function canPublishStory(
	draft: StoryDraft | null,
	audience: StoryAudience | null,
	options: CanPublishOptions = {},
): boolean {
	if (options.submitting === true) return false
	if (!isStoryDraftReady(draft)) return false
	if (audience === null) return false
	if (
		options.caption !== undefined &&
		evaluateStoryCaption(options.caption).tooLong
	) {
		return false
	}
	return true
}

/**
 * Le texte d'un refus du MOTEUR, traduit — pour la publication comme pour le
 * retrait d'une story : la règle du domaine enfreinte (espace `rules`, avec
 * ses bornes en paramètres), sinon le code du moteur (espace `errors`), sinon
 * la phrase générique de l'écran (`fallbackKey`, clé qualifiée). Jamais le
 * texte brut du serveur.
 */
export function storyEngineErrorText(
	error: unknown,
	fallbackKey: string,
	t: TFunction,
): string {
	const rule = engineErrorRule(error)
	if (rule !== null) return t(`rules:${rule.rule}`, rule.params)
	const code = engineErrorCode(error)
	if (code !== null) return t(`errors:${code}`)
	return t(fallbackKey)
}

/**
 * La POSE du composeur : plein écran né MOBILE (le clavier prend la moitié de
 * la hauteur, seule la surface immersive suit `--kb-inset`), carte flottante
 * COMPACTE au bureau (un formulaire étiré sur 1600 px n'est pas une carte).
 *
 * `null` (rendu serveur / premier passage client) = plein écran : se tromper
 * vers la carte ferait clignoter deux géométries au chargement du téléphone —
 * l'inverse ne coûte qu'un scrim tardif au bureau.
 */
export function storyComposePose(
	isMobile: boolean | null,
): "fullscreen" | "card" {
	return isMobile === false ? "card" : "fullscreen"
}
