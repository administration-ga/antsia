// @vitest-environment edge-runtime
/** U04 : une fenêtre native filtrée n'est pas une fin de fil ; droits et fichiers vivants. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Actor = { as: ReturnType<T["withIdentity"]>; id: Id<"persons"> }
beforeEach(() => vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210"))
afterEach(() => vi.unstubAllEnvs())
async function actor(t: T, root: Id<"networks">, handle: string): Promise<Actor> {
  const as = t.withIdentity({ subject: `media-${handle}` })
  const id = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  return { as, id }
}
async function fixture() {
  const t = testConvex()
  const { root: rootId } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  return { t, rootId, reader: await actor(t, rootId, "reader.media"), author: await actor(t, rootId, "author.media") }
}
async function post(t: T, root: Id<"networks">, author: Actor, input: { kind?: "image" | "video"; at?: number; status?: Doc<"fileScans">["status"]; audience?: Doc<"posts">["audience"]; body?: string; onRoot?: boolean } = {}) {
  return t.run(async ctx => {
    const at = input.at ?? Date.now()
    const media: NonNullable<Doc<"posts">["media"]> = []
    if (input.kind) {
      const type = input.kind === "video" ? "video/mp4" : "image/png"
      const storageId = await ctx.storage.store(new Blob([new Uint8Array([1, 2, 3, 4])], { type }))
      await ctx.db.insert("fileScans", { storageId, status: input.status ?? "clean", source: "post_media", attempts: 1, createdAt: at, updatedAt: at })
      media.push({ storageId, kind: input.kind, mimeType: type, sizeBytes: 4 })
    }
    const body = input.body ?? "Découverte locale"
    return ctx.db.insert("posts", { networkId: root, authorPersonId: author.id, body, media, audience: input.audience ?? "public", visibility: "network", onRoot: input.onRoot ?? true, status: "published", searchText: body, publishedAt: at, createdAt: at, updatedAt: at })
  })
}
const read = (a: Actor, root: Id<"networks">, extra: { kind?: "video" | "media"; authorHandle?: string; query?: string; cursor?: string; numItems?: number } = {}) =>
  a.as.query(api.modules.posts.mediaFeed.paginate, { networkId: root, kind: extra.kind ?? "video", authorHandle: extra.authorHandle, query: extra.query, paginationOpts: { cursor: extra.cursor ?? null, numItems: extra.numItems ?? 18 } })

describe("mediaFeed.paginate", () => {
  it("Clips ne renvoie que des vidéos délivrables ; Explorer accepte aussi les images", async () => {
    const { t, rootId, reader, author } = await fixture()
    const video = await post(t, rootId, author, { kind: "video", at: 10 })
    const image = await post(t, rootId, author, { kind: "image", at: 20 })
    await post(t, rootId, author, { at: 30 })
    await post(t, rootId, author, { kind: "video", at: 40, status: "pending" })
    expect((await read(reader, rootId)).page.map(item => item._id)).toEqual([video])
    expect((await read(reader, rootId, { kind: "media" })).page.map(item => item._id)).toEqual([image, video])
  })
  it("préserve le curseur d'une page brute vide après filtrage", async () => {
    const { t, rootId, reader, author } = await fixture()
    const video = await post(t, rootId, author, { kind: "video", at: 1 })
    await post(t, rootId, author, { at: 2 })
    const first = await read(reader, rootId, { numItems: 1 })
    expect(first.page).toEqual([])
    expect(first.isDone).toBe(false)
    const next = await read(reader, rootId, { numItems: 1, cursor: first.continueCursor })
    expect(next.page.map(item => item._id)).toEqual([video])
  })
  it("réévalue masquage, sourdine et audience privée à chaque lecture", async () => {
    const { t, rootId, reader, author } = await fixture()
    const video = await post(t, rootId, author, { kind: "video" })
    await post(t, rootId, author, { kind: "video", audience: "connections" })
    expect((await read(reader, rootId)).page.map(item => item._id)).toEqual([video])
    const mark = await t.run(ctx => ctx.db.insert("postMarks", { networkId: rootId, personId: reader.id, postId: video, kind: "hidden", createdAt: Date.now() }))
    expect((await read(reader, rootId)).page).toEqual([])
    await t.run(ctx => ctx.db.delete(mark))
    const mute = await t.run(ctx => ctx.db.insert("mutes", { networkId: rootId, personId: reader.id, mutedPersonId: author.id, createdAt: Date.now() }))
    expect((await read(reader, rootId)).page).toEqual([])
    await t.run(ctx => ctx.db.delete(mute))
    expect((await read(reader, rootId)).page).toHaveLength(1)
    await t.run(ctx => ctx.db.patch(video, { status: "removed" }))
    expect((await read(reader, rootId)).page).toEqual([])
  })
  it("filtre la recherche et l'auteur sans exposer une personne introuvable", async () => {
    const { t, rootId, reader, author } = await fixture()
    const video = await post(t, rootId, author, { kind: "video", body: "Été au Gabon" })
    await post(t, rootId, reader, { kind: "video" })
    expect((await read(reader, rootId, { authorHandle: "author.media", query: "ete" })).page.map(item => item._id)).toEqual([video])
    expect((await read(reader, rootId, { authorHandle: "absent.media" })).page).toEqual([])
  })
  it("refuse une session absente et une adhésion révoquée", async () => {
    const { t, rootId, reader } = await fixture()
    await expect(t.query(api.modules.posts.mediaFeed.paginate, { networkId: rootId, kind: "video", paginationOpts: { cursor: null, numItems: 1 } })).rejects.toThrow()
    await t.run(async ctx => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", rootId).eq("personId", reader.id)).unique()
      if (membership) await ctx.db.patch(membership._id, { status: "suspendue" })
    })
    await expect(read(reader, rootId)).rejects.toThrow()
  })

  it("ne révèle aucun curseur ni volume pour un auteur bloqué", async () => {
    const { t, rootId, reader, author } = await fixture()
    for (let i = 0; i < 31; i++) await post(t, rootId, author, { at: i + 1 })
    await reader.as.mutation(api.modules.graph.connections.blockPerson, { networkId: rootId, targetPersonId: author.id })
    const blocked = await read(reader, rootId, { authorHandle: "author.media" })
    expect(blocked).toEqual(await read(reader, rootId, { authorHandle: "absent.media" }))
    expect(blocked).toEqual({ page: [], isDone: true, continueCursor: "" })
  })

  it("ne remonte pas les médias d'un réseau fermé dans la racine", async () => {
    const { t, rootId, reader, author } = await fixture()
    const { testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
    for (const member of [reader, author]) {
      await member.as.mutation(api.modules.people.memberships.joinNetwork, { networkId: testClosed, facet: { values: { countryOfResidence: "FR" }, visibilities: {} } })
      await t.run(async ctx => {
        const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", testClosed).eq("personId", member.id)).unique()
        if (membership) await ctx.db.patch(membership._id, { status: "declaree" })
      })
    }
    const privateVideo = await post(t, testClosed, author, { kind: "video", onRoot: false })
    expect((await read(reader, rootId)).page).toEqual([])
    expect((await read(reader, testClosed)).page.map(item => item._id)).toEqual([privateVideo])
    const outsider = await actor(t, rootId, "outsider.media")
    await expect(read(outsider, testClosed)).rejects.toThrow()
  })

  it("borne le jeton de relecture sans en faire une permission", async () => {
    const { rootId, reader } = await fixture()
    await expect(reader.as.query(api.modules.posts.mediaFeed.paginate, { networkId: rootId, kind: "video", revalidationToken: "x".repeat(129), paginationOpts: { cursor: null, numItems: 1 } })).rejects.toThrow()
  })
})
