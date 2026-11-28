import { DIASPORA_GA_NETWORK_SLUG, DIASPORA_GA_SLICE } from "@diaspora-ga/domain"
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../../_generated/server"
import { getCurrentPerson, getRootNetwork, memberHasStatus, requireMembership } from "../../lib/access"
import { fail, notFound } from "../../lib/errors"
import { personMutation } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { isNetworkAccessSuspended } from "../moderation/judicialHolds"
import { isDiasporaNetwork } from "./facts"
import { decodeSmsEvent, pairingDigest, smsConfig, smsCredentials } from "./smsBird"
import { smsStatus } from "./smsTables"

const DAY = 86_400_000
const self = internal.modules.diaspora.sms
const diaspora = (ctx: QueryCtx) =>
  ctx.db
    .query("networks")
    .withIndex("by_slug", (q) => q.eq("slug", DIASPORA_GA_NETWORK_SLUG))
    .unique()

async function member(ctx: QueryCtx) {
  const network = await diaspora(ctx)
  if (!isDiasporaNetwork(network)) return notFound()
  return await requireMembership(ctx, network._id, "declaree")
}

// A scheduled send or incoming webhook has no member session to run requireMembership against.
async function networkAcceptsSms(ctx: QueryCtx, network: Doc<"networks">) {
  if (!isDiasporaNetwork(network)) return false
  const root = await getRootNetwork(ctx)
  return !!root && root._id === network.parentId && !(await isNetworkAccessSuspended(ctx, network._id, root._id))
}

async function ownThread(ctx: QueryCtx, id: Id<"diasporaSmsThreads">) {
  const access = await member(ctx)
  const thread = await ctx.db.get(id)
  if (!thread || thread.networkId !== access.network._id || thread.personId !== access.person._id) return notFound()
  return thread
}

function configured() {
  return smsConfig() ?? fail("policyRefused")
}

// @selfScoped The network is resolved server-side. All conversations belong to the authenticated member.
export const available = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    if (!smsConfig()) return false
    const network = await diaspora(ctx)
    const person = await getCurrentPerson(ctx)
    if (!person || !isDiasporaNetwork(network)) return false
    try {
      await requireMembership(ctx, network._id, "declaree")
      return true
    } catch {
      return false
    }
  },
})

const threadSummary = v.object({ id: v.id("diasporaSmsThreads"), label: v.string(), active: v.boolean() })
/** @selfScoped La session et le réseau DIASPORA déterminent le propriétaire de tous les fils listés. */
export const inbox = query({
  args: {},
  returns: v.object({ personId: v.id("persons"), enabled: v.boolean(), threads: v.array(threadSummary) }),
  handler: async (ctx) => {
    const { person, network } = await member(ctx)
    const threads = await ctx.db
      .query("diasporaSmsThreads")
      .withIndex("by_personId", (q) => q.eq("personId", person._id))
      .order("desc")
      .take(100)
    return {
      personId: person._id,
      enabled: !!smsConfig(),
      threads: threads
        .filter((t) => t.networkId === network._id)
        .map((t) => ({ id: t._id, label: t.label, active: t.active })),
    }
  },
})

