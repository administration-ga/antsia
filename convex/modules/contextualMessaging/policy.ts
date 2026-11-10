/**
 * CC-2b (contrat CONVERSATION-CONTEXTUELLE-V1 §5.9) — l'ÉCRITURE de la politique d'une nature dans
 * un réseau, sans garde ni journal : aucune fonction Convex ici. L'appelant porte la garde et la
 * ligne de journal `contextual.policy_set` ; cette aide tient seulement l'état :
 *   - réseau actif, sinon refus indistinct (`notFound`) ;
 *   - une ligne par nature (`by_network_kind`), FERMÉE sans ligne ;
 *   - aucun geste quand l'état demandé est déjà en place ;
 *   - fermer revalide les appels vivants (CC-4, `retention.revalidateCalls`).
 *
 * Deux appelants :
 *   - `operator.setPolicy` (console), après SES gardes (administrateur de plateforme, débit, motif),
 *     qui écrit sa ligne de journal en ligne (cliquet `operator-audit`), seulement si `changed` ;
 *   - la graine LOCALE de la tranche DIASPORALE (issue antsia#107, lot LX-04 de DIASPORALE), derrière
 *     la double garde des graines et `isLocalDeployment`, qui journalise elle-même en qualité `system`.
 */
import type { ContextualKind } from "@antsia/social-domain/contextualMessaging"
import { makeFunctionReference } from "convex/server"

import type { Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { notFound } from "../../lib/errors"

/** CC-4 : une politique FERMÉE bloque tout appel — la revalidation paginée arrête ceux qui vivent encore. */
const revalidateCalls = makeFunctionReference<"mutation", { cursor?: string }, number>("modules/contextualMessaging/retention:revalidateCalls")

export type ContextualPolicyInput = {
  readonly networkId: Id<"networks">
  readonly kind: ContextualKind
  readonly enabled: boolean
  /** La personne qui décide (console) ; absente pour un geste du système (graine locale), qui n'attribue la décision à personne. */
  readonly updatedByPersonId?: Id<"persons">
}

/** `changed` : une ligne a été écrite ; `at` : l'heure de la décision (celle de l'appel quand rien ne change). */
export type ContextualPolicyWrite = { readonly changed: boolean; readonly at: number }

/** Ouvre ou ferme une nature dans un réseau actif ; idempotente (rien n'est écrit si l'état est déjà en place). */
export async function writeContextualPolicy(ctx: MutationCtx, input: ContextualPolicyInput): Promise<ContextualPolicyWrite> {
  const network = await ctx.db.get(input.networkId)
  if (network === null || network.status !== "active") return notFound()
  const row = await ctx.db.query("contextualPolicies").withIndex("by_network_kind", (q) => q.eq("networkId", input.networkId).eq("kind", input.kind)).first()
  const now = Date.now()
  // Rien à décider : la politique est déjà dans l'état demandé (fermée sans ligne).
  if ((row?.enabled === true) === input.enabled) return { changed: false, at: now }
  const fields = { networkId: input.networkId, kind: input.kind, enabled: input.enabled, updatedAt: now, updatedByPersonId: input.updatedByPersonId }
  if (row) await ctx.db.patch(row._id, fields)
  else await ctx.db.insert("contextualPolicies", fields)
  if (!input.enabled) await ctx.scheduler.runAfter(0, revalidateCalls, {})
  return { changed: true, at: now }
}
