/** La preuve de possession d'un compte Consulat.ga est distincte de l'attestation d'inscription consulaire. */
import { isActiveStatus } from "@antsia/social-domain/membership"
import { v } from "convex/values"
import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { consulatePassConfiguration } from "../../lib/consulatePassConfiguration"
import { currentVerifiedIdnSubjectOf } from "../people/identity"
import { consentInForce, consulateSubjectDigest, effectiveStatusIn, hasConsulatePassAccount, isDiasporaNetwork, privacyOf, rederiveMembership } from "./facts"

const lookupArgs = { networkId: v.id("networks"), personId: v.id("persons"), requestId: v.string() }
const RETRY_MS = 15 * 60_000
const DAY_MS = 24 * 60 * 60_000

async function eligibleSubject(ctx: QueryCtx, networkId: Id<"networks">, person: Doc<"persons">) {
  if (person.withdrawnAt !== undefined || !await consentInForce(ctx, networkId, person._id, "social_profile")) return null
  const network = await ctx.db.get(networkId)
  if (!isDiasporaNetwork(network)) return null
  const access = await effectiveStatusIn(ctx, network, person._id)
  if (!access.status || !isActiveStatus(access.status)) return null
  return await currentVerifiedIdnSubjectOf(ctx, person, 1)
}

/** Quand le membre se représente, une réponse négative peut avoir changé depuis sa visite précédente. */
export async function lookupDue(ctx: QueryCtx, networkId: Id<"networks">, person: Doc<"persons">) {
  if (!consulatePassConfiguration()) return null
  const privacy = await privacyOf(ctx, networkId, person._id)
  if (!privacy || await hasConsulatePassAccount(ctx, person)) return null
  const subject = await eligibleSubject(ctx, networkId, person)
  if (!subject) return null
  const digest = await consulateSubjectDigest(subject)
  if (privacy.consulateLookup?.subjectDigest === digest && privacy.consulateLookup.retryAt > Date.now()) return null
  return { privacy, digest }
}

export async function scheduleConsulateLookup(ctx: MutationCtx, networkId: Id<"networks">, person: Doc<"persons">) {
  const due = await lookupDue(ctx, networkId, person)
  if (!due) return
  const requestId = crypto.randomUUID()
  const previous = due.privacy.consulateLookup
  await ctx.db.patch(due.privacy._id, { consulateLookup: {
    subjectDigest: due.digest, confirmed: previous?.subjectDigest === due.digest && previous.confirmed,
    requestId, retryAt: Date.now() + RETRY_MS,
  } })
  await ctx.scheduler.runAfter(0, internal.modules.diaspora.consulateLookup.fetchMembership, { networkId, personId: person._id, requestId })
}

async function liveRequest(ctx: QueryCtx, args: { networkId: Id<"networks">; personId: Id<"persons">; requestId: string }) {
  const privacy = await privacyOf(ctx, args.networkId, args.personId)
  const lookup = privacy?.consulateLookup
  if (!privacy || !lookup || lookup.requestId !== args.requestId) return null
  const person = await ctx.db.get(args.personId)
  if (!person) return null
  const subject = await eligibleSubject(ctx, args.networkId, person)
  if (!subject || await consulateSubjectDigest(subject) !== lookup.subjectDigest) return null
  return { privacy, lookup, subject }
}

export const lookupSubject = internalQuery({
  args: lookupArgs, returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => (await liveRequest(ctx, args))?.subject ?? null,
})

export const recordResponse = internalMutation({
  args: { ...lookupArgs, verified: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    const current = await liveRequest(ctx, args)
    if (!current) return null
    await ctx.db.patch(current.privacy._id, { consulateLookup: {
      subjectDigest: current.lookup.subjectDigest, confirmed: args.verified, retryAt: Date.now() + (args.verified ? 7 * DAY_MS : RETRY_MS),
    } })
    const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", args.networkId).eq("personId", args.personId)).unique()
    if (membership) await rederiveMembership(ctx, membership, Date.now())
    return null
  },
})

export const fetchMembership = internalAction({
  args: lookupArgs, returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const config = consulatePassConfiguration()
    if (!config) return null
    const idn = await ctx.runQuery(internal.modules.diaspora.consulateLookup.lookupSubject, args)
    if (!idn) return null
    try {
      const res = await fetch(new URL("/diaspora/session/membership", config.issuer), {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
        headers: { Authorization: "Bearer " + config.secret, "Content-Type": "application/json" },
        body: JSON.stringify({ idn }),
      })
      if (!res.ok) return null
      const result: unknown = await res.json()
      if (!result || typeof result !== "object" || !("verified" in result) || typeof result.verified !== "boolean" || Object.keys(result).length !== 1) return null
      await ctx.runMutation(internal.modules.diaspora.consulateLookup.recordResponse, { ...args, verified: result.verified })
    } catch {
      // La réservation permet la reprise après RETRY_MS au prochain passage.
    }
    return null
  },
})
