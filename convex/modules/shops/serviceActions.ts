/**
 * P14 : seules ces actions génèrent l'entropie et appellent PRO.GA. Toute commande passe par
 * admission (octets persistés) → autorisation juste avant l'envoi → arrivée validée. Une
 * lecture (modes, créneaux, devis, rendez-vous) n'a aucun effet chez PRO.GA et n'est jamais
 * persistée. Aucun succès n'est supposé : sans réponse corrélée, la demande reste « inconnue ».
 */
import type { CommerceServiceControlContract } from "@antsia/social-domain/commerce-services"
import { type DefaultFunctionArgs, makeFunctionReference } from "convex/server"
import { type Infer, v } from "convex/values"

import type { Id } from "../../_generated/dataModel"
import type { ActionCtx } from "../../_generated/server"
import { networkAction } from "../../lib/functions"
import { type CommerceLinkConfig, readCommerceLinkConfig } from "./commerceLinkConfig"
import { randomLinkId, randomLinkToken } from "./commerceLinkCrypto"
import { sendServiceCommand, sendServiceControl, type ServiceReply } from "./serviceClient"
import type { ServiceDelivery } from "./serviceFlow"
import {
  serviceActionResultValidator, serviceControlContractValidator, serviceContactNameValidator, serviceMoneyValidator, serviceOptionsResultValidator, serviceQuoteResultValidator,
  serviceQuotesResultValidator, serviceSlotsResultValidator, type ServiceActionResult, type ServiceOptionsResult, type ServiceQuoteResult, type ServiceQuotesResult, type ServiceSlotsResult,
} from "./serviceRules"

type Net = { networkId: Id<"networks"> }
type Money = Infer<typeof serviceMoneyValidator>
type ContactName = Infer<typeof serviceContactNameValidator>
type Keys = { requestRowId: string; commandId: string; requestId: string; leaseToken: string; configFingerprint: string; clientRequestId: string }
type Admission = ServiceDelivery | ServiceActionResult
type Envelope = { rawBody: string; requestId: string } | null
type ReadReply = { rawBody: string; rawResponse?: string; httpStatus?: number }
type BookingTarget = { kind: "booking"; which: "held" | "replacement" }
type RequestTarget = { kind: "quotes" } | { kind: "quote"; quoteRef: string } | BookingTarget

const ref = <Args extends DefaultFunctionArgs, Result>(name: string) => makeFunctionReference<"mutation", Args, Result>(`modules/shops/serviceFlow:${name}`)
const admitQuoteRequestRef = ref<Net & Keys & { handle: string; offerRef: string; threadId: Id<"commercialThreads">; need: string; constraints?: string; desiredDate?: string; quantity?: number; attachmentMessageIds: Id<"commercialMessages">[]; consentTextVersion: string }, Admission>("admitQuoteRequest")
const admitBookingRef = ref<Net & Keys & { handle: string; offerRef: string; serviceRef: string; serviceLabel: string; resourceRef?: string; startAt: number; endAt: number; note?: string; contactName?: ContactName; consentTextVersion: string }, Admission>("admitBooking")
const admitServiceOrderRef = ref<Net & Keys & { handle: string; offerRef: string; quantity: number; expectedUnitAmount: Money; expectedCatalogRevision: number; desiredDate?: string; note?: string; contactName?: ContactName; consentTextVersion: string; existingRequestRowId?: string; publishedPackage?: true }, Admission>("admitServiceOrder")
const admitQuoteRejectRef = ref<Net & Keys & { quoteRef: string; quoteVersion: number; consentTextVersion: string }, Admission>("admitQuoteReject")
const admitQuoteAcceptRef = ref<Net & Keys & { quoteRef: string; quoteVersion: number; acceptedTotal: Money; consentTextVersion: string }, Admission>("admitQuoteAccept")
const admitRescheduleRef = ref<Net & Keys & { startAt: number; endAt: number; resourceRef?: string; expectedRevision: number; consentTextVersion: string }, Admission>("admitReschedule")
const admitCancelRef = ref<Net & Keys & { expectedRevision: number; consentTextVersion: string }, Admission>("admitCancel")
const admitLookupRef = ref<Net & { requestRowId: string; requestId: string; leaseToken: string; configFingerprint: string; resend: boolean }, ServiceDelivery | null>("admitLookup")
const authorizeRef = ref<Net & { delivery: ServiceDelivery; configFingerprint: string }, boolean>("authorize")
const finishRef = ref<Net & { delivery: ServiceDelivery; rawResponse?: string; httpStatus?: number }, ServiceActionResult>("finish")
const admitOfferReadRef = ref<Net & { handle: string; offerRef: string; requestId: string; configFingerprint: string; slots?: { serviceRef: string; resourceRef?: string; fromAt: number; toAt: number } }, Envelope>("admitOfferRead")
const admitRequestReadRef = ref<Net & { requestRowId: string; requestId: string; configFingerprint: string; target: RequestTarget; contract?: CommerceServiceControlContract }, Envelope>("admitRequestRead")
const finishOptionsRef = ref<Net & ReadReply & { handle: string; offerRef: string }, ServiceOptionsResult>("finishOptions")
const finishSlotsRef = ref<Net & ReadReply & { handle: string; offerRef: string }, ServiceSlotsResult>("finishSlots")
const finishQuotesRef = ref<Net & ReadReply & { requestRowId: string }, ServiceQuotesResult>("finishQuotes")
const finishQuoteRef = ref<Net & ReadReply & { requestRowId: string }, ServiceQuoteResult>("finishQuote")
const finishBookingReadRef = ref<Net & ReadReply & { requestRowId: string }, ServiceActionResult>("finishBookingRead")

