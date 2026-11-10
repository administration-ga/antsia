/**
 * L'ACCORD À L'ENREGISTREMENT d'un direct (DL-02) — lire, exiger, écrire, purger.
 *
 * Décision du propriétaire du 9/11/2026 : l'enregistrement d'un direct est
 * décoché par défaut, au formulaire comme au serveur, et exige l'accord
 * explicite et horodaté de CHAQUE personne qui prend l'antenne.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * OÙ L'ACCORD EST EXIGÉ — deux verrous, aucun chemin à côté
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  · `speakers.promoteSpeakerRow` — LE point unique par lequel une personne
 *    obtient une place à l'antenne : main acceptée, invitation acceptée,
 *    promotion directe par l'hôte ou un délégué, invité intervenant au passage
 *    en live ou ajouté pendant le live. Sans accord, aucune ligne
 *    `liveSpeakers` n'est écrite.
 *  · `access.authorizeToken` — le jeton d'intervenant (micro, caméra, écran)
 *    d'une personne autre que l'hôte. C'est le second verrou : une ligne
 *    d'intervenant antérieure à ce lot, ou posée par un chemin futur, ne
 *    publie rien sans accord.
 *
 * L'hôte consent en cochant « Enregistrer » à la création (`sessions.create`
 * écrit sa ligne). Une session NON enregistrée n'exige rien, et n'en stocke
 * rien : `antenna.acceptRecording` y refuse (`LIVE_NO_RECORDING`).
 *
 * ⚠️ `replayRequested` est IMMUABLE après la création (aucune mutation ne le
 * change) : il n'existe donc aucun moyen d'activer l'enregistrement en cours de
 * direct, et une personne déjà à l'antenne a toujours consenti à SA montée. Si
 * un tel geste apparaît un jour, il devra refuser l'activation tant qu'une
 * personne à l'antenne n'a pas consenti — le verrou du jeton tient déjà.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DURÉE — autant que la rediffusion
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Les lignes d'une session sont purgées par `purgeSessionRecordingConsents`,
 * planifiée là où la rediffusion cesse d'exister ou ne pourra jamais exister :
 * retrait par l'hôte (`sessions.withdrawReplayRow`), échéance de conservation
 * (`replay.expireReplay`, `replay.purgeExpiredReplays`), direct annulé avant
 * d'avoir commencé (`sessions.end`) ou jamais démarré (`reap`). La purge relit
 * la session avant d'effacer : elle n'efface rien tant qu'une copie peut
 * encore exister ; une copie retirée PENDANT le direct fait repasser la purge
 * après la fin (les accords tiennent encore les verrous de la salle).
 */
import { DIRECT_LIVE_MAX_DURATION_MS } from "@antsia/social-domain/live/domain"
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { failRule } from "../../lib/errors"

type ReadCtx = Pick<QueryCtx, "db">

/** Ce que l'accord a besoin de savoir d'une session — rien de plus. */
export type RecordingConsentSession = Pick<Doc<"liveSessions">, "_id" | "networkId" | "replayRequested">

/**
 * Lignes effacées au plus par transaction de purge. Une ligne pèse moins de
 * 200 octets : cent lignes restent très loin des limites d'une mutation, et la
 * suite est replanifiée tant qu'il en reste.
 */
export const RECORDING_CONSENT_PURGE_BATCH = 100

/** Délai de nouvelle tentative quand la copie a été retirée pendant le direct. */
export const RECORDING_CONSENT_PURGE_RETRY_MS = 15 * 60_000

/** L'accord d'une personne pour une session, ou `null`. */
export async function recordingConsentRow(
  ctx: ReadCtx,
  sessionId: Id<"liveSessions">,
  personId: Id<"persons">,
): Promise<Doc<"liveRecordingConsents"> | null> {
  return await ctx.db
    .query("liveRecordingConsents")
    .withIndex("by_session_person", (q) => q.eq("sessionId", sessionId).eq("personId", personId))
    .unique()
}

/**
 * Cette personne peut-elle être enregistrée à l'antenne de cette session ?
 * Toujours oui quand la session n'est pas enregistrée : aucun accord n'est
 * alors exigé, ni demandé.
 */
export async function hasRecordingConsent(ctx: ReadCtx, session: RecordingConsentSession, personId: Id<"persons">): Promise<boolean> {
  if (!session.replayRequested) return true
  return (await recordingConsentRow(ctx, session._id, personId)) !== null
}

