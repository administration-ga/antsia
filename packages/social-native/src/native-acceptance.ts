/** P17d — évaluation pure de déclarations de preuve ; aucune activation ni attestation matérielle. */
export const NATIVE_ACCEPTANCE_CONTRACT = "ANTSIA-NATIVE-ACCEPTANCE-P17D-V1"
export const NATIVE_ACCEPTANCE_PLATFORMS = ["ios", "android"] as const
export type AcceptancePlatform = typeof NATIVE_ACCEPTANCE_PLATFORMS[number]
export const NATIVE_ACCEPTANCE_SCENARIOS = {
  audio_bidirectional: ["human_audio_both_ways", "no_camera_required"],
  video_bidirectional: ["human_audio_both_ways", "human_video_both_ways"],
  locked_incoming: ["system_ring_observed", "authorized_answer", "human_audio_both_ways"],
  background_incoming: ["system_ring_observed", "authorized_answer", "human_audio_both_ways"],
  cold_start_system_terminated: ["system_report_before_js", "authorized_replay", "human_audio_both_ways"],
  bluetooth: ["bluetooth_route_observed", "human_audio_both_ways"],
  cellular_interruption: ["interruption_observed", "authorized_resume", "human_audio_both_ways"],
  wifi_mobile: ["wifi_mobile_transition", "bounded_reconnect", "human_audio_both_ways"],
  network_loss_recovery: ["network_loss_observed", "bounded_reconnect", "authorized_resume"],
  remote_end: ["remote_end_observed", "both_sides_ended", "os_capture_indicators_off"],
  reject: ["reject_observed", "both_sides_ended", "no_media_started"],
  ring_expiry: ["native_deadline_observed", "no_late_media", "os_capture_indicators_off"],
  double_claim: ["one_winner", "loser_closed", "no_second_media"],
  session_revocation: ["revocation_observed", "no_readoption", "os_capture_indicators_off"],
  navigation: ["same_room_retained", "human_audio_both_ways"],
  share: ["authorized_share_target", "same_room_retained"],
  theme: ["same_room_retained", "human_audio_both_ways"],
  media_off: ["tracks_stopped", "os_capture_indicators_off"],
  permissions_denied: ["recoverable_denial", "no_unconsented_capture", "audio_without_camera"],
  dnd_battery: ["dnd_respected", "battery_restriction_recorded", "no_wake_guarantee"],
  feed_parity: ["web_comparison_recorded", "feed_guards_preserved"],
  messages_parity: ["web_comparison_recorded", "messages_guards_preserved"],
  commerce_parity: ["verified_contracts_only", "no_simulated_transaction", "no_cross_backend_client"],
} as const
export type AcceptanceScenario = keyof typeof NATIVE_ACCEPTANCE_SCENARIOS
export const NATIVE_ACCEPTANCE_REQUIRED_CASES: readonly string[] = Object.keys(NATIVE_ACCEPTANCE_SCENARIOS).flatMap(scenario => NATIVE_ACCEPTANCE_PLATFORMS.map(platform => `${scenario}:${platform}`))
export const NATIVE_ACCEPTANCE_OBSERVATION_CASES = ["force_stop_observation:ios", "force_stop_observation:android"] as const
const ALL_CASES = [...NATIVE_ACCEPTANCE_REQUIRED_CASES, ...NATIVE_ACCEPTANCE_OBSERVATION_CASES]
const CHECKS = new Set<string>([...Object.values(NATIVE_ACCEPTANCE_SCENARIOS).flat(), "force_stop_observed", "no_wake_guarantee"])
const LEVELS = ["source", "local_build", "simulator", "physical", "distribution"] as const
export type AcceptanceLevel = typeof LEVELS[number]
const STATUSES = ["NOT_RUN", "PASS", "FAIL", "BLOCKED", "DEFERRED", "OBSERVED"] as const
export type AcceptanceStatus = typeof STATUSES[number]
const REASONS = ["source_not_frozen", "build_missing", "device_missing", "configuration_missing", "owner_action_required", "feature_unavailable", "proof_pending", "checks_deferred"] as const
const NETWORKS = ["wifi", "mobile", "offline", "transition", "not_applicable"] as const
const ARTIFACT_KINDS = ["capture", "sanitized_log", "measurement", "source_manifest", "build_artifact", "distribution_receipt"] as const

