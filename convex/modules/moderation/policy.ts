/** Garde PA5 partagée ; aucune fonction publique ni dépendance aux constructeurs. */
import { contentNeedsReview, isSanctionLive, MODERATION_SCAN_LIMIT, type ModerationSurface } from "@antsia/social-domain/moderationPolicy"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { fail } from "../../lib/errors"

type ReadCtx = Pick<QueryCtx, "db">

export async function hasLiveGlobalSanction(ctx: ReadCtx, personId: Id<"persons">): Promise<boolean> {
  const rows = await ctx.db.query("sanctions").withIndex("by_person_status", (q) => q.eq("personId", personId).eq("status", "active")).take(MODERATION_SCAN_LIMIT + 1)
  return rows.length > MODERATION_SCAN_LIMIT || rows.some((row) => (row.kind === "suspension" || row.kind === "exclusion") && isSanctionLive(row, Date.now()))
}

export async function assertSocialWriteAllowed(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">): Promise<void> {
  const sanctions = await ctx.db.query("sanctions").withIndex("by_person_status", (q) => q.eq("personId", personId).eq("status", "active")).take(MODERATION_SCAN_LIMIT + 1)
  if (sanctions.length > MODERATION_SCAN_LIMIT) return fail("policyRefused")
  for (const row of sanctions) {
    if (!isSanctionLive(row, Date.now())) continue
    if (row.kind === "suspension" || row.kind === "exclusion") return fail("membershipSuspended")
    if (row.kind === "mute" && row.networkId === networkId) return fail("policyRefused")
  }
}

/** Les masques des déclarants sont relus aussi sur le lien, jamais uniquement dans le fil. */
export async function canReadModeratedContent(ctx: ReadCtx, kind: ModerationSurface, id: string, readerPersonId?: Id<"persons">): Promise<boolean> {
  const state = await ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", kind).eq("targetId", id)).unique()
  if (state?.status === "removed") return false
  if (state?.status === "pending_review" && (state.ownerPersonId === undefined || state.ownerPersonId !== readerPersonId)) {
    if (readerPersonId === undefined) return false
    const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", state.networkId).eq("personId", readerPersonId)).unique()
    if (!membership || (membership.status !== "declaree" && membership.status !== "verifiee") || await hasLiveGlobalSanction(ctx, readerPersonId)) return false
    if (membership.role !== "network_admin") {
      const teams = await ctx.db.query("moderationTeams").withIndex("by_network_active", (q) => q.eq("networkId", state.networkId).eq("active", true)).take(101)
      if (teams.length > 100) return false
      const candidates = teams.filter((team) => team.scope === undefined || team.scope === kind)
      let authorized = candidates.length === 0 && membership.role === "network_moderator"
      for (const team of candidates) {
        const member = await ctx.db.query("moderationTeamMembers").withIndex("by_team_person", (q) => q.eq("teamId", team._id).eq("personId", readerPersonId)).unique()
        if (member?.active) authorized = true
      }
      if (!authorized) return false
    }
  }
  if (readerPersonId === undefined) return true
  const report = await ctx.db.query("reports").withIndex("by_reporter_target", (q) => q.eq("reporterPersonId", readerPersonId).eq("targetKind", kind).eq("targetId", id)).unique()
  return report === null
}

export async function contentState(ctx: ReadCtx, kind: ModerationSurface, id: string) {
  return await ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", kind).eq("targetId", id)).unique()
}

/**
 * P16 : la PAGE qui porte le contenu d'un dossier SANS propriétaire personnel (offre et poste
 * reflétés, réponse d'avis, évènement de page, contenus de page DIASPORALE, page sans
 * créateur), sinon `null`. Un dossier qui a un propriétaire personnel reste le sien seul.
 */
export async function owningPageOfReport(ctx: ReadCtx, report: Pick<Doc<"reports">, "ownerPersonId" | "target">): Promise<Doc<"pages"> | null> {
  if (report.ownerPersonId !== undefined) return null
  if (report.target.kind === "page") return await ctx.db.get(report.target.id)
  const state = await contentState(ctx, report.target.kind, report.target.id)
  return state?.ownerPageId ? await ctx.db.get(state.ownerPageId) : null
}

