// @vitest-environment jsdom
import { act, useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ pathname: "/boutique/atelier", food: false, signingOut: false, cartLines: 0, mounted: vi.fn(), unmounted: vi.fn() }))

vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: { shops: { storefront: "storefront" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "network-a", personId: "person-a" }) }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: () => ({ isError: false, data: state.food ? { model: "products", activityConfiguration: { version: 1, capabilities: ["products"], template: "food", blocks: ["catalog", "about"] } } : null }) }))
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }))
vi.mock("next/link", () => ({
  default: ({ href, children, className, onClick, "aria-label": label, "aria-current": current, "data-destination-item": destination }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode; "data-destination-item"?: string }) => <a data-destination-item={destination} href={href} className={className} onClick={onClick} aria-label={label} aria-current={current}>{children}</a>,
}))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => state.signingOut }))
vi.mock("@antsia/social-features/shell/appearance", () => ({ AppearanceToggle: () => <button type="button" aria-label="Apparence">Apparence</button> }))
// La marque de l'activité et le nombre de lignes du panier ont leurs propres tests : ici, le libellé de l'espace et aucun panier.
vi.mock("./specialized-space-identity", () => ({ SpaceIdentity: ({ fallback }: { fallback: string }) => <span>{fallback}</span>, SpaceCartCount: ({ count }: { count: number }) => <span aria-hidden="true" data-space-cart-count>{count}</span>, useCartLines: () => state.cartLines }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => {
  const labels: Record<string, string> = {
    returnToAntsia: "Retour à ANTSIA", shopSpace: "Espace boutique", serviceSpace: "Espace services",
    "mobile.social": "Page", "mobile.home": "Accueil", "mobile.requests": "Demandes", "mobile.profile": "Profil pro", "mobile.collaborations": "Collaborer", "mobile.activities": "Activités", "mobile.media": "Médias",
    navigation: "Navigation de l’activité", messages: "iCom Pro", "nav.home": "Accueil", "nav.catalog": "Catalogue", "food.menu": "Menu", "nav.cart": "Panier", "nav.social": "Page sociale", "nav.providerHome": "Présentation", "nav.services": "Prestations", "nav.requests": "Mes demandes",
  }
  return key === "nav.cartCount" ? `Panier : ${options?.count} lignes` : labels[key] ?? key
} }) }))

import { routes, specializedShopRoute, type SpecializedShopRoute } from "@/lib/routes"
import { specializedReturnKey, writeSpecializedReturn } from "@/lib/specialized-navigation"
import { SpecializedNavigationBoundary } from "./specialized-navigation"
import { SpecializedEditorialPage, SpecializedPage, SpecializedProfessionalPage } from "./specialized-page"

const owner = { networkId: "network-a", personId: "person-a" }
let host: HTMLDivElement | undefined
let root: Root | undefined

function StatefulContent() {
  const [count, setCount] = useState(0)
  useEffect(() => { state.mounted(); return () => { state.unmounted() } }, [])
  return <button type="button" data-content="" onClick={() => setCount(value => value + 1)}>Sélection {count}</button>
}

async function render(content: ReactNode) {
  if (!host) {
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
  }
  await act(async () => { root?.render(content) })
  return host
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  state.pathname = routes.storefront("atelier")
  state.signingOut = false
  state.food = false
  state.cartLines = 0
  window.history.replaceState(null, "", state.pathname)
  window.sessionStorage.clear()
})

afterEach(async () => {
  await act(async () => { root?.unmount() })
  host?.remove()
  root = undefined
  host = undefined
  window.sessionStorage.clear()
  vi.unstubAllGlobals()
})

/** Le clic natif est émis après activation souris ou clavier ; la navigation
 * réelle est remplacée ici par le changement d'adresse explicite du harnais. */
async function activate(link: HTMLAnchorElement, init: MouseEventInit = {}) {
  link.addEventListener("click", event => { event.preventDefault() }, { once: true })
  link.focus()
  await act(async () => { link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init })) })
}

