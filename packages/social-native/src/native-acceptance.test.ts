import { describe, expect, it } from "vitest"
import {
  evaluateNativeAcceptance, isNativeEvidenceReference, NATIVE_ACCEPTANCE_CONTRACT,
  NATIVE_ACCEPTANCE_OBSERVATION_CASES, NATIVE_ACCEPTANCE_PLATFORMS,
  NATIVE_ACCEPTANCE_REQUIRED_CASES, NATIVE_ACCEPTANCE_SCENARIOS,
  type AcceptanceRecord, type AcceptanceScenario, type NativeAcceptanceCandidate,
  type NativeAcceptanceEvidence, type NativeAcceptanceProtocol,
} from "./native-acceptance"

/** Jeux synthétiques d'évaluation uniquement : aucune observation/appareil réel attesté. */
const NOW = Date.UTC(2026, 9, 20, 12)
const at = (offset: number) => new Date(NOW + offset).toISOString()
const SHA = "a".repeat(64)
function manifests() {
  const candidate: NativeAcceptanceCandidate = {
    schemaVersion: 1, contract: NATIVE_ACCEPTANCE_CONTRACT, id: "fixture-candidate",
    source: { head: "c4d36f3", snapshotSha256: SHA, frozen: true, dirty: false, capturedAt: at(-60_000) },
    builds: NATIVE_ACCEPTANCE_PLATFORMS.map(platform => ({ id: `build-${platform}`, platform, kind: "development", sourceHead: "c4d36f3", sourceSnapshotSha256: SHA, version: "0.0.1", buildNumber: "1", artifactId: `binary-${platform}`, createdAt: at(-50_000) })),
    devices: NATIVE_ACCEPTANCE_PLATFORMS.map(platform => ({ id: `device-${platform}`, platform, hardware: "physical", model: "Synthetic device", osVersion: platform === "ios" ? "16.4" : "14", googleServices: platform === "android" ? true : null, registeredAt: at(-70_000) })),
  }
  const protocol: NativeAcceptanceProtocol = { schemaVersion: 1, contract: NATIVE_ACCEPTANCE_CONTRACT, minimumOs: { ios: "16.4", android: "14" }, requiredCases: [...NATIVE_ACCEPTANCE_REQUIRED_CASES], observationCases: [...NATIVE_ACCEPTANCE_OBSERVATION_CASES], forceStopIsReadiness: false, evidenceVerification: "manifest_only" }
  const evidence: NativeAcceptanceEvidence = {
    schemaVersion: 1, contract: NATIVE_ACCEPTANCE_CONTRACT,
    artifacts: [
      ...NATIVE_ACCEPTANCE_PLATFORMS.map(platform => ({ id: `binary-${platform}`, ref: `artifacts/build-${platform}.${platform === "ios" ? "ipa" : "apk"}`, sha256: SHA, kind: "build_artifact" as const, recordedAt: at(-50_000), privacy: "sanitized_no_personal_data" as const })),
      { id: "proof-fixture", ref: "artifacts/synthetic-proof.json", sha256: SHA, kind: "measurement", recordedAt: at(-20_000), privacy: "sanitized_no_personal_data" },
    ],
    records: [], cases: [...NATIVE_ACCEPTANCE_REQUIRED_CASES, ...NATIVE_ACCEPTANCE_OBSERVATION_CASES].map(caseId => ({ caseId, status: "NOT_RUN", reason: null, recordIds: [] })),
  }
  return { candidate, protocol, evidence }
}
function pass(input: ReturnType<typeof manifests>, caseId: string, level: AcceptanceRecord["level"] = "physical") {
  const platform = caseId.endsWith(":ios") ? "ios" : "android", peer = platform === "ios" ? "android" : "ios"
  const scenario = caseId.split(":")[0] as AcceptanceScenario
  const record: AcceptanceRecord = {
    id: `record-${input.evidence.records.length}`, candidateId: input.candidate.id, caseId, level, status: "PASS", sourceHead: "c4d36f3", sourceSnapshotSha256: SHA,
    buildId: `build-${platform}`, peerBuildId: `build-${peer}`, deviceId: `device-${platform}`, peerDeviceId: `device-${peer}`,
    observedAt: at(-30_000), network: { local: "transition", peer: "wifi" }, participantsConsented: true, privateIdentifiersRecorded: false,
    checks: [...NATIVE_ACCEPTANCE_SCENARIOS[scenario]], artifactIds: ["proof-fixture"], measurements: { pushToRingMs: 1000, answerToMediaMs: 500, teardownMs: 200 },
  }
  input.evidence.records.push(record)
  const row = input.evidence.cases.find(item => item.caseId === caseId)!
  row.status = "PASS"; row.recordIds = [record.id]
  return record
}
function complete() { const input = manifests(); for (const caseId of NATIVE_ACCEPTANCE_REQUIRED_CASES) pass(input, caseId); return input }