/** Le refus d'une montée sans accord — la règle `LIVE_RECORDING_CONSENT_REQUIRED`. */
export async function assertRecordingConsent(ctx: ReadCtx, session: RecordingConsentSession, personId: Id<"persons">): Promise<void> {
  if (!(await hasRecordingConsent(ctx, session, personId))) failRule("LIVE_RECORDING_CONSENT_REQUIRED")
}

/**
 * ÉCRIRE l'accord — idempotent : une ligne existante est rendue telle quelle,
 * avec SON horodatage (l'accord date du premier geste, pas du dernier).
 *
 * Ne juge rien : l'appelant a déjà tenu adhésion, visibilité, débit et droit.
 */
export async function writeRecordingConsent(
  ctx: Pick<MutationCtx, "db">,
  session: RecordingConsentSession,
  personId: Id<"persons">,
  acceptedAt: number,
): Promise<{ acceptedAt: number; created: boolean }> {
  const existing = await recordingConsentRow(ctx, session._id, personId)
  if (existing !== null) return { acceptedAt: existing.acceptedAt, created: false }
  await ctx.db.insert("liveRecordingConsents", {
    networkId: session.networkId,
    sessionId: session._id,
    personId,
    acceptedAt,
  })
  return { acceptedAt, created: true }
}

/**
 * La rediffusion de cette session a-t-elle cessé d'exister — ou ne pourra-t-elle
 * jamais exister ? Session disparue, ou terminée sans enregistrement en cours :
 * jamais démarrée (`replayStatus` absent) ou copie retirée/expirée.
 *
 * ⚠️ Une rediffusion `failed` reste RÉCUPÉRABLE (`sessions.retryReplay`) : ses
 * accords restent tant qu'elle peut aboutir, et partent avec son retrait.
 */
export function recordingConsentsPurgeable(session: Pick<Doc<"liveSessions">, "status" | "replayStatus"> | null): boolean {
  if (session === null) return true
  return session.status === "ended" && (session.replayStatus === undefined || session.replayStatus === "expired")
}

/** Planifie la purge des accords d'une session — APRÈS la transaction qui retire la copie. */
export async function scheduleRecordingConsentPurge(ctx: Pick<MutationCtx, "scheduler">, sessionId: Id<"liveSessions">): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.modules.live.recordingConsent.purgeSessionRecordingConsents, { sessionId })
}

/**
 * PURGER les accords d'une session, par lots bornés et chaînés.
 *
 * Relit la session d'abord : tant qu'une copie peut exister, rien n'est
 * effacé (un job planifié ne devance jamais l'état qu'il croit voir).
 */
export const purgeSessionRecordingConsents = internalMutation({
  args: { sessionId: v.id("liveSessions") },
  returns: v.object({ deleted: v.number(), done: v.boolean() }),
  // Type de retour EXPLICITE : la fonction se replanifie elle-même (même
  // raison que `reap.reapStaleDirects`).
  handler: async (ctx, args): Promise<{ deleted: number; done: boolean }> => {
    const session = await ctx.db.get(args.sessionId)
    if (session !== null && session.status !== "ended" && session.replayStatus === "expired") {
      // Copie retirée PENDANT le direct (`withdrawReplay` le permet) : les
      // accords tiennent encore les verrous de la salle, qui reste enregistrée
      // au sens de `replayRequested`. On repasse après la fin — au plus tard
      // l'échéance absolue du direct, que la récolte fait respecter.
      const endsBy = (session.startedAt ?? session.createdAt) + DIRECT_LIVE_MAX_DURATION_MS
      await ctx.scheduler.runAt(Math.max(Date.now(), endsBy) + RECORDING_CONSENT_PURGE_RETRY_MS, internal.modules.live.recordingConsent.purgeSessionRecordingConsents, { sessionId: args.sessionId })
      return { deleted: 0, done: false }
    }
    if (!recordingConsentsPurgeable(session)) return { deleted: 0, done: true }
    const rows = await ctx.db
      .query("liveRecordingConsents")
      .withIndex("by_session_person", (q) => q.eq("sessionId", args.sessionId))
      .take(RECORDING_CONSENT_PURGE_BATCH)
    for (const row of rows) await ctx.db.delete(row._id)
    const done = rows.length < RECORDING_CONSENT_PURGE_BATCH
    if (!done) await scheduleRecordingConsentPurge(ctx, args.sessionId)
    return { deleted: rows.length, done }
  },
})
