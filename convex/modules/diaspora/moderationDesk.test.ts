// @vitest-environment edge-runtime
/**
 * Guichet de modération par pays de DIASPORALE (PD6 · G9) : la file du réseau
 * relue par fenêtres bornées et filtrée par le pays de la CIBLE, la nature et
 * l'équipe ; refus indistinct hors compétence, hors réseau gouverné et pour une
 * autre personne attendue ; conflits annoncés ; décisions par les mutations
 * EXISTANTES du moteur ; recours et composition des équipes réservés à
 * l'administration du réseau. Données de fixture fictives.
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { MODERATION_POLICY_DEFAULTS } from "@antsia/social-domain/moderationPolicy"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { DESK_WINDOW_MAX } from "./moderationDesk"

type T = ReturnType<typeof testConvex>
type Member = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons"> }
type Role = Doc<"networkMemberships">["role"]
type Target = Doc<"reports">["target"]

const D = api.modules.diaspora.moderationDesk
const CASES = api.modules.moderation.cases
const NOW = Date.UTC(2026, 9, 18, 9)
const PAGE = { cursor: null, numItems: 20 }
const ALL = { kind: "all" as const }
const NONE = { kind: "none" as const }
const FR = { kind: "country" as const, country: "FR" }
const BE = { kind: "country" as const, country: "BE" }

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

/** Un membre DÉCLARÉ de DIASPORALE (IDN de garantie 1), au rôle réseau demandé. */
async function member(t: T, networkId: Id<"networks">, handle: string, role?: Role): Promise<Member> {
  const as = t.withIdentity({ subject: `desk-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await t.run(async (ctx) => {
    await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `idn-${personId}`, loa: 1, nationality: "GA", linkedAt: NOW })
  })
  await as.mutation(api.modules.diaspora.membership.joinDiasporale, { networkId, facet: { countryOfResidence: "FR" } })
  if (role) {
    await t.run(async (ctx) => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique()
      if (row) await ctx.db.patch(row._id, { role })
    })
  }
  return { as, personId }
}

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  const author = await member(t, network, "auteur.fixture")
  const reader = await member(t, network, "lectrice.fixture")
  const moderator = await member(t, network, "moderatrice.fixture", "network_moderator")
  const admin = await member(t, network, "admin.fixture", "network_admin")
  return { t, root, network, author, reader, moderator, admin }
}

let sequence = 0

async function page(t: T, networkId: Id<"networks">, country: string | null): Promise<Id<"pages">> {
  sequence += 1
  const handle = `page-bureau-${sequence}`
  return await t.run(async (ctx) =>
    ctx.db.insert("pages", {
      networkId,
      handle,
      name: `Association fictive ${sequence}`,
      ownerKind: "association",
      trust: "community",
      trustRank: 0,
      ...(country === null ? {} : { country }),
      visibility: "network",
      onRoot: false,
      status: "active",
      searchText: handle,
      createdAt: NOW,
      updatedAt: NOW,
    }),
  )
}

/** Une publication : locale d'un pays, de portée diaspora sans pays, ou au nom d'une page. */
async function post(t: T, networkId: Id<"networks">, authorPersonId: Id<"persons">, fields: { country?: string; pageId?: Id<"pages"> } = {}): Promise<Id<"posts">> {
  sequence += 1
  return await t.run(async (ctx) =>
    ctx.db.insert("posts", {
      networkId,
      authorPersonId,
      body: `Corps privé de fixture ${sequence}`,
      audience: "public",
      visibility: "network",
      onRoot: false,
      status: "published",
      searchText: "corps prive de fixture",
      ...(fields.country ? { reach: "local", country: fields.country } : { reach: "diaspora" }),
      ...(fields.pageId ? { pageId: fields.pageId } : {}),
      publishedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    }),
  )
}

async function comment(t: T, networkId: Id<"networks">, postId: Id<"posts">, authorPersonId: Id<"persons">): Promise<Id<"postComments">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("postComments", { networkId, postId, authorPersonId, body: "Commentaire privé de fixture", status: "published", createdAt: NOW, updatedAt: NOW }),
  )
}

/** Un dossier ouvert posé tel quel ; l'ordre de la file suit `createdAt`. */
async function report(
  t: T,
  networkId: Id<"networks">,
  target: Target,
  fields: { ownerPersonId?: Id<"persons">; reporterPersonId?: Id<"persons">; teamId?: Id<"moderationTeams">; reason?: string; status?: "open" | "actioned"; at?: number } = {},
): Promise<Id<"reports">> {
  sequence += 1
  const at = fields.at ?? NOW + sequence
  return await t.run(async (ctx) =>
    ctx.db.insert("reports", {
      networkId,
      target,
      targetKind: target.kind,
      targetId: target.id,
      ...(fields.ownerPersonId ? { ownerPersonId: fields.ownerPersonId } : {}),
      ...(fields.reporterPersonId ? { reporterPersonId: fields.reporterPersonId } : {}),
      ...(fields.teamId ? { teamId: fields.teamId } : {}),
      reason: fields.reason ?? "harassment",
      level: fields.teamId ? "team" : "network",
      status: fields.status ?? "open",
      createdAt: at,
      updatedAt: at,
    }),
  )
}

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    return engineErrorCode(error)
  }
  return null
}

const queueArgs = (networkId: Id<"networks">, viewer: Member, zone: typeof ALL | typeof NONE | typeof FR | typeof BE, extra: { surface?: Doc<"reports">["targetKind"]; teamId?: Id<"moderationTeams"> } = {}) => ({
  networkId,
  expectedPersonId: viewer.personId,
  zone,
  ...extra,
  paginationOpts: PAGE,
})

describe("myDesk — la compétence vivante, sans divulgation", () => {
  it("rend null à un membre sans compétence, le rôle réseau au modérateur et toutes les équipes à l'administration", async () => {
    const f = await fixture()
    expect(await f.reader.as.query(D.myDesk, { networkId: f.network, expectedPersonId: f.reader.personId })).toBeNull()
    expect(await f.moderator.as.query(D.myDesk, { networkId: f.network, expectedPersonId: f.moderator.personId })).toEqual({
      role: "network_moderator", networkWide: true, canReviewAppeals: false, canManageTeams: false, canManagePolicy: false, teams: [],
    })
    const teamId = await f.t.run(async (ctx) => ctx.db.insert("moderationTeams", { networkId: f.network, name: "France (fixture)", active: true, createdAt: NOW }))
    expect(await f.admin.as.query(D.myDesk, { networkId: f.network, expectedPersonId: f.admin.personId })).toEqual({
      role: "network_admin", networkWide: true, canReviewAppeals: true, canManageTeams: true, canManagePolicy: true,
      teams: [{ teamId, name: "France (fixture)", scope: null, isMember: false }],
    })
    // Un modérateur réseau hors de l'équipe ne la voit pas : aucun coéquipier n'est révélé.
    expect((await f.moderator.as.query(D.myDesk, { networkId: f.network, expectedPersonId: f.moderator.personId }))?.teams).toEqual([])
    await f.t.run(async (ctx) => ctx.db.insert("moderationTeamMembers", { networkId: f.network, teamId, personId: f.reader.personId, active: true, updatedAt: NOW }))
    expect(await f.reader.as.query(D.myDesk, { networkId: f.network, expectedPersonId: f.reader.personId })).toEqual({
      role: "team_member", networkWide: false, canReviewAppeals: false, canManageTeams: false, canManagePolicy: false,
      teams: [{ teamId, name: "France (fixture)", scope: null, isMember: true }],
    })
  })

  it("refuse indistinctement un autre réseau et une autre personne attendue", async () => {
    const f = await fixture()
    expect(await codeOf(f.moderator.as.query(D.myDesk, { networkId: f.root, expectedPersonId: f.moderator.personId }))).toBe("notFound")
    expect(await codeOf(f.moderator.as.query(D.myDesk, { networkId: f.network, expectedPersonId: f.reader.personId }))).toBe("notFound")
    expect(await codeOf(f.moderator.as.query(D.queue, queueArgs(f.root, f.moderator, ALL)))).toBe("notFound")
    expect(await codeOf(f.moderator.as.query(D.queue, { ...queueArgs(f.network, f.moderator, ALL), expectedPersonId: f.reader.personId }))).toBe("notFound")
  })
})

describe("queue — la file filtrée par le pays de la cible", () => {
  it("range chaque dossier au pays de sa cible, jamais à celui d'une personne", async () => {
    const f = await fixture()
    const pageFr = await page(f.t, f.network, "FR")
    const pageBe = await page(f.t, f.network, "BE")
    const postFr = await post(f.t, f.network, f.author.personId, { country: "FR" })
    const postDiaspora = await post(f.t, f.network, f.author.personId)
    const postOfPageBe = await post(f.t, f.network, f.author.personId, { pageId: pageBe })
    const commentFr = await comment(f.t, f.network, postFr, f.author.personId)
    const onPostFr = await report(f.t, f.network, { kind: "post", id: postFr }, { ownerPersonId: f.author.personId, reporterPersonId: f.reader.personId })
    const onDiaspora = await report(f.t, f.network, { kind: "post", id: postDiaspora }, { ownerPersonId: f.author.personId, reporterPersonId: f.reader.personId })
    const onPageBe = await report(f.t, f.network, { kind: "post", id: postOfPageBe }, { ownerPersonId: f.author.personId })
    const onPageFr = await report(f.t, f.network, { kind: "page", id: pageFr }, { reason: "misinformation" })
    const onComment = await report(f.t, f.network, { kind: "comment", id: commentFr }, { ownerPersonId: f.author.personId })
    const onPerson = await report(f.t, f.network, { kind: "person", id: f.author.personId }, { ownerPersonId: f.author.personId })
    // Un dossier d'un autre réseau n'entre jamais dans la file de DIASPORALE.
    await report(f.t, f.root, { kind: "post", id: postFr }, { ownerPersonId: f.author.personId })

    const ids = async (zone: typeof ALL | typeof NONE | typeof FR | typeof BE, surface?: Doc<"reports">["targetKind"]) =>
      (await f.moderator.as.query(D.queue, queueArgs(f.network, f.moderator, zone, surface ? { surface } : {}))).items.map((row) => row.reportId)

    expect(await ids(FR)).toEqual([onPostFr, onPageFr, onComment])
    expect(await ids(BE)).toEqual([onPageBe])
    // La facette de résidence de l'auteur (FR) n'est jamais lue : un compte est « sans pays ».
    expect(await ids(NONE)).toEqual([onDiaspora, onPerson])
    expect(await ids(ALL)).toEqual([onPostFr, onDiaspora, onPageBe, onPageFr, onComment, onPerson])
    expect(await ids(FR, "page")).toEqual([onPageFr])
    expect(await ids(ALL, "comment")).toEqual([onComment])

    const page1 = await f.moderator.as.query(D.queue, queueArgs(f.network, f.moderator, FR))
    expect(page1.items[0]).toEqual({
      reportId: onPostFr, surface: "post", country: "FR", reason: "harassment", status: "open", level: "network",
      teamName: null, createdAt: expect.any(Number), hasAuthor: true, party: null,
    })
    expect(page1.items.find((row) => row.reportId === onPageFr)).toMatchObject({ surface: "page", country: "FR", hasAuthor: false })
    expect(page1.isDone).toBe(true)
    expect(page1.continueCursor).toBeNull()
    // Aucun déclarant, aucun auteur, aucun corps de contenu dans la file.
    for (const secret of [f.author.personId, f.reader.personId, postFr, "Corps privé", "Commentaire privé"]) expect(JSON.stringify(page1)).not.toContain(secret)
  })

  it("refuse la file à un membre sans compétence, comme un dossier absent, et refuse un pays inconnu", async () => {
    const f = await fixture()
    expect(await codeOf(f.reader.as.query(D.queue, queueArgs(f.network, f.reader, ALL)))).toBe("notFound")
    expect(await codeOf(f.reader.as.query(D.pendingQueue, queueArgs(f.network, f.reader, ALL)))).toBe("notFound")
    expect(await codeOf(f.reader.as.query(D.appealQueue, { networkId: f.network, expectedPersonId: f.reader.personId, zone: ALL, paginationOpts: PAGE }))).toBe("notFound")
    expect(await codeOf(f.moderator.as.query(D.queue, { ...queueArgs(f.network, f.moderator, ALL), zone: { kind: "country", country: "ZZ" } }))).toBe("invalidArgument")
  })

  it("borne chaque fenêtre et garde le curseur d'une fenêtre filtrée vide", async () => {
    const f = await fixture()
    const postBe = await post(f.t, f.network, f.author.personId, { country: "BE" })
    const postFr = await post(f.t, f.network, f.author.personId, { country: "FR" })
    await report(f.t, f.network, { kind: "post", id: postBe }, { at: NOW - 10_000 })
    const wanted = await report(f.t, f.network, { kind: "post", id: postFr }, { at: NOW - 5_000 })
    const first = await f.moderator.as.query(D.queue, { ...queueArgs(f.network, f.moderator, FR), paginationOpts: { cursor: null, numItems: 1 } })
    expect(first.items).toEqual([])
    expect(first.isDone).toBe(false)
    expect(first.continueCursor).not.toBeNull()
    const next = await f.moderator.as.query(D.queue, { ...queueArgs(f.network, f.moderator, FR), paginationOpts: { cursor: first.continueCursor, numItems: 1 } })
    expect(next.items.map((row) => row.reportId)).toEqual([wanted])

    for (let index = 0; index < DESK_WINDOW_MAX + 5; index += 1) await report(f.t, f.network, { kind: "post", id: postBe })
    const wide = await f.moderator.as.query(D.queue, { ...queueArgs(f.network, f.moderator, BE), paginationOpts: { cursor: null, numItems: 1_000 } })
    expect(wide.items.length).toBeLessThanOrEqual(DESK_WINDOW_MAX)
    expect(wide.isDone).toBe(false)
  })

  it("annonce les conflits : auteur, déclarant, signataire de la page visée", async () => {
    const f = await fixture()
    const signed = await page(f.t, f.network, "FR")
    await f.t.run(async (ctx) => {
      await ctx.db.insert("pageSignatories", { networkId: f.network, pageId: signed, personId: f.moderator.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    })
    const own = await post(f.t, f.network, f.moderator.personId, { country: "FR" })
    const other = await post(f.t, f.network, f.author.personId, { country: "FR" })
    const asAuthor = await report(f.t, f.network, { kind: "post", id: own }, { ownerPersonId: f.moderator.personId, reporterPersonId: f.reader.personId })
    const asReporter = await report(f.t, f.network, { kind: "post", id: other }, { ownerPersonId: f.author.personId, reporterPersonId: f.moderator.personId })
    const asSignatory = await report(f.t, f.network, { kind: "page", id: signed })
    const items = (await f.moderator.as.query(D.queue, queueArgs(f.network, f.moderator, FR))).items
    const partyOf = (reportId: Id<"reports">) => items.find((row) => row.reportId === reportId)?.party
    expect(partyOf(asAuthor)).toBe("author")
    expect(partyOf(asReporter)).toBe("reporter")
    expect(partyOf(asSignatory)).toBe("page")
    // Le moteur garde lui-même le conflit d'auteur : la mutation existante refuse.
    expect(await codeOf(f.moderator.as.mutation(CASES.decide, { networkId: f.network, reportId: asAuthor, decision: "dismissed", reason: "Tentative sur son propre contenu.", sanctions: [] }))).toBe("notFound")
  })
})

describe("décision — par la mutation existante du moteur", () => {
  it("un dossier tranché quitte la file et devient l'historique du dossier suivant sur la même cible", async () => {
    const f = await fixture()
    const postFr = await post(f.t, f.network, f.author.personId, { country: "FR" })
    const first = await report(f.t, f.network, { kind: "post", id: postFr }, { ownerPersonId: f.author.personId, reporterPersonId: f.reader.personId })
    const second = await report(f.t, f.network, { kind: "post", id: postFr }, { ownerPersonId: f.author.personId })
    expect((await f.moderator.as.query(D.caseDetail, { networkId: f.network, expectedPersonId: f.moderator.personId, reportId: first })).history).toEqual([])

    await f.moderator.as.mutation(CASES.decide, { networkId: f.network, reportId: first, decision: "dismissed", reason: "Signalement non fondé après examen.", sanctions: [] })

    expect((await f.moderator.as.query(D.queue, queueArgs(f.network, f.moderator, FR))).items.map((row) => row.reportId)).toEqual([second])
    expect(await codeOf(f.moderator.as.query(D.caseDetail, { networkId: f.network, expectedPersonId: f.moderator.personId, reportId: first }))).toBe("notFound")
    const detail = await f.moderator.as.query(D.caseDetail, { networkId: f.network, expectedPersonId: f.moderator.personId, reportId: second })
    expect(detail.case).toMatchObject({ reportId: second, country: "FR", party: null })
    expect(detail.history).toEqual([{ status: "dismissed", origin: "reader", decidedAt: NOW, decisionReason: "Signalement non fondé après examen.", sanctions: [] }])
    expect(detail.historyMore).toBe(false)
    expect(JSON.stringify(detail)).not.toContain(f.reader.personId)
    expect(await codeOf(f.reader.as.query(D.caseDetail, { networkId: f.network, expectedPersonId: f.reader.personId, reportId: second }))).toBe("notFound")
  })
})

describe("équipes — la file d'une équipe et sa composition", () => {
  it("compose une équipe par les mutations du moteur et sert sa seule file à son membre", async () => {
    const f = await fixture()
    const { teamId } = await f.admin.as.mutation(CASES.createTeam, { networkId: f.network, name: "Équipe France (fixture)", reason: "Ouverture de la modération France." })
    expect(await f.admin.as.query(D.teamCandidate, { networkId: f.network, expectedPersonId: f.admin.personId, handle: "@lectrice.fixture" })).toEqual({
      personId: f.reader.personId, handle: "lectrice.fixture", displayName: "lectrice.fixture",
    })
    expect(await f.admin.as.query(D.teamCandidate, { networkId: f.network, expectedPersonId: f.admin.personId, handle: "inconnu.fixture" })).toBeNull()
    await f.admin.as.mutation(CASES.setTeamMember, { networkId: f.network, teamId, personId: f.reader.personId, active: true, reason: "Modératrice volontaire pour la France." })
    expect(await f.admin.as.query(D.teamRoster, { networkId: f.network, expectedPersonId: f.admin.personId, teamId })).toEqual({
      members: [{ personId: f.reader.personId, handle: "lectrice.fixture", displayName: "lectrice.fixture", inNetwork: true, isMe: false }],
      more: false,
    })

    const postFr = await post(f.t, f.network, f.author.personId, { country: "FR" })
    const forTeam = await report(f.t, f.network, { kind: "post", id: postFr }, { ownerPersonId: f.author.personId, teamId })
    await report(f.t, f.network, { kind: "post", id: postFr }, { ownerPersonId: f.author.personId })
    // Sans rôle réseau, la file du réseau reste fermée ; celle de son équipe s'ouvre.
    expect(await codeOf(f.reader.as.query(D.queue, queueArgs(f.network, f.reader, ALL)))).toBe("notFound")
    const mine = await f.reader.as.query(D.queue, queueArgs(f.network, f.reader, FR, { teamId }))
    expect(mine.items.map((row) => row.reportId)).toEqual([forTeam])
    expect(mine.items[0]).toMatchObject({ level: "team", teamName: "Équipe France (fixture)" })

    // La composition et la recherche de membres restent à l'administration du réseau.
    expect(await codeOf(f.reader.as.query(D.teamRoster, { networkId: f.network, expectedPersonId: f.reader.personId, teamId }))).toBe("notFound")
    expect(await codeOf(f.moderator.as.query(D.teamCandidate, { networkId: f.network, expectedPersonId: f.moderator.personId, handle: "lectrice.fixture" }))).toBe("notFound")

    await f.admin.as.mutation(CASES.setTeamMember, { networkId: f.network, teamId, personId: f.reader.personId, active: false, reason: "Fin de la mission de modération." })
    expect(await codeOf(f.reader.as.query(D.queue, queueArgs(f.network, f.reader, FR, { teamId })))).toBe("notFound")
    expect(await f.reader.as.query(D.myDesk, { networkId: f.network, expectedPersonId: f.reader.personId })).toBeNull()
  })
})

describe("relecture préalable — pages à vérifier, évènements en relecture", () => {
  it("range les contenus en relecture au pays de leur cible et refuse un membre sans compétence", async () => {
    const f = await fixture()
    const pageFr = await page(f.t, f.network, "FR")
    await f.t.run(async (ctx) => {
      await ctx.db.insert("moderationContentStates", { networkId: f.network, targetKind: "page", targetId: pageFr, status: "pending_review", createdAt: NOW, updatedAt: NOW })
    })
    const fr = await f.moderator.as.query(D.pendingQueue, queueArgs(f.network, f.moderator, FR))
    expect(fr.items).toEqual([{ target: { kind: "page", id: pageFr }, surface: "page", country: "FR", teamName: null, updatedAt: NOW, party: null }])
    expect((await f.moderator.as.query(D.pendingQueue, queueArgs(f.network, f.moderator, BE))).items).toEqual([])
    expect(await codeOf(f.reader.as.query(D.pendingQueue, queueArgs(f.network, f.reader, FR)))).toBe("notFound")
  })
})

describe("DL-03 — un commentaire de direct retenu entre au guichet", () => {
  it("range le commentaire au pays de la page de sa session, comme le direct, et le sert sous sa nature", async () => {
    const f = await fixture()
    const pageFr = await page(f.t, f.network, "FR")
    const commentId = await f.t.run(async (ctx) => {
      const sessionId = await ctx.db.insert("liveSessions", {
        networkId: f.network, hostPersonId: f.author.personId, title: "Direct de fixture", roomName: "direct-guichet-fixture", status: "live",
        audience: "public", pageId: pageFr, chatMode: "open", maxViewers: 100, replayRequested: false, createdAt: NOW, updatedAt: NOW,
      })
      const id = await ctx.db.insert("liveComments", { networkId: f.network, sessionId, authorPersonId: f.reader.personId, body: "Commentaire de fixture", status: "pending_review", offsetMs: 0, createdAt: NOW })
      await ctx.db.insert("moderationContentStates", { networkId: f.network, targetKind: "liveComment", targetId: id, ownerPersonId: f.reader.personId, status: "pending_review", createdAt: NOW, updatedAt: NOW })
      return id
    })
    const expected = { target: { kind: "liveComment", id: commentId }, surface: "liveComment", country: "FR", teamName: null, updatedAt: NOW, party: null }
    expect((await f.moderator.as.query(D.pendingQueue, queueArgs(f.network, f.moderator, FR))).items).toEqual([expected])
    expect((await f.moderator.as.query(D.pendingQueue, queueArgs(f.network, f.moderator, ALL, { surface: "liveComment" }))).items).toEqual([expected])
    expect((await f.moderator.as.query(D.pendingQueue, queueArgs(f.network, f.moderator, BE))).items).toEqual([])
  })
})

describe("MC-01 — un groupe thématique et un message personnel entrent au guichet", () => {
  const PREVIEW = api.modules.moderation.reviewProjection.preview

  async function setRole(t: T, networkId: Id<"networks">, personId: Id<"persons">, role: Role): Promise<void> {
    await t.run(async (ctx) => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique()
      if (row) await ctx.db.patch(row._id, { role })
    })
  }

  /** Un groupe posé tel quel : son pays, ou sa page d'association ; son propriétaire vivant s'il en a un. */
  async function group(t: T, networkId: Id<"networks">, creatorPersonId: Id<"persons">, fields: { country?: string; associationPageId?: Id<"pages"> } = {}): Promise<Id<"thematicGroups">> {
    sequence += 1
    const name = `Groupe fictif ${sequence}`
    return await t.run(async (ctx) => {
      const groupId = await ctx.db.insert("thematicGroups", {
        networkId,
        name,
        description: "Thème de fixture",
        rules: "Règles de fixture",
        rulesVersion: 1,
        ...(fields.country ? { country: fields.country } : {}),
        ...(fields.associationPageId ? { associationPageId: fields.associationPageId } : {}),
        createdByPersonId: creatorPersonId,
        searchText: name.toLowerCase(),
        idempotencyKey: `groupe-${sequence}`,
        createdAt: NOW,
        updatedAt: NOW,
      })
      if (!fields.associationPageId) await ctx.db.insert("thematicGroupMembers", { networkId, groupId, personId: creatorPersonId, role: "owner", joinedAt: NOW })
      return groupId
    })
  }

  it("range un groupe au pays du groupe, sinon à celui de sa page d'association, et dit qui le tient", async () => {
    const f = await fixture()
    const groupBe = await group(f.t, f.network, f.author.personId, { country: "BE" })
    const pageFr = await page(f.t, f.network, "FR")
    const groupOfPage = await group(f.t, f.network, f.author.personId, { associationPageId: pageFr })
    await f.t.run(async (ctx) => {
      // La modératrice du réseau modère aussi le groupe belge ; l'administrateur signe la page française.
      await ctx.db.insert("thematicGroupMembers", { networkId: f.network, groupId: groupBe, personId: f.moderator.personId, role: "moderator", joinedAt: NOW })
      await ctx.db.insert("pageSignatories", { networkId: f.network, pageId: pageFr, personId: f.admin.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    })
    // Le geste réel du moteur : le dossier naît dans le réseau DIASPORALE, propriétaire vivant posé.
    const { reportId: onGroupBe } = await f.reader.as.mutation(CASES.report, { networkId: f.network, target: { kind: "thematicGroup", id: groupBe }, reason: "misinformation" })
    expect(await f.t.run(async (ctx) => await ctx.db.get(onGroupBe))).toMatchObject({ networkId: f.network, targetKind: "thematicGroup", ownerPersonId: f.author.personId })
    const onGroupOfPage = await report(f.t, f.network, { kind: "thematicGroup", id: groupOfPage }, { reporterPersonId: f.reader.personId, reason: "spam" })

    const ids = async (viewer: Member, zone: typeof ALL | typeof NONE | typeof FR | typeof BE) =>
      (await viewer.as.query(D.queue, queueArgs(f.network, viewer, zone, { surface: "thematicGroup" }))).items.map((row) => row.reportId)
    expect(await ids(f.admin, BE)).toEqual([onGroupBe])
    expect(await ids(f.admin, FR)).toEqual([onGroupOfPage])
    expect(await ids(f.admin, NONE)).toEqual([])
    expect(await ids(f.admin, ALL)).toEqual([onGroupBe, onGroupOfPage])

    // Qui tient le groupe ne tranche pas : modérateur du groupe (« group »), signataire de sa page (« page »).
    const asModerator = (await f.moderator.as.query(D.queue, queueArgs(f.network, f.moderator, ALL))).items
    expect(asModerator.find((row) => row.reportId === onGroupBe)).toEqual({
      reportId: onGroupBe, surface: "thematicGroup", country: "BE", reason: "misinformation", status: "open", level: "network",
      teamName: null, createdAt: expect.any(Number), hasAuthor: true, party: "group",
    })
    expect(asModerator.find((row) => row.reportId === onGroupOfPage)).toMatchObject({ country: "FR", hasAuthor: false, party: null })
    expect(await codeOf(f.moderator.as.mutation(CASES.decide, { networkId: f.network, reportId: onGroupBe, decision: "dismissed", reason: "Tentative sur son propre groupe.", sanctions: [] }))).toBe("notFound")
    const asAdmin = (await f.admin.as.query(D.queue, queueArgs(f.network, f.admin, ALL))).items
    expect(asAdmin.find((row) => row.reportId === onGroupOfPage)?.party).toBe("page")
    expect(asAdmin.find((row) => row.reportId === onGroupBe)?.party).toBeNull()
    expect((await f.admin.as.query(D.caseDetail, { networkId: f.network, expectedPersonId: f.admin.personId, reportId: onGroupBe })).case).toMatchObject({ surface: "thematicGroup", country: "BE", party: null })

    // L'aperçu que lit le guichet : la fiche et les règles seules, ni membre, ni propriétaire, ni déclarant.
    const preview = await f.admin.as.query(PREVIEW, { networkId: f.network, reportId: onGroupBe })
    expect(preview).toEqual({ kind: "thematicGroup", available: true, title: expect.stringMatching(/^Groupe fictif \d+$/), body: "Thème de fixture\n\nRègles de fixture", media: [] })
    for (const secret of [f.author.personId, f.reader.personId, f.moderator.personId]) expect(JSON.stringify(preview)).not.toContain(secret)
    // La file ne porte aucun contenu.
    expect(JSON.stringify(asAdmin)).not.toContain("Thème de fixture")

    // Une nature signalable seulement reste typée si un état de modération la porte (posé tel quel).
    await f.t.run(async (ctx) => {
      await ctx.db.insert("moderationContentStates", { networkId: f.network, targetKind: "thematicGroup", targetId: groupBe, status: "pending_review", createdAt: NOW, updatedAt: NOW })
    })
    expect((await f.moderator.as.query(D.pendingQueue, queueArgs(f.network, f.moderator, BE))).items).toEqual([
      { target: { kind: "thematicGroup", id: groupBe }, surface: "thematicGroup", country: "BE", teamName: null, updatedAt: NOW, party: "group" },
    ])
  })

  it("range un message personnel « sans pays », dit ses deux parties et n'en montre que le texte signalé", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => {
      const [low, high] = f.author.personId < f.reader.personId ? [f.author.personId, f.reader.personId] : [f.reader.personId, f.author.personId]
      await ctx.db.insert("connections", { networkId: f.network, personIdLow: low, personIdHigh: high, requestedByPersonId: f.author.personId, recipientPersonId: f.reader.personId, status: "accepted", requestedAt: NOW, respondedAt: NOW, updatedAt: NOW })
    })
    const MSG = api.modules.messaging
    const { threadId } = await f.author.as.mutation(MSG.inbox.startThreadWithHandle, { networkId: f.network, handle: "lectrice.fixture", initialMessage: "Message voisin de fixture" })
    const { messageId } = await f.author.as.mutation(MSG.messages.sendMessage, { networkId: f.network, threadId, content: "Message signalé de fixture" })
    const { reportId } = await f.reader.as.mutation(CASES.report, { networkId: f.network, target: { kind: "personalMessage", id: messageId }, reason: "spam" })

    const ids = async (zone: typeof ALL | typeof NONE | typeof FR | typeof BE) =>
      (await f.moderator.as.query(D.queue, queueArgs(f.network, f.moderator, zone))).items.map((row) => row.reportId)
    expect(await ids(NONE)).toEqual([reportId])
    expect(await ids(FR)).toEqual([])
    // La facette de résidence des deux parties (FR) n'est jamais lue.
    expect(await ids(ALL)).toEqual([reportId])
    const onlyMessages = await f.moderator.as.query(D.queue, queueArgs(f.network, f.moderator, ALL, { surface: "personalMessage" }))
    expect(onlyMessages.items).toEqual([{
      reportId, surface: "personalMessage", country: null, reason: "spam", status: "open", level: "network",
      teamName: null, createdAt: expect.any(Number), hasAuthor: true, party: null,
    }])
    for (const secret of [f.author.personId, f.reader.personId, threadId, messageId, "Message signalé", "Message voisin"]) expect(JSON.stringify(onlyMessages)).not.toContain(secret)
    expect((await f.moderator.as.query(D.caseDetail, { networkId: f.network, expectedPersonId: f.moderator.personId, reportId })).case).toMatchObject({ surface: "personalMessage", country: null })

    // L'aperçu que lit le guichet : LE message signalé, borné, sans pièce, sans participant, sans voisin.
    const preview = await f.moderator.as.query(PREVIEW, { networkId: f.network, reportId })
    expect(preview).toEqual({ kind: "personalMessage", available: true, title: null, body: "Message signalé de fixture", media: [] })
    for (const secret of [f.author.personId, f.reader.personId, threadId, "Message voisin"]) expect(JSON.stringify(preview)).not.toContain(secret)

    // Les deux parties du fil sont l'auteur du message et son déclarant : ni l'une ni l'autre ne tranche.
    await setRole(f.t, f.network, f.author.personId, "network_moderator")
    await setRole(f.t, f.network, f.reader.personId, "network_moderator")
    expect((await f.author.as.query(D.queue, queueArgs(f.network, f.author, NONE))).items[0]?.party).toBe("author")
    expect((await f.reader.as.query(D.queue, queueArgs(f.network, f.reader, NONE))).items[0]?.party).toBe("reporter")
    expect(await codeOf(f.reader.as.mutation(CASES.decide, { networkId: f.network, reportId, decision: "actioned", reason: "Décision sur son propre fil.", sanctions: [] }))).toBe("notFound")
  })
})

describe("recours du réseau — à l'administration seule, par pays", () => {
  it("sert les recours d'équipe du pays demandé, avec l'incompatibilité de l'ancien décideur", async () => {
    const f = await fixture()
    const teamId = await f.t.run(async (ctx) => ctx.db.insert("moderationTeams", { networkId: f.network, name: "France (fixture)", active: true, createdAt: NOW }))
    const postFr = await post(f.t, f.network, f.author.personId, { country: "FR" })
    const ids = await f.t.run(async (ctx) => {
      const reportId = await ctx.db.insert("reports", {
        networkId: f.network, target: { kind: "post", id: postFr }, targetKind: "post", targetId: postFr, ownerPersonId: f.author.personId,
        reporterPersonId: f.reader.personId, reason: "harassment", teamId, level: "team", status: "actioned",
        reviewedByPersonId: f.moderator.personId, reviewedAt: NOW, decisionReason: "Propos insultants confirmés.", createdAt: NOW, updatedAt: NOW,
      })
      await ctx.db.insert("sanctions", { networkId: f.network, reportId, personId: f.author.personId, target: { kind: "post", id: postFr }, kind: "warning", status: "active", reason: "Propos insultants confirmés.", createdAt: NOW, updatedAt: NOW })
      const appealId = await ctx.db.insert("appeals", { networkId: f.network, reportId, personId: f.author.personId, reason: "Je demande un réexamen.", level: "network", status: "open", createdAt: NOW, updatedAt: NOW })
      return { reportId, appealId }
    })
    const args = (zone: typeof ALL | typeof FR | typeof BE) => ({ networkId: f.network, expectedPersonId: f.admin.personId, zone, paginationOpts: PAGE })
    expect((await f.admin.as.query(D.appealQueue, args(FR))).items).toEqual([{
      appealId: ids.appealId, reportId: ids.reportId, surface: "post", country: "FR", reason: "harassment", appealReason: "Je demande un réexamen.",
      createdAt: NOW, decisionReason: "Propos insultants confirmés.", decidedAt: NOW, sanctions: [{ kind: "warning", until: null }], party: null,
    }])
    expect((await f.admin.as.query(D.appealQueue, args(BE))).items).toEqual([])
    expect(await codeOf(f.moderator.as.query(D.appealQueue, { ...args(ALL), expectedPersonId: f.moderator.personId }))).toBe("notFound")

    // L'ancien décideur devenu administrateur ne tranche pas le recours : l'écran le dit, le moteur le refuse.
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.network).eq("personId", f.moderator.personId)).unique()
      if (row) await ctx.db.patch(row._id, { role: "network_admin" })
    })
    const asDecider = await f.moderator.as.query(D.appealQueue, { ...args(ALL), expectedPersonId: f.moderator.personId })
    expect(asDecider.items[0]?.party).toBe("decider")
    expect(await codeOf(f.moderator.as.mutation(CASES.reviewNetworkAppeal, { networkId: f.network, appealId: ids.appealId, overturn: true, reason: "Réexamen par l'ancien décideur." }))).toBe("notFound")

    await f.admin.as.mutation(CASES.reviewNetworkAppeal, { networkId: f.network, appealId: ids.appealId, overturn: false, reason: "Décision confirmée après examen indépendant." })
    expect((await f.admin.as.query(D.appealQueue, args(ALL))).items).toEqual([])
  })
})

describe("MD-04 — réglages de modération de DIASPORALE, réseau gouverné par la tranche", () => {
  it("l'administration du réseau lit les défauts du moteur et la règle de chaque rubrique, puis pose un réglage et un mot bloqué motivés, inscrits au journal", async () => {
    const f = await fixture()
    const initial = await f.admin.as.query(CASES.policies, { networkId: f.network })
    expect(initial.defaults).toEqual(MODERATION_POLICY_DEFAULTS)
    const rule = (surface: string) => initial.surfaces.find((row) => row.surface === surface)?.withoutPolicy
    // Sans réglage : la vague H publiée sans règle, avis et réponses relus d'office, le reste aux défauts du moteur.
    expect(["diasporaJobOffer", "diasporaKitResource", "serviceReview", "serviceReviewReply", "event", "post", "page"].map(rule)).toEqual(["unchecked", "unchecked", "held", "held", "defaults", "defaults", "defaults"])
    expect(initial.surfaces.every((row) => row.policy === null)).toBe(true)

    const { maxLinks, maxWrites, windowMs } = MODERATION_POLICY_DEFAULTS
    await f.admin.as.mutation(CASES.setPolicy, { networkId: f.network, surface: "diasporaJobOffer", preReview: true, maxLinks, maxWrites, windowMs, reason: "Relecture des offres d'emploi au lancement du pilote." })
    await f.admin.as.mutation(CASES.setBlockedTerm, { networkId: f.network, term: "  Consulat ", active: true, reason: "Nom réservé aux postes consulaires." })
    const settings = await f.admin.as.query(CASES.policies, { networkId: f.network })
    expect(settings.surfaces.find((row) => row.surface === "diasporaJobOffer")?.policy).toMatchObject({ preReview: true, maxLinks, maxWrites, windowMs })
    expect((await f.admin.as.query(CASES.blockedTermsPage, { networkId: f.network, paginationOpts: PAGE })).page.map((row) => row.term)).toEqual(["consulat"])

    const audit = await f.t.run(async (ctx) =>
      (await ctx.db.query("engineAudit").withIndex("by_network_at", (q) => q.eq("networkId", f.network)).take(100))
        .filter((row) => row.action === "moderation.policy_set" || row.action === "moderation.term_set"),
    )
    expect(audit.map((row) => ({ action: row.action, capacity: row.capacity, actorPersonId: row.actorPersonId, details: row.details }))).toMatchObject([
      { action: "moderation.policy_set", capacity: "network_admin", actorPersonId: f.admin.personId, details: { reason: "Relecture des offres d'emploi au lancement du pilote.", surface: "diasporaJobOffer", preReview: true } },
      { action: "moderation.term_set", capacity: "network_admin", actorPersonId: f.admin.personId, details: { reason: "Nom réservé aux postes consulaires.", active: true } },
    ])
  })

  it("un modérateur du réseau et un simple membre reçoivent le même refus, sans écriture", async () => {
    const f = await fixture()
    for (const person of [f.moderator, f.reader]) {
      expect(await codeOf(person.as.query(CASES.policies, { networkId: f.network }))).toBe("notFound")
      expect(await codeOf(person.as.query(CASES.blockedTermsPage, { networkId: f.network, paginationOpts: PAGE }))).toBe("notFound")
      expect(await codeOf(person.as.mutation(CASES.setPolicy, { networkId: f.network, surface: "event", preReview: false, maxLinks: 0, maxWrites: 1, windowMs: 60_000, reason: "Tentative sans le droit de régler." }))).toBe("notFound")
      expect(await codeOf(person.as.mutation(CASES.setBlockedTerm, { networkId: f.network, term: "ambassade", active: true, reason: "Tentative sans le droit de régler." }))).toBe("notFound")
    }
    const counts = await f.t.run(async (ctx) => ({
      policies: (await ctx.db.query("moderationPolicies").withIndex("by_network_surface", (q) => q.eq("networkId", f.network)).take(5)).length,
      terms: (await ctx.db.query("blockedTerms").withIndex("by_network_active", (q) => q.eq("networkId", f.network)).take(5)).length,
    }))
    expect(counts).toEqual({ policies: 0, terms: 0 })
  })
})

describe("AS-01 — pages à vérifier : les revendications en attente, par pays de la page", () => {
  async function claim(t: T, networkId: Id<"networks">, pageId: Id<"pages">, claimantPersonId: Id<"persons">, fields: { status?: "pending" | "approved"; at?: number; evidence?: number } = {}): Promise<Id<"pageClaims">> {
    sequence += 1
    const at = fields.at ?? NOW + sequence
    return await t.run(async (ctx) => {
      const evidenceStorageIds: Id<"_storage">[] = []
      for (let n = 0; n < (fields.evidence ?? 0); n++) evidenceStorageIds.push(await ctx.storage.store(new Blob([`pièce fictive ${n}`])))
      return ctx.db.insert("pageClaims", { networkId, pageId, claimantPersonId, evidenceStorageIds, status: fields.status ?? "pending", createdAt: at, updatedAt: at })
    })
  }
  const claimArgs = (networkId: Id<"networks">, viewer: Member, zone: typeof ALL | typeof NONE | typeof FR | typeof BE) => ({ networkId, expectedPersonId: viewer.personId, zone, paginationOpts: PAGE })

  it("range les demandes en attente au pays de leur page, la plus ancienne d'abord, sans note ni pièce ni demandeur", async () => {
    const f = await fixture()
    const pageFr = await page(f.t, f.network, "FR")
    const pageBe = await page(f.t, f.network, "BE")
    const pageNone = await page(f.t, f.network, null)
    const fr = await claim(f.t, f.network, pageFr, f.author.personId, { at: NOW + 1, evidence: 2 })
    const be = await claim(f.t, f.network, pageBe, f.reader.personId, { at: NOW + 2 })
    const none = await claim(f.t, f.network, pageNone, f.author.personId, { at: NOW + 3 })
    await claim(f.t, f.network, pageFr, f.reader.personId, { status: "approved" })

    const all = await f.moderator.as.query(D.pageClaimQueue, claimArgs(f.network, f.moderator, ALL))
    expect(all.items.map((row) => row.claimId)).toEqual([fr, be, none])
    expect(all.items[0]).toMatchObject({ claimId: fr, country: "FR", evidenceCount: 2, createdAt: NOW + 1, party: null, page: { pageId: pageFr, badge: "community", ownerKind: "association" } })
    expect(Object.keys(all.items[0] ?? {}).sort()).toEqual(["claimId", "country", "createdAt", "evidenceCount", "page", "party"])
    expect((await f.moderator.as.query(D.pageClaimQueue, claimArgs(f.network, f.moderator, FR))).items.map((row) => row.claimId)).toEqual([fr])
    expect((await f.moderator.as.query(D.pageClaimQueue, claimArgs(f.network, f.moderator, BE))).items.map((row) => row.claimId)).toEqual([be])
    expect((await f.moderator.as.query(D.pageClaimQueue, claimArgs(f.network, f.moderator, NONE))).items.map((row) => row.claimId)).toEqual([none])
    // L'administration du réseau lit la même file.
    expect((await f.admin.as.query(D.pageClaimQueue, claimArgs(f.network, f.admin, ALL))).items).toHaveLength(3)
  })

  it("dit le conflit d'intérêts : le demandeur, et toute personne qui a une ligne de signataire sur la page, même invitée", async () => {
    const f = await fixture()
    const own = await page(f.t, f.network, "FR")
    const signed = await page(f.t, f.network, "FR")
    const free = await page(f.t, f.network, "FR")
    await f.t.run(async (ctx) => {
      // Une invitation en attente (aucune acceptation) suffit à écarter le décideur.
      await ctx.db.insert("pageSignatories", { networkId: f.network, pageId: signed, personId: f.moderator.personId, role: "signatory", createdAt: NOW, updatedAt: NOW })
    })
    const byModerator = await claim(f.t, f.network, own, f.moderator.personId, { at: NOW + 1 })
    const onSigned = await claim(f.t, f.network, signed, f.author.personId, { at: NOW + 2 })
    const onFree = await claim(f.t, f.network, free, f.author.personId, { at: NOW + 3 })
    const rows = (await f.moderator.as.query(D.pageClaimQueue, claimArgs(f.network, f.moderator, ALL))).items
    expect(rows.map((row) => [row.claimId, row.party])).toEqual([[byModerator, "author"], [onSigned, "page"], [onFree, null]])
  })

  it("refuse indistinctement un membre sans rôle ni équipe compétente, une équipe d'une autre nature, un autre réseau et une autre personne attendue", async () => {
    const f = await fixture()
    const pageFr = await page(f.t, f.network, "FR")
    await claim(f.t, f.network, pageFr, f.author.personId)
    const teamId = await f.t.run(async (ctx) => ctx.db.insert("moderationTeams", { networkId: f.network, name: "Publications (fixture)", scope: "post", active: true, createdAt: NOW }))
    await f.t.run(async (ctx) => ctx.db.insert("moderationTeamMembers", { networkId: f.network, teamId, personId: f.reader.personId, active: true, updatedAt: NOW }))
    // Une équipe d'une autre nature ne gagne rien sur les pages (`pages/claims.pageClaimReviewCapacity`).
    expect(await codeOf(f.reader.as.query(D.pageClaimQueue, claimArgs(f.network, f.reader, ALL)))).toBe("notFound")
    expect(await codeOf(f.author.as.query(D.pageClaimQueue, claimArgs(f.network, f.author, ALL)))).toBe("notFound")
    expect(await codeOf(f.moderator.as.query(D.pageClaimQueue, claimArgs(f.root, f.moderator, ALL)))).toBe("notFound")
    expect(await codeOf(f.moderator.as.query(D.pageClaimQueue, { ...claimArgs(f.network, f.moderator, ALL), expectedPersonId: f.reader.personId }))).toBe("notFound")
  })

  it("admet le membre de l'équipe vivante compétente pour les pages, comme `pages/claims` : l'équipe « page », à défaut l'équipe sans nature", async () => {
    const f = await fixture()
    const pageFr = await page(f.t, f.network, "FR")
    const pending = await claim(f.t, f.network, pageFr, f.moderator.personId)
    const general = await f.t.run(async (ctx) => ctx.db.insert("moderationTeams", { networkId: f.network, name: "Générale (fixture)", active: true, createdAt: NOW }))
    await f.t.run(async (ctx) => ctx.db.insert("moderationTeamMembers", { networkId: f.network, teamId: general, personId: f.reader.personId, active: true, updatedAt: NOW }))
    // Sans équipe « page », l'équipe sans nature reçoit les signalements de page : son membre instruit.
    const read = await f.reader.as.query(D.pageClaimQueue, claimArgs(f.network, f.reader, ALL))
    expect(read.items.map((row) => [row.claimId, row.party])).toEqual([[pending, null]])
    expect(await f.reader.as.query(api.modules.pages.claims.myPageClaimReview, { networkId: f.network })).toEqual({ canReview: true })

    // Une équipe « page » vivante prend la compétence : son membre lit la file, l'équipe sans nature la perd.
    const pages = await f.t.run(async (ctx) => ctx.db.insert("moderationTeams", { networkId: f.network, name: "Pages (fixture)", scope: "page", active: true, createdAt: NOW }))
    await f.t.run(async (ctx) => ctx.db.insert("moderationTeamMembers", { networkId: f.network, teamId: pages, personId: f.author.personId, active: true, updatedAt: NOW }))
    expect((await f.author.as.query(D.pageClaimQueue, claimArgs(f.network, f.author, FR))).items.map((row) => row.claimId)).toEqual([pending])
    expect(await codeOf(f.reader.as.query(D.pageClaimQueue, claimArgs(f.network, f.reader, ALL)))).toBe("notFound")
    expect(await f.reader.as.query(api.modules.pages.claims.myPageClaimReview, { networkId: f.network })).toEqual({ canReview: false })
  })
})
