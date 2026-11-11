// @vitest-environment edge-runtime
/**
 * DP-F1 (constats LR-01 et LR-02 de l'audit PA10) : l'export et l'effacement d'une personne lisent
 * ses lignes par index. La base de convex-test est gardée : toute requête sans index hors des tables
 * résiduelles nommées échoue, et chaque document rendu par la base est compté. Le même scénario,
 * joué sur une base peuplée des lignes d'AUTRES personnes, doit lire exactement autant.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { testConvex } from "../../test.setup"
import { isResidualScanTable } from "./dataAccess"
import { dataTableNames } from "./dataInventory"
import { ERASURE_GRACE_MS, exportTablePage, socialErasureStep } from "./erasure"

const NOW = Date.UTC(2026, 10, 11, 9)
type Reads = { count: number; queries: number }
type Db = MutationCtx["db"]

function counted(value: unknown, reads: Reads): unknown {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) reads.count += value.length
  else if (typeof value === "object" && "page" in value && Array.isArray(value.page)) reads.count += value.page.length
  else reads.count += 1
  return value
}

/** Requête gardée : `withIndex` obligatoire (sauf table résiduelle), aucun filtre, documents comptés. */
function guardedQuery(query: object, table: string, reads: Reads, indexed: boolean): object {
  return new Proxy(query, {
    get(target, key, receiver) {
      const member: unknown = Reflect.get(target, key, receiver)
      if (typeof member !== "function") return member
      return (...args: unknown[]) => {
        if (key === "withIndex") return guardedQuery(Reflect.apply(member, target, args) as object, table, reads, true)
        if (key === "order") return guardedQuery(Reflect.apply(member, target, args) as object, table, reads, indexed)
        if (key === "filter" || key === "fullTableScan") throw new Error(`Filtre ou balayage interdit : ${table}`)
        if (!indexed && !isResidualScanTable(table)) throw new Error(`Balayage global interdit : ${table}`)
        reads.queries += 1
        const result: unknown = Reflect.apply(member, target, args)
        return result instanceof Promise ? result.then((value) => counted(value, reads)) : result
      }
    },
  })
}

function guardedDb(db: Db, reads: Reads): Db {
  return new Proxy(db, {
    get(target, key, receiver) {
      const member: unknown = Reflect.get(target, key, receiver)
      if (key === "query" && typeof member === "function") return (table: string) => guardedQuery(Reflect.apply(member, target, [table]) as object, table, reads, false)
      if (key === "get" && typeof member === "function") return async (...args: unknown[]) => counted(await Reflect.apply(member, target, args), reads)
      return typeof member === "function" ? member.bind(target) : member
    },
  })
}

type World = Awaited<ReturnType<typeof world>>

