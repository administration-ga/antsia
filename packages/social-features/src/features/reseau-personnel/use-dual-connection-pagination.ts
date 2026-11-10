// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/use-dual-connection-pagination.ts @ ad2e7fdc2 — adaptations : UN seul graphe par réseau — `reseauPersonnel.connections.*` et `reseau.connections.*` deviennent deux abonnements indépendants à `graph.connections.paginateMineSide` (`low`/`high`, une seule pagination native par query) et `graph.connections.paginatePendingForMe` (un seul index, présenté comme une paire au côté haut épuisé) ; `networkId` et personne lus par `useNetwork()` ; DTO `ConnectionPersonDto` du moteur (type `PersonalConnection` exporté) ; source typée, chaîne isolée par contexte d'authentification ; `useCoreConnections` et `useCorePendingConnections` retirés (annuaire administratif) ; horodatage `at` hors du rendu.
"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { useConvexAuth } from "convex/react"
import type { FunctionReference, FunctionReturnType } from "convex/server"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import {
  appendDualPage,
  currentDualCursors,
  dualContinuation,
  dualPagesLoaded,
  FIRST_DUAL_CURSORS,
  initialDualPages,
  isFirstDualCursors,
  mergeDualRows,
  recordDualPage,
  removeDualRow,
  type DualCursors,
  type DualPageData,
  type DualPagesState,
  type DualSide,
} from "./dual-pagination-pages"

const DEFAULT_PAGE_SIZE = 25

/** Une relation acceptée, telle que le moteur la rend (`ConnectionPersonDto`). */
export type PersonalConnection = FunctionReturnType<typeof api.modules.graph.connections.paginateMineSide>["page"][number]

/** Une demande reçue — même DTO, avec le mot joint à la demande quand il y en a un. */
export type PersonalPendingConnection = FunctionReturnType<typeof api.modules.graph.connections.paginatePendingForMe>["page"][number]

/**
 * D'où vient chaque côté : la requête, ses arguments pour son curseur natif,
 * et la lecture de sa réponse. Constantes de
 * module : leur identité ne change jamais d'un rendu à l'autre.
 */
interface DualSource<Query extends FunctionReference<"query">, T> {
  query: Query
  hasHighSide: boolean
  args: (networkId: Id<"networks">, cursors: DualCursors, side: "low" | "high", numItems: number) => Query["_args"] | "skip"
  page: (data: FunctionReturnType<Query>) => DualSide<T>
}

interface DualPaginationOptions<T> {
  autoLoad?: boolean
  pageSize?: number
  timestamp: (item: T) => number
}

interface DualPaginationResult<T> {
  items: T[]
  isLoading: boolean
  isLoadingMore: boolean
  isError: boolean
  hasMore: boolean
  loadMore: () => void
  remove: (connectionId: unknown) => void
  retry: () => void
}

/** Le côté haut d'une source qui n'en a qu'un : vide, épuisé, et son curseur de fin. */
const EXHAUSTED_SIDE: DualSide<never> = Object.freeze({ page: [], isDone: true, continueCursor: "" })

/** Mes connexions : la paire canonique, un curseur natif par côté. */
const MINE_SOURCE: DualSource<typeof api.modules.graph.connections.paginateMineSide, PersonalConnection> = {
  query: api.modules.graph.connections.paginateMineSide,
  hasHighSide: true,
  args: (networkId, cursors, side, numItems) => ({
    networkId,
    side,
    paginationOpts: { cursor: cursors[side], numItems },
  }),
  page: (data) => data,
}

/**
 * Les demandes qui m'attendent : UN index (celui du destinataire), donc un seul
 * curseur — porté par le côté bas ; le côté haut est épuisé dès la première page.
 */
const PENDING_SOURCE: DualSource<typeof api.modules.graph.connections.paginatePendingForMe, PersonalPendingConnection> = {
  query: api.modules.graph.connections.paginatePendingForMe,
  hasHighSide: false,
  args: (networkId, cursors, side, numItems) => side === "high" ? "skip" : ({
    networkId,
    paginationOpts: { cursor: cursors.low, numItems },
  }),
  page: (data) => data,
}

/**
 * Une query par côté : des `runQuery` imbriqués partagent aussi le journal de
 * pagination Convex et ne permettent pas de composer deux `.paginate()` côté
 * serveur. Ne former une page qu'après réception de ses DEUX côtés évite
 * d'annoncer une fausse fin ou de réaligner la chaîne sur une demi-réponse.
 */
function useDualPage<Query extends FunctionReference<"query">, T>(
  source: DualSource<Query, T>,
  networkId: Id<"networks">,
  cursors: DualCursors | "skip",
  pageSize: number,
) {
  const active = cursors !== "skip"
  const low = useAuthenticatedConvexQuery(source.query, cursors === "skip" ? "skip" : source.args(networkId, cursors, "low", pageSize))
  const high = useAuthenticatedConvexQuery(source.query, cursors === "skip" ? "skip" : source.args(networkId, cursors, "high", pageSize))
  const data = useMemo<DualPageData<T> | undefined>(() => {
    if (!active || low.isError || (source.hasHighSide && high.isError) || low.data === undefined) return undefined
    if (!source.hasHighSide) return { low: source.page(low.data), high: EXHAUSTED_SIDE }
    if (high.data === undefined) return undefined
    return { low: source.page(low.data), high: source.page(high.data) }
  }, [active, low.data, high.data, low.isError, high.isError, source])
  return {
    data,
    isPending: cursors !== "skip" && (low.isPending || (source.hasHighSide && high.isPending)),
    isError: cursors !== "skip" && (low.isError || (source.hasHighSide && high.isError)),
    refetch: () => {
      if (cursors === "skip") return
      void low.refetch()
      if (source.hasHighSide) void high.refetch()
    },
  }
}

