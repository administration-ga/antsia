/**
 * Membres fondateurs de DIASPORALE (EA-01, plan 01 de DIASPORALE, décision 1) —
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
 */
import { assertDecisionReason } from "@antsia/social-domain/audit"
import {
  checkFoundingAdmission,
  checkFoundingWithdrawal,
  FOUNDING_COHORT_MAX,
  FOUNDING_REASON_MIN,
  FOUNDING_WITHDRAWAL_CAUSES,
  type MembershipStatus,
} from "@diasporale/domain"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { getMembership } from "../../lib/access"
import { checked, fail, failAppRule, notFound } from "../../lib/errors"
import { operatorQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { literals, membershipStatusValidator } from "../../lib/validators"
import { activeFoundingAdmissionOf, effectiveStatusIn, isDiasporaNetwork, rederiveMembership } from "./facts"
import { personLabelValidator } from "./validators"

/** Les admissions retirées que montre la console : les plus récentes. */
export const FOUNDING_WITHDRAWN_LIST_MAX = 50

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
 * Décision d'exploitation (mutation interne) : admettre une personne de DIASPORALE
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
    const withdrawn = await ctx.db
      .query("foundingAdmissions")
      .withIndex("by_network_and_withdrawnAt", (q) => q.eq("networkId", network._id).gt("withdrawnAt", 0))
      .order("desc")
      .take(FOUNDING_WITHDRAWN_LIST_MAX)
    const active = []
    for (const row of await activeCohort(ctx, network._id)) active.push(await admissionView(ctx, row))
    const past = []
    for (const row of withdrawn) past.push(await admissionView(ctx, row))
    return { cohortMax: FOUNDING_COHORT_MAX, active, withdrawn: past }
  },
})
