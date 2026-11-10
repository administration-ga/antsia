// @vitest-environment edge-runtime
// Dupliqué de socle/convex/modules/reseauPages/pages.test.ts @ ad2e7fdc2 — adaptations : personnes et réseaux (graine des fondations) ; l'ACTIVATION par le superadmin remplacée par la CRÉATION par un membre vérifié et par la console (page d'institution « Officiel ») ; l'accord `communication.publish` remplacé par le SIGNATAIRE VIVANT (habilitation acceptée) ; la note de service (`organisation`) devenue la note aux abonnés (`followers`) ; la portée « mon_administration » retirée (ses cas deviennent ceux des voies et de la lecture depuis la racine) ; avertissement « module Actualités » sans objet ; compteurs lus dans l'agrégat ; codes et règles au lieu des libellés ; tests neufs : pays et portée d'une publication de page, règle `root`, page d'un réseau fermé lue depuis la racine, cloche des abonnés, signets d'une publication de page, identité modifiée avec historique, retour à la réactivation.
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, testConvex } from "../../test.setup"
import type { DeclaredMedia } from "../media/media"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }
type MembershipStatus = "en_attente" | "declaree" | "verifiee" | "suspendue"

const P = api.modules.pages.pages
const SIG = api.modules.pages.signatories
const ADMIN = api.modules.pages.admin
const ID = api.modules.pages.identity
const POSTS = api.modules.posts.posts

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(Date.UTC(2026, 9, 15, 9, 0, 0))
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

/** Pose le statut d'adhésion d'une personne dans un réseau (ajoute l'adhésion si elle manque). */
async function setStatus(t: T, networkId: Id<"networks">, person: Person, status: MembershipStatus): Promise<void> {
  await t.run(async (ctx) => {
    const membership = await ctx.db
      .query("networkMemberships")
      .withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", person.personId))
      .unique()
    if (membership) await ctx.db.patch(membership._id, { status })
    else await ctx.db.insert("networkMemberships", { networkId, personId: person.personId, status, role: "member", joinedAt: 1, statusChangedAt: 1 })
  })
}

async function makeOperator(t: T, person: Person): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("operators", { personId: person.personId, role: "platform_admin", grantedAt: 1 })
  })
  await createTestOperatorProof(t, person.as, person.personId)
}

async function connect(t: T, networkId: Id<"networks">, a: Person, b: Person): Promise<void> {
  await t.run(async (ctx) => {
    const [low, high] = a.personId < b.personId ? [a.personId, b.personId] : [b.personId, a.personId]
    await ctx.db.insert("connections", { networkId, personIdLow: low, personIdHigh: high, requestedByPersonId: a.personId, recipientPersonId: b.personId, status: "accepted", requestedAt: 1, respondedAt: 1, updatedAt: 1 })
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

const codeOf = async (promise: Promise<unknown>) => engineErrorCode(await caught(promise))
const ruleOf = async (promise: Promise<unknown>) => engineErrorRule(await caught(promise))?.rule ?? null

/** Un dépôt RÉEL du harnais, avec son type (le patch système le pose). */
async function storeBlob(t: T, contentType: string): Promise<Id<"_storage">> {
  return await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob([new Uint8Array(64)], { type: contentType }))
    await (ctx.db as unknown as { patch: (table: "_storage", id: Id<"_storage">, value: { contentType: string }) => Promise<void> }).patch("_storage", storageId, { contentType })
    return storageId
  })
}

/** L'analyse a parlé : le fichier est servable (sain). */
async function clean(t: T, storageId: Id<"_storage">): Promise<void> {
  await t.run(async (ctx) => {
    const scan = await ctx.db.query("fileScans").withIndex("by_storageId", (q) => q.eq("storageId", storageId)).first()
    if (scan) await ctx.db.patch(scan._id, { status: "clean", updatedAt: Date.now() })
  })
}

/** Une page créée par un membre rendu VÉRIFIÉ dans le réseau. */
async function createPage(
  t: T,
  owner: Person,
  networkId: Id<"networks">,
  name: string,
  extra: { country?: string; visibility?: "network" | "root"; ownerKind?: "association" | "company" | "media" | "community" } = {},
) {
  await setStatus(t, networkId, owner, "verifiee")
  const { ownerKind, ...rest } = extra
  return await owner.as.mutation(P.createPage, { networkId, name, ownerKind: ownerKind ?? "association", ...rest })
}

/** Habilite une personne sur la page, et elle accepte. */
async function addSignatory(owner: Person, person: Person, networkId: Id<"networks">, pageId: Id<"pages">, role: "admin" | "signatory" = "signatory") {
  await owner.as.mutation(SIG.grantPageRole, { networkId, pageId, handle: person.handle, role })
  await person.as.mutation(SIG.respondToPageInvitation, { networkId, pageId, accept: true })
}

async function publishAs(person: Person, networkId: Id<"networks">, pageId: Id<"pages">, body: string, extra: { audience?: "public" | "followers"; reach?: string; idempotencyKey?: string; media?: DeclaredMedia[] } = {}) {
  vi.setSystemTime(Date.now() + 1000)
  return await person.as.mutation(P.publishAsPage, { networkId, pageId, body, ...extra })
}

async function feedIds(person: Person, networkId: Id<"networks">, scope: "pour_vous" | "recents") {
  return (await person.as.query(POSTS.myFeed, { networkId, scope })).items.map((item) => item._id)
}

