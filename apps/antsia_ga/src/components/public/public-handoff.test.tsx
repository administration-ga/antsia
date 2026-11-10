// @vitest-environment jsdom
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ status: "member", replace: vi.fn() }))
vi.mock("@/components/providers", () => ({ SessionProviders: ({ children }: { children: ReactNode }) => children }))
vi.mock("@/components/use-session-state", () => ({ useSessionState: () => ({ status: mocks.status }) }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { PublicHandoff } from "./public-handoff"

let root: Root | undefined
let host: HTMLDivElement

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("location", { ...window.location, replace: mocks.replace })
  vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "/demo")
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://vivid-hedgehog-655.convex.cloud")
  mocks.status = "member"
  mocks.replace.mockReset()
  host = document.createElement("div")
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("retour public dans la même zone d'application", () => {
  it.each([
    ["member", "/fil"],
    ["welcome", "/bienvenue"],
    ["restricted", "/mes-donnees"],
  ])("une session %s reste dans le build démo", async (status, destination) => {
    mocks.status = status
    await act(async () => root!.render(<PublicHandoff />))
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(`/demo${destination}`)
  })

  it("conserve l'adresse du fil du build principal", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://diligent-avocet-585.convex.cloud")
    await act(async () => root!.render(<PublicHandoff />))
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/fil")
  })

  it.each(["signedOut", "rootMissing"])("un retour %s ne lance aucune navigation", async (status) => {
    mocks.status = status
    await act(async () => root!.render(<PublicHandoff />))
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
  })
})
