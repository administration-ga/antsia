import { describe, expect, it, vi } from "vitest"
import { nativePostIntent } from "./post-intent"

describe("native post retry", () => {
  it("retries an uncertain publication with the same key and content", () => {
    const createKey = vi.fn(() => "post-attempt-1")
    const first = nativePostIntent(null, "person/session/network", "  Bonjour  ", createKey)
    expect(first?.body).toBe("Bonjour")
    expect(nativePostIntent(first, "person/session/network", "Bonjour", createKey)).toBe(first)
    expect(createKey).toHaveBeenCalledTimes(1)
  })
  it("refuses another subject, session, network or changed content for the same attempt", () => {
    const first = nativePostIntent(null, "person/session/network", "Bonjour", () => "post-attempt-1")
    expect(nativePostIntent(first, "another-owner", "Bonjour", () => "other-key")).toBe(null)
    expect(nativePostIntent(first, "person/session/network", "Different post", () => "other-key")).toBe(null)
  })
  it("uses the shared server domain rules for blank and oversized text", () => {
    expect(() => nativePostIntent(null, "owner", " \n ", () => "key")).toThrow()
    expect(() => nativePostIntent(null, "owner", "a".repeat(2001), () => "key")).toThrow()
  })
})
