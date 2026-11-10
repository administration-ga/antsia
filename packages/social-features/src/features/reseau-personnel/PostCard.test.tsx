// @vitest-environment jsdom
// Écrit pour le moteur (lot F2) : `PostCard` n'avait pas de test au socle — carte d'une personne, carte d'une page (identité de la page, signataire nommé), nom neutre d'un auteur sans profil publié.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { ViewerPreferencesProvider } from "@antsia/api/viewer-preferences"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EngineTestWrapper, renderWithEngine, TEST_NETWORK_ID, TEST_PERSON_ID, TEST_ROUTES } from "../../tests/engine-wrapper"

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
    },
  },
}))

vi.mock("convex/react", () => ({
  useMutation: (ref: string) => async (args: unknown) => {
    mocks.calls.push({ ref, args })
    if (ref === "toggleMark") return { marked: true }
    return { ok: true }
  },
}))

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { PostCard, type PostCardPost } from "./PostCard"

const base: PostCardPost = {
  _id: "posts_1" as never,
  body: "Bonjour #numerique @awa.demo",
  audience: "public",
  visibility: "network",
  publishedAt: 1_700_000_000_000,
  editedAt: null,
  isMine: false,
  author: { personId: "persons_awa" as never, handle: "awa.demo", displayName: "Awa", headline: "Archiviste", avatarUrl: null, badges: ["verified", "community"] },
  reactions: { counts: { like: 2, bravo: 0, soutien: 0, instructif: 0 }, total: 2, mine: null },
  commentCount: 3,
  shareCount: 0,
  media: [],
  share: null,
  tags: ["numerique"],
  groupId: null,
  event: null,
  page: null,
  reach: null,
  country: null,
  origin: null,
  reason: "connection",
  viewer: { bookmarked: false, notifying: false },
}

beforeEach(() => {
  mocks.calls = []
})
afterEach(() => vi.restoreAllMocks())

