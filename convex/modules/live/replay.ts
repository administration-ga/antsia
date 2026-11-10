// Dupliqué de socle/convex/modules/direct/replay.ts @ ad2e7fdc2 — adaptations : table `liveSessions` du moteur (`v.id("liveSessions")` ; index GLOBAUX `by_egressId` et `by_status_replayStatus_endedAt` : le webhook et les crons sont des passages système, tous réseaux) ; références internes du moteur (`modules/live/replay`, `modules/live/livekitActions.reconcileDirectEgress`, `lib/livekitEgress*`) ; MOTIFS → CODES du vocabulaire fermé (`replayComposition.DIRECT_REPLAY_FAILURE_REASONS`, validateur précis des arguments `failureReason`) ; GARDE DES FICHIERS : le fichier rapatrié n'est rattaché qu'INSCRIT à la garde (`acceptStoredEgressFile` : temps 2, puis admission à l'analyse ou inscription d'un fichier produit par la plateforme, au réseau et à l'hôte de la conférence) — la garde de délivrance, fail-closed, ne servirait jamais un fichier qu'elle ne connaît pas —, la piste de sous-titres est inscrite à l'ANALYSE (`enqueueScan`, déposant : la personne qui l'importe, nouvel argument facultatif `uploadedByPersonId` d'`attachCaptions`) et sa langue est un code du vocabulaire fermé (`DIRECT_REPLAY_CAPTIONS_LANGS`) ; toute suppression d'une copie emporte sa ligne d'analyse (`purgeStoredFile`, D10 — `purgeReplayBlobs` reçoit donc un contexte de mutation complet) et toute expiration efface aussi la langue de la piste retirée (échéance exacte et cron) ; `returns` validés ; DL-02 : toute expiration planifie la purge des accords à l'enregistrement de la session (`recordingConsent.scheduleRecordingConsentPurge`).
/**
 * Le REPLAY d'un direct — l'Egress LiveKit RÉUTILISÉ, sans `callRecordings`.
 * Fonctions INTERNES : le webhook HTTP et les actions Node sont les seuls
 * appelants. La lecture du replay, elle, vit dans `sessions.get` (le droit se
 * juge par lecteur, `replayVisibility` ne peut que restreindre).
 *
 * Chaîne complète :
 *  1. `sessions.goLive` planifie `livekitActions.startDirectEgress`
 *     (RoomComposite, filepath `directs/{sessionId}.mp4`) ;
 *  2. l'action rapporte l'`egressId` ici (`attachEgress`) — corrélation ;
 *  3. LiveKit termine, POST `/webhooks/livekit-egress` → routage par
 *     `lib/livekitEgressRouting.routeEgressFilepath` → branche `direct` →
 *     rapatriement en flux (`egressActions.ingestEgressFile`) → `completeEgress`.
 *
 * ⚠️ Depuis le lot 10B (D-12), cette chaîne n'est plus la SEULE source d'état.
 * Elle en avait une, `egress_ended`, et cela suffisait à la rendre fragile :
 * un webhook perdu, en retard ou INVERSÉ (terminaison reçue avant
 * `attachEgress`) laissait la ligne `pending` définitivement. Deux ajouts,
 * tous deux ADDITIFS :
 *
 *  · `markEgressState` — `egress_started`/`egress_updated` écrivent l'état de
 *    CAPTURE (« LiveKit enregistre ») ;
 *  · `reconcileStalePending` (cron 15 min) + `reconcileDirectEgress` (action) —
 *    on va DEMANDER à LiveKit ce qu'il est advenu, et on conclut : fichier
 *    rapatrié, échec nommé, ou abandon motivé au bout de 24 h.
 *
 * ⚠️ LA GARDE DES FICHIERS. Le moteur ne sert AUCUN fichier que sa garde ne
 * connaît pas (`files/storageGuard.servableUrl`, fail-closed) : une copie
 * rattachée sans y être inscrite serait une rediffusion « prête » que personne
 * ne pourrait jamais lire. Le fichier rapatrié y entre au rattachement
 * (`lib/livekitEgressUploads.acceptStoredEgressFile`), la piste de sous-titres
 * aussi (`attachCaptions`), et chaque suppression emporte la ligne d'analyse.
 */
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
// `internalMutation` BRUTE : aucune table `live*` n'est aux triggers.
import { internalMutation, internalQuery } from "../../_generated/server"
import { buildDirectEgressFilepath } from "../../lib/livekitEgressRouting"
import { acceptStoredEgressFile, discardStoredEgressFile, egressUploadValidator } from "../../lib/livekitEgressUploads"
import { enqueueScan, readStoredBlobFacts } from "../files/admission"
import { purgeStoredFile } from "../files/purge"
import { scheduleRecordingConsentPurge } from "./recordingConsent"
import { type DirectReplayFailureReason, directReplayReconcileVerdict } from "./replayComposition"
import { DIRECT_REPLAY_PURGE_BATCH, directReplayRetentionUntil, nextDirectReplayRetentionCheck } from "./retention"
import {
  directReplayCaptionsLangValidator,
  directReplayCompositionValidator,
  directReplayEgressStateValidator,
  directReplayFailureReasonValidator,
} from "./validators"

