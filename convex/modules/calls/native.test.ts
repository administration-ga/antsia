// @vitest-environment edge-runtime
/** P17c : scénarios source seulement ; vraies sessions, aucun transport fournisseur. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { makeFunctionReference } from "convex/server"
import type { NativeCallBinding } from "@antsia/social-contracts/native-calls"
import { notificationWeekStart } from "@antsia/social-domain/notificationDelivery"
import { api, components, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { createTestSession, testConvex } from "../../test.setup"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { enqueueIncomingCallPush, prepareDelivery } from "../notifications/deliveries"
import { isCalleeKnownOffline } from "./evaluate"

const doubles = vi.hoisted(() => ({ wake: vi.fn() }))
vi.mock("../../lib/livekitWake", () => ({ ensureLiveKitAwake: doubles.wake }))

const NOW = Date.UTC(2026, 9, 20, 12)
const binding: NativeCallBinding = { applicationId: "antsia_ios", deviceId: "device_native_a", bindingId: "21111111-1111-4111-8111-111111111111" }
const otherBinding: NativeCallBinding = { ...binding, deviceId: "device_native_b", bindingId: "22222222-2222-4222-8222-222222222222" }
const uuid = "31111111-1111-4111-8111-111111111111"
type Base = { networkId: Id<"networks"> }
type Join = Base & NativeCallBinding & { callId: Id<"calls"> }
const join = makeFunctionReference<"mutation", Join, { callId: Id<"calls">; uuid: string; media: "audio" | "video" }>("modules/calls/native:join")
const release = makeFunctionReference<"mutation", Join, { ended: boolean }>("modules/calls/native:release")
const resolve = makeFunctionReference<"query", Base & NativeCallBinding & { reference: Id<"notificationDeliveryJobs"> }, { callId: Id<"calls">; uuid: string; media: "audio" | "video"; expiresAt: number; caller: { displayName: string | null; handle: string | null } | null } | null>("modules/calls/native:resolveIncoming")
const subscribe = makeFunctionReference<"mutation", Base & { applicationId: string; deviceId: string; nativeBinding: { bindingId: string }; credential: { provider: "apns_voip"; token: string } }, { subscriptionId: Id<"pushSubscriptions"> }>("modules/notifications/pushSubscriptions:subscribe")
const requestToken = makeFunctionReference<"action", Join, { token: string; serverUrl: string; media: "audio" | "video" }>("modules/calls/livekitActions:requestNativeToken")
const nativeToken = makeFunctionReference<"query", Join, { roomName: string } | null>("modules/calls/native:authorizeNativeToken")

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW)
  doubles.wake.mockReset().mockResolvedValue(undefined)
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.stubEnv("NOTIFICATION_APPLICATIONS_JSON", JSON.stringify([{ applicationId: binding.applicationId, networkSlug: "antsia", origin: "https://native.example.test", entryPath: "/fil", native: { platform: "ios", bundleId: "test.antsia", calls: true } }]))
  for (const key of ["LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "LIVEKIT_WS_URL", "APNS_PRIVATE_KEY", "APNS_KEY_ID", "APNS_TEAM_ID"]) vi.stubEnv(key, "fixture-not-used-over-network")
  vi.stubEnv("APNS_ENDPOINT", "https://apns.example.test/")
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

async function fixture() {
  const t = testConvex({ automaticSessions: false })
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const member = async (subject: string) => {
    const sessionId = await createTestSession(t, subject), as = t.withIdentity({ subject, sessionId })
    const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    await t.run(async ctx => { await ctx.db.insert("networkMemberships", { networkId: root, personId, status: "declaree", role: "member", joinedAt: NOW, statusChangedAt: NOW }) })
    return { as, personId, sessionId, subject }
  }
  const a = await member("native-caller"), b = await member("native-callee")
  const callId = await t.run(async ctx => {
    const id = await ctx.db.insert("calls", { networkId: root, kind: "direct", status: "active", callStatus: "ringing", roomName: "native-room", systemCallUuid: uuid, createdByPersonId: a.personId, calleePersonId: b.personId, mediaType: "audio", maxParticipants: 2, startedAt: NOW })
    await ctx.db.insert("callParticipants", { networkId: root, callId: id, personId: a.personId, role: "host", joinedAt: NOW, ownerSessionId: a.sessionId })
    await ctx.db.insert("callParticipants", { networkId: root, callId: id, personId: b.personId, role: "participant" })
    return id
  })
  await b.as.mutation(api.modules.people.consents.recordConsent, { networkId: root, purpose: "notifications", origin: "settings" })
  const register = async (tuple = binding, token = "a".repeat(64), client = b.as) => await client.mutation(subscribe, { networkId: root, applicationId: tuple.applicationId, deviceId: tuple.deviceId, nativeBinding: { bindingId: tuple.bindingId }, credential: { provider: "apns_voip", token } })
  const sub = await register()
  const enqueue = async () => await t.run(async ctx => await enqueueIncomingCallPush({ db: ctx.db, runQuery: ctx.runQuery }, root, b.personId, callId))
  const jobs = async () => await t.run(async ctx => await ctx.db.query("notificationDeliveryJobs").withIndex("by_call_recipient", q => q.eq("callId", callId).eq("recipientPersonId", b.personId)).take(16))
  const input = { networkId: root, callId, ...binding }
  return { t, root, a, b, member, callId, register, sub, enqueue, jobs, input }
}

describe("gagnant et média", () => {
  it("annuler avant join ferme seulement l'hôte réservé à cette session", async () => {
    const { t, a, root, callId } = await fixture()
    const input = { networkId: root, callId, ...binding }
    const anotherSession = await createTestSession(t, a.subject)
    const other = t.withIdentity({ subject: a.subject, sessionId: anotherSession })
    expect(await other.mutation(release, input)).toEqual({ ended: false })
    expect((await t.run(async ctx => await ctx.db.get(callId)))?.status).toBe("active")
    expect(await a.as.mutation(release, input)).toEqual({ ended: true })
    expect((await t.run(async ctx => await ctx.db.get(callId)))?.endReason).toBe("cancelled")
  })
  it("premier appareil gagnant, doublon idempotent, autre appareil et Web refusés", async () => {
    const { t, b, root, callId, input } = await fixture()
    expect(await b.as.mutation(join, input)).toEqual({ callId, uuid, media: "audio" })
    const first = await t.run(async ctx => await ctx.db.query("callParticipants").withIndex("by_call_person", q => q.eq("callId", callId).eq("personId", b.personId)).unique())
    vi.setSystemTime(NOW + 1000)
    expect(await b.as.mutation(join, input)).toMatchObject({ uuid })
    expect((await t.run(async ctx => await ctx.db.get(first!._id)))?.joinedAt).toBe(first?.joinedAt)
    await expect(b.as.mutation(join, { ...input, ...otherBinding })).rejects.toThrow()
    await expect(b.as.mutation(api.modules.calls.lifecycle.join, { networkId: root, callId })).rejects.toThrow()
    expect(await b.as.query(internal.modules.calls.token.authorizeToken, { networkId: root, callId })).toBeNull()
    expect(await b.as.query(nativeToken, input)).toMatchObject({ roomName: "native-room" })
    expect(await b.as.query(nativeToken, { ...input, ...otherBinding })).toBeNull()
  })
  it("une nouvelle session ne reprend pas le gagnant ; session révoquée ferme le jeton", async () => {
    const { t, b, input } = await fixture()
    await b.as.mutation(join, input)
    const newSession = await createTestSession(t, b.subject), second = t.withIdentity({ subject: b.subject, sessionId: newSession })
    await expect(second.mutation(join, input)).rejects.toThrow()
    expect(await second.query(nativeToken, input)).toBeNull()
    await t.mutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: b.sessionId }] } })
    await expect(b.as.query(nativeToken, input)).rejects.toThrow()
  })
  it("une fin pendant le réveil refuse le jeton tardif avant signature", async () => {
    const { b, input } = await fixture()
    await b.as.mutation(join, input)
    doubles.wake.mockImplementationOnce(async () => { await b.as.mutation(release, input) })
    await expect(b.as.action(requestToken, input)).rejects.toThrow()
    expect(doubles.wake).toHaveBeenCalledTimes(1)
  })
  it("le créateur précise sa réservation natif une seule fois ; Web déjà gagné ne se convertit pas", async () => {
    const { a, root, callId } = await fixture()
    const input = { networkId: root, callId, ...binding }
    expect(await a.as.query(internal.modules.calls.token.authorizeToken, { networkId: root, callId })).toBeNull()
    await a.as.mutation(api.modules.calls.lifecycle.join, { networkId: root, callId })
    expect(await a.as.query(internal.modules.calls.token.authorizeToken, { networkId: root, callId })).not.toBeNull()
    await expect(a.as.mutation(join, input)).rejects.toThrow()
  })
  it("un gagnant Web empêche la prise native ; sortie d'un perdant sans effet", async () => {
    const { t, b, root, callId, input } = await fixture()
    await b.as.mutation(api.modules.calls.lifecycle.join, { networkId: root, callId })
    await expect(b.as.mutation(join, input)).rejects.toThrow()
    expect(await b.as.mutation(release, input)).toEqual({ ended: false })
    expect((await t.run(async ctx => await ctx.db.get(callId)))?.callStatus).toBe("connected")
  })
  it("refuser avant join ne demande aucun jeton et termine le tête-à-tête", async () => {
    const { t, b, input, callId } = await fixture()
    expect(await b.as.mutation(release, input)).toEqual({ ended: true })
    expect((await t.run(async ctx => await ctx.db.get(callId)))?.callStatus).toBe("declined")
    await expect(b.as.mutation(join, input)).rejects.toThrow()
  })
  it("sortie individuelle de groupe : les autres restent en communication", async () => {
    const { t, b, root, callId, input } = await fixture()
    await t.run(async ctx => {
      await ctx.db.patch(callId, { kind: "group", calleePersonId: undefined, maxParticipants: 3 })
      await ctx.db.insert("callInvites", { networkId: root, callId, personId: b.personId, status: "ringing", invitedAt: NOW })
    })
    await b.as.mutation(join, input)
    expect(await b.as.mutation(release, input)).toEqual({ ended: false })
    expect((await t.run(async ctx => await ctx.db.get(callId)))?.status).toBe("active")
  })
})

describe("référence de sonnerie et incarnation", () => {
  it("payload fermé sans nom ni URL ; réabonnement froid identique conserve le job", async () => {
    const { t, b, root, register, enqueue, jobs } = await fixture()
    await enqueue()
    const job = (await jobs())[0]!
    const resolveArgs = { networkId: root, ...binding, reference: job._id }
    expect(await b.as.query(resolve, resolveArgs)).toMatchObject({ uuid, expiresAt: NOW + 45_000 })
    await register()
    expect(await b.as.query(resolve, resolveArgs)).not.toBeNull()
    const claim = await t.mutation(internal.modules.notifications.deliveries.claim, { jobId: job._id })
    const prepared = await t.run(async ctx => await prepareDelivery(ctx, job._id, claim!.leaseToken))
    expect(Object.keys(prepared!.payload).sort()).toEqual(["applicationId", "bindingId", "expiresAt", "kind", "networkId", "phase", "reference", "uuid", "version"])
    expect(prepared?.payload).not.toHaveProperty("caller")
    expect(prepared?.payload).not.toHaveProperty("url")
  })
  it.each(["reactivate", "binding", "session", "token"] as const)("%s invalide le job admis sous l'ancienne incarnation", async change => {
    const { t, b, root, register, sub, enqueue, jobs, input } = await fixture()
    await enqueue(); const job = (await jobs())[0]!
    if (change === "reactivate") {
      await b.as.mutation(api.modules.notifications.pushSubscriptions.unsubscribe, { networkId: root, subscriptionId: sub.subscriptionId })
      await register()
    } else if (change === "binding") await register(otherBinding)
    else if (change === "token") await register(binding, "c".repeat(64))
    else {
      const sessionId = await createTestSession(t, b.subject)
      await register(binding, "a".repeat(64), t.withIdentity({ subject: b.subject, sessionId }))
    }
    expect(await b.as.query(resolve, { networkId: root, ...binding, reference: job._id })).toBeNull()
    await expect(b.as.mutation(join, input)).rejects.toThrow()
    const claim = await t.mutation(internal.modules.notifications.deliveries.claim, { jobId: job._id })
    expect(await t.run(async ctx => await prepareDelivery(ctx, job._id, claim!.leaseToken))).toBeNull()
  })
  it("retour fournisseur tardif ne désactive pas une nouvelle incarnation", async () => {
    const { t, sub, register, enqueue, jobs } = await fixture()
    await enqueue(); const job = (await jobs())[0]!
    const claim = await t.mutation(internal.modules.notifications.deliveries.claim, { jobId: job._id })
    await register(otherBinding)
    await t.mutation(internal.modules.notifications.deliveries.finish, { jobId: job._id, leaseToken: claim!.leaseToken, state: "failed", resultCode: "invalid_subscription" })
    expect((await t.run(async ctx => await ctx.db.get(sub.subscriptionId)))?.active).toBe(true)
  })
  it("signal tardif ou appel terminé : pas de résolution et aucun nouveau gagnant", async () => {
    const { b, root, enqueue, jobs, input } = await fixture()
    await enqueue(); const job = (await jobs())[0]!
    vi.setSystemTime(NOW + 45_001)
    expect(await b.as.query(resolve, { networkId: root, ...binding, reference: job._id })).toBeNull()
    await expect(b.as.mutation(join, input)).rejects.toThrow()
  })
})

describe("présence hors ligne et joignabilité native", () => {
  it("canal réellement vivant réfute l'absence ; ancien helper sans session garde le refus", async () => {
    const { t, root, b } = await fixture()
    await t.run(async ctx => { await ctx.db.insert("personPresence", { networkId: root, personId: b.personId, status: "offline", lastHeartbeat: NOW - 100_000 }) })
    expect(await t.run(async ctx => await isCalleeKnownOffline(ctx, root, b.personId, NOW))).toBe(false)
    expect(await t.run(async ctx => await isCalleeKnownOffline({ db: ctx.db }, root, b.personId, NOW))).toBe(true)
  })
  it.each(["revoked", "configuration", "budget", "push_disabled", "consent"] as const)("%s ne constitue aucune preuve de joignabilité", async change => {
    const { t, root, b } = await fixture()
    await t.run(async ctx => { await ctx.db.insert("personPresence", { networkId: root, personId: b.personId, status: "offline", lastHeartbeat: NOW - 100_000 }) })
    if (change === "revoked") await t.mutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: b.sessionId }] } })
    if (change === "configuration") vi.stubEnv("APNS_KEY_ID", "")
    if (change === "budget") await t.run(async ctx => { await ctx.db.insert("notificationWeeklyUsage", { networkId: root, personId: b.personId, weekStart: notificationWeekStart(NOW), reserved: 35 }) })
    if (change === "push_disabled") await b.as.mutation(api.modules.calls.preferences.update, { pushIncoming: false })
    if (change === "consent") await b.as.mutation(api.modules.people.consents.revokeConsent, { networkId: root, purpose: "notifications" })
    expect(await t.run(async ctx => await isCalleeKnownOffline(ctx, root, b.personId, NOW))).toBe(true)
  })
})
