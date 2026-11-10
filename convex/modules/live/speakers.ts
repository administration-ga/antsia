// Dupliqué de socle/convex/modules/direct/speakers.ts @ ad2e7fdc2 — adaptations : personnes et réseaux — constructeur `networkMutation`, lecteur `directCaller`, cible `targetPersonId`, tables `liveSessions`/`liveSpeakers` (`networkId` copié de la session sur la ligne d'intervenant, champs `hostPersonId`/`spotlightPersonId`), session des primitives avec son `networkId` ; relation ACCEPTÉE avec l'hôte lue DANS le réseau de la session ; compte « actif » = personne non effacée (`deletionRequestedAt`), l'adhésion au réseau étant relue par la décision d'accès (V35) ; `promote` réservé à une cible membre DÉCLARÉE du réseau de la session (`lib/access.memberHasStatus`, comme les appels) — un membre en attente est refusé `LIVE_TARGET_CANNOT_JOIN_STAGE`, sans ligne ni action SFU ; sujet LiveKit = `authUserId` de la personne (toujours posé : seule une personne disparue de la base n'a plus d'identité à viser) ; actions SFU planifiées sous `modules/live/livekitActions` ; refus à CODE de règle (`LIVE_ALREADY_ON_STAGE`, `LIVE_ENDED`, `LIVE_NOT_LIVE`, `LIVE_TARGET_CANNOT_JOIN_STAGE`, `LIVE_STAGE_FULL{max}`, `LIVE_HOST_STAYS_ON_STAGE`, `LIVE_PROMOTE_CONNECTIONS_ONLY`, `LIVE_TARGET_EXCLUDED`, `LIVE_HOST_MUTES_SELF`, `LIVE_TARGET_NOT_ON_STAGE`) et refus de droit `liveRoleRequired` (garde de la fondation) au lieu des phrases ; commentaires rapportés au moteur ; DL-02 : toute montée exige, dans un direct enregistré, l'accord horodaté de la personne (`recordingConsent.assertRecordingConsent` dans `promoteSpeakerRow`, refus `LIVE_RECORDING_CONSENT_REQUIRED`).
/**
 * PROMOTION et RÉTROGRADATION des intervenants.
 * API publique : `api.modules.live.speakers.*`
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA BASE DURABLE D'ABORD, LE SFU ENSUITE, LE TTL EN FILET
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. La mutation écrit `liveSpeakers` (la vérité) et incrémente
 *    `grantEpoch` — c'est ce que TOUT jeton futur relira.
 * 2. Elle PLANIFIE `livekitActions.applyDirectSfuState`, qui expulse
 *    uniquement les connexions de l'ANCIEN rôle — exécutée APRÈS la
 *    transaction : un refus n'ouvre jamais un micro et un JWT viewer ne
 *    devient jamais speaker à chaud.
 * 3. Si le SFU est injoignable, le jeton courant EXPIRE (1 h,
 *    `DIRECT_TOKEN_TTL_SECONDS`) et le suivant portera le bon grant : le TTL
 *    est le filet, jamais le mécanisme.
 *
 * `sfuAppliedAt` n'est posé QUE si l'update a réussi POUR l'époque courante
 * (`markSfuApplied` compare) : un écho SFU en retard sur une promotion déjà
 * rétrogradée ne maquille pas l'état.
 *
 * Le SUJET visé dans la salle est l'`authUserId` de la personne — le sujet de
 * l'identité que l'action du jeton met en préfixe de chaque connexion
 * (`grants.buildDirectIdentity`).
 */
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, internalQuery, type MutationCtx } from "../../_generated/server"
import { memberHasStatus } from "../../lib/access"
import { failRule } from "../../lib/errors"
import { networkMutation } from "../../lib/functions"
import { isBlockedBetween, isConnectedTo } from "../graph/graph"
import { assertVisibleDirectSession, banRow, directCaller, directSessionAccessDecision, liveSpeakerRow, requireDirectPermission } from "./access"
import { DIRECT_MAX_SPEAKERS } from "./grants"
import { assertRecordingConsent } from "./recordingConsent"

type SpeakerWriteCtx = Pick<MutationCtx, "db" | "scheduler">
type SpeakerSession = Pick<Doc<"liveSessions">, "_id" | "networkId" | "hostPersonId" | "status" | "roomName" | "spotlightPersonId" | "replayRequested">

