/** CM-09 : tri d'une page de favoris et textes des refus du moteur, sans composant. */
import { ConvexError } from "convex/values"
import { describe, expect, it } from "vitest"

import type { CatalogOffer } from "./catalog-model"
import { savedOfferErrorText, splitSavedOffers, type SavedOfferEntry } from "./saved-offer-model"

const t = (key: string, options?: Record<string, unknown>) => options ? `${key}:${JSON.stringify(options)}` : key
const offer = { offerRef: "demo:offer:riz-parfume", shopHandle: "epicerie-moussavou-demo", title: "Riz parfumé — Démo" } as CatalogOffer

describe("CM-09 — Mes favoris, hors composant", () => {
  it("garde l'ordre du moteur et compte les offres qui ne se lisent plus sans rien en garder", () => {
    const entries: SavedOfferEntry[] = [
      { kind: "unavailable", savedAt: 3 },
      { kind: "offer", savedAt: 2, offer },
      { kind: "unavailable", savedAt: 1 },
    ]
    expect(splitSavedOffers(entries)).toEqual({ offers: [offer], unavailable: 2 })
    expect(splitSavedOffers([])).toEqual({ offers: [], unavailable: 0 })
  })

  it("dit le quota avec sa borne, l'offre indisponible, le débit, sinon un échec générique", () => {
    expect(savedOfferErrorText(new ConvexError({ code: "policyRefused", appRule: "saved_offer_quota", appParams: { max: 200 } }), t)).toBe('saved.errors.saved_offer_quota:{"max":200}')
    expect(savedOfferErrorText(new ConvexError({ code: "notFound" }), t)).toBe("saved.errors.notFound")
    expect(savedOfferErrorText(new ConvexError({ code: "rateLimited", retryAfterMs: 1000 }), t)).toBe("errors:rateLimited")
    expect(savedOfferErrorText(new ConvexError({ code: "policyRefused", appRule: "shop_draft_quota", appParams: { max: 3 } }), t)).toBe("saved.errors.failed")
    expect(savedOfferErrorText(new Error("réseau coupé"), t)).toBe("saved.errors.failed")
  })
})
