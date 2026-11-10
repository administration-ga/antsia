// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/GroupsPanel.test.tsx @ ad2e7fdc2 — adaptations : fonctions du moteur moquées (`thematicGroups.thematicGroups.*`, recherche `graph.connections.searchMine`), réponses au DTO du moteur (`myGroups` → `{ items, truncated }`, vivier `{ items, truncated }` aux lignes `personId`, mur `{ items, nextCursor }`), invitations PAGINÉES (une panne lève, la frontière la dit) ; rendu dans l'enveloppe du moteur (`renderWithEngine` : i18n français, réseau de test) ; primitives de `@antsia/ui` et kit d'espace (`@antsia/ui/espace-kit`) moqués ; les treize cas du socle portés ; cas ajoutés : le refus `notFound` dit « plus accessible », les gestes portent le réseau courant, la lacune de « Mes groupes » se dit, l'invitation envoie une demande par personne cochée ; gestion d'un groupe (PG-02) : règles lues et cochées avant « Rejoindre », carte et invitation d'un groupe à règles qui ouvrent sa fiche, règles nouvelles acceptées par le membre, groupe fermé gelé à l'écran, « Gérer le groupe » réservé au propriétaire (règles, transfert confirmé, fermeture en deux temps, suppression par le nom).
// @vitest-environment jsdom

/**
 * GroupsPanel — une panne n'est jamais une invitation à créer un groupe
 * (R-08) :
 *
 *  1. « Mes groupes » en panne : bandeau + Réessayer, JAMAIS « créez le
 *     vôtre » ;
 *  2. la découverte en panne : bandeau, jamais « Créez le premier » ;
 *  3. une panne après données conserve la liste ;
 *  4. la fiche d'un groupe en panne n'est pas « plus accessible » ;
 *  5. les invitations en panne se disent.
 *
 * Étendu le 2026-09-06 (R-13) : la page d'un groupe est un LIEU — elle vient
 * de l'URL (`groupId`), s'ouvre par `onOpenGroup` et se referme par `onBack` :
 * le volet n'a plus d'état de vue à lui. Et l'invitation passe par le
 * sélecteur de relations, plus par un champ « @identifiant ».
 */
import { fireEvent, screen, waitFor } from "@testing-library/react"
import { ConvexError } from "convex/values"
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createAppI18n } from "../../i18n"
import { renderWithEngine, TEST_NETWORK_ID } from "../../tests/engine-wrapper"
import { EMPTY_DISCOVER_TEXT_KEY, EMPTY_MY_GROUPS_TEXT_KEY } from "./groupes-thematiques"

type QueryMock = {
  data: unknown
  error?: unknown
  isPending: boolean
  isFetching: boolean
  isError: boolean
  fetchStatus: "idle" | "fetching" | "paused"
  refetch: ReturnType<typeof vi.fn>
}

type PaginatedMock = {
  results: unknown[]
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted"
  loadMore: ReturnType<typeof vi.fn>
  isLoading: boolean
}

