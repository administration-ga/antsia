import { describe, expect, it } from "vitest"
import { isNativeCallPushPayload, NATIVE_CALL_RING_MAX_MS } from "./native-calls"

const now = 1_000_000
const ring = { version: 1, kind: "antsia.call", phase: "ring", networkId: "aaaaaaaaaaaaaaaa", reference: "bbbbbbbbbbbbbbbb", applicationId: "antsia_native", bindingId: "1cd0928f-e59e-4f3a-8a92-057c1f77ad4d", uuid: "bcaf3bde-21e1-482a-bc4a-b8f620e8ee2c", expiresAt: now + NATIVE_CALL_RING_MAX_MS }
describe("neutral native call envelope", () => {
  it("admits only a bounded ring reference, never an update or identity", () => {
    expect(isNativeCallPushPayload(ring, now)).toBe(true)
    for (const extra of [{ callerName: "private" }, { token: "bearer" }, { url: "https://example.test" }, { phase: "end" }]) expect(isNativeCallPushPayload({ ...ring, ...extra }, now)).toBe(false)
  })
  it("rejects expired, long-lived and malformed deliveries", () => {
    expect(isNativeCallPushPayload(ring, ring.expiresAt)).toBe(false)
    expect(isNativeCallPushPayload({ ...ring, expiresAt: now + 120_000 }, now)).toBe(false)
    expect(isNativeCallPushPayload({ ...ring, uuid: "caller-phone-number" }, now)).toBe(false)
    expect(isNativeCallPushPayload({ ...ring, bindingId: "previous-session" }, now)).toBe(false)
  })
})
