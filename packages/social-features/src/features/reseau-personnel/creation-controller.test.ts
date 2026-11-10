// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/creation-controller.test.ts @ ad2e7fdc2 — adaptations : format « Conférence » retiré (le direct n'existe pas encore dans le moteur) — les listes attendues perdent cette entrée ; libellés et descriptions lus par un `t` français (les formats portent des clés) ; l'évènement mène au volet Évènements de la page réseau (routes de test injectées) au lieu de l'intention d'iAgenda ; l'album mène à l'onglet Albums du profil composé sur la route injectée, et sans identifiant à la page réseau ; « agent » → « personne » ; cas ajoutés : la conférence n'est offerte nulle part, l'identifiant est encodé dans l'adresse d'album, aucune adresse n'est écrite en dur ; l'évènement mène à la carte de création OUVERTE du volet (intention `nouveau=evenement`, lot F2).
import { describe, expect, it } from "vitest"

import { createAppI18n } from "../../i18n"
import {
  creationEntries,
  creationEntry,
  creationEventHref,
  creationLaunchFor,
  creationSurfaceFor,
  type CreationKind,
  type CreationRoutes,
} from "./creation-controller"

const t = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "reseau" }).getFixedT("fr")

const TOUS: readonly CreationKind[] = ["publication", "actu", "evenement", "conference", "album"]

/** Une personne qui a un profil public — donc une adresse où poser un album. */
const AVEC_HANDLE = { handle: "m.ndong" }

/** Les routes injectées par l'application (`useRoutes()`), ici celles d'un test. */
const ROUTES: CreationRoutes = {
  home: () => "/fil",
  profile: (handle) => `/profil/${handle}`,
}

describe("creationEntries — ce que « Créer » propose", () => {
  it("porte les TROIS formats au téléphone, dans l'ordre du rendu", () => {
    // L'ordre est un contrat : la carte de choix le lit tel quel, et le
    // déplacer changerait la cible sous le doigt d'un geste appris.
    expect(creationEntries({ mobile: true }).map((entry) => entry.kind)).toEqual(["publication", "actu", "evenement", "conference"])
    expect(creationEntries({ mobile: true }).map((entry) => t(entry.labelKey))).toEqual(["Publication", "Actu", "Évènement", "Conférence"])
  })

  it("s'en tient au geste permanent au bureau", () => {
    // La barre d'identité épinglée le porte déjà ; l'actu a la vignette
    // « Créer » de sa rangée, l'évènement a son volet. Deux portes pour une
    // même carte, à trente pixels d'écart, se lisent comme deux objets.
    expect(creationEntries().map((entry) => entry.kind)).toEqual(["publication", "conference"])
    expect(creationEntries({ mobile: false }).map((entry) => entry.kind)).toEqual(["publication", "conference"])
  })

  it("offre la conférence aux deux coquilles depuis F3a", () => {
    for (const mobile of [true, false]) {
      for (const context of [{}, AVEC_HANDLE]) {
        const kinds = creationEntries({ mobile, ...context }).map((entry) => entry.kind as string)
        expect(kinds).toContain("conference")
      }
    }
  })

  it("n'offre AUCUN album à qui n'a pas de profil public", () => {
    // Un album vit sur le profil public de son auteur : sans handle, il n'y a
    // pas d'adresse où le poser. Une entrée qui ne mène à rien est un 404
    // déguisé.
    for (const mobile of [true, false]) {
      for (const context of [{}, { handle: null }, { handle: "   " }]) {
        const kinds = creationEntries({ mobile, ...context }).map((entry) => entry.kind as string)
        expect(kinds).not.toContain("album")
      }
    }
  })

  it("offre l'album aux DEUX coquilles dès qu'un handle est connu (R-09)", () => {
    // Contrairement à l'actu (vignette de la rangée) et à l'évènement (son
    // volet), l'album n'a AUCUNE autre porte : il doit donc figurer au bureau
    // comme au téléphone, et en DERNIER — l'ordre est lu tel quel par la carte.
    expect(creationEntries({ ...AVEC_HANDLE }).map((e) => e.kind)).toEqual(["publication", "conference", "album"])
    expect(creationEntries({ mobile: true, ...AVEC_HANDLE }).map((e) => e.kind)).toEqual([
      "publication",
      "actu",
      "evenement",
      "conference",
      "album",
    ])
    expect(t(creationEntry("album").labelKey)).toBe("Album")
  })

  it("« Mon activité » ferme la liste quand l'application sert la gestion des activités, et y mène", () => {
    expect(creationEntries({ mobile: true, activity: true }).map((e) => e.kind)).toEqual(["publication", "actu", "evenement", "conference", "activite"])
    expect(creationEntries({ mobile: true }).map((e) => e.kind)).not.toContain("activite")
    expect(t(creationEntry("activite").labelKey)).toBe("Mon activité")
    const home = () => "/reseau-test"
    const profile = (handle: string) => `/personne/${handle}`
    expect(creationLaunchFor("activite", {}, { home, profile, myActivity: () => "/mes-activites-test" })).toEqual({ action: "navigate", href: "/mes-activites-test" })
    // Sans espace de gestion servi, le geste ne mène jamais à une adresse inventée.
    expect(creationLaunchFor("activite", {}, { home, profile })).toEqual({ action: "navigate", href: "/reseau-test" })
  })

  it("décrit et illustre chaque entrée — un choix ne se devine pas", () => {
    for (const entry of creationEntries({ mobile: true, ...AVEC_HANDLE })) {
      const label = t(entry.labelKey)
      const description = t(entry.descriptionKey)
      expect(label.length).toBeGreaterThan(0)
      expect(description.length).toBeGreaterThan(0)
      // Une clé absente se rendrait elle-même.
      expect(label).not.toBe(entry.labelKey.replace(/^reseau:/, ""))
      expect(description).not.toBe(entry.descriptionKey.replace(/^reseau:/, ""))
      expect(entry.icon.length).toBeGreaterThan(0)
    }
  })

  it("ne propose jamais deux fois le même format", () => {
    for (const mobile of [true, false]) {
      const kinds = creationEntries({ mobile }).map((entry) => entry.kind)
      expect(new Set(kinds).size).toBe(kinds.length)
    }
  })

  it("rend une liste NEUVE — la carte ne peut pas figer le catalogue", () => {
    const first = creationEntries({ mobile: true })
    first.pop()
    expect(creationEntries({ mobile: true })).toHaveLength(4)
  })

  it("le catalogue du bureau est inclus dans celui du téléphone", () => {
    for (const context of [{}, AVEC_HANDLE]) {
      const mobile = creationEntries({ mobile: true, ...context }).map((entry) => entry.kind)
      for (const entry of creationEntries({ ...context })) {
        expect(mobile).toContain(entry.kind)
      }
    }
  })
})

