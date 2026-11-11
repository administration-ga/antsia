// Dupliqué de socle/convex/modules/iappel/preferences.ts @ ad2e7fdc2 — adaptations : réglages de la PERSONNE (constructeurs `personQuery`/`personMutation`, fonctions sur soi) ; miroir du « ne pas déranger » vers la présence d'organisation (`mirrorDndToPresence`, V23) et portée du silence (poste / personnel / tout) retirés ; réponses rapides par défaut → `null` (l'écran propose les siennes, traduites) au lieu de trois phrases françaises stockées dans le code ; nettoyage des réponses rapides par la règle pure du contrat (`normalizeQuickReplies`) ; instant de lecture fourni par l'écran (D16) ; refus à code de règle (`CALL_DND_PAST`, `CALL_DND_TOO_LONG`) ; débit. ; IC-04 : « qui peut m'appeler » par défaut `silent` pour qui ne l'a jamais réglé (décision du propriétaire du 9/11/2026, défaut lu par `outsideRelationsCallsOf`, partagé avec l'admission) ; accusés de lecture réciproques (`readReceipts`, lus par `readReceiptsEnabledFor` dans la messagerie à deux).
/**
 * Appels — les RÉGLAGES d'appel d'une personne.
 *
 * Une ligne par personne, créée au besoin. La lecture rend TOUJOURS les défauts
 * sans jamais écrire : créer une ligne au simple affichage peuplerait la table de
 * réglages que personne n'a choisis. Chaque mise à jour ne touche que les champs
 * fournis — plusieurs cartes indépendantes à l'écran ne s'écrasent pas.
 */
import { DEFAULT_OUTSIDE_RELATIONS_CALLS, DEFAULT_READ_RECEIPTS, MAX_DND_DURATION_MS, normalizeQuickReplies, type OutsideRelationsCallPolicy } from "@antsia/social-contracts/calls"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { failRule } from "../../lib/errors"
import { personMutation, personQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { autoMeetingDndValidator, outsideRelationsCallsValidator, ringtonePrefsValidator } from "./validators"

const DAY_MS = 24 * 60 * 60 * 1000

type PreferencesRow = Pick<Doc<"callPreferences">, "outsideRelationsCalls" | "readReceipts"> | null | undefined

/**
 * IC-04 — le réglage « hors de mes relations » EFFECTIF : la valeur posée par la personne, sinon le
 * défaut du moteur (`silent`, décision du propriétaire du 9/11/2026). Absent = jamais réglé : aucune
 * écriture ne pose ce champ d'office (`update` ne touche que les champs fournis, `setDnd` et
 * `markJournalSeen` ne l'écrivent pas), si bien qu'une personne qui a choisi « tout le monde » le
 * garde et que toutes les autres suivent le défaut, sans migration. SEULE source de ce défaut pour
 * la lecture (`getMine`), l'admission d'un appel (`evaluate.ts`) et la conversation contextuelle.
 */
export function outsideRelationsCallsOf(row: PreferencesRow): OutsideRelationsCallPolicy {
  return row?.outsideRelationsCalls ?? DEFAULT_OUTSIDE_RELATIONS_CALLS
}

/** IC-04 — les accusés de lecture de la personne sont-ils actifs ? Absent = défaut (actifs). */
export function readReceiptsOf(row: PreferencesRow): boolean {
  return row?.readReceipts ?? DEFAULT_READ_RECEIPTS
}

/**
 * IC-04 — la personne émet-elle et voit-elle les accusés de lecture ? Lecture d'index, sans écriture :
 * la messagerie à deux ne sert un « Lu » que si les DEUX personnes du fil les ont laissés actifs.
 */
export async function readReceiptsEnabledFor(ctx: Pick<QueryCtx, "db">, personId: Id<"persons">): Promise<boolean> {
  const row = await ctx.db
    .query("callPreferences")
    .withIndex("by_person", (q) => q.eq("personId", personId))
    .unique()
  return readReceiptsOf(row)
}

/**
 * Mes réglages d'appel, ou les défauts si je n'ai jamais rien réglé. Un « ne pas
 * déranger » échu à l'instant fourni est rendu ABSENT : c'est ici, à la lecture,
 * qu'on décide qu'il ne compte plus — jamais en nettoyant la base.
 *
 * @selfScoped la personne lit ses propres réglages d'appel, valables dans tous ses réseaux
 */
export const getMine = personQuery({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("callPreferences")
      .withIndex("by_person", (q) => q.eq("personId", ctx.person._id))
      .unique()
    return {
      dnd: row?.dnd && row.dnd.until > args.now ? row.dnd : null,
      ringtone: { muted: row?.ringtone?.muted ?? false, vibrate: row?.ringtone?.vibrate ?? true },
      callWaiting: row?.callWaiting ?? true,
      /** `null` : jamais réglées — l'écran propose ses réponses par défaut, traduites. */
      quickReplies: row?.quickReplies ?? null,
      voicemailEnabled: row?.voicemailEnabled ?? true,
      autoMeetingDnd: row?.autoMeetingDnd ?? null,
      sharePresence: row?.sharePresence ?? true,
      pushIncoming: row?.pushIncoming ?? true,
      // IC-04 : absent = `silent` — par défaut, seules mes relations font sonner mon téléphone.
      outsideRelationsCalls: outsideRelationsCallsOf(row),
      /** IC-04 : mes accusés de lecture (réciproques) ; absent = actifs. */
      readReceipts: readReceiptsOf(row),
      journalSeenAt: row?.journalSeenAt ?? null,
      saved: row !== null,
    }
  },
})

