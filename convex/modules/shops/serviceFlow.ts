/**
 * P14 : chaque échange avec PRO.GA est encadré par deux mutations corrélées à la session
 * vivante (même patron que P11) : l'admission fige l'autorité, persiste les OCTETS EXACTS de
 * la commande et pose un bail ; l'arrivée valide la réponse par le contrat (corrélation de
 * l'identifiant, de l'empreinte et du résultat) avant tout effet local. Une réponse perdue
 * laisse la commande « inconnue » : la consultation (`request.status` / `action.status`)
 * précède tout renvoi des mêmes octets ; jamais un nouvel identifiant pour la même intention.
 * La consultation exige la même personne vivante, pas la même session : une reconnexion ne
 * laisse aucune demande inconnue pour toujours.
 */
import {
  COMMERCE_COMMAND_SCOPES, parseCommerceCommandRequest, parseCommerceCommandResponse,
  type CommerceCommandRequest, type CommerceCommandResponse,
} from "@antsia/social-domain/commerce/command"
import { COMMERCE_ORDER_STATES, commerceIsTerminalState, type CommerceOrderState } from "@antsia/social-domain/commerce/lifecycle"
import {
  COMMERCE_COMMAND_CONTRACT, COMMERCE_MAX_SKEW_MS, commerceCanonicalJson, commerceCapture, commerceIsoDate, parseCommerceRef,
} from "@antsia/social-domain/commerce/primitives"
import { normalizeCivilName } from "@antsia/social-domain/civilName"
import { COMMERCE_INQUIRY_CONSENT_VERSION } from "@antsia/social-domain/commerce-inquiry"
import {
  COMMERCE_SERVICE_CONSENTS, COMMERCE_SERVICE_CONTROL_CONTRACT, COMMERCE_SERVICE_CONTROL_CONTRACT_V2, isCommerceServiceControlContract, COMMERCE_SERVICE_LIMITS, COMMERCE_SERVICE_TIME_ZONE,
  commerceServiceQuoteRequestMessage, parseCommerceServiceControlRequest, parseCommerceServiceControlResponse,
  type CommerceServiceControlContract, type CommerceServiceControlRequest, type CommerceServiceControlResponse,
} from "@antsia/social-domain/commerce-services"
import { makeFunctionReference } from "convex/server"
import { type Infer, v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../_generated/server"
import { fail } from "../../lib/errors"
import { enforceRateLimit } from "../../lib/rateLimit"
import { commercialThreadAccess } from "../commercialMessaging/access"
import { isServableStorage } from "../files/storageGuard"
import { canReadModeratedContent } from "../moderation/policy"
import { noticeServiceObservation, noticeServiceQuoteRevised, noticeServiceQuotes, noticeServiceTeam } from "../notifications/commerceEmit"
import { readCommerceLinkConfig } from "./commerceLinkConfig"
import { sha256Hex, validLinkToken } from "./commerceLinkCrypto"
import {
  existingServiceAuthority, initialServiceAuthority, liveServiceSessionDigest, ownedServiceRequest, sameServiceAuthority, quoteControlContractForRequest, serviceQuoteControlV2Enabled, matchesPublishedServicePackage,
  SERVICE_MODE_PERMISSIONS, validServiceId, type ServiceAuthority, type ServiceStrictContext,
} from "./serviceAccess"
import {
  SERVICE_BODY_TTL_MS, SERVICE_CLOSED_RETENTION_MS, SERVICE_COMMAND_OPERATIONS, SERVICE_COMMANDS_PER_REQUEST_MAX, SERVICE_CONSENT_VERSIONS,
  SERVICE_LEASE_MS, SERVICE_P06_KINDS, SERVICE_PENDING_MAX_MS, SERVICE_REQUEST_TTL_MS, bookingCanCancel, bookingCanChange, bookingSnapshotOf,
  controlResponseRequest, p06ResponseRequest, serviceActionResultValidator, serviceContactNameValidator, serviceMoneyValidator, serviceOptionsResultValidator,
  serviceControlContractValidator, serviceQuoteResultValidator, serviceQuotesResultValidator, serviceSlotsResultValidator, type ServiceActionResult, type ServiceBookingSnapshot,
  type ServiceCommandKind, type ServiceMode, type ServiceOptionsResult, type ServiceQuoteResult, type ServiceQuotesResult, type ServiceSlotsResult,
} from "./serviceRules"

type CommandRow = Doc<"commerceServiceCommands">
type RequestRow = Doc<"commerceServiceRequests">
type Envelope = Pick<ServiceAuthority, "source" | "environment" | "subjectRef" | "shopRef">
type CurrentState = { readonly objectKind: string; readonly objectRef: string; readonly revision: number; readonly state: string; readonly updatedAt: number }
type LookupStatus = { state: "completed" | "in_progress" | "unknown"; current: readonly CurrentState[]; recordedResponse?: string; recordedResponseSha256?: string }

export const serviceDeliveryValidator = v.object({
  commandId: v.string(), requestId: v.string(), rawBody: v.string(), leaseToken: v.string(),
  channel: v.union(v.literal("command"), v.literal("control")), purpose: v.union(v.literal("send"), v.literal("lookup")),
})
export type ServiceDelivery = Infer<typeof serviceDeliveryValidator>
export const serviceAdmissionValidator = v.union(serviceDeliveryValidator, serviceActionResultValidator)
/** Enveloppe de LECTURE (aucun effet chez PRO.GA) : jamais persistée, rejugée à l'arrivée. */
export const serviceReadEnvelopeValidator = v.union(v.null(), v.object({ rawBody: v.string(), requestId: v.string() }))

const expirePrivateRef = makeFunctionReference<"mutation", { commandId: string }, null>("modules/shops/serviceFlow:expirePrivate")
const purgeClosedRef = makeFunctionReference<"mutation", { requestRowId: string }, null>("modules/shops/serviceLifecycle:purgeClosed")
const closeStaleRef = makeFunctionReference<"mutation", { requestRowId: string }, null>("modules/shops/serviceLifecycle:closeStale")
const refused = (): ServiceActionResult => ({ outcome: "refused" })
const unavailable = (): ServiceActionResult => ({ outcome: "unavailable" })

// ─── Textes, dates et identifiants ───────────────────────────────────────────

/** Texte libre borné, sans caractère de contrôle ; `undefined` si vide, `null` si refusé. */
function cleanText(value: string | undefined, max: number, multiline: boolean): string | undefined | null {
  if (value === undefined) return undefined
  const text = value.normalize("NFC").replace(/\r\n?/gu, "\n").trim()
  if (text.length === 0) return undefined
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if ((code < 32 && !(multiline && code === 10)) || code === 127) return null
  }
  return text.length > max ? null : text
}
/** Date civile du jour ou future, jugée dans le fuseau de l'agenda (UTC+1, sans heure d'été). */
function futureDate(value: string | undefined, now: number): string | undefined | null {
  if (value === undefined) return undefined
  if (!commerceCapture(() => commerceIsoDate(value, "$")).ok) return null
  const today = new Date(now + 60 * 60_000).toISOString().slice(0, 10)
  return value >= today ? value : null
}
/** Nom pour le professionnel : prénom(s) et NOM structurés, normalisés par le normaliseur partagé. */
function contactDisplayName(value: { firstName: string; lastName: string } | undefined): string | undefined | null {
  if (value === undefined) return undefined
  const parts = normalizeCivilName(value)
  if (parts.firstName.length === 0 || parts.lastName.length === 0) return null
  return cleanText(`${parts.firstName} ${parts.lastName}`, COMMERCE_SERVICE_LIMITS.displayNameMax, false) ?? null
}
function refKind(value: string | undefined, kind: "agenda_resource" | "agenda_service" | "quote"): boolean {
  return value === undefined || parseCommerceRef(value)?.kind === kind
}
function channelOf(kind: ServiceCommandKind): ServiceDelivery["channel"] {
  return SERVICE_P06_KINDS.includes(kind) ? "command" : "control"
}
function isOrderState(value: string): value is CommerceOrderState {
  return (COMMERCE_ORDER_STATES as readonly string[]).includes(value)
}
function validSlot(startAt: number, endAt: number, now: number): boolean {
  return Number.isSafeInteger(startAt) && Number.isSafeInteger(endAt) && startAt > now && endAt > startAt && endAt - startAt <= COMMERCE_SERVICE_LIMITS.bookingMaxMinutes * 60_000
}

// ─── Enveloppes (octets canoniques validés par le contrat AVANT tout envoi) ──

function p06Body(envelope: Envelope, requestId: string, now: number, command: "inquiry.submit" | "quote.accept" | "booking.request" | "request.status", payload: Record<string, unknown>): string | null {
  const rawBody = commerceCanonicalJson({
    contract: COMMERCE_COMMAND_CONTRACT, version: 1, command, scope: COMMERCE_COMMAND_SCOPES[command], source: envelope.source, environment: envelope.environment,
    requestId, issuedAt: now, expiresAt: now + SERVICE_REQUEST_TTL_MS, subject: { kind: "buyer", ref: envelope.subjectRef, authVerifiedAt: now }, payload,
  })
  const parsed = rawBody ? parseCommerceCommandRequest(rawBody, { source: envelope.source, environment: envelope.environment, nowMs: now }) : null
  return rawBody && parsed?.ok && parsed.value.command === command ? rawBody : null
}
function controlBody(envelope: Envelope, requestId: string, now: number, operation: CommerceServiceControlRequest["operation"], payload: Record<string, unknown>, contract: CommerceServiceControlContract = COMMERCE_SERVICE_CONTROL_CONTRACT): string | null {
  const rawBody = commerceCanonicalJson({
    contract, version: 1, operation, source: envelope.source, environment: envelope.environment, requestId, shopRef: envelope.shopRef,
    subject: { kind: "buyer", ref: envelope.subjectRef, authVerifiedAt: now }, issuedAt: now, expiresAt: now + SERVICE_REQUEST_TTL_MS, payload,
  })
  const parsed = rawBody ? parseCommerceServiceControlRequest(rawBody, { source: envelope.source, environment: envelope.environment, nowMs: now, contract }) : null
  return rawBody && parsed?.ok && parsed.value.operation === operation ? rawBody : null
}

