/**
 * P14 : lectures membres. « Mes demandes » ne montre que les demandes de la personne dans CE
 * réseau, avec les états servis par PRO.GA tels qu'observés (datés, jamais inventés) ; le
 * contexte d'une demande de devis n'expose que la conversation commerciale ACCEPTÉE de la
 * personne et ses propres pièces admises ; la rubrique Services de Découvrir ne liste que des
 * offres de service publiées et consenties (projection P09), quand la politique est ouverte.
 */
import { paginationOptsValidator, paginationResultValidator, type PaginationResult } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { fail } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { demoContentAllowed } from "../../seeds/demoContentConfig"
import { commercialThreadAccess } from "../commercialMessaging/access"
import { isServableStorage } from "../files/storageGuard"
import { canReadModeratedContent } from "../moderation/policy"
import { findPageByHandle } from "../pages/access"
import { shopOfPage, storefrontPolicyOf } from "./access"
import { catalogOfferValidator, marketplaceFilterArgs, type CatalogOffer } from "./catalogValidators"
import { selectDemoMarketplace, searchMarketplace, type MarketplacePage, type MarketplaceSearchArgs } from "./marketplaceRead"
import { marketplaceFiltersOf } from "./catalogSearchRules"
import { MARKETPLACE_DISCOVERY_VERSION } from "./marketplaceIndexFields"
import { sha256Hex } from "./commerceLinkCrypto"
import { storefrontsOpen } from "./rules"
import { ownedServiceRequest, quoteControlContractForRequest, servicePolicyOpen, validServiceId } from "./serviceAccess"
import { projectServiceRequest, serviceControlContractValidator, SERVICE_PAGE_MAX, serviceIntentLookupValidator, serviceRequestValidator, serviceStopIntentValidator, type ServiceRequestDto } from "./serviceRules"

const THREAD_MESSAGES_SCANNED = 50
const ATTACHMENT_MESSAGES_MAX = 10

type RequestRow = Doc<"commerceServiceRequests">
type PolicyCache = Map<Id<"networks">, boolean>

async function policyOpen(ctx: QueryCtx, cache: PolicyCache, networkId: Id<"networks">): Promise<boolean> {
  const known = cache.get(networkId)
  if (known !== undefined) return known
  const open = await servicePolicyOpen(ctx, networkId)
  cache.set(networkId, open)
  return open
}

async function project(ctx: QueryCtx, row: RequestRow, cache: PolicyCache, now: number): Promise<ServiceRequestDto> {
  const last = await ctx.db.query("commerceServiceCommands").withIndex("by_request_row", (q) => q.eq("requestRowId", row.requestRowId)).order("desc").first()
  const shop = await ctx.db.get(row.shopId)
  // Un changement est un nouvel engagement (politique ouverte) ; l'annulation reste toujours ouverte.
  const change = !!shop && await policyOpen(ctx, cache, row.networkId) && (shop.networkId === row.networkId || await policyOpen(ctx, cache, shop.networkId))
  return projectServiceRequest(row, last, now, { change, cancel: true })
}

function erasing(person: Doc<"persons">): boolean {
  return person.deletionRequestedAt !== undefined || person.erasedAt !== undefined
}

/** L'absence certaine est distincte d'une erreur de lecture ; aucune consultation de PRO.GA. */
export const findByClientRequestId = networkQuery({
  minStatus: "declaree", args: { clientRequestId: v.string() }, returns: serviceIntentLookupValidator,
  handler: async (ctx, args) => {
    if (!validServiceId(args.clientRequestId)) return fail("invalidArgument", { field: "clientRequestId" })
    if (erasing(ctx.person)) return fail("notFound")
    const command = await ctx.db.query("commerceServiceCommands").withIndex("by_client", (q) => q.eq("personId", ctx.person._id).eq("networkId", ctx.networkId).eq("clientRequestId", args.clientRequestId)).unique()
    if (command) return { outcome: "request" as const, requestRowId: command.requestRowId }
    const fence = await ctx.db.query("serviceClientIntentFences").withIndex("by_client", (q) => q.eq("personId", ctx.person._id).eq("networkId", ctx.networkId).eq("clientRequestId", args.clientRequestId)).unique()
    return fence ? { outcome: "stopped" as const } : { outcome: "absent" as const }
  },
})

