import { afterEach, describe, expect, it, vi } from "vitest"
import { nativeRequest } from "./request"

afterEach(() => { vi.useRealTimers() })
describe("native request budget", () => {
  it("bounds an SDK request that ignores cancellation", async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const request = nativeRequest((provided) => { signal = provided; return new Promise<never>(() => undefined) }, 100)
    const rejected = expect(request).rejects.toThrow("nativeRequestTimeout")
    await vi.advanceTimersByTimeAsync(101)
    await rejected
    expect(signal?.aborted).toBe(true)
  })
  it("preserves a server refusal instead of turning it into a success", async () => {
    await expect(nativeRequest(async () => { throw new Error("denied") })).rejects.toThrow("denied")
  })
})
