/** DP39 : invalidation privée signée, sans observation ni mutation d'un état de service. */
import { commerceCanonicalJson } from "@antsia/social-domain/commerce/primitives"
import {
  COMMERCE_SERVICE_NOTICE_CONTRACT, parseCommerceServiceNoticeBody,
  type CommerceServiceNoticeEvent,
} from "@antsia/social-domain/commerce-service-notices"

import type { Doc } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { serviceFollowupRecipientAllowed } from "../notifications/commerceAccess"
import { noticeServiceFollowup } from "../notifications/commerceEmit"
import { readCommerceLinkConfig } from "../shops/commerceLinkConfig"
import type { FederationApplyResult } from "./reseauPublic"
import { federationBodyDigest } from "./signature"

/**
 * Une référence connue de CETTE commande ne peut jamais être remplacée par un signal.
 * Une réponse perdue (UNKNOWN, sans bail/lookup en cours) peut encore être signalée,
 * mais uniquement par le genre de résultat que cette commande peut réellement créer.
 * Le premier devis se corrèle à l'inquiry : ANTSIA ne connaît pas encore sa référence.
 */
function correlatedObject(command: Doc<"commerceServiceCommands">, request: Doc<"commerceServiceRequests">, event: CommerceServiceNoticeEvent, now: number): boolean {
  if (command.state !== "accepted" && command.state !== "unknown") return false
  const lostResult = command.state === "unknown" && command.resultRef === undefined &&
    command.lookupState !== "in_progress" && (command.leaseUntil ?? 0) <= now
  if (event.objectKind === "quote") {
    if (request.mode !== "quote") return false
    return (command.kind === "inquiry" && (command.state === "accepted" || lostResult)) ||
      (command.kind === "quote_accept" && command.quoteRef === event.objectRef)
  }
  if (event.objectKind === "appointment") {
    if (request.mode !== "booking" || (command.kind !== "booking" && command.kind !== "reschedule")) return false
    if (command.resultRef !== undefined) return command.resultRef === event.objectRef
    if (request.booking?.appointmentRef === event.objectRef || request.pendingReplacement?.appointmentRef === event.objectRef) return true
    return lostResult
  }
  if (!((request.mode === "fixed_order" && command.kind === "order") || (request.mode === "quote" && command.kind === "quote_accept"))) return false
  if (command.resultRef !== undefined) return command.resultRef === event.objectRef
  const known = request.order?.orderRef ?? request.acceptedQuote?.orderRef
  return known ? known === event.objectRef : lostResult
}

/** Dans la transaction inbox : corrélation, preuve de déduplication et notifyPerson atomiques. */
export async function applyCommerceServiceNotice(ctx: MutationCtx, emitter: Doc<"federationEmitters">, rawBody: string | undefined, now: number): Promise<FederationApplyResult> {
  if (!emitter.enabled || emitter.slug !== "pro-ga" || !emitter.allowedContracts.includes(COMMERCE_SERVICE_NOTICE_CONTRACT)) return { applied: false, reason: "contract_not_allowed" }
  const parsed = rawBody === undefined ? null : parseCommerceServiceNoticeBody(rawBody, now)
  if (!parsed?.ok) return { applied: false, reason: "invalid_payload" }
  const event = parsed.value.payload
  const config = await readCommerceLinkConfig()
  const network = await ctx.db.get(emitter.networkId)
  if (!config || !network || network.status !== "active" || config.environment !== emitter.environment || event.environment !== config.environment) return { applied: false, reason: "contract_not_allowed" }

  // Index exact : aucune fenêtre tronquée ni adoption d'un objet par son seul identifiant distant.
  const command = await ctx.db.query("commerceServiceCommands").withIndex("by_network_source_environment_requestId", (q) => q.eq("networkId", emitter.networkId).eq("source", config.source).eq("environment", config.environment).eq("requestId", event.originRequestId)).unique()
  if (!command || command.networkId !== emitter.networkId || command.subjectRef !== event.subjectRef || command.shopRef !== event.shopRef || command.cancelledAt !== undefined) return { applied: false, reason: "identity_not_linked" }
  const request = await ctx.db.query("commerceServiceRequests").withIndex("by_request", (q) => q.eq("requestRowId", command.requestRowId)).unique()
  if (!request || request.networkId !== emitter.networkId || request.personId !== command.personId || request.shopId !== command.shopId ||
    request.source !== config.source || request.environment !== config.environment || request.subjectRef !== command.subjectRef ||
    request.shopRef !== command.shopRef || request.linkRef !== command.linkRef || request.cancelledAt !== undefined ||
    !correlatedObject(command, request, event, now)) return { applied: false, reason: "source_conflict" }
  if (!(await serviceFollowupRecipientAllowed(ctx, request))) return { applied: false, reason: "consent_required" }

  // Empreinte des FAITS seulement : un nouvel eventId ne crée pas une nouvelle transition.
  const payloadSha256 = await federationBodyDigest(commerceCanonicalJson(event)!)
  const existing = await ctx.db.query("commerceServiceFollowupNotices").withIndex("by_request_object_revision", (q) => q.eq("requestId", request._id).eq("objectRef", event.objectRef).eq("revision", event.revision)).unique()
  if (existing) return existing.payloadSha256 === payloadSha256 && existing.personId === request.personId && existing.networkId === request.networkId ? { applied: true } : { applied: false, reason: "source_conflict" }
  const latest = await ctx.db.query("commerceServiceFollowupNotices").withIndex("by_request_object_revision", (q) => q.eq("requestId", request._id).eq("objectRef", event.objectRef)).order("desc").first()
  if (latest && event.revision < latest.revision) return { applied: true }

  const transition = `followup:${payloadSha256}`
  const proofId = await ctx.db.insert("commerceServiceFollowupNotices", {
    networkId: request.networkId, personId: request.personId, requestId: request._id,
    objectKind: event.objectKind, objectRef: event.objectRef, revision: event.revision,
    changedAt: event.changedAt, payloadSha256, transition, receivedAt: now,
  })
  if (await noticeServiceFollowup(ctx, request, transition) === null) {
    await ctx.db.delete(proofId)
    return { applied: false, reason: "consent_required" }
  }
  return { applied: true }
}