function SocialOrigin({ href = routes.shopOffer("atelier", "demo:offer:veste"), target, anchored = true }: { href?: string; target?: string; anchored?: boolean }) {
  return <main id="contenu" tabIndex={-1}><article data-feed-anchor={anchored ? "post-source" : undefined}><a data-source-offer="" href={href} target={target}>Découvrir la veste</a></article></main>
}

async function renderJourney(href: string, source?: { href?: string; target?: string; anchored?: boolean }) {
  window.history.replaceState(null, "", href)
  state.pathname = window.location.pathname
  const space = specializedShopRoute(state.pathname)
  return render(<SpecializedNavigationBoundary owner={owner}>{space ? <SpecializedPage space={space}><p>Catalogue marchand</p></SpecializedPage> : <SocialOrigin {...source} />}</SpecializedNavigationBoundary>)
}

function returnLink(container: HTMLElement): HTMLAnchorElement | undefined {
  return Array.from(container.querySelectorAll("a")).find(link => link.textContent === "Retour à ANTSIA")
}

describe("MP01 — coque spécialisée de boutique", () => {
  it("MP09 : une seule navigation professionnelle conserve l'origine sociale", async () => {
    const origin = "/fil?post=post-source"
    state.pathname = "/fil"
    window.history.replaceState(null, "", origin)
    const entry = routes.professionals()
    await render(<SpecializedNavigationBoundary owner={owner}><SocialOrigin href={entry} /></SpecializedNavigationBoundary>)
    await activate(host!.querySelector("a[data-source-offer]")!)
    state.pathname = entry
    window.history.pushState(null, "", entry)
    await render(<SpecializedNavigationBoundary owner={owner}><SpecializedProfessionalPage><StatefulContent /></SpecializedProfessionalPage></SpecializedNavigationBoundary>)
    expect(host!.querySelectorAll("main")).toHaveLength(1)
    expect(host!.querySelectorAll("nav")).toHaveLength(1)
    const links = [...host!.querySelectorAll("nav a")].map(node => node.getAttribute("href"))
    expect(links).toEqual([routes.professionals(), routes.professionalEditor(), routes.professionalCollaborations(), routes.myShops()])
    expect([...host!.querySelectorAll("a")].find(node => node.textContent === "Retour à ANTSIA")?.getAttribute("href")).toBe(origin)
  })

  it("MP06 : conserve le retour lors d'un remontage du même compte et purge au changement de titulaire", async () => {
    const origin = routes.marketplace({ view: "services", languageCode: ["fr"] })
    writeSpecializedReturn(window.sessionStorage, owner, origin, Date.now(), () => true)
    const content = (personId = owner.personId) => <SpecializedNavigationBoundary owner={{ ...owner, personId }}><SpecializedPage space={{ handle: "atelier", section: "home", provider: true }}><p>Prestataire</p></SpecializedPage></SpecializedNavigationBoundary>
    await render(content())
    await act(async () => root?.unmount())
    host?.remove(); root = undefined; host = undefined
    const container = await render(content())
    expect(returnLink(container)?.getAttribute("href")).toBe(origin)
    await render(content("person-b"))
    expect(returnLink(container)?.getAttribute("href")).toBe(routes.feed())
    expect(window.sessionStorage.getItem(specializedReturnKey(owner))).toBeNull()
  })

  it("rend une seule navigation métier et une zone principale, avec des liens nommés", async () => {
    const container = await render(<SpecializedPage space={{ handle: "atelier", section: "home" }}><p>Vitrine</p></SpecializedPage>)
    expect(container.querySelectorAll("main#contenu")).toHaveLength(1)
    expect(container.querySelector("main")?.getAttribute("tabindex")).toBe("-1")
    expect(container.querySelectorAll("nav")).toHaveLength(1)
    expect(container.querySelector("nav")?.getAttribute("aria-label")).toBe("Navigation de l’activité")
    const names = ["Accueil", "Catalogue", "Panier", "Page sociale"]
    const destinations = [routes.storefront("atelier"), routes.shopCatalog("atelier"), routes.cart(), routes.page("atelier")]
    const links = Array.from(container.querySelectorAll("nav a"))
    expect(links.map(link => link.getAttribute("aria-label"))).toEqual(names)
    expect(links.map(link => link.getAttribute("href"))).toEqual(destinations)
    expect(container.querySelector('a[aria-current="page"]')?.getAttribute("href")).toBe(routes.storefront("atelier"))
    // ADR-0036 : depuis un espace pro, la messagerie ouvre iCom Pro.
    expect(container.querySelector('a[aria-label="iCom Pro"]')?.getAttribute("href")).toBe(`${routes.messages()}?espace=pro`)
    expect(container.querySelector('[aria-label="Apparence"]')).not.toBeNull()
    expect(container.querySelector("[data-specialized-space]")?.getAttribute("data-specialized-space")).toBe("shop")
  })

  it("range une fiche de produit sous le Menu et garde les noms complets avec les libellés courts", async () => {
    state.food = true
    state.cartLines = 3
    state.pathname = routes.shopOffer("atelier", "pro.ga:offer:riz")
    const container = await render(<SpecializedPage space={{ handle: "atelier", section: "offer" }}><p>Riz</p></SpecializedPage>)
    expect(container.querySelectorAll('nav [aria-current="page"]')).toHaveLength(1)
    expect(container.querySelector('nav [aria-current="page"]')?.getAttribute("aria-label")).toBe("Menu")
    const cart = container.querySelector(`nav a[href="${routes.cart()}"]`)!
    expect(cart.getAttribute("aria-label")).toBe("Panier : 3 lignes")
    expect(cart.querySelector("[data-space-cart-count]")?.getAttribute("aria-hidden")).toBe("true")
    const social = container.querySelector(`nav a[href="${routes.page("atelier")}"]`)!
    expect(social.getAttribute("aria-label")).toBe("Page sociale")
    expect(social.querySelector("[data-destination-label]")?.textContent).toBe("Page")
    expect(social.querySelector("[data-destination-desktop-label]")?.textContent).toBe("Page sociale")
    expect(container.querySelectorAll("nav")).toHaveLength(1)
  })

  it("MP06 : une présentation de prestataire garde sa navigation et ses destinations de service", async () => {
    state.pathname = routes.providerCatalog("atelier").split("?")[0]!
    const container = await render(<SpecializedPage space={{ handle: "atelier", section: "catalog", provider: true }}><p>Prestations</p></SpecializedPage>)
    expect(container.querySelector("[data-specialized-space]")?.getAttribute("data-specialized-space")).toBe("provider")
    const links = [...container.querySelectorAll("nav a")]
    expect(links.map(link => link.getAttribute("href"))).toEqual([routes.provider("atelier"), routes.providerCatalog("atelier"), routes.serviceRequests(), routes.page("atelier")])
    expect(links.filter(link => link.getAttribute("aria-current") === "page").map(link => link.textContent)).toEqual(["Prestations"])
    expect(container.querySelectorAll("main")).toHaveLength(1)
  })

  it("un accès direct expose un retour sûr au fil, sans dépendre d'un fournisseur de compte", () => {
    const html = renderToStaticMarkup(<SpecializedPage space={{ handle: "atelier", section: "catalog" }}><p>Catalogue</p></SpecializedPage>)
    expect(html).toContain(`href="${routes.feed()}"`)
    expect(html).toContain("Retour à ANTSIA")
    expect(html.match(/<main\b/g)).toHaveLength(1)
    expect(html.match(/<nav\b/g)).toHaveLength(1)
  })

  it("marque la destination courante et distingue l'espace de services", async () => {
    state.pathname = routes.shopCatalog("atelier")
    const container = await render(<SpecializedPage space={{ handle: "atelier", section: "catalog" }}><p>Catalogue</p></SpecializedPage>)
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    expect(container.querySelector('[aria-current="page"]')?.getAttribute("aria-label")).toBe("Catalogue")
    state.pathname = routes.serviceQuote("atelier", "pro.ga:offer:abc")
    await render(<SpecializedPage space={{ handle: "atelier", section: "service" }}><p>Demande</p></SpecializedPage>)
    expect(container.textContent).toContain("Espace services")
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    expect(container.querySelector('[aria-current="page"]')?.getAttribute("aria-label")).toBe("Prestations")
  })

  it("préserve le même contenu et sa sélection à travers les formats et les sections", async () => {
    const renderFormat = async (width: number, section: SpecializedShopRoute["section"]) => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width })
      await act(async () => { window.dispatchEvent(new Event("resize")) })
      return render(<SpecializedPage space={{ handle: "atelier", section }}><StatefulContent /></SpecializedPage>)
    }
    const container = await renderFormat(390, "home")
    const main = container.querySelector("main")
    const content = container.querySelector<HTMLButtonElement>("[data-content]")
    await act(async () => { content?.click() })
    expect(content?.textContent).toBe("Sélection 1")
    for (const [width, section] of [[834, "catalog"], [1440, "offer"], [320, "service"]] as const) {
      await renderFormat(width, section)
      expect(container.querySelector("main")).toBe(main)
      expect(container.querySelector("[data-content]")).toBe(content)
      expect(content?.textContent).toBe("Sélection 1")
      expect(container.querySelectorAll("main")).toHaveLength(1)
      expect(container.querySelectorAll("nav")).toHaveLength(1)
      expect(container.querySelectorAll("[data-content]")).toHaveLength(1)
      expect(state.mounted).toHaveBeenCalledOnce()
      expect(state.unmounted).not.toHaveBeenCalled()
    }
  })

  it("retrouve l'origine sociale admissible de la personne dans sa frontière persistante", async () => {
    const origin = `${routes.memberDiscover()}?q=mode#boutiques`
    writeSpecializedReturn(window.sessionStorage, owner, origin, Date.now(), () => true)
    const container = await render(<SpecializedNavigationBoundary owner={owner}><SpecializedPage space={{ handle: "atelier", section: "home" }}><p>Vitrine</p></SpecializedPage></SpecializedNavigationBoundary>)
    expect(Array.from(container.querySelectorAll("a")).find(link => link.textContent === "Retour à ANTSIA")?.getAttribute("href")).toBe(origin)
  })

  it("capture le post filtré, conserve cette origine dans le catalogue et rend le focus à son lien au retour", async () => {
    const frames = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { const id = ++frameId; frames.set(id, callback); return id })
    vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames.delete(id) })
    const scrollTo = vi.fn()
    vi.stubGlobal("scrollTo", scrollTo)
    const origin = `${routes.feed()}?portee=national&tag=mode&post=post-source`
    const container = await renderJourney(origin)
    const entrance = container.querySelector<HTMLAnchorElement>("[data-source-offer]")!
    await activate(entrance, { detail: 1 })
    expect(JSON.parse(window.sessionStorage.getItem(specializedReturnKey(owner))!).href).toBe(origin)

    await renderJourney(routes.shopOffer("atelier", "demo:offer:veste"))
    expect(returnLink(container)?.getAttribute("href")).toBe(origin)
    await activate(container.querySelector<HTMLAnchorElement>('nav a[aria-label="Catalogue"]')!)
    await renderJourney(routes.shopCatalog("atelier", { query: "veste" }))
    expect(returnLink(container)?.getAttribute("href")).toBe(origin)
    expect(JSON.parse(window.sessionStorage.getItem(specializedReturnKey(owner))!).href).toBe(origin)

    await activate(returnLink(container)!)
    await renderJourney(origin)
    await act(async () => {
      for (const [id, callback] of [...frames]) { frames.delete(id); callback(0) }
    })
    expect(window.location.pathname + window.location.search).toBe(origin)
    expect(document.activeElement).toBe(container.querySelector("[data-source-offer]"))
    expect(container.querySelectorAll("main#contenu")).toHaveLength(1)
    // La position du post reste sous l'autorité de la restauration P04.
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it("MP04 restaure les filtres, la position et le lien de la marketplace sans ancre de publication", async () => {
    const frames = new Map<number, FrameRequestCallback>()
    let sequence = 0
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence })
    vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames.delete(id) })
    const scrollTo = vi.fn()
    vi.stubGlobal("scrollTo", scrollTo)
    const height = vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(5000)
    const origin = routes.marketplace({ view: "products", material: ["Lin", "Coton"], minPrice: 2500, cursor: "page-bornee" })
    try {
      const container = await renderJourney(origin, { anchored: false })
      await activate(container.querySelector<HTMLAnchorElement>("[data-source-offer]")!, { detail: 0 })
      await renderJourney(routes.shopOffer("atelier", "demo:offer:veste"))
      expect(returnLink(container)?.getAttribute("href")).toBe(origin)
      await activate(returnLink(container)!)
      await renderJourney(origin, { anchored: false })
      await act(async () => { for (const [id, callback] of [...frames]) { frames.delete(id); callback(0) } })
      expect(document.activeElement).toBe(container.querySelector("[data-source-offer]"))
      expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" })
      expect(window.location.pathname + window.location.search).toBe(origin)
    } finally { height.mockRestore() }
  })

  it("une nouvelle activation clavier remplace l'origine précédente par ses filtres courants", async () => {
    const previous = `${routes.feed()}?post=ancien-post`
    const origin = `${routes.clips()}?auteur=awa.demo&curseur=page-suivante`
    writeSpecializedReturn(window.sessionStorage, owner, previous, Date.now(), () => true)
    const container = await renderJourney(origin)
    await activate(container.querySelector<HTMLAnchorElement>("[data-source-offer]")!, { detail: 0 })
    await renderJourney(routes.shopOffer("atelier", "demo:offer:veste"))
    expect(returnLink(container)?.getAttribute("href")).toBe(origin)
    expect(JSON.parse(window.sessionStorage.getItem(specializedReturnKey(owner))!).href).toBe(origin)
  })

  it.each([
    { label: "un lien externe", href: "https://external.example/boutique/atelier", target: undefined, ctrlKey: false, signingOut: false },
    { label: "un nouvel onglet", href: routes.storefront("atelier"), target: "_blank", ctrlKey: false, signingOut: false },
    { label: "un clic modifié", href: routes.storefront("atelier"), target: undefined, ctrlKey: true, signingOut: false },
    { label: "une sortie en cours", href: routes.storefront("atelier"), target: undefined, ctrlKey: false, signingOut: true },
  ])("n'enregistre aucune origine pour $label", async ({ href, target, ctrlKey, signingOut }) => {
    const container = await renderJourney(`${routes.feed()}?post=post-source`, { href, target })
    state.signingOut = signingOut
    await activate(container.querySelector<HTMLAnchorElement>("[data-source-offer]")!, { ctrlKey })
    expect(window.sessionStorage.getItem(specializedReturnKey(owner))).toBeNull()
  })

  it.each([
    { href: "https://example.test", age: 0, personId: owner.personId },
    { href: "/fil?post=a&post=b", age: 0, personId: owner.personId },
    { href: "/messages/secret", age: 0, personId: owner.personId },
    { href: "/fil", age: 30 * 60_000, personId: owner.personId },
    { href: "/fil", age: 0, personId: "person-b" },
  ])("revient au fil lorsque l'origine stockée est externe, privée, expirée ou étrangère", async ({ href, age, personId }) => {
    window.sessionStorage.setItem(specializedReturnKey(owner), JSON.stringify({ version: 1, ...owner, personId, href, recordedAt: Date.now() - age }))
    const container = await render(<SpecializedNavigationBoundary owner={owner}><SpecializedPage space={{ handle: "atelier", section: "home" }}><p>Vitrine</p></SpecializedPage></SpecializedNavigationBoundary>)
    expect(Array.from(container.querySelectorAll("a")).find(link => link.textContent === "Retour à ANTSIA")?.getAttribute("href")).toBe(routes.feed())
    expect(window.sessionStorage.getItem(specializedReturnKey(owner))).toBeNull()
  })
})