/** Ferme une clé sans commande. Une commande déjà admise gagne toujours, sans annulation ni nouvel effet. */
export const stopClientIntent = networkMutation({
  minStatus: "declaree", writeBucket: "shop.service.intent.stop", args: { clientRequestId: v.string() }, returns: serviceStopIntentValidator,
  handler: async (ctx, args) => {
    if (!validServiceId(args.clientRequestId)) return fail("invalidArgument", { field: "clientRequestId" })
    if (erasing(ctx.person)) return fail("notFound")
    const command = await ctx.db.query("commerceServiceCommands").withIndex("by_client", (q) => q.eq("personId", ctx.person._id).eq("networkId", ctx.networkId).eq("clientRequestId", args.clientRequestId)).unique()
    if (command) return { outcome: "request" as const, requestRowId: command.requestRowId }
    const fence = await ctx.db.query("serviceClientIntentFences").withIndex("by_client", (q) => q.eq("personId", ctx.person._id).eq("networkId", ctx.networkId).eq("clientRequestId", args.clientRequestId)).unique()
    if (!fence) await ctx.db.insert("serviceClientIntentFences", { personId: ctx.person._id, networkId: ctx.networkId, clientRequestId: args.clientRequestId, stoppedAt: Date.now() })
    return { outcome: "stopped" as const }
  },
})

export const myRequests = networkQuery({
  minStatus: "declaree", args: { paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(serviceRequestValidator),
  handler: async (ctx, args): Promise<PaginationResult<ServiceRequestDto>> => {
    if (erasing(ctx.person)) return { page: [], continueCursor: "", isDone: true }
    const requested = args.paginationOpts.numItems
    const numItems = Number.isFinite(requested) ? Math.max(1, Math.min(SERVICE_PAGE_MAX, Math.trunc(requested))) : SERVICE_PAGE_MAX
    const window = await ctx.db.query("commerceServiceRequests").withIndex("by_person_network_updated", (q) => q.eq("personId", ctx.person._id).eq("networkId", ctx.networkId))
      .order("desc").paginate({ ...args.paginationOpts, numItems, maximumRowsRead: SERVICE_PAGE_MAX * 2, maximumBytesRead: 512 * 1024 })
    const cache: PolicyCache = new Map(), now = Date.now(), page: ServiceRequestDto[] = []
    for (const row of window.page) if (row.cancelledAt === undefined) page.push(await project(ctx, row, cache, now))
    return { ...window, page }
  },
})

export const myRequest = networkQuery({
  minStatus: "declaree", args: { requestRowId: v.string() }, returns: v.union(serviceRequestValidator, v.null()),
  handler: async (ctx, args): Promise<ServiceRequestDto | null> => {
    if (erasing(ctx.person) || !validServiceId(args.requestRowId)) return null
    const row = await ctx.db.query("commerceServiceRequests").withIndex("by_request", (q) => q.eq("requestRowId", args.requestRowId)).unique()
    // Refus indistinct : absente, d'autrui, d'un autre réseau ou retirée.
    if (!row || row.personId !== ctx.person._id || row.networkId !== ctx.networkId || row.cancelledAt !== undefined) return null
    return await project(ctx, row, new Map(), Date.now())
  },
})

const attachmentFileValidator = v.object({ filename: v.string(), mimeType: v.string(), sizeBytes: v.number() })
const quoteContextValidator = v.object({
  threadId: v.union(v.id("commercialThreads"), v.null()),
  threadState: v.union(v.literal("requested"), v.literal("accepted"), v.literal("declined"), v.literal("blocked"), v.literal("closed"), v.null()),
  attachments: v.array(v.object({ messageId: v.id("commercialMessages"), createdAt: v.number(), files: v.array(attachmentFileValidator) })),
  attachmentsTruncated: v.boolean(),
})

/**
 * La conversation commerciale de la personne avec cette boutique (offre précise d'abord, puis
 * conversation générale) et SES pièces admises, lisibles et servables, à choisir pour un devis.
 */
export const quoteRequestContext = networkQuery({
  minStatus: "declaree", args: { handle: v.string(), offerRef: v.string() }, returns: v.union(quoteContextValidator, v.null()),
  handler: async (ctx, args) => {
    if (erasing(ctx.person) || args.handle.length > 100 || args.offerRef.length > 200) return null
    const page = await findPageByHandle(ctx, args.handle)
    const shop = page ? await shopOfPage(ctx, page._id) : null
    if (!shop) return null
    const empty = { threadId: null, threadState: null, attachments: [], attachmentsTruncated: false }
    let thread: Doc<"commercialThreads"> | null = null
    for (const offerRef of [args.offerRef, undefined]) {
      const row = await ctx.db.query("commercialThreads").withIndex("by_requester_shop_offer", (q) => q.eq("networkId", ctx.networkId).eq("requesterPersonId", ctx.person._id).eq("shopId", shop._id).eq("offerRef", offerRef)).order("desc").first()
      if (row && row.state !== "closed" && row.state !== "declined") { thread = row; break }
    }
    const access = thread ? await commercialThreadAccess(ctx, ctx.networkId, ctx.person._id, thread._id, true) : null
    if (!thread || !access || access.viewerKind !== "requester") return empty
    const threadId = thread._id
    if (thread.state !== "accepted" || access.blocked) return { ...empty, threadId, threadState: access.blocked ? "blocked" as const : thread.state }
    // borné : les cinquante derniers messages de la conversation.
    const messages = await ctx.db.query("commercialMessages").withIndex("by_thread_createdAt", (q) => q.eq("threadId", threadId)).order("desc").take(THREAD_MESSAGES_SCANNED)
    const attachments: Array<{ messageId: Id<"commercialMessages">; createdAt: number; files: Array<{ filename: string; mimeType: string; sizeBytes: number }> }> = []
    let truncated = messages.length === THREAD_MESSAGES_SCANNED
    for (const message of messages) {
      if (message.senderPersonId !== ctx.person._id || message.deletedAt !== undefined || !message.attachmentFiles?.length) continue
      if (!await canReadModeratedContent(ctx, "commercialMessage", message._id, ctx.person._id)) continue
      let servable = true
      for (const file of message.attachmentFiles) if (!await isServableStorage(ctx, file.storageId)) servable = false
      if (!servable) continue
      if (attachments.length === ATTACHMENT_MESSAGES_MAX) { truncated = true; break }
      attachments.push({ messageId: message._id, createdAt: message.createdAt, files: message.attachmentFiles.map((file) => ({ filename: file.filename, mimeType: file.mimeType, sizeBytes: file.sizeBytes })) })
    }
    return { threadId, threadState: "accepted" as const, attachments, attachmentsTruncated: truncated }
  },
})

type ServiceSearchArgs = MarketplaceSearchArgs
type ServiceDirectoryPage = PaginationResult<CatalogOffer> & { indexStatus?: "building" | "ready"; filteredWindow?: boolean; selection?: "demo" | "catalog" }
const serviceDirectoryPageValidator = v.object({ page: v.array(catalogOfferValidator), isDone: v.boolean(), continueCursor: v.string(), indexStatus: v.optional(v.union(v.literal("building"), v.literal("ready"))), filteredWindow: v.optional(v.boolean()), selection: v.optional(v.union(v.literal("demo"), v.literal("catalog"))) })
const serviceSearchPageValidator = v.object({ page: v.array(catalogOfferValidator), isDone: v.boolean(), continueCursor: v.string(), indexStatus: v.union(v.literal("building"), v.literal("ready")), filteredWindow: v.boolean() })
type DiscoveryCtx = QueryCtx & { networkId: Id<"networks">; network: Doc<"networks">; rootNetwork: Doc<"networks">; person: Doc<"persons"> }
function serviceFilters(args: ServiceSearchArgs) {
  if (args.kind !== undefined && args.kind !== "service") return fail("invalidArgument", { field: "kind" })
  return marketplaceFiltersOf({ ...args, kind: "service" })
}
async function searchServices(ctx: DiscoveryCtx, args: ServiceSearchArgs, legacyPolicy = false): Promise<MarketplacePage> {
  const filters = serviceFilters(args)
  if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1) return fail("invalidArgument", { field: "paginationOpts" })
  const empty: MarketplacePage = { indexStatus: "ready", page: [], isDone: true, continueCursor: "", filteredWindow: false }
  if (erasing(ctx.person) || !storefrontsOpen(await storefrontPolicyOf(ctx, ctx.networkId)) || legacyPolicy && !await servicePolicyOpen(ctx, ctx.networkId)) return empty
  const cache: PolicyCache = new Map([[ctx.networkId, true]])
  return await searchMarketplace(ctx, { root: ctx.rootNetwork, readerPersonId: ctx.person._id, network: ctx.network }, { ...filters, paginationOpts: args.paginationOpts }, { scope: legacyPolicy ? "services-legacy-v2" : "services-v2", admit: async head => !legacyPolicy || await policyOpen(ctx, cache, head.networkId) })
}