const mocks = vi.hoisted(() => ({
  queries: {} as Record<string, QueryMock>,
  paginated: {} as Record<string, PaginatedMock | Error>,
  mutations: {} as Record<string, ReturnType<typeof vi.fn>>,
  queryCalls: [] as [string, unknown][],
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

function err(data: unknown = undefined, error: unknown = new Error("panne")): QueryMock {
  return { ...ok(data), error, isError: true }
}

/** Ce que le moteur rend quand il n'y a « rien » — à la forme de chaque DTO. */
function emptyAnswer(query: string): QueryMock {
  switch (query) {
    case "myGroups":
      return ok({ items: [], truncated: false })
    case "listInviteCandidates":
    case "listTransferCandidates":
      return ok({ items: [], truncated: false })
    case "groupWall":
      return ok({ items: [], nextCursor: null })
    default:
      return ok([])
  }
}

function exhausted(results: unknown[] = []): PaginatedMock {
  return { results, status: "Exhausted", loadMore: vi.fn(), isLoading: false }
}

function mutation(reference: string) {
  mocks.mutations[reference] ??= vi.fn().mockResolvedValue({})
  return mocks.mutations[reference]
}

vi.mock("@antsia/api/engine", () => ({
  api: {
    modules: {
      thematicGroups: {
        thematicGroups: {
          paginateMyInvites: "paginateMyInvites",
          myGroups: "myGroups",
          discover: "discover",
          respondInvite: "respondInvite",
          join: "join",
          create: "create",
          getGroup: "getGroup",
          leave: "leave",
          unpinGroupPost: "unpinGroupPost",
          invite: "invite",
          paginateMembers: "paginateMembers",
          setMemberRole: "setMemberRole",
          removeMember: "removeMember",
          groupWall: "groupWall",
          pinGroupPost: "pinGroupPost",
          removeGroupPost: "removeGroupPost",
          listInviteCandidates: "listInviteCandidates",
          acceptGroupRules: "acceptGroupRules",
          setGroupRules: "setGroupRules",
          transferGroupOwnership: "transferGroupOwnership",
          listTransferCandidates: "listTransferCandidates",
          closeGroup: "closeGroup",
          archiveGroup: "archiveGroup",
          deleteGroup: "deleteGroup",
        },
      },
      graph: { connections: { searchMine: "searchMine" } },
    },
  },
}))

vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: (query: string, args: unknown) => {
    mocks.queryCalls.push([query, args])
    return mocks.queries[query] ?? emptyAnswer(query)
  },
  useAuthenticatedPaginatedQuery: (query: string) => {
    const answer = mocks.paginated[query]
    // Comme `usePaginatedQuery` de Convex : une lecture en panne LÈVE au rendu.
    if (answer instanceof Error) throw answer
    return answer ?? exhausted()
  },
}))

vi.mock("convex/react", () => ({ useMutation: (reference: string) => mutation(reference) }))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("./PostCard", () => ({
  PostCard: ({ post }: { post: { _id: string } }) => <article data-post-id={post._id} />,
}))
vi.mock("./PostComposer", () => ({ PostComposer: () => <div data-testid="composeur" /> }))

vi.mock("@antsia/ui", () => ({
  Alert: ({ title, children }: { title: string; children: ReactNode }) => (
    <div role="alert">
      <strong>{title}</strong>
      {children}
    </div>
  ),
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Button: ({
    children,
    variant: _variant,
    size: _size,
    icon: _icon,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string
    size?: string
    icon?: string
  }) => <button {...props}>{children}</button>,
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Checkbox: ({ checked, onChange, label, id }: { checked?: boolean; onChange?: (next: boolean) => void; label?: ReactNode; id?: string }) => (
    <label>
      <input type="checkbox" id={id} checked={Boolean(checked)} onChange={(event) => onChange?.(event.target.checked)} />
      {label}
    </label>
  ),
  Radio: ({ checked, onChange, label, name, value, hint }: { checked?: boolean; onChange?: (next: boolean) => void; label?: ReactNode; name?: string; value?: string; hint?: ReactNode }) => (
    <label>
      <input type="radio" name={name} value={value} checked={Boolean(checked)} onChange={(event) => onChange?.(event.target.checked)} />
      {label}
      {hint}
    </label>
  ),
  SkeletonCard: () => <div data-testid="skeleton" />,
  TextArea: (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
  TextInput: ({ icon: _icon, ...props }: InputHTMLAttributes<HTMLInputElement> & { icon?: string }) => <input {...props} />,
  // La recherche du sélecteur de relations (`useRelationSearch`).
  useDebouncedValue: <T,>(value: T) => value,
}))

// Le kit d'espace (son propre point d'entrée) : l'état vide rend son texte, la pagination se tait.
vi.mock("@antsia/ui/espace-kit", () => ({
  EspaceEmptyState: ({ text, action }: { text: string; action?: ReactNode }) => (
    <div>
      <p>{text}</p>
      {action}
    </div>
  ),
  EspacePagination: () => null,
  clampPage: (page: number, total: number, size: number) => Math.min(Math.max(1, page), Math.max(1, Math.ceil(total / size))),
  pageSlice: <T,>(items: readonly T[], page: number, size: number) => items.slice((page - 1) * size, page * size),
}))

import { GroupsPanel } from "./GroupsPanel"

const i18n = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "reseau" })
const t = i18n.getFixedT("fr")
const EMPTY_MY_GROUPS_TEXT = t(EMPTY_MY_GROUPS_TEXT_KEY)
const EMPTY_DISCOVER_TEXT = t(EMPTY_DISCOVER_TEXT_KEY)