type Source = { head: string; snapshotSha256: string | null; frozen: boolean; dirty: boolean; capturedAt: string | null }
export type AcceptanceBuild = { id: string; platform: AcceptancePlatform; kind: "development" | "distribution"; sourceHead: string; sourceSnapshotSha256: string; version: string; buildNumber: string; artifactId: string; createdAt: string }
export type AcceptanceDevice = { id: string; platform: AcceptancePlatform; hardware: "physical" | "simulator"; model: string; osVersion: string; googleServices: boolean | null; registeredAt: string }
export type NativeAcceptanceCandidate = { schemaVersion: 1; contract: typeof NATIVE_ACCEPTANCE_CONTRACT; id: string; source: Source; builds: AcceptanceBuild[]; devices: AcceptanceDevice[] }
export type NativeAcceptanceProtocol = { schemaVersion: 1; contract: typeof NATIVE_ACCEPTANCE_CONTRACT; minimumOs: { ios: "16.4"; android: "14" }; requiredCases: string[]; observationCases: string[]; forceStopIsReadiness: false; evidenceVerification: "manifest_only" }
export type AcceptanceArtifact = { id: string; ref: string; sha256: string; kind: typeof ARTIFACT_KINDS[number]; recordedAt: string; privacy: "sanitized_no_personal_data" }
export type AcceptanceRecord = {
  id: string; candidateId: string; caseId: string; level: AcceptanceLevel; status: "PASS" | "FAIL" | "OBSERVED";
  sourceHead: string; sourceSnapshotSha256: string; buildId: string | null; peerBuildId: string | null; deviceId: string | null; peerDeviceId: string | null;
  observedAt: string; network: { local: typeof NETWORKS[number]; peer: typeof NETWORKS[number] } | null;
  participantsConsented: boolean; privateIdentifiersRecorded: false; checks: string[]; artifactIds: string[];
  measurements: { pushToRingMs: number | null; answerToMediaMs: number | null; teardownMs: number | null };
}
export type AcceptanceCase = { caseId: string; status: AcceptanceStatus; reason: typeof REASONS[number] | null; recordIds: string[] }
export type NativeAcceptanceEvidence = { schemaVersion: 1; contract: typeof NATIVE_ACCEPTANCE_CONTRACT; artifacts: AcceptanceArtifact[]; records: AcceptanceRecord[]; cases: AcceptanceCase[] }
export type NativeAcceptanceIssue = { code: string; path: string }
export type NativeAcceptanceReport = {
  schemaVersion: 1; valid: boolean; decision: "blocked" | "deferred" | "review_required";
  evidenceVerification: "manifest_only"; currentPhysicalEvidenceComplete: boolean;
  physicalAccepted: false; distributionAccepted: false; activationAllowed: false;
  candidate: { id: string; head: string; frozen: boolean; dirty: boolean } | null;
  stages: Record<AcceptanceLevel, "NOT_RUN" | "DECLARED" | "UNFROZEN" | "DECLARED_COMPLETE">;
  coverage: { required: number; passed: number; failed: number; notRun: number; blocked: number; deferred: number; historical: number; observations: number };
  cases: { caseId: string; status: AcceptanceStatus; assessment: "not_run" | "insufficient" | "historical" | "current_physical" | "observational" }[];
  issues: NativeAcceptanceIssue[];
}

