// @vitest-environment edge-runtime
/**
 * Évènements d'un hub pays (DIASPORALE HB-02) : les prochains évènements OUVERTS
 * AU RÉSEAU des associations du pays, publiés et non annulés, lus par fenêtres
 * bornées sous la garde des évènements de page ; refus indistinct hors du réseau
 * gouverné ; compteur matérialisé par le passage nocturne, jamais à la lecture.
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { HUB_EVENTS_COUNT_PER_PAGE, HUB_EVENTS_PAGE_MAX } from "./hubEvents"
import { HUB_PAGES_SCAN } from "./hubPages"

type T = ReturnType<typeof testConvex>
type Moderation = "published" | "pending_review" | "removed"

const NOW = Date.UTC(2026, 9, 18, 10)
const HOUR = 3_600_000
const DAY = 24 * HOUR
const HE = api.modules.diaspora.hubEvents
const E = api.modules.events.pageEvents
const A = api.modules.diaspora.associations

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

/** Un membre DÉCLARÉ de DIASPORALE (IDN de garantie 1, nationalité gabonaise), résident en France. */
async function member(t: T, networkId: Id<"networks">, handle: string) {
  const as = t.withIdentity({ subject: `hub-events-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await t.run(async (ctx) => {
    await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `hub-events-idn-${personId}`, loa: 1, nationality: "GA", linkedAt: NOW })
  })
  await as.mutation(api.modules.diaspora.membership.joinDiasporale, { networkId, facet: { countryOfResidence: "FR" } })
  return { as, personId }
}

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  // Modération a posteriori des évènements : publiés dès leur création, sauf ce que le test retient.
  await t.run(async (ctx) => {
    await ctx.db.insert("moderationPolicies", { networkId: network, surface: "event", preReview: false, maxLinks: 2, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
  })
  const manager = await member(t, network, "asso-responsable")
  const reader = await member(t, network, "lecteur")
  return { t, root, network, manager, reader }
}

let sequence = 0

/** Une page posée telle quelle : association active de France par défaut. */
async function page(
  t: T,
  networkId: Id<"networks">,
  fields: { handle?: string; ownerKind?: Doc<"pages">["ownerKind"]; country?: string | null; status?: Doc<"pages">["status"]; createdAt?: number } = {},
): Promise<Id<"pages">> {
  sequence += 1
  const handle = fields.handle ?? `page-evenements-${sequence}`
  const country = fields.country === undefined ? "FR" : fields.country
  return await t.run(async (ctx) =>
    ctx.db.insert("pages", {
      networkId,
      handle,
      name: `Page ${handle}`,
      ownerKind: fields.ownerKind ?? "association",
      trust: "community",
      trustRank: 0,
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

async function admin(t: T, networkId: Id<"networks">, pageId: Id<"pages">, personId: Id<"persons">) {
  await t.run(async (ctx) => {
    await ctx.db.insert("pageSignatories", { networkId, pageId, personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
  })
}

/** Un évènement créé par le chemin réel (équipe vivante de la page, modération a posteriori). */
async function create(
  who: { as: ReturnType<T["withIdentity"]> },
  networkId: Id<"networks">,
  pageId: Id<"pages">,
  fields: { title: string; startAt: number; audience: "network" | "association"; key: string },
) {
  const { eventId } = await who.as.mutation(E.create, {
    networkId, pageId, title: fields.title, description: "Programme de recette.", location: "Lyon",
    startAt: fields.startAt, endAt: fields.startAt + 2 * HOUR, timeZone: "Europe/Paris", audience: fields.audience, idempotencyKey: fields.key,
  })
  return eventId
}

/** Un évènement posé tel quel, avec son état de modération (aucun état : jamais publié). */
async function insertEvent(
  t: T,
  networkId: Id<"networks">,
  pageId: Id<"pages">,
  fields: { startAt: number; audience?: "network" | "association"; status?: "scheduled" | "cancelled"; moderation?: Moderation | null; title?: string },
): Promise<Id<"events">> {
  sequence += 1
  return await t.run(async (ctx) => {
    const eventId = await ctx.db.insert("events", {
      networkId,
      organizerPageId: pageId,
      pageAudience: fields.audience ?? "network",
      title: fields.title ?? `Évènement ${sequence}`,
      location: "Paris",
      startAt: fields.startAt,
      endAt: fields.startAt + 2 * HOUR,
      timeZone: "Europe/Paris",
      status: fields.status ?? "scheduled",
      ...(fields.status === "cancelled" ? { cancelledAt: NOW } : {}),
      version: 1,
      idempotencyKey: `insertion-${sequence}`,
      createdAt: NOW,
      updatedAt: NOW,
    })
    const moderation = fields.moderation === undefined ? "published" : fields.moderation
    if (moderation !== null) {
      await ctx.db.insert("moderationContentStates", { networkId, targetKind: "event", targetId: eventId, ownerPageId: pageId, status: moderation, createdAt: NOW, updatedAt: NOW })
    }
    return eventId
  })
}

async function setModeration(t: T, eventId: Id<"events">, status: Moderation) {
  await t.run(async (ctx) => {
    const row = await ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", "event").eq("targetId", eventId)).unique()
    if (!row) throw new Error("État de modération absent")
    await ctx.db.patch(row._id, { status })
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

function list(who: { as: ReturnType<T["withIdentity"]> }, networkId: Id<"networks">, args: { country?: string; anchor?: number; cursor?: string | null; numItems?: number } = {}) {
  return who.as.query(HE.listCountryEvents, {
    networkId,
    country: args.country ?? "FR",
    anchor: args.anchor ?? NOW,
    cursor: args.cursor ?? null,
    ...(args.numItems === undefined ? {} : { numItems: args.numItems }),
  })
}

describe("listCountryEvents — les prochains évènements publics des associations d'un pays", () => {
  it("rend les évènements publiés ouverts au réseau, par date ; ni réservé, ni annulé, ni retenu", async () => {
    const { t, network, manager, reader } = await fixture()
    const lyon = await page(t, network, { handle: "association-lyon" })
    await admin(t, network, lyon, manager.personId)
    const later = await create(manager, network, lyon, { title: "Assemblée générale", startAt: NOW + 3 * DAY, audience: "network", key: "assemblee" })
    const sooner = await create(manager, network, lyon, { title: "Pique-nique de rentrée", startAt: NOW + DAY, audience: "network", key: "pique-nique" })
    await create(manager, network, lyon, { title: "Réunion du bureau", startAt: NOW + 2 * DAY, audience: "association", key: "bureau" })
    const cancelled = await create(manager, network, lyon, { title: "Sortie annulée", startAt: NOW + 4 * DAY, audience: "network", key: "annulee" })
    await manager.as.mutation(E.cancel, { networkId: network, eventId: cancelled, expectedVersion: 1 })
    const held = await create(manager, network, lyon, { title: "Soirée retenue", startAt: NOW + 5 * DAY, audience: "network", key: "retenue" })
    await setModeration(t, held, "pending_review")

    const view = await list(reader, network, { country: "fr" })
    const card = (eventId: Id<"events">, title: string, startAt: number) => ({
      eventId, pageId: lyon, title, location: "Lyon", startAt, endAt: startAt + 2 * HOUR, timeZone: "Europe/Paris",
      organizer: { name: "Page association-lyon", handle: "association-lyon" },
    })
    expect(view).toEqual({
      country: "FR",
      items: [card(sooner, "Pique-nique de rentrée", NOW + DAY), card(later, "Assemblée générale", NOW + 3 * DAY)],
      continueCursor: null,
      isDone: true,
      partial: false,
    })
    // La carte seulement : ni inscrits, ni capacité, ni état du lecteur.
    expect(JSON.stringify(view)).not.toMatch(/confirmed|capacity|registration|canManage/)

    // L'équipe de la page ne lit rien de plus dans le hub : le retenu reste sur sa page.
    expect((await list(manager, network)).items.map((row) => row.eventId)).toEqual([sooner, later])

    // Publié par la modération, il paraît ; retiré, il disparaît.
    await setModeration(t, held, "published")
    expect((await list(reader, network)).items.map((row) => row.eventId)).toEqual([sooner, later, held])
    await setModeration(t, held, "removed")
    expect((await list(reader, network)).items.map((row) => row.eventId)).toEqual([sooner, later])

    // L'instant de référence écarte ce qui commence avant lui.
    expect((await list(reader, network, { anchor: NOW + 2 * DAY })).items.map((row) => row.eventId)).toEqual([later])
  })

  it("un évènement réservé aux adhérents n'y paraît pas, même pour un adhérent accepté qui le lit sur la page", async () => {
    const { t, network, manager, reader } = await fixture()
    const lyon = await page(t, network, { handle: "association-adherents" })
    await admin(t, network, lyon, manager.personId)
    const reserved = await insertEvent(t, network, lyon, { startAt: NOW + DAY, audience: "association" })
    const legacy = await t.run(async (ctx) => {
      // Une audience absente vaut « réservé aux adhérents ».
      const eventId = await ctx.db.insert("events", {
        networkId: network, organizerPageId: lyon, title: "Sans audience", startAt: NOW + 2 * DAY, endAt: NOW + 2 * DAY + HOUR,
        timeZone: "Europe/Paris", status: "scheduled", version: 1, idempotencyKey: "sans-audience", createdAt: NOW, updatedAt: NOW,
      })
      await ctx.db.insert("moderationContentStates", { networkId: network, targetKind: "event", targetId: eventId, ownerPageId: lyon, status: "published", createdAt: NOW, updatedAt: NOW })
      return eventId
    })
    const row = await reader.as.mutation(A.requestAssociationMembership, { networkId: network, pageId: lyon })
    await manager.as.mutation(A.decideAssociationMembership, { networkId: network, membershipId: row.membershipId, expectedVersion: row.version, decision: "accept" })

    // La garde des évènements de page lui ouvre bien le détail…
    expect(await reader.as.query(E.get, { networkId: network, eventId: reserved })).toMatchObject({ audience: "association", moderation: "published" })
    // … mais le hub ne montre que ce qui est ouvert au réseau.
    expect((await list(reader, network)).items).toEqual([])
    expect((await list(manager, network)).items.map((item) => item.eventId)).not.toContain(legacy)
  })

  it("ne montre que les associations actives et lisibles DU pays consulté", async () => {
    const { t, network, root, reader } = await fixture()
    const paris = await page(t, network, { handle: "association-paris" })
    const brussels = await page(t, network, { handle: "association-bruxelles", country: "BE" })
    const nowhere = await page(t, network, { handle: "association-sans-pays", country: null })
    const company = await page(t, network, { handle: "traiteur-paris", ownerKind: "company" })
    const retired = await page(t, network, { handle: "association-retiree", status: "inactive" })
    const moderated = await page(t, network, { handle: "association-moderee" })
    await t.run(async (ctx) => {
      await ctx.db.insert("moderationContentStates", { networkId: network, targetKind: "page", targetId: moderated, status: "removed", createdAt: NOW, updatedAt: NOW })
    })
    const elsewhere = await page(t, root, { handle: "association-de-la-racine" })
    const ours = await insertEvent(t, network, paris, { startAt: NOW + DAY })
    const belgian = await insertEvent(t, network, brussels, { startAt: NOW + DAY })
    for (const pageId of [nowhere, company, retired, moderated]) await insertEvent(t, network, pageId, { startAt: NOW + DAY })
    await insertEvent(t, root, elsewhere, { startAt: NOW + DAY })

    expect((await list(reader, network)).items.map((row) => row.eventId)).toEqual([ours])
    expect((await list(reader, network, { country: "BE" })).items.map((row) => row.eventId)).toEqual([belgian])
    // Un pays inconnu et le Gabon : le même refus que le hub.
    expect(await codeOf(list(reader, network, { country: "GA" }))).toBe("notFound")
    expect(await codeOf(list(reader, network, { country: "ZZ" }))).toBe("notFound")
  })

  it("pagine par fenêtres bornées, dans l'ordre des dates, sans doublon ni trou ; le curseur reste à son pays et à son instant", async () => {
    const { t, network, reader } = await fixture()
    const first = await page(t, network)
    const second = await page(t, network)
    const expected: Id<"events">[] = []
    // Dates entrelacées entre deux associations, et deux évènements au même instant.
    const plan: Array<[Id<"pages">, number]> = [[first, 1], [second, 1.5], [first, 2], [second, 2], [first, 3], [second, 4.5], [first, 5], [first, 6]]
    for (const [pageId, day] of plan) expected.push(await insertEvent(t, network, pageId, { startAt: NOW + day * DAY }))
    await insertEvent(t, network, second, { startAt: NOW + 3.5 * DAY, audience: "association" })

    const seen: Id<"events">[] = []
    let cursor: string | null = null
    for (let round = 0; round < 20; round += 1) {
      const chunk: Awaited<ReturnType<typeof list>> = await list(reader, network, { cursor, numItems: 2 })
      expect(chunk.items.length).toBeLessThanOrEqual(2)
      seen.push(...chunk.items.map((row) => row.eventId))
      if (chunk.isDone) {
        expect(chunk.continueCursor).toBeNull()
        break
      }
      expect(chunk.continueCursor).not.toBeNull()
      cursor = chunk.continueCursor
    }
    const startOf = async (eventId: Id<"events">) => (await t.run(async (ctx) => ctx.db.get(eventId)))!.startAt
    expect(new Set(seen).size).toBe(seen.length)
    expect([...seen].sort()).toEqual([...expected].sort())
    const starts = await Promise.all(seen.map(startOf))
    expect(starts).toEqual([...starts].sort((a, b) => a - b))

    // Un curseur ne se réinterprète ni pour un autre pays, ni pour un autre instant, ni mal formé.
    const opening = await list(reader, network, { numItems: 2 })
    expect(opening.continueCursor).not.toBeNull()
    expect(await codeOf(list(reader, network, { country: "BE", cursor: opening.continueCursor }))).toBe("invalidArgument")
    expect(await codeOf(list(reader, network, { anchor: NOW + 1, cursor: opening.continueCursor }))).toBe("invalidArgument")
    expect(await codeOf(list(reader, network, { cursor: "[\"hub-events\"" }))).toBe("invalidArgument")
  })

  it("une association dont la fenêtre est pleine fixe la borne : un évènement plus tardif d'une autre ne passe jamais devant", async () => {
    const { t, network, reader } = await fixture()
    const crowded = await page(t, network)
    const other = await page(t, network)
    // Trois évènements réservés remplissent la fenêtre de la première association (deux demandés, trois relus).
    for (const day of [1, 2, 2.5]) await insertEvent(t, network, crowded, { startAt: NOW + day * DAY, audience: "association" })
    const early = await insertEvent(t, network, crowded, { startAt: NOW + 2.7 * DAY })
    const late = await insertEvent(t, network, other, { startAt: NOW + 3 * DAY })
    const opening = await list(reader, network, { numItems: 2 })
    // La fenêtre s'arrête à la borne : vide, elle annonce sa suite plutôt que de montrer le plus tardif d'abord.
    expect(opening.items).toEqual([])
    expect(opening.isDone).toBe(false)
    const next = await list(reader, network, { numItems: 2, cursor: opening.continueCursor })
    expect(next.items.map((row) => row.eventId)).toEqual([early, late])
    expect(next.isDone).toBe(true)
  })

  it("plafonne la fenêtre demandée et dit quand la fenêtre des pages du pays est incomplète", async () => {
    const { t, network, reader } = await fixture()
    const busy = await page(t, network)
    for (let day = 1; day <= HUB_EVENTS_PAGE_MAX + 2; day += 1) await insertEvent(t, network, busy, { startAt: NOW + day * DAY })
    const capped = await list(reader, network, { numItems: 1000 })
    expect(capped.items).toHaveLength(HUB_EVENTS_PAGE_MAX)
    expect(capped.isDone).toBe(false)
    expect(capped.partial).toBe(false)

    // Plus de pages actives dans le pays que la fenêtre n'en lit : l'association la plus ancienne en sort, et le hub le dit.
    const { t: t2, network: network2, reader: reader2 } = await fixture()
    const oldest = await page(t2, network2, { createdAt: NOW - DAY })
    await insertEvent(t2, network2, oldest, { startAt: NOW + DAY })
    await t2.run(async (ctx) => {
      for (let index = 0; index < HUB_PAGES_SCAN; index += 1) {
        await ctx.db.insert("pages", {
          networkId: network2, handle: `entreprise-${index}`, name: `Entreprise ${index}`, ownerKind: "company", trust: "community", trustRank: 0,
          country: "FR", visibility: "network", onRoot: false, status: "active", searchText: `entreprise ${index}`, createdAt: NOW + index, updatedAt: NOW + index,
        })
      }
    })
    const truncated = await list(reader2, network2)
    expect(truncated.partial).toBe(true)
    expect(truncated.items).toEqual([])
  })

  it("membre sans accès : un membre d'ANTSIA seul et une personne suspendue sont refusés", async () => {
    const { t, root, network } = await fixture()
    const paris = await page(t, network)
    await insertEvent(t, network, paris, { startAt: NOW + DAY })

    const antsiaOnly = t.withIdentity({ subject: "hub-events-antsia-seule" })
    await antsiaOnly.mutation(api.modules.people.persons.ensureMyPerson, {})
    await antsiaOnly.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    await antsiaOnly.mutation(api.modules.people.profile.publishMyProfile, { handle: "antsia.seule", displayName: "antsia.seule" })
    await antsiaOnly.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
    expect(await codeOf(list({ as: antsiaOnly }, network))).toBe("notFound")
    // La racine n'est pas gouvernée par la tranche : refus indistinct.
    expect(await codeOf(list({ as: antsiaOnly }, root))).toBe("notFound")

    const suspended = await member(t, network, "suspendue")
    await t.run(async (ctx) => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", root).eq("personId", suspended.personId)).unique()
      if (!row) throw new Error("Adhésion racine absente")
      await ctx.db.patch(row._id, { status: "suspendue", statusBeforeSuspension: "declaree" })
    })
    expect(await codeOf(list(suspended, network))).toBe("membershipSuspended")
  })
})

describe("passage nocturne — le compteur des évènements à venir du hub", () => {
  async function pass(t: T, pageSize?: number) {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    await t.mutation(internal.modules.diaspora.hubs.refreshHubCounters, pageSize === undefined ? {} : { pageSize })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
  }

  it("compte les évènements publiés ouverts au réseau, à venir, par pays, et date ce comptage", async () => {
    const { t, network, reader } = await fixture()
    const paris = await page(t, network)
    const lyon = await page(t, network)
    const brussels = await page(t, network, { country: "BE" })
    const company = await page(t, network, { ownerKind: "company" })
    await insertEvent(t, network, paris, { startAt: NOW + DAY })
    await insertEvent(t, network, lyon, { startAt: NOW + 2 * DAY })
    await insertEvent(t, network, paris, { startAt: NOW + DAY, audience: "association" })
    await insertEvent(t, network, paris, { startAt: NOW + DAY, status: "cancelled" })
    await insertEvent(t, network, paris, { startAt: NOW + DAY, moderation: "pending_review" })
    await insertEvent(t, network, paris, { startAt: NOW + DAY, moderation: null })
    await insertEvent(t, network, paris, { startAt: NOW - DAY })
    await insertEvent(t, network, company, { startAt: NOW + DAY })
    await insertEvent(t, network, brussels, { startAt: NOW + 3 * DAY })

    const before = await reader.as.query(api.modules.diaspora.hubs.getCountryHub, { networkId: network, country: "FR" })
    // Aucun passage : le compteur n'est pas mesuré, et le dit.
    expect(before.upcomingEventsComputedAt).toBeNull()

    await pass(t, 2)
    const france = await reader.as.query(api.modules.diaspora.hubs.getCountryHub, { networkId: network, country: "FR" })
    expect(france.counters.upcomingEvents).toEqual({ kind: "value", value: 2 })
    expect(france.upcomingEventsComputedAt).toBe(NOW)
    const belgium = await reader.as.query(api.modules.diaspora.hubs.getCountryHub, { networkId: network, country: "BE" })
    expect(belgium.counters.upcomingEvents).toEqual({ kind: "value", value: 1 })

    // Un évènement de plus n'entre au compteur qu'au passage suivant : rien n'est compté à la lecture.
    await insertEvent(t, network, lyon, { startAt: NOW + 4 * DAY })
    expect((await reader.as.query(api.modules.diaspora.hubs.getCountryHub, { networkId: network, country: "FR" })).counters.upcomingEvents).toEqual({ kind: "value", value: 2 })
    await pass(t)
    expect((await reader.as.query(api.modules.diaspora.hubs.getCountryHub, { networkId: network, country: "FR" })).counters.upcomingEvents).toEqual({ kind: "value", value: 3 })
  })

  it("une association au-delà de la borne de relecture rend le compte inexact : il n'est ni publié ni daté", async () => {
    const { t, network, reader } = await fixture()
    const busy = await page(t, network)
    await t.run(async (ctx) => {
      for (let index = 0; index <= HUB_EVENTS_COUNT_PER_PAGE; index += 1) {
        await ctx.db.insert("events", {
          networkId: network, organizerPageId: busy, pageAudience: "network", title: `Atelier ${index}`, startAt: NOW + (index + 1) * HOUR,
          endAt: NOW + (index + 2) * HOUR, timeZone: "Europe/Paris", status: "scheduled", version: 1, idempotencyKey: `atelier-${index}`, createdAt: NOW, updatedAt: NOW,
        })
      }
    })
    await pass(t)
    const france = await reader.as.query(api.modules.diaspora.hubs.getCountryHub, { networkId: network, country: "FR" })
    expect(france.upcomingEventsComputedAt).toBeNull()
    expect(france.counters.upcomingEvents).toEqual({ kind: "value", value: 0 })
    // Les autres compteurs du passage restent publiés.
    expect(france.counters.associations).toEqual({ kind: "value", value: 1 })
  })
})
