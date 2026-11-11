import { storefrontTermsValidator } from "./storefrontTerms"
import { catalogOfferValidator } from "./catalogValidators"
/**
 * Validateurs des BOUTIQUES (P07). Module sans fonction Convex enregistrée.
 * Littéraux DÉRIVÉS des listes pures (`./rules`, une seule source) ; DTO
 * allowlistés : aucun identifiant de stockage (images par la garde des
 * fichiers), aucun signataire, aucun contact.
 */
import { type Infer, v } from "convex/values"
import { ACTIVITY_BLOCKS, ACTIVITY_CAPABILITIES, ACTIVITY_TEMPLATES } from "@antsia/social-domain/activityConfiguration"

import { badgeValidator, contentVisibilityValidator, literals, membershipStatusValidator } from "../../lib/validators"
import { withheldCodeValidator } from "../files/storageGuard"
import {
  PUBLICATION_OUTCOMES,
  SHOP_BLOCK_STATES,
  SHOP_BLOCKS,
  SHOP_CHECKOUT_MISSING,
  SHOP_MODELS,
  SHOP_PRESENTATION_GAPS,
  STOREFRONT_POLICIES,
  STOREFRONT_STATES,
} from "./rules"

export const shopModelValidator = literals(SHOP_MODELS)
/** Le gabarit d'activité : il règle la présentation et range la boutique dans son univers, jamais les droits. */
export const activityTemplateValidator = literals(ACTIVITY_TEMPLATES)
/**
 * Le plat du jour d'une adresse « Alimentation et restauration », daté du jour civil de Libreville où il a été
 * désigné. Les écrans ne l'annoncent que ce jour-là (`@antsia/social-domain/dailySpecial`).
 */
export const dailySpecialValidator = v.union(v.null(), v.object({ offerRef: v.string(), day: v.string() }))
/** MP02 : configuration de présentation, jamais une permission de publication ou d'encaissement. */
export const activityConfigurationValidator = v.object({
  version: v.literal(1),
  capabilities: v.array(literals(ACTIVITY_CAPABILITIES)),
  template: activityTemplateValidator,
  blocks: v.array(literals(ACTIVITY_BLOCKS)),
})
export const storefrontStateValidator = literals(STOREFRONT_STATES)
export const storefrontPolicyValidator = literals(STOREFRONT_POLICIES)
export const shopBlockValidator = literals(SHOP_BLOCKS)
export const shopBlockStateValidator = literals(SHOP_BLOCK_STATES)
export const publicationOutcomeValidator = literals(PUBLICATION_OUTCOMES)
export const presentationGapValidator = literals(SHOP_PRESENTATION_GAPS)
export const checkoutMissingValidator = literals(SHOP_CHECKOUT_MISSING)

/** À quel titre je gère : préparateur d'un brouillon sans page, ou administrateur VIVANT de sa page. */
export const shopManagerRoleValidator = v.union(v.literal("owner"), v.literal("page_admin"))

/** Décision de l'équipe de la plateforme sur une demande en file. */
export const storefrontDecisionValidator = v.union(v.literal("admit"), v.literal("reject"))

/**
 * Capacités INDICATIVES (P06, `deriveCommerceCapabilities`) : l'écran s'en sert
 * pour expliquer, jamais pour autoriser — chaque geste est rejugé au serveur.
 */
export const shopCapabilitiesValidator = v.object({
  draft: v.boolean(),
  storefront: v.boolean(),
  contact: v.boolean(),
  catalog: v.boolean(),
  quote: v.boolean(),
  booking: v.boolean(),
  jobs: v.boolean(),
  purchase: v.boolean(),
})

/** Une ligne de « Ma boutique » : les boutiques que je gère dans ce réseau. */
export const shopSummaryValidator = v.object({
  shopId: v.id("shops"),
  name: v.union(v.string(), v.null()),
  model: shopModelValidator,
  storefront: storefrontStateValidator,
  pageHandle: v.union(v.string(), v.null()),
  logoUrl: v.union(v.string(), v.null()),
  updatedAt: v.number(),
})
export type ShopSummary = Infer<typeof shopSummaryValidator>

