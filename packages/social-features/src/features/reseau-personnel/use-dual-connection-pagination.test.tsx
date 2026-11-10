// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/use-dual-connection-pagination.test.tsx @ ad2e7fdc2 — adaptations : abonnements natifs indépendants `graph.connections.paginateMineSide`, réseau et authentification contrôlés ; curseurs, attente/refus d'un côté, reprise et isolation du lecteur vérifiés ; demandes reçues sur un seul index.
// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { EngineTestWrapper, TEST_NETWORK_ID } from "../../tests/engine-wrapper"

type PageItem = { connectionId: string; at: number }
type NativePage = { page: PageItem[]; isDone: boolean; continueCursor: string }
type DualPage = { low: NativePage; high: NativePage }
type PaginationOpts = { cursor: string | null; numItems: number }
type MineArgs = { networkId: string; side: "low" | "high"; paginationOpts: PaginationOpts }
type PendingArgs = { networkId: string; paginationOpts: PaginationOpts }

const mocks = vi.hoisted(() => ({
  pages: new Map<string, NativePage>(),
  pending: new Map<string, NativePage>(),
  seen: [] as MineArgs[],
  seenPending: [] as PendingArgs[],
  errors: new Set<string>(),
  retries: [] as string[],
  context: { networkId: "networks_test", personId: "persons_me" },
  auth: { isAuthenticated: true, isLoading: false },
}))

vi.mock("convex/react", () => ({ useConvexAuth: () => mocks.auth }))
vi.mock("@antsia/api/network", async (original) => ({
  ...await original<typeof import("@antsia/api/network")>(),
  useNetwork: () => mocks.context,
}))

vi.mock("@antsia/api/engine", () => ({
  api: {
    modules: {
      graph: {
        connections: {
          paginateMine: "mine",
          paginateMineSide: "mine-side",
          paginatePendingForMe: "pending",
        },
      },
    },
  },
}))

vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: (reference: string, args: MineArgs | PendingArgs | "skip") => {
    if (args === "skip") {
      return {
        data: undefined,
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      }
    }
    if (reference === "pending") {
      mocks.seenPending.push(args)
      const data = mocks.pending.get(args.paginationOpts.cursor ?? "start")
      return {
        data,
        isPending: data === undefined,
        isError: false,
        refetch: vi.fn(),
      }
    }
    // Le wrapper serveur agrégé ne doit plus être appelé : ses deux paginations
    // imbriquées échouent dans le runtime Convex, contrairement au harnais local.
    if (reference !== "mine-side" || !("side" in args)) throw new Error(`arguments inattendus pour ${reference}`)
    mocks.seen.push(args)
    const key = `${args.side}:${args.paginationOpts.cursor ?? "start"}`
    const data = mocks.pages.get(key)
    const isError = mocks.errors.has(key)
    return {
      data,
      isPending: data === undefined && !isError,
      isError,
      refetch: () => { mocks.retries.push(key) },
    }
  },
}))

import { usePersonalConnections, usePersonalPendingConnections } from "./use-dual-connection-pagination"

function setMinePage(low: string, high: string, page: DualPage) {
  mocks.pages.set(`low:${low}`, page.low)
  mocks.pages.set(`high:${high}`, page.high)
}

beforeEach(() => {
  mocks.pages.clear()
  mocks.pending.clear()
  mocks.seen = []
  mocks.seenPending = []
  mocks.errors.clear()
  mocks.retries = []
  mocks.context = { networkId: "networks_test", personId: "persons_me" }
  mocks.auth = { isAuthenticated: true, isLoading: false }
})