function group(groupId: string, name: string) {
  return {
    groupId,
    name,
    description: null,
    country: null,
    associationPage: null,
    memberCount: 3,
    state: "active",
    rulesVersion: null,
    myRole: "member",
    invited: false,
    createdAt: 1,
  }
}

/** Les rappels de navigation sont un CONTRAT : le volet n'ouvre plus rien seul. */
let onOpenGroup: (groupId: string) => void
let onBack: () => void

function monter(over: { groupId?: string | null } = {}) {
  renderWithEngine(<GroupsPanel groupId={over.groupId ?? null} now={1_000} onOpenGroup={onOpenGroup} onBack={onBack} />)
}

beforeEach(() => {
  mocks.queries = {}
  mocks.paginated = {}
  mocks.mutations = {}
  mocks.queryCalls = []
  onOpenGroup = vi.fn<(groupId: string) => void>()
  onBack = vi.fn<() => void>()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("GroupsPanel — l'annuaire (R-08)", () => {
  it("« Mes groupes » en panne : bandeau + Réessayer, JAMAIS « créez le vôtre »", () => {
    mocks.queries.myGroups = err()
    monter()

    expect(screen.queryByText(EMPTY_MY_GROUPS_TEXT)).toBeNull()
    expect(screen.queryByText(/créez le vôtre/)).toBeNull()
    const alert = screen.getByRole("alert")
    expect(alert.textContent).toContain("Mes groupes indisponibles")
    expect(screen.queryByTestId("skeleton")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
    expect(mocks.queries.myGroups?.refetch).toHaveBeenCalledTimes(1)
  })

  it("la découverte en panne : bandeau, jamais « Créez le premier »", () => {
    mocks.queries.discover = err()
    monter()

    expect(screen.queryByText(EMPTY_DISCOVER_TEXT)).toBeNull()
    expect(screen.getByRole("alert").textContent).toContain("Découverte indisponible")
  })

  it("une panne après données CONSERVE la liste sous le bandeau", () => {
    mocks.queries.myGroups = err({ items: [group("g1", "Archivistes du Trésor")], truncated: false })
    monter()

    expect(screen.getByText("Archivistes du Trésor")).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toContain("Mes groupes indisponibles")
    expect(screen.queryByText(EMPTY_MY_GROUPS_TEXT)).toBeNull()
  })

  it("les invitations en panne se disent", () => {
    // La frontière d'erreur journalise ce qu'elle attrape : le bruit n'est pas le sujet.
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.paginated.paginateMyInvites = new Error("panne")
    monter()
    expect(screen.getByRole("alert").textContent).toContain("Invitations indisponibles")
  })

  it("rend les vrais états vides quand tout a répondu « rien »", () => {
    monter()
    expect(screen.getByText(EMPTY_MY_GROUPS_TEXT)).toBeTruthy()
    expect(screen.getByText(EMPTY_DISCOVER_TEXT)).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("montre un squelette en vraie attente de « Mes groupes »", () => {
    mocks.queries.myGroups = {
      ...ok(undefined),
      isPending: true,
      isFetching: true,
      fetchStatus: "fetching",
    }
    monter()
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0)
    expect(screen.queryByText(EMPTY_MY_GROUPS_TEXT)).toBeNull()
  })

  it("la lecture BORNÉE de « Mes groupes » dit sa lacune", () => {
    mocks.queries.myGroups = ok({ items: [group("g1", "Archivistes du Trésor")], truncated: true })
    monter()
    expect(screen.getByText("Seuls vos groupes les plus actifs sont affichés.")).toBeTruthy()
  })

  it("chaque lecture et chaque geste portent le réseau courant", async () => {
    mocks.queries.discover = ok([{ ...group("g2", "Cartographes"), myRole: null }])
    monter()

    expect(mocks.queryCalls).toContainEqual(["myGroups", { networkId: TEST_NETWORK_ID }])
    expect(mocks.queryCalls).toContainEqual(["discover", { networkId: TEST_NETWORK_ID }])

    fireEvent.click(screen.getByRole("button", { name: "Rejoindre" }))
    await waitFor(() => expect(mocks.mutations.join).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, groupId: "g2" }))
    await waitFor(() => expect(onOpenGroup).toHaveBeenCalledWith("g2"))
  })

  it("une invitation reçue nomme qui invite, et l'accepter ouvre le groupe", async () => {
    mocks.paginated.paginateMyInvites = exhausted([
      {
        inviteId: "i1",
        groupId: "g3",
        groupName: "Botanistes",
        memberCount: 12,
        rulesVersion: null,
        invitedBy: { personId: "p1", displayName: "Awa Ndong", handle: "awa", avatarUrl: null },
        createdAt: 1,
      },
    ])
    monter()

    const alert = screen.getByRole("alert")
    expect(alert.textContent).toContain("1 invitation de groupe en attente")
    expect(alert.textContent).toContain("Awa Ndong vous invite à rejoindre « Botanistes » (12 membres).")
    fireEvent.click(screen.getByRole("button", { name: "Accepter" }))
    await waitFor(() => expect(mocks.mutations.respondInvite).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, inviteId: "i1", accept: true }))
    await waitFor(() => expect(onOpenGroup).toHaveBeenCalledWith("g3"))
  })
})

