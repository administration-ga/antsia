// Dupliqué de socle/convex/modules/fileGuard/verdict.test.ts @ ad2e7fdc2 — adaptations : EX-17, un antivirus « sauté » donne `error` (le socle le disait sain) ; M1, un antivirus INDISPONIBLE n'est pas un verdict (`AV_UNAVAILABLE:`, reprise lente).
import { describe, expect, it } from "vitest"
import { decideVerdict, isProviderOutageReason } from "./verdict"

describe("fileGuard/verdict — la règle déterministe tranche, jamais le modèle", () => {
  it("un antivirus positif l'emporte sur tout", () => {
    const v = decideVerdict({
      findings: [],
      av: { provider: "clamav-rest", verdict: "infected", signature: "Win.Test.EICAR" },
    })
    expect(v.status).toBe("infected")
    expect(v.reason).toBe("AV_INFECTED:Win.Test.EICAR")
  })

  it("un signal critique infecte, même avec un antivirus sain", () => {
    const v = decideVerdict({
      findings: [
        { code: "PDF_JAVASCRIPT", severity: "warning" },
        { code: "OOXML_MACROS", severity: "critical" },
      ],
      av: { provider: "mock", verdict: "clean" },
    })
    expect(v.status).toBe("infected")
    expect(v.reason).toBe("OOXML_MACROS")
  })

  it("un signal d'avertissement rend suspect (bloqué, libérable)", () => {
    const v = decideVerdict({
      findings: [
        { code: "MIME_MISMATCH", severity: "warning" },
        { code: "PDF_XFA_FORM", severity: "info" },
        { code: "MIME_MISMATCH", severity: "warning" },
      ],
      av: { provider: "mock", verdict: "clean" },
    })
    expect(v.status).toBe("suspicious")
    expect(v.reason).toBe("MIME_MISMATCH")
  })

  it("un antivirus en panne sans autre signal n'est pas « sain » : erreur, fail-closed", () => {
    const v = decideVerdict({
      findings: [{ code: "PDF_OPEN_ACTION", severity: "info" }],
      av: { provider: "clamav-rest", verdict: "error", detail: "HTTP 503" },
    })
    expect(v.status).toBe("error")
    expect(v.reason).toBe("AV_ERROR:HTTP 503")
  })

  it("aucun signal, antivirus sain : sain", () => {
    expect(decideVerdict({ findings: [], av: { provider: "mock", verdict: "clean" } }).status).toBe("clean")
    expect(decideVerdict({ findings: [{ code: "PDF_NO_EOF", severity: "info" }], av: null }).status).toBe("clean")
  })

  it("EX-17 — un fichier que l'antivirus a SAUTÉ n'est pas sain : erreur, fail-closed", () => {
    const v = decideVerdict({ findings: [], av: { provider: "clamav-rest", verdict: "skipped", detail: "too_large" } })
    expect(v).toEqual({ status: "error", reason: "AV_SKIPPED:too_large" })
    // Un signal plus grave l'emporte toujours.
    expect(decideVerdict({ findings: [{ code: "MIME_MISMATCH", severity: "warning" }], av: { provider: "clamav-rest", verdict: "skipped" } }).status).toBe("suspicious")
  })

  it("M1 — un antivirus INDISPONIBLE n'est pas un verdict : motif distinct, reprise lente, toujours retenu", () => {
    const v = decideVerdict({ findings: [], av: { provider: "clamav-rest", verdict: "error", detail: "HTTP 503 queue_full", unavailable: true } })
    expect(v).toEqual({ status: "error", reason: "AV_UNAVAILABLE:HTTP 503 queue_full", providerUnavailable: true })
    // Un verdict d'erreur du moteur (clamd) reste un verdict : il entame les tentatives.
    expect(decideVerdict({ findings: [], av: { provider: "clamav-rest", verdict: "error" } })).toEqual({ status: "error", reason: "AV_ERROR:clamav-rest" })
  })

  it("M1 — l'inspection tranche sans l'antivirus : un signal critique ou d'avertissement l'emporte sur l'indisponibilité", () => {
    const unavailable = { provider: "clamav-rest", verdict: "error" as const, detail: "transport", unavailable: true }
    expect(decideVerdict({ findings: [{ code: "OOXML_MACROS", severity: "critical" }], av: unavailable })).toEqual({ status: "infected", reason: "OOXML_MACROS" })
    expect(decideVerdict({ findings: [{ code: "MIME_MISMATCH", severity: "warning" }], av: unavailable })).toEqual({ status: "suspicious", reason: "MIME_MISMATCH" })
  })

  it("M1 — seules les pannes du fournisseur sont reconnues comme telles par la réparation d'après panne", () => {
    for (const reason of [
      "AV_UNAVAILABLE:HTTP 503 queue_full", "AV_UNAVAILABLE:timeout", "AV_UNAVAILABLE:fetch failed",
      "AV_ERROR:HTTP 500", "AV_ERROR:HTTP 502", "AV_ERROR:HTTP 503", "AV_ERROR:HTTP 504", "AV_ERROR:HTTP 429",
      "AV_ERROR:fetch failed", "AV_ERROR:This operation was aborted", "AV_ERROR:The operation was aborted",
    ]) expect(isProviderOutageReason(reason), reason).toBe(true)
    for (const reason of [
      undefined, "", "OK", "AV_ERROR:provider_unconfigured", "AV_ERROR:provider_incomplete", "AV_ERROR:clamav-rest",
      "AV_ERROR:HTTP 400", "AV_ERROR:HTTP 401", "AV_ERROR:HTTP 413", "AV_ERROR:HTTP 5000", "AV_INFECTED:Synthetic.Test",
      "AV_SKIPPED:too_large", "STALE_JOB", "BLOB_MISSING", "MIME_MISMATCH", "FEDERATED_FULL_SCAN_REQUIRED",
    ]) expect(isProviderOutageReason(reason), String(reason)).toBe(false)
  })
})
