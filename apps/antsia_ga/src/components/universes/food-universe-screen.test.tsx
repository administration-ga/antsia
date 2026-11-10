import { describe, expect, it } from "vitest"

import type { ShowcaseStorefront } from "@/components/marketplace/shop-showcase-card"
import { memberDestinationFor, routes } from "@/lib/routes"
import { foodStorefronts, todaysSpecials } from "./food-universe-screen"

const storefront = (handle: string, template: ShowcaseStorefront["template"], model: ShowcaseStorefront["model"] = "products"): ShowcaseStorefront => ({
  handle, name: handle, logoUrl: null, bannerUrl: null, model, template, specialty: null, serviceArea: null, hours: null, dailySpecial: null, badge: "community", publishedAt: 1,
})

describe("Univers « Alimentation et restauration »", () => {
  it("ne garde que les vitrines au gabarit d'alimentation, jamais la mode ni les prestataires", () => {
    const page = [storefront("epicerie", "food"), storefront("mode", "fashion"), storefront("atelier", "local", "quote_services"), storefront("traiteur", "food")]
    expect(foodStorefronts(page).map(item => item.handle)).toEqual(["epicerie", "traiteur"])
  })

  it("rassemble les plats du jour annoncés aujourd'hui (Libreville), jamais ceux d'un autre jour", () => {
    const now = Date.UTC(2026, 9, 23, 9)
    const page = [
      { ...storefront("epicerie", "food"), name: "Épicerie MOUSSAVOU", dailySpecial: { offerRef: "offre:poulet", day: "2026-10-23" } },
      { ...storefront("traiteur", "food"), dailySpecial: { offerRef: "offre:hier", day: "2026-10-22" } },
      storefront("cantine", "food"),
    ]
    expect(todaysSpecials(page, now)).toEqual([{ handle: "epicerie", shopName: "Épicerie MOUSSAVOU", offerRef: "offre:poulet" }])
    // À 23 h 30 UTC, il est déjà demain à Libreville.
    expect(todaysSpecials(page, Date.UTC(2026, 9, 23, 23, 30))).toEqual([])
  })

  it("a sa propre adresse, rangée sous Découvrir comme la marketplace", () => {
    expect(routes.foodUniverse()).toBe("/restauration")
    expect(memberDestinationFor(routes.foodUniverse(), new URLSearchParams())).toEqual({ id: "decouvrir", current: "section" })
  })
})