/** MP06 : annuaire réel paginé sur les offres de service, sans commande ni agenda privé. */
export const search = networkQuery({
  minStatus: "declaree", args: { ...marketplaceFilterArgs, paginationOpts: paginationOptsValidator }, returns: serviceSearchPageValidator,
  handler: async (ctx, args) => await searchServices(ctx, args),
})

/** Compatibilité : confirme une offre réellement admissible dans une fenêtre d'index bornée. */
export const discoverAvailability = networkQuery({
  minStatus: "declaree", args: {}, returns: v.object({ available: v.boolean(), indexStatus: v.optional(v.union(v.literal("building"), v.literal("ready"))), isDone: v.optional(v.boolean()) }),
  handler: async ctx => {
    if (erasing(ctx.person) || !storefrontsOpen(await storefrontPolicyOf(ctx, ctx.networkId))) return { available: false }
    if (demoContentAllowed()) {
      const demo = await selectDemoMarketplace(ctx, { root: ctx.rootNetwork, readerPersonId: ctx.person._id, network: ctx.network }, { kind: "service" })
      if (demo.length) return { available: true }
    }
    if (!await servicePolicyOpen(ctx, ctx.networkId)) return { available: false }
    const result = await searchServices(ctx, { paginationOpts: { cursor: null, numItems: 24 } }, true)
    return result.indexStatus === "ready" && result.isDone ? { available: result.page.length > 0 } : { available: result.page.length > 0, indexStatus: result.indexStatus, isDone: result.indexStatus === "ready" && result.isDone }
  },
})

