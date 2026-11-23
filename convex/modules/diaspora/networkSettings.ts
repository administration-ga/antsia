/**
 * ADR-0042, lot A3 (CH-815) — les réglages et le tableau de bord du réseau, pour SON administration
 * (application d'administration, fiche § 4.2).
 *
 * `overview` : les compteurs que le moteur TIENT pour le tableau de bord, en une lecture bornée —
 *  · modules : les clés ouvertes de la tranche (une ligne au plus par clé, `openFeaturesOf`) ;
 *  · fondateurs : les admissions en vigueur, bornées par le plafond de la cohorte ;
 *  · pays : les pays ouverts du réseau (`networks.openCountries`, réglage du réseau).
 * Les autres comptes de la fiche (membres par statut, admissions en attente, signalements et recours
 * ouverts, pages à vérifier) ne sont tenus par aucun compteur ni agrégat du moteur : ils ne sont PAS
 * rendus — jamais estimés ni comptés par balayage. Les files se lisent par leurs fenêtres
 * (`moderationDesk.queue`, `appealQueue`, `pageClaimQueue`), le journal par
 * `platform/audit.paginateNetworkAdminAudit`.
 *
 * Pays ouverts (amendement A3, suite — décision de l'architecte du 23/11/2026) :
 *
 * `countries` : par pays — ouvert, porté par une équipe ACTIVE (`moderationTeams.country`) ou doté
 *  d'un hub —, son ouverture et la PRÉSENTATION de ses compteurs (`hubs.hubView`, jamais le chiffre
 *  brut), les équipes du pays, ses modérateurs actifs (membre actif d'une équipe du pays ET membre
 *  actif du réseau, une personne comptée une fois) et `canOpen`, la condition que le moteur vérifie.
 *  Un pays ouvert sans modérateur actif se lit `open: true, canOpen: false` : la lecture signale
 *  l'anomalie, rien n'empêche de retirer le dernier modérateur d'un pays ouvert.
 *
 * `setOpenCountry` : ouvrir un pays exige une équipe active de ce pays avec au moins un modérateur
 *  actif encore membre actif du réseau (`moderator_missing`), et l'attestation, par l'administrateur,
 *  des associations relais du cahier, que rien ne modélise (`relayAssociationsAttested`, inscrite au
 *  journal ; `relay_associations_missing`) — codes et seuils de `COUNTRY_OPENING_REQUIREMENTS` ;
 *  fermer est toujours permis. L'écriture fige les réglages (`networks.recordHistory` : sans cette
 *  ligne, l'équipement de démonstration rouvrirait ses pays, `demoAccounts.openDemoCountries`), puis
 *  la ligne du journal `diaspora.country_set`. Sans changement : ni écriture ni ligne. La console
 *  (`networks.update`) reste le repli d'exploitation, sans cette règle. Le pays d'une équipe délimite
 *  sa compétence : le moteur lui adresse les dossiers des contenus de son pays (`moderation/routing`).
 *
 * Garde : `networkAdminQuery` / `networkAdminMutation` (adhésion, rôle relu, session IDN prouvée de
 * l'application qui administre CE réseau, accès journalisé ; refus indistinct sinon). Aucune réponse
 * ne porte la preuve de session.
 */
import { assertDecisionReason } from "@antsia/social-domain/audit"
import {
  canOpenCountry,
  COUNTRY_OPENING_REQUIREMENTS,
  countryOpeningGaps,
  FOUNDING_COHORT_MAX,
  isResidenceCountry,
  parseResidenceCountry,
} from "@diaspora-ga/domain"
import { SLICE_NETWORK_FEATURES } from "@antsia/social-domain/networkFeatures"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { isActiveMember } from "../../lib/access"
import { checked, fail, failAppRule, notFound } from "../../lib/errors"
import { networkAdminMutation, networkAdminQuery } from "../../lib/functions"
import { openFeaturesOf } from "../../lib/networkFeatures"
import { moderationSurfaceValidator } from "../moderation/tables"
import { recordHistory } from "../networks/networks"
import { appendAudit } from "../platform/audit"
import { assertDiasporaNetwork } from "./facts"
import { hubView } from "./hubs"
import { countryHubViewValidator } from "./validators"

/** Borne des pays d'un réseau (ISO 3166-1 : 249 codes). */
const COUNTRIES_MAX = 249
/** Hubs relus : un par pays au plus. */
const HUBS_SCAN = 250
/** Équipes actives relues : la borne du moteur (`createNetworkTeam`, `cases.report`, `moderationDesk.myDesk`). */
const TEAMS_SCAN = 100
/** Lignes d'une équipe relues (actives et anciennes) pour en extraire les modérateurs actifs. */
const TEAM_ROWS_SCAN = 200
/** Lignes d'équipe relues en tout, toutes équipes d'un pays confondues ; au-delà, le refus plutôt qu'un compte faux. */
const MEMBER_ROWS_SCAN = 500
/** Longueur minimale du motif d'une ouverture ou d'une fermeture (celle des décisions de la tranche). */
const COUNTRY_REASON_MIN = 10

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
 * Les équipes ACTIVES du réseau qui portent un pays (celui demandé, ou tous), et leurs modérateurs
 * actifs encore membres actifs du réseau. Lectures bornées : 100 équipes, 200 lignes par équipe, 500 en
 * tout ; au-delà, `policyRefused` plutôt qu'un compte inexact.
 */
