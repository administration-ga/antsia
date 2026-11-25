// @vitest-environment edge-runtime
/**
 * M1 (25/11/2026) — un antivirus INDISPONIBLE n'est pas un verdict.
 *
 * La façade ClamAV qui refuse une analyse simultanée (503 « busy », puis
 * `queue_full`), une panne d'une heure, un proxy qui répond 502 : aucune de ces
 * réponses ne juge le fichier. Le moteur reprend l'analyse plus tard, à gigue,
 * sans entamer ses trois tentatives de verdict, pendant 24 h au plus ; le
 * fichier reste retenu tout ce temps (fail-closed). Un vrai FOUND retient
 * toujours le fichier au premier verdict.
 *
 * Le fournisseur est `clamav-rest`, branché sur un `fetch` simulé : aucune
 * requête ne sort du harnais. Les fichiers sont fabriqués en test.
 */
import type { UploadUsage } from "@antsia/social-domain/uploadPolicy"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { testConvex } from "../../test.setup"
import { admitStoredUpload, findScanByStorageId } from "./admission"
import { FILE_GUARD_UNAVAILABLE_WINDOW_MS } from "./policy"
import { resolveFileDelivery } from "./storageGuard"

type T = ReturnType<typeof testConvex>

const NOW = Date.UTC(2026, 10, 25, 18)
const HOUR = 60 * 60_000
const PDF = "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n"
const CLEAN_REPLY = '[{"Status":"OK","Description":"","FileName":"fichier"}]'
const FOUND_REPLY = '[{"Status":"FOUND","Description":"Synthetic.Test-Signature","FileName":"fichier"}]'

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
  vi.unstubAllGlobals()
})

/** Le `fetch` simulé de la façade : chaque appel est noté avec son heure et sa réponse. */
function stubScanner(answer: (now: number, call: number) => Response | Promise<Response>) {
  const calls: { at: number; status: number | "transport" }[] = []
  vi.stubGlobal("fetch", vi.fn(async () => {
    const at = Date.now()
    try {
      const response = await answer(at, calls.length)
      calls.push({ at, status: response.status })
      return response
    } catch (error) {
      calls.push({ at, status: "transport" })
      throw error
    }
  }))
  return calls
}

async function admit(t: T, content: string, usage: UploadUsage = "chat_attachment"): Promise<{ scanId: Id<"fileScans">; storageId: Id<"_storage"> }> {
  return await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob([content], { type: "application/pdf" }))
    const { scanId } = await admitStoredUpload(ctx as unknown as MutationCtx, { storageId, usage, mimeType: "application/pdf" }, { source: "message", filename: "programme.pdf" })
    return { scanId, storageId }
  })
}

async function scanRow(t: T, storageId: Id<"_storage">): Promise<Doc<"fileScans">> {
  const row = await t.run(async (ctx) => findScanByStorageId(ctx as unknown as MutationCtx, storageId))
  if (!row) throw new Error("ligne d'analyse absente")
  return row
}

async function delivery(t: T, storageId: Id<"_storage">) {
  return await t.run(async (ctx) => resolveFileDelivery(ctx as unknown as MutationCtx, storageId))
}

describe("M1 — analyses simultanées contre une façade occupée", () => {
  it.each([
    ["l'ancienne façade (503 « busy »)", '{"error":"busy"}'],
    ["la façade à file pleine (503 queue_full)", '{"error":"queue_full"}'],
  ])("quatre médias publiés ensemble finissent tous sains contre %s, un seul verdict chacun", async (_label, busyBody) => {
    // Une seule analyse à la fois : la façade est occupée dix secondes après chaque fichier accepté.
    let busyUntil = Number.NEGATIVE_INFINITY
    const calls = stubScanner((now) => {
      if (now < busyUntil) return new Response(busyBody, { status: 503 })
      busyUntil = now + 10_000
      return new Response(CLEAN_REPLY, { status: 200 })
    })
    const t = testConvex({ automaticSessions: false })
    const files = []
    for (let index = 0; index < 4; index += 1) files.push(await admit(t, `${PDF}% fichier ${index}\n`))

    await t.finishAllScheduledFunctions(vi.runAllTimers)

    for (const { storageId } of files) {
      const row = await scanRow(t, storageId)
      expect(row).toMatchObject({ status: "clean", verdictReason: "OK", attempts: 1 })
      // La série d'indisponibilités est close avec le verdict.
      expect(row.providerUnavailableSince).toBeUndefined()
      expect(row.providerUnavailableRetries).toBeUndefined()
      expect((await delivery(t, storageId)).url).not.toBeNull()
    }
    // La façade a bien refusé des analyses simultanées, et chaque fichier n'a été accepté qu'une fois.
    expect(calls.filter((call) => call.status === 503).length).toBeGreaterThanOrEqual(3)
    expect(calls.filter((call) => call.status === 200)).toHaveLength(4)
    // Aucune analyse en échec n'a prévenu qui que ce soit.
    expect(await t.run(async (ctx) => ctx.db.query("notifications").take(1))).toEqual([])
  })
})

