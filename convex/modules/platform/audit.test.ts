// @vitest-environment edge-runtime
// Dupliqué de socle/convex/tests/reseauPlatformActsAudit.test.ts @ ad2e7fdc2 — adaptations : PATRON repris (une décision écrit sa ligne d'audit, une décision refusée n'en écrit pas) ; décisions de console du moteur (réseaux, suspensions) au lieu des actes de plateforme du réseau institutionnel ; qualité de l'acteur au lieu du contexte d'organisation ; lectures (console, réseau) et refus indistinct neufs ; cohérence d'une ligne (acteur et qualité, détail borné) neuve.
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, testConvex } from "../../test.setup"
import { appendAudit } from "./audit"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons"> }

afterEach(() => {
  vi.useRealTimers()
})

const PAGE = { numItems: 50, cursor: null }
const NETWORK_SETTINGS = { name: "Ville test", membershipPolicy: "open" as const, defaultVisibility: "network" as const, reachValues: [], theme: "antsia" }

async function seed(t: T) {
  return await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
}

async function enter(t: T, rootId: Id<"networks">, subject: string): Promise<Person> {
  const as = t.withIdentity({ subject })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle: subject, displayName: subject })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: rootId })
  return { as, personId }
}

async function makeOperator(t: T, person: Person, role: "platform_operator" | "platform_admin" = "platform_operator"): Promise<Person> {
  await t.run(async (ctx) => {
    await ctx.db.insert("operators", { personId: person.personId, role, grantedAt: Date.now() })
  })
  await createTestOperatorProof(t, person.as, person.personId)
  return person
}

async function setRole(t: T, networkId: Id<"networks">, person: Person, role: "network_moderator" | "network_admin"): Promise<void> {
  await t.run(async (ctx) => {
    const membership = await ctx.db
      .query("networkMemberships")
      .withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", person.personId))
      .unique()
    if (membership) await ctx.db.patch(membership._id, { role })
  })
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  return null
}

async function journal(operator: Person, networkId?: Id<"networks">) {
  return (await operator.as.query(api.modules.platform.audit.paginateAudit, { ...(networkId ? { networkId } : {}), paginationOpts: PAGE })).page.filter((line) => line.action !== "console.access")
}

describe("une décision de console écrit sa ligne — qui, à quel titre, pourquoi", () => {
  it("suspendre puis lever : deux lignes sur la personne, dans la racine ; un motif hors bornes ne laisse rien", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const { root } = await seed(t)
    const admin = await makeOperator(t, await enter(t, root, "administratrice"), "platform_admin")
    const paul = await enter(t, root, "paul")

    const tooShort = await caught(admin.as.mutation(api.modules.people.memberships.suspendEverywhere, { personId: paul.personId, reason: "court" }))
    expect(engineErrorCode(tooShort)).toBe("invalidArgument")
    expect(engineErrorRule(tooShort)).toEqual({ rule: "DECISION_REASON_LENGTH", params: { min: 10, max: 500 } })
    expect(await journal(admin)).toEqual([])

    await admin.as.mutation(api.modules.people.memberships.suspendEverywhere, { personId: paul.personId, reason: "  Signalements répétés et confirmés.  " })
    vi.advanceTimersByTime(1_000)
    await admin.as.mutation(api.modules.people.memberships.liftSuspension, { personId: paul.personId, reason: "Recours accueilli après examen." })

    const lines = await journal(admin)
    expect(lines).toMatchObject([
      {
        action: "membership.lift_suspension",
        capacity: "platform_admin",
        actor: { personId: admin.personId, handle: "administratrice" },
        networkId: root,
        subject: { table: "persons", id: paul.personId },
        details: { reason: "Recours accueilli après examen.", to: "declaree" },
      },
      { action: "membership.suspend_everywhere", details: { reason: "Signalements répétés et confirmés.", from: "declaree" } },
    ])
  })

  it("réseau : créer, régler, demander l'archivage et l'approuver — quatre lignes ; un réglage sans motif n'en invente pas", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const { root } = await seed(t)
    const operator = await makeOperator(t, await enter(t, root, "operateur"), "platform_admin")
    const created = await operator.as.mutation(api.modules.networks.networks.create, { slug: "ville-test", kind: "closed", ...NETWORK_SETTINGS })
    vi.advanceTimersByTime(1_000)
    await operator.as.mutation(api.modules.networks.networks.update, { networkId: created, ...NETWORK_SETTINGS, name: "Ville test (renommée)" })
    vi.advanceTimersByTime(1_000)
    expect(engineErrorCode(await caught(operator.as.mutation(api.modules.networks.networks.archive, { networkId: created, reason: "x".repeat(501) })))).toBe("invalidArgument")
    const approver = await makeOperator(t, await enter(t, root, "approbatrice"), "platform_admin")
    const reason = "Réseau de recette fermé."
    const { archiveRequestId } = await operator.as.mutation(api.modules.networks.networks.requestArchive, { networkId: created, reason })
    vi.advanceTimersByTime(1_000)
    await approver.as.mutation(api.modules.networks.networks.archive, { networkId: created, reason, archiveRequestId })

    const lines = await journal(operator, created)
    expect(lines.map((line) => line.action)).toEqual(["network.archive", "network.archive_request", "network.update", "network.create"])
    expect(lines.every((line) => line.capacity === "platform_admin" && line.networkId === created)).toBe(true)
    expect(lines[0]).toMatchObject({ actor: { personId: approver.personId }, subject: { table: "networks", id: created }, details: { reason, requestReason: reason, archiveRequestId } })
    expect(JSON.stringify(lines[0]?.details)).not.toContain(operator.personId)
    expect(lines[1]).toMatchObject({ actor: { personId: operator.personId }, subject: { table: "networkArchiveRequests", id: archiveRequestId }, details: { reason } })
    expect(lines[2]?.details).toBeNull()
    expect(lines[3]?.details).toEqual({ slug: "ville-test", kind: "closed" })
  })
})

