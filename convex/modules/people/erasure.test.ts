// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api, components, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { testConvex } from "../../test.setup"
import { dataTableNames, directlyOwned, exportableRecord, referencesIn, shapeFor, unclassifiedDataTables } from "./dataInventory"
import { ERASURE_GRACE_MS } from "./erasure"

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())
async function fixture() {
  const t = testConvex(), now = Date.now()
  const user: unknown = await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "Recette", email: "erasure-recette@example.test", emailVerified: true, createdAt: now, updatedAt: now } } })
  if (!user || typeof user !== "object" || !("_id" in user) || typeof user._id !== "string") throw new Error("Missing test user")
  const authUserId = user._id
  const as = t.withIdentity({ subject: authUserId })
  const personId = await t.run((ctx) => ctx.db.insert("persons", { authUserId, handle: "erasure.recette", displayName: "Recette", createdAt: now, updatedAt: now, publishedAt: now }))
  const other = await t.run((ctx) => ctx.db.insert("persons", { authUserId: "other-fixture", handle: "other.recette", displayName: "Other", createdAt: now, updatedAt: now, publishedAt: now }))
  const networkId = await t.run((ctx) => ctx.db.insert("networks", { slug: "erase-root", name: "Root", kind: "root", status: "active", membershipPolicy: "open", defaultVisibility: "network", reachValues: [], theme: "antsia", createdAt: now, updatedAt: now }))
  await t.run(async (ctx) => {
    for (const id of [personId, other]) await ctx.db.insert("networkMemberships", { networkId, personId: id, status: "verifiee", role: "member", joinedAt: now, statusChangedAt: now })
  })
  return { t, as, personId, other, networkId, now }
}

describe("PA5 — inventaire des données", () => {
  it("classe toutes les tables du schéma réel, y compris les tranches et preuves PA4", () => {
    expect(unclassifiedDataTables()).toEqual([])
    expect(dataTableNames()).toContain("idnProofs")
    expect(dataTableNames()).toContain("consularAttestations")
  })
  it("dérive les références obligatoires, facultatives et imbriquées", () => {
    const row = { authorPersonId: "person", media: [{ storageId: "blob" }], mentionedPersonIds: ["other"] }
    expect(referencesIn(row, shapeFor("posts"))).toEqual(expect.arrayContaining([{ table: "persons", id: "person" }, { table: "persons", id: "other" }, { table: "_storage", id: "blob" }]))
  })
  it("une mention seule ne rend pas la publication d'autrui propriété de la personne", () => {
    expect(directlyOwned("posts", { _id: "post", _creationTime: 1, authorPersonId: "other", mentionedPersonIds: ["person"] }, "person")).toBe(false)
  })
  it("l'export ne donne aucun contenu par une mention, un geste administratif ou un aperçu partagé", () => {
    const metadata = { _id: "row", _creationTime: 1 }
    expect(exportableRecord("posts", { ...metadata, authorPersonId: "other", mentionedPersonIds: ["person"], body: "Private other" }, "person")).toBeNull()
    expect(exportableRecord("pageSignatories", { ...metadata, personId: "other", grantedByPersonId: "person" }, "person")).toBeNull()
    expect(exportableRecord("personalThreads", { ...metadata, personLow: "person", personHigh: "other", lastMessageText: "Private other" }, "person")).not.toHaveProperty("lastMessageText")
    expect(exportableRecord("reports", { ...metadata, ownerPersonId: "person", reporterPersonId: "other", note: "Private reporter", decisionReason: "Motif" }, "person")).toEqual(expect.objectContaining({ decisionReason: "Motif" }))
    expect(exportableRecord("reports", { ...metadata, ownerPersonId: "person", reporterPersonId: "other", note: "Private reporter" }, "person")).not.toHaveProperty("note")
    expect(exportableRecord("pushSubscriptions", { ...metadata, personId: "person", credential: { endpoint: "secret", keys: { auth: "secret" } }, token: "secret" }, "person")).not.toHaveProperty("credential")
    const copy = exportableRecord("personalMessages", { ...metadata, senderPersonId: "person", content: "Private other original", attachmentFiles: [{ storageId: "other-blob" }], forwardedFrom: { messageId: "other-original" } }, "person")
    expect(copy).not.toHaveProperty("content")
    expect(copy).not.toHaveProperty("attachmentFiles")
    expect(copy).not.toHaveProperty("forwardedFrom")
    const incoming = { ...metadata, personIdLow: "person", personIdHigh: "other", status: "blocked", blockedByPersonId: "other" }
    expect(exportableRecord("connections", incoming, "person")).toBeNull()
    expect(exportableRecord("connections", { ...incoming, blockedByPersonId: "person" }, "person")).not.toBeNull()
    const intention = { ...metadata, blockerPersonId: "other", targetPersonId: "person" }
    expect(exportableRecord("personBlocks", intention, "person")).toBeNull()
    expect(exportableRecord("personBlocks", { ...intention, blockerPersonId: "person", targetPersonId: "other" }, "person")).not.toBeNull()
    expect(directlyOwned("personBlocks", intention, "person")).toBe(true)
  })
  it("IC-02 : un message vocal s'exporte à ses deux parties, sans blob ; l'état d'écoute au destinataire seul", () => {
    const voicemail = { _id: "vm", _creationTime: 1, networkId: "network", recipientPersonId: "person", fromPersonId: "other", callId: "call", audioStorageId: "blob", durationMs: 15_000, isRead: true, readAt: 2, createdAt: 1 }
    expect(exportableRecord("voicemails", voicemail, "person")).toEqual({ _id: "vm", _creationTime: 1, networkId: "network", recipientPersonId: "person", fromPersonId: "other", callId: "call", durationMs: 15_000, isRead: true, readAt: 2, createdAt: 1 })
    const sent = exportableRecord("voicemails", voicemail, "other")
    expect(sent).toEqual(expect.objectContaining({ _id: "vm", fromPersonId: "other", durationMs: 15_000 }))
    for (const field of ["isRead", "readAt", "audioStorageId"]) expect(sent).not.toHaveProperty(field)
    expect(exportableRecord("voicemails", voicemail, "third")).toBeNull()
    expect(directlyOwned("voicemails", voicemail, "person")).toBe(true)
    expect(directlyOwned("voicemails", voicemail, "other")).toBe(true)
  })

})

