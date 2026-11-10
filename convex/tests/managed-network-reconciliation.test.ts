// @vitest-environment edge-runtime
/**
 * Réconciliation des adhésions et réseaux GOUVERNÉS (issue antsia#121, lot EA-03 de DIASPORALE) :
 * quand l'identité d'une personne change, chaque adhésion active à un réseau gouverné est confiée au
 * gestionnaire de sa tranche, inscrit au registre des tranches (`modules/networks/sliceRegistry`).
 *
 * La tranche est SIMULÉE par un registre de test injecté (module remplacé) : aucun gestionnaire de
 * test n'est enregistré dans le moteur. Le gestionnaire factice suit une règle volontairement simple
 * (identité forte → `verifiee`, sinon `declaree`), idempotente, et compte ses appels.
 */
import { hasStrongIdentity } from "@antsia/social-domain/badges"
import type { MembershipStatus } from "@antsia/social-domain/membership"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import type { ManagedMembershipRederiver, ManagedMembershipRegistry } from "../modules/networks/sliceRegistry"
import { SEED_CONFIRMATION } from "../seeds/foundations"
import { createTestSession, testConvex } from "../test.setup"

const fakes = vi.hoisted(() => ({
  registry: { diaspora: null } as { -readonly [S in keyof ManagedMembershipRegistry]: ManagedMembershipRegistry[S] },
  calls: [] as { membershipId: string; status: string; now: number }[],
}))

vi.mock("../modules/networks/sliceRegistry", () => ({ MANAGED_MEMBERSHIP_REDERIVERS: fakes.registry }))

type T = ReturnType<typeof testConvex>

/** La tranche de test : relit les liens vivants et n'écrit que si le statut change. */
const sliceRederiver: ManagedMembershipRederiver = async (ctx, membership, now) => {
  fakes.calls.push({ membershipId: membership._id, status: membership.status, now })
  const links = (await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", membership.personId)).take(16)).filter((link) => link.revokedAt === undefined)
  const target: MembershipStatus = hasStrongIdentity(links) ? "verifiee" : "declaree"
  if (target === membership.status) return target
  await ctx.db.patch(membership._id, { status: target, verifiedBy: target === "verifiee" ? "idn" : undefined, statusChangedAt: now })
  return target
}

beforeEach(() => {
  fakes.calls.length = 0
  fakes.registry.diaspora = sliceRederiver
})

function idOf(value: unknown): string {
  if (typeof value === "object" && value !== null && "_id" in value && typeof value._id === "string") return value._id
  throw new Error("Document Better Auth de fixture absent")
}

/** Une personne avec un vrai utilisateur et une vraie session du composant (comme `people/identity.test.ts`). */
async function personFixture(t: T) {
  const now = Date.now()
  const userId = idOf(await t.mutation(components.betterAuth.adapter.create, {
    input: { model: "user", data: { name: "Nom civil de fixture", email: "gouverne@example.com", emailVerified: true, createdAt: now, updatedAt: now } },
  }))
  const sessionId = await createTestSession(t, userId)
  const as = t.withIdentity({ subject: userId, sessionId, issuer: "fixture-engine", applicationOrigin: "antsia" })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  return { userId, as, personId }
}

async function idnAccount(t: T, userId: string) {
  const now = Date.now()
  await t.mutation(components.betterAuth.adapter.create, { input: { model: "account", data: { userId, providerId: "idn", accountId: "idn-gouverne", createdAt: now, updatedAt: now } } })
}

async function idnProof(t: T, loa: 1 | 2) {
  await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: "idn-gouverne", loa })
}