// Les validateurs précis vivent avec ceux de la table (`./validators`) : le schéma les lit aussi.
export { directReplayCaptionsLangValidator, directReplayFailureReasonValidator }

/** Le type d'une piste de sous-titres importée (`livekitActions.importReplayCaptions`). */
const DIRECT_REPLAY_CAPTIONS_MIME_TYPE = "text/vtt"

/**
 * Supprime un blob — ET sa ligne d'analyse — idempotemment, sans transformer
 * une purge rejouée en échec.
 */
async function deleteBlobIfPresent(ctx: MutationCtx, storageId: Id<"_storage"> | undefined): Promise<void> {
  if (storageId === undefined) return
  const metadata = await ctx.db.system.get("_storage", storageId)
  if (metadata !== null) await purgeStoredFile(ctx, storageId)
}

/**
 * ⚠️ EXPORTÉ depuis le lot 10C : `sessions.withdrawReplay` retire une
 * rediffusion à la demande de l'hôte et doit supprimer les MÊMES blobs, de la
 * même façon, que l'échéance de conservation. Deux définitions de « purger »
 * finiraient par diverger — et diverger, ici, veut dire laisser une vidéo
 * derrière une ligne qui se dit retirée.
 */
export async function purgeReplayBlobs(
  ctx: MutationCtx,
  replayStorageId: Id<"_storage"> | undefined,
  captionsStorageId: Id<"_storage"> | undefined,
): Promise<void> {
  await deleteBlobIfPresent(ctx, replayStorageId)
  if (captionsStorageId !== replayStorageId) {
    await deleteBlobIfPresent(ctx, captionsStorageId)
  }
}

/**
 * Ce que l'action de DÉMARRAGE a besoin de savoir entre deux tentatives
 * (ADR-0158, réessai borné) : la conférence est-elle encore en direct, et une
 * corrélation existe-t-elle déjà ? Un `goLive` suivi d'un « Terminer » avant
 * la première connexion ne doit pas laisser une capture se lancer sur une
 * salle que plus personne n'occupe.
 */
export const egressStartState = internalQuery({
  args: { sessionId: v.id("liveSessions") },
  returns: v.object({ live: v.boolean(), egressId: v.union(v.string(), v.null()), recording: v.boolean() }),
  handler: async (ctx, args): Promise<{ live: boolean; egressId: string | null; recording: boolean }> => {
    const session = await ctx.db.get(args.sessionId)
    if (!session) return { live: false, egressId: null, recording: false }
    return {
      live: session.status === "live",
      egressId: session.egressId ?? null,
      recording: session.replayRequested && session.replayStatus === "pending",
    }
  },
})

/**
 * Cet Egress appartient-il à CE déploiement ? (correctif du 2026-09-17)
 *
 * Une même VM LiveKit peut servir plusieurs déploiements, et son webhook part
 * vers chacun : le webhook (`lib/livekitEgressWebhook.findEgressOwners`)
 * demande s'il connaît l'egress AVANT de télécharger quoi que ce soit.
 * Lecture seule, sans journal : l'egress d'un autre déploiement n'est pas une
 * anomalie.
 */
export const isEgressKnown = internalQuery({
  args: { egressId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const session = await ctx.db
      .query("liveSessions")
      .withIndex("by_egressId", (q) => q.eq("egressId", args.egressId))
      .first()
    return session !== null
  },
})

