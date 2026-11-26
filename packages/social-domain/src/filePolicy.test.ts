// Dupliqué de socle/convex/modules/fileGuard/policy.test.ts @ ad2e7fdc2 — adaptations : cas fail-open INVERSÉS (aucune ligne = retenu) ; libellés retirés ; interrupteurs d'environnement testés côté backend.
import { describe, expect, it } from "vitest"

import {
  FILE_GUARD_MAX_INSPECT_BYTES,
  FILE_GUARD_UNAVAILABLE_BASE_DELAY_MS,
  FILE_GUARD_UNAVAILABLE_MAX_DELAY_MS,
  FILE_GUARD_UNAVAILABLE_WINDOW_MS,
  GENERATED_BLOB_SKIP_REASON,
  isReleasableStatus,
  isServableStatus,
  isUnanalyzedUpload,
  isWithinInspectCeiling,
  providerUnavailableRetryDelayMs,
  serviceStateOf,
} from "./filePolicy"

describe("filePolicy — servabilité (fail-closed)", () => {
  it("un fichier sans ligne d'analyse est RETENU, comme une analyse en cours", () => {
    expect(isServableStatus(null)).toBe(false)
    expect(isServableStatus(undefined)).toBe(false)
    expect(serviceStateOf(null)).toBe("pending")
    expect(serviceStateOf(undefined)).toBe("pending")
  })

  it("une analyse en cours bloque l'URL sans condamner le fichier", () => {
    for (const status of ["pending", "running"] as const) {
      expect(isServableStatus(status)).toBe(false)
      expect(serviceStateOf(status)).toBe("pending")
    }
  })

  it("sain et sauté sont servables ; suspect, infecté et en échec sont bloqués", () => {
    expect(isServableStatus("clean")).toBe(true)
    expect(isServableStatus("skipped")).toBe(true)
    for (const status of ["suspicious", "infected", "error"] as const) {
      expect(isServableStatus(status)).toBe(false)
      expect(serviceStateOf(status)).toBe("blocked")
    }
  })

  it("seuls suspect et en échec se libèrent à la main — jamais infecté", () => {
    expect(isReleasableStatus("suspicious")).toBe(true)
    expect(isReleasableStatus("error")).toBe(true)
    expect(isReleasableStatus("infected")).toBe(false)
    expect(isReleasableStatus("clean")).toBe(false)
    expect(isReleasableStatus("pending")).toBe(false)
  })
})

describe("filePolicy — EX-17, rien n'est servi sans analyse", () => {
  it("le plafond d'analyse vaut 60 Mio, borne comprise", () => {
    expect(FILE_GUARD_MAX_INSPECT_BYTES).toBe(60 * 1024 * 1024)
    expect(isWithinInspectCeiling(FILE_GUARD_MAX_INSPECT_BYTES)).toBe(true)
    expect(isWithinInspectCeiling(FILE_GUARD_MAX_INSPECT_BYTES + 1)).toBe(false)
    expect(isWithinInspectCeiling(70 * 1024 * 1024)).toBe(false)
  })

  it("un dépôt sauté sans analyse n'est pas servable ; un fichier produit par la plateforme l'est", () => {
    expect(isUnanalyzedUpload({ status: "skipped", skipReason: "too_large" })).toBe(true)
    expect(isUnanalyzedUpload({ status: "skipped" })).toBe(true)
    expect(isUnanalyzedUpload({ status: "skipped", skipReason: null })).toBe(true)
    expect(isUnanalyzedUpload({ status: "skipped", skipReason: GENERATED_BLOB_SKIP_REASON })).toBe(false)
    for (const status of ["pending", "running", "clean", "suspicious", "infected", "error"] as const) expect(isUnanalyzedUpload({ status, skipReason: "too_large" })).toBe(false)
  })
})

describe("filePolicy — M1, un antivirus indisponible n'est pas un verdict : reprises lentes sur 24 h", () => {
  it("le délai double de 30 s à une heure, à gigue égale (moitié fixe, moitié tirée)", () => {
    expect(FILE_GUARD_UNAVAILABLE_BASE_DELAY_MS).toBe(30_000)
    expect(FILE_GUARD_UNAVAILABLE_MAX_DELAY_MS).toBe(60 * 60_000)
    const low = (retry: number) => providerUnavailableRetryDelayMs({ retry, elapsedMs: 0, random: 0 })
    const high = (retry: number) => providerUnavailableRetryDelayMs({ retry, elapsedMs: 0, random: 1 })
    expect([1, 2, 3, 4].map(low)).toEqual([15_000, 30_000, 60_000, 120_000])
    expect([1, 2, 3, 4].map(high)).toEqual([30_000, 60_000, 120_000, 240_000])
    // Plafond : jamais plus d'une heure entre deux reprises, même après des dizaines d'essais.
    for (const retry of [8, 9, 30, 1000]) {
      expect(low(retry)).toBe(30 * 60_000)
      expect(high(retry)).toBe(60 * 60_000)
    }
  })

  it("des analyses parties ensemble ne reviennent pas ensemble", () => {
    const delays = [0.1, 0.4, 0.7, 0.9].map((random) => providerUnavailableRetryDelayMs({ retry: 3, elapsedMs: 0, random }))
    expect(new Set(delays).size).toBe(4)
  })

  it("la fenêtre de 24 h borne tout : la dernière reprise tombe à l'échéance, puis plus rien", () => {
    expect(FILE_GUARD_UNAVAILABLE_WINDOW_MS).toBe(24 * 60 * 60_000)
    expect(providerUnavailableRetryDelayMs({ retry: 20, elapsedMs: FILE_GUARD_UNAVAILABLE_WINDOW_MS - 1000, random: 0.5 })).toBe(1000)
    expect(providerUnavailableRetryDelayMs({ retry: 20, elapsedMs: FILE_GUARD_UNAVAILABLE_WINDOW_MS, random: 0.5 })).toBeNull()
    expect(providerUnavailableRetryDelayMs({ retry: 1, elapsedMs: FILE_GUARD_UNAVAILABLE_WINDOW_MS + 1, random: 0 })).toBeNull()
  })

  it("une entrée hors contrat reste bornée (reprise 0 ou négative, hasard invalide)", () => {
    expect(providerUnavailableRetryDelayMs({ retry: 0, elapsedMs: -5, random: Number.NaN })).toBe(22_500)
    expect(providerUnavailableRetryDelayMs({ retry: -3, elapsedMs: 0, random: 2 })).toBe(30_000)
  })
})
