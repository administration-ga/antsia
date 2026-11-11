/**
 * Outillage des tests du module des appels — partagé par ses fichiers de test.
 *
 * Fichier à deux points dans son nom : ignoré par le bundler de Convex et par
 * le glob du harnais (comme `convex/test.setup.ts`) — il n'est jamais déployé.
 */
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import type { testConvex } from "../../test.setup"

export type T = ReturnType<typeof testConvex>
export type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }

export const C = api.modules.calls
export const T0 = Date.UTC(2026, 9, 15, 9, 0, 0)

export async function seed(t: T): Promise<{ root: Id<"networks">; testClosed: Id<"networks"> }> {
  return await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
}

/** Une personne entrée dans le réseau racine, profil publié (nom affiché = son identifiant). */
export async function enter(t: T, rootId: Id<"networks">, handle: string): Promise<Person> {
  const as = t.withIdentity({ subject: `auth-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: rootId })
  return { as, personId, handle }
}

/** Ajoute une adhésion déclarée à un autre réseau. */
export async function joinAlso(t: T, networkId: Id<"networks">, person: Person): Promise<void> {
  await t.run(async (ctx) => ctx.db.insert("networkMemberships", { networkId, personId: person.personId, status: "declaree", role: "member", joinedAt: 1, statusChangedAt: 1 }))
}

/** Une relation ACCEPTÉE entre deux personnes, dans un réseau. */
export async function connect(t: T, networkId: Id<"networks">, a: Person, b: Person): Promise<void> {
  await t.run(async (ctx) => {
    const [low, high] = a.personId < b.personId ? [a.personId, b.personId] : [b.personId, a.personId]
    await ctx.db.insert("connections", { networkId, personIdLow: low, personIdHigh: high, requestedByPersonId: a.personId, recipientPersonId: b.personId, status: "accepted", requestedAt: 1, respondedAt: 1, updatedAt: 1 })
  })
}

/** `blocker` bloque `blocked` (une ligne bloquée de la paire, dans un réseau). */
export async function block(t: T, networkId: Id<"networks">, blocker: Person, blocked: Person): Promise<void> {
  await t.run(async (ctx) => {
    const [low, high] = blocker.personId < blocked.personId ? [blocker.personId, blocked.personId] : [blocked.personId, blocker.personId]
    await ctx.db.insert("connections", {
      networkId,
      personIdLow: low,
      personIdHigh: high,
      requestedByPersonId: blocker.personId,
      recipientPersonId: blocked.personId,
      status: "blocked",
      blockedByPersonId: blocker.personId,
      requestedAt: 1,
      updatedAt: 1,
    })
  })
}

export async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  return null
}

export const codeOf = async (promise: Promise<unknown>) => engineErrorCode(await caught(promise))
export const ruleOf = async (promise: Promise<unknown>) => engineErrorRule(await caught(promise))?.rule ?? null

/** Avance l'horloge (sans déclencher de minuteur) : deux gestes ne partagent pas la même milliseconde. */
export function tick(ms = 1000): void {
  vi.setSystemTime(Date.now() + ms)
}

/** Appelle `to` par son identifiant public, dans le réseau. */
export async function call(networkId: Id<"networks">, from: Person, to: Person, mediaType?: "audio" | "video") {
  return await from.as.mutation(C.direct.callMember, { networkId, target: { handle: to.handle }, ...(mediaType ? { mediaType } : {}) })
}

/** Un tête-à-tête ADMIS et qui sonne (l'appelant a rejoint sa salle). */
export async function ringingCall(networkId: Id<"networks">, from: Person, to: Person): Promise<Id<"calls">> {
  const placed = await call(networkId, from, to)
  if (!placed.admitted) throw new Error(`appel refusé : ${placed.reason}`)
  await from.as.mutation(C.lifecycle.setCallRinging, { networkId, callId: placed.callId })
  return placed.callId
}

/** Un tête-à-tête décroché. */
export async function connectedCall(networkId: Id<"networks">, from: Person, to: Person): Promise<Id<"calls">> {
  const callId = await ringingCall(networkId, from, to)
  tick()
  await to.as.mutation(C.lifecycle.join, { networkId, callId })
  return callId
}

export async function ringingFor(networkId: Id<"networks">, person: Person) {
  return (await person.as.query(C.ringing.listRinging, { networkId })).calls
}

export async function journalOf(networkId: Id<"networks">, person: Person) {
  return (await person.as.query(C.history.listCallHistory, { networkId })).calls
}

export async function bellOf(networkId: Id<"networks">, person: Person) {
  return (await person.as.query(api.modules.notifications.bell.paginateNotifications, { networkId, paginationOpts: { numItems: 50, cursor: null } })).page
}

export async function callDoc(t: T, callId: Id<"calls">) {
  return await t.run(async (ctx) => ctx.db.get(callId))
}

export async function rowsOf(t: T, callId: Id<"calls">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("callParticipants")
      .withIndex("by_call_person", (q) => q.eq("callId", callId))
      .take(50),
  )
}

export async function ticketsOf(t: T, callId: Id<"calls">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("callInvites")
      .withIndex("by_call_person", (q) => q.eq("callId", callId))
      .take(50),
  )
}

/** Pose un réglage d'appel directement (les mutations de réglage ont leurs propres tests). */
export async function setPrefs(t: T, person: Person, prefs: Record<string, unknown>): Promise<void> {
  await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("callPreferences")
      .withIndex("by_person", (q) => q.eq("personId", person.personId))
      .unique()
    if (existing) await ctx.db.patch(existing._id, { ...prefs, updatedAt: Date.now() })
    else await ctx.db.insert("callPreferences", { personId: person.personId, ...prefs, updatedAt: Date.now() } as never)
  })
}

/**
 * IC-04 : ces personnes ont ÉLARGI « qui peut m'appeler » à tout le réseau (`ring`, l'ancien défaut).
 * Les tests de la mécanique d'appel entre personnes non reliées le posent ; le défaut « mes relations
 * seulement » a ses propres tests, qui ne le posent pas.
 */
export async function callableByEveryone(t: T, ...persons: Person[]): Promise<void> {
  for (const person of persons) await setPrefs(t, person, { outsideRelationsCalls: "ring" })
}

/** Une personne entrée (`enter`) qui a élargi « qui peut m'appeler » à tout le réseau (`callableByEveryone`). */
export async function enterCallable(t: T, rootId: Id<"networks">, handle: string): Promise<Person> {
  const person = await enter(t, rootId, handle)
  await callableByEveryone(t, person)
  return person
}

/** Une ligne de présence dans un réseau, au battement donné. */
export async function presenceAt(t: T, networkId: Id<"networks">, person: Person, lastHeartbeat: number, status: "online" | "offline" = "online"): Promise<void> {
  await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("personPresence")
      .withIndex("by_network_person", (q) => q.eq("networkId", networkId).eq("personId", person.personId))
      .unique()
    if (existing) await ctx.db.patch(existing._id, { lastHeartbeat, status })
    else await ctx.db.insert("personPresence", { networkId, personId: person.personId, lastHeartbeat, status })
  })
}

/** Un groupe CONSTITUÉ : créé par `owner`, rejoint par chaque convié (relations acceptées avec `owner`). */
export async function groupThread(t: T, networkId: Id<"networks">, owner: Person, invitees: Person[], key = "cle-1"): Promise<Id<"groupThreads">> {
  for (const invitee of invitees) await connect(t, networkId, owner, invitee)
  const { threadId } = await owner.as.mutation(api.modules.groups.threads.createGroup, { networkId, title: "Comité", memberHandles: invitees.map((p) => p.handle), idempotencyKey: key })
  for (const invitee of invitees) {
    tick(1)
    await invitee.as.mutation(api.modules.groups.invites.respondGroupInvite, { networkId, threadId, accept: true })
  }
  tick()
  return threadId
}
