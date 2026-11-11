// @vitest-environment edge-runtime
// Dupliqué de socle/convex/modules/direct/comments.test.ts @ ad2e7fdc2 — adaptations : harnais et outillage du moteur (`test.setup`, `live/fixtures.setup` : réseau racine amorcé, personnes membres, session EN DIRECT posée en base au lieu de `sessions.create` + `goLive`) ; le compteur se lit dans `liveSessionCounters` (D28), et la « valeur posée par le chemin chaud » du socle devient une ligne de compteurs posée en base, comme l'aurait laissée une récolte précédente — le chemin chaud n'écrit aucun compteur (l'en-tête du socle disait encore que `send` incrémentait la session : ce n'était plus le cas) ; cas NEUFS des adaptations : refus à CODE (`LIVE_NOT_LIVE`, `LIVE_CHAT_CLOSED`, `LIVE_CHAT_MUTED`, `LIVE_COMMENT_EMPTY`, `LIVE_COMMENT_TOO_LONG{max}`), refus indistinct `notFound` (hors audience, autre réseau, commentaire d'autrui sans droit de modérer), débit `live.comment` par personne, DTO du moteur (`authorPersonId`, profil PUBLIÉ ou nom neutre, sourdine dite au seul modérateur) et file des 40 derniers vivants ; DL-03 : l'état de modération écrit avec le commentaire, sans texte, et `pendingReview` au DTO.
/**
 * Les COMMENTAIRES du direct — persistés, bornés, et leur compteur tenu par
 * l'écrivain unique (D28) :
 *
 *  · `comments.send` et `comments.remove` n'écrivent que la ligne du
 *    commentaire — ni la session, ni ses compteurs ;
 *  · `reap.recomputeAggregates` est la RÉCONCILIATION : une dérive est
 *    corrigée au passage de récolte ;
 *  · la fenêtre de recomptage (`AGGREGATE_COMMENTS_SCAN`) est une BORNE
 *    annoncée : saturée, elle ne rabote jamais un compteur plus haut qu'elle —
 *    un total dégradé, jamais un mensonge vers le bas.
 */
import { engineErrorRule } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { testConvex } from "../../test.setup"
import { sessionCountersOf } from "./access"
import { DIRECT_COMMENT_MAX_LENGTH, DIRECT_COMMENTS_WINDOW } from "./domain"
import { caught, codeOf, connect, enter, insertSession, joinAlso, type Person, ruleOf, seed, sessionDoc, type T, T0, tick } from "./fixtures.setup"
import { AGGREGATE_COMMENTS_SCAN, reconcileCommentCount } from "./reap"

const L = api.modules.live

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
  if (value === null || value === undefined) {
    throw new Error("ligne attendue absente")
  }
  return value
}

async function cast() {
  const t = testConvex()
  const { root, testClosed } = await seed(t)
  const alice = await enter(t, root, "alice")
  const bob = await enter(t, root, "bob")
  const carol = await enter(t, root, "carol")
  return { t, root, testClosed, alice, bob, carol }
}

const envoyer = (person: Person, networkId: Id<"networks">, sessionId: Id<"liveSessions">, body: string) => person.as.mutation(L.comments.send, { networkId, sessionId, body })

const retirer = (person: Person, networkId: Id<"networks">, commentId: Id<"liveComments">) => person.as.mutation(L.comments.remove, { networkId, commentId })

const file = (person: Person, networkId: Id<"networks">, sessionId: Id<"liveSessions">) => person.as.query(L.comments.list, { networkId, sessionId })

const recolter = (t: T) => t.mutation(internal.modules.live.reap.reapStaleDirects, {})

async function compteur(t: T, sessionId: Id<"liveSessions">): Promise<number> {
  return (await t.run(async (ctx) => sessionCountersOf(ctx, sessionId))).commentCount
}

