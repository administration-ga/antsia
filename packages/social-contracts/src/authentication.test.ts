import { describe, expect, it } from "vitest"

import { localeFromAcceptLanguage, otpLocale, otpMessage } from "./authentication"

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
