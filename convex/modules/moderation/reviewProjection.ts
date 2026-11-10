/** PA8 : extrait d'une cible assignée, jamais une porte sur son contexte privé. */
import type { PostMediaDto } from "@antsia/social-contracts/media"
import { parseCommercePublicBody } from "@antsia/social-domain/commerce/projection"
import { COMMERCE_STOREFRONT_TERMS_MAX_BYTES } from "@antsia/social-domain/commerce/storefrontTerms"
import type { ContextualKind } from "@antsia/social-domain/contextualMessaging"
import { v } from "convex/values"

import type { Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { notFound } from "../../lib/errors"
import { networkQuery } from "../../lib/functions"
import { getRootNetwork } from "../../lib/access"
import { postMediaDtoValidator, resolvePostMediaDtos } from "../media/media"
import { isPublishedPerson } from "../people/miniProfile"
import { liveCatalogMapping } from "../shops/catalogAccess"
import { jobModerationExcerpt } from "../shops/jobRead"
import { diasporaModerationExcerpt } from "../diaspora/moderationTargets"
import { contextualKindValidator } from "../contextualMessaging/tables"
import { requireReportCapacity, teamCapacity } from "./cases"
import { contentState } from "./policy"
import { professionalReviewSource } from "./professionalReviewSource"
import { editorialMediaReviewSource, editorialReviewSource } from "./editorialReviewSource"
import { moderationSurfaceValidator, moderationTargetValidator } from "./tables"
import { commerceOfferModerationText } from "./commerceOfferText"
import type { ModerationTarget } from "./targets"
import { resolveDailySpecialSource } from "../stories/dailySpecialSource"

/**
 * `context` (CC-2b) : la NATURE d'un message contextuel, dérivée du fil côté serveur (jamais de la
 * personne qui signale) — le guichet affiche « contextualMessage · <nature> ». Absent ailleurs.
 */
type Preview = { kind: ModerationTarget["kind"]; available: boolean; title: string | null; body: string | null; media: PostMediaDto[]; context?: { kind: ContextualKind } | null; sourceRevision?: number; sourceDigest?: string }
const excerpt = (value: string | undefined, maximum = 4_000) => value ? value.slice(0, maximum) : null

/** Aucun stockage brut, auteur, contact, participant ou contenu voisin ne sort. */
async function targetPreview(ctx: QueryCtx, networkId: Id<"networks">, target: ModerationTarget, readerPersonId: Id<"persons">): Promise<Preview> {
  const empty: Preview = { kind: target.kind, available: false, title: null, body: null, media: [] }
  switch (target.kind) {
    case "editorialMedia": {
      const source = await editorialMediaReviewSource(ctx, networkId, target.id)
      return source ? { ...empty, available: true, ...source } : empty
    }
    case "editorialVersion": {
      const source = await editorialReviewSource(ctx, networkId, target.id)
      return source ? { ...empty, available: true, ...source } : empty
    }
    case "professionalProfile":
    case "professionalCollaboration": {
      const source = await professionalReviewSource(ctx, networkId, target)
      return source ? { ...empty, available: true, ...source } : empty
    }
    case "post": {
      const row = await ctx.db.get(target.id)
      if (!row || row.networkId !== networkId) return empty
      return { ...empty, available: true, body: excerpt(row.body), media: await resolvePostMediaDtos(ctx, row.media?.slice(0, 4)) }
    }
    case "comment": {
      const row = await ctx.db.get(target.id)
      const post = row ? await ctx.db.get(row.postId) : null
      return row && post?.networkId === networkId && row.networkId === networkId ? { ...empty, available: true, body: excerpt(row.body) } : empty
    }
    case "commercialMessage": {
      const row = await ctx.db.get(target.id)
      if (!row || row.networkId !== networkId || row.deletedAt !== undefined) return empty
      return { ...empty, available: true, body: excerpt(row.content, 2000) }
    }
    case "contextualMessage": {
      // CC-2b : le seul message signalé, extrait borné comme P10 ; ni pièce, ni participant, ni message
      // voisin, ni contenu de l'objet. La nature vient du fil.
      const row = await ctx.db.get(target.id)
      if (!row || row.networkId !== networkId || row.deletedAt !== undefined) return empty
      const thread = await ctx.db.get(row.threadId)
      return { ...empty, available: true, body: excerpt(row.content, 2000), context: thread !== null && thread.networkId === networkId ? { kind: thread.kind } : null }
    }
    case "groupMessage": {
      const row = await ctx.db.get(target.id)
      if (!row || row.networkId !== networkId || row.type !== "text" || row.deletedAt !== undefined) return empty
      // Seulement le message signalé : aucune pièce jointe, aucun participant ni fil.
      return { ...empty, available: true, body: excerpt(row.content) }
    }
    case "event": {
      const row = await ctx.db.get(target.id)
      return row?.networkId === networkId ? { ...empty, available: true, title: excerpt(row.title, 200), body: excerpt(row.description) } : empty
    }
    case "page": {
      const row = await ctx.db.get(target.id)
      return row?.networkId === networkId ? { ...empty, available: true, title: excerpt(row.name, 200), body: excerpt(row.description) } : empty
    }
    case "person": {
      const row = await ctx.db.get(target.id)
      const membership = row ? await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", row._id)).unique() : null
      if (!row || !membership || !isPublishedPerson(row) || row.deletionRequestedAt !== undefined) return empty
      return { ...empty, available: true, title: excerpt(row.displayName, 200), body: excerpt(row.headline) }
    }
    case "live": {
      const row = await ctx.db.get(target.id)
      return row?.networkId === networkId ? { ...empty, available: true, title: excerpt(row.title, 200) } : empty
    }
    case "story": {
      const row = await ctx.db.get(target.id)
      const now = Date.now()
      if (!row || row.networkId !== networkId || row.expiresAt <= now || row.removedAt !== undefined) return empty
      if (row.media.kind === "daily_special") {
        const network = await ctx.db.get(networkId), root = await getRootNetwork(ctx)
        if (!network || !root) return empty
        const source = await resolveDailySpecialSource(ctx, { network, root, readerPersonId }, { shopId: row.media.shopId, authorPersonId: row.authorPersonId, now, reference: row.media })
        return source ? { ...empty, available: true, title: source.dailySpecial.title, media: [source.media] } : empty
      }
      return { ...empty, available: true, body: excerpt(row.caption), media: await resolvePostMediaDtos(ctx, [row.media]) }
    }
    case "album": {
      const row = await ctx.db.get(target.id)
      return row?.networkId === networkId && row.deletingAt === undefined && row.status === "published" ? { ...empty, available: true, title: excerpt(row.title, 200), body: excerpt(row.description) } : empty
    }
    case "serviceReview": {
      const row = await ctx.db.get(target.id)
      if (!row || row.networkId !== networkId || row.status !== "active") return empty
      // Un avis n'ouvre jamais le besoin, les créneaux ni l'identité de la demande.
      return { ...empty, available: true, body: excerpt(row.body) }
    }
    case "serviceReviewReply": {
      const row = await ctx.db.get(target.id)
      if (!row || row.networkId !== networkId || row.status !== "active") return empty
      const review = await ctx.db.get(row.reviewId)
      if (!review || review.networkId !== networkId || review.pageId !== row.pageId || review.status !== "active") return empty
      return { ...empty, available: true, body: excerpt(row.body) }
    }
    case "commerceStorefront": {
      const head = await ctx.db.get(target.id)
      if (!head || head.networkId !== networkId || head.objectKind !== "shop" || head.sequence !== "catalog" || head.state !== "active") return empty
      const live = await liveCatalogMapping(ctx, networkId, head.shopId)
      if (!live || live.parentHead?._id !== head._id || head.mappingId !== live.mapping._id || head.mappingGeneration !== live.mapping.generation) return empty
      const parsed = parseCommercePublicBody(head.body, Date.now())
      if (!parsed.ok || !live.emitter.allowedContracts.includes(parsed.value.contract) || (parsed.value.payload.type !== "shop.published" && parsed.value.payload.type !== "shop.updated") || parsed.value.payload.linkRef !== live.link.linkRef) return empty
      const terms = parsed.value.payload.storefrontTerms
      if (!terms) return empty
      // Toutes les clauses textuelles sont relues : le contrat borne le document à 8 KiB,
      // auxquels s'ajoutent au plus 46 séparateurs de quatre octets. Aucune fin tronquée.
      const body = [...(terms.pickup?.points.map(point => point.label) ?? []), terms.delivery?.label, ...(terms.delivery?.localities ?? []), ...(terms.fees?.map(fee => fee.label) ?? []), terms.returns?.summary, terms.warranty?.summary].filter(Boolean).join(" · ")
      if (new TextEncoder().encode(body).byteLength > COMMERCE_STOREFRONT_TERMS_MAX_BYTES + 46 * 4) return empty
      return { ...empty, available: true, title: excerpt(live.page.name, 200), body, sourceRevision: head.revision, sourceDigest: head.digest }
    }
    case "commerceOffer": {
      const head = await ctx.db.get(target.id)
      if (!head || head.networkId !== networkId || head.objectKind !== "offer" || head.sequence !== "catalog" || head.state !== "active") return empty
      const live = await liveCatalogMapping(ctx, networkId, head.shopId)
      if (!live?.parentHead || live.parentHead.state !== "active" || head.mappingGeneration !== live.mapping.generation ||
        head.mappingId !== live.mapping._id || head.emitterId !== live.mapping.emitterId || head.environment !== live.mapping.environment ||
        head.shopRef !== live.mapping.shopRef || live.parentHead.mappingId !== live.mapping._id ||
        live.parentHead.mappingGeneration !== live.mapping.generation || head.parentActivationRevision !== live.parentHead.activationRevision) return empty
      const parsed = parseCommercePublicBody(head.body, Date.now())
      if (!parsed.ok || (parsed.value.payload.type !== "offer.published" && parsed.value.payload.type !== "offer.updated")) return empty
      // Le contenu public assigné, sans corps signé, refs privées ni stockage voisin.
      return { ...empty, available: true, title: parsed.value.payload.title, body: commerceOfferModerationText(parsed.value.payload), sourceRevision: head.revision, sourceDigest: head.digest }
    }
    case "commerceJob": {
      // P15 : l'extrait public de l'incarnation courante ; jamais une candidature ni le corps signé.
      const extract = await jobModerationExcerpt(ctx, networkId, target.id)
      return extract ? { ...empty, available: true, title: excerpt(extract.title, 200), body: excerpt(extract.body) } : empty
    }
    case "thematicGroup": {
      // MC-01 : la fiche et les règles du groupe, telles qu'elles se lisent AUJOURD'HUI ; ni membres, ni publications,
      // ni invitations. Un groupe supprimé (ou en cours de suppression) n'est plus disponible.
      const row = await ctx.db.get(target.id)
      if (!row || row.networkId !== networkId || row.deletingAt !== undefined) return empty
      const body = [row.description, row.rules].filter((part): part is string => part !== undefined && part.length > 0).join("\n\n")
      return { ...empty, available: true, title: excerpt(row.name, 200), body: excerpt(body) }
    }
    case "personalMessage": {
      // MC-01 : le SEUL message signalé, relu ici à la décision (le dossier n'en garde aucune copie) : son texte borné
      // comme P10, ni pièce jointe, ni participant, ni message voisin. Retiré pour tous par son expéditeur, ou effacé
      // avec la personne : indisponible.
      const row = await ctx.db.get(target.id)
      if (!row || row.networkId !== networkId || row.deletedAt !== undefined || (row.type !== undefined && row.type !== "text")) return empty
      return { ...empty, available: true, body: excerpt(row.content, 2000) }
    }
    // Vague H DIASPORALE (G9, délégué) : l'extrait borné de la tranche — ni auteur, candidat, coordonnée, créneau ni profil joint.
    case "diasporaAidQuestion":
    case "diasporaAidAnswer":
    case "diasporaAidMission":
    case "diasporaMentorProfile":
    case "diasporaMentoringRequest":
    case "diasporaKitResource":
    case "diasporaJobOffer":
    case "diasporaTalentProfile":
    case "diasporaJobApplication": {
      const extract = await diasporaModerationExcerpt(ctx, networkId, target)
      return extract ? { ...empty, available: true, title: extract.title, body: extract.body } : empty
    }
  }
}

export const preview = networkQuery({
  args: { reportId: v.optional(v.id("reports")), target: v.optional(moderationTargetValidator) },
  returns: v.object({ kind: moderationSurfaceValidator, available: v.boolean(), title: v.union(v.string(), v.null()), body: v.union(v.string(), v.null()), media: v.array(postMediaDtoValidator), context: v.optional(v.union(v.object({ kind: contextualKindValidator }), v.null())), sourceRevision: v.optional(v.number()), sourceDigest: v.optional(v.string()) }),
  handler: async (ctx, args): Promise<Preview> => {
    if ((args.reportId === undefined) === (args.target === undefined)) return notFound()
    if (args.reportId !== undefined) {
      const report = await ctx.db.get(args.reportId)
      if (!report || report.networkId !== ctx.networkId || (report.status !== "open" && report.status !== "reviewing") || !await requireReportCapacity(ctx, ctx, report)) return notFound()
      return await targetPreview(ctx, ctx.networkId, report.target, ctx.person._id)
    }
    const target = args.target
    if (!target) return notFound()
    const state = await contentState(ctx, target.kind, target.id)
    if (!state || state.networkId !== ctx.networkId || state.status !== "pending_review") return notFound()
    const teams = await ctx.db.query("moderationTeams").withIndex("by_network_active", (q) => q.eq("networkId", ctx.networkId).eq("active", true)).take(101)
    if (teams.length > 100) return notFound()
    const team = teams.find((row) => row.scope === target.kind) ?? teams.find((row) => row.scope === undefined)
    if (!await teamCapacity(ctx, ctx, target.kind, team?._id)) return notFound()
    return await targetPreview(ctx, ctx.networkId, target, ctx.person._id)
  },
})
