/**
 * MC-02 — réglages de modération d'un réseau : lecture bornée et écriture partagées par l'administrateur
 * du réseau (`cases.ts`) et l'opérateur de la console (`platform/console.ts`). Aucune fonction Convex ici :
 * chaque appelant garde sa garde (rôle, réseau actif), son débit et sa ligne de journal (`appendAudit`).
 * Aucun texte de contenu n'est lu ni gardé : un réglage porte des nombres, un mot bloqué est le mot choisi
 * par le réseau.
 */
import {
  admissibleBlockedTerm,
  BLOCKED_TERMS_ACTIVE_MAX,
  isReportOnlySurface,
  MODERATION_POLICY_DEFAULTS,
  MODERATION_POLICY_SURFACES,
  MODERATION_SURFACES,
  moderationPolicyProblem,
  type ModerationSurface,
} from "@antsia/social-domain/moderationPolicy"
import type { PaginationResult } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { fail } from "../../lib/errors"
import { literals } from "../../lib/validators"
import { isDiasporaSurface } from "../diaspora/moderationContent"
import { moderationSurfaceValidator } from "./tables"

type ReadCtx = Pick<QueryCtx, "db">
type WriteCtx = Pick<MutationCtx, "db">

const policyValuesValidator = v.object({ preReview: v.boolean(), maxLinks: v.number(), maxWrites: v.number(), windowMs: v.number() })

/**
 * Ce que fait le moteur pour une surface SANS réglage explicite : `defaults` (règle commune, défauts
 * prudents), `held` (tout contenu attend une relecture : DG-016 et avis de prestation), `unchecked`
 * (contenus de la vague H de DIASPORALE, publiés sans règle, G9). Dit à l'écran, jamais deviné.
 */
const WITHOUT_POLICY = ["defaults", "held", "unchecked"] as const
export type ModerationWithoutPolicy = (typeof WITHOUT_POLICY)[number]
const HELD_WITHOUT_POLICY: ReadonlySet<ModerationSurface> = new Set<ModerationSurface>(["serviceReview", "serviceReviewReply", "commerceOffer", "commerceStorefront", "commerceJob"])

export function moderationWithoutPolicy(surface: ModerationSurface): ModerationWithoutPolicy {
  if (isDiasporaSurface(surface)) return "unchecked"
  return HELD_WITHOUT_POLICY.has(surface) ? "held" : "defaults"
}

/** La projection des réglages : les défauts du moteur, puis une ligne par surface (réglage posé, ou `null`). */
export const moderationSettingsValidator = v.object({
  defaults: policyValuesValidator,
  surfaces: v.array(v.object({
    surface: moderationSurfaceValidator,
    withoutPolicy: literals(WITHOUT_POLICY),
    policy: v.union(v.null(), v.object({ preReview: v.boolean(), maxLinks: v.number(), maxWrites: v.number(), windowMs: v.number(), updatedAt: v.number() })),
  })),
})

export const blockedTermsPageValidator = v.object({
  page: v.array(v.object({ termId: v.id("blockedTerms"), term: v.string(), updatedAt: v.number() })),
  isDone: v.boolean(),
  continueCursor: v.string(),
  splitCursor: v.optional(v.union(v.string(), v.null())),
  pageStatus: v.optional(v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null())),
})

export type ModerationPolicyInput = { surface: ModerationSurface; preReview: boolean; maxLinks: number; maxWrites: number; windowMs: number }

/**
 * Les réglages d'un réseau, une ligne par surface réglable ; au plus une ligne posée par surface (index
 * unique de fait). MC-01 : les surfaces signalables seulement (`REPORT_ONLY_SURFACES`) n'ont aucune règle
 * d'écriture, elles ne sont pas proposées.
 */