async function feedReasons(person: Person, networkId: Id<"networks">, scope: "pour_vous" | "recents") {
  return (await person.as.query(POSTS.myFeed, { networkId, scope })).items.map((item) => ({ id: item._id, reason: item.reason }))
}

/** Une page de la racine, son administratrice (Alice) et une publication de page. */
async function pageWithPost(t: T) {
  const { root, testClosed } = await seed(t)
  const alice = await enter(t, root, "alice")
  const { pageId, handle } = await createPage(t, alice, root, "Direction des Impôts")
  const { postId } = await publishAs(alice, root, pageId, "Le guichet ouvre lundi")
  return { root, testClosed, alice, pageId, handle, postId }
}

// ═══════════════════════════════════════════════════════════════
// Création
// ═══════════════════════════════════════════════════════════════

describe("création d'une page", () => {
  it("un membre VÉRIFIÉ crée une page « Communauté » dont il est l'administrateur ; l'adresse dérive du nom", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    expect(await codeOf(alice.as.mutation(P.createPage, { networkId: root, name: "Association des Gabonais de Lyon", ownerKind: "association" }))).toBe("statusInsufficient")
    const { handle } = await createPage(t, alice, root, "Association des Gabonais de Lyon")
    expect(handle).toBe("association-des-gabonais-de-lyon")
    expect(await alice.as.query(P.getPage, { networkId: root, handle })).toMatchObject({
      name: "Association des Gabonais de Lyon",
      badge: "community",
      ownerKind: "association",
      followerCount: 0,
      postCount: 0,
      viewer: { following: false, role: "admin" },
    })
  })

  it("une institution ne se crée pas depuis un compte ; une adresse prise se refuse en le disant ; une adresse longue passe", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await setStatus(t, root, alice, "verifiee")
    expect(await ruleOf(alice.as.mutation(P.createPage, { networkId: root, name: "Ministère de l'Intérieur", ownerKind: "institution" }))).toBe("PAGE_OWNER_KIND_RESERVED")
    await createPage(t, alice, root, "Radio Ndjobi", { ownerKind: "media" })
    expect(await codeOf(alice.as.mutation(P.createPage, { networkId: root, name: "Radio Ndjobi", ownerKind: "media" }))).toBe("handleUnavailable")
    const long = await createPage(t, bob, root, "Radio Ndjobi Estuaire", { ownerKind: "media" })
    expect(long.handle).toBe("radio-ndjobi-estuaire")
    const longer = await bob.as.mutation(P.createPage, { networkId: root, name: "Radio", handle: "radio-ndjobi-libreville-et-estuaire-officielle", ownerKind: "media" })
    expect(longer.handle.length).toBeGreaterThan(30)
  })

  it("la console crée une page d'institution « Officiel », idempotente par sa référence d'import, et trace la création", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const operator = await enter(t, root, "operatrice")
    const args = { networkId: root, name: "Consulat général du Gabon à Paris", importRef: "consulat-paris", reason: "Import du poste consulaire de Paris." }
    expect(await codeOf(alice.as.mutation(ADMIN.createInstitutionPage, args))).toBe("operatorRequired")
    await makeOperator(t, operator)
    const first = await operator.as.mutation(ADMIN.createInstitutionPage, args)
    expect(first).toMatchObject({ created: true, handle: "consulat-general-du-gabon-a-paris" })
    expect(await alice.as.query(P.getPage, { networkId: root, handle: first.handle })).toMatchObject({ badge: "official", ownerKind: "institution", viewer: { role: null } })
    expect(await operator.as.mutation(ADMIN.createInstitutionPage, args)).toEqual({ pageId: first.pageId, handle: first.handle, created: false })
    const journal = await t.run(async (ctx) => await ctx.db.query("engineAudit").withIndex("by_subject_at", (q) => q.eq("subjectTable", "pages").eq("subjectId", first.pageId)).take(5))
    expect(journal).toMatchObject([{ action: "page.create_official", capacity: "platform_admin", actorPersonId: operator.personId }])
  })
})

// ═══════════════════════════════════════════════════════════════
// Lecture
// ═══════════════════════════════════════════════════════════════

