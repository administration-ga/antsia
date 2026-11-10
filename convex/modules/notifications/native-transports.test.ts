/** P17c — doubles de transports uniquement ; aucun fournisseur contacté. */
import { EventEmitter } from "node:events"
import { generateKeyPairSync } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { NativeCallPushPayload } from "@antsia/social-contracts/native-calls"
import type { NotificationApplication } from "./configuration"
const mocks = vi.hoisted(() => ({ connect: vi.fn(), web: vi.fn() }))
vi.mock("node:http2", () => ({ connect: mocks.connect }))
vi.mock("web-push", () => ({ default: { sendNotification: mocks.web } }))
import { deliverPush } from "./transports"
const NOW = Date.UTC(2026, 9, 20, 12)
const ios: NotificationApplication = { applicationId: "antsia_ios", networkSlug: "antsia", origin: "https://native.example.test", entryPath: "/fil", native: { platform: "ios", calls: true, bundleId: "test.antsia" } }
const android: NotificationApplication = { ...ios, applicationId: "antsia_android", native: { platform: "android", calls: true } }
const payload: NativeCallPushPayload = { version: 1, kind: "antsia.call", phase: "ring", networkId: "a".repeat(32), reference: "b".repeat(32), applicationId: ios.applicationId, bindingId: "21111111-1111-4111-8111-111111111111", uuid: "31111111-1111-4111-8111-111111111111", expiresAt: NOW + 45_000 }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW)
  mocks.connect.mockReset(); mocks.web.mockReset()
  vi.stubEnv("NOTIFICATION_APPLICATIONS_JSON", JSON.stringify([ios, android]))
  for (const key of ["LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "LIVEKIT_WS_URL"]) vi.stubEnv(key, "fixture")
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe("transports système fermés", () => {
  it("APNs VoIP ring uniquement, topic dédié, expiration zéro et aucune alerte nominative", async () => {
    const key = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
    vi.stubEnv("APNS_ENDPOINT", "https://apns.example.test/"); vi.stubEnv("APNS_KEY_ID", "fixture-key"); vi.stubEnv("APNS_TEAM_ID", "fixture-team")
    vi.stubEnv("APNS_PRIVATE_KEY", key.privateKey.export({ format: "pem", type: "pkcs8" }).toString())
    let headers: Record<string, unknown> = {}, posted = ""
    const session = new EventEmitter() as EventEmitter & { request: (value: Record<string, unknown>) => unknown; destroy: () => void }
    session.destroy = vi.fn()
    session.request = value => {
      headers = value
      const req = new EventEmitter() as EventEmitter & { setEncoding: () => void; end: (body: string) => void }
      req.setEncoding = () => {}
      req.end = body => { posted = body; queueMicrotask(() => { req.emit("response", { ":status": 200 }); req.emit("end") }) }
      return req
    }
    mocks.connect.mockReturnValue(session)
    expect(await deliverPush({ provider: "apns_voip", token: "a".repeat(64) }, payload, true, async () => true, ios)).toEqual({ status: "sent" })
    expect(headers).toMatchObject({ "apns-push-type": "voip", "apns-topic": "test.antsia.voip", "apns-priority": "10", "apns-expiration": "0" })
    expect(JSON.parse(posted)).toEqual({ aps: { "content-available": 1 }, ...payload })
    expect(posted).not.toContain("displayName"); expect(posted).not.toContain("serverUrl"); expect(posted).not.toContain("alert")
  })
  it("FCM data-only exact, haute priorité 45s ; pas de notification système automatique", async () => {
    const key = generateKeyPairSync("rsa", { modulusLength: 2048 })
    vi.stubEnv("FCM_SEND_ENDPOINT", "https://fcm.example.test/send"); vi.stubEnv("FCM_OAUTH_ENDPOINT", "https://oauth.example.test/token"); vi.stubEnv("FCM_OAUTH_SCOPE", "fixture-scope")
    vi.stubEnv("FCM_SERVICE_ACCOUNT_JSON", JSON.stringify({ client_email: "service@example.test", private_key: key.privateKey.export({ format: "pem", type: "pkcs8" }).toString() }))
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "fixture-token" }))).mockResolvedValueOnce(new Response("{}"))
    vi.stubGlobal("fetch", fetchMock)
    const message = { ...payload, applicationId: android.applicationId }
    expect(await deliverPush({ provider: "fcm", token: "device-token" }, message, true, async () => true, android)).toEqual({ status: "sent" })
    const body = JSON.parse(fetchMock.mock.calls[1]![1].body as string) as { message: Record<string, unknown> }
    expect(body.message.data).toEqual({ payload: JSON.stringify(message) })
    expect(body.message).not.toHaveProperty("notification")
    expect(body.message.android).toMatchObject({ priority: "HIGH", ttl: "45s" })
  })
  it("Expo et fournisseur social ne peuvent pas envoyer une sonnerie native", async () => {
    vi.stubEnv("APNS_ENDPOINT", "https://apns.example.test/")
    for (const key of ["APNS_PRIVATE_KEY", "APNS_KEY_ID", "APNS_TEAM_ID"]) vi.stubEnv(key, "fixture")
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock)
    expect(await deliverPush({ provider: "expo", token: "ExpoPushToken[fixture]" }, payload, true, async () => true, ios)).toEqual({ status: "invalid" })
    expect(await deliverPush({ provider: "apns", token: "a".repeat(64) }, payload, true, async () => true, ios)).toEqual({ status: "invalid" })
    expect(fetchMock).not.toHaveBeenCalled(); expect(mocks.connect).not.toHaveBeenCalled()
  })
  it("VoIP refuse avis sociaux, phase cancel, contenu ajouté et signal périmé", async () => {
    const credential = { provider: "apns_voip", token: "a".repeat(64) } as const
    expect(await deliverPush(credential, { version: 1, networkId: payload.networkId, reference: payload.reference, locale: "fr", count: 1, url: ios.origin })).toEqual({ status: "invalid" })
    expect(await deliverPush(credential, { ...payload, phase: "cancel" } as unknown as NativeCallPushPayload, true, async () => true, ios)).toEqual({ status: "invalid" })
    expect(await deliverPush(credential, { ...payload, displayName: "private" } as NativeCallPushPayload, true, async () => true, ios)).toEqual({ status: "invalid" })
    expect(await deliverPush(credential, { ...payload, expiresAt: NOW - 1 }, true, async () => true, ios)).toEqual({ status: "cancelled" })
    expect(mocks.connect).not.toHaveBeenCalled()
  })
  it("politique révoquée pendant OAuth empêche l'envoi FCM natif", async () => {
    const key = generateKeyPairSync("rsa", { modulusLength: 2048 })
    vi.stubEnv("FCM_SEND_ENDPOINT", "https://fcm.example.test/send"); vi.stubEnv("FCM_OAUTH_ENDPOINT", "https://oauth.example.test/token"); vi.stubEnv("FCM_OAUTH_SCOPE", "fixture-scope")
    vi.stubEnv("FCM_SERVICE_ACCOUNT_JSON", JSON.stringify({ client_email: "service@example.test", private_key: key.privateKey.export({ format: "pem", type: "pkcs8" }).toString() }))
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "fixture-token" }))); vi.stubGlobal("fetch", fetchMock)
    expect(await deliverPush({ provider: "fcm", token: "device-token" }, { ...payload, applicationId: android.applicationId }, true, async () => false, android)).toEqual({ status: "cancelled" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
