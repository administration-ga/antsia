"use node"

// Dupliqué de socle/convex/actions/push.ts @ 25398f565 — adaptations : transport par appareil ; VAPID par appel ; payload fermé sans contenu ; Expo et reçus, FCM OAuth/JWT, APNs JWT/HTTP2 ; statuts explicites et aucun journal de secret.
import { createPrivateKey, sign } from "node:crypto"
import { connect } from "node:http2"
import { isNeutralNotificationPayload, neutralNotificationMessage, type NeutralNotificationPayload } from "@antsia/social-domain/notificationDelivery"
import { isNativeCallPushPayload, type NativeCallPushPayload } from "@antsia/social-contracts/native-calls"
import { BRAND_NAME } from "@antsia/social-contracts/brand"
import webpush from "web-push"
import { nativeCallApplication, providerHttpsUrl, type NotificationApplication } from "./configuration"
import type { PushCredential } from "./pushSubscriptions"

export type TransportResult = { status: "sent" | "invalid" | "retry" | "unavailable" | "cancelled" } | { status: "accepted"; receiptId: string }
type TransportGuard = () => Promise<boolean>
const TIMEOUT_MS = 8_000
function record(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null }
async function json(response: Response): Promise<unknown> { const text = await response.text(); if (text.length > 1_000_000) throw new Error("providerResponseTooLarge"); return JSON.parse(text) as unknown }
function privateKey(value: string): string { return value.replace(/\\n/gu, "\n") }
function jwt(header: Record<string, unknown>, claims: Record<string, unknown>, key: string, algorithm: "RS256" | "ES256"): string {
  const unsigned = `${Buffer.from(JSON.stringify(header)).toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`
  const signature = sign("sha256", Buffer.from(unsigned), { key: createPrivateKey(privateKey(key)), ...(algorithm === "ES256" ? { dsaEncoding: "ieee-p1363" as const } : {}) })
  return `${unsigned}.${signature.toString("base64url")}`
}

async function sendWeb(credential: Extract<PushCredential, { provider: "web" }>, payload: NeutralNotificationPayload, call: boolean, guard: TransportGuard): Promise<TransportResult> {
  const subject = process.env.VAPID_SUBJECT?.trim(), publicKey = process.env.VAPID_PUBLIC_KEY?.trim(), secret = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!subject || !publicKey || !secret) return { status: "unavailable" }
  // Une ancienne souscription ne contourne pas une origine retirée de l'allowlist.
  const allowed = (process.env.WEB_PUSH_ALLOWED_ORIGINS ?? "").split(",").map((value: string) => value.trim())
  if (!allowed.includes(new URL(credential.endpoint).origin)) return { status: "invalid" }
  if (!(await guard())) return { status: "cancelled" }
  try {
    await webpush.sendNotification({ endpoint: credential.endpoint, keys: credential.keys }, JSON.stringify(payload), { vapidDetails: { subject, publicKey, privateKey: secret }, timeout: TIMEOUT_MS, TTL: call ? 45 : 3600, urgency: call ? "high" : "normal", topic: payload.reference.replace(/[^a-zA-Z0-9_-]/gu, "").slice(0, 32) })
    return { status: "sent" }
  } catch (error) { const code = record(error)?.statusCode; return { status: code === 404 || code === 410 ? "invalid" : "retry" } }
}

