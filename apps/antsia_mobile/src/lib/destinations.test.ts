import { describe, expect, it } from "vitest"
import { nativeEnvironment } from "@antsia/social-native/environment"
import { nativeDestinations } from "./destinations"

const production = { convexUrl: "https://production-engine.example", authUrl: "https://production-auth.example", webUrl: "https://site.example", scheme: "antsia-owned", development: false }
const demo = { convexUrl: "https://demo-engine.example", authUrl: "https://demo-auth.example", webUrl: production.webUrl, scheme: production.scheme, development: false }

describe("native destinations", () => {
  it("preserves production without enabling an implicit demo destination", () => {
    expect(nativeDestinations({ production })).toEqual({ production: nativeEnvironment(production), demo: null })
  })
  it("isolates both demo backend origins and disables production callbacks and deep links", () => {
    expect(nativeDestinations({ production, demo })).toEqual({
      production: nativeEnvironment(production),
      demo: { convexUrl: demo.convexUrl, authUrl: demo.authUrl, webUrl: production.webUrl, webBasePath: "/demo", scheme: null },
    })
  })
  it("requires a valid production destination before admitting demo", () => {
    expect(nativeDestinations({ production: { development: false }, demo })).toEqual({ production: null, demo: null })
  })
  it.each(["convexUrl", "authUrl", "webUrl"] as const)("requires the explicit demo %s", (key) => {
    expect(nativeDestinations({ production, demo: { ...demo, [key]: undefined } })).toEqual({ production: nativeEnvironment(production), demo: null })
  })
  it.each(["convexUrl", "authUrl"] as const)("rejects production, swapped or public-web origins in demo %s", (key) => {
    for (const origin of [production.convexUrl, production.authUrl, production.webUrl]) {
      expect(nativeDestinations({ production, demo: { ...demo, [key]: origin } }).demo).toBe(null)
    }
  })
  it("requires the same public web origin while preserving its demo base path", () => {
    expect(nativeDestinations({ production, demo: { ...demo, webUrl: "https://other-site.example" } }).demo).toBe(null)
    expect(nativeDestinations({ production, demo: { ...demo, webUrl: `${production.webUrl}/demo` } }).demo).toBe(null)
    expect(nativeDestinations({ production, demo: { ...demo, webBasePath: "/demo/.." } }).demo).toBe(null)
    expect(nativeDestinations({ production, demo: { ...demo, webBasePath: "/demo" } }).demo?.webBasePath).toBe("/demo")
  })
  it("compares canonical origins rather than different URL spellings", () => {
    expect(nativeDestinations({ production, demo: { ...demo, convexUrl: "https://PRODUCTION-ENGINE.example:443/" } }).demo).toBe(null)
    expect(nativeDestinations({ production, demo: { ...demo, webUrl: "https://SITE.example:443/" } }).demo?.webUrl).toBe(production.webUrl)
  })
  it("rejects HTTP release origins even when local HTTP is requested", () => {
    const local = { ...production, convexUrl: "http://127.0.0.1:3210", allowLocalHttp: "true" }
    expect(nativeDestinations({ production: local, demo })).toEqual({ production: null, demo: null })
    expect(nativeDestinations({ production, demo: { ...demo, authUrl: "http://127.0.0.1:3211", allowLocalHttp: "true" } }).demo).toBe(null)
  })
})
