// @vitest-environment jsdom
// Comptes de démonstration (développement local) : un appui entre par le vrai parcours OTP.
import { createAppI18n } from "@antsia/social-features/i18n"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  catalogue: [] as unknown[] | undefined,
  latestOtp: vi.fn(),
  send: vi.fn(),
  verify: vi.fn(),
  assign: vi.fn(),
}))

vi.mock("@convex/_generated/api", () => ({ api: { modules: { platform: { demoAccounts: { catalogue: "demo-catalogue" }, devTools: { latestOtp: "latest-otp" } } } } }))
vi.mock("convex/react", () => ({
  useQuery: () => state.catalogue,
  useConvex: () => ({ query: state.latestOtp }),
}))

import { appResources } from "@/i18n/resources"
import { DEMO_ACCOUNT_KEY, pendingDemoAccount } from "@/lib/demo-accounts"
import { DemoAccountsPanel } from "./demo-accounts-panel"

const PRESSE = { actor: "presse", email: "presse@demo.antsia.test", profile: { handle: "presse.demo", displayName: "Sylvie OYANE", headline: "Journaliste" } }
const NOUVEAU = { actor: "nouveau", email: "nouveau@demo.antsia.test", profile: null }

let root: Root | undefined
let container: HTMLDivElement

function client() {
  return {
    signIn: { oauth2: vi.fn(), emailOtp: state.verify },
    emailOtp: { sendVerificationOtp: state.send },
    phoneNumber: { sendOtp: vi.fn(), verify: vi.fn() },
  }
}

async function mount(locale: "fr" | "en" = "fr", shared = false) {
  const i18n = createAppI18n({ locale, appResources, defaultNS: "antsia" })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root!.render(<I18nextProvider i18n={i18n}><DemoAccountsPanel authClient={client() as never} shared={shared} /></I18nextProvider>))
}

const buttons = () => [...container.querySelectorAll<HTMLButtonElement>("button")]

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "")
  state.catalogue = [PRESSE, NOUVEAU]
  state.latestOtp.mockReset().mockResolvedValue({ code: "482913", expiresAt: Date.now() + 300_000 })
  state.send.mockReset().mockResolvedValue({ data: { success: true }, error: null })
  state.verify.mockReset().mockResolvedValue({ data: { token: "t" }, error: null })
  state.assign.mockReset()
  vi.stubGlobal("location", { ...window.location, assign: state.assign })
  window.sessionStorage.clear()
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  container?.remove()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  window.sessionStorage.clear()
})

describe("DemoAccountsPanel", () => {
  it("ne s'affiche pas quand le catalogue est vide (hors développement local)", async () => {
    state.catalogue = []
    await mount()
    expect(container.querySelector("section")).toBeNull()
  })

  it("sur le site de démonstration, dit que les comptes et contenus sont fictifs et partagés", async () => {
    await mount("fr", true)
    expect(container.querySelector("section p")?.textContent).toMatch(/^Site de démonstration : comptes et contenus fictifs, partagés par tous les visiteurs\./)
    await act(async () => root?.unmount())
    container.remove()
    await mount("fr")
    expect(container.querySelector("section p")?.textContent).toMatch(/^Développement local seulement/)
  })

  it("présente chaque acteur avec son nom et son rôle", async () => {
    await mount()
    expect(container.querySelector("h3")?.textContent).toBe("Comptes de démonstration")
    expect(buttons().map((button) => button.textContent)).toEqual([
      "PresseSylvie OYANE · Journaliste, administratrice d’un média vérifié.",
      "Nouvel arrivantCompte neuf : l’accueil reste à remplir.",
    ])
  })

  it("entre par le vrai parcours OTP : envoi, code local, vérification, puis l'accueil", async () => {
    await mount()
    await act(async () => buttons()[0]!.click())
    expect(state.send).toHaveBeenCalledWith({ email: PRESSE.email, type: "sign-in" })
    expect(state.latestOtp).toHaveBeenCalledWith("latest-otp", { email: PRESSE.email })
    expect(state.verify).toHaveBeenCalledWith({ email: PRESSE.email, otp: "482913" })
    expect(state.assign).toHaveBeenCalledWith("/bienvenue")
    // L'acteur attend l'automate d'accueil, dans cet onglet seulement.
    expect(pendingDemoAccount()).toEqual(PRESSE)
    expect(window.sessionStorage.getItem(DEMO_ACCOUNT_KEY)).not.toBeNull()
  })

  it("garde le parcours OTP du build démo sous /demo après authentification", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "/demo")
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://vivid-hedgehog-655.convex.cloud")
    await mount()
    await act(async () => buttons()[0]!.click())
    expect(state.send).toHaveBeenCalledExactlyOnceWith({ email: PRESSE.email, type: "sign-in" })
    expect(state.verify).toHaveBeenCalledExactlyOnceWith({ email: PRESSE.email, otp: "482913" })
    expect(state.assign).toHaveBeenCalledExactlyOnceWith("/demo/bienvenue")
  })

  it("un refus d'authentification n'ouvre rien, oublie l'acteur et le dit", async () => {
    state.verify.mockResolvedValue({ data: null, error: { status: 401 } })
    await mount()
    await act(async () => buttons()[0]!.click())
    expect(state.assign).not.toHaveBeenCalled()
    expect(pendingDemoAccount()).toBeNull()
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("La connexion de démonstration n’a pas abouti. Réessayez dans quelques instants.")
    expect(buttons().every((button) => !button.disabled)).toBe(true)
  })

  it("se dit aussi en anglais", async () => {
    await mount("en")
    expect(container.querySelector("h3")?.textContent).toBe("Demo accounts")
    expect(buttons()[1]?.textContent).toBe("NewcomerBrand-new account: the welcome steps are left to fill in.")
  })
})
