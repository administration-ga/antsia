// @vitest-environment edge-runtime
/** DG-010 : groupe privé volontaire, droits vivants et contournements des API génériques. */
import { engineErrorAppRule, engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { joinDeclaredDiasporaFixture, openNetworkFeatures, testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
const NOW = Date.UTC(2026, 9, 18, 10)
const GROUPS = api.modules.diaspora.associationGroups
const ASSOCIATIONS = api.modules.diaspora.associations
const THEMATIC = api.modules.thematicGroups.thematicGroups
const POSTS = api.modules.posts.posts
const CONNECTIONS = api.modules.graph.connections
const FIRST = { cursor: null, numItems: 20 }

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

async function codeOf(promise: Promise<unknown>) {
  try { await promise } catch (error) { return engineErrorAppRule(error)?.appRule ?? engineErrorCode(error) }
  return null
}

async function person(t: T, networkId: Id<"networks">, handle: string, displayName: string) {
  const as = t.withIdentity({ subject: `association-group-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName })
  await t.run(async (ctx) => { await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `group-idn-${personId}`, loa: 2, nationality: "GA", linkedAt: NOW }) })
  await joinDeclaredDiasporaFixture(as, { networkId, facet: { countryOfResidence: "FR", city: "Lyon" } })
  return { as, personId, handle }
}

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  await openNetworkFeatures(t, networkId)
  const admin = await person(t, networkId, "admin-groupe", "Awa NDONG")
  const otherAdmin = await person(t, networkId, "autre-admin-groupe", "Jean MBA")
  const signatory = await person(t, networkId, "signataire-groupe", "Nadia OGOOUÉ")
  const reader = await person(t, networkId, "adherent-groupe", "Paul ONDO")
  const outsider = await person(t, networkId, "tiers-groupe", "Rose MBOUMBA")
  const { pageId, adminSignatoryId } = await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", {
      networkId, handle: "collectif-lyon", name: "Collectif des Gabonais de Lyon", ownerKind: "association", trust: "community", trustRank: 0,
      visibility: "network", onRoot: false, status: "active", searchText: "collectif lyon", createdAt: NOW, updatedAt: NOW,
    })
    const adminSignatoryId = await ctx.db.insert("pageSignatories", { networkId, pageId, personId: admin.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    for (const [member, role] of [[otherAdmin, "admin"], [signatory, "signatory"]] as const) {
      await ctx.db.insert("pageSignatories", { networkId, pageId, personId: member.personId, role, acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    }
    return { pageId, adminSignatoryId }
  })
  return { t, root, networkId, pageId, adminSignatoryId, admin, otherAdmin, signatory, reader, outsider }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
type Person = Fixture["reader"]

function group(f: Fixture, member: Person) {
  return member.as.query(GROUPS.groupForPage, { networkId: f.networkId, pageId: f.pageId })
}
function create(f: Fixture, member = f.admin, key = "groupe-association-1") {
  return member.as.mutation(GROUPS.createGroupForPage, { networkId: f.networkId, pageId: f.pageId, idempotencyKey: key })
}
function join(f: Fixture, member: Person, groupId: Id<"thematicGroups">) {
  return member.as.mutation(THEMATIC.join, { networkId: f.networkId, groupId })
}
function wall(f: Fixture, member: Person, groupId: Id<"thematicGroups">) {
  return member.as.query(THEMATIC.groupWall, { networkId: f.networkId, groupId })
}
function privatePosts(f: Fixture, member: Person, groupId: Id<"thematicGroups">) {
  return member.as.query(GROUPS.posts, { networkId: f.networkId, groupId, paginationOpts: FIRST })
}
function publish(f: Fixture, member: Person, groupId: Id<"thematicGroups">, key = "publication-association-1") {
  return member.as.mutation(POSTS.publish, { networkId: f.networkId, groupId, audience: "group", reach: "diaspora", alsoOnRoot: false, body: "Préparons ensemble la prochaine rencontre du collectif.", idempotencyKey: key })
}
async function accept(f: Fixture, member: Person) {
  const request = await member.as.mutation(ASSOCIATIONS.requestAssociationMembership, { networkId: f.networkId, pageId: f.pageId })
  const actor = member.personId === f.admin.personId ? f.otherAdmin : f.admin
  const result = await actor.as.mutation(ASSOCIATIONS.decideAssociationMembership, { networkId: f.networkId, membershipId: request.membershipId, expectedVersion: request.version, decision: "accept" })
  return { membershipId: request.membershipId, version: result.version }
}
async function connect(f: Fixture, from: Person, to: Person) {
  await from.as.mutation(CONNECTIONS.requestConnection, { networkId: f.networkId, targetPersonId: to.personId })
  const incoming = await to.as.query(CONNECTIONS.connectionWith, { networkId: f.networkId, otherPersonId: from.personId })
  if (incoming.state !== "requested_by_them") throw new Error("Demande de relation absente")
  await to.as.mutation(CONNECTIONS.respondToConnection, { networkId: f.networkId, connectionId: incoming.connectionId, accept: true })
}

describe("groupes privés d'association DIASPORA.GA", () => {
  it("la création explicite inscrit le créateur seul, les métadonnées ne donnent aucun accès au tiers", async () => {
    const f = await fixture()
    await accept(f, f.reader)
    const { groupId } = await create(f)
    const memberships = await f.t.run(async (ctx) => ctx.db.query("thematicGroupMembers").withIndex("by_group_leftAt_joinedAt", (q) => q.eq("groupId", groupId).eq("leftAt", undefined)).take(10))
    expect(memberships).toMatchObject([{ personId: f.admin.personId, role: "member" }])
    expect(await group(f, f.admin)).toEqual({ groupId, pageId: f.pageId, name: "Collectif des Gabonais de Lyon", state: "active", closedAt: null, canReopen: false, role: "owner", isMember: true, canJoin: false, canManage: true, canPublish: true })
    expect(await group(f, f.reader)).toMatchObject({ role: null, isMember: false, canJoin: true, canManage: false, canPublish: false })
    const outsider = await group(f, f.outsider)
    expect(outsider).toEqual({ groupId, pageId: f.pageId, name: "Collectif des Gabonais de Lyon", state: "active", closedAt: null, canReopen: false, role: null, isMember: false, canJoin: false, canManage: false, canPublish: false })
    expect(JSON.stringify(outsider)).not.toContain(f.admin.personId)
    expect(await codeOf(wall(f, f.reader, groupId))).toBe("notFound")
    expect(await codeOf(publish(f, f.reader, groupId))).toBe("notFound")
    await join(f, f.reader, groupId)
    expect(await group(f, f.reader)).toMatchObject({ role: "member", isMember: true, canPublish: true })
  })

  it("deux administrateurs et l'API générique ne créent qu'un groupe par page, malgré des clés différentes", async () => {
    const f = await fixture()
    const results = await Promise.all([
      create(f, f.admin, "premier-createur"),
      create(f, f.otherAdmin, "autre-createur"),
      f.admin.as.mutation(THEMATIC.create, { networkId: f.networkId, associationPageId: f.pageId, name: "Un autre nom", idempotencyKey: "autre-chemin" }),
    ])
    expect(new Set(results.map((result) => result.groupId)).size).toBe(1)
    expect(results.filter((result) => result.created)).toHaveLength(1)
    expect(await f.t.run(async (ctx) => ctx.db.query("thematicGroups").withIndex("by_network_associationPage_createdAt", (q) => q.eq("networkId", f.networkId).eq("associationPageId", f.pageId)).take(3))).toHaveLength(1)
    expect(await f.t.run(async (ctx) => ctx.db.query("thematicGroupMembers").take(10))).toHaveLength(1)
  })

  it("une page au nom court crée son groupe avec son adresse valide", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => { await ctx.db.patch(f.pageId, { name: "UG" }) })
    await create(f)
    expect(await group(f, f.admin)).toMatchObject({ name: "collectif-lyon", state: "active" })
  })

  it("page active native d'association et administrateur vivant sont requis sur les deux créations", async () => {
    const f = await fixture()
    for (const member of [f.signatory, f.reader, f.outsider]) expect(await codeOf(create(f, member))).toBe("notFound")
    await f.t.run(async (ctx) => { await ctx.db.patch(f.pageId, { ownerKind: "company" }) })
    expect(await codeOf(create(f))).toBe("notFound")
    expect(await codeOf(f.admin.as.mutation(THEMATIC.create, { networkId: f.networkId, associationPageId: f.pageId, name: "Contournement entreprise", idempotencyKey: "entreprise" }))).toBe("notFound")
    await f.t.run(async (ctx) => { await ctx.db.patch(f.pageId, { ownerKind: "association", status: "inactive" }) })
    expect(await group(f, f.admin)).toBeNull()
    expect(await codeOf(create(f))).toBe("notFound")
    const mirrorId = await f.t.run(async (ctx) => {
      await ctx.db.patch(f.pageId, { status: "active" })
      const emitterId = await ctx.db.insert("federationEmitters", { networkId: f.networkId, slug: "association-groupe-test", environment: "sandbox", enabled: false, keyEnvName: "TEST_ASSOCIATION_GROUP_KEY", allowedContracts: [], revision: 1, createdAt: NOW, updatedAt: NOW })
      return await ctx.db.insert("mirrors", { networkId: f.networkId, emitterId, environment: "sandbox", contract: "TEST-ASSOCIATION-GROUP", objectRef: "association-test", localTable: "pages", localId: f.pageId, updatedAt: NOW })
    })
    expect(await codeOf(create(f))).toBe("notFound")
    await f.t.run(async (ctx) => { await ctx.db.delete(mirrorId); await ctx.db.delete(f.adminSignatoryId) })
    expect(await codeOf(create(f))).toBe("notFound")
    expect(await codeOf(f.admin.as.mutation(GROUPS.createGroupForPage, { networkId: f.root, pageId: f.pageId, idempotencyKey: "autre-reseau" }))).toBe("notFound")
  })

  it("un responsable sans ligne d'association rejoint volontairement, aucun rôle du groupe ne transfère l'autorité de la page", async () => {
    const f = await fixture()
    const { groupId } = await create(f)
    expect(await group(f, f.otherAdmin)).toMatchObject({ role: null, isMember: false, canJoin: true, canManage: true, canPublish: false })
    expect(await codeOf(wall(f, f.otherAdmin, groupId))).toBe("notFound")
    await join(f, f.otherAdmin, groupId)
    await join(f, f.signatory, groupId)
    expect(await group(f, f.otherAdmin)).toMatchObject({ role: "owner", isMember: true })
    expect(await group(f, f.signatory)).toMatchObject({ role: "moderator", canManage: false })
    await accept(f, f.reader)
    await join(f, f.reader, groupId)
    expect(await codeOf(f.admin.as.mutation(THEMATIC.setMemberRole, { networkId: f.networkId, groupId, memberPersonId: f.reader.personId, role: "moderator" }))).toBe("groupRoleRequired")
    expect(await f.admin.as.mutation(THEMATIC.leave, { networkId: f.networkId, groupId })).toEqual({ left: true })
    expect(await group(f, f.admin)).toMatchObject({ role: null, isMember: false, canJoin: true, canManage: true, canPublish: false })
  })

  it("révocation du rôle de page : l'ancien owner ne garde que ses droits d'adhérent accepté", async () => {
    const f = await fixture()
    const { groupId } = await create(f)
    await accept(f, f.admin)
    await accept(f, f.reader)
    await join(f, f.reader, groupId)
    const { postId } = await publish(f, f.reader, groupId)
    await f.t.run(async (ctx) => { await ctx.db.delete(f.adminSignatoryId) })
    expect(await group(f, f.admin)).toMatchObject({ role: "member", isMember: true, canManage: false, canPublish: true })
    expect(await codeOf(f.admin.as.mutation(THEMATIC.closeGroup, { networkId: f.networkId, groupId }))).toBe("notFound")
    expect(await codeOf(f.admin.as.mutation(THEMATIC.pinGroupPost, { networkId: f.networkId, groupId, postId }))).toBe("groupRoleRequired")
    expect(await codeOf(f.admin.as.mutation(THEMATIC.removeGroupPost, { networkId: f.networkId, postId }))).toBe("groupRoleRequired")
    expect((await wall(f, f.admin, groupId)).items.map((post) => post._id)).toEqual([postId])
  })

  it("le rôle animateur est relu, puis le départ de l'association ferme même les URL et écritures de l'auteur", async () => {
    const f = await fixture()
    const { groupId } = await create(f)
    const membership = await accept(f, f.reader)
    await join(f, f.reader, groupId)
    const changed = await f.admin.as.mutation(ASSOCIATIONS.setAssociationMemberRole, { networkId: f.networkId, membershipId: membership.membershipId, expectedVersion: membership.version, role: "animator" })
    expect(await group(f, f.reader)).toMatchObject({ role: "moderator" })
    const { postId } = await publish(f, f.reader, groupId)
    await f.admin.as.mutation(ASSOCIATIONS.setAssociationMemberRole, { networkId: f.networkId, membershipId: membership.membershipId, expectedVersion: changed.version, role: "member" })
    expect(await group(f, f.reader)).toMatchObject({ role: "member" })
    await f.reader.as.mutation(ASSOCIATIONS.leaveAssociation, { networkId: f.networkId, pageId: f.pageId })
    expect(await group(f, f.reader)).toMatchObject({ role: null, isMember: false, canJoin: false, canPublish: false })
    expect(await codeOf(wall(f, f.reader, groupId))).toBe("notFound")
    expect(await codeOf(f.reader.as.query(POSTS.getPost, { networkId: f.networkId, postId }))).toBe("notFound")
    expect(await codeOf(f.reader.as.query(POSTS.getPost, { networkId: f.root, postId }))).toBe("notFound")
    expect(await f.reader.as.query(POSTS.paginateMyPosts, { networkId: f.networkId, paginationOpts: FIRST })).toMatchObject({ page: [] })
    expect(await codeOf(f.reader.as.mutation(POSTS.edit, { networkId: f.networkId, postId, body: "Contournement par mon identifiant de publication." }))).toBe("notFound")
    expect(await codeOf(f.reader.as.mutation(POSTS.remove, { networkId: f.networkId, postId }))).toBe("notFound")
    expect(await codeOf(publish(f, f.reader, groupId))).toBe("notFound")
    expect(await codeOf(join(f, f.reader, groupId))).toBe("notFound")
    expect(await f.reader.as.query(THEMATIC.myGroups, { networkId: f.networkId })).toMatchObject({ items: [] })
    expect(await f.reader.as.query(THEMATIC.discover, { networkId: f.networkId, associationPageId: f.pageId })).toEqual([])
  })

  it("les invitations et leur acceptation ne contournent ni exclusion ni absence d'adhésion", async () => {
    const f = await fixture()
    const { groupId } = await create(f)
    const membership = await accept(f, f.reader)
    await connect(f, f.admin, f.reader)
    await connect(f, f.admin, f.outsider)
    await f.admin.as.mutation(THEMATIC.invite, { networkId: f.networkId, groupId, handle: f.reader.handle })
    const pending = await f.reader.as.query(THEMATIC.paginateMyInvites, { networkId: f.networkId, paginationOpts: FIRST })
    const inviteId = pending.page[0]?.inviteId
    if (!inviteId) throw new Error("Invitation absente")
    await f.admin.as.mutation(ASSOCIATIONS.removeAssociationMember, { networkId: f.networkId, membershipId: membership.membershipId, expectedVersion: membership.version, reason: "Exclusion prononcée par les responsables." })
    expect(await f.reader.as.query(THEMATIC.paginateMyInvites, { networkId: f.networkId, paginationOpts: FIRST })).toMatchObject({ page: [] })
    expect(await codeOf(f.reader.as.mutation(THEMATIC.respondInvite, { networkId: f.networkId, inviteId, accept: true }))).toBe("notFound")
    expect(await f.t.run(async (ctx) => ctx.db.get(inviteId))).toMatchObject({ status: "pending" })
    expect(await codeOf(join(f, f.reader, groupId))).toBe("notFound")
    expect(await codeOf(f.admin.as.mutation(THEMATIC.invite, { networkId: f.networkId, groupId, handle: f.reader.handle }))).toBe("notFound")
    expect(await codeOf(f.admin.as.mutation(THEMATIC.invite, { networkId: f.networkId, groupId, handle: f.outsider.handle }))).toBe("notFound")
    expect(await f.admin.as.query(THEMATIC.listInviteCandidates, { networkId: f.networkId, groupId })).toEqual({ items: [], truncated: false })
    expect(await codeOf(f.reader.as.query(THEMATIC.getGroup, { networkId: f.networkId, groupId }))).toBe("notFound")
    expect(await codeOf(f.reader.as.query(THEMATIC.paginateMembers, { networkId: f.networkId, groupId, paginationOpts: FIRST }))).toBe("notFound")
  })

  it("toute ligne associative non acceptée referme aussi le responsable vivant", async () => {
    const f = await fixture()
    const { groupId } = await create(f)
    const membership = await accept(f, f.admin)
    const { postId } = await publish(f, f.admin, groupId)
    for (const status of ["requested", "rejected", "cancelled", "left", "removed"] as const) {
      await f.t.run(async (ctx) => { await ctx.db.patch(membership.membershipId, { status }) })
      expect(await group(f, f.admin)).toMatchObject({ role: null, isMember: false, canJoin: false, canManage: false, canPublish: false })
      expect(await codeOf(join(f, f.admin, groupId))).toBe("notFound")
      expect(await codeOf(f.admin.as.query(POSTS.getPost, { networkId: f.networkId, postId }))).toBe("notFound")
      expect(await codeOf(f.admin.as.mutation(THEMATIC.closeGroup, { networkId: f.networkId, groupId }))).toBe("notFound")
    }
  })

  it("fermé : aucun mur, aucune racine et aucune recréation via l'API générique", async () => {
    const f = await fixture()
    const { groupId } = await create(f)
    const { postId } = await publish(f, f.admin, groupId)
    expect(await f.t.run(async (ctx) => ctx.db.get(postId))).toMatchObject({ audience: "group", reach: "diaspora", visibility: "network", onRoot: false })
    expect(await codeOf(f.admin.as.mutation(POSTS.publish, { networkId: f.networkId, groupId, audience: "group", alsoOnRoot: true, body: "Ne doit jamais paraître sur la racine." }))).toBe("invalidArgument")
    await f.otherAdmin.as.mutation(THEMATIC.closeGroup, { networkId: f.networkId, groupId })
    expect(await group(f, f.admin)).toMatchObject({ state: "closed", role: "owner", isMember: true, canPublish: false, canJoin: false })
    expect(await codeOf(wall(f, f.admin, groupId))).toBe("notFound")
    expect(await codeOf(privatePosts(f, f.admin, groupId))).toBe("notFound")
    expect(await codeOf(f.admin.as.query(POSTS.getPost, { networkId: f.networkId, postId }))).toBe("notFound")
    expect(await codeOf(join(f, f.admin, groupId))).toBe("notFound")
    expect(await codeOf(f.admin.as.mutation(THEMATIC.deleteGroup, { networkId: f.networkId, groupId }))).toBe("notFound")
    expect(await create(f, f.admin, "nouvelle-cle")).toEqual({ groupId, created: false })
    expect(await f.admin.as.mutation(THEMATIC.create, { networkId: f.networkId, associationPageId: f.pageId, name: "Faux nouveau groupe", idempotencyKey: "nouvelle-cle-generique" })).toEqual({ groupId, created: false })
    expect(await group(f, f.admin)).toMatchObject({ state: "closed" })
  })

  it("projection privée : published pour les membres, pending pour son auteur seul, retrait sans corps ni identité technique", async () => {
    const f = await fixture()
    const { groupId } = await create(f)
    await accept(f, f.reader)
    await join(f, f.reader, groupId)
    const published = await publish(f, f.admin, groupId, "publication-deja-relue")
    await f.t.run(async (ctx) => {
      await ctx.db.insert("moderationPolicies", { networkId: f.networkId, surface: "post", preReview: true, maxLinks: 20, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    })
    const pending = await publish(f, f.reader, groupId, "publication-en-attente")
    const mine = await privatePosts(f, f.reader, groupId)
    expect(mine.items).toHaveLength(2)
    expect(mine.items).toContainEqual(expect.objectContaining({ postId: pending.postId, moderation: "pending_review", author: { displayName: "Paul ONDO" }, isMine: true, canRemove: true }))
    expect(mine.items).toContainEqual(expect.objectContaining({ postId: published.postId, moderation: "published", isMine: false, canRemove: false }))
    const serialized = JSON.stringify(mine)
    for (const privateValue of [f.admin.personId, f.reader.personId, f.reader.handle, "personId", "authorPersonId", "handle", "networkId", "groupId"]) expect(serialized).not.toContain(privateValue)
    expect((await privatePosts(f, f.admin, groupId)).items.map((post) => post.postId)).toEqual([published.postId])
    expect((await wall(f, f.reader, groupId)).items.map((post) => post._id)).toEqual([published.postId])
    expect(await codeOf(privatePosts(f, f.outsider, groupId))).toBe("notFound")
    await f.reader.as.mutation(POSTS.remove, { networkId: f.networkId, postId: pending.postId })
    expect((await privatePosts(f, f.reader, groupId)).items.map((post) => post.postId)).toEqual([published.postId])
    expect(JSON.stringify(await privatePosts(f, f.reader, groupId))).not.toContain(pending.postId)
  })

  it("AS-03 : l'administrateur rouvre le groupe qu'il a fermé, en citant la fermeture lue ; le mur et les droits reviennent", async () => {
    const f = await fixture()
    const { groupId } = await create(f)
    await accept(f, f.reader)
    await join(f, f.reader, groupId)
    const { postId } = await publish(f, f.admin, groupId)
    await f.admin.as.mutation(THEMATIC.closeGroup, { networkId: f.networkId, groupId })
    const closed = await group(f, f.admin)
    expect(closed).toMatchObject({ state: "closed", closedAt: NOW, canReopen: true, canManage: true, canPublish: false })
    // La fermeture citée n'est servie qu'au responsable qui peut rouvrir.
    expect(await group(f, f.reader)).toMatchObject({ state: "closed", closedAt: null, canReopen: false })
    const audits = async () => await f.t.run(async (ctx) => (await ctx.db.query("engineAudit").take(200)).filter((row) => row.action === "page.group_reopen"))
    const reopen = (member: Person, expectedClosedAt: number) => member.as.mutation(GROUPS.reopenGroupForPage, { networkId: f.networkId, groupId, expectedClosedAt })
    // Une autre fermeture que celle lue : conflit, rien ne bouge.
    expect(await codeOf(reopen(f.admin, NOW - 1))).toBe("conflict")
    // Ni un signataire, ni un adhérent, ni un tiers ne rouvrent : le même refus qu'un groupe inconnu.
    for (const member of [f.signatory, f.reader, f.outsider]) expect(await codeOf(reopen(member, NOW)), member.handle).toBe("notFound")
    expect(await group(f, f.admin)).toMatchObject({ state: "closed" })
    expect(await audits()).toEqual([])
    expect(await reopen(f.admin, NOW)).toEqual({ state: "active" })
    expect(await group(f, f.admin)).toMatchObject({ state: "active", closedAt: null, canReopen: false, canPublish: true })
    // Le geste s'inscrit au journal du moteur, sur la page, avec la fermeture citée.
    expect(await audits()).toEqual([expect.objectContaining({ actorPersonId: f.admin.personId, capacity: "page_admin", networkId: f.networkId, subjectTable: "pages", subjectId: f.pageId, details: { groupId, closedAt: NOW } })])
    expect(await group(f, f.reader)).toMatchObject({ isMember: true, canPublish: true })
    expect((await wall(f, f.reader, groupId)).items.map((post) => post._id)).toEqual([postId])
    // Rejouée (double clic), la réouverture rend le même état, sans seconde ligne au journal.
    expect(await reopen(f.admin, NOW)).toEqual({ state: "active" })
    expect(await audits()).toHaveLength(1)
  })

  it("AS-03 : un administrateur dont la ligne d'adhésion n'est pas acceptée ne rouvre pas, comme il ne ferme pas", async () => {
    const f = await fixture()
    const { groupId } = await create(f)
    const membership = await accept(f, f.admin)
    await f.otherAdmin.as.mutation(THEMATIC.closeGroup, { networkId: f.networkId, groupId })
    await f.t.run(async (ctx) => { await ctx.db.patch(membership.membershipId, { status: "removed" }) })
    expect(await group(f, f.admin)).toMatchObject({ state: "closed", closedAt: null, canReopen: false })
    expect(await codeOf(f.admin.as.mutation(GROUPS.reopenGroupForPage, { networkId: f.networkId, groupId, expectedClosedAt: NOW }))).toBe("notFound")
    expect(await group(f, f.otherAdmin)).toMatchObject({ canReopen: true, closedAt: NOW })
    expect(await f.otherAdmin.as.mutation(GROUPS.reopenGroupForPage, { networkId: f.networkId, groupId, expectedClosedAt: NOW })).toEqual({ state: "active" })
  })

  it("AS-03 : un adhérent exclu pendant la fermeture reste dehors après la réouverture", async () => {
    const f = await fixture()
    const { groupId } = await create(f)
    const membership = await accept(f, f.reader)
    await join(f, f.reader, groupId)
    await f.admin.as.mutation(THEMATIC.closeGroup, { networkId: f.networkId, groupId })
    await f.admin.as.mutation(ASSOCIATIONS.removeAssociationMember, { networkId: f.networkId, membershipId: membership.membershipId, expectedVersion: membership.version, reason: "Exclusion décidée par le bureau pour la recette." })
    expect(await f.admin.as.mutation(GROUPS.reopenGroupForPage, { networkId: f.networkId, groupId, expectedClosedAt: NOW })).toEqual({ state: "active" })
    expect(await group(f, f.reader)).toMatchObject({ isMember: false, canJoin: false, canPublish: false })
    expect(await codeOf(wall(f, f.reader, groupId))).toBe("notFound")
    expect(await codeOf(publish(f, f.reader, groupId, "apres-exclusion"))).toBe("notFound")
  })

  it("AS-03 : un groupe archivé, en suppression ou retiré par la modération ne se rouvre pas", async () => {
    const f = await fixture()
    const { groupId } = await create(f)
    await f.admin.as.mutation(THEMATIC.closeGroup, { networkId: f.networkId, groupId })
    await f.t.run(async (ctx) => {
      await ctx.db.insert("moderationContentStates", { networkId: f.networkId, targetKind: "thematicGroup", targetId: groupId, status: "removed", createdAt: NOW, updatedAt: NOW })
    })
    expect(await codeOf(f.admin.as.mutation(GROUPS.reopenGroupForPage, { networkId: f.networkId, groupId, expectedClosedAt: NOW }))).toBe("notFound")
    await f.t.run(async (ctx) => {
      const state = await ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", "thematicGroup").eq("targetId", groupId)).unique()
      if (state) await ctx.db.delete(state._id)
    })
    await f.otherAdmin.as.mutation(THEMATIC.archiveGroup, { networkId: f.networkId, groupId })
    expect(await group(f, f.otherAdmin)).toMatchObject({ state: "closed", closedAt: null, canReopen: false })
    expect(await codeOf(f.otherAdmin.as.mutation(GROUPS.reopenGroupForPage, { networkId: f.networkId, groupId, expectedClosedAt: NOW }))).toBe("notFound")
    expect(await f.t.run(async (ctx) => (await ctx.db.get(groupId))?.closedAt)).toBe(NOW)
    // En cours de suppression : la même réponse, sans archivage.
    await f.t.run(async (ctx) => { await ctx.db.patch(groupId, { archivedAt: undefined, deletingAt: NOW }) })
    expect(await codeOf(f.otherAdmin.as.mutation(GROUPS.reopenGroupForPage, { networkId: f.networkId, groupId, expectedClosedAt: NOW }))).toBe("notFound")
  })

  it("l'absence de rôle et l'anonymat de session demeurent des refus indistincts", async () => {
    const f = await fixture()
    const { groupId } = await create(f)
    expect(await codeOf(f.t.query(GROUPS.groupForPage, { networkId: f.networkId, pageId: f.pageId }))).toBe("unauthenticated")
    expect(await codeOf(f.outsider.as.mutation(THEMATIC.closeGroup, { networkId: f.networkId, groupId }))).toBe("notFound")
    const identity = await f.admin.as.run(async (ctx) => ctx.auth.getUserIdentity())
    if (!identity || typeof identity.sessionId !== "string") throw new Error("Session absente")
    await f.t.mutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: identity.sessionId }] } })
    expect(await codeOf(group(f, f.admin))).toBe("unauthenticated")
    expect(await codeOf(publish(f, f.admin, groupId))).toBe("unauthenticated")
  })
})