/** Une classe Tailwind : ses variantes (`min-[768px]`, `sm:max-[768px]`…) et son utilitaire. */
function splitClass(name: string): { variants: string; utility: string } {
  const parts = name.split(/:(?![^[]*\])/u)
  return { variants: parts.slice(0, -1).join(":"), utility: parts.at(-1)! }
}

const classNames = (element: Element | null | undefined) => element?.getAttribute("class")?.split(/\s+/u).filter(Boolean) ?? []

/** Les retraits horizontaux d'un élément, rangés par variantes (`""` : sans variante). */
function inlinePaddings(element: Element | null | undefined): Record<string, string[]> {
  const paddings: Record<string, string[]> = {}
  for (const name of classNames(element)) {
    const { variants, utility } = splitClass(name)
    if (/^(?:p|px|pl|pr|ps|pe)-/u.test(utility)) (paddings[variants] ??= []).push(utility)
  }
  return paddings
}

/**
 * Gouttière unique (règle des pages de membre du 22/10/2026, member-navigation-styles.test) :
 * dès 768 px, la marge extérieure, l'écart entre le rail et le contenu et le retrait de la
 * barre de l'espace valent le jeton `--spacing-gutter`, sans largeur maximale centrée. Les
 * largeurs rendues se mesurent dans le navigateur ; ici, la structure qui les garantit.
 */
