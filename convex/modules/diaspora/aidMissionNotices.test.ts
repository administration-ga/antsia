// @vitest-environment edge-runtime
/**
 * ET-01 (issue antsia#101) : les bénévoles inscrits sont prévenus quand l'équipe annule une
 * mission ou en change l'horaire — avis neutres `aid_mission_cancelled` et
 * `aid_mission_rescheduled`, diffusés après la transaction du geste, par lots bornés, par la
 * porte unique. Jamais à l'auteur du geste, jamais à un inscrit retiré ; aucun contenu (titre,
 * motif, horaire, nom de page) dans la ligne ni dans la cloche ; un avis par mission et par version.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { notificationStillVisible } from "../notifications/policy"

type T = ReturnType<typeof testConvex>
type Kind = "aid_mission_cancelled" | "aid_mission_rescheduled"

const NOW = Date.UTC(2026, 10, 10, 10)
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const AID = api.modules.diaspora.mutualAid
const B = api.modules.notifications.bell
const JOB = internal.modules.diaspora.communityNotifications.noticeAidMissionVolunteers
const PAGE_HANDLE = "collectif-benevoles"
const PAGE_NAME = "Collectif confidentiel de recette"
const TITLE = "Accueil confidentiel des nouveaux arrivants"
const REASON = "Salle indisponible ce samedi"
/** Les seules colonnes qu'un avis de mission peut porter : des références. */
const NOTICE_COLUMNS = ["_creationTime", "_id", "createdAt", "dedupKey", "kind", "networkId", "readAt", "recipientPersonId", "subjectAidMissionId"]

const MISSION = {
  title: TITLE,
  description: "Orienter les étudiants qui arrivent le samedi matin.",
  country: "FR",
  city: "Lyon",
  area: "Près de la gare",
  startsAt: NOW + 2 * DAY,
  endsAt: NOW + 2 * DAY + 3 * HOUR,
  timeZone: "Europe/Paris",
  places: 5,
}

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