describe("lire le journal", () => {
  it("la console lit tout et l'histoire d'un sujet ; un non-opérateur est refusé", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const operator = await makeOperator(t, await enter(t, root, "operatrice"))
    const paul = await enter(t, root, "paul")
    await operator.as.mutation(api.modules.people.memberships.suspendEverywhere, { personId: paul.personId, reason: "Usurpation d'identité avérée." })
    const history = await operator.as.query(api.modules.platform.audit.paginateSubjectAudit, { subjectTable: "persons", subjectId: paul.personId, paginationOpts: PAGE })
    expect(history.page.map((line) => line.action)).toEqual(["membership.suspend_everywhere"])
    expect(engineErrorCode(await caught(paul.as.query(api.modules.platform.audit.paginateAudit, { paginationOpts: PAGE })))).toBe("operatorRequired")
  })

  it("le journal d'un réseau est à ses administrateurs et modérateurs ; tout autre membre reçoit le refus indistinct", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const operator = await makeOperator(t, await enter(t, root, "operateur"))
    const moderator = await enter(t, root, "moderatrice")
    const member = await enter(t, root, "membre")
    const target = await enter(t, root, "cible")
    await setRole(t, root, moderator, "network_moderator")
    await operator.as.mutation(api.modules.people.memberships.suspendEverywhere, { personId: target.personId, reason: "Harcèlement répété et confirmé." })

    const seen = await moderator.as.query(api.modules.platform.audit.paginateNetworkAudit, { networkId: root, paginationOpts: PAGE })
    expect(seen.page).toMatchObject([{ action: "membership.suspend_everywhere", capacity: "platform_operator", actor: { handle: "operateur" } }])
    expect(engineErrorCode(await caught(member.as.query(api.modules.platform.audit.paginateNetworkAudit, { networkId: root, paginationOpts: PAGE })))).toBe("notFound")
  })
})

describe("tranche diaspora : admissions fondatrices (EA-01)", () => {
  it("admettre puis retirer : deux lignes sur la personne, lues dans son histoire, motif et dispense ou cause au détail", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const operator = await makeOperator(t, await enter(t, root, "operatrice"))
    const awa = await enter(t, root, "awa")
    const subject = { table: "persons" as const, id: awa.personId }
    // La ligne qu'écrira la mutation d'opérateur de la tranche, dans la transaction de sa décision.
    await t.run(async (ctx) => {
      const db = ctx as unknown as MutationCtx
      await appendAudit(db, {
        action: "diaspora.founder_admit",
        capacity: "platform_operator",
        actorPersonId: operator.personId,
        networkId: root,
        subject,
        details: { reason: "Animatrice reconnue de la communauté locale.", seniorityWaiver: true },
        at: 1_000,
      })
      await appendAudit(db, {
        action: "diaspora.founder_withdraw",
        capacity: "platform_operator",
        actorPersonId: operator.personId,
        networkId: root,
        subject,
        details: { reason: "Retrait demandé par la personne admise.", cause: "operator" },
        at: 2_000,
      })
    })

    const history = await operator.as.query(api.modules.platform.audit.paginateSubjectAudit, { subjectTable: "persons", subjectId: awa.personId, paginationOpts: PAGE })
    expect(history.page).toMatchObject([
      {
        action: "diaspora.founder_withdraw",
        capacity: "platform_operator",
        actor: { personId: operator.personId, handle: "operatrice" },
        networkId: root,
        subject,
        details: { reason: "Retrait demandé par la personne admise.", cause: "operator" },
      },
      { action: "diaspora.founder_admit", subject, details: { reason: "Animatrice reconnue de la communauté locale.", seniorityWaiver: true } },
    ])
  })
})

describe("une ligne incohérente est une faute de programmation", () => {
  it("le système n'a pas d'acteur, un humain en a un, et le détail reste borné", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const someone = await enter(t, root, "quelquun")
    const subject = { table: "persons" as const, id: someone.personId }
    await t.run(async (ctx) => {
      const db = ctx as unknown as MutationCtx
      await expect(appendAudit(db, { action: "file.purge_blob", capacity: "system", actorPersonId: someone.personId, subject })).rejects.toThrow("[audit]")
      await expect(appendAudit(db, { action: "network.update", capacity: "platform_operator", subject })).rejects.toThrow("[audit]")
      await expect(
        appendAudit(db, { action: "network.update", capacity: "platform_operator", actorPersonId: someone.personId, subject, details: { reason: "x".repeat(501) } }),
      ).rejects.toThrow("[audit]")
    })
    expect(await t.run(async (ctx) => (await ctx.db.query("engineAudit").take(10)).length)).toBe(0)
  })
})
