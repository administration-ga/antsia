// @vitest-environment edge-runtime
/** MP06c : port de lecture simulé, sessions/mandats/débit réels ; aucune activation commerciale. */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { COMMERCE_LINK_CONSENT_VERSION } from "@antsia/social-domain/commerce-link"
import { commerceCanonicalJson } from "@antsia/social-domain/commerce/primitives"
import { COMMERCE_MERCHANT_READ_CONTRACT, COMMERCE_MERCHANT_READ_PATH, commerceMerchantReadSigningInput, parseCommerceMerchantReadRequest } from "@antsia/social-domain/commerce-merchant"
import { makeFunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, testConvex } from "../../test.setup"
import { commerceActivationReady } from "./commerceActivation"
import { readCommerceLinkConfig } from "./commerceLinkConfig"
import { base64url, sha256Hex } from "./commerceLinkCrypto"
import type { MerchantPreparationAdmission } from "./merchantPreparation"
import type { MerchantPreparationResult } from "./merchantPreparationRules"

const NOW = Date.UTC(2026, 9, 21, 15), KEY = "merchant-read-fixture-secret-sandbox-only-0123456789"
const SHOP = "pro.ga:structure:01JA00000000000000000000S1", LINK = "pro.ga:commerce_link:01JA00000000000000000000K1"
type Net = { networkId: Id<"networks"> }
const read = makeFunctionReference<"action", Net & { shopId: Id<"shops"> }, MerchantPreparationResult>("modules/shops/merchantPreparationActions:read")
const admit = makeFunctionReference<"mutation", Net & { shopId: Id<"shops">; requestId: string; configFingerprint: string }, MerchantPreparationAdmission | null>("modules/shops/merchantPreparation:admit")
const authorize = makeFunctionReference<"query", Net & { admission: MerchantPreparationAdmission }, boolean>("modules/shops/merchantPreparation:authorize")
const finish = makeFunctionReference<"query", Net & { admission: MerchantPreparationAdmission; rawResponse: string; httpStatus: number }, MerchantPreparationResult>("modules/shops/merchantPreparation:finish")

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW)
  vi.stubEnv("ANTSIA_COMMERCE_ENVIRONMENT", "sandbox"); vi.stubEnv("ANTSIA_COMMERCE_SOURCE", "antsia")
  vi.stubEnv("ANTSIA_COMMERCE_PRO_HTTP_ORIGIN", "http://localhost:4010"); vi.stubEnv("ANTSIA_COMMERCE_PRO_APP_ORIGIN", "http://localhost:4011")
  vi.stubEnv("ANTSIA_COMMERCE_ORIGIN", "http://localhost:3030"); vi.stubEnv("ANTSIA_COMMERCE_KEY_ID", "merchant-fixture")
  vi.stubEnv("ANTSIA_COMMERCE_SIGNING_KEY", KEY); vi.stubEnv("ANTSIA_COMMERCE_MERCHANT_READ_ENABLED", "true")
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
async function fixture() {
  const t = testConvex(), { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const owner = t.withIdentity({ subject: "merchant-holder-fixture" }), other = t.withIdentity({ subject: "merchant-other-admin-fixture" })
  const member = async (as: typeof owner, handle: string) => {
    const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: "Recette préparation" })
    await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root }); return personId
  }
  const ownerId = await member(owner, "merchant-holder"), otherId = await member(other, "merchant-other-admin"), config = (await readCommerceLinkConfig())!
  const rows = await t.run(async ctx => {
    const pageId = await ctx.db.insert("pages", { networkId: root, handle: "merchant-preparation-fixture", name: "Activité de recette", ownerKind: "company", trust: "community", trustRank: 1, visibility: "network", onRoot: true, status: "active", createdByPersonId: ownerId, searchText: "activité recette", createdAt: NOW, updatedAt: NOW })
    const signatoryId = await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId: ownerId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId: otherId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const shopId = await ctx.db.insert("shops", { networkId: root, pageId, preparedByPersonId: ownerId, model: "quote_services", storefront: "draft", visibility: "network", createdAt: NOW, updatedAt: NOW })
    const linkId = await ctx.db.insert("shopCommerceLinks", { networkId: root, shopId, pageId, personId: ownerId, state: "active", source: "antsia", environment: "sandbox", configFingerprint: config.fingerprint, subjectRef: `antsia:sub:${"a".repeat(64)}`, antsiaShopRef: `antsia:shop:${"b".repeat(64)}`, shopRef: SHOP, linkRef: LINK, permissions: ["catalog_drafts", "publish_catalog", "receive_inquiries", "receive_bookings", "receive_orders"], consentTextVersion: COMMERCE_LINK_CONSENT_VERSION, consentedAt: NOW, linkedAt: NOW, createdAt: NOW, updatedAt: NOW })
    return { pageId, shopId, linkId, signatoryId }
  })
  return { t, root, testClosed, owner, other, ownerId, otherId, config, ...rows, args: { networkId: root, shopId: rows.shopId } }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