/** Le contrat du corps reste fermé ; le défaut du parseur de domaine reste strictement V1. */
function controlContractOf(rawBody: string): CommerceServiceControlContract | null {
  try { const value: unknown = JSON.parse(rawBody); return value && typeof value === "object" && "contract" in value && isCommerceServiceControlContract(value.contract) ? value.contract : null } catch { return null }
}

// ─── Commandes : admission ───────────────────────────────────────────────────

type CommandIds = { requestRowId: string; commandId: string; requestId: string; leaseToken: string; configFingerprint: string; clientRequestId: string }
const commandIdArgs = { requestRowId: v.string(), commandId: v.string(), requestId: v.string(), leaseToken: v.string(), configFingerprint: v.string(), clientRequestId: v.string() }
type CommandExtra = Partial<Pick<CommandRow, "quoteRef" | "quoteVersion" | "acceptedTotal" | "serviceRef" | "slotStartAt" | "slotEndAt" | "appointmentRef" | "expectedRevision" | "offerRef" | "quantity" | "expectedUnitAmount" | "expectedCatalogRevision" | "publishedPackage" | "inquiryAttachmentMessageIds">>

function validIds(input: CommandIds): boolean {
  return [input.requestRowId, input.commandId, input.requestId, input.clientRequestId].every(validServiceId) && validLinkToken(input.leaseToken)
}

/** Même clé client + même intention : même demande ; autre intention : refus, jamais un second envoi. */
async function replayByClient(ctx: MutationCtx, authority: Pick<ServiceAuthority, "personId" | "networkId">, clientRequestId: string, intentDigest: string): Promise<ServiceActionResult | null> {
  const existing = await ctx.db.query("commerceServiceCommands").withIndex("by_client", (q) => q.eq("personId", authority.personId).eq("networkId", authority.networkId).eq("clientRequestId", clientRequestId)).unique()
  if (existing) return existing.intentDigest === intentDigest && existing.cancelledAt === undefined
    ? { outcome: "request", requestRowId: existing.requestRowId, state: existing.state, reason: existing.reason ?? null } : refused()
  // Même transaction que l'insertion : une clé clôturée ne peut plus être admise, quel que soit le parcours.
  const fence = await ctx.db.query("serviceClientIntentFences").withIndex("by_client", (q) => q.eq("personId", authority.personId).eq("networkId", authority.networkId).eq("clientRequestId", clientRequestId)).unique()
  return fence ? refused() : null
}

/** Une seule intention en vol par demande, et un nombre borné de commandes. */
async function commandRoom(ctx: MutationCtx, requestRowId: string): Promise<"free" | "busy" | "full"> {
  // borné : au plus SERVICE_COMMANDS_PER_REQUEST_MAX commandes par demande.
  const recent = await ctx.db.query("commerceServiceCommands").withIndex("by_request_row", (q) => q.eq("requestRowId", requestRowId)).order("desc").take(SERVICE_COMMANDS_PER_REQUEST_MAX)
  if (recent[0]?.state === "unknown") return "busy"
  return recent.length >= SERVICE_COMMANDS_PER_REQUEST_MAX ? "full" : "free"
}

async function insertCommand(ctx: MutationCtx, input: {
  authority: ServiceAuthority; ids: CommandIds; kind: ServiceCommandKind; intentDigest: string; rawBody: string; now: number; extra: CommandExtra;
}): Promise<ServiceDelivery> {
  const { authority, ids: key, now } = input
  await ctx.db.insert("commerceServiceCommands", {
    ...authority, requestRowId: key.requestRowId, commandId: key.commandId, kind: input.kind, clientRequestId: key.clientRequestId, intentDigest: input.intentDigest,
    requestId: key.requestId, bodySha256: await sha256Hex(input.rawBody), rawBody: input.rawBody, issuedAt: now, expiresAt: now + SERVICE_REQUEST_TTL_MS,
    privateUntil: now + SERVICE_BODY_TTL_MS, state: "unknown", leaseToken: key.leaseToken, leaseUntil: now + SERVICE_LEASE_MS, leaseSessionDigest: authority.sessionDigest,
    consentTextVersion: SERVICE_CONSENT_VERSIONS[input.kind], consentedAt: now, ...input.extra, createdAt: now, updatedAt: now,
  })
  await ctx.scheduler.runAfter(SERVICE_BODY_TTL_MS, expirePrivateRef, { commandId: key.commandId })
  return { commandId: key.commandId, requestId: key.requestId, rawBody: input.rawBody, leaseToken: key.leaseToken, channel: channelOf(input.kind), purpose: "send" }
}

async function insertRequest(ctx: MutationCtx, authority: ServiceAuthority, input: { requestRowId: string; mode: ServiceMode; offerRef: string; offerTitle: string; now: number } & Partial<Pick<RequestRow, "threadId" | "conversationRef" | "desiredDate" | "chosenAttachmentCount" | "serviceRef" | "serviceLabel">>): Promise<void> {
  const { requestRowId, mode, offerRef, offerTitle, now, ...rest } = input
  // Identifiant frappé par l'action ; une collision est une faute, jamais un écrasement.
  if (await ctx.db.query("commerceServiceRequests").withIndex("by_request", (q) => q.eq("requestRowId", requestRowId)).unique()) fail("invalidArgument", { field: "requestRowId" })
  await ctx.db.insert("commerceServiceRequests", {
    networkId: authority.networkId, shopId: authority.shopId, personId: authority.personId, handle: authority.handle, requestRowId, mode, offerRef, offerTitle,
    source: authority.source, environment: authority.environment, shopRef: authority.shopRef, linkRef: authority.linkRef, subjectRef: authority.subjectRef,
    state: "pending", ...rest, createdAt: now, updatedAt: now,
  })
  await ctx.scheduler.runAfter(SERVICE_PENDING_MAX_MS, closeStaleRef, { requestRowId })
}

/** Demande de devis : `inquiry.submit` P06 (kind `quote_request`) depuis une conversation ACCEPTÉE. */
export const admitQuoteRequest = internalMutation({
  args: {
    networkId: v.id("networks"), handle: v.string(), offerRef: v.string(), threadId: v.id("commercialThreads"),
    need: v.string(), constraints: v.optional(v.string()), desiredDate: v.optional(v.string()), quantity: v.optional(v.number()),
    attachmentMessageIds: v.array(v.id("commercialMessages")), consentTextVersion: v.string(), ...commandIdArgs,
  },
  returns: serviceAdmissionValidator,
  handler: async (ctx, args): Promise<ServiceDelivery | ServiceActionResult> => {
    if (args.consentTextVersion !== COMMERCE_INQUIRY_CONSENT_VERSION || !validIds(args) || args.attachmentMessageIds.length > COMMERCE_SERVICE_LIMITS.quoteAttachmentsMax) return refused()
    const admitted = await initialServiceAuthority(ctx, args.networkId, args.handle, args.offerRef, "quote")
    if (!admitted || admitted.authority.configFingerprint !== args.configFingerprint) return refused()
    const { authority, offer } = admitted
    await enforceRateLimit(ctx, "shop.service.request", authority.personId)
    const now = Date.now()
    const constraints = cleanText(args.constraints, COMMERCE_SERVICE_LIMITS.quoteConstraintsMax, true)
    const desiredDate = futureDate(args.desiredDate, now)
    if (constraints === null || desiredDate === null || (args.quantity !== undefined && (!Number.isSafeInteger(args.quantity) || args.quantity < 1 || args.quantity > 999))) return refused()
    // La conversation commerciale P10 doit être ACCEPTÉE par CETTE boutique : aucun contournement de sa garde.
    const thread = await commercialThreadAccess(ctx, args.networkId, authority.personId, args.threadId)
    if (!thread || thread.viewerKind !== "requester" || thread.thread.state !== "accepted" || thread.shop._id !== authority.shopId ||
      (thread.thread.offerRef !== undefined && thread.thread.offerRef !== args.offerRef)) return refused()
    // Pièces ADMISES choisies : mes propres messages de cette conversation, lisibles et servables par la garde.
    const chosen = [...new Set(args.attachmentMessageIds)]
    let attachmentCount = 0
    for (const messageId of chosen) {
      const message = await ctx.db.get(messageId)
      if (!message || message.networkId !== args.networkId || message.threadId !== args.threadId || message.senderPersonId !== authority.personId || message.deletedAt !== undefined || !message.attachmentFiles?.length ||
        attachmentCount + message.attachmentFiles.length > COMMERCE_SERVICE_LIMITS.quoteAttachmentsMax ||
        !await canReadModeratedContent(ctx, "commercialMessage", message._id, authority.personId)) return refused()
      for (const file of message.attachmentFiles) if (!await isServableStorage(ctx, file.storageId)) return refused()
      attachmentCount += message.attachmentFiles.length
    }
    const message = commerceServiceQuoteRequestMessage({ need: args.need, ...(constraints ? { constraints } : {}), attachmentCount })
    if (message === null) return refused()
    const intent = commerceCanonicalJson({ kind: "inquiry", handle: args.handle, offerRef: args.offerRef, threadId: args.threadId, message, desiredDate: desiredDate ?? null, quantity: args.quantity ?? null, attachments: chosen.sort() })
    if (!intent) return refused()
    const intentDigest = await sha256Hex(intent)
    const replay = await replayByClient(ctx, authority, args.clientRequestId, intentDigest)
    if (replay) return replay
    const rawBody = p06Body(authority, args.requestId, now, "inquiry.submit", {
      shopRef: authority.shopRef, conversationRef: thread.thread.conversationRef, kind: "quote_request", message, offerRef: args.offerRef,
      consent: { purpose: "commerce_inquiry", textVersion: COMMERCE_INQUIRY_CONSENT_VERSION, givenAt: now },
      ...(desiredDate ? { desiredDate } : {}), ...(args.quantity !== undefined ? { quantity: args.quantity } : {}),
    })
    if (!rawBody) return refused()
    await insertRequest(ctx, authority, { requestRowId: args.requestRowId, mode: "quote", offerRef: args.offerRef, offerTitle: offer.title, now, threadId: args.threadId,
      conversationRef: thread.thread.conversationRef, ...(desiredDate ? { desiredDate } : {}), chosenAttachmentCount: attachmentCount })
    return await insertCommand(ctx, { authority, ids: args, kind: "inquiry", intentDigest, rawBody, now, extra: { inquiryAttachmentMessageIds: chosen } })
  },
})

