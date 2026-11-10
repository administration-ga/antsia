// @vitest-environment edge-runtime
// Dupliqué de socle/convex/modules/direct/direct.test.ts @ ad2e7fdc2 — adaptations : personnes et réseaux (graine des fondations, `enter`, `networkId` en argument de chaque fonction), CODES et RÈGLES au lieu des libellés (`notFound`, `LIVE_*`, `rateLimited`, `membershipSuspended`, `pageRoleRequired`) ; jeton `authorizeToken({ networkId, sessionId })` sous l'identité de la personne (plus d'`authSubject`) et « compte inactif » → adhésion SUSPENDUE, refusée avant tout le reste ; D28 — compteurs lus dans `liveSessionCounters` après la récolte (`sessionCountersOf`), admissions dans l'agrégat (`countViewerGrants`), et « revenir n'écrit pas la session » devient « aucune admission n'écrit la session » ; cloche par diffusion chaînée jouée par `finishAllScheduledFunctions`, sur des conférences SANS capture (le job Egress est l'affaire du lot des médias) ; débit `live.create` (3 d'avance, 10 par heure) : les amorçages espacent leurs créations de 6 min ; mutations des lots voisins sous leur nom du moteur (`moderation.ban`, `speakers.{promote, demote, markSfuApplied}`, `comments.{send, list, remove}`, `reactions.{react, summary}`, `presence.leave`, `reap.reapStaleDirects`, `replay.{attachEgress, completeEgress}`) ; fichier de rediffusion rendu servable par la garde des fichiers (ligne d'analyse `generated` posée par le test quand le rapatriement n'en pose pas) ; la CONFÉRENCE D'ADMINISTRATION (4 cas) RÉÉCRITE sur la PAGE du moteur (audience `followers`, signataire vivant, abonné de la page) ; état civil et adresse absents du moteur (le DTO n'a que le profil publié). Cas AJOUTÉS : débit de création et rejeu qui ne consomme rien ; session d'un autre réseau introuvable ; annonce d'une conférence `followers` refusée comme au socle ; cloche `followers` vers les abonnés et signataires de la page seulement ; invités vivants sautés par la cloche de démarrage ; cloche de publication à la porte de la rediffusion ; hôte qui n'est plus signataire : il ne voit plus, il termine encore. Aucun cas retiré. DL-02 : créer sans choix explicite n'enregistre plus (`replayRequested: false`, décision du propriétaire du 9/11/2026).
/**
 * Le DIRECT — ce que ce fichier tient, dans l'ordre :
 *
 *  1. **L'annonce garde l'audience EXACTE de la session** — pour les deux
 *     audiences annonçables, et par le MÊME helper d'écriture que
 *     `posts.publish` (tags extraits, texte indexé), dans le réseau de la session.
 *  2. **Le jeton est fail-closed, DANS L'ORDRE** : adhésion → session live du
 *     réseau → audience → blocage → exclusion → débit → rôle → capacité. Le
 *     refus est INDISTINCT (`notFound`) pour tout ce qui sonderait
 *     l'existence ; seuls l'exclu et la salle comble sont explicites.
 *  3. **La cloche sonne au DÉMARRAGE, jamais à la programmation** — vers les
 *     relations, les abonnés si public, le cercle de la page pour `followers`,
 *     jamais un abonné bloqué, jamais deux fois une personne.
 *  4. **L'antenne est bornée à 8 (hôte compris)**, la promotion exige une
 *     relation, l'époque avance à chaque changement et l'écho SFU en retard
 *     est ignoré.
 *  5. **Ni les réactions, ni les commentaires, ni les admissions n'écrivent la
 *     session** (D28) : chacun sa ligne, la récolte recompose les compteurs
 *     dans `liveSessionCounters`.
 *  6. **La récolte est le miroir de `cleanupStaleCalls`** : `scheduled` 24 h,
 *     `live` 4 h, bail de l'hôte.
 *  7. **Le replay ne peut que RESTREINDRE**, et la branche `directs/` du
 *     webhook aboutit ici.
 */
import { GENERATED_BLOB_SKIP_REASON } from "@antsia/social-domain/filePolicy"
import { DIRECT_HOST_GRACE_MS, DIRECT_HOST_LEASE_MS, DIRECT_LIVE_MAX_DURATION_MS, DIRECT_PRESENCE_TTL_MS } from "@antsia/social-domain/live/domain"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { testConvex } from "../../test.setup"
import { countViewerGrants, sessionCountersOf } from "./access"
import {
  block,
  codeOf,
  connect,
  enter,
  followPage,
  insertPage,
  insertSession,
  invite,
  joinAlso,
  type Person,
  ruleOf,
  seed,
  sessionDoc,
  type T,
  T0,
  tick,
} from "./fixtures.setup"

const L = api.modules.live
const S = api.modules.live.sessions

/** Le seau `live.create` rend une création toutes les 6 min (10 par heure, 3 d'avance) : un amorçage espace les siennes. */
const CREATE_SPACING_MS = 6 * 60_000 + 1_000

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function cast() {
  const t = testConvex()
  const { root, testClosed } = await seed(t)
  const alice = await enter(t, root, "alice")
  const bob = await enter(t, root, "bob")
  const carol = await enter(t, root, "carol")
  return { t, root, testClosed, alice, bob, carol }
}

type CreateArgs = Partial<{
  title: string
  audience: "public" | "connections" | "followers" | "invitees"
  pageId: Id<"pages">
  chatMode: "open" | "closed"
  stageFormat: "television" | "computer" | "mobile"
  stageLayout: "adaptive" | "fixed"
  maxViewers: number
  replay: boolean
  announce: boolean
  announceText: string
  idempotencyKey: string
  invitees: { personId: Id<"persons">; stageRole: "viewer" | "speaker" }[]
}>

/** Une conférence créée par l'API — l'horloge avance d'abord, pour le seau de création. */
async function creerDirect(networkId: Id<"networks">, host: Person, args: CreateArgs = {}): Promise<Id<"liveSessions">> {
  tick(CREATE_SPACING_MS)
  const { title, audience, chatMode, ...rest } = args
  const res = await host.as.mutation(S.create, { networkId, title: title ?? "Point hebdomadaire", audience: audience ?? "public", chatMode: chatMode ?? "open", ...rest })
  return res.sessionId
}

async function demarrer(networkId: Id<"networks">, host: Person, sessionId: Id<"liveSessions">): Promise<void> {
  await host.as.mutation(S.goLive, { networkId, sessionId })
}

const jeton = (person: Person, networkId: Id<"networks">, sessionId: Id<"liveSessions">) =>
  person.as.mutation(internal.modules.live.access.authorizeToken, { networkId, sessionId })

/** Joue les jobs planifiés (diffusions chaînées comprises) jusqu'au dernier. */
async function drain(t: T): Promise<void> {
  await t.finishAllScheduledFunctions(vi.runAllTimers)
}

/** Les cloches d'un genre reçues par une personne dans un réseau. */
async function cloches(t: T, networkId: Id<"networks">, person: Person, kind: Doc<"notifications">["kind"]): Promise<Doc<"notifications">[]> {
  return await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_network_recipient_createdAt", (q) => q.eq("networkId", networkId).eq("recipientPersonId", person.personId))
      .take(50)
    return rows.filter((row) => row.kind === kind)
  })
}

/** Les compteurs SERVIS d'une session (D28) — ligne absente : zéros. */
async function compteurs(t: T, sessionId: Id<"liveSessions">) {
  return await t.run(async (ctx) => sessionCountersOf(ctx, sessionId))
}

async function setMembershipStatus(t: T, networkId: Id<"networks">, person: Person, status: "en_attente" | "declaree" | "suspendue" | "partie"): Promise<void> {
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("networkMemberships")
      .withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", person.personId))
      .unique()
    if (!row) throw new Error("adhésion inconnue")
    await ctx.db.patch(row._id, { status })
  })
}

