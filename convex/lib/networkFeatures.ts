/**
 * ADR-0041 — la garde des fonctionnalités d'un réseau GOUVERNÉ par une tranche.
 *
 * Les constructeurs (`networkQuery`, `networkMutation`, `networkAction`,
 * `lib/functions.ts`) prennent une option `feature` : après la garde d'adhésion,
 * une fonctionnalité FERMÉE rend le refus indistinct (`notFound`), en lecture
 * comme en écriture, avant tout budget de débit et tout effet. La garde ne vaut
 * que pour un réseau gouverné dont la tranche déclare la fonctionnalité
 * (`SLICE_NETWORK_FEATURES`) : la racine et tout réseau sans tranche ne lisent
 * pas la table, rien ne change pour eux.
 *
 * Une ligne par couple (réseau, fonctionnalité) ; l'absence de ligne vaut
 * « fermé ». Une fonctionnalité n'est ouverte que si son parent l'est aussi
 * (défense en profondeur : l'écriture tient déjà la règle de dépendance).
 */
import {
  NETWORK_FEATURE_PARENTS,
  NETWORK_FEATURES,
  type NetworkFeature,
  openNetworkFeatures,
  sliceGovernsFeature,
} from "@antsia/social-domain/networkFeatures"

import type { Doc } from "../_generated/dataModel"
import type { QueryCtx } from "../_generated/server"
import { notFound } from "./errors"

/** La ligne d'une fonctionnalité dans un réseau, ou `null` (fermée sans décision). */
export async function networkFeatureRow(ctx: Pick<QueryCtx, "db">, networkId: Doc<"networks">["_id"], feature: NetworkFeature): Promise<Doc<"networkFeatures"> | null> {
  return await ctx.db
    .query("networkFeatures")
    .withIndex("by_network_feature", (q) => q.eq("networkId", networkId).eq("feature", feature))
    .first()
}

/**
 * Les fonctionnalités OUVERTES d'un réseau gouverné, dans l'ordre des clés ; une
 * liste vide pour un réseau sans tranche, sans lire la table. Une ligne au plus
 * par fonctionnalité : la lecture est bornée par le nombre de clés.
 */
export async function openFeaturesOf(ctx: Pick<QueryCtx, "db">, network: Doc<"networks">): Promise<NetworkFeature[]> {
  const slice = network.managedBy
  if (slice === undefined) return []
  const rows = await ctx.db
    .query("networkFeatures")
    .withIndex("by_network_feature", (q) => q.eq("networkId", network._id))
    .take(NETWORK_FEATURES.length)
  return openNetworkFeatures(rows).filter((feature) => sliceGovernsFeature(slice, feature))
}

/** La fonctionnalité est-elle servie dans ce réseau ? Toujours, si sa tranche ne la gouverne pas. */
export async function isNetworkFeatureOpen(ctx: Pick<QueryCtx, "db">, network: Doc<"networks">, feature: NetworkFeature): Promise<boolean> {
  if (!sliceGovernsFeature(network.managedBy, feature)) return true
  for (let current: NetworkFeature | null = feature; current !== null; current = NETWORK_FEATURE_PARENTS[current]) {
    const row = await networkFeatureRow(ctx, network._id, current)
    if (row?.enabled !== true) return false
  }
  return true
}

/** LA garde : une fonctionnalité fermée rend le refus indistinct (`notFound`). */
export async function requireNetworkFeature(ctx: Pick<QueryCtx, "db">, network: Doc<"networks">, feature: NetworkFeature): Promise<void> {
  if (!(await isNetworkFeatureOpen(ctx, network, feature))) return notFound()
}
