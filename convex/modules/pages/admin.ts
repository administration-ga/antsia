// Dupliqué de socle/convex/modules/reseauPages/admin.ts @ ad2e7fdc2 — adaptations : réécrit (owner map §6.15) — la console du moteur (`operatorMutation`, opérateur de plateforme vivant) au lieu du superadmin ; plus d'ACTIVATION pour une organisation : la console CRÉE une page d'institution « Officiel » (décision tracée, idempotente par référence d'import), pose la confiance (`isTrustAllowedForOwner` : « Officiel » n'appartient qu'à une institution), retire ou rétablit une page, change son adresse (l'ancienne dans l'historique d'identité) et habilite un premier administrateur (invitation à accepter, identité forte exigée pour une page officielle) ; motif de décision borné ; chaque geste qui ÉCRIT laisse sa ligne au journal du moteur (`appendAudit`, au lieu d'`appendContextAudit`), un geste qui ne change rien n'écrit rien ; avertissement « module Actualités » retiré ; fermeture des directs de la page RÉTABLIE avec le module `live` (lot 16 : le retrait planifie `live/revocation.closePageDirects`, comme `deactivate` au socle) ; liste paginée au lieu de 100 lignes.
/**
 * La CONSOLE des pages — les décisions qui ne se prennent pas depuis une page.
 *
 * Une page d'institution ne naît pas d'un compte : la console la crée (ou un
 * import contractuel, ou la fédération), et c'est elle seule qui pose
 * « Officiel ». Retirer une page ne supprime rien : ses publications cessent
 * d'être servies, ses abonnements demeurent, une réactivation rend tout.
 */
import { assertDecisionReason } from "@antsia/social-domain/audit"
import { assertCountryCode } from "@antsia/social-domain/content"
import {
  assertPageHandle,
  assertPageName,
  assertTrustAllowedForOwner,
  normalizePageDescription,
  normalizePageShortName,
  pageTrustRank,
} from "@antsia/social-domain/pages"
import { paginationOptsValidator, type PaginationResult } from "convex/server"
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc } from "../../_generated/dataModel"
import { checked, failRule, notFound } from "../../lib/errors"
import { operatorMutation, operatorQuery } from "../../lib/functions"
import { requirePlatformAdmin } from "../../lib/operatorIdentity"
import { enforceRateLimit } from "../../lib/rateLimit"
import { contentVisibilityValidator, pageTrustValidator } from "../../lib/validators"
import { assertNativePageManagement } from "../federation/mirrorAccess"
import { hasStrongIdentityFor } from "../people/persons"
import { appendAudit, operatorCapacity } from "../platform/audit"
import { assertPageHandleFree, isPageOnRoot, pageSearchText, signatoryRowOf } from "./access"
import { pageStatusValidator } from "./validators"

/** Ce que la console doit voir — l'état RÉEL, sans caviardage (ni identifiant de stockage). */
function toAdminDto(page: Doc<"pages">) {
  return {
    pageId: page._id,
    networkId: page.networkId,
    handle: page.handle,
    name: page.name,
    ownerKind: page.ownerKind,
    trust: page.trust,
    status: page.status,
    visibility: page.visibility,
    country: page.country ?? null,
    importRef: page.importRef ?? null,
    createdAt: page.createdAt,
    deactivatedAt: page.deactivatedAt ?? null,
  }
}

/**
 * Créer une page d'INSTITUTION, « Officiel » d'emblée — la décision tracée qui
 * seule y mène. Idempotente par référence d'import : rejouée, elle rend la page
 * déjà créée sans rien réécrire.
 */
