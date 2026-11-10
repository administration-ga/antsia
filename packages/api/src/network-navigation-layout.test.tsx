// U02 : scénarios écrits, non exécutés pendant le gel de vérification.
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type StoreCallbacks = {
  subscribe: (notify: () => void) => () => void
  getSnapshot: () => unknown
  getServerSnapshot?: () => unknown
}

const harness = vi.hoisted(() => ({
  initializedSlug: "antsia" as string | null,
  clientSnapshot: false,
  stores: [] as StoreCallbacks[],
}))

// Le package est testé en node et ne déclare aucun DOM de test. Le fournisseur
// réel construit le contexte ; seul son état local post-migration est posé.
// Le vrai useSyncExternalStore sert toujours le rendu SSR. Pour les transitions
// client, on lit son getSnapshot et exerce explicitement subscribe/cleanup :
// ceci ne prétend pas reproduire l'hydratation ni les effets du renderer DOM.
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>()
  return {
    ...react,
    useState: <T,>(initial: T | (() => T)) => {
      const [value, setValue] = react.useState(initial)
      return [harness.initializedSlug === null ? value : harness.initializedSlug as T, setValue] as const
    },
    useSyncExternalStore: <T,>(subscribe: (notify: () => void) => () => void, getSnapshot: () => T, getServerSnapshot?: () => T): T => {
      harness.stores.push({ subscribe, getSnapshot, getServerSnapshot })
      const serverValue = react.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
      return harness.clientSnapshot ? getSnapshot() : serverValue
    },
  }
})

import type { Id } from "./engine"
import {
  NetworkProvider, networkNavigationMobileQuery, resolveEngineNavigationLayout,
  useNetwork, useNetworkNavigationLayout,
  type EngineNavigation, type EngineNavigationLayout, type EngineRoutes,
} from "./network"

const routes: EngineRoutes = {
  home: () => "/fil",
  messages: () => "/messages",
  stories: () => "/actus",
  profile: handle => `/profil/${handle}`,
  page: handle => `/page/${handle}`,
  conference: sessionId => `/conference/${sessionId}`,
  discover: () => "/explorer",
  me: () => "/moi",
}
type Fixture = { navigation?: EngineNavigation; navigationLayout?: EngineNavigationLayout; routes?: EngineRoutes }

function Probe() {
  const network = useNetwork()
  const { adaptive, mobile } = useNetworkNavigationLayout()
  return <output data-navigation={network.navigation} data-layout={network.navigationLayout}
    data-adaptive={String(adaptive)} data-mobile={mobile === null ? "unknown" : String(mobile)} />
}

function render(options: Fixture = {}): string {
  return renderToStaticMarkup(
    <NetworkProvider networkId={"network-layout-fixture" as Id<"networks">} personId={"person-layout-fixture" as Id<"persons">}
      slug="antsia" charte="antsia" routes={options.routes ?? routes}
      navigation={options.navigation ?? "destinations"} navigationLayout={options.navigationLayout}>
      <Probe />
    </NetworkProvider>,
  )
}

function lastStore(): StoreCallbacks {
  const store = harness.stores.at(-1)
  if (!store) throw new Error("Le hook de navigation n'a pas été rendu.")
  return store
}

function mediaHarness(initialMatches: boolean) {
  const entries = new Map<string, ReturnType<typeof createEntry>>()
  function createEntry() {
    const listeners = new Set<() => void>()
    return {
      listeners,
      media: {
        matches: initialMatches,
        addEventListener: vi.fn((type: string, notify: () => void) => { if (type === "change") listeners.add(notify) }),
        removeEventListener: vi.fn((type: string, notify: () => void) => { if (type === "change") listeners.delete(notify) }),
      },
    }
  }
  function entry(query: string) {
    let current = entries.get(query)
    if (!current) { current = createEntry(); entries.set(query, current) }
    return current
  }
  const matchMedia = vi.fn((query: string) => entry(query).media)
  function emit(query: string, matches: boolean) {
    const current = entry(query)
    if (current.media.matches === matches) return
    current.media.matches = matches
    for (const notify of [...current.listeners]) notify()
  }
  return { entry, matchMedia, emit }
}

beforeEach(() => {
  harness.initializedSlug = "antsia"
  harness.clientSnapshot = false
  harness.stores = []
  vi.stubGlobal("window", undefined)
})
afterEach(() => vi.unstubAllGlobals())

