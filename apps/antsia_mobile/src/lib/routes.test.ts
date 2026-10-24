import { describe, expect, it } from "vitest"
import { nativeRouteFromUrl, nativeWebRoutes, pushNativeRoute, nativeTab, type NativeRoute } from "./routes"

describe("native routes", () => {
  it("requires the exact configured scheme and a closed reference path", () => {
    expect(nativeRouteFromUrl("owned-antsia://fil", "owned-antsia")).toEqual({ name: "feed" })
    expect(nativeRouteFromUrl("other://fil", "owned-antsia")).toBe(null)
    expect(nativeRouteFromUrl("owned-antsia://fil?token=private", "owned-antsia")).toBe(null)
    expect(nativeRouteFromUrl("owned-antsia://appel/aaaaaaaaaaaaaaaa", "owned-antsia")).toBe(null)
    expect(nativeRouteFromUrl("owned-antsia://conversation/aaaaaaaaaaaaaaaa", null)).toBe(null)
  })
})

describe("native web routes", () => {
  const origin = "https://site.example"
  it("preserves production routes without a base path", () => {
    expect(nativeWebRoutes.enter(origin)).toBe(`${origin}/entrer`)
    expect(nativeWebRoutes.enter(origin, "")).toBe(`${origin}/entrer`)
    expect(nativeWebRoutes.profile(origin, "person.demo")).toBe(`${origin}/@person.demo`)
  })
  it("keeps entry and encoded profile links under the demo path", () => {
    expect(nativeWebRoutes.enter(origin, "/demo")).toBe(`${origin}/demo/entrer`)
    expect(nativeWebRoutes.profile(origin, "person/demo?other=1#fragment", "/demo")).toBe(`${origin}/demo/@person%2Fdemo%3Fother%3D1%23fragment`)
  })
  it.each(["/", "/demo/", "//other.example", "/demo/..", "/%64emo", "/demo?other=1", "/demo#fragment"])("rejects a runtime base path instead of escaping to the root: %s", (basePath) => {
    const invalid = basePath as "/demo"
    expect(() => nativeWebRoutes.enter(origin, invalid)).toThrow("nativeWebBasePathInvalid")
    expect(() => nativeWebRoutes.profile(origin, "person.demo", invalid)).toThrow("nativeWebBasePathInvalid")
  })
})


describe("member navigation history", () => {
  it("returns from an offer to its real originating page without manufacturing a feed route", () => {
    const history: NativeRoute[] = [{ name: "explore" }, { name: "page", handle: "association.demo" }]
    const next = pushNativeRoute(history, { name: "offer", handle: "shop.demo", offerRef: "service" })
    expect(next.slice(0, -1)).toEqual(history)
    expect(nativeTab(next[2]!)).toBe("explore")
  })
  it("bounds history and ignores duplicate navigation", () => {
    let history: NativeRoute[] = [{ name: "feed" }]
    for (let i = 0; i < 30; i++) history = pushNativeRoute(history, { name: "post", id: String(i) })
    expect(history).toHaveLength(20)
    expect(pushNativeRoute(history, history[19]!)).toBe(history)
  })
  it("encodes server references and retains the demo origin for Web continuation", () => {
    expect(nativeWebRoutes.offer("https://site.example", "shop/x", "offer?x", "/demo")).toBe("https://site.example/demo/boutique/shop%2Fx/offres/offer%3Fx")
    expect(nativeWebRoutes.page("https://site.example", "page/x", "/demo")).toBe("https://site.example/demo/page/page%2Fx")
  })
})
