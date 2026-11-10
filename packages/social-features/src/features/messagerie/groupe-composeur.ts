// Dupliqué de socle/packages/agent-features/src/features/messagerie/groupe-composeur.ts @ ad2e7fdc2 — adaptations : bornes lues dans le contrat du moteur (`@antsia/social-contracts/groupCapacity` : plafond de structure 256, minimum d'autres membres et longueur du titre, au lieu de deux copies locales) ; raison de refus traduite (`validerSelection` reçoit `t` en dernier paramètre, clés qualifiées `messagerie:groupeComposeur.…`) ; refus d'une PHOTO DE GROUPE (`refusPhotoDeGroupe`, types et poids du domaine `@antsia/social-domain/content`) qui remplace la réécriture, par remplacement de texte, du refus de photo de profil ; `GROUPE_PHOTO_ACCEPT` et `GROUPE_PHOTO_MAX_MO` pour le sélecteur de fichier et son aide ; PF-03 : `preparerPhotoDeGroupe` — la photo choisie passe par la préparation des photos (`features/media-upload` : ré-encodée, 1 024 px au plus, sans métadonnées, échec fermé) avant son envoi.
/**
 * groupe-composeur — ce que le composeur de GROUPE décide.
 *
 * Même doctrine que `messagerie-dock.ts` : tout ce qui se DÉCIDE (sélection,
 * titre obligatoire, envoi possible) vit ici, testable en `node`, et le
 * composant ne fait qu'afficher.
 *
 * Les bornes sont celles du CONTRAT que le serveur applique
 * (`assertGroupComposition`, `assertGroupTitle`) : le serveur reste seul juge
 * — ici on épargne juste un aller-retour pour un refus certain.
 *
 * ⚠️ Aucune borne n'est recopiée : le plafond, le minimum et la longueur du
 * titre sont IMPORTÉS du contrat, module pur partagé avec le backend. La copie
 * locale du socle disait vingt et un quand le serveur était passé à mille, et
 * rien n'aurait signalé l'écart. Une borne qu'on recopie est une borne qui
 * dérive.
 */

import {
	GROUP_MEMBERS_MAX,
	GROUP_MIN_OTHERS,
	GROUP_TITLE_MAX_LENGTH,
} from "@antsia/social-contracts/groupCapacity"
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from "@antsia/social-domain/content"
import { megabytes } from "@antsia/social-domain/violation"
import type { TFunction } from "i18next"

import {
	AVATAR_UPLOAD_MAX_DIMENSION,
	imagePreparationRefusalText,
	prepareImageForUpload,
	type ImagePreparation,
	type PrepareImageWith,
} from "../media-upload"

/** Plafond d'un groupe, CRÉATEUR COMPRIS — la SOURCE, plus un miroir. */
export const GROUPE_MAX_MEMBRES = GROUP_MEMBERS_MAX
/** Ce qu'on peut donc SÉLECTIONNER : tout le monde sauf soi. */
export const GROUPE_MAX_AUTRES = GROUPE_MAX_MEMBRES - 1
/**
 * En deçà de deux autres personnes, c'est un 1:1 — il a déjà sa surface, et
 * un « groupe de deux » donnerait deux fils pour la même paire.
 */
export const GROUPE_MIN_AUTRES = GROUP_MIN_OTHERS
export const GROUPE_TITRE_MAX = GROUP_TITLE_MAX_LENGTH
/**
 * Ce que le sélecteur de photo de groupe propose : les types qu'admet l'usage
 * `avatar` du serveur (photo de profil ET photo de groupe).
 */
export const GROUPE_PHOTO_ACCEPT = AVATAR_MIME_TYPES.join(",")
/** Le poids maximal d'une photo de groupe, en mégaoctets (usage `avatar`). */
export const GROUPE_PHOTO_MAX_MO = megabytes(AVATAR_MAX_BYTES)

/**
 * Coche ou décoche un handle. Au plafond, cocher de plus est un NON-geste :
 * la MÊME référence revient, et l'écran n'a rien à re-rendre — le compteur
 * « x/max » dit déjà pourquoi.
 */
export function toggleSelection(
	selection: readonly string[],
	handle: string,
): readonly string[] {
	if (handle.length === 0) return selection
	const index = selection.indexOf(handle)
	if (index >= 0) {
		return [...selection.slice(0, index), ...selection.slice(index + 1)]
	}
	if (selection.length >= GROUPE_MAX_AUTRES) return selection
	return [...selection, handle]
}

export type SelectionVerdict = { ok: true } | { ok: false; raison: string }

