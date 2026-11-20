// @vitest-environment jsdom
// PA6 : préférence explicite, suivi du système, isolement, synchronisation et continuité des enfants.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useEffect } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createMemoryStorage } from "../../tests/memory-storage"
import { AppearanceProvider, useOptionalAppearance } from "./provider"

const PREFIX = "antsia:test:"
const STORAGE_KEY = `${PREFIX}appearance`
let localStorage: Storage

function systemAppearance(initialDark: boolean) {
  let dark = initialDark
  const media = new EventTarget() as MediaQueryList
  Object.defineProperty(media, "matches", { get: () => dark })
  Object.defineProperty(media, "media", { value: "(prefers-color-scheme: dark)" })
  const addListener = vi.spyOn(media, "addEventListener")
  const removeListener = vi.spyOn(media, "removeEventListener")
  vi.stubGlobal("matchMedia", vi.fn(() => media))
  return {
    addListener,
    removeListener,
    change: (next: boolean) => {
      dark = next
      const event = new Event("change") as MediaQueryListEvent
      Object.defineProperty(event, "matches", { value: next })
      act(() => media.dispatchEvent(event))
    },
  }
}

function Probe() {
  const appearance = useOptionalAppearance()
  if (appearance === null) return null
  return (
    <>
      <output data-testid="mode">{appearance.mode}</output>
      <output data-testid="resolved">{appearance.resolvedAppearance}</output>
      <button onClick={() => appearance.setMode("light")}>Clair</button>
      <button onClick={() => appearance.setMode("dark")}>Sombre</button>
      <button onClick={() => appearance.setMode("system")}>Système</button>
    </>
  )
}

function assertAppearance(mode: string, resolved: string) {
  expect(screen.getByTestId("mode")).toHaveTextContent(mode)
  expect(screen.getByTestId("resolved")).toHaveTextContent(resolved)
  expect(document.documentElement.classList.contains("dark")).toBe(resolved === "dark")
  expect(document.documentElement.style.colorScheme).toBe(resolved)
}

