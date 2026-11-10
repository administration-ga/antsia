import { browserAppPath } from "./app-path"
import { conversationHref } from "@antsia/social-features/features/messagerie/messagerie-routes"
import { contextualConversationKey } from "@antsia/social-features/features/messagerie/messagerie-dock"
import type { EngineRoutes } from "@antsia/api/network"
import type { UsageScreen } from "@antsia/social-features/shell/analytics"
import type { ReseauDestinationMatch } from "@antsia/social-features/shell/reseau-menu-destinations"

import { parsePublicPostContinuation, PUBLIC_POST_CONTINUATION_PARAM } from "./public-post-continuation"
import { NOTIFICATION_REFERENCE_PARAM, parseNotificationReference } from "./notification-open"
import { appendShopContact, parseShopContactContinuation, type ShopContactContinuation } from "./shop-contact-continuation"
import type { CatalogFilters } from "./catalog-search"
import { marketplaceSearch, marketplaceSearchParams, type MarketplaceSearch } from "./marketplace-search"
import { DEFAULT_FOOD_UNIVERSE_SEARCH, foodUniverseSearchParams, type FoodUniverseSearch } from "./food-universe-search"
import { professionalSearchParams } from "./professional-form"
import type { ProfessionalSearchFilters } from "@antsia/social-domain/professionals"
import { parseSpecializedDestination, type SpecializedDestination } from "./specialized-navigation"
import { commerceBusinessRefFromRef, parseCommerceRef } from "@antsia/social-domain/commerce/primitives"
import type { CommerceMerchantTarget } from "@antsia/social-domain/commerce-merchant"
import type { CommercePaymentPreparationTarget } from "@antsia/social-domain/commerce-payment-preparation"

/** Navigation de gestion seulement : le port signé admet les cibles et PRO relit ses droits. */
export function proMerchantTargetHref(origin: string, shopRef: string, target: CommerceMerchantTarget): string | null {
  const paths: Record<CommerceMerchantTarget, string> = { catalog: "catalogue", new_offer: "catalogue/nouvelle", quotes: "devis", agenda: "agenda", agenda_services: "agenda/prestations", agenda_resources: "agenda/ressources" }
  if (!Object.prototype.hasOwnProperty.call(paths, target)) return null
  return proManagementHref(origin, shopRef, paths[target])
}

/** Une seule destination financière : PRO contrôle l'accès et chaque accord sur place. */
export function proFinancialPreparationHref(origin: string, shopRef: string, target: CommercePaymentPreparationTarget): string | null {
  return target === "payments" ? proManagementHref(origin, shopRef, "paiements") : null
}

function proManagementHref(origin: string, shopRef: string, path: string): string | null {
  if (parseCommerceRef(shopRef)?.kind !== "structure") return null
  try {
    if (origin.trim() !== origin) return null
    const base = new URL(origin)
    const local = process.env.NODE_ENV !== "production" && base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
    if (base.protocol !== "https:" && !local || base.username || base.password || base.pathname !== "/" || base.search || base.hash) return null
    const businessRef = commerceBusinessRefFromRef(shopRef)
    return businessRef ? new URL(`/structure/${encodeURIComponent(businessRef)}/${path}`, base.origin).href : null
  } catch { return null }
}

function appendSpecializedDestination(query: URLSearchParams, input: unknown): void {
  const value = parseSpecializedDestination(input)
  if (!value) return
  query.set("espaceType", value.kind)
  if ("handle" in value) query.set("espaceBoutique", value.handle)
  if (value.kind === "article") query.set("espaceArticle", value.articleKey)
  if (value.kind === "service_offer") query.set("espaceOffre", value.offerRef)
  if (value.kind === "offer") {
    query.set("espaceOffre", value.offerRef)
    if (value.variantRef) query.set("espaceVariante", value.variantRef)
    if (value.quantity !== undefined) query.set("espaceQuantite", String(value.quantity))
  }
}

export function specializedDestinationFromSearch(search: Record<string, string | string[] | undefined>): SpecializedDestination | undefined {
  return parseSpecializedDestination({ kind: search.espaceType, ...(search.espaceBoutique === undefined ? {} : { handle: search.espaceBoutique }), ...(search.espaceArticle === undefined ? {} : { articleKey: search.espaceArticle }), ...(search.espaceOffre === undefined ? {} : { offerRef: search.espaceOffre }), ...(search.espaceVariante === undefined ? {} : { variantRef: search.espaceVariante }), ...(search.espaceQuantite === undefined ? {} : { quantity: typeof search.espaceQuantite === "string" && /^[1-9][0-9]{0,2}$/u.test(search.espaceQuantite) ? Number(search.espaceQuantite) : null }) })
}

