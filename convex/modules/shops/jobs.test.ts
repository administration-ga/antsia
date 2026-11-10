// @vitest-environment edge-runtime
/**
 * P15 : offres d'emploi reflétées — scénarios backend ÉCRITS, NON EXÉCUTÉS
 * (décision du propriétaire du 18/10/2026 : « Continuer sans vérifier »).
 */
import { COMMERCE_JOBS_CONTRACT, type CommerceJobsClosed, type CommerceJobsPublished } from "@antsia/social-domain/commerce-jobs"
import { COMMERCE_PUBLIC_CONTRACT, commerceCanonicalJson } from "@antsia/social-domain/commerce/primitives"
import { commercePublicEffect, type CommerceJobEvent, type CommercePublicEvent, type CommerceShopEvent } from "@antsia/social-domain/commerce/projection"
import { COMMERCE_LINK_CONSENT_VERSION } from "@antsia/social-domain/commerce-link"
import { federationSigningText } from "@antsia/social-domain/federationProtocol"
import { makeFunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, testConvex } from "../../test.setup"
import { readCommerceLinkConfig } from "./commerceLinkConfig"
import type { JobDto, JobList } from "./jobRead"
import { SHOP_PUBLIC_LISTING_TEXT_VERSION } from "./rules"

const NOW = Date.UTC(2026, 9, 18, 12)
const SHOP = "pro.ga:structure:01JA00000000000000000000S1", LINK = "pro.ga:commerce_link:01JA00000000000000000000K1"
const JOB = "pro.ga:job_opening:01JA00000000000000000000J1", OTHER_JOB = "pro.ga:job_opening:01JA00000000000000000000J2"
const KEY_NAME = "ANTSIA_FEDERATION_JOBS_TEST_KEY", KEY = "emploi-test-secret-key-sandbox-0123456789"
const HANDLE = "emploi-test"
let eventSequence = 0

type Page = { cursor: string | null; numItems: number }
const catalogPolicy = makeFunctionReference<"mutation", { networkId: Id<"networks">; enabled: boolean; reason: string }, null>("modules/shops/catalogControl:setPolicy")
const mapping = makeFunctionReference<"mutation", { networkId: Id<"networks">; shopId: Id<"shops">; emitterId: Id<"federationEmitters">; enabled: boolean; reason: string }, null>("modules/shops/catalogControl:configureMapping")
const jobPolicy = makeFunctionReference<"mutation", { networkId: Id<"networks">; jobsEnabled: boolean; applicationsEnabled: boolean; reason: string }, null>("modules/shops/jobs:setPolicy")
const memberJob = makeFunctionReference<"query", { networkId: Id<"networks">; handle: string; jobRef: string }, JobDto | null>("modules/shops/jobs:job")
const publicJob = makeFunctionReference<"query", { networkId: Id<"networks">; handle: string; jobRef: string }, JobDto | null>("modules/public/jobs:job")
const shopJobs = makeFunctionReference<"query", { networkId: Id<"networks">; handle: string; paginationOpts: Page }, JobList>("modules/shops/jobs:listForShop")
const discover = makeFunctionReference<"query", { networkId: Id<"networks">; paginationOpts: Page }, JobList>("modules/shops/jobs:discover")
const availability = makeFunctionReference<"query", { networkId: Id<"networks"> }, { available: boolean }>("modules/shops/jobs:discoverAvailability")

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
  vi.stubEnv("ANTSIA_COMMERCE_KEY_ID", "antsia-jobs-test")
  vi.stubEnv("ANTSIA_COMMERCE_SIGNING_KEY", KEY)
  vi.stubEnv("FILE_GUARD", "off")
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

