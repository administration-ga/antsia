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
 *    aussitôt ; celles d'une demande TRANCHÉE sont purgées au terme de
 *    `PAGE_CLAIM_EVIDENCE_RETENTION_DAYS` (PG-01, valeur à valider), échéance
 *    rendue par les lectures (`evidencePurgeAt`, AS-01) ;
 *  · la modération qui INSTRUIT (`pageClaimReviewer`, AS-01) : un rôle de
 *    réseau, ou le membre actif de l'équipe de modération vivante compétente
 *    pour la page (CH-815 : celle de son pays, règle de `moderation/routing`) ;
 *  · trancher est une DÉCISION : motivée, tracée (`page.claim_decide`, qualité
 *    du décideur). Validée, elle fait du demandeur un administrateur et de la
 *    page `community` une page `verified`. Le demandeur et tout signataire de la
 *    page (même invité) ne tranchent jamais ; le demandeur reçoit une cloche
 *    neutre (`page_claim_decided`, PG-01), la décision motivée se relit ici.
 */
import { assertDecisionReason, type AuditCapacity } from "@antsia/social-domain/audit"
import type { ModerationSurface } from "@antsia/social-domain/moderationPolicy"
import { chooseModerationTeam } from "@antsia/social-domain/moderationRouting"
import { pageTrustRank, assertPageClaimable, assertPageClaimEvidenceCount, isPageClaimOpen, normalizePageClaimNote, PAGE_CLAIM_EVIDENCE_RETENTION_MS, pageSleepState } from "@antsia/social-domain/pages"
import { makeFunctionReference, paginationOptsValidator, type PaginationResult } from "convex/server"
import { type Infer, v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { isActiveMember } from "../../lib/access"
import { checked, fail, failRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { guardUploadUrl } from "../../lib/uploadPolicy"
import { assertNativePageManagement } from "../federation/mirrorAccess"
import { admitStoredUpload, assertFreshUpload, findScanByStorageId } from "../files/admission"
import { purgeStoredFile } from "../files/purge"
import { resolveFileDelivery, withheldCodeOf, withheldCodeValidator } from "../files/storageGuard"
import { teamCapacity } from "../moderation/cases"
import { activeModerationTeams, MODERATION_TEAMS_MAX, routeModerationContent } from "../moderation/routing"
import { notifyPerson } from "../notifications/notify"
import { miniProfileCache } from "../people/miniProfile"
import { appendAudit, networkRoleCapacity } from "../platform/audit"
import { countLiveAdmins, liveSignatoryRole, pageCardOf, signatoryRowOf } from "./access"
import { applyTeamRoleTransition } from "./signatories"
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
  /**
   * AS-01 : quand les pièces d'une demande TRANCHÉE seront supprimées (PG-01) ; `null` s'il n'y a
   * pas d'échéance : demande en attente ou retirée, pièces déjà purgées, ou demande tranchée avant
   * PG-01 (aucune échéance écrite). Facultatif : un lecteur antérieur l'ignore.
   */
  evidencePurgeAt: v.optional(v.union(v.number(), v.null())),
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
    evidencePurgeAt: claim.evidencePurgeAt ?? null,
  }
}

/**
 * Un CONFLIT d'intérêts : le demandeur, ou toute personne qui a une ligne de signataire sur la
 * page (administrateur, signataire, invitation en attente), ne tranche jamais la revendication.
 */
async function hasClaimConflict(ctx: Pick<QueryCtx, "db">, claim: Doc<"pageClaims">, personId: Id<"persons">): Promise<boolean> {
  if (claim.claimantPersonId === personId) return true
  return (await signatoryRowOf(ctx, claim.pageId, personId)) !== null
}

/** La NATURE de contenu d'une page pour les équipes de modération (`moderationTeams.scope`). */
const PAGE_SURFACE: ModerationSurface = "page"

/** Le lecteur d'une fonction de réseau : son réseau, sa personne, son adhésion relue par le constructeur. */
type ClaimActor = { networkId: Id<"networks">; person: Doc<"persons">; membership: Doc<"networkMemberships"> }

/** À quel titre une personne instruit UNE revendication ; `teamId` : par quelle équipe (sinon `null`). */
export type PageClaimReviewCapacity = { capacity: AuditCapacity; teamId: Id<"moderationTeams"> | null }