describe("PostCard (vérification)", () => {
  it.each([
    { label: "audience relations", patch: { audience: "connections" as const } },
    { label: "citation indisponible", patch: { share: { available: false as const } } },
  ])("$label : garde le lien copiable sans proposer de citation", async ({ patch }) => {
    render(
      <EngineTestWrapper routes={{ ...TEST_ROUTES, post: (id) => `/fil?post=${encodeURIComponent(id)}` }}>
        <PostCard post={{ ...base, ...patch, shareCount: 2 }} now={1_700_000_060_000} />
      </EngineTestWrapper>,
    )
    const trigger = screen.getByRole("button", { name: "Partager · 2" })
    expect(trigger).toHaveTextContent("Partager")
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = await screen.findByRole("dialog", { name: "Partager la publication de Awa" })
    expect(within(dialog).getByRole("textbox", { name: "Lien de la publication" })).toHaveValue(new URL("/fil?post=posts_1", window.location.origin).href)
    expect(within(dialog).getByRole("button", { name: "Copier le lien" })).toBeInTheDocument()
    expect(within(dialog).queryByRole("button", { name: "Partager dans mon fil" })).toBeNull()
    expect(mocks.calls).toEqual([])
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it("le propriétaire retire la diffusion sans supprimer sa publication, après confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false)
    const { rerender } = renderWithEngine(<PostCard post={{ ...base, isMine: true, visibility: "root" }} now={1_700_000_060_000} />)
    fireEvent.click(screen.getByRole("button", { name: "Retirer de la lecture publique" }))
    expect(mocks.calls).not.toContainEqual(expect.objectContaining({ ref: "withdrawFromRoot" }))
    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole("button", { name: "Retirer de la lecture publique" }))
    await waitFor(() => expect(mocks.calls).toContainEqual({ ref: "withdrawFromRoot", args: { networkId: TEST_NETWORK_ID, postId: "posts_1" } }))
    expect(mocks.calls.some((call) => call.ref === "remove" || call.ref === "removePagePost")).toBe(false)
    rerender(<PostCard post={{ ...base, isMine: true, visibility: "network" }} now={1_700_000_060_000} />)
    expect(screen.queryByRole("button", { name: "Retirer de la lecture publique" })).toBeNull()
  })
  it("un lecteur ne reçoit jamais le geste de retrait de diffusion de l'auteur", () => {
    renderWithEngine(<PostCard post={{ ...base, visibility: "root" }} now={1_700_000_060_000} />)
    expect(screen.queryByRole("button", { name: "Retirer de la lecture publique" })).toBeNull()
  })
  it("personne : lien de profil injecté, badge calculé, gestes du réseau", async () => {
    renderWithEngine(<PostCard post={base} now={1_700_000_060_000} />)
    const link = screen.getByRole("link", { name: "Awa" })
    expect(link).toHaveAttribute("href", "/profil/awa.demo")
    expect(screen.getByText("Vérifié")).toBeTruthy()
    expect(screen.queryByText("Communauté")).toBeNull()
    expect(screen.getByText("Archiviste")).toBeTruthy()
    // Mentions et mots-dièse sans gestionnaire : adresses injectées.
    expect(screen.getByRole("link", { name: "@awa.demo" })).toHaveAttribute("href", "/profil/awa.demo")
    expect(screen.getByRole("link", { name: "#numerique" })).toHaveAttribute("href", "/fil?tag=numerique")
    expect(screen.getByRole("button", { name: "Commenter · 3" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Partager" })).toHaveTextContent("Partager")

    fireEvent.click(screen.getByRole("button", { name: /^J'aime · 2 réactions\./ }))
    await waitFor(() => expect(mocks.calls).toContainEqual({ ref: "toggleReaction", args: { networkId: TEST_NETWORK_ID, postId: "posts_1", kind: "like" } }))

    fireEvent.click(screen.getByRole("button", { name: "Autres actions sur cette publication" }))
    const menu = await screen.findByRole("menu", { name: "Actions sur cette publication" })
    expect([...menu.querySelectorAll(".rp-of-label")].map((n) => n.textContent)).toEqual([
      "Enregistrer",
      "Être averti des commentaires",
      "Masquer cette publication",
      "Ne plus voir les publications de Awa",
      "Signaler",
    ])
    fireEvent.click(screen.getByText("Ne plus voir les publications de Awa"))
    await waitFor(() => expect(mocks.calls).toContainEqual({ ref: "muteAuthor", args: { networkId: TEST_NETWORK_ID, targetPersonId: "persons_awa" } }))
  })

  it("page : identité de la page, signataire nommée, retrait par la page", async () => {
    const post: PostCardPost = {
      ...base,
      reason: "own",
      author: { ...base.author, personId: TEST_PERSON_ID },
      page: { pageId: "pages_1" as never, networkId: TEST_NETWORK_ID, handle: "asso", name: "Association X", shortName: null, logoUrl: null, badge: "official", ownerKind: "association", country: null },
    }
    renderWithEngine(<PostCard post={post} now={1_700_000_060_000} />)
    expect(screen.getByRole("link", { name: "Association X" })).toHaveAttribute("href", "/page/asso")
    expect(screen.getByText("Officiel")).toBeTruthy()
    expect(screen.getByText("Publié par Awa")).toBeTruthy()
    expect(screen.queryByText("Archiviste")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Autres actions sur cette publication" }))
    const menu = await screen.findByRole("menu", { name: "Actions sur cette publication" })
    // Signataire et autrice : gestes d'auteur, SANS épinglage personnel.
    expect([...menu.querySelectorAll(".rp-of-label")].map((n) => n.textContent)).toEqual([
      "Modifier",
      "Enregistrer",
      "Retirer ma publication",
    ])
    fireEvent.click(screen.getByText("Retirer ma publication"))
    await waitFor(() => expect(mocks.calls).toContainEqual({ ref: "removePagePost", args: { networkId: TEST_NETWORK_ID, postId: "posts_1" } }))
  })

  it("nom neutre et partage indisponible", () => {
    const post: PostCardPost = {
      ...base,
      author: { ...base.author, displayName: null, handle: null, badges: [] },
      share: { available: false },
    }
    renderWithEngine(<PostCard post={post} now={1_700_000_060_000} />)
    expect(screen.getAllByText("Membre du réseau").length).toBeGreaterThan(0)
    expect(screen.queryByRole("link", { name: "Membre du réseau" })).toBeNull()
    expect(screen.getByText("Publication indisponible.")).toBeTruthy()
    // Sans adresse membre injectée ni original disponible, aucun dialogue vide.
    expect(screen.queryByRole("button", { name: "Partager" })).toBeNull()
  })

  it("attribue le réseau d'origine sans inventer de lien vers une application non servie", () => {
    const post: PostCardPost = {
      ...base,
      origin: { networkId: "networks_other" as never, slug: "unserved-source", name: "Réseau invité" },
    }
    const view = renderWithEngine(<PostCard post={post} now={1_700_000_060_000} />)
    const attribution = screen.getByText("Publié depuis Réseau invité")
    expect(attribution.closest("a")).toBeNull()
    expect(screen.queryByRole("link", { name: /Réseau invité/ })).toBeNull()
    expect(view.container.textContent).not.toMatch(/networks_other|unserved-source/)
    view.rerender(<PostCard post={base} now={1_700_000_060_000} />)
    expect(screen.queryByText(/Publié depuis/)).toBeNull()
  })

  it("annonce l'évènement annulé avec les dates du lecteur sans lieu, invités ou actions inventés", () => {
    const post: PostCardPost = {
      ...base,
      event: {
        eventId: "events_1" as never,
        title: "Rencontre de la communauté",
        startAt: Date.UTC(2026, 7, 19, 22, 30),
        endAt: Date.UTC(2026, 7, 20, 0, 30),
        timeZone: "Africa/Libreville",
        status: "cancelled",
        myParticipation: "accepted",
        myParticipationId: "eventParticipants_1" as never,
      },
    }
    renderWithEngine(
      <ViewerPreferencesProvider timeZone="Asia/Tokyo">
        <PostCard post={post} now={1_700_000_060_000} />
      </ViewerPreferencesProvider>,
    )
    const card = screen.getByRole("region", { name: "Évènement annoncé" })
    expect(within(card).getByRole("heading", { name: "Rencontre de la communauté" })).toBeTruthy()
    expect(within(card).getByText("Évènement annulé")).toBeTruthy()
    expect(within(card).getByText("jeudi 20 août 2026, 07:30 → 09:30")).toBeTruthy()
    expect(within(card).getByText("Heures affichées dans votre fuseau : Asia/Tokyo")).toBeTruthy()
    expect(within(card).getByText("Votre réponse enregistrée : Je participe")).toBeTruthy()
    expect(within(card).queryAllByRole("button")).toHaveLength(0)
    expect(within(card).queryAllByRole("link")).toHaveLength(0)
    expect(card.textContent).not.toMatch(/Invités|Organisé par|Lieu|Africa\/Libreville|events_1/)
  })

  it("reflète le statut relu d'un évènement sans attribuer de réponse au lecteur non invité", () => {
    const event: NonNullable<PostCardPost["event"]> = {
      eventId: "events_1" as never,
      title: "Échange culturel",
      startAt: Date.UTC(2026, 7, 19, 8),
      endAt: Date.UTC(2026, 7, 19, 10),
      timeZone: "Europe/Paris",
      status: "scheduled",
      myParticipation: null,
      myParticipationId: null,
    }
    const view = renderWithEngine(<PostCard post={{ ...base, event }} now={1_700_000_060_000} />)
    expect(screen.getByText("Évènement prévu")).toBeTruthy()
    expect(screen.queryByText(/Votre réponse enregistrée/)).toBeNull()
    view.rerender(<PostCard post={{ ...base, event: { ...event, status: "cancelled" } }} now={1_700_000_060_000} />)
    expect(screen.getByText("Évènement annulé")).toBeTruthy()
    expect(screen.queryByText("Évènement prévu")).toBeNull()
    expect(within(screen.getByRole("region", { name: "Évènement annoncé" })).queryAllByRole("button")).toHaveLength(0)
  })

  it("formate aussi les dates absolues de la citation dans la préférence personnelle", () => {
    const publishedAt = Date.UTC(2026, 7, 19, 22, 30)
    const sharedAt = Date.UTC(2026, 7, 19, 23, 15)
    const now = Date.UTC(2026, 7, 29, 12)
    const post: PostCardPost = {
      ...base,
      publishedAt,
      share: {
        available: true,
        postId: "posts_quote" as never,
        author: { displayName: "Nadia", handle: "nadia.demo", avatarUrl: null },
        page: null,
        body: "La publication citée",
        media: [],
        publishedAt: sharedAt,
      },
    }
    const view = renderWithEngine(
      <ViewerPreferencesProvider timeZone="Asia/Tokyo"><PostCard post={post} now={now} /></ViewerPreferencesProvider>,
    )
    let times = Array.from(view.container.querySelectorAll("time"))
    expect(times).toHaveLength(2)
    for (const time of times) expect(time.textContent).toContain("20 août 2026")
    expect(times[0]).toHaveAttribute("datetime", new Date(publishedAt).toISOString())
    expect(times[1]).toHaveAttribute("datetime", new Date(sharedAt).toISOString())
    view.rerender(
      <ViewerPreferencesProvider timeZone="America/Los_Angeles"><PostCard post={post} now={now} /></ViewerPreferencesProvider>,
    )
    times = Array.from(view.container.querySelectorAll("time"))
    for (const time of times) expect(time.textContent).toContain("19 août 2026")
  })

  it("n'invente aucune carte d'évènement absent et conserve une seule annonce de direct", () => {
    renderWithEngine(
      <PostCard post={{ ...base, live: { sessionId: "liveSessions_1" as never, title: "Conférence nationale", status: "live" } }} now={1_700_000_060_000} />,
    )
    expect(screen.queryByRole("region", { name: "Évènement annoncé" })).toBeNull()
    const links = screen.getAllByRole("link", { name: /Conférence nationale/ })
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute("href", "/conference/liveSessions_1")
  })
})
