// @vitest-environment edge-runtime
/**
 * CH-831 (ADR-0043, brouillon de l'architecte) — l'aide commune des rôles de réseau
 * (`setMembershipRole`) et son option `allowLastAdmin`.
 *
 * - L'option n'est admise que sur la démonstration DÉCLARÉE ou en développement local
 *   (`demoAccountsAllowed`) : ailleurs, production comprise, elle est refusée (`policyRefused`) avant
 *   toute écriture, même recopiée avec la variable de démonstration sur un autre déploiement.
 * - Avec l'option, la garde du dernier administrateur actif n'est pas consultée : le retrait de
 *   l'amorçage (`platform/networkAdminBootstrap.withdraw`, seul appelant admis — cliquet
 *   `operator-audit`) défait une nomination de démonstration sans remplaçant.
 * - Sans l'option rien ne change, démonstration comprise : l'aide, la console (`setNetworkRole`) et la
 *   tranche (`diaspora/membership.setResponsibleRole`) refusent toujours `NETWORK_LAST_ADMIN`.
 *
 * Noms de déploiement FICTIFS (cliquet `no-deployment-identifiers`).
 */
import { ConvexError } from "convex/values"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, openTestNetworkAdminSession, testConvex } from "../../test.setup"
import { setMembershipRole } from "./networkRoles"

type T = ReturnType<typeof testConvex>

const NOW = Date.UTC(2026, 10, 23, 10)
const DEMO_NAME = "demo-antsia-831"
const REASON = "Retrait décidé pour la recette du dernier administrateur."

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
  vi.stubEnv("ANTSIA_DEV_TOOLS", undefined)
  vi.stubEnv("ANTIA_DEV_TOOLS", undefined)
  vi.stubEnv("ANTSIA_DEMO_DEPLOYMENT", undefined)
  vi.stubEnv("CONVEX_CLOUD_URL", undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

function declareDemo() {
  vi.stubEnv("CONVEX_CLOUD_URL", `https://${DEMO_NAME}.convex.cloud`)
  vi.stubEnv("ANTSIA_DEMO_DEPLOYMENT", DEMO_NAME)
}

/** Les données du refus (`ConvexError`), ou `null` si l'appel passe. */
async function refusalOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error instanceof ConvexError ? error.data : { unexpected: String(error) }
  }
  return null
}

/** Une personne publiée, avec une vraie session (sessions automatiques de la recette). */
async function person(t: T, subject: string, handle: string) {
  const as = t.withIdentity({ subject })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await t.run(async (ctx) => {
    await ctx.db.patch(personId, { handle, displayName: handle, publishedAt: Date.now() })
  })
  return { as, personId }
}

/** Une adhésion posée directement (le chemin d'entrée a ses propres tests). */
async function membership(t: T, networkId: Id<"networks">, personId: Id<"persons">, extra: Partial<Doc<"networkMemberships">> = {}) {
  await t.run(async (ctx) => {
    const now = Date.now()
    await ctx.db.insert("networkMemberships", { networkId, personId, status: "declaree", role: "member", joinedAt: now, statusChangedAt: now, ...extra })
  })
}

async function roleOf(t: T, networkId: Id<"networks">, personId: Id<"persons">) {
  return await t.run(async (ctx) => (await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique())?.role ?? null)
}

/** La racine, diaspora-ga, et SON SEUL administrateur actif (adhésions racine et réseau). */
async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  const admin = await person(t, "seul-admin", "seul.admin")
  await membership(t, root, admin.personId)
  await membership(t, network, admin.personId, { role: "network_admin" })
  return { t, root, network, admin }
}

/** L'aide appelée directement, comme dans une mutation : le rôle `member` pour le seul administrateur. */
function withdrawSoleAdmin(f: Awaited<ReturnType<typeof fixture>>, options: { allowLastAdmin?: true } = {}) {
  return f.t.run(async (ctx) => {
    const network = await ctx.db.get(f.network)
    if (!network) throw new Error("Réseau de fixture absent")
    return await setMembershipRole(ctx, { network, personId: f.admin.personId, role: "member", ...options })
  })
}

describe("CH-831 — `allowLastAdmin`, l'option du retrait de l'amorçage", () => {
  it("hors démonstration déclarée et hors développement local : `policyRefused` avant toute écriture", async () => {
    const f = await fixture()
    // Aucun déploiement déclaré (moteur sans adresse de nuage connue).
    expect(await refusalOf(withdrawSoleAdmin(f, { allowLastAdmin: true }))).toEqual({ code: "policyRefused" })
    // En nuage, sans déclaration.
    vi.stubEnv("CONVEX_CLOUD_URL", "https://production-antsia-456.convex.cloud")
    expect(await refusalOf(withdrawSoleAdmin(f, { allowLastAdmin: true }))).toEqual({ code: "policyRefused" })
    // La déclaration recopiée sur un autre déploiement ne correspond pas à son nom.
    vi.stubEnv("ANTSIA_DEMO_DEPLOYMENT", DEMO_NAME)
    expect(await refusalOf(withdrawSoleAdmin(f, { allowLastAdmin: true }))).toEqual({ code: "policyRefused" })
    expect(await roleOf(f.t, f.network, f.admin.personId)).toBe("network_admin")
  })

  it("sur la démonstration déclarée, l'option retire le dernier administrateur actif", async () => {
    declareDemo()
    const f = await fixture()
    expect(await withdrawSoleAdmin(f, { allowLastAdmin: true })).toEqual({ personId: f.admin.personId, from: "network_admin", to: "member", changed: true })
    expect(await roleOf(f.t, f.network, f.admin.personId)).toBe("member")
  })

  it("en développement local aussi (outils de développement sur un moteur local)", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
    vi.stubEnv("ANTSIA_DEV_TOOLS", "true")
    const f = await fixture()
    expect((await withdrawSoleAdmin(f, { allowLastAdmin: true })).changed).toBe(true)
  })
})

describe("CH-831 — sans l'option, la garde du dernier administrateur tient partout, démonstration comprise", () => {
  it("l'aide, la console et la tranche refusent `NETWORK_LAST_ADMIN` sur la démonstration déclarée", async () => {
    declareDemo()
    const f = await fixture()
    const lastAdmin = { code: "invalidArgument", rule: "NETWORK_LAST_ADMIN", params: {} }
    expect(await refusalOf(withdrawSoleAdmin(f))).toEqual(lastAdmin)

    // La console : un administrateur de la plateforme, en session de console prouvée.
    const operator = await person(f.t, "op-admin", "op.admin")
    await membership(f.t, f.root, operator.personId)
    await f.t.run(async (ctx) => { await ctx.db.insert("operators", { personId: operator.personId, role: "platform_admin", grantedAt: Date.now() }) })
    await createTestOperatorProof(f.t, operator.as, operator.personId)
    expect(await refusalOf(operator.as.mutation(api.modules.platform.networkRoles.setNetworkRole, { networkId: f.network, personId: f.admin.personId, role: "member", reason: REASON }))).toEqual(lastAdmin)

    // La tranche : l'administrateur lui-même, en session prouvée de l'application d'administration.
    const adminApp = await openTestNetworkAdminSession(f.t, f.admin.as, f.admin.personId, f.network)
    expect(await refusalOf(adminApp.mutation(api.modules.diaspora.membership.setResponsibleRole, { networkId: f.network, personId: f.admin.personId, role: "member", reason: REASON }))).toEqual(lastAdmin)
    expect(await roleOf(f.t, f.network, f.admin.personId)).toBe("network_admin")
  })
})
