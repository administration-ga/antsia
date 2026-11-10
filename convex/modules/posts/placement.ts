/**
 * La garde de PLACEMENT d'une publication (HB-03, issue antsia#96) : pour un réseau gouverné par une
 * tranche (`networks.managedBy`), la règle que cette tranche inscrit au registre
 * (`networks/postPlacementRegistry`) juge le placement AVANT toute écriture. Aucune fonction Convex
 * ici : c'est une garde, appelée par `posts.publish`, `pages.publishAsPage` et `events.announce`.
 *
 * Réseau non gouverné, ou tranche sans règle : aucune lecture, aucun appel — le comportement d'avant.
 */
import { isPostPlacementRefusal } from "@antsia/social-domain/content"

import type { QueryCtx } from "../../_generated/server"
import { failRule } from "../../lib/errors"
import { type PostPlacement, POST_PLACEMENT_RULES } from "../networks/postPlacementRegistry"

export async function assertPostPlacement(ctx: Pick<QueryCtx, "db">, placement: PostPlacement): Promise<void> {
  const slice = placement.network.managedBy
  if (slice === undefined) return
  const rule = POST_PLACEMENT_RULES[slice]
  if (rule === null) return
  const refusal = await rule(ctx, placement)
  if (refusal === null) return
  // Un code hors de l'ensemble fermé est une faute de programmation de la tranche : jamais une phrase vers l'écran.
  if (!isPostPlacementRefusal(refusal)) throw new Error("[placement] code de refus hors de l'ensemble fermé")
  return failRule(refusal)
}

/** Le placement jugé par `assertPostReach`, sous la forme que reçoit la règle (`null` pour une absence). */
export function placementOf(placed: { reach?: string; country?: string }): Pick<PostPlacement, "reach" | "country"> {
  return { reach: placed.reach ?? null, country: placed.country ?? null }
}
