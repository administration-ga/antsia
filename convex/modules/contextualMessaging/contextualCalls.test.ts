// @vitest-environment edge-runtime
/**
 * CC-4 (contrat CONVERSATION-CONTEXTUELLE-V1 §5.8, §11.3, §12 : N12, N27–N31 ; ADR-0025, D5 amendé
 * option (a)) — appels de la conversation contextuelle. Scénarios ÉCRITS, NON EXÉCUTÉS (décision du
 * propriétaire du 18/10/2026 : « Continuer sans vérifier »). Sessions Better Auth réelles ; les
 * résolveurs de la tranche sont SIMULÉS par un registre de test injecté (module `./registry`
 * remplacé, comme `contextualMessaging.test.ts`) : aucun résolveur de test n'est enregistré dans le
 * moteur.
 *
 * À la réouverture des contrôles : `bunx vitest run --config convex/vitest.config.ts modules/contextualMessaging`.
 */
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { CONTEXTUAL_SUPPORTED_KINDS } from "@antsia/social-domain/contextualMessaging"
import { makeFunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { type DirectCallResult, placeDirectCall } from "../calls/direct"
import { notificationStillVisible } from "../notifications/policy"
import type { ContextualObjectRef } from "./contract"
import { openContextualConversation, syncContextualConversation } from "./hooks"
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
  const resolver = (kind: string) => ({
    kind,
    load: async (_ctx: unknown, id: string) => objects.get(id)?.snapshot ?? null,
    visibleTo: async (_ctx: unknown, id: string, personId: string) => {
      const object = objects.get(id)
      return object !== undefined && object.snapshot !== null && !object.hiddenFrom.has(personId)
    },
  })
  return {
    objects,
    registry: { diasporaServiceRequest: resolver("diasporaServiceRequest"), diasporaMentoring: resolver("diasporaMentoring"), diasporaJobApplication: resolver("diasporaJobApplication"), professionalCollaboration: resolver("professionalCollaboration") },
  }
})

vi.mock("./registry", () => ({ CONTEXTUAL_REGISTRY: fakes.registry, CONTEXTUAL_PENDING_KINDS: [] }))

// ─── Références des fonctions (portes CC-4 neuves : référencées par chemin, comme le test du moteur) ───

type T = ReturnType<typeof testConvex>
type Actor = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }
type Scope = { networkId: Id<"networks">; threadId: Id<"contextualThreads"> }
const base = "modules/contextualMessaging/"
const setCallConsent = makeFunctionReference<"mutation", Scope & { allowed: boolean }, null>(`${base}calls:setCallConsent`)
const startCall = makeFunctionReference<"mutation", Scope & { targetPersonId?: Id<"persons">; mediaType: "audio" | "video" }, DirectCallResult>(`${base}calls:start`)
const startCallLoose = makeFunctionReference<"mutation", { networkId: Id<"networks">; threadId: string; mediaType: "audio" }, unknown>(`${base}calls:start`)
const getThread = makeFunctionReference<"query", Scope, ContextualThreadDto | null>(`${base}threads:getThread`)
const closeThread = makeFunctionReference<"mutation", Scope & { expectedRevision: number }, null>(`${base}threads:close`)
const revalidateCalls = makeFunctionReference<"mutation", { cursor?: string }, number>(`${base}retention:revalidateCalls`)
const C = api.modules.calls

const NOW = Date.UTC(2026, 9, 19, 14)
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

/** Avance l'horloge sans déclencher de minuteur : deux gestes ne partagent pas la même milliseconde. */
function tick(ms = 1000): void {
  vi.setSystemTime(Date.now() + ms)
}

/** Un identifiant de forme valide pour la table, sans ligne : seul le registre de test le connaît. */
function fakeId<Table extends "serviceRequests" | "mentoringRequests" | "jobApplications">(table: Table): Id<Table> {
  sequence += 1
  return `${910_000 + sequence}${table}` as Id<Table>
}

