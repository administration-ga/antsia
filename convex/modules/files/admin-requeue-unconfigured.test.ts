// @vitest-environment edge-runtime
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { makeFunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { testConvex } from "../../test.setup"
import { requeueUnconfiguredScans } from "./mutations"

type T = ReturnType<typeof testConvex>
type ScanOverrides = Partial<Pick<Doc<"fileScans">, "status" | "verdictReason" | "blobPurgedAt">>
const NOW = Date.UTC(2026, 9, 20, 20)
const CONFIRM = "ANTSIA_REQUEUE_PROVIDER_UNCONFIGURED" as const
const REQUEUE = internal.modules.files.mutations.requeueUnconfiguredScans

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.stubEnv("FILE_GUARD", "on")
  vi.stubEnv("FILE_SCAN_PROVIDER", "clamav-rest")
  vi.stubEnv("FILE_SCAN_CLAMAV_URL", "https://scanner.example.test/scan")
  vi.stubEnv("FILE_SCAN_CLAMAV_TOKEN", "fixture-only-antivirus-token")
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function scan(t: T, overrides: ScanOverrides = {}) {
  return await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(["fixture retained by the scan"], { type: "text/plain" }))
    return await ctx.db.insert("fileScans", {
      storageId, status: "error", source: "post_media", attempts: 3,
      filename: "private-filename.txt", declaredMimeType: "text/plain",
      verdictReason: "AV_ERROR:provider_unconfigured",
      completedAt: NOW - 1, createdAt: NOW - 10_000, updatedAt: NOW - 1,
      ...overrides,
    })
  })
}

async function state(t: T) {
  return await t.run(async (ctx) => ({
    scans: await ctx.db.query("fileScans").take(10),
    audit: await ctx.db.query("engineAudit").take(10),
    jobs: await ctx.db.system.query("_scheduled_functions").take(10),
  }))
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try { await promise } catch (error) { return error }
  return null
}