/** Rendez-vous : `booking.request` P06 sur un créneau proposé par PRO.GA, instant et fuseau explicites. */
export const admitBooking = internalMutation({
  args: {
    networkId: v.id("networks"), handle: v.string(), offerRef: v.string(), serviceRef: v.string(), serviceLabel: v.string(), resourceRef: v.optional(v.string()),
    startAt: v.number(), endAt: v.number(), note: v.optional(v.string()), contactName: v.optional(serviceContactNameValidator), consentTextVersion: v.string(), ...commandIdArgs,
  },
  returns: serviceAdmissionValidator,
  handler: async (ctx, args): Promise<ServiceDelivery | ServiceActionResult> => {
    if (args.consentTextVersion !== COMMERCE_SERVICE_CONSENTS.booking.textVersion || !validIds(args) || !refKind(args.serviceRef, "agenda_service") || !refKind(args.resourceRef, "agenda_resource")) return refused()
    const admitted = await initialServiceAuthority(ctx, args.networkId, args.handle, args.offerRef, "booking")
    if (!admitted || admitted.authority.configFingerprint !== args.configFingerprint) return refused()
    const { authority, offer } = admitted
    await enforceRateLimit(ctx, "shop.service.book", authority.personId)
    const now = Date.now()
    const note = cleanText(args.note, COMMERCE_SERVICE_LIMITS.noteMax, true), displayName = contactDisplayName(args.contactName)
    const serviceLabel = cleanText(args.serviceLabel, COMMERCE_SERVICE_LIMITS.labelMax, false)
    if (note === null || displayName === null || !serviceLabel || !validSlot(args.startAt, args.endAt, now)) return refused()
    const intent = commerceCanonicalJson({ kind: "booking", handle: args.handle, offerRef: args.offerRef, serviceRef: args.serviceRef, resourceRef: args.resourceRef ?? null, startAt: args.startAt, endAt: args.endAt, note: note ?? null, displayName: displayName ?? null })
    if (!intent) return refused()
    const intentDigest = await sha256Hex(intent)
    const replay = await replayByClient(ctx, authority, args.clientRequestId, intentDigest)
    if (replay) return replay
    const rawBody = p06Body(authority, args.requestId, now, "booking.request", {
      shopRef: authority.shopRef, serviceRef: args.serviceRef, offerRef: args.offerRef, ...(args.resourceRef ? { resourceRef: args.resourceRef } : {}),
      slot: { startAt: args.startAt, endAt: args.endAt, timeZone: COMMERCE_SERVICE_TIME_ZONE },
      consent: { purpose: COMMERCE_SERVICE_CONSENTS.booking.purpose, textVersion: COMMERCE_SERVICE_CONSENTS.booking.textVersion, givenAt: now },
      ...(note ? { note } : {}), ...(displayName ? { displayName } : {}),
    })
    if (!rawBody) return refused()
    await insertRequest(ctx, authority, { requestRowId: args.requestRowId, mode: "booking", offerRef: args.offerRef, offerTitle: offer.title, now, serviceRef: args.serviceRef, serviceLabel })
    return await insertCommand(ctx, { authority, ids: args, kind: "booking", intentDigest, rawBody, now, extra: { serviceRef: args.serviceRef, slotStartAt: args.startAt, slotEndAt: args.endAt } })
  },
})

/** Prestation à tarif fixe sans créneau : extension `service.order.request`, sans stock ni paiement. */
export const admitServiceOrder = internalMutation({
  args: {
    networkId: v.id("networks"), handle: v.string(), offerRef: v.string(), quantity: v.number(), expectedUnitAmount: serviceMoneyValidator, expectedCatalogRevision: v.number(),
    desiredDate: v.optional(v.string()), note: v.optional(v.string()), contactName: v.optional(serviceContactNameValidator), consentTextVersion: v.string(),
    existingRequestRowId: v.optional(v.string()), publishedPackage: v.optional(v.literal(true)), ...commandIdArgs,
  },
  returns: serviceAdmissionValidator,
  handler: async (ctx, args): Promise<ServiceDelivery | ServiceActionResult> => {
    if (args.consentTextVersion !== COMMERCE_SERVICE_CONSENTS.service_order.textVersion || !validIds(args) || !Number.isSafeInteger(args.quantity) || args.quantity < 1 ||
      args.quantity > COMMERCE_SERVICE_LIMITS.orderQuantityMax || !Number.isSafeInteger(args.expectedUnitAmount.amount) || args.expectedUnitAmount.amount < 1 ||
      !Number.isSafeInteger(args.expectedCatalogRevision) || args.expectedCatalogRevision < 1) return refused()
    const admitted = await initialServiceAuthority(ctx, args.networkId, args.handle, args.offerRef, "fixed_order")
    if (!admitted || admitted.authority.configFingerprint !== args.configFingerprint) return refused()
    const { authority, offer } = admitted
    if (args.publishedPackage && !matchesPublishedServicePackage(offer, { revision: args.expectedCatalogRevision, unitAmount: args.expectedUnitAmount })) return refused()
    await enforceRateLimit(ctx, "shop.service.order", authority.personId)
    const now = Date.now()
    const note = cleanText(args.note, COMMERCE_SERVICE_LIMITS.noteMax, true), displayName = contactDisplayName(args.contactName)
    const desiredDate = futureDate(args.desiredDate, now)
    if (note === null || displayName === null || desiredDate === null) return refused()
    const intent = commerceCanonicalJson({ kind: "order", handle: args.handle, offerRef: args.offerRef, quantity: args.quantity, expectedUnitAmount: args.expectedUnitAmount, expectedCatalogRevision: args.expectedCatalogRevision, desiredDate: desiredDate ?? null, note: note ?? null, displayName: displayName ?? null, existing: args.existingRequestRowId ?? null, ...(args.publishedPackage ? { publishedPackage: true } : {}) })
    if (!intent) return refused()
    const intentDigest = await sha256Hex(intent)
    const replay = await replayByClient(ctx, authority, args.clientRequestId, intentDigest)
    if (replay) return replay
    // Reconfirmation d'un nouveau prix : la MÊME demande reçoit une nouvelle commande signée, au prix montré.
    let requestRowId = args.requestRowId
    if (args.existingRequestRowId !== undefined) {
      const prior = await ownedServiceRequest(ctx, args.networkId, args.existingRequestRowId)
      const last = prior ? await ctx.db.query("commerceServiceCommands").withIndex("by_request_row", (q) => q.eq("requestRowId", prior.requestRowId)).order("desc").first() : null
      if (!prior || prior.mode !== "fixed_order" || prior.state !== "pending" || prior.offerRef !== args.offerRef || prior.shopId !== authority.shopId || !last || last.kind !== "order" || last.state !== "reconfirm" ||
        last.currentUnitAmount?.amount !== args.expectedUnitAmount.amount || last.currentCatalogRevision !== args.expectedCatalogRevision || await commandRoom(ctx, prior.requestRowId) !== "free") return refused()
      requestRowId = prior.requestRowId
    }
    const rawBody = controlBody(authority, args.requestId, now, "service.order.request", {
      offerRef: args.offerRef, quantity: args.quantity, expectedUnitAmount: { ...args.expectedUnitAmount }, expectedCatalogRevision: args.expectedCatalogRevision,
      consent: { purpose: COMMERCE_SERVICE_CONSENTS.service_order.purpose, textVersion: COMMERCE_SERVICE_CONSENTS.service_order.textVersion, givenAt: now },
      ...(desiredDate ? { desiredDate } : {}), ...(note ? { note } : {}), ...(displayName ? { displayName } : {}),
    })
    if (!rawBody) return refused()
    if (args.existingRequestRowId === undefined) {
      await insertRequest(ctx, authority, { requestRowId, mode: "fixed_order", offerRef: args.offerRef, offerTitle: offer.title, now, ...(desiredDate ? { desiredDate } : {}) })
    }
    return await insertCommand(ctx, { authority, ids: { ...args, requestRowId }, kind: "order", intentDigest, rawBody, now,
      extra: { offerRef: args.offerRef, quantity: args.quantity, expectedUnitAmount: { ...args.expectedUnitAmount }, expectedCatalogRevision: args.expectedCatalogRevision, ...(args.publishedPackage ? { publishedPackage: true } : {}) } })
  },
})