async function member(t: T, networkId: Id<"networks">, handle: string): Promise<Actor> {
  const as = t.withIdentity({ subject: `contextual-call-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId })
  return { as, personId, handle }
}

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const requester = await member(t, root, "call-requester")
  const admin = await member(t, root, "call-admin")
  const teammate = await member(t, root, "call-teammate")
  const mentor = await member(t, root, "call-mentor")
  const stranger = await member(t, root, "call-stranger")
  const pageId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("pages", { networkId: root, handle: "call-salon", name: "Salon des appels", ownerKind: "company", trust: "community", trustRank: 1, visibility: "network", onRoot: true, status: "active", createdByPersonId: admin.personId, searchText: "salon appels", createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId: root, pageId: id, personId: admin.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId: root, pageId: id, personId: teammate.personId, role: "signatory", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    for (const kind of CONTEXTUAL_SUPPORTED_KINDS) await ctx.db.insert("contextualPolicies", { networkId: root, kind, enabled: true, updatedAt: NOW })
    return id
  })
  return { t, root, requester, admin, teammate, mentor, stranger, pageId }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

/** Un objet ouvert ; la phase « engagée » pour les appels est un fait de la tranche (`callsEngaged`). */
function snapshotOf(f: Fixture, responder: FakeSnapshot["responder"], callsEngaged: boolean): FakeSnapshot {
  return {
    networkId: f.root,
    requester: { personId: f.requester.personId },
    responder,
    phase: "open",
    callsEngaged,
    responderFirst: false,
    attachments: { requester: true, responder: true },
    writeMinStatus: { requester: "declaree", responder: "declaree" },
    moderationCountry: "FR",
  }
}

/** Une demande de service (côté page) : `callsEngaged` faux en `sent`, vrai après une proposition (D5). */
function service(f: Fixture, callsEngaged = true): ContextualObjectRef {
  const id = fakeId("serviceRequests")
  fakes.objects.set(id, { snapshot: snapshotOf(f, { pageId: f.pageId }, callsEngaged), hiddenFrom: new Set() })
  return { kind: "diasporaServiceRequest", id }
}
function mentoring(f: Fixture, callsEngaged = true): ContextualObjectRef {
  const id = fakeId("mentoringRequests")
  fakes.objects.set(id, { snapshot: snapshotOf(f, { personId: f.mentor.personId }, callsEngaged), hiddenFrom: new Set() })
  return { kind: "diasporaMentoring", id }
}
function application(f: Fixture): ContextualObjectRef {
  const id = fakeId("jobApplications")
  fakes.objects.set(id, { snapshot: snapshotOf(f, { pageId: f.pageId }, true), hiddenFrom: new Set() })
  return { kind: "diasporaJobApplication", id }
}
function update(ref: ContextualObjectRef, change: Partial<FakeSnapshot>): void {
  const object = fakes.objects.get(ref.id)
  if (!object?.snapshot) throw new Error("Objet de test absent")
  object.snapshot = { ...object.snapshot, ...change }
}

async function opened(f: Fixture, ref: ContextualObjectRef): Promise<Scope> {
  const result = await f.t.run(async (ctx) => await openContextualConversation(ctx, ref))
  if (!result.opened) throw new Error("Conversation de test non ouverte")
  return { networkId: f.root, threadId: result.threadId }
}

async function consent(who: Actor, scope: Scope, allowed = true): Promise<void> {
  await who.as.mutation(setCallConsent, { ...scope, allowed })
}

async function place(who: Actor, scope: Scope, targetPersonId?: Id<"persons">): Promise<DirectCallResult> {
  return await who.as.mutation(startCall, { ...scope, mediaType: "audio", ...(targetPersonId !== undefined ? { targetPersonId } : {}) })
}

/** Un appel contextuel ADMIS et qui sonne (l'appelant a rejoint sa salle). */
async function ringing(who: Actor, scope: Scope, targetPersonId?: Id<"persons">): Promise<Id<"calls">> {
  const placed = await place(who, scope, targetPersonId)
  if (!placed.admitted) throw new Error(`appel contextuel refusé : ${placed.reason}`)
  await who.as.mutation(C.lifecycle.join, { networkId: scope.networkId, callId: placed.callId })
  await who.as.mutation(C.lifecycle.setCallRinging, { networkId: scope.networkId, callId: placed.callId })
  return placed.callId
}

async function callDoc(f: Fixture, callId: Id<"calls">) {
  return await f.t.run(async (ctx) => await ctx.db.get(callId))
}
async function countCalls(f: Fixture): Promise<number> {
  return await f.t.run(async (ctx) => (await ctx.db.query("calls").take(50)).length)
}
async function grantFor(who: Actor, networkId: Id<"networks">, callId: Id<"calls">) {
  return await who.as.query(internal.modules.calls.token.authorizeToken, { networkId, callId })
}
async function ringingOf(who: Actor, networkId: Id<"networks">) {
  return (await who.as.query(C.ringing.listRinging, { networkId })).calls
}
async function removeSignatory(f: Fixture, who: Actor): Promise<void> {
  await f.t.run(async (ctx) => {
    const row = await ctx.db.query("pageSignatories").withIndex("by_page_person", (q) => q.eq("pageId", f.pageId).eq("personId", who.personId)).unique()
    if (row) await ctx.db.delete(row._id)
  })
}

/** Pose un réglage d'appel directement (les mutations de réglage ont leurs propres tests). */
async function setPrefs(f: Fixture, who: Actor, prefs: Record<string, unknown>): Promise<void> {
  await f.t.run(async (ctx) => {
    const existing = await ctx.db
      .query("callPreferences")
      .withIndex("by_person", (q) => q.eq("personId", who.personId))
      .unique()
    if (existing) await ctx.db.patch(existing._id, { ...prefs, updatedAt: Date.now() })
    else await ctx.db.insert("callPreferences", { personId: who.personId, ...prefs, updatedAt: Date.now() } as never)
  })
}

// ═══════════════════════════════════════════════════════════════
// Accords et phase (N27)
// ═══════════════════════════════════════════════════════════════

describe("CC-4 — accords explicites et phase engagée (N27)", () => {
  it("N27 : sans accord, avec un seul accord, hors phase engagée ou sur un fil clos : aucun appel ; rien ne sonne à l'ouverture ni à l'accord", async () => {
    const f = await fixture()
    const ref = mentoring(f)
    const scope = await opened(f, ref)
    // L'ouverture (mentorat accepté) ne fait rien sonner.
    expect(await countCalls(f)).toBe(0)
    expect(await ringingOf(f.mentor, f.root)).toEqual([])
    expect(await f.requester.as.query(getThread, scope)).toMatchObject({ callConsent: false, callTargets: [], capabilities: { canSetCallConsent: true, canCall: false } })
    expect(engineErrorRule(await caught(place(f.requester, scope)))?.rule).toBe("CONTEXT_CALL_CONSENT_REQUIRED")
    await consent(f.requester, scope)
    // L'accord ne fait jamais sonner ; seul, il ne suffit pas.
    expect(await countCalls(f)).toBe(0)
    expect(await f.requester.as.query(getThread, scope)).toMatchObject({ callConsent: true, capabilities: { canCall: false } })
    expect(engineErrorRule(await caught(place(f.requester, scope)))?.rule).toBe("CONTEXT_CALL_CONSENT_REQUIRED")
    await consent(f.mentor, scope)
    expect(await countCalls(f)).toBe(0)
    expect(await ringingOf(f.requester, f.root)).toEqual([])
    // Face à une personne, aucune liste de cibles : la personne d'en face est l'objet.
    expect(await f.requester.as.query(getThread, scope)).toMatchObject({ callTargets: [], capabilities: { canCall: true } })
    // Hors phase engagée : ni appel, ni accord nouveau.
    update(ref, { callsEngaged: false })
    expect(engineErrorRule(await caught(place(f.requester, scope)))?.rule).toBe("CONTEXT_CALLS_CLOSED")
    expect(await f.requester.as.query(getThread, scope)).toMatchObject({ capabilities: { canCall: false } })
    update(ref, { callsEngaged: true })
    // Fil clos par un côté : ni appel, ni accord ; le retrait reste possible.
    const revision = (await f.requester.as.query(getThread, scope))?.revision ?? 0
    await f.mentor.as.mutation(closeThread, { ...scope, expectedRevision: revision })
    expect(engineErrorRule(await caught(place(f.requester, scope)))?.rule).toBe("CONTEXT_CLOSED")
    expect(engineErrorRule(await caught(f.requester.as.mutation(setCallConsent, { ...scope, allowed: true })))?.rule).toBe("CONTEXT_CLOSED")
    await consent(f.requester, scope, false)
    expect(await f.requester.as.query(getThread, scope)).toMatchObject({ callConsent: false, capabilities: { canSetCallConsent: false, canCall: false } })
    expect(await countCalls(f)).toBe(0)
  })

  it("N27 : demande de service envoyée (phase non engagée) : aucun accord activable ; un tiers reçoit le refus indistinct", async () => {
    const f = await fixture()
    const scope = await opened(f, service(f, false))
    expect(await f.requester.as.query(getThread, scope)).toMatchObject({ capabilities: { canSetCallConsent: false, canCall: false } })
    expect(engineErrorRule(await caught(f.requester.as.mutation(setCallConsent, { ...scope, allowed: true })))?.rule).toBe("CONTEXT_CALLS_CLOSED")
    expect(engineErrorRule(await caught(f.admin.as.mutation(setCallConsent, { ...scope, allowed: true })))?.rule).toBe("CONTEXT_CALLS_CLOSED")
    expect(engineErrorCode(await caught(f.stranger.as.mutation(setCallConsent, { ...scope, allowed: true })))).toBe("notFound")
    expect(engineErrorCode(await caught(place(f.stranger, scope)))).toBe("notFound")
    expect(await f.t.run(async (ctx) => (await ctx.db.query("contextualPersonStates").take(20)).filter((row) => row.callsAllowed === true).length)).toBe(0)
    expect(await countCalls(f)).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// Revalidation (N28)
// ═══════════════════════════════════════════════════════════════

describe("CC-4 — revalidation à chaque perte de droit (N28)", () => {
  it("N28 : un retrait d'accord pendant la sonnerie termine l'appel ; sonnerie, décrochage et jeton suivants refusés", async () => {
    const f = await fixture()
    const scope = await opened(f, service(f))
    await consent(f.requester, scope)
    await consent(f.admin, scope)
    const callId = await ringing(f.requester, scope, f.admin.personId)
    expect(await grantFor(f.admin, f.root, callId)).toBeNull()
    expect(await grantFor(f.requester, f.root, callId)).toMatchObject({ personId: f.requester.personId, contextualThreadId: scope.threadId })
    expect(await ringingOf(f.admin, f.root)).toEqual([expect.objectContaining({ callId, contextualThreadId: scope.threadId })])
    await consent(f.admin, scope, false)
    expect(await callDoc(f, callId)).toMatchObject({ status: "ended", endReason: "normal" })
    expect(await grantFor(f.admin, f.root, callId)).toBeNull()
    expect(await grantFor(f.requester, f.root, callId)).toBeNull()
    expect(await ringingOf(f.admin, f.root)).toEqual([])
    expect(engineErrorCode(await caught(f.admin.as.mutation(C.lifecycle.join, { networkId: f.root, callId })))).toBe("notFound")
  })

  it("N28 : la fermeture de l'objet pendant l'appel établi l'arrête au crochet de synchronisation ; jeton refusé", async () => {
    const f = await fixture()
    const ref = mentoring(f)
    const scope = await opened(f, ref)
    await consent(f.requester, scope)
    await consent(f.mentor, scope)
    // Le répondant appelle le demandeur, en son propre nom.
    const callId = await ringing(f.mentor, scope)
    tick()
    await f.requester.as.mutation(C.lifecycle.join, { networkId: f.root, callId })
    expect(await callDoc(f, callId)).toMatchObject({ status: "active", callStatus: "connected", contextualThreadId: scope.threadId })
    update(ref, { phase: "closed" })
    expect(await f.t.run(async (ctx) => await syncContextualConversation(ctx, ref))).toEqual({ threadId: scope.threadId, change: "closed" })
    expect(await callDoc(f, callId)).toMatchObject({ status: "ended", endReason: "normal" })
    expect(await grantFor(f.requester, f.root, callId)).toBeNull()
  })

  it("N28 : une transition qui retire la phase engagée, sans changer le cache, arrête l'appel au crochet", async () => {
    const f = await fixture()
    const ref = service(f)
    const scope = await opened(f, ref)
    await consent(f.requester, scope)
    await consent(f.admin, scope)
    const callId = await ringing(f.requester, scope, f.admin.personId)
    update(ref, { callsEngaged: false })
    expect(await f.t.run(async (ctx) => await syncContextualConversation(ctx, ref))).toEqual({ threadId: scope.threadId, change: "unchanged" })
    expect(await callDoc(f, callId)).toMatchObject({ status: "ended" })
  })

  it("N28 : un signataire retiré pendant la sonnerie n'a plus ni sonnerie, ni décrochage, ni jeton ; la revalidation arrête l'appel", async () => {
    const f = await fixture()
    const scope = await opened(f, application(f))
    await consent(f.requester, scope)
    await consent(f.teammate, scope)
    const callId = await ringing(f.requester, scope, f.teammate.personId)
    await removeSignatory(f, f.teammate)
    expect(await ringingOf(f.teammate, f.root)).toEqual([])
    expect(engineErrorCode(await caught(f.teammate.as.mutation(C.lifecycle.join, { networkId: f.root, callId })))).toBe("notFound")
    expect(await grantFor(f.teammate, f.root, callId)).toBeNull()
    expect(await f.t.mutation(revalidateCalls, {})).toBe(1)
    expect(await callDoc(f, callId)).toMatchObject({ status: "ended" })
    expect(await f.t.mutation(revalidateCalls, {})).toBe(0)
  })

  it("une politique fermée coupe l'appel vivant à la revalidation ; l'historique reste lisible et l'accord retirable", async () => {
    const f = await fixture()
    const scope = await opened(f, mentoring(f))
    await consent(f.requester, scope)
    await consent(f.mentor, scope)
    const callId = await ringing(f.requester, scope)
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("contextualPolicies").withIndex("by_network_kind", (q) => q.eq("networkId", f.root).eq("kind", "diasporaMentoring")).first()
      if (row) await ctx.db.patch(row._id, { enabled: false })
    })
    expect(await grantFor(f.mentor, f.root, callId)).toBeNull()
    expect(await f.t.mutation(revalidateCalls, {})).toBe(1)
    expect(await callDoc(f, callId)).toMatchObject({ status: "ended" })
    expect(await f.requester.as.query(getThread, scope)).toMatchObject({ state: { kind: "read_only", reason: "closed" }, callConsent: true, capabilities: { canSetCallConsent: true, canCall: false } })
  })
})

// ═══════════════════════════════════════════════════════════════
// Autorité liée à l'accord (N29)
// ═══════════════════════════════════════════════════════════════

describe("CC-4 — accord lié à l'autorité (N29)", () => {
  it("N29 : un accord donné, puis un rôle retiré et rendu, ne vaut plus ; un nouvel accord le rétablit", async () => {
    const f = await fixture()
    const scope = await opened(f, service(f))
    await consent(f.requester, scope)
    await consent(f.teammate, scope)
    expect((await f.requester.as.query(getThread, scope))?.callTargets.map((target) => target.personId)).toEqual([f.teammate.personId])
    // Rôle retiré puis rendu : une autre ligne de signataire, une autre date d'acceptation.
    await removeSignatory(f, f.teammate)
    await f.t.run(async (ctx) => {
      await ctx.db.insert("pageSignatories", { networkId: f.root, pageId: f.pageId, personId: f.teammate.personId, role: "signatory", acceptedAt: NOW + 1, createdAt: NOW + 1, updatedAt: NOW + 1 })
    })
    expect(await f.teammate.as.query(getThread, scope)).toMatchObject({ callConsent: false, capabilities: { canSetCallConsent: true, canCall: false } })
    expect(await f.requester.as.query(getThread, scope)).toMatchObject({ callTargets: [], capabilities: { canCall: false } })
    expect(engineErrorCode(await caught(place(f.requester, scope, f.teammate.personId)))).toBe("notFound")
    expect(engineErrorRule(await caught(place(f.requester, scope)))?.rule).toBe("CONTEXT_CALL_CONSENT_REQUIRED")
    await consent(f.teammate, scope)
    expect((await f.requester.as.query(getThread, scope))?.callTargets.map((target) => target.personId)).toEqual([f.teammate.personId])
    expect(await place(f.requester, scope)).toMatchObject({ admitted: true, calleePersonId: f.teammate.personId })
  })
})

// ═══════════════════════════════════════════════════════════════
// Porte partagée, D5 (a), tête-à-tête strict (N30)
// ═══════════════════════════════════════════════════════════════

describe("CC-4 — porte partagée et D5 (a) (N30)", () => {
  it("N30 : « hors de mes relations : silencieux » ne s'applique pas à l'accord donné dans CE fil, et à ce seul fil ; chacun ne lit que SES réglages", async () => {
    const f = await fixture()
    const scope = await opened(f, mentoring(f))
    await setPrefs(f, f.mentor, { outsideRelationsCalls: "silent" })
    await consent(f.requester, scope)
    await consent(f.mentor, scope)
    expect(await f.mentor.as.query(getThread, scope)).toMatchObject({ callSettings: { outsideRelationsSilenceWaived: true, dndUntil: null } })
    // Le demandeur ne lit rien des réglages du mentor : seulement les siens.
    expect(await f.requester.as.query(getThread, scope)).toMatchObject({ callSettings: { outsideRelationsSilenceWaived: false, dndUntil: null, meetingSilence: false, callWaitingOff: false, incomingPushOff: false } })
    const callId = await ringing(f.requester, scope)
    expect(await grantFor(f.mentor, f.root, callId)).toBeNull()
    expect(await grantFor(f.requester, f.root, callId)).toMatchObject({ personId: f.requester.personId, contextualThreadId: scope.threadId })
    expect(await ringingOf(f.mentor, f.root)).toEqual([expect.objectContaining({ callId, contextualThreadId: scope.threadId })])
    // L'appel personnel garde le réglage : la conversation ne lui confère aucun droit.
    const personal = await f.requester.as.mutation(C.direct.callMember, { networkId: f.root, target: { personId: f.mentor.personId } })
    expect(personal).toMatchObject({ admitted: false, reason: "outside_relations", voicemailOffered: false })
    expect(await callDoc(f, personal.callId)).not.toHaveProperty("contextualThreadId")
  })

  it("N30 : « ne pas déranger », l'occupation et l'absence connue restent appliqués ; jamais de messagerie vocale", async () => {
    const f = await fixture()
    const scope = await opened(f, mentoring(f))
    await consent(f.requester, scope)
    await consent(f.mentor, scope)
    await setPrefs(f, f.mentor, { dnd: { until: NOW + 3_600_000, startedAt: NOW } })
    expect(await f.mentor.as.query(getThread, scope)).toMatchObject({ callSettings: { dndUntil: NOW + 3_600_000 } })
    const silenced = await place(f.requester, scope)
    expect(silenced).toMatchObject({ admitted: false, reason: "dnd", voicemailOffered: false })
    expect(await callDoc(f, silenced.callId)).toMatchObject({ status: "ended", contextualThreadId: scope.threadId })
    const storageId = await f.t.run(async (ctx) => await ctx.storage.store(new Blob(["voice"], { type: "audio/webm" })))
    expect(engineErrorCode(await caught(f.requester.as.mutation(C.voicemail.leave, { networkId: f.root, callId: silenced.callId, storageId, durationMs: 1000 })))).toBe("notFound")
    await setPrefs(f, f.mentor, { dnd: undefined })
    // Occupé : le mentor tient déjà une communication et a coupé le signal d'appel en attente.
    const other = await f.stranger.as.mutation(C.direct.callMember, { networkId: f.root, target: { personId: f.mentor.personId } })
    if (!other.admitted) throw new Error("appel personnel de recette non admis")
    await f.stranger.as.mutation(C.lifecycle.setCallRinging, { networkId: f.root, callId: other.callId })
    tick()
    await f.mentor.as.mutation(C.lifecycle.join, { networkId: f.root, callId: other.callId })
    await setPrefs(f, f.mentor, { callWaiting: false })
    expect(await f.mentor.as.query(getThread, scope)).toMatchObject({ callSettings: { callWaitingOff: true } })
    expect(await place(f.requester, scope)).toMatchObject({ admitted: false, reason: "busy", voicemailOffered: false })
    await f.mentor.as.mutation(C.lifecycle.leave, { networkId: f.root, callId: other.callId, intentional: true })
    // Hors ligne, preuve en main : un manqué, sans messagerie vocale.
    await f.t.run(async (ctx) => {
      await ctx.db.insert("personPresence", { networkId: f.root, personId: f.mentor.personId, status: "offline", lastHeartbeat: NOW - 600_000 })
    })
    expect(await place(f.requester, scope)).toMatchObject({ admitted: false, reason: "offline", voicemailOffered: false })
  })

  it("N30 : un appel contextuel reste un tête-à-tête : ni invitation, ni promotion ; au plus un appel vivant par fil", async () => {
    const f = await fixture()
    const scope = await opened(f, mentoring(f))
    await consent(f.requester, scope)
    await consent(f.mentor, scope)
    const callId = await ringing(f.requester, scope)
    tick()
    await f.mentor.as.mutation(C.lifecycle.join, { networkId: f.root, callId })
    expect(engineErrorCode(await caught(f.requester.as.mutation(C.groupCalls.addInvitee, { networkId: f.root, callId, personId: f.stranger.personId })))).toBe("notFound")
    expect(await callDoc(f, callId)).toMatchObject({ kind: "direct", maxParticipants: 2 })
    expect(engineErrorCode(await caught(place(f.mentor, scope)))).toBe("notFound")
    expect(await f.requester.as.query(getThread, scope)).toMatchObject({ capabilities: { canCall: false } })
  })

  it("l'avis d'un appel contextuel refusé suit la lecture du fil : un ancien participant ne le garde pas", async () => {
    const f = await fixture()
    const ref = mentoring(f)
    const scope = await opened(f, ref)
    await consent(f.requester, scope)
    await consent(f.mentor, scope)
    await setPrefs(f, f.mentor, { dnd: { until: NOW + 3_600_000, startedAt: NOW } })
    expect(await place(f.requester, scope)).toMatchObject({ admitted: false, reason: "dnd" })
    const notice = await f.t.run(async (ctx) => (await ctx.db.query("notifications").withIndex("by_network_recipient_createdAt", (q) => q.eq("networkId", f.root).eq("recipientPersonId", f.mentor.personId)).take(20)).find((row) => row.kind === "call_missed") ?? null)
    if (notice === null) throw new Error("Avis d'appel manqué absent")
    expect(await f.t.run(async (ctx) => await notificationStillVisible(ctx, notice))).toBe(true)
    fakes.objects.get(ref.id)?.hiddenFrom.add(f.mentor.personId)
    expect(await f.t.run(async (ctx) => await notificationStillVisible(ctx, notice))).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════
// Voix de page (N31)
// ═══════════════════════════════════════════════════════════════

describe("CC-4 — voix de page (N31)", () => {
  it("N31 : le demandeur ne cible qu'un signataire consentant ; un signataire n'appelle qu'en son nom, et seulement le demandeur", async () => {
    const f = await fixture()
    const scope = await opened(f, service(f))
    await consent(f.requester, scope)
    await consent(f.admin, scope)
    // Seul le signataire consentant est nommé (D3) ; le non-consentant est indistinct d'un inconnu.
    expect((await f.requester.as.query(getThread, scope))?.callTargets).toEqual([{ personId: f.admin.personId, label: expect.objectContaining({ handle: "call-admin" }) }])
    for (const target of [f.teammate.personId, f.stranger.personId, f.requester.personId]) {
      expect(engineErrorCode(await caught(place(f.requester, scope, target)))).toBe("notFound")
    }
    // Un seul consentant : choisi d'office.
    const first = await place(f.requester, scope)
    expect(first).toMatchObject({ admitted: true, calleePersonId: f.admin.personId })
    await f.requester.as.mutation(C.lifecycle.leave, { networkId: f.root, callId: first.callId, intentional: true })
    // Deux consentants : le demandeur choisit.
    await consent(f.teammate, scope)
    expect(engineErrorCode(await caught(place(f.requester, scope)))).toBe("invalidArgument")
    expect((await f.requester.as.query(getThread, scope))?.callTargets.map((target) => target.personId).sort()).toEqual([f.admin.personId, f.teammate.personId].sort())
    // Un signataire n'appelle pas au nom d'un autre : sa cible ne peut être que le demandeur.
    expect(engineErrorCode(await caught(place(f.teammate, scope, f.admin.personId)))).toBe("notFound")
    const byTeammate = await place(f.teammate, scope)
    expect(byTeammate).toMatchObject({ admitted: true, calleePersonId: f.requester.personId })
    expect(await callDoc(f, byTeammate.callId)).toMatchObject({ createdByPersonId: f.teammate.personId, contextualThreadId: scope.threadId })
    // Le côté page ne reçoit aucune liste de cibles.
    expect((await f.admin.as.query(getThread, scope))?.callTargets).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════
// Blocage (N12)
// ═══════════════════════════════════════════════════════════════

describe("CC-4 — blocage pendant l'appel (N12)", () => {
  it("N12 : un blocage posé pendant un appel l'arrête ; l'appel quitte le journal des deux personnes", async () => {
    const f = await fixture()
    const scope = await opened(f, mentoring(f))
    await consent(f.requester, scope)
    await consent(f.mentor, scope)
    const callId = await ringing(f.requester, scope)
    tick()
    await f.mentor.as.mutation(C.lifecycle.join, { networkId: f.root, callId })
    // Le journal rappelle par la conversation.
    expect((await f.requester.as.query(C.history.listCallHistory, { networkId: f.root })).calls).toEqual(expect.arrayContaining([expect.objectContaining({ callId, contextualThreadId: scope.threadId })]))
    await f.t.run(async (ctx) => {
      await ctx.db.insert("personBlocks", { networkId: f.root, blockerPersonId: f.mentor.personId, targetPersonId: f.requester.personId, createdAt: NOW, updatedAt: NOW })
    })
    expect(await grantFor(f.mentor, f.root, callId)).toBeNull()
    expect(await grantFor(f.requester, f.root, callId)).toBeNull()
    expect(await f.requester.as.query(C.lifecycle.getCall, { networkId: f.root, callId })).toBeNull()
    expect(await f.t.mutation(revalidateCalls, {})).toBe(1)
    expect(await callDoc(f, callId)).toMatchObject({ status: "ended" })
    for (const who of [f.requester, f.mentor]) {
      expect((await who.as.query(C.history.listCallHistory, { networkId: f.root })).calls.map((row) => row.callId), who.handle).not.toContain(callId)
    }
  })

  it("N12 : face à une page, le blocage n'arrête que l'appel du signataire concerné ; un coéquipier reste joignable", async () => {
    const f = await fixture()
    const scope = await opened(f, service(f))
    await consent(f.requester, scope)
    await consent(f.admin, scope)
    const callId = await ringing(f.requester, scope, f.admin.personId)
    await f.t.run(async (ctx) => {
      await ctx.db.insert("personBlocks", { networkId: f.root, blockerPersonId: f.requester.personId, targetPersonId: f.admin.personId, createdAt: NOW, updatedAt: NOW })
    })
    expect(await f.t.mutation(revalidateCalls, {})).toBe(1)
    expect(await callDoc(f, callId)).toMatchObject({ status: "ended" })
    await consent(f.teammate, scope)
    expect(await place(f.requester, scope, f.teammate.personId)).toMatchObject({ admitted: true, calleePersonId: f.teammate.personId })
  })
})

// ═══════════════════════════════════════════════════════════════
// Sélecteur unique, jeton court (N44 pour les appels, §5.8)
// ═══════════════════════════════════════════════════════════════

describe("CC-4 — sélecteur de contexte et jeton court", () => {
  const ORIGINAL_ENV = { ...process.env }

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it("N44 : un appel ne porte jamais les deux contextes ; un identifiant commercial n'ouvre aucun appel contextuel", async () => {
    const f = await fixture()
    const scope = await opened(f, mentoring(f))
    await consent(f.requester, scope)
    await consent(f.mentor, scope)
    const commercialThreadId = `${7_000_002}commercialThreads` as Id<"commercialThreads">
    const conflict = await caught(f.t.run(async (ctx) => {
      const person = await ctx.db.get(f.requester.personId)
      if (person === null) throw new Error("Personne de test absente")
      return await placeDirectCall({ ...ctx, networkId: f.root, person }, { target: { personId: f.mentor.personId }, commercialThreadId, contextualThreadId: scope.threadId })
    }))
    expect(engineErrorCode(conflict)).toBe("notFound")
    expect(await countCalls(f)).toBe(0)
    // Un identifiant d'une autre famille est refusé par le validateur, sans réponse du moteur.
    const loose = await caught(f.requester.as.mutation(startCallLoose, { networkId: f.root, threadId: commercialThreadId, mediaType: "audio" }))
    expect(loose).not.toBeNull()
    expect(engineErrorCode(loose)).toBeNull()
  })

  it("le jeton d'un appel contextuel vit 60 secondes et se relit à chaque émission", async () => {
    process.env.LIVEKIT_API_KEY = "cle-de-test"
    process.env.LIVEKIT_API_SECRET = "secret-de-test-suffisamment-long-pour-hs256"
    process.env.LIVEKIT_WS_URL = "wss://livekit.example.test"
    delete process.env.LIVEKIT_WAKE_URL
    const f = await fixture()
    const scope = await opened(f, mentoring(f))
    await consent(f.requester, scope)
    await consent(f.mentor, scope)
    const callId = await ringing(f.requester, scope)
    expect(engineErrorCode(await caught(f.mentor.as.action(C.livekitActions.requestToken, { networkId: f.root, callId })))).toBe("notFound")
    await f.mentor.as.mutation(C.lifecycle.join, { networkId: f.root, callId })
    const issued = await f.mentor.as.action(C.livekitActions.requestToken, { networkId: f.root, callId })
    const claims = JSON.parse(atob((issued.token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number; nbf?: number }
    expect((claims.exp ?? 0) - (claims.nbf ?? 0)).toBe(60)
    await consent(f.requester, scope, false)
    expect(engineErrorCode(await caught(f.mentor.as.action(C.livekitActions.requestToken, { networkId: f.root, callId })))).toBe("notFound")
  })
})
