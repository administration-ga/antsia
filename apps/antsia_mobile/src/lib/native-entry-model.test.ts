import { describe, expect, it } from "vitest"
import entryEn from "../i18n/entry.en.json"
import entryFr from "../i18n/entry.fr.json"
import { completeNativeOnboarding, nativeEntryChannel, nativeEntryError, nativeEntryRefusal, nativeEntryText, nativeOtpCodeHint, nativeOtpCooldownKey, nativeOtpRemaining, nativeOtpSendAccepted, nativePluralKey, nativePublicNext } from "./native-entry-model"

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

describe("EA-08 — durée du code publiée et délai d'un refus de débit", () => {
  const configuration = { idn: true, emailOtp: true, smsOtp: true }
  const rateLimited = (retryAfterMs?: number) => ({ code: "rateLimited", message: "rateLimited", ...(retryAfterMs === undefined ? {} : { retryAfterMs }), status: 429, statusText: "Too Many Requests" })
  /** Le traducteur natif (`appearance.tsx`) : un dictionnaire plat et l'interpolation de `{{…}}`. */
  const say = (messages: Record<string, string>, locale: "fr" | "en", message: { key: string; count?: number }) => {
    const key = message.count === undefined ? message.key : nativePluralKey(message.key, message.count, locale)
    return nativeEntryText((k) => messages[k] ?? k, key, message.count === undefined ? {} : { count: message.count })
  }

  it("l'indice du code dit la durée publiée, en minutes, au pluriel juste, dans les deux langues", () => {
    expect(nativeOtpCodeHint({ ...configuration, otpTtlSeconds: 600 })).toEqual({ key: "mobile.entry.identity.codeHint", count: 10 })
    expect(say(entryFr, "fr", nativeOtpCodeHint({ ...configuration, otpTtlSeconds: 600 }))).toBe("Le code est valable 10 minutes et ne peut être utilisé qu’une fois.")
    expect(say(entryFr, "fr", nativeOtpCodeHint({ ...configuration, otpTtlSeconds: 60 }))).toBe("Le code est valable 1 minute et ne peut être utilisé qu’une fois.")
    expect(say(entryEn, "en", nativeOtpCodeHint({ ...configuration, otpTtlSeconds: 120 }))).toBe("The code is valid for 2 minutes and can only be used once.")
  })

  it("un moteur qui ne publie pas la durée garde les cinq minutes d'aujourd'hui", () => {
    for (const value of [configuration, undefined, null]) expect(nativeOtpCodeHint(value)).toEqual({ key: "mobile.entry.identity.codeHint", count: 5 })
    expect(say(entryFr, "fr", nativeOtpCodeHint(configuration))).toBe("Le code est valable 5 minutes et ne peut être utilisé qu’une fois.")
  })

  it("un refus de débit qui porte son délai dit quand réessayer ; sans délai, la phrase d'avant", () => {
    expect(nativeEntryRefusal(rateLimited(100_000))).toEqual({ key: "mobile.entry.identity.errors.rateLimitedMinutes", count: 2 })
    expect(say(entryFr, "fr", nativeEntryRefusal(rateLimited(100_000)))).toBe("Trop de tentatives. Réessayez dans 2 minutes.")
    expect(say(entryFr, "fr", nativeEntryRefusal(rateLimited(8_200)))).toBe("Trop de tentatives. Réessayez dans 9 secondes.")
    expect(say(entryEn, "en", nativeEntryRefusal(rateLimited(1_000)))).toBe("Too many attempts. Try again in 1 second.")
    expect(say(entryEn, "en", nativeEntryRefusal(rateLimited(60_000)))).toBe("Too many attempts. Try again in 1 minute.")
    expect(nativeEntryRefusal(rateLimited())).toEqual({ key: "mobile.entry.identity.errors.rateLimited" })
    expect(nativeEntryRefusal({ code: "TOO_MANY_ATTEMPTS", retryAfterMs: 60_000 })).toEqual({ key: "mobile.entry.identity.errors.rateLimited" })
    expect(nativeEntryRefusal({ code: "INVALID_OTP", retryAfterMs: 60_000 })).toEqual({ key: "mobile.entry.identity.errors.invalidCode" })
    expect(nativeEntryRefusal(new Error("rateLimited"))).toEqual({ key: "mobile.entry.identity.errors.network" })
  })

  it("le pluriel suit la langue : 0 et 1 au singulier en français, 1 seulement en anglais", () => {
    expect([0, 1, 2].map((count) => nativePluralKey("k", count, "fr"))).toEqual(["k_one", "k_one", "k_other"])
    expect([0, 1, 2].map((count) => nativePluralKey("k", count, "en"))).toEqual(["k_other", "k_one", "k_other"])
  })

  it("chaque message à compte a ses deux formes dans les deux langues", () => {
    for (const base of ["mobile.entry.identity.codeHint", "mobile.entry.identity.errors.rateLimitedSeconds", "mobile.entry.identity.errors.rateLimitedMinutes"]) {
      for (const messages of [entryFr, entryEn] as Record<string, string>[]) {
        expect(messages[`${base}_one`], base).toContain("{{count}}")
        expect(messages[`${base}_other`], base).toContain("{{count}}")
        expect(messages[base], base).toBeUndefined()
      }
    }
  })
})
