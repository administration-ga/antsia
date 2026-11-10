// @vitest-environment edge-runtime
/** P10 : scénarios écrits sans exécution ; sessions Better Auth réelles, aucun fournisseur. */
import { COMMERCIAL_RETENTION_MS } from "@antsia/social-domain/commercialContact"
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { makeFunctionReference, type PaginationOptions, type PaginationResult } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, testConvex } from "../../test.setup"
import { canReadCommercialMessage, canReadCommercialThread } from "./access"
import type { DeclaredAttachment } from "../messaging/attachmentStorage"
import type { CommercialMessageDto } from "./messages"
import { purgeCommercialThreadSlice } from "./retention"
import type { CommercialThreadDto } from "./threads"

type T = ReturnType<typeof testConvex>
type Actor = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; subject: string }
type Scope = { networkId: Id<"networks"> }
type ThreadScope = Scope & { threadId: Id<"commercialThreads"> }
const base = "modules/commercialMessaging/"
const request = makeFunctionReference<"mutation", Scope & { shopHandle: string; offerRef?: string; text: string; idempotencyKey: string }, { threadId: Id<"commercialThreads">; messageId: Id<"commercialMessages">; deduplicated: boolean }>(`${base}threads:requestContact`)
const getThread = makeFunctionReference<"query", Scope & { threadId?: Id<"commercialThreads">; conversationRef?: string }, CommercialThreadDto | null>(`${base}threads:getThread`)
const decide = makeFunctionReference<"mutation", ThreadScope & { expectedRevision: number; decision: "accept" | "decline" }, null>(`${base}threads:decideRequest`)
const send = makeFunctionReference<"mutation", ThreadScope & { text: string; attachments?: DeclaredAttachment[]; idempotencyKey: string }, { messageId: Id<"commercialMessages">; deduplicated: boolean }>(`${base}messages:sendMessage`)
const messages = makeFunctionReference<"query", ThreadScope & { paginationOpts: PaginationOptions }, PaginationResult<CommercialMessageDto>>(`${base}messages:paginateMessages`)
const grant = makeFunctionReference<"mutation", Scope & { shopId: Id<"shops">; personId: Id<"persons">; canRead: boolean; canReply: boolean; canDecide: boolean; canCall: boolean }, null>(`${base}team:grant`)
const accept = makeFunctionReference<"mutation", Scope & { shopId: Id<"shops"> }, null>(`${base}team:accept`)
const revoke = makeFunctionReference<"mutation", Scope & { shopId: Id<"shops">; personId: Id<"persons"> }, null>(`${base}team:revoke`)
const block = makeFunctionReference<"mutation", ThreadScope & { blocked: boolean }, null>(`${base}threads:setThreadBlock`)
const callConsent = makeFunctionReference<"mutation", ThreadScope & { allowed: boolean }, null>(`${base}calls:setCallConsent`)
const startCall = makeFunctionReference<"mutation", ThreadScope & { respondentPersonId?: Id<"persons">; mediaType: "audio" | "video" }, import("../calls/direct").DirectCallResult>(`${base}calls:startCall`)
const upload = makeFunctionReference<"mutation", ThreadScope, string>(`${base}messages:generateUploadUrl`)
const myInvitations = makeFunctionReference<"query", Scope, { items: { shopId: Id<"shops"> }[]; truncated: boolean }>(`${base}team:myInvitations`)
const shopThreads = makeFunctionReference<"query", Scope & { shopId: Id<"shops">; paginationOpts: PaginationOptions }, PaginationResult<CommercialThreadDto>>(`${base}threads:paginateShopThreads`)
const NOW = Date.UTC(2026, 9, 18, 12)
const PAGE = { cursor: null, numItems: 10 }
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210") })
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
async function caught(work: Promise<unknown>) { try { await work; return null } catch (error) { return error } }
async function actor(t: T, networkId: Id<"networks">, handle: string): Promise<Actor> {
  const subject = `commercial-${handle}`
  const sessionId = await createTestSession(t, subject)
  const as = t.withIdentity({ subject, sessionId })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId })
  return { as, personId, subject }
}
async function fixture(open = true) {
  const t = testConvex({ automaticSessions: false })
  const { root, testClosed: child } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const manager = await actor(t, root, "contact-manager")
  const buyer = await actor(t, root, "contact-buyer")
  const stranger = await actor(t, root, "contact-stranger")
  const { pageId, shopId } = await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", { networkId: root, handle: "contact-shop", name: "Atelier local", ownerKind: "company", trust: "community", trustRank: 1, visibility: "network", onRoot: true, status: "active", createdByPersonId: manager.personId, searchText: "atelier", createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId: manager.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const shopId = await ctx.db.insert("shops", { networkId: root, pageId, preparedByPersonId: manager.personId, model: "products", storefront: "published", visibility: "network", createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("shopNetworkPolicies", { networkId: root, storefront: "review", updatedAt: NOW })
    if (open) await ctx.db.insert("commercialNetworkPolicies", { networkId: root, enabled: true, updatedAt: NOW })
    await ctx.db.insert("shopContactSettings", { networkId: root, shopId, acceptRequests: true, updatedAt: NOW })
    return { pageId, shopId }
  })
  return { t, root, child, manager, buyer, stranger, pageId, shopId }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