/** Acceptation d'un devis : version et total EXACTS affichés à la personne (`quote.accept` P06). */
export const admitQuoteAccept = internalMutation({
  args: { networkId: v.id("networks"), quoteRef: v.string(), quoteVersion: v.number(), acceptedTotal: serviceMoneyValidator, consentTextVersion: v.string(), ...commandIdArgs },
  returns: serviceAdmissionValidator,
  handler: async (ctx, args): Promise<ServiceDelivery | ServiceActionResult> => {
    if (args.consentTextVersion !== COMMERCE_SERVICE_CONSENTS.quote_acceptance.textVersion || !validIds(args) || !refKind(args.quoteRef, "quote") ||
      !Number.isSafeInteger(args.quoteVersion) || args.quoteVersion < 1 || !Number.isSafeInteger(args.acceptedTotal.amount) || args.acceptedTotal.amount < 1) return refused()
    const row = await ownedServiceRequest(ctx, args.networkId, args.requestRowId)
    if (!row || row.mode !== "quote" || row.state !== "active" || !row.inquiryRef) return refused()
    const admitted = await initialServiceAuthority(ctx, args.networkId, row.handle, row.offerRef, "quote")
    if (!admitted || admitted.authority.configFingerprint !== args.configFingerprint || admitted.authority.subjectRef !== row.subjectRef || admitted.authority.shopRef !== row.shopRef) return refused()
    const { authority } = admitted
    await enforceRateLimit(ctx, "shop.service.accept", authority.personId)
    const intent = commerceCanonicalJson({ kind: "quote_accept", requestRowId: row.requestRowId, quoteRef: args.quoteRef, quoteVersion: args.quoteVersion, acceptedTotal: args.acceptedTotal })
    if (!intent) return refused()
    const intentDigest = await sha256Hex(intent)
    const replay = await replayByClient(ctx, authority, args.clientRequestId, intentDigest)
    if (replay) return replay
    if (row.rejectedQuote?.quoteRef === args.quoteRef && row.rejectedQuote.quoteVersion === args.quoteVersion || await commandRoom(ctx, row.requestRowId) !== "free") return refused()
    const now = Date.now()
    const rawBody = p06Body(authority, args.requestId, now, "quote.accept", {
      shopRef: authority.shopRef, quoteRef: args.quoteRef, quoteVersion: args.quoteVersion, acceptedTotal: { ...args.acceptedTotal },
      consent: { purpose: COMMERCE_SERVICE_CONSENTS.quote_acceptance.purpose, textVersion: COMMERCE_SERVICE_CONSENTS.quote_acceptance.textVersion, givenAt: now },
    })
    if (!rawBody) return refused()
    return await insertCommand(ctx, { authority, ids: { ...args, requestRowId: row.requestRowId }, kind: "quote_accept", intentDigest, rawBody, now,
      extra: { quoteRef: args.quoteRef, quoteVersion: args.quoteVersion, acceptedTotal: { ...args.acceptedTotal } } })
  },
})

/** MP06 : refus client V2, version et consentement propres ; même verrou que l'acceptation. */
export const admitQuoteReject = internalMutation({
  args: { networkId: v.id("networks"), quoteRef: v.string(), quoteVersion: v.number(), consentTextVersion: v.string(), ...commandIdArgs },
  returns: serviceAdmissionValidator,
  handler: async (ctx, args): Promise<ServiceDelivery | ServiceActionResult> => {
    if (!serviceQuoteControlV2Enabled() || args.consentTextVersion !== COMMERCE_SERVICE_CONSENTS.quote_rejection.textVersion || !validIds(args) || !refKind(args.quoteRef, "quote") || !Number.isSafeInteger(args.quoteVersion) || args.quoteVersion < 1) return refused()
    const row = await ownedServiceRequest(ctx, args.networkId, args.requestRowId)
    if (!row || row.mode !== "quote" || row.state !== "active" || !row.inquiryRef || await quoteControlContractForRequest(ctx, row) !== COMMERCE_SERVICE_CONTROL_CONTRACT_V2) return refused()
    const admitted = await initialServiceAuthority(ctx, args.networkId, row.handle, row.offerRef, "quote")
    if (!admitted || admitted.authority.configFingerprint !== args.configFingerprint || admitted.authority.subjectRef !== row.subjectRef || admitted.authority.shopRef !== row.shopRef) return refused()
    const { authority } = admitted
    // Accepter et refuser partagent le même seau et le même verrou transactionnel.
    await enforceRateLimit(ctx, "shop.service.accept", authority.personId)
    const intent = commerceCanonicalJson({ kind: "quote_reject", requestRowId: row.requestRowId, quoteRef: args.quoteRef, quoteVersion: args.quoteVersion })
    if (!intent) return refused()
    const intentDigest = await sha256Hex(intent), replay = await replayByClient(ctx, authority, args.clientRequestId, intentDigest)
    if (replay) return replay
    if (row.acceptedQuote || row.order || row.rejectedQuote?.quoteRef === args.quoteRef && row.rejectedQuote.quoteVersion === args.quoteVersion || await commandRoom(ctx, row.requestRowId) !== "free") return refused()
    const now = Date.now()
    const rawBody = controlBody(authority, args.requestId, now, "service.quote.reject", { quoteRef: args.quoteRef, quoteVersion: args.quoteVersion, consent: { purpose: COMMERCE_SERVICE_CONSENTS.quote_rejection.purpose, textVersion: COMMERCE_SERVICE_CONSENTS.quote_rejection.textVersion, givenAt: now } }, COMMERCE_SERVICE_CONTROL_CONTRACT_V2)
    if (!rawBody) return refused()
    return await insertCommand(ctx, { authority, ids: { ...args, requestRowId: row.requestRowId }, kind: "quote_reject", intentDigest, rawBody, now, extra: { quoteRef: args.quoteRef, quoteVersion: args.quoteVersion } })
  },
})

/** Changement de créneau : l’ancien rendez-vous reste si l’échange échoue. */
export const admitReschedule = internalMutation({
  args: { networkId: v.id("networks"), startAt: v.number(), endAt: v.number(), resourceRef: v.optional(v.string()), expectedRevision: v.number(), consentTextVersion: v.string(), ...commandIdArgs },
  returns: serviceAdmissionValidator,
  handler: async (ctx, args): Promise<ServiceDelivery | ServiceActionResult> => {
    if (args.consentTextVersion !== COMMERCE_SERVICE_CONSENTS.booking_change.textVersion || !validIds(args) || !refKind(args.resourceRef, "agenda_resource")) return refused()
    const row = await ownedServiceRequest(ctx, args.networkId, args.requestRowId)
    const now = Date.now()
    if (!row || row.mode !== "booking" || row.state !== "active" || !row.booking || row.pendingReplacement || row.booking.revision !== args.expectedRevision ||
      !bookingCanChange(row.booking, now) || !validSlot(args.startAt, args.endAt, now)) return refused()
    const admitted = await initialServiceAuthority(ctx, args.networkId, row.handle, row.offerRef, "booking")
    if (!admitted || admitted.authority.configFingerprint !== args.configFingerprint || admitted.authority.subjectRef !== row.subjectRef || admitted.authority.shopRef !== row.shopRef) return refused()
    const { authority } = admitted
    await enforceRateLimit(ctx, "shop.service.change", authority.personId)
    const appointmentRef = row.booking.appointmentRef
    const intent = commerceCanonicalJson({ kind: "reschedule", requestRowId: row.requestRowId, appointmentRef, startAt: args.startAt, endAt: args.endAt, resourceRef: args.resourceRef ?? null, expectedRevision: args.expectedRevision })
    if (!intent) return refused()
    const intentDigest = await sha256Hex(intent)
    const replay = await replayByClient(ctx, authority, args.clientRequestId, intentDigest)
    if (replay) return replay
    if (await commandRoom(ctx, row.requestRowId) !== "free") return refused()
    const rawBody = controlBody(authority, args.requestId, now, "booking.reschedule.request", {
      appointmentRef, expectedRevision: args.expectedRevision, ...(args.resourceRef ? { resourceRef: args.resourceRef } : {}),
      slot: { startAt: args.startAt, endAt: args.endAt, timeZone: COMMERCE_SERVICE_TIME_ZONE },
      consent: { purpose: COMMERCE_SERVICE_CONSENTS.booking_change.purpose, textVersion: COMMERCE_SERVICE_CONSENTS.booking_change.textVersion, givenAt: now },
    })
    if (!rawBody) return refused()
    return await insertCommand(ctx, { authority, ids: { ...args, requestRowId: row.requestRowId }, kind: "reschedule", intentDigest, rawBody, now,
      extra: { appointmentRef, expectedRevision: args.expectedRevision, slotStartAt: args.startAt, slotEndAt: args.endAt } })
  },
})

/** Annulation : reste possible après le retrait public de la vitrine (engagement existant). */
export const admitCancel = internalMutation({
  args: { networkId: v.id("networks"), expectedRevision: v.number(), consentTextVersion: v.string(), ...commandIdArgs },
  returns: serviceAdmissionValidator,
  handler: async (ctx, args): Promise<ServiceDelivery | ServiceActionResult> => {
    if (args.consentTextVersion !== COMMERCE_SERVICE_CONSENTS.booking_cancel.textVersion || !validIds(args)) return refused()
    const row = await ownedServiceRequest(ctx, args.networkId, args.requestRowId)
    const now = Date.now()
    if (!row || row.mode !== "booking" || row.state !== "active" || !row.booking || row.booking.revision !== args.expectedRevision || !bookingCanCancel(row.booking, now)) return refused()
    const authority = await existingServiceAuthority(ctx, row)
    if (!authority || authority.configFingerprint !== args.configFingerprint) return refused()
    await enforceRateLimit(ctx, "shop.service.change", authority.personId)
    const appointmentRef = row.booking.appointmentRef
    const intent = commerceCanonicalJson({ kind: "cancel", requestRowId: row.requestRowId, appointmentRef, expectedRevision: args.expectedRevision })
    if (!intent) return refused()
    const intentDigest = await sha256Hex(intent)
    const replay = await replayByClient(ctx, authority, args.clientRequestId, intentDigest)
    if (replay) return replay
    // Une annulation n'est jamais bloquée par le plafond, seulement par une intention encore en vol.
    if (await commandRoom(ctx, row.requestRowId) === "busy") return refused()
    const rawBody = controlBody(authority, args.requestId, now, "booking.cancel.request", {
      appointmentRef, expectedRevision: args.expectedRevision,
      consent: { purpose: COMMERCE_SERVICE_CONSENTS.booking_cancel.purpose, textVersion: COMMERCE_SERVICE_CONSENTS.booking_cancel.textVersion, givenAt: now },
    })
    if (!rawBody) return refused()
    return await insertCommand(ctx, { authority, ids: { ...args, requestRowId: row.requestRowId }, kind: "cancel", intentDigest, rawBody, now,
      extra: { appointmentRef, expectedRevision: args.expectedRevision } })
  },
})

// ─── Commandes : consultation, renvoi des mêmes octets ───────────────────────

