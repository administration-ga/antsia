// Écrit pour le moteur (lot P02 de l'étude social-commerce du 18/10/2026) : les cinq destinations — ordre, adresses injectées, destination courante (volets, alias, sections), rangement de chaque volet, choix « Créer » et pastille Messages confrontée à celle d'iCom.
import type { EngineRoutes } from "@antsia/api/network"
import { describe, expect, it } from "vitest"

import { combinerNonLus } from "../features/messagerie/messagerie-source"
import { creationEntries } from "../features/reseau-personnel/creation-controller"
import { createAppI18n } from "../i18n"
import { RESEAU_AGENT_TAB_IDS } from "./reseau-agent-nav"
import { RESEAU_SERVED_TAB_IDS } from "./reseau-menu"
import {
	activeReseauDestination,
	ariaCurrentFor,
	destinationOfVolet,
	destinationRoutesOf,
	MESSAGES_UNREAD_CAP,
	messagesUnreadTotal,
	RESEAU_DESTINATION_IDS,
	reseauCreationChoices,
	reseauDestinations,
	voletsUnder,
	type ReseauDestinationRoutes,
} from "./reseau-menu-destinations"

const t = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "reseau" }).getFixedT("fr")
const tEn = createAppI18n({ locale: "en", appResources: { fr: {}, en: {} }, defaultNS: "reseau" }).getFixedT("en")

/** Les adresses d'une application de test — aucune n'est celle d'antsia.ga. */
const ENGINE: EngineRoutes = {
	home: () => "/reseau-test",
	messages: () => "/boite",
	stories: () => "/statuts",
	profile: (handle) => `/personne/${encodeURIComponent(handle)}`,
	page: (handle) => `/fiche/${encodeURIComponent(handle)}`,
	conference: (id) => `/direct-test/${encodeURIComponent(id)}`,
	discover: () => "/explorer-test",
	me: () => "/moi-test",
}
const ROUTES = destinationRoutesOf(ENGINE) as ReseauDestinationRoutes

/** La destination courante, sur une adresse complète (chemin + query). */
function at(href: string, handle: string | null = "awa.ndong") {
	const url = new URL(href, "https://example.test")
	return activeReseauDestination({ pathname: url.pathname, search: url.searchParams }, ROUTES, handle)
}

describe("reseauDestinations — cinq destinations stables", () => {
  it("active Clips seulement avec sa route et son libellé, sans laisser un lien Créer inerte", () => {
    const withClips = { ...ROUTES, clips: () => "/clips-test", clipsLabel: "Clips" }
    expect(reseauDestinations(withClips).map(destination => destination.id)).toEqual(["fil", "clips", "messages", "decouvrir", "profil"])
    expect(reseauDestinations(withClips)[1]).toMatchObject({ label: "Clips", href: "/clips-test" })
    expect(reseauDestinations({ ...ROUTES, clips: withClips.clips }).some(destination => destination.id === "clips")).toBe(false)
    expect(activeReseauDestination({ pathname: "/clips-test", search: new URLSearchParams() }, withClips, null)).toEqual({ id: "clips", current: "page" })
  })
	it("Fil · Découvrir · Créer · Messages · Profil, dans cet ordre, traduites dans les deux langues", () => {
		expect(RESEAU_DESTINATION_IDS).toEqual(["fil", "decouvrir", "creer", "messages", "profil"])
		const destinations = reseauDestinations(ROUTES)
		expect(destinations.map((destination) => t(destination.labelKey))).toEqual(["Fil", "Découvrir", "Créer", "Messages", "Profil"])
		expect(destinations.map((destination) => tEn(destination.labelKey))).toEqual(["Feed", "Discover", "Create", "Messages", "Profile"])
	})

	it("adresse chaque lieu sur la table injectée ; « Créer » n'a pas d'adresse (c'est un choix)", () => {
		expect(Object.fromEntries(reseauDestinations(ROUTES).map((destination) => [destination.id, destination.href]))).toEqual({
			fil: "/reseau-test",
			decouvrir: "/explorer-test",
			creer: null,
			messages: "/boite",
			profil: "/moi-test",
		})
	})

	it("n'existe pas tant que l'application ne sert pas SES deux destinations", () => {
		expect(destinationRoutesOf({ ...ENGINE, discover: undefined })).toBeNull()
		expect(destinationRoutesOf({ ...ENGINE, me: undefined })).toBeNull()
		// Une table de routes d'avant P02 : les deux clés n'existent même pas.
		const legacy: EngineRoutes = { home: ENGINE.home, messages: ENGINE.messages, stories: ENGINE.stories, profile: ENGINE.profile, page: ENGINE.page, conference: ENGINE.conference }
		expect(destinationRoutesOf(legacy)).toBeNull()
		expect(destinationRoutesOf(ENGINE)).not.toBeNull()
	})
})