describe("navigation layout — opt-in admis par le fournisseur réel", () => {
  it("garde classic sans demande valide et ne permet jamais adaptive sous volets", () => {
    expect(resolveEngineNavigationLayout(undefined, "destinations")).toBe("classic")
    expect(resolveEngineNavigationLayout("classic", "destinations")).toBe("classic")
    expect(resolveEngineNavigationLayout("wide" as unknown as EngineNavigationLayout, "destinations")).toBe("classic")
    expect(resolveEngineNavigationLayout("adaptive", "volets")).toBe("classic")
    expect(networkNavigationMobileQuery("classic")).toBe("(max-width: 959px)")
    expect(networkNavigationMobileQuery("adaptive")).toBe("(width < 768px)")
  })

  it.each([
    { name: "fixtures historiques sans navigationLayout, labels ou boutiques", options: {}, navigation: "destinations", layout: "classic", query: "(max-width: 959px)" },
    { name: "destinations complètes et opt-in", options: { navigationLayout: "adaptive" as const }, navigation: "destinations", layout: "adaptive", query: "(width < 768px)" },
    { name: "volets avec demande adaptive", options: { navigation: "volets" as const, navigationLayout: "adaptive" as const }, navigation: "volets", layout: "classic", query: "(max-width: 959px)" },
    { name: "destination Explorer absente", options: { navigationLayout: "adaptive" as const, routes: { ...routes, discover: undefined } }, navigation: "volets", layout: "classic", query: "(max-width: 959px)" },
    { name: "destination Profil absente", options: { navigationLayout: "adaptive" as const, routes: { ...routes, me: undefined } }, navigation: "volets", layout: "classic", query: "(max-width: 959px)" },
  ])("$name : contexte et media query concordent", ({ options, navigation, layout, query }) => {
    const media = mediaHarness(true)
    vi.stubGlobal("window", { matchMedia: media.matchMedia })
    harness.clientSnapshot = true
    const html = render(options)
    expect(html).toContain(`data-navigation="${navigation}"`)
    expect(html).toContain(`data-layout="${layout}"`)
    expect(html).toContain(`data-adaptive="${String(layout === "adaptive")}"`)
    expect(html).toContain('data-mobile="true"')
    expect(media.matchMedia).toHaveBeenCalledWith(query)
    expect(lastStore().getSnapshot()).toBe(true)
  })
})

describe("useNetworkNavigationLayout — serveur et largeur inconnue", () => {
  it("le vrai rendu SSR reste null même si un matchMedia téléphone est présent", () => {
    const media = mediaHarness(true)
    vi.stubGlobal("window", { matchMedia: media.matchMedia })
    const html = render({ navigationLayout: "adaptive" })
    expect(html).toContain('data-adaptive="true"')
    expect(html).toContain('data-mobile="unknown"')
    expect(lastStore().getServerSnapshot?.()).toBeNull()
    expect(media.matchMedia).not.toHaveBeenCalled()
  })

  it("la migration initiale du fournisseur ne monte pas encore le hook ni de format supposé", () => {
    harness.initializedSlug = null
    expect(render({ navigationLayout: "adaptive" })).toBe("")
    expect(harness.stores).toHaveLength(0)
  })

  it.each([undefined, {}])("sans API navigateur (%s), le snapshot et l'abonnement restent neutres", browser => {
    vi.stubGlobal("window", browser)
    harness.clientSnapshot = true
    expect(render({ navigationLayout: "adaptive" })).toContain('data-mobile="unknown"')
    const notify = vi.fn()
    const cleanup = lastStore().subscribe(notify)
    expect(lastStore().getSnapshot()).toBeNull()
    expect(() => cleanup()).not.toThrow()
    expect(notify).not.toHaveBeenCalled()
  })
})

describe("useNetworkNavigationLayout — snapshots et abonnements media query", () => {
  it("change téléphone→rail→téléphone, puis retire exactement son écouteur", () => {
    const query = "(width < 768px)", media = mediaHarness(true)
    vi.stubGlobal("window", { matchMedia: media.matchMedia })
    harness.clientSnapshot = true
    expect(render({ navigationLayout: "adaptive" })).toContain('data-mobile="true"')
    const store = lastStore(), notify = vi.fn()
    const cleanup = store.subscribe(notify)
    expect(media.entry(query).listeners.size).toBe(1)
    media.emit(query, false)
    expect(notify).toHaveBeenCalledOnce()
    expect(store.getSnapshot()).toBe(false)
    expect(render({ navigationLayout: "adaptive" })).toContain('data-mobile="false"')
    media.emit(query, true)
    expect(notify).toHaveBeenCalledTimes(2)
    expect(store.getSnapshot()).toBe(true)
    cleanup()
    expect(media.entry(query).media.removeEventListener).toHaveBeenCalledExactlyOnceWith("change", notify)
    expect(media.entry(query).listeners.size).toBe(0)
    media.emit(query, false)
    expect(notify).toHaveBeenCalledTimes(2)
  })

  it("le cleanup d'une ancienne query laisse le nouvel abonnement actif", () => {
    const classicQuery = "(max-width: 959px)", adaptiveQuery = "(width < 768px)", media = mediaHarness(false)
    vi.stubGlobal("window", { matchMedia: media.matchMedia })
    harness.clientSnapshot = true
    render()
    const classicStore = lastStore(), classicNotify = vi.fn()
    const classicCleanup = classicStore.subscribe(classicNotify)
    render({ navigationLayout: "adaptive" })
    const adaptiveStore = lastStore(), adaptiveNotify = vi.fn()
    const adaptiveCleanup = adaptiveStore.subscribe(adaptiveNotify)
    classicCleanup()
    expect(media.entry(classicQuery).listeners.size).toBe(0)
    expect(media.entry(adaptiveQuery).listeners.size).toBe(1)
    media.emit(classicQuery, true)
    expect(classicNotify).not.toHaveBeenCalled()
    expect(adaptiveNotify).not.toHaveBeenCalled()
    media.emit(adaptiveQuery, true)
    expect(adaptiveNotify).toHaveBeenCalledOnce()
    expect(adaptiveStore.getSnapshot()).toBe(true)
    adaptiveCleanup()
    expect(media.entry(adaptiveQuery).listeners.size).toBe(0)
  })
})
