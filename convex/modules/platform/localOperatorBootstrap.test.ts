// @vitest-environment edge-runtime
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "../../_generated/api"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, testConvex } from "../../test.setup"
import * as audit from "./audit"
import { LOCAL_OPERATOR_BOOTSTRAP_CONFIRMATION, LOCAL_OPERATOR_BOOTSTRAP_MAX_AGE_MS } from "./localOperatorBootstrap"

const REASON = "Amorçage local explicitement demandé par le propriétaire."
type T = ReturnType<typeof testConvex>
function idOf(value: unknown): string {
  if (!value || typeof value !== "object" || !("_id" in value) || typeof value._id !== "string") throw new Error("Document de fixture absent")
  return value._id
}
async function fixture({ emailVerified = true, idn = true, sealed = true, membership = true, loa = 2 }: {
  emailVerified?: boolean; idn?: boolean; sealed?: boolean; membership?: boolean; loa?: 1 | 2 | 3
} = {}) {
  const t = testConvex({ automaticSessions: false })
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const now = Date.now(), email = crypto.randomUUID() + "@example.test", idnSubject = "idn-" + crypto.randomUUID()
  const authUserId = idOf(await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: {
    name: "Identité de fixture", email, emailVerified, createdAt: now, updatedAt: now,
  } } }))
  if (idn) {
    await t.mutation(components.betterAuth.adapter.create, { input: { model: "account", data: {
      userId: authUserId, accountId: idnSubject, providerId: "idn", createdAt: now, updatedAt: now,
    } } })
    await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: idnSubject, loa })
  }
  const sessionId = await createTestSession(t, authUserId)
  const as = t.withIdentity({ subject: authUserId, sessionId })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  const membershipId = membership ? await t.run(ctx => ctx.db.insert("networkMemberships", {
    networkId: root, personId, status: idn && loa >= 2 ? "verifiee" : "declaree", role: "member", joinedAt: now, statusChangedAt: now,
  })) : null
  if (idn && sealed) await t.mutation(internal.modules.platform.operatorAccess.recordIdnSession, { sessionId, authUserId, idnSubject, loa })
  const proof = await t.run(ctx => ctx.db.query("operatorSessionProofs").withIndex("by_session", q => q.eq("sessionId", sessionId)).unique())
  return { t, root, email, authUserId, sessionId, personId, idnSubject, membershipId, proofId: proof?._id ?? null }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
const args = (f: Fixture) => ({ email: f.email, confirmNonProduction: LOCAL_OPERATOR_BOOTSTRAP_CONFIRMATION, reason: REASON })
async function state(t: T) {
  return t.run(async ctx => ({
    operators: await ctx.db.query("operators").take(3), audit: await ctx.db.query("engineAudit").take(5),
    persons: await ctx.db.query("persons").take(5), memberships: await ctx.db.query("networkMemberships").take(5),
    links: await ctx.db.query("identityLinks").take(10), idnProofs: await ctx.db.query("idnProofs").take(5),
    sessionProofs: await ctx.db.query("operatorSessionProofs").take(25),
  }))
}
async function refused(f: Fixture, overrides: Partial<ReturnType<typeof args>> = {}, expected = "operatorRequired") {
  const before = await state(f.t)
  let errorCode: string | null = null
  try { await f.t.mutation(internal.modules.platform.localOperatorBootstrap.run, { ...args(f), ...overrides }) }
  catch (error) { errorCode = engineErrorCode(error) }
  expect(errorCode).toBe(expected)
  expect(await state(f.t)).toEqual(before)
}

