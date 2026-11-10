// Dupliqué de socle/convex/modules/direct/reap.ts @ ad2e7fdc2 — adaptations : D28 — les compteurs agrégés s'écrivent dans `liveSessionCounters` (UNE ligne par session, `networkId` de la session, insérée à la première valeur non nulle, réécrite SEULEMENT si une valeur change ; ligne absente = zéros), jamais plus sur la session, que toute la salle regarde ; quatre sources : commentaires publiés (fenêtre annoncée, `reconcileCommentCount` tel quel), réactions par personne, présents (`countPresentViewers`, rapatriée dans `access.ts` par la fondation, même lecture que l'admission) et admissions distinctes (`countViewerGrants`, l'agrégat qu'alimente la première admission — au socle, l'admission incrémentait la session ; la recomposition le recopie désormais) ; `recomputeAggregates` reçoit donc aussi `runQuery` (lecture de l'agrégat) ; tables `liveSessions`, `liveComments`, `liveReactions`, `liveHostPresence` ; le bail lu par `hostPresence.loadHostLease` / `leaseFacts` (la raison du socle pour le relire à la main — des tests du client qui importaient `reap` — n'existe pas dans le moteur, dont l'écran n'importe jamais `convex/`) ; arrêt de l'Egress planifié vers `live/livekitActions.stopDirectEgress`, solde des invitations vers `live/invitationSettle.expireSessionInvitations` ; passages SYSTÈME tous réseaux (index global `by_status`) ; directs VIVANTS balayés par TRANCHES CHAÎNÉES (pagination de l'index, `REAP_LIVE_BATCH` = cinq sessions par transaction, borne calculée sur le pire cas des limites de lecture d'une mutation, suite planifiée par `runAfter(0, reapStaleDirects, { cursor })`) au lieu des cinquante plus anciens d'un coup (`take(50)` : au-delà du cinquantième, un direct n'était ni recompté ni récolté, et cinquante sessions saturées faisaient tomber la transaction) — args `{ cursor?: string | null }`, le cron appelle sans argument, retour `null` explicite ; les sessions programmées sont examinées cinquante à la fois en tête puis par une chaîne indépendante `sweepScheduledDirects`, à instant figé, sans relancer le balayage live, et chaque direct vivant par `reapLiveSession` (même logique) ; commentaires rapportés au moteur ; DL-02 : un direct programmé jamais démarré planifie la purge de ses accords à l'enregistrement.
/**
 * La RÉCOLTE des directs — miroir du nettoyage des appels.
 *
 * Le statut décide, l'horloge récolte : un hôte qui ferme son onglet sans
 * « Terminer » laisse une session `live` orpheline — chronomètre qui tourne,
 * carte « en direct » mensongère sur le fil. Ce cron la ferme, comme le
 * nettoyage des appels ferme les appels fantômes.
 *
 * ⚠️ CE FICHIER A DIT LE CONTRAIRE AU SOCLE JUSQU'AU 2026-09-06 : « pas de
 * heartbeat — un battement écrit sur la session ferait re-tourner toutes les
 * souscriptions des spectateurs à chaque pulsation ». La contrainte est
 * exacte, la conclusion ne l'était pas : il ne fallait pas renoncer à la
 * présence, il fallait ne pas l'écrire LÀ. Depuis D-14, le bail de l'hôte vit
 * dans `liveHostPresence` (table dédiée, index `by_session`) et la récolte le
 * lit — `liveSessions` n'est toujours écrite qu'aux transitions. Un direct
 * abandonné se ferme donc en ~2 min (bail + grâce) au lieu de 4 h, et un
 * direct VIVANT de 4 h 01… tombe toujours, parce que la limite absolue est
 * ANNONCÉE à l'écran (`maxDurationAt`).
 *
 * C'est AUSSI la maison de l'ÉCRIVAIN UNIQUE des compteurs agrégés
 * (`recomputeAggregates`, D28) : le chemin chaud (admission, battements,
 * commentaires, réactions) n'écrit JAMAIS les compteurs — ils sont recomposés
 * ici (sessions live, chaque minute) et aux transitions (fin de la conférence,
 * révocation), dans `liveSessionCounters`, hors du document de session. La
 * fenêtre de recomptage des commentaires est une borne ANNONCÉE (exportée,
 * libellée « 1000+ » à l'écran) et `reconcileCommentCount` ne rabote jamais un
 * compteur au-delà d'elle.
 */
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
// `internalMutation` BRUTE : aucune table `live*` n'est aux déclencheurs.
import { internalMutation, type MutationCtx } from "../../_generated/server"
import { countPresentViewers, countViewerGrants, type DirectSessionCounts } from "./access"
import { AGGREGATE_COMMENTS_SCAN, DIRECT_LIVE_MAX_DURATION_MS, DIRECT_SCHEDULED_MAX_AGE_MS, directHostGraceElapsed, type DirectEndReason } from "./domain"
import { leaseFacts, loadHostLease } from "./hostPresence"
import { scheduleRecordingConsentPurge } from "./recordingConsent"