describe("M1 — une panne de l'antivirus se rattrape d'elle-même", () => {
  it.each([
    ["coupure réseau", () => { throw new TypeError("fetch failed") }],
    ["proxy sans service (502)", () => new Response("<html>Bad Gateway</html>", { status: 502 })],
  ] as const)("une heure de %s : le fichier reste retenu, puis finit sain sans intervention", async (_label, outage) => {
    const recoveredAt = NOW + HOUR
    const calls = stubScanner((now) => (now < recoveredAt ? outage() : new Response(CLEAN_REPLY, { status: 200 })))
    const t = testConvex({ automaticSessions: false })
    const { storageId } = await admit(t, PDF)

    // Premier essai pendant la panne : retenu, « analyse en cours », sans tentative de verdict entamée.
    vi.advanceTimersByTime(0)
    await t.finishInProgressScheduledFunctions()
    const waiting = await scanRow(t, storageId)
    expect(waiting).toMatchObject({ status: "pending", attempts: 0, providerUnavailableRetries: 1, providerUnavailableSince: NOW })
    expect(waiting.verdictReason).toMatch(/^AV_UNAVAILABLE:/)
    expect(await delivery(t, storageId)).toEqual({ url: null, scan: "pending" })

    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const row = await scanRow(t, storageId)
    expect(row).toMatchObject({ status: "clean", verdictReason: "OK", attempts: 1 })
    expect(row.completedAt ?? 0).toBeGreaterThanOrEqual(recoveredAt)
    // Reprises lentes : quelques essais pendant l'heure de panne, pas un essai par seconde.
    const duringOutage = calls.filter((call) => call.at < recoveredAt)
    expect(duringOutage.length).toBeGreaterThanOrEqual(3)
    expect(duringOutage.length).toBeLessThanOrEqual(10)
    expect((await delivery(t, storageId)).url).not.toBeNull()
  })

  it("au-delà de 24 h d'indisponibilité, la ligne se fige `error` avec un motif distinct, sans tentative de verdict consommée", async () => {
    const calls = stubScanner(() => new Response('{"error":"queue_full"}', { status: 503 }))
    const t = testConvex({ automaticSessions: false })
    const { storageId } = await admit(t, PDF)

    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const row = await scanRow(t, storageId)
    expect(row).toMatchObject({ status: "error", verdictReason: "AV_UNAVAILABLE:HTTP 503 queue_full", attempts: 0 })
    expect(row.completedAt).toBeGreaterThanOrEqual(NOW + FILE_GUARD_UNAVAILABLE_WINDOW_MS)
    expect(row.completedAt).toBeLessThanOrEqual(NOW + FILE_GUARD_UNAVAILABLE_WINDOW_MS + HOUR)
    // Bornée : environ une reprise par heure une fois le plafond atteint, jamais plus de 60 en 24 h.
    expect(calls.length).toBeGreaterThanOrEqual(20)
    expect(calls.length).toBeLessThanOrEqual(60)
    expect(await delivery(t, storageId)).toEqual({ url: null, scan: "error" })
  })
})

describe("M1 — un vrai verdict garde sa force", () => {
  it("un FOUND retient le fichier au premier verdict, même après des indisponibilités", async () => {
    stubScanner((_now, call) => (call < 2 ? new Response('{"error":"queue_full"}', { status: 503 }) : new Response(FOUND_REPLY, { status: 200 })))
    const t = testConvex({ automaticSessions: false })
    const { storageId } = await admit(t, PDF)

    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const row = await scanRow(t, storageId)
    expect(row).toMatchObject({ status: "infected", verdictReason: "AV_INFECTED:Synthetic.Test-Signature", attempts: 1 })
    expect(row.av).toMatchObject({ provider: "clamav-rest", verdict: "infected", signature: "Synthetic.Test-Signature" })
    expect(await delivery(t, storageId)).toEqual({ url: null, scan: "infected" })
  })

  it("une erreur de clamd reste un verdict : trois tentatives, puis `error` comme avant", async () => {
    const calls = stubScanner(() => new Response('[{"Status":"ERROR","Description":"clamd_error"}]', { status: 200 }))
    const t = testConvex({ automaticSessions: false })
    const { storageId } = await admit(t, PDF)

    await t.finishAllScheduledFunctions(vi.runAllTimers)

    expect(await scanRow(t, storageId)).toMatchObject({ status: "error", verdictReason: "AV_ERROR:réponse JSON sans verdict", attempts: 3 })
    expect(calls).toHaveLength(3)
  })
})

describe("M1 — le balayeur respecte la reprise programmée", () => {
  it("une ligne qui attend sa reprise n'est pas un job perdu ; elle l'est cinq minutes après l'échéance manquée", async () => {
    stubScanner(() => new Response("", { status: 503 }))
    const t = testConvex({ automaticSessions: false })
    const { scanId, storageId } = await admit(t, PDF)
    // Huitième indisponibilité de la série : la reprise suivante est à 30 min au moins.
    await t.run(async (ctx) => ctx.db.patch(scanId, { providerUnavailableSince: NOW, providerUnavailableRetries: 7 }))
    await t.action(internal.modules.files.scan.runScan, { scanId })

    const waiting = await scanRow(t, storageId)
    expect(waiting).toMatchObject({ status: "pending", attempts: 0, providerUnavailableRetries: 8, verdictReason: "AV_UNAVAILABLE:HTTP 503" })
    const dueAt = waiting.updatedAt
    expect(dueAt).toBeGreaterThanOrEqual(NOW + 30 * 60_000)
    expect(dueAt).toBeLessThanOrEqual(NOW + HOUR)

    vi.setSystemTime(dueAt + 4 * 60_000)
    expect(await t.mutation(internal.modules.files.mutations.retryStale, {})).toBe(0)
    expect((await scanRow(t, storageId)).updatedAt).toBe(dueAt)

    vi.setSystemTime(dueAt + 6 * 60_000)
    expect(await t.mutation(internal.modules.files.mutations.retryStale, {})).toBe(1)
    expect(await scanRow(t, storageId)).toMatchObject({ status: "pending", attempts: 0, updatedAt: dueAt + 6 * 60_000 })
  })
})
