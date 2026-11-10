import { describe, expect, it } from "vitest"
import { createNativeLifecycle } from "./lifecycle"

describe("native lifecycle", () => {
  it("never readopts callbacks from the previous foreground or person", () => {
    const lifecycle = createNativeLifecycle()
    lifecycle.activate()
    const before = lifecycle.capture()
    expect(before()).toBe(true)
    lifecycle.invalidate()
    lifecycle.activate()
    expect(before()).toBe(false)
    expect(lifecycle.capture()()).toBe(true)
  })
  it("attempts every resource cleanup even when one fails", async () => {
    const lifecycle = createNativeLifecycle()
    const calls: number[] = []
    lifecycle.register(() => { calls.push(1); throw new Error("stop") })
    lifecycle.register(() => { calls.push(2) })
    const results = await lifecycle.stopResources()
    expect(calls).toEqual([1, 2])
    expect(results.map((result) => result.status)).toEqual(["rejected", "fulfilled"])
  })
  it("keeps repeated stops behind the actual pending cleanup", async () => {
    const lifecycle = createNativeLifecycle()
    let finish!: () => void
    lifecycle.register(() => new Promise<void>((resolve) => { finish = resolve }))
    const first = lifecycle.stopResources()
    const second = lifecycle.stopResources()
    expect(second).toBe(first)
    expect(lifecycle.waitForStopped()).toBe(first)
    let completed = false
    void second.then(() => { completed = true })
    await Promise.resolve()
    expect(completed).toBe(false)
    finish()
    expect((await second).map((result) => result.status)).toEqual(["fulfilled"])
  })
})