/** L'action Node rapporte l'egressId qu'elle vient d'obtenir de LiveKit. */
export const attachEgress = internalMutation({
  args: {
    sessionId: v.id("liveSessions"),
    egressId: v.optional(v.string()),
    /** Egress refusé au démarrage (env absente, room fermée…) : le replay
     * n'existera pas, autant le dire tout de suite. */
    failed: v.optional(v.boolean()),
    /**
     * POURQUOI, quand on le sait (lot 10B) — un CODE. ADDITIF : l'appel
     * `{ sessionId, failed: true }` reste valide et n'écrit aucun motif.
     */
    failureReason: v.optional(directReplayFailureReasonValidator),
    /**
     * La composition RÉELLEMENT demandée à LiveKit (lot 10A) — photographiée
     * ici pour que la recette E25 puisse comparer le fichier à la décision.
     */
    composition: v.optional(directReplayCompositionValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId)
    if (!session) return null
    // Un rapport TARDIF ne dégrade jamais un replay déjà abouti (l'Egress a
    // pu se terminer — webhook — avant que ce rapport ne s'exécute).
    if (session.replayStatus === "ready" || session.replayStatus === "expired") {
      return null
    }
    const failed = args.failed === true
    await ctx.db.patch(session._id, {
      // Un échec SANS egressId n'efface pas une corrélation déjà posée : le
      // webhook peut encore aboutir par elle.
      ...(args.egressId !== undefined ? { egressId: args.egressId } : {}),
      ...(args.composition !== undefined ? { replayComposition: args.composition } : {}),
      replayStatus: failed ? ("failed" as const) : ("pending" as const),
      // L'état de CAPTURE, distinct du statut durable : « demandé » tant que
      // LiveKit n'a rien confirmé. Un échec n'a plus de capture à décrire.
      replayEgressState: failed ? undefined : ("requested" as const),
      ...(failed && args.failureReason !== undefined ? { replayFailureReason: args.failureReason } : {}),
      updatedAt: Date.now(),
    })
    return null
  },
})

/**
 * L'Egress a changé d'état SANS se terminer — `egress_started`/`egress_updated`.
 *
 * ⚠️ Le webhook IGNORAIT ces deux événements : l'unique source d'état était
 * `egress_ended`, si bien que « LiveKit enregistre » n'existait nulle part et
 * qu'un hôte ne pouvait pas savoir si sa conférence était réellement captée.
 *
 * Trois garde-fous, tous nécessaires :
 *  · `egressId` inconnu → ABSORBÉ (comme `completeEgress`). Un identifiant qui
 *    n'est pas à nous (un autre déploiement de la même VM) doit rester inerte,
 *    jamais rendre un 500 que LiveKit rejouerait en boucle ;
 *  · un replay `ready`, `failed` ou `expired` n'est jamais DÉGRADÉ en cours
 *    de route — l'ordre d'arrivée des événements n'est pas garanti ;
 *  · on n'écrit QUE sur transition. `sessions.get` est réactif pour toute la
 *    salle : réécrire la même valeur à chaque `egress_updated` réveillerait
 *    tous les spectateurs sans rien leur apprendre (doctrine `reap.ts`).
 */
export const markEgressState = internalMutation({
  args: {
    egressId: v.string(),
    state: directReplayEgressStateValidator,
  },
  returns: v.object({ updated: v.boolean() }),
  handler: async (ctx, args): Promise<{ updated: boolean }> => {
    const session = await ctx.db
      .query("liveSessions")
      .withIndex("by_egressId", (q) => q.eq("egressId", args.egressId))
      .unique()
    if (!session) return { updated: false }
    if (session.replayStatus !== "pending") return { updated: false }
    if (session.replayEgressState === args.state) return { updated: false }
    await ctx.db.patch(session._id, {
      replayEgressState: args.state,
      updatedAt: Date.now(),
    })
    return { updated: true }
  },
})

/**
 * L'Egress est terminé — appelé par le webhook HTTP (`egress_ended`, branche
 * `direct` du routage) et par la réconciliation. Idempotent par nature (patch
 * du même état).
 *
 * `egressId` inconnu : journalisé et ABSORBÉ — un webhook rejoué après une
 * purge, ou un egress d'un autre déploiement, ne doit pas rendre de 500 (le
 * fournisseur re-essaierait en boucle).
 */
