// @vitest-environment edge-runtime
/** Masquages DIASPORA.GA : lookup exact dans le vivier borné, sans plafond global ni choix d'autrui. */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, openNetworkFeatures, testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
const NOW = Date.UTC(2026, 9, 17, 8)
const SG = api.modules.suggestions.suggestions
const DS = api.modules.diaspora.suggestions
const NEUTRAL_IDENTITY = { handle: null, displayName: null, headline: null, avatarUrl: null }

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function seed(t: T) {
  const foundations = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const diaspora = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  await openNetworkFeatures(t, diaspora.network)
  return { root: foundations.root, networkId: diaspora.network }
}

/** L'accueil réel, avec session Better Auth du harnais ; seuls les faits IDN sont posés en fixture. */
async function member(t: T, networkId: Id<"networks">, handle: string, options: { subject?: string; listed?: boolean } = {}) {
  const subject = options.subject ?? `auth-${handle}`
  const as = t.withIdentity({ subject })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await t.run(async (ctx) => {
    await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `idn-${personId}`, loa: 1, nationality: "GA", linkedAt: NOW })
  })
  if (options.listed) await as.mutation(api.modules.people.consents.recordConsent, { purpose: "directory", origin: "onboarding", networkId })
  await as.mutation(api.modules.diaspora.membership.joinDiasporaGa, {
    networkId,
    facet: { countryOfResidence: "FR", city: "Lyon" },
    ...(options.listed ? { directoryVisibility: "network" as const } : {}),
  })
  return { as, personId, subject }
}

type Member = Awaited<ReturnType<typeof member>>
const pageArgs = (networkId: Id<"networks">, cursor: string | null = null, numItems = 12) => ({ networkId, paginationOpts: { numItems, cursor } })

async function codeOf(promise: Promise<unknown>) {
  try { await promise } catch (error) { return engineErrorCode(error) }
  return null
}

async function maskedFixture() {
  const t = testConvex()
  const { root, networkId } = await seed(t)
  const reader = await member(t, networkId, "lecteur")
  const target = await member(t, networkId, "candidat", { listed: true })
  await reader.as.mutation(SG.dismiss, { networkId, handle: "candidat" })
  const row = await t.run(async (ctx) => ctx.db.query("suggestionDismissals")
    .withIndex("by_network_person_dismissed", (q) => q.eq("networkId", networkId).eq("personId", reader.personId).eq("dismissedPersonId", target.personId))
    .unique())
  if (!row) throw new Error("Masquage de fixture absent")
  return { t, root, networkId, reader, target, dismissalId: row._id }
}

async function setStatus(t: T, networkId: Id<"networks">, personId: Id<"persons">, status: "en_attente" | "suspendue") {
  await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships")
      .withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId))
      .unique()
    if (!row) throw new Error("Adhésion de fixture absente")
    await ctx.db.patch(row._id, { status })
  })
}

async function addPublishedIdentity(t: T, target: Member) {
  await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(["avatar fictif de test"]))
    await ctx.db.insert("fileScans", { storageId, uploadedByPersonId: target.personId, source: "profile", status: "clean", attempts: 1, createdAt: NOW, updatedAt: NOW })
    await ctx.db.patch(target.personId, { headline: "Titre public de test", avatarStorageId: storageId })
  })
}

async function graphSnapshot(t: T) {
  return await t.run(async (ctx) => ({
    connections: await ctx.db.query("connections").take(20),
    follows: await ctx.db.query("follows").take(20),
    notifications: await ctx.db.query("notifications").take(20),
  }))
}

