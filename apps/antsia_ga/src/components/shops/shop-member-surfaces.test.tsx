import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ data: null as unknown, isError: false }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: { shops: { getMyShop: "editor", storefront: "storefront", updateShop: "update", generateShopLogoUploadUrl: "upload", setShopLogo: "logo", setStorefrontAudience: "audience", requestStorefrontPublication: "request", cancelPublicationRequest: "cancel", withdrawStorefront: "withdraw" } }, pages: { pages: { follow: "follow", unfollow: "unfollow" } }, commercialMessaging: { threads: { findMyThread: "existingThread" } } } } }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (reference: string) => ({ data: reference === "existingThread" ? null : state.data, isError: state.isError, isPending: false, refetch: vi.fn() }) }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "root", personId: "reader" }) }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: true }), useMutation: () => vi.fn() }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: import("react").ReactNode }) => <main>{children}</main> }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { resolvedLanguage: "fr" }, t: (key: string, options?: Record<string, unknown>) => options?.version ? `${key}:${options.version}` : key }) }))
// P15 : l'aperçu des offres d'emploi garde ses propres tests ; ici, aucune offre reçue (écrit, non exécuté).
vi.mock("@/components/jobs/member-shop-jobs-screen", () => ({ MemberShopJobsPreview: () => null }))
vi.mock("./catalog-member-screen", () => ({ MemberCatalogPreview: () => <div data-testid="catalog-preview" /> }))

import { MemberStorefront, MemberStorefrontScreen } from "./member-storefront-screen"
import { ShopPublicationForm } from "./shop-publication-form"
import { PresentationPreview } from "./shop-presentation-form"
import { editorFixture, storefrontFixture } from "./__tests__/fixtures"
import { centeringClasses, frameClasses } from "./__tests__/frame-classes"

beforeEach(() => { state.data = null; state.isError = false })
describe("Surfaces membre boutiques", () => {
  it("closed garde une action de préparation et ne rend aucune commande de publication", () => {
    const shop = { ...editorFixture(), policy: "closed" as const }
    const html = renderToStaticMarkup(<ShopPublicationForm shop={shop} dirty={false} onDirty={() => undefined} onPrepare={() => undefined} />)
    expect(html).toContain("publication.closed")
    expect(html).toContain("publication.prepare")
    expect(html).not.toContain(">publication.request<")
    expect(html).not.toContain(">publication.publish<")
    expect(html).not.toMatch(/payer|checkout-button|payment-button/i)
  })
  it("le consentement est distinct, initialement décoché et associé à la version serveur", () => {
    const html = renderToStaticMarkup(<ShopPublicationForm shop={editorFixture()} dirty={false} onDirty={() => undefined} onPrepare={() => undefined} />)
    expect(html).toContain("publication.publicConsent")
    expect(html).toContain("publication.consentVersion:2026-10-18")
    expect(html).not.toMatch(/type="checkbox"[^>]*checked=/)
    expect(html).toContain("publication.notPublicNow")
  })
  it("les changements non enregistrés ferment la demande", () => {
    const html = renderToStaticMarkup(<ShopPublicationForm shop={editorFixture()} dirty onDirty={() => undefined} onPrepare={() => undefined} />)
    expect(html).toContain("publication.saveFirst")
    expect(html).not.toContain(">publication.request<")
  })
  it("une vitrine about seul n'invente ni catalogue, publications, contact ni version publique", () => {
    const html = renderToStaticMarkup(<MemberStorefront shop={storefrontFixture()} />)
    expect(html).toContain("storefront.about")
    expect(html).toContain("badges.community")
    expect(html).not.toContain("blocks.catalog")
    expect(html).not.toContain("storefront.socialPage")
    expect(html).not.toContain("storefront.publicVersion")
    expect(html).not.toMatch(/mailto:|tel:|\/messages/)
  })
  it("une query refusée ne laisse pas apparaître un DTO précédent", () => {
    state.data = storefrontFixture(); state.isError = true
    const html = renderToStaticMarkup(<MemberStorefrontScreen handle="atelier" />)
    expect(html).toContain("common.unavailableTitle")
    expect(html).not.toContain("Atelier des rives")
    expect(html).not.toContain("Une présentation autorisée.")
  })
  it("la vitrine occupe toute la colonne de l'espace, retour aligné sur le titre (décision du 22/10/2026)", () => {
    state.data = storefrontFixture()
    const classes = frameClasses(renderToStaticMarkup(<MemberStorefrontScreen handle="atelier" />))
    expect(classes).toContain("min-[768px]:[&>a]:self-start")
    expect(centeringClasses(classes)).toEqual([])
  })
  it("une boutique avec catalogue donne une entrée offres réelle sans créer de contact général", () => {
    const shop = { ...storefrontFixture(), blocks: ["catalog", "about"] as ReturnType<typeof storefrontFixture>["blocks"], viewer: { following: false, manages: true } }
    const html = renderToStaticMarkup(<MemberStorefront shop={shop} />)
    expect(html).toContain("/boutique/atelier/catalogue")
    expect(html).toContain("storefront.offers")
    expect(html).toContain("storefront.manageHint")
    expect(html).not.toContain("/boutique/atelier/contacter")
    expect(html).not.toContain(">Payer<")
  })
  it("l'aperçu téléphone rend les véritables champs du brouillon et précise sa nature", () => {
    const html = renderToStaticMarkup(<PresentationPreview values={{ name: "Brouillon personnel", description: "Présentation non publiée", specialty: "Couture", serviceArea: "Libreville", hours: "9 h–17 h" }} logoUrl={null} />)
    expect(html).toContain('data-shop-preview="phone"')
    expect(html).toContain("preview.draft")
    expect(html).toContain("Brouillon personnel")
    expect(html).toContain("Présentation non publiée")
    expect(html).toContain("preview.desktop")
  })
})
