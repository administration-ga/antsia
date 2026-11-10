// Dupliqué de socle/packages/agent-features/src/features/messagerie/icom-mobile-tabs.test.ts @ ad2e7fdc2 — adaptations : adresses composées depuis des bases INJECTÉES (celles des routes de test) au lieu de `/espace/messages` ; le retour mène désormais à l'accueil du réseau (le cas « il ne navigue pas » devient « il ramène à l'accueil ») ; textes lus par `icomMobileTabText` / `icomMobileBadge` avec l'instance i18n du moteur (français, et anglais pour les pluriels) ; description des Statuts réécrite (plus de « surface iCom » des stories).
import { describe, expect, it } from "vitest"

import { createAppI18n } from "../../i18n"
import { ICOM_DOCK_TAB_IDS, ICOM_DOCK_TABS } from "./icom-dock"
import {
	ICOM_BRIQUE_PARAM,
	ICOM_MOBILE_MENU_TAB,
	ICOM_MOBILE_SUBTABS,
	ICOM_MOBILE_TABS,
	icomMobileBadge,
	icomMobileTabHref,
	icomMobileTabText,
	parseIcomBrique,
	voicemailTabBadge,
} from "./icom-mobile-tabs"

const t = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "messagerie" }).t
const tEn = createAppI18n({ locale: "en", appResources: { fr: {}, en: {} }, defaultNS: "messagerie" }).t
/** Les bases de l'application, telles que les routes de test les injectent. */
const BASES = { home: "/fil", messages: "/messages" }

describe("parseIcomBrique", () => {
	it("reconnaît les quatre briques personnelles du dock", () => {
		expect(parseIcomBrique("ichat")).toBe("ichat")
		expect(parseIcomBrique("iappel")).toBe("iappel")
		expect(parseIcomBrique("icontact")).toBe("icontact")
		expect(parseIcomBrique("actus")).toBe("actus")
	})

	it("ramène l'inconnu sur iChat — jamais d'écran vide", () => {
		expect(parseIcomBrique(null)).toBe("ichat")
		expect(parseIcomBrique(undefined)).toBe("ichat")
		expect(parseIcomBrique("annuaire")).toBe("ichat")
	})
})

describe("ICOM_MOBILE_TABS — les cinq emplacements", () => {
	it("porte le retour au menu principal EN PREMIER, puis les briques, Statuts entre iChat et iAppel", () => {
		expect(ICOM_MOBILE_TABS.map((tab) => tab.id)).toEqual([
			"menu_principal",
			"ichat",
			"actus",
			"iappel",
			"icontact",
		])
	})

	it("sépare le menu fixe des quatre sous-menus défilants", () => {
		expect(ICOM_MOBILE_MENU_TAB.id).toBe("menu_principal")
		expect(ICOM_MOBILE_SUBTABS.map((tab) => tab.id)).toEqual([
			"ichat",
			"actus",
			"iappel",
			"icontact",
		])
		expect(ICOM_MOBILE_SUBTABS).not.toContain(ICOM_MOBILE_MENU_TAB)
	})

	it("le retour porte le même mot et la même icône que dans les autres barres", () => {
		// C'est le même geste dans chaque barre : un retour qui changerait de
		// nom d'une barre à l'autre se réapprendrait à chaque fois.
		const retour = ICOM_MOBILE_TABS.find((tab) => tab.id === "menu_principal")
		expect(icomMobileTabText("menu_principal", t).shortLabel).toBe("Menu")
		expect(icomMobileTabText("menu_principal", t).label).toBe("Revenir au menu principal")
		expect(retour?.icon).toBe("grid")
	})

	it("couvre TOUTES les briques du dock — aucune ne reste sans surface mobile", () => {
		const ids = new Set(ICOM_MOBILE_TABS.map((tab) => tab.id))
		for (const dockId of ICOM_DOCK_TAB_IDS) {
			expect(ids.has(dockId)).toBe(true)
		}
	})

	it("dérive les libellés des briques du dock — jamais une seconde liste", () => {
		for (const dockTab of ICOM_DOCK_TABS) {
			const mobile = icomMobileTabText(dockTab.id, t)
			expect(mobile.shortLabel).toBe(t(dockTab.labelKey))
			expect(mobile.label).toContain(t(dockTab.descriptionKey))
		}
	})

	it("la brique `actus` s'affiche « Statuts » — l'id, lui, ne change pas", () => {
		const actus = icomMobileTabText("actus", t)
		expect(actus.shortLabel).toBe("Statuts")
		expect(actus.label).toBe("Statuts — Les statuts de votre réseau")
	})
})

