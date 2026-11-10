// @vitest-environment jsdom
import { createAppI18n } from "@antsia/social-features/i18n"
import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { appResources } from "@/i18n/resources"

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  auth: { isAuthenticated: false, isLoading: false },
  configuration: { idn: true, emailOtp: true, smsOtp: true, localCodes: true },
  signOut: vi.fn(),
}))
vi.mock("@/components/providers", () => ({ CONVEX_URL: "configured" }))
vi.mock("@/lib/auth-client", () => ({ authClient: { signIn: { oauth2: mocks.signIn } } }))
vi.mock("@/lib/sign-out", () => ({ signOutAndRedirect: mocks.signOut }))
vi.mock("./console-operations", () => ({ OperationsPanel: () => null }))
vi.mock("convex/react", () => ({
  useConvexAuth: () => mocks.auth,
  useQuery: () => mocks.configuration,
  useMutation: () => vi.fn(),
}))

import { ConsoleSignInScreen, IdnConsoleEntry } from "./sign-in-screen"

function mount(element = <IdnConsoleEntry configuration={mocks.configuration} />) {
  const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "admin" })
  return render(<I18nextProvider i18n={i18n}>{element}</I18nextProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth = { isAuthenticated: false, isLoading: false }
  mocks.configuration = { idn: true, emailOtp: true, smsOtp: true, localCodes: true }
  mocks.signIn.mockResolvedValue({ data: { url: "https://identity.example/authorize", redirect: true }, error: null })
  window.history.replaceState({}, "", "/entrer")
})
afterEach(cleanup)

describe("console PA7 — IDN seule", () => {
  it("n'expose ni OTP, ni SMS, ni code de développement même si le moteur les permet", () => {
    mount()
    expect(screen.getByRole("button", { name: "Me connecter avec IDN" })).toBeDefined()
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.queryByText(/SMS/)).toBeNull()
    expect(screen.queryByText(/e-mail/)).toBeNull()
    expect(screen.queryByText(/code à usage/)).toBeNull()
  })
  it("une configuration IDN absente présente le manque honnêtement et ne lance pas l'authentification", async () => {
    mocks.configuration.idn = false
    mount()
    const button = screen.getByRole("button", { name: "Me connecter avec IDN" })
    expect(button.hasAttribute("disabled")).toBe(true)
    expect(screen.getByText(/propriétaire doit créer et configurer/)).toBeDefined()
    await userEvent.click(button)
    expect(mocks.signIn).not.toHaveBeenCalled()
  })
  it("l'attente de configuration reste annoncée sans offrir une autre porte", () => {
    mount(<IdnConsoleEntry configuration={undefined} />)
    expect(screen.getByText(/Vérification de la disponibilité/)).toBeDefined()
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true)
  })
  it("soumet uniquement le provider IDN avec un callback console et protège le double clic", async () => {
    let resolve: (value: unknown) => void = () => undefined
    mocks.signIn.mockImplementation(() => new Promise((done) => { resolve = done }))
    mount()
    await userEvent.click(screen.getByRole("button", { name: "Me connecter avec IDN" }))
    const pending = screen.getByRole("button", { name: "Ouverture d’IDN…" })
    expect(pending.hasAttribute("disabled")).toBe(true)
    await userEvent.click(pending)
    expect(mocks.signIn).toHaveBeenCalledTimes(1)
    expect(mocks.signIn).toHaveBeenCalledWith({ providerId: "idn", callbackURL: "/", errorCallbackURL: "/entrer", fetchOptions: { throw: false, signal: expect.any(AbortSignal) } })
    await act(async () => resolve({ data: { url: "https://identity.example/authorize", redirect: true }, error: null }))
  })
  it("traduit une erreur du fournisseur sans exposer ses détails, puis permet un nouvel essai", async () => {
    mocks.signIn.mockResolvedValueOnce({ data: null, error: { code: "TOO_MANY_ATTEMPTS", message: "provider-private-detail" } })
    mount()
    await userEvent.click(screen.getByRole("button", { name: "Me connecter avec IDN" }))
    expect(screen.getByRole("alert").textContent).not.toContain("provider-private-detail")
    expect(screen.getByRole("button", { name: "Me connecter avec IDN" }).hasAttribute("disabled")).toBe(false)
    await userEvent.click(screen.getByRole("button", { name: "Me connecter avec IDN" }))
    expect(mocks.signIn).toHaveBeenCalledTimes(2)
  })
  it("une réponse sans redirection admise est un échec visible", async () => {
    mocks.signIn.mockResolvedValueOnce({ data: { url: "invalid", redirect: false }, error: null })
    mount()
    await userEvent.click(screen.getByRole("button", { name: "Me connecter avec IDN" }))
    expect(screen.getByRole("alert")).toBeDefined()
  })
  it("une session faible peut relancer IDN au lieu d'être redirigée vers le refus", () => {
    mocks.auth.isAuthenticated = true
    mount(<ConsoleSignInScreen />)
    expect(screen.getByRole("button", { name: "Me connecter avec IDN" })).toBeDefined()
    expect(screen.queryByText("Vérification de la session…")).toBeNull()
  })
})

describe("console — retour d'un refus IDN (issue 122, EA-02)", () => {
  it("le refus ramené par le moteur se dit en phrase connue, sans la valeur reçue, puis l'adresse est nettoyée", async () => {
    window.history.replaceState({}, "", "/entrer?error=access_denied&error_description=Private%20detail")
    mount(<ConsoleSignInScreen />)
    expect((await screen.findByRole("alert")).textContent).toBe("Vous n’avez pas autorisé la connexion avec IDN. Vous pouvez recommencer quand vous le souhaitez.")
    expect(document.body.textContent).not.toMatch(/Private|access_denied/)
    expect(`${window.location.pathname}${window.location.search}`).toBe("/entrer")
    expect(screen.getByRole("button", { name: "Me connecter avec IDN" }).hasAttribute("disabled")).toBe(false)
  })
  it("un code inconnu ou porteur d'injection devient la phrase générique", async () => {
    window.history.replaceState({}, "", `/entrer?error=${encodeURIComponent("<img src=x onerror=alert(1)>")}`)
    mount(<ConsoleSignInScreen />)
    expect((await screen.findByRole("alert")).textContent).toBe("La connexion avec IDN n’a pas abouti. Vous pouvez recommencer.")
    expect(document.body.innerHTML).not.toContain("onerror")
  })
  it("sans retour d'échec, aucune alerte et la déconnexion incomplète reste lue", async () => {
    window.history.replaceState({}, "", "/entrer?deconnexion=incomplete")
    mount(<ConsoleSignInScreen />)
    expect((await screen.findByRole("alert")).textContent).toContain("déconnexion complète")
    expect(screen.getAllByRole("alert")).toHaveLength(1)
    expect(window.location.search).toBe("?deconnexion=incomplete")
  })
})
