// Dupliqué de socle/convex/modules/fileGuard/verdict.ts @ ad2e7fdc2 — adaptations : `Finding` vient de `./policy`, qui le réexporte du domaine ; EX-17 : un antivirus qui SAUTE le fichier (au-delà de son propre plafond, `FILE_SCAN_MAX_BYTES`) ne rend pas un verdict sain — `error`, fail-closed, comme un antivirus en panne.
/**
 * Sentinelle fichiers — le VERDICT, règle pure (ADR-0160, D4).
 *
 * Trois couches nourrissent la décision : l'inspection déterministe
 * (`inspect.ts`), l'antivirus (`avProviders.ts`) et, en dernier, le triage IA
 * (`triageModel.ts`). Seules les deux premières DÉCIDENT. Le triage explique,
 * recommande, et ne modifie jamais un statut : un modèle qui aurait le
 * dernier mot sur un fichier infecté serait une faille, pas une aide.
 *
 * Ordre, du plus grave au plus bénin :
 *   1. antivirus `infected`, ou un signal `critical`   → `infected`
 *   2. un signal `warning`                              → `suspicious`
 *   3. antivirus `error` ou `skipped` sans autre signal → `error`
 *      (fail-closed : bloqué, RE-tenté par le sweeper, libérable par un
 *      humain — un moteur en panne ne rend pas un fichier sain, et un
 *      fichier que l'antivirus n'a pas lu non plus : EX-17)
 *   4. sinon                                            → `clean`
 */
import type { Finding } from "./policy"

export type AvVerdict = "clean" | "infected" | "error" | "skipped"

export interface AvResult {
  provider: string
  verdict: AvVerdict
  signature?: string
  durationMs?: number
  detail?: string
}

export type VerdictStatus = "clean" | "suspicious" | "infected" | "error"

export interface Verdict {
  status: VerdictStatus
  /** Motif court, lisible par un DSI : codes des signaux, signature AV. */
  reason: string
}

export function decideVerdict(input: {
  findings: readonly Finding[]
  av: AvResult | null
}): Verdict {
  const { findings, av } = input
  if (av?.verdict === "infected") {
    return {
      status: "infected",
      reason: `AV_INFECTED:${av.signature ?? av.provider}`,
    }
  }
  const critical = findings.filter((f) => f.severity === "critical")
  if (critical.length > 0) {
    return { status: "infected", reason: codesOf(critical) }
  }
  const warnings = findings.filter((f) => f.severity === "warning")
  if (warnings.length > 0) {
    return { status: "suspicious", reason: codesOf(warnings) }
  }
  if (av?.verdict === "error") {
    return { status: "error", reason: `AV_ERROR:${av.detail ?? av.provider}` }
  }
  if (av?.verdict === "skipped") {
    return { status: "error", reason: `AV_SKIPPED:${av.detail ?? av.provider}` }
  }
  return { status: "clean", reason: "OK" }
}

function codesOf(findings: readonly Finding[]): string {
  return Array.from(new Set(findings.map((f) => f.code))).join(",")
}
