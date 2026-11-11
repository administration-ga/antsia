// Dupliqué de socle/convex/modules/reseauPersonnel/people.ts (l. 547-650, `searchPeople`) @ ad2e7fdc2 — adaptations : annuaire PAR RÉSEAU — projection cherchable dénormalisée (`peopleDirectory`, `filterFields: ["networkId", "listed"]`) au lieu d'un index global des profils, pour ne jamais rendre un non-membre ni une personne d'un autre réseau ; recherche repliée sans accents (`foldSearchQuery`) ; badges calculés joints ; garde d'adhésion par le constructeur au lieu d'`assertNotSuspended` ; blocage lu sur toute la paire (tous réseaux) ; annuaire OPT-IN d'un réseau gouverné par une tranche (`directoryListed`, chemin générique refusé, resynchronisation par lots).
/**
 * L'annuaire d'un réseau : chercher une personne parmi les MEMBRES qui ont
 * choisi d'être trouvés (profil publié, non privé).
 *
 * Une requête vide ne rend RIEN — délibérément : « chercher sans chercher »
 * serait un déversement de l'annuaire. L'identifiant est une ADRESSE : il se
 * cherche aussi EXACTEMENT, en plus de la ressemblance du nom.
 */
import type { Badge } from "@antsia/social-domain/badges"
import { normalizeHandle } from "@antsia/social-domain/content"
import { isActiveStatus } from "@antsia/social-domain/membership"
import { buildSearchableText, foldSearchQuery } from "@antsia/social-domain/searchText"
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import { canReadModeratedContent } from "../moderation/policy"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../_generated/server"
import { effectiveMembershipStatus, isActiveMember } from "../../lib/access"
import { fail } from "../../lib/errors"
import { networkQuery } from "../../lib/functions"
import { badgeValidator } from "../../lib/validators"
import { servableUrl } from "../files/storageGuard"
import { isBlockedBetween } from "../graph/graph"
import { judicialDelistReader } from "../moderation/judicialHolds"
import { isDiscoverablePerson } from "./miniProfile"
import { badgesOf } from "./persons"

const SEARCH_LIMIT_DEFAULT = 10
const SEARCH_LIMIT_MAX = 25

/**
 * Recalcule les lignes d'annuaire d'une personne : une par adhésion ACTIVE
 * (réseau actif), `listed` si le profil est découvrable et la racine non
 * suspendue — et, pour un réseau GOUVERNÉ par une tranche, si la personne a
 * choisi d'y paraître (`directoryListed`, annuaire opt-in) ; les lignes des
 * adhésions closes disparaissent. Idempotent, borné (une personne appartient à
 * peu de réseaux), sans écriture inutile. À appeler après tout changement de
 * profil, de statut d'adhésion ou de choix d'annuaire.
 */
export async function syncPersonDirectory(ctx: MutationCtx, personId: Id<"persons">): Promise<void> {
  const person = await ctx.db.get(personId)
  // borné : une personne appartient à peu de réseaux ; 200 lignes au plus.
  const rows = await ctx.db
    .query("peopleDirectory")
    .withIndex("by_person", (q) => q.eq("personId", personId))
    .take(200)
  const wanted = new Map<Id<"networks">, boolean>()
  if (person) {
    const discoverable = isDiscoverablePerson(person)
    const memberships: Doc<"networkMemberships">[] = []
    for (const status of ["en_attente", "declaree", "verifiee", "suspendue"] as const) {
      // borné : une personne appartient à peu de réseaux ; 200 par statut au plus.
      memberships.push(
        ...(await ctx.db
          .query("networkMemberships")
          .withIndex("by_person_and_status", (q) => q.eq("personId", personId).eq("status", status))
          .take(200)),
      )
    }
    const rootSuspended = await rootIsSuspended(ctx, memberships)
    for (const membership of memberships) {
      if (!isActiveStatus(effectiveMembershipStatus(membership) ?? "partie")) continue
      const network = await ctx.db.get(membership.networkId)
      if (!network || network.status !== "active") continue
      const optedIn = network.managedBy === undefined || membership.directoryListed === true
      wanted.set(network._id, discoverable && !rootSuspended && optedIn)
    }
  }
  const searchName = person ? buildSearchableText(person.displayName, person.handle) : ""
  const now = Date.now()
  for (const row of rows) {
    const listed = wanted.get(row.networkId)
    if (listed === undefined) {
      await ctx.db.delete(row._id)
      continue
    }
    wanted.delete(row.networkId)
    if (row.listed !== listed || row.searchName !== searchName) await ctx.db.patch(row._id, { listed, searchName, updatedAt: now })
  }
  for (const [networkId, listed] of wanted) {
    await ctx.db.insert("peopleDirectory", { networkId, personId, searchName, listed, updatedAt: now })
  }
}