describe("pagination à deux curseurs des relations", () => {
  it("avance les deux curseurs, déduplique et trie toutes les pages", async () => {
    setMinePage("start", "start", {
      low: {
        page: [{ connectionId: "a", at: 10 }],
        isDone: false,
        continueCursor: "low-2",
      },
      high: {
        page: [{ connectionId: "b", at: 20 }],
        isDone: false,
        continueCursor: "high-2",
      },
    })
    setMinePage("low-2", "high-2", {
      low: {
        page: [{ connectionId: "c", at: 15 }],
        isDone: true,
        continueCursor: "low-end",
      },
      high: {
        page: [{ connectionId: "b", at: 25 }],
        isDone: true,
        continueCursor: "high-end",
      },
    })

    const { result } = renderHook(() => usePersonalConnections({ pageSize: 2 }), { wrapper: EngineTestWrapper })
    await waitFor(() => expect(result.current.items).toHaveLength(2))

    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items.map((item) => item.connectionId)).toEqual(["b", "c", "a"]))
    expect(result.current.hasMore).toBe(false)
    // UN graphe par réseau : chaque page est demandée DANS le réseau courant.
    for (const side of ["low", "high"]) expect(mocks.seen).toContainEqual({
      networkId: TEST_NETWORK_ID, side, paginationOpts: { cursor: `${side}-2`, numItems: 2 },
    })
  })

  it("épuise automatiquement les pages avant de stabiliser un compteur", async () => {
    setMinePage("start", "start", {
      low: {
        page: [{ connectionId: "a", at: 10 }],
        isDone: false,
        continueCursor: "low-next",
      },
      high: { page: [], isDone: true, continueCursor: "high-end" },
    })
    setMinePage("low-next", "high-end", {
      low: {
        page: [{ connectionId: "b", at: 20 }],
        isDone: true,
        continueCursor: "low-end",
      },
      high: { page: [], isDone: true, continueCursor: "high-end" },
    })

    const { result } = renderHook(() => usePersonalConnections({ autoLoad: true, pageSize: 1 }), {
      wrapper: EngineTestWrapper,
    })

    await waitFor(() => {
      expect(result.current.items).toHaveLength(2)
      expect(result.current.isLoadingMore).toBe(false)
    })
    expect(result.current.items.map((item) => item.connectionId)).toEqual(["b", "a"])
  })

  it("abonne les deux côtés indépendamment et attend la seconde réponse avant d'annoncer la suite", async () => {
    mocks.pages.set("low:start", { page: [{ connectionId: "a", at: 10 }], isDone: true, continueCursor: "low-end" })
    const { result, rerender } = renderHook(() => usePersonalConnections(), { wrapper: EngineTestWrapper })
    expect(result.current.items).toEqual([])
    expect(result.current.isLoading).toBe(true)
    expect(result.current.hasMore).toBe(false)
    expect(new Set(mocks.seen.map((args) => args.side))).toEqual(new Set(["low", "high"]))
    for (const side of ["low", "high"]) expect(mocks.seen).toContainEqual({
      networkId: TEST_NETWORK_ID, side, paginationOpts: { cursor: null, numItems: 25 },
    })
    mocks.pages.set("high:start", { page: [{ connectionId: "b", at: 20 }], isDone: true, continueCursor: "high-end" })
    rerender()
    await waitFor(() => expect(result.current.items.map((row) => row.connectionId)).toEqual(["b", "a"]))
    expect(result.current.isLoading).toBe(false)
  })

  it("poursuit un seul côté sans perdre les lignes du côté déjà épuisé", async () => {
    setMinePage("start", "start", {
      low: { page: [{ connectionId: "a", at: 10 }], isDone: false, continueCursor: "low-next" },
      high: { page: [{ connectionId: "b", at: 30 }], isDone: true, continueCursor: "high-end" },
    })
    setMinePage("low-next", "high-end", {
      low: { page: [{ connectionId: "c", at: 20 }], isDone: true, continueCursor: "low-end" },
      high: { page: [], isDone: true, continueCursor: "high-end" },
    })
    const { result } = renderHook(() => usePersonalConnections({ pageSize: 1 }), { wrapper: EngineTestWrapper })
    await waitFor(() => expect(result.current.items).toHaveLength(2))
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items.map((row) => row.connectionId)).toEqual(["b", "c", "a"]))
    expect(result.current.hasMore).toBe(false)
    expect(mocks.seen).toContainEqual({ networkId: TEST_NETWORK_ID, side: "high", paginationOpts: { cursor: "high-end", numItems: 1 } })
  })

  it("rend le refus d'un côté explicite et réessaie les deux abonnements, puis reprend", async () => {
    setMinePage("start", "start", {
      low: { page: [{ connectionId: "a", at: 10 }], isDone: true, continueCursor: "low-end" },
      high: { page: [{ connectionId: "b", at: 20 }], isDone: true, continueCursor: "high-end" },
    })
    mocks.errors.add("high:start")
    const { result, rerender } = renderHook(() => usePersonalConnections(), { wrapper: EngineTestWrapper })
    expect(result.current.isError).toBe(true)
    expect(result.current.items).toEqual([])
    expect(result.current.hasMore).toBe(false)
    act(() => result.current.retry())
    expect(mocks.retries).toEqual(["low:start", "high:start"])
    mocks.errors.clear()
    rerender()
    await waitFor(() => expect(result.current.items).toHaveLength(2))
    expect(result.current.isError).toBe(false)
  })

  it("réessaie aussi les côtés de la page courante sans réinscrire une demi-page refusée", async () => {
    setMinePage("start", "start", {
      low: { page: [{ connectionId: "a", at: 10 }], isDone: false, continueCursor: "low-next" },
      high: { page: [{ connectionId: "b", at: 30 }], isDone: true, continueCursor: "high-end" },
    })
    setMinePage("low-next", "high-end", {
      low: { page: [{ connectionId: "c", at: 20 }], isDone: true, continueCursor: "low-end" },
      high: { page: [], isDone: true, continueCursor: "high-end" },
    })
    mocks.errors.add("low:low-next")
    const { result, rerender } = renderHook(() => usePersonalConnections(), { wrapper: EngineTestWrapper })
    await waitFor(() => expect(result.current.items).toHaveLength(2))
    act(() => result.current.loadMore())
    expect(result.current.isError).toBe(true)
    expect(result.current.items.map((row) => row.connectionId)).toEqual(["b", "a"])
    act(() => result.current.retry())
    expect(mocks.retries).toEqual(["low:start", "high:start", "low:low-next", "high:high-end"])
    mocks.errors.clear()
    rerender()
    await waitFor(() => expect(result.current.items.map((row) => row.connectionId)).toEqual(["b", "c", "a"]))
  })

  it("réaligne les deux abonnements quand la première page change de frontière", async () => {
    setMinePage("start", "start", {
      low: { page: [{ connectionId: "a", at: 10 }], isDone: false, continueCursor: "low-old" },
      high: { page: [{ connectionId: "b", at: 30 }], isDone: true, continueCursor: "high-end" },
    })
    setMinePage("low-old", "high-end", {
      low: { page: [{ connectionId: "old", at: 20 }], isDone: true, continueCursor: "low-end" },
      high: { page: [], isDone: true, continueCursor: "high-end" },
    })
    const { result, rerender } = renderHook(() => usePersonalConnections(), { wrapper: EngineTestWrapper })
    await waitFor(() => expect(result.current.items).toHaveLength(2))
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items).toHaveLength(3))
    mocks.pages.set("low:start", { page: [{ connectionId: "new", at: 40 }], isDone: false, continueCursor: "low-new" })
    mocks.pages.set("low:low-new", { page: [{ connectionId: "a", at: 10 }], isDone: true, continueCursor: "low-end" })
    rerender()
    await waitFor(() => expect(result.current.items.map((row) => row.connectionId)).toEqual(["new", "b", "a"]))
    expect(mocks.seen).toContainEqual({ networkId: TEST_NETWORK_ID, side: "low", paginationOpts: { cursor: "low-new", numItems: 25 } })
  })

  it.each(["person", "network"])("abandonne les lignes, curseurs et callbacks d'un ancien contexte %s", async (changed) => {
    setMinePage("start", "start", {
      low: { page: [{ connectionId: "old-first", at: 10 }], isDone: false, continueCursor: "low-old" },
      high: { page: [], isDone: true, continueCursor: "high-end" },
    })
    setMinePage("low-old", "high-end", {
      low: { page: [{ connectionId: "old-next", at: 20 }], isDone: false, continueCursor: "low-later" },
      high: { page: [], isDone: true, continueCursor: "high-end" },
    })
    const { result, rerender } = renderHook(() => usePersonalConnections(), { wrapper: EngineTestWrapper })
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items).toHaveLength(2))
    const previous = result.current
    mocks.context = changed === "person"
      ? { ...mocks.context, personId: "persons_other" }
      : { ...mocks.context, networkId: "networks_other" }
    mocks.pages.clear()
    mocks.seen = []
    rerender()
    expect(result.current.items).toEqual([])
    expect(result.current.isLoading).toBe(true)
    expect(mocks.seen.every((args) => args.networkId === mocks.context.networkId && args.paginationOpts.cursor === null)).toBe(true)
    act(() => { previous.loadMore(); previous.remove("new"); previous.retry() })
    expect(mocks.retries).toEqual([])
    setMinePage("start", "start", {
      low: { page: [{ connectionId: "new", at: 40 }], isDone: true, continueCursor: "low-end" },
      high: { page: [], isDone: true, continueCursor: "high-end" },
    })
    rerender()
    await waitFor(() => expect(result.current.items.map((row) => row.connectionId)).toEqual(["new"]))
    expect(result.current.hasMore).toBe(false)
  })

  it("suspend les abonnements à la perte de session et redémarre sans les lignes de la session précédente", async () => {
    setMinePage("start", "start", {
      low: { page: [{ connectionId: "old", at: 10 }], isDone: true, continueCursor: "low-end" },
      high: { page: [], isDone: true, continueCursor: "high-end" },
    })
    const { result, rerender } = renderHook(() => usePersonalConnections(), { wrapper: EngineTestWrapper })
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    const previous = result.current
    mocks.auth = { isAuthenticated: false, isLoading: true }
    mocks.pages.clear()
    mocks.seen = []
    rerender()
    expect(result.current.items).toEqual([])
    expect(result.current.isLoading).toBe(true)
    act(() => result.current.retry())
    expect(mocks.seen).toEqual([])
    expect(mocks.retries).toEqual([])
    mocks.auth = { isAuthenticated: true, isLoading: false }
    rerender()
    act(() => previous.loadMore())
    expect(result.current.items).toEqual([])
    expect(result.current.isLoading).toBe(true)
    expect(mocks.seen.every((args) => args.paginationOpts.cursor === null)).toBe(true)
    setMinePage("start", "start", {
      low: { page: [{ connectionId: "renewed", at: 20 }], isDone: true, continueCursor: "low-end" },
      high: { page: [], isDone: true, continueCursor: "high-end" },
    })
    rerender()
    await waitFor(() => expect(result.current.items.map((row) => row.connectionId)).toEqual(["renewed"]))
  })
})

