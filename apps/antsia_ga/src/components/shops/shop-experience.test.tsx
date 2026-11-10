// @vitest-environment jsdom
/** La boutique sur le modèle des ventes privées (décision du propriétaire du 22/10/2026) : vitrine, catalogue, fiche. */
import { createAppI18n } from "@antsia/social-features/i18n"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ query: vi.fn(), push: vi.fn(), toast: vi.fn(), width: 390 }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: { catalog: { list: "list", offer: "offer" }, shops: { storefront: "storefront" }, checkout: { context: "checkoutContext" } }, pages: { pages: { follow: "follow", unfollow: "unfollow" } }, commercialMessaging: { threads: { findMyThread: "thread" } } } } }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (...args: unknown[]) => mocks.query(...args) }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "root", personId: "reader" }) }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: true }), useMutation: () => vi.fn() }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock("@/components/jobs/member-shop-jobs-screen", () => ({ MemberShopJobsPreview: () => null }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }), useSearchParams: () => null }))
vi.mock("sonner", () => ({ toast: { success: mocks.toast, error: vi.fn() } }))

import { appResources } from "@/i18n/resources"
import { readCartBook } from "@/lib/cart-book"
import { routes } from "@/lib/routes"
import { SpaceIdentity } from "../specialized-space-identity"
import { catalogOfferFixture, catalogPageFixture } from "./__tests__/catalog-fixtures"
import { storefrontFixture } from "./__tests__/fixtures"
import { MemberCatalogScreen, MemberOfferScreen } from "./catalog-member-screen"
import { MemberStorefrontScreen } from "./member-storefront-screen"

type Reply = { data: unknown; isPending: boolean; isError: boolean; isFetching: boolean; refetch: () => void }
const reply = (data: unknown): Reply => ({ data, isPending: data === undefined, isError: false, isFetching: false, refetch: vi.fn() })
const COLLECTION_A = "pro.ga:offer_collection:01JA00000000000000000000CA"
const COLLECTION_B = "pro.ga:offer_collection:01JA00000000000000000000CB"
const fixed = (ref: string, title: string) => catalogOfferFixture({ offerRef: `pro.ga:offer:01JA0000000000000000000${ref}`, title, variants: [], variantAxes: [], price: { mode: "fixed", currency: "XAF", amount: 2500 } })
let root: Root, container: HTMLDivElement, answers: Record<string, (args: Record<string, unknown>) => Reply>
async function render(node: ReactNode) { await act(async () => root.render(<I18nextProvider i18n={createAppI18n({ locale: "fr", appResources, defaultNS: "shops" })}>{node}</I18nextProvider>)) }
async function click(node: Element | null | undefined) { if (!(node instanceof HTMLElement)) throw new Error("Élément de recette absent"); await act(async () => node.click()) }
const button = (label: string) => [...document.querySelectorAll("button")].find(node => node.textContent === label || node.getAttribute("aria-label") === label)

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  mocks.width = 390; mocks.push.mockReset(); mocks.toast.mockReset(); mocks.query.mockReset()
  window.sessionStorage.clear()
  // Un stockage local en mémoire : celui du Node des tests n'a pas de méthodes.
  const stored = new Map<string, string>()
  vi.stubGlobal("localStorage", { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => { stored.set(key, String(value)) }, removeItem: (key: string) => { stored.delete(key) }, clear: () => stored.clear() })
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ media: query, get matches() { const min = /min-width:\s*(\d+)px/u.exec(query); return min ? mocks.width >= Number(min[1]) : false }, addEventListener: () => undefined, removeEventListener: () => undefined })))
  answers = { storefront: () => reply({ ...storefrontFixture(), bannerUrl: "https://media.example/banniere.jpg", blocks: ["catalog", "about"] }), thread: () => reply(null), list: () => reply(catalogPageFixture()) }
  mocks.query.mockImplementation((reference: string, args: Record<string, unknown>) => answers[reference]?.(args) ?? reply(undefined))
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() })