export const completeEgress = internalMutation({
  args: {
    egressId: v.string(),
    storageId: v.optional(v.id("_storage")),
    /**
     * Ce que le rapatriement en flux DÉCLARE du fichier déposé (correctif du
     * 2026-09-17). Présent, le fichier est confronté au stockage avant d'être
     * rattaché (politique de dépôt, temps 2). Absent (complétion interne sans
     * déclaration), le fichier est inscrit comme produit par la plateforme.
     */
    upload: v.optional(egressUploadValidator),
    durationMs: v.optional(v.number()),
    failureReason: v.optional(directReplayFailureReasonValidator),
  },
  returns: v.object({ found: v.boolean() }),
  handler: async (ctx, args): Promise<{ found: boolean }> => {
    const session = await ctx.db
      .query("liveSessions")
      .withIndex("by_egressId", (q) => q.eq("egressId", args.egressId))
      .unique()
    if (!session) {
      // Déposé par le serveur pour une ligne qui n'existe plus : orphelin.
      if (args.upload !== undefined && args.storageId !== undefined) {
        await discardStoredEgressFile(ctx, args.storageId)
      }
      console.warn(`[direct] completeEgress : egressId inconnu (${args.egressId}) — événement absorbé.`)
      return { found: false }
    }

    // Un webhook rejoué ne prolonge JAMAIS la conservation. Après purge, il
    // ne ressuscite surtout pas la copie ; un blob nouvellement rapatrié est
    // alors un orphelin à supprimer.
    if (session.replayStatus === "expired") {
      await deleteBlobIfPresent(ctx, args.storageId)
      return { found: true }
    }
    if (session.replayStatus === "ready" && session.replayRetentionUntil !== undefined) {
      if (args.storageId !== session.replayStorageId) {
        await deleteBlobIfPresent(ctx, args.storageId)
      }
      return { found: true }
    }

    // Politique de dépôt, temps 2, et inscription à la garde des fichiers :
    // un fichier rapatrié n'est rattaché qu'après. Refusé, il est déjà supprimé.
    let storageId = args.storageId
    let failureReason: DirectReplayFailureReason | undefined = args.failureReason
    if (
      storageId !== undefined &&
      failureReason === undefined &&
      !(await acceptStoredEgressFile(ctx, storageId, args.upload, {
        networkId: session.networkId,
        personId: session.hostPersonId,
        filename: buildDirectEgressFilepath(String(session._id)),
      }))
    ) {
      storageId = undefined
      failureReason = "upload_refused"
    }

    const failed = failureReason !== undefined || storageId === undefined
    const now = Date.now()
    const replayRetentionUntil = directReplayRetentionUntil(now)
    await ctx.db.patch(session._id, {
      replayStatus: failed ? ("failed" as const) : ("ready" as const),
      // La capture est TERMINÉE dans les deux cas — c'est le fichier qui
      // distingue « prêt » de « rien ne viendra ».
      replayEgressState: "stopped" as const,
      /**
       * ⚠️ Le motif est CONSERVÉ tel quel, ou EFFACÉ sur un succès. Un replay
       * abouti après une tentative en échec (relance, réconciliation) ne doit
       * pas traîner la raison d'un échec qui n'a plus lieu — l'écran de l'hôte
       * annoncerait un problème résolu.
       */
      replayFailureReason: failed ? (failureReason ?? "no_file_delivered") : undefined,
      replayStorageId: failed ? undefined : storageId,
      replayDurationMs: args.durationMs,
      replayRetentionUntil: failed ? undefined : replayRetentionUntil,
      replayPurgedAt: undefined,
      updatedAt: now,
    })
    if (failed) {
      // Un fichier accompagné d'un failureReason est un dérivé orphelin : il
      // ne doit jamais rester stocké sous un état `failed`.
      await deleteBlobIfPresent(ctx, storageId)
      console.error(`[direct] Egress en échec pour ${session._id} : ${failureReason ?? "fichier absent"}`)
    } else {
      await ctx.scheduler.runAt(nextDirectReplayRetentionCheck(now, replayRetentionUntil), internal.modules.live.replay.expireReplay, {
        sessionId: session._id,
        expectedRetentionUntil: replayRetentionUntil,
      })
    }
    return { found: true }
  },
})

/**
 * Rattache une piste WebVTT produite après la vidéo. La piste ne prolonge
 * jamais la conservation : arrivée après échéance, elle est supprimée dans la
 * même transaction et n'est pas attachée.
 *
 * La piste vient d'un CLIENT (importée par l'hôte) : elle entre à la garde des
 * fichiers par l'ANALYSE (inspection du texte, antivirus), comme tout dépôt —
 * l'écran la sert quand la garde l'a jugée.
 */
