// @vitest-environment edge-runtime
/** P09 : scénarios backend rédigés seulement ; aucune commande de test exécutée. */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { COMMERCE_PUBLIC_CONTRACT, COMMERCE_PUBLIC_CONTRACT_V2, commerceCanonicalJson, type CommercePublicContract } from "@antsia/social-domain/commerce/primitives"
import type { CommerceServiceProfile } from "@antsia/social-domain/commerce/serviceProfile"
import type { CommerceCatalogFacets } from "@antsia/social-domain/commerce/catalogFacets"
import { commercePublicEffect, type CommerceMedia, type CommerceOfferEvent, type CommercePublicEvent, type CommerceShopEvent } from "@antsia/social-domain/commerce/projection"
import { COMMERCE_LINK_CONSENT_VERSION } from "@antsia/social-domain/commerce-link"
import { federationSigningText } from "@antsia/social-domain/federationProtocol"
import { makeFunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, testConvex } from "../../test.setup"
import type { CatalogMediaLeaseArgs } from "../federation/commerceCatalogMedia"
import { applyCommerceCatalog } from "../federation/commerceCatalog"
import { readCommerceLinkConfig } from "./commerceLinkConfig"
import { SHOP_PUBLIC_LISTING_TEXT_VERSION } from "./rules"
import type { CatalogListArgs } from "./catalogRead"
import type { PublicDailySpecial, PublicStorefront, Storefront } from "./validators"
import type { CommerceStorefrontTerms } from "@antsia/social-domain/commerce/storefrontTerms"
import { marketplaceIndexFields } from "./marketplaceIndexFields"
import type { CatalogList, CatalogOffer } from "./catalogValidators"
import { STORY_ACTIVE_PER_AUTHOR_MAX } from "@antsia/social-domain/stories"
import { referencesIn, shapeFor, exportableRecord } from "../people/dataInventory"
import { ERASURE_GRACE_MS } from "../people/erasure"

const NOW = Date.UTC(2026, 9, 18, 12)
const SHOP = "pro.ga:structure:01JA00000000000000000000S1", OFFER = "pro.ga:offer:01JA00000000000000000000P1"
const LINK = "pro.ga:commerce_link:01JA00000000000000000000K1", COLLECTION = "pro.ga:offer_collection:01JA00000000000000000000C1"
const VARIANT = "pro.ga:offer_variant:01JA00000000000000000000V1"
const KEY_NAME = "ANTSIA_FEDERATION_CATALOG_TEST_KEY", KEY = "catalogue-test-secret-key-sandbox-0123456789"
let eventSequence = 0
type ShopArgs = { networkId: Id<"networks">; shopId: Id<"shops"> }
const policy = makeFunctionReference<"mutation", { networkId: Id<"networks">; enabled: boolean; reason: string }, null>("modules/shops/catalogControl:setPolicy")
const mapping = makeFunctionReference<"mutation", ShopArgs & { emitterId: Id<"federationEmitters">; enabled: boolean; reason: string }, null>("modules/shops/catalogControl:configureMapping")
const getOffer = makeFunctionReference<"query", { networkId: Id<"networks">; handle: string; offerRef: string }, CatalogOffer | null>("modules/shops/catalog:offer")
const getPublicOffer = makeFunctionReference<"query", { networkId: Id<"networks">; handle: string; offerRef: string }, CatalogOffer | null>("modules/public/catalog:offer")
const list = makeFunctionReference<"query", CatalogListArgs & { networkId: Id<"networks"> }, CatalogList>("modules/shops/catalog:list")
const publicList = makeFunctionReference<"query", CatalogListArgs & { networkId: Id<"networks"> }, CatalogList>("modules/public/catalog:list")
const memberStorefront = makeFunctionReference<"query", { networkId: Id<"networks">; handle: string }, Storefront | null>("modules/shops/shops:storefront")
const publicStorefront = makeFunctionReference<"query", { networkId: Id<"networks">; handle: string }, PublicStorefront | null>("modules/public/shops:getStorefront")
const publicDailySpecial = makeFunctionReference<"query", { networkId: Id<"networks">; handle: string }, PublicDailySpecial | null>("modules/public/shops:getDailySpecial")
const slot = makeFunctionReference<"query", { networkId: Id<"networks">; postId: Id<"posts"> }, CatalogOffer | null>("modules/shops/catalog:postOffer")
const setSlot = makeFunctionReference<"mutation", ShopArgs & { postId: Id<"posts">; offerRef: string | null }, { changed: true }>("modules/shops/catalogPosts:setPostOffer")
const claim = makeFunctionReference<"mutation", CatalogMediaLeaseArgs, boolean>("modules/federation/commerceCatalogMedia:claim")
const stage = makeFunctionReference<"mutation", CatalogMediaLeaseArgs & { index: number; storageId: Id<"_storage">; publicToken: string }, boolean>("modules/federation/commerceCatalogMedia:stage")
const complete = makeFunctionReference<"mutation", CatalogMediaLeaseArgs, boolean>("modules/federation/commerceCatalogMedia:complete")

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW); eventSequence = 0
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.stubEnv("FEDERATION_ENVIRONMENT", "sandbox")
  vi.stubEnv(KEY_NAME, KEY)
  vi.stubEnv("ANTSIA_COMMERCE_ENVIRONMENT", "sandbox")
  vi.stubEnv("ANTSIA_COMMERCE_SOURCE", "antsia")
  vi.stubEnv("ANTSIA_COMMERCE_PRO_HTTP_ORIGIN", "http://localhost:4010")
  vi.stubEnv("ANTSIA_COMMERCE_PRO_APP_ORIGIN", "http://localhost:4011")
  vi.stubEnv("ANTSIA_COMMERCE_ORIGIN", "http://localhost:3030")
  vi.stubEnv("ANTSIA_COMMERCE_KEY_ID", "antsia-catalog-test")
  vi.stubEnv("ANTSIA_COMMERCE_SIGNING_KEY", KEY)
  vi.stubEnv("ANTSIA_CATALOG_MEDIA_ORIGIN", "http://localhost:3211")
  vi.stubEnv("FILE_GUARD", "off")
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

