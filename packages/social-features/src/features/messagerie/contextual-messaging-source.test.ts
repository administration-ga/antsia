// @vitest-environment jsdom
/**
 * CC-5 — la source contextuelle (écrit le 19/10/2026, NON EXÉCUTÉ : « Continuer sans
 * vérifier »). Elle n'arme que ses propres fonctions du moteur, injecte le réseau APRÈS les
 * arguments, accumule ses pages sans doublon, et code les appels (CC-4) contre les noms du contrat.
 *
 * Les références restent celles de l'API réelle (`anyApi`) : on les identifie par leur NOM
 * (`getFunctionName`), écrit ici en toutes lettres — les noms du contrat §10.1.
 */
import { act, renderHook } from "@testing-library/react"
import { getFunctionName } from "convex/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const NAME = {
  thread: "modules/contextualMessaging/threads:getThread",
  forObject: "modules/contextualMessaging/threads:findForObject",
  openForObject: "modules/contextualMessaging/threads:openForObject",
  mine: "modules/contextualMessaging/threads:paginateMine",
  forPage: "modules/contextualMessaging/threads:paginateForPage",
  read: "modules/contextualMessaging/threads:markRead",
  close: "modules/contextualMessaging/threads:close",
  messages: "modules/contextualMessaging/messages:paginateMessages",
  send: "modules/contextualMessaging/messages:send",
  upload: "modules/contextualMessaging/messages:generateUploadUrl",
  remove: "modules/contextualMessaging/messages:remove",
  consent: "modules/contextualMessaging/calls:setCallConsent",
  start: "modules/contextualMessaging/calls:start",
  report: "modules/moderation/cases:report",
  preferences: "modules/calls/preferences:getMine",
} as const

const state = vi.hoisted(() => ({ query: vi.fn(), paginated: vi.fn(), mutation: vi.fn() }))
vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: (reference: Parameters<typeof getFunctionName>[0], args: unknown) => state.query(getFunctionName(reference), args),
  useAuthenticatedPaginatedQuery: (reference: Parameters<typeof getFunctionName>[0], args: unknown, options: unknown) => state.paginated(getFunctionName(reference), args, options),
  useConvexMutationQuery: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "network-fixture" }) }))
vi.mock("convex/react", () => ({
  useMutation: (reference: Parameters<typeof getFunctionName>[0]) => (args: unknown) => state.mutation(getFunctionName(reference), args),
}))

import {
  CONTEXTUAL_MESSAGING_SOURCE as source,
  contextualCursorsEqual,
  type ContextualMessageId,
  type ContextualMineCursor,
  type ContextualObjectRef,
  type ContextualThread,
  type ContextualThreadId,
} from "./contextual-messaging-source"

const idle = { data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: vi.fn() }
const threadId = "thread-fixture" as ContextualThreadId
const thread = (id: string) => ({ threadId: id }) as unknown as ContextualThread
const CURSOR: ContextualMineCursor = { requester: { at: 10, ct: 1 }, responder: null }
// Des réponses STABLES : une réponse reconstruite à chaque rendu relancerait les effets.
const FIRST_PAGE = { items: [thread("a"), thread("b")], nextCursor: CURSOR, isDone: false }
const SECOND_PAGE = { items: [thread("b"), thread("c")], nextCursor: null, isDone: true }

beforeEach(() => {
  state.query.mockReset().mockReturnValue(idle)
  state.paginated.mockReset().mockReturnValue({ results: [], status: "LoadingFirstPage", loadMore: vi.fn(), isLoading: true })
  state.mutation.mockReset().mockResolvedValue(null)
})

