// @vitest-environment jsdom
import { createAppI18n } from "@antsia/social-features/i18n"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { appResources } from "@/i18n/resources"
import { routes } from "@/lib/routes"
import { cartDraftKey } from "@/lib/cart-draft"
import { readCartBook } from "@/lib/cart-book"
import { OfferDetails } from "@/components/shops/offer-card"
import { catalogVariantFixture } from "@/components/shops/__tests__/catalog-fixtures"
import { catalogOfferFixture, OFFER_REF, VARIANT_REF } from "@/components/checkout/checkout-fixtures.test-support"
const mocks = vi.hoisted(() => ({ network: { networkId: "network-a", personId: "person-a" }, forbidPrivate: false }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => { if (mocks.forbidPrivate) throw new Error("Public selection reached a private hook"); return mocks.network } }))
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: true }) }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => children }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
import { OfferCartActions, OfferShareButton, PublicOfferSelection } from "./offer-cart-actions"
const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "cart" })
let root: Root, container: HTMLDivElement
async function render(children: ReactNode) { await act(async () => root.render(<I18nextProvider i18n={i18n}>{children}</I18nextProvider>)) }
async function choose(name: string, value: string) { await act(async () => { const select = container.querySelector<HTMLSelectElement>(`select[name="${name}"]`)!; select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })) }) }
async function quantity(value: string) { await act(async () => { const node = container.querySelector<HTMLInputElement>('input[name="quantity"]')!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, value); node.dispatchEvent(new Event("input", { bubbles: true })); node.dispatchEvent(new Event("change", { bubbles: true })) }) }
async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))) }
const V2 = "pro.ga:offer_variant:01JA00000000000000000000V2", V3 = "pro.ga:offer_variant:01JA00000000000000000000V3"
function clothing() { return catalogOfferFixture({ variantAxes: ["Couleur", "Taille"], variants: [catalogVariantFixture({ options: ["Rouge", "S"], amount: 12000 }), catalogVariantFixture({ variantRef: V2, label: "Rouge M", options: ["Rouge", "M"], availability: "out_of_stock", amount: 13000 }), catalogVariantFixture({ variantRef: V3, label: "Bleu L", options: ["Bleu", "L"], amount: 14000, unit: "pièce" })] }) }
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  mocks.network = { networkId: "network-a", personId: "person-a" }; mocks.forbidPrivate = false
  sessionStorage.clear(); container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); sessionStorage.clear(); window.history.replaceState({}, "", "/"); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
