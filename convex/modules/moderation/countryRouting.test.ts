// @vitest-environment edge-runtime
/**
 * CH-815 (ADR-0042, amendement « Routage des signalements par pays ») — un dossier va à l'équipe du PAYS du
 * contenu, puis de sa nature : équipe du pays et de la nature, équipe généraliste du pays, équipe sans pays de
 * la nature, équipe sans pays généraliste, sinon le réseau. Un contenu sans pays ne va jamais à une équipe d'un
 * pays ; le pays est celui que porte le contenu (règle du guichet par pays), jamais celui d'une personne. La
 * même règle choisit l'équipe d'un contenu en relecture préalable et celle d'une revendication de page. Un
 * réseau dont aucune équipe n'a de pays (la racine) route comme avant. Données de fixture fictives.
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { joinDeclaredDiasporaFixture, openNetworkFeatures, testConvex } from "../../test.setup"
import { canReadModeratedContent } from "./policy"

type T = ReturnType<typeof testConvex>
type Member = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons"> }
type Role = Doc<"networkMemberships">["role"]
type Target = Doc<"reports">["target"]

const CASES = api.modules.moderation.cases
const LEGACY = api.modules.moderation.moderation
const DESK = api.modules.diaspora.moderationDesk
const CLAIMS = api.modules.pages.claims
const NOW = Date.UTC(2026, 10, 23, 9)
const PAGE = { cursor: null, numItems: 20 }
const ALL = { kind: "all" as const }

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    return engineErrorCode(error)
  }
  return null
}

/** Un membre DÉCLARÉ de DIASPORA.GA ; son pays de résidence (toujours la France ici) n'oriente jamais un dossier. */
async function member(t: T, networkId: Id<"networks">, handle: string, role?: Role): Promise<Member> {
  const as = t.withIdentity({ subject: `routage-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await t.run(async (ctx) => {
    await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `idn-${personId}`, loa: 1, nationality: "GA", linkedAt: NOW })
  })
  await joinDeclaredDiasporaFixture(as, { networkId, facet: { countryOfResidence: "FR" } })
  if (role) await setRole(t, networkId, personId, role)
  return { as, personId }
}

async function setRole(t: T, networkId: Id<"networks">, personId: Id<"persons">, role: Role): Promise<void> {
  await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique()
    if (row) await ctx.db.patch(row._id, { role })
  })
}

/** Une équipe ACTIVE posée telle quelle : l'ordre d'insertion est l'ordre de l'index (la plus ancienne d'abord). */
async function team(t: T, networkId: Id<"networks">, name: string, fields: { scope?: Doc<"moderationTeams">["scope"]; country?: string } = {}): Promise<Id<"moderationTeams">> {
  return await t.run(async (ctx) => ctx.db.insert("moderationTeams", { networkId, name, ...fields, active: true, createdAt: NOW }))
}

async function join(t: T, networkId: Id<"networks">, teamId: Id<"moderationTeams">, personId: Id<"persons">): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("moderationTeamMembers", { networkId, teamId, personId, active: true, updatedAt: NOW })
  })
}

let sequence = 0

async function page(t: T, networkId: Id<"networks">, country: string | null): Promise<Id<"pages">> {
  sequence += 1
  const handle = `page-routage-${sequence}`
  return await t.run(async (ctx) =>
    ctx.db.insert("pages", {
      networkId, handle, name: `Association fictive ${sequence}`, ownerKind: "association", trust: "community", trustRank: 0,
      ...(country === null ? {} : { country }), visibility: "network", onRoot: false, status: "active", searchText: handle, createdAt: NOW, updatedAt: NOW,
    }),
  )
}

/** Une publication locale d'un pays (`country`), ou de portée diaspora sans pays. */
async function post(t: T, networkId: Id<"networks">, authorPersonId: Id<"persons">, country: string | null): Promise<Id<"posts">> {
  sequence += 1
  return await t.run(async (ctx) =>
    ctx.db.insert("posts", {
      networkId, authorPersonId, body: `Corps privé de fixture ${sequence}`, audience: "public", visibility: "network", onRoot: false, status: "published",
      searchText: "corps prive de fixture", ...(country === null ? { reach: "diaspora" } : { reach: "local", country }), publishedAt: NOW, createdAt: NOW, updatedAt: NOW,
    }),
  )
}

async function comment(t: T, networkId: Id<"networks">, postId: Id<"posts">, authorPersonId: Id<"persons">): Promise<Id<"postComments">> {
  return await t.run(async (ctx) => ctx.db.insert("postComments", { networkId, postId, authorPersonId, body: "Commentaire privé de fixture", status: "published", createdAt: NOW, updatedAt: NOW }))
}

async function routed(t: T, reportId: Id<"reports">): Promise<{ teamId: Id<"moderationTeams"> | null; level: Doc<"reports">["level"] }> {
  const row = await t.run(async (ctx) => ctx.db.get(reportId))
  return { teamId: row?.teamId ?? null, level: row?.level ?? "platform" }
}

async function diaspora() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  await openNetworkFeatures(t, network)
  const author = await member(t, network, "auteur.routage")
  const reporters = [] as Member[]
  for (let n = 0; n < 6; n++) reporters.push(await member(t, network, `declarant${n}.routage`))
  const moderator = await member(t, network, "moderatrice.routage", "network_moderator")
  const admin = await member(t, network, "administratrice.routage", "network_admin")
  const france = await member(t, network, "equipe.france.routage")
  const spain = await member(t, network, "equipe.espagne.routage")
  return { t, root, network, author, reporters, moderator, admin, france, spain }
}

describe("CH-815 — un signalement va à l'équipe du pays du contenu, puis de sa nature", () => {
  it("équipe du pays et de la nature, puis généraliste du pays, puis équipes sans pays ; la plus ancienne entre deux égales", async () => {
    const f = await diaspora()
    const general = await team(f.t, f.network, "Générale, sans pays")
    const posts = await team(f.t, f.network, "Publications, sans pays", { scope: "post" })
    const france = await team(f.t, f.network, "France", { country: "FR" })
    await team(f.t, f.network, "France, seconde", { country: "FR" })
    const francePosts = await team(f.t, f.network, "France, publications", { scope: "post", country: "FR" })
    await team(f.t, f.network, "Espagne", { country: "ES" })

    const postFr = await post(f.t, f.network, f.author.personId, "FR")
    const postBe = await post(f.t, f.network, f.author.personId, "BE")
    // Un déclarant par cible : signaler masque la publication à son déclarant, et les commentaires qu'elle porte.
    const [a, b, c, d, e, g] = f.reporters as [Member, Member, Member, Member, Member, Member]
    const report = async (who: Member, target: Target) => (await who.as.mutation(CASES.report, { networkId: f.network, target, reason: "harassment" })).reportId

    expect(await routed(f.t, await report(a, { kind: "post", id: postFr }))).toEqual({ teamId: francePosts, level: "team" })
    // Une nature que l'équipe France des publications ne traite pas : la plus ancienne équipe généraliste de France.
    expect(await routed(f.t, await report(b, { kind: "comment", id: await comment(f.t, f.network, postFr, f.author.personId) }))).toEqual({ teamId: france, level: "team" })
    // La Belgique n'a pas d'équipe : les équipes sans pays, par nature puis généraliste.
    expect(await routed(f.t, await report(c, { kind: "comment", id: await comment(f.t, f.network, postBe, f.author.personId) }))).toEqual({ teamId: general, level: "team" })
    expect(await routed(f.t, await report(d, { kind: "post", id: postBe }))).toEqual({ teamId: posts, level: "team" })
    // L'ancienne porte des publications suit la même règle.
    await e.as.mutation(LEGACY.reportPost, { networkId: f.network, postId: postFr, reason: "harassment" })
    const legacy = await f.t.run(async (ctx) => ctx.db.query("reports").withIndex("by_reporter_target", (q) => q.eq("reporterPersonId", e.personId).eq("targetKind", "post").eq("targetId", postFr)).unique())
    expect({ teamId: legacy?.teamId ?? null, level: legacy?.level }).toEqual({ teamId: francePosts, level: "team" })
    // Le déclarant réside en France : son pays n'oriente jamais le dossier d'un contenu de Belgique.
    expect((await routed(f.t, await report(g, { kind: "post", id: postBe }))).teamId).toBe(posts)
  })

  it("un contenu sans pays ne va jamais à une équipe d'un pays : équipe sans pays, sinon le réseau", async () => {
    const f = await diaspora()
    await team(f.t, f.network, "France", { country: "FR" })
    await team(f.t, f.network, "France, publications", { scope: "post", country: "FR" })
    const postNone = await post(f.t, f.network, f.author.personId, null)
    const [a, b] = f.reporters as [Member, Member]
    const first = (await a.as.mutation(CASES.report, { networkId: f.network, target: { kind: "post", id: postNone }, reason: "harassment" })).reportId
    expect(await routed(f.t, first)).toEqual({ teamId: null, level: "network" })
    const general = await team(f.t, f.network, "Générale, sans pays")
    const second = (await b.as.mutation(CASES.report, { networkId: f.network, target: { kind: "post", id: postNone }, reason: "harassment" })).reportId
    expect(await routed(f.t, second)).toEqual({ teamId: general, level: "team" })
  })

  it("le membre de l'équipe du pays voit le dossier dans sa file et le tranche ; celui d'une équipe d'un autre pays, non", async () => {
    const f = await diaspora()
    // L'Espagne d'abord : la plus ancienne équipe généraliste, que l'ancienne règle aurait choisie pour la France.
    const spain = await team(f.t, f.network, "Espagne", { country: "ES" })
    const france = await team(f.t, f.network, "France", { country: "FR" })
    await join(f.t, f.network, france, f.france.personId)
    await join(f.t, f.network, spain, f.spain.personId)
    const postFr = await post(f.t, f.network, f.author.personId, "FR")
    const { reportId } = await (f.reporters[0] as Member).as.mutation(CASES.report, { networkId: f.network, target: { kind: "post", id: postFr }, reason: "harassment" })
    expect((await routed(f.t, reportId)).teamId).toBe(france)

    const queue = (viewer: Member, teamId?: Id<"moderationTeams">) => viewer.as.query(DESK.queue, { networkId: f.network, expectedPersonId: viewer.personId, zone: ALL, ...(teamId ? { teamId } : {}), paginationOpts: PAGE })
    expect((await queue(f.france, france)).items.map((row) => row.reportId)).toEqual([reportId])
    expect((await queue(f.spain, spain)).items).toEqual([])
    expect(await codeOf(queue(f.spain, france))).toBe("notFound")
    expect((await f.france.as.query(DESK.myDesk, { networkId: f.network, expectedPersonId: f.france.personId }))?.teams).toEqual([
      { teamId: france, name: "France", scope: null, country: "FR", isMember: true },
    ])
    // L'administration du réseau garde toute la file ; un modérateur du réseau, la file sans équipe, comme avant.
    expect((await queue(f.admin)).items.map((row) => row.reportId)).toEqual([reportId])
    expect((await queue(f.moderator)).items).toEqual([])

    const decide = (who: Member) => who.as.mutation(CASES.decide, { networkId: f.network, reportId, decision: "dismissed", reason: "Aucun manquement constaté.", sanctions: [] })
    expect(await codeOf(decide(f.spain))).toBe("notFound")
    expect(await decide(f.france)).toEqual({ status: "dismissed" })
    const audit = await f.t.run(async (ctx) => (await ctx.db.query("engineAudit").withIndex("by_network_at", (q) => q.eq("networkId", f.network)).take(50)).filter((row) => row.action === "moderation.report_decide"))
    expect(audit.map((row) => [row.capacity, row.actorPersonId, (row.details as { teamId?: string }).teamId])).toEqual([["moderation_team_member", f.france.personId, france]])
  })
})

describe("CH-815 — la relecture préalable suit la même règle", () => {
  it("un contenu retenu de France revient à l'équipe France : file, aperçu, lecture et décision ; l'équipe Espagne n'y a rien", async () => {
    const f = await diaspora()
    // L'Espagne d'abord : la plus ancienne équipe généraliste, que l'ancienne règle aurait choisie pour la France.
    const spain = await team(f.t, f.network, "Espagne", { country: "ES" })
    const france = await team(f.t, f.network, "France", { country: "FR" })
    await join(f.t, f.network, france, f.france.personId)
    await join(f.t, f.network, spain, f.spain.personId)
    const pageFr = await page(f.t, f.network, "FR")
    const target = { kind: "page" as const, id: pageFr }
    await f.t.run(async (ctx) => {
      await ctx.db.insert("moderationContentStates", { networkId: f.network, targetKind: "page", targetId: pageFr, status: "pending_review", createdAt: NOW, updatedAt: NOW })
    })

    const pending = (viewer: Member, teamId: Id<"moderationTeams">) => viewer.as.query(CASES.paginatePending, { networkId: f.network, teamId, paginationOpts: PAGE })
    expect((await pending(f.france, france)).page.map((row) => row.targetId)).toEqual([pageFr])
    expect((await pending(f.spain, spain)).page).toEqual([])
    const desk = await f.france.as.query(DESK.pendingQueue, { networkId: f.network, expectedPersonId: f.france.personId, zone: ALL, teamId: france, paginationOpts: PAGE })
    expect(desk.items.map((row) => [row.target.id, row.country, row.teamName])).toEqual([[pageFr, "FR", "France"]])
    expect((await f.spain.as.query(DESK.pendingQueue, { networkId: f.network, expectedPersonId: f.spain.personId, zone: ALL, teamId: spain, paginationOpts: PAGE })).items).toEqual([])

    const preview = (viewer: Member) => viewer.as.query(api.modules.moderation.reviewProjection.preview, { networkId: f.network, target })
    expect(await codeOf(preview(f.spain))).toBe("notFound")
    expect(await preview(f.france)).toMatchObject({ kind: "page", available: true })
    const read = (viewer: Member) => f.t.run(async (ctx) => await canReadModeratedContent(ctx, "page", pageFr, viewer.personId))
    expect(await read(f.spain)).toBe(false)
    expect(await read(f.france)).toBe(true)

    const review = (viewer: Member) => viewer.as.mutation(CASES.reviewContent, { networkId: f.network, target, approve: true, reason: "Page conforme aux règles." })
    expect(await codeOf(review(f.spain))).toBe("notFound")
    expect(await review(f.france)).toBeNull()
    const decided = await f.t.run(async (ctx) => ctx.db.query("reports").withIndex("by_target_status", (q) => q.eq("targetKind", "page").eq("targetId", pageFr).eq("status", "dismissed")).unique())
    expect(decided?.teamId).toBe(france)
  })
})

describe("CH-815 — une revendication de page revient à l'équipe du pays de la page", () => {
  it("chaque équipe instruit les pages de son pays ; une page sans pays reste aux équipes sans pays, sinon au réseau", async () => {
    const f = await diaspora()
    // L'Espagne d'abord : la plus ancienne équipe généraliste, que l'ancienne règle aurait choisie pour la France.
    const spain = await team(f.t, f.network, "Espagne", { country: "ES" })
    const france = await team(f.t, f.network, "France", { country: "FR" })
    await join(f.t, f.network, france, f.france.personId)
    await join(f.t, f.network, spain, f.spain.personId)
    const claim = async (pageId: Id<"pages">, at: number) =>
      await f.t.run(async (ctx) => ctx.db.insert("pageClaims", { networkId: f.network, pageId, claimantPersonId: f.author.personId, evidenceStorageIds: [], status: "pending", createdAt: at, updatedAt: at }))
    const onFrance = await claim(await page(f.t, f.network, "FR"), NOW + 1)
    const onSpain = await claim(await page(f.t, f.network, "ES"), NOW + 2)
    const onNone = await claim(await page(f.t, f.network, null), NOW + 3)

    for (const viewer of [f.france, f.spain]) expect(await viewer.as.query(CLAIMS.myPageClaimReview, { networkId: f.network })).toEqual({ canReview: true })
    const desk = async (viewer: Member) => (await viewer.as.query(DESK.pageClaimQueue, { networkId: f.network, expectedPersonId: viewer.personId, zone: ALL, paginationOpts: PAGE })).items.map((row) => row.claimId)
    expect(await desk(f.france)).toEqual([onFrance])
    expect(await desk(f.spain)).toEqual([onSpain])
    expect(await desk(f.moderator)).toEqual([onFrance, onSpain, onNone])
    expect((await f.france.as.query(CLAIMS.paginatePageClaims, { networkId: f.network, paginationOpts: PAGE })).page.map((row) => row.claimId)).toEqual([onFrance])

    expect(await codeOf(f.france.as.query(CLAIMS.getPageClaim, { networkId: f.network, claimId: onSpain }))).toBe("notFound")
    expect(await f.france.as.query(CLAIMS.getPageClaim, { networkId: f.network, claimId: onFrance })).toMatchObject({ claimId: onFrance, canDecide: true })
    expect(await codeOf(f.france.as.query(CLAIMS.getPageClaim, { networkId: f.network, claimId: onNone }))).toBe("notFound")
    const decide = (viewer: Member, claimId: Id<"pageClaims">) => viewer.as.mutation(CLAIMS.decidePageClaim, { networkId: f.network, claimId, decision: "rejected", reason: "Pièces insuffisantes pour la page." })
    expect(await codeOf(decide(f.spain, onFrance))).toBe("notFound")
    expect(await decide(f.france, onFrance)).toEqual({ status: "rejected" })
    const audit = await f.t.run(async (ctx) => (await ctx.db.query("engineAudit").withIndex("by_network_at", (q) => q.eq("networkId", f.network)).take(50)).filter((row) => row.action === "page.claim_decide"))
    expect(audit.map((row) => (row.details as { teamId?: string }).teamId)).toEqual([france])
  })
})

describe("CH-815 — un réseau sans équipe d'un pays route comme avant", () => {
  it("la racine : l'équipe de la nature, puis l'équipe sans nature, même pour un contenu qui porte un pays", async () => {
    const t = testConvex()
    const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
    const enter = async (name: string): Promise<Member> => {
      const as = t.withIdentity({ subject: `routage-racine-${name}` })
      const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
      await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
      await as.mutation(api.modules.people.profile.publishMyProfile, { handle: name, displayName: name })
      await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
      return { as, personId }
    }
    const author = await enter("auteur")
    const reader = await enter("lectrice")
    const other = await enter("lecteur")
    const general = await team(t, root, "Générale")
    const posts = await team(t, root, "Publications", { scope: "post" })
    // Une publication qui porte un pays : la racine n'a aucune équipe d'un pays, le pays n'y change rien.
    const postId = await post(t, root, author.personId, "FR")
    const { reportId } = await reader.as.mutation(CASES.report, { networkId: root, target: { kind: "post", id: postId }, reason: "harassment" })
    expect(await routed(t, reportId)).toEqual({ teamId: posts, level: "team" })
    const commentId = await comment(t, root, postId, author.personId)
    // Un autre déclarant : signaler masque la publication à son seul déclarant, et ses commentaires avec.
    const second = await other.as.mutation(CASES.report, { networkId: root, target: { kind: "comment", id: commentId }, reason: "harassment" })
    expect(await routed(t, second.reportId)).toEqual({ teamId: general, level: "team" })
  })
})