function accepted(raw: string): Record<string, unknown> {
  const request = JSON.parse(raw) as { requestId: string; linkRef: string; shopRef: string; expiresAt: number }
  return { contract: COMMERCE_MERCHANT_READ_CONTRACT, version: 1, requestId: request.requestId, requestSha256: "", outcome: "accepted", linkRef: request.linkRef, shopRef: request.shopRef, checkedAt: Date.now(), expiresAt: request.expiresAt,
    publishedCatalog: { available: true, revision: 1 }, servicesEnabled: false,
    capabilities: [{ key: "catalog", canOpen: true, target: "catalog", missing: [] }, { key: "quotes", canOpen: false, target: null, missing: ["service_disabled"] }, { key: "agenda", canOpen: false, target: null, missing: ["module_unavailable"] }, { key: "fixed_packages", canOpen: false, target: null, missing: ["verification_required", "service_disabled"] }],
  }
}
async function reply(raw: string, mutate?: (body: Record<string, unknown>) => void): Promise<string> {
  const body = accepted(raw); body.requestSha256 = await sha256Hex(raw); mutate?.(body)
  return commerceCanonicalJson(body)!
}
function peer(options: { beforeReply?: () => Promise<void>; mutate?: (body: Record<string, unknown>) => void; refusal?: boolean; status?: number; oversized?: boolean; failed?: boolean } = {}) {
  const sent: string[] = [], failures: string[] = []
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const raw = String(init?.body), headers = new Headers(init?.headers)
      expect(new URL(String(input)).href).toBe(`http://localhost:4010${COMMERCE_MERCHANT_READ_PATH}`)
      expect(init?.method).toBe("POST"); expect(init?.redirect).toBe("error")
      expect(headers.has("Cookie")).toBe(false); expect(headers.has("Authorization")).toBe(false)
      const parsed = parseCommerceMerchantReadRequest(raw, { source: "antsia", environment: "sandbox", nowMs: Date.now() })
      expect(parsed.ok).toBe(true)
      const signing = commerceMerchantReadSigningInput({ bodySha256: await sha256Hex(raw), environment: "sandbox", issuedAtMs: Number(headers.get("X-Pro-Timestamp")), keyId: "merchant-fixture", nonce: headers.get("X-Pro-Nonce")!, operation: "merchant.preparation.read", source: "antsia" })
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
      expect(headers.get("X-Pro-Signature")).toBe(base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signing!)))))
      sent.push(raw)
      await options.beforeReply?.()
      if (options.failed) throw new Error("Transport simulé indisponible")
      if (options.oversized) return new Response("x".repeat(8193))
      let rawResponse = await reply(raw, options.mutate)
      if (options.refusal) { const request = JSON.parse(raw); rawResponse = commerceCanonicalJson({ contract: COMMERCE_MERCHANT_READ_CONTRACT, version: 1, requestId: request.requestId, requestSha256: await sha256Hex(raw), outcome: "refused", reason: "access_denied" })! }
      return new Response(rawResponse, { status: options.status ?? (options.refusal ? 422 : 200) })
    } catch (error) { if (!options.failed) failures.push(String(error)); throw error }
  })
  vi.stubGlobal("fetch", fetcher)
  return { sent, failures, fetcher }
}
async function admission(f: Fixture) {
  const value = await f.owner.mutation(admit, { ...f.args, requestId: "merchant-request-fixture-0001", configFingerprint: f.config.fingerprint })
  if (!value) throw new Error("Lecture du titulaire attendue")
  return value
}