/** Une fenêtre de gestion ne prétend pas être complète quand sa lecture a été bornée. */
export const myShopsValidator = v.object({ items: v.array(shopSummaryValidator), truncated: v.boolean() })
export type MyShops = Infer<typeof myShopsValidator>

/** Une page que j'administre et qui peut porter une boutique (ni institution, ni « Officiel », ni reflet fédéré). */
export const eligibleShopPageValidator = v.object({
  pageId: v.id("pages"),
  handle: v.string(),
  name: v.string(),
  badge: badgeValidator,
})
export const eligibleShopPagesValidator = v.object({ items: v.array(eligibleShopPageValidator), truncated: v.boolean() })
export type EligibleShopPages = Infer<typeof eligibleShopPagesValidator>

/** L'ÉDITEUR d'une boutique, pour ses gérants seulement. */
export const shopEditorValidator = v.object({
  shopId: v.id("shops"),
  role: shopManagerRoleValidator,
  model: shopModelValidator,
  activityConfiguration: v.optional(activityConfigurationValidator),
  name: v.union(v.string(), v.null()),
  description: v.union(v.string(), v.null()),
  specialty: v.union(v.string(), v.null()),
  serviceArea: v.union(v.string(), v.null()),
  hours: v.union(v.string(), v.null()),
  dailySpecial: dailySpecialValidator,
  logo: v.object({ present: v.boolean(), url: v.union(v.string(), v.null()), withheld: v.union(withheldCodeValidator, v.null()) }),
  page: v.union(v.null(), v.object({ handle: v.string(), badge: badgeValidator })),
  storefront: v.object({
    state: storefrontStateValidator,
    decisionReason: v.union(v.string(), v.null()),
    requestedAt: v.union(v.number(), v.null()),
    publishedAt: v.union(v.number(), v.null()),
  }),
  policy: storefrontPolicyValidator,
  publication: v.object({ outcome: publicationOutcomeValidator, gaps: v.array(presentationGapValidator), requestable: v.boolean() }),
  audience: v.object({
    visibility: contentVisibilityValidator,
    rootNetwork: v.boolean(),
    publicListing: v.boolean(),
    consentedAt: v.union(v.number(), v.null()),
    consentTextVersion: v.union(v.string(), v.null()),
    currentTextVersion: v.string(),
    publicNow: v.boolean(),
  }),
  blocks: v.array(v.object({ id: shopBlockValidator, state: shopBlockStateValidator })),
  capabilities: shopCapabilitiesValidator,
  checkout: v.object({ available: v.literal(false), missing: v.array(checkoutMissingValidator) }),
  /**
   * CM-10 : l'échéance de la pause telle qu'elle est stockée (facultative : les clients existants l'ignorent).
   * Elle peut être passée : l'écran la juge à son horloge (`isShopPaused`), la requête ne lisant pas l'heure.
   */
  pausedUntil: v.optional(v.number()),
  updatedAt: v.number(),
})
export type ShopEditor = Infer<typeof shopEditorValidator>

/** La VITRINE vue par un membre du réseau : identité de la page, présentation commerciale, blocs non vides. */
export const storefrontValidator = v.object({
  storefrontTerms: v.optional(storefrontTermsValidator),
  /** UM-03 : la cible du signalement des conditions, pour un lecteur sans rôle sur la page (facultative). */
  reportTarget: v.optional(v.object({ kind: v.literal("commerceStorefront"), id: v.id("commerceCatalogHeads") })),
  pageId: v.id("pages"),
  handle: v.string(),
  name: v.string(),
  description: v.union(v.string(), v.null()),
  logoUrl: v.union(v.string(), v.null()),
  bannerUrl: v.union(v.string(), v.null()),
  model: shopModelValidator,
  activityConfiguration: v.optional(activityConfigurationValidator),
  specialty: v.union(v.string(), v.null()),
  serviceArea: v.union(v.string(), v.null()),
  hours: v.union(v.string(), v.null()),
  dailySpecial: dailySpecialValidator,
  badge: badgeValidator,
  blocks: v.array(shopBlockValidator),
  publishedAt: v.number(),
  publicListing: v.boolean(),
  viewer: v.object({ following: v.boolean(), manages: v.boolean() }),
})
export type Storefront = Infer<typeof storefrontValidator>

