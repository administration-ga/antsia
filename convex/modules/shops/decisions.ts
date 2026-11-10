/**
 * Les DÉCISIONS sur une vitrine — admettre, refuser, suspendre, rétablir — et
 * la politique de publication d'un réseau, écrites UNE fois pour la console
 * des opérateurs (`operator.ts`), l'admission d'office d'une adhésion vérifiée
 * (`shops.ts`) et l'outil de développement local (`devSeeds.ts`). Aucune
 * fonction Convex ici ; la ligne d'audit est posée par l'appelant, dans sa
 * propre définition (cliquet `operator-audit`).
 */
import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { isActiveMember } from "../../lib/access"
import { failAppRule, notFound } from "../../lib/errors"
import { isFederatedPage } from "../federation/mirrorAccess"
import { countLiveAdmins } from "../pages/access"
import { createShopPage, isShopEligiblePage } from "../pages/shopPages"
import { shopIdentityOf, shopModerationText, storefrontPolicyOf } from "./access"
import { COMMERCE_ACTIVATION_DECISIONS, commerceActivationReady } from "./commerceActivation"
import {
  DEFAULT_STOREFRONT_POLICY,
  presentationGaps,
  SHOP_PAGE_OWNER_KIND,
  shopHandleCandidates,
  type StorefrontPolicy,
  storefrontsOpen,
  type StorefrontState,
  storefrontTransitionAllowed,
} from "./rules"

/** Règle la politique d'un réseau ; rend l'ancienne et si elle a changé (rien n'est écrit sinon). */
export async function applyStorefrontPolicy(
  ctx: MutationCtx,
  networkId: Id<"networks">,
  policy: StorefrontPolicy,
  actorPersonId: Id<"persons"> | undefined,
): Promise<{ changed: boolean; previous: StorefrontPolicy }> {
  if (policy === "auto_verified" && !commerceActivationReady("storefrontAutomatic")) return failAppRule("shop_publication_closed", {}, "policyRefused")
  const row = await ctx.db
    .query("shopNetworkPolicies")
    .withIndex("by_network", (q) => q.eq("networkId", networkId))
    .unique()
  const previous = row?.storefront ?? DEFAULT_STOREFRONT_POLICY
  const automaticDecisionVersion = policy === "auto_verified" ? COMMERCE_ACTIVATION_DECISIONS.storefrontAutomatic.reference : undefined
  if (previous === policy && row?.automaticDecisionVersion === automaticDecisionVersion) return { changed: false, previous }
  const now = Date.now()
  const write = { storefront: policy, automaticDecisionVersion, updatedAt: now, updatedByPersonId: actorPersonId }
  if (row) await ctx.db.patch(row._id, write)
  else await ctx.db.insert("shopNetworkPolicies", { networkId, ...write })
  return { changed: true, previous }
}

function assertTransition(shop: Doc<"shops">, to: StorefrontState): void {
  if (!storefrontTransitionAllowed(shop.storefront, to)) failAppRule("shop_state_invalid", {}, "conflict")
}

/**
 * ADMET une vitrine : politique ouverte, présentation complète ; sans page, la
 * page naît ici (préparateur membre actif, premier administrateur ; identité et
 * logo du brouillon passés à la page) ; avec une page, elle doit avoir un
 * administrateur vivant. Rien n'est écrit si une condition manque.
 */
export async function admitStorefront(ctx: MutationCtx, shop: Doc<"shops">, now: number): Promise<{ handle: string; pageCreated: boolean }> {
  assertTransition(shop, "published")
  if (!storefrontsOpen(await storefrontPolicyOf(ctx, shop.networkId))) return failAppRule("shop_publication_closed", {}, "policyRefused")
  const network = await ctx.db.get(shop.networkId)
  if (!network || network.status !== "active") return notFound()
  const decided = { storefront: "published" as const, publishedAt: now, decidedAt: now, decisionReason: undefined, updatedAt: now }

  if (shop.pageId !== undefined) {
    const page = await ctx.db.get(shop.pageId)
    if (!page || page.status !== "active" || page.networkId !== shop.networkId || !isShopEligiblePage(page) || await isFederatedPage(ctx, page._id) || (await countLiveAdmins(ctx, page)) === 0) {
      return failAppRule("shop_owner_inactive", {}, "conflict")
    }
    if (presentationGaps(shopIdentityOf(shop, page)).length > 0) return failAppRule("shop_presentation_incomplete", {}, "invalidArgument")
    await ctx.db.patch(shop._id, decided)
    return { handle: page.handle, pageCreated: false }
  }

  const owner = shop.ownerPersonId
  if (owner === undefined || !(await isActiveMember(ctx, shop.networkId, owner))) return failAppRule("shop_owner_inactive", {}, "conflict")
  const identity = shopIdentityOf(shop, null)
  if (identity.name === null || presentationGaps(identity).length > 0) return failAppRule("shop_presentation_incomplete", {}, "invalidArgument")
  const created = await createShopPage(ctx, {
    network,
    adminPersonId: owner,
    name: identity.name,
    ...(identity.description !== null ? { description: identity.description } : {}),
    ...(identity.logoStorageId !== undefined ? { logoStorageId: identity.logoStorageId } : {}),
    ownerKind: SHOP_PAGE_OWNER_KIND,
    handleCandidates: shopHandleCandidates(identity.name),
    moderationText: shopModerationText(identity, shop),
  })
  if (created === null) return failAppRule("shop_handle_unavailable", {}, "conflict")
  // L'identité passe à la page (une seule source) ; l'autorité aussi : ses administrateurs vivants.
  await ctx.db.patch(shop._id, {
    ...decided,
    pageId: created.pageId,
    ownerPersonId: undefined,
    draftName: undefined,
    draftDescription: undefined,
    draftLogoStorageId: undefined,
  })
  return { handle: created.handle, pageCreated: true }
}

/** REFUSE une demande en file : le motif est rendu aux seuls gérants ; une nouvelle demande reste possible. */
export async function rejectStorefront(ctx: MutationCtx, shop: Doc<"shops">, reason: string, now: number): Promise<void> {
  assertTransition(shop, "rejected")
  await ctx.db.patch(shop._id, { storefront: "rejected", decisionReason: reason, decidedAt: now, updatedAt: now })
}

/**
 * SUSPEND une vitrine publiée, ou la RÉTABLIT : geste de l'équipe de la
 * plateforme seule. Rien n'est effacé ; une suspension ne se lève pas par une
 * nouvelle demande des gérants.
 */
export async function setStorefrontSuspended(
  ctx: MutationCtx,
  shop: Doc<"shops">,
  suspended: boolean,
  reason: string,
  now: number,
): Promise<{ changed: boolean; storefront: StorefrontState }> {
  const target: StorefrontState = suspended ? "suspended" : "published"
  if (shop.storefront === target) return { changed: false, storefront: target }
  assertTransition(shop, target)
  if (!suspended) {
    // Rétablir ne contourne ni la politique fermée ni la disparition d'un
    // gérant/page : les conditions d'admission sont relues maintenant.
    await admitStorefront(ctx, shop, now)
  } else {
    await ctx.db.patch(shop._id, { storefront: target, decisionReason: reason, decidedAt: now, updatedAt: now })
  }
  return { changed: true, storefront: target }
}