describe("lecture d'une page", () => {
  it("porte l'identité de la PAGE ; ses administrateurs la modifient, l'historique garde l'avant ; un simple membre non", async () => {
    const t = testConvex()
    const { root, alice, pageId, handle } = await pageWithPost(t)
    const bob = await enter(t, root, "bob")
    expect(await codeOf(bob.as.mutation(ID.updatePageIdentity, { networkId: root, pageId, name: "Usurpation" }))).toBe("pageRoleRequired")
    expect(await alice.as.mutation(ID.updatePageIdentity, { networkId: root, pageId, name: "Direction générale des Impôts", description: "Le service des impôts." })).toEqual({ changed: true })
    expect(await alice.as.mutation(ID.updatePageIdentity, { networkId: root, pageId, name: "Direction générale des Impôts" })).toEqual({ changed: false })
    expect(await bob.as.query(P.getPage, { networkId: root, handle })).toMatchObject({ name: "Direction générale des Impôts", description: "Le service des impôts." })
    const history = await t.run(async (ctx) => await ctx.db.query("pageIdentityHistory").withIndex("by_page_at", (q) => q.eq("pageId", pageId)).take(5))
    expect(history).toMatchObject([{ actorPersonId: alice.personId, previous: { name: "Direction des Impôts", description: null } }])
  })

  it("le logo passe la garde des fichiers : retenu tant que l'analyse n'a pas parlé, servi ensuite ; remplacé, l'ancien est purgé", async () => {
    const t = testConvex()
    const { root, alice, pageId, handle } = await pageWithPost(t)
    const first = await storeBlob(t, "image/png")
    expect(await alice.as.mutation(ID.setPageImage, { networkId: root, pageId, slot: "logo", storageId: first, mimeType: "image/png" })).toEqual({ url: null, withheld: "fileScanPending" })
    expect((await alice.as.query(P.getPage, { networkId: root, handle }))?.logoUrl).toBeNull()
    await clean(t, first)
    expect((await alice.as.query(P.getPage, { networkId: root, handle }))?.logoUrl).toEqual(expect.any(String))
    const second = await storeBlob(t, "image/webp")
    await alice.as.mutation(ID.setPageImage, { networkId: root, pageId, slot: "logo", storageId: second, mimeType: "image/webp" })
    expect(await t.run(async (ctx) => (await ctx.db.system.get("_storage", first)) === null)).toBe(true)
    const executable = await storeBlob(t, "application/x-msdownload")
    expect(await ruleOf(alice.as.mutation(ID.setPageImage, { networkId: root, pageId, slot: "banner", storageId: executable, mimeType: "application/x-msdownload" }))).toBe("UPLOAD_TYPE_NOT_ALLOWED")
    const history = await t.run(async (ctx) => await ctx.db.query("pageIdentityHistory").withIndex("by_page_at", (q) => q.eq("pageId", pageId)).take(5))
    expect(history.map((row) => row.previous)).toEqual([{ logoChanged: true }, { logoChanged: true }])
  })

  it("rend le MÊME `null` pour une page inconnue, retirée, ou d'un réseau fermé lue depuis la racine", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const alice = await enter(t, root, "alice")
    const operator = await enter(t, root, "operatrice")
    await makeOperator(t, operator)
    const { pageId, handle } = await createPage(t, alice, testClosed, "Association de Lyon", { country: "FR" })
    expect(await alice.as.query(P.getPage, { networkId: root, handle: "inconnue" })).toBeNull()
    expect(await alice.as.query(P.getPage, { networkId: root, handle })).toBeNull()
    expect(await alice.as.query(P.getPage, { networkId: testClosed, handle })).toMatchObject({ country: "FR", visibility: "network" })
    await operator.as.mutation(ADMIN.setPageStatus, { pageId, status: "inactive", reason: "Page retirée après examen." })
    expect(await alice.as.query(P.getPage, { networkId: testClosed, handle })).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// Abonnements
// ═══════════════════════════════════════════════════════════════

describe("abonnement à une page", () => {
  it("est idempotent et tient son compte ; se désabonner deux fois ne descend jamais sous zéro", async () => {
    const t = testConvex()
    const { root, pageId, handle } = await pageWithPost(t)
    const bob = await enter(t, root, "bob")
    await bob.as.mutation(P.follow, { networkId: root, handle })
    await bob.as.mutation(P.follow, { networkId: root, handle })
    expect(await bob.as.query(P.getPage, { networkId: root, handle })).toMatchObject({ followerCount: 1, viewer: { following: true } })
    await bob.as.mutation(P.unfollow, { networkId: root, pageId })
    await bob.as.mutation(P.unfollow, { networkId: root, pageId })
    expect(await bob.as.query(P.getPage, { networkId: root, handle })).toMatchObject({ followerCount: 0, viewer: { following: false } })
  })

  it("refuse de suivre une page retirée sans dire qu'elle a existé ; un compte suspendu ne s'abonne pas", async () => {
    const t = testConvex()
    const { root, pageId, handle } = await pageWithPost(t)
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    await setStatus(t, root, carol, "suspendue")
    expect(await codeOf(carol.as.mutation(P.follow, { networkId: root, handle }))).toBe("membershipSuspended")
    await t.run(async (ctx) => await ctx.db.patch(pageId, { status: "inactive" }))
    expect(await codeOf(bob.as.mutation(P.follow, { networkId: root, handle }))).toBe("notFound")
    expect(await codeOf(bob.as.mutation(P.follow, { networkId: root, handle: "jamais-creee" }))).toBe("notFound")
  })
})

// ═══════════════════════════════════════════════════════════════
// Publier au nom d'une page
// ═══════════════════════════════════════════════════════════════

describe("publier au nom d'une page", () => {
  it("est refusée à qui n'en est pas signataire vivant — simple membre, invitation non acceptée", async () => {
    const t = testConvex()
    const { root, alice, pageId } = await pageWithPost(t)
    const bob = await enter(t, root, "bob")
    expect(await codeOf(publishAs(bob, root, pageId, "Je parle pour la page"))).toBe("pageRoleRequired")
    await alice.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: "bob", role: "signatory" })
    expect(await codeOf(publishAs(bob, root, pageId, "Pas encore"))).toBe("pageRoleRequired")
    await bob.as.mutation(SIG.respondToPageInvitation, { networkId: root, pageId, accept: true })
    expect((await publishAs(bob, root, pageId, "Désormais")).created).toBe(true)
  })

  it("porte la PAGE en en-tête et le signataire en auteur ; elle n'est « mienne » pour personne", async () => {
    const t = testConvex()
    const { root, alice, handle, postId } = await pageWithPost(t)
    const bob = await enter(t, root, "bob")
    const read = await bob.as.query(POSTS.getPost, { networkId: root, postId })
    expect(read.page).toMatchObject({ handle, name: "Direction des Impôts", badge: "community" })
    expect(read.author.personId).toBe(alice.personId)
    expect(read.isMine).toBe(false)
    expect((await alice.as.query(POSTS.getPost, { networkId: root, postId })).isMine).toBe(false)
    expect((await alice.as.query(POSTS.getPost, { networkId: root, postId })).reason).toBe("own")
  })

  it("est idempotente : la clé rejouée rend la même publication ; rejouée pour une autre page, elle est refusée", async () => {
    const t = testConvex()
    const { root, alice, pageId } = await pageWithPost(t)
    const first = await publishAs(alice, root, pageId, "Communiqué", { idempotencyKey: "cle-1" })
    // FD-04 : le rejeu dit aussi l'état de modération COURANT de la publication existante.
    expect(await publishAs(alice, root, pageId, "Communiqué", { idempotencyKey: "cle-1" })).toEqual({ postId: first.postId, created: false, moderation: "published" })
    const other = await createPage(t, alice, root, "Autre page")
    expect(await codeOf(publishAs(alice, root, other.pageId, "Communiqué", { idempotencyKey: "cle-1" }))).toBe("conflict")
  })

  it("compte ses publications et les décompte au retrait ; un autre signataire retire ce qu'un collègue a signé, un tiers non", async () => {
    const t = testConvex()
    const { root, alice, pageId, handle, postId } = await pageWithPost(t)
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    await addSignatory(alice, bob, root, pageId)
    await publishAs(alice, root, pageId, "Second communiqué")
    expect((await carol.as.query(P.getPage, { networkId: root, handle }))?.postCount).toBe(2)
    expect(await codeOf(carol.as.mutation(P.removePagePost, { networkId: root, postId }))).toBe("pageRoleRequired")
    await bob.as.mutation(P.removePagePost, { networkId: root, postId })
    await bob.as.mutation(P.removePagePost, { networkId: root, postId })
    expect((await carol.as.query(P.getPage, { networkId: root, handle }))?.postCount).toBe(1)
    expect(await codeOf(carol.as.query(POSTS.getPost, { networkId: root, postId }))).toBe("notFound")
  })

  it("dans un réseau à portées : le pays de la page pour une publication locale, aucun en `diaspora` ; sans pays, la portée locale se refuse", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const alice = await enter(t, root, "alice")
    const withCountry = await createPage(t, alice, testClosed, "Association de Lyon", { country: "fr" })
    const local = await publishAs(alice, testClosed, withCountry.pageId, "Soirée à Lyon", { reach: "local" })
    expect(await alice.as.query(POSTS.getPost, { networkId: testClosed, postId: local.postId })).toMatchObject({ reach: "local", country: "FR" })
    const everywhere = await publishAs(alice, testClosed, withCountry.pageId, "À toute la diaspora", { reach: "diaspora" })
    expect(await alice.as.query(POSTS.getPost, { networkId: testClosed, postId: everywhere.postId })).toMatchObject({ reach: "diaspora", country: null })
    const without = await createPage(t, alice, testClosed, "Association sans pays")
    expect(await ruleOf(publishAs(alice, testClosed, without.pageId, "Locale ?", { reach: "local" }))).toBe("PAGE_COUNTRY_REQUIRED")
    // La voie du hub d'un pays rend la publication locale de la page.
    const lane = await alice.as.query(POSTS.myFeed, { networkId: testClosed, lanes: [{ reach: "local", country: "FR" }] })
    expect(lane.items.map((item) => item._id)).toEqual([local.postId])
  })

  it("la règle `root` de la page porte ses communiqués à la racine ; la note aux abonnés reste dans son réseau", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const alice = await enter(t, root, "alice")
    const rootOnly = await enter(t, root, "racine")
    const { pageId, handle } = await createPage(t, alice, testClosed, "Consulat de Paris", { country: "FR", visibility: "root" })
    expect(await rootOnly.as.query(P.getPage, { networkId: root, handle })).toMatchObject({ visibility: "root" })
    const statement = await publishAs(alice, testClosed, pageId, "Communiqué à tous")
    const note = await publishAs(alice, testClosed, pageId, "Aux abonnés", { audience: "followers" })
    await rootOnly.as.mutation(P.follow, { networkId: root, handle })
    const read = await rootOnly.as.query(POSTS.getPost, { networkId: root, postId: statement.postId })
    expect(read).toMatchObject({ visibility: "root", origin: { networkId: testClosed } })
    expect(await codeOf(rootOnly.as.query(POSTS.getPost, { networkId: root, postId: note.postId }))).toBe("notFound")
    expect(await feedIds(rootOnly, root, "pour_vous")).toEqual([statement.postId])
  })

  it("ne s'épingle sur aucun mur ; ne figure sur aucun mur personnel, ni dans « mes publications »", async () => {
    const t = testConvex()
    const { root, alice, postId } = await pageWithPost(t)
    const bob = await enter(t, root, "bob")
    const own = await alice.as.mutation(POSTS.publish, { networkId: root, body: "Ma vie" })
    expect(await ruleOf(alice.as.mutation(POSTS.pinOnMyWall, { networkId: root, postId }))).toBe("POST_PIN_PAGE")
    expect((await bob.as.query(POSTS.personPosts, { networkId: root, handle: "alice" })).items.map((item) => item._id)).toEqual([own.postId])
    expect((await alice.as.query(POSTS.paginateMyPosts, { networkId: root, paginationOpts: { numItems: 10, cursor: null } })).page.map((row) => row.postId)).toEqual([own.postId])
  })

  it("SD-03 — la vidéo d'une page suit les bornes d'une publication : ni .mov neuf, ni durée déclarée au-delà de cinq minutes", async () => {
    const t = testConvex()
    const { root, alice, pageId } = await pageWithPost(t)
    const mov = await storeBlob(t, "video/quicktime")
    expect(await ruleOf(publishAs(alice, root, pageId, "Clip", { media: [{ storageId: mov, kind: "video", mimeType: "video/quicktime", sizeBytes: 64 }] }))).toBe("UPLOAD_TYPE_NOT_ALLOWED")
    const mp4 = await storeBlob(t, "video/mp4")
    expect(await ruleOf(publishAs(alice, root, pageId, "Long", { media: [{ storageId: mp4, kind: "video", mimeType: "video/mp4", sizeBytes: 64, durationMs: 5 * 60_000 + 1 }] }))).toBe("POST_VIDEO_TOO_LONG")
    expect((await publishAs(alice, root, pageId, "Court", { media: [{ storageId: mp4, kind: "video", mimeType: "video/mp4", sizeBytes: 64, durationMs: 30_000 }] })).created).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════
// Le fil
// ═══════════════════════════════════════════════════════════════

describe("les publications de page dans le fil", () => {
  it("n'entrent pas dans « Pour vous » sans abonnement ; suivie, la page y entre au titre « page »", async () => {
    const t = testConvex()
    const { root, handle, postId } = await pageWithPost(t)
    const bob = await enter(t, root, "bob")
    expect(await feedIds(bob, root, "pour_vous")).toEqual([])
    await bob.as.mutation(P.follow, { networkId: root, handle })
    expect(await feedReasons(bob, root, "pour_vous")).toEqual([{ id: postId, reason: "page" }])
  })

  it("n'entrent PAS par la connexion au signataire ; ni sa sourdine ni son blocage ne cachent la parole de la page", async () => {
    const t = testConvex()
    const { root, alice, handle, postId } = await pageWithPost(t)
    const bob = await enter(t, root, "bob")
    await connect(t, root, alice, bob)
    const personal = await alice.as.mutation(POSTS.publish, { networkId: root, body: "Personnel" })
    expect(await feedIds(bob, root, "pour_vous")).toEqual([personal.postId])
    await bob.as.mutation(P.follow, { networkId: root, handle })
    await bob.as.mutation(api.modules.marks.marks.muteAuthor, { networkId: root, targetPersonId: alice.personId })
    expect(await feedIds(bob, root, "pour_vous")).toEqual([postId])
    await bob.as.mutation(api.modules.graph.connections.blockPerson, { networkId: root, targetPersonId: alice.personId })
    expect(await feedIds(bob, root, "pour_vous")).toEqual([postId])
  })

  it("apparaît UNE seule fois à son signataire qui suit la page, au titre « own »", async () => {
    const t = testConvex()
    const { root, alice, handle, postId } = await pageWithPost(t)
    await alice.as.mutation(P.follow, { networkId: root, handle })
    expect(await feedReasons(alice, root, "pour_vous")).toEqual([{ id: postId, reason: "own" }])
  })

  it("le communiqué se découvre dans « Récents » ; la note aux abonnés non", async () => {
    const t = testConvex()
    const { root, alice, pageId, postId } = await pageWithPost(t)
    const note = await publishAs(alice, root, pageId, "Aux abonnés", { audience: "followers" })
    const stranger = await enter(t, root, "inconnu")
    expect(await feedReasons(stranger, root, "recents")).toEqual([{ id: postId, reason: "public" }])
    const native = await stranger.as.query(POSTS.feed, { networkId: root, paginationOpts: { numItems: 10, cursor: null } })
    expect(native.page.map((item) => item._id)).toEqual([postId])
    expect(native.page.map((item) => item._id)).not.toContain(note.postId)
  })

  it("obéit au MASQUAGE d'une publication précise", async () => {
    const t = testConvex()
    const { root, handle, postId } = await pageWithPost(t)
    const bob = await enter(t, root, "bob")
    await bob.as.mutation(P.follow, { networkId: root, handle })
    await bob.as.mutation(api.modules.marks.marks.hidePost, { networkId: root, postId })
    expect(await feedIds(bob, root, "pour_vous")).toEqual([])
    expect(await feedIds(bob, root, "recents")).toEqual([])
  })

  it("se lit sur le mur de la page — la note aux abonnés pour ses seuls abonnés", async () => {
    const t = testConvex()
    const { root, alice, pageId, handle, postId } = await pageWithPost(t)
    const note = await publishAs(alice, root, pageId, "Aux abonnés", { audience: "followers" })
    const bob = await enter(t, root, "bob")
    const wall = async () => (await bob.as.query(P.pagePosts, { networkId: root, handle })).items.map((item) => item._id)
    expect(await wall()).toEqual([postId])
    await bob.as.mutation(P.follow, { networkId: root, handle })
    expect(await wall()).toEqual([note.postId, postId])
    expect((await bob.as.query(P.pagePosts, { networkId: root, handle })).items[0]).toMatchObject({ reason: "page", page: { handle } })
    expect(await bob.as.query(P.pagePosts, { networkId: root, handle: "inconnue" })).toEqual({ items: [], nextCursor: null })
  })

  it("disparaît des volets, de la recherche, des signets et du mur quand la page est retirée — et revient à sa réactivation", async () => {
    const t = testConvex()
    const { root, pageId, handle, postId } = await pageWithPost(t)
    const bob = await enter(t, root, "bob")
    const operator = await enter(t, root, "operatrice")
    await makeOperator(t, operator)
    await bob.as.mutation(P.follow, { networkId: root, handle })
    await bob.as.mutation(api.modules.marks.marks.toggleMark, { networkId: root, postId, kind: "bookmark" })
    const bookmarks = async () => (await bob.as.query(api.modules.marks.marks.paginateBookmarks, { networkId: root, paginationOpts: { numItems: 10, cursor: null } })).page
    expect(await bookmarks()).toMatchObject([{ postId, page: { handle } }])
    await operator.as.mutation(ADMIN.setPageStatus, { pageId, status: "inactive", reason: "Retrait après signalements." })
    for (const scope of ["pour_vous", "recents"] as const) expect(await feedIds(bob, root, scope)).toEqual([])
    expect((await bob.as.query(POSTS.search, { networkId: root, query: "guichet" })).items).toEqual([])
    expect(await bookmarks()).toEqual([])
    expect(await codeOf(bob.as.query(POSTS.getPost, { networkId: root, postId }))).toBe("notFound")
    await operator.as.mutation(ADMIN.setPageStatus, { pageId, status: "active", reason: "Rétablie après examen." })
    expect(await feedIds(bob, root, "pour_vous")).toEqual([postId])
    expect((await bob.as.query(POSTS.search, { networkId: root, query: "guichet" })).items.map((item) => item._id)).toEqual([postId])
  })

  it("ses abonnés sont prévenus par la cloche (`page_post`, sans acteur, diffusion par lots) ; un non-abonné non — la ligne NOMME la page et son badge calculé, jusqu'à son retrait", async () => {
    const t = testConvex()
    const { root, alice, pageId, handle } = await pageWithPost(t)
    // La diffusion de la première publication s'achève avant tout abonnement.
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    await bob.as.mutation(P.follow, { networkId: root, handle })
    const { postId } = await publishAs(alice, root, pageId, "Nouvelle annonce")
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const bell = async (person: Person) => (await person.as.query(api.modules.notifications.bell.paginateNotifications, { networkId: root, paginationOpts: { numItems: 10, cursor: null } })).page
    expect(await bell(bob)).toMatchObject([{ kind: "page_post", subject: { kind: "post", id: postId }, actor: null, page: { pageId, handle, name: "Direction des Impôts", badge: "community" } }])
    expect(await bell(carol)).toEqual([])
    // Une page retirée ne parle plus : la ligne reste, sans carte (jamais l'identité d'un signataire).
    const operator = await enter(t, root, "operatrice")
    await makeOperator(t, operator)
    await operator.as.mutation(ADMIN.setPageStatus, { pageId, status: "inactive", reason: "Retrait après signalements." })
    expect(await bell(bob)).toMatchObject([{ kind: "page_post", page: null }])
  })
})

// ═══════════════════════════════════════════════════════════════
// Découverte
// ═══════════════════════════════════════════════════════════════

/** Insère `count` pages d'un réseau (nom « Page NN »), trust donné, sans passer par le débit. */
async function insertPages(t: T, networkId: Id<"networks">, count: number, options: { trust?: "official" | "verified" | "community"; prefix?: string; onRoot?: boolean } = {}) {
  return await t.run(async (ctx) => {
    const ids: Id<"pages">[] = []
    for (let index = 0; index < count; index += 1) {
      const name = `${options.prefix ?? "Page"} ${String(index).padStart(2, "0")}`
      const handle = name.toLowerCase().replace(/\s+/g, "-")
      const trust = options.trust ?? "community"
      ids.push(
        await ctx.db.insert("pages", {
          networkId,
          handle,
          name,
          ownerKind: trust === "official" ? "institution" : "association",
          trust,
          trustRank: trust === "official" ? 2 : trust === "verified" ? 1 : 0,
          visibility: "network",
          onRoot: options.onRoot ?? true,
          status: "active",
          searchText: `${name} ${handle}`,
          createdAt: 1_000 + index,
          updatedAt: 1_000 + index,
        }),
      )
    }
    return ids
  })
}

describe("découverte", () => {
  it("trouve une page malgré les accents manquants ; ne propose jamais une page retirée", async () => {
    const t = testConvex()
    const { root, pageId } = await pageWithPost(t)
    const bob = await enter(t, root, "bob")
    expect((await bob.as.query(P.discover, { networkId: root, query: "impots" })).map((row) => row.pageId)).toEqual([pageId])
    await t.run(async (ctx) => await ctx.db.patch(pageId, { status: "inactive" }))
    expect(await bob.as.query(P.discover, { networkId: root, query: "impots" })).toEqual([])
    expect(await bob.as.query(P.discover, { networkId: root })).toEqual([])
  })

  it("l'annuaire montre les officielles, puis les vérifiées, puis les autres, les plus récentes d'abord ; par pays", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const bob = await enter(t, root, "bob")
    const [community] = await insertPages(t, root, 1, { prefix: "Communaute" })
    const [official] = await insertPages(t, root, 1, { prefix: "Officielle", trust: "official" })
    const [verified] = await insertPages(t, root, 1, { prefix: "Verifiee", trust: "verified" })
    expect((await bob.as.query(P.discover, { networkId: root })).map((row) => row.pageId)).toEqual([official, verified, community])
    await setStatus(t, testClosed, bob, "declaree")
    const [inFrance] = await insertPages(t, testClosed, 1, { prefix: "Lyon", onRoot: false })
    await insertPages(t, testClosed, 1, { prefix: "Bruxelles", onRoot: false })
    await t.run(async (ctx) => await ctx.db.patch(inFrance!, { country: "FR" }))
    expect((await bob.as.query(P.discover, { networkId: testClosed, country: "fr" })).map((row) => row.pageId)).toEqual([inFrance])
    expect(await bob.as.query(P.discover, { networkId: testClosed })).toHaveLength(2)
  })

  it("pagine 60 pages sans doublon ni trou, la recherche aussi ; sous deux caractères, retombe sur l'annuaire ; marque celles que je suis", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const bob = await enter(t, root, "bob")
    const ids = await insertPages(t, root, 60)
    await bob.as.mutation(P.follow, { networkId: root, handle: "page-07" })
    const walk = async (query?: string) => {
      const seen: string[] = []
      let cursor: string | null = null
      for (let guard = 0; guard < 20; guard += 1) {
        const result: { page: { pageId: string; following: boolean; handle: string }[]; isDone: boolean; continueCursor: string } = await bob.as.query(P.paginateDiscover, {
          networkId: root,
          ...(query !== undefined ? { query } : {}),
          paginationOpts: { numItems: 25, cursor },
        })
        seen.push(...result.page.map((row) => row.pageId))
        if (result.page.some((row) => row.handle === "page-07")) expect(result.page.find((row) => row.handle === "page-07")?.following).toBe(true)
        if (result.isDone) break
        cursor = result.continueCursor
      }
      return seen
    }
    const listed = await walk()
    expect(new Set(listed).size).toBe(60)
    expect([...listed].sort()).toEqual([...ids].sort())
    expect(new Set(await walk("page")).size).toBe(60)
    expect((await walk("p")).length).toBe(60)
    expect(await bob.as.query(P.discover, { networkId: root })).toHaveLength(20)
  })

  it("depuis la racine : ses pages et celles d'un réseau fermé à la règle `root`, jamais les autres", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const alice = await enter(t, root, "alice")
    const rooted = await createPage(t, alice, testClosed, "Consulat de Paris", { visibility: "root" })
    await createPage(t, alice, testClosed, "Association de quartier")
    const native = await createPage(t, alice, root, "Page nationale")
    const listed = (await alice.as.query(P.discover, { networkId: root })).map((row) => row.pageId)
    expect([...listed].sort()).toEqual([rooted.pageId, native.pageId].sort())
  })

  it("liste les pages au nom desquelles JE parle — une invitation en attente n'en est pas", async () => {
    const t = testConvex()
    const { root, alice, pageId } = await pageWithPost(t)
    const bob = await enter(t, root, "bob")
    await alice.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: "bob", role: "signatory" })
    expect(await bob.as.query(P.myPages, { networkId: root })).toEqual([])
    await bob.as.mutation(SIG.respondToPageInvitation, { networkId: root, pageId, accept: true })
    expect(await bob.as.query(P.myPages, { networkId: root })).toMatchObject([{ pageId, role: "signatory" }])
    expect(await alice.as.query(P.myPages, { networkId: root })).toMatchObject([{ pageId, role: "admin" }])
  })

  it("« mes pages suivies » se paginent, une page retirée en sort sans que l'abonnement soit détruit", async () => {
    const t = testConvex()
    const { root, pageId, handle } = await pageWithPost(t)
    const bob = await enter(t, root, "bob")
    await bob.as.mutation(P.follow, { networkId: root, handle })
    const mine = async () => (await bob.as.query(P.paginateMyPageFollows, { networkId: root, paginationOpts: { numItems: 10, cursor: null } })).page.map((row) => row.pageId)
    expect(await mine()).toEqual([pageId])
    await t.run(async (ctx) => await ctx.db.patch(pageId, { status: "inactive" }))
    expect(await mine()).toEqual([])
    await t.run(async (ctx) => await ctx.db.patch(pageId, { status: "active" }))
    expect(await mine()).toEqual([pageId])
  })
})

