// @vitest-environment edge-runtime
/** SU06 : réception signée V2 dans le harnais, distincte d'un reflet présent sur le serveur actif. */
import { COMMERCE_LINK_CONSENT_VERSION } from "@antsia/social-domain/commerce-link"
import type { CommerceCatalogFacets } from "@antsia/social-domain/commerce/catalogFacets"
import { commerceCanonicalJson, COMMERCE_PUBLIC_CONTRACT_V2 } from "@antsia/social-domain/commerce/primitives"
import { commercePublicEffect, type CommercePublicEvent, type CommerceOfferEvent, type CommerceShopEvent } from "@antsia/social-domain/commerce/projection"
import { federationSigningText } from "@antsia/social-domain/federationProtocol"
import { makeFunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, testConvex } from "../../test.setup"
import { readCommerceLinkConfig } from "../shops/commerceLinkConfig"
import { SHOP_PUBLIC_LISTING_TEXT_VERSION } from "../shops/rules"
import { federationBodyDigest } from "./signature"

const NOW = Date.UTC(2026, 9, 24, 12)
const SHOP = "pro.ga:structure:01JA00000000000000000000S1"
const OFFER = "pro.ga:offer:01JA00000000000000000000P1"
const LINK = "pro.ga:commerce_link:01JA00000000000000000000K1"
const EMITTER = "pro-food-fixture"
const KEY_NAME = "ANTSIA_FEDERATION_FOOD_TEST_KEY"
const KEY = "food-fixture-sandbox-not-secret-0123456789"
const policy = makeFunctionReference<"mutation", { networkId: Id<"networks">; enabled: boolean; reason: string }, null>("modules/shops/catalogControl:setPolicy")
const mapping = makeFunctionReference<"mutation", { networkId: Id<"networks">; shopId: Id<"shops">; emitterId: Id<"federationEmitters">; enabled: boolean; reason: string }, null>("modules/shops/catalogControl:configureMapping")

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW)
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.stubEnv("FEDERATION_ENVIRONMENT", "sandbox")
  vi.stubEnv(KEY_NAME, KEY)
  vi.stubEnv("ANTSIA_COMMERCE_ENVIRONMENT", "sandbox")
  vi.stubEnv("ANTSIA_COMMERCE_SOURCE", "antsia")
  vi.stubEnv("ANTSIA_COMMERCE_PRO_HTTP_ORIGIN", "http://localhost:4010")
  vi.stubEnv("ANTSIA_COMMERCE_PRO_APP_ORIGIN", "http://localhost:4011")
  vi.stubEnv("ANTSIA_COMMERCE_ORIGIN", "http://localhost:3030")
  vi.stubEnv("ANTSIA_COMMERCE_KEY_ID", "food-catalogue-fixture")
  vi.stubEnv("ANTSIA_COMMERCE_SIGNING_KEY", KEY)
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const as = t.withIdentity({ subject: "food-catalogue-owner-fixture" })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle: "food-catalogue-owner", displayName: "Recette alimentaire" })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  await t.run(ctx => ctx.db.insert("operators", { personId, role: "platform_admin", grantedAt: NOW }))
  await createTestOperatorProof(t, as, personId)
  const config = await readCommerceLinkConfig()
  if (!config) throw new Error("Configuration de fixture absente")
  const shopId = await t.run(async ctx => {
    const pageId = await ctx.db.insert("pages", { networkId: root, handle: "food-catalogue-test", name: "Épicerie de recette", ownerKind: "company", trust: "community", trustRank: 1, visibility: "network", onRoot: true, status: "active", createdByPersonId: personId, searchText: "epicerie recette", createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const id = await ctx.db.insert("shops", { networkId: root, pageId, preparedByPersonId: personId, model: "products", storefront: "published", visibility: "network", publicConsentAt: NOW, publicConsentTextVersion: SHOP_PUBLIC_LISTING_TEXT_VERSION, publicConsentByPersonId: personId, publishedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("shopCommerceLinks", { networkId: root, shopId: id, pageId, personId, state: "active", source: "antsia", environment: "sandbox", configFingerprint: config.fingerprint, subjectRef: `antsia:sub:${"a".repeat(32)}`, antsiaShopRef: `antsia:shop:${"b".repeat(32)}`, shopRef: SHOP, linkRef: LINK, permissions: ["publish_catalog"], consentTextVersion: COMMERCE_LINK_CONSENT_VERSION, consentedAt: NOW, linkedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("shopNetworkPolicies", { networkId: root, storefront: "review", updatedAt: NOW })
    await ctx.db.insert("moderationPolicies", { networkId: root, surface: "commerceOffer", preReview: false, maxLinks: 20, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    return id
  })
  const emitterId = await as.mutation(api.modules.federation.emitters.configure, { networkId: root, slug: EMITTER, environment: "sandbox", enabled: true, keyEnvName: KEY_NAME, allowedContracts: [COMMERCE_PUBLIC_CONTRACT_V2], reason: "Émetteur fictif V2 pour la réception alimentaire" })
  await as.mutation(policy, { networkId: root, enabled: true, reason: "Lecture du catalogue alimentaire dans le harnais" })
  await as.mutation(mapping, { networkId: root, shopId, emitterId, enabled: true, reason: "Mapping explicite de l'épicerie de recette" })
  return { t, root, emitterId, shopId }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

async function deliver(f: Fixture, payload: CommercePublicEvent, eventId: string) {
  const raw = commerceCanonicalJson({ contract: COMMERCE_PUBLIC_CONTRACT_V2, version: 1, eventId, objectRef: commercePublicEffect(payload).objectRef, payload })!
  const timestamp = String(Math.floor(NOW / 1000))
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(federationSigningText("sandbox", timestamp, raw)))
  const signature = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("")
  const response = await f.t.fetch("/federation/inbox", { method: "POST", body: raw, headers: { "Content-Type": "application/json", "x-antsia-emitter": EMITTER, "x-antsia-environment": "sandbox", "x-antsia-timestamp": timestamp, "x-antsia-signature": signature } })
  return { response, raw }
}

const FOOD_PATHS: readonly CommerceCatalogFacets["categoryPath"][] = [["food"], ["food", "food.groceries"], ["food", "food.beverages"], ["food", "food.prepared"]]

describe("SU06 — enveloppes alimentaires reçues par la vraie admission du harnais", () => {
  it.each(FOOD_PATHS.map(categoryPath => ({ categoryPath })))("indexe le chemin $categoryPath après signature, admission et reçu appliqué", async ({ categoryPath }) => {
    const f = await fixture()
    const parent: CommerceShopEvent = { type: "shop.published", shopRef: SHOP, linkRef: LINK, revision: 1, changedAt: NOW, commercialName: "Épicerie de recette", country: "GA", currency: "XAF", sellerVerification: "unverified", capabilities: ["catalog"], collections: [] }
    const parentDelivery = await deliver(f, parent, "food-parent-event-001")
    expect(parentDelivery.response.status).toBe(202)
    expect(await parentDelivery.response.json()).toMatchObject({ status: "applied", applicationStatus: "applied" })
    const payload: CommerceOfferEvent = { type: "offer.published", shopRef: SHOP, offerRef: OFFER, revision: 1, changedAt: NOW, kind: "product", title: "Produit déclaré par son émetteur", description: "Le classement est fourni par la version publiée.", tags: [], price: { mode: "fixed", currency: "XAF", amount: 2_500 }, showsAvailability: false, collectionRefs: [], variants: [], variantAxes: [], media: [], facets: { taxonomyVersion: 1, categoryPath, attributes: [] } }
    const { response, raw } = await deliver(f, payload, "food-offer-event-001")
    const bodySha256 = await federationBodyDigest(raw)
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ outcome: "accepted", status: "applied", applicationStatus: "applied", eventId: "food-offer-event-001", bodySha256 })
    const stored = await f.t.run(async ctx => ({
      head: await ctx.db.query("commerceCatalogHeads").withIndex("by_emitter_object_sequence", q => q.eq("emitterId", f.emitterId).eq("objectRef", OFFER).eq("sequence", "catalog")).unique(),
      receipt: await ctx.db.query("federationInboxReceipts").withIndex("by_emitter_environment_event", q => q.eq("emitterId", f.emitterId).eq("environment", "sandbox").eq("eventId", "food-offer-event-001")).unique(),
    }))
    expect(stored.head).toMatchObject({ networkId: f.root, shopId: f.shopId, emitterId: f.emitterId, state: "active", kind: "product", discoveryVersion: 2, localIndexVersion: 2, category1: "food", body: raw })
    expect(stored.head?.category2).toBe(categoryPath[1])
    expect(stored.head?.category3).toBeUndefined()
    expect(stored.head?.digest).toBe(await federationBodyDigest(commerceCanonicalJson(payload)!))
    expect(stored.receipt).toMatchObject({ emitterId: f.emitterId, status: "applied", contract: COMMERCE_PUBLIC_CONTRACT_V2, eventId: "food-offer-event-001", bodySha256 })
    // Aucun head n'est semé par cette fixture : le reçu appliqué accompagne celui créé par l'inbox.
    expect(await f.t.run(ctx => ctx.db.query("commerceCatalogHeads").take(3))).toHaveLength(2)
  })
})
