import { afterEach, describe, expect, it, vi } from "vitest"
import { createNativeEnvironmentPauseGate } from "./environment-pause"

function deferredStop() {
  let resolve!: () => void
  const promise = new Promise<void>(complete => { resolve = complete })
  return { promise, resolve }
}

afterEach(() => { vi.useRealTimers() })

describe("native environment pause", () => {
  it("blocks synchronously and cannot admit a switch before resources have stopped", async () => {
    const pause = createNativeEnvironmentPauseGate()
    const stop = deferredStop()
    const calls: string[] = []
    const options = {
      block: () => { calls.push("block") },
      stopResources: () => { calls.push("stop"); return stop.promise },
    }
    const first = pause(options)
    expect(calls).toEqual(["block", "stop"])
    expect(pause(options)).toBe(first)
    let ready: boolean | undefined
    void first.then(result => { ready = result })
    await Promise.resolve()
    expect(ready).toBeUndefined()
    stop.resolve()
    await expect(first).resolves.toBe(true)
    expect(ready).toBe(true)
    expect(pause(options)).toBe(first)
    expect(calls).toEqual(["block", "stop"])
  })

  it("coalesces even a reentrant pause from the synchronous block", async () => {
    const pause = createNativeEnvironmentPauseGate()
    const stopResources = vi.fn(async () => undefined)
    const duplicate = { block: vi.fn(), stopResources: vi.fn(async () => undefined) }
    let reentrant: Promise<boolean> | undefined
    const first = pause({ block: () => { reentrant = pause(duplicate) }, stopResources })
    expect(reentrant).toBe(first)
    await expect(first).resolves.toBe(true)
    expect(stopResources).toHaveBeenCalledOnce()
    expect(duplicate.block).not.toHaveBeenCalled()
    expect(duplicate.stopResources).not.toHaveBeenCalled()
  })

  it("keeps a stop failure terminal instead of retrying with another environment", async () => {
    const pause = createNativeEnvironmentPauseGate()
    const block = vi.fn()
    const stopResources = vi.fn(async () => { throw new Error("resourceStopFailed") })
    const first = pause({ block, stopResources })
    await expect(first).resolves.toBe(false)
    const retry = { block: vi.fn(), stopResources: vi.fn(async () => undefined) }
    expect(pause(retry)).toBe(first)
    await expect(pause(retry)).resolves.toBe(false)
    expect(block).toHaveBeenCalledOnce()
    expect(stopResources).toHaveBeenCalledOnce()
    expect(retry.block).not.toHaveBeenCalled()
    expect(retry.stopResources).not.toHaveBeenCalled()
  })

  it("stays closed after the shared ten-second deadline, including a late successful stop", async () => {
    vi.useFakeTimers()
    const pause = createNativeEnvironmentPauseGate()
    const stop = deferredStop()
    const options = { block: vi.fn(), stopResources: vi.fn(() => stop.promise) }
    const first = pause(options)
    let ready: boolean | undefined
    void first.then(result => { ready = result })
    await vi.advanceTimersByTimeAsync(9_999)
    expect(ready).toBeUndefined()
    expect(pause(options)).toBe(first)
    await vi.advanceTimersByTimeAsync(1)
    await expect(first).resolves.toBe(false)
    stop.resolve()
    await vi.advanceTimersByTimeAsync(1)
    expect(ready).toBe(false)
    expect(pause(options)).toBe(first)
    await expect(pause(options)).resolves.toBe(false)
    expect(options.block).toHaveBeenCalledOnce()
    expect(options.stopResources).toHaveBeenCalledOnce()
  })

  it("keeps a synchronous block failure closed without starting resource work", async () => {
    const pause = createNativeEnvironmentPauseGate()
    const block = vi.fn(() => { throw new Error("blockFailed") })
    const stopResources = vi.fn(async () => undefined)
    const first = pause({ block, stopResources })
    await expect(first).resolves.toBe(false)
    expect(pause({ block, stopResources })).toBe(first)
    expect(block).toHaveBeenCalledOnce()
    expect(stopResources).not.toHaveBeenCalled()
  })
})
