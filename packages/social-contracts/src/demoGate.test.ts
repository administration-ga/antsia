/** CH-817 — règles pures de la porte des comptes de démonstration : formats, normalisations, tirage sans biais. */
import { describe, expect, it } from "vitest"

import {
  DEMO_GATE_CHALLENGE_ID_PATTERN,
  DEMO_GATE_CODE_LETTERS,
  DEMO_GATE_CODE_PATTERN,
  DEMO_GATE_CODE_SPACE,
  DEMO_GATE_PATHS,
  DEMO_GATE_SCOPES,
  DEMO_GATE_STATES,
  DEMO_GATE_TOKEN_HEADER,
  DEMO_GATE_TOKEN_PATTERN,
  formatDemoGateCode,
  generateDemoGateCode,
  isDemoGateLocale,
  isDemoGateScope,
  normalizeDemoGateCode,
  normalizeDemoGatePhone,
  type RandomBytes,
  uniformRandomInt,
} from "./demoGate"

/** Une source d'octets qui rend, dans l'ordre, les entiers 32 bits donnés (gros-boutiste). */
function sequence(...values: number[]): RandomBytes & { draws: () => number } {
  let index = 0
  const source = ((length: number) => {
    const value = values[index++]
    if (value === undefined) throw new Error("séquence épuisée")
    const bytes = new Uint8Array(length)
    bytes[0] = (value >>> 24) & 0xff
    bytes[1] = (value >>> 16) & 0xff
    bytes[2] = (value >>> 8) & 0xff
    bytes[3] = value & 0xff
    return bytes
  }) as RandomBytes & { draws: () => number }
  source.draws = () => index
  return source
}

describe("vocabulaire de la porte", () => {
  it("une portée, quatre états, deux routes", () => {
    expect(DEMO_GATE_SCOPES).toEqual(["diaspora-ga"])
    expect(DEMO_GATE_STATES).toEqual(["closed", "open", "unavailable", "gated"])
    expect(DEMO_GATE_PATHS).toEqual({ request: "/demo-gate/request", verify: "/demo-gate/verify" })
    expect(isDemoGateScope("diaspora-ga")).toBe(true)
    for (const value of ["antsia", "", "DIASPORA-GA", 1, null, undefined]) expect(isDemoGateScope(value)).toBe(false)
    expect(isDemoGateLocale("fr")).toBe(true)
    expect(isDemoGateLocale("en")).toBe(true)
    expect(isDemoGateLocale("de")).toBe(false)
  })
})

describe("code de la porte — 6 chiffres puis 1 lettre sans I ni O", () => {
  it("l'alphabet compte 24 lettres, sans I ni O ; 24 millions de codes", () => {
    expect(DEMO_GATE_CODE_LETTERS).toHaveLength(24)
    expect(DEMO_GATE_CODE_LETTERS).not.toMatch(/[IO]/)
    expect(new Set(DEMO_GATE_CODE_LETTERS).size).toBe(24)
    expect(DEMO_GATE_CODE_SPACE).toBe(24_000_000)
    for (const letter of DEMO_GATE_CODE_LETTERS) expect(`123456${letter}`).toMatch(DEMO_GATE_CODE_PATTERN)
    expect("123456I").not.toMatch(DEMO_GATE_CODE_PATTERN)
    expect("123456O").not.toMatch(DEMO_GATE_CODE_PATTERN)
  })

  it("normalise espaces, tirets et casse", () => {
    expect(normalizeDemoGateCode("482 913 K")).toBe("482913K")
    expect(normalizeDemoGateCode("482-913-k")).toBe("482913K")
    expect(normalizeDemoGateCode(" 482 913 k ")).toBe("482913K")
    expect(normalizeDemoGateCode("482913K")).toBe("482913K")
    expect(normalizeDemoGateCode("000000a")).toBe("000000A")
  })

  it("refuse toute autre forme", () => {
    for (const value of ["482913", "48291K", "4829134K", "482913KK", "482913I", "482913o", "K482913", "482.913.K!", "482913 é", "", " ", "x".repeat(40), 482913, null, undefined, {}]) {
      expect(normalizeDemoGateCode(value)).toBeNull()
    }
    // Une saisie démesurée n'est pas nettoyée : elle est refusée d'emblée.
    expect(normalizeDemoGateCode(`482913K${" ".repeat(40)}`)).toBeNull()
  })

  it("s'affiche en trois groupes", () => {
    expect(formatDemoGateCode("482913K")).toBe("482 913 K")
    expect(formatDemoGateCode("000001Z")).toBe("000 001 Z")
    expect(formatDemoGateCode("pas un code")).toBe("pas un code")
  })
})

