// Dupliqué de socle/convex/modules/reseauPersonnel/suggestions.ts @ ad2e7fdc2 — adaptations : catalogue PAR RÉSEAU, puisé dans l'annuaire du réseau (`peopleDirectory`, membres découvrables, D17) — un réseau gouverné par une tranche sert ses propres suggestions (refus `policyRefused`, comme le rail) ; poste et organisation (`resolvePostIdentities`) remplacés par le titre (`headline`) de la personne ; avatar par la garde des fichiers (D05, plus de `getUrl` brut) ; personnes nommées par le mini-profil publié ; masquage par réseau ; `listDismissed` paginée (D19) ; `listSentInvitations` RÉÉCRITE en pagination native sur un index du demandeur (au lieu de deux balayages bornés filtrés) ; adhésion par le constructeur (au lieu d'`assertNotSuspended`) ; refus à code ; débit sur `dismiss` et `restore` (D14) ; étude du 22/10/2026 (ADR-0037) : chaque carte dit si la personne suit déjà l'appelant (`followsYou`), pour « Suivre en retour ».
/**
 * Le CATALOGUE des suggestions d'un réseau — la destination de « Voir tout »,
 * à côté du rail (`graph.follows.suggestions`, cinq noms) — et l'état SERVEUR
 * des demandes en attente : une carte ne se repropose pas au rechargement
 * comme si rien n'était parti, et masquer survit au montage.
 *
 * ⚠️ La source reste l'annuaire du réseau, et nulle part ailleurs : suggérer
 * quelqu'un qui ne s'est pas exposé serait l'exposer à sa place. Aucun score
 * d'affinité — les arrivées les plus récentes d'abord, et c'est tout.
 *
 * ⚠️ UNE pagination par exécution, le filtrage APRÈS la page : une page peut ne
 * rendre que deux personnes sur vingt examinées ; le curseur natif et `isDone`
 * restent justes, l'écran redemande (le patron du fil).
 */
import { paginationOptsValidator, type PaginationResult } from "convex/server"
import { v } from "convex/values"

import type { Id } from "../../_generated/dataModel"
import { fail, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { acceptedCounterpartIds, blockedCounterpartIds, followedPersonIds, isBlockedBetween, isConnectedTo, isFollowingPerson, pendingCounterpartIds } from "../graph/graph"
import { findPublishedPersonByHandle, isDiscoverablePerson, miniProfileCache } from "../people/miniProfile"

/** Pages du catalogue et des listes, plafond dur. */
const PAGE_MAX = 50

const clampPage = (opts: { numItems: number; cursor: string | null }) => ({ ...opts, numItems: Math.min(Math.max(Math.trunc(opts.numItems), 1), PAGE_MAX) })

/**
 * L'état de la relation avec un candidat, vu du SERVEUR. `none` dit qu'aucune
 * demande n'attend, dans un sens ni dans l'autre ; les connexions, blocages et
 * abonnements n'arrivent jamais jusqu'ici.
 */
export type SuggestionRelationState = "none" | "requested_by_me" | "requested_by_them"

export type SuggestionCatalogItem = {
  personId: Id<"persons">
  handle: string
  displayName: string
  headline: string | null
  avatarUrl: string | null
  relationState: SuggestionRelationState
  /** La personne suit déjà l'appelant dans ce réseau : l'écran propose « Suivre en retour ». */
  followsYou: boolean
  /** Masquée par l'appelant — rendue seulement avec `includeDismissed`. */
  dismissed: boolean
}

/**
 * Le catalogue paginé. Écartés APRÈS la page : soi, les profils non
 * découvrables, les connexions acceptées, les blocages (dans un sens comme dans
 * l'autre, tous réseaux), les personnes déjà suivies, et les masquées — sauf
 * `includeDismissed`, qui les rend AVEC leur drapeau. Une demande en attente est
 * RENDUE avec son `relationState` : c'est ce qui laisse répondre depuis le
 * catalogue plutôt que d'en proposer une seconde.
 */
export const paginate = networkQuery({
  args: { paginationOpts: paginationOptsValidator, includeDismissed: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<PaginationResult<SuggestionCatalogItem>> => {
    if (ctx.network.managedBy !== undefined) return fail("policyRefused")
    const me = ctx.person._id
    const [page, connected, blocked, followed, pending] = await Promise.all([
      ctx.db
        .query("peopleDirectory")
        .withIndex("by_network_listed", (q) => q.eq("networkId", ctx.networkId).eq("listed", true))
        .order("desc")
        .paginate(clampPage(args.paginationOpts)),
      acceptedCounterpartIds(ctx, ctx.networkId, me),
      blockedCounterpartIds(ctx, me),
      followedPersonIds(ctx, ctx.networkId, me),
      pendingCounterpartIds(ctx, ctx.networkId, me),
    ])
    const profileOf = miniProfileCache(ctx)
    const kept: SuggestionCatalogItem[] = []
    for (const row of page.page) {
      const id = row.personId
      if (id === me) continue
      // Un ensemble tronqué se relit par paire : une relation n'est jamais une lacune.
      if (connected.ids.has(id) || (connected.truncated && (await isConnectedTo(ctx, ctx.networkId, me, id)))) continue
      if (blocked.ids.has(id) || (blocked.truncated && (await isBlockedBetween(ctx, me, id)))) continue
      if (followed.ids.has(id) || (followed.truncated && (await isFollowingPerson(ctx, ctx.networkId, me, id)))) continue
      const dismissed =
        (await ctx.db
          .query("suggestionDismissals")
          .withIndex("by_network_person_dismissed", (q) => q.eq("networkId", ctx.networkId).eq("personId", me).eq("dismissedPersonId", id))
          .first()) !== null
      if (dismissed && args.includeDismissed !== true) continue
      const person = await ctx.db.get(id)
      if (!person || !isDiscoverablePerson(person) || !person.handle || !person.displayName) continue
      const profile = await profileOf(id)
      // Une lecture par carte gardée, sur l'index unique du suivi (page bornée à 50).
      const followsYou = await isFollowingPerson(ctx, ctx.networkId, id, me)
      kept.push({
        personId: id,
        handle: person.handle,
        displayName: person.displayName,
        headline: person.headline ?? null,
        avatarUrl: profile.avatarUrl,
        relationState: pending.byMe.has(id) ? "requested_by_me" : pending.byThem.has(id) ? "requested_by_them" : "none",
        followsYou,
        dismissed,
      })
    }
    return { ...page, page: kept }
  },
})

/**
 * « Ne me proposez plus cette personne » — durable, réversible, idempotent.
 * Par l'identifiant, la seule prise d'une carte. La PUBLICATION suffit (pas la
 * découvrabilité) : quelqu'un passé en privé depuis doit pouvoir être masqué.
 * ⚠️ Ce geste ne BLOQUE rien et ne dit rien à l'autre.
 */
export const dismiss = networkMutation({
  minStatus: "en_attente",
  args: { handle: v.string() },
  returns: v.object({ targetPersonId: v.id("persons"), dismissed: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "suggestion.dismiss", ctx.person._id)
    const found = await findPublishedPersonByHandle(ctx, ctx.networkId, args.handle)
    if (!found) return notFound()
    if (found._id === ctx.person._id) return fail("invalidArgument", { field: "handle" })
    const existing = await ctx.db
      .query("suggestionDismissals")
      .withIndex("by_network_person_dismissed", (q) => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id).eq("dismissedPersonId", found._id))
      .first()
    if (!existing) await ctx.db.insert("suggestionDismissals", { networkId: ctx.networkId, personId: ctx.person._id, dismissedPersonId: found._id, createdAt: Date.now() })
    return { targetPersonId: found._id, dismissed: true as const }
  },
})

/** Rouvrir une suggestion masquée — idempotent : ce qui n'était pas masqué rend `false`, sans lever. */
export const restore = networkMutation({
  minStatus: "en_attente",
  args: { targetPersonId: v.id("persons") },
  returns: v.object({ restored: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "suggestion.dismiss", ctx.person._id)
    const row = await ctx.db
      .query("suggestionDismissals")
      .withIndex("by_network_person_dismissed", (q) => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id).eq("dismissedPersonId", args.targetPersonId))
      .first()
    if (!row) return { restored: false }
    await ctx.db.delete(row._id)
    return { restored: true }
  },
})

