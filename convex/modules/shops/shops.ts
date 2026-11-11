import { readableStorefrontTerms } from "./storefrontTerms"
/**
 * Les BOUTIQUES d'un réseau, côté membre (P07, ADR-0019) — préparer, présenter,
 * demander la publication de la vitrine, la retirer, régler sa diffusion
 * publique ; lire « Ma boutique », une vitrine et l'annuaire.
 *
 * Gardes, dans cet ordre, à chaque écriture : adhésion (constructeur : membre
 * DÉCLARÉ au moins, suspension racine = partout) → éligibilité sociale →
 * débit (`social.write`, puis le seau `shop.*` du geste) → droit (préparateur
 * d'un brouillon sans page, ou administrateur VIVANT de sa page) — refus
 * indistinct. `createPage` garde sa règle `verifiee` : une page ne naît ici
 * que de l'admission d'une vitrine (`decisions.admitStorefront`).
 *
 * Trois autorisations distinctes : PRÉPARER (ouvert au membre déclaré),
 * PUBLIER LA VITRINE (politique du réseau, fermée par défaut), ENCAISSER
 * (absente : aucune fonction ne l'ouvre, l'éditeur dit les étapes qui restent).
 */
import { computePageBadge } from "@antsia/social-domain/badges"
import { effectiveActivityConfiguration, parseActivityConfiguration, visibleActivityBlocks } from "@antsia/social-domain/activityConfiguration"
import { librevilleDay } from "@antsia/social-domain/dailySpecial"
import { checkShopPauseDay, isShopPaused, SHOP_PAUSE_MAX_DAYS } from "@antsia/social-domain/shopPause"
import { catalogStorefrontBlocks, resolveCatalogOffer } from "./catalogRead"
import { paginationOptsValidator, paginationResultValidator, type PaginationResult } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { fail, failAppRule, failRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { guardUploadUrl } from "../../lib/uploadPolicy"
import { contentVisibilityValidator } from "../../lib/validators"
import { admitStoredUpload, assertFreshUpload } from "../files/admission"
import { resolveFileDelivery, servableUrl, withheldCodeOf, withheldCodeValidator } from "../files/storageGuard"
import { moderateContentWrite } from "../moderation/policy"
import { findPageByHandle, liveSignatoryRole } from "../pages/access"
import { isFollowingPage } from "../pages/follows"
import { purgePageImage } from "../pages/identity"
import { isShopEligiblePage, setShopPageLogo, updateShopPageIdentity } from "../pages/shopPages"
import {
  hasPublicConsent,
  isStorefrontInReadingContext,
  type ManagedShop,
  managedShopOrNull,
  publicStorefrontPage,
  requireManagedShop,
  servableStorefrontPage,
  shopCapabilities,
  shopIdentityOf,
  shopModerationText,
  shopOfPage,
  storefrontPolicyOf,
} from "./access"
import { admitStorefront, storefrontPublicationOutcome } from "./decisions"
import { liveShopCommerceLink, revokeShopCommerceLink } from "./commerceLinkLifecycle"
import { purgeSavedOffersForShop } from "./savedOffers"
import { closeDailySpecialStory } from "../stories/dailySpecialSource"
import {
  checkShopDescription,
  checkShopName,
  checkShopOptionalLine,
  presentationGaps,
  SHOP_CHECKOUT_MISSING,
  SHOP_DRAFTS_PER_PERSON_MAX,
  SHOP_MANAGEMENT_PAGES_MAX,
  SHOP_PUBLIC_LISTING_TEXT_VERSION,
  type ShopFieldResult,
  STOREFRONT_DISCARDABLE,
  STOREFRONT_REQUESTABLE,
  storefrontsOpen,
} from "./rules"
import {
  activityConfigurationValidator,
  eligibleShopPagesValidator,
  myShopsValidator,
  type ShopEditor,
  shopEditorValidator,
  shopModelValidator,
  type ShopSummary,
  storefrontCardValidator,
  type Storefront,
  type StorefrontCard,
  storefrontPauseValidator,
  storefrontStateValidator,
  storefrontValidator,
} from "./validators"

type ReadCtx = Pick<QueryCtx, "db" | "storage">

/** Pages de l'annuaire des boutiques, plafond dur. */
const DIRECTORY_PAGE_MAX = 24

/** Une saisie conforme, sinon le refus MÉTIER traduit par l'application (`shops:errors.<règle>`). */
function accepted<T>(result: ShopFieldResult<T>): T {
  if (!result.ok) return failAppRule(result.violation.rule, result.violation.params, "invalidArgument")
  return result.value
}

/** `undefined` : champ inchangé ; `null` ou vide : champ retiré ; sinon la valeur conforme. */
function optionalLine(raw: string | null | undefined, field: "specialty" | "serviceArea" | "hours"): string | undefined | null {
  if (raw === undefined) return undefined
  if (raw === null) return null
  return accepted(checkShopOptionalLine(raw, field)) ?? null
}

async function logoUrlOf(ctx: ReadCtx, storageId: Id<"_storage"> | undefined): Promise<string | null> {
  return storageId ? await servableUrl(ctx, storageId) : null
}

async function summaryOf(ctx: ReadCtx, shop: Doc<"shops">, page: Doc<"pages"> | null): Promise<ShopSummary> {
  const identity = shopIdentityOf(shop, page)
  return {
    shopId: shop._id,
    name: identity.name,
    model: shop.model,
    storefront: shop.storefront,
    pageHandle: page?.handle ?? null,
    logoUrl: await logoUrlOf(ctx, identity.logoStorageId),
    updatedAt: shop.updatedAt,
  }
}

/** L'éditeur d'une boutique GÉRÉE : rien d'un tiers, aucun identifiant de stockage. */
async function editorOf(ctx: ReadCtx, managed: ManagedShop, viewer: { personId: Id<"persons">; network: Doc<"networks">; rootNetwork: Doc<"networks"> }): Promise<ShopEditor> {
  const { shop, page, role } = managed
  const identity = shopIdentityOf(shop, page)
  const logo = identity.logoStorageId ? await resolveFileDelivery(ctx, identity.logoStorageId) : null
  const { policy, outcome } = await storefrontPublicationOutcome(ctx, shop, viewer.personId)
  const gaps = presentationGaps(identity)
  const servable = (await servableStorefrontPage(ctx, shop, viewer.personId)) !== null
  const publicNow = (await publicStorefrontPage(ctx, viewer.rootNetwork, shop, viewer.personId)) !== null
  const consenting = hasPublicConsent(shop)
  const commerceLinked = (await liveShopCommerceLink(ctx, shop.networkId, shop._id)) !== null
  const configuration = effectiveActivityConfiguration(shop.activityConfiguration, shop.model)
  const catalogBlocks = await catalogStorefrontBlocks(ctx, viewer.rootNetwork, shop, viewer.personId)
  const catalogReady = catalogBlocks.length > 0
  return {
    shopId: shop._id,
    role,
    model: shop.model,
    activityConfiguration: configuration,
    name: identity.name,
    description: identity.description,
    specialty: shop.specialty ?? null,
    serviceArea: shop.serviceArea ?? null,
    hours: shop.hours ?? null,
    dailySpecial: shop.dailySpecial ?? null,
    logo: { present: identity.logoStorageId !== undefined, url: logo?.url ?? null, withheld: logo ? withheldCodeOf(logo.scan) : null },
    page: page ? { handle: page.handle, badge: computePageBadge(page.trust) } : null,
    storefront: {
      state: shop.storefront,
      decisionReason: shop.decisionReason ?? null,
      requestedAt: shop.requestedAt ?? null,
      publishedAt: shop.publishedAt ?? null,
    },
    policy,
    publication: {
      outcome,
      gaps,
      requestable: STOREFRONT_REQUESTABLE.includes(shop.storefront) && gaps.length === 0 && storefrontsOpen(policy),
    },
    audience: {
      visibility: shop.visibility,
      rootNetwork: viewer.network.kind === "root",
      publicListing: consenting,
      consentedAt: consenting ? (shop.publicConsentAt ?? null) : null,
      consentTextVersion: consenting ? (shop.publicConsentTextVersion ?? null) : null,
      currentTextVersion: SHOP_PUBLIC_LISTING_TEXT_VERSION,
      publicNow,
    },
    blocks: configuration.blocks.map((id) => ({ id, state: id === "catalog" || id === "services" ? catalogBlocks.includes(id) ? "active" : commerceLinked ? "awaiting_pro_catalog" : "awaiting_pro_link" : id === "publications" && page === null ? "awaiting_page" : "active" })),
    capabilities: { ...shopCapabilities(shop, servable), catalog: catalogReady },
    checkout: { available: false as const, missing: SHOP_CHECKOUT_MISSING.filter((step) => (step !== "pro_link" || !commerceLinked) && (step !== "pro_catalog" || !catalogReady)) },
    ...(shop.pausedUntil !== undefined ? { pausedUntil: shop.pausedUntil } : {}),
    updatedAt: shop.updatedAt,
  }
}

/** La vitrine vue par un membre : identité de la page, présentation commerciale, blocs NON VIDES. */
async function storefrontOf(ctx: ReadCtx, shop: Doc<"shops">, page: Doc<"pages">, rootNetwork: Doc<"networks">, readerPersonId: Id<"persons">): Promise<Storefront> {
  const configuration = effectiveActivityConfiguration(shop.activityConfiguration, shop.model)
  const [logoUrl, bannerUrl, following, role, publicView] = await Promise.all([
    logoUrlOf(ctx, page.logoStorageId),
    logoUrlOf(ctx, page.bannerStorageId),
    isFollowingPage(ctx, page._id, readerPersonId),
    liveSignatoryRole(ctx, page, readerPersonId),
    publicStorefrontPage(ctx, rootNetwork, shop, readerPersonId),
  ])
  const storefrontTerms = await readableStorefrontTerms(ctx, rootNetwork, shop._id, readerPersonId)
  return {
    ...(storefrontTerms ? { storefrontTerms } : {}),
    pageId: page._id,
    handle: page.handle,
    name: page.name,
    description: page.description ?? null,
    logoUrl,
    bannerUrl,
    model: shop.model,
    activityConfiguration: configuration,
    specialty: shop.specialty ?? null,
    serviceArea: shop.serviceArea ?? null,
    hours: shop.hours ?? null,
    dailySpecial: shop.dailySpecial ?? null,
    badge: computePageBadge(page.trust),
    blocks: visibleActivityBlocks(configuration, [...await catalogStorefrontBlocks(ctx, rootNetwork, shop, readerPersonId), "publications", "about"]),
    publishedAt: shop.publishedAt ?? shop.updatedAt,
    // La vitrine a-t-elle aussi une adresse PUBLIQUE en ce moment (la même porte que la projection anonyme) ?
    publicListing: publicView !== null,
    viewer: { following, manages: role === "admin" },
  }
}

export async function cardOf(ctx: ReadCtx, shop: Doc<"shops">, page: Doc<"pages">): Promise<StorefrontCard> {
  const [logoUrl, bannerUrl] = await Promise.all([logoUrlOf(ctx, page.logoStorageId), logoUrlOf(ctx, page.bannerStorageId)])
  return {
    handle: page.handle,
    name: page.name,
    logoUrl,
    bannerUrl,
    model: shop.model,
    template: effectiveActivityConfiguration(shop.activityConfiguration, shop.model).template,
    specialty: shop.specialty ?? null,
    serviceArea: shop.serviceArea ?? null,
    hours: shop.hours ?? null,
    dailySpecial: shop.dailySpecial ?? null,
    badge: computePageBadge(page.trust),
    publishedAt: shop.publishedAt ?? shop.updatedAt,
  }
}

// ═══════════════════════════════════════════════════════════════
// Lire
// ═══════════════════════════════════════════════════════════════

/**
 * « Ma boutique » : les boutiques que je GÈRE dans ce réseau — mes brouillons
 * sans page (au plus le quota) et les boutiques des pages que j'administre.
 */
export const myShops = networkQuery({
  args: {},
  returns: myShopsValidator,
  handler: async (ctx) => {
    const out: ShopSummary[] = []
    const drafts = await ctx.db
      .query("shops")
      .withIndex("by_network_owner", (q) => q.eq("networkId", ctx.networkId).eq("ownerPersonId", ctx.person._id))
      .take(SHOP_DRAFTS_PER_PERSON_MAX + 1)
    for (const shop of drafts.slice(0, SHOP_DRAFTS_PER_PERSON_MAX)) if (shop.pageId === undefined) out.push(await summaryOf(ctx, shop, null))
    const signatures = await ctx.db
      .query("pageSignatories")
      .withIndex("by_network_person", (q) => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id))
      .take(SHOP_MANAGEMENT_PAGES_MAX + 1)
    for (const row of signatures.slice(0, SHOP_MANAGEMENT_PAGES_MAX)) {
      if (row.acceptedAt === undefined || row.role !== "admin") continue
      const shop = await shopOfPage(ctx, row.pageId)
      if (!shop) continue
      const managed = await managedShopOrNull(ctx, ctx.networkId, ctx.person._id, shop._id)
      if (managed) out.push(await summaryOf(ctx, managed.shop, managed.page))
    }
    return {
      items: out.sort((left, right) => right.updatedAt - left.updatedAt),
      truncated: drafts.length > SHOP_DRAFTS_PER_PERSON_MAX || signatures.length > SHOP_MANAGEMENT_PAGES_MAX,
    }
  },
})

