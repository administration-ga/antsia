// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/PeoplePanel.test.tsx @ ad2e7fdc2 — adaptations : montage dans l'enveloppe du moteur (`renderWithEngine` : i18n français, réseau et routes de test, routeur en mémoire — la sous-vue est lue dans la VRAIE adresse `?vue=` au lieu d'un `useTabQueryState` simulé) ; fonctions du moteur simulées (`people.directory.searchPeople`, `graph.connections.*`, `graph.follows.*` paginé, `suggestions.suggestions.*` paginé, `calls.direct.callMember` + magasin d'appel au lieu de `useRingRelation`) ; DTO du moteur (`otherPersonId`, `personId`, `targetPersonId`, pages natives) ; vraies primitives de `@antsia/ui` et vrai kit d'espace (`@antsia/ui/espace-kit`), plus aucune doublure d'interface ; adresses de test (`/messages/a/…`, `/fil?tab=relations&vue=…`) ; « Agents à découvrir » devient « Personnes à découvrir » ; cas RETIRÉ avec sa branche : « le poste avant la bio » (le moteur ne connaît ni poste ni administration) ; cas neufs : relation sans nom (libellé neutre), appel refusé (écran de fin), « Voir plus » des suivis par curseur natif, filtre des masquées qui repart de zéro.
// @vitest-environment jsdom

/**
 * PeoplePanel — deux familles de constats.
 *
 * R-08 (Lot 02) — une panne n'est jamais « personne » :
 *  1. « Personnes suivies » en panne : bandeau + Réessayer, jamais « Vous ne
 *     suivez personne » ;
 *  2. panne après données : la liste reste affichée ;
 *  3. la recherche en panne : bandeau, jamais « Aucune personne trouvée ».
 *
 * R-04 / R-05 (Lot 09A) — le volet est une chemise à trois sous-vues,
 * adressables par `?vue=` ; la grille se mesure sur le VOLET (le palier de
 * 280 px a disparu) ; une carte porte sa ligne de présentation et ses trois
 * gestes ; et le catalogue de suggestions tient son état — « Demande envoyée »
 * comme le masquage — du SERVEUR, plus d'un `useState`.
 */
import type { Id } from "@antsia/api/engine"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EngineTestWrapper, memoryRouter, renderWithEngine, TEST_NETWORK_ID } from "../../tests/engine-wrapper"

type QueryMock = {
  data: unknown
  isPending: boolean
  isFetching: boolean
  isError: boolean
  fetchStatus: "idle" | "fetching" | "paused"
  refetch: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => ({
  queries: {} as Record<string, QueryMock>,
  /**
   * Le repli d'une query non pilotée, MÉMORISÉ par nom.
   *
   * ⚠️ Sans cette mémoire, chaque rendu rendait un objet neuf : un `useEffect`
   * qui dépend de `data` repartait à chaque rendu et faisait boucler la
   * pagination du catalogue jusqu'à saturer le tas. Le vrai hook (TanStack)
   * rend une identité STABLE — le mock doit en faire autant.
   */
  fallbacks: {} as Record<string, QueryMock>,
  searchArgs: [] as unknown[],
  queryArgs: {} as Record<string, unknown[]>,
  mutations: {} as Record<string, ReturnType<typeof vi.fn>>,
  openOutgoingCall: vi.fn(),
  openRefusedCall: vi.fn(),
  relations: {
    items: [] as Array<Record<string, unknown>>,
    isLoading: false,
    isError: false,
    retry: vi.fn(),
    hasMore: false,
    isLoadingMore: false,
    loadMore: vi.fn(),
    remove: vi.fn(),
  },
}))

function ok(data: unknown): QueryMock {
  return {
    data,
    isPending: false,
    isFetching: false,
    isError: false,
    fetchStatus: "idle",
    refetch: vi.fn(),
  }
}

function err(data: unknown = undefined): QueryMock {
  return { ...ok(data), isError: true }
}

