// @vitest-environment jsdom
/** Issue 122 (EA-02) — la porte d'antsia.ga reçoit un refus ou un abandon chez IDN et donne son adresse d'erreur. */
import { BRAND_NAME } from "@antsia/social-contracts/brand"
import { createAppI18n, type Locale } from "@antsia/social-features/i18n"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { appResources } from "@/i18n/resources"
import { routes } from "@/lib/routes"

const mocks = vi.hoisted(() => ({ entry: undefined as { callbackURL: string; errorCallbackURL?: string } | undefined }))

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock("@/components/use-session-state", () => ({ useSessionState: () => ({ status: "signedOut" }) }))
vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => vi.fn() }))
vi.mock("@/lib/auth-client", () => ({ authClient: {} }))
vi.mock("@/lib/session-bridge-client", () => ({ fencedIdentityEntryClient: (client: unknown) => client }))
vi.mock("@antsia/social-features/identity", () => ({
  IdentityEntry: (props: { callbackURL: string; errorCallbackURL?: string }) => {
    mocks.entry = { callbackURL: props.callbackURL, errorCallbackURL: props.errorCallbackURL }
    return <form data-identity-entry="" />
  },
}))

import { SignInCard } from "./sign-in-screen"

let root: Root | undefined
let host: HTMLDivElement | undefined

async function mount(children: ReactNode, locale: Locale = "fr") {
  const i18n = createAppI18n({ locale, appResources, defaultNS: "antsia", defaultVariables: { brand: BRAND_NAME } })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(<I18nextProvider i18n={i18n}>{children}</I18nextProvider>))
}

const alertText = () => host?.querySelector('[role="alert"]')?.textContent ?? null

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "")
  mocks.entry = undefined
  window.history.replaceState({}, "", "/entrer")
})

afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
  vi.unstubAllEnvs()
})

describe("porte d'antsia.ga — retour d'un refus IDN (issue 122, EA-02)", () => {
  it("le refus se dit en phrase connue, sans la valeur reçue, et l'adresse perd ses seuls paramètres de retour", async () => {
    window.history.replaceState({}, "", "/entrer?error=access_denied&error_description=Private%20detail&inscription=1")
    await mount(<SignInCard idnReturn="refused" />)
    expect(alertText()).toBe("Vous n’avez pas autorisé la connexion avec IDN. Vous pouvez recommencer quand vous le souhaitez.")
    expect(host?.textContent).not.toMatch(/Private|access_denied/)
    expect(`${window.location.pathname}${window.location.search}`).toBe("/entrer?inscription=1")
    // Le moyen de recommencer reste là : la porte IDN est rendue sous le refus.
    expect(host?.querySelector("[data-identity-entry]")).not.toBeNull()
  })

  it.each([
    ["unavailable", "IDN ne répond pas pour le moment. Réessayez dans quelques instants."],
    ["accountExists", "Un compte ouvert avec un code utilise déjà cette adresse e-mail. Connectez-vous à ce compte, puis reliez votre identité IDN depuis ses réglages."],
    ["failed", "La connexion avec IDN n’a pas abouti. Vous pouvez recommencer."],
  ] as const)("le refus %s a sa phrase", async (refusal, text) => {
    await mount(<SignInCard idnReturn={refusal} />)
    expect(alertText()).toBe(text)
  })

  it("en anglais, la même phrase traduite", async () => {
    await mount(<SignInCard idnReturn="refused" />, "en")
    expect(alertText()).toBe("You did not authorise sign-in with IDN. You can start again whenever you like.")
  })

  it("sans refus, aucune alerte et l'adresse reste intacte", async () => {
    window.history.replaceState({}, "", "/entrer?inscription=1")
    await mount(<SignInCard />)
    expect(alertText()).toBeNull()
    expect(window.location.search).toBe("?inscription=1")
  })

  it("la porte donne son adresse d'erreur au départ vers IDN", async () => {
    await mount(<SignInCard />)
    expect(mocks.entry?.errorCallbackURL).toBe(routes.signIn())
    expect(mocks.entry?.callbackURL).toBe(routes.welcome())
  })
})
