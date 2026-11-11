/**
 * Règles PURES des boutiques (lot P07, ADR-0019) — aucune fonction Convex,
 * aucune lecture de base. Importées par le backend et, dans les tests,
 * confrontées aux formulaires de l'application (mêmes bornes, mêmes modèles).
 *
 * Une boutique est une CAPACITÉ d'une page sociale, liée à une activité : ni un
 * réseau, ni un second profil. Trois autorisations distinctes, jamais déduites
 * l'une de l'autre ni d'un badge :
 *   1. PRÉPARER (brouillon) — tout membre déclaré actif du réseau ;
 *   2. PUBLIER LA VITRINE — selon la politique du réseau, FERMÉE par défaut,
 *      réglée par un opérateur de la plateforme ; admission tracée ;
 *   3. ENCAISSER — ABSENTE : elle attend la liaison PRO.GA (P08), le catalogue
 *      canonique (P09), l'admission commerciale du vendeur et un prestataire de
 *      paiement prouvé (P12/P13). Aucun chemin serveur ne l'ouvre ici.
 */
import { derivePageHandle, PAGE_DESCRIPTION_MAX_LENGTH, PAGE_HANDLE_MAX_LENGTH, PAGE_HANDLE_MIN_LENGTH, PAGE_NAME_MAX_LENGTH } from "@antsia/social-domain/pages"

// ═══════════════════════════════════════════════════════════════
// Modèles d'activité et blocs
// ═══════════════════════════════════════════════════════════════

/**
 * Les modèles OUVERTS — le pilote de l'étude (06 §1) : commerce de produits et
 * service sur devis. Un modèle n'est proposé qu'avec ses blocs et ses actions.
 */
export const SHOP_MODELS = ["products", "quote_services"] as const
export type ShopModel = (typeof SHOP_MODELS)[number]

/** Les autres modèles de 06 §1 : décrits, jamais proposés avant leurs lots (P14, P15 et suivants). */
export const SHOP_LATER_MODELS = ["artisan", "local_services", "appointments", "restaurant", "creator", "employer", "association"] as const

/** Les blocs d'une vitrine ; un modèle n'active que les siens. */
export const SHOP_BLOCKS = ["catalog", "services", "publications", "about"] as const
export type ShopBlock = (typeof SHOP_BLOCKS)[number]

export const SHOP_MODEL_BLOCKS: Readonly<Record<ShopModel, readonly ShopBlock[]>> = {
  products: ["catalog", "publications", "about"],
  quote_services: ["services", "publications", "about"],
}

/**
 * Les blocs COMMERCIAUX attendent les offres canoniques de PRO.GA (P08/P09) :
 * aucun catalogue parallèle n'est saisi ici, aucune offre n'est inventée.
 */
export const SHOP_BLOCKS_AWAITING_PRO_LINK: readonly ShopBlock[] = ["catalog", "services"]

/**
 * L'état d'un bloc : actif, en attente de la liaison PRO.GA, ou en attente de
 * la page sociale (les publications d'une boutique sont celles de sa page,
 * créée à l'admission de la vitrine).
 */
export const SHOP_BLOCK_STATES = ["active", "awaiting_pro_link", "awaiting_pro_catalog", "awaiting_page"] as const
export type ShopBlockState = (typeof SHOP_BLOCK_STATES)[number]

export function shopBlockStates(model: ShopModel, hasPage: boolean, hasCommerceLink = false, hasCatalog = false): { id: ShopBlock; state: ShopBlockState }[] {
  return SHOP_MODEL_BLOCKS[model].map((id) => ({
    id,
    state: SHOP_BLOCKS_AWAITING_PRO_LINK.includes(id) ? (hasCatalog ? "active" : hasCommerceLink ? "awaiting_pro_catalog" : "awaiting_pro_link") : id === "publications" && !hasPage ? "awaiting_page" : "active",
  }))
}