describe("Dans une boutique, sur le modèle des ventes privées", () => {
  it("la vitrine porte la bannière en photo, le nom en titre et les seules mentions réelles", async () => {
    await render(<MemberStorefrontScreen handle="atelier" />)
    const hero = container.querySelector("[data-storefront-hero]")!
    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(hero.querySelector("h1")?.textContent).toBe("Atelier des rives")
    expect(hero.querySelector("img")?.getAttribute("src")).toBe("https://media.example/banniere.jpg")
    expect(hero.textContent).toContain("Communauté")
    expect(hero.textContent).toContain("Couture")
    expect(hero.textContent).toContain("Libreville")
    expect([...hero.querySelectorAll("a")].find(link => link.textContent === "Voir les offres")?.getAttribute("href")).toBe(routes.shopCatalog("atelier"))
    expect(container.textContent).not.toMatch(/-\d+ ?%|Livraison offerte|Sponsoris/u)
  })

  it("deux collections ou plus défilent sur la vitrine ; une seule ne double pas la grille", async () => {
    const page = (collections: { collectionRef: string; label: string }[]) => reply(catalogPageFixture({ collections, page: [fixed("F1", "Savon"), fixed("F2", "Panier")] }))
    answers.list = args => args.collectionRef === COLLECTION_A ? reply(catalogPageFixture({ page: [fixed("F3", "Savon noir")] })) : args.collectionRef === COLLECTION_B ? reply(catalogPageFixture({ page: [] })) : page([{ collectionRef: COLLECTION_A, label: "Soins" }, { collectionRef: COLLECTION_B, label: "Vannerie" }])
    await render(<MemberStorefrontScreen handle="atelier" />)
    // Une collection vide ne laisse pas de carrousel.
    expect([...container.querySelectorAll("[data-rail] > div > h3")].map(node => node.textContent)).toEqual(["Soins"])
    expect(container.querySelector("[data-rail]")?.textContent).toContain("Savon noir")
    answers.list = () => page([{ collectionRef: COLLECTION_A, label: "Soins" }])
    await render(<MemberStorefrontScreen handle="atelier" key="une-collection" />)
    expect(container.querySelector("[data-rail]")).toBeNull()
  })

  it("le catalogue : collections en pastilles, présentation gardée, filtres actifs retirés d'un geste", async () => {
    await render(<MemberCatalogScreen handle="atelier" search={{ brand: ["Atelier"], cursor: null }} />)
    const toolbar = container.querySelector("[data-catalog-toolbar]")!
    expect([...toolbar.querySelectorAll("nav a")].map(link => [link.textContent, link.getAttribute("aria-current")])).toEqual([["Toutes les collections", "page"], ["Créations locales", null]])
    expect(container.querySelector("[data-catalog-layout]")?.getAttribute("data-catalog-layout")).toBe("grid")
    await click(button("Afficher en lignes"))
    expect(container.querySelector("[data-catalog-layout]")?.getAttribute("data-catalog-layout")).toBe("list")
    expect(window.localStorage.getItem("antsia:catalog-view")).toBe("list")
    await click(button("Retirer Atelier"))
    expect(mocks.push).toHaveBeenCalledWith(routes.shopCatalog("atelier", {}))
    // Aucun total d'offres : le moteur n'en donne pas.
    expect(container.textContent).not.toMatch(/\d+ (articles|offres)\b/u)
  })

  it("la fiche porte le nom en titre, les conditions de la boutique et d'autres offres de la même boutique", async () => {
    mocks.width = 1024
    const offer = fixed("F1", "Savon au karité")
    answers.offer = () => reply(offer)
    answers.list = () => reply(catalogPageFixture({ page: [offer, fixed("F2", "Panier en raphia")] }))
    await render(<MemberOfferScreen handle="atelier" offerRef={offer.offerRef} />)
    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(container.querySelector("h1")?.textContent).toBe("Savon au karité")
    expect(container.querySelector("[data-storefront-terms]")?.textContent).toContain("Non renseigné")
    const rail = container.querySelector("[data-rail]")!
    expect(rail.querySelector("h2")?.textContent).toBe("Dans la même boutique")
    expect([...rail.querySelectorAll("[data-offer-card] h3")].map(node => node.textContent)).toEqual(["Panier en raphia"])
    // Au bureau, l'ajout reste dans la fiche : aucune barre fixe.
    expect(document.querySelector("[data-offer-buy-bar]")).toBeNull()
    expect(container.querySelector("[data-offer-actions] form button[type=submit]")?.textContent).toBe("Ajouter au panier")
  })

  it("au téléphone, la quantité et l'ajout vivent dans une barre fixe liée au formulaire de la fiche", async () => {
    const offer = fixed("F1", "Savon au karité")
    answers.offer = () => reply(offer)
    await render(<div data-specialized-space="shop"><MemberOfferScreen handle="atelier" offerRef={offer.offerRef} /></div>)
    const bar = document.querySelector<HTMLElement>("[data-offer-buy-bar]")!
    expect(container.contains(bar)).toBe(false)
    // La barre déclare sa hauteur à l'espace (marge basse de la page), et la retire en partant.
    const space = container.querySelector<HTMLElement>("[data-specialized-space]")!
    expect(space.style.getPropertyValue("--space-floating-bar")).toMatch(/^\d+px$/u)
    const form = container.querySelector<HTMLFormElement>("[data-offer-actions] form")!
    const submit = bar.querySelector<HTMLButtonElement>("button[type=submit]")!
    expect(submit.getAttribute("form")).toBe(form.id)
    expect(form.querySelector('input[inputmode="numeric"]')).toBeNull()
    await click(button("Ajouter une unité"))
    expect(bar.querySelector<HTMLInputElement>("input")?.value).toBe("2")
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
    expect(readCartBook(window.sessionStorage, "root", "reader", Date.now())?.drafts.map(draft => draft.items)).toEqual([[{ offerRef: offer.offerRef, quantity: 2 }]])
    expect(mocks.toast).toHaveBeenCalledWith("Article ajouté au brouillon du panier.", expect.objectContaining({ action: expect.objectContaining({ label: "Ouvrir mes paniers" }) }))
    await render(<div data-specialized-space="shop" />)
    expect(container.querySelector<HTMLElement>("[data-specialized-space]")?.style.getPropertyValue("--space-floating-bar")).toBe("")
  })

  it("la galerie de la fiche : des vignettes choisissent la photo dès 768 px, jamais une photo retenue", async () => {
    mocks.width = 1024
    const photo = { url: "https://media.example/face.jpg", altText: "Face", width: 800, height: 800, withheld: null }
    const offer = catalogOfferFixture({ media: [photo, { ...photo, url: "https://must-never-appear.example/held.jpg", withheld: "fileScanPending" }, { ...photo, url: "https://media.example/dos.jpg", altText: "Dos" }], variants: [], variantAxes: [], price: { mode: "fixed", currency: "XAF", amount: 2500 } })
    answers.offer = () => reply(offer)
    await render(<MemberOfferScreen handle="atelier" offerRef={offer.offerRef} />)
    const thumbnails = [...container.querySelectorAll<HTMLButtonElement>("[data-offer-gallery] button")]
    expect(thumbnails.map(node => node.getAttribute("aria-label"))).toEqual(["Afficher la photo 1", "Afficher la photo 3"])
    expect(thumbnails[0]?.getAttribute("aria-pressed")).toBe("true")
    await click(thumbnails[1])
    expect(thumbnails[1]?.getAttribute("aria-pressed")).toBe("true")
    expect(container.innerHTML).not.toContain("must-never-appear")
  })

  it("l'en-tête de l'espace montre la marque de l'activité, sinon le libellé de l'espace", async () => {
    await render(<SpaceIdentity handle="atelier" provider={false} fallback="Espace boutique" />)
    const link = container.querySelector("[data-space-identity]")!
    expect(link.getAttribute("href")).toBe(routes.storefront("atelier"))
    expect(link.textContent).toBe("Atelier des rives")
    answers.storefront = () => ({ ...reply(undefined), isError: true })
    await render(<SpaceIdentity handle="atelier" provider={false} fallback="Espace boutique" key="refus" />)
    expect(container.querySelector("[data-space-identity]")).toBeNull()
    expect(container.textContent).toBe("Espace boutique")
  })
})
