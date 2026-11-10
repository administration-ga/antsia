// @vitest-environment edge-runtime
/** DG-023 : vraie écriture collective, dépôts gardés, audience vivante et curseurs natifs. */
import { engineErrorAppRule, engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { type DeclaredMedia } from "../media/media"
import { restoreTarget } from "../moderation/targets"
import { mentionCanSeePost } from "../posts/postWrite"
import { canReadPageEventGalleryPost } from "./pageEventGalleryAccess"

type T = ReturnType<typeof testConvex>
const G = api.modules.events.pageEventGallery
const E = api.modules.events.pageEvents
const P = api.modules.posts.posts
const C = api.modules.engagement.engagement
const A = api.modules.diaspora.associations
const NOW = Date.UTC(2026, 9, 18, 10)
const HOUR = 3_600_000
const START = NOW + 2 * HOUR
const END = NOW + 4 * HOUR
const FIRST = { numItems: 20, cursor: null }

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

async function member(t: T, networkId: Id<"networks">, handle: string, displayName: string) {
  const as = t.withIdentity({ subject: `gallery-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName })
  await t.run((ctx) => ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `gallery-idn-${personId}`, loa: 2, nationality: "GA", linkedAt: NOW }))
  await as.mutation(api.modules.diaspora.membership.joinDiasporale, { networkId, facet: { countryOfResidence: "FR", city: "Lyon" } })
  return { as, personId }
}

async function fixture(postPolicy = true) {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  const manager = await member(t, networkId, "gallery-equipe", "Awa OGOOUÉ")
  const successor = await member(t, networkId, "gallery-relais", "Éloïse NDONG MBA")
  const alice = await member(t, networkId, "gallery-alice", "Alice NDONG")
  const outsider = await member(t, networkId, "gallery-tiers", "Jean MBA")
  const { pageId, signatureId } = await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", { networkId, handle: "association-galerie", name: "Association de recette", ownerKind: "association", trust: "community", trustRank: 0, visibility: "network", onRoot: false, status: "active", searchText: "association recette", createdAt: NOW, updatedAt: NOW })
    const signatureId = await ctx.db.insert("pageSignatories", { networkId, pageId, personId: manager.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId, pageId, personId: successor.personId, role: "signatory", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("moderationPolicies", { networkId, surface: "event", preReview: false, maxLinks: 2, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    if (postPolicy) await ctx.db.insert("moderationPolicies", { networkId, surface: "post", preReview: false, maxLinks: 2, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    return { pageId, signatureId }
  })
  const membership = await alice.as.mutation(A.requestAssociationMembership, { networkId, pageId })
  await manager.as.mutation(A.decideAssociationMembership, { networkId, membershipId: membership.membershipId, expectedVersion: membership.version, decision: "accept" })
  return { t, root, networkId, pageId, signatureId, membershipId: membership.membershipId, manager, successor, alice, outsider }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

function eventInput(f: Fixture) {
  return { networkId: f.networkId, pageId: f.pageId, title: "Rencontre associative", description: "Échange entre membres.", location: "Lyon", startAt: START, endAt: END, timeZone: "Europe/Paris", audience: "association" as const }
}
function create(f: Fixture, audience: "association" | "network" = "association", key = "gallery-event") {
  return f.manager.as.mutation(E.create, { ...eventInput(f), audience, idempotencyKey: key })
}
function get(f: Fixture, eventId: Id<"events">, who = f.alice, refreshKey?: number) {
  return who.as.query(G.get, { networkId: f.networkId, eventId, expectedReaderPersonId: who.personId, ...(refreshKey === undefined ? {} : { refreshKey }) })
}
function list(f: Fixture, eventId: Id<"events">, who = f.alice, paginationOpts: { numItems: number; cursor: string | null } = FIRST) {
  return who.as.query(G.list, { networkId: f.networkId, eventId, expectedReaderPersonId: who.personId, paginationOpts })
}
function publish(f: Fixture, eventId: Id<"events">, media: DeclaredMedia[], body = "Souvenir collectif", key = "gallery-post", who = f.manager) {
  return who.as.mutation(G.publish, { networkId: f.networkId, eventId, body, media, idempotencyKey: key })
}
function remove(f: Fixture, eventId: Id<"events">, postId: Id<"posts">, who = f.manager) {
  return who.as.mutation(G.remove, { networkId: f.networkId, eventId, postId })
}
async function image(f: Fixture, kind: "image" | "video" = "image"): Promise<DeclaredMedia> {
  const mimeType = kind === "image" ? "image/png" : "video/mp4"
  const storageId = await f.t.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob([new Uint8Array(64)], { type: mimeType }))
    await (ctx.db as unknown as { patch: (table: "_storage", id: Id<"_storage">, value: { contentType: string }) => Promise<void> }).patch("_storage", id, { contentType: mimeType })
    return id
  })
  return { storageId, kind, mimeType, sizeBytes: 64, width: 4, height: 3, altText: " Un souvenir ", ...(kind === "video" ? { durationMs: 5_000 } : {}) }
}
async function caught(promise: Promise<unknown>): Promise<unknown> {
  try { await promise } catch (error) { return error }
  return null
}
async function refusal(promise: Promise<unknown>) {
  const error = await caught(promise)
  return engineErrorAppRule(error)?.appRule ?? engineErrorCode(error)
}
async function moderate(f: Fixture, kind: "post" | "event" | "page", id: string, status: "pending_review" | "removed") {
  await f.t.run(async (ctx) => {
    const state = await ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", kind).eq("targetId", id)).unique()
    if (state) await ctx.db.patch(state._id, { status })
    else await ctx.db.insert("moderationContentStates", { networkId: f.networkId, targetKind: kind, targetId: id, ownerPageId: f.pageId, status, createdAt: NOW, updatedAt: NOW })
  })
}

describe("galerie collective après un événement", () => {
  it("s'ouvre exactement à la fin ; refreshKey ne donne aucune autorité temporelle", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    const media = await image(f)
    vi.setSystemTime(END - 1)
    expect(await get(f, eventId, f.manager, END + HOUR)).toEqual({ eventId, available: false, canPublish: false, audience: "association" })
    expect(await get(f, eventId, f.manager, Number.POSITIVE_INFINITY)).toMatchObject({ available: false })
    expect(await refusal(list(f, eventId))).toBe("association_event_gallery_not_open")
    expect(await refusal(publish(f, eventId, [media]))).toBe("association_event_gallery_not_open")
    expect(await f.t.run((ctx) => ctx.db.query("fileScans").withIndex("by_storageId", (q) => q.eq("storageId", media.storageId)).first())).toBeNull()
    vi.setSystemTime(END)
    expect(await get(f, eventId, f.manager, END)).toMatchObject({ available: true, canPublish: true })
    expect(await get(f, eventId)).toMatchObject({ available: true, canPublish: false })
    expect((await list(f, eventId)).items).toEqual([])
    expect(await f.t.run((ctx) => ctx.db.query("eventParticipants").withIndex("by_event_person", (q) => q.eq("eventId", eventId)).first())).toBeNull()
  })

  it("dépose sous la page sans propriétaire personnel, avec médias retenus et projection standard gardée", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    const media = await image(f)
    vi.setSystemTime(END)
    const { postId } = await publish(f, eventId, [media], "Souvenir @gallery-tiers")
    const stored = await f.t.run((ctx) => ctx.db.get(postId))
    expect(stored).toMatchObject({ networkId: f.networkId, pageId: f.pageId, pageEventGalleryId: eventId, audience: "public", visibility: "network", onRoot: false, reach: "diaspora" })
    for (const key of ["authorPersonId", "eventId", "sharedPostId", "groupId", "country", "mentionedPersonIds"] as const) expect(stored?.[key]).toBeUndefined()
    const state = await f.t.run((ctx) => ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", "post").eq("targetId", postId)).unique())
    expect(state).toMatchObject({ ownerPageId: f.pageId, status: "published" })
    expect(state?.ownerPersonId).toBeUndefined()
    const result = await list(f, eventId)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ canRemove: false, post: { _id: postId, eventGalleryId: eventId, isMine: false, author: { personId: null, displayName: null, handle: null }, page: { pageId: f.pageId }, media: [{ url: null, withheld: "fileScanPending", kind: "image", altText: "Un souvenir" }] } })
    for (const privateValue of [f.manager.personId, media.storageId]) expect(JSON.stringify(result)).not.toContain(privateValue)
    expect((await list(f, eventId, f.successor)).items[0]?.canRemove).toBe(true)
    expect(await refusal(f.outsider.as.query(P.getPost, { networkId: f.networkId, postId }))).toBe("notFound")
    expect(await refusal(f.alice.as.query(P.getPost, { networkId: f.root, postId }))).toBe("notFound")
    expect(await f.t.run((ctx) => mentionCanSeePost(ctx, stored!, f.outsider.personId))).toBe(false)
    const notifications = await f.t.run((ctx) => ctx.db.query("notifications").withIndex("by_network_recipient_createdAt", (q) => q.eq("networkId", f.networkId).eq("recipientPersonId", f.outsider.personId)).take(20))
    expect(notifications.filter((row) => row.kind === "mention" || row.kind === "page_post")).toEqual([])
  })

  it("rejoue le même contenu normalisé sous un autre signataire sans réadmettre le fichier", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    const other = await create(f, "association", "another-gallery")
    const media = await image(f), otherMedia = await image(f)
    vi.setSystemTime(END)
    const [first, concurrent] = await Promise.all([
      publish(f, eventId, [media], "  Souvenir collectif  ", "  collective-key  "),
      publish(f, eventId, [{ ...media, altText: "Un souvenir" }], "Souvenir collectif", "collective-key", f.successor),
    ])
    expect(first.postId).toBe(concurrent.postId)
    expect([first.created, concurrent.created].sort()).toEqual([false, true])
    expect(await publish(f, eventId, [{ ...media, altText: "Un souvenir" }], "Souvenir collectif", "collective-key", f.successor)).toEqual({ postId: first.postId, created: false })
    expect((await publish(f, other.eventId, [otherMedia], "Souvenir collectif", "collective-key")).postId).not.toBe(first.postId)
    expect(await refusal(publish(f, eventId, [media], "Un autre corps", "collective-key"))).toBe("conflict")
    expect(await refusal(publish(f, eventId, [{ ...media, width: 8 }], "Souvenir collectif", "collective-key"))).toBe("conflict")
    expect(await refusal(publish(f, eventId, [media], "Souvenir collectif", "different-key"))).toBe("conflict")
    const posts = await f.t.run((ctx) => ctx.db.query("posts").withIndex("by_network_eventGallery_key", (q) => q.eq("networkId", f.networkId).eq("pageEventGalleryId", eventId).eq("idempotencyKey", "collective-key")).take(3))
    expect(posts).toHaveLength(1)
    expect(await refusal(publish(f, eventId, [media], "Souvenir collectif", "collective-key", f.alice))).toBe("notFound")
    await f.t.run((ctx) => ctx.db.patch(f.signatureId, { acceptedAt: undefined }))
    expect(await refusal(publish(f, eventId, [media], "Souvenir collectif", "collective-key"))).toBe("notFound")
  })

  it("valide les médias avant fraîcheur et annule toute admission si un dépôt du lot échoue", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    const media = await image(f), other = await image(f), video = await image(f, "video")
    vi.setSystemTime(END)
    expect(await refusal(publish(f, eventId, []))).toBe("association_event_gallery_media_required")
    const tooMany = await caught(publish(f, eventId, [media, media, media, media, media]))
    expect(engineErrorRule(tooMany)?.rule).toBe("POST_MEDIA_TOO_MANY")
    expect(engineErrorRule(await caught(publish(f, eventId, [video, media])))?.rule).toBe("POST_VIDEO_MUST_BE_ALONE")
    expect(await refusal(publish(f, eventId, [media, { ...other, sizeBytes: 65 }]))).not.toBeNull()
    for (const item of [media, other, video]) expect(await f.t.run((ctx) => ctx.db.query("fileScans").withIndex("by_storageId", (q) => q.eq("storageId", item.storageId)).first())).toBeNull()
    expect((await list(f, eventId)).items).toEqual([])
    await publish(f, eventId, [media], "", "image")
    // Le même fichier déjà admis ne masque pas un refus de forme déterministe.
    expect(engineErrorRule(await caught(publish(f, eventId, [media, other, other, other, other], "", "invalid-shape")))?.rule).toBe("POST_MEDIA_TOO_MANY")
    await publish(f, eventId, [video], "", "video")
    const four = await Promise.all([image(f), image(f), image(f), image(f)])
    await publish(f, eventId, four, "", "four-images")
    expect((await list(f, eventId)).items).toHaveLength(3)
  })

  it("SD-03 — une vidéo de galerie suit les bornes d'une publication, jugées AVANT toute admission", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    const video = await image(f, "video")
    vi.setSystemTime(END)
    expect(engineErrorRule(await caught(publish(f, eventId, [{ ...video, mimeType: "video/quicktime" }], "", "mov")))?.rule).toBe("POST_MEDIA_MIME_INVALID")
    expect(engineErrorRule(await caught(publish(f, eventId, [{ ...video, durationMs: 5 * 60_000 + 1 }], "", "long")))).toEqual({ rule: "POST_VIDEO_TOO_LONG", params: { maxMinutes: 5 } })
    expect(await f.t.run((ctx) => ctx.db.query("fileScans").withIndex("by_storageId", (q) => q.eq("storageId", video.storageId)).first())).toBeNull()
    expect((await publish(f, eventId, [{ ...video, durationMs: 5 * 60_000 }], "", "bound")).created).toBe(true)
  })

  it("ne confond pas reçu de création et accord de modération explicite", async () => {
    const f = await fixture(false)
    const { eventId } = await create(f)
    vi.setSystemTime(END)
    const { postId } = await publish(f, eventId, [await image(f)])
    const state = await f.t.run((ctx) => ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", "post").eq("targetId", postId)).unique())
    expect(state?.status).toBe("pending_review")
    expect((await list(f, eventId)).items).toEqual([])
    await f.t.run(async (ctx) => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.networkId).eq("personId", f.manager.personId)).unique()
      if (!membership) throw new Error("Adhésion réseau absente")
      await ctx.db.patch(membership._id, { role: "network_admin" })
    })
    expect((await list(f, eventId, f.manager)).items).toEqual([])
    await f.t.run((ctx) => restoreTarget(ctx, { networkId: f.networkId, target: { kind: "post", id: postId } }))
    expect((await list(f, eventId)).items.map((item) => item.post._id)).toEqual([postId])
  })

  it("garde le curseur brut d'une page entièrement filtrée et reprend à la suivante", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    vi.setSystemTime(END)
    const visible = await publish(f, eventId, [await image(f)], "Visible", "first")
    vi.setSystemTime(END + 1)
    const hidden = await publish(f, eventId, [await image(f)], "Ne doit pas être projeté", "second")
    await f.t.run((ctx) => ctx.db.patch(hidden.postId, { pageId: undefined }))
    const first = await list(f, eventId, f.alice, { numItems: 1, cursor: null })
    expect(first.items).toEqual([])
    expect(first.isDone).toBe(false)
    expect(first.continueCursor).not.toBeNull()
    const next = await list(f, eventId, f.alice, { numItems: 1, cursor: first.continueCursor })
    expect(next.items.map((item) => item.post._id)).toEqual([visible.postId])
    expect((await list(f, eventId, f.alice, { numItems: Number.POSITIVE_INFINITY, cursor: null })).items).toHaveLength(1)
    expect(await refusal(f.manager.as.query(G.list, { networkId: f.networkId, eventId, expectedReaderPersonId: f.alice.personId, paginationOpts: FIRST }))).toBe("notFound")
    expect(await refusal(f.manager.as.query(G.get, { networkId: f.networkId, eventId, expectedReaderPersonId: f.alice.personId }))).toBe("notFound")
  })

  it("permet de lire en attente sans présence ni pouvoir de publier et ferme les partages/commentaires au tiers", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    vi.setSystemTime(END)
    const { postId } = await publish(f, eventId, [await image(f)])
    expect(await refusal(f.outsider.as.mutation(P.publish, { networkId: f.networkId, sharedPostId: postId, body: "Un partage", reach: "diaspora" }))).toBe("notFound")
    expect(await refusal(f.outsider.as.mutation(C.comment, { networkId: f.networkId, postId, body: "Un commentaire" }))).toBe("notFound")
    const shared = await f.alice.as.mutation(P.publish, { networkId: f.networkId, sharedPostId: postId, body: "Un partage", reach: "diaspora" })
    expect((await f.outsider.as.query(P.getPost, { networkId: f.networkId, postId: shared.postId })).share).toEqual({ available: false })
    await f.alice.as.mutation(C.comment, { networkId: f.networkId, postId, body: "Une réponse pour @gallery-tiers" })
    const notices = await f.t.run((ctx) => ctx.db.query("notifications").withIndex("by_network_recipient_createdAt", (q) => q.eq("networkId", f.networkId).eq("recipientPersonId", f.outsider.personId)).take(20))
    expect(notices.filter((row) => row.kind === "mention" && row.subjectPostId === postId)).toEqual([])
    await f.t.run(async (ctx) => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.networkId).eq("personId", f.alice.personId)).unique()
      if (!membership) throw new Error("Adhésion réseau absente")
      await ctx.db.patch(membership._id, { status: "en_attente" })
    })
    expect(await get(f, eventId)).toMatchObject({ available: true, canPublish: false })
    expect((await list(f, eventId)).items).toHaveLength(1)
    await f.t.run((ctx) => ctx.db.patch(f.membershipId, { status: "removed", statusChangedAt: END }))
    expect(await get(f, eventId)).toBeNull()
    expect(await refusal(f.alice.as.query(P.getPost, { networkId: f.networkId, postId }))).toBe("notFound")
  })

  it("conserve l'audience actuelle de l'événement et ne donne aucune exception d'auteur/page/racine", async () => {
    const f = await fixture()
    const { eventId } = await create(f, "network")
    vi.setSystemTime(END)
    const { postId } = await publish(f, eventId, [await image(f)])
    expect((await list(f, eventId, f.outsider)).items).toHaveLength(1)
    await f.manager.as.mutation(E.update, { ...eventInput(f), eventId, expectedVersion: 1, audience: "association" })
    expect(await get(f, eventId, f.outsider)).toBeNull()
    expect(await refusal(f.outsider.as.query(P.getPost, { networkId: f.networkId, postId }))).toBe("notFound")
    const stored = await f.t.run((ctx) => ctx.db.get(postId))
    const networkId = f.networkId
    expect(await f.t.run((ctx) => canReadPageEventGalleryPost(ctx, { ...stored!, visibility: "root", onRoot: true }, f.alice.personId, f.root))).toBe(false)
    expect(await f.t.run((ctx) => canReadPageEventGalleryPost(ctx, { ...stored!, onRoot: true }, f.alice.personId, networkId))).toBe(false)
    expect(await f.t.run((ctx) => canReadPageEventGalleryPost(ctx, { networkId }, f.outsider.personId, f.root))).toBe(true)
    await f.t.run((ctx) => ctx.db.patch(f.signatureId, { acceptedAt: undefined }))
    expect(await refusal(f.manager.as.query(P.getPost, { networkId, postId }))).toBe("notFound")
    expect(await refusal(remove(f, eventId, postId))).toBe("notFound")
    await remove(f, eventId, postId, f.successor)
  })

  for (const lost of ["cancelled", "event_pending", "event_removed", "page_pending", "page_inactive", "person_erased", "root_suspended"] as const) {
    it(`referme la galerie après ${lost}`, async () => {
      const f = await fixture()
      const { eventId } = await create(f)
      vi.setSystemTime(END)
      const { postId } = await publish(f, eventId, [await image(f)])
      if (lost === "cancelled") await f.manager.as.mutation(E.cancel, { networkId: f.networkId, eventId, expectedVersion: 1 })
      else if (lost === "event_pending") await moderate(f, "event", eventId, "pending_review")
      else if (lost === "event_removed") await moderate(f, "event", eventId, "removed")
      else if (lost === "page_pending") await moderate(f, "page", f.pageId, "pending_review")
      else if (lost === "page_inactive") await f.t.run((ctx) => ctx.db.patch(f.pageId, { status: "inactive" }))
      else if (lost === "person_erased") await f.t.run((ctx) => ctx.db.patch(f.alice.personId, { erasedAt: END }))
      else await f.t.run(async (ctx) => {
        const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.root).eq("personId", f.alice.personId)).unique()
        if (!membership) throw new Error("Adhésion racine absente")
        await ctx.db.patch(membership._id, { status: "suspendue" })
      })
      const stored = await f.t.run((ctx) => ctx.db.get(postId))
      expect(await f.t.run((ctx) => canReadPageEventGalleryPost(ctx, stored!, f.alice.personId, f.networkId))).toBe(false)
      expect(await refusal(list(f, eventId))).not.toBeNull()
      if (lost !== "root_suspended") expect(await get(f, eventId)).toBeNull()
      if (lost === "cancelled") {
        expect(await refusal(publish(f, eventId, [await image(f)], "Annulé", "cancelled"))).toBe("notFound")
        await remove(f, eventId, postId)
        expect((await f.t.run((ctx) => ctx.db.get(postId)))?.status).toBe("removed")
      }
    })
  }

  it("retire un média même retenu par modération, reste idempotent et ne détruit pas le blob", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    const other = await create(f, "association", "other-event")
    const media = await image(f)
    vi.setSystemTime(END)
    const { postId } = await publish(f, eventId, [media])
    expect(await refusal(f.manager.as.mutation(api.modules.pages.pages.removePagePost, { networkId: f.networkId, postId }))).toBe("notFound")
    expect(await refusal(remove(f, other.eventId, postId))).toBe("notFound")
    await moderate(f, "post", postId, "removed")
    await remove(f, eventId, postId)
    const first = await f.t.run((ctx) => ctx.db.get(postId))
    vi.setSystemTime(END + 1)
    await remove(f, eventId, postId)
    expect((await f.t.run((ctx) => ctx.db.get(postId)))?.removedAt).toBe(first?.removedAt)
    expect((await list(f, eventId)).items).toEqual([])
    expect(await f.t.run((ctx) => ctx.db.system.get("_storage", media.storageId))).not.toBeNull()
    expect(await publish(f, eventId, [media])).toEqual({ postId, created: false })
  })

  it("borne les publications et les rejeux par le quota actuel de la personne", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    vi.setSystemTime(END)
    const media = await image(f)
    await publish(f, eventId, [media])
    let code: string | null = null
    for (let index = 0; index < 12 && code === null; index += 1) code = await refusal(publish(f, eventId, [media]))
    expect(code).toBe("rateLimited")
    expect((await list(f, eventId)).items).toHaveLength(1)
  })
})