/** Lignes d'annuaire relues par lot de resynchronisation. */
const RESYNC_BATCH = 100

/**
 * Resynchronise l'annuaire d'un réseau, par lots chaînés : après un changement
 * de règle d'inscription (réseau devenu gouverné, annuaire passé en opt-in),
 * les lignes déjà écrites suivent. Idempotent.
 */
export const resyncNetworkDirectory = internalMutation({
  args: { networkId: v.id("networks"), cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.object({ resynced: v.number(), done: v.boolean() }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("peopleDirectory")
      .withIndex("by_network_and_person", (q) => q.eq("networkId", args.networkId))
      .paginate({ cursor: args.cursor ?? null, numItems: RESYNC_BATCH })
    for (const row of page.page) await syncPersonDirectory(ctx, row.personId)
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.modules.people.directory.resyncNetworkDirectory, { networkId: args.networkId, cursor: page.continueCursor })
    return { resynced: page.page.length, done: page.isDone }
  },
})

async function rootIsSuspended(ctx: MutationCtx, memberships: readonly Doc<"networkMemberships">[]): Promise<boolean> {
  for (const membership of memberships) {
    if (effectiveMembershipStatus(membership) !== "suspendue") continue
    const network = await ctx.db.get(membership.networkId)
    if (network?.kind === "root") return true
  }
  return false
}

const personHitValidator = v.object({
  personId: v.id("persons"),
  handle: v.string(),
  displayName: v.string(),
  headline: v.union(v.string(), v.null()),
  avatarUrl: v.union(v.string(), v.null()),
  badges: v.array(badgeValidator),
})

type PersonHit = { personId: Id<"persons">; handle: string; displayName: string; headline: string | null; avatarUrl: string | null; badges: Badge[] }

/**
 * Chercher une personne parmi les membres découvrables du réseau. Jamais soi-même.
 * Un réseau GOUVERNÉ par une tranche sert son propre annuaire (opt-in, règles
 * de l'application) : le chemin générique le refuse, comme l'entrée.
 */
export const searchPeople = networkQuery({
  args: { query: v.string(), limit: v.optional(v.number()) },
  returns: v.array(personHitValidator),
  handler: async (ctx, args) => {
    if (ctx.network.managedBy !== undefined) return fail("policyRefused")
    const term = args.query.trim()
    if (term.length === 0) return []
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? SEARCH_LIMIT_DEFAULT), 1), SEARCH_LIMIT_MAX)

    const byName = await ctx.db
      .query("peopleDirectory")
      .withSearchIndex("search_name", (q) => q.search("searchName", foldSearchQuery(term)).eq("networkId", ctx.networkId).eq("listed", true))
      .take(limit)
    const personIds = byName.map((row) => row.personId)

    // L'identifiant est une ADRESSE : cherché exactement, en tête des résultats.
    const exact = await ctx.db
      .query("persons")
      .withIndex("by_handle", (q) => q.eq("handle", normalizeHandle(term)))
      .unique()
    if (exact && isDiscoverablePerson(exact) && !personIds.includes(exact._id) && (await isActiveMember(ctx, ctx.networkId, exact._id))) {
      personIds.unshift(exact._id)
    }

    const hits: PersonHit[] = []
    // SU01h : un profil déréférencé sur ordre du juge sort de la recherche, sans être retiré.
    const delisted = await judicialDelistReader(ctx)
    for (const personId of personIds.slice(0, limit)) {
      if (personId === ctx.person._id || await delisted("person", personId)) continue
      // Un blocage, dans un sens ou dans l'autre, retire la personne de l'annuaire.
      if (await isBlockedBetween(ctx, ctx.person._id, personId)) continue
      const person = await ctx.db.get(personId)
      if (!person || !isDiscoverablePerson(person) || !person.handle || !person.displayName || !(await canReadModeratedContent(ctx, "person", person._id, ctx.person._id))) continue
      hits.push({
        personId,
        handle: person.handle,
        displayName: person.displayName,
        headline: person.headline ?? null,
        avatarUrl: person.avatarStorageId ? await servableUrl(ctx, person.avatarStorageId) : null,
        badges: await badgesOf(ctx, personId),
      })
    }
    return hits
  },
})
