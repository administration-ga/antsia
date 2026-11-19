/**
 * Les SIGNATAIRES d'une page — qui parle en son nom — et, depuis AS-10 / PG-08, son ÉQUIPE.
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
 *    se retirer soi-même ou décliner une invitation n'en sont pas ;
 *  · PG-01 : une invitation en attente fait sonner la cloche de la personne
 *    invitée (`page_signatory_invite`, sans acteur ni nom de page) ; la ligne se
 *    RÉSOUT à la réponse (acceptée, déclinée) ou au retrait de l'invitation ;
 *  · AS-10 / PG-08 : l'équipe compte un troisième rôle, `moderator`, qui ne parle
 *    pas au nom de la page (il retire les commentaires sous ses publications).
 *    Il voit l'équipe et se retire comme tout membre (`requirePageTeam`) ; seul
 *    l'administrateur habilite, change un rôle ou retire autrui. Rétrograder un
 *    signataire en modérateur le sort des directs de la page, comme un retrait ;
 *    seule l'invitation sonne chez le modérateur.
 */
import { assertNotLastAdmin, assertPageHasRoomForSignatory, isPageSignatoryRole } from "@antsia/social-domain/pages"
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc } from "../../_generated/dataModel"
import { checked, fail, failRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { assertNativePageManagement } from "../federation/mirrorAccess"
import { notifyPerson, resolveNotifications } from "../notifications/notify"
import { findPublishedPersonByHandle, miniProfileCache } from "../people/miniProfile"
import { hasStrongIdentityFor } from "../people/persons"
import { appendAudit } from "../platform/audit"
import { refreshReaderContexts } from "../posts/feedMaterialization"
import { countLiveAdmins, pageCardOf, requireManagedPage, requirePageTeam, signatoryRowOf, signatoryRowsOf } from "./access"
import { pageCardValidator, pageTeamRoleValidator } from "./validators"

const signatoryDtoValidator = v.object({
  personId: v.id("persons"),
  handle: v.union(v.string(), v.null()),
  displayName: v.union(v.string(), v.null()),
  avatarUrl: v.union(v.string(), v.null()),
  /** AS-10 : rôle d'ÉQUIPE (modérateur compris) ; lignes dans l'ordre administrateurs, signataires, modérateurs. */
  role: pageTeamRoleValidator,
  /** L'invitation est-elle acceptée ? Une invitation en attente ne donne aucun droit. */
  accepted: v.boolean(),
  since: v.number(),
})

/** L'équipe d'une page (invitations comprises) — ses membres vivants seuls la voient, modérateurs compris (AS-10). */
export const listPageSignatories = networkQuery({
  args: { pageId: v.id("pages") },
  returns: v.array(signatoryDtoValidator),
  handler: async (ctx, args) => {
    const { page } = await requirePageTeam(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.pageId)
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
 *
 * AS-10 : le rôle est un rôle d'ÉQUIPE (`moderator` compris). Un membre ACCEPTÉ qui
 * cesse de parler au nom de la page (signataire rétrogradé en modérateur) sort de
 * ses directs comme s'il était retiré ; un modérateur promu signataire voit son fil
 * recomposé comme à l'acceptation. Le dernier administrateur vivant ne devient pas
 * modérateur.
 */
export const grantPageRole = networkMutation({
  minStatus: "declaree",
  args: { pageId: v.id("pages"), handle: v.string(), role: pageTeamRoleValidator },
  returns: v.object({ personId: v.id("persons"), role: pageTeamRoleValidator, invited: v.boolean() }),
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
      if (existing.acceptedAt !== undefined && isPageSignatoryRole(existing.role) !== isPageSignatoryRole(args.role)) {
        // Il ne parle plus au nom de la page : sa connexion déjà ouverte à un direct réservé aux
        // abonnés est coupée, sauf s'il en reste abonné (la décision d'accès juge), comme au retrait.
        if (isPageSignatoryRole(args.role)) await refreshReaderContexts(ctx, existing.networkId, target._id)
        else await ctx.scheduler.runAfter(0, internal.modules.live.revocation.kickUserFromPageDirects, { personId: target._id, pageId: page._id, cursor: null })
      }
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
    const invited = existing === null || existing.acceptedAt === undefined
    // PG-01 : l'invitation (neuve, ou dont le rôle change avant réponse) sonne chez la personne invitée.
    if (invited) await notifyPerson(ctx, { networkId: page.networkId, recipientPersonId: target._id, kind: "page_signatory_invite", subject: { page: page._id } })
    return { personId: target._id, role: args.role, invited }
  },
})

/**
 * Retirer un membre de l'équipe — un administrateur vivant (décision tracée), ou
 * la personne elle-même, QUEL QUE SOIT son rôle, modérateur compris (AS-10 : elle
 * se retire, ce n'est pas une décision). Le dernier administrateur vivant ne part pas.
 */
export const revokePageRole = networkMutation({
  minStatus: "en_attente",
  args: { pageId: v.id("pages"), personId: v.id("persons") },
  returns: v.object({ revoked: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "page.manage", ctx.person._id)
    const self = args.personId === ctx.person._id
    const { page } = self
      ? await requirePageTeam(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.pageId)
      : await requireManagedPage(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.pageId, "admin")
    const row = await signatoryRowOf(ctx, page._id, args.personId)
    if (!row) return { revoked: false }
    if (row.role === "admin" && row.acceptedAt !== undefined) {
      const adminCount = await countLiveAdmins(ctx, page)
      checked(() => assertNotLastAdmin({ role: "admin", nextRole: null, adminCount }))
    }
    await ctx.db.delete(row._id)
    // PG-01 : une invitation retirée avant réponse résout sa cloche (« annulée »).
    if (row.acceptedAt === undefined) await resolveNotifications(ctx, { networkId: page.networkId, recipientPersonId: args.personId, kind: "page_signatory_invite", subject: { page: page._id }, resolution: "cancelled" })
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

/** Mes invitations à rejoindre l'équipe d'une page de ce réseau, en attente (rôle d'équipe, AS-10). */
export const myPageInvitations = networkQuery({
  args: {},
  returns: v.array(v.object({ page: pageCardValidator, role: pageTeamRoleValidator, invitedAt: v.number() })),
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

/**
 * Accepter (ou décliner) une invitation — la personne invitée seule. Décliner efface
 * l'invitation. AS-10 : rend le rôle d'ÉQUIPE accepté (`moderator` compris), `null` au refus.
 */
export const respondToPageInvitation = networkMutation({
  minStatus: "declaree",
  args: { pageId: v.id("pages"), accept: v.boolean() },
  returns: v.object({ role: v.union(pageTeamRoleValidator, v.null()) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "page.manage", ctx.person._id)
    const page = await ctx.db.get(args.pageId)
    const row: Doc<"pageSignatories"> | null = page && page.networkId === ctx.networkId && page.status === "active" ? await signatoryRowOf(ctx, page._id, ctx.person._id) : null
    if (!page || !row || row.acceptedAt !== undefined) return notFound()
    if (!args.accept) {
      await ctx.db.delete(row._id)
      await resolveNotifications(ctx, { networkId: page.networkId, recipientPersonId: ctx.person._id, kind: "page_signatory_invite", subject: { page: page._id }, resolution: "declined" })
      return { role: null }
    }
    await assertNativePageManagement(ctx, page._id)
    // L'identité forte se relit à l'acceptation : elle a pu tomber depuis l'invitation.
    if (page.trust === "official" && !(await hasStrongIdentityFor(ctx, ctx.person._id))) return failRule("PAGE_SIGNATORY_IDENTITY_REQUIRED")
    const now = Date.now()
    await ctx.db.patch(row._id, { acceptedAt: now, authorityRevision: (row.authorityRevision ?? 0) + 1, updatedAt: now })
    await resolveNotifications(ctx, { networkId: page.networkId, recipientPersonId: ctx.person._id, kind: "page_signatory_invite", subject: { page: page._id }, resolution: "accepted", at: now })
    await refreshReaderContexts(ctx, row.networkId, ctx.person._id)
    return { role: row.role }
  },
})
