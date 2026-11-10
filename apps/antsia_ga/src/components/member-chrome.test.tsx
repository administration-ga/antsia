// @vitest-environment jsdom
// U02 : scénarios écrits seulement ; aucune exécution pendant le gel de vérification.
import { act, useEffect, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEMO_BACKEND_HOST } from "@/lib/demo-backend"

const state = vi.hoisted(() => ({
  navigation: "destinations" as "destinations" | "volets",
  adaptive: false,
  mobile: false as boolean | null,
  pathname: "/profil/autre",
  search: "",
  openCreation: vi.fn(),
  contentMounted: vi.fn(),
  contentUnmounted: vi.fn(),
}))

vi.mock("@antsia/api/network", () => ({
  useNetwork: () => ({ navigation: state.navigation }),
  useNetworkNavigationLayout: () => ({ adaptive: state.adaptive && state.navigation === "destinations", mobile: state.mobile }),
}))
// Le libellé Menu lit seulement le gabarit ; aucune session Convex n'est requise par ce test de coque.
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: () => ({ data: null, isError: false, isPending: false }) }))
vi.mock("@/components/network-shell", () => ({ useMemberSession: () => ({ person: { published: true, handle: "awa.ndong", displayName: "Awa Ndong", badges: [] } }) }))
vi.mock("@antsia/social-features/notifications", () => ({ NotificationBell: () => <span data-bell="" /> }))
vi.mock("@/components/identity-tools", () => ({ IdentityTools: ({ account }: { account?: boolean }) => <span data-identity={account ? "account" : ""} /> }))
vi.mock("@/lib/sign-out", () => ({ signOutAndRedirect: vi.fn() }))
// La marque de l'activité dans l'en-tête de l'espace lit sa vitrine : hors sujet ici.
vi.mock("./specialized-space-identity", () => ({ SpaceIdentity: ({ fallback }: { fallback: string }) => <span>{fallback}</span>, SpaceCartCount: () => null, useCartLines: () => 0 }))
vi.mock("@antsia/social-features/reseau-personnel", () => ({
  ReseauCreateAction: () => <button type="button" data-create-action="">Créer</button>,
  ReseauMenuRail: (props: { activeTab: unknown; current?: unknown; onCreate?: (kind: "publication") => void; onSelectTab?: unknown }) => (
    <div data-rail={JSON.stringify({ activeTab: props.activeTab, current: props.current ?? "auto", create: typeof props.onCreate === "function", select: props.onSelectTab !== undefined })}>
      <button type="button" data-create-trigger="" onClick={() => props.onCreate?.("publication")}>Créer</button>
    </div>
  ),
  ReseauMobileTabBar: (props: { active: unknown; handle?: unknown; current?: unknown; onCreate?: (kind: "publication") => void }) => (
    <div data-bar={JSON.stringify({ active: props.active, handle: props.handle, current: props.current ?? "auto", create: typeof props.onCreate === "function" })}>
      <button type="button" data-create-trigger="" onClick={() => props.onCreate?.("publication")}>Créer</button>
    </div>
  ),
  PostComposerSheet: (props: { open: boolean }) => <div data-post-sheet={String(props.open)} />,
}))
vi.mock("@antsia/social-features/stories", () => ({ StoryCreateSheet: (props: { open: boolean }) => <div data-story-sheet={String(props.open)} /> }))
vi.mock("@antsia/social-features/features/reseau-personnel/use-creation-controller", () => ({
  useCreationController: () => ({ open: null, openCreation: state.openCreation, close: vi.fn() }),
}))
vi.mock("@antsia/social-features/shell/appearance", () => ({ AppearanceToggle: () => <button type="button" data-appearance="">Apparence</button> }))
vi.mock("@antsia/ui/overlay", () => ({ DESKTOP_ONLY_CLASS: "hidden min-[960px]:block", useIsReseauMobile: () => state.mobile }))
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname, useSearchParams: () => new URLSearchParams(state.search) }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { routes } from "@/lib/routes"
import { MemberPage, MemberTopBar } from "./member-chrome"

let root: Root | undefined
let host: HTMLDivElement | undefined

function StatefulContent() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    state.contentMounted()
    return () => { state.contentUnmounted() }
  }, [])
  return <button type="button" data-member-content="" onClick={() => setCount(value => value + 1)}>contenu propre {count}</button>
}

async function renderMember() {
  if (!host) {
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
  }
  await act(async () => { root?.render(<MemberPage><StatefulContent /></MemberPage>) })
  return host
}

