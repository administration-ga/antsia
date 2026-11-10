// Dupliqué de socle/convex/modules/reseauPages/domain.ts (avec l'extrait de `followedUpdates.ts`, l. 33-47) @ ad2e7fdc2 — adaptations : pages GÉNÉRIQUES du moteur (institution, association, entreprise, média, communauté) à identité PROPRE — nom, sigle et description bornés ici, plus dérivés d'une organisation ; adresse dérivée du NOM (le slug d'une organisation n'existe plus) ; admission au fil sans portée « mon_administration » : la note de service devient l'audience `followers` (abonnés et signataires vivants) ; signataires (rôles `admin`/`signatory`, plafond, dernier administrateur) et revendications (EXF-AN-17 : pièces, note, transitions) neufs ; rang de confiance pour la découverte ; refus à code de règle (`DomainViolation`).
/**
 * Domaine PUR des pages — aucune fonction Convex ici, pour qu'un import client
 * atteigne ces règles sans embarquer le backend, et pour qu'elles se vérifient
 * sans harnais.
 *
 * Une PAGE est la présence d'une organisation dans un réseau : institution
 * (poste consulaire, ministère), association, entreprise, média, communauté.
 * Son identité (nom, sigle, logo, bannière, description) lui est PROPRE ; sa
 * confiance (`official`, `verified`, `community`) est posée par une décision
 * tracée, jamais par ses signataires ; elle parle par ses SIGNATAIRES vivants.
 */
import { isPageClaimable, isTrustAllowedForOwner, type PageOwnerKind, type PageTrust } from "./badges"
import type { FeedReason } from "./content"
import { DomainViolation } from "./violation"

// ═══════════════════════════════════════════════════════════════
// Adresse et identité
// ═══════════════════════════════════════════════════════════════

/**
 * L'adresse d'une page est PLUS LONGUE que celle d'une personne (30) : dérivée
 * du nom d'une organisation, elle dépasse couramment trente caractères
 * (« association-des-gabonais-de-lyon »). La raccourcir imposerait d'inventer
 * une abréviation, ce qu'aucun code n'a à faire.
 */
export const PAGE_HANDLE_MIN_LENGTH = 3
export const PAGE_HANDLE_MAX_LENGTH = 60

export const PAGE_NAME_MAX_LENGTH = 120
export const PAGE_SHORT_NAME_MAX_LENGTH = 30
export const PAGE_DESCRIPTION_MAX_LENGTH = 1000

export const PAGE_STATUSES = ["active", "inactive"] as const
/**
 * Deux états, pas de `pending` : une page existe (active) ou elle est retirée
 * (inactive) — la ligne demeure, ses publications cessent d'être servies sans
 * jamais être supprimées, et une réactivation les rend toutes d'un coup.
 */
export type PageStatus = (typeof PAGE_STATUSES)[number]

/**
 * L'adresse d'une page, dérivée d'un texte libre (le nom, ou l'adresse saisie).
 *
 * Même jeu de caractères que l'identifiant d'une personne : minuscules non
 * accentuées, chiffres, point, tiret, souligné. Un texte qui en sort est REPLIÉ
 * plutôt que refusé ; les séparateurs de tête et de queue sont retirés (une
 * adresse qui commence par un tiret se copie mal).
 *
 * ⚠️ Les adresses de PAGES et de PERSONNES ne sont pas dédoublonnées entre
 * elles : deux routes distinctes, jamais résolues dans le même espace de noms.
 * Les mentions `@` ne résolvent que des personnes — une page se suit, elle ne
 * se cite pas.
 */
export function derivePageHandle(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+/, "")
    .replace(/[._-]+$/, "")
}