export const attachCaptions = internalMutation({
  args: {
    sessionId: v.id("liveSessions"),
    storageId: v.id("_storage"),
    /**
     * La LANGUE déclarée par l'hôte (lot 10D) — un code. ADDITIF : un appelant
     * qui n'en passe pas laisse l'écran retomber sur le français.
     */
    lang: v.optional(directReplayCaptionsLangValidator),
    /** La personne qui importe la piste — son déposant pour la garde des fichiers. */
    uploadedByPersonId: v.optional(v.id("persons")),
  },
  returns: v.object({ attached: v.boolean() }),
  handler: async (ctx, args): Promise<{ attached: boolean }> => {
    const session = await ctx.db.get(args.sessionId)
    const now = Date.now()
    if (!session || session.replayStatus !== "ready" || session.replayRetentionUntil === undefined || session.replayRetentionUntil <= now) {
      await deleteBlobIfPresent(ctx, args.storageId)
      return { attached: false }
    }
    if (session.replayCaptionsStorageId !== undefined && session.replayCaptionsStorageId !== args.storageId) {
      await deleteBlobIfPresent(ctx, session.replayCaptionsStorageId)
    }
    await enqueueScan(ctx, await readStoredBlobFacts(ctx, args.storageId, DIRECT_REPLAY_CAPTIONS_MIME_TYPE), {
      source: "live",
      networkId: session.networkId,
      ...(args.uploadedByPersonId !== undefined ? { uploadedByPersonId: args.uploadedByPersonId } : {}),
      filename: `directs/${session._id}.vtt`,
    })
    await ctx.db.patch(session._id, {
      replayCaptionsStorageId: args.storageId,
      ...(args.lang !== undefined ? { replayCaptionsLang: args.lang } : {}),
      updatedAt: now,
    })
    return { attached: true }
  },
})

/**
 * LE FILET des webhooks perdus, en retard ou INVERSÉS.
 *
 * ⚠️ Le défaut gardé ici : `completeEgress` résout par `by_egressId`. Un
 * `egress_ended` reçu AVANT que `attachEgress` n'ait posé la corrélation est
 * donc ABSORBÉ (« egressId inconnu »), et plus rien ne le rejoue — la ligne
 * reste `pending` POUR TOUJOURS. Le cron horaire de purge ne la voit pas (il
 * ne balaie que `ready`), la récolte non plus.
 *
 * Une exécution pagine 50 lignes au plus (une seule `.paginate()`, jamais de
 * collecte entière) puis se re-planifie — même patron que `purgeExpiredReplays`.
 * La décision par ligne est PURE et testée
 * (`replayComposition.directReplayReconcileVerdict`) : attendre, interroger
 * LiveKit, ou abandonner.
 */
export const reconcileStalePending = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({ processed: v.number(), scheduled: v.number(), failed: v.number(), done: v.boolean() }),
  handler: async (ctx, args): Promise<{ processed: number; scheduled: number; failed: number; done: boolean }> => {
    const now = Date.now()
    const page = await ctx.db
      .query("liveSessions")
      .withIndex("by_status_replayStatus_endedAt", (q) => q.eq("status", "ended").eq("replayStatus", "pending"))
      .order("asc")
      .paginate({
        cursor: args.cursor ?? null,
        numItems: DIRECT_REPLAY_PURGE_BATCH,
      })

    let scheduled = 0
    let failed = 0
    for (const session of page.page) {
      const verdict = directReplayReconcileVerdict({
        // Une session `ended` porte toujours `endedAt` sous le chemin nominal ;
        // sa création est l'ancre la plus CONSERVATRICE à défaut.
        endedAt: session.endedAt ?? session._creationTime,
        now,
        egressId: session.egressId,
      })
      if (verdict === "wait") continue
      if (verdict === "give_up") {
        await ctx.db.patch(session._id, {
          replayStatus: "failed" as const,
          replayEgressState: undefined,
          replayFailureReason: session.egressId === undefined ? "never_started" : "never_delivered",
          updatedAt: now,
        })
        failed += 1
        continue
      }
      await ctx.scheduler.runAfter(0, internal.modules.live.livekitActions.reconcileDirectEgress, {
        sessionId: session._id,
        // `verdict === "reconcile"` implique une corrélation ; la garde
        // explicite évite d'en dépendre par déduction.
        ...(session.egressId !== undefined ? { egressId: session.egressId } : {}),
      })
      scheduled += 1
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.modules.live.replay.reconcileStalePending, { cursor: page.continueCursor })
    }
    return {
      processed: page.page.length,
      scheduled,
      failed,
      done: page.isDone,
    }
  },
})

