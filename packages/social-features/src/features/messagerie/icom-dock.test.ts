// Dupliqué de socle/packages/agent-features/src/features/messagerie/icom-dock.test.ts @ ad2e7fdc2 — adaptations : les libellés sont des CLÉS — ils sont lus par l'instance i18n du moteur (français) avant d'être comparés ; un cas ajouté : chaque clé existe dans les deux langues ; le reste tel quel. ; CH-817 : onglets montrés et onglet servi selon les appels proposés (`visibleIcomDockTabs`, `servedIcomDockTab`).
import { describe, expect, it } from "vitest"

import { createAppI18n } from "../../i18n"
import {
  dockChevronVisible,
  ICOM_DOCK_TABS,
  ICOM_DOCK_TAB_DEFAULT,
  icomDockBody,
  icomTabsVisible,
  normalizeIcomDockTab,
  servedIcomDockTab,
  visibleIcomDockTabs,
} from "./icom-dock"

const fr = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "messagerie" })
const en = createAppI18n({ locale: "en", appResources: { fr: {}, en: {} }, defaultNS: "messagerie" })
const libelles = () => ICOM_DOCK_TABS.map((tab) => fr.t(tab.labelKey))
/** Le texte d'une clé qualifiée DANS une langue précise — sans repli sur une autre. */
const texteDans = (langue: "fr" | "en", key: string): unknown => {
  const [ns = "", chemin = ""] = key.split(":")
  return (langue === "fr" ? fr : en).getResource(langue, ns, chemin)
}

describe("normalizeIcomDockTab — jamais d'onglet vide", () => {
  it("garde un onglet connu", () => {
    expect(normalizeIcomDockTab("icontact")).toBe("icontact")
  })
  it("ramène l'inconnu, le vide et l'absent sur iChat", () => {
    for (const bad of ["canaux", "", null, undefined]) {
      expect(normalizeIcomDockTab(bad)).toBe(ICOM_DOCK_TAB_DEFAULT)
    }
  })
})

describe("icomTabsVisible — les onglets sont une racine, pas une échappatoire", () => {
  it("se montrent sur la liste", () => {
    expect(icomTabsVisible("list")).toBe(true)
  })
  it("se taisent dès qu'on écrit ou qu'on lit une conversation", () => {
    for (const kind of ["chat", "compose", "composeGroupe", "groupe"]) {
      expect(icomTabsVisible(kind)).toBe(false)
    }
  })
})

describe("icomDockBody — la vue prime sur l'onglet", () => {
  it("chaque onglet a son corps, au repos", () => {
    expect(icomDockBody("ichat", "list")).toBe("messagerie")
    expect(icomDockBody("actus", "list")).toBe("actus")
    expect(icomDockBody("iappel", "list")).toBe("appel")
    expect(icomDockBody("icontact", "list")).toBe("contacts")
  })

  it("une conversation ouverte reprend la main sur TOUT onglet", () => {
    // Le défaut que cette règle empêche : revenir d'une conversation et
    // atterrir sur les relations parce que l'onglet était resté sur iContact.
    for (const tab of ICOM_DOCK_TABS) {
      expect(icomDockBody(tab.id, "chat")).toBe("messagerie")
    }
  })

  it("porte les quatre briques personnelles, dans cet ordre — jamais d'iRéunion ni de Canaux ici", () => {
    expect(ICOM_DOCK_TABS.map((t) => t.id)).toEqual([
      "ichat",
      "actus",
      "iappel",
      "icontact",
    ])
    expect(libelles()).toEqual([
      "iChat",
      "Statuts",
      "iAppel",
      "Relations",
    ])
  })

  it("les quatre onglets ont des libellés distincts", () => {
    const labels = libelles()
    expect(new Set(labels).size).toBe(labels.length)
  })

  it("chaque libellé et chaque description existent dans les deux langues", () => {
    for (const tab of ICOM_DOCK_TABS) {
      for (const key of [tab.labelKey, tab.descriptionKey]) {
        expect(typeof texteDans("fr", key), `${key} (fr)`).toBe("string")
        expect(typeof texteDans("en", key), `${key} (en)`).toBe("string")
      }
    }
  })

  it("le quatrième onglet s'affiche « Relations », jamais « iContact »", () => {
    // « iContact » désignait au socle l'annuaire INSTITUTIONNEL ; l'onglet du
    // réseau liste les relations. L'id, lui, reste `icontact` — il voyage
    // dans les URLs et les préférences.
    const tab = ICOM_DOCK_TABS.find((t) => t.id === "icontact")
    expect(tab === undefined ? undefined : fr.t(tab.labelKey)).toBe("Relations")
  })
})

describe("CH-817 — iAppel n'est un onglet que si l'application propose des appels", () => {
  it("appels proposés (antsia.ga) : les quatre briques, inchangées", () => {
    expect(visibleIcomDockTabs({ callsAvailable: true }).map((tab) => tab.id)).toEqual(["ichat", "actus", "iappel", "icontact"])
    expect(servedIcomDockTab("iappel", true)).toBe("iappel")
  })

  it("appels fermés : iAppel quitte la barre, les autres gardent leur ordre", () => {
    expect(visibleIcomDockTabs({ callsAvailable: false }).map((tab) => tab.id)).toEqual(["ichat", "actus", "icontact"])
  })

  it("sous destinations, Statuts reste retiré — avec ou sans appels", () => {
    expect(visibleIcomDockTabs({ callsAvailable: true, destinations: true }).map((tab) => tab.id)).toEqual(["ichat", "iappel", "icontact"])
    expect(visibleIcomDockTabs({ callsAvailable: false, destinations: true }).map((tab) => tab.id)).toEqual(["ichat", "icontact"])
  })

  it("un iAppel demandé, appels fermés, retombe sur iChat ; les autres briques ne bougent pas", () => {
    expect(servedIcomDockTab("iappel", false)).toBe(ICOM_DOCK_TAB_DEFAULT)
    for (const tab of ["ichat", "actus", "icontact"] as const) expect(servedIcomDockTab(tab, false)).toBe(tab)
  })
})

describe("dockChevronVisible", () => {
  it("le chevron n'existe qu'ANCRÉ et repliable — la croix range le flottant", () => {
    expect(dockChevronVisible(true, false)).toBe(true)
    expect(dockChevronVisible(true, true)).toBe(false)
    expect(dockChevronVisible(false, false)).toBe(false)
    expect(dockChevronVisible(false, true)).toBe(false)
  })
})
