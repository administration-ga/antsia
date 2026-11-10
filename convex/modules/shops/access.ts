/**
 * Les gardes des BOUTIQUES — le point de passage unique, sans fonction Convex.
 *
 * « Je gère cette boutique » : préparateur d'un brouillon SANS page, ou
 * administrateur VIVANT de la page qui la porte (habilitation acceptée,
 * adhésion active au réseau de la page, page native et active, ni institution
 * ni « Officiel ») — relu à chaque geste. Tout autre cas, y compris une
 * boutique d'un autre réseau ou inconnue : le même refus INDISTINCT.
 *
 * « Cette vitrine se lit » : publiée, politique du réseau ouverte, page
 * active, native et admise par la modération, au moins un administrateur
 * vivant (un gérant suspendu à la racine ne tient plus de vitrine), lisible
 * depuis le réseau du lecteur.
 */
import { type CommerceCapabilities, deriveCommerceCapabilities } from "@antsia/social-domain/commerce/lifecycle"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { notFound } from "../../lib/errors"
import { isFederatedPage } from "../federation/mirrorAccess"
import { canReadModeratedContent, contentState } from "../moderation/policy"
import { countLiveAdmins, liveSignatoryRole } from "../pages/access"
import { isShopEligiblePage } from "../pages/shopPages"
import { publicOriginNetwork } from "../public/access"
import { COMMERCE_ACTIVATION_DECISIONS, commerceActivationReady } from "./commerceActivation"
import { DEFAULT_STOREFRONT_POLICY, SHOP_PUBLIC_LISTING_TEXT_VERSION, type StorefrontPolicy, storefrontsOpen } from "./rules"

type ReadCtx = Pick<QueryCtx, "db">

export type ShopManagerRole = "owner" | "page_admin"
export type ManagedShop = { shop: Doc<"shops">; page: Doc<"pages"> | null; role: ShopManagerRole }

/** La boutique que cette personne GÈRE dans ce réseau, ou `null` — jamais d'exception, jamais de distinction. */
export async function managedShopOrNull(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">, shopId: Id<"shops">): Promise<ManagedShop | null> {
  const shop = await ctx.db.get(shopId)
  if (!shop || shop.networkId !== networkId) return null
  if (shop.pageId === undefined) return shop.ownerPersonId === personId ? { shop, page: null, role: "owner" } : null
  const page = await ctx.db.get(shop.pageId)
  if (!page || page.networkId !== shop.networkId || page.status !== "active" || !isShopEligiblePage(page)) return null
  return (await liveSignatoryRole(ctx, page, personId)) === "admin" ? { shop, page, role: "page_admin" } : null
}

/** La boutique gérée, sinon le refus indistinct (`notFound`). */
export async function requireManagedShop(ctx: ReadCtx, caller: { networkId: Id<"networks">; personId: Id<"persons"> }, shopId: Id<"shops">): Promise<ManagedShop> {
  return (await managedShopOrNull(ctx, caller.networkId, caller.personId, shopId)) ?? notFound()
}

/** La politique de publication des vitrines d'un réseau ; aucune ligne : FERMÉE. */
export async function storefrontPolicyOf(ctx: ReadCtx, networkId: Id<"networks">): Promise<StorefrontPolicy> {
  const row = await ctx.db
    .query("shopNetworkPolicies")
    .withIndex("by_network", (q) => q.eq("networkId", networkId))
    .unique()
  const policy = row?.storefront ?? DEFAULT_STOREFRONT_POLICY
  // Une ancienne bascule ne vaut pas accord sur une politique automatique future.
  if (policy === "auto_verified" && (!commerceActivationReady("storefrontAutomatic") ||
    row?.automaticDecisionVersion !== COMMERCE_ACTIVATION_DECISIONS.storefrontAutomatic.reference)) return "review"
  return policy
}

/** La boutique portée par une page (une au plus), ou `null`. */
export async function shopOfPage(ctx: ReadCtx, pageId: Id<"pages">): Promise<Doc<"shops"> | null> {
  return await ctx.db
    .query("shops")
    .withIndex("by_page", (q) => q.eq("pageId", pageId))
    .unique()
}

/**
 * La vitrine se lit-elle depuis ce réseau ? Le sien ; ou la racine, si sa règle
 * est `root` (geste explicite) et que son réseau est un enfant actif de cette racine.
 */
export async function isStorefrontInReadingContext(ctx: ReadCtx, shop: Doc<"shops">, network: Doc<"networks">): Promise<boolean> {
  if (shop.networkId === network._id) return true
  if (network.kind !== "root" || shop.visibility !== "root") return false
  return (await publicOriginNetwork(ctx, network, shop.networkId)) !== null
}