/**
 * Sessions PROGRAMMÉES examinées par transaction. La tête du passage traite
 * un lot ; s'il est plein, une chaîne distincte parcourt le reste de l'index,
 * sans relancer la récolte des directs vivants à chaque page.
 */
const REAP_SCAN = 50

/**
 * Directs VIVANTS examinés par TRANSACTION — la borne qui fait tenir le PIRE
 * cas sous les limites de lecture d'une mutation Convex (16 Mio lus,
 * 32 000 documents lus, 4 096 plages d'index).
 *
 * Une session coûte au plus : la page et le bail, puis la recomposition — la
 * session relue, sa ligne de compteurs, 1 000 commentaires, 1 000 réactions,
 * 1 001 admissions, le nœud de l'agrégat —, soit ≈ 3 010 documents et ≈ 8
 * plages. En octets (taille Convex : 2 + octets UTF-8 par chaîne, 9 par
 * nombre, plus les noms de champ ; identifiants de 32 caractères), au pire :
 *  · un commentaire : 279 o + un corps de 500 caractères à 3 octets
 *    (1 500 o) = 1 779 o, soit 1 779 000 o pour mille ;
 *  · une réaction : 245 o, soit 245 000 o ; une admission : 277 o, soit
 *    277 277 o pour 1 001 ;
 *  · la session (deux lectures), ses compteurs, son bail, l'agrégat : ≈ 7 000 o ;
 *  → ≈ 2 308 000 o (2,2 Mio) par session.
 * Octets : 16 777 216 / 2 308 000 ≈ 7,3 ; documents : 32 000 / 3 010 ≈ 10,6 ;
 * plages : 4 096 / 8 = 512. L'OCTET mord : SEPT sessions au plus. On en prend
 * CINQ — ≈ 11,5 Mo et ≈ 15 000 documents au pire, près d'un tiers de marge
 * pour la page elle-même, les fins de conférence et, en tête de passage, les
 * cinquante sessions programmées. `reap.test` MESURE ce pire cas avec la
 * comptabilité du harnais, celle de Convex (le 2026-10-15 : 2 302 081 o,
 * 3 003 documents, 8 plages par session ; sept tiennent, huit non, cinq avec
 * un quart de marge au moins).
 *
 * Le socle prenait les cinquante plus anciens d'un coup (`take(50)`) : au-delà
 * du cinquantième, un direct n'était jamais ni recompté ni récolté tant que
 * les plus anciens vivaient — et cinquante sessions saturées auraient fait
 * tomber la transaction entière, donc toute la récolte.
 */
export const REAP_LIVE_BATCH = 5
/**
 * Fenêtres de recomposition des compteurs. BORNÉES : une transaction qui
 * balaierait tout tomberait sur un direct très commenté — jamais de
 * `.collect()` ici. La fenêtre des commentaires est EXPORTÉE : c'est une
 * borne ANNONCÉE (l'écran libelle « 1000+ » à partir d'elle), pas un plafond
 * silencieux.
 */
export { AGGREGATE_COMMENTS_SCAN } from "./domain"
const AGGREGATE_REACTIONS_SCAN = 1000

