// Écrit pour le moteur (lot P5) : la page réseau RÉÉCRITE d'après socle/packages/agent-features/src/features/reseau-personnel/ReseauAgentPage.tsx @ ad2e7fdc2 (au socle, seuls des cliquets relisaient son texte) — bascule téléphone/bureau, volets servis (« Conférences » rabattu sur le fil), rail droit ouvert par iCom, composeurs ouverts en place ; l'état du fil et les volets des autres tranches sont simulés (leur comportement se vérifie dans leurs tranches).
// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { FEED_SCOPE_DEFAULT } from "../features/reseau-personnel/feed-scopes"
import { initialFeedPages } from "../features/reseau-personnel/reseau-feed-pages"
import { EngineTestWrapper } from "../tests/engine-wrapper"

const mocks = vi.hoisted(() => {
  /** Une référence de fonction pour N'IMPORTE quel chemin de l'API : les lectures sont simulées. */
  const anyPath = (): unknown => new Proxy(() => undefined, { get: () => anyPath() })
  return {
    anyPath,
    mobile: false as boolean | null,
    adaptive: false,
    tab: "fil" as string,
    goToTab: vi.fn(),
    push: vi.fn(),
  }
})

vi.mock("@antsia/ui/overlay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@antsia/ui/overlay")>()),
  useIsReseauMobile: () => mocks.mobile,
}))

vi.mock("@antsia/api/network", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@antsia/api/network")>()),
  useNetworkNavigationLayout: () => ({ adaptive: mocks.adaptive, mobile: mocks.mobile }),
}))

vi.mock("@antsia/api/engine", () => ({ api: mocks.anyPath() }))

vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  useAuthenticatedPaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: vi.fn(), isLoading: false }),
}))

vi.mock("../features/reseau-personnel/useReseauFeedState", () => ({
  useReseauFeedState: () => ({
    now: 0,
    router: { push: mocks.push, replace: vi.fn() },
    tab: mocks.tab,
    view: { kind: "feed" },
    setView: vi.fn(),
    searchDraft: "",
    setSearchDraft: vi.fn(),
    groupSeed: null,
    scope: FEED_SCOPE_DEFAULT,
    pages: initialFeedPages(),
    setPages: vi.fn(),
    announcement: "",
    setAnnouncement: vi.fn(),
    reportTail: vi.fn(),
    rebaseAfterPage: vi.fn(),
    search: { data: undefined, isLoading: false },
    focused: { data: undefined, isLoading: false },
    connections: { data: [] },
    follows: { data: [] },
    myProfile: { data: { published: true, handle: "awa.ndong", displayName: "Awa Ndong", avatar: null } },
    goToTab: mocks.goToTab,
    goToScope: vi.fn(),
    openTag: vi.fn(),
    openTagFromGroups: vi.fn(),
    openMention: vi.fn(),
    openSearch: vi.fn(),
    backToFeed: vi.fn(),
    openGroup: vi.fn(),
    closeGroup: vi.fn(),
    tailCursor: null,
    pendingCount: 0,
    onboardingCopy: null,
    onboardingUrgent: false,
  }),
}))

/** Un volet ou un rail d'une autre tranche, réduit à son nom. */
function stub(name: string) {
  const Stub = () => <div data-testid={name} />
  Stub.displayName = name
  return Stub
}

