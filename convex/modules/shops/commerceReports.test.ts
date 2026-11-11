// @vitest-environment edge-runtime
/**
 * UM-03 (plan 09) et volet commerce de MC-01 (plan 08) — signaler une offre, les conditions d'une vitrine et
 * une offre d'emploi d'AUTRUI, par la vraie admission signée de l'inbox (catalogue PUBLIC-V2 et JOBS-V1).
 *
 * Prouve : la fiche membre rend la cible du signalement à autrui seulement (ni au gérant, ni à un membre de
 * son équipe), jamais dans une projection publique ; le gérant et son équipe ne se signalent pas ; autrui
 * signale avec accusé de réception, le second envoi est idempotent ; les motifs de l'emploi ne valent que pour
 * un poste, sans délai réglementé ; un contenu retiré ou invisible se refuse comme un inconnu ; une offre d'une
 * catégorie interdite par CM-02 (liste d'ESSAI substituée à la liste en vigueur, vide) reste introuvable.
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { COMMERCE_JOBS_CONTRACT, type CommerceJobsClosed, type CommerceJobsPublished } from "@antsia/social-domain/commerce-jobs"
import { COMMERCE_LINK_CONSENT_VERSION } from "@antsia/social-domain/commerce-link"
import type { CommerceCatalogCategoryKey, CommerceCatalogFacets } from "@antsia/social-domain/commerce/catalogFacets"
import { COMMERCE_PUBLIC_CONTRACT_V2, commerceCanonicalJson } from "@antsia/social-domain/commerce/primitives"
import { commercePublicEffect, type CommerceOfferEvent, type CommercePublicEvent, type CommerceShopEvent } from "@antsia/social-domain/commerce/projection"
import type { CommerceStorefrontTerms } from "@antsia/social-domain/commerce/storefrontTerms"
import { federationSigningText } from "@antsia/social-domain/federationProtocol"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, testConvex } from "../../test.setup"
import { readCommerceLinkConfig } from "./commerceLinkConfig"
import { SHOP_PUBLIC_LISTING_TEXT_VERSION } from "./rules"

/** Liste d'essai substituée à la liste en vigueur (vide) : des clés prises pour le test, pas une proposition. */
const rules = vi.hoisted(() => ({ version: 99, decision: "liste-d-essai-du-test" as string | null, entries: [] as Array<{ key: CommerceCatalogCategoryKey; rule: "prohibited" | "regulated" }> }))
vi.mock("@antsia/social-domain/commerce-prohibited-categories", async (importOriginal) => {
  const original = await importOriginal<typeof import("@antsia/social-domain/commerce-prohibited-categories")>()
  return { ...original, COMMERCE_CATEGORY_RULES: rules }
})

const NOW = Date.UTC(2026, 10, 11, 12)
const SHOP = "pro.ga:structure:01JA00000000000000000000S1", LINK = "pro.ga:commerce_link:01JA00000000000000000000K1"
const OFFER = "pro.ga:offer:01JA00000000000000000000P1", JOB = "pro.ga:job_opening:01JA00000000000000000000J1"
const KEY_NAME = "ANTSIA_FEDERATION_UM03_TEST_KEY", KEY = "signalement-commerce-test-key-sandbox-0123456789"
const HANDLE = "boutique-um03"
let eventSequence = 0

const FACETS: CommerceCatalogFacets = { taxonomyVersion: 1, categoryPath: ["fashion", "fashion.women", "fashion.women.clothing"], attributes: [{ key: "material", type: "text", value: "Lin" }] }
const TERMS: CommerceStorefrontTerms = { version: 1, publishedAt: NOW, delivery: { country: "GA", localities: ["Libreville"], label: "Livraison locale", fee: { amount: 1500, currency: "XAF" } }, returns: { summary: "Contactez la boutique avant tout retour." } }

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW); eventSequence = 0
  rules.entries = []
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.stubEnv("FEDERATION_ENVIRONMENT", "sandbox")
  vi.stubEnv(KEY_NAME, KEY)
  vi.stubEnv("ANTSIA_COMMERCE_ENVIRONMENT", "sandbox")
  vi.stubEnv("ANTSIA_COMMERCE_SOURCE", "antsia")
  vi.stubEnv("ANTSIA_COMMERCE_PRO_HTTP_ORIGIN", "http://localhost:4010")
  vi.stubEnv("ANTSIA_COMMERCE_PRO_APP_ORIGIN", "http://localhost:4011")
  vi.stubEnv("ANTSIA_COMMERCE_ORIGIN", "http://localhost:3030")
  vi.stubEnv("ANTSIA_COMMERCE_KEY_ID", "antsia-um03-test")
  vi.stubEnv("ANTSIA_COMMERCE_SIGNING_KEY", KEY)
  vi.stubEnv("ANTSIA_CATALOG_MEDIA_ORIGIN", "http://localhost:3211")
  vi.stubEnv("FILE_GUARD", "off")
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

