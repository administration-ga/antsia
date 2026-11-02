import { getFunctionName } from "convex/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ query: vi.fn(), viewer: vi.fn() }))
vi.mock("convex/nextjs", () => ({ fetchQuery: mocks.query }))
vi.mock("./server-session", () => ({ getServerViewer: mocks.viewer, withinBridgeDeadline: (work: () => Promise<unknown>) => work(), configuredMetadataOrigin: () => "https://antsia.ga" }))

import { loadPublicDailySpecial, loadPublicStorefront, publicDailySpecialSchema, publicStorefrontSchema } from "./public-shops-data"

import { catalogOfferFixture } from "@/components/shops/__tests__/catalog-fixtures"

const storefront = { handle: "atelier", name: "Atelier partagé", description: "Une présentation commerciale publique.", logoUrl: null, bannerUrl: null, model: "products", specialty: "Artisanat", serviceArea: "Libreville", hours: null, badge: "community", blocks: ["about"], publishedAt: 1_700_000_000_000, origin: { slug: "antsia", name: "ANTSIA" } }

beforeEach(() => {
  mocks.query.mockReset()
  mocks.viewer.mockReset()
  mocks.viewer.mockResolvedValue({ status: "anonymous" })
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "http://localhost:3210")
})

describe("vitrine publique — projection fermée et porte de session partagée", () => {
  it("admet la configuration publique MP02 et refuse ses extensions privées ou incohérentes", () => {
    const configuration = { version: 1, capabilities: ["products", "services"], template: "fashion", blocks: ["services", "about", "catalog"] }
    expect(publicStorefrontSchema.safeParse({ ...storefront, activityConfiguration: configuration }).success).toBe(true)
    for (const value of [{ ...configuration, version: 2 }, { ...configuration, bankAccount: "private" }, { ...configuration, capabilities: ["products"], blocks: ["services"] }, { ...configuration, blocks: ["about", "about"] }]) {
      expect(publicStorefrontSchema.safeParse({ ...storefront, activityConfiguration: value }).success).toBe(false)
    }
  })
  it("ne requête rien pour un transfert en attente ni une session refusée", async () => {
    expect(await loadPublicStorefront("atelier", true)).toEqual({ status: "handoff" })
    expect(mocks.viewer).not.toHaveBeenCalled()
    mocks.viewer.mockResolvedValue({ status: "refused" })
    expect(await loadPublicStorefront("atelier")).toEqual({ status: "refused" })
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it("ne rabaisse pas une panne de résolution de session en visite anonyme", async () => {
    mocks.viewer.mockResolvedValue({ status: "unavailable" })
    expect(await loadPublicStorefront("atelier")).toEqual({ status: "unavailable" })
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it("transmet racine et jeton uniquement à la projection dédiée, puis valide le DTO", async () => {
    mocks.viewer.mockResolvedValue({ status: "authenticated", token: "TEST-JWT" })
    mocks.query.mockImplementation(async (reference, args, options) => {
      if (getFunctionName(reference).endsWith(":getBySlug")) return { _id: "root-test" }
      expect(getFunctionName(reference)).toBe("modules/public/shops:getStorefront")
      expect(args).toEqual({ networkId: "root-test", handle: "atelier" })
      expect(options.token).toBe("TEST-JWT")
      return storefront
    })
    expect(await loadPublicStorefront("atelier")).toEqual({ status: "ready", data: storefront, viewer: "authenticated" })
  })

  it("refuse tout champ privé, y compris dans l’origine, au lieu de le transmettre au SSR", async () => {
    expect(publicStorefrontSchema.safeParse(storefront).success).toBe(true)
    for (const extra of [{ pageId: "private" }, { shopId: "private" }, { signatories: ["private"] }, { contact: "private@example.test" }, { viewer: { manages: true } }]) {
      expect(publicStorefrontSchema.safeParse({ ...storefront, ...extra }).success).toBe(false)
    }
    expect(publicStorefrontSchema.safeParse({ ...storefront, origin: { ...storefront.origin, signatoryPersonId: "private" } }).success).toBe(false)
    mocks.query.mockImplementation(async (reference) => getFunctionName(reference).endsWith(":getBySlug") ? { _id: "root-test" } : { ...storefront, contact: "private@example.test" })
    expect(await loadPublicStorefront("atelier")).toEqual({ status: "unavailable" })
  })

  it("admet les images nulles, refuse les schémas actifs, les identifiants d’URL et les modèles non ouverts", () => {
    for (const url of ["javascript:alert(1)", "data:image/svg+xml,private", "https://user:pass@media.example/logo.jpg"]) {
      expect(publicStorefrontSchema.safeParse({ ...storefront, logoUrl: url }).success).toBe(false)
      expect(publicStorefrontSchema.safeParse({ ...storefront, bannerUrl: url }).success).toBe(false)
    }
    expect(publicStorefrontSchema.safeParse({ ...storefront, logoUrl: "https://media.example/logo.jpg" }).success).toBe(true)
    expect(publicStorefrontSchema.safeParse({ ...storefront, model: "appointments" }).success).toBe(false)
  })

  it("conserve un retrait indistinct sous null et un refus métier sans son motif privé", async () => {
    mocks.query.mockImplementation(async (reference) => getFunctionName(reference).endsWith(":getBySlug") ? { _id: "root-test" } : null)
    expect(await loadPublicStorefront("retired")).toEqual({ status: "ready", data: null, viewer: "anonymous" })
    mocks.query.mockImplementation(async (reference) => {
      if (getFunctionName(reference).endsWith(":getBySlug")) return { _id: "root-test" }
      throw { data: { code: "membershipSuspended", privateReason: "never shown" } }
    })
    expect(await loadPublicStorefront("retired")).toEqual({ status: "refused" })
  })
})


describe("plat du jour public — projection facultative et fermée", () => {
  const special = () => ({ version: 1, day: "2026-10-24", offer: catalogOfferFixture() })

  it("ne change pas le DTO historique, valide la version, la date et le produit public", () => {
    expect(publicDailySpecialSchema.safeParse(special()).success).toBe(true)
    expect(publicStorefrontSchema.safeParse({ ...storefront, dailySpecial: special() }).success).toBe(false)
    for (const value of [
      { ...special(), version: 2 }, { ...special(), day: "2026-02-30" }, { ...special(), secret: "private" },
      { ...special(), offer: { ...special().offer, kind: "service" } },
      { ...special(), offer: { ...special().offer, shopId: "private" } },
    ]) expect(publicDailySpecialSchema.safeParse(value).success).toBe(false)
  })

  it("utilise seulement la nouvelle projection et lie le plat à sa vitrine", async () => {
    mocks.query.mockImplementation(async (reference, args) => {
      if (getFunctionName(reference).endsWith(":getBySlug")) return { _id: "root-test" }
      expect(getFunctionName(reference)).toBe("modules/public/shops:getDailySpecial")
      expect(args).toEqual({ networkId: "root-test", handle: "atelier" })
      return special()
    })
    expect(await loadPublicDailySpecial("atelier")).toEqual({ status: "ready", viewer: "anonymous", data: special() })
    mocks.query.mockImplementation(async reference => getFunctionName(reference).endsWith(":getBySlug") ? { _id: "root-test" } : { ...special(), offer: { ...special().offer, shopHandle: "autre" } })
    expect(await loadPublicDailySpecial("atelier")).toEqual({ status: "unavailable" })
  })

  it("ne fait aucune lecture pendant le transfert ou après un refus de session", async () => {
    expect(await loadPublicDailySpecial("atelier", true)).toEqual({ status: "handoff" })
    mocks.viewer.mockResolvedValue({ status: "refused" })
    expect(await loadPublicDailySpecial("atelier")).toEqual({ status: "refused" })
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it("un ancien backend absent ne déclenche aucune query membre ni repli", async () => {
    mocks.query.mockImplementation(async reference => {
      if (getFunctionName(reference).endsWith(":getBySlug")) return { _id: "root-test" }
      throw new Error("Could not find public function")
    })
    expect(await loadPublicDailySpecial("atelier")).toEqual({ status: "unavailable" })
    expect(mocks.query.mock.calls.map(([reference]) => getFunctionName(reference))).toEqual(["modules/networks/networks:getBySlug", "modules/public/shops:getDailySpecial"])
  })
})
