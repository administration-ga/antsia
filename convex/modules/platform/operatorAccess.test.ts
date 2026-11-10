// @vitest-environment edge-runtime
/** PA7 : autorité serveur réelle, audit préalable et archivage à deux personnes. */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { CONSOLE_MIN_LOA } from "@antsia/social-domain/badges"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
const SETTINGS = { name: "Réseau de recette", membershipPolicy: "open" as const, defaultVisibility: "network" as const, reachValues: [], theme: "antsia" }
const REASON = "Archivage validé après examen des activités."
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

function idOf(row: unknown): string {
  if (!row || typeof row !== "object" || !("_id" in row) || typeof row._id !== "string") throw new Error("Document de fixture absent")
  return row._id
}

async function actor(t: T, { loa = 2, sealed = true, logged = true, role = "platform_admin" }: { loa?: 1 | 2 | 3; sealed?: boolean; logged?: boolean; role?: "platform_admin" | "platform_operator" | null } = {}) {
  const now = Date.now(), tag = crypto.randomUUID()
  const authUserId = idOf(await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "État civil non recopié", email: tag + "@example.test", emailVerified: true, createdAt: now, updatedAt: now } } }))
  const idnSubject = "idn-" + tag
  await t.mutation(components.betterAuth.adapter.create, { input: { model: "account", data: { userId: authUserId, accountId: idnSubject, providerId: "idn", createdAt: now, updatedAt: now } } })
  await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: idnSubject, loa })
  const sessionId = await createTestSession(t, authUserId)
  const as = t.withIdentity({ subject: authUserId, sessionId })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  const operatorId = role ? await t.run(async (ctx) => await ctx.db.insert("operators", { personId, role, grantedAt: now })) : null
  if (sealed) await t.mutation(internal.modules.platform.operatorAccess.recordIdnSession, { sessionId, authUserId, idnSubject, loa })
  if (logged && sealed && role && loa >= CONSOLE_MIN_LOA) await as.mutation(api.modules.platform.operatorAccess.recordAccess, {})
  return { as, personId, authUserId, idnSubject, sessionId, operatorId }
}

async function fixture() {
  const t = testConvex({ automaticSessions: false })
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const first = await actor(t), second = await actor(t)
  const networkId = await first.as.mutation(api.modules.networks.networks.create, { slug: "console-recette", kind: "closed", ...SETTINGS, reason: "Créer le réseau demandé pour la recette." })
  return { t, root, first, second, networkId }
}

async function code(promise: Promise<unknown>) {
  try { await promise; return null } catch (error) { return engineErrorCode(error) }
}

async function archiveRequest(f: Awaited<ReturnType<typeof fixture>>) {
  return await f.first.as.mutation(api.modules.networks.networks.requestArchive, { networkId: f.networkId, reason: REASON })
}

