import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const primary = {
  EXPO_PUBLIC_CONVEX_URL: "https://production-engine.example.test",
  EXPO_PUBLIC_CONVEX_SITE_URL: "https://production-auth.example.test",
  EXPO_PUBLIC_SITE_URL: "https://antsia.example.test",
}
const demo = {
  EXPO_PUBLIC_DEMO_CONVEX_URL: "https://demo-engine.example.test",
  EXPO_PUBLIC_DEMO_CONVEX_SITE_URL: "https://demo-auth.example.test",
  EXPO_PUBLIC_DEMO_SITE_URL: primary.EXPO_PUBLIC_SITE_URL,
}
const configure = async (values: Record<string, string> = {}) => {
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value)
  return (await import("./app.config")).default
}

beforeEach(() => {
  vi.resetModules()
  for (const key of [...Object.keys(primary), ...Object.keys(demo), "NATIVE_RELEASE_BUILD", "EXPO_PUBLIC_ALLOW_LOCAL_HTTP", "NATIVE_CALLS_ENABLED"]) vi.stubEnv(key, undefined)
})
afterEach(() => vi.unstubAllEnvs())

describe("phone build environment isolation", () => {
  it("keeps a production-only build possible without adding demo configuration", async () => {
    expect((await configure({ ...primary, NATIVE_RELEASE_BUILD: "true" })).updates?.enabled).toBe(false)
  })
  it("accepts the explicit separate demo backend and shared Web origin", async () => {
    expect((await configure({ ...primary, ...demo, NATIVE_RELEASE_BUILD: "true" })).ios?.bundleIdentifier).toBe("ga.antsia.mobile")
  })
  it("refuses a partially configured demo instead of producing an unusable selector", async () => {
    await expect(configure({ ...primary, EXPO_PUBLIC_DEMO_CONVEX_URL: demo.EXPO_PUBLIC_DEMO_CONVEX_URL })).rejects.toThrow("explicit HTTPS origin")
  })
  it.each([
    { EXPO_PUBLIC_DEMO_CONVEX_URL: primary.EXPO_PUBLIC_CONVEX_URL },
    { EXPO_PUBLIC_DEMO_CONVEX_SITE_URL: primary.EXPO_PUBLIC_CONVEX_URL },
    { EXPO_PUBLIC_DEMO_CONVEX_URL: primary.EXPO_PUBLIC_SITE_URL },
    { EXPO_PUBLIC_DEMO_SITE_URL: "https://unrelated.example.test" },
  ])("refuses crossed production/demo origins: %o", async crossed => {
    await expect(configure({ ...primary, ...demo, ...crossed })).rejects.toThrow("must be isolated")
  })
  it.each(["http://localhost:3260", "https://demo-auth.example.test/api/auth", "https://user:pass@demo-auth.example.test", "https://demo-auth.example.test?token=public"])("refuses a non-origin demo auth address %s", async address => {
    await expect(configure({ ...primary, ...demo, EXPO_PUBLIC_DEMO_CONVEX_SITE_URL: address })).rejects.toThrow("explicit HTTPS origin")
  })
})

describe("application icon", () => {
  it("declares an opaque 1024 px logo instead of the blank Expo template icon", async () => {
    const icon = (await configure()).icon
    expect(icon).toBe("./assets/app-icon.png")
    const png = readFileSync(new URL(`${icon}`, import.meta.url))
    // En-tête IHDR : largeur, hauteur, puis type de couleur 2 (RGB sans alpha, exigé par Apple).
    expect([png.readUInt32BE(16), png.readUInt32BE(20), png[25]]).toEqual([1024, 1024, 2])
    // Une image unie se comprime en quelques Ko : c'est le défaut des builds 2 à 12.
    expect(png.length).toBeGreaterThan(10_000)
  })
})
