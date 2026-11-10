/**
 * Les REVENDICATIONS de page (EXF-AN-17) — demander la main sur une page, ou sa
 * vérification, pièces à l'appui ; l'instruction par la modération du réseau.
 *
 * Écrit à neuf (owner map §6.15) : le socle n'avait pas de revendication (une
 * page y était activée pour une organisation déjà connue).
 *
 *  · une page `official` ne se revendique jamais ; une page `verified` non plus
 *    (une contestation passe par la modération) ; une page qui a déjà un
 *    administrateur vivant seulement par l'un d'eux — c'est alors une demande
 *    de VÉRIFICATION, pas une prise de contrôle ;
 *  · les pièces (statuts, récépissé, mandat) passent la garde des fichiers
 *    (usage `page_claim_evidence`, source `page_claim`) et ne sont lues que par
 *    la modération du réseau et le demandeur ; une demande RETIRÉE les purge
 *    aussitôt (la rétention des pièces d'une demande tranchée vient avec PA5) ;
 *  · trancher est une DÉCISION : motivée, tracée (`page.claim_decide`, qualité
 *    du décideur). Validée, elle fait du demandeur un administrateur et de la
 *    page `community` une page `verified`.
 */
import { assertDecisionReason } from "@antsia/social-domain/audit"
import { pageTrustRank, assertPageClaimable, assertPageClaimEvidenceCount, isPageClaimOpen, normalizePageClaimNote } from "@antsia/social-domain/pages"
import { paginationOptsValidator, type PaginationResult } from "convex/server"
import { type Infer, v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { isActiveMember } from "../../lib/access"
import { checked, fail, failRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { guardUploadUrl } from "../../lib/uploadPolicy"
import { assertNativePageManagement } from "../federation/mirrorAccess"
import { admitStoredUpload, assertFreshUpload, findScanByStorageId } from "../files/admission"
import { purgeStoredFile } from "../files/purge"
import { resolveFileDelivery, withheldCodeOf, withheldCodeValidator } from "../files/storageGuard"
import { miniProfileCache } from "../people/miniProfile"
import { appendAudit, networkRoleCapacity } from "../platform/audit"
import { countLiveAdmins, liveSignatoryRole, pageCardOf, signatoryRowOf } from "./access"
import { pageCardValidator, pageClaimDecisionValidator, pageClaimStatusValidator } from "./validators"

type ReadCtx = Pick<QueryCtx, "db" | "storage">

const LIST_PAGE_MAX = 50
const clampPage = (opts: { numItems: number; cursor: string | null }) => ({ ...opts, numItems: Math.min(Math.max(Math.trunc(opts.numItems), 1), LIST_PAGE_MAX) })

const claimDtoValidator = v.object({
  claimId: v.id("pageClaims"),
  page: pageCardValidator,
  claimant: v.object({ personId: v.id("persons"), handle: v.union(v.string(), v.null()), displayName: v.union(v.string(), v.null()), avatarUrl: v.union(v.string(), v.null()) }),
  status: pageClaimStatusValidator,
  note: v.union(v.string(), v.null()),
  evidenceCount: v.number(),
  decisionReason: v.union(v.string(), v.null()),
  createdAt: v.number(),
  decidedAt: v.union(v.number(), v.null()),
})

type ClaimDto = Infer<typeof claimDtoValidator>

async function toClaimDto(ctx: ReadCtx, claim: Doc<"pageClaims">, profileOf: ReturnType<typeof miniProfileCache>): Promise<ClaimDto | null> {
  const page = await ctx.db.get(claim.pageId)
  if (!page) return null
  const claimant = await profileOf(claim.claimantPersonId)
  return {
    claimId: claim._id,
    page: await pageCardOf(ctx, page),
    claimant: { personId: claimant.personId, handle: claimant.handle, displayName: claimant.displayName, avatarUrl: claimant.avatarUrl },
    status: claim.status,
    note: claim.note ?? null,
    evidenceCount: claim.evidenceStorageIds.length,
    decisionReason: claim.decisionReason ?? null,
    createdAt: claim.createdAt,
    decidedAt: claim.decidedAt ?? null,
  }
}

/** Purger les pièces d'une revendication — seulement celles que le registre dit admises pour elle. */
async function purgeClaimEvidence(ctx: MutationCtx, claim: Doc<"pageClaims">): Promise<void> {
  for (const storageId of claim.evidenceStorageIds) {
    const scan = await findScanByStorageId(ctx, storageId)
    if (scan?.source === "page_claim") await purgeStoredFile(ctx, storageId)
  }
}

/** URL de dépôt d'une pièce de revendication (temps 1 de la politique ; le temps 2 est à la demande). */
export const generateClaimEvidenceUploadUrl = networkMutation({
  minStatus: "declaree",
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await enforceRateLimit(ctx, "upload.url", ctx.person._id)
    return await guardUploadUrl(ctx, "page_claim_evidence")
  },
})

/**
 * Revendiquer une page de ce réseau, ou en demander la vérification — un membre
 * déclaré, pièces à l'appui (une à cinq, dépôts NEUFS de la personne). Une
 * seule demande en attente par (page, demandeur).
 */
export const requestPageClaim = networkMutation({
  minStatus: "declaree",
  args: {
    pageId: v.id("pages"),
    note: v.optional(v.string()),
    evidence: v.array(v.object({ storageId: v.id("_storage"), mimeType: v.optional(v.string()) })),
  },
  returns: v.object({ claimId: v.id("pageClaims") }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "page.claim", ctx.person._id)
    const page = await ctx.db.get(args.pageId)
    if (!page || page.networkId !== ctx.networkId || page.status !== "active") return notFound()
    await assertNativePageManagement(ctx, page._id)
    const [myRole, liveAdmins] = await Promise.all([liveSignatoryRole(ctx, page, ctx.person._id), countLiveAdmins(ctx, page)])
    checked(() => assertPageClaimable({ trust: page.trust, hasLiveAdmin: liveAdmins > 0, claimantIsAdmin: myRole === "admin" }))
    const pending = await ctx.db
      .query("pageClaims")
      .withIndex("by_page_claimant_status", (q) => q.eq("pageId", page._id).eq("claimantPersonId", ctx.person._id).eq("status", "pending"))
      .first()
    if (pending) return failRule("PAGE_CLAIM_PENDING")
    checked(() => assertPageClaimEvidenceCount(args.evidence.length))
    const note = checked(() => normalizePageClaimNote(args.note))
    const evidenceStorageIds: Id<"_storage">[] = []
    for (const item of args.evidence) {
      if (evidenceStorageIds.includes(item.storageId)) continue
      await assertFreshUpload(ctx, ctx.person._id, item.storageId)
      await admitStoredUpload(
        ctx,
        { storageId: item.storageId, usage: "page_claim_evidence", ...(item.mimeType ? { mimeType: item.mimeType } : {}) },
        { source: "page_claim", networkId: ctx.networkId, uploadedByPersonId: ctx.person._id },
      )
      evidenceStorageIds.push(item.storageId)
    }
    const now = Date.now()
    const claimId = await ctx.db.insert("pageClaims", {
      networkId: ctx.networkId,
      pageId: page._id,
      claimantPersonId: ctx.person._id,
      ...(note !== undefined ? { note } : {}),
      evidenceStorageIds,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    })
    return { claimId }
  },
})