beforeEach(() => {
  vi.stubEnv("ANTSIA_DEV_TOOLS", "true")
  vi.stubEnv("ANTIA_DEV_TOOLS", "false")
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3260")
  vi.stubEnv("CONVEX_SITE_URL", "http://127.0.0.1:3261")
  vi.stubEnv("ANTSIA_LOCAL_COMMERCE_LOA1", undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe("amorçage interne du premier opérateur local", () => {
  it("relit la vraie session IDN forte sans identité CLI simulée et écrit une seule décision atomique", async () => {
    const f = await fixture(), before = await state(f.t)
    const result = await f.t.mutation(internal.modules.platform.localOperatorBootstrap.run, { ...args(f), email: ` ${f.email.toUpperCase()} ` })
    expect(result).toMatchObject({ personId: f.personId, changed: true })
    const after = await state(f.t)
    expect(after.operators).toEqual([expect.objectContaining({ _id: result.operatorId, personId: f.personId, role: "platform_admin", grantedAt: expect.any(Number) })])
    expect(after.audit).toEqual([expect.objectContaining({ action: "operator.bootstrap", capacity: "system", subjectTable: "operators", subjectId: result.operatorId, details: { reason: REASON } })])
    expect(after.audit[0]!.actorPersonId).toBeUndefined()
    expect(JSON.stringify(after.audit)).not.toContain(f.email)
    expect(JSON.stringify(after.audit)).not.toContain(f.sessionId)
    expect({ ...after, operators: before.operators, audit: before.audit }).toEqual(before)
  })
  it.each([
    ["ANTSIA_DEV_TOOLS", "false"], ["CONVEX_CLOUD_URL", "https://cloud.example"],
    ["CONVEX_SITE_URL", "https://cloud.example"], ["CONVEX_SITE_URL", ""],
    ["CONVEX_SITE_URL", "http://localhost:3261/path"],
  ])("refuse la garde locale %s=%s", async (name, value) => {
    const f = await fixture(); vi.stubEnv(name, value)
    await refused(f, {}, "policyRefused")
  })
  it("refuse une phrase de confirmation différente", async () => {
    await refused(await fixture(), { confirmNonProduction: "non" }, "policyRefused")
  })
  it.each(["court", "x".repeat(501), "Autoriser une adresse exemple@example.test", "Motif avec\nune ligne supplémentaire"])('refuse un motif non borné ou contenant une adresse : %j', async reason => {
    await refused(await fixture(), { reason }, "invalidArgument")
  })
  it("refuse une autre adresse sans créer sa personne", async () => {
    await refused(await fixture(), { email: crypto.randomUUID() + "@example.test" })
  })
  it("refuse une adresse non vérifiée", async () => { await refused(await fixture({ emailVerified: false })) })
  it("refuse le compte OTP seul", async () => { await refused(await fixture({ idn: false })) })
  it("refuse un lien fort sans preuve de session scellée", async () => { await refused(await fixture({ sealed: false })) })
  it.each(["lowLoa", "old", "future", "expired", "foreignAuth", "unbound"] as const)("refuse la preuve de session %s malgré le lien IDN fort", async kind => {
    const f = await fixture()
    if (!f.proofId) throw new Error("Preuve de fixture absente")
    await f.t.run(async ctx => {
      if (kind === "lowLoa") await ctx.db.patch(f.proofId!, { loa: 1 })
      if (kind === "old") await ctx.db.patch(f.proofId!, { observedAt: Date.now() - LOCAL_OPERATOR_BOOTSTRAP_MAX_AGE_MS - 1 })
      if (kind === "future") await ctx.db.patch(f.proofId!, { observedAt: Date.now() + 60_000 })
      if (kind === "expired") await ctx.db.patch(f.proofId!, { expiresAt: Date.now() - 1 })
      if (kind === "foreignAuth") await ctx.db.patch(f.proofId!, { authUserId: "foreign-auth-user" })
      if (kind === "unbound") await ctx.db.patch(f.proofId!, { personId: undefined })
    })
    await refused(f)
  })
  it("refuse la session Better Auth supprimée malgré sa preuve persistée", async () => {
    const f = await fixture()
    await f.t.mutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: f.sessionId }] } })
    await refused(f)
  })
  it("refuse la preuve IDN courante descendue à LoA1 sans se fier à un ancien lien LoA2", async () => {
    const f = await fixture()
    await f.t.run(async ctx => {
      const proof = await ctx.db.query("idnProofs").withIndex("by_subject", q => q.eq("subject", f.idnSubject)).unique()
      if (!proof) throw new Error("Preuve IDN de fixture absente")
      await ctx.db.patch(proof._id, { loa: 1 })
    })
    await refused(f)
  })
  it.each(["suspendue", "partie"] as const)("refuse l'adhésion racine %s", async status => {
    const f = await fixture()
    if (!f.membershipId) throw new Error("Adhésion de fixture absente")
    await f.t.run(ctx => ctx.db.patch(f.membershipId!, { status }))
    await refused(f)
  })
  it("refuse l'absence d'adhésion racine", async () => { await refused(await fixture({ membership: false })) })
  it.each(["erasedAt", "deletionRequestedAt"] as const)("refuse la personne marquée %s", async field => {
    const f = await fixture()
    await f.t.run(ctx => ctx.db.patch(f.personId, { [field]: Date.now() }))
    await refused(f)
  })
  it("refuse une personne dupliquée pour le même compte Auth", async () => {
    const f = await fixture()
    await f.t.run(ctx => ctx.db.insert("persons", { authUserId: f.authUserId, createdAt: Date.now(), updatedAt: Date.now() }))
    await refused(f)
  })
  it.each(["otherRole", "revokedTarget", "otherOperator", "revokedOther", "duplicateTarget"] as const)("refuse toute collision opérateur %s", async kind => {
    const f = await fixture()
    await f.t.run(async ctx => {
      const otherPersonId = kind === "otherOperator" || kind === "revokedOther"
        ? await ctx.db.insert("persons", { authUserId: "unrelated-auth-user", createdAt: Date.now(), updatedAt: Date.now() }) : f.personId
      await ctx.db.insert("operators", { personId: otherPersonId, role: kind === "otherRole" ? "platform_operator" : "platform_admin", grantedAt: Date.now(),
        ...(kind === "revokedTarget" || kind === "revokedOther" ? { revokedAt: Date.now() } : {}) })
      if (kind === "duplicateTarget") await ctx.db.insert("operators", { personId: f.personId, role: "platform_admin", grantedAt: Date.now() })
    })
    await refused(f)
  })
  it("ne cherche pas au-delà des vingt dernières preuves de la personne", async () => {
    const f = await fixture()
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1_000)
    await f.t.run(async ctx => {
      for (let index = 0; index < 20; index += 1) await ctx.db.insert("operatorSessionProofs", {
        personId: f.personId, authUserId: f.authUserId, idnSubject: f.idnSubject, sessionId: "expired-" + index,
        loa: 2, observedAt: Date.now(), expiresAt: Date.now() - 1,
      })
    })
    await refused(f)
  })
  it("le rejeu du seul administrateur actif garde les références et n'ajoute aucun audit", async () => {
    const f = await fixture()
    const first = await f.t.mutation(internal.modules.platform.localOperatorBootstrap.run, args(f)), before = await state(f.t)
    const second = await f.t.mutation(internal.modules.platform.localOperatorBootstrap.run, { ...args(f), reason: "Relecture de l’amorçage local déjà effectué." })
    expect(second).toEqual({ ...first, changed: false })
    expect(await state(f.t)).toEqual(before)
  })
  it("annule le rôle si l'écriture atomique de l'audit échoue", async () => {
    const f = await fixture(), before = await state(f.t)
    vi.spyOn(audit, "appendAudit").mockRejectedValueOnce(new Error("audit unavailable"))
    await expect(f.t.mutation(internal.modules.platform.localOperatorBootstrap.run, args(f))).rejects.toThrow("audit unavailable")
    expect(await state(f.t)).toEqual(before)
  })
})

