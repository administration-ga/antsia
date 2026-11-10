import { describe, expect, it } from "vitest"
import { completeNativeOnboarding, nativeEntryChannel, nativeEntryError, nativeEntryText, nativeOtpCooldownKey, nativeOtpRemaining, nativeOtpSendAccepted, nativePublicNext } from "./native-entry-model"

describe("native entry parity contracts", () => {
  it("uses SMS when email delivery is unavailable without changing an explicit SMS choice", () => {
    expect(nativeEntryChannel("email", { idn: true, emailOtp: false, smsOtp: true })).toBe("phone")
    expect(nativeEntryChannel("phone", { idn: true, emailOtp: true, smsOtp: true })).toBe("phone")
    expect(nativeEntryChannel("email", undefined)).toBe("email")
  })
  it("requires the server admission result rather than any successful HTTP response", () => {
    expect(nativeOtpSendAccepted("email", { data: { success: true } })).toBe(true)
    expect(nativeOtpSendAccepted("phone", { data: { message: "admitted" } })).toBe(true)
    for (const response of [null, {}, { data: {} }, { data: { success: false } }, { data: { success: true }, error: { code: "otpDeliveryUnavailable" } }]) expect(nativeOtpSendAccepted("email", response)).toBe(false)
    expect(nativeOtpSendAccepted("phone", { data: { message: "" } })).toBe(false)
  })
  it("keeps the same cooldown for normalized email and rounds the remaining delay upwards", () => {
    expect(nativeOtpCooldownKey("email", " A@Example.test ")).toBe(nativeOtpCooldownKey("email", "a@example.test"))
    expect(nativeOtpRemaining(30_001, 1)).toBe(30)
    expect(nativeOtpRemaining(1, 2)).toBe(0)
    expect(nativeOtpRemaining(NaN, 0)).toBe(0)
  })
  it("offers the same actionable errors as the Web identity entry", () => {
    expect(nativeEntryError({ code: "OTP_EXPIRED" })).toBe("mobile.entry.identity.errors.expiredCode")
    expect(nativeEntryError({ code: "INVALID_OTP" })).toBe("mobile.entry.identity.errors.invalidCode")
    expect(nativeEntryError({ status: 429 })).toBe("mobile.entry.identity.errors.rateLimited")
    expect(nativeEntryError({ code: "otpDeliveryUnavailable" })).toBe("mobile.entry.identity.errors.deliveryUnavailable")
    expect(nativeEntryError(new Error("private diagnostic"))).toBe("mobile.entry.identity.errors.network")
    expect(nativeEntryError({ message: "private diagnostic" })).toBe("mobile.entry.identity.errors.generic")
  })
  it("continues a filtered empty public page while rejecting loops, end and oversized cursors", () => {
    expect(nativePublicNext([null], { isDone: false, continueCursor: "empty-window-next" })).toBe("empty-window-next")
    expect(nativePublicNext([null, "same"], { isDone: false, continueCursor: "same" })).toBeNull()
    expect(nativePublicNext([null], { isDone: true, continueCursor: "next" })).toBeNull()
    expect(nativePublicNext([null], { isDone: false, continueCursor: "x".repeat(8193) })).toBeNull()
    expect(nativePublicNext(Array.from({ length: 10 }, (_, i) => String(i)), { isDone: false, continueCursor: "next" })).toBeNull()
  })
  it("interpolates only the supplied values in the shared translated messages", () => {
    expect(nativeEntryText(() => "{{brand}} · {{count}} · {{other}}", "key", { brand: "ANTSIA", count: 3 })).toBe("ANTSIA · 3 · {{other}}")
  })
  it("does not create a person or publish anything before explicit consent", async () => {
    const calls: string[] = []
    const run = (name: string) => async () => { calls.push(name) }
    const result = await completeNativeOnboarding({ values: { displayName: "Nom choisi", handle: "nom-choisi", consent: false, locale: "fr", timeZone: "Africa/Libreville" }, needsPerson: true, consentInForce: false, current: () => true, ensurePerson: run("person"), handleAvailable: async () => ({ available: true }), recordConsent: run("consent"), setPreferences: run("preferences"), publishProfile: run("publish"), joinNetwork: run("join") })
    expect(result).toBe("consentRequired")
    expect(calls).toEqual([])
  })
  it("runs the chosen profile sequence and stops after a subject change", async () => {
    const calls: string[] = [], values = { displayName: "Nom choisi", handle: "nom-choisi", consent: true, locale: "fr" as const, timeZone: "Africa/Libreville" }
    let current = true
    const run = (name: string) => async () => { calls.push(name) }
    const input = { values, needsPerson: true, consentInForce: false, current: () => current, ensurePerson: run("person"), handleAvailable: async () => { calls.push("handle"); return { available: true } }, recordConsent: run("consent"), setPreferences: run("preferences"), publishProfile: run("publish"), joinNetwork: run("join") }
    expect(await completeNativeOnboarding(input)).toBe("complete")
    expect(calls).toEqual(["person", "handle", "consent", "preferences", "publish", "join"])
    calls.length = 0
    expect(await completeNativeOnboarding({ ...input, setPreferences: async () => { calls.push("preferences"); current = false } })).toBe("stale")
    expect(calls).toEqual(["person", "handle", "consent", "preferences"])
  })
  it("refuses an unavailable handle before consent, preferences or publication", async () => {
    const calls: string[] = [], run = async () => { calls.push("write") }
    expect(await completeNativeOnboarding({ values: { displayName: "Nom choisi", handle: "nom-choisi", consent: true, locale: "en", timeZone: "UTC" }, needsPerson: false, consentInForce: true, current: () => true, ensurePerson: run, handleAvailable: async () => ({ available: false }), recordConsent: run, setPreferences: run, publishProfile: run, joinNetwork: run })).toBe("handleUnavailable")
    expect(calls).toEqual([])
  })
})