/**
 * RÉCONCILIER le compteur de commentaires — règle PURE, testée à part.
 *
 *  · Fenêtre non saturée (`scanned < AGGREGATE_COMMENTS_SCAN`) : le
 *    recomptage a TOUT vu, il est la vérité — même s'il baisse (une dérive
 *    du compteur se corrige ici).
 *  · Fenêtre saturée : le recomptage n'est qu'une BORNE BASSE. Il relève un
 *    compteur passé dessous, mais ne rabote JAMAIS un compteur plus haut — le
 *    raboter mentirait vers le bas à chaque minute, et l'écran ne pourrait plus
 *    jamais dépasser la fenêtre.
 */
export function reconcileCommentCount(input: { current: number; publishedInWindow: number; scanned: number }): number {
  if (input.scanned < AGGREGATE_COMMENTS_SCAN) return input.publishedInWindow
  return Math.max(input.current, input.publishedInWindow)
}

/** Deux jeux de compteurs identiques ? (Une réécriture à l'identique réveillerait la salle pour rien.) */
function sameCounts(a: DirectSessionCounts, b: DirectSessionCounts): boolean {
  return (
    a.viewerGrantCount === b.viewerGrantCount &&
    a.viewerPresentCount === b.viewerPresentCount &&
    a.commentCount === b.commentCount &&
    a.reactionCount === b.reactionCount
  )
}

/**
 * La RÉCONCILIATION des compteurs agrégés d'une session (D28).
 *
 * Recomposés depuis leurs sources (commentaires publiés, somme des compteurs
 * de réaction par personne, spectateurs en ligne, agrégat des admissions), et
 * écrits dans `liveSessionCounters` SEULEMENT si une valeur change — un cron
 * qui réécrirait à l'identique réveillerait tous les abonnés pour rien. Une
 * session dont tout vaut zéro n'a pas de ligne du tout (ligne absente = zéros).
 *
 * ⚠️ JAMAIS la session : ses compteurs l'ont quittée (D28), et la recomposer ne
 * la touche pas — ni statut, ni horodatage.
 *
 * ⚠️ D-09 — CETTE FONCTION FAIT FOI sur `viewerPresentCount`, recomposé depuis
 * les baux par la MÊME lecture que l'admission (`countPresentViewers`), qui,
 * elle, ne compte que dans SA transaction pour juger la capacité. Une session
 * TERMINÉE vaut zéro présent, sans lecture : plus personne n'y est, et la fin
 * de la conférence passe par ici.
 */
export async function recomputeAggregates(ctx: Pick<MutationCtx, "db" | "runQuery">, sessionId: Id<"liveSessions">): Promise<void> {
  const session = await ctx.db.get(sessionId)
  if (!session) return

  const row = await ctx.db
    .query("liveSessionCounters")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .unique()
  const current: DirectSessionCounts = {
    viewerGrantCount: row?.viewerGrantCount ?? 0,
    viewerPresentCount: row?.viewerPresentCount ?? 0,
    commentCount: row?.commentCount ?? 0,
    reactionCount: row?.reactionCount ?? 0,
  }

  const comments = await ctx.db
    .query("liveComments")
    .withIndex("by_session_createdAt", (q) => q.eq("sessionId", sessionId))
    .take(AGGREGATE_COMMENTS_SCAN)
  const commentCount = reconcileCommentCount({
    current: current.commentCount,
    publishedInWindow: comments.filter((comment) => comment.status === "published").length,
    scanned: comments.length,
  })

  const reactions = await ctx.db
    .query("liveReactions")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .take(AGGREGATE_REACTIONS_SCAN)
  const reactionCount = reactions.reduce((sum, reaction) => sum + reaction.count, 0)

  const now = Date.now()
  const viewerPresentCount = session.status === "ended" ? 0 : await countPresentViewers(ctx, sessionId, now)
  // Les personnes DISTINCTES admises depuis le début — l'agrégat, sans balayage : il ne redescend jamais.
  const viewerGrantCount = await countViewerGrants(ctx, sessionId)

  const next: DirectSessionCounts = { viewerGrantCount, viewerPresentCount, commentCount, reactionCount }
  if (sameCounts(current, next)) return
  if (row === null) {
    await ctx.db.insert("liveSessionCounters", { networkId: session.networkId, sessionId, ...next, updatedAt: now })
    return
  }
  await ctx.db.patch(row._id, { ...next, updatedAt: now })
}

