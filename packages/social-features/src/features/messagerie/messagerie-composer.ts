// Dupliqué de socle/packages/agent-features/src/features/messagerie/messagerie-composer.ts @ ad2e7fdc2 — adaptations : bornes lues au contrat du moteur (`@antsia/social-contracts/attachments`, dérivé de la politique de dépôt `chat_attachment`) ; poids dit dans la langue courante (`formatBytes(bytes, locale, t)` : nombre par `Intl.NumberFormat`, unité par clé i18n) au lieu de la virgule et des unités françaises en dur ; refus par clés i18n qualifiées (`messagerie:messagerieComposer.*`), `locale` puis `t` en derniers paramètres de `attachmentRejection` ; PF-03 : `attachmentNeedsPhotoPreparation` (toute pièce image passe par la préparation des photos).
/**
 * messagerie-composer — ce que le COMPOSEUR décide.
 *
 * Module pur, testé en environnement `node`. Trois décisions vivent donc ici :
 *
 *  · quels fichiers le sélecteur propose (`MESSAGE_ATTACHMENT_ACCEPT`) ;
 *  · comment on rend une pièce (`attachmentKind`) ;
 *  · quand le bouton d'envoi s'allume (`canSend`) et quel bouton s'affiche
 *    (`composerMode`).
 *
 * ⚠️ La liste d'acceptation n'est PAS `ALLOWED_ATTACHMENT_MIME_TYPES` de
 * `lib/chat/use-chat-attachments`. Celle-là est une recopie, et une recopie
 * dérive ; un sélecteur qui ne propose pas `audio/*` ferait échouer le message
 * vocal par construction, et une photo prise depuis l'appareil (souvent
 * `image/heic` sur iPhone) aussi.
 *
 * ⚠️ **Les bornes sont celles du SERVEUR.** Le moteur plafonne à 25 Mo par
 * pièce et 5 pièces par message (`ATTACHMENT_MAX_BYTES`,
 * `ATTACHMENTS_MAX_PER_MESSAGE`). Une borne locale plus large laisserait passer
 * un fichier de 30 Mo : l'écran l'accepterait, l'afficherait en attente, le
 * téléverserait — et le serveur le refuserait à l'envoi, une fois la donnée
 * montée et le temps perdu. On importe donc les bornes du contrat que le
 * SERVEUR applique. Le hook ne sert plus qu'à l'état local (liste, retrait,
 * `consumeForUpload`).
 *
 * Deux imports — le contrat PUR qui énonce ces bornes, et le type de la
 * fonction de traduction des refus, reçue en dernier paramètre.
 */

import type { TFunction } from "i18next"
import {
	CHAT_ATTACHMENT_MIME_TYPES,
	ATTACHMENTS_MAX_PER_MESSAGE,
	ATTACHMENT_MAX_BYTES,
	isVoiceAttachment,
} from "@antsia/social-contracts/attachments"

/**
 * Les bornes du SERVEUR, ré-exportées pour que l'écran n'en connaisse pas
 * d'autres. Une constante recopiée dériverait le jour où le serveur bouge.
 */
export {
	ATTACHMENTS_MAX_PER_MESSAGE,
	ATTACHMENT_MAX_BYTES,
	isVoiceAttachment,
}

/**
 * Une pièce IMAGE passe par la préparation des photos avant d'entrer au
 * message (lot PF-03 ; décision du propriétaire du 9/11/2026) : ré-encodée,
 * 2 048 px au plus, sans métadonnées, HEIC/HEIF rendus en JPEG ; GIF et WebP
 * animés gardent leur animation, sans leurs métadonnées. TOUTE image : celles
 * que le module ne sait pas préparer (SVG, TIFF…) sont refusées par lui, avec
 * sa phrase, au lieu de partir brutes. Un échec refuse la pièce, jamais
 * l'original.
 */
export function attachmentNeedsPhotoPreparation(mimeType: string): boolean {
	return mimeType.trim().toLowerCase().startsWith("image/")
}

/**
 * Ce que le sélecteur de fichiers propose.
 *
 * Les familles LARGES (`image/*`, `video/*`, `audio/*`) plutôt qu'une liste de
 * mimes : un iPhone rend `image/heic`, un Android `image/webp`, et une liste
 * fermée grise dans le sélecteur des photos que l'utilisateur voit à l'écran —
 * le pire des refus, puisqu'il ne s'explique pas. Les documents, eux, restent
 * énumérés : `application/*` accepterait n'importe quel exécutable.
 */
export const MESSAGE_ATTACHMENT_ACCEPT = [
	"image/*",
	"video/*",
	"audio/*",
	// Les DOCUMENTS sont énumérés depuis la liste blanche du serveur
	// (`CHAT_ATTACHMENT_MIME_TYPES`, dérivée de l'usage de dépôt
	// `chat_attachment`) : ce que le sélecteur propose est ce que l'admission
	// accepte.
	".pdf",
	".doc",
	".docx",
	".xls",
	".xlsx",
	".ppt",
	".pptx",
	".txt",
	...CHAT_ATTACHMENT_MIME_TYPES.filter(
		(mime) => !/^(image|video|audio)\//.test(mime),
	),
].join(",")

/** Comment une pièce se REND — quatre rendus, pas un de plus. */
export type AttachmentKind = "image" | "video" | "audio" | "file"

/**
 * Le rendu d'une pièce, déduit de son mime.
 *
 * Le préfixe seul : `image/heic`, `image/png` et `image/svg+xml` se rendent
 * tous les trois dans une balise d'image, et énumérer les sous-types ferait
 * retomber en « fichier » le format que le prochain téléphone inventera.
 *
 * Un mime absent, vide ou inconnu rend `file` : c'est le rendu qui ne peut pas
 * échouer — un nom, une taille, un lien.
 */