async function moderationByCountry(ctx: ReadCtx, networkId: Id<"networks">, only?: string): Promise<Map<string, CountryModeration>> {
  const teams = await ctx.db
    .query("moderationTeams")
    .withIndex("by_network_active", (q) => q.eq("networkId", networkId).eq("active", true))
    .take(TEAMS_SCAN + 1)
  if (teams.length > TEAMS_SCAN) return fail("policyRefused")
  const byCountry = new Map<string, CountryModeration>()
  const activeMembers = new Map<Id<"persons">, boolean>()
  let rowsRead = 0
  for (const team of teams) {
    if (team.country === undefined || (only !== undefined && team.country !== only)) continue
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
    const countries = new Set((ctx.network.openCountries ?? []).slice(0, COUNTRIES_MAX))
    return {
      modules: { open, total },
      founders: { active: founders.length, cap: FOUNDING_COHORT_MAX },
      countries: { open: countries.size },
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
    const codes = new Set<string>()
    for (const country of [...(ctx.network.openCountries ?? []).slice(0, COUNTRIES_MAX), ...moderation.keys(), ...hubOf.keys()]) {
      // Seuls les pays de résidence (jamais le Gabon, jamais un code inconnu), comme la vitrine des hubs.
      if (isResidenceCountry(country)) codes.add(country)
    }
    return [...codes].sort().map((country) => {
      const entry = moderation.get(country)
      const activeModerators = entry?.moderators.size ?? 0
      return {
        ...hubView(ctx.network, country, hubOf.get(country) ?? null),
        teams: entry?.teams ?? [],
        activeModerators,
        canOpen: moderatorsSuffice(activeModerators),
      }
    })
  },
})

/**
 * Ouvrir ou fermer un pays du réseau, motif d'au moins dix caractères. Ouvrir : `conflict` avec le code
 * du domaine (`moderator_missing`, `relay_associations_missing`, seuil requis dans `appParams.required`).
 * Rend l'état demandé et s'il a changé.
 */
export const setOpenCountry = networkAdminMutation({
  args: { country: v.string(), open: v.boolean(), reason: v.string(), relayAssociationsAttested: v.optional(v.boolean()) },
  returns: v.object({ open: v.boolean(), changed: v.boolean() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    const parsed = parseResidenceCountry(args.country)
    if (!parsed.ok) return failAppRule(parsed.code, {}, "invalidArgument")
    const country: string = parsed.value
    const motive = checked(() => assertDecisionReason(args.reason, COUNTRY_REASON_MIN))
    const current = ctx.network.openCountries ?? []
    // Sans changement : ni écriture, ni historique, ni journal.
    if (current.includes(country) === args.open) return { open: args.open, changed: false }
    const activeModerators = (await moderationByCountry(ctx, ctx.networkId, country)).get(country)?.moderators.size ?? 0
    const relayAssociationsAttested = args.relayAssociationsAttested === true
    if (args.open) {
      const [gap] = countryOpeningGaps({ relayAssociations: relayAssociationsAttested ? COUNTRY_OPENING_REQUIREMENTS.relayAssociations : 0, activeModerators })
      if (gap === "moderator_missing") return failAppRule(gap, { required: COUNTRY_OPENING_REQUIREMENTS.activeModerators }, "conflict")
      if (gap === "relay_associations_missing") return failAppRule(gap, { required: COUNTRY_OPENING_REQUIREMENTS.relayAssociations }, "conflict")
      if (current.length >= COUNTRIES_MAX) return fail("policyRefused")
    }
    const now = Date.now()
    const openCountries = args.open ? [...current, country] : current.filter((code) => code !== country)
    await ctx.db.patch(ctx.networkId, { openCountries, updatedAt: now })
    const updated = await ctx.db.get(ctx.networkId)
    if (!updated) return notFound()
    // L'historique AVANT le journal : l'équipement de démonstration y lit qu'une décision existe.
    await recordHistory(ctx, updated, "updated", ctx.person._id, motive)
    await appendAudit(ctx, {
      action: "diaspora.country_set",
      capacity: "network_admin",
      actorPersonId: ctx.person._id,
      networkId: ctx.networkId,
      subject: { table: "networks", id: ctx.networkId },
      details: { reason: motive, country, open: args.open, activeModerators, relayAssociationsAttested },
      at: now,
    })
    return { open: args.open, changed: true }
  },
})
