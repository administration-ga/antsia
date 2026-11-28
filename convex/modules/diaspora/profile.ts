/**
 * Le profil d'un membre vu par DIASPORA.GA (EXF-DG-07, EXF-DG-08) : la facette
 * diaspora telle que le LECTEUR a le droit de la voir, champ par champ, selon
 * son niveau fin (moi seul, mes relations, les membres de mon pays, tout le
 * réseau) — règle `projectFacet` du domaine. Le reste du profil (nom,
 * identifiant, badges, images) vient du moteur (`getPublicProfile`).
 */
import { projectFacet, type FacetProjection } from "@diaspora-ga/domain"
import { v } from "convex/values"

import { networkQuery } from "../../lib/functions"
import { followerCounts } from "../graph/follows"
import { isBlockedBetween, isConnectedTo } from "../graph/graph"
import { findPublishedPersonByHandle } from "../people/miniProfile"
import { assertDiasporaNetwork, effectiveStatusIn, facetOf } from "./facts"

/** Une projection de facette : seulement les champs visibles du lecteur, jamais l'enregistrement. */
export const facetProjectionValidator = v.object({
  countryOfResidence: v.optional(v.string()),
  city: v.optional(v.string()),
  postSlug: v.optional(v.string()),
  associationIds: v.optional(v.array(v.string())),
  arrivedAt: v.optional(v.number()),
  helpAvailable: v.optional(v.boolean()),
})

/** La projection du domaine au format des validateurs (listes copiées). */
export function toProjection(projection: FacetProjection) {
  return {
    ...(projection.countryOfResidence !== undefined ? { countryOfResidence: projection.countryOfResidence } : {}),
    ...(projection.city !== undefined ? { city: projection.city } : {}),
    ...(projection.postSlug !== undefined ? { postSlug: projection.postSlug } : {}),
    ...(projection.associationIds !== undefined ? { associationIds: [...projection.associationIds] } : {}),
    ...(projection.arrivedAt !== undefined ? { arrivedAt: projection.arrivedAt } : {}),
    ...(projection.helpAvailable !== undefined ? { helpAvailable: projection.helpAvailable } : {}),
  }
}

/**
 * La facette d'un membre, désigné par son identifiant, pour le lecteur de la
 * session. `null` — indistinct — pour un identifiant inconnu, un profil non
 * publié, un non-membre ou un blocage dans la paire. L'aperçu « vu par un membre
 * d'un autre pays » (`?apercu=1`) n'est rendu qu'à la personne elle-même.
 */
export const memberFacet = networkQuery({
  args: { handle: v.string() },
  returns: v.union(v.null(), v.object({ fanCount: v.optional(v.number()), facet: facetProjectionValidator, preview: v.union(facetProjectionValidator, v.null()) })),
  handler: async (ctx, { handle }) => {
    assertDiasporaNetwork(ctx.network)
    const target = await findPublishedPersonByHandle(ctx, ctx.networkId, handle.trim().replace(/^@/, ""))
    if (!target) return null
    const isSelf = target._id === ctx.person._id
    if (!isSelf && (await isBlockedBetween(ctx, ctx.person._id, target._id))) return null
    const facet = await facetOf(ctx, ctx.networkId, target._id)
    if (!facet) return null

    const { status } = await effectiveStatusIn(ctx, ctx.network, ctx.person._id)
    const isActiveMember = status === "declaree" || status === "verifiee"
    const viewerFacet = isSelf ? facet : await facetOf(ctx, ctx.networkId, ctx.person._id)
    const viewer = {
      isSelf,
      isConnection: !isSelf && (await isConnectedTo(ctx, ctx.networkId, ctx.person._id, target._id)),
      isSameCountryMember: isActiveMember && viewerFacet?.countryOfResidence === facet.countryOfResidence,
      isActiveMember,
    }
    return {
      fanCount: await followerCounts.count(ctx, { namespace: `${ctx.networkId}:${target._id}` }),
      facet: toProjection(projectFacet(facet, viewer)),
      preview: isSelf
        ? toProjection(projectFacet(facet, { isSelf: false, isConnection: false, isSameCountryMember: false, isActiveMember: true }))
        : null,
    }
  },
})