const serviceRefreshResultValidator = v.union(v.literal("updated"), v.literal("unavailable"), v.literal("nothing"))
type ServiceRefreshResult = Infer<typeof serviceRefreshResultValidator>

function keys(config: CommerceLinkConfig, clientRequestId: string, requestRowId?: string): Keys {
  return { requestRowId: requestRowId ?? randomLinkId(), commandId: randomLinkId(), requestId: randomLinkId(), leaseToken: randomLinkToken(), configFingerprint: config.fingerprint, clientRequestId }
}
function replyFields(reply: ServiceReply | null): { rawResponse?: string; httpStatus?: number } {
  return reply ? { rawResponse: reply.rawResponse, httpStatus: reply.status } : {}
}

/** Autorisation relue JUSTE avant l'envoi ; les octets envoyés sont ceux persistés. */
async function deliver(ctx: ActionCtx, networkId: Id<"networks">, config: CommerceLinkConfig, delivery: ServiceDelivery): Promise<ServiceActionResult> {
  if (!await ctx.runMutation(authorizeRef, { networkId, delivery, configFingerprint: config.fingerprint })) return { outcome: "refused" }
  const reply = delivery.channel === "command" ? await sendServiceCommand(config, delivery.rawBody) : await sendServiceControl(config, delivery.rawBody)
  return await ctx.runMutation(finishRef, { networkId, delivery, ...replyFields(reply) })
}
async function settle(ctx: ActionCtx, networkId: Id<"networks">, config: CommerceLinkConfig, admission: Admission): Promise<ServiceActionResult> {
  return "commandId" in admission ? await deliver(ctx, networkId, config, admission) : admission
}

/** Relit le rendez-vous tenu puis son éventuel remplaçant ; seule PRO.GA dit leur état. */
async function readBookings(ctx: ActionCtx, networkId: Id<"networks">, config: CommerceLinkConfig, requestRowId: string): Promise<ServiceRefreshResult> {
  let result: ServiceRefreshResult = "nothing"
  for (const which of ["held", "replacement"] as const) {
    const envelope = await ctx.runMutation(admitRequestReadRef, { networkId, requestRowId, requestId: randomLinkId(), configFingerprint: config.fingerprint, target: { kind: "booking", which } })
    if (!envelope) continue
    const reply = await sendServiceControl(config, envelope.rawBody)
    const read = await ctx.runMutation(finishBookingReadRef, { networkId, requestRowId, rawBody: envelope.rawBody, ...replyFields(reply) })
    result = read.outcome === "request" ? "updated" : result === "updated" ? "updated" : "unavailable"
  }
  return result
}

