// @vitest-environment edge-runtime
import { describe, expect, it, vi } from "vitest"
import { api, components, internal } from "../../_generated/api"
import { createTestSession, testConvex } from "../../test.setup"
import { SEED_CONFIRMATION } from "../../seeds/foundations"

async function fixture(role: "platform_admin" | "platform_operator" = "platform_admin") {
  const t = testConvex({ automaticSessions: false }), now = Date.now(), tag = crypto.randomUUID()
  const { root: networkId } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const user: unknown = await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "Recette", email: `${tag}@example.test`, emailVerified: true, createdAt: now, updatedAt: now } } })
  if (!user || typeof user !== "object" || !("_id" in user) || typeof user._id !== "string") throw new Error("Missing user fixture")
  const authUserId = user._id, subject = `payment-policy-${tag}`
  await t.mutation(components.betterAuth.adapter.create, { input: { model: "account", data: { userId: authUserId, accountId: subject, providerId: "idn", createdAt: now, updatedAt: now } } })
  await t.mutation(internal.modules.people.identity.recordIdnProof, { subject, loa: 2 })
  const sessionId = await createTestSession(t, authUserId), as = t.withIdentity({ subject: authUserId, sessionId })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await t.run(ctx => ctx.db.insert("operators", { personId, role, grantedAt: now }))
  await t.mutation(internal.modules.platform.operatorAccess.recordIdnSession, { sessionId, authUserId, idnSubject: subject, loa: 2 })
  await as.mutation(api.modules.platform.operatorAccess.recordAccess, {})
  return { t, as, personId, networkId }
}

describe("P12 — activation de paiement tracée", () => {
  it("reste fermée sans ligne, puis conserve une seule configuration et un audit par décision", async () => {
    const f = await fixture()
    expect(await f.as.query(api.modules.shops.paymentPolicy.getPolicy, { networkId: f.networkId })).toEqual({ networkId: f.networkId, enabled: false, configured: false, updatedAt: null })
    await f.as.mutation(api.modules.shops.paymentPolicy.setPolicy, { networkId: f.networkId, enabled: true, reason: "Activation sandbox après décision explicite." })
    await f.as.mutation(api.modules.shops.paymentPolicy.setPolicy, { networkId: f.networkId, enabled: false, reason: "Fermeture du paiement après décision explicite." })
    expect(await f.as.query(api.modules.shops.paymentPolicy.getPolicy, { networkId: f.networkId })).toMatchObject({ enabled: false, configured: true })
    expect(await f.t.run(ctx => ctx.db.query("shopPaymentPolicies").withIndex("by_network", q => q.eq("networkId", f.networkId)).take(2))).toHaveLength(1)
    const audit = await f.t.run(ctx => ctx.db.query("engineAudit").withIndex("by_network_at", q => q.eq("networkId", f.networkId)).take(20))
    expect(audit.filter(row => row.action === "payment.policy_set")).toHaveLength(2)
    expect(audit.filter(row => row.action === "payment.policy_set").map(row => row.details?.enabled)).toEqual([true, false])
    expect(audit.filter(row => row.action === "payment.policy_set").every(row => row.actorPersonId === f.personId && row.subjectTable === "networks")).toBe(true)
  })
  it("refuse un motif insuffisant et un opérateur sans autorité de plateforme", async () => {
    const f = await fixture()
    await expect(f.as.mutation(api.modules.shops.paymentPolicy.setPolicy, { networkId: f.networkId, enabled: true, reason: "court" })).rejects.toThrow()
    expect(await f.t.run(ctx => ctx.db.query("shopPaymentPolicies").take(1))).toEqual([])
    const operator = await fixture("platform_operator")
    await expect(operator.as.query(api.modules.shops.paymentPolicy.getPolicy, { networkId: operator.networkId })).rejects.toThrow()
    await expect(operator.as.mutation(api.modules.shops.paymentPolicy.setPolicy, { networkId: operator.networkId, enabled: true, reason: "Tentative sans autorité de configuration." })).rejects.toThrow()
    expect(await operator.t.run(ctx => ctx.db.query("shopPaymentPolicies").take(1))).toEqual([])
    await expect(operator.t.query(api.modules.shops.paymentPolicy.getPolicy, { networkId: operator.networkId })).rejects.toThrow()
  })
})

// P16 : validation fictive EN TEST pour préserver les scénarios historiques.
// Aucun contournement d'environnement ni activation en source applicative.
vi.mock("./commerceActivation", async (importOriginal) => ({
  ...await importOriginal<typeof import("./commerceActivation")>(),
  commerceActivationReady: () => true,
}))
