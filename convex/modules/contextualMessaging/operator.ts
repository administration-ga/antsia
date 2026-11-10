/**
 * CC-2b (contrat CONVERSATION-CONTEXTUELLE-V1 §5.9) — la politique d'une nature dans un réseau,
 * FERMÉE par défaut (l'absence de ligne vaut « fermé »), réglée depuis la console (section Pages)
 * par un administrateur de plateforme, avec un motif d'au moins dix caractères et une ligne de
 * journal `contextual.policy_set` (cliquet `operator-audit`). Une politique fermée bloque toute
 * ouverture, tout message et tout appel ; l'historique reste lisible des parties (D10). Fermer la
 * politique est aussi le retour arrière. L'écriture elle-même vit dans `./policy`
 * (`writeContextualPolicy`), partagée avec la graine locale de la tranche (antsia#107).
 */
import { assertDecisionReason } from "@antsia/social-domain/audit"
import { CONTEXTUAL_SUPPORTED_KINDS, CONTEXTUAL_POLICY_REASON_MIN } from "@antsia/social-domain/contextualMessaging"
import { v } from "convex/values"

import { checked } from "../../lib/errors"
import { operatorMutation, operatorQuery } from "../../lib/functions"
import { requirePlatformAdmin } from "../../lib/operatorIdentity"
import { enforceRateLimit } from "../../lib/rateLimit"
import { appendAudit, operatorCapacity } from "../platform/audit"
import { writeContextualPolicy } from "./policy"
import { contextualKindValidator } from "./tables"

const policyStateValidator = v.object({ kind: contextualKindValidator, enabled: v.boolean(), updatedAt: v.union(v.number(), v.null()) })

/** Les politiques de toutes les natures V1 d'un réseau (une ligne par nature, fermée sans décision). */
export const policies = operatorQuery({
  args: { networkId: v.id("networks") },
  returns: v.array(policyStateValidator),
  handler: async (ctx, args) => {
    const states = []
    for (const kind of CONTEXTUAL_SUPPORTED_KINDS) {
      const row = await ctx.db.query("contextualPolicies").withIndex("by_network_kind", (q) => q.eq("networkId", args.networkId).eq("kind", kind)).first()
      states.push({ kind, enabled: row?.enabled === true, updatedAt: row?.updatedAt ?? null })
    }
    return states
  },
})

/** La politique d'UNE nature dans un réseau. */
export const policy = operatorQuery({
  args: { networkId: v.id("networks"), kind: contextualKindValidator },
  returns: policyStateValidator,
  handler: async (ctx, args) => {
    const row = await ctx.db.query("contextualPolicies").withIndex("by_network_kind", (q) => q.eq("networkId", args.networkId).eq("kind", args.kind)).first()
    return { kind: args.kind, enabled: row?.enabled === true, updatedAt: row?.updatedAt ?? null }
  },
})

/** Ouvrir ou fermer une nature dans un réseau actif : administrateur de plateforme, motif, journal. */
export const setPolicy = operatorMutation({
  args: { networkId: v.id("networks"), kind: contextualKindValidator, enabled: v.boolean(), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    requirePlatformAdmin(ctx)
    await enforceRateLimit(ctx, "operator.network", ctx.person._id)
    const reason = checked(() => assertDecisionReason(args.reason, CONTEXTUAL_POLICY_REASON_MIN))
    // Réseau actif (sinon refus indistinct), écriture et revalidation des appels à la fermeture : `./policy`.
    const { changed, at } = await writeContextualPolicy(ctx, { networkId: args.networkId, kind: args.kind, enabled: args.enabled, updatedByPersonId: ctx.person._id })
    // Rien à décider (état déjà en place) : aucune ligne de journal.
    if (!changed) return null
    await appendAudit(ctx, {
      action: "contextual.policy_set",
      capacity: operatorCapacity(ctx.operator),
      actorPersonId: ctx.person._id,
      networkId: args.networkId,
      subject: { table: "networks", id: args.networkId },
      details: { reason, kind: args.kind, enabled: args.enabled },
      at,
    })
    return null
  },
})