/** La racine et testClosed des fondations, plus un réseau gouverné par la tranche `diaspora`. */
async function world(t: T) {
  const { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const managed = await t.run(async (ctx) => {
    const now = Date.now()
    return await ctx.db.insert("networks", { slug: "gouverne-reconcilie", name: "Réseau gouverné de test", kind: "closed", parentId: root, managedBy: "diaspora", membershipPolicy: "declared_or_verified", defaultVisibility: "network", reachValues: [], theme: "antsia", status: "active", createdAt: now, updatedAt: now })
  })
  return { root, testClosed, managed }
}

async function member(t: T, personId: Id<"persons">, networkId: Id<"networks">, status: Doc<"networkMemberships">["status"], extra: Partial<Pick<Doc<"networkMemberships">, "verifiedBy" | "statusBeforeSuspension">> = {}) {
  return await t.run(async (ctx) => await ctx.db.insert("networkMemberships", { personId, networkId, status, role: "member", joinedAt: Date.now(), statusChangedAt: Date.now(), ...extra }))
}

async function membership(t: T, id: Id<"networkMemberships">) {
  return await t.run(async (ctx) => await ctx.db.get(id))
}

describe("réconciliation : un réseau gouverné est relu par sa tranche", () => {
  it("lier IDN fait relire l'adhésion gouvernée UNE fois, par sa tranche ; la racine suit le chemin du moteur", async () => {
    const t = testConvex({ automaticSessions: false })
    const { root, managed } = await world(t)
    const fixture = await personFixture(t)
    const rootId = await member(t, fixture.personId, root, "declaree")
    const managedId = await member(t, fixture.personId, managed, "declaree")
    await idnAccount(t, fixture.userId)
    await idnProof(t, 2)
    await fixture.as.mutation(api.modules.people.identity.linkIdn, {})
    expect(fakes.calls).toEqual([{ membershipId: managedId, status: "declaree", now: expect.any(Number) }])
    expect(await membership(t, managedId)).toMatchObject({ status: "verifiee", verifiedBy: "idn" })
    expect(await membership(t, rootId)).toMatchObject({ status: "verifiee", verifiedBy: "idn" })
  })

  it("rejouée, la réconciliation ne change rien ; un second lien identique ne la relance pas", async () => {
    const t = testConvex({ automaticSessions: false })
    const { root, managed } = await world(t)
    const fixture = await personFixture(t)
    await member(t, fixture.personId, root, "declaree")
    const managedId = await member(t, fixture.personId, managed, "declaree")
    await idnAccount(t, fixture.userId)
    await idnProof(t, 2)
    await fixture.as.mutation(api.modules.people.identity.linkIdn, {})
    const settled = await membership(t, managedId)
    expect(await t.mutation(internal.modules.people.identity.reconcileIdentityMemberships, { personId: fixture.personId, cursor: null })).toEqual({ changed: 0, done: true })
    expect(await membership(t, managedId)).toEqual(settled)
    expect(fakes.calls).toHaveLength(2)
    await fixture.as.mutation(api.modules.people.identity.linkIdn, {})
    expect(fakes.calls).toHaveLength(2)
    expect(await membership(t, managedId)).toEqual(settled)
  })

  it("perdre le niveau IDN fait aussi relire l'adhésion gouvernée", async () => {
    const t = testConvex({ automaticSessions: false })
    const { root, managed } = await world(t)
    const fixture = await personFixture(t)
    await member(t, fixture.personId, root, "declaree")
    const managedId = await member(t, fixture.personId, managed, "declaree")
    await idnAccount(t, fixture.userId)
    await idnProof(t, 2)
    await fixture.as.mutation(api.modules.people.identity.linkIdn, {})
    expect(await membership(t, managedId)).toMatchObject({ status: "verifiee" })
    await idnProof(t, 1)
    await fixture.as.mutation(api.modules.people.persons.ensureMyPerson, {})
    expect(fakes.calls.map((call) => call.status)).toEqual(["declaree", "verifiee"])
    expect(await membership(t, managedId)).toMatchObject({ status: "declaree" })
    expect((await membership(t, managedId))?.verifiedBy).toBeUndefined()
  })

  it("un départ ou une sanction n'est jamais confié à la tranche, ni rouvert", async () => {
    for (const status of ["partie", "suspendue"] as const) {
      fakes.calls.length = 0
      const t = testConvex({ automaticSessions: false })
      const { root, managed } = await world(t)
      const fixture = await personFixture(t)
      await member(t, fixture.personId, root, "declaree")
      const managedId = await member(t, fixture.personId, managed, status, { statusBeforeSuspension: "declaree" })
      const before = await membership(t, managedId)
      await idnAccount(t, fixture.userId)
      await idnProof(t, 2)
      await fixture.as.mutation(api.modules.people.identity.linkIdn, {})
      expect(fakes.calls, status).toEqual([])
      expect(await membership(t, managedId), status).toEqual(before)
    }
  })

  it("une racine sortie (suspension = partout) ne fait relire aucune adhésion gouvernée", async () => {
    const t = testConvex({ automaticSessions: false })
    const { root, managed } = await world(t)
    const fixture = await personFixture(t)
    await member(t, fixture.personId, root, "suspendue", { statusBeforeSuspension: "declaree" })
    const managedId = await member(t, fixture.personId, managed, "declaree")
    await idnAccount(t, fixture.userId)
    await idnProof(t, 2)
    await fixture.as.mutation(api.modules.people.identity.linkIdn, {})
    expect(fakes.calls).toEqual([])
    expect(await membership(t, managedId)).toMatchObject({ status: "declaree" })
  })

  it("un réseau non gouverné suit le chemin actuel du moteur, sans appel à la tranche", async () => {
    const t = testConvex({ automaticSessions: false })
    const { root, testClosed } = await world(t)
    const fixture = await personFixture(t)
    const rootId = await member(t, fixture.personId, root, "declaree")
    const childId = await member(t, fixture.personId, testClosed, "en_attente")
    await idnAccount(t, fixture.userId)
    await idnProof(t, 2)
    await fixture.as.mutation(api.modules.people.identity.linkIdn, {})
    expect(fakes.calls).toEqual([])
    expect(await membership(t, rootId)).toMatchObject({ status: "verifiee", verifiedBy: "idn" })
    expect(await membership(t, childId)).toMatchObject({ status: "declaree" })
  })

  it("sans gestionnaire inscrit, le réseau gouverné est sauté comme avant (repli sûr)", async () => {
    fakes.registry.diaspora = null
    const t = testConvex({ automaticSessions: false })
    const { root, managed } = await world(t)
    const fixture = await personFixture(t)
    await member(t, fixture.personId, root, "declaree")
    const managedId = await member(t, fixture.personId, managed, "en_attente")
    const before = await membership(t, managedId)
    await idnAccount(t, fixture.userId)
    await idnProof(t, 2)
    await fixture.as.mutation(api.modules.people.identity.linkIdn, {})
    expect(await membership(t, managedId)).toEqual(before)
  })
})
