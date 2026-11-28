/**
 * ADR-0042, lot A3 (CH-815) — les réglages et le tableau de bord du réseau, pour SON administration
 * (application d'administration, fiche § 4.2).
 *
 * `overview` : les compteurs que le moteur TIENT pour le tableau de bord, en une lecture bornée —
 *  · modules : les clés ouvertes de la tranche (une ligne au plus par clé, `openFeaturesOf`) ;
 *  · fondateurs : les admissions en vigueur, bornées par le plafond de la cohorte ;
 *  · pays : les 249 pays et territoires ISO.
 * Les autres comptes de la fiche (membres par statut, admissions en attente, signalements et recours
 * ouverts, pages à vérifier) ne sont tenus par aucun compteur ni agrégat du moteur : ils ne sont PAS
 * rendus — jamais estimés ni comptés par balayage. Les files se lisent par leurs fenêtres
 * (`moderationDesk.queue`, `appealQueue`, `pageClaimQueue`), le journal par
 * `platform/audit.paginateNetworkAdminAudit`.
 *
 * Le catalogue couvre tous les territoires ISO. Chaque pays affiche les compteurs du hub,
 * ses équipes et leurs modérateurs actifs. Le champ historique « canOpen » décrit la présence
 * locale d'une équipe suffisante. Les anciens clients peuvent confirmer l'ouverture d'un pays.
 *
 * Garde : `networkAdminQuery` / `networkAdminMutation` (adhésion, rôle relu, session IDN prouvée de
 * l'application qui administre CE réseau, accès journalisé ; refus indistinct sinon). Aucune réponse
 * ne porte la preuve de session.
 */
import {
  canOpenCountry,
  COUNTRY_OPENING_REQUIREMENTS,
  ISO_COUNTRY_CODES,
  FOUNDING_COHORT_MAX,
  parseResidenceCountry,
} from "@diaspora-ga/domain"
import { SLICE_NETWORK_FEATURES } from "@antsia/social-domain/networkFeatures"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { isActiveMember } from "../../lib/access"
import { fail, failAppRule } from "../../lib/errors"
import { networkAdminMutation, networkAdminQuery } from "../../lib/functions"
import { openFeaturesOf } from "../../lib/networkFeatures"
import { moderationSurfaceValidator } from "../moderation/tables"
import { assertDiasporaNetwork } from "./facts"
import { hubView } from "./hubs"
import { countryHubViewValidator } from "./validators"

/** Hubs relus : un par pays au plus. */
const HUBS_SCAN = 250
/** Équipes actives relues : la borne du moteur (`createNetworkTeam`, `cases.report`, `moderationDesk.myDesk`). */
const TEAMS_SCAN = 100
/** Lignes d'une équipe relues (actives et anciennes) pour en extraire les modérateurs actifs. */
const TEAM_ROWS_SCAN = 200
/** Lignes d'équipe relues en tout, toutes équipes d'un pays confondues ; au-delà, le refus plutôt qu'un compte faux. */
const MEMBER_ROWS_SCAN = 500

type ReadCtx = Pick<QueryCtx, "db">

const countryTeamValidator = v.object({
  teamId: v.id("moderationTeams"),
  name: v.string(),
  scope: v.union(moderationSurfaceValidator, v.null()),
})
type CountryTeam = typeof countryTeamValidator.type

const adminCountryValidator = v.object({
  ...countryHubViewValidator.fields,
  /** Les équipes ACTIVES qui portent ce pays. */
  teams: v.array(countryTeamValidator),
  /** Personnes distinctes, membres actifs d'une équipe du pays et membres actifs du réseau. */
  activeModerators: v.number(),
  /** La condition que le moteur vérifie (modérateurs) ; les associations relais s'attestent à l'ouverture. */
  canOpen: v.boolean(),
})

type CountryModeration = { teams: CountryTeam[]; moderators: Set<Id<"persons">> }

/**
 * Les équipes ACTIVES du réseau qui portent un pays, et leurs modérateurs
 * actifs encore membres actifs du réseau. Lectures bornées : 100 équipes, 200 lignes par équipe, 500 en
 * tout ; au-delà, `policyRefused` plutôt qu'un compte inexact.
 */