async function sendExpo(credential: Extract<PushCredential, { provider: "expo" }>, payload: NeutralNotificationPayload, call: boolean, guard: TransportGuard): Promise<TransportResult> {
  const endpoint = providerHttpsUrl(process.env.EXPO_PUSH_ENDPOINT), receipts = providerHttpsUrl(process.env.EXPO_RECEIPTS_ENDPOINT)
  if (!endpoint || !receipts) return { status: "unavailable" }
  if (!(await guard())) return { status: "cancelled" }
  const response = await fetch(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "Content-Type": "application/json", ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) }, body: JSON.stringify({ to: credential.token, title: BRAND_NAME, body: neutralNotificationMessage(payload.locale, payload.count), data: payload, ttl: call ? 45 : 3600, priority: call ? "high" : "normal", ...(call ? { sound: "default" } : {}) }) })
  if (!response.ok) return { status: "retry" }
  const data = record(await json(response))?.data, ticket = record(Array.isArray(data) ? data[0] : data)
  if (ticket?.status === "ok" && typeof ticket.id === "string" && ticket.id.length <= 200) return { status: "accepted", receiptId: ticket.id }
  return { status: record(ticket?.details)?.error === "DeviceNotRegistered" ? "invalid" : "retry" }
}

export async function readExpoReceipt(receiptId: string): Promise<TransportResult> {
  const endpoint = providerHttpsUrl(process.env.EXPO_RECEIPTS_ENDPOINT)
  if (!endpoint) return { status: "unavailable" }
  try {
    const response = await fetch(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "Content-Type": "application/json", ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) }, body: JSON.stringify({ ids: [receiptId] }) })
    if (!response.ok) return { status: "retry" }
    const data = record(record(await json(response))?.data), receipt = record(data?.[receiptId])
    if (!receipt) return { status: "accepted", receiptId }
    if (receipt.status === "ok") return { status: "sent" }
    return { status: record(receipt.details)?.error === "DeviceNotRegistered" ? "invalid" : "retry" }
  } catch { return { status: "retry" } }
}

async function sendFcm(credential: Extract<PushCredential, { provider: "fcm" }>, payload: NeutralNotificationPayload | NativeCallPushPayload, call: boolean, guard: TransportGuard): Promise<TransportResult> {
  const endpoint = providerHttpsUrl(process.env.FCM_SEND_ENDPOINT), oauth = providerHttpsUrl(process.env.FCM_OAUTH_ENDPOINT), scope = process.env.FCM_OAUTH_SCOPE
  let account: Record<string, unknown> | null
  try { account = record(JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON ?? "null") as unknown) } catch { return { status: "unavailable" } }
  if (!endpoint || !oauth || !scope || typeof account?.client_email !== "string" || typeof account.private_key !== "string") return { status: "unavailable" }
  const now = Math.floor(Date.now() / 1000)
  const assertion = jwt({ alg: "RS256", typ: "JWT" }, { iss: account.client_email, scope, aud: oauth, iat: now, exp: now + 3600 }, account.private_key, "RS256")
  const tokenResponse = await fetch(oauth, { method: "POST", redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) })
  if (!tokenResponse.ok) return { status: "retry" }
  const token = record(await json(tokenResponse))?.access_token
  if (typeof token !== "string" || token.length > 8192) return { status: "retry" }
  // Le renouvellement OAuth peut avoir pris huit secondes : rejuger APRÈS lui.
  if (!(await guard())) return { status: "cancelled" }
  const native = isNativeCallPushPayload(payload)
  if (native && !isNativeCallPushPayload(payload, Date.now())) return { status: "cancelled" }
  const data = native ? { payload: JSON.stringify(payload) } : Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, String(value)]))
  const notification = "locale" in payload ? { notification: { title: BRAND_NAME, body: neutralNotificationMessage(payload.locale, payload.count) } } : {}
  const response = await fetch(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ message: { token: credential.token, ...notification, data, android: { ttl: call ? "45s" : "3600s", priority: call ? "HIGH" : "NORMAL", collapse_key: payload.reference } } }) })
  if (response.ok) return { status: "sent" }
  const error = record(record(await json(response))?.error), details = Array.isArray(error?.details) ? error.details : []
  return { status: details.some((value) => record(value)?.errorCode === "UNREGISTERED") ? "invalid" : "retry" }
}