type OfferSelection = { variantRef?: string; quantity?: number }
function offerSelectionQuery(handle: string, offerRef: string, selection: OfferSelection = {}): string {
  const value = parseSpecializedDestination({ kind: "offer", handle, offerRef, ...selection })
  const query = new URLSearchParams()
  if (value?.kind === "offer") {
    if (value.variantRef) query.set("variante", value.variantRef)
    if (value.quantity !== undefined) query.set("quantite", String(value.quantity))
  }
  return query.size ? `?${query}` : ""
}

export function offerSelectionFromSearch(handle: string, offerRef: string, search: Record<string, string | string[] | undefined>): OfferSelection | undefined {
  if (Object.keys(search).some(key => !["variante", "quantite"].includes(key))) return undefined
  const value = specializedDestinationFromSearch({ espaceType: "offer", espaceBoutique: handle, espaceOffre: offerRef, ...(search.variante === undefined ? {} : { espaceVariante: search.variante }), ...(search.quantite === undefined ? {} : { espaceQuantite: search.quantite }) })
  return value?.kind === "offer" ? { ...(value.variantRef === undefined ? {} : { variantRef: value.variantRef }), ...(value.quantity === undefined ? {} : { quantity: value.quantity }) } : undefined
}

function catalogQuery(filters: CatalogFilters, cursor?: string | null): string {
  const query = new URLSearchParams()
  if (filters.kind) query.set("type", filters.kind)
  if (filters.collectionRef) query.set("collection", filters.collectionRef)
  if (filters.query) query.set("recherche", filters.query)
  const facets = { category: "categorie", brand: "marque", material: "matiere", color: "couleur", audience: "public", serviceMode: "mode", commercialMode: "modeCommercial", languageCode: "langue", serviceZone: "zone" } as const
  for (const key of ["category", "brand", "material", "color", "audience", "serviceMode", "commercialMode", "languageCode", "serviceZone"] as const) for (const value of [...(filters[key] ?? [])].sort()) query.append(facets[key], value)
  if (filters.minPrice !== undefined) query.set("prixMin", String(filters.minPrice))
  if (filters.maxPrice !== undefined) query.set("prixMax", String(filters.maxPrice))
  if (filters.minDurationMinutes !== undefined) query.set("dureeMin", String(filters.minDurationMinutes))
  if (filters.maxDurationMinutes !== undefined) query.set("dureeMax", String(filters.maxDurationMinutes))
  if (filters.sort) query.set("tri", filters.sort)
  if (cursor) query.set("curseur", cursor)
  return query.size ? `?${query}` : ""
}

/** Le segment de la route « nouveau statut » (lu aussi par la page des statuts). */
export const STORIES_NEW_SEGMENT = "nouvelle"

/** P14B : l'ancre de la section des décisions d'UNE page dans « Mes données » (lue aussi par cette section). */
export function pageDecisionsAnchor(pageId: string): string {
  return `decisions-page-${encodeURIComponent(pageId)}`
}

/** SU01d : l'ancre de « Mes signalements » dans « Mes données » (lue aussi par cette section). */
export const PERSONAL_REPORTS_ANCHOR = "mes-signalements"

/**
 * Table des routes d'antsia.ga — le SEUL fichier de l'application où une URL
 * s'écrit (cliquet `no-hardcoded-urls`). Les paquets du moteur ne connaissent
 * aucune URL : l'application leur passe `engineRoutes` (`NetworkProvider`).
 */
