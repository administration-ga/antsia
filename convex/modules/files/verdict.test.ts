// Dupliqué de socle/convex/modules/fileGuard/verdict.test.ts @ ad2e7fdc2 — adaptations : EX-17, un antivirus « sauté » donne `error` (le socle le disait sain).
import { describe, expect, it } from "vitest"
import { decideVerdict } from "./verdict"

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
})
