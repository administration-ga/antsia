// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/ProfilPersonnePage.test.tsx @ ad2e7fdc2 — adaptations : rendu dans l'enveloppe du moteur (`renderWithEngine` : i18n française, réseau et adresses de test, routeur en mémoire dont on relit l'adresse et les navigations) ; fonctions du moteur moquées (`people.profile.getPublicProfile` au DTO du moteur — `personId`, `avatar`/`cover` servis par la garde, `isMe` —, `posts.posts.personPosts` clé `_id`, `graph.connections.*`, `graph.follows.*`, `calls.direct.callMember`) ; « c'est moi » lu dans `isMe` au lieu de `getMyProfile` ; résumé iProfil retiré (cas « Mon iProfil professionnel » sans objet) ; aperçu « vu par les membres du réseau » qui ramène à MA fiche (adresse des routes de test) ; kit d'espace simulé à part (`@antsia/ui/espace-kit`, témoin ARIA fidèle du tablist) ; albums simulés par le barrel de leur tranche (constantes d'adresse réelles du modèle pur) ; cas neufs : invitation reçue acceptée sur la fiche, demande et suivi par personne et réseau, refus du moteur dit par son code, « Écrire » (brouillon iCom, adresse de messagerie au téléphone) et « Appeler » (fenêtre sortante, écran de refus) réservés aux relations, publication épinglée en tête du mur et « Désépingler » sur ma fiche, gestion de mon profil ouverte par « Modifier mon profil » ou `?gerer=1` (jamais en aperçu), mon profil retiré qui ramène à sa gestion au lieu du refus.
// @vitest-environment jsdom

/**
 * ProfilPersonnePage — une panne n'est ni un squelette éternel ni un profil
 * « pas accessible » (R-08) :
 *
 *  1. le profil en panne : carte « Profil indisponible » + Réessayer, aucun
 *     squelette, et surtout pas la phrase du refus (qui affirmerait le faux) ;
 *  2. le mur en panne se dit sans vider le mur ni prétendre « rien publié » ;
 *  3. une panne après données conserve les publications.
 *
 * Étendu (R-10, R-11) : la couverture publiée s'affiche et son absence ramène
 * le dégradé ; « Voir plus de publications » monte la page suivante ; une
 * panne SUR une page ne vide pas le mur déjà rendu.
 *
 * Étendu (R-09, X-07) : les trois onglets Publications / Photos / Albums,
 * l'ouverture du composeur par `?onglet=albums&nouveau=1`, et l'APERÇU
 * `?apercu=1` — bandeau, `isSelf` forcé à faux, sortie vers ma fiche, et rien
 * de ce paramètre envoyé au serveur.
 *
 * Étendu (moteur) : la relation se règle et se joint depuis la fiche, la
 * publication épinglée tient la tête du mur, et ma fiche porte la gestion de
 * mon profil.
 */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react"
import type { ButtonHTMLAttributes, ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { memoryRouter, renderWithEngine, TEST_NETWORK_ID, TEST_ROUTES } from "../../tests/engine-wrapper"
import { reseauAgentHref } from "../../shell/reseau-agent-nav"
import { refusalEndKind } from "../iappel/call-phase"
import { draftKey } from "../messagerie/messagerie-dock"
import { conversationHref } from "../messagerie/messagerie-routes"

type QueryMock = {
  data: unknown
  isPending: boolean
  isFetching: boolean
  isError: boolean
  fetchStatus: "idle" | "fetching" | "paused"
  refetch: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => {
  const mutations: Record<string, ReturnType<typeof vi.fn>> = {}
  return {
    queries: {} as Record<string, QueryMock>,
    /** Tout ce qui a été DEMANDÉ au serveur — l'aperçu ne doit rien y ajouter. */
    args: [] as unknown[],
    mutations,
    /** Une mutation par référence, créée à la demande et remise à zéro entre deux cas. */
    mutation: (reference: string) =>
      (mutations[reference] ??= vi.fn(async () => undefined)),
    mobile: false as boolean | null,
    openDraft: vi.fn(),
    openOutgoingCall: vi.fn(),
    openRefusedCall: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
  }
})

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
      people: {
        profile: { getPublicProfile: "getPublicProfile" },
        persons: { getMyPerson: "getMyPerson" },
      },
      posts: { posts: { personPosts: "personPosts", unpinMyWall: "unpinMyWall" } },
      graph: {
        connections: {
          connectionWith: "connectionWith",
          requestConnection: "requestConnection",
          respondToConnection: "respondToConnection",
        },
        follows: { isFollowing: "isFollowing", follow: "follow", unfollow: "unfollow" },
      },
      calls: { direct: { callMember: "callMember" } },
    },
  },
}))

/**
 * Le mock est ARGS-AWARE : chaque page du mur porte son curseur, donc deux
 * pages montées sont deux appels de la MÊME query. Sans cette clé composée,
 * elles rendraient la même chose et « Voir plus » ne prouverait rien.
 */
function cleDeQuery(query: string, args: unknown): string {
  if (args === null || typeof args !== "object") return query
  const cursor = (args as { cursor?: { publishedAt: number; postId: string } })
    .cursor
  return cursor === undefined
    ? query
    : `${query}@${cursor.publishedAt}:${cursor.postId}`
}

vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: (query: string, args: unknown) => {
    mocks.args.push(args)
    if (args === "skip") return { ...ok(undefined), isPending: true }
    // Pas de repli sur la clé nue quand un curseur est présent : ce serait
    // servir la PREMIÈRE page à la seconde, donc un doublon invisible.
    return mocks.queries[cleDeQuery(query, args)] ?? ok(null)
  },
}))

