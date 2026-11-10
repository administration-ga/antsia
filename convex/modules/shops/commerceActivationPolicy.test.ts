// @vitest-environment edge-runtime
/** P16 : module réel fermé, sans mock ni activation d'environnement. Scénarios écrits, non exécutés. */
import { describe, expect, it } from "vitest"
import { api, components, internal } from "../../_generated/api"
import { createTestSession, testConvex } from "../../test.setup"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { commerceActivationReady } from "./commerceActivation"
import { jobPolicyOf } from "./jobAccess"
import { paymentPolicyOpen } from "./paymentAccess"
import { servicePolicyOpen } from "./serviceAccess"

async function fixture() {
  const t = testConvex({ automaticSessions: false }), now = Date.now(), tag = crypto.randomUUID()
  const { root: networkId } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const user: unknown = await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "Recette", email: `${tag}@example.test`, emailVerified: true, createdAt: now, updatedAt: now } } })
  if (!user || typeof user !== "object" || !("_id" in user) || typeof user._id !== "string") throw new Error("Missing user fixture")
  const authUserId = user._id, subject = `trust-policy-${tag}`
  await t.mutation(components.betterAuth.adapter.create, { input: { model: "account", data: { userId: authUserId, accountId: subject, providerId: "idn", createdAt: now, updatedAt: now } } })
  await t.mutation(internal.modules.people.identity.recordIdnProof, { subject, loa: 2 })
  const sessionId = await createTestSession(t, authUserId), as = t.withIdentity({ subject: authUserId, sessionId })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await t.run(ctx => ctx.db.insert("operators", { personId, role: "platform_admin", grantedAt: now }))
  await t.mutation(internal.modules.platform.operatorAccess.recordIdnSession, { sessionId, authUserId, idnSubject: subject, loa: 2 })
  await as.mutation(api.modules.platform.operatorAccess.recordAccess, {})
  return { t, as, networkId, personId, now }
}
describe("activation commerce effectivement fermée", () => {
  it("le registre réel ferme les quatre capacités sans décision ni recette validée", () => {
    for (const capability of ["payments", "services", "applications", "storefrontAutomatic"] as const) expect(commerceActivationReady(capability)).toBe(false)
  })
  it("les anciens flags actifs ne rouvrent pas paiement, service ou candidature ; les emplois restent lisibles", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => {
      await ctx.db.insert("shopPaymentPolicies", { networkId: f.networkId, enabled: true, updatedAt: f.now })
      await ctx.db.insert("commerceServicePolicies", { networkId: f.networkId, enabled: true, updatedAt: f.now })
      await ctx.db.insert("commerceJobPolicies", { networkId: f.networkId, jobsEnabled: true, applicationsEnabled: true, updatedAt: f.now })
      expect(await paymentPolicyOpen(ctx, f.networkId)).toBe(false)
      expect(await servicePolicyOpen(ctx, f.networkId)).toBe(false)
      expect(await jobPolicyOf(ctx, f.networkId)).toEqual({ jobs: true, applications: false })
    })
  })
  it("refuse même à un administrateur toute nouvelle activation non validée", async () => {
    const f = await fixture(), reason = "Motif réel insuffisant pour remplacer une validation."
    await expect(f.as.mutation(api.modules.shops.paymentPolicy.setPolicy, { networkId: f.networkId, enabled: true, reason })).rejects.toThrow()
    await expect(f.as.mutation(api.modules.shops.servicePolicy.setPolicy, { networkId: f.networkId, enabled: true, reason })).rejects.toThrow()
    await expect(f.as.mutation(api.modules.shops.jobs.setPolicy, { networkId: f.networkId, jobsEnabled: true, applicationsEnabled: true, reason })).rejects.toThrow()
    await f.t.run(async (ctx) => {
      expect(await ctx.db.query("shopPaymentPolicies").withIndex("by_network", q => q.eq("networkId", f.networkId)).take(1)).toEqual([])
      expect(await ctx.db.query("commerceServicePolicies").withIndex("by_network", q => q.eq("networkId", f.networkId)).take(1)).toEqual([])
      expect(await ctx.db.query("commerceJobPolicies").withIndex("by_network", q => q.eq("networkId", f.networkId)).take(1)).toEqual([])
    })
  })
  it("permet la fermeture motivée et l'affichage d'emplois sans ouvrir les candidatures", async () => {
    const f = await fixture(), reason = "Fermer les nouveaux effets et conserver la lecture autorisée."
    await f.as.mutation(api.modules.shops.paymentPolicy.setPolicy, { networkId: f.networkId, enabled: false, reason })
    await f.as.mutation(api.modules.shops.servicePolicy.setPolicy, { networkId: f.networkId, enabled: false, reason })
    await f.as.mutation(api.modules.shops.jobs.setPolicy, { networkId: f.networkId, jobsEnabled: true, applicationsEnabled: false, reason })
    expect(await f.t.run(ctx => jobPolicyOf(ctx, f.networkId))).toEqual({ jobs: true, applications: false })
    const audit = await f.t.run(ctx => ctx.db.query("engineAudit").withIndex("by_network_at", q => q.eq("networkId", f.networkId)).take(20))
    expect(audit.filter(row => ["payment.policy_set", "service.policy_set", "job.policy_set"].includes(row.action))).toHaveLength(3)
  })
})
