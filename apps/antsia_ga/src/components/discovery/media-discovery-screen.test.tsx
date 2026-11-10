// @vitest-environment jsdom
import { createAppI18n } from "@antsia/social-features/i18n"
import type { Id } from "@convex/_generated/dataModel"
import type { FeedItem } from "@convex/modules/posts/posts"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { appResources } from "@/i18n/resources"
import { routes } from "@/lib/routes"

type WindowResult = { page: FeedItem[]; isDone: boolean; continueCursor: string }
type QueryState = { data?: WindowResult; error: Error | null; isFetching: boolean }
type QueryArgs = { networkId: string; kind: string; authorHandle?: string; query?: string; revalidationToken: string; paginationOpts: { cursor: string | null; numItems: number } }
type ReaderProps = { children: ReactNode; head?: ReactNode; end?: ReactNode; depth?: number; canLoadMore?: boolean; exhausted?: boolean; onLoadMore?: () => void; restore?: { anchorPostId: string; offset: number; galleryIndex: number | null; depth: number } | null }
const state = vi.hoisted(() => ({
  params: new URLSearchParams(), personId: "reader", immersive: false, online: true,
  pages: new Map<string, QueryState>(), queries: [] as QueryArgs[],
  tokenPages: new Map<string, QueryState>(), holdNewReads: false,
  immersionCalls: [] as { feedId: string | null; depth: number; surface?: string }[],
  reader: null as ReaderProps | null,
  push: vi.fn(), refetch: vi.fn(), changeMode: vi.fn(),
}))
const router = { push: state.push }

vi.mock("@antsia/api/engine", () => ({ api: { modules: { posts: { mediaFeed: { paginate: "media-feed" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "network", personId: state.personId }) }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (_reference: unknown, args: QueryArgs) => {
  state.queries.push(args)
  const data = state.tokenPages.get(args.revalidationToken) ?? (state.holdNewReads ? { error: null, isFetching: true } : state.pages.get(args.paginationOpts.cursor ?? "first"))
  return { ...(data ?? { error: null, isFetching: true }), refetch: state.refetch }
} }))
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => state.params }))
// Le mock du composant Next n'effectue ni optimisation ni requête réseau dans jsdom.
// eslint-disable-next-line @next/next/no-img-element
vi.mock("next/image", () => ({ default: ({ src, alt, width, height }: { src: string; alt: string; width: number; height: number }) => <img src={src} alt={alt} width={width} height={height} /> }))
vi.mock("@antsia/social-features/reseau-personnel", () => ({
  PostCard: ({ post }: { post: FeedItem }) => <article data-post={post._id} data-media-kinds={post.media.map((media) => media.kind).join(",")} />,
  useFeedImmersion: (options: { feedId: string | null; depth: number; surface?: string }) => {
    state.immersionCalls.push(options)
    return { immersive: state.immersive, mode: {}, restore: null, onRestored: () => {}, recordSlotAnchor: () => {}, recordListAnchor: () => {}, surfaceMemory: null, changeMode: state.changeMode }
  },
  useImmersivePageReport: () => {},
  FeedSurfaceMemoryProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  FeedPostMemoryScope: ({ children }: { children: ReactNode }) => <>{children}</>,
  FeedListReturn: () => <span data-return-memory="" />,
  ImmersiveFeedReader: (props: ReaderProps) => { state.reader = props; return <div data-reader="">{props.head}{props.children}{props.end}</div> },
  ImmersiveFeedSlot: ({ children, postId }: { children: ReactNode; postId: string }) => <div data-slot={postId}>{children}</div>,
  ImmersiveStatusSlot: ({ children }: { children: ReactNode }) => <div data-status-slot="">{children}</div>,
}))

import { MediaDiscoveryScreen } from "./media-discovery-screen"

function post(id: string, kind: "image" | "video" = "image"): FeedItem {
  return {
    _id: id as Id<"posts">, body: "", audience: "public", visibility: "root", publishedAt: 1, editedAt: null, isMine: false,
    author: { personId: "author" as Id<"persons">, displayName: "Awa", handle: "awa", headline: null, avatarUrl: null, badges: [] },
    reactions: { counts: { like: 0, bravo: 0, soutien: 0, instructif: 0 }, total: 0, mine: null }, commentCount: 0, shareCount: 0,
    media: [{ kind, url: `https://media.example.test/${id}`, withheld: null, mimeType: kind === "video" ? "video/mp4" : "image/jpeg" }],
    share: null, tags: [], groupId: null, event: null, page: null, reach: null, country: null, origin: null, reason: "public", viewer: { bookmarked: false, notifying: false },
  }
}
function ready(page: FeedItem[], next = "", isDone = !next): QueryState {
  return { data: { page, continueCursor: next, isDone }, error: null, isFetching: false }
}

