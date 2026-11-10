// @vitest-environment edge-runtime
/**
 * Le dernier administrateur ACTIF d'un réseau ne le quitte pas sans remplaçant
 * (`NETWORK_LAST_ADMIN`, garde `assertLeaveKeepsNetworkAdmin`) : ni directement, ni par la
 * cascade de la racine. Les départs qui ne sont pas voulus par la personne — suspension,
 * sanction de modération, effacement du compte — ne sont jamais retenus par la règle.
 */
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, testConvex } from "../../test.setup"
import { refreshSuspension } from "../moderation/sanctions"
import { ERASURE_GRACE_MS } from "./erasure"
import { assertLeaveKeepsNetworkAdmin } from "./networkRoles"

type T = ReturnType<typeof testConvex>
type Status = Doc<"networkMemberships">["status"]
const LEAVE = api.modules.people.memberships.leaveNetwork

async function errorOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise
    return null
  } catch (error) {
    return engineErrorRule(error)?.rule ?? engineErrorCode(error)
  }
}

async function seed() {
  const t = testConvex()
  const { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  return { t, root, testClosed }
}

/** Une personne publiée, avec une vraie session, membre « déclarée » des réseaux donnés. */
async function member(t: T, networkIds: Id<"networks">[], subject: string) {
  const as = t.withIdentity({ subject })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await t.run(async (ctx) => {
    const now = Date.now()
    await ctx.db.patch(personId, { handle: subject, displayName: subject, publishedAt: now })
    for (const networkId of networkIds) await ctx.db.insert("networkMemberships", { networkId, personId, status: "declaree", role: "member", joinedAt: now, statusChangedAt: now })
  })
  return { as, personId }
}

async function membershipOf(t: T, networkId: Id<"networks">, personId: Id<"persons">) {
  return await t.run(async (ctx) => await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique())
}

/** Pose l'état d'une adhésion (rôle, statut) : le montage, pas le sujet du test. */
async function setMembership(t: T, networkId: Id<"networks">, personId: Id<"persons">, patch: { role?: Doc<"networkMemberships">["role"]; status?: Status }) {
  await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique()
    if (!row) throw new Error("adhésion absente")
    await ctx.db.patch(row._id, { ...patch, ...(patch.status === "suspendue" ? { statusBeforeSuspension: "declaree" as const } : {}) })
  })
}

describe("départ volontaire du dernier administrateur d'un réseau", () => {
  it("le dernier administrateur actif ne part pas : refus NETWORK_LAST_ADMIN, rien n'est écrit", async () => {
    const { t, root, testClosed } = await seed()
    const awa = await member(t, [root, testClosed], "awa")
    await setMembership(t, testClosed, awa.personId, { role: "network_admin" })
    const before = await membershipOf(t, testClosed, awa.personId)
    expect(await errorOf(awa.as.mutation(LEAVE, { networkId: testClosed }))).toBe("NETWORK_LAST_ADMIN")
    expect(await membershipOf(t, testClosed, awa.personId)).toEqual(before)
    // La garde exportée, telle que l'appellera une tranche, lève le même refus.
    expect(await errorOf(t.run(async (ctx) => await assertLeaveKeepsNetworkAdmin(ctx, testClosed, awa.personId)))).toBe("NETWORK_LAST_ADMIN")
  })

  it("avec un second administrateur actif, il part et son rôle retombe à member ; l'autre devient le dernier", async () => {
    const { t, root, testClosed } = await seed()
    const awa = await member(t, [root, testClosed], "awa")
    const bob = await member(t, [root, testClosed], "bob")
    await setMembership(t, testClosed, awa.personId, { role: "network_admin" })
    await setMembership(t, testClosed, bob.personId, { role: "network_admin" })
    expect(await awa.as.mutation(LEAVE, { networkId: testClosed })).toBeNull()
    expect(await membershipOf(t, testClosed, awa.personId)).toMatchObject({ status: "partie", role: "member" })
    // La racine reste : quitter un réseau fermé ne la retire pas.
    expect(await membershipOf(t, root, awa.personId)).toMatchObject({ status: "declaree" })
    expect(await errorOf(bob.as.mutation(LEAVE, { networkId: testClosed }))).toBe("NETWORK_LAST_ADMIN")
    // Un simple membre part toujours.
    const carla = await member(t, [root, testClosed], "carla")
    expect(await carla.as.mutation(LEAVE, { networkId: testClosed })).toBeNull()
  })

  it("un administrateur suspendu (au réseau ou à la racine) ne compte pas comme actif", async () => {
    const { t, root, testClosed } = await seed()
    const awa = await member(t, [root, testClosed], "awa")
    const bob = await member(t, [root, testClosed], "bob")
    await setMembership(t, testClosed, awa.personId, { role: "network_admin" })
    await setMembership(t, testClosed, bob.personId, { role: "network_admin", status: "suspendue" })
    expect(await errorOf(awa.as.mutation(LEAVE, { networkId: testClosed }))).toBe("NETWORK_LAST_ADMIN")

    // Suspendu à la racine, il est suspendu partout : il ne compte pas davantage.
    await setMembership(t, testClosed, bob.personId, { status: "declaree" })
    await setMembership(t, root, bob.personId, { status: "suspendue" })
    expect(await errorOf(awa.as.mutation(LEAVE, { networkId: testClosed }))).toBe("NETWORK_LAST_ADMIN")

    // Rétabli, il compte de nouveau : Awa part.
    await setMembership(t, root, bob.personId, { status: "declaree" })
    expect(await awa.as.mutation(LEAVE, { networkId: testClosed })).toBeNull()
  })

  it("le dernier administrateur de la racine ne la quitte pas", async () => {
    const { t, root } = await seed()
    const awa = await member(t, [root], "awa")
    await setMembership(t, root, awa.personId, { role: "network_admin" })
    expect(await errorOf(awa.as.mutation(LEAVE, { networkId: root }))).toBe("NETWORK_LAST_ADMIN")
    expect(await membershipOf(t, root, awa.personId)).toMatchObject({ status: "declaree", role: "network_admin" })
  })

  it("quitter la racine ferait quitter le réseau dont on est le dernier administrateur : refusé, rien n'est écrit", async () => {
    const { t, root, testClosed } = await seed()
    const awa = await member(t, [root, testClosed], "awa")
    await setMembership(t, testClosed, awa.personId, { role: "network_admin" })
    expect(await errorOf(awa.as.mutation(LEAVE, { networkId: root }))).toBe("NETWORK_LAST_ADMIN")
    expect(await membershipOf(t, root, awa.personId)).toMatchObject({ status: "declaree" })
    expect(await membershipOf(t, testClosed, awa.personId)).toMatchObject({ status: "declaree", role: "network_admin" })

    // Un remplaçant nommé, la cascade passe : les deux adhésions partent, le rôle retombe.
    const bob = await member(t, [root, testClosed], "bob")
    await setMembership(t, testClosed, bob.personId, { role: "network_admin" })
    expect(await awa.as.mutation(LEAVE, { networkId: root })).toBeNull()
    expect(await membershipOf(t, root, awa.personId)).toMatchObject({ status: "partie" })
    expect(await membershipOf(t, testClosed, awa.personId)).toMatchObject({ status: "partie", role: "member" })
  })
})