async function ownedCommand(ctx: MutationCtx, networkId: Id<"networks">, commandId: string): Promise<{ command: CommandRow; row: RequestRow } | null> {
  if (!validServiceId(commandId)) return null
  const command = await ctx.db.query("commerceServiceCommands").withIndex("by_command", (q) => q.eq("commandId", commandId)).unique()
  if (!command || command.networkId !== networkId || command.cancelledAt !== undefined) return null
  const row = await ownedServiceRequest(ctx, networkId, command.requestRowId)
  return row && row.personId === command.personId ? { command, row } : null
}

/**
 * La commande à consulter : la dernière si elle est encore inconnue ; sinon celle qui a ouvert
 * la commande PRO.GA de la demande, tant que cette commande n'est pas terminée (état servi).
 */
async function lookupTarget(ctx: MutationCtx, row: RequestRow, resend: boolean): Promise<CommandRow | null> {
  // borné : au plus SERVICE_COMMANDS_PER_REQUEST_MAX commandes par demande.
  const recent = await ctx.db.query("commerceServiceCommands").withIndex("by_request_row", (q) => q.eq("requestRowId", row.requestRowId)).order("desc").take(SERVICE_COMMANDS_PER_REQUEST_MAX)
  const last = recent[0]
  if (last?.state === "unknown") return last
  const order = row.order
  if (resend || !order || commerceIsTerminalState("order", order.state)) return null
  return recent.find((command) => command.resultRef === order.orderRef && (command.kind === "order" || command.kind === "quote_accept")) ?? null
}

function lookupBody(command: CommandRow, requestId: string, now: number): string | null {
  const target = SERVICE_COMMAND_OPERATIONS[command.kind]
  if (target === "inquiry.submit" || target === "quote.accept" || target === "booking.request") {
    return p06Body(command, requestId, now, "request.status", { targetCommand: target, targetRequestId: command.requestId, targetRequestSha256: command.bodySha256 })
  }
  return controlBody(command, requestId, now, "action.status", { targetOperation: target, targetRequestId: command.requestId, targetRequestSha256: command.bodySha256 }, command.kind === "quote_reject" ? COMMERCE_SERVICE_CONTROL_CONTRACT_V2 : COMMERCE_SERVICE_CONTROL_CONTRACT)
}

export const admitLookup = internalMutation({
  args: { networkId: v.id("networks"), requestRowId: v.string(), requestId: v.string(), leaseToken: v.string(), configFingerprint: v.string(), resend: v.boolean() },
  returns: v.union(serviceDeliveryValidator, v.null()),
  handler: async (ctx, args): Promise<ServiceDelivery | null> => {
    const row = await ownedServiceRequest(ctx, args.networkId, args.requestRowId)
    if (!row || !validServiceId(args.requestId) || !validLinkToken(args.leaseToken)) return null
    const now = Date.now()
    const command = await lookupTarget(ctx, row, args.resend)
    if (!command || command.cancelledAt !== undefined || (command.leaseUntil ?? 0) > now || command.configFingerprint !== args.configFingerprint) return null
    const sessionDigest = await liveServiceSessionDigest(ctx, command)
    if (!sessionDigest) return null
    await enforceRateLimit(ctx, "shop.service.status", row.personId)
    if (args.resend) {
      // Renvoi des MÊMES octets : seulement avant expiration, après une consultation récente restée « inconnue ».
      if (!command.rawBody || command.privateUntil <= now || command.expiresAt <= now || command.lookupState !== "unknown" || command.lookupSessionDigest !== sessionDigest || (command.lastLookupAt ?? 0) < now - 10_000 ||
        await sha256Hex(command.rawBody) !== command.bodySha256) return null
      await ctx.db.patch(command._id, { leaseToken: args.leaseToken, leaseUntil: now + SERVICE_LEASE_MS, leaseSessionDigest: sessionDigest, updatedAt: now })
      return { commandId: command.commandId, requestId: command.requestId, rawBody: command.rawBody, leaseToken: args.leaseToken, channel: channelOf(command.kind), purpose: "send" }
    }
    const rawBody = lookupBody(command, args.requestId, now)
    if (!rawBody) return null
    // Une consultation indisponible ne peut pas réutiliser le « unknown » d'une consultation précédente.
    await ctx.db.patch(command._id, { leaseToken: args.leaseToken, leaseUntil: now + SERVICE_LEASE_MS, leaseSessionDigest: sessionDigest, lookupState: undefined, lastLookupAt: undefined, lookupSessionDigest: undefined, updatedAt: now })
    return { commandId: command.commandId, requestId: args.requestId, rawBody, leaseToken: args.leaseToken, channel: channelOf(command.kind), purpose: "lookup" }
  },
})

// ─── Commandes : autorisation juste avant l'envoi ────────────────────────────

/** Un nouvel engagement relit vitrine, liaison et permission ; l'annulation, la seule session. */
function strictFor(command: CommandRow, row: RequestRow): ServiceStrictContext | null {
  if (command.kind === "cancel") return null
  const mode: ServiceMode = command.kind === "inquiry" || command.kind === "quote_accept" || command.kind === "quote_reject" ? "quote" : command.kind === "order" ? "fixed_order" : "booking"
  return { offerRef: row.offerRef, mode, ...(command.kind === "order" && command.publishedPackage ? { publishedPackage: { revision: command.expectedCatalogRevision ?? 0, unitAmount: command.expectedUnitAmount ?? { amount: 0, currency: "XAF" as const } } } : {}) }
}

/** Seules les pièces explicitement choisies sont relues ; une ancienne commande sans preuve ne repart pas. */
async function inquiryStillAuthorized(ctx: MutationCtx, command: CommandRow, row: RequestRow): Promise<boolean> {
  if (command.kind !== "inquiry") return true
  const chosen = command.inquiryAttachmentMessageIds
  if (!row.threadId || chosen === undefined || chosen.length > COMMERCE_SERVICE_LIMITS.quoteAttachmentsMax || new Set(chosen).size !== chosen.length) return false
  const access = await commercialThreadAccess(ctx, command.networkId, command.personId, row.threadId)
  if (!access || access.viewerKind !== "requester" || access.blocked || access.thread.state !== "accepted" || access.shop._id !== command.shopId ||
    access.thread.conversationRef !== row.conversationRef || (access.thread.offerRef !== undefined && access.thread.offerRef !== row.offerRef)) return false
  let count = 0
  for (const messageId of chosen) {
    const message = await ctx.db.get(messageId)
    if (!message || message.networkId !== command.networkId || message.threadId !== row.threadId || message.senderPersonId !== command.personId ||
      message.deletedAt !== undefined || !message.attachmentFiles?.length || count + message.attachmentFiles.length > COMMERCE_SERVICE_LIMITS.quoteAttachmentsMax ||
      !await canReadModeratedContent(ctx, "commercialMessage", message._id, command.personId)) return false
    for (const file of message.attachmentFiles) if (!await isServableStorage(ctx, file.storageId)) return false
    count += message.attachmentFiles.length
  }
  return count === row.chosenAttachmentCount
}

function leaseAuthority(command: CommandRow): ServiceAuthority {
  return { ...command, sessionDigest: command.leaseSessionDigest ?? command.sessionDigest }
}

export const authorize = internalMutation({
  args: { networkId: v.id("networks"), delivery: serviceDeliveryValidator, configFingerprint: v.string() }, returns: v.boolean(),
  handler: async (ctx, args) => {
    const owned = await ownedCommand(ctx, args.networkId, args.delivery.commandId)
    if (!owned) return false
    const { command, row } = owned, now = Date.now(), delivery = args.delivery
    if (command.leaseToken !== delivery.leaseToken || (command.leaseUntil ?? 0) <= now || command.configFingerprint !== args.configFingerprint || delivery.channel !== channelOf(command.kind)) return false
    if (delivery.purpose === "lookup") return await sameServiceAuthority(ctx, leaseAuthority(command), null)
    if (command.kind === "quote_reject" && !serviceQuoteControlV2Enabled()) return false
    if (command.state !== "unknown" || command.rawBody !== delivery.rawBody || command.requestId !== delivery.requestId || command.expiresAt <= now ||
      await sha256Hex(delivery.rawBody) !== command.bodySha256) return false
    return await sameServiceAuthority(ctx, leaseAuthority(command), strictFor(command, row)) && await inquiryStillAuthorized(ctx, command, row)
  },
})

// ─── Commandes : arrivée et effets locaux ────────────────────────────────────

/** Une demande se ferme quand son objet PRO.GA est terminé ; sa trace minimale est purgée plus tard. */
function settles(row: RequestRow, patch: Partial<RequestRow>): boolean {
  const booking = "booking" in patch ? patch.booking : row.booking
  const pending = "pendingReplacement" in patch ? patch.pendingReplacement : row.pendingReplacement
  const order = "order" in patch ? patch.order : row.order
  if (row.mode === "booking") return booking !== undefined && commerceIsTerminalState("booking", booking.state) && pending === undefined
  return order !== undefined && commerceIsTerminalState("order", order.state)
}

async function settleRequest(ctx: MutationCtx, row: RequestRow, patch: Partial<RequestRow>, now: number): Promise<void> {
  const failed = patch.state === "failed"
  if (!failed && !settles(row, patch)) {
    await ctx.db.patch(row._id, { ...patch, updatedAt: now })
  } else {
    const purgeAt = now + SERVICE_CLOSED_RETENTION_MS
    await ctx.db.patch(row._id, { ...patch, state: failed ? "failed" : "closed", purgeAt, updatedAt: now })
    await ctx.scheduler.runAt(purgeAt, purgeClosedRef, { requestRowId: row.requestRowId })
  }
  // P14B : décisions du PROFESSIONNEL apprises par cette observation (état servi, jamais un clic local).
  await noticeServiceObservation(ctx, row, patch)
}

/** Une commande restée inconnue au-delà de son expiration (tolérance comprise) ne s'exécutera jamais. */
async function expireCommand(ctx: MutationCtx, command: CommandRow, row: RequestRow, now: number): Promise<void> {
  await ctx.db.patch(command._id, { state: "expired", reason: "request_expired", rawBody: undefined, updatedAt: now })
  const initial = command.kind === "inquiry" || command.kind === "booking" || (command.kind === "order" && row.order === undefined)
  if (initial && row.state === "pending") await settleRequest(ctx, row, { state: "failed", reason: "request_expired" }, now)
}

