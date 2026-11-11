import { describe, expect, it } from "vitest"

import { authRetryAfterMs, authRetryDelay, localeFromAcceptLanguage, otpLocale, otpMessage, otpTtlMinutes, UNPUBLISHED_OTP_TTL_SECONDS } from "./authentication"

describe("langue du code de connexion", () => {
  it("Accept-Language : la première langue prise en charge, dans l'ordre des préférences", () => {
    expect(localeFromAcceptLanguage("en")).toBe("en")
    expect(localeFromAcceptLanguage("en-GB,fr;q=0.8")).toBe("en")
    expect(localeFromAcceptLanguage("fr-CA,en;q=0.9")).toBe("fr")
    expect(localeFromAcceptLanguage("de-DE,en;q=0.7,fr;q=0.8")).toBe("fr")
    expect(localeFromAcceptLanguage("EN-us")).toBe("en")
  })

  it("Accept-Language : un poids nul ou illisible écarte la langue ; rien de pris en charge rend null", () => {
    expect(localeFromAcceptLanguage("en;q=0,fr;q=0.1")).toBe("fr")
    expect(localeFromAcceptLanguage("en;q=abc,fr")).toBe("fr")
    expect(localeFromAcceptLanguage("de,es;q=0.8,*;q=0.1")).toBeNull()
    expect(localeFromAcceptLanguage("")).toBeNull()
    expect(localeFromAcceptLanguage(null)).toBeNull()
    expect(localeFromAcceptLanguage(undefined)).toBeNull()
  })

  it("Accept-Language : un en-tête démesuré n'est lu que sur sa tête", () => {
    expect(localeFromAcceptLanguage(`${"de;q=0.9,".repeat(200)}en`)).toBeNull()
    expect(localeFromAcceptLanguage(`en,${"x".repeat(10_000)}`)).toBe("en")
  })

  it("ordre : la langue demandée, puis celle du déploiement, puis le français", () => {
    expect(otpLocale("en", "fr")).toBe("en")
    expect(otpLocale("fr", "en")).toBe("fr")
    expect(otpLocale("de", "en")).toBe("en")
    expect(otpLocale(null, " EN ")).toBe("en")
    expect(otpLocale(null, "es")).toBe("fr")
    expect(otpLocale(undefined, undefined)).toBe("fr")
  })
})

describe("texte du code de connexion", () => {
  it("en anglais à la marque DIASPORALE, en français à la marque ANTSIA", () => {
    expect(otpMessage("en", "DIASPORALE", "123456")).toEqual({
      subject: "Your DIASPORALE sign-in code",
      text: "Your DIASPORALE code: 123456. It expires in five minutes.",
    })
    expect(otpMessage("fr", "ANTSIA", "654321")).toEqual({
      subject: "Votre code de connexion ANTSIA",
      text: "Votre code ANTSIA : 654321. Il expire dans cinq minutes.",
    })
  })

  it("ni lien ni coordonnée : la marque, le code et sa durée seulement", () => {
    for (const locale of ["fr", "en"] as const) {
      const { subject, text } = otpMessage(locale, "DIASPORALE", "123456")
      expect(`${subject} ${text}`).not.toMatch(/https?:|www\.|@|\+\d/)
      expect(text.replace("123456", "").match(/\d/g)).toBeNull()
    }
  })
})

describe("EA-08 : durée du code et délai d'un refus de débit, à l'écran", () => {
  it("la durée publiée se dit en minutes entières, jamais arrondie au-dessus", () => {
    expect(otpTtlMinutes(300)).toBe(5)
    expect(otpTtlMinutes(600)).toBe(10)
    expect(otpTtlMinutes(60)).toBe(1)
    expect(otpTtlMinutes(150)).toBe(2)
    expect(otpTtlMinutes(30)).toBe(1)
  })

  it("un moteur qui ne publie pas la durée garde les cinq minutes d'avant ; une valeur illisible aussi", () => {
    expect(UNPUBLISHED_OTP_TTL_SECONDS).toBe(300)
    for (const value of [undefined, 0, -60, Number.NaN, Number.POSITIVE_INFINITY]) expect(otpTtlMinutes(value)).toBe(5)
  })

  it("le délai restant se lit dans le seul refus de débit du moteur", () => {
    expect(authRetryAfterMs({ code: "rateLimited", message: "rateLimited", retryAfterMs: 100_000, status: 429, statusText: "Too Many Requests" })).toBe(100_000)
    expect(authRetryAfterMs({ message: "rateLimited", retryAfterMs: 2_500 })).toBe(2_500)
    for (const error of [{ code: "rateLimited" }, { code: "rateLimited", retryAfterMs: 0 }, { code: "rateLimited", retryAfterMs: -1 }, { code: "rateLimited", retryAfterMs: "60000" }, { code: "rateLimited", retryAfterMs: Number.NaN }, { code: "TOO_MANY_ATTEMPTS", retryAfterMs: 60_000 }, { status: 429, retryAfterMs: 60_000 }, null, "rateLimited", new Error("rateLimited")]) {
      expect(authRetryAfterMs(error)).toBeNull()
    }
  })

  it("le délai se dit en secondes sous la minute, en minutes au-delà, arrondi au-dessus", () => {
    expect(authRetryDelay(1)).toEqual({ unit: "seconds", count: 1 })
    expect(authRetryDelay(8_200)).toEqual({ unit: "seconds", count: 9 })
    expect(authRetryDelay(59_000)).toEqual({ unit: "seconds", count: 59 })
    expect(authRetryDelay(59_001)).toEqual({ unit: "minutes", count: 1 })
    expect(authRetryDelay(60_000)).toEqual({ unit: "minutes", count: 1 })
    expect(authRetryDelay(100_000)).toEqual({ unit: "minutes", count: 2 })
    expect(authRetryDelay(180_000)).toEqual({ unit: "minutes", count: 3 })
  })
})
