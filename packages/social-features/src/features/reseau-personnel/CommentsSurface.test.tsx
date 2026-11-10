// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/CommentsSurface.test.tsx @ ad2e7fdc2 — adaptations : surface montée dans l'enveloppe du moteur (`renderWithEngine` : i18n française, réseau de test) ; requêtes PAGINÉES du moteur simulées (`useAuthenticatedPaginatedQuery` : `paginateComments`, `paginateReplies`) au lieu de `listComments` ; les mutations portent le réseau (`networkId`) ; l'échec de lecture LÈVE (requête paginée) — « Réessayer » remonte la liste au lieu d'appeler `refetch` ; les quatre cas du socle portés ; cas ajoutés : « Voir plus de commentaires », suite paginée des réponses, modification de son commentaire (`editComment`), retrait de son commentaire, nom neutre d'un profil non publié, nombre de conversations dit seulement quand la liste est complète.
// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react"
import type { ButtonHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderWithEngine, TEST_NETWORK_ID } from "../../tests/engine-wrapper"

type Page = {
  results: unknown[]
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted"
  loadMore: ReturnType<typeof vi.fn>
  isLoading: boolean
}

const mocks = vi.hoisted(() => ({
  comments: {
    results: [] as unknown[],
    status: "Exhausted",
    loadMore: vi.fn(),
    isLoading: false,
  } as Page,
  replies: {
    results: [] as unknown[],
    status: "Exhausted",
    loadMore: vi.fn(),
    isLoading: false,
  } as Page,
  /** Quand posé, la lecture des racines LÈVE — comme une requête paginée en échec. */
  commentsError: null as Error | null,
  paginatedArgs: [] as { reference: string; args: unknown }[],
  comment: vi.fn(),
  remove: vi.fn(),
  edit: vi.fn(),
}))

vi.mock("@antsia/api/engine", () => ({
  api: {
    modules: {
      engagement: {
        engagement: {
          paginateComments: "paginateComments",
          paginateReplies: "paginateReplies",
          comment: "comment",
          removeComment: "removeComment",
          editComment: "editComment",
        },
      },
    },
  },
}))

vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedPaginatedQuery: (reference: string, args: unknown) => {
    mocks.paginatedArgs.push({ reference, args })
    if (reference === "paginateReplies") return mocks.replies
    if (mocks.commentsError) throw mocks.commentsError
    return mocks.comments
  },
}))

vi.mock("convex/react", () => ({
  useMutation: (reference: string) =>
    reference === "comment" ? mocks.comment : reference === "editComment" ? mocks.edit : mocks.remove,
}))

vi.mock("@antsia/ui", () => ({
  Alert: ({ children, title }: { children: ReactNode; title?: string }) => (
    <div role="alert">
      {title}
      {children}
    </div>
  ),
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string
    size?: string
  }) => <button {...props}>{children}</button>,
  TextArea: (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
  useModalA11y: () => undefined,
}))

vi.mock("./Avatar", () => ({
  Avatar: ({ displayName }: { displayName: string }) => (
    <span aria-hidden="true">{displayName}</span>
  ),
}))

vi.mock("./RichText", () => ({
  RichText: ({ body }: { body: string }) => <p>{body}</p>,
}))

vi.mock("@antsia/ui/overlay", () => ({
  useBodyScrollLock: () => undefined,
  useVisualViewport: () => undefined,
}))

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))

import { CommentsSurface } from "./CommentsSurface"

const POST_ID = "post-1" as never
const COMMENT_ID = "comment-1" as never

function reply(overrides: Record<string, unknown> = {}) {
  return {
    commentId: "reply-1",
    author: {
      personId: "persons_ada",
      displayName: "Ada Mba",
      handle: "ada.mba",
      avatarUrl: null,
    },
    body: "Une réponse",
    createdAt: 1_700_000_000_000,
    editedAt: null,
    isMine: false,
    ...overrides,
  }
}

function rootComment(overrides: Record<string, unknown> = {}) {
  return {
    ...reply({ commentId: COMMENT_ID, body: "Une réponse utile" }),
    replyCount: 0,
    replies: [],
    ...overrides,
  }
}

