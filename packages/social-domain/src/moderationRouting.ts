/**
 * CH-815 (ADR-0042, amendement « Routage des signalements par pays ») — à quelle équipe de modération revient
 * un contenu. Règle PURE, appelée partout où le moteur choisit une équipe : signalement (`cases.report` et
 * l'ancienne porte des publications), relecture préalable (file, aperçu, décision, lecture du contenu retenu),
 * revendication de page.
 *
 * Parmi les équipes ACTIVES d'un réseau, données de la plus ancienne à la plus récente (l'ordre de l'index
 * `by_network_active`), pour un contenu de nature `kind` et de pays `country` (celui que porte le contenu,
 * jamais celui d'une personne) :
 *  1. contenu d'un pays C : l'équipe de C de cette nature, puis l'équipe généraliste de C, puis l'équipe sans
 *     pays de cette nature, puis l'équipe sans pays généraliste ;
 *  2. contenu sans pays : les seules équipes sans pays (nature, puis généraliste) — jamais une équipe d'un pays ;
 *  3. aucune : le réseau (`undefined`). Entre deux équipes de même rang, la plus ancienne.
 * Un réseau dont aucune équipe ne porte de pays retrouve exactement la règle d'avant (la nature, puis
 * l'équipe sans nature) : le pays du contenu n'y change rien, et le moteur ne le lit même pas
 * (`routesByCountry`).
 */

/** Ce que la règle lit d'une équipe : sa nature (`undefined` : toutes) et son pays (`undefined` : aucun). */
export type RoutableModerationTeam = { readonly scope?: string; readonly country?: string }

/** Le rang d'une équipe pour un contenu (0 est le meilleur), ou `null` si elle ne peut pas le tenir. */
function teamRank(team: RoutableModerationTeam, kind: string, country: string | null): number | null {
  if (team.scope !== undefined && team.scope !== kind) return null
  const generalist = team.scope === undefined ? 1 : 0
  if (team.country === undefined) return 2 + generalist
  return country !== null && team.country === country ? generalist : null
}

/**
 * L'équipe qui reçoit un contenu, ou `undefined` (le réseau). `teams` : les équipes actives, de la plus
 * ancienne à la plus récente ; à rang égal, la première l'emporte.
 */
export function chooseModerationTeam<Team extends RoutableModerationTeam>(teams: readonly Team[], kind: string, country: string | null): Team | undefined {
  let chosen: Team | undefined
  let best = Number.POSITIVE_INFINITY
  for (const team of teams) {
    const rank = teamRank(team, kind, country)
    if (rank !== null && rank < best) {
      chosen = team
      best = rank
    }
  }
  return chosen
}

/**
 * Une équipe peut-elle tenir ce contenu (nature compatible ; pays égal à celui du contenu, ou aucun) ? Sert
 * la lecture d'un contenu retenu, qui reste ouverte à toute équipe éligible, pas seulement à celle choisie.
 */
export function isModerationTeamEligible(team: RoutableModerationTeam, kind: string, country: string | null): boolean {
  return teamRank(team, kind, country) !== null
}

/** Une équipe au moins porte-t-elle un pays ? Sinon le pays du contenu ne change aucun choix : inutile de le lire. */
export function routesByCountry(teams: readonly RoutableModerationTeam[]): boolean {
  return teams.some((team) => team.country !== undefined)
}