/** Retirer MA demande en attente — ses pièces sont purgées aussitôt. Ce qui n'est plus en attente rend `false`. */
export const withdrawPageClaim = networkMutation({
  minStatus: "en_attente",
  args: { claimId: v.id("pageClaims") },
  returns: v.object({ withdrawn: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "page.manage", ctx.person._id)
    const claim = await ctx.db.get(args.claimId)
    if (!claim || claim.networkId !== ctx.networkId || claim.claimantPersonId !== ctx.person._id) return notFound()
    if (!isPageClaimOpen(claim.status)) return { withdrawn: false }
    const now = Date.now()
    await ctx.db.patch(claim._id, { status: "withdrawn", evidenceStorageIds: [], updatedAt: now })
    await purgeClaimEvidence(ctx, claim)
    return { withdrawn: true }
  },
})

/** MES revendications dans ce réseau, les plus récentes d'abord. */
export const paginateMyPageClaims = networkQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<ClaimDto>> => {
    const result = await ctx.db
      .query("pageClaims")
      .withIndex("by_network_claimant_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("claimantPersonId", ctx.person._id))
      .order("desc")
      .paginate(clampPage(args.paginationOpts))
    const profileOf = miniProfileCache(ctx)
    const page: ClaimDto[] = []
    for (const claim of result.page) {
      const dto = await toClaimDto(ctx, claim, profileOf)
      if (dto) page.push(dto)
    }
    return { ...result, page }
  },
})

/**
 * La FILE des revendications d'un réseau (« pages à vérifier ») — sa modération
 * seule (modérateurs et administrateurs du réseau) ; tout autre lecteur reçoit
 * le refus indistinct. Les plus anciennes d'abord : une file se vide par le bas.
 */