/** Pose (ou repose) la ligne de compteurs, comme l'aurait laissée une récolte précédente. */
async function poserCompteur(t: T, sessionId: Id<"liveSessions">, commentCount: number): Promise<void> {
  await t.run(async (ctx) => {
    const session = must(await ctx.db.get(sessionId))
    const row = await ctx.db
      .query("liveSessionCounters")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .unique()
    if (row) await ctx.db.patch(row._id, { commentCount })
    else await ctx.db.insert("liveSessionCounters", { networkId: session.networkId, sessionId, viewerGrantCount: 0, viewerPresentCount: 0, commentCount, reactionCount: 0, updatedAt: Date.now() })
  })
}

/** `person` est mis en sourdine par l'hôte de la session. */
async function sourdine(t: T, sessionId: Id<"liveSessions">, person: Person): Promise<void> {
  await t.run(async (ctx) => {
    const session = must(await ctx.db.get(sessionId))
    await ctx.db.insert("liveChatMutes", { networkId: session.networkId, sessionId, personId: person.personId, byPersonId: session.hostPersonId, createdAt: Date.now() })
  })
}

describe("commentaires — compteur réconcilié par l'écrivain unique", () => {
  it("la récolte RÉCONCILIE une dérive du compteur sur un live sain", async () => {
    const { t, root, alice, bob } = await cast()
    const sessionId = await insertSession(t, { networkId: root, host: alice })
    await envoyer(bob, root, sessionId, "Un")
    await envoyer(bob, root, sessionId, "Deux")
    await poserCompteur(t, sessionId, 42)

    await recolter(t)

    expect(await compteur(t, sessionId)).toBe(2)
  })

  it("reconcileCommentCount : exact sous la fenêtre, borne BASSE quand elle sature", () => {
    // Sous la fenêtre : le recomptage est la vérité, même s'il baisse.
    expect(reconcileCommentCount({ current: 42, publishedInWindow: 2, scanned: 2 })).toBe(2)
    expect(
      reconcileCommentCount({
        current: 0,
        publishedInWindow: 999,
        scanned: AGGREGATE_COMMENTS_SCAN - 1,
      }),
    ).toBe(999)
    // Saturée : la fenêtre ne voit pas tout — elle ne rabote jamais un
    // compteur plus haut, mais relève un compteur plus bas.
    expect(
      reconcileCommentCount({
        current: 1500,
        publishedInWindow: 1000,
        scanned: AGGREGATE_COMMENTS_SCAN,
      }),
    ).toBe(1500)
    expect(
      reconcileCommentCount({
        current: 3,
        publishedInWindow: 990,
        scanned: AGGREGATE_COMMENTS_SCAN,
      }),
    ).toBe(990)
  })

  it("au-delà de la fenêtre, la récolte ne rabote pas le compteur", async () => {
    const { t, root, alice } = await cast()
    const sessionId = await insertSession(t, { networkId: root, host: alice })
    const total = AGGREGATE_COMMENTS_SCAN + 5

    // Peuplement DIRECT (le seau borne l'API réelle, pas le test) : le compteur
    // est posé comme l'aurait laissé une récolte précédente.
    await t.run(async (ctx) => {
      const session = must(await ctx.db.get(sessionId))
      const startedAt = must(session.startedAt)
      for (let i = 0; i < total; i++) {
        await ctx.db.insert("liveComments", {
          networkId: root,
          sessionId,
          authorPersonId: alice.personId,
          body: `c${i}`,
          status: "published",
          offsetMs: i * 10,
          createdAt: startedAt + i * 10,
        })
      }
    })
    await poserCompteur(t, sessionId, total)

    await recolter(t)
    expect(await compteur(t, sessionId)).toBe(total)

    // Dérive vers le bas sous une fenêtre saturée : relevé à la borne basse.
    await poserCompteur(t, sessionId, 3)
    await recolter(t)
    expect(await compteur(t, sessionId)).toBe(AGGREGATE_COMMENTS_SCAN)
  })
})

