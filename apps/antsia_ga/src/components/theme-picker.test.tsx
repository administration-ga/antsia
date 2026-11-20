// @vitest-environment jsdom
import { MEMBER_THEME_IDS, type MemberThemeId } from "@antsia/social-contracts/appearance"
import { createAppI18n } from "@antsia/social-features/i18n"
import { AppearanceProvider } from "@antsia/social-features/shell/appearance"
import { ANTSIA_THEME_IDS, ANTSIA_THEMES } from "@antsia/ui"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  save: vi.fn<(args: { theme: string }) => Promise<null>>(),
  failure: vi.fn(),
}))

vi.mock("@convex/_generated/api", () => ({ api: { modules: { people: { preferences: { setMyPreferences: "set-preferences" } } } } }))
vi.mock("convex/react", () => ({ useMutation: () => state.save }))
vi.mock("sonner", () => ({ toast: { error: state.failure } }))

import { appResources } from "@/i18n/resources"
import { PersonalTheme } from "./personal-theme"
import { ThemePicker } from "./theme-picker"

let root: Root | undefined
let container: HTMLDivElement

/** En session : le thème du compte (absent tant qu'aucun n'est enregistré). */
type Session = { accountTheme: MemberThemeId | undefined }

/** Stockage en mémoire : le test ne touche aucun stockage réel. */
function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() { return items.size },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => { items.delete(key) },
    setItem: (key, value) => { items.set(key, String(value)) },
  }
}

let translations: ReturnType<typeof createAppI18n>

function tree(withThemes: boolean, session: Session | null) {
  const picker = session ? <PersonalTheme signedIn accountTheme={session.accountTheme}><ThemePicker /></PersonalTheme> : <ThemePicker />
  return (
    <I18nextProvider i18n={translations}>
      <AppearanceProvider storagePrefix="antsia:antsia:" themes={withThemes ? ANTSIA_THEMES : undefined}>{picker}</AppearanceProvider>
    </I18nextProvider>
  )
}

async function mount(locale: "fr" | "en", withThemes = true, session: Session | null = null) {
  translations = createAppI18n({ locale, appResources, defaultNS: "antsia" })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(tree(withThemes, session))
  })
}

/** Le compte rend une nouvelle valeur (écho d'un enregistrement ou choix fait ailleurs). */
async function accountNow(accountTheme: MemberThemeId | undefined) {
  await act(async () => {
    root!.render(tree(true, { accountTheme }))
  })
}

const hint = () => container.querySelector("fieldset p")?.textContent

const radios = () => [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')]

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage())
  vi.stubGlobal("matchMedia", vi.fn(() => Object.assign(new EventTarget(), { matches: false, media: "(prefers-color-scheme: dark)" })))
  document.documentElement.dataset.charte = "antsia"
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  container?.remove()
  vi.unstubAllGlobals()
})

describe("ThemePicker", () => {
  it("propose les sept thèmes, Gaboma par défaut, chacun peint dans sa propre charte", async () => {
    await mount("fr")
    expect(container.querySelector("legend")?.textContent).toBe("Thème")
    expect(radios()).toHaveLength(7)
    expect(radios().map((radio) => radio.closest("label")?.dataset.charte)).toEqual(ANTSIA_THEMES.map((theme) => theme.charte))
    const names = radios().map((radio) => radio.closest("label")?.querySelector(".truncate")?.textContent)
    expect(names).toEqual(["Gaboma", "Soleil", "Forêt", "Corail", "Lagon", "Électrique", "Sable"])
    expect(radios()[0]?.checked).toBe(true)
    // Gaboma est la charte du réseau : son option est peinte en `antsia`.
    expect(radios()[0]?.closest("label")?.dataset.charte).toBe("antsia")
    // Chaque option montre les trois couleurs de son thème (ADR-0027).
    for (const radio of radios()) expect(radio.closest("label")?.querySelectorAll("[class*='esp-theme-swatch']")).toHaveLength(3)
    for (const radio of radios()) expect(radio.getAttribute("aria-describedby")).toBe(container.querySelector("fieldset p")?.id)
  })

  it("choisir un thème le coche, l'applique à la page et le mémorise", async () => {
    await mount("fr")
    const foret = radios().find((radio) => radio.value === "foret")!
    await act(async () => foret.click())
    expect(foret.checked).toBe(true)
    expect(radios().filter((radio) => radio.checked)).toHaveLength(1)
    expect(document.documentElement.dataset.charte).toBe("antsia-foret")
    expect(window.localStorage.getItem("antsia:antsia:theme")).toBe("foret")
  })

  it("les libellés existent aussi en anglais", async () => {
    await mount("en")
    expect(container.querySelector("legend")?.textContent).toBe("Theme")
    expect(container.textContent).toContain("Green, yellow and blue of the flag. The network’s theme.")
    expect(container.textContent).toContain("Gabon blue, teal and golden sand. DIASPORA.GA’s theme.")
  })

  it("ne s'affiche pas quand l'application ne propose aucun thème", async () => {
    await mount("fr", false)
    expect(container.querySelector("fieldset")).toBeNull()
  })

  it("les thèmes proposés sont exactement ceux que le compte accepte, dans le même ordre", () => {
    expect([...ANTSIA_THEME_IDS]).toEqual([...MEMBER_THEME_IDS])
  })
})

