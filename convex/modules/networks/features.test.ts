// @vitest-environment edge-runtime
/**
 * ADR-0041 — les fonctionnalités d'un réseau gouverné par une tranche : fermées sans
 * ligne (lecture et écriture, refus indistinct, les huit clés), ouvertes par
 * l'administrateur du réseau avec motif et ligne de journal, refusées à tout autre
 * membre, tenues par la règle de dépendance, sans effet sur la racine ; fermer ne
 * supprime rien, rouvrir rend tout ; une bascule déjà en place n'écrit rien.
 */
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { NETWORK_FEATURES, type NetworkFeature } from "@antsia/social-domain/networkFeatures"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type As = ReturnType<T["withIdentity"]>
type Member = { as: As; personId: Id<"persons"> }

const NOW = Date.UTC(2026, 10, 20, 10)
const F = api.modules.networks.features
const REASON = "Ouverture décidée pour le pilote du réseau."
const FIRST = { numItems: 5, cursor: null }

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
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

const codeOf = async (promise: Promise<unknown>) => engineErrorCode(await caught(promise))

/** Un membre déclaré de DIASPORA.GA (IDN de garantie 2), au rôle de réseau demandé. */
async function member(t: T, networkId: Id<"networks">, handle: string, role?: "network_admin" | "network_moderator"): Promise<Member> {
  const as = t.withIdentity({ subject: `features-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await t.run(async (ctx) => {
    await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `idn-${personId}`, loa: 2, nationality: "GA", linkedAt: NOW })
  })
  await as.mutation(api.modules.diaspora.membership.joinDiasporaGa, { networkId, facet: { countryOfResidence: "FR", city: "Paris" } })
  if (role) {
    await t.run(async (ctx) => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique()
      if (row) await ctx.db.patch(row._id, { role })
    })
  }
  return { as, personId }
}

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  const reader = await member(t, network, "lectrice.reseau")
  const moderator = await member(t, network, "moderatrice.reseau", "network_moderator")
  const admin = await member(t, network, "admin.reseau", "network_admin")
  const pageId = await t.run(async (ctx) =>
    ctx.db.insert("pages", {
      networkId: network,
      handle: "association-fictive-reseau",
      name: "Association fictive du réseau",
      ownerKind: "association",
      trust: "community",
      trustRank: 0,
      country: "FR",
      visibility: "network",
      onRoot: false,
      status: "active",
      searchText: "association-fictive-reseau",
      createdAt: NOW,
      updatedAt: NOW,
    }),
  )
  return { t, root, network, reader, moderator, admin, pageId }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

/** Une lecture témoin par fonctionnalité, prise dans les fichiers que la fonctionnalité gouverne. */
function readOf(f: Fixture, feature: NetworkFeature, as: As): Promise<unknown> {
  const networkId = f.network
  switch (feature) {
    case "pages": return as.query(api.modules.pages.pages.myPages, { networkId })
    case "groupsAndEvents": return as.query(api.modules.thematicGroups.thematicGroups.myGroups, { networkId })
    case "services": return as.query(api.modules.diaspora.serviceRequests.myServiceRequests, { networkId, paginationOpts: FIRST })
    case "jobs": return as.query(api.modules.diaspora.jobs.myTalentProfile, { networkId })
    case "mutualAid": return as.query(api.modules.diaspora.mutualAid.myQuestions, { networkId, paginationOpts: FIRST })
    case "mentoring": return as.query(api.modules.diaspora.mentoring.myMentorProfile, { networkId })
    case "arrivalKit": return as.query(api.modules.diaspora.arrivalKit.myKitStanding, { networkId })
    case "pilotMetrics": return as.query(api.modules.diaspora.pilotMetrics.pilotMetricsAccess, { networkId })
  }
}

const TALENT = {
  expectedVersion: null,
  title: "Comptable bilingue",
  skills: ["Comptabilité"],
  availability: "one_month" as const,
  languages: ["fr" as const],
  country: "FR",
  visibility: "network" as const,
}

/** Une écriture témoin par fonctionnalité (la mesure du pilote n'en a pas : lecture seule). */
function writeOf(f: Fixture, feature: Exclude<NetworkFeature, "pilotMetrics">, as: As): Promise<unknown> {
  const networkId = f.network
  switch (feature) {
    case "pages": return as.mutation(api.modules.pages.pages.follow, { networkId, handle: "association-fictive-reseau" })
    case "groupsAndEvents": return as.mutation(api.modules.diaspora.associationGroups.createGroupForPage, { networkId, pageId: f.pageId, idempotencyKey: "groupe-fictif-0001" })
    case "services":
      return as.mutation(api.modules.diaspora.services.createOffer, {
        networkId,
        pageId: f.pageId,
        title: "Tresses et coiffure afro",
        description: "Coiffure afro à domicile, nattes et tresses, sur rendez-vous.",
        category: "beauty",
        country: "FR",
        city: "Paris",
        delivery: "onsite",
        languages: ["fr"],
        durationMinutes: 120,
        pricing: { mode: "from", amountMinor: 6000, currency: "EUR" },
        publish: false,
      })
    case "jobs": return as.mutation(api.modules.diaspora.jobs.saveMyTalentProfile, { networkId, ...TALENT })
    case "mutualAid": return as.mutation(api.modules.diaspora.mutualAid.askQuestion, { networkId, title: "Trouver un logement étudiant", detail: "Quelles démarches pour un logement étudiant à Paris ?", theme: "housing", country: "FR" })
    case "mentoring": return as.mutation(api.modules.diaspora.mentoring.setMentorState, { networkId, expectedVersion: 1, state: "paused" })
    case "arrivalKit":
      return as.mutation(api.modules.diaspora.arrivalKit.proposeResource, {
        networkId,
        title: "Ouvrir un compte bancaire",
        summary: "Les pièces à réunir avant le rendez-vous.",
        body: "Une pièce d'identité, un justificatif de domicile et un justificatif de revenus.",
        category: "banking",
        country: "FR",
        sourceName: "Source fictive",
        sourceUrl: "https://example.org/compte",
        lastVerifiedAt: NOW,
        submit: false,
      })
  }
}

async function open(f: Fixture, feature: NetworkFeature, enabled = true) {
  return await f.admin.as.mutation(F.setFeature, { networkId: f.network, feature, enabled, reason: REASON })
}

async function featureAudit(f: Fixture) {
  return await f.t.run(async (ctx) => {
    const rows = await ctx.db.query("engineAudit").withIndex("by_network_at", (q) => q.eq("networkId", f.network)).take(50)
    return rows.filter((row) => row.action === "network.feature_set").map((row) => ({ capacity: row.capacity, actorPersonId: row.actorPersonId, subjectTable: row.subjectTable, details: row.details }))
  })
}

describe("ADR-0041 — fonctionnalités d'un réseau gouverné", () => {
  it("sans ligne, les huit fonctionnalités sont fermées en lecture comme en écriture ; le socle reste servi", async () => {
    const f = await fixture()
    // La graine du réseau n'ouvre rien : aucune ligne.
    expect(await f.t.run(async (ctx) => await ctx.db.query("networkFeatures").take(10))).toEqual([])
    expect(await f.reader.as.query(F.open, { networkId: f.network })).toEqual([])
    for (const feature of NETWORK_FEATURES) {
      expect(await codeOf(readOf(f, feature, f.reader.as)), `lecture ${feature}`).toBe("notFound")
      if (feature !== "pilotMetrics") expect(await codeOf(writeOf(f, feature, f.reader.as)), `écriture ${feature}`).toBe("notFound")
    }
    // L'administrateur du réseau n'y échappe pas : la fonctionnalité est fermée pour tous.
    expect(await codeOf(readOf(f, "pages", f.admin.as))).toBe("notFound")
    // Le socle : publier, lire le fil.
    const { postId } = await f.reader.as.mutation(api.modules.posts.posts.publish, { networkId: f.network, body: "Bonjour à toute la communauté." })
    expect(await f.reader.as.query(api.modules.posts.posts.getPost, { networkId: f.network, postId })).not.toBeNull()
  })

  it("publier dans un groupe relève des groupes et évènements : fermés, refusé au membre du groupe ; ouverts, admis", async () => {
    const f = await fixture()
    const groupId = await f.t.run(async (ctx) =>
      ctx.db.insert("thematicGroups", {
        networkId: f.network,
        name: "Groupe fictif",
        createdByPersonId: f.admin.personId,
        searchText: "groupe fictif",
        idempotencyKey: "groupe-fictif-0002",
        createdAt: NOW,
        updatedAt: NOW,
      }),
    )
    await f.t.run(async (ctx) => {
      await ctx.db.insert("thematicGroupMembers", { networkId: f.network, groupId, personId: f.reader.personId, role: "member", joinedAt: NOW })
    })
    const inGroup = { networkId: f.network, body: "Bonjour au groupe.", audience: "group" as const, groupId }
    expect(await codeOf(f.reader.as.mutation(api.modules.posts.posts.publish, inGroup))).toBe("notFound")
    expect(await codeOf(f.reader.as.mutation(api.modules.posts.posts.publish, { networkId: f.network, body: "Bonjour à toutes et à tous." }))).toBeNull()
    // Ouverts (avec les pages), le même membre du groupe y publie.
    await open(f, "pages")
    await open(f, "groupsAndEvents")
    expect(await codeOf(f.reader.as.mutation(api.modules.posts.posts.publish, inGroup))).toBeNull()
  })

  it("l'administrateur ouvre une fonctionnalité : elle est servie, une ligne de journal ; rejouée, rien n'est écrit", async () => {
    const f = await fixture()
    expect(await open(f, "pages")).toEqual({ changed: true })
    expect(await f.reader.as.query(F.open, { networkId: f.network })).toEqual(["pages"])
    expect(await readOf(f, "pages", f.reader.as)).toBeDefined()
    await writeOf(f, "pages", f.reader.as)
    // Les autres restent fermées.
    expect(await codeOf(readOf(f, "jobs", f.reader.as))).toBe("notFound")
    expect(await open(f, "pages")).toEqual({ changed: false })
    expect(await featureAudit(f)).toEqual([{ capacity: "network_admin", actorPersonId: f.admin.personId, subjectTable: "networks", details: { reason: REASON, feature: "pages", enabled: true } }])
    const settings = await f.admin.as.query(F.settings, { networkId: f.network })
    expect(settings.map((row) => row.feature)).toEqual([...NETWORK_FEATURES])
    expect(settings[0]).toEqual({ feature: "pages", enabled: true, open: true, requires: null, updatedAt: NOW })
    expect(settings.find((row) => row.feature === "jobs")).toEqual({ feature: "jobs", enabled: false, open: false, requires: "pages", updatedAt: null })
  })

  it("toutes les fonctionnalités s'ouvrent, dans l'ordre des dépendances, et chacune est alors servie", async () => {
    const f = await fixture()
    for (const feature of NETWORK_FEATURES) await open(f, feature)
    expect(await f.reader.as.query(F.open, { networkId: f.network })).toEqual([...NETWORK_FEATURES])
    for (const feature of NETWORK_FEATURES) expect(await codeOf(readOf(f, feature, f.reader.as)), `lecture ${feature}`).toBeNull()
  })

  it("tout autre membre que l'administrateur du réseau reçoit le refus indistinct, en lecture comme en bascule", async () => {
    const f = await fixture()
    for (const who of [f.reader, f.moderator]) {
      expect(await codeOf(who.as.query(F.settings, { networkId: f.network }))).toBe("notFound")
      expect(await codeOf(who.as.mutation(F.setFeature, { networkId: f.network, feature: "pages", enabled: true, reason: REASON }))).toBe("notFound")
    }
    expect(await f.t.run(async (ctx) => await ctx.db.query("networkFeatures").take(10))).toEqual([])
  })

  it("le motif est exigé ; ouvrir exige le parent ouvert ; fermer les pages exige les enfants fermés", async () => {
    const f = await fixture()
    expect(engineErrorRule(await caught(f.admin.as.mutation(F.setFeature, { networkId: f.network, feature: "pages", enabled: true, reason: "court" })))?.rule).toBe("DECISION_REASON_LENGTH")
    expect(engineErrorRule(await caught(open(f, "services")))?.rule).toBe("NETWORK_FEATURE_REQUIRES_PARENT")
    await open(f, "pages")
    await open(f, "services")
    expect(engineErrorRule(await caught(open(f, "pages", false)))?.rule).toBe("NETWORK_FEATURE_HAS_OPEN_CHILDREN")
    await open(f, "services", false)
    expect(await open(f, "pages", false)).toEqual({ changed: true })
    expect(await f.reader.as.query(F.open, { networkId: f.network })).toEqual([])
    expect((await featureAudit(f)).map((row) => [row.details?.feature, row.details?.enabled])).toEqual([["pages", true], ["services", true], ["services", false], ["pages", false]])
  })

  it("fermer ne supprime rien : la donnée reste, et revient à la réouverture", async () => {
    const f = await fixture()
    await open(f, "pages")
    await open(f, "jobs")
    await writeOf(f, "jobs", f.reader.as)
    const saved = await f.reader.as.query(api.modules.diaspora.jobs.myTalentProfile, { networkId: f.network })
    expect(saved).not.toBeNull()
    await open(f, "jobs", false)
    expect(await codeOf(readOf(f, "jobs", f.reader.as))).toBe("notFound")
    expect(await f.t.run(async (ctx) => (await ctx.db.query("talentProfiles").take(5)).length)).toBe(1)
    await open(f, "jobs")
    expect(await f.reader.as.query(api.modules.diaspora.jobs.myTalentProfile, { networkId: f.network })).toEqual(saved)
  })

  it("la racine n'est pas touchée : ses pages se lisent sans aucune ligne, et elle n'a aucune fonctionnalité activable", async () => {
    const f = await fixture()
    // Entrer dans DIASPORA.GA a créé l'adhésion à la racine.
    expect(await f.reader.as.query(api.modules.pages.pages.myPages, { networkId: f.root })).toBeDefined()
    expect(await f.reader.as.query(F.open, { networkId: f.root })).toEqual([])
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.root).eq("personId", f.admin.personId)).unique()
      if (row) await ctx.db.patch(row._id, { role: "network_admin" })
    })
    expect(await f.admin.as.query(F.settings, { networkId: f.root })).toEqual([])
    expect(await codeOf(f.admin.as.mutation(F.setFeature, { networkId: f.root, feature: "pages", enabled: true, reason: REASON }))).toBe("notFound")
  })

  it("l'opérateur de la plateforme bascule en secours, administrateur de plateforme seulement, au journal", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => {
      await ctx.db.insert("operators", { personId: f.reader.personId, role: "platform_operator", grantedAt: NOW })
      await ctx.db.insert("operators", { personId: f.moderator.personId, role: "platform_admin", grantedAt: NOW })
    })
    await createTestOperatorProof(f.t, f.reader.as, f.reader.personId)
    await createTestOperatorProof(f.t, f.moderator.as, f.moderator.personId)
    const set = { networkId: f.network, feature: "mutualAid" as const, enabled: true, reason: REASON }
    expect(await codeOf(f.reader.as.mutation(F.operatorSetFeature, set))).toBe("operatorRequired")
    expect(await codeOf(f.admin.as.mutation(F.operatorSetFeature, set))).toBe("operatorRequired")
    expect(await f.moderator.as.mutation(F.operatorSetFeature, set)).toEqual({ changed: true })
    expect(await f.moderator.as.mutation(F.operatorSetFeature, set)).toEqual({ changed: false })
    expect((await f.reader.as.query(F.operatorSettings, { networkId: f.network })).find((row) => row.feature === "mutualAid")?.open).toBe(true)
    expect(await featureAudit(f)).toEqual([{ capacity: "platform_admin", actorPersonId: f.moderator.personId, subjectTable: "networks", details: { reason: REASON, feature: "mutualAid", enabled: true } }])
    expect(await readOf(f, "mutualAid", f.reader.as)).toBeDefined()
  })
})
