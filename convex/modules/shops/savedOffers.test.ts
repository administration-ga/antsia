// @vitest-environment edge-runtime
/** CM-09 : favoris d'offres — privés, idempotents, bornés, relus à chaque lecture, purgés avec leur boutique. */
import { engineErrorAppRule, engineErrorCode } from "@antsia/social-contracts/errors"
import { COMMERCE_PUBLIC_CONTRACT, commerceCanonicalJson } from "@antsia/social-domain/commerce/primitives"
import { commercePublicEffect, type CommerceOfferEvent, type CommercePublicEvent, type CommerceShopEvent } from "@antsia/social-domain/commerce/projection"
import { COMMERCE_LINK_CONSENT_VERSION } from "@antsia/social-domain/commerce-link"
import { federationSigningText } from "@antsia/social-domain/federationProtocol"
import { makeFunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, testConvex } from "../../test.setup"
import { directlyOwned, exportableRecord } from "../people/dataInventory"
import { readCommerceLinkConfig } from "./commerceLinkConfig"
import { SHOP_PUBLIC_LISTING_TEXT_VERSION } from "./rules"
import { purgeSavedOffersForShop, SAVED_OFFERS_MAX, SAVED_OFFERS_PURGE_BATCH } from "./savedOffers"

const NOW = Date.UTC(2026, 10, 10, 12)
const SHOP = "pro.ga:structure:01JA00000000000000000000S9", OFFER = "pro.ga:offer:01JA00000000000000000000P9"
const LINK = "pro.ga:commerce_link:01JA00000000000000000000K9"
const KEY_NAME = "ANTSIA_FEDERATION_SAVED_OFFERS_TEST_KEY", KEY = "favoris-test-secret-key-sandbox-0123456789"
const HANDLE = "favoris-recette"
let eventSequence = 0
const policy = makeFunctionReference<"mutation", { networkId: Id<"networks">; enabled: boolean; reason: string }, null>("modules/shops/catalogControl:setPolicy")
const mapping = makeFunctionReference<"mutation", { networkId: Id<"networks">; shopId: Id<"shops">; emitterId: Id<"federationEmitters">; enabled: boolean; reason: string }, null>("modules/shops/catalogControl:configureMapping")

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
  vi.stubEnv("ANTSIA_COMMERCE_KEY_ID", "antsia-saved-offers-test")
  vi.stubEnv("ANTSIA_COMMERCE_SIGNING_KEY", KEY)
  vi.stubEnv("ANTSIA_CATALOG_MEDIA_ORIGIN", "http://localhost:3211")
  vi.stubEnv("FILE_GUARD", "off")
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

