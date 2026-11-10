import { describe, expect, it } from "vitest"
import { nativeBusinessAdvance, nativeBusinessCanAdvance, nativeBusinessContactAllowed, nativeBusinessMediaUrl, nativeBusinessMoney, nativeBusinessOfferTarget, nativeBusinessPrevious, nativeBusinessPrice, nativeBusinessQuery, type NativeBusinessOffer } from "./native-business"

const t = (key: string) => ({ "mobile.business.priceQuote": "Sur devis", "mobile.business.priceUnavailable": "Indisponible", "mobile.business.priceUnit": "{{amount}} / {{unit}}", "mobile.business.priceRange": "{{min}} à {{max}}" })[key] ?? key
const offerRef = "pro.ga:offer:01J6KD7E8T9W2X3Y4Z5H6K7M8N"
describe("native business contracts", () => {
  it("keeps offer references opaque and rejects route confusion", () => {
    expect(nativeBusinessOfferTarget("atelier-demo", offerRef)).toEqual({ handle: "atelier-demo", offerRef })
    expect(nativeBusinessOfferTarget("atelier-demo", "demo:offer:photo-portrait")).toEqual({ handle: "atelier-demo", offerRef: "demo:offer:photo-portrait" })
    for (const ref of ["offer-id", offerRef.replace(":offer:", ":page:"), "demo:offer:../other", "demo:offer:x?next=y", "https://example.test/offer"]) expect(nativeBusinessOfferTarget("atelier-demo", ref)).toBeNull()
    for (const handle of ["../atelier", "atelier/x", "@atelier", "atelier?x", ""]) expect(nativeBusinessOfferTarget(handle, offerRef)).toBeNull()
  })
  it("formats francs without a cents conversion and preserves price modes", () => {
    expect(nativeBusinessPrice({ mode: "fixed", currency: "XAF", amount: 1500 }, "fr", t)).toBe(nativeBusinessMoney(1500, "fr"))
    expect(nativeBusinessPrice({ mode: "quote", currency: "XAF" }, "fr", t)).toBe("Sur devis")
    expect(nativeBusinessPrice({ mode: "unit", currency: "XAF", amount: 2000, unit: "image" }, "fr", t)).toContain(" / image")
    expect(nativeBusinessPrice({ mode: "range", currency: "XAF", minAmount: 1000, maxAmount: 2000 }, "fr", t)).toContain(" à ")
    expect(nativeBusinessPrice({ mode: "range", currency: "XAF", minAmount: 2000, maxAmount: 1000 }, "fr", t)).toBe("Indisponible")
    for (const amount of [-1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) expect(nativeBusinessMoney(amount, "fr")).toBeNull()
  })
  it("continues filtered empty windows but refuses loops, end markers and excess windows", () => {
    expect(nativeBusinessCanAdvance([null], "filtered-empty", false)).toBe(true)
    expect(nativeBusinessCanAdvance([null, "same"], "same")).toBe(false)
    expect(nativeBusinessCanAdvance([null], "next", true)).toBe(false)
    expect(nativeBusinessCanAdvance([null], "")).toBe(false)
    expect(nativeBusinessCanAdvance([null, "1", "2", "3", "4"], "5")).toBe(false)
    expect(nativeBusinessCanAdvance([null], { publishedAt: 4, postId: "p", generation: 2 })).toBe(true)
  })
  it("rechecks queued gestures against their pending state and keeps the first page mounted", () => {
    const first: (string | null)[] = [null]
    // Both event handlers saw the same render and queued its next cursor before React flushed state.
    const next = "opaque-next", updates = [next, next]
    const advanced = updates.reduce((previous, cursor) => nativeBusinessAdvance(previous, cursor), first)
    expect(advanced).toEqual([null, next])
    expect(nativeBusinessAdvance(advanced, next)).toBe(advanced)
    expect(nativeBusinessAdvance(first, "end", true)).toBe(first)
    const full = [null, "1", "2", "3", "4"]
    expect(nativeBusinessAdvance(full, "5")).toBe(full)
    const back = [0, 1].reduce(previous => nativeBusinessPrevious(previous), advanced)
    expect(back).toEqual([null])
    expect(nativeBusinessPrevious(back)).toBe(back)
  })
  it("resolves only the explicit public demo asset namespace", () => {
    expect(nativeBusinessMediaUrl("/demo-media/catalog/photo-portrait.jpg", "https://example.test")).toBe("https://example.test/demo-media/catalog/photo-portrait.jpg")
    expect(nativeBusinessMediaUrl("https://media.example.test/guarded?signature=opaque")).toBe("https://media.example.test/guarded?signature=opaque")
    for (const path of ["//evil.test/a.jpg", "/private/a.jpg", "/demo-media/../a.jpg", "/demo-media/catalog/a.jpg?token=x", "/demo-media/catalog/%2e%2e.jpg", "file:///a.jpg", "https://user:pass@example.test/a"]) expect(nativeBusinessMediaUrl(path, "https://example.test")).toBeNull()
    expect(nativeBusinessMediaUrl("/demo-media/catalog/a.jpg", "http://example.test")).toBeNull()
    expect(nativeBusinessMediaUrl("/demo-media/catalog/a.jpg", "https://example.test/demo")).toBeNull()
    expect(nativeBusinessMediaUrl("/demo-media/catalog/a.jpg")).toBeNull()
  })
  it("keeps demo operations closed even if an unexpected capability is true", () => {
    const live = { offerRef, actions: { contact: true, quote: false, purchase: false } } as Pick<NativeBusinessOffer, "offerRef" | "actions">
    expect(nativeBusinessContactAllowed(live, false)).toBe(true)
    expect(nativeBusinessContactAllowed(live, true)).toBe(false)
    expect(nativeBusinessContactAllowed({ ...live, offerRef: "demo:offer:portrait" }, false)).toBe(false)
    expect(nativeBusinessContactAllowed({ ...live, actions: { contact: false, quote: false, purchase: false } }, false)).toBe(false)
  })
  it("bounds search terms and rejects controls before a query is issued", () => {
    expect(nativeBusinessQuery("  réparation téléphone  ")).toBe("réparation téléphone")
    expect(nativeBusinessQuery("   ")).toBe("")
    for (const query of ["?", "x\ny", "x\u0085y", "x".repeat(121), Array.from({ length: 17 }, () => "mot").join(" ")]) expect(nativeBusinessQuery(query)).toBeNull()
  })
})