describe("creationSurfaceFor", () => {
  it("donne à chaque format UNE surface, et une seule", () => {
    expect(creationSurfaceFor("publication")).toBe("post_composer")
    expect(creationSurfaceFor("actu")).toBe("story_composer")
    expect(creationSurfaceFor("evenement")).toBe("events_route")
    expect(creationSurfaceFor("album")).toBe("profil_albums_route")
    expect(creationSurfaceFor("conference")).toBe("direct_dialog")
  })

  it("donne à chaque format une surface DISTINCTE", () => {
    const surfaces = TOUS.map((kind) => creationSurfaceFor(kind))
    expect(new Set(surfaces).size).toBe(TOUS.length)
  })
})

describe("creationLaunchFor — ouvrir en place, ou naviguer", () => {
  it("ouvre une surface EN PLACE pour les deux formats qui en ont une", () => {
    for (const kind of ["publication", "actu", "conference"] as const) {
      expect(creationLaunchFor(kind, {}, ROUTES)).toEqual({ action: "surface", kind })
    }
  })

  it("mène l'évènement au volet Évènements de la page réseau, carte de création ouverte", () => {
    expect(creationLaunchFor("evenement", {}, ROUTES)).toEqual({
      action: "navigate",
      href: creationEventHref(ROUTES.home()),
    })
    expect(creationEventHref(ROUTES.home())).toBe("/fil?tab=evenements&nouveau=evenement")
  })

  it("couvre les quatre formats sans jamais rendre `undefined`", () => {
    for (const kind of TOUS) {
      for (const context of [{}, AVEC_HANDLE]) {
        const launch = creationLaunchFor(kind, context, ROUTES)
        expect(launch.action === "surface" || launch.action === "navigate").toBe(true)
      }
    }
  })

  it("l'album emmène sur l'ONGLET Albums du profil, avec l'intention (R-09)", () => {
    expect(creationLaunchFor("album", AVEC_HANDLE, ROUTES)).toEqual({
      action: "navigate",
      href: `${ROUTES.profile("m.ndong")}?onglet=albums&nouveau=1`,
    })
  })

  it("encode l'identifiant dans l'adresse d'album — il ne sort pas de son segment", () => {
    const launch = creationLaunchFor("album", { handle: "a/b" }, ROUTES)
    expect(launch).toEqual({ action: "navigate", href: `${ROUTES.profile("a%2Fb")}?onglet=albums&nouveau=1` })
  })

  it("sans handle, l'album renvoie à la page réseau — jamais vers une adresse fausse", () => {
    // Le format n'est alors pas offert (`creationEntries`) ; ce repli n'existe
    // que pour n'avoir aucun chemin qui fabrique un profil sans identifiant.
    for (const context of [{}, { handle: null }, { handle: " " }]) {
      expect(creationLaunchFor("album", context, ROUTES)).toEqual({ action: "navigate", href: ROUTES.home() })
    }
  })

  it("l'album ne passe JAMAIS par une surface en place", () => {
    // Les deux coquilles déduisent `launch.kind` de `action !== "navigate"` :
    // un album rendu en « surface » ouvrirait le composeur de publication.
    for (const context of [{}, AVEC_HANDLE, { handle: null }]) {
      expect(creationLaunchFor("album", context, ROUTES).action).toBe("navigate")
    }
  })

  it("n'écrit aucune adresse : tout vient des routes injectées", () => {
    const autres: CreationRoutes = { home: () => "/reseau/accueil", profile: (handle) => `/p/${handle}` }
    expect(creationLaunchFor("evenement", {}, autres)).toEqual({ action: "navigate", href: `${autres.home()}?tab=evenements&nouveau=evenement` })
    expect(creationLaunchFor("album", AVEC_HANDLE, autres)).toEqual({ action: "navigate", href: `${autres.profile("m.ndong")}?onglet=albums&nouveau=1` })
  })
})

describe("creationEntry", () => {
  it("nomme un format hors de la carte de choix", () => {
    for (const kind of TOUS) {
      expect(creationEntry(kind).kind).toBe(kind)
    }
  })
})