/** Le fichier rapatrié est SERVABLE : la garde des fichiers le connaît (ligne `generated`), sinon elle le retient. */
async function rendreServable(t: T, networkId: Id<"networks">, storageId: Id<"_storage">): Promise<void> {
  await t.run(async (ctx) => {
    const scan = await ctx.db
      .query("fileScans")
      .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
      .first()
    if (scan) return
    const now = Date.now()
    await ctx.db.insert("fileScans", { storageId, status: "skipped", source: "generated", skipReason: GENERATED_BLOB_SKIP_REASON, networkId, attempts: 0, createdAt: now, updatedAt: now })
  })
}

// ═══════════════════════════════════════════════════════════════════════════

describe("création et annonce", () => {
  it("persiste et restitue chaque format de scène", async () => {
    const { t, root, alice } = await cast()
    for (const stageFormat of ["television", "computer", "mobile"] as const) {
      const sessionId = await creerDirect(root, alice, { stageFormat })
      expect((await sessionDoc(t, sessionId))?.stageFormat).toBe(stageFormat)
      expect((await alice.as.query(S.get, { networkId: root, sessionId })).stageFormat).toBe(stageFormat)
    }
  })

  it("restitue computer pour une session historique sans format de scène", async () => {
    const { t, root, alice } = await cast()
    const now = Date.now()
    const sessionId = await t.run(async (ctx) =>
      ctx.db.insert("liveSessions", {
        networkId: root,
        hostPersonId: alice.personId,
        title: "Direct historique",
        roomName: "direct-legacy",
        status: "scheduled",
        audience: "public",
        chatMode: "open",
        maxViewers: 100,
        replayRequested: false,
        createdAt: now,
        updatedAt: now,
      }),
    )
    expect((await alice.as.query(S.get, { networkId: root, sessionId })).stageFormat).toBe("computer")
  })

  it("la DISPOSITION du lecteur est adaptative par défaut, fixe si on la demande", async () => {
    // ⚠️ Le défaut compte plus que l'option : une scène qui rendrait toujours
    // huit places afficherait six cases vides à un direct à deux (D-04).
    const { t, root, alice } = await cast()
    const parDefaut = await creerDirect(root, alice)
    expect((await sessionDoc(t, parDefaut))?.stageLayout).toBe("adaptive")
    expect((await alice.as.query(S.get, { networkId: root, sessionId: parDefaut })).stageLayout).toBe("adaptive")

    const fixe = await creerDirect(root, alice, { stageLayout: "fixed" })
    expect((await sessionDoc(t, fixe))?.stageLayout).toBe("fixed")
    expect((await alice.as.query(S.get, { networkId: root, sessionId: fixe })).stageLayout).toBe("fixed")
  })

  it("restitue adaptive pour une session historique sans disposition", async () => {
    // Le repli ne peut PAS être `fixed`, qui ramènerait les cases vides de D-04.
    const { t, root, alice } = await cast()
    const now = Date.now()
    const sessionId = await t.run(async (ctx) =>
      ctx.db.insert("liveSessions", {
        networkId: root,
        hostPersonId: alice.personId,
        title: "Direct sans disposition",
        roomName: "direct-legacy-layout",
        status: "scheduled",
        audience: "public",
        chatMode: "open",
        stageFormat: "mobile",
        maxViewers: 100,
        replayRequested: false,
        createdAt: now,
        updatedAt: now,
      }),
    )
    const dto = await alice.as.query(S.get, { networkId: root, sessionId })
    expect(dto.stageLayout).toBe("adaptive")
    // Le format d'émission, lui, n'a pas bougé : les deux notions sont distinctes.
    expect(dto.stageFormat).toBe("mobile")
  })

  it("refuse une disposition hors contrat", async () => {
    const { root, alice } = await cast()
    await expect(alice.as.mutation(S.create, { networkId: root, title: "Disposition invalide", audience: "public", chatMode: "open", stageLayout: "mosaique" as never })).rejects.toThrow()
  })

  it("refuse un format de scène hors contrat", async () => {
    const { root, alice } = await cast()
    await expect(alice.as.mutation(S.create, { networkId: root, title: "Format invalide", audience: "public", chatMode: "open", stageFormat: "cinema" as never })).rejects.toThrow()
  })

  it("créer pose la session, la ligne d'hôte, aucun compteur, et NE sonne PAS", async () => {
    const { t, root, alice, bob } = await cast()
    await connect(t, root, alice, bob)

    const sessionId = await creerDirect(root, alice)
    await drain(t)
    const session = await sessionDoc(t, sessionId)
    // DL-02 — décision du propriétaire du 9/11/2026 : sans choix explicite, rien n'est enregistré.
    expect(session).toMatchObject({ networkId: root, status: "scheduled", hostPersonId: alice.personId, stageFormat: "computer", replayRequested: false })
    // D28 — aucun compteur sur le document que toute la salle regarde.
    expect(session && "viewerGrantCount" in session).toBe(false)
    expect(await compteurs(t, sessionId)).toEqual({ viewerGrantCount: 0, viewerPresentCount: 0, commentCount: 0, reactionCount: 0 })
    const speakers = await t.run(async (ctx) =>
      ctx.db
        .query("liveSpeakers")
        .withIndex("by_session_removedAt", (q) => q.eq("sessionId", sessionId).eq("removedAt", undefined))
        .take(10),
    )
    expect(speakers.map((row) => ({ personId: row.personId, role: row.role, grantEpoch: row.grantEpoch, networkId: row.networkId }))).toEqual([
      { personId: alice.personId, role: "host", grantEpoch: 1, networkId: root },
    ])
    // AUCUNE cloche à la programmation.
    expect(await cloches(t, root, bob, "live_started")).toEqual([])
  })

  it("l'annonce garde l'audience EXACTE de la session — les deux audiences, dans le réseau de la session", async () => {
    const { t, root, alice } = await cast()
    for (const audience of ["public", "connections"] as const) {
      const sessionId = await creerDirect(root, alice, { audience, announce: true, announceText: "On se retrouve en direct #mairie" })
      const session = await sessionDoc(t, sessionId)
      const postId = session?.announcePostId
      expect(postId).toBeDefined()
      const post = await t.run(async (ctx) => (postId ? ctx.db.get(postId) : null))
      expect(post).toMatchObject({ audience, liveSessionId: sessionId, networkId: root, visibility: "network", authorPersonId: alice.personId })
      // Le MÊME geste d'écriture que posts.publish : tags dénormalisés, texte indexé présent.
      expect(post?.tags).toEqual(["mairie"])
      expect(typeof post?.searchText).toBe("string")
    }
  })

  it("sans texte, l'annonce porte le titre ; l'idempotence garde le premier format et UNE annonce", async () => {
    const { t, root, alice } = await cast()
    const first = await alice.as.mutation(S.create, { networkId: root, title: "Conseil municipal", audience: "public", chatMode: "open", stageFormat: "television", announce: true, idempotencyKey: "clef-1" })
    const replay = await alice.as.mutation(S.create, { networkId: root, title: "Conseil municipal", audience: "public", chatMode: "open", stageFormat: "mobile", announce: true, idempotencyKey: "clef-1" })
    expect(replay).toEqual({ sessionId: first.sessionId, created: false })
    const session = await sessionDoc(t, first.sessionId)
    expect(session?.stageFormat).toBe("television")
    const announces = await t.run(async (ctx) => {
      const posts = await ctx.db
        .query("posts")
        .withIndex("by_network_author_publishedAt", (q) => q.eq("networkId", root).eq("authorPersonId", alice.personId))
        .take(50)
      return posts.filter((post) => post.liveSessionId === first.sessionId)
    })
    expect(announces.map((post) => ({ _id: post._id, body: post.body }))).toEqual([{ _id: session?.announcePostId, body: "Conseil municipal" }])
    expect((await alice.as.query(S.get, { networkId: root, sessionId: first.sessionId })).stageFormat).toBe("television")
  })

  it("le fil rend la projection du direct, statut RELU à chaque lecture", async () => {
    const { t, root, alice, bob } = await cast()
    await connect(t, root, alice, bob)

    const sessionId = await creerDirect(root, alice, { announce: true })
    let feed = await bob.as.query(api.modules.posts.posts.myFeed, { networkId: root })
    expect(feed.items[0]?.live).toMatchObject({ sessionId, status: "scheduled", title: "Point hebdomadaire" })

    await demarrer(root, alice, sessionId)
    feed = await bob.as.query(api.modules.posts.posts.myFeed, { networkId: root })
    expect(feed.items[0]?.live).toMatchObject({ sessionId, status: "live" })
    // Une publication ordinaire ne porte aucune projection de direct.
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Ordinaire", audience: "public" })
    expect((await bob.as.query(api.modules.posts.posts.getPost, { networkId: root, postId })).live).toBeUndefined()
  })

  it("débit `live.create` : la quatrième création d'affilée est refusée, un rejeu idempotent ne consomme rien", async () => {
    const { root, alice } = await cast()
    const keyed = await alice.as.mutation(S.create, { networkId: root, title: "Un", audience: "public", chatMode: "open", idempotencyKey: "k-1" })
    await alice.as.mutation(S.create, { networkId: root, title: "Deux", audience: "public", chatMode: "open" })
    await alice.as.mutation(S.create, { networkId: root, title: "Trois", audience: "public", chatMode: "open" })
    expect(await codeOf(alice.as.mutation(S.create, { networkId: root, title: "Quatre", audience: "public", chatMode: "open" }))).toBe("rateLimited")
    // Le rejeu rend la session existante, seau vide ou non.
    expect(await alice.as.mutation(S.create, { networkId: root, title: "Un", audience: "public", chatMode: "open", idempotencyKey: "k-1" })).toEqual({ sessionId: keyed.sessionId, created: false })
    tick(CREATE_SPACING_MS)
    expect((await alice.as.mutation(S.create, { networkId: root, title: "Quatre", audience: "public", chatMode: "open" })).created).toBe(true)
  })

  it("une session d'un AUTRE réseau est introuvable, comme une session inventée", async () => {
    const { t, root, testClosed, alice, bob } = await cast()
    await joinAlso(t, testClosed, alice)
    const ailleurs = await creerDirect(testClosed, alice, { idempotencyKey: "meme-cle" })
    expect((await sessionDoc(t, ailleurs))?.networkId).toBe(testClosed)
    expect((await alice.as.query(S.get, { networkId: testClosed, sessionId: ailleurs })).status).toBe("scheduled")
    // Depuis la racine, la même personne ne la trouve pas — ni pour la lire, ni pour la démarrer, ni pour la terminer.
    expect(await codeOf(alice.as.query(S.get, { networkId: root, sessionId: ailleurs }))).toBe("notFound")
    expect(await codeOf(alice.as.mutation(S.goLive, { networkId: root, sessionId: ailleurs }))).toBe("notFound")
    expect(await codeOf(alice.as.mutation(S.end, { networkId: root, sessionId: ailleurs }))).toBe("notFound")
    // Un non-membre du réseau fermé n'y entre pas (refus du constructeur).
    expect(await codeOf(bob.as.query(S.get, { networkId: testClosed, sessionId: ailleurs }))).toBe("notFound")
    // La clé d'idempotence vaut DANS un réseau : la même clé, à la racine, crée une autre conférence.
    const ici = await creerDirect(root, alice, { idempotencyKey: "meme-cle" })
    expect(ici).not.toBe(ailleurs)
    expect((await sessionDoc(t, ici))?.networkId).toBe(root)
  })

  it("annonce une conférence followers avec la signature de page et garde les invités privés", async () => {
    const { t, root, alice, bob, carol } = await cast()
    const pageId = await insertPage(t, root, alice)
    await followPage(t, pageId, bob)
    const { sessionId } = await alice.as.mutation(S.create, { networkId: root, title: "Annonce aux abonnés", audience: "followers", pageId, chatMode: "open", announce: true })
    const doc = await sessionDoc(t, sessionId)
    expect(doc?.announcePostId).toBeDefined()
    const post = await bob.as.query(api.modules.posts.posts.getPost, { networkId: root, postId: doc!.announcePostId! })
    expect(post.page?.pageId).toBe(pageId)
    expect(post.audience).toBe("followers")
    expect(await codeOf(carol.as.query(api.modules.posts.posts.getPost, { networkId: root, postId: doc!.announcePostId! }))).toBe("notFound")
    expect((await alice.as.query(S.get, { networkId: root, sessionId })).page?.pageId).toBe(pageId)
    tick(CREATE_SPACING_MS)
    expect(await ruleOf(alice.as.mutation(S.create, { networkId: root, title: "Réservée", audience: "invitees", chatMode: "open", announce: true }))).toBe("LIVE_INVITEES_NOT_ANNOUNCED")
  })
})