/**
 * Cron (60 s) :
 *  · `scheduled` > 24 h        → `ended` / `never_started` ;
 *  · `live` > 4 h              → `ended` / `max_duration`, Egress arrêté ;
 *  · `live`, bail éteint et
 *    grâce écoulée             → `ended` / `host_absent`, Egress arrêté ;
 *  · `live`, bail éteint dans
 *    la grâce                  → bail marqué `absent` (une fois), session
 *                                INTACTE — interrompu n'est pas terminé ;
 *  · `live` sain ou SANS bail  → compteurs rafraîchis (l'écrivain unique).
 *
 * Passage SYSTÈME : toutes les sessions, tous réseaux (index global `by_status`).
 *
 * ⚠️ PAR TRANCHES CHAÎNÉES : le cron appelle SANS argument et commence un
 * passage (un lot de programmées, puis la première page de directs vivants) ; chaque
 * transaction n'examine qu'UNE page de `REAP_LIVE_BATCH` directs vivants
 * (pagination de l'index, les plus anciens d'abord) et planifie aussitôt la
 * suite avec son curseur, jusqu'au bout de l'index. Un direct clos dans une
 * page quitte l'index sans décaler le curseur ; un direct ouvert pendant le
 * passage est pris en fin de chaîne, ou au passage suivant. Si un passage
 * déborde sur le suivant, deux chaînes se croisent sans dommage : une session
 * close par l'une sort de l'index de l'autre (transactions sérialisables), et
 * les compteurs ne s'écrivent que s'ils changent. Les programmées suivent une
 * chaîne indépendante si leur premier lot est plein, à l'instant du passage.
 */
export const reapStaleDirects = internalMutation({
  args: {
    /**
     * La SUITE d'un passage : le curseur de la page de directs vivants
     * suivante. Absent ou `null` : un passage COMMENCE (l'appel du cron).
     */
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  // Type de retour EXPLICITE : la fonction se replanifie elle-même, et son type
  // ne doit pas dépendre de `internal` (circularité d'inférence).
  handler: async (ctx, args): Promise<null> => {
    const now = Date.now()
    const cursor = args.cursor ?? null

    // Les programmées oubliées : une fois par passage, en TÊTE de chaîne.
    if (cursor === null) {
      const scheduled = await ctx.db
        .query("liveSessions")
        .withIndex("by_status", (q) => q.eq("status", "scheduled"))
        .take(REAP_SCAN)
      await endExpiredScheduledSessions(ctx, scheduled, now)
      // Les sessions closes quittent l'index. Celles qui restent jeunes ne
      // doivent pas retenir la tête de la file : la suite pagine depuis là.
      if (scheduled.length === REAP_SCAN) await ctx.scheduler.runAfter(0, internal.modules.live.reap.sweepScheduledDirects, { cursor: null, now })
    }

    // Les directs vivants : UNE page bornée par transaction, la suite planifiée.
    const page = await ctx.db
      .query("liveSessions")
      .withIndex("by_status", (q) => q.eq("status", "live"))
      .paginate({ cursor, numItems: REAP_LIVE_BATCH })
    for (const session of page.page) await reapLiveSession(ctx, session, now)
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.modules.live.reap.reapStaleDirects, { cursor: page.continueCursor })
    }
    return null
  },
})

/** Les programmées poursuivent leur propre chaîne, sans refaire le balayage live. */
export const sweepScheduledDirects = internalMutation({
  args: { cursor: v.union(v.string(), v.null()), now: v.number() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const page = await ctx.db
      .query("liveSessions")
      .withIndex("by_status", (q) => q.eq("status", "scheduled"))
      .paginate({ cursor: args.cursor, numItems: REAP_SCAN })
    await endExpiredScheduledSessions(ctx, page.page, args.now)
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.modules.live.reap.sweepScheduledDirects, { cursor: page.continueCursor, now: args.now })
    }
    return null
  },
})

