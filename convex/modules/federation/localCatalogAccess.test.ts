// @vitest-environment edge-runtime
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, testConvex } from "../../test.setup"

const KEY = "ANTSIA_FEDERATION_PRO_GA_LOCAL_SU06_KEY"
const CONTRACT = "PRO-COMMERCE-PUBLIC-V2"
const REASON = "Raccord local du catalogue de démonstration demandé par le propriétaire."
const localEnvironment = {
  ANTSIA_LOCAL_COMMERCE_LOA1: "true", ANTSIA_DEV_TOOLS: "true",
  CONVEX_CLOUD_URL: "http://127.0.0.1:3260", CONVEX_SITE_URL: "http://127.0.0.1:3261",
  FEDERATION_ENVIRONMENT: "sandbox", ANTSIA_COMMERCE_ENVIRONMENT: "sandbox", ANTSIA_COMMERCE_SOURCE: "antsia-local",
  ANTSIA_COMMERCE_ORIGIN: "http://localhost:3030", ANTSIA_COMMERCE_PRO_HTTP_ORIGIN: "http://127.0.0.1:3221",
  ANTSIA_COMMERCE_PRO_APP_ORIGIN: "http://localhost:3022", IDN_CLIENT_ID: "fixture_sbx_local",
}
beforeEach(() => { for (const [name, value] of Object.entries(localEnvironment)) vi.stubEnv(name, value) })
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