describe("listes contextuelles", () => {
  it("n'arme que MES fils, borne la page, et ne transmet la nature que si elle est choisie", () => {
    renderHook(() => source.useMyThreadsPage())
    expect(state.query).toHaveBeenCalledWith(NAME.mine, { networkId: "network-fixture", limit: 30 })
    expect(state.query).toHaveBeenCalledWith(NAME.mine, "skip")
    // Ni la boîte personnelle, ni le canal P10, ni les fils d'une page ne sont lus.
    expect(state.query.mock.calls.every(([name]) => name === NAME.mine)).toBe(true)
    state.query.mockClear()
    renderHook(() => source.useMyThreadsPage("diasporaMentoring"))
    expect(state.query).toHaveBeenCalledWith(NAME.mine, { networkId: "network-fixture", limit: 30, kind: "diasporaMentoring" })
  })

  it("garde la première page vivante, accumule la suivante sans doublon et s'arrête au bout", async () => {
    state.query.mockImplementation((name: string, args: unknown) => {
      if (name !== NAME.mine || args === "skip") return idle
      return { ...idle, data: (args as { cursor?: unknown }).cursor === undefined ? FIRST_PAGE : SECOND_PAGE }
    })
    const hook = renderHook(() => source.useMyThreadsPage())
    expect(hook.result.current.data?.map((row) => row.threadId)).toEqual(["a", "b"])
    expect(hook.result.current.hasMore).toBe(true)
    await act(async () => {
      hook.result.current.loadMore()
    })
    expect(state.query).toHaveBeenCalledWith(NAME.mine, { networkId: "network-fixture", cursor: CURSOR, limit: 30 })
    expect(hook.result.current.data?.map((row) => row.threadId)).toEqual(["a", "b", "c"])
    expect(hook.result.current.hasMore).toBe(false)
  })

  it("une liste de page désarmée ne lit rien et ne prétend pas attendre", () => {
    const hook = renderHook(() => source.usePageThreadsPage(null))
    expect(state.query.mock.calls.every(([, args]) => args === "skip")).toBe(true)
    expect(hook.result.current).toMatchObject({ data: undefined, enabled: false, isLoading: false, hasMore: false })
  })

  it("les fils d'une page passent par la pagination bornée du moteur, curseur opaque relu", async () => {
    const pageId = "page-fixture" as NonNullable<Parameters<typeof source.usePageThreadsPage>[0]>
    const first = { page: [thread("a")], isDone: false, continueCursor: "cursor-2" }
    const next = { page: [thread("b")], isDone: true, continueCursor: "cursor-3" }
    state.query.mockImplementation((name: string, args: unknown) => {
      if (name !== NAME.forPage || args === "skip") return idle
      return { ...idle, data: (args as { paginationOpts: { cursor: string | null } }).paginationOpts.cursor === null ? first : next }
    })
    const hook = renderHook(() => source.usePageThreadsPage(pageId, "diasporaJobApplication"))
    expect(state.query).toHaveBeenCalledWith(NAME.forPage, { networkId: "network-fixture", pageId, paginationOpts: { numItems: 30, cursor: null }, kind: "diasporaJobApplication" })
    await act(async () => {
      hook.result.current.loadMore()
    })
    expect(state.query).toHaveBeenCalledWith(NAME.forPage, { networkId: "network-fixture", pageId, paginationOpts: { numItems: 30, cursor: "cursor-2" }, kind: "diasporaJobApplication" })
    expect(hook.result.current.data?.map((row) => row.threadId)).toEqual(["a", "b"])
    expect(hook.result.current.hasMore).toBe(false)
  })
})

describe("fil, objet et messages", () => {
  it("aucun fil ni message n'est demandé sans identifiant", () => {
    const hook = renderHook(() => ({ thread: source.useThread(null), object: source.useThreadForObject(null), messages: source.useMessages(null) }))
    expect(state.query).toHaveBeenCalledWith(NAME.thread, "skip")
    expect(state.query).toHaveBeenCalledWith(NAME.forObject, "skip")
    expect(state.paginated).toHaveBeenCalledWith(NAME.messages, "skip", { initialNumItems: 30 })
    expect(hook.result.current.thread).toMatchObject({ data: undefined, enabled: false, isLoading: false })
  })

  it("lit le fil, l'objet et les messages dans le réseau courant", () => {
    const object = { kind: "diasporaMentoring", id: "mentoring-fixture" } as unknown as ContextualObjectRef
    renderHook(() => ({ thread: source.useThread(threadId), object: source.useThreadForObject(object), messages: source.useMessages(threadId) }))
    expect(state.query).toHaveBeenCalledWith(NAME.thread, { networkId: "network-fixture", threadId })
    expect(state.query).toHaveBeenCalledWith(NAME.forObject, { networkId: "network-fixture", context: object })
    expect(state.paginated).toHaveBeenCalledWith(NAME.messages, { networkId: "network-fixture", threadId }, { initialNumItems: 30 })
  })
})

