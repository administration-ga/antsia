// @vitest-environment edge-runtime
/**
 * Règle de PLACEMENT d'une publication fournie par la tranche qui gouverne le réseau (HB-03, issue
 * antsia#96, demande de la session DIASPORALE) : `posts.publish`, `pages.publishAsPage` et
 * `events.announce` appellent, AVANT d'écrire, la règle inscrite au registre
 * (`modules/networks/postPlacementRegistry`).
 *
 * La tranche est SIMULÉE par un registre de test injecté (module remplacé) : aucune règle de test
 * n'est enregistrée dans le moteur. La règle factice suit l'esprit de la demande (une publication
 * locale va dans le pays de son auteur ou de sa page, ouvert et admis ; toute autre portée passe),
 * compte ses appels et relève, AU MOMENT où elle est appelée, ce que la transaction a déjà écrit :
 * c'est la preuve que la garde précède toute écriture (aucune publication, aucun état de modération,
 * aucun fichier admis), indépendamment de l'annulation de la transaction refusée.
 */
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import type { PostPlacementRefusal } from "@antsia/social-domain/content"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import type { PostPlacementRegistry, PostPlacementRule } from "../modules/networks/postPlacementRegistry"
import { SEED_CONFIRMATION } from "../seeds/foundations"
import { testConvex } from "../test.setup"

type Seen = { posts: number; states: number; scans: number }
type Call = { networkId: string; authorPersonId: string; pageId: string | null; reach: string | null; country: string | null; seen: Seen }

const fakes = vi.hoisted(() => ({
  registry: { diaspora: null } as { -readonly [S in keyof PostPlacementRegistry]: PostPlacementRegistry[S] },
  calls: [] as Call[],
  residence: new Map<string, string>(),
  open: new Set<string>(),
  admitted: new Set<string>(),
  storageIds: [] as string[],
  answer: null as string | null,
}))

vi.mock("../modules/networks/postPlacementRegistry", () => ({ POST_PLACEMENT_RULES: fakes.registry }))

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const FR = { values: { countryOfResidence: "FR" }, visibilities: {} }
const T0 = Date.UTC(2026, 10, 10, 10, 0, 0)
const HOUR = 3_600_000

/** La tranche de test : lecture seule, une décision par portée locale, et le relevé de ce qui est déjà écrit. */
const sliceRule: PostPlacementRule = async (ctx, placement) => {
  const posts = await ctx.db.query("posts").withIndex("by_network_author_publishedAt", (q) => q.eq("networkId", placement.network._id).eq("authorPersonId", placement.authorPersonId)).take(100)
  const states = await ctx.db.query("moderationContentStates").withIndex("by_network_owner_updatedAt", (q) => q.eq("networkId", placement.network._id).eq("ownerPersonId", placement.authorPersonId)).take(100)
  let scans = 0
  for (const storageId of fakes.storageIds) scans += (await ctx.db.query("fileScans").withIndex("by_storageId", (q) => q.eq("storageId", storageId as Id<"_storage">)).take(10)).length
  fakes.calls.push({ networkId: placement.network._id, authorPersonId: placement.authorPersonId, pageId: placement.page?._id ?? null, reach: placement.reach, country: placement.country, seen: { posts: posts.length, states: states.length, scans } })
  // Un code forcé par le test (y compris hors de l'ensemble fermé, pour éprouver la garde).
  if (fakes.answer !== null) return fakes.answer as PostPlacementRefusal
  if (placement.reach !== "local") return null
  const country = placement.country
  if (country === null || !fakes.admitted.has(country)) return "POST_PLACEMENT_COUNTRY_NOT_ADMITTED"
  const own = placement.page !== null ? (placement.page.country ?? null) : (fakes.residence.get(placement.authorPersonId) ?? null)
  if (own !== country) return "POST_PLACEMENT_NOT_OWN_COUNTRY"
  if (!fakes.open.has(country)) return "POST_PLACEMENT_COUNTRY_NOT_OPEN"
  return null
}

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  fakes.calls.length = 0
  fakes.storageIds.length = 0
  fakes.residence.clear()
  fakes.open = new Set(["FR"])
  fakes.admitted = new Set(["FR", "CA", "BE"])
  fakes.answer = null
  fakes.registry.diaspora = sliceRule
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  return null
}

const ruleOf = async (promise: Promise<unknown>) => engineErrorRule(await caught(promise))?.rule ?? null

