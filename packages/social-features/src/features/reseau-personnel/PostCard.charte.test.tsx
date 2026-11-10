// Écrit pour le moteur (ADR-0028) : la publication de l'écran des chartes — texte, média posé, rangée d'icônes, badges en signes, évènement avec Participer et Plus tard.
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EngineTestWrapper, renderWithEngine, TEST_NETWORK_ID, TEST_ROUTES } from "../../tests/engine-wrapper"

const mocks = vi.hoisted(() => ({
  calls: [] as { ref: string; args: unknown }[],
}))

vi.mock("@antsia/api/engine", () => ({
  api: {
    modules: {
      engagement: { engagement: { toggleReaction: "toggleReaction", paginateComments: "paginateComments", paginateReplies: "paginateReplies", comment: "comment", removeComment: "removeComment", editComment: "editComment" } },
      posts: { posts: { remove: "remove", withdrawFromRoot: "withdrawFromRoot", edit: "edit", pinOnMyWall: "pinOnMyWall", publish: "publish" } },
      pages: { pages: { removePagePost: "removePagePost" } },
      moderation: { moderation: { reportPost: "reportPost", reportComment: "reportComment" } },
      marks: { marks: { toggleMark: "toggleMark", hidePost: "hidePost", unhidePost: "unhidePost", muteAuthor: "muteAuthor", unmuteAuthor: "unmuteAuthor" } },
      events: { events: { respond: "respond" } },
    },
  },
}))

vi.mock("convex/react", () => ({
  useMutation: (ref: string) => async (args: unknown) => {
    mocks.calls.push({ ref, args })
    if (ref === "toggleMark") return { marked: true }
    if (ref === "respond") return { status: "accepted" }
    return { ok: true }
  },
}))

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { PostCard, type PostCardPost } from "./PostCard"

const NOW = Date.UTC(2026, 9, 19, 10)

const base: PostCardPost = {
  _id: "posts_1" as never,
  body: "Lever de soleil sur la baie de la Mondah ce matin. #Akanda",
  audience: "public",
  visibility: "network",
  publishedAt: NOW - 2 * 3_600_000,
  editedAt: null,
  isMine: false,
  author: { personId: "persons_clarisse" as never, handle: "clarisse.obame", displayName: "Clarisse OBAME", headline: "Libreville", avatarUrl: null, badges: ["verified", "community"] },
  reactions: { counts: { like: 248, bravo: 0, soutien: 0, instructif: 0 }, total: 248, mine: "like" },
  commentCount: 31,
  shareCount: 12,
  media: [{ kind: "image", mimeType: "image/jpeg", url: "https://media.example/mondah.jpg", withheld: null, width: 1200, height: 800, altText: "La baie de la Mondah" }],
  share: null,
  tags: ["akanda"],
  groupId: null,
  event: null,
  page: null,
  reach: null,
  country: null,
  origin: null,
  reason: "connection",
  viewer: { bookmarked: false, notifying: false },
}

function renderCharte(post: PostCardPost) {
  return renderWithEngine(<PostCard post={post} now={NOW} />, { postPresentation: "charte" })
}

