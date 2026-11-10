// @vitest-environment edge-runtime
/**
 * NP-01 (plan 13 de DIASPORALE) — la portée des consentements de DIASPORALE.
 *
 * Le moteur n'ouvre un envoi que pour un accord au RÉSEAU EXACT (`notificationConsent`), et la
 * suite d'une attestation ne vaut que pour le consentement de la demande, posé pour le réseau.
 * `myConsents` (le registre affiché) et la lecture de l'annuaire (`consentInForce`) doivent dire
 * la même chose : un accord posé sans réseau — celui que l'accueil de DIASPORALE posait avant
 * NP-01 pour les notifications — ne compte plus pour une finalité de réseau, et il n'est jamais
 * réécrit en accord du réseau (aucune migration silencieuse). Seul le profil social vaut pour la
 * personne entière.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { notificationConsent } from "../notifications/consent"
import { consentInForce } from "./facts"

type T = ReturnType<typeof testConvex>
type As = ReturnType<T["withIdentity"]>
type NetworkPurpose = "directory" | "notifications" | "consular_attestation" | "talents"

const NETWORK_PURPOSES = ["directory", "notifications", "consular_attestation", "talents"] as const satisfies readonly NetworkPurpose[]

afterEach(() => {
  vi.useRealTimers()
})

async function seedAll(t: T) {
  const foundations = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const diaspora = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  return { root: foundations.root, diasporale: diaspora.network }
}

/** Un membre « déclaré » de DIASPORALE : profil publié, identité IDN gabonaise de niveau 1, entrée réelle. */
async function member(t: T, diasporale: Id<"networks">, handle = "ada") {
  const as = t.withIdentity({ subject: `auth-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await t.run(async (ctx) => {
    await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `idn-${personId}`, loa: 1, nationality: "GA", linkedAt: Date.now() })
  })
  expect(await as.mutation(api.modules.diaspora.membership.joinDiasporale, { networkId: diasporale, facet: { countryOfResidence: "FR", city: "Lyon" } })).toMatchObject({ status: "declaree" })
  return { as, personId }
}

/** Le registre affiché : finalité → accordée ou non. */
async function registry(as: As, diasporale: Id<"networks">): Promise<Record<string, boolean>> {
  const rows = await as.query(api.modules.diaspora.membership.myConsents, { networkId: diasporale })
  return Object.fromEntries(rows.map((row) => [row.purpose, row.granted]))
}

/** Ce que le moteur relit avant d'agir : l'accord aux notifications avant tout envoi, l'annuaire avant toute inscription. */
async function engineReads(t: T, diasporale: Id<"networks">, personId: Id<"persons">) {
  return await t.run(async (ctx) => ({
    notifications: await notificationConsent(ctx, diasporale, personId, "notifications"),
    directory: await consentInForce(ctx, diasporale, personId, "directory"),
  }))
}

async function consentRows(t: T, personId: Id<"persons">, purpose: NetworkPurpose) {
  return await t.run(async (ctx) => await ctx.db.query("consents").withIndex("by_person_and_purpose", (q) => q.eq("personId", personId).eq("purpose", purpose)).take(10))
}

describe("myConsents — portée exacte des finalités de DIASPORALE (NP-01)", () => {
  it("un accord au réseau, puis son retrait : le registre et le moteur disent la même chose", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const ada = await member(t, diasporale)
    expect(await registry(ada.as, diasporale)).toEqual({ social_profile: true, directory: false, notifications: false, consular_attestation: false, talents: false })
    expect(await engineReads(t, diasporale, ada.personId)).toEqual({ notifications: false, directory: false })

    for (const purpose of NETWORK_PURPOSES) {
      await ada.as.mutation(api.modules.people.consents.recordConsent, { purpose, origin: "settings", networkId: diasporale })
    }
    expect(await registry(ada.as, diasporale)).toEqual({ social_profile: true, directory: true, notifications: true, consular_attestation: true, talents: true })
    expect(await engineReads(t, diasporale, ada.personId)).toEqual({ notifications: true, directory: true })

    for (const purpose of NETWORK_PURPOSES) {
      await ada.as.mutation(api.modules.people.consents.revokeConsent, { purpose, networkId: diasporale })
    }
    expect(await registry(ada.as, diasporale)).toEqual({ social_profile: true, directory: false, notifications: false, consular_attestation: false, talents: false })
    expect(await engineReads(t, diasporale, ada.personId)).toEqual({ notifications: false, directory: false })
  })

  it("une ancienne ligne sans réseau ne compte plus pour une finalité de réseau, et n'est jamais réécrite", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const ada = await member(t, diasporale)
    // Ce que l'accueil et les réglages posaient avant NP-01 : des accords sans réseau.
    for (const purpose of NETWORK_PURPOSES) {
      await ada.as.mutation(api.modules.people.consents.recordConsent, { purpose, origin: "onboarding" })
    }
    const legacy = await Promise.all(NETWORK_PURPOSES.map((purpose) => consentRows(t, ada.personId, purpose)))

    const consents = await ada.as.query(api.modules.diaspora.membership.myConsents, { networkId: diasporale })
    expect(Object.fromEntries(consents.map((row) => [row.purpose, row.granted]))).toEqual({
      social_profile: true,
      directory: false,
      notifications: false,
      consular_attestation: false,
      talents: false,
    })
    // Le registre ne date pas un geste qu'il ne compte pas : rien à la portée du réseau.
    for (const purpose of NETWORK_PURPOSES) expect(consents.find((row) => row.purpose === purpose)?.recordedAt, purpose).toBeNull()
    expect(await engineReads(t, diasporale, ada.personId)).toEqual({ notifications: false, directory: false })

    // Aucune migration : les lignes anciennes restent telles quelles, sans réseau et sans retrait.
    expect(await Promise.all(NETWORK_PURPOSES.map((purpose) => consentRows(t, ada.personId, purpose)))).toEqual(legacy)
    for (const rows of legacy) {
      expect(rows).toHaveLength(1)
      expect(rows[0]?.networkId).toBeUndefined()
      expect(rows[0]?.revokedAt).toBeUndefined()
    }

    // Le geste à la bonne portée ouvre enfin l'envoi ; le registre le dit en même temps.
    await ada.as.mutation(api.modules.people.consents.recordConsent, { purpose: "notifications", origin: "settings", networkId: diasporale })
    expect((await registry(ada.as, diasporale)).notifications).toBe(true)
    expect((await engineReads(t, diasporale, ada.personId)).notifications).toBe(true)
  })

  it("un accord donné pour un autre réseau ne compte pas dans DIASPORALE ; le profil social vaut pour la personne", async () => {
    const t = testConvex()
    const { root, diasporale } = await seedAll(t)
    const ada = await member(t, diasporale)
    await ada.as.mutation(api.modules.people.consents.recordConsent, { purpose: "notifications", origin: "settings", networkId: root })
    await ada.as.mutation(api.modules.people.consents.recordConsent, { purpose: "directory", origin: "settings", networkId: root })
    expect(await registry(ada.as, diasporale)).toMatchObject({ social_profile: true, directory: false, notifications: false })
    expect(await engineReads(t, diasporale, ada.personId)).toEqual({ notifications: false, directory: false })
  })

  it("l'annuaire suit la même portée : un niveau visible exige l'accord du réseau, pas une ancienne ligne sans réseau", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const ada = await member(t, diasporale)
    await ada.as.mutation(api.modules.people.consents.recordConsent, { purpose: "directory", origin: "settings" })
    await expect(ada.as.mutation(api.modules.diaspora.facet.setDirectoryVisibility, { networkId: diasporale, level: "network" })).rejects.toThrow()
    await ada.as.mutation(api.modules.people.consents.recordConsent, { purpose: "directory", origin: "settings", networkId: diasporale })
    await ada.as.mutation(api.modules.diaspora.facet.setDirectoryVisibility, { networkId: diasporale, level: "network" })
    expect((await ada.as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporale }))?.directoryVisibility).toBe("network")
    expect((await registry(ada.as, diasporale)).directory).toBe(true)
  })

  it("une demande d'attestation en cours s'arrête au retrait : le registre le dit, la réponse n'est plus reçue", async () => {
    // Horloge figée : l'appel programmé vers consulat.ga ne part pas pendant le test.
    vi.useFakeTimers()
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const ada = await member(t, diasporale)
    const { attestationId } = await ada.as.mutation(api.modules.diaspora.attestation.requestConsularAttestation, { networkId: diasporale, consent: true })
    expect((await registry(ada.as, diasporale)).consular_attestation).toBe(true)
    expect(await t.query(internal.modules.diaspora.attestation.attestationRequest, { attestationId })).not.toBeNull()

    await ada.as.mutation(api.modules.people.consents.revokeConsent, { purpose: "consular_attestation", networkId: diasporale })
    expect((await registry(ada.as, diasporale)).consular_attestation).toBe(false)
    expect(await t.query(internal.modules.diaspora.attestation.attestationRequest, { attestationId })).toBeNull()

    await t.mutation(internal.modules.diaspora.attestation.recordAttestation, {
      attestationId,
      response: { verified: true, countryOfResidence: "FR", postSlug: "consulat-general-paris", registrationStatus: "active", attestedAt: Date.now() },
    })
    expect(await t.run(async (ctx) => await ctx.db.get(attestationId))).toMatchObject({ result: "failed" })
    const links = await t.run(async (ctx) => await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", ada.personId).eq("provider", "consular_attestation")).take(5))
    expect(links).toEqual([])
    expect(await ada.as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporale })).toMatchObject({ status: "declaree" })
  })
})