describe("activeReseauDestination — où l'on est", () => {
	it("allume la destination dont la page EST l'adresse (aria-current=page)", () => {
		expect(at("/explorer-test")).toEqual({ id: "decouvrir", current: "page" })
		expect(at("/explorer-test/")).toEqual({ id: "decouvrir", current: "page" })
		expect(at("/moi-test")).toEqual({ id: "profil", current: "page" })
		expect(at("/boite")).toEqual({ id: "messages", current: "page" })
		expect(at("/reseau-test")).toEqual({ id: "fil", current: "page" })
	})

	it("range chaque volet de la page réseau sous sa destination — alias et anciennes graphies compris", () => {
		for (const tab of ["relations", "groupes", "pages", "conferences", "evenements", "reseau", "mon-reseau", "events", "directs"]) {
			expect(at(`/reseau-test?tab=${tab}`)).toEqual({ id: "decouvrir", current: "section" })
		}
		for (const tab of ["enregistrements", "signets", "bookmarks"]) {
			expect(at(`/reseau-test?tab=${tab}`)).toEqual({ id: "profil", current: "section" })
		}
		// L'ancien volet « Activité » et une valeur inconnue aboutissent au fil.
		for (const tab of ["fil", "activite", "inconnu", ""]) expect(at(`/reseau-test?tab=${tab}`)).toEqual({ id: "fil", current: "page" })
		// La recherche, le mot-clé et la publication ouverte sont des vues du FIL.
		expect(at("/reseau-test?q=sante")).toEqual({ id: "fil", current: "page" })
		expect(at("/reseau-test?post=p1")).toEqual({ id: "fil", current: "page" })
	})

	it("une conversation relève de Messages, mon profil public de Profil — par segment entier", () => {
		expect(at("/boite/chat/1")).toEqual({ id: "messages", current: "section" })
		expect(at("/boitex")).toBeNull()
		expect(at("/personne/awa.ndong")).toEqual({ id: "profil", current: "section" })
		expect(at("/personne/awa.ndong/albums/a1")).toEqual({ id: "profil", current: "section" })
		expect(at("/personne/autre")).toBeNull()
		expect(at("/personne/awa.ndong", null)).toBeNull()
		expect(at("/personne/awa.ndong", "  ")).toBeNull()
	})

	it("n'allume rien ailleurs : la page d'une autre personne, une fiche, une adresse inconnue", () => {
		expect(at("/fiche/radio")).toBeNull()
		expect(at("/ailleurs")).toBeNull()
		expect(activeReseauDestination({ pathname: null }, ROUTES, "awa.ndong")).toBeNull()
	})

	it("« Créer » n'est JAMAIS courant", () => {
		for (const href of ["/reseau-test", "/explorer-test", "/moi-test", "/boite", "/boite/chat/1", "/personne/awa.ndong"]) {
			expect(at(href)?.id).not.toBe("creer")
		}
	})

	it("dit la valeur ARIA : page, section (true), ou rien", () => {
		expect(ariaCurrentFor({ id: "fil", current: "page" }, "fil")).toBe("page")
		expect(ariaCurrentFor({ id: "decouvrir", current: "section" }, "decouvrir")).toBe(true)
		expect(ariaCurrentFor({ id: "decouvrir", current: "section" }, "fil")).toBeUndefined()
		expect(ariaCurrentFor(null, "messages")).toBeUndefined()
	})
})