const rights = { canRead: true, canReply: true, canDecide: true, canCall: true }
async function mandateManager(f: Fixture) { await f.manager.as.mutation(grant, { networkId: f.root, shopId: f.shopId, personId: f.manager.personId, ...rights }) }
async function requested(f: Fixture) { return await f.buyer.as.mutation(request, { networkId: f.root, shopHandle: "contact-shop", text: "Bonjour, une précision sur votre activité.", idempotencyKey: "initial_request_0001" }) }
async function accepted(f: Fixture) {
  await mandateManager(f)
  const created = await requested(f)
  await f.manager.as.mutation(decide, { networkId: f.root, threadId: created.threadId, expectedRevision: 1, decision: "accept" })
  return { threadId: created.threadId, networkId: f.root }
}

describe("P10 — canal autonome et autorité actuelle", () => {
  it("refuse les références démo même lorsque le canal de contact est ouvert", async () => {
    const f = await fixture()
    const error = await caught(f.buyer.as.mutation(request, { networkId: f.root, shopHandle: "contact-shop", offerRef: "demo:offer:epicerie-produits", text: "Une question sur cette illustration.", idempotencyKey: "demo_contact_refused_0001" }))
    expect(engineErrorCode(error)).toBe("notFound")
    expect(await f.t.run(async (ctx) => (await ctx.db.query("commercialThreads").take(1)).length)).toBe(0)
    expect(await f.t.run(async (ctx) => (await ctx.db.query("commercialMessages").take(1)).length)).toBe(0)
  })
  it("reste fermé sans politique et ne crée ni fil personnel ni adhésion implicite", async () => {
    const f = await fixture(false)
    expect(engineErrorCode(await caught(requested(f)))).toBe("notFound")
    expect(await f.t.run(async (ctx) => (await ctx.db.query("commercialThreads").take(1)).length)).toBe(0)
    expect(await f.t.run(async (ctx) => (await ctx.db.query("personalThreads").take(1)).length)).toBe(0)
  })
  it("rejoue seulement la même charge du même auteur et ne révèle rien à un autre client", async () => {
    const f = await fixture()
    const one = await requested(f)
    expect(await requested(f)).toEqual({ ...one, deduplicated: true })
    expect(engineErrorCode(await caught(f.buyer.as.mutation(request, { networkId: f.root, shopHandle: "contact-shop", text: "Autre charge", idempotencyKey: "initial_request_0001" })))).toBe("notFound")
    expect(await f.stranger.as.query(getThread, { networkId: f.root, threadId: one.threadId })).toBeNull()
    expect(engineErrorCode(await caught(f.stranger.as.query(messages, { networkId: f.root, threadId: one.threadId, paginationOpts: PAGE })))).toBe("notFound")
    const dto = await f.buyer.as.query(getThread, { networkId: f.root, threadId: one.threadId })
    expect(dto?.conversationRef).toMatch(/^antsia:conv:[a-f0-9]{64}$/)
    expect(dto?.conversationRef).not.toContain(one.threadId)
    expect(await f.t.run(async (ctx) => (await ctx.db.query("commercialMessages").take(3)).length)).toBe(1)
  })
  it("n'accorde pas la lecture au gérant sans mandat et exige l'acceptation d'un vrai signataire", async () => {
    const f = await fixture()
    const created = await requested(f)
    expect(await f.manager.as.query(getThread, { networkId: f.root, threadId: created.threadId })).toBeNull()
    expect(engineErrorCode(await caught(f.manager.as.query(shopThreads, { networkId: f.root, shopId: f.shopId, paginationOpts: PAGE })))).toBe("notFound")
    expect(engineErrorCode(await caught(f.manager.as.mutation(grant, { networkId: f.root, shopId: f.shopId, personId: f.stranger.personId, ...rights })))).toBe("notFound")
    await f.t.run(async (ctx) => ctx.db.insert("pageSignatories", { networkId: f.root, pageId: f.pageId, personId: f.stranger.personId, role: "signatory", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW }))
    await f.manager.as.mutation(grant, { networkId: f.root, shopId: f.shopId, personId: f.stranger.personId, canRead: true, canReply: false, canDecide: false, canCall: false })
    expect((await f.stranger.as.query(myInvitations, { networkId: f.root })).items).toEqual([expect.objectContaining({ shopId: f.shopId })])
    expect(await f.stranger.as.query(getThread, { networkId: f.root, threadId: created.threadId })).toBeNull()
    await f.stranger.as.mutation(accept, { networkId: f.root, shopId: f.shopId })
    expect(await f.stranger.as.query(getThread, { networkId: f.root, threadId: created.threadId })).toMatchObject({ capabilities: { canSend: false, canDecide: false, canCall: false } })
  })
  it("réserve texte suivant, dépôt et appel à l'acceptation, sans autorité de réponse dérivée de la lecture", async () => {
    const f = await fixture()
    const created = await requested(f)
    const scope = { networkId: f.root, threadId: created.threadId }
    expect(engineErrorCode(await caught(f.buyer.as.mutation(send, { ...scope, text: "Un autre message", idempotencyKey: "message_next_0001" })))).toBe("notFound")
    expect(engineErrorCode(await caught(f.buyer.as.mutation(upload, scope)))).toBe("notFound")
    expect(engineErrorCode(await caught(f.buyer.as.mutation(startCall, { ...scope, respondentPersonId: f.manager.personId, mediaType: "audio" })))).toBe("notFound")
    await mandateManager(f)
    await f.manager.as.mutation(decide, { ...scope, expectedRevision: 1, decision: "accept" })
    const message = await f.buyer.as.mutation(send, { ...scope, text: "Merci pour votre réponse.", idempotencyKey: "message_next_0001" })
    expect(await f.buyer.as.mutation(send, { ...scope, text: "Merci pour votre réponse.", idempotencyKey: "message_next_0001" })).toEqual({ ...message, deduplicated: true })
    expect(engineErrorCode(await caught(f.manager.as.mutation(decide, { ...scope, expectedRevision: 1, decision: "decline" })))).toBe("invalidArgument")
  })
  it("borne les pièces à deux avant d'admettre un blob et refuse le réemploi d'un dépôt étranger", async () => {
    const f = await fixture()
    const scope = await accepted(f)
    const storageId = await f.t.run(async (ctx) => await ctx.storage.store(new Blob(["une pièce étrangère"], { type: "text/plain" })))
    const file = { storageId, filename: "piece.txt", mimeType: "text/plain", sizeBytes: 20 }
    expect(engineErrorCode(await caught(f.buyer.as.mutation(send, { ...scope, text: "Pièces", attachments: [file, file, file], idempotencyKey: "attachments_many_0001" })))).toBe("invalidArgument")
    expect(await caught(f.buyer.as.mutation(send, { ...scope, text: "Dépôt non attribué", attachments: [file], idempotencyKey: "attachments_stolen_0001" }))).not.toBeNull()
  })
  it("finitions : la pièce neuve est admise par la garde du module, au nom de l'émetteur ; un dépôt déjà admis n'est la pièce de personne d'autre", async () => {
    const f = await fixture()
    const scope = await accepted(f)
    const storageId = await f.t.run(async (ctx) => await ctx.storage.store(new Blob(["devis signé"], { type: "text/plain" })))
    const sizeBytes = await f.t.run(async (ctx) => (await ctx.db.system.get("_storage", storageId))?.size ?? 0)
    const file = { storageId, filename: "devis.txt", mimeType: "text/plain", sizeBytes }
    const sent = await f.buyer.as.mutation(send, { ...scope, text: "", attachments: [file], idempotencyKey: "attachment_admitted_0001" })
    // Temps 2 de la politique de dépôt : ligne d'analyse au nom de l'émetteur et du réseau du fil.
    const scan = await f.t.run(async (ctx) => await ctx.db.query("fileScans").withIndex("by_storageId", (q) => q.eq("storageId", storageId)).first())
    expect(scan).toMatchObject({ source: "message", networkId: f.root, uploadedByPersonId: f.buyer.personId, filename: "devis.txt", status: "pending" })
    expect(await f.t.run(async (ctx) => (await ctx.db.get(sent.messageId))?.attachmentFiles)).toEqual([{ storageId, filename: "devis.txt", mimeType: "text/plain", sizeBytes }])
    // Le même dépôt déclaré par l'autre côté : refus indistinct, aucun oracle sur le fichier d'autrui.
    expect(engineErrorCode(await caught(f.manager.as.mutation(send, { ...scope, text: "Reprise", attachments: [file], idempotencyKey: "attachment_stolen_0002" })))).toBe("notFound")
    // Son propre dépôt redéclaré sous une autre clé : nommé, puisqu'il le connaît.
    expect(engineErrorCode(await caught(f.buyer.as.mutation(send, { ...scope, text: "Encore", attachments: [file], idempotencyKey: "attachment_again_0003" })))).toBe("conflict")
    // Rien d'écrit par les deux refus : une seule pièce posée, une seule ligne d'analyse.
    expect(await f.t.run(async (ctx) => (await ctx.db.query("fileScans").withIndex("by_storageId", (q) => q.eq("storageId", storageId)).take(3)).length)).toBe(1)
  })
  it("referme lecture et écriture après retrait du mandat, de signature ou suspension racine", async () => {
    const f = await fixture()
    const scope = await accepted(f)
    await f.manager.as.mutation(revoke, { networkId: f.root, shopId: f.shopId, personId: f.manager.personId })
    expect(await f.manager.as.query(getThread, scope)).toBeNull()
    expect(engineErrorCode(await caught(f.manager.as.mutation(send, { ...scope, text: "Pas de mandat", idempotencyKey: "message_without_0001" })))).toBe("notFound")
    await mandateManager(f)
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.root).eq("personId", f.manager.personId)).unique()
      if (row) await ctx.db.patch(row._id, { status: "suspendue" })
    })
    expect(await f.buyer.as.query(getThread, scope)).toBeNull()
    expect(await f.t.run(async (ctx) => await canReadCommercialThread(ctx, f.root, f.manager.personId, scope.threadId))).toBe(false)
  })
  it.each(["profile", "consent"] as const)("refuse le profil retiré ou l'accord social révoqué (%s), sans en publier un d'office", async (reason) => {
    const f = await fixture()
    const scope = await accepted(f)
    await f.t.run(async (ctx) => {
      if (reason === "profile") await ctx.db.patch(f.buyer.personId, { publishedAt: undefined })
      else {
        const rows = await ctx.db.query("consents").withIndex("by_person_and_purpose", (q) => q.eq("personId", f.buyer.personId).eq("purpose", "social_profile")).take(100)
        for (const row of rows) await ctx.db.patch(row._id, { revokedAt: Date.now() })
      }
    })
    expect(await f.buyer.as.query(getThread, scope)).toBeNull()
    expect(engineErrorCode(await caught(f.buyer.as.mutation(send, { ...scope, text: "Accès fermé", idempotencyKey: "withdrawn_profile_0001" })))).toBe("notFound")
    expect(engineErrorCode(await caught(f.buyer.as.mutation(request, { networkId: f.root, shopHandle: "contact-shop", text: "Nouvelle demande", idempotencyKey: "withdrawn_request_0001" })))).toBe("notFound")
  })
  it("ferme les pièces et le contenu modérés sans exposer le document brut", async () => {
    const f = await fixture()
    const scope = await accepted(f)
    const sent = await f.buyer.as.mutation(send, { ...scope, text: "Texte à retirer", idempotencyKey: "message_moderated_0001" })
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", "commercialMessage").eq("targetId", sent.messageId)).unique()
      if (row) await ctx.db.patch(row._id, { status: "removed" })
    })
    expect((await f.manager.as.query(messages, { ...scope, paginationOpts: PAGE })).page.find((row) => row.messageId === sent.messageId)).toMatchObject({ content: null, attachmentFiles: [], deleted: false, withheld: true })
  })
  it("le blocage de paire est idempotent et interdit une nouvelle demande avec une autre clé", async () => {
    const f = await fixture()
    const scope = await accepted(f)
    await f.buyer.as.mutation(block, { ...scope, blocked: true })
    await f.buyer.as.mutation(block, { ...scope, blocked: true })
    expect(await f.buyer.as.query(getThread, scope)).toMatchObject({ state: "blocked", capabilities: { canSend: false, canCall: false } })
    expect(await f.t.run(async (ctx) => {
      const message = await ctx.db.query("commercialMessages").withIndex("by_thread", (q) => q.eq("threadId", scope.threadId)).first()
      return message ? await canReadCommercialMessage(ctx, f.root, f.buyer.personId, message._id) : true
    })).toBe(false)
    expect(engineErrorCode(await caught(f.buyer.as.mutation(request, { networkId: f.root, shopHandle: "contact-shop", text: "Contourner le blocage", idempotencyKey: "different_request_0001" })))).toBe("notFound")
    expect(await f.t.run(async (ctx) => (await ctx.db.query("commercialBlocks").take(3)).length)).toBe(1)
  })
  it("exige deux accords d'appel puis retire jeton, sonnerie et acceptation dès révocation", async () => {
    const f = await fixture()
    const scope = await accepted(f)
    const place = () => f.buyer.as.mutation(startCall, { ...scope, respondentPersonId: f.manager.personId, mediaType: "audio" })
    expect(engineErrorCode(await caught(place()))).toBe("notFound")
    await f.buyer.as.mutation(callConsent, { ...scope, allowed: true })
    expect(engineErrorCode(await caught(place()))).toBe("notFound")
    await f.manager.as.mutation(callConsent, { ...scope, allowed: true })
    const call = await place()
    expect(call.admitted).toBe(true)
    if (!call.admitted) throw new Error("Fixture d'appel non admise")
    // Le jeton appartient à l'appareil entré dans la salle ; l'appelé n'a pas encore décroché.
    expect(await f.manager.as.query(internal.modules.calls.token.authorizeToken, { networkId: f.root, callId: call.callId })).toBeNull()
    await f.buyer.as.mutation(api.modules.calls.lifecycle.join, { networkId: f.root, callId: call.callId })
    await f.buyer.as.mutation(api.modules.calls.lifecycle.setCallRinging, { networkId: f.root, callId: call.callId })
    expect(await f.buyer.as.query(internal.modules.calls.token.authorizeToken, { networkId: f.root, callId: call.callId })).toMatchObject({ personId: f.buyer.personId, commercialThreadId: scope.threadId })
    expect((await f.manager.as.query(api.modules.calls.ringing.listRinging, { networkId: f.root })).calls).toEqual([expect.objectContaining({ callId: call.callId, commercialThreadId: scope.threadId })])
    await f.manager.as.mutation(callConsent, { ...scope, allowed: false })
    expect(await f.buyer.as.query(internal.modules.calls.token.authorizeToken, { networkId: f.root, callId: call.callId })).toBeNull()
    expect(await f.manager.as.query(internal.modules.calls.token.authorizeToken, { networkId: f.root, callId: call.callId })).toBeNull()
    expect((await f.manager.as.query(api.modules.calls.ringing.listRinging, { networkId: f.root })).calls).toEqual([])
    expect(engineErrorCode(await caught(f.manager.as.mutation(api.modules.calls.lifecycle.join, { networkId: f.root, callId: call.callId })))).toBe("notFound")
    expect(await f.t.run(async (ctx) => (await ctx.db.get(call.callId))?.status)).toBe("ended")
  })
  it("relit un changement de préférence avant la sonnerie, le jeton et le décrochage", async () => {
    const f = await fixture()
    const scope = await accepted(f)
    await f.buyer.as.mutation(callConsent, { ...scope, allowed: true })
    await f.manager.as.mutation(callConsent, { ...scope, allowed: true })
    const call = await f.buyer.as.mutation(startCall, { ...scope, respondentPersonId: f.manager.personId, mediaType: "audio" })
    if (!call.admitted) throw new Error("Fixture d'appel non admise")
    await f.t.run(async (ctx) => ctx.db.insert("callPreferences", { personId: f.manager.personId, outsideRelationsCalls: "silent", updatedAt: NOW }))
    expect(await f.manager.as.query(internal.modules.calls.token.authorizeToken, { networkId: f.root, callId: call.callId })).toBeNull()
    expect(engineErrorCode(await caught(f.buyer.as.mutation(api.modules.calls.lifecycle.setCallRinging, { networkId: f.root, callId: call.callId })))).toBe("notFound")
    expect(engineErrorCode(await caught(f.manager.as.mutation(api.modules.calls.lifecycle.join, { networkId: f.root, callId: call.callId })))).toBe("notFound")
  })
  it("ne promeut jamais un appel commercial et n'offre pas de messagerie vocale personnelle", async () => {
    const f = await fixture()
    const scope = await accepted(f)
    await f.buyer.as.mutation(callConsent, { ...scope, allowed: true })
    await f.manager.as.mutation(callConsent, { ...scope, allowed: true })
    const call = await f.buyer.as.mutation(startCall, { ...scope, respondentPersonId: f.manager.personId, mediaType: "audio" })
    expect(call.admitted).toBe(true)
    if (!call.admitted) throw new Error("Fixture d'appel non admise")
    expect(engineErrorCode(await caught(f.buyer.as.mutation(api.modules.calls.groupCalls.addInvitee, { networkId: f.root, callId: call.callId, personId: f.stranger.personId })))).toBe("notFound")
    expect(await f.t.run(async (ctx) => (await ctx.db.get(call.callId))?.kind)).toBe("direct")
    const storageId = await f.t.run(async (ctx) => await ctx.storage.store(new Blob(["voice"], { type: "audio/webm" })))
    expect(engineErrorCode(await caught(f.buyer.as.mutation(api.modules.calls.voicemail.leave, { networkId: f.root, callId: call.callId, storageId, durationMs: 1000 })))).toBe("notFound")
  })
  it("la rétention purge par vingt messages et conserve l'intention de blocage", async () => {
    const f = await fixture()
    const scope = await accepted(f)
    await f.buyer.as.mutation(block, { ...scope, blocked: true })
    await f.t.run(async (ctx) => {
      for (let index = 0; index < 24; index++) await ctx.db.insert("commercialMessages", { networkId: f.root, threadId: scope.threadId, senderPersonId: f.buyer.personId, senderKind: "requester", content: "Historique expiré", idempotencyKey: `retention_${index}`, digest: "fixture", createdAt: NOW + index })
    })
    vi.setSystemTime(NOW + COMMERCIAL_RETENTION_MS + 1)
    expect(await f.t.run(async (ctx) => await purgeCommercialThreadSlice(ctx, scope.threadId))).toBe(false)
    expect(await f.t.run(async (ctx) => (await ctx.db.query("commercialMessages").withIndex("by_thread", (q) => q.eq("threadId", scope.threadId)).take(20)).length)).toBe(5)
    expect(await f.t.run(async (ctx) => await purgeCommercialThreadSlice(ctx, scope.threadId))).toBe(true)
    expect(await f.t.run(async (ctx) => await ctx.db.get(scope.threadId))).toMatchObject({ state: "blocked", buyerCallsAllowed: false })
    expect(await f.t.run(async (ctx) => (await ctx.db.query("commercialBlocks").take(2)).length)).toBe(1)
  })
  it("ne purge aucun message ni fil tant que le retrait CRM attend un reçu", async () => {
    const f = await fixture()
    const scope = await accepted(f)
    const transferId = await f.t.run(async (ctx) => {
      const thread = await ctx.db.get(scope.threadId)
      if (!thread) throw new Error("Fil de fixture absent")
      await ctx.db.patch(thread._id, { state: "closed", purgeAt: NOW - 1 })
      return await ctx.db.insert("commercialCrmTransfers", {
        networkId: f.root, personId: f.buyer.personId, threadId: scope.threadId, shopId: f.shopId,
        source: "antsia", environment: "sandbox", configFingerprint: "fixture", subjectRef: `antsia:sub:${"a".repeat(64)}`, conversationRef: thread.conversationRef,
        requestId: "b".repeat(64), requestSha256: "c".repeat(64), requestExpiresAt: NOW + 1000, idempotencyKey: "retention_crm_0001", intentionSha256: "d".repeat(64),
        textVersion: "2026-10-18", consentedAt: NOW, state: "withdrawal_pending", revokedAt: NOW, dispatchedAt: NOW,
        attempts: 0, nextAttemptAt: NOW, generation: 1, createdAt: NOW, updatedAt: NOW,
      })
    })
    expect(await f.t.run(async (ctx) => await purgeCommercialThreadSlice(ctx, scope.threadId))).toBe(false)
    expect(await f.t.run(async (ctx) => (await ctx.db.query("commercialMessages").withIndex("by_thread", (q) => q.eq("threadId", scope.threadId)).take(2)).length)).toBe(1)
    expect(await f.t.run(async (ctx) => (await ctx.db.get(scope.threadId))?.purgeAt)).toBe(NOW + 86400000)
    await f.t.run(async (ctx) => ctx.db.patch(transferId, { state: "withdrawn" }))
    expect(await f.t.run(async (ctx) => await purgeCommercialThreadSlice(ctx, scope.threadId))).toBe(true)
    expect(await f.t.run(async (ctx) => await ctx.db.get(scope.threadId))).toBeNull()
  })
  it("une session expirée ne retrouve pas un fil connu", async () => {
    const f = await fixture()
    const scope = await accepted(f)
    const sessionId = await createTestSession(f.t, f.buyer.subject, Date.now() - 1)
    const expired = f.t.withIdentity({ subject: f.buyer.subject, sessionId })
    expect(engineErrorCode(await caught(expired.query(getThread, scope)))).toBe("unauthenticated")
  })
})