describe("adaptations du moteur — refus à code, réseau, débit", () => {
  it("refus à CODE : pas en cours, conversation fermée, sourdine, corps vide ou trop long", async () => {
    const { t, root, alice, bob } = await cast()
    const programmee = await insertSession(t, { networkId: root, host: alice, status: "scheduled" })
    const fermee = await insertSession(t, { networkId: root, host: alice, chatMode: "closed" })
    const ouverte = await insertSession(t, { networkId: root, host: alice })

    expect(await ruleOf(envoyer(bob, root, programmee, "Bonjour"))).toBe("LIVE_NOT_LIVE")
    expect(await ruleOf(envoyer(bob, root, fermee, "Bonjour"))).toBe("LIVE_CHAT_CLOSED")
    // Fermée pour TOUT LE MONDE : l'hôte non plus n'écrit pas.
    expect(await ruleOf(envoyer(alice, root, fermee, "Bonjour"))).toBe("LIVE_CHAT_CLOSED")

    expect(await ruleOf(envoyer(bob, root, ouverte, "   "))).toBe("LIVE_COMMENT_EMPTY")
    expect(engineErrorRule(await caught(envoyer(bob, root, ouverte, "x".repeat(DIRECT_COMMENT_MAX_LENGTH + 1))))).toEqual({
      rule: "LIVE_COMMENT_TOO_LONG",
      params: { max: DIRECT_COMMENT_MAX_LENGTH },
    })

    // La sourdine individuelle : elle seule se tait, et le refus le dit.
    await sourdine(t, ouverte, bob)
    expect(await ruleOf(envoyer(bob, root, ouverte, "Bonjour"))).toBe("LIVE_CHAT_MUTED")
    expect(await file(alice, root, ouverte)).toEqual([])
  })

  it("refus INDISTINCT : hors audience, autre réseau, commentaire d'autrui sans droit de modérer → `notFound`", async () => {
    const { t, root, testClosed, alice, bob, carol } = await cast()
    const reservee = await insertSession(t, { networkId: root, host: alice, audience: "connections" })
    // Carol n'est pas en relation avec Alice : la conférence n'existe pas pour elle.
    expect(await codeOf(envoyer(carol, root, reservee, "Bonjour"))).toBe("notFound")
    expect(await codeOf(file(carol, root, reservee))).toBe("notFound")

    // Une conférence d'un AUTRE réseau, demandée au nom de la racine (carol est membre des deux).
    await joinAlso(t, testClosed, alice)
    await joinAlso(t, testClosed, carol)
    const ailleurs = await insertSession(t, { networkId: testClosed, host: alice })
    expect(await codeOf(envoyer(carol, root, ailleurs, "Bonjour"))).toBe("notFound")
    const { commentId: lointain } = await envoyer(carol, testClosed, ailleurs, "Bonjour")
    expect(await codeOf(retirer(carol, root, lointain))).toBe("notFound")

    // Le commentaire d'autrui : un spectateur sans droit de modérer ne distingue rien.
    await connect(t, root, alice, bob)
    await connect(t, root, alice, carol)
    const { commentId } = await envoyer(bob, root, reservee, "Première !")
    expect(await codeOf(retirer(carol, root, commentId))).toBe("notFound")
    expect(must(await t.run(async (ctx) => ctx.db.get(commentId))).status).toBe("published")

    // L'hôte modère ; l'auteur retire le sien, idempotent.
    expect(await retirer(alice, root, commentId)).toEqual({ removed: true })
    expect(await retirer(bob, root, commentId)).toEqual({ removed: true })
    expect(await file(bob, root, reservee)).toEqual([])
  })

  it("débit `live.comment` : au-delà de la capacité, `rateLimited` — par personne, pas par session", async () => {
    const { t, root, alice, bob, carol } = await cast()
    const une = await insertSession(t, { networkId: root, host: alice })
    const autre = await insertSession(t, { networkId: root, host: alice })
    for (let i = 0; i < 4; i++) await envoyer(bob, root, une, `message ${i}`)

    // Changer de conférence ne remet pas le compteur à zéro.
    expect(await codeOf(envoyer(bob, root, autre, "encore"))).toBe("rateLimited")
    // Le seau est celui de la PERSONNE : carol écrit librement.
    await envoyer(carol, root, une, "Bonjour")
    expect(await file(alice, root, une)).toHaveLength(5)
  })

  it("n'écrit ni la session ni ses compteurs : le commentaire et son état de modération, sans texte (DL-03)", async () => {
    const { t, root, alice, bob } = await cast()
    const sessionId = await insertSession(t, { networkId: root, host: alice })
    const avant = await sessionDoc(t, sessionId)

    const { commentId } = await envoyer(bob, root, sessionId, "Bonjour")
    await retirer(bob, root, commentId)

    expect(await sessionDoc(t, sessionId)).toEqual(avant)
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query("liveSessionCounters")
          .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
          .unique(),
      ),
    ).toBeNull()
    const ligne = must(await t.run(async (ctx) => ctx.db.get(commentId)))
    expect(ligne.networkId).toBe(root)
    expect(ligne.status).toBe("removed")
    // DL-03 : la règle de relecture du réseau a jugé le commentaire ; son état ne porte aucun texte.
    const etat = must(await t.run(async (ctx) => ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", "liveComment").eq("targetId", commentId)).unique()))
    expect(etat).toMatchObject({ networkId: root, ownerPersonId: bob.personId, status: "published" })
    expect(JSON.stringify(etat)).not.toContain("Bonjour")
  })
})

