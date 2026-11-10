// Dupliqué de socle/convex/modules/reseauPersonnel/graph.ts (l. 1-223) @ ad2e7fdc2 — adaptations : personnes et réseaux ; connexions et abonnements lus DANS un réseau, blocage lu sur TOUTE la paire (tous réseaux) ; les lectures bornées rendent leur lacune (`truncated`, D19) au lieu de tronquer en silence ; `validatedOrgIds`, `hasAnyLiveMembership`, `colleagueUserIds` (l. 225-327) exclus.
/**
 * Les deux liens du réseau personnel, lus au même endroit — et JAMAIS fusionnés.
 *
 * Aucune fonction Convex ici : des aides de lecture partagées par le fil,
 * l'engagement, l'annuaire et les abonnements. UNE définition de « nous sommes
 * connectés », UNE de « je le suis » — deux divergeraient au premier oubli, et
 * c'est sur cette différence que repose l'audience `connections`.
 */
import { canonicalPair } from "@antsia/social-domain/connectionState"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"

type ReadCtx = Pick<QueryCtx, "db">

/**
 * Bornes de lecture : aucune source n'est balayée sans limite. Au-delà, la
 * lecture rend `truncated` : l'appelant DIT la lacune (fil composé sur les N
 * premières connexions) au lieu de la taire.
 */
export const CONNECTIONS_SCAN = 500
export const FOLLOWS_SCAN = 500
export const PAIR_ROWS_MAX = 100

export type BoundedIds = { ids: Set<string>; truncated: boolean }

/** La ligne de connexion de la paire DANS le réseau, ou `null`. */
export async function findConnection(ctx: ReadCtx, networkId: Id<"networks">, a: Id<"persons">, b: Id<"persons">): Promise<Doc<"connections"> | null> {
  const { low, high } = canonicalPair(a, b)
  return await ctx.db
    .query("connections")
    .withIndex("by_network_pair", (q) => q.eq("networkId", networkId).eq("personIdLow", low).eq("personIdHigh", high))
    .unique()
}

/** Les lignes de la paire dans TOUS les réseaux (bornées : une par réseau commun). */
export async function pairRows(ctx: ReadCtx, a: Id<"persons">, b: Id<"persons">): Promise<Doc<"connections">[]> {
  const { low, high } = canonicalPair(a, b)
  // borné : une ligne par réseau commun aux deux personnes.
  return await ctx.db
    .query("connections")
    .withIndex("by_pair", (q) => q.eq("personIdLow", low).eq("personIdHigh", high))
    .take(PAIR_ROWS_MAX + 1)
}

/** Mon intention propre, jamais l'intention inverse. Aide privée, sans fonction publique. */
export async function ownBlockIntent(ctx: ReadCtx, blockerPersonId: Id<"persons">, targetPersonId: Id<"persons">): Promise<Doc<"personBlocks"> | null> {
  return await ctx.db.query("personBlocks")
    .withIndex("by_blocker_target", (q) => q.eq("blockerPersonId", blockerPersonId).eq("targetPersonId", targetPersonId))
    .unique()
}

/** Intentions et marqueurs hérités : une paire trop grande reste fermée en lecture. */
export async function pairBlockState(ctx: ReadCtx, first: Id<"persons">, second: Id<"persons">) {
  const [rows, firstIntent, secondIntent] = await Promise.all([
    pairRows(ctx, first, second),
    ownBlockIntent(ctx, first, second),
    ownBlockIntent(ctx, second, first),
  ])
  const byFirst = firstIntent !== null || rows.some((row) => row.status === "blocked" && row.blockedByPersonId === first)
  const bySecond = secondIntent !== null || rows.some((row) => row.status === "blocked" && row.blockedByPersonId === second)
  const overflow = rows.length > PAIR_ROWS_MAX
  return { rows, firstIntent, secondIntent, byFirst, bySecond, overflow, blocked: overflow || firstIntent !== null || secondIntent !== null || rows.some((row) => row.status === "blocked") }
}

