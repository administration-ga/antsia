import { describe, expect, it } from "vitest"
import { callMediaEstablished, callReconnectDelay, createCallFence, createCallResourceLease, incomingPayloadForBinding, mayPublishCallMedia } from "./call-state"

const now = 1_800_000_000_000
const binding = { applicationId: "antsia_ios", networkId: "a".repeat(32), bindingId: "10000000-0000-4000-8000-000000000001", expiresAt: now + 60_000 }
const payload = { version: 1, kind: "antsia.call", phase: "ring", networkId: binding.networkId, reference: "b".repeat(32), applicationId: binding.applicationId, bindingId: binding.bindingId, uuid: "20000000-0000-4000-8000-000000000002", expiresAt: now + 40_000 }

describe("native call operation authority", () => {
  it("rejects a late permission or token after hangup, including when the same call opens again", async () => {
    const fence = createCallFence(); fence.begin("network:person:session")
    const old = fence.capture()
    const token = Promise.resolve("late-token")
    fence.stop(); fence.begin("network:person:session")
    await token
    expect(old()).toBe(false)
    expect(fence.capture()()).toBe(true)
  })
  it("never transfers an old callback to another person/session", () => {
    const fence = createCallFence(); fence.begin("a:p:s1"); const old = fence.capture()
    fence.begin("a:p:s2")
    expect(old()).toBe(false)
  })
  it("does not equate server answer with actual establishment", () => {
    expect(callMediaEstablished(false, 1)).toBe(false)
    expect(callMediaEstablished(true, 0)).toBe(false)
    expect(callMediaEstablished(true, 1)).toBe(true)
  })
})
describe("native permissions and audio activation", () => {
  const input = { current: true, connected: true, activated: true, held: false, microphone: true, camera: false, video: false }
  it("an audio call publishes the microphone without camera permission", () => {
    expect(mayPublishCallMedia(input)).toEqual({ audio: true, video: false })
  })
  it("permission/token/connection never replace OS audio activation", () => {
    expect(mayPublishCallMedia({ ...input, activated: false, camera: true, video: true })).toEqual({ audio: false, video: false })
  })
  it("hold, deactivation and stale authority disable both publications", () => {
    for (const patch of [{ held: true }, { activated: false }, { current: false }, { connected: false }]) expect(mayPublishCallMedia({ ...input, camera: true, video: true, ...patch })).toEqual({ audio: false, video: false })
  })
})
describe("bounded native reconnect", () => {
  it("admits at most three attempts within the twenty second budget", () => {
    expect([0, 1, 2, 3].map(retryCount => callReconnectDelay({ retryCount, elapsedMs: 0 }, true))).toEqual([500, 1_500, 3_000, null])
    expect(callReconnectDelay({ retryCount: 0, elapsedMs: 19_700 }, true)).toBeNull()
  })
  it("does not reconnect expired authority or malformed counters", () => {
    expect(callReconnectDelay({ retryCount: 0, elapsedMs: 0 }, false)).toBeNull()
    expect(callReconnectDelay({ retryCount: -1, elapsedMs: 0 }, true)).toBeNull()
    expect(callReconnectDelay({ retryCount: 0, elapsedMs: Number.NaN }, true)).toBeNull()
  })
})
describe("opaque incoming system payload", () => {
  it("admits only the current binding and live ring window", () => {
    expect(incomingPayloadForBinding(payload, binding, now)).toEqual(payload)
    for (const patch of [{ networkId: "c".repeat(32) }, { applicationId: "other_app" }, { bindingId: "30000000-0000-4000-8000-000000000003" }, { expiresAt: now }, { expiresAt: now + 99_000 }, { token: "forbidden" }]) expect(incomingPayloadForBinding({ ...payload, ...patch }, binding, now)).toBeNull()
    expect(incomingPayloadForBinding(payload, { ...binding, expiresAt: now }, now)).toBeNull()
  })
})
describe("physical audio ownership across controllers", () => {
  it("waits for old AudioSession/track cleanup even after its UI has closed", async () => {
    const lease = createCallResourceLease()
    let release!: () => void
    const stopping = new Promise<void>(resolve => { release = resolve })
    const first = await lease.acquire(() => true)
    first.install(() => stopping)
    let acquired = false
    const second = lease.acquire(() => true).then(value => { acquired = true; return value })
    await Promise.resolve()
    expect(acquired).toBe(false)
    expect(first.current()).toBe(false)
    release()
    expect((await second).current()).toBe(true)
  })
  it("rejects a request replaced while old cleanup was pending", async () => {
    const lease = createCallResourceLease()
    let release!: () => void
    const stop = new Promise<void>(resolve => { release = resolve })
    const first = await lease.acquire(() => true); first.install(() => stop)
    const replaced = lease.acquire(() => true)
    const assertion = expect(replaced).rejects.toThrow("nativeCallRoomSuperseded")
    const current = lease.acquire(() => true)
    release()
    await assertion
    expect((await current).current()).toBe(true)
  })
  it("a failed physical stop never grants a successor access", async () => {
    const lease = createCallResourceLease()
    const first = await lease.acquire(() => true)
    first.install(async () => { throw new Error("hardwareCleanupFailed") })
    await expect(lease.acquire(() => true)).rejects.toThrow("hardwareCleanupFailed")
  })
})
