// @vitest-environment edge-runtime
/**
 * EX-08 (plan 13) et issue 98 — nommer et retirer les responsables d'un réseau. Les fonctions
 * réelles : la console (administrateur de la plateforme), la capacité que le moteur lit déjà
 * (file du réseau), le journal fermé, et l'aide partagée qu'appellera la tranche d'un réseau
 * gouverné (`people/networkRoles`).
 */
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import type { MembershipRole } from "@antsia/social-domain/membership"
import { describe, expect, it } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, testConvex } from "../../test.setup"
import { NETWORK_ROLE_HOLDERS_MAX, networkRoleAuditEntry, setMembershipRole } from "../people/networkRoles"
import { appendAudit } from "./audit"

type T = ReturnType<typeof testConvex>
const R = api.modules.platform.networkRoles
const CASES = api.modules.moderation.cases
const REASON = "Nomination décidée après examen de la candidature."
const PAGE = { cursor: null, numItems: 20 }

async function errorOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise
    return null
  } catch (error) {
    return engineErrorRule(error)?.rule ?? engineErrorCode(error)
  }
}

/** Une personne publiée, avec une vraie session. */
async function person(t: T, subject: string, handle: string) {
  const as = t.withIdentity({ subject })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await t.run(async (ctx) => {
    await ctx.db.patch(personId, { handle, displayName: handle, publishedAt: Date.now() })
  })
  return { as, personId }
}

/** Une adhésion posée directement (le chemin d'entrée a ses propres tests). */
async function membership(t: T, networkId: Id<"networks">, personId: Id<"persons">, status: Doc<"networkMemberships">["status"] = "declaree", extra: Partial<Doc<"networkMemberships">> = {}) {
  return await t.run(async (ctx) => {
    const now = Date.now()
    return await ctx.db.insert("networkMemberships", { networkId, personId, status, role: "member", joinedAt: now, statusChangedAt: now, ...extra })
  })
}

async function member(t: T, networkIds: Id<"networks">[], subject: string, handle: string) {
  const found = await person(t, subject, handle)
  for (const networkId of networkIds) await membership(t, networkId, found.personId)
  return found
}

async function operator(t: T, root: Id<"networks">, subject: string, role: Doc<"operators">["role"]) {
  const found = await person(t, subject, subject)
  await membership(t, root, found.personId)
  await t.run(async (ctx) => {
    await ctx.db.insert("operators", { personId: found.personId, role, grantedAt: Date.now() })
  })
  await createTestOperatorProof(t, found.as, found.personId)
  return found
}

async function seed() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const admin = await operator(t, root, "op-admin", "platform_admin")
  return { t, root, admin }
}

/** Un réseau GOUVERNÉ par la tranche `diaspora`, enfant de la racine. */
async function managedNetwork(t: T, root: Id<"networks">) {
  return await t.run(async (ctx) => {
    const now = Date.now()
    return await ctx.db.insert("networks", { slug: "gouverne-roles", kind: "closed", parentId: root, managedBy: "diaspora", name: "Réseau gouverné de test", membershipPolicy: "declared_or_verified", defaultVisibility: "network", reachValues: [], theme: "antsia", status: "active", createdAt: now, updatedAt: now })
  })
}

async function roleOf(t: T, networkId: Id<"networks">, personId: Id<"persons">) {
  return await t.run(async (ctx) => (await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique())?.role ?? null)
}

async function roleJournal(t: T) {
  return (await t.run(async (ctx) => await ctx.db.query("engineAudit").withIndex("by_at").take(200))).filter((row) => row.action === "membership.role_set")
}

/** Ce que fera la tranche d'un réseau gouverné, après SES contrôles (administrateur du réseau, motif, débit). */
async function sliceSetsRole(t: T, networkId: Id<"networks">, actorPersonId: Id<"persons">, personId: Id<"persons">, role: MembershipRole) {
  return await t.run(async (ctx) => {
    const network = await ctx.db.get(networkId)
    if (!network) throw new Error("réseau absent")
    const change = await setMembershipRole(ctx, { network, personId, role })
    if (change.changed) await appendAudit(ctx, networkRoleAuditEntry({ networkId, change, actor: { personId: actorPersonId, capacity: "network_admin" }, reason: "Décision de l'administration du réseau." }))
    return change
  })
}