const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "antsia" })
let root: Root | undefined
let host: HTMLDivElement | undefined
async function render(mode: "explore" | "clips" = "explore") {
  if (!host) { host = document.createElement("div"); document.body.append(host); root = createRoot(host) }
  await act(async () => root!.render(<I18nextProvider i18n={i18n}><MediaDiscoveryScreen mode={mode} /></I18nextProvider>))
}
async function click(label: string) {
  const button = [...host!.querySelectorAll("button")].find((item) => item.textContent === label)
  expect(button, label).toBeDefined()
  await act(async () => button!.click())
}

beforeEach(() => {
  vi.clearAllMocks()
  state.params = new URLSearchParams()
  state.personId = "reader"
  state.immersive = false
  state.pages.clear()
  state.queries = []
  state.immersionCalls = []
  state.reader = null
  state.online = true
  state.holdNewReads = false
  state.tokenPages.clear()
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => state.online)
})
afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove(); host = undefined; root = undefined
  vi.restoreAllMocks()
})

describe("découverte média réactive", () => {
  it("demande les médias autorisés, lie les publications et garde Clips/Boutiques visibles", async () => {
    const withheld = post("withheld")
    withheld.media[0] = { ...withheld.media[0]!, url: null, withheld: "fileQuarantined" }
    state.pages.set("first", ready([post("photo"), post("video", "video"), withheld]))
    await render()
    expect(state.queries.at(-1)).toMatchObject({ kind: "media", paginationOpts: { numItems: 18, cursor: null } })
    const links = [...host!.querySelectorAll("a")].map((link) => link.getAttribute("href"))
    expect(links).toContain(routes.memberPost("photo"))
    expect(links).toContain(routes.memberPost("video"))
    expect(links).not.toContain(routes.memberPost("withheld"))
    expect(links).toContain(routes.clips())
    expect(links).toContain(routes.clips("awa"))
    expect(links).toContain(routes.shopDirectory())
    expect(host!.querySelector("video")?.autoplay).toBe(false)
    expect(host!.querySelector("video")?.muted).toBe(true)
    expect(host!.querySelector("[data-return-memory]")).not.toBeNull()
  })

  it("diffère la source vidéo jusqu'à la proximité sans lancer de lecture", async () => {
    let notify: IntersectionObserverCallback | undefined
    const disconnect = vi.fn()
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { notify = callback }
      observe() {}
      disconnect = disconnect
    })
    try {
      state.pages.set("first", ready([post("video", "video")]))
      await render()
      const video = host!.querySelector("video")!
      expect(video.hasAttribute("src")).toBe(false)
      await act(async () => notify?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))
      expect(video.getAttribute("src")).toBe(post("video", "video").media[0]!.url)
      expect(video.autoplay).toBe(false)
      expect(disconnect).toHaveBeenCalled()
    } finally { vi.unstubAllGlobals() }
  })

  it("une fenêtre vide non terminale garde sa continuation réelle", async () => {
    state.pages.set("first", ready([], "after-empty"))
    state.pages.set("after-empty", ready([post("visible")]))
    await render()
    expect(host!.textContent).toContain("Cette fenêtre ne contient aucun média accessible")
    expect(host!.textContent).not.toContain("Vous avez vu tous les médias")
    await click("Charger la suite")
    expect(state.queries.at(-1)?.paginationOpts.cursor).toBe("after-empty")
    expect(host!.querySelector(`a[href="${routes.memberPost("visible")}"]`)).not.toBeNull()
  })

  it("borne la chaîne à six fenêtres et conserve la suite dans une nouvelle adresse", async () => {
    for (let index = 0; index < 7; index++) state.pages.set(index === 0 ? "first" : `cursor-${index}`, ready([post(`post-${index}`)], `cursor-${index + 1}`))
    await render()
    for (let index = 1; index < 6; index++) await click("Charger la suite")
    expect(new Set(state.queries.map((query) => query.paginationOpts.cursor)).size).toBe(6)
    expect(state.queries.some((query) => query.paginationOpts.cursor === "cursor-6")).toBe(false)
    expect(host!.textContent).toContain("Cette fenêtre est complète")
    expect(host!.textContent).not.toContain("Vous avez vu tous les médias")
    expect(host!.querySelector(`a[href="${routes.mediaWindow({ mode: "explore", cursor: "cursor-6" })}"]`)).not.toBeNull()
  })

  it("ne prolonge pas une réponse périmée pendant isFetching", async () => {
    state.pages.set("first", { ...ready([post("photo")], "stale-cursor"), isFetching: true })
    await render()
    expect([...host!.querySelectorAll("button")].some((button) => button.textContent === "Charger la suite")).toBe(false)
    expect(host!.textContent).not.toContain("Vous avez vu tous les médias")
  })

  it("masque les anciennes données en erreur puis propose la vraie reprise TanStack", async () => {
    state.pages.set("first", { ...ready([post("stale")], "stale-cursor"), error: new Error("unavailable") })
    await render()
    expect(host!.querySelector(`a[href="${routes.memberPost("stale")}"]`)).toBeNull()
    expect(host!.querySelector('[role="alert"]')).not.toBeNull()
    await click("Réessayer")
    expect(state.refetch).toHaveBeenCalledOnce()
  })

  it("retire immédiatement la vignette devenue non délivrable", async () => {
    state.pages.set("first", ready([post("withdrawn")]))
    await render()
    expect(host!.querySelector(`a[href="${routes.memberPost("withdrawn")}"]`)).not.toBeNull()
    state.pages.set("first", ready([]))
    await render()
    expect(host!.querySelector(`a[href="${routes.memberPost("withdrawn")}"]`)).toBeNull()
  })

  it("hors ligne masque les médias et démonte leurs lectures, même si des résultats restent en mémoire", async () => {
    state.pages.set("first", ready([post("private")], "next"))
    await render()
    expect(host!.querySelector(`a[href="${routes.memberPost("private")}"]`)).not.toBeNull()
    await act(async () => { state.online = false; window.dispatchEvent(new Event("offline")) })
    const queryCount = state.queries.length
    expect(host!.querySelector(`a[href="${routes.memberPost("private")}"]`)).toBeNull()
    expect(host!.textContent).toContain("Vous êtes hors ligne")
    expect(host!.textContent).not.toContain("Vous avez vu tous les médias")
    await render()
    expect(state.queries).toHaveLength(queryCount)
  })

  it("au retour en ligne attend une nouvelle souscription et ignore toute ancienne page tardive", async () => {
    state.pages.set("first", ready([post("before-disconnect")], "old-next"))
    await render()
    const oldToken = state.queries.at(-1)!.revalidationToken
    await act(async () => { state.online = false; window.dispatchEvent(new Event("offline")) })
    state.holdNewReads = true
    state.tokenPages.set(oldToken, ready([post("late-old-page")], "late-old-next"))
    await act(async () => { state.online = true; window.dispatchEvent(new Event("online")) })
    const currentToken = state.queries.at(-1)!.revalidationToken
    expect(currentToken).not.toBe(oldToken)
    expect(currentToken.length).toBeLessThanOrEqual(128)
    expect(host!.textContent).toContain("vérification de l’accès aux médias")
    expect(host!.querySelector(".antsia-media-tile")).toBeNull()
    expect([...host!.querySelectorAll("button")].some((button) => button.textContent === "Charger la suite")).toBe(false)
    // Même si l'ancien résultat arrive maintenant, la clé courante ne le lit pas.
    state.tokenPages.set(oldToken, ready([post("late-old-page")]))
    await render()
    expect(host!.querySelector(".antsia-media-tile")).toBeNull()
    state.tokenPages.set(currentToken, ready([post("current-authorized")]))
    await render()
    expect(host!.querySelector(`a[href="${routes.memberPost("current-authorized")}"]`)).not.toBeNull()
    expect(host!.querySelector(`a[href="${routes.memberPost("late-old-page")}"]`)).toBeNull()
    expect(host!.querySelector(`a[href="${routes.memberPost("before-disconnect")}"]`)).toBeNull()
  })

  it("un démarrage déjà hors ligne ne souscrit pas et une reprise en erreur reste fermée", async () => {
    state.online = false
    state.pages.set("first", ready([post("cached")]))
    await render()
    expect(state.queries).toHaveLength(0)
    expect(host!.textContent).toContain("Vous êtes hors ligne")
    state.holdNewReads = true
    await act(async () => { state.online = true; window.dispatchEvent(new Event("online")) })
    const token = state.queries.at(-1)!.revalidationToken
    state.tokenPages.set(token, { ...ready([post("cached")]), error: new Error("access denied") })
    await render()
    expect(host!.querySelector(".antsia-media-tile")).toBeNull()
    expect(host!.querySelector('[role="alert"]')).not.toBeNull()
  })

  it("une autre personne repart de la fenêtre d'adresse sans réutiliser la profondeur", async () => {
    state.pages.set("first", ready([post("one")], "next"))
    state.pages.set("next", ready([post("two")]))
    await render(); await click("Charger la suite")
    expect(state.immersionCalls.at(-1)?.depth).toBe(2)
    state.personId = "another-reader"
    await render()
    expect(state.immersionCalls.at(-1)?.depth).toBe(1)
    expect(host!.querySelector(`a[href="${routes.memberPost("two")}"]`)).toBeNull()
  })

  it("la recherche GET conserve l'auteur et repart sans ancien curseur", async () => {
    state.params = new URLSearchParams({ q: " ancienne ", auteur: "awa", curseur: "old-cursor" })
    state.pages.set("old-cursor", ready([]))
    await render()
    expect(state.queries.at(-1)).toMatchObject({ query: "ancienne", authorHandle: "awa", paginationOpts: { cursor: "old-cursor" } })
    const input = host!.querySelector<HTMLInputElement>('input[name="q"]')!
    expect(input.maxLength).toBe(80)
    expect(host!.querySelector('input[name="curseur"]')).toBeNull()
    // Le formulaire valide sa valeur courante : même sans saisie, le curseur est supprimé.
    await act(async () => host!.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
    expect(state.push).toHaveBeenCalledWith(routes.mediaWindow({ mode: "explore", handle: "awa", query: "ancienne" }))
  })

  it.each([new URLSearchParams({ q: "x".repeat(81) }), new URLSearchParams("auteur=awa&auteur=autre"), new URLSearchParams({ curseur: "x".repeat(4097) })])("refuse un filtre ambigu ou hors borne avant toute lecture", async (params) => {
    state.params = params
    await render()
    expect(state.queries).toHaveLength(0)
    expect(host!.querySelector('[role="alert"]')).not.toBeNull()
  })
})

