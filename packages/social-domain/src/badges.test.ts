import { describe, expect, it } from "vitest"

import { computePageBadge, computePersonBadges, CONSOLE_MIN_LOA, hasStrongIdentity, isPageClaimable, isTrustAllowedForOwner, VERIFIED_MIN_LOA } from "./badges"

describe("computePersonBadges — calculés, jamais déclarés", () => {
  it("sans lien fort : Communauté", () => {
    expect(computePersonBadges([])).toEqual(["community"])
    expect(computePersonBadges([{ provider: "local" }])).toEqual(["community"])
    expect(computePersonBadges([{ provider: "idn", loa: 1 }])).toEqual(["community"])
  })

  it("IDN de garantie ≥ 2 : Vérifié", () => {
    expect(computePersonBadges([{ provider: "idn", loa: 2 }])).toEqual(["verified"])
    expect(computePersonBadges([{ provider: "idn", loa: 3 }, { provider: "local" }])).toEqual(["verified"])
  })

  it("attestation consulaire : Vérifié", () => {
    expect(computePersonBadges([{ provider: "consular_attestation" }])).toEqual(["verified"])
  })

  it("lien administration : Agent public, cumulable avec Vérifié", () => {
    expect(computePersonBadges([{ provider: "administration" }])).toEqual(["public_agent"])
    expect(computePersonBadges([{ provider: "idn", loa: 2 }, { provider: "administration" }])).toEqual(["verified", "public_agent"])
  })

  it("un lien révoqué ne compte plus", () => {
    expect(computePersonBadges([{ provider: "idn", loa: 3, revokedAt: 1 }])).toEqual(["community"])
    expect(computePersonBadges([{ provider: "administration", revokedAt: 1 }, { provider: "consular_attestation" }])).toEqual(["verified"])
  })

  it("identité forte = IDN ≥ 2 vivant seulement", () => {
    expect(hasStrongIdentity([{ provider: "idn", loa: 2 }])).toBe(true)
    expect(hasStrongIdentity([{ provider: "consular_attestation" }])).toBe(false)
    expect(hasStrongIdentity([{ provider: "idn" }])).toBe(false)
  })
})

describe("pages — confiance et revendication", () => {
  it("le badge d'une page est sa confiance", () => {
    expect(computePageBadge("official")).toBe("official")
    expect(computePageBadge("verified")).toBe("verified")
    expect(computePageBadge("community")).toBe("community")
  })

  it("une page Officiel n'est jamais revendicable", () => {
    expect(isPageClaimable("official")).toBe(false)
    expect(isPageClaimable("verified")).toBe(true)
    expect(isPageClaimable("community")).toBe(true)
  })

  it("seule une institution peut être Officiel", () => {
    expect(isTrustAllowedForOwner("institution", "official")).toBe(true)
    for (const owner of ["association", "company", "media", "community"] as const) {
      expect(isTrustAllowedForOwner(owner, "official")).toBe(false)
      expect(isTrustAllowedForOwner(owner, "verified")).toBe(true)
    }
  })
})

describe("ADR-0039 — niveaux IDN de la console et du badge Vérifié", () => {
  it("la console admet le niveau 1 ; le badge Vérifié et l'identité forte restent au niveau 2", () => {
    expect(CONSOLE_MIN_LOA).toBe(1)
    expect(VERIFIED_MIN_LOA).toBe(2)
    expect(hasStrongIdentity([{ provider: "idn", loa: CONSOLE_MIN_LOA }])).toBe(false)
    expect(hasStrongIdentity([{ provider: "idn", loa: VERIFIED_MIN_LOA }])).toBe(true)
  })
})