function hrefsOf(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((match) => (match[1] ?? "").replaceAll("&amp;", "&"))
}

function attribute(html: string, name: string): Record<string, unknown> | null {
  const raw = new RegExp(`${name}="([^"]*)"`).exec(html)?.[1]
  return raw === undefined ? null : (JSON.parse(raw.replaceAll("&quot;", '"')) as Record<string, unknown>)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  state.navigation = "destinations"
  state.adaptive = false
  state.mobile = false
  state.pathname = "/profil/autre"
  state.search = ""
})
afterEach(async () => {
  await act(async () => { root?.unmount() })
  host?.remove()
  root = undefined
  host = undefined
  vi.unstubAllGlobals()
})

describe("MemberTopBar — la barre du haut sous les deux navigations", () => {
  it("destinations : marque (retour au fil), cloche, identité et sortie — aucune destination répétée", () => {
    const html = renderToStaticMarkup(<MemberTopBar />)
    expect(hrefsOf(html)).toEqual([routes.feed()])
    expect(html).toContain("data-bell")
    expect(html).toContain("data-identity")
    expect(html).toContain("nav.signOut")
    // La marque des chartes (ADR-0030) : la police d'affichage et son point à l'aplat d'identité.
    expect(html).toContain('data-brand=""')
    expect(html).toContain("var(--font-display, inherit)")
    expect(html).toContain("bg-[var(--primary-fill)]")
    // Plus un second repère « navigation » : un groupe d'outils nommé.
    expect(html).not.toContain("<nav")
    expect(html).toContain('<div aria-label="nav.sessionTools" role="group"')
  })

  it("volets (retour arrière) : les liens d'avant, à l'identique — Mon fil compris", () => {
    state.navigation = "volets"
    const html = renderToStaticMarkup(<MemberTopBar />)
    expect(hrefsOf(html)).toEqual([
      routes.feed(),
      routes.feedPreferences(),
      routes.nationalFeed(),
      routes.discover(),
      routes.moderation(),
      routes.messages(),
      routes.profile("awa.ndong"),
    ])
    expect(html).toContain('<nav aria-label="nav.label"')
  })

  it("masque la barre sous 768 seulement en adaptive ; classic garde son seuil 960", () => {
    state.adaptive = true
    const adaptive = renderToStaticMarkup(<MemberTopBar onMobile="hidden" />)
    expect(adaptive).toContain("hidden min-[768px]:block")
    expect(adaptive).not.toContain("min-[960px]:block")
    state.adaptive = false
    const classic = renderToStaticMarkup(<MemberTopBar onMobile="hidden" />)
    expect(classic).toContain("hidden min-[960px]:block")
    expect(classic).not.toContain("min-[768px]:block")
  })
})

