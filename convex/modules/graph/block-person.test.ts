// @vitest-environment edge-runtime
/**
 * PF-01 — bloquer une personne, la brique commune à toutes les surfaces.
 *
 * Décision D1 du propriétaire (9/11/2026) : bloquer retire les abonnements de la
 * paire, dans les deux sens et dans tous les réseaux, avec leur décompte
 * (agrégat `followerCounts`) dans la même transaction. Débloquer ne les rétablit
 * pas. Le reste du blocage (paire fermée partout, refus indistinct, aucune
 * notification) est inchangé.
 *
 * `myBlockByHandle` : l'auteur d'un blocage le retrouve depuis la fiche (refusée
 * dans les deux sens), sans oracle pour quiconque d'autre.
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { canonicalPair } from "@antsia/social-domain/connectionState"
import type { MembershipStatus } from "@antsia/social-domain/membership"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { followerCounts } from "./follows"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }
const NOW = Date.UTC(2026, 10, 10, 9)
const C = api.modules.graph.connections
const F = api.modules.graph.follows
const B = api.modules.graph.blocks

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function enter(t: T, root: Id<"networks">, handle: string): Promise<Person> {
  const as = t.withIdentity({ subject: `auth-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  return { as, personId, handle }
}

async function fixture() {
  const t = testConvex()
  const { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const alice = await enter(t, root, "alice")
  const bob = await enter(t, root, "bob")
  const carol = await enter(t, root, "carol")
  return { t, root, testClosed, alice, bob, carol }
}

/** Le second réseau, celui d'une tranche fermée : on y entre par sa facette. */
async function joinClosed(person: Person, testClosed: Id<"networks">) {
  await person.as.mutation(api.modules.people.memberships.joinNetwork, { networkId: testClosed, facet: { values: { countryOfResidence: "FR" }, visibilities: {} } })
}

async function setStatus(t: T, networkId: Id<"networks">, personId: Id<"persons">, status: MembershipStatus) {
  await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique()
    if (!row) throw new Error("Adhésion de test absente")
    await ctx.db.patch(row._id, { status })
  })
}

async function codeOf(promise: Promise<unknown>) {
  try { await promise; return null } catch (error) { return engineErrorCode(error) }
}

async function snapshot(t: T) {
  return await t.run(async (ctx) => ({
    connections: await ctx.db.query("connections").take(220),
    intents: await ctx.db.query("personBlocks").take(220),
    follows: await ctx.db.query("follows").take(220),
    notifications: await ctx.db.query("notifications").take(220),
  }))
}

const followerCount = (t: T, networkId: Id<"networks">, personId: Id<"persons">) =>
  t.run(async (ctx) => await followerCounts.count(ctx, { namespace: `${networkId}:${personId}` }))

/** Un abonnement posé d'avant D1 (ou par une graine) : ligne ET agrégat, sans passer par `follow`. */
async function legacyFollow(t: T, networkId: Id<"networks">, follower: Id<"persons">, target: Id<"persons">) {
  await t.run(async (ctx) => {
    const id = await ctx.db.insert("follows", { networkId, followerPersonId: follower, targetPersonId: target, createdAt: NOW })
    const row = await ctx.db.get(id)
    if (row) await followerCounts.insert(ctx, row)
  })
}

