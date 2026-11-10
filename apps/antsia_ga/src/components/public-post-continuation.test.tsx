// @vitest-environment jsdom
import { BRAND_NAME } from "@antsia/social-contracts/brand"
import { createAppI18n } from "@antsia/social-features/i18n"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { appResources } from "@/i18n/resources"
import { routes } from "@/lib/routes"
import type { SpecializedDestination } from "@/lib/specialized-navigation"

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  status: "signedOut",
  callbackURL: undefined as string | undefined,
  authenticated: undefined as (() => void) | undefined,
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }))
// Session conforme à `SessionState` : un état admis porte sa personne (aucun accord de mesure) et la racine.
vi.mock("@/components/use-session-state", () => ({
  useSessionState: () => mocks.status === "welcome" ? { status: mocks.status, person: null, root: { slug: "antsia" } }
    : mocks.status === "member" || mocks.status === "restricted" ? { status: mocks.status, person: { consentsInForce: [] }, root: { slug: "antsia" } }
    : { status: mocks.status },
}))
vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => vi.fn() }))
vi.mock("@antsia/api/viewer-preferences", () => ({ useViewerTimeZone: () => "UTC" }))
vi.mock("@/lib/auth-client", () => ({ authClient: {} }))
vi.mock("@/lib/session-bridge-client", () => ({ fencedIdentityEntryClient: (client: unknown) => client }))
vi.mock("@antsia/social-features/identity", () => ({
  IdentityEntry: ({ callbackURL, onAuthenticated }: { callbackURL: string; onAuthenticated: () => void }) => {
    mocks.callbackURL = callbackURL
    mocks.authenticated = onAuthenticated
    return <form data-identity-entry="" />
  },
}))

import { UsagePermissionProvider } from "./analytics-permission"
import { SignInCard } from "./sign-in-screen"
import { WelcomeScreen } from "./welcome-screen"

const POST_ID = "jd7c7gw7f0nkf8kv8dazmw86ps8r4qgq"
let root: Root | undefined
let host: HTMLDivElement | undefined

async function mount(children: ReactNode) {
  const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "antsia", defaultVariables: { brand: BRAND_NAME } })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  // Même arbre que `Providers` : la bienvenue mesure l'entrée sous la permission d'usage.
  await act(async () => root!.render(<I18nextProvider i18n={i18n}><UsagePermissionProvider>{children}</UsagePermissionProvider></I18nextProvider>))
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "")
  vi.clearAllMocks()
  mocks.status = "signedOut"
  mocks.callbackURL = undefined
  mocks.authenticated = undefined
})

afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("connexion — retour vers la publication après admission", () => {
  it("transmet la continuation au fournisseur et au passage vers l'inscription", async () => {
    await mount(<SignInCard publicPostId={POST_ID} />)
    expect(mocks.callbackURL).toBe(routes.welcome(POST_ID))
    expect(host?.querySelector("a")?.getAttribute("href")).toBe(routes.signIn("sign-up", POST_ID))
  })

  it("conserve la publication en revenant de l'inscription à la connexion", async () => {
    await mount(<SignInCard intent="sign-up" publicPostId={POST_ID} />)
    expect(host?.querySelector("a")?.getAttribute("href")).toBe(routes.signIn(undefined, POST_ID))
  })

  it("préserve la continuation dans le callback et la navigation complète du build démo", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "/demo")
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://vivid-hedgehog-655.convex.cloud")
    const assign = vi.fn()
    vi.stubGlobal("location", { ...window.location, assign })
    await mount(<SignInCard publicPostId={POST_ID} />)
    expect(mocks.callbackURL).toBe(`/demo/bienvenue?publication=${POST_ID}`)
    await act(async () => mocks.authenticated?.())
    expect(assign).toHaveBeenCalledExactlyOnceWith(`/demo/bienvenue?publication=${POST_ID}`)
    expect(host?.querySelector("a")?.getAttribute("href")).toBe(routes.signIn("sign-up", POST_ID))
  })

  it("conserve une destination logique pour le routeur Next dans le build démo", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "/demo")
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://vivid-hedgehog-655.convex.cloud")
    mocks.status = "member"
    await mount(<SignInCard publicPostId={POST_ID} />)
    expect(mocks.replace).toHaveBeenCalledWith(routes.memberPost(POST_ID))
  })

  it.each([
    ["member", routes.memberPost(POST_ID)],
    ["welcome", routes.welcome(POST_ID)],
    ["restricted", routes.personalControls()],
  ])("redirige une session %s vers sa destination autorisée", async (status, destination) => {
    mocks.status = status
    await mount(<SignInCard publicPostId={POST_ID} />)
    expect(mocks.replace).toHaveBeenCalledWith(destination)
    expect(host?.querySelector("form")).toBeNull()
  })

  it("ne contourne pas la déconnexion incomplète pour reprendre une publication", async () => {
    mocks.status = "member"
    await mount(<SignInCard publicPostId={POST_ID} signOutIncomplete />)
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(host?.querySelector("form")).not.toBeNull()
  })
})

