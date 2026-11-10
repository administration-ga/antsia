// @vitest-environment edge-runtime
/**
 * CC-2b (contrat CONVERSATION-CONTEXTUELLE-V1 §12, ADR-0025) — scénarios ÉCRITS, NON EXÉCUTÉS
 * (décision du propriétaire du 18/10/2026 : « Continuer sans vérifier »). Sessions Better Auth
 * réelles ; les résolveurs de la tranche sont SIMULÉS par un registre de test injecté (module
 * `./registry` remplacé) : aucun résolveur de test n'est enregistré dans le moteur. Les appels
 * (N12, N27–N31) relèvent de CC-4 (`contextualCalls.test.ts`).
 *
 * À la réouverture des contrôles : `bunx vitest run --config convex/vitest.config.ts modules/contextualMessaging`.
 */
import { engineErrorAppRule, engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { CONTEXTUAL_SUPPORTED_KINDS, CONTEXTUAL_TEXT_MAX } from "@antsia/social-domain/contextualMessaging"
import { makeFunctionReference, type PaginationOptions, type PaginationResult } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { enforceRateLimit } from "../../lib/rateLimit"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, testConvex } from "../../test.setup"
import type { DeclaredAttachment } from "../messaging/attachmentStorage"
import { notificationStillVisible } from "../notifications/policy"
import { notificationOpenTargetOf } from "../notifications/targets"
import { anonymizeReferences, type DataRecord, directlyOwned, exportableRecord, shapeFor } from "../people/dataInventory"
import { DATA_TABLE_POLICIES } from "../people/dataPolicies"
import type { ContextualObjectRef } from "./contract"
import { openContextualConversation, purgeContextualConversation, syncContextualConversation } from "./hooks"
import type { ContextualMessageDto } from "./messages"
import { purgeContextualThreadSlice } from "./retention"
import type { ContextualThreadDto } from "./threads"

// ─── Registre de test : les objets ouvrants sont décrits ici, jamais lus dans les tables de la tranche ───

type Phase = "not_open" | "open" | "closed"
type FakeSnapshot = {
  networkId: Id<"networks">
  requester: { personId: Id<"persons"> }
  responder: { pageId: Id<"pages"> } | { personId: Id<"persons"> }
  phase: Phase
  callsEngaged: boolean
  responderFirst: boolean
  attachments: { requester: boolean; responder: boolean }
  writeMinStatus: { requester: "declaree"; responder: "declaree" }
  moderationCountry: string | null
}
type FakeObject = { snapshot: FakeSnapshot | null; hiddenFrom: Set<string> }

const fakes = vi.hoisted(() => {
  const objects = new Map<string, FakeObject>()
  const ADDRESS = /\b\d{1,4},? (?:rue|avenue|boulevard)\b/iu
  const resolver = (kind: string) => ({
    kind,
    load: async (_ctx: unknown, id: string) => objects.get(id)?.snapshot ?? null,
    visibleTo: async (_ctx: unknown, id: string, personId: string) => {
      const object = objects.get(id)
      return object !== undefined && object.snapshot !== null && !object.hiddenFrom.has(personId)
    },
    // D8 : l'adresse exacte est refusée en voix de PERSONNE, admise en voix de PAGE.
    textRule: (input: { text: string; voice: string }) => (input.voice === "person" && ADDRESS.test(input.text) ? { ok: false as const, code: "context_address_forbidden" } : { ok: true as const }),
  })
  return {
    objects,
    registry: { diasporaServiceRequest: resolver("diasporaServiceRequest"), diasporaMentoring: resolver("diasporaMentoring"), diasporaJobApplication: resolver("diasporaJobApplication"), professionalCollaboration: resolver("professionalCollaboration") },
  }
})

vi.mock("./registry", () => ({ CONTEXTUAL_REGISTRY: fakes.registry, CONTEXTUAL_PENDING_KINDS: [] }))

// ─── Références des fonctions (le module est neuf : API générée à la prochaine génération) ───

type T = ReturnType<typeof testConvex>
type Actor = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }
type Net = { networkId: Id<"networks"> }
type Scope = Net & { threadId: Id<"contextualThreads"> }
type Mine = { items: ContextualThreadDto[]; nextCursor: unknown; isDone: boolean }
const base = "modules/contextualMessaging/"
const openForObject = makeFunctionReference<"mutation", Net & { context: ContextualObjectRef }, { threadId: Id<"contextualThreads">; created: boolean }>(`${base}threads:openForObject`)
const openForObjectLoose = makeFunctionReference<"mutation", Net & { context: { kind: string; id: string } }, unknown>(`${base}threads:openForObject`)
const getThread = makeFunctionReference<"query", Scope, ContextualThreadDto | null>(`${base}threads:getThread`)
const findForObject = makeFunctionReference<"query", Net & { context: ContextualObjectRef }, ContextualThreadDto | null>(`${base}threads:findForObject`)
const paginateMine = makeFunctionReference<"query", Net & { limit?: number }, Mine>(`${base}threads:paginateMine`)
const paginateForPage = makeFunctionReference<"query", Net & { pageId: Id<"pages">; paginationOpts: PaginationOptions }, PaginationResult<ContextualThreadDto>>(`${base}threads:paginateForPage`)
const markRead = makeFunctionReference<"mutation", Scope, null>(`${base}threads:markRead`)
const close = makeFunctionReference<"mutation", Scope & { expectedRevision: number }, null>(`${base}threads:close`)
const send = makeFunctionReference<"mutation", Scope & { text: string; attachments?: DeclaredAttachment[]; idempotencyKey: string }, { messageId: Id<"contextualMessages">; deduplicated: boolean }>(`${base}messages:send`)
const messages = makeFunctionReference<"query", Scope & { paginationOpts: PaginationOptions }, PaginationResult<ContextualMessageDto>>(`${base}messages:paginateMessages`)
const upload = makeFunctionReference<"mutation", Scope, string>(`${base}messages:generateUploadUrl`)
const removeMessage = makeFunctionReference<"mutation", Scope & { messageId: Id<"contextualMessages"> }, null>(`${base}messages:remove`)
const policies = makeFunctionReference<"query", Net, { kind: string; enabled: boolean; updatedAt: number | null }[]>(`${base}operator:policies`)
const setPolicy = makeFunctionReference<"mutation", Net & { kind: string; enabled: boolean; reason: string }, null>(`${base}operator:setPolicy`)
const commercialGetThreadLoose = makeFunctionReference<"query", Net & { threadId: string }, unknown>("modules/commercialMessaging/threads:getThread")
const contextualGetThreadLoose = makeFunctionReference<"query", Net & { threadId: string }, unknown>(`${base}threads:getThread`)

const NOW = Date.UTC(2026, 9, 19, 10)
const PAGE = { cursor: null, numItems: 20 }
let sequence = 0

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  fakes.objects.clear()
  sequence = 0
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function caught(work: Promise<unknown>): Promise<unknown> {
  try {
    await work
    return null
  } catch (error) {
    return error
  }
}

/** Un identifiant de forme valide pour la table, sans ligne : seul le registre de test le connaît. */
function fakeId<Table extends "serviceRequests" | "mentoringRequests" | "jobApplications" | "professionalCollaborations">(table: Table): Id<Table> {
  sequence += 1
  return `${900_000 + sequence}${table}` as Id<Table>
}

