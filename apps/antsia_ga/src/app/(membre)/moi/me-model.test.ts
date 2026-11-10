import { reseauAgentHref } from "@antsia/social-features/shell/reseau-agent-nav"
import { describe, expect, it } from "vitest"

import { engineRoutes, routes } from "@/lib/routes"
import { meActivityEntries, meEntries, meEntriesIn, RESERVED_ME_ENTRIES } from "./me-model"

describe("Profil — ce que la destination regroupe (P02)", () => {
  it("sépare le raccourci vers le mur des outils personnels sans retirer d'activité", () => {
    const all = meEntriesIn("activity", "awa.ndong")
    expect(meActivityEntries("awa.ndong")).toEqual(all.filter((entry) => entry.id !== "profile"))
    expect(meActivityEntries(null)).toEqual(meEntriesIn("activity", null))
    expect(meActivityEntries("awa.ndong").map((entry) => entry.href)).toContain(routes.purchases())
  })
  it("mon profil public, mes signets, mes actus, mon fil, la modération, mes données — dans cet ordre", () => {
    expect(meEntries("awa.ndong").map((entry) => [entry.id, entry.href])).toEqual([
      ["profile", routes.profile("awa.ndong")],
      ["enregistrements", reseauAgentHref("enregistrements", routes.feed())],
      ["stories", routes.stories()],
      ["shop", routes.myShops()],
      ["cart", routes.cart()],
      ["purchases", routes.purchases()],
      ["checkoutPreparations", routes.myOrders()],
      ["payments", routes.paymentList()],
      ["serviceRequests", routes.serviceRequests()],
      ["applications", routes.myApplications()],
      ["settings", routes.settings()],
      ["feedPreferences", routes.feedPreferences()],
      ["moderation", routes.moderation()],
      ["personalData", routes.personalControls()],
    ])
  })

  it("« Mon fil » (préférences du fil) et les réglages du moteur y restent atteignables", () => {
    const hrefs = meEntries("awa.ndong").map((entry) => entry.href)
    expect(hrefs).toContain(routes.feedPreferences())
    expect(hrefs).toContain(engineRoutes.settings?.())
  })

  it("sans identifiant publié, aucune entrée vers un profil qui n'existe pas", () => {
    for (const handle of [null, "", "   "]) {
      const entries = meEntries(handle)
      expect(entries.map((entry) => entry.id)).not.toContain("profile")
      expect(entries).toHaveLength(13)
      expect(entries.find((entry) => entry.id === "shop")?.href).toBe(routes.myShops())
    }
  })

  it("range chaque entrée dans un des trois groupes, sans perte ni doublon", () => {
    const all = meEntries("awa.ndong")
    const grouped = [...meEntriesIn("activity", "awa.ndong"), ...meEntriesIn("preferences", "awa.ndong"), ...meEntriesIn("account", "awa.ndong")]
    expect(grouped.map((entry) => entry.id).sort()).toEqual(all.map((entry) => entry.id).sort())
    expect(new Set(all.map((entry) => entry.href)).size).toBe(all.length)
  })

  // P15 — écrit, non exécuté : Mes candidatures est servi depuis Profil, plus rien n'est réservé.
  it("sert boutique, panier, achats et Mes candidatures ; aucune entrée réservée", () => {
    expect(RESERVED_ME_ENTRIES).toEqual([])
    const entries = meEntries("awa.ndong"), ids = entries.map((entry) => entry.id)
    expect(ids).toContain("shop")
    expect(ids).toContain("cart")
    expect(ids).toContain("purchases")
    expect(entries.find((entry) => entry.id === "applications")).toMatchObject({ section: "activity", href: routes.myApplications(), labelKey: "jobs:applications.title" })
  })

  // P14 — écrit, non exécuté : Mes demandes (devis, rendez-vous, prestations) est servi depuis Profil.
  it("sert Mes demandes depuis Profil, dans l'activité", () => {
    const entries = meEntries("awa.ndong")
    expect(entries.find((entry) => entry.id === "serviceRequests")).toEqual({ id: "serviceRequests", section: "activity", href: routes.serviceRequests(), labelKey: "services:requests.title", descriptionKey: "services:requests.lead" })
    expect(meEntries(null).map((entry) => entry.id)).toContain("serviceRequests")
  })
})
