// Écrit pour le moteur (lot P02 de l'étude social-commerce du 18/10/2026, sans équivalent au socle) : les cinq destinations stables du réseau — Fil · Découvrir · Créer · Messages · Profil —, leurs adresses composées sur la table de routes INJECTÉE, la destination courante, le rangement des volets sous elles et le choix « Créer » bâti sur le catalogue du moteur (`creation-controller`).
/**
 * reseau-menu-destinations — la NAVIGATION PAR DESTINATIONS, hors de tout
 * composant (module PUR, testé en environnement `node`).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * UNE CAPACITÉ DÉCLARÉE PAR L'APPLICATION, JAMAIS IMPOSÉE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Rien ici ne s'applique tant que l'application ne le déclare pas
 * (`NetworkProvider navigation="destinations"`, avec `routes.discover` et
 * `routes.me`). Sans déclaration, la barre « Menu » du téléphone et le rail
 * des volets du bureau restent EXACTEMENT ceux d'avant : une application qui
 * ne déclare rien (DIASPORALE) ne voit aucun changement.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CINQ DESTINATIONS, TOUJOURS LES MÊMES, DANS LE MÊME ORDRE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Fil · Découvrir · Créer · Messages · Profil — au téléphone (barre basse) et
 * au bureau (rail). « Créer » n'est pas un lieu : il ouvre un CHOIX de formats
 * déjà servis (`creationEntries`) et n'a donc ni adresse, ni état « courant ».
 *
 * Les volets de la page réseau (`?tab=…`) ne deviennent PAS des destinations :
 * ils SE RANGENT sous l'une d'elles — relations, groupes, pages, conférences
 * et évènements sous « Découvrir », les signets sous « Profil ». Une adresse
 * ancienne (`?tab=reseau`, `?tab=activite`…) se range donc comme son volet.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AUCUNE ADRESSE N'EST ÉCRITE ICI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Les fabriques reçoivent la table de routes de l'application (`useRoutes()`)
 * et ne comparent que des CHEMINS — la query ne sert qu'à lire le volet.
 */

import type { EngineRoutes } from "@antsia/api/network"

import {
	creationEntries,
	creationLaunchFor,
	type CreationEntry,
	type CreationRoutes,
} from "../features/reseau-personnel/creation-controller"
import { parseReseauAgentTab, RESEAU_AGENT_TAB_PARAM, type ReseauAgentTabId } from "./reseau-agent-nav"
import { RESEAU_SERVED_TAB_IDS } from "./reseau-menu"

/** Les cinq destinations, dans l'ordre du rendu. */
export const RESEAU_DESTINATION_IDS = ["fil", "decouvrir", "creer", "messages", "profil"] as const

export type ReseauDestinationId = (typeof RESEAU_DESTINATION_IDS)[number] | "clips"

/** Les destinations qui sont des LIEUX (toutes, sauf « Créer »). */
export type ReseauPlaceDestinationId = Exclude<ReseauDestinationId, "creer">

/**
 * Les adresses dont les destinations ont besoin — celles de `useRoutes()`,
 * avec les deux destinations propres rendues obligatoires.
 */
export interface ReseauDestinationRoutes extends CreationRoutes {
	home: () => string
	discover: () => string
	messages: () => string
	me: () => string
	profile: (handle: string) => string
  /** U04 : ensemble vidéo effectivement servi et nommé par l'application. */
  clips?: (handle?: string) => string
  clipsLabel?: string
}

/**
 * Les adresses des destinations, ou `null` quand l'application n'en sert pas
 * l'une des deux propres (`discover`, `me`) : la coque garde alors ses volets,
 * plutôt que d'afficher une entrée qui mènerait à un 404.
 */
export function destinationRoutesOf(routes: EngineRoutes): ReseauDestinationRoutes | null {
	const { discover, me } = routes
	if (discover === undefined || me === undefined) return null
	return { home: routes.home, discover, messages: routes.messages, me, profile: routes.profile, ...(routes.myActivity === undefined ? {} : { myActivity: routes.myActivity }) }
}

export interface ReseauDestination {
	id: ReseauDestinationId
	/** Clé i18n qualifiée du libellé — c'est aussi le nom accessible de la cible. */
	labelKey: string
  /** Libellé facultatif déjà traduit, injecté pour une nouvelle destination. */
  label?: string
	/** L'adresse de la destination ; `null` pour « Créer », qui ouvre un choix. */
	href: string | null
}

