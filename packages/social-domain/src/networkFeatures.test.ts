import { describe, expect, it } from "vitest"

import { NETWORK_SLICES } from "./network"
import {
  assertNetworkFeatureToggle,
  isNetworkFeature,
  NETWORK_FEATURE_PARENTS,
  NETWORK_FEATURE_REASON_MIN,
  NETWORK_FEATURES,
  networkFeatureChildren,
  networkFeatureToggleRefusal,
  openNetworkFeatures,
  SLICE_NETWORK_FEATURES,
  sliceGovernsFeature,
} from "./networkFeatures"
import { DomainViolation } from "./violation"

describe("fonctionnalités d'un réseau gouverné — règles pures (ADR-0041)", () => {
  it("huit clés gelées, dans l'ordre de la console", () => {
    expect(NETWORK_FEATURES).toEqual(["pages", "groupsAndEvents", "services", "jobs", "mutualAid", "mentoring", "arrivalKit", "pilotMetrics"])
    expect(NETWORK_FEATURE_REASON_MIN).toBe(10)
  })

  it("reconnaît une clé, refuse le reste", () => {
    for (const feature of NETWORK_FEATURES) expect(isNetworkFeature(feature)).toBe(true)
    expect(isNetworkFeature("calls")).toBe(false)
    expect(isNetworkFeature(42)).toBe(false)
    expect(isNetworkFeature(null)).toBe(false)
  })

  it("les groupes et évènements, les services et l'emploi exigent les pages ; les autres ne dépendent de rien", () => {
    expect(NETWORK_FEATURE_PARENTS).toEqual({
      pages: null,
      groupsAndEvents: "pages",
      services: "pages",
      jobs: "pages",
      mutualAid: null,
      mentoring: null,
      arrivalKit: null,
      pilotMetrics: null,
    })
    expect(networkFeatureChildren("pages")).toEqual(["groupsAndEvents", "services", "jobs"])
    expect(networkFeatureChildren("jobs")).toEqual([])
  })

  it("chaque tranche déclare ses fonctionnalités ; la tranche diaspora les gouverne toutes", () => {
    expect(Object.keys(SLICE_NETWORK_FEATURES).sort()).toEqual([...NETWORK_SLICES].sort())
    expect(SLICE_NETWORK_FEATURES.diaspora).toEqual(NETWORK_FEATURES)
    expect(sliceGovernsFeature("diaspora", "pages")).toBe(true)
    expect(sliceGovernsFeature(undefined, "pages")).toBe(false)
  })

  it("une clé n'est ouverte que si sa ligne l'est ET son parent aussi, dans l'ordre des clés", () => {
    expect(openNetworkFeatures([])).toEqual([])
    expect(openNetworkFeatures([{ feature: "jobs", enabled: true }])).toEqual([])
    expect(openNetworkFeatures([{ feature: "jobs", enabled: true }, { feature: "pages", enabled: false }])).toEqual([])
    expect(openNetworkFeatures([{ feature: "mentoring", enabled: true }, { feature: "jobs", enabled: true }, { feature: "pages", enabled: true }])).toEqual(["pages", "jobs", "mentoring"])
    expect(openNetworkFeatures([{ feature: "arrivalKit", enabled: false }])).toEqual([])
  })

  it("ouvrir exige le parent ouvert ; fermer les pages exige les enfants fermés ; le reste passe", () => {
    expect(networkFeatureToggleRefusal({ feature: "services", enabled: true, open: [] })).toBe("NETWORK_FEATURE_REQUIRES_PARENT")
    expect(networkFeatureToggleRefusal({ feature: "services", enabled: true, open: ["pages"] })).toBeNull()
    expect(networkFeatureToggleRefusal({ feature: "pages", enabled: false, open: ["pages", "jobs"] })).toBe("NETWORK_FEATURE_HAS_OPEN_CHILDREN")
    expect(networkFeatureToggleRefusal({ feature: "pages", enabled: false, open: ["pages"] })).toBeNull()
    expect(networkFeatureToggleRefusal({ feature: "mutualAid", enabled: true, open: [] })).toBeNull()
    expect(networkFeatureToggleRefusal({ feature: "jobs", enabled: false, open: [] })).toBeNull()
  })

  it("la règle levée porte son code, jamais une phrase", () => {
    expect(() => assertNetworkFeatureToggle({ feature: "groupsAndEvents", enabled: true, open: [] })).toThrow(DomainViolation)
    try {
      assertNetworkFeatureToggle({ feature: "pages", enabled: false, open: ["pages", "services"] })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(DomainViolation)
      expect((error as DomainViolation).code).toBe("NETWORK_FEATURE_HAS_OPEN_CHILDREN")
    }
    expect(() => assertNetworkFeatureToggle({ feature: "pages", enabled: true, open: [] })).not.toThrow()
  })
})