describe("demandes reçues — un seul index paginé", () => {
  it("suit le curseur natif unique et trie de la plus récente à la plus ancienne", async () => {
    mocks.pending.set("start", {
      page: [{ connectionId: "p1", at: 30 }],
      isDone: false,
      continueCursor: "p-2",
    })
    mocks.pending.set("p-2", {
      page: [
        { connectionId: "p2", at: 40 },
        { connectionId: "p1", at: 30 },
      ],
      isDone: true,
      continueCursor: "p-end",
    })

    const { result } = renderHook(() => usePersonalPendingConnections({ pageSize: 1 }), { wrapper: EngineTestWrapper })
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(result.current.hasMore).toBe(true)

    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items.map((item) => item.connectionId)).toEqual(["p2", "p1"]))
    expect(result.current.hasMore).toBe(false)
    expect(mocks.seenPending).toContainEqual({
      networkId: TEST_NETWORK_ID,
      paginationOpts: { cursor: "p-2", numItems: 1 },
    })
    // La paire n'a qu'un côté : la requête des connexions n'est jamais sollicitée.
    expect(mocks.seen).toEqual([])
  })

  it("annonce la fin dès la première page quand l'index est épuisé, et masque une demande traitée", async () => {
    mocks.pending.set("start", {
      page: [
        { connectionId: "p1", at: 30 },
        { connectionId: "p2", at: 10 },
      ],
      isDone: true,
      continueCursor: "p-end",
    })

    const { result } = renderHook(() => usePersonalPendingConnections(), { wrapper: EngineTestWrapper })
    await waitFor(() => expect(result.current.items).toHaveLength(2))
    expect(result.current.hasMore).toBe(false)
    expect(result.current.isLoading).toBe(false)

    act(() => result.current.remove("p1"))
    expect(result.current.items.map((item) => item.connectionId)).toEqual(["p2"])
  })
})
