// @vitest-environment edge-runtime
// Dupliqué de socle/convex/modules/direct/replayPublication.test.ts @ ad2e7fdc2 — adaptations : COMPTES → personnes et réseaux (graine des fondations, `enter`, fonctions `sessions.*` et `invitees.revoke` bornées par `networkId`) ; les invités de « Invités seulement » et de la conférence publique ne sont plus des AGENTS rattachés à une administration (`orgs`, `memberships` du socle retirés) : un membre du réseau relié à l'hôte est conviable (V35) ; relations et abonnements posés par l'outillage du moteur (`connect`, ligne `follows`) ; refus à code au lieu des phrases (`liveRoleRequired`, règles `LIVE_REPLAY_WITHDRAWN`, `LIVE_REPLAY_DECISION_AFTER_END`, `LIVE_NO_RECORDING`, `LIVE_REPLAY_NOT_STARTED`) ; motif de démarrage refusé en CODE (`start_refused`) ; cloche `live_replay_published` lue dans `notifications` du moteur (`recipientPersonId`, `actorPersonId`, `subjectLiveSessionId`), APRÈS les lots de diffusion joués (`notifications/fanout` : la cloche ne sonne plus dans la transaction) ; la session « antérieure au lot » posée en base porte une vidéo CONNUE de la garde des fichiers (inscrite comme produite par la plateforme : le moteur ne sert aucun fichier inconnu de sa garde) ; horloge simulée ; les seize cas portés ; DL-02 (décision du propriétaire du 9/11/2026) : sans choix explicite, rien n'est enregistré — le premier cas l'affirme désormais, et les conférences des autres cas sont créées avec `replay: true`.
/**
 * LE SORT DE L'ENREGISTREMENT SE DÉCIDE À LA FIN (ADR-0158).
 *
 * Trois défauts constatés en recette le 2026-09-16, chacun gardé ici :
 *
 *  · une conférence créée sans cocher « Enregistrer » n'avait AUCUNE copie —
 *    l'hôte découvrait à la fin qu'il n'y avait rien à garder ;
 *  · une conférence enregistrée se PUBLIAIT toute seule à la fermeture : la
 *    rediffusion entrait dans la découverte sans que l'hôte ait rien dit ;
 *  · « Récupérer l'enregistrement » s'offrait sur tout échec, et le serveur
 *    répondait « rien à récupérer » quand l'Egress n'avait jamais démarré.
 *
 * Depuis ce lot : on enregistre d'office, la copie naît NON DÉCIDÉE, et seul
 * l'hôte l'ouvre (publier), la range (garder pour moi) ou la supprime.
 *
 * ⚠️ DL-02 (9/11/2026) — le PREMIER point est renversé par décision du
 * propriétaire : enregistrer redevient un choix explicite (décoché par défaut,
 * au formulaire comme au serveur), et chaque personne à l'antenne y consent.
 * Les deux autres points tiennent : copie non décidée, décision de l'hôte.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { testConvex } from "../../test.setup"
import { registerGeneratedBlob } from "../files/admission"
import { ban, codeOf, connect, enter, type Person, ruleOf, seed, type T, T0 } from "./fixtures.setup"

const S = api.modules.live.sessions
const R = internal.modules.live.replay

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  // Les jobs joués (`drainDueJobs`) comprennent le démarrage de l'Egress, sans
  // LiveKit ici : son refus de configuration se journalise.
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function must<X>(value: X | null | undefined): X {
  if (value === null || value === undefined) throw new Error("valeur absente")
  return value
}

/** Une conférence PUBLIQUE, ENREGISTRÉE sauf `replay: false` (DL-02 : l'enregistrement est un choix explicite). */
async function conference(root: Id<"networks">, host: Person, extra: { replay?: boolean } = {}): Promise<Id<"liveSessions">> {
  const created = await host.as.mutation(S.create, {
    networkId: root,
    title: "Point du jour",
    audience: "public",
    chatMode: "open",
    replay: extra.replay ?? true,
  })
  return created.sessionId
}

async function video(t: T): Promise<Id<"_storage">> {
  return await t.run((ctx) => ctx.storage.store(new Blob(["video"])))
}

