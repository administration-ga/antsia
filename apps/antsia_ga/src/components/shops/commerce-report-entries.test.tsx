/**
 * UM-03 et volet commerce de MC-01 — « Signaler » sur la fiche d'offre et sous les conditions de la vitrine,
 * côté MEMBRE : présent quand le moteur rend la cible (autrui), absent sinon (le gérant ou son équipe ne la
 * reçoivent jamais) ; sous les conditions, seulement quand des conditions sont publiées. La brique commune a
 * ses propres tests (`ReportTarget.test.tsx`, `ReportContentDialog.reasons.test.tsx`) : ici, sa seule présence.
 */
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { I18nextProvider } from "react-i18next"
import { createAppI18n } from "@antsia/social-features/i18n"
import type { CommerceStorefrontTerms } from "@antsia/social-domain/commerce/storefrontTerms"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ offer: null as unknown }))
vi.mock("@antsia/social-features/features/reseau-personnel/report-content-entry", () => ({
  ReportTargetButton: ({ target }: { target: { kind: string; id: string } }) => <button type="button" data-report-target={`${target.kind}:${target.id}`}>Signaler</button>,
}))
vi.mock("@/components/shops/save-offer-button", () => ({ SaveOfferButton: () => <span data-save-offer /> }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: { catalog: { list: "list", offer: "offer", postOffer: "postOffer" }, shops: { storefront: "storefront", storefrontPause: "pause" }, checkout: { context: "checkoutContext" } }, pages: { pages: { follow: "follow", unfollow: "unfollow" } }, commercialMessaging: { threads: { findMyThread: "existingThread" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "root", personId: "reader" }) }))
vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: (reference: string) => ({ data: reference === "offer" ? mocks.offer : reference === "checkoutContext" ? { available: false, offer: null, pending: null } : reference === "list" ? { page: [], isDone: true, continueCursor: "", collections: [], filteredWindow: false } : null, isError: false, isPending: false, isFetching: false, refetch: vi.fn() }),
}))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => null }))
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: true }), useMutation: () => vi.fn() }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("@/components/jobs/member-shop-jobs-screen", () => ({ MemberShopJobsPreview: () => null }))

import type { Id } from "@antsia/api/engine"
import { appResources } from "@/i18n/resources"
import { catalogOfferFixture, OFFER_REF } from "./__tests__/catalog-fixtures"
import { storefrontFixture } from "./__tests__/fixtures"
import { MemberOfferScreen } from "./catalog-member-screen"
import { MemberStorefront } from "./member-storefront-screen"
import { StorefrontTerms } from "./storefront-terms"

const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "shops" })
function html(children: ReactNode) { return renderToStaticMarkup(<I18nextProvider i18n={i18n}>{children}</I18nextProvider>) }
const TERMS: CommerceStorefrontTerms = { version: 1, publishedAt: 1_792_281_600_000, returns: { summary: "Contactez la boutique avant tout retour." } }
const OFFER_TARGET = { kind: "commerceOffer" as const, id: "commerceCatalogHeads_1" as Id<"commerceCatalogHeads"> }
const TERMS_TARGET = { kind: "commerceStorefront" as const, id: "commerceCatalogHeads_2" as Id<"commerceCatalogHeads"> }

beforeEach(() => { mocks.offer = null })

describe("UM-03 — fiche d'offre membre", () => {
  it("l'offre d'autrui porte « Signaler » en dernier geste, avec la cible rendue par le moteur", () => {
    mocks.offer = { ...catalogOfferFixture(), reportTarget: OFFER_TARGET }
    const value = html(<MemberOfferScreen handle="atelier" offerRef={OFFER_REF} />)
    expect(value).toContain(`data-report-target="commerceOffer:${OFFER_TARGET.id}"`)
    // Dernier geste de la rangée : après « Enregistrer ».
    expect(value.indexOf("data-report-target")).toBeGreaterThan(value.indexOf("data-save-offer"))
  })

  it("sans cible (sa propre offre, ou celle de son équipe) : aucun bouton", () => {
    mocks.offer = catalogOfferFixture()
    const value = html(<MemberOfferScreen handle="atelier" offerRef={OFFER_REF} />)
    expect(value).toContain("Sac artisanal")
    expect(value).not.toContain("data-report-target")
  })
})

describe("UM-03 — conditions de la vitrine membre", () => {
  it("les conditions d'autrui se signalent sous leurs rubriques", () => {
    const value = html(<MemberStorefront shop={{ ...storefrontFixture(), storefrontTerms: TERMS, reportTarget: TERMS_TARGET }} />)
    expect(value).toContain("data-storefront-terms-action")
    expect(value).toContain(`data-report-target="commerceStorefront:${TERMS_TARGET.id}"`)
  })

  it("le gérant (aucune cible) n'a aucun bouton ; sans conditions publiées, rien à signaler", () => {
    const own = html(<MemberStorefront shop={{ ...storefrontFixture(), storefrontTerms: TERMS, viewer: { following: false, manages: true } }} />)
    expect(own).not.toContain("data-report-target")
    const empty = html(<StorefrontTerms value={undefined} locale="fr" t={(key: string) => key} action={<span data-report-target="x" />} />)
    expect(empty).not.toContain("data-report-target")
    expect(empty).toContain("data-storefront-terms")
  })
})