/** Les pages que j'administre et qui peuvent porter une boutique (ni institution, ni « Officiel », sans boutique). */
export const eligibleShopPages = networkQuery({
  args: {},
  returns: eligibleShopPagesValidator,
  handler: async (ctx) => {
    const signatures = await ctx.db
      .query("pageSignatories")
      .withIndex("by_network_person", (q) => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id))
      .take(SHOP_MANAGEMENT_PAGES_MAX + 1)
    const out: { pageId: Id<"pages">; handle: string; name: string; badge: ReturnType<typeof computePageBadge> }[] = []
    for (const row of signatures.slice(0, SHOP_MANAGEMENT_PAGES_MAX)) {
      if (row.acceptedAt === undefined || row.role !== "admin") continue
      const page = await ctx.db.get(row.pageId)
      if (!page || page.networkId !== ctx.networkId || page.status !== "active" || !isShopEligiblePage(page)) continue
      if ((await liveSignatoryRole(ctx, page, ctx.person._id)) !== "admin" || (await shopOfPage(ctx, page._id))) continue
      out.push({ pageId: page._id, handle: page.handle, name: page.name, badge: computePageBadge(page.trust) })
    }
    return { items: out, truncated: signatures.length > SHOP_MANAGEMENT_PAGES_MAX }
  },
})

