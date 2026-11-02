// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { getAppT } from "@/i18n/server"
import type { PublicStorefront } from "@/lib/public-shops-data"
import { routes } from "@/lib/routes"
import { PublicStorefrontCard } from "./public-storefront-card"
import { catalogOfferFixture } from "./__tests__/catalog-fixtures"

const storefront: PublicStorefront = { handle: "atelier", name: "Atelier partagé", description: "Une présentation publique\nsur plusieurs lignes.", logoUrl: null, bannerUrl: null, model: "products", specialty: "Artisanat", serviceArea: "Libreville", hours: "Du lundi au vendredi", badge: "community", blocks: ["about"], publishedAt: 1_700_000_000_000, origin: { slug: "antsia", name: "ANTSIA" } }

describe("vitrine publique rendue sans fournisseur membre", () => {
  it.each(["fr", "en"] as const)("rend identité de page, origine et présentation complète en HTML initial (%s)", (locale) => {
    const { t } = getAppT(locale)
    const html = renderToStaticMarkup(<PublicStorefrontCard storefront={storefront} locale={locale} />)
    const container = document.createElement("div")
    container.innerHTML = html
    expect(container.querySelector("h1")?.textContent).toBe(storefront.name)
    expect(container.textContent).toContain(storefront.description)
    expect(container.textContent).toContain(t("shops:publicStorefront.origin", { name: "ANTSIA" }))
    expect(container.textContent).toContain(t("shops:badges.community"))
    expect(container.textContent).toContain(t("shops:models.products"))
    expect(container.querySelectorAll("[aria-labelledby=public-storefront-about] dt").length).toBe(3)
    expect(container.querySelector("a")?.getAttribute("href")).toBe(routes.storefront("atelier"))
    expect(container.querySelector("button, form")).toBeNull()
    expect(html).not.toContain(routes.officialPage("atelier"))
  })

  it("ne crée aucune URL ni image pour les médias retenus projetés à null", () => {
    const html = renderToStaticMarkup(<PublicStorefrontCard storefront={storefront} locale="fr" />)
    expect(html).not.toContain("<img")
    expect(html).not.toContain("src=")
    expect(html).not.toContain("_storage")
  })

  it("rend seulement les médias gardés et garde le modèle services distinct sans inventer d’offre", () => {
    const value: PublicStorefront = { ...storefront, model: "quote_services", logoUrl: "https://media.example/logo.jpg", bannerUrl: "https://media.example/banner.jpg", hours: null }
    const html = renderToStaticMarkup(<PublicStorefrontCard storefront={value} locale="fr" />)
    const container = document.createElement("div")
    container.innerHTML = html
    expect(Array.from(container.querySelectorAll("img")).map((image) => image.getAttribute("src"))).toEqual([value.bannerUrl, value.logoUrl])
    expect(container.querySelectorAll("[aria-labelledby=public-storefront-about] dt").length).toBe(2)
    expect(container.textContent).toContain(getAppT("fr").t("shops:models.quote_services"))
    expect(container.querySelector("button, form, [role=tablist]")).toBeNull()
  })

  it.each(["catalog", "services"] as const)("le bandeau %s mène au vrai catalogue sans retirer le contenu injecté ni l’accès membre", (block) => {
    const value: PublicStorefront = { ...storefront, blocks: ["about", block] }
    const html = renderToStaticMarkup(<PublicStorefrontCard storefront={value} locale="fr" catalog={<section data-real-catalog>Contenu du catalogue</section>} />)
    const container = document.createElement("div")
    container.innerHTML = html
    const links = Array.from(container.querySelectorAll("a"))
    const catalogLink = links.find((link) => link.textContent === getAppT("fr").t("shops:catalog.openCatalog"))
    expect(catalogLink?.getAttribute("href")).toBe(routes.publicShopCatalog(value.handle))
    expect(links.some((link) => link.getAttribute("href") === routes.storefront(value.handle))).toBe(true)
    expect(container.querySelector("[data-real-catalog]")?.textContent).toBe("Contenu du catalogue")
    expect(container.textContent).toContain(value.description)
    expect(container.querySelector("button, form")).toBeNull()
  })

  it("une vitrine sans bloc catalogue conserve la présentation sans promettre de produits", () => {
    const html = renderToStaticMarkup(<PublicStorefrontCard storefront={storefront} locale="fr" />)
    const container = document.createElement("div")
    container.innerHTML = html
    expect(Array.from(container.querySelectorAll("a")).some((link) => link.getAttribute("href") === routes.publicShopCatalog(storefront.handle))).toBe(false)
    expect(container.querySelector("ul, img")).toBeNull()
    expect(container.textContent).toContain(storefront.specialty)
  })

  it("échappe les textes usagers et distingue l’origine projetée d’une mention dans la description", () => {
    const value: PublicStorefront = { ...storefront, name: '<script>Atelier</script>', description: 'Origine : FAUSSE <img onerror="injection()">', origin: { slug: "antsia", name: '<svg onload="injection()">ANTSIA</svg>' } }
    const html = renderToStaticMarkup(<PublicStorefrontCard storefront={value} locale="fr" />)
    const container = document.createElement("div")
    container.innerHTML = html
    expect(container.querySelector("h1")?.textContent).toBe(value.name)
    expect(container.textContent).toContain(value.description)
    expect(container.textContent).toContain(getAppT("fr").t("shops:publicStorefront.origin", { name: value.origin.name }))
    // Les seuls SVG admis sont les icônes de l'interface (Lucide) ; aucun balisage venu des textes usagers.
    expect(container.querySelector("script, img, svg:not(.lucide), [onerror], [onload]")).toBeNull()
    expect(html).toContain("&lt;script&gt;")
  })
})