async function fixture(role: "platform_admin" | "platform_operator" = "platform_admin") {
  const t = testConvex()
  const { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const subject = "local-catalog-" + crypto.randomUUID(), now = Date.now()
  const personId = await t.run(async ctx => {
    const personId = await ctx.db.insert("persons", { authUserId: subject, createdAt: now, updatedAt: now })
    await ctx.db.insert("operators", { personId, role, grantedAt: now })
    return personId
  })
  const as = t.withIdentity({ subject })
  await createTestOperatorProof(t, as, personId, 1)
  await as.mutation(api.modules.platform.operatorAccess.recordAccess, {})
  const emitterArgs = { networkId: root, slug: "pro-ga", environment: "sandbox" as const,
    enabled: true, keyEnvName: KEY, allowedContracts: [CONTRACT], reason: REASON }
  return { t, as, root, testClosed, personId, emitterArgs }
}
async function codeOf(promise: Promise<unknown>) {
  try { await promise; return null } catch (error) { return engineErrorCode(error) }
}

describe("catalogue local : vraie session IDN1 et périmètre fermé", () => {
  it("admet l’émetteur V2 puis la politique locale sans produire de badge Vérifié", async () => {
    const f = await fixture()
    const emitterId = await f.as.mutation(api.modules.federation.emitters.configure, f.emitterArgs)
    await f.as.mutation(api.modules.shops.catalogControl.setPolicy, { networkId: f.root, enabled: true, reason: REASON })
    expect(await f.as.query(api.modules.shops.catalogControl.getPolicy, { networkId: f.root })).toMatchObject({ configured: true, enabled: true })
    expect((await f.as.query(api.modules.people.persons.getMyPerson, {}))?.badges).not.toContain("verified")
    const stored = await f.t.run(async ctx => ({ emitter: await ctx.db.get(emitterId), audit: await ctx.db.query("engineAudit").take(10) }))
    expect(stored.emitter).toMatchObject({ slug: "pro-ga", environment: "sandbox", allowedContracts: [CONTRACT] })
    expect(stored.audit.map(row => row.action)).toEqual(expect.arrayContaining(["console.access", "federation.emitter_set", "catalog.policy_set"]))
  })

  it.each([
    ["ANTSIA_LOCAL_COMMERCE_LOA1", "false"], ["CONVEX_CLOUD_URL", "https://fixture.convex.cloud"],
    ["CONVEX_SITE_URL", "https://fixture.convex.site"], ["FEDERATION_ENVIRONMENT", "production"],
    ["ANTSIA_COMMERCE_PRO_HTTP_ORIGIN", "https://example.test"], ["IDN_CLIENT_ID", "fixture_prd_local"],
  ])("refuse le catalogue IDN1 quand %s=%s", async (name, value) => {
    const f = await fixture(); vi.stubEnv(name, value)
    expect(await codeOf(f.as.mutation(api.modules.federation.emitters.configure, f.emitterArgs))).toBe("notFound")
    expect(await codeOf(f.as.mutation(api.modules.shops.catalogControl.setPolicy, { networkId: f.root, enabled: true, reason: REASON }))).toBe("notFound")
    expect(await f.t.run(ctx => ctx.db.query("federationEmitters").take(2))).toEqual([])
  })

  it("refuse un opérateur sans rôle d’administration", async () => {
    const f = await fixture("platform_operator")
    expect(await codeOf(f.as.mutation(api.modules.federation.emitters.configure, f.emitterArgs))).toBe("notFound")
  })

  it.each([
    { slug: "another-source" }, { environment: "production" as const }, { keyEnvName: "ANTSIA_FEDERATION_OTHER_KEY" },
    { allowedContracts: ["RESEAU-PUBLIC-V1"] }, { allowedContracts: [CONTRACT, "RESEAU-PUBLIC-V1"] },
  ])("n’ouvre pas un autre périmètre d’émetteur : %j", async overrides => {
    const f = await fixture()
    expect(await codeOf(f.as.mutation(api.modules.federation.emitters.configure, { ...f.emitterArgs, ...overrides }))).toBe("notFound")
  })

  it("ne remplace pas un émetteur pro-ga déjà consacré à d’autres contrats", async () => {
    const f = await fixture()
    const emitterId = await f.t.run(ctx => ctx.db.insert("federationEmitters", {
      networkId: f.root, slug: "pro-ga", environment: "sandbox", enabled: true, keyEnvName: KEY,
      allowedContracts: ["RESEAU-PUBLIC-V1"], revision: 9, createdAt: Date.now(), updatedAt: Date.now(),
    }))
    expect(await codeOf(f.as.mutation(api.modules.federation.emitters.configure, f.emitterArgs))).toBe("notFound")
    expect(await f.t.run(ctx => ctx.db.get(emitterId))).toMatchObject({ revision: 9, allowedContracts: ["RESEAU-PUBLIC-V1"] })
  })

  it("refuse politique étrangère et réglages de paiement malgré le mode local", async () => {
    const f = await fixture()
    expect(await codeOf(f.as.query(api.modules.shops.catalogControl.getPolicy, { networkId: f.testClosed }))).toBe("notFound")
    expect(await codeOf(f.as.query(api.modules.shops.paymentPolicy.getPolicy, { networkId: f.root }))).toBe("notFound")
    expect(await codeOf(f.as.mutation(api.modules.shops.paymentPolicy.setPolicy, { networkId: f.root, enabled: false, reason: REASON }))).toBe("notFound")
  })

  it("refuse un mapping vers un émetteur sans périmètre catalogue local", async () => {
    const f = await fixture()
    const ids = await f.t.run(async ctx => ({
      shopId: await ctx.db.insert("shops", { networkId: f.root, ownerPersonId: f.personId, model: "products", storefront: "draft", visibility: "network", createdAt: Date.now(), updatedAt: Date.now() }),
      emitterId: await ctx.db.insert("federationEmitters", { networkId: f.root, slug: "other", environment: "sandbox", enabled: true, keyEnvName: KEY, allowedContracts: [CONTRACT], revision: 1, createdAt: Date.now(), updatedAt: Date.now() }),
    }))
    expect(await codeOf(f.as.mutation(api.modules.shops.catalogControl.configureMapping, { networkId: f.root, ...ids, enabled: false, reason: REASON }))).toBe("policyRefused")
    expect(await f.t.run(ctx => ctx.db.query("commerceCatalogMappings").take(2))).toEqual([])
  })

  it("relit la révocation de l’identité IDN avant la configuration", async () => {
    const f = await fixture()
    await f.t.run(async ctx => {
      const link = await ctx.db.query("identityLinks").withIndex("by_person_and_provider", q => q.eq("personId", f.personId).eq("provider", "idn")).unique()
      if (!link) throw new Error("Lien de fixture absent")
      await ctx.db.patch(link._id, { revokedAt: Date.now() })
    })
    expect(await codeOf(f.as.mutation(api.modules.federation.emitters.configure, f.emitterArgs))).toBe("operatorRequired")
  })
})
