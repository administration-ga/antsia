// P04 (18/10/2026) : le mode du fil — Immersion au téléphone, Liste au bureau, mémorisé par réseau, purgé à la déconnexion.
import { personalStateKeys } from "@antsia/api/sign-out-everywhere"
import { describe, expect, it } from "vitest"

import { createMemoryStorage } from "../../tests/memory-storage"
import {
  defaultFeedMode,
  FEED_MODE_STORAGE_SUFFIX,
  feedModeStorageKey,
  IMMERSIVE_MIN_VIEWPORT_HEIGHT,
  parseStoredFeedModes,
  resolveFeedMode,
  serializeStoredFeedModes,
  withStoredFeedMode,
} from "./feed-mode"

describe("défauts", () => {
  it("Immersion au téléphone, Liste au bureau, Liste quand les mouvements sont réduits", () => {
    expect(defaultFeedMode("phone", false)).toBe("immersive")
    expect(defaultFeedMode("desktop", false)).toBe("list")
    expect(defaultFeedMode("phone", true)).toBe("list")
    expect(defaultFeedMode("desktop", true)).toBe("list")
  })

  it("l'écran des chartes (ADR-0028) ouvre le téléphone en Liste ; un choix explicite l'emporte encore", () => {
    expect(defaultFeedMode("phone", false, "list")).toBe("list")
    expect(defaultFeedMode("desktop", false, "list")).toBe("list")
    expect(resolveFeedMode({ pose: "phone", stored: {}, reducedMotion: false, viewportHeight: 800, phoneDefault: "list" })).toEqual({ preferred: "list", effective: "list", fallback: null, explicit: false })
    const chosen = withStoredFeedMode({}, "phone", "immersive")
    expect(resolveFeedMode({ pose: "phone", stored: chosen, reducedMotion: false, viewportHeight: 800, phoneDefault: "list" }).effective).toBe("immersive")
  })

  it("un choix explicite l'emporte, y compris l'Immersion malgré la réduction des mouvements", () => {
    const stored = withStoredFeedMode({}, "phone", "immersive")
    expect(resolveFeedMode({ pose: "phone", stored, reducedMotion: true, viewportHeight: 800 })).toEqual({ preferred: "immersive", effective: "immersive", fallback: null, explicit: true })
    const desktop = withStoredFeedMode({}, "desktop", "immersive")
    expect(resolveFeedMode({ pose: "desktop", stored: desktop, reducedMotion: false, viewportHeight: 900 }).effective).toBe("immersive")
  })

  it("un écran trop bas retombe sur la Liste sans effacer le choix (paysage, zoom 200 %)", () => {
    const low = resolveFeedMode({ pose: "phone", stored: {}, reducedMotion: false, viewportHeight: IMMERSIVE_MIN_VIEWPORT_HEIGHT - 1 })
    expect(low).toEqual({ preferred: "immersive", effective: "list", fallback: "lowHeight", explicit: false })
    const enough = resolveFeedMode({ pose: "phone", stored: {}, reducedMotion: false, viewportHeight: IMMERSIVE_MIN_VIEWPORT_HEIGHT })
    expect(enough.effective).toBe("immersive")
    // Hauteur inconnue : aucune retombée inventée.
    expect(resolveFeedMode({ pose: "phone", stored: {}, reducedMotion: false, viewportHeight: null }).fallback).toBeNull()
    // Une Liste choisie n'a pas de retombée.
    expect(resolveFeedMode({ pose: "phone", stored: { phone: "list" }, reducedMotion: false, viewportHeight: 300 }).fallback).toBeNull()
  })
})

describe("stockage par réseau", () => {
  it("la clé vit sous le préfixe du réseau", () => {
    expect(feedModeStorageKey("antsia:antsia:")).toBe(`antsia:antsia:${FEED_MODE_STORAGE_SUFFIX}`)
    expect(feedModeStorageKey("antsia:diaspora:")).not.toBe(feedModeStorageKey("antsia:antsia:"))
  })

  it("relit la forme stockée sans jamais lever, et ignore toute valeur inconnue", () => {
    expect(parseStoredFeedModes(null)).toEqual({})
    expect(parseStoredFeedModes("pas du json")).toEqual({})
    expect(parseStoredFeedModes("[]")).toEqual({})
    expect(parseStoredFeedModes('{"phone":"pager","desktop":"list"}')).toEqual({ desktop: "list" })
    expect(parseStoredFeedModes("x".repeat(300))).toEqual({})
    const modes = withStoredFeedMode(withStoredFeedMode({}, "phone", "list"), "desktop", "immersive")
    expect(parseStoredFeedModes(serializeStoredFeedModes(modes))).toEqual({ phone: "list", desktop: "immersive" })
  })

  it("un choix identique garde la même référence (abonnement stable)", () => {
    const modes = withStoredFeedMode({}, "phone", "list")
    expect(withStoredFeedMode(modes, "phone", "list")).toBe(modes)
  })

  it("la porte de déconnexion purge le mode mémorisé avec l'état personnel du moteur", () => {
    const storage = createMemoryStorage()
    storage.setItem(feedModeStorageKey("antsia:antsia:"), serializeStoredFeedModes({ phone: "list" }))
    storage.setItem("antsia:antsia:appearance", "dark")
    storage.setItem("autre-produit:clé", "garde")
    const purged = personalStateKeys(storage)
    expect(purged).toContain(feedModeStorageKey("antsia:antsia:"))
    // Le choix d'apparence et les clés d'autres produits restent.
    expect(purged).not.toContain("antsia:antsia:appearance")
    expect(purged).not.toContain("autre-produit:clé")
  })
})
