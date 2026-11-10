// @vitest-environment edge-runtime
/** MP04 : recherche de vitrines sur toutes les fenêtres, gardes vivantes et curseurs fermés. */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { makeFunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { normalizeMarketplaceText } from "./marketplaceIndexFields"
import type { MarketplaceShopsArgs, MarketplaceShopsPage } from "./marketplaceShopsRead"

const NOW = Date.UTC(2026, 9, 21, 14)
const search = makeFunctionReference<"query", MarketplaceShopsArgs & { networkId: Id<"networks"> }, MarketplaceShopsPage>("modules/shops/marketplaceShops:search")
type T = ReturnType<typeof testConvex>

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); vi.stubEnv("FILE_GUARD", "off") })
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs() })

async function member(t: T, root: Id<"networks">, handle: string) {
  const as = t.withIdentity({ subject: `marketplace-shops-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  return { as, personId }
}

async function fixture() {
  const t = testConvex()
  const { root, testClosed: child } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const owner = await member(t, root, "marketplace-manager")
  const reader = await member(t, root, "marketplace-reader")
  await t.run(async ctx => {
    for (const networkId of [root, child]) await ctx.db.insert("shopNetworkPolicies", { networkId, storefront: "review", updatedAt: NOW })
    await ctx.db.insert("networkMemberships", { networkId: child, personId: owner.personId, status: "declaree", role: "member", joinedAt: NOW, statusChangedAt: NOW })
  })
  return { t, root, child, owner, reader }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

async function addShop(f: Fixture, index: number, options: { networkId?: Id<"networks">; visibility?: "network" | "root"; name?: string; ownerKind?: Doc<"pages">["ownerKind"] } = {}) {
  const networkId = options.networkId ?? f.root
  const visibility = options.visibility ?? "network"
  const handle = `marketplace-activity-${index}`
  const name = options.name ?? `Atelier ${index}`
  return await f.t.run(async ctx => {
    const pageId = await ctx.db.insert("pages", { networkId, handle, name, ownerKind: options.ownerKind ?? "company", trust: "community", trustRank: 1, visibility, onRoot: networkId === f.root || visibility === "root", status: "active", createdByPersonId: f.owner.personId, searchText: normalizeMarketplaceText(name), createdAt: NOW - index, updatedAt: NOW })
    const signatoryId = await ctx.db.insert("pageSignatories", { networkId, pageId, personId: f.owner.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const moderationId = await ctx.db.insert("moderationContentStates", { networkId, targetKind: "page", targetId: pageId, ownerPersonId: f.owner.personId, status: "published", createdAt: NOW, updatedAt: NOW })
    const shopId = await ctx.db.insert("shops", { networkId, pageId, preparedByPersonId: f.owner.personId, model: "products", storefront: "published", visibility, publishedAt: NOW - index * 1000, createdAt: NOW, updatedAt: NOW })
    return { pageId, shopId, signatoryId, moderationId, handle }
  })
}

function read(f: Fixture, args: Partial<MarketplaceShopsArgs> = {}, networkId = f.root) { return f.reader.as.query(search, { networkId, paginationOpts: { cursor: null, numItems: 24 }, ...args }) }
async function code(work: Promise<unknown>) { try { await work; return null } catch (error) { return engineErrorCode(error) } }

describe("MP04 — recherche complète des boutiques", () => {
  it("trouve par le moteur texte une vitrine hors de la première fenêtre de l'annuaire", async () => {
    const f = await fixture()
    for (let index = 1; index <= 30; index++) await addShop(f, index)
    const target = await addShop(f, 31, { name: "Orchidée créations" })
    expect((await read(f)).page).toHaveLength(24)
    expect((await read(f)).page.some(item => item.handle === target.handle)).toBe(false)
    expect((await read(f, { query: "orchidee" })).page.map(item => item.handle)).toEqual([target.handle])
    const first = await read(f, { paginationOpts: { cursor: null, numItems: 100 } })
    expect(first.page).toHaveLength(24)
    const next = await read(f, { paginationOpts: { cursor: first.continueCursor, numItems: 24 } })
    expect(next.page).toHaveLength(7)
    expect(next.isDone).toBe(true)
    expect(new Set([...first.page, ...next.page].map(item => item.handle)).size).toBe(31)
  })

  it.each([undefined, "atelier"])("conserve la continuation après une fenêtre entièrement modérée, query=%s", async query => {
    const f = await fixture()
    const shops: Array<Awaited<ReturnType<typeof addShop>>> = []
    for (let index = 1; index <= 30; index++) shops.push(await addShop(f, index))
    const original = await read(f, { query })
    expect(original.page).toHaveLength(24)
    const firstHandles = new Set(original.page.map(item => item.handle))
    await f.t.run(async ctx => {
      for (const shop of shops) if (firstHandles.has(shop.handle)) await ctx.db.patch(shop.moderationId, { status: "removed" })
    })
    const first = await read(f, { query })
    expect(first).toMatchObject({ page: [], isDone: false, filteredWindow: true })
    expect(first.continueCursor).not.toBe("")
    const next = await read(f, { query, paginationOpts: { cursor: first.continueCursor, numItems: 24 } })
    expect(next.page).toHaveLength(6)
    expect(next.page.every(item => !firstHandles.has(item.handle))).toBe(true)
    expect(next.isDone).toBe(true)
  })

  it("lie les curseurs au lecteur, au réseau, au mode et au texte normalisé", async () => {
    const f = await fixture()
    for (let index = 1; index <= 3; index++) await addShop(f, index, { name: `Élan atelier ${index}` })
    const first = await read(f, { query: " ÉLAN ", paginationOpts: { cursor: null, numItems: 1 } })
    expect((await read(f, { query: "elan", paginationOpts: { cursor: first.continueCursor, numItems: 1 } })).page).toHaveLength(1)
    expect(await code(read(f, { query: "atelier", paginationOpts: { cursor: first.continueCursor, numItems: 1 } }))).toBe("invalidArgument")
    expect(await code(read(f, { paginationOpts: { cursor: first.continueCursor, numItems: 1 } }))).toBe("invalidArgument")
    expect(await code(f.owner.as.query(search, { networkId: f.root, query: "elan", paginationOpts: { cursor: first.continueCursor, numItems: 1 } }))).toBe("invalidArgument")
    await f.t.run(async ctx => ctx.db.insert("networkMemberships", { networkId: f.child, personId: f.reader.personId, status: "declaree", role: "member", joinedAt: NOW, statusChangedAt: NOW }))
    expect(await code(read(f, { query: "elan", paginationOpts: { cursor: first.continueCursor, numItems: 1 } }, f.child))).toBe("invalidArgument")
    expect(await code(read(f, { paginationOpts: { cursor: '{"version":1,"scope":"forged","cursor":"raw","extra":1}', numItems: 1 } }))).toBe("invalidArgument")
    expect(await code(read(f, { query: "a ".repeat(17) }))).toBe("invalidArgument")
    expect(await code(read(f, { query: Array.from({ length: 17 }, () => "a").join("-") }))).toBe("invalidArgument")
    expect(await code(read(f, { query: "a".repeat(121) }))).toBe("invalidArgument")
    expect(await code(read(f, { paginationOpts: { cursor: null, numItems: 0 } }))).toBe("invalidArgument")
  })
})

describe("MP04 — gardes de l'annuaire en réseau", () => {
  it("garde les contextes racine/enfant et refuse l'origine ancienne ou archivée", async () => {
    const f = await fixture()
    const local = await addShop(f, 1)
    const privateChild = await addShop(f, 2, { networkId: f.child })
    const sharedChild = await addShop(f, 3, { networkId: f.child, visibility: "root" })
    expect(await code(read(f, {}, f.child))).toBe("notFound")
    await f.t.run(async ctx => ctx.db.insert("networkMemberships", { networkId: f.child, personId: f.reader.personId, status: "declaree", role: "member", joinedAt: NOW, statusChangedAt: NOW }))
    for (const query of [undefined, "atelier"]) {
      expect((await read(f, { query })).page.map(item => item.handle).sort()).toEqual([local.handle, sharedChild.handle].sort())
      expect((await read(f, { query }, f.child)).page.map(item => item.handle).sort()).toEqual([privateChild.handle, sharedChild.handle].sort())
    }
    await f.t.run(async ctx => ctx.db.patch(f.child, { parentId: undefined }))
    expect((await read(f)).page.map(item => item.handle)).toEqual([local.handle])
    expect((await read(f, { query: "atelier" })).page.map(item => item.handle)).toEqual([local.handle])
    await f.t.run(async ctx => ctx.db.patch(f.child, { parentId: f.root, status: "archived", archivedAt: NOW }))
    expect((await read(f)).page.map(item => item.handle)).toEqual([local.handle])
  })

  it("la carte porte la bannière de la page par la garde des fichiers, et null sans bannière", async () => {
    const f = await fixture()
    const illustrated = await addShop(f, 1)
    const plain = await addShop(f, 2)
    const storageId = await f.t.run(async ctx => {
      const id = await ctx.storage.store(new Blob([new Uint8Array(64)], { type: "image/png" }))
      await ctx.db.patch(illustrated.pageId, { bannerStorageId: id })
      return id
    })
    // Analyse en cours : la garde retient la bannière comme un fichier absent.
    const scanId = await f.t.run(async ctx => await ctx.db.insert("fileScans", { storageId, status: "pending", source: "page", attempts: 0, createdAt: NOW, updatedAt: NOW }))
    expect((await read(f)).page.find(item => item.handle === illustrated.handle)?.bannerUrl).toBeNull()
    await f.t.run(async ctx => { await ctx.db.patch(scanId, { status: "clean", updatedAt: NOW }) })
    const cards = (await read(f)).page
    expect(cards.find(item => item.handle === illustrated.handle)?.bannerUrl).toEqual(expect.any(String))
    expect(cards.find(item => item.handle === plain.handle)?.bannerUrl).toBeNull()
    expect(JSON.stringify(cards)).not.toContain(storageId)
  })

  it("la carte dit le gabarit effectif de la boutique : l'univers Alimentation et restauration la retrouve", async () => {
    const f = await fixture()
    const food = await addShop(f, 1)
    const general = await addShop(f, 2)
    await f.t.run(async ctx => { await ctx.db.patch(food.shopId, { activityConfiguration: { version: 1, capabilities: ["products"], template: "food", blocks: ["catalog", "publications", "about"] } }) })
    const cards = (await read(f)).page
    expect(cards.find(item => item.handle === food.handle)?.template).toBe("food")
    // Sans configuration enregistrée, le gabarit est celui du modèle historique (« Boutique généraliste »).
    expect(cards.find(item => item.handle === general.handle)?.template).toBe("general")
  })

  it("relit habilitation, suspension racine, état de page et politique à chaque lecture", async () => {
    const f = await fixture()
    const shop = await addShop(f, 1)
    const active = async () => (await read(f, { query: "atelier" })).page.map(item => item.handle)
    expect(await active()).toEqual([shop.handle])
    await f.t.run(async ctx => ctx.db.patch(shop.signatoryId, { acceptedAt: undefined }))
    expect(await active()).toEqual([])
    await f.t.run(async ctx => {
      await ctx.db.patch(shop.signatoryId, { acceptedAt: NOW })
      const member = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", f.root).eq("personId", f.owner.personId)).unique()
      await ctx.db.patch(member!._id, { status: "suspendue" })
    })
    expect(await active()).toEqual([])
    await f.t.run(async ctx => {
      const member = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", f.root).eq("personId", f.owner.personId)).unique()
      await ctx.db.patch(member!._id, { status: "declaree" })
      await ctx.db.patch(shop.pageId, { status: "inactive" })
    })
    expect(await active()).toEqual([])
    await f.t.run(async ctx => {
      await ctx.db.patch(shop.pageId, { status: "active" })
      const policy = await ctx.db.query("shopNetworkPolicies").withIndex("by_network", q => q.eq("networkId", f.root)).unique()
      await ctx.db.patch(policy!._id, { storefront: "closed" })
    })
    expect(await active()).toEqual([])
  })
})