describe("D1 — bloquer retire les abonnements de la paire", () => {
  it("dans les deux sens et dans tous les réseaux ; les abonnements des tiers et l'agrégat restent justes", async () => {
    const { t, root, testClosed, alice, bob, carol } = await fixture()
    await joinClosed(alice, testClosed)
    await joinClosed(bob, testClosed)
    await alice.as.mutation(F.follow, { networkId: root, handle: "bob" })
    // Le réseau fermé n'admet pas encore un membre en attente à s'abonner : ligne et décompte posés à la main.
    await legacyFollow(t, testClosed, alice.personId, bob.personId)
    await bob.as.mutation(F.follow, { networkId: root, handle: "alice" })
    await carol.as.mutation(F.follow, { networkId: root, handle: "bob" })
    await carol.as.mutation(F.follow, { networkId: root, handle: "alice" })
    expect(await bob.as.query(F.myFollowerCount, { networkId: root })).toBe(2)
    expect(await bob.as.query(F.myFollowerCount, { networkId: testClosed })).toBe(1)
    expect(await alice.as.query(F.myFollowerCount, { networkId: root })).toBe(2)
    const notificationsBefore = (await snapshot(t)).notifications

    await alice.as.mutation(C.blockPerson, { networkId: root, targetPersonId: bob.personId })

    const after = await snapshot(t)
    expect(after.follows.map((row) => [row.followerPersonId, row.targetPersonId]).sort()).toEqual(
      [[carol.personId, alice.personId], [carol.personId, bob.personId]].sort(),
    )
    expect(await bob.as.query(F.myFollowerCount, { networkId: root })).toBe(1)
    expect(await bob.as.query(F.myFollowerCount, { networkId: testClosed })).toBe(0)
    expect(await alice.as.query(F.myFollowerCount, { networkId: root })).toBe(1)
    expect(await followerCount(t, testClosed, bob.personId)).toBe(0)
    expect(await alice.as.query(F.isFollowing, { networkId: root, targetPersonId: bob.personId })).toBe(false)
    expect(await bob.as.query(F.isFollowing, { networkId: root, targetPersonId: alice.personId })).toBe(false)
    expect((await alice.as.query(F.paginateMyFollows, { networkId: root, paginationOpts: { numItems: 10, cursor: null } })).page).toEqual([])
    // Silencieux : aucune notification, ni pour la personne bloquée ni pour personne.
    expect(after.notifications).toEqual(notificationsBefore)
  })

  it("le rejeu par son auteur est idempotent : rien n'est réécrit", async () => {
    const { t, root, alice, bob } = await fixture()
    await alice.as.mutation(F.follow, { networkId: root, handle: "bob" })
    await alice.as.mutation(C.blockPerson, { networkId: root, targetPersonId: bob.personId })
    const first = await snapshot(t)
    vi.setSystemTime(NOW + 60_000)
    expect(await alice.as.mutation(C.blockPerson, { networkId: root, targetPersonId: bob.personId })).toBeNull()
    expect(await snapshot(t)).toEqual(first)
    expect(await bob.as.query(F.myFollowerCount, { networkId: root })).toBe(0)
  })

  it("une paire déjà fermée avant D1 perd ses abonnements restants au blocage suivant, de l'un ou de l'autre", async () => {
    const { t, root, alice, bob } = await fixture()
    // État d'avant D1 : un blocage posé sans retirer les abonnements de la paire.
    await t.run((ctx) => ctx.db.insert("personBlocks", { networkId: root, blockerPersonId: alice.personId, targetPersonId: bob.personId, createdAt: NOW, updatedAt: NOW }))
    await legacyFollow(t, root, alice.personId, bob.personId)
    await legacyFollow(t, root, bob.personId, alice.personId)
    expect(await followerCount(t, root, bob.personId)).toBe(1)

    // La personne bloquée bloque à son tour : la paire était déjà fermée, les abonnements tombent quand même.
    await bob.as.mutation(C.blockPerson, { networkId: root, targetPersonId: alice.personId })
    const after = await snapshot(t)
    expect(after.follows).toEqual([])
    expect(after.intents.map((row) => row.blockerPersonId).sort()).toEqual([alice.personId, bob.personId].sort())
    expect(await followerCount(t, root, bob.personId)).toBe(0)
    expect(await followerCount(t, root, alice.personId)).toBe(0)
  })

  it("un agrégat désaccordé (ligne sans décompte) n'empêche pas de se protéger", async () => {
    const { t, root, alice, bob } = await fixture()
    await t.run((ctx) => ctx.db.insert("follows", { networkId: root, followerPersonId: bob.personId, targetPersonId: alice.personId, createdAt: NOW }))
    await alice.as.mutation(C.blockPerson, { networkId: root, targetPersonId: bob.personId })
    expect((await snapshot(t)).follows).toEqual([])
    expect(await followerCount(t, root, alice.personId)).toBe(0)
  })

  it("plus de 100 abonnements dans un sens : refus `conflict` avant toute écriture", async () => {
    const { t, root, testClosed, alice, bob } = await fixture()
    await t.run(async (ctx) => {
      const template = await ctx.db.get(testClosed)
      if (!template) throw new Error("Réseau de test absent")
      const { _id: _networkId, _creationTime: _creation, ...networkFields } = template
      for (let index = 0; index < 101; index += 1) {
        const networkId = await ctx.db.insert("networks", { ...networkFields, slug: `follow-network-${index}` })
        await ctx.db.insert("follows", { networkId, followerPersonId: bob.personId, targetPersonId: alice.personId, createdAt: NOW })
      }
    })
    const before = await snapshot(t)
    expect(await codeOf(alice.as.mutation(C.blockPerson, { networkId: root, targetPersonId: bob.personId }))).toBe("conflict")
    expect(await snapshot(t)).toEqual(before)
  })

  it("débloquer ne rétablit aucun abonnement ; on peut ensuite s'abonner de nouveau, et le décompte suit", async () => {
    const { t, root, alice, bob } = await fixture()
    await alice.as.mutation(F.follow, { networkId: root, handle: "bob" })
    await bob.as.mutation(F.follow, { networkId: root, handle: "alice" })
    await alice.as.mutation(C.blockPerson, { networkId: root, targetPersonId: bob.personId })
    // La personne bloquée ne peut pas se réabonner : le refus d'une personne inconnue.
    expect(await codeOf(bob.as.mutation(F.follow, { networkId: root, handle: "alice" }))).toBe("notFound")
    await alice.as.mutation(C.unblockPerson, { networkId: root, targetPersonId: bob.personId })
    const after = await snapshot(t)
    expect(after.follows).toEqual([])
    expect(after.intents).toEqual([])
    expect(await alice.as.query(F.isFollowing, { networkId: root, targetPersonId: bob.personId })).toBe(false)
    expect(await bob.as.query(F.myFollowerCount, { networkId: root })).toBe(0)
    await alice.as.mutation(F.follow, { networkId: root, handle: "bob" })
    expect(await bob.as.query(F.myFollowerCount, { networkId: root })).toBe(1)
  })

  it("le blocage retire aussi la personne des suggestions et de la recherche, dans les deux sens", async () => {
    const { root, alice, bob } = await fixture()
    expect((await alice.as.query(F.suggestions, { networkId: root })).map((row) => row.handle)).toContain("bob")
    expect((await alice.as.query(api.modules.people.directory.searchPeople, { networkId: root, query: "bob" })).length).toBeGreaterThan(0)
    await alice.as.mutation(C.blockPerson, { networkId: root, targetPersonId: bob.personId })
    expect((await alice.as.query(F.suggestions, { networkId: root })).map((row) => row.handle)).not.toContain("bob")
    expect((await bob.as.query(F.suggestions, { networkId: root })).map((row) => row.handle)).not.toContain("alice")
    expect(await alice.as.query(api.modules.people.directory.searchPeople, { networkId: root, query: "bob" })).toEqual([])
    expect(await bob.as.query(api.modules.people.directory.searchPeople, { networkId: root, query: "alice" })).toEqual([])
  })
})

