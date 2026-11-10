// Dupliqué de socle/convex/functions/pushSubscriptions.ts @ 25398f565 — adaptations : personne/réseau/appareil ; quatre fournisseurs ; empreinte du canal non réattribuable, aucune clé dans le DTO, bornes et débit.
import { isNativeCallUuid } from "@antsia/social-contracts/native-calls"
import { getActiveIdentity } from "../../lib/session"
import { subscriptionSessionGeneration } from "./sessionBinding"
import { MAX_PUSH_SUBSCRIPTIONS } from "@antsia/social-domain/notificationDelivery"
import { type Infer, v } from "convex/values"
import { fail, notFound } from "../../lib/errors"
import { networkMutation, networkQuery, personMutation, personQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { nativeCallApplication, notificationApplication, notificationApplications, providerHttpsUrl } from "./configuration"
import { pushCredentialValidator } from "./tables"

export type PushCredential = Infer<typeof pushCredentialValidator>
export async function credentialHash(credential: PushCredential): Promise<string> {
  const target = credential.provider === "web" ? credential.endpoint : credential.token
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${credential.provider}|${target}`))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function validateCredential(credential: PushCredential): void {
  if (credential.provider === "web") {
    let url: URL
    try { url = new URL(credential.endpoint) } catch { return fail("invalidArgument", { field: "endpoint" }) }
    const allowed = (process.env.WEB_PUSH_ALLOWED_ORIGINS ?? "").split(",").map((origin: string) => origin.trim()).filter(Boolean)
    if (url.protocol !== "https:" || url.username || url.password || url.hash || !allowed.includes(url.origin) || credential.endpoint.length > 4096) return fail("invalidArgument", { field: "endpoint" })
    if (!/^[A-Za-z0-9_-]{80,100}$/u.test(credential.keys.p256dh) || !/^[A-Za-z0-9_-]{20,30}$/u.test(credential.keys.auth)) return fail("invalidArgument", { field: "keys" })
  } else if (credential.provider === "expo") {
    if (!/^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]{1,200}\]$/u.test(credential.token)) return fail("invalidArgument", { field: "token" })
  } else if ((credential.provider === "apns" || credential.provider === "apns_voip")) {
    if (!/^[A-Fa-f0-9]{64}$/u.test(credential.token)) return fail("invalidArgument", { field: "token" })
  } else if (!/^[A-Za-z0-9_:.-]{20,4096}$/u.test(credential.token)) return fail("invalidArgument", { field: "token" })
}

export const subscribe = networkMutation({
  minStatus: "en_attente", args: { applicationId: v.string(), deviceId: v.string(), credential: pushCredentialValidator, nativeBinding: v.optional(v.object({ bindingId: v.string() })) },
  returns: v.object({ subscriptionId: v.id("pushSubscriptions") }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "notification.subscribe", ctx.person._id)
    if (!notificationApplication(args.applicationId, ctx.network.slug) || !/^[A-Za-z0-9_-]{8,128}$/u.test(args.deviceId)) return fail("invalidArgument", { field: "deviceId" })
    const application = notificationApplication(args.applicationId, ctx.network.slug)
    if (args.nativeBinding && (!isNativeCallUuid(args.nativeBinding.bindingId) || !nativeCallApplication(args.applicationId, ctx.network.slug))) return fail("policyRefused")
    if (args.credential.provider === "apns_voip" && (!args.nativeBinding || application?.native?.platform !== "ios" || !application.native.calls)) return fail("policyRefused")
    if (args.nativeBinding && (application?.native?.platform === "ios" ? args.credential.provider !== "apns_voip" : args.credential.provider !== "fcm")) return fail("policyRefused")
    validateCredential(args.credential)
    const hash = await credentialHash(args.credential)
    const existing = await ctx.db.query("pushSubscriptions").withIndex("by_provider_hash", (q) => q.eq("provider", args.credential.provider).eq("credentialHash", hash)).unique()
    if (existing && (existing.personId !== ctx.person._id || existing.networkId !== ctx.networkId || existing.applicationId !== args.applicationId)) return notFound()
    const rows = await ctx.db.query("pushSubscriptions").withIndex("by_network_person_active", (q) => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id).eq("active", true)).take(MAX_PUSH_SUBSCRIPTIONS + 1)
    const replaced = args.nativeBinding ? rows.filter(row => row._id !== existing?._id && row.applicationId === args.applicationId && row.deviceId === args.deviceId && row.nativeBindingId !== undefined) : []
    if (rows.length > MAX_PUSH_SUBSCRIPTIONS || !existing?.active && rows.length - replaced.length >= MAX_PUSH_SUBSCRIPTIONS) return fail("policyRefused")
    const sessionId = (await getActiveIdentity(ctx))?.sessionId
    if (typeof sessionId !== "string") return fail("unauthenticated")
    const now = Date.now()
    const nativeBindingId = args.nativeBinding?.bindingId
    const preserveGeneration = existing?.active && existing.sessionId === sessionId && existing.deviceId === args.deviceId && existing.nativeBindingId === nativeBindingId && /^[a-f0-9]{64}$/u.test(existing.sessionGeneration ?? "")
    const sessionGeneration = nativeBindingId && preserveGeneration ? existing.sessionGeneration : nativeBindingId ? await subscriptionSessionGeneration({ sessionId, applicationId: args.applicationId, deviceId: args.deviceId, bindingId: nativeBindingId, incarnation: `${now}:${existing?.sessionGeneration ?? "initial"}` }) : undefined
    for (const row of replaced) await ctx.db.patch(row._id, { active: false, updatedAt: now })
    if (existing) { await ctx.db.patch(existing._id, { credential: args.credential, deviceId: args.deviceId, sessionId, nativeBindingId, sessionGeneration, active: true, updatedAt: now, failureCount: 0 }); return { subscriptionId: existing._id } }
    const subscriptionId = await ctx.db.insert("pushSubscriptions", { networkId: ctx.networkId, personId: ctx.person._id, applicationId: args.applicationId, deviceId: args.deviceId, provider: args.credential.provider, credential: args.credential, credentialHash: hash, sessionId, nativeBindingId, sessionGeneration, active: true, createdAt: now, updatedAt: now, failureCount: 0 })
    return { subscriptionId }
  },
})

/** @selfScoped Désactiver son appareil reste possible même suspendu ou muet. */
export const unsubscribe = personMutation({
  args: { networkId: v.id("networks"), subscriptionId: v.id("pushSubscriptions") }, returns: v.null(),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "notification.unsubscribe", ctx.person._id)
    const row = await ctx.db.get(args.subscriptionId)
    if (!row || row.networkId !== args.networkId || row.personId !== ctx.person._id) return notFound()
    await ctx.db.patch(row._id, { active: false, updatedAt: Date.now() })
    return null
  },
})

/** Les secrets de livraison ne sortent JAMAIS de la base vers le navigateur. */
/** @selfScoped Liste de ses appareils uniquement, sans contenu de réseau. */
export const listMine = personQuery({ args: { networkId: v.id("networks") }, handler: async (ctx, args) => {
  const rows = await ctx.db.query("pushSubscriptions").withIndex("by_network_person_active", (q) => q.eq("networkId", args.networkId).eq("personId", ctx.person._id).eq("active", true)).take(MAX_PUSH_SUBSCRIPTIONS)
  const identity = await ctx.auth.getUserIdentity()
  return rows.map((row) => ({ currentSession: row.sessionId === identity?.sessionId, subscriptionId: row._id, applicationId: row.applicationId, deviceId: row.deviceId, provider: row.provider, credentialHash: row.credentialHash, active: row.active, updatedAt: row.updatedAt }))
} })

/** Configuration publique pour un geste d'abonnement ; aucune clef privée ni souscription. */
export const configuration = networkQuery({ args: {}, handler: async (ctx) => ({
  applications: notificationApplications().filter((application) => application.networkSlug === ctx.network.slug).map((application) => ({ applicationId: application.applicationId })),
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY?.trim() || null,
  available: {
    web: !!process.env.VAPID_PUBLIC_KEY?.trim() && !!process.env.VAPID_PRIVATE_KEY?.trim() && !!process.env.VAPID_SUBJECT?.trim() && !!process.env.WEB_PUSH_ALLOWED_ORIGINS?.trim(),
    expo: !!providerHttpsUrl(process.env.EXPO_PUSH_ENDPOINT) && !!providerHttpsUrl(process.env.EXPO_RECEIPTS_ENDPOINT),
    fcm: !!providerHttpsUrl(process.env.FCM_SEND_ENDPOINT) && !!providerHttpsUrl(process.env.FCM_OAUTH_ENDPOINT) && !!process.env.FCM_OAUTH_SCOPE && !!process.env.FCM_SERVICE_ACCOUNT_JSON,
    apns_voip: notificationApplications().some(application => application.networkSlug === ctx.network.slug && application.native?.platform === "ios" && nativeCallApplication(application.applicationId, ctx.network.slug) !== null),
    apns: !!providerHttpsUrl(process.env.APNS_ENDPOINT) && !!process.env.APNS_PRIVATE_KEY && !!process.env.APNS_KEY_ID && !!process.env.APNS_TEAM_ID && !!process.env.APNS_TOPIC,
    digest: !!process.env.RESEND_API_KEY?.trim() && !!process.env.RESEND_FROM_ADDRESS?.trim(),
  },
}) })

/** @selfScoped Une ancienne configuration ne doit jamais empêcher la révocation de son appareil. */
export const unsubscribeNativeDevice = personMutation({
  args: { networkId: v.id("networks"), applicationId: v.string(), deviceId: v.string(), bindingId: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "notification.unsubscribe", ctx.person._id)
    const sessionId = (await getActiveIdentity(ctx))?.sessionId
    if (typeof sessionId !== "string") return notFound()
    const rows = await ctx.db.query("pushSubscriptions").withIndex("by_network_person_active", q => q.eq("networkId", args.networkId).eq("personId", ctx.person._id).eq("active", true)).take(MAX_PUSH_SUBSCRIPTIONS)
    for (const row of rows) if (row.applicationId === args.applicationId && row.deviceId === args.deviceId && row.nativeBindingId === args.bindingId && row.sessionId === sessionId) await ctx.db.patch(row._id, { active: false, updatedAt: Date.now() })
    return null
  },
})