describe("suggestions DIASPORA.GA — masquages exacts", () => {
  it("écarte un candidat masqué après les 500 premières lignes, puis le réévalue après restauration", async () => {
    const t = testConvex()
    const { networkId } = await seed(t)
    const reader = await member(t, networkId, "lecteur")
    // Les 500 autres personnes restent hors du vivier : ni profil publié ni ligne d'annuaire.
    const last = await t.run(async (ctx) => {
      for (let index = 0; index < 501; index += 1) {
        const personId = await ctx.db.insert("persons", { authUserId: `hors-vivier-${index}`, createdAt: NOW, updatedAt: NOW })
        await ctx.db.insert("suggestionDismissals", { networkId, personId: reader.personId, dismissedPersonId: personId, createdAt: NOW })
      }
      const rows = await ctx.db.query("suggestionDismissals")
        .withIndex("by_network_person_dismissed", (q) => q.eq("networkId", networkId).eq("personId", reader.personId))
        .take(501)
      const row = rows[500]
      if (!row) throw new Error("Masquage de régression absent")
      const person = await ctx.db.get(row.dismissedPersonId)
      if (!person) throw new Error("Personne fictive de régression absente")
      return { subject: person.authUserId, personId: person._id, firstIds: rows.slice(0, 500).map((item) => item.dismissedPersonId) }
    })
    const target = await member(t, networkId, "candidat", { subject: last.subject, listed: true })
    expect(target.personId).toBe(last.personId)
    expect(last.firstIds).toHaveLength(500)
    expect(last.firstIds).not.toContain(target.personId)

    const suggestions = () => reader.as.query(api.modules.diaspora.suggestions.forMe, { networkId })
    expect(await suggestions()).toEqual([])
    await reader.as.mutation(SG.restore, { networkId, targetPersonId: target.personId })
    expect((await suggestions()).map((item) => item.personId)).toEqual([target.personId])
    await reader.as.mutation(SG.dismiss, { networkId, handle: "candidat" })
    expect(await suggestions()).toEqual([])
  })

  it("ne confond ni les auteurs ni les réseaux ; restaurer un choix distant n'ouvre pas le choix local", async () => {
    const t = testConvex()
    const { root, networkId } = await seed(t)
    const reader = await member(t, networkId, "lecteur")
    const other = await member(t, networkId, "autre.lecteur")
    const target = await member(t, networkId, "candidat", { listed: true })
    const suggestions = async (as: typeof reader.as) => (await as.query(api.modules.diaspora.suggestions.forMe, { networkId })).map((item) => item.personId)

    await other.as.mutation(SG.dismiss, { networkId, handle: "candidat" })
    await reader.as.mutation(SG.dismiss, { networkId: root, handle: "candidat" })
    expect(await suggestions(reader.as)).toEqual([target.personId])
    expect(await suggestions(other.as)).toEqual([])

    await reader.as.mutation(SG.dismiss, { networkId, handle: "candidat" })
    await reader.as.mutation(SG.restore, { networkId: root, targetPersonId: target.personId })
    await other.as.mutation(SG.restore, { networkId, targetPersonId: target.personId })
    expect(await suggestions(reader.as)).toEqual([])
    expect(await suggestions(other.as)).toEqual([target.personId])

    await reader.as.mutation(SG.restore, { networkId, targetPersonId: target.personId })
    expect(await suggestions(reader.as)).toEqual([target.personId])
  })
})

