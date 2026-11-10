// @vitest-environment edge-runtime
// Dupliqué de socle/convex/modules/reseauPersonnel/suggestions.test.ts @ ad2e7fdc2 — adaptations : personnes et réseaux (graine des fondations) ; codes au lieu des libellés ; poste et organisation remplacés par le titre ; listes paginées ; tests neufs : réseau gouverné refusé, masquage propre au réseau.
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { syncPersonDirectory } from "../people/directory"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }

const SG = api.modules.suggestions.suggestions

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(Date.UTC(2026, 9, 15, 16, 0, 0))
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

type CatalogPage = { page: { handle: string; relationState: string; dismissed: boolean }[]; continueCursor: string; isDone: boolean }

/** Tout le catalogue, page après page, jusqu'au bout. */
async function catalog(reader: Person, networkId: Id<"networks">, options: { numItems?: number; includeDismissed?: boolean } = {}) {
  const items: CatalogPage["page"] = []
  let cursor: string | null = null
  for (let pages = 0; pages < 40; pages += 1) {
    const page: CatalogPage = await reader.as.query(SG.paginate, { networkId, paginationOpts: { numItems: options.numItems ?? 50, cursor }, ...(options.includeDismissed !== undefined ? { includeDismissed: options.includeDismissed } : {}) })
    items.push(...page.page)
    if (page.isDone) break
    cursor = page.continueCursor
  }
  return items
}

const handles = async (reader: Person, networkId: Id<"networks">, options?: { numItems?: number; includeDismissed?: boolean }) => (await catalog(reader, networkId, options)).map((item) => item.handle).sort()

describe("catalogue des suggestions — pagination", () => {
  it("suit ses pages jusqu'au bout sans perdre personne, les arrivées récentes d'abord", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const me = await enter(t, root, "moi")
    const others: Person[] = []
    for (let index = 0; index < 12; index += 1) others.push(await enter(t, root, `membre${index}`))
    const read = await catalog(me, root, { numItems: 5 })
    expect(read.map((item) => item.handle)).toEqual(others.map((person) => person.handle).reverse())
  })

  it("une page filtrée reste une page : la suite arrive, elle n'est pas perdue", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const me = await enter(t, root, "moi")
    const others: Person[] = []
    for (let index = 0; index < 10; index += 1) others.push(await enter(t, root, `membre${index}`))
    // Les plus récents sont des connexions : les premières pages se vident.
    for (const person of others.slice(5)) await connect(t, root, me, person)
    expect(await handles(me, root, { numItems: 3 })).toEqual(others.slice(0, 5).map((person) => person.handle).sort())
  })
})

describe("catalogue des suggestions — filtres", () => {
  it("jamais soi, jamais une connexion, jamais un suivi, jamais un blocage dans un sens ou l'autre", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const me = await enter(t, root, "moi")
    const friend = await enter(t, root, "amie")
    const followed = await enter(t, root, "suivi")
    const blockedByMe = await enter(t, root, "bloque")
    const blockingMe = await enter(t, root, "bloqueuse")
    const stranger = await enter(t, root, "inconnu")
    await connect(t, root, me, friend)
    await me.as.mutation(api.modules.graph.follows.follow, { networkId: root, handle: "suivi" })
    await me.as.mutation(api.modules.graph.connections.blockPerson, { networkId: root, targetPersonId: blockedByMe.personId })
    await blockingMe.as.mutation(api.modules.graph.connections.blockPerson, { networkId: root, targetPersonId: me.personId })
    expect(await handles(me, root)).toEqual(["inconnu"])
    expect([friend, followed, stranger].length).toBe(3)
  })

  it("la carte est allowlistée — ni état civil, ni identifiant de stockage", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const me = await enter(t, root, "moi")
    await enter(t, root, "autre")
    const [item] = await catalog(me, root)
    expect(Object.keys(item!).sort()).toEqual(["avatarUrl", "dismissed", "displayName", "followsYou", "handle", "headline", "personId", "relationState"])
  })

  it("une personne qui me suit se dit `followsYou` — jamais l'inverse, jamais une autre (ADR-0037)", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const me = await enter(t, root, "moi")
    const fan = await enter(t, root, "fan")
    await enter(t, root, "inconnu")
    await fan.as.mutation(api.modules.graph.follows.follow, { networkId: root, handle: "moi" })
    const items = await catalog(me, root)
    expect(items.map((item) => [item.handle, (item as { followsYou?: boolean }).followsYou]).sort()).toEqual([["fan", true], ["inconnu", false]])
    // Côté de celle qui suit : la personne suivie quitte son catalogue ; l'inconnue ne la suit pas.
    expect(await catalog(fan, root)).toMatchObject([{ handle: "inconnu", followsYou: false }])
  })

  it("un réseau gouverné par une tranche sert ses propres suggestions : le catalogue générique est refusé", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const me = await enter(t, root, "moi")
    await t.run(async (ctx) => {
      await ctx.db.patch(testClosed, { managedBy: "diaspora" })
      await ctx.db.insert("networkMemberships", { networkId: testClosed, personId: me.personId, status: "declaree", role: "member", joinedAt: 1, statusChangedAt: 1 })
    })
    expect(await codeOf(me.as.query(SG.paginate, { networkId: testClosed, paginationOpts: { numItems: 10, cursor: null } }))).toBe("policyRefused")
  })
})