/** Les blocs qu'une vitrine REND : ceux qui ont un contenu réel — aucun onglet vide visible. */
export function visibleStorefrontBlocks(model: ShopModel, hasPage: boolean): ShopBlock[] {
  return shopBlockStates(model, hasPage)
    .filter((block) => block.state === "active")
    .map((block) => block.id)
}

// ═══════════════════════════════════════════════════════════════
// Bornes et textes
// ═══════════════════════════════════════════════════════════════

/**
 * Bornes des champs. Le nom commercial suit celle d'un nom de page (et du
 * contrat PRO-COMMERCE-PUBLIC-V1 : 2 à 120) ; c'est un nom d'ORGANISATION, sans
 * règle de casse des personnes. La description n'est exigée qu'à la demande de
 * publication (au moins `descriptionMin` caractères) : un brouillon s'écrit
 * à son rythme.
 */
export const SHOP_LIMITS = {
  nameMin: 2,
  nameMax: PAGE_NAME_MAX_LENGTH,
  descriptionMin: 10,
  descriptionMax: PAGE_DESCRIPTION_MAX_LENGTH,
  specialtyMax: 80,
  serviceAreaMax: 120,
  hoursMax: 200,
} as const

/** Brouillons SANS page qu'une personne prépare dans un réseau (quota métier, en plus du débit). */
export const SHOP_DRAFTS_PER_PERSON_MAX = 3

/** Fenêtre de gestion des pages par personne, distincte du plafond de signataires PAR PAGE. */
export const SHOP_MANAGEMENT_PAGES_MAX = 100

/** Les refus MÉTIER des boutiques, traduits par l'application (`shops:errors.<code>`). */
export const SHOP_RULES = [
  "shop_name_length",
  "shop_description_length",
  "shop_specialty_length",
  "shop_service_area_length",
  "shop_hours_length",
  "shop_text_invalid",
  "shop_draft_quota",
  "shop_page_reserved",
  "shop_page_taken",
  "shop_publication_closed",
  "shop_presentation_incomplete",
  "shop_state_invalid",
  "shop_suspended",
  "shop_consent_outdated",
  "shop_owner_inactive",
  "shop_handle_unavailable",
] as const
export type ShopRule = (typeof SHOP_RULES)[number]

export type ShopViolation = { rule: ShopRule; params: Readonly<Record<string, number>> }
export type ShopFieldResult<T> = { ok: true; value: T } | { ok: false; violation: ShopViolation }

/** Caractères de contrôle refusés (le saut de ligne n'est admis que dans la description). */
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/

/** Une LIGNE : forme NFC, espaces resserrés, bords nettoyés. */
export function normalizeShopLine(raw: string): string {
  return raw.normalize("NFC").replace(/\s+/g, " ").trim()
}

