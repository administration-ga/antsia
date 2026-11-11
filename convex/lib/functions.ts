/**
 * Constructeurs de fonctions du moteur — la garde vit dans le CONSTRUCTEUR,
 * pas dans chaque fonction (patron du socle, `lib/customFunctions.ts`) : on ne
 * peut pas déclarer une fonction sociale qui oublie sa borne de réseau.
 *
 *   networkQuery / networkMutation   `networkId` CONSOMMÉ par le constructeur,
 *                                    `requireMembership` au statut `minStatus`
 *                                    (défaut : `en_attente` en lecture,
 *                                    `declaree` en écriture) ; le handler lit
 *                                    `ctx.network`, `ctx.membership`, `ctx.person`.
 *   networkAction                    admission par mutation interne AVANT tout
 *                                    effet : adhésion, éligibilité, quotas ;
 *                                    exception nominative `readOnly` contrôlée
 *                                    par cliquet ; ctx.personId / ctx.networkId.
 *   personQuery / personMutation     la seule personne appelante (ses réglages,
 *                                    son adhésion, ses consentements) : à
 *                                    justifier par `@selfScoped` dans un module social.
 *   operatorQuery / operatorMutation console du moteur : opérateur de plateforme vivant.
 *
 * Les trois constructeurs de mutation consomment un budget commun obligatoire
 * par personne ; `writeBucket` ajoute un budget de surface sans copier la garde.
 * Le cliquet `network-scoped-functions` relit les modules sociaux et refuse
 * toute fonction publique qui n'emprunte pas un constructeur borné ou ne
 * porte pas sa justification.
 */
import type { ActiveMembershipStatus } from "@antsia/social-domain/membership"
import { customAction, customMutation, customQuery } from "convex-helpers/server/customFunctions"
import { makeFunctionReference } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "../_generated/dataModel"
import { action, mutation, query, type QueryCtx } from "../_generated/server"
import { assertSocialWriteAllowed } from "../modules/moderation/policy"
import { requireMembership, requirePerson } from "./access"
import { fail } from "./errors"
import { liveOperatorSessionOrNull, requireOperatorSession } from "./operatorIdentity"
import { type ActionWriteBucket, enforceRateLimit, type RateLimitBucket } from "./rateLimit"

type NetworkExtra = { minStatus?: ActiveMembershipStatus }
type NetworkMutationExtra = NetworkExtra & { writeBucket?: RateLimitBucket }
type NetworkActionExtra = NetworkExtra & { readOnly?: true; writeBucket?: ActionWriteBucket }
type OperatorExtra = { allowUnloggedAccess?: true }

/**
 * Les admissions d'une action, posées par `lib/actionAccess.ts`. Références
 * par CHEMIN et non par `internal.…` : ce fichier est importé par tous les
 * modules, et l'API générée qui les décrit tous ne doit pas en dépendre en retour.
 */
const membershipForAction = makeFunctionReference<
  "query",
  { networkId: Id<"networks">; minStatus: ActiveMembershipStatus },
  { personId: Id<"persons">; networkId: Id<"networks"> }
>("lib/actionAccess:membershipForAction")

const admitActionWrite = makeFunctionReference<
  "mutation",
  { networkId: Id<"networks">; minStatus: ActiveMembershipStatus; bucket?: ActionWriteBucket },
  { personId: Id<"persons">; networkId: Id<"networks"> }
>("lib/actionAccess:admitActionWrite")

export const networkQuery = customQuery(query, {
  args: { networkId: v.id("networks") },
  input: async (ctx, { networkId }, extra: NetworkExtra) => {
    const access = await requireMembership(ctx, networkId, extra.minStatus ?? "en_attente")
    return { ctx: { ...access, networkId: access.network._id }, args: {} }
  },
})

export const networkMutation = customMutation(mutation, {
  args: { networkId: v.id("networks") },
  input: async (ctx, { networkId }, extra: NetworkMutationExtra) => {
    const access = await requireMembership(ctx, networkId, extra.minStatus ?? "declaree")
    await assertSocialWriteAllowed(ctx, networkId, access.person._id)
    await enforceRateLimit({ ...ctx, ...access, networkId }, "social.write", access.person._id)
    if (extra.writeBucket) await enforceRateLimit({ ...ctx, ...access, networkId }, extra.writeBucket, access.person._id)
    return { ctx: { ...access, networkId: access.network._id }, args: {} }
  },
})

export const networkAction = customAction(action, {
  args: { networkId: v.id("networks") },
  input: async (ctx, { networkId }, extra: NetworkActionExtra) => {
    const access = extra.readOnly
      ? await ctx.runQuery(membershipForAction, { networkId, minStatus: extra.minStatus ?? "declaree" })
      : await ctx.runMutation(admitActionWrite, { networkId, minStatus: extra.minStatus ?? "declaree", ...(extra.writeBucket ? { bucket: extra.writeBucket } : {}) })
    return { ctx: access, args: {} }
  },
})

export const personQuery = customQuery(query, {
  args: {},
  input: async (ctx) => ({ ctx: { person: await requirePerson(ctx) }, args: {} }),
})

export const personMutation = customMutation(mutation, {
  args: {},
  input: async (ctx) => {
    const person = await requirePerson(ctx)
    await enforceRateLimit(ctx, "person.write", person._id)
    return { ctx: { person }, args: {} }
  },
})

/** L'opérateur de plateforme vivant lié à la session ; `operatorRequired` sinon. */
export async function requireOperator(ctx: QueryCtx): Promise<{ person: Doc<"persons">; operator: Doc<"operators">; operatorSessionProof: Doc<"operatorSessionProofs"> }> {
  const person = await requirePerson(ctx)
  const operator = await ctx.db
    .query("operators")
    .withIndex("by_person", (q) => q.eq("personId", person._id))
    .unique()
  if (!operator || operator.revokedAt !== undefined) return fail("operatorRequired")
  const operatorSessionProof = await requireOperatorSession(ctx, person)
  return { person, operator, operatorSessionProof }
}

/**
 * La MÊME preuve que la console (`operatorQuery`, `operatorMutation`) — opérateur
 * vivant, session scellée par le retour IDN, accès journalisé —, SANS lever :
 * pour une porte de personne qui reconnaît aussi l'opérateur. `null` sinon ;
 * l'appelant rend alors son refus indistinct.
 */
export async function liveOperatorOrNull(ctx: QueryCtx, person: Doc<"persons">): Promise<Doc<"operators"> | null> {
  const operator = await ctx.db
    .query("operators")
    .withIndex("by_person", (q) => q.eq("personId", person._id))
    .unique()
  if (!operator || operator.revokedAt !== undefined) return null
  const proof = await liveOperatorSessionOrNull(ctx, person)
  return proof !== null && proof.accessLoggedAt !== undefined ? operator : null
}

export const operatorQuery = customQuery(query, {
  args: {},
  input: async (ctx, _args, extra: OperatorExtra) => {
    const access = await requireOperator(ctx)
    if (!extra.allowUnloggedAccess && access.operatorSessionProof.accessLoggedAt === undefined) return fail("operatorRequired")
    return { ctx: access, args: {} }
  },
})

export const operatorMutation = customMutation(mutation, {
  args: {},
  input: async (ctx, _args, extra: OperatorExtra) => {
    const access = await requireOperator(ctx)
    if (!extra.allowUnloggedAccess && access.operatorSessionProof.accessLoggedAt === undefined) return fail("operatorRequired")
    await enforceRateLimit(ctx, "operator.write", access.person._id)
    return { ctx: access, args: {} }
  },
})