export type DismissedSuggestionDto = { targetPersonId: Id<"persons">; handle: string | null; displayName: string | null; headline: string | null; avatarUrl: string | null; at: number }

/**
 * Les personnes que j'ai masquées dans ce réseau — pour les rouvrir. Le profil
 * est RELU à l'affichage, jamais recopié : une personne dépubliée redevient un
 * nom neutre, comme partout ailleurs. Un réseau gouverné sert sa propre liste,
 * dont la projection applique les règles d'annuaire de sa tranche.
 */
export const paginateDismissed = networkQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<DismissedSuggestionDto>> => {
    if (ctx.network.managedBy !== undefined) return fail("policyRefused")
    const result = await ctx.db
      .query("suggestionDismissals")
      .withIndex("by_network_person_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id))
      .order("desc")
      .paginate(clampPage(args.paginationOpts))
    const profileOf = miniProfileCache(ctx)
    const page: DismissedSuggestionDto[] = []
    for (const row of result.page) {
      const person = await profileOf(row.dismissedPersonId)
      page.push({ targetPersonId: row.dismissedPersonId, handle: person.handle, displayName: person.displayName, headline: person.headline, avatarUrl: person.avatarUrl, at: row.createdAt })
    }
    return { ...result, page }
  },
})

export type SentInvitationDto = {
  connectionId: Id<"connections">
  otherPersonId: Id<"persons">
  handle: string | null
  displayName: string | null
  headline: string | null
  avatarUrl: string | null
  at: number
}

/**
 * MES demandes de connexion SORTANTES dans ce réseau, encore sans réponse —
 * la même donnée que le `relationState` « requested_by_me » du catalogue, lue
 * par un index du demandeur et paginée.
 */
export const paginateSentInvitations = networkQuery({
  minStatus: "en_attente",
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<SentInvitationDto>> => {
    const result = await ctx.db
      .query("connections")
      .withIndex("by_network_requester_status", (q) => q.eq("networkId", ctx.networkId).eq("requestedByPersonId", ctx.person._id).eq("status", "requested"))
      .order("desc")
      .paginate(clampPage(args.paginationOpts))
    const profileOf = miniProfileCache(ctx)
    const page: SentInvitationDto[] = []
    for (const row of result.page) {
      const other = row.recipientPersonId
      const person = await profileOf(other)
      page.push({ connectionId: row._id, otherPersonId: other, handle: person.handle, displayName: person.displayName, headline: person.headline, avatarUrl: person.avatarUrl, at: row.requestedAt })
    }
    return { ...result, page }
  },
})