describe("PA5 — droits personnels", () => {
  it("demande confirmée, répétition idempotente, annulation pendant le délai", async () => {
    const { t, as, personId } = await fixture()
    const first = await as.mutation(api.modules.people.erasure.requestErasure, { confirmation: "DELETE_MY_ANTSIA_ACCOUNT" })
    expect(first.dueAt).toBe(Date.now() + ERASURE_GRACE_MS)
    expect(await as.mutation(api.modules.people.erasure.requestErasure, { confirmation: "DELETE_MY_ANTSIA_ACCOUNT" })).toEqual(first)
    await as.mutation(api.modules.people.erasure.cancelErasure, {})
    expect(await as.query(api.modules.people.erasure.myErasure, {})).toBeNull()
    expect((await t.run((ctx) => ctx.db.get(personId)))?.deletionRequestedAt).toBeUndefined()
  })
  it("aucune purge avant l'échéance et aucune annulation après", async () => {
    const { t, as, personId } = await fixture()
    await as.mutation(api.modules.people.erasure.requestErasure, { confirmation: "DELETE_MY_ANTSIA_ACCOUNT" })
    const job = await t.run((ctx) => ctx.db.query("dataErasureJobs").first())
    await t.mutation(internal.modules.people.erasure.continueErasure, { jobId: job!._id })
    expect(await t.run((ctx) => ctx.db.get(personId))).not.toBeNull()
    vi.setSystemTime(Date.now() + ERASURE_GRACE_MS)
    await expect(as.mutation(api.modules.people.erasure.cancelErasure, {})).rejects.toThrow()
  })
  it("export paginé ne rend ni contacts/jetons ni données d'autrui ; session relue", async () => {
    const { t, as, personId, other } = await fixture()
    const result = await as.mutation(api.modules.people.erasure.exportMyData, {})
    const index = dataTableNames().indexOf("persons")
    const page = await as.query(api.modules.people.erasure.exportMyDataPage, { exportId: result.exportId, tableIndex: index, cursor: null })
    expect(JSON.parse(page.json)).toEqual([expect.objectContaining({ _id: personId })])
    expect(page.json).not.toContain("authUserId")
    await expect(t.withIdentity({ subject: "other-fixture" }).query(api.modules.people.erasure.exportMyDataPage, { exportId: result.exportId, tableIndex: index, cursor: null })).rejects.toThrow()
    expect(await t.run((ctx) => ctx.db.get(other))).not.toBeNull()
  })
  it("R9 purge contenus, blobs, copies, preuves, relations et sessions, avec références anonymes préservées", async () => {
    const { t, as, personId, other, networkId, now } = await fixture()
    await as.query(api.modules.people.persons.getMyPerson, {})
    const session = await t.query(components.betterAuth.adapter.findMany, { model: "session", where: [{ field: "userId", value: (await t.run((ctx) => ctx.db.get(personId)))!.authUserId }], paginationOpts: { cursor: null, numItems: 20 } })
    // Plus d’une page : un curseur oublié ne pourrait jamais atteindre la trace personnelle finale.
    for (let n = 0; n < 25; n++) await t.mutation(components.betterAuth.adapter.create, { input: { model: "verification", data: { identifier: `other-${n}`, value: "unrelated", expiresAt: now + 1000, createdAt: now, updatedAt: now } } })
    for (const data of [{ identifier: "sign-in-otp-erasure-recette@example.test", value: "fictional-otp" }, { identifier: "one-time-token:fictional", value: session.page[0]!.token }]) await t.mutation(components.betterAuth.adapter.create, { input: { model: "verification", data: { ...data, expiresAt: now + 1000, createdAt: now, updatedAt: now } } })
    const blob = await t.run((ctx) => ctx.storage.store(new Blob(["fictional"])))
    const voicemailBlob = await t.run((ctx) => ctx.storage.store(new Blob(["fictional voicemail"])))
    let original!: Id<"personalMessages">, copied!: Id<"personalMessages">, post!: Id<"posts">, threadId!: Id<"personalThreads">, voicemail!: Id<"voicemails">
    await t.run(async (ctx) => {
      post = await ctx.db.insert("posts", { networkId, authorPersonId: personId, body: "Private original", audience: "public", visibility: "network", status: "published", searchText: "private original", publishedAt: now, createdAt: now, updatedAt: now })
      await ctx.db.insert("postComments", { networkId, postId: post, authorPersonId: other, body: "Other reply", status: "published", createdAt: now, updatedAt: now })
      await ctx.db.insert("fileScans", { storageId: blob, networkId, uploadedByPersonId: personId, source: "profile", status: "clean", attempts: 1, createdAt: now, updatedAt: now })
      await ctx.db.patch(personId, { avatarStorageId: blob })
      await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: "fictional-idn-sub", loa: 2, linkedAt: now })
      await ctx.db.insert("idnProofs", { subject: "fictional-idn-sub", loa: 2, observedAt: now })
      const thread = await ctx.db.insert("personalThreads", { networkId, personLow: personId, personHigh: other, initiatedByPersonId: personId, status: "active", lastMessageAt: now, createdAt: now })
      threadId = thread
      original = await ctx.db.insert("personalMessages", { networkId, threadId: thread, senderPersonId: personId, content: "Copied private data", createdAt: now })
      copied = await ctx.db.insert("personalMessages", { networkId, threadId: thread, senderPersonId: other, content: "Copied private data", forwardedFrom: { kind: "personal", threadId: thread, messageId: original }, createdAt: now })
      await ctx.db.patch(thread, { lastMessageAt: now, lastMessageByPersonId: other, lastMessageText: "Copied private data", lastMessageKind: "text" })
      // IC-02 : un message vocal REÇU d'autrui part avec son destinataire, enregistrement compris.
      const callId = await ctx.db.insert("calls", { networkId, kind: "direct", status: "ended", callStatus: "missed", roomName: "erasure-room", createdByPersonId: other, calleePersonId: personId, mediaType: "audio", maxParticipants: 2, startedAt: now, endedAt: now })
      voicemail = await ctx.db.insert("voicemails", { networkId, recipientPersonId: personId, fromPersonId: other, callId, audioStorageId: voicemailBlob, durationMs: 15_000, isRead: false, createdAt: now })
    })
    await as.mutation(api.modules.people.erasure.requestErasure, { confirmation: "DELETE_MY_ANTSIA_ACCOUNT" })
    const job = await t.run((ctx) => ctx.db.query("dataErasureJobs").first())
    vi.setSystemTime(Date.now() + ERASURE_GRACE_MS + 1)
    await t.mutation(internal.modules.people.erasure.continueErasure, { jobId: job!._id })
    // Le harnais termine 100 continuations par défaut ; l’inventaire complet traverse plus de tables.
    for (let step = 0; step < 1500 && await t.run((ctx) => ctx.db.get(job!._id)); step++) {
      vi.runAllTimers()
      await t.finishInProgressScheduledFunctions()
    }
    expect(await t.run((ctx) => ctx.db.get(personId))).toBeNull()
    expect(await t.run((ctx) => ctx.db.get(post))).toBeNull()
    expect(await t.run((ctx) => ctx.db.get(original))).toBeNull()
    const copy = await t.run((ctx) => ctx.db.get(copied))
    expect((await t.run((ctx) => ctx.db.get(threadId)))?.lastMessageText).toBeUndefined()
    expect(copy?.content).toBeUndefined()
    expect(copy?.deletedAt).toBeDefined()
    expect(await t.run((ctx) => ctx.db.system.get("_storage", blob))).toBeNull()
    expect(await t.run((ctx) => ctx.db.get(voicemail))).toBeNull()
    expect(await t.run((ctx) => ctx.db.system.get("_storage", voicemailBlob))).toBeNull()
    expect(await t.run((ctx) => ctx.db.query("idnProofs").first())).toBeNull()
    expect((await t.query(components.betterAuth.adapter.findMany, { model: "verification", where: [{ field: "identifier", value: "sign-in-otp-erasure-recette@example.test" }], paginationOpts: { cursor: null, numItems: 20 } })).page).toEqual([])
    expect((await t.query(components.betterAuth.adapter.findMany, { model: "verification", where: [{ field: "identifier", value: "one-time-token:fictional" }], paginationOpts: { cursor: null, numItems: 20 } })).page).toEqual([])
    expect((await t.query(components.betterAuth.adapter.findMany, { model: "verification", paginationOpts: { cursor: null, numItems: 30 } })).page).toHaveLength(25)
    expect(await t.run((ctx) => ctx.db.query("dataErasureJobs").first())).toBeNull()
    expect(await t.run((ctx) => ctx.db.query("dataErasureTargets").first())).toBeNull()
    expect(await t.run((ctx) => ctx.db.get(other))).not.toBeNull()
    await expect(as.query(api.modules.people.erasure.myErasure, {})).rejects.toThrow()
  }, 20_000)
})