/** Démarrée, corrélée, terminée, fichier livré : une copie PRÊTE. */
async function copiePrete(t: T, root: Id<"networks">, host: Person, egressId: string): Promise<{ sessionId: Id<"liveSessions">; videoId: Id<"_storage"> }> {
  const sessionId = await conference(root, host)
  await host.as.mutation(S.goLive, { networkId: root, sessionId })
  await t.mutation(R.attachEgress, { sessionId, egressId })
  await host.as.mutation(S.end, { networkId: root, sessionId })
  const videoId = await video(t)
  await t.mutation(R.completeEgress, { egressId, storageId: videoId, durationMs: 60_000 })
  return { sessionId, videoId }
}

const jobs = (t: T) => t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").take(500))

/** Joue les jobs DÉJÀ dus (diffusion par lots, arrêt de l'Egress), jamais l'échéance des 90 jours. */
async function drainDueJobs(t: T): Promise<void> {
  await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
}

async function cast() {
  const t = testConvex()
  const { root } = await seed(t)
  const alice = await enter(t, root, "alice")
  const bob = await enter(t, root, "bob")
  return { t, root, alice, bob }
}

describe("enregistrer est un choix explicite — le sort de la copie vient APRÈS", () => {
  it("DL-02 — créer sans rien dire N'ENREGISTRE PAS ; `replay: true` enregistre", async () => {
    const { t, root, alice } = await cast()
    const parDefaut = (await alice.as.mutation(S.create, { networkId: root, title: "Point du jour", audience: "public", chatMode: "open" })).sessionId
    const avec = await conference(root, alice, { replay: true })
    await t.run(async (ctx) => {
      expect(must(await ctx.db.get(parDefaut)).replayRequested).toBe(false)
      expect(must(await ctx.db.get(avec)).replayRequested).toBe(true)
    })
  })

  it("passer en direct lance la capture et pose la copie NON DÉCIDÉE", async () => {
    const { t, root, alice, bob } = await cast()
    const sessionId = await conference(root, alice)
    const avant = await jobs(t)
    await alice.as.mutation(S.goLive, { networkId: root, sessionId })
    const apres = await jobs(t)
    expect(apres.slice(avant.length).some((row) => row.name.includes("startDirectEgress"))).toBe(true)
    await t.run(async (ctx) => {
      const session = must(await ctx.db.get(sessionId))
      expect(session.replayStatus).toBe("pending")
      expect(session.replayPublication).toBe("undecided")
    })
    // Pendant le direct, la salle SAIT qu'on enregistre — c'est une
    // information, pas une copie : le bloc est servi à tout le monde.
    const vue = await bob.as.query(S.get, { networkId: root, sessionId })
    expect(vue.replay).toMatchObject({ status: "pending", publication: "undecided" })
  })

  it("sans capture demandée, rien ne part et rien n'est à décider", async () => {
    const { t, root, alice } = await cast()
    const sessionId = await conference(root, alice, { replay: false })
    const avant = await jobs(t)
    await alice.as.mutation(S.goLive, { networkId: root, sessionId })
    const apres = await jobs(t)
    expect(apres.slice(avant.length).some((row) => row.name.includes("startDirectEgress"))).toBe(false)
    await t.run(async (ctx) => {
      const session = must(await ctx.db.get(sessionId))
      expect(session.replayStatus).toBeUndefined()
      expect(session.replayPublication).toBeUndefined()
    })
  })
})