// ═══════════════════════════════════════════════════════════════
// La note aux abonnés
// ═══════════════════════════════════════════════════════════════

describe("la NOTE aux abonnés — réservée aux abonnés et signataires vivants", () => {
  it("le défaut reste le COMMUNIQUÉ — omettre l'audience ne change rien", async () => {
    const t = testConvex()
    const { root, alice, postId } = await pageWithPost(t)
    expect((await alice.as.query(POSTS.getPost, { networkId: root, postId })).audience).toBe("public")
  })

  it("un abonné la lit ; un non-abonné non — ni par son lien, ni par la recherche ; elle ne se partage pas", async () => {
    const t = testConvex()
    const { root, alice, pageId, handle } = await pageWithPost(t)
    const note = await publishAs(alice, root, pageId, "Réunion des membres samedi", { audience: "followers" })
    const follower = await enter(t, root, "abonne")
    const stranger = await enter(t, root, "inconnu")
    await follower.as.mutation(P.follow, { networkId: root, handle })
    expect((await follower.as.query(POSTS.getPost, { networkId: root, postId: note.postId })).audience).toBe("followers")
    expect(await codeOf(stranger.as.query(POSTS.getPost, { networkId: root, postId: note.postId }))).toBe("notFound")
    expect((await stranger.as.query(POSTS.search, { networkId: root, query: "reunion" })).items).toEqual([])
    expect((await follower.as.query(POSTS.search, { networkId: root, query: "reunion" })).items.map((item) => item._id)).toEqual([note.postId])
    expect(await ruleOf(follower.as.mutation(POSTS.publish, { networkId: root, body: "", sharedPostId: note.postId }))).toBe("POST_NOT_SHAREABLE")
    expect(await feedIds(follower, root, "pour_vous")).toContain(note.postId)
    expect(await feedIds(stranger, root, "pour_vous")).not.toContain(note.postId)
  })

  it("se referme à qui se désabonne, et à l'ancien signataire après sa révocation", async () => {
    const t = testConvex()
    const { root, alice, pageId, handle } = await pageWithPost(t)
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    await addSignatory(alice, bob, root, pageId)
    const note = await publishAs(bob, root, pageId, "Note interne", { audience: "followers" })
    await carol.as.mutation(P.follow, { networkId: root, handle })
    expect((await carol.as.query(POSTS.getPost, { networkId: root, postId: note.postId }))._id).toBe(note.postId)
    await carol.as.mutation(P.unfollow, { networkId: root, pageId })
    expect(await codeOf(carol.as.query(POSTS.getPost, { networkId: root, postId: note.postId }))).toBe("notFound")
    expect((await bob.as.query(POSTS.getPost, { networkId: root, postId: note.postId }))._id).toBe(note.postId)
    await alice.as.mutation(SIG.revokePageRole, { networkId: root, pageId, personId: bob.personId })
    expect(await codeOf(bob.as.query(POSTS.getPost, { networkId: root, postId: note.postId }))).toBe("notFound")
  })

  it("une citation ne sonne que les abonnés et signataires vivants", async () => {
    const t = testConvex()
    const { root, alice, pageId, handle } = await pageWithPost(t)
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const follower = await enter(t, root, "abonne")
    const stranger = await enter(t, root, "inconnu")
    await follower.as.mutation(P.follow, { networkId: root, handle })
    await publishAs(alice, root, pageId, "Merci @abonne et @inconnu", { audience: "followers" })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const kinds = async (person: Person) => (await person.as.query(api.modules.notifications.bell.paginateNotifications, { networkId: root, paginationOpts: { numItems: 10, cursor: null } })).page.map((row) => row.kind).sort()
    expect(await kinds(follower)).toEqual(["mention", "page_post"])
    expect(await kinds(stranger)).toEqual([])
  })

  it("l'audience des abonnés sans page est refusée à l'écriture", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    expect(await ruleOf(alice.as.mutation(POSTS.publish, { networkId: root, body: "Pour mes abonnés", audience: "followers" }))).toBe("POST_FOLLOWERS_REQUIRES_PAGE")
  })
})