describe("bloquer et débloquer — garde, refus indistinct et débit", () => {
  it("sans session, avec une session périmée ou suspendu : refus avant toute écriture", async () => {
    const { t, root, alice, bob } = await fixture()
    await alice.as.mutation(F.follow, { networkId: root, handle: "bob" })
    const before = await snapshot(t)
    expect(await codeOf(t.mutation(C.blockPerson, { networkId: root, targetPersonId: bob.personId }))).toBe("unauthenticated")
    const stale = t.withIdentity({ subject: "auth-alice", sessionId: "session-absente" })
    expect(await codeOf(stale.mutation(C.blockPerson, { networkId: root, targetPersonId: bob.personId }))).toBe("unauthenticated")
    await setStatus(t, root, alice.personId, "suspendue")
    expect(await codeOf(alice.as.mutation(C.blockPerson, { networkId: root, targetPersonId: bob.personId }))).toBe("membershipSuspended")
    expect(await snapshot(t)).toEqual(before)
  })

  it("un membre en attente peut se protéger, et les abonnements tombent aussi", async () => {
    const { t, root, alice, bob } = await fixture()
    await bob.as.mutation(F.follow, { networkId: root, handle: "alice" })
    await setStatus(t, root, alice.personId, "en_attente")
    await alice.as.mutation(C.blockPerson, { networkId: root, targetPersonId: bob.personId })
    expect((await snapshot(t)).follows).toEqual([])
  })

  it("la personne bloquée ne lit rien de distinct : fiche, relation et demande comme pour un inconnu", async () => {
    const { root, alice, bob } = await fixture()
    await alice.as.mutation(C.blockPerson, { networkId: root, targetPersonId: bob.personId })
    expect(await bob.as.query(api.modules.people.profile.getPublicProfile, { networkId: root, handle: "alice" })).toBeNull()
    expect(await bob.as.query(api.modules.people.profile.getPublicProfile, { networkId: root, handle: "inconnu" })).toBeNull()
    expect(await bob.as.query(C.connectionWith, { networkId: root, otherPersonId: alice.personId })).toEqual({ state: "none" })
    expect(await bob.as.mutation(C.requestConnection, { networkId: root, handle: "alice" })).toEqual({ status: "requested" })
    expect(await codeOf(bob.as.mutation(F.follow, { networkId: root, handle: "alice" }))).toBe(await codeOf(bob.as.mutation(F.follow, { networkId: root, handle: "inconnu" })))
    // Le bloqué ne lève pas un blocage qui n'est pas le sien — le refus d'une ligne inexistante.
    expect(await codeOf(bob.as.mutation(C.unblockPerson, { networkId: root, targetPersonId: alice.personId }))).toBe("notFound")
  })

  it("bloquer et débloquer partagent le seau `connection.block` : au-delà de dix, refus sans effet", async () => {
    const { t, root, alice } = await fixture()
    const targets = await t.run(async (ctx) => {
      const ids: Id<"persons">[] = []
      for (let index = 0; index < 11; index += 1) ids.push(await ctx.db.insert("persons", { authUserId: `cible-${index}`, createdAt: NOW, updatedAt: NOW }))
      return ids
    })
    for (const target of targets.slice(0, 10)) await alice.as.mutation(C.blockPerson, { networkId: root, targetPersonId: target })
    const before = await snapshot(t)
    expect(await codeOf(alice.as.mutation(C.blockPerson, { networkId: root, targetPersonId: targets[10]! }))).toBe("rateLimited")
    expect(await codeOf(alice.as.mutation(C.unblockPerson, { networkId: root, targetPersonId: targets[0]! }))).toBe("rateLimited")
    expect(await snapshot(t)).toEqual(before)
    // Le seau se remplit avec le temps (30 par heure) : le geste reprend.
    vi.setSystemTime(NOW + 3 * 60_000)
    expect(await alice.as.mutation(C.blockPerson, { networkId: root, targetPersonId: targets[10]! })).toBeNull()
  })
})