/** Une personne au profil publié, membre de la racine et (déclarée) du réseau fermé de test, résidente en France. */
async function enter(t: T, root: Id<"networks">, closed: Id<"networks">, handle: string): Promise<Person> {
  vi.setSystemTime(Date.now() + 1000)
  const as = t.withIdentity({ subject: `auth-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: closed, facet: FR })
  await t.run(async (ctx) => {
    const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", closed).eq("personId", personId)).unique()
    if (membership) await ctx.db.patch(membership._id, { status: "declaree" })
  })
  fakes.residence.set(personId, "FR")
  return { as, personId, handle }
}

/** La racine et `test-closed` (portées `local` et `diaspora`) ; `governed` le confie à la tranche `diaspora`. */
async function world(t: T, options: { governed: boolean }) {
  const { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const alice = await enter(t, root, testClosed, "alice")
  if (options.governed) await t.run(async (ctx) => await ctx.db.patch(testClosed, { managedBy: "diaspora" }))
  return { root, closed: testClosed, alice }
}

async function storeBlob(t: T): Promise<Id<"_storage">> {
  const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob([PNG as BlobPart], { type: "image/png" })))
  fakes.storageIds.push(storageId)
  return storageId
}

/** Ce que la base garde d'une personne dans un réseau, après coup. */
async function written(t: T, networkId: Id<"networks">, person: Person): Promise<Seen> {
  return await t.run(async (ctx) => {
    const posts = await ctx.db.query("posts").withIndex("by_network_author_publishedAt", (q) => q.eq("networkId", networkId).eq("authorPersonId", person.personId)).take(100)
    const states = await ctx.db.query("moderationContentStates").withIndex("by_network_owner_updatedAt", (q) => q.eq("networkId", networkId).eq("ownerPersonId", person.personId)).take(100)
    let scans = 0
    for (const storageId of fakes.storageIds) scans += (await ctx.db.query("fileScans").withIndex("by_storageId", (q) => q.eq("storageId", storageId as Id<"_storage">)).take(10)).length
    return { posts: posts.length, states: states.length, scans }
  })
}

const NOTHING: Seen = { posts: 0, states: 0, scans: 0 }

describe("règle de placement : `posts.publish` dans un réseau gouverné", () => {
  it("refuse avec le code fermé — un autre pays, un pays non ouvert, un code non admis — AVANT toute écriture, médias compris", async () => {
    const t = testConvex()
    const { closed, alice } = await world(t, { governed: true })
    const publish = (country: string) => alice.as.mutation(api.modules.posts.posts.publish, {
      networkId: closed,
      body: "Une soirée près de chez moi",
      reach: "local",
      country,
      media: [{ storageId: fakes.storageIds[0] as Id<"_storage">, kind: "image", mimeType: "image/png", sizeBytes: PNG.length }],
    })
    await storeBlob(t)
    expect(await ruleOf(publish("CA"))).toBe("POST_PLACEMENT_NOT_OWN_COUNTRY")
    fakes.residence.set(alice.personId, "BE")
    expect(await ruleOf(publish("be"))).toBe("POST_PLACEMENT_COUNTRY_NOT_OPEN")
    expect(await ruleOf(publish("ZZ"))).toBe("POST_PLACEMENT_COUNTRY_NOT_ADMITTED")
    // Au moment de chaque appel, rien n'était écrit : ni publication, ni état de modération, ni fichier admis.
    expect(fakes.calls.map((call) => [call.reach, call.country, call.seen])).toEqual([
      ["local", "CA", NOTHING],
      ["local", "BE", NOTHING],
      ["local", "ZZ", NOTHING],
    ])
    // Et rien ne l'est après le refus.
    expect(await written(t, closed, alice)).toEqual(NOTHING)
  })

  it("admet son pays de résidence ouvert : la publication s'écrit avec sa portée et son pays ; la règle reçoit réseau, auteur, page, portée et pays", async () => {
    const t = testConvex()
    const { closed, alice } = await world(t, { governed: true })
    const { postId, created } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: closed, body: "Chez moi, à Lyon", reach: "local", country: "fr" })
    expect(created).toBe(true)
    expect(fakes.calls).toEqual([{ networkId: closed, authorPersonId: alice.personId, pageId: null, reach: "local", country: "FR", seen: NOTHING }])
    expect(await alice.as.query(api.modules.posts.posts.getPost, { networkId: closed, postId })).toMatchObject({ reach: "local", country: "FR" })
  })

  it("une publication de portée `diaspora` passe par la règle, qui la laisse passer : publiée, inchangée", async () => {
    const t = testConvex()
    const { closed, alice } = await world(t, { governed: true })
    fakes.open = new Set()
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: closed, body: "Pour toute la diaspora", reach: "diaspora", country: "CA" })
    expect(fakes.calls.map((call) => [call.reach, call.country])).toEqual([["diaspora", "CA"]])
    expect(await alice.as.query(api.modules.posts.posts.getPost, { networkId: closed, postId })).toMatchObject({ reach: "diaspora", country: "CA" })
  })

  it("le rejeu d'une clé rend la publication existante sans rappeler la règle, même si le pays a fermé depuis", async () => {
    const t = testConvex()
    const { closed, alice } = await world(t, { governed: true })
    const args = { networkId: closed, body: "Une fois", reach: "local", country: "FR", idempotencyKey: "placement-cle" }
    const first = await alice.as.mutation(api.modules.posts.posts.publish, args)
    fakes.open = new Set()
    expect(await alice.as.mutation(api.modules.posts.posts.publish, args)).toMatchObject({ postId: first.postId, created: false })
    expect(fakes.calls).toHaveLength(1)
  })

  it("un code hors de l'ensemble fermé n'arrive jamais à l'écran comme une règle, et n'écrit rien", async () => {
    const t = testConvex()
    const { closed, alice } = await world(t, { governed: true })
    fakes.answer = "hub_not_open"
    const error = await caught(alice.as.mutation(api.modules.posts.posts.publish, { networkId: closed, body: "Refusée", reach: "local", country: "FR" }))
    expect(error).not.toBeNull()
    expect(engineErrorRule(error)).toBeNull()
    expect(engineErrorCode(error)).toBeNull()
    expect(await written(t, closed, alice)).toEqual(NOTHING)
  })
})

describe("règle de placement : les autres écrivains qui choisissent un placement", () => {
  it("`pages.publishAsPage` passe la page à la règle : le pays de la page, ouvert, est admis ; fermé, refusé avant toute écriture", async () => {
    const t = testConvex()
    const { closed, alice } = await world(t, { governed: false })
    await t.run(async (ctx) => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", closed).eq("personId", alice.personId)).unique()
      if (membership) await ctx.db.patch(membership._id, { status: "verifiee" })
    })
    const lyon = await alice.as.mutation(api.modules.pages.pages.createPage, { networkId: closed, name: "Association de Lyon", ownerKind: "association", country: "FR" })
    const montreal = await alice.as.mutation(api.modules.pages.pages.createPage, { networkId: closed, name: "Association de Montréal", ownerKind: "association", country: "CA" })
    await t.run(async (ctx) => await ctx.db.patch(closed, { managedBy: "diaspora" }))
    const before = await written(t, closed, alice)
    expect(await ruleOf(alice.as.mutation(api.modules.pages.pages.publishAsPage, { networkId: closed, pageId: montreal.pageId, body: "Soirée à Montréal", reach: "local" }))).toBe("POST_PLACEMENT_COUNTRY_NOT_OPEN")
    expect(await written(t, closed, alice)).toEqual(before)
    const { postId } = await alice.as.mutation(api.modules.pages.pages.publishAsPage, { networkId: closed, pageId: lyon.pageId, body: "Soirée à Lyon", reach: "local" })
    expect(fakes.calls.map((call) => [call.pageId, call.reach, call.country, call.authorPersonId])).toEqual([
      [montreal.pageId, "local", "CA", alice.personId],
      [lyon.pageId, "local", "FR", alice.personId],
    ])
    expect(fakes.calls[0]?.seen).toEqual(before)
    expect(await alice.as.query(api.modules.posts.posts.getPost, { networkId: closed, postId })).toMatchObject({ reach: "local", country: "FR" })
  })

  it("`events.announce` : refusée avant toute écriture dans un autre pays, publiée dans le sien", async () => {
    const t = testConvex()
    const { closed, alice } = await world(t, { governed: true })
    const startAt = T0 + 24 * HOUR
    const { eventId } = await alice.as.mutation(api.modules.events.events.create, { networkId: closed, title: "Pique-nique", startAt, endAt: startAt + 2 * HOUR, timeZone: "Europe/Paris", idempotencyKey: "placement-evenement" })
    const before = await written(t, closed, alice)
    expect(await ruleOf(alice.as.mutation(api.modules.events.events.announce, { networkId: closed, eventId, audience: "public", reach: "local", country: "CA" }))).toBe("POST_PLACEMENT_NOT_OWN_COUNTRY")
    expect(fakes.calls[0]?.seen).toEqual(before)
    expect(await written(t, closed, alice)).toEqual(before)
    const announced = await alice.as.mutation(api.modules.events.events.announce, { networkId: closed, eventId, audience: "public", reach: "local", country: "FR" })
    expect(announced.created).toBe(true)
    expect(fakes.calls.map((call) => [call.reach, call.country, call.pageId])).toEqual([["local", "CA", null], ["local", "FR", null]])
  })
})

describe("règle de placement : sans gouvernance ni règle, rien ne change", () => {
  it("un réseau non gouverné n'appelle jamais la règle : la publication locale passe comme aujourd'hui", async () => {
    const t = testConvex()
    const { closed, alice } = await world(t, { governed: false })
    fakes.open = new Set()
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: closed, body: "Ailleurs", reach: "local", country: "CA" })
    expect(fakes.calls).toEqual([])
    expect(await alice.as.query(api.modules.posts.posts.getPost, { networkId: closed, postId })).toMatchObject({ reach: "local", country: "CA" })
  })

  it("un réseau gouverné dont la tranche n'a inscrit aucune règle (repli sûr, `null`) publie comme aujourd'hui", async () => {
    fakes.registry.diaspora = null
    const t = testConvex()
    const { closed, alice } = await world(t, { governed: true })
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: closed, body: "Ailleurs", reach: "local", country: "CA" })
    expect(fakes.calls).toEqual([])
    expect(await alice.as.query(api.modules.posts.posts.getPost, { networkId: closed, postId })).toMatchObject({ reach: "local", country: "CA" })
    // La forme du placement reste jugée par le domaine, avec ou sans règle.
    expect(await ruleOf(alice.as.mutation(api.modules.posts.posts.publish, { networkId: closed, body: "Sans pays", reach: "local" }))).toBe("POST_COUNTRY_REQUIRED")
  })
})
