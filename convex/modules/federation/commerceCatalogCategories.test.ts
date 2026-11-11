// @vitest-environment edge-runtime
/**
 * CM-02 — catégories interdites et réglementées, éprouvées par la vraie admission signée de l'inbox.
 *
 * La liste en vigueur est VIDE (à fixer par le propriétaire et un conseil). Ce test lui substitue une liste
 * d'ESSAI (`rules`, des clés prises au hasard, pas une proposition) et prouve qu'une entrée ajoutée est refusée
 * partout où il faut : reflet, index de la marketplace, vitrine, fiche, lettre morte sans corps, audit, console,
 * motif du gérant ; et qu'une catégorie réglementée fait passer la vitrine sous la politique `review`.
 */
import { COMMERCE_LINK_CONSENT_VERSION } from "@antsia/social-domain/commerce-link"
import type { CommerceCatalogCategoryKey, CommerceCatalogFacets } from "@antsia/social-domain/commerce/catalogFacets"
import { commerceCanonicalJson, COMMERCE_PUBLIC_CONTRACT_V2 } from "@antsia/social-domain/commerce/primitives"
import { commercePublicEffect, type CommercePublicEvent, type CommerceOfferEvent, type CommerceShopEvent } from "@antsia/social-domain/commerce/projection"
import { federationSigningText } from "@antsia/social-domain/federationProtocol"
import { makeFunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, testConvex } from "../../test.setup"
import { COMMERCE_ACTIVATION_DECISIONS } from "../shops/commerceActivation"
import { readCommerceLinkConfig } from "../shops/commerceLinkConfig"
import { storefrontPublicationOutcome } from "../shops/decisions"
import { SHOP_PUBLIC_LISTING_TEXT_VERSION } from "../shops/rules"
import { federationBodyDigest } from "./signature"

/** Liste d'essai substituée à la liste en vigueur (mutable d'un test à l'autre). */
const rules = vi.hoisted(() => ({ version: 99, decision: "liste-d-essai-du-test" as string | null, entries: [] as Array<{ key: CommerceCatalogCategoryKey; rule: "prohibited" | "regulated" }> }))
vi.mock("@antsia/social-domain/commerce-prohibited-categories", async (importOriginal) => {
  const original = await importOriginal<typeof import("@antsia/social-domain/commerce-prohibited-categories")>()
  return { ...original, COMMERCE_CATEGORY_RULES: rules }
})
/** L'admission d'office (fermée en vrai, DP-05) n'est ouverte que pour éprouver la file des vitrines réglementées. */
const activation = vi.hoisted(() => ({ automatic: false }))
vi.mock("../shops/commerceActivation", async (importOriginal) => {
  const original = await importOriginal<typeof import("../shops/commerceActivation")>()
  return { ...original, commerceActivationReady: (capability: Parameters<typeof original.commerceActivationReady>[0]) => capability === "storefrontAutomatic" ? activation.automatic : original.commerceActivationReady(capability) }
})