describe("tant que l'hôte n'a rien dit, la copie n'est qu'à lui", () => {
  it("après la fin, l'audience ne voit NI le bloc, NI la vignette ; l'hôte voit tout", async () => {
    const { t, root, alice, bob } = await cast()
    const { sessionId } = await copiePrete(t, root, alice, "EG_UNDECIDED")

    const hote = must((await alice.as.query(S.get, { networkId: root, sessionId })).replay)
    expect(hote.status).toBe("ready")
    expect(hote.publication).toBe("undecided")
    expect(hote.url).toBeTruthy()
    expect(hote.canManage).toBe(true)

    const salle = await bob.as.query(S.get, { networkId: root, sessionId })
    // Refus INDISTINCT : « pas de replay pour ce lecteur », sans dire pourquoi.
    expect(salle.replay).toBeNull()
    expect((await bob.as.query(S.listReplays, { networkId: root })).items).toEqual([])
  })

  it("une session ANTÉRIEURE au lot (champ absent) reste publiée — rien ne change pour elle", async () => {
    const { t, root, alice, bob } = await cast()
    const now = Date.now()
    const videoId = await t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob(["video historique"]))
      // La copie est CONNUE de la garde des fichiers, comme au rattachement :
      // le moteur ne sert aucun fichier qu'elle ne connaît pas.
      await registerGeneratedBlob(ctx as unknown as MutationCtx, id, { mimeType: "video/mp4", networkId: root, uploadedByPersonId: alice.personId })
      return id
    })
    const sessionId = await t.run((ctx) =>
      ctx.db.insert("liveSessions", {
        networkId: root,
        hostPersonId: alice.personId,
        title: "Conférence d'avant",
        roomName: "direct-legacy-pub",
        status: "ended",
        audience: "public",
        chatMode: "open",
        maxViewers: 100,
        replayRequested: true,
        replayStatus: "ready",
        replayStorageId: videoId,
        replayRetentionUntil: now + 30 * 24 * 60 * 60_000,
        createdAt: now - 3_600_000,
        startedAt: now - 3_000_000,
        endedAt: now - 1_000_000,
        updatedAt: now,
      }),
    )
    const vue = must((await bob.as.query(S.get, { networkId: root, sessionId })).replay)
    expect(vue.publication).toBe("published")
    expect(vue.url).toBeTruthy()
  })
})

describe("décider : publier, garder pour moi, ne pas conserver", () => {
  it("PUBLIER ouvre la copie à l'audience et à la découverte", async () => {
    const { t, root, alice, bob } = await cast()
    const { sessionId } = await copiePrete(t, root, alice, "EG_PUB")

    expect(await alice.as.mutation(S.decideReplayPublication, { networkId: root, sessionId, decision: "published" })).toEqual({
      updated: true,
      publication: "published",
      discarded: false,
    })

    const vue = must((await bob.as.query(S.get, { networkId: root, sessionId })).replay)
    expect(vue.status).toBe("ready")
    expect(vue.publication).toBe("published")
    expect(vue.url).toBeTruthy()
    expect((await bob.as.query(S.listReplays, { networkId: root })).items.map((row) => String(row.sessionId))).toEqual([String(sessionId)])

    // Rejouée : rien à écrire, et on le dit.
    expect(await alice.as.mutation(S.decideReplayPublication, { networkId: root, sessionId, decision: "published" })).toEqual({
      updated: false,
      publication: "published",
      discarded: false,
    })
  })

  it("GARDER POUR MOI range la copie dans « Mes conférences », invisible de la salle", async () => {
    const { t, root, alice, bob } = await cast()
    const { sessionId } = await copiePrete(t, root, alice, "EG_PRIV")

    await alice.as.mutation(S.decideReplayPublication, { networkId: root, sessionId, decision: "private" })
    expect((await bob.as.query(S.get, { networkId: root, sessionId })).replay).toBeNull()
    const mine = await alice.as.query(S.listMine, { networkId: root })
    expect(must(mine.find((row) => String(row.sessionId) === String(sessionId))).replay).toMatchObject({ status: "ready", publication: "private" })
    // Et l'hôte peut encore changer d'avis : publier plus tard rouvre.
    await alice.as.mutation(S.decideReplayPublication, { networkId: root, sessionId, decision: "published" })
    expect(must((await bob.as.query(S.get, { networkId: root, sessionId })).replay).publication).toBe("published")
  })

  it("NE PAS CONSERVER est un retrait : blobs purgés, ligne `expired`, rien ne ressuscite", async () => {
    const { t, root, alice } = await cast()
    const { sessionId, videoId } = await copiePrete(t, root, alice, "EG_DISCARD")

    expect(await alice.as.mutation(S.decideReplayPublication, { networkId: root, sessionId, decision: "discard" })).toMatchObject({ updated: true, discarded: true })
    const etat = await t.run(async (ctx) => ({
      session: must(await ctx.db.get(sessionId)),
      video: await ctx.db.system.get("_storage", videoId),
    }))
    expect(etat.session.replayStatus).toBe("expired")
    expect(etat.session.replayStorageId).toBeUndefined()
    expect(etat.video).toBeNull()

    // Publier une copie supprimée n'a plus de sens — refus EXPLICITE.
    expect(await ruleOf(alice.as.mutation(S.decideReplayPublication, { networkId: root, sessionId, decision: "published" }))).toBe("LIVE_REPLAY_WITHDRAWN")
    // Re-supprimer ne fait rien, et le dit.
    expect(await alice.as.mutation(S.decideReplayPublication, { networkId: root, sessionId, decision: "discard" })).toMatchObject({ updated: false, discarded: true })
  })

  it("la question ne se pose qu'à la FIN, et qu'à qui gère", async () => {
    const { root, alice, bob } = await cast()
    const sessionId = await conference(root, alice)
    await alice.as.mutation(S.goLive, { networkId: root, sessionId })

    expect(await ruleOf(alice.as.mutation(S.decideReplayPublication, { networkId: root, sessionId, decision: "published" }))).toBe("LIVE_REPLAY_DECISION_AFTER_END")

    await alice.as.mutation(S.end, { networkId: root, sessionId })
    expect(await codeOf(bob.as.mutation(S.decideReplayPublication, { networkId: root, sessionId, decision: "published" }))).toBe("liveRoleRequired")

    // Une conférence SANS capture n'a rien à décider.
    const sans = await conference(root, alice, { replay: false })
    await alice.as.mutation(S.goLive, { networkId: root, sessionId: sans })
    await alice.as.mutation(S.end, { networkId: root, sessionId: sans })
    expect(await ruleOf(alice.as.mutation(S.decideReplayPublication, { networkId: root, sessionId: sans, decision: "private" }))).toBe("LIVE_NO_RECORDING")
  })

  it("décider PENDANT que la copie se fabrique est permis — la production suit son cours", async () => {
    const { t, root, alice, bob } = await cast()
    const sessionId = await conference(root, alice)
    await alice.as.mutation(S.goLive, { networkId: root, sessionId })
    await t.mutation(R.attachEgress, { sessionId, egressId: "EG_LATE" })
    await alice.as.mutation(S.end, { networkId: root, sessionId })

    await alice.as.mutation(S.decideReplayPublication, { networkId: root, sessionId, decision: "published" })
    // Le fichier arrive APRÈS la décision : il est servi à l'audience.
    await t.mutation(R.completeEgress, { egressId: "EG_LATE", storageId: await t.run((ctx) => ctx.storage.store(new Blob(["video tardive"]))) })
    const vue = must((await bob.as.query(S.get, { networkId: root, sessionId })).replay)
    expect(vue.status).toBe("ready")
    expect(vue.url).toBeTruthy()
  })
})

