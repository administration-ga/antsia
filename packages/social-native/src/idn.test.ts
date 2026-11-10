import { describe, expect, it, vi } from "vitest"
import { createNativeIdnAttempt, nativeIdnReturn, type NativeIdnAttempt } from "./idn"

const now = 1_000_000
const state = "s".repeat(43), verifier = "v".repeat(43), challenge = "h".repeat(43), code = "c".repeat(43)
const attempt: NativeIdnAttempt = { state, verifier, challenge, redirectUri: "antsia-owned://auth/idn", expiresAt: now + 600_000 }
const callback = `${attempt.redirectUri}?code=${code}&state=${state}`
function dependencies() {
  return { scheme: "antsia-owned", randomToken: vi.fn().mockResolvedValueOnce(state).mockResolvedValueOnce(verifier), sha256: vi.fn().mockResolvedValue(challenge), now }
}

describe("native IDN attempt", () => {
  it("creates an independent state and PKCE verifier with a ten-minute deadline", async () => {
    const input = dependencies()
    expect(await createNativeIdnAttempt(input)).toEqual(attempt)
    expect(input.randomToken).toHaveBeenCalledTimes(2)
    expect(input.sha256).toHaveBeenCalledExactlyOnceWith(verifier)
  })

  it.each(["ab", "http", "https", "exp", "exps", "file", "javascript", "data", "Owned", "owned:", "a".repeat(65)])("refuses an invalid or generic scheme %s before generating credentials", async scheme => {
    const input = { ...dependencies(), scheme }
    await expect(createNativeIdnAttempt(input)).rejects.toThrow()
    expect(input.randomToken).not.toHaveBeenCalled()
  })

  it.each(["short", "v".repeat(42), "v".repeat(44), "!".repeat(43), state])("refuses a malformed or reused verifier", async invalidVerifier => {
    const input = { ...dependencies(), randomToken: vi.fn().mockResolvedValueOnce(state).mockResolvedValueOnce(invalidVerifier) }
    await expect(createNativeIdnAttempt(input)).rejects.toThrow()
    expect(input.sha256).not.toHaveBeenCalled()
  })

  it("rejects malformed random state and digest outputs", async () => {
    await expect(createNativeIdnAttempt({ ...dependencies(), randomToken: async () => "short" })).rejects.toThrow()
    await expect(createNativeIdnAttempt({ ...dependencies(), sha256: async () => "short" })).rejects.toThrow()
  })

  it.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER])("rejects invalid or overflowing clocks", async clock => {
    await expect(createNativeIdnAttempt({ ...dependencies(), now: clock })).rejects.toThrow()
  })
})

describe("native IDN return", () => {
  it("accepts only the pending attempt and returns its exchange code", () => {
    expect(nativeIdnReturn(callback, attempt, now)).toEqual({ code })
    expect(nativeIdnReturn(`${attempt.redirectUri}?state=${state}&code=${code}`, attempt, now)).toEqual({ code })
    expect(nativeIdnReturn(callback, null, now)).toBe(null)
    expect(nativeIdnReturn(callback, undefined, now)).toBe(null)
  })

  it.each([
    callback.replace("antsia-owned:", "another-owned:"),
    callback.replace("//auth/", "//another/"),
    callback.replace("/idn?", "/other?"),
    callback.replace("/idn?", "/prior/../idn?"),
    callback.replace("//auth", "//user@auth"),
    callback.replace("//auth", "//auth:123"),
    callback.replace(state, "x".repeat(43)),
    callback.replace(code, "short"),
    `${callback}&code=${code}`,
    `${callback}&state=${state}`,
    `${callback}&bearer=secret`,
    `${callback}&ott=secret`,
    `${callback}&extra=`,
    `${callback}#fragment`,
    `${callback}#`,
    `${attempt.redirectUri}?code=${code}`,
    `${attempt.redirectUri}?state=${state}`,
    "invalid",
    "x".repeat(1025),
  ])("refuses unsolicited authority or a malformed callback", raw => {
    expect(nativeIdnReturn(raw, attempt, now)).toBe(null)
  })

  it("expires at the deadline and rejects malformed attempt metadata", () => {
    expect(nativeIdnReturn(callback, attempt, attempt.expiresAt)).toBe(null)
    expect(nativeIdnReturn(callback, attempt, attempt.expiresAt + 1)).toBe(null)
    expect(nativeIdnReturn(callback, attempt, NaN)).toBe(null)
    expect(nativeIdnReturn(callback, { ...attempt, expiresAt: Infinity }, now)).toBe(null)
    expect(nativeIdnReturn(callback, { ...attempt, verifier: "short" }, now)).toBe(null)
    expect(nativeIdnReturn(callback, { ...attempt, redirectUri: "https://auth/idn" }, now)).toBe(null)
  })
})
