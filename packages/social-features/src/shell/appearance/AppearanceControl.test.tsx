// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createAppI18n, type Locale } from "../../i18n"
import { createMemoryStorage } from "../../tests/memory-storage"
import { AppearanceControl } from "./AppearanceControl"
import { AppearanceProvider } from "./provider"
import { ThemeChoiceProvider } from "./theme-choice"

const THEMES = [{ id: "gaboma", charte: "antsia" }, { id: "soleil", charte: "antsia-soleil" }] as const
const NAMES: Record<string, string> = { gaboma: "Gaboma", soleil: "Soleil" }

function themed(choose: ((theme: string) => void) | null = null, showTheme = true) {
  const i18n = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "shell" })
  return (
    <I18nextProvider i18n={i18n}>
      <AppearanceProvider storagePrefix="antsia:test:" themes={THEMES} themeName={(id) => NAMES[id] ?? id}>
        <ThemeChoiceProvider choose={choose}><AppearanceControl showTheme={showTheme} /></ThemeChoiceProvider>
      </AppearanceProvider>
    </I18nextProvider>
  )
}

function appearance(locale: Locale = "fr") {
  const i18n = createAppI18n({ locale, appResources: { fr: {}, en: {} }, defaultNS: "shell" })
  return (
    <I18nextProvider i18n={i18n}>
      <AppearanceProvider storagePrefix="antsia:test:"><AppearanceControl /></AppearanceProvider>
    </I18nextProvider>
  )
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createMemoryStorage())
  const media = new EventTarget() as MediaQueryList
  Object.defineProperty(media, "matches", { value: false })
  vi.stubGlobal("matchMedia", vi.fn(() => media))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("AppearanceControl", () => {
  it("ne propose aucun contrôle quand l'application ne monte pas le provider", () => {
    const i18n = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "shell" })
    const view = render(<I18nextProvider i18n={i18n}><AppearanceControl /></I18nextProvider>)
    expect(view.container).toBeEmptyDOMElement()
  })

  it("nomme le sélecteur natif et permet de revenir au mode système", () => {
    render(appearance())
    const select = screen.getByRole("combobox", { name: "Apparence" })
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual(["Système", "Clair", "Sombre"])
    expect(select).toHaveValue("system")
    fireEvent.change(select, { target: { value: "dark" } })
    expect(select).toHaveValue("dark")
    expect(document.documentElement).toHaveClass("dark")
    fireEvent.change(select, { target: { value: "system" } })
    expect(select).toHaveValue("system")
    expect(document.documentElement).not.toHaveClass("dark")
  })

  it("traduit le nom et tous les choix en anglais", () => {
    render(appearance("en"))
    const select = screen.getByRole("combobox", { name: "Appearance" })
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual(["System", "Light", "Dark"])
  })

  it("sans nom de thème fourni par l'application, ne propose que l'apparence", () => {
    render(appearance())
    expect(screen.getAllByRole("combobox")).toHaveLength(1)
  })

  it("laisse le choix de thème au nuancier quand les réglages le proposent déjà", () => {
    render(themed(null, false))
    expect(screen.getByRole("combobox", { name: "Apparence" })).toBeInTheDocument()
    expect(screen.queryByRole("combobox", { name: "Thème" })).toBeNull()
  })

  it("propose le thème sous son nom et le pose sur l'appareil hors session (ADR-0030)", () => {
    render(themed())
    const select = screen.getByRole("combobox", { name: "Thème" })
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual(["Gaboma", "Soleil"])
    expect(select).toHaveValue("gaboma")
    fireEvent.change(select, { target: { value: "soleil" } })
    expect(select).toHaveValue("soleil")
    expect(document.documentElement.dataset.charte).toBe("antsia-soleil")
    expect(localStorage.getItem("antsia:test:theme")).toBe("soleil")
  })

  it("en session, confie le choix à l'application (compte), qui l'applique elle-même", () => {
    const choose = vi.fn()
    render(themed(choose))
    fireEvent.change(screen.getByRole("combobox", { name: "Thème" }), { target: { value: "soleil" } })
    expect(choose).toHaveBeenCalledWith("soleil")
    expect(localStorage.getItem("antsia:test:theme")).toBeNull()
  })
})