describe("GroupsPanel — la page d'un groupe (R-08)", () => {
  it("la fiche en panne n'est pas « plus accessible » : bandeau + Réessayer + retour", () => {
    mocks.queries.getGroup = err()
    monter({ groupId: "g1" })

    expect(screen.queryByText(/n'est plus accessible/)).toBeNull()
    expect(screen.getByRole("alert").textContent).toContain("Groupe indisponible")
    expect(screen.getByRole("button", { name: "Revenir aux groupes" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
    expect(mocks.queries.getGroup?.refetch).toHaveBeenCalledTimes(1)
  })

  it("le REFUS indistinct du moteur (`notFound`), lui, dit « plus accessible » — avec le retour", () => {
    mocks.queries.getGroup = err(undefined, new ConvexError({ code: "notFound" }))
    monter({ groupId: "g1" })

    expect(screen.getByText("Ce groupe n'est plus accessible.")).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Revenir aux groupes" }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it("le mur en panne se dit sans prétendre que le groupe est vide", () => {
    mocks.queries.getGroup = ok(FICHE_MEMBRE)
    mocks.queries.groupWall = err()
    monter({ groupId: "g1" })

    expect(screen.getByRole("alert").textContent).toContain("Publications indisponibles")
    expect(screen.queryByText(/Aucune publication dans ce groupe/)).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// R-13 — la page d'un groupe est un LIEU (ouverture adressable)
// ═══════════════════════════════════════════════════════════════

const FICHE_MEMBRE = {
  groupId: "g1",
  name: "Archivistes du Trésor",
  description: null,
  country: null,
  associationPage: null,
  memberCount: 3,
  state: "active",
  rulesVersion: null,
  myRole: "member",
  invited: false,
  createdAt: 1,
  pendingInviteId: null,
  pinned: null,
  rules: null,
  rulesUpdatedAt: null,
  myAcceptedRulesVersion: null,
  canManage: false,
}

describe("GroupsPanel — ouverture adressable (R-13)", () => {
  it("ouvrir une carte DEMANDE l'URL et ne bascule RIEN localement", () => {
    mocks.queries.myGroups = ok({ items: [group("g1", "Archivistes du Trésor")], truncated: false })
    monter()

    fireEvent.click(screen.getByRole("button", { name: "Ouvrir" }))
    expect(onOpenGroup).toHaveBeenCalledTimes(1)
    expect(onOpenGroup).toHaveBeenCalledWith("g1")
    // L'annuaire est TOUJOURS là : c'est l'URL qui décide, pas un état interne.
    expect(screen.getByRole("button", { name: "Ouvrir" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Revenir aux groupes" })).toBeNull()
  })

  it("la page du groupe vient du prop `groupId` — le retour REND la main", () => {
    mocks.queries.getGroup = ok(FICHE_MEMBRE)
    monter({ groupId: "g1" })

    expect(screen.getByText("Archivistes du Trésor")).toBeTruthy()
    expect(mocks.queryCalls).toContainEqual(["getGroup", { networkId: TEST_NETWORK_ID, groupId: "g1" }])
    fireEvent.click(screen.getByRole("button", { name: "Revenir aux groupes" }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

describe("GroupsPanel — invitation par le sélecteur de relations (R-13)", () => {
  it("le champ « @identifiant » a disparu au profit du sélecteur", () => {
    mocks.queries.getGroup = ok(FICHE_MEMBRE)
    monter({ groupId: "g1" })

    expect(screen.queryByLabelText("Identifiant public de la personne à inviter")).toBeNull()
    expect(screen.getByRole("button", { name: /Inviter des relations/ })).toBeTruthy()
  })

  it("le sélecteur nomme le statut de chaque relation", () => {
    mocks.queries.getGroup = ok(FICHE_MEMBRE)
    mocks.queries.listInviteCandidates = ok({
      items: [
        { personId: "p-alice", handle: "alice", displayName: "Alice Ndong", headline: null, avatarUrl: null, status: "eligible" },
        { personId: "p-bob", handle: "bob", displayName: "Bob Mba", headline: null, avatarUrl: null, status: "member" },
        { personId: "p-carla", handle: "carla", displayName: "Carla Obame", headline: null, avatarUrl: null, status: "invited" },
      ],
      truncated: false,
    })
    monter({ groupId: "g1" })

    fireEvent.click(screen.getByRole("button", { name: /Inviter des relations/ }))
    expect(screen.getByRole("checkbox", { name: /Alice Ndong/ })).toBeTruthy()
    expect(screen.getByText("Déjà membre")).toBeTruthy()
    expect(screen.getByText("Invitation en attente")).toBeTruthy()
  })

  it("le vivier en panne se DIT — jamais « aucune relation »", () => {
    mocks.queries.getGroup = ok(FICHE_MEMBRE)
    mocks.queries.listInviteCandidates = err()
    monter({ groupId: "g1" })

    fireEvent.click(screen.getByRole("button", { name: /Inviter des relations/ }))
    const alertes = screen.getAllByRole("alert").map((row) => row.textContent ?? "")
    expect(alertes.some((texte) => texte.includes("Relations indisponibles"))).toBe(true)
  })

  it("inviter envoie UNE demande par personne cochée, dans le réseau courant", async () => {
    mocks.queries.getGroup = ok(FICHE_MEMBRE)
    mocks.queries.listInviteCandidates = ok({
      items: [{ personId: "p-alice", handle: "alice", displayName: "Alice Ndong", headline: null, avatarUrl: null, status: "eligible" }],
      truncated: false,
    })
    mutation("invite").mockResolvedValue({ invited: true, alreadyInvited: false })
    monter({ groupId: "g1" })

    fireEvent.click(screen.getByRole("button", { name: /Inviter des relations/ }))
    expect(mocks.queryCalls).toContainEqual(["listInviteCandidates", { networkId: TEST_NETWORK_ID, groupId: "g1" }])
    fireEvent.click(screen.getByRole("checkbox", { name: /Alice Ndong/ }))
    fireEvent.click(screen.getByRole("button", { name: /Inviter 1 personne/ }))
    await waitFor(() => expect(mocks.mutations.invite).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, groupId: "g1", handle: "alice" }))
    expect(mocks.mutations.invite).toHaveBeenCalledTimes(1)
  })
})

// ═══════════════════════════════════════════════════════════════
// PG-02 — règles, état du groupe, « Gérer le groupe »
// ═══════════════════════════════════════════════════════════════

const RULES = "Restez courtois.\nPas de publicité."
const FICHE_A_REGLES = { ...FICHE_MEMBRE, myRole: null, rulesVersion: 2, rules: RULES, rulesUpdatedAt: 1_700_000_000_000 }
const FICHE_PROPRIETAIRE = { ...FICHE_MEMBRE, myRole: "owner", canManage: true }

function openManage() {
  fireEvent.click(screen.getByRole("button", { name: "Gérer le groupe" }))
}

describe("GroupsPanel — les règles avant d'entrer (PG-02)", () => {
  it("un non-membre LIT les règles, coche, puis seulement rejoint — avec la version lue", async () => {
    mocks.queries.getGroup = ok(FICHE_A_REGLES)
    monter({ groupId: "g1" })

    expect(screen.getByText("Règles du groupe")).toBeTruthy()
    expect(screen.getByText((_, node) => node?.tagName === "P" && node.textContent === RULES)).toBeTruthy()
    const rejoindre = screen.getByRole("button", { name: "Rejoindre" }) as HTMLButtonElement
    expect(rejoindre.disabled).toBe(true)
    expect(screen.getByText("Cochez la case pour pouvoir rejoindre le groupe.")).toBeTruthy()

    fireEvent.click(screen.getByRole("checkbox", { name: /J'ai lu les règles de ce groupe/ }))
    expect(rejoindre.disabled).toBe(false)
    fireEvent.click(rejoindre)
    await waitFor(() => expect(mocks.mutations.join).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, groupId: "g1", acceptedRulesVersion: 2 }))
  })

  it("sans règles, « Rejoindre » reste un seul geste, sans argument nouveau", async () => {
    mocks.queries.getGroup = ok({ ...FICHE_MEMBRE, myRole: null })
    monter({ groupId: "g1" })

    expect(screen.queryByRole("checkbox")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Rejoindre" }))
    await waitFor(() => expect(mocks.mutations.join).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, groupId: "g1" }))
  })

  it("une invitation à un groupe à règles s'accepte sur sa fiche, règles cochées", async () => {
    mocks.queries.getGroup = ok({ ...FICHE_A_REGLES, pendingInviteId: "i9", invited: true })
    monter({ groupId: "g1" })

    const accepter = screen.getByRole("button", { name: "Accepter l'invitation" }) as HTMLButtonElement
    expect(accepter.disabled).toBe(true)
    fireEvent.click(screen.getByRole("checkbox", { name: /J'ai lu les règles de ce groupe/ }))
    fireEvent.click(accepter)
    await waitFor(() => expect(mocks.mutations.respondInvite).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, inviteId: "i9", accept: true, acceptedRulesVersion: 2 }))
  })

  it("dans l'annuaire, la carte d'un groupe à règles OUVRE sa fiche au lieu de rejoindre", () => {
    mocks.queries.discover = ok([{ ...group("g2", "Cartographes"), myRole: null, rulesVersion: 1 }])
    monter()

    fireEvent.click(screen.getByRole("button", { name: "Lire les règles" }))
    expect(onOpenGroup).toHaveBeenCalledWith("g2")
    expect(mocks.mutations.join).not.toHaveBeenCalled()
  })

  it("une invitation reçue pour un groupe à règles ouvre sa fiche, sans l'accepter d'office", () => {
    mocks.paginated.paginateMyInvites = exhausted([
      { inviteId: "i1", groupId: "g3", groupName: "Botanistes", memberCount: 12, rulesVersion: 1, invitedBy: { personId: "p1", displayName: "Awa Ndong", handle: "awa", avatarUrl: null }, createdAt: 1 },
    ])
    monter()

    fireEvent.click(screen.getByRole("button", { name: "Lire les règles" }))
    expect(onOpenGroup).toHaveBeenCalledWith("g3")
    expect(mocks.mutations.respondInvite).not.toHaveBeenCalled()
  })

  it("un membre voit les règles NOUVELLES et les accepte ; il reste membre entre-temps", async () => {
    mocks.queries.getGroup = ok({ ...FICHE_MEMBRE, rulesVersion: 3, rules: RULES, rulesUpdatedAt: 1_700_000_000_000, myAcceptedRulesVersion: 2 })
    monter({ groupId: "g1" })

    expect(screen.getByRole("alert").textContent).toContain("Les règles du groupe ont changé")
    expect(screen.getByTestId("composeur")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "J'ai lu les nouvelles règles" }))
    await waitFor(() => expect(mocks.mutations.acceptGroupRules).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, groupId: "g1", rulesVersion: 3 }))
  })
})

describe("GroupsPanel — un groupe fermé (PG-02)", () => {
  it("le bandeau le dit ; ni composeur, ni mur, ni adhésion, ni liste des membres", () => {
    mocks.queries.getGroup = ok({ ...FICHE_MEMBRE, myRole: null, state: "closed" })
    monter({ groupId: "g1" })

    expect(screen.getByText(/Ce groupe est fermé/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Rejoindre" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Voir les membres" })).toBeNull()
    expect(screen.queryByTestId("composeur")).toBeNull()
    expect(screen.queryByText("Rejoignez ce groupe pour lire et publier ses contributions.")).toBeNull()
    expect(mocks.queryCalls.some(([query]) => query === "groupWall")).toBe(false)
  })
})

describe("GroupsPanel — « Gérer le groupe » (PG-02)", () => {
  it("réservé au propriétaire : un modérateur ne voit aucun des gestes", () => {
    mocks.queries.getGroup = ok({ ...FICHE_MEMBRE, myRole: "moderator", canManage: false })
    monter({ groupId: "g1" })

    expect(screen.queryByRole("button", { name: "Gérer le groupe" })).toBeNull()
    expect(screen.queryByText("Transmettre la propriété")).toBeNull()
    expect(screen.queryByText("Supprimer définitivement")).toBeNull()
  })

  it("les quatre gestes sont atteignables depuis la fiche du propriétaire", () => {
    mocks.queries.getGroup = ok(FICHE_PROPRIETAIRE)
    monter({ groupId: "g1" })

    openManage()
    for (const title of ["Règles du groupe", "Transmettre la propriété", "Fermer le groupe", "Archiver le groupe", "Supprimer le groupe"]) {
      expect(screen.getAllByRole("heading", { name: title }).length).toBeGreaterThan(0)
    }
    expect(mocks.queryCalls).toContainEqual(["listTransferCandidates", { networkId: TEST_NETWORK_ID, groupId: "g1" }])
  })

  it("les règles s'enregistrent sans les blancs de bord", async () => {
    mocks.queries.getGroup = ok(FICHE_PROPRIETAIRE)
    mutation("setGroupRules").mockResolvedValue({ rulesVersion: 1, changed: true })
    monter({ groupId: "g1" })

    openManage()
    expect(screen.getByText("Aucune règle pour l'instant : l'adhésion est libre.")).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Texte des règles"), { target: { value: "  Restez courtois.  " } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les règles" }))
    await waitFor(() => expect(mocks.mutations.setGroupRules).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, groupId: "g1", rules: "Restez courtois." }))
  })

  it("fermer se confirme en deux temps", async () => {
    mocks.queries.getGroup = ok(FICHE_PROPRIETAIRE)
    monter({ groupId: "g1" })

    openManage()
    fireEvent.click(screen.getByRole("button", { name: "Fermer le groupe" }))
    expect(mocks.mutations.closeGroup).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la fermeture" }))
    await waitFor(() => expect(mocks.mutations.closeGroup).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, groupId: "g1" }))
  })

  it("transmettre : choisir un modérateur, confirmer, et seulement alors transférer", async () => {
    mocks.queries.getGroup = ok(FICHE_PROPRIETAIRE)
    mocks.queries.listTransferCandidates = ok({ items: [{ personId: "p-bob", handle: "bob", displayName: "Bob Mba", avatarUrl: null }], truncated: false })
    monter({ groupId: "g1" })

    openManage()
    const transmettre = screen.getByRole("button", { name: "Transmettre la propriété" }) as HTMLButtonElement
    expect(transmettre.disabled).toBe(true)
    fireEvent.click(screen.getByRole("radio", { name: /Bob Mba/ }))
    await waitFor(() => expect(transmettre.disabled).toBe(false))
    fireEvent.click(transmettre)
    await waitFor(() => expect(screen.getByText(/Transmettre la propriété de « Archivistes du Trésor » à Bob Mba/)).toBeTruthy())
    expect(mocks.mutations.transferGroupOwnership).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Confirmer le transfert" }))
    await waitFor(() => expect(mocks.mutations.transferGroupOwnership).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, groupId: "g1", newOwnerPersonId: "p-bob" }))
  })

  it("sans modérateur éligible, l'écran dit comment en nommer un ; une panne de la liste se dit", () => {
    mocks.queries.getGroup = ok(FICHE_PROPRIETAIRE)
    mocks.queries.listTransferCandidates = err()
    monter({ groupId: "g1" })

    openManage()
    expect(screen.getAllByRole("alert").some((node) => (node.textContent ?? "").includes("Modérateurs indisponibles"))).toBe(true)
    expect(screen.queryByText(/Aucun modérateur ne peut recevoir la propriété/)).toBeNull()
  })

  it("supprimer exige le NOM du groupe, puis rend la main à l'annuaire", async () => {
    mocks.queries.getGroup = ok(FICHE_PROPRIETAIRE)
    mutation("deleteGroup").mockResolvedValue({ deleted: true, pending: false })
    monter({ groupId: "g1" })

    openManage()
    const supprimer = screen.getByRole("button", { name: "Supprimer définitivement" }) as HTMLButtonElement
    expect(supprimer.disabled).toBe(true)
    const champ = screen.getByLabelText("Saisissez le nom du groupe pour confirmer : Archivistes du Trésor")
    fireEvent.change(champ, { target: { value: "Archivistes" } })
    expect(screen.getByText("Le nom saisi ne correspond pas au nom du groupe.")).toBeTruthy()
    expect(supprimer.disabled).toBe(true)
    fireEvent.change(champ, { target: { value: "Archivistes du Trésor" } })
    await waitFor(() => expect(supprimer.disabled).toBe(false))
    fireEvent.click(supprimer)
    await waitFor(() => expect(mocks.mutations.deleteGroup).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, groupId: "g1" }))
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1))
  })

  it("un groupe fermé ne garde que l'archivage et la suppression", () => {
    mocks.queries.getGroup = ok({ ...FICHE_PROPRIETAIRE, state: "closed" })
    monter({ groupId: "g1" })

    openManage()
    expect(screen.getByText(/ses règles et ses rôles sont figés/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Enregistrer les règles" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Fermer le groupe" })).toBeNull()
    expect(screen.getByRole("button", { name: "Archiver le groupe" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Supprimer définitivement" })).toBeTruthy()
    expect(mocks.queryCalls.some(([query]) => query === "listTransferCandidates")).toBe(false)
  })
})

describe("GroupsPanel — signaler la fiche et les règles (MC-01)", () => {
  it("un membre voit « Signaler », en dernier geste de la fiche", () => {
    mocks.queries.getGroup = ok(FICHE_MEMBRE)
    monter({ groupId: "g1" })
    const signaler = screen.getByRole("button", { name: "Signaler" })
    expect(signaler.parentElement?.lastElementChild).toBe(signaler)
  })

  it("le propriétaire ne signale jamais son propre groupe", () => {
    mocks.queries.getGroup = ok(FICHE_PROPRIETAIRE)
    monter({ groupId: "g1" })
    expect(screen.queryByRole("button", { name: "Signaler" })).toBeNull()
  })
})