describe("EX-08 / responsables d'un réseau à la console", () => {
  it("un modérateur nommé lit la file de son réseau ; le retrait la lui ferme à l'acte suivant", async () => {
    const { t, root, admin } = await seed()
    const awa = await member(t, [root], "awa", "awa")
    expect(await errorOf(awa.as.query(CASES.paginateQueue, { networkId: root, paginationOpts: PAGE }))).toBe("notFound")
    expect(await awa.as.query(CASES.myCapacity, { networkId: root })).toMatchObject({ networkWide: false, canReviewAppeals: false })

    expect(await admin.as.mutation(R.setNetworkRole, { networkId: root, personId: awa.personId, role: "network_moderator", reason: REASON })).toEqual({ role: "network_moderator", changed: true })
    expect(await awa.as.query(CASES.paginateQueue, { networkId: root, paginationOpts: PAGE })).toMatchObject({ page: [] })
    expect(await awa.as.query(CASES.myCapacity, { networkId: root })).toMatchObject({ networkWide: true, canReviewAppeals: false })

    await admin.as.mutation(R.setNetworkRole, { networkId: root, personId: awa.personId, role: "member", reason: "Fin de mission de modération." })
    expect(await roleOf(t, root, awa.personId)).toBe("member")
    expect(await errorOf(awa.as.query(CASES.paginateQueue, { networkId: root, paginationOpts: PAGE }))).toBe("notFound")
    expect(await awa.as.query(CASES.myCapacity, { networkId: root })).toMatchObject({ networkWide: false })
  })

  it("seul un administrateur de la plateforme décide ; un opérateur lit ; un membre ne voit rien", async () => {
    const { t, root, admin } = await seed()
    const reader = await operator(t, root, "op-lecteur", "platform_operator")
    const awa = await member(t, [root], "awa", "awa")
    expect(await errorOf(reader.as.mutation(R.setNetworkRole, { networkId: root, personId: awa.personId, role: "network_admin", reason: REASON }))).toBe("operatorRequired")
    expect(await errorOf(awa.as.mutation(R.setNetworkRole, { networkId: root, personId: awa.personId, role: "network_admin", reason: REASON }))).toBe("operatorRequired")
    expect(await errorOf(awa.as.query(R.paginateNetworkRoles, { networkId: root, role: "network_admin", paginationOpts: PAGE }))).toBe("operatorRequired")
    expect(await roleOf(t, root, awa.personId)).toBe("member")

    await admin.as.mutation(R.setNetworkRole, { networkId: root, personId: awa.personId, role: "network_admin", reason: REASON })
    expect(await reader.as.query(R.paginateNetworkRoles, { networkId: root, role: "network_admin", paginationOpts: PAGE })).toMatchObject({
      page: [{ personId: awa.personId, handle: "awa", displayName: "awa", active: true }],
      isDone: true,
      managedBy: null,
    })
    expect(await reader.as.query(R.paginateNetworkRoles, { networkId: root, role: "network_moderator", paginationOpts: PAGE })).toMatchObject({ page: [] })
    expect(await errorOf(reader.as.query(R.paginateNetworkRoles, { networkId: root, role: "network_admin", paginationOpts: { cursor: null, numItems: 51 } }))).toBe("invalidArgument")
  })

  it("aucune adhésion n'est créée : sans adhésion active, le refus est indistinct", async () => {
    const { t, root, admin } = await seed()
    const stranger = await person(t, "sans-adhesion", "sans.adhesion")
    expect(await errorOf(admin.as.mutation(R.setNetworkRole, { networkId: root, personId: stranger.personId, role: "network_moderator", reason: REASON }))).toBe("notFound")
    expect(await roleOf(t, root, stranger.personId)).toBeNull()

    const waiting = await person(t, "en-attente", "en.attente")
    await membership(t, root, waiting.personId, "en_attente")
    const gone = await person(t, "partie", "partie")
    await membership(t, root, gone.personId, "partie")
    const suspended = await person(t, "suspendue", "suspendue")
    await membership(t, root, suspended.personId, "suspendue", { statusBeforeSuspension: "declaree" })
    for (const target of [waiting, gone, suspended]) {
      expect(await errorOf(admin.as.mutation(R.setNetworkRole, { networkId: root, personId: target.personId, role: "network_moderator", reason: REASON }))).toBe("notFound")
      expect(await roleOf(t, root, target.personId)).toBe("member")
    }

    // Une personne active à la racine mais sans adhésion au réseau visé : aucune n'y est créée.
    const awa = await member(t, [root], "awa", "awa")
    const managed = await managedNetwork(t, root)
    expect(await errorOf(admin.as.mutation(R.setNetworkRole, { networkId: managed, personId: awa.personId, role: "network_admin", reason: REASON }))).toBe("notFound")
    expect(await roleOf(t, managed, awa.personId)).toBeNull()

    // Un réseau archivé ne se gouverne plus.
    await t.run(async (ctx) => { await ctx.db.patch(managed, { status: "archived" }) })
    expect(await errorOf(admin.as.query(R.paginateNetworkRoles, { networkId: managed, role: "network_admin", paginationOpts: PAGE }))).toBe("notFound")
    expect(await roleJournal(t)).toEqual([])
  })

  it("chaque décision laisse sa ligne au journal fermé ; un rôle déjà posé n'en laisse aucune ; le motif est exigé", async () => {
    const { t, root, admin } = await seed()
    const awa = await member(t, [root], "awa", "awa")
    expect(await errorOf(admin.as.mutation(R.setNetworkRole, { networkId: root, personId: awa.personId, role: "network_moderator", reason: "court" }))).toBe("DECISION_REASON_LENGTH")
    await admin.as.mutation(R.setNetworkRole, { networkId: root, personId: awa.personId, role: "network_moderator", reason: REASON })
    expect(await admin.as.mutation(R.setNetworkRole, { networkId: root, personId: awa.personId, role: "network_moderator", reason: REASON })).toEqual({ role: "network_moderator", changed: false })
    await admin.as.mutation(R.setNetworkRole, { networkId: root, personId: awa.personId, role: "network_admin", reason: "Promotion à l'administration du réseau." })
    const journal = await roleJournal(t)
    expect(journal).toHaveLength(2)
    expect(journal[0]).toMatchObject({ capacity: "platform_admin", actorPersonId: admin.personId, networkId: root, subjectTable: "persons", subjectId: awa.personId, details: { reason: REASON, from: "member", to: "network_moderator" } })
    expect(journal[1]).toMatchObject({ details: { from: "network_moderator", to: "network_admin" } })
    // La console lit la décision dans l'histoire de la personne.
    const history = await admin.as.query(api.modules.platform.audit.paginateSubjectAudit, { subjectTable: "persons", subjectId: awa.personId, paginationOpts: PAGE })
    expect(history.page.map((row) => row.action)).toEqual(["membership.role_set", "membership.role_set"])
  })

  it("le dernier administrateur actif reste ; un administrateur suspendu se retire toujours", async () => {
    const { t, root, admin } = await seed()
    const awa = await member(t, [root], "awa", "awa")
    const bob = await member(t, [root], "bob", "bob")
    await admin.as.mutation(R.setNetworkRole, { networkId: root, personId: awa.personId, role: "network_admin", reason: REASON })
    expect(await errorOf(admin.as.mutation(R.setNetworkRole, { networkId: root, personId: awa.personId, role: "member", reason: REASON }))).toBe("NETWORK_LAST_ADMIN")
    expect(await errorOf(admin.as.mutation(R.setNetworkRole, { networkId: root, personId: awa.personId, role: "network_moderator", reason: REASON }))).toBe("NETWORK_LAST_ADMIN")
    await admin.as.mutation(R.setNetworkRole, { networkId: root, personId: bob.personId, role: "network_admin", reason: REASON })
    await admin.as.mutation(R.setNetworkRole, { networkId: root, personId: awa.personId, role: "member", reason: REASON })
    expect(await roleOf(t, root, awa.personId)).toBe("member")

    // Bob, seul administrateur, est suspendu : il n'est plus actif, son rôle se retire sans attendre la levée.
    await t.run(async (ctx) => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", root).eq("personId", bob.personId)).unique()
      if (row) await ctx.db.patch(row._id, { status: "suspendue", statusBeforeSuspension: "declaree" })
    })
    expect(await admin.as.query(R.paginateNetworkRoles, { networkId: root, role: "network_admin", paginationOpts: PAGE })).toMatchObject({ page: [{ personId: bob.personId, handle: null, displayName: null, active: false }] })
    await admin.as.mutation(R.setNetworkRole, { networkId: root, personId: bob.personId, role: "member", reason: REASON })
    expect(await roleOf(t, root, bob.personId)).toBe("member")
  })

  it("un départ retire le rôle : un retour n'en rend aucun sans nouvelle décision", async () => {
    const { t, root, admin } = await seed()
    const awa = await person(t, "awa", "awa")
    await awa.as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    await awa.as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
    await admin.as.mutation(R.setNetworkRole, { networkId: root, personId: awa.personId, role: "network_moderator", reason: REASON })
    await awa.as.mutation(api.modules.people.memberships.leaveNetwork, { networkId: root })
    expect(await roleOf(t, root, awa.personId)).toBe("member")
    await awa.as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
    expect(await roleOf(t, root, awa.personId)).toBe("member")
    expect(await errorOf(awa.as.query(CASES.paginateQueue, { networkId: root, paginationOpts: PAGE }))).toBe("notFound")
  })

  it(`au plus ${NETWORK_ROLE_HOLDERS_MAX} titulaires d'un même rôle dans un réseau`, async () => {
    const { t, root, admin } = await seed()
    await t.run(async (ctx) => {
      const now = Date.now()
      for (let index = 0; index < NETWORK_ROLE_HOLDERS_MAX; index += 1) {
        const personId = await ctx.db.insert("persons", { authUserId: `moderateur-${index}`, createdAt: now, updatedAt: now })
        await ctx.db.insert("networkMemberships", { networkId: root, personId, status: "declaree", role: "network_moderator", joinedAt: now, statusChangedAt: now })
      }
    })
    const awa = await member(t, [root], "awa", "awa")
    expect(await errorOf(admin.as.mutation(R.setNetworkRole, { networkId: root, personId: awa.personId, role: "network_moderator", reason: REASON }))).toBe("policyRefused")
    expect(await admin.as.mutation(R.setNetworkRole, { networkId: root, personId: awa.personId, role: "network_admin", reason: REASON })).toMatchObject({ changed: true })
  })
})