describe("MP06c — préparation privée du titulaire PRO", () => {
  it("reste fermée sans opt-in serveur et n'effectue aucun appel distant", async () => {
    const f = await fixture(), p = peer(); vi.stubEnv("ANTSIA_COMMERCE_MERCHANT_READ_ENABLED", "")
    expect(await f.owner.action(read, f.args)).toEqual({ outcome: "unavailable" })
    expect(p.sent).toEqual([])
  })

  it("lit les seules capacités du titulaire, même avant publication et sans activer P14", async () => {
    const f = await fixture(), p = peer()
    expect(commerceActivationReady("services")).toBe(false)
    const result = await f.owner.action(read, f.args)
    expect(result).toMatchObject({ outcome: "ready", proShopRef: SHOP, proAppOrigin: "http://localhost:4011", preparation: { servicesEnabled: false, publishedCatalog: { available: true, revision: 1 }, checkedAt: NOW, expiresAt: NOW + 60_000 } })
    expect(p.sent).toHaveLength(1); expect(p.failures).toEqual([])
    for (const key of ["contract", "requestId", "requestSha256", "subject", "linkRef", "shopRef", "rawBody", "sessionDigest", "configFingerprint"]) {
      expect(result).not.toHaveProperty(key)
      if (result.outcome === "ready") expect(result.preparation).not.toHaveProperty(key)
    }
    expect(await f.t.run(async ctx => ({ services: await ctx.db.query("commerceServiceRequests").take(1), commands: await ctx.db.query("commerceServiceCommands").take(1) }))).toEqual({ services: [], commands: [] })
  })

  it("un autre administrateur de la même page n'est pas le titulaire de la liaison", async () => {
    const f = await fixture(), p = peer()
    expect(await f.other.action(read, f.args)).toEqual({ outcome: "unavailable" })
    await f.t.run(async ctx => ctx.db.insert("operators", { personId: f.otherId, role: "platform_admin", grantedAt: NOW }))
    expect(await f.other.action(read, f.args)).toEqual({ outcome: "unavailable" })
    expect(p.sent).toEqual([])
  })

  it("un lien historique sans le consentement PRO dédié reste refusé par l'autorité distante", async () => {
    const f = await fixture(), p = peer({ refusal: true })
    expect(await f.owner.action(read, f.args)).toEqual({ outcome: "refused" })
    expect(p.sent).toHaveLength(1); expect(p.failures).toEqual([])
  })

  it.each(["link", "person", "role", "flag", "config"])("relit %s à l'arrivée et masque toute ancienne capacité", async gate => {
    const f = await fixture(), p = peer({ beforeReply: async () => {
      if (gate === "link") await f.t.run(async ctx => ctx.db.patch(f.linkId, { state: "revoked" }))
      if (gate === "person") await f.t.run(async ctx => ctx.db.patch(f.linkId, { personId: f.otherId }))
      if (gate === "role") await f.t.run(async ctx => ctx.db.patch(f.signatoryId, { role: "signatory" }))
      if (gate === "flag") vi.stubEnv("ANTSIA_COMMERCE_MERCHANT_READ_ENABLED", "false")
      if (gate === "config") vi.stubEnv("ANTSIA_COMMERCE_PRO_APP_ORIGIN", "http://localhost:4012")
    } })
    expect(await f.owner.action(read, f.args)).toEqual({ outcome: "unavailable" })
    expect(p.sent).toHaveLength(1); expect(p.failures).toEqual([])
  })

  it("une nouvelle session de la même personne ne réadopte pas une réponse de l'ancien bail", async () => {
    const f = await fixture(), before = await admission(f)
    const sessionId = await createTestSession(f.t, "merchant-holder-fixture"), later = f.t.withIdentity({ subject: "merchant-holder-fixture", sessionId })
    expect(await later.query(authorize, { networkId: f.root, admission: before })).toBe(false)
    expect(await later.query(finish, { networkId: f.root, admission: before, rawResponse: await reply(before.rawBody), httpStatus: 200 })).toEqual({ outcome: "unavailable" })
  })

  it.each(["hash", "shop", "private", "expired", "duplicate", "target"])("refuse les réponses non corrélées ou hors allowlist : %s", async failure => {
    const f = await fixture(), p = peer({ mutate: body => {
      if (failure === "hash") body.requestSha256 = "0".repeat(64)
      if (failure === "shop") body.shopRef = "pro.ga:structure:01JA00000000000000000000S2"
      if (failure === "private") body.planning = [{ person: "Contenu privé interdit" }]
      if (failure === "expired") body.expiresAt = NOW - 1
      if (failure === "duplicate") body.capabilities = Array.from({ length: 4 }, () => ({ key: "catalog", canOpen: true, target: "catalog", missing: [] }))
      if (failure === "target") body.capabilities = [{ key: "catalog", canOpen: true, target: "https://foreign.example", missing: [] }]
    } })
    expect(await f.owner.action(read, f.args)).toEqual({ outcome: "unavailable" })
    expect(p.sent).toHaveLength(1); expect(p.failures).toEqual([])
  })

  it.each(["oversized", "failed", "redirect"])("ferme le transport borné : %s", async failure => {
    const f = await fixture(), p = peer({ oversized: failure === "oversized", failed: failure === "failed", ...(failure === "redirect" ? { status: 302 } : {}) })
    expect(await f.owner.action(read, f.args)).toEqual({ outcome: "unavailable" })
    expect(p.sent).toHaveLength(1); expect(p.failures).toEqual([])
  })

  it("une admission expirée et un autre réseau restent fermés", async () => {
    const f = await fixture(), value = await admission(f)
    vi.setSystemTime(NOW + 60_001)
    expect(await f.owner.query(authorize, { networkId: f.root, admission: value })).toBe(false)
    let error: unknown
    try { await f.owner.action(read, { ...f.args, networkId: f.testClosed }) } catch (caught) { error = caught }
    expect(engineErrorCode(error)).toBe("notFound")
  })
})
