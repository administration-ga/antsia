// @vitest-environment edge-runtime
/**
 * `writeContextualPolicy` seule (issue antsia#107) : l'écriture de la politique, sans garde ni journal,
 * que partagent la console (`operator.setPolicy`, couverte par `contextualMessaging.test.ts`) et la
 * graine locale de la tranche DIASPORALE. Horloge figée : les passages planifiés ne s'exécutent pas
 * d'eux-mêmes, `_scheduled_functions` dit ce que l'aide a programmé.
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { type ContextualPolicyInput, writeContextualPolicy } from "./policy"

type T = ReturnType<typeof testConvex>

const NOW = Date.UTC(2026, 10, 10, 9)
const REVALIDATE = "modules/contextualMessaging/retention:revalidateCalls"

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const as = t.withIdentity({ subject: "policy-admin" })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  return { t, root, personId }
}

async function write(t: T, input: ContextualPolicyInput) {
  return await t.run(async (ctx) => await writeContextualPolicy(ctx, input))
}

async function rows(t: T, networkId: Id<"networks">) {
  return await t.run(async (ctx) => await ctx.db.query("contextualPolicies").withIndex("by_network_kind", (q) => q.eq("networkId", networkId)).take(10))
}

async function revalidations(t: T): Promise<number> {
  return (await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").take(100))).filter((job) => job.name === REVALIDATE).length
}

async function caught(work: Promise<unknown>): Promise<unknown> {
  try {
    await work
    return null
  } catch (error) {
    return error
  }
}

describe("writeContextualPolicy — l'état seul, sans garde ni journal", () => {
  it("l'état déjà en place n'écrit rien : fermée sans ligne, puis ouverte deux fois", async () => {
    const { t, root, personId } = await fixture()
    expect(await write(t, { networkId: root, kind: "diasporaMentoring", enabled: false })).toEqual({ changed: false, at: NOW })
    expect(await rows(t, root)).toEqual([])
    expect(await revalidations(t)).toBe(0)

    expect(await write(t, { networkId: root, kind: "diasporaMentoring", enabled: true, updatedByPersonId: personId })).toEqual({ changed: true, at: NOW })
    const opened = await rows(t, root)
    vi.setSystemTime(NOW + 60_000)
    expect(await write(t, { networkId: root, kind: "diasporaMentoring", enabled: true })).toEqual({ changed: false, at: NOW + 60_000 })
    // Ligne intacte : ni date ni auteur réécrits par un geste sans effet.
    expect(await rows(t, root)).toEqual(opened)
    expect(await revalidations(t)).toBe(0)
  })

  it("ouvrir insère une ligne par nature, attribuée ou non, sans revalidation ni journal", async () => {
    const { t, root, personId } = await fixture()
    await write(t, { networkId: root, kind: "diasporaServiceRequest", enabled: true, updatedByPersonId: personId })
    await write(t, { networkId: root, kind: "diasporaJobApplication", enabled: true })
    const byKind = new Map((await rows(t, root)).map((row) => [row.kind, row]))
    expect(byKind.size).toBe(2)
    expect(byKind.get("diasporaServiceRequest")).toMatchObject({ enabled: true, updatedAt: NOW, updatedByPersonId: personId })
    expect(byKind.get("diasporaJobApplication")).toMatchObject({ enabled: true, updatedAt: NOW })
    expect(byKind.get("diasporaJobApplication")?.updatedByPersonId).toBeUndefined()
    expect(await revalidations(t)).toBe(0)
    // Le journal reste à l'appelant : l'aide n'en écrit aucun.
    expect((await t.run(async (ctx) => await ctx.db.query("engineAudit").take(100))).filter((row) => row.action === "contextual.policy_set")).toEqual([])
  })

  it("fermer met à jour la même ligne et programme la revalidation des appels vivants", async () => {
    const { t, root, personId } = await fixture()
    await write(t, { networkId: root, kind: "diasporaServiceRequest", enabled: true, updatedByPersonId: personId })
    vi.setSystemTime(NOW + 1_000)
    expect(await write(t, { networkId: root, kind: "diasporaServiceRequest", enabled: false })).toEqual({ changed: true, at: NOW + 1_000 })
    const after = await rows(t, root)
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ kind: "diasporaServiceRequest", enabled: false, updatedAt: NOW + 1_000 })
    // Geste du système : la décision n'est plus attribuée à la personne qui avait ouvert.
    expect(after[0]?.updatedByPersonId).toBeUndefined()
    expect(await revalidations(t)).toBe(1)
  })

  it("un réseau archivé ou absent reçoit le refus indistinct, sans rien écrire", async () => {
    const { t, root, personId } = await fixture()
    const gone = await t.run(async (ctx) => {
      const id = await ctx.db.insert("networks", { slug: "politique-disparue", name: "Réseau de fixture", kind: "closed", membershipPolicy: "declared_or_verified", defaultVisibility: "network", reachValues: [], theme: "antsia", parentId: root, status: "active", createdAt: NOW, updatedAt: NOW })
      await ctx.db.delete(id)
      return id
    })
    expect(engineErrorCode(await caught(write(t, { networkId: gone, kind: "diasporaMentoring", enabled: true, updatedByPersonId: personId })))).toBe("notFound")
    await t.run(async (ctx) => await ctx.db.patch(root, { status: "archived" }))
    for (const enabled of [true, false]) {
      expect(engineErrorCode(await caught(write(t, { networkId: root, kind: "diasporaMentoring", enabled, updatedByPersonId: personId })))).toBe("notFound")
    }
    expect(await rows(t, root)).toEqual([])
    expect(await revalidations(t)).toBe(0)
  })
})
