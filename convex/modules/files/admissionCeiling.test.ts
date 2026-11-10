// @vitest-environment edge-runtime
/**
 * EX-17 — la garde antivirus est FERMÉE au-delà du plafond d'analyse.
 *
 * Avant ce lot, un dépôt de membre de plus de 60 Mio était admis (la vidéo de
 * publication allait jusqu'à 100 Mio), l'analyse le sautait (`skipped`,
 * `too_large`) sans lire un octet, et la garde de délivrance le SERVAIT.
 * Décision du propriétaire (9/11/2026) : refuser à l'envoi tout fichier au-delà
 * de 60 Mio. Seuls les fichiers PRODUITS par la plateforme (enregistrements de
 * direct rapatriés par le serveur) gardent leur exception, tracée.
 *
 * Vrais fichiers de 70 Mio, aucun plafond abaissé : c'est le chemin réel d'un
 * dépôt, de la politique de l'usage jusqu'à `servableUrl`.
 */
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { FILE_GUARD_MAX_INSPECT_BYTES, GENERATED_BLOB_SKIP_REASON } from "@antsia/social-domain/filePolicy"
import { SERVER_PRODUCED_UPLOAD_USAGES, UPLOAD_USAGE_NAMES, UPLOAD_USAGES, type UploadUsage } from "@antsia/social-domain/uploadPolicy"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { testConvex } from "../../test.setup"
import { admitStoredUpload, enqueueScan, findScanByStorageId, registerGeneratedBlob } from "./admission"
import { assertServableStorage, resolveFileDelivery, servableUrl } from "./storageGuard"

type T = ReturnType<typeof testConvex>

const MIO = 1024 * 1024
const SEVENTY_MIO = 70 * MIO

beforeEach(() => {
  // Déploiement simulé LOCAL : l'antivirus mock y est admis.
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function storeBytes(t: T, size: number): Promise<Id<"_storage">> {
  return await t.run(async (ctx) => ctx.storage.store(new Blob([new Uint8Array(size)])))
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  return null
}

async function delivery(t: T, storageId: Id<"_storage">) {
  return await t.run(async (ctx) => resolveFileDelivery(ctx as unknown as MutationCtx, storageId))
}

/** Les usages qu'un MEMBRE peut déposer : tout le registre, sauf ce que seul le serveur produit. */
const MEMBER_USAGES = UPLOAD_USAGE_NAMES.filter((usage) => !(SERVER_PRODUCED_UPLOAD_USAGES as readonly string[]).includes(usage))

describe("EX-17 — un dépôt de membre au-delà du plafond d'analyse n'est jamais servable", () => {
  it("une vidéo de publication de 70 Mio est refusée à l'admission : aucune ligne, aucune URL", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const storageId = await storeBytes(t, SEVENTY_MIO)
    const error = await caught(
      t.run(async (ctx) =>
        admitStoredUpload(ctx as unknown as MutationCtx, { storageId, usage: "media_social", mimeType: "video/mp4" }, { source: "post_media" }),
      ),
    )
    expect(engineErrorRule(error)).toEqual({ rule: "UPLOAD_SIZE_OUT_OF_RANGE", params: { maxMegabytes: 60 } })
    expect(await t.run(async (ctx) => findScanByStorageId(ctx as unknown as MutationCtx, storageId))).toBeNull()
    expect(await t.run(async (ctx) => servableUrl(ctx as unknown as MutationCtx, storageId))).toBeNull()
    expect(await delivery(t, storageId)).toEqual({ url: null, scan: null })
  })

  it("aucun usage de membre n'admet 70 Mio, quel que soit son type", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const storageId = await storeBytes(t, SEVENTY_MIO)
    for (const usage of MEMBER_USAGES) {
      const mimeType = UPLOAD_USAGES[usage].mimeTypes[0]
      const error = await caught(
        t.run(async (ctx) => admitStoredUpload(ctx as unknown as MutationCtx, { storageId, usage: usage as UploadUsage, mimeType }, { source: "message" })),
      )
      expect(engineErrorRule(error)?.rule, usage).toBe("UPLOAD_SIZE_OUT_OF_RANGE")
    }
    expect(await t.run(async (ctx) => findScanByStorageId(ctx as unknown as MutationCtx, storageId))).toBeNull()
  })

  it("la file d'analyse elle-même refuse un fichier qu'elle ne pourrait pas analyser (second verrou)", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const storageId = await storeBytes(t, SEVENTY_MIO)
    const error = await caught(
      t.run(async (ctx) => enqueueScan(ctx as unknown as MutationCtx, { storageId, mimeType: "video/mp4" }, { source: "post_media" })),
    )
    expect(engineErrorRule(error)).toEqual({ rule: "UPLOAD_SIZE_OUT_OF_RANGE", params: { maxMegabytes: 60 } })
    expect(await t.run(async (ctx) => findScanByStorageId(ctx as unknown as MutationCtx, storageId))).toBeNull()
  })

  it("au plafond exact, le fichier est admis puis analysé, jamais sauté", async () => {
    // Le job planifié par l'admission reste en file : l'analyse est jouée ici, une fois.
    vi.useFakeTimers()
    const t = testConvex()
    const storageId = await storeBytes(t, FILE_GUARD_MAX_INSPECT_BYTES)
    const { scanId } = await t.run(async (ctx) =>
      admitStoredUpload(ctx as unknown as MutationCtx, { storageId, usage: "media_social", mimeType: "video/mp4" }, { source: "post_media" }),
    )
    await t.action(internal.modules.files.scan.runScan, { scanId })
    const scan = await t.run(async (ctx) => ctx.db.get(scanId))
    expect(scan?.status).not.toBe("skipped")
    expect(scan?.attempts).toBe(1)
  })

  it("une ligne « sautée » d'avant la fermeture (dépôt de 70 Mio) reste RETENUE : ni URL, ni pièce jointe", async () => {
    const t = testConvex()
    const storageId = await storeBytes(t, SEVENTY_MIO)
    await t.run(async (ctx) => {
      const now = Date.now()
      await ctx.db.insert("fileScans", {
        storageId,
        status: "skipped",
        source: "post_media",
        skipReason: "too_large",
        sizeBytes: SEVENTY_MIO,
        attempts: 1,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      })
    })
    expect(await delivery(t, storageId)).toEqual({ url: null, scan: "error" })
    expect(engineErrorCode(await caught(t.run(async (ctx) => assertServableStorage(ctx as unknown as MutationCtx, storageId))))).toBe("fileScanUnavailable")
  })

  it("l'exception des fichiers produits par la plateforme tient : 70 Mio inscrits par le serveur restent servables", async () => {
    const t = testConvex()
    const storageId = await storeBytes(t, SEVENTY_MIO)
    await t.run(async (ctx) => registerGeneratedBlob(ctx as unknown as MutationCtx, storageId, { mimeType: "video/mp4", filename: "directs/rediffusion.mp4" }))
    expect(await t.run(async (ctx) => findScanByStorageId(ctx as unknown as MutationCtx, storageId))).toMatchObject({ status: "skipped", skipReason: GENERATED_BLOB_SKIP_REASON })
    const served = await delivery(t, storageId)
    expect(served.scan).toBe("skipped")
    expect(served.url).toBeTruthy()
  })
})