describe("console : session IDN forte et habilitation actuelle", () => {
  it("refuse un anonyme et une session sans rôle", async () => {
    const t = testConvex({ automaticSessions: false })
    expect(await code(t.query(api.modules.platform.operatorAccess.myOperator, {}))).toBe("unauthenticated")
    const plain = await actor(t, { role: null })
    expect(await code(plain.as.query(api.modules.platform.operatorAccess.myOperator, {}))).toBe("operatorRequired")
  })

  it("un ancien lien IDN fort ne transforme pas un OTP en connexion de console", async () => {
    const t = testConvex({ automaticSessions: false }), otp = await actor(t, { sealed: false })
    expect((await otp.as.query(api.modules.people.persons.getMyPerson, {}))?.badges).toContain("verified")
    expect(await code(otp.as.query(api.modules.networks.networks.listForConsole, {}))).toBe("operatorRequired")
    expect(await code(otp.as.mutation(api.modules.networks.networks.create, { slug: "usurpation", kind: "root", ...SETTINGS }))).toBe("operatorRequired")
    expect(await t.run(async (ctx) => ctx.db.query("networks").take(1))).toEqual([])
  })

  it("ADR-0039 : le niveau 1 ouvre la console avec session scellée et habilitation vivante, sans le badge Vérifié", async () => {
    expect(CONSOLE_MIN_LOA).toBe(1)
    const t = testConvex({ automaticSessions: false }), low = await actor(t, { loa: 1, logged: false })
    expect((await low.as.query(api.modules.platform.operatorAccess.myOperator, {})).role).toBe("platform_admin")
    await low.as.mutation(api.modules.platform.operatorAccess.recordAccess, {})
    expect(await low.as.query(api.modules.networks.networks.listForConsole, {})).toEqual([])
    // Le badge Vérifié et les agents publics gardent le niveau 2.
    expect((await low.as.query(api.modules.people.persons.getMyPerson, {}))?.badges ?? []).not.toContain("verified")
    // Le même niveau, sans habilitation, ne donne rien.
    const plain = await actor(t, { loa: 1, role: null })
    expect(await code(plain.as.query(api.modules.platform.operatorAccess.myOperator, {}))).toBe("operatorRequired")
  })

  it("l'accès doit être journalisé avant toute donnée et le journal est idempotent par session", async () => {
    const t = testConvex({ automaticSessions: false }), op = await actor(t, { logged: false })
    expect((await op.as.query(api.modules.platform.operatorAccess.myOperator, {})).role).toBe("platform_admin")
    expect(await code(op.as.query(api.modules.networks.networks.listForConsole, {}))).toBe("operatorRequired")
    await op.as.mutation(api.modules.platform.operatorAccess.recordAccess, {})
    await op.as.mutation(api.modules.platform.operatorAccess.recordAccess, {})
    expect(await op.as.query(api.modules.networks.networks.listForConsole, {})).toEqual([])
    const audit = await t.run(async (ctx) => ctx.db.query("engineAudit").take(3))
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ action: "console.access", actorPersonId: op.personId })
    expect(JSON.stringify(audit)).not.toContain(op.sessionId)
    expect(JSON.stringify(audit)).not.toContain(op.idnSubject)
  })

  it.each(["operator", "link", "loa", "session", "proof"] as const)("la révocation de %s ferme immédiatement les lectures", async (kind) => {
    const t = testConvex({ automaticSessions: false }), op = await actor(t)
    await t.run(async (ctx) => {
      if (kind === "operator" && op.operatorId) await ctx.db.patch(op.operatorId, { revokedAt: Date.now() })
      if (kind === "link") {
        const row = await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", op.personId).eq("provider", "idn")).unique()
        if (row) await ctx.db.patch(row._id, { revokedAt: Date.now() })
      }
      if (kind === "loa") {
        // Une preuve IDN qui perd son niveau ne garde aucune autorité, même au seuil de 1 (ADR-0039).
        const row = await ctx.db.query("idnProofs").withIndex("by_subject", (q) => q.eq("subject", op.idnSubject)).unique()
        if (row) await ctx.db.patch(row._id, { loa: undefined })
      }
      if (kind === "proof") {
        const row = await ctx.db.query("operatorSessionProofs").withIndex("by_session", (q) => q.eq("sessionId", op.sessionId)).unique()
        if (row) await ctx.db.patch(row._id, { expiresAt: Date.now() - 1 })
      }
    })
    if (kind === "session") await t.mutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: op.sessionId }] } })
    expect(await code(op.as.query(api.modules.platform.operatorAccess.myOperator, {}))).toBe(kind === "session" ? "unauthenticated" : "operatorRequired")
  })

  it("une preuve scellée n'est pas transmissible à une autre session du même utilisateur", async () => {
    const t = testConvex({ automaticSessions: false }), op = await actor(t)
    const secondSession = await createTestSession(t, op.authUserId)
    const weak = t.withIdentity({ subject: op.authUserId, sessionId: secondSession })
    expect(await code(weak.query(api.modules.platform.operatorAccess.myOperator, {}))).toBe("operatorRequired")
    expect(await code(t.mutation(internal.modules.platform.operatorAccess.recordIdnSession, { sessionId: op.sessionId, authUserId: "foreign-user", idnSubject: op.idnSubject, loa: 2 }))).toBe("operatorRequired")
  })

  it.each(["suspendue", "partie"] as const)("le statut racine %s ferme aussi la console d'un administrateur habilité", async (status) => {
    const t = testConvex({ automaticSessions: false })
    const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
    const op = await actor(t)
    await t.run(async (ctx) => await ctx.db.insert("networkMemberships", { networkId: root, personId: op.personId, status, role: "member", joinedAt: Date.now(), statusChangedAt: Date.now() }))
    expect(await code(op.as.query(api.modules.platform.operatorAccess.myOperator, {}))).toBe("operatorRequired")
    expect(await code(op.as.mutation(api.modules.networks.networks.create, { slug: "racine-refusee", kind: "closed", ...SETTINGS }))).toBe("operatorRequired")
  })

  it("un opérateur peut lire mais ne reçoit pas les droits de configuration", async () => {
    const { t, networkId } = await fixture(), op = await actor(t, { role: "platform_operator" })
    expect((await op.as.query(api.modules.networks.networks.listForConsole, {})).some((row) => row._id === networkId)).toBe(true)
    expect(await code(op.as.mutation(api.modules.networks.networks.update, { networkId, ...SETTINGS }))).toBe("operatorRequired")
    expect(await code(op.as.mutation(api.modules.networks.networks.requestArchive, { networkId, reason: REASON }))).toBe("operatorRequired")
    expect(await code(op.as.mutation(api.modules.pages.admin.createInstitutionPage, { networkId, name: "Institution fictive", reason: REASON }))).toBe("operatorRequired")
  })
})

