// @vitest-environment edge-runtime
/**
 * Pages d'un hub pays et compteurs matérialisés des pages (DIASPORALE DG-007) :
 * listes bornées par nature, garde de lecture des pages, revendicabilité pour le
 * lecteur, refus indistinct hors du réseau gouverné, et comptage nocturne des
 * associations et des entreprises — jamais à la lecture.
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { HUB_PAGES_PER_KIND, HUB_PAGES_SCAN, isPageOrphan } from "./hubPages"

type T = ReturnType<typeof testConvex>
type PageFields = { ownerKind: Doc<"pages">["ownerKind"]; trust?: Doc<"pages">["trust"]; status?: Doc<"pages">["status"]; country?: string | null; handle?: string; createdAt?: number }

const NOW = Date.UTC(2026, 9, 18, 10)
const HP = api.modules.diaspora.hubPages

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  const reader = await member(t, network, "lecteur")
  return { t, root, network, reader }
}

/** Un membre DÉCLARÉ de DIASPORALE (IDN de garantie 1, nationalité gabonaise). */
async function member(t: T, networkId: Id<"networks">, handle: string) {
  const as = t.withIdentity({ subject: `auth-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await t.run(async (ctx) => {
    await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `idn-${personId}`, loa: 1, nationality: "GA", linkedAt: NOW })
  })
  await as.mutation(api.modules.diaspora.membership.joinDiasporale, { networkId, facet: { countryOfResidence: "FR" } })
  return { as, personId }
}

let sequence = 0

/** Une page posée telle quelle (pays FR, active, « communauté » par défaut). */
async function page(t: T, networkId: Id<"networks">, fields: PageFields): Promise<Id<"pages">> {
  sequence += 1
  const trust = fields.trust ?? "community"
  const handle = fields.handle ?? `page-test-${sequence}`
  const country = fields.country === undefined ? "FR" : fields.country
  return await t.run(async (ctx) =>
    ctx.db.insert("pages", {
      networkId,
      handle,
      name: `Page ${handle}`,
      description: `Description de ${handle}`,
      ownerKind: fields.ownerKind,
      trust,
      trustRank: trust === "official" ? 2 : trust === "verified" ? 1 : 0,
      ...(country === null ? {} : { country }),
      visibility: "network",
      onRoot: false,
      status: fields.status ?? "active",
      searchText: handle,
      createdAt: fields.createdAt ?? NOW + sequence,
      updatedAt: NOW + sequence,
    }),
  )
}

async function removedByModeration(t: T, networkId: Id<"networks">, pageId: Id<"pages">) {
  await t.run(async (ctx) => {
    await ctx.db.insert("moderationContentStates", { networkId, targetKind: "page", targetId: pageId, status: "removed", createdAt: NOW, updatedAt: NOW })
  })
}

async function admin(t: T, networkId: Id<"networks">, pageId: Id<"pages">, personId: Id<"persons">, accepted = true) {
  await t.run(async (ctx) => {
    await ctx.db.insert("pageSignatories", { networkId, pageId, personId, role: "admin", ...(accepted ? { acceptedAt: NOW } : {}), createdAt: NOW, updatedAt: NOW })
  })
}

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    return engineErrorCode(error)
  }
  return null
}

describe("listCountryPages — les pages publiées et lisibles d'un pays", () => {
  it("rend les pages actives du pays par nature, chacune repassée par la garde des pages", async () => {
    const { t, root, network, reader } = await fixture()
    await page(t, network, { ownerKind: "institution", trust: "official", handle: "poste-officiel" })
    const association = await page(t, network, { ownerKind: "association", handle: "association-lyon" })
    await page(t, network, { ownerKind: "company", trust: "verified", handle: "traiteur-paris" })
    await page(t, network, { ownerKind: "media", handle: "media-diaspora" })
    await page(t, network, { ownerKind: "association", handle: "association-bruxelles", country: "BE" })
    await page(t, network, { ownerKind: "association", handle: "association-retiree", status: "inactive" })
    await page(t, network, { ownerKind: "association", handle: "association-sans-pays", country: null })
    await removedByModeration(t, network, await page(t, network, { ownerKind: "association", handle: "association-moderee" }))
    await page(t, root, { ownerKind: "association", handle: "association-de-la-racine" })

    await reader.as.mutation(api.modules.pages.pages.follow, { networkId: network, handle: "association-lyon" })
    const view = await reader.as.query(HP.listCountryPages, { networkId: network, country: "fr" })

    expect(view.country).toBe("FR")
    expect(view.officialPages.map((row) => row.handle)).toEqual(["poste-officiel"])
    expect(view.associations.map((row) => row.handle)).toEqual(["association-lyon"])
    expect(view.companies.map((row) => row.handle)).toEqual(["traiteur-paris"])
    expect(view.more).toEqual({ officialPages: false, associations: false, companies: false })
    expect(view.associations[0]).toEqual({
      pageId: association,
      networkId: network,
      handle: "association-lyon",
      name: "Page association-lyon",
      shortName: null,
      logoUrl: null,
      badge: "community",
      ownerKind: "association",
      country: "FR",
      city: null,
      associationType: null,
      sector: null,
      description: "Description de association-lyon",
      // Compté par l'agrégat du moteur, jamais deviné.
      followerCount: 1,
      claimable: true,
    })
    expect(view.officialPages[0]).toMatchObject({ badge: "official", claimable: false })
    expect(view.companies[0]).toMatchObject({ badge: "verified", claimable: false })
  })

  it("borne chaque liste et dit qu'il en reste, sans rien compter", async () => {
    const { t, network, reader } = await fixture()
    for (let index = 0; index <= HUB_PAGES_PER_KIND; index += 1) await page(t, network, { ownerKind: "association" })
    await page(t, network, { ownerKind: "company" })
    const view = await reader.as.query(HP.listCountryPages, { networkId: network, country: "FR" })
    expect(view.associations).toHaveLength(HUB_PAGES_PER_KIND)
    expect(view.companies).toHaveLength(1)
    expect(view.more).toEqual({ officialPages: false, associations: true, companies: false })
  })

  it("une fenêtre arrêtée avant la fin du pays le dit pour chaque liste", async () => {
    const { t, network, reader } = await fixture()
    // La plus ancienne : hors de la fenêtre de l'index (confiance égale, récence d'abord).
    await page(t, network, { ownerKind: "association", handle: "association-ancienne", createdAt: NOW - 1000 })
    await t.run(async (ctx) => {
      for (let index = 0; index <= HUB_PAGES_SCAN; index += 1) {
        await ctx.db.insert("pages", {
          networkId: network, handle: `media-${index}`, name: `Média ${index}`, ownerKind: "media", trust: "community", trustRank: 0,
          country: "FR", visibility: "network", onRoot: false, status: "active", searchText: `media ${index}`, createdAt: NOW + index, updatedAt: NOW + index,
        })
      }
    })
    const view = await reader.as.query(HP.listCountryPages, { networkId: network, country: "FR" })
    expect(view.associations).toEqual([])
    expect(view.more).toEqual({ officialPages: true, associations: true, companies: true })
  })

  it("refuse indistinctement un pays hors diaspora, un autre réseau et une personne hors du réseau", async () => {
    const { t, root, network, reader } = await fixture()
    expect(await codeOf(reader.as.query(HP.listCountryPages, { networkId: network, country: "GA" }))).toBe("notFound")
    expect(await codeOf(reader.as.query(HP.listCountryPages, { networkId: network, country: "ZZ" }))).toBe("notFound")
    expect(await codeOf(reader.as.query(HP.listCountryPages, { networkId: root, country: "FR" }))).toBe("notFound")
    const outsider = t.withIdentity({ subject: "auth-dehors" })
    await outsider.mutation(api.modules.people.persons.ensureMyPerson, {})
    expect(await codeOf(outsider.query(HP.listCountryPages, { networkId: network, country: "FR" }))).not.toBeNull()
    expect(await codeOf(outsider.query(HP.pageStanding, { networkId: network, handle: "nimporte" }))).not.toBeNull()
  })
})

describe("pageStanding — la revendicabilité, pour CE lecteur", () => {
  it("suit la règle du moteur et celle de DIASPORALE", async () => {
    const { t, network, reader } = await fixture()
    const owner = await member(t, network, "responsable")
    const held = await page(t, network, { ownerKind: "association", handle: "association-tenue" })
    await admin(t, network, held, owner.personId)
    const invited = await page(t, network, { ownerKind: "association", handle: "association-invitee" })
    await admin(t, network, invited, owner.personId, false)
    await page(t, network, { ownerKind: "association", handle: "association-libre" })
    await page(t, network, { ownerKind: "company", trust: "verified", handle: "entreprise-verifiee" })
    await page(t, network, { ownerKind: "institution", handle: "institution-communaute" })
    await page(t, network, { ownerKind: "association", handle: "association-inactive", status: "inactive" })

    const standing = (handle: string, as = reader.as) => as.query(HP.pageStanding, { networkId: network, handle })
    expect(await standing("association-libre")).toEqual({ claimable: true, orphan: true })
    // Une invitation non acceptée ne tient pas la page.
    expect(await standing("association-invitee")).toEqual({ claimable: true, orphan: true })
    // Tenue par un administrateur vivant : les autres ne la revendiquent pas ; lui en demande la vérification.
    expect(await standing("association-tenue")).toEqual({ claimable: false, orphan: false })
    expect(await standing("association-tenue", owner.as)).toEqual({ claimable: true, orphan: false })
    // Vérifiée sans administrateur : sans responsable, mais pas revendicable (le bandeau mène au contact).
    expect(await standing("entreprise-verifiee")).toEqual({ claimable: false, orphan: true })
    // Une institution n'est jamais « sans responsable » : sa reprise passe par la console.
    expect(await standing("institution-communaute")).toEqual({ claimable: false, orphan: false })
    // Inconnue ou retirée : le même `null` que la fiche.
    expect(await standing("association-inactive")).toBeNull()
    expect(await standing("page-inconnue")).toBeNull()
  })
})

describe("AS-11a — pageStanding.orphan : la page sans responsable", () => {
  it("aucun administrateur VIVANT, page native, hors institution — un booléen, jamais l'équipe", async () => {
    const { t, network, reader } = await fixture()
    const owner = await member(t, network, "responsable-orphelin")
    const editor = await member(t, network, "editeur-orphelin")
    const standing = (handle: string) => reader.as.query(HP.pageStanding, { networkId: network, handle })

    // Un éditeur et une modératrice ne tiennent pas la page : seule l'administration compte.
    const edited = await page(t, network, { ownerKind: "association", handle: "association-editee" })
    await t.run(async (ctx) => {
      await ctx.db.insert("pageSignatories", { networkId: network, pageId: edited, personId: editor.personId, role: "signatory", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
      await ctx.db.insert("pageSignatories", { networkId: network, pageId: edited, personId: reader.personId, role: "moderator", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    })
    expect(await standing("association-editee")).toEqual({ claimable: true, orphan: true })

    // Un administrateur parti du réseau ne la tient plus.
    const left = await page(t, network, { ownerKind: "company", handle: "entreprise-quittee" })
    await admin(t, network, left, owner.personId)
    expect((await standing("entreprise-quittee"))?.orphan).toBe(false)
    await t.run(async (ctx) => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", network).eq("personId", owner.personId)).unique()
      if (membership) await ctx.db.patch(membership._id, { status: "suspendue" })
    })
    expect((await standing("entreprise-quittee"))?.orphan).toBe(true)

    // Un reflet reste sous l'autorité de sa source : jamais « sans responsable » ici.
    const mirrored = await page(t, network, { ownerKind: "association", handle: "association-refletee" })
    await t.run(async (ctx) => {
      const emitterId = await ctx.db.insert("federationEmitters", { networkId: network, slug: "source-orphelin", environment: "sandbox", enabled: true, keyEnvName: "TEST_ONLY_KEY", allowedContracts: [], revision: 1, createdAt: 1, updatedAt: 1 })
      await ctx.db.insert("mirrors", { networkId: network, emitterId, environment: "sandbox", contract: "test-only", objectRef: "test/page-orphelin", localTable: "pages", localId: mirrored, updatedAt: 1 })
    })
    // Ce reflet d'essai n'est pas servi (contrat inconnu) : la fiche le tait ; la règle, lue seule, l'écarte.
    expect(await standing("association-refletee")).toBeNull()
    expect(await t.run(async (ctx) => { const row = await ctx.db.get(mirrored); return row ? await isPageOrphan(ctx, row) : null })).toBe(false)

    // La réponse ne porte que deux booléens : ni nombre, ni identité de l'équipe.
    expect(Object.keys((await standing("association-editee")) ?? {}).sort()).toEqual(["claimable", "orphan"])
  })
})

describe("compteurs des pages du hub — matérialisés par le passage nocturne", () => {
  it("compte les pages actives et lisibles du pays par nature ; la lecture ne compte jamais", async () => {
    const { t, root, network, reader } = await fixture()
    await page(t, network, { ownerKind: "association" })
    await page(t, network, { ownerKind: "association" })
    await page(t, network, { ownerKind: "association", status: "inactive" })
    await removedByModeration(t, network, await page(t, network, { ownerKind: "association" }))
    await page(t, network, { ownerKind: "company" })
    await page(t, network, { ownerKind: "media" })
    await page(t, network, { ownerKind: "institution", trust: "official" })
    await page(t, network, { ownerKind: "company", country: "BE" })
    await page(t, network, { ownerKind: "company", country: "GA" })
    await page(t, network, { ownerKind: "association", country: null })
    await page(t, root, { ownerKind: "association" })

    const before = await reader.as.query(api.modules.diaspora.hubs.getCountryHub, { networkId: network, country: "FR" })
    expect(before.counters.associations).toEqual({ kind: "value", value: 0 })

    vi.useFakeTimers()
    await t.mutation(internal.modules.diaspora.hubs.refreshHubCounters, { pageSize: 2 })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const rows = await t.run(async (ctx) => ctx.db.query("countryHubs").withIndex("by_network_and_country", (q) => q.eq("networkId", network)).take(10))
    const byCountry = Object.fromEntries(rows.map((row) => [row.country, { associations: row.associations, companies: row.companies }]))
    expect(byCountry).toEqual({ FR: { associations: 2, companies: 1 }, BE: { associations: 0, companies: 1 } })

    const after = await reader.as.query(api.modules.diaspora.hubs.getCountryHub, { networkId: network, country: "FR" })
    // Le seuil anti-réidentification ne concerne que les membres : les pages se publient telles quelles.
    expect(after.counters.associations).toEqual({ kind: "value", value: 2 })
    expect(after.counters.companies).toEqual({ kind: "value", value: 1 })
    expect(after.counters.dormant).toBe(false)

    // Une page de plus n'entre au compteur qu'au passage suivant.
    await page(t, network, { ownerKind: "association" })
    expect((await reader.as.query(api.modules.diaspora.hubs.getCountryHub, { networkId: network, country: "FR" })).counters.associations).toEqual({ kind: "value", value: 2 })
    await t.mutation(internal.modules.diaspora.hubs.refreshHubCounters, {})
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect((await reader.as.query(api.modules.diaspora.hubs.getCountryHub, { networkId: network, country: "FR" })).counters.associations).toEqual({ kind: "value", value: 3 })
  })
})
