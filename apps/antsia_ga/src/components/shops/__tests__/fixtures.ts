import type { ShopEditorData, StorefrontData } from "../shop-model"

export function editorFixture(): ShopEditorData {
  return {
    shopId: "shops_fixture" as ShopEditorData["shopId"], role: "owner", model: "products", name: "Atelier des rives", description: "Une activité réelle à présenter.", specialty: null, serviceArea: null, hours: null, dailySpecial: null,
    logo: { present: false, url: null, withheld: null }, page: null,
    storefront: { state: "draft", decisionReason: null, requestedAt: null, publishedAt: null }, policy: "review",
    publication: { outcome: "queue", gaps: [], requestable: true },
    audience: { visibility: "network", rootNetwork: true, publicListing: false, consentedAt: null, consentTextVersion: null, currentTextVersion: "2026-10-18", publicNow: false },
    blocks: [{ id: "catalog", state: "awaiting_pro_link" }, { id: "publications", state: "awaiting_page" }, { id: "about", state: "active" }],
    capabilities: { draft: true, storefront: false, contact: false, catalog: false, quote: false, booking: false, jobs: false, purchase: false },
    checkout: { available: false, missing: ["pro_link", "pro_catalog", "seller_admission", "payment_provider"] }, updatedAt: 1,
  }
}
export function storefrontFixture(): StorefrontData {
  return { pageId: "pages_fixture" as StorefrontData["pageId"], handle: "atelier", name: "Atelier des rives", description: "Une présentation autorisée.", logoUrl: null, bannerUrl: null, model: "products", specialty: "Couture", serviceArea: "Libreville", hours: null, dailySpecial: null, badge: "community", blocks: ["about"], publishedAt: 1, publicListing: false, viewer: { following: false, manages: false } }
}