describe("bienvenue — reprise de la publication", () => {
  it.each([
    ["member", routes.memberPost(POST_ID)],
    ["signedOut", routes.signIn(undefined, POST_ID)],
    ["restricted", routes.personalControls()],
  ])("conserve la continuation sans contourner une session %s", async (status, destination) => {
    mocks.status = status
    await mount(<WelcomeScreen publicPostId={POST_ID} />)
    expect(mocks.replace).toHaveBeenCalledWith(destination)
  })

  it("rabat un identifiant invalide vers le fil pour un membre", async () => {
    mocks.status = "member"
    await mount(<WelcomeScreen publicPostId="//example.test" />)
    expect(mocks.replace).toHaveBeenCalledWith(routes.feed())
  })
})

const SHOP_DESTINATION: SpecializedDestination = { kind: "offer", handle: "atelier.ndong", offerRef: "pro.ga:offer:ABC123" }

describe("connexion et bienvenue — reprise d'un espace spécialisé", () => {
  it("garde la fiche dans le callback et dans le lien d'inscription", async () => {
    await mount(<SignInCard specializedDestination={SHOP_DESTINATION} />)
    expect(mocks.callbackURL).toBe(routes.welcome(undefined, undefined, undefined, SHOP_DESTINATION))
    expect(host?.querySelector("a")?.getAttribute("href")).toBe(routes.signIn("sign-up", undefined, undefined, undefined, SHOP_DESTINATION))
  })

  it("garde le catalogue en revenant de l'inscription à la connexion", async () => {
    const destination: SpecializedDestination = { kind: "catalog", handle: "atelier.ndong" }
    await mount(<SignInCard intent="sign-up" specializedDestination={destination} />)
    expect(host?.querySelector("a")?.getAttribute("href")).toBe(routes.signIn(undefined, undefined, undefined, undefined, destination))
  })

  it.each([
    ["member", routes.shopOffer(SHOP_DESTINATION.handle, SHOP_DESTINATION.offerRef)],
    ["welcome", routes.welcome(undefined, undefined, undefined, SHOP_DESTINATION)],
    ["restricted", routes.personalControls()],
  ])("redirige la connexion %s sans dépasser ses droits", async (status, expected) => {
    mocks.status = status
    await mount(<SignInCard specializedDestination={SHOP_DESTINATION} />)
    expect(mocks.replace).toHaveBeenCalledWith(expected)
  })

  it.each([
    ["member", routes.shopOffer(SHOP_DESTINATION.handle, SHOP_DESTINATION.offerRef)],
    ["signedOut", routes.signIn(undefined, undefined, undefined, undefined, SHOP_DESTINATION)],
    ["restricted", routes.personalControls()],
  ])("redirige la bienvenue %s sans rejouer d'acte commercial", async (status, expected) => {
    mocks.status = status
    await mount(<WelcomeScreen specializedDestination={SHOP_DESTINATION} />)
    expect(mocks.replace).toHaveBeenCalledWith(expected)
  })

  it("garde la publication prioritaire sur un espace spécialisé", async () => {
    mocks.status = "member"
    await mount(<SignInCard publicPostId={POST_ID} specializedDestination={SHOP_DESTINATION} />)
    expect(mocks.replace).toHaveBeenCalledWith(routes.memberPost(POST_ID))
  })

  it("garde le contact commercial prioritaire sur un espace spécialisé", async () => {
    mocks.status = "member"
    await mount(<WelcomeScreen shopContact={{ kind: "shop_contact", handle: "atelier.ndong" }} specializedDestination={SHOP_DESTINATION} />)
    expect(mocks.replace).toHaveBeenCalledWith(routes.shopContact("atelier.ndong"))
  })

  it("reste bloqué sur une déconnexion incomplète et conserve le repli sûr", async () => {
    mocks.status = "member"
    await mount(<SignInCard specializedDestination={SHOP_DESTINATION} signOutIncomplete />)
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(host?.querySelector("form")).not.toBeNull()
  })

  it("refuse une destination forgée reçue comme prop", async () => {
    mocks.status = "member"
    const invalid = { kind: "offer", handle: "atelier", offerRef: "https://example.test/private" } as SpecializedDestination
    await mount(<WelcomeScreen specializedDestination={invalid} />)
    expect(mocks.replace).toHaveBeenCalledWith(routes.feed())
  })

  it("garde la continuation fermée dans la navigation complète démo", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "/demo")
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://vivid-hedgehog-655.convex.cloud")
    const assign = vi.fn()
    vi.stubGlobal("location", { ...window.location, assign })
    await mount(<SignInCard specializedDestination={SHOP_DESTINATION} />)
    const callback = routes.welcome(undefined, undefined, undefined, SHOP_DESTINATION)
    expect(mocks.callbackURL).toBe(`/demo${callback}`)
    await act(async () => mocks.authenticated?.())
    expect(assign).toHaveBeenCalledExactlyOnceWith(`/demo${callback}`)
  })
})