describe("relance administrative des seules analyses sans fournisseur", () => {
  it("est une fonction interne, sans endpoint public ni identité humaine requise", () => {
    expect(requeueUnconfiguredScans).toHaveProperty("isInternal", true)
    expect(requeueUnconfiguredScans).not.toHaveProperty("isPublic")
  })

  it.each([1, 2])("remet %s analyse(s) en attente, programme le vrai scanner et journalise chaque acte système", async (count) => {
    const t = testConvex({ automaticSessions: false })
    const scanIds: Id<"fileScans">[] = []
    for (let index = 0; index < count; index++) scanIds.push(await scan(t))
    expect(await t.mutation(REQUEUE, { scanIds, confirm: CONFIRM })).toEqual({ requeued: count, scanIds })
    const after = await state(t)
    expect(after.scans).toHaveLength(count)
    expect(after.audit).toHaveLength(count)
    expect(after.jobs).toHaveLength(count)
    for (const scanId of scanIds) {
      const row = after.scans.find((item) => item._id === scanId)!
      expect(row).toMatchObject({ status: "pending", attempts: 0, updatedAt: NOW })
      expect(row.verdictReason).toBeUndefined()
      expect(row.completedAt).toBeUndefined()
      expect(row.releasedAt).toBeUndefined()
      expect(row.blobPurgedAt).toBeUndefined()
      expect(after.audit.find((item) => item.subjectId === scanId)).toMatchObject({
        action: "file.requeue", capacity: "system", subjectTable: "fileScans", at: NOW,
        details: { reason: "provider_configuration_restored", from: "error", previousReason: "AV_ERROR:provider_unconfigured" },
      })
      expect(after.jobs.find((job) => job.args[0]?.scanId === scanId)).toMatchObject({ name: "modules/files/scan:runScan", args: [{ scanId }], scheduledTime: NOW, state: { kind: "pending" } })
      expect(await t.run(async (ctx) => ctx.db.system.get(row.storageId))).not.toBeNull()
    }
    expect(after.audit.every((entry) => entry.actorPersonId === undefined)).toBe(true)
    expect(JSON.stringify(after.audit)).not.toContain("private-filename")
    expect(await t.run(async (ctx) => ctx.db.query("persons").take(1))).toEqual([])
    expect(await t.run(async (ctx) => ctx.db.query("operators").take(1))).toEqual([])
  })

  it.each(["pending", "running", "clean", "suspicious", "infected", "skipped"] as const)("refuse tout le lot si la seconde ligne est %s, sans écriture ni job", async (status) => {
    const t = testConvex({ automaticSessions: false })
    const first = await scan(t), second = await scan(t, { status })
    const before = await state(t)
    expect(engineErrorCode(await caught(t.mutation(REQUEUE, { scanIds: [first, second], confirm: CONFIRM })))).toBe("conflict")
    expect(await state(t)).toEqual(before)
  })

  it.each([
    { verdictReason: "AV_ERROR:HTTP 503" },
    { verdictReason: "AV_ERROR:provider_incomplete" },
    { blobPurgedAt: NOW - 1 },
  ])("refuse une autre cause ou un blob purgé (%j)", async (overrides) => {
    const t = testConvex({ automaticSessions: false })
    const first = await scan(t), second = await scan(t, overrides)
    const before = await state(t)
    expect(engineErrorCode(await caught(t.mutation(REQUEUE, { scanIds: [first, second], confirm: CONFIRM })))).toBe("conflict")
    expect(await state(t)).toEqual(before)
  })

  it.each([
    ["FILE_SCAN_PROVIDER", undefined], ["FILE_SCAN_PROVIDER", "mock"],
    ["FILE_SCAN_CLAMAV_URL", undefined], ["FILE_SCAN_CLAMAV_URL", " "],
    ["FILE_SCAN_CLAMAV_TOKEN", undefined], ["FILE_SCAN_CLAMAV_TOKEN", " "],
    ["FILE_GUARD", "off"],
  ] as const)("refuse sans écriture si la configuration %s est absente ou invalide (%s)", async (key, value) => {
    const t = testConvex({ automaticSessions: false })
    const scanId = await scan(t), before = await state(t)
    vi.stubEnv(key, value)
    expect(engineErrorCode(await caught(t.mutation(REQUEUE, { scanIds: [scanId], confirm: CONFIRM })))).toBe("conflict")
    expect(await state(t)).toEqual(before)
  })

  it("borne le lot à un ou deux identifiants distincts", async () => {
    const t = testConvex({ automaticSessions: false })
    const first = await scan(t), second = await scan(t), third = await scan(t)
    const before = await state(t)
    for (const scanIds of [[], [first, first], [first, second, third]]) {
      expect(engineErrorCode(await caught(t.mutation(REQUEUE, { scanIds, confirm: CONFIRM })))).toBe("invalidArgument")
      expect(await state(t)).toEqual(before)
    }
  })

  it("exige la confirmation littérale et refuse une cible absente sans commencer le lot", async () => {
    const t = testConvex({ automaticSessions: false })
    const first = await scan(t), missing = await scan(t)
    await t.run(async (ctx) => ctx.db.delete(missing))
    const before = await state(t)
    const invalidConfirmation = makeFunctionReference<"mutation", { scanIds: Id<"fileScans">[]; confirm: string }>("modules/files/mutations:requeueUnconfiguredScans")
    await expect(t.mutation(invalidConfirmation, { scanIds: [first], confirm: "not-confirmed" })).rejects.toThrow()
    expect(await state(t)).toEqual(before)
    expect(engineErrorCode(await caught(t.mutation(REQUEUE, { scanIds: [first, missing], confirm: CONFIRM })))).toBe("notFound")
    expect(await state(t)).toEqual(before)
  })

  it("un second appel ne relance pas une analyse déjà en attente et ne double pas l'audit", async () => {
    const t = testConvex({ automaticSessions: false })
    const scanId = await scan(t)
    await t.mutation(REQUEUE, { scanIds: [scanId], confirm: CONFIRM })
    const before = await state(t)
    expect(engineErrorCode(await caught(t.mutation(REQUEUE, { scanIds: [scanId], confirm: CONFIRM })))).toBe("conflict")
    expect(await state(t)).toEqual(before)
  })
})
