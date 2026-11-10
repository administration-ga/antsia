import { afterEach, describe, expect, it, vi } from "vitest"
import { DEMO_BACKEND_HOST } from "./demo-backend"

import { appBasePath } from "./app-path"
import { DEMO_BANNER_HEIGHT_PROPERTY, demoEntryEnabled, demoWorkspaceHeight } from "./demo-embed"

afterEach(() => vi.unstubAllEnvs())

describe("entrée publique de démonstration", () => {
  it("reste fermée sans déclaration explicite", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_ENTRY_ENABLED", undefined)
    expect(demoEntryEnabled()).toBe(false)
  })

  it.each(["", "false", "TRUE", "True", "1", " true", "true ", "true/", "/demo"])("refuse une bascule non exacte : %j", (flag) => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_ENTRY_ENABLED", flag)
    expect(demoEntryEnabled()).toBe(false)
  })

  it("la seule valeur true active le lien, sans changer le backend ni le mode de l'application", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_ENTRY_ENABLED", "true")
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "")
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://exemple-production.convex.cloud")
    expect(demoEntryEnabled()).toBe(true)
    expect(appBasePath()).toBe("")
  })

  it.each(["http://127.0.0.1:3210", "https://exemple-production.convex.cloud", `https://${DEMO_BACKEND_HOST}`])("le flag d'entrée ne déclare pas à lui seul le build enfant sur %s", (backend) => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_ENTRY_ENABLED", "true")
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", backend)
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "")
    expect(demoEntryEnabled()).toBe(true)
    expect(appBasePath()).toBe("")
  })

  it("le build démo conserve son double accord chemin et backend", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "/demo")
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", `https://${DEMO_BACKEND_HOST}`)
    vi.stubEnv("NEXT_PUBLIC_DEMO_ENTRY_ENABLED", "false")
    expect(appBasePath()).toBe("/demo")
    expect(demoEntryEnabled()).toBe(false)
  })
})

describe("hauteur du workspace avec la notice démo", () => {
  it("ne modifie pas la hauteur du site principal", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "")
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://exemple-production.convex.cloud")
    expect(demoWorkspaceHeight()).toBeUndefined()
  })

  it("conserve toute la hauteur dans le build démo exact", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "/demo")
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", `https://${DEMO_BACKEND_HOST}`)
    expect(DEMO_BANNER_HEIGHT_PROPERTY).toBe("--antsia-demo-banner-height")
    expect(demoWorkspaceHeight()).toBe("100dvh")
  })

  it.each([
    ["/demo/", `https://${DEMO_BACKEND_HOST}`],
    ["/demo", "https://exemple-production.convex.cloud"],
    ["/demo", `https://${DEMO_BACKEND_HOST}/`],
    ["/demo", `https://${DEMO_BACKEND_HOST}:443`],
    ["/demo", `https://${DEMO_BACKEND_HOST}.evil.test`],
    ["/demo", "http://localhost:3210"],
  ])("reste sans effet pour une configuration refusée (%s, %s)", (basePath, backend) => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", basePath)
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", backend)
    expect(demoWorkspaceHeight()).toBeUndefined()
  })
})