/**
 * Y a-t-il un BLOCAGE entre ces deux personnes, dans un sens ou dans l'autre,
 * dans QUELQUE réseau que ce soit ? Il ferme tout le réseau personnel, dans les
 * deux sens : bloquer pour ne plus voir, en restant visible, ne protégerait de rien.
 */
export async function isBlockedBetween(ctx: ReadCtx, a: Id<"persons">, b: Id<"persons">): Promise<boolean> {
  if (a === b) return false
  return (await pairBlockState(ctx, a, b)).blocked
}

async function sidesWithStatus(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">, status: Doc<"connections">["status"]) {
  const [asLow, asHigh] = await Promise.all([
    ctx.db
      .query("connections")
      .withIndex("by_network_low_status", (q) => q.eq("networkId", networkId).eq("personIdLow", personId).eq("status", status))
      .take(CONNECTIONS_SCAN + 1),
    ctx.db
      .query("connections")
      .withIndex("by_network_high_status", (q) => q.eq("networkId", networkId).eq("personIdHigh", personId).eq("status", status))
      .take(CONNECTIONS_SCAN + 1),
  ])
  return { asLow, asHigh, truncated: asLow.length > CONNECTIONS_SCAN || asHigh.length > CONNECTIONS_SCAN }
}

/**
 * Les personnes avec qui je suis CONNECTÉ dans le réseau. Relu à CHAQUE acte,
 * jamais mis en cache sur une publication : rompre une connexion doit refermer
 * aussitôt ce qu'elle ouvrait.
 */
export async function acceptedCounterpartIds(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">): Promise<BoundedIds> {
  const { asLow, asHigh, truncated } = await sidesWithStatus(ctx, networkId, personId, "accepted")
  const blocked = await blockedCounterpartIds(ctx, personId)
  if (blocked.truncated) return { ids: new Set(), truncated: true }
  const ids = new Set<string>()
  for (const row of asLow.slice(0, CONNECTIONS_SCAN)) if (!blocked.ids.has(row.personIdHigh)) ids.add(row.personIdHigh)
  for (const row of asHigh.slice(0, CONNECTIONS_SCAN)) if (!blocked.ids.has(row.personIdLow)) ids.add(row.personIdLow)
  return { ids, truncated }
}

/** Les demandes EN ATTENTE dans le réseau, séparées par direction. */
export async function pendingCounterpartIds(
  ctx: ReadCtx,
  networkId: Id<"networks">,
  personId: Id<"persons">,
): Promise<{ byMe: Set<string>; byThem: Set<string>; truncated: boolean }> {
  const { asLow, asHigh, truncated } = await sidesWithStatus(ctx, networkId, personId, "requested")
  const blocked = await blockedCounterpartIds(ctx, personId)
  const byMe = new Set<string>()
  const byThem = new Set<string>()
  if (blocked.truncated) return { byMe, byThem, truncated: true }
  for (const row of [...asLow.slice(0, CONNECTIONS_SCAN), ...asHigh.slice(0, CONNECTIONS_SCAN)]) {
    const other = row.personIdLow === personId ? row.personIdHigh : row.personIdLow
    if (blocked.ids.has(other)) continue
    if (row.requestedByPersonId === personId) byMe.add(other)
    else byThem.add(other)
  }
  return { byMe, byThem, truncated }
}

/** Suis-je connecté à cette personne dans le réseau ? (une paire, une lecture) */
export async function isConnectedTo(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">, otherPersonId: Id<"persons">): Promise<boolean> {
  return (await findConnection(ctx, networkId, personId, otherPersonId))?.status === "accepted" && !(await isBlockedBetween(ctx, personId, otherPersonId))
}