vi.mock("@antsia/api/engine", () => ({
  api: {
    modules: {
      people: { directory: { searchPeople: "searchPeople" } },
      graph: {
        connections: { requestConnection: "requestConnection", respondToConnection: "respondToConnection", cancelSentRequest: "cancelSentRequest" },
        follows: {
          follow: "follow",
          unfollow: "unfollow",
          paginateMyFollows: "paginateMyFollows",
          myFollowerCount: "myFollowerCount",
        },
      },
      suggestions: {
        suggestions: {
          paginate: "suggestionsPaginate",
          dismiss: "suggestionsDismiss",
          restore: "suggestionsRestore",
          paginateDismissed: "suggestionsPaginateDismissed",
          paginateSentInvitations: "paginateSentInvitations",
        },
      },
      calls: { direct: { callMember: "callMember" } },
    },
  },
}))

/** Une page native vide — une page paginée n'est pas un tableau. */
const PAGE_VIDE = { page: [], isDone: true, continueCursor: "" }

/** Le vide DE CHAQUE query. */
function emptyFor(query: string): unknown {
  if (query === "myFollowerCount") return 0
  if (query === "searchPeople") return []
  return PAGE_VIDE
}

vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: (query: string, args: unknown) => {
    if (query === "searchPeople") mocks.searchArgs.push(args)
    ;(mocks.queryArgs[query] ??= []).push(args)
    if (args === "skip") return { ...ok(undefined), isPending: true }
    return (mocks.queries[query] ??= mocks.fallbacks[query] ??= ok(emptyFor(query)))
  },
}))

vi.mock("../../stores/call-store", () => ({
  useCallStore: () => ({
    openOutgoingCall: mocks.openOutgoingCall,
    openRefusedCall: mocks.openRefusedCall,
  }),
}))