describe("fiche offre vers panier et partage public", () => {
  it("exige la variante explicite puis persiste seulement les références et la quantité", async () => {
    await render(<OfferCartActions offer={catalogOfferFixture()} />)
    const form = container.querySelector("form")!
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })) })
    expect(sessionStorage.getItem(cartDraftKey("network-a", "person-a"))).toBeNull()
    await choose("options.0", "Rouge")
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })) })
    const raw = sessionStorage.getItem(cartDraftKey("network-a", "person-a"))!
    expect(readCartBook(sessionStorage, "network-a", "person-a", Date.now())?.drafts[0]?.items).toEqual([{ offerRef: OFFER_REF, variantRef: VARIANT_REF, quantity: 1 }])
    expect(raw).not.toContain("Sac artisanal"); expect(raw).not.toContain("address"); expect(raw).not.toContain("consent")
  })
  it("ne crée pas de choix de prix pour une offre sur devis", async () => {
    await render(<OfferCartActions offer={catalogOfferFixture({ variants: [], price: { mode: "quote", currency: "XAF" } })} />)
    expect(container.querySelector("form")).toBeNull(); expect(container.textContent).toContain(i18n.t("quoteClosed"))
  })
  it("sélectionne les deux axes, affiche le prix exact et efface la taille devenue incompatible", async () => {
    await render(<OfferCartActions offer={clothing()} />)
    expect(container.querySelector<HTMLSelectElement>('select[name="options.1"]')?.disabled).toBe(true)
    await choose("options.0", "Rouge")
    expect(container.querySelector<HTMLOptionElement>('select[name="options.1"] option[value="M"]')?.disabled).toBe(true)
    await choose("options.1", "S")
    expect(container.querySelector("[data-offer-selection-summary]")?.textContent?.replace(/[\u00a0\u202f]/gu, " ")).toContain("12 000 XAF")
    await choose("options.0", "Bleu")
    expect(container.querySelector<HTMLSelectElement>('select[name="options.1"]')?.value).toBe("")
    await submit()
    expect(readCartBook(sessionStorage, "network-a", "person-a", Date.now())).toBeNull()
    await choose("options.1", "L"); await quantity("2"); await submit()
    expect(readCartBook(sessionStorage, "network-a", "person-a", Date.now())?.drafts[0]?.items).toEqual([{ offerRef: OFFER_REF, variantRef: V3, quantity: 2 }])
  })
  it("refuse un choix épuisé forcé et les quantités hors borne", async () => {
    await render(<OfferCartActions offer={clothing()} />)
    await choose("options.0", "Rouge"); await choose("options.1", "M"); await submit()
    expect(readCartBook(sessionStorage, "network-a", "person-a", Date.now())).toBeNull()
    await choose("options.1", "S"); await quantity("1000"); await submit()
    expect(readCartBook(sessionStorage, "network-a", "person-a", Date.now())).toBeNull()
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
  })
  it("restaure le choix explicite sans ajout automatique, puis remet la sélection à zéro après révision", async () => {
    const offer = clothing()
    await render(<OfferCartActions offer={offer} initialSelection={{ variantRef: V3, quantity: 3 }} />)
    expect(container.querySelector<HTMLSelectElement>('select[name="options.0"]')?.value).toBe("Bleu")
    expect(container.querySelector<HTMLInputElement>('input[name="quantity"]')?.value).toBe("3")
    expect(readCartBook(sessionStorage, "network-a", "person-a", Date.now())).toBeNull()
    await render(<OfferCartActions offer={{ ...offer, revision: offer.revision + 1 }} initialSelection={{ variantRef: V3, quantity: 3 }} />)
    expect(container.querySelector<HTMLSelectElement>('select[name="options.0"]')?.value).toBe("")
    expect(container.querySelector<HTMLInputElement>('input[name="quantity"]')?.value).toBe("1")
  })
  it("un changement de personne ne conserve pas les options saisies", async () => {
    const offer = clothing()
    await render(<OfferCartActions offer={offer} />)
    await choose("options.0", "Bleu"); await choose("options.1", "L")
    mocks.network = { networkId: "network-a", personId: "person-b" }
    await render(<OfferCartActions offer={offer} />)
    expect(container.querySelector<HTMLSelectElement>('select[name="options.0"]')?.value).toBe("")
    expect(readCartBook(sessionStorage, "network-a", "person-b", Date.now())).toBeNull()
  })
  it("le repli sans axes exige la vraie référence de variante", async () => {
    await render(<OfferCartActions offer={catalogOfferFixture({ variantAxes: [], variants: [catalogVariantFixture({ options: [] })] })} />)
    await choose("variantRef", VARIANT_REF); await submit()
    expect(readCartBook(sessionStorage, "network-a", "person-a", Date.now())?.drafts[0]?.items[0]?.variantRef).toBe(VARIANT_REF)
  })
  it("la consultation publique restaure variante et quantité après connexion sans hook ni panier privé", async () => {
    mocks.forbidPrivate = true
    await render(<PublicOfferSelection offer={clothing()} viewer="anonymous" />)
    await choose("options.0", "Bleu"); await choose("options.1", "L"); await quantity("2")
    const link = [...container.querySelectorAll("a")].find(node => node.textContent === "Choisir mes options")!
    expect(link.getAttribute("href")).toBe(routes.signIn(undefined, undefined, undefined, undefined, { kind: "offer", handle: "atelier", offerRef: OFFER_REF, variantRef: V3, quantity: 2 }))
    expect(sessionStorage.getItem(cartDraftKey("network-a", "person-a"))).toBeNull()
    expect(container.querySelector('button[type="submit"]')).toBeNull()
    await quantity("1000")
    expect([...container.querySelectorAll("a")].find(node => node.textContent === "Choisir mes options")).toBeUndefined()
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    await quantity("2")
    await render(<PublicOfferSelection offer={clothing()} viewer="authenticated" />)
    expect([...container.querySelectorAll("a")].find(node => node.textContent === "Choisir mes options")?.getAttribute("href")).toBe(routes.shopOffer("atelier", OFFER_REF, { variantRef: V3, quantity: 2 }))
  })
  it.each(["product", "service"] as const)("une offre démo %s ne peut pas ouvrir un panier, même sur un hôte non déclaré", async kind => {
    mocks.forbidPrivate = true
    const offer = catalogOfferFixture({ offerRef: "demo:offer:epicerie-produits", kind })
    await render(<OfferCartActions offer={offer} />)
    expect(container.querySelector("form, button")).toBeNull()
    expect(container.textContent).toContain("Offre fictive")
    await render(<PublicOfferSelection offer={offer} viewer="anonymous" />)
    expect(container.querySelector("form, a, button")).toBeNull()
  })
  it("le slot public explicite se rend, tandis que chaque audience ignore le slot de l'autre", () => {
    const offer = catalogOfferFixture()
    const t = (key: string, options?: Record<string, unknown>) => i18n.t(`shops:${key}`, options)
    const publicHtml = renderToStaticMarkup(<OfferDetails offer={offer} audience="public" locale="fr" t={t} actionSlot={<button>Action privée</button>} publicActionSlot={<a href={routes.shopOffer("atelier", OFFER_REF)}>Action publique</a>} />)
    expect(publicHtml).toContain("Action publique"); expect(publicHtml).not.toContain("Action privée")
    const memberHtml = renderToStaticMarkup(<OfferDetails offer={offer} audience="member" locale="fr" t={t} actionSlot={<button>Action privée</button>} publicActionSlot={<a href={routes.publicShopOffer("atelier", OFFER_REF)}>Action publique</a>} />)
    expect(memberHtml).toContain("Action privée"); expect(memberHtml).not.toContain("Action publique")
  })
  it.each(["product", "service"] as const)("partage exclusivement la fiche publique %s sur l'origine configurée", async kind => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://social.example.test")
    const share = vi.fn().mockResolvedValue(undefined); vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { share }))
    window.history.replaceState({}, "", "/mes-achats/private?token=secret")
    await render(<OfferShareButton handle="atelier" offerRef={OFFER_REF} kind={kind} />)
    await act(async () => container.querySelector("button")!.click())
    expect(share).toHaveBeenCalledWith({ url: `https://social.example.test${kind === "service" ? routes.publicProviderOffer("atelier", OFFER_REF) : routes.publicShopOffer("atelier", OFFER_REF)}` })
    expect(JSON.stringify(share.mock.calls)).not.toMatch(/mes-achats|token|secret|panier/)
    vi.unstubAllGlobals()
  })
})
