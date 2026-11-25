// @vitest-environment edge-runtime
/**
 * M1 (25/11/2026) — réparation interne, bornée et journalisée, d'après panne de
 * l'antivirus. Calquée sur `requeueUnconfiguredScans` (même garde de
 * configuration, même lot validé avant toute écriture, même trace système),
 * pour les seules analyses figées `error` par une PANNE du fournisseur :
 * `AV_ERROR:HTTP 5xx`, `AV_ERROR:HTTP 429`, coupure réseau ou délai d'avant M1,
 * et `AV_UNAVAILABLE:…` au terme des 24 h de reprises.
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { makeFunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { testConvex } from "../../test.setup"
import { listProviderOutageScans, requeueProviderOutageScans } from "./mutations"

type T = ReturnType<typeof testConvex>
type ScanOverrides = Partial<Pick<Doc<"fileScans">, "status" | "verdictReason" | "blobPurgedAt" | "attempts" | "providerUnavailableSince" | "providerUnavailableRetries" | "updatedAt">>
const NOW = Date.UTC(2026, 10, 25, 21)
const CONFIRM = "ANTSIA_REQUEUE_PROVIDER_OUTAGE" as const
const REQUEUE = internal.modules.files.mutations.requeueProviderOutageScans
const LIST = internal.modules.files.mutations.listProviderOutageScans
const OUTAGE_REASONS = [
  "AV_ERROR:HTTP 503",
  "AV_ERROR:HTTP 500",
  "AV_ERROR:HTTP 429",
  "AV_ERROR:fetch failed",
  "AV_ERROR:This operation was aborted",
  "AV_UNAVAILABLE:HTTP 503 queue_full",
  "AV_UNAVAILABLE:timeout",
] as const

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
    const storageId = await ctx.storage.store(new Blob(["fixture retained during the outage"], { type: "text/plain" }))
    return await ctx.db.insert("fileScans", {
      storageId, status: "error", source: "post_media", attempts: 3,
      filename: "private-filename.txt", declaredMimeType: "text/plain",
      verdictReason: "AV_ERROR:HTTP 503",
      completedAt: NOW - 1, createdAt: NOW - 10_000, updatedAt: NOW - 1,
      ...overrides,
    })
  })
}

async function state(t: T) {
  return await t.run(async (ctx) => ({
    scans: await ctx.db.query("fileScans").take(40),
    audit: await ctx.db.query("engineAudit").take(40),
    jobs: await ctx.db.system.query("_scheduled_functions").take(40),
  }))
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try { await promise } catch (error) { return error }
  return null
}

describe("réparation d'après panne de l'antivirus", () => {
  it("est interne, sans endpoint public ni identité humaine requise", () => {
    expect(requeueProviderOutageScans).toHaveProperty("isInternal", true)
    expect(requeueProviderOutageScans).not.toHaveProperty("isPublic")
    expect(listProviderOutageScans).toHaveProperty("isInternal", true)
    expect(listProviderOutageScans).not.toHaveProperty("isPublic")
  })

  it("remet en attente chaque cause de panne, étale les analyses et journalise chaque acte système", async () => {
    const t = testConvex({ automaticSessions: false })
    const scanIds: Id<"fileScans">[] = []
    for (const verdictReason of OUTAGE_REASONS) {
      scanIds.push(await scan(t, { verdictReason, ...(verdictReason.startsWith("AV_UNAVAILABLE:") ? { attempts: 0, providerUnavailableSince: NOW - 25 * 60 * 60_000, providerUnavailableRetries: 31 } : {}) }))
    }
    expect(await t.mutation(REQUEUE, { scanIds, confirm: CONFIRM })).toEqual({ requeued: scanIds.length, scanIds })
    const after = await state(t)
    expect(after.audit).toHaveLength(scanIds.length)
    expect(after.jobs).toHaveLength(scanIds.length)
    scanIds.forEach((scanId, index) => {
      const row = after.scans.find((item) => item._id === scanId)!
      expect(row).toMatchObject({ status: "pending", attempts: 0, updatedAt: NOW })
      for (const field of ["verdictReason", "completedAt", "providerUnavailableSince", "providerUnavailableRetries", "blobPurgedAt"] as const) expect(row[field]).toBeUndefined()
      expect(after.audit.find((item) => item.subjectId === scanId)).toMatchObject({
        action: "file.requeue", capacity: "system", subjectTable: "fileScans", at: NOW,
        details: { reason: "provider_outage_recovered", from: "error", previousReason: OUTAGE_REASONS[index] },
      })
      // Étalées : la façade qui sort de panne ne reçoit pas tout le lot d'un coup.
      expect(after.jobs.find((job) => job.args[0]?.scanId === scanId)).toMatchObject({ name: "modules/files/scan:runScan", args: [{ scanId }], scheduledTime: NOW + index * 2_000, state: { kind: "pending" } })
    })
    expect(after.audit.every((entry) => entry.actorPersonId === undefined)).toBe(true)
    expect(JSON.stringify(after.audit)).not.toContain("private-filename")
  })

  it.each(["pending", "running", "clean", "suspicious", "infected", "skipped"] as const)("refuse tout le lot si la seconde ligne est %s, sans écriture ni job", async (status) => {
    const t = testConvex({ automaticSessions: false })
    const first = await scan(t), second = await scan(t, { status })
    const before = await state(t)
    expect(engineErrorCode(await caught(t.mutation(REQUEUE, { scanIds: [first, second], confirm: CONFIRM })))).toBe("conflict")
    expect(await state(t)).toEqual(before)
  })

  it.each([
    { verdictReason: "AV_ERROR:provider_unconfigured" },
    { verdictReason: "AV_ERROR:HTTP 401" },
    { verdictReason: "AV_ERROR:HTTP 413" },
    { verdictReason: "AV_ERROR:clamav-rest" },
    { verdictReason: "AV_SKIPPED:too_large" },
    { verdictReason: "STALE_JOB" },
    { verdictReason: "MIME_MISMATCH" },
    { blobPurgedAt: NOW - 1 },
  ])("refuse une autre cause qu'une panne, ou un blob purgé (%j)", async (overrides) => {
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

  it("borne le lot à 1 – 25 identifiants distincts", async () => {
    const t = testConvex({ automaticSessions: false })
    const ids: Id<"fileScans">[] = []
    for (let index = 0; index < 26; index += 1) ids.push(await scan(t))
    const before = await state(t)
    for (const scanIds of [[], [ids[0]!, ids[0]!], ids]) {
      expect(engineErrorCode(await caught(t.mutation(REQUEUE, { scanIds, confirm: CONFIRM })))).toBe("invalidArgument")
      expect(await state(t)).toEqual(before)
    }
    expect(await t.mutation(REQUEUE, { scanIds: ids.slice(0, 25), confirm: CONFIRM })).toMatchObject({ requeued: 25 })
  })

  it("exige la confirmation littérale et refuse une cible absente sans commencer le lot", async () => {
    const t = testConvex({ automaticSessions: false })
    const first = await scan(t), missing = await scan(t)
    await t.run(async (ctx) => ctx.db.delete(missing))
    const before = await state(t)
    const wrongConfirmation = makeFunctionReference<"mutation", { scanIds: Id<"fileScans">[]; confirm: string }>("modules/files/mutations:requeueProviderOutageScans")
    await expect(t.mutation(wrongConfirmation, { scanIds: [first], confirm: "ANTSIA_REQUEUE_PROVIDER_UNCONFIGURED" })).rejects.toThrow()
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

  it("la liste des candidats ne rend que les pannes, sans nom de fichier, page par page", async () => {
    const t = testConvex({ automaticSessions: false })
    const outage = await scan(t, { verdictReason: "AV_ERROR:HTTP 503", updatedAt: NOW - 3 })
    const unavailable = await scan(t, { verdictReason: "AV_UNAVAILABLE:timeout", updatedAt: NOW - 2 })
    await scan(t, { verdictReason: "AV_ERROR:provider_unconfigured", updatedAt: NOW - 1 })
    await scan(t, { status: "infected", verdictReason: "AV_INFECTED:Synthetic.Test" })
    const first = await t.query(LIST, { paginationOpts: { numItems: 2, cursor: null } })
    const second = await t.query(LIST, { paginationOpts: { numItems: 2, cursor: first.continueCursor } })
    const listed = [...first.page, ...second.page]
    expect(listed.map((item) => item.scanId)).toEqual([unavailable, outage])
    expect(listed[0]).toEqual({ scanId: unavailable, verdictReason: "AV_UNAVAILABLE:timeout", updatedAt: NOW - 2 })
    expect(JSON.stringify(listed)).not.toContain("private-filename")
    expect(second.isDone).toBe(true)
  })
})