export const createInstitutionPage = operatorMutation({
  args: {
    networkId: v.id("networks"),
    name: v.string(),
    handle: v.optional(v.string()),
    shortName: v.optional(v.string()),
    description: v.optional(v.string()),
    country: v.optional(v.string()),
    visibility: v.optional(contentVisibilityValidator),
    importRef: v.optional(v.string()),
    reason: v.string(),
  },
  returns: v.object({ pageId: v.id("pages"), handle: v.string(), created: v.boolean() }),
  handler: async (ctx, args) => {
    requirePlatformAdmin(ctx)
    await enforceRateLimit(ctx, "operator.page", ctx.person._id)
    const motive = checked(() => assertDecisionReason(args.reason, 10))
    const network = await ctx.db.get(args.networkId)
    if (!network || network.status !== "active") return notFound()
    if (args.importRef !== undefined) {
      const existing = await ctx.db
        .query("pages")
        .withIndex("by_network_importRef", (q) => q.eq("networkId", network._id).eq("importRef", args.importRef))
        .unique()
      if (existing) {
        await assertNativePageManagement(ctx, existing._id)
        return { pageId: existing._id, handle: existing.handle, created: false }
      }
    }
    const name = checked(() => assertPageName(args.name))
    const handle = checked(() => assertPageHandle(args.handle ?? name))
    const shortName = checked(() => normalizePageShortName(args.shortName))
    const description = checked(() => normalizePageDescription(args.description))
    const country = args.country === undefined ? undefined : checked(() => assertCountryCode(args.country ?? ""))
    await assertPageHandleFree(ctx, handle)
    const visibility = network.kind === "root" ? "network" : (args.visibility ?? "network")
    const now = Date.now()
    const pageId = await ctx.db.insert("pages", {
      networkId: network._id,
      handle,
      name,
      ...(shortName !== undefined ? { shortName } : {}),
      ...(description !== undefined ? { description } : {}),
      ownerKind: "institution",
      trust: "official",
      trustRank: pageTrustRank("official"),
      ...(country !== undefined ? { country } : {}),
      visibility,
      onRoot: isPageOnRoot(network, visibility),
      status: "active",
      ...(args.importRef !== undefined ? { importRef: args.importRef } : {}),
      searchText: pageSearchText({ name, ...(shortName !== undefined ? { shortName } : {}), handle }),
      createdAt: now,
      updatedAt: now,
    })
    await appendAudit(ctx, {
      action: "page.create_official",
      capacity: operatorCapacity(ctx.operator),
      actorPersonId: ctx.person._id,
      networkId: network._id,
      subject: { table: "pages", id: pageId },
      details: { reason: motive, handle, importRef: args.importRef ?? null },
      at: now,
    })
    return { pageId, handle, created: true }
  },
})

/**
 * Poser la CONFIANCE d'une page — « Officiel » à une institution seulement,
 * « Vérifié » ou « Communauté » à toute page. Un appel qui ne change rien
 * n'écrit rien, trace comprise.
 */
export const setPageTrust = operatorMutation({
  args: { pageId: v.id("pages"), trust: pageTrustValidator, reason: v.string() },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    requirePlatformAdmin(ctx)
    await enforceRateLimit(ctx, "operator.page", ctx.person._id)
    const motive = checked(() => assertDecisionReason(args.reason, 10))
    const page = await ctx.db.get(args.pageId)
    if (!page) return notFound()
    await assertNativePageManagement(ctx, page._id)
    checked(() => assertTrustAllowedForOwner(page.ownerKind, args.trust))
    if (page.trust === args.trust) return { changed: false }
    const now = Date.now()
    await ctx.db.patch(page._id, { trust: args.trust, trustRank: pageTrustRank(args.trust), updatedAt: now })
    await appendAudit(ctx, {
      action: "page.trust_set",
      capacity: operatorCapacity(ctx.operator),
      actorPersonId: ctx.person._id,
      networkId: page.networkId,
      subject: { table: "pages", id: page._id },
      details: { reason: motive, previousTrust: page.trust, trust: args.trust },
      at: now,
    })
    return { changed: true }
  },
})

/**
 * Retirer (`inactive`) ou rétablir (`active`) une page. RIEN n'est supprimé :
 * ses publications cessent d'être servies — par le fil, le mur, la recherche et
 * leur lien —, ses abonnements demeurent, une réactivation les rend toutes.
 */
export const setPageStatus = operatorMutation({
  args: { pageId: v.id("pages"), status: pageStatusValidator, reason: v.string() },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    requirePlatformAdmin(ctx)
    await enforceRateLimit(ctx, "operator.page", ctx.person._id)
    const motive = checked(() => assertDecisionReason(args.reason, 10))
    const page = await ctx.db.get(args.pageId)
    if (!page) return notFound()
    if (page.status === args.status) return { changed: false }
    const now = Date.now()
    await ctx.db.patch(page._id, { status: args.status, deactivatedAt: args.status === "inactive" ? now : undefined, updatedAt: now })
    if (args.status === "inactive") await ctx.scheduler.runAfter(0, internal.modules.live.revocation.closePageDirects, { pageId: page._id, cursor: null, revokedAt: now })
    await appendAudit(ctx, {
      action: "page.status_set",
      capacity: operatorCapacity(ctx.operator),
      actorPersonId: ctx.person._id,
      networkId: page.networkId,
      subject: { table: "pages", id: page._id },
      details: { reason: motive, previousStatus: page.status, status: args.status },
      at: now,
    })
    return { changed: true }
  },
})