/** Applique une réponse P06 VALIDÉE ; les issues non définitives laissent la commande inconnue. */
async function applyP06(ctx: MutationCtx, command: CommandRow, row: RequestRow, response: CommerceCommandResponse, now: number): Promise<void> {
  if (response.outcome === "rejected") {
    const reason = response.reason ?? "rejected"
    await ctx.db.patch(command._id, { state: "rejected", reason, rawBody: undefined, updatedAt: now })
    if (command.kind !== "quote_accept" && row.state === "pending") await settleRequest(ctx, row, { state: "failed", reason }, now)
    return
  }
  if (response.outcome === "unavailable" || response.outcome === "in_progress") {
    // Rien d'exécuté ni d'enregistré chez PRO.GA : la consultation puis les mêmes octets restent la voie.
    await ctx.db.patch(command._id, { reason: response.reason ?? response.outcome, updatedAt: now })
    return
  }
  if (response.outcome !== "accepted" && response.outcome !== "reconfirm_required") return
  const result = response.result
  if (!result) return
  if (command.kind === "inquiry" && "inquiryRef" in result) {
    await ctx.db.patch(command._id, { state: "accepted", reason: undefined, resultRef: result.inquiryRef, rawBody: undefined, updatedAt: now })
    await ctx.db.patch(row._id, { state: "active", inquiryRef: result.inquiryRef, reason: undefined, updatedAt: now })
    return
  }
  if (command.kind === "quote_accept" && "state" in result && result.state === "reconfirm" && "currentVersion" in result) {
    await ctx.db.patch(command._id, { state: "reconfirm", reason: undefined, currentVersion: result.currentVersion, currentTotal: { ...result.currentTotal }, rawBody: undefined, updatedAt: now })
    // P14B : PRO.GA dit le devis RÉVISÉ — trace pour le client (version seule, jamais le total).
    await noticeServiceQuoteRevised(ctx, row, result.quoteRef, result.currentVersion)
    return
  }
  if (command.kind === "quote_accept" && "state" in result && result.state === "accepted" && "acceptedAt" in result && command.acceptedTotal) {
    const orderRef = result.orderRef ?? null, total = command.acceptedTotal
    await ctx.db.patch(command._id, { state: "accepted", reason: undefined, ...(orderRef ? { resultRef: orderRef } : {}), rawBody: undefined, updatedAt: now })
    await ctx.db.patch(row._id, {
      acceptedQuote: { quoteRef: result.quoteRef, quoteVersion: result.quoteVersion, acceptedTotal: { ...total }, acceptedAt: result.acceptedAt, orderRef },
      ...(orderRef ? { order: { orderRef, state: "pending" as const, revision: 1, total: { ...total }, updatedAt: result.acceptedAt, observedAt: now } } : {}),
      updatedAt: now,
    })
    // P14B : acceptation CONFIRMÉE par PRO.GA (preuve `acceptedAt`) — l'équipe habilitée, sans montant.
    await noticeServiceTeam(ctx, row, "commerce_service_quote_accepted", `quote:${result.quoteRef}:v${result.quoteVersion}:accepted`)
    return
  }
  if (command.kind === "booking" && "appointmentRef" in result && command.serviceRef) {
    await ctx.db.patch(command._id, { state: "accepted", reason: undefined, resultRef: result.appointmentRef, rawBody: undefined, updatedAt: now })
    // Instantané PROVISOIRE : sans politique ni révision observées, aucun geste n'est ouvert avant relecture.
    const booking: ServiceBookingSnapshot = {
      appointmentRef: result.appointmentRef, serviceRef: command.serviceRef, serviceLabel: row.serviceLabel ?? row.offerTitle, resourceLabel: null,
      startAt: result.startAt, endAt: result.endAt, timeZone: result.timeZone, state: result.state, holdExpiresAt: result.holdExpiresAt ?? null,
      revision: null, updatedAt: null, cancellation: null, replacementRef: null, replacesRef: null, policy: null, observedAt: now,
    }
    await ctx.db.patch(row._id, { state: "active", booking, reason: undefined, updatedAt: now })
    // P14B : créneau RETENU par l'agenda PRO.GA (référence corrélée) — l'équipe habilitée.
    await noticeServiceTeam(ctx, row, "commerce_service_booking_held", `booking:${result.appointmentRef}:held`)
  }
}

/** Applique une réponse d'extension VALIDÉE. Un refus de changement conserve le rendez-vous tenu. */
async function applyControl(ctx: MutationCtx, command: CommandRow, row: RequestRow, response: CommerceServiceControlResponse, now: number): Promise<void> {
  if (response.outcome === "refused") {
    await ctx.db.patch(command._id, { state: "rejected", reason: response.reason, rawBody: undefined, updatedAt: now })
    if (command.kind === "order" && row.state === "pending") await settleRequest(ctx, row, { state: "failed", reason: response.reason }, now)
    return
  }
  if (response.outcome === "unavailable") {
    await ctx.db.patch(command._id, { reason: response.reason, updatedAt: now })
    return
  }
  if (response.outcome !== "accepted" && response.outcome !== "reconfirm_required") return
  const result = response.result
  if (command.kind === "quote_reject" && "quoteRef" in result && "rejectedAt" in result && result.state === "rejected") {
    await ctx.db.patch(command._id, { state: "accepted", reason: undefined, resultRef: result.quoteRef, rawBody: undefined, updatedAt: now })
    await ctx.db.patch(row._id, { rejectedQuote: { quoteRef: result.quoteRef, quoteVersion: result.quoteVersion, rejectedAt: result.rejectedAt }, updatedAt: now })
    return
  }
  if (command.kind === "order" && "state" in result && result.state === "reconfirm" && "currentUnitAmount" in result) {
    await ctx.db.patch(command._id, { state: "reconfirm", reason: undefined, currentUnitAmount: { ...result.currentUnitAmount }, currentCatalogRevision: result.currentCatalogRevision, rawBody: undefined, updatedAt: now })
    return
  }
  if (command.kind === "order" && "orderRef" in result && "createdAt" in result) {
    await ctx.db.patch(command._id, { state: "accepted", reason: undefined, resultRef: result.orderRef, rawBody: undefined, updatedAt: now })
    await ctx.db.patch(row._id, { state: "active", reason: undefined, order: { orderRef: result.orderRef, state: "pending", revision: 1, total: { ...result.total }, updatedAt: result.createdAt, observedAt: now }, updatedAt: now })
    return
  }
  if (command.kind === "reschedule" && "previous" in result) {
    await ctx.db.patch(command._id, { state: "accepted", reason: undefined, resultRef: result.current.appointmentRef, rawBody: undefined, updatedAt: now })
    // Échange immédiat (l'ancien est libéré) ou remplacement en attente (l'ancien reste tenu).
    const swapped = result.previous.state === "cancelled_by_client"
    await settleRequest(ctx, row, swapped
      ? { booking: bookingSnapshotOf(result.current, now), pendingReplacement: undefined, reason: undefined }
      : { booking: bookingSnapshotOf(result.previous, now), pendingReplacement: bookingSnapshotOf(result.current, now), reason: undefined }, now)
    // P14B : changement CONFIRMÉ par PRO.GA (échange ou remplacement en attente) — l'équipe habilitée.
    await noticeServiceTeam(ctx, row, "commerce_service_booking_client_changed", `booking:${result.current.appointmentRef}:changed`)
    return
  }
  // `service.options` porte aussi un champ `booking` : seule sa réponse a un `offerRef`.
  if (command.kind === "cancel" && "booking" in result && !("offerRef" in result)) {
    await ctx.db.patch(command._id, { state: "accepted", reason: undefined, rawBody: undefined, updatedAt: now })
    // PRO.GA annule aussi un remplacement en attente : la demande se ferme.
    await settleRequest(ctx, row, { booking: bookingSnapshotOf(result.booking, now), pendingReplacement: undefined }, now)
    // P14B : annulation CONFIRMÉE par PRO.GA — l'équipe habilitée.
    await noticeServiceTeam(ctx, row, "commerce_service_booking_client_cancelled", `booking:${result.booking.appointmentRef}:cancelled`)
  }
}

function statusMatches(outcome: string, httpStatus: number | undefined): boolean {
  if (httpStatus === undefined) return true
  if (outcome === "accepted" || outcome === "reconfirm_required") return httpStatus === 200
  if (outcome === "rejected" || outcome === "refused") return httpStatus === 422
  return true
}

/** Le statut d'une consultation, seulement s'il est corrélé à NOS octets et à la commande visée. */
async function lookupStatus(command: CommandRow, rawBody: string, rawResponse: string, now: number): Promise<LookupStatus | null> {
  const lookupSha256 = await sha256Hex(rawBody)
  if (channelOf(command.kind) === "command") {
    const lookup = parseCommerceCommandRequest(rawBody, { source: command.source, environment: command.environment, nowMs: now })
    if (!lookup.ok || lookup.value.command !== "request.status" || lookup.value.payload.targetRequestId !== command.requestId || lookup.value.payload.targetRequestSha256 !== command.bodySha256) return null
    const parsed = parseCommerceCommandResponse(rawResponse, { request: lookup.value, requestSha256: lookupSha256 }, now)
    if (!parsed.ok || parsed.value.outcome !== "accepted" || !parsed.value.result || !("targetRequestId" in parsed.value.result)) return null
    const status = parsed.value.result
    return { state: status.state, current: status.current, ...(status.recordedResponse !== undefined ? { recordedResponse: status.recordedResponse } : {}), ...(status.recordedResponseSha256 !== undefined ? { recordedResponseSha256: status.recordedResponseSha256 } : {}) }
  }
  const lookup = parseCommerceServiceControlRequest(rawBody, { source: command.source, environment: command.environment, nowMs: now, contract: command.kind === "quote_reject" ? COMMERCE_SERVICE_CONTROL_CONTRACT_V2 : COMMERCE_SERVICE_CONTROL_CONTRACT })
  if (!lookup.ok || lookup.value.operation !== "action.status" || lookup.value.payload.targetRequestId !== command.requestId || lookup.value.payload.targetRequestSha256 !== command.bodySha256) return null
  const parsed = parseCommerceServiceControlResponse(rawResponse, { request: lookup.value, requestSha256: lookupSha256, nowMs: now })
  if (!parsed.ok || parsed.value.outcome !== "accepted" || !("targetRequestId" in parsed.value.result)) return null
  const status = parsed.value.result
  return { state: status.state, current: status.current, ...(status.recordedResponse !== undefined ? { recordedResponse: status.recordedResponse } : {}), ...(status.recordedResponseSha256 !== undefined ? { recordedResponseSha256: status.recordedResponseSha256 } : {}) }
}