async function endExpiredScheduledSessions(ctx: MutationCtx, sessions: Doc<"liveSessions">[], now: number): Promise<void> {
  for (const session of sessions) {
    if (now - session.createdAt <= DIRECT_SCHEDULED_MAX_AGE_MS) continue
    await ctx.db.patch(session._id, { status: "ended", endedAt: now, endReason: "never_started", updatedAt: now })
    // DL-02 — jamais démarré, jamais enregistré : les accords déjà donnés partent
    // en JOB (une écriture planifiée par session, aucune lecture de plus ici).
    if (session.replayRequested) await scheduleRecordingConsentPurge(ctx, session._id)
  }
}

/**
 * Récolter UN direct vivant : la limite absolue, puis le bail de l'hôte, puis
 * — s'il vit — ses compteurs.
 */
async function reapLiveSession(ctx: MutationCtx, session: Doc<"liveSessions">, now: number): Promise<void> {
  const startedAt = session.startedAt ?? session.createdAt
  // Une lecture INDEXÉE de plus par session live (≤ `REAP_LIVE_BATCH` par
  // transaction) — c'est le coût du bail, et il est borné.
  const lease = await loadHostLease(ctx, session._id)

  if (now - startedAt > DIRECT_LIVE_MAX_DURATION_MS) {
    // La limite ABSOLUE passe avant tout : elle est annoncée à l'écran
    // (`maxDurationAt`), elle doit donc tomber quoi qu'il arrive — même si
    // l'hôte bat encore.
    await endLiveSession(ctx, session, now, "max_duration")
    return
  }
  if (directHostGraceElapsed(leaseFacts(lease), now)) {
    // Bail éteint ET grâce écoulée : l'hôte a quitté la conférence sans la
    // fermer. C'est LE défaut D-14 — jusqu'ici, il fallait attendre quatre
    // heures.
    await endLiveSession(ctx, session, now, "host_absent")
    return
  }
  // ⚠️ FAIL-OPEN DOCUMENTÉ : une session live SANS ligne de bail garde la
  // règle des 4 h, et elle seule. Un client ancien (ou un hôte qui n'est
  // jamais entré dans sa propre salle) ne bat pas — le terminer pour cela
  // couperait des conférences vivantes.
  if (lease !== null && lease.leaseUntil < now && lease.state !== "absent") {
    // L'absence est CONSTATÉE ici, une seule fois, sur la table de bail :
    // c'est ce qui pousse « Conférence interrompue » aux spectateurs sans
    // écrire `liveSessions`.
    await ctx.db.patch(lease._id, {
      state: "absent",
      absentSince: lease.absentSince ?? lease.leaseUntil,
      updatedAt: now,
    })
  }
  await recomputeAggregates(ctx, session._id)
}

/**
 * Fermer une session LIVE, avec sa raison. Un seul chemin pour les deux
 * verdicts de la récolte : même patch, mêmes compteurs définitifs, même arrêt
 * d'Egress, même solde des invitations — les faire diverger, c'est finir par
 * en oublier un.
 *
 * ⚠️ Le `scheduled` oublié (`never_started`) ne passe PAS par ici, et c'est
 * voulu : aucune cloche d'invitation n'a sonné avant le live, il n'y a rien à
 * solder.
 */
async function endLiveSession(ctx: MutationCtx, session: Doc<"liveSessions">, now: number, endReason: DirectEndReason): Promise<void> {
  await ctx.db.patch(session._id, {
    status: "ended",
    endedAt: now,
    endReason,
    updatedAt: now,
  })
  await recomputeAggregates(ctx, session._id)
  if (session.egressId !== undefined) {
    await ctx.scheduler.runAfter(0, internal.modules.live.livekitActions.stopDirectEgress, { egressId: session.egressId })
  }
  // Les cloches d'invitation se soldent en JOB : une tranche ferme jusqu'à
  // `REAP_LIVE_BATCH` sessions, les solder ici la ferait tomber.
  await ctx.scheduler.runAfter(0, internal.modules.live.invitationSettle.expireSessionInvitations, { sessionId: session._id, endedAt: now })
}
