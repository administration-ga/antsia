// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { catalogOfferFixture, catalogPageFixture } from "@/components/shops/__tests__/catalog-fixtures"
import type { CatalogOffer } from "@/components/shops/catalog-model"
import { getAppT } from "@/i18n/server"
import type { PublicStorefront } from "@/lib/public-shops-data"
import { routes } from "@/lib/routes"
import { ProviderContent } from "./provider-content"
import { ProviderPortfolio, providerPortfolio } from "./provider-portfolio"
import { PublicProviderContent } from "./provider-public-content"
import { ServiceProfileDetails, serviceProfileOf } from "./service-profile-details"

const storefront: PublicStorefront = { handle: "atelier", name: "Studio partagé", description: "Création de photos professionnelles.", logoUrl: null, bannerUrl: null, model: "quote_services", specialty: "Photographie", serviceArea: "Libreville", hours: "Sur rendez-vous", badge: "community", blocks: ["services", "publications", "about"], publishedAt: 1_700_000_000_000, origin: { slug: "antsia", name: "ANTSIA" } }
const profile: NonNullable<CatalogOffer["serviceProfile"]> = { version: 1, commercialModes: ["quote"], languageCodes: ["fr-GA", "en"], zones: [{ countryCode: "GA", locality: "Libreville" }], deliverables: ["Photos retouchées"], inclusions: ["Éclairage"], exclusions: ["Déplacement"], portfolio: [{ title: "Lumière naturelle", description: "Une série en extérieur", mediaIndexes: [0, 1] }] }
const offer = catalogOfferFixture({ kind: "service", title: "Portrait professionnel", variants: [], serviceProfile: profile, facets: { taxonomyVersion: 1, categoryPath: ["services", "services.creative"], attributes: [{ key: "durationMinutes", type: "number", value: 60 }] }, media: [{ url: "https://hidden.example/private.jpg", withheld: "fileScanPending", altText: "Retenu", width: 800, height: 800 }, { url: "https://media.example/portrait.jpg", withheld: null, altText: "Portrait", width: 800, height: 800 }] })
function translations(locale: "fr" | "en" = "fr") { const { t } = getAppT(locale); return { t: (key: string, options?: Record<string, unknown>) => t(`provider:${key}`, options), shopT: (key: string, options?: Record<string, unknown>) => t(`shops:${key}`, options) } }
function dom(html: string) { const container = document.createElement("div"); container.innerHTML = html; return container }

describe("MP06 — présentation prestataire et profil publics", () => {
  it.each(["fr", "en"] as const)("rend les six sections au SSR sans contexte privé (%s)", locale => {
    const catalog = catalogPageFixture({ page: [offer], isDone: false, continueCursor: "next", indexStatus: "ready" })
    const html = renderToStaticMarkup(<PublicProviderContent storefront={storefront} catalog={catalog} locale={locale} viewer="anonymous" />)
    const container = dom(html)
    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(container.querySelector("h1")?.textContent).toBe(storefront.name)
    expect(container.querySelectorAll('nav a[href^="#provider-"]')).toHaveLength(6)
    expect(container.textContent).toContain(offer.title)
    expect(container.textContent).toContain(profile.portfolio[0]!.title)
    expect(container.textContent).toContain(translations(locale).t("availability.onRequest"))
    expect(container.textContent).toContain(translations(locale).t("reviews.unavailable"))
    expect([...container.querySelectorAll("a")].some(link => link.getAttribute("href") === routes.publicProviderCatalog("atelier", { kind: "service" }, "next"))).toBe(true)
    expect(container.querySelector("form, button, [role=grid], [data-service-request]")).toBeNull()
    expect(html).not.toContain("https://hidden.example")
    expect(html).not.toContain("rating")
  })
  it("le contenu membre réserve le h1 et main à sa coque, et garde le suivi privé en lien", () => {
    const html = renderToStaticMarkup(<ProviderContent storefront={storefront} catalog={catalogPageFixture({ page: [offer] })} audience="member" locale="fr" viewer="authenticated" {...translations()} />)
    const container = dom(html)
    expect(container.querySelector("h1, main")).toBeNull()
    expect([...container.querySelectorAll("a")].some(link => link.getAttribute("href") === routes.serviceRequests())).toBe(true)
    // Le retour au fil appartient à la coque spécialisée (MP01, specialized-page.test) ; le contenu mène à la page sociale.
    expect([...container.querySelectorAll("a")].some(link => link.getAttribute("href") === routes.page("atelier"))).toBe(true)
  })
  it("n'infère aucune modalité depuis un tarif fixe et donne un état honnête pour l'ancien catalogue", () => {
    const t = translations().t
    const container = dom(renderToStaticMarkup(<ServiceProfileDetails offer={offer} locale="fr" t={t} />))
    expect(container.textContent).toContain("Sur devis")
    expect(container.textContent).not.toContain("Prestation à commander")
    expect(container.textContent).toContain("Photos retouchées")
    expect(container.textContent).toContain("60 min")
    const legacy = catalogOfferFixture({ kind: "service" })
    expect(serviceProfileOf(legacy)).toBeNull()
    const old = dom(renderToStaticMarkup(<ServiceProfileDetails offer={legacy} locale="fr" t={t} />))
    expect(old.textContent).toContain(t("profile.unknown"))
    expect(old.textContent).not.toContain("Sur devis")
  })
  it("une absence de portfolio ne devient pas une preuve client et la suite du catalogue reste accessible", () => {
    const legacy = catalogOfferFixture({ kind: "service" })
    const container = dom(renderToStaticMarkup(<PublicProviderContent storefront={storefront} catalog={catalogPageFixture({ page: [legacy], isDone: false, continueCursor: "next" })} locale="fr" viewer="anonymous" />))
    expect(container.textContent).toContain(translations().t("portfolio.empty"))
    expect([...container.querySelectorAll("a")].some(link => link.textContent === translations().t("actions.nextCatalog"))).toBe(true)
    expect(container.textContent).not.toContain(translations().t("reviews.requests"))
  })
  it("ne mélange ni une autre activité ni un indice d'un manifeste absent", () => {
    expect(providerPortfolio([offer, { ...offer, shopHandle: "other" }], "atelier")).toHaveLength(1)
    expect(serviceProfileOf({ ...offer, media: offer.media.slice(0, 1) })).toBeNull()
    const container = dom(renderToStaticMarkup(<ProviderPortfolio offers={[offer]} handle="atelier" audience="public" t={translations().t} />))
    expect(container.querySelectorAll("img")).toHaveLength(1)
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://media.example/portrait.jpg")
    expect(container.textContent).toContain(translations().t("portfolio.mediaWithheld"))
  })
  it("refuse de présenter une activité produits comme prestataire", () => {
    expect(renderToStaticMarkup(<PublicProviderContent storefront={{ ...storefront, model: "products" }} catalog={catalogPageFixture()} locale="fr" viewer="anonymous" />)).toBe("")
  })
})
