import { describe, expect, it } from "vitest"
import { createNativeSignOutGate } from "./sign-out"

describe("native sign out", () => {
  it("blocks immediately, coalesces and distinguishes server from local success", async () => {
    const calls: string[] = []
    const exit = createNativeSignOutGate()
    const options = {
      client: { revokeSessions: async () => ({ data: { status: false } }), signOut: async () => ({ data: { success: true } }) },
      block: () => { calls.push("block") },
      stopResources: async () => { calls.push("resources") },
      clearCredentials: async () => { calls.push("clear") },
      reset: () => { calls.push("reset") },
    }
    const first = exit(options)
    expect(calls[0]).toBe("block")
    expect(exit(options)).toBe(first)
    const result = await first
    expect(result.serverRevoked).toBe(false)
    expect(result.localCleared).toBe(true)
    expect(result.issues).toContain("revocation")
    expect(calls).toEqual(["block", "resources", "clear", "reset"])
  })
  it("does not announce a purge if secure storage fails", async () => {
    const result = await createNativeSignOutGate()({
      client: { revokeSessions: async () => ({ data: { status: true } }), signOut: async () => ({ data: { success: true } }) },
      block() {}, stopResources: async () => undefined,
      clearCredentials: async () => { throw new Error("locked") }, reset() {},
    })
    expect(result.serverRevoked).toBe(true)
    expect(result.localCleared).toBe(false)
    expect(result.issues).toContain("credentials")
  })

  it.each([undefined, "all", "CURRENT", null])("retains global revocation for scope %s", async (scope) => {
    const calls: string[] = []
    const result = await createNativeSignOutGate()({
      scope: scope as "all" | "current" | undefined,
      client: {
        revokeSessions: async () => { calls.push("revoke"); return { data: { status: true } } },
        signOut: async () => { calls.push("signOut"); return { data: { success: true } } },
      },
      block: () => { calls.push("block") },
      stopResources: async () => { calls.push("resources") },
      clearCredentials: async () => { calls.push("clear") },
      reset: () => { calls.push("reset") },
    })
    expect(calls).toEqual(["block", "resources", "revoke", "signOut", "clear", "reset"])
    expect(result).toEqual({ serverRevoked: true, localCleared: true, issues: [] })
  })

  it("signs out only the current session and preserves other sessions", async () => {
    const sessions = new Set(["current", "other"])
    let globalRevocations = 0
    const result = await createNativeSignOutGate()({
      scope: "current",
      client: {
        revokeSessions: async () => { globalRevocations++; sessions.clear(); return { data: { status: true } } },
        signOut: async () => { sessions.delete("current"); return { data: { success: true } } },
      },
      block() {}, stopResources: async () => undefined,
      clearCredentials: async () => undefined, reset() {},
    })
    expect(globalRevocations).toBe(0)
    expect([...sessions]).toEqual(["other"])
    expect(result).toEqual({ serverRevoked: true, localCleared: true, issues: [] })
  })

  it.each(["refused", "error", "throws"])("reports current-session sign out %s while still clearing local state", async (failure) => {
    const calls: string[] = []
    const result = await createNativeSignOutGate()({
      scope: "current",
      client: {
        revokeSessions: async () => { calls.push("revoke"); return { data: { status: true } } },
        signOut: async () => {
          calls.push("signOut")
          if (failure === "throws") throw new Error("unavailable")
          return failure === "error" ? { data: { success: true }, error: { status: 503 } } : { data: { success: false } }
        },
      },
      block: () => { calls.push("block") },
      stopResources: async () => { calls.push("resources") },
      clearCredentials: async () => { calls.push("clear") },
      reset: () => { calls.push("reset") },
    })
    expect(calls).toEqual(["block", "resources", "signOut", "clear", "reset"])
    expect(result).toEqual({ serverRevoked: false, localCleared: true, issues: ["signOut"] })
  })

  it("waits for resources and coalesces current-session exits before purging", async () => {
    const calls: string[] = []
    let releaseResources!: () => void
    const stopped = new Promise<void>((resolve) => { releaseResources = resolve })
    const exit = createNativeSignOutGate()
    const options = {
      scope: "current" as const,
      client: {
        revokeSessions: async () => { calls.push("revoke"); return { data: { status: true } } },
        signOut: async () => { calls.push("signOut"); return { data: { success: true } } },
      },
      block: () => { calls.push("block") },
      stopResources: async () => { calls.push("resources"); await stopped; calls.push("stopped") },
      clearCredentials: async () => { calls.push("clear") },
      reset: () => { calls.push("reset") },
    }
    const first = exit(options)
    expect(calls).toEqual(["block", "resources"])
    expect(exit({ ...options, scope: "all" })).toBe(first)
    releaseResources()
    expect(await first).toEqual({ serverRevoked: true, localCleared: true, issues: [] })
    expect(calls).toEqual(["block", "resources", "stopped", "signOut", "clear", "reset"])
  })

  it("keeps current-session cleanup fail-closed when secure storage cannot be cleared", async () => {
    const calls: string[] = []
    const result = await createNativeSignOutGate()({
      scope: "current",
      client: {
        revokeSessions: async () => { calls.push("revoke"); return { data: { status: true } } },
        signOut: async () => { calls.push("signOut"); return { data: { success: true } } },
      },
      block() {}, stopResources: async () => undefined,
      clearCredentials: async () => { calls.push("clear"); throw new Error("locked") },
      reset: () => { calls.push("reset") },
    })
    expect(calls).toEqual(["signOut", "clear", "reset"])
    expect(result).toEqual({ serverRevoked: true, localCleared: false, issues: ["credentials"] })
  })
})