/** Une boutique fictive au catalogue reflété (même chaîne que `catalog.test.ts`), son gérant et un lecteur distinct. */
async function fixture() {
  const t = testConvex()
  const { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const owner = t.withIdentity({ subject: "favoris-gerant-fixture" })
  const ownerId = await owner.mutation(api.modules.people.persons.ensureMyPerson, {})
  await owner.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await owner.mutation(api.modules.people.profile.publishMyProfile, { handle: "favoris-gerant", displayName: "Gérant" })
  await owner.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  await t.run(async (ctx) => ctx.db.insert("operators", { personId: ownerId, role: "platform_admin", grantedAt: NOW }))
  await createTestOperatorProof(t, owner, ownerId)
  const reader = t.withIdentity({ subject: "favoris-lecteur-fixture" })
  const readerId = await reader.mutation(api.modules.people.persons.ensureMyPerson, {})
  await reader.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await reader.mutation(api.modules.people.profile.publishMyProfile, { handle: "favoris-lecteur", displayName: "Lecteur" })
  await reader.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  const config = await readCommerceLinkConfig()
  if (!config) throw new Error("Configuration de fixture absente")
  const shopId = await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", { networkId: root, handle: HANDLE, name: "Boutique de recette", description: "Activité de recette", ownerKind: "company", trust: "community", trustRank: 1, visibility: "network", onRoot: true, status: "active", createdByPersonId: ownerId, searchText: "boutique recette", createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId: ownerId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const id = await ctx.db.insert("shops", { networkId: root, pageId, preparedByPersonId: ownerId, model: "products", storefront: "published", visibility: "network", publicConsentAt: NOW, publicConsentTextVersion: SHOP_PUBLIC_LISTING_TEXT_VERSION, publicConsentByPersonId: ownerId, publishedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("shopCommerceLinks", { networkId: root, shopId: id, pageId, personId: ownerId, state: "active", source: "antsia", environment: "sandbox", configFingerprint: config.fingerprint, subjectRef: `antsia:sub:${"c".repeat(32)}`, antsiaShopRef: `antsia:shop:${"d".repeat(32)}`, shopRef: SHOP, linkRef: LINK, permissions: ["publish_catalog"], consentTextVersion: COMMERCE_LINK_CONSENT_VERSION, consentedAt: NOW, linkedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("shopNetworkPolicies", { networkId: root, storefront: "review", updatedAt: NOW })
    await ctx.db.insert("moderationPolicies", { networkId: root, surface: "commerceOffer", preReview: false, maxLinks: 20, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    return id
  })
  const emitterId = await owner.mutation(api.modules.federation.emitters.configure, { networkId: root, slug: "pro-saved-offers-test", environment: "sandbox", enabled: true, keyEnvName: KEY_NAME, allowedContracts: [COMMERCE_PUBLIC_CONTRACT], reason: "Émetteur fictif du catalogue dans le harnais" })
  await owner.mutation(policy, { networkId: root, enabled: true, reason: "Politique fictive de lecture du catalogue" })
  await owner.mutation(mapping, { networkId: root, shopId, emitterId, enabled: true, reason: "Mapping fictif de la boutique et du catalogue" })
  return { t, owner, ownerId, reader, readerId, root, child: testClosed, shopId, offerArgs: { networkId: root, handle: HANDLE, offerRef: OFFER } }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

function shopEvent(): CommerceShopEvent {
  return { type: "shop.published", shopRef: SHOP, linkRef: LINK, revision: 1, changedAt: NOW, commercialName: "Activité", country: "GA", currency: "XAF", sellerVerification: "unverified", capabilities: ["catalog"], collections: [] }
}
function offerEvent(): CommerceOfferEvent {
  return { type: "offer.published", shopRef: SHOP, offerRef: OFFER, revision: 1, changedAt: NOW, kind: "product", title: "Article de recette enregistré", description: "Une description publique du produit.", collectionRefs: [], tags: ["recette"], price: { mode: "fixed", currency: "XAF", amount: 12_000 }, showsAvailability: true, variants: [], variantAxes: [], media: [] }
}
async function applied(f: Fixture, payload: CommercePublicEvent) {
  const raw = commerceCanonicalJson({ contract: COMMERCE_PUBLIC_CONTRACT, eventId: `saved-offer-event-${++eventSequence}`, objectRef: commercePublicEffect(payload).objectRef, payload, version: 1 })!
  const timestamp = String(Math.floor(Date.now() / 1000))
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(federationSigningText("sandbox", timestamp, raw)))
  const signature = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("")
  const response = await f.t.fetch("/federation/inbox", { method: "POST", body: raw, headers: { "x-antsia-emitter": "pro-saved-offers-test", "x-antsia-environment": "sandbox", "x-antsia-timestamp": timestamp, "x-antsia-signature": signature } })
  expect(response.status).toBe(202)
  expect(await response.json()).toMatchObject({ status: "applied", applicationStatus: "applied" })
}
async function published(f: Fixture) { await applied(f, shopEvent()); await applied(f, offerEvent()) }
async function rows(f: Fixture) { return await f.t.run(async (ctx) => ctx.db.query("savedOffers").withIndex("by_shop_offer", (q) => q.eq("shopId", f.shopId)).collect()) }
async function refusal(work: Promise<unknown>) { try { await work; return null } catch (error) { return { code: engineErrorCode(error), app: engineErrorAppRule(error) } } }
const FIRST = { cursor: null, numItems: 12 }

describe("CM-09 — enregistrer et retirer une offre", () => {
  it("enregistre une offre visible une seule fois, la relit dans Mes favoris, puis la retire (idempotent)", async () => {
    const f = await fixture()
    await published(f)
    expect(await f.reader.query(api.modules.shops.savedOffers.isSaved, f.offerArgs)).toBe(false)
    expect(await f.reader.mutation(api.modules.shops.savedOffers.save, f.offerArgs)).toEqual({ saved: true })
    expect(await f.reader.mutation(api.modules.shops.savedOffers.save, f.offerArgs)).toEqual({ saved: true })
    expect(await rows(f)).toEqual([expect.objectContaining({ networkId: f.root, personId: f.readerId, shopId: f.shopId, offerRef: OFFER, createdAt: NOW })])
    expect(await f.reader.query(api.modules.shops.savedOffers.isSaved, f.offerArgs)).toBe(true)
    const list = await f.reader.query(api.modules.shops.savedOffers.listMine, { networkId: f.root, paginationOpts: FIRST })
    expect(list.page).toEqual([{ kind: "offer", savedAt: NOW, offer: expect.objectContaining({ offerRef: OFFER, shopHandle: HANDLE, title: "Article de recette enregistré" }) }])
    expect(await f.reader.mutation(api.modules.shops.savedOffers.remove, f.offerArgs)).toEqual({ saved: false })
    expect(await f.reader.mutation(api.modules.shops.savedOffers.remove, f.offerArgs)).toEqual({ saved: false })
    expect(await rows(f)).toEqual([])
    expect(await f.reader.query(api.modules.shops.savedOffers.isSaved, f.offerArgs)).toBe(false)
  })

  it("refuse indistinctement une offre invisible, inconnue ou une boutique inconnue, sans rien écrire", async () => {
    const f = await fixture()
    // Avant la publication du catalogue, l'offre ne se lit pas : même refus qu'une offre qui n'existe pas.
    expect(await refusal(f.reader.mutation(api.modules.shops.savedOffers.save, f.offerArgs))).toEqual({ code: "notFound", app: null })
    await published(f)
    expect(await refusal(f.reader.mutation(api.modules.shops.savedOffers.save, { ...f.offerArgs, offerRef: "pro.ga:offer:01JA00000000000000000000X0" }))).toEqual({ code: "notFound", app: null })
    expect(await refusal(f.reader.mutation(api.modules.shops.savedOffers.save, { ...f.offerArgs, handle: "boutique-inconnue" }))).toEqual({ code: "notFound", app: null })
    expect(await f.reader.query(api.modules.shops.savedOffers.isSaved, { ...f.offerArgs, handle: "boutique-inconnue" })).toBe(false)
    expect(await rows(f)).toEqual([])
  })
})

describe("CM-09 — offre retirée, vie privée, réseau et quota", () => {
  it("une offre retirée par le vendeur disparaît de Mes favoris sans rien révéler, et le nettoyage retire sa ligne", async () => {
    const f = await fixture()
    await published(f)
    await f.reader.mutation(api.modules.shops.savedOffers.save, f.offerArgs)
    await applied(f, { type: "offer.withdrawn", shopRef: SHOP, offerRef: OFFER, revision: 2, changedAt: NOW, reason: "consent_withdrawn" })
    const list = await f.reader.query(api.modules.shops.savedOffers.listMine, { networkId: f.root, paginationOpts: FIRST })
    expect(list.page).toEqual([{ kind: "unavailable", savedAt: NOW }])
    expect(JSON.stringify(list)).not.toContain("Article de recette")
    expect(JSON.stringify(list)).not.toContain(OFFER)
    // L'offre ne se lit plus : on ne peut plus l'enregistrer, mais on peut toujours retirer sa propre ligne.
    expect(await refusal(f.reader.mutation(api.modules.shops.savedOffers.save, f.offerArgs))).toEqual({ code: "notFound", app: null })
    expect(await f.reader.mutation(api.modules.shops.savedOffers.pruneUnavailable, { networkId: f.root, cursor: null })).toEqual({ removed: 1, isDone: true, continueCursor: expect.any(String) })
    expect(await rows(f)).toEqual([])
  })

  it("une vitrine retirée masque le favori sans le supprimer : il revient quand elle se lit de nouveau", async () => {
    const f = await fixture()
    await published(f)
    await f.reader.mutation(api.modules.shops.savedOffers.save, f.offerArgs)
    await f.t.run(async (ctx) => ctx.db.patch(f.shopId, { storefront: "withdrawn" }))
    expect((await f.reader.query(api.modules.shops.savedOffers.listMine, { networkId: f.root, paginationOpts: FIRST })).page).toEqual([{ kind: "unavailable", savedAt: NOW }])
    await f.t.run(async (ctx) => ctx.db.patch(f.shopId, { storefront: "published" }))
    expect((await f.reader.query(api.modules.shops.savedOffers.listMine, { networkId: f.root, paginationOpts: FIRST })).page).toEqual([expect.objectContaining({ kind: "offer" })])
  })

  it("le vendeur ne voit ni la liste ni le nombre des favoris d'autrui", async () => {
    const f = await fixture()
    await published(f)
    await f.reader.mutation(api.modules.shops.savedOffers.save, f.offerArgs)
    expect((await f.owner.query(api.modules.shops.savedOffers.listMine, { networkId: f.root, paginationOpts: FIRST })).page).toEqual([])
    expect(await f.owner.query(api.modules.shops.savedOffers.isSaved, f.offerArgs)).toBe(false)
    // L'offre publique et membre lue par le vendeur ne porte aucun compteur de favoris.
    const offer = await f.owner.query(api.modules.shops.catalog.offer, f.offerArgs)
    expect(offer).not.toBeNull()
    expect(Object.keys(offer!).filter((key) => /saved|favori|count/i.test(key))).toEqual([])
  })

  it("chaque réseau a ses favoris ; un réseau dont on n'est pas membre est refusé", async () => {
    const f = await fixture()
    await published(f)
    await f.t.run(async (ctx) => ctx.db.insert("savedOffers", { networkId: f.child, personId: f.readerId, shopId: f.shopId, offerRef: "pro.ga:offer:01JA00000000000000000000Q1", createdAt: NOW }))
    expect((await f.reader.query(api.modules.shops.savedOffers.listMine, { networkId: f.root, paginationOpts: FIRST })).page).toEqual([])
    expect((await refusal(f.reader.query(api.modules.shops.savedOffers.listMine, { networkId: f.child, paginationOpts: FIRST })))?.code).toBe("notFound")
    expect((await refusal(f.reader.mutation(api.modules.shops.savedOffers.save, { ...f.offerArgs, networkId: f.child })))?.code).toBe("notFound")
  })

  it("au plus SAVED_OFFERS_MAX favoris par personne et par réseau ; les autres réseaux ne comptent pas", async () => {
    const f = await fixture()
    await published(f)
    const fill = async (networkId: Id<"networks">) => await f.t.run(async (ctx) => {
      for (let index = 0; index < SAVED_OFFERS_MAX; index += 1) await ctx.db.insert("savedOffers", { networkId, personId: f.readerId, shopId: f.shopId, offerRef: `pro.ga:offer:01JA0000000000000000${String(index).padStart(6, "0")}`, createdAt: NOW - index - 1 })
    })
    await fill(f.child)
    expect(await f.reader.mutation(api.modules.shops.savedOffers.save, f.offerArgs)).toEqual({ saved: true })
    await f.reader.mutation(api.modules.shops.savedOffers.remove, f.offerArgs)
    await fill(f.root)
    expect(await refusal(f.reader.mutation(api.modules.shops.savedOffers.save, f.offerArgs))).toEqual({ code: "policyRefused", app: { appRule: "saved_offer_quota", appParams: { max: SAVED_OFFERS_MAX } } })
    expect(await f.reader.query(api.modules.shops.savedOffers.isSaved, f.offerArgs)).toBe(false)
    // Une page reste bornée à douze lignes relues, quelle que soit la demande.
    const page = await f.reader.query(api.modules.shops.savedOffers.listMine, { networkId: f.root, paginationOpts: { cursor: null, numItems: 500 } })
    expect(page.page).toHaveLength(12)
    expect(page.isDone).toBe(false)
  })
})

describe("CM-09 — purge et données personnelles", () => {
  it("les favoris d'une boutique défaite partent par lots bornés ; ceux d'une autre boutique demeurent", async () => {
    const f = await fixture()
    const otherShop = await f.t.run(async (ctx) => ctx.db.insert("shops", { networkId: f.root, ownerPersonId: f.ownerId, model: "products", storefront: "draft", visibility: "network", createdAt: NOW, updatedAt: NOW }))
    await f.t.run(async (ctx) => {
      for (let index = 0; index <= SAVED_OFFERS_PURGE_BATCH; index += 1) await ctx.db.insert("savedOffers", { networkId: f.root, personId: f.readerId, shopId: f.shopId, offerRef: `pro.ga:offer:01JA0000000000000000${String(index).padStart(6, "0")}`, createdAt: NOW })
      await ctx.db.insert("savedOffers", { networkId: f.root, personId: f.readerId, shopId: otherShop, offerRef: OFFER, createdAt: NOW })
      await ctx.db.delete(f.shopId)
      await purgeSavedOffersForShop(ctx, f.shopId)
    })
    expect(await rows(f)).toHaveLength(1)
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await rows(f)).toEqual([])
    expect(await f.t.run(async (ctx) => ctx.db.query("savedOffers").withIndex("by_shop_offer", (q) => q.eq("shopId", otherShop)).collect())).toHaveLength(1)
  })

  it("défaire la boutique par son chemin existant (`discardShop`) emporte ses favoris", async () => {
    const f = await fixture()
    await published(f)
    await f.reader.mutation(api.modules.shops.savedOffers.save, f.offerArgs)
    await f.t.run(async (ctx) => ctx.db.patch(f.shopId, { storefront: "withdrawn" }))
    expect(await f.owner.mutation(api.modules.shops.shops.discardShop, { networkId: f.root, shopId: f.shopId })).toEqual({ discarded: true })
    expect(await rows(f)).toEqual([])
    expect((await f.reader.query(api.modules.shops.savedOffers.listMine, { networkId: f.root, paginationOpts: FIRST })).page).toEqual([])
  })

  it("une boutique encore présente ne perd jamais ses favoris par la purge planifiée", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => ctx.db.insert("savedOffers", { networkId: f.root, personId: f.readerId, shopId: f.shopId, offerRef: OFFER, createdAt: NOW }))
    await f.t.mutation(internal.modules.shops.savedOffers.purgeForShop, { shopId: f.shopId })
    expect(await rows(f)).toHaveLength(1)
  })

  it("export à la seule personne, références seules ; effacement par la personne", () => {
    const row = { _id: "row", _creationTime: 1, networkId: "network", personId: "person", shopId: "shop", offerRef: OFFER, createdAt: 2 }
    expect(exportableRecord("savedOffers", row, "person")).toEqual({ _id: "row", _creationTime: 1, networkId: "network", createdAt: 2, shopId: "shop", offerRef: OFFER })
    expect(exportableRecord("savedOffers", row, "other")).toBeNull()
    expect(directlyOwned("savedOffers", row, "person")).toBe(true)
    expect(directlyOwned("savedOffers", row, "other")).toBe(false)
  })
})