/** L'adresse, repliée puis validée. */
export function assertPageHandle(raw: string): string {
  const handle = derivePageHandle(raw)
  if (handle.length < PAGE_HANDLE_MIN_LENGTH || handle.length > PAGE_HANDLE_MAX_LENGTH) {
    throw new DomainViolation("PAGE_HANDLE_LENGTH", { min: PAGE_HANDLE_MIN_LENGTH, max: PAGE_HANDLE_MAX_LENGTH })
  }
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(handle)) throw new DomainViolation("PAGE_HANDLE_CHARSET")
  return handle
}

/** Le nom d'une page : espaces resserrés, jamais vide, borné. */
export function assertPageName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ")
  if (name.length === 0 || name.length > PAGE_NAME_MAX_LENGTH) throw new DomainViolation("PAGE_NAME_LENGTH", { max: PAGE_NAME_MAX_LENGTH })
  return name
}

/** Le sigle : facultatif (vide = absent), borné. */
export function normalizePageShortName(raw: string | undefined): string | undefined {
  const value = raw?.trim().replace(/\s+/g, " ")
  if (!value) return undefined
  if (value.length > PAGE_SHORT_NAME_MAX_LENGTH) throw new DomainViolation("PAGE_SHORT_NAME_TOO_LONG", { max: PAGE_SHORT_NAME_MAX_LENGTH })
  return value
}

/** La description : facultative (vide = absente), bornée. */
export function normalizePageDescription(raw: string | undefined): string | undefined {
  const value = raw?.trim()
  if (!value) return undefined
  if (value.length > PAGE_DESCRIPTION_MAX_LENGTH) throw new DomainViolation("PAGE_DESCRIPTION_TOO_LONG", { max: PAGE_DESCRIPTION_MAX_LENGTH })
  return value
}

// ═══════════════════════════════════════════════════════════════
// Nature et confiance
// ═══════════════════════════════════════════════════════════════

/**
 * Les natures qu'un MEMBRE peut créer. Une page d'`institution` naît d'une
 * décision tracée (opérateur de plateforme, import contractuel, fédération) :
 * laisser un membre ouvrir « Ministère de… » en confiance `community`
 * fabriquerait l'usurpation que les badges sont là pour empêcher.
 */
export const MEMBER_PAGE_OWNER_KINDS = ["association", "company", "media", "community"] as const satisfies readonly PageOwnerKind[]

export function assertMemberCreatableOwnerKind(kind: PageOwnerKind): void {
  if (!(MEMBER_PAGE_OWNER_KINDS as readonly PageOwnerKind[]).includes(kind)) throw new DomainViolation("PAGE_OWNER_KIND_RESERVED")
}

/** « Officiel » n'appartient qu'à une institution ; une autre nature plafonne à « Vérifié ». */
export function assertTrustAllowedForOwner(ownerKind: PageOwnerKind, trust: PageTrust): void {
  if (!isTrustAllowedForOwner(ownerKind, trust)) throw new DomainViolation("PAGE_TRUST_NOT_ALLOWED")
}

/**
 * Le RANG de découverte d'une confiance : les pages officielles d'abord, puis
 * les vérifiées, puis les autres — dénormalisé sur la page pour qu'un index
 * ordonne l'annuaire sans compteur chaud (le socle triait par abonnés, un
 * champ réécrit à chaque abonnement, D02).
 */
export function pageTrustRank(trust: PageTrust): number {
  switch (trust) {
    case "official":
      return 2
    case "verified":
      return 1
    case "community":
      return 0
  }
}

// ═══════════════════════════════════════════════════════════════
// Signataires
// ═══════════════════════════════════════════════════════════════

/**
 * `admin` publie ET gère (identité, signataires, revendication) ; `signatory`
 * publie et retire les publications de la page. Le signataire n'est pas le
 * propriétaire du propos : son droit est ACTUEL (relu à chaque acte), jamais
 * acquis par une publication passée.
 */
export const PAGE_ROLES = ["admin", "signatory"] as const
export type PageRole = (typeof PAGE_ROLES)[number]

/** Signataires d'une page, tous rôles confondus — une page n'est pas un groupe. */
export const PAGE_SIGNATORIES_MAX = 50

