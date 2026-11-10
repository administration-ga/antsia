/**
 * Les SIGNATAIRES d'une page — qui parle en son nom.
 *
 * Écrit à neuf (owner map §6.15 ; cahier §6.3 : « signataire / administrateur
 * de page : publier au nom de la page, gérer les signataires ») : au socle, le
 * droit de parler pour une page était `communication.publish` sur son
 * organisation, et aucune page n'avait de signataires propres.
 *
 *  · une HABILITATION est une invitation : elle ne vaut qu'acceptée, personne ne
 *    se retrouve associé à une page sans l'avoir voulu ;
 *  · signer pour une page OFFICIELLE exige une identité forte (IDN `loa ≥ 2`) ;
 *  · la page garde toujours au moins un administrateur vivant ;
 *  · habiliter et révoquer sont des DÉCISIONS : une ligne au journal
 *    (`page.signatory_grant`, `page.signatory_revoke`, qualité `page_admin`) —
 *    se retirer soi-même ou décliner une invitation n'en sont pas.
 */
import { assertNotLastAdmin, assertPageHasRoomForSignatory } from "@antsia/social-domain/pages"
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc } from "../../_generated/dataModel"
import { checked, fail, failRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { assertNativePageManagement } from "../federation/mirrorAccess"
import { findPublishedPersonByHandle, miniProfileCache } from "../people/miniProfile"
import { hasStrongIdentityFor } from "../people/persons"
import { appendAudit } from "../platform/audit"
import { refreshReaderContexts } from "../posts/feedMaterialization"
import { countLiveAdmins, pageCardOf, requireManagedPage, signatoryRowOf, signatoryRowsOf } from "./access"
import { pageCardValidator, pageRoleValidator } from "./validators"

const signatoryDtoValidator = v.object({
  personId: v.id("persons"),
  handle: v.union(v.string(), v.null()),
  displayName: v.union(v.string(), v.null()),
  avatarUrl: v.union(v.string(), v.null()),
  role: pageRoleValidator,
  /** L'invitation est-elle acceptée ? Une invitation en attente ne donne aucun droit. */
  accepted: v.boolean(),
  since: v.number(),
})

/** Les signataires d'une page (invitations comprises) — ses signataires vivants seuls les voient. */
export const listPageSignatories = networkQuery({
  args: { pageId: v.id("pages") },
  returns: v.array(signatoryDtoValidator),
  handler: async (ctx, args) => {
    const { page } = await requireManagedPage(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.pageId, "signatory")
    const rows = await signatoryRowsOf(ctx, page._id)
    const profileOf = miniProfileCache(ctx)
    const out = []
    for (const row of rows) {
      const profile = await profileOf(row.personId)
      out.push({
        personId: row.personId,
        handle: profile.handle,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        role: row.role,
        accepted: row.acceptedAt !== undefined,
        since: row.acceptedAt ?? row.createdAt,
      })
    }
    return out
  },
})

/**
 * Habiliter une personne (ou changer son rôle) — un administrateur vivant.
 * Une personne nouvelle est INVITÉE (elle accepte ou décline) ; un signataire
 * existant change de rôle aussitôt. Rejouer le même rôle ne fait rien. On ne
 * change pas son propre rôle ici (se retirer : `revokePageRole`).
 */
export const grantPageRole = networkMutation({
  minStatus: "declaree",
  args: { pageId: v.id("pages"), handle: v.string(), role: pageRoleValidator },
  returns: v.object({ personId: v.id("persons"), role: pageRoleValidator, invited: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "page.manage", ctx.person._id)
    const { page } = await requireManagedPage(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.pageId, "admin")
    const target = await findPublishedPersonByHandle(ctx, page.networkId, args.handle)
    if (!target) return notFound()
    if (target._id === ctx.person._id) return fail("invalidArgument", { field: "handle" })
    const existing = await signatoryRowOf(ctx, page._id, target._id)
    if (existing && existing.role === args.role) return { personId: target._id, role: args.role, invited: existing.acceptedAt === undefined }
    const now = Date.now()
    if (existing) {
      if (existing.role === "admin" && existing.acceptedAt !== undefined) {
        const adminCount = await countLiveAdmins(ctx, page)
        checked(() => assertNotLastAdmin({ role: "admin", nextRole: args.role, adminCount }))
      }
      await ctx.db.patch(existing._id, { role: args.role, authorityRevision: (existing.authorityRevision ?? 0) + 1, updatedAt: now })
    } else {
      const count = (await signatoryRowsOf(ctx, page._id)).length
      checked(() => assertPageHasRoomForSignatory(count))
      if (page.trust === "official" && !(await hasStrongIdentityFor(ctx, target._id))) return failRule("PAGE_SIGNATORY_IDENTITY_REQUIRED")
      await ctx.db.insert("pageSignatories", { networkId: page.networkId, pageId: page._id, personId: target._id, role: args.role, authorityRevision: 0, grantedByPersonId: ctx.person._id, createdAt: now, updatedAt: now })
    }
    await appendAudit(ctx, {
      action: "page.signatory_grant",
      capacity: "page_admin",
      actorPersonId: ctx.person._id,
      networkId: page.networkId,
      subject: { table: "pages", id: page._id },
      details: { targetPersonId: target._id, role: args.role, previousRole: existing?.role ?? null, invited: existing === null },
      at: now,
    })
    return { personId: target._id, role: args.role, invited: existing === null || existing.acceptedAt === undefined }
  },
})

/**
 * Retirer un signataire — un administrateur vivant (décision tracée), ou la
 * personne elle-même (elle se retire, ce n'est pas une décision). Le dernier
 * administrateur vivant ne part pas.
 */
export const revokePageRole = networkMutation({
  minStatus: "en_attente",
  args: { pageId: v.id("pages"), personId: v.id("persons") },
  returns: v.object({ revoked: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "page.manage", ctx.person._id)
    const self = args.personId === ctx.person._id
    const { page } = await requireManagedPage(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.pageId, self ? "signatory" : "admin")
    const row = await signatoryRowOf(ctx, page._id, args.personId)
    if (!row) return { revoked: false }
    if (row.role === "admin" && row.acceptedAt !== undefined) {
      const adminCount = await countLiveAdmins(ctx, page)
      checked(() => assertNotLastAdmin({ role: "admin", nextRole: null, adminCount }))
    }
    await ctx.db.delete(row._id)
    // Un signataire retiré sort du cercle de la page : sa connexion DÉJÀ ouverte à un direct
    // réservé aux abonnés est coupée, sauf s'il en reste abonné (la décision d'accès juge).
    await ctx.scheduler.runAfter(0, internal.modules.live.revocation.kickUserFromPageDirects, { personId: args.personId, pageId: page._id, cursor: null })
    if (!self) {
      await appendAudit(ctx, {
        action: "page.signatory_revoke",
        capacity: "page_admin",
        actorPersonId: ctx.person._id,
        networkId: page.networkId,
        subject: { table: "pages", id: page._id },
        details: { targetPersonId: args.personId, role: row.role },
      })
    }
    return { revoked: true }
  },
})

/** Mes invitations à signer pour une page de ce réseau, en attente. */
export const myPageInvitations = networkQuery({
  args: {},
  returns: v.array(v.object({ page: pageCardValidator, role: pageRoleValidator, invitedAt: v.number() })),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("pageSignatories")
      .withIndex("by_network_person", (q) => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id))
      .take(50) // borné : une personne signe pour peu de pages
    const out = []
    for (const row of rows) {
      if (row.acceptedAt !== undefined) continue
      const page = await ctx.db.get(row.pageId)
      if (page && page.status === "active") out.push({ page: await pageCardOf(ctx, page), role: row.role, invitedAt: row.createdAt })
    }
    return out
  },
})

