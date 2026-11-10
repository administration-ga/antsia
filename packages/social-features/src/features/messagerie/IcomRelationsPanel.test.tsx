// Dupliqué de socle/packages/agent-features/src/features/messagerie/IcomRelationsPanel.test.tsx @ ad2e7fdc2 — adaptations : fonctions du moteur moquées (`calls.direct.callMember`, `groups.threads.paginateMyGroupThreads` en page, `calls.presence.*`) ; portée poste retirée (plus de `useOptionalOrg` à moquer) ; relations au DTO du graphe (`otherPersonId`, badges calculés) ; rendu dans l'enveloppe du moteur (`renderWithEngine` : i18n français, réseau de test) ; le refus « d'affiliation » du socle (règle administrative absente du moteur) devient un refus à CODE du moteur, dit par sa phrase traduite ; l'appel vise la PERSONNE (`target: { personId }`) ; « iRéseau » devient « le réseau » ; cas neufs : nom nul d'une relation rendu par le libellé neutre, appel admis qui ouvre la fenêtre sortante sur la personne. ; IM-01 (IC-04) : sans appels déclarés, ni appel sur une relation ni vue « Nouvel appel ».
// @vitest-environment jsdom

import { act, cleanup, fireEvent, screen } from "@testing-library/react"
import { ConvexError } from "convex/values"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderWithEngine, TEST_NETWORK_ID } from "../../tests/engine-wrapper"

const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  toastError: vi.fn(),
  openOutgoingCall: vi.fn(),
  openRefusedCall: vi.fn(),
  convex: { query: vi.fn(async () => ({ offline: [] })) },
  /**
   * La présence des relations : une référence STABLE, comme celle que rend
   * TanStack. La pastille partagée recopie `data` dans un état à chaque
   * changement de référence — un objet neuf à chaque rendu bouclerait.
   */
  presence: { data: { statuses: {} }, isLoading: false, isError: false },
  groups: {
    data: undefined as { page: Array<Record<string, unknown>>; isDone: boolean; continueCursor: string } | undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  query: vi.fn(),
  relations: {
    items: [] as Array<Record<string, unknown>>,
    isLoading: false,
    isError: false,
    retry: vi.fn(),
    hasMore: false,
    isLoadingMore: false,
    loadMore: vi.fn(),
  },
  /** Le terme que la vue confie à la recherche serveur, à chaque rendu. */
  searchTerm: vi.fn(),
  search: {
    items: [] as Array<Record<string, unknown>>,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    enabled: false,
    eligible: false,
    settled: false,
    term: "",
  },
}))

vi.mock("@antsia/api/engine", () => ({
  api: {
    modules: {
      calls: {
        presence: { forMyConnections: "presence", offlineHints: "hints" },
        direct: { callMember: "call" },
      },
      groups: { threads: { paginateMyGroupThreads: "groups" } },
    },
  },
}))

vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: (query: string, args: unknown) => {
    mocks.query(query, args)
    return query === "groups" ? mocks.groups : mocks.presence
  },
}))

vi.mock("convex/react", () => ({
  useMutation: () => mocks.call,
  // `useConnectionsPresence` (pastille partagée) va chercher les constats
  // « hors ligne » en one-shot : un client inerte suffit au rendu.
  useConvex: () => mocks.convex,
}))
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }))
vi.mock("../../stores/call-store", () => ({
  useCallStore: () => ({
    openOutgoingCall: mocks.openOutgoingCall,
    openRefusedCall: mocks.openRefusedCall,
  }),
}))
vi.mock("../../components/identity", () => ({
  PostIdentityLines: ({ name }: { name: ReactNode }) => <span>{name}</span>,
}))
vi.mock("../reseau-personnel/Avatar", () => ({ Avatar: () => <span /> }))
vi.mock("../../shell/ReseauQueryError", () => ({
  ReseauQueryError: ({ title }: { title: string }) => <p>{title}</p>,
}))
vi.mock("../reseau-personnel/use-dual-connection-pagination", () => ({
  usePersonalConnections: () => mocks.relations,
}))
vi.mock("../reseau-personnel/use-relation-search", () => ({
  useRelationSearch: (query: string) => {
    mocks.searchTerm(query)
    return mocks.search
  },
}))
vi.mock("./IcomBrickHeader", () => ({
  IcomBrickHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
}))

import { IcomRelationsPanel } from "./IcomRelationsPanel"

/** Une relation, telle que le graphe du réseau la rend (`ConnectionPersonDto`). */
function relation(id: string, handle: string | null, displayName: string | null) {
  return {
    connectionId: `relation-${id}`,
    otherPersonId: `person-${id}`,
    handle,
    displayName,
    avatarUrl: null,
    headline: null,
    badges: [],
    at: 0,
  }
}

