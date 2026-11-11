// @vitest-environment edge-runtime
/**
 * MC-01 (plan 12) — les deux cibles nouvelles du signalement : la fiche et les règles d'un groupe
 * thématique, un message personnel d'iCom. Pour chacune : visibilité (refus indistinct hors de
 * l'audience réelle), auto-signalement refusé, masque immédiat pour le déclarant, dossier dans la file
 * du réseau du contenu, retrait par décision SANS suppression, restauration par recours admis. Et pour
 * le message personnel : aucune copie du texte au dossier ni dans une cloche, relu à la décision.
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { MODERATION_POLICY_SURFACES } from "@antsia/social-domain/moderationPolicy"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }
const M = api.modules.moderation.cases
const G = api.modules.thematicGroups.thematicGroups
const MSG = api.modules.messaging
const PAGE = { numItems: 25, cursor: null }

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function enter(t: T, root: Id<"networks">, handle: string, role?: "network_moderator" | "network_admin"): Promise<Person> {
  const as = t.withIdentity({ subject: `mc01-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  if (role) await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", root).eq("personId", personId)).unique()
    if (row) await ctx.db.patch(row._id, { role })
  })
  return { as, personId, handle }
}

async function connect(t: T, networkId: Id<"networks">, a: Person, b: Person): Promise<void> {
  await t.run(async (ctx) => {
    const [low, high] = a.personId < b.personId ? [a.personId, b.personId] : [b.personId, a.personId]
    await ctx.db.insert("connections", { networkId, personIdLow: low, personIdHigh: high, requestedByPersonId: a.personId, recipientPersonId: b.personId, status: "accepted", requestedAt: 1, respondedAt: 1, updatedAt: 1 })
  })
}

async function errorCode(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise
    return null
  } catch (error) {
    return engineErrorCode(error) ?? "unknown"
  }
}

async function operator(t: T, root: Id<"networks">): Promise<Person> {
  const person = await enter(t, root, "operatrice")
  await t.run(async (ctx) => await ctx.db.insert("operators", { personId: person.personId, role: "platform_operator", grantedAt: Date.now() }))
  await createTestOperatorProof(t, person.as, person.personId)
  return person
}

async function seed() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  return { t, root }
}

describe("MC-01 — signaler un groupe thématique", () => {
  async function groupFixture() {
    const { t, root } = await seed()
    const owner = await enter(t, root, "proprietaire")
    const member = await enter(t, root, "membre")
    const reporter = await enter(t, root, "declarante")
    const moderator = await enter(t, root, "moderateur", "network_moderator")
    const { groupId } = await owner.as.mutation(G.create, { networkId: root, name: "Cuisine du Woleu", description: "Recettes et marchés", idempotencyKey: "mc01-groupe" })
    await owner.as.mutation(G.setGroupRules, { networkId: root, groupId, rules: "Respect et entraide." })
    await member.as.mutation(G.join, { networkId: root, groupId, acceptedRulesVersion: 1 })
    await reporter.as.mutation(G.join, { networkId: root, groupId, acceptedRulesVersion: 1 })
    return { t, root, owner, member, reporter, moderator, groupId }
  }

  it("transmet le dossier à la file du réseau, masque la fiche au seul déclarant et refuse l'auto-signalement", async () => {
    const f = await groupFixture()
    // Le propriétaire vivant ne signale pas son propre groupe : refus indistinct.
    expect(await errorCode(f.owner.as.mutation(M.report, { networkId: f.root, target: { kind: "thematicGroup", id: f.groupId }, reason: "hate" }))).toBe("notFound")

    const report = await f.reporter.as.mutation(M.report, { networkId: f.root, target: { kind: "thematicGroup", id: f.groupId }, reason: "harassment" })
    expect(report).toMatchObject({ created: true, hidden: true })
    // Rejouer ne crée pas de doublon.
    expect(await f.reporter.as.mutation(M.report, { networkId: f.root, target: { kind: "thematicGroup", id: f.groupId }, reason: "harassment" })).toMatchObject({ reportId: report.reportId, created: false })

    // Le masque du déclarant : fiche, découverte, mes groupes et mur, sur le lien direct aussi.
    expect(await errorCode(f.reporter.as.query(G.getGroup, { networkId: f.root, groupId: f.groupId }))).toBe("notFound")
    expect((await f.reporter.as.query(G.discover, { networkId: f.root })).map((card) => card.groupId)).not.toContain(f.groupId)
    expect((await f.reporter.as.query(G.myGroups, { networkId: f.root })).items.map((card) => card.groupId)).not.toContain(f.groupId)
    expect(await errorCode(f.reporter.as.query(G.groupWall, { networkId: f.root, groupId: f.groupId }))).toBe("notFound")
    // Les autres lisent toujours la fiche.
    expect(await f.member.as.query(G.getGroup, { networkId: f.root, groupId: f.groupId })).toMatchObject({ name: "Cuisine du Woleu", rules: "Respect et entraide." })

    // Le dossier : file du réseau, propriétaire vivant, délai légal du harcèlement (art. 24), accusé émis.
    const row = await f.t.run(async (ctx) => await ctx.db.get(report.reportId))
    expect(row).toMatchObject({ networkId: f.root, targetKind: "thematicGroup", ownerPersonId: f.owner.personId, legalBasis: "art24", status: "open" })
    expect(row?.acknowledgedAt).toBeTypeOf("number")
    const queue = await f.moderator.as.query(M.deadlineQueue, { networkId: f.root })
    expect(queue.items.map((item) => item.reportId)).toContain(report.reportId)

    // La modération relit la fiche et les règles du jour, sans membres ni publications.
    const preview = await f.moderator.as.query(api.modules.moderation.reviewProjection.preview, { networkId: f.root, reportId: report.reportId })
    expect(preview).toMatchObject({ kind: "thematicGroup", available: true, title: "Cuisine du Woleu", body: "Recettes et marchés\n\nRespect et entraide." })

    // « Mes signalements » couvre la cible nouvelle.
    const mine = await f.reporter.as.query(M.myReports, { paginationOpts: PAGE })
    expect(mine.page[0]).toMatchObject({ reportId: report.reportId, targetKind: "thematicGroup", outcome: "pending" })
  })

  it("refuse un groupe d'un autre réseau, inconnu ou en suppression, de façon indistincte", async () => {
    const f = await groupFixture()
    const elsewhere = await f.t.run(async (ctx) => (await ctx.db.query("networks").take(10)).find((network) => network._id !== f.root)?._id)
    if (elsewhere === undefined) throw new Error("La graine des fondations pose un second réseau.")
    const other = await f.t.run(async (ctx) => await ctx.db.insert("thematicGroups", { networkId: elsewhere, name: "Ailleurs", createdByPersonId: f.owner.personId, searchText: "ailleurs", idempotencyKey: "ailleurs", createdAt: 1, updatedAt: 1 }))
    const deleting = await f.t.run(async (ctx) => await ctx.db.insert("thematicGroups", { networkId: f.root, name: "En partance", createdByPersonId: f.owner.personId, searchText: "en partance", idempotencyKey: "partance", deletingAt: 1, closedAt: 1, archivedAt: 1, createdAt: 1, updatedAt: 1 }))
    for (const id of [other, deleting]) {
      expect(await errorCode(f.reporter.as.mutation(M.report, { networkId: f.root, target: { kind: "thematicGroup", id }, reason: "other" }))).toBe("notFound")
    }
  })

  it("retire le groupe pour tous sans rien supprimer, ferme ses gardes, puis le rend tel quel sur recours admis", async () => {
    const f = await groupFixture()
    const { postId } = await f.member.as.mutation(api.modules.posts.posts.publish, { networkId: f.root, body: "Marché samedi", audience: "group", groupId: f.groupId })
    const report = await f.reporter.as.mutation(M.report, { networkId: f.root, target: { kind: "thematicGroup", id: f.groupId }, reason: "hate" })

    // Un modérateur vivant du groupe ne tranche pas le dossier de son groupe.
    await f.owner.as.mutation(G.setMemberRole, { networkId: f.root, groupId: f.groupId, memberPersonId: f.member.personId, role: "moderator" })
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.root).eq("personId", f.member.personId)).unique()
      if (row) await ctx.db.patch(row._id, { role: "network_moderator" })
    })
    expect(await errorCode(f.member.as.mutation(M.decide, { networkId: f.root, reportId: report.reportId, decision: "actioned", reason: "Fiche haineuse.", sanctions: [] }))).toBe("notFound")
    const before = await f.t.run(async (ctx) => await ctx.db.get(f.groupId))

    await f.moderator.as.mutation(M.decide, { networkId: f.root, reportId: report.reportId, decision: "actioned", reason: "Fiche haineuse.", sanctions: [] })
    // Rien n'a bougé dans le groupe : ni fermeture, ni archivage, ni suppression.
    const after = await f.t.run(async (ctx) => await ctx.db.get(f.groupId))
    expect(after).toEqual(before)
    const members = await f.t.run(async (ctx) => await ctx.db.query("thematicGroupMembers").withIndex("by_group_leftAt_joinedAt", (q) => q.eq("groupId", f.groupId).eq("leftAt", undefined)).take(10))
    expect(members).toHaveLength(3)
    // Mais il n'est plus servi à personne, et ses gardes ferment.
    expect(await errorCode(f.member.as.query(G.getGroup, { networkId: f.root, groupId: f.groupId }))).toBe("notFound")
    expect(await errorCode(f.owner.as.query(G.groupWall, { networkId: f.root, groupId: f.groupId }))).toBe("notFound")
    expect(await errorCode(f.owner.as.mutation(api.modules.posts.posts.publish, { networkId: f.root, body: "Encore ?", audience: "group", groupId: f.groupId }))).toBe("notFound")
    const newcomer = await enter(f.t, f.root, "nouvelle")
    expect(await errorCode(newcomer.as.mutation(G.join, { networkId: f.root, groupId: f.groupId, acceptedRulesVersion: 1 }))).toBe("notFound")
    expect(await errorCode(f.owner.as.query(api.modules.posts.posts.getPost, { networkId: f.root, postId }))).toBe("notFound")
    // Le propriétaire est prévenu, sans contenu dans la cloche.
    const notices = await f.t.run(async (ctx) => await ctx.db.query("notifications").withIndex("by_network_recipient_dedupKey", (q) => q.eq("networkId", f.root).eq("recipientPersonId", f.owner.personId)).take(20))
    expect(notices.some((row) => row.kind === "moderation_decision")).toBe(true)
    expect(JSON.stringify(notices)).not.toContain("Cuisine du Woleu")
    // Le déclarant apprend l'effet sur le contenu, jamais la sanction.
    expect((await f.reporter.as.query(M.myReports, { paginationOpts: PAGE })).page[0]).toMatchObject({ outcome: "removed" })

    // Recours de la propriétaire, admis par la plateforme : le groupe revient tel quel.
    const { appealId } = await f.owner.as.mutation(M.fileAppeal, { reportId: report.reportId, reason: "Le groupe respecte les règles." })
    const ops = await operator(f.t, f.root)
    await ops.as.mutation(M.reviewPlatformAppeal, { appealId, overturn: true, reason: "Réexamen favorable au groupe." })
    expect(await f.member.as.query(G.getGroup, { networkId: f.root, groupId: f.groupId })).toMatchObject({ name: "Cuisine du Woleu", state: "active", memberCount: 3 })
    expect(await f.owner.as.query(api.modules.posts.posts.getPost, { networkId: f.root, postId })).toMatchObject({ body: "Marché samedi" })
  })

  it("n'offre aucun réglage d'écriture sur une surface signalable seulement", async () => {
    const f = await groupFixture()
    const admin = await enter(f.t, f.root, "administratrice", "network_admin")
    const settings = await admin.as.query(M.policies, { networkId: f.root })
    expect(settings.surfaces.map((row) => row.surface)).toEqual([...MODERATION_POLICY_SURFACES])
    expect(settings.surfaces.map((row) => row.surface)).not.toContain("thematicGroup")
    for (const surface of ["thematicGroup", "personalMessage"] as const) {
      expect(await errorCode(admin.as.mutation(M.setPolicy, { networkId: f.root, surface, preReview: true, maxLinks: 1, maxWrites: 10, windowMs: 60_000, reason: "Essai de réglage." }))).toBe("invalidArgument")
    }
  })
})

describe("MC-01 — signaler un message personnel", () => {
  async function messageFixture() {
    const { t, root } = await seed()
    const sender = await enter(t, root, "expediteur")
    const recipient = await enter(t, root, "destinataire")
    const stranger = await enter(t, root, "tiers")
    const moderator = await enter(t, root, "moderatrice", "network_moderator")
    await connect(t, root, sender, recipient)
    const { threadId } = await sender.as.mutation(MSG.inbox.startThreadWithHandle, { networkId: root, handle: recipient.handle, initialMessage: "Bonjour" })
    const { messageId } = await sender.as.mutation(MSG.messages.sendMessage, { networkId: root, threadId, content: "Texte injurieux de test" })
    return { t, root, sender, recipient, stranger, moderator, threadId, messageId }
  }

  const history = async (person: Person, root: Id<"networks">, threadId: Id<"personalThreads">) =>
    (await person.as.query(MSG.messages.paginateMessages, { networkId: root, threadId, paginationOpts: { numItems: 50, cursor: null } })).page.map((row) => row.content)

  it("admet la seule partie au fil, refuse l'expéditeur, un tiers et un bloqué de façon indistincte", async () => {
    const f = await messageFixture()
    const target = { kind: "personalMessage" as const, id: f.messageId }
    expect(await errorCode(f.sender.as.mutation(M.report, { networkId: f.root, target, reason: "harassment" }))).toBe("notFound")
    expect(await errorCode(f.stranger.as.mutation(M.report, { networkId: f.root, target, reason: "harassment" }))).toBe("notFound")
    const unknown = await f.t.run(async (ctx) => {
      const id = await ctx.db.insert("personalMessages", { networkId: f.root, threadId: f.threadId, senderPersonId: f.sender.personId, content: "x", createdAt: 1 })
      await ctx.db.delete(id)
      return id
    })
    expect(await errorCode(f.recipient.as.mutation(M.report, { networkId: f.root, target: { kind: "personalMessage", id: unknown }, reason: "harassment" }))).toBe("notFound")
    await f.recipient.as.mutation(api.modules.graph.connections.blockPerson, { networkId: f.root, targetPersonId: f.sender.personId })
    expect(await errorCode(f.recipient.as.mutation(M.report, { networkId: f.root, target, reason: "harassment" }))).toBe("notFound")
  })

  it("masque le message au déclarant, ne copie aucun texte, et le laisse relire par la modération à la décision", async () => {
    const f = await messageFixture()
    const report = await f.recipient.as.mutation(M.report, { networkId: f.root, target: { kind: "personalMessage", id: f.messageId }, reason: "harassment" })
    expect(report.created).toBe(true)
    // Le masque : historique, citation et épingle ne servent plus le message au déclarant ; l'expéditeur le voit encore.
    expect(await history(f.recipient, f.root, f.threadId)).not.toContain("Texte injurieux de test")
    expect(await history(f.sender, f.root, f.threadId)).toContain("Texte injurieux de test")

    // Aucune copie : ni dans le dossier, ni dans l'accusé du déclarant.
    const row = await f.t.run(async (ctx) => await ctx.db.get(report.reportId))
    expect(row).toMatchObject({ networkId: f.root, targetKind: "personalMessage", ownerPersonId: f.sender.personId, legalBasis: "art24" })
    expect(JSON.stringify(row)).not.toContain("injurieux")
    const notices = await f.t.run(async (ctx) => await ctx.db.query("notifications").withIndex("by_network_recipient_dedupKey", (q) => q.eq("networkId", f.root).eq("recipientPersonId", f.recipient.personId)).take(20))
    expect(JSON.stringify(notices)).not.toContain("injurieux")

    // La modération relit LE message, par sa garde, sans pièce ni participant.
    const preview = await f.moderator.as.query(api.modules.moderation.reviewProjection.preview, { networkId: f.root, reportId: report.reportId })
    expect(preview).toMatchObject({ kind: "personalMessage", available: true, title: null, body: "Texte injurieux de test", media: [] })
    expect(JSON.stringify(preview)).not.toContain(f.sender.personId)
    expect(JSON.stringify(preview)).not.toContain(f.recipient.personId)

    // Retiré pour tous par son expéditeur entre-temps : la modération le sait indisponible, rien n'est ressuscité.
    await f.sender.as.mutation(MSG.messages.deleteMessage, { networkId: f.root, messageId: f.messageId })
    expect(await f.moderator.as.query(api.modules.moderation.reviewProjection.preview, { networkId: f.root, reportId: report.reportId })).toMatchObject({ available: false, body: null })
  })

  it("une partie au fil ne tranche jamais ; le retrait masque le message aux deux, le recours admis le rend", async () => {
    const f = await messageFixture()
    const report = await f.recipient.as.mutation(M.report, { networkId: f.root, target: { kind: "personalMessage", id: f.messageId }, reason: "privacy_or_honor" })
    // Le déclarant, même modérateur du réseau, ne décide pas du dossier de son propre fil.
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.root).eq("personId", f.recipient.personId)).unique()
      if (row) await ctx.db.patch(row._id, { role: "network_moderator" })
    })
    expect(await errorCode(f.recipient.as.mutation(M.decide, { networkId: f.root, reportId: report.reportId, decision: "actioned", reason: "Atteinte confirmée.", sanctions: [] }))).toBe("notFound")

    await f.moderator.as.mutation(M.decide, { networkId: f.root, reportId: report.reportId, decision: "actioned", reason: "Atteinte confirmée.", sanctions: [{ kind: "removal" }] })
    expect(await history(f.sender, f.root, f.threadId)).not.toContain("Texte injurieux de test")
    // La ligne demeure : un recours admis peut la rendre.
    expect(await f.t.run(async (ctx) => (await ctx.db.get(f.messageId))?.content)).toBe("Texte injurieux de test")
    const listed = (await f.sender.as.query(MSG.inbox.paginateMyThreads, { networkId: f.root })).items.find((item) => item.threadId === f.threadId)
    expect(JSON.stringify(listed)).not.toContain("injurieux")

    const { appealId } = await f.sender.as.mutation(M.fileAppeal, { reportId: report.reportId, reason: "Ce message était une citation." })
    const ops = await operator(f.t, f.root)
    await ops.as.mutation(M.reviewPlatformAppeal, { appealId, overturn: true, reason: "Contexte admis en réexamen." })
    expect(await history(f.sender, f.root, f.threadId)).toContain("Texte injurieux de test")
    // Le déclarant garde son masque : il ne relit pas ce qu'il a signalé.
    expect(await history(f.recipient, f.root, f.threadId)).not.toContain("Texte injurieux de test")
  })
})

describe("AZ-F1 — un message iCom modéré ne se réécrit pas et l'aperçu commun ne le republie pas", () => {
  // Horloge figée : chaque message a son instant, l'aperçu reflète une ligne précise.
  async function fixture() {
    vi.useFakeTimers()
    vi.setSystemTime(Date.UTC(2026, 10, 11, 9, 0, 0))
    const { t, root } = await seed()
    const sender = await enter(t, root, "expediteur")
    const recipient = await enter(t, root, "destinataire")
    const moderator = await enter(t, root, "moderatrice", "network_moderator")
    await connect(t, root, sender, recipient)
    const { threadId } = await sender.as.mutation(MSG.inbox.startThreadWithHandle, { networkId: root, handle: recipient.handle, initialMessage: "Bonjour" })
    vi.advanceTimersByTime(1_000)
    const { messageId } = await sender.as.mutation(MSG.messages.sendMessage, { networkId: root, threadId, content: "Texte injurieux de test" })
    vi.advanceTimersByTime(1_000)
    return { t, root, sender, recipient, moderator, threadId, messageId }
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>

  const listed = async (f: Fixture, person: Person) =>
    (await person.as.query(MSG.inbox.paginateMyThreads, { networkId: f.root })).items.find((item) => item.threadId === f.threadId)

  async function removeByDecision(f: Fixture) {
    const report = await f.recipient.as.mutation(M.report, { networkId: f.root, target: { kind: "personalMessage", id: f.messageId }, reason: "harassment" })
    await f.moderator.as.mutation(M.decide, { networkId: f.root, reportId: report.reportId, decision: "actioned", reason: "Atteinte confirmée.", sanctions: [{ kind: "removal" }] })
  }

  it("retiré par décision, le message ne se modifie ni ne se retire plus (refus indistinct) ; le texte jugé demeure", async () => {
    const f = await fixture()
    await removeByDecision(f)
    expect(await errorCode(f.sender.as.mutation(MSG.messages.editMessage, { networkId: f.root, messageId: f.messageId, content: "Texte réécrit après décision" }))).toBe("notFound")
    expect(await errorCode(f.sender.as.mutation(MSG.messages.deleteMessage, { networkId: f.root, messageId: f.messageId }))).toBe("notFound")
    expect(await f.t.run(async (ctx) => (await ctx.db.get(f.messageId))?.content)).toBe("Texte injurieux de test")
    for (const person of [f.sender, f.recipient]) {
      const row = JSON.stringify(await listed(f, person))
      expect(row).not.toContain("réécrit")
      expect(row).not.toContain("injurieux")
    }
  })

  it("retirer pour tous le message suivant rembobine l'aperçu sur un message que la modération laisse lire", async () => {
    const f = await fixture()
    await removeByDecision(f)
    const { messageId: next } = await f.sender.as.mutation(MSG.messages.sendMessage, { networkId: f.root, threadId: f.threadId, content: "Suite" })
    await f.sender.as.mutation(MSG.messages.deleteMessage, { networkId: f.root, messageId: next })
    for (const person of [f.sender, f.recipient]) expect(await listed(f, person)).toMatchObject({ lastMessageText: "Bonjour" })
  })

  it("tenu en relecture par la modération, le message ne se modifie plus ; son aperçu ne sort que chez son auteur", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => {
      await ctx.db.insert("moderationContentStates", { networkId: f.root, targetKind: "personalMessage", targetId: f.messageId, ownerPersonId: f.sender.personId, status: "pending_review", createdAt: Date.now(), updatedAt: Date.now() })
    })
    expect(await errorCode(f.sender.as.mutation(MSG.messages.editMessage, { networkId: f.root, messageId: f.messageId, content: "Texte réécrit pendant la relecture" }))).toBe("notFound")
    expect(await f.t.run(async (ctx) => (await ctx.db.get(f.messageId))?.content)).toBe("Texte injurieux de test")
    expect(await listed(f, f.recipient)).toMatchObject({ lastMessageText: null, lastMessageKind: null })
    expect(await listed(f, f.sender)).toMatchObject({ lastMessageText: "Texte injurieux de test" })
  })

  it("l'aperçu de ma liste ne garde ni le dernier message que j'ai signalé ni celui que j'ai masqué pour moi ; l'autre garde le sien", async () => {
    const f = await fixture()
    await f.recipient.as.mutation(M.report, { networkId: f.root, target: { kind: "personalMessage", id: f.messageId }, reason: "harassment" })
    expect(await listed(f, f.recipient)).toMatchObject({ lastMessageText: null, lastMessageKind: null })
    expect(await listed(f, f.sender)).toMatchObject({ lastMessageText: "Texte injurieux de test" })

    const { messageId: secret } = await f.sender.as.mutation(MSG.messages.sendMessage, { networkId: f.root, threadId: f.threadId, content: "Second message" })
    expect(await listed(f, f.recipient)).toMatchObject({ lastMessageText: "Second message" })
    await f.recipient.as.mutation(MSG.messages.deleteMessageForMe, { networkId: f.root, messageId: secret })
    expect(await listed(f, f.recipient)).toMatchObject({ lastMessageText: null, lastMessageKind: null })
    expect(await listed(f, f.sender)).toMatchObject({ lastMessageText: "Second message" })
  })
})