/** Un membre déclaré de DIASPORALE (lien IDN de garantie 2), au profil publié. */
async function member(t: T, networkId: Id<"networks">, handle: string) {
  const as = t.withIdentity({ subject: `benevoles-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await t.run((ctx) => ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `benevoles-idn-${personId}`, loa: 2, nationality: "GA", linkedAt: NOW }))
  await as.mutation(api.modules.diaspora.membership.joinDiasporale, { networkId, facet: { countryOfResidence: "FR", city: "Lyon" } })
  return { as, personId }
}
type Member = Awaited<ReturnType<typeof member>>

async function fixture() {
  const t = testConvex()
  await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  const admin = await member(t, networkId, "admin.benevoles")
  const alice = await member(t, networkId, "alice.benevole")
  const bob = await member(t, networkId, "bob.benevole")
  const carla = await member(t, networkId, "carla.benevole")
  const outsider = await member(t, networkId, "tiers.benevoles")
  const pageId = await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", {
      networkId, handle: PAGE_HANDLE, name: PAGE_NAME, ownerKind: "association", trust: "community", trustRank: 0,
      visibility: "network", onRoot: false, status: "active", searchText: PAGE_HANDLE, createdAt: NOW, updatedAt: NOW,
    })
    await ctx.db.insert("pageSignatories", { networkId, pageId, personId: admin.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    return pageId
  })
  return { t, networkId, pageId, admin, alice, bob, carla, outsider }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

async function createMission(f: Fixture) {
  return await f.admin.as.mutation(AID.createMission, { networkId: f.networkId, pageId: f.pageId, ...MISSION })
}
function signUp(f: Fixture, who: Member, missionId: Id<"aidMissions">) {
  return who.as.mutation(AID.signUpForMission, { networkId: f.networkId, missionId, shareNameWithTeam: true })
}
async function version(f: Fixture, missionId: Id<"aidMissions">): Promise<number> {
  return (await f.t.run((ctx) => ctx.db.get(missionId)))?.version ?? 1
}
function edit(f: Fixture, missionId: Id<"aidMissions">, expectedVersion: number, change: Partial<typeof MISSION>) {
  return f.admin.as.mutation(AID.updateMission, { networkId: f.networkId, missionId, ...MISSION, ...change, expectedVersion })
}
function notices(f: Fixture, personId: Id<"persons">, kind: Kind): Promise<Doc<"notifications">[]> {
  return f.t.run(async (ctx) => (await ctx.db.query("notifications")
    .withIndex("by_network_recipient_createdAt", (q) => q.eq("networkId", f.networkId).eq("recipientPersonId", personId)).take(50)).filter((row) => row.kind === kind))
}
async function bellItems(f: Fixture, who: Member, kind: Kind) {
  const bell = await who.as.query(B.paginateNotifications, { networkId: f.networkId, paginationOpts: { cursor: null, numItems: 50 } })
  return bell.page.filter((item) => item.kind === kind)
}
/** Aucun contenu : ni titre, ni motif, ni nom de page, ni nom de l'auteur du geste. */
function expectNoContent(value: unknown) {
  const text = JSON.stringify(value)
  for (const secret of [TITLE, REASON, PAGE_NAME, "admin.benevoles", "Lyon"]) expect(text, secret).not.toContain(secret)
}

describe("mission annulée — avis neutre à chaque bénévole inscrit", () => {
  it("une ligne chez chaque inscription confirmée ; aucune chez un inscrit retiré, chez l'équipe ni chez un tiers", async () => {
    const f = await fixture()
    const { missionId } = await createMission(f)
    for (const who of [f.alice, f.bob, f.carla]) await signUp(f, who, missionId)
    await f.carla.as.mutation(AID.withdrawFromMission, { networkId: f.networkId, missionId })
    await f.admin.as.mutation(AID.cancelMission, { networkId: f.networkId, missionId, expectedVersion: await version(f, missionId), reason: REASON })
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)

    const cancelledVersion = await version(f, missionId)
    for (const who of [f.alice, f.bob]) {
      const rows = await notices(f, who.personId, "aid_mission_cancelled")
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ kind: "aid_mission_cancelled", subjectAidMissionId: missionId, recipientPersonId: who.personId, dedupKey: `aid_mission_cancelled|aidMission:${missionId}:cancelled:${cancelledVersion}|-` })
      expect(rows[0]?.actorPersonId).toBeUndefined()
      expect(Object.keys(rows[0]!).every((key) => NOTICE_COLUMNS.includes(key))).toBe(true)
      expectNoContent(rows[0])
    }
    for (const who of [f.carla, f.admin, f.outsider]) expect(await notices(f, who.personId, "aid_mission_cancelled")).toEqual([])

    // La cloche mène à la mission, pour le bénévole : la page se nomme par son adresse, rien d'autre.
    const [item] = await bellItems(f, f.alice, "aid_mission_cancelled")
    expect(item).toMatchObject({ actor: null, communityNotice: { audience: "volunteer", opens: "aidMission", objectId: missionId, pageHandle: PAGE_HANDLE } })
    expectNoContent(item)
    // Le motif se lit sur la fiche, avec les droits du lecteur.
    const detail = await f.alice.as.query(AID.aidItem, { networkId: f.networkId, itemId: missionId })
    expect(detail?.kind === "mission" ? detail.mission.cancelReason : null).toBe(REASON)
  })

  it("rejouée, la diffusion n'ajoute rien et ne rouvre pas une ligne lue", async () => {
    const f = await fixture()
    const { missionId } = await createMission(f)
    await signUp(f, f.alice, missionId)
    await f.admin.as.mutation(AID.cancelMission, { networkId: f.networkId, missionId, expectedVersion: await version(f, missionId) })
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)
    const [first] = await notices(f, f.alice.personId, "aid_mission_cancelled")
    await f.alice.as.mutation(B.markRead, { networkId: f.networkId, notificationId: first!._id })

    expect(await f.t.mutation(JOB, { networkId: f.networkId, missionId, kind: "aid_mission_cancelled", cursor: null, sourcePersonId: f.admin.personId })).toEqual({ notified: 1, done: true })
    const rows = await notices(f, f.alice.personId, "aid_mission_cancelled")
    expect(rows).toHaveLength(1)
    expect(rows[0]?.readAt).toBeDefined()
    // Une mission encore ouverte n'annonce aucune annulation, même si le job est appelé à tort.
    const other = await createMission(f)
    await signUp(f, f.bob, other.missionId)
    expect(await f.t.mutation(JOB, { networkId: f.networkId, missionId: other.missionId, kind: "aid_mission_cancelled", cursor: null })).toEqual({ notified: 0, done: true })
    expect(await notices(f, f.bob.personId, "aid_mission_cancelled")).toEqual([])
  })

  it("une mission sans inscrit ne programme rien ; l'auteur du geste n'est jamais avisé, même inscrit", async () => {
    const f = await fixture()
    const empty = await createMission(f)
    await f.admin.as.mutation(AID.cancelMission, { networkId: f.networkId, missionId: empty.missionId, expectedVersion: 1 })
    expect(await f.t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(10))).toEqual([])

    const { missionId } = await createMission(f)
    await signUp(f, f.admin, missionId)
    await signUp(f, f.alice, missionId)
    await f.admin.as.mutation(AID.cancelMission, { networkId: f.networkId, missionId, expectedVersion: await version(f, missionId) })
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await notices(f, f.admin.personId, "aid_mission_cancelled")).toEqual([])
    expect(await notices(f, f.alice.personId, "aid_mission_cancelled")).toHaveLength(1)
  })
})

describe("mission déplacée — avis neutre quand l'horaire change, et seulement alors", () => {
  it("un changement d'horaire avise chaque inscrit, une fois par version ; un changement de places ou de texte n'avise personne", async () => {
    const f = await fixture()
    const { missionId } = await createMission(f)
    await signUp(f, f.alice, missionId)
    await signUp(f, f.bob, missionId)

    await edit(f, missionId, await version(f, missionId), { places: 8, description: "Programme revu, même horaire." })
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await notices(f, f.alice.personId, "aid_mission_rescheduled")).toEqual([])

    await edit(f, missionId, await version(f, missionId), { places: 8, startsAt: MISSION.startsAt + HOUR, endsAt: MISSION.endsAt + HOUR })
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)
    for (const who of [f.alice, f.bob]) {
      const rows = await notices(f, who.personId, "aid_mission_rescheduled")
      expect(rows).toHaveLength(1)
      expect(rows[0]?.actorPersonId).toBeUndefined()
      expectNoContent(rows[0])
    }
    expect(await notices(f, f.admin.personId, "aid_mission_rescheduled")).toEqual([])

    // Le fuseau seul change l'horaire : une nouvelle version, un nouvel avis.
    await edit(f, missionId, await version(f, missionId), { places: 8, startsAt: MISSION.startsAt + HOUR, endsAt: MISSION.endsAt + HOUR, timeZone: "Europe/London" })
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await notices(f, f.alice.personId, "aid_mission_rescheduled")).toHaveLength(2)

    const [item] = await bellItems(f, f.bob, "aid_mission_rescheduled")
    expect(item).toMatchObject({ actor: null, communityNotice: { audience: "volunteer", opens: "aidMission", objectId: missionId, pageHandle: PAGE_HANDLE } })
    expectNoContent(item)
  })

  it("un inscrit qui se retire ne voit plus l'avis ; une mission annulée n'annonce plus de changement d'horaire", async () => {
    const f = await fixture()
    const { missionId } = await createMission(f)
    await signUp(f, f.alice, missionId)
    await signUp(f, f.bob, missionId)
    await edit(f, missionId, await version(f, missionId), { startsAt: MISSION.startsAt + DAY, endsAt: MISSION.endsAt + DAY })
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)
    const [aliceRow] = await notices(f, f.alice.personId, "aid_mission_rescheduled")
    expect(await f.t.run((ctx) => notificationStillVisible(ctx, aliceRow!))).toBe(true)

    await f.alice.as.mutation(AID.withdrawFromMission, { networkId: f.networkId, missionId })
    expect(await f.t.run((ctx) => notificationStillVisible(ctx, aliceRow!))).toBe(false)
    expect(await bellItems(f, f.alice, "aid_mission_rescheduled")).toEqual([])
    expect(await bellItems(f, f.bob, "aid_mission_rescheduled")).toHaveLength(1)

    await f.admin.as.mutation(AID.cancelMission, { networkId: f.networkId, missionId, expectedVersion: await version(f, missionId) })
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await f.t.mutation(JOB, { networkId: f.networkId, missionId, kind: "aid_mission_rescheduled", cursor: null })).toEqual({ notified: 0, done: true })
    expect(await notices(f, f.bob.personId, "aid_mission_rescheduled")).toHaveLength(1)
    expect(await notices(f, f.bob.personId, "aid_mission_cancelled")).toHaveLength(1)
  })

  it("une adhésion suspendue au réseau n'est pas avisée", async () => {
    const f = await fixture()
    const { missionId } = await createMission(f)
    await signUp(f, f.alice, missionId)
    await signUp(f, f.bob, missionId)
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.networkId).eq("personId", f.bob.personId)).unique()
      if (!row) throw new Error("Adhésion de fixture absente")
      await ctx.db.patch(row._id, { status: "suspendue" })
    })
    await f.admin.as.mutation(AID.cancelMission, { networkId: f.networkId, missionId, expectedVersion: await version(f, missionId) })
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await notices(f, f.alice.personId, "aid_mission_cancelled")).toHaveLength(1)
    expect(await notices(f, f.bob.personId, "aid_mission_cancelled")).toEqual([])
  })
})