vi.mock("../features/messagerie/MessagerieDock", () => ({ MessagerieDock: stub("MessagerieDock") }))
vi.mock("../features/messagerie/messagerie-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../features/messagerie/messagerie-source")>()),
  SOURCE_AGENT: {
    useUnreadTotals: () => ({
      directs: { total: 0, capped: false },
      groupes: { total: 0, capped: false },
      total: { total: 0, capped: false },
      isLoading: false,
      isError: false,
      refetch: () => {},
    }),
  },
}))
vi.mock("../features/notifications/NotificationBell", () => ({ NotificationBell: stub("NotificationBell") }))
vi.mock("../features/reseau-personnel/SuggestionsPanel", () => ({ SuggestionsPanel: stub("SuggestionsPanel") }))
vi.mock("../features/reseau-personnel/PagesSuggestionsRail", () => ({ PagesSuggestionsRail: stub("PagesSuggestionsRail") }))
vi.mock("../features/reseau-personnel/EvenementsRail", () => ({ EvenementsRail: stub("EvenementsRail") }))
vi.mock("../features/reseau-personnel/PeoplePanel", () => ({ PeoplePanel: stub("PeoplePanel") }))
vi.mock("../features/reseau-personnel/GroupsPanel", () => ({ GroupsPanel: stub("GroupsPanel") }))
vi.mock("../features/reseau-personnel/PagesPanel", () => ({ PagesPanel: stub("PagesPanel") }))
vi.mock("../features/reseau-personnel/EvenementsPanel", () => ({
  EvenementsPanel: ({ onCreateEvent }: { onCreateEvent?: () => void }) => <div data-testid="EvenementsPanel" data-create={onCreateEvent === undefined ? "absent" : "present"} />,
}))
vi.mock("../features/reseau-personnel/BookmarksPanel", () => ({ BookmarksPanel: stub("BookmarksPanel") }))
vi.mock("../features/reseau-personnel/FeedPages", () => ({ FeedPage: stub("FeedPage"), EmptyFeed: stub("EmptyFeed") }))
vi.mock("../features/reseau-personnel/PostCard", () => ({ PostCard: stub("PostCard") }))
vi.mock("../features/reseau-personnel/ProfileMiniCard", () => ({
  ProfileMiniCard: ({ action }: { action?: ReactNode }) => <div data-testid="ProfileMiniCard">{action}</div>,
}))
vi.mock("../features/stories/StoriesTray", () => ({ StoriesTray: stub("StoriesTray") }))
vi.mock("../features/stories/stories-styles", () => ({ StoriesStyles: () => null }))
vi.mock("../features/stories/StoryCreateSheet", () => ({
  StoryCreateSheet: ({ open }: { open: boolean }) => <div data-testid="StoryCreateSheet" data-open={String(open)} />,
}))
vi.mock("./mobile/PostComposerSheet", () => ({
  PostComposerSheet: ({ open }: { open: boolean }) => <div data-testid="PostComposerSheet" data-open={String(open)}>{open ? <input type="file" data-testid="composer-file-picker" /> : null}</div>,
}))

import { ReseauAgentPage } from "./ReseauAgentPage"
import { postDraftStore } from "../features/reseau-personnel/post-draft-store"

function page() {
  return render(
    <EngineTestWrapper>
      <ReseauAgentPage />
    </EngineTestWrapper>,
  )
}

beforeEach(() => {
  postDraftStore.resetForTests()
  mocks.mobile = false
  mocks.adaptive = false
  mocks.tab = "fil"
  mocks.goToTab.mockClear()
  mocks.push.mockClear()
  Element.prototype.scrollIntoView = vi.fn()
})