export const routes = {
  home: () => "/",
  demo: () => "/demo",
  signIn: (intent?: "sign-up", postId?: string, notificationReference?: string, shopContact?: ShopContactContinuation, specialized?: SpecializedDestination) => {
    const query = new URLSearchParams()
    if (intent === "sign-up") query.set("inscription", "1")
    const continuation = parsePublicPostContinuation(postId)
    if (continuation) query.set(PUBLIC_POST_CONTINUATION_PARAM, continuation)
    else {
      const notification = parseNotificationReference(notificationReference)
      if (notification) query.set(NOTIFICATION_REFERENCE_PARAM, notification)
      else {
        appendShopContact(query, shopContact)
        if (!parseShopContactContinuation(shopContact)) appendSpecializedDestination(query, specialized)
      }
    }
    return query.size > 0 ? `/entrer?${query}` : "/entrer"
  },
  signedOut: (incomplete: boolean) => incomplete ? "/entrer?deconnexion=incomplete" : "/entrer",
  application: (origin: string) => new URL("/", origin).href,
  welcome: (postId?: string, notificationReference?: string, shopContact?: ShopContactContinuation, specialized?: SpecializedDestination) => {
    const continuation = parsePublicPostContinuation(postId)
    if (continuation) return `/bienvenue?${new URLSearchParams({ [PUBLIC_POST_CONTINUATION_PARAM]: continuation })}`
    const notification = parseNotificationReference(notificationReference)
    if (notification) return `/bienvenue?${new URLSearchParams({ [NOTIFICATION_REFERENCE_PARAM]: notification })}`
    const query = new URLSearchParams()
    appendShopContact(query, shopContact)
    if (!parseShopContactContinuation(shopContact)) appendSpecializedDestination(query, specialized)
    return query.size ? `/bienvenue?${query}` : "/bienvenue"
  },
  feed: () => "/fil",
  feedPreferences: () => "/mon-fil",
  memberPost: (id: string) => `/fil?${new URLSearchParams({ post: id })}`,
  discover: () => "/decouvrir",
  /**
   * La destination « Découvrir » des MEMBRES — sous la coque persistante (un
   * appel en cours y survit). Distincte de la découverte PUBLIQUE ci-dessus
   * (`discover`), servie sans compte hors de la coque.
   */
  memberDiscover: () => "/explorer",
  /** L'accueil de la marketplace (boutiques en grandes cartes, moments qui défilent) : l'adresse sans paramètre. */
  marketplaceHome: () => "/marketplace",
  /** L'univers « Alimentation et restauration » (étude des sept univers, § 5.4 et § 12) : ses adresses et ce qu'on y commande. */
  foodUniverse: (search: Partial<FoodUniverseSearch> = {}) => {
    const query = foodUniverseSearchParams({ category: search.category ?? DEFAULT_FOOD_UNIVERSE_SEARCH.category, cursor: search.cursor ?? null })
    return query.size ? `/restauration?${query}` : "/restauration"
  },
  /** Les résultats de la marketplace : une vue (produits par défaut), une recherche, des filtres. */
  marketplace: (search: Partial<MarketplaceSearch> = {}) => {
    const query = marketplaceSearchParams({ ...search, view: search.view ?? "products", cursor: search.cursor ?? null })
    return query.size ? `/marketplace?${query}` : "/marketplace"
  },
  professionals: (filters: ProfessionalSearchFilters = {}, cursor: string | null = null) => {
    const query = professionalSearchParams(filters, cursor)
    return query.size ? `/professionnels?${query}` : "/professionnels"
  },
  professionalProfile: (handle: string) => `/professionnels/${encodeURIComponent(handle)}`,
  personalMeetings: () => "/rencontres",
  press: () => "/presse",
  mediaHome: () => "/mes-medias",
  mediaDesk: (pageId: string) => `/redaction/${encodeURIComponent(pageId)}`,
  mediaConfig: (pageId: string) => `/redaction/${encodeURIComponent(pageId)}/configuration`,
  mediaTeam: (pageId: string) => `/redaction/${encodeURIComponent(pageId)}/equipe`,
  articleEditor: (articleId: string) => `/redaction/articles/${encodeURIComponent(articleId)}`,
  memberMedia: (handle: string, section?: string, cursor?: string | null) => `/media/${encodeURIComponent(handle)}${mediaQuery(section, cursor)}`,
  memberArticle: (handle: string, articleKey: string) => `/media/${encodeURIComponent(handle)}/articles/${encodeURIComponent(articleKey)}`,
  publicMedia: (handle: string, section?: string, cursor?: string | null) => `/medias/${encodeURIComponent(handle)}${mediaQuery(section, cursor)}`,
  publicArticle: (handle: string, articleKey: string) => `/medias/${encodeURIComponent(handle)}/articles/${encodeURIComponent(articleKey)}`,

  professionalEditor: () => "/mon-profil-pro",
  professionalCollaborations: () => "/mes-collaborations",
  publicProfessional: (handle: string) => `/pros/${encodeURIComponent(handle)}`,
  publicProfile: (handle: string) => `/@${encodeURIComponent(handle)}`,
  officialPage: (handle: string) => `/pages/${encodeURIComponent(handle)}`,
  publication: (id: string) => `/publications/${encodeURIComponent(id)}`,
  tag: (tag: string) => `/tags/${encodeURIComponent(tag)}`,
  province: (slug: string) => `/provinces/${encodeURIComponent(slug)}`,
  nationalFeed: () => "/fil?portee=national",
  memberProvince: (slug: string) => `/fil?${new URLSearchParams({ portee: "province", province: slug })}`,
  memberTag: (tag: string) => `/fil?${new URLSearchParams({ portee: "national", tag })}`,
  memberFeedWindow: (filter: { province?: string; tag?: string }, cursor?: string) => {
    const query = new URLSearchParams({ portee: filter.province ? "province" : "national" })
    if (filter.province) query.set("province", filter.province)
    if (filter.tag) query.set("tag", filter.tag)
    if (cursor) query.set("curseur", cursor)
    return `/fil?${query}`
  },
  groups: () => "/groupes",
  events: () => "/evenements",
  memberTab: (tab: "groupes" | "evenements") => `/fil?${new URLSearchParams({ tab })}`,
  direct: (id: string) => `/direct/${encodeURIComponent(id)}`,
  publicAlbum: (handle: string, albumId: string) => `/@${encodeURIComponent(handle)}/albums/${encodeURIComponent(albumId)}`,
  about: () => "/a-propos",
  legal: () => "/mentions-legales",
  privacy: () => "/confidentialite",
  transparency: () => "/transparence",
  moderation: () => "/moderation",
  moderationView: (view: "reports" | "pending" | "appeals" | "settings", team?: string, cursor?: string) => {
    const query = new URLSearchParams({ vue: view })
    if (team && view !== "appeals" && view !== "settings") query.set("equipe", team)
    if (cursor) query.set("curseur", cursor)
    return `/moderation?${query}`
  },
  settings: () => "/parametres",
  dataSettings: () => "/parametres/donnees",
  authSession: () => "/api/auth/get-session",
  authBase: () => "/api/auth",
  authToken: () => "/api/auth/convex/token",
  publicSessionBridge: () => "/api/session-bridge",
  apdpvp: () => "https://www.apdpvp.ga/textes-et-decisions/",
  officialJournal: () => "https://journal-officiel.ga/20085-025-2023-/",
  gdpr: () => "https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=fr",
  /** iCom en pages (téléphone, liens directs) : la messagerie et ses sous-adresses. */
  messages: () => "/messages",
  professionalConversation: (threadId: string) => /^[A-Za-z0-9_-]{1,128}$/u.test(threadId) ? conversationHref(contextualConversationKey(threadId), routes.messages()) : null,
  commercialConversation: (threadId: string) => `/messages/commerce/${encodeURIComponent(threadId)}`,
  /** Statuts (stories) en plein écran. */
  stories: () => "/actus",
  /** Le composeur de statut, ouvert sur le lecteur. */
  storiesNew: () => `/actus/${STORIES_NEW_SEGMENT}`,
  profile: (handle: string) => `/profil/${encodeURIComponent(handle)}`,
  /** La destination « Profil » des membres : mon espace (profil, préférences, réglages, sortie). */
  me: () => "/moi",
  page: (handle: string) => `/page/${encodeURIComponent(handle)}`,
  myShops: () => "/mes-boutiques",
  myOrders: () => "/mes-commandes",
  cart: () => "/panier",
  purchases: () => "/mes-achats",
  purchase: (purchaseId: string) => `/mes-achats/${encodeURIComponent(purchaseId)}`,
  /** CM-09 : mes offres enregistrées (privées), rangées sous Profil. */
  savedOffers: () => "/mes-favoris",
  checkoutPrepare: (handle: string, offerRef: string) => `/boutique/${encodeURIComponent(handle)}/preparer/${encodeURIComponent(offerRef)}`,
  checkoutAttempt: (attemptId: string) => `/mes-commandes/${encodeURIComponent(attemptId)}`,
  paymentList: () => "/mes-paiements",
  paymentAttempt: (paymentAttemptId: string) => `/mes-paiements/${encodeURIComponent(paymentAttemptId)}`,
  paymentReturn: (paymentAttemptId: string) => `/mes-paiements/${encodeURIComponent(paymentAttemptId)}/retour`,
  shopDirectory: () => "/explorer#boutiques",
  clips: (handle?: string) => handle ? `/clips?${new URLSearchParams({ auteur: handle })}` : "/clips",
  mediaWindow: (input: { mode: "explore" | "clips"; cursor?: string; handle?: string; query?: string }) => {
    const search = new URLSearchParams()
    if (input.cursor) search.set("curseur", input.cursor)
    if (input.handle) search.set("auteur", input.handle)
    if (input.query) search.set("q", input.query)
    const base = input.mode === "clips" ? "/clips" : "/explorer"
    return search.size ? `${base}?${search}` : base
  },
  shopLinkCallback: () => "/mes-boutiques/liaison/retour",
  shopEditor: (id: string) => `/mes-boutiques/${encodeURIComponent(id)}`,
  storefront: (handle: string) => `/boutique/${encodeURIComponent(handle)}`,
  shopContact: (handle: string, offerRef?: string) => `/boutique/${encodeURIComponent(handle)}/contacter${offerRef ? `?${new URLSearchParams({ offre: offerRef })}` : ""}`,
  publicStorefront: (handle: string) => `/boutiques/${encodeURIComponent(handle)}`,
  shopCatalog: (handle: string, filters: CatalogFilters = {}, cursor?: string | null) => `/boutique/${encodeURIComponent(handle)}/catalogue${catalogQuery(filters, cursor)}`,
  publicShopCatalog: (handle: string, filters: CatalogFilters = {}, cursor?: string | null) => `/boutiques/${encodeURIComponent(handle)}/catalogue${catalogQuery(filters, cursor)}`,
  shopOffer: (handle: string, offerRef: string, selection?: OfferSelection) => `/boutique/${encodeURIComponent(handle)}/offres/${encodeURIComponent(offerRef)}${offerSelectionQuery(handle, offerRef, selection)}`,
  publicShopOffer: (handle: string, offerRef: string, selection?: OfferSelection) => `/boutiques/${encodeURIComponent(handle)}/offres/${encodeURIComponent(offerRef)}${offerSelectionQuery(handle, offerRef, selection)}`,
  provider: (handle: string) => `/prestataire/${encodeURIComponent(handle)}`,
  publicProvider: (handle: string) => `/prestataires/${encodeURIComponent(handle)}`,
  providerCatalog: (handle: string, filters: CatalogFilters = {}, cursor?: string | null) => `/prestataire/${encodeURIComponent(handle)}/prestations${catalogQuery({ ...filters, kind: "service" }, cursor)}`,
  publicProviderCatalog: (handle: string, filters: CatalogFilters = {}, cursor?: string | null) => `/prestataires/${encodeURIComponent(handle)}/prestations${catalogQuery({ ...filters, kind: "service" }, cursor)}`,
  providerOffer: (handle: string, offerRef: string) => `/prestataire/${encodeURIComponent(handle)}/offres/${encodeURIComponent(offerRef)}`,
  publicProviderOffer: (handle: string, offerRef: string) => `/prestataires/${encodeURIComponent(handle)}/offres/${encodeURIComponent(offerRef)}`,
  /** P15 : offres d'emploi (Découvrir, vitrine membre, fiche, SSR public) et Mes candidatures (Profil). */
  jobDirectory: () => "/explorer#emplois",
  shopJobs: (handle: string) => `/boutique/${encodeURIComponent(handle)}/emplois`,
  shopJob: (handle: string, jobRef: string) => `/boutique/${encodeURIComponent(handle)}/emplois/${encodeURIComponent(jobRef)}`,
  publicShopJob: (handle: string, jobRef: string) => `/boutiques/${encodeURIComponent(handle)}/emplois/${encodeURIComponent(jobRef)}`,
  myApplications: () => "/mes-candidatures",
  /** P14B : la fiche d'UNE candidature (ouverture ciblée d'un avis), relue par le serveur. */
  jobApplication: (applicationId: string) => `/mes-candidatures/${encodeURIComponent(applicationId)}`,
  /** P14 : devis, rendez-vous et prestations (membre seulement), « Mes demandes » (Profil) et rubrique Services de Découvrir. */
  serviceQuote: (handle: string, offerRef: string) => `/boutique/${encodeURIComponent(handle)}/devis/${encodeURIComponent(offerRef)}`,
  serviceBooking: (handle: string, offerRef: string) => `/boutique/${encodeURIComponent(handle)}/rendez-vous/${encodeURIComponent(offerRef)}`,
  serviceOrder: (handle: string, offerRef: string) => `/boutique/${encodeURIComponent(handle)}/prestation/${encodeURIComponent(offerRef)}`,
  serviceRequests: () => "/mes-demandes",
  serviceRequest: (requestRowId: string) => `/mes-demandes/${encodeURIComponent(requestRowId)}`,
  serviceDirectory: () => "/explorer#services",
  conference: (sessionId: string) => `/conference/${encodeURIComponent(sessionId)}`,
  personalControls: () => "/mes-donnees",
  /** P14B : les décisions de modération visant une page représentée, section de « Mes données ». */
  pageModerationDecisions: (pageId: string) => `/mes-donnees#${pageDecisionsAnchor(pageId)}`,
  /** SU01d : « Mes signalements », section de « Mes données » (accusé de réception, décision). */
  personalReports: () => `/mes-donnees#${PERSONAL_REPORTS_ANCHOR}`,
  notificationCenter: () => "/fil?notifications=1",
  openNotification: (reference?: string) => {
    const notification = parseNotificationReference(reference)
    return notification ? `/notifications/ouvrir?${new URLSearchParams({ [NOTIFICATION_REFERENCE_PARAM]: notification })}` : "/notifications/ouvrir"
  },
  pushWorker: () => "/notifications-worker",
  health: () => "/sante-fonctionnelle",
  healthApi: () => "/api/sante-fonctionnelle",
} as const

