// Dupliqué de socle/convex/modules/iappel/presence.ts (avec socle/convex/functions/agentPresence.ts, l. 10-140 et 204-249) @ ad2e7fdc2 — adaptations : présence PAR PERSONNE dans un réseau (verrous V18 à V20 levés : ni organisation, ni appels déclarés par l'écran, ni pointage, ni planning — `presenceTransitions` exclu) ; `heartbeat` et `setOffline` bornés par le réseau et par le débit, le battement de trop SE TAIT (`beatWithinRateLimit`, comme les baux du direct : rien d'écrit, aucune exception ; les refus du constructeur lèvent toujours) ; `forMyConnections` sur les relations ACCEPTÉES du réseau lues par le graphe (bornées, lacune dite — le socle listait toutes les connexions puis tronquait la sortie, D19), « ne pas déranger » lu sans portée, « en appel » lu sur les lignes vivantes de participation du RÉSEAU (groupe compris), instant fourni par l'écran (D16) ; `offlineHints` sur la présence du réseau ; `forOrgContacts`, `forOrgMembers`, `listOnlineAgents`, `countAvailableAgents` (lectures SANS garde, D26), `getMine`, `setDnd`, `isAvailable` et le rattrapage multi-appels exclus ; nettoyage indexé par `lastHeartbeat` et poursuivi par chaîne (le socle balayait 500 lignes de toute la table, D26).
/**
 * Appels — la PRÉSENCE : ce que mes relations voient de moi, et ce qui prouve
 * que je suis hors ligne.
 *
 * Ce n'est PAS un annuaire : la pastille n'est rendue qu'à des relations
 * ÉTABLIES du réseau, jamais à qui consulte un profil ; et le partage se coupe
 * (`sharePresence: false`) — la personne est alors ABSENTE de la réponse, pas
 * « disponible » (ce serait déjà une information).
 *
 * Une relation absente de la réponse ne veut rien dire de plus que « on ne sait
 * pas » — jamais « hors ligne ». « Hors ligne » est un CONSTAT servi à part
 * (`offlineHints`), preuves en main : une ligne existe, et elle s'est tue.
 */
import { PRESENCE_FRESHNESS_MS, type RelationPresenceStatus } from "@antsia/social-contracts/calls"
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { internalMutation, type QueryCtx } from "../../_generated/server"
import { networkMutation, networkQuery } from "../../lib/functions"
import { beatWithinRateLimit } from "../../lib/rateLimit"
import { acceptedCounterpartIds } from "../graph/graph"
import { countLiveCalls } from "./evaluate"

/**
 * Relations EXAMINÉES par lecture : au-delà, elles sont absentes de la réponse,
 * comme toute relation dont on ne sait rien — et la lacune est DITE (`truncated`).
 */
const MAX_RELATIONS_EXAMINED = 100
/** Présences éteintes par passage du nettoyage. */
const PRESENCE_CLEANUP_BATCH = 200

/** Les relations acceptées du réseau à examiner, bornées, et si la liste a été coupée. */
async function examinedRelations(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, me: Id<"persons">): Promise<{ ids: Id<"persons">[]; truncated: boolean }> {
  const accepted = await acceptedCounterpartIds(ctx, networkId, me)
  const ids = [...accepted.ids] as Id<"persons">[]
  return { ids: ids.slice(0, MAX_RELATIONS_EXAMINED), truncated: accepted.truncated || ids.length > MAX_RELATIONS_EXAMINED }
}

/** La personne partage-t-elle sa présence ? Absent = oui. */
async function sharesPresence(ctx: Pick<QueryCtx, "db">, personId: Id<"persons">): Promise<{ shares: boolean; dndUntil: number | null }> {
  const prefs = await ctx.db
    .query("callPreferences")
    .withIndex("by_person", (q) => q.eq("personId", personId))
    .unique()
  return { shares: prefs?.sharePresence !== false, dndUntil: prefs?.dnd?.until ?? null }
}

/**
 * Un écran ouvert du réseau signale qu'il est là — toutes les 30 secondes.
 *
 * Le battement de TROP (seau `presence.heartbeat`, partagé avec `setOffline`)
 * se tait : `null`, sans écrire. Plusieurs onglets du même compte, ou des pages
 * rechargées coup sur coup, vident le seau sans faute de personne, et le client
 * Convex inscrirait chaque refus en console (« Server Error »). La présence n'y
 * perd rien : le battement précédent est encore frais, le suivant passera.
 */
