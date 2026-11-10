// @vitest-environment jsdom
import type { CommerceCatalogFacets } from "@antsia/social-domain/commerce/catalogFacets"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getAppT } from "@/i18n/server"
import { OfferDetails } from "./offer-card"
import { OfferFacets } from "./offer-facets"
import { CATALOG_NOW, catalogOfferFixture } from "./__tests__/catalog-fixtures"

const translate = (locale: "fr" | "en") => (key: string, options?: Record<string, unknown>) => getAppT(locale).t(`shops:${key}`, options)
const dom = (html: string) => { const node = document.createElement("div"); node.innerHTML = html; return node }
const fashionFacets = (): CommerceCatalogFacets => ({ taxonomyVersion: 1, categoryPath: ["fashion", "fashion.women", "fashion.women.clothing"], attributes: [{ key: "brand", type: "text", value: "Atelier Libreville" }, { key: "material", type: "text", value: "Lin" }, { key: "color", type: "text", value: "Écru" }, { key: "audience", type: "choice", value: "women" }, { key: "ecoLabel", type: "boolean", value: true }] })
const serviceFacets = (): CommerceCatalogFacets => ({ taxonomyVersion: 1, categoryPath: ["services", "services.digital"], attributes: [{ key: "serviceMode", type: "choice", value: "remote" }, { key: "durationMinutes", type: "number", value: 60 }, { key: "ecoLabel", type: "boolean", value: false }] })

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(CATALOG_NOW) })
afterEach(() => vi.useRealTimers())

describe("MP03 — facettes traduites dans le HTML initial", () => {
  it.each([
    { locale: "fr" as const, title: "Détails de l’offre", path: "Mode / Femmes / Vêtements", labels: ["Marque", "Matière", "Couleur", "Pour qui", "Mention écologique déclarée"], values: ["Atelier Libreville", "Lin", "Écru", "Femmes", "Oui, déclaré par le vendeur"] },
    { locale: "en" as const, title: "Offer details", path: "Fashion / Women / Clothing", labels: ["Brand", "Material", "Colour", "For whom", "Seller environmental claim"], values: ["Atelier Libreville", "Lin", "Écru", "Women", "Yes, declared by the seller"] },
  ])("rend le chemin hiérarchique et les attributs produit avec les vraies traductions $locale", ({ locale, title, path, labels, values }) => {
    const node = dom(renderToStaticMarkup(<OfferFacets facets={fashionFacets()} t={translate(locale)} />))
    expect(node.querySelector("section")?.getAttribute("aria-label")).toBe(title)
    expect(node.querySelector("h2")?.textContent).toBe(title)
    expect(node.querySelector("p")?.textContent).toBe(path)
    expect(Array.from(node.querySelectorAll("dt")).map(label => label.textContent)).toEqual(labels)
    expect(Array.from(node.querySelectorAll("dd")).map(value => value.textContent)).toEqual(values)
    expect(node.innerHTML).not.toMatch(/catalog\.facets|fashion\.women|taxonomyVersion|categoryPath/)
    expect(node.querySelector("button, a, form, [data-checkout], [data-badge], [role=status]")).toBeNull()
  })

  it.each([
    { locale: "fr" as const, path: "Services / Informatique et numérique", labels: ["Mode de prestation", "Durée", "Mention écologique déclarée"], values: ["À distance", "60 min", "Non, déclaré par le vendeur"] },
    { locale: "en" as const, path: "Services / Digital and IT", labels: ["Service delivery", "Duration", "Seller environmental claim"], values: ["Remote", "60 min", "No, declared by the seller"] },
  ])("rend les choix, nombres et booléens de service en $locale sans les certifier", ({ locale, path, labels, values }) => {
    const node = dom(renderToStaticMarkup(<OfferFacets facets={serviceFacets()} t={translate(locale)} />))
    expect(node.querySelector("p")?.textContent).toBe(path)
    expect(Array.from(node.querySelectorAll("dt")).map(label => label.textContent)).toEqual(labels)
    expect(Array.from(node.querySelectorAll("dd")).map(value => value.textContent)).toEqual(values)
    expect(node.textContent).not.toMatch(/certifi|verified|vérifié/i)
    expect(node.querySelector("button, a, form, [data-checkout], [data-badge]")).toBeNull()
  })

  it("n'ajoute aucune section quand les facettes sont absentes", () => {
    expect(renderToStaticMarkup(<OfferFacets facets={undefined} t={translate("fr")} />)).toBe("")
    const node = dom(renderToStaticMarkup(<OfferDetails offer={catalogOfferFixture()} audience="public" locale="fr" t={translate("fr")} />))
    expect(node.querySelector('section[aria-label="Détails de l’offre"]')).toBeNull()
  })

  it("conserve une catégorie publiée sans inventer d'attribut", () => {
    const facets: CommerceCatalogFacets = { taxonomyVersion: 1, categoryPath: ["fashion", "fashion.women", "fashion.women.clothing"], attributes: [] }
    const node = dom(renderToStaticMarkup(<OfferFacets facets={facets} t={translate("fr")} />))
    expect(node.querySelector("p")?.textContent).toBe("Mode / Femmes / Vêtements")
    expect(node.querySelector("dl, dt, dd")).toBeNull()
  })

  it("échappe les textes publiés sans injecter de balisage ni réécrire les marques", () => {
    const brand = "<script>Atelier</script>"
    const material = '<img onerror="injection()">'
    const facets: CommerceCatalogFacets = { ...fashionFacets(), attributes: [{ key: "brand", type: "text", value: brand }, { key: "material", type: "text", value: material }] }
    const html = renderToStaticMarkup(<OfferFacets facets={facets} t={translate("fr")} />)
    const node = dom(html)
    expect(Array.from(node.querySelectorAll("dd")).map(value => value.textContent)).toEqual([brand, material])
    expect(html).toContain("&lt;script&gt;Atelier&lt;/script&gt;")
    expect(node.querySelector("script, img, [onerror]")).toBeNull()
  })

  it.each(["fr", "en"] as const)("la fiche réelle partage les mêmes facettes entre membre et public en %s", (locale) => {
    const facets = fashionFacets()
    const offer = catalogOfferFixture({ facets: { taxonomyVersion: 1, categoryPath: [...facets.categoryPath], attributes: facets.attributes.map(attribute => ({ ...attribute })) } })
    const t = translate(locale)
    const sections = (["member", "public"] as const).map(audience => {
      const node = dom(renderToStaticMarkup(<OfferDetails offer={offer} audience={audience} locale={locale} t={t} />))
      expect(node.querySelector("button, form, [data-checkout]")).toBeNull()
      const section = node.querySelector(`section[aria-label="${t("catalog.facets.title")}"]`)
      expect(section).not.toBeNull()
      return section?.innerHTML
    })
    expect(sections[0]).toEqual(sections[1])
    expect(sections[0]).toContain("Atelier Libreville")
  })
})