export const options = networkAction({
  args: { handle: v.string(), offerRef: v.string() }, returns: serviceOptionsResultValidator,
  handler: async (ctx, args): Promise<ServiceOptionsResult> => {
    const config = await readCommerceLinkConfig()
    if (!config) return { outcome: "unavailable" }
    const envelope = await ctx.runMutation(admitOfferReadRef, { networkId: ctx.networkId, handle: args.handle, offerRef: args.offerRef, requestId: randomLinkId(), configFingerprint: config.fingerprint })
    if (!envelope) return { outcome: "unavailable" }
    const reply = await sendServiceControl(config, envelope.rawBody)
    return await ctx.runMutation(finishOptionsRef, { networkId: ctx.networkId, handle: args.handle, offerRef: args.offerRef, rawBody: envelope.rawBody, ...replyFields(reply) })
  },
})

export const slots = networkAction({
  args: { handle: v.string(), offerRef: v.string(), serviceRef: v.string(), resourceRef: v.optional(v.string()), fromAt: v.number(), toAt: v.number() }, returns: serviceSlotsResultValidator,
  handler: async (ctx, args): Promise<ServiceSlotsResult> => {
    const config = await readCommerceLinkConfig()
    if (!config) return { outcome: "unavailable" }
    const envelope = await ctx.runMutation(admitOfferReadRef, {
      networkId: ctx.networkId, handle: args.handle, offerRef: args.offerRef, requestId: randomLinkId(), configFingerprint: config.fingerprint,
      slots: { serviceRef: args.serviceRef, fromAt: args.fromAt, toAt: args.toAt, ...(args.resourceRef ? { resourceRef: args.resourceRef } : {}) },
    })
    if (!envelope) return { outcome: "unavailable" }
    const reply = await sendServiceControl(config, envelope.rawBody)
    return await ctx.runMutation(finishSlotsRef, { networkId: ctx.networkId, handle: args.handle, offerRef: args.offerRef, rawBody: envelope.rawBody, ...replyFields(reply) })
  },
})

export const requestQuote = networkAction({
  args: {
    handle: v.string(), offerRef: v.string(), threadId: v.id("commercialThreads"), need: v.string(), constraints: v.optional(v.string()), desiredDate: v.optional(v.string()),
    quantity: v.optional(v.number()), attachmentMessageIds: v.array(v.id("commercialMessages")), consentTextVersion: v.string(), clientRequestId: v.string(),
  },
  returns: serviceActionResultValidator,
  handler: async (ctx, args): Promise<ServiceActionResult> => {
    const config = await readCommerceLinkConfig()
    if (!config) return { outcome: "unavailable" }
    const { clientRequestId, ...intent } = args
    return await settle(ctx, ctx.networkId, config, await ctx.runMutation(admitQuoteRequestRef, { networkId: ctx.networkId, ...intent, ...keys(config, clientRequestId) }))
  },
})

export const book = networkAction({
  args: {
    handle: v.string(), offerRef: v.string(), serviceRef: v.string(), serviceLabel: v.string(), resourceRef: v.optional(v.string()), startAt: v.number(), endAt: v.number(),
    note: v.optional(v.string()), contactName: v.optional(serviceContactNameValidator), consentTextVersion: v.string(), clientRequestId: v.string(),
  },
  returns: serviceActionResultValidator,
  handler: async (ctx, args): Promise<ServiceActionResult> => {
    const config = await readCommerceLinkConfig()
    if (!config) return { outcome: "unavailable" }
    const { clientRequestId, ...intent } = args
    const result = await settle(ctx, ctx.networkId, config, await ctx.runMutation(admitBookingRef, { networkId: ctx.networkId, ...intent, ...keys(config, clientRequestId) }))
    // Rendez-vous obtenu : sa politique (changement, annulation) est relue avant tout geste.
    if (result.outcome === "request" && result.state === "accepted") await readBookings(ctx, ctx.networkId, config, result.requestRowId)
    return result
  },
})

