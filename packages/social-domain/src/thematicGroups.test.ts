// Dupliqué de socle/convex/modules/reseauPersonnel/domain.test.ts (l. 670-731) @ ad2e7fdc2 — adaptations : imports depuis ./thematicGroups ; `ReseauPersonnelViolation` → `DomainViolation` ; cas neufs (PG-02) : règles bornées et versionnées, acceptation, transfert de propriété.
import { describe, expect, it } from "vitest"

import {
  assertThematicGroupDescription,
  assertThematicGroupName,
  assertThematicGroupRules,
  assertThematicGroupRulesAccepted,
  canLeaveThematicGroup,
  canRemoveThematicGroupMember,
  canSetThematicGroupRole,
  canTransferThematicGroupOwnership,
  isThematicGroupModerator,
  nextThematicGroupRulesVersion,
  THEMATIC_GROUP_NAME_MAX_LENGTH,
  THEMATIC_GROUP_RULES_MAX_LENGTH,
  thematicGroupRulesVersionInForce,
  type ThematicGroupRole,
} from "./thematicGroups"
import { DomainViolation } from "./violation"

describe("nom et description d'un groupe", () => {
  it("le nom est borné, la description optionnelle", () => {
    expect(assertThematicGroupName("  Marchés publics  ")).toBe("Marchés publics")
    expect(() => assertThematicGroupName("ab")).toThrow(DomainViolation)
    expect(() => assertThematicGroupName("x".repeat(THEMATIC_GROUP_NAME_MAX_LENGTH + 1))).toThrow(DomainViolation)
    expect(assertThematicGroupDescription(undefined)).toBeUndefined()
    expect(assertThematicGroupDescription("   ")).toBeUndefined()
    expect(() => assertThematicGroupDescription("x".repeat(501))).toThrow(DomainViolation)
  })
})

describe("autorité dans un groupe thématique", () => {
  it("owner et moderator modèrent, member non", () => {
    expect(isThematicGroupModerator("owner")).toBe(true)
    expect(isThematicGroupModerator("moderator")).toBe(true)
    expect(isThematicGroupModerator("member")).toBe(false)
  })

  it("l'owner retire tout le monde sauf lui-même ; un modérateur, les seuls membres", () => {
    const cas = (actorRole: ThematicGroupRole, targetRole: ThematicGroupRole, isSelf = false) =>
      canRemoveThematicGroupMember({ actorRole, targetRole, isSelf })
    expect(cas("owner", "moderator")).toBe(true)
    expect(cas("owner", "member")).toBe(true)
    expect(cas("owner", "owner", true)).toBe(false)
    expect(cas("moderator", "member")).toBe(true)
    // Un modérateur ne retire NI un pair NI l'owner — l'autorité ne remonte pas.
    expect(cas("moderator", "moderator")).toBe(false)
    expect(cas("moderator", "owner")).toBe(false)
    expect(cas("member", "member")).toBe(false)
    // Se retirer soi-même passe par `leave`, jamais par cette voie.
    expect(cas("moderator", "moderator", true)).toBe(false)
  })

  it("le seul owner change les rôles, jamais sur un owner", () => {
    expect(canSetThematicGroupRole({ actorRole: "owner", targetRole: "member" })).toBe(true)
    expect(canSetThematicGroupRole({ actorRole: "owner", targetRole: "moderator" })).toBe(true)
    expect(canSetThematicGroupRole({ actorRole: "moderator", targetRole: "member" })).toBe(false)
    expect(canSetThematicGroupRole({ actorRole: "owner", targetRole: "owner" })).toBe(false)
  })

  it("l'owner ne quitte pas son groupe", () => {
    expect(canLeaveThematicGroup("owner")).toBe(false)
    expect(canLeaveThematicGroup("moderator")).toBe(true)
    expect(canLeaveThematicGroup("member")).toBe(true)
  })
})

describe("transfert de propriété (PG-02)", () => {
  it("du seul owner vers un modérateur, jamais vers soi-même ni vers un simple membre", () => {
    expect(canTransferThematicGroupOwnership({ actorRole: "owner", targetRole: "moderator", isSelf: false })).toBe(true)
    expect(canTransferThematicGroupOwnership({ actorRole: "owner", targetRole: "member", isSelf: false })).toBe(false)
    expect(canTransferThematicGroupOwnership({ actorRole: "owner", targetRole: "owner", isSelf: true })).toBe(false)
    expect(canTransferThematicGroupOwnership({ actorRole: "moderator", targetRole: "moderator", isSelf: false })).toBe(false)
    expect(canTransferThematicGroupOwnership({ actorRole: "member", targetRole: "moderator", isSelf: false })).toBe(false)
  })
})

describe("règles du groupe (PG-02)", () => {
  it("bornées ; vides ou blanches = aucune règle", () => {
    expect(assertThematicGroupRules(undefined)).toBeUndefined()
    expect(assertThematicGroupRules("   ")).toBeUndefined()
    expect(assertThematicGroupRules("  Pas d'insultes.  ")).toBe("Pas d'insultes.")
    expect(assertThematicGroupRules("x".repeat(THEMATIC_GROUP_RULES_MAX_LENGTH))).toHaveLength(THEMATIC_GROUP_RULES_MAX_LENGTH)
    try {
      assertThematicGroupRules("x".repeat(THEMATIC_GROUP_RULES_MAX_LENGTH + 1))
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(DomainViolation)
      expect((error as DomainViolation).code).toBe("GROUP_RULES_TOO_LONG")
      expect((error as DomainViolation).params).toEqual({ max: THEMATIC_GROUP_RULES_MAX_LENGTH })
    }
  })

  it("la version en vigueur n'existe qu'avec un texte ; le compteur ne redescend jamais", () => {
    expect(thematicGroupRulesVersionInForce({})).toBeNull()
    expect(thematicGroupRulesVersionInForce({ rulesVersion: 3 })).toBeNull()
    expect(thematicGroupRulesVersionInForce({ rules: "Courtoisie.", rulesVersion: 3 })).toBe(3)
    expect(nextThematicGroupRulesVersion(undefined)).toBe(1)
    expect(nextThematicGroupRulesVersion(3)).toBe(4)
  })

  it("entrer exige la version EN VIGUEUR ; sans règles, l'adhésion reste libre", () => {
    expect(() => assertThematicGroupRulesAccepted({ rulesVersion: null, acceptedRulesVersion: undefined })).not.toThrow()
    expect(() => assertThematicGroupRulesAccepted({ rulesVersion: 2, acceptedRulesVersion: 2 })).not.toThrow()
    expect(() => assertThematicGroupRulesAccepted({ rulesVersion: 2, acceptedRulesVersion: undefined })).toThrow(DomainViolation)
    // Une version périmée (lue avant un changement) ne vaut pas acceptation.
    expect(() => assertThematicGroupRulesAccepted({ rulesVersion: 2, acceptedRulesVersion: 1 })).toThrow(DomainViolation)
  })
})