describe("« Récupérer l'enregistrement » ne s'offre que s'il y a quelque chose à récupérer", () => {
  it("un Egress jamais corrélé rend `recoverable: false` ; une corrélation en échec, `true`", async () => {
    const { t, root, alice } = await cast()

    // Échec AU DÉMARRAGE : aucun egressId, rien chez LiveKit.
    const jamais = await conference(root, alice)
    await alice.as.mutation(S.goLive, { networkId: root, sessionId: jamais })
    await t.mutation(R.attachEgress, { sessionId: jamais, failed: true, failureReason: "start_refused" })
    await alice.as.mutation(S.end, { networkId: root, sessionId: jamais })
    const vueJamais = must((await alice.as.query(S.get, { networkId: root, sessionId: jamais })).replay)
    expect(vueJamais.status).toBe("failed")
    expect(vueJamais.failureReason).toBe("start_refused")
    expect(vueJamais.recoverable).toBe(false)
    // Et le serveur est d'accord avec l'écran : rien à récupérer.
    expect(await ruleOf(alice.as.mutation(S.retryReplay, { networkId: root, sessionId: jamais }))).toBe("LIVE_REPLAY_NOT_STARTED")

    // Corrélé puis en échec chez LiveKit : là, on peut aller demander.
    const correle = await conference(root, alice)
    await alice.as.mutation(S.goLive, { networkId: root, sessionId: correle })
    await t.mutation(R.attachEgress, { sessionId: correle, egressId: "EG_RECOV" })
    await alice.as.mutation(S.end, { networkId: root, sessionId: correle })
    await t.mutation(R.completeEgress, { egressId: "EG_RECOV", failureReason: "egress_failed" })
    const vueCorrele = must((await alice.as.query(S.get, { networkId: root, sessionId: correle })).replay)
    expect(vueCorrele.status).toBe("failed")
    expect(vueCorrele.recoverable).toBe(true)
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * CH-094 — PUBLIER se dit à l'audience
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Même audience et mêmes bornes que la cloche de démarrage, rejugée à la porte
 * de la REDIFFUSION : la cloche n'annonce jamais une copie que la page
 * refuserait de servir. Seule une publication effective sonne.
 */

/** Un abonnement, posé tel quel : seul compte ici le lien, pas son geste. */
async function suivre(t: T, root: Id<"networks">, follower: Person, target: Person): Promise<void> {
  await t.run((ctx) => ctx.db.insert("follows", { networkId: root, followerPersonId: follower.personId, targetPersonId: target.personId, createdAt: Date.now() }))
}

/** Les cloches « enregistrement publié » d'une session — après les lots de diffusion. */
async function replayBells(t: T, sessionId: Id<"liveSessions">): Promise<Doc<"notifications">[]> {
  await drainDueJobs(t)
  const rows = await t.run(async (ctx) => ctx.db.query("notifications").take(500))
  return rows.filter((row) => row.kind === "live_replay_published" && row.subjectLiveSessionId === sessionId)
}

const recipientsOf = (bells: { recipientPersonId: Id<"persons"> }[]) => bells.map((row) => String(row.recipientPersonId)).sort()

describe("publier se dit à l'audience (CH-094)", () => {
  it("PUBLIER sonne connexions et abonnés, jamais l'hôte ; le rejeu ne re-sonne pas", async () => {
    const { t, root, alice, bob } = await cast()
    const carla = await enter(t, root, "carla")
    await enter(t, root, "denis") // ni connexion ni abonné : hors audience de la cloche
    await connect(t, root, alice, bob)
    await suivre(t, root, carla, alice)
    const { sessionId } = await copiePrete(t, root, alice, "EG_CLOCHE")
    // Terminer ne dit rien de la copie : elle n'est à personne tant que
    // l'hôte n'a pas décidé.
    expect(await replayBells(t, sessionId)).toEqual([])

    await expect(alice.as.mutation(S.decideReplayPublication, { networkId: root, sessionId, decision: "published" })).resolves.toMatchObject({
      updated: true,
      publication: "published",
    })
    const bells = await replayBells(t, sessionId)
    expect(recipientsOf(bells)).toEqual([String(bob.personId), String(carla.personId)].sort())
    for (const row of bells) {
      expect(row.actorPersonId).toBe(alice.personId)
      expect(row.resolution).toBeUndefined()
      expect(row.readAt).toBeUndefined()
    }

    // Rejouée : rien n'est écrit, aucune cloche n'est rafraîchie.
    const avant = bells.map((row) => row.createdAt)
    await expect(alice.as.mutation(S.decideReplayPublication, { networkId: root, sessionId, decision: "published" })).resolves.toMatchObject({ updated: false })
    expect((await replayBells(t, sessionId)).map((row) => row.createdAt)).toEqual(avant)
  })

  it("garder pour moi et ne pas conserver ne sonnent personne ; publier plus tard, si", async () => {
    const { t, root, alice, bob } = await cast()
    await connect(t, root, alice, bob)

    const gardee = (await copiePrete(t, root, alice, "EG_GARDEE")).sessionId
    await alice.as.mutation(S.decideReplayPublication, { networkId: root, sessionId: gardee, decision: "private" })
    expect(await replayBells(t, gardee)).toEqual([])

    const supprimee = (await copiePrete(t, root, alice, "EG_SUPPRIMEE")).sessionId
    await alice.as.mutation(S.decideReplayPublication, { networkId: root, sessionId: supprimee, decision: "discard" })
    expect(await replayBells(t, supprimee)).toEqual([])

    // L'hôte change d'avis sur la copie gardée : la publication, elle, sonne.
    await alice.as.mutation(S.decideReplayPublication, { networkId: root, sessionId: gardee, decision: "published" })
    expect(recipientsOf(await replayBells(t, gardee))).toEqual([String(bob.personId)])
  })

  it("la porte de la REDIFFUSION : visibilité restreinte et exclusion écartent la cloche", async () => {
    const { t, root, alice, bob } = await cast()
    const carla = await enter(t, root, "carla")
    const dora = await enter(t, root, "dora")
    await connect(t, root, alice, bob)
    await connect(t, root, alice, dora)
    await suivre(t, root, carla, alice)
    const { sessionId } = await copiePrete(t, root, alice, "EG_PORTE")
    // Le direct était public ; sa copie se referme sur les connexions…
    await alice.as.mutation(S.setReplayVisibility, { networkId: root, sessionId, visibility: "connections" })
    // …et dora, pourtant connexion, a été exclue de la conférence.
    await ban(t, sessionId, dora)

    await alice.as.mutation(S.decideReplayPublication, { networkId: root, sessionId, decision: "published" })
    // L'abonnée ne peut pas revoir une copie réservée aux connexions, l'exclue
    // ne revoit rien : ni l'une ni l'autre n'est sonnée.
    expect(recipientsOf(await replayBells(t, sessionId))).toEqual([String(bob.personId)])
  })

  it("« Invités seulement » : chaque invité VIVANT est sonné, jamais un retiré ni une connexion non invitée", async () => {
    // Un invité est un membre du réseau relié à l'hôte (V35) — plus d'agent
    // rattaché à une administration.
    const { t, root, alice, bob } = await cast()
    const carla = await enter(t, root, "carla")
    const denis = await enter(t, root, "denis")
    await connect(t, root, alice, bob)
    await connect(t, root, alice, carla)
    await connect(t, root, alice, denis)

    const { sessionId } = await alice.as.mutation(S.create, {
      networkId: root,
      title: "Réunion restreinte",
      audience: "invitees",
      chatMode: "open",
      replay: true,
      invitees: [
        { personId: bob.personId, stageRole: "viewer" },
        { personId: carla.personId, stageRole: "viewer" },
      ],
    })
    await alice.as.mutation(S.goLive, { networkId: root, sessionId })
    await t.mutation(R.attachEgress, { sessionId, egressId: "EG_INVITES" })
    // Carla est retirée avant la fin : la rediffusion ne lui est plus due.
    await alice.as.mutation(api.modules.live.invitees.revoke, { networkId: root, sessionId, personId: carla.personId })
    await alice.as.mutation(S.end, { networkId: root, sessionId })
    await t.mutation(R.completeEgress, { egressId: "EG_INVITES", storageId: await video(t), durationMs: 60_000 })

    await alice.as.mutation(S.decideReplayPublication, { networkId: root, sessionId, decision: "published" })
    // Bob (invité vivant) seul : Carla est retirée, Denis est une connexion
    // qui n'a jamais été conviée — et l'hôte ne se sonne pas.
    const bells = await replayBells(t, sessionId)
    expect(recipientsOf(bells)).toEqual([String(bob.personId)])
    expect(bells[0]?.actorPersonId).toBe(alice.personId)
  })

  it("une conférence PUBLIQUE sonne aussi l'invité qui n'est ni connexion ni abonné — une seule fois", async () => {
    const { t, root, alice, bob } = await cast()
    const eve = await enter(t, root, "eve")
    await connect(t, root, alice, bob)
    // L'éligibilité d'un invité se juge à l'AJOUT : Eve est invitée grâce à
    // sa connexion, puis la connexion disparaît — elle reste invitée VIVANTE,
    // hors connexions et hors abonnés.
    await connect(t, root, alice, eve)
    const { sessionId } = await alice.as.mutation(S.create, {
      networkId: root,
      title: "Point public",
      audience: "public",
      chatMode: "open",
      replay: true,
      invitees: [
        { personId: bob.personId, stageRole: "viewer" },
        { personId: eve.personId, stageRole: "viewer" },
      ],
    })
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("connections").take(50)) {
        if (row.personIdLow === eve.personId || row.personIdHigh === eve.personId) await ctx.db.delete(row._id)
      }
    })
    await alice.as.mutation(S.goLive, { networkId: root, sessionId })
    await t.mutation(R.attachEgress, { sessionId, egressId: "EG_PUBLIC_INVITES" })
    await alice.as.mutation(S.end, { networkId: root, sessionId })
    await t.mutation(R.completeEgress, { egressId: "EG_PUBLIC_INVITES", storageId: await video(t), durationMs: 60_000 })
    await alice.as.mutation(S.decideReplayPublication, { networkId: root, sessionId, decision: "published" })
    // Bob est à la fois invité et connexion : une seule cloche. Eve n'est
    // plus que l'invitée : sonnée quand même.
    const bells = await replayBells(t, sessionId)
    expect(recipientsOf(bells)).toEqual([String(bob.personId), String(eve.personId)].sort())
  })
})
