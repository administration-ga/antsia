// @vitest-environment jsdom
import { createAppI18n } from "@antsia/social-features/i18n"
import { AppearanceProvider } from "@antsia/social-features/shell/appearance"
import { BRAND_NAME } from "@antsia/social-contracts/brand"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { appResources } from "@/i18n/resources"
import { routes } from "@/lib/routes"

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  status: "signedOut",
  configuration: { idn: true, emailOtp: true, smsOtp: true, localCodes: false, demoAccounts: false },
  authClient: {
    signIn: { oauth2: vi.fn(), emailOtp: vi.fn() },
    emailOtp: { sendVerificationOtp: vi.fn() },
    phoneNumber: { sendOtp: vi.fn(), verify: vi.fn() },
  },
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock("@/components/providers", () => ({ SessionProviders: ({ children }: { children: ReactNode }) => children }))
vi.mock("@/components/use-session-state", () => ({ useSessionState: () => ({ status: mocks.status }) }))
vi.mock("convex/react", () => ({ useQuery: () => mocks.configuration }))
vi.mock("@/lib/auth-client", () => ({ authClient: mocks.authClient }))
vi.mock("@/lib/session-bridge-client", () => ({ fencedIdentityEntryClient: (client: unknown) => client }))
vi.mock("@/components/demo-accounts-panel", () => ({
  DemoAccountsPanel: ({ shared }: { shared?: boolean }) => <section data-demo-accounts={shared ? "shared" : "local"} />,
}))

import { AccessHomeScreen } from "./access-home-screen"

let root: Root | undefined
let host: HTMLDivElement
async function mount(children: ReactNode = <AccessHomeScreen />) {
  const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "antsia", defaultVariables: { brand: BRAND_NAME } })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(<I18nextProvider i18n={i18n}>{children}</I18nextProvider>))
  return async (next: ReactNode) => {
    await act(async () => root!.render(<I18nextProvider i18n={i18n}>{next}</I18nextProvider>))
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.status = "signedOut"
  mocks.configuration = { idn: true, emailOtp: true, smsOtp: true, localCodes: false, demoAccounts: false }
  mocks.authClient.emailOtp.sendVerificationOtp.mockResolvedValue({ data: { success: true }, error: null })
  window.history.replaceState({}, "", routes.home())
})
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); root = undefined })

