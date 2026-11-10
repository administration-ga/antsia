import { describe, expect, it } from "vitest"
import { directlyOwned, exportableRecord } from "./dataInventory"

const correlation = { ownerSessionId: "session", ownerDeviceId: "device", ownerApplicationId: "application", ownerBindingId: "binding", ownerKind: "native", nativeBindingId: "binding", sessionGeneration: "private-generation", nativeExpiresAt: 123, systemCallUuid: "system-uuid" }
const metadata = { _id: "row", _creationTime: 1, networkId: "network" }
describe("P17c native call data boundaries", () => {
  it("exports personal history without exposing native/session correlation", () => {
    const rows = [
      ["callParticipants", { ...metadata, personId: "me", callId: "call", role: "participant", joinedAt: 1, ...correlation }],
      ["pushSubscriptions", { ...metadata, personId: "me", ...correlation }],
      ["notificationDeliveryJobs", { ...metadata, recipientPersonId: "me", ...correlation }],
    ] as const
    for (const [table, row] of rows) {
      const exported = exportableRecord(table, row, "me")
      expect(exported).not.toBe(null)
      for (const key of Object.keys(correlation)) expect(exported).not.toHaveProperty(key)
    }
  })
  it("keeps native fields inside the already owned rows covered by erasure", () => {
    expect(directlyOwned("callParticipants", { ...metadata, personId: "me", callId: "call", ...correlation }, "me")).toBe(true)
    expect(directlyOwned("pushSubscriptions", { ...metadata, personId: "me", ...correlation }, "me")).toBe(true)
    expect(directlyOwned("notificationDeliveryJobs", { ...metadata, recipientPersonId: "me", ...correlation }, "me")).toBe(true)
    expect(exportableRecord("callParticipants", { ...metadata, personId: "other", ...correlation }, "me")).toBe(null)
  })
})