function destinationHref(id: ReseauDestinationId, routes: ReseauDestinationRoutes): string | null {
	switch (id) {
		case "fil":
			return routes.home()
		case "decouvrir":
			return routes.discover()
		case "creer":
			return null
    case "clips":
      return routes.clips?.() ?? null
		case "messages":
			return routes.messages()
		case "profil":
			return routes.me()
	}
}

/** Les cinq destinations, adressées sur la table de routes injectée. */
export function reseauDestinations(routes: ReseauDestinationRoutes): ReseauDestination[] {
  const ids: readonly ReseauDestinationId[] = routes.clips !== undefined && Boolean(routes.clipsLabel?.trim())
    ? ["fil", "clips", "messages", "decouvrir", "profil"]
    : RESEAU_DESTINATION_IDS
  return ids.map((id) => ({
		id,
		labelKey: `reseau:reseauDestinations.${id}`,
    ...(id === "clips" ? { label: routes.clipsLabel } : {}),
		href: destinationHref(id, routes),
	}))
}

/**
 * Sous quelle destination chaque volet se range.
 *
 * Un `Record` COMPLET plutôt qu'un `switch` à cas par défaut : un volet ajouté
 * à `RESEAU_AGENT_TAB_IDS` sans rangement fait échouer le typage, au lieu de
 * tomber silencieusement sous le Fil.
 */
const VOLET_DESTINATION: Readonly<Record<ReseauAgentTabId, ReseauPlaceDestinationId>> = Object.freeze({
	fil: "fil",
	relations: "decouvrir",
	groupes: "decouvrir",
	pages: "decouvrir",
	conferences: "decouvrir",
	evenements: "decouvrir",
	enregistrements: "profil",
})

export function destinationOfVolet(tab: ReseauAgentTabId): ReseauPlaceDestinationId {
	return VOLET_DESTINATION[tab]
}

/** Les volets SERVIS rangés sous une destination, dans l'ordre du contrat. */
export function voletsUnder(id: ReseauDestinationId): ReseauAgentTabId[] {
	return RESEAU_SERVED_TAB_IDS.filter((tab) => VOLET_DESTINATION[tab] === id)
}

/**
 * Comment la page courante se rattache à une destination.
 *
 *  · `page` : l'adresse EST la destination (`aria-current="page"`) ;
 *  · `section` : la page en RELÈVE — un volet de découverte, mon profil
 *    public, une conversation (`aria-current="true"`).
 */
export type ReseauDestinationCurrent = "page" | "section"

export interface ReseauDestinationMatch {
	id: ReseauPlaceDestinationId
	current: ReseauDestinationCurrent
}

/** Ce que la destination courante lit de l'adresse : son chemin, et sa query. */
export interface ReseauDestinationLocation {
	pathname: string | null
	/** La query — seul `tab` est lu, sur la page réseau. */
	search?: { get: (name: string) => string | null } | null
}

/**
 * Le CHEMIN d'une adresse : query et ancre retirées, barres finales ignorées,
 * la racine gardée (même normalisation que `reseau-mobile-tabs`).
 */
function pathOf(href: string): string {
	const withoutQuery = href.split("?")[0]?.split("#")[0] ?? ""
	const trimmed = withoutQuery.replace(/\/+$/, "")
	if (trimmed.length === 0) return "/"
	return trimmed.startsWith("/") ? trimmed : `/${trimmed}`
}

/** `path` est-il `base` ou une page SOUS elle (segment entier comparé) ? */
function within(path: string, base: string): "self" | "below" | null {
	if (path === base) return "self"
	if (base !== "/" && path.startsWith(`${base}/`)) return "below"
	return null
}

/**
 * La destination COURANTE, ou `null` quand la page n'en relève d'aucune (le
 * profil d'une autre personne, une page, une file de modération…). Une page
 * propre à l'application qu'elle seule sait ranger (un fil filtré, ses
 * préférences) se range par la coque appelante, qui connaît ses adresses.
 *
 * ⚠️ « Créer » n'est JAMAIS courant : c'est un geste, pas un lieu.
 */