// ═══════════════════════════════════════════════════════════════
// Autorité actuelle
// ═══════════════════════════════════════════════════════════════

describe("autorité actuelle sur une publication de page", () => {
  it("refuse à l'ancien signataire de retirer ou d'éditer ce qu'il a signé, après sa révocation", async () => {
    const t = testConvex()
    const { root, alice, pageId } = await pageWithPost(t)
    const bob = await enter(t, root, "bob")
    await addSignatory(alice, bob, root, pageId)
    const { postId } = await publishAs(bob, root, pageId, "Signé par Bob")
    expect((await bob.as.mutation(POSTS.edit, { networkId: root, postId, body: "Signé par Bob, corrigé" })).editedAt).toBeGreaterThan(0)
    await alice.as.mutation(SIG.revokePageRole, { networkId: root, pageId, personId: bob.personId })
    expect(await codeOf(bob.as.mutation(POSTS.edit, { networkId: root, postId, body: "Encore" }))).toBe("notFound")
    expect(await codeOf(bob.as.mutation(POSTS.remove, { networkId: root, postId }))).toBe("notFound")
    expect(await codeOf(bob.as.mutation(P.removePagePost, { networkId: root, postId }))).toBe("pageRoleRequired")
  })

  it("refuse toute gestion quand la page n'est plus active ; un signataire parti du réseau ne parle plus pour elle", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const { pageId } = await createPage(t, alice, testClosed, "Association de Lyon")
    await setStatus(t, testClosed, bob, "declaree")
    await addSignatory(alice, bob, testClosed, pageId)
    const { postId } = await publishAs(bob, testClosed, pageId, "Bonjour")
    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("networkMemberships")
        .withIndex("by_network_and_person", (q) => q.eq("networkId", testClosed).eq("personId", bob.personId))
        .unique()
      await ctx.db.patch(membership!._id, { status: "partie" })
    })
    expect(await codeOf(publishAs(bob, testClosed, pageId, "Encore là ?"))).toBe("notFound")
    await t.run(async (ctx) => await ctx.db.patch(pageId, { status: "inactive" }))
    expect(await codeOf(alice.as.mutation(P.removePagePost, { networkId: testClosed, postId }))).toBe("notFound")
    expect(await codeOf(publishAs(alice, testClosed, pageId, "Page retirée"))).toBe("notFound")
  })
})
