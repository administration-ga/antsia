/**
 * Adhésions — entrer, quitter, suspendre (cahier EXF-AN-02, invariants 3 et 7).
 *
 * - Entrer dans un réseau applique SA politique (statut d'entrée), exige le
 *   consentement au profil social et un profil choisi, pose la facette si le
 *   réseau en déclare une, et crée (ou maintient) l'adhésion DÉRIVÉE à la racine.
 * - Quitter un réseau fermé ne retire pas la racine ; quitter la racine fait
 *   quitter tous les réseaux fermés.
 * - Suspendre à la racine suspend partout (la garde le lit à chaque appel).
 * - Un réseau gouverné par une tranche (`networks.managedBy`) n'entre que par
 *   elle (aides partagées : `./admission`) ; le quitter reste toujours possible.
 */
import { assertDecisionReason } from "@antsia/social-domain/audit"
import { missingConsentsToJoin } from "@antsia/social-domain/consent"
import { type EntryEvidence, entryStatusFor, leaveCascades, nextMembershipStatus } from "@antsia/social-domain/membership"
import { v } from "convex/values"

import type { Doc } from "../../_generated/dataModel"
import { type MutationCtx, query } from "../../_generated/server"
import { effectiveMembershipStatus, getCurrentPerson, getMembership, getRootNetwork } from "../../lib/access"
import { checked, fail, notFound } from "../../lib/errors"
import { operatorMutation, personMutation } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import {
  facetValueValidator,
  facetVisibilityValidator,
  membershipRoleValidator,
  membershipStatusValidator,
  networkKindValidator,
} from "../../lib/validators"
import { appendAudit, operatorCapacity } from "../platform/audit"
import { revokeAdministrationForPerson } from "../federation/agentLifecycle"
import { admitToNetwork, setMembershipStatus, writeNetworkFacet } from "./admission"
import { hasStrongIdentityFor } from "./persons"
import { refreshReaderContexts, scheduleReaderRefresh } from "../posts/feedMaterialization"

const facetInputValidator = v.object({
  values: v.record(v.string(), facetValueValidator),
  visibilities: v.record(v.string(), facetVisibilityValidator),
})

/**
 * @selfScoped La personne de la session demande à entrer dans un réseau : la
 * politique du réseau décide du statut (aucun profil ni adhésion d'office). Un
 * réseau gouverné par une tranche (`managedBy`) n'entre que par elle.
 */
export const joinNetwork = personMutation({
  args: { networkId: v.id("networks"), facet: v.optional(facetInputValidator) },
  returns: v.object({ status: membershipStatusValidator, rootStatus: membershipStatusValidator }),
  handler: async (ctx, { networkId, facet }) => {
    await enforceRateLimit(ctx, "network.join", ctx.person._id)
    const network = await ctx.db.get(networkId)
    if (!network || network.status !== "active") return notFound()
    // Ses règles d'admission sont propres (nationalité, parrainage, attestation…) :
    // le chemin générique les contournerait.
    if (network.managedBy) return fail("policyRefused")
    const root = network.kind === "root" ? network : await getRootNetwork(ctx)
    if (!root) return notFound()

    if (!ctx.person.handle || !ctx.person.displayName || ctx.person.publishedAt === undefined) fail("profileRequired")
    // borné : un consentement par finalité et par réseau.
    const consents = await ctx.db
      .query("consents")
      .withIndex("by_person_and_purpose", (q) => q.eq("personId", ctx.person._id))
      .take(100)
    if (missingConsentsToJoin(consents).length > 0) fail("consentRequired")

    const evidence: EntryEvidence = {
      strongIdentity: await hasStrongIdentityFor(ctx, ctx.person._id),
      externalVerification: false,
      sponsored: false,
    }
    const entry = entryStatusFor(network.membershipPolicy, evidence)
    if (entry === null) return fail("policyRefused")

    const admitted = await admitToNetwork(ctx, { personId: ctx.person._id, network, root, entry, evidence })
    await writeNetworkFacet(ctx, network, ctx.person._id, facet)
    await refreshReaderContexts(ctx, network._id, ctx.person._id)
    return admitted
  },
})

/**
 * @selfScoped La personne de la session quitte un réseau ; quitter la racine
 * fait quitter tous les réseaux fermés (un membre d'un enfant est membre de la racine).
 */
export const leaveNetwork = personMutation({
  args: { networkId: v.id("networks") },
  returns: v.null(),
  handler: async (ctx, { networkId }) => {
    await enforceRateLimit(ctx, "network.leave", ctx.person._id)
    const network = await ctx.db.get(networkId)
    if (!network) return notFound()
    const membership = await getMembership(ctx, network._id, ctx.person._id)
    if (!membership) return notFound()
    if (network.kind === "root" || (network.slug === "administration" && network.membershipPolicy === "mirror")) {
      await revokeAdministrationForPerson(ctx, ctx.person._id)
    }
    if (nextMembershipStatus(membership.status, { kind: "leave" }) === null) {
      return membership.status === "suspendue" ? fail("membershipSuspended") : fail("conflict")
    }
    const now = Date.now()
    await setMembershipStatus(ctx, membership, "partie", { leftAt: now })
    if (leaveCascades(network.kind) === "children_too") {
      for (const status of ["en_attente", "declaree", "verifiee"] as const) {
        // borné : une personne appartient à peu de réseaux ; 200 par statut au plus.
        const others = await ctx.db
          .query("networkMemberships")
          .withIndex("by_person_and_status", (q) => q.eq("personId", ctx.person._id).eq("status", status))
          .take(200)
        for (const other of others) if (other._id !== membership._id) await setMembershipStatus(ctx, other, "partie", { leftAt: now })
      }
    }
    return null
  },
})