describe("démarrage et cloche", () => {
  it("goLive sonne les relations et les abonnés (public), jamais un abonné bloqué", async () => {
    const { t, root, alice, bob, carol } = await cast()
    const dan = await enter(t, root, "dan")
    await connect(t, root, alice, bob)
    // carol et dan SUIVENT alice (abonnement, pas relation).
    await carol.as.mutation(api.modules.graph.follows.follow, { networkId: root, handle: "alice" })
    await dan.as.mutation(api.modules.graph.follows.follow, { networkId: root, handle: "alice" })
    // alice bloque dan APRÈS l'abonnement — le lien est relu à l'acte.
    await block(t, root, alice, dan)

    const sessionId = await creerDirect(root, alice, { audience: "public", replay: false })
    await demarrer(root, alice, sessionId)
    await drain(t)

    for (const person of [bob, carol]) {
      const rows = await cloches(t, root, person, "live_started")
      expect(rows.map((row) => ({ subject: row.subjectLiveSessionId, actor: row.actorPersonId })), person.handle).toEqual([{ subject: sessionId, actor: alice.personId }])
    }
    expect(await cloches(t, root, dan, "live_started")).toEqual([])
    expect(await cloches(t, root, alice, "live_started")).toEqual([])
  })

  it("audience connections : les abonnés non reliés ne sont PAS sonnés", async () => {
    const { t, root, alice, bob, carol } = await cast()
    await connect(t, root, alice, bob)
    await carol.as.mutation(api.modules.graph.follows.follow, { networkId: root, handle: "alice" })

    const sessionId = await creerDirect(root, alice, { audience: "connections", replay: false })
    await demarrer(root, alice, sessionId)
    await drain(t)

    expect((await cloches(t, root, bob, "live_started")).map((row) => row.subjectLiveSessionId)).toEqual([sessionId])
    expect(await cloches(t, root, carol, "live_started")).toEqual([])
  })

  it("audience followers : les abonnés et les signataires vivants de la page sont sonnés, pas le reste du réseau", async () => {
    const { t, root, alice, bob, carol } = await cast()
    const dan = await enter(t, root, "dan")
    const pageId = await insertPage(t, root, alice)
    // dan co-signe la page sans la suivre ; bob la suit ; carol est une relation de l'hôte, sans plus.
    await t.run(async (ctx) => {
      await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId: dan.personId, role: "signatory", acceptedAt: 1, createdAt: 1, updatedAt: 1 })
    })
    await followPage(t, pageId, bob)
    await connect(t, root, alice, carol)

    const sessionId = await creerDirect(root, alice, { audience: "followers", pageId, replay: false })
    await demarrer(root, alice, sessionId)
    await drain(t)

    expect((await cloches(t, root, bob, "live_started")).map((row) => row.subjectLiveSessionId)).toEqual([sessionId])
    expect((await cloches(t, root, dan, "live_started")).map((row) => row.subjectLiveSessionId)).toEqual([sessionId])
    expect(await cloches(t, root, carol, "live_started")).toEqual([])
    expect(await cloches(t, root, alice, "live_started")).toEqual([])
  })

  it("un invité vivant n'est pas sonné une seconde fois par la cloche de démarrage", async () => {
    const { t, root, alice, bob, carol } = await cast()
    await connect(t, root, alice, bob)
    await connect(t, root, alice, carol)
    const sessionId = await creerDirect(root, alice, { audience: "connections", replay: false, invitees: [{ personId: bob.personId, stageRole: "viewer" }] })
    await demarrer(root, alice, sessionId)
    await drain(t)

    // bob a sa cloche d'invitation (l'ouverture aux invités) — pas celle du démarrage.
    expect(await cloches(t, root, bob, "live_started")).toEqual([])
    expect((await cloches(t, root, carol, "live_started")).map((row) => row.subjectLiveSessionId)).toEqual([sessionId])
  })

  it("publier l'enregistrement sonne à la porte de la REDIFFUSION : invité compris, simple abonné écarté par la restriction", async () => {
    const { t, root, alice, bob, carol } = await cast()
    const dan = await enter(t, root, "dan")
    await connect(t, root, alice, bob)
    await carol.as.mutation(api.modules.graph.follows.follow, { networkId: root, handle: "alice" })
    // Une conférence publique terminée, enregistrée, à la rediffusion refermée sur les relations.
    const sessionId = await insertSession(t, { networkId: root, host: alice, status: "ended" })
    await invite(t, sessionId, dan)
    const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob(["fausse video"])))
    await t.run(async (ctx) => ctx.db.patch(sessionId, { replayStatus: "ready", replayPublication: "undecided", replayStorageId: storageId, replayRetentionUntil: Date.now() + 86_400_000, replayVisibility: "connections" }))

    await alice.as.mutation(S.decideReplayPublication, { networkId: root, sessionId, decision: "published" })
    await drain(t)

    expect((await cloches(t, root, bob, "live_replay_published")).map((row) => row.subjectLiveSessionId)).toEqual([sessionId])
    // L'invité nominatif garde l'enregistrement, même refermé sur les relations (ADR-0150, D).
    expect((await cloches(t, root, dan, "live_replay_published")).map((row) => row.subjectLiveSessionId)).toEqual([sessionId])
    // Un simple abonné ne passe pas la restriction : la cloche n'annonce pas une copie qu'il ne pourrait pas lire.
    expect(await cloches(t, root, carol, "live_replay_published")).toEqual([])

    // Rejouer la même décision ne sonne pas une seconde fois.
    expect(await alice.as.mutation(S.decideReplayPublication, { networkId: root, sessionId, decision: "published" })).toEqual({ updated: false, publication: "published", discarded: false })
  })
})