/**
 * Primitive transactionnelle, la garde d'appelant reste dans l'API publique.
 *
 * ⚠️ DL-02 — C'EST LE POINT UNIQUE de toute montée à l'antenne (main acceptée,
 * invitation acceptée, promotion directe, invité intervenant) : dans un direct
 * enregistré, la personne doit avoir donné son accord horodaté
 * (`recordingConsent`), sinon `LIVE_RECORDING_CONSENT_REQUIRED`, AVANT toute
 * écriture et toute action SFU.
 */
export async function promoteSpeakerRow(ctx: SpeakerWriteCtx, session: SpeakerSession, personId: Id<"persons">): Promise<boolean> {
  if (personId === session.hostPersonId) {
    return failRule("LIVE_ALREADY_ON_STAGE")
  }
  if (session.status === "ended") {
    return failRule("LIVE_ENDED")
  }
  const target = await ctx.db.get(personId)
  if (!target || target.deletionRequestedAt !== undefined) {
    return failRule("LIVE_TARGET_CANNOT_JOIN_STAGE")
  }
  const already = await liveSpeakerRow(ctx, session._id, personId)
  if (already) return false
  await assertRecordingConsent(ctx, session, personId)
  const live = await ctx.db
    .query("liveSpeakers")
    .withIndex("by_session_removedAt", (q) => q.eq("sessionId", session._id).eq("removedAt", undefined))
    .take(DIRECT_MAX_SPEAKERS + 1)
  if (live.length >= DIRECT_MAX_SPEAKERS) {
    return failRule("LIVE_STAGE_FULL", { max: DIRECT_MAX_SPEAKERS })
  }
  const now = Date.now()
  const existing = await ctx.db
    .query("liveSpeakers")
    .withIndex("by_session_person", (q) => q.eq("sessionId", session._id).eq("personId", personId))
    .unique()
  const epoch = existing ? existing.grantEpoch + 1 : 1
  const speakerId = existing
    ? existing._id
    : await ctx.db.insert("liveSpeakers", {
        networkId: session.networkId,
        sessionId: session._id,
        personId,
        role: "speaker",
        grantEpoch: epoch,
        addedAt: now,
      })
  if (existing) {
    await ctx.db.patch(speakerId, {
      role: "speaker",
      grantEpoch: epoch,
      sfuAppliedAt: undefined,
      removedAt: undefined,
      addedAt: now,
    })
  }
  if (session.status === "live") {
    await ctx.scheduler.runAfter(0, internal.modules.live.livekitActions.applyDirectSfuState, {
      roomName: session.roomName,
      subject: target.authUserId,
      mode: "rejoin" as const,
      disconnectRole: "viewer" as const,
      speakerId,
      epoch,
    })
  }
  return true
}

export async function demoteSpeakerRow(ctx: SpeakerWriteCtx, session: SpeakerSession, personId: Id<"persons">): Promise<boolean> {
  if (personId === session.hostPersonId) {
    return failRule("LIVE_HOST_STAYS_ON_STAGE")
  }
  const row = await liveSpeakerRow(ctx, session._id, personId)
  if (!row) return false
  if (row.role === "host") {
    return failRule("LIVE_HOST_STAYS_ON_STAGE")
  }
  const epoch = row.grantEpoch + 1
  await ctx.db.patch(row._id, {
    grantEpoch: epoch,
    sfuAppliedAt: undefined,
    removedAt: Date.now(),
  })
  // ⚠️ Une mise en avant ne survit PAS à sa personne, et l'effacement tient
  // dans CETTE transaction : la laisser derrière ferait pointer le programme
  // de l'hôte sur quelqu'un qui n'est plus à l'antenne — le DTO la tairait,
  // mais la base garderait un choix que personne n'a fait.
  if (session.spotlightPersonId === personId) {
    await ctx.db.patch(session._id, {
      spotlightPersonId: undefined,
      updatedAt: Date.now(),
    })
  }
  if (session.status === "live") {
    const target = await ctx.db.get(personId)
    if (target) {
      await ctx.scheduler.runAfter(0, internal.modules.live.livekitActions.applyDirectSfuState, {
        roomName: session.roomName,
        subject: target.authUserId,
        mode: "rejoin" as const,
        disconnectRole: "speaker" as const,
        speakerId: row._id,
        epoch,
      })
    }
  }
  return true
}

