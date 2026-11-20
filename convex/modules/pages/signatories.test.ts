// @vitest-environment edge-runtime
/**
 * Signataires d'une page, console des pages et groupe d'adhérents — tests neufs
 * (le socle n'avait ni signataires ni console de pages au-delà de l'activation,
 * dont le patron d'audit `reseauPlatformActsAudit` est repris : chaque décision
 * écrit sa ligne, un geste sans effet n'écrit rien).
 */
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { PAGE_SIGNATORIES_MAX } from "@antsia/social-domain/pages"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }

const P = api.modules.pages.pages
const SIG = api.modules.pages.signatories
const ADMIN = api.modules.pages.admin
const GROUPS = api.modules.thematicGroups.thematicGroups

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(Date.UTC(2026, 9, 15, 10, 0, 0))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function seed(t: T) {
  return await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
}

async function enter(t: T, rootId: Id<"networks">, handle: string): Promise<Person> {
  vi.setSystemTime(Date.now() + 1000)
  const as = t.withIdentity({ subject: `auth-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: rootId })
  return { as, personId, handle }
}

async function verify(t: T, networkId: Id<"networks">, person: Person): Promise<void> {
  await t.run(async (ctx) => {
    const membership = await ctx.db
      .query("networkMemberships")
      .withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", person.personId))
      .unique()
    await ctx.db.patch(membership!._id, { status: "verifiee" })
  })
}

async function makeOperator(t: T, person: Person): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("operators", { personId: person.personId, role: "platform_admin", grantedAt: 1 })
  })
  await createTestOperatorProof(t, person.as, person.personId)
}

/** Un lien IDN de garantie 2 : l'identité forte qu'exige une page officielle. */
async function strongIdentity(t: T, person: Person): Promise<Id<"identityLinks">> {
  return await t.run(async (ctx) => await ctx.db.insert("identityLinks", { personId: person.personId, provider: "idn", subject: `idn-${person.handle}`, loa: 2, linkedAt: 1 }))
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  return null
}

const codeOf = async (promise: Promise<unknown>) => engineErrorCode(await caught(promise))
const ruleOf = async (promise: Promise<unknown>) => engineErrorRule(await caught(promise))?.rule ?? null

async function journal(t: T, table: "pages" | "pageClaims", id: string) {
  return await t.run(async (ctx) => await ctx.db.query("engineAudit").withIndex("by_subject_at", (q) => q.eq("subjectTable", table).eq("subjectId", id)).take(20))
}

/** Une page de la racine dont Alice est l'administratrice. */
async function alicePage(t: T) {
  const { root, testClosed } = await seed(t)
  const alice = await enter(t, root, "alice")
  await verify(t, root, alice)
  const { pageId, handle } = await alice.as.mutation(P.createPage, { networkId: root, name: "Association des Gabonais", ownerKind: "association" })
  return { root, testClosed, alice, pageId, handle }
}

describe("habiliter un signataire", () => {
  it("habiliter INVITE ; seule l'acceptation donne le droit ; décliner efface l'invitation", async () => {
    const t = testConvex()
    const { root, alice, pageId } = await alicePage(t)
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    expect(await alice.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: "bob", role: "signatory" })).toEqual({ personId: bob.personId, role: "signatory", invited: true })
    expect(await bob.as.query(SIG.myPageInvitations, { networkId: root })).toMatchObject([{ page: { pageId }, role: "signatory" }])
    expect(await codeOf(bob.as.query(SIG.listPageSignatories, { networkId: root, pageId }))).toBe("pageRoleRequired")
    expect(await bob.as.mutation(SIG.respondToPageInvitation, { networkId: root, pageId, accept: true })).toEqual({ role: "signatory" })
    expect((await bob.as.query(SIG.listPageSignatories, { networkId: root, pageId })).map((row) => ({ handle: row.handle, role: row.role, accepted: row.accepted }))).toEqual([
      { handle: "alice", role: "admin", accepted: true },
      { handle: "bob", role: "signatory", accepted: true },
    ])
    await alice.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: "carol", role: "admin" })
    expect(await carol.as.mutation(SIG.respondToPageInvitation, { networkId: root, pageId, accept: false })).toEqual({ role: null })
    expect(await carol.as.query(SIG.myPageInvitations, { networkId: root })).toEqual([])
    expect(await codeOf(carol.as.mutation(SIG.respondToPageInvitation, { networkId: root, pageId, accept: true }))).toBe("notFound")
  })

  it("seul un administrateur habilite ou retire ; chaque décision est tracée — se retirer soi-même l'est comme un départ", async () => {
    const t = testConvex()
    const { root, alice, pageId } = await alicePage(t)
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    await alice.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: "bob", role: "signatory" })
    await bob.as.mutation(SIG.respondToPageInvitation, { networkId: root, pageId, accept: true })
    expect(await codeOf(bob.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: "carol", role: "signatory" }))).toBe("pageRoleRequired")
    expect(await codeOf(alice.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: "alice", role: "signatory" }))).toBe("invalidArgument")
    expect(await codeOf(alice.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: "personne", role: "signatory" }))).toBe("notFound")
    await alice.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: "carol", role: "signatory" })
    await alice.as.mutation(SIG.revokePageRole, { networkId: root, pageId, personId: carol.personId })
    expect(await bob.as.mutation(SIG.revokePageRole, { networkId: root, pageId, personId: bob.personId })).toEqual({ revoked: true })
    expect((await journal(t, "pages", pageId)).map((row) => row.action)).toEqual(["page.signatory_grant", "page.signatory_grant", "page.signatory_revoke", "page.signatory_leave"])
    expect((await journal(t, "pages", pageId))[0]).toMatchObject({ capacity: "page_admin", actorPersonId: alice.personId })
    // Le retrait par l'administratrice reste une révocation, à son nom.
    expect((await journal(t, "pages", pageId))[2]).toMatchObject({ action: "page.signatory_revoke", capacity: "page_admin", actorPersonId: alice.personId, details: { targetPersonId: carol.personId, role: "signatory" } })
  })

  it("recette du 20/11 : quitter l'équipe de soi-même écrit UNE ligne `page.signatory_leave` ; le rejouer, ou décliner une invitation, n'en écrit aucune", async () => {
    const t = testConvex()
    const { root, alice, pageId } = await alicePage(t)
    const bob = await joinTeam(t, root, alice, pageId, "bob", "signatory")
    const carol = await enter(t, root, "carol")
    await alice.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: "carol", role: "moderator" })
    // Décliner une invitation jamais acceptée n'est pas un départ : AUCUNE ligne, de quelque action
    // et sur quelque sujet que ce soit (le journal entier est compté avant et après le refus).
    const wholeJournal = async () => await t.run(async (ctx) => (await ctx.db.query("engineAudit").take(200)).length)
    const beforeRefusal = await wholeJournal()
    expect(await carol.as.mutation(SIG.respondToPageInvitation, { networkId: root, pageId, accept: false })).toEqual({ role: null })
    expect(await wholeJournal()).toBe(beforeRefusal)
    const before = (await journal(t, "pages", pageId)).length
    expect(await bob.as.mutation(SIG.revokePageRole, { networkId: root, pageId, personId: bob.personId })).toEqual({ revoked: true })
    const leaves = (await journal(t, "pages", pageId)).filter((row) => row.action === "page.signatory_leave")
    expect(leaves).toHaveLength(1)
    expect(leaves[0]).toMatchObject({ capacity: "member", actorPersonId: bob.personId, networkId: root, subjectTable: "pages", subjectId: pageId, details: { role: "signatory" } })
    // Le détail ne nomme que le rôle : ni la personne (c'est l'acteur), ni aucun texte.
    expect(Object.keys(leaves[0]?.details ?? {})).toEqual(["role"])
    // Rejoué, le départ est refusé (plus membre de l'équipe) et n'écrit rien de plus.
    expect(await codeOf(bob.as.mutation(SIG.revokePageRole, { networkId: root, pageId, personId: bob.personId }))).toBe("pageRoleRequired")
    expect((await journal(t, "pages", pageId)).length).toBe(before + 1)
  })

  it("recette du 20/11 : une administratrice qui n'est pas la dernière quitte l'équipe — départ journalisé à titre de membre, rôle `admin`", async () => {
    const t = testConvex()
    const { root, alice, pageId } = await alicePage(t)
    const dora = await joinTeam(t, root, alice, pageId, "dora", "admin")
    expect(await dora.as.mutation(SIG.revokePageRole, { networkId: root, pageId, personId: dora.personId })).toEqual({ revoked: true })
    expect((await journal(t, "pages", pageId)).at(-1)).toMatchObject({ action: "page.signatory_leave", capacity: "member", actorPersonId: dora.personId, details: { role: "admin" } })
  })

  it("le dernier administrateur vivant ne part ni ne se rétrograde ; avec un second, il le peut", async () => {
    const t = testConvex()
    const { root, alice, pageId } = await alicePage(t)
    const bob = await enter(t, root, "bob")
    expect(await ruleOf(alice.as.mutation(SIG.revokePageRole, { networkId: root, pageId, personId: alice.personId }))).toBe("PAGE_LAST_ADMIN")
    await alice.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: "bob", role: "admin" })
    // Une invitation en attente n'est pas un administrateur vivant.
    expect(await ruleOf(alice.as.mutation(SIG.revokePageRole, { networkId: root, pageId, personId: alice.personId }))).toBe("PAGE_LAST_ADMIN")
    await bob.as.mutation(SIG.respondToPageInvitation, { networkId: root, pageId, accept: true })
    expect(await bob.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: "alice", role: "signatory" })).toMatchObject({ role: "signatory" })
    expect(await ruleOf(bob.as.mutation(SIG.revokePageRole, { networkId: root, pageId, personId: bob.personId }))).toBe("PAGE_LAST_ADMIN")
  })

  it("une page compte au plus cinquante signataires, invitations comprises", async () => {
    const t = testConvex()
    const { root, alice, pageId } = await alicePage(t)
    await enter(t, root, "derniere")
    await t.run(async (ctx) => {
      for (let index = 1; index < PAGE_SIGNATORIES_MAX; index += 1) {
        const personId = await ctx.db.insert("persons", { authUserId: `auth-silencieux-${index}`, createdAt: 1, updatedAt: 1 })
        await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId, role: "signatory", createdAt: 1, updatedAt: 1 })
      }
    })
    expect(await ruleOf(alice.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: "derniere", role: "signatory" }))).toBe("PAGE_SIGNATORIES_FULL")
  })

  it("signer pour une page OFFICIELLE exige une identité forte — à l'habilitation, à l'acceptation, et à chaque acte", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const operator = await enter(t, root, "operatrice")
    const agent = await enter(t, root, "agent")
    const other = await enter(t, root, "autre")
    await makeOperator(t, operator)
    const { pageId } = await operator.as.mutation(ADMIN.createInstitutionPage, { networkId: root, name: "Ministère des Affaires étrangères", reason: "Création de la page du ministère." })
    expect(await ruleOf(operator.as.mutation(ADMIN.grantPageAdmin, { pageId, personId: agent.personId, reason: "Habilitation du chargé de communication." }))).toBe("PAGE_SIGNATORY_IDENTITY_REQUIRED")
    const link = await strongIdentity(t, agent)
    expect(await operator.as.mutation(ADMIN.grantPageAdmin, { pageId, personId: agent.personId, reason: "Habilitation du chargé de communication." })).toEqual({ invited: true })
    await agent.as.mutation(SIG.respondToPageInvitation, { networkId: root, pageId, accept: true })
    expect((await agent.as.mutation(P.publishAsPage, { networkId: root, pageId, body: "Communiqué du ministère" })).created).toBe(true)
    expect(await ruleOf(agent.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: "autre", role: "signatory" }))).toBe("PAGE_SIGNATORY_IDENTITY_REQUIRED")
    expect(other.personId).toBeDefined()
    // Le lien IDN révoqué referme la signature.
    await t.run(async (ctx) => await ctx.db.patch(link, { revokedAt: 2 }))
    expect(await codeOf(agent.as.mutation(P.publishAsPage, { networkId: root, pageId, body: "Encore ?" }))).toBe("pageRoleRequired")
    expect((await journal(t, "pages", pageId)).map((row) => row.action)).toEqual(["page.create_official", "page.signatory_grant"])
  })
})

/** Les tâches planifiées d'un nom (lecture bornée des fonctions planifiées du test). */
async function jobsNamed(t: T, name: string): Promise<unknown[]> {
  const jobs = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").take(200))
  return jobs.filter((job) => job.name === name).map((job) => job.args[0])
}

/** Une personne invitée par l'administratrice, qui accepte aussitôt. */
async function joinTeam(t: T, root: Id<"networks">, admin: Person, pageId: Id<"pages">, handle: string, role: "admin" | "signatory" | "moderator"): Promise<Person> {
  const person = await enter(t, root, handle)
  await admin.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle, role })
  await person.as.mutation(SIG.respondToPageInvitation, { networkId: root, pageId, accept: true })
  return person
}

describe("AS-10 / PG-08 — le modérateur de page", () => {
  it("invité puis accepté, il voit l'équipe dans l'ordre admin, signataire, modérateur ; il n'est jamais un signataire", async () => {
    const t = testConvex()
    const { root, alice, pageId, handle } = await alicePage(t)
    const bob = await joinTeam(t, root, alice, pageId, "bob", "signatory")
    const carol = await enter(t, root, "carol")
    expect(await alice.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: "carol", role: "moderator" })).toEqual({ personId: carol.personId, role: "moderator", invited: true })
    expect(await carol.as.query(SIG.myPageInvitations, { networkId: root })).toMatchObject([{ page: { pageId }, role: "moderator" }])
    // L'invitation sonne chez le modérateur, comme chez tout invité.
    const bell = await carol.as.query(api.modules.notifications.bell.paginateNotifications, { networkId: root, paginationOpts: { numItems: 10, cursor: null } })
    expect(bell.page.map((row) => row.kind)).toEqual(["page_signatory_invite"])
    expect(await codeOf(carol.as.query(SIG.listPageSignatories, { networkId: root, pageId }))).toBe("pageRoleRequired")
    expect(await carol.as.mutation(SIG.respondToPageInvitation, { networkId: root, pageId, accept: true })).toEqual({ role: "moderator" })

    expect((await carol.as.query(SIG.listPageSignatories, { networkId: root, pageId })).map((row) => ({ handle: row.handle, role: row.role }))).toEqual([
      { handle: "alice", role: "admin" },
      { handle: "bob", role: "signatory" },
      { handle: "carol", role: "moderator" },
    ])
    // `viewer.role` parle au nom de la page : jamais un modérateur ; `viewer.teamRole` le dit.
    expect((await carol.as.query(P.getPage, { networkId: root, handle }))?.viewer).toEqual({ following: false, role: null, teamRole: "moderator" })
    expect((await bob.as.query(P.getPage, { networkId: root, handle }))?.viewer).toEqual({ following: false, role: "signatory", teamRole: "signatory" })
    expect(await carol.as.query(P.myPages, { networkId: root })).toEqual([])
    expect((await carol.as.query(P.myTeamPages, { networkId: root })).map((row) => ({ pageId: row.pageId, viewer: row.viewer }))).toEqual([{ pageId, viewer: { role: null, teamRole: "moderator" } }])
    expect((await alice.as.query(P.myTeamPages, { networkId: root })).map((row) => row.viewer)).toEqual([{ role: "admin", teamRole: "admin" }])
    expect(await codeOf(carol.as.mutation(P.publishAsPage, { networkId: root, pageId, body: "Au nom de la page ?" }))).toBe("pageRoleRequired")
  })

  it("il se retire lui-même, départ journalisé (`page.signatory_leave`) ; il n'habilite ni ne retire personne", async () => {
    const t = testConvex()
    const { root, alice, pageId } = await alicePage(t)
    const bob = await joinTeam(t, root, alice, pageId, "bob", "signatory")
    const carol = await joinTeam(t, root, alice, pageId, "carol", "moderator")
    await enter(t, root, "dora")
    expect(await codeOf(carol.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: "dora", role: "moderator" }))).toBe("pageRoleRequired")
    expect(await codeOf(carol.as.mutation(SIG.revokePageRole, { networkId: root, pageId, personId: bob.personId }))).toBe("pageRoleRequired")
    // Un éditeur (signataire) ne gère pas l'équipe non plus.
    expect(await codeOf(bob.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: "dora", role: "moderator" }))).toBe("pageRoleRequired")
    expect(await carol.as.mutation(SIG.revokePageRole, { networkId: root, pageId, personId: carol.personId })).toEqual({ revoked: true })
    expect(await codeOf(carol.as.query(SIG.listPageSignatories, { networkId: root, pageId }))).toBe("pageRoleRequired")
    expect((await journal(t, "pages", pageId)).map((row) => row.action)).toEqual(["page.signatory_grant", "page.signatory_grant", "page.signatory_leave"])
    expect((await journal(t, "pages", pageId)).at(-1)).toMatchObject({ capacity: "member", actorPersonId: carol.personId, details: { role: "moderator" } })
  })

  it("le plafond de l'équipe compte les modérateurs, invitations comprises", async () => {
    const t = testConvex()
    const { root, alice, pageId } = await alicePage(t)
    await enter(t, root, "derniere")
    await t.run(async (ctx) => {
      for (let index = 1; index < PAGE_SIGNATORIES_MAX; index += 1) {
        const personId = await ctx.db.insert("persons", { authUserId: `auth-moderateur-${index}`, createdAt: 1, updatedAt: 1 })
        await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId, role: "moderator", createdAt: 1, updatedAt: 1 })
      }
    })
    expect(await ruleOf(alice.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: "derniere", role: "signatory" }))).toBe("PAGE_SIGNATORIES_FULL")
    expect(await alice.as.query(SIG.listPageSignatories, { networkId: root, pageId })).toHaveLength(PAGE_SIGNATORIES_MAX)
  })

  it("rétrograder un éditeur (signataire) accepté en modérateur le sort des directs de la page ; promu à nouveau, il publie sans nouvelle coupure", async () => {
    const t = testConvex()
    const { root, alice, pageId } = await alicePage(t)
    const bob = await joinTeam(t, root, alice, pageId, "bob", "signatory")
    expect(await alice.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: "bob", role: "moderator" })).toEqual({ personId: bob.personId, role: "moderator", invited: false })
    expect(await jobsNamed(t, "modules/live/revocation:kickUserFromPageDirects")).toEqual([{ personId: bob.personId, pageId, cursor: null }])
    expect((await journal(t, "pages", pageId)).at(-1)).toMatchObject({ action: "page.signatory_grant", details: { role: "moderator", previousRole: "signatory", invited: false } })
    expect(await codeOf(bob.as.mutation(P.publishAsPage, { networkId: root, pageId, body: "Encore au nom de la page ?" }))).toBe("pageRoleRequired")
    await alice.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: "bob", role: "signatory" })
    expect(await jobsNamed(t, "modules/live/revocation:kickUserFromPageDirects")).toHaveLength(1)
    expect((await bob.as.mutation(P.publishAsPage, { networkId: root, pageId, body: "De nouveau éditeur" })).created).toBe(true)
  })

  it("un second administrateur rétrogradé en modérateur sort aussi des directs et ne gère plus ; la dernière administratrice ne part pas", async () => {
    const t = testConvex()
    const { root, alice, pageId } = await alicePage(t)
    const carol = await joinTeam(t, root, alice, pageId, "carol", "admin")
    await alice.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: "carol", role: "moderator" })
    expect(await jobsNamed(t, "modules/live/revocation:kickUserFromPageDirects")).toEqual([{ personId: carol.personId, pageId, cursor: null }])
    expect(await codeOf(carol.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: "alice", role: "moderator" }))).toBe("pageRoleRequired")
    expect(await ruleOf(alice.as.mutation(SIG.revokePageRole, { networkId: root, pageId, personId: alice.personId }))).toBe("PAGE_LAST_ADMIN")
  })
})

/** La génération du fil matérialisé d'une personne dans un réseau (0 : jamais composé). */
async function feedGeneration(t: T, networkId: Id<"networks">, personId: Id<"persons">): Promise<number> {
  const cursor = await t.run(async (ctx) => await ctx.db.query("feedCursors").withIndex("by_reader", (q) => q.eq("networkId", networkId).eq("personId", personId).eq("scope", "pour_vous")).unique())
  return cursor?.generation ?? 0
}

describe("AS-10 — un modérateur promu par la console parle au nom de la page, fil recomposé", () => {
  it("l'opérateur fait d'un modérateur accepté un administrateur : il publie, et son fil est recomposé comme à une acceptation", async () => {
    const t = testConvex()
    const { root, alice, pageId } = await alicePage(t)
    const bob = await joinTeam(t, root, alice, pageId, "bob", "moderator")
    const operator = await enter(t, root, "operatrice")
    await makeOperator(t, operator)
    const before = await feedGeneration(t, root, bob.personId)
    expect(await operator.as.mutation(ADMIN.grantPageAdmin, { pageId, personId: bob.personId, reason: "Reprise de l'administration par le modérateur." })).toEqual({ invited: false })
    expect(await feedGeneration(t, root, bob.personId)).toBe(before + 1)
    expect((await bob.as.mutation(P.publishAsPage, { networkId: root, pageId, body: "Administrateur désormais" })).created).toBe(true)
  })
})

describe("la console des pages", () => {
  it("pose la confiance — « Officiel » à une institution seulement — et ne trace que ce qui change", async () => {
    const t = testConvex()
    const { root, pageId, handle } = await alicePage(t)
    const operator = await enter(t, root, "operatrice")
    await makeOperator(t, operator)
    expect(await ruleOf(operator.as.mutation(ADMIN.setPageTrust, { pageId, trust: "official", reason: "Promotion par erreur." }))).toBe("PAGE_TRUST_NOT_ALLOWED")
    expect(await operator.as.mutation(ADMIN.setPageTrust, { pageId, trust: "verified", reason: "Pièces vérifiées hors ligne." })).toEqual({ changed: true })
    expect(await operator.as.mutation(ADMIN.setPageTrust, { pageId, trust: "verified", reason: "Pièces vérifiées hors ligne." })).toEqual({ changed: false })
    expect((await operator.as.query(P.getPage, { networkId: root, handle }))?.badge).toBe("verified")
    expect(await journal(t, "pages", pageId)).toMatchObject([{ action: "page.trust_set", details: { previousTrust: "community", trust: "verified" } }])
  })

  it("change l'adresse d'une page — l'ancienne dans l'historique, refusée si prise, motif exigé", async () => {
    const t = testConvex()
    const { root, alice, pageId } = await alicePage(t)
    const operator = await enter(t, root, "operatrice")
    await makeOperator(t, operator)
    await alice.as.mutation(P.createPage, { networkId: root, name: "Deuxieme page", ownerKind: "community" })
    expect(await ruleOf(operator.as.mutation(ADMIN.setPageHandle, { pageId, handle: "agl", reason: "court" }))).toBe("DECISION_REASON_LENGTH")
    expect(await codeOf(operator.as.mutation(ADMIN.setPageHandle, { pageId, handle: "deuxieme-page", reason: "Adresse demandée par l'association." }))).toBe("handleUnavailable")
    expect(await operator.as.mutation(ADMIN.setPageHandle, { pageId, handle: "agl-lyon", reason: "Adresse demandée par l'association." })).toEqual({ handle: "agl-lyon" })
    expect(await alice.as.query(P.getPage, { networkId: root, handle: "association-des-gabonais" })).toBeNull()
    expect(await alice.as.query(P.getPage, { networkId: root, handle: "agl-lyon" })).not.toBeNull()
    const history = await t.run(async (ctx) => await ctx.db.query("pageIdentityHistory").withIndex("by_page_at", (q) => q.eq("pageId", pageId)).take(5))
    expect(history).toMatchObject([{ previous: { handle: "association-des-gabonais" }, actorPersonId: operator.personId }])
  })

  it("liste les pages d'un réseau à l'opérateur seul, état réel compris", async () => {
    const t = testConvex()
    const { root, alice, pageId } = await alicePage(t)
    const operator = await enter(t, root, "operatrice")
    await makeOperator(t, operator)
    expect(await codeOf(alice.as.query(ADMIN.paginatePages, { networkId: root, paginationOpts: { numItems: 10, cursor: null } }))).toBe("operatorRequired")
    await operator.as.mutation(ADMIN.setPageStatus, { pageId, status: "inactive", reason: "Retrait demandé par l'association." })
    expect((await operator.as.query(ADMIN.paginatePages, { networkId: root, paginationOpts: { numItems: 10, cursor: null } })).page).toEqual([])
    expect((await operator.as.query(ADMIN.paginatePages, { networkId: root, status: "inactive", paginationOpts: { numItems: 10, cursor: null } })).page).toMatchObject([
      { pageId, status: "inactive", trust: "community" },
    ])
  })
})

describe("le groupe d'adhérents d'une page d'association (EXF-DG-26, contrat DG-010 V1)", () => {
  // DG-010 V1 (DIASPORA.GA, `diaspora/associationGroups.ts`) : un groupe PRIVÉ par association, nommé
  // d'après la page ; refus indistinct pour qui n'en est pas administrateur vivant.
  it("seul un administrateur vivant le crée ; le groupe privé ne se lit ni ne se découvre hors de l'association", async () => {
    const t = testConvex()
    const { root, alice, pageId, handle } = await alicePage(t)
    const bob = await enter(t, root, "bob")
    expect(await codeOf(bob.as.mutation(GROUPS.create, { networkId: root, name: "Adhérents", associationPageId: pageId, idempotencyKey: "g-1" }))).toBe("notFound")
    const { groupId } = await alice.as.mutation(GROUPS.create, { networkId: root, name: "Adhérents", associationPageId: pageId, idempotencyKey: "g-2" })
    // Un groupe ordinaire, sans page, ne change pas.
    await alice.as.mutation(GROUPS.create, { networkId: root, name: "Autre groupe", idempotencyKey: "g-3" })
    expect(await alice.as.query(GROUPS.getGroup, { networkId: root, groupId })).toMatchObject({ name: "Association des Gabonais", associationPage: { pageId, handle } })
    expect((await alice.as.query(GROUPS.discover, { networkId: root, associationPageId: pageId })).map((card) => card.groupId)).toEqual([groupId])
    expect(await codeOf(bob.as.query(GROUPS.getGroup, { networkId: root, groupId }))).toBe("notFound")
    expect(await bob.as.query(GROUPS.discover, { networkId: root, associationPageId: pageId })).toEqual([])
  })
})