describe("suggestions DIASPORA.GA — mes choix paginés et restaurables", () => {
  it("parcourt toutes les lignes propres, borne la page à 50 et conserve exactement les métadonnées natives", async () => {
    const t = testConvex()
    const { root, networkId } = await seed(t)
    const reader = await member(t, networkId, "lecteur")
    const other = await member(t, networkId, "autre.lecteur")
    const inserted = await t.run(async (ctx) => {
      const own: Id<"suggestionDismissals">[] = []
      for (let index = 0; index < 55; index += 1) {
        const targetPersonId = await ctx.db.insert("persons", { authUserId: `non-publie-${index}`, createdAt: NOW, updatedAt: NOW })
        own.push(await ctx.db.insert("suggestionDismissals", { networkId, personId: reader.personId, dismissedPersonId: targetPersonId, createdAt: NOW + index }))
      }
      await ctx.db.insert("suggestionDismissals", { networkId: root, personId: reader.personId, dismissedPersonId: other.personId, createdAt: NOW + 100 })
      const foreign = await ctx.db.insert("suggestionDismissals", { networkId, personId: other.personId, dismissedPersonId: reader.personId, createdAt: NOW + 100 })
      return { own, foreign }
    })
    const first = await reader.as.query(DS.paginateDismissed, { networkId, paginationOpts: { numItems: 1000, cursor: null, maximumBytesRead: 8 * 1024 * 1024 } })
    const native = await t.run(async (ctx) => ctx.db.query("suggestionDismissals")
      .withIndex("by_network_person_createdAt", (q) => q.eq("networkId", networkId).eq("personId", reader.personId))
      .order("desc")
      .paginate({ numItems: 50, cursor: null, maximumBytesRead: 2 * 1024 * 1024 }))
    expect(first).toEqual({ ...native, page: native.page.map((row) => ({ dismissalId: row._id, targetPersonId: row.dismissedPersonId, at: row.createdAt, ...NEUTRAL_IDENTITY })) })
    expect(first.page).toHaveLength(50)
    expect(first.isDone).toBe(false)
    const tail = await reader.as.query(DS.paginateDismissed, pageArgs(networkId, first.continueCursor, 50))
    expect(tail.page).toHaveLength(5)
    expect(tail.isDone).toBe(true)
    expect([...first.page, ...tail.page].map((row) => row.dismissalId)).toEqual([...inserted.own].reverse())
    expect(Object.keys(first.page[0]!).sort()).toEqual(["at", "avatarUrl", "dismissalId", "displayName", "handle", "headline", "targetPersonId"])
    expect((await other.as.query(DS.paginateDismissed, pageArgs(networkId))).page.map((row) => row.dismissalId)).toEqual([inserted.foreign])
    expect(await codeOf(reader.as.query(DS.paginateDismissed, pageArgs(root)))).toBe("notFound")
  })

  it("un membre en attente relit et restaure un choix neutre sans ouvrir la découverte ni les demandes de lien", async () => {
    const { t, networkId, reader, target, dismissalId } = await maskedFixture()
    await setStatus(t, networkId, reader.personId, "en_attente")
    const page = await reader.as.query(DS.paginateDismissed, pageArgs(networkId))
    expect(page.page).toEqual([{ dismissalId, targetPersonId: target.personId, at: NOW, ...NEUTRAL_IDENTITY }])
    expect(await codeOf(reader.as.query(DS.forMe, { networkId }))).toBe("statusInsufficient")
    expect(await codeOf(reader.as.mutation(api.modules.graph.connections.requestConnection, { networkId, targetPersonId: target.personId }))).toBe("statusInsufficient")
    const before = await graphSnapshot(t)
    expect(await reader.as.mutation(DS.restoreDismissed, { networkId, dismissalId })).toEqual({ restored: true })
    expect((await reader.as.query(DS.paginateDismissed, pageArgs(networkId))).page).toEqual([])
    expect(await graphSnapshot(t)).toEqual(before)
  })

  it.each(["hidden", "country", "consent", "departed", "incoming-block", "withdrawn", "private", "pending", "missing"] as const)("relit la vraie autorisation d'annuaire après %s, garde une ligne neutre et permet sa restauration", async (change) => {
    const { t, networkId, reader, target, dismissalId } = await maskedFixture()
    await addPublishedIdentity(t, target)
    const before = await reader.as.query(DS.paginateDismissed, pageArgs(networkId))
    expect(before.page).toHaveLength(1)
    expect(before.page[0]).toMatchObject({ dismissalId, targetPersonId: target.personId, handle: "candidat", displayName: "candidat", headline: "Titre public de test" })
    expect(before.page[0]?.avatarUrl).toEqual(expect.any(String))

    switch (change) {
      case "hidden":
        await target.as.mutation(api.modules.diaspora.facet.setDirectoryVisibility, { networkId, level: "hidden" })
        break
      case "country":
        await target.as.mutation(api.modules.diaspora.facet.setDirectoryVisibility, { networkId, level: "country" })
        expect((await reader.as.query(DS.paginateDismissed, pageArgs(networkId))).page[0]?.handle).toBe("candidat")
        await target.as.mutation(api.modules.diaspora.facet.updateMyFacet, { networkId, facet: { countryOfResidence: "BE" } })
        break
      case "consent":
        await target.as.mutation(api.modules.people.consents.revokeConsent, { purpose: "directory", networkId })
        break
      case "departed":
        await target.as.mutation(api.modules.diaspora.membership.leaveDiasporaGa, { networkId })
        break
      case "incoming-block":
        await target.as.mutation(api.modules.graph.connections.blockPerson, { networkId, targetPersonId: reader.personId })
        break
      case "withdrawn":
        await target.as.mutation(api.modules.people.profile.withdrawMyProfile, {})
        break
      case "private":
        await target.as.mutation(api.modules.people.profile.setMyProfilePrivacy, { private: true })
        break
      case "pending":
        await setStatus(t, networkId, target.personId, "en_attente")
        break
      case "missing":
        await t.run(async (ctx) => { await ctx.db.delete(target.personId) })
        break
    }
    expect((await reader.as.query(DS.paginateDismissed, pageArgs(networkId))).page).toEqual([{ dismissalId, targetPersonId: target.personId, at: NOW, ...NEUTRAL_IDENTITY }])
    const graphBefore = await graphSnapshot(t)
    expect(await reader.as.mutation(DS.restoreDismissed, { networkId, dismissalId })).toEqual({ restored: true })
    expect((await reader.as.query(DS.paginateDismissed, pageArgs(networkId))).page).toEqual([])
    expect(await graphSnapshot(t)).toEqual(graphBefore)
  })

  it("borne la restauration à l'auteur et au réseau ; l'ancien identifiant ne retire pas une réémission à date identique", async () => {
    const { t, root, networkId, reader, target, dismissalId } = await maskedFixture()
    const other = await member(t, networkId, "autre.lecteur")
    const remote = await t.run(async (ctx) => ctx.db.insert("suggestionDismissals", { networkId: root, personId: reader.personId, dismissedPersonId: target.personId, createdAt: NOW }))
    const before = await t.run(async (ctx) => ctx.db.query("suggestionDismissals").take(10))
    expect(await other.as.mutation(DS.restoreDismissed, { networkId, dismissalId })).toEqual({ restored: false })
    expect(await reader.as.mutation(DS.restoreDismissed, { networkId, dismissalId: remote })).toEqual({ restored: false })
    expect(await t.run(async (ctx) => ctx.db.query("suggestionDismissals").take(10))).toEqual(before)

    const graphBefore = await graphSnapshot(t)
    expect(await reader.as.mutation(DS.restoreDismissed, { networkId, dismissalId })).toEqual({ restored: true })
    expect(await reader.as.mutation(DS.restoreDismissed, { networkId, dismissalId })).toEqual({ restored: false })
    await reader.as.mutation(SG.dismiss, { networkId, handle: "candidat" })
    const current = (await reader.as.query(DS.paginateDismissed, pageArgs(networkId))).page[0]
    expect(current).toMatchObject({ targetPersonId: target.personId, at: NOW })
    expect(current?.dismissalId).not.toBe(dismissalId)
    const remasked = await t.run(async (ctx) => ctx.db.query("suggestionDismissals").take(10))
    expect(await reader.as.mutation(DS.restoreDismissed, { networkId, dismissalId })).toEqual({ restored: false })
    expect(await t.run(async (ctx) => ctx.db.query("suggestionDismissals").take(10))).toEqual(remasked)
    expect(await graphSnapshot(t)).toEqual(graphBefore)
  })

  it("session absente ou révoquée, non-membre et suspension racine conservent les gardes de lecture et de restauration", async () => {
    const { t, root, networkId, reader, dismissalId } = await maskedFixture()
    expect(await codeOf(t.query(DS.paginateDismissed, pageArgs(networkId)))).toBe("unauthenticated")
    expect(await codeOf(t.mutation(DS.restoreDismissed, { networkId, dismissalId }))).toBe("unauthenticated")
    const sessionId = await createTestSession(t, reader.subject)
    const stale = t.withIdentity({ subject: reader.subject, sessionId })
    expect((await stale.query(DS.paginateDismissed, pageArgs(networkId))).page).toHaveLength(1)
    await t.mutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: sessionId }] } })
    expect(await codeOf(stale.query(DS.paginateDismissed, pageArgs(networkId)))).toBe("unauthenticated")
    expect(await codeOf(stale.mutation(DS.restoreDismissed, { networkId, dismissalId }))).toBe("unauthenticated")
    const outsider = t.withIdentity({ subject: "hors-reseau" })
    await outsider.mutation(api.modules.people.persons.ensureMyPerson, {})
    expect(await codeOf(outsider.query(DS.paginateDismissed, pageArgs(networkId)))).toBe("notFound")
    expect(await codeOf(outsider.mutation(DS.restoreDismissed, { networkId, dismissalId }))).toBe("notFound")
    await setStatus(t, root, reader.personId, "suspendue")
    expect(await codeOf(reader.as.query(DS.paginateDismissed, pageArgs(networkId)))).toBe("membershipSuspended")
    expect(await codeOf(reader.as.mutation(DS.restoreDismissed, { networkId, dismissalId }))).toBe("membershipSuspended")
    expect(await t.run(async (ctx) => ctx.db.get(dismissalId))).not.toBeNull()
  })

  it.each(["suspension", "mute"] as const)("la sanction PA5 %s reste prioritaire sur la restauration", async (kind) => {
    const { t, networkId, reader, dismissalId } = await maskedFixture()
    await t.run(async (ctx) => {
      const target = { kind: "person" as const, id: reader.personId }
      const reportId = await ctx.db.insert("reports", { networkId, target, targetKind: "person", targetId: reader.personId, ownerPersonId: reader.personId, reason: "Garde de test", level: "platform", status: "actioned", createdAt: NOW, updatedAt: NOW })
      await ctx.db.insert("sanctions", { networkId, reportId, personId: reader.personId, kind, status: "active", reason: "Garde de test", target, createdAt: NOW, updatedAt: NOW })
    })
    if (kind === "suspension") expect(await codeOf(reader.as.query(DS.paginateDismissed, pageArgs(networkId)))).toBe("membershipSuspended")
    else expect((await reader.as.query(DS.paginateDismissed, pageArgs(networkId))).page).toHaveLength(1)
    expect(await codeOf(reader.as.mutation(DS.restoreDismissed, { networkId, dismissalId }))).toBe(kind === "suspension" ? "membershipSuspended" : "policyRefused")
    expect(await t.run(async (ctx) => ctx.db.get(dismissalId))).not.toBeNull()
  })

  it("la restauration consomme le même seau que le masquage, même pour un identifiant étranger", async () => {
    const { t, root, networkId, reader, target, dismissalId } = await maskedFixture()
    const remote = await t.run(async (ctx) => ctx.db.insert("suggestionDismissals", { networkId: root, personId: reader.personId, dismissedPersonId: target.personId, createdAt: NOW }))
    // Le masquage initial a consommé un des trente jetons du seau partagé.
    for (let index = 0; index < 29; index += 1) expect(await reader.as.mutation(DS.restoreDismissed, { networkId, dismissalId: remote })).toEqual({ restored: false })
    expect(await codeOf(reader.as.mutation(DS.restoreDismissed, { networkId, dismissalId }))).toBe("rateLimited")
    expect(await t.run(async (ctx) => ctx.db.get(dismissalId))).not.toBeNull()
  })
})