/** L'ordre de la liste : la relation la plus récente d'abord (`at` du serveur). */
const byAt = (item: { at: number }) => item.at

/**
 * Assemble les deux côtés de la paire canonique sans perdre leur curseur
 * natif. La CHAÎNE des pages — lesquelles sont montées, laquelle suit, quand
 * l'abandonner — est décidée par `dual-pagination-pages.ts` (pur, testé) ; ce
 * hook l'abonne et la câble.
 *
 * Deux pages abonnées seulement : la PREMIÈRE page, toujours, et la page
 * COURANTE, la dernière montée. Les pages intermédiaires sont des instantanés :
 * quand la première page change de frontière (une relation y entre ou en
 * sort), la chaîne se réaligne sur elle et abandonne ces instantanés, au lieu
 * de garder une page périmée — ligne disparue ou relation fantôme.
 */
function useDualConnectionPagination<Query extends FunctionReference<"query">, T extends { connectionId: unknown }>(
  source: DualSource<Query, T>,
  options: DualPaginationOptions<T>,
): DualPaginationResult<T> {
  const { networkId, personId } = useNetwork()
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth()
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  // Une nouvelle génération, même lorsqu'un compte revient après une perte de
  // session : aucune ligne ni action de l'ancienne génération ne peut revenir.
  const generation = useMemo(() => ({ networkId, personId, pageSize, isAuthenticated, isAuthLoading }), [networkId, personId, pageSize, isAuthenticated, isAuthLoading])
  const activeGeneration = useRef(generation)
  useLayoutEffect(() => { activeGeneration.current = generation }, [generation])
  const emptyState = useMemo(() => ({ generation, chain: initialDualPages<T>() }), [generation])
  const emptyChain = emptyState.chain
  const [state, setState] = useState(() => emptyState)
  const chain = state.generation === generation ? state.chain : emptyChain
  const setChain = useCallback((update: (previous: DualPagesState<T>) => DualPagesState<T>) => {
    setState((previous) => {
      if (activeGeneration.current !== generation) return previous
      const before = previous.generation === generation ? previous.chain : emptyChain
      const next = update(before)
      return previous.generation === generation && next === before ? previous : { generation, chain: next }
    })
  }, [emptyChain, generation])
  const current = currentDualCursors(chain)
  const onFirstPage = isFirstDualCursors(current)

  const enabled = isAuthenticated && !isAuthLoading
  const firstPage = useDualPage(source, networkId, enabled ? FIRST_DUAL_CURSORS : "skip", pageSize)
  const currentPage = useDualPage(source, networkId, enabled && !onFirstPage ? current : "skip", pageSize)
  const page = onFirstPage ? firstPage : currentPage

  // La première page est TOUJOURS vivante : l'enregistrer réaligne la chaîne
  // dès que sa frontière avec la suivante a bougé (`rebaseDualPages`).
  useEffect(() => {
    const data = firstPage.data
    if (data === undefined) return
    setChain((state) => recordDualPage(state, FIRST_DUAL_CURSORS, data))
  }, [firstPage.data, setChain])

  // La page courante — sa réponse est ignorée si la chaîne a été réalignée
  // entre-temps : elle ressusciterait une page abandonnée.
  useEffect(() => {
    const data = currentPage.data
    if (onFirstPage || data === undefined) return
    setChain((state) => recordDualPage(state, current, data))
  }, [current, currentPage.data, onFirstPage, setChain])

  const items = useMemo(() => mergeDualRows(chain, options.timestamp), [chain, options.timestamp])

  const pageData = page.data
  const next = pageData === undefined ? null : dualContinuation(pageData)
  const hasMore = next !== null
  const loadMore = useCallback(() => {
    if (pageData === undefined) return
    // `current` dit de quelle page on a lu la suite : si la chaîne a été
    // réalignée depuis, le geste est périmé et `appendDualPage` l'ignore.
    setChain((state) => appendDualPage(state, current, dualContinuation(pageData)))
  }, [current, pageData, setChain])
  // Masque OPTIMISTE, immédiat : la relation sort de toutes les pages reçues
  // sans attendre le serveur — une page vivante qui la rendrait encore l'y
  // remettrait, parce que c'est lui qui a raison.
  const remove = useCallback((connectionId: unknown) => {
    setChain((state) => removeDualRow(state, connectionId))
  }, [setChain])

  useEffect(() => {
    if (options.autoLoad && hasMore && !page.isPending) loadMore()
  }, [hasMore, loadMore, options.autoLoad, page.isPending])

  const loadedAnyPage = dualPagesLoaded(chain)
  return {
    items,
    isLoading: !enabled || (page.isPending && !loadedAnyPage),
    isLoadingMore: (page.isPending && loadedAnyPage) || Boolean(options.autoLoad && hasMore),
    isError: firstPage.isError || currentPage.isError,
    hasMore,
    loadMore,
    remove,
    retry: () => {
      if (activeGeneration.current !== generation) return
      void firstPage.refetch()
      if (!onFirstPage) void currentPage.refetch()
    },
  }
}

/** Mes connexions acceptées dans le réseau courant. */
export function usePersonalConnections(options?: { autoLoad?: boolean; pageSize?: number }) {
  return useDualConnectionPagination(MINE_SOURCE, { ...options, timestamp: byAt })
}

/** Les demandes de connexion qui m'attendent dans le réseau courant. */
export function usePersonalPendingConnections(options?: { autoLoad?: boolean; pageSize?: number }) {
  return useDualConnectionPagination(PENDING_SOURCE, { ...options, timestamp: byAt })
}