async function fixture(contracts: readonly CommercePublicContract[] = [COMMERCE_PUBLIC_CONTRACT]) {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const as = t.withIdentity({ subject: "catalogue-operator-fixture" })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle: "catalogue-owner", displayName: "Catalogue" })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  await t.run(async (ctx) => ctx.db.insert("operators", { personId, role: "platform_admin", grantedAt: NOW }))
  await createTestOperatorProof(t, as, personId)
  const config = await readCommerceLinkConfig()
  if (!config) throw new Error("Configuration de fixture absente")
  const owned = await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", { networkId: root, handle: "catalogue-test", name: "Boutique de recette", description: "Activité de recette", ownerKind: "company", trust: "community", trustRank: 1, visibility: "network", onRoot: true, status: "active", createdByPersonId: personId, searchText: "boutique recette", createdAt: NOW, updatedAt: NOW })
    const signatoryId = await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const shopId = await ctx.db.insert("shops", { networkId: root, pageId, preparedByPersonId: personId, model: "products", storefront: "published", visibility: "network", publicConsentAt: NOW, publicConsentTextVersion: SHOP_PUBLIC_LISTING_TEXT_VERSION, publicConsentByPersonId: personId, publishedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const linkId = await ctx.db.insert("shopCommerceLinks", { networkId: root, shopId, pageId, personId, state: "active", source: "antsia", environment: "sandbox", configFingerprint: config.fingerprint, subjectRef: `antsia:sub:${"a".repeat(32)}`, antsiaShopRef: `antsia:shop:${"b".repeat(32)}`, shopRef: SHOP, linkRef: LINK, permissions: ["publish_catalog"], consentTextVersion: COMMERCE_LINK_CONSENT_VERSION, consentedAt: NOW, linkedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("shopNetworkPolicies", { networkId: root, storefront: "review", updatedAt: NOW })
    await ctx.db.insert("moderationPolicies", { networkId: root, surface: "commerceOffer", preReview: false, maxLinks: 20, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    return { pageId, signatoryId, shopId, linkId }
  })
  const emitterId = await as.mutation(api.modules.federation.emitters.configure, { networkId: root, slug: "pro-catalog-test", environment: "sandbox", enabled: true, keyEnvName: KEY_NAME, allowedContracts: [...contracts], reason: "Émetteur fictif du catalogue dans le harnais" })
  await as.mutation(policy, { networkId: root, enabled: true, reason: "Politique fictive de lecture du catalogue" })
  await as.mutation(mapping, { networkId: root, shopId: owned.shopId, emitterId, enabled: true, reason: "Mapping fictif de la boutique et du catalogue" })
  return { t, as, root, personId, emitterId, ...owned, offerArgs: { networkId: root, handle: "catalogue-test", offerRef: OFFER } }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

function shop(revision = 1, extra: Partial<CommerceShopEvent> = {}): CommerceShopEvent {
  return { type: revision === 1 ? "shop.published" : "shop.updated", shopRef: SHOP, linkRef: LINK, revision, changedAt: NOW, commercialName: "Activité", country: "GA", currency: "XAF", sellerVerification: "unverified", capabilities: ["catalog"], collections: [{ collectionRef: COLLECTION, label: "Collection", position: 0 }], ...extra }
}
function offer(revision = 1, extra: Partial<CommerceOfferEvent> = {}): CommerceOfferEvent {
  return { type: revision === 1 ? "offer.published" : "offer.updated", shopRef: SHOP, offerRef: OFFER, revision, changedAt: NOW, kind: "product", title: "Article de recette", description: "Une description publique du produit.", collectionRefs: [COLLECTION], tags: ["recette"], price: { mode: "fixed", currency: "XAF", amount: 12_000 }, showsAvailability: true, variants: [], variantAxes: [], media: [], ...extra }
}
function bodyOf(payload: CommercePublicEvent, contract: CommercePublicContract = COMMERCE_PUBLIC_CONTRACT) {
  return commerceCanonicalJson({ contract, eventId: `catalog-event-${++eventSequence}`, objectRef: commercePublicEffect(payload).objectRef, payload, version: 1 })!
}
async function deliver(f: Fixture, payload: CommercePublicEvent, contract: CommercePublicContract = COMMERCE_PUBLIC_CONTRACT) {
  const raw = bodyOf(payload, contract)
  const timestamp = String(Math.floor(Date.now() / 1000))
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(federationSigningText("sandbox", timestamp, raw)))
  const signature = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("")
  return await f.t.fetch("/federation/inbox", { method: "POST", body: raw, headers: { "x-antsia-emitter": "pro-catalog-test", "x-antsia-environment": "sandbox", "x-antsia-timestamp": timestamp, "x-antsia-signature": signature } })
}
async function applied(f: Fixture, payload: CommercePublicEvent, contract: CommercePublicContract = COMMERCE_PUBLIC_CONTRACT) { const response = await deliver(f, payload, contract); expect(response.status).toBe(202); expect(await response.json()).toMatchObject({ status: "applied", applicationStatus: "applied" }) }
async function published(f: Fixture, payload = offer()) { await applied(f, shop()); await applied(f, payload) }
async function head(f: Fixture) { return await f.t.run(async (ctx) => ctx.db.query("commerceCatalogHeads").withIndex("by_emitter_object_sequence", (q) => q.eq("emitterId", f.emitterId).eq("objectRef", OFFER).eq("sequence", "catalog")).unique()) }
async function post(f: Fixture, pageId = f.pageId) { return await f.t.run(async (ctx) => ctx.db.insert("posts", { networkId: f.root, authorPersonId: f.personId, pageId, body: "Publication de recette", audience: "public", visibility: "root", onRoot: true, status: "published", searchText: "publication recette", publishedAt: NOW, createdAt: NOW, updatedAt: NOW })) }
async function code(work: Promise<unknown>) { try { await work; return null } catch (error) { return engineErrorCode(error) } }

const FACETS: CommerceCatalogFacets = { taxonomyVersion: 1, categoryPath: ["fashion", "fashion.women", "fashion.women.clothing"], attributes: [{ key: "material", type: "text", value: "Lin" }, { key: "audience", type: "choice", value: "women" }] }

async function allowOnlyV1(f: Fixture) {
  await f.as.mutation(api.modules.federation.emitters.configure, { networkId: f.root, slug: "pro-catalog-test", environment: "sandbox", enabled: true, keyEnvName: KEY_NAME, allowedContracts: [COMMERCE_PUBLIC_CONTRACT], reason: "Révocation V2 de recette, conservation explicite V1" })
}

describe("MP03 — catalogue V2 et autorisation du contrat exact", () => {
  it("admet un émetteur V2 seul, son parent et son offre classée sur les mêmes projections", async () => {
    const f = await fixture([COMMERCE_PUBLIC_CONTRACT_V2])
    await applied(f, shop(), COMMERCE_PUBLIC_CONTRACT_V2)
    await applied(f, offer(1, { facets: FACETS }), COMMERCE_PUBLIC_CONTRACT_V2)
    const member = await f.as.query(getOffer, f.offerArgs)
    expect(member).toMatchObject({ facets: FACETS, actions: { quote: false, purchase: false } })
    expect(await f.t.query(getPublicOffer, f.offerArgs)).toEqual(member)
    expect((await f.as.query(list, { networkId: f.root, handle: "catalogue-test", paginationOpts: { cursor: null, numItems: 12 } })).page).toMatchObject([{ offerRef: OFFER, facets: FACETS }])
    expect(JSON.parse((await head(f))!.body).contract).toBe(COMMERCE_PUBLIC_CONTRACT_V2)
  })

  it("refuse toujours les facettes dans V1, puis accepte explicitement V2 sans adopter la demande refusée", async () => {
    const f = await fixture([COMMERCE_PUBLIC_CONTRACT, COMMERCE_PUBLIC_CONTRACT_V2])
    await applied(f, shop())
    const refused = await deliver(f, offer(1, { facets: FACETS }))
    expect(refused.status).toBe(400)
    expect(await refused.json()).toEqual({ outcome: "invalid_envelope" })
    expect(await f.t.run(async (ctx) => ctx.db.query("federationInboxReceipts").withIndex("by_emitter_environment_event", (q) => q.eq("emitterId", f.emitterId).eq("environment", "sandbox").eq("eventId", "catalog-event-2")).unique())).toBeNull()
    expect(await head(f)).toBeNull()
    expect(await f.as.query(getOffer, f.offerArgs)).toBeNull()
    await applied(f, offer(1, { facets: FACETS }), COMMERCE_PUBLIC_CONTRACT_V2)
    expect(await f.t.query(getPublicOffer, f.offerArgs)).toMatchObject({ facets: FACETS })
  })

  it("la confirmation identique V1 vers V2 conserve sa preuve après révocation de V1", async () => {
    const f = await fixture([COMMERCE_PUBLIC_CONTRACT, COMMERCE_PUBLIC_CONTRACT_V2])
    await published(f)
    const initial = await f.as.query(getOffer, f.offerArgs)
    expect(initial).not.toBeNull()
    expect(initial).not.toHaveProperty("facets")
    await applied(f, shop(), COMMERCE_PUBLIC_CONTRACT_V2)
    await applied(f, offer(), COMMERCE_PUBLIC_CONTRACT_V2)
    await f.as.mutation(api.modules.federation.emitters.configure, { networkId: f.root, slug: "pro-catalog-test", environment: "sandbox", enabled: true, keyEnvName: KEY_NAME, allowedContracts: [COMMERCE_PUBLIC_CONTRACT_V2], reason: "Révocation V1 après confirmation du même catalogue en V2" })
    expect(await f.as.query(getOffer, f.offerArgs)).toEqual(initial)
    expect(await f.t.query(getPublicOffer, f.offerArgs)).toEqual(initial)
    expect((await f.as.query(list, { networkId: f.root, handle: "catalogue-test", paginationOpts: { cursor: null, numItems: 12 } })).page).toEqual([initial])
    const confirmed = (await head(f))!
    expect(confirmed.revision).toBe(1)
    expect(JSON.parse(confirmed.body).contract).toBe(COMMERCE_PUBLIC_CONTRACT_V2)
  })

  it.each([COMMERCE_PUBLIC_CONTRACT, COMMERCE_PUBLIC_CONTRACT_V2] as const)("révoquer V2 ferme l'offre V2 sous parent %s même si V1 reste permis", async (parentContract) => {
    const f = await fixture([COMMERCE_PUBLIC_CONTRACT, COMMERCE_PUBLIC_CONTRACT_V2])
    await applied(f, shop(), parentContract)
    await applied(f, offer(1, { facets: FACETS }), COMMERCE_PUBLIC_CONTRACT_V2)
    const postId = await post(f)
    await f.as.mutation(setSlot, { networkId: f.root, shopId: f.shopId, postId, offerRef: OFFER })
    expect(await f.as.query(slot, { networkId: f.root, postId })).toMatchObject({ facets: FACETS })
    const before = (await head(f))!
    await allowOnlyV1(f)
    expect(await f.as.query(getOffer, f.offerArgs)).toBeNull()
    expect(await f.t.query(getPublicOffer, f.offerArgs)).toBeNull()
    expect((await f.as.query(list, { networkId: f.root, handle: "catalogue-test", paginationOpts: { cursor: null, numItems: 12 } })).page).toEqual([])
    expect(await f.as.query(slot, { networkId: f.root, postId })).toBeNull()
    // L'interdiction vient de la relecture des droits, pas de la disparition du snapshot.
    expect(await head(f)).toMatchObject({ body: before.body, state: "active", revision: before.revision })
  })

  it("le parent V2 révoqué ferme aussi une offre V1 dont le contrat reste permis", async () => {
    const f = await fixture([COMMERCE_PUBLIC_CONTRACT, COMMERCE_PUBLIC_CONTRACT_V2])
    await applied(f, shop(), COMMERCE_PUBLIC_CONTRACT_V2)
    await applied(f, offer())
    expect(await f.as.query(getOffer, f.offerArgs)).not.toBeNull()
    await allowOnlyV1(f)
    expect(await f.as.query(getOffer, f.offerArgs)).toBeNull()
    expect(await f.t.query(getPublicOffer, f.offerArgs)).toBeNull()
    expect((await f.as.query(list, { networkId: f.root, handle: "catalogue-test", paginationOpts: { cursor: null, numItems: 12 } })).page).toEqual([])
    expect(JSON.parse((await head(f))!.body).contract).toBe(COMMERCE_PUBLIC_CONTRACT)
  })

  it("un appel interne ne réutilise pas une ancienne autorisation V2 après révocation", async () => {
    const f = await fixture([COMMERCE_PUBLIC_CONTRACT, COMMERCE_PUBLIC_CONTRACT_V2])
    await applied(f, shop())
    const previouslyAllowed = await f.t.run(async (ctx) => ctx.db.get(f.emitterId))
    if (!previouslyAllowed) throw new Error("Émetteur de fixture absent")
    await allowOnlyV1(f)
    const raw = bodyOf(offer(1, { facets: FACETS }), COMMERCE_PUBLIC_CONTRACT_V2)
    expect(await f.t.run(async (ctx) => await applyCommerceCatalog(ctx, previouslyAllowed, raw, Date.now()))).toEqual({ applied: false, reason: "contract_not_allowed" })
    expect(await head(f)).toBeNull()
  })

  it.each(["mapping", "consent", "link"])("V2 conserve la garde courante %s", async (gate) => {
    const f = await fixture([COMMERCE_PUBLIC_CONTRACT_V2])
    await applied(f, shop(), COMMERCE_PUBLIC_CONTRACT_V2)
    await applied(f, offer(1, { facets: FACETS }), COMMERCE_PUBLIC_CONTRACT_V2)
    expect(await f.as.query(getOffer, f.offerArgs)).toMatchObject({ facets: FACETS })
    await f.t.run(async (ctx) => {
      if (gate === "mapping") {
        const row = await ctx.db.query("commerceCatalogMappings").withIndex("by_network_shop", (q) => q.eq("networkId", f.root).eq("shopId", f.shopId)).unique()
        if (!row) throw new Error("Mapping de fixture absent")
        await ctx.db.patch(row._id, { enabled: false })
      }
      if (gate === "consent") await ctx.db.patch(f.shopId, { publicConsentRevokedAt: NOW })
      if (gate === "link") await ctx.db.patch(f.linkId, { state: "revoked", revokedAt: NOW })
    })
    expect(await f.as.query(getOffer, f.offerArgs)).toBeNull()
    expect(await f.t.query(getPublicOffer, f.offerArgs)).toBeNull()
  })
})

async function image() {
  const binary = atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE6kAAAAASUVORK5CYII=")
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("")
  const descriptor: CommerceMedia = { byteSize: bytes.byteLength, mimeType: "image/png", sha256: digest, altText: "Image de recette", width: 1, height: 1 }
  return { blob: new Blob([bytes], { type: "image/png" }), descriptor }
}
async function attachImage(f: Fixture) {
  const media = await image()
  await published(f, offer(1, { media: [media.descriptor] }))
  const current = (await head(f))!
  const lease: CatalogMediaLeaseArgs = { networkId: f.root, headId: current._id, revision: current.revision, digest: current.digest, leaseToken: "catalogue-test-lease-0123456789abcdef" }
  expect(await f.t.mutation(claim, lease)).toBe(true)
  const storageId = await f.t.run(async (ctx) => ctx.storage.store(media.blob))
  const token = "c".repeat(64)
  expect(await f.t.mutation(stage, { ...lease, index: 0, storageId, publicToken: token })).toBe(true)
  expect(await f.t.mutation(complete, lease)).toBe(true)
  const scan = await f.t.run(async (ctx) => ctx.db.query("fileScans").withIndex("by_storageId", (q) => q.eq("storageId", storageId)).unique())
  return { storageId, token, scan: scan! }
}

describe("SU06 — plat du jour public, désignation distincte de la vitrine historique", () => {
  const args = (f: Fixture) => ({ networkId: f.root, handle: f.offerArgs.handle })
  async function designate(f: Fixture) {
    await f.t.run(async (ctx) => ctx.db.patch(f.shopId, {
      activityConfiguration: { version: 1, template: "food", capabilities: ["products", "services"], blocks: ["catalog", "services", "about"] },
      dailySpecial: { offerRef: OFFER, day: "2026-10-18" },
    }))
  }

  it("relit le prix publié sans élargir le DTO public historique ni avancer le jour désigné", async () => {
    const f = await fixture()
    await published(f)
    await designate(f)
    const historical = await f.t.query(publicStorefront, args(f))
    const current = await f.t.query(getPublicOffer, f.offerArgs)
    expect(await f.t.query(publicDailySpecial, args(f))).toEqual({ version: 1, day: "2026-10-18", offer: current })
    expect(await f.as.query(publicDailySpecial, args(f))).toEqual({ version: 1, day: "2026-10-18", offer: current })
    expect(historical).not.toHaveProperty("dailySpecial")
    await applied(f, offer(2, { price: { mode: "fixed", currency: "XAF", amount: 15_000 } }))
    expect(await f.t.query(publicDailySpecial, args(f))).toMatchObject({ version: 1, day: "2026-10-18", offer: { revision: 2, price: { amount: 15_000 } } })
    expect(await f.t.query(publicStorefront, args(f))).toEqual(historical)
    // Le temps seul ne relance pas une query : l'écran doit expirer cette désignation, jamais la redater.
    vi.setSystemTime(Date.UTC(2026, 9, 18, 23))
    expect((await f.t.query(publicDailySpecial, args(f)))?.day).toBe("2026-10-18")
  })

  it("ne transforme ni un service ni un catalogue masqué en plat du jour", async () => {
    const f = await fixture()
    await published(f)
    expect(await f.t.query(publicDailySpecial, args(f))).toBeNull()
    await designate(f)
    expect(await f.t.query(publicDailySpecial, args(f))).not.toBeNull()
    await f.t.run(async (ctx) => ctx.db.patch(f.shopId, { activityConfiguration: { version: 1, template: "general", capabilities: ["products"], blocks: ["catalog", "about"] } }))
    expect(await f.t.query(publicDailySpecial, args(f))).toBeNull()
    await f.t.run(async (ctx) => ctx.db.patch(f.shopId, { activityConfiguration: { version: 1, template: "food", capabilities: ["products"], blocks: ["about"] } }))
    expect(await f.t.query(publicDailySpecial, args(f))).toBeNull()
    await f.t.run(async (ctx) => ctx.db.patch(f.shopId, { activityConfiguration: { version: 1, template: "food", capabilities: ["services"], blocks: ["services", "about"] } }))
    expect(await f.t.query(publicDailySpecial, args(f))).toBeNull()
    await designate(f)
    await applied(f, offer(2, { kind: "service" }))
    expect(await f.t.query(getPublicOffer, f.offerArgs)).toMatchObject({ kind: "service" })
    expect(await f.t.query(publicDailySpecial, args(f))).toBeNull()
    await f.t.run(async (ctx) => ctx.db.patch(f.shopId, { dailySpecial: { offerRef: "pro.ga:offer:01JA00000000000000000000P2", day: "2026-10-18" } }))
    expect(await f.t.query(publicDailySpecial, args(f))).toBeNull()
  })

  it.each(["consent", "storefront", "page", "admin", "policy", "moderation"] as const)("relit la garde %s au lieu de servir une ancienne sélection", async (gate) => {
    const f = await fixture()
    await published(f)
    await designate(f)
    expect(await f.t.query(publicDailySpecial, args(f))).not.toBeNull()
    const current = (await head(f))!
    await f.t.run(async (ctx) => {
      if (gate === "consent") await ctx.db.patch(f.shopId, { publicConsentRevokedAt: NOW })
      if (gate === "storefront") await ctx.db.patch(f.shopId, { storefront: "withdrawn" })
      if (gate === "page") await ctx.db.patch(f.pageId, { status: "inactive" })
      if (gate === "admin") await ctx.db.delete(f.signatoryId)
      if (gate === "policy") {
        const row = await ctx.db.query("shopCatalogPolicies").withIndex("by_network", (q) => q.eq("networkId", f.root)).unique()
        await ctx.db.patch(row!._id, { enabled: false })
      }
      if (gate === "moderation") {
        const row = await ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", "commerceOffer").eq("targetId", current._id)).unique()
        await ctx.db.patch(row!._id, { status: "removed" })
      }
    })
    expect(await f.t.query(publicDailySpecial, args(f))).toBeNull()
  })

  it("ne résout pas la référence publique d'une autre boutique dans le menu demandé", async () => {
    const f = await fixture()
    await published(f)
    await designate(f)
    await f.t.run(async (ctx) => {
      const pageId = await ctx.db.insert("pages", { networkId: f.root, handle: "autre-restaurant", name: "Autre restaurant", ownerKind: "company", trust: "community", trustRank: 1, visibility: "network", onRoot: true, status: "active", createdByPersonId: f.personId, searchText: "autre restaurant", createdAt: NOW, updatedAt: NOW })
      await ctx.db.insert("pageSignatories", { networkId: f.root, pageId, personId: f.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
      await ctx.db.insert("shops", { networkId: f.root, pageId, preparedByPersonId: f.personId, model: "products", storefront: "published", visibility: "network", publicConsentAt: NOW, publicConsentTextVersion: SHOP_PUBLIC_LISTING_TEXT_VERSION, publicConsentByPersonId: f.personId, activityConfiguration: { version: 1, template: "food", capabilities: ["products"], blocks: ["catalog", "about"] }, dailySpecial: { offerRef: OFFER, day: "2026-10-18" }, publishedAt: NOW, createdAt: NOW, updatedAt: NOW })
    })
    expect(await f.t.query(publicDailySpecial, { networkId: f.root, handle: "autre-restaurant" })).toBeNull()
    expect(await f.t.query(publicDailySpecial, args(f))).not.toBeNull()
  })

  it("ferme le plat retiré et n'adopte aucune ancienne incarnation après republication du parent", async () => {
    const f = await fixture()
    await published(f)
    await designate(f)
    await applied(f, { type: "offer.withdrawn", shopRef: SHOP, offerRef: OFFER, revision: 2, changedAt: NOW, reason: "consent_withdrawn" })
    expect(await f.t.query(publicDailySpecial, args(f))).toBeNull()
    await applied(f, offer(3))
    expect(await f.t.query(publicDailySpecial, args(f))).not.toBeNull()
    await applied(f, { type: "shop.withdrawn", shopRef: SHOP, linkRef: LINK, revision: 2, changedAt: NOW, reason: "consent_withdrawn" })
    expect(await f.t.query(publicDailySpecial, args(f))).toBeNull()
    await applied(f, shop(3))
    expect(await f.t.query(publicDailySpecial, args(f))).toBeNull()
    await applied(f, offer(4))
    expect((await f.t.query(publicDailySpecial, args(f)))?.offer.revision).toBe(4)
    await f.as.mutation(mapping, { networkId: f.root, shopId: f.shopId, emitterId: f.emitterId, enabled: false, reason: "Retrait du catalogue pendant sa présentation en plat du jour" })
    expect(await f.t.query(publicDailySpecial, args(f))).toBeNull()
  })

  it("garde les médias locaux révocables et ne transmet aucun privilège commercial", async () => {
    const f = await fixture(), attached = await attachImage(f)
    await designate(f)
    expect((await f.t.query(publicDailySpecial, args(f)))?.offer.media[0]).toMatchObject({ url: null, withheld: "fileScanPending" })
    await f.t.run(async (ctx) => ctx.db.patch(attached.scan._id, { status: "clean", av: { provider: "fixture", verdict: "clean" } }))
    const projection = await f.t.query(publicDailySpecial, args(f))
    expect(projection?.offer.media[0]?.url).toBe(`http://localhost:3211/catalogue/media/${attached.token}`)
    expect(projection?.offer.actions).toEqual({ contact: false, quote: false, purchase: false })
    const serialized = JSON.stringify(projection)
    for (const field of ["storageId", "linkRef", "subjectRef", "emitterId", "stock", "http://localhost:4010"]) expect(serialized).not.toContain(field)
    await f.t.run(async (ctx) => ctx.db.patch(attached.scan._id, { status: "infected", av: { provider: "fixture", verdict: "infected" } }))
    expect((await f.t.query(publicDailySpecial, args(f)))?.offer.media[0]?.url).toBeNull()
    expect((await f.t.fetch(`/catalogue/media/${attached.token}`)).status).toBe(404)
  })

  it("ne requalifie pas une session refusée en visiteur et exige une racine active", async () => {
    const f = await fixture()
    await published(f)
    await designate(f)
    expect(await code(f.t.withIdentity({ subject: "fake-jwt", sessionId: "invalide" }).query(publicDailySpecial, args(f)))).toBe("unauthenticated")
    await f.t.run(async (ctx) => ctx.db.patch(f.root, { status: "archived" }))
    expect(await code(f.t.query(publicDailySpecial, args(f)))).toBe("notFound")
  })
})

describe("P09 — publication, révisions et projection", () => {
  it("projette la même allowlist membre/anonyme et conserve le format prix/devis", async () => {
    const f = await fixture()
    await published(f, offer(1, { price: { mode: "quote", currency: "XAF" } }))
    expect((await f.as.query(getOffer, f.offerArgs))?.price).toEqual({ mode: "quote", currency: "XAF" })
    await applied(f, offer(2, { variants: [
      { variantRef: VARIANT, label: "Active", options: ["A"], amount: 13_000 },
      { variantRef: "pro.ga:offer_variant:01JA00000000000000000000V2", label: "Future", options: ["B"], amount: 15_000, effectiveFrom: NOW + 60_000 },
      { variantRef: "pro.ga:offer_variant:01JA00000000000000000000V3", label: "Expirée", options: ["C"], amount: 16_000, effectiveTo: NOW },
    ], variantAxes: ["Modèle"] }))
    const member = await f.as.query(getOffer, f.offerArgs), anonymous = await f.t.query(getPublicOffer, f.offerArgs)
    expect(member).toEqual(anonymous)
    expect(member?.price).toEqual({ mode: "fixed", currency: "XAF", amount: 12_000 })
    expect(member?.variants.map((variant) => variant.label)).toEqual(["Active"])
    expect(member?.actions).toEqual({ contact: false, quote: false, purchase: false })
    const serialized = JSON.stringify(member)
    for (const field of ["linkRef", "subjectRef", "storageId", "emitterId", "configFingerprint", "stock", "http://localhost:4010"]) expect(serialized).not.toContain(field)
    const page = await f.as.query(list, { networkId: f.root, handle: "catalogue-test", paginationOpts: { cursor: null, numItems: 12 } })
    expect(Object.keys(page).sort()).toEqual(["page", "continueCursor", "isDone", "collections", "filteredWindow"].sort())
    expect(page.page).toHaveLength(1)
    expect(await code(f.as.query(list, { networkId: f.root, handle: "catalogue-test", query: "a".repeat(121), paginationOpts: { cursor: null, numItems: 12 } }))).toBe("invalidArgument")
  })

  it("catalogue/disponibilité indépendants, stale explicite et conflit de même révision", async () => {
    const f = await fixture()
    await published(f)
    await applied(f, { type: "offer.availabilityChanged", shopRef: SHOP, offerRef: OFFER, availability: "in_stock", availabilityRevision: 9, changedAt: NOW, variants: [] })
    await applied(f, offer(3, { price: { mode: "range", currency: "XAF", minAmount: 14_000, maxAmount: 16_000 } }))
    expect(await f.as.query(getOffer, f.offerArgs)).toMatchObject({ revision: 3, price: { mode: "range", minAmount: 14_000 }, availability: { state: "in_stock", stale: false, indicative: true } })
    await applied(f, offer(1))
    expect((await head(f))?.revision).toBe(3)
    const conflict = await deliver(f, offer(3, { title: "Autre contenu même révision" }))
    expect(await conflict.json()).toMatchObject({ applicationStatus: "rejected", status: "dead_letter" })
    expect((await head(f))?.gap).toBe(true)
    vi.setSystemTime(NOW + 16 * 60_000)
    expect(await f.as.query(getOffer, f.offerArgs)).toMatchObject({ availability: { state: "unknown", stale: true } })
    await applied(f, { type: "offer.availabilityChanged", shopRef: SHOP, offerRef: OFFER, availability: "in_stock", availabilityRevision: 9, changedAt: NOW, variants: [] })
    expect(await f.as.query(getOffer, f.offerArgs)).toMatchObject({ availability: { state: "unknown", stale: true, updatedAt: NOW } })
    await applied(f, { type: "offer.availabilityChanged", shopRef: SHOP, offerRef: OFFER, availability: "in_stock", availabilityRevision: 10, changedAt: Date.now(), variants: [] })
    expect(await f.as.query(getOffer, f.offerArgs)).toMatchObject({ availability: { state: "in_stock", stale: false, updatedAt: Date.now() } })
  })

  it("tombstone d'offre et retrait/republication parent ne ressuscitent pas des révisions anciennes", async () => {
    const f = await fixture()
    await published(f)
    await applied(f, { type: "offer.withdrawn", shopRef: SHOP, offerRef: OFFER, revision: 2, changedAt: NOW, reason: "consent_withdrawn" })
    await applied(f, offer(1))
    expect(await f.as.query(getOffer, f.offerArgs)).toBeNull()
    await applied(f, offer(3))
    await applied(f, { type: "shop.withdrawn", shopRef: SHOP, linkRef: LINK, revision: 2, changedAt: NOW, reason: "consent_withdrawn" })
    expect(await f.t.query(getPublicOffer, f.offerArgs)).toBeNull()
    await applied(f, shop(3))
    expect(await f.as.query(getOffer, f.offerArgs)).toBeNull()
    expect(await (await deliver(f, offer(3))).json()).toMatchObject({ applicationStatus: "rejected" })
    await applied(f, offer(4))
    expect((await f.as.query(getOffer, f.offerArgs))?.revision).toBe(4)
  })

  it("retirer capacité catalog source ferme les offres et exige une nouvelle incarnation enfant", async () => {
    const f = await fixture()
    await published(f)
    await applied(f, shop(2, { capabilities: ["quote"] }))
    expect(await f.as.query(getOffer, f.offerArgs)).toBeNull()
    await applied(f, shop(3))
    expect(await f.as.query(getOffer, f.offerArgs)).toBeNull()
    await applied(f, offer(2))
    expect((await f.as.query(getOffer, f.offerArgs))?.revision).toBe(2)
  })

  it("réactiver le mapping n'adopte pas les anciens snapshots parent/enfant", async () => {
    const f = await fixture()
    await published(f)
    const args = { networkId: f.root, shopId: f.shopId, emitterId: f.emitterId, reason: "Réactivation explicite de mapping de recette" }
    await f.as.mutation(mapping, { ...args, enabled: false })
    await f.as.mutation(mapping, { ...args, enabled: true })
    expect(await (await deliver(f, shop())).json()).toMatchObject({ applicationStatus: "rejected" })
    expect(await f.as.query(getOffer, f.offerArgs)).toBeNull()
    await applied(f, shop(2))
    expect(await (await deliver(f, offer())).json()).toMatchObject({ applicationStatus: "rejected" })
    await applied(f, offer(2))
    expect((await f.as.query(getOffer, f.offerArgs))?.revision).toBe(2)
  })

  it.each(["policy", "public_consent", "link", "permission", "admin", "moderation", "emitter"])("la lecture rejuge %s sans privilège auteur", async (variant) => {
    const f = await fixture()
    await published(f)
    const current = (await head(f))!
    await f.t.run(async (ctx) => {
      if (variant === "policy") { const row = await ctx.db.query("shopCatalogPolicies").withIndex("by_network", (q) => q.eq("networkId", f.root)).unique(); await ctx.db.patch(row!._id, { enabled: false }) }
      if (variant === "public_consent") await ctx.db.patch(f.shopId, { publicConsentRevokedAt: NOW })
      if (variant === "link") await ctx.db.patch(f.linkId, { state: "revoked", revokedAt: NOW })
      if (variant === "permission") await ctx.db.patch(f.linkId, { permissions: [] })
      if (variant === "admin") await ctx.db.delete(f.signatoryId)
      if (variant === "moderation") { const row = await ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", "commerceOffer").eq("targetId", current._id)).unique(); await ctx.db.patch(row!._id, { status: "removed" }) }
      if (variant === "emitter") await ctx.db.patch(f.emitterId, { enabled: false })
    })
    expect(await f.as.query(getOffer, f.offerArgs)).toBeNull()
    expect(await f.t.query(getPublicOffer, f.offerArgs)).toBeNull()
  })

  it("un autre shopRef n'est jamais adopté ni créé depuis l'événement", async () => {
    const f = await fixture()
    const response = await deliver(f, shop(1, { shopRef: "pro.ga:structure:01JA00000000000000000000S2" }))
    expect(await response.json()).toMatchObject({ applicationStatus: "rejected" })
    expect(await f.t.run(async (ctx) => ctx.db.query("commerceCatalogHeads").take(2))).toEqual([])
    expect(await f.t.run(async (ctx) => ctx.db.query("shops").take(2))).toHaveLength(1)
  })

  it("une source modifiée ne republie pas une offre retirée par la modération", async () => {
    const f = await fixture()
    await published(f)
    const current = (await head(f))!
    await f.t.run(async (ctx) => { const row = await ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", "commerceOffer").eq("targetId", current._id)).unique(); await ctx.db.patch(row!._id, { status: "removed" }) })
    await applied(f, offer(2))
    expect(await f.as.query(getOffer, f.offerArgs)).toBeNull()
  })
})

describe("P09 — slot et médias révoquables", () => {
  it("rattache l'offre de la même page puis le slot relit le prix courant", async () => {
    const f = await fixture()
    await published(f)
    const postId = await post(f)
    expect(await f.as.mutation(setSlot, { networkId: f.root, shopId: f.shopId, postId, offerRef: OFFER })).toEqual({ changed: true })
    expect(await f.as.query(slot, { networkId: f.root, postId })).toMatchObject({ offerRef: OFFER, price: { amount: 12_000 }, shopTemplate: "general" })
    await applied(f, offer(2, { price: { mode: "unit", amount: 15_000, currency: "XAF", unit: "pièce" } }))
    expect(await f.as.query(slot, { networkId: f.root, postId })).toMatchObject({ revision: 2, price: { mode: "unit", amount: 15_000 } })
  })

  it("refuse une publication d'une autre page/boutique", async () => {
    const f = await fixture()
    await published(f)
    const otherPage = await f.t.run(async (ctx) => ctx.db.insert("pages", { networkId: f.root, handle: "other-catalogue-page", name: "Autre activité", ownerKind: "company", trust: "community", trustRank: 1, visibility: "network", onRoot: true, status: "active", createdByPersonId: f.personId, searchText: "autre", createdAt: NOW, updatedAt: NOW }))
    const postId = await post(f, otherPage)
    expect(await code(f.as.mutation(setSlot, { networkId: f.root, shopId: f.shopId, postId, offerRef: OFFER }))).toBe("notFound")
    expect(await f.as.query(slot, { networkId: f.root, postId })).toBeNull()
  })

  it.each(["offer", "consent"])("retrait %s retire slot et ancienne URL déjà émise", async (variant) => {
    const f = await fixture(), attached = await attachImage(f)
    expect((await f.as.query(getOffer, f.offerArgs))?.media[0]).toMatchObject({ url: null, withheld: "fileScanPending" })
    // Un skipped/clean sans preuve AV ne suffit jamais aux médias étrangers.
    await f.t.run(async (ctx) => ctx.db.patch(attached.scan._id, { status: "clean" }))
    expect((await f.as.query(getOffer, f.offerArgs))?.media[0]?.url).toBeNull()
    await f.t.run(async (ctx) => ctx.db.patch(attached.scan._id, { status: "clean", av: { provider: "fixture", verdict: "clean" } }))
    const before = await f.as.query(getOffer, f.offerArgs)
    const path = new URL(before!.media[0]!.url!).pathname
    expect(path).toBe(`/catalogue/media/${attached.token}`)
    expect((await f.t.fetch(path)).status).toBe(200)
    const postId = await post(f)
    await f.as.mutation(setSlot, { networkId: f.root, shopId: f.shopId, postId, offerRef: OFFER })
    if (variant === "offer") await applied(f, { type: "offer.withdrawn", shopRef: SHOP, offerRef: OFFER, revision: 2, changedAt: NOW, reason: "consent_withdrawn" })
    else await f.t.run(async (ctx) => ctx.db.patch(f.shopId, { publicConsentRevokedAt: NOW }))
    expect(await f.as.query(slot, { networkId: f.root, postId })).toBeNull()
    expect((await f.t.fetch(path)).status).toBe(404)
    expect(await f.t.query(getPublicOffer, f.offerArgs)).toBeNull()
  })
})


const indexedRef = (index: number) => `pro.ga:offer:${String(index).padStart(26, "0")}`
const SECOND_COLLECTION = "pro.ga:offer_collection:01JA00000000000000000000C2"
const catalogArgs = (f: Fixture, extra: Partial<CatalogListArgs> = {}): CatalogListArgs & { networkId: Id<"networks"> } => ({ networkId: f.root, handle: "catalogue-test", paginationOpts: { cursor: null, numItems: 12 }, ...extra })

describe("MP05d — catalogue de boutique avant pagination", () => {
  it("trouve une offre au-delà de la première fenêtre par collection, facettes, prix et recherche", async () => {
    const f = await fixture([COMMERCE_PUBLIC_CONTRACT_V2])
    await applied(f, shop(1, { collections: [{ collectionRef: COLLECTION, label: "Collection", position: 0 }, { collectionRef: SECOND_COLLECTION, label: "Sélection", position: 1 }] }), COMMERCE_PUBLIC_CONTRACT_V2)
    for (let index = 1; index <= 16; index++) await applied(f, offer(1, { offerRef: indexedRef(index), changedAt: NOW - index * 1000, title: `Veste de recette ${index}`, facets: { taxonomyVersion: 1, categoryPath: ["fashion", "fashion.men"], attributes: [{ key: "material", type: "text", value: "Coton" }] } }), COMMERCE_PUBLIC_CONTRACT_V2)
    await applied(f, offer(1, { offerRef: indexedRef(17), changedAt: NOW - 17_000, title: "Veste élégante", collectionRefs: [SECOND_COLLECTION], facets: FACETS, price: { mode: "range", currency: "XAF", minAmount: 2000, maxAmount: 3000 } }), COMMERCE_PUBLIC_CONTRACT_V2)
    const args = catalogArgs(f, { collectionRef: SECOND_COLLECTION, category: ["fashion.women"], material: ["LIN"], audience: ["women"], minPrice: 2500, maxPrice: 2800 })
    const member = await f.as.query(list, args), anonymous = await f.t.query(publicList, args)
    expect(member.page.map(item => item.offerRef)).toEqual([indexedRef(17)])
    expect(anonymous).toEqual(member)
    expect(member.collections).toEqual([{ collectionRef: COLLECTION, label: "Collection" }, { collectionRef: SECOND_COLLECTION, label: "Sélection" }])
    expect((await f.as.query(list, catalogArgs(f, { query: "elegante", sort: "relevance" }))).page.map(item => item.offerRef)).toEqual([indexedRef(17)])
    expect((await f.as.query(list, catalogArgs(f, { collectionRef: SECOND_COLLECTION, material: ["coton"] }))).page).toEqual([])
  })

  it("trie les prix publiés avant pagination, conserve les collections et place les devis à la fin", async () => {
    const f = await fixture()
    await applied(f, shop())
    for (const [index, price] of [[1, { mode: "fixed", currency: "XAF", amount: 8000 }], [2, { mode: "range", currency: "XAF", minAmount: 2000, maxAmount: 9000 }], [3, { mode: "quote", currency: "XAF" }]] as const) await applied(f, offer(1, { offerRef: indexedRef(index), price }))
    const args = catalogArgs(f, { sort: "price_asc", paginationOpts: { cursor: null, numItems: 1 } })
    const first = await f.as.query(list, args)
    expect(first.page.map(item => item.offerRef)).toEqual([indexedRef(2)])
    expect(first.isDone).toBe(false)
    const second = await f.as.query(list, { ...args, paginationOpts: { cursor: first.continueCursor, numItems: 1 } })
    expect(second.page.map(item => item.offerRef)).toEqual([indexedRef(1)])
    expect(second.collections).toEqual(first.collections)
    const last = await f.as.query(list, { ...args, paginationOpts: { cursor: second.continueCursor, numItems: 1 } })
    expect(last.page.map(item => item.offerRef)).toEqual([indexedRef(3)])
    expect((await f.as.query(list, catalogArgs(f, { sort: "price_desc" }))).page.map(item => item.offerRef)).toEqual([indexedRef(2), indexedRef(1), indexedRef(3)])
    expect((await f.as.query(list, catalogArgs(f, { minPrice: 8500 }))).page.map(item => item.offerRef)).toEqual([indexedRef(2)])
    expect((await f.as.query(list, catalogArgs(f, { category: ["fashion"] }))).page).toEqual([])
  })

  it("lie la continuation aux filtres, au lecteur, au mapping et à la génération", async () => {
    const f = await fixture()
    await applied(f, shop()); await applied(f, offer(1, { offerRef: indexedRef(1) })); await applied(f, offer(1, { offerRef: indexedRef(2) }))
    const args = catalogArgs(f, { paginationOpts: { cursor: null, numItems: 1 } })
    const first = await f.as.query(list, args)
    const next = { ...args, paginationOpts: { cursor: first.continueCursor, numItems: 1 } }
    expect(first.continueCursor).not.toBe("")
    expect(await code(f.as.query(list, { ...next, sort: "price_asc" }))).toBe("invalidArgument")
    expect(await code(f.t.query(publicList, next))).toBe("invalidArgument")
    await f.t.run(async ctx => { await ctx.db.insert("commerceCatalogIndexes", { networkId: f.root, generation: 2, status: "ready", updatedAt: NOW }) })
    expect(await code(f.as.query(list, next))).toBe("invalidArgument")
    const renewed = await f.as.query(list, args)
    await f.as.mutation(mapping, { networkId: f.root, shopId: f.shopId, emitterId: f.emitterId, enabled: true, reason: "Nouvelle génération du mapping de recette" })
    // Un mapping réactivé peut fermer toute l'incarnation ; aucune ancienne offre n'est réadoptée.
    expect((await f.as.query(list, { ...args, paginationOpts: { cursor: renewed.continueCursor, numItems: 1 } })).page).toEqual([])
  })

  it("conserve une continuation vide après relecture de modération, puis ferme les offres retirées", async () => {
    const f = await fixture()
    await applied(f, shop()); await applied(f, offer(1, { offerRef: indexedRef(1), changedAt: NOW })); await applied(f, offer(1, { offerRef: indexedRef(2), changedAt: NOW - 1000 }))
    await f.t.run(async ctx => { const current = await ctx.db.query("commerceCatalogHeads").withIndex("by_emitter_object_sequence", q => q.eq("emitterId", f.emitterId).eq("objectRef", indexedRef(1)).eq("sequence", "catalog")).unique(); const state = await ctx.db.query("moderationContentStates").withIndex("by_target", q => q.eq("targetKind", "commerceOffer").eq("targetId", current!._id)).unique(); await ctx.db.patch(state!._id, { status: "removed" }) })
    const args = catalogArgs(f, { paginationOpts: { cursor: null, numItems: 1 } }), first = await f.as.query(list, args)
    expect(first).toMatchObject({ page: [], isDone: false, filteredWindow: true })
    expect(first.continueCursor).not.toBe("")
    expect((await f.as.query(list, { ...args, paginationOpts: { cursor: first.continueCursor, numItems: 1 } })).page.map(item => item.offerRef)).toEqual([indexedRef(2)])
    await applied(f, { type: "offer.withdrawn", shopRef: SHOP, offerRef: indexedRef(2), revision: 2, changedAt: NOW, reason: "consent_withdrawn" })
    expect((await f.t.query(publicList, catalogArgs(f))).page).toEqual([])
  })

  it("annonce l'indexation héritée puis active les filtres seulement après reconstruction", async () => {
    const f = await fixture()
    await published(f)
    const before = (await head(f))!
    await f.t.run(async ctx => { await ctx.db.patch(before._id, { localIndexVersion: undefined, collection1: undefined }) })
    const legacy = await f.as.query(list, catalogArgs(f))
    expect(legacy).toMatchObject({ indexStatus: "building", page: [{ offerRef: OFFER }] })
    const pending = await f.as.query(list, catalogArgs(f, { collectionRef: COLLECTION }))
    expect(pending).toMatchObject({ indexStatus: "building", page: [], collections: [{ collectionRef: COLLECTION }] })
    await f.t.run(async ctx => { const current = (await ctx.db.get(before._id))!; await ctx.db.patch(current._id, marketplaceIndexFields(current.body, current.state, current.objectKind, current.sequence, NOW)) })
    const ready = await f.as.query(list, catalogArgs(f, { collectionRef: COLLECTION }))
    expect(ready.page.map(item => item.offerRef)).toEqual([OFFER])
    expect(ready.indexStatus).not.toBe("building")
  })

  it("refuse les bornes, tris incompatibles, facettes inconnues et requêtes ponctuées trop longues", async () => {
    const f = await fixture(); await published(f)
    for (const args of [{ minPrice: -1 }, { minPrice: 300, maxPrice: 200 }, { query: "a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-q" }, { query: "veste", sort: "newest" as const }, { category: ["not-a-category"] }, { brand: Array.from({ length: 7 }, (_, index) => String(index)) }]) expect(await code(f.as.query(list, catalogArgs(f, args)))).toBe("invalidArgument")
  })
})

const TERMS: CommerceStorefrontTerms = { version: 1, publishedAt: NOW, pickup: { points: [{ establishmentRef: "pro.ga:establishment:01JA00000000000000000000E1", label: "Point centre" }] }, delivery: { country: "GA", localities: ["Libreville"], label: "Livraison locale", fee: { amount: 1500, currency: "XAF" } }, returns: { summary: "Contactez la boutique avant tout retour." } }
async function termsPolicy(f: Fixture, preReview: boolean) { await f.t.run(async ctx => { await ctx.db.insert("moderationPolicies", { networkId: f.root, surface: "commerceStorefront", preReview, maxLinks: 20, maxWrites: 100, windowMs: 60_000, updatedAt: NOW }) }) }
const storefrontArgs = (f: Fixture) => ({ networkId: f.root, handle: "catalogue-test" })
async function termsState(f: Fixture) { return await f.t.run(async ctx => { const parent = await ctx.db.query("commerceCatalogHeads").withIndex("by_emitter_object_sequence", q => q.eq("emitterId", f.emitterId).eq("objectRef", SHOP).eq("sequence", "catalog")).unique(); return parent ? await ctx.db.query("moderationContentStates").withIndex("by_target", q => q.eq("targetKind", "commerceStorefront").eq("targetId", parent._id)).unique() : null }) }

describe("MP05 — conditions publiques du vendeur sous modération", () => {
  it("projette les conditions V2 publiées dans les vitrines membre et publique, sans ouvrir la vente", async () => {
    const f = await fixture([COMMERCE_PUBLIC_CONTRACT_V2]); await termsPolicy(f, false)
    await applied(f, shop(1, { storefrontTerms: TERMS }), COMMERCE_PUBLIC_CONTRACT_V2)
    expect((await termsState(f))?.status).toBe("published")
    const member = await f.as.query(memberStorefront, storefrontArgs(f)), anonymous = await f.t.query(publicStorefront, storefrontArgs(f))
    expect(member?.storefrontTerms).toEqual(TERMS)
    expect(anonymous?.storefrontTerms).toEqual(TERMS)
    expect(member).not.toHaveProperty("checkout")
  })
  it.each(["preReview", "blocked"] as const)("omet les conditions en attente pour leur auteur, administrateur et anonyme : %s", async mode => {
    const f = await fixture([COMMERCE_PUBLIC_CONTRACT_V2]); await termsPolicy(f, mode === "preReview")
    if (mode === "blocked") await f.t.run(async ctx => { await ctx.db.insert("blockedTerms", { networkId: f.root, term: "livraison", active: true, updatedAt: NOW }) })
    await applied(f, shop(1, { storefrontTerms: TERMS }), COMMERCE_PUBLIC_CONTRACT_V2)
    expect((await termsState(f))?.status).toBe("pending_review")
    expect(await f.as.query(memberStorefront, storefrontArgs(f))).not.toHaveProperty("storefrontTerms")
    expect(await f.t.query(publicStorefront, storefrontArgs(f))).not.toHaveProperty("storefrontTerms")
  })
  it("une nouvelle révision ne republie pas des conditions retirées", async () => {
    const f = await fixture([COMMERCE_PUBLIC_CONTRACT_V2]); await termsPolicy(f, false)
    await applied(f, shop(1, { storefrontTerms: TERMS }), COMMERCE_PUBLIC_CONTRACT_V2)
    const state = (await termsState(f))!
    await f.t.run(async ctx => { await ctx.db.patch(state._id, { status: "removed" }) })
    await applied(f, shop(2, { storefrontTerms: { ...TERMS, returns: { summary: "Nouvelles conditions publiques." } } }), COMMERCE_PUBLIC_CONTRACT_V2)
    expect((await termsState(f))?.status).toBe("removed")
    expect(await f.as.query(memberStorefront, storefrontArgs(f))).not.toHaveProperty("storefrontTerms")
  })
  it.each(["contract", "mapping", "parent"] as const)("ferme immédiatement les conditions après retrait %s", async gate => {
    const f = await fixture([COMMERCE_PUBLIC_CONTRACT, COMMERCE_PUBLIC_CONTRACT_V2]); await termsPolicy(f, false)
    await applied(f, shop(1, { storefrontTerms: TERMS }), COMMERCE_PUBLIC_CONTRACT_V2)
    expect((await f.t.query(publicStorefront, storefrontArgs(f)))?.storefrontTerms).toEqual(TERMS)
    if (gate === "contract") await allowOnlyV1(f)
    if (gate === "mapping") await f.t.run(async ctx => { const mapping = await ctx.db.query("commerceCatalogMappings").withIndex("by_network_shop", q => q.eq("networkId", f.root).eq("shopId", f.shopId)).unique(); await ctx.db.patch(mapping!._id, { generation: mapping!.generation + 1 }) })
    if (gate === "parent") await applied(f, { type: "shop.withdrawn", shopRef: SHOP, linkRef: LINK, revision: 2, changedAt: NOW, reason: "consent_withdrawn" }, COMMERCE_PUBLIC_CONTRACT_V2)
    expect(await f.as.query(memberStorefront, storefrontArgs(f))).not.toHaveProperty("storefrontTerms")
    expect(await f.t.query(publicStorefront, storefrontArgs(f))).not.toHaveProperty("storefrontTerms")
  })
})

async function catalogReviewer(f: Fixture, role: "member" | "network_admin" = "network_admin") {
  const as = f.t.withIdentity({ subject: `catalogue-reviewer-${role}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle: `catalog-review-${role.replace("_", "-")}`, displayName: "Recette modération" })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: f.root })
  await f.t.run(async ctx => { const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", f.root).eq("personId", personId)).unique(); await ctx.db.patch(membership!._id, { role }) })
  return { as, personId }
}
async function pendingTermsFixture(terms = TERMS) {
  const f = await fixture([COMMERCE_PUBLIC_CONTRACT_V2])
  await termsPolicy(f, true)
  await applied(f, shop(1, { storefrontTerms: terms }), COMMERCE_PUBLIC_CONTRACT_V2)
  const state = (await termsState(f))!
  return { ...f, target: { kind: "commerceStorefront" as const, id: state.targetId as Id<"commerceCatalogHeads"> } }
}

describe("MP05 — revue des conditions réellement présentées", () => {
  it.each([true, false])("une livraison R+1 interdit la décision %s fondée sur l'aperçu R", async approve => {
    const f = await pendingTermsFixture(), reviewer = await catalogReviewer(f)
    const preview = await reviewer.as.query(api.modules.moderation.reviewProjection.preview, { networkId: f.root, target: f.target })
    expect(preview).toMatchObject({ available: true, sourceRevision: 1 })
    expect(preview.sourceDigest).toMatch(/^[a-f0-9]{64}$/)
    const args = { networkId: f.root, target: f.target, approve, reason: "Décision après lecture des conditions.", expectedSourceRevision: preview.sourceRevision!, expectedSourceDigest: preview.sourceDigest! }
    expect(await code(reviewer.as.mutation(api.modules.moderation.cases.reviewContent, { ...args, expectedSourceDigest: "0".repeat(64) }))).toBe("notFound")
    await applied(f, shop(2, { storefrontTerms: { ...TERMS, returns: { summary: "Nouvelle clause à relire avant décision." } } }), COMMERCE_PUBLIC_CONTRACT_V2)
    expect(await code(reviewer.as.mutation(api.modules.moderation.cases.reviewContent, args))).toBe("notFound")
    expect((await termsState(f))?.status).toBe("pending_review")
    expect(await f.t.query(publicStorefront, storefrontArgs(f))).not.toHaveProperty("storefrontTerms")
    const current = await reviewer.as.query(api.modules.moderation.reviewProjection.preview, { networkId: f.root, target: f.target })
    expect(current.sourceRevision).toBe(2)
    expect(current.sourceDigest).not.toBe(preview.sourceDigest)
    expect(current.body).toContain("Nouvelle clause à relire")
    await reviewer.as.mutation(api.modules.moderation.cases.reviewContent, { ...args, expectedSourceRevision: current.sourceRevision!, expectedSourceDigest: current.sourceDigest! })
    expect((await termsState(f))?.status).toBe(approve ? "published" : "removed")
    if (approve) expect((await f.t.query(publicStorefront, storefrontArgs(f)))?.storefrontTerms?.returns?.summary).toBe("Nouvelle clause à relire avant décision.")
    else expect(await f.t.query(publicStorefront, storefrontArgs(f))).not.toHaveProperty("storefrontTerms")
  })

  it("présente intégralement la clause finale d'un document contractuel dépassant 4000 caractères", async () => {
    const finalClause = "CLAUSE FINALE A EXAMINER AVANT TOUTE DECISION."
    const terms: CommerceStorefrontTerms = { ...TERMS,
      pickup: { points: Array.from({ length: 20 }, (_, index) => ({ establishmentRef: `pro.ga:establishment:${String(index + 1).padStart(26, "0")}`, label: `Point ${index} ${"a".repeat(65)}` })) },
      delivery: { ...TERMS.delivery!, localities: Array.from({ length: 20 }, (_, index) => `Localité ${index} ${"b".repeat(90)}`) },
      returns: { summary: "r".repeat(950) }, warranty: { summary: finalClause },
    }
    const f = await pendingTermsFixture(terms), reviewer = await catalogReviewer(f)
    const preview = await reviewer.as.query(api.modules.moderation.reviewProjection.preview, { networkId: f.root, target: f.target })
    expect(preview.available).toBe(true)
    expect(preview.body!.length).toBeGreaterThan(4000)
    expect(preview.body!.indexOf(finalClause)).toBeGreaterThan(4000)
    expect(preview.body!.endsWith(finalClause)).toBe(true)
    expect(preview).not.toHaveProperty("rawBody")
    expect(preview).not.toHaveProperty("shopRef")
  })

  it("un signataire de la page devenu administrateur ne peut pas juger ses propres conditions", async () => {
    const f = await pendingTermsFixture(), reviewer = await catalogReviewer(f)
    const preview = await reviewer.as.query(api.modules.moderation.reviewProjection.preview, { networkId: f.root, target: f.target })
    await f.t.run(async ctx => { const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", f.root).eq("personId", f.personId)).unique(); await ctx.db.patch(membership!._id, { role: "network_admin" }) })
    for (const approve of [true, false]) expect(await code(f.as.mutation(api.modules.moderation.cases.reviewContent, { networkId: f.root, target: f.target, approve, reason: "Revue des conditions de ma propre page.", expectedSourceRevision: preview.sourceRevision!, expectedSourceDigest: preview.sourceDigest! }))).toBe("notFound")
    expect((await termsState(f))?.status).toBe("pending_review")
  })

  it("un simple membre ne peut ni prévisualiser ni approuver les conditions en attente", async () => {
    const f = await pendingTermsFixture(), member = await catalogReviewer(f, "member"), state = (await termsState(f))!
    const parent = await f.t.run(async ctx => await ctx.db.get(f.target.id))
    expect(await code(member.as.query(api.modules.moderation.reviewProjection.preview, { networkId: f.root, target: f.target }))).toBe("notFound")
    expect(await code(member.as.mutation(api.modules.moderation.cases.reviewContent, { networkId: f.root, target: f.target, approve: true, reason: "Tentative sans habilitation de modération.", expectedSourceRevision: parent!.revision, expectedSourceDigest: parent!.digest }))).toBe("notFound")
    expect((await termsState(f))?._id).toBe(state._id)
    expect((await termsState(f))?.status).toBe("pending_review")
  })

  it("une habilitation d'équipe révoquée après lecture ferme immédiatement la décision", async () => {
    const f = await pendingTermsFixture(), admin = await catalogReviewer(f), member = await catalogReviewer(f, "member")
    const { teamId } = await admin.as.mutation(api.modules.moderation.cases.createTeam, { networkId: f.root, name: "Conditions des boutiques", scope: "commerceStorefront", reason: "Équipe de recette des conditions." })
    await admin.as.mutation(api.modules.moderation.cases.setTeamMember, { networkId: f.root, teamId, personId: member.personId, active: true, reason: "Habilitation temporaire de recette." })
    const preview = await member.as.query(api.modules.moderation.reviewProjection.preview, { networkId: f.root, target: f.target })
    expect(preview.available).toBe(true)
    await admin.as.mutation(api.modules.moderation.cases.setTeamMember, { networkId: f.root, teamId, personId: member.personId, active: false, reason: "Révocation avant décision de recette." })
    expect(await code(member.as.query(api.modules.moderation.reviewProjection.preview, { networkId: f.root, target: f.target }))).toBe("notFound")
    expect(await code(member.as.mutation(api.modules.moderation.cases.reviewContent, { networkId: f.root, target: f.target, approve: true, reason: "Tentative après révocation de compétence.", expectedSourceRevision: preview.sourceRevision!, expectedSourceDigest: preview.sourceDigest! }))).toBe("notFound")
    expect((await termsState(f))?.status).toBe("pending_review")
  })
})


it("MP05d — une continuation ne traverse pas le retrait et la republication du parent", async () => {
  const f = await fixture()
  await applied(f, shop()); await applied(f, offer(1, { offerRef: indexedRef(1) })); await applied(f, offer(1, { offerRef: indexedRef(2) }))
  const args = catalogArgs(f, { paginationOpts: { cursor: null, numItems: 1 } })
  const first = await f.as.query(list, args)
  expect(first.continueCursor).not.toBe("")
  await applied(f, { type: "shop.withdrawn", shopRef: SHOP, linkRef: LINK, revision: 2, changedAt: NOW, reason: "consent_withdrawn" })
  await applied(f, shop(3))
  await applied(f, offer(2, { offerRef: indexedRef(1) })); await applied(f, offer(2, { offerRef: indexedRef(2) }))
  expect(await code(f.as.query(list, { ...args, paginationOpts: { cursor: first.continueCursor, numItems: 1 } }))).toBe("invalidArgument")
  expect((await f.as.query(list, args)).page).toHaveLength(1)
})

const SERVICE_PROFILE: CommerceServiceProfile = {
  version: 1, commercialModes: ["quote", "booking"], languageCodes: ["fr-GA", "en"],
  zones: [{ countryCode: "GA", locality: "Île témoin" }], deliverables: ["Rapport public"],
  inclusions: ["Diagnostic"], exclusions: ["Déplacement hors zone"],
  portfolio: [{ title: "Projet public", description: "Réalisation publique", mediaIndexes: [] }],
}
async function enableServicePresentation(f: Fixture) {
  await f.t.run(async ctx => ctx.db.patch(f.shopId, { activityConfiguration: { version: 1, capabilities: ["products", "services"], template: "expert", blocks: ["services", "catalog", "about"] } }))
}
async function serviceFixture(profile = SERVICE_PROFILE, preReview = false) {
  const f = await fixture([COMMERCE_PUBLIC_CONTRACT_V2])
  await enableServicePresentation(f)
  if (preReview) await f.t.run(async ctx => { const policy = await ctx.db.query("moderationPolicies").withIndex("by_network_surface", q => q.eq("networkId", f.root).eq("surface", "commerceOffer")).unique(); await ctx.db.patch(policy!._id, { preReview: true }) })
  await applied(f, shop(), COMMERCE_PUBLIC_CONTRACT_V2)
  await applied(f, offer(1, { kind: "service", serviceProfile: profile }), COMMERCE_PUBLIC_CONTRACT_V2)
  return f
}
async function offerModerationState(f: Fixture) {
  const current = (await head(f))!
  return await f.t.run(async ctx => await ctx.db.query("moderationContentStates").withIndex("by_target", q => q.eq("targetKind", "commerceOffer").eq("targetId", current._id)).unique())
}

describe("MP06 — profil public et catalogue local des services", () => {
  it("projette seulement le profil publié dans les mêmes DTO membre et public, sans effet commercial", async () => {
    const f = await serviceFixture()
    const member = await f.as.query(getOffer, f.offerArgs)
    expect(member).toMatchObject({ kind: "service", serviceProfile: SERVICE_PROFILE, actions: { quote: false, purchase: false } })
    expect(await f.t.query(getPublicOffer, f.offerArgs)).toEqual(member)
    expect(member).not.toHaveProperty("agenda")
    expect(member).not.toHaveProperty("rawBody")
    expect(member).not.toHaveProperty("subjectRef")
    expect((await f.t.query(publicList, catalogArgs(f, { kind: "service", languageCode: "FR-ga", serviceZone: "ile temoin", commercialMode: "booking" }))).page).toEqual([member])
    await applied(f, offer(2, { kind: "service", serviceProfile: { ...SERVICE_PROFILE, portfolio: [] } }), COMMERCE_PUBLIC_CONTRACT_V2)
    expect((await f.as.query(getOffer, f.offerArgs))?.serviceProfile?.portfolio).toEqual([])
  })

  it("refuse un profil V1, un profil de produit, un champ privé et un média hors manifeste", async () => {
    const f = await fixture([COMMERCE_PUBLIC_CONTRACT, COMMERCE_PUBLIC_CONTRACT_V2])
    await enableServicePresentation(f); await applied(f, shop(), COMMERCE_PUBLIC_CONTRACT_V2)
    for (const [payload, contract] of [
      [offer(1, { kind: "service", serviceProfile: SERVICE_PROFILE }), COMMERCE_PUBLIC_CONTRACT],
      [offer(1, { serviceProfile: SERVICE_PROFILE }), COMMERCE_PUBLIC_CONTRACT_V2],
      [offer(1, { kind: "service", serviceProfile: { ...SERVICE_PROFILE, portfolio: [{ title: "Projet", description: "Public", mediaIndexes: [0] }] } }), COMMERCE_PUBLIC_CONTRACT_V2],
    ] as const) expect((await deliver(f, payload, contract)).status).toBe(400)
    const invalid = { ...SERVICE_PROFILE, portfolio: [{ title: "Projet", description: "Public", mediaIndexes: [], email: "private@example.test" }] }
    // Le champ voisin excédentaire reste un vrai objet d'entrée, jamais un profil nettoyé par la fixture.
    expect((await deliver(f, offer(1, { kind: "service", serviceProfile: invalid }), COMMERCE_PUBLIC_CONTRACT_V2)).status).toBe(400)
    expect(await head(f)).toBeNull()
  })

  it("filtre les services locaux avant pagination et garde une projection publique identique", async () => {
    const f = await fixture([COMMERCE_PUBLIC_CONTRACT_V2])
    await enableServicePresentation(f); await applied(f, shop(), COMMERCE_PUBLIC_CONTRACT_V2)
    for (let index = 1; index <= 14; index++) await applied(f, offer(1, { offerRef: indexedRef(index), kind: "service", changedAt: NOW - index * 1000, serviceProfile: { ...SERVICE_PROFILE, commercialModes: ["quote"], languageCodes: ["en"], zones: [{ countryCode: "GA", locality: "Owendo" }] } }), COMMERCE_PUBLIC_CONTRACT_V2)
    await applied(f, offer(1, { offerRef: indexedRef(15), kind: "service", serviceProfile: SERVICE_PROFILE, facets: { taxonomyVersion: 1, categoryPath: ["services", "services.digital"], attributes: [{ key: "durationMinutes", type: "number", value: 90 }] } }), COMMERCE_PUBLIC_CONTRACT_V2)
    const args = catalogArgs(f, { kind: "service", commercialMode: ["booking", "fixed_order"], languageCode: ["FR-ga", "pt"], serviceZone: ["ÎLE TÉMOIN", "Libreville"], minDurationMinutes: 60, maxDurationMinutes: 120, sort: "price_asc", paginationOpts: { cursor: null, numItems: 1 } })
    const member = await f.as.query(list, args)
    expect(member.page.map(item => item.offerRef)).toEqual([indexedRef(15)])
    expect(member.isDone).toBe(true)
    expect(await f.t.query(publicList, args)).toEqual(member)
    expect((await f.as.query(list, { ...args, maxDurationMinutes: 80 })).page).toEqual([])
    expect((await f.t.query(publicList, { ...args, query: "realisation", sort: "relevance" })).page.map(item => item.offerRef)).toEqual([indexedRef(15)])
  })

  it("relit le retrait de capacité services sans fermer les produits d'une activité mixte", async () => {
    const f = await serviceFixture()
    await applied(f, offer(1, { offerRef: indexedRef(2) }), COMMERCE_PUBLIC_CONTRACT_V2)
    expect(await f.as.query(getOffer, f.offerArgs)).not.toBeNull()
    await f.t.run(async ctx => ctx.db.patch(f.shopId, { activityConfiguration: { version: 1, capabilities: ["products"], template: "general", blocks: ["catalog", "about"] } }))
    expect(await f.as.query(getOffer, f.offerArgs)).toBeNull()
    expect(await f.t.query(getPublicOffer, f.offerArgs)).toBeNull()
    expect((await f.as.query(list, catalogArgs(f, { kind: "service" }))).page).toEqual([])
    expect((await f.t.query(publicList, catalogArgs(f))).page.map(item => item.offerRef)).toEqual([indexedRef(2)])
    await enableServicePresentation(f)
    expect((await f.as.query(getOffer, f.offerArgs))?.serviceProfile).toEqual(SERVICE_PROFILE)
  })

  it("trouve une ancienne version locale 1 au-delà de la première page et ne la déclare pas reconstruite", async () => {
    const f = await serviceFixture()
    for (let index = 1; index <= 14; index++) await applied(f, offer(1, { offerRef: indexedRef(index), changedAt: NOW - index * 1000 }), COMMERCE_PUBLIC_CONTRACT_V2)
    const old = await f.t.run(async ctx => { const row = await ctx.db.query("commerceCatalogHeads").withIndex("by_emitter_object_sequence", q => q.eq("emitterId", f.emitterId).eq("objectRef", indexedRef(14)).eq("sequence", "catalog")).unique(); await ctx.db.patch(row!._id, { localIndexVersion: 1, discoveryVersion: 1 }); return row!._id })
    expect(await f.as.query(list, catalogArgs(f, { commercialMode: "booking" }))).toMatchObject({ indexStatus: "building", page: [] })
    expect(await f.as.query(list, catalogArgs(f))).toMatchObject({ indexStatus: "building" })
    await f.t.run(async ctx => { const row = (await ctx.db.get(old))!; await ctx.db.patch(old, marketplaceIndexFields(row.body, row.state, row.objectKind, row.sequence, NOW)) })
    expect((await f.t.query(publicList, catalogArgs(f, { commercialMode: "booking" }))).page.map(item => item.offerRef)).toEqual([OFFER])
  })
})

function longServiceProfile(finalClause: string): CommerceServiceProfile {
  return { ...SERVICE_PROFILE,
    deliverables: Array.from({ length: 8 }, (_, index) => `Livrable ${index} ${"d".repeat(180)}`),
    inclusions: Array.from({ length: 8 }, (_, index) => `Inclusion ${index} ${"i".repeat(180)}`),
    exclusions: Array.from({ length: 8 }, (_, index) => `Exclusion ${index} ${"e".repeat(180)}`),
    portfolio: Array.from({ length: 6 }, (_, index) => ({ title: `Projet ${index}`, description: index === 5 ? finalClause : `Projet ${index} ${"p".repeat(480)}`, mediaIndexes: [] })),
  }
}
describe("MP06 — modération du profil complet de prestation", () => {
  it("examine une clause de portfolio au-delà de 4000 caractères et ferme tous les lecteurs si elle est bloquée", async () => {
    const finalClause = "Dernière clause sentinelleportfolio à examiner."
    const f = await fixture([COMMERCE_PUBLIC_CONTRACT_V2])
    await enableServicePresentation(f)
    await f.t.run(async ctx => ctx.db.insert("blockedTerms", { networkId: f.root, term: "sentinelleportfolio", active: true, updatedAt: NOW }))
    await applied(f, shop(), COMMERCE_PUBLIC_CONTRACT_V2)
    await applied(f, offer(1, { kind: "service", serviceProfile: longServiceProfile(finalClause) }), COMMERCE_PUBLIC_CONTRACT_V2)
    expect((await offerModerationState(f))?.status).toBe("pending_review")
    const reviewer = await catalogReviewer(f)
    const target = { kind: "commerceOffer" as const, id: (await head(f))!._id }
    const preview = await reviewer.as.query(api.modules.moderation.reviewProjection.preview, { networkId: f.root, target })
    expect(preview).toMatchObject({ available: true, sourceRevision: 1 })
    expect(preview.body!.indexOf(finalClause)).toBeGreaterThan(4000)
    expect(preview.body).toContain(finalClause)
    expect(await f.as.query(getOffer, f.offerArgs)).toBeNull()
    expect(await reviewer.as.query(getOffer, f.offerArgs)).toBeNull()
    expect(await f.t.query(getPublicOffer, f.offerArgs)).toBeNull()
  })

  it.each([true, false])("exige la preuve courante du profil complet avant une décision %s", async approve => {
    const f = await serviceFixture(longServiceProfile("Clause finale version un."), true), reviewer = await catalogReviewer(f)
    const target = { kind: "commerceOffer" as const, id: (await head(f))!._id }
    const preview = await reviewer.as.query(api.modules.moderation.reviewProjection.preview, { networkId: f.root, target })
    const args = { networkId: f.root, target, approve, reason: "Lecture complète du profil et de son portfolio." }
    expect(await code(reviewer.as.mutation(api.modules.moderation.cases.reviewContent, args))).toBe("notFound")
    await applied(f, offer(2, { kind: "service", serviceProfile: longServiceProfile("Clause finale version deux.") }), COMMERCE_PUBLIC_CONTRACT_V2)
    expect(await code(reviewer.as.mutation(api.modules.moderation.cases.reviewContent, { ...args, expectedSourceRevision: preview.sourceRevision!, expectedSourceDigest: preview.sourceDigest! }))).toBe("notFound")
    expect((await offerModerationState(f))?.status).toBe("pending_review")
    const current = await reviewer.as.query(api.modules.moderation.reviewProjection.preview, { networkId: f.root, target })
    expect(current.body).toContain("Clause finale version deux.")
    expect(current.sourceRevision).toBe(2)
    await reviewer.as.mutation(api.modules.moderation.cases.reviewContent, { ...args, expectedSourceRevision: current.sourceRevision!, expectedSourceDigest: current.sourceDigest! })
    expect((await offerModerationState(f))?.status).toBe(approve ? "published" : "removed")
    expect((await f.t.query(getPublicOffer, f.offerArgs)) !== null).toBe(approve)
  })
})

/** Les références Stories passent par le VRAI catalogue signé et ses fichiers admis. */
describe("SU06 — plat du jour dans les Stories du réseau", () => {
  const stories = api.modules.stories.stories
  const DAY = "2026-10-18"
  const MIDNIGHT = Date.UTC(2026, 9, 18, 23)
  const shareArgs = (f: Fixture) => ({ networkId: f.root, shopId: f.shopId, expectedOfferRef: OFFER, expectedDay: DAY })
  const active = (f: Fixture) => f.as.query(stories.myActive, { networkId: f.root, now: Date.now() })
  async function ready() {
    const f = await fixture()
    const asset = await attachImage(f)
    // Un média fédéré ne devient servable qu'après une preuve AV complète.
    await f.t.run(async ctx => ctx.db.patch(asset.scan._id, { status: "clean", av: { provider: "fixture", verdict: "clean" } }))
    await f.t.run(async ctx => ctx.db.patch(f.shopId, { activityConfiguration: { version: 1, template: "food", capabilities: ["products", "services"], blocks: ["catalog", "services", "about"] } }))
    await f.as.mutation(api.modules.shops.shops.setDailySpecial, { networkId: f.root, shopId: f.shopId, offerRef: OFFER })
    expect((await f.as.query(getOffer, f.offerArgs))?.media[0]).toMatchObject({ url: expect.stringContaining(`/catalogue/media/${asset.token}`), withheld: null })
    return { ...f, asset }
  }
  async function member(f: Fixture, handle: string) {
    const as = f.t.withIdentity({ subject: `daily-story-${handle}` })
    const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: "Membre TEST" })
    await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: f.root })
    return { as, personId }
  }
  async function manager(f: Fixture) {
    const other = await member(f, "daily-co-manager")
    await f.t.run(async ctx => ctx.db.insert("pageSignatories", { networkId: f.root, pageId: f.pageId, personId: other.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW }))
    return other
  }
  async function allReadersOmit(f: Awaited<ReturnType<typeof ready>>, storyId: Id<"stories">) {
    expect(await active(f)).toEqual([])
    expect(await f.as.query(stories.listByAuthor, { networkId: f.root, handle: "catalogue-owner", now: Date.now() })).toEqual([])
    expect((await f.as.query(stories.tray, { networkId: f.root, now: Date.now() })).groups).toEqual([])
    expect(await code(f.as.mutation(stories.markSeen, { networkId: f.root, storyId }))).toBe("notFound")
    expect(await code(f.as.query(stories.viewers, { networkId: f.root, storyId, now: Date.now(), paginationOpts: { cursor: null, numItems: 10 } }))).toBe("notFound")
  }

  it("publie une référence sans copie, plafonne à minuit Libreville et rejoue sans prolonger", async () => {
    const f = await ready()
    const first = await f.as.mutation(stories.publishDailySpecial, shareArgs(f))
    expect(first).toMatchObject({ created: true, expiresAt: MIDNIGHT })
    const row = (await f.t.run(ctx => ctx.db.get(first.storyId)))!
    expect(row).toMatchObject({ authorPersonId: f.personId, audience: "public", networkId: f.root, media: { kind: "daily_special", shopId: f.shopId, offerRef: OFFER, day: DAY, revision: 1 } })
    expect(Object.keys(row.media).sort()).toEqual(["day", "kind", "offerRef", "revision", "shopId"])
    expect(referencesIn(row, shapeFor("stories")).some(ref => ref.table === "_storage")).toBe(false)
    const dto = (await active(f))[0]!
    expect(dto).toMatchObject({ storyId: first.storyId, media: { kind: "image", mimeType: "image/*", withheld: null }, dailySpecial: { shopHandle: "catalogue-test", shopName: "Boutique de recette", offerRef: OFFER, title: "Article de recette", price: { amount: 12_000, mode: "fixed", currency: "XAF" }, day: DAY }, isOwn: true, seen: true, viewCount: 0 })
    expect(dto.media.url).toContain(`/catalogue/media/${f.asset.token}`)
    expect(JSON.stringify(dto)).not.toContain(f.asset.storageId)
    expect(JSON.stringify(exportableRecord("stories", row, f.personId))).not.toContain("Article de recette")
    vi.setSystemTime(NOW + 60_000)
    expect(await f.as.mutation(stories.publishDailySpecial, shareArgs(f))).toEqual({ ...first, created: false })
    expect((await f.t.run(ctx => ctx.db.get(f.shopId)))?.dailySpecialRevision).toBe(1)
    await f.as.mutation(api.modules.shops.shops.setDailySpecial, { networkId: f.root, shopId: f.shopId, offerRef: OFFER })
    expect((await f.t.run(ctx => ctx.db.get(f.shopId)))?.dailySpecialRevision).toBe(1)
  })

  it("deux gérants partagent la même entrée atomique, même en concurrence", async () => {
    const f = await ready(), other = await manager(f)
    const results = await Promise.all([f.as.mutation(stories.publishDailySpecial, shareArgs(f)), other.as.mutation(stories.publishDailySpecial, shareArgs(f))])
    expect(results[0]!.storyId).toBe(results[1]!.storyId)
    expect(results.filter(item => item.created)).toHaveLength(1)
    expect(await f.t.run(ctx => ctx.db.query("stories").withIndex("by_network_daily_special_expiresAt", q => q.eq("networkId", f.root).eq("media.shopId", f.shopId).eq("media.revision", 1).gt("expiresAt", NOW)).take(2))).toHaveLength(1)
  })

  it("un gérant vivant peut remplacer le partage d'un gérant révoqué", async () => {
    const f = await ready(), other = await manager(f)
    const original = await other.as.mutation(stories.publishDailySpecial, shareArgs(f))
    await f.t.run(async ctx => {
      const signatory = (await ctx.db.query("pageSignatories").withIndex("by_page_person", q => q.eq("pageId", f.pageId).eq("personId", other.personId)).unique())!
      await ctx.db.patch(signatory._id, { acceptedAt: undefined })
    })
    expect(await other.as.query(stories.myActive, { networkId: f.root, now: NOW })).toEqual([])
    const next = await f.as.mutation(stories.publishDailySpecial, shareArgs(f))
    expect(next.created).toBe(true)
    expect(next.storyId).not.toBe(original.storyId)
    expect(await f.t.run(ctx => ctx.db.get(original.storyId))).toMatchObject({ removedAt: NOW, expiresAt: NOW })
    expect(await active(f)).toMatchObject([{ storyId: next.storyId }])
    expect(await f.as.mutation(stories.publishDailySpecial, shareArgs(f))).toEqual({ ...next, created: false })
  })

  it.each(["pending_review", "removed", "report", "block"] as const)("le relais d'un gérant révoqué conserve le refus %s", async gate => {
    const f = await ready(), other = await manager(f)
    const original = await other.as.mutation(stories.publishDailySpecial, shareArgs(f))
    if (gate === "report") await f.as.mutation(api.modules.moderation.cases.report, { networkId: f.root, target: { kind: "story", id: original.storyId }, reason: "harassment" })
    if (gate === "block") await f.as.mutation(api.modules.graph.connections.blockPerson, { networkId: f.root, targetPersonId: other.personId })
    await f.t.run(async ctx => {
      const signatory = (await ctx.db.query("pageSignatories").withIndex("by_page_person", q => q.eq("pageId", f.pageId).eq("personId", other.personId)).unique())!
      await ctx.db.patch(signatory._id, { acceptedAt: undefined })
      if (gate === "pending_review" || gate === "removed") {
        const state = (await ctx.db.query("moderationContentStates").withIndex("by_target", q => q.eq("targetKind", "story").eq("targetId", original.storyId)).unique())!
        await ctx.db.patch(state._id, { status: gate })
      }
    })
    expect(await code(f.as.mutation(stories.publishDailySpecial, shareArgs(f)))).toBe("notFound")
    expect(await f.t.run(ctx => ctx.db.query("stories").withIndex("by_network_daily_special_expiresAt", q => q.eq("networkId", f.root).eq("media.shopId", f.shopId).eq("media.revision", 1).gt("expiresAt", NOW)).take(2))).toMatchObject([{ _id: original.storyId }])
    expect(await f.t.run(ctx => ctx.db.get(original.storyId))).not.toHaveProperty("removedAt")
  })

  it("refuse un bouton périmé, un non-gérant et un réseau étranger sans créer de Story", async () => {
    const f = await ready(), stranger = await member(f, "daily-stranger")
    for (const override of [{ expectedOfferRef: "autre-offre" }, { expectedDay: "2026-10-17" }]) expect(await code(f.as.mutation(stories.publishDailySpecial, { ...shareArgs(f), ...override }))).toBe("notFound")
    expect(await code(stranger.as.mutation(stories.publishDailySpecial, shareArgs(f)))).toBe("notFound")
    const { testClosed } = await f.t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
    expect(await code(f.as.mutation(stories.publishDailySpecial, { ...shareArgs(f), networkId: testClosed }))).toBe("notFound")
    expect(await active(f)).toEqual([])
  })

  it("retirer puis redésigner le même produit ne ressuscite pas l'ancienne Story", async () => {
    const f = await ready(), original = await f.as.mutation(stories.publishDailySpecial, shareArgs(f))
    await f.as.mutation(api.modules.shops.shops.setDailySpecial, { networkId: f.root, shopId: f.shopId, offerRef: null })
    expect(await active(f)).toEqual([])
    expect(await f.t.run(ctx => ctx.db.get(original.storyId))).toMatchObject({ removedAt: NOW, expiresAt: NOW })
    await f.as.mutation(api.modules.shops.shops.setDailySpecial, { networkId: f.root, shopId: f.shopId, offerRef: OFFER })
    expect((await f.t.run(ctx => ctx.db.get(f.shopId)))?.dailySpecialRevision).toBe(3)
    expect(await active(f)).toEqual([])
    const next = await f.as.mutation(stories.publishDailySpecial, shareArgs(f))
    expect(next.created).toBe(true)
    expect(next.storyId).not.toBe(original.storyId)
    expect(await active(f)).toHaveLength(1)
  })

  it("un retrait explicite reste retiré ; un nouveau geste crée une autre Story", async () => {
    const f = await ready(), original = await f.as.mutation(stories.publishDailySpecial, shareArgs(f))
    await f.as.mutation(stories.remove, { networkId: f.root, storyId: original.storyId })
    expect(await active(f)).toEqual([])
    const next = await f.as.mutation(stories.publishDailySpecial, shareArgs(f))
    expect(next.created).toBe(true)
    expect(next.storyId).not.toBe(original.storyId)
    expect(await f.t.run(ctx => ctx.db.get(original.storyId))).toMatchObject({ removedAt: NOW })
  })

  it("une désignation de veille et minuit ferment lectures et gestes selon l'horloge serveur", async () => {
    const f = await ready()
    vi.setSystemTime(MIDNIGHT - 1)
    const result = await f.as.mutation(stories.publishDailySpecial, shareArgs(f))
    expect(result.expiresAt).toBe(MIDNIGHT)
    vi.setSystemTime(MIDNIGHT)
    await allReadersOmit(f, result.storyId)
    expect(await code(f.as.mutation(stories.publishDailySpecial, shareArgs(f)))).toBe("notFound")
  })

  it.each(["template", "catalog_hidden", "withdrawn", "page", "page_moderation", "offer", "offer_moderation", "service", "media", "catalog_policy", "publisher", "network"] as const)("referme chaque lecture et geste si la garde %s change, même pour l'auteur", async gate => {
    const f = await ready(), result = await f.as.mutation(stories.publishDailySpecial, shareArgs(f))
    const { testClosed } = await f.t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
    await f.t.run(async ctx => {
      if (gate === "template") await ctx.db.patch(f.shopId, { activityConfiguration: { version: 1, template: "general", capabilities: ["products"], blocks: ["catalog"] } })
      if (gate === "catalog_hidden") await ctx.db.patch(f.shopId, { activityConfiguration: { version: 1, template: "food", capabilities: ["products"], blocks: ["about"] } })
      if (gate === "withdrawn") await ctx.db.patch(f.shopId, { storefront: "withdrawn" })
      if (gate === "page") await ctx.db.patch(f.pageId, { status: "inactive" })
      if (gate === "page_moderation") await ctx.db.insert("moderationContentStates", { networkId: f.root, targetKind: "page", targetId: f.pageId, ownerPersonId: f.personId, status: "pending_review", createdAt: NOW, updatedAt: NOW })
      if (gate === "publisher") await ctx.db.patch(f.signatoryId, { acceptedAt: undefined })
      if (gate === "network") await ctx.db.patch(f.shopId, { networkId: testClosed })
      if (gate === "media") await ctx.db.patch(f.asset.scan._id, { status: "infected" })
      if (gate === "catalog_policy") { const policy = await ctx.db.query("shopCatalogPolicies").withIndex("by_network", q => q.eq("networkId", f.root)).unique(); await ctx.db.patch(policy!._id, { enabled: false }) }
      const current = await ctx.db.query("commerceCatalogHeads").withIndex("by_emitter_object_sequence", q => q.eq("emitterId", f.emitterId).eq("objectRef", OFFER).eq("sequence", "catalog")).unique()
      if (gate === "offer") await ctx.db.patch(current!._id, { state: "withdrawn" })
      if (gate === "offer_moderation") { const state = await ctx.db.query("moderationContentStates").withIndex("by_target", q => q.eq("targetKind", "commerceOffer").eq("targetId", current!._id)).unique(); await ctx.db.patch(state!._id, { status: "pending_review" }) }
      if (gate === "service") { const body = JSON.parse(current!.body); body.payload.kind = "service"; await ctx.db.patch(current!._id, { body: commerceCanonicalJson(body)! }) }
    })
    await allReadersOmit(f, result.storyId)
    expect(await code(f.as.mutation(stories.publishDailySpecial, shareArgs(f)))).toBe("notFound")
  })

  it("une nouvelle révision ferme l'ancienne référence et exige un nouveau geste", async () => {
    const f = await ready(), original = await f.as.mutation(stories.publishDailySpecial, shareArgs(f))
    await f.t.run(async ctx => ctx.db.patch(f.shopId, { dailySpecialRevision: 7 }))
    await allReadersOmit(f, original.storyId)
    const next = await f.as.mutation(stories.publishDailySpecial, shareArgs(f))
    expect(next.created).toBe(true)
    expect(next.storyId).not.toBe(original.storyId)
    expect(await active(f)).toMatchObject([{ storyId: next.storyId }])
    expect(await f.t.run(ctx => ctx.db.get(original.storyId))).toMatchObject({ media: { revision: 1 } })
  })

  it.each(["absent", "pending"] as const)("refuse de partager un plat dont le média est %s", async state => {
    const f = await ready()
    await f.t.run(async ctx => {
      if (state === "pending") await ctx.db.patch(f.asset.scan._id, { status: "pending", av: undefined })
      else {
        const current = (await ctx.db.query("commerceCatalogHeads").withIndex("by_emitter_object_sequence", q => q.eq("emitterId", f.emitterId).eq("objectRef", OFFER).eq("sequence", "catalog")).unique())!
        const body = JSON.parse(current.body)
        body.payload.media = []
        await ctx.db.patch(current._id, { body: commerceCanonicalJson(body)! })
      }
    })
    expect(await code(f.as.mutation(stories.publishDailySpecial, shareArgs(f)))).toBe("notFound")
    expect(await active(f)).toEqual([])
  })

  it("conserve blocages et vues uniques des Stories personnelles", async () => {
    const f = await ready(), reader = await member(f, "daily-reader"), result = await f.as.mutation(stories.publishDailySpecial, shareArgs(f))
    await reader.as.mutation(api.modules.graph.follows.follow, { networkId: f.root, handle: "catalogue-owner" })
    const readArgs = { networkId: f.root, handle: "catalogue-owner", now: NOW }
    expect(await reader.as.query(stories.listByAuthor, readArgs)).toHaveLength(1)
    expect((await reader.as.query(stories.tray, { networkId: f.root, now: NOW })).groups[0]).toMatchObject({ storyCount: 1, unseenCount: 1 })
    expect(await reader.as.mutation(stories.markSeen, { networkId: f.root, storyId: result.storyId })).toEqual({ seen: true, first: true })
    expect(await reader.as.mutation(stories.markSeen, { networkId: f.root, storyId: result.storyId })).toEqual({ seen: true, first: false })
    expect((await active(f))[0]?.viewCount).toBe(1)
    await reader.as.mutation(api.modules.graph.connections.blockPerson, { networkId: f.root, targetPersonId: f.personId })
    expect(await code(reader.as.query(stories.listByAuthor, readArgs))).toBe("notFound")
    expect((await reader.as.query(stories.tray, { networkId: f.root, now: NOW })).groups).toEqual([])
    expect(await code(reader.as.mutation(stories.markSeen, { networkId: f.root, storyId: result.storyId }))).toBe("notFound")
  })

  it("le plafond actif reste celui d'une Story personnelle", async () => {
    const f = await ready()
    await f.t.run(async ctx => { for (let n = 0; n < STORY_ACTIVE_PER_AUTHOR_MAX; n++) await ctx.db.insert("stories", { networkId: f.root, authorPersonId: f.personId, media: { storageId: f.asset.storageId, kind: "image", mimeType: "image/png", sizeBytes: 68 }, audience: "public", publishedAt: NOW, expiresAt: MIDNIGHT }) })
    await expect(f.as.mutation(stories.publishDailySpecial, shareArgs(f))).rejects.toThrow("STORY_ACTIVE_LIMIT")
  })

  it("le rejeu idempotent reste soumis au budget de publication personnel", async () => {
    const f = await ready()
    const first = await f.as.mutation(stories.publishDailySpecial, shareArgs(f))
    let refusal: string | null = null
    for (let attempt = 0; attempt < 10 && refusal === null; attempt++) {
      try { expect(await f.as.mutation(stories.publishDailySpecial, shareArgs(f))).toEqual({ ...first, created: false }) }
      catch (error) { refusal = engineErrorCode(error) }
    }
    expect(refusal).toBe("rateLimited")
    expect(await active(f)).toMatchObject([{ storyId: first.storyId }])
  })

  it("la purge de la Story laisse intacts le produit, son blob et sa ligne d'analyse", async () => {
    const f = await ready(), result = await f.as.mutation(stories.publishDailySpecial, shareArgs(f)), before = await head(f)
    await f.as.mutation(stories.remove, { networkId: f.root, storyId: result.storyId })
    vi.setSystemTime(NOW + 1)
    await f.t.mutation(internal.modules.stories.stories.purgeExpired, {})
    expect(await f.t.run(ctx => ctx.db.get(result.storyId))).toBeNull()
    expect(await head(f)).toEqual(before)
    expect(await f.t.run(ctx => ctx.db.system.get("_storage", f.asset.storageId))).not.toBeNull()
    expect(await f.t.run(ctx => ctx.db.get(f.asset.scan._id))).not.toBeNull()
  })

  it("l'aperçu de modération ne montre jamais le contenu d'une référence devenue illisible", async () => {
    const f = await ready(), reader = await member(f, "daily-reporter"), result = await f.as.mutation(stories.publishDailySpecial, shareArgs(f))
    await f.t.run(async ctx => { const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", f.root).eq("personId", f.personId)).unique(); await ctx.db.patch(membership!._id, { role: "network_admin" }) })
    const { reportId } = await reader.as.mutation(api.modules.moderation.cases.report, { networkId: f.root, target: { kind: "story", id: result.storyId }, reason: "harassment" })
    expect(await f.as.query(api.modules.moderation.reviewProjection.preview, { networkId: f.root, reportId })).toMatchObject({ available: true, title: "Article de recette" })
    await f.t.run(async ctx => ctx.db.patch(f.asset.scan._id, { status: "infected" }))
    expect(await f.as.query(api.modules.moderation.reviewProjection.preview, { networkId: f.root, reportId })).toEqual({ kind: "story", available: false, title: null, body: null, media: [] })
  })

  it("effacer un gérant qui a partagé ne possède pas les fichiers du catalogue de la page", async () => {
    const f = await ready(), other = await manager(f)
    const result = await other.as.mutation(stories.publishDailySpecial, shareArgs(f))
    await other.as.mutation(api.modules.people.erasure.requestErasure, { confirmation: "DELETE_MY_ANTSIA_ACCOUNT" })
    const job = (await f.t.run(ctx => ctx.db.query("dataErasureJobs").first()))!
    vi.setSystemTime(NOW + ERASURE_GRACE_MS + 1)
    await f.t.mutation(internal.modules.people.erasure.continueErasure, { jobId: job._id })
    for (let step = 0; step < 1500 && await f.t.run(ctx => ctx.db.get(job._id)); step++) { vi.runAllTimers(); await f.t.finishInProgressScheduledFunctions() }
    expect(await f.t.run(ctx => ctx.db.get(other.personId))).toBeNull()
    expect(await f.t.run(ctx => ctx.db.get(result.storyId))).toBeNull()
    expect(await f.t.run(ctx => ctx.db.get(f.shopId))).not.toBeNull()
    expect(await head(f)).not.toBeNull()
    expect(await f.t.run(ctx => ctx.db.system.get("_storage", f.asset.storageId))).not.toBeNull()
    expect(await f.t.run(ctx => ctx.db.get(f.asset.scan._id))).not.toBeNull()
  }, 20_000)
})


describe("SU06 — fenêtre opérateur des rattachements", () => {
  it("projette seulement l’identité de page, la liaison vivante et le rattachement courant", async () => {
    const f = await fixture([COMMERCE_PUBLIC_CONTRACT_V2])
    const result = await f.as.query(api.modules.shops.catalogControl.paginateMappings, { networkId: f.root, paginationOpts: { cursor: null, numItems: 20 } })
    expect(result.page).toEqual([{ shopId: f.shopId, name: "Boutique de recette", handle: "catalogue-test", link: { environment: "sandbox", publishCatalog: true }, mapping: { emitterId: f.emitterId, emitterSlug: "pro-catalog-test", enabled: true, generation: 1 } }])
    expect(result.isDone).toBe(true)
    expect(JSON.stringify(result)).not.toContain(KEY)
    expect(JSON.stringify(result)).not.toContain("configFingerprint")
    expect(JSON.stringify(result)).not.toContain(SHOP)
  })

  it("une configuration tournée ferme la liaison sans masquer le rattachement révocable", async () => {
    const f = await fixture([COMMERCE_PUBLIC_CONTRACT_V2])
    vi.stubEnv("ANTSIA_COMMERCE_SIGNING_KEY", KEY + "-rotation")
    const result = await f.as.query(api.modules.shops.catalogControl.paginateMappings, { networkId: f.root, paginationOpts: { cursor: null, numItems: 20 } })
    expect(result.page[0]).toMatchObject({ link: null, mapping: { emitterId: f.emitterId, enabled: true, generation: 1 } })
    await f.as.mutation(mapping, { networkId: f.root, shopId: f.shopId, emitterId: f.emitterId, enabled: false, reason: "Fermeture explicite du rattachement après rotation" })
    expect((await f.as.query(api.modules.shops.catalogControl.paginateMappings, { networkId: f.root, paginationOpts: { cursor: null, numItems: 20 } })).page[0]).toMatchObject({ link: null, mapping: { enabled: false, generation: 2 } })
  })

  it("une liaison sans droit catalogue et une page désactivée ne deviennent pas des candidats actifs", async () => {
    const f = await fixture()
    await f.t.run(ctx => ctx.db.patch(f.linkId, { permissions: [] }))
    expect((await f.as.query(api.modules.shops.catalogControl.paginateMappings, { networkId: f.root, paginationOpts: { cursor: null, numItems: 20 } })).page[0]?.link).toEqual({ environment: "sandbox", publishCatalog: false })
    await f.t.run(ctx => ctx.db.patch(f.pageId, { status: "inactive" }))
    expect((await f.as.query(api.modules.shops.catalogControl.paginateMappings, { networkId: f.root, paginationOpts: { cursor: null, numItems: 20 } })).page[0]).toMatchObject({ name: null, handle: null, link: null, mapping: { enabled: true } })
  })

  it("borne chaque fenêtre à vingt et poursuit sans perdre la boutique publiée", async () => {
    const f = await fixture()
    await f.t.run(async ctx => {
      for (let index = 0; index < 24; index++) await ctx.db.insert("shops", { networkId: f.root, ownerPersonId: f.personId, draftName: `Brouillon ${index}`, model: "products", storefront: "draft", visibility: "network", createdAt: NOW + index, updatedAt: NOW + index })
      const source = await ctx.db.get(f.root)
      if (!source) throw new Error("Réseau de fixture absent")
      const { _id, _creationTime, ...settings } = source
      const foreign = await ctx.db.insert("networks", { ...settings, slug: "catalogue-autre-reseau", kind: "closed", parentId: f.root })
      await ctx.db.insert("shops", { networkId: foreign, ownerPersonId: f.personId, draftName: "Autre réseau", model: "products", storefront: "draft", visibility: "network", createdAt: NOW, updatedAt: NOW })
    })
    const first = await f.as.query(api.modules.shops.catalogControl.paginateMappings, { networkId: f.root, paginationOpts: { cursor: null, numItems: 1000 } })
    expect(first.page).toHaveLength(20)
    expect(first.isDone).toBe(false)
    const next = await f.as.query(api.modules.shops.catalogControl.paginateMappings, { networkId: f.root, paginationOpts: { cursor: first.continueCursor, numItems: 1000 } })
    expect(next.page).toHaveLength(5)
    expect(next.isDone).toBe(true)
    const ids = [...first.page, ...next.page].map(row => row.shopId)
    expect(new Set(ids).size).toBe(25)
    expect(ids).toContain(f.shopId)
  })

  it("refuse le visiteur et l’opérateur de niveau1 sans exposer de fenêtre", async () => {
    const f = await fixture()
    const args = { networkId: f.root, paginationOpts: { cursor: null, numItems: 20 } }
    await expect(f.t.query(api.modules.shops.catalogControl.paginateMappings, args)).rejects.toThrow()
    await f.as.run(async ctx => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity || typeof identity.sessionId !== "string") throw new Error("Session de fixture absente")
      const link = await ctx.db.query("identityLinks").withIndex("by_person_and_provider", q => q.eq("personId", f.personId).eq("provider", "idn")).unique()
      const access = await ctx.db.query("operatorSessionProofs").withIndex("by_session", q => q.eq("sessionId", identity.sessionId as string)).unique()
      const proof = link ? await ctx.db.query("idnProofs").withIndex("by_subject", q => q.eq("subject", link.subject)).unique() : null
      if (!link || !access || !proof) throw new Error("Preuve de fixture absente")
      await ctx.db.patch(link._id, { loa: 1 })
      await ctx.db.patch(proof._id, { loa: 1 })
      await ctx.db.patch(access._id, { loa: 1 })
    })
    expect(await code(f.as.query(api.modules.shops.catalogControl.paginateMappings, args))).toBe("notFound")
  })
})
