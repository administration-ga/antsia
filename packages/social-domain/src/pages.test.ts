import { describe, expect, it } from "vitest"

import { assertPinnableOnWall } from "./content"
import {
  assertMemberCreatableOwnerKind,
  assertNotLastAdmin,
  assertPageClaimable,
  assertPageClaimEvidenceCount,
  assertPageHandle,
  assertPageHasRoomForSignatory,
  assertPageName,
  assertTrustAllowedForOwner,
  canManagePage,
  canModeratePageComments,
  derivePageHandle,
  followedUpdateExcerpt,
  isPageClaimOpen,
  isPageSignatoryRole,
  normalizePageClaimNote,
  normalizePageDescription,
  normalizePageShortName,
  PAGE_CLAIM_EVIDENCE_MAX,
  PAGE_CLAIM_NOTE_MAX_LENGTH,
  PAGE_DESCRIPTION_MAX_LENGTH,
  PAGE_HANDLE_MAX_LENGTH,
  PAGE_NAME_MAX_LENGTH,
  PAGE_ROLES,
  PAGE_SHORT_NAME_MAX_LENGTH,
  PAGE_SIGNATORIES_MAX,
  PAGE_SLEEP_DAYS,
  PAGE_SLEEP_MS,
  PAGE_SLEEP_STATES,
  PAGE_TEAM_ROLES,
  type PageTeamRole,
  pageFeedAdmissionFor,
  pageSleepState,
  pageTrustRank,
} from "./pages"
import { DomainViolation } from "./violation"

function violationOf(run: () => unknown): DomainViolation | null {
  try {
    run()
    return null
  } catch (error) {
    return error instanceof DomainViolation ? error : null
  }
}

describe("adresse d'une page", () => {
  it("se dérive du nom : accents repliés, séparateurs uniques, ni tête ni queue de séparateur", () => {
    expect(derivePageHandle("Association des Gabonais de Lyon")).toBe("association-des-gabonais-de-lyon")
    expect(derivePageHandle("  Consulat Général — Paris !  ")).toBe("consulat-general-paris")
    expect(derivePageHandle("Ndjobi.ga")).toBe("ndjobi.ga")
  })

  it("est plus longue que l'identifiant d'une personne, et bornée", () => {
    expect(assertPageHandle("min-economie-finances-budget-et-comptes-publics")).toBe("min-economie-finances-budget-et-comptes-publics")
    expect(violationOf(() => assertPageHandle("ab"))?.code).toBe("PAGE_HANDLE_LENGTH")
    expect(violationOf(() => assertPageHandle("a".repeat(PAGE_HANDLE_MAX_LENGTH + 1)))?.params).toEqual({ min: 3, max: PAGE_HANDLE_MAX_LENGTH })
  })

  it("une adresse faite de symboles seuls ne survit pas au repli", () => {
    expect(violationOf(() => assertPageHandle("!!!"))?.code).toBe("PAGE_HANDLE_LENGTH")
  })
})

describe("identité d'une page", () => {
  it("le nom est resserré, jamais vide, borné", () => {
    expect(assertPageName("  Association   des   Gabonais  ")).toBe("Association des Gabonais")
    expect(violationOf(() => assertPageName("   "))?.code).toBe("PAGE_NAME_LENGTH")
    expect(violationOf(() => assertPageName("x".repeat(PAGE_NAME_MAX_LENGTH + 1)))?.params).toEqual({ max: PAGE_NAME_MAX_LENGTH })
  })

  it("sigle et description : vides = absents, bornés sinon", () => {
    expect(normalizePageShortName("  ")).toBeUndefined()
    expect(normalizePageShortName(" AGL ")).toBe("AGL")
    expect(violationOf(() => normalizePageShortName("x".repeat(PAGE_SHORT_NAME_MAX_LENGTH + 1)))?.code).toBe("PAGE_SHORT_NAME_TOO_LONG")
    expect(normalizePageDescription(undefined)).toBeUndefined()
    expect(violationOf(() => normalizePageDescription("x".repeat(PAGE_DESCRIPTION_MAX_LENGTH + 1)))?.code).toBe("PAGE_DESCRIPTION_TOO_LONG")
  })
})

describe("nature et confiance", () => {
  it("un membre crée une association, une entreprise, un média ou une communauté — jamais une institution", () => {
    for (const kind of ["association", "company", "media", "community"] as const) expect(() => assertMemberCreatableOwnerKind(kind)).not.toThrow()
    expect(violationOf(() => assertMemberCreatableOwnerKind("institution"))?.code).toBe("PAGE_OWNER_KIND_RESERVED")
  })

  it("« Officiel » n'appartient qu'à une institution", () => {
    expect(() => assertTrustAllowedForOwner("institution", "official")).not.toThrow()
    expect(violationOf(() => assertTrustAllowedForOwner("association", "official"))?.code).toBe("PAGE_TRUST_NOT_ALLOWED")
    expect(() => assertTrustAllowedForOwner("company", "verified")).not.toThrow()
  })

  it("le rang de découverte met les officielles d'abord, puis les vérifiées", () => {
    expect([pageTrustRank("community"), pageTrustRank("verified"), pageTrustRank("official")]).toEqual([0, 1, 2])
  })
})