/** La personne et ses relations, puis `others` personnes qui n'ont rien à voir avec elle. */
async function world(others: number) {
  const t = testConvex()
  const base = await t.run(async (ctx) => {
    const network = (slug: string, kind: "root" | "closed", parentId?: Id<"networks">) => ctx.db.insert("networks", { slug, name: slug, kind, ...(parentId ? { parentId } : {}), status: "active", membershipPolicy: "open", defaultVisibility: "network", reachValues: [], theme: "antsia", createdAt: NOW, updatedAt: NOW })
    const root = await network("dp-f1-root", "root"), closed = await network("dp-f1-closed", "closed", root)
    const person = (handle: string) => ctx.db.insert("persons", { authUserId: `auth-${handle}`, handle, displayName: handle, createdAt: NOW, updatedAt: NOW, publishedAt: NOW })
    const me = await person("dp.moi"), q = await person("dp.quentin"), r = await person("dp.rose")
    for (const id of [me, q, r]) for (const networkId of [root, closed]) await ctx.db.insert("networkMemberships", { networkId, personId: id, status: "verifiee", role: "member", joinedAt: NOW, statusChangedAt: NOW })
    return { root, closed, me, q, r }
  })
  const ids = await t.run(async (ctx) => {
    const { root, closed, me, q, r } = base
    const post = (authorPersonId: Id<"persons">, networkId: Id<"networks">, body: string) => ctx.db.insert("posts", { networkId, authorPersonId, body, audience: "public", visibility: "network", status: "published", searchText: body, publishedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const myPost = await post(me, root, "Ma publication"), otherPost = await post(q, closed, "Publication de Quentin")
    const commentOnMine = await ctx.db.insert("postComments", { networkId: root, postId: myPost, authorPersonId: q, body: "Réponse de Quentin", status: "published", createdAt: NOW, updatedAt: NOW })
    const myComment = await ctx.db.insert("postComments", { networkId: closed, postId: otherPost, authorPersonId: me, body: "Mon commentaire", status: "published", createdAt: NOW, updatedAt: NOW })
    const reactionOnMine = await ctx.db.insert("postReactions", { networkId: root, postId: myPost, personId: q, kind: "bravo", createdAt: NOW })
    const myReaction = await ctx.db.insert("postReactions", { networkId: closed, postId: otherPost, personId: me, kind: "like", createdAt: NOW })
    const notificationToMe = await ctx.db.insert("notifications", { networkId: root, recipientPersonId: me, actorPersonId: q, kind: "post_comment", subjectPostId: myPost, dedupKey: "dp-f1-1", createdAt: NOW })
    const notificationFromMe = await ctx.db.insert("notifications", { networkId: closed, recipientPersonId: q, actorPersonId: me, kind: "post_reaction", subjectPostId: otherPost, dedupKey: "dp-f1-2", createdAt: NOW })
    const follows = [await ctx.db.insert("follows", { networkId: root, followerPersonId: me, targetPersonId: q, createdAt: NOW }), await ctx.db.insert("follows", { networkId: closed, followerPersonId: q, targetPersonId: me, createdAt: NOW })]
    const [low, high] = [me, q].sort() as [Id<"persons">, Id<"persons">]
    const connection = await ctx.db.insert("connections", { networkId: root, personIdLow: low, personIdHigh: high, requestedByPersonId: me, recipientPersonId: q, status: "accepted", requestedAt: NOW, updatedAt: NOW })
    const thread = await ctx.db.insert("personalThreads", { networkId: closed, personLow: low, personHigh: high, initiatedByPersonId: me, status: "active", lastMessageAt: NOW, lastMessageByPersonId: me, lastMessageText: "Mon message", lastMessageKind: "text", createdAt: NOW })
    const myMessage = await ctx.db.insert("personalMessages", { networkId: closed, threadId: thread, senderPersonId: me, content: "Mon message", readAt: NOW, createdAt: NOW })
    const reply = await ctx.db.insert("personalMessages", { networkId: closed, threadId: thread, senderPersonId: q, content: "Réponse", replyToMessageId: myMessage, createdAt: NOW + 1 })
    const [lowQr, highQr] = [q, r].sort() as [Id<"persons">, Id<"persons">]
    const otherThread = await ctx.db.insert("personalThreads", { networkId: closed, personLow: lowQr, personHigh: highQr, initiatedByPersonId: q, status: "active", lastMessageAt: NOW, createdAt: NOW })
    const forward = await ctx.db.insert("personalMessages", { networkId: closed, threadId: otherThread, senderPersonId: q, content: "Mon message", forwardedFrom: { kind: "personal", threadId: thread, messageId: myMessage }, createdAt: NOW + 2 })
    const group = await ctx.db.insert("groupThreads", { networkId: root, title: "Groupe", createdByPersonId: q, idempotencyKey: "dp-f1-group", createdAt: NOW })
    const myMember = await ctx.db.insert("groupMembers", { networkId: root, threadId: group, personId: me, role: "member", lastReadAt: NOW, unreadCount: 0, joinedAt: NOW, activityAt: NOW })
    await ctx.db.insert("groupMembers", { networkId: root, threadId: group, personId: q, role: "owner", lastReadAt: NOW, unreadCount: 0, joinedAt: NOW, activityAt: NOW })
    const myGroupMessage = await ctx.db.insert("groupMessages", { networkId: root, threadId: group, senderPersonId: me, type: "text", content: "Dans le groupe", createdAt: NOW })
    const groupReply = await ctx.db.insert("groupMessages", { networkId: root, threadId: group, senderPersonId: q, type: "text", content: "Réponse au groupe", replyToMessageId: myGroupMessage, createdAt: NOW + 1 })
    const myFeedEntry = await ctx.db.insert("feedEntries", { networkId: closed, personId: me, scope: "pour_vous", postId: otherPost, publishedAt: NOW, postCreationTime: NOW, expiresAt: NOW + 86_400_000, createdAt: NOW })
    const feedOfMine = await ctx.db.insert("feedEntries", { networkId: root, personId: q, scope: "pour_vous", postId: myPost, publishedAt: NOW, postCreationTime: NOW, expiresAt: NOW + 86_400_000, createdAt: NOW })
    const fanout = await ctx.db.insert("feedFanoutJobs", { networkId: root, postId: myPost, generation: 1, status: "pending", phase: "self", step: 0, cursor: null, startedAt: NOW, updatedAt: NOW, expiresAt: NOW + 86_400_000 })
    const cursor = (personId: Id<"persons">, activePersonId: Id<"persons">) => ctx.db.insert("feedCursors", { networkId: root, personId, scope: "pour_vous", accessVersion: "dp-f1", generation: 1, status: "building", phase: "follows", step: 1, sourceDone: false, sourceCursor: null, postCursor: null, activePersonId, windowStart: NOW - 86_400_000, cutoff: NOW, startedAt: NOW, updatedAt: NOW })
    const myCursor = await cursor(me, q), cursorOnMe = await cursor(q, me)
    const call = await ctx.db.insert("calls", { networkId: closed, kind: "group", status: "active", callStatus: "on_hold", roomName: "dp-f1-call", createdByPersonId: q, mediaType: "audio", maxParticipants: 4, startedAt: NOW, heldBy: [me, q] })
    const myParticipation = await ctx.db.insert("callParticipants", { networkId: closed, callId: call, personId: me, role: "participant" })
    await ctx.db.insert("callParticipants", { networkId: closed, callId: call, personId: q, role: "host" })
    const reportOnMe = await ctx.db.insert("reports", { networkId: root, target: { kind: "person", id: me }, targetKind: "person", targetId: me, reporterPersonId: q, reason: "spam", level: "network", status: "open", createdAt: NOW, updatedAt: NOW })
    const reviewedByMe = await ctx.db.insert("reports", { networkId: closed, target: { kind: "post", id: otherPost }, targetKind: "post", targetId: otherPost, reporterPersonId: r, reason: "spam", level: "network", status: "dismissed", reviewedByPersonId: me, createdAt: NOW, updatedAt: NOW })
    const myAudit = await ctx.db.insert("engineAudit", { action: "data.export_request", capacity: "member", actorPersonId: me, subjectTable: "posts", subjectId: myPost, at: NOW })
    const auditOnMe = await ctx.db.insert("engineAudit", { action: "data.erasure_request", capacity: "system", subjectTable: "persons", subjectId: me, at: NOW })
    const live = await ctx.db.insert("liveSessions", { networkId: root, hostPersonId: q, title: "Direct de Quentin", roomName: "dp-f1-live", status: "ended", audience: "public", chatMode: "open", stageFormat: "computer", stageLayout: "adaptive", maxViewers: 200, replayRequested: false, createdAt: NOW, updatedAt: NOW })
    const myLiveComment = await ctx.db.insert("liveComments", { networkId: root, sessionId: live, authorPersonId: me, body: "Bonjour", status: "published", offsetMs: 0, createdAt: NOW })
    const myLiveReaction = await ctx.db.insert("liveReactions", { networkId: root, sessionId: live, personId: me, kind: "bravo", count: 1, updatedAt: NOW })
    return { myPost, otherPost, commentOnMine, myComment, reactionOnMine, myReaction, notificationToMe, notificationFromMe, follows, connection, thread, myMessage, reply, forward, group, myMember, myGroupMessage, groupReply, myFeedEntry, feedOfMine, fanout, myCursor, cursorOnMe, call, myParticipation, reportOnMe, reviewedByMe, myAudit, auditOnMe, live, myLiveComment, myLiveReaction }
  })
  // Des personnes sans lien avec « moi » : publications, réactions, messages, fils, cloche, journal, directs.
  await t.run(async (ctx) => {
    const { root, closed } = base
    let previous: Id<"persons"> | null = null
    for (let index = 0; index < others; index++) {
      const networkId = index % 2 ? root : closed
      const id = await ctx.db.insert("persons", { authUserId: `auth-dp-other-${index}`, handle: `dp.autre.${index}`, displayName: `Autre ${index}`, createdAt: NOW, updatedAt: NOW, publishedAt: NOW })
      const post = await ctx.db.insert("posts", { networkId, authorPersonId: id, body: `Autre ${index}`, audience: "public", visibility: "network", status: "published", searchText: "autre", publishedAt: NOW, createdAt: NOW, updatedAt: NOW })
      await ctx.db.insert("postReactions", { networkId, postId: post, personId: id, kind: "like", createdAt: NOW })
      await ctx.db.insert("postComments", { networkId, postId: post, authorPersonId: id, body: "Commentaire", status: "published", createdAt: NOW, updatedAt: NOW })
      await ctx.db.insert("feedEntries", { networkId, personId: id, scope: "pour_vous", postId: post, publishedAt: NOW, postCreationTime: NOW, expiresAt: NOW + 86_400_000, createdAt: NOW })
      await ctx.db.insert("engineAudit", { action: "data.export_request", capacity: "member", actorPersonId: id, networkId, subjectTable: "posts", subjectId: post, at: NOW })
      if (previous) {
        await ctx.db.insert("notifications", { networkId, recipientPersonId: previous, actorPersonId: id, kind: "post_reaction", subjectPostId: post, dedupKey: `dp-other-${index}`, createdAt: NOW })
        await ctx.db.insert("follows", { networkId, followerPersonId: id, targetPersonId: previous, createdAt: NOW })
        const [low, high] = [id, previous].sort() as [Id<"persons">, Id<"persons">]
        const thread = await ctx.db.insert("personalThreads", { networkId, personLow: low, personHigh: high, initiatedByPersonId: id, status: "active", lastMessageAt: NOW, createdAt: NOW })
        const message = await ctx.db.insert("personalMessages", { networkId, threadId: thread, senderPersonId: id, content: "Bonjour", createdAt: NOW })
        await ctx.db.insert("personalMessages", { networkId, threadId: thread, senderPersonId: previous, content: "Réponse", replyToMessageId: message, createdAt: NOW + 1 })
      }
      previous = id
    }
  })
  return { t, ...base, ...ids }
}

async function exportAll(w: World) {
  const tables: Record<string, Array<Record<string, unknown>>> = {}
  const reads: Reads = { count: 0, queries: 0 }
  // Le harnais espace les `_creationTime` d'un même lot au-delà de l'horloge : la demande vient après tout.
  let tableIndex = 0, cursor: string | null = null, pages = 0
  const requestedAt = Number.MAX_SAFE_INTEGER
  for (;;) {
    pages += 1
    const page = await w.t.run(async (ctx) => await exportTablePage(guardedDb(ctx.db, reads), { personId: w.me, requestedAt, tableIndex, cursor }))
    const rows = JSON.parse(page.json) as Array<Record<string, unknown>>
    if (rows.length) (tables[page.table] ??= []).push(...rows)
    if (page.done) break
    // Contrat lu par DIASPORALE : table suivante sans curseur, ou même table avec un curseur neuf.
    if (page.nextTableIndex === tableIndex + 1) expect(page.cursor).toBeNull()
    else expect(page.nextTableIndex === tableIndex && page.cursor !== null && page.cursor !== cursor).toBe(true)
    tableIndex = page.nextTableIndex; cursor = page.cursor
  }
  return { tables, reads, pages }
}

/** Phases `discover` et `erase` seules, une transaction par étape, chacune lue sous garde. */
async function eraseSocial(w: World) {
  const jobId = await w.t.run(async (ctx) => await ctx.db.insert("dataErasureJobs", { personId: w.me, authUserId: "auth-dp.moi", phase: "discover", requestedAt: NOW, dueAt: NOW, updatedAt: NOW, tableIndex: 0, cursor: null, changed: false, passes: 0, erasedRows: 0, identitySubjects: [], contacts: [] }))
  const reads: Reads = { count: 0, queries: 0 }
  let steps = 0
  for (; steps < 2_000; steps++) {
    const phase = await w.t.run(async (ctx) => {
      const job = await ctx.db.get(jobId)
      if (!job || (job.phase !== "discover" && job.phase !== "erase")) return job?.phase ?? null
      await socialErasureStep({ ...ctx, db: guardedDb(ctx.db, reads) } as MutationCtx, job)
      return job.phase
    })
    if (phase !== "discover" && phase !== "erase") break
  }
  const job = await w.t.run(async (ctx) => await ctx.db.get(jobId))
  return { reads, steps, job }
}

async function count(w: World, table: "posts" | "postReactions" | "postComments" | "personalMessages" | "notifications" | "follows" | "feedEntries" | "engineAudit") {
  return await w.t.run(async (ctx) => (await ctx.db.query(table).take(10_000)).length)
}

describe("DP-F1 — export par index de propriétaire", () => {
  it("rend les données de la personne, rien d'autrui, et lit autant de documents quelle que soit la base", async () => {
    const small = await exportAll(await world(0))
    const crowded = await world(60)
    const large = await exportAll(crowded)
    expect(small.reads.count).toBeGreaterThan(0)
    expect(large.reads.count).toBe(small.reads.count)
    expect(large.reads.queries).toBe(small.reads.queries)
    expect(large.pages).toBe(small.pages)
    // Une page par table, plus une par chemin d'index non vide au-delà du premier : très loin de 5 000.
    expect(large.pages).toBeLessThan(dataTableNames().length + 20)
    const ids = (table: string) => (large.tables[table] ?? []).map((row) => row._id).sort()
    expect(ids("posts")).toEqual([crowded.myPost])
    expect(ids("postComments")).toEqual([crowded.myComment])
    expect(ids("postReactions")).toEqual([crowded.myReaction])
    expect(ids("notifications")).toEqual([crowded.notificationToMe])
    expect(ids("follows")).toEqual([...crowded.follows].sort())
    expect(ids("connections")).toEqual([crowded.connection])
    expect(ids("personalThreads")).toEqual([crowded.thread])
    expect(ids("personalMessages")).toEqual([crowded.myMessage])
    expect(ids("groupMembers")).toEqual([crowded.myMember])
    expect(ids("groupMessages")).toEqual([crowded.myGroupMessage])
    expect(ids("callParticipants")).toEqual([crowded.myParticipation])
    expect(ids("feedCursors")).toEqual([crowded.myCursor])
    expect(ids("engineAudit")).toEqual([crowded.myAudit])
    expect(ids("liveComments")).toEqual([crowded.myLiveComment])
    expect(ids("persons")).toEqual([crowded.me])
    for (const table of ["feedEntries", "feedFanoutJobs", "reports", "calls", "liveSessions"]) expect(large.tables[table], table).toBeUndefined()
    expect(JSON.stringify(large.tables)).not.toContain("activePersonId")
    expect(JSON.stringify(large.tables)).not.toContain("auth-dp")
  }, 60_000)

  it("pagine une table à plusieurs chemins sans doubler la ligne atteinte par deux index", async () => {
    const w = await world(0)
    await w.t.run(async (ctx) => {
      for (let index = 0; index < 230; index++) await ctx.db.insert("notifications", { networkId: w.root, recipientPersonId: w.me, kind: "post_reaction", subjectPostId: w.otherPost, dedupKey: `dp-many-${index}`, createdAt: NOW })
    })
    const result = await exportAll(w)
    const notifications = (result.tables.notifications ?? []).map((row) => row._id)
    expect(notifications).toHaveLength(231)
    expect(new Set(notifications).size).toBe(231)
    // `follows` : moi → Quentin et Quentin → moi, chacune une seule fois malgré deux index.
    expect((result.tables.follows ?? []).length).toBe(2)
  }, 60_000)

  it("refuse un curseur forgé, un plan inconnu ou un réseau inexistant", async () => {
    const w = await world(0)
    const index = dataTableNames().indexOf("notifications")
    for (const cursor of ["pas-du-json", "{}", JSON.stringify({ p: 99, n: null, c: null }), JSON.stringify({ p: 0, n: "pas-un-reseau", c: null })]) {
      await expect(w.t.run(async (ctx) => await exportTablePage(ctx.db, { personId: w.me, requestedAt: NOW + 10, tableIndex: index, cursor }))).rejects.toThrow()
    }
  })
})

describe("DP-F1 — effacement par index de propriétaire et de parent", () => {
  it("efface et anonymise tout ce qui touche la personne, sans lire les lignes des autres", async () => {
    const small = await eraseSocial(await world(0))
    const crowded = await world(60)
    const before = { posts: await count(crowded, "posts"), messages: await count(crowded, "personalMessages"), audit: await count(crowded, "engineAudit") }
    const large = await eraseSocial(crowded)
    expect(large.job?.phase).toBe("auth")
    expect(small.reads.count).toBeGreaterThan(0)
    expect(large.reads.count).toBe(small.reads.count)
    expect(large.reads.queries).toBe(small.reads.queries)
    expect(large.steps).toBe(small.steps)
    const w = crowded
    const gone = await w.t.run(async (ctx) => {
      const ids = [w.myPost, w.commentOnMine, w.myComment, w.reactionOnMine, w.myReaction, w.notificationToMe, ...w.follows, w.connection, w.myMessage, w.myMember, w.myGroupMessage, w.myFeedEntry, w.feedOfMine, w.fanout, w.myCursor, w.myParticipation, w.myLiveComment, w.myLiveReaction]
      return (await Promise.all(ids.map((id) => ctx.db.get(id)))).filter((row) => row !== null).map((row) => row._id)
    })
    expect(gone).toEqual([])
    const kept = await w.t.run(async (ctx) => ({
      otherPost: await ctx.db.get(w.otherPost), notificationFromMe: await ctx.db.get(w.notificationFromMe), thread: await ctx.db.get(w.thread), reply: await ctx.db.get(w.reply),
      forward: await ctx.db.get(w.forward), groupReply: await ctx.db.get(w.groupReply), cursorOnMe: await ctx.db.get(w.cursorOnMe), call: await ctx.db.get(w.call),
      reportOnMe: await ctx.db.get(w.reportOnMe), reviewedByMe: await ctx.db.get(w.reviewedByMe), myAudit: await ctx.db.get(w.myAudit), auditOnMe: await ctx.db.get(w.auditOnMe), live: await ctx.db.get(w.live),
      anonymous: await ctx.db.query("persons").withIndex("by_authUserId", (q) => q.eq("authUserId", "erased-account")).unique(),
    }))
    const anonymous = kept.anonymous as Doc<"persons">
    expect(anonymous.erasedAt).toBeDefined()
    expect(kept.otherPost).not.toBeNull()
    expect(kept.notificationFromMe?.actorPersonId).toBeUndefined()
    expect(kept.thread?.lastMessageText).toBeUndefined()
    expect([kept.thread?.personLow, kept.thread?.personHigh]).toContain(anonymous._id)
    expect(kept.reply).toMatchObject({ replyToDeletedAccount: true, content: "Réponse" })
    expect(kept.reply?.replyToMessageId).toBeUndefined()
    expect(kept.forward?.content).toBeUndefined()
    expect(kept.forward?.deletedAt).toBeDefined()
    expect(kept.groupReply).toMatchObject({ replyToDeletedAccount: true })
    expect(kept.cursorOnMe?.activePersonId).toBeUndefined()
    expect(kept.call?.heldBy).toEqual([w.q])
    expect(kept.reportOnMe).toMatchObject({ targetId: anonymous._id, target: { kind: "person", id: anonymous._id } })
    expect(kept.reviewedByMe?.reviewedByPersonId).toBeUndefined()
    expect(kept.myAudit?.actorPersonId).toBeUndefined()
    expect(kept.auditOnMe?.subjectId).toBe("erased")
    expect(kept.live).not.toBeNull()
    // Les lignes des autres sont intactes : seules les miennes et celles qui en dépendaient sont parties.
    expect(await count(w, "posts")).toBe(before.posts - 1)
    expect(await count(w, "personalMessages")).toBe(before.messages - 1)
    expect(await count(w, "engineAudit")).toBe(before.audit)
  }, 120_000)

  it("un curseur d'un parcours antérieur (balayage) fait reprendre la phase au début, sans perte", async () => {
    const w = await world(3)
    await w.t.run(async (ctx) => { await ctx.db.insert("dataErasureJobs", { personId: w.me, authUserId: "auth-dp.moi", phase: "erase", requestedAt: NOW, dueAt: NOW, updatedAt: NOW, tableIndex: 37, cursor: "curseur-convex-ancien", changed: false, passes: 0, erasedRows: 0, identitySubjects: [], contacts: [] }) })
    const jobId = (await w.t.run(async (ctx) => await ctx.db.query("dataErasureJobs").first()))!._id
    await w.t.run(async (ctx) => { await socialErasureStep(ctx as MutationCtx, (await ctx.db.get(jobId))!) })
    const job = await w.t.run(async (ctx) => await ctx.db.get(jobId))
    expect(JSON.parse(job!.cursor!)).toMatchObject({ v: 2 })
  })
})

describe("DP-F1 — effacement complet après service, association et messagerie", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW) })
  afterEach(() => vi.useRealTimers())

  it("demande de service, proposition, rendez-vous, avis et réponse, adhésion, fil contextuel et messages", async () => {
    const t = testConvex()
    const user: unknown = await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "Recette", email: "dp-f1-recette@example.test", emailVerified: true, createdAt: NOW, updatedAt: NOW } } })
    if (!user || typeof user !== "object" || !("_id" in user) || typeof user._id !== "string") throw new Error("Utilisateur de recette absent")
    const authUserId = user._id
    const as = t.withIdentity({ subject: authUserId })
    const ids = await t.run(async (ctx) => {
      const networkId = await ctx.db.insert("networks", { slug: "dp-f1-diaspora", name: "Réseau de recette", kind: "root", status: "active", membershipPolicy: "open", defaultVisibility: "network", reachValues: [], theme: "antsia", createdAt: NOW, updatedAt: NOW })
      const me = await ctx.db.insert("persons", { authUserId, handle: "dp.service", displayName: "Recette", createdAt: NOW, updatedAt: NOW, publishedAt: NOW })
      const signatory = await ctx.db.insert("persons", { authUserId: "auth-dp-signataire", handle: "dp.signataire", displayName: "Signataire", createdAt: NOW, updatedAt: NOW, publishedAt: NOW })
      for (const personId of [me, signatory]) await ctx.db.insert("networkMemberships", { networkId, personId, status: "verifiee", role: "member", joinedAt: NOW, statusChangedAt: NOW })
      const pageId = await ctx.db.insert("pages", { networkId, handle: "association-recette", name: "Association de recette", ownerKind: "association", trust: "community", trustRank: 1, visibility: "network", onRoot: false, status: "active", searchText: "association", createdAt: NOW, updatedAt: NOW })
      await ctx.db.insert("pageSignatories", { networkId, pageId, personId: signatory, role: "admin", createdAt: NOW, updatedAt: NOW })
      const offerId = await ctx.db.insert("serviceOffers", { networkId, pageId, title: "Traduction", description: "Traduction de recette", category: "translation", country: "GA", city: "Libreville", cityKey: "libreville", delivery: "remote", languages: ["fr"], pricing: { mode: "quote" }, status: "active", searchText: "traduction", version: 1, createdAt: NOW, updatedAt: NOW })
      const requestId = await ctx.db.insert("serviceRequests", { networkId, offerId, offerVersion: 1, offerTitle: "Traduction", pageId, requesterPersonId: me, need: "Un document", windows: [{ startAt: NOW, endAt: NOW + 3_600_000 }], timeZone: "Africa/Libreville", status: "confirmed", identityConsentAt: NOW, idempotencyKey: "dp-f1-request", idempotencyFingerprint: "dp-f1", expiresAt: NOW + 86_400_000, proposalVersion: 1, createdAt: NOW, updatedAt: NOW })
      const proposalId = await ctx.db.insert("serviceProposals", { networkId, requestId, pageId, version: 1, authorPersonId: signatory, amountMinor: 1000, currency: "XAF", durationMinutes: 60, startAt: NOW, endAt: NOW + 3_600_000, timeZone: "Africa/Libreville", location: { mode: "remote" }, details: "Proposition", cancellationTerms: "Aucune", expiresAt: NOW + 86_400_000, state: "current", createdAt: NOW, updatedAt: NOW })
      const bookingId = await ctx.db.insert("serviceBookings", { networkId, requestId, proposalId, pageId, startAt: NOW, endAt: NOW + 3_600_000, timeZone: "Africa/Libreville", status: "completed", createdAt: NOW, updatedAt: NOW })
      const reviewId = await ctx.db.insert("serviceReviews", { networkId, requestId, bookingId, offerId, pageId, authorPersonId: me, rating: 5, body: "Très bien", proof: "booking_confirmed", consentToPublishAt: NOW, version: 1, status: "active", createdAt: NOW, updatedAt: NOW })
      const replyId = await ctx.db.insert("serviceReviewReplies", { networkId, reviewId, pageId, authorPersonId: signatory, body: "Merci", version: 1, status: "active", createdAt: NOW, updatedAt: NOW })
      const membershipId = await ctx.db.insert("associationMemberships", { networkId, pageId, personId: me, status: "accepted", role: "member", requestedAt: NOW, statusChangedAt: NOW, version: 1, decidedByPersonId: signatory, createdAt: NOW, updatedAt: NOW })
      const decidedByMe = await ctx.db.insert("associationMemberships", { networkId, pageId, personId: signatory, status: "accepted", role: "animator", requestedAt: NOW, statusChangedAt: NOW, version: 1, decidedByPersonId: me, createdAt: NOW, updatedAt: NOW })
      const contextThread = await ctx.db.insert("contextualThreads", { networkId, kind: "diasporaServiceRequest", contextKey: `service:${requestId}`, serviceRequestId: requestId, requesterPersonId: me, status: "open", revision: 1, lastMessageAt: NOW, createdAt: NOW, updatedAt: NOW })
      const contextMine = await ctx.db.insert("contextualMessages", { networkId, threadId: contextThread, side: "requester", voice: "person", authorPersonId: me, content: "Bonjour", idempotencyKey: "dp-f1-c1", digest: "d1", createdAt: NOW })
      const contextPage = await ctx.db.insert("contextualMessages", { networkId, threadId: contextThread, side: "responder", voice: "page", pageSpeakerPersonId: signatory, content: "Réponse de la page", idempotencyKey: "dp-f1-c2", digest: "d2", createdAt: NOW + 1 })
      const [low, high] = [me, signatory].sort() as [Id<"persons">, Id<"persons">]
      const thread = await ctx.db.insert("personalThreads", { networkId, personLow: low, personHigh: high, initiatedByPersonId: me, status: "active", lastMessageAt: NOW, createdAt: NOW })
      const message = await ctx.db.insert("personalMessages", { networkId, threadId: thread, senderPersonId: me, content: "Message privé", createdAt: NOW })
      return { me, signatory, pageId, offerId, requestId, proposalId, bookingId, reviewId, replyId, membershipId, decidedByMe, contextThread, contextMine, contextPage, thread, message }
    })
    await as.query(api.modules.people.persons.getMyPerson, {})
    await as.mutation(api.modules.people.erasure.requestErasure, { confirmation: "DELETE_MY_ANTSIA_ACCOUNT" })
    const job = await t.run(async (ctx) => await ctx.db.query("dataErasureJobs").first())
    vi.setSystemTime(NOW + ERASURE_GRACE_MS + 1)
    await t.mutation(internal.modules.people.erasure.continueErasure, { jobId: job!._id })
    for (let step = 0; step < 1500 && await t.run(async (ctx) => await ctx.db.get(job!._id)); step++) {
      vi.runAllTimers()
      await t.finishInProgressScheduledFunctions()
    }
    const state = await t.run(async (ctx) => ({
      gone: (await Promise.all([ids.me, ids.requestId, ids.proposalId, ids.bookingId, ids.reviewId, ids.replyId, ids.membershipId, ids.contextThread, ids.contextMine, ids.contextPage, ids.message].map((id) => ctx.db.get(id)))).filter((row) => row !== null),
      page: await ctx.db.get(ids.pageId), offer: await ctx.db.get(ids.offerId), thread: await ctx.db.get(ids.thread), decidedByMe: await ctx.db.get(ids.decidedByMe),
      targets: await ctx.db.query("dataErasureTargets").first(), jobs: await ctx.db.query("dataErasureJobs").first(),
    }))
    expect(state.gone).toEqual([])
    expect(state.page).not.toBeNull()
    expect(state.offer).not.toBeNull()
    expect(state.thread).not.toBeNull()
    expect(state.decidedByMe).not.toBeNull()
    expect(state.decidedByMe?.decidedByPersonId).toBeUndefined()
    expect(state.targets).toBeNull()
    expect(state.jobs).toBeNull()
  }, 60_000)
})