export function activeReseauDestination(
	location: ReseauDestinationLocation,
	routes: ReseauDestinationRoutes,
	myHandle: string | null,
): ReseauDestinationMatch | null {
	if (location.pathname === null) return null
	const path = pathOf(location.pathname)

  if (routes.clips !== undefined && path === pathOf(routes.clips())) return { id: "clips", current: "page" }

	if (path === pathOf(routes.discover())) return { id: "decouvrir", current: "page" }
	if (path === pathOf(routes.me())) return { id: "profil", current: "page" }

	const messages = within(path, pathOf(routes.messages()))
	if (messages !== null) return { id: "messages", current: messages === "self" ? "page" : "section" }

	if (path === pathOf(routes.home())) {
		// La page réseau : son volet décide (alias et anciennes graphies compris).
		const destination = destinationOfVolet(parseReseauAgentTab(location.search?.get(RESEAU_AGENT_TAB_PARAM) ?? null))
		return { id: destination, current: destination === "fil" ? "page" : "section" }
	}

	if (myHandle !== null && myHandle.trim().length > 0) {
		if (within(path, pathOf(routes.profile(myHandle))) !== null) return { id: "profil", current: "section" }
	}
	return null
}

/** La valeur ARIA d'un rattachement : `"page"`, ou `true` pour une section. */
export function ariaCurrentFor(match: ReseauDestinationMatch | null, id: ReseauDestinationId): "page" | true | undefined {
	if (match === null || match.id !== id) return undefined
	return match.current === "page" ? "page" : true
}

/** Le plafond de la pastille Messages — celui de toutes les pastilles d'iCom (`ICOM_UNREAD_CAP`). */
export const MESSAGES_UNREAD_CAP = 99

/** Un décompte tel que le SERVEUR le rend (`totalUnread`). */
export interface ServerUnreadCount {
	total: number
	capped: boolean
}

/**
 * Le chiffre de la pastille Messages : tête-à-tête + groupes, comptés par le
 * SERVEUR (IC-06), plafonnés sans perdre l'information « plafonné ». Même
 * règle que `combinerNonLus` de la messagerie — un test confronte les deux :
 * la barre et iCom ne peuvent pas afficher deux chiffres.
 *
 * (La coque ne lit pas la source d'iCom elle-même : la charger évaluerait
 * toutes ses portes d'écriture pour un simple décompte.)
 */
export function messagesUnreadTotal(directs: ServerUnreadCount | undefined, groupes: ServerUnreadCount | undefined): number {
	const sum = (directs?.total ?? 0) + (groupes?.total ?? 0)
	if (directs?.capped === true || groupes?.capped === true || sum >= MESSAGES_UNREAD_CAP) return MESSAGES_UNREAD_CAP
	return sum
}

/** Un format du choix « Créer », et ce qu'il fait. */
export interface ReseauCreationChoice {
	entry: CreationEntry
	/**
	 * L'adresse quand le format NAVIGUE (évènement, album) — rendu en LIEN :
	 * il s'ouvre dans un onglet, et les gardes de sortie d'une page le voient
	 * comme toute autre navigation. `null` quand le format ouvre une surface EN
	 * PLACE (publication, actu, conférence).
	 */
	href: string | null
}

/**
 * Le choix « Créer » de la navigation par destinations.
 *
 * ⚠️ C'est la liste COMPLÈTE du catalogue (`creationEntries({ mobile: true })`)
 * aux DEUX formats : dans cette navigation, « Créer » est la porte unique de
 * la création, au bureau comme au téléphone. Les portes historiques du bureau
 * (« Publier », la vignette des actus, le volet Évènements) restent en place.
 *
 * La conférence n'est offerte que si l'application sert le direct
 * (`liveAvailable`) : sans hôte de direct monté, le geste ne mènerait à rien.
 * L'album n'est offert qu'avec un identifiant publié (`creationEntries`).
 */
export function reseauCreationChoices(
	context: { handle: string | null; liveAvailable: boolean },
	routes: CreationRoutes,
): ReseauCreationChoice[] {
	return creationEntries({ mobile: true, handle: context.handle, activity: routes.myActivity !== undefined })
		.filter((entry) => entry.kind !== "conference" || context.liveAvailable)
		.map((entry) => {
			const launch = creationLaunchFor(entry.kind, { handle: context.handle }, routes)
			return { entry, href: launch.action === "navigate" ? launch.href : null }
		})
}