function renderSurface(overrides: Record<string, unknown> = {}) {
  const props = {
    postId: POST_ID,
    now: 1_700_000_060_000,
    onClose: vi.fn(),
    onReportComment: vi.fn(),
    ...overrides,
  }
  renderWithEngine(<CommentsSurface {...props} />)
  return props
}

beforeEach(() => {
  mocks.comments = { results: [], status: "Exhausted", loadMore: vi.fn(), isLoading: false }
  mocks.replies = { results: [], status: "Exhausted", loadMore: vi.fn(), isLoading: false }
  mocks.commentsError = null
  mocks.paginatedArgs = []
  mocks.comment.mockReset().mockResolvedValue(undefined)
  mocks.remove.mockReset().mockResolvedValue(undefined)
  mocks.edit.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("CommentsSurface", () => {
  it("portale un dialogue et ferme depuis sa cible de 44 px", async () => {
    const { onClose } = renderSurface()

    const dialog = await screen.findByRole("dialog", { name: "Commentaires" })
    expect(document.body.contains(dialog)).toBe(true)
    expect(screen.getByText("Aucun commentaire pour l'instant.")).toBeTruthy()

    fireEvent.click(
      screen.getByRole("button", { name: "Fermer les commentaires" })
    )
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("lit les commentaires DANS le réseau courant", async () => {
    renderSurface()
    await screen.findByRole("dialog", { name: "Commentaires" })
    expect(mocks.paginatedArgs).toContainEqual({ reference: "paginateComments", args: { networkId: TEST_NETWORK_ID, postId: POST_ID } })
  })

  it("distingue l'erreur de l'état vide et permet de relancer", async () => {
    // React consigne l'erreur attrapée par la frontière : bruit attendu ici.
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    mocks.commentsError = new Error("lecture refusée")
    renderSurface()

    expect(
      await screen.findByText("Les commentaires ne sont pas disponibles.")
    ).toBeTruthy()
    // L'en-tête et le composeur restent : seule la liste dit son échec.
    expect(screen.getByRole("dialog", { name: "Commentaires" })).toBeTruthy()
    expect(screen.getByRole("textbox", { name: "Écrire un commentaire" })).toBeTruthy()

    mocks.commentsError = null
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
    expect(await screen.findByText("Aucun commentaire pour l'instant.")).toBeTruthy()
  })

  it("préserve la réponse et la mutation de commentaire existantes", async () => {
    mocks.comments.results = [rootComment()]
    renderSurface()
    await screen.findByText("Une réponse utile")

    fireEvent.click(screen.getByRole("button", { name: "Répondre" }))
    fireEvent.change(
      screen.getByRole("textbox", { name: "Écrire un commentaire" }),
      {
        target: { value: "  Merci pour la précision  " },
      }
    )
    fireEvent.click(screen.getByRole("button", { name: "Publier" }))

    await waitFor(() =>
      expect(mocks.comment).toHaveBeenCalledWith({
        networkId: TEST_NETWORK_ID,
        postId: POST_ID,
        parentCommentId: COMMENT_ID,
        body: "Merci pour la précision",
      })
    )
  })

  it("ferme le drawer avant d'ouvrir le signalement", async () => {
    mocks.comments.results = [rootComment()]
    const { onClose, onReportComment } = renderSurface()
    await screen.findByText("Une réponse utile")
    vi.useFakeTimers()

    fireEvent.click(screen.getByRole("button", { name: "Signaler" }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onReportComment).not.toHaveBeenCalled()

    vi.runOnlyPendingTimers()
    expect(onReportComment).toHaveBeenCalledWith(COMMENT_ID)
  })

  it("charge la page suivante des racines à la demande", async () => {
    mocks.comments.results = [rootComment()]
    mocks.comments.status = "CanLoadMore"
    renderSurface()
    await screen.findByText("Une réponse utile")

    fireEvent.click(screen.getByRole("button", { name: "Voir plus de commentaires" }))
    expect(mocks.comments.loadMore).toHaveBeenCalledWith(20)
  })

  it("ne dit le nombre de conversations que d'une liste COMPLÈTE", async () => {
    mocks.comments.results = [rootComment(), rootComment({ commentId: "comment-2", body: "Deuxième" })]
    mocks.comments.status = "CanLoadMore"
    renderSurface()
    await screen.findByText("Deuxième")
    // Deux racines chargées ne sont qu'un plancher : pas de chiffre.
    expect(screen.queryByText("2 conversations")).toBeNull()
    expect(screen.getByText("Participer à la conversation")).toBeTruthy()

    cleanup()
    mocks.comments.status = "Exhausted"
    renderSurface()
    expect(await screen.findByText("2 conversations")).toBeTruthy()
  })

  it("montre l'aperçu des réponses, puis leur suite paginée", async () => {
    mocks.comments.results = [rootComment({ replyCount: 4, replies: [reply()] })]
    mocks.replies.results = [reply(), reply({ commentId: "reply-2", body: "Encore une réponse" })]
    mocks.replies.status = "CanLoadMore"
    renderSurface()
    expect(await screen.findByText("Une réponse")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Voir les 4 réponses" }))
    expect(await screen.findByText("Encore une réponse")).toBeTruthy()
    expect(mocks.paginatedArgs).toContainEqual({
      reference: "paginateReplies",
      args: { networkId: TEST_NETWORK_ID, postId: POST_ID, commentId: COMMENT_ID },
    })
    // La suite REMPLACE l'aperçu : la première réponse n'apparaît qu'une fois.
    expect(screen.getAllByText("Une réponse")).toHaveLength(1)

    fireEvent.click(screen.getByRole("button", { name: "Voir plus de réponses" }))
    expect(mocks.replies.loadMore).toHaveBeenCalledWith(20)
  })

  it("modifie SON commentaire sur place", async () => {
    mocks.comments.results = [rootComment({ isMine: true })]
    renderSurface()
    await screen.findByText("Une réponse utile")
    // Le sien ne se signale pas.
    expect(screen.queryByRole("button", { name: "Signaler" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Modifier" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Modifier le commentaire" }), {
      target: { value: "  Une réponse corrigée  " },
    })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))

    await waitFor(() =>
      expect(mocks.edit).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, commentId: COMMENT_ID, body: "Une réponse corrigée" })
    )
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Modifier le commentaire" })).toBeNull())
  })

  it("retire SON commentaire dans le réseau courant", async () => {
    mocks.comments.results = [rootComment({ isMine: true })]
    renderSurface()
    await screen.findByText("Une réponse utile")

    fireEvent.click(screen.getByRole("button", { name: "Retirer" }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, commentId: COMMENT_ID }))
  })

  it("garde les commentaires lisibles et retirables lorsque la rédaction ferme les ajouts", async () => {
    mocks.comments.results = [rootComment({ isMine: true })]
    renderSurface({ readOnly: true })
    await screen.findByText("Une réponse utile")
    expect(screen.getByText(/Les nouveaux commentaires sont fermés/)).toBeTruthy()
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.queryByRole("button", { name: "Répondre" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Modifier" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Retirer" }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalled())
    expect(mocks.comment).not.toHaveBeenCalled()
    expect(mocks.edit).not.toHaveBeenCalled()
  })

  it("referme le composeur et une édition déjà ouverte après fermeture de la discussion", async () => {
    mocks.comments.results = [rootComment({ isMine: true })]
    const props = { postId: POST_ID, now: 1_700_000_060_000, onClose: vi.fn(), onReportComment: vi.fn() }
    const view = renderWithEngine(<CommentsSurface {...props} />)
    await screen.findByText("Une réponse utile")
    fireEvent.click(screen.getByRole("button", { name: "Modifier" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Modifier le commentaire" }), { target: { value: "Saisie privée non envoyée" } })
    view.rerender(<CommentsSurface {...props} readOnly />)
    await screen.findByText(/Les nouveaux commentaires sont fermés/)
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.queryByText("Saisie privée non envoyée")).toBeNull()
    expect(screen.getByText("Une réponse utile")).toBeTruthy()
    expect(mocks.edit).not.toHaveBeenCalled()
    expect(mocks.comment).not.toHaveBeenCalled()
  })

  it("nomme NEUTREMENT l'auteur d'un profil non publié", async () => {
    mocks.comments.results = [
      rootComment({ author: { personId: "persons_x", displayName: null, handle: null, avatarUrl: null } }),
    ]
    renderSurface()
    await screen.findByText("Une réponse utile")
    expect(screen.getAllByText("Membre du réseau").length).toBeGreaterThan(0)
  })
})