/** L'éditeur d'une boutique que je gère ; inconnue, d'ailleurs ou d'autrui : le même `null`. */
export const getMyShop = networkQuery({
  args: { shopId: v.id("shops") },
  returns: v.union(shopEditorValidator, v.null()),
  handler: async (ctx, args) => {
    const managed = await managedShopOrNull(ctx, ctx.networkId, ctx.person._id, args.shopId)
    return managed ? await editorOf(ctx, managed, { personId: ctx.person._id, network: ctx.network, rootNetwork: ctx.rootNetwork }) : null
  },
})

/**
 * Une VITRINE, par l'adresse de sa page, telle qu'un membre de ce réseau la
 * lit : publiée, réseau ouvert, page admise, gérant vivant. Inconnue, retirée,
 * suspendue, en préparation ou d'ailleurs : le même `null`.
 */
export const storefront = networkQuery({
  args: { handle: v.string() },
  returns: v.union(storefrontValidator, v.null()),
  handler: async (ctx, args) => {
    const page = await findPageByHandle(ctx, args.handle)
    if (!page) return null
    const shop = await shopOfPage(ctx, page._id)
    if (!shop || !(await isStorefrontInReadingContext(ctx, shop, ctx.network))) return null
    const servable = await servableStorefrontPage(ctx, shop, ctx.person._id)
    return servable ? await storefrontOf(ctx, shop, servable, ctx.rootNetwork, ctx.person._id) : null
  },
})