/**
 * Promouvoir une personne INTERVENANTE. Permission `admitToStage` (D-11).
 *
 * Fail-closed, dans l'ordre : session vivante → cible en relation (la
 * promotion ouvre un micro : elle exige un lien NÉGOCIÉ, même sur un direct
 * public) → ni bloquée ni exclue → dans l'audience → membre DÉCLARÉE du
 * réseau → accord à l'enregistrement si le direct est enregistré (DL-02, dans
 * `promoteSpeakerRow`) → plafond 8 (hôte compris) → écriture durable → SFU
 * planifié.
 *
 * ⚠️ Le LIEN exigé est celui de l'HÔTE, pas de l'appelant (ADR-0061 inchangé) :
 * un cohôte fait monter les relations du titulaire, jamais les siennes. Pour
 * l'hôte, `session.hostPersonId === ctx.person._id` — la règle est mot pour
 * mot celle d'avant.
 */
export const promote = networkMutation({
  writeBucket: "live.stage",
  args: {
    sessionId: v.id("liveSessions"),
    targetPersonId: v.id("persons"),
  },
  handler: async (ctx, args): Promise<{ promoted: boolean }> => {
    const session = await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId)
    await requireDirectPermission(ctx, session, ctx.person._id, "admitToStage")
    if (session.status === "ended") {
      return failRule("LIVE_ENDED")
    }
    if (args.targetPersonId === session.hostPersonId) {
      return failRule("LIVE_ALREADY_ON_STAGE")
    }

    const connected = await isConnectedTo(ctx, session.networkId, session.hostPersonId, args.targetPersonId)
    if (!connected) {
      return failRule("LIVE_PROMOTE_CONNECTIONS_ONLY")
    }
    if (await isBlockedBetween(ctx, session.hostPersonId, args.targetPersonId)) {
      return failRule("LIVE_PROMOTE_CONNECTIONS_ONLY")
    }
    if ((await banRow(ctx, session._id, args.targetPersonId)) !== null) {
      return failRule("LIVE_TARGET_EXCLUDED")
    }
    if ((await directSessionAccessDecision(ctx, args.targetPersonId, session)) !== "allowed") {
      return failRule("LIVE_TARGET_CANNOT_JOIN_STAGE")
    }
    // On ne confie pas un rôle qu'on ne peut pas exercer : le jeton
    // d'intervenant exige une adhésion DÉCLARÉE au réseau de la session (même
    // aide que les appels). Un membre en attente voit la conférence, il n'y
    // monte pas — même refus que toute cible qui ne peut pas rejoindre
    // l'antenne, AVANT toute écriture et toute action SFU.
    if (!(await memberHasStatus(ctx, session.networkId, args.targetPersonId, "declaree"))) {
      return failRule("LIVE_TARGET_CANNOT_JOIN_STAGE")
    }

    // Même l'API historique ne transforme plus un viewer à chaud : le rôle
    // durable est ouvert, puis l'ancien participant doit reprendre un JWT.
    return { promoted: await promoteSpeakerRow(ctx, session, args.targetPersonId) }
  },
})

/**
 * Rétrograder un intervenant. Permission `removeFromStage` (D-11) ; l'hôte ne
 * se rétrograde pas lui-même (terminer le direct est le geste qui coupe son
 * antenne), et personne ne le rétrograde à sa place.
 *
 * ⚠️ Rétrograder n'est PAS exclure : la personne garde son jeton spectateur et
 * reste dans la salle. C'est `moderation.ban` qui ferme la porte.
 */
export const demote = networkMutation({
  writeBucket: "live.stage",
  args: {
    sessionId: v.id("liveSessions"),
    targetPersonId: v.id("persons"),
  },
  handler: async (ctx, args): Promise<{ demoted: boolean }> => {
    const session = await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId)
    await requireDirectPermission(ctx, session, ctx.person._id, "removeFromStage")
    if (args.targetPersonId === session.hostPersonId) {
      return failRule("LIVE_HOST_STAYS_ON_STAGE")
    }

    // Un ancien JWT speaker reste signé jusqu'à son TTL. L'expulsion ciblée
    // force une vraie réentrée viewer au lieu de compter sur ce seul filet.
    return {
      demoted: await demoteSpeakerRow(ctx, session, args.targetPersonId),
    }
  },
})

