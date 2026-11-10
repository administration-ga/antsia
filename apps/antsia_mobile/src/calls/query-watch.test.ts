import type { Watch } from "convex/react"
import { describe, expect, it, vi } from "vitest"
import { watchNativeQuery } from "./query-watch"

function fixture(initial?: boolean) {
  let result = initial, failed = false, changed: () => void = () => undefined
  const unsubscribe = vi.fn()
  const watch = {
    onUpdate: (listener: () => void) => { changed = listener; return unsubscribe },
    localQueryResult: () => { if (failed) throw new Error("query refused"); return result },
  } satisfies Pick<Watch<boolean>, "onUpdate" | "localQueryResult">
  return { watch, unsubscribe, emit: (value: boolean | undefined) => { result = value; changed() }, refuse: () => { failed = true; changed() } }
}

describe("native query subscription", () => {
  it("delivers cached results after the caller owns the subscription and keeps later updates", async () => {
    const f = fixture(false), value = vi.fn(), failed = vi.fn()
    const stop = watchNativeQuery(f.watch, value, failed)
    expect(value).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(value).toHaveBeenCalledWith(false)
    f.emit(true)
    expect(value).toHaveBeenLastCalledWith(true)
    stop()
    expect(f.unsubscribe).toHaveBeenCalledOnce()
    expect(failed).not.toHaveBeenCalled()
  })

  it("waits for a real value and forwards server refusal", async () => {
    const f = fixture(), value = vi.fn(), failed = vi.fn()
    const stop = watchNativeQuery(f.watch, value, failed)
    await Promise.resolve()
    expect(value).not.toHaveBeenCalled()
    f.refuse()
    expect(failed).toHaveBeenCalledOnce()
    stop()
  })

  it("suppresses cached and late notifications after disposal", async () => {
    const f = fixture(true), value = vi.fn(), failed = vi.fn()
    const stop = watchNativeQuery(f.watch, value, failed)
    stop(); stop()
    await Promise.resolve()
    f.emit(false); f.refuse()
    expect(value).not.toHaveBeenCalled()
    expect(failed).not.toHaveBeenCalled()
    expect(f.unsubscribe).toHaveBeenCalledOnce()
  })
})