async function fixture(options: { permissions?: ("publish_catalog" | "publish_jobs" | "receive_applications")[] } = {}) {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const as = t.withIdentity({ subject: "emploi-operator-fixture" })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle: "emploi-owner", displayName: "Employeur" })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  await t.run(async (ctx) => ctx.db.insert("operators", { personId, role: "platform_admin", grantedAt: NOW }))
  await createTestOperatorProof(t, as, personId)
  const config = await readCommerceLinkConfig()
  if (!config) throw new Error("Configuration de fixture absente")
  const owned = await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", { networkId: root, handle: HANDLE, name: "Cabinet de recette", description: "Activité de recette", ownerKind: "company", trust: "community", trustRank: 1, visibility: "network", onRoot: true, status: "active", createdByPersonId: personId, searchText: "cabinet recette", createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const shopId = await ctx.db.insert("shops", { networkId: root, pageId, preparedByPersonId: personId, model: "products", storefront: "published", visibility: "network", publicConsentAt: NOW, publicConsentTextVersion: SHOP_PUBLIC_LISTING_TEXT_VERSION, publicConsentByPersonId: personId, publishedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const linkId = await ctx.db.insert("shopCommerceLinks", { networkId: root, shopId, pageId, personId, state: "active", source: "antsia", environment: "sandbox", configFingerprint: config.fingerprint, subjectRef: `antsia:sub:${"a".repeat(32)}`, antsiaShopRef: `antsia:shop:${"b".repeat(32)}`, shopRef: SHOP, linkRef: LINK, permissions: options.permissions ?? ["publish_catalog", "publish_jobs", "receive_applications"], consentTextVersion: COMMERCE_LINK_CONSENT_VERSION, consentedAt: NOW, linkedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("shopNetworkPolicies", { networkId: root, storefront: "review", updatedAt: NOW })
    await ctx.db.insert("moderationPolicies", { networkId: root, surface: "commerceJob", preReview: false, maxLinks: 20, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    return { pageId, shopId, linkId }
  })
  const emitterId = await as.mutation(api.modules.federation.emitters.configure, { networkId: root, slug: "pro-jobs-test", environment: "sandbox", enabled: true, keyEnvName: KEY_NAME, allowedContracts: [COMMERCE_PUBLIC_CONTRACT, COMMERCE_JOBS_CONTRACT], reason: "Émetteur fictif des emplois dans le harnais" })
  await as.mutation(catalogPolicy, { networkId: root, enabled: true, reason: "Politique fictive de lecture du catalogue" })
  await as.mutation(mapping, { networkId: root, shopId: owned.shopId, emitterId, enabled: true, reason: "Mapping fictif de la boutique et des emplois" })
  await as.mutation(jobPolicy, { networkId: root, jobsEnabled: true, applicationsEnabled: true, reason: "Politique fictive des offres et candidatures" })
  return { t, as, root, personId, emitterId, ...owned, jobArgs: { networkId: root, handle: HANDLE, jobRef: JOB } }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

function shop(revision = 1, capabilities: CommerceShopEvent["capabilities"] = ["catalog", "jobs"]): CommerceShopEvent {
  return { type: revision === 1 ? "shop.published" : "shop.updated", shopRef: SHOP, linkRef: LINK, revision, changedAt: NOW, commercialName: "Cabinet", country: "GA", currency: "XAF", sellerVerification: "unverified", capabilities, collections: [] }
}
function job(revision = 1, extra: Partial<CommerceJobsPublished> = {}): CommerceJobsPublished {
  return {
    type: "job.published", shopRef: SHOP, jobRef: JOB, revision, changedAt: NOW, title: "Comptable confirmé", contractType: "cdi", headcount: 1,
    description: "Tenue de la comptabilité générale et des déclarations.", location: "Libreville", openedOn: "2026-10-18", closesOn: "2026-11-30",
    skills: ["Comptabilité", "Fiscalité"], declaredSalary: { currency: "XAF", minAmount: 400_000, maxAmount: 600_000, period: "month" }, ...extra,
  }
}
function closed(revision: number, reason: CommerceJobsClosed["reason"], jobRef = JOB): CommerceJobsClosed {
  return { type: "job.closed", shopRef: SHOP, jobRef, revision, changedAt: NOW, reason }
}

async function signedPost(f: Fixture, raw: string) {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(federationSigningText("sandbox", timestamp, raw)))
  const signature = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("")
  return await f.t.fetch("/federation/inbox", { method: "POST", body: raw, headers: { "x-antsia-emitter": "pro-jobs-test", "x-antsia-environment": "sandbox", "x-antsia-timestamp": timestamp, "x-antsia-signature": signature } })
}
async function deliverPublic(f: Fixture, payload: CommercePublicEvent) {
  return await signedPost(f, commerceCanonicalJson({ contract: COMMERCE_PUBLIC_CONTRACT, eventId: `jobs-event-${++eventSequence}`, objectRef: commercePublicEffect(payload).objectRef, payload, version: 1 })!)
}
async function deliverJobs(f: Fixture, payload: CommerceJobsPublished | CommerceJobsClosed) {
  return await signedPost(f, commerceCanonicalJson({ contract: COMMERCE_JOBS_CONTRACT, eventId: `jobs-event-${++eventSequence}`, objectRef: payload.jobRef, payload, version: 1 })!)
}
async function status(response: Response) { expect(response.status).toBe(202); return (await response.json() as { applicationStatus?: string }).applicationStatus }
async function published(f: Fixture, payload = job()) {
  expect(await status(await deliverPublic(f, shop()))).toBe("applied")
  expect(await status(await deliverJobs(f, payload))).toBe("applied")
}
async function head(f: Fixture, jobRef = JOB) {
  return await f.t.run(async (ctx) => ctx.db.query("commerceJobHeads").withIndex("by_emitter_object", (q) => q.eq("emitterId", f.emitterId).eq("objectRef", jobRef)).unique())
}
const page = { cursor: null, numItems: 12 }