describe("myBlockByHandle — l'auteur retrouve SON blocage depuis la fiche, sans oracle", () => {
  it("l'auteur lit sa cible ; la personne bloquée, un tiers, soi et un inconnu lisent null", async () => {
    const { root, alice, bob, carol } = await fixture()
    await alice.as.mutation(C.blockPerson, { networkId: root, targetPersonId: bob.personId })
    expect(await alice.as.query(B.myBlockByHandle, { networkId: root, handle: "bob" })).toEqual({ targetPersonId: bob.personId })
    expect(await alice.as.query(B.myBlockByHandle, { networkId: root, handle: " BOB " })).toEqual({ targetPersonId: bob.personId })
    expect(await bob.as.query(B.myBlockByHandle, { networkId: root, handle: "alice" })).toBeNull()
    expect(await carol.as.query(B.myBlockByHandle, { networkId: root, handle: "bob" })).toBeNull()
    expect(await alice.as.query(B.myBlockByHandle, { networkId: root, handle: "alice" })).toBeNull()
    expect(await alice.as.query(B.myBlockByHandle, { networkId: root, handle: "inconnu" })).toBeNull()
    // Une fois levé, plus rien.
    await alice.as.mutation(C.unblockPerson, { networkId: root, targetPersonId: bob.personId })
    expect(await alice.as.query(B.myBlockByHandle, { networkId: root, handle: "bob" })).toBeNull()
  })

  it("blocages réciproques : chacun ne lit que le sien ; un marqueur hérité compte comme le mien", async () => {
    const { t, root, alice, bob, carol } = await fixture()
    await alice.as.mutation(C.blockPerson, { networkId: root, targetPersonId: bob.personId })
    await bob.as.mutation(C.blockPerson, { networkId: root, targetPersonId: alice.personId })
    expect(await alice.as.query(B.myBlockByHandle, { networkId: root, handle: "bob" })).toEqual({ targetPersonId: bob.personId })
    expect(await bob.as.query(B.myBlockByHandle, { networkId: root, handle: "alice" })).toEqual({ targetPersonId: alice.personId })
    const pair = canonicalPair(alice.personId, carol.personId)
    await t.run((ctx) => ctx.db.insert("connections", { networkId: root, personIdLow: pair.low, personIdHigh: pair.high, requestedByPersonId: carol.personId, recipientPersonId: alice.personId, status: "blocked", blockedByPersonId: carol.personId, requestedAt: NOW, updatedAt: NOW }))
    expect(await carol.as.query(B.myBlockByHandle, { networkId: root, handle: "alice" })).toEqual({ targetPersonId: alice.personId })
    expect(await alice.as.query(B.myBlockByHandle, { networkId: root, handle: "carol" })).toBeNull()
  })

  it("un profil retiré ne se résout plus ; le déblocage reste offert par la liste", async () => {
    const { root, alice, bob } = await fixture()
    await alice.as.mutation(C.blockPerson, { networkId: root, targetPersonId: bob.personId })
    await bob.as.mutation(api.modules.people.profile.withdrawMyProfile, {})
    expect(await alice.as.query(B.myBlockByHandle, { networkId: root, handle: "bob" })).toBeNull()
    expect((await alice.as.query(B.paginateMine, { networkId: root, source: "intents", paginationOpts: { numItems: 10, cursor: null } })).page).toEqual([{ targetPersonId: bob.personId, at: NOW }])
  })

  it("garde de réseau : sans session, hors du réseau ou suspendu, aucune lecture", async () => {
    const { t, root, testClosed, alice, bob } = await fixture()
    await alice.as.mutation(C.blockPerson, { networkId: root, targetPersonId: bob.personId })
    expect(await codeOf(t.query(B.myBlockByHandle, { networkId: root, handle: "bob" }))).toBe("unauthenticated")
    expect(await codeOf(alice.as.query(B.myBlockByHandle, { networkId: testClosed, handle: "bob" }))).toBe("notFound")
    await setStatus(t, root, alice.personId, "en_attente")
    expect(await alice.as.query(B.myBlockByHandle, { networkId: root, handle: "bob" })).toEqual({ targetPersonId: bob.personId })
    await setStatus(t, root, alice.personId, "suspendue")
    expect(await codeOf(alice.as.query(B.myBlockByHandle, { networkId: root, handle: "bob" }))).toBe("membershipSuspended")
  })
})
