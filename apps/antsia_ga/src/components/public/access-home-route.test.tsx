import type { PublicNetworkSnapshot, PublicPost } from "@antsia/social-contracts/publicNetwork"
import { createAppI18n } from "@antsia/social-features/i18n"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { appResources } from "@/i18n/resources"
import { routes } from "@/lib/routes"

const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), posts: vi.fn() }))
vi.mock("@/components/access-home-screen", () => ({ AccessHomeScreen: () => <div data-access-home="true" /> }))
vi.mock("@/lib/server-session", () => ({ getPublicLocale: async () => "fr" }))
vi.mock("@/lib/public-data", () => ({
  loadPublicSnapshot: mocks.snapshot,
  loadPublicPosts: mocks.posts,
  publicSearch: (search: Record<string, unknown>) => ({ cursor: typeof search.cursor === "string" ? search.cursor : null, handoff: Object.hasOwn(search, "ott") }),
}))
vi.mock("./public-shell", () => ({ PUBLIC_CTA: "", PUBLIC_LINK: "", PublicShell: ({ children }: { children: ReactNode }) => <div data-public-shell="true">{children}</div> }))
vi.mock("./public-status", () => ({ PublicStatus: ({ status }: { status: string }) => <div data-public-status={status} /> }))

import { DiscoverScreen, HomeScreen } from "./public-routes"

function renderPublic(children: ReactNode) {
  const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "antsia" })
  return renderToStaticMarkup(<I18nextProvider i18n={i18n}>{children}</I18nextProvider>)
}

const post: PublicPost = { id: "public-home-post", body: "Une contribution publique", publishedAt: 1_700_000_000_000, editedAt: null, tags: [], province: null, author: { kind: "person", handle: null, displayName: null, badges: [], avatarUrl: null }, origin: { slug: "antsia", name: "ANTSIA" }, media: [], shared: null }
const snapshot: PublicNetworkSnapshot = { generatedAt: null, periodStart: null, periodEnd: null, publishedPosts: null, officialPages: null, networks: [], trends: [], bounded: false }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.snapshot.mockResolvedValue({ status: "ready", viewer: "anonymous", data: snapshot })
  mocks.posts.mockResolvedValue({ status: "ready", viewer: "anonymous", data: { page: [], isDone: true, continueCursor: "" } })
})
describe("route d'accueil — garde OTT", () => {
  it("rend la porte d'accès seule, sans charger ni dévoiler des publications disponibles", async () => {
    mocks.posts.mockResolvedValue({ status: "ready", viewer: "anonymous", data: { page: [post], isDone: true, continueCursor: "" } })
    const html = renderPublic(await HomeScreen({}))
    expect(html).toContain('data-access-home="true"')
    expect(html).not.toContain('id="public-home-feed"')
    expect(html).not.toContain('data-post-presentation="charte"')
    expect(html).not.toContain(post.body)
    expect(mocks.posts).not.toHaveBeenCalled()
    expect(mocks.snapshot).not.toHaveBeenCalled()
  })

  it("ignore le curseur public sur la porte d'accès, sans lancer une lecture de fil", async () => {
    mocks.posts.mockResolvedValue({ status: "ready", viewer: "anonymous", data: { page: [], isDone: false, continueCursor: "next=opaque" } })
    const html = renderPublic(await HomeScreen({ searchParams: Promise.resolve({ cursor: "previous-window" }) }))
    expect(html).toContain('data-access-home="true"')
    expect(html).not.toContain("previous-window")
    expect(html).not.toContain("next=opaque")
    expect(html).not.toContain("Page suivante")
    expect(mocks.posts).not.toHaveBeenCalled()
    expect(mocks.snapshot).not.toHaveBeenCalled()
  })

  it.each(["refused", "unavailable"] as const)("ne fait pas dépendre l'accès d'une projection publique %s", async (status) => {
    mocks.posts.mockResolvedValue({ status })
    mocks.snapshot.mockResolvedValue({ status })
    const html = renderPublic(await HomeScreen({}))
    expect(html).toContain('data-access-home="true"')
    expect(html).not.toContain('data-public-status=')
    expect(html).not.toContain('data-post-presentation="charte"')
    expect(mocks.posts).not.toHaveBeenCalled()
    expect(mocks.snapshot).not.toHaveBeenCalled()
  })

  it("un OTT, même vide, garde le passage sur cette origine sans rendre la carte ou des contenus", async () => {
    for (const ott of ["", "private-one-time-token"]) {
      const html = renderToStaticMarkup(await HomeScreen({ searchParams: Promise.resolve({ ott }) }))
      expect(html).toContain('data-public-status="handoff"')
      expect(html).not.toContain("data-access-home")
      expect(html).not.toContain('id="public-home-feed"')
      expect(html).not.toContain('data-post-presentation="charte"')
      expect(html).not.toContain("private-one-time-token")
    }
    expect(mocks.snapshot).not.toHaveBeenCalled()
    expect(mocks.posts).not.toHaveBeenCalled()
  })
})


// L'aperçu public vit dans Découvrir, pas dans la porte d'accès : garder ici la couverture de route
// (chargement, refus et continuation d'une fenêtre filtrée vide), sans rétablir l'ancien accueil.
describe("route Découvrir — lecture publique", () => {
  it("rend les publications dans le HTML initial avec une identité neutre et la porte de participation", async () => {
    mocks.posts.mockResolvedValue({ status: "ready", viewer: "anonymous", data: { page: [post], isDone: true, continueCursor: "" } })
    const html = renderPublic(await DiscoverScreen({}))
    expect(html).toContain('data-public-shell="true"')
    expect(html).not.toContain('data-access-home="true"')
    expect(html).toContain('data-post-presentation="charte"')
    expect(html).toContain(post.body)
    expect(html).toContain("Profil non publié")
    expect(html).toContain(`href="${routes.signIn(undefined, post.id)}"`)
    expect(mocks.posts).toHaveBeenCalledExactlyOnceWith(null, undefined, undefined, false)
    expect(mocks.snapshot).toHaveBeenCalledExactlyOnceWith(false)
  })

  it("conserve la page suivante d'une fenêtre publique vide sur Découvrir", async () => {
    mocks.posts.mockResolvedValue({ status: "ready", viewer: "anonymous", data: { page: [], isDone: false, continueCursor: "next=opaque" } })
    const html = renderPublic(await DiscoverScreen({ searchParams: Promise.resolve({ cursor: "previous-window" }) }))
    expect(mocks.posts).toHaveBeenCalledExactlyOnceWith("previous-window", undefined, undefined, false)
    expect(html).toContain("Cette fenêtre ne contient aucune publication visible")
    expect(html).toContain(`href="${routes.discover()}?cursor=next%3Dopaque"`)
    expect(html).toContain("Page suivante")
    expect(html).not.toContain('data-post-presentation="charte"')
  })

  it.each(["refused", "unavailable"] as const)("rend l'état %s sans inventer de publication", async (status) => {
    mocks.posts.mockResolvedValue({ status })
    const html = renderPublic(await DiscoverScreen({}))
    expect(html).toContain(`data-public-status="${status}"`)
    expect(html).not.toContain('data-post-presentation="charte"')
    expect(html).not.toContain(post.body)
    expect(mocks.posts).toHaveBeenCalledExactlyOnceWith(null, undefined, undefined, false)
  })
})