describe("MemberPage — les mêmes destinations que le fil, une coque d'appel intacte", () => {
  it("bureau : le rail des destinations (volets en liens, création branchée), jamais la barre du téléphone", () => {
    const html = renderToStaticMarkup(<MemberPage><p>contenu</p></MemberPage>)
    expect(attribute(html, "data-rail")).toEqual({ activeTab: null, current: "auto", create: true, select: false })
    expect(html).not.toContain("data-bar")
    expect(html).toContain('id="contenu"')
    expect(html).toContain("min-[960px]:grid")
  })

  it("téléphone : la barre basse (identifiant publié transmis), jamais le rail ; le bas de page lui laisse sa place", () => {
    state.mobile = true
    const html = renderToStaticMarkup(<MemberPage><p>contenu</p></MemberPage>)
    expect(attribute(html, "data-bar")).toEqual({ active: null, handle: "awa.ndong", current: "auto", create: true })
    expect(html).not.toContain("data-rail")
    expect(html).toContain("max-[959px]:pb-[calc(6rem+env(safe-area-inset-bottom,0px))]")
  })

  it("avant de connaître la largeur, n'en monte aucun (pas de double carte « Créer »)", () => {
    state.mobile = null
    const html = renderToStaticMarkup(<MemberPage><p>contenu</p></MemberPage>)
    expect(html).not.toContain("data-rail")
    expect(html).not.toContain("data-bar")
  })

  it("range lui-même les pages qu'il est seul à connaître (le fil national sous Découvrir)", () => {
    state.pathname = routes.feed()
    state.search = "portee=national"
    expect(attribute(renderToStaticMarkup(<MemberPage><p>contenu</p></MemberPage>), "data-rail")?.current).toEqual({ id: "decouvrir", current: "section" })
    state.pathname = routes.feedPreferences()
    state.search = ""
    expect(attribute(renderToStaticMarkup(<MemberPage><p>contenu</p></MemberPage>), "data-rail")?.current).toEqual({ id: "profil", current: "section" })
  })

  it("monte les surfaces de création UNE fois pour la page, fermées", () => {
    const html = renderToStaticMarkup(<MemberPage><p>contenu</p></MemberPage>)
    expect(html.match(/data-post-sheet="false"/g)).toHaveLength(1)
    expect(html.match(/data-story-sheet="false"/g)).toHaveLength(1)
  })

  it("une page de direct garde l'écran entier : ni rail, ni barre", () => {
    for (const pathname of [routes.direct("s1"), routes.conference("s1")]) {
      state.pathname = pathname
      for (const mobile of [true, false]) {
        state.mobile = mobile
        const html = renderToStaticMarkup(<MemberPage><p>contenu</p></MemberPage>)
        expect(html).not.toContain("data-rail")
        expect(html).not.toContain("data-bar")
      }
    }
  })

  it("MP01 : une route commerciale branche la coque métier sans rail ni barre sociale", () => {
    state.adaptive = true
    for (const pathname of [routes.storefront("atelier"), routes.shopCatalog("atelier"), routes.shopOffer("atelier", "pro.ga:offer:abc"), routes.serviceBooking("atelier", "pro.ga:offer:abc"), routes.provider("atelier"), routes.providerCatalog("atelier"), routes.providerOffer("atelier", "pro.ga:offer:abc")]) {
      state.pathname = pathname.split("?")[0]!
      for (const mobile of [null, false, true]) {
        state.mobile = mobile
        const html = renderToStaticMarkup(<MemberPage><p data-shop-content="">boutique</p></MemberPage>)
        expect(html).toContain(pathname.startsWith("/prestataire/") || pathname.includes("/rendez-vous/") ? 'data-specialized-space="provider"' : 'data-specialized-space="shop"')
        expect(html).not.toContain("data-rail")
        expect(html).not.toContain("data-bar")
        expect(html).not.toContain("data-post-sheet")
        expect(html).not.toContain("data-story-sheet")
        expect(html.match(/<main\b/g)).toHaveLength(1)
        expect(html.match(/<nav\b/g)).toHaveLength(1)
        expect(html.match(/data-shop-content=""/g)).toHaveLength(1)
      }
    }
  })

  it("volets (retour arrière) : la page d'avant, sans rail, barre ni surface ajoutée", () => {
    state.navigation = "volets"
    const html = renderToStaticMarkup(<MemberPage><p>contenu</p></MemberPage>)
    expect(html).not.toContain("data-rail")
    expect(html).not.toContain("data-bar")
    expect(html).not.toContain("data-post-sheet")
    expect(html).toContain('<main id="contenu" tabindex="-1" class="focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring mx-auto w-full max-w-7xl px-4 py-6 sm:px-5">')
  })
})

