// @vitest-environment jsdom
import { personalStateKeys } from "@antsia/api/sign-out-everywhere"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { directReceptionStorageKey } from "../features/direct/direct-reception"
import { directReceptionStore } from "./direct-reception-store"

const PREFIX = "antsia:antsia:"

beforeEach(() => { window.localStorage.clear(); directReceptionStore.__resetForTests() })
afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); directReceptionStore.__resetForTests() })

describe("DL-04 — choix de réception retenu sur l'appareil", () => {
  it("est écrit sous le préfixe du réseau, relu après rechargement et purgé à la déconnexion", () => {
    directReceptionStore.setPreference(PREFIX, { mode: "audio" })
    expect(window.localStorage.getItem(directReceptionStorageKey(PREFIX))).toBe(JSON.stringify({ mode: "audio", quality: "auto" }))
    // « Rechargement » : la mémoire de module repart de zéro, le stockage reste.
    directReceptionStore.__resetForTests()
    expect(directReceptionStore.getPreference(PREFIX)).toEqual({ mode: "audio", quality: "auto" })
    expect(directReceptionStore.getPreference("antsia:diasporale:")).toEqual({ mode: "video", quality: "auto" })
    expect(personalStateKeys(window.localStorage)).toContain(directReceptionStorageKey(PREFIX))
  })
  it("stockage refusé (navigation privée) : la page marche, le choix tient pour l'onglet", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("refusé", "SecurityError") })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("refusé", "QuotaExceededError") })
    expect(directReceptionStore.getPreference(PREFIX)).toEqual({ mode: "video", quality: "auto" })
    expect(() => directReceptionStore.setPreference(PREFIX, { quality: "low" })).not.toThrow()
    expect(directReceptionStore.getPreference(PREFIX)).toEqual({ mode: "video", quality: "low" })
  })
})

describe("DL-04 — suggestion « Écouter seulement », une fois par direct", () => {
  it("proposée une fois, refermée, jamais reproposée pour ce direct ; un autre direct a la sienne", () => {
    directReceptionStore.offerHint("session-a")
    expect(directReceptionStore.isHintOffered("session-a")).toBe(true)
    expect(directReceptionStore.isHintOffered("session-b")).toBe(false)
    directReceptionStore.closeHint("session-a")
    directReceptionStore.offerHint("session-a")
    expect(directReceptionStore.isHintOffered("session-a")).toBe(false)
    directReceptionStore.offerHint("session-b")
    expect(directReceptionStore.isHintOffered("session-b")).toBe(true)
    // Proposer ne change jamais le réglage : aucune bascule d'office.
    expect(directReceptionStore.getPreference(PREFIX).mode).toBe("video")
  })
})
