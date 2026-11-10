// @vitest-environment edge-runtime
/**
 * CM-10 — la boutique en pause : le geste du gérant (fermer temporairement, rouvrir maintenant), la vitrine qui
 * reste lisible, l'échéance lue à part (membre et public) et la réouverture seule, sans écriture à l'échéance.
 * Les gardes des engagements (préparation, paiement, services, candidature) sont éprouvées dans les tests de
 * leurs modules (`checkout`, `paymentFlow`, `services`, `jobApplications`).
 */
import { engineErrorAppRule, engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { exportableRecord } from "../people/dataInventory"
import { SHOP_PUBLIC_LISTING_TEXT_VERSION } from "./rules"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons"> }
const S = api.modules.shops.shops
const P = api.modules.public.shops
// 18 octobre 2026, 13 h à Libreville : « demain » est le 19, le plafond le 16 janvier 2027.
const NOW = Date.UTC(2026, 9, 18, 12)
const REOPEN_DAY = "2026-10-25"
const REOPENS_AT = Date.UTC(2026, 9, 24, 23)
const PAGE = { cursor: null, numItems: 20 }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

async function member(t: T, root: Id<"networks">, handle: string): Promise<Person> {
  const as = t.withIdentity({ subject: `shop-pause-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  return { as, personId }
}

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const owner = await member(t, root, "pause-gerante")
  const reader = await member(t, root, "pause-lecteur")
  await t.run(async (ctx) => { await ctx.db.insert("shopNetworkPolicies", { networkId: root, storefront: "review", updatedAt: Date.now() }) })
  return { t, root, owner, reader }
}

async function publishedShop(t: T, networkId: Id<"networks">, owner: Person, handle: string, extra: Partial<Doc<"shops">> = {}) {
  return await t.run(async (ctx) => {
    const now = Date.now()
    const pageId = await ctx.db.insert("pages", {
      networkId, handle, name: `Activité ${handle}`, description: "Une présentation commerciale suffisamment complète.",
      ownerKind: "company", trust: "community", trustRank: 1, visibility: "network", onRoot: true,
      status: "active", createdByPersonId: owner.personId, searchText: handle, createdAt: now, updatedAt: now,
    })
    await ctx.db.insert("pageSignatories", { networkId, pageId, personId: owner.personId, role: "admin", acceptedAt: now, createdAt: now, updatedAt: now })
    const shopId = await ctx.db.insert("shops", {
      networkId, pageId, preparedByPersonId: owner.personId, model: "products", storefront: "published", visibility: "network",
      publicConsentAt: now, publicConsentTextVersion: SHOP_PUBLIC_LISTING_TEXT_VERSION, publicConsentByPersonId: owner.personId,
      publishedAt: now, createdAt: now, updatedAt: now, ...extra,
    })
    return { pageId, shopId, handle }
  })
}

async function caught(work: Promise<unknown>): Promise<unknown> {
  try { await work; return null } catch (error) { return error }
}

async function shopRow(t: T, shopId: Id<"shops">) {
  return await t.run(async (ctx) => ctx.db.get(shopId))
}

describe("CM-10 — fermer temporairement, rouvrir maintenant", () => {
  it("le gérant ferme jusqu'au jour choisi (minuit à Libreville) ; le même jour n'écrit rien, un autre le remplace", async () => {
    const f = await fixture()
    const shop = await publishedShop(f.t, f.root, f.owner, "pause-geste")
    expect(await f.owner.as.mutation(S.pauseStorefront, { networkId: f.root, shopId: shop.shopId, reopenDay: REOPEN_DAY })).toEqual({ pausedUntil: REOPENS_AT })
    const paused = await shopRow(f.t, shop.shopId)
    expect(paused).toMatchObject({ pausedUntil: REOPENS_AT, storefront: "published", updatedAt: NOW })
    vi.setSystemTime(NOW + 1000)
    expect(await f.owner.as.mutation(S.pauseStorefront, { networkId: f.root, shopId: shop.shopId, reopenDay: REOPEN_DAY })).toEqual({ pausedUntil: REOPENS_AT })
    expect((await shopRow(f.t, shop.shopId))?.updatedAt).toBe(NOW)
    expect(await f.owner.as.mutation(S.pauseStorefront, { networkId: f.root, shopId: shop.shopId, reopenDay: "2026-11-02" })).toEqual({ pausedUntil: Date.UTC(2026, 10, 1, 23) })
    expect(await f.owner.as.query(S.getMyShop, { networkId: f.root, shopId: shop.shopId })).toMatchObject({ pausedUntil: Date.UTC(2026, 10, 1, 23) })
  })

  it("borne le jour : au plus tôt demain, au plus 90 jours, un jour bien formé", async () => {
    const f = await fixture()
    const shop = await publishedShop(f.t, f.root, f.owner, "pause-bornes")
    const pause = (reopenDay: string) => caught(f.owner.as.mutation(S.pauseStorefront, { networkId: f.root, shopId: shop.shopId, reopenDay }))
    expect(engineErrorRule(await pause("2026-10-18"))).toEqual({ rule: "SHOP_PAUSE_END_PAST", params: {} })
    expect(engineErrorRule(await pause("2027-01-17"))).toEqual({ rule: "SHOP_PAUSE_TOO_LONG", params: { days: 90 } })
    expect(engineErrorCode(await pause("25/10/2026"))).toBe("invalidArgument")
    expect(engineErrorRule(await pause("25/10/2026"))).toBeNull()
    expect(await pause("2026-10-19")).toBeNull()
    expect(await pause("2027-01-16")).toBeNull()
  })

  it("seuls les gérants vivants la ferment ou la rouvrent ; tout autre reçoit le refus indistinct", async () => {
    const f = await fixture()
    const shop = await publishedShop(f.t, f.root, f.owner, "pause-droits")
    expect(engineErrorCode(await caught(f.reader.as.mutation(S.pauseStorefront, { networkId: f.root, shopId: shop.shopId, reopenDay: REOPEN_DAY })))).toBe("notFound")
    await f.owner.as.mutation(S.pauseStorefront, { networkId: f.root, shopId: shop.shopId, reopenDay: REOPEN_DAY })
    expect(engineErrorCode(await caught(f.reader.as.mutation(S.resumeStorefront, { networkId: f.root, shopId: shop.shopId })))).toBe("notFound")
    expect((await shopRow(f.t, shop.shopId))?.pausedUntil).toBe(REOPENS_AT)
  })

  it("seule une vitrine publiée se ferme temporairement", async () => {
    const f = await fixture()
    const { shopId } = await f.owner.as.mutation(S.startShop, { networkId: f.root, model: "products", name: "Atelier en préparation" })
    expect(engineErrorAppRule(await caught(f.owner.as.mutation(S.pauseStorefront, { networkId: f.root, shopId, reopenDay: REOPEN_DAY })))?.appRule).toBe("shop_state_invalid")
    expect((await shopRow(f.t, shopId))?.pausedUntil).toBeUndefined()
  })

  it("rouvrir maintenant efface la pause ; sans pause, rien n'est écrit", async () => {
    const f = await fixture()
    const shop = await publishedShop(f.t, f.root, f.owner, "pause-reouverture")
    await f.owner.as.mutation(S.pauseStorefront, { networkId: f.root, shopId: shop.shopId, reopenDay: REOPEN_DAY })
    expect(await f.owner.as.mutation(S.resumeStorefront, { networkId: f.root, shopId: shop.shopId })).toEqual({ resumed: true })
    expect((await shopRow(f.t, shop.shopId))?.pausedUntil).toBeUndefined()
    expect(await f.owner.as.query(S.getMyShop, { networkId: f.root, shopId: shop.shopId })).not.toHaveProperty("pausedUntil")
    expect(await f.owner.as.mutation(S.resumeStorefront, { networkId: f.root, shopId: shop.shopId })).toEqual({ resumed: false })
    expect(await f.reader.as.query(S.storefrontPause, { networkId: f.root, handle: shop.handle, now: Date.now() })).toBeNull()
  })
})

describe("CM-10 — la vitrine reste lisible ; l'échéance se lit à part et la boutique rouvre seule", () => {
  it("vitrine, annuaire et favoris inchangés ; le bandeau du membre lit l'échéance, puis plus rien à l'échéance", async () => {
    const f = await fixture()
    const shop = await publishedShop(f.t, f.root, f.owner, "pause-lisible")
    await f.owner.as.mutation(S.pauseStorefront, { networkId: f.root, shopId: shop.shopId, reopenDay: REOPEN_DAY })
    const storefront = await f.reader.as.query(S.storefront, { networkId: f.root, handle: shop.handle })
    expect(storefront).toMatchObject({ handle: shop.handle })
    expect(storefront).not.toHaveProperty("pausedUntil")
    expect((await f.reader.as.query(S.directory, { networkId: f.root, paginationOpts: PAGE })).page.map((card) => card.handle)).toContain(shop.handle)
    expect(await f.reader.as.query(S.storefrontPause, { networkId: f.root, handle: shop.handle, now: NOW })).toEqual({ pausedUntil: REOPENS_AT })
    // À l'échéance (instant fourni par l'écran), la boutique est ouverte : aucune écriture, la ligne garde son échéance passée.
    expect(await f.reader.as.query(S.storefrontPause, { networkId: f.root, handle: shop.handle, now: REOPENS_AT })).toBeNull()
    expect((await shopRow(f.t, shop.shopId))?.pausedUntil).toBe(REOPENS_AT)
  })

  it("le même `null` pour une boutique ouverte, inconnue ou illisible", async () => {
    const f = await fixture()
    const open = await publishedShop(f.t, f.root, f.owner, "pause-ouverte")
    const withdrawn = await publishedShop(f.t, f.root, f.owner, "pause-retiree", { pausedUntil: REOPENS_AT })
    await f.t.run(async (ctx) => { await ctx.db.patch(withdrawn.shopId, { storefront: "withdrawn" }) })
    for (const handle of [open.handle, withdrawn.handle, "pause-inconnue"]) {
      expect(await f.reader.as.query(S.storefrontPause, { networkId: f.root, handle, now: NOW }), handle).toBeNull()
    }
  })

  it("projection publique À PART : la vitrine stricte garde ses clés, l'échéance a sa propre porte", async () => {
    const f = await fixture()
    const shop = await publishedShop(f.t, f.root, f.owner, "pause-publique")
    const before = await f.t.query(P.getStorefront, { networkId: f.root, handle: shop.handle })
    await f.owner.as.mutation(S.pauseStorefront, { networkId: f.root, shopId: shop.shopId, reopenDay: REOPEN_DAY })
    const during = await f.t.query(P.getStorefront, { networkId: f.root, handle: shop.handle })
    expect(Object.keys(during!).sort()).toEqual(Object.keys(before!).sort())
    expect(during).not.toHaveProperty("pausedUntil")
    expect(await f.t.query(P.getStorefrontPause, { networkId: f.root, handle: shop.handle, now: NOW })).toEqual({ version: 1, pausedUntil: REOPENS_AT })
    expect(await f.t.query(P.getStorefrontPause, { networkId: f.root, handle: shop.handle, now: REOPENS_AT })).toBeNull()
    // Sans consentement de diffusion publique, la porte publique ne dit rien, comme la vitrine.
    await f.t.run(async (ctx) => { await ctx.db.patch(shop.shopId, { publicConsentRevokedAt: Date.now() }) })
    expect(await f.t.query(P.getStorefrontPause, { networkId: f.root, handle: shop.handle, now: NOW })).toBeNull()
  })

  it("l'échéance est une donnée de l'activité : l'export du préparateur d'une boutique portée par une page ne la contient pas", async () => {
    const f = await fixture()
    const shop = await publishedShop(f.t, f.root, f.owner, "pause-export", { pausedUntil: REOPENS_AT })
    const row = await shopRow(f.t, shop.shopId)
    const exported = exportableRecord("shops", row as unknown as Parameters<typeof exportableRecord>[1], f.owner.personId)
    expect(exported).not.toBeNull()
    expect(exported).not.toHaveProperty("pausedUntil")
  })
})