/** Pourquoi une sélection ne fait pas un groupe — `null` quand elle le fait. */
function raisonDeRefus(
	selection: readonly string[],
): "tropPeu" | "tropNombreux" | null {
	// Défensif : la sélection vient de `toggleSelection`, qui ne double
	// jamais — mais un état restauré ou bricolé ne doit pas compter double.
	const uniques = new Set(selection)
	if (uniques.size < GROUPE_MIN_AUTRES) return "tropPeu"
	if (uniques.size > GROUPE_MAX_AUTRES) return "tropNombreux"
	return null
}

/**
 * La sélection peut-elle devenir un groupe ? Et sinon, POURQUOI — la raison
 * est une phrase montrable, celle que le composeur affiche sous le bouton.
 */
export function validerSelection(
	selection: readonly string[],
	t: TFunction,
): SelectionVerdict {
	switch (raisonDeRefus(selection)) {
		case null:
			return { ok: true }
		case "tropPeu":
			return {
				ok: false,
				raison: t("messagerie:groupeComposeur.selectionTooFew", {
					min: GROUPE_MIN_AUTRES,
				}),
			}
		case "tropNombreux":
			return {
				ok: false,
				raison: t("messagerie:groupeComposeur.selectionTooMany", {
					max: GROUPE_MAX_MEMBRES,
				}),
			}
	}
}

/**
 * L'étape PARTICIPANTS peut-elle avancer vers l'identité du groupe ?
 *
 * Ce nom distinct de `peutEnvoyer` empêche le premier écran de dépendre d'un
 * titre qu'il ne montre pas encore. La même règle de sélection reste la
 * source unique des bornes client.
 */
export function peutContinuer(selection: readonly string[]): boolean {
	return raisonDeRefus(selection) === null
}

/**
 * Le bouton « Créer » peut-il partir ? Titre EXPLICITEMENT saisi + sélection
 * valable. Les noms des participants ne deviennent jamais un titre implicite :
 * un groupe possède une identité choisie, pas une liste de correspondants.
 */
export function peutEnvoyer(
	titre: string,
	selection: readonly string[],
): boolean {
	const propre = titre.trim()
	if (propre.length === 0 || propre.length > GROUPE_TITRE_MAX) return false
	return raisonDeRefus(selection) === null
}

/**
 * Le refus opposé à une photo de GROUPE, ou `null`.
 *
 * Miroir ALLÉGÉ de l'usage `avatar` du serveur (types et poids du domaine) :
 * il évite un téléversement perdu, il ne remplace pas la garde — le serveur
 * relit le type RÉEL du stockage, que le navigateur peut déclarer faux. La
 * phrase nomme la photo de GROUPE : le socle réécrivait le refus de photo de
 * profil par remplacement de texte, ce qu'aucune traduction ne survit.
 */
export function refusPhotoDeGroupe(file: Blob, t: TFunction): string | null {
	if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
		return t("messagerie:groupeComposeur.photoFormat")
	}
	if (file.size > AVATAR_MAX_BYTES) {
		return t("messagerie:groupeComposeur.photoTooLarge", {
			max: GROUPE_PHOTO_MAX_MO,
		})
	}
	return null
}

/** La préparation du navigateur (décodeur et canvas réels). */
const prepareInBrowser: PrepareImageWith = (file, options) => prepareImageForUpload(file, undefined, options)

/**
 * La photo de GROUPE prête à l'envoi, ou le refus à dire (lot PF-03 ;
 * décision du propriétaire du 9/11/2026).
 *
 * Le fichier choisi est jugé comme avant (`refusPhotoDeGroupe` : types et
 * poids de l'usage `avatar`, que l'aide du sélecteur annonce), puis préparé :
 * ré-encodé, 1 024 px au plus (`AVATAR_UPLOAD_MAX_DIMENSION`), sans aucune
 * métadonnée. Seule l'image préparée part ; un échec refuse la photo, jamais
 * l'original. `prepare` est injectable (`jsdom` n'a pas de canvas).
 */
export async function preparerPhotoDeGroupe(
	file: File,
	t: TFunction,
	prepare: PrepareImageWith = prepareInBrowser,
): Promise<{ ok: true; file: File } | { ok: false; refus: string }> {
	const avant = refusPhotoDeGroupe(file, t)
	if (avant !== null) return { ok: false, refus: avant }
	let result: ImagePreparation
	try {
		result = await prepare(file, { maxDimension: AVATAR_UPLOAD_MAX_DIMENSION })
	} catch {
		result = { ok: false, refusal: "unreadable" }
	}
	if (!result.ok) return { ok: false, refus: imagePreparationRefusalText(result.refusal, file.name, t) }
	const apres = refusPhotoDeGroupe(result.file, t)
	return apres === null ? { ok: true, file: result.file } : { ok: false, refus: apres }
}
