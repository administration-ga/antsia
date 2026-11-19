// Dupliqué de socle/convex/modules/reseauPages/validators.ts @ ad2e7fdc2 — adaptations : littéraux DÉRIVÉS des listes du domaine pur (`@antsia/social-domain/pages`, une seule source) ; rôles de signataire, statuts et décisions de revendication, audiences d'une publication de page et carte allowlistée d'une page ajoutés. ; AS-10 / PG-08 : rôle d'ÉQUIPE (`pageTeamRoleValidator`, modérateur compris).
/**
 * Validateurs des PAGES. Module sans fonction Convex enregistrée : un import
 * client l'atteint sans embarquer le backend.
 */
import { PAGE_CLAIM_DECISIONS, PAGE_CLAIM_STATUSES, PAGE_POST_AUDIENCES, PAGE_ROLES, PAGE_STATUSES, PAGE_TEAM_ROLES } from "@antsia/social-domain/pages"
import { PAGE_ASSOCIATION_TYPES, PAGE_COMPANY_SECTORS } from "@antsia/social-domain/pagePresentation"
import { type Infer, v } from "convex/values"

import { badgeValidator, literals, pageOwnerKindValidator } from "../../lib/validators"

/**
 * État d'une page : `active`, ou `inactive` (le retrait — la ligne demeure,
 * ses publications cessent d'être servies sans jamais être supprimées).
 */
export const pageStatusValidator = literals(PAGE_STATUSES)

/** Rôle d'un signataire : `admin` publie et gère, `signatory` publie — jamais un modérateur. */
export const pageRoleValidator = literals(PAGE_ROLES)

/**
 * Rôle d'un membre de l'ÉQUIPE d'une page (AS-10 / PG-08) : les deux rôles de signataire et
 * `moderator`, qui retire les commentaires sans parler au nom de la page. La colonne
 * `pageSignatories.role` et les surfaces de l'équipe (liste, habilitation, invitations) le portent.
 */
export const pageTeamRoleValidator = literals(PAGE_TEAM_ROLES)

export const pageClaimStatusValidator = literals(PAGE_CLAIM_STATUSES)

export const pageClaimDecisionValidator = literals(PAGE_CLAIM_DECISIONS)

/** Le communiqué (`public`) ou la note aux abonnés (`followers`). */
export const pagePostAudienceValidator = literals(PAGE_POST_AUDIENCES)

/** Précisions d'identité facultatives, dérivées du domaine pur. */
export const pageAssociationTypeValidator = literals(PAGE_ASSOCIATION_TYPES)
export const pageSectorValidator = literals(PAGE_COMPANY_SECTORS)

/**
 * La CARTE d'une page — l'en-tête d'une publication, une ligne d'annuaire, un
 * rappel. Allowlistée : aucun identifiant de stockage (le logo par la garde des
 * fichiers), le badge CALCULÉ de la confiance.
 */
export const pageCardValidator = v.object({
  pageId: v.id("pages"),
  networkId: v.id("networks"),
  handle: v.string(),
  name: v.string(),
  shortName: v.union(v.string(), v.null()),
  logoUrl: v.union(v.string(), v.null()),
  badge: badgeValidator,
  ownerKind: pageOwnerKindValidator,
  country: v.union(v.string(), v.null()),
})

export type PageCard = Infer<typeof pageCardValidator>