describe("signataires", () => {
  it("plafonnés", () => {
    expect(() => assertPageHasRoomForSignatory(PAGE_SIGNATORIES_MAX - 1)).not.toThrow()
    expect(violationOf(() => assertPageHasRoomForSignatory(PAGE_SIGNATORIES_MAX))?.code).toBe("PAGE_SIGNATORIES_FULL")
  })

  it("le dernier administrateur ne part ni ne se rétrograde ; avec un second, il le peut", () => {
    expect(violationOf(() => assertNotLastAdmin({ role: "admin", nextRole: null, adminCount: 1 }))?.code).toBe("PAGE_LAST_ADMIN")
    expect(violationOf(() => assertNotLastAdmin({ role: "admin", nextRole: "signatory", adminCount: 1 }))?.code).toBe("PAGE_LAST_ADMIN")
    expect(() => assertNotLastAdmin({ role: "admin", nextRole: null, adminCount: 2 })).not.toThrow()
    expect(() => assertNotLastAdmin({ role: "signatory", nextRole: null, adminCount: 1 })).not.toThrow()
  })

  it("AS-10 : le dernier administrateur ne devient pas modérateur ; un modérateur part librement", () => {
    expect(violationOf(() => assertNotLastAdmin({ role: "admin", nextRole: "moderator", adminCount: 1 }))?.code).toBe("PAGE_LAST_ADMIN")
    expect(() => assertNotLastAdmin({ role: "admin", nextRole: "moderator", adminCount: 2 })).not.toThrow()
    expect(() => assertNotLastAdmin({ role: "moderator", nextRole: null, adminCount: 1 })).not.toThrow()
    expect(() => assertNotLastAdmin({ role: "moderator", nextRole: "admin", adminCount: 0 })).not.toThrow()
  })

  it("une publication de page ne s'épingle sur aucun mur personnel", () => {
    expect(violationOf(() => assertPinnableOnWall({ audience: "public", hasPage: true }))?.code).toBe("POST_PIN_PAGE")
    expect(() => assertPinnableOnWall({ audience: "public", hasPage: false })).not.toThrow()
  })
})

describe("AS-10 / PG-08 — l'équipe d'une page : rôle × capacité", () => {
  // La matrice de la décision du 19/11/2026 : parler au nom de la page, gérer, retirer un commentaire.
  const MATRIX: Record<PageTeamRole, { speaksForPage: boolean; manages: boolean; removesComments: boolean }> = {
    admin: { speaksForPage: true, manages: true, removesComments: true },
    signatory: { speaksForPage: true, manages: false, removesComments: true },
    moderator: { speaksForPage: false, manages: false, removesComments: true },
  }

  it("trois rôles d'équipe, dont deux seulement parlent au nom de la page — l'ancienne liste garde son sens", () => {
    expect(PAGE_TEAM_ROLES).toEqual(["admin", "signatory", "moderator"])
    expect(PAGE_ROLES).toEqual(["admin", "signatory"])
    expect(PAGE_TEAM_ROLES.filter(isPageSignatoryRole)).toEqual([...PAGE_ROLES])
  })

  it.each(PAGE_TEAM_ROLES)("%s : parle au nom de la page, gère, retire les commentaires selon la matrice", (role) => {
    const expected = MATRIX[role]
    expect(isPageSignatoryRole(role)).toBe(expected.speaksForPage)
    expect(isPageSignatoryRole(role) && canManagePage(role)).toBe(expected.manages)
    expect(canModeratePageComments(role)).toBe(expected.removesComments)
  })
})

describe("pageFeedAdmissionFor — une publication de page dans MON fil", () => {
  const base = { isSignatory: false, isFollowedPage: false, isRestrictedToFollowers: false }

  it("« Pour vous » : seulement suivie (ou signée) — jamais découverte", () => {
    expect(pageFeedAdmissionFor({ ...base, scope: "pour_vous" })).toBeNull()
    expect(pageFeedAdmissionFor({ ...base, scope: "pour_vous", isFollowedPage: true })).toBe("page")
    expect(pageFeedAdmissionFor({ ...base, scope: "pour_vous", isSignatory: true, isFollowedPage: true })).toBe("own")
  })

  it("« Récents » : un communiqué se découvre, suivi ou non", () => {
    expect(pageFeedAdmissionFor({ ...base, scope: "recents" })).toBe("public")
    expect(pageFeedAdmissionFor({ ...base, scope: "recents", isFollowedPage: true })).toBe("page")
  })

  it("la note aux abonnés ne sort de son cercle par AUCUN volet — « Récents » compris", () => {
    for (const scope of ["pour_vous", "recents"] as const) {
      expect(pageFeedAdmissionFor({ ...base, scope, isRestrictedToFollowers: true })).toBeNull()
      expect(pageFeedAdmissionFor({ ...base, scope, isRestrictedToFollowers: true, isFollowedPage: true })).toBe("page")
      expect(pageFeedAdmissionFor({ ...base, scope, isRestrictedToFollowers: true, isSignatory: true })).toBe("own")
    }
  })
})

