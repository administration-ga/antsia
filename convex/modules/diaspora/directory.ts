/**
 * Annuaire des membres de DIASPORA.GA (EXF-DG-19, EXF-DG-46) — opt-in, par niveau.
 *
 * La recherche générique du moteur (`searchPeople`) refuse ce réseau : le niveau
 * « pays » dépend du LECTEUR, que la projection générique `peopleDirectory` ne
 * connaît pas. Elle sert ici de PRÉ-FILTRE — `listed`, posé par la tranche au
 * choix d'un niveau visible (`syncDirectoryListing`) — et chaque candidat est
 * REJUGÉ par la règle du domaine (`isListedInDirectoryFor`) : niveau choisi,
 * consentement EN VIGUEUR (un retrait passé par le chemin générique compte
 * aussitôt), statut, pays du lecteur, blocage dans la paire. Un identifiant exact
 * passe par la même règle : masqué reste masqué, comme un identifiant inconnu.
 *
 * Le résultat ne porte que la facette PROJETÉE pour le lecteur (`projectFacet`),
 * aucune coordonnée — le contact passe par la messagerie. Une page bornée, sans
 * curseur : on affine la recherche, on ne parcourt pas l'annuaire.
 */
import { normalizeHandle } from "@antsia/social-domain/content"
import { foldSearchQuery } from "@antsia/social-domain/searchText"
import {
  type DiasporaFacet,
  DIRECTORY_PAGE_SIZE_MAX,
  type FacetProjection,
  isListedInDirectoryFor,
  isResidenceCountry,
  type MembershipStatus,
  normalizeCountryCode,
  projectFacet,
} from "@diaspora-ga/domain"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { networkQuery } from "../../lib/functions"
import { badgeValidator } from "../../lib/validators"
import { isBlockedBetween, isConnectedTo } from "../graph/graph"
import { isDiscoverablePerson, miniProfileCache } from "../people/miniProfile"
import { assertDiasporaNetwork, consentInForce, effectiveStatusIn, facetOf, privacyOf } from "./facts"
import { facetProjectionValidator, toProjection } from "./profile"

/** Une requête plus courte ne cherche pas : « chercher sans chercher » viderait l'annuaire. */
export const DIRECTORY_QUERY_MIN_LENGTH = 2

/** Candidats lus par recherche, avant la règle : une borne de lecture, pas un parcours. */
const DIRECTORY_SCAN = 60

export const directoryEntryValidator = v.object({
  personId: v.id("persons"),
  handle: v.string(),
  displayName: v.string(),
  headline: v.union(v.string(), v.null()),
  avatarUrl: v.union(v.string(), v.null()),
  badges: v.array(badgeValidator),
  /** Les seuls champs de la facette que le lecteur a le droit de voir. */
  facet: facetProjectionValidator,
})

/** Le lecteur, tel que la règle de l'annuaire le juge. */
export interface DirectoryReader {
  readonly personId: Id<"persons">
  readonly status: MembershipStatus
  readonly facet: DiasporaFacet
}

/** Le lecteur de la session : membre actif, avec sa facette ; sinon `null`. */
export async function directoryReader(
  ctx: QueryCtx,
  network: Doc<"networks">,
  personId: Id<"persons">,
): Promise<DirectoryReader | null> {
  const [facet, { status }] = await Promise.all([facetOf(ctx, network._id, personId), effectiveStatusIn(ctx, network, personId)])
  return facet && status ? { personId, status, facet } : null
}

/** Un membre que l'annuaire montre au lecteur : sa facette entière (pour juger) et ce que le lecteur en voit. */
export interface ListedMember {
  readonly personId: Id<"persons">
  readonly facet: DiasporaFacet
  readonly projection: FacetProjection
}

/**
 * LA règle de l'annuaire, pour un candidat : profil découvrable, niveau choisi,
 * consentement EN VIGUEUR, statut, pays du lecteur, blocage dans la paire —
 * puis la facette projetée pour le lecteur. `null` : absent pour ce lecteur.
 */
export async function listedMemberFor(
  ctx: QueryCtx,
  network: Doc<"networks">,
  reader: DirectoryReader,
  personId: Id<"persons">,
): Promise<ListedMember | null> {
  const isSelf = personId === reader.personId
  const [person, privacy, facet] = await Promise.all([ctx.db.get(personId), privacyOf(ctx, network._id, personId), facetOf(ctx, network._id, personId)])
  if (!person || !isDiscoverablePerson(person) || !privacy || !facet) return null
  const { status } = await effectiveStatusIn(ctx, network, personId)
  if (!status) return null
  const listed = isListedInDirectoryFor(
    {
      status,
      visibility: privacy.directoryVisibility,
      consentActive: await consentInForce(ctx, network._id, personId, "directory"),
      country: facet.countryOfResidence,
    },
    {
      status: reader.status,
      country: reader.facet.countryOfResidence,
      isSelf,
      blockedWithTarget: !isSelf && (await isBlockedBetween(ctx, reader.personId, personId)),
    },
  )
  if (!listed) return null
  const projection = projectFacet(facet, {
    isSelf,
    isConnection: !isSelf && (await isConnectedTo(ctx, network._id, reader.personId, personId)),
    isSameCountryMember: reader.facet.countryOfResidence === facet.countryOfResidence,
    isActiveMember: true,
  })
  return { personId, facet, projection }
}

/**
 * Chercher un membre par son nom ou son identifiant, parmi ceux qui ont choisi
 * d'être trouvés par ce lecteur. Réservé aux membres actifs (« déclaré » ou
 * « vérifié ») : un compte en attente lit le réseau, il ne consulte pas
 * l'annuaire. Le filtre de pays restreint, il n'ouvre jamais rien.
 */
export const searchMembers = networkQuery({
  minStatus: "declaree",
  args: { query: v.string(), country: v.optional(v.string()) },
  returns: v.array(directoryEntryValidator),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    const term = args.query.trim().replace(/^@/, "")
    if (term.length < DIRECTORY_QUERY_MIN_LENGTH) return []
    const only = args.country === undefined ? null : normalizeCountryCode(args.country)
    if (only !== null && !isResidenceCountry(only)) return []
    const reader = await directoryReader(ctx, ctx.network, ctx.person._id)
    if (!reader) return []

    const rows = await ctx.db
      .query("peopleDirectory")
      .withSearchIndex("search_name", (q) => q.search("searchName", foldSearchQuery(term)).eq("networkId", ctx.networkId).eq("listed", true))
      .take(DIRECTORY_SCAN)
    const candidates: Id<"persons">[] = rows.map((row) => row.personId)
    // L'identifiant est une ADRESSE : cherché exactement, en tête — et jugé par la même règle.
    const exact = await ctx.db
      .query("persons")
      .withIndex("by_handle", (q) => q.eq("handle", normalizeHandle(term)))
      .unique()
    if (exact && !candidates.includes(exact._id)) candidates.unshift(exact._id)

    const profileOf = miniProfileCache(ctx)
    const entries: (typeof directoryEntryValidator.type)[] = []
    for (const personId of candidates) {
      if (entries.length >= DIRECTORY_PAGE_SIZE_MAX) break
      const member = await listedMemberFor(ctx, ctx.network, reader, personId)
      if (!member || (only !== null && member.facet.countryOfResidence !== only)) continue
      const profile = await profileOf(personId)
      if (!profile.handle || !profile.displayName) continue
      entries.push({
        personId,
        handle: profile.handle,
        displayName: profile.displayName,
        headline: profile.headline,
        avatarUrl: profile.avatarUrl,
        badges: profile.badges,
        facet: toProjection(member.projection),
      })
    }
    return entries
  },
})