export const heartbeat = networkMutation({
  minStatus: "en_attente",
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const me = ctx.person._id
    if (!(await beatWithinRateLimit(ctx, "presence.heartbeat", me))) return null
    const now = Date.now()
    const existing = await ctx.db
      .query("personPresence")
      .withIndex("by_network_person", (q) => q.eq("networkId", ctx.networkId).eq("personId", me))
      .unique()
    if (existing) await ctx.db.patch(existing._id, { status: "online", lastHeartbeat: now })
    else await ctx.db.insert("personPresence", { networkId: ctx.networkId, personId: me, status: "online", lastHeartbeat: now })
    return null
  },
})

/**
 * L'écran se ferme : « hors ligne » tout de suite, sans attendre que le battement se taise.
 * De trop, il se tait comme le battement : la ligne reste « en ligne » jusqu'au nettoyage.
 */
export const setOffline = networkMutation({
  minStatus: "en_attente",
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const me = ctx.person._id
    if (!(await beatWithinRateLimit(ctx, "presence.heartbeat", me))) return null
    const existing = await ctx.db
      .query("personPresence")
      .withIndex("by_network_person", (q) => q.eq("networkId", ctx.networkId).eq("personId", me))
      .unique()
    if (existing && existing.status !== "offline") await ctx.db.patch(existing._id, { status: "offline" })
    return null
  },
})

/**
 * La pastille de mes relations du réseau, clé = identifiant de personne :
 *  1. partage coupé → ABSENTE ;
 *  2. « ne pas déranger » actif à l'instant fourni → `dnd` ;
 *  3. au moins un appel établi dans le réseau → `in_call` ;
 *  4. sinon → `available`.
 * L'instant vient de l'écran (arrondi à la seconde : la souscription reste cachable).
 */
export const forMyConnections = networkQuery({
  args: { now: v.number() },
  handler: async (ctx, args): Promise<{ statuses: Record<string, RelationPresenceStatus>; truncated: boolean }> => {
    const { ids, truncated } = await examinedRelations(ctx, ctx.networkId, ctx.person._id)
    const statuses: Record<string, RelationPresenceStatus> = {}
    for (const personId of ids) {
      const { shares, dndUntil } = await sharesPresence(ctx, personId)
      if (!shares) continue
      if (dndUntil !== null && dndUntil > args.now) {
        statuses[personId] = "dnd"
        continue
      }
      statuses[personId] = (await countLiveCalls(ctx, ctx.networkId, personId)) > 0 ? "in_call" : "available"
    }
    return { statuses, truncated }
  },
})

/**
 * Parmi mes relations du réseau, celles dont on peut PROUVER qu'elles sont hors
 * ligne : une ligne de présence existe, et elle n'est ni en ligne ni fraîche.
 * Aucune ligne = « on ne sait pas » = rien. Même contrat de confidentialité que
 * la pastille : partage coupé = rien, pas même une absence. Le « dnd » et le
 * « en appel » réactifs priment toujours sur cet indice côté écran.
 */
export const offlineHints = networkQuery({
  args: { now: v.number() },
  handler: async (ctx, args): Promise<{ offline: Id<"persons">[]; truncated: boolean }> => {
    const { ids, truncated } = await examinedRelations(ctx, ctx.networkId, ctx.person._id)
    const offline: Id<"persons">[] = []
    for (const personId of ids) {
      if (!(await sharesPresence(ctx, personId)).shares) continue
      const row = await ctx.db
        .query("personPresence")
        .withIndex("by_network_person", (q) => q.eq("networkId", ctx.networkId).eq("personId", personId))
        .unique()
      if (row && !(row.status === "online" && args.now - row.lastHeartbeat <= PRESENCE_FRESHNESS_MS)) offline.push(personId)
    }
    return { offline, truncated }
  },
})

/**
 * Le passage périodique (toutes les 60 s) : les présences « en ligne » dont le
 * battement s'est tu passent « hors ligne ». Lecture INDEXÉE par l'instant du
 * dernier battement (D26), poursuivie par chaîne tant qu'un lot est plein.
 */
export const cleanupStalePresence = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const cutoff = Date.now() - PRESENCE_FRESHNESS_MS
    const stale = await ctx.db
      .query("personPresence")
      .withIndex("by_status_lastHeartbeat", (q) => q.eq("status", "online").lt("lastHeartbeat", cutoff))
      .take(PRESENCE_CLEANUP_BATCH)
    for (const row of stale) await ctx.db.patch(row._id, { status: "offline" })
    if (stale.length === PRESENCE_CLEANUP_BATCH) await ctx.scheduler.runAfter(0, internal.modules.calls.presence.cleanupStalePresence, {})
    return null
  },
})
