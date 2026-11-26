// @vitest-environment edge-runtime
/**
 * M3 (25/11/2026) — jusqu'à dix photos par publication.
 *
 * Ce que la borne du domaine entraîne ailleurs dans le moteur :
 * - la modération relit TOUTES les photos d'une publication signalée, pas les
 *   quatre premières (une photo hors de sa vue serait une photo jamais jugée) ;
 * - un membre sans badge serveur (budget de dépôt renforcé) obtient les dix
 *   URL de dépôt d'une publication pleine, avec de quoi réessayer.
 *
 * Personnes et réseaux fictifs (graine des fondations), fichiers fabriqués en test.
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons"> }

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
/** La borne décidée pour M3, écrite en clair : le test ne suit pas la constante qu'il éprouve. */
const TEN = 10

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function seed(t: T): Promise<Id<"networks">> {
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  return root
}

async function enter(t: T, root: Id<"networks">, handle: string, role?: "network_moderator"): Promise<Person> {
  const as = t.withIdentity({ subject: `m3-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  if (role) await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", root).eq("personId", personId)).unique()
    if (row) await ctx.db.patch(row._id, { role })
  })
  return { as, personId }
}

async function tenPhotos(t: T) {
  const media = []
  for (let index = 0; index < TEN; index += 1) {
    const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob([PNG as BlobPart], { type: "image/png" })))
    media.push({ storageId, kind: "image" as const, mimeType: "image/png", sizeBytes: PNG.length, altText: `Vue fictive ${index + 1}` })
  }
  return media
}

describe("M3 — dix photos par publication", () => {
  it("la modération relit les dix photos d'une publication signalée, dans l'ordre", async () => {
    const t = testConvex()
    const root = await seed(t)
    const author = await enter(t, root, "autrice")
    const reporter = await enter(t, root, "declarant")
    const moderator = await enter(t, root, "moderatrice", "network_moderator")
    const media = await tenPhotos(t)
    const { postId } = await author.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Dix vues fictives", media })

    const report = await reporter.as.mutation(api.modules.moderation.cases.report, { networkId: root, target: { kind: "post", id: postId }, reason: "spam" })
    const preview = await moderator.as.query(api.modules.moderation.reviewProjection.preview, { networkId: root, reportId: report.reportId })

    expect(preview).toMatchObject({ kind: "post", available: true })
    expect(preview.media).toHaveLength(TEN)
    expect(preview.media.map((item) => item.altText)).toEqual(media.map((item) => item.altText))
  })

  it("un membre au budget de dépôt renforcé obtient les dix URL d'une publication pleine, et peut encore réessayer", async () => {
    const t = testConvex()
    const root = await seed(t)
    const member = await enter(t, root, "nouvelle")
    for (let index = 0; index < TEN + 2; index += 1) {
      expect(await member.as.mutation(api.modules.media.media.generateUploadUrl, { networkId: root, usage: "media_social" })).toEqual(expect.any(String))
    }
    // Le budget reste borné : la rafale suivante est refusée.
    let refusal: unknown = null
    try {
      await member.as.mutation(api.modules.media.media.generateUploadUrl, { networkId: root, usage: "media_social" })
    } catch (error) {
      refusal = error
    }
    expect(engineErrorCode(refusal)).toBe("rateLimited")
  })
})