/**
 * AS-01, CH-815 (ADR-0042, amendement « Routage des signalements par pays ») — qui INSTRUIT les
 * revendications d'un réseau (file, fiche et pièces, décision), relu une fois par appel :
 *  · un rôle de réseau (`network_admin`, `network_moderator`) : toutes les pages, comme avant ;
 *  · sinon le membre actif d'une équipe de modération vivante qui REÇOIT des revendications : pour une page,
 *    l'équipe à qui le moteur adresse un signalement de cette page (`moderation/routing`, comme
 *    `cases.report`) — l'équipe du pays de la page, de nature `page` puis généraliste, à défaut l'équipe
 *    sans pays de nature `page` puis l'équipe sans pays ni nature. Une équipe d'une autre nature ne gagne
 *    rien ; une équipe sans nature non plus dès qu'une équipe `page` la précède ; une équipe d'un pays
 *    n'instruit que les pages de son pays, jamais une page sans pays. Qualité au journal :
 *    `moderation_team_member`, avec l'équipe ;
 *  · `null` pour tout autre lecteur : l'appelant rend le refus indistinct.
 * La page elle-même se juge par `pageClaimReviewCapacityFor`. Le conflit d'intérêts (`hasClaimConflict`)
 * se juge à part, revendication par revendication.
 */
export type PageClaimReviewer =
  | { readonly kind: "network"; readonly capacity: AuditCapacity }
  | { readonly kind: "teams"; readonly teams: readonly Doc<"moderationTeams">[]; readonly mine: ReadonlySet<Id<"moderationTeams">> }

export async function pageClaimReviewer(ctx: Pick<QueryCtx, "db">, actor: ClaimActor): Promise<PageClaimReviewer | null> {
  const role = networkRoleCapacity(actor.membership.role)
  if (role !== null) return { kind: "network", capacity: role }
  // borné : 100 équipes vivantes au plus par réseau (`cases.createTeam`) ; au-delà, aucune compétence d'équipe.
  const teams = await activeModerationTeams(ctx, actor.networkId)
  if (teams.length > MODERATION_TEAMS_MAX) return null
  // Les équipes qui reçoivent une revendication pour AU MOINS un pays : celle d'une page sans pays (que reçoit
  // aussi tout pays sans équipe), et celle de chaque pays porté par une équipe.
  const countries = new Set<string | null>([null])
  for (const team of teams) if (team.country !== undefined) countries.add(team.country)
  const mine = new Set<Id<"moderationTeams">>()
  for (const country of countries) {
    const team = chooseModerationTeam(teams, PAGE_SURFACE, country)
    if (team && !mine.has(team._id) && (await teamCapacity(ctx, actor, PAGE_SURFACE, team._id)) !== null) mine.add(team._id)
  }
  return mine.size === 0 ? null : { kind: "teams", teams, mine }
}

