/** P08 : validation PUBLIC avant reçu ; seul un contrat de recette sandbox a un effet. */
import { isCommercePublicContract, commerceParseCanonicalBody, commerceRecord } from "@antsia/social-domain/commerce/primitives"
import { parseCommercePublicBody } from "@antsia/social-domain/commerce/projection"
import { COMMERCE_JOBS_CONTRACT, parseCommerceJobsBody } from "@antsia/social-domain/commerce-jobs"
import { COMMERCE_SERVICE_NOTICE_CONTRACT, parseCommerceServiceNoticeBody } from "@antsia/social-domain/commerce-service-notices"
import { COMMERCE_TRANSPORT_TEST_CONTRACT, FEDERATION_MAX_SKEW_MS, type FederationEnvelope, type FederationEnvironment, validFederationReference } from "@antsia/social-domain/federationProtocol"

import type { Doc } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import type { FederationApplyResult } from "./reseauPublic"

export type FederationApplicationStatus = "received" | "applied" | "rejected"
export type FederationReceiptCorrelation = { eventId: string; bodySha256: string; applicationStatus: FederationApplicationStatus }
export function correlatedFederationReceipt(eventId: string, bodySha256: string, status: "received" | "applied" | "dead_letter" | "discarded"): FederationReceiptCorrelation {
  return { eventId, bodySha256, applicationStatus: status === "applied" ? "applied" : status === "received" ? "received" : "rejected" }
}

export type CommerceTransportProbe = {
  eventId: string
  contract: typeof COMMERCE_TRANSPORT_TEST_CONTRACT
  version: 1
  objectRef: string
  payload: { type: "transport.probe"; correlationId: string; sentAt: number }
}

export function commerceTransportTestEnabled(environment: FederationEnvironment): boolean {
  return environment === "sandbox" && process.env.FEDERATION_ENVIRONMENT === "sandbox" && process.env.ANTSIA_COMMERCE_TRANSPORT_TEST_ENABLED === "true"
}

/** Fermé et canonique, 2 Kio au plus ; aucun sujet privé ne peut entrer dans la preuve. */
export function parseCommerceTransportProbe(rawBody: string, now: number): CommerceTransportProbe | null {
  try {
    const row = commerceRecord(commerceParseCanonicalBody(rawBody, 2048), "$", ["eventId", "contract", "version", "objectRef", "payload"], [])
    if (row.contract !== COMMERCE_TRANSPORT_TEST_CONTRACT || row.version !== 1 || typeof row.eventId !== "string" || !validFederationReference(row.eventId) || /[^A-Za-z0-9._:-]/u.test(row.eventId)) return null
    if (typeof row.objectRef !== "string" || !row.objectRef.startsWith("pro.ga:transport_test:")) return null
    const id = row.objectRef.slice("pro.ga:transport_test:".length)
    if (id.length < 26 || id.length > 64 || /[^a-f0-9]/u.test(id)) return null
    const payload = commerceRecord(row.payload, "$.payload", ["type", "correlationId", "sentAt"], [])
    if (payload.type !== "transport.probe" || typeof payload.correlationId !== "string" || payload.correlationId.length < 8 || payload.correlationId.length > 100 || !validFederationReference(payload.correlationId) || /[^A-Za-z0-9._:-]/u.test(payload.correlationId)) return null
    if (typeof payload.sentAt !== "number" || !Number.isSafeInteger(payload.sentAt) || payload.sentAt < 0 || !Number.isSafeInteger(now) || payload.sentAt > now + FEDERATION_MAX_SKEW_MS) return null
    return { contract: COMMERCE_TRANSPORT_TEST_CONTRACT, version: 1, eventId: row.eventId, objectRef: row.objectRef, payload: { type: "transport.probe", correlationId: payload.correlationId, sentAt: payload.sentAt } }
  } catch { return null }
}

/** À appeler AVANT le nouveau reçu et avant tout nouvel effet de replay. */
export function validateCommerceTransportBody(rawBody: string, envelope: FederationEnvelope, environment: FederationEnvironment, now: number): "valid" | "invalid" | "unauthorized" {
  if (isCommercePublicContract(envelope.contract)) return parseCommercePublicBody(rawBody, now).ok ? "valid" : "invalid"
  // P15 : même garde canonique avant reçu pour les emplois complets (jumeau hors manifeste P06).
  if (envelope.contract === COMMERCE_JOBS_CONTRACT) return parseCommerceJobsBody(rawBody, now).ok ? "valid" : "invalid"
  if (envelope.contract === COMMERCE_SERVICE_NOTICE_CONTRACT) {
    const parsed = parseCommerceServiceNoticeBody(rawBody, now)
    return !parsed.ok ? "invalid" : parsed.value.payload.environment === environment ? "valid" : "unauthorized"
  }
  if (envelope.contract !== COMMERCE_TRANSPORT_TEST_CONTRACT) return "valid"
  if (!commerceTransportTestEnabled(environment)) return "unauthorized"
  return parseCommerceTransportProbe(rawBody, now) ? "valid" : "invalid"
}

export async function applyCommerceTransportProbe(ctx: MutationCtx, emitter: Doc<"federationEmitters">, rawBody: string | undefined, now: number): Promise<FederationApplyResult> {
  if (!commerceTransportTestEnabled(emitter.environment) || !emitter.enabled || !emitter.allowedContracts.includes(COMMERCE_TRANSPORT_TEST_CONTRACT)) return { applied: false, reason: "contract_not_allowed" }
  const probe = rawBody === undefined ? null : parseCommerceTransportProbe(rawBody, now)
  if (!probe) return { applied: false, reason: "invalid_payload" }
  const network = await ctx.db.get(emitter.networkId)
  if (!network || network.status !== "active") return { applied: false, reason: "contract_not_allowed" }
  const existing = await ctx.db.query("federationCommerceProbes").withIndex("by_emitter_event", (q) => q.eq("emitterId", emitter._id).eq("eventId", probe.eventId)).unique()
  if (existing) return existing.networkId === emitter.networkId && existing.correlationId === probe.payload.correlationId && existing.sentAt === probe.payload.sentAt ? { applied: true } : { applied: false, reason: "source_conflict" }
  await ctx.db.insert("federationCommerceProbes", { networkId: emitter.networkId, emitterId: emitter._id, eventId: probe.eventId, correlationId: probe.payload.correlationId, sentAt: probe.payload.sentAt, receivedAt: now })
  return { applied: true }
}
