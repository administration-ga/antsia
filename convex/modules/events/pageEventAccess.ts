/** DG-010 : une participation historique ne donne aucun droit sur une association. */
import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { isActiveMember, memberHasStatus } from "../../lib/access"
import { isDiasporaNetwork } from "../diaspora/facts"
import { isFederatedPage } from "../federation/mirrorAccess"
import { canReadModeratedContent, contentState } from "../moderation/policy"
import { liveSignatoryRole, readablePageOrNull } from "../pages/access"

type ReadCtx = Pick<QueryCtx, "db">

export interface PageEventAccess {
  readonly page: Doc<"pages">
  readonly canManage: boolean
  readonly moderation: "published" | "pending_review"
}

/** Page native d'association, active, lisible dans SON réseau DIASPORA.GA. */
export async function associationEventPage(ctx: ReadCtx, network: Doc<"networks">, pageId: Id<"pages">, personId: Id<"persons">): Promise<Doc<"pages"> | null> {
  if (!isDiasporaNetwork(network) || !(await isActiveMember(ctx, network._id, personId))) return null
  const page = await readablePageOrNull(ctx, network, pageId, personId)
  if (!page || page.networkId !== network._id || page.ownerKind !== "association" || await isFederatedPage(ctx, page._id)) return null
  return page
}

/** Autorité actuelle ; une ancienne création ne conserve aucun droit. */
export async function canManagePageEvent(ctx: ReadCtx, page: Doc<"pages">, personId: Id<"persons">): Promise<boolean> {
  if (!(await memberHasStatus(ctx, page.networkId, personId, "declaree"))) return false
  return (await liveSignatoryRole(ctx, page, personId)) !== null
}

/**
 * Garde commune des détails, cartes, appels et signalements. Les publications
 * privées relisent l'adhésion associative ; pending n'est montré qu'à l'équipe
 * vivante de la page, removed à personne. L'absence d'état n'est pas un accord.
 */
export async function pageEventAccess(ctx: ReadCtx, event: Doc<"events">, personId: Id<"persons">): Promise<PageEventAccess | null> {
  if (!event.organizerPageId || event.organizerPersonId !== undefined) return null
  const network = await ctx.db.get(event.networkId)
  if (!network) return null
  const page = await associationEventPage(ctx, network, event.organizerPageId, personId)
  if (!page) return null
  const canManage = await canManagePageEvent(ctx, page, personId)
  if ((event.pageAudience ?? "association") === "association" && !canManage) {
    const membership = await ctx.db.query("associationMemberships")
      .withIndex("by_network_and_page_and_person", (q) => q.eq("networkId", event.networkId).eq("pageId", page._id).eq("personId", personId)).unique()
    if (membership?.status !== "accepted") return null
  }
  const state = await contentState(ctx, "event", event._id)
  if (state && (state.networkId !== event.networkId || (state.ownerPageId !== undefined && state.ownerPageId !== page._id))) return null
  const moderation = state?.status ?? "pending_review"
  if (moderation === "removed" || (moderation === "pending_review" && !canManage)) return null
  if (moderation === "published" && !(await canReadModeratedContent(ctx, "event", event._id, personId))) return null
  return { page, canManage, moderation }
}
