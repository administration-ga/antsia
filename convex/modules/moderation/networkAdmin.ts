/**
 * ADR-0042, amendement A6 (CH-815) — les décisions de modération d'un réseau, depuis SON application
 * d'administration (fiche D5 : « le bureau traite, l'administration décide »).
 *
 * Les jumeaux des fonctions partagées de `moderation/cases` que l'application des membres appelait :
 * MÊMES arguments, MÊME cœur métier (`createNetworkTeam`, `setNetworkTeamMember`,
 * `reviewNetworkAppealOf`, `setNetworkPolicy`, `setNetworkBlockedTerm`, `moderationSettings`,
 * `blockedTermsPage`), MÊMES règles de motif, MÊME ligne de journal à titre de `network_admin`.
 * Une seule différence d'arguments, depuis l'amendement A3 (suite) : `createTeam` accepte en plus le
 * pays de l'équipe (`country?`, ISO alpha-2, jugé par sa forme), que l'original refuse. Et une porte
 * sans original : `setTeamCountry`, qui pose, change ou retire ce pays (`moderation.team_country_set`).
 * Le pays d'une équipe ne délimite encore aucune compétence : le routage des signalements reste par
 * nature de contenu (`cases.report`).
 * Ce qui change est la garde : `networkAdminQuery` / `networkAdminMutation` (adhésion, rôle relu,
 * session IDN prouvée de l'application qui administre CE réseau, accès journalisé ; refus
 * indistinct sinon), puis, pour écrire, la garde d'écriture, `social.write`, `network_admin.write`
 * et le budget de surface qu'avaient les originaux (`moderation.decide`).
 *
 * Pour un réseau qui a son application d'administration, les originaux refusent désormais
 * (`cases.requireNetworkAdmin`) : un seul endroit règle une chose. Pour la racine et tout réseau
 * sans application d'administration, les originaux ne changent pas et ces jumeaux refusent (la
 * preuve n'est scellée pour aucune application qui les administre).
 *
 * La file des recours montés au réseau se lit, pour DIASPORA.GA, par `diaspora/moderationDesk.appealQueue`
 * (même constructeur) ; la mesure du pilote, l'équipe et les responsables, par la tranche.
 */
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import { networkAdminMutation, networkAdminQuery } from "../../lib/functions"
import { appendAudit } from "../platform/audit"
import { createNetworkTeam, reviewNetworkAppealOf, setNetworkBlockedTerm, setNetworkPolicy, setNetworkTeamCountry, setNetworkTeamMember } from "./cases"
import { blockedTermsPage as readBlockedTermsPage, blockedTermsPageValidator, moderationSettings, moderationSettingsValidator } from "./settings"
import { moderationSurfaceValidator } from "./tables"

/** Recours : juger un recours monté au réseau, sans réutiliser le décideur initial ni l'auteur du recours. */
export const reviewNetworkAppeal = networkAdminMutation({
  writeBucket: "moderation.decide",
  args: { appealId: v.id("appeals"), overturn: v.boolean(), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await appendAudit(ctx, await reviewNetworkAppealOf(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args))
    return null
  },
})

/** Équipe : créer une équipe de modération du réseau (nature et pays facultatifs). */
export const createTeam = networkAdminMutation({
  writeBucket: "moderation.decide",
  args: { name: v.string(), scope: v.optional(moderationSurfaceValidator), country: v.optional(v.string()), reason: v.string() },
  returns: v.object({ teamId: v.id("moderationTeams") }),
  handler: async (ctx, args) => {
    const { teamId, audit } = await createNetworkTeam(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args)
    await appendAudit(ctx, audit)
    return { teamId }
  },
})

/** Équipe : nommer un membre actif du réseau dans une équipe, ou l'en retirer. */
export const setTeamMember = networkAdminMutation({
  writeBucket: "moderation.decide",
  args: { teamId: v.id("moderationTeams"), personId: v.id("persons"), active: v.boolean(), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await appendAudit(ctx, await setNetworkTeamMember(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args))
    return null
  },
})

/**
 * Équipe : poser, changer ou retirer (`null`) le pays d'une équipe active du réseau (ISO alpha-2, jugé par
 * sa forme) ; une autre équipe : le refus indistinct. Sans changement, rien n'est écrit.
 */
export const setTeamCountry = networkAdminMutation({
  writeBucket: "moderation.decide",
  args: { teamId: v.id("moderationTeams"), country: v.union(v.string(), v.null()), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const audit = await setNetworkTeamCountry(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args)
    if (audit) await appendAudit(ctx, audit)
    return null
  },
})

/** Règles : les réglages de modération du réseau, par surface (`null` : les défauts du moteur). */
export const policies = networkAdminQuery({
  args: {},
  returns: moderationSettingsValidator,
  handler: async (ctx) => await moderationSettings(ctx, ctx.networkId),
})

/** Règles : les mots bloqués actifs du réseau, par pages de 50 au plus. */
export const blockedTermsPage = networkAdminQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: blockedTermsPageValidator,
  handler: async (ctx, args) => await readBlockedTermsPage(ctx, ctx.networkId, args.paginationOpts),
})

/** Règles : relecture préalable, plafond de liens et cadence d'écriture d'une surface. */
export const setPolicy = networkAdminMutation({
  writeBucket: "moderation.decide",
  args: { surface: moderationSurfaceValidator, preReview: v.boolean(), maxLinks: v.number(), maxWrites: v.number(), windowMs: v.number(), reason: v.string() },
  returns: v.object({ policyId: v.id("moderationPolicies") }),
  handler: async (ctx, args) => {
    const { policyId, audit } = await setNetworkPolicy(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args)
    await appendAudit(ctx, audit)
    return { policyId }
  },
})

/** Règles : activer ou retirer un mot bloqué. */
export const setBlockedTerm = networkAdminMutation({
  writeBucket: "moderation.decide",
  args: { term: v.string(), active: v.boolean(), reason: v.string() },
  returns: v.object({ termId: v.id("blockedTerms") }),
  handler: async (ctx, args) => {
    const { termId, audit } = await setNetworkBlockedTerm(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args)
    await appendAudit(ctx, audit)
    return { termId }
  },
})