export const orderService = networkAction({
  args: {
    handle: v.string(), offerRef: v.string(), quantity: v.number(), expectedUnitAmount: serviceMoneyValidator, expectedCatalogRevision: v.number(),
    desiredDate: v.optional(v.string()), note: v.optional(v.string()), contactName: v.optional(serviceContactNameValidator), consentTextVersion: v.string(), clientRequestId: v.string(),
    existingRequestRowId: v.optional(v.string()), publishedPackage: v.optional(v.literal(true)),
  },
  returns: serviceActionResultValidator,
  handler: async (ctx, args): Promise<ServiceActionResult> => {
    const config = await readCommerceLinkConfig()
    if (!config) return { outcome: "unavailable" }
    const { clientRequestId, ...intent } = args
    return await settle(ctx, ctx.networkId, config, await ctx.runMutation(admitServiceOrderRef, { networkId: ctx.networkId, ...intent, ...keys(config, clientRequestId) }))
  },
})

async function readRequest(ctx: ActionCtx, networkId: Id<"networks">, config: CommerceLinkConfig, requestRowId: string, target: RequestTarget, contract?: CommerceServiceControlContract): Promise<{ rawBody: string; reply: ServiceReply | null } | null> {
  const envelope = await ctx.runMutation(admitRequestReadRef, { networkId, requestRowId, requestId: randomLinkId(), configFingerprint: config.fingerprint, target, ...(contract ? { contract } : {}) })
  return envelope ? { rawBody: envelope.rawBody, reply: await sendServiceControl(config, envelope.rawBody) } : null
}

export const quotes = networkAction({
  args: { requestRowId: v.string(), contract: v.optional(serviceControlContractValidator) }, returns: serviceQuotesResultValidator,
  handler: async (ctx, args): Promise<ServiceQuotesResult> => {
    const config = await readCommerceLinkConfig()
    const read = config ? await readRequest(ctx, ctx.networkId, config, args.requestRowId, { kind: "quotes" }, args.contract) : null
    return read ? await ctx.runMutation(finishQuotesRef, { networkId: ctx.networkId, requestRowId: args.requestRowId, rawBody: read.rawBody, ...replyFields(read.reply) }) : { outcome: "unavailable" }
  },
})

export const quote = networkAction({
  args: { requestRowId: v.string(), quoteRef: v.string(), contract: v.optional(serviceControlContractValidator) }, returns: serviceQuoteResultValidator,
  handler: async (ctx, args): Promise<ServiceQuoteResult> => {
    const config = await readCommerceLinkConfig()
    const read = config ? await readRequest(ctx, ctx.networkId, config, args.requestRowId, { kind: "quote", quoteRef: args.quoteRef }, args.contract) : null
    return read ? await ctx.runMutation(finishQuoteRef, { networkId: ctx.networkId, requestRowId: args.requestRowId, rawBody: read.rawBody, ...replyFields(read.reply) }) : { outcome: "unavailable" }
  },
})

/** Refus volontaire de la version affichée ; aucun paiement ni commande de prestation. */
export const rejectQuote = networkAction({
  args: { requestRowId: v.string(), quoteRef: v.string(), quoteVersion: v.number(), consentTextVersion: v.string(), clientRequestId: v.string() },
  returns: serviceActionResultValidator,
  handler: async (ctx, args): Promise<ServiceActionResult> => {
    const config = await readCommerceLinkConfig()
    if (!config) return { outcome: "unavailable" }
    const { clientRequestId, requestRowId, ...intent } = args
    return await settle(ctx, ctx.networkId, config, await ctx.runMutation(admitQuoteRejectRef, { networkId: ctx.networkId, ...intent, ...keys(config, clientRequestId, requestRowId) }))
  },
})