describe("jeton — fail-closed, dans l'ordre", () => {
  it("une adhésion SUSPENDUE est refusée AVANT tout le reste", async () => {
    const { t, root, alice, carol } = await cast()
    const sessionId = await creerDirect(root, alice)
    await demarrer(root, alice, sessionId)
    await setMembershipStatus(t, root, carol, "suspendue")
    expect(await codeOf(jeton(carol, root, sessionId))).toBe("membershipSuspended")
  })

  it("session non-live : refus INDISTINCT, identique à l'inexistante", async () => {
    const { root, alice, bob } = await cast()
    const sessionId = await creerDirect(root, alice) // scheduled, jamais live
    expect(await codeOf(jeton(bob, root, sessionId))).toBe("notFound")
    await alice.as.mutation(S.end, { networkId: root, sessionId })
    expect(await codeOf(jeton(bob, root, sessionId))).toBe("notFound")
  })

  it("audience connections : l'étranger reçoit le refus INDISTINCT", async () => {
    const { root, alice, carol } = await cast()
    const sessionId = await creerDirect(root, alice, { audience: "connections" })
    await demarrer(root, alice, sessionId)
    expect(await codeOf(jeton(carol, root, sessionId))).toBe("notFound")
  })

  it("ORDRE : un exclu HORS audience reçoit le refus d'AUDIENCE, pas celui d'exclusion", async () => {
    const { root, alice, carol } = await cast()
    const sessionId = await creerDirect(root, alice, { audience: "connections" })
    await alice.as.mutation(L.moderation.ban, { networkId: root, sessionId, targetPersonId: carol.personId })
    await demarrer(root, alice, sessionId)
    // S'il recevait « exclu », il apprendrait que la session existe.
    expect(await codeOf(jeton(carol, root, sessionId))).toBe("notFound")
  })

  it("le blocage ferme dans les deux sens — refus indistinct", async () => {
    const { t, root, alice, bob } = await cast()
    const sessionId = await creerDirect(root, alice, { audience: "public" })
    await demarrer(root, alice, sessionId)
    await block(t, root, bob, alice)
    expect(await codeOf(jeton(bob, root, sessionId))).toBe("notFound")
  })

  it("l'exclu d'un direct qu'il POUVAIT voir reçoit le refus explicite", async () => {
    const { root, alice, bob } = await cast()
    const sessionId = await creerDirect(root, alice, { audience: "public" })
    await alice.as.mutation(L.moderation.ban, { networkId: root, sessionId, targetPersonId: bob.personId })
    await demarrer(root, alice, sessionId)
    expect(await ruleOf(jeton(bob, root, sessionId))).toBe("LIVE_EXCLUDED")
  })

  it("spectateur admis : rôle viewer, une admission ; hôte : speaker, aucune admission", async () => {
    const { t, root, alice, bob } = await cast()
    const sessionId = await creerDirect(root, alice, { audience: "public" })
    await demarrer(root, alice, sessionId)

    const spectateur = await jeton(bob, root, sessionId)
    expect(spectateur).toMatchObject({ role: "viewer", personId: bob.personId })
    const hote = await jeton(alice, root, sessionId)
    expect(hote.role).toBe("speaker")
    expect(spectateur.roomName.startsWith("direct-")).toBe(true)
    // bob seul — l'hôte ne compte pas.
    expect(await t.run(async (ctx) => countViewerGrants(ctx, sessionId))).toBe(1)
  })

  it("redemander un jeton spectateur ne gonfle ni l'audience ni la capacité", async () => {
    const { t, root, alice, bob, carol } = await cast()
    const sessionId = await creerDirect(root, alice, { maxViewers: 2 })
    await demarrer(root, alice, sessionId)

    await jeton(bob, root, sessionId)
    tick()
    await jeton(bob, root, sessionId)

    expect(await t.run(async (ctx) => countViewerGrants(ctx, sessionId))).toBe(1)
    const grant = await t.run(async (ctx) =>
      ctx.db
        .query("liveViewerGrants")
        .withIndex("by_session_person", (q) => q.eq("sessionId", sessionId).eq("personId", bob.personId))
        .unique(),
    )
    expect(grant).not.toBeNull()
    expect(grant?.lastGrantedAt).toBeGreaterThan(grant?.firstGrantedAt ?? Number.POSITIVE_INFINITY)

    await expect(jeton(carol, root, sessionId)).resolves.toMatchObject({ role: "viewer" })
  })

  it("capacité : la salle PLEINE de présents est refusée explicitement", async () => {
    // Personne n'est parti, la salle est réellement comble. Le cas d'à côté —
    // une salle VIDE de présents mais pleine d'admissions passées — est E24.
    const { root, alice, bob, carol } = await cast()
    const sessionId = await creerDirect(root, alice, { maxViewers: 1 })
    await demarrer(root, alice, sessionId)
    await jeton(bob, root, sessionId)
    expect(await ruleOf(jeton(carol, root, sessionId))).toBe("LIVE_FULL")
  })

  it("un intervenant promu obtient le rôle speaker au jeton", async () => {
    const { t, root, alice, bob } = await cast()
    await connect(t, root, alice, bob)
    const sessionId = await creerDirect(root, alice)
    await demarrer(root, alice, sessionId)
    await alice.as.mutation(L.speakers.promote, { networkId: root, sessionId, targetPersonId: bob.personId })
    expect((await jeton(bob, root, sessionId)).role).toBe("speaker")
  })
})