describe("MemberPage — transition adaptive sans remontage du contenu", () => {
  it("Messages garde le même cadre : navigation sur la liste, détail immersif au téléphone et rail sur tablette", () => {
    state.adaptive = true
    state.pathname = routes.messages()
    state.mobile = true
    const list = renderToStaticMarkup(<MemberPage workspace><section data-messages-content="" /></MemberPage>)
    expect(list).toContain("antsia-member-workspace")
    expect(list).toContain('data-workspace=""')
    // Messages est reconnu par le moteur : le parent lui laisse ce calcul.
    expect(attribute(list, "data-bar")?.current).toBe("auto")
    expect(list).not.toContain("data-rail")

    const conversation = renderToStaticMarkup(<MemberPage workspace immersiveOnPhone><section data-messages-content="" /></MemberPage>)
    expect(conversation).not.toContain("data-bar")
    expect(conversation).not.toContain("data-rail")
    expect(conversation).toContain("hidden min-[768px]:block")
    expect(conversation.match(/data-messages-content=""/g)).toHaveLength(1)

    state.mobile = false
    const tablet = renderToStaticMarkup(<MemberPage workspace immersiveOnPhone><section data-messages-content="" /></MemberPage>)
    expect(attribute(tablet, "data-rail")?.current).toBe("auto")
    expect(tablet).not.toContain("data-bar")
    expect(tablet.match(/<main\b/g)).toHaveLength(1)
    expect(tablet.match(/data-post-sheet="false"/g)).toHaveLength(1)
  })

  it("l'espace borné conserve toute la hauteur avec la notice flottante", () => {
    state.adaptive = true
    state.pathname = routes.messages()
    state.mobile = false
    try {
      vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "/demo")
      vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", `https://${DEMO_BACKEND_HOST}`)
      expect(renderToStaticMarkup(<MemberPage workspace><section data-messages-content="" /></MemberPage>)).toContain('style="height:100dvh"')
      expect(renderToStaticMarkup(<MemberPage><section data-page-content="" /></MemberPage>)).not.toContain("--antsia-demo-banner-height")
      vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "")
      vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://exemple-production.convex.cloud")
      expect(renderToStaticMarkup(<MemberPage workspace><section data-messages-content="" /></MemberPage>)).not.toContain("--antsia-demo-banner-height")
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("null puis rail/barre/rail conservent le même main et son état ; un seul créateur répond", async () => {
    state.adaptive = true
    state.mobile = null
    const container = await renderMember()
    const main = container.querySelector("main")
    expect(main).not.toBeNull()
    expect(main?.id).toBe("contenu")
    expect(main?.classList.contains("antsia-member-content")).toBe(true)
    expect(container.querySelector(".antsia-member-frame")).not.toBeNull()
    expect(container.querySelector(".antsia-member-rail")).not.toBeNull()
    expect(container.querySelectorAll("[data-rail], [data-bar], [data-create-trigger]")).toHaveLength(0)
    const content = container.querySelector<HTMLButtonElement>("[data-member-content]")
    await act(async () => { content?.click() })
    expect(content?.textContent).toBe("contenu propre 1")

    for (const [index, mobile] of [false, true, false].entries()) {
      state.mobile = mobile
      await renderMember()
      expect(container.querySelector("main")).toBe(main)
      expect(container.querySelector("[data-member-content]")).toBe(content)
      expect(content?.textContent).toBe("contenu propre 1")
      expect(container.querySelectorAll("main#contenu")).toHaveLength(1)
      expect(container.querySelectorAll("[data-member-content]")).toHaveLength(1)
      expect(container.querySelectorAll("[data-rail]")).toHaveLength(mobile ? 0 : 1)
      expect(container.querySelectorAll("[data-bar]")).toHaveLength(mobile ? 1 : 0)
      expect(container.querySelectorAll('[data-post-sheet="false"]')).toHaveLength(1)
      expect(container.querySelectorAll('[data-story-sheet="false"]')).toHaveLength(1)
      expect(container.querySelectorAll("[data-create-trigger]")).toHaveLength(1)
      await act(async () => { container.querySelector<HTMLButtonElement>("[data-create-trigger]")?.click() })
      expect(state.openCreation).toHaveBeenCalledTimes(index + 1)
      expect(state.openCreation).toHaveBeenLastCalledWith("publication")
      expect(state.contentMounted).toHaveBeenCalledOnce()
      expect(state.contentUnmounted).not.toHaveBeenCalled()
    }
  })

  it("un direct ou son alias ne monte aucune navigation, même dans la pose adaptive connue", () => {
    state.adaptive = true
    for (const pathname of [routes.direct("s1"), routes.conference("s1")]) {
      state.pathname = pathname
      for (const mobile of [null, false, true]) {
        state.mobile = mobile
        const html = renderToStaticMarkup(<MemberPage><p data-direct-content="">direct</p></MemberPage>)
        expect(html).not.toContain("data-rail")
        expect(html).not.toContain("data-bar")
        expect(html).not.toContain("data-create-trigger")
        expect(html.match(/<main\b/g)).toHaveLength(1)
        expect(html.match(/data-direct-content=""/g)).toHaveLength(1)
      }
    }
  })

describe("MemberTopBar — U09 (épure) sous l'opt-in adaptatif", () => {
  it("marque, cloche et menu du compte : ni bascule d'apparence, ni sortie, ni Créer au bureau en double", () => {
    state.adaptive = true
    const html = renderToStaticMarkup(<MemberTopBar />)
    expect(hrefsOf(html)).toEqual([routes.feed()])
    expect(html).toContain("data-bell")
    expect(html).toContain('data-identity="account"')
    expect(html).not.toContain("data-appearance")
    expect(html).not.toContain("nav.signOut")
    // Le menu du compte n'est montré qu'à partir de 768 px ; au téléphone, Profil le porte.
    expect(html).toContain("hidden min-[768px]:inline-flex")
    // Créer : au téléphone seulement, devant la marque ; le rail le porte au bureau.
    expect(html).toContain('class="min-[768px]:hidden"><button type="button" data-create-action=""')
    expect(html).toContain("antsia-topbar-row")
  })
})
})