/** @selfScoped Seul le propriétaire du fil membre actif de DIASPORA peut en lire les messages. */
export const history = query({
  args: { threadId: v.id("diasporaSmsThreads"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { threadId, paginationOpts }) => {
    await ownThread(ctx, threadId)
    const result = await ctx.db
      .query("diasporaSmsMessages")
      .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
      .order("desc")
      .paginate({ ...paginationOpts, numItems: Math.min(60, Math.max(1, paginationOpts.numItems)) })
    return {
      ...result,
      page: result.page.map((m) => ({
        id: m._id,
        createdAt: m.createdAt,
        body: m.body,
        incoming: m.incoming,
        status: m.status,
      })),
    }
  },
})

/** @selfScoped Le code à usage unique est créé pour le membre DIASPORA de la session. */
export const createPairing = personMutation({
  args: { label: v.string() },
  returns: v.object({ code: v.string(), relay: v.string(), expiresAt: v.number() }),
  handler: async (ctx, { label }) => {
    const config = configured()
    const { person, network } = await member(ctx)
    label = label.trim()
    if (!label || label.length > 60) return fail("invalidArgument")
    await enforceRateLimit(ctx, "icomSms.pair", person._id)
    const code = crypto.randomUUID().replaceAll("-", "").slice(-16).toUpperCase()
    const expiresAt = Date.now() + 30 * 60_000
    const id = await ctx.db.insert("diasporaSmsPairings", {
      personId: person._id,
      networkId: network._id,
      label,
      expiresAt,
      digest: await pairingDigest(code),
    })
    await ctx.scheduler.runAt(expiresAt, self.cleanup, { pairingId: id })
    return { code, relay: config.relay, expiresAt }
  },
})

/** @selfScoped Le fil doit appartenir au membre de la session et le correspondant doit avoir accepté. */
export const send = personMutation({
  args: { threadId: v.id("diasporaSmsThreads"), body: v.string(), requestId: v.string() },
  returns: v.id("diasporaSmsMessages"),
  handler: async (ctx, { threadId, body, requestId }) => {
    const thread = await ownThread(ctx, threadId)
    body = body.trim()
    if (!body || body.length > 480 || !/^[\w-]{12,80}$/.test(requestId)) return fail("invalidArgument")
    const previous = await ctx.db
      .query("diasporaSmsMessages")
      .withIndex("by_request", (q) => q.eq("threadId", threadId).eq("requestId", requestId))
      .unique()
    if (previous) return previous.body === body ? previous._id : fail("invalidArgument")
    configured()
    if (!thread.active) return fail("policyRefused")
    await enforceRateLimit(ctx, "icomSms.send", thread.personId)
    const createdAt = Date.now()
    const id = await ctx.db.insert("diasporaSmsMessages", {
      threadId,
      networkId: thread.networkId,
      personId: thread.personId,
      body,
      requestId,
      incoming: false,
      createdAt,
      status: "queued",
    })
    await ctx.db.patch(threadId, { updatedAt: createdAt })
    await ctx.scheduler.runAfter(0, self.dispatch, { id, attempt: 0 })
    return id
  },
})

async function stop(ctx: MutationCtx, route: Doc<"diasporaSmsRoutes">, at: number) {
  if (at < route.changedAt) return
  if (route.threadId && (await ctx.db.get(route.threadId)))
    await ctx.db.patch(route.threadId, { active: false, updatedAt: Date.now() })
  await ctx.db.patch(route._id, { threadId: undefined, changedAt: at })
  await ctx.scheduler.runAfter(7 * DAY, self.cleanup, { routeId: route._id })
}

/** @selfScoped Seul le propriétaire authentifié de la conversation peut interrompre cet échange. */
export const disconnect = personMutation({
  args: { threadId: v.id("diasporaSmsThreads") },
  returns: v.null(),
  handler: async (ctx, { threadId }) => {
    const thread = await ownThread(ctx, threadId)
    const route = await ctx.db
      .query("diasporaSmsRoutes")
      .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
      .unique()
    if (route) await stop(ctx, route, Math.max(Date.now(), route.changedAt))
    else if (thread.active) await ctx.db.patch(threadId, { active: false })
    return null
  },
})

export const cleanup = internalMutation({
  args: {
    pairingId: v.optional(v.id("diasporaSmsPairings")),
    receiptId: v.optional(v.id("diasporaSmsDeliveries")),
    routeId: v.optional(v.id("diasporaSmsRoutes")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.pairingId && (await ctx.db.get(args.pairingId))) await ctx.db.delete(args.pairingId)
    if (args.receiptId && (await ctx.db.get(args.receiptId))) await ctx.db.delete(args.receiptId)
    if (args.routeId) {
      const route = await ctx.db.get(args.routeId)
      if (route && !route.threadId && route.changedAt <= Date.now() - 7 * DAY) await ctx.db.delete(args.routeId)
    }
    return null
  },
})

export const applyEvent = internalMutation({
  args: { deliveryId: v.string(), raw: v.string() },
  returns: v.null(),
  handler: async (ctx, { deliveryId, raw }) => {
    const config = smsCredentials()
    if (!config) return null
    const event = decodeSmsEvent(raw, config)
    if (!event || event.at < Date.now() - 7 * DAY || event.at > Date.now() + 300_000) return null
    const network = await diaspora(ctx)
    // Receipts and opt-outs still apply when the operator pauses the network.
    if (!network || network.managedBy !== DIASPORA_GA_SLICE) return null
    const key = event.kind === "incoming" ? "in/" + event.providerId : "event/" + deliveryId
    if (
      await ctx.db
        .query("diasporaSmsDeliveries")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique()
    )
      return null
    await enforceRateLimit(ctx, "icomSms.webhook", network._id)
    const receiptId = await ctx.db.insert("diasporaSmsDeliveries", { key })
    await ctx.scheduler.runAfter(8 * DAY, self.cleanup, { receiptId })
    const route = await ctx.db
      .query("diasporaSmsRoutes")
      .withIndex("by_phone", (q) =>
        q.eq("workspace", config.workspace).eq("relay", config.relay).eq("phone", event.phone),
      )
      .unique()
    if (event.kind === "receipt") {
      let message = await ctx.db
        .query("diasporaSmsMessages")
        .withIndex("by_provider", (q) => q.eq("providerId", event.providerId))
        .unique()
      if (!message && event.reference) {
        const id = ctx.db.normalizeId("diasporaSmsMessages", event.reference)
        message = id ? await ctx.db.get(id) : null
        if (message?.threadId !== route?.threadId || (message?.providerId && message.providerId !== event.providerId))
          return null
      }
      if (message && !message.incoming && message.networkId === network._id && (
        message.statusAt === undefined || event.at > message.statusAt ||
        (event.at === message.statusAt && deliveryOrder[event.status] > deliveryOrder[message.status])
      )) {
        await ctx.db.patch(message._id, { providerId: event.providerId, status: event.status, statusAt: event.at })
      }
      return null
    }
    const command = event.kind === "incoming" ? event.body.trim().toUpperCase() : "STOP"
    if (
      ["STOP", "ARRET", "ARRÊT", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"].includes(
        command,
      )
    ) {
      if (route) await stop(ctx, route, event.at)
      else {
        const routeId = await ctx.db.insert("diasporaSmsRoutes", {
          networkId: network._id,
          workspace: config.workspace,
          relay: config.relay,
          phone: event.phone,
          changedAt: event.at,
        })
        await ctx.scheduler.runAfter(7 * DAY, self.cleanup, { routeId })
      }
      return null
    }
    if (event.kind !== "incoming" || !smsConfig() || !(await networkAcceptsSms(ctx, network))) return null
    const code = /^JOIN\s+([A-F0-9]{16})$/.exec(command)?.[1]
    if (code) {
      if (route && (route.threadId || event.at <= route.changedAt)) return null
      const digest = await pairingDigest(code)
      const pairing = await ctx.db
        .query("diasporaSmsPairings")
        .withIndex("by_digest", (q) => q.eq("digest", digest))
        .unique()
      if (
        !pairing ||
        pairing.networkId !== network._id ||
        pairing.expiresAt < Date.now() ||
        event.at < pairing._creationTime - 1000 ||
        !(await memberHasStatus(ctx, network._id, pairing.personId, "declaree"))
      )
        return null
      const threadId = await ctx.db.insert("diasporaSmsThreads", {
        personId: pairing.personId,
        networkId: network._id,
        label: pairing.label,
        active: true,
        updatedAt: Date.now(),
      })
      if (route) await ctx.db.patch(route._id, { threadId, changedAt: event.at })
      else
        await ctx.db.insert("diasporaSmsRoutes", {
          networkId: network._id,
          workspace: config.workspace,
          relay: config.relay,
          phone: event.phone,
          threadId,
          changedAt: event.at,
        })
      await ctx.db.delete(pairing._id)
      return null
    }
    if (!route?.threadId || event.at < route.changedAt || !event.body.trim() || /^JOIN\b/.test(command)) return null
    const thread = await ctx.db.get(route.threadId)
    if (
      !thread?.active ||
      thread.networkId !== network._id ||
      !(await memberHasStatus(ctx, network._id, thread.personId, "declaree"))
    )
      return null
    await ctx.db.insert("diasporaSmsMessages", {
      threadId: thread._id,
      networkId: network._id,
      personId: thread.personId,
      body: event.body,
      incoming: true,
      providerId: event.providerId,
      status: "received",
      createdAt: event.at,
    })
    await ctx.db.patch(thread._id, { updatedAt: Math.max(thread.updatedAt, event.at) })
    return null
  },
})

export const forDispatch = internalQuery({
  args: { id: v.id("diasporaSmsMessages") },
  returns: v.union(v.null(), v.object({ phone: v.string(), body: v.string() })),
  handler: async (ctx, { id }) => {
    const message = await ctx.db.get(id)
    if (!message || message.incoming || message.status !== "queued") return null
    const thread = await ctx.db.get(message.threadId)
    const network = await diaspora(ctx)
    const route = await ctx.db
      .query("diasporaSmsRoutes")
      .withIndex("by_threadId", (q) => q.eq("threadId", message.threadId))
      .unique()
    const config = smsConfig()
    if (
      !config ||
      !route ||
      route.relay !== config.relay ||
      route.workspace !== config.workspace ||
      !thread?.active ||
      !network ||
      network._id !== thread.networkId ||
      !(await networkAcceptsSms(ctx, network)) ||
      !(await memberHasStatus(ctx, network._id, thread.personId, "declaree"))
    )
      return null
    return { phone: route.phone, body: message.body }
  },
})

// Provider events can share a millisecond and arrive in either order.
const deliveryOrder = { received: 0, queued: 0, accepted: 1, sent: 2, failed: 3, delivered: 4 } as const

export const finish = internalMutation({
  args: { id: v.id("diasporaSmsMessages"), status: smsStatus, providerId: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { id, status, providerId }) => {
    const row = await ctx.db.get(id)
    if (row?.status === "queued" && row.statusAt === undefined) await ctx.db.patch(id, { status, providerId })
    return null
  },
})

export const dispatch = internalAction({
  args: { id: v.id("diasporaSmsMessages"), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, attempt }): Promise<null> => {
    const config = smsConfig()
    const item: { phone: string; body: string } | null = await ctx.runQuery(self.forDispatch, { id })
    if (config && item) {
      try {
        const response = await fetch(config.endpoint, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(12_000),
          headers: {
            Authorization: "Bearer " + config.key,
            "Content-Type": "application/json",
            "Idempotency-Key": "icom-" + id,
          },
          body: JSON.stringify({
            from: config.relay,
            to: item.phone,
            text: item.body,
            category: "service",
            reference: id,
            metadata: { icom_id: id },
          }),
        })
        if (response.ok) {
          const result = await response.json()
          if (typeof result?.id !== "string" || !result.id) throw new Error("Missing SMS receipt")
          await ctx.runMutation(self.finish, { id, status: "accepted", providerId: result.id })
          return null
        }
        if (response.status === 429 || response.status >= 500 || response.status === 408 || response.status === 409)
          throw new Error("Temporary transport failure")
      } catch {
        if (attempt < 4) {
          await ctx.scheduler.runAfter(5000 * 4 ** attempt, self.dispatch, { id, attempt: attempt + 1 })
          return null
        }
      }
    }
    await ctx.runMutation(self.finish, { id, status: "failed" })
    return null
  },
})