afterEach(() => { vi.useRealTimers() })

describe("SU06 — plat du jour rendu sans fournisseur membre", () => {
  it.each(["fr", "en"] as const)("rend le produit public et son lien public dans le HTML initial (%s)", locale => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.UTC(2026, 9, 24, 10))
    const value: PublicStorefront = { ...storefront, blocks: ["catalog", "about"], activityConfiguration: { version: 1, capabilities: ["products"], template: "food", blocks: ["catalog", "about"] } }
    const special = { version: 1 as const, day: "2026-10-24", offer: catalogOfferFixture({ title: "Menu du marché", description: "Le plat admis aujourd'hui." }) }
    const html = renderToStaticMarkup(<PublicStorefrontCard storefront={value} locale={locale} dailySpecial={special} />)
    const container = document.createElement("div")
    container.innerHTML = html
    expect(container.querySelector("[data-daily-special]")?.textContent).toContain("Menu du marché")
    expect(container.querySelector("[data-daily-special] a")?.getAttribute("href")).toBe(routes.publicShopOffer(value.handle, special.offer.offerRef))
    expect(container.textContent).toContain(getAppT(locale).t("shops:food.seeMenu"))
    expect(container.querySelector("[data-daily-special] form, [data-daily-special] button")).toBeNull()
    expect(container.querySelector("h1")?.textContent).toBe(storefront.name)
  })

  it("un plat d'hier, d'une autre boutique ou d'une autre activité n'est pas annoncé", () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.UTC(2026, 9, 24, 10))
    const food: PublicStorefront = { ...storefront, activityConfiguration: { version: 1, capabilities: ["products"], template: "food", blocks: ["catalog", "about"] } }
    const special = { version: 1 as const, day: "2026-10-24", offer: catalogOfferFixture() }
    for (const html of [
      renderToStaticMarkup(<PublicStorefrontCard storefront={food} locale="fr" dailySpecial={{ ...special, day: "2026-10-23" }} />),
      renderToStaticMarkup(<PublicStorefrontCard storefront={food} locale="fr" dailySpecial={{ ...special, offer: { ...special.offer, shopHandle: "autre" } }} />),
      renderToStaticMarkup(<PublicStorefrontCard storefront={storefront} locale="fr" dailySpecial={special} />),
    ]) expect(html).not.toContain("data-daily-special")
  })
})