/**
 * E24 (D-09) — LA CAPACITÉ SE JUGE SUR LES PRÉSENTS, PAS SUR LES ENTRÉES.
 *
 * `viewerGrantCount` compte les personnes distinctes admises DEPUIS LE DÉBUT
 * et ne redescend jamais ; le bail (`presence.heartbeat`, TTL 90 s) donne le
 * nombre de PRÉSENTS. Les deux coexistent, chacun sous son nom, hors de la
 * session (D28).
 */
describe("E24 — la place se libère (D-09)", () => {
  it("une salle pleine d'admissions PASSÉES rouvre dès qu'une personne part", async () => {
    const { t, root, alice, bob, carol } = await cast()
    const dan = await enter(t, root, "dan")
    const sessionId = await creerDirect(root, alice, { maxViewers: 2 })
    await demarrer(root, alice, sessionId)

    await jeton(bob, root, sessionId)
    await jeton(carol, root, sessionId)
    expect(await ruleOf(jeton(dan, root, sessionId))).toBe("LIVE_FULL")

    // Bob s'en va. ⚠️ AUCUNE récolte entre les deux : le refus se rejuge par
    // un recomptage EN TRANSACTION.
    await bob.as.mutation(L.presence.leave, { networkId: root, sessionId })
    await expect(jeton(dan, root, sessionId)).resolves.toMatchObject({ role: "viewer" })

    await t.mutation(internal.modules.live.reap.reapStaleDirects, {})
    // Trois personnes ont rejoint, deux sont en ligne : les deux nombres sont vrais.
    expect(await compteurs(t, sessionId)).toMatchObject({ viewerGrantCount: 3, viewerPresentCount: 2 })
  })

  it("une place ABANDONNÉE (bail expiré) rouvre aussi, sans passage de la récolte", async () => {
    const { t, root, alice, bob, carol } = await cast()
    const sessionId = await creerDirect(root, alice, { maxViewers: 1 })
    await demarrer(root, alice, sessionId)
    await jeton(bob, root, sessionId)
    expect(await ruleOf(jeton(carol, root, sessionId))).toBe("LIVE_FULL")

    // L'onglet de bob est mort il y a plus de 90 s — il ne bat plus.
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("liveViewerGrants")
        .withIndex("by_session_person", (q) => q.eq("sessionId", sessionId).eq("personId", bob.personId))
        .unique()
      if (!row) throw new Error("admission attendue")
      await ctx.db.patch(row._id, { lastSeenAt: Date.now() - (DIRECT_PRESENCE_TTL_MS + 1_000) })
    })
    await expect(jeton(carol, root, sessionId)).resolves.toMatchObject({ role: "viewer" })
  })

  it("aucune admission n'écrit la session — ni l'entrée, ni le retour (D28)", async () => {
    // L'admission d'un spectateur réécrivait la session (compteurs) et
    // réveillait toute la salle : elle n'écrit plus que SA ligne.
    const { t, root, alice, bob } = await cast()
    const sessionId = await creerDirect(root, alice, { maxViewers: 5 })
    await demarrer(root, alice, sessionId)
    const avant = await sessionDoc(t, sessionId)

    await jeton(bob, root, sessionId)
    expect(await sessionDoc(t, sessionId)).toEqual(avant)
    tick()
    await jeton(bob, root, sessionId)
    expect(await sessionDoc(t, sessionId)).toEqual(avant)
    expect(await t.run(async (ctx) => countViewerGrants(ctx, sessionId))).toBe(1)
  })

  it("le DTO sert les DEUX nombres, chacun sous son nom", async () => {
    const { t, root, alice, bob, carol } = await cast()
    const sessionId = await creerDirect(root, alice, { maxViewers: 10 })
    await demarrer(root, alice, sessionId)
    await jeton(bob, root, sessionId)
    await jeton(carol, root, sessionId)
    await carol.as.mutation(L.presence.leave, { networkId: root, sessionId })
    await t.mutation(internal.modules.live.reap.reapStaleDirects, {})

    const dto = await alice.as.query(S.get, { networkId: root, sessionId })
    expect(dto.counters.viewers).toBe(2)
    expect(dto.counters.present).toBe(1)
  })
})

describe("antenne — promotion, rétrogradation, époque", () => {
  it("la promotion exige une RELATION, même sur un direct public", async () => {
    const { root, alice, bob } = await cast()
    const sessionId = await creerDirect(root, alice, { audience: "public" })
    await demarrer(root, alice, sessionId)
    expect(await ruleOf(alice.as.mutation(L.speakers.promote, { networkId: root, sessionId, targetPersonId: bob.personId }))).toBe("LIVE_PROMOTE_CONNECTIONS_ONLY")
  })

  it("l'antenne plafonne à 8, hôte compris", async () => {
    const { t, root, alice } = await cast()
    const invites: Person[] = []
    for (let i = 0; i < 8; i++) {
      const person = await enter(t, root, `inv${i}`)
      await connect(t, root, alice, person)
      invites.push(person)
    }
    const sessionId = await creerDirect(root, alice)
    await demarrer(root, alice, sessionId)
    // 7 promotions passent (hôte + 7 = 8) ; la 8e déborde.
    for (const person of invites.slice(0, 7)) {
      await alice.as.mutation(L.speakers.promote, { networkId: root, sessionId, targetPersonId: person.personId })
    }
    const last = invites[7]
    if (!last) throw new Error("huitième invité attendu")
    expect(await ruleOf(alice.as.mutation(L.speakers.promote, { networkId: root, sessionId, targetPersonId: last.personId }))).toBe("LIVE_STAGE_FULL")
  })

  it("rétrograder avance l'époque ; re-promouvoir rouvre la MÊME ligne ; l'écho SFU en retard est ignoré", async () => {
    const { t, root, alice, bob } = await cast()
    await connect(t, root, alice, bob)
    const sessionId = await creerDirect(root, alice)
    await demarrer(root, alice, sessionId)
    const speakerRow = async () =>
      await t.run(async (ctx) =>
        ctx.db
          .query("liveSpeakers")
          .withIndex("by_session_person", (q) => q.eq("sessionId", sessionId).eq("personId", bob.personId))
          .unique(),
      )

    await alice.as.mutation(L.speakers.promote, { networkId: root, sessionId, targetPersonId: bob.personId })
    const rowAfterPromote = await speakerRow()
    if (!rowAfterPromote) throw new Error("ligne d'intervenant attendue")
    expect(rowAfterPromote.grantEpoch).toBe(1)

    await alice.as.mutation(L.speakers.demote, { networkId: root, sessionId, targetPersonId: bob.personId })
    await alice.as.mutation(L.speakers.promote, { networkId: root, sessionId, targetPersonId: bob.personId })
    const rowAfterCycle = await speakerRow()
    if (!rowAfterCycle) throw new Error("ligne d'intervenant attendue")
    expect(rowAfterCycle._id).toBe(rowAfterPromote._id)
    expect(rowAfterCycle.grantEpoch).toBe(3)
    expect(rowAfterCycle.removedAt).toBeUndefined()
    expect(rowAfterCycle.sfuAppliedAt).toBeUndefined()

    // Écho SFU d'une époque DÉPASSÉE : ignoré.
    await t.mutation(internal.modules.live.speakers.markSfuApplied, { speakerId: rowAfterCycle._id, epoch: 2 })
    expect((await speakerRow())?.sfuAppliedAt).toBeUndefined()
    // Écho de l'époque COURANTE : acquitté.
    await t.mutation(internal.modules.live.speakers.markSfuApplied, { speakerId: rowAfterCycle._id, epoch: 3 })
    expect((await speakerRow())?.sfuAppliedAt).toBeDefined()
  })

  it("l'exclusion rétrograde l'intervenant et ferme la page", async () => {
    const { t, root, alice, bob } = await cast()
    await connect(t, root, alice, bob)
    const sessionId = await creerDirect(root, alice)
    await demarrer(root, alice, sessionId)
    await alice.as.mutation(L.speakers.promote, { networkId: root, sessionId, targetPersonId: bob.personId })
    await alice.as.mutation(L.moderation.ban, { networkId: root, sessionId, targetPersonId: bob.personId })
    const row = await t.run(async (ctx) =>
      ctx.db
        .query("liveSpeakers")
        .withIndex("by_session_person", (q) => q.eq("sessionId", sessionId).eq("personId", bob.personId))
        .unique(),
    )
    expect(row?.removedAt).toBeDefined()
    // La page se referme — refus indistinct.
    expect(await codeOf(bob.as.query(S.get, { networkId: root, sessionId }))).toBe("notFound")
  })
})

