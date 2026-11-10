import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const harness = vi.hoisted(() => ({ initializedScope: "antsia" as string | null, initialize: vi.fn() }))

// Le paquet reste testé en node : le vrai fournisseur construit le contexte,
// mais l'effet et son état d'initialisation sont exercés sans navigateur réel.
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: <T,>(_initial: T | (() => T)) => [harness.initializedScope as T, harness.initialize] as const,
  useEffect: (effect: () => void | (() => void)) => { effect() },
}))

import type { Id } from "./engine"
import { NetworkProvider, useNetwork, type EngineRoutes } from "./network"

const routes: EngineRoutes = {
  home: () => "/fil", messages: () => "/messages", stories: () => "/actus",
  profile: handle => `/profil/${handle}`, page: handle => `/page/${handle}`,
  conference: sessionId => `/conference/${sessionId}`,
}
const namespace = "antsia-demo-scope:"

function Probe() { return <output>{useNetwork().storagePrefix}</output> }
function render(storageNamespace?: string) {
  return renderToStaticMarkup(
    <NetworkProvider networkId={"network-storage" as Id<"networks">} personId={"person-storage" as Id<"persons">}
      slug="antsia" storageNamespace={storageNamespace} charte="antsia" routes={routes}><Probe /></NetworkProvider>,
  )
}
function storage() {
  const data = new Map([["antia:antia:post-drafts:v1:person-real", "real draft"]])
  return {
    data, get length() { return data.size }, key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
  }
}

beforeEach(() => { harness.initializedScope = "antsia"; harness.initialize.mockClear() })
afterEach(() => vi.unstubAllGlobals())

describe("namespace de stockage du fournisseur réseau", () => {
  it.each([undefined, ""])("garde le préfixe et la migration historiques hors espace isolé (%s)", value => {
    const localStorage = storage(), sessionStorage = storage()
    vi.stubGlobal("window", { localStorage, sessionStorage })
    expect(render(value)).toBe("<output>antsia:antsia:</output>")
    for (const target of [localStorage, sessionStorage]) {
      expect(target.getItem("antsia:antsia:post-drafts:v1:person-real")).toBe("real draft")
      expect(target.getItem("antia:antia:post-drafts:v1:person-real")).toBe("real draft")
    }
    expect(harness.initialize).toHaveBeenCalledWith("antsia")
  })

  it("ne consulte ni ne migre les stockages du vrai réseau avec un namespace", () => {
    const storageAccess = vi.fn(() => { throw new Error("Le stockage réel est interdit") })
    vi.stubGlobal("window", { get localStorage() { return storageAccess() }, get sessionStorage() { return storageAccess() } })
    harness.initializedScope = `${namespace}antsia`
    expect(render(namespace)).toBe(`<output>${namespace}antsia:antsia:</output>`)
    expect(storageAccess).not.toHaveBeenCalled()
    expect(harness.initialize).toHaveBeenCalledWith(`${namespace}antsia`)
  })

  it("retient les enfants tant que le nouveau scope n'est pas initialisé", () => {
    vi.stubGlobal("window", {})
    expect(render(namespace)).toBe("")
    expect(harness.initialize).toHaveBeenCalledWith(`${namespace}antsia`)
    harness.initializedScope = `${namespace}antsia`
    expect(render(namespace)).toContain(`${namespace}antsia:antsia:`)
    expect(render()).toBe("")
    expect(harness.initialize).toHaveBeenLastCalledWith("antsia")
  })
})
