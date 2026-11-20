// @vitest-environment jsdom
// Thème au choix du membre : charte posée sur html, mémoire par réseau, repli sur le thème par défaut, synchronisation entre onglets.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createMemoryStorage } from "../../tests/memory-storage"
import { type AppearanceTheme, AppearanceProvider, useOptionalAppearance } from "./provider"

const PREFIX = "antsia:test:"
const THEME_KEY = `${PREFIX}theme`
const THEMES: readonly AppearanceTheme[] = [
  { id: "origine", charte: "antsia" },
  { id: "foret", charte: "antsia-foret" },
  { id: "lagon", charte: "antsia-lagon" },
]
let localStorage: Storage

function Probe() {
  const appearance = useOptionalAppearance()
  if (appearance === null) return null
  return (
    <>
      <output data-testid="theme">{appearance.theme ?? "aucun"}</output>
      <output data-testid="charte">{appearance.charte ?? "aucune"}</output>
      <output data-testid="count">{appearance.themes.length}</output>
      <button onClick={() => appearance.setTheme("foret")}>Forêt</button>
      <button onClick={() => appearance.setTheme("origine")}>Origine</button>
      <button onClick={() => appearance.setTheme("inconnu")}>Inconnu</button>
      <button onClick={() => appearance.setMode("dark")}>Sombre</button>
    </>
  )
}

function assertTheme(theme: string, charte: string) {
  expect(screen.getByTestId("theme")).toHaveTextContent(theme)
  expect(screen.getByTestId("charte")).toHaveTextContent(charte)
  expect(document.documentElement.dataset.charte).toBe(charte)
}

/** Le stockage en mémoire n'est pas un `Storage` de jsdom : l'évènement est composé à la main, comme dans provider.test.tsx. */
function storageEvent(key: string | null, newValue: string | null, storageArea: Storage = window.localStorage) {
  const event = new Event("storage")
  Object.defineProperties(event, { key: { value: key }, newValue: { value: newValue }, storageArea: { value: storageArea } })
  act(() => {
    window.dispatchEvent(event)
  })
}

beforeEach(() => {
  localStorage = createMemoryStorage()
  vi.stubGlobal("localStorage", localStorage)
  vi.stubGlobal("matchMedia", vi.fn(() => Object.assign(new EventTarget(), { matches: false, media: "(prefers-color-scheme: dark)" })))
  document.documentElement.dataset.charte = "antsia"
  document.documentElement.classList.remove("dark")
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("AppearanceProvider — thème au choix du membre", () => {
  it("sans thèmes proposés : aucun choix et la charte de la page n'est pas touchée", () => {
    document.documentElement.dataset.charte = "diaspora-ga"
    render(<AppearanceProvider storagePrefix={PREFIX}><Probe /></AppearanceProvider>)
    expect(screen.getByTestId("theme")).toHaveTextContent("aucun")
    expect(screen.getByTestId("count")).toHaveTextContent("0")
    fireEvent.click(screen.getByRole("button", { name: "Forêt" }))
    expect(document.documentElement.dataset.charte).toBe("diaspora-ga")
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull()
  })

  it("le premier thème par défaut, sans rien écrire dans le stockage", () => {
    render(<AppearanceProvider storagePrefix={PREFIX} themes={THEMES}><Probe /></AppearanceProvider>)
    assertTheme("origine", "antsia")
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull()
  })

  it("choisir un thème le pose sur html, le mémorise, et revenir au défaut efface la clé", () => {
    render(<AppearanceProvider storagePrefix={PREFIX} themes={THEMES}><Probe /></AppearanceProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Forêt" }))
    assertTheme("foret", "antsia-foret")
    expect(window.localStorage.getItem(THEME_KEY)).toBe("foret")
    fireEvent.click(screen.getByRole("button", { name: "Origine" }))
    assertTheme("origine", "antsia")
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull()
  })

  it("un thème inconnu est refusé ; un thème mémorisé qui n'est plus proposé retombe sur le défaut", () => {
    window.localStorage.setItem(THEME_KEY, "disparu")
    render(<AppearanceProvider storagePrefix={PREFIX} themes={THEMES}><Probe /></AppearanceProvider>)
    assertTheme("origine", "antsia")
    fireEvent.click(screen.getByRole("button", { name: "Inconnu" }))
    assertTheme("origine", "antsia")
    expect(window.localStorage.getItem(THEME_KEY)).toBe("disparu")
  })

  it("retrouve le thème au remontage, indépendamment de l'apparence et du thème d'un autre réseau", () => {
    window.localStorage.setItem("antsia:autre:theme", "lagon")
    const view = render(<AppearanceProvider storagePrefix={PREFIX} themes={THEMES}><Probe /></AppearanceProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Forêt" }))
    fireEvent.click(screen.getByRole("button", { name: "Sombre" }))
    view.unmount()
    render(<AppearanceProvider storagePrefix={PREFIX} themes={THEMES}><Probe /></AppearanceProvider>)
    assertTheme("foret", "antsia-foret")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(window.localStorage.getItem("antsia:autre:theme")).toBe("lagon")
  })

  it("suit le choix fait dans un autre onglet, y compris l'effacement complet du stockage", () => {
    render(<AppearanceProvider storagePrefix={PREFIX} themes={THEMES}><Probe /></AppearanceProvider>)
    storageEvent(THEME_KEY, "lagon")
    assertTheme("lagon", "antsia-lagon")
    storageEvent("antsia:autre:theme", "foret")
    assertTheme("lagon", "antsia-lagon")
    storageEvent(THEME_KEY, "foret", createMemoryStorage())
    assertTheme("lagon", "antsia-lagon")
    storageEvent(THEME_KEY, "inconnu")
    assertTheme("origine", "antsia")
    storageEvent(THEME_KEY, "foret")
    storageEvent(null, null)
    assertTheme("origine", "antsia")
  })

  it("un stockage refusé n'empêche pas de changer de thème pendant la visite", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("quota") })
    render(<AppearanceProvider storagePrefix={PREFIX} themes={THEMES}><Probe /></AppearanceProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Forêt" }))
    assertTheme("foret", "antsia-foret")
  })
})