/**
 * La page d'une vitrine PUBLIÉE et SERVABLE, ou `null` : politique du réseau
 * ouverte, page active, admissible (ni institution ni « Officiel ») et admise
 * par la modération (masques du lecteur compris), au moins un administrateur
 * vivant. Une page reflétée ne porte jamais de boutique : le rattachement exige
 * un administrateur vivant, que le reflet n'a pas. La projection publique
 * ajoute ses propres conditions (consentement, origine, prélecture fermée).
 */
export async function servableStorefrontPage(ctx: ReadCtx, shop: Doc<"shops">, readerPersonId?: Id<"persons">): Promise<Doc<"pages"> | null> {
  if (shop.storefront !== "published" || shop.pageId === undefined) return null
  if (!storefrontsOpen(await storefrontPolicyOf(ctx, shop.networkId))) return null
  const page = await ctx.db.get(shop.pageId)
  if (!page || page.status !== "active" || page.networkId !== shop.networkId || !isShopEligiblePage(page)) return null
  if (await isFederatedPage(ctx, page._id)) return null
  if (!(await canReadModeratedContent(ctx, "page", page._id, readerPersonId))) return null
  if ((await countLiveAdmins(ctx, page)) === 0) return null
  return page
}

/**
 * La vitrine que la PROJECTION PUBLIQUE peut servir, ou `null` : servable
 * (ci-dessus, masques du lecteur nommé compris), consentement de diffusion
 * publique en vigueur, réseau d'origine vivant et rattaché à CETTE racine,
 * règle `root` explicite hors de la racine, et contenu de la page publié —
 * une prélecture reste fermée même à son propriétaire.
 */
export async function publicStorefrontPage(
  ctx: ReadCtx,
  root: Doc<"networks">,
  shop: Doc<"shops">,
  readerPersonId?: Id<"persons">,
): Promise<{ page: Doc<"pages">; origin: Doc<"networks"> } | null> {
  if (!hasPublicConsent(shop)) return null
  const origin = await publicOriginNetwork(ctx, root, shop.networkId)
  if (!origin || (origin._id !== root._id && shop.visibility !== "root")) return null
  const page = await servableStorefrontPage(ctx, shop, readerPersonId)
  if (!page) return null
  const state = await contentState(ctx, "page", page._id)
  if (state !== null && state.status !== "published") return null
  return { page, origin }
}

/** L'identité AFFICHÉE : celle de la page dès qu'elle existe (une seule source), sinon celle du brouillon. */
export type ShopIdentity = { name: string | null; description: string | null; logoStorageId: Id<"_storage"> | undefined }

export function shopIdentityOf(shop: Doc<"shops">, page: Doc<"pages"> | null): ShopIdentity {
  if (page) return { name: page.name, description: page.description ?? null, logoStorageId: page.logoStorageId }
  return { name: shop.draftName ?? null, description: shop.draftDescription ?? null, logoStorageId: shop.draftLogoStorageId }
}

/** Le texte que relit la modération de la page : l'identité ET la présentation commerciale affichée. */
export function shopModerationText(identity: { name: string | null; description: string | null }, shop: Pick<Doc<"shops">, "specialty" | "serviceArea" | "hours">): string {
  return [identity.name, identity.description, shop.specialty, shop.serviceArea, shop.hours].filter((part): part is string => typeof part === "string" && part.length > 0).join(" ")
}

/** Consentement daté, non révoqué et donné sur la version actuelle du texte public. */
export function hasPublicConsent(shop: Pick<Doc<"shops">, "publicConsentAt" | "publicConsentRevokedAt" | "publicConsentTextVersion">): boolean {
  return shop.publicConsentAt !== undefined && Number.isFinite(shop.publicConsentAt)
    && shop.publicConsentRevokedAt === undefined && shop.publicConsentTextVersion === SHOP_PUBLIC_LISTING_TEXT_VERSION
}

/**
 * Les capacités INDICATIVES d'une boutique (P06) : préparer et vitrine ; contact
 * (P10), catalogue, devis, rendez-vous, emploi et achat (liaison PRO.GA, P08–P13)
 * restent fermés — aucun badge, aucun niveau d'identité n'entre dans ce calcul.
 */
export function shopCapabilities(shop: Doc<"shops">, storefrontAdmitted: boolean): CommerceCapabilities {
  return deriveCommerceCapabilities({
    contactEnabled: false,
    link: null,
    memberStatus: "active",
    networkCommerceEnabled: false,
    proShop: null,
    shopRemoved: shop.storefront === "suspended",
    storefrontAdmitted,
  })
}