beforeEach(() => {
  localStorage = createMemoryStorage()
  vi.stubGlobal("localStorage", localStorage)
  document.documentElement.classList.remove("dark")
  document.documentElement.style.removeProperty("color-scheme")
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("AppearanceProvider", () => {
  it("suit le système sans choix explicite et pose la charte sur html", () => {
    const system = systemAppearance(true)
    render(<AppearanceProvider storagePrefix={PREFIX}><Probe /></AppearanceProvider>)
    assertAppearance("system", "dark")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    system.change(false)
    assertAppearance("system", "light")
    system.change(true)
    assertAppearance("system", "dark")
  })

  it("conserve un choix explicite puis reprend la préférence système courante", () => {
    const system = systemAppearance(true)
    render(<AppearanceProvider storagePrefix={PREFIX}><Probe /></AppearanceProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Clair" }))
    assertAppearance("light", "light")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("light")
    system.change(false)
    system.change(true)
    assertAppearance("light", "light")
    fireEvent.click(screen.getByRole("button", { name: "Système" }))
    assertAppearance("system", "dark")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    system.change(false)
    assertAppearance("system", "light")
  })

  it("retrouve le choix enregistré au remontage sans toucher celui d'un autre réseau", () => {
    systemAppearance(false)
    const foreignKey = "antsia:diaspora-ga:appearance"
    window.localStorage.setItem(foreignKey, "light")
    const view = render(<AppearanceProvider storagePrefix={PREFIX}><Probe /></AppearanceProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Sombre" }))
    assertAppearance("dark", "dark")
    view.unmount()
    render(<AppearanceProvider storagePrefix={PREFIX}><Probe /></AppearanceProvider>)
    assertAppearance("dark", "dark")
    expect(window.localStorage.getItem(foreignKey)).toBe("light")
    expect(window.localStorage.getItem("theme")).toBeNull()
  })

  it("relit uniquement le préfixe courant quand le réseau change", () => {
    systemAppearance(false)
    window.localStorage.setItem(STORAGE_KEY, "dark")
    window.localStorage.setItem("antsia:other:appearance", "light")
    const view = render(<AppearanceProvider storagePrefix={PREFIX}><Probe /></AppearanceProvider>)
    assertAppearance("dark", "dark")
    view.rerender(<AppearanceProvider storagePrefix="antsia:other:"><Probe /></AppearanceProvider>)
    assertAppearance("light", "light")
    fireEvent.click(screen.getByRole("button", { name: "Système" }))
    expect(window.localStorage.getItem("antsia:other:appearance")).toBeNull()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("dark")
  })

  it("ignore une valeur enregistrée invalide et suit le système", () => {
    systemAppearance(true)
    window.localStorage.setItem(STORAGE_KEY, "unexpected")
    render(<AppearanceProvider storagePrefix={PREFIX}><Probe /></AppearanceProvider>)
    assertAppearance("system", "dark")
  })

  it("synchronise l'autre onglet sans accepter les clés étrangères ou les valeurs invalides", () => {
    systemAppearance(false)
    render(<AppearanceProvider storagePrefix={PREFIX}><Probe /></AppearanceProvider>)
    const storage = (key: string | null, newValue: string | null, storageArea: Storage = window.localStorage) => {
      const event = new Event("storage")
      Object.defineProperties(event, { key: { value: key }, newValue: { value: newValue }, storageArea: { value: storageArea } })
      act(() => window.dispatchEvent(event))
    }
    storage(STORAGE_KEY, "dark")
    assertAppearance("dark", "dark")
    storage("antsia:other:appearance", "light")
    storage(STORAGE_KEY, "unexpected")
    storage(STORAGE_KEY, "light", createMemoryStorage())
    assertAppearance("dark", "dark")
    storage(STORAGE_KEY, null)
    assertAppearance("system", "light")
    storage(STORAGE_KEY, "dark")
    storage(null, null)
    assertAppearance("system", "light")
  })

  it("permet les bascules et le retour système quand toute opération de stockage est refusée", () => {
    const system = systemAppearance(false)
    vi.spyOn(localStorage, "getItem").mockImplementation(() => { throw new Error("unavailable") })
    vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("unavailable") })
    vi.spyOn(localStorage, "removeItem").mockImplementation(() => { throw new Error("unavailable") })
    render(<AppearanceProvider storagePrefix={PREFIX}><Probe /></AppearanceProvider>)
    assertAppearance("system", "light")
    fireEvent.click(screen.getByRole("button", { name: "Sombre" }))
    assertAppearance("dark", "dark")
    system.change(true)
    fireEvent.click(screen.getByRole("button", { name: "Clair" }))
    assertAppearance("light", "light")
    fireEvent.click(screen.getByRole("button", { name: "Système" }))
    assertAppearance("system", "dark")
  })

  it("reste utilisable sans API de préférence système", () => {
    vi.stubGlobal("matchMedia", undefined)
    render(<AppearanceProvider storagePrefix={PREFIX}><Probe /></AppearanceProvider>)
    assertAppearance("system", "light")
    fireEvent.click(screen.getByRole("button", { name: "Sombre" }))
    assertAppearance("dark", "dark")
  })

  it("retire les listeners de système et de stockage au démontage", () => {
    const system = systemAppearance(false)
    const addStorage = vi.spyOn(window, "addEventListener")
    const removeStorage = vi.spyOn(window, "removeEventListener")
    const view = render(<AppearanceProvider storagePrefix={PREFIX}><Probe /></AppearanceProvider>)
    const systemListener = system.addListener.mock.calls.find(([type]) => type === "change")?.[1]
    const storageListener = addStorage.mock.calls.find(([type]) => type === "storage")?.[1]
    expect(systemListener).toBeDefined()
    expect(storageListener).toBeDefined()
    view.unmount()
    expect(system.removeListener).toHaveBeenCalledWith("change", systemListener)
    expect(removeStorage).toHaveBeenCalledWith("storage", storageListener)
  })

  it("garde les enfants montés pendant les changements d'apparence", () => {
    systemAppearance(false)
    const mounted = vi.fn()
    const unmounted = vi.fn()
    function PersistentChild() {
      useEffect(() => { mounted(); return unmounted }, [])
      return <Probe />
    }
    const view = render(<AppearanceProvider storagePrefix={PREFIX}><PersistentChild /></AppearanceProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Sombre" }))
    fireEvent.click(screen.getByRole("button", { name: "Clair" }))
    fireEvent.click(screen.getByRole("button", { name: "Système" }))
    expect(mounted).toHaveBeenCalledTimes(1)
    expect(unmounted).not.toHaveBeenCalled()
    view.unmount()
    expect(unmounted).toHaveBeenCalledTimes(1)
  })
})