/**
 * CM-10 : l'instant de RÉOUVERTURE d'une boutique en pause, par l'adresse de sa page, pour le bandeau des écrans du
 * membre (vitrine, fiche d'offre, panier, préparation, demandes, emploi). Lue À PART de la vitrine, sous les mêmes
 * gardes de lecture. `now` vient de l'écran, arrondi à la minute : une requête ne lit pas l'horloge et reste en cache
 * tant que rien ne change en base ; sans lui, le bandeau survivrait à l'échéance. Ouverte, inconnue ou illisible :
 * le même `null`.
 */
export const storefrontPause = networkQuery({
  args: { handle: v.string(), now: v.number() },
  returns: v.union(storefrontPauseValidator, v.null()),
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.now)) return fail("invalidArgument", { field: "now" })
    const page = await findPageByHandle(ctx, args.handle)
    const shop = page ? await shopOfPage(ctx, page._id) : null
    const pausedUntil = shop?.pausedUntil
    if (!shop || !isShopPaused(pausedUntil, args.now) || !(await isStorefrontInReadingContext(ctx, shop, ctx.network))) return null
    return (await servableStorefrontPage(ctx, shop, ctx.person._id)) ? { pausedUntil } : null
  },
})

/**
 * L'ANNUAIRE des vitrines du réseau, les plus récemment publiées d'abord —
 * paginé, chaque ligne re-gardée. Politique fermée : vide, sans erreur.
 */
export const directory = networkQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(storefrontCardValidator),
  handler: async (ctx, args): Promise<PaginationResult<StorefrontCard>> => {
    if (!storefrontsOpen(await storefrontPolicyOf(ctx, ctx.networkId))) return { page: [], isDone: true, continueCursor: "" }
    if (!Number.isFinite(args.paginationOpts.numItems)) return fail("invalidArgument", { field: "paginationOpts" })
    // Les options natives (endCursor, id, découpage) sont conservées ; seuls les
    // budgets sont resserrés. Une fenêtre filtrée vide garde son curseur brut.
    const opts = {
      ...args.paginationOpts,
      numItems: Math.min(Math.max(Math.trunc(args.paginationOpts.numItems), 1), DIRECTORY_PAGE_MAX),
      maximumRowsRead: Math.min(args.paginationOpts.maximumRowsRead ?? DIRECTORY_PAGE_MAX, DIRECTORY_PAGE_MAX),
      maximumBytesRead: Math.min(args.paginationOpts.maximumBytesRead ?? 1_048_576, 1_048_576),
    }
    const result = ctx.network.kind === "root"
      ? await ctx.db.query("shops").withIndex("by_storefront_publishedAt", (q) => q.eq("storefront", "published")).order("desc").paginate(opts)
      : await ctx.db.query("shops").withIndex("by_network_storefront_publishedAt", (q) => q.eq("networkId", ctx.networkId).eq("storefront", "published")).order("desc").paginate(opts)
    const page: StorefrontCard[] = []
    for (const shop of result.page) {
      if (!(await isStorefrontInReadingContext(ctx, shop, ctx.network))) continue
      const servable = await servableStorefrontPage(ctx, shop, ctx.person._id)
      if (servable) page.push(await cardOf(ctx, shop, servable))
    }
    return { ...result, page }
  },
})