function mediaQuery(section?: string, cursor?: string | null): string {
  const query = new URLSearchParams()
  if (section) query.set("rubrique", section)
  if (cursor) query.set("curseur", cursor)
  return query.size ? `?${query}` : ""
}

/** Routes éditoriales existantes seulement ; aucun chemin externe. */
export function specializedEditorialRoute(pathname: string): boolean {
  if (pathname === routes.press() || pathname === routes.mediaHome() || /^\/redaction\/(?:articles\/[A-Za-z0-9_-]{1,128}|[A-Za-z0-9_-]{1,128}(?:\/(?:configuration|equipe))?)$/u.test(pathname)) return true
  const match = /^\/media\/([^/]+)(?:\/articles\/([^/]+))?$/u.exec(pathname)
  if (!match?.[1]) return false
  try {
    const handle = decodeURIComponent(match[1]), articleKey = match[2] ? decodeURIComponent(match[2]) : undefined
    const value = parseSpecializedDestination({ kind: articleKey ? "article" : "media", handle, ...(articleKey ? { articleKey } : {}) })
    return !!value && (articleKey ? routes.memberArticle(handle, articleKey) : routes.memberMedia(handle)) === pathname
  } catch { return false }
}

/** MP01 : destinations fermées, sans URL arbitraire ni reprise d'un acte d'achat. */
export function specializedDestinationPath(input: unknown): string | undefined {
  const value = parseSpecializedDestination(input)
  if (value?.kind === "professionals") return routes.professionals()
  if (value?.kind === "professional_editor") return routes.professionalEditor()
  if (value?.kind === "professional_collaborations") return routes.professionalCollaborations()
  if (value?.kind === "media") return routes.memberMedia(value.handle)
  if (value?.kind === "article") return routes.memberArticle(value.handle, value.articleKey)
  if (value?.kind === "professional") return routes.professionalProfile(value.handle)
  if (!value || !("handle" in value)) return undefined
  if (value?.kind === "provider") return routes.provider(value.handle)
  if (value?.kind === "provider_catalog") return routes.providerCatalog(value.handle)
  if (value?.kind === "service_offer") return routes.providerOffer(value.handle, value.offerRef)
  return value?.kind === "offer" ? routes.shopOffer(value.handle, value.offerRef, { ...(value.variantRef ? { variantRef: value.variantRef } : {}), ...(value.quantity === undefined ? {} : { quantity: value.quantity }) }) : value?.kind === "catalog" ? routes.shopCatalog(value.handle) : value ? routes.storefront(value.handle) : undefined
}