/**
 * Les personnes avec qui un BLOCAGE existe, dans un sens ou dans l'autre, tous
 * réseaux confondus — le pendant ensembliste d'`isBlockedBetween`.
 */
export async function blockedCounterpartIds(ctx: ReadCtx, personId: Id<"persons">): Promise<BoundedIds> {
  const [asLow, asHigh, outgoing, incoming] = await Promise.all([
    ctx.db
      .query("connections")
      .withIndex("by_low_status", (q) => q.eq("personIdLow", personId).eq("status", "blocked"))
      .take(CONNECTIONS_SCAN + 1),
    ctx.db
      .query("connections")
      .withIndex("by_high_status", (q) => q.eq("personIdHigh", personId).eq("status", "blocked"))
      .take(CONNECTIONS_SCAN + 1),
    ctx.db.query("personBlocks").withIndex("by_blocker_createdAt", (q) => q.eq("blockerPersonId", personId)).take(CONNECTIONS_SCAN + 1),
    ctx.db.query("personBlocks").withIndex("by_target_createdAt", (q) => q.eq("targetPersonId", personId)).take(CONNECTIONS_SCAN + 1),
  ])
  const ids = new Set<string>()
  for (const row of asLow.slice(0, CONNECTIONS_SCAN)) ids.add(row.personIdHigh)
  for (const row of asHigh.slice(0, CONNECTIONS_SCAN)) ids.add(row.personIdLow)
  for (const row of outgoing.slice(0, CONNECTIONS_SCAN)) ids.add(row.targetPersonId)
  for (const row of incoming.slice(0, CONNECTIONS_SCAN)) ids.add(row.blockerPersonId)
  return { ids, truncated: [asLow, asHigh, outgoing, incoming].some((rows) => rows.length > CONNECTIONS_SCAN) }
}

/**
 * Les abonnements de la paire dans TOUS les réseaux, dans les deux sens (bornés :
 * une ligne par réseau commun et par sens). Au-delà de la borne, `overflow` :
 * l'appelant refuse sans écrire, comme pour les lignes de connexion de la paire.
 */
export async function pairFollows(ctx: ReadCtx, a: Id<"persons">, b: Id<"persons">) {
  const [aToB, bToA] = await Promise.all([
    // borné : une ligne par réseau commun aux deux personnes.
    ctx.db.query("follows").withIndex("by_follower_target", (q) => q.eq("followerPersonId", a).eq("targetPersonId", b)).take(PAIR_ROWS_MAX + 1),
    ctx.db.query("follows").withIndex("by_follower_target", (q) => q.eq("followerPersonId", b).eq("targetPersonId", a)).take(PAIR_ROWS_MAX + 1),
  ])
  return { rows: [...aToB, ...bToA], overflow: aToB.length > PAIR_ROWS_MAX || bToA.length > PAIR_ROWS_MAX }
}

/**
 * Suis-je abonné à cette personne dans le réseau ? Ce que cette réponse
 * N'OUVRE PAS : un abonnement ne donne accès qu'au `public`.
 */
export async function isFollowingPerson(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">, targetPersonId: Id<"persons">): Promise<boolean> {
  const row = await ctx.db
    .query("follows")
    .withIndex("by_network_follower_target", (q) => q.eq("networkId", networkId).eq("followerPersonId", personId).eq("targetPersonId", targetPersonId))
    .unique()
  return row !== null
}

/** Les personnes que je SUIS dans le réseau (n'ouvre que le `public`). */
export async function followedPersonIds(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">): Promise<BoundedIds> {
  const rows = await ctx.db
    .query("follows")
    .withIndex("by_network_follower_createdAt", (q) => q.eq("networkId", networkId).eq("followerPersonId", personId))
    .order("desc")
    .take(FOLLOWS_SCAN + 1)
  return { ids: new Set(rows.slice(0, FOLLOWS_SCAN).map((row) => row.targetPersonId)), truncated: rows.length > FOLLOWS_SCAN }
}
