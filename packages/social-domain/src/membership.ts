/**
 * Adhésions — statuts communs à tous les réseaux et leurs transitions
 * (cahier §6.2, §5 invariants 3 et 7). Règles PURES : le backend les applique,
 * les écrans les affichent, personne ne les réécrit.
 *
 *   en_attente  admission conditionnelle : lecture seule des contenus publics du réseau
 *   declaree    membre (peut publier, réagir, écrire)
 *   verifiee    membre vérifié (attestation, IDN de garantie suffisante, opérateur)
 *   suspendue   sanction : plus aucune écriture ; la lecture dépend de la sanction
 *   partie      a quitté le réseau
 */
import type { MembershipPolicy, NetworkKind } from "./network"

export const MEMBERSHIP_STATUSES = ["en_attente", "declaree", "verifiee", "suspendue", "partie"] as const
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number]

/** Statuts d'un membre ACTIF (qui compte dans le réseau). */
export const ACTIVE_MEMBERSHIP_STATUSES = ["en_attente", "declaree", "verifiee"] as const
export type ActiveMembershipStatus = (typeof ACTIVE_MEMBERSHIP_STATUSES)[number]

export const MEMBERSHIP_ROLES = ["member", "network_moderator", "network_admin"] as const
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number]

/** Qui (ou quoi) a vérifié une adhésion `verifiee`. */
export const VERIFICATION_SOURCES = ["idn", "consulat", "sponsor", "operator", "federation"] as const
export type VerificationSource = (typeof VERIFICATION_SOURCES)[number]

/**
 * Rang d'accès : un statut satisfait une exigence de rang inférieur ou égal.
 * `suspendue` et `partie` n'ont aucun rang : ils ne satisfont rien.
 */
const ACCESS_RANK: Record<ActiveMembershipStatus, number> = { en_attente: 1, declaree: 2, verifiee: 3 }

export function isActiveStatus(status: MembershipStatus): status is ActiveMembershipStatus {
  return (ACTIVE_MEMBERSHIP_STATUSES as readonly string[]).includes(status)
}

/** Le statut `status` satisfait-il l'exigence minimale `minimum` ? */
export function satisfiesMinimum(status: MembershipStatus, minimum: ActiveMembershipStatus): boolean {
  return isActiveStatus(status) && ACCESS_RANK[status] >= ACCESS_RANK[minimum]
}

/** Gestes qui font changer un statut. */
export type MembershipEvent =
  | { kind: "verify"; source: VerificationSource }
  | { kind: "admit" }
  | { kind: "unverify" }
  | { kind: "suspend" }
  | { kind: "lift_suspension"; restoreTo: ActiveMembershipStatus }
  | { kind: "leave" }
  | { kind: "rejoin"; entryStatus: ActiveMembershipStatus }

/**
 * Transition d'un statut sous un geste ; `null` = transition refusée.
 * - `admit` : en_attente → declaree (parrainage, décision du réseau) ;
 * - `verify` : en_attente | declaree → verifiee ;
 * - `unverify` : verifiee → declaree (attestation révoquée) ;
 * - `suspend` : tout statut actif → suspendue ;
 * - `lift_suspension` : suspendue → le statut d'avant la sanction ;
 * - `leave` : statut actif → partie (on ne quitte pas un réseau en étant
 *   suspendu : ce serait effacer la sanction en revenant) ;
 * - `rejoin` : partie → le statut d'entrée de la politique.
 */
export function nextMembershipStatus(current: MembershipStatus, event: MembershipEvent): MembershipStatus | null {
  switch (event.kind) {
    case "admit":
      return current === "en_attente" ? "declaree" : null
    case "verify":
      return current === "en_attente" || current === "declaree" ? "verifiee" : null
    case "unverify":
      return current === "verifiee" ? "declaree" : null
    case "suspend":
      return isActiveStatus(current) ? "suspendue" : null
    case "lift_suspension":
      return current === "suspendue" ? event.restoreTo : null
    case "leave":
      return isActiveStatus(current) ? "partie" : null
    case "rejoin":
      return current === "partie" ? event.entryStatus : null
  }
}

/** Ce qu'une personne apporte en entrant dans un réseau. */
export type EntryEvidence = {
  /** Identité numérique IDN de garantie suffisante (`loa ≥ 2`). */
  strongIdentity: boolean
  /** Vérification externe propre au réseau (attestation consulaire…). */
  externalVerification: boolean
  /** Admise par un parrain qualifié. */
  sponsored: boolean
}

/**
 * Statut d'entrée selon la politique du réseau ; `null` = adhésion directe
 * impossible (un miroir ne s'alimente que par reflet signé).
 * - `open` (ANTSIA) : `verifiee` avec une identité forte, sinon `declaree` ;
 * - `declared_or_verified` (DIASPORA.GA, cahier DIASPORA.GA §6.2) : vérification
 *   externe → `verifiee` ; identité forte ou parrainage → `declaree` ; compte
 *   léger seul → `en_attente` (lecture seule jusqu'au parrainage) ;
 * - `mirror` : jamais par adhésion directe.
 */
export function entryStatusFor(policy: MembershipPolicy, evidence: EntryEvidence): ActiveMembershipStatus | null {
  switch (policy) {
    case "open":
      return evidence.strongIdentity || evidence.externalVerification ? "verifiee" : "declaree"
    case "declared_or_verified":
      if (evidence.externalVerification) return "verifiee"
      if (evidence.strongIdentity || evidence.sponsored) return "declaree"
      return "en_attente"
    case "mirror":
      return null
  }
}

/** Effet sur la racine d'une entrée dans un réseau fermé (invariant 3). */
export type DerivedRootAction =
  | { kind: "create"; status: ActiveMembershipStatus }
  | { kind: "keep" }
  | { kind: "reactivate"; status: ActiveMembershipStatus }
  | { kind: "refuse"; reason: "root_suspended" }

/**
 * Adhésion DÉRIVÉE vers la racine : entrer dans un enfant crée (ou maintient)
 * l'adhésion à la racine ; une personne partie de la racine y revient ; une
 * personne suspendue à la racine ne peut entrer nulle part (la suspension
 * racine vaut partout). Le statut racine suit la politique `open` de la racine.
 */
export function derivedRootMembership(input: {
  childKind: NetworkKind
  existingRootStatus: MembershipStatus | null
  evidence: EntryEvidence
}): DerivedRootAction {
  if (input.childKind === "root") return { kind: "keep" }
  const rootEntry = entryStatusFor("open", input.evidence) ?? "declaree"
  switch (input.existingRootStatus) {
    case null:
      return { kind: "create", status: rootEntry }
    case "suspendue":
      return { kind: "refuse", reason: "root_suspended" }
    case "partie":
      return { kind: "reactivate", status: rootEntry }
    default:
      return { kind: "keep" }
  }
}

/**
 * Quitter la racine fait quitter tous les réseaux fermés (un membre d'un enfant
 * est toujours membre de la racine) ; quitter un enfant ne retire pas la racine.
 */
export function leaveCascades(networkKind: NetworkKind): "children_too" | "this_network_only" {
  return networkKind === "root" ? "children_too" : "this_network_only"
}

/**
 * Accès effectif à un réseau : la suspension à la RACINE l'emporte sur tout
 * statut local (« suspension racine = partout »).
 */
export function effectiveAccessStatus(input: {
  networkStatus: MembershipStatus | null
  rootStatus: MembershipStatus | null
  isRoot: boolean
}): MembershipStatus | null {
  if (input.rootStatus === "suspendue") return "suspendue"
  if (input.isRoot) return input.rootStatus
  return input.networkStatus
}