describe("ThemePicker — hors session et sur le compte", () => {
  beforeEach(() => {
    state.save.mockReset()
    state.save.mockResolvedValue(null)
    state.failure.mockReset()
  })

  it("hors session : le choix reste sur l'appareil et rien n'est envoyé au compte", async () => {
    await mount("fr")
    expect(hint()).toContain("conservé pour ce réseau sur cet appareil")
    await act(async () => radios().find((radio) => radio.value === "lagon")!.click())
    expect(document.documentElement.dataset.charte).toBe("antsia-lagon")
    expect(window.localStorage.getItem("antsia:antsia:theme")).toBe("lagon")
    expect(state.save).not.toHaveBeenCalled()
  })

  it("en session : le choix s'applique tout de suite et s'enregistre sur le compte", async () => {
    await mount("fr", true, { accountTheme: "gaboma" })
    expect(hint()).toContain("enregistré sur votre compte")
    await act(async () => radios().find((radio) => radio.value === "foret")!.click())
    expect(document.documentElement.dataset.charte).toBe("antsia-foret")
    expect(window.localStorage.getItem("antsia:antsia:theme")).toBe("foret")
    expect(state.save).toHaveBeenCalledTimes(1)
    expect(state.save).toHaveBeenCalledWith({ theme: "foret" })
    await accountNow("foret")
    expect(radios().find((radio) => radio.checked)?.value).toBe("foret")
    expect(state.save).toHaveBeenCalledTimes(1)
  })

  it("le thème du compte s'applique à l'appareil et y reste en cache pour le prochain affichage", async () => {
    await mount("fr", true, { accountTheme: "corail" })
    expect(document.documentElement.dataset.charte).toBe("antsia-corail")
    expect(window.localStorage.getItem("antsia:antsia:theme")).toBe("corail")
    expect(radios().find((radio) => radio.checked)?.value).toBe("corail")
    await accountNow("soleil")
    expect(document.documentElement.dataset.charte).toBe("antsia-soleil")
    expect(state.save).not.toHaveBeenCalled()
  })

  it("un compte sans thème laisse celui de l'appareil", async () => {
    window.localStorage.setItem("antsia:antsia:theme", "electrique")
    await mount("fr", true, { accountTheme: undefined })
    expect(document.documentElement.dataset.charte).toBe("antsia-electrique")
    expect(state.save).not.toHaveBeenCalled()
  })

  it("un ancien thème mémorisé sur l'appareil (ADR-0027) retombe sur Gaboma", async () => {
    window.localStorage.setItem("antsia:antsia:theme", "mandarine")
    await mount("fr", true, { accountTheme: undefined })
    expect(document.documentElement.dataset.charte).toBe("antsia")
    expect(radios().find((radio) => radio.checked)?.value).toBe("gaboma")
    expect(state.save).not.toHaveBeenCalled()
  })

  it("un enregistrement refusé rend le thème du compte et l'annonce en français et en anglais", async () => {
    state.save.mockRejectedValue({ data: { code: "rateLimited" } })
    await mount("fr", true, { accountTheme: "lagon" })
    await act(async () => radios().find((radio) => radio.value === "soleil")!.click())
    expect(document.documentElement.dataset.charte).toBe("antsia-lagon")
    expect(radios().find((radio) => radio.checked)?.value).toBe("lagon")
    expect(state.failure).toHaveBeenCalledWith("Le thème n’a pas pu être enregistré sur votre compte. Trop de tentatives. Réessayez dans quelques instants.")
    await act(async () => root?.unmount())
    root = undefined
    container.remove()
    await mount("en", true, { accountTheme: "lagon" })
    await act(async () => radios().find((radio) => radio.value === "soleil")!.click())
    expect(state.failure).toHaveBeenLastCalledWith(expect.stringMatching(/^The theme could not be saved to your account\. /))
  })
})