describe("réseaux : demande et double validation transactionnelle", () => {
  it("sans demande ni seconde personne, l'archivage n'a aucun effet", async () => {
    const f = await fixture()
    expect(await code(f.first.as.mutation(api.modules.networks.networks.archive, { networkId: f.networkId, reason: REASON }))).toBe("policyRefused")
    const request = await archiveRequest(f)
    expect(await code(f.first.as.mutation(api.modules.networks.networks.archive, { networkId: f.networkId, reason: REASON, ...request }))).toBe("policyRefused")
    expect((await f.t.run(async (ctx) => ctx.db.get(request.archiveRequestId)))?.status).toBe("pending")
    expect((await f.t.run(async (ctx) => ctx.db.get(f.networkId)))?.status).toBe("active")
  })

  it("deux administrateurs distincts approuvent une fois, la projection publique disparaît", async () => {
    const f = await fixture(), request = await archiveRequest(f)
    expect(await archiveRequest(f)).toEqual(request)
    await f.second.as.mutation(api.modules.networks.networks.archive, { networkId: f.networkId, reason: REASON, ...request })
    expect(await f.t.query(api.modules.networks.networks.getBySlug, { slug: "console-recette" })).toBeNull()
    expect((await f.t.run(async (ctx) => ctx.db.get(request.archiveRequestId)))?.approvedByPersonId).toBe(f.second.personId)
    expect(await code(f.second.as.mutation(api.modules.networks.networks.archive, { networkId: f.networkId, reason: REASON, ...request }))).toBe("notFound")
    const audits = await f.t.run(async (ctx) => ctx.db.query("engineAudit").withIndex("by_network_at", (q) => q.eq("networkId", f.networkId)).take(10))
    expect(audits.filter((row) => row.action === "network.archive")).toHaveLength(1)
    const archiveAudit = audits.find((row) => row.action === "network.archive")
    expect(archiveAudit?.details).toMatchObject({ archiveRequestId: request.archiveRequestId })
    // La référence personnelle reste typée et effaçable dans la demande.
    expect(JSON.stringify(archiveAudit?.details)).not.toContain(f.first.personId)
    expect((await f.t.run(async (ctx) => ctx.db.get(request.archiveRequestId)))?.requestedByPersonId).toBe(f.first.personId)
  })

  it("après reconnexion, le même motif crée une demande liée à la nouvelle session", async () => {
    const f = await fixture(), previous = await archiveRequest(f)
    await f.t.mutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: f.first.sessionId }] } })
    const sessionId = await createTestSession(f.t, f.first.authUserId)
    const reconnected = f.t.withIdentity({ subject: f.first.authUserId, sessionId })
    await f.t.mutation(internal.modules.people.identity.recordIdnProof, { subject: f.first.idnSubject, loa: 2 })
    await f.t.mutation(internal.modules.platform.operatorAccess.recordIdnSession, { sessionId, authUserId: f.first.authUserId, idnSubject: f.first.idnSubject, loa: 2 })
    await reconnected.mutation(api.modules.platform.operatorAccess.recordAccess, {})
    const current = await reconnected.mutation(api.modules.networks.networks.requestArchive, { networkId: f.networkId, reason: REASON })
    expect(current.archiveRequestId).not.toBe(previous.archiveRequestId)
    expect(await code(f.second.as.mutation(api.modules.networks.networks.archive, { networkId: f.networkId, reason: REASON, ...previous }))).toBe("policyRefused")
    await f.second.as.mutation(api.modules.networks.networks.archive, { networkId: f.networkId, reason: REASON, ...current })
    expect((await f.t.run(async (ctx) => ctx.db.get(f.networkId)))?.status).toBe("archived")
  })

  it("un réglage modifié dans la même milliseconde invalide la demande", async () => {
    vi.useFakeTimers()
    const f = await fixture(), request = await archiveRequest(f)
    await f.first.as.mutation(api.modules.networks.networks.update, { networkId: f.networkId, ...SETTINGS, name: "Nouvelle politique", reason: REASON })
    expect(await code(f.second.as.mutation(api.modules.networks.networks.archive, { networkId: f.networkId, reason: REASON, ...request }))).toBe("conflict")
    expect((await f.t.run(async (ctx) => ctx.db.get(f.networkId)))?.status).toBe("active")
  })

  it("une demande expirée ou annulée ne peut pas être approuvée", async () => {
    vi.useFakeTimers()
    const f = await fixture(), expired = await archiveRequest(f)
    vi.setSystemTime(Date.now() + 15 * 60_000 + 1)
    expect(await f.second.as.query(api.modules.networks.networks.listArchiveRequests, { networkId: f.networkId })).toEqual([])
    expect(await code(f.second.as.mutation(api.modules.networks.networks.archive, { networkId: f.networkId, reason: REASON, ...expired }))).toBe("policyRefused")
    const cancelled = await archiveRequest(f)
    expect(cancelled.archiveRequestId).not.toBe(expired.archiveRequestId)
    await f.first.as.mutation(api.modules.networks.networks.cancelArchiveRequest, { ...cancelled, reason: REASON })
    expect(await code(f.second.as.mutation(api.modules.networks.networks.archive, { networkId: f.networkId, reason: REASON, ...cancelled }))).toBe("policyRefused")
  })

  it.each(["operator", "session", "identity"] as const)("la seconde décision relit la première autorité : %s", async (kind) => {
    const f = await fixture(), request = await archiveRequest(f)
    if (kind === "session") await f.t.mutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: f.first.sessionId }] } })
    else await f.t.run(async (ctx) => {
      if (kind === "operator" && f.first.operatorId) await ctx.db.patch(f.first.operatorId, { revokedAt: Date.now() })
      if (kind === "identity") {
        const row = await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", f.first.personId).eq("provider", "idn")).unique()
        if (row) await ctx.db.patch(row._id, { revokedAt: Date.now() })
      }
    })
    expect(await code(f.second.as.mutation(api.modules.networks.networks.archive, { networkId: f.networkId, reason: REASON, ...request }))).toBe("policyRefused")
    expect((await f.t.run(async (ctx) => ctx.db.get(f.networkId)))?.status).toBe("active")
  })

  it("la demande d'un autre réseau et la racine sont refusées", async () => {
    const f = await fixture(), request = await archiveRequest(f)
    const other = await f.first.as.mutation(api.modules.networks.networks.create, { slug: "console-autre", kind: "closed", ...SETTINGS })
    expect(await code(f.second.as.mutation(api.modules.networks.networks.archive, { networkId: other, reason: REASON, ...request }))).toBe("policyRefused")
    expect(await code(f.first.as.mutation(api.modules.networks.networks.requestArchive, { networkId: f.root, reason: REASON }))).toBe("invalidArgument")
  })

  it("un réseau créé est résolu et joignable par le contrat utilisé par antsia_ga sans déploiement", async () => {
    const f = await fixture()
    const network = await f.t.query(api.modules.networks.networks.getBySlug, { slug: "console-recette" })
    expect(network).toMatchObject({ _id: f.networkId, membershipPolicy: "open", defaultVisibility: "network" })
    const userId = "personne-recette", sessionId = await createTestSession(f.t, userId)
    const ordinary = f.t.withIdentity({ subject: userId, sessionId })
    const personId = await ordinary.mutation(api.modules.people.persons.ensureMyPerson, {})
    await ordinary.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    await ordinary.mutation(api.modules.people.profile.publishMyProfile, { handle: "recette.public", displayName: "Personne de recette" })
    await ordinary.mutation(api.modules.people.memberships.joinNetwork, { networkId: network?._id as Id<"networks"> })
    expect(await f.t.run(async (ctx) => ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.networkId).eq("personId", personId)).unique())).toMatchObject({ networkId: f.networkId, personId, status: "declaree" })
    expect(await f.t.run(async (ctx) => ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.root).eq("personId", personId)).unique())).toMatchObject({ status: "declaree" })
  })
})

describe("rétention bornée des preuves de console", () => {
  it("purge cent preuves à la fois puis poursuit sans supprimer une session encore valide", async () => {
    vi.useFakeTimers()
    const t = testConvex({ automaticSessions: false }), now = Date.now()
    const liveId = await t.run(async (ctx) => {
      for (let i = 0; i < 101; i++) await ctx.db.insert("operatorSessionProofs", { sessionId: "expired-" + i, authUserId: "fixture-user", idnSubject: "fixture-subject", loa: 2, observedAt: now - 1000, expiresAt: now - 1 })
      return await ctx.db.insert("operatorSessionProofs", { sessionId: "live", authUserId: "fixture-user", idnSubject: "fixture-subject", loa: 2, observedAt: now, expiresAt: now + 60_000 })
    })
    await t.mutation(internal.modules.platform.operatorAccess.purgeExpiredProofs, {})
    expect(await t.run(async (ctx) => ctx.db.query("operatorSessionProofs").take(103))).toHaveLength(2)
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    const remaining = await t.run(async (ctx) => ctx.db.query("operatorSessionProofs").take(103))
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?._id).toBe(liveId)
  })
})