describe("commentaires — persistés, bornés, conversation fermable", () => {
  it("conversation fermée : personne n'écrit ; session non-live : personne n'écrit", async () => {
    const { root, alice, bob } = await cast()
    const ferme = await creerDirect(root, alice, { chatMode: "closed" })
    await demarrer(root, alice, ferme)
    expect(await ruleOf(bob.as.mutation(L.comments.send, { networkId: root, sessionId: ferme, body: "Bonjour" }))).toBe("LIVE_CHAT_CLOSED")

    const pasEncore = await creerDirect(root, alice, { chatMode: "open" })
    expect(await ruleOf(bob.as.mutation(L.comments.send, { networkId: root, sessionId: pasEncore, body: "Bonjour" }))).toBe("LIVE_NOT_LIVE")
  })

  it("la file rend les 40 derniers vivants, du plus ancien au plus récent, décalage posé", async () => {
    const { t, root, alice } = await cast()
    const sessionId = await creerDirect(root, alice)
    await demarrer(root, alice, sessionId)

    // 45 commentaires insérés DIRECTEMENT (le seau borne l'API réelle, pas le peuplement du test).
    await t.run(async (ctx) => {
      const session = await ctx.db.get(sessionId)
      const startedAt = session?.startedAt ?? 0
      for (let i = 0; i < 45; i++) {
        await ctx.db.insert("liveComments", {
          networkId: root,
          sessionId,
          authorPersonId: alice.personId,
          body: `c${i}`,
          status: "published",
          offsetMs: i * 1000,
          createdAt: startedAt + i * 1000,
        })
      }
    })

    const file = await alice.as.query(L.comments.list, { networkId: root, sessionId })
    expect(file).toHaveLength(40)
    expect(file[0]?.body).toBe("c5") // les 5 plus anciens sont sortis de la file
    expect(file[39]?.body).toBe("c44")
    expect(file[0]?.offsetMs).toBe(5000)
  })

  it("send pose le décalage de rediffusion ; l'hôte peut retirer le commentaire d'autrui", async () => {
    const { t, root, alice, bob } = await cast()
    const sessionId = await creerDirect(root, alice)
    await demarrer(root, alice, sessionId)

    const { commentId } = await bob.as.mutation(L.comments.send, { networkId: root, sessionId, body: "Première !" })
    const comment = await t.run(async (ctx) => ctx.db.get(commentId))
    expect(comment?.offsetMs).toBeGreaterThanOrEqual(0)
    await alice.as.mutation(L.comments.remove, { networkId: root, commentId })
    expect(await alice.as.query(L.comments.list, { networkId: root, sessionId })).toHaveLength(0)
  })

  it("le seau borne le débit d'UNE personne", async () => {
    const { root, alice, carol } = await cast()
    const sessionId = await creerDirect(root, alice)
    await demarrer(root, alice, sessionId)
    // Capacité 4 : les 4 premiers passent, le 5e est borné.
    for (let i = 0; i < 4; i++) {
      await carol.as.mutation(L.comments.send, { networkId: root, sessionId, body: `spam ${i}` })
    }
    expect(await codeOf(carol.as.mutation(L.comments.send, { networkId: root, sessionId, body: "spam 5" }))).toBe("rateLimited")
  })
})

describe("réactions — le chemin chaud n'écrit JAMAIS la session", () => {
  it("chacun sa ligne par genre ; la rafale est re-bornée à 12 ; la session n'est pas écrite", async () => {
    const { t, root, alice, bob } = await cast()
    const sessionId = await creerDirect(root, alice, { replay: false })
    await demarrer(root, alice, sessionId)
    const avant = await sessionDoc(t, sessionId)

    expect((await bob.as.mutation(L.reactions.react, { networkId: root, sessionId, kind: "bravo", burst: 50 })).credited).toBe(12)
    await bob.as.mutation(L.reactions.react, { networkId: root, sessionId, kind: "bravo", burst: 3 })
    await bob.as.mutation(L.reactions.react, { networkId: root, sessionId, kind: "like", burst: 1 })

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("liveReactions")
        .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
        .take(10),
    )
    expect(rows).toHaveLength(2) // (bob, bravo) et (bob, like)
    expect(rows.find((row) => row.kind === "bravo")?.count).toBe(15)
    // La SESSION n'a pas bougé — l'écrivain unique n'est pas ce chemin.
    expect(await sessionDoc(t, sessionId)).toEqual(avant)

    const resume = await bob.as.query(L.reactions.summary, { networkId: root, sessionId })
    expect(resume.total).toBe(16)
    expect(resume.byKind.find((k) => k.kind === "bravo")?.count).toBe(15)
  })

  it("l'écrivain unique recompose les compteurs à la fin", async () => {
    const { t, root, alice, bob } = await cast()
    const sessionId = await creerDirect(root, alice)
    await demarrer(root, alice, sessionId)
    await bob.as.mutation(L.reactions.react, { networkId: root, sessionId, kind: "soutien", burst: 5 })
    await bob.as.mutation(L.comments.send, { networkId: root, sessionId, body: "Bravo pour ce direct" })
    await alice.as.mutation(S.end, { networkId: root, sessionId })
    expect((await sessionDoc(t, sessionId))?.status).toBe("ended")
    expect(await compteurs(t, sessionId)).toMatchObject({ reactionCount: 5, commentCount: 1 })
  })
})

describe("récolte — miroir de cleanupStaleCalls", () => {
  it("un live fantôme (> 4 h) et un scheduled oublié (> 24 h) sont fermés ; un live sain est rafraîchi", async () => {
    const { t, root, alice } = await cast()
    const fantome = await creerDirect(root, alice, { title: "Fantôme" })
    await demarrer(root, alice, fantome)
    const oublie = await creerDirect(root, alice, { title: "Oublié" })
    const sain = await creerDirect(root, alice, { title: "Sain" })
    await demarrer(root, alice, sain)
    await alice.as.mutation(L.reactions.react, { networkId: root, sessionId: sain, kind: "like", burst: 2 })

    await t.run(async (ctx) => {
      const now = Date.now()
      await ctx.db.patch(fantome, { startedAt: now - 5 * 60 * 60_000 })
      await ctx.db.patch(oublie, { createdAt: now - 25 * 60 * 60_000 })
    })

    await t.mutation(internal.modules.live.reap.reapStaleDirects, {})

    expect((await sessionDoc(t, fantome))?.status).toBe("ended")
    expect((await sessionDoc(t, oublie))?.status).toBe("ended")
    expect((await sessionDoc(t, sain))?.status).toBe("live")
    // Le passage de récolte a joué l'écrivain unique sur le live sain.
    expect((await compteurs(t, sain)).reactionCount).toBe(2)
  })
})

