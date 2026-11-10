// Dupliqué de socle/convex/modules/reseauPersonnel/domain.ts (l. 756-805 et 896-937) @ ad2e7fdc2 — adaptations : section des groupes thématiques isolée dans son module ; `ReseauPersonnelViolation` → `DomainViolation` ; règles du groupe bornées et versionnées, leur acceptation, et transfert de propriété vers un modérateur (PG-02).
/**
 * Groupes THÉMATIQUES — bornes et autorité.
 *
 * ⚠️ À ne pas confondre avec les CONVERSATIONS de groupe (`./groupThreads.ts`) :
 * celles-là sont une messagerie fermée ; ceux-ci sont des lieux de PUBLICATION
 * à thème, découvrables dans leur réseau, ouverts à l'adhésion. Ni les uns ni
 * les autres n'appartiennent à une organisation : des personnes, dans un réseau.
 */
import { DomainViolation } from "./violation"

export const THEMATIC_GROUP_NAME_MIN_LENGTH = 3
export const THEMATIC_GROUP_NAME_MAX_LENGTH = 80
export const THEMATIC_GROUP_DESCRIPTION_MAX_LENGTH = 500

/**
 * Trois rôles, un ordre d'autorité : `owner` (créateur, unique) > `moderator`
 * > `member`. La modération — épingler, retirer une publication — appartient
 * aux DEUX premiers ; la gestion des rôles au seul `owner`.
 */
export const THEMATIC_GROUP_ROLES = ["owner", "moderator", "member"] as const
export type ThematicGroupRole = (typeof THEMATIC_GROUP_ROLES)[number]

export function assertThematicGroupName(raw: string): string {
  const name = raw.trim()
  if (name.length < THEMATIC_GROUP_NAME_MIN_LENGTH || name.length > THEMATIC_GROUP_NAME_MAX_LENGTH) {
    throw new DomainViolation("GROUP_NAME_LENGTH", { min: THEMATIC_GROUP_NAME_MIN_LENGTH, max: THEMATIC_GROUP_NAME_MAX_LENGTH })
  }
  return name
}

export function assertThematicGroupDescription(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  const trimmed = raw.trim()
  if (trimmed.length === 0) return undefined
  if (trimmed.length > THEMATIC_GROUP_DESCRIPTION_MAX_LENGTH) {
    throw new DomainViolation("GROUP_DESCRIPTION_TOO_LONG", { max: THEMATIC_GROUP_DESCRIPTION_MAX_LENGTH })
  }
  return trimmed
}

/** L'autorité de MODÉRATION d'un groupe : épingler, retirer une publication. */
export function isThematicGroupModerator(role: ThematicGroupRole): boolean {
  return role === "owner" || role === "moderator"
}

/**
 * Qui peut retirer qui : on ne se retire pas soi-même par cette voie (c'est
 * `leave`) ; l'`owner` retire n'importe qui d'autre ; un `moderator` ne retire
 * que les simples membres — jamais un pair, jamais l'`owner`.
 */
export function canRemoveThematicGroupMember(input: {
  actorRole: ThematicGroupRole
  targetRole: ThematicGroupRole
  isSelf: boolean
}): boolean {
  if (input.isSelf) return false
  if (input.actorRole === "owner") return true
  if (input.actorRole === "moderator") return input.targetRole === "member"
  return false
}

/**
 * Le seul `owner` promeut et rétrograde, et jamais un `owner` (donc jamais
 * lui-même) : le groupe garde exactement un propriétaire.
 */
export function canSetThematicGroupRole(input: { actorRole: ThematicGroupRole; targetRole: ThematicGroupRole }): boolean {
  return input.actorRole === "owner" && input.targetRole !== "owner"
}

/**
 * L'`owner` ne QUITTE pas son groupe : son départ laisserait un groupe sans
 * personne pour le modérer. Il transmet d'abord son rôle à un modérateur
 * (`canTransferThematicGroupOwnership`), puis part en simple modérateur.
 */
export function canLeaveThematicGroup(role: ThematicGroupRole): boolean {
  return role !== "owner"
}

/** La même règle, levée : le propriétaire ne quitte pas son groupe. */
export function assertCanLeaveThematicGroup(role: ThematicGroupRole): void {
  if (!canLeaveThematicGroup(role)) throw new DomainViolation("GROUP_OWNER_CANNOT_LEAVE")
}

/**
 * Le TRANSFERT de propriété : du seul `owner` vers un `moderator` du groupe,
 * jamais vers soi-même ni vers un simple membre (le propriétaire nomme d'abord
 * un modérateur). L'ancien propriétaire devient modérateur : le groupe garde
 * exactement un propriétaire. L'éligibilité de la PERSONNE (adhésion au réseau,
 * sanction, effacement, blocage) se juge au serveur.
 */
export function canTransferThematicGroupOwnership(input: { actorRole: ThematicGroupRole; targetRole: ThematicGroupRole; isSelf: boolean }): boolean {
  return input.actorRole === "owner" && input.targetRole === "moderator" && !input.isSelf
}

// ═══════════════════════════════════════════════════════════════
// Règles du groupe (PG-02)
// ═══════════════════════════════════════════════════════════════

/**
 * Les règles d'un groupe sont le TEXTE de son propriétaire (contenu de membre,
 * comme la description), jamais un texte juridique de la plateforme. Même
 * borne que la description d'un évènement personnel et qu'un message
 * commercial : 2 000 caractères.
 */
export const THEMATIC_GROUP_RULES_MAX_LENGTH = 2000

/** Règles recevables : bornées ; vides (ou blanches) = aucune règle. */
export function assertThematicGroupRules(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  const trimmed = raw.trim()
  if (trimmed.length === 0) return undefined
  if (trimmed.length > THEMATIC_GROUP_RULES_MAX_LENGTH) {
    throw new DomainViolation("GROUP_RULES_TOO_LONG", { max: THEMATIC_GROUP_RULES_MAX_LENGTH })
  }
  return trimmed
}

/**
 * La version EN VIGUEUR des règles d'un groupe, ou `null` sans règles. Le
 * compteur `rulesVersion` ne redescend jamais : retirer puis remettre des
 * règles en fait une version nouvelle.
 */
export function thematicGroupRulesVersionInForce(group: { rules?: string; rulesVersion?: number }): number | null {
  return group.rules === undefined ? null : (group.rulesVersion ?? 1)
}

/** La version que prend un nouveau texte : une de plus que la dernière émise. */
export function nextThematicGroupRulesVersion(current: number | undefined): number {
  return (current ?? 0) + 1
}

/**
 * Entrer dans un groupe qui a des règles exige d'avoir accepté CELLES EN
 * VIGUEUR. Sans règles, l'adhésion reste libre comme avant.
 */
export function assertThematicGroupRulesAccepted(input: { rulesVersion: number | null; acceptedRulesVersion: number | undefined }): void {
  if (input.rulesVersion !== null && input.acceptedRulesVersion !== input.rulesVersion) throw new DomainViolation("GROUP_RULES_NOT_ACCEPTED")
}