describe("voletsUnder — aucun volet sans destination", () => {
	it("range les volets de découverte sous Découvrir, les signets sous Profil, le fil sous Fil", () => {
		expect(voletsUnder("decouvrir")).toEqual(["relations", "groupes", "pages", "conferences", "evenements"])
		expect(voletsUnder("profil")).toEqual(["enregistrements"])
		expect(voletsUnder("fil")).toEqual(["fil"])
		expect(voletsUnder("creer")).toEqual([])
		expect(voletsUnder("messages")).toEqual([])
	})

	it("chaque volet SERVI est rangé une fois, et chaque volet du contrat a son rangement", () => {
		const ranged = RESEAU_DESTINATION_IDS.flatMap((id) => voletsUnder(id))
		expect([...ranged].sort()).toEqual([...RESEAU_SERVED_TAB_IDS].sort())
		for (const tab of RESEAU_AGENT_TAB_IDS) expect(RESEAU_DESTINATION_IDS).toContain(destinationOfVolet(tab))
	})
})

describe("reseauCreationChoices — « Créer » ouvre un choix réel", () => {
	it("offre le catalogue complet du moteur, sans aucune route morte", () => {
		const choices = reseauCreationChoices({ handle: "awa.ndong", liveAvailable: true }, ROUTES)
		expect(choices.map((choice) => choice.entry.kind)).toEqual(creationEntries({ mobile: true, handle: "awa.ndong" }).map((entry) => entry.kind))
		// Les formats à SURFACE s'ouvrent en place ; ceux qui naviguent portent une adresse servie.
		const byKind = Object.fromEntries(choices.map((choice) => [choice.entry.kind, choice.href]))
		expect(byKind.publication).toBeNull()
		expect(byKind.actu).toBeNull()
		expect(byKind.conference).toBeNull()
		expect(byKind.evenement).toMatch(/^\/reseau-test\?tab=evenements/)
		expect(byKind.album).toMatch(/^\/personne\/awa\.ndong/)
	})

	it("offre « Mon activité » quand l'application sert la gestion des activités, avec son adresse", () => {
		const choices = reseauCreationChoices({ handle: null, liveAvailable: false }, { ...ROUTES, myActivity: () => "/mes-activites-test" })
		expect(choices.map((choice) => choice.entry.kind)).toEqual(["publication", "actu", "evenement", "activite"])
		expect(choices.find((choice) => choice.entry.kind === "activite")?.href).toBe("/mes-activites-test")
	})

	it("retire la conférence quand l'application ne sert pas le direct, l'album sans identifiant publié", () => {
		const kinds = reseauCreationChoices({ handle: null, liveAvailable: false }, ROUTES).map((choice) => choice.entry.kind)
		expect(kinds).toEqual(["publication", "actu", "evenement"])
	})
})

describe("messagesUnreadTotal — un seul chiffre pour Messages et iCom", () => {
	it("est EXACTEMENT celui de la messagerie (tête-à-tête + groupes, plafond, plafonné)", () => {
		const cases = [
			[undefined, undefined],
			[{ total: 0, capped: false }, { total: 0, capped: false }],
			[{ total: 3, capped: false }, undefined],
			[{ total: 40, capped: false }, { total: 58, capped: false }],
			[{ total: 50, capped: false }, { total: 49, capped: false }],
			[{ total: 1, capped: true }, { total: 0, capped: false }],
			[{ total: 0, capped: false }, { total: 99, capped: true }],
		] as const
		for (const [directs, groupes] of cases) expect(messagesUnreadTotal(directs, groupes)).toBe(combinerNonLus(directs, groupes).total)
		expect(MESSAGES_UNREAD_CAP).toBe(99)
	})
})