/** Aucun texte n'est gardé dans cette table. Une édition retirée n'est jamais une republication. */
export async function moderateContentWrite(ctx: Pick<MutationCtx, "db">, input: { networkId: Id<"networks">; ownerPersonId: Id<"persons">; kind: ModerationSurface; id: string; text: string }): Promise<boolean> {
  const existing = await contentState(ctx, input.kind, input.id)
  if (existing?.status === "removed") return fail("policyRefused")
  const policy = await ctx.db.query("moderationPolicies").withIndex("by_network_surface", (q) => q.eq("networkId", input.networkId).eq("surface", input.kind)).unique()
  const terms = await ctx.db.query("blockedTerms").withIndex("by_network_active", (q) => q.eq("networkId", input.networkId).eq("active", true)).take(MODERATION_SCAN_LIMIT + 1)
  const now = Date.now()
  const recent = await ctx.db.query("moderationContentStates").withIndex("by_network_owner_updatedAt", (q) => q.eq("networkId", input.networkId).eq("ownerPersonId", input.ownerPersonId).gte("updatedAt", now - (policy?.windowMs ?? 60_000))).take(MODERATION_SCAN_LIMIT + 1)
  const pending = terms.length > MODERATION_SCAN_LIMIT || contentNeedsReview({ text: input.text, preReview: policy?.preReview ?? false, blockedTerms: terms.map((row) => row.term), maxLinks: policy?.maxLinks ?? 20, recentWrites: recent.filter((row) => row._id !== existing?._id).length, maxWrites: policy?.maxWrites ?? MODERATION_SCAN_LIMIT })
  const status = pending ? "pending_review" as const : "published" as const
  if (existing) await ctx.db.patch(existing._id, { status, updatedAt: now })
  else await ctx.db.insert("moderationContentStates", { networkId: input.networkId, targetKind: input.kind, targetId: input.id, ownerPersonId: input.ownerPersonId, status, createdAt: now, updatedAt: now })
  return !pending
}

/**
 * CC-2b (ADR-0025, D15) : la règle de `moderateContentWrite` — sans prélecture par défaut,
 * politique explicite du réseau admise, termes bloqués, liens et cadence — pour un propriétaire
 * PERSONNE ou PAGE (un message en voix de page appartient à la page, `ownerPageId`). La cadence
 * se compte sur les états du même propriétaire. Aucun texte n'est gardé ; le propriétaire d'un
 * état existant ne change pas.
 */
export async function moderateOwnedContentWrite(
  ctx: Pick<MutationCtx, "db">,
  input: { networkId: Id<"networks">; owner: { personId: Id<"persons"> } | { pageId: Id<"pages"> }; kind: ModerationSurface; id: string; text: string },
): Promise<boolean> {
  const existing = await contentState(ctx, input.kind, input.id)
  if (existing?.status === "removed") return fail("policyRefused")
  const ownerPersonId = "personId" in input.owner ? input.owner.personId : undefined
  const ownerPageId = "pageId" in input.owner ? input.owner.pageId : undefined
  const policy = await ctx.db.query("moderationPolicies").withIndex("by_network_surface", (q) => q.eq("networkId", input.networkId).eq("surface", input.kind)).unique()
  const terms = await ctx.db.query("blockedTerms").withIndex("by_network_active", (q) => q.eq("networkId", input.networkId).eq("active", true)).take(MODERATION_SCAN_LIMIT + 1)
  const now = Date.now()
  const since = now - (policy?.windowMs ?? 60_000)
  const recent = ownerPageId !== undefined
    ? await ctx.db.query("moderationContentStates").withIndex("by_network_page_updatedAt", (q) => q.eq("networkId", input.networkId).eq("ownerPageId", ownerPageId).gte("updatedAt", since)).take(MODERATION_SCAN_LIMIT + 1)
    : await ctx.db.query("moderationContentStates").withIndex("by_network_owner_updatedAt", (q) => q.eq("networkId", input.networkId).eq("ownerPersonId", ownerPersonId).gte("updatedAt", since)).take(MODERATION_SCAN_LIMIT + 1)
  const pending = terms.length > MODERATION_SCAN_LIMIT || contentNeedsReview({ text: input.text, preReview: policy?.preReview ?? false, blockedTerms: terms.map((row) => row.term), maxLinks: policy?.maxLinks ?? 20, recentWrites: recent.filter((row) => row._id !== existing?._id).length, maxWrites: policy?.maxWrites ?? MODERATION_SCAN_LIMIT })
  const status = pending ? "pending_review" as const : "published" as const
  if (existing) await ctx.db.patch(existing._id, { status, updatedAt: now })
  else await ctx.db.insert("moderationContentStates", { networkId: input.networkId, targetKind: input.kind, targetId: input.id, ...(ownerPageId !== undefined ? { ownerPageId } : ownerPersonId !== undefined ? { ownerPersonId } : {}), status, createdAt: now, updatedAt: now })
  return !pending
}

