// @vitest-environment node
import { describe, expect, it } from "vitest"

import { callJournalFamilyOf, journalOfFamily } from "./call-journal"

const personal = { id: "a" }
const shop = { id: "b", commercialThreadId: "thread-shop" }
const relation = { id: "c", contextualThreadId: "thread-relation" }

describe("ADR-0036 — le journal d'appels par famille", () => {
  it("un appel de boutique ou de mise en relation est pro, les autres personnels", () => {
    expect(callJournalFamilyOf(personal as never)).toBe("personnel")
    expect(callJournalFamilyOf(shop as never)).toBe("pro")
    expect(callJournalFamilyOf(relation as never)).toBe("pro")
  })
  it("iCom ne garde que les appels personnels, iCom Pro les autres ; sans famille, tout le journal", () => {
    const entries = [personal, shop, relation] as never[]
    expect(journalOfFamily(entries, "personnel")).toEqual([personal])
    expect(journalOfFamily(entries, "pro")).toEqual([shop, relation])
    expect(journalOfFamily(entries, undefined)).toEqual(entries)
  })
})
