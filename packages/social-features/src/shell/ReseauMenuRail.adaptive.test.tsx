// U02 — scénarios du rail adaptatif ; U09 (épure) : destinations, Boutiques, Créer, Réglages.
// @vitest-environment jsdom

import { NetworkProvider, type EngineNavigation, type EngineNavigationLayout, type EngineRoutes } from "@antsia/api/network"
import { RouterProvider } from "@antsia/api/routing"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import type { ReactElement } from "react"
import { I18nextProvider } from "react-i18next"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { createAppI18n } from "../i18n"
import { memoryRouter, TEST_NETWORK_ID, TEST_PERSON_ID, TEST_ROUTES } from "../tests/engine-wrapper"
import { AppearanceProvider } from "./appearance"
import { RESEAU_MENU_RAIL_ADAPTIVE_CSS } from "./reseau-menu-rail-styles"

const mocks = vi.hoisted(() => ({
  published: true,
  unread: 0,
  pages: [{ pageId: "page-test", handle: "atelier", name: "Atelier local", logoUrl: null }],
  ownPages: [] as { pageId: string; handle: string; name: string; logoUrl: null }[],
  groups: [{ groupId: "group-test", name: "Entraide locale" }],
}))

vi.mock("@antsia/api/engine", () => ({
  api: { modules: {
    people: { persons: { getMyPerson: "getMyPerson" } },
    pages: { pages: { paginateMyPageFollows: "paginateMyPageFollows", myPages: "myPages" } },
    thematicGroups: { thematicGroups: { myGroups: "myGroups" } },
  } },
}))

vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: (reference: string) => reference === "getMyPerson"
    ? { data: { published: mocks.published, handle: "awa.ndong", displayName: "Awa NDONG", avatar: null }, isLoading: false, isError: false }
    : reference === "myPages" ? { data: mocks.ownPages, isLoading: false, isError: false }
    : { data: { items: mocks.groups, truncated: false }, isLoading: false, isError: false },
  useAuthenticatedPaginatedQuery: () => ({ results: mocks.pages, status: "Exhausted", loadMore: vi.fn(), isLoading: false }),
}))

vi.mock("./reseau-menu-destinations-ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./reseau-menu-destinations-ui")>()),
  useMessagesUnreadTotal: () => mocks.unread,
}))

import { ReseauMenuRail } from "./ReseauMenuRail"

const ROUTES: EngineRoutes = {
  ...TEST_ROUTES,
  discover: () => "/explorer",
  me: () => "/moi",
  settings: () => "/reglages-test",
  shops: () => "/explorer#boutiques",
}
const mediaListeners = new Set<(event: MediaQueryListEvent) => void>()
const RAIL_ROUTER = memoryRouter({ pathname: TEST_ROUTES.home() }).implementation
let viewportWidth = 768

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", { writable: true, value: (query: string) => ({
    matches: query === "(width < 768px)" ? viewportWidth < 768 : query === "(max-width: 959px)" ? viewportWidth <= 959 : false,
    media: query,
    onchange: null,
    addEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => mediaListeners.add(listener),
    removeEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => mediaListeners.delete(listener),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: () => false,
  }) })
})

beforeEach(() => {
  viewportWidth = 768
  mocks.published = true
  mocks.unread = 0
  mocks.ownPages = []
})

function rail(ui: ReactElement, options: {
  navigation?: EngineNavigation
  layout?: EngineNavigationLayout
  routes?: EngineRoutes
  shopsLabel?: string | null
  myShopLabel?: string
  clipsLabel?: string
  pathname?: string
  search?: string
} = {}): ReactElement {
  const i18n = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "social" })
  return <I18nextProvider i18n={i18n}>
    <RouterProvider implementation={options.pathname === undefined ? RAIL_ROUTER : memoryRouter({ pathname: options.pathname, search: options.search }).implementation}>
      <AppearanceProvider storagePrefix="test:adaptive-rail">
        <NetworkProvider networkId={TEST_NETWORK_ID} personId={TEST_PERSON_ID} slug="test" charte="antsia"
          routes={options.routes ?? ROUTES} navigation={options.navigation ?? "destinations"} navigationLayout={options.layout ?? "adaptive"}
          navigationLabels={options.shopsLabel === null ? undefined : { shops: options.shopsLabel ?? "Boutiques", clips: options.clipsLabel, myShop: options.myShopLabel }} liveAvailable>
          {ui}
        </NetworkProvider>
      </AppearanceProvider>
    </RouterProvider>
  </I18nextProvider>
}