export function canManagePage(role: PageRole): boolean {
  return role === "admin"
}

export function assertPageHasRoomForSignatory(count: number): void {
  if (count >= PAGE_SIGNATORIES_MAX) throw new DomainViolation("PAGE_SIGNATORIES_FULL", { max: PAGE_SIGNATORIES_MAX })
}

/**
 * Retirer ou rétrograder le DERNIER administrateur laisserait une page que plus
 * personne ne gère : refusé (qu'il se retire lui-même ou qu'on le retire).
 */
export function assertNotLastAdmin(input: { role: PageRole; nextRole: PageRole | null; adminCount: number }): void {
  if (input.role === "admin" && input.nextRole !== "admin" && input.adminCount <= 1) throw new DomainViolation("PAGE_LAST_ADMIN")
}

// ═══════════════════════════════════════════════════════════════
// Publications de page dans le fil
// ═══════════════════════════════════════════════════════════════

/**
 * Les audiences d'une publication de PAGE (EXF-AN-18) : le COMMUNIQUÉ (`public`,
 * tous les membres, abonnés ou non) et la NOTE aux abonnés (`followers` : les
 * abonnés de la page et ses signataires vivants, personne d'autre).
 */
export const PAGE_POST_AUDIENCES = ["public", "followers"] as const
export type PagePostAudience = (typeof PAGE_POST_AUDIENCES)[number]

/** Pages suivies retenues pour composer une page du fil (une fenêtre chacune, en plus des auteurs). */
export const PAGES_FEED_MAX = 50

/** Abonnements lus en une fois pour composer l'ensemble des pages suivies. */
export const PAGE_FOLLOWS_SCAN = 200

export type PageFeedScope = "pour_vous" | "recents"

/**
 * À quel TITRE une publication de PAGE entre-t-elle dans MON fil ?
 *
 * Séparée de `feedAdmissionFor` (le fil des personnes), et c'est délibéré :
 * celle-ci porte la parité avec `feedReasonFor`, vérifiée par un test, et des
 * drapeaux de page l'auraient diluée.
 *
 *  · la NOTE aux abonnés passe AVANT la portée : elle ne sort pas de son cercle,
 *    quel que soit le volet qui la demande (la placer dans un `case` l'aurait
 *    laissée fuir par « Récents ») ;
 *  · `pour_vous` — le fil des CHOIX : une page n'y entre que suivie (ou pour
 *    son signataire, qui voit ce qu'il a publié) ;
 *  · `recents` — la DÉCOUVERTE : un communiqué y a sa place, suivi ou non.
 *
 * Rend `null` quand aucun titre ne tient.
 */
export function pageFeedAdmissionFor(input: {
  scope: PageFeedScope
  /** Signataire VIVANT de la page (relu à la lecture, jamais l'auteur historique). */
  isSignatory: boolean
  isFollowedPage: boolean
  /** Audience `followers` : réservée aux abonnés et aux signataires vivants. */
  isRestrictedToFollowers: boolean
}): FeedReason | null {
  if (input.isRestrictedToFollowers && !input.isSignatory && !input.isFollowedPage) return null
  switch (input.scope) {
    case "pour_vous":
      if (input.isSignatory) return "own"
      return input.isFollowedPage ? "page" : null
    case "recents":
      if (input.isSignatory) return "own"
      return input.isFollowedPage ? "page" : "public"
  }
}

// ═══════════════════════════════════════════════════════════════
// Revendications (EXF-AN-17)
// ═══════════════════════════════════════════════════════════════

export const PAGE_CLAIM_STATUSES = ["pending", "approved", "rejected", "withdrawn"] as const
export type PageClaimStatus = (typeof PAGE_CLAIM_STATUSES)[number]

/** Ce qu'un modérateur peut trancher. */
export const PAGE_CLAIM_DECISIONS = ["approved", "rejected"] as const
export type PageClaimDecision = (typeof PAGE_CLAIM_DECISIONS)[number]

