/**
 * Membres fondateurs de DIASPORA.GA (EA-01, plan 01 de DIASPORA.GA, décision 1) —
 * amorcer la confiance par une DÉCISION tracée du réseau : un opérateur admet,
 * motif à l'appui, une personne déjà entrée d'elle-même dans le réseau (rien
 * d'office), dans une cohorte plafonnée (`FOUNDING_COHORT_MAX`), avec en option
 * la dispense d'ancienneté pour parrainer. Le fait vérifie par LA règle du domaine
 * (`deriveMembershipStatus`) ; statut et badge suivent. Le retrait fait retomber
 * le statut selon les faits restants ; le départ éteint l'admission.
 *
 * Bornes : réseau gouverné par la tranche seulement (refus indistinct sinon) ;
 * opérateur de plateforme VIVANT exigé (`operators`, non révoqué) ; motif borné
 * (`assertDecisionReason`) ; lectures bornées par index, aucun `.collect()`.
 *
 * Les DÉCISIONS (admettre, retirer) sont des mutations INTERNES, lancées par
 * l'exploitant du déploiement au nom d'un opérateur vivant qu'elles relisent : le
 * journal des décisions du moteur n'a pas encore d'action pour elles, et toute
 * mutation de console doit y écrire (cliquet `operator-audit`). Issue [S1] :
 * actions d'audit, classement de données de `foundingAdmissions`, écran de la
 * console ; la console appellera alors `admitFounder` / `withdrawFounder`. En
 * attendant, la ligne de décision elle-même porte qui, quand et pourquoi — elle
 * n'est jamais réécrite que pour son retrait.
 *
 * ADR-0042, lot A3 (CH-815) — l'ADMINISTRATION DU RÉSEAU décide aussi, depuis son
 * application d'administration (`networkAdminQuery` / `networkAdminMutation` : adhésion,
 * rôle relu, session IDN prouvée de l'application qui administre CE réseau, accès
 * journalisé ; refus indistinct sinon) : `cohort` (le jumeau de `listFoundingAdmissions`,
 * plus qui a admis et qui a retiré), `candidate`, `admit` et `withdraw` (les jumeaux des
 * décisions d'exploitation, MÊME cœur `admitFounder` / `withdrawFounder`, mêmes refus du
 * domaine). Chaque décision entre au journal (`diaspora.founder_admit`,
 * `diaspora.founder_withdraw`) à titre de `network_admin`, dans la définition même de la
 * mutation (cliquet `network-admin-audit`). La cause d'un retrait décidé reste `operator`
 * (la liste fermée du domaine : une décision motivée, par opposition au départ) ; le
 * journal dit à quel titre. Porte du propriétaire : l'accord écrit d'antsia#176 visait la
 * console ; l'admission depuis l'application d'administration est « à confirmer » (fiche § 7).
 */