// ═══════════════════════════════════════════════════════════════
// Préparer et présenter
// ═══════════════════════════════════════════════════════════════

/**
 * PRÉPARER une boutique — tout membre déclaré actif. Sans page : un brouillon
 * à moi (nom commercial exigé, quota par réseau). Avec une page que
 * j'administre : la boutique de cette page (ni institution, ni « Officiel »,
 * une seule par page). Aucune page, aucune structure, aucun catalogue n'est
 * créé ici.
 */
export const startShop = networkMutation({
  args: { model: shopModelValidator, name: v.optional(v.string()), pageId: v.optional(v.id("pages")), activityConfiguration: v.optional(activityConfigurationValidator) },
  returns: v.object({ shopId: v.id("shops") }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "shop.create", ctx.person._id)
    const configuration = args.activityConfiguration === undefined ? undefined : parseActivityConfiguration(args.activityConfiguration)
    if (configuration === null) return fail("invalidArgument", { field: "activityConfiguration" })
    const now = Date.now()
    if (args.pageId !== undefined) {
      const page = await ctx.db.get(args.pageId)
      if (!page || page.networkId !== ctx.networkId || page.status !== "active") return notFound()
      if ((await liveSignatoryRole(ctx, page, ctx.person._id)) !== "admin") return notFound()
      if (!isShopEligiblePage(page)) return failAppRule("shop_page_reserved", {}, "policyRefused")
      if (await shopOfPage(ctx, page._id)) return failAppRule("shop_page_taken", {}, "conflict")
      const shopId = await ctx.db.insert("shops", {
        networkId: ctx.networkId,
        preparedByPersonId: ctx.person._id,
        pageId: page._id,
        model: args.model,
        ...(configuration ? { activityConfiguration: configuration } : {}),
        storefront: "draft",
        visibility: "network",
        createdAt: now,
        updatedAt: now,
      })
      return { shopId }
    }
    if (args.name === undefined) return fail("invalidArgument", { field: "name" })
    const name = accepted(checkShopName(args.name))
    const mine = await ctx.db
      .query("shops")
      .withIndex("by_network_owner", (q) => q.eq("networkId", ctx.networkId).eq("ownerPersonId", ctx.person._id))
      .take(SHOP_DRAFTS_PER_PERSON_MAX)
    if (mine.length >= SHOP_DRAFTS_PER_PERSON_MAX) return failAppRule("shop_draft_quota", { max: SHOP_DRAFTS_PER_PERSON_MAX }, "policyRefused")
    const shopId = await ctx.db.insert("shops", {
      networkId: ctx.networkId,
      ownerPersonId: ctx.person._id,
      preparedByPersonId: ctx.person._id,
      model: args.model,
      ...(configuration ? { activityConfiguration: configuration } : {}),
      draftName: name,
      storefront: "draft",
      visibility: "network",
      createdAt: now,
      updatedAt: now,
    })
    return { shopId }
  },
})

/**
 * Modifier une boutique que je gère : activité (modèle, nom, spécialité) et
 * présentation (description, zone approximative, horaires). Seuls les champs
 * fournis changent (`null` retire un champ facultatif) ; un appel qui ne change
 * rien n'écrit rien. Avec une page, nom et description sont ceux de la PAGE
 * (historique d'identité) et la modération de la page relit le tout.
 */
export const updateShop = networkMutation({
  args: {
    shopId: v.id("shops"),
    model: v.optional(shopModelValidator),
    activityConfiguration: v.optional(activityConfigurationValidator),
    name: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    specialty: v.optional(v.union(v.string(), v.null())),
    serviceArea: v.optional(v.union(v.string(), v.null())),
    hours: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "shop.edit", ctx.person._id)
    const { shop, page } = await requireManagedShop(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.shopId)
    const configuration = args.activityConfiguration === undefined ? undefined : parseActivityConfiguration(args.activityConfiguration)
    if (configuration === null) return fail("invalidArgument", { field: "activityConfiguration" })
    const name = args.name === undefined ? undefined : accepted(checkShopName(args.name))
    const description = args.description === undefined ? undefined : args.description === null ? null : (accepted(checkShopDescription(args.description)) ?? null)
    const lines = {
      specialty: optionalLine(args.specialty, "specialty"),
      serviceArea: optionalLine(args.serviceArea, "serviceArea"),
      hours: optionalLine(args.hours, "hours"),
    }
    const patch: Partial<Doc<"shops">> = {}
    if (args.model !== undefined && args.model !== shop.model) patch.model = args.model
    if (configuration && JSON.stringify(configuration) !== JSON.stringify(parseActivityConfiguration(shop.activityConfiguration))) patch.activityConfiguration = configuration
    for (const field of ["specialty", "serviceArea", "hours"] as const) {
      const next = lines[field]
      if (next === undefined) continue
      const value = next ?? undefined
      if (value !== shop[field]) patch[field] = value
    }
    let identityChanged = false
    if (page) {
      identityChanged = await updateShopPageIdentity(ctx, page, ctx.person._id, { ...(name !== undefined ? { name } : {}), ...(description !== undefined ? { description } : {}) })
    } else {
      if (name !== undefined && name !== shop.draftName) patch.draftName = name
      if (description !== undefined && (description ?? undefined) !== shop.draftDescription) patch.draftDescription = description ?? undefined
    }
    if (!identityChanged && Object.keys(patch).length === 0) return { changed: false }
    await ctx.db.patch(shop._id, { ...patch, updatedAt: Date.now() })
    if (page) {
      const freshPage = await ctx.db.get(page._id)
      const freshShop = await ctx.db.get(shop._id)
      if (freshPage && freshShop) {
        await moderateContentWrite(ctx, { networkId: page.networkId, ownerPersonId: ctx.person._id, kind: "page", id: page._id, text: shopModerationText(shopIdentityOf(freshShop, freshPage), freshShop) })
      }
    }
    return { changed: true }
  },
})