/** `first` précède-t-il `second` dans le document ? */
function expectBefore(first: Element | null, second: Element | null) {
  expect(first).not.toBeNull()
  expect(second).not.toBeNull()
  expect(first!.compareDocumentPosition(second!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
}

beforeEach(() => {
  mocks.calls = []
})
afterEach(() => vi.restoreAllMocks())

describe("MP13 : aperçu éditorial injecté", () => {
  it.each(["classic", "media", "charte"] as const)("rend un article sans corps dans la présentation %s", presentation => {
    const post = { ...base, body: "", media: [], hasEditorialArticle: true }
    renderWithEngine(<PostCard post={post} now={NOW} />, { postPresentation: presentation, PostArticleRenderer: ({ postId }) => <a href={`/article/${postId}`}>Article courant</a> })
    expect(screen.getByRole("link", { name: "Article courant" }).getAttribute("href")).toBe(`/article/${post._id}`)
  })

  it("rend la référence de l'original partagé au lieu de celle du partageur", () => {
    const post: PostCardPost = { ...base, media: [], share: { available: true, postId: "posts_original" as never, page: null, author: { displayName: "Rédaction", handle: "journal", avatarUrl: null }, body: "", media: [], publishedAt: NOW, hasEditorialArticle: true } }
    renderWithEngine(<PostCard post={post} now={NOW} />, { postPresentation: "charte", PostArticleRenderer: ({ postId }) => <a href={`/article/${postId}`}>Article courant</a> })
    expect(screen.getByRole("link", { name: "Article courant" }).getAttribute("href")).toBe("/article/posts_original")
  })

  it("garde la surface historique sans opt-in et ne rend pas l'original retiré", () => {
    const view = renderWithEngine(<PostCard post={{ ...base, hasEditorialArticle: true }} now={NOW} />)
    expect(screen.queryByRole("link", { name: "Article courant" })).toBeNull()
    view.unmount()
    renderWithEngine(<PostCard post={{ ...base, share: { available: false } }} now={NOW} />, { PostArticleRenderer: () => <a href="/article">Article courant</a> })
    expect(screen.queryByRole("link", { name: "Article courant" })).toBeNull()
  })
})

describe("PostCard — présentation « charte » (ADR-0028)", () => {
  it("en ANTSIA adaptive, place média et actions avant la légende, avec l'audience visible", () => {
    const view = renderWithEngine(<PostCard post={base} now={NOW} />, {
      postPresentation: "charte",
      navigation: "destinations",
      navigationLayout: "adaptive",
      routes: { ...TEST_ROUTES, discover: () => "/decouvrir", me: () => "/moi" },
    })
    const article = view.container.querySelector("article")!
    expect(article).toHaveAttribute("data-post-layout", "media-first")
    const media = article.querySelector(".rpm-m")
    const actions = within(article).getByRole("group", { name: "Actions sur la publication" })
    const caption = article.querySelector(".rp-charte-caption")
    expectBefore(media, actions)
    expectBefore(actions, caption)
    expect(caption).toHaveTextContent("Lever de soleil")
    expect(article.querySelector(".rp-charte-audience")).toHaveTextContent("Tout le réseau")
  })

  it("le texte seul reste lisible avant les actions, sans cadre média vide", () => {
    const body = "Texte sans média. ".repeat(35)
    const view = renderWithEngine(<PostCard post={{ ...base, media: [], body }} now={NOW} />, {
      postPresentation: "charte",
      navigation: "destinations",
      navigationLayout: "adaptive",
      routes: { ...TEST_ROUTES, discover: () => "/decouvrir", me: () => "/moi" },
    })
    const article = view.container.querySelector("article")!
    const text = within(article).getByText(body.trim())
    const actions = within(article).getByRole("group", { name: "Actions sur la publication" })
    expectBefore(text, actions)
    expect(article.querySelector(".rpm-m")).toBeNull()
    expect(article.querySelector(".rp-charte-caption")).toBeNull()
  })

  it("la légende longue s'ouvre puis se replie en conservant le focus sur sa commande", () => {
    const body = "Une légende longue pour ce média. ".repeat(24)
    renderWithEngine(<PostCard post={{ ...base, body }} now={NOW} />, {
      postPresentation: "charte",
      navigation: "destinations",
      navigationLayout: "adaptive",
      routes: { ...TEST_ROUTES, discover: () => "/decouvrir", me: () => "/moi" },
    })
    const more = screen.getByRole("button", { name: "Lire la suite" })
    more.focus()
    fireEvent.click(more)
    expect(more).toHaveAttribute("aria-expanded", "true")
    expect(more).toHaveFocus()
    expect(more.closest("[data-post-caption]")).toHaveTextContent(body.trim())
    fireEvent.click(screen.getByRole("button", { name: "Réduire" }))
    expect(more).toHaveAttribute("aria-expanded", "false")
    expect(more).toHaveFocus()
  })

  it("suit l'écran des chartes : auteur, texte, média posé, puis la rangée d'icônes", () => {
    const view = renderCharte(base)
    const article = view.container.querySelector("article")!
    expect(article.getAttribute("data-post-presentation")).toBe("charte")
    const name = screen.getByRole("link", { name: "Clarisse OBAME" })
    const text = screen.getByText(/Lever de soleil/)
    const media = view.container.querySelector(".rpm-m")
    const actions = screen.getByRole("group", { name: "Actions sur la publication" })
    expectBefore(name, text)
    expectBefore(text, media)
    expectBefore(media, actions)
    // Le média est POSÉ dans la carte, jamais en débord.
    expect(media?.hasAttribute("data-inset")).toBe(true)
    expect((media as HTMLElement).style.marginInline).toBe("")
  })

  it("dit l'auteur par son adresse et la date, la coche Vérifié en signe lu, sans « Communauté »", () => {
    const view = renderCharte(base)
    const meta = view.container.querySelector(".rp-charte-meta")!
    expect(meta.textContent).toMatch(/^@clarisse\.obame·/)
    expect(view.container.querySelector(".rp-charte-verified")?.textContent).toBe("Vérifié")
    expect(view.container.querySelector(".rp-charte-verified svg")?.getAttribute("aria-hidden")).toBe("true")
    expect(screen.queryByText("Communauté")).toBeNull()
  })

  it("une page se dit « Page » et porte son étiquette Officiel", () => {
    const post: PostCardPost = {
      ...base,
      page: { pageId: "pages_mairie" as never, networkId: TEST_NETWORK_ID, handle: "mairie-libreville", name: "Mairie de Libreville", shortName: null, logoUrl: null, badge: "official", ownerKind: "institution", country: null },
    }
    const view = renderCharte(post)
    expect(screen.getByRole("link", { name: "Mairie de Libreville" })).toHaveAttribute("href", "/page/mairie-libreville")
    expect(view.container.querySelector(".rp-charte-meta")?.textContent).toMatch(/^Page·/)
    expect(view.container.querySelector('.rp-charte-badge[data-badge="official"]')?.textContent).toBe("Officiel")
  })

  it("les actions sont des icônes et leurs décomptes, chacune nommée ; la réaction posée est pleine", async () => {
    renderCharte({ ...base, reactions: { ...base.reactions, counts: { ...base.reactions.counts, like: 48 }, total: 48 } })
    const actions = screen.getByRole("group", { name: "Actions sur la publication" })
    // Aucun libellé visible « J'aime », « Commenter » ou « Partager » : des chiffres.
    const visible = [...actions.querySelectorAll("button")].map((button) => button.textContent).join("|")
    expect(visible).toBe("48||31|12|")
    const react = within(actions).getByRole("button", { name: "J'aime · 48 réactions" })
    expect(react).toHaveAttribute("aria-pressed", "true")
    expect(react.querySelector('svg[data-reacted="true"]')?.getAttribute("fill")).toBe("currentColor")
    expect(within(actions).getByRole("button", { name: "Commenter · 31" })).toBeTruthy()
    expect(within(actions).getByRole("button", { name: "Partager · 12" })).toBeTruthy()
    const save = within(actions).getByRole("button", { name: "Enregistrer" })
    expect(save).toHaveAttribute("aria-pressed", "false")
    fireEvent.click(save)
    await waitFor(() => expect(mocks.calls).toContainEqual({ ref: "toggleMark", args: { networkId: TEST_NETWORK_ID, postId: "posts_1", kind: "bookmark" } }))
    fireEvent.click(react)
    await waitFor(() => expect(mocks.calls).toContainEqual({ ref: "toggleReaction", args: { networkId: TEST_NETWORK_ID, postId: "posts_1", kind: "like" } }))
  })

  it("sans déclaration, la carte reste l'historique (DIASPORALE inchangée)", () => {
    const view = render(
      <EngineTestWrapper>
        <PostCard post={base} now={NOW} />
      </EngineTestWrapper>,
    )
    expect(view.container.querySelector('[data-post-presentation="charte"]')).toBeNull()
    expect(screen.getByRole("button", { name: "Partager · 12" })).toHaveTextContent("Partager")
  })
})

describe("PostCard « charte » — l'évènement annoncé", () => {
  const event: NonNullable<PostCardPost["event"]> = {
    eventId: "events_1" as never,
    title: "Collecte des encombrants",
    startAt: Date.UTC(2026, 9, 24, 6),
    endAt: Date.UTC(2026, 9, 24, 11),
    timeZone: "Africa/Libreville",
    status: "scheduled",
    myParticipation: "pending",
    myParticipationId: "eventParticipants_1" as never,
  }

  it("l'invité répond Participer, sur l'identifiant de SA ligne", async () => {
    renderCharte({ ...base, media: [], event })
    const card = screen.getByRole("region", { name: "Évènement annoncé" })
    expect(within(card).getByText("Collecte des encombrants")).toBeTruthy()
    fireEvent.click(within(card).getByRole("button", { name: "Participer : Collecte des encombrants" }))
    await waitFor(() =>
      expect(mocks.calls).toContainEqual({ ref: "respond", args: { networkId: TEST_NETWORK_ID, participationId: "eventParticipants_1", response: "accepted" } }),
    )
  })

  it("Plus tard ne répond rien : la question quitte la carte, l'invitation reste dans l'agenda", () => {
    renderCharte({ ...base, media: [], event })
    const card = screen.getByRole("region", { name: "Évènement annoncé" })
    fireEvent.click(within(card).getByRole("button", { name: "Plus tard : Collecte des encombrants" }))
    expect(within(card).queryAllByRole("button")).toHaveLength(0)
    expect(within(card).getByRole("status").textContent).toBe("Vous pourrez répondre depuis votre agenda.")
    expect(mocks.calls).toEqual([])
  })

  it("un moteur qui ne sert pas encore l'identifiant de la ligne : aucune réponse proposée", () => {
    const previous = Object.fromEntries(Object.entries(event).filter(([key]) => key !== "myParticipationId"))
    renderCharte({ ...base, media: [], event: previous as NonNullable<PostCardPost["event"]> })
    const card = screen.getByRole("region", { name: "Évènement annoncé" })
    expect(within(card).queryAllByRole("button")).toHaveLength(0)
  })

  it.each([
    { label: "un non-invité ou une page", patch: { myParticipation: null, myParticipationId: null } },
    { label: "une réponse déjà donnée", patch: { myParticipation: "accepted" as const } },
    { label: "un évènement annulé", patch: { status: "cancelled" as const } },
    { label: "un évènement révolu", patch: { startAt: Date.UTC(2026, 9, 1, 6), endAt: Date.UTC(2026, 9, 1, 11) } },
  ])("$label : aucun bouton de réponse", ({ patch }) => {
    renderCharte({ ...base, media: [], event: { ...event, ...patch } })
    const card = screen.getByRole("region", { name: "Évènement annoncé" })
    expect(within(card).queryAllByRole("button")).toHaveLength(0)
  })
})
