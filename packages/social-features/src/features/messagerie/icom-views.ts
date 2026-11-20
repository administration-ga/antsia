/**
 * icom-views — les TROIS VUES de Messages et leurs FILTRES (P05, 18/10/2026).
 *
 * Sous la navigation par destinations (capacité de présentation déclarée par
 * l'application, `useNetwork().navigation === "destinations"` — ANTSIA), Messages
 * est UNE destination et se lit en trois vues : Conversations · Appels ·
 * Contacts (spécification 05 §1). Les statuts n'y entrent pas : ils restent
 * atteignables depuis le fil, pour ne pas ouvrir deux navigations concurrentes.
 * Sans cette capacité (DIASPORA.GA), la messagerie garde ses briques d'origine
 * (`icom-mobile-tabs.ts`, `icom-dock.ts`) — rien ici n'est lu.
 *
 * ⚠️ Les vues s'adressent par le MÊME paramètre que les briques (`?brique=`) :
 * les liens déjà émis (journal d'appels d'une notification, anciens favoris)
 * restent valides. `actus` n'a pas de vue : il retombe sur Conversations.
 *
 * Les filtres de Conversations : Toutes · Non lues · Groupes. « Boutiques » est
 * TYPÉ et réservé au lot P10 (canal commercial) : il n'est ni rendu, ni
 * sélectionnable, ni adressable tant que ce canal n'existe pas — aucun écran ne
 * doit laisser croire qu'il filtre quelque chose.
 *
 * Module PUR : des données et des décisions, testées.
 */

import { fusionnerConversations, type ConversationAvecNonLus, type ConversationDatee, type EntreeConversation, type TotalNonLus } from "./groupe-liste"
import { ICOM_BRIQUE_PARAM, type IcomMobileBrique } from "./icom-mobile-tabs"

export const ICOM_VIEW_IDS = ["conversations", "appels", "contacts"] as const
export type IcomViewId = (typeof ICOM_VIEW_IDS)[number]

export interface IcomView {
	id: IcomViewId
	/** La brique d'origine que la vue adresse (`?brique=`), pour des liens stables. */
	brique: IcomMobileBrique
	/** Clé qualifiée du nom visible. */
	labelKey: string
}

export const ICOM_VIEWS: readonly IcomView[] = Object.freeze([
	{ id: "conversations" as const, brique: "ichat" as const, labelKey: "messagerie:icomViews.conversations" },
	{ id: "appels" as const, brique: "iappel" as const, labelKey: "messagerie:icomViews.calls" },
	{ id: "contacts" as const, brique: "icontact" as const, labelKey: "messagerie:icomViews.contacts" },
])

/** La vue qu'adresse un `?brique=` — Conversations par défaut, et pour `actus`. */
export function icomViewFromBrique(raw: string | null | undefined): IcomViewId {
	if (raw === "iappel") return "appels"
	if (raw === "icontact") return "contacts"
	return "conversations"
}

/**
 * L'adresse d'une vue sur la base de la messagerie (`useRoutes().messages()`).
 * Conversations garde l'URL NUE — celle que connaissent les liens et les
 * notifications ; les autres portent leur brique.
 */
export function icomViewHref(view: IcomViewId, base: string): string {
	const found = ICOM_VIEWS.find((candidate) => candidate.id === view)
	if (found === undefined || found.brique === "ichat") return base
	return `${base}?${ICOM_BRIQUE_PARAM}=${found.brique}`
}

/**
 * « Mises en relation » (`mises_en_relation`, CC-5, ADR-0025) est TYPÉ comme « Boutiques » : il
 * n'est servi QUE par une application qui injecte sa source contextuelle (`MessagesRoute`, prop
 * `contextual`) ; sinon il n'est ni rendu, ni sélectionnable, ni adressable.
 */
export const CONVERSATION_FILTER_IDS = ["toutes", "non_lues", "groupes", "boutiques", "mises_en_relation"] as const
export type ConversationFilterId = (typeof CONVERSATION_FILTER_IDS)[number]