/**
 * Le PLAT DU JOUR d'une adresse « Alimentation et restauration » (SU06, étude des sept univers, § 5.4) : une
 * offre de SON menu, désignée pour aujourd'hui (jour civil de Libreville) ; `null` le retire. Réservé aux gérants
 * d'une boutique au gabarit `food` qui a sa page. L'offre est relue comme le gérant la lit : absente, retirée,
 * d'une autre boutique ou d'un autre genre qu'un produit, c'est le refus indistinct. Une désignation identique le
 * même jour n'écrit rien. Ni la modération ni l'admission ne sont rejouées : rien de nouveau n'est écrit dans la
 * présentation, seule une référence vers une offre déjà publiée.
 */
export const setDailySpecial = networkMutation({
  args: { shopId: v.id("shops"), offerRef: v.union(v.string(), v.null()) },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "shop.edit", ctx.person._id)
    const { shop, page } = await requireManagedShop(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.shopId)
    if (!page || effectiveActivityConfiguration(shop.activityConfiguration, shop.model).template !== "food") return notFound()
    if (args.offerRef === null) {
      if (shop.dailySpecial === undefined) return { changed: false }
      await closeDailySpecialStory(ctx, shop, Date.now())
      await ctx.db.patch(shop._id, { dailySpecial: undefined, dailySpecialRevision: (shop.dailySpecialRevision ?? 0) + 1 })
      return { changed: true }
    }
    if (args.offerRef.length > 200) return notFound()
    const offer = await resolveCatalogOffer(ctx, { root: ctx.rootNetwork, readerPersonId: ctx.person._id, network: ctx.network }, shop._id, args.offerRef)
    if (!offer || offer.kind !== "product") return notFound()
    const now = Date.now()
    const day = librevilleDay(now)
    if (shop.dailySpecial?.offerRef === args.offerRef && shop.dailySpecial.day === day) return { changed: false }
    await closeDailySpecialStory(ctx, shop, now)
    await ctx.db.patch(shop._id, { dailySpecial: { offerRef: args.offerRef, day }, dailySpecialRevision: (shop.dailySpecialRevision ?? 0) + 1 })
    return { changed: true }
  },
})

/** URL de dépôt du logo d'une boutique (temps 1 de la politique ; le temps 2 est à la pose). */
export const generateShopLogoUploadUrl = networkMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await enforceRateLimit(ctx, "upload.url", ctx.person._id)
    return await guardUploadUrl(ctx, "page_logo")
  },
})

/**
 * Poser, remplacer ou retirer (`null`) le logo d'une boutique que je gère —
 * dépôt NEUF du même gérant, admis à l'analyse ; l'ancien est purgé. Avec une
 * page, c'est le logo de la page. L'URL rendue est celle de la garde : `null`
 * avec la retenue tant que l'analyse n'a pas parlé.
 */