describe("masquage d'une suggestion", () => {
  it("la liste générique des suggestions masquées refuse un réseau devenu gouverné, même pour un masquage déjà connu", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const me = await enter(t, root, "moi")
    const other = await enter(t, root, "autre")
    await t.run(async (ctx) => {
      for (const person of [me, other]) await ctx.db.insert("networkMemberships", { networkId: testClosed, personId: person.personId, status: "declaree", role: "member", directoryListed: false, joinedAt: 1, statusChangedAt: 1 })
      await ctx.db.insert("suggestionDismissals", { networkId: testClosed, personId: me.personId, dismissedPersonId: other.personId, createdAt: Date.now() })
    })
    const args = { networkId: testClosed, paginationOpts: { numItems: 10, cursor: null } }
    expect((await me.as.query(SG.paginateDismissed, args)).page).toMatchObject([{ targetPersonId: other.personId, handle: "autre" }])
    await t.run(async (ctx) => await ctx.db.patch(testClosed, { managedBy: "diaspora" }))
    expect(await codeOf(me.as.query(SG.paginateDismissed, args))).toBe("policyRefused")
    // Le masquage n'est pas effacé : sa lecture appartient désormais à la tranche.
    expect(await t.run(async (ctx) => (await ctx.db.query("suggestionDismissals").withIndex("by_network_person_createdAt", (q) => q.eq("networkId", testClosed).eq("personId", me.personId)).take(5)).length)).toBe(1)
  })

  it("survit au rechargement, se liste, se lève ; `includeDismissed` la rend avec son drapeau", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const me = await enter(t, root, "moi")
    const other = await enter(t, root, "autre")
    expect(await me.as.mutation(SG.dismiss, { networkId: root, handle: "autre" })).toEqual({ targetPersonId: other.personId, dismissed: true })
    expect(await handles(me, root)).toEqual([])
    expect((await catalog(me, root, { includeDismissed: true })).map((item) => ({ handle: item.handle, dismissed: item.dismissed }))).toEqual([{ handle: "autre", dismissed: true }])
    expect((await me.as.query(SG.paginateDismissed, { networkId: root, paginationOpts: { numItems: 10, cursor: null } })).page).toMatchObject([{ targetPersonId: other.personId, handle: "autre" }])
    expect(await me.as.mutation(SG.restore, { networkId: root, targetPersonId: other.personId })).toEqual({ restored: true })
    expect(await handles(me, root)).toEqual(["autre"])
  })

  it("masquer deux fois n'écrit qu'une ligne ; restaurer ce qui ne l'était pas rend `false` ; un identifiant inconnu se refuse", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const me = await enter(t, root, "moi")
    const other = await enter(t, root, "autre")
    await me.as.mutation(SG.dismiss, { networkId: root, handle: "autre" })
    await me.as.mutation(SG.dismiss, { networkId: root, handle: "autre" })
    expect(await t.run(async (ctx) => (await ctx.db.query("suggestionDismissals").withIndex("by_network_person_createdAt", (q) => q.eq("networkId", root).eq("personId", me.personId)).take(5)).length)).toBe(1)
    await me.as.mutation(SG.restore, { networkId: root, targetPersonId: other.personId })
    expect(await me.as.mutation(SG.restore, { networkId: root, targetPersonId: other.personId })).toEqual({ restored: false })
    expect(await codeOf(me.as.mutation(SG.dismiss, { networkId: root, handle: "inconnu" }))).toBe("notFound")
    expect(await codeOf(me.as.mutation(SG.dismiss, { networkId: root, handle: "moi" }))).toBe("invalidArgument")
  })

  it("le masquage est PROPRE à l'appelant et à son réseau", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const me = await enter(t, root, "moi")
    const other = await enter(t, root, "autre")
    const third = await enter(t, root, "tiers")
    for (const person of [me, other]) {
      await t.run(async (ctx) => {
        await ctx.db.insert("networkMemberships", { networkId: testClosed, personId: person.personId, status: "declaree", role: "member", joinedAt: 1, statusChangedAt: 1 })
        await syncPersonDirectory(ctx, person.personId)
      })
    }
    await me.as.mutation(SG.dismiss, { networkId: root, handle: "autre" })
    expect(await handles(third, root)).toEqual(["autre", "moi"])
    expect(await handles(me, testClosed)).toEqual(["autre"])
  })
})