export function attachmentKind(
	mimeType: string | null | undefined,
): AttachmentKind {
	if (typeof mimeType !== "string") return "file"
	const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? ""
	if (base.startsWith("image/")) return "image"
	if (base.startsWith("video/")) return "video"
	if (base.startsWith("audio/")) return "audio"
	return "file"
}

/**
 * Le bouton d'envoi est-il actif ?
 *
 * Un texte OU une pièce suffit — c'est ce qui rend possibles la photo sans
 * légende et le message vocal, et c'est exactement la règle que `sendMessage`
 * applique côté serveur (« contenu vide autorisé si au moins un fichier »).
 * Les deux doivent rester d'accord : un bouton allumé sur un envoi que le
 * serveur refuse est pire qu'un bouton éteint.
 *
 * ⚠️ Un téléversement EN COURS éteint le bouton. Sans cela, un second appui
 * envoie le message avec les pièces déjà montées et abandonne les autres —
 * silencieusement.
 */
export function canSend(args: {
	text: string
	attachmentCount: number
	uploading: boolean
}): boolean {
	if (args.uploading) return false
	const aDuTexte = args.text.trim().length > 0
	const aDesPieces =
		Number.isFinite(args.attachmentCount) && args.attachmentCount > 0
	return aDuTexte || aDesPieces
}

/**
 * Quel bouton occupe le coin du composeur.
 *
 * L'idiome de toutes les messageries : le MICRO tant que rien n'est écrit,
 * l'AVION dès qu'il y a quelque chose à envoyer. Un bouton d'envoi grisé en
 * permanence prend la place du micro et rend le vocal introuvable ; deux
 * boutons côte à côte prennent la largeur du champ sur un téléphone.
 */
export function composerMode(args: {
	text: string
	attachmentCount: number
}): "voice" | "send" {
	const vide =
		args.text.trim().length === 0 &&
		!(Number.isFinite(args.attachmentCount) && args.attachmentCount > 0)
	return vide ? "voice" : "send"
}

/**
 * Un nombre dans la langue de l'écran — une décimale au plus, sans séparateur
 * de milliers (un poids de 1 023 octets s'écrit `1023 o`, comme au socle).
 */
function nombre(value: number, locale: string): string {
	return new Intl.NumberFormat(locale, { maximumFractionDigits: 1, useGrouping: false }).format(value)
}

/**
 * Un poids lisible — `24,8 Mo`, `310 ko` en français, `24.8 MB` en anglais.
 * Le refus doit nommer la grandeur : le nombre suit la langue (`locale`),
 * l'unité vient des locales.
 */
export function formatBytes(bytes: number, locale: string, t: TFunction): string {
	if (!Number.isFinite(bytes) || bytes < 0) return t("messagerie:messagerieComposer.bytes", { value: nombre(0, locale) })
	if (bytes < 1024) return t("messagerie:messagerieComposer.bytes", { value: nombre(Math.round(bytes), locale) })
	if (bytes < 1024 * 1024) return t("messagerie:messagerieComposer.kilobytes", { value: nombre(Math.round(bytes / 1024), locale) })
	return t("messagerie:messagerieComposer.megabytes", { value: nombre(bytes / (1024 * 1024), locale) })
}

/**
 * Pourquoi ce fichier est REFUSÉ — `null` s'il est acceptable.
 *
 * Le refus est prononcé AVANT le téléversement, avec la borne du serveur : un
 * écran qui accepte puis échoue à l'envoi a menti deux fois, une fois en
 * acceptant et une fois en montant les octets pour rien.
 *
 * ⚠️ `alreadyPending` compte ce qui est DÉJÀ dans le composeur : la borne
 * porte sur le message entier, pas sur l'ajout courant. Sans cela, on ajoute
 * cinq fichiers un par un et le serveur refuse le sixième à l'envoi.
 */
export function attachmentRejection(
	args: {
		file: { name: string; size: number; type: string }
		alreadyPending: number
	},
	locale: string,
	t: TFunction,
): string | null {
	const dejaLa = Number.isFinite(args.alreadyPending)
		? Math.max(0, Math.trunc(args.alreadyPending))
		: 0
	if (dejaLa >= ATTACHMENTS_MAX_PER_MESSAGE) {
		return t("messagerie:messagerieComposer.tooMany", { max: ATTACHMENTS_MAX_PER_MESSAGE })
	}
	if (!Number.isFinite(args.file.size) || args.file.size <= 0) {
		return t("messagerie:messagerieComposer.empty", { name: args.file.name })
	}
	if (args.file.size > ATTACHMENT_MAX_BYTES) {
		return t("messagerie:messagerieComposer.tooLarge", {
			name: args.file.name,
			size: formatBytes(args.file.size, locale, t),
			max: formatBytes(ATTACHMENT_MAX_BYTES, locale, t),
		})
	}
	return null
}

/**
 * Le `durationMs` à joindre à une pièce — `undefined` si le serveur le
 * refuserait.
 *
 * `assertAttachmentBatch` lève `ATTACHMENT_DURATION_NOT_AUDIO` dès qu'une
 * durée accompagne un conteneur hors de sa liste FERMÉE. Un enregistreur qui
 * retombe sur son conteneur par défaut (cf. `pickRecorderMimeType` rendant
 * `null`) peut très bien produire un mime hors liste : joindre la durée
 * quand même ferait échouer l'envoi du vocal AVEC son enregistrement.
 */
export function voiceDurationFor(
	mimeType: string,
	durationMs: number,
): number | undefined {
	if (!isVoiceAttachment(mimeType)) return undefined
	if (!Number.isFinite(durationMs) || durationMs <= 0) return undefined
	return Math.round(durationMs)
}
