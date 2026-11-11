// @vitest-environment edge-runtime
/**
 * La qualité inscrite au journal pour une décision de modération (`cases.decide`,
 * `cases.reviewContent`) : celle qui AUTORISAIT l'acte. Le membre actif d'une équipe de
 * modération qui ne tient aucun rôle de réseau tranche comme `moderation_team_member`, avec
 * son équipe dans le détail (comme une revendication de page, AS-01) — jamais comme un
 * modérateur du réseau qu'il n'est pas. Un rôle de réseau garde sa qualité, sans équipe.
 */
import { describe, expect, it } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons"> }
const M = api.modules.moderation.cases
const P = api.modules.posts.posts

async function enter(t: T, root: Id<"networks">, name: string, role?: "network_moderator" | "network_admin"): Promise<Person> {
  const as = t.withIdentity({ subject: `qualite-${name}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle: name, displayName: name })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  if (role) await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", root).eq("personId", personId)).unique()
    if (row) await ctx.db.patch(row._id, { role })
  })
  return { as, personId }
}

/** Une équipe « publications » où siègent une membre sans rôle de réseau et un modérateur du réseau. */
async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const author = await enter(t, root, "auteur")
  const reader = await enter(t, root, "lectrice")
  const member = await enter(t, root, "equipiere")
  const moderator = await enter(t, root, "moderateur", "network_moderator")
  const admin = await enter(t, root, "administratrice", "network_admin")
  const { teamId } = await admin.as.mutation(M.createTeam, { networkId: root, name: "Publications", scope: "post", reason: "Équipe spécialisée." })
  for (const person of [member, moderator]) await admin.as.mutation(M.setTeamMember, { networkId: root, teamId, personId: person.personId, active: true, reason: "Habilitation explicite." })
  return { t, root, author, reader, member, moderator, admin, teamId }
}

async function journal(t: T, subjectTable: "reports", subjectId: string) {
  return await t.run(async (ctx) => await ctx.db.query("engineAudit").withIndex("by_subject_at", (q) => q.eq("subjectTable", subjectTable).eq("subjectId", subjectId)).take(5))
}

describe("qualité au journal d'une décision de modération", () => {
  it("`decide` : le membre d'équipe sans rôle de réseau signe comme tel, avec son équipe ; le modérateur du réseau garde sa qualité", async () => {
    const f = await fixture()
    const reports: Id<"reports">[] = []
    for (const body of ["Première publication signalée", "Seconde publication signalée"]) {
      const { postId } = await f.author.as.mutation(P.publish, { networkId: f.root, body })
      reports.push((await f.reader.as.mutation(M.report, { networkId: f.root, target: { kind: "post", id: postId }, reason: "harassment" })).reportId)
    }
    const [byMember, byModerator] = reports as [Id<"reports">, Id<"reports">]
    // Le moteur adresse ces dossiers à l'équipe des publications.
    expect(await f.t.run(async (ctx) => (await ctx.db.get(byMember))?.teamId)).toBe(f.teamId)

    await f.member.as.mutation(M.decide, { networkId: f.root, reportId: byMember, decision: "dismissed", reason: "Aucun manquement.", sanctions: [] })
    await f.moderator.as.mutation(M.decide, { networkId: f.root, reportId: byModerator, decision: "actioned", reason: "Harcèlement avéré.", sanctions: [] })

    const [memberEntry] = await journal(f.t, "reports", byMember)
    expect(memberEntry).toMatchObject({ action: "moderation.report_decide", capacity: "moderation_team_member", actorPersonId: f.member.personId, details: { decision: "dismissed", teamId: f.teamId } })
    const [moderatorEntry] = await journal(f.t, "reports", byModerator)
    expect(moderatorEntry).toMatchObject({ action: "moderation.report_decide", capacity: "network_moderator", actorPersonId: f.moderator.personId, details: { decision: "actioned" } })
    expect(moderatorEntry?.details).not.toHaveProperty("teamId")
  })

  it("`reviewContent` : même règle pour la relecture préalable, approuvée ou refusée", async () => {
    const f = await fixture()
    await f.admin.as.mutation(M.setPolicy, { networkId: f.root, surface: "post", preReview: true, maxLinks: 2, maxWrites: 100, windowMs: 60_000, reason: "Relecture préalable." })
    const pending: Id<"posts">[] = []
    for (const body of ["Relue par l'équipière", "Relue par le modérateur"]) pending.push((await f.author.as.mutation(P.publish, { networkId: f.root, body })).postId)
    const [first, second] = pending as [Id<"posts">, Id<"posts">]

    await f.member.as.mutation(M.reviewContent, { networkId: f.root, target: { kind: "post", id: first }, approve: true, reason: "Contenu admissible." })
    await f.moderator.as.mutation(M.reviewContent, { networkId: f.root, target: { kind: "post", id: second }, approve: false, reason: "Refus motivé de publication." })

    // borné : le journal de ce réseau de recette tient en quelques lignes.
    const reviews = (await f.t.run(async (ctx) => await ctx.db.query("engineAudit").withIndex("by_network_at", (q) => q.eq("networkId", f.root)).take(50)))
      .filter((row) => row.action === "moderation.content_review")
    expect(reviews).toHaveLength(2)
    const memberEntry = reviews.find((row) => row.actorPersonId === f.member.personId)
    expect(memberEntry).toMatchObject({ capacity: "moderation_team_member", details: { approve: true, surface: "post", teamId: f.teamId } })
    const moderatorEntry = reviews.find((row) => row.actorPersonId === f.moderator.personId)
    expect(moderatorEntry).toMatchObject({ capacity: "network_moderator", details: { approve: false, surface: "post" } })
    expect(moderatorEntry?.details).not.toHaveProperty("teamId")
  })
})