type DirectoryCursor = { version: 2; scope: string; phase: "demo" | "catalog"; cursor: string | null }
function directoryCursor(raw: string | null, scope: string, initialPhase: DirectoryCursor["phase"]): DirectoryCursor {
  if (raw === null) return { version: 2, scope, phase: initialPhase, cursor: initialPhase === "demo" ? "0" : null }
  if (!raw || raw.length > 8192) return fail("invalidArgument", { field: "cursor" })
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== "object" || Array.isArray(value)) return fail("invalidArgument", { field: "cursor" })
    const row = value as Record<string, unknown>
    if (Object.keys(row).length !== 4 || row.version !== 2 || row.scope !== scope || row.phase !== "demo" && row.phase !== "catalog" || row.cursor !== null && typeof row.cursor !== "string") return fail("invalidArgument", { field: "cursor" })
    return { version: 2, scope, phase: row.phase, cursor: row.cursor }
  } catch { return fail("invalidArgument", { field: "cursor" }) }
}

/**
 * API historique conservée : une page d'offres, désormais indexée avant pagination.
 * Les illustrations forment une phase fictive séparée et bornée, puis le catalogue réel.
 */
export const discoverServices = networkQuery({
  minStatus: "declaree", args: { ...marketplaceFilterArgs, paginationOpts: paginationOptsValidator }, returns: serviceDirectoryPageValidator,
  handler: async (ctx, args): Promise<ServiceDirectoryPage> => {
    const filters = serviceFilters(args)
    if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1) return fail("invalidArgument", { field: "paginationOpts" })
    const empty = { page: [], isDone: true, continueCursor: "" }
    if (erasing(ctx.person) || !storefrontsOpen(await storefrontPolicyOf(ctx, ctx.networkId))) return empty
    const servicesOpen = await servicePolicyOpen(ctx, ctx.networkId)
    const demo = demoContentAllowed() ? await selectDemoMarketplace(ctx, { root: ctx.rootNetwork, readerPersonId: ctx.person._id, network: ctx.network }, filters) : []
    if (!servicesOpen && !demo.length) return empty
    const index = await ctx.db.query("commerceCatalogIndexes").withIndex("by_network", q => q.eq("networkId", ctx.rootNetwork._id)).unique()
    const scope = await sha256Hex(JSON.stringify(["service-directory-v2", MARKETPLACE_DISCOVERY_VERSION, ctx.rootNetwork._id, ctx.networkId, ctx.person._id, filters, servicesOpen, index?.generation ?? null, index?.version ?? null, demo.map(offer => [offer.offerRef, offer.revision])]))
    const position = directoryCursor(args.paginationOpts.cursor, scope, demo.length ? "demo" : "catalog")
    if (position.phase === "demo") {
      const offset = Number(position.cursor)
      if (position.cursor === null || !Number.isSafeInteger(offset) || offset < 0 || offset > demo.length || String(offset) !== position.cursor) return fail("invalidArgument", { field: "cursor" })
      const end = Math.min(demo.length, offset + Math.min(24, args.paginationOpts.numItems))
      const next = end < demo.length ? { version: 2, scope, phase: "demo", cursor: String(end) } : servicesOpen ? { version: 2, scope, phase: "catalog", cursor: null } : null
      return { page: demo.slice(offset, end), isDone: next === null, continueCursor: next ? JSON.stringify(next) : "", selection: "demo", filteredWindow: false }
    }
    if (!servicesOpen) return empty
    const result = await searchServices(ctx, { ...filters, paginationOpts: { ...args.paginationOpts, cursor: position.cursor } }, true)
    return { ...result, selection: "catalog", continueCursor: result.isDone ? "" : JSON.stringify({ version: 2, scope, phase: "catalog", cursor: result.continueCursor }) }
  },
})

/** MP06 : sélection de contrat serveur avant toute lecture d'un devis possédé. */
export const quoteControl = networkQuery({
  minStatus: "declaree", args: { requestRowId: v.string() }, returns: v.union(v.null(), v.object({ quoteControlContract: serviceControlContractValidator })),
  handler: async (ctx, args) => {
    const row = await ownedServiceRequest(ctx, ctx.networkId, args.requestRowId)
    const contract = row ? await quoteControlContractForRequest(ctx, row) : null
    return contract ? { quoteControlContract: contract } : null
  },
})