function enableLocalCommerceLoa1(): void {
  const environment = {
    ANTSIA_LOCAL_COMMERCE_LOA1: "true",
    FEDERATION_ENVIRONMENT: "sandbox",
    ANTSIA_COMMERCE_ENVIRONMENT: "sandbox",
    ANTSIA_COMMERCE_SOURCE: "antsia-local",
    ANTSIA_COMMERCE_ORIGIN: "http://localhost:3030",
    ANTSIA_COMMERCE_PRO_HTTP_ORIGIN: "http://127.0.0.1:3221",
    ANTSIA_COMMERCE_PRO_APP_ORIGIN: "http://localhost:3022",
    IDN_CLIENT_ID: "antsia-local_sbx_fixture",
  }
  for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value)
}

describe("amorçage Niveau1 du seul raccord commerce sandbox local", () => {
  it("admet une vraie session IDN1 seulement avec la configuration locale complète, sans changer l'identité", async () => {
    enableLocalCommerceLoa1()
    const f = await fixture({ loa: 1 }), before = await state(f.t)
    const result = await f.t.mutation(internal.modules.platform.localOperatorBootstrap.run, args(f))
    expect(result).toMatchObject({ personId: f.personId, changed: true })
    const after = await state(f.t)
    expect(after.operators).toEqual([expect.objectContaining({ _id: result.operatorId, personId: f.personId, role: "platform_admin" })])
    expect(after.audit).toEqual([expect.objectContaining({ action: "operator.bootstrap", capacity: "system", subjectId: result.operatorId, details: { reason: REASON } })])
    expect({ ...after, operators: before.operators, audit: before.audit }).toEqual(before)
    expect((await f.t.withIdentity({ subject: f.authUserId, sessionId: f.sessionId }).query(api.modules.people.persons.getMyPerson, {}))?.badges).toEqual(["community"])
    const replay = await f.t.mutation(internal.modules.platform.localOperatorBootstrap.run, args(f))
    expect(replay).toEqual({ ...result, changed: false })
    expect(await state(f.t)).toEqual(after)
  })

  it.each([
    ["ANTSIA_LOCAL_COMMERCE_LOA1", undefined, "operatorRequired"],
    ["ANTSIA_LOCAL_COMMERCE_LOA1", "false", "operatorRequired"],
    ["ANTSIA_DEV_TOOLS", "false", "policyRefused"],
    ["CONVEX_CLOUD_URL", "https://cloud.example", "policyRefused"],
    ["CONVEX_SITE_URL", "https://site.example", "policyRefused"],
    ["FEDERATION_ENVIRONMENT", "production", "operatorRequired"],
    ["ANTSIA_COMMERCE_ENVIRONMENT", "production", "operatorRequired"],
    ["ANTSIA_COMMERCE_SOURCE", "antsia-remote", "operatorRequired"],
    ["ANTSIA_COMMERCE_ORIGIN", "https://application.example", "operatorRequired"],
    ["ANTSIA_COMMERCE_PRO_HTTP_ORIGIN", "https://producer.example", "operatorRequired"],
    ["ANTSIA_COMMERCE_PRO_APP_ORIGIN", "https://producer.example", "operatorRequired"],
    ["IDN_CLIENT_ID", "antsia-local_prd_fixture", "operatorRequired"],
  ] as const)("Niveau1 reste refusé pour %s=%s", async (name, value, expected) => {
    enableLocalCommerceLoa1()
    const f = await fixture({ loa: 1 })
    vi.stubEnv(name, value)
    await refused(f, {}, expected)
  })

  it.each([
    { idn: false }, { sealed: false }, { emailVerified: false }, { membership: false },
  ])("la configuration locale ne remplace aucune preuve ou admission (%j)", async options => {
    enableLocalCommerceLoa1()
    await refused(await fixture({ ...options, loa: 1 }))
  })

  it.each(["revokedLink", "missingCurrentProof", "expiredSessionProof", "revokedSession", "old", "future", "foreignAuth", "unbound"] as const)("refuse la session IDN1 %s", async kind => {
    enableLocalCommerceLoa1()
    const f = await fixture({ loa: 1 })
    if (!f.proofId) throw new Error("Preuve de fixture absente")
    if (kind === "revokedSession") await f.t.mutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: f.sessionId }] } })
    else await f.t.run(async ctx => {
      if (kind === "revokedLink") {
        const link = await ctx.db.query("identityLinks").withIndex("by_person_and_provider", q => q.eq("personId", f.personId).eq("provider", "idn")).unique()
        if (!link) throw new Error("Lien IDN de fixture absent")
        await ctx.db.patch(link._id, { revokedAt: Date.now() })
      }
      if (kind === "missingCurrentProof") {
        const proof = await ctx.db.query("idnProofs").withIndex("by_subject", q => q.eq("subject", f.idnSubject)).unique()
        if (!proof) throw new Error("Preuve IDN de fixture absente")
        await ctx.db.delete(proof._id)
      }
      if (kind === "expiredSessionProof") await ctx.db.patch(f.proofId!, { expiresAt: Date.now() - 1 })
      if (kind === "old") await ctx.db.patch(f.proofId!, { observedAt: Date.now() - LOCAL_OPERATOR_BOOTSTRAP_MAX_AGE_MS - 1 })
      if (kind === "future") await ctx.db.patch(f.proofId!, { observedAt: Date.now() + 60_000 })
      if (kind === "foreignAuth") await ctx.db.patch(f.proofId!, { authUserId: "foreign-auth-user" })
      if (kind === "unbound") await ctx.db.patch(f.proofId!, { personId: undefined })
    })
    await refused(f)
  })

  it("annule aussi le rôle IDN1 si son audit atomique échoue", async () => {
    enableLocalCommerceLoa1()
    const f = await fixture({ loa: 1 }), before = await state(f.t)
    vi.spyOn(audit, "appendAudit").mockRejectedValueOnce(new Error("audit unavailable"))
    await expect(f.t.mutation(internal.modules.platform.localOperatorBootstrap.run, args(f))).rejects.toThrow("audit unavailable")
    expect(await state(f.t)).toEqual(before)
  })
})