export type SpecializedShopRoute = { handle: string; section: "home" | "catalog" | "offer" | "service" | "checkout" | "jobs" | "contact"; provider?: true }

export function specializedProfessionalRoute(pathname: string): "directory" | "profile" | "editor" | "collaborations" | null {
  if (pathname === routes.professionals()) return "directory"
  if (pathname === routes.professionalEditor()) return "editor"
  if (pathname === routes.professionalCollaborations()) return "collaborations"
  const match = /^\/professionnels\/([^/]+)$/u.exec(pathname)
  if (!match?.[1]) return null
  try {
    const handle = decodeURIComponent(match[1])
    return parseSpecializedDestination({ kind: "professional", handle }) && routes.professionalProfile(handle) === pathname ? "profile" : null
  } catch { return null }
}

export function isSpecializedMemberPath(pathname: string): boolean {
  return specializedShopRoute(pathname) !== null || specializedProfessionalRoute(pathname) !== null || specializedEditorialRoute(pathname)
}

/** Seules les routes commerciales existantes changent de coque ; la gestion reste sociale. */
export function specializedShopRoute(pathname: string): SpecializedShopRoute | null {
  const provider = /^\/prestataire\/([^/]+)(?:\/(prestations|offres)(?:\/([^/]+))?)?$/u.exec(pathname)
  if (provider) {
    try {
      const handle = decodeURIComponent(provider[1]!)
      if (!parseSpecializedDestination({ kind: "provider", handle }) || encodeURIComponent(handle) !== provider[1]) return null
      if (provider[2] === "prestations" && provider[3] || provider[2] === "offres" && !provider[3]) return null
      if (provider[3] && !parseSpecializedDestination({ kind: "service_offer", handle, offerRef: decodeURIComponent(provider[3]) })) return null
      return { handle, provider: true, section: provider[2] === "offres" ? "offer" : provider[2] === "prestations" ? "catalog" : "home" }
    } catch { return null }
  }
  const match = /^\/boutique\/([^/]+)(?:\/(catalogue|offres|devis|rendez-vous|prestation|preparer|emplois|contacter)(?:\/([^/]+))?)?$/u.exec(pathname)
  if (!match) return null
  try {
    const handle = decodeURIComponent(match[1]!)
    if (!parseSpecializedDestination({ kind: "storefront", handle }) || encodeURIComponent(handle) !== match[1]) return null
    const part = match[2]
    const detail = match[3]
    if ((!part || part === "catalogue" || part === "contacter") && detail) return null
    if (part && !["catalogue", "contacter", "emplois"].includes(part) && !detail) return null
    if (detail && (detail.length > 512 || [".", ".."].includes(decodeURIComponent(detail)) || /[\u0000-\u0020\u007f/\\]/u.test(decodeURIComponent(detail)))) return null
    return { handle, section: !part ? "home" : part === "catalogue" ? "catalog" : part === "offres" ? "offer" : part === "preparer" ? "checkout" : part === "emplois" ? "jobs" : part === "contacter" ? "contact" : "service" }
  } catch { return null }
}