const NOW = Date.UTC(2026, 10, 11, 12)
const SHOP = "pro.ga:structure:01JA00000000000000000000S2"
const OFFER = "pro.ga:offer:01JA00000000000000000000P2"
const LINK = "pro.ga:commerce_link:01JA00000000000000000000K2"
const UNMAPPED_SHOP = "pro.ga:structure:01JA00000000000000000000S9"
const EMITTER = "pro-categories-fixture"
const KEY_NAME = "ANTSIA_FEDERATION_CATEGORIES_TEST_KEY"
const KEY = "categories-fixture-sandbox-not-secret-0123456789"
const HANDLE = "categories-test-shop"
const policy = makeFunctionReference<"mutation", { networkId: Id<"networks">; enabled: boolean; reason: string }, null>("modules/shops/catalogControl:setPolicy")
const mapping = makeFunctionReference<"mutation", { networkId: Id<"networks">; shopId: Id<"shops">; emitterId: Id<"federationEmitters">; enabled: boolean; reason: string }, null>("modules/shops/catalogControl:configureMapping")

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW)
  rules.entries = []; activation.automatic = false
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.stubEnv("FEDERATION_ENVIRONMENT", "sandbox")
  vi.stubEnv(KEY_NAME, KEY)
  vi.stubEnv("FILE_GUARD", "off")
  vi.stubEnv("ANTSIA_COMMERCE_ENVIRONMENT", "sandbox")
  vi.stubEnv("ANTSIA_COMMERCE_SOURCE", "antsia")
  vi.stubEnv("ANTSIA_COMMERCE_PRO_HTTP_ORIGIN", "http://localhost:4010")
  vi.stubEnv("ANTSIA_COMMERCE_PRO_APP_ORIGIN", "http://localhost:4011")
  vi.stubEnv("ANTSIA_COMMERCE_ORIGIN", "http://localhost:3030")
  vi.stubEnv("ANTSIA_COMMERCE_KEY_ID", "categories-fixture")
  vi.stubEnv("ANTSIA_COMMERCE_SIGNING_KEY", KEY)
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const as = t.withIdentity({ subject: "categories-owner-fixture" })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle: "categories-owner", displayName: "Recette catégories" })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  await t.run(ctx => ctx.db.insert("operators", { personId, role: "platform_admin", grantedAt: NOW }))
  await createTestOperatorProof(t, as, personId)
  const config = await readCommerceLinkConfig()
  if (!config) throw new Error("Configuration de fixture absente")
  const shopId = await t.run(async ctx => {
    const pageId = await ctx.db.insert("pages", { networkId: root, handle: HANDLE, name: "Boutique de recette", description: "Une boutique fictive pour éprouver les catégories.", ownerKind: "company", trust: "community", trustRank: 1, visibility: "network", onRoot: true, status: "active", createdByPersonId: personId, searchText: "boutique recette", createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const id = await ctx.db.insert("shops", { networkId: root, pageId, preparedByPersonId: personId, model: "products", storefront: "published", visibility: "network", publicConsentAt: NOW, publicConsentTextVersion: SHOP_PUBLIC_LISTING_TEXT_VERSION, publicConsentByPersonId: personId, publishedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("shopCommerceLinks", { networkId: root, shopId: id, pageId, personId, state: "active", source: "antsia", environment: "sandbox", configFingerprint: config.fingerprint, subjectRef: `antsia:sub:${"c".repeat(32)}`, antsiaShopRef: `antsia:shop:${"d".repeat(32)}`, shopRef: SHOP, linkRef: LINK, permissions: ["publish_catalog"], consentTextVersion: COMMERCE_LINK_CONSENT_VERSION, consentedAt: NOW, linkedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("shopNetworkPolicies", { networkId: root, storefront: "review", updatedAt: NOW })
    await ctx.db.insert("moderationPolicies", { networkId: root, surface: "commerceOffer", preReview: false, maxLinks: 20, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    await ctx.db.insert("commerceCatalogIndexes", { networkId: root, version: 2, generation: 1, status: "ready", updatedAt: NOW })
    return id
  })
  const emitterId = await as.mutation(api.modules.federation.emitters.configure, { networkId: root, slug: EMITTER, environment: "sandbox", enabled: true, keyEnvName: KEY_NAME, allowedContracts: [COMMERCE_PUBLIC_CONTRACT_V2], reason: "Émetteur fictif V2 pour éprouver les catégories" })
  await as.mutation(policy, { networkId: root, enabled: true, reason: "Lecture du catalogue de recette dans le harnais" })
  await as.mutation(mapping, { networkId: root, shopId, emitterId, enabled: true, reason: "Rattachement explicite de la boutique de recette" })
  const f = { t, as, root, personId, emitterId, shopId }
  const parent: CommerceShopEvent = { type: "shop.published", shopRef: SHOP, linkRef: LINK, revision: 1, changedAt: NOW, commercialName: "Boutique de recette", country: "GA", currency: "XAF", sellerVerification: "unverified", capabilities: ["catalog"], collections: [] }
  expect(await (await deliver(f, parent, "categories-parent-001")).response.json()).toMatchObject({ status: "applied" })
  return f
}
type Fixture = { t: ReturnType<typeof testConvex>; as: ReturnType<ReturnType<typeof testConvex>["withIdentity"]>; root: Id<"networks">; personId: Id<"persons">; emitterId: Id<"federationEmitters">; shopId: Id<"shops"> }

async function deliver(f: Pick<Fixture, "t">, payload: CommercePublicEvent, eventId: string) {
  const raw = commerceCanonicalJson({ contract: COMMERCE_PUBLIC_CONTRACT_V2, version: 1, eventId, objectRef: commercePublicEffect(payload).objectRef, payload })!
  const timestamp = String(Math.floor(NOW / 1000))
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(federationSigningText("sandbox", timestamp, raw)))
  const signature = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("")
  const response = await f.t.fetch("/federation/inbox", { method: "POST", body: raw, headers: { "Content-Type": "application/json", "x-antsia-emitter": EMITTER, "x-antsia-environment": "sandbox", "x-antsia-timestamp": timestamp, "x-antsia-signature": signature } })
  return { response, raw }
}

const PHONES: CommerceCatalogFacets["categoryPath"] = ["electronics", "electronics.phones"]
const COMPUTERS: CommerceCatalogFacets["categoryPath"] = ["electronics", "electronics.computers"]
const CLOTHING: CommerceCatalogFacets["categoryPath"] = ["fashion", "fashion.women", "fashion.women.clothing"]
function offer(revision: number, categoryPath: CommerceCatalogFacets["categoryPath"], shopRef = SHOP): CommerceOfferEvent {
  return { type: revision === 1 ? "offer.published" : "offer.updated", shopRef, offerRef: OFFER, revision, changedAt: NOW + revision, kind: "product", title: "Objet de recette au titre distinctif", description: "Description de recette qui ne doit survivre à aucun refus.", tags: [], price: { mode: "fixed", currency: "XAF", amount: 15_000 }, showsAvailability: false, collectionRefs: [], variants: [], variantAxes: [], media: [], facets: { taxonomyVersion: 1, categoryPath, attributes: [] } }
}

/** Ce qu'un membre lit de l'offre : marketplace, vitrine (catalogue) et fiche. */
async function visible(f: Fixture) {
  const [search, list, sheet] = await Promise.all([
    f.as.query(api.modules.shops.marketplace.search, { networkId: f.root, paginationOpts: { cursor: null, numItems: 24 } }),
    f.as.query(api.modules.shops.catalog.list, { networkId: f.root, handle: HANDLE, paginationOpts: { cursor: null, numItems: 12 } }),
    f.as.query(api.modules.shops.catalog.offer, { networkId: f.root, handle: HANDLE, offerRef: OFFER }),
  ])
  return { search: search.page.some(item => item.offerRef === OFFER), list: list.page.some(item => item.offerRef === OFFER), sheet: sheet !== null }
}
const SEEN = { search: true, list: true, sheet: true }, HIDDEN = { search: false, list: false, sheet: false }

async function stored(f: Fixture, eventId: string) {
  return await f.t.run(async ctx => {
    const receipt = await ctx.db.query("federationInboxReceipts").withIndex("by_emitter_environment_event", q => q.eq("emitterId", f.emitterId).eq("environment", "sandbox").eq("eventId", eventId)).unique()
    return {
      receipt,
      head: await ctx.db.query("commerceCatalogHeads").withIndex("by_emitter_object_sequence", q => q.eq("emitterId", f.emitterId).eq("objectRef", OFFER).eq("sequence", "catalog")).unique(),
      deadLetter: receipt ? await ctx.db.query("federationDeadLetters").withIndex("by_receipt", q => q.eq("receiptId", receipt._id)).unique() : null,
      ruling: await ctx.db.query("commerceCatalogCategoryRulings").withIndex("by_emitter_object", q => q.eq("emitterId", f.emitterId).eq("objectRef", OFFER)).unique(),
      audits: (await ctx.db.query("engineAudit").take(200)).filter(row => row.action === "moderation.content_review" && row.capacity === "system"),
    }
  })
}

describe("CM-02 — liste vide (la liste en vigueur)", () => {
  it("ne refuse rien : l'offre est reflétée et lue partout, sans décision consignée", async () => {
    const f = await fixture()
    const { response } = await deliver(f, offer(1, PHONES), "categories-offer-001")
    expect(await response.json()).toMatchObject({ status: "applied" })
    const state = await stored(f, "categories-offer-001")
    expect(state.head).toMatchObject({ state: "active", discoveryVersion: 2, category2: "electronics.phones" })
    expect(state.ruling).toBeNull()
    expect(state.audits).toEqual([])
    expect(await visible(f)).toEqual(SEEN)
  })
})

describe("CM-02 — une entrée interdite ajoutée à la liste est refusée partout", () => {
  it("refuse la nouvelle offre au reflet : ni tête ni index ni vitrine ; lettre morte sans corps, close ; refus consigné et audité", async () => {
    const f = await fixture()
    rules.entries = [{ key: "electronics.phones", rule: "prohibited" }]
    const { response, raw } = await deliver(f, offer(1, PHONES), "categories-offer-001")
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ outcome: "accepted", status: "dead_letter", applicationStatus: "rejected", eventId: "categories-offer-001", bodySha256: await federationBodyDigest(raw) })
    const state = await stored(f, "categories-offer-001")
    expect(state.head).toBeNull()
    expect(state.receipt).toMatchObject({ status: "dead_letter" })
    expect(state.deadLetter).toMatchObject({ reason: "prohibited_category", rawBody: "", status: "resolved", objectRef: OFFER, bodySha256: await federationBodyDigest(raw) })
    expect(state.ruling).toMatchObject({ shopId: f.shopId, rule: "prohibited", categoryKey: "electronics.phones", listVersion: 99, revision: 1, withdrewReflection: false })
    expect(state.audits).toHaveLength(1)
    expect(state.audits[0]).toMatchObject({ networkId: f.root, subjectTable: "shops", subjectId: f.shopId, details: { approve: false, surface: "commerceOffer", rule: "prohibited", categoryKey: "electronics.phones", listVersion: 99, offerRef: OFFER, revision: 1, withdrew: false } })
    // Aucun contenu de l'offre n'a survécu au refus : ni dans la lettre morte, ni dans la ligne consignée, ni dans l'audit.
    const everything = JSON.stringify([state.deadLetter, state.ruling, state.audits])
    expect(everything).not.toContain("titre distinctif")
    expect(everything).not.toContain("ne doit survivre")
    expect(await visible(f)).toEqual(HIDDEN)
    // Le gérant lit le motif ; la console lit le refus.
    expect(await f.as.query(api.modules.shops.catalogControl.categoryRulings, { networkId: f.root, shopId: f.shopId })).toEqual({
      listVersion: 99, truncated: false, regulatedCategory: null,
      refusals: [{ offerRef: OFFER, categoryKey: "electronics.phones", listVersion: 99, revision: 1, withdrewReflection: false, refusedAt: NOW }],
    })
    const consoleView = await f.as.query(api.modules.shops.catalogControl.paginateCategoryRulings, { networkId: f.root, paginationOpts: { cursor: null, numItems: 20 } })
    expect(consoleView.page).toEqual([expect.objectContaining({ shopId: f.shopId, shopName: "Boutique de recette", shopHandle: HANDLE, offerRef: OFFER, rule: "prohibited", categoryKey: "electronics.phones", listVersion: 99 })])
    // Rien à rejouer : le corps n'existe plus, le rejeu est refusé sans rien appliquer.
    await expect(f.as.mutation(api.modules.federation.replay.replay, { deadLetterId: state.deadLetter!._id, reason: "Rejeu demandé pour la recette des catégories" })).rejects.toThrow()
    expect((await stored(f, "categories-offer-001")).head).toBeNull()
  })

  it("couvre les descendantes : interdire le rayon électronique refuse un téléphone", async () => {
    const f = await fixture()
    rules.entries = [{ key: "electronics", rule: "prohibited" }]
    expect(await (await deliver(f, offer(1, PHONES), "categories-offer-001")).response.json()).toMatchObject({ status: "dead_letter" })
    expect((await stored(f, "categories-offer-001")).ruling).toMatchObject({ categoryKey: "electronics" })
    expect(await visible(f)).toEqual(HIDDEN)
  })

  it("ne garde aucun corps même quand l'offre interdite est refusée pour un autre motif (boutique non rattachée)", async () => {
    const f = await fixture()
    rules.entries = [{ key: "electronics.phones", rule: "prohibited" }]
    await deliver(f, offer(1, PHONES, UNMAPPED_SHOP), "categories-unmapped-001")
    const state = await stored(f, "categories-unmapped-001")
    expect(state.deadLetter).toMatchObject({ reason: "prohibited_category", rawBody: "", status: "resolved" })
    expect(state.ruling).toBeNull()
  })

  it("sort de l'index et de la vitrine une offre déjà reflétée qui passe dans une catégorie interdite, et la rétablit sur une révision admise", async () => {
    const f = await fixture()
    await deliver(f, offer(1, PHONES), "categories-offer-001")
    expect(await visible(f)).toEqual(SEEN)
    rules.entries = [{ key: "electronics.phones", rule: "prohibited" }]
    expect(await (await deliver(f, offer(2, PHONES), "categories-offer-002")).response.json()).toMatchObject({ status: "dead_letter" })
    const refused = await stored(f, "categories-offer-002")
    expect(refused.head).toMatchObject({ state: "withdrawn", revision: 1 })
    expect(refused.head?.discoveryVersion).toBeUndefined()
    expect(refused.head?.localIndexVersion).toBeUndefined()
    expect(refused.head?.searchText).toBe("")
    expect(refused.ruling).toMatchObject({ rule: "prohibited", revision: 2, withdrewReflection: true })
    expect(refused.audits.at(-1)).toMatchObject({ details: { withdrew: true, revision: 2 } })
    expect(await visible(f)).toEqual(HIDDEN)
    // Un ancien instantané admis ne ressuscite pas l'offre retirée.
    await deliver(f, offer(1, PHONES), "categories-offer-001-bis")
    expect((await stored(f, "categories-offer-001-bis")).head).toMatchObject({ state: "withdrawn" })
    // Une révision suivante dans une catégorie admise la rétablit et clôt le refus.
    expect(await (await deliver(f, offer(3, COMPUTERS), "categories-offer-003")).response.json()).toMatchObject({ status: "applied" })
    const restored = await stored(f, "categories-offer-003")
    expect(restored.head).toMatchObject({ state: "active", revision: 3, category2: "electronics.computers", discoveryVersion: 2 })
    expect(restored.ruling).toBeNull()
    expect(await visible(f)).toEqual(SEEN)
  })

  it("laisse sans effet un instantané interdit plus ancien que la tête", async () => {
    const f = await fixture()
    await deliver(f, offer(1, COMPUTERS), "categories-offer-001")
    await deliver(f, offer(2, COMPUTERS), "categories-offer-002")
    rules.entries = [{ key: "electronics.phones", rule: "prohibited" }]
    expect(await (await deliver(f, offer(1, PHONES), "categories-offer-stale")).response.json()).toMatchObject({ status: "applied" })
    const state = await stored(f, "categories-offer-stale")
    expect(state.head).toMatchObject({ state: "active", revision: 2 })
    expect(state.ruling).toBeNull()
    expect(await visible(f)).toEqual(SEEN)
  })

  it("écarte à la lecture une tête reflétée avant que la liste ne l'interdise, sans attendre d'événement", async () => {
    const f = await fixture()
    await deliver(f, offer(1, PHONES), "categories-offer-001")
    expect(await visible(f)).toEqual(SEEN)
    rules.entries = [{ key: "electronics.phones", rule: "prohibited" }]
    expect(await visible(f)).toEqual(HIDDEN)
    expect((await stored(f, "categories-offer-001")).head).toMatchObject({ state: "active" })
    rules.entries = []
    expect(await visible(f)).toEqual(SEEN)
  })
})

describe("CM-02 — une entrée réglementée fait passer la vitrine sous la politique review", () => {
  it("reflète l'offre, consigne sa catégorie et met en file la demande de publication, même en admission d'office", async () => {
    const f = await fixture()
    activation.automatic = true
    await f.t.run(async ctx => {
      const row = await ctx.db.query("shopNetworkPolicies").withIndex("by_network", q => q.eq("networkId", f.root)).unique()
      await ctx.db.patch(row!._id, { storefront: "auto_verified", automaticDecisionVersion: COMMERCE_ACTIVATION_DECISIONS.storefrontAutomatic.reference })
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", f.root).eq("personId", f.personId)).unique()
      await ctx.db.patch(membership!._id, { status: "verifiee" })
    })
    const outcome = async () => await f.t.run(async ctx => (await storefrontPublicationOutcome(ctx, (await ctx.db.get(f.shopId))!, f.personId)))
    await deliver(f, offer(1, PHONES), "categories-offer-001")
    expect(await outcome()).toEqual({ policy: "auto_verified", outcome: "admit", regulatedCategory: null })

    rules.entries = [{ key: "electronics", rule: "regulated" }]
    expect(await (await deliver(f, offer(2, PHONES), "categories-offer-002")).response.json()).toMatchObject({ status: "applied" })
    const state = await stored(f, "categories-offer-002")
    expect(state.head).toMatchObject({ state: "active", revision: 2 })
    expect(state.ruling).toMatchObject({ rule: "regulated", categoryKey: "electronics", revision: 2, withdrewReflection: false })
    expect(state.audits).toEqual([])
    expect(await visible(f)).toEqual(SEEN)
    expect(await outcome()).toEqual({ policy: "auto_verified", outcome: "queue", regulatedCategory: "electronics" })
    expect(await f.as.query(api.modules.shops.catalogControl.categoryRulings, { networkId: f.root, shopId: f.shopId })).toMatchObject({ refusals: [], regulatedCategory: "electronics" })
    // La demande réelle d'une vitrine retirée passe par la file des opérateurs, pas par l'admission d'office.
    await f.t.run(ctx => ctx.db.patch(f.shopId, { storefront: "withdrawn" }))
    expect(await f.as.mutation(api.modules.shops.shops.requestStorefrontPublication, { networkId: f.root, shopId: f.shopId })).toEqual({ storefront: "pending_review" })

    // Une révision hors liste efface la ligne : l'admission d'office redevient possible.
    await deliver(f, offer(3, CLOTHING), "categories-offer-003")
    expect((await stored(f, "categories-offer-003")).ruling).toBeNull()
    expect(await outcome()).toEqual({ policy: "auto_verified", outcome: "admit", regulatedCategory: null })
  })
})
