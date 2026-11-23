/**
 * CH-815 (ADR-0042, amendement « Routage des signalements par pays ») — à quelle équipe de modération revient un
 * contenu : la règle pure `chooseModerationTeam` (`@antsia/social-domain/moderationRouting` : pays du contenu,
 * puis nature), nourrie des équipes ACTIVES du réseau et du pays que porte le contenu. Aucune fonction Convex.
 *
 * Appelants, tous ceux qui choisissent une équipe : `cases.report` et l'ancienne porte des publications
 * (`moderation.reportPost`, `reportComment`) à la création du dossier ; la relecture préalable
 * (`cases.paginatePending`, `cases.reviewContent`, `reviewProjection.preview`, `policy.canReadModeratedContent`,
 * le guichet `diaspora/moderationDesk.pendingQueue`) ; les revendications de page (`pages/claims`). Le dossier
 * garde l'équipe choisie à sa création (`reports.teamId`) ; la compétence se relit à l'acte (`cases.teamCapacity`).
 *
 * Le pays est celui du CONTENU, jamais celui d'une personne (ni du déclarant ni de l'auteur) : la même définition
 * que le guichet par pays (`diaspora/moderationCountry`). Il n'est lu que si une équipe active du réseau porte un
 * pays : un réseau sans équipe d'un pays (la racine, tout réseau sans tranche) relit exactement ce qu'il relisait
 * et choisit exactement l'équipe d'avant (la nature, puis l'équipe sans nature).
 */
import { chooseModerationTeam, routesByCountry } from "@antsia/social-domain/moderationRouting"
import type { ModerationSurface } from "@antsia/social-domain/moderationPolicy"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { moderationContentCountry } from "../diaspora/moderationCountry"

type ReadCtx = Pick<QueryCtx, "db">
type ModerationTeam = Doc<"moderationTeams">

/** Équipes actives au plus par réseau (`cases.createNetworkTeam`) ; au-delà, chaque appelant garde son refus. */
export const MODERATION_TEAMS_MAX = 100

/**
 * Les équipes ACTIVES du réseau, de la plus ancienne à la plus récente (ordre de l'index), bornées à
 * `MODERATION_TEAMS_MAX + 1` : l'appelant juge le dépassement comme avant (refus, ou aucune compétence d'équipe).
 */
export async function activeModerationTeams(ctx: ReadCtx, networkId: Id<"networks">): Promise<ModerationTeam[]> {
  return await ctx.db.query("moderationTeams").withIndex("by_network_active", (q) => q.eq("networkId", networkId).eq("active", true)).take(MODERATION_TEAMS_MAX + 1)
}

/** Le pays du contenu pour le routage : `null` sans lecture quand aucune de ces équipes ne porte de pays. */
export async function routingCountryOf(ctx: ReadCtx, networkId: Id<"networks">, kind: ModerationSurface, id: string, teams: readonly ModerationTeam[]): Promise<string | null> {
  return routesByCountry(teams) ? await moderationContentCountry(ctx, networkId, kind, id) : null
}

/** L'équipe qui reçoit ce contenu parmi `teams` (équipes actives du réseau, ordre de l'index), sinon `undefined` : le réseau. */
export async function routeModerationContent(ctx: ReadCtx, networkId: Id<"networks">, kind: ModerationSurface, id: string, teams: readonly ModerationTeam[]): Promise<ModerationTeam | undefined> {
  return chooseModerationTeam(teams, kind, await routingCountryOf(ctx, networkId, kind, id, teams))
}