/**
 * La suspension à la racine elle-même (transition `suspend`) : le statut d'avant
 * gardé pour la levée, l'échéance éventuelle ; elle vaut PARTOUT, la garde la lit
 * à chaque appel. Partagée par la console (`suspendEverywhere`, qui l'audite) et
 * par les comptes de démonstration de DIASPORALE (`diaspora/demoAccounts`,
 * développement local). `false` : transition refusée (déjà suspendue, ou partie).
 */
export async function suspendRootMembership(ctx: MutationCtx, rootMembership: Doc<"networkMemberships">, until?: number): Promise<boolean> {
  const next = nextMembershipStatus(rootMembership.status, { kind: "suspend" })
  if (!next) return false
  const before = rootMembership.status === "en_attente" || rootMembership.status === "declaree" || rootMembership.status === "verifiee" ? rootMembership.status : undefined
  await setMembershipStatus(ctx, rootMembership, next, {
    ...(before ? { statusBeforeSuspension: before } : {}),
    ...(until !== undefined ? { suspendedUntil: until } : {}),
  })
  return true
}

/** Console : suspendre une personne PARTOUT (suspension à la racine). La modération à l'échelle (PA5) s'appuie dessus. */
export const suspendEverywhere = operatorMutation({
  args: { personId: v.id("persons"), until: v.optional(v.number()), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, { personId, until, reason }) => {
    await enforceRateLimit(ctx, "operator.membership", ctx.person._id)
    const motive = checked(() => assertDecisionReason(reason, 10))
    const root = await getRootNetwork(ctx)
    if (!root) return notFound()
    const membership = await getMembership(ctx, root._id, personId)
    if (!membership) return notFound()
    if (!(await suspendRootMembership(ctx, membership, until))) return fail("conflict")
    await appendAudit(ctx, {
      action: "membership.suspend_everywhere",
      capacity: operatorCapacity(ctx.operator),
      actorPersonId: ctx.person._id,
      networkId: root._id,
      subject: { table: "persons", id: personId },
      details: { reason: motive, from: membership.status, ...(until !== undefined ? { until } : {}) },
    })
    return null
  },
})

/** Console : lever une suspension à la racine (rend le statut d'avant), motif à l'appui. */
export const liftSuspension = operatorMutation({
  args: { personId: v.id("persons"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, { personId, reason }) => {
    await enforceRateLimit(ctx, "operator.membership", ctx.person._id)
    const motive = checked(() => assertDecisionReason(reason, 10))
    const root = await getRootNetwork(ctx)
    if (!root) return notFound()
    const membership = await getMembership(ctx, root._id, personId)
    if (!membership || membership.status !== "suspendue") return notFound()
    const restoreTo = membership.statusBeforeSuspension ?? "declaree"
    await setMembershipStatus(ctx, membership, restoreTo, { statusBeforeSuspension: undefined, suspendedUntil: undefined })
    await scheduleReaderRefresh(ctx, personId)
    await appendAudit(ctx, {
      action: "membership.lift_suspension",
      capacity: operatorCapacity(ctx.operator),
      actorPersonId: ctx.person._id,
      networkId: root._id,
      subject: { table: "persons", id: personId },
      details: { reason: motive, to: restoreTo },
    })
    return null
  },
})

/**
 * @selfScoped Les adhésions de la personne de la session (actives et suspendues),
 * avec le nom et la nature de chaque réseau.
 */
export const myMemberships = query({
  args: {},
  returns: v.array(
    v.object({
      networkId: v.id("networks"),
      slug: v.string(),
      name: v.string(),
      kind: networkKindValidator,
      status: membershipStatusValidator,
      role: membershipRoleValidator,
      derivedFrom: v.optional(v.id("networks")),
    }),
  ),
  handler: async (ctx) => {
    const person = await getCurrentPerson(ctx)
    if (!person) return []
    const rows: Doc<"networkMemberships">[] = []
    for (const status of ["en_attente", "declaree", "verifiee", "suspendue"] as const) {
      // borné : une personne appartient à peu de réseaux ; 200 par statut au plus.
      rows.push(
        ...(await ctx.db
          .query("networkMemberships")
          .withIndex("by_person_and_status", (q) => q.eq("personId", person._id).eq("status", status))
          .take(200)),
      )
    }
    const result = []
    for (const row of rows) {
      const network = await ctx.db.get(row.networkId)
      if (!network || network.status !== "active") continue
      result.push({
        networkId: network._id,
        slug: network.slug,
        name: network.name,
        kind: network.kind,
        status: network.kind === "root" ? (effectiveMembershipStatus(row) ?? row.status) : row.status,
        role: row.role,
        ...(row.derivedFrom ? { derivedFrom: row.derivedFrom } : {}),
      })
    }
    return result
  },
})