/**
 * Pose ou efface MON « ne pas déranger ». `until: null` efface immédiatement.
 * Sinon, `until` doit être dans le futur et à moins de sept jours — au-delà, c'est
 * presque toujours un oubli de réglage, pas une intention.
 *
 * @selfScoped la personne règle son propre silence, valable dans tous ses réseaux
 */
export const setDnd = personMutation({
  args: { until: v.union(v.number(), v.null()) },
  returns: v.object({ dnd: v.union(v.object({ until: v.number(), startedAt: v.number() }), v.null()) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "call.settings", ctx.person._id)
    const now = Date.now()
    const existing = await ctx.db
      .query("callPreferences")
      .withIndex("by_person", (q) => q.eq("personId", ctx.person._id))
      .unique()
    if (args.until === null) {
      if (existing) await ctx.db.patch(existing._id, { dnd: undefined, updatedAt: now })
      return { dnd: null }
    }
    if (args.until <= now) return failRule("CALL_DND_PAST")
    if (args.until - now > MAX_DND_DURATION_MS) return failRule("CALL_DND_TOO_LONG", { days: Math.round(MAX_DND_DURATION_MS / DAY_MS) })
    const dnd = { until: args.until, startedAt: now }
    if (existing) await ctx.db.patch(existing._id, { dnd, updatedAt: now })
    else await ctx.db.insert("callPreferences", { personId: ctx.person._id, dnd, updatedAt: now })
    return { dnd }
  },
})

/**
 * Met à jour un SOUS-ENSEMBLE de mes réglages — chaque champ omis reste inchangé.
 *
 * @selfScoped la personne règle ses propres préférences d'appel, valables dans tous ses réseaux
 */
export const update = personMutation({
  args: {
    ringtone: v.optional(ringtonePrefsValidator),
    callWaiting: v.optional(v.boolean()),
    quickReplies: v.optional(v.array(v.string())),
    voicemailEnabled: v.optional(v.boolean()),
    autoMeetingDnd: v.optional(autoMeetingDndValidator),
    sharePresence: v.optional(v.boolean()),
    pushIncoming: v.optional(v.boolean()),
    outsideRelationsCalls: v.optional(outsideRelationsCallsValidator),
    /** IC-04 : facultatif — un écran qui ne le connaît pas ne le touche pas. */
    readReceipts: v.optional(v.boolean()),
  },
  returns: v.object({ saved: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "call.settings", ctx.person._id)
    const now = Date.now()
    const patch = {
      ...(args.ringtone !== undefined ? { ringtone: args.ringtone } : {}),
      ...(args.callWaiting !== undefined ? { callWaiting: args.callWaiting } : {}),
      ...(args.quickReplies !== undefined ? { quickReplies: normalizeQuickReplies(args.quickReplies) } : {}),
      ...(args.voicemailEnabled !== undefined ? { voicemailEnabled: args.voicemailEnabled } : {}),
      ...(args.autoMeetingDnd !== undefined ? { autoMeetingDnd: args.autoMeetingDnd } : {}),
      ...(args.sharePresence !== undefined ? { sharePresence: args.sharePresence } : {}),
      ...(args.pushIncoming !== undefined ? { pushIncoming: args.pushIncoming } : {}),
      ...(args.outsideRelationsCalls !== undefined ? { outsideRelationsCalls: args.outsideRelationsCalls } : {}),
      ...(args.readReceipts !== undefined ? { readReceipts: args.readReceipts } : {}),
      updatedAt: now,
    }
    const existing = await ctx.db
      .query("callPreferences")
      .withIndex("by_person", (q) => q.eq("personId", ctx.person._id))
      .unique()
    if (existing) await ctx.db.patch(existing._id, patch)
    else await ctx.db.insert("callPreferences", { personId: ctx.person._id, ...patch })
    return { saved: true as const }
  },
})

/**
 * Marque MON journal des appels comme vu maintenant — l'écran borne son compteur
 * d'appels manqués non vus à cet instant.
 *
 * @selfScoped la personne marque son propre journal des appels comme vu
 */
export const markJournalSeen = personMutation({
  args: {},
  returns: v.object({ journalSeenAt: v.number() }),
  handler: async (ctx) => {
    await enforceRateLimit(ctx, "call.settings", ctx.person._id)
    const now = Date.now()
    const existing = await ctx.db
      .query("callPreferences")
      .withIndex("by_person", (q) => q.eq("personId", ctx.person._id))
      .unique()
    if (existing) await ctx.db.patch(existing._id, { journalSeenAt: now, updatedAt: now })
    else await ctx.db.insert("callPreferences", { personId: ctx.person._id, journalSeenAt: now, updatedAt: now })
    return { journalSeenAt: now }
  },
})
