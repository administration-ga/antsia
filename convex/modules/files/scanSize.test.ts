// @vitest-environment edge-runtime
/**
 * La garde des fichiers juge la TAILLE STOCKÉE avant de télécharger : un fichier
 * au-delà du plafond d'inspection est écarté (`skipped`, `too_large`) sans que
 * l'action ne lise ses octets. Le plafond est abaissé à 16 octets pour le test
 * (le vrai, 60 Mio, est éprouvé avec de vrais fichiers dans `admissionCeiling.test.ts`).
 *
 * EX-17 : un tel fichier n'est plus ADMIS (refus à l'admission) ; une ligne
 * au-delà du plafond ne peut venir que d'avant la fermeture — elle est
 * fabriquée ici telle quelle, et l'analyse sautée la laisse RETENUE.
 */
import { engineErrorRule } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { testConvex } from "../../test.setup"
import { admitStoredUpload, findScanByStorageId } from "./admission"
import { resolveFileDelivery } from "./storageGuard"

vi.mock("./policy", async (importOriginal) => ({ ...(await importOriginal<typeof import("./policy")>()), FILE_GUARD_MAX_INSPECT_BYTES: 16 }))

type T = ReturnType<typeof testConvex>

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

/** Un fichier déposé puis admis à l'analyse (ligne `pending`), comme le fait une mutation de dépôt. */
async function admitted(t: T, content: string): Promise<Id<"fileScans">> {
  return await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob([content], { type: "application/pdf" }))
    const out = await admitStoredUpload(ctx as unknown as MutationCtx, { storageId, usage: "chat_attachment", mimeType: "application/pdf" }, { source: "message" })
    return out.scanId
  })
}

describe("analyse — la taille stockée d'abord", () => {
  it("`_markRunning` rend la taille STOCKÉE", async () => {
    const t = testConvex()
    const scanId = await admitted(t, "%PDF-1.4 petit")
    const facts = await t.mutation(internal.modules.files.mutations._markRunning, { scanId })
    expect(facts?.sizeBytes).toBe(14)
  })

  it("au-delà du plafond, l'admission refuse : aucune ligne n'entre dans la file", async () => {
    const t = testConvex()
    const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob(["%PDF-1.4 un fichier qui dépasse le plafond abaissé"], { type: "application/pdf" })))
    let refusal: unknown = null
    try {
      await t.run(async (ctx) => admitStoredUpload(ctx as unknown as MutationCtx, { storageId, usage: "chat_attachment", mimeType: "application/pdf" }, { source: "message" }))
    } catch (error) {
      refusal = error
    }
    expect(engineErrorRule(refusal)?.rule).toBe("UPLOAD_SIZE_OUT_OF_RANGE")
    expect(await t.run(async (ctx) => findScanByStorageId(ctx as unknown as MutationCtx, storageId))).toBeNull()
  })

  it("une ligne d'avant la fermeture, au-delà du plafond, est écartée SANS que ses octets soient lus, puis RETENUE", async () => {
    const t = testConvex()
    const content = "%PDF-1.4 un fichier qui dépasse le plafond abaissé"
    const { storageId, scanId } = await t.run(async (ctx) => {
      const stored = await ctx.storage.store(new Blob([content], { type: "application/pdf" }))
      const now = Date.now()
      const id = await ctx.db.insert("fileScans", { storageId: stored, status: "pending", source: "message", declaredMimeType: "application/pdf", attempts: 0, createdAt: now, updatedAt: now })
      return { storageId: stored, scanId: id }
    })
    const read = vi.spyOn(Blob.prototype, "arrayBuffer")

    await t.action(internal.modules.files.scan.runScan, { scanId })

    expect(read).not.toHaveBeenCalled()
    const scan = await t.run(async (ctx) => ctx.db.get(scanId))
    expect(scan).toMatchObject({ status: "skipped", skipReason: "too_large" })
    expect(scan?.sizeBytes).toBeGreaterThan(16)
    // Sauté n'est pas sain : la garde de délivrance ne le sert pas (EX-17).
    expect(await t.run(async (ctx) => resolveFileDelivery(ctx as unknown as MutationCtx, storageId))).toEqual({ url: null, scan: "error" })
  })

  it("sous le plafond, l'analyse lit le fichier et rend son verdict", async () => {
    const t = testConvex()
    const scanId = await admitted(t, "%PDF-1.4 court")
    const read = vi.spyOn(Blob.prototype, "arrayBuffer")

    await t.action(internal.modules.files.scan.runScan, { scanId })

    expect(read).toHaveBeenCalled()
    const scan = await t.run(async (ctx) => ctx.db.get(scanId))
    expect(scan?.status).not.toBe("skipped")
  })
})