export const setShopLogo = networkMutation({
  args: { shopId: v.id("shops"), storageId: v.union(v.id("_storage"), v.null()), mimeType: v.optional(v.string()) },
  returns: v.object({ url: v.union(v.string(), v.null()), withheld: v.union(withheldCodeValidator, v.null()) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "shop.edit", ctx.person._id)
    const { shop, page } = await requireManagedShop(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.shopId)
    const current = page ? page.logoStorageId : shop.draftLogoStorageId
    if (args.storageId !== null && args.storageId === current) {
      const delivery = await resolveFileDelivery(ctx, args.storageId)
      return { url: delivery.url, withheld: withheldCodeOf(delivery.scan) }
    }
    if (args.storageId === null && current === undefined) return { url: null, withheld: null }
    if (args.storageId !== null) {
      await assertFreshUpload(ctx, ctx.person._id, args.storageId)
      await admitStoredUpload(
        ctx,
        { storageId: args.storageId, usage: "page_logo", ...(args.mimeType ? { mimeType: args.mimeType } : {}) },
        { source: "page", networkId: ctx.networkId, uploadedByPersonId: ctx.person._id },
      )
    }
    const now = Date.now()
    if (page) {
      await setShopPageLogo(ctx, page, ctx.person._id, args.storageId)
      await ctx.db.patch(shop._id, { updatedAt: now })
    } else {
      await ctx.db.patch(shop._id, { draftLogoStorageId: args.storageId ?? undefined, updatedAt: now })
      if (current !== undefined) await purgePageImage(ctx, current)
    }
    if (args.storageId === null) return { url: null, withheld: null }
    const delivery = await resolveFileDelivery(ctx, args.storageId)
    return { url: delivery.url, withheld: withheldCodeOf(delivery.scan) }
  },
})

/**
 * Défaire une boutique que je gère, jamais en file, publiée ou suspendue : le
 * brouillon sans page est supprimé avec son logo ; une page qui la portait
 * demeure (c'est une page sociale), seule la capacité de boutique disparaît.
 */
export const discardShop = networkMutation({
  args: { shopId: v.id("shops") },
  returns: v.object({ discarded: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "shop.edit", ctx.person._id)
    const { shop, page } = await requireManagedShop(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.shopId)
    if (!STOREFRONT_DISCARDABLE.includes(shop.storefront)) return failAppRule("shop_state_invalid", {}, "conflict")
    await revokeShopCommerceLink(ctx, ctx.networkId, shop._id)
    await ctx.db.delete(shop._id)
    if (!page && shop.draftLogoStorageId !== undefined) await purgePageImage(ctx, shop.draftLogoStorageId)
    // CM-09 : les favoris qui désignaient ses offres partent avec elle, par lots bornés.
    await purgeSavedOffersForShop(ctx, shop._id)
    return { discarded: true as const }
  },
})

// ═══════════════════════════════════════════════════════════════
// Publier la vitrine
// ═══════════════════════════════════════════════════════════════

/**
 * DEMANDER la publication de la vitrine. La politique du réseau décide :
 * fermée → refus explicite (`shop_publication_closed`, rien n'est mis en file) ;
 * `review` → file d'admission des opérateurs ; `auto_verified` → admise
 * d'office pour une adhésion VÉRIFIÉE (relue maintenant), en file sinon.
 */
export const requestStorefrontPublication = networkMutation({
  args: { shopId: v.id("shops") },
  returns: v.object({ storefront: storefrontStateValidator }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "shop.publish", ctx.person._id)
    const { shop, page } = await requireManagedShop(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.shopId)
    if (shop.storefront === "suspended") return failAppRule("shop_suspended", {}, "policyRefused")
    if (!STOREFRONT_REQUESTABLE.includes(shop.storefront)) return failAppRule("shop_state_invalid", {}, "conflict")
    if (presentationGaps(shopIdentityOf(shop, page)).length > 0) return failAppRule("shop_presentation_incomplete", {}, "invalidArgument")
    // CM-02 : une catégorie réglementée met la demande en file, quelle que soit la politique ouverte.
    const { outcome } = await storefrontPublicationOutcome(ctx, shop, ctx.person._id)
    if (outcome === "closed") return failAppRule("shop_publication_closed", {}, "policyRefused")
    const now = Date.now()
    if (outcome === "queue") {
      await ctx.db.patch(shop._id, { storefront: "pending_review", requestedAt: now, decisionReason: undefined, updatedAt: now })
      return { storefront: "pending_review" as const }
    }
    await admitStorefront(ctx, { ...shop, requestedAt: now }, now)
    return { storefront: "published" as const }
  },
})

/** Annuler ma demande en file : la boutique redevient un brouillon. */
export const cancelPublicationRequest = networkMutation({
  args: { shopId: v.id("shops") },
  returns: v.object({ storefront: storefrontStateValidator }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "shop.publish", ctx.person._id)
    const { shop } = await requireManagedShop(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.shopId)
    if (shop.storefront !== "pending_review") return failAppRule("shop_state_invalid", {}, "conflict")
    await ctx.db.patch(shop._id, { storefront: "draft", requestedAt: undefined, updatedAt: Date.now() })
    return { storefront: "draft" as const }
  },
})

/** RETIRER la vitrine publiée : elle quitte aussitôt l'annuaire, la vitrine membre et la vitrine publique. */
export const withdrawStorefront = networkMutation({
  args: { shopId: v.id("shops") },
  returns: v.object({ storefront: storefrontStateValidator }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "shop.publish", ctx.person._id)
    const { shop } = await requireManagedShop(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.shopId)
    if (shop.storefront !== "published") return failAppRule("shop_state_invalid", {}, "conflict")
    await ctx.db.patch(shop._id, { storefront: "withdrawn", updatedAt: Date.now() })
    return { storefront: "withdrawn" as const }
  },
})

