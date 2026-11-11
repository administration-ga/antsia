/** DP-F1 : l'export de « Mes données » passe la borne de 5 000 pages et s'arrête sur un curseur figé. */
import { describe, expect, it, vi } from "vitest"

import { assemblePersonalExport, EXPORT_PAGE_LIMIT, type PersonalExportPage } from "./personal-data-export"

const account = JSON.stringify({ account: { name: "Recette" }, identityProofs: [] })

function run(readPage: (tableIndex: number, cursor: string | null) => Promise<PersonalExportPage>, tableCount: number, isCurrent = () => true) {
  const onProgress = vi.fn()
  return { onProgress, result: assemblePersonalExport({ accountJson: account, tableCount, readPage, isCurrent, onProgress }) }
}

describe("DP-F1 — assemblage de l'export personnel", () => {
  it("enchaîne les tables et les pages d'une table, sans perdre ni doubler une ligne", async () => {
    const pages: Record<string, PersonalExportPage> = {
      "0:": { table: "follows", json: JSON.stringify([{ _id: "f1" }]), nextTableIndex: 0, cursor: "c1", done: false },
      "0:c1": { table: "follows", json: JSON.stringify([{ _id: "f2" }]), nextTableIndex: 1, cursor: null, done: false },
      "1:": { table: "posts", json: JSON.stringify([{ _id: "p1" }]), nextTableIndex: 2, cursor: null, done: true },
    }
    const { result, onProgress } = run(async (tableIndex, cursor) => pages[`${tableIndex}:${cursor ?? ""}`]!, 2)
    const chunks = await result
    expect(chunks?.map((chunk) => JSON.parse(chunk))).toEqual([
      { table: "authentication", record: JSON.parse(account) },
      { table: "follows", record: { _id: "f1" } },
      { table: "follows", record: { _id: "f2" } },
      { table: "posts", record: { _id: "p1" } },
    ])
    expect(onProgress).toHaveBeenLastCalledWith(2, 2)
  })

  it("un membre aux nombreuses lignes dépasse 5 000 pages, l'ancienne borne", async () => {
    let calls = 0
    const { result } = run(async (_tableIndex, cursor) => {
      calls += 1
      const next = Number(cursor ?? "0") + 1
      return next < 6_000
        ? { table: "notifications", json: "[]", nextTableIndex: 0, cursor: String(next), done: false }
        : { table: "notifications", json: "[]", nextTableIndex: 1, cursor: null, done: true }
    }, 1)
    expect(await result).toHaveLength(1)
    expect(calls).toBe(6_000)
    expect(EXPORT_PAGE_LIMIT).toBeGreaterThan(6_000)
  })

  it("un curseur figé ou une table sautée arrête l'export au lieu de boucler", async () => {
    const frozen = run(async () => ({ table: "posts", json: "[]", nextTableIndex: 0, cursor: "same", done: false }), 3)
    await expect(frozen.result).rejects.toThrow("Export interrupted")
    const skipped = run(async () => ({ table: "posts", json: "[]", nextTableIndex: 2, cursor: null, done: false }), 3)
    await expect(skipped.result).rejects.toThrow("Export interrupted")
  })

  it("une réponse illisible échoue ; un export abandonné ne rend rien", async () => {
    await expect(run(async () => ({ table: "posts", json: "{}", nextTableIndex: 1, cursor: null, done: true }), 1).result).rejects.toThrow("Invalid export")
    let current = true
    const abandoned = run(async () => { current = false; return { table: "posts", json: "[]", nextTableIndex: 0, cursor: "c", done: false } }, 1, () => current)
    expect(await abandoned.result).toBeNull()
  })
})