describe("Clips — source vidéo et lecteur partagé", () => {
  it("la coupure démonte le lecteur et la reprise attend les droits de la nouvelle lecture", async () => {
    state.immersive = true
    state.pages.set("first", ready([post("private-video", "video")]))
    await render("clips")
    expect(host!.querySelector('[data-slot="private-video"]')).not.toBeNull()
    await act(async () => { state.online = false; window.dispatchEvent(new Event("offline")) })
    expect(host!.querySelector("[data-reader]")).toBeNull()
    expect(host!.querySelector("[data-post]")).toBeNull()
    state.holdNewReads = true
    await act(async () => { state.online = true; window.dispatchEvent(new Event("online")) })
    expect(host!.querySelector("[data-reader]")).not.toBeNull()
    expect(host!.querySelector("[data-post]")).toBeNull()
    expect(host!.textContent).toContain("vérification de l’accès aux médias")
  })

  it("requiert kind video, pose le lecteur et exclut les images d'un post mixte", async () => {
    state.immersive = true
    const mixed = post("mixed", "video")
    mixed.media.unshift(post("photo").media[0]!)
    state.pages.set("first", ready([mixed, post("image-only")]))
    await render("clips")
    expect(state.queries.at(-1)?.kind).toBe("video")
    expect(state.immersionCalls.at(-1)).toMatchObject({ surface: "clips", depth: 1 })
    expect(host!.querySelector("[data-reader]")).not.toBeNull()
    expect(host!.querySelector('[data-slot="mixed"] [data-post]')?.getAttribute("data-media-kinds")).toBe("video")
    expect(host!.querySelector('[data-slot="image-only"]')).toBeNull()
    await click("Vue liste")
    expect(state.changeMode).toHaveBeenCalledWith("list")
  })

  it("la liste réelle garde les ancres et propose la bascule en plein écran", async () => {
    state.pages.set("first", ready([post("video", "video")]))
    await render("clips")
    expect(host!.querySelector("[data-reader]")).toBeNull()
    expect(host!.querySelector('[data-feed-anchor="video"] [data-post="video"]')).not.toBeNull()
    expect(host!.querySelector("[data-return-memory]")).not.toBeNull()
    await click("Plein écran")
    expect(state.changeMode).toHaveBeenCalledWith("immersive")
  })

  it("le lecteur reçoit la profondeur et une suite bornée depuis les rapports de fenêtres", async () => {
    state.immersive = true
    state.pages.set("first", ready([], "next"))
    state.pages.set("next", ready([post("video", "video")]))
    await render("clips")
    expect(state.reader).toMatchObject({ depth: 1, canLoadMore: true, exhausted: false })
    await act(async () => state.reader?.onLoadMore?.())
    expect(state.reader).toMatchObject({ depth: 2, canLoadMore: false, exhausted: true })
    expect(host!.querySelector('[data-slot="video"]')).not.toBeNull()
  })
})