/** Un TEXTE de plusieurs lignes : forme NFC, sauts de ligne gardés (deux de suite au plus), bords nettoyés. */
export function normalizeShopText(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

const refuse = <T>(rule: ShopRule, params: Record<string, number> = {}): ShopFieldResult<T> => ({ ok: false, violation: { rule, params } })

/** Le nom commercial : obligatoire, borné. */
export function checkShopName(raw: string): ShopFieldResult<string> {
  if (CONTROL_CHARACTERS.test(raw)) return refuse("shop_text_invalid")
  const value = normalizeShopLine(raw)
  if (value.length < SHOP_LIMITS.nameMin || value.length > SHOP_LIMITS.nameMax) return refuse("shop_name_length", { min: SHOP_LIMITS.nameMin, max: SHOP_LIMITS.nameMax })
  return { ok: true, value }
}

/** La description : facultative dans un brouillon (vide = absente), bornée. */
export function checkShopDescription(raw: string): ShopFieldResult<string | undefined> {
  if (CONTROL_CHARACTERS.test(raw)) return refuse("shop_text_invalid")
  const value = normalizeShopText(raw)
  if (value.length === 0) return { ok: true, value: undefined }
  if (value.length > SHOP_LIMITS.descriptionMax) return refuse("shop_description_length", { min: SHOP_LIMITS.descriptionMin, max: SHOP_LIMITS.descriptionMax })
  return { ok: true, value }
}

/** Une ligne facultative (spécialité, zone, horaires) : vide = absente, bornée. */
export function checkShopOptionalLine(raw: string, field: "specialty" | "serviceArea" | "hours"): ShopFieldResult<string | undefined> {
  if (CONTROL_CHARACTERS.test(raw.replace(/[\n\t]/g, " "))) return refuse("shop_text_invalid")
  const value = normalizeShopLine(raw)
  if (value.length === 0) return { ok: true, value: undefined }
  const rule = field === "specialty" ? "shop_specialty_length" : field === "serviceArea" ? "shop_service_area_length" : "shop_hours_length"
  const max = field === "specialty" ? SHOP_LIMITS.specialtyMax : field === "serviceArea" ? SHOP_LIMITS.serviceAreaMax : SHOP_LIMITS.hoursMax
  if (value.length > max) return refuse(rule, { max })
  return { ok: true, value }
}

/** Ce qui manque à une présentation pour demander la publication. */
export const SHOP_PRESENTATION_GAPS = ["name", "description"] as const
export type ShopPresentationGap = (typeof SHOP_PRESENTATION_GAPS)[number]

export function presentationGaps(identity: { name: string | null; description: string | null }): ShopPresentationGap[] {
  const gaps: ShopPresentationGap[] = []
  if (identity.name === null || identity.name.length < SHOP_LIMITS.nameMin) gaps.push("name")
  if (identity.description === null || identity.description.length < SHOP_LIMITS.descriptionMin) gaps.push("description")
  return gaps
}

// ═══════════════════════════════════════════════════════════════
// La vitrine : états et politique de publication
// ═══════════════════════════════════════════════════════════════

/**
 * L'état de la VITRINE d'une boutique :
 *  · `draft` — en préparation, lue par ses seuls gérants ;
 *  · `pending_review` — demande en file d'admission (politique `review`) ;
 *  · `published` — admise et visible des membres du réseau (et, avec le
 *    consentement de diffusion publique, des visiteurs sans compte) ;
 *  · `rejected` — refusée par l'équipe de la plateforme, motif rendu aux gérants ;
 *  · `withdrawn` — retirée par ses gérants ;
 *  · `suspended` — retirée par l'équipe de la plateforme : seule elle la rétablit.
 */
export const STOREFRONT_STATES = ["draft", "pending_review", "published", "rejected", "withdrawn", "suspended"] as const
export type StorefrontState = (typeof STOREFRONT_STATES)[number]

export const STOREFRONT_TRANSITIONS: Readonly<Record<StorefrontState, readonly StorefrontState[]>> = {
  draft: ["pending_review", "published"],
  pending_review: ["draft", "published", "rejected"],
  rejected: ["pending_review", "published"],
  published: ["withdrawn", "suspended"],
  withdrawn: ["pending_review", "published"],
  suspended: ["published"],
}

/** Transition permise ; un état inconnu n'autorise rien (fail-closed). */
export function storefrontTransitionAllowed(from: string, to: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(STOREFRONT_TRANSITIONS, from) || !Object.prototype.hasOwnProperty.call(STOREFRONT_TRANSITIONS, to)) return false
  return STOREFRONT_TRANSITIONS[from as StorefrontState].includes(to as StorefrontState)
}

/** Les états d'où un GÉRANT demande la publication (jamais une vitrine suspendue : la décision tient). */
export const STOREFRONT_REQUESTABLE: readonly StorefrontState[] = ["draft", "rejected", "withdrawn"]

/** Les états où une boutique se défait (jamais en file, publiée ou suspendue). */
export const STOREFRONT_DISCARDABLE: readonly StorefrontState[] = ["draft", "rejected", "withdrawn"]

