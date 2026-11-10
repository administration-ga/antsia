import { describe, expect, it } from "vitest"
import type { Id } from "@antsia/api/engine"
import { ownedStoredBindingId, parseStoredCallBinding } from "./binding-model"

const now = 1_800_000_000_000
const owner = { sessionId: "session-current", personId: "p".repeat(32) as Id<"persons">, networkId: "n".repeat(32) as Id<"networks">, expiresAt: now + 600_000 }
const binding = { applicationId: "antsia_ios", deviceId: "10000000-0000-4000-8000-000000000001", bindingId: "20000000-0000-4000-8000-000000000002", sessionId: owner.sessionId, personId: owner.personId, networkId: owner.networkId, expiresAt: now + 100_000 }
describe("session-bound native enrollment index", () => {
  it("restores only the exact still-live owner; it contains no credential or identity label", () => {
    expect(parseStoredCallBinding(JSON.stringify(binding), owner, binding.applicationId, now)).toEqual(binding)
    expect(parseStoredCallBinding(JSON.stringify({ ...binding, bearer: "forbidden" }), owner, binding.applicationId, now)).toBeNull()
  })
  it("refuses another session, person, network or application without new enrollment", () => {
    for (const patch of [{ sessionId: "session-new" }, { personId: "q".repeat(32) }, { networkId: "x".repeat(32) }, { applicationId: "other_app" }]) expect(parseStoredCallBinding(JSON.stringify({ ...binding, ...patch }), owner, binding.applicationId, now)).toBeNull()
  })
  it("expired, oversized and corrupt storage cannot grant a fresh binding", () => {
    for (const raw of [null, "{", "x".repeat(2_049), JSON.stringify({ ...binding, expiresAt: now }), JSON.stringify({ ...binding, expiresAt: owner.expiresAt + 1 }), JSON.stringify({ ...binding, bindingId: "not-a-uuid" })]) expect(parseStoredCallBinding(raw, owner, binding.applicationId, now)).toBeNull()
  })
  it("logout can clear its expired index without acquiring another owner's descriptor", () => {
    expect(ownedStoredBindingId(JSON.stringify({ ...binding, expiresAt: now - 1 }), owner)).toBe(binding.bindingId)
    expect(ownedStoredBindingId(JSON.stringify({ ...binding, sessionId: "other-session" }), owner)).toBeNull()
    expect(ownedStoredBindingId(JSON.stringify({ ...binding, personId: "other-person" }), owner)).toBeNull()
  })
})