describe("registre P17d fermé", () => {
  it("le candidat livré non gelé et sans build/appareil ne prétend à aucune recette", () => {
    const input = manifests()
    input.candidate.source = { head: "c4d36f3", snapshotSha256: null, dirty: true, frozen: false, capturedAt: null }
    input.candidate.builds = []; input.candidate.devices = []; input.evidence.artifacts = []
    const report = evaluateNativeAcceptance(input, NOW)
    expect(report).toMatchObject({ valid: true, decision: "blocked", physicalAccepted: false, activationAllowed: false, currentPhysicalEvidenceComplete: false })
    expect(report.coverage).toMatchObject({ required: 46, notRun: 46, passed: 0 })
    expect(report.stages.physical).toBe("NOT_RUN")
  })
  it.each(["source", "local_build", "simulator", "distribution"] as const)("%s ne remplace pas un appareil physique", level => {
    const input = manifests(); pass(input, "audio_bidirectional:ios", level)
    const report = evaluateNativeAcceptance(input, NOW)
    expect(report.coverage.passed).toBe(0)
    expect(report.currentPhysicalEvidenceComplete).toBe(false)
    expect(report.physicalAccepted).toBe(false)
  })
  it("même une matrice déclarée complète exige revue ; aucun feu vert de distribution ou activation", () => {
    const report = evaluateNativeAcceptance(complete(), NOW)
    expect(report).toMatchObject({ valid: true, decision: "review_required", currentPhysicalEvidenceComplete: true, physicalAccepted: false, distributionAccepted: false, activationAllowed: false, evidenceVerification: "manifest_only" })
    expect(report.coverage.passed).toBe(46)
  })
  it("une autre source/candidature reste historique", () => {
    const input = manifests(); const row = pass(input, "audio_bidirectional:ios")
    row.candidateId = "historical-candidate"; row.sourceSnapshotSha256 = "b".repeat(64)
    const report = evaluateNativeAcceptance(input, NOW)
    expect(report.coverage).toMatchObject({ passed: 0, historical: 1 })
    expect(report.cases.find(item => item.caseId === row.caseId)?.assessment).toBe("historical")
  })
  it("les deux OS et les deux builds exacts sont nécessaires au média réciproque", () => {
    const input = complete(); input.candidate.devices.find(row => row.platform === "android")!.osVersion = "13"
    expect(evaluateNativeAcceptance(input, NOW).currentPhysicalEvidenceComplete).toBe(false)
    input.candidate.devices.find(row => row.platform === "android")!.osVersion = "14"
    input.evidence.records[0]!.peerBuildId = null
    expect(evaluateNativeAcceptance(input, NOW).coverage.passed).toBe(45)
  })
  it("aucune validation d'une source sale, de consentement absent ou de mesure manquante", () => {
    const input = complete(); input.candidate.source.dirty = true
    expect(evaluateNativeAcceptance(input, NOW).currentPhysicalEvidenceComplete).toBe(false)
    input.candidate.source.dirty = false
    input.evidence.records[0]!.participantsConsented = false
    input.evidence.records[1]!.measurements.answerToMediaMs = null
    expect(evaluateNativeAcceptance(input, NOW).coverage.passed).toBe(44)
  })
  it("les contrôles explicites et l'OS réellement physique sont obligatoires", () => {
    const input = complete(); input.evidence.records[0]!.checks = []
    expect(evaluateNativeAcceptance(input, NOW).coverage.passed).toBe(45)
    input.candidate.devices[0]!.hardware = "simulator"
    expect(evaluateNativeAcceptance(input, NOW).currentPhysicalEvidenceComplete).toBe(false)
  })
  it("arrêt forcé observé : jamais un cas de readiness, même si le reste est complet", () => {
    const input = complete()
    const base: AcceptanceRecord = { ...input.evidence.records[0]!, id: "force-observation", caseId: "force_stop_observation:ios", status: "OBSERVED" as const, checks: ["force_stop_observed", "no_wake_guarantee"] }
    input.evidence.records.push(base)
    const row = input.evidence.cases.find(item => item.caseId === base.caseId)!
    row.status = "OBSERVED"; row.recordIds = [base.id]
    const report = evaluateNativeAcceptance(input, NOW)
    expect(report.coverage).toMatchObject({ required: 46, passed: 46, observations: 1 })
    expect(report.physicalAccepted).toBe(false)
    row.status = "PASS"; base.status = "PASS"
    expect(evaluateNativeAcceptance(input, NOW).currentPhysicalEvidenceComplete).toBe(false)
  })
  it("refuse la suppression d'un cas, les doublons et un protocole abaissé", () => {
    const input = manifests(); input.protocol.requiredCases.pop()
    expect(evaluateNativeAcceptance(input, NOW)).toMatchObject({ valid: false, decision: "blocked" })
    const next = manifests(); next.evidence.cases[1] = next.evidence.cases[0]!
    expect(evaluateNativeAcceptance(next, NOW).valid).toBe(false)
  })
  it.each(["https://example.test/proof.png", "/private/proof.json", "artifacts/../secret.json", "artifacts/session.mp4", "artifacts/a%2fb.json", "artifacts/a.json?token=x"])("référence fermée : refuse %s", value => {
    expect(isNativeEvidenceReference(value)).toBe(false)
  })
  it("champ privé ou inconnu rejeté sans le reproduire dans le rapport", () => {
    const input = manifests(), poisoned = { ...input.candidate, sessionToken: "do-not-print" }
    const report = evaluateNativeAcceptance({ ...input, candidate: poisoned }, NOW)
    expect(report.valid).toBe(false)
    expect(JSON.stringify(report)).not.toContain("do-not-print")
  })
  it("date future, pièce absente ou PASS sans reçu ne passent pas", () => {
    const input = complete(); input.evidence.records[0]!.observedAt = at(1000)
    expect(evaluateNativeAcceptance(input, NOW).currentPhysicalEvidenceComplete).toBe(false)
    const other = complete(); other.evidence.records[0]!.artifactIds = ["missing-artifact"]
    expect(evaluateNativeAcceptance(other, NOW).currentPhysicalEvidenceComplete).toBe(false)
    const empty = manifests(); empty.evidence.cases[0]!.status = "PASS"
    expect(evaluateNativeAcceptance(empty, NOW).valid).toBe(false)
  })
  it("distingue explicitement les cas différés d'une réussite", () => {
    const input = manifests()
    for (const row of input.evidence.cases) if (NATIVE_ACCEPTANCE_REQUIRED_CASES.includes(row.caseId)) { row.status = "DEFERRED"; row.reason = "checks_deferred" }
    expect(evaluateNativeAcceptance(input, NOW)).toMatchObject({ decision: "deferred", currentPhysicalEvidenceComplete: false, coverage: { deferred: 46, passed: 0 } })
  })
})
