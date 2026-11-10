// Dupliqué de socle/packages/agent-features/src/features/messagerie/MessagerieComposeView.test.tsx @ ad2e7fdc2 — adaptations : couche Convex authentifiée simulée sur les références du MOTEUR (`graph.connections.paginateMineSide` low/high indépendants / `searchMine`, arguments portant `networkId`) ; relations au DTO du moteur (`otherPersonId`, badges ; ni fonction ni administration) ; montage dans l'enveloppe du moteur (`renderWithEngine` : i18n fr, réseau, routes) au lieu de simuler `@antsia/ui` (vrais `Alert`/`Button`, vrai `useDebouncedValue`) ; un cas ajouté — relation sans nom publié ; les cinq cas du socle tels quels.
// @vitest-environment jsdom

/**
 * Nouveau message iCom — la 26e relation existe (IC-05, audit 2026-09-06).
 *
 * Le composant est monté avec ses VRAIS hooks (pagination à deux curseurs,
 * recherche serveur retardée) ; seule la couche Convex est simulée, requête
 * par requête. Les horloges sont factices : la pause de frappe se joue au
 * lieu de s'attendre.
 */

import { act, cleanup, fireEvent, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderWithEngine, TEST_NETWORK_ID } from "../../tests/engine-wrapper"

type Relation = {
  connectionId: string
  otherPersonId: string
  displayName: string | null
  handle: string | null
  headline: string | null
  avatarUrl: string | null
  badges: string[]
  at: number
}
type Page = { page: Relation[]; isDone: boolean; continueCursor: string }
type DualPage = { low: Page; high: Page }
type SideArgs = {
  networkId: string
  side: "low" | "high"
  paginationOpts: { cursor: string | null; numItems: number }
}
type SearchArgs = { networkId: string; query: string; limit: number }

const mocks = vi.hoisted(() => ({
  pages: new Map<string, Page>(),
  pageRequests: [] as string[],
  searchRequests: [] as Array<{ query: string; limit: number }>,
  search: {
    data: undefined as Relation[] | undefined,
    isPending: false,
    isError: false,
  },
  refetchSearch: vi.fn(),
  openDraft: vi.fn(),
}))

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}))

vi.mock("@antsia/api/engine", () => ({
  api: {
    modules: {
      graph: {
        connections: {
          paginateMine: "paginateMine",
          paginateMineSide: "paginateMineSide",
          paginatePendingForMe: "paginatePendingForMe",
          searchMine: "searchMine",
        },
      },
    },
  },
}))

vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: (
    reference: string,
    args: SideArgs | SearchArgs | "skip",
  ) => {
    if (args === "skip") {
      // Une requête désactivée reste `pending` en TanStack v5 : le hook de
      // recherche doit le masquer, et la vue ne doit pas attendre.
      return { data: undefined, isPending: true, isError: false, refetch: vi.fn() }
    }
    if (reference === "searchMine") {
      const { query, limit } = args as SearchArgs
      mocks.searchRequests.push({ query, limit })
      return { ...mocks.search, refetch: mocks.refetchSearch }
    }
    if (reference !== "paginateMineSide" || !("side" in args)) throw new Error(`Requête inattendue : ${reference}`)
    expect(args.networkId).toBe(TEST_NETWORK_ID)
    const key = `${args.side}:${args.paginationOpts.cursor ?? "start"}`
    mocks.pageRequests.push(key)
    const data = mocks.pages.get(key)
    return { data, isPending: data === undefined, isError: false, refetch: vi.fn() }
  },
}))

vi.mock("./dock-store", () => ({
  dockStore: { openDraft: (handle: string) => mocks.openDraft(handle) },
}))
vi.mock("./messagerie-styles", () => ({ MessagerieStyles: () => null }))
vi.mock("../reseau-personnel/Avatar", () => ({ Avatar: () => <span /> }))

import { MessagerieComposeView } from "./MessagerieComposeView"

function relation(index: number, overrides: Partial<Relation> = {}): Relation {
  return {
    connectionId: `c-${index}`,
    otherPersonId: `p-${index}`,
    displayName: `Prenom${index} Famille${index}`,
    handle: `rel${index}.ga`,
    headline: null,
    avatarUrl: null,
    badges: [],
    at: 10_000 - index,
    ...overrides,
  }
}

const VINGT_SIXIEME = relation(26, {
  displayName: "Zoé Famille26",
  handle: "zoe.rel26",
})

function setDualPage(low: string, high: string, page: DualPage): void {
  mocks.pages.set(`low:${low}`, page.low)
  mocks.pages.set(`high:${high}`, page.high)
}

/** Une première page de 25 relations, avec une suite à charger. */
function premierePage(): void {
  const rows = Array.from({ length: 25 }, (_, index) => relation(index + 1))
  setDualPage("start", "start", {
    low: { page: rows.slice(0, 13), isDone: false, continueCursor: "low-2" },
    high: { page: rows.slice(13), isDone: false, continueCursor: "high-2" },
  })
  setDualPage("low-2", "high-2", {
    low: { page: [VINGT_SIXIEME], isDone: true, continueCursor: "low-end" },
    high: { page: [], isDone: true, continueCursor: "high-end" },
  })
}

const nav = () => ({
  openConversation: vi.fn(),
  openCompose: vi.fn(),
  openComposeGroupe: vi.fn(),
  back: vi.fn(),
})

function taper(valeur: string): void {
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Chercher une personne à qui écrire" }),
    { target: { value: valeur } },
  )
}

