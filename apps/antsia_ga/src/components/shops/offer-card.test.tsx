// @vitest-environment jsdom
import { Children, isValidElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getAppT } from "@/i18n/server"
import { routes } from "@/lib/routes"
import { catalogAvailability, catalogVariantPrice, type CatalogOffer } from "./catalog-model"
import { OfferCard, OfferDetails } from "./offer-card"
import { OfferMediaCarousel } from "./offer-media-carousel"
import { OfferGallery } from "./offer-gallery"
import { CATALOG_NOW, catalogOfferFixture, catalogVariantFixture } from "./__tests__/catalog-fixtures"

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(CATALOG_NOW) })
afterEach(() => vi.useRealTimers())
const translate = (locale: "fr" | "en") => (key: string, options?: Record<string, unknown>) => getAppT(locale).t(`shops:${key}`, options)
const dom = (html: string) => { const node = document.createElement("div"); node.innerHTML = html; return node }

describe("cartes et fiches d'offre communes au membre et au SSR", () => {
  it.each(["fr", "en"] as const)("la carte compacte rend titre, prix XAF et vraie destination (%s)", (locale) => {
    const offer = catalogOfferFixture()
    const t = translate(locale)
    const node = dom(renderToStaticMarkup(<OfferCard offer={offer} audience="public" locale={locale} t={t} compact />))
    const href = routes.publicShopOffer(offer.shopHandle, offer.offerRef)
    expect(node.textContent).toContain(offer.title)
    expect(node.textContent).toContain("XAF")
    expect(node.querySelector("a")?.getAttribute("href")).toBe(href)
    expect(Array.from(node.querySelectorAll("a")).find(link => link.textContent === t("catalog.openOffer"))?.getAttribute("href")).toBe(href)
    expect(node.querySelector("button, form")).toBeNull()
  })
  it("une photo retenue ne reçoit jamais de src même si le DTO contient aussi une URL", () => {
    const offer = catalogOfferFixture({ media: [{ url: "https://must-never-appear.example/photo.jpg", altText: null, width: null, height: null, withheld: "fileQuarantined" }] })
    const html = renderToStaticMarkup(<OfferDetails offer={offer} audience="public" locale="fr" t={translate("fr")} />)
    expect(html).not.toContain("must-never-appear")
    expect(dom(html).querySelector("img")).toBeNull()
    expect(dom(html).textContent).toContain(translate("fr")("catalog.mediaWithheld"))
  })
  it("rend une photo admise sans URL de gestion ou image inventée", () => {
    const photo = { url: "https://media.example/photo.jpg", altText: "Sac en tissu", width: 800, height: 600, withheld: null }
    const offer = catalogOfferFixture({ media: [photo] })
    const node = dom(renderToStaticMarkup(<OfferCard offer={offer} audience="member" locale="fr" t={translate("fr")} />))
    expect(node.querySelector("img")?.getAttribute("src")).toBe(photo.url)
    expect(node.querySelector("img")?.getAttribute("alt")).toBe("Sac en tissu")
    expect(node.querySelector("a")?.getAttribute("href")).toBe(routes.shopOffer(offer.shopHandle, offer.offerRef))
  })
  it.each(["member", "public"] as const)("la galerie à points garde les vrais médias et la même fiche autorisée (%s)", (audience) => {
    const photo = { url: "https://media.example/face.jpg", altText: "Vue de face", width: 800, height: 600, withheld: null }
    const offer = catalogOfferFixture({ media: [photo, { ...photo, url: "https://must-never-appear.example/held.jpg", withheld: "fileScanPending" }, { ...photo, url: "https://media.example/back.jpg", altText: "Vue arrière" }] })
    const t = translate("fr")
    const node = dom(renderToStaticMarkup(<OfferCard offer={offer} audience={audience} locale="fr" t={t} />))
    const href = audience === "public" ? routes.publicShopOffer(offer.shopHandle, offer.offerRef) : routes.shopOffer(offer.shopHandle, offer.offerRef)
    expect(Array.from(node.querySelectorAll("img")).map((image) => image.getAttribute("src"))).toEqual([photo.url, "https://media.example/back.jpg"])
    expect(node.innerHTML).not.toContain("must-never-appear")
    const photos = node.querySelector(`ul[aria-label="${t("catalog.offerPhotos")}"]`)
    expect(photos?.querySelectorAll("a")).toHaveLength(2)
    expect(Array.from(photos?.querySelectorAll("a") ?? []).map((link) => link.getAttribute("href"))).toEqual([href, href])
    expect(photos?.textContent).toContain(t("catalog.mediaWithheld"))
    // Un point par photo, décoratif : la galerie se lit déjà par sa liste.
    expect(node.querySelector("[data-offer-dots]")?.getAttribute("aria-hidden")).toBe("true")
    expect(node.querySelectorAll("[data-offer-dots] span")).toHaveLength(3)
    expect(Array.from(node.querySelectorAll("a")).find(link => link.textContent === offer.title)?.getAttribute("href")).toBe(href)
    expect(node.querySelector("button, form, [data-checkout]")).toBeNull()
  })
  it("une offre sans photo garde son repli et sa destination, sans galerie ni points inventés", () => {
    const offer = catalogOfferFixture({ media: [], description: "", variants: [], availability: { state: null, indicative: true, updatedAt: null, stale: false } })
    const t = translate("en")
    const node = dom(renderToStaticMarkup(<OfferCard offer={offer} audience="public" locale="en" t={t} />))
    expect(node.querySelector("img, [data-offer-dots]")).toBeNull()
    expect(node.textContent).toContain(t("catalog.noPhoto"))
    expect(node.querySelector("a")?.getAttribute("href")).toBe(routes.publicShopOffer(offer.shopHandle, offer.offerRef))
  })
  it("montre la marque et la couleur publiées (sinon les variantes), une indisponibilité récente et l'action de la surface", () => {
    const t = translate("fr")
    const facets: NonNullable<CatalogOffer["facets"]> = { taxonomyVersion: 1, categoryPath: ["fashion"], attributes: [{ key: "brand", type: "text", value: "Maison Nzeng" }, { key: "color", type: "text", value: "Indigo" }] }
    const offer = catalogOfferFixture({ facets, availability: { state: "out_of_stock", indicative: true, updatedAt: CATALOG_NOW, stale: false } })
    const node = dom(renderToStaticMarkup(<OfferCard offer={offer} audience="member" locale="fr" t={t} action={<button type="button">Ajouter</button>} />))
    expect(node.textContent).toContain("Maison Nzeng")
    expect(node.textContent).toContain("Indigo")
    expect(node.textContent).toContain(t("catalog.card.outOfStock"))
    expect(node.querySelector("[data-offer-card-action] button")?.textContent).toBe("Ajouter")
    // Aucun prix barré ni remise : le moteur n'en porte pas.
    expect(node.querySelector("s, del")).toBeNull()
    const plain = dom(renderToStaticMarkup(<OfferCard offer={catalogOfferFixture()} audience="member" locale="fr" t={t} seller={false} />))
    expect(plain.textContent).toContain(t("catalog.hasVariants", { count: 1 }))
    expect(plain.textContent).not.toContain(t("catalog.card.outOfStock"))
    expect(plain.textContent).not.toContain(t("catalog.soldBy", { handle: "atelier" }))
  })
  it("un service sur devis reste explicitement sans montant et sans action de transaction", () => {
    const offer = catalogOfferFixture({ kind: "service", price: { mode: "quote", currency: "XAF" }, variants: [] })
    const node = dom(renderToStaticMarkup(<OfferDetails offer={offer} audience="public" locale="fr" t={translate("fr")} />))
    expect(node.textContent).toContain("Sur devis")
    expect(node.textContent).not.toContain("0 XAF")
    expect(node.querySelector("button, form, [data-checkout]")).toBeNull()
  })
  it("conserve intervalle, unité et prix exact de chaque variante dans le HTML initial", () => {
    const offer = catalogOfferFixture({ price: { mode: "range", currency: "XAF", minAmount: 10000, maxAmount: 20000, unit: "mètre" }, variants: [catalogVariantFixture({ amount: 17500, unit: "pièce" })] })
    const node = dom(renderToStaticMarkup(<OfferDetails offer={offer} audience="public" locale="fr" t={translate("fr")} />))
    expect(node.textContent?.replace(/[\u00a0\u202f]/g, " ")).toContain("10 000 XAF")
    expect(node.textContent?.replace(/[\u00a0\u202f]/g, " ")).toContain("20 000 XAF")
    expect(node.textContent?.replace(/[\u00a0\u202f]/g, " ")).toContain("17 500 XAF / pièce")
    expect(node.textContent).toContain("/ mètre")
    expect(node.querySelector("details")?.textContent).toContain("Rouge")
    expect(node.querySelector("h1")?.textContent).toBe(offer.title)
  })
  it("le booléen stale et l'âge local ferment l'affirmation de disponibilité sans polling", () => {
    const t = translate("fr")
    const availability = catalogOfferFixture().availability
    expect(catalogAvailability({ ...availability, stale: true }, t)).toBe(t("catalog.availability.stale"))
    expect(catalogAvailability(availability, t, "in_stock", CATALOG_NOW + 15 * 60 * 1000 + 1)).toBe(t("catalog.availability.stale"))
    expect(catalogAvailability({ ...availability, updatedAt: null }, t)).toBe(t("catalog.availability.unknown"))
    expect(catalogAvailability({ ...availability, state: null }, t)).toBe(t("catalog.availability.notShared"))
  })
  it("une variante garde son montant exact et hérite de l'unité du prix unitaire", () => {
    const variant = catalogVariantFixture()
    const offer = catalogOfferFixture({ price: { mode: "unit", amount: 15000, currency: "XAF", unit: "mètre" }, variants: [variant] })
    expect(catalogVariantPrice(offer.price, variant, "fr", translate("fr")).replace(/[\u00a0\u202f]/g, " ")).toBe("17 500 XAF / mètre")
    expect(catalogVariantPrice(offer.price, { ...variant, unit: "pièce" }, "fr", translate("fr"))).toContain("/ pièce")
  })
  it("échappe titre, description, options et libellés sans réécrire la marque", () => {
    const offer = catalogOfferFixture({ title: "<script>Atelier</script>", description: '<img onerror="injection()">', variants: [catalogVariantFixture({ label: "<b>Rouge</b>" })] })
    const node = dom(renderToStaticMarkup(<OfferDetails offer={offer} audience="public" locale="fr" t={translate("fr")} />))
    expect(node.textContent).toContain(offer.title)
    expect(node.textContent).toContain(offer.description)
    expect(node.querySelector("script, img, [onerror]")).toBeNull()
  })

  it.each(["member", "public"] as const)("identifie la boutique séparément du titre d'offre (%s)", audience => {
    const offer = catalogOfferFixture()
    const node = dom(renderToStaticMarkup(<OfferCard offer={offer} audience={audience} locale="fr" t={translate("fr")} compact />))
    const expected = audience === "public" ? routes.publicStorefront(offer.shopHandle) : routes.storefront(offer.shopHandle)
    const shop = Array.from(node.querySelectorAll("a")).find(link => link.getAttribute("href") === expected)
    expect(shop?.textContent).toContain(offer.shopHandle)
    expect(node.querySelector("button, form")).toBeNull()
  })

  it("ne rend jamais un slot d'action membre dans la fiche publique", () => {
    const offer = catalogOfferFixture()
    const publicHtml = renderToStaticMarkup(<OfferDetails offer={offer} audience="public" locale="fr" t={translate("fr")} actionSlot={<button>Action privée</button>} />)
    expect(publicHtml).not.toContain("Action privée")
    const memberHtml = renderToStaticMarkup(<OfferDetails offer={offer} audience="member" locale="fr" t={translate("fr")} actionSlot={<a href={routes.checkoutPrepare(offer.shopHandle, offer.offerRef)}>Préparation autorisée</a>} />)
    expect(memberHtml).toContain("Préparation autorisée")
    expect(memberHtml).not.toContain(">Payer<")
  })
})