/** Accepter (ou décliner) une invitation à signer — la personne invitée seule. Décliner efface l'invitation. */
export const respondToPageInvitation = networkMutation({
  minStatus: "declaree",
  args: { pageId: v.id("pages"), accept: v.boolean() },
  returns: v.object({ role: v.union(pageRoleValidator, v.null()) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "page.manage", ctx.person._id)
    const page = await ctx.db.get(args.pageId)
    const row: Doc<"pageSignatories"> | null = page && page.networkId === ctx.networkId && page.status === "active" ? await signatoryRowOf(ctx, page._id, ctx.person._id) : null
    if (!page || !row || row.acceptedAt !== undefined) return notFound()
    if (!args.accept) {
      await ctx.db.delete(row._id)
      return { role: null }
    }
    await assertNativePageManagement(ctx, page._id)
    // L'identité forte se relit à l'acceptation : elle a pu tomber depuis l'invitation.
    if (page.trust === "official" && !(await hasStrongIdentityFor(ctx, ctx.person._id))) return failRule("PAGE_SIGNATORY_IDENTITY_REQUIRED")
    const now = Date.now()
    await ctx.db.patch(row._id, { acceptedAt: now, authorityRevision: (row.authorityRevision ?? 0) + 1, updatedAt: now })
    await refreshReaderContexts(ctx, row.networkId, ctx.person._id)
    return { role: row.role }
  },
})
