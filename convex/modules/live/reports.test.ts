// @vitest-environment edge-runtime
/**
 * DL-03 (plan 04) — signaler un direct et ses commentaires, et relire la
 * discussion d'un direct comme celle du fil.
 *
 *  · Chaque commentaire passe la règle de relecture du réseau (surface
 *    `liveComment`) : RETENU, il n'est lu que par son auteur et sort des
 *    compteurs de la salle ; admis par la modération, il paraît ; refusé, il est
 *    retiré.
 *  · Signaler un commentaire ou un direct : refus indistinct hors de l'audience
 *    réelle, auto-signalement refusé, masque immédiat pour le seul déclarant,
 *    dossier dans la file du réseau avec son délai légal (SU01d).
 *  · Un retrait par décision passe le commentaire en `removed` ; sur un direct,
 *    il retire aussi sa rediffusion, pour tous, l'hôte compris. Un recours admis
 *    rend l'un et l'autre, sans rien supprimer entre-temps.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { createTestOperatorProof, testConvex } from "../../test.setup"
import { registerGeneratedBlob } from "../files/admission"
import { sessionCountersOf } from "./access"
import { codeOf, connect, enter, insertSession, joinAlso, type Person, seed, type T, T0, tick } from "./fixtures.setup"

const L = api.modules.live
const M = api.modules.moderation.cases
const PREVIEW = api.modules.moderation.reviewProjection.preview
const PAGE = { numItems: 25, cursor: null }

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

function must<V>(value: V | null | undefined): V {
  if (value === null || value === undefined) throw new Error("ligne attendue absente")
  return value
}

/** Donne un rôle de réseau à une personne déjà membre (la graine ne nomme aucun modérateur). */
async function withRole(t: T, networkId: Id<"networks">, person: Person, role: "network_moderator" | "network_admin"): Promise<Person> {
  await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", person.personId)).unique()
    await ctx.db.patch(must(row)._id, { role })
  })
  return person
}

async function operator(t: T, root: Id<"networks">): Promise<Person> {
  const person = await enter(t, root, "operatrice")
  await t.run(async (ctx) => await ctx.db.insert("operators", { personId: person.personId, role: "platform_operator", grantedAt: Date.now() }))
  await createTestOperatorProof(t, person.as, person.personId)
  return person
}

/** Alice anime, Bob et Carol regardent, Modo modère le réseau racine. */
async function cast() {
  const t = testConvex()
  const { root, testClosed } = await seed(t)
  const alice = await enter(t, root, "alice")
  const bob = await enter(t, root, "bob")
  const carol = await enter(t, root, "carol")
  const modo = await withRole(t, root, await enter(t, root, "modo"), "network_moderator")
  return { t, root, testClosed, alice, bob, carol, modo }
}

const envoyer = (person: Person, networkId: Id<"networks">, sessionId: Id<"liveSessions">, body: string) => person.as.mutation(L.comments.send, { networkId, sessionId, body })
const file = (person: Person, networkId: Id<"networks">, sessionId: Id<"liveSessions">) => person.as.query(L.comments.list, { networkId, sessionId })
const corps = async (person: Person, networkId: Id<"networks">, sessionId: Id<"liveSessions">) => (await file(person, networkId, sessionId)).map((row) => row.body)
const statut = (t: T, commentId: Id<"liveComments">) => t.run(async (ctx) => must(await ctx.db.get(commentId)).status)
const compteur = async (t: T, sessionId: Id<"liveSessions">) => (await t.run(async (ctx) => sessionCountersOf(ctx, sessionId))).commentCount
const recolter = (t: T) => t.mutation(internal.modules.live.reap.reapStaleDirects, {})

async function motBloque(t: T, networkId: Id<"networks">, term: string): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("blockedTerms", { networkId, term, active: true, updatedAt: Date.now() })
  })
}