import { assertDecisionReason } from "@antsia/social-domain/audit"
import {
  checkFoundingAdmission,
  checkFoundingWithdrawal,
  FOUNDING_COHORT_MAX,
  FOUNDING_REASON_MIN,
  FOUNDING_WITHDRAWAL_CAUSES,
  type MembershipStatus,
} from "@diaspora-ga/domain"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { getMembership } from "../../lib/access"
import { checked, fail, failAppRule, notFound } from "../../lib/errors"
import { networkAdminMutation, networkAdminQuery, operatorQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { literals, membershipStatusValidator } from "../../lib/validators"
import { findPublishedPersonByHandle } from "../people/miniProfile"
import { appendAudit } from "../platform/audit"
import { activeFoundingAdmissionOf, assertDiasporaNetwork, effectiveStatusIn, isDiasporaNetwork, rederiveMembership } from "./facts"
import { personLabelValidator } from "./validators"

/** Les admissions retirées que montre la console : les plus récentes. */
export const FOUNDING_WITHDRAWN_LIST_MAX = 50

/** Longueur au-delà de laquelle un identifiant saisi ne désigne personne. */
const HANDLE_INPUT_MAX = 80

/** Les admissions EN VIGUEUR du réseau, jusqu'au plafond (au-delà, le refus est acquis). */
async function activeCohort(ctx: QueryCtx, networkId: Id<"networks">): Promise<Doc<"foundingAdmissions">[]> {
  return await ctx.db
    .query("foundingAdmissions")
    .withIndex("by_network_and_withdrawnAt", (q) => q.eq("networkId", networkId).eq("withdrawnAt", undefined))
    .take(FOUNDING_COHORT_MAX)
}

/**
 * Admettre une personne dans la cohorte fondatrice : la décision écrite, puis LA
 * règle relue. `admittedByPersonId` est l'opérateur qui décide, `null` pour le seul
 * équipement de démonstration (développement local). Refus : réseau, cible non
 * membre active, admission déjà en vigueur, cohorte pleine, motif hors bornes.
 */
export async function admitFounder(
  ctx: MutationCtx,
  network: Doc<"networks">,
  input: { personId: Id<"persons">; reason: string; seniorityWaiver: boolean; admittedByPersonId: Id<"persons"> | null; now: number },
): Promise<{ admissionId: Id<"foundingAdmissions">; status: MembershipStatus }> {
  if (!isDiasporaNetwork(network)) return notFound()
  const reason = checked(() => assertDecisionReason(input.reason, FOUNDING_REASON_MIN))
  const access = await effectiveStatusIn(ctx, network, input.personId)
  const check = checkFoundingAdmission({
    targetStatus: access.membership ? access.status : null,
    alreadyAdmitted: (await activeFoundingAdmissionOf(ctx, network._id, input.personId)) !== null,
    activeCohort: (await activeCohort(ctx, network._id)).length,
  })
  if (!check.ok) {
    if (check.code === "founding_target_not_member") return failAppRule(check.code, {}, "notFound")
    return failAppRule(check.code, check.code === "founding_cohort_full" ? { limit: FOUNDING_COHORT_MAX } : {}, "conflict")
  }
  // Inatteignable : la règle a déjà refusé une personne sans adhésion.
  if (!access.membership) return notFound()
  const admissionId = await ctx.db.insert("foundingAdmissions", {
    networkId: network._id,
    personId: input.personId,
    reason,
    seniorityWaiver: input.seniorityWaiver,
    admittedAt: input.now,
    ...(input.admittedByPersonId !== null ? { admittedByPersonId: input.admittedByPersonId } : {}),
  })
  const status = await rederiveMembership(ctx, access.membership, input.now)
  return { admissionId, status }
}

/**
 * Retirer l'admission fondatrice en vigueur : la décision garde sa ligne, datée et
 * motivée ; le statut retombe selon les faits restants (une sanction garde la main,
 * le statut à rendre à sa levée suit les faits). Sans admission en vigueur : refus.
 */
export async function withdrawFounder(
  ctx: MutationCtx,
  network: Doc<"networks">,
  input: { personId: Id<"persons">; reason: string; withdrawnByPersonId: Id<"persons">; now: number },
): Promise<{ status: MembershipStatus | null }> {
  if (!isDiasporaNetwork(network)) return notFound()
  const reason = checked(() => assertDecisionReason(input.reason, FOUNDING_REASON_MIN))
  const active = await activeFoundingAdmissionOf(ctx, network._id, input.personId)
  const check = checkFoundingWithdrawal({ admitted: active !== null })
  if (!check.ok || !active) return failAppRule("founding_not_admitted", {}, "notFound")
  await ctx.db.patch(active._id, {
    withdrawnAt: input.now,
    withdrawnBy: "operator",
    withdrawnByPersonId: input.withdrawnByPersonId,
    withdrawalReason: reason,
  })
  const membership = await getMembership(ctx, network._id, input.personId)
  return { status: membership ? await rederiveMembership(ctx, membership, input.now) : null }
}

/** L'opérateur de plateforme VIVANT au nom duquel une décision est prise ; refus sinon. */
async function requireLiveOperator(ctx: QueryCtx, personId: Id<"persons">): Promise<Doc<"operators">> {
  const operator = await ctx.db
    .query("operators")
    .withIndex("by_person", (q) => q.eq("personId", personId))
    .unique()
  if (!operator || operator.revokedAt !== undefined) return fail("operatorRequired")
  return operator
}

/**
 * Décision d'exploitation (mutation interne) : admettre une personne de DIASPORA.GA
 * dans la cohorte fondatrice, au nom d'un opérateur vivant, motif obligatoire, avec
 * ou sans dispense d'ancienneté pour parrainer.
 */
export const admitFoundingMember = internalMutation({
  args: {
    networkId: v.id("networks"),
    personId: v.id("persons"),
    operatorPersonId: v.id("persons"),
    reason: v.string(),
    seniorityWaiver: v.boolean(),
  },
  returns: v.object({ admissionId: v.id("foundingAdmissions"), status: membershipStatusValidator }),
  handler: async (ctx, args) => {
    const operator = await requireLiveOperator(ctx, args.operatorPersonId)
    await enforceRateLimit(ctx, "operator.membership", operator.personId)
    const network = await ctx.db.get(args.networkId)
    if (!isDiasporaNetwork(network)) return notFound()
    return await admitFounder(ctx, network, {
      personId: args.personId,
      reason: args.reason,
      seniorityWaiver: args.seniorityWaiver,
      admittedByPersonId: operator.personId,
      now: Date.now(),
    })
  },
})

/** Décision d'exploitation (mutation interne) : retirer une admission fondatrice, motif obligatoire. */
export const withdrawFoundingMember = internalMutation({
  args: {
    networkId: v.id("networks"),
    personId: v.id("persons"),
    operatorPersonId: v.id("persons"),
    reason: v.string(),
  },
  returns: v.object({ status: v.union(membershipStatusValidator, v.null()) }),
  handler: async (ctx, args) => {
    const operator = await requireLiveOperator(ctx, args.operatorPersonId)
    await enforceRateLimit(ctx, "operator.membership", operator.personId)
    const network = await ctx.db.get(args.networkId)
    if (!isDiasporaNetwork(network)) return notFound()
    return await withdrawFounder(ctx, network, {
      personId: args.personId,
      reason: args.reason,
      withdrawnByPersonId: operator.personId,
      now: Date.now(),
    })
  },
})

const admissionViewValidator = v.object({
  admissionId: v.id("foundingAdmissions"),
  personId: v.id("persons"),
  /** Identifiant et nom publiés de la personne admise ; vides si son profil est retiré. */
  person: personLabelValidator,
  reason: v.string(),
  seniorityWaiver: v.boolean(),
  admittedAt: v.number(),
  admittedByPersonId: v.union(v.id("persons"), v.null()),
  withdrawnAt: v.union(v.number(), v.null()),
  withdrawnBy: v.union(literals(FOUNDING_WITHDRAWAL_CAUSES), v.null()),
  withdrawalReason: v.union(v.string(), v.null()),
})

/** Une personne citée par son identifiant public et son nom affiché — seulement si son profil est publié. */
function labelOf(person: Doc<"persons"> | null): { handle: string; displayName: string } {
  if (!person || person.publishedAt === undefined || person.withdrawnAt !== undefined) return { handle: "", displayName: "" }
  return { handle: person.handle ?? "", displayName: person.displayName ?? "" }
}

async function admissionView(ctx: QueryCtx, row: Doc<"foundingAdmissions">) {
  return {
    admissionId: row._id,
    personId: row.personId,
    person: labelOf(await ctx.db.get(row.personId)),
    reason: row.reason,
    seniorityWaiver: row.seniorityWaiver,
    admittedAt: row.admittedAt,
    admittedByPersonId: row.admittedByPersonId ?? null,
    withdrawnAt: row.withdrawnAt ?? null,
    withdrawnBy: row.withdrawnBy ?? null,
    withdrawalReason: row.withdrawalReason ?? null,
  }
}

/** Les admissions retirées les plus récentes, puis les admissions EN VIGUEUR (le plafond les borne). */
async function cohortRows(ctx: QueryCtx, networkId: Id<"networks">): Promise<{ active: Doc<"foundingAdmissions">[]; withdrawn: Doc<"foundingAdmissions">[] }> {
  const withdrawn = await ctx.db
    .query("foundingAdmissions")
    .withIndex("by_network_and_withdrawnAt", (q) => q.eq("networkId", networkId).gt("withdrawnAt", 0))
    .order("desc")
    .take(FOUNDING_WITHDRAWN_LIST_MAX)
  return { active: await activeCohort(ctx, networkId), withdrawn }
}

/**
 * Console : la cohorte fondatrice du réseau — le plafond, les admissions en vigueur
 * (toutes, le plafond les borne) et les dernières retirées, avec leurs motifs.
 * Réservée aux opérateurs de plateforme vivants ; autre réseau : refus indistinct.
 */
export const listFoundingAdmissions = operatorQuery({
  args: { networkId: v.id("networks") },
  returns: v.object({
    cohortMax: v.number(),
    active: v.array(admissionViewValidator),
    withdrawn: v.array(admissionViewValidator),
  }),
  handler: async (ctx, { networkId }) => {
    const network = await ctx.db.get(networkId)
    if (!isDiasporaNetwork(network)) return notFound()
    const rows = await cohortRows(ctx, network._id)
    const active = []
    for (const row of rows.active) active.push(await admissionView(ctx, row))
    const past = []
    for (const row of rows.withdrawn) past.push(await admissionView(ctx, row))
    return { cohortMax: FOUNDING_COHORT_MAX, active, withdrawn: past }
  },
})

// ── ADR-0042, lot A3 : l'administration du réseau ─────────────────────────────

/** Qui a décidé, cité comme la personne admise : identifiant et nom publiés, vides sinon. */
const deciderValidator = v.union(v.object({ personId: v.id("persons"), ...personLabelValidator.fields }), v.null())

/** Une admission telle que l'administration du réseau la voit : celle de la console, plus qui a admis et qui a retiré. */
const networkAdminAdmissionValidator = v.object({
  admissionId: v.id("foundingAdmissions"),
  personId: v.id("persons"),
  person: personLabelValidator,
  reason: v.string(),
  seniorityWaiver: v.boolean(),
  admittedAt: v.number(),
  /** Qui a admis : un opérateur (console, exploitation) ou l'administration du réseau ; `null` pour l'équipement de démonstration. */
  admittedBy: deciderValidator,
  withdrawnAt: v.union(v.number(), v.null()),
  withdrawnBy: v.union(literals(FOUNDING_WITHDRAWAL_CAUSES), v.null()),
  /** Qui a retiré la décision ; `null` pour un départ ou une admission en vigueur. */
  withdrawnByPerson: deciderValidator,
  withdrawalReason: v.union(v.string(), v.null()),
})

async function deciderOf(ctx: QueryCtx, personId: Id<"persons"> | undefined) {
  return personId === undefined ? null : { personId, ...labelOf(await ctx.db.get(personId)) }
}

async function networkAdminAdmissionView(ctx: QueryCtx, row: Doc<"foundingAdmissions">) {
  // `admittedBy` porte l'identifiant de qui a admis : le champ brut de la console n'est pas recopié.
  const { admittedByPersonId: _admittedBy, ...view } = await admissionView(ctx, row)
  return {
    ...view,
    admittedBy: await deciderOf(ctx, row.admittedByPersonId),
    withdrawnByPerson: await deciderOf(ctx, row.withdrawnByPersonId),
  }
}

/**
 * Administration du réseau : la cohorte fondatrice — le plafond, le nombre d'admissions en vigueur,
 * chacune (qui, par qui, pourquoi, dispense, date) et les dernières retirées, avec leur motif.
 */
export const cohort = networkAdminQuery({
  args: {},
  returns: v.object({
    cohortMax: v.number(),
    activeCount: v.number(),
    active: v.array(networkAdminAdmissionValidator),
    withdrawn: v.array(networkAdminAdmissionValidator),
  }),
  handler: async (ctx) => {
    assertDiasporaNetwork(ctx.network)
    const rows = await cohortRows(ctx, ctx.networkId)
    const active = []
    for (const row of rows.active) active.push(await networkAdminAdmissionView(ctx, row))
    const withdrawn = []
    for (const row of rows.withdrawn) withdrawn.push(await networkAdminAdmissionView(ctx, row))
    return { cohortMax: FOUNDING_COHORT_MAX, activeCount: active.length, active, withdrawn }
  },
})

/**
 * Administration du réseau : le membre actif désigné par son identifiant public, pour l'admettre
 * (patron de `moderationDesk.teamCandidate`) ; `null` sinon (inconnu, profil retiré, non-membre).
 */
export const candidate = networkAdminQuery({
  args: { handle: v.string() },
  returns: v.union(v.object({ personId: v.id("persons"), handle: v.string(), displayName: v.string() }), v.null()),
  handler: async (ctx, { handle }) => {
    assertDiasporaNetwork(ctx.network)
    const raw = handle.trim().replace(/^@/, "")
    if (raw.length === 0 || raw.length > HANDLE_INPUT_MAX) return null
    const person = await findPublishedPersonByHandle(ctx, ctx.networkId, raw)
    if (!person) return null
    const published = person.handle ?? raw
    return { personId: person._id, handle: published, displayName: person.displayName ?? published }
  },
})

/**
 * Administration du réseau : admettre dans la cohorte une personne DÉJÀ entrée dans le réseau (rien
 * d'office), motif d'au moins dix caractères, avec ou sans dispense d'ancienneté pour parrainer.
 * Refus du domaine : non-membre (`founding_target_not_member`), déjà admise, cohorte pleine
 * (`founding_cohort_full`, plafond rendu).
 */
export const admit = networkAdminMutation({
  args: { personId: v.id("persons"), reason: v.string(), seniorityWaiver: v.boolean() },
  returns: v.object({ admissionId: v.id("foundingAdmissions"), status: membershipStatusValidator }),
  handler: async (ctx, args) => {
    const motive = checked(() => assertDecisionReason(args.reason, FOUNDING_REASON_MIN))
    const now = Date.now()
    const result = await admitFounder(ctx, ctx.network, { personId: args.personId, reason: motive, seniorityWaiver: args.seniorityWaiver, admittedByPersonId: ctx.person._id, now })
    await appendAudit(ctx, {
      action: "diaspora.founder_admit",
      capacity: "network_admin",
      actorPersonId: ctx.person._id,
      networkId: ctx.networkId,
      subject: { table: "persons", id: args.personId },
      details: { reason: motive, seniorityWaiver: args.seniorityWaiver },
      at: now,
    })
    return result
  },
})

/** Administration du réseau : retirer l'admission fondatrice en vigueur, motif d'au moins dix caractères ; le statut retombe selon les faits. */
export const withdraw = networkAdminMutation({
  args: { personId: v.id("persons"), reason: v.string() },
  returns: v.object({ status: v.union(membershipStatusValidator, v.null()) }),
  handler: async (ctx, args) => {
    const motive = checked(() => assertDecisionReason(args.reason, FOUNDING_REASON_MIN))
    const now = Date.now()
    const result = await withdrawFounder(ctx, ctx.network, { personId: args.personId, reason: motive, withdrawnByPersonId: ctx.person._id, now })
    await appendAudit(ctx, {
      action: "diaspora.founder_withdraw",
      capacity: "network_admin",
      actorPersonId: ctx.person._id,
      networkId: ctx.networkId,
      subject: { table: "persons", id: args.personId },
      details: { reason: motive, cause: "operator" },
      at: now,
    })
    return result
  },
})