/**
 * Une carte de l'annuaire des boutiques du réseau. La bannière est celle de la page (même garde des fichiers que
 * le logo) : la marketplace en fait la photo de ses grandes cartes (décision du propriétaire du 22/10/2026).
 */
export const storefrontCardValidator = v.object({
  handle: v.string(),
  name: v.string(),
  logoUrl: v.union(v.string(), v.null()),
  bannerUrl: v.union(v.string(), v.null()),
  model: shopModelValidator,
  /** Le gabarit d'activité effectif : il range la boutique dans son univers (« Alimentation et restauration » pour `food`). */
  template: activityTemplateValidator,
  specialty: v.union(v.string(), v.null()),
  serviceArea: v.union(v.string(), v.null()),
  /** Les horaires annoncés (texte libre) : l'univers Alimentation les montre sous chaque adresse. */
  hours: v.union(v.string(), v.null()),
  dailySpecial: dailySpecialValidator,
  badge: badgeValidator,
  publishedAt: v.number(),
})
export type StorefrontCard = Infer<typeof storefrontCardValidator>

/**
 * La vitrine PUBLIQUE (lecture sans compte) : DTO fermé, sans identifiant
 * interne, signataire, contact ni état du lecteur. Les publications de la page
 * n'y figurent pas : la lecture anonyme d'une page reste réservée aux pages
 * officielles (`modules/public/access.ts`, inchangé).
 */
export const publicStorefrontValidator = v.object({
  storefrontTerms: v.optional(storefrontTermsValidator),
  handle: v.string(),
  name: v.string(),
  description: v.union(v.string(), v.null()),
  logoUrl: v.union(v.string(), v.null()),
  bannerUrl: v.union(v.string(), v.null()),
  model: shopModelValidator,
  activityConfiguration: v.optional(activityConfigurationValidator),
  specialty: v.union(v.string(), v.null()),
  serviceArea: v.union(v.string(), v.null()),
  hours: v.union(v.string(), v.null()),
  badge: badgeValidator,
  blocks: v.array(shopBlockValidator),
  publishedAt: v.number(),
  origin: v.object({ slug: v.string(), name: v.string() }),
})
export type PublicStorefront = Infer<typeof publicStorefrontValidator>

/** SU06 : projection séparée ; les lecteurs stricts de la vitrine historique gardent leur contrat. */
export const publicDailySpecialValidator = v.object({
  version: v.literal(1),
  day: v.string(),
  offer: catalogOfferValidator,
})
export type PublicDailySpecial = Infer<typeof publicDailySpecialValidator>

/** CM-10 : une boutique en pause et son instant de réouverture — projection À PART, la vitrine stricte reste inchangée. */
export const storefrontPauseValidator = v.object({ pausedUntil: v.number() })
export const publicStorefrontPauseValidator = v.object({ version: v.literal(1), pausedUntil: v.number() })
export type PublicStorefrontPause = Infer<typeof publicStorefrontPauseValidator>

/** Une demande en FILE D'ADMISSION, pour l'équipe de la plateforme : la présentation à relire et son préparateur. */
export const storefrontReviewItemValidator = v.object({
  shopId: v.id("shops"),
  networkId: v.id("networks"),
  networkSlug: v.string(),
  storefront: storefrontStateValidator,
  model: shopModelValidator,
  activityConfiguration: v.optional(activityConfigurationValidator),
  name: v.union(v.string(), v.null()),
  description: v.union(v.string(), v.null()),
  specialty: v.union(v.string(), v.null()),
  serviceArea: v.union(v.string(), v.null()),
  hours: v.union(v.string(), v.null()),
  logoUrl: v.union(v.string(), v.null()),
  pageHandle: v.union(v.string(), v.null()),
  requestedAt: v.union(v.number(), v.null()),
  preparer: v.union(
    v.null(),
    v.object({ displayName: v.union(v.string(), v.null()), handle: v.union(v.string(), v.null()), membership: v.union(membershipStatusValidator, v.null()) }),
  ),
})
export type StorefrontReviewItem = Infer<typeof storefrontReviewItemValidator>
