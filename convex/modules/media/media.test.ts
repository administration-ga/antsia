// @vitest-environment edge-runtime
// Dupliqué de socle/convex/modules/reseauPersonnel/media.adoption.test.ts @ ad2e7fdc2 — adaptations : la vérification des médias déclarés et leur délivrance, testées pour elles-mêmes (les cas qui passent par `stories.publish` et les groupes thématiques reviennent avec ces modules) ; politique d'usage appliquée (D36) ; délivrance fail-closed avec retenue nommée ; URL de dépôt sous adhésion et usage déclaré.
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { type DeclaredMedia, resolvePostMediaDtos, verifyDeclaredMedia } from "./media"

type T = ReturnType<typeof testConvex>

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function setup(t: T) {
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const enter = async (subject: string) => {
    const as = t.withIdentity({ subject })
    const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    await as.mutation(api.modules.people.profile.publishMyProfile, { handle: subject, displayName: subject })
    await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
    return { as, personId }
  }
  return { root, enter }
}

async function store(t: T, content: Uint8Array, type: string): Promise<Id<"_storage">> {
  return await t.run(async (ctx) => ctx.storage.store(new Blob([content as BlobPart], { type })))
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  return null
}

function verify(t: T, actorPersonId: Id<"persons">, networkId: Id<"networks">, declared: DeclaredMedia[]) {
  return t.run(async (ctx) => verifyDeclaredMedia(ctx as unknown as MutationCtx, { actorPersonId, networkId, usage: "media_social", source: "post_media", declared }))
}

describe("URL de dépôt d'un média de réseau", () => {
  it("exige l'adhésion et un usage de média de réseau", async () => {
    const t = testConvex()
    const { root, enter } = await setup(t)
    const lynda = await enter("lynda")
    expect(typeof (await lynda.as.mutation(api.modules.media.media.generateUploadUrl, { networkId: root, usage: "media_social" }))).toBe("string")
    const stranger = t.withIdentity({ subject: "inconnu" })
    await stranger.mutation(api.modules.people.persons.ensureMyPerson, {})
    expect(engineErrorCode(await caught(stranger.mutation(api.modules.media.media.generateUploadUrl, { networkId: root, usage: "media_social" })))).toBe("notFound")
  })
})

describe("médias déclarés — la vérité du stockage, sous garde", () => {
  it("un média neuf est vérifié, admis au nom de l'acteur, puis délivré retenu jusqu'au verdict", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const { root, enter } = await setup(t)
    const lynda = await enter("lynda")
    const storageId = await store(t, PNG, "image/png")
    const media = await verify(t, lynda.personId, root, [{ storageId, kind: "image", mimeType: "image/png", sizeBytes: PNG.length, width: 4, height: 3, altText: "  Un logo  " }])
    expect(media).toEqual([{ storageId, kind: "image", mimeType: "image/png", sizeBytes: PNG.length, width: 4, height: 3, altText: "Un logo" }])
    expect(await t.run(async (ctx) => resolvePostMediaDtos(ctx, media))).toEqual([
      { url: null, withheld: "fileScanPending", kind: "image", mimeType: "image/png", width: 4, height: 3, altText: "Un logo" },
    ])
    const scan = await t.run(async (ctx) =>
      ctx.db
        .query("fileScans")
        .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
        .unique(),
    )
    expect(scan).toMatchObject({ source: "post_media", networkId: root, uploadedByPersonId: lynda.personId })
    vi.useRealTimers()
    if (scan) await t.action(internal.modules.files.scan.runScan, { scanId: scan._id })
    const [dto] = await t.run(async (ctx) => resolvePostMediaDtos(ctx, media))
    expect(dto?.withheld).toBeNull()
    expect(dto?.url).toBeTruthy()
  })

  it("le média d'autrui se refuse comme un identifiant inventé ; le sien déjà joint se nomme", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const { root, enter } = await setup(t)
    const lynda = await enter("lynda")
    const paul = await enter("paul")
    const storageId = await store(t, PNG, "image/png")
    const declared: DeclaredMedia[] = [{ storageId, kind: "image", mimeType: "image/png", sizeBytes: PNG.length }]
    await verify(t, lynda.personId, root, declared)
    expect(engineErrorCode(await caught(verify(t, paul.personId, root, declared)))).toBe("notFound")
    expect(engineErrorCode(await caught(verify(t, lynda.personId, root, declared)))).toBe("conflict")
  })

  it("le DTO distingue l'indisponibilité de l'analyse d'une quarantaine et retient toujours l'URL", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const { root, enter } = await setup(t)
    const lynda = await enter("lynda")
    const storageId = await store(t, PNG, "image/png")
    const media = await verify(t, lynda.personId, root, [{ storageId, kind: "image", mimeType: "image/png", sizeBytes: PNG.length }])
    const scanId = await t.run(async (ctx) => (await ctx.db.query("fileScans").withIndex("by_storageId", (q) => q.eq("storageId", storageId)).unique())!._id)
    for (const status of ["error", "suspicious", "infected"] as const) {
      await t.run(async (ctx) => ctx.db.patch(scanId, { status }))
      const [dto] = await t.run(async (ctx) => resolvePostMediaDtos(ctx, media))
      expect(dto).toEqual({ url: null, withheld: status === "error" ? "fileScanUnavailable" : "fileQuarantined", kind: "image", mimeType: "image/png" })
    }
  })

  it("une déclaration qui ment ou un type hors politique est refusé, avec sa règle", async () => {
    const t = testConvex()
    const { root, enter } = await setup(t)
    const lynda = await enter("lynda")
    const lying = await store(t, PNG, "image/png")
    expect(engineErrorRule(await caught(verify(t, lynda.personId, root, [{ storageId: lying, kind: "image", mimeType: "image/png", sizeBytes: 999 }])))?.rule).toBe("UPLOAD_MISMATCH")
    const pdf = await store(t, new TextEncoder().encode("%PDF-1.4"), "application/pdf")
    expect(engineErrorRule(await caught(verify(t, lynda.personId, root, [{ storageId: pdf, kind: "image", mimeType: "application/pdf", sizeBytes: 8 }])))?.rule).toBe("UPLOAD_TYPE_NOT_ALLOWED")
  })

  it("sans média, rien à résoudre", async () => {
    const t = testConvex()
    expect(await t.run(async (ctx) => resolvePostMediaDtos(ctx, undefined))).toEqual([])
  })
})
