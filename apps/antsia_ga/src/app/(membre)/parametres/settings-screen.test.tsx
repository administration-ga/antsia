// @vitest-environment jsdom
// Paramètres : un volet atteignable qui rend l'affichage (apparence, sept thèmes, motif de fond), la langue et le fuseau.
import { MEMBER_THEME_IDS } from "@antsia/social-contracts/appearance"
import { ViewerPreferencesProvider } from "@antsia/api/viewer-preferences"
import { createAppI18n, type Locale } from "@antsia/social-features/i18n"
import { AppearanceProvider } from "@antsia/social-features/shell/appearance"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  person: { _id: "person-fixture", locale: "fr" as "fr" | "en", timeZone: "Africa/Libreville", published: true, handle: "awa.ndong", displayName: "Awa Ndong" },
  save: vi.fn<(args: Record<string, unknown>) => Promise<null>>(),
}))

vi.mock("@convex/_generated/api", () => ({ api: { modules: { people: { persons: { getMyPerson: "get-person" }, preferences: { setMyPreferences: "set-preferences" } } } } }))
vi.mock("convex/react", () => ({ useQuery: () => state.person, useMutation: () => state.save }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a> }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock("@/components/network-shell", () => ({ useMemberSession: () => ({ person: state.person }) }))
vi.mock("@/lib/sign-out", () => ({ signOutAndRedirect: vi.fn() }))

import { PersonalTheme } from "@/components/personal-theme"
import { appResources } from "@/i18n/resources"
import { APPEARANCE } from "@/lib/appearance"
import { routes } from "@/lib/routes"
import { SettingsScreen } from "./settings-screen"

let root: Root | undefined
let container: HTMLDivElement

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

async function mount(locale: Locale = "fr", inSession = false) {
  const translations = createAppI18n({ locale, appResources, defaultNS: "antsia" })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  const screen = inSession ? <PersonalTheme signedIn accountTheme="gaboma"><SettingsScreen /></PersonalTheme> : <SettingsScreen />
  await act(async () => {
    root!.render(
      <I18nextProvider i18n={translations}>
        <ViewerPreferencesProvider timeZone="UTC">
          <AppearanceProvider storagePrefix={APPEARANCE.storagePrefix} themes={APPEARANCE.themes} motifs={APPEARANCE.motifs}>{screen}</AppearanceProvider>
        </ViewerPreferencesProvider>
      </I18nextProvider>,
    )
  })
}

const legends = () => [...container.querySelectorAll("legend")].map((legend) => legend.textContent)
const themeRadios = () => [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')].filter((radio) => (MEMBER_THEME_IDS as readonly string[]).includes(radio.value))

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage())
  vi.stubGlobal("matchMedia", vi.fn(() => Object.assign(new EventTarget(), { matches: false, media: "(prefers-color-scheme: dark)" })))
  document.documentElement.dataset.charte = "antsia"
  state.save.mockReset()
  state.save.mockResolvedValue(null)
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  container?.remove()
  vi.unstubAllGlobals()
})

describe("Paramètres", () => {
  it("un volet nommé : l'affichage avec les sept thèmes, la langue et le fuseau, puis les réglages voisins", async () => {
    await mount("fr")
    expect(container.querySelector("h1")?.textContent).toBe("Réglages")
    expect([...container.querySelectorAll("h2")].map((heading) => heading.textContent)).toEqual(["Affichage", "Langue et fuseau horaire", "Autres réglages"])
    expect(container.querySelector("select option[value='dark']")).not.toBeNull()
    expect(legends()).toEqual(["Thème", "Motif de fond"])
    expect(themeRadios().map((radio) => radio.value)).toEqual([...MEMBER_THEME_IDS])
    expect(themeRadios()).toHaveLength(7)
    expect(container.querySelector('input[autocomplete="off"]')).not.toBeNull()
    const links = [...container.querySelectorAll("a")].map((link) => link.getAttribute("href"))
    expect(links).toEqual([routes.feedPreferences(), routes.personalControls()])
  })

  it("la langue et le fuseau ne répètent pas l'affichage : un seul sélecteur de thème et d'apparence", async () => {
    await mount("fr")
    expect(container.querySelectorAll("fieldset legend").length).toBe(2)
    expect([...container.querySelectorAll("select")].filter((select) => select.querySelector("option[value='system']"))).toHaveLength(1)
  })

  it("les libellés existent aussi en anglais", async () => {
    await mount("en")
    expect(container.querySelector("h1")?.textContent).toBe("Settings")
    expect([...container.querySelectorAll("h2")].map((heading) => heading.textContent)).toEqual(["Display", "Language and time zone", "More settings"])
    expect(legends()).toEqual(["Theme", "Background pattern"])
  })

  it("en session, choisir Sable l'applique tout de suite et l'enregistre sur le compte", async () => {
    await mount("fr", true)
    const sable = themeRadios().find((radio) => radio.value === "sable")!
    await act(async () => sable.click())
    expect(sable.checked).toBe(true)
    expect(document.documentElement.dataset.charte).toBe("antsia-sable")
    expect(state.save).toHaveBeenCalledWith({ theme: "sable" })
  })
})