export function specializedDestinationFromLocation(pathname: string, search = ""): SpecializedDestination | undefined {
  const media = /^\/media\/([^/]+)(?:\/articles\/([^/]+))?$/u.exec(pathname)
  if (media) { try { return parseSpecializedDestination({ kind: media[2] ? "article" : "media", handle: decodeURIComponent(media[1]!), ...(media[2] ? { articleKey: decodeURIComponent(media[2]) } : {}) }) } catch { return undefined } }
  const professional = specializedProfessionalRoute(pathname)
  if (professional === "directory") return { kind: "professionals" }
  if (professional === "editor") return { kind: "professional_editor" }
  if (professional === "collaborations") return { kind: "professional_collaborations" }
  if (professional === "profile") {
    try { return parseSpecializedDestination({ kind: "professional", handle: decodeURIComponent(pathname.split("/")[2]!) }) } catch { return undefined }
  }
  const space = specializedShopRoute(pathname)
  if (!space) return undefined
  if (space.provider) {
    if (space.section === "home") return { kind: "provider", handle: space.handle }
    if (space.section === "catalog") return { kind: "provider_catalog", handle: space.handle }
    try { return parseSpecializedDestination({ kind: "service_offer", handle: space.handle, offerRef: decodeURIComponent(pathname.split("/")[4]!) }) } catch { return undefined }
  }
  if (space.section === "home") return { kind: "storefront", handle: space.handle }
  if (space.section === "catalog") return { kind: "catalog", handle: space.handle }
  if (space.section === "offer") {
    try {
      const offerRef = decodeURIComponent(pathname.split("/")[4]!)
      const query = new URLSearchParams(search)
      const values: Record<string, string | string[]> = {}
      for (const key of new Set(query.keys())) { const entries = query.getAll(key); values[key] = entries.length === 1 ? entries[0]! : entries }
      const selection = offerSelectionFromSearch(space.handle, offerRef, values)
      return selection ? parseSpecializedDestination({ kind: "offer", handle: space.handle, offerRef, ...selection }) : undefined
    } catch { return undefined }
  }
  // Les devis, préparations et contacts ne sont jamais rejoués après connexion.
  return { kind: "storefront", handle: space.handle }
}