vi.mock("convex/react", () => ({
  useMutation: (reference: string) => mocks.mutation(reference),
}))
vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}))
vi.mock("@antsia/ui/overlay", () => ({
  useIsReseauMobile: () => mocks.mobile,
}))
vi.mock("../messagerie/dock-store", () => ({
  dockStore: { openDraft: mocks.openDraft },
}))
vi.mock("../../stores/call-store", () => ({
  useCallStore: () => ({
    openOutgoingCall: mocks.openOutgoingCall,
    openRefusedCall: mocks.openRefusedCall,
  }),
}))
vi.mock("../iappel/presence-dot", () => ({
  PresenceDot: () => null,
  useConnectionsPresence: () => ({ presenceOf: () => null }),
}))
/**
 * Les deux surfaces d'album sont remplacées par des témoins : ce fichier
 * prouve QUE le bon onglet les monte et avec quel `isSelf`, pas ce qu'elles
 * rendent — cela vit dans leurs propres tests (`AlbumsSection`,
 * `AlbumComposer`), avec les jeux de mocks qui leur conviennent. La page les
 * lit par le BARREL de leur tranche : c'est lui qu'on remplace, constantes
 * d'adresse réelles comprises (le modèle pur, sans appel au moteur).
 */
vi.mock("../reseau-albums", async () => {
  const model = await vi.importActual<typeof import("../reseau-albums/album-model")>(
    "../reseau-albums/album-model",
  )
  return {
    ALBUM_NEW_PARAM: model.ALBUM_NEW_PARAM,
    ALBUM_TAB_ID: model.ALBUM_TAB_ID,
    ALBUM_TAB_PARAM: model.ALBUM_TAB_PARAM,
    AlbumsSection: ({
      handle,
      isSelf,
      variant,
      onCreate,
    }: {
      handle: string
      isSelf: boolean
      variant?: string
      onCreate?: () => void
    }) => (
      <div data-testid="albums-section" data-variant={variant ?? "albums"}>
        albums-{handle}-{isSelf ? "moi" : "autrui"}
        {onCreate ? (
          <button type="button" onClick={onCreate}>
            Créer un album
          </button>
        ) : null}
      </div>
    ),
    AlbumComposer: ({ onCancel }: { onCancel?: () => void }) => (
      <div data-testid="album-composer">
        composeur
        <button type="button" onClick={onCancel}>
          Annuler
        </button>
      </div>
    ),
  }
})
vi.mock("./PostCard", () => ({
  PostCard: ({ post }: { post: { _id: string } }) => <div>post-{post._id}</div>,
}))
// La gestion de mon profil a son propre test : ici, on prouve QUAND elle se monte.
vi.mock("./ProfilReseauSection", () => ({
  ProfilReseauSection: () => <div data-testid="gestion-profil" />,
}))

vi.mock("@antsia/ui", () => ({
  Alert: ({ title, children }: { title: string; children: ReactNode }) => (
    <div role="alert">
      <strong>{title}</strong>
      {children}
    </div>
  ),
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  // Variante, taille et icône restent visibles en attributs de données : le
  // témoin ne les jette pas, il ne les dessine pas.
  Button: ({
    children,
    variant,
    size,
    icon,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string
    size?: string
    icon?: string
  }) => (
    <button data-variant={variant} data-size={size} data-icon={icon} {...props}>
      {children}
    </button>
  ),
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Icon: () => null,
  SkeletonCard: () => <div data-testid="skeleton" />,
}))

/**
 * Le kit d'espace a son propre point d'entrée (`@antsia/ui/espace-kit`) : il se
 * simule À PART. Le témoin du tablist tient le MÊME contrat ARIA (rôles,
 * sélection, liaison au panneau) — c'est ce que ce fichier vérifie de lui.
 */
vi.mock("@antsia/ui/espace-kit", () => ({
  EspaceKitStyles: () => null,
  EspaceDossierTabs: ({
    tabs,
    current,
    onChange,
    "aria-label": label,
    panelId,
    idPrefix,
  }: {
    tabs: readonly { id: string; label: string }[]
    current: string
    onChange: (id: string) => void
    "aria-label": string
    panelId: string
    idPrefix: string
  }) => (
    <div role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          id={idPrefix + tab.id}
          type="button"
          role="tab"
          aria-controls={panelId}
          aria-selected={tab.id === current}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  ),
}))

import { ProfilPersonnePage } from "./ProfilPersonnePage"

/** La fiche d'une personne, telle que le moteur la rend à un membre du réseau. */
const PERSON = {
  personId: "persons_awa",
  handle: "awa",
  displayName: "Awa Ndong",
  headline: null,
  avatar: { url: null, withheld: null },
  cover: { url: null, withheld: null },
  badges: [],
  isMe: false,
}
/** Ma propre fiche : le moteur le dit (`isMe`), l'écran ne le devine pas. */
const MOI = { ...PERSON, isMe: true }

/** Monte la page dans l'enveloppe du moteur, à une adresse donnée. */
function rendre(handle = "awa", search = "") {
  const router = memoryRouter({ search })
  const vue = renderWithEngine(<ProfilPersonnePage handle={handle} />, {
    router: router.implementation,
  })
  return { ...vue, router }
}

