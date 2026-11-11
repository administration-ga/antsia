// @vitest-environment edge-runtime
// Dupliqué de socle/convex/modules/reseauPersonnel/moderation.test.ts @ ad2e7fdc2 — adaptations : rôles `AdminSystem`/`SuperAdmin` → modérateur ou administrateur DU RÉSEAU du contenu, opérateur en dernier ressort ; décrément vérifié dans les agrégats (partages, commentaires) au lieu de `shareCount`/`commentCount` ; la décision écrit sa ligne dans le journal du moteur (patron `reseauPlatformActsAudit`) ; le signalement masque pour le déclarant. ; AZ-F1 : la décision passe par la porte d'opérateur (la décision de réseau de ce module est fermée, `cases.decide` la porte) ; conflit d'intérêts refusé (auteur, signataire de la page porteuse).
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { makeFunctionReference } from "convex/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons"> }

afterEach(() => {
  vi.useRealTimers()
})

const PAGE = { numItems: 50, cursor: null }

async function seed(t: T) {
  return await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
}

async function enter(t: T, rootId: Id<"networks">, handle: string, role?: "network_moderator" | "network_admin"): Promise<Person> {
  const as = t.withIdentity({ subject: `auth-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: rootId })
  if (role) {
    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("networkMemberships")
        .withIndex("by_network_and_person", (q) => q.eq("networkId", rootId).eq("personId", personId))
        .unique()
      if (membership) await ctx.db.patch(membership._id, { role })
    })
  }
  return { as, personId }
}

/** Un opérateur de plateforme, dans sa session de console scellée et journalisée. */
async function enterOperator(t: T, rootId: Id<"networks">, handle: string): Promise<Person> {
  const person = await enter(t, rootId, handle)
  await t.run(async (ctx) => ctx.db.insert("operators", { personId: person.personId, role: "platform_operator", grantedAt: 1 }))
  await createTestOperatorProof(t, person.as, person.personId)
  return person
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  return null
}

const codeOf = async (promise: Promise<unknown>) => engineErrorCode(await caught(promise))

describe("gardes de signalement", () => {
  it("refuse la file et les décisions à un simple membre ; l'opérateur tranche en dernier ressort", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const operator = await enterOperator(t, root, "operateur")
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Litigieux" })
    const { reportId } = await bob.as.mutation(api.modules.moderation.moderation.reportPost, { networkId: root, postId, reason: "harassment" })
    expect(await codeOf(bob.as.query(api.modules.moderation.moderation.paginateQueue, { networkId: root, paginationOpts: PAGE }))).toBe("notFound")
    expect(await codeOf(bob.as.mutation(api.modules.moderation.moderation.decideAsOperator, { reportId, status: "dismissed", decisionReason: "Rien à redire." }))).toBe("operatorRequired")
    expect(await operator.as.mutation(api.modules.moderation.moderation.decideAsOperator, { reportId, status: "dismissed", decisionReason: "Propos admissible." })).toEqual({ status: "dismissed" })
  })

  it("n'accepte que du contenu actuellement visible au déclarant ; refuse l'auto-signalement ; dédoublonne et masque", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const circle = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Cercle", audience: "connections" })
    expect(await codeOf(bob.as.mutation(api.modules.moderation.moderation.reportPost, { networkId: root, postId: circle.postId, reason: "hate" }))).toBe("notFound")
    const open = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Ouvert" })
    expect(await codeOf(alice.as.mutation(api.modules.moderation.moderation.reportPost, { networkId: root, postId: open.postId, reason: "hate" }))).toBe("notFound")
    const first = await bob.as.mutation(api.modules.moderation.moderation.reportPost, { networkId: root, postId: open.postId, reason: "hate" })
    const second = await bob.as.mutation(api.modules.moderation.moderation.reportPost, { networkId: root, postId: open.postId, reason: "other" })
    expect(first).toMatchObject({ created: true, hidden: true })
    expect(second).toEqual({ reportId: first.reportId, created: false, hidden: true })
    expect((await bob.as.query(api.modules.posts.posts.myFeed, { networkId: root, scope: "recents" })).items).toEqual([])
  })
})

describe("file et décisions", () => {
  it("anonymise le DTO : ni corps, ni auteur, ni déclarant", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const moderator = await enter(t, root, "moderatrice", "network_moderator")
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Texte secret du contenu" })
    await bob.as.mutation(api.modules.moderation.moderation.reportPost, { networkId: root, postId, reason: "misinformation", note: "Source douteuse" })
    const [row] = (await moderator.as.query(api.modules.moderation.moderation.paginateQueue, { networkId: root, paginationOpts: PAGE })).page
    expect(row).toMatchObject({ targetKind: "post", postId, reason: "misinformation", note: "Source douteuse", status: "open" })
    const serialized = JSON.stringify(row)
    expect(serialized).not.toContain("Texte secret")
    expect(serialized).not.toContain(bob.personId)
    expect(serialized).not.toContain(alice.personId)
  })

  it("conserve un dossier en examen jusqu'à sa décision terminale ; une décision terminale ne se refait pas", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const admin = await enter(t, root, "administratrice", "network_admin")
    const operator = await enterOperator(t, root, "operatrice")
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "À examiner" })
    const { reportId } = await bob.as.mutation(api.modules.moderation.moderation.reportPost, { networkId: root, postId, reason: "violence" })
    const decide = (status: "reviewing" | "dismissed" | "actioned", decisionReason = "Examen en cours.") =>
      operator.as.mutation(api.modules.moderation.moderation.decideAsOperator, { reportId, status, decisionReason })
    expect(await codeOf(decide("reviewing", " "))).toBe("invalidArgument")
    await decide("reviewing")
    expect((await admin.as.query(api.modules.moderation.moderation.paginateQueue, { networkId: root, status: "reviewing", paginationOpts: PAGE })).page).toHaveLength(1)
    expect(await codeOf(decide("reviewing"))).toBe("conflict")
    await decide("dismissed", "Propos admissible.")
    expect(await codeOf(decide("actioned", "Changement d'avis."))).toBe("conflict")
  })

  it("un retrait modéré retire le contenu (une racine avec ses réponses), décompte partages et commentaires, et écrit sa ligne de journal", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    const operator = await enterOperator(t, root, "operateur")
    const original = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Original" })
    const share = await bob.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "", sharedPostId: original.postId })
    const { commentId } = await bob.as.mutation(api.modules.engagement.engagement.comment, { networkId: root, postId: original.postId, body: "Commentaire fautif" })
    // Une réponse sous la racine fautive : elle part avec elle, le compte reste égal à ce qui se lit.
    await carol.as.mutation(api.modules.engagement.engagement.comment, { networkId: root, postId: original.postId, body: "Réponse", parentCommentId: commentId })
    const read = async () => await alice.as.query(api.modules.posts.posts.getPost, { networkId: root, postId: original.postId })
    expect(await read()).toMatchObject({ shareCount: 1, commentCount: 2 })

    const onShare = await carol.as.mutation(api.modules.moderation.moderation.reportPost, { networkId: root, postId: share.postId, reason: "other" })
    const onComment = await carol.as.mutation(api.modules.moderation.moderation.reportComment, { networkId: root, commentId, reason: "harassment" })
    await operator.as.mutation(api.modules.moderation.moderation.decideAsOperator, { reportId: onShare.reportId, status: "actioned", decisionReason: "Partage abusif." })
    await operator.as.mutation(api.modules.moderation.moderation.decideAsOperator, { reportId: onComment.reportId, status: "actioned", decisionReason: "Harcèlement avéré." })
    expect(await read()).toMatchObject({ shareCount: 0, commentCount: 0 })
    expect(engineErrorCode(await caught(carol.as.query(api.modules.posts.posts.getPost, { networkId: root, postId: share.postId })))).toBe("notFound")

    const journal = await t.run(async (ctx) =>
      ctx.db
        .query("engineAudit")
        .withIndex("by_subject_at", (q) => q.eq("subjectTable", "contentReports").eq("subjectId", onComment.reportId))
        .take(5),
    )
    expect(journal).toMatchObject([
      {
        action: "moderation.report_decide",
        capacity: "platform_operator",
        actorPersonId: operator.personId,
        networkId: root,
        details: { targetKind: "comment", previousStatus: "open", status: "actioned", decisionReason: "Harcèlement avéré.", targetRemoved: true },
      },
    ])
  })
})

describe("AZ-F1 — une seule porte de décision, sans conflit d'intérêts", () => {
  it("la décision de réseau de ce module est fermée : un administrateur tranche par la porte des dossiers", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const admin = await enter(t, root, "administratrice", "network_admin")
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Signalée" })
    const { reportId } = await bob.as.mutation(api.modules.moderation.moderation.reportPost, { networkId: root, postId, reason: "harassment" })
    const legacyDecide = makeFunctionReference<"mutation">("modules/moderation/moderation:decide")
    await expect(admin.as.mutation(legacyDecide, { networkId: root, reportId, status: "dismissed", decisionReason: "Rien à redire." })).rejects.toThrow(/no such export/)
    const row = await t.run(async (ctx) => ctx.db.get(reportId))
    expect(row).toMatchObject({ status: "open" })
  })

  it("l'opérateur auteur de la publication ou du commentaire signalé ne tranche pas son dossier (refus indistinct)", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    const author = await enterOperator(t, root, "operateur-auteur")
    const { postId } = await author.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Ma publication" })
    const { commentId } = await author.as.mutation(api.modules.engagement.engagement.comment, { networkId: root, postId, body: "Mon commentaire" })
    // Deux déclarants : signaler masque la publication pour son déclarant, qui ne la voit plus pour signaler le commentaire.
    const onPost = await bob.as.mutation(api.modules.moderation.moderation.reportPost, { networkId: root, postId, reason: "harassment" })
    const onComment = await carol.as.mutation(api.modules.moderation.moderation.reportComment, { networkId: root, commentId, reason: "harassment" })
    for (const reportId of [onPost.reportId, onComment.reportId]) {
      expect(await codeOf(author.as.mutation(api.modules.moderation.moderation.decideAsOperator, { reportId, status: "dismissed", decisionReason: "Propos admissible." }))).toBe("notFound")
      expect(await t.run(async (ctx) => (await ctx.db.get(reportId))?.status)).toBe("open")
    }
  })

  it("un signataire vivant de la page qui porte la publication ne tranche pas son dossier, même opérateur", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const carol = await enter(t, root, "carol")
    const bob = await enterOperator(t, root, "bob")
    const other = await enterOperator(t, root, "operatrice-tierce")
    await t.run(async (ctx) => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", root).eq("personId", alice.personId)).unique()
      if (row) await ctx.db.patch(row._id, { status: "verifiee" })
    })
    const { pageId } = await alice.as.mutation(api.modules.pages.pages.createPage, { networkId: root, name: "Association des Gabonais de Lyon", ownerKind: "association" })
    await alice.as.mutation(api.modules.pages.signatories.grantPageRole, { networkId: root, pageId, handle: "bob", role: "signatory" })
    await bob.as.mutation(api.modules.pages.signatories.respondToPageInvitation, { networkId: root, pageId, accept: true })
    const { postId } = await alice.as.mutation(api.modules.pages.pages.publishAsPage, { networkId: root, pageId, body: "Assemblée générale samedi" })
    const { reportId } = await carol.as.mutation(api.modules.moderation.moderation.reportPost, { networkId: root, postId, reason: "misinformation" })
    expect(await codeOf(bob.as.mutation(api.modules.moderation.moderation.decideAsOperator, { reportId, status: "dismissed", decisionReason: "Rien à redire." }))).toBe("notFound")
    expect(await t.run(async (ctx) => (await ctx.db.get(reportId))?.status)).toBe("open")
    // Un opérateur sans lien avec la page tranche.
    expect(await other.as.mutation(api.modules.moderation.moderation.decideAsOperator, { reportId, status: "dismissed", decisionReason: "Information sourcée." })).toEqual({ status: "dismissed" })
  })
})
