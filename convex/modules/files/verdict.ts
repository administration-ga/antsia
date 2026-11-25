// Dupliqué de socle/convex/modules/fileGuard/verdict.ts @ ad2e7fdc2 — adaptations : `Finding` vient de `./policy`, qui le réexporte du domaine ; EX-17 : un antivirus qui SAUTE le fichier (au-delà de son propre plafond, `FILE_SCAN_MAX_BYTES`) ne rend pas un verdict sain — `error`, fail-closed, comme un antivirus en panne ; M1 (25/11/2026) : un antivirus INDISPONIBLE (transport, 5xx, 429, file pleine) rend `error` motivé `AV_UNAVAILABLE:` et marqué `providerUnavailable` (reprise lente, sans entamer les tentatives) ; `isProviderOutageReason` reconnaît les pannes pour la réparation d'après panne.
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
 *      M1 : un antivirus INDISPONIBLE (il n'a pas pu juger) rend aussi
 *      `error`, mais motivé `AV_UNAVAILABLE:` et marqué
 *      `providerUnavailable` : l'analyse est reprise plus tard sans entamer
 *      les tentatives de verdict, et le fichier reste retenu en attendant.
 *   4. sinon                                            → `clean`
 */
import { AV_UNAVAILABLE_REASON_PREFIX, type Finding } from "./policy"

export type AvVerdict = "clean" | "infected" | "error" | "skipped"

export interface AvResult {
  provider: string
  verdict: AvVerdict
  signature?: string
  durationMs?: number
  detail?: string
  /**
   * Le fournisseur n'a PAS pu juger (transport, délai, HTTP 5xx ou 429, file
   * pleine de la façade) : ce n'est pas un verdict sur le fichier. Avec
   * `verdict: "error"` seulement ; jamais posé pour un refus du fournisseur
   * (4xx) ni pour une erreur de clamd, qui restent des verdicts.
   */
  unavailable?: boolean
}

export type VerdictStatus = "clean" | "suspicious" | "infected" | "error"

export interface Verdict {
  status: VerdictStatus
  /** Motif court, lisible par un DSI : codes des signaux, signature AV. */
  reason: string
  /** `error` dû à la seule indisponibilité du fournisseur : reprise lente, sans entamer les tentatives. */
  providerUnavailable?: true
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
  if (av?.verdict === "error" && av.unavailable === true) {
    return { status: "error", reason: `${AV_UNAVAILABLE_REASON_PREFIX}${av.detail ?? av.provider}`, providerUnavailable: true }
  }
  if (av?.verdict === "error") {
    return { status: "error", reason: `AV_ERROR:${av.detail ?? av.provider}` }
  }
  if (av?.verdict === "skipped") {
    return { status: "error", reason: `AV_SKIPPED:${av.detail ?? av.provider}` }
  }
  return { status: "clean", reason: "OK" }
}

/**
 * Coupures connues du transport avant M1, quand le motif d'un verdict d'erreur
 * portait le message brut du `fetch` de Node (undici) : réseau, délai.
 */
const LEGACY_TRANSPORT_DETAILS = new Set(["fetch failed", "This operation was aborted", "The operation was aborted"])

/**
 * Le motif d'une analyse figée `error` dit-il une PANNE du fournisseur, et
 * non un jugement du fichier ? `AV_UNAVAILABLE:…` (fenêtre de 24 h épuisée),
 * ou, pour les lignes d'avant M1, `AV_ERROR:HTTP 5xx`, `AV_ERROR:HTTP 429` et
 * les coupures du transport. Jamais un fournisseur non configuré (sa réparation
 * est `requeueUnconfiguredScans`), un refus 4xx, une erreur de clamd, un saut
 * ou un signal de l'inspection.
 */
export function isProviderOutageReason(reason: string | null | undefined): boolean {
  if (!reason) return false
  if (reason.startsWith(AV_UNAVAILABLE_REASON_PREFIX)) return reason.length > AV_UNAVAILABLE_REASON_PREFIX.length
  if (!reason.startsWith("AV_ERROR:")) return false
  const detail = reason.slice("AV_ERROR:".length)
  return /^HTTP (5\d\d|429)$/.test(detail) || LEGACY_TRANSPORT_DETAILS.has(detail)
}

function codesOf(findings: readonly Finding[]): string {
  return Array.from(new Set(findings.map((f) => f.code))).join(",")
}
