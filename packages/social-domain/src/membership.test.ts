import { describe, expect, it } from "vitest"

import {
  ACTIVE_MEMBERSHIP_STATUSES,
  derivedRootMembership,
  effectiveAccessStatus,
  entryStatusFor,
  isActiveStatus,
  leaveCascades,
  MEMBERSHIP_STATUSES,
  type MembershipEvent,
  type MembershipStatus,
  nextMembershipStatus,
  satisfiesMinimum,
} from "./membership"

const none = { strongIdentity: false, externalVerification: false, sponsored: false }

describe("satisfiesMinimum — rang d'accès", () => {
  const table: [MembershipStatus, "en_attente" | "declaree" | "verifiee", boolean][] = [
    ["en_attente", "en_attente", true],
    ["en_attente", "declaree", false],
    ["en_attente", "verifiee", false],
    ["declaree", "en_attente", true],
    ["declaree", "declaree", true],
    ["declaree", "verifiee", false],
    ["verifiee", "en_attente", true],
    ["verifiee", "declaree", true],
    ["verifiee", "verifiee", true],
    ["suspendue", "en_attente", false],
    ["suspendue", "declaree", false],
    ["partie", "en_attente", false],
    ["partie", "verifiee", false],
  ]
  it.each(table)("%s satisfait %s : %s", (status, minimum, expected) => {
    expect(satisfiesMinimum(status, minimum)).toBe(expected)
  })

  it("seuls les trois premiers statuts sont actifs", () => {
    expect(MEMBERSHIP_STATUSES.filter(isActiveStatus)).toEqual([...ACTIVE_MEMBERSHIP_STATUSES])
  })
})

describe("nextMembershipStatus — toutes les transitions", () => {
  const events: MembershipEvent[] = [
    { kind: "admit" },
    { kind: "verify", source: "idn" },
    { kind: "unverify" },
    { kind: "suspend" },
    { kind: "lift_suspension", restoreTo: "declaree" },
    { kind: "leave" },
    { kind: "rejoin", entryStatus: "declaree" },
  ]
  // Table complète : statut × geste → statut suivant (null = refusé).
  const expected: Record<MembershipStatus, (MembershipStatus | null)[]> = {
    en_attente: ["declaree", "verifiee", null, "suspendue", null, "partie", null],
    declaree: [null, "verifiee", null, "suspendue", null, "partie", null],
    verifiee: [null, null, "declaree", "suspendue", null, "partie", null],
    suspendue: [null, null, null, null, "declaree", null, null],
    partie: [null, null, null, null, null, null, "declaree"],
  }
  for (const status of MEMBERSHIP_STATUSES) {
    events.forEach((event, index) => {
      it(`${status} --${event.kind}--> ${String(expected[status][index])}`, () => {
        expect(nextMembershipStatus(status, event)).toBe(expected[status][index])
      })
    })
  }

  it("la levée de sanction rend le statut d'avant", () => {
    expect(nextMembershipStatus("suspendue", { kind: "lift_suspension", restoreTo: "verifiee" })).toBe("verifiee")
    expect(nextMembershipStatus("suspendue", { kind: "lift_suspension", restoreTo: "en_attente" })).toBe("en_attente")
  })

  it("on ne quitte pas un réseau en étant suspendu (la sanction ne s'efface pas en revenant)", () => {
    expect(nextMembershipStatus("suspendue", { kind: "leave" })).toBeNull()
  })

  it("le retour suit le statut d'entrée de la politique", () => {
    expect(nextMembershipStatus("partie", { kind: "rejoin", entryStatus: "en_attente" })).toBe("en_attente")
  })
})

describe("entryStatusFor — statut d'entrée par politique", () => {
  it("open (ANTSIA) : déclarée, vérifiée avec une identité forte ou une vérification externe", () => {
    expect(entryStatusFor("open", none)).toBe("declaree")
    expect(entryStatusFor("open", { ...none, strongIdentity: true })).toBe("verifiee")
    expect(entryStatusFor("open", { ...none, externalVerification: true })).toBe("verifiee")
    expect(entryStatusFor("open", { ...none, sponsored: true })).toBe("declaree")
  })

  it("declared_or_verified (DIASPORA.GA) : compte léger en attente ; IDN ou parrainage déclarés ; attestation vérifiée", () => {
    expect(entryStatusFor("declared_or_verified", none)).toBe("en_attente")
    expect(entryStatusFor("declared_or_verified", { ...none, strongIdentity: true })).toBe("declaree")
    expect(entryStatusFor("declared_or_verified", { ...none, sponsored: true })).toBe("declaree")
    expect(entryStatusFor("declared_or_verified", { ...none, externalVerification: true })).toBe("verifiee")
    expect(entryStatusFor("declared_or_verified", { strongIdentity: true, externalVerification: true, sponsored: true })).toBe("verifiee")
  })

  it("mirror (administration) : jamais d'adhésion directe", () => {
    expect(entryStatusFor("mirror", { strongIdentity: true, externalVerification: true, sponsored: true })).toBeNull()
  })
})

describe("derivedRootMembership — invariant 3 (adhésion dérivée)", () => {
  it("entrer dans un enfant crée l'adhésion racine", () => {
    expect(derivedRootMembership({ childKind: "closed", existingRootStatus: null, evidence: none })).toEqual({ kind: "create", status: "declaree" })
    expect(derivedRootMembership({ childKind: "closed", existingRootStatus: null, evidence: { ...none, strongIdentity: true } })).toEqual({
      kind: "create",
      status: "verifiee",
    })
  })

  it("une adhésion racine active est maintenue telle quelle", () => {
    for (const status of ["en_attente", "declaree", "verifiee"] as const) {
      expect(derivedRootMembership({ childKind: "closed", existingRootStatus: status, evidence: none })).toEqual({ kind: "keep" })
    }
  })

  it("une personne partie de la racine y revient en entrant dans un enfant", () => {
    expect(derivedRootMembership({ childKind: "closed", existingRootStatus: "partie", evidence: none })).toEqual({ kind: "reactivate", status: "declaree" })
  })

  it("suspendue à la racine : refus d'entrer dans un enfant (la suspension vaut partout)", () => {
    expect(derivedRootMembership({ childKind: "closed", existingRootStatus: "suspendue", evidence: none })).toEqual({ kind: "refuse", reason: "root_suspended" })
  })

  it("entrer dans la racine elle-même ne dérive rien", () => {
    expect(derivedRootMembership({ childKind: "root", existingRootStatus: null, evidence: none })).toEqual({ kind: "keep" })
  })
})

describe("leaveCascades et effectiveAccessStatus", () => {
  it("quitter la racine fait quitter les enfants ; quitter un enfant ne retire pas la racine", () => {
    expect(leaveCascades("root")).toBe("children_too")
    expect(leaveCascades("closed")).toBe("this_network_only")
  })

  it("la suspension racine l'emporte sur tout statut local", () => {
    expect(effectiveAccessStatus({ networkStatus: "verifiee", rootStatus: "suspendue", isRoot: false })).toBe("suspendue")
    expect(effectiveAccessStatus({ networkStatus: "verifiee", rootStatus: "declaree", isRoot: false })).toBe("verifiee")
    expect(effectiveAccessStatus({ networkStatus: null, rootStatus: "declaree", isRoot: true })).toBe("declaree")
    expect(effectiveAccessStatus({ networkStatus: null, rootStatus: null, isRoot: false })).toBeNull()
  })
})