const ZOE = relation("26", "zoe.rel26", "Zoé Famille26")
const ALINE = relation("1", "aline.minko", "Aline Minko")

beforeEach(() => {
  mocks.call.mockReset()
  mocks.toastError.mockReset()
  mocks.openOutgoingCall.mockReset()
  mocks.openRefusedCall.mockReset()
  mocks.groups.data = { page: [], isDone: true, continueCursor: "" }
  mocks.groups.isLoading = false
  mocks.groups.isError = false
  mocks.groups.refetch.mockReset()
  mocks.query.mockReset()
  mocks.relations.items = []
  mocks.relations.hasMore = false
  mocks.searchTerm.mockReset()
  mocks.search = {
    items: [],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    enabled: false,
    eligible: false,
    settled: false,
    term: "",
  }
})

afterEach(cleanup)

describe("IcomRelationsPanel — refus du serveur", () => {
  it.each(["audio", "video"] as const)(
    "affiche le refus serveur après un clic %s et réarme le bouton",
    async (mediaType) => {
      // Le moteur refuse par un CODE (jamais une phrase) : l'écran le traduit.
      const error = new ConvexError({ code: "statusInsufficient" })
      error.message = "Server Error"
      let rejectCall!: (reason: unknown) => void
      mocks.call.mockImplementation(() => new Promise((_, reject) => {
        rejectCall = reject
      }))
      mocks.relations.items = [ZOE]
      renderWithEngine(
        <IcomRelationsPanel
          mode="appel"
          variant="page"
          onOpenDraft={vi.fn()}
          onOpenGroup={vi.fn()}
          onCreateGroup={vi.fn()}
        />,
      )

      const button = screen.getByRole<HTMLButtonElement>("button", {
        name: mediaType === "video" ? "Appeler Zoé Famille26 en vidéo" : "Appeler Zoé Famille26",
      })
      fireEvent.click(button)
      expect(mocks.call).toHaveBeenCalledWith({
        networkId: TEST_NETWORK_ID,
        target: { personId: ZOE.otherPersonId },
        mediaType,
      })
      expect(button.disabled).toBe(true)

      await act(async () => { rejectCall(error) })

      expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith(
        "Votre adhésion ne permet pas encore cette action.",
        { duration: 8000 },
      )
      expect(mocks.openOutgoingCall).not.toHaveBeenCalled()
      expect(mocks.openRefusedCall).not.toHaveBeenCalled()
      expect(button.disabled).toBe(false)
    },
  )
})