/** État servi d'une commande PRO.GA ouverte par la demande : seulement plus récent, jamais inventé. */
async function applyCurrentStates(ctx: MutationCtx, row: RequestRow, current: readonly CurrentState[], now: number): Promise<void> {
  const order = row.order
  const entry = order ? current.find((item) => item.objectKind === "order" && item.objectRef === order.orderRef) : undefined
  if (!order || !entry || !isOrderState(entry.state) || entry.revision < order.revision) return
  await settleRequest(ctx, row, { order: { ...order, state: entry.state, revision: entry.revision, updatedAt: entry.updatedAt, observedAt: now } }, now)
}

/** Consultation : seule une réponse ENREGISTRÉE et corrélée aux octets de la commande produit son effet. */
async function applyLookup(ctx: MutationCtx, command: CommandRow, row: RequestRow, rawBody: string, rawResponse: string, httpStatus: number | undefined, now: number): Promise<void> {
  if (httpStatus !== undefined && httpStatus !== 200) return
  const status = await lookupStatus(command, rawBody, rawResponse, now)
  if (!status) return
  await ctx.db.patch(command._id, { lookupState: status.state, lastLookupAt: now, lookupSessionDigest: command.leaseSessionDigest ?? command.sessionDigest, updatedAt: now })
  await applyCurrentStates(ctx, row, status.current, now)
  if (command.state !== "unknown") return
  const fresh = await ctx.db.get(row._id)
  if (!fresh) return
  if (status.state === "completed" && status.recordedResponse !== undefined) {
    if (status.recordedResponseSha256 !== await sha256Hex(status.recordedResponse)) return
    if (channelOf(command.kind) === "command") {
      const expected = p06ResponseRequest(command)
      const recorded = expected ? parseCommerceCommandResponse(status.recordedResponse, { request: expected, requestSha256: command.bodySha256 }, now) : null
      if (recorded?.ok) await applyP06(ctx, command, fresh, recorded.value, now)
    } else {
      const expected = controlResponseRequest(command)
      const recorded = expected ? parseCommerceServiceControlResponse(status.recordedResponse, { request: expected, requestSha256: command.bodySha256, nowMs: now }) : null
      if (recorded?.ok) await applyControl(ctx, command, fresh, recorded.value, now)
    }
    return
  }
  if (status.state === "unknown" && now > command.expiresAt + COMMERCE_MAX_SKEW_MS) await expireCommand(ctx, command, fresh, now)
}

/** Arrivée d'un envoi ou d'une consultation : corrélation stricte, effet local seulement ensuite. */
export const finish = internalMutation({
  args: { networkId: v.id("networks"), delivery: serviceDeliveryValidator, rawResponse: v.optional(v.string()), httpStatus: v.optional(v.number()) },
  returns: serviceActionResultValidator,
  handler: async (ctx, args): Promise<ServiceActionResult> => {
    const owned = await ownedCommand(ctx, args.networkId, args.delivery.commandId)
    if (!owned) return refused()
    const { command, row } = owned, now = Date.now(), delivery = args.delivery
    if (command.leaseToken !== delivery.leaseToken || (command.leaseUntil ?? 0) <= now) return refused()
    // Avant ET après I/O, la même session de CE bail ; le consentement et ses octets restent immuables.
    const live = await sameServiceAuthority(ctx, leaseAuthority(command), delivery.purpose === "send" ? strictFor(command, row) : null)
    if (!live || delivery.purpose === "send" && command.kind === "quote_reject" && !serviceQuoteControlV2Enabled()) return refused()
    await ctx.db.patch(command._id, { leaseToken: undefined, leaseUntil: undefined, leaseSessionDigest: undefined, updatedAt: now })
    if (delivery.purpose === "send" && !await inquiryStillAuthorized(ctx, command, row)) return refused()
    if (args.rawResponse !== undefined) {
      if (delivery.purpose === "lookup") await applyLookup(ctx, command, row, delivery.rawBody, args.rawResponse, args.httpStatus, now)
      else if (command.state === "unknown" && delivery.requestId === command.requestId) {
        if (channelOf(command.kind) === "command") {
          const request = command.rawBody ? parseCommerceCommandRequest(command.rawBody, { source: command.source, environment: command.environment, nowMs: command.issuedAt }) : null
          const expected: CommerceCommandRequest | null = request?.ok ? request.value : p06ResponseRequest(command)
          const parsed = expected ? parseCommerceCommandResponse(args.rawResponse, { request: expected, requestSha256: command.bodySha256 }, now) : null
          if (parsed?.ok && statusMatches(parsed.value.outcome, args.httpStatus)) await applyP06(ctx, command, row, parsed.value, now)
        } else {
          const expected = controlResponseRequest(command)
          const parsed = expected ? parseCommerceServiceControlResponse(args.rawResponse, { request: expected, requestSha256: command.bodySha256, nowMs: now }) : null
          if (parsed?.ok && statusMatches(parsed.value.outcome, args.httpStatus)) await applyControl(ctx, command, row, parsed.value, now)
        }
      }
    }
    const fresh = await ctx.db.get(command._id)
    return { outcome: "request", requestRowId: row.requestRowId, state: fresh?.state ?? command.state, reason: fresh?.reason ?? null }
  },
})

// ─── Lectures (aucun effet chez PRO.GA, enveloppes jamais persistées) ────────

/** Lecture par offre : modes ouverts de la prestation, ou créneaux libres d'une prestation de l'agenda. */
export const admitOfferRead = internalMutation({
  args: {
    networkId: v.id("networks"), handle: v.string(), offerRef: v.string(), requestId: v.string(), configFingerprint: v.string(),
    slots: v.optional(v.object({ serviceRef: v.string(), resourceRef: v.optional(v.string()), fromAt: v.number(), toAt: v.number() })),
  },
  returns: serviceReadEnvelopeValidator,
  handler: async (ctx, args) => {
    if (!validServiceId(args.requestId) || (args.slots && (!refKind(args.slots.serviceRef, "agenda_service") || !refKind(args.slots.resourceRef, "agenda_resource")))) return null
    const admitted = await initialServiceAuthority(ctx, args.networkId, args.handle, args.offerRef, args.slots ? "booking" : "read")
    if (!admitted || admitted.authority.configFingerprint !== args.configFingerprint) return null
    await enforceRateLimit(ctx, "shop.service.read", admitted.authority.personId)
    const now = Date.now(), slots = args.slots
    const rawBody = slots
      ? controlBody(admitted.authority, args.requestId, now, "booking.slots", { serviceRef: slots.serviceRef, fromAt: Math.max(slots.fromAt, now), toAt: slots.toAt, ...(slots.resourceRef ? { resourceRef: slots.resourceRef } : {}) })
      : controlBody(admitted.authority, args.requestId, now, "service.options", { offerRef: args.offerRef })
    return rawBody ? { rawBody, requestId: args.requestId } : null
  },
})

/** Lecture d'une demande existante : devis reçus, un devis, le rendez-vous tenu ou son remplaçant. */
export const admitRequestRead = internalMutation({
  args: {
    networkId: v.id("networks"), requestRowId: v.string(), requestId: v.string(), configFingerprint: v.string(), contract: v.optional(serviceControlContractValidator),
    target: v.union(v.object({ kind: v.literal("quotes") }), v.object({ kind: v.literal("quote"), quoteRef: v.string() }), v.object({ kind: v.literal("booking"), which: v.union(v.literal("held"), v.literal("replacement")) })),
  },
  returns: serviceReadEnvelopeValidator,
  handler: async (ctx, args) => {
    const row = await ownedServiceRequest(ctx, args.networkId, args.requestRowId)
    if (!row || !validServiceId(args.requestId)) return null
    const authority = await existingServiceAuthority(ctx, row)
    if (!authority || authority.configFingerprint !== args.configFingerprint) return null
    await enforceRateLimit(ctx, "shop.service.read", row.personId)
    const now = Date.now(), target = args.target, contract = args.contract ?? COMMERCE_SERVICE_CONTROL_CONTRACT
    if (contract === COMMERCE_SERVICE_CONTROL_CONTRACT_V2 && (target.kind === "booking" || await quoteControlContractForRequest(ctx, row) !== contract)) return null
    let rawBody: string | null = null
    if (target.kind === "quotes" && row.mode === "quote" && row.inquiryRef) rawBody = controlBody(authority, args.requestId, now, "quote.list", { inquiryRef: row.inquiryRef }, contract)
    else if (target.kind === "quote" && row.mode === "quote" && row.inquiryRef && refKind(target.quoteRef, "quote")) rawBody = controlBody(authority, args.requestId, now, "quote.read", { quoteRef: target.quoteRef }, contract)
    else if (target.kind === "booking" && row.mode === "booking") {
      const snapshot = target.which === "held" ? row.booking : row.pendingReplacement
      if (snapshot) rawBody = controlBody(authority, args.requestId, now, "booking.read", { appointmentRef: snapshot.appointmentRef })
    }
    return rawBody ? { rawBody, requestId: args.requestId } : null
  },
})

