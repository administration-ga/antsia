import { describe, expect, it } from "vitest"

import { effectiveVisibility, isValidNetworkSlug, ROOT_NETWORK_SLUG, validateNetworkShape } from "./network"

describe("isValidNetworkSlug", () => {
  it.each(["antsia", "diaspora-ga", "test-closed", "a1b"])("accepte %s", (slug) => {
    expect(isValidNetworkSlug(slug)).toBe(true)
  })

  it.each(["", "ab", "Antsia", "1abc", "abc-", "a--b", "a_b", "a".repeat(33)])("refuse « %s »", (slug) => {
    expect(isValidNetworkSlug(slug)).toBe(false)
  })

  it("le réseau racine a un identifiant valide", () => {
    expect(isValidNetworkSlug(ROOT_NETWORK_SLUG)).toBe(true)
  })
})

describe("validateNetworkShape", () => {
  it("accepte la racine ouverte sans parent et un réseau fermé avec parent", () => {
    expect(validateNetworkShape({ kind: "root", parentId: null, membershipPolicy: "open", defaultVisibility: "network" })).toEqual([])
    expect(validateNetworkShape({ kind: "closed", parentId: "n1", membershipPolicy: "declared_or_verified", defaultVisibility: "network" })).toEqual([])
    expect(validateNetworkShape({ kind: "closed", parentId: "n1", membershipPolicy: "mirror", defaultVisibility: "root" })).toEqual([])
  })

  it("refuse une racine avec parent, fermée ou en visibilité root", () => {
    expect(validateNetworkShape({ kind: "root", parentId: "x", membershipPolicy: "declared_or_verified", defaultVisibility: "root" })).toEqual([
      "root_with_parent",
      "root_not_open",
      "root_default_visibility",
    ])
  })

  it("refuse un réseau fermé sans parent", () => {
    expect(validateNetworkShape({ kind: "closed", parentId: null, membershipPolicy: "open", defaultVisibility: "network" })).toEqual(["closed_without_parent"])
  })

  it("refuse un miroir qui serait la racine", () => {
    expect(validateNetworkShape({ kind: "root", parentId: null, membershipPolicy: "mirror", defaultVisibility: "network" })).toEqual([
      "root_not_open",
      "mirror_must_be_closed",
    ])
  })
})

describe("effectiveVisibility — invariant 4 (contexte séparé)", () => {
  const closed = { networkKind: "closed" as const, ruleVisibility: "network" as const }

  it("dans la racine, seule l'audience publique et un geste ouvrent sans compte", () => {
    expect(effectiveVisibility({ networkKind: "root", audienceIsPublic: true, authorRequestedRoot: true, ruleVisibility: "network" })).toBe("root")
    expect(effectiveVisibility({ networkKind: "root", audienceIsPublic: true, authorRequestedRoot: false, ruleVisibility: "root" })).toBe("network")
    expect(effectiveVisibility({ networkKind: "root", audienceIsPublic: false, authorRequestedRoot: true, ruleVisibility: "root" })).toBe("network")
  })

  it("`root` exige une audience publique, même si l'auteur le demande", () => {
    expect(effectiveVisibility({ ...closed, audienceIsPublic: false, authorRequestedRoot: true })).toBe("network")
  })

  it("`root` sur geste explicite de l'auteur et audience publique", () => {
    expect(effectiveVisibility({ ...closed, audienceIsPublic: true, authorRequestedRoot: true })).toBe("root")
  })

  it("sans geste, la règle décide : `network` par défaut", () => {
    expect(effectiveVisibility({ ...closed, audienceIsPublic: true, authorRequestedRoot: false })).toBe("network")
  })

  it("sans geste, une règle `root` (page, réseau miroir) s'applique sur audience publique seulement", () => {
    expect(effectiveVisibility({ networkKind: "closed", audienceIsPublic: true, authorRequestedRoot: false, ruleVisibility: "root" })).toBe("root")
    expect(effectiveVisibility({ networkKind: "closed", audienceIsPublic: false, authorRequestedRoot: false, ruleVisibility: "root" })).toBe("network")
  })
})