describe("DL-03 — la discussion d'un direct passe la règle de relecture du réseau", () => {
  it("un commentaire RETENU n'est lu que par son auteur, sort des compteurs, puis paraît une fois admis", async () => {
    const { t, root, alice, bob, carol, modo } = await cast()
    const sessionId = await insertSession(t, { networkId: root, host: alice })
    await motBloque(t, root, "arnaque")

    await envoyer(carol, root, sessionId, "Bonjour à tous")
    tick(1_000)
    const { commentId } = await envoyer(bob, root, sessionId, "Venez voir mon arnaque")
    expect(await statut(t, commentId)).toBe("pending_review")

    // L'auteur le lit, et l'écran sait le lui dire ; personne d'autre ne le voit, l'hôte compris.
    const vueBob = await file(bob, root, sessionId)
    expect(vueBob.map((row) => [row.body, row.isMine, row.pendingReview])).toEqual([
      ["Bonjour à tous", false, false],
      ["Venez voir mon arnaque", true, true],
    ])
    expect(await corps(carol, root, sessionId)).toEqual(["Bonjour à tous"])
    expect(await corps(alice, root, sessionId)).toEqual(["Bonjour à tous"])
    // Il ne compte pas dans la salle : l'écrivain unique ne compte que les publiés (D28).
    await recolter(t)
    expect(await compteur(t, sessionId)).toBe(1)

    // L'état de modération ne garde aucun texte ; le commentaire attend dans la file de relecture du réseau.
    const state = await t.run(async (ctx) => await ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", "liveComment").eq("targetId", commentId)).unique())
    expect(state).toMatchObject({ networkId: root, ownerPersonId: bob.personId, status: "pending_review" })
    expect(JSON.stringify(state)).not.toContain("arnaque")
    const pending = await modo.as.query(M.paginatePending, { networkId: root, paginationOpts: PAGE })
    expect(pending.page.map((row) => [row.targetKind, row.targetId])).toContainEqual(["liveComment", commentId])
    // La modération relit le SEUL commentaire, sans le direct ni ses voisins.
    expect(await modo.as.query(PREVIEW, { networkId: root, target: { kind: "liveComment", id: commentId } })).toMatchObject({ kind: "liveComment", available: true, title: null, body: "Venez voir mon arnaque" })

    await modo.as.mutation(M.reviewContent, { networkId: root, target: { kind: "liveComment", id: commentId }, approve: true, reason: "Faux positif du mot bloqué." })
    expect(await statut(t, commentId)).toBe("published")
    expect(await corps(carol, root, sessionId)).toEqual(["Bonjour à tous", "Venez voir mon arnaque"])
    expect((await file(bob, root, sessionId)).every((row) => !row.pendingReview)).toBe(true)
    await recolter(t)
    expect(await compteur(t, sessionId)).toBe(2)
  })

  it("refusé par la relecture, le commentaire est retiré ; retiré par son auteur pendant la relecture, il ne revient jamais", async () => {
    const { t, root, alice, bob, carol, modo } = await cast()
    const sessionId = await insertSession(t, { networkId: root, host: alice })
    await motBloque(t, root, "insulte")

    const { commentId: refuse } = await envoyer(bob, root, sessionId, "Une insulte")
    await modo.as.mutation(M.reviewContent, { networkId: root, target: { kind: "liveComment", id: refuse }, approve: false, reason: "Propos injurieux." })
    expect(await statut(t, refuse)).toBe("removed")
    expect(await corps(bob, root, sessionId)).toEqual([])

    tick(60_000)
    const { commentId: regret } = await envoyer(bob, root, sessionId, "Encore une insulte")
    await bob.as.mutation(L.comments.remove, { networkId: root, commentId: regret })
    await modo.as.mutation(M.reviewContent, { networkId: root, target: { kind: "liveComment", id: regret }, approve: true, reason: "Admis, mais déjà retiré." })
    expect(await statut(t, regret)).toBe("removed")
    expect(await corps(carol, root, sessionId)).toEqual([])
  })

  it("sans mot bloqué ni réglage, un commentaire ordinaire paraît aussitôt (défauts prudents du moteur, MC-02)", async () => {
    const { t, root, alice, bob, carol } = await cast()
    const sessionId = await insertSession(t, { networkId: root, host: alice })
    const { commentId } = await envoyer(bob, root, sessionId, "Très clair, merci")
    expect(await statut(t, commentId)).toBe("published")
    expect(await corps(carol, root, sessionId)).toEqual(["Très clair, merci"])
  })
})

describe("DL-03 — signaler un commentaire de direct", () => {
  it("transmet le dossier avec son délai légal, masque le commentaire au seul déclarant et refuse l'auto-signalement", async () => {
    const { t, root, alice, bob, carol, modo } = await cast()
    const sessionId = await insertSession(t, { networkId: root, host: alice })
    const { commentId } = await envoyer(bob, root, sessionId, "Propos blessant")
    const target = { kind: "liveComment" as const, id: commentId }

    // Son auteur ne le signale pas : refus indistinct.
    expect(await codeOf(bob.as.mutation(M.report, { networkId: root, target, reason: "harassment" }))).toBe("notFound")

    const report = await carol.as.mutation(M.report, { networkId: root, target, reason: "harassment" })
    expect(report).toMatchObject({ created: true, hidden: true })
    expect(await carol.as.mutation(M.report, { networkId: root, target, reason: "harassment" })).toMatchObject({ reportId: report.reportId, created: false })

    // Le masque du déclarant ; la salle le lit toujours.
    expect(await corps(carol, root, sessionId)).toEqual([])
    expect(await corps(alice, root, sessionId)).toEqual(["Propos blessant"])

    // Le dossier : réseau du direct, auteur propriétaire, délai légal du harcèlement (art. 24), accusé émis, file à délai.
    const row = must(await t.run(async (ctx) => await ctx.db.get(report.reportId)))
    expect(row).toMatchObject({ networkId: root, targetKind: "liveComment", ownerPersonId: bob.personId, legalBasis: "art24", status: "open" })
    expect(row.dueAt).toBeTypeOf("number")
    expect(row.acknowledgedAt).toBeTypeOf("number")
    expect((await modo.as.query(M.deadlineQueue, { networkId: root })).items.map((item) => item.reportId)).toContain(report.reportId)
    expect(await modo.as.query(PREVIEW, { networkId: root, reportId: report.reportId })).toMatchObject({ kind: "liveComment", available: true, body: "Propos blessant" })
    expect((await carol.as.query(M.myReports, { paginationOpts: PAGE })).page[0]).toMatchObject({ reportId: report.reportId, targetKind: "liveComment", outcome: "pending" })
  })

  it("refuse de façon indistincte un commentaire d'un direct invisible, d'un autre réseau, retenu ou déjà retiré", async () => {
    const { t, root, testClosed, alice, bob, carol } = await cast()
    // Un direct réservé aux relations d'Alice : Carol n'y est pas.
    const reservee = await insertSession(t, { networkId: root, host: alice, audience: "connections" })
    await connect(t, root, alice, bob)
    const { commentId: invisible } = await envoyer(bob, root, reservee, "Entre nous")
    // Un direct d'un autre réseau, signalé au nom de la racine.
    await joinAlso(t, testClosed, alice)
    await joinAlso(t, testClosed, bob)
    await joinAlso(t, testClosed, carol)
    const ailleurs = await insertSession(t, { networkId: testClosed, host: alice })
    const { commentId: lointain } = await envoyer(bob, testClosed, ailleurs, "Ailleurs")
    // Un retenu et un retiré, dans un direct public.
    const publique = await insertSession(t, { networkId: root, host: alice })
    await motBloque(t, root, "arnaque")
    const { commentId: retenu } = await envoyer(bob, root, publique, "Mon arnaque")
    tick(60_000)
    const { commentId: retire } = await envoyer(bob, root, publique, "Déjà parti")
    await bob.as.mutation(L.comments.remove, { networkId: root, commentId: retire })

    for (const id of [invisible, lointain, retenu, retire]) {
      expect(await codeOf(carol.as.mutation(M.report, { networkId: root, target: { kind: "liveComment", id }, reason: "harassment" }))).toBe("notFound")
    }
    expect(await t.run(async (ctx) => await ctx.db.query("reports").take(10))).toEqual([])
  })

  it("le retrait par décision passe le commentaire en `removed` pour tous ; le recours admis le rend", async () => {
    const { t, root, alice, bob, carol, modo } = await cast()
    const sessionId = await insertSession(t, { networkId: root, host: alice })
    const { commentId } = await envoyer(bob, root, sessionId, "Propos blessant")
    const report = await carol.as.mutation(M.report, { networkId: root, target: { kind: "liveComment", id: commentId }, reason: "hate" })

    await modo.as.mutation(M.decide, { networkId: root, reportId: report.reportId, decision: "actioned", reason: "Propos haineux.", sanctions: [] })
    expect(await statut(t, commentId)).toBe("removed")
    expect(await corps(alice, root, sessionId)).toEqual([])
    expect(await corps(bob, root, sessionId)).toEqual([])
    // L'auteur est prévenu, sans contenu dans la cloche.
    const notices = await t.run(async (ctx) => await ctx.db.query("notifications").withIndex("by_network_recipient_dedupKey", (q) => q.eq("networkId", root).eq("recipientPersonId", bob.personId)).take(20))
    expect(notices.some((row) => row.kind === "moderation_decision")).toBe(true)
    expect(JSON.stringify(notices)).not.toContain("Propos blessant")

    const { appealId } = await bob.as.mutation(M.fileAppeal, { reportId: report.reportId, reason: "Le propos était une citation." })
    const ops = await operator(t, root)
    await ops.as.mutation(M.reviewPlatformAppeal, { appealId, overturn: true, reason: "Réexamen favorable à l'auteur." })
    expect(await statut(t, commentId)).toBe("published")
    expect(await corps(alice, root, sessionId)).toEqual(["Propos blessant"])
  })
})

describe("DL-03 — signaler un direct", () => {
  it("refuse de façon indistincte un direct invisible ou d'un autre réseau, et l'hôte qui signale le sien", async () => {
    const { t, root, testClosed, alice, carol } = await cast()
    const reservee = await insertSession(t, { networkId: root, host: alice, audience: "connections" })
    await joinAlso(t, testClosed, alice)
    await joinAlso(t, testClosed, carol)
    const ailleurs = await insertSession(t, { networkId: testClosed, host: alice })
    const publique = await insertSession(t, { networkId: root, host: alice })

    for (const id of [reservee, ailleurs]) {
      expect(await codeOf(carol.as.mutation(M.report, { networkId: root, target: { kind: "live", id }, reason: "violence" }))).toBe("notFound")
    }
    expect(await codeOf(alice.as.mutation(M.report, { networkId: root, target: { kind: "live", id: publique }, reason: "violence" }))).toBe("notFound")
    expect(await t.run(async (ctx) => await ctx.db.query("reports").take(10))).toEqual([])

    // Le direct d'autrui, visible : le dossier part, et le direct disparaît pour la seule déclarante.
    const report = await carol.as.mutation(M.report, { networkId: root, target: { kind: "live", id: publique }, reason: "violence" })
    expect(report).toMatchObject({ created: true, hidden: true })
    expect(await codeOf(carol.as.query(L.sessions.get, { networkId: root, sessionId: publique }))).toBe("notFound")
    expect(await alice.as.query(L.sessions.get, { networkId: root, sessionId: publique })).toMatchObject({ status: "live" })
  })

  it("le retrait par décision retire aussi la rediffusion, pour tous et l'hôte compris ; le recours admis la rend telle quelle", async () => {
    const { t, root, alice, bob, carol, modo } = await cast()
    const now = Date.now()
    // Un direct terminé dont la copie est PRÊTE et publiée (connue de la garde des fichiers).
    const videoId = await t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob(["rediffusion"]))
      await registerGeneratedBlob(ctx as unknown as MutationCtx, id, { mimeType: "video/mp4", networkId: root, uploadedByPersonId: alice.personId })
      return id
    })
    const sessionId = await t.run((ctx) =>
      ctx.db.insert("liveSessions", {
        networkId: root,
        hostPersonId: alice.personId,
        title: "Direct à retirer",
        roomName: "direct-dl03-retrait",
        status: "ended",
        audience: "public",
        chatMode: "open",
        maxViewers: 100,
        replayRequested: true,
        replayStatus: "ready",
        replayPublication: "published",
        replayStorageId: videoId,
        replayRetentionUntil: now + 30 * 24 * 60 * 60_000,
        createdAt: now - 3_600_000,
        startedAt: now - 3_000_000,
        endedAt: now - 1_000_000,
        updatedAt: now,
      }),
    )
    expect(must((await bob.as.query(L.sessions.get, { networkId: root, sessionId })).replay).url).toBeTruthy()
    expect((await bob.as.query(L.sessions.listReplays, { networkId: root })).items.map((item) => item.sessionId)).toContain(sessionId)

    const report = await carol.as.mutation(M.report, { networkId: root, target: { kind: "live", id: sessionId }, reason: "violence" })
    await modo.as.mutation(M.decide, { networkId: root, reportId: report.reportId, decision: "actioned", reason: "Violence filmée.", sanctions: [] })

    // Ni la page, ni la copie, ni les listes : pour l'audience comme pour l'hôte.
    for (const person of [bob, alice]) {
      expect(await codeOf(person.as.query(L.sessions.get, { networkId: root, sessionId }))).toBe("notFound")
      expect((await person.as.query(L.sessions.listReplays, { networkId: root })).items.map((item) => item.sessionId)).not.toContain(sessionId)
    }
    expect((await alice.as.query(L.sessions.listMinePage, { networkId: root })).items.map((item) => item.sessionId)).not.toContain(sessionId)
    // Rien n'est supprimé : un recours admis doit pouvoir la rendre.
    expect(await t.run(async (ctx) => await ctx.db.system.get(videoId))).not.toBeNull()

    const { appealId } = await alice.as.mutation(M.fileAppeal, { reportId: report.reportId, reason: "Reportage d'actualité." })
    const ops = await operator(t, root)
    await ops.as.mutation(M.reviewPlatformAppeal, { appealId, overturn: true, reason: "Intérêt d'information reconnu." })
    const rendu = must((await bob.as.query(L.sessions.get, { networkId: root, sessionId })).replay)
    expect(rendu).toMatchObject({ status: "ready", publication: "published" })
    expect(rendu.url).toBeTruthy()
  })
})
