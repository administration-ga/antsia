#!/usr/bin/env bun
/** P17d : lecture bornée des trois manifestes seulement ; aucun contrôle ou fournisseur lancé. */
import { open } from "node:fs/promises"
import { evaluateNativeAcceptance } from "../packages/social-native/src/native-acceptance.ts"

const root = new URL("../docs/recette/antsia-native-p17d/", import.meta.url)
const maximumBytes = 1024 * 1024
async function readManifest(name) {
  // Noms constants et dossier fixe : aucun chemin ou URL fourni par l'appelant.
  const file = await open(new URL(name, root), "r")
  try {
    const bytes = Buffer.alloc(maximumBytes + 1)
    let length = 0
    while (length < bytes.byteLength) {
      const result = await file.read(bytes, length, bytes.byteLength - length, length)
      if (result.bytesRead === 0) break
      length += result.bytesRead
    }
    if (length > maximumBytes) throw new Error("manifest_too_large")
    return JSON.parse(bytes.subarray(0, length).toString("utf8"))
  } finally { await file.close() }
}
async function main() {
  if (process.argv.slice(2).some(argument => argument !== "--json") || process.argv.slice(2).length > 1) throw new Error("unsupported_arguments")
  const [candidate, protocol, evidence] = await Promise.all([readManifest("candidate.json"), readManifest("protocol.json"), readManifest("evidence.json")])
  const report = evaluateNativeAcceptance({ candidate, protocol, evidence }, Date.now())
  if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  else {
    const lines = [
      `ANTSIA P17d : ${report.decision}`,
      `Manifestes conformes : ${report.valid ? "oui" : "non"}`,
      `Preuves physiques actuelles déclarées : ${report.coverage.passed}/${report.coverage.required}`,
      `Non exécutés : ${report.coverage.notRun} ; bloqués : ${report.coverage.blocked} ; différés : ${report.coverage.deferred} ; historiques : ${report.coverage.historical}`,
      "Lecture des manifestes seulement : aucun artefact, appareil, build ou fournisseur vérifié.",
      "Acceptation physique : non. Distribution : non attestée. Activation : fermée.",
      ...report.issues.map(issue => `${issue.code} (${issue.path})`),
    ]
    process.stdout.write(`${lines.join("\n")}\n`)
  }
  // Même complet, ce registre demande une revue humaine ; il ne donne jamais un feu vert automatique.
  process.exitCode = report.decision === "review_required" ? 2 : 1
}
main().catch(() => {
  // Ne jamais reproduire le contenu d'un JSON fautif, un chemin privé ou une exception brute.
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, valid: false, decision: "blocked", error: "manifest_read_or_parse_failed", physicalAccepted: false, distributionAccepted: false, activationAllowed: false })}\n`)
  process.exitCode = 1
})