function closed(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key))
}
function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T { return typeof value === "string" && values.some(item => item === value) }
function slug(value: unknown): value is string { return typeof value === "string" && /^[a-z][a-z0-9_-]{0,63}$/.test(value) }
function digest(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value) }
function head(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{7,40}$/.test(value) }
function instant(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value }
function strings(value: unknown, maximum: number): value is string[] { return Array.isArray(value) && value.length <= maximum && value.every(item => typeof item === "string" && item.length <= 128) && new Set(value).size === value.length }
function nullableSlug(value: unknown): value is string | null { return value === null || slug(value) }
function sameSet(value: unknown, expected: readonly string[]): value is string[] { return strings(value, 128) && value.length === expected.length && expected.every(item => value.includes(item)) }
function metric(value: unknown): value is number | null { return value === null || typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 86_400_000 }
/** Référence relative fermée dans CE dossier ; pas de lien externe, traversal, audio/vidéo ou chemin absolu. */
export function isNativeEvidenceReference(value: unknown): value is string {
  return typeof value === "string" && value.length <= 160 && /^artifacts\/[a-z0-9][a-z0-9_-]{0,100}\.(?:png|jpg|jpeg|webp|json|txt|md|ipa|apk|aab)$/.test(value)
}
function source(value: unknown): value is Source {
  return closed(value, ["head", "snapshotSha256", "frozen", "dirty", "capturedAt"]) && head(value.head) && (value.snapshotSha256 === null || digest(value.snapshotSha256)) && typeof value.frozen === "boolean" && typeof value.dirty === "boolean" && (value.capturedAt === null || instant(value.capturedAt))
}
function build(value: unknown): value is AcceptanceBuild {
  return closed(value, ["id", "platform", "kind", "sourceHead", "sourceSnapshotSha256", "version", "buildNumber", "artifactId", "createdAt"]) && slug(value.id) && oneOf(value.platform, NATIVE_ACCEPTANCE_PLATFORMS) && oneOf(value.kind, ["development", "distribution"]) && head(value.sourceHead) && digest(value.sourceSnapshotSha256) && typeof value.version === "string" && /^\d+(?:\.\d+){1,3}$/.test(value.version) && typeof value.buildNumber === "string" && /^[0-9]{1,16}$/.test(value.buildNumber) && slug(value.artifactId) && instant(value.createdAt)
}
function device(value: unknown): value is AcceptanceDevice {
  return closed(value, ["id", "platform", "hardware", "model", "osVersion", "googleServices", "registeredAt"]) && slug(value.id) && oneOf(value.platform, NATIVE_ACCEPTANCE_PLATFORMS) && oneOf(value.hardware, ["physical", "simulator"]) && typeof value.model === "string" && /^[A-Za-z0-9][A-Za-z0-9 .,_-]{0,63}$/.test(value.model) && typeof value.osVersion === "string" && /^\d+(?:\.\d+){0,3}$/.test(value.osVersion) && (value.googleServices === null || typeof value.googleServices === "boolean") && instant(value.registeredAt)
}
function uniqueIds(rows: { id: string }[]): boolean { return new Set(rows.map(row => row.id)).size === rows.length }
export function parseNativeAcceptanceCandidate(value: unknown): NativeAcceptanceCandidate | null {
  if (!closed(value, ["schemaVersion", "contract", "id", "source", "builds", "devices"]) || value.schemaVersion !== 1 || value.contract !== NATIVE_ACCEPTANCE_CONTRACT || !slug(value.id) || !source(value.source) || !Array.isArray(value.builds) || value.builds.length > 32 || !value.builds.every(build) || !Array.isArray(value.devices) || value.devices.length > 32 || !value.devices.every(device) || !uniqueIds(value.builds) || !uniqueIds(value.devices)) return null
  return { schemaVersion: 1, contract: NATIVE_ACCEPTANCE_CONTRACT, id: value.id, source: value.source, builds: value.builds, devices: value.devices }
}
export function parseNativeAcceptanceProtocol(value: unknown): NativeAcceptanceProtocol | null {
  if (!closed(value, ["schemaVersion", "contract", "minimumOs", "requiredCases", "observationCases", "forceStopIsReadiness", "evidenceVerification"]) || value.schemaVersion !== 1 || value.contract !== NATIVE_ACCEPTANCE_CONTRACT || !closed(value.minimumOs, ["ios", "android"]) || value.minimumOs.ios !== "16.4" || value.minimumOs.android !== "14" || !sameSet(value.requiredCases, NATIVE_ACCEPTANCE_REQUIRED_CASES) || !sameSet(value.observationCases, NATIVE_ACCEPTANCE_OBSERVATION_CASES) || value.forceStopIsReadiness !== false || value.evidenceVerification !== "manifest_only") return null
  return { schemaVersion: 1, contract: NATIVE_ACCEPTANCE_CONTRACT, minimumOs: { ios: "16.4", android: "14" }, requiredCases: value.requiredCases, observationCases: value.observationCases, forceStopIsReadiness: false, evidenceVerification: "manifest_only" }
}
function artifact(value: unknown): value is AcceptanceArtifact {
  return closed(value, ["id", "ref", "sha256", "kind", "recordedAt", "privacy"]) && slug(value.id) && isNativeEvidenceReference(value.ref) && digest(value.sha256) && oneOf(value.kind, ARTIFACT_KINDS) && instant(value.recordedAt) && value.privacy === "sanitized_no_personal_data"
}
function record(value: unknown): value is AcceptanceRecord {
  return closed(value, ["id", "candidateId", "caseId", "level", "status", "sourceHead", "sourceSnapshotSha256", "buildId", "peerBuildId", "deviceId", "peerDeviceId", "observedAt", "network", "participantsConsented", "privateIdentifiersRecorded", "checks", "artifactIds", "measurements"]) && slug(value.id) && slug(value.candidateId) && oneOf(value.caseId, ALL_CASES) && oneOf(value.level, LEVELS) && oneOf(value.status, ["PASS", "FAIL", "OBSERVED"]) && head(value.sourceHead) && digest(value.sourceSnapshotSha256) && nullableSlug(value.buildId) && nullableSlug(value.peerBuildId) && nullableSlug(value.deviceId) && nullableSlug(value.peerDeviceId) && instant(value.observedAt) && (value.network === null || closed(value.network, ["local", "peer"]) && oneOf(value.network.local, NETWORKS) && oneOf(value.network.peer, NETWORKS)) && typeof value.participantsConsented === "boolean" && value.privateIdentifiersRecorded === false && strings(value.checks, 64) && value.checks.every(item => CHECKS.has(item)) && strings(value.artifactIds, 16) && value.artifactIds.every(slug) && closed(value.measurements, ["pushToRingMs", "answerToMediaMs", "teardownMs"]) && Object.values(value.measurements).every(metric)
}
function acceptanceCase(value: unknown): value is AcceptanceCase {
  return closed(value, ["caseId", "status", "reason", "recordIds"]) && oneOf(value.caseId, ALL_CASES) && oneOf(value.status, STATUSES) && (value.reason === null || oneOf(value.reason, REASONS)) && strings(value.recordIds, 16) && value.recordIds.every(slug) && ((value.status === "BLOCKED" || value.status === "DEFERRED") ? value.reason !== null : value.reason === null) && ((value.status === "NOT_RUN" || value.status === "BLOCKED" || value.status === "DEFERRED") ? value.recordIds.length === 0 : value.recordIds.length > 0)
}
export function parseNativeAcceptanceEvidence(value: unknown): NativeAcceptanceEvidence | null {
  if (!closed(value, ["schemaVersion", "contract", "artifacts", "records", "cases"]) || value.schemaVersion !== 1 || value.contract !== NATIVE_ACCEPTANCE_CONTRACT || !Array.isArray(value.artifacts) || value.artifacts.length > 512 || !value.artifacts.every(artifact) || !uniqueIds(value.artifacts) || new Set(value.artifacts.map(row => row.ref)).size !== value.artifacts.length || !Array.isArray(value.records) || value.records.length > 512 || !value.records.every(record) || !uniqueIds(value.records) || !Array.isArray(value.cases) || value.cases.length !== ALL_CASES.length || !value.cases.every(acceptanceCase) || new Set(value.cases.map(row => row.caseId)).size !== ALL_CASES.length) return null
  return { schemaVersion: 1, contract: NATIVE_ACCEPTANCE_CONTRACT, artifacts: value.artifacts, records: value.records, cases: value.cases }
}