/** Pièces jointes à une revendication (statuts, récépissé, mandat…). */
export const PAGE_CLAIM_EVIDENCE_MAX = 5
export const PAGE_CLAIM_NOTE_MAX_LENGTH = 1000

/**
 * Une page se revendique-t-elle ? Jamais une page `official` (EXF-AN-17) ; une
 * page déjà `verified` non plus (une contestation passe par la modération) ;
 * une page qui a déjà un administrateur vivant seulement par l'un d'eux — c'est
 * alors une demande de VÉRIFICATION, pas une prise de contrôle.
 */
export function assertPageClaimable(input: { trust: PageTrust; hasLiveAdmin: boolean; claimantIsAdmin: boolean }): void {
  if (!isPageClaimable(input.trust)) throw new DomainViolation("PAGE_NOT_CLAIMABLE")
  if (input.trust === "verified") throw new DomainViolation("PAGE_ALREADY_VERIFIED")
  if (input.hasLiveAdmin && !input.claimantIsAdmin) throw new DomainViolation("PAGE_ALREADY_CLAIMED")
}

export function assertPageClaimEvidenceCount(count: number): void {
  if (count < 1 || count > PAGE_CLAIM_EVIDENCE_MAX) throw new DomainViolation("PAGE_CLAIM_EVIDENCE_COUNT", { max: PAGE_CLAIM_EVIDENCE_MAX })
}

export function normalizePageClaimNote(raw: string | undefined): string | undefined {
  const value = raw?.trim()
  if (!value) return undefined
  if (value.length > PAGE_CLAIM_NOTE_MAX_LENGTH) throw new DomainViolation("PAGE_CLAIM_NOTE_TOO_LONG", { max: PAGE_CLAIM_NOTE_MAX_LENGTH })
  return value
}

/**
 * PG-01 — conservation des pièces d'une revendication TRANCHÉE : 90 jours après la décision,
 * puis purge par lots bornés (cron `pages-purge-decided-claim-evidence`) ; une demande retirée
 * les purge aussitôt. VALEUR CHOISIE DANS LE LOT, À VALIDER PAR LE PROPRIÉTAIRE ET LE JURISTE :
 * aucune décision n'existe ; 90 jours est la plus courte durée déjà en usage pour des pièces
 * personnelles comparables (fichiers retenus, `FILE_GUARD_QUARANTINE_RETENTION_DAYS_DEFAULT` ;
 * demandes de service closes, `SERVICE_CLOSED_RETENTION_MS` ; conversations commerciales closes,
 * `COMMERCIAL_RETENTION_MS` ; rediffusions, `DIRECT_REPLAY_RETENTION_DAYS`).
 */
export const PAGE_CLAIM_EVIDENCE_RETENTION_DAYS = 90
export const PAGE_CLAIM_EVIDENCE_RETENTION_MS = PAGE_CLAIM_EVIDENCE_RETENTION_DAYS * 24 * 60 * 60 * 1000

/** Seule une revendication EN ATTENTE se tranche ou se retire ; une décision est définitive. */
export function isPageClaimOpen(status: PageClaimStatus): boolean {
  return status === "pending"
}

// ═══════════════════════════════════════════════════════════════
// Rappels des pages suivies
// ═══════════════════════════════════════════════════════════════

export const FOLLOWED_UPDATE_EXCERPT_MAX = 160

/** Texte mono-ligne, sans balises, borné sans couper une paire Unicode. */
export function followedUpdateExcerpt(body: string): string {
  const normalized = body
    .replace(/<[^>]*>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
  const characters = Array.from(normalized)
  if (characters.length <= FOLLOWED_UPDATE_EXCERPT_MAX) return normalized
  return `${characters
    .slice(0, FOLLOWED_UPDATE_EXCERPT_MAX - 1)
    .join("")
    .trimEnd()}…`
}