/** Réponse de lecture corrélée à SA demande et à la configuration courante ; `null` sinon. */
async function validRead(rawBody: string, rawResponse: string | undefined, httpStatus: number | undefined, operation: CommerceServiceControlRequest["operation"]): Promise<{ request: CommerceServiceControlRequest; response: CommerceServiceControlResponse } | null> {
  const config = await readCommerceLinkConfig()
  if (!config || rawResponse === undefined) return null
  const now = Date.now()
  const contract = controlContractOf(rawBody)
  if (!contract || contract === COMMERCE_SERVICE_CONTROL_CONTRACT_V2 && !serviceQuoteControlV2Enabled()) return null
  const request = parseCommerceServiceControlRequest(rawBody, { source: config.source, environment: config.environment, nowMs: now, contract })
  if (!request.ok || request.value.operation !== operation || request.value.expiresAt + COMMERCE_MAX_SKEW_MS < now) return null
  const response = parseCommerceServiceControlResponse(rawResponse, { request: request.value, requestSha256: await sha256Hex(rawBody), nowMs: now })
  return response.ok && statusMatches(response.value.outcome, httpStatus) ? { request: request.value, response: response.value } : null
}

const readArgs = { networkId: v.id("networks"), rawBody: v.string(), rawResponse: v.optional(v.string()), httpStatus: v.optional(v.number()) }

export const finishOptions = internalMutation({
  args: { ...readArgs, handle: v.string(), offerRef: v.string() }, returns: serviceOptionsResultValidator,
  handler: async (ctx, args): Promise<ServiceOptionsResult> => {
    const read = await validRead(args.rawBody, args.rawResponse, args.httpStatus, "service.options")
    // La personne, sa session et la vitrine sont relues à l'arrivée : aucune réponse tardive livrée à autrui.
    const admitted = read ? await initialServiceAuthority(ctx, args.networkId, args.handle, args.offerRef, "read") : null
    if (!read || !admitted || read.request.subject.ref !== admitted.authority.subjectRef || read.request.shopRef !== admitted.authority.shopRef) return { outcome: "unavailable" }
    if (read.response.outcome === "refused") return { outcome: "refused" }
    if (read.response.outcome !== "accepted" || !("fixedOrder" in read.response.result)) return { outcome: "unavailable" }
    const options = read.response.result
    // Défense en profondeur : un mode n'est montré que si la liaison porte sa permission.
    const can = (mode: ServiceMode) => admitted.permissions.includes(SERVICE_MODE_PERMISSIONS[mode])
    return {
      outcome: "ready", offerRef: options.offerRef, timeZone: options.timeZone,
      fixedOrder: options.fixedOrder && can("fixed_order") ? { ...options.fixedOrder, unitAmount: { ...options.fixedOrder.unitAmount } } : null,
      quote: { available: options.quote.available && can("quote") },
      booking: options.booking && can("booking") ? { services: options.booking.services.map((service) => ({ ...service })) } : null,
    }
  },
})

export const finishSlots = internalMutation({
  args: { ...readArgs, handle: v.string(), offerRef: v.string() }, returns: serviceSlotsResultValidator,
  handler: async (ctx, args): Promise<ServiceSlotsResult> => {
    const read = await validRead(args.rawBody, args.rawResponse, args.httpStatus, "booking.slots")
    const admitted = read ? await initialServiceAuthority(ctx, args.networkId, args.handle, args.offerRef, "booking") : null
    if (!read || !admitted || read.request.subject.ref !== admitted.authority.subjectRef || read.request.shopRef !== admitted.authority.shopRef) return { outcome: "unavailable" }
    if (read.response.outcome === "refused") return { outcome: "refused" }
    if (read.response.outcome !== "accepted" || !("slots" in read.response.result)) return { outcome: "unavailable" }
    const slots = read.response.result
    return {
      outcome: "ready", serviceRef: slots.serviceRef, timeZone: slots.timeZone, durationMinutes: slots.durationMinutes, fromAt: slots.fromAt, toAt: slots.toAt,
      truncated: slots.truncated, slots: slots.slots.map((slot) => ({ ...slot })),
    }
  },
})

async function readForRequest(ctx: MutationCtx, args: { networkId: Id<"networks">; requestRowId: string; rawBody: string; rawResponse?: string; httpStatus?: number }, operation: CommerceServiceControlRequest["operation"]) {
  const row = await ownedServiceRequest(ctx, args.networkId, args.requestRowId)
  const read = row ? await validRead(args.rawBody, args.rawResponse, args.httpStatus, operation) : null
  if (!row || !read || read.request.subject.ref !== row.subjectRef || read.request.shopRef !== row.shopRef || !await existingServiceAuthority(ctx, row)) return null
  if (read.request.contract === COMMERCE_SERVICE_CONTROL_CONTRACT_V2 && await quoteControlContractForRequest(ctx, row) !== COMMERCE_SERVICE_CONTROL_CONTRACT_V2) return null
  return { row, read }
}

export const finishQuotes = internalMutation({
  args: { ...readArgs, requestRowId: v.string() }, returns: serviceQuotesResultValidator,
  handler: async (ctx, args): Promise<ServiceQuotesResult> => {
    const owned = await readForRequest(ctx, args, "quote.list")
    if (!owned) return { outcome: "unavailable" }
    const response = owned.read.response
    if (response.outcome === "refused") return { outcome: "refused" }
    if (response.outcome !== "accepted" || !("quotes" in response.result) || response.result.quotes.some(quote => quote.inquiryRef !== owned.row.inquiryRef)) return { outcome: "unavailable" }
    // P14B : devis TRANSMIS par PRO.GA (liste corrélée) — une trace par version courante pour le client.
    await noticeServiceQuotes(ctx, owned.row, response.result.quotes)
    return {
      outcome: "ready", truncated: response.result.truncated,
      quotes: response.result.quotes.map((quote) => ({ ...quote, rejectable: quote.rejectable === true, clientRejection: quote.clientRejection ? { ...quote.clientRejection } : null, total: { ...quote.total }, clientAcceptance: quote.clientAcceptance ? { ...quote.clientAcceptance, acceptedTotal: { ...quote.clientAcceptance.acceptedTotal } } : null })),
    }
  },
})

export const finishQuote = internalMutation({
  args: { ...readArgs, requestRowId: v.string() }, returns: serviceQuoteResultValidator,
  handler: async (ctx, args): Promise<ServiceQuoteResult> => {
    const owned = await readForRequest(ctx, args, "quote.read")
    if (!owned) return { outcome: "unavailable" }
    const response = owned.read.response
    if (response.outcome === "refused") return { outcome: "refused" }
    // `service.options` porte aussi un champ `quote` : seule sa réponse a un `offerRef`.
    if (response.outcome !== "accepted" || !("quote" in response.result) || "offerRef" in response.result) return { outcome: "unavailable" }
    const quote = response.result.quote
    if (quote.inquiryRef !== owned.row.inquiryRef) return { outcome: "unavailable" }
    return {
      outcome: "ready", consentTextVersion: COMMERCE_SERVICE_CONSENTS.quote_acceptance.textVersion,
      ...(owned.read.request.contract === COMMERCE_SERVICE_CONTROL_CONTRACT_V2 ? { rejectionConsentTextVersion: COMMERCE_SERVICE_CONSENTS.quote_rejection.textVersion } : {}),
      quote: {
        ...quote, rejectable: quote.rejectable === true, clientRejection: quote.clientRejection ? { ...quote.clientRejection } : null, total: { ...quote.total }, lines: quote.lines.map((line) => ({ ...line, unitAmount: { ...line.unitAmount }, lineAmount: { ...line.lineAmount } })),
        clientAcceptance: quote.clientAcceptance ? { ...quote.clientAcceptance, acceptedTotal: { ...quote.clientAcceptance.acceptedTotal } } : null,
      },
    }
  },
})

/** Relecture d'un rendez-vous : instantané privé à jour ; un remplacement confirmé devient le rendez-vous tenu. */
export const finishBookingRead = internalMutation({
  args: { ...readArgs, requestRowId: v.string() }, returns: serviceActionResultValidator,
  handler: async (ctx, args): Promise<ServiceActionResult> => {
    const owned = await readForRequest(ctx, args, "booking.read")
    if (!owned) return unavailable()
    const { row, read } = owned
    // `service.options` porte aussi un champ `booking` : seule sa réponse a un `offerRef`.
    if (read.response.outcome !== "accepted" || !("booking" in read.response.result) || "offerRef" in read.response.result) return read.response.outcome === "refused" ? refused() : unavailable()
    const now = Date.now(), view = read.response.result.booking, snapshot = bookingSnapshotOf(view, now)
    let patch: Partial<RequestRow> | null = null
    if (row.booking?.appointmentRef === view.appointmentRef) patch = { booking: snapshot }
    else if (row.pendingReplacement?.appointmentRef === view.appointmentRef) {
      if (view.state === "requested") patch = { pendingReplacement: snapshot }
      // Remplacement refusé ou expiré : l'ancien rendez-vous reste tenu, le motif est dit.
      else if (view.state === "cancelled_by_pro" || view.state === "cancelled_by_client") patch = { pendingReplacement: undefined, reason: view.cancellation === "expired" ? "change_expired" : "change_declined" }
      else patch = { booking: snapshot, pendingReplacement: undefined, reason: undefined }
    }
    if (!patch) return refused()
    await settleRequest(ctx, row, patch, now)
    const last = await ctx.db.query("commerceServiceCommands").withIndex("by_request_row", (q) => q.eq("requestRowId", row.requestRowId)).order("desc").first()
    return { outcome: "request", requestRowId: row.requestRowId, state: last?.state ?? "accepted", reason: last?.reason ?? null }
  },
})

/** Corps privés expurgés à échéance ; la décision et les champs de corrélation restent. */
export const expirePrivate = internalMutation({
  args: { commandId: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const command = await ctx.db.query("commerceServiceCommands").withIndex("by_command", (q) => q.eq("commandId", args.commandId)).unique()
    const now = Date.now()
    if (command && command.privateUntil <= now && command.privatePurgedAt === undefined) {
      await ctx.db.patch(command._id, { rawBody: undefined, leaseToken: undefined, leaseUntil: undefined, leaseSessionDigest: undefined, lookupSessionDigest: undefined, inquiryAttachmentMessageIds: undefined, privatePurgedAt: now })
    }
    return null
  },
})