export const paginatePageClaims = networkQuery({
  args: { status: v.optional(pageClaimStatusValidator), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<ClaimDto>> => {
    if (networkRoleCapacity(ctx.membership.role) === null) return notFound()
    const status = args.status ?? "pending"
    const result = await ctx.db
      .query("pageClaims")
      .withIndex("by_network_status_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("status", status))
      .order("asc")
      .paginate(clampPage(args.paginationOpts))
    const profileOf = miniProfileCache(ctx)
    const page: ClaimDto[] = []
    for (const claim of result.page) {
      const dto = await toClaimDto(ctx, claim, profileOf)
      if (dto) page.push(dto)
    }
    return { ...result, page }
  },
})

/**
 * UNE revendication, ses pièces comprises — la modération du réseau, ou son
 * demandeur. Chaque pièce est servie par la garde des fichiers (`null` avec la
 * retenue tant que l'analyse n'a pas parlé, ou si elle a bloqué).
 */
export const getPageClaim = networkQuery({
  args: { claimId: v.id("pageClaims") },
  returns: v.object({ ...claimDtoValidator.fields, evidence: v.array(v.object({ url: v.union(v.string(), v.null()), withheld: v.union(withheldCodeValidator, v.null()) })) }),
  handler: async (ctx, args) => {
    const claim = await ctx.db.get(args.claimId)
    if (!claim || claim.networkId !== ctx.networkId) return notFound()
    if (claim.claimantPersonId !== ctx.person._id && networkRoleCapacity(ctx.membership.role) === null) return notFound()
    const dto = await toClaimDto(ctx, claim, miniProfileCache(ctx))
    if (!dto) return notFound()
    const evidence = []
    for (const storageId of claim.evidenceStorageIds) {
      const delivery = await resolveFileDelivery(ctx, storageId)
      evidence.push({ url: delivery.url, withheld: withheldCodeOf(delivery.scan) })
    }
    return { ...dto, evidence }
  },
})

/**
 * TRANCHER une revendication — la modération du réseau. Motivée (motif borné),
 * tracée (`page.claim_decide`). Validée : le demandeur, encore membre actif du
 * réseau, devient administrateur (habilitation acceptée, c'est sa demande) et
 * une page `community` devient `verified`. Une décision est définitive.
 */
export const decidePageClaim = networkMutation({
  minStatus: "declaree",
  args: { claimId: v.id("pageClaims"), decision: pageClaimDecisionValidator, reason: v.string() },
  returns: v.object({ status: pageClaimStatusValidator }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "moderation.decide", ctx.person._id)
    const capacity = networkRoleCapacity(ctx.membership.role)
    if (capacity === null) return notFound()
    const claim = await ctx.db.get(args.claimId)
    if (!claim || claim.networkId !== ctx.networkId) return notFound()
    if (!isPageClaimOpen(claim.status)) return fail("conflict")
    const decisionReason = checked(() => assertDecisionReason(args.reason, 3))
    const page = await ctx.db.get(claim.pageId)
    if (!page) return notFound()
    const now = Date.now()
    let trust = page.trust
    if (args.decision === "approved") {
      await assertNativePageManagement(ctx, page._id)
      if (page.trust === "official") return failRule("PAGE_NOT_CLAIMABLE")
      if (!(await isActiveMember(ctx, page.networkId, claim.claimantPersonId))) return fail("conflict")
      const row = await signatoryRowOf(ctx, page._id, claim.claimantPersonId)
      if (row) await ctx.db.patch(row._id, { role: "admin", acceptedAt: row.acceptedAt ?? now,
        ...(row.role !== "admin" || row.acceptedAt === undefined ? { authorityRevision: (row.authorityRevision ?? 0) + 1 } : {}), updatedAt: now })
      else await ctx.db.insert("pageSignatories", { networkId: page.networkId, pageId: page._id, personId: claim.claimantPersonId, role: "admin", authorityRevision: 0, acceptedAt: now, createdAt: now, updatedAt: now })
      if (page.trust === "community") {
        trust = "verified"
        await ctx.db.patch(page._id, { trust, trustRank: pageTrustRank(trust), updatedAt: now })
      }
    }
    await ctx.db.patch(claim._id, { status: args.decision, decidedByPersonId: ctx.person._id, decisionReason, decidedAt: now, updatedAt: now })
    await appendAudit(ctx, {
      action: "page.claim_decide",
      capacity,
      actorPersonId: ctx.person._id,
      networkId: ctx.networkId,
      subject: { table: "pageClaims", id: claim._id },
      details: { pageId: page._id, claimantPersonId: claim.claimantPersonId, decision: args.decision, decisionReason, previousTrust: page.trust, trust },
      at: now,
    })
    return { status: args.decision }
  },
})