async function sendApns(credential: Extract<PushCredential, { provider: "apns" | "apns_voip" }>, payload: NeutralNotificationPayload | NativeCallPushPayload, call: boolean, guard: TransportGuard, application?: NotificationApplication): Promise<TransportResult> {
  const native = isNativeCallPushPayload(payload)
  const endpoint = providerHttpsUrl(process.env.APNS_ENDPOINT), key = process.env.APNS_PRIVATE_KEY, keyId = process.env.APNS_KEY_ID, teamId = process.env.APNS_TEAM_ID, topic = native ? application?.native?.bundleId ? `${application.native.bundleId}.voip` : undefined : process.env.APNS_TOPIC
  if (!endpoint || !key || !keyId || !teamId || !topic) return { status: "unavailable" }
  if (!(await guard()) || native && !isNativeCallPushPayload(payload, Date.now())) return { status: "cancelled" }
  const token = jwt({ alg: "ES256", kid: keyId }, { iss: teamId, iat: Math.floor(Date.now() / 1000) }, key, "ES256")
  const target = new URL(`3/device/${credential.token}`, endpoint)
  return await new Promise<TransportResult>((resolve) => {
    const session = connect(target.origin)
    let settled = false
    const finish = (result: TransportResult) => { if (settled) return; settled = true; clearTimeout(timer); session.destroy(); resolve(result) }
    const timer = setTimeout(() => finish({ status: "retry" }), TIMEOUT_MS)
    session.on("error", () => finish({ status: "retry" }))
    const request = session.request({ ":method": "POST", ":path": target.pathname, authorization: `bearer ${token}`, "apns-topic": topic, "apns-push-type": native ? "voip" : "alert", "apns-priority": native || call ? "10" : "5", "apns-expiration": native ? "0" : String(Math.floor(Date.now() / 1000) + (call ? 45 : 3600)), "apns-collapse-id": payload.reference.slice(0, 64) })
    let status: unknown, response = ""
    request.on("response", (headers) => { status = headers[":status"] })
    request.setEncoding("utf8")
    request.on("data", (chunk: string) => { response += chunk; if (response.length > 4096) finish({ status: "retry" }) })
    request.on("error", () => finish({ status: "retry" }))
    request.on("end", () => {
      if (status === 200) return finish({ status: "sent" })
      let reason: unknown
      try { reason = record(JSON.parse(response) as unknown)?.reason } catch { reason = null }
      finish({ status: status === 410 || reason === "BadDeviceToken" || reason === "Unregistered" ? "invalid" : "retry" })
    })
    request.end(JSON.stringify({ aps: "locale" in payload ? { alert: { title: BRAND_NAME, body: neutralNotificationMessage(payload.locale, payload.count) }, ...(call ? { sound: "default" } : {}) } : { "content-available": 1 }, ...payload }))
  })
}

export async function deliverPush(credential: PushCredential, payload: NeutralNotificationPayload | NativeCallPushPayload, call = false, guard: TransportGuard = async () => true, application?: NotificationApplication): Promise<TransportResult> {
  if (isNativeCallPushPayload(payload)) {
    if (!call || !isNativeCallPushPayload(payload, Date.now())) return { status: "cancelled" }
    const configured = application ? nativeCallApplication(application.applicationId, application.networkSlug) : null
    if (!configured?.native || configured.applicationId !== payload.applicationId) return { status: "unavailable" }
    try {
      if (configured.native.platform === "ios" && credential.provider === "apns_voip") return await sendApns(credential, payload, true, guard, configured)
      if (configured.native.platform === "android" && credential.provider === "fcm") return await sendFcm(credential, payload, true, guard)
      return { status: "invalid" }
    } catch { return { status: "retry" } }
  }
  if (!isNeutralNotificationPayload(payload) || credential.provider === "apns_voip") return { status: "invalid" }
  try {
    switch (credential.provider) {
      case "web": return await sendWeb(credential, payload, call, guard)
      case "expo": return await sendExpo(credential, payload, call, guard)
      case "fcm": return await sendFcm(credential, payload, call, guard)
      case "apns": return await sendApns(credential, payload, call, guard)
    }
  } catch { return { status: "retry" } }
}