describe("P15 — offres publiées par JOBS-V1", () => {
  it("projette la même allowlist au membre et au SSR anonyme, sans candidat ni référence interne", async () => {
    const f = await fixture()
    await published(f)
    const member = await f.as.query(memberJob, f.jobArgs), anonymous = await f.t.query(publicJob, f.jobArgs)
    expect(member).not.toBeNull()
    expect({ ...member, actions: undefined }).toEqual({ ...anonymous, actions: undefined })
    expect(member).toMatchObject({
      jobRef: JOB, shopHandle: HANDLE, title: "Comptable confirmé", contractType: "cdi", headcount: 1, location: "Libreville",
      skills: ["Comptabilité", "Fiscalité"], openedOn: "2026-10-18", closesOn: "2026-11-30", status: "open",
      salary: { currency: "XAF", minAmount: 400_000, maxAmount: 600_000, period: "month" },
    })
    // Candidater : membre seulement, jamais l'anonyme.
    expect(member?.actions.apply).toBe(true)
    expect(anonymous?.actions.apply).toBe(false)
    const serialized = JSON.stringify(member)
    for (const internalValue of [LINK, SHOP, "subjectRef", "emitterId", "configFingerprint", "mappingId", "storageId", "http://localhost:4010"]) expect(serialized).not.toContain(internalValue)
  })

  it("rémunération sans période : « non précisée » (période nulle), jamais inventée", async () => {
    const f = await fixture()
    await published(f, job(1, { declaredSalary: { currency: "XAF", minAmount: 250_000 } }))
    expect((await f.as.query(memberJob, f.jobArgs))?.salary).toEqual({ currency: "XAF", minAmount: 250_000, maxAmount: null, period: null })
  })

  it("Découvrir n'ouvre l'onglet Emplois qu'avec de vraies offres reçues et lisibles", async () => {
    const f = await fixture()
    expect(await f.as.query(availability, { networkId: f.root })).toEqual({ available: false })
    await published(f)
    expect(await f.as.query(availability, { networkId: f.root })).toEqual({ available: true })
    const listed = await f.as.query(discover, { networkId: f.root, paginationOpts: page })
    expect(listed.page.map((item) => item.jobRef)).toEqual([JOB])
    expect((await f.as.query(shopJobs, { networkId: f.root, handle: HANDLE, paginationOpts: page })).page.map((item) => item.jobRef)).toEqual([JOB])
  })
})

describe("P15 — consentement et mandat : publication refusée sans eux", () => {
  it("sans permission `publish_jobs` sur le lien : rien n'est reflété", async () => {
    const f = await fixture({ permissions: ["publish_catalog", "receive_applications"] })
    expect(await status(await deliverPublic(f, shop()))).toBe("applied")
    expect(await status(await deliverJobs(f, job()))).toBe("rejected")
    expect(await head(f)).toBeNull()
    expect(await f.t.query(publicJob, f.jobArgs)).toBeNull()
  })

  it("politique d'emploi fermée par l'opérateur : refus, et une offre déjà reçue n'est plus servie", async () => {
    const f = await fixture()
    await published(f)
    await f.as.mutation(jobPolicy, { networkId: f.root, jobsEnabled: false, applicationsEnabled: false, reason: "Fermeture fictive des offres du réseau" })
    expect(await f.as.query(memberJob, f.jobArgs)).toBeNull()
    expect(await status(await deliverJobs(f, job(2)))).toBe("rejected")
  })

  it("parent boutique sans la capacité `jobs` (consentement de structure absent) : refus", async () => {
    const f = await fixture()
    expect(await status(await deliverPublic(f, shop(1, ["catalog"])))).toBe("applied")
    expect(await status(await deliverJobs(f, job()))).toBe("rejected")
  })

  it("contrat JOBS-V1 retiré de l'émetteur : l'offre reçue ne se lit plus", async () => {
    const f = await fixture()
    await published(f)
    await f.as.mutation(api.modules.federation.emitters.configure, { networkId: f.root, slug: "pro-jobs-test", environment: "sandbox", enabled: true, keyEnvName: KEY_NAME, allowedContracts: [COMMERCE_PUBLIC_CONTRACT], reason: "Retrait fictif du contrat des emplois" })
    expect(await f.t.query(publicJob, f.jobArgs)).toBeNull()
  })
})