/**
 * COUPER le micro d'un intervenant, à distance. Permission `removeFromStage` —
 * qui peut le faire DESCENDRE de l'antenne peut, à plus forte raison, y fermer
 * son micro. C'est le geste intermédiaire qui manquait entre « ne rien faire »
 * et « rétrograder », exactement comme la sourdine de conversation l'est entre
 * « ne rien faire » et « exclure ».
 *
 * ⚠️ AUCUN modérateur n'OUVRE un micro à distance, et ce n'est pas une limite
 * technique : le SDK sait le faire. On ne fait que FERMER — rouvrir est le
 * geste de la personne, sur son propre appareil. Le client de l'intervenant
 * adopte l'état RÉEL de sa piste (LiveKit le lui notifie) ; rien n'est écrit
 * en base, parce que couper un micro est un acte de TRANSPORT et non un état
 * durable — la rétrogradation, elle, en est un.
 *
 * ⚠️ `{ requested: false }` n'est PAS un refus : c'est une cible disparue de la
 * base, donc sans aucune identité LiveKit à viser. Le geste n'a rien à faire,
 * il ne lève pas.
 *
 * ⚠️ L'HÔTE est hors d'atteinte : personne ne coupe le micro de qui tient la
 * conférence — il le fait lui-même, depuis son appareil.
 */
export const muteMicrophone = networkMutation({
  writeBucket: "live.stage",
  args: {
    sessionId: v.id("liveSessions"),
    targetPersonId: v.id("persons"),
  },
  handler: async (ctx, args): Promise<{ requested: boolean }> => {
    const session = await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId)
    await requireDirectPermission(ctx, session, ctx.person._id, "removeFromStage")
    if (session.status !== "live") {
      return failRule("LIVE_NOT_LIVE")
    }
    if (args.targetPersonId === session.hostPersonId) {
      return failRule("LIVE_HOST_MUTES_SELF")
    }
    if ((await liveSpeakerRow(ctx, session._id, args.targetPersonId)) === null) {
      return failRule("LIVE_TARGET_NOT_ON_STAGE")
    }

    const target = await ctx.db.get(args.targetPersonId)
    if (!target) return { requested: false }

    // Planifiée, jamais appelée en transaction : le SFU est un effet de bord,
    // et son injoignabilité ne doit pas annuler le geste de l'appelant.
    await ctx.scheduler.runAfter(0, internal.modules.live.livekitActions.muteDirectMicrophone, { roomName: session.roomName, subject: target.authUserId })
    return { requested: true }
  },
})

/**
 * Une action SFU est hors transaction et peut démarrer après une transition
 * plus récente. Cette garde relit l'ÉPOQUE et la direction attendue avant que
 * l'action retire les identités qu'elle a capturées.
 */
export const isSfuRejoinCurrent = internalQuery({
  args: {
    speakerId: v.id("liveSpeakers"),
    epoch: v.number(),
    roomName: v.string(),
    subject: v.string(),
    disconnectRole: v.union(v.literal("viewer"), v.literal("speaker")),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const row = await ctx.db.get(args.speakerId)
    if (!row || row.grantEpoch !== args.epoch) return false

    const expectsActiveSpeaker = args.disconnectRole === "viewer"
    if ((row.removedAt === undefined) !== expectsActiveSpeaker) return false

    const [session, person] = await Promise.all([ctx.db.get(row.sessionId), ctx.db.get(row.personId)])
    return session?.status === "live" && session.roomName === args.roomName && person?.authUserId === args.subject
  },
})

/**
 * L'écho du SFU — posé par `applyDirectSfuState` quand l'expulsion ciblée a
 * réussi. Comparé à l'ÉPOQUE : un écho en retard sur un état déjà changé est
 * ignoré, jamais appliqué.
 */
export const markSfuApplied = internalMutation({
  args: {
    speakerId: v.id("liveSpeakers"),
    epoch: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.speakerId)
    if (!row || row.grantEpoch !== args.epoch) return
    await ctx.db.patch(row._id, { sfuAppliedAt: Date.now() })
  },
})