export async function moderationSettings(ctx: ReadCtx, networkId: Id<"networks">) {
  // borné : une ligne au plus par surface ; un surplus éventuel est ignoré, jamais lu en entier.
  const rows = await ctx.db.query("moderationPolicies").withIndex("by_network_surface", (q) => q.eq("networkId", networkId)).take(MODERATION_SURFACES.length + 1)
  const bySurface = new Map<ModerationSurface, Doc<"moderationPolicies">>()
  for (const row of rows) if (!bySurface.has(row.surface)) bySurface.set(row.surface, row)
  return {
    defaults: { ...MODERATION_POLICY_DEFAULTS },
    surfaces: MODERATION_POLICY_SURFACES.map((surface) => {
      const row = bySurface.get(surface)
      return { surface, withoutPolicy: moderationWithoutPolicy(surface), policy: row ? { preReview: row.preReview, maxLinks: row.maxLinks, maxWrites: row.maxWrites, windowMs: row.windowMs, updatedAt: row.updatedAt } : null }
    }),
  }
}

/** Les mots bloqués ACTIFS d'un réseau, par pages de 50 au plus. */
export async function blockedTermsPage(ctx: ReadCtx, networkId: Id<"networks">, paginationOpts: { cursor: string | null; numItems: number }): Promise<PaginationResult<{ termId: Id<"blockedTerms">; term: string; updatedAt: number }>> {
  const result = await ctx.db.query("blockedTerms").withIndex("by_network_active", (q) => q.eq("networkId", networkId).eq("active", true)).paginate({ ...paginationOpts, numItems: Math.max(1, Math.min(50, paginationOpts.numItems)) })
  return { ...result, page: result.page.map((row) => ({ termId: row._id, term: row.term, updatedAt: row.updatedAt })) }
}

/** Pose (ou remplace) le réglage d'une surface ; rend la ligne et le détail du journal, sans motif. */
export async function writeModerationPolicy(ctx: WriteCtx, networkId: Id<"networks">, input: ModerationPolicyInput) {
  // MC-01 : un réglage sur une surface sans règle d'écriture serait une promesse sans effet.
  if (isReportOnlySurface(input.surface)) return fail("invalidArgument", { field: "surface" })
  const problem = moderationPolicyProblem(input)
  if (problem) return fail("invalidArgument", { field: problem })
  const existing = await ctx.db.query("moderationPolicies").withIndex("by_network_surface", (q) => q.eq("networkId", networkId).eq("surface", input.surface)).unique()
  const data = { networkId, surface: input.surface, preReview: input.preReview, maxLinks: input.maxLinks, maxWrites: input.maxWrites, windowMs: input.windowMs, updatedAt: Date.now() }
  const policyId = existing ? existing._id : await ctx.db.insert("moderationPolicies", data)
  if (existing) await ctx.db.patch(existing._id, data)
  return { policyId, details: { surface: input.surface, preReview: input.preReview, maxLinks: input.maxLinks, maxWrites: input.maxWrites, windowMs: input.windowMs, replaced: existing !== null } }
}

/** Active ou retire un mot bloqué (normalisé) ; refuse un 101e mot actif. */
export async function writeBlockedTerm(ctx: WriteCtx, networkId: Id<"networks">, rawTerm: string, active: boolean) {
  const term = admissibleBlockedTerm(rawTerm)
  if (term === null) return fail("invalidArgument", { field: "term" })
  const existing = await ctx.db.query("blockedTerms").withIndex("by_network_term", (q) => q.eq("networkId", networkId).eq("term", term)).unique()
  if (active && !existing?.active) {
    // borné : on compte au plus jusqu'au plafond des mots actifs.
    const live = await ctx.db.query("blockedTerms").withIndex("by_network_active", (q) => q.eq("networkId", networkId).eq("active", true)).take(BLOCKED_TERMS_ACTIVE_MAX)
    if (live.length >= BLOCKED_TERMS_ACTIVE_MAX) return fail("policyRefused")
  }
  const termId = existing ? existing._id : await ctx.db.insert("blockedTerms", { networkId, term, active, updatedAt: Date.now() })
  if (existing) await ctx.db.patch(existing._id, { active, updatedAt: Date.now() })
  return { termId, details: { active } }
}