describe("accueil ANTSIA — accès réel", () => {
  it("les comptes de démonstration n'apparaissent que si le serveur les annonce : local ou site de démonstration", async () => {
    const update = await mount()
    expect(host.querySelector("[data-demo-accounts]")).toBeNull()
    mocks.configuration = { ...mocks.configuration, demoAccounts: true }
    await update(<AccessHomeScreen />)
    expect(host.querySelector("[data-demo-accounts]")?.getAttribute("data-demo-accounts")).toBe("shared")
    mocks.configuration = { ...mocks.configuration, localCodes: true }
    await update(<AccessHomeScreen />)
    expect(host.querySelector("[data-demo-accounts]")?.getAttribute("data-demo-accounts")).toBe("local")
  })

  it("propose le mode sombre en un appui, avant même la connexion (ADR-0027)", async () => {
    const items = new Map<string, string>()
    vi.stubGlobal("localStorage", { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value) }, removeItem: (key: string) => { items.delete(key) } })
    await mount(<AppearanceProvider storagePrefix="antsia:test:"><AccessHomeScreen /></AppearanceProvider>)
    const toggle = host.querySelector<HTMLButtonElement>("[data-appearance-toggle]")
    expect(toggle?.getAttribute("aria-label")).toBe("Mode sombre")
    expect(toggle?.getAttribute("aria-pressed")).toBe("false")
    await act(async () => toggle!.click())
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(items.get("antsia:test:appearance")).toBe("dark")
    await act(async () => toggle!.click())
    expect(document.documentElement.classList.contains("dark")).toBe(false)
    vi.unstubAllGlobals()
  })

  it("présente IDN et OTP avec une inscription distincte et les lectures publiques secondaires", async () => {
    await mount()
    expect(host.querySelector("h1")?.textContent).toBe(BRAND_NAME)
    expect(host.querySelector("h2")?.textContent).toBe("Connexion")
    expect(host.querySelector('input[type="email"]')?.getAttribute("aria-label")).toBe("Adresse e-mail")
    expect(host.querySelector('input[type="password"]')).toBeNull()
    const buttons = Array.from(host.querySelectorAll("button"))
    expect(buttons[0]?.textContent).toContain("Continuer avec mon identité IDN")
    expect(buttons.some((button) => button.textContent?.includes("Recevoir un code"))).toBe(true)
    const signup = host.querySelector(`a[href="${routes.signIn("sign-up")}"]`)
    expect(signup?.textContent).toBe("Créer un compte")
    expect(host.querySelector(`a[href="${routes.discover()}"]`)?.textContent).toBe("Explorer les publications publiques")
    expect(host.querySelector(`h1 a[href="${routes.home()}"]`)?.textContent).toBe(BRAND_NAME)
    expect(host.querySelector(`footer a[href="${routes.about()}"]`)?.textContent).toBe("À propos")
    expect(host.querySelector(`footer a[href="${routes.legal()}"]`)).not.toBeNull()
    expect(host.querySelector(`footer a[href="${routes.privacy()}"]`)).not.toBeNull()
    expect(host.querySelectorAll("main")).toHaveLength(1)
    expect(host.querySelector('[data-slot="card"]')).toBeNull()
  })

  it("ne présente pas IDN comme disponible lorsque sa configuration le refuse", async () => {
    mocks.configuration.idn = false
    await mount()
    expect(host.querySelector("button")?.disabled).toBe(true)
    expect(host.textContent).toContain("IDN n’est pas encore disponible")
    expect(mocks.authClient.signIn.oauth2).not.toHaveBeenCalled()
  })

  it("change la langue de l'accueil et de la même carte d'authentification", async () => {
    await mount()
    await act(async () => host.querySelector<HTMLButtonElement>('button[lang="en"]')!.click())
    expect(document.documentElement.lang).toBe("en")
    expect(host.querySelector("h2")?.textContent).toBe("Log in")
    expect(host.querySelector(`a[href="${routes.signIn("sign-up")}"]`)?.textContent).toBe("Create an account")
  })

  it.each([["member", routes.feed()], ["welcome", routes.welcome()], ["restricted", routes.personalControls()]])("redirige une session %s sans montrer de formulaire", async (status, destination) => {
    mocks.status = status
    await mount()
    expect(mocks.replace).toHaveBeenCalledWith(destination)
    expect(host.querySelector("form")).toBeNull()
  })

  it("conserve la déconnexion incomplète visible même si le SDK porte encore une session", async () => {
    mocks.status = "member"
    await mount(<AccessHomeScreen signOutIncomplete />)
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("déconnexion complète n’a pas pu être confirmée")
    expect(host.querySelector("form")).not.toBeNull()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it("l'inscription garde IDN et OTP puis revient vers la même connexion", async () => {
    await mount(<AccessHomeScreen intent="sign-up" />)
    expect(host.querySelector("h1")?.textContent).toBe(BRAND_NAME)
    expect(host.querySelector("h2")?.textContent).toBe("Créer votre compte ANTSIA")
    expect(host.querySelector('input[type="email"]')).not.toBeNull()
    expect(host.querySelector(`a[href="${routes.signIn()}"]`)?.textContent).toContain("J’ai déjà un compte")
    expect(mocks.authClient.signIn.oauth2).not.toHaveBeenCalled()
  })

  it("change d'intention sur la même racine et oublie les coordonnées en cours de vérification", async () => {
    const rerender = await mount(<AccessHomeScreen intent="sign-up" />)
    const email = host.querySelector<HTMLInputElement>('input[type="email"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(email, "awa@example.ga")
      email.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })) })
    expect(mocks.authClient.emailOtp.sendVerificationOtp).toHaveBeenCalledWith(expect.objectContaining({ email: "awa@example.ga", type: "sign-in" }))
    expect(host.querySelector('input[autocomplete="one-time-code"]')).not.toBeNull()

    await rerender(<AccessHomeScreen intent="sign-in" />)
    expect(host.querySelector("h1")?.textContent).toBe(BRAND_NAME)
    expect(host.querySelector("h2")?.textContent).toBe("Connexion")
    expect(host.querySelector(`a[href="${routes.signIn("sign-up")}"]`)?.textContent).toBe("Créer un compte")
    expect(host.querySelector('input[autocomplete="one-time-code"]')).toBeNull()
    expect(host.querySelector<HTMLInputElement>('input[type="email"]')?.value).toBe("")
    expect(mocks.authClient.emailOtp.sendVerificationOtp).toHaveBeenCalledTimes(1)
    expect(mocks.authClient.signIn.emailOtp).not.toHaveBeenCalled()
  })

  it("MP01 : conserve la boutique visée sur le lien de création de compte", async () => {
    const destination = { kind: "storefront" as const, handle: "atelier.ndong" }
    await mount(<AccessHomeScreen specializedDestination={destination} />)
    const mainLinks = Array.from(host.querySelectorAll("main a"), link => link.getAttribute("href"))
    expect(mainLinks).toContain(routes.signIn("sign-up", undefined, undefined, undefined, destination))
  })
})