describe("IcomRelationsPanel — chercher parmi TOUTES mes relations (IC-05)", () => {
  it("iAppel → Nouvel appel expose un champ de recherche raccordé au serveur", () => {
    mocks.relations.items = [ALINE]
    mocks.relations.hasMore = true
    const props = {
      mode: "appel" as const,
      variant: "page" as const,
      // Le journal réel pose les contrôles « Journal / Nouvel appel » lui-même.
      journal: (viewControls: ReactNode) => (
        <div>
          {viewControls}
          <p>Journal des appels</p>
        </div>
      ),
      onOpenDraft: vi.fn(),
      onOpenGroup: vi.fn(),
      onCreateGroup: vi.fn(),
    }
    const { rerender } = renderWithEngine(<IcomRelationsPanel {...props} />)

    // Le journal d'abord — sans champ : on ne cherche pas dans un historique.
    expect(screen.queryByRole("searchbox")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Nouvel appel" }))

    const champ = screen.getByRole("searchbox", {
      name: "Chercher une relation à appeler",
    })
    // Toute la pastille est une cible de 44 px : un <label> autour du champ.
    const pastille = champ.closest("label")
    expect(pastille?.className).toBe("msg-search-row")
    expect(pastille?.style.minHeight).toBe("44px")

    fireEvent.change(champ, { target: { value: "Zoé" } })
    expect(mocks.searchTerm).toHaveBeenLastCalledWith("Zoé")

    // Pendant la pause de frappe : une attente, jamais « aucune » — et la
    // relation déjà chargée ne répond pas à « Zoé ».
    mocks.search = { ...mocks.search, eligible: true, settled: false }
    rerender(<IcomRelationsPanel {...props} />)
    expect(screen.getByRole("status").textContent).toContain("Recherche parmi vos relations")
    expect(screen.queryByText(/Aucune relation/)).toBeNull()

    // Le serveur répond : la 26e relation, absente de la page chargée, est là,
    // avec ses trois gestes.
    mocks.search = { ...mocks.search, eligible: true, settled: true, items: [ZOE] }
    rerender(<IcomRelationsPanel {...props} />)
    const actions = screen.getByRole("group", { name: "Actions pour Zoé Famille26" })
    expect(actions.querySelectorAll("button")).toHaveLength(3)
    expect(screen.getByRole("button", { name: "Appeler Zoé Famille26" })).toBeTruthy()
    expect(screen.queryByText("Aline Minko")).toBeNull()
    // Sous une réponse serveur exhaustive, plus rien à « voir en plus ».
    expect(screen.queryByRole("button", { name: "Voir plus de relations" })).toBeNull()
  })

  it("en mode contact, le vide n'est dit qu'après le serveur, et une panne se voit", () => {
    mocks.relations.items = [ALINE]
    mocks.relations.hasMore = true
    const props = {
      mode: "contact" as const,
      variant: "page" as const,
      onOpenDraft: vi.fn(),
      onOpenGroup: vi.fn(),
      onCreateGroup: vi.fn(),
    }
    const { rerender } = renderWithEngine(<IcomRelationsPanel {...props} />)
    const champ = screen.getByRole("searchbox", { name: "Chercher une relation" })

    // Un seul caractère : sous le seuil, aucun résultat local — le bouton de
    // suite reste atteignable, et rien n'est déclaré inexistant.
    fireEvent.change(champ, { target: { value: "z" } })
    expect(screen.getByText(/Aucune relation déjà chargée ne correspond/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Voir plus de relations" }))
    expect(mocks.relations.loadMore).toHaveBeenCalledOnce()

    // Réponse serveur vide : là seulement, « aucune relation ne correspond ».
    fireEvent.change(champ, { target: { value: "Personne" } })
    mocks.search = { ...mocks.search, eligible: true, settled: true, items: [] }
    rerender(<IcomRelationsPanel {...props} />)
    expect(screen.getByText("Aucune relation ne correspond à « Personne ».")).toBeTruthy()

    // Une panne n'est pas une absence.
    mocks.search = { ...mocks.search, eligible: true, settled: false, isError: true }
    rerender(<IcomRelationsPanel {...props} />)
    expect(screen.getByText("Recherche indisponible")).toBeTruthy()
    expect(screen.queryByText(/Aucune relation ne correspond/)).toBeNull()
  })
})

describe("IcomRelationsPanel — séparation Relations / Groupes", () => {
  it("garde Relations par défaut puis ouvre un groupe et son composeur", () => {
    mocks.groups.data = {
      page: [
        {
          threadId: "groupe-42",
          title: "Comité budget",
          avatarUrl: null,
          memberCount: 4,
          lastMessageText: "Point budget",
          lastMessageByMe: true,
          unreadCount: 3,
          unreadCapped: false,
        },
      ],
      isDone: true,
      continueCursor: "",
    }
    const onOpenGroup = vi.fn()
    const onCreateGroup = vi.fn()

    renderWithEngine(
      <IcomRelationsPanel
        mode="contact"
        variant="page"
        onOpenDraft={vi.fn()}
        onOpenGroup={onOpenGroup}
        onCreateGroup={onCreateGroup}
      />,
    )

    const selector = screen.getByRole("group", {
      name: "Afficher les relations ou les groupes",
    })
    const relations = screen.getByRole("button", { name: "Relations" })
    const groupes = screen.getByRole("button", { name: "Groupes" })
    expect(selector).toBeTruthy()
    expect(relations.getAttribute("aria-pressed")).toBe("true")
    expect(groupes.getAttribute("aria-pressed")).toBe("false")

    fireEvent.click(groupes)

    expect(groupes.getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByText("Comité budget")).toBeTruthy()
    expect(screen.getByText(/4 membres · Vous : Point budget/)).toBeTruthy()
    expect(screen.getByText("3 messages non lus dans ce groupe")).toBeTruthy()

    fireEvent.click(screen.getByText("Comité budget").closest("button")!)
    fireEvent.click(screen.getByRole("button", { name: "Nouveau groupe" }))
    expect(onOpenGroup).toHaveBeenCalledWith("groupe-42")
    expect(onCreateGroup).toHaveBeenCalledOnce()
  })

  it("rend les états de chargement et vide des groupes", () => {
    mocks.groups.data = undefined
    mocks.groups.isLoading = true
    const props = {
      mode: "contact" as const,
      variant: "page" as const,
      onOpenDraft: vi.fn(),
      onOpenGroup: vi.fn(),
      onCreateGroup: vi.fn(),
    }
    const { rerender } = renderWithEngine(<IcomRelationsPanel {...props} />)

    fireEvent.click(screen.getByRole("button", { name: "Groupes" }))
    expect(screen.getByText("Chargement de vos groupes…")).toBeTruthy()

    mocks.groups.data = { page: [], isDone: true, continueCursor: "" }
    mocks.groups.isLoading = false
    rerender(<IcomRelationsPanel {...props} />)
    expect(
      screen.getByText("Vous n'avez encore aucune conversation de groupe."),
    ).toBeTruthy()
  })

  it("regroupe écrire, vidéo et audio dans un seul bloc d'icônes", () => {
    mocks.relations.items = [ALINE]
    const onOpenDraft = vi.fn()

    renderWithEngine(
      <IcomRelationsPanel
        mode="contact"
        variant="page"
        onOpenDraft={onOpenDraft}
        onOpenGroup={vi.fn()}
        onCreateGroup={vi.fn()}
      />,
    )

    const actions = screen.getByRole("group", {
      name: "Actions pour Aline Minko",
    })
    const ecrire = screen.getByRole("button", { name: "Écrire à Aline Minko" })
    const video = screen.getByRole("button", {
      name: "Appeler Aline Minko en vidéo",
    })
    const audio = screen.getByRole("button", { name: "Appeler Aline Minko" })

    expect(actions.querySelectorAll("button")).toHaveLength(3)
    expect(ecrire.getAttribute("data-primary")).toBe("true")
    expect(video.textContent).toBe("")
    expect(audio.textContent).toBe("")

    fireEvent.click(ecrire)
    expect(onOpenDraft).toHaveBeenCalledWith("aline.minko")
  })

  it("ne modifie pas le mode appel et ne charge pas les groupes", () => {
    renderWithEngine(
      <IcomRelationsPanel
        mode="appel"
        variant="page"
        journal={(viewControls) => (
          <div role="group" aria-label="Filtres du journal">
            {viewControls}
            <button type="button">Tous</button>
            <button type="button">Manqués</button>
            <p>Journal des appels</p>
          </div>
        )}
        onOpenDraft={vi.fn()}
        onOpenGroup={vi.fn()}
        onCreateGroup={vi.fn()}
      />,
    )

    expect(
      screen.queryByRole("group", {
        name: "Afficher les relations ou les groupes",
      }),
    ).toBeNull()
    expect(screen.getByText("Journal des appels")).toBeTruthy()
    const filters = screen.getByRole("group", { name: "Filtres du journal" })
    for (const label of ["Journal", "Nouvel appel", "Tous", "Manqués"]) {
      expect(filters.contains(screen.getByRole("button", { name: label }))).toBe(true)
    }
    expect(mocks.query).toHaveBeenCalledWith("groups", "skip")
  })
})

describe("IcomRelationsPanel — le moteur nomme et appelle la PERSONNE", () => {
  it("une relation sans nom à montrer prend le libellé neutre, jamais une ligne vide", () => {
    mocks.relations.items = [relation("9", "sans.nom", null)]
    renderWithEngine(
      <IcomRelationsPanel
        mode="contact"
        variant="page"
        onOpenDraft={vi.fn()}
        onOpenGroup={vi.fn()}
        onCreateGroup={vi.fn()}
      />,
    )
    expect(screen.getByRole("button", { name: "Écrire à Personne du réseau" })).toBeTruthy()
  })

  it("un appel admis ouvre la fenêtre sortante, sur l'appel et la personne appelée", async () => {
    mocks.relations.items = [ALINE]
    mocks.call.mockResolvedValue({ admitted: true, callId: "calls_1", roomName: "call-1", mediaType: "audio" })
    renderWithEngine(
      <IcomRelationsPanel
        mode="contact"
        variant="page"
        onOpenDraft={vi.fn()}
        onOpenGroup={vi.fn()}
        onCreateGroup={vi.fn()}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Appeler Aline Minko" }))
    })

    expect(mocks.openOutgoingCall).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        meetingId: "calls_1",
        participantUserId: ALINE.otherPersonId,
        mediaType: "audio",
        callee: { userId: ALINE.otherPersonId, name: "Aline Minko", avatarUrl: null, handle: "aline.minko" },
      }),
    )
    expect(mocks.openRefusedCall).not.toHaveBeenCalled()
  })
})

describe("IcomRelationsPanel — application sans appels déclarés (IM-01)", () => {
  it("une relation garde « Écrire », sans appel audio ni vidéo ; le journal ne propose plus « Nouvel appel »", () => {
    mocks.relations.items = [ZOE]
    const journal = vi.fn((controls: unknown) => <div data-testid="journal">{controls as never}</div>)
    renderWithEngine(
      <IcomRelationsPanel mode="contact" variant="page" onOpenDraft={vi.fn()} onOpenGroup={vi.fn()} onCreateGroup={vi.fn()} />,
      { callsAvailable: false },
    )
    expect(screen.getByRole("button", { name: "Écrire à Zoé Famille26" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Appeler Zoé Famille26" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Appeler Zoé Famille26 en vidéo" })).toBeNull()
    cleanup()
    renderWithEngine(
      <IcomRelationsPanel mode="appel" variant="page" journal={journal} onOpenDraft={vi.fn()} onOpenGroup={vi.fn()} onCreateGroup={vi.fn()} />,
      { callsAvailable: false },
    )
    expect(screen.getByTestId("journal")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Nouvel appel" })).toBeNull()
    expect(journal).toHaveBeenLastCalledWith(null)
  })
})
