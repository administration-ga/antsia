// @vitest-environment jsdom
// PA6 : une panne et une fenêtre lacunaire ne deviennent jamais un fil complet vide ; ADR-0028 : sous la charte, la carte de suggestion ouvre la première page, sans carrousels.
import { fireEvent, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { FunctionReturnType } from "convex/server"
import type { api } from "@antsia/api/engine"

import type { EnginePostPresentation } from "@antsia/api/network"
import { renderWithEngine } from "../../tests/engine-wrapper"

type Feed = FunctionReturnType<typeof api.modules.posts.posts.myFeed>
const state = vi.hoisted(() => ({
  data: undefined as Feed | undefined,
  isLoading: false,
  isError: false,
  signingOut: false,
  refetch: vi.fn(async () => undefined),
  prepare: vi.fn(),
}))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: () => state, useConvexMutationQuery: () => ({ mutate: state.prepare }) }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => state.signingOut }))
vi.mock("./PostCard", () => ({ PostCard: ({ post }: { post: { body: string } }) => <p>{post.body}</p> }))
vi.mock("./PagesSuggestionsRail", () => ({ PagesSuggestionsRail: () => <p>Carrousel des pages</p> }))
vi.mock("./SuggestionsPanel", () => ({ SuggestionsPanel: () => <p>Carrousel des personnes</p> }))
vi.mock("./FeedClipsRail", () => ({ FeedClipsRail: () => <p>Aperçus vidéos</p> }))

import { FeedPage } from "./FeedPages"

function mount(first = true, options: { postPresentation?: EnginePostPresentation; interleaveAfter?: (count: number) => number | null } = {}) {
  const onTail = vi.fn()
  const onBoundaryShift = vi.fn()
  const element = () => <FeedPage cursor={null} pageIndex={first ? 0 : 1} pageKey="page" nextMountedCursor={undefined} scope="recents" now={0} isFirst={first} isLast interleaveAfter={options.interleaveAfter ?? null} onTag={vi.fn()} onMention={vi.fn()} onTail={onTail} onBoundaryShift={onBoundaryShift} emptyFallback={<p>Fil vide</p>} />
  const view = renderWithEngine(element(), { postPresentation: options.postPresentation })
  return { onTail, onBoundaryShift, rerender: () => view.rerender(element()) }
}

beforeEach(() => { vi.clearAllMocks(); state.data = undefined; state.isLoading = false; state.isError = false; state.signingOut = false })