/** Origines sociales seulement : aucune préférence privée ni adresse hors de l'application. */
export function isSocialReturnPath(href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//") || href.length > 4096 || /[\u0000-\u0020\u007f\\]/u.test(href)) return false
  try {
    if (/[\u0000-\u001f\u007f\\]/u.test(decodeURIComponent(href))) return false
    const url = new URL(href, "https://antsia.invalid")
    if (url.origin !== "https://antsia.invalid" || `${url.pathname}${url.search}${url.hash}` !== href) return false
    const { pathname } = url
    if (pathname === routes.marketplace().split("?")[0]) {
      const params: Record<string, string | string[]> = {}
      for (const key of new Set(url.searchParams.keys())) {
        const values = url.searchParams.getAll(key)
        params[key] = values.length === 1 ? values[0]! : values
      }
      return url.hash.length <= 160 && marketplaceSearch(params) !== null
    }
    const ordinary = [routes.feed(), routes.memberDiscover(), routes.clips(), routes.stories()].includes(pathname)
    const profile = /^\/(profil|page)\/([^/]+)$/u.exec(pathname)
    if (!ordinary && !(profile && parseSpecializedDestination({ kind: "storefront", handle: decodeURIComponent(profile[2]!) }))) return false
    const allowed = pathname === routes.feed() ? ["post", "portee", "province", "tag", "tab", "curseur", "notifications"] : pathname === routes.memberDiscover() || pathname === routes.clips() ? ["q", "auteur", "curseur"] : []
    if (url.hash.length > 160) return false
    for (const [key, value] of url.searchParams) if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1 || value.length > 1024) return false
    return true
  } catch { return false }
}

/** L'entrée membre préserve seulement cette intention, jamais l'adresse complète. */
export function shopContactFromLocation(pathname: string, search: string): ShopContactContinuation | undefined {
  const match = /^\/boutique\/([^/]+)\/contacter$/u.exec(pathname)
  if (!match) return undefined
  try {
    const handle = decodeURIComponent(match[1]!)
    const offers = new URLSearchParams(search).getAll("offre")
    if (offers.length > 1) return undefined
    const contact = parseShopContactContinuation({ kind: "shop_contact", handle, ...(offers[0] === undefined ? {} : { offerRef: offers[0] }) })
    return contact && pathname === routes.shopContact(contact.handle) ? contact : undefined
  } catch { return undefined }
}