async function member(t: T, networkId: Id<"networks">, handle: string): Promise<Actor> {
  const as = t.withIdentity({ subject: `contextual-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId })
  return { as, personId, handle }
}

async function fixture({ openPolicies = true }: { openPolicies?: boolean } = {}) {
  const t = testConvex()
  const { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const requester = await member(t, root, "ctx-requester")
  const admin = await member(t, root, "ctx-admin")
  const teammate = await member(t, root, "ctx-teammate")
  const mentor = await member(t, root, "ctx-mentor")
  const stranger = await member(t, root, "ctx-stranger")
  const pageId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("pages", { networkId: root, handle: "ctx-salon", name: "Salon de recette", ownerKind: "company", trust: "community", trustRank: 1, visibility: "network", onRoot: true, status: "active", createdByPersonId: admin.personId, searchText: "salon recette", createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId: root, pageId: id, personId: admin.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId: root, pageId: id, personId: teammate.personId, role: "signatory", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    if (openPolicies) for (const kind of CONTEXTUAL_SUPPORTED_KINDS) await ctx.db.insert("contextualPolicies", { networkId: root, kind, enabled: true, updatedAt: NOW })
    return id
  })
  return { t, root, child: testClosed, requester, admin, teammate, mentor, stranger, pageId }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

function snapshotOf(f: Fixture, responder: FakeSnapshot["responder"], phase: Phase, responderFirst: boolean): FakeSnapshot {
  return {
    networkId: f.root,
    requester: { personId: f.requester.personId },
    responder,
    phase,
    callsEngaged: false,
    responderFirst,
    attachments: { requester: true, responder: true },
    writeMinStatus: { requester: "declaree", responder: "declaree" },
    moderationCountry: "FR",
  }
}

/** Une demande de service (côté page) ; `responderFirst` vrai en `sent`, faux après une proposition. */
function service(f: Fixture, phase: Phase = "open", responderFirst = false): ContextualObjectRef {
  const id = fakeId("serviceRequests")
  fakes.objects.set(id, { snapshot: snapshotOf(f, { pageId: f.pageId }, phase, responderFirst), hiddenFrom: new Set() })
  return { kind: "diasporaServiceRequest", id }
}
function mentoring(f: Fixture, phase: Phase = "open"): ContextualObjectRef {
  const id = fakeId("mentoringRequests")
  fakes.objects.set(id, { snapshot: snapshotOf(f, { personId: f.mentor.personId }, phase, false), hiddenFrom: new Set() })
  return { kind: "diasporaMentoring", id }
}
function application(f: Fixture, phase: Phase = "open"): ContextualObjectRef {
  const id = fakeId("jobApplications")
  fakes.objects.set(id, { snapshot: snapshotOf(f, { pageId: f.pageId }, phase, false), hiddenFrom: new Set() })
  return { kind: "diasporaJobApplication", id }
}
function update(ref: ContextualObjectRef, change: Partial<FakeSnapshot>): void {
  const object = fakes.objects.get(ref.id)
  if (!object?.snapshot) throw new Error("Objet de test absent")
  object.snapshot = { ...object.snapshot, ...change }
}

async function opened(f: Fixture, ref: ContextualObjectRef): Promise<Id<"contextualThreads">> {
  const result = await f.t.run(async (ctx) => await openContextualConversation(ctx, ref))
  if (!result.opened) throw new Error("Conversation de test non ouverte")
  return result.threadId
}
async function say(f: Fixture, who: Actor, threadId: Id<"contextualThreads">, text: string, idempotencyKey: string) {
  return await who.as.mutation(send, { networkId: f.root, threadId, text, idempotencyKey })
}
async function count(f: Fixture, table: "contextualThreads" | "contextualMessages" | "personalThreads" | "connections" | "follows" | "unreadTotals"): Promise<number> {
  return await f.t.run(async (ctx) => (await ctx.db.query(table).take(100)).length)
}
async function noticesFor(f: Fixture, personId: Id<"persons">): Promise<Doc<"notifications">[]> {
  return await f.t.run(async (ctx) => (await ctx.db.query("notifications").withIndex("by_network_recipient_createdAt", (q) => q.eq("networkId", f.root).eq("recipientPersonId", personId)).take(50)).filter((row) => row.kind === "contextual_message" || row.kind === "contextual_closed"))
}

// ═══════════════════════════════════════════════════════════════
// Accès et réseau (N01–N09)
// ═══════════════════════════════════════════════════════════════

describe("CC-2b — accès et réseau", () => {
  it("MP09 : le nouveau contexte reste soumis à la politique, aux parties et à sa référence propre", async () => {
    const f = await fixture({ openPolicies: false })
    const ref = { kind: "professionalCollaboration", id: fakeId("professionalCollaborations") } as const
    fakes.objects.set(ref.id, { snapshot: { ...snapshotOf(f, { personId: f.mentor.personId }, "open", false), callsEngaged: false, attachments: { requester: false, responder: false } }, hiddenFrom: new Set() })
    expect(await f.t.run(ctx => openContextualConversation(ctx, ref))).toEqual({ opened: false })
    await f.t.run(async ctx => { await ctx.db.insert("contextualPolicies", { networkId: f.root, kind: "professionalCollaboration", enabled: true, updatedAt: NOW }) })
    const threadId = await opened(f, ref)
    expect(await f.stranger.as.query(getThread, { networkId: f.root, threadId })).toBeNull()
    await say(f, f.requester, threadId, "Projet accepté", "professional-intent-01")
    expect(await count(f, "personalThreads")).toBe(0)
    expect(await count(f, "connections")).toBe(0)
    await f.t.run(async ctx => { await ctx.db.patch(threadId, { mentoringRequestId: fakeId("mentoringRequests") }) })
    expect(await f.requester.as.query(getThread, { networkId: f.root, threadId })).toBeNull()
  })

  it("N01 : un tiers lit `null` et écrit `notFound`, comme pour un identifiant inventé, sans aucun effet", async () => {
    const f = await fixture()
    const ref = service(f)
    const threadId = await opened(f, ref)
    const scope = { networkId: f.root, threadId }
    expect(await f.stranger.as.query(getThread, scope)).toBeNull()
    expect(await f.stranger.as.query(findForObject, { networkId: f.root, context: ref })).toBeNull()
    expect((await f.stranger.as.query(paginateMine, { networkId: f.root })).items).toEqual([])
    expect(await f.requester.as.query(getThread, { networkId: f.root, threadId: `${9_999_999}contextualThreads` as Id<"contextualThreads"> })).toBeNull()
    const writes = [
      () => f.stranger.as.mutation(send, { ...scope, text: "Bonjour", idempotencyKey: "stranger_0001" }),
      () => f.stranger.as.mutation(markRead, scope),
      () => f.stranger.as.mutation(close, { ...scope, expectedRevision: 1 }),
      () => f.stranger.as.mutation(upload, scope),
      () => f.stranger.as.mutation(openForObject, { networkId: f.root, context: ref }),
      () => f.stranger.as.query(messages, { ...scope, paginationOpts: PAGE }),
    ]
    for (const work of writes) expect(engineErrorCode(await caught(work()))).toBe("notFound")
    expect(await count(f, "contextualMessages")).toBe(0)
    expect(await f.t.run(async (ctx) => (await ctx.db.query("contextualPersonStates").take(5)).length)).toBe(0)
  })

  it("N02 : membre des deux réseaux, la personne ne lit pas depuis B un fil du réseau A", async () => {
    const f = await fixture()
    const threadId = await opened(f, service(f))
    await f.t.run(async (ctx) => {
      await ctx.db.insert("networkMemberships", { networkId: f.child, personId: f.requester.personId, status: "declaree", role: "member", joinedAt: NOW, statusChangedAt: NOW })
    })
    expect(await f.requester.as.query(getThread, { networkId: f.child, threadId })).toBeNull()
    expect(engineErrorCode(await caught(say({ ...f, root: f.child }, f.requester, threadId, "Depuis l'autre réseau", "cross_network_01")))).toBe("notFound")
    expect(await f.requester.as.query(getThread, { networkId: f.root, threadId })).not.toBeNull()
  })

  it("N03 : nature réservée ou inconnue et identifiant d'une autre table refusés par le validateur ; objet inconnu indistinct", async () => {
    const f = await fixture()
    const mentoringId = fakeId("mentoringRequests")
    for (const context of [{ kind: "shopContact", id: mentoringId }, { kind: "commerceJobApplication", id: mentoringId }, { kind: "inconnue", id: mentoringId }, { kind: "diasporaServiceRequest", id: mentoringId }]) {
      const error = await caught(f.requester.as.mutation(openForObjectLoose, { networkId: f.root, context }))
      expect(error, context.kind).not.toBeNull()
      // Un refus de validation n'est pas un refus du moteur : rien ne dit si l'objet existe.
      expect(engineErrorCode(error), context.kind).toBeNull()
    }
    expect(engineErrorCode(await caught(f.requester.as.mutation(openForObject, { networkId: f.root, context: { kind: "diasporaMentoring", id: mentoringId } })))).toBe("notFound")
    expect(await count(f, "contextualThreads")).toBe(0)
  })

  it("N04 : des clés de fil divergentes de l'objet rendent la conversation absente pour tous, sans écriture", async () => {
    const f = await fixture()
    const ref = service(f)
    const threadId = await opened(f, ref)
    update(ref, { requester: { personId: f.stranger.personId } })
    for (const who of [f.requester, f.admin, f.stranger]) expect(await who.as.query(getThread, { networkId: f.root, threadId }), who.handle).toBeNull()
    expect(engineErrorCode(await caught(say(f, f.admin, threadId, "Réponse", "diverge_00001")))).toBe("notFound")
    expect(await count(f, "contextualMessages")).toBe(0)
  })

  it("N05 : un signataire retiré n'a plus rien ; ses coéquipiers continuent ; son avis ancien ne se présente plus", async () => {
    const f = await fixture()
    const threadId = await opened(f, service(f))
    await say(f, f.requester, threadId, "Bonjour, une question sur la prestation.", "before_removal1")
    const [teammateNotice] = await noticesFor(f, f.teammate.personId)
    if (teammateNotice === undefined) throw new Error("Avis du coéquipier absent")
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("pageSignatories").withIndex("by_page_person", (q) => q.eq("pageId", f.pageId).eq("personId", f.teammate.personId)).unique()
      if (row) await ctx.db.delete(row._id)
    })
    const scope = { networkId: f.root, threadId }
    expect(await f.teammate.as.query(getThread, scope)).toBeNull()
    for (const work of [() => say(f, f.teammate, threadId, "Toujours là ?", "removed_00001"), () => f.teammate.as.mutation(upload, scope), () => f.teammate.as.mutation(markRead, scope)]) {
      expect(engineErrorCode(await caught(work()))).toBe("notFound")
    }
    expect(await f.admin.as.query(getThread, scope)).toMatchObject({ viewer: { side: "responder", voice: "page" }, state: { kind: "open" } })
    await say(f, f.admin, threadId, "Nous revenons vers vous.", "admin_answer01")
    const stillVisible = await f.t.run(async (ctx) => await notificationStillVisible(ctx, teammateNotice))
    expect(stillVisible).toBe(false)
    expect(await f.t.run(async (ctx) => await notificationOpenTargetOf(ctx, teammateNotice))).toBeNull()
    const bell = await f.teammate.as.query(api.modules.notifications.bell.paginateNotifications, { networkId: f.root, paginationOpts: PAGE })
    expect(bell.page.filter((row) => row.kind === "contextual_message")).toEqual([])
  })

  it("N06 : une page désactivée met le demandeur en lecture seule (indisponible) ; les signataires n'ont plus d'accès", async () => {
    const f = await fixture()
    const threadId = await opened(f, service(f))
    await f.t.run(async (ctx) => { await ctx.db.patch(f.pageId, { status: "inactive" }) })
    expect(await f.admin.as.query(getThread, { networkId: f.root, threadId })).toBeNull()
    expect(await f.requester.as.query(getThread, { networkId: f.root, threadId })).toMatchObject({ state: { kind: "read_only", reason: "unavailable" }, capabilities: { canSend: false }, counterpart: { kind: "page", page: null } })
    expect(engineErrorRule(await caught(say(f, f.requester, threadId, "Bonjour ?", "inactive_page1")))?.rule).toBe("CONTEXT_UNAVAILABLE")
  })

  it("N07 : une suspension racine refuse le demandeur au constructeur ; l'autre côté passe en lecture seule", async () => {
    const f = await fixture()
    const threadId = await opened(f, service(f))
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.root).eq("personId", f.requester.personId)).unique()
      if (row) await ctx.db.patch(row._id, { status: "suspendue", statusBeforeSuspension: "declaree" })
    })
    expect(engineErrorCode(await caught(f.requester.as.query(getThread, { networkId: f.root, threadId })))).toBe("membershipSuspended")
    expect(await f.admin.as.query(getThread, { networkId: f.root, threadId })).toMatchObject({ state: { kind: "read_only", reason: "unavailable" } })
  })

  it("N08 : un demandeur devenu signataire de la page répondante n'agit que comme demandeur", async () => {
    const f = await fixture()
    const threadId = await opened(f, service(f))
    await f.t.run(async (ctx) => { await ctx.db.insert("pageSignatories", { networkId: f.root, pageId: f.pageId, personId: f.requester.personId, role: "signatory", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW }) })
    expect(await f.requester.as.query(getThread, { networkId: f.root, threadId })).toMatchObject({ viewer: { side: "requester", voice: "person" } })
    const { messageId } = await say(f, f.requester, threadId, "Toujours en mon nom.", "own_voice_0001")
    expect(await f.t.run(async (ctx) => await ctx.db.get(messageId))).toMatchObject({ side: "requester", voice: "person", authorPersonId: f.requester.personId })
    // La liste de la page ne lui montre pas ce fil au nom de la page.
    expect((await f.requester.as.query(paginateForPage, { networkId: f.root, pageId: f.pageId, paginationOpts: PAGE })).page).toEqual([])
  })

  it("N09 : un objet en relecture est absent pour l'autre côté ; un objet retiré met la conversation en lecture seule", async () => {
    const f = await fixture()
    const ref = mentoring(f)
    const threadId = await opened(f, ref)
    fakes.objects.get(ref.id)?.hiddenFrom.add(f.mentor.personId)
    expect(await f.mentor.as.query(getThread, { networkId: f.root, threadId })).toBeNull()
    expect(await f.requester.as.query(getThread, { networkId: f.root, threadId })).not.toBeNull()
    fakes.objects.get(ref.id)?.hiddenFrom.clear()
    update(ref, { phase: "closed" })
    expect(await f.mentor.as.query(getThread, { networkId: f.root, threadId })).toMatchObject({ state: { kind: "read_only", reason: "closed" } })
    expect(engineErrorRule(await caught(say(f, f.mentor, threadId, "Encore là ?", "removed_obj01")))?.rule).toBe("CONTEXT_CLOSED")
  })
})

// ═══════════════════════════════════════════════════════════════
// Blocages (N10–N11)
// ═══════════════════════════════════════════════════════════════

describe("CC-2b — blocages", () => {
  it("N10 : un blocage demandeur ↔ signataire S rend le fil absent pour S seulement ; aucun avis pour S ; le déblocage rend l'accès", async () => {
    const f = await fixture()
    const threadId = await opened(f, service(f))
    const blockId = await f.t.run(async (ctx) => await ctx.db.insert("personBlocks", { networkId: f.root, blockerPersonId: f.requester.personId, targetPersonId: f.admin.personId, createdAt: NOW, updatedAt: NOW }))
    expect(await f.admin.as.query(getThread, { networkId: f.root, threadId })).toBeNull()
    expect(await f.teammate.as.query(getThread, { networkId: f.root, threadId })).not.toBeNull()
    await say(f, f.requester, threadId, "Une précision.", "blocked_pair01")
    expect(await noticesFor(f, f.admin.personId)).toEqual([])
    expect(await noticesFor(f, f.teammate.personId)).toHaveLength(1)
    await f.t.run(async (ctx) => { await ctx.db.delete(blockId) })
    expect(await f.admin.as.query(getThread, { networkId: f.root, threadId })).not.toBeNull()
  })

  it("N11 : un blocage mentoré ↔ mentor rend le fil absent pour les deux", async () => {
    const f = await fixture()
    const threadId = await opened(f, mentoring(f))
    await f.t.run(async (ctx) => { await ctx.db.insert("personBlocks", { networkId: f.root, blockerPersonId: f.mentor.personId, targetPersonId: f.requester.personId, createdAt: NOW, updatedAt: NOW }) })
    expect(await f.requester.as.query(getThread, { networkId: f.root, threadId })).toBeNull()
    expect(await f.mentor.as.query(getThread, { networkId: f.root, threadId })).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// Cycle et idempotence (N13–N21)
// ═══════════════════════════════════════════════════════════════

describe("CC-2b — cycle et idempotence", () => {
  it("N13 : crochet appelé deux fois et ouverture par les deux parties : un seul fil, sans message ni avis", async () => {
    const f = await fixture()
    const ref = mentoring(f)
    const first = await f.t.run(async (ctx) => await openContextualConversation(ctx, ref))
    const second = await f.t.run(async (ctx) => await openContextualConversation(ctx, ref))
    expect(first).toMatchObject({ opened: true, created: true })
    expect(second).toMatchObject({ opened: true, created: false })
    const byMentee = await f.requester.as.mutation(openForObject, { networkId: f.root, context: ref })
    const byMentor = await f.mentor.as.mutation(openForObject, { networkId: f.root, context: ref })
    expect(byMentee).toEqual({ threadId: byMentor.threadId, created: false })
    expect(await count(f, "contextualThreads")).toBe(1)
    expect(await count(f, "contextualMessages")).toBe(0)
    expect(await noticesFor(f, f.mentor.personId)).toEqual([])
  })

  it("N14 : `openForObject` sur un objet `not_open` : CONTEXT_NOT_OPEN pour une partie, `notFound` pour un tiers", async () => {
    const f = await fixture()
    const ref = mentoring(f, "not_open")
    expect(engineErrorRule(await caught(f.requester.as.mutation(openForObject, { networkId: f.root, context: ref })))?.rule).toBe("CONTEXT_NOT_OPEN")
    expect(engineErrorCode(await caught(f.stranger.as.mutation(openForObject, { networkId: f.root, context: ref })))).toBe("notFound")
    expect(await f.t.run(async (ctx) => await openContextualConversation(ctx, ref))).toEqual({ opened: false })
    expect(await count(f, "contextualThreads")).toBe(0)
  })

  it("N15 : politique fermée : ni ouverture ni écriture ; l'historique reste lisible ; rouvrir ne ravive pas un fil clos par un côté", async () => {
    const f = await fixture()
    const open = service(f)
    const threadId = await opened(f, open)
    await say(f, f.requester, threadId, "Avant la fermeture.", "before_policy1")
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("contextualPolicies").withIndex("by_network_kind", (q) => q.eq("networkId", f.root).eq("kind", "diasporaServiceRequest")).first()
      if (row) await ctx.db.patch(row._id, { enabled: false })
    })
    const fresh = service(f)
    expect(await f.t.run(async (ctx) => await openContextualConversation(ctx, fresh))).toEqual({ opened: false })
    expect(engineErrorRule(await caught(f.requester.as.mutation(openForObject, { networkId: f.root, context: fresh })))?.rule).toBe("CONTEXT_CLOSED")
    expect(engineErrorRule(await caught(say(f, f.admin, threadId, "Réponse", "closed_policy1")))?.rule).toBe("CONTEXT_CLOSED")
    const history = await f.admin.as.query(messages, { networkId: f.root, threadId, paginationOpts: PAGE })
    expect(history.page.map((row) => row.content)).toEqual(["Avant la fermeture."])
    expect(await f.admin.as.query(getThread, { networkId: f.root, threadId })).toMatchObject({ state: { kind: "read_only", reason: "closed" }, capabilities: { canClose: true } })
    const revision = (await f.admin.as.query(getThread, { networkId: f.root, threadId }))?.revision ?? 0
    await f.admin.as.mutation(close, { networkId: f.root, threadId, expectedRevision: revision })
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("contextualPolicies").withIndex("by_network_kind", (q) => q.eq("networkId", f.root).eq("kind", "diasporaServiceRequest")).first()
      if (row) await ctx.db.patch(row._id, { enabled: true })
    })
    expect(await f.requester.as.query(getThread, { networkId: f.root, threadId })).toMatchObject({ state: { kind: "read_only", reason: "closed" } })
  })

  it("N16 : pour chaque nature, la phase fermée refuse envoi et dépôt ; la lecture reste admise", async () => {
    const f = await fixture()
    for (const [ref, responder] of [[service(f), f.admin], [mentoring(f), f.mentor], [application(f), f.admin]] as const) {
      const threadId = await opened(f, ref)
      update(ref, { phase: "closed" })
      expect(await f.requester.as.query(getThread, { networkId: f.root, threadId }), ref.kind).toMatchObject({ state: { kind: "read_only", reason: "closed" } })
      expect(engineErrorRule(await caught(say(f, f.requester, threadId, "Fermé ?", `closed_${ref.kind}`)))?.rule, ref.kind).toBe("CONTEXT_CLOSED")
      expect(engineErrorRule(await caught(responder.as.mutation(upload, { networkId: f.root, threadId })))?.rule, ref.kind).toBe("CONTEXT_CLOSED")
      expect((await responder.as.query(messages, { networkId: f.root, threadId, paginationOpts: PAGE })).page, ref.kind).toEqual([])
    }
  })

  it("N17 / N21 : l'accès suit l'objet relu, jamais le cache : un crochet manqué ne change pas l'accès", async () => {
    const f = await fixture()
    const ref = service(f)
    const threadId = await opened(f, ref)
    update(ref, { phase: "closed" })
    // Aucun crochet : le cache dit encore « ouvert », l'objet relu dit « fermé ».
    expect(await f.t.run(async (ctx) => (await ctx.db.get(threadId))?.status)).toBe("open")
    expect(await f.requester.as.query(getThread, { networkId: f.root, threadId })).toMatchObject({ state: { kind: "read_only", reason: "closed" } })
    expect(await f.t.run(async (ctx) => await syncContextualConversation(ctx, ref))).toEqual({ threadId, change: "closed" })
    // L'objet rétabli (recours admis) rouvre le cache et l'écriture.
    update(ref, { phase: "open" })
    expect(await f.requester.as.query(getThread, { networkId: f.root, threadId })).toMatchObject({ state: { kind: "open" } })
    expect(await f.t.run(async (ctx) => await syncContextualConversation(ctx, ref))).toEqual({ threadId, change: "reopened" })
  })

  it("N18 : la clôture par un côté est irréversible, avertit l'autre côté sans contenu, laisse l'objet ; un nouvel objet ouvre un nouveau fil", async () => {
    const f = await fixture()
    const ref = service(f)
    const threadId = await opened(f, ref)
    const before = structuredClone(fakes.objects.get(ref.id)?.snapshot)
    const revision = (await f.requester.as.query(getThread, { networkId: f.root, threadId }))?.revision ?? 0
    expect(engineErrorCode(await caught(f.requester.as.mutation(close, { networkId: f.root, threadId, expectedRevision: revision + 5 })))).toBe("conflict")
    await f.requester.as.mutation(close, { networkId: f.root, threadId, expectedRevision: revision })
    expect(await f.t.run(async (ctx) => await ctx.db.get(threadId))).toMatchObject({ status: "closed", closedCause: "side", closedBySide: "requester" })
    expect(fakes.objects.get(ref.id)?.snapshot).toEqual(before)
    const [notice] = (await noticesFor(f, f.admin.personId)).filter((row) => row.kind === "contextual_closed")
    expect(notice).toMatchObject({ actorPersonId: f.requester.personId, subjectContextualThreadId: threadId })
    expect(engineErrorRule(await caught(say(f, f.admin, threadId, "Encore une chose", "after_close001")))?.rule).toBe("CONTEXT_CLOSED")
    expect(await f.t.run(async (ctx) => await syncContextualConversation(ctx, ref))).toEqual({ threadId, change: "unchanged" })
    expect(engineErrorRule(await caught(f.admin.as.mutation(close, { networkId: f.root, threadId, expectedRevision: revision + 1 })))?.rule).toBe("CONTEXT_CLOSED")
    const next = await opened(f, service(f))
    expect(next).not.toBe(threadId)
  })

  it("N19 : le rejeu d'un envoi après fermeture rend le message admis, sans en créer", async () => {
    const f = await fixture()
    const threadId = await opened(f, service(f))
    const first = await say(f, f.requester, threadId, "Message unique.", "replay_key_001")
    const revision = (await f.requester.as.query(getThread, { networkId: f.root, threadId }))?.revision ?? 0
    await f.admin.as.mutation(close, { networkId: f.root, threadId, expectedRevision: revision })
    expect(await say(f, f.requester, threadId, "Message unique.", "replay_key_001")).toEqual({ messageId: first.messageId, deduplicated: true })
    expect(await count(f, "contextualMessages")).toBe(1)
  })

  it("N20 : même clé, autre contenu : conflit ; la clé d'une autre personne ne donne jamais un faux succès", async () => {
    const f = await fixture()
    const threadId = await opened(f, service(f))
    const first = await say(f, f.requester, threadId, "Version A", "same_key_00001")
    const conflict = await caught(say(f, f.requester, threadId, "Version B", "same_key_00001"))
    expect(engineErrorCode(conflict)).toBe("conflict")
    expect(engineErrorRule(conflict)?.rule).toBe("CONTEXT_IDEMPOTENCY_CONFLICT")
    const other = await say(f, f.admin, threadId, "Version A", "same_key_00001")
    expect(other.deduplicated).toBe(false)
    expect(other.messageId).not.toBe(first.messageId)
    expect(engineErrorCode(await caught(say(f, f.requester, threadId, "x", "court")))).toBe("invalidArgument")
  })
})

// ═══════════════════════════════════════════════════════════════
// Débits et texte (N22–N24)
// ═══════════════════════════════════════════════════════════════

describe("CC-2b — débits et texte", () => {
  it("N22 : un compte léger relève du seau renforcé ; une équipe ne submerge pas un fil (seau par fil)", async () => {
    const f = await fixture()
    const threadId = await opened(f, service(f))
    // Membre `declaree` sans badge fort : `contextual.message.reinforced` (capacité 5) s'applique d'abord.
    for (let index = 0; index < 5; index += 1) await say(f, f.requester, threadId, `Message ${index}`, `burst_key_000${index}`)
    expect(engineErrorCode(await caught(say(f, f.requester, threadId, "Un de trop", "burst_key_0005")))).toBe("rateLimited")
    // Le seau du FIL (capacité 30, déjà entamé par les cinq messages) épuisé jusqu'au premier refus :
    // il refuse alors aussi un autre émetteur, quel que soit son côté.
    await f.t.run(async (ctx) => {
      for (let index = 0; index < 40; index += 1) {
        try {
          await enforceRateLimit(ctx, "contextual.thread", threadId)
        } catch {
          return
        }
      }
    })
    expect(engineErrorCode(await caught(say(f, f.admin, threadId, "Réponse d'équipe", "team_flood_001")))).toBe("rateLimited")
  })

  it("N23 : demande envoyée : le demandeur attend le premier mot du répondant, puis écrit librement", async () => {
    const f = await fixture()
    const ref = service(f, "open", true)
    const threadId = await opened(f, ref)
    expect(await f.requester.as.query(getThread, { networkId: f.root, threadId })).toMatchObject({ capabilities: { canSend: false }, sendRefusal: "CONTEXT_WAITING_RESPONDER" })
    expect(engineErrorRule(await caught(say(f, f.requester, threadId, "Je relance", "first_word_001")))?.rule).toBe("CONTEXT_WAITING_RESPONDER")
    await say(f, f.admin, threadId, "Bonjour, nous avons bien reçu votre demande.", "first_word_002")
    expect(await f.t.run(async (ctx) => (await ctx.db.get(threadId))?.responderSpokeAt)).toBe(NOW)
    await say(f, f.requester, threadId, "Merci !", "first_word_003")
    // Une proposition vaut premier mot (la tranche rend `responderFirst: false`).
    const proposed = service(f, "open", true)
    const proposedThread = await opened(f, proposed)
    update(proposed, { responderFirst: false })
    await say(f, f.requester, proposedThread, "Votre proposition me convient.", "first_word_004")
  })

  it("N24 : texte vide sans pièce, trop long, caractères de contrôle, adresse exacte en voix de personne : refus fermés ; la voix de page l'admet", async () => {
    const f = await fixture()
    const threadId = await opened(f, service(f))
    expect(engineErrorRule(await caught(say(f, f.requester, threadId, "   ", "text_empty_001")))?.rule).toBe("MESSAGE_EMPTY")
    expect(engineErrorRule(await caught(say(f, f.requester, threadId, "a".repeat(CONTEXTUAL_TEXT_MAX + 1), "text_long_0001")))).toEqual({ rule: "MESSAGE_TOO_LONG", params: { max: CONTEXTUAL_TEXT_MAX } })
    expect(engineErrorRule(await caught(say(f, f.requester, threadId, "bonjour\u0007", "text_ctrl_0001")))?.rule).toBe("CONTEXT_TEXT_CONTROL")
    const address = await caught(say(f, f.requester, threadId, "Je suis au 12 rue des Lilas", "text_addr_0001"))
    expect(engineErrorCode(address)).toBe("invalidArgument")
    expect(engineErrorAppRule(address)).toEqual({ appRule: "context_address_forbidden", appParams: {} })
    expect(JSON.stringify(address)).not.toContain("Lilas")
    await say(f, f.admin, threadId, "La prestation a lieu au 12 rue des Lilas.", "text_addr_0002")
  })
})

// ═══════════════════════════════════════════════════════════════
// Pièces (N25–N26)
// ═══════════════════════════════════════════════════════════════

describe("CC-2b — pièces par la garde des fichiers", () => {
  async function blob(f: Fixture, text: string, type = "text/plain"): Promise<Id<"_storage">> {
    return await f.t.run(async (ctx) => await ctx.storage.store(new Blob([text], { type })))
  }

  it("N25 : dépôt d'un tiers ou sans capacité refusé ; lot trop nombreux refusé avant le stockage ; poids mensonger ; dépôt d'autrui", async () => {
    const f = await fixture()
    const ref = service(f)
    const threadId = await opened(f, ref)
    const scope = { networkId: f.root, threadId }
    expect(engineErrorCode(await caught(f.stranger.as.mutation(upload, scope)))).toBe("notFound")
    update(ref, { attachments: { requester: false, responder: true } })
    expect(engineErrorRule(await caught(f.requester.as.mutation(upload, scope)))?.rule).toBe("CONTEXT_ATTACHMENTS_CLOSED")
    expect(typeof (await f.admin.as.mutation(upload, scope))).toBe("string")
    update(ref, { attachments: { requester: true, responder: true } })
    const spare = await blob(f, "pièce de trop")
    const spareSize = await f.t.run(async (ctx) => (await ctx.db.system.get("_storage", spare))?.size ?? 0)
    const file = { storageId: spare, filename: "trop.txt", mimeType: "text/plain", sizeBytes: spareSize }
    const tooMany = await caught(f.requester.as.mutation(send, { ...scope, text: "Trois pièces", attachments: [file, file, file], idempotencyKey: "three_files_01" }))
    expect(engineErrorRule(tooMany)).toEqual({ rule: "ATTACHMENTS_TOO_MANY", params: { max: 2 } })
    const storageId = await blob(f, "contenu réel")
    const lying = await caught(f.requester.as.mutation(send, { ...scope, text: "Pièce", attachments: [{ storageId, filename: "piece.txt", mimeType: "text/plain", sizeBytes: 999 }], idempotencyKey: "lying_size_001" }))
    expect(engineErrorRule(lying)?.rule).toBe("UPLOAD_MISMATCH")
    const real = await blob(f, "pièce admise")
    const size = await f.t.run(async (ctx) => (await ctx.db.system.get("_storage", real))?.size ?? 0)
    await f.requester.as.mutation(send, { ...scope, text: "", attachments: [{ storageId: real, filename: "admise.txt", mimeType: "text/plain", sizeBytes: size }], idempotencyKey: "real_file_0001" })
    // Le même dépôt, déclaré par un autre émetteur : jamais sa pièce.
    expect(engineErrorCode(await caught(f.admin.as.mutation(send, { ...scope, text: "Reprise", attachments: [{ storageId: real, filename: "admise.txt", mimeType: "text/plain", sizeBytes: size }], idempotencyKey: "stolen_file_01" })))).toBe("notFound")
  })

  it("N26 : une pièce en analyse ou en quarantaine reste une retenue nommée, sans URL ; le retrait d'un message purge ses blobs et le montre retiré à tous", async () => {
    const f = await fixture()
    const threadId = await opened(f, service(f))
    const scope = { networkId: f.root, threadId }
    const storageId = await blob(f, "pièce à retirer")
    const size = await f.t.run(async (ctx) => (await ctx.db.system.get("_storage", storageId))?.size ?? 0)
    const { messageId } = await f.requester.as.mutation(send, { ...scope, text: "Avec pièce", attachments: [{ storageId, filename: "retrait.txt", mimeType: "text/plain", sizeBytes: size }], idempotencyKey: "remove_file_01" })
    const [delivered] = (await f.admin.as.query(messages, { ...scope, paginationOpts: PAGE })).page
    // Analyse non faite : retenue nommée, jamais une URL fabriquée.
    expect(delivered?.attachmentFiles[0]).toMatchObject({ url: null, withheld: "fileScanPending" })
    // Mise en quarantaine par l'analyse : toujours une retenue nommée, jamais une URL.
    await f.t.run(async (ctx) => {
      const scan = await ctx.db.query("fileScans").withIndex("by_storageId", (q) => q.eq("storageId", storageId)).first()
      if (scan) await ctx.db.patch(scan._id, { status: "infected", updatedAt: NOW })
    })
    const [quarantined] = (await f.admin.as.query(messages, { ...scope, paginationOpts: PAGE })).page
    expect(quarantined?.attachmentFiles[0]).toMatchObject({ url: null, withheld: "fileQuarantined" })
    expect(engineErrorCode(await caught(f.admin.as.mutation(removeMessage, { ...scope, messageId })))).toBe("notFound")
    await f.requester.as.mutation(removeMessage, { ...scope, messageId })
    expect(await f.t.run(async (ctx) => await ctx.db.system.get("_storage", storageId))).toBeNull()
    const [removed] = (await f.admin.as.query(messages, { ...scope, paginationOpts: PAGE })).page
    expect(removed).toMatchObject({ deleted: true, content: null, attachmentFiles: [] })
  })
})

// ═══════════════════════════════════════════════════════════════
// Avis (N32–N35)
// ═══════════════════════════════════════════════════════════════

describe("CC-2b — avis neutres", () => {
  // Les colonnes d'une ligne d'avis contextuel : références et horodatages, jamais un contenu.
  const ALLOWED_NOTICE_FIELDS = ["_creationTime", "_id", "actorPersonId", "createdAt", "dedupKey", "kind", "networkId", "readAt", "recipientPersonId", "resolution", "resolvedAt", "subjectContextualThreadId"]

  it("N32 / N33 : aucun contenu ; en voix de page, aucun acteur et une seule ligne par fil ; le demandeur n'apprend jamais quel signataire a écrit", async () => {
    const f = await fixture()
    const threadId = await opened(f, service(f))
    await say(f, f.requester, threadId, "Texte privé du demandeur", "notice_req_001")
    for (const row of [...(await noticesFor(f, f.admin.personId)), ...(await noticesFor(f, f.teammate.personId))]) {
      expect(Object.keys(row).filter((key) => !ALLOWED_NOTICE_FIELDS.includes(key))).toEqual([])
      expect(row).toMatchObject({ kind: "contextual_message", actorPersonId: f.requester.personId, subjectContextualThreadId: threadId })
      expect(JSON.stringify(row)).not.toContain("Texte privé")
    }
    await say(f, f.admin, threadId, "Réponse de l'administrateur", "notice_page_01")
    await say(f, f.teammate, threadId, "Réponse du coéquipier", "notice_page_02")
    const toRequester = await noticesFor(f, f.requester.personId)
    expect(toRequester).toHaveLength(1)
    expect(toRequester[0]?.actorPersonId).toBeUndefined()
    expect(toRequester[0]?.dedupKey.endsWith("|-")).toBe(true)
    const bell = await f.requester.as.query(api.modules.notifications.bell.paginateNotifications, { networkId: f.root, paginationOpts: PAGE })
    const line = bell.page.find((row) => row.kind === "contextual_message")
    expect(line?.actor).toBeNull()
    expect(line?.target).toMatchObject({ kind: "contextualThread", threadId, contextKind: "diasporaServiceRequest", side: "requester", pageHandle: "ctx-salon" })
    expect(JSON.stringify(line)).not.toContain(f.admin.personId)
    expect(JSON.stringify(line)).not.toContain(f.teammate.personId)
    const page = await f.requester.as.query(messages, { networkId: f.root, threadId, paginationOpts: PAGE })
    for (const row of page.page.filter((message) => message.voice === "page")) expect(row.sender).toMatchObject({ kind: "page", teammate: null })
    const team = await f.admin.as.query(messages, { networkId: f.root, threadId, paginationOpts: PAGE })
    expect(team.page.find((message) => message.content === "Réponse du coéquipier")?.sender).toMatchObject({ kind: "page", teammate: { handle: "ctx-teammate" } })
  })

  it("N34 : le destinataire est relu à la lecture et à l'ouverture ; ouvrir ne marque rien comme lu", async () => {
    const f = await fixture()
    const threadId = await opened(f, mentoring(f))
    await say(f, f.requester, threadId, "Bonjour", "notice_read_01")
    const [notice] = await noticesFor(f, f.mentor.personId)
    if (notice === undefined) throw new Error("Avis du mentor absent")
    expect(await f.t.run(async (ctx) => await notificationOpenTargetOf(ctx, notice))).toMatchObject({ kind: "contextualThread", side: "responder", pageHandle: null })
    // Assertion DANS le rappel : `t.run` sérialise sa valeur de retour et rend `null` pour `undefined`.
    await f.t.run(async (ctx) => { expect((await ctx.db.get(notice._id))?.readAt).toBeUndefined() })
    await f.t.run(async (ctx) => { await ctx.db.insert("personBlocks", { networkId: f.root, blockerPersonId: f.mentor.personId, targetPersonId: f.requester.personId, createdAt: NOW, updatedAt: NOW }) })
    expect(await f.t.run(async (ctx) => await notificationStillVisible(ctx, notice))).toBe(false)
    expect(await f.t.run(async (ctx) => await notificationOpenTargetOf(ctx, notice))).toBeNull()
  })

  it("N35 : un message en relecture n'émet aucun avis et n'est lu que de son auteur", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => { await ctx.db.insert("moderationPolicies", { networkId: f.root, surface: "contextualMessage", preReview: true, maxLinks: 20, maxWrites: 100, windowMs: 60_000, updatedAt: NOW }) })
    const threadId = await opened(f, service(f))
    await say(f, f.requester, threadId, "En relecture", "pending_msg_01")
    expect(await noticesFor(f, f.admin.personId)).toEqual([])
    const own = (await f.requester.as.query(messages, { networkId: f.root, threadId, paginationOpts: PAGE })).page[0]
    const other = (await f.admin.as.query(messages, { networkId: f.root, threadId, paginationOpts: PAGE })).page[0]
    expect(own).toMatchObject({ content: "En relecture", withheld: false })
    expect(other).toMatchObject({ content: null, withheld: true })
  })
})

// ═══════════════════════════════════════════════════════════════
// Modération (N36–N38)
// ═══════════════════════════════════════════════════════════════

describe("CC-2b — modération par la surface unique `contextualMessage`", () => {
  async function moderator(f: Fixture, who: Actor): Promise<void> {
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.root).eq("personId", who.personId)).unique()
      if (row) await ctx.db.patch(row._id, { role: "network_admin" })
    })
  }

  it("N36 : un tiers ne signale rien ; personne ne signale son propre message ; un signataire ne signale pas la voix de sa page", async () => {
    const f = await fixture()
    const threadId = await opened(f, service(f))
    const fromRequester = await say(f, f.requester, threadId, "Message du demandeur", "report_req_001")
    const fromPage = await say(f, f.admin, threadId, "Message de la page", "report_page_01")
    const report = (who: Actor, id: Id<"contextualMessages">) => who.as.mutation(api.modules.moderation.cases.report, { networkId: f.root, target: { kind: "contextualMessage", id }, reason: "harassment" })
    expect(engineErrorCode(await caught(report(f.stranger, fromRequester.messageId)))).toBe("notFound")
    expect(engineErrorCode(await caught(report(f.requester, fromRequester.messageId)))).toBe("notFound")
    expect(engineErrorCode(await caught(report(f.teammate, fromPage.messageId)))).toBe("notFound")
    expect(await report(f.teammate, fromRequester.messageId)).toMatchObject({ created: true })
    expect(await report(f.requester, fromPage.messageId)).toMatchObject({ created: true })
  })

  it("N37 : l'aperçu ne montre que le message ; la nature vient du fil", async () => {
    const f = await fixture()
    await moderator(f, f.stranger)
    const threadId = await opened(f, application(f))
    const { messageId } = await say(f, f.requester, threadId, "Message signalé", "preview_msg_01")
    await say(f, f.requester, threadId, "Message voisin", "preview_msg_02")
    const { reportId } = await f.teammate.as.mutation(api.modules.moderation.cases.report, { networkId: f.root, target: { kind: "contextualMessage", id: messageId }, reason: "harassment" })
    const preview = await f.stranger.as.query(api.modules.moderation.reviewProjection.preview, { networkId: f.root, reportId })
    expect(preview).toEqual({ kind: "contextualMessage", available: true, title: null, body: "Message signalé", media: [], context: { kind: "diasporaJobApplication" } })
    expect(JSON.stringify(preview)).not.toContain("voisin")
  })

  it("N38 : une partie ne décide jamais du dossier ; un message retiré est retenu pour tous", async () => {
    const f = await fixture()
    await moderator(f, f.admin)
    await moderator(f, f.stranger)
    const threadId = await opened(f, service(f))
    const { messageId } = await say(f, f.requester, threadId, "À retirer", "decide_msg_001")
    const { reportId } = await f.teammate.as.mutation(api.modules.moderation.cases.report, { networkId: f.root, target: { kind: "contextualMessage", id: messageId }, reason: "harassment" })
    const decide = (who: Actor) => who.as.mutation(api.modules.moderation.cases.decide, { networkId: f.root, reportId, decision: "actioned", reason: "Retrait motivé du message signalé", sanctions: [] })
    expect(engineErrorCode(await caught(decide(f.admin)))).toBe("notFound")
    await decide(f.stranger)
    for (const who of [f.requester, f.admin]) {
      const [row] = (await who.as.query(messages, { networkId: f.root, threadId, paginationOpts: PAGE })).page
      expect(row, who.handle).toMatchObject({ withheld: true, content: null, attachmentFiles: [] })
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// Export et effacement (N39–N42) — classification et projections
// ═══════════════════════════════════════════════════════════════

describe("CC-2b — export et effacement", () => {
  const thread: DataRecord = { _id: "thread_1", _creationTime: 1, networkId: "network_1", kind: "diasporaServiceRequest", contextKey: "diasporaServiceRequest:request_1", serviceRequestId: "request_1", requesterPersonId: "requester", responderPageId: "page_1", status: "open", revision: 3, lastMessageAt: 5, createdAt: 1, updatedAt: 5 }
  const personVoice: DataRecord = { _id: "message_1", _creationTime: 2, networkId: "network_1", threadId: "thread_1", side: "requester", voice: "person", authorPersonId: "requester", content: "Mon message", attachmentFiles: [{ storageId: "storage_1", filename: "a.pdf", mimeType: "application/pdf", sizeBytes: 10 }], idempotencyKey: "secret_key_001", digest: "abc", createdAt: 2 }
  const pageVoice: DataRecord = { _id: "message_2", _creationTime: 3, networkId: "network_1", threadId: "thread_1", side: "responder", voice: "page", pageSpeakerPersonId: "signatory", content: "Réponse de la page", idempotencyKey: "page_key_0001", digest: "def", createdAt: 3 }

  it("N39 : chacun exporte ses messages en voix de personne et la projection du fil ; jamais le contenu d'autrui, une clé, une empreinte ni un stockage", () => {
    const own = exportableRecord("contextualMessages", personVoice, "requester")
    expect(own).toMatchObject({ content: "Mon message", attachmentFiles: [{ filename: "a.pdf", mimeType: "application/pdf", sizeBytes: 10, durationMs: null }] })
    expect(JSON.stringify(own)).not.toMatch(/secret_key_001|"abc"|storage_1/u)
    // D13 (à confirmer juridiquement) : le signataire ne reçoit qu'une trace sans contenu.
    const trace = exportableRecord("contextualMessages", pageVoice, "signatory")
    expect(trace).toMatchObject({ voice: "page", side: "responder" })
    expect(trace?.content).toBeUndefined()
    expect(exportableRecord("contextualMessages", pageVoice, "requester")).toBeNull()
    expect(exportableRecord("contextualMessages", personVoice, "signatory")).toBeNull()
    expect(exportableRecord("contextualThreads", thread, "requester")).toMatchObject({ side: "requester", kind: "diasporaServiceRequest", serviceRequestId: "request_1", status: "open" })
    expect(exportableRecord("contextualThreads", thread, "signatory")).toBeNull()
    expect(exportableRecord("contextualPolicies", { _id: "policy_1", _creationTime: 1, networkId: "network_1", kind: "diasporaMentoring", enabled: true, updatedAt: 1, updatedByPersonId: "operator" }, "operator")).toBeNull()
  })

  it("N40 / N42 : le fil suit son objet ; messages des deux côtés, états personnels et états de modération suivent le fil", () => {
    expect(DATA_TABLE_POLICIES.contextualThreads).toEqual({ owners: [], parents: ["serviceRequestId", "mentoringRequestId", "jobApplicationId", "professionalCollaborationId"] })
    expect(DATA_TABLE_POLICIES.contextualMessages?.parents).toEqual(["threadId"])
    expect(DATA_TABLE_POLICIES.contextualPersonStates?.parents).toEqual(["threadId"])
    expect(DATA_TABLE_POLICIES.moderationContentStates?.parents).toContain("targetId")
    // Les demandes appartiennent au demandeur ; le mentorat aux DEUX parties (l'effacement du mentor emporte tout le fil).
    expect(DATA_TABLE_POLICIES.mentoringRequests?.owners).toEqual(expect.arrayContaining(["menteePersonId", "mentorPersonId"]))
    expect(directlyOwned("contextualThreads", thread, "requester")).toBe(false)
    expect(directlyOwned("contextualMessages", personVoice, "requester")).toBe(true)
  })

  it("N41 : l'effacement d'un signataire laisse ses messages en voix de page, sans la référence d'audit", () => {
    expect(directlyOwned("contextualMessages", pageVoice, "signatory")).toBe(false)
    const anonymized = anonymizeReferences(pageVoice, shapeFor("contextualMessages"), "signatory", "anonymous_person") as Record<string, unknown>
    expect(anonymized.pageSpeakerPersonId).toBeUndefined()
    expect(anonymized.content).toBe("Réponse de la page")
    expect(directlyOwned("contextualPersonStates", { _id: "state_1", _creationTime: 1, networkId: "network_1", threadId: "thread_1", personId: "signatory", readAt: 1, updatedAt: 1 }, "signatory")).toBe(true)
  })

  it("purge bornée : vingt messages par tranche, blobs et états de modération compris, puis états et fil", async () => {
    const f = await fixture()
    const ref = service(f)
    const threadId = await opened(f, ref)
    await f.t.run(async (ctx) => {
      for (let index = 0; index < 25; index += 1) {
        const id = await ctx.db.insert("contextualMessages", { networkId: f.root, threadId, side: "requester", voice: "person", authorPersonId: f.requester.personId, content: `m${index}`, idempotencyKey: `purge_key_${String(index).padStart(4, "0")}`, digest: "d", createdAt: NOW + index })
        await ctx.db.insert("moderationContentStates", { networkId: f.root, targetKind: "contextualMessage", targetId: id, ownerPersonId: f.requester.personId, status: "published", createdAt: NOW, updatedAt: NOW })
      }
    })
    expect(await f.t.run(async (ctx) => await purgeContextualConversation(ctx, ref))).toEqual({ scheduled: true })
    expect(await f.t.run(async (ctx) => await purgeContextualThreadSlice(ctx, threadId))).toBe(false)
    expect(await count(f, "contextualMessages")).toBe(5)
    expect(await f.t.run(async (ctx) => await purgeContextualThreadSlice(ctx, threadId))).toBe(true)
    expect(await count(f, "contextualThreads")).toBe(0)
    expect(await f.t.run(async (ctx) => (await ctx.db.query("moderationContentStates").take(50)).filter((row) => row.targetKind === "contextualMessage").length)).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// Politique en console, listes, non-régression et étanchéité (N43–N45)
// ═══════════════════════════════════════════════════════════════

describe("CC-2b — politique, listes, non-régression", () => {
  it("la politique est fermée sans ligne ; seul un administrateur de plateforme l'ouvre, avec un motif et une ligne de journal", async () => {
    const f = await fixture({ openPolicies: false })
    const ref = service(f)
    expect(await f.t.run(async (ctx) => await openContextualConversation(ctx, ref))).toEqual({ opened: false })
    await f.t.run(async (ctx) => { await ctx.db.insert("operators", { personId: f.stranger.personId, role: "platform_admin", grantedAt: NOW }) })
    await createTestOperatorProof(f.t, f.stranger.as, f.stranger.personId)
    expect(engineErrorCode(await caught(f.requester.as.mutation(setPolicy, { networkId: f.root, kind: "diasporaServiceRequest", enabled: true, reason: "Ouverture fictive de recette" })))).toBe("operatorRequired")
    expect(engineErrorRule(await caught(f.stranger.as.mutation(setPolicy, { networkId: f.root, kind: "diasporaServiceRequest", enabled: true, reason: "court" })))?.rule).toBe("DECISION_REASON_LENGTH")
    await f.stranger.as.mutation(setPolicy, { networkId: f.root, kind: "diasporaServiceRequest", enabled: true, reason: "Ouverture fictive de recette" })
    expect(await f.stranger.as.query(policies, { networkId: f.root })).toEqual([
      { kind: "diasporaServiceRequest", enabled: true, updatedAt: NOW },
      { kind: "diasporaMentoring", enabled: false, updatedAt: null },
      { kind: "diasporaJobApplication", enabled: false, updatedAt: null },
      { kind: "professionalCollaboration", enabled: false, updatedAt: null },
    ])
    const audit = await f.t.run(async (ctx) => (await ctx.db.query("engineAudit").take(100)).filter((row) => row.action === "contextual.policy_set"))
    expect(audit).toHaveLength(1)
    expect(audit[0]?.details).toMatchObject({ kind: "diasporaServiceRequest", enabled: true })
    expect(await f.t.run(async (ctx) => await openContextualConversation(ctx, ref))).toMatchObject({ opened: true, created: true })
  })

  it("listes : mes fils (demandeur et répondant-personne) et ceux de la page, chaque ligne relue", async () => {
    const f = await fixture()
    const serviceThread = await opened(f, service(f))
    const mentoringThread = await opened(f, mentoring(f))
    const mine = await f.requester.as.query(paginateMine, { networkId: f.root })
    expect(mine.items.map((row) => row.threadId).sort()).toEqual([serviceThread, mentoringThread].sort())
    expect(mine.isDone).toBe(true)
    expect((await f.mentor.as.query(paginateMine, { networkId: f.root })).items.map((row) => row.threadId)).toEqual([mentoringThread])
    expect((await f.admin.as.query(paginateForPage, { networkId: f.root, pageId: f.pageId, paginationOpts: PAGE })).page.map((row) => row.threadId)).toEqual([serviceThread])
    expect(engineErrorCode(await caught(f.stranger.as.query(paginateForPage, { networkId: f.root, pageId: f.pageId, paginationOpts: PAGE })))).toBe("notFound")
    // Le non-lu compare des dates : le message arrive APRÈS l'ouverture (horloge figée sinon).
    vi.setSystemTime(NOW + 60_000)
    await say(f, f.requester, serviceThread, "Nouveau", "unread_mark_001")
    expect(await f.admin.as.query(getThread, { networkId: f.root, threadId: serviceThread })).toMatchObject({ unread: true })
    await f.admin.as.mutation(markRead, { networkId: f.root, threadId: serviceThread })
    expect(await f.admin.as.query(getThread, { networkId: f.root, threadId: serviceThread })).toMatchObject({ unread: false })
  })

  it("N43 : une conversation contextuelle ne crée ni fil personnel, ni relation, ni suivi, ni total non lu ; la garde personnelle reste", async () => {
    const f = await fixture()
    const tables = ["personalThreads", "connections", "follows", "unreadTotals"] as const
    const before = new Map<string, number>()
    for (const table of tables) before.set(table, await count(f, table))
    const threadId = await opened(f, mentoring(f))
    await say(f, f.requester, threadId, "Bonjour mentor", "personal_guard1")
    await say(f, f.mentor, threadId, "Bonjour", "personal_guard2")
    for (const table of tables) expect(await count(f, table), table).toBe(before.get(table))
    const refused = await caught(f.mentor.as.mutation(api.modules.messaging.inbox.startThreadWithHandle, { networkId: f.root, handle: f.requester.handle, initialMessage: "Bonjour en privé" }))
    expect(engineErrorRule(refused)?.rule).toBe("THREAD_RELATION_REQUIRED")
    expect(await count(f, "personalThreads")).toBe(before.get("personalThreads"))
  })

  it("N44 : aucun identifiant n'est converti d'une famille à l'autre", async () => {
    const f = await fixture()
    const threadId = await opened(f, service(f))
    expect(await caught(f.requester.as.query(commercialGetThreadLoose, { networkId: f.root, threadId }))).not.toBeNull()
    const commercialId = `${7_000_001}commercialThreads`
    expect(await caught(f.requester.as.query(contextualGetThreadLoose, { networkId: f.root, threadId: commercialId }))).not.toBeNull()
  })

  it("N45 : une nature sans résolveur enregistré est indisponible pour tous (repli sûr)", async () => {
    const f = await fixture()
    const ref = mentoring(f)
    const saved = fakes.registry.diasporaMentoring
    try {
      Object.assign(fakes.registry, { diasporaMentoring: null })
      expect(await f.t.run(async (ctx) => await openContextualConversation(ctx, ref))).toEqual({ opened: false })
      expect(engineErrorCode(await caught(f.requester.as.mutation(openForObject, { networkId: f.root, context: ref })))).toBe("notFound")
    } finally {
      Object.assign(fakes.registry, { diasporaMentoring: saved })
    }
  })
})
