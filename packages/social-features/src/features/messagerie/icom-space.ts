/**
 * icom-space — les DEUX ESPACES de la messagerie (ADR-0036, 22/10/2026).
 *
 * Sous la capacité `icomPro` déclarée par l'application (ANTSIA), la messagerie se lit en deux
 * espaces : iCom (relations, groupes, appels et contacts personnels) et iCom Pro (boutiques, côté
 * client compris, et mises en relation). L'espace s'adresse par `?espace=pro` sur la base de la
 * messagerie ; iCom garde l'adresse nue, celle que connaissent les liens et les notifications.
 *
 * Une conversation de boutique ou une mise en relation ouvre TOUJOURS iCom Pro, même sans
 * paramètre : un lien de notification ne doit pas atterrir dans le mauvais espace.
 *
 * Module PUR : des données et des décisions, testées.
 */

import { icomViewHref, type IcomViewId } from "./icom-views"

export const ICOM_SPACE_PARAM = "espace"
export const ICOM_PRO_SPACE_VALUE = "pro"
/** L'activité ouverte dans iCom Pro (`achats`, `relations` ou l'identifiant d'une boutique). */
export const ICOM_PRO_ACTIVITY_PARAM = "activite"

export type IcomSpace = "personnel" | "pro"

/**
 * L'espace affiché : iCom Pro pour une conversation pro (boutique, mise en relation) ou quand
 * l'adresse le demande ET que l'espace existe pour la personne ; iCom sinon.
 */
export function icomSpaceOf(input: { proConversation: boolean; rawSpace: string | null | undefined; proAvailable: boolean }): IcomSpace {
	if (input.proConversation) return "pro"
	return input.rawSpace === ICOM_PRO_SPACE_VALUE && input.proAvailable ? "pro" : "personnel"
}

/** L'adresse d'une vue dans un espace : iCom garde l'adresse des vues, iCom Pro y ajoute `espace=pro`. */
export function icomSpaceHref(space: IcomSpace, view: IcomViewId, base: string): string {
	const href = icomViewHref(view, base)
	if (space === "personnel") return href
	return `${href}${href.includes("?") ? "&" : "?"}${ICOM_SPACE_PARAM}=${ICOM_PRO_SPACE_VALUE}`
}

/** L'activité demandée par l'adresse, bornée : jamais une chaîne arbitraire recopiée ailleurs. */
export function icomProActivityFrom(raw: string | null | undefined): string | null {
	if (raw === null || raw === undefined) return null
	return /^[A-Za-z0-9_-]{1,64}$/u.test(raw) ? raw : null
}

/** Les paramètres d'une adresse iCom Pro, pour un lien depuis une autre page (espace boutique). */
export function icomProHref(base: string, activity?: string): string {
	const params = new URLSearchParams({ [ICOM_SPACE_PARAM]: ICOM_PRO_SPACE_VALUE })
	if (activity !== undefined && icomProActivityFrom(activity) !== null) params.set(ICOM_PRO_ACTIVITY_PARAM, activity)
	return `${base}?${params.toString()}`
}