/** Les adresses que les surfaces du moteur lisent par `useRoutes()`. */
export const engineRoutes: EngineRoutes = {
  sharePath: browserAppPath,
  home: routes.feed,
  post: routes.memberPost,
  messages: routes.messages,
  commercialConversation: routes.commercialConversation,
  stories: routes.stories,
  profile: routes.profile,
  page: routes.page,
  conference: routes.conference,
  // `/direct/…` sert la même page que la conférence : le moteur doit la reconnaître (carte flottante).
  conferenceAliases: (sessionId) => [routes.direct(sessionId)],
  // Les paramètres de l'application (affichage, thème, langue et fuseau) : entrée du rail et du Profil.
  settings: routes.settings,
  // Navigation par destinations (P02) : les deux destinations propres de
  // l'application, déclarées avec `NetworkProvider navigation="destinations"`.
  discover: routes.memberDiscover,
  me: routes.me,
  shops: routes.marketplaceHome,
  shopOffer: routes.shopOffer,
  // « Créer → Mon activité » et, pour qui gère déjà une boutique, « Ma boutique » dans le rail (étude des sept univers, § 12).
  myActivity: routes.myShops,
  clips: routes.clips,
  // P14B : destinations typées des avis (cloche, ouverture d'une notification poussée).
  serviceRequest: routes.serviceRequest,
  jobApplication: routes.jobApplication,
  pageModerationDecisions: routes.pageModerationDecisions,
  personalDecisions: routes.personalControls,
  personalReports: routes.personalReports,
}

/**
 * Une page de DIRECT (`/direct/…`, `/conference/…`) : plein écran, sans barre
 * ni rail de navigation posés sur ses commandes.
 */
export function isLiveSessionPath(pathname: string): boolean {
  return [routes.direct(""), routes.conference("")].some((prefix) => pathname.startsWith(prefix) && pathname.length > prefix.length)
}

/**
 * La destination d'une page que SEULE l'application sait ranger : le fil
 * filtré (national, province, mot-clé) relève de « Découvrir », mes
 * préférences du fil, mes paramètres, mes boutiques et la modération relèvent de « Profil » ;
 * une vitrine membre relève de « Découvrir ». `undefined`
 * pour toute autre page — la coque la range elle-même (fil et volets,
 * Découvrir, Profil, Messages, mon profil public).
 */
export function memberDestinationFor(
  pathname: string,
  search: { get: (name: string) => string | null },
): ReseauDestinationMatch | null | undefined {
  if (pathname === routes.feed() && search.get("portee") !== null) return { id: "decouvrir", current: "section" }
  if (pathname === routes.marketplace().split("?")[0]) return { id: "decouvrir", current: "section" }
  if (pathname === routes.foodUniverse()) return { id: "decouvrir", current: "section" }
  if (pathname.startsWith(routes.storefront("")) && pathname.length > routes.storefront("").length) return { id: "decouvrir", current: "section" }
  if (pathname.startsWith(routes.provider("")) && pathname.length > routes.provider("").length) return { id: "decouvrir", current: "section" }
  if (pathname === routes.myShops() || pathname.startsWith(`${routes.myShops()}/`)) return { id: "profil", current: "section" }
  if (pathname === routes.myOrders() || pathname.startsWith(`${routes.myOrders()}/`)) return { id: "profil", current: "section" }
  if (pathname === routes.cart() || pathname === routes.purchases() || pathname.startsWith(`${routes.purchases()}/`)) return { id: "profil", current: "section" }
  if (pathname === routes.savedOffers()) return { id: "profil", current: "section" }
  if (pathname === routes.paymentList() || pathname.startsWith(`${routes.paymentList()}/`)) return { id: "profil", current: "section" }
  if (pathname === routes.myApplications() || pathname.startsWith(`${routes.myApplications()}/`)) return { id: "profil", current: "section" }
  if (pathname === routes.serviceRequests() || pathname.startsWith(`${routes.serviceRequests()}/`)) return { id: "profil", current: "section" }
  if (pathname === routes.feedPreferences() || pathname === routes.moderation() || pathname === routes.settings()) return { id: "profil", current: "section" }
  return undefined
}

/** Une catégorie fermée : aucun handle, identifiant, paramètre ou chemin envoyé. */
export function usageScreenForPath(pathname: string): UsageScreen | null {
  if (pathname === routes.feed()) return "feed"
  if (pathname === routes.personalControls()) return "data"
  if (pathname === routes.messages() || pathname.startsWith(`${routes.messages()}/`)) return "messages"
  if (pathname === routes.stories() || pathname.startsWith(`${routes.stories()}/`)) return "stories"
  if (/^\/profil\/[^/]+\/albums\/[^/]+$/.test(pathname)) return "albums"
  if (pathname.startsWith("/profil/")) return "profile"
  if (pathname.startsWith("/page/")) return "page"
  if (pathname.startsWith("/conference/")) return "conference"
  return null
}

/** Seule une origine HTTPS sans sous-chemin peut fournir le point de capture. */
export function analyticsCaptureEndpoint(host: string | undefined): string | null {
  if (!host || host.trim() !== host || /\s/.test(host)) return null
  try {
    const url = new URL(host)
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null
    return new URL("/i/v0/e/", url).href
  } catch { return null }
}