async function code(work: Promise<unknown>) { try { await work; return null } catch (error) { return engineErrorCode(error) } }

/** Un membre du réseau racine, avec un profil publié (aucune session réelle au-delà du harnais). */
async function member(t: ReturnType<typeof testConvex>, root: Id<"networks">, handle: string) {
  const as = t.withIdentity({ subject: `um03-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: "Membre TEST" })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  return { as, personId }
}

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const owner = await member(t, root, "gerant-um03")
  await t.run(async (ctx) => ctx.db.insert("operators", { personId: owner.personId, role: "platform_admin", grantedAt: NOW }))
  await createTestOperatorProof(t, owner.as, owner.personId)
  const config = await readCommerceLinkConfig()
  if (!config) throw new Error("Configuration de fixture absente")
  const owned = await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", { networkId: root, handle: HANDLE, name: "Boutique de recette", description: "Activité de recette", ownerKind: "company", trust: "community", trustRank: 1, visibility: "network", onRoot: true, status: "active", createdByPersonId: owner.personId, searchText: "boutique recette", createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId: owner.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const shopId = await ctx.db.insert("shops", { networkId: root, pageId, preparedByPersonId: owner.personId, model: "products", storefront: "published", visibility: "network", publicConsentAt: NOW, publicConsentTextVersion: SHOP_PUBLIC_LISTING_TEXT_VERSION, publicConsentByPersonId: owner.personId, publishedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("shopCommerceLinks", { networkId: root, shopId, pageId, personId: owner.personId, state: "active", source: "antsia", environment: "sandbox", configFingerprint: config.fingerprint, subjectRef: `antsia:sub:${"a".repeat(32)}`, antsiaShopRef: `antsia:shop:${"b".repeat(32)}`, shopRef: SHOP, linkRef: LINK, permissions: ["publish_catalog", "publish_jobs"], consentTextVersion: COMMERCE_LINK_CONSENT_VERSION, consentedAt: NOW, linkedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("shopNetworkPolicies", { networkId: root, storefront: "review", updatedAt: NOW })
    for (const surface of ["commerceOffer", "commerceStorefront", "commerceJob"] as const) {
      await ctx.db.insert("moderationPolicies", { networkId: root, surface, preReview: false, maxLinks: 20, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    }
    return { pageId, shopId }
  })
  const emitterId = await owner.as.mutation(api.modules.federation.emitters.configure, { networkId: root, slug: "pro-um03-test", environment: "sandbox", enabled: true, keyEnvName: KEY_NAME, allowedContracts: [COMMERCE_PUBLIC_CONTRACT_V2, COMMERCE_JOBS_CONTRACT], reason: "Émetteur fictif du catalogue et des emplois dans le harnais" })
  await owner.as.mutation(api.modules.shops.catalogControl.setPolicy, { networkId: root, enabled: true, reason: "Politique fictive de lecture du catalogue" })
  await owner.as.mutation(api.modules.shops.catalogControl.configureMapping, { networkId: root, shopId: owned.shopId, emitterId, enabled: true, reason: "Mapping fictif de la boutique et des emplois" })
  await owner.as.mutation(api.modules.shops.jobs.setPolicy, { networkId: root, jobsEnabled: true, applicationsEnabled: false, reason: "Politique fictive des offres d'emploi" })
  // Un acheteur sans lien avec la boutique, et un membre de l'équipe (signataire de la page, comme l'exige son mandat).
  const buyer = await member(t, root, "acheteur-um03")
  const team = await member(t, root, "equipe-um03")
  await t.run(async (ctx) => ctx.db.insert("pageSignatories", { networkId: root, pageId: owned.pageId, personId: team.personId, role: "signatory", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW }))
  return { t, root, emitterId, owner, buyer, team, ...owned, offerArgs: { networkId: root, handle: HANDLE, offerRef: OFFER }, jobArgs: { networkId: root, handle: HANDLE, jobRef: JOB }, shopArgs: { networkId: root, handle: HANDLE } }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

function shopEvent(): CommerceShopEvent {
  return { type: "shop.published", shopRef: SHOP, linkRef: LINK, revision: 1, changedAt: NOW, commercialName: "Activité", country: "GA", currency: "XAF", sellerVerification: "unverified", capabilities: ["catalog", "jobs"], collections: [], storefrontTerms: TERMS }
}
function offerEvent(): CommerceOfferEvent {
  return { type: "offer.published", shopRef: SHOP, offerRef: OFFER, revision: 1, changedAt: NOW, kind: "product", title: "Robe en lin de recette", description: "Une description publique du produit.", collectionRefs: [], tags: ["recette"], price: { mode: "fixed", currency: "XAF", amount: 12_000 }, showsAvailability: false, variants: [], variantAxes: [], media: [], facets: FACETS }
}
function jobEvent(): CommerceJobsPublished {
  return { type: "job.published", shopRef: SHOP, jobRef: JOB, revision: 1, changedAt: NOW, title: "Vendeur en boutique", contractType: "cdi", headcount: 1, description: "Accueil et conseil de la clientèle.", location: "Libreville", openedOn: "2026-11-11", closesOn: "2026-12-31", skills: ["Vente"] }
}

async function signedPost(f: Fixture, raw: string) {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(federationSigningText("sandbox", timestamp, raw)))
  const signature = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("")
  const response = await f.t.fetch("/federation/inbox", { method: "POST", body: raw, headers: { "x-antsia-emitter": "pro-um03-test", "x-antsia-environment": "sandbox", "x-antsia-timestamp": timestamp, "x-antsia-signature": signature } })
  expect(response.status).toBe(202)
  expect(await response.json()).toMatchObject({ applicationStatus: "applied" })
}
async function deliverPublic(f: Fixture, payload: CommercePublicEvent) {
  await signedPost(f, commerceCanonicalJson({ contract: COMMERCE_PUBLIC_CONTRACT_V2, eventId: `um03-event-${++eventSequence}`, objectRef: commercePublicEffect(payload).objectRef, payload, version: 1 })!)
}
async function deliverJob(f: Fixture, payload: CommerceJobsPublished | CommerceJobsClosed) {
  await signedPost(f, commerceCanonicalJson({ contract: COMMERCE_JOBS_CONTRACT, eventId: `um03-event-${++eventSequence}`, objectRef: payload.jobRef, payload, version: 1 })!)
}

/** La boutique (avec ses conditions), une offre classée et un poste, reflétés ; les trois têtes. */
async function published() {
  const f = await fixture()
  await deliverPublic(f, shopEvent())
  await deliverPublic(f, offerEvent())
  await deliverJob(f, jobEvent())
  const heads = await f.t.run(async (ctx) => ({
    shop: await ctx.db.query("commerceCatalogHeads").withIndex("by_emitter_object_sequence", (q) => q.eq("emitterId", f.emitterId).eq("objectRef", SHOP).eq("sequence", "catalog")).unique(),
    offer: await ctx.db.query("commerceCatalogHeads").withIndex("by_emitter_object_sequence", (q) => q.eq("emitterId", f.emitterId).eq("objectRef", OFFER).eq("sequence", "catalog")).unique(),
    job: await ctx.db.query("commerceJobHeads").withIndex("by_emitter_object", (q) => q.eq("emitterId", f.emitterId).eq("objectRef", JOB)).unique(),
  }))
  if (!heads.shop || !heads.offer || !heads.job) throw new Error("Têtes de fixture absentes")
  const targets = {
    offer: { kind: "commerceOffer" as const, id: heads.offer._id },
    storefront: { kind: "commerceStorefront" as const, id: heads.shop._id },
    job: { kind: "commerceJob" as const, id: heads.job._id },
  }
  return { ...f, heads, targets }
}
type Published = Awaited<ReturnType<typeof published>>
type Reporter = Fixture["buyer"]
type Target = Published["targets"][keyof Published["targets"]]
const report = (f: Published, who: Reporter, target: Target, reason: string) => who.as.mutation(api.modules.moderation.cases.report, { networkId: f.root, target, reason })

describe("UM-03 — la fiche membre rend la cible du signalement à autrui seulement", () => {
  it("acheteur : la cible de l'offre, des conditions et du poste ; gérant et équipe : aucune ; le public n'en sait rien", async () => {
    const f = await published()
    const buyer = { offer: await f.buyer.as.query(api.modules.shops.catalog.offer, f.offerArgs), shop: await f.buyer.as.query(api.modules.shops.shops.storefront, f.shopArgs), job: await f.buyer.as.query(api.modules.shops.jobs.job, f.jobArgs) }
    expect(buyer.offer?.reportTarget).toEqual(f.targets.offer)
    expect(buyer.shop?.reportTarget).toEqual(f.targets.storefront)
    expect(buyer.job?.reportTarget).toEqual(f.targets.job)
    for (const who of [f.owner, f.team]) {
      expect(await who.as.query(api.modules.shops.catalog.offer, f.offerArgs)).not.toHaveProperty("reportTarget")
      expect(await who.as.query(api.modules.shops.shops.storefront, f.shopArgs)).not.toHaveProperty("reportTarget")
      expect(await who.as.query(api.modules.shops.jobs.job, f.jobArgs)).not.toHaveProperty("reportTarget")
    }
    // Les projections publiques (lecteurs stricts) restent inchangées : aucune cible, même allowlist.
    const publicOffer = await f.t.query(api.modules.public.catalog.offer, f.offerArgs)
    const publicShop = await f.t.query(api.modules.public.shops.getStorefront, f.shopArgs)
    const publicJob = await f.t.query(api.modules.public.jobs.job, f.jobArgs)
    for (const dto of [publicOffer, publicShop, publicJob]) {
      expect(dto).not.toBeNull()
      expect(dto).not.toHaveProperty("reportTarget")
    }
    expect({ ...buyer.offer, reportTarget: undefined }).toEqual(publicOffer)
  })
})

describe("UM-03 — le gérant et son équipe ne signalent pas leurs propres contenus", () => {
  it.each(["offer", "storefront", "job"] as const)("%s : refus indistinct pour le gérant comme pour l'équipe, aucun dossier", async (kind) => {
    const f = await published()
    expect(await code(report(f, f.owner, f.targets[kind], "other"))).toBe("notFound")
    expect(await code(report(f, f.team, f.targets[kind], "other"))).toBe("notFound")
    expect(await f.t.run(async (ctx) => (await ctx.db.query("reports").take(10)).length)).toBe(0)
  })
})

describe("UM-03 — autrui signale, avec accusé de réception et sans doublon", () => {
  it("poste : « frais demandés au candidat », accusé, aucun délai réglementé, rejeu idempotent, poste masqué pour le déclarant seul", async () => {
    const f = await published()
    const first = await report(f, f.buyer, f.targets.job, "job_fee_requested")
    expect(first.created).toBe(true)
    const row = await f.t.run(async (ctx) => ctx.db.get(first.reportId))
    expect(row).toMatchObject({ targetKind: "commerceJob", reason: "job_fee_requested", status: "open", reporterPersonId: f.buyer.personId })
    // L'art. 24 ne vise pas une fausse offre d'emploi : aucun fondement ni échéance légale.
    expect(row?.legalBasis).toBeUndefined()
    expect(row?.dueAt).toBeUndefined()
    expect(row?.acknowledgedAt).toBe(NOW)
    const notices = await f.t.run(async (ctx) => (await ctx.db.query("notifications").take(50)).filter((notice) => notice.kind === "report_received" && notice.recipientPersonId === f.buyer.personId))
    expect(notices).toHaveLength(1)
    const again = await report(f, f.buyer, f.targets.job, "job_impersonation")
    expect(again).toEqual({ reportId: first.reportId, created: false, hidden: true })
    expect(await f.t.run(async (ctx) => (await ctx.db.query("reports").take(10)).length)).toBe(1)
    expect(await f.buyer.as.query(api.modules.shops.jobs.job, f.jobArgs)).toBeNull()
    expect(await f.team.as.query(api.modules.shops.jobs.job, f.jobArgs)).not.toBeNull()
  })

  it("offre et conditions : un dossier chacun, masqués pour le déclarant", async () => {
    const f = await published()
    expect((await report(f, f.buyer, f.targets.offer, "misinformation")).created).toBe(true)
    expect((await report(f, f.buyer, f.targets.storefront, "other")).created).toBe(true)
    expect((await report(f, f.buyer, f.targets.offer, "misinformation")).created).toBe(false)
    expect(await f.buyer.as.query(api.modules.shops.catalog.offer, f.offerArgs)).toBeNull()
    expect(await f.buyer.as.query(api.modules.shops.shops.storefront, f.shopArgs)).not.toHaveProperty("storefrontTerms")
    expect(await f.owner.as.query(api.modules.shops.catalog.offer, f.offerArgs)).not.toBeNull()
  })
})

describe("UM-03 — les motifs de l'emploi ne valent que pour un poste", () => {
  it("refusés pour une offre ou des conditions ; admis pour le poste, comme les motifs de tout objet", async () => {
    const f = await published()
    expect(await code(report(f, f.buyer, f.targets.offer, "job_fee_requested"))).toBe("invalidArgument")
    expect(await code(report(f, f.buyer, f.targets.storefront, "job_impersonation"))).toBe("invalidArgument")
    expect(await f.t.run(async (ctx) => (await ctx.db.query("reports").take(10)).length)).toBe(0)
    expect((await report(f, f.buyer, f.targets.offer, "misinformation")).created).toBe(true)
    expect((await report(f, f.buyer, f.targets.job, "job_impersonation")).created).toBe(true)
  })
})

describe("UM-03 — signalement indistinct d'un contenu retiré ou invisible", () => {
  it("poste retiré par l'employeur : refusé comme un inconnu", async () => {
    const f = await published()
    await deliverJob(f, { type: "job.closed", shopRef: SHOP, jobRef: JOB, revision: 2, changedAt: NOW, reason: "withdrawn" })
    expect(await f.buyer.as.query(api.modules.shops.jobs.job, f.jobArgs)).toBeNull()
    expect(await code(report(f, f.buyer, f.targets.job, "job_fee_requested"))).toBe("notFound")
  })

  it.each(["removed", "pending_review"] as const)("offre, conditions et poste à l'état %s : refusés comme un inconnu", async (status) => {
    const f = await published()
    await f.t.run(async (ctx) => {
      for (const [kind, id] of [["commerceOffer", f.heads.offer._id], ["commerceStorefront", f.heads.shop._id], ["commerceJob", f.heads.job._id]] as const) {
        const state = await ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", kind).eq("targetId", id)).unique()
        if (!state) throw new Error(`État de modération absent : ${kind}`)
        await ctx.db.patch(state._id, { status })
      }
    })
    for (const kind of ["offer", "storefront", "job"] as const) expect(await code(report(f, f.buyer, f.targets[kind], "other"))).toBe("notFound")
    expect(await f.t.run(async (ctx) => (await ctx.db.query("reports").take(10)).length)).toBe(0)
  })
})

describe("UM-03 et CM-02 — une offre d'une catégorie interdite reste introuvable", () => {
  it("reflétée avant l'interdiction, elle disparaît de la fiche membre et publique, et son signalement est refusé", async () => {
    const f = await published()
    expect((await f.buyer.as.query(api.modules.shops.catalog.offer, f.offerArgs))?.reportTarget).toEqual(f.targets.offer)
    rules.entries = [{ key: "fashion.women", rule: "prohibited" }]
    expect(await f.buyer.as.query(api.modules.shops.catalog.offer, f.offerArgs)).toBeNull()
    expect(await f.t.query(api.modules.public.catalog.offer, f.offerArgs)).toBeNull()
    expect(await code(report(f, f.buyer, f.targets.offer, "other"))).toBe("notFound")
    // Les conditions et le poste de la même boutique restent signalables.
    expect((await report(f, f.buyer, f.targets.storefront, "other")).created).toBe(true)
  })
})