describe("icomMobileTabHref", () => {
	it("iChat garde l'URL canonique NUE — jamais ?brique=ichat", () => {
		expect(icomMobileTabHref("ichat", BASES)).toBe("/messages")
	})

	it("les autres briques s'adressent par ?brique=", () => {
		expect(icomMobileTabHref("actus", BASES)).toBe(
			`/messages?${ICOM_BRIQUE_PARAM}=actus`,
		)
		expect(icomMobileTabHref("iappel", BASES)).toBe(
			`/messages?${ICOM_BRIQUE_PARAM}=iappel`,
		)
		expect(icomMobileTabHref("icontact", BASES)).toBe(
			`/messages?${ICOM_BRIQUE_PARAM}=icontact`,
		)
	})

	it("le retour ramène à l'accueil du réseau, où vivent sa barre et son menu", () => {
		expect(icomMobileTabHref("menu_principal", BASES)).toBe("/fil")
	})

	it("suit les bases de L'APPLICATION, quelles qu'elles soient", () => {
		const imbriquees = { home: "/r/antsia", messages: "/r/antsia/messages" }
		expect(icomMobileTabHref("ichat", imbriquees)).toBe("/r/antsia/messages")
		expect(icomMobileTabHref("iappel", imbriquees)).toBe("/r/antsia/messages?brique=iappel")
		expect(icomMobileTabHref("menu_principal", imbriquees)).toBe("/r/antsia")
	})
})

describe("icomMobileBadge — deux pastilles, jamais additionnées", () => {
	it("iChat porte les messages non lus, avec la phrase accessible", () => {
		expect(icomMobileBadge("ichat", { unreadMessages: 3 }, t)).toEqual({
			badge: "3",
			label: "3 messages non lus",
		})
		expect(icomMobileBadge("ichat", { unreadMessages: 1 }, t)?.label).toBe(
			"1 message non lu",
		)
		expect(icomMobileBadge("ichat", { unreadMessages: 0 }, t)).toBeNull()
	})

	it("Statuts porte les statuts non vus", () => {
		expect(icomMobileBadge("actus", { unseenActus: 2 }, t)).toEqual({
			badge: "2",
			label: "2 statuts non vus",
		})
		expect(icomMobileBadge("actus", { unseenActus: 1 }, t)?.label).toBe(
			"1 statut non vu",
		)
		expect(icomMobileBadge("actus", {}, t)).toBeNull()
	})

	it("les pluriels suivent la langue de l'écran", () => {
		expect(icomMobileBadge("ichat", { unreadMessages: 1 }, tEn)?.label).toBe(
			"1 unread message",
		)
		expect(icomMobileBadge("ichat", { unreadMessages: 4 }, tEn)?.label).toBe(
			"4 unread messages",
		)
	})

	it("IC-02 : iAppel porte les messages vocaux non écoutés, et eux seuls", () => {
		expect(icomMobileBadge("iappel", { unheardVoicemails: 2 }, t)).toEqual({
			badge: "2",
			label: "2 messages vocaux non écoutés",
		})
		expect(icomMobileBadge("iappel", { unheardVoicemails: 1 }, tEn)?.label).toBe("1 unheard voicemail")
		expect(icomMobileBadge("iappel", { unheardVoicemails: 0 }, t)).toBeNull()
		expect(icomMobileBadge("iappel", { unheardVoicemails: 150 }, t)?.badge).toBe("99+")
		expect(icomMobileBadge("ichat", { unheardVoicemails: 4 }, t)).toBeNull()
		expect(voicemailTabBadge(3, t)).toEqual({ badge: "3", label: "3 messages vocaux non écoutés" })
		expect(voicemailTabBadge(undefined, t)).toBeNull()
	})

	it("les autres emplacements ne portent RIEN — même chargés de compteurs", () => {
		const counts = { unreadMessages: 9, unseenActus: 9, unheardVoicemails: 9 }
		expect(icomMobileBadge("menu_principal", counts, t)).toBeNull()
		expect(icomMobileBadge("iappel", { unreadMessages: 9, unseenActus: 9 }, t)).toBeNull()
		expect(icomMobileBadge("icontact", counts, t)).toBeNull()
	})
})
