/** FEDERATION-INBOX-V1 : enveloppe fermée et bornes, sans dépendance d'exécution. */
export const FEDERATION_ENVIRONMENTS = ["sandbox", "production"] as const
export type FederationEnvironment = typeof FEDERATION_ENVIRONMENTS[number]
export const FEDERATION_BODY_MAX_BYTES = 128 * 1024
export const FEDERATION_MAX_SKEW_MS = 5 * 60 * 1000
export const FEDERATION_PAYLOAD_MAX_DEPTH = 8
export const FEDERATION_PAYLOAD_MAX_NODES = 2000
export const FEDERATION_PAYLOAD_MAX_ITEMS = 256
export const FEDERATION_PAYLOAD_MAX_FIELDS = 64
export const FEDERATION_STRING_MAX_LENGTH = 8192
export const FEDERATION_CONTRACTS_MAX = 32
/** PA9A/PA9B/PA9C : pages, publications et agents sous consentement local corrélé. */
export const RESEAU_PUBLIC_CONTRACT = "RESEAU-PUBLIC-V1"
export const RESEAU_PUBLIC_EMITTER = "administration-ga"
/** P08 : preuve de TRANSPORT sandbox, jamais un raccord du catalogue commercial. */
export const COMMERCE_TRANSPORT_TEST_CONTRACT = "PRO-COMMERCE-TRANSPORT-TEST-V1"
/** P15 : emplois publics complets (compétences, période), jumeau `commerce-jobs` hors manifeste P06. */
export const COMMERCE_JOBS_FEDERATION_CONTRACT = "PRO-COMMERCE-JOBS-V1"
export const FEDERATION_IMPLEMENTED_CONTRACTS: readonly string[] = [RESEAU_PUBLIC_CONTRACT, COMMERCE_TRANSPORT_TEST_CONTRACT, "PRO-COMMERCE-PUBLIC-V1", "PRO-COMMERCE-PUBLIC-V2", COMMERCE_JOBS_FEDERATION_CONTRACT, "PRO-COMMERCE-SERVICE-NOTICE-V1"]
export const FEDERATION_IMPLEMENTED_EVENTS = {
  [RESEAU_PUBLIC_CONTRACT]: ["page.upserted", "post.published", "post.removed", "person.optin", "person.optout"],
  [COMMERCE_TRANSPORT_TEST_CONTRACT]: ["transport.probe"],
  "PRO-COMMERCE-PUBLIC-V1": ["shop.published", "shop.updated", "shop.withdrawn", "offer.published", "offer.updated", "offer.withdrawn", "offer.availabilityChanged", "job.published", "job.closed"],
  "PRO-COMMERCE-PUBLIC-V2": ["shop.published", "shop.updated", "shop.withdrawn", "offer.published", "offer.updated", "offer.withdrawn", "offer.availabilityChanged", "job.published", "job.closed"],
  [COMMERCE_JOBS_FEDERATION_CONTRACT]: ["job.published", "job.closed"],
  "PRO-COMMERCE-SERVICE-NOTICE-V1": ["service.followup.changed"],
} as const

export type FederationJson = null | boolean | number | string | FederationJson[] | { [key: string]: FederationJson }
export type FederationEnvelope = { eventId: string; contract: string; version: 1; objectRef: string; payload: FederationJson }
export type FederationEnvelopeResult = { ok: true; envelope: FederationEnvelope } | { ok: false; reason: "invalid_envelope" | "payload_too_complex" | "forbidden_payload_field" }

const FORBIDDEN_FIELDS = new Set([
  "_id", "_creationTime", "__proto__", "prototype", "constructor", "networkId", "personId", "authUserId", "storageId", "localId", "localTable", "convexId",
  "email", "phone", "phoneNumber", "password", "accessToken", "refreshToken", "sessionId", "apiKey", "secret", "privateKey", "authorization",
])

