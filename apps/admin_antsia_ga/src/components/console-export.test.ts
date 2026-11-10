import { describe, expect, it } from "vitest"

import { aggregateExportText, closedAggregateExport, type AggregateExportDto, type AggregateExportInput } from "./console-export"
import { parseContracts, validContractsInput } from "./console-federation"

const period = { periodStart: 1000, periodEnd: 2000, cases: 20, actioned: 10, dismissed: 10, suppressed: false, legalStatus: "disclosed" as const, legalMet: 7, legalMissed: null }

describe("export opérateur fermé", () => {
  it("n'exporte ni identité, ni contenu ajouté au DTO", () => {
    const dto = { threshold: 5, email: "private@example.invalid", periods: [{ ...period, personId: "private-person", reason: "private-comment", legalAuthors: 12, legalBase: 13 }] }
    const json = aggregateExportText(dto, "json")
    const csv = aggregateExportText(dto, "csv")
    expect(JSON.parse(json)).toEqual({ threshold: 5, periods: [period] })
    for (const text of [json, csv]) {
      expect(text).not.toContain("private")
      expect(text).not.toContain("email")
      expect(text).not.toContain("personId")
      expect(text).not.toContain("legalAuthors")
      expect(text).not.toContain("legalBase")
    }
  })
  it("une petite cohorte et ses sous-compteurs restent null, jamais zéro", () => {
    const dto: AggregateExportDto = { threshold: 5, periods: [{ ...period, cases: null, actioned: 0, dismissed: 4, suppressed: true }] }
    expect(closedAggregateExport(dto).periods[0]).toEqual({ ...period, cases: null, actioned: null, dismissed: null, suppressed: true })
    expect(aggregateExportText(dto, "csv")).toContain(",,,,true,5")
  })
  it("supprime un sous-compteur ou son complément inférieur au seuil", () => {
    const dto: AggregateExportDto = { threshold: 5, periods: [{ ...period, actioned: 4, dismissed: 16 }] }
    expect(closedAggregateExport(dto).periods[0]).toMatchObject({ cases: 20, actioned: null, dismissed: null })
  })
  it("ferme le téléchargement si la borne ou les périodes sont incohérentes", () => {
    expect(() => closedAggregateExport({ threshold: 4, periods: [period] })).toThrow()
    expect(() => closedAggregateExport({ threshold: 5, periods: [{ ...period, periodEnd: 500 }] })).toThrow()
    expect(() => closedAggregateExport({ threshold: 5, periods: Array.from({ length: 13 }, () => period) })).toThrow()
  })
})

describe("SU01d — échéances légales de l'export opérateur", () => {
  it("garde la règle de /transparence : « moins de » reste null, un état non publié n'exporte aucun nombre", () => {
    const closed = closedAggregateExport({ threshold: 5, periods: [
      { ...period, legalMet: 4, legalMissed: 6 },
      { ...period, legalMet: 7.5, legalMissed: Number.MAX_SAFE_INTEGER + 2 },
      { ...period, legalStatus: "suppressed", legalMet: 9, legalMissed: 9 },
      { ...period, legalStatus: "unmeasured", legalMet: 9, legalMissed: 9 },
    ] })
    expect(closed.periods.map(({ legalStatus, legalMet, legalMissed }) => ({ legalStatus, legalMet, legalMissed }))).toEqual([
      { legalStatus: "disclosed", legalMet: null, legalMissed: 6 },
      { legalStatus: "disclosed", legalMet: null, legalMissed: null },
      { legalStatus: "suppressed", legalMet: null, legalMissed: null },
      { legalStatus: "unmeasured", legalMet: null, legalMissed: null },
    ])
  })

  it("un moteur antérieur, sans état, n'exporte aucune échéance ; un état inconnu ferme l'export", () => {
    const legacy: AggregateExportInput = { threshold: 5, periods: [{ periodStart: 1000, periodEnd: 2000, cases: 20, actioned: 10, dismissed: 10, suppressed: false }] }
    expect(closedAggregateExport(legacy).periods[0]).toEqual({ ...period, legalStatus: "unmeasured", legalMet: null, legalMissed: null })
    const unknown = { threshold: 5, periods: [{ ...period, legalStatus: "published" }] } as unknown as AggregateExportInput
    expect(() => closedAggregateExport(unknown)).toThrow()
  })

  it("le CSV ajoute les trois colonnes à la fin, sans décaler les sept premières", () => {
    const [header, row] = aggregateExportText({ threshold: 5, periods: [period] }, "csv").split("\r\n")
    expect(header).toBe("periodStart,periodEnd,cases,actioned,dismissed,suppressed,threshold,legalStatus,legalMet,legalMissed")
    expect(row).toBe("1970-01-01T00:00:01.000Z,1970-01-01T00:00:02.000Z,20,10,10,false,5,disclosed,7,")
  })
})

describe("références de contrats de fédération", () => {
  it("admet des références distinctes par ligne et refuse doublons, URL ou secret libre", () => {
    expect(parseContracts("PAGE-V1\nPOST-V2,EVENT-V1")).toEqual(["PAGE-V1", "POST-V2", "EVENT-V1"])
    expect(validContractsInput("PAGE-V1\nPOST-V2")).toBe(true)
    expect(validContractsInput("PAGE-V1 PAGE-V1")).toBe(false)
    expect(validContractsInput("https://private.invalid/secret")).toBe(false)
    expect(validContractsInput(Array.from({ length: 33 }, (_, n) => `CONTRACT${n}-V1`).join("\n"))).toBe(false)
  })
})