describe("état relationnel et invitations envoyées", () => {
  it("un membre en attente relit ses demandes envoyées, sans ouvrir le droit d'en émettre une autre", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const me = await enter(t, root, "moi")
    const other = await enter(t, root, "autre")
    await me.as.mutation(api.modules.graph.connections.requestConnection, { networkId: root, handle: other.handle })
    const row = await t.run(async (ctx) => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", root).eq("personId", me.personId)).unique()
      if (!membership) throw new Error("Adhésion de test absente")
      await ctx.db.patch(membership._id, { status: "en_attente" })
      return await ctx.db.query("connections").withIndex("by_network_requester_status", (q) => q.eq("networkId", root).eq("requestedByPersonId", me.personId).eq("status", "requested")).unique()
    })

    const sent = await me.as.query(SG.paginateSentInvitations, { networkId: root, paginationOpts: { numItems: 1, cursor: null } })
    expect(sent.page).toMatchObject([{ connectionId: row!._id, otherPersonId: other.personId, at: row!.requestedAt }])
    expect(await codeOf(me.as.mutation(api.modules.graph.connections.requestConnection, { networkId: root, handle: other.handle }))).toBe("statusInsufficient")
  })

  it("une demande sortante se dit « requested_by_me » chez le demandeur, « requested_by_them » chez le destinataire ; acceptée, elle sort du catalogue", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const me = await enter(t, root, "moi")
    const other = await enter(t, root, "autre")
    await me.as.mutation(api.modules.graph.connections.requestConnection, { networkId: root, handle: "autre" })
    expect(await catalog(me, root)).toMatchObject([{ handle: "autre", relationState: "requested_by_me" }])
    expect(await catalog(other, root)).toMatchObject([{ handle: "moi", relationState: "requested_by_them" }])
    const connectionId = await t.run(async (ctx) => (await ctx.db.query("connections").first())!._id)
    await other.as.mutation(api.modules.graph.connections.respondToConnection, { networkId: root, connectionId, accept: true })
    expect(await catalog(me, root)).toEqual([])
  })

  it("liste MES demandes sortantes, jamais celles reçues ; acceptée, elle quitte la liste", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const me = await enter(t, root, "moi")
    const target = await enter(t, root, "cible")
    const asker = await enter(t, root, "demandeuse")
    await me.as.mutation(api.modules.graph.connections.requestConnection, { networkId: root, handle: "cible" })
    await asker.as.mutation(api.modules.graph.connections.requestConnection, { networkId: root, handle: "moi" })
    const sent = async () => (await me.as.query(SG.paginateSentInvitations, { networkId: root, paginationOpts: { numItems: 10, cursor: null } })).page
    expect(await sent()).toMatchObject([{ otherPersonId: target.personId, handle: "cible" }])
    const connectionId = await t.run(async (ctx) => (await ctx.db.query("connections").withIndex("by_network_recipient_status", (q) => q.eq("networkId", root).eq("recipientPersonId", target.personId).eq("status", "requested")).first())!._id)
    await target.as.mutation(api.modules.graph.connections.respondToConnection, { networkId: root, connectionId, accept: true })
    expect(await sent()).toEqual([])
  })
})