describe("FeedPage — vérité des états", () => {
  it("prépare une seule fois la première page admise et annonce la préparation", () => {
    state.data = { items: [], nextCursor: null, lacunar: true, preparing: true }
    mount()
    expect(state.prepare).toHaveBeenCalledOnce()
    expect(screen.getByText(/Votre fil se prépare/)).toBeTruthy()
    expect(screen.queryByText("Fil vide")).toBeNull()
  })

  it("une continuation n'amorce pas une nouvelle préparation", () => {
    state.data = { items: [], nextCursor: null, lacunar: true, preparing: true }
    mount(false)
    expect(state.prepare).not.toHaveBeenCalled()
    expect(screen.queryByText(/Votre fil se prépare/)).toBeNull()
  })

  it("n'amorce aucun travail si la première réponse arrive pendant la déconnexion", () => {
    const view = mount()
    state.signingOut = true
    state.data = { items: [], nextCursor: null, lacunar: true, preparing: true, preparationKey: "a".repeat(64) }
    view.rerender()
    expect(state.prepare).not.toHaveBeenCalled()
  })

  it("ne prépare pas une nouvelle génération pendant la sortie et ne consomme pas sa clé", () => {
    state.data = { items: [], nextCursor: null, lacunar: true, preparing: true, preparationKey: "a".repeat(64) }
    const view = mount()
    expect(state.prepare).toHaveBeenCalledOnce()
    state.signingOut = true
    state.data = { ...state.data, preparationKey: "b".repeat(64) }
    view.rerender()
    expect(state.prepare).toHaveBeenCalledTimes(1)
    // Une prochaine admission réarme la même clé ; le refus local ne l'a pas marquée préparée.
    const deferredPage = state.data
    state.data = undefined; view.rerender()
    state.signingOut = false; state.data = deferredPage; view.rerender()
    expect(state.prepare).toHaveBeenCalledTimes(2)
  })

  it("réveille une version manquante une seule fois et réarme après une erreur d'accès", () => {
    state.data = { items: [], nextCursor: null, lacunar: true, preparing: true, preparationKey: "a".repeat(64) }
    const view = mount()
    view.rerender()
    expect(state.prepare).toHaveBeenCalledTimes(1)
    state.data = { ...state.data, preparationKey: "b".repeat(64) }
    view.rerender()
    expect(state.prepare).toHaveBeenCalledTimes(2)
    state.isError = true; view.rerender()
    state.isError = false; view.rerender()
    expect(state.prepare).toHaveBeenCalledTimes(3)
  })

  it("date la limite historique sur la première page", () => {
    state.data = { items: [], nextCursor: null, lacunar: true, materializedSince: Date.UTC(2026, 8, 18) }
    mount()
    expect(screen.getByText(/Ce fil présente les publications depuis le/)).toBeTruthy()
  })

  it("une erreur masque même une ancienne page et permet de réessayer", () => {
    state.isError = true
    state.data = { items: [{ body: "Ancien contenu" } as Feed["items"][number]], nextCursor: null, lacunar: false }
    const { onTail } = mount()
    expect(screen.queryByText("Ancien contenu")).toBeNull()
    expect(screen.queryByText("Fil vide")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
    expect(state.refetch).toHaveBeenCalledOnce()
    expect(onTail).not.toHaveBeenCalled()
  })

  it("une page vide avec curseur garde sa suite et annonce sa lacune", () => {
    const cursor = { publishedAt: 1, postId: "posts_next" as never }
    state.data = { items: [], nextCursor: cursor, lacunar: true }
    const { onTail } = mount(false)
    expect(screen.getByRole("status")).toHaveTextContent(/incomplet/)
    expect(screen.queryByText("Fil vide")).toBeNull()
    expect(onTail).toHaveBeenCalledWith("page", cursor)
  })

  it("un résultat réellement vide et complet affiche seulement son état vide", () => {
    state.data = { items: [], nextCursor: null, lacunar: false }
    const { onTail } = mount()
    expect(screen.getByText("Fil vide")).toBeTruthy()
    expect(screen.queryByRole("status")).toBeNull()
    expect(onTail).toHaveBeenCalledWith("page", null)
  })

  it.each([null, { publishedAt: 1, postId: "posts_next" as never }])("une première fenêtre lacunaire ne prétend jamais que le fil est vide, curseur %s", (cursor) => {
    state.data = { items: [], nextCursor: cursor, lacunar: true }
    const { onTail } = mount()
    expect(screen.getByRole("status")).toHaveTextContent(/incomplet/)
    expect(screen.queryByText("Fil vide")).toBeNull()
    expect(onTail).toHaveBeenCalledWith("page", cursor)
  })

  it("une première page encore poursuivable attend sa suite avant d'annoncer le vide", () => {
    const cursor = { publishedAt: 1, postId: "posts_next" as never }
    state.data = { items: [], nextCursor: cursor, lacunar: false }
    const { onTail } = mount()
    expect(screen.queryByText("Fil vide")).toBeNull()
    expect(onTail).toHaveBeenCalledWith("page", cursor)
  })

  it("un chargement ne prétend pas que le fil est vide", () => {
    state.isLoading = true
    const { onTail } = mount()
    expect(screen.queryByText("Fil vide")).toBeNull()
    expect(onTail).not.toHaveBeenCalled()
  })
})

describe("FeedPage — écran des chartes (ADR-0028, ADR-0037)", () => {
  const post = (id: string, body: string) => ({ _id: id, body }) as unknown as Feed["items"][number]
  const fourPosts = () => ({ items: [post("posts_1", "Un"), post("posts_2", "Deux"), post("posts_3", "Trois"), post("posts_4", "Quatre")], nextCursor: null, lacunar: false })
  const afterThird = (count: number) => (count > 3 ? 3 : null)
  const follows = (a: string, b: string) => (screen.getByText(a).compareDocumentPosition(screen.getByText(b)) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

  it("aucune carte en tête : les personnes à découvrir suivent la troisième publication, les clips la cinquième place", () => {
    state.data = fourPosts()
    mount(true, { postPresentation: "charte", interleaveAfter: afterThird })
    expect(follows("Carrousel des personnes", "Un")).toBe(false)
    expect(follows("Trois", "Carrousel des personnes")).toBe(true)
    expect(follows("Carrousel des personnes", "Quatre")).toBe(true)
    // Au téléphone seulement (`.rp-feed-inline`) : le rail droit du bureau porte les mêmes données.
    expect(screen.getByText("Carrousel des personnes").closest(".rp-feed-inline")).not.toBeNull()
    expect(screen.getByText("Carrousel des pages")).toBeTruthy()
    expect(follows("Quatre", "Aperçus vidéos")).toBe(true)
  })

  it("un fil plus court que l'intercalage montre les personnes à découvrir après sa dernière publication", () => {
    state.data = { items: [post("posts_1", "Un"), post("posts_2", "Deux")], nextCursor: null, lacunar: false }
    mount(true, { postPresentation: "charte", interleaveAfter: afterThird })
    expect(follows("Deux", "Carrousel des personnes")).toBe(true)
  })

  it("un fil vide montre les personnes à découvrir au-dessus de son état vide", () => {
    state.data = { items: [], nextCursor: null, lacunar: false }
    mount(true, { postPresentation: "charte" })
    expect(follows("Carrousel des personnes", "Fil vide")).toBe(true)
  })

  it("une page suivante n'ouvre rien", () => {
    state.data = fourPosts()
    mount(false, { postPresentation: "charte" })
    expect(screen.queryByText("Carrousel des personnes")).toBeNull()
  })

  it("sans la charte, les carrousels restent intercalés après la 3ᵉ publication", () => {
    state.data = fourPosts()
    mount(true, { interleaveAfter: afterThird })
    expect(follows("Trois", "Carrousel des personnes")).toBe(true)
  })

  it("sans la charte, un fil court n'intercale rien", () => {
    state.data = { items: [post("posts_1", "Un")], nextCursor: null, lacunar: false }
    mount(true, { interleaveAfter: afterThird })
    expect(screen.queryByText("Carrousel des personnes")).toBeNull()
  })
})