describe("écritures : réseau injecté APRÈS les arguments, noms du contrat", () => {
  it("ouvre une collaboration professionnelle par son objet, sans traiter son identifiant comme un fil", async () => {
    const object = { kind: "professionalCollaboration", id: "collaboration-fixture" } as ContextualObjectRef
    state.mutation.mockResolvedValueOnce({ threadId, created: true })
    const { result } = renderHook(() => source.useWrites())
    expect(await result.current.openForObject(object)).toEqual({ threadId, created: true })
    expect(state.mutation).toHaveBeenCalledWith(NAME.openForObject, { networkId: "network-fixture", context: object })
  })

  it("un appelant ne choisit jamais un autre réseau", async () => {
    const { result } = renderHook(() => source.useWrites())
    await result.current.send({ threadId, text: "Bonjour", idempotencyKey: "intent-0001", networkId: "autre-reseau" } as unknown as Parameters<typeof result.current.send>[0])
    expect(state.mutation).toHaveBeenCalledWith(NAME.send, { threadId, text: "Bonjour", idempotencyKey: "intent-0001", networkId: "network-fixture" })
  })

  it("dépôt gardé, lecture, clôture, retrait et signalement sur la surface unique", async () => {
    const { result } = renderHook(() => source.useWrites())
    const messageId = "message-fixture" as ContextualMessageId
    await result.current.generateUploadUrl(threadId)
    await result.current.markRead(threadId)
    await result.current.close({ threadId, expectedRevision: 4 })
    await result.current.remove({ threadId, messageId })
    await result.current.report(messageId, "harassment")
    expect(state.mutation.mock.calls).toEqual([
      [NAME.upload, { threadId, networkId: "network-fixture" }],
      [NAME.read, { threadId, networkId: "network-fixture" }],
      [NAME.close, { threadId, expectedRevision: 4, networkId: "network-fixture" }],
      [NAME.remove, { threadId, messageId, networkId: "network-fixture" }],
      [NAME.report, { target: { kind: "contextualMessage", id: messageId }, reason: "harassment", networkId: "network-fixture" }],
    ])
  })

  it("CC-4 : accord et démarrage par `calls.setCallConsent` et `calls.start`, cible seulement si choisie", async () => {
    const { result } = renderHook(() => source.useWrites())
    const personId = "persons_awa" as NonNullable<Parameters<typeof result.current.startCall>[0]["targetPersonId"]>
    await result.current.setCallConsent({ threadId, allowed: true })
    await result.current.startCall({ threadId, mediaType: "audio" })
    await result.current.startCall({ threadId, mediaType: "video", targetPersonId: personId })
    expect(state.mutation.mock.calls).toEqual([
      [NAME.consent, { threadId, allowed: true, networkId: "network-fixture" }],
      [NAME.start, { threadId, mediaType: "audio", networkId: "network-fixture" }],
      [NAME.start, { threadId, mediaType: "video", targetPersonId: personId, networkId: "network-fixture" }],
    ])
  })
})

describe("aucune autre lecture que celles du fil", () => {
  it("les réglages d'appel du lecteur viennent de la projection du fil (CC-4), jamais d'une lecture à part", () => {
    renderHook(() => ({ thread: source.useThread(threadId), writes: source.useWrites() }))
    expect(state.query.mock.calls.map(([name]) => name)).not.toContain(NAME.preferences)
    expect(Object.keys(source)).not.toContain("useOwnCallSettings")
  })
})

describe("curseur de mes fils", () => {
  it("compare les valeurs, jamais les objets", () => {
    expect(contextualCursorsEqual(null, null)).toBe(true)
    expect(contextualCursorsEqual(CURSOR, null)).toBe(false)
    expect(contextualCursorsEqual(CURSOR, { requester: { at: 10, ct: 1 }, responder: null })).toBe(true)
    expect(contextualCursorsEqual(CURSOR, { requester: { at: 10, ct: 2 }, responder: null })).toBe(false)
  })
})