describe("la file — ce que l'écran reçoit", () => {
  it("DTO du moteur : auteur par son profil PUBLIÉ (nom neutre sans profil), offset ; la sourdine n'est dite qu'à qui modère", async () => {
    const { t, root, alice, bob, carol } = await cast()
    const sessionId = await insertSession(t, { networkId: root, host: alice })

    tick(1_000)
    const { commentId } = await envoyer(bob, root, sessionId, "Première !")
    tick(1_000)
    await envoyer(carol, root, sessionId, "Bonjour")
    await sourdine(t, sessionId, carol)

    const vueHote = await file(alice, root, sessionId)
    expect(vueHote).toEqual([
      {
        commentId,
        authorPersonId: bob.personId,
        author: { displayName: "bob", handle: "bob", avatarUrl: null },
        body: "Première !",
        offsetMs: 1_000,
        createdAt: T0 + 1_000,
        isMine: false,
        mutedForChat: false,
        pendingReview: false,
      },
      expect.objectContaining({ authorPersonId: carol.personId, offsetMs: 2_000, isMine: false, mutedForChat: true }),
    ])

    // Un spectateur ne modère pas : la sanction ne lui est pas dite.
    const vueBob = await file(bob, root, sessionId)
    expect(vueBob.map((item) => [item.isMine, item.mutedForChat])).toEqual([
      [true, false],
      [false, false],
    ])

    // Profil retiré : un nom NEUTRE, que l'écran traduit — jamais un état civil.
    await t.run(async (ctx) => ctx.db.patch(bob.personId, { withdrawnAt: Date.now() }))
    const [premier] = await file(alice, root, sessionId)
    expect(must(premier).author).toEqual({ displayName: null, handle: null, avatarUrl: null })
    expect(must(premier).authorPersonId).toBe(bob.personId)
  })

  it("les 40 derniers VIVANTS, du plus ancien au plus récent — un retiré n'y prend pas de place", async () => {
    const { t, root, alice } = await cast()
    const sessionId = await insertSession(t, { networkId: root, host: alice })

    // 45 commentaires insérés DIRECTEMENT, plus un retiré (le seau borne l'API, pas le peuplement).
    await t.run(async (ctx) => {
      const startedAt = must(must(await ctx.db.get(sessionId)).startedAt)
      for (let i = 0; i < 46; i++) {
        await ctx.db.insert("liveComments", {
          networkId: root,
          sessionId,
          authorPersonId: alice.personId,
          body: `c${i}`,
          status: i === 45 ? "removed" : "published",
          offsetMs: i * 1000,
          createdAt: startedAt + i * 1000,
        })
      }
    })

    const vue = await file(alice, root, sessionId)
    expect(vue).toHaveLength(DIRECT_COMMENTS_WINDOW)
    expect(must(vue[0]).body).toBe("c5") // les 5 plus anciens sont sortis de la file
    expect(must(vue[DIRECT_COMMENTS_WINDOW - 1]).body).toBe("c44")
    expect(must(vue[0]).offsetMs).toBe(5000)
  })
})