export async function setContentModerationStatus(ctx: Pick<MutationCtx, "db">, input: { networkId: Id<"networks">; kind: ModerationSurface; id: string; ownerPersonId?: Id<"persons"> }, status: "published" | "removed"): Promise<void> {
  const existing = await contentState(ctx, input.kind, input.id)
  const now = Date.now()
  if (existing) await ctx.db.patch(existing._id, { status, updatedAt: now })
  else await ctx.db.insert("moderationContentStates", { networkId: input.networkId, targetKind: input.kind, targetId: input.id, ownerPersonId: input.ownerPersonId, status, createdAt: now, updatedAt: now })
}

/** DG-016 : écriture collective, budget de la page et politique explicite avant publication. */
export async function moderatePageContentWrite(ctx: Pick<MutationCtx, "db">, input: { networkId: Id<"networks">; pageId: Id<"pages">; kind: "serviceReviewReply" | "event" | "commerceOffer" | "commerceStorefront" | "commerceJob" | "post"; id: string; text: string }): Promise<boolean> {
  const existing = await contentState(ctx, input.kind, input.id)
  if (existing && (existing.networkId !== input.networkId || (existing.ownerPageId !== undefined && existing.ownerPageId !== input.pageId))) return fail("notFound")
  if (existing?.status === "removed") return fail("policyRefused")
  const policy = await ctx.db.query("moderationPolicies").withIndex("by_network_surface", (q) => q.eq("networkId", input.networkId).eq("surface", input.kind)).unique()
  const terms = await ctx.db.query("blockedTerms").withIndex("by_network_active", (q) => q.eq("networkId", input.networkId).eq("active", true)).take(MODERATION_SCAN_LIMIT + 1)
  const now = Date.now()
  const recent = await ctx.db.query("moderationContentStates").withIndex("by_network_page_updatedAt", (q) => q.eq("networkId", input.networkId).eq("ownerPageId", input.pageId).gte("updatedAt", now - (policy?.windowMs ?? 60_000))).take(MODERATION_SCAN_LIMIT + 1)
  const pending = !policy || terms.length > MODERATION_SCAN_LIMIT || contentNeedsReview({ text: input.text, preReview: policy.preReview, blockedTerms: terms.map((row) => row.term), maxLinks: policy.maxLinks, recentWrites: recent.filter((row) => row._id !== existing?._id).length, maxWrites: policy.maxWrites })
  const status = pending ? "pending_review" as const : "published" as const
  if (existing) await ctx.db.patch(existing._id, { status, ownerPageId: input.pageId, ownerPersonId: undefined, updatedAt: now })
  else await ctx.db.insert("moderationContentStates", { networkId: input.networkId, targetKind: input.kind, targetId: input.id, ownerPageId: input.pageId, status, createdAt: now, updatedAt: now })
  return !pending
}

/** PA9B : une page est l’auteur ; une décision restrictive locale reste effective. */
export async function moderateFederatedPostWrite(ctx: Pick<MutationCtx, "db">, input: { networkId: Id<"networks">; pageId: Id<"pages">; id: Id<"posts">; text: string }): Promise<boolean> {
  const existing = await contentState(ctx, "post", input.id)
  if (existing?.status === "removed" || existing?.status === "pending_review") return false
  const policy = await ctx.db.query("moderationPolicies").withIndex("by_network_surface", (q) => q.eq("networkId", input.networkId).eq("surface", "post")).unique()
  const terms = await ctx.db.query("blockedTerms").withIndex("by_network_active", (q) => q.eq("networkId", input.networkId).eq("active", true)).take(MODERATION_SCAN_LIMIT + 1)
  const now = Date.now()
  const recent = await ctx.db.query("moderationContentStates").withIndex("by_network_page_updatedAt", (q) => q.eq("networkId", input.networkId).eq("ownerPageId", input.pageId).gte("updatedAt", now - (policy?.windowMs ?? 60_000))).take(MODERATION_SCAN_LIMIT + 1)
  const pending = terms.length > MODERATION_SCAN_LIMIT || contentNeedsReview({ text: input.text, preReview: policy?.preReview ?? false, blockedTerms: terms.map((row) => row.term), maxLinks: policy?.maxLinks ?? 20, recentWrites: recent.filter((row) => row._id !== existing?._id).length, maxWrites: policy?.maxWrites ?? MODERATION_SCAN_LIMIT })
  const status = pending ? "pending_review" as const : "published" as const
  if (existing) await ctx.db.patch(existing._id, { status, ownerPageId: input.pageId, updatedAt: now })
  else await ctx.db.insert("moderationContentStates", { networkId: input.networkId, targetKind: "post", targetId: input.id, ownerPageId: input.pageId, status, createdAt: now, updatedAt: now })
  return !pending
}