beforeEach(() => {
  mocks.queries = {}
  mocks.args = []
  for (const reference of Object.keys(mocks.mutations)) delete mocks.mutations[reference]
  mocks.mobile = false
  mocks.openDraft.mockReset()
  mocks.openOutgoingCall.mockReset()
  mocks.openRefusedCall.mockReset()
  mocks.toastSuccess.mockReset()
  mocks.toastError.mockReset()
})

afterEach(cleanup)

describe("ProfilPersonnePage — identité dans la coque adaptive ANTSIA", () => {
  const adaptiveRoutes = { ...TEST_ROUTES, discover: () => "/decouvrir", me: () => "/moi", clips: (handle?: string) => handle ? `/clips?auteur=${handle}` : "/clips" }

  it("affiche les badges calculés et ouvre les vrais Clips de l'auteur seulement si l'hôte les déclare", () => {
    mocks.queries.getPublicProfile = ok({ ...PERSON, badges: ["verified", "community", "verified"] })
    mocks.queries.personPosts = ok({ items: [], nextCursor: null })
    const router = memoryRouter()
    const view = renderWithEngine(<ProfilPersonnePage handle="awa" />, {
      router: router.implementation,
      routes: adaptiveRoutes,
      navigation: "destinations",
      navigationLayout: "adaptive",
      navigationLabels: { clips: "Clips" },
    })
    expect(view.container.querySelector(".rp-profile-frame")).toHaveStyle({ height: "auto", overflowY: "visible" })
    expect(view.container.querySelectorAll(".pp-trust-badges > span")).toHaveLength(1)
    expect(screen.getByText("Vérifié")).toBeInTheDocument()
    expect(screen.queryByText("Communauté")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Clips" }))
    expect(router.calls).toContainEqual({ method: "push", href: "/clips?auteur=awa" })
    expect(screen.queryByRole("tab", { name: "Clips" })).toBeNull()
    expect(screen.queryByRole("tab", { name: "Identifié" })).toBeNull()
  })

  it("sans label de fonctionnalité branchée, aucun raccourci Clips ni badge visuel inventé", () => {
    mocks.queries.getPublicProfile = ok(PERSON)
    mocks.queries.personPosts = ok({ items: [], nextCursor: null })
    renderWithEngine(<ProfilPersonnePage handle="awa" />, {
      routes: adaptiveRoutes,
      navigation: "destinations",
      navigationLayout: "adaptive",
    })
    expect(screen.queryByRole("button", { name: "Clips" })).toBeNull()
    expect(screen.queryByText("Vérifié")).toBeNull()
  })

  it("mon mur propose le retour aux outils personnels sans les rendre publics", () => {
    mocks.queries.getPublicProfile = ok(MOI)
    mocks.queries.personPosts = ok({ items: [], nextCursor: null })
    const router = memoryRouter()
    renderWithEngine(<ProfilPersonnePage handle="awa" />, {
      router: router.implementation,
      routes: adaptiveRoutes,
      navigation: "destinations",
      navigationLayout: "adaptive",
    })
    // Le namespace applicatif ANTSIA est injecté par l'hôte ; ce harnais ne
    // charge volontairement que les traductions du moteur.
    fireEvent.click(screen.getByRole("button", { name: "me.title" }))
    expect(router.calls).toContainEqual({ method: "push", href: "/moi" })
    expect(screen.queryByRole("link", { name: /Mes achats|Mes données/ })).toBeNull()
  })
})

describe("ProfilPersonnePage — panne honnête (R-08)", () => {
  it("le profil en panne : carte + Réessayer, aucun squelette, pas la phrase du refus", () => {
    mocks.queries.getPublicProfile = err()
    rendre()

    expect(screen.queryByTestId("skeleton")).toBeNull()
    expect(screen.queryByText(/n'est pas accessible/)).toBeNull()
    expect(screen.getByRole("alert").textContent).toContain("Profil indisponible")

    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
    expect(mocks.queries.getPublicProfile.refetch).toHaveBeenCalledTimes(1)
  })

  it("le squelette reste réservé à la vraie attente du profil", () => {
    mocks.queries.getPublicProfile = {
      ...ok(undefined),
      isPending: true,
      isFetching: true,
      fetchStatus: "fetching",
    }
    rendre()
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0)
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("le refus du serveur (null) garde sa phrase unique — ce n'est pas une panne", () => {
    mocks.queries.getPublicProfile = ok(null)
    const { router } = rendre()
    expect(screen.getByText(/n'est pas accessible/)).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()

    // La sortie mène au volet Relations de la page réseau de l'application.
    fireEvent.click(screen.getByRole("button", { name: "Revenir à mon réseau" }))
    expect(router.calls).toEqual([
      { method: "push", href: reseauAgentHref("relations", TEST_ROUTES.home()) },
    ])
  })

  it("le mur en panne se dit, sans prétendre « rien publié »", () => {
    mocks.queries.getPublicProfile = ok(PERSON)
    mocks.queries.personPosts = err()
    rendre()

    expect(screen.getByText("Awa Ndong")).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toContain("Publications indisponibles")
    expect(screen.queryByText(/rien publié|Aucune publication ne vous est ouverte/)).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
    expect(mocks.queries.personPosts.refetch).toHaveBeenCalledTimes(1)
  })

  it("une panne du mur après données CONSERVE les publications", () => {
    mocks.queries.getPublicProfile = ok(PERSON)
    mocks.queries.personPosts = err({ items: [{ _id: "p1" }], nextCursor: null })
    rendre()

    expect(screen.getByText("post-p1")).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toContain("Publications indisponibles")
  })

  it("le vrai mur vide garde sa phrase", () => {
    mocks.queries.getPublicProfile = ok(PERSON)
    mocks.queries.personPosts = ok({ items: [], nextCursor: null })
    rendre()
    expect(screen.getByText(/Aucune publication ne vous est ouverte ici/)).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
  })
})

describe("ProfilPersonnePage — la couverture publiée (R-10)", () => {
  it("sans couverture : le dégradé de charte, aucun style en ligne", () => {
    mocks.queries.getPublicProfile = ok(PERSON)
    mocks.queries.personPosts = ok({ items: [], nextCursor: null })
    const { container } = rendre()

    const banner = container.querySelector(".pp-banner")
    expect(banner).not.toBeNull()
    expect(banner!.className).toBe("esp-banner pp-banner")
    expect(banner!.getAttribute("style")).toBeNull()
  })

  it("avec couverture : l'image publiée, cadrée, et plus de dégradé", () => {
    mocks.queries.getPublicProfile = ok({
      ...PERSON,
      cover: { url: "https://stockage.ga/couv.png", withheld: null },
    })
    mocks.queries.personPosts = ok({ items: [], nextCursor: null })
    const { container } = rendre()

    const banner = container.querySelector(".pp-banner") as HTMLElement
    expect(banner.className).toBe("pp-banner pp-banner--photo")
    expect(banner.className).not.toContain("esp-banner")
    expect(banner.style.backgroundImage).toContain("stockage.ga/couv.png")
    expect(banner.style.backgroundSize).toBe("cover")
    // jsdom normalise la position courte en paire — d'où `toContain`.
    expect(banner.style.backgroundPosition).toContain("center")
    // Une bannière décorative reste hors de l'arbre d'accessibilité.
    expect(banner.getAttribute("aria-hidden")).toBe("true")
  })

  it("retirer sa couverture ramène EXACTEMENT le rendu d'avant", () => {
    mocks.queries.getPublicProfile = ok({
      ...PERSON,
      cover: { url: "https://stockage.ga/couv.png", withheld: null },
    })
    mocks.queries.personPosts = ok({ items: [], nextCursor: null })
    const avec = rendre()
    expect(
      (avec.container.querySelector(".pp-banner") as HTMLElement).style
        .backgroundImage,
    ).not.toBe("")
    cleanup()

    mocks.queries.getPublicProfile = ok(PERSON)
    const sans = rendre()
    const banner = sans.container.querySelector(".pp-banner") as HTMLElement
    expect(banner.className).toBe("esp-banner pp-banner")
    expect(banner.style.backgroundImage).toBe("")
  })

  it("une couverture RETENUE par l'analyse retombe sur le dégradé", () => {
    mocks.queries.getPublicProfile = ok({
      ...PERSON,
      cover: { url: null, withheld: "fileScanPending" },
    })
    mocks.queries.personPosts = ok({ items: [], nextCursor: null })
    const { container } = rendre()
    expect(container.querySelector(".pp-banner")!.className).toBe("esp-banner pp-banner")
  })
})

describe("ProfilPersonnePage — le mur paginé (R-11)", () => {
  const CURSOR = { publishedAt: 1_800_000_000_000, postId: "p20" }
  const CLE_PAGE_2 = `personPosts@${CURSOR.publishedAt}:${CURSOR.postId}`

  beforeEach(() => {
    mocks.queries.getPublicProfile = ok(PERSON)
  })

  it("sans suite annoncée, aucun bouton — on ne propose pas ce qu'on ignore", () => {
    mocks.queries.personPosts = ok({
      items: [{ _id: "p1" }],
      nextCursor: null,
    })
    rendre()
    expect(screen.getByText("post-p1")).toBeTruthy()
    expect(
      screen.queryByRole("button", { name: "Voir plus de publications" }),
    ).toBeNull()
  })

  it("« Voir plus » monte la page suivante, sans redemander la première", () => {
    mocks.queries.personPosts = ok({
      items: [{ _id: "p1" }, { _id: "p20" }],
      nextCursor: CURSOR,
    })
    mocks.queries[CLE_PAGE_2] = ok({
      items: [{ _id: "p21" }],
      nextCursor: null,
    })
    rendre()

    expect(screen.queryByText("post-p21")).toBeNull()
    fireEvent.click(
      screen.getByRole("button", { name: "Voir plus de publications" }),
    )

    // Les DEUX pages sont montées : la première n'a pas été remplacée.
    expect(screen.getByText("post-p1")).toBeTruthy()
    expect(screen.getByText("post-p20")).toBeTruthy()
    expect(screen.getByText("post-p21")).toBeTruthy()
    // La page 2 ayant clos la chaîne, le bouton disparaît.
    expect(
      screen.queryByRole("button", { name: "Voir plus de publications" }),
    ).toBeNull()
  })

  it("l'ajout est ANNONCÉ à voix haute — le bouton ne le dit pas tout seul", () => {
    mocks.queries.personPosts = ok({
      items: [{ _id: "p1" }],
      nextCursor: CURSOR,
    })
    mocks.queries[CLE_PAGE_2] = ok({ items: [{ _id: "p21" }], nextCursor: null })
    rendre()

    const annonce = screen.getByRole("status")
    expect(annonce.textContent).toBe("")
    fireEvent.click(
      screen.getByRole("button", { name: "Voir plus de publications" }),
    )
    expect(annonce.getAttribute("aria-live")).toBe("polite")
    expect(annonce.textContent).toBe("20 publications de plus.")
  })

  it("une page suivante en PANNE le dit sans vider le mur déjà rendu", () => {
    mocks.queries.personPosts = ok({
      items: [{ _id: "p1" }],
      nextCursor: CURSOR,
    })
    mocks.queries[CLE_PAGE_2] = err()
    rendre()
    fireEvent.click(
      screen.getByRole("button", { name: "Voir plus de publications" }),
    )

    expect(screen.getByText("post-p1")).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toContain(
      "Publications indisponibles",
    )
    expect(screen.queryByText(/rien publié|Aucune publication ne vous est/)).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
    expect(mocks.queries[CLE_PAGE_2]!.refetch).toHaveBeenCalledTimes(1)
  })

  it("une page suivante VIDE ne prononce jamais « rien publié »", () => {
    mocks.queries.personPosts = ok({
      items: [{ _id: "p1" }],
      nextCursor: CURSOR,
    })
    mocks.queries[CLE_PAGE_2] = ok({ items: [], nextCursor: null })
    rendre()
    fireEvent.click(
      screen.getByRole("button", { name: "Voir plus de publications" }),
    )

    expect(screen.getByText("post-p1")).toBeTruthy()
    expect(screen.queryByText(/rien publié|Aucune publication ne vous est/)).toBeNull()
  })

  it("le mur vide de MON profil me parle de MOI", () => {
    mocks.queries.getPublicProfile = ok(MOI)
    mocks.queries.personPosts = ok({ items: [], nextCursor: null })
    rendre()
    expect(screen.getByText("Vous n'avez encore rien publié.")).toBeTruthy()
  })

  it("le mur est demandé DANS le réseau courant", () => {
    mocks.queries.personPosts = ok({ items: [], nextCursor: null })
    rendre()
    expect(mocks.args).toContainEqual({ networkId: TEST_NETWORK_ID, handle: "awa" })
  })
})

describe("ProfilPersonnePage — la publication épinglée tient la tête du mur", () => {
  it("l'épinglée, rendue à part par le moteur, précède le mur et se dit", () => {
    mocks.queries.getPublicProfile = ok(PERSON)
    mocks.queries.personPosts = ok({
      items: [{ _id: "p1" }],
      nextCursor: null,
      pinned: { _id: "p0" },
    })
    const { container } = rendre()

    expect(screen.getByText("Épinglée")).toBeTruthy()
    const texte = container.textContent ?? ""
    expect(texte.indexOf("post-p0")).toBeGreaterThan(-1)
    expect(texte.indexOf("post-p0")).toBeLessThan(texte.indexOf("post-p1"))
    // Sur la fiche d'un tiers, aucun geste sur l'épingle.
    expect(screen.queryByRole("button", { name: "Désépingler" })).toBeNull()
  })

  it("un mur sans autre publication que l'épinglée n'est pas un mur vide", () => {
    mocks.queries.getPublicProfile = ok(PERSON)
    mocks.queries.personPosts = ok({ items: [], nextCursor: null, pinned: { _id: "p0" } })
    rendre()
    expect(screen.getByText("post-p0")).toBeTruthy()
    expect(screen.queryByText(/Aucune publication ne vous est ouverte/)).toBeNull()
  })

  it("sur MA fiche, « Désépingler » rend la publication au fil de mon mur", async () => {
    mocks.queries.getPublicProfile = ok(MOI)
    mocks.queries.personPosts = ok({ items: [], nextCursor: null, pinned: { _id: "p0" } })
    rendre()

    fireEvent.click(screen.getByRole("button", { name: "Désépingler" }))
    await waitFor(() =>
      expect(mocks.mutations.unpinMyWall).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID }),
    )
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Publication désépinglée."))
  })
})

describe("ProfilPersonnePage — changer de profil remet la chaîne à zéro", () => {
  it("les curseurs d'un mur ne sont pas redemandés pour le mur suivant", () => {
    const CURSOR = { publishedAt: 42, postId: "p9" }
    mocks.queries.getPublicProfile = ok(PERSON)
    mocks.queries.personPosts = ok({
      items: [{ _id: "p9" }],
      nextCursor: CURSOR,
    })
    mocks.queries[`personPosts@${CURSOR.publishedAt}:${CURSOR.postId}`] = ok({
      items: [{ _id: "p10" }],
      nextCursor: null,
    })

    const vue = rendre()
    fireEvent.click(
      screen.getByRole("button", { name: "Voir plus de publications" }),
    )
    expect(screen.getByText("post-p10")).toBeTruthy()

    // Même composant, autre personne : la page 2 de l'ancien mur disparaît.
    mocks.queries.getPublicProfile = ok({ ...PERSON, handle: "bilou" })
    mocks.queries.personPosts = ok({
      items: [{ _id: "q1" }],
      nextCursor: null,
    })
    vue.rerender(<ProfilPersonnePage handle="bilou" />)

    expect(screen.getByText("post-q1")).toBeTruthy()
    expect(screen.queryByText("post-p10")).toBeNull()
    expect(screen.queryByText("post-p9")).toBeNull()
  })
})

describe("ProfilPersonnePage — les trois onglets du profil (R-09)", () => {
  beforeEach(() => {
    mocks.queries.getPublicProfile = ok(PERSON)
    mocks.queries.personPosts = ok({ items: [{ _id: "p1" }], nextCursor: null })
  })

  it("s'ouvre sur Publications, et une seule sous-vue est rendue", () => {
    rendre()

    const onglets = screen.getAllByRole("tab")
    expect(onglets.map((tab) => tab.textContent)).toEqual([
      "Publications",
      "Photos",
      "Albums",
    ])
    expect(onglets[0]!.getAttribute("aria-selected")).toBe("true")
    expect(screen.getByText("post-p1")).toBeTruthy()
    expect(screen.queryByTestId("albums-section")).toBeNull()
  })

  it("« Albums » monte la liste et REMPLACE le mur", () => {
    rendre()
    fireEvent.click(screen.getByRole("tab", { name: "Albums" }))

    const section = screen.getByTestId("albums-section")
    expect(section.getAttribute("data-variant")).toBe("albums")
    expect(section.textContent).toContain("albums-awa-autrui")
    // Le mur n'est plus monté : deux collections empilées sous un fil infini,
    // c'est exactement ce que les onglets existent pour éviter.
    expect(screen.queryByText("post-p1")).toBeNull()
  })

  it("« Photos » rend la MÊME liste sous l'autre forme", () => {
    rendre()
    fireEvent.click(screen.getByRole("tab", { name: "Photos" }))
    expect(screen.getByTestId("albums-section").getAttribute("data-variant")).toBe(
      "photos",
    )
  })

  it("le panneau est relié à l'onglet sélectionné (ARIA)", () => {
    const { container } = rendre()
    const panneau = container.querySelector("#pp-panneau") as HTMLElement
    expect(panneau.getAttribute("role")).toBe("tabpanel")
    expect(panneau.getAttribute("aria-labelledby")).toBe("pp-onglet-publications")

    fireEvent.click(screen.getByRole("tab", { name: "Albums" }))
    expect(panneau.getAttribute("aria-labelledby")).toBe("pp-onglet-albums")
  })

  it("l'adresse ouvre directement l'onglet demandé", () => {
    rendre("awa", "onglet=albums")
    expect(screen.getByRole("tab", { name: "Albums" }).getAttribute("aria-selected")).toBe(
      "true",
    )
    expect(screen.getByTestId("albums-section")).toBeTruthy()
  })

  it("un onglet inconnu retombe sur Publications — jamais un panneau vide", () => {
    rendre("awa", "onglet=trombinoscope")
    expect(
      screen.getByRole("tab", { name: "Publications" }).getAttribute("aria-selected"),
    ).toBe("true")
    expect(screen.getByText("post-p1")).toBeTruthy()
  })
})

describe("ProfilPersonnePage — créer un album depuis son profil (R-09)", () => {
  beforeEach(() => {
    mocks.queries.getPublicProfile = ok(MOI)
    mocks.queries.personPosts = ok({ items: [], nextCursor: null })
  })

  it("chez MOI, l'onglet Albums porte l'entrée de création", () => {
    rendre()
    fireEvent.click(screen.getByRole("tab", { name: "Albums" }))
    expect(screen.getByTestId("albums-section").textContent).toContain("albums-awa-moi")

    fireEvent.click(screen.getByRole("button", { name: "Créer un album" }))
    expect(screen.getByTestId("album-composer")).toBeTruthy()
    expect(screen.queryByTestId("albums-section")).toBeNull()
  })

  it("« Créer → Album » ouvre le composeur d'emblée (?nouveau=1)", () => {
    rendre("awa", "onglet=albums&nouveau=1")
    expect(screen.getByTestId("album-composer")).toBeTruthy()
  })

  it("l'intention ne vaut QUE sur l'onglet Albums", () => {
    rendre("awa", "nouveau=1")
    expect(screen.queryByTestId("album-composer")).toBeNull()
    expect(
      screen.getByRole("tab", { name: "Publications" }).getAttribute("aria-selected"),
    ).toBe("true")
  })

  it("quitter l'onglet referme le composeur", () => {
    rendre("awa", "onglet=albums&nouveau=1")
    fireEvent.click(screen.getByRole("tab", { name: "Photos" }))
    expect(screen.queryByTestId("album-composer")).toBeNull()

    fireEvent.click(screen.getByRole("tab", { name: "Albums" }))
    expect(screen.queryByTestId("album-composer")).toBeNull()
    expect(screen.getByTestId("albums-section")).toBeTruthy()
  })

  it("sur le profil d'un TIERS, aucune entrée de création", () => {
    mocks.queries.getPublicProfile = ok(PERSON)
    rendre()
    fireEvent.click(screen.getByRole("tab", { name: "Albums" }))
    expect(screen.getByTestId("albums-section").textContent).toContain("albums-awa-autrui")
    expect(screen.queryByRole("button", { name: "Créer un album" })).toBeNull()
  })
})

describe("ProfilPersonnePage — l'aperçu ?apercu=1 (X-07)", () => {
  beforeEach(() => {
    mocks.queries.getPublicProfile = ok(MOI)
    mocks.queries.personPosts = ok({ items: [], nextCursor: null })
  })

  it("sans le paramètre, ma fiche reste la mienne", () => {
    rendre()
    expect(screen.getByText("Vous")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Modifier mon profil" })).toBeTruthy()
    expect(screen.queryByText(/Aperçu : ce que voient les membres du réseau/)).toBeNull()
  })

  it("avec ?apercu=1 : le bandeau, et mes commandes disparaissent", () => {
    rendre("awa", "apercu=1")

    expect(
      screen.getByRole("alert").textContent,
    ).toContain("Aperçu : ce que voient les membres du réseau")
    // `isSelf` forcé à faux : ni badge « Vous », ni commandes, ni gestion.
    expect(screen.queryByText("Vous")).toBeNull()
    expect(screen.queryByRole("button", { name: "Modifier mon profil" })).toBeNull()
    expect(screen.queryByTestId("gestion-profil")).toBeNull()
    // Et le mur vide me parle comme il parlerait d'un tiers.
    expect(screen.getByText(/Aucune publication ne vous est ouverte ici/)).toBeTruthy()
    expect(screen.queryByText("Vous n'avez encore rien publié.")).toBeNull()
  })

  it("l'aperçu offre sa SORTIE — sinon c'est une impasse", () => {
    const { router } = rendre("awa", "apercu=1")
    fireEvent.click(screen.getByRole("button", { name: "Revenir à mon profil" }))
    expect(router.calls).toEqual([{ method: "push", href: TEST_ROUTES.profile("awa") }])
  })

  it("l'aperçu masque aussi l'entrée de création d'album", () => {
    rendre("awa", "apercu=1&onglet=albums&nouveau=1")
    expect(screen.queryByTestId("album-composer")).toBeNull()
    expect(screen.getByTestId("albums-section").textContent).toContain(
      "albums-awa-autrui",
    )
    expect(screen.queryByRole("button", { name: "Créer un album" })).toBeNull()
  })

  it("aucune valeur d'aperçu n'est envoyée au serveur", () => {
    // Le paramètre ne change QUE le rendu : les queries reçoivent exactement
    // les mêmes arguments qu'une visite ordinaire — c'est ce qui garantit que
    // l'aperçu montre la même chose qu'un membre du réseau.
    rendre("awa", "apercu=1&gerer=1")
    for (const args of mocks.args) {
      expect(JSON.stringify(args)).not.toContain("apercu")
      expect(JSON.stringify(args)).not.toContain("gerer")
    }
  })
})

describe("ProfilPersonnePage — la gestion de MON profil", () => {
  beforeEach(() => {
    mocks.queries.getPublicProfile = ok(MOI)
    mocks.queries.personPosts = ok({ items: [], nextCursor: null })
  })

  it("« Modifier mon profil » ouvre puis referme la gestion, sous la carte", () => {
    rendre()
    const bouton = screen.getByRole("button", { name: "Modifier mon profil" })
    expect(bouton.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByTestId("gestion-profil")).toBeNull()

    fireEvent.click(bouton)
    expect(bouton.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByTestId("gestion-profil")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Gérer mon profil" })).toBeTruthy()

    fireEvent.click(bouton)
    expect(screen.queryByTestId("gestion-profil")).toBeNull()
  })

  it("un rappel de profil l'ouvre d'emblée (?gerer=1)", () => {
    rendre("awa", "gerer=1")
    expect(screen.getByTestId("gestion-profil")).toBeTruthy()
  })

  it("jamais sur la fiche d'un TIERS, même demandée par l'adresse", () => {
    mocks.queries.getPublicProfile = ok(PERSON)
    rendre("awa", "gerer=1")
    expect(screen.queryByTestId("gestion-profil")).toBeNull()
    expect(screen.queryByRole("button", { name: "Modifier mon profil" })).toBeNull()
  })

  it("MON profil retiré : la fiche me ramène à sa gestion, pas au refus", () => {
    mocks.queries.getPublicProfile = ok(null)
    mocks.queries.getMyPerson = ok({ handle: "awa", published: false, private: false })
    rendre()
    expect(screen.getByTestId("gestion-profil")).toBeTruthy()
    expect(screen.queryByText(/n'est pas accessible/)).toBeNull()
  })

  it("l'identifiant RETIRÉ d'un autre garde le refus indistinct", () => {
    mocks.queries.getPublicProfile = ok(null)
    mocks.queries.getMyPerson = ok({ handle: "moi", published: true, private: false })
    rendre()
    expect(screen.getByText(/n'est pas accessible/)).toBeTruthy()
    expect(screen.queryByTestId("gestion-profil")).toBeNull()
  })
})

describe("ProfilPersonnePage — la relation, réglée depuis la fiche", () => {
  beforeEach(() => {
    mocks.queries.getPublicProfile = ok(PERSON)
    mocks.queries.personPosts = ok({ items: [], nextCursor: null })
    mocks.queries.isFollowing = ok(false)
  })

  it("la relation et le suivi sont demandés par PERSONNE, dans le réseau courant", () => {
    mocks.queries.connectionWith = ok({ state: "none" })
    rendre()
    expect(mocks.args).toContainEqual({ networkId: TEST_NETWORK_ID, otherPersonId: "persons_awa" })
    expect(mocks.args).toContainEqual({ networkId: TEST_NETWORK_ID, targetPersonId: "persons_awa" })
  })

  it("sur MA fiche, aucune question de relation n'est posée au serveur", () => {
    mocks.queries.getPublicProfile = ok(MOI)
    rendre()
    for (const args of mocks.args) {
      expect(JSON.stringify(args)).not.toContain("otherPersonId")
      expect(JSON.stringify(args)).not.toContain("targetPersonId")
    }
  })

  it("sans lien : « Se connecter » demande par l'identifiant, et le dit", async () => {
    mocks.queries.connectionWith = ok({ state: "none" })
    rendre()
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    await waitFor(() =>
      expect(mocks.mutations.requestConnection).toHaveBeenCalledWith({
        returnRateLimit: true,
        networkId: TEST_NETWORK_ID,
        handle: "awa",
      }),
    )
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Invitation envoyée."))
  })

  it("un refus du moteur se dit par son code, jamais par sa trace", async () => {
    mocks.queries.connectionWith = ok({ state: "declined", connectionId: "connections_1" })
    rendre()
    mocks.mutation("requestConnection").mockRejectedValueOnce(
      Object.assign(new Error("trace serveur"), { data: { code: "notFound" } }),
    )
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }))
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Cette ressource est introuvable ou n'est pas accessible.",
      ),
    )
  })

  it("une invitation REÇUE s'accepte sur la fiche même", async () => {
    mocks.queries.connectionWith = ok({ state: "requested_by_them", connectionId: "connections_1" })
    rendre()
    expect(screen.getByRole("button", { name: "Refuser" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Confirmer" }))
    await waitFor(() =>
      expect(mocks.mutations.respondToConnection).toHaveBeenCalledWith({
        networkId: TEST_NETWORK_ID,
        connectionId: "connections_1",
        accept: true,
      }),
    )
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Vous êtes désormais connectés."),
    )
  })

  it("une invitation envoyée ne se renvoie pas, un lien établi ne se redemande pas", () => {
    mocks.queries.connectionWith = ok({ state: "requested_by_me", connectionId: "connections_1" })
    const premier = rendre()
    const sent = screen.getByRole("button", { name: "Invitation envoyée" })
    expect(sent).toBeEnabled()
    fireEvent.click(sent)
    expect(mocks.mutations.requestConnection).not.toHaveBeenCalled()
    expect(premier.router.calls).toContainEqual({ method: "push", href: "/fil?tab=relations&vue=invitations" })
    premier.unmount()

    mocks.queries.connectionWith = ok({ state: "connected", connectionId: "connections_1", since: 1 })
    rendre()
    expect((screen.getByRole("button", { name: "Connecté" }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it("suivre vise l'identifiant, ne plus suivre vise la PERSONNE", async () => {
    mocks.queries.connectionWith = ok({ state: "none" })
    const premier = rendre()
    fireEvent.click(screen.getByRole("button", { name: "Suivre" }))
    await waitFor(() =>
      expect(mocks.mutations.follow).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, handle: "awa" }),
    )
    premier.unmount()

    mocks.queries.isFollowing = ok(true)
    rendre()
    fireEvent.click(screen.getByRole("button", { name: "Suivi" }))
    await waitFor(() =>
      expect(mocks.mutations.unfollow).toHaveBeenCalledWith({
        networkId: TEST_NETWORK_ID,
        targetPersonId: "persons_awa",
      }),
    )
  })
})

describe("ProfilPersonnePage — joindre une relation (iCom)", () => {
  beforeEach(() => {
    mocks.queries.getPublicProfile = ok(PERSON)
    mocks.queries.personPosts = ok({ items: [], nextCursor: null })
    mocks.queries.isFollowing = ok(false)
    mocks.queries.connectionWith = ok({ state: "connected", connectionId: "connections_1", since: 1 })
  })

  it("hors relation, ni « Écrire » ni « Appeler » : on ne joint que qui l'on connaît", () => {
    mocks.queries.connectionWith = ok({ state: "none" })
    rendre()
    expect(screen.queryByRole("button", { name: "Écrire" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Appeler Awa Ndong" })).toBeNull()
  })

  it("au bureau, « Écrire » ouvre le brouillon dans la carte iCom, sans quitter la fiche", () => {
    const { router } = rendre()
    fireEvent.click(screen.getByRole("button", { name: "Écrire" }))
    expect(mocks.openDraft).toHaveBeenCalledWith("awa")
    expect(router.calls).toEqual([])
  })

  it("au téléphone, « Écrire » ouvre la messagerie de l'application sur le brouillon", () => {
    mocks.mobile = true
    const { router } = rendre()
    fireEvent.click(screen.getByRole("button", { name: "Écrire" }))
    expect(mocks.openDraft).toHaveBeenCalledWith("awa")
    expect(router.calls).toEqual([
      { method: "push", href: conversationHref(draftKey("awa"), TEST_ROUTES.messages()) },
    ])
  })

  it("« Appeler » vise la PERSONNE et ouvre la fenêtre sortante du magasin d'appel", async () => {
    mocks.mutation("callMember").mockResolvedValueOnce({
      admitted: true,
      callId: "calls_1",
      calleePersonId: "persons_awa",
      roomName: "call-1",
      mediaType: "audio",
    })
    rendre()
    fireEvent.click(screen.getByRole("button", { name: "Appeler Awa Ndong" }))
    await waitFor(() => expect(mocks.openOutgoingCall).toHaveBeenCalledTimes(1))
    expect(mocks.mutations.callMember).toHaveBeenCalledWith({
      networkId: TEST_NETWORK_ID,
      target: { personId: "persons_awa" },
      mediaType: "audio",
    })
    expect(mocks.openOutgoingCall).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingId: "calls_1",
        participantUserId: "persons_awa",
        mediaType: "audio",
        scope: "personnel",
        callee: expect.objectContaining({ name: "Awa Ndong", handle: "awa" }),
      }),
    )
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it("un appel ÉCARTÉ ouvre l'écran de fin avec sa raison — pas un toast", async () => {
    mocks.mutation("callMember").mockResolvedValueOnce({
      admitted: false,
      callId: "calls_2",
      calleePersonId: "persons_awa",
      reason: "dnd",
      voicemailOffered: true,
    })
    rendre()
    fireEvent.click(screen.getByRole("button", { name: "Appeler Awa Ndong" }))
    await waitFor(() => expect(mocks.openRefusedCall).toHaveBeenCalledTimes(1))
    expect(mocks.openRefusedCall).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingId: "calls_2",
        endKind: refusalEndKind("dnd"),
        voicemailOffered: true,
        scope: "personnel",
      }),
    )
    expect(mocks.openOutgoingCall).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })
})