export const acceptQuote = networkAction({
  args: { requestRowId: v.string(), quoteRef: v.string(), quoteVersion: v.number(), acceptedTotal: serviceMoneyValidator, consentTextVersion: v.string(), clientRequestId: v.string() },
  returns: serviceActionResultValidator,
  handler: async (ctx, args): Promise<ServiceActionResult> => {
    const config = await readCommerceLinkConfig()
    if (!config) return { outcome: "unavailable" }
    const { clientRequestId, requestRowId, ...intent } = args
    return await settle(ctx, ctx.networkId, config, await ctx.runMutation(admitQuoteAcceptRef, { networkId: ctx.networkId, ...intent, ...keys(config, clientRequestId, requestRowId) }))
  },
})

export const reschedule = networkAction({
  args: { requestRowId: v.string(), startAt: v.number(), endAt: v.number(), resourceRef: v.optional(v.string()), expectedRevision: v.number(), consentTextVersion: v.string(), clientRequestId: v.string() },
  returns: serviceActionResultValidator,
  handler: async (ctx, args): Promise<ServiceActionResult> => {
    const config = await readCommerceLinkConfig()
    if (!config) return { outcome: "unavailable" }
    const { clientRequestId, requestRowId, ...intent } = args
    return await settle(ctx, ctx.networkId, config, await ctx.runMutation(admitRescheduleRef, { networkId: ctx.networkId, ...intent, ...keys(config, clientRequestId, requestRowId) }))
  },
})

export const cancel = networkAction({
  args: { requestRowId: v.string(), expectedRevision: v.number(), consentTextVersion: v.string(), clientRequestId: v.string() },
  returns: serviceActionResultValidator,
  handler: async (ctx, args): Promise<ServiceActionResult> => {
    const config = await readCommerceLinkConfig()
    if (!config) return { outcome: "unavailable" }
    const { clientRequestId, requestRowId, ...intent } = args
    return await settle(ctx, ctx.networkId, config, await ctx.runMutation(admitCancelRef, { networkId: ctx.networkId, ...intent, ...keys(config, clientRequestId, requestRowId) }))
  },
})

/** Relire : rendez-vous servis par PRO.GA, puis état d'une commande inconnue ou ouverte. */
export const refresh = networkAction({
  args: { requestRowId: v.string() }, returns: serviceRefreshResultValidator,
  handler: async (ctx, args): Promise<ServiceRefreshResult> => {
    const config = await readCommerceLinkConfig()
    if (!config) return "unavailable"
    let result = await readBookings(ctx, ctx.networkId, config, args.requestRowId)
    const lookup = await ctx.runMutation(admitLookupRef, { networkId: ctx.networkId, requestRowId: args.requestRowId, requestId: randomLinkId(), leaseToken: randomLinkToken(), configFingerprint: config.fingerprint, resend: false })
    if (lookup) result = (await deliver(ctx, ctx.networkId, config, lookup)).outcome === "request" ? "updated" : result === "updated" ? "updated" : "unavailable"
    return result
  },
})

/**
 * Réponse perdue : consultation corrélée D'ABORD ; seulement si PRO.GA ne connaît pas la
 * demande et qu'elle peut encore s'exécuter, renvoi des MÊMES octets (jamais un nouvel envoi).
 */
export const retry = networkAction({
  args: { requestRowId: v.string() }, returns: serviceActionResultValidator,
  handler: async (ctx, args): Promise<ServiceActionResult> => {
    const config = await readCommerceLinkConfig()
    if (!config) return { outcome: "unavailable" }
    const lookup = await ctx.runMutation(admitLookupRef, { networkId: ctx.networkId, requestRowId: args.requestRowId, requestId: randomLinkId(), leaseToken: randomLinkToken(), configFingerprint: config.fingerprint, resend: false })
    if (!lookup) return { outcome: "refused" }
    const looked = await deliver(ctx, ctx.networkId, config, lookup)
    if (looked.outcome !== "request" || looked.state !== "unknown") return looked
    const resend = await ctx.runMutation(admitLookupRef, { networkId: ctx.networkId, requestRowId: args.requestRowId, requestId: randomLinkId(), leaseToken: randomLinkToken(), configFingerprint: config.fingerprint, resend: true })
    return resend ? await deliver(ctx, ctx.networkId, config, resend) : looked
  },
})