async function moderationByCountry(ctx: ReadCtx, networkId: Id<"networks">): Promise<Map<string, CountryModeration>> {
  const teams = await ctx.db
    .query("moderationTeams")
    .withIndex("by_network_active", (q) => q.eq("networkId", networkId).eq("active", true))
    .take(TEAMS_SCAN + 1)
  if (teams.length > TEAMS_SCAN) return fail("policyRefused")
  const byCountry = new Map<string, CountryModeration>()
  const activeMembers = new Map<Id<"persons">, boolean>()
  let rowsRead = 0
  for (const team of teams) {
    if (team.country === undefined) continue
    const entry = byCountry.get(team.country) ?? { teams: [], moderators: new Set<Id<"persons">>() }
    entry.teams.push({ teamId: team._id, name: team.name, scope: team.scope ?? null })
    const rows = await ctx.db
      .query("moderationTeamMembers")
      .withIndex("by_team_person", (q) => q.eq("teamId", team._id))
      .take(TEAM_ROWS_SCAN + 1)
    rowsRead += rows.length
    if (rows.length > TEAM_ROWS_SCAN || rowsRead > MEMBER_ROWS_SCAN) return fail("policyRefused")
    for (const row of rows) {
      if (!row.active) continue
      let active = activeMembers.get(row.personId)
      if (active === undefined) {
        active = await isActiveMember(ctx, networkId, row.personId)
        activeMembers.set(row.personId, active)
      }
      if (active) entry.moderators.add(row.personId)
    }
    byCountry.set(team.country, entry)
  }
  return byCountry
}

/** La condition vérifiable par le moteur, les relais supposés attestés (ils le sont à l'ouverture). */
function moderatorsSuffice(activeModerators: number): boolean {
  return canOpenCountry({ relayAssociations: COUNTRY_OPENING_REQUIREMENTS.relayAssociations, activeModerators })
}

/** Le tableau de bord : les compteurs tenus, rien d'autre. */
export const overview = networkAdminQuery({
  args: {},
  returns: v.object({
    modules: v.object({ open: v.number(), total: v.number() }),
    founders: v.object({ active: v.number(), cap: v.number() }),
    countries: v.object({ open: v.number() }),
  }),
  handler: async (ctx) => {
    assertDiasporaNetwork(ctx.network)
    const slice = ctx.network.managedBy
    const total = slice === undefined ? 0 : SLICE_NETWORK_FEATURES[slice].length
    const open = (await openFeaturesOf(ctx, ctx.network)).length
    const founders = await ctx.db
      .query("foundingAdmissions")
      .withIndex("by_network_and_withdrawnAt", (q) => q.eq("networkId", ctx.networkId).eq("withdrawnAt", undefined))
      .take(FOUNDING_COHORT_MAX)
    return {
      modules: { open, total },
      founders: { active: founders.length, cap: FOUNDING_COHORT_MAX },
      countries: { open: ISO_COUNTRY_CODES.length },
    }
  },
})

/** Les pays du réseau pour son administration, par ordre de code. */
export const countries = networkAdminQuery({
  args: {},
  returns: v.array(adminCountryValidator),
  handler: async (ctx) => {
    assertDiasporaNetwork(ctx.network)
    const moderation = await moderationByCountry(ctx, ctx.networkId)
    const hubs = await ctx.db
      .query("countryHubs")
      .withIndex("by_network_and_country", (q) => q.eq("networkId", ctx.networkId))
      .take(HUBS_SCAN + 1)
    if (hubs.length > HUBS_SCAN) return fail("policyRefused")
    const hubOf = new Map<string, Doc<"countryHubs">>(hubs.map((row) => [row.country, row]))
    return ISO_COUNTRY_CODES.map((country) => {
      const entry = moderation.get(country)
      const activeModerators = entry?.moderators.size ?? 0
      return {
        ...hubView(country, hubOf.get(country) ?? null),
        teams: entry?.teams ?? [],
        activeModerators,
        canOpen: moderatorsSuffice(activeModerators),
      }
    })
  },
})

/** Compatibilité des anciens clients d'administration : la couverture est désormais universelle. */
export const setOpenCountry = networkAdminMutation({
  args: { country: v.string(), open: v.boolean(), reason: v.string(), relayAssociationsAttested: v.optional(v.boolean()) },
  returns: v.object({ open: v.boolean(), changed: v.boolean() }),
  handler: async ({ network }, args) => {
    assertDiasporaNetwork(network)
    const parsed = parseResidenceCountry(args.country)
    if (!parsed.ok) return failAppRule(parsed.code, {}, "invalidArgument")
    // Older admin clients can confirm coverage. Geographic access is universal.
    if (!args.open) return fail("policyRefused")
    return { open: true, changed: false }
  },
})