describe("ReseauMenuRail — capacité adaptative U02", () => {
  it("sert les cinq lieux finaux et conserve un vrai choix Créer séparé", () => {
    const create = vi.fn()
    render(rail(<ReseauMenuRail activeTab="fil" onCreate={create} />, { routes: { ...ROUTES, clips: () => "/clips-test" }, clipsLabel: "Clips" }))
    const primary = screen.getByRole("navigation", { name: "Navigation principale" })
    expect(within(within(primary).getByRole("list")).getAllByRole("link").map(link => link.getAttribute("title"))).toEqual(["Fil", "Clips", "Messages", "Découvrir", "Profil"])
    const trigger = screen.getByRole("button", { name: "Créer" })
    fireEvent.click(trigger)
    fireEvent.click(within(screen.getByRole("group", { name: "Formats" })).getByRole("button", { name: /Actu/ }))
    expect(create).toHaveBeenCalledWith("actu")
    expect(document.activeElement).toBe(trigger)
  })
  it("« Ma boutique » suit Boutiques pour qui gère déjà une boutique, et seulement avec sa route", () => {
    const routes = { ...ROUTES, myActivity: () => "/mes-activites-test" }
    const managing = render(rail(<ReseauMenuRail activeTab="fil" />, { routes, myShopLabel: "Ma boutique" }))
    const primary = screen.getByRole("navigation", { name: "Navigation principale" })
    expect(within(primary).getByRole("link", { name: "Ma boutique" }).getAttribute("href")).toBe("/mes-activites-test")
    managing.unmount()
    // Sans libellé (la personne ne gère aucune boutique) ou sans route servie : aucune entrée.
    const none = render(rail(<ReseauMenuRail activeTab="fil" />, { routes }))
    expect(screen.queryByRole("link", { name: "Ma boutique" })).toBeNull()
    none.unmount()
    render(rail(<ReseauMenuRail activeTab="fil" />, { myShopLabel: "Ma boutique" }))
    expect(screen.queryByRole("link", { name: "Ma boutique" })).toBeNull()
  })

  it("U09 : ne garde que les destinations, Boutiques, Créer et Réglages, sans doublon", () => {
    const { container } = render(rail(<ReseauMenuRail activeTab="groupes" onSelectTab={vi.fn()} onCreate={vi.fn()} />))
    expect(container.querySelector('[data-reseau-menu-layout="adaptive"]')).toBeTruthy()
    const primary = screen.getByRole("navigation", { name: "Navigation principale" })
    expect(within(primary).getAllByRole("listitem").map(item => item.textContent)).toEqual(["Fil", "Découvrir", "Créer", "Messages", "ANProfil"])
    // Boutiques appartient à l'espace Activité, après les destinations sociales.
    const shops = within(primary).getByRole("link", { name: "Boutiques" })
    expect(shops).toHaveAttribute("href", ROUTES.shops!())
    expect(shops.style.minHeight).toBe("44px")
    // Réglages : seule entrée du pied de rail.
    const network = screen.getByRole("navigation", { name: "Menu du réseau" })
    expect(within(network).getAllByRole("link").map(link => link.textContent)).toEqual(["Paramètres"])
    expect(within(network).getByRole("link", { name: "Paramètres" })).toHaveAttribute("href", ROUTES.settings!())
    // « Dans le réseau », les raccourcis, la carte d'identité et l'apparence quittent le rail.
    for (const label of ["Relations", "Groupes", "Pages", "Conférences", "Évènements", "Enregistrements"]) {
      expect(screen.queryByRole("button", { name: label })).toBeNull()
    }
    expect(screen.queryByRole("link", { name: "Atelier local" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Entraide locale" })).toBeNull()
    expect(container.querySelector(".rmr-identity")).toBeNull()
    expect(container.querySelector(".rmr-appearance-controls")).toBeNull()
    expect(screen.queryByRole("combobox", { name: "Apparence" })).toBeNull()
  })

  it("sépare Réseau social, Activité et Page puis les réglages, avec les portes de création sans activité ni page", () => {
    const activity = () => "/mes-activites-test"
    const { container } = render(rail(<ReseauMenuRail activeTab="fil" onCreate={vi.fn()} />, { routes: { ...ROUTES, myActivity: activity } }))
    expect(screen.getAllByRole("heading", { level: 2 }).map(heading => heading.textContent)).toEqual(["Réseau social", "Activité", "Page"])
    const activitySection = screen.getByRole("region", { name: "Activité" })
    expect(within(activitySection).getByRole("link", { name: "Créer une activité" })).toHaveAttribute("href", activity())
    expect(within(activitySection).getByRole("link", { name: "Boutiques" })).toBeTruthy()
    const pageSection = screen.getByRole("region", { name: "Page" })
    expect(within(pageSection).getByRole("link", { name: "Créer une page" })).toHaveAttribute("href", `${TEST_ROUTES.home()}?tab=pages`)
    expect(within(pageSection).queryByRole("link", { name: "Atelier local" })).toBeNull()
    const links = Array.from(container.querySelectorAll("a"))
    expect(links.at(-1)?.textContent).toBe("Paramètres")
  })

  it("présente uniquement les pages dont le membre possède un mandat, sans confondre ses abonnements", () => {
    mocks.ownPages = [{ pageId: "mine", handle: "ma-page", name: "Ma page locale", logoUrl: null }]
    render(rail(<ReseauMenuRail activeTab="fil" />, { routes: { ...ROUTES, myActivity: () => "/mes-activites-test" }, myShopLabel: "Ma boutique" }))
    const pageSection = screen.getByRole("region", { name: "Page" })
    expect(within(pageSection).getByRole("link", { name: "Mes pages" })).toHaveAttribute("href", `${TEST_ROUTES.home()}?tab=pages`)
    expect(within(pageSection).getByRole("link", { name: "Ma page locale" })).toHaveAttribute("href", TEST_ROUTES.page("ma-page"))
    expect(within(pageSection).queryByRole("link", { name: "Atelier local" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Créer une activité" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Créer une page" })).toBeNull()
  })

  it.each([
    { pathname: TEST_ROUTES.home(), search: "?tab=pages", id: "decouvrir" as const, label: "Créer une page" },
    { pathname: "/marketplace-test", id: "decouvrir" as const, label: "Boutiques" },
    { pathname: "/mes-activites-test", id: "profil" as const, label: "Créer une activité" },
    { pathname: ROUTES.settings!(), id: "profil" as const, label: "Paramètres" },
  ])("n'allume que $label, sans conserver son ancien rattachement social", ({ pathname, search, id, label }) => {
    const { container } = render(rail(<ReseauMenuRail activeTab={null} current={{ id, current: "section" }} />, {
      pathname, search,
      routes: { ...ROUTES, shops: () => "/marketplace-test", myActivity: () => "/mes-activites-test" },
    }))
    const selected = screen.getByRole("link", { name: label })
    expect(selected).toHaveAttribute("aria-current", "page")
    expect(Array.from(container.querySelectorAll("[aria-current]"))).toEqual([selected])
  })

  it("garde les mêmes éléments interactifs entre 768 et 1200 sans second arbre ni perte du choix Créer", () => {
    const create = vi.fn()
    const { rerender } = render(rail(<ReseauMenuRail activeTab="fil" onCreate={create} />))
    const trigger = screen.getByRole("button", { name: "Créer" })
    const profile = screen.getByRole("link", { name: "Profil" })
    expect(profile).toHaveAttribute("href", ROUTES.me!())
    // U09 : la photo (ici les initiales) tient lieu d'icône ; le nom accessible reste « Profil ».
    expect(profile.textContent).toBe("ANProfil")
    for (const width of [1199, 1200, 768]) {
      act(() => { viewportWidth = width; for (const listener of mediaListeners) listener({ matches: false } as MediaQueryListEvent) })
      rerender(rail(<ReseauMenuRail activeTab="fil" onCreate={create} />))
      expect(screen.getByRole("button", { name: "Créer" })).toBe(trigger)
      expect(screen.getByRole("link", { name: "Profil" })).toBe(profile)
      expect(screen.getAllByRole("navigation", { name: "Navigation principale" })).toHaveLength(1)
    }
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute("aria-expanded", "true")
    fireEvent.click(within(screen.getByRole("group", { name: "Formats" })).getByRole("button", { name: /Actu/ }))
    expect(create).toHaveBeenCalledWith("actu")
    expect(screen.queryByRole("group", { name: "Formats" })).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it("préserve le nom de décompte et le badge plafonné de Messages quand les labels sont masqués visuellement", () => {
    mocks.unread = 99
    render(rail(<ReseauMenuRail activeTab="relations" counts={{ invitations: 105 }} onSelectTab={vi.fn()} />))
    const messages = screen.getByRole("link", { name: "Messages 99 conversations non lues" })
    expect(messages.querySelector('.rmr-badge [aria-hidden="true"]')?.textContent).toBe("99+")
    // U09 : les invitations se signalent dans le fil et par la cloche, plus dans un volet du rail.
    expect(screen.queryByRole("button", { name: /Relations/ })).toBeNull()
  })

  it("reste une navigation par liens hors fil et ne montre jamais une identité non publiée", () => {
    mocks.published = false
    const { container } = render(rail(<ReseauMenuRail activeTab={null} onCreate={vi.fn()} />))
    expect(screen.queryByRole("link", { name: /Awa NDONG/ })).toBeNull()
    expect(container.textContent).not.toContain("awa.ndong")
    expect(screen.getByRole("link", { name: "Profil" })).toHaveAttribute("href", ROUTES.me!())
    expect(screen.getByRole("link", { name: "Découvrir" })).toHaveAttribute("href", ROUTES.discover!())
  })

  it.each([
    { navigation: "volets" as const, layout: "adaptive" as const },
    { navigation: "destinations" as const, layout: "classic" as const },
  ])("ne compacte pas la présentation historique $navigation/$layout malgré la route Boutiques", options => {
    const { container } = render(rail(<ReseauMenuRail activeTab="fil" onSelectTab={vi.fn()} />, options))
    expect(container.querySelector('[data-reseau-menu-layout="adaptive"]')).toBeNull()
    expect(screen.queryByRole("link", { name: "Boutiques" })).toBeNull()
    expect(screen.getByRole("combobox", { name: "Apparence" })).toBeTruthy()
  })

  it("retire uniquement le raccourci Boutique si route ou libellé injecté manque", () => {
    const withoutShop: EngineRoutes = { ...ROUTES, shops: undefined }
    const view = render(rail(<ReseauMenuRail activeTab="fil" />, { routes: withoutShop }))
    expect(screen.queryByRole("link", { name: "Boutiques" })).toBeNull()
    view.unmount()
    const empty = render(rail(<ReseauMenuRail activeTab="fil" />, { shopsLabel: "   " }))
    expect(screen.queryByRole("link", { name: "Boutiques" })).toBeNull()
    expect(screen.getByRole("link", { name: "Découvrir" })).toBeTruthy()
    empty.unmount()
    render(rail(<ReseauMenuRail activeTab="fil" />, { shopsLabel: null }))
    expect(screen.queryByRole("link", { name: "Boutiques" })).toBeNull()
  })

  it("garde le sélecteur d'apparence historique si aucune page de réglages n'est servie", () => {
    render(rail(<ReseauMenuRail activeTab="fil" />, { routes: { ...ROUTES, settings: undefined } }))
    expect(screen.getByRole("combobox", { name: "Apparence" })).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Apparence" })).toBeNull()
  })

  it("borne le seul masquage visuel à 768–1199 et garde le label dans l'arbre accessible", () => {
    expect(RESEAU_MENU_RAIL_ADAPTIVE_CSS).toContain("@media (min-width: 768px) and (max-width: 1199px)")
    expect(RESEAU_MENU_RAIL_ADAPTIVE_CSS).toContain('[data-reseau-menu-layout="adaptive"] .rmr-label')
    expect(RESEAU_MENU_RAIL_ADAPTIVE_CSS).toContain("clip-path: inset(50%)")
    const labels = RESEAU_MENU_RAIL_ADAPTIVE_CSS.match(/\.rmr-section-title\s*\{([^}]+)\}/)?.[1]
    expect(labels).toBeDefined()
    expect(labels).not.toContain("display: none")
    expect(labels).not.toContain("visibility: hidden")
  })

  it("réserve la porte Apparence au compact et conserve l'unique contrôle dans le rail large", () => {
    const compact = RESEAU_MENU_RAIL_ADAPTIVE_CSS.split("@media (min-width: 768px) and (max-width: 1199px)")[1]
    expect(RESEAU_MENU_RAIL_ADAPTIVE_CSS).toContain('.rmr-appearance-link {\n  display: none !important;')
    expect(compact).toContain('.rmr-appearance-controls {\n    display: none;')
    expect(compact).toContain('.rmr-appearance-link {\n    display: flex !important;')
  })
})