describe("ReseauAgentPage — la page réseau", () => {
  /** U02 : scénarios écrits seulement ; jsdom ne mesure pas les container queries. */
  it("pose la variante adaptative sur un seul arbre, sans hauteur de page imposée", () => {
    mocks.adaptive = true
    const vue = page()
    const scope = vue.container.querySelector<HTMLElement>(".rp-scope")!
    expect(scope.getAttribute("data-navigation-layout")).toBe("adaptive")
    expect(scope.style.height).toBe("")
    expect(screen.getAllByRole("main")).toHaveLength(1)
    expect(screen.getAllByTestId("FeedPage")).toHaveLength(1)
    expect(screen.getAllByTestId("PostComposerSheet")).toHaveLength(1)
    // L'ossature reste unique ; les seuils tablette/ordinateur redistribuent ses éléments en CSS.
    expect(scope.querySelectorAll(".rp-rail-start")).toHaveLength(1)
    expect(scope.querySelectorAll(".rp-main-col")).toHaveLength(1)
    expect(scope.querySelectorAll(".rp-rail-end")).toHaveLength(1)
  })

  it("garde les mêmes noeuds et le sélecteur de fichier entre tablette et ordinateur", () => {
    mocks.adaptive = true
    postDraftStore.setComposerOpen(true)
    const initialWidth = window.innerWidth
    const vue = page()
    const scope = vue.container.querySelector(".rp-scope")
    const feed = screen.getByTestId("FeedPage")
    const picker = screen.getByTestId("composer-file-picker")
    try {
      // Le hook partagé a déjà retenu mobile=false à chacun de ces paliers ;
      // on vérifie le montage React, pas une mesure CSS simulée comme une preuve visuelle.
      for (const width of [768, 1199, 1200, 1400]) {
        Object.defineProperty(window, "innerWidth", { configurable: true, value: width })
        vue.rerender(<EngineTestWrapper><ReseauAgentPage /></EngineTestWrapper>)
        expect(vue.container.querySelector(".rp-scope")).toBe(scope)
        expect(screen.getByTestId("FeedPage")).toBe(feed)
        expect(screen.getByTestId("composer-file-picker")).toBe(picker)
        expect(picker.isConnected).toBe(true)
        expect(screen.getAllByRole("main")).toHaveLength(1)
      }
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: initialWidth })
    }
  })

  it("conserve le contrat de hauteur et l'absence d'opt-in pour un réseau historique", () => {
    const vue = page()
    const scope = vue.container.querySelector<HTMLElement>(".rp-scope")!
    expect(scope.hasAttribute("data-navigation-layout")).toBe(false)
    expect(scope.style.height).toBe("100%")
  })

  it.each([true, false])("conserve le sélecteur ouvert quand la coquille change depuis mobile=%s", (mobile) => {
    mocks.mobile = mobile
    postDraftStore.setComposerOpen(true)
    const vue = page()
    const picker = screen.getByTestId("composer-file-picker")

    mocks.mobile = !mobile
    vue.rerender(<EngineTestWrapper><ReseauAgentPage /></EngineTestWrapper>)

    expect(picker.isConnected).toBe(true)
    expect(screen.getByTestId("composer-file-picker")).toBe(picker)
    expect(screen.getAllByTestId("PostComposerSheet")).toHaveLength(1)

    mocks.mobile = mobile
    vue.rerender(<EngineTestWrapper><ReseauAgentPage /></EngineTestWrapper>)
    expect(screen.getByTestId("composer-file-picker")).toBe(picker)
  })

  it("ne monte AUCUN arbre tant que la largeur n'est pas connue", () => {
    mocks.mobile = null
    page()
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull()
    expect(screen.queryByRole("tablist")).toBeNull()
  })

  it("monte l'arbre du téléphone sous 960 px, avec sa barre et son en-tête", () => {
    mocks.mobile = true
    page()
    expect(screen.getByRole("heading", { level: 1, name: "Réseau" })).toBeTruthy()
    expect(screen.getByRole("navigation", { name: "Navigation du réseau" })).toBeTruthy()
    expect(screen.queryByRole("tablist")).toBeNull()
    // Le fil du téléphone : déclencheur de publication et chaîne de pages.
    expect(screen.getByRole("button", { name: /Partager une information, Awa/ })).toBeTruthy()
    expect(screen.getByTestId("FeedPage")).toBeTruthy()
  })

  it("rend au bureau les volets servis et le fil ouvert", () => {
    page()
    const onglets = within(screen.getByRole("tablist", { name: "Volets du réseau" })).getAllByRole("tab")
    expect(onglets.map((onglet) => onglet.textContent)).toEqual(["Fil", "Relations", "Groupes", "Pages", "Conférences", "Évènements", "Enregistrements"])
    expect(screen.getByRole("tab", { name: "Fil" }).getAttribute("aria-selected")).toBe("true")
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe("reseau-tab-fil")
    expect(screen.getByRole("main").contains(screen.getByRole("tabpanel"))).toBe(true)
    expect(screen.getByRole("tabpanel").contains(screen.getByRole("tablist"))).toBe(false)
    expect(screen.getByRole("heading", { level: 1, name: "Réseau" })).toBeTruthy()
    expect(screen.getByTestId("FeedPage")).toBeTruthy()
    expect(screen.getByTestId("StoriesTray")).toBeTruthy()
  })

  it("ouvre les conférences depuis leur adresse", () => {
    mocks.tab = "conferences"
    page()
    expect(screen.getByRole("tab", { name: "Conférences" }).getAttribute("aria-selected")).toBe("true")
    expect(screen.getByRole("button", { name: "Mes conférences" })).toBeTruthy()
    expect(screen.queryByTestId("FeedPage")).toBeNull()
  })

  it("ouvre le rail droit par la carte iCom, puis la découverte", () => {
    page()
    // Par son nom : les rails ne s'allument que par des requêtes de
    // conteneur, que jsdom n'évalue pas — leur règle de base (`display: none`)
    // s'applique, et une `aside` n'y expose pas de rôle de repère.
    const rail = screen.getByLabelText("iCom et découverte du réseau")
    const modules = Array.from(rail.querySelectorAll("[data-testid]")).map((node) => node.getAttribute("data-testid"))
    expect(modules).toEqual(["MessagerieDock", "SuggestionsPanel", "PagesSuggestionsRail", "EvenementsRail"])
  })

  it("retire du rail ce que la colonne porte déjà", () => {
    mocks.tab = "evenements"
    page()
    expect(screen.getByTestId("EvenementsPanel")).toBeTruthy()
    const rail = screen.getByLabelText("iCom et découverte du réseau")
    expect(within(rail).queryByTestId("EvenementsRail")).toBeNull()
    // L'évènement se compose dans son volet : aucun bouton qui y renverrait.
    expect(screen.getByTestId("EvenementsPanel").getAttribute("data-create")).toBe("absent")
  })

  it("monte le volet demandé dans la colonne", () => {
    mocks.tab = "relations"
    const { unmount } = page()
    expect(screen.getByTestId("PeoplePanel")).toBeTruthy()
    expect(screen.queryByTestId("FeedPage")).toBeNull()
    unmount()

    mocks.tab = "pages"
    page()
    expect(screen.getByTestId("PagesPanel")).toBeTruthy()
  })

  it("change de volet par la tablist ou le rail-menu, sans naviguer lui-même", () => {
    page()
    fireEvent.click(screen.getByRole("tab", { name: "Groupes" }))
    expect(mocks.goToTab).toHaveBeenLastCalledWith("groupes")
    const menu = screen.getByRole("navigation", { name: "Menu du réseau", hidden: true })
    fireEvent.click(within(menu).getByRole("button", { name: "Relations", hidden: true }))
    expect(mocks.goToTab).toHaveBeenLastCalledWith("relations")
  })

  it("ouvre le composeur de publication EN PLACE depuis la carte épinglée", () => {
    page()
    expect(screen.getByTestId("PostComposerSheet").getAttribute("data-open")).toBe("false")
    fireEvent.click(screen.getByRole("button", { name: "Publier" }))
    expect(screen.getByTestId("PostComposerSheet").getAttribute("data-open")).toBe("true")
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it("U09 : en adaptatif, la porte de publication remplace la carte d'identité ; iCom garde la tête de la colonne droite", () => {
    mocks.adaptive = true
    page()
    expect(screen.queryByTestId("ProfileMiniCard")).toBeNull()
    expect(screen.getByRole("region", { name: "Publier dans le fil" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /^Quoi de neuf/ }))
    expect(screen.getByTestId("PostComposerSheet").getAttribute("data-open")).toBe("true")
    const rail = screen.getByLabelText("iCom et découverte du réseau")
    const modules = Array.from(rail.querySelectorAll("[data-testid]")).map((node) => node.getAttribute("data-testid"))
    expect(modules).toEqual(["MessagerieDock", "SuggestionsPanel", "PagesSuggestionsRail", "EvenementsRail"])
  })
})