vi.mock("./use-dual-connection-pagination", () => ({
  usePersonalConnections: () => mocks.relations,
  usePersonalPendingConnections: () => mocks.relations,
}))
vi.mock("../iappel/presence-dot", () => ({
  PresenceDot: () => null,
  useConnectionsPresence: () => ({ presenceOf: () => null }),
}))
vi.mock("convex/react", () => ({
  useMutation: (ref: string) => {
    mocks.mutations[ref] ??= vi.fn().mockResolvedValue({})
    return mocks.mutations[ref]
  },
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { PeoplePanel } from "./PeoplePanel"

/** Monter le volet, l'adresse portant `search` (`vue=…`). */
function monter(search = "") {
  const router = memoryRouter({ pathname: "/fil", search })
  renderWithEngine(<PeoplePanel />, { router: router.implementation })
  return router
}

/** Une personne suivie, telle que `graph.follows.paginateMyFollows` la rend. */
function followed(handle: string, displayName: string) {
  return {
    targetPersonId: `persons_${handle}`,
    handle,
    displayName,
    headline: null,
    avatarUrl: null,
    badges: [],
    since: 1,
  }
}

beforeEach(() => {
  mocks.queries = {}
  mocks.fallbacks = {}
  mocks.searchArgs = []
  mocks.queryArgs = {}
  mocks.mutations = {}
  mocks.openOutgoingCall = vi.fn()
  mocks.openRefusedCall = vi.fn()
  mocks.relations.items = []
  mocks.relations.isError = false
  mocks.relations.isLoading = false
  mocks.relations.hasMore = false
  mocks.relations.remove.mockReset()
})

describe("PeoplePanel — gestes des invitations reçues", () => {
  const invitation = {
    connectionId: "connections_elise", otherPersonId: "persons_elise", handle: "elise.ndong",
    displayName: "Élise NDONG", headline: "Journaliste", avatarUrl: null,
    message: null, at: Date.UTC(2026, 9, 21, 12),
  }

  it.each([
    { label: "Confirmer", accept: true },
    { label: "Refuser", accept: false },
  ])("$label répond à la demande exacte, puis retire la ligne confirmée par le serveur", async ({ label, accept }) => {
    mocks.relations.items = [invitation]
    monter("vue=invitations")
    expect(screen.getByText("Élise NDONG")).toBeTruthy()
    expect(screen.getByText("@elise.ndong")).toBeTruthy()
    expect(screen.getByText(/^Demande du /).getAttribute("datetime")).toBe("2026-10-21T12:00:00.000Z")
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: label })) })
    expect(mocks.mutations.respondToConnection).toHaveBeenCalledExactlyOnceWith({ networkId: TEST_NETWORK_ID, connectionId: invitation.connectionId, accept })
    expect(mocks.relations.remove).toHaveBeenCalledExactlyOnceWith(invitation.connectionId)
  })

  it("une réponse en attente désarme les deux gestes ; un refus serveur conserve la demande", async () => {
    let reject: (error: Error) => void = () => undefined
    mocks.mutations.respondToConnection = vi.fn(() => new Promise((_resolve, fail) => { reject = fail }))
    mocks.relations.items = [invitation]
    monter("vue=invitations")
    fireEvent.click(screen.getByRole("button", { name: "Confirmer" }))
    fireEvent.click(screen.getByRole("button", { name: "Refuser" }))
    expect(screen.getByRole("button", { name: "Confirmer" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Refuser" })).toBeDisabled()
    expect(mocks.mutations.respondToConnection).toHaveBeenCalledTimes(1)
    await act(async () => { reject(new Error("refused")) })
    expect(mocks.relations.remove).not.toHaveBeenCalled()
    expect(screen.getByText("Élise NDONG")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Confirmer" })).not.toBeDisabled()
  })
})

describe("PeoplePanel — attente et échec des gestes sociaux", () => {
  it("Ajouter conserve le verrou partagé et revient disponible après un échec sans inventer un état envoyé", async () => {
    let reject: (error: Error) => void = () => undefined
    mocks.mutations.requestConnection = vi.fn(() => new Promise((_resolve, fail) => { reject = fail }))
    mocks.queries.suggestionsPaginate = ok(pageOf([suggestion("elise", "Élise NDONG")]))
    monter("vue=suggestions")
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    expect(screen.getByRole("button", { name: "Connexion…" })).toBeDisabled()
    expect(mocks.mutations.requestConnection).toHaveBeenCalledExactlyOnceWith({ networkId: TEST_NETWORK_ID, handle: "elise", returnRateLimit: true })
    await act(async () => { reject(new Error("refused")) })
    expect(screen.getByRole("button", { name: "Ajouter" })).not.toBeDisabled()
    expect(screen.queryByRole("button", { name: "Demande envoyée" })).toBeNull()
  })

  it("l'annulation attend la réponse serveur et garde sa version et sa carte après un échec", async () => {
    let reject: (error: Error) => void = () => undefined
    mocks.mutations.cancelSentRequest = vi.fn(() => new Promise((_resolve, fail) => { reject = fail }))
    mocks.queries.paginateSentInvitations = ok(pageOf([{
      connectionId: "connections_elise", otherPersonId: "persons_elise", handle: "elise.ndong", displayName: "Élise NDONG", headline: null, avatarUrl: null, at: 84,
    }]))
    monter("vue=invitations")
    const cancel = screen.getByRole("button", { name: "Annuler la demande envoyée à Élise NDONG" })
    fireEvent.click(cancel)
    fireEvent.click(cancel)
    expect(cancel).toBeDisabled()
    expect(mocks.mutations.cancelSentRequest).toHaveBeenCalledExactlyOnceWith({ networkId: TEST_NETWORK_ID, connectionId: "connections_elise", expectedRequestedAt: 84 })
    expect(screen.getByText("Élise NDONG")).toBeTruthy()
    await act(async () => { reject(new Error("staleRequest")) })
    expect(screen.getByText("Élise NDONG")).toBeTruthy()
    expect(cancel).not.toBeDisabled()
  })
})

afterEach(cleanup)

describe("PeoplePanel — personnes suivies (R-08)", () => {
  it("en panne : bandeau + Réessayer, jamais « Vous ne suivez personne »", () => {
    mocks.queries.paginateMyFollows = err()
    monter()

    expect(screen.queryByText(/Vous ne suivez personne/)).toBeNull()
    expect(screen.getByRole("alert").textContent).toContain("Personnes suivies indisponibles")

    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
    expect(mocks.queries.paginateMyFollows.refetch).toHaveBeenCalledTimes(1)
  })

  it("une panne après données CONSERVE la liste sous le bandeau", () => {
    mocks.queries.paginateMyFollows = err({ page: [followed("awa", "Awa Ndong")], isDone: true, continueCursor: "" })
    monter()

    expect(screen.getByText("Awa Ndong")).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toContain("Personnes suivies indisponibles")
    expect(screen.queryByText(/Vous ne suivez personne/)).toBeNull()
  })

  it("le vrai « personne » reste quand le serveur a répondu « rien »", () => {
    monter()
    expect(screen.getByText(/Vous ne suivez personne/)).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("« Voir plus » demande la page SUIVANTE par le curseur natif, jamais une limite gonflée", () => {
    mocks.queries.paginateMyFollows = ok({ page: [followed("awa", "Awa Ndong")], isDone: false, continueCursor: "curseur-2" })
    monter()
    // Un décompte qui n'a pas tout lu est un plancher.
    expect(screen.getByText("1+")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Voir plus de personnes suivies" }))
    const args = mocks.queryArgs.paginateMyFollows ?? []
    expect(args[0]).toMatchObject({ networkId: TEST_NETWORK_ID, paginationOpts: { cursor: null } })
    expect(args.at(-1)).toMatchObject({ networkId: TEST_NETWORK_ID, paginationOpts: { cursor: "curseur-2" } })
  })

  it("réinitialise aussi la carte des suivis intégrée au volet quand le lecteur change", () => {
    mocks.queries.paginateMyFollows = ok({ page: [followed("awa", "Awa Ndong")], isDone: false, continueCursor: "curseur-2" })
    const view = render(<EngineTestWrapper><PeoplePanel /></EngineTestWrapper>)
    fireEvent.click(screen.getByRole("button", { name: "Voir plus de personnes suivies" }))
    mocks.queries.paginateMyFollows = { ...ok(undefined), isPending: true, isFetching: true, fetchStatus: "fetching" }
    view.rerender(<EngineTestWrapper personId={"persons_other" as Id<"persons">}><PeoplePanel /></EngineTestWrapper>)
    expect(screen.queryByText("Awa Ndong")).toBeNull()
    expect((mocks.queryArgs.paginateMyFollows ?? []).at(-1)).toMatchObject({ paginationOpts: { cursor: null } })
  })
})

describe("PeoplePanel — la recherche (R-08)", () => {
  it("en panne : bandeau, jamais « Aucune personne trouvée »", () => {
    mocks.queries.searchPeople = err()
    monter()

    fireEvent.change(screen.getByLabelText("Chercher une personne"), {
      target: { value: "aw" },
    })
    expect(mocks.searchArgs).toContainEqual({ networkId: TEST_NETWORK_ID, query: "aw" })
    expect(screen.queryByText("Aucune personne trouvée.")).toBeNull()
    expect(screen.getByRole("alert").textContent).toContain("Recherche indisponible")

    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
    expect(mocks.queries.searchPeople.refetch).toHaveBeenCalledTimes(1)
  })

  it("sans saisie, la recherche est INACTIVE : ni attente, ni vide, ni panne", () => {
    mocks.queries.searchPeople = err()
    monter()
    expect(screen.queryByText("Recherche…")).toBeNull()
    expect(screen.queryByText("Aucune personne trouvée.")).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("le vrai « Aucune personne trouvée » reste après réponse vide", () => {
    mocks.queries.searchPeople = ok([])
    monter()
    fireEvent.change(screen.getByLabelText("Chercher une personne"), {
      target: { value: "zz" },
    })
    expect(screen.getByText("Aucune personne trouvée.")).toBeTruthy()
  })
})

// ═══════════════════════════════════════════════════════════════
// R-04 — sous-vues, grille mesurée, cartes lisibles
// ═══════════════════════════════════════════════════════════════

/** Une relation, telle que le graphe du réseau la rend (`ConnectionPersonDto`). */
function relation(handle: string | null, displayName: string | null, extra: Record<string, unknown> = {}) {
  return {
    connectionId: `connections_${handle ?? "anonyme"}`,
    otherPersonId: `persons_${handle ?? "anonyme"}`,
    handle,
    displayName,
    headline: null,
    avatarUrl: null,
    badges: [],
    at: 1,
    ...extra,
  }
}

/** Une carte du catalogue (`suggestions.suggestions.paginate`). */
function suggestion(handle: string, displayName: string, extra: Record<string, unknown> = {}) {
  return {
    personId: `persons_${handle}`,
    handle,
    displayName,
    headline: null,
    avatarUrl: null,
    relationState: "none",
    dismissed: false,
    ...extra,
  }
}

function pageOf(items: unknown[]) {
  return { page: items, isDone: true, continueCursor: "" }
}

describe("PeoplePanel — les sous-vues sont ADRESSABLES (R-04)", () => {
  it("lit sa sous-vue dans le paramètre `vue`, jamais dans un état local", () => {
    const router = monter()
    fireEvent.click(screen.getByRole("tab", { name: "Suggestions" }))
    // Le geste ÉCRIT l'adresse…
    expect(router.calls).toContainEqual({ method: "replace", href: "/fil?vue=suggestions" })
    // …et l'écran suit l'adresse, pas un état local : elle n'a pas changé ici.
    expect(screen.getByRole("tab", { name: "Mes relations" }).getAttribute("aria-selected")).toBe("true")
  })

  it("trois onglets, « Mes relations » d'office", () => {
    monter()
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Mes relations", "Suggestions", "Invitations"])
    expect(screen.getByRole("tab", { name: "Mes relations" }).getAttribute("aria-selected")).toBe("true")
    expect(screen.getByText("Mes connexions")).toBeTruthy()
    expect(screen.queryByText("Invitations envoyées")).toBeNull()
  })

  it("`?vue=invitations` ouvre les invitations REÇUES *et* ENVOYÉES", () => {
    monter("vue=invitations")
    expect(screen.getByText("Invitations reçues")).toBeTruthy()
    expect(screen.getByText("Invitations envoyées")).toBeTruthy()
    // Le volet Relations n'est pas rendu en même temps : une sous-vue
    // REMPLACE, elle n'empile pas.
    expect(screen.queryByText("Mes connexions")).toBeNull()
  })

  it("`?vue=suggestions` ouvre le CATALOGUE, pas la liste des connexions", () => {
    monter("vue=suggestions")
    expect(screen.getByText("Personnes à découvrir")).toBeTruthy()
    expect(screen.queryByText("Mes connexions")).toBeNull()
  })

  it("une sous-vue inconnue retombe sur « Mes relations » au lieu d'un écran vide", () => {
    monter("vue=n-importe-quoi")
    expect(screen.getByText("Mes connexions")).toBeTruthy()
  })

  it("la recherche reste en tête, quelle que soit la sous-vue", () => {
    monter("vue=suggestions")
    expect(screen.getByRole("search", { name: "Trouver une personne" })).toBeTruthy()
  })
})

describe("PeoplePanel — la carte d'une relation (R-04)", () => {
  it("le titre publié prend la ligne de présentation", () => {
    mocks.relations.items = [relation("awa", "Awa Ndong", { headline: "Archiviste" })]
    monter()
    expect(screen.getByText("Archiviste")).toBeTruthy()
  })

  it("une relation sans nom ni profil publié reste nommée, sans geste mort", () => {
    mocks.relations.items = [relation(null, null)]
    monter()
    expect(screen.getByText("Personne du réseau")).toBeTruthy()
    expect(screen.getByText("Profil non publié")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Appeler/ })).toBeNull()
  })

  it("offre Profil, Écrire et Appeler", async () => {
    mocks.relations.items = [relation("awa", "Awa Ndong")]
    mocks.mutations.callMember = vi.fn().mockResolvedValue({
      admitted: true,
      callId: "calls_1",
      calleePersonId: "persons_awa",
      roomName: "salle",
      mediaType: "audio",
    })
    monter()
    expect(screen.getByRole("link", { name: "Écrire" }).getAttribute("href")).toBe("/messages/a/awa")
    expect(screen.getAllByRole("link", { name: "Profil" }).map((link) => link.getAttribute("href"))).toContain("/profil/awa")
    fireEvent.click(screen.getByRole("button", { name: "Appeler Awa Ndong" }))
    expect(mocks.mutations.callMember).toHaveBeenCalledWith({
      networkId: TEST_NETWORK_ID,
      target: { personId: "persons_awa" },
      mediaType: "audio",
    })
    await vi.waitFor(() =>
      expect(mocks.openOutgoingCall).toHaveBeenCalledWith(
        expect.objectContaining({
          meetingId: "calls_1",
          participantUserId: "persons_awa",
          mediaType: "audio",
          callee: { userId: "persons_awa", name: "Awa Ndong", avatarUrl: null, handle: "awa" },
        }),
      ),
    )
  })

  it("un appel REFUSÉ ouvre l'écran de fin, pas un toast", async () => {
    mocks.relations.items = [relation("awa", "Awa Ndong")]
    mocks.mutations.callMember = vi.fn().mockResolvedValue({
      admitted: false,
      callId: "calls_2",
      calleePersonId: "persons_awa",
      reason: "dnd",
      voicemailOffered: true,
    })
    monter()
    fireEvent.click(screen.getByRole("button", { name: "Appeler Awa Ndong" }))
    await vi.waitFor(() =>
      expect(mocks.openRefusedCall).toHaveBeenCalledWith(expect.objectContaining({ meetingId: "calls_2", endKind: "dnd", voicemailOffered: true })),
    )
    expect(mocks.openOutgoingCall).not.toHaveBeenCalled()
  })
})

describe("PeoplePanel — catalogue de suggestions (R-05)", () => {
  it("« Demande envoyée » vient du SERVEUR, et désarme le bouton", () => {
    mocks.queries.suggestionsPaginate = ok(
      pageOf([
        suggestion("bea", "Béa Moussavou", {
          relationState: "requested_by_me",
        }),
      ]),
    )
    monter("vue=suggestions")
    const bouton = screen.getByRole("button", { name: "Demande envoyée" })
    expect(bouton.hasAttribute("disabled")).toBe(true)
  })

  it("une invitation REÇUE propose d'aller répondre, pas de redemander", () => {
    mocks.queries.suggestionsPaginate = ok(pageOf([suggestion("cyr", "Cyr Obame", { relationState: "requested_by_them" })]))
    monter("vue=suggestions")
    expect(screen.getByRole("button", { name: "Invitation reçue" }).hasAttribute("disabled")).toBe(true)
    expect(screen.getByRole("link", { name: "Répondre" }).getAttribute("href")).toBe("/fil?tab=relations&vue=invitations")
  })

  it("Suivre est offert à côté d'Ajouter, et suit par l'identifiant (ADR-0037)", async () => {
    mocks.queries.suggestionsPaginate = ok(pageOf([suggestion("bea", "Béa Moussavou", { followsYou: true })]))
    monter("vue=suggestions")
    const suivre = screen.getByRole("button", { name: "Suivre Béa Moussavou en retour" })
    expect(suivre.textContent).toContain("Suivre en retour")
    expect(screen.getByRole("button", { name: "Ajouter" })).toBeTruthy()
    await act(async () => { fireEvent.click(suivre) })
    expect(mocks.mutations.follow).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, handle: "bea" })
  })

  it("masquer appelle la mutation PERSISTANTE, pas un état local", () => {
    mocks.queries.suggestionsPaginate = ok(pageOf([suggestion("bea", "Béa Moussavou")]))
    monter("vue=suggestions")
    fireEvent.click(screen.getByRole("button", { name: "Masquer la suggestion Béa Moussavou" }))
    expect(mocks.mutations.suggestionsDismiss).toHaveBeenCalledWith({
      networkId: TEST_NETWORK_ID,
      handle: "bea",
    })
  })

  it("les masquées se réaffichent — le geste est réversible", () => {
    mocks.queries.suggestionsPaginate = ok(pageOf([suggestion("bea", "Béa Moussavou", { dismissed: true })]))
    monter("vue=suggestions")
    fireEvent.click(screen.getByRole("button", { name: "Réafficher" }))
    expect(mocks.mutations.suggestionsRestore).toHaveBeenCalledWith({
      networkId: TEST_NETWORK_ID,
      targetPersonId: "persons_bea",
    })
  })

  it("le catalogue en panne le DIT — jamais « plus personne à découvrir »", () => {
    mocks.queries.suggestionsPaginate = err()
    monter("vue=suggestions")
    expect(screen.queryByText("Aucune nouvelle personne à proposer pour le moment.")).toBeNull()
    expect(screen.getByRole("alert").textContent).toContain("Suggestions indisponibles")
  })

  it("demande bien une PAGE au serveur, jamais une limite gonflée", () => {
    monter("vue=suggestions")
    const args = mocks.queryArgs.suggestionsPaginate ?? []
    expect(args.length).toBeGreaterThan(0)
    expect(args[0]).toMatchObject({
      networkId: TEST_NETWORK_ID,
      paginationOpts: { cursor: null },
      includeDismissed: false,
    })
  })

  it("afficher les masquées REPART de zéro, filtre compris", () => {
    mocks.queries.suggestionsPaginateDismissed = ok({ page: [{ targetPersonId: "persons_bea" }], isDone: true, continueCursor: "" })
    monter("vue=suggestions")
    fireEvent.click(screen.getByRole("button", { name: "Afficher les suggestions masquées (1)" }))
    expect((mocks.queryArgs.suggestionsPaginate ?? []).at(-1)).toMatchObject({
      paginationOpts: { cursor: null },
      includeDismissed: true,
    })
    expect(screen.getByRole("button", { name: "Cacher les suggestions masquées" }).getAttribute("aria-pressed")).toBe("true")
  })
})

describe("PeoplePanel — invitations envoyées (R-04)", () => {
  it("liste les demandes en attente de réponse", () => {
    mocks.queries.paginateSentInvitations = ok(
      pageOf([
        {
          connectionId: "connections_bea",
          otherPersonId: "persons_bea",
          handle: "bea",
          displayName: "Béa Moussavou",
          headline: null,
          avatarUrl: null,
          at: 1,
        },
      ]),
    )
    monter("vue=invitations")
    expect(screen.getByText("Béa Moussavou")).toBeTruthy()
    expect(screen.getByText("En attente de réponse.")).toBeTruthy()
  })

  it("en panne : bandeau, jamais « aucune demande »", () => {
    mocks.queries.paginateSentInvitations = err()
    monter("vue=invitations")
    expect(screen.queryByText("Aucune demande en attente de réponse.")).toBeNull()
    expect(
      screen
        .getAllByRole("alert")
        .map((node) => node.textContent ?? "")
        .join(" "),
    ).toContain("Invitations envoyées indisponibles")
  })

  it("annule depuis la même carte intégrée avec la version exacte de la demande", async () => {
    mocks.queries.paginateSentInvitations = ok(pageOf([{
      connectionId: "connections_bea", otherPersonId: "persons_bea", handle: "bea", displayName: "Béa Moussavou", headline: null, avatarUrl: null, at: 42,
    }]))
    monter("vue=invitations")
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Annuler la demande envoyée à Béa Moussavou" })) })
    expect(mocks.mutations.cancelSentRequest).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, connectionId: "connections_bea", expectedRequestedAt: 42 })
    expect(screen.queryByText("Béa Moussavou")).toBeNull()
  })

  it("réinitialise les demandes envoyées du volet quand le lecteur change", () => {
    mocks.queries.paginateSentInvitations = ok(pageOf([{
      connectionId: "connections_bea", otherPersonId: "persons_bea", handle: "bea", displayName: "Béa Moussavou", headline: null, avatarUrl: null, at: 42,
    }]))
    const router = memoryRouter({ pathname: "/fil", search: "vue=invitations" })
    const view = render(<EngineTestWrapper router={router.implementation}><PeoplePanel /></EngineTestWrapper>)
    expect(screen.getByText("Béa Moussavou")).toBeTruthy()
    mocks.queries.paginateSentInvitations = { ...ok(undefined), isPending: true, isFetching: true, fetchStatus: "fetching" }
    view.rerender(<EngineTestWrapper router={router.implementation} personId={"persons_other" as Id<"persons">}><PeoplePanel /></EngineTestWrapper>)
    expect(screen.queryByText("Béa Moussavou")).toBeNull()
    expect((mocks.queryArgs.paginateSentInvitations ?? []).at(-1)).toMatchObject({ paginationOpts: { cursor: null } })
  })
})