describe("P15 — révisions, clôture, retrait et tombe", () => {
  it("une offre pourvue quitte la découverte ; son lien connu affiche la clôture, sans candidature", async () => {
    const f = await fixture()
    await published(f)
    expect(await status(await deliverJobs(f, closed(2, "filled")))).toBe("applied")
    expect((await f.as.query(discover, { networkId: f.root, paginationOpts: page })).page).toEqual([])
    expect(await f.as.query(memberJob, f.jobArgs)).toMatchObject({ status: "filled", title: "Comptable confirmé", actions: { apply: false } })
    // Une clôture est définitive (objet terminal) : une republication ultérieure est refusée et ne rouvre rien.
    expect(await status(await deliverJobs(f, job(3)))).toBe("rejected")
    expect((await head(f))).toMatchObject({ state: "closed", closure: "filled", revision: 2 })
  })

  it("après un retrait, un ancien événement ne réactive jamais l'offre", async () => {
    const f = await fixture()
    await published(f, job(2))
    expect(await status(await deliverJobs(f, closed(3, "withdrawn")))).toBe("applied")
    expect(await f.t.query(publicJob, f.jobArgs)).toBeNull()
    // Rejeu tardif de la révision 2 puis d'une révision 1 : périmées, la tombe tient.
    expect(await status(await deliverJobs(f, job(2)))).toBe("applied")
    expect(await status(await deliverJobs(f, job(1)))).toBe("applied")
    expect((await head(f))).toMatchObject({ state: "withdrawn", revision: 3 })
    expect((await head(f))?.contentJson).toBeUndefined()
    expect(await f.t.query(publicJob, f.jobArgs)).toBeNull()
  })

  it("même révision, autre contenu : conflit, rien n'est remplacé", async () => {
    const f = await fixture()
    await published(f)
    const before = await head(f)
    expect(await status(await deliverJobs(f, job(1, { title: "Intitulé concurrent" })))).toBe("rejected")
    expect((await head(f))?.digest).toBe(before?.digest)
  })

  it("offre inconnue ou d'une autre boutique : `null` indistinct", async () => {
    const f = await fixture()
    await published(f)
    expect(await f.t.query(publicJob, { ...f.jobArgs, jobRef: OTHER_JOB })).toBeNull()
    expect(await f.t.query(publicJob, { ...f.jobArgs, handle: "autre-boutique" })).toBeNull()
    expect(await f.t.query(publicJob, { ...f.jobArgs, jobRef: "pas-une-reference" })).toBeNull()
  })
})

describe("P15 — `job.*` de PUBLIC-V1 normalisé", () => {
  it("lit PUBLIC-V1 sans compétence ni période ; rien n'est inventé", async () => {
    const f = await fixture()
    expect(await status(await deliverPublic(f, shop()))).toBe("applied")
    const legacy: CommerceJobEvent = {
      type: "job.published", shopRef: SHOP, jobRef: JOB, revision: 1, changedAt: NOW, title: "Assistant administratif", contractType: "cdd", headcount: 2,
      description: "Accueil et classement.", openedOn: "2026-10-18", declaredSalary: { currency: "XAF", minAmount: 200_000, maxAmount: 250_000 },
    }
    expect(await status(await deliverPublic(f, legacy))).toBe("applied")
    expect(await f.t.query(publicJob, f.jobArgs)).toMatchObject({ skills: [], location: null, closesOn: null, salary: { currency: "XAF", minAmount: 200_000, maxAmount: 250_000, period: null } })
  })
})

// P16 : validation fictive EN TEST pour préserver les scénarios historiques.
// Aucun contournement d'environnement ni activation en source applicative.
vi.mock("./commerceActivation", async (importOriginal) => ({
  ...await importOriginal<typeof import("./commerceActivation")>(),
  commerceActivationReady: () => true,
}))