describe("revendications", () => {
  it("jamais une page officielle, ni une déjà vérifiée ; une page tenue, par l'un de ses administrateurs seulement", () => {
    expect(violationOf(() => assertPageClaimable({ trust: "official", hasLiveAdmin: false, claimantIsAdmin: false }))?.code).toBe("PAGE_NOT_CLAIMABLE")
    expect(violationOf(() => assertPageClaimable({ trust: "verified", hasLiveAdmin: false, claimantIsAdmin: false }))?.code).toBe("PAGE_ALREADY_VERIFIED")
    expect(violationOf(() => assertPageClaimable({ trust: "community", hasLiveAdmin: true, claimantIsAdmin: false }))?.code).toBe("PAGE_ALREADY_CLAIMED")
    expect(() => assertPageClaimable({ trust: "community", hasLiveAdmin: true, claimantIsAdmin: true })).not.toThrow()
    expect(() => assertPageClaimable({ trust: "community", hasLiveAdmin: false, claimantIsAdmin: false })).not.toThrow()
  })

  it("une à cinq pièces, une note bornée, une décision seulement sur une demande en attente", () => {
    expect(violationOf(() => assertPageClaimEvidenceCount(0))?.params).toEqual({ max: PAGE_CLAIM_EVIDENCE_MAX })
    expect(violationOf(() => assertPageClaimEvidenceCount(PAGE_CLAIM_EVIDENCE_MAX + 1))?.code).toBe("PAGE_CLAIM_EVIDENCE_COUNT")
    expect(() => assertPageClaimEvidenceCount(1)).not.toThrow()
    expect(normalizePageClaimNote("  ")).toBeUndefined()
    expect(violationOf(() => normalizePageClaimNote("x".repeat(PAGE_CLAIM_NOTE_MAX_LENGTH + 1)))?.code).toBe("PAGE_CLAIM_NOTE_TOO_LONG")
    expect(isPageClaimOpen("pending")).toBe(true)
    for (const status of ["approved", "rejected", "withdrawn"] as const) expect(isPageClaimOpen(status)).toBe(false)
  })
})

describe("AS-11a — le sommeil d'une page, dérivé sans nouvel état", () => {
  const START = Date.UTC(2026, 10, 19, 10)
  const ENDS = START + PAGE_SLEEP_MS

  it("dure trente jours, comptés en millisecondes", () => {
    expect(PAGE_SLEEP_DAYS).toBe(30)
    expect(PAGE_SLEEP_MS).toBe(30 * 24 * 60 * 60 * 1000)
    expect(PAGE_SLEEP_STATES).toEqual(["none", "asleep", "expired"])
  })

  it("une page active, ou retirée sans échéance (opérateur, juge), n'est pas en sommeil", () => {
    expect(pageSleepState({ status: "active" }, START)).toBe("none")
    // Une échéance oubliée sur une page active ne la rend pas endormie.
    expect(pageSleepState({ status: "active", sleepEndsAt: ENDS }, START)).toBe("none")
    expect(pageSleepState({ status: "inactive", deactivatedAt: START }, START)).toBe("none")
  })

  it("endormie jusqu'à l'échéance, échue à l'instant même de l'échéance", () => {
    const sleeping = { status: "inactive" as const, deactivatedAt: START, sleepEndsAt: ENDS }
    expect(pageSleepState(sleeping, START)).toBe("asleep")
    expect(pageSleepState(sleeping, ENDS - 1)).toBe("asleep")
    expect(pageSleepState(sleeping, ENDS)).toBe("expired")
    expect(pageSleepState(sleeping, ENDS + PAGE_SLEEP_MS)).toBe("expired")
  })
})

describe("followedUpdateExcerpt — l'extrait d'un rappel", () => {
  it("nettoie les balises et les espaces, borne à 160 caractères sans couper une paire Unicode", () => {
    expect(followedUpdateExcerpt("<p>Bonjour   <b>tous</b></p>\n")).toBe("Bonjour tous")
    const long = `${"é".repeat(158)}😀😀😀`
    const excerpt = followedUpdateExcerpt(long)
    expect(Array.from(excerpt)).toHaveLength(160)
    expect(excerpt.endsWith("…")).toBe(true)
    expect(excerpt).not.toContain("�")
  })
})