/**
 * Changer l'ADRESSE d'une page. L'ancienne n'est PAS réservée : un lien partagé
 * vers elle cessera d'aboutir — c'est pourquoi le geste appartient à la console,
 * et pourquoi l'historique d'identité garde l'ancienne adresse (c'est elle que
 * cherchera qui suit un lien mort).
 */
export const setPageHandle = operatorMutation({
  args: { pageId: v.id("pages"), handle: v.string(), reason: v.string() },
  returns: v.object({ handle: v.string() }),
  handler: async (ctx, args) => {
    requirePlatformAdmin(ctx)
    await enforceRateLimit(ctx, "operator.page", ctx.person._id)
    const motive = checked(() => assertDecisionReason(args.reason, 10))
    const page = await ctx.db.get(args.pageId)
    if (!page) return notFound()
    await assertNativePageManagement(ctx, page._id)
    const handle = checked(() => assertPageHandle(args.handle))
    if (handle === page.handle) return { handle }
    await assertPageHandleFree(ctx, handle, page._id)
    const now = Date.now()
    await ctx.db.patch(page._id, { handle, searchText: pageSearchText({ name: page.name, ...(page.shortName !== undefined ? { shortName: page.shortName } : {}), handle }), updatedAt: now })
    await ctx.db.insert("pageIdentityHistory", { networkId: page.networkId, pageId: page._id, actorPersonId: ctx.person._id, previous: { handle: page.handle }, at: now })
    await appendAudit(ctx, {
      action: "page.handle_set",
      capacity: operatorCapacity(ctx.operator),
      actorPersonId: ctx.person._id,
      networkId: page.networkId,
      subject: { table: "pages", id: page._id },
      details: { reason: motive, previousHandle: page.handle, handle },
      at: now,
    })
    return { handle }
  },
})

/**
 * HABILITER un administrateur — la procédure tracée d'une page d'institution
 * (EXF-DG-20 : l'agent du poste, rôle confirmé hors ligne). C'est une
 * INVITATION que la personne accepte ; signer pour une page officielle exige
 * une identité forte (IDN `loa ≥ 2`), relue encore à l'acceptation.
 */
export const grantPageAdmin = operatorMutation({
  args: { pageId: v.id("pages"), personId: v.id("persons"), reason: v.string() },
  returns: v.object({ invited: v.boolean() }),
  handler: async (ctx, args) => {
    requirePlatformAdmin(ctx)
    await enforceRateLimit(ctx, "operator.page", ctx.person._id)
    const motive = checked(() => assertDecisionReason(args.reason, 10))
    const page = await ctx.db.get(args.pageId)
    const person = await ctx.db.get(args.personId)
    if (!page || page.status !== "active" || !person) return notFound()
    await assertNativePageManagement(ctx, page._id)
    if (page.trust === "official" && !(await hasStrongIdentityFor(ctx, person._id))) return failRule("PAGE_SIGNATORY_IDENTITY_REQUIRED")
    const existing = await signatoryRowOf(ctx, page._id, person._id)
    if (existing?.role === "admin") return { invited: existing.acceptedAt === undefined }
    const now = Date.now()
    if (existing) await ctx.db.patch(existing._id, { role: "admin", authorityRevision: (existing.authorityRevision ?? 0) + 1, updatedAt: now })
    else await ctx.db.insert("pageSignatories", { networkId: page.networkId, pageId: page._id, personId: person._id, role: "admin", authorityRevision: 0, createdAt: now, updatedAt: now })
    await appendAudit(ctx, {
      action: "page.signatory_grant",
      capacity: operatorCapacity(ctx.operator),
      actorPersonId: ctx.person._id,
      networkId: page.networkId,
      subject: { table: "pages", id: page._id },
      details: { reason: motive, targetPersonId: person._id, role: "admin", previousRole: existing?.role ?? null, invited: existing === null },
      at: now,
    })
    return { invited: existing === null || existing.acceptedAt === undefined }
  },
})

/** Les pages d'un réseau pour la console — l'état réel, les plus récentes d'abord, paginées. */
export const paginatePages = operatorQuery({
  args: { networkId: v.id("networks"), status: v.optional(pageStatusValidator), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<ReturnType<typeof toAdminDto>>> => {
    const opts = { ...args.paginationOpts, numItems: Math.min(Math.max(Math.trunc(args.paginationOpts.numItems), 1), 100) }
    const status = args.status ?? "active"
    const result = await ctx.db
      .query("pages")
      .withIndex("by_network_status_trustRank_createdAt", (q) => q.eq("networkId", args.networkId).eq("status", status))
      .order("desc")
      .paginate(opts)
    return { ...result, page: result.page.map(toAdminDto) }
  },
})