/** À quel titre ce lecteur instruit la revendication de CETTE page, ou `null` (elle revient à une autre équipe). */
export async function pageClaimReviewCapacityFor(ctx: Pick<QueryCtx, "db">, reviewer: PageClaimReviewer, page: Doc<"pages">): Promise<PageClaimReviewCapacity | null> {
  if (reviewer.kind === "network") return { capacity: reviewer.capacity, teamId: null }
  const team = await routeModerationContent(ctx, page.networkId, PAGE_SURFACE, page._id, reviewer.teams)
  return team !== undefined && reviewer.mine.has(team._id) ? { capacity: "moderation_team_member", teamId: team._id } : null
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
  feature: "pages",
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
  feature: "pages",
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
  feature: "pages",
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
  feature: "pages",
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
 * AS-01 — le lecteur instruit-il des revendications de ce réseau (`pageClaimReviewer`) ? CH-815 : un membre
 * d'équipe n'en instruit que celles des pages de son pays ; la file les trie.
 * Il ne parle que de lui-même : `false` n'est pas un refus, et rien n'est dit des équipes ni de
 * leurs membres. `/moderation` d'antsia.ga en tire l'onglet « Pages à vérifier ». Même statut
 * minimal que `cases.myCapacity`, que cet écran lit à côté.
 */
export const myPageClaimReview = networkQuery({
  feature: "pages",
  minStatus: "declaree",
  args: {},
  returns: v.object({ canReview: v.boolean() }),
  handler: async (ctx) => ({ canReview: (await pageClaimReviewer(ctx, ctx)) !== null }),
})

/**
 * La FILE des revendications d'un réseau (« pages à vérifier ») — sa modération
 * seule (rôle de réseau, ou membre de l'équipe compétente pour la page : `pageClaimReviewer`) ;
 * tout autre lecteur reçoit le refus indistinct. Les plus anciennes d'abord : une
 * file se vide par le bas.
 */
export const paginatePageClaims = networkQuery({
  feature: "pages",
  args: { status: v.optional(pageClaimStatusValidator), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<ClaimDto>> => {
    const reviewer = await pageClaimReviewer(ctx, ctx)
    if (reviewer === null) return notFound()
    const status = args.status ?? "pending"
    const result = await ctx.db
      .query("pageClaims")
      .withIndex("by_network_status_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("status", status))
      .order("asc")
      .paginate(clampPage(args.paginationOpts))
    const profileOf = miniProfileCache(ctx)
    const page: ClaimDto[] = []
    for (const claim of result.page) {
      // CH-815 : un membre d'équipe ne lit que les revendications des pages de son pays.
      const target = await ctx.db.get(claim.pageId)
      if (!target || (await pageClaimReviewCapacityFor(ctx, reviewer, target)) === null) continue
      const dto = await toClaimDto(ctx, claim, profileOf)
      if (dto) page.push(dto)
    }
    return { ...result, page }
  },
})

/**
 * UNE revendication, ses pièces comprises — la modération du réseau
 * compétente pour la page (`pageClaimReviewer`), ou son demandeur. Chaque pièce est servie par la
 * garde des fichiers (`null` avec la retenue tant que l'analyse n'a pas parlé, ou
 * si elle a bloqué) ; l'échéance de leur suppression est `evidencePurgeAt`.
 */
export const getPageClaim = networkQuery({
  feature: "pages",
  args: { claimId: v.id("pageClaims") },
  returns: v.object({
    ...claimDtoValidator.fields,
    evidence: v.array(v.object({ url: v.union(v.string(), v.null()), withheld: v.union(withheldCodeValidator, v.null()) })),
    /** PG-01 : le lecteur peut-il trancher MAINTENANT ? (modération du réseau ou équipe compétente — AS-01 —, demande en attente, sans conflit d'intérêts) */
    canDecide: v.optional(v.boolean()),
  }),
  handler: async (ctx, args) => {
    const claim = await ctx.db.get(args.claimId)
    if (!claim || claim.networkId !== ctx.networkId) return notFound()
    const page = await ctx.db.get(claim.pageId)
    const instructor = await pageClaimReviewer(ctx, ctx)
    const reviewer = page !== null && instructor !== null && (await pageClaimReviewCapacityFor(ctx, instructor, page)) !== null
    if (claim.claimantPersonId !== ctx.person._id && !reviewer) return notFound()
    const dto = await toClaimDto(ctx, claim, miniProfileCache(ctx))
    if (!dto) return notFound()
    const evidence = []
    for (const storageId of claim.evidenceStorageIds) {
      const delivery = await resolveFileDelivery(ctx, storageId)
      evidence.push({ url: delivery.url, withheld: withheldCodeOf(delivery.scan) })
    }
    const canDecide = reviewer && isPageClaimOpen(claim.status) && !(await hasClaimConflict(ctx, claim, ctx.person._id))
    return { ...dto, evidence, canDecide }
  },
})

/**
 * TRANCHER une revendication — la modération du réseau (`pageClaimReviewer` :
 * rôle de réseau, ou membre de l'équipe compétente pour la page, AS-01 et CH-815). Motivée (motif borné),
 * tracée (`page.claim_decide`, à la qualité du décideur, avec son équipe s'il
 * tranche par elle). Validée : le demandeur, encore membre actif du
 * réseau, devient administrateur (habilitation acceptée, c'est sa demande) et
 * une page `community` devient `verified`. Une décision est définitive.
 * PG-01 : le demandeur et les signataires de la page reçoivent le refus
 * indistinct ; la conservation des pièces court dès la décision ; le demandeur
 * est averti par une cloche sans contenu.
 */
export const decidePageClaim = networkMutation({
  feature: "pages",
  minStatus: "declaree",
  args: { claimId: v.id("pageClaims"), decision: pageClaimDecisionValidator, reason: v.string() },
  returns: v.object({ status: pageClaimStatusValidator }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "moderation.decide", ctx.person._id)
    const instructor = await pageClaimReviewer(ctx, ctx)
    if (instructor === null) return notFound()
    const claim = await ctx.db.get(args.claimId)
    if (!claim || claim.networkId !== ctx.networkId) return notFound()
    const page = await ctx.db.get(claim.pageId)
    if (!page) return notFound()
    // CH-815 : l'équipe du pays de la page, relue à l'acte ; une autre équipe reçoit le refus indistinct.
    const reviewer = await pageClaimReviewCapacityFor(ctx, instructor, page)
    if (reviewer === null) return notFound()
    if (await hasClaimConflict(ctx, claim, ctx.person._id)) return notFound()
    if (!isPageClaimOpen(claim.status)) return fail("conflict")
    const decisionReason = checked(() => assertDecisionReason(args.reason, 3))
    const now = Date.now()
    let trust = page.trust
    if (args.decision === "approved") {
      await assertNativePageManagement(ctx, page._id)
      if (page.trust === "official") return failRule("PAGE_NOT_CLAIMABLE")
      // AS-11a : l'équipe d'une page EN SOMMEIL est figée — aucune revendication ne la change ; le refus reste
      // possible. Une règle dite (pas `conflict`, que le bureau lit « déjà tranchée ») : la demande reste en attente.
      if (pageSleepState(page, now) !== "none") return failRule("PAGE_ASLEEP")
      if (!(await isActiveMember(ctx, page.networkId, claim.claimantPersonId))) return fail("conflict")
      const row = await signatoryRowOf(ctx, page._id, claim.claimantPersonId)
      if (row) await ctx.db.patch(row._id, { role: "admin", acceptedAt: row.acceptedAt ?? now,
        ...(row.role !== "admin" || row.acceptedAt === undefined ? { authorityRevision: (row.authorityRevision ?? 0) + 1 } : {}), updatedAt: now })
      else await ctx.db.insert("pageSignatories", { networkId: page.networkId, pageId: page._id, personId: claim.claimantPersonId, role: "admin", authorityRevision: 0, acceptedAt: now, createdAt: now, updatedAt: now })
      // AS-10 : qui ne parlait pas au nom de la page (modérateur, invitation en attente, personne sans ligne) y parle désormais.
      await applyTeamRoleTransition(ctx, {
        networkId: page.networkId, pageId: page._id, personId: claim.claimantPersonId,
        before: row ? { role: row.role, accepted: row.acceptedAt !== undefined } : null, after: { role: "admin", accepted: true },
      })
      if (page.trust === "community") {
        trust = "verified"
        await ctx.db.patch(page._id, { trust, trustRank: pageTrustRank(trust), updatedAt: now })
      }
    }
    await ctx.db.patch(claim._id, {
      status: args.decision, decidedByPersonId: ctx.person._id, decisionReason, decidedAt: now, updatedAt: now,
      ...(claim.evidenceStorageIds.length > 0 ? { evidencePurgeAt: now + PAGE_CLAIM_EVIDENCE_RETENTION_MS } : {}),
    })
    await appendAudit(ctx, {
      action: "page.claim_decide",
      capacity: reviewer.capacity,
      actorPersonId: ctx.person._id,
      networkId: ctx.networkId,
      subject: { table: "pageClaims", id: claim._id },
      details: {
        pageId: page._id, claimantPersonId: claim.claimantPersonId, decision: args.decision, decisionReason, previousTrust: page.trust, trust,
        ...(reviewer.teamId !== null ? { teamId: reviewer.teamId } : {}),
      },
      at: now,
    })
    // PG-01 : le demandeur seul est averti — ni nom de page, ni sens de la décision, ni motif dans la cloche.
    await notifyPerson(ctx, { networkId: claim.networkId, recipientPersonId: claim.claimantPersonId, kind: "page_claim_decided", subject: { pageClaim: claim._id } })
    return { status: args.decision }
  },
})

/** Revendications purgées par transaction : cinq pièces au plus chacune. */
const EVIDENCE_PURGE_BATCH = 10
const purgeNext = makeFunctionReference<"mutation", Record<string, never>, number>("modules/pages/claims:purgeDecidedClaimEvidence")

/**
 * PG-01 — la purge des pièces d'une revendication TRANCHÉE, conservation échue : par lots bornés
 * (index `by_evidencePurgeAt`), poursuivie par chaîne. Seules les pièces que le registre dit
 * admises pour une revendication sont purgées ; la revendication, sa décision et son motif restent
 * (le demandeur et la modération les relisent ; l'effacement de la personne les emporte).
 */
export const purgeDecidedClaimEvidence = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx): Promise<number> => {
    const now = Date.now()
    const due = await ctx.db
      .query("pageClaims")
      .withIndex("by_evidencePurgeAt", (q) => q.gt("evidencePurgeAt", 0).lte("evidencePurgeAt", now))
      .take(EVIDENCE_PURGE_BATCH)
    for (const claim of due) {
      await purgeClaimEvidence(ctx, claim)
      await ctx.db.patch(claim._id, { evidenceStorageIds: [], evidencePurgeAt: undefined, updatedAt: now })
    }
    if (due.length === EVIDENCE_PURGE_BATCH) await ctx.scheduler.runAfter(0, purgeNext, {})
    return due.length
  },
})