/** Échéance exacte planifiée au succès Egress, idempotente et anti-course. */
export const expireReplay = internalMutation({
  args: {
    sessionId: v.id("liveSessions"),
    expectedRetentionUntil: v.number(),
  },
  returns: v.object({ expired: v.boolean() }),
  handler: async (ctx, args): Promise<{ expired: boolean }> => {
    const session = await ctx.db.get(args.sessionId)
    if (!session || session.replayStatus !== "ready" || session.replayRetentionUntil !== args.expectedRetentionUntil) {
      return { expired: false }
    }
    const now = Date.now()
    if (now < args.expectedRetentionUntil) {
      await ctx.scheduler.runAt(nextDirectReplayRetentionCheck(now, args.expectedRetentionUntil), internal.modules.live.replay.expireReplay, args)
      return { expired: false }
    }
    await purgeReplayBlobs(ctx, session.replayStorageId, session.replayCaptionsStorageId)
    await ctx.db.patch(session._id, {
      replayStatus: "expired",
      replayStorageId: undefined,
      replayCaptionsStorageId: undefined,
      // La langue décrivait une piste qui n'existe plus.
      replayCaptionsLang: undefined,
      replayPurgedAt: now,
      updatedAt: now,
    })
    // DL-02 — les accords à l'enregistrement durent autant que la copie.
    await scheduleRecordingConsentPurge(ctx, session._id)
    return { expired: true }
  },
})

/**
 * Filet de sécurité horaire et migration paresseuse des anciens replays.
 * Chaque invocation pagine 50 lignes au plus puis planifie la suivante : pas
 * de collecte entière, pas de transaction dont le coût dépend du volume total.
 */
export const purgeExpiredReplays = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({ processed: v.number(), done: v.boolean() }),
  handler: async (ctx, args): Promise<{ processed: number; done: boolean }> => {
    const now = Date.now()
    const page = await ctx.db
      .query("liveSessions")
      .withIndex("by_status_replayStatus_endedAt", (q) => q.eq("status", "ended").eq("replayStatus", "ready"))
      .order("asc")
      .paginate({
        cursor: args.cursor ?? null,
        numItems: DIRECT_REPLAY_PURGE_BATCH,
      })

    for (const session of page.page) {
      // Les lignes antérieures à la politique sont fermées jusqu'à ce passage.
      // Faute d'heure Egress historique, leur fin de session est l'ancre la
      // plus conservatrice : aucune migration ne leur offre 90 jours de plus.
      if (session.replayRetentionUntil === undefined) {
        const replayRetentionUntil = directReplayRetentionUntil(session.endedAt ?? session._creationTime)
        if (replayRetentionUntil <= now) {
          await purgeReplayBlobs(ctx, session.replayStorageId, session.replayCaptionsStorageId)
          await ctx.db.patch(session._id, {
            replayStatus: "expired",
            replayStorageId: undefined,
            replayCaptionsStorageId: undefined,
            replayCaptionsLang: undefined,
            replayRetentionUntil,
            replayPurgedAt: now,
            updatedAt: now,
          })
          await scheduleRecordingConsentPurge(ctx, session._id)
          continue
        }
        await ctx.db.patch(session._id, {
          replayRetentionUntil,
          updatedAt: now,
        })
        await ctx.scheduler.runAt(nextDirectReplayRetentionCheck(now, replayRetentionUntil), internal.modules.live.replay.expireReplay, {
          sessionId: session._id,
          expectedRetentionUntil: replayRetentionUntil,
        })
        continue
      }
      if (session.replayRetentionUntil > now) continue
      await purgeReplayBlobs(ctx, session.replayStorageId, session.replayCaptionsStorageId)
      await ctx.db.patch(session._id, {
        replayStatus: "expired",
        replayStorageId: undefined,
        replayCaptionsStorageId: undefined,
        replayCaptionsLang: undefined,
        replayPurgedAt: now,
        updatedAt: now,
      })
      // DL-02 — les accords partent avec la copie (un job par session, borné à la page de 50).
      await scheduleRecordingConsentPurge(ctx, session._id)
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.modules.live.replay.purgeExpiredReplays, { cursor: page.continueCursor })
    }
    return { processed: page.page.length, done: page.isDone }
  },
})