/** La CLI appelle cette fonction ; ni horloge implicite, ni accès fichier, réseau, OS ou Git. */
export function evaluateNativeAcceptance(input: { candidate: unknown; protocol: unknown; evidence: unknown }, nowMs: number): NativeAcceptanceReport {
  const candidate = parseNativeAcceptanceCandidate(input.candidate), protocol = parseNativeAcceptanceProtocol(input.protocol), evidence = parseNativeAcceptanceEvidence(input.evidence)
  const report: NativeAcceptanceReport = {
    schemaVersion: 1, valid: true, decision: "blocked", evidenceVerification: "manifest_only", currentPhysicalEvidenceComplete: false,
    physicalAccepted: false, distributionAccepted: false, activationAllowed: false,
    candidate: candidate ? { id: candidate.id, head: candidate.source.head, frozen: candidate.source.frozen, dirty: candidate.source.dirty } : null,
    stages: { source: "UNFROZEN", local_build: "NOT_RUN", simulator: "NOT_RUN", physical: "NOT_RUN", distribution: "NOT_RUN" },
    coverage: { required: NATIVE_ACCEPTANCE_REQUIRED_CASES.length, passed: 0, failed: 0, notRun: 0, blocked: 0, deferred: 0, historical: 0, observations: 0 }, cases: [], issues: [],
  }
  const issue = (code: string, path: string) => { report.issues.push({ code, path }) }
  if (!candidate) issue("invalid_candidate", "candidate")
  if (!protocol) issue("invalid_protocol", "protocol")
  if (!evidence) issue("invalid_evidence", "evidence")
  if (!Number.isSafeInteger(nowMs) || nowMs <= 0) issue("invalid_evaluation_time", "nowMs")
  if (!candidate || !protocol || !evidence || report.issues.length) { report.valid = false; return report }
  const capturedAt = candidate.source.capturedAt === null ? NaN : Date.parse(candidate.source.capturedAt)
  const sourceFrozen = candidate.source.frozen && !candidate.source.dirty && candidate.source.snapshotSha256 !== null && capturedAt <= nowMs
  if (!sourceFrozen) issue("source_not_frozen", "candidate.source")
  else report.stages.source = "DECLARED"
  const artifacts = new Map(evidence.artifacts.map(row => [row.id, row]))
  const builds = new Map(candidate.builds.map(row => [row.id, row]))
  const devices = new Map(candidate.devices.map(row => [row.id, row]))
  const records = new Map(evidence.records.map(row => [row.id, row]))
  const platformOf = (caseId: string): AcceptancePlatform => caseId.endsWith(":ios") ? "ios" : "android"
  const supportedDevice = (row: AcceptanceDevice | undefined, platform: AcceptancePlatform): row is AcceptanceDevice => !!row && row.platform === platform && row.hardware === "physical" && Date.parse(row.registeredAt) <= nowMs && (platform === "android" ? Number(row.osVersion.split(".")[0]) >= 14 && row.googleServices === true : Number(row.osVersion.split(".")[0]) > 16 || Number(row.osVersion.split(".")[0]) === 16 && Number(row.osVersion.split(".")[1] ?? "0") >= 4)
  for (const platform of NATIVE_ACCEPTANCE_PLATFORMS) {
    if (!candidate.devices.some(row => supportedDevice(row, platform))) issue("physical_device_missing", `candidate.devices.${platform}`)
    if (!candidate.builds.some(row => row.platform === platform && row.sourceHead === candidate.source.head && row.sourceSnapshotSha256 === candidate.source.snapshotSha256)) issue("current_build_missing", `candidate.builds.${platform}`)
  }
  // Références réciproques et datation sont relues même pour les lignes non retenues par un cas.
  const invalidRecords = new Set<string>()
  for (const row of evidence.records) {
    let invalid = Date.parse(row.observedAt) > nowMs || row.artifactIds.length === 0
    for (const id of row.artifactIds) {
      const item = artifacts.get(id)
      if (!item || Date.parse(item.recordedAt) < Date.parse(row.observedAt) || Date.parse(item.recordedAt) > nowMs) invalid = true
    }
    if (row.buildId !== null && !builds.has(row.buildId) || row.peerBuildId !== null && !builds.has(row.peerBuildId) || row.deviceId !== null && !devices.has(row.deviceId) || row.peerDeviceId !== null && !devices.has(row.peerDeviceId)) invalid = true
    if (invalid) { invalidRecords.add(row.id); issue("invalid_record_reference_or_time", `evidence.records.${row.id}`) }
    if (row.candidateId === candidate.id && row.sourceHead === candidate.source.head && row.sourceSnapshotSha256 === candidate.source.snapshotSha256 && !invalid && (row.level !== "source" || sourceFrozen)) report.stages[row.level] = "DECLARED"
  }
  for (const item of evidence.cases) {
    if (item.recordIds.some(id => { const row = records.get(id); return !row || row.caseId !== item.caseId || row.status !== item.status })) issue("case_record_mismatch", `evidence.cases.${item.caseId}`)
    const observation = NATIVE_ACCEPTANCE_OBSERVATION_CASES.some(id => id === item.caseId)
    if (observation) {
      if (item.status !== "NOT_RUN") report.coverage.observations += 1
      if (item.status === "PASS") issue("force_stop_not_readiness", `evidence.cases.${item.caseId}`)
      report.cases.push({ caseId: item.caseId, status: item.status, assessment: "observational" })
      continue
    }
    let assessment: NativeAcceptanceReport["cases"][number]["assessment"] = "not_run"
    if (item.status === "NOT_RUN") report.coverage.notRun += 1
    else if (item.status === "BLOCKED") report.coverage.blocked += 1
    else if (item.status === "DEFERRED") report.coverage.deferred += 1
    else if (item.status === "FAIL") { report.coverage.failed += 1; assessment = "insufficient" }
    else if (item.status === "OBSERVED") { issue("observation_not_acceptance", `evidence.cases.${item.caseId}`); assessment = "insufficient" }
    else {
      assessment = "insufficient"
      const rows = item.recordIds.map(id => records.get(id))
      if (rows.some(row => !row || row.caseId !== item.caseId || row.status !== "PASS")) issue("case_record_mismatch", `evidence.cases.${item.caseId}`)
      else if (rows.some(row => row && (row.candidateId !== candidate.id || row.sourceHead !== candidate.source.head || row.sourceSnapshotSha256 !== candidate.source.snapshotSha256))) { assessment = "historical"; report.coverage.historical += 1 }
      else {
        const platform = platformOf(item.caseId), scenario = item.caseId.split(":")[0] as AcceptanceScenario
        const checks: readonly string[] = NATIVE_ACCEPTANCE_SCENARIOS[scenario]
        const complete = sourceFrozen && rows.every(row => {
          if (!row || invalidRecords.has(row.id) || row.level !== "physical" || !row.participantsConsented || !row.network || !checks.every(check => row.checks.includes(check))) return false
          const compiled = row.buildId === null ? undefined : builds.get(row.buildId)
          const physical = row.deviceId === null ? undefined : devices.get(row.deviceId)
          const peer = row.peerDeviceId === null ? undefined : devices.get(row.peerDeviceId)
          const binary = compiled ? artifacts.get(compiled.artifactId) : undefined
          if (!compiled || compiled.platform !== platform || compiled.sourceHead !== candidate.source.head || compiled.sourceSnapshotSha256 !== candidate.source.snapshotSha256 || !binary || binary.kind !== "build_artifact" || Date.parse(compiled.createdAt) < capturedAt || Date.parse(compiled.createdAt) > Date.parse(row.observedAt) || Date.parse(binary.recordedAt) > Date.parse(row.observedAt) || !supportedDevice(physical, platform)) return false
          const needsPeer = !["feed_parity", "messages_parity", "commerce_parity"].includes(scenario)
          const peerBuild = row.peerBuildId === null ? undefined : builds.get(row.peerBuildId)
          const peerBinary = peerBuild ? artifacts.get(peerBuild.artifactId) : undefined
          if (needsPeer && (!supportedDevice(peer, platform === "ios" ? "android" : "ios") || !peerBuild || peerBuild.platform === platform || peerBuild.sourceHead !== candidate.source.head || peerBuild.sourceSnapshotSha256 !== candidate.source.snapshotSha256 || !peerBinary || peerBinary.kind !== "build_artifact" || Date.parse(peerBuild.createdAt) < capturedAt || Date.parse(peerBuild.createdAt) > Date.parse(row.observedAt) || Date.parse(peerBinary.recordedAt) > Date.parse(row.observedAt) || row.network.local === "not_applicable" || row.network.peer === "not_applicable")) return false
          const needsRingTiming = ["locked_incoming", "background_incoming", "cold_start_system_terminated"].includes(scenario)
          if (needsRingTiming && row.measurements.pushToRingMs === null) return false
          if (["audio_bidirectional", "video_bidirectional", "locked_incoming", "background_incoming", "cold_start_system_terminated"].includes(scenario) && row.measurements.answerToMediaMs === null) return false
          if (["remote_end", "reject", "ring_expiry", "media_off", "session_revocation"].includes(scenario) && row.measurements.teardownMs === null) return false
          return true
        })
        if (complete) { assessment = "current_physical"; report.coverage.passed += 1 }
        else issue("physical_evidence_incomplete", `evidence.cases.${item.caseId}`)
      }
    }
    report.cases.push({ caseId: item.caseId, status: item.status, assessment })
  }
  report.currentPhysicalEvidenceComplete = report.coverage.passed === report.coverage.required && report.issues.length === 0
  if (report.currentPhysicalEvidenceComplete) { report.stages.physical = "DECLARED_COMPLETE"; report.decision = "review_required" }
  else if (report.coverage.deferred > 0 && report.coverage.failed === 0 && report.coverage.blocked === 0 && report.issues.length === 0) report.decision = "deferred"
  return report
}