/**
 * La POLITIQUE de publication des vitrines d'un réseau — décision ouverte du
 * propriétaire (ADR-0019) :
 *  · `closed` — aucune vitrine ne se publie ; les brouillons restent ouverts ;
 *  · `review` — toute demande passe par la file d'admission des opérateurs ;
 *  · `auto_verified` — une adhésion VÉRIFIÉE est admise d'office, une adhésion
 *    déclarée passe par la file.
 * Fermer la politique retire les vitrines de la découverte sans rien effacer.
 */
export const STOREFRONT_POLICIES = ["closed", "review", "auto_verified"] as const
export type StorefrontPolicy = (typeof STOREFRONT_POLICIES)[number]

/** Aucune ligne de politique : la publication est FERMÉE. */
export const DEFAULT_STOREFRONT_POLICY: StorefrontPolicy = "closed"

export const PUBLICATION_OUTCOMES = ["closed", "queue", "admit"] as const
export type PublicationOutcome = (typeof PUBLICATION_OUTCOMES)[number]

/**
 * Ce que devient une demande de publication. `auto_verified` lit le NIVEAU
 * D'ADHÉSION du demandeur au moment du geste — jamais un badge. CM-02 : une
 * vitrine qui propose une catégorie RÉGLEMENTÉE passe sous la politique
 * `review` — jamais d'admission d'office, la file des opérateurs décide.
 */
export function publicationOutcome(policy: StorefrontPolicy, requesterVerified: boolean, regulatedCategory = false): PublicationOutcome {
  if (policy === "closed") return "closed"
  if (policy === "auto_verified" && requesterVerified && !regulatedCategory) return "admit"
  return "queue"
}

/** Une politique qui laisse les vitrines admises être lues (« réseau admis »). */
export function storefrontsOpen(policy: StorefrontPolicy): boolean {
  return policy !== "closed"
}

/**
 * Version du texte de consentement à la diffusion PUBLIQUE (lecture sans
 * compte) : le geste porte la version qu'il a lue ; une version périmée est
 * refusée, jamais réputée acceptée.
 */
export const SHOP_PUBLIC_LISTING_TEXT_VERSION = "2026-10-18"

/** Ce qui manque pour ENCAISSER, dans l'ordre des lots — aucune de ces étapes n'est franchie en P07. */
export const SHOP_CHECKOUT_MISSING = ["pro_link", "pro_catalog", "seller_admission", "payment_provider"] as const
export type ShopCheckoutMissing = (typeof SHOP_CHECKOUT_MISSING)[number]

// ═══════════════════════════════════════════════════════════════
// La page sociale d'une boutique admise
// ═══════════════════════════════════════════════════════════════

/** La nature de la page d'une boutique : une entreprise — jamais une institution, jamais « Officiel ». */
export const SHOP_PAGE_OWNER_KIND = "company" as const

/** Essais d'adresse pour la page d'une boutique admise : borné, jamais une boucle. */
export const SHOP_HANDLE_ATTEMPTS = 5

const SHOP_HANDLE_SUFFIX = "-boutique"
const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/

/**
 * Les adresses CANDIDATES de la page d'une boutique admise, dérivées du nom
 * commercial (même repli que l'adresse d'une page) : la première libre
 * l'emporte. Un nom qui ne donne pas trois caractères se complète.
 */
export function shopHandleCandidates(name: string): string[] {
  const room = PAGE_HANDLE_MAX_LENGTH - SHOP_HANDLE_SUFFIX.length
  let base = derivePageHandle(name).slice(0, room).replace(/[._-]+$/, "")
  if (base.length < PAGE_HANDLE_MIN_LENGTH) base = base.length > 0 ? `${base}${SHOP_HANDLE_SUFFIX}` : SHOP_HANDLE_SUFFIX.slice(1)
  const candidates = [base, `${base}${SHOP_HANDLE_SUFFIX}`, `${base}-2`, `${base}-3`, `${base}-4`]
  return [...new Set(candidates)]
    .filter((handle) => handle.length >= PAGE_HANDLE_MIN_LENGTH && handle.length <= PAGE_HANDLE_MAX_LENGTH && HANDLE_PATTERN.test(handle))
    .slice(0, SHOP_HANDLE_ATTEMPTS)
}