/**
 * FERMER TEMPORAIREMENT la vitrine publiée jusqu'au jour de réouverture choisi (CM-10, plan 08) : elle reste lisible
 * (annuaire, marketplace, favoris, vitrine publique), les NOUVEAUX engagements sont refusés (`shopPause.ts`), ceux
 * déjà en cours suivent leur cours. Mêmes personnes et même seau de débit que pour retirer la vitrine. Le jour est un
 * jour civil de Libreville, de demain à `SHOP_PAUSE_MAX_DAYS` jours ; un autre jour remplace le précédent, le même
 * n'écrit rien. La boutique rouvre seule à minuit, heure de Libreville, au début de ce jour : rien n'est planifié.
 * Aucun motif libre : la phrase affichée est fixe, il n'y a pas de texte à modérer.
 */
export const pauseStorefront = networkMutation({
  args: { shopId: v.id("shops"), reopenDay: v.string() },
  returns: v.object({ pausedUntil: v.number() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "shop.publish", ctx.person._id)
    const { shop } = await requireManagedShop(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.shopId)
    if (shop.storefront !== "published") return failAppRule("shop_state_invalid", {}, "conflict")
    const now = Date.now()
    const day = checkShopPauseDay(args.reopenDay, now)
    if (!day.ok) {
      if (day.reason === "past") return failRule("SHOP_PAUSE_END_PAST")
      if (day.reason === "too_long") return failRule("SHOP_PAUSE_TOO_LONG", { days: SHOP_PAUSE_MAX_DAYS })
      return fail("invalidArgument", { field: "reopenDay" })
    }
    if (shop.pausedUntil !== day.pausedUntil) await ctx.db.patch(shop._id, { pausedUntil: day.pausedUntil, updatedAt: now })
    return { pausedUntil: day.pausedUntil }
  },
})

/**
 * ROUVRIR MAINTENANT, avant l'échéance (CM-10) : les nouveaux engagements sont de nouveau admis. Possible dans tout
 * état de la vitrine (lever une pause ne fait rien courir) ; une échéance passée est simplement effacée.
 */
export const resumeStorefront = networkMutation({
  args: { shopId: v.id("shops") },
  returns: v.object({ resumed: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "shop.publish", ctx.person._id)
    const { shop } = await requireManagedShop(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.shopId)
    if (shop.pausedUntil === undefined) return { resumed: false }
    const now = Date.now()
    const resumed = isShopPaused(shop.pausedUntil, now)
    await ctx.db.patch(shop._id, { pausedUntil: undefined, ...(resumed ? { updatedAt: now } : {}) })
    return { resumed }
  },
})

/**
 * La DIFFUSION de la vitrine. `publicListing` : consentement HORODATÉ à la
 * lecture sans compte (le geste porte la version du texte lu ; une version
 * périmée est refusée), révocable à tout instant. `visibility` : hors de la
 * racine, la règle `root` (lue aussi depuis la racine) est un geste explicite ;
 * sans objet dans la racine.
 */
export const setStorefrontAudience = networkMutation({
  args: { shopId: v.id("shops"), publicListing: v.boolean(), textVersion: v.optional(v.string()), visibility: v.optional(contentVisibilityValidator) },
  returns: v.object({ publicListing: v.boolean(), visibility: contentVisibilityValidator }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "shop.publish", ctx.person._id)
    const { shop } = await requireManagedShop(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.shopId)
    const now = Date.now()
    const patch: Partial<Doc<"shops">> = {}
    if (args.visibility !== undefined && ctx.network.kind !== "root" && args.visibility !== shop.visibility) patch.visibility = args.visibility
    const consenting = hasPublicConsent(shop)
    if (args.publicListing && !consenting) {
      if (args.textVersion !== SHOP_PUBLIC_LISTING_TEXT_VERSION) return failAppRule("shop_consent_outdated", {}, "consentRequired")
      patch.publicConsentAt = now
      patch.publicConsentTextVersion = SHOP_PUBLIC_LISTING_TEXT_VERSION
      patch.publicConsentByPersonId = ctx.person._id
      patch.publicConsentRevokedAt = undefined
    } else if (!args.publicListing && shop.publicConsentAt !== undefined && shop.publicConsentRevokedAt === undefined) {
      // Retirer une diffusion reste possible même quand son ancien texte de
      // consentement n'est plus la version admise à la lecture publique.
      patch.publicConsentRevokedAt = now
    }
    if (Object.keys(patch).length > 0) await ctx.db.patch(shop._id, { ...patch, updatedAt: now })
    return { publicListing: args.publicListing, visibility: patch.visibility ?? shop.visibility }
  },
})