export type ConversationFilter =
	| { id: ConversationFilterId; availability: "served"; labelKey: string }
	/** Réservé à un lot à venir : ni libellé, ni rendu, ni sélection. */
	| { id: ConversationFilterId; availability: "reserved"; lot: "P10" | "CC-5" }

export const CONVERSATION_FILTERS: readonly ConversationFilter[] = Object.freeze([
	{ id: "toutes" as const, availability: "served" as const, labelKey: "messagerie:conversationFilters.all" },
	{ id: "non_lues" as const, availability: "served" as const, labelKey: "messagerie:conversationFilters.unread" },
	{ id: "groupes" as const, availability: "served" as const, labelKey: "messagerie:conversationFilters.groups" },
	{ id: "boutiques" as const, availability: "reserved" as const, lot: "P10" as const },
	{ id: "mises_en_relation" as const, availability: "reserved" as const, lot: "CC-5" as const },
])

/** Le filtre « Mises en relation », tel qu'il se rend quand l'application l'injecte. */
export const CONTEXTUAL_CONVERSATION_FILTER: Extract<ConversationFilter, { availability: "served" }> = Object.freeze({
	id: "mises_en_relation" as const,
	availability: "served" as const,
	labelKey: "messagerie:contextualConversation.filter",
})

/** Les filtres RENDUS — jamais un filtre réservé. */
export function servedConversationFilters(commercial = false, contextual = false): Extract<ConversationFilter, { availability: "served" }>[] {
	const filters = CONVERSATION_FILTERS.filter(
		(filter): filter is Extract<ConversationFilter, { availability: "served" }> => filter.availability === "served",
	)
	const served: Extract<ConversationFilter, { availability: "served" }>[] = commercial ? [...filters, { id: "boutiques", availability: "served", labelKey: "shops:contact.inbox.title" }] : filters
	return contextual ? [...served, CONTEXTUAL_CONVERSATION_FILTER] : served
}

/** Un filtre inconnu ou réservé retombe sur « Toutes » : jamais une liste vide inexpliquée. */
export function parseConversationFilter(raw: string | null | undefined, commercial = false, contextual = false): ConversationFilterId {
	const served = servedConversationFilters(commercial, contextual).map((filter) => filter.id)
	return (served as readonly string[]).includes(raw ?? "") ? (raw as ConversationFilterId) : "toutes"
}

/**
 * Les conversations d'un filtre, fusionnées et triées par dernier message.
 *
 * « Non lues » ne retient que ce que le SERVEUR compte comme non lu
 * (`unreadCount`), dans les pages chargées ; la vue dit, à côté, quand des
 * conversations plus anciennes restent à charger. « Boutiques » (réservé) ne
 * rend rien.
 */
export function filtrerConversations<
	C extends ConversationDatee & ConversationAvecNonLus,
	G extends ConversationDatee & ConversationAvecNonLus,
>(chats: readonly C[], groupes: readonly G[], filtre: ConversationFilterId): readonly EntreeConversation<C, G>[] {
	switch (filtre) {
		case "toutes":
			return fusionnerConversations(chats, groupes)
		case "non_lues":
			return fusionnerConversations(
				chats.filter((chat) => chat.unreadCount > 0),
				groupes.filter((groupe) => groupe.unreadCount > 0),
			)
		case "groupes":
			return fusionnerConversations([], groupes)
		case "boutiques":
			return []
		// CC-5 : la liste injectée par l'application les rend ; aucun fil personnel n'y entre.
		case "mises_en_relation":
			return []
	}
}

/**
 * Le COMPTEUR d'un filtre — celui du serveur, jamais une somme de la page :
 * « Non lues » porte le total des messages non lus, « Groupes » celui des
 * groupes. « Toutes » n'en porte pas (le serveur ne compte pas les fils).
 */
export function conversationFilterCount(
	filtre: ConversationFilterId,
	nonLus: { total: TotalNonLus; groupes: TotalNonLus },
): TotalNonLus | null {
	if (filtre === "non_lues") return nonLus.total
	if (filtre === "groupes") return nonLus.groupes
	return null
}