describe("récolte — le bail de présence de l'hôte (D-14)", () => {
  /** Pose un bail dont le dernier battement remonte à `ageMs`. */
  async function poserBail(t: T, sessionId: Id<"liveSessions">, host: Person, ageMs: number, state: "connected" | "reconnecting" | "absent" = "connected") {
    await t.run(async (ctx) => {
      const session = await ctx.db.get(sessionId)
      if (!session) throw new Error("session inconnue")
      const lastSeenAt = Date.now() - ageMs
      await ctx.db.insert("liveHostPresence", {
        networkId: session.networkId,
        sessionId,
        hostPersonId: host.personId,
        state,
        lastSeenAt,
        leaseUntil: lastSeenAt + DIRECT_HOST_LEASE_MS,
        updatedAt: lastSeenAt,
      })
    })
  }

  async function bail(t: T, sessionId: Id<"liveSessions">) {
    return await t.run(async (ctx) =>
      ctx.db
        .query("liveHostPresence")
        .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
        .unique(),
    )
  }

  it("bail éteint ET grâce écoulée → ended host_absent, Egress arrêté", async () => {
    const { t, root, alice } = await cast()
    const sessionId = await creerDirect(root, alice, { replay: true })
    await demarrer(root, alice, sessionId)
    await t.run(async (ctx) => ctx.db.patch(sessionId, { egressId: "EG_ABANDON" }))
    // Dernier battement : bail (30 s) + grâce (120 s) + 10 s.
    await poserBail(t, sessionId, alice, DIRECT_HOST_LEASE_MS + DIRECT_HOST_GRACE_MS + 10_000)

    const avant = await t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").take(100))
    await t.mutation(internal.modules.live.reap.reapStaleDirects, {})

    const ses = await sessionDoc(t, sessionId)
    expect(ses?.status).toBe("ended")
    expect(ses?.endReason).toBe("host_absent")
    // Deux minutes, pas quatre heures : le direct n'a pas duré 4 h.
    expect((ses?.endedAt ?? 0) - (ses?.startedAt ?? 0)).toBeLessThan(4 * 60 * 60_000)
    const apres = await t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").take(100))
    expect(apres.slice(avant.length).some((row) => row.name.includes("stopDirectEgress"))).toBe(true)
  })

  it("bail éteint mais DANS la grâce → toujours live, absence CONSTATÉE sur le bail", async () => {
    const { t, root, alice } = await cast()
    const sessionId = await creerDirect(root, alice)
    await demarrer(root, alice, sessionId)
    // Bail éteint depuis 20 s : la grâce (120 s) court toujours.
    await poserBail(t, sessionId, alice, DIRECT_HOST_LEASE_MS + 20_000)

    await t.mutation(internal.modules.live.reap.reapStaleDirects, {})

    const ses = await sessionDoc(t, sessionId)
    expect(ses?.status).toBe("live")
    expect(ses?.endReason).toBeUndefined()
    const ligne = await bail(t, sessionId)
    expect(ligne?.state).toBe("absent")
    expect(ligne?.absentSince).toBe(ligne?.leaseUntil)

    // Un second passage ne repousse pas `absentSince` : l'absence a UNE date.
    await t.mutation(internal.modules.live.reap.reapStaleDirects, {})
    expect((await bail(t, sessionId))?.absentSince).toBe(ligne?.absentSince)
  })

  it("un bail FRAIS laisse le direct vivre — même sans autre activité", async () => {
    const { t, root, alice } = await cast()
    const sessionId = await creerDirect(root, alice)
    await demarrer(root, alice, sessionId)
    await poserBail(t, sessionId, alice, 5_000)

    await t.mutation(internal.modules.live.reap.reapStaleDirects, {})

    expect((await sessionDoc(t, sessionId))?.status).toBe("live")
    expect((await bail(t, sessionId))?.state).toBe("connected")
  })

  it("SANS ligne de bail, la règle des 4 h reste seule juge (fail-open)", async () => {
    const { t, root, alice } = await cast()
    const jeune = await creerDirect(root, alice, { title: "Sans bail, jeune" })
    await demarrer(root, alice, jeune)
    const vieux = await creerDirect(root, alice, { title: "Sans bail, vieux" })
    await demarrer(root, alice, vieux)
    await t.run(async (ctx) => ctx.db.patch(vieux, { startedAt: Date.now() - 5 * 60 * 60_000 }))

    await t.mutation(internal.modules.live.reap.reapStaleDirects, {})

    // Un client ancien qui ne bat pas ne fait pas fermer sa conférence.
    expect((await sessionDoc(t, jeune))?.status).toBe("live")
    const ancien = await sessionDoc(t, vieux)
    expect(ancien?.status).toBe("ended")
    expect(ancien?.endReason).toBe("max_duration")
  })

  it("la limite absolue l'emporte sur un bail frais, et le scheduled oublié dit pourquoi", async () => {
    const { t, root, alice } = await cast()
    const marathon = await creerDirect(root, alice, { title: "Marathon" })
    await demarrer(root, alice, marathon)
    await poserBail(t, marathon, alice, 2_000)
    const oublie = await creerDirect(root, alice, { title: "Oublié" })
    await t.run(async (ctx) => {
      await ctx.db.patch(marathon, { startedAt: Date.now() - 5 * 60 * 60_000 })
      await ctx.db.patch(oublie, { createdAt: Date.now() - 25 * 60 * 60_000 })
    })

    await t.mutation(internal.modules.live.reap.reapStaleDirects, {})

    const ses = await sessionDoc(t, marathon)
    expect(ses?.status).toBe("ended")
    expect(ses?.endReason).toBe("max_duration")
    expect((await sessionDoc(t, oublie))?.endReason).toBe("never_started")
  })

  it("la fin explicite de l'hôte s'appelle `host`, et le DTO annonce la limite", async () => {
    const { root, alice } = await cast()
    const sessionId = await creerDirect(root, alice)

    const avantDemarrage = await alice.as.query(S.get, { networkId: root, sessionId })
    // Rien n'a commencé : on n'annonce pas la fin de ce qui n'existe pas.
    expect(avantDemarrage.maxDurationAt).toBeNull()
    expect(avantDemarrage.endReason).toBeNull()

    await demarrer(root, alice, sessionId)
    const enDirect = await alice.as.query(S.get, { networkId: root, sessionId })
    expect(enDirect.maxDurationAt).toBe((enDirect.startedAt ?? 0) + DIRECT_LIVE_MAX_DURATION_MS)
    expect(enDirect.endReason).toBeNull()

    await alice.as.mutation(S.end, { networkId: root, sessionId })
    expect((await alice.as.query(S.get, { networkId: root, sessionId })).endReason).toBe("host")
  })
})