describe("gouttière unique des espaces spécialisés", () => {
  it.each([
    ["boutique", <SpecializedPage key="shop" space={{ handle: "atelier", section: "home" }}><p>Vitrine</p></SpecializedPage>],
    ["prestataire", <SpecializedPage key="provider" space={{ handle: "atelier", section: "catalog", provider: true }}><p>Prestations</p></SpecializedPage>],
    ["professionnels", <SpecializedProfessionalPage key="professional"><p>Annuaire</p></SpecializedProfessionalPage>],
    ["média", <SpecializedEditorialPage key="media"><p>Presse</p></SpecializedEditorialPage>],
  ] as const)("%s : bords, écart et barre sur le jeton dès 768 px, sans cadre centré ; contenu du téléphone conservé", (_, page) => {
    const host = document.createElement("div")
    host.innerHTML = renderToStaticMarkup(page)
    const frame = host.querySelector("[data-specialized-space]")
    const bar = frame?.querySelector(":scope > header > div")
    const grid = frame?.querySelector(":scope > div")
    const rail = grid?.querySelector(":scope > nav")
    const main = grid?.querySelector(":scope > main")
    for (const element of [bar, grid, rail, main]) {
      expect(element).toBeTruthy()
      expect(classNames(element).map(name => splitClass(name).utility).filter(utility => utility === "mx-auto" || utility.startsWith("max-w-"))).toEqual([])
    }
    // Le rail et le contenu se partagent le cadre ; le jeton fait les bords et l'écart.
    expect(inlinePaddings(grid)).toEqual({ "min-[768px]": ["px-gutter"] })
    expect(classNames(grid).filter(name => splitClass(name).utility.startsWith("gap-"))).toEqual(["min-[768px]:gap-gutter"])
    // Le rail commence à la gouttière ; le dock téléphone porte son assise dans la feuille app dédiée.
    expect(inlinePaddings(rail)).toEqual({ "min-[768px]": ["px-0"] })
    expect(rail?.querySelector("[data-navigation-dock]")).not.toBeNull()
    // Téléphone : 12 px, puis 24 px dès `sm`. Ce `sm:` reste borné sous 768 px : Tailwind 4
    // l'émet après `min-[768px]:` (rem après px), il l'emporterait sinon à toutes les largeurs.
    expect(inlinePaddings(bar)).toEqual({ "": ["px-3"], "sm:max-[768px]": ["px-6"], "min-[768px]": ["px-gutter"] })
    expect(inlinePaddings(main)).toEqual({ "": ["px-3"], "sm:max-[768px]": ["px-6"], "min-[768px]": ["px-0"] })
  })
})


describe("SU06 — navigation de l'adresse food", () => {
  it("nomme l'entrée du catalogue Menu seulement pour le gabarit food", () => {
    const space = specializedShopRoute(routes.storefront("atelier"))
    if (!space) throw new Error("missing shop route")
    const ordinary = renderToStaticMarkup(<SpecializedNavigationBoundary owner={owner}><SpecializedPage space={space}><p>Vitrine</p></SpecializedPage></SpecializedNavigationBoundary>)
    expect(ordinary).toContain('aria-label="Catalogue"')
    state.food = true
    const food = renderToStaticMarkup(<SpecializedNavigationBoundary owner={owner}><SpecializedPage space={space}><p>Vitrine</p></SpecializedPage></SpecializedNavigationBoundary>)
    expect(food).toContain('aria-label="Menu"')
    expect(food).not.toContain('aria-label="Catalogue"')
  })
})