describe("les départs non voulus ne sont jamais retenus par la règle", () => {
  it("la console suspend partout le dernier administrateur ; son rôle reste pour la levée", async () => {
    const { t, root, testClosed } = await seed()
    const awa = await member(t, [root, testClosed], "awa")
    await setMembership(t, testClosed, awa.personId, { role: "network_admin" })
    const admin = await member(t, [root], "op-admin")
    await t.run(async (ctx) => {
      await ctx.db.insert("operators", { personId: admin.personId, role: "platform_admin", grantedAt: Date.now() })
    })
    await createTestOperatorProof(t, admin.as, admin.personId)
    expect(await admin.as.mutation(api.modules.people.memberships.suspendEverywhere, { personId: awa.personId, reason: "Suspension décidée après examen du dossier." })).toBeNull()
    expect(await membershipOf(t, root, awa.personId)).toMatchObject({ status: "suspendue" })
    expect(await membershipOf(t, testClosed, awa.personId)).toMatchObject({ role: "network_admin" })
  })

  it("une sanction de modération tombe sur le dernier administrateur", async () => {
    const { t, root, testClosed } = await seed()
    const awa = await member(t, [root, testClosed], "awa")
    await setMembership(t, testClosed, awa.personId, { role: "network_admin" })
    await t.run(async (ctx) => {
      const now = Date.now()
      const target = { kind: "person" as const, id: awa.personId }
      const reportId = await ctx.db.insert("reports", { networkId: root, target, targetKind: "person", targetId: awa.personId, ownerPersonId: awa.personId, reason: "Recette de garde", level: "platform", status: "actioned", createdAt: now, updatedAt: now })
      await ctx.db.insert("sanctions", { networkId: root, reportId, personId: awa.personId, kind: "suspension", status: "active", reason: "Recette de garde", target, createdAt: now, updatedAt: now })
      await refreshSuspension(ctx, awa.personId)
    })
    expect(await membershipOf(t, root, awa.personId)).toMatchObject({ status: "suspendue" })
  })

  it("le dernier administrateur demande l'effacement de son compte ; la purge retire ses adhésions", async () => {
    vi.useFakeTimers()
    try {
      const { t, root, testClosed } = await seed()
      const awa = await member(t, [root, testClosed], "awa")
      await setMembership(t, testClosed, awa.personId, { role: "network_admin" })
      await awa.as.mutation(api.modules.people.erasure.requestErasure, { confirmation: "DELETE_MY_ANTSIA_ACCOUNT" })
      const job = await t.run(async (ctx) => await ctx.db.query("dataErasureJobs").withIndex("by_person", (q) => q.eq("personId", awa.personId)).unique())
      if (!job) throw new Error("demande d'effacement absente")
      vi.setSystemTime(Date.now() + ERASURE_GRACE_MS + 1)
      await t.mutation(internal.modules.people.erasure.continueErasure, { jobId: job._id })
      // Le harnais termine 100 continuations par défaut ; l'inventaire complet traverse plus de tables.
      for (let step = 0; step < 1500 && (await t.run(async (ctx) => await ctx.db.get(job._id))); step++) {
        vi.runAllTimers()
        await t.finishInProgressScheduledFunctions()
      }
      expect(await t.run(async (ctx) => await ctx.db.get(awa.personId))).toBeNull()
      expect(await membershipOf(t, root, awa.personId)).toBeNull()
      expect(await membershipOf(t, testClosed, awa.personId)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