describe("issue 98 / réseau gouverné par une tranche", () => {
  it("la console nomme le premier administrateur ; il gouverne ; la tranche nomme ensuite par l'aide du moteur", async () => {
    const { t, root, admin } = await seed()
    const managed = await managedNetwork(t, root)
    const first = await member(t, [root, managed], "premiere", "premiere.admin")
    const moderator = await member(t, [root, managed], "moderatrice", "moderatrice")
    expect(await errorOf(first.as.query(CASES.paginateQueue, { networkId: managed, paginationOpts: PAGE }))).toBe("notFound")

    // Premier geste : un administrateur de la plateforme, motif et journal.
    expect(await admin.as.mutation(R.setNetworkRole, { networkId: managed, personId: first.personId, role: "network_admin", reason: REASON })).toEqual({ role: "network_admin", changed: true })
    expect(await first.as.query(CASES.myCapacity, { networkId: managed })).toMatchObject({ networkWide: true, canReviewAppeals: true })
    expect(await first.as.query(CASES.paginateQueue, { networkId: managed, paginationOpts: PAGE })).toMatchObject({ page: [] })
    // La racine n'en reçoit aucun pouvoir.
    expect(await roleOf(t, root, first.personId)).toBe("member")
    // L'annuaire de ce réseau est sur adhésion volontaire : sans ce choix, le nom n'est pas projeté.
    expect(await admin.as.query(R.paginateNetworkRoles, { networkId: managed, role: "network_admin", paginationOpts: PAGE })).toMatchObject({ page: [{ personId: first.personId, handle: null, active: true }], managedBy: "diaspora" })

    // Puis la tranche : l'administrateur du réseau nomme une modératrice, par l'aide du moteur.
    expect(await sliceSetsRole(t, managed, first.personId, moderator.personId, "network_moderator")).toEqual({ personId: moderator.personId, from: "member", to: "network_moderator", changed: true })
    expect(await moderator.as.query(CASES.paginateQueue, { networkId: managed, paginationOpts: PAGE })).toMatchObject({ page: [] })
    // Le dernier administrateur ne se retire pas, ni par la tranche ni par la console.
    expect(await errorOf(sliceSetsRole(t, managed, first.personId, first.personId, "member"))).toBe("NETWORK_LAST_ADMIN")
    expect(await errorOf(admin.as.mutation(R.setNetworkRole, { networkId: managed, personId: first.personId, role: "member", reason: REASON }))).toBe("NETWORK_LAST_ADMIN")
    // Un rôle retiré ferme l'accès à l'acte suivant.
    await sliceSetsRole(t, managed, first.personId, moderator.personId, "member")
    expect(await errorOf(moderator.as.query(CASES.paginateQueue, { networkId: managed, paginationOpts: PAGE }))).toBe("notFound")

    const journal = await roleJournal(t)
    expect(journal.map((row) => [row.capacity, row.details?.to])).toEqual([["platform_admin", "network_admin"], ["network_admin", "network_moderator"], ["network_admin", "member"]])
    expect(journal.every((row) => row.networkId === managed)).toBe(true)
  })
})