export function federationEnvironment(value: string | undefined | null): FederationEnvironment | null {
  return value === "sandbox" || value === "production" ? value : null
}
export function validFederationEmitter(value: string): boolean { return /^[a-z][a-z0-9-]{1,63}$/u.test(value) }
export function validFederationContract(value: string): boolean { return value.length <= 100 && /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-V[1-9][0-9]*$/u.test(value) }
export function validFederationReference(value: string): boolean { return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(value) }
export function validFederationKeyEnvName(value: string): boolean { return value.length <= 160 && /^ANTSIA_FEDERATION_[A-Z0-9_]+_KEY$/u.test(value) }

/** Unix en secondes, forme décimale canonique ; la valeur exacte est signée. */
export function freshFederationTimestamp(value: string, nowMs: number): boolean {
  if (!/^[1-9][0-9]{0,11}$/u.test(value) || !Number.isFinite(nowMs)) return false
  const timestampMs = Number(value) * 1000
  return Number.isSafeInteger(timestampMs) && Math.abs(nowMs - timestampMs) <= FEDERATION_MAX_SKEW_MS
}

/** Longueur fixée, comparaison de tous les octets hexadécimaux sans arrêt précoce. */
export function equalFederationSignature(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/u.test(left) || !/^[a-f0-9]{64}$/u.test(right)) return false
  let difference = 0
  for (let index = 0; index < 64; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return difference === 0
}

export function federationSigningText(environment: FederationEnvironment, timestamp: string, rawBody: string): string {
  return `${environment}\n${timestamp}\n${rawBody}`
}

export function parseFederationEnvelope(rawBody: string): FederationEnvelopeResult {
  let parsed: unknown
  try { parsed = JSON.parse(rawBody) as unknown } catch { return { ok: false, reason: "invalid_envelope" } }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, reason: "invalid_envelope" }
  const row = parsed as Record<string, unknown>
  const keys = Object.keys(row)
  if (keys.length !== 5 || !["eventId", "contract", "version", "objectRef", "payload"].every((key) => Object.prototype.hasOwnProperty.call(row, key))) return { ok: false, reason: "invalid_envelope" }
  if (typeof row.eventId !== "string" || !validFederationReference(row.eventId) || typeof row.objectRef !== "string" || !validFederationReference(row.objectRef) || typeof row.contract !== "string" || !validFederationContract(row.contract) || row.version !== 1) return { ok: false, reason: "invalid_envelope" }
  const personal = row.contract === RESEAU_PUBLIC_CONTRACT && row.payload !== null && typeof row.payload === "object" && !Array.isArray(row.payload) && ["person.optin", "person.optout"].includes((row.payload as Record<string, unknown>).type as string)
  const stack: { value: unknown; depth: number }[] = [{ value: row.payload, depth: 0 }]
  let nodes = 0
  while (stack.length > 0) {
    const item = stack.pop()
    if (!item) break
    const { value, depth } = item
    nodes++
    if (nodes > FEDERATION_PAYLOAD_MAX_NODES || depth > FEDERATION_PAYLOAD_MAX_DEPTH) return { ok: false, reason: "payload_too_complex" }
    if (value === null || typeof value === "boolean") continue
    if (typeof value === "number") { if (!Number.isFinite(value)) return { ok: false, reason: "invalid_envelope" }; continue }
    if (typeof value === "string") { if (value.length > FEDERATION_STRING_MAX_LENGTH) return { ok: false, reason: "payload_too_complex" }; continue }
    if (Array.isArray(value)) {
      if (value.length > FEDERATION_PAYLOAD_MAX_ITEMS) return { ok: false, reason: "payload_too_complex" }
      for (const child of value) stack.push({ value: child, depth: depth + 1 })
      continue
    }
    if (typeof value !== "object") return { ok: false, reason: "invalid_envelope" }
    const fields = Object.entries(value)
    if (fields.length > FEDERATION_PAYLOAD_MAX_FIELDS) return { ok: false, reason: "payload_too_complex" }
    for (const [key, child] of fields) {
      if (key.length === 0 || key.length > 100) return { ok: false, reason: "invalid_envelope" }
      if (FORBIDDEN_FIELDS.has(key) || (key === "idnSub" && (!personal || depth !== 0))) return { ok: false, reason: "forbidden_payload_field" }
      stack.push({ value: child, depth: depth + 1 })
    }
  }
  return { ok: true, envelope: row as FederationEnvelope }
}