function pauseDeFrappe(): void {
  act(() => {
    vi.advanceTimersByTime(300)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  mocks.pages.clear()
  mocks.pageRequests = []
  mocks.searchRequests = []
  mocks.search = { data: undefined, isPending: false, isError: false }
  mocks.refetchSearch.mockReset()
  mocks.openDraft.mockReset()
  premierePage()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("MessagerieComposeView — chercher parmi TOUTES mes relations", () => {
  it("retrouve la 26e relation par la recherche serveur, puis ouvre son brouillon", () => {
    const navigation = nav()
    mocks.search = { data: [VINGT_SIXIEME], isPending: false, isError: false }
    renderWithEngine(<MessagerieComposeView variant="page" nav={navigation} />)

    // La première page est là : 25 relations, aucune « Zoé ».
    expect(screen.getByRole("list", { name: "Mes relations" }).children).toHaveLength(25)
    expect(screen.queryByText(/Famille26/)).toBeNull()

    taper("Zoé")
    // Pendant la pause de frappe : ON CHERCHE, on ne conclut pas.
    expect(screen.getByRole("status").textContent).toContain("Recherche parmi vos relations")
    expect(screen.queryByText(/Aucune relation ne correspond/)).toBeNull()
    expect(mocks.searchRequests).toEqual([])

    pauseDeFrappe()
    expect(mocks.searchRequests).toEqual([{ query: "Zoé", limit: 25 }])
    const liste = screen.getByRole("list", { name: "Relations trouvées" })
    expect(liste.children).toHaveLength(1)

    fireEvent.click(screen.getByRole("button", { name: "Écrire à Zoé Famille26" }))
    expect(mocks.openDraft).toHaveBeenCalledWith("zoe.rel26")
    expect(navigation.openConversation).toHaveBeenCalledWith("draft:zoe.rel26")
  })

  it("ne dit « aucune relation » qu'une fois le serveur posé sur un résultat vide", () => {
    mocks.search = { data: undefined, isPending: true, isError: false }
    const { rerender } = renderWithEngine(<MessagerieComposeView variant="page" nav={nav()} />)

    taper("Personne")
    pauseDeFrappe()
    // La requête est partie et n'a pas répondu : toujours une attente.
    expect(mocks.searchRequests).toEqual([{ query: "Personne", limit: 25 }])
    expect(screen.getByRole("status").textContent).toContain("Recherche parmi vos relations")
    expect(screen.queryByText(/Aucune relation ne correspond/)).toBeNull()

    mocks.search = { data: [], isPending: false, isError: false }
    rerender(<MessagerieComposeView variant="page" nav={nav()} />)
    expect(screen.getByText("Aucune relation ne correspond à « Personne ».")).toBeTruthy()
    // Une réponse exhaustive : la suite des pages n'y changerait rien.
    expect(screen.queryByRole("button", { name: "Voir plus de relations" })).toBeNull()
  })

  it("montre une panne de recherche comme telle, avec Réessayer — jamais comme une absence", () => {
    mocks.search = { data: undefined, isPending: false, isError: true }
    renderWithEngine(<MessagerieComposeView variant="page" nav={nav()} />)

    taper("Famille1")
    pauseDeFrappe()
    expect(screen.getByRole("alert").textContent).toContain("Recherche indisponible")
    expect(screen.queryByText(/Aucune relation ne correspond/)).toBeNull()
    // Le pré-filtre local reste visible : Famille1, Famille10…Famille19.
    expect(screen.getByRole("list", { name: "Mes relations" }).children).toHaveLength(11)

    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
    expect(mocks.refetchSearch).toHaveBeenCalledOnce()
    // Charger la suite reste une issue quand le serveur ne répond pas.
    expect(screen.getByRole("button", { name: "Voir plus de relations" })).toBeTruthy()
  })

  it("garde « Voir plus de relations » atteignable même sans résultat local", () => {
    renderWithEngine(<MessagerieComposeView variant="page" nav={nav()} />)

    // Un seul caractère : sous le seuil serveur, aucune relation chargée ne
    // commence par « z » — mais la suite existe, et le bouton avec elle.
    taper("z")
    pauseDeFrappe()
    expect(mocks.searchRequests).toEqual([])
    expect(screen.getByText(/Aucune relation déjà chargée ne correspond/)).toBeTruthy()
    expect(screen.queryByText(/Aucune relation ne correspond à/)).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Voir plus de relations" }))
    expect(mocks.pageRequests).toContain("low:low-2")
    expect(mocks.pageRequests).toContain("high:high-2")
    // La 26e relation, chargée, répond au pré-filtre local.
    expect(screen.getByRole("button", { name: "Écrire à Zoé Famille26" })).toBeTruthy()
  })

  it("garde l'état vide explicite quand il n'y a encore aucune relation", () => {
    mocks.pages.clear()
    setDualPage("start", "start", {
      low: { page: [], isDone: true, continueCursor: "low-end" },
      high: { page: [], isDone: true, continueCursor: "high-end" },
    })
    renderWithEngine(<MessagerieComposeView variant="page" nav={nav()} />)
    expect(screen.getByText(/Vous n'avez encore aucune relation/)).toBeTruthy()
  })

  it("nomme une relation SANS NOM publié par le libellé neutre, jamais par une case vide", () => {
    mocks.pages.clear()
    setDualPage("start", "start", {
      low: { page: [relation(1, { displayName: null, handle: "anonyme.ga" })], isDone: true, continueCursor: "low-end" },
      high: { page: [], isDone: true, continueCursor: "high-end" },
    })
    renderWithEngine(<MessagerieComposeView variant="page" nav={nav()} />)
    expect(screen.getByRole("button", { name: "Écrire à Membre du réseau" })).toBeTruthy()
    expect(screen.getByText("@anonyme.ga")).toBeTruthy()
  })
})