/** Inspecte la frontière client sans exécuter le composant : le SSR classique masque cette erreur RSC. */
function descendantProps(node: ReactNode, component: unknown): Record<string, unknown> | null {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue
    if (child.type === component) return child.props as Record<string, unknown>
    const found = descendantProps(child.props.children, component)
    if (found) return found
  }
  return null
}

describe("galeries publiques — frontière serveur/client sérialisable", () => {
  it.each(["fr", "en"] as const)("les cartes et fiches passent les phrases traduites, jamais la fonction de traduction (%s)", locale => {
    const offer = catalogOfferFixture({ media: [
      { url: "https://media.example/face.jpg", altText: "Face", width: 800, height: 600, withheld: null },
      { url: "https://must-never-appear.example/held.jpg", altText: null, width: null, height: null, withheld: "fileQuarantined" },
    ] })
    const t = translate(locale)
    const card = OfferCard({ offer, audience: "public", locale, t })
    const detail = OfferDetails({ offer, audience: "public", locale, t })
    for (const [tree, component] of [[card, OfferMediaCarousel], [detail, OfferGallery]] as const) {
      const props = descendantProps(tree, component)
      if (!props) throw new Error("Missing client gallery boundary")
      expect(props).not.toHaveProperty("t")
      expect(JSON.parse(JSON.stringify(props))).toEqual(props)
      expect(props).toMatchObject({ labels: { photos: t("catalog.offerPhotos"), noPhoto: t("catalog.noPhoto"), mediaWithheld: t("catalog.mediaWithheld") } })
    }
    expect(descendantProps(card, OfferMediaCarousel)).toMatchObject({ labels: { openOffer: t("catalog.openOfferNamed", { title: offer.title }), openPhotos: [t("catalog.openOfferPhoto", { title: offer.title, index: 1 }), t("catalog.openOfferPhoto", { title: offer.title, index: 2 })] } })
    expect(descendantProps(detail, OfferGallery)).toMatchObject({ labels: { choosePhoto: t("catalog.choosePhoto"), showPhotos: [t("catalog.showPhoto", { index: 1 }), t("catalog.showPhoto", { index: 2 })] } })
  })
})