describe("replay — Egress rattaché, visibilité qui ne peut que restreindre", () => {
  it("attachEgress puis completeEgress rendent le replay lisible ; egressId inconnu absorbé", async () => {
    const { t, root, alice, bob } = await cast()
    await connect(t, root, alice, bob)
    const sessionId = await creerDirect(root, alice, { replay: true })
    await demarrer(root, alice, sessionId)

    await t.mutation(internal.modules.live.replay.attachEgress, { sessionId, egressId: "EG_123" })

    // Un fichier réel dans le stockage du harnais.
    const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob(["fausse video"])))
    const inconnu = await t.mutation(internal.modules.live.replay.completeEgress, { egressId: "EG_INCONNU", storageId })
    expect(inconnu.found).toBe(false)

    await alice.as.mutation(S.end, { networkId: root, sessionId })
    const trouve = await t.mutation(internal.modules.live.replay.completeEgress, { egressId: "EG_123", storageId, durationMs: 90_000 })
    expect(trouve.found).toBe(true)
    await rendreServable(t, root, storageId)
    // ADR-0158 — la copie naît NON DÉCIDÉE : l'hôte la publie, sinon bob ne voit rien.
    await alice.as.mutation(S.decideReplayPublication, { networkId: root, sessionId, decision: "published" })

    const vue = await bob.as.query(S.get, { networkId: root, sessionId })
    expect(vue.replay).toMatchObject({ status: "ready", durationMs: 90_000 })
    expect(vue.replay?.url).toBeTruthy()
  })

  it("la visibilité du replay ne peut que RESTREINDRE, et la restriction ferme aux non-relations", async () => {
    const { t, root, alice, bob, carol } = await cast()
    await connect(t, root, alice, bob)

    const prive = await creerDirect(root, alice, { audience: "connections", replay: true })
    expect(await ruleOf(alice.as.mutation(S.setReplayVisibility, { networkId: root, sessionId: prive, visibility: "public" }))).toBe("LIVE_REPLAY_VISIBILITY_WIDENS")

    const publicSession = await creerDirect(root, alice, { audience: "public", replay: true })
    await demarrer(root, alice, publicSession)
    await t.mutation(internal.modules.live.replay.attachEgress, { sessionId: publicSession, egressId: "EG_PUB" })
    const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob(["video publique"])))
    await alice.as.mutation(S.end, { networkId: root, sessionId: publicSession })
    await t.mutation(internal.modules.live.replay.completeEgress, { egressId: "EG_PUB", storageId })
    await rendreServable(t, root, storageId)
    await alice.as.mutation(S.decideReplayPublication, { networkId: root, sessionId: publicSession, decision: "published" })
    await alice.as.mutation(S.setReplayVisibility, { networkId: root, sessionId: publicSession, visibility: "connections" })

    // bob (relation) voit le replay ; carol voit la SESSION (audience publique) mais PAS le replay.
    expect((await bob.as.query(S.get, { networkId: root, sessionId: publicSession })).replay?.status).toBe("ready")
    expect((await carol.as.query(S.get, { networkId: root, sessionId: publicSession })).replay).toBeNull()
  })
})

describe("DTO — rien ne fuit", () => {
  it("get ne rend ni roomName, ni identifiant de stockage, ni l'annonce à qui n'est pas l'hôte", async () => {
    const { root, alice, bob } = await cast()
    const sessionId = await creerDirect(root, alice, { announce: true })
    await demarrer(root, alice, sessionId)
    const vue = await bob.as.query(S.get, { networkId: root, sessionId })
    const brut = JSON.stringify(vue)
    expect(brut).not.toContain("direct-") // roomName `direct-…` absent du DTO
    expect(brut).not.toContain("storage")
    expect(vue.viewerRole).toBe("viewer")
    // Le nom vient du profil PUBLIÉ.
    expect(vue.host.displayName).toBe("alice")
    // L'annonce n'est exposée qu'à l'hôte.
    expect(vue.announcePostId).toBeNull()
    expect((await alice.as.query(S.get, { networkId: root, sessionId })).announcePostId).not.toBeNull()
  })
})

describe("la conférence AU NOM D'UNE PAGE — audience `followers` (ex-« conférence d'administration »)", () => {
  it("une audience `followers` SANS page est refusée", async () => {
    // Sans page, l'audience ne désigne personne : la salle se croirait ouverte
    // et resterait vide, y compris pour son hôte.
    const { root, alice } = await cast()
    expect(await ruleOf(alice.as.mutation(S.create, { networkId: root, title: "Point interne", audience: "followers", chatMode: "open" }))).toBe("LIVE_FOLLOWERS_REQUIRES_PAGE")
  })

  it("parler au nom d'une page exige d'en être SIGNATAIRE VIVANT — le même droit que d'y publier", async () => {
    const { t, root, testClosed, alice, bob } = await cast()
    const pageId = await insertPage(t, root, alice)
    await followPage(t, pageId, bob)
    // Abonné, mais pas signataire : refusé.
    expect(await codeOf(bob.as.mutation(S.create, { networkId: root, title: "Point interne", audience: "followers", pageId, chatMode: "open" }))).toBe("pageRoleRequired")
    // Une page d'un autre réseau n'est pas gérée d'ici : refus indistinct.
    await joinAlso(t, testClosed, alice)
    const ailleurs = await insertPage(t, testClosed, alice, "page-ailleurs")
    tick(CREATE_SPACING_MS)
    expect(await codeOf(alice.as.mutation(S.create, { networkId: root, title: "Point interne", audience: "public", pageId: ailleurs, chatMode: "open" }))).toBe("notFound")
    // Le signataire vivant, lui, tient la conférence au nom de la page.
    const sessionId = await creerDirect(root, alice, { audience: "followers", pageId })
    expect((await sessionDoc(t, sessionId))?.pageId).toBe(pageId)
  })

  it("un ABONNÉ de la page voit la conférence ; un membre qui ne la suit pas non — même en relation avec l'hôte", async () => {
    const { t, root, alice, bob, carol } = await cast()
    const pageId = await insertPage(t, root, alice)
    const sessionId = await creerDirect(root, alice, { audience: "followers", pageId, title: "Permanence du 15 août" })

    await followPage(t, pageId, bob)
    expect((await bob.as.query(S.get, { networkId: root, sessionId })).title).toBe("Permanence du 15 août")

    // Une relation ouvrirait un direct `connections` : le cercle de la page ne se remplace pas par une relation personnelle.
    await connect(t, root, carol, alice)
    expect(await codeOf(carol.as.query(S.get, { networkId: root, sessionId }))).toBe("notFound")
  })

  it("son REPLAY reste réservé — on ne l'ouvre pas par la porte de l'enregistrement", async () => {
    // Sinon la restriction se contournerait par la copie durable.
    const { t, root, alice } = await cast()
    const pageId = await insertPage(t, root, alice)
    const sessionId = await creerDirect(root, alice, { audience: "followers", pageId })
    expect(await ruleOf(alice.as.mutation(S.setReplayVisibility, { networkId: root, sessionId, visibility: "public" }))).toBe("LIVE_REPLAY_VISIBILITY_WIDENS")
  })

  it("l'hôte qui n'est plus signataire ne voit plus sa conférence, mais la TERMINE encore", async () => {
    const { t, root, alice } = await cast()
    const pageId = await insertPage(t, root, alice)
    const sessionId = await creerDirect(root, alice, { audience: "followers", pageId })
    await demarrer(root, alice, sessionId)
    // Sa signature est retirée (il ne suit pas la page) : la conférence se referme sur lui aussi.
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("pageSignatories")
        .withIndex("by_page_person", (q) => q.eq("pageId", pageId).eq("personId", alice.personId))
        .unique()
      if (row) await ctx.db.delete(row._id)
    })
    expect(await codeOf(alice.as.query(S.get, { networkId: root, sessionId }))).toBe("notFound")
    // … et pourtant il ferme la salle derrière lui : le chemin de l'hôte ne passe pas par la garde de lecture.
    expect(await alice.as.mutation(S.end, { networkId: root, sessionId })).toEqual({ ended: true })
    expect((await sessionDoc(t, sessionId))?.status).toBe("ended")
  })
})