describe("numéro — normalisé en E.164", () => {
  // Numéros FICTIFS des plages réservées à la fiction (Ofcom : 07700 900xxx ; ARCEP : 06 39 98 xx xx).
  it("retire les séparateurs et change 00 en +", () => {
    expect(normalizeDemoGatePhone("+44 7700 900123")).toBe("+447700900123")
    expect(normalizeDemoGatePhone("0044 7700-900-123")).toBe("+447700900123")
    expect(normalizeDemoGatePhone("+33 6 39 98 00 01")).toBe("+33639980001")
    expect(normalizeDemoGatePhone("+33.6.39.98.00.01")).toBe("+33639980001")
    expect(normalizeDemoGatePhone(" +33639980001 ")).toBe("+33639980001")
  })

  it("refuse un numéro national, ambigu ou démesuré", () => {
    for (const value of ["06 39 98 00 01", "+33 (0)6 39 98 00 01", "+0639980001", "+123", "+1234567890123456", "+33 6 39 98 00 0a", "", "x".repeat(40), 33639980001, null, undefined]) {
      expect(normalizeDemoGatePhone(value)).toBeNull()
    }
  })
})

describe("tirage — uniforme, par réjection, jamais biaisé", () => {
  it("rend le reste d'un tirage admis", () => {
    expect(uniformRandomInt(10, sequence(0))).toBe(0)
    expect(uniformRandomInt(10, sequence(1_234_567))).toBe(7)
    expect(uniformRandomInt(24, sequence(25))).toBe(1)
  })

  it("rejette les tirages au-delà du plus grand multiple : aucun biais de modulo", () => {
    // 2^32 = 4 294 967 296 ; pour 10, le plus grand multiple est 4 294 967 290 : les six
    // dernières valeurs (…290 à …295) donneraient 0 à 5 une fois de trop. Elles sont rejetées.
    const source = sequence(4_294_967_295, 4_294_967_290, 4_294_967_289)
    expect(uniformRandomInt(10, source)).toBe(9)
    expect(source.draws()).toBe(3)
    // Pour l'espace des codes (24 000 000), le multiple est 178 × 24 000 000 = 4 272 000 000.
    const codes = sequence(4_272_000_000, 4_271_999_999)
    expect(uniformRandomInt(DEMO_GATE_CODE_SPACE, codes)).toBe(DEMO_GATE_CODE_SPACE - 1)
    expect(codes.draws()).toBe(2)
  })

  it("une source défaillante (que des rejets, ou trop courte) lève au lieu de rendre un code", () => {
    expect(() => uniformRandomInt(10, () => new Uint8Array([0xff, 0xff, 0xff, 0xff]))).toThrow("demoGateRandomUnavailable")
    expect(() => uniformRandomInt(10, () => new Uint8Array(2))).toThrow("demoGateRandomUnavailable")
    expect(() => uniformRandomInt(0)).toThrow("demoGateInvalidBound")
    expect(() => uniformRandomInt(1.5)).toThrow("demoGateInvalidBound")
  })

  it("le code découpe un seul tirage : quotient pour les chiffres, reste pour la lettre", () => {
    expect(generateDemoGateCode(sequence(0))).toBe("000000A")
    expect(generateDemoGateCode(sequence(23))).toBe("000000Z")
    expect(generateDemoGateCode(sequence(24))).toBe("000001A")
    expect(generateDemoGateCode(sequence(DEMO_GATE_CODE_SPACE - 1))).toBe("999999Z")
    expect(generateDemoGateCode(sequence(482_913 * 24 + 9))).toBe("482913K")
  })

  it("le tirage réel donne toujours un code bien formé, et varie", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateDemoGateCode()))
    for (const code of codes) expect(code).toMatch(DEMO_GATE_CODE_PATTERN)
    expect(codes.size).toBeGreaterThan(190)
  })

  it("formats des identifiants opaques", () => {
    expect("A".repeat(32)).toMatch(DEMO_GATE_CHALLENGE_ID_PATTERN)
    expect("A".repeat(31)).not.toMatch(DEMO_GATE_CHALLENGE_ID_PATTERN)
    expect("a_b-".repeat(10) + "abc").toMatch(DEMO_GATE_TOKEN_PATTERN)
    expect("a+b/".repeat(10) + "abc").not.toMatch(DEMO_GATE_TOKEN_PATTERN)
  })
})

describe("CH-817 E5 — l'en-tête du jeton de session de porte", () => {
  it("un nom d'en-tête HTTP stable, que le site pose et que le moteur lit (insensible à la casse)", () => {
    expect(DEMO_GATE_TOKEN_HEADER).toBe("X-Demo-Gate-Token")
    expect(new Headers({ [DEMO_GATE_TOKEN_HEADER.toLowerCase()]: "x" }).get(DEMO_GATE_TOKEN_HEADER)).toBe("x")
  })
})
