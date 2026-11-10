// @vitest-environment edge-runtime
/**
 * Tranche `diaspora` (DIASPORALE PD1) : réseau gouverné, entrée par les règles du
 * domaine, adhésion ANTSIA dérivée, parrainage (A3), départ, facette et annuaire,
 * hubs aux compteurs matérialisés, graine idempotente, étanchéité entre réseaux.
 */
import { engineErrorAppRule, engineErrorCode } from "@antsia/social-contracts/errors"
import { validateFacetSchema } from "@antsia/social-domain/facets"
import { ATTESTATION_PATH, canonicalAttestationString, DAY_MS, DEFAULT_FACET_VISIBILITY, MEMBER_COUNTER_DISPLAY_THRESHOLD, SPONSORSHIPS_PER_WINDOW } from "@diasporale/domain"
import { afterEach, describe, expect, it, vi } from "vitest"

import catalog from "../../../deploy/catalog.json"
import { api, components, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import schema from "../../schema"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, testConvex } from "../../test.setup"
import { sha256Hex, signAttestation } from "./attestation"
import { applyDerivedStatus, membershipGrounds } from "./facts"
import { DIASPORA_SLICE_MANIFEST } from "./manifest"
import { diasporaTables } from "./tables"

type T = ReturnType<typeof testConvex>
type As = ReturnType<T["withIdentity"]>

const FRANCE = { countryOfResidence: "FR", city: "Lyon" }

async function seedAll(t: T) {
  const foundations = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const diaspora = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  return { root: foundations.root, testClosed: foundations.testClosed, diasporale: diaspora.network }
}

/** Une personne qui a choisi son profil et consenti au profil social (sans adhésion). */
async function person(t: T, subject: string, handle: string) {
  const as = t.withIdentity({ subject })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  return { as, personId }
}

async function linkIdn(t: T, personId: Id<"persons">, loa: number, nationality?: string) {
  await t.run(async (ctx) => {
    await ctx.db.insert("identityLinks", {
      personId,
      provider: "idn",
      subject: `idn-${personId}`,
      loa,
      ...(nationality ? { nationality } : {}),
      linkedAt: Date.now(),
    })
  })
}

async function linkConsularAttestation(t: T, personId: Id<"persons">) {
  await t.run(async (ctx) => {
    await ctx.db.insert("identityLinks", {
      personId,
      provider: "consular_attestation",
      subject: `empreinte-${personId}`,
      country: "FR",
      postSlug: "consulat-general-paris",
      linkedAt: Date.now(),
    })
  })
}

async function membership(t: T, networkId: Id<"networks">, personId: Id<"persons">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("networkMemberships")
      .withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId))
      .unique(),
  )
}

/** Un membre vérifié par attestation consulaire, vérifié depuis `verifiedDaysAgo` jours. */
async function verifiedSponsor(t: T, diasporale: Id<"networks">, subject: string, handle: string, verifiedDaysAgo = 31) {
  const sponsor = await person(t, subject, handle)
  await linkConsularAttestation(t, sponsor.personId)
  expect(await sponsor.as.mutation(api.modules.diaspora.membership.joinDiasporale, { networkId: diasporale, facet: FRANCE })).toMatchObject({
    status: "verifiee",
  })
  const row = await membership(t, diasporale, sponsor.personId)
  await t.run(async (ctx) => {
    if (row) await ctx.db.patch(row._id, { statusChangedAt: Date.now() - verifiedDaysAgo * DAY_MS })
  })
  return sponsor
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error("aucune erreur levée")
}

async function refusal(promise: Promise<unknown>) {
  const error = await caught(promise)
  return { code: engineErrorCode(error), app: engineErrorAppRule(error) }
}

async function join(as: As, networkId: Id<"networks">, facet: Record<string, unknown> = FRANCE, directoryVisibility?: "hidden" | "country" | "network") {
  return await as.mutation(api.modules.diaspora.membership.joinDiasporale, {
    networkId,
    facet: facet as { countryOfResidence: string },
    ...(directoryVisibility ? { directoryVisibility } : {}),
  })
}

/** Rejoue le raccord de la tranche après un fait nouveau, avec les faits réellement stockés. */
async function reconcileDerivedStatus(t: T, networkId: Id<"networks">, personId: Id<"persons">) {
  return await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique()
    if (!row) throw new Error("Adhésion de fixture absente")
    return await applyDerivedStatus(ctx, row, await membershipGrounds(ctx, networkId, personId, row), null, Date.now())
  })
}

afterEach(() => {
  vi.useRealTimers()
})

describe("graine et manifeste de la tranche", () => {
  it("sème diasporale : fermé, enfant d'ANTSIA, gouverné par la tranche, facette valide, France ouverte", async () => {
    const t = testConvex()
    const { root, diasporale } = await seedAll(t)
    const network = await t.run(async (ctx) => ctx.db.get(diasporale))
    expect(network).toMatchObject({
      slug: "diasporale",
      kind: "closed",
      parentId: root,
      managedBy: "diaspora",
      membershipPolicy: "declared_or_verified",
      defaultVisibility: "network",
      openCountries: ["FR"],
      reachValues: ["local", "diaspora"],
      theme: "diasporale",
      status: "active",
    })
    expect(validateFacetSchema(network?.facetSchema ?? { fields: [] })).toEqual([])
    expect(network?.facetSchema?.fields.map((field) => field.key)).toEqual(Object.keys(DEFAULT_FACET_VISIBILITY))
    const hubs = await t.run(async (ctx) => ctx.db.query("countryHubs").take(10))
    expect(hubs.map((hub) => [hub.country, hub.members, hub.countersComputedAt])).toEqual([["FR", 0, undefined]])
  })

  it("est idempotente, et refusée sans confirmation ou sans racine", async () => {
    const t = testConvex()
    await expect(t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })).rejects.toThrow(/racine/)
    const { diasporale } = await seedAll(t)
    const again = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
    expect(again).toEqual({ network: diasporale, created: false, hubs: [] })
    await expect(t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: "oui" })).rejects.toThrow(/hors production/)
  })

  it("le manifeste dit vrai : ses tables sont au schéma du moteur", () => {
    expect([...DIASPORA_SLICE_MANIFEST.tables].sort()).toEqual(Object.keys(diasporaTables).sort())
    for (const table of DIASPORA_SLICE_MANIFEST.tables) expect(Object.keys(schema.tables)).toContain(table)
  })

  it("le manifeste dit vrai : son application est celle de DIASPORALE au catalogue, sa marque le nom du réseau", async () => {
    const application = catalog.applications[DIASPORA_SLICE_MANIFEST.application]
    expect(application.path).toMatch(/^\.\.\/DIASPORALE\//)
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    expect((await t.run(async (ctx) => await ctx.db.get(diasporale)))?.name).toBe(DIASPORA_SLICE_MANIFEST.brand)
  })
})

describe("réseau gouverné : les chemins génériques refusent", () => {
  it("joinNetwork et setMyFacet du moteur refusent diasporale ; la tranche, elle, l'ouvre", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const ada = await person(t, "auth-ada", "ada.lovelace")
    await linkIdn(t, ada.personId, 3, "FR")
    // Une identité IDN étrangère de garantie 3 entrerait « déclarée » par le chemin générique.
    expect((await refusal(ada.as.mutation(api.modules.people.memberships.joinNetwork, { networkId: diasporale }))).code).toBe("policyRefused")
    expect(await join(ada.as, diasporale)).toEqual({ status: "en_attente", rootStatus: "verifiee" })
    const generic = ada.as.mutation(api.modules.people.facets.setMyFacet, {
      networkId: diasporale,
      values: { countryOfResidence: "FR", postSlug: "consulat-general-paris" },
      visibilities: {},
    })
    expect((await refusal(generic)).code).toBe("policyRefused")
  })
})

describe("entrer dans DIASPORALE (R1, R3)", () => {
  it("un compte léger entre « en attente », ne publie pas, et l'adhésion ANTSIA dérivée existe", async () => {
    const t = testConvex()
    const { root, diasporale } = await seedAll(t)
    const light = await person(t, "auth-light", "compte.leger")
    expect(await join(light.as, diasporale)).toEqual({ status: "en_attente", rootStatus: "declaree" })
    expect(await membership(t, root, light.personId)).toMatchObject({ status: "declaree", derivedFrom: diasporale })
    const publish = light.as.mutation(api.modules.posts.posts.publish, { networkId: diasporale, body: "Bonjour Lyon" })
    expect((await refusal(publish)).code).toBe("statusInsufficient")
    const facet = await t.run(async (ctx) =>
      ctx.db
        .query("personFacets")
        .withIndex("by_network_and_person", (q) => q.eq("networkId", diasporale).eq("personId", light.personId))
        .unique(),
    )
    expect(facet?.values).toEqual({ countryOfResidence: "FR", city: "Lyon", helpAvailable: false })
    expect(facet?.visibilities).toMatchObject({ countryOfResidence: "network", city: "hidden", postSlug: "hidden" })
  })

  it("IDN gabonaise (ou de nationalité inconnue) déclare ; IDN étrangère seule n'ouvre pas ; l'attestation vérifie", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const cases: [string, (personId: Id<"persons">) => Promise<void>, string][] = [
      ["idn.ga", (id) => linkIdn(t, id, 1, "GA"), "declaree"],
      ["idn.inconnue", (id) => linkIdn(t, id, 2), "declaree"],
      ["idn.etrangere", (id) => linkIdn(t, id, 3, "SN"), "en_attente"],
      ["atteste", (id) => linkConsularAttestation(t, id), "verifiee"],
    ]
    for (const [handle, link, expected] of cases) {
      const someone = await person(t, `auth-${handle}`, handle)
      await link(someone.personId)
      expect((await join(someone.as, diasporale)).status).toBe(expected)
    }
    const attested = await t.run(async (ctx) => ctx.db.query("persons").withIndex("by_handle", (q) => q.eq("handle", "atteste")).unique())
    expect(await membership(t, diasporale, attested?._id as Id<"persons">)).toMatchObject({ verifiedBy: "consulat" })
  })

  it("exige le profil puis le consentement ; refuse le Gabon comme pays de résidence, avec son code", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const as = t.withIdentity({ subject: "auth-nouveau" })
    const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    expect((await refusal(join(as, diasporale))).code).toBe("profileRequired")
    await t.run(async (ctx) => ctx.db.patch(personId, { handle: "nouveau", displayName: "Nouveau", publishedAt: Date.now() }))
    expect((await refusal(join(as, diasporale))).code).toBe("consentRequired")
    await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    const home = await refusal(join(as, diasporale, { countryOfResidence: "GA" }))
    expect(home).toEqual({ code: "invalidArgument", app: { appRule: "country_is_home", appParams: {} } })
    const longCity = await refusal(join(as, diasporale, { countryOfResidence: "FR", city: "x".repeat(81) }))
    expect(longCity.app?.appRule).toBe("city_too_long")
    expect(await membership(t, diasporale, personId)).toBeNull()
  })

  it("l'annuaire est opt-in : un niveau visible exige le consentement en vigueur", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const ada = await person(t, "auth-ada", "ada")
    const refused = await refusal(join(ada.as, diasporale, FRANCE, "country"))
    expect(refused).toEqual({ code: "policyRefused", app: { appRule: "consent_directory_required", appParams: {} } })
    await ada.as.mutation(api.modules.people.consents.recordConsent, { purpose: "directory", origin: "onboarding", networkId: diasporale })
    await join(ada.as, diasporale, FRANCE, "country")
    expect(await ada.as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporale })).toMatchObject({ directoryVisibility: "country" })
  })

  it("un réseau qui n'est pas gouverné par la tranche reçoit le refus indistinct", async () => {
    const t = testConvex()
    const { root, testClosed } = await seedAll(t)
    const ada = await person(t, "auth-ada", "ada")
    expect((await refusal(join(ada.as, testClosed))).code).toBe("notFound")
    expect((await refusal(join(ada.as, root))).code).toBe("notFound")
    expect(await ada.as.query(api.modules.diaspora.membership.myMembership, { networkId: root })).toBeNull()
  })
})

describe("vérification tardive de DIASPORALE — adhésion racine dérivée (PA4)", () => {
  it.each([
    { childStatus: "en_attente", rootStatus: "declaree" },
    { childStatus: "declaree", rootStatus: "en_attente" },
    { childStatus: "verifiee", rootStatus: "declaree" },
  ] as const)("élève la racine existante $rootStatus après le fait consulaire de l'enfant $childStatus", async ({ childStatus, rootStatus }) => {
    const t = testConvex()
    const { root, testClosed, diasporale } = await seedAll(t)
    const light = await person(t, "auth-light", "compte.leger")
    await join(light.as, diasporale)
    const rootBefore = await membership(t, root, light.personId)
    const child = await membership(t, diasporale, light.personId)
    if (!rootBefore || !child) throw new Error("Adhésions de fixture absentes")
    await t.run(async (ctx) => {
      await ctx.db.patch(rootBefore._id, { status: rootStatus, role: "network_admin", derivedFrom: testClosed })
      await ctx.db.patch(child._id, { status: childStatus })
    })
    await linkConsularAttestation(t, light.personId)

    expect(await reconcileDerivedStatus(t, diasporale, light.personId)).toBe("verifiee")
    expect(await membership(t, diasporale, light.personId)).toMatchObject({ status: "verifiee", verifiedBy: "consulat" })
    expect(await membership(t, root, light.personId)).toMatchObject({
      _id: rootBefore._id,
      status: "verifiee",
      verifiedBy: "consulat",
      role: "network_admin",
      derivedFrom: testClosed,
      joinedAt: rootBefore.joinedAt,
    })
    expect(await t.run(async (ctx) => ctx.db.query("networkMemberships").withIndex("by_person_and_status", (q) => q.eq("personId", light.personId)).take(5))).toHaveLength(2)
  })

  it.each(["suspendue", "partie", "absente"] as const)("ne réactive ni ne recrée une racine %s", async (status) => {
    const t = testConvex()
    const { root, diasporale } = await seedAll(t)
    const light = await person(t, "auth-light", "compte.leger")
    await join(light.as, diasporale)
    const rootRow = await membership(t, root, light.personId)
    if (!rootRow) throw new Error("Racine de fixture absente")
    await t.run(async (ctx) => {
      if (status === "absente") await ctx.db.delete(rootRow._id)
      else await ctx.db.patch(rootRow._id, { status, ...(status === "partie" ? { leftAt: Date.now() } : { statusBeforeSuspension: "declaree" as const }) })
    })
    const before = await membership(t, root, light.personId)
    await linkConsularAttestation(t, light.personId)

    expect(await reconcileDerivedStatus(t, diasporale, light.personId)).toBe("verifiee")
    expect(await membership(t, root, light.personId)).toEqual(before)
    expect(await t.run(async (ctx) => ctx.db.query("networkMemberships").withIndex("by_person_and_status", (q) => q.eq("personId", light.personId)).take(5))).toHaveLength(status === "absente" ? 1 : 2)
  })

  it.each(["suspendue", "partie"] as const)("n'élève pas la racine quand l'enfant est %s", async (status) => {
    const t = testConvex()
    const { root, diasporale } = await seedAll(t)
    const light = await person(t, "auth-light", "compte.leger")
    await join(light.as, diasporale)
    const child = await membership(t, diasporale, light.personId)
    if (!child) throw new Error("Enfant de fixture absent")
    await t.run(async (ctx) => ctx.db.patch(child._id, { status, ...(status === "partie" ? { leftAt: Date.now() } : { statusBeforeSuspension: "en_attente" as const }) }))
    const before = await membership(t, root, light.personId)
    await linkConsularAttestation(t, light.personId)

    expect(await reconcileDerivedStatus(t, diasporale, light.personId)).toBe(status)
    expect(await membership(t, root, light.personId)).toEqual(before)
    expect(await membership(t, diasporale, light.personId)).toMatchObject({ status, ...(status === "suspendue" ? { statusBeforeSuspension: "verifiee" } : {}) })
  })

  it("conserve la source, le rôle et l'origine d'une racine déjà vérifiée", async () => {
    const t = testConvex()
    const { root, testClosed, diasporale } = await seedAll(t)
    const light = await person(t, "auth-light", "compte.leger")
    await join(light.as, diasporale)
    const rootRow = await membership(t, root, light.personId)
    if (!rootRow) throw new Error("Racine de fixture absente")
    await t.run(async (ctx) => ctx.db.patch(rootRow._id, { status: "verifiee", verifiedBy: "operator", role: "network_moderator", derivedFrom: testClosed }))
    const before = await membership(t, root, light.personId)
    await linkConsularAttestation(t, light.personId)

    expect(await reconcileDerivedStatus(t, diasporale, light.personId)).toBe("verifiee")
    expect(await membership(t, root, light.personId)).toEqual(before)
  })

  it.each(["declaree", "verifiee"] as const)("sans preuve courante de l'enfant, ne change pas la racine %s", async (rootStatus) => {
    const t = testConvex()
    const { root, diasporale } = await seedAll(t)
    const light = await person(t, "auth-light", "compte.leger")
    await join(light.as, diasporale)
    const rootRow = await membership(t, root, light.personId)
    const child = await membership(t, diasporale, light.personId)
    if (!rootRow || !child) throw new Error("Adhésions de fixture absentes")
    await t.run(async (ctx) => {
      await ctx.db.patch(rootRow._id, { status: rootStatus, verifiedBy: rootStatus === "verifiee" ? "operator" : undefined })
      await ctx.db.patch(child._id, { status: "verifiee", verifiedBy: "consulat" })
    })
    const before = await membership(t, root, light.personId)

    expect(await reconcileDerivedStatus(t, diasporale, light.personId)).toBe("en_attente")
    expect(await membership(t, root, light.personId)).toEqual(before)
  })
})

describe("parrainage (EXF-DG-04, arbitrage A3)", () => {
  it("un parrain vérifié depuis plus de 30 jours fait passer un compte léger « déclaré » (R3)", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const sponsor = await verifiedSponsor(t, diasporale, "auth-parrain", "parrain")
    const light = await person(t, "auth-light", "compte.leger")
    await join(light.as, diasporale)
    const { sponsorshipId } = await sponsor.as.mutation(api.modules.diaspora.membership.sponsor, { networkId: diasporale, handle: "@Compte.Leger" })
    expect(await membership(t, diasporale, light.personId)).toMatchObject({ status: "declaree", sponsorPersonId: sponsor.personId })
    const mine = await light.as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporale })
    expect(mine).toMatchObject({ status: "declaree", sponsoredBy: { handle: "parrain", displayName: "parrain" } })
    expect(mine?.capabilities).toContain("publish")
    await light.as.mutation(api.modules.posts.posts.publish, { networkId: diasporale, body: "Merci pour l'accueil" })
    const dashboard = await sponsor.as.query(api.modules.diaspora.membership.sponsorDashboard, { networkId: diasporale })
    expect(dashboard).toMatchObject({ eligible: true, refusal: null, remaining: SPONSORSHIPS_PER_WINDOW - 1, windowDays: 30 })
    expect(dashboard.given).toEqual([{ _id: sponsorshipId, sponsored: { handle: "compte.leger", displayName: "compte.leger" }, createdAt: expect.any(Number), revokedAt: null }])
  })

  it("IDN de garantie ≥ 2 et parrainage vérifient", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const sponsor = await verifiedSponsor(t, diasporale, "auth-parrain", "parrain")
    const idn = await person(t, "auth-idn", "idn.forte")
    await linkIdn(t, idn.personId, 2, "GAB")
    expect((await join(idn.as, diasporale)).status).toBe("declaree")
    await sponsor.as.mutation(api.modules.diaspora.membership.sponsor, { networkId: diasporale, handle: "idn.forte" })
    expect(await membership(t, diasporale, idn.personId)).toMatchObject({ status: "verifiee", verifiedBy: "idn" })
  })

  it("le parrain d'abord : non vérifié, trop récent (avec sa date), quota atteint", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const light = await person(t, "auth-light", "compte.leger")
    await join(light.as, diasporale)
    const declared = await person(t, "auth-declare", "declare")
    await linkIdn(t, declared.personId, 1, "GA")
    await join(declared.as, diasporale)
    expect((await refusal(declared.as.mutation(api.modules.diaspora.membership.sponsor, { networkId: diasporale, handle: "compte.leger" }))).app?.appRule).toBe(
      "sponsor_not_verified",
    )
    const recent = await verifiedSponsor(t, diasporale, "auth-recent", "recent", 2)
    const tooRecent = await refusal(recent.as.mutation(api.modules.diaspora.membership.sponsor, { networkId: diasporale, handle: "compte.leger" }))
    expect(tooRecent.app?.appRule).toBe("sponsor_too_recent")
    expect(tooRecent.app?.appParams.availableAt).toBeGreaterThan(Date.now())
    const busy = await verifiedSponsor(t, diasporale, "auth-occupe", "occupe")
    await t.run(async (ctx) => {
      for (let index = 0; index < SPONSORSHIPS_PER_WINDOW; index += 1) {
        await ctx.db.insert("sponsorships", {
          networkId: diasporale,
          sponsorPersonId: busy.personId,
          sponsoredPersonId: light.personId,
          createdAt: Date.now() - index * DAY_MS,
          revokedAt: Date.now(),
          revokedBy: "sponsor",
        })
      }
    })
    const quota = await refusal(busy.as.mutation(api.modules.diaspora.membership.sponsor, { networkId: diasporale, handle: "compte.leger" }))
    expect(quota.app).toEqual({ appRule: "sponsor_quota_reached", appParams: { limit: SPONSORSHIPS_PER_WINDOW, windowDays: 30 } })
    expect((await busy.as.query(api.modules.diaspora.membership.sponsorDashboard, { networkId: diasporale })).refusal).toBe("sponsor_quota_reached")
  })

  it("la cible ensuite, en un refus indistinct : inconnue, non membre, déjà parrainée, vérifiée ; soi-même à part", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const sponsor = await verifiedSponsor(t, diasporale, "auth-parrain", "parrain")
    const other = await verifiedSponsor(t, diasporale, "auth-autre", "autre")
    const outsider = await person(t, "auth-dehors", "dehors")
    const light = await person(t, "auth-light", "compte.leger")
    await join(light.as, diasporale)
    await other.as.mutation(api.modules.diaspora.membership.sponsor, { networkId: diasporale, handle: "compte.leger" })
    for (const handle of ["inconnu", "dehors", "compte.leger", "autre"]) {
      const result = await refusal(sponsor.as.mutation(api.modules.diaspora.membership.sponsor, { networkId: diasporale, handle }))
      expect(result.app?.appRule).toBe("target_not_eligible")
    }
    expect((await refusal(sponsor.as.mutation(api.modules.diaspora.membership.sponsor, { networkId: diasporale, handle: "parrain" }))).app?.appRule).toBe(
      "self_sponsorship",
    )
    expect(outsider.personId).toBeDefined()
  })

  it("retirer : le parrain ou la modération ; le statut retombe ; un second retrait est un conflit ; les autres ne voient rien", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const sponsor = await verifiedSponsor(t, diasporale, "auth-parrain", "parrain")
    const light = await person(t, "auth-light", "compte.leger")
    await join(light.as, diasporale)
    const { sponsorshipId } = await sponsor.as.mutation(api.modules.diaspora.membership.sponsor, { networkId: diasporale, handle: "compte.leger" })
    const stranger = await verifiedSponsor(t, diasporale, "auth-tiers", "tiers")
    expect((await refusal(stranger.as.mutation(api.modules.diaspora.membership.revokeSponsorship, { networkId: diasporale, sponsorshipId }))).code).toBe(
      "notFound",
    )
    await sponsor.as.mutation(api.modules.diaspora.membership.revokeSponsorship, { networkId: diasporale, sponsorshipId })
    expect(await membership(t, diasporale, light.personId)).toMatchObject({ status: "en_attente" })
    expect((await membership(t, diasporale, light.personId))?.sponsorPersonId).toBeUndefined()
    const again = await refusal(sponsor.as.mutation(api.modules.diaspora.membership.revokeSponsorship, { networkId: diasporale, sponsorshipId }))
    expect(again).toEqual({ code: "conflict", app: { appRule: "already_revoked", appParams: {} } })

    // La modération du réseau retire aussi (journal : « moderator »).
    const second = await sponsor.as.mutation(api.modules.diaspora.membership.sponsor, { networkId: diasporale, handle: "compte.leger" })
    const strangerRow = await membership(t, diasporale, stranger.personId)
    await t.run(async (ctx) => {
      if (strangerRow) await ctx.db.patch(strangerRow._id, { role: "network_moderator" })
    })
    // Une décision de la modération exige son motif, et entre au journal du moteur.
    const noReason = await refusal(stranger.as.mutation(api.modules.diaspora.membership.revokeSponsorship, { networkId: diasporale, sponsorshipId: second.sponsorshipId }))
    expect(noReason.code).toBe("invalidArgument")
    await stranger.as.mutation(api.modules.diaspora.membership.revokeSponsorship, {
      networkId: diasporale,
      sponsorshipId: second.sponsorshipId,
      reason: "Parrainage de complaisance signalé",
    })
    expect(await t.run(async (ctx) => ctx.db.get(second.sponsorshipId))).toMatchObject({ revokedBy: "moderator" })
    const audit = await t.run(async (ctx) => ctx.db.query("engineAudit").take(10))
    expect(audit.map((row) => [row.action, row.capacity, row.actorPersonId, row.subjectTable, row.subjectId])).toEqual([
      ["diaspora.sponsorship_revoke", "network_moderator", stranger.personId, "persons", light.personId],
    ])
    expect(audit[0]?.details).toEqual({ sponsorPersonId: sponsor.personId, reason: "Parrainage de complaisance signalé" })
  })

  it("un départ éteint le parrainage ; au retour, la personne repart « en attente »", async () => {
    const t = testConvex()
    const { root, diasporale } = await seedAll(t)
    const sponsor = await verifiedSponsor(t, diasporale, "auth-parrain", "parrain")
    const light = await person(t, "auth-light", "compte.leger")
    await join(light.as, diasporale)
    const { sponsorshipId } = await sponsor.as.mutation(api.modules.diaspora.membership.sponsor, { networkId: diasporale, handle: "compte.leger" })
    await light.as.mutation(api.modules.diaspora.membership.leaveDiasporale, { networkId: diasporale })
    expect(await membership(t, diasporale, light.personId)).toMatchObject({ status: "partie" })
    expect(await membership(t, root, light.personId)).toMatchObject({ status: "declaree" })
    expect(await t.run(async (ctx) => ctx.db.get(sponsorshipId))).toMatchObject({ revokedBy: "departure" })
    expect((await join(light.as, diasporale)).status).toBe("en_attente")
  })
})

describe("facette et confidentialité", () => {
  it("la facette se règle par les règles du domaine ; le poste consulaire saisi n'existe pas ; les niveaux fins sont gardés", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const ada = await person(t, "auth-ada", "ada")
    await join(ada.as, diasporale)
    await ada.as.mutation(api.modules.diaspora.facet.updateMyFacet, {
      networkId: diasporale,
      facet: { countryOfResidence: "be", city: "  Bruxelles ", arrivedAt: 2015, helpAvailable: true, visibility: { city: "country", arrivedAt: "connections" } },
    })
    const mine = await ada.as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporale })
    expect(mine?.facet).toEqual({
      countryOfResidence: "BE",
      city: "Bruxelles",
      associationIds: [],
      arrivedAt: 2015,
      helpAvailable: true,
      visibility: { ...DEFAULT_FACET_VISIBILITY, city: "country", arrivedAt: "connections" },
    })
    const wrongYear = await refusal(ada.as.mutation(api.modules.diaspora.facet.updateMyFacet, { networkId: diasporale, facet: { countryOfResidence: "BE", arrivedAt: 1900 } }))
    expect(wrongYear.app?.appRule).toBe("arrived_at_out_of_range")
  })

  it("l'attestation pose le poste ; la saisie le garde sans pouvoir l'écrire", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const ada = await person(t, "auth-ada", "ada")
    await join(ada.as, diasporale)
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("personFacets")
        .withIndex("by_network_and_person", (q) => q.eq("networkId", diasporale).eq("personId", ada.personId))
        .unique()
      if (row) await ctx.db.patch(row._id, { values: { ...row.values, postSlug: "consulat-general-paris" } })
    })
    await ada.as.mutation(api.modules.diaspora.facet.updateMyFacet, { networkId: diasporale, facet: { countryOfResidence: "FR", city: "Paris" } })
    const mine = await ada.as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporale })
    expect(mine?.facet).toMatchObject({ city: "Paris", postSlug: "consulat-general-paris" })
  })

  it("le niveau d'annuaire : « personne » sans condition, un autre avec le consentement", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const ada = await person(t, "auth-ada", "ada")
    await join(ada.as, diasporale)
    const refused = await refusal(ada.as.mutation(api.modules.diaspora.facet.setDirectoryVisibility, { networkId: diasporale, level: "network" }))
    expect(refused.app?.appRule).toBe("consent_directory_required")
    await ada.as.mutation(api.modules.diaspora.facet.setDirectoryVisibility, { networkId: diasporale, level: "hidden" })
    await ada.as.mutation(api.modules.people.consents.recordConsent, { purpose: "directory", origin: "settings" })
    await ada.as.mutation(api.modules.diaspora.facet.setDirectoryVisibility, { networkId: diasporale, level: "network" })
    expect((await ada.as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporale }))?.directoryVisibility).toBe("network")
  })
})

describe("myMembership — projection allowlistée de soi", () => {
  it("rend le statut effectif, les badges calculés, l'ANTSIA dérivée — et rien de consulaire", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const ada = await person(t, "auth-ada", "ada")
    await linkConsularAttestation(t, ada.personId)
    await join(ada.as, diasporale)
    const mine = await ada.as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporale })
    expect(mine).toMatchObject({
      status: "verifiee",
      badges: ["verified"],
      root: { status: "verifiee" },
      attestation: { outcome: "none", postSlug: "consulat-general-paris", requestedAt: null },
      rateTier: "standard",
    })
    expect(mine?.verifiedSince).toEqual(expect.any(Number))
    expect(Object.keys(mine ?? {}).sort()).toEqual(
      ["attestation", "badges", "capabilities", "directoryVisibility", "facet", "joinedAt", "role", "root", "rateTier", "sponsoredBy", "status", "verifiedSince"].sort(),
    )
    expect(await t.withIdentity({ subject: "auth-sans-personne" }).query(api.modules.diaspora.membership.myMembership, { networkId: diasporale })).toBeNull()
  })

  it("une suspension ANTSIA vaut dans DIASPORALE", async () => {
    const t = testConvex()
    const { root, diasporale } = await seedAll(t)
    const ada = await person(t, "auth-ada", "ada")
    await join(ada.as, diasporale)
    const rootRow = await membership(t, root, ada.personId)
    await t.run(async (ctx) => {
      if (rootRow) await ctx.db.patch(rootRow._id, { status: "suspendue", statusBeforeSuspension: "declaree" })
    })
    expect((await ada.as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporale }))?.status).toBe("suspendue")
    expect((await refusal(ada.as.query(api.modules.diaspora.hubs.getCountryHub, { networkId: diasporale, country: "FR" }))).code).toBe(
      "membershipSuspended",
    )
  })
})

describe("étanchéité entre réseaux", () => {
  it("un membre d'ANTSIA seul ne lit ni le fil ni les hubs de diasporale ; la tranche refuse un autre réseau", async () => {
    const t = testConvex()
    const { root, diasporale } = await seedAll(t)
    const author = await verifiedSponsor(t, diasporale, "auth-auteur", "auteur")
    await author.as.mutation(api.modules.posts.posts.publish, { networkId: diasporale, body: "Réservé au réseau" })
    const antsiaOnly = await person(t, "auth-antsia", "antsia.seule")
    await antsiaOnly.as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
    const feed = antsiaOnly.as.query(api.modules.posts.posts.feed, { networkId: diasporale, paginationOpts: { numItems: 10, cursor: null } })
    expect((await refusal(feed)).code).toBe("notFound")
    expect((await refusal(antsiaOnly.as.query(api.modules.diaspora.hubs.getCountryHub, { networkId: diasporale, country: "FR" }))).code).toBe("notFound")
    // Membre de la racine, mais la racine n'est pas gouvernée par la tranche : refus indistinct.
    expect((await refusal(antsiaOnly.as.query(api.modules.diaspora.hubs.getCountryHub, { networkId: root, country: "FR" }))).code).toBe("notFound")
    expect((await refusal(antsiaOnly.as.query(api.modules.diaspora.membership.sponsorDashboard, { networkId: root }))).code).toBe("notFound")
    // La vitrine publique d'un réseau non gouverné est vide : rien n'y est annoncé.
    expect(await antsiaOnly.as.query(api.modules.diaspora.hubs.listOpenCountries, { networkId: root })).toEqual([])
  })
})

describe("hubs pays — compteurs matérialisés, jamais calculés à la lecture", () => {
  async function listedMember(t: T, diasporale: Id<"networks">, index: number, country = "FR") {
    const member = await person(t, `auth-membre-${index}`, `membre.${index}`)
    await linkIdn(t, member.personId, 1, "GA")
    await member.as.mutation(api.modules.people.consents.recordConsent, { purpose: "directory", origin: "onboarding", networkId: diasporale })
    await join(member.as, diasporale, { countryOfResidence: country }, "country")
    return member
  }

  it("la lecture rend la présentation stockée ; seul le passage nocturne compte", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const first = await listedMember(t, diasporale, 1)
    await listedMember(t, diasporale, 2)
    await listedMember(t, diasporale, 3, "BE")
    const hidden = await person(t, "auth-cache", "cache")
    await linkIdn(t, hidden.personId, 1, "GA")
    await join(hidden.as, diasporale)
    const light = await person(t, "auth-leger", "leger")
    await light.as.mutation(api.modules.people.consents.recordConsent, { purpose: "directory", origin: "onboarding" })
    await join(light.as, diasporale, FRANCE, "country")

    const before = await first.as.query(api.modules.diaspora.hubs.getCountryHub, { networkId: diasporale, country: "fr" })
    expect(before).toEqual({
      country: "FR",
      open: true,
      counters: expect.objectContaining({ dormant: true }),
      countersComputedAt: null,
    })

    vi.useFakeTimers()
    await t.mutation(internal.modules.diaspora.hubs.refreshHubCounters, { pageSize: 2 })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const rows = await t.run(async (ctx) => ctx.db.query("countryHubs").take(10))
    // Deux listés en France (le membre caché et le compte en attente ne comptent pas), un en Belgique.
    expect(Object.fromEntries(rows.map((row) => [row.country, row.members]))).toEqual({ FR: 2, BE: 1 })

    const after = await first.as.query(api.modules.diaspora.hubs.getCountryHub, { networkId: diasporale, country: "FR" })
    expect(after.countersComputedAt).toEqual(expect.any(Number))
    // Sous le seuil, le chiffre ne quitte pas le serveur.
    expect(after.counters.members).toEqual({ kind: "below_threshold", threshold: MEMBER_COUNTER_DISPLAY_THRESHOLD })
    expect(after.counters.dormant).toBe(false)
    const open = await first.as.query(api.modules.diaspora.hubs.listOpenCountries, { networkId: diasporale })
    expect(open.map((hub) => hub.country)).toEqual(["FR"])
    // La vitrine publique lit la même présentation, sans compte ; jamais le chiffre sous le seuil.
    const anonymous = await t.query(api.modules.diaspora.hubs.listOpenCountries, { networkId: diasporale })
    expect(anonymous).toEqual(open)
    expect(JSON.stringify(anonymous)).not.toContain('"value":2')
    expect((await refusal(first.as.query(api.modules.diaspora.hubs.getCountryHub, { networkId: diasporale, country: "GA" }))).code).toBe("notFound")
  })

  it("un consentement retiré sort la personne du compte au passage suivant", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const member = await listedMember(t, diasporale, 1)
    vi.useFakeTimers()
    await t.mutation(internal.modules.diaspora.hubs.refreshHubCounters, {})
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect((await t.run(async (ctx) => ctx.db.query("countryHubs").take(5))).map((row) => row.members)).toEqual([1])
    await member.as.mutation(api.modules.people.consents.revokeConsent, { purpose: "directory", networkId: diasporale })
    await t.mutation(internal.modules.diaspora.hubs.refreshHubCounters, {})
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect((await t.run(async (ctx) => ctx.db.query("countryHubs").take(5))).map((row) => row.members)).toEqual([0])
  })
})

describe("ce que la personne lit d'elle-même pour DIASPORALE", () => {
  it("myConsents : chaque finalité du réseau, rien de présumé, le dernier geste daté", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const ada = await person(t, "auth-ada", "ada")
    await ada.as.mutation(api.modules.people.consents.recordConsent, { purpose: "directory", origin: "onboarding", networkId: diasporale })
    await ada.as.mutation(api.modules.people.consents.recordConsent, { purpose: "notifications", origin: "onboarding" })
    await ada.as.mutation(api.modules.people.consents.revokeConsent, { purpose: "notifications" })
    const consents = await ada.as.query(api.modules.diaspora.membership.myConsents, { networkId: diasporale })
    expect(consents.map((consent) => [consent.purpose, consent.granted])).toEqual([
      ["social_profile", true],
      ["directory", true],
      ["notifications", false],
      ["consular_attestation", false],
      ["talents", false],
    ])
    expect(consents.find((consent) => consent.purpose === "notifications")?.recordedAt).toEqual(expect.any(Number))
    expect(consents.find((consent) => consent.purpose === "talents")).toMatchObject({ recordedAt: null, textVersion: "2026-10-14" })
    expect(await t.query(api.modules.diaspora.membership.myConsents, { networkId: diasporale })).toEqual([])
  })

  it("myIdentity : le niveau de garantie IDN et l'attestation, ni sujet ni nationalité", async () => {
    const t = testConvex()
    await seedAll(t)
    const ada = await person(t, "auth-ada", "ada")
    expect(await ada.as.query(api.modules.diaspora.membership.myIdentity, {})).toEqual({ idn: null, consularAttestation: false })
    await linkIdn(t, ada.personId, 2, "GA")
    await linkConsularAttestation(t, ada.personId)
    expect(await ada.as.query(api.modules.diaspora.membership.myIdentity, {})).toEqual({ idn: { loa: 2 }, consularAttestation: true })
    expect(await t.query(api.modules.diaspora.membership.myIdentity, {})).toBeNull()
  })
})

describe("graine de recette — parrain vérifié pour jouer R3 en local", () => {
  it("rend vérifié depuis 31 jours un membre existant, par une attestation fictive ; il peut alors parrainer", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const sponsor = await person(t, "auth-parrain", "parrain")
    await join(sponsor.as, diasporale)
    await expect(
      t.mutation(internal.modules.diaspora.seed.verifyForRecette, { confirmNonProduction: SEED_CONFIRMATION, handle: "inconnu" }),
    ).rejects.toThrow(/aucun membre/)
    const result = await t.mutation(internal.modules.diaspora.seed.verifyForRecette, { confirmNonProduction: SEED_CONFIRMATION, handle: "@Parrain" })
    expect(result).toEqual({ status: "verifiee" })
    const row = await membership(t, diasporale, sponsor.personId)
    expect(Date.now() - (row?.statusChangedAt ?? Date.now())).toBeGreaterThan(30 * DAY_MS)
    const light = await person(t, "auth-light", "compte.leger")
    await join(light.as, diasporale)
    await sponsor.as.mutation(api.modules.diaspora.membership.sponsor, { networkId: diasporale, handle: "compte.leger" })
    expect(await membership(t, diasporale, light.personId)).toMatchObject({ status: "declaree" })
    // Rejouée : aucune seconde attestation fictive.
    await t.mutation(internal.modules.diaspora.seed.verifyForRecette, { confirmNonProduction: SEED_CONFIRMATION, handle: "parrain" })
    const links = await t.run(async (ctx) =>
      ctx.db
        .query("identityLinks")
        .withIndex("by_person_and_provider", (q) => q.eq("personId", sponsor.personId).eq("provider", "consular_attestation"))
        .take(5),
    )
    expect(links.map((link) => link.postSlug)).toEqual(["poste-de-recette"])
    await expect(
      t.mutation(internal.modules.diaspora.seed.verifyForRecette, { confirmNonProduction: "oui", handle: "parrain" }),
    ).rejects.toThrow(/hors production/)
  })
})

describe("parrainage et blocage", () => {
  it("un blocage dans la paire, dans un sens ou dans l'autre, rend le même refus indistinct", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const sponsor = await verifiedSponsor(t, diasporale, "auth-parrain", "parrain")
    const light = await person(t, "auth-light", "compte.leger")
    await join(light.as, diasporale)
    await light.as.mutation(api.modules.graph.connections.blockPerson, { networkId: diasporale, targetPersonId: sponsor.personId })
    const refused = await refusal(sponsor.as.mutation(api.modules.diaspora.membership.sponsor, { networkId: diasporale, handle: "compte.leger" }))
    expect(refused.app?.appRule).toBe("target_not_eligible")
    expect(await membership(t, diasporale, light.personId)).toMatchObject({ status: "en_attente" })
  })
})

describe("attestation consulaire DIASPORA-ATTESTATION-V1 (PD3, côté moteur)", () => {
  const SECRET = btoa("k".repeat(32))
  const BASE = "https://consulat.exemple.test"

  function configure() {
    vi.stubEnv("DIASPORA_ATTESTATION_URL", BASE)
    vi.stubEnv("DIASPORA_PARTNER_KEY_ID", "cle-recette")
    vi.stubEnv("DIASPORA_PARTNER_KEY", SECRET)
  }

  /** Un FAUX consulat.ga : vérifie la signature et la forme de la requête, puis rend `reply`. */
  function fakeConsulate(reply: (request: Record<string, unknown>) => unknown, seen: Record<string, unknown>[] = []) {
    const fetchMock = vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input))
      const headers = new Headers(init?.headers)
      const body = String(init?.body)
      expect(url.origin + url.pathname).toBe(`${BASE}${ATTESTATION_PATH}`)
      expect(headers.get("x-diaspora-key-id")).toBe("cle-recette")
      const timestamp = headers.get("x-diaspora-timestamp") ?? ""
      const expected = await signAttestation(SECRET, canonicalAttestationString({ timestamp, bodySha256: await sha256Hex(body) }))
      expect(headers.get("x-diaspora-signature")).toBe(expected)
      const request = JSON.parse(body) as Record<string, unknown>
      seen.push(request)
      return new Response(JSON.stringify(reply(request)), { status: 200, headers: { "content-type": "application/json" } })
    })
    vi.stubGlobal("fetch", fetchMock)
    return fetchMock
  }

  async function settle(t: T) {
    await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
  }

  /** Une personne IDN gabonaise (garantie 1) entrée « déclarée ». */
  async function idnMember(t: T, diasporale: Id<"networks">) {
    const ada = await person(t, "auth-ada", "ada")
    await linkIdn(t, ada.personId, 1, "GA")
    await join(ada.as, diasporale)
    return ada
  }

  /** Compte du vrai composant Better Auth, sans attribut d'identité fourni par le client. */
  async function emailMember(t: T, diasporale: Id<"networks">, options: { emailVerified?: boolean; phoneVerified?: boolean } = {}) {
    const email = "Awa.Email@Exemple.test"
    const now = Date.now()
    const user: unknown = await t.mutation(components.betterAuth.adapter.create, {
      input: {
        model: "user",
        data: {
          name: "Compte de recette",
          email,
          emailVerified: options.emailVerified ?? true,
          ...(options.phoneVerified ? { phoneNumber: "+241060000000", phoneNumberVerified: true } : {}),
          createdAt: now,
          updatedAt: now,
        },
      },
    })
    if (typeof user !== "object" || user === null || !("_id" in user) || typeof user._id !== "string") throw new Error("Compte Better Auth de fixture absent")
    const userId = user._id
    const sessionId = await createTestSession(t, userId)
    const as = t.withIdentity({ subject: userId, sessionId, issuer: "fixture-engine", applicationOrigin: "diasporale" })
    const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    await as.mutation(api.modules.people.profile.publishMyProfile, { handle: "compte.email", displayName: "Compte de recette" })
    await join(as, diasporale)
    return { as, personId, userId, email }
  }

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("présente seulement l'empreinte d'un e-mail vérifié par Better Auth et vérifie ensuite enfant et racine", async () => {
    vi.useFakeTimers()
    configure()
    const t = testConvex({ automaticSessions: false })
    const { root, diasporale } = await seedAll(t)
    const light = await emailMember(t, diasporale)
    const emailHash = await sha256Hex(light.email.toLowerCase())
    const seen: Record<string, unknown>[] = []
    fakeConsulate(() => ({ contract: "DIASPORA-ATTESTATION-V1", verified: true, registrationStatus: "active", countryOfResidence: "FR", postSlug: "consulat-general-paris", attestedAt: Date.now() }), seen)

    const { attestationId } = await light.as.mutation(api.modules.diaspora.attestation.requestConsularAttestation, { networkId: diasporale, consent: true })
    const pending = await t.run(async (ctx) => ctx.db.get(attestationId))
    expect(pending).toMatchObject({ subjectKind: "emailHash", subjectHash: await sha256Hex(emailHash), result: "pending" })
    expect(JSON.stringify(pending)).not.toContain(light.email)
    expect(JSON.stringify(pending)).not.toContain(light.email.toLowerCase())
    expect(await t.query(internal.modules.diaspora.attestation.attestationRequest, { attestationId })).toMatchObject({ subjectKind: "emailHash", subject: emailHash })
    await settle(t)

    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ subjectKind: "emailHash", subject: emailHash })
    expect(JSON.stringify(seen)).not.toContain(light.email.toLowerCase())
    expect(await membership(t, diasporale, light.personId)).toMatchObject({ status: "verifiee", verifiedBy: "consulat" })
    expect(await membership(t, root, light.personId)).toMatchObject({ status: "verifiee", verifiedBy: "consulat", derivedFrom: diasporale })
    const saved = await t.run(async (ctx) => ctx.db.get(attestationId))
    expect(JSON.stringify(saved)).not.toContain(light.email.toLowerCase())
  })

  it.each(["non_verifie", "telephone_seulement", "lien_sans_preuve"] as const)("refuse un sujet e-mail sans preuve courante du composant (%s)", async (kind) => {
    vi.useFakeTimers()
    configure()
    const t = testConvex({ automaticSessions: false })
    const { diasporale } = await seedAll(t)
    const light = await emailMember(t, diasporale, { emailVerified: false, phoneVerified: kind === "telephone_seulement" })
    if (kind === "lien_sans_preuve") {
      await t.run(async (ctx) => ctx.db.insert("identityLinks", { personId: light.personId, provider: "local", channel: "email", subject: "f".repeat(64), linkedAt: Date.now() }))
    }
    const fetchMock = fakeConsulate(() => ({}))

    expect((await refusal(light.as.mutation(api.modules.diaspora.attestation.requestConsularAttestation, { networkId: diasporale, consent: true }))).app?.appRule).toBe("attestation_unavailable")
    expect(await t.run(async (ctx) => ctx.db.query("consularAttestations").take(5))).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(["verification_retiree", "adresse_changee"] as const)("relit le canal avant l'action et n'envoie rien après %s", async (kind) => {
    vi.useFakeTimers()
    configure()
    const t = testConvex({ automaticSessions: false })
    const { diasporale } = await seedAll(t)
    const light = await emailMember(t, diasporale)
    const fetchMock = fakeConsulate(() => ({}))
    const { attestationId } = await light.as.mutation(api.modules.diaspora.attestation.requestConsularAttestation, { networkId: diasporale, consent: true })
    await t.mutation(components.betterAuth.adapter.updateOne, {
      input: { model: "user", where: [{ field: "_id", value: light.userId }], update: kind === "verification_retiree" ? { emailVerified: false } : { email: "autre.adresse@exemple.test" } },
    })

    expect(await t.query(internal.modules.diaspora.attestation.attestationRequest, { attestationId })).toBeNull()
    await settle(t)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await t.run(async (ctx) => ctx.db.get(attestationId))).toMatchObject({ result: "failed" })
  })

  it.each(["avant_envoi", "apres_depart", "nouveau_consentement"] as const)("le retrait du consentement initial ferme la demande (%s)", async (kind) => {
    vi.useFakeTimers()
    configure()
    const t = testConvex({ automaticSessions: false })
    const { root, diasporale } = await seedAll(t)
    const light = await emailMember(t, diasporale)
    const fetchMock = fakeConsulate(() => ({}))
    const { attestationId } = await light.as.mutation(api.modules.diaspora.attestation.requestConsularAttestation, { networkId: diasporale, consent: true })
    const initial = await t.run(async (ctx) => ctx.db.get(attestationId))
    if (!initial) throw new Error("Demande de fixture absente")
    if (kind !== "avant_envoi") expect(await t.query(internal.modules.diaspora.attestation.attestationRequest, { attestationId })).not.toBeNull()
    const childBefore = await membership(t, diasporale, light.personId)
    const rootBefore = await membership(t, root, light.personId)
    await light.as.mutation(api.modules.people.consents.revokeConsent, { purpose: "consular_attestation", networkId: diasporale })
    if (kind === "nouveau_consentement") {
      await light.as.mutation(api.modules.people.consents.recordConsent, { purpose: "consular_attestation", origin: "prompt", networkId: diasporale })
      const consents = await t.run(async (ctx) => ctx.db.query("consents").withIndex("by_person_and_purpose", (q) => q.eq("personId", light.personId).eq("purpose", "consular_attestation")).take(5))
      expect(consents.some((consent) => consent._id !== initial.consentId && consent.revokedAt === undefined)).toBe(true)
    }

    expect(await t.query(internal.modules.diaspora.attestation.attestationRequest, { attestationId })).toBeNull()
    if (kind !== "avant_envoi") await t.mutation(internal.modules.diaspora.attestation.recordAttestation, {
      attestationId,
      response: { verified: true, countryOfResidence: "FR", postSlug: "consulat-general-paris", registrationStatus: "active", attestedAt: Date.now() },
    })
    await settle(t)
    const row = await t.run(async (ctx) => ctx.db.get(attestationId))
    expect(row).toMatchObject({ result: "failed", respondedAt: expect.any(Number), consentId: initial.consentId })
    expect(row?.country).toBeUndefined()
    expect(row?.postSlug).toBeUndefined()
    expect(row?.attestedAt).toBeUndefined()
    expect(await t.run(async (ctx) => ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", light.personId).eq("provider", "consular_attestation")).unique())).toBeNull()
    expect(await membership(t, diasporale, light.personId)).toEqual(childBefore)
    expect(await membership(t, root, light.personId)).toEqual(rootBefore)
    expect((await light.as.query(api.modules.people.persons.getMyPerson, {}))?.badges).not.toContain("verified")
    expect(await bells(t, diasporale, light.personId)).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(["adresse_changee", "verification_retiree", "idn_changee", "idn_retiree"] as const)("refuse une réponse positive si le sujet consenti change après le départ (%s)", async (kind) => {
    vi.useFakeTimers()
    configure()
    const t = testConvex({ automaticSessions: false })
    const { root, diasporale } = await seedAll(t)
    const light = await emailMember(t, diasporale)
    const usesIdn = kind === "idn_changee" || kind === "idn_retiree"
    if (usesIdn) await linkIdn(t, light.personId, 1, "GA")
    const fetchMock = fakeConsulate(() => ({}))
    const { attestationId } = await light.as.mutation(api.modules.diaspora.attestation.requestConsularAttestation, { networkId: diasporale, consent: true })
    // L'action a déjà récupéré sa requête, avant la modification du canal.
    expect(await t.query(internal.modules.diaspora.attestation.attestationRequest, { attestationId })).toMatchObject({ subjectKind: usesIdn ? "idnSub" : "emailHash" })
    const childBefore = await membership(t, diasporale, light.personId)
    const rootBefore = await membership(t, root, light.personId)
    if (usesIdn) {
      await t.run(async (ctx) => {
        const link = await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", light.personId).eq("provider", "idn")).unique()
        if (!link) throw new Error("Lien IDN de fixture absent")
        await ctx.db.patch(link._id, kind === "idn_retiree" ? { revokedAt: Date.now() } : { subject: "idn-nouveau-sujet" })
      })
    } else {
      await t.mutation(components.betterAuth.adapter.updateOne, {
        input: { model: "user", where: [{ field: "_id", value: light.userId }], update: kind === "verification_retiree" ? { emailVerified: false } : { email: "autre.adresse@exemple.test" } },
      })
    }

    await t.mutation(internal.modules.diaspora.attestation.recordAttestation, {
      attestationId,
      response: { verified: true, countryOfResidence: "FR", postSlug: "consulat-general-paris", registrationStatus: "active", attestedAt: Date.now() },
    })
    const row = await t.run(async (ctx) => ctx.db.get(attestationId))
    expect(row).toMatchObject({ result: "failed", respondedAt: expect.any(Number) })
    expect(row?.country).toBeUndefined()
    expect(row?.postSlug).toBeUndefined()
    expect(row?.attestedAt).toBeUndefined()
    expect(await t.run(async (ctx) => ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", light.personId).eq("provider", "consular_attestation")).unique())).toBeNull()
    expect(await membership(t, diasporale, light.personId)).toEqual(childBefore)
    expect(await membership(t, root, light.personId)).toEqual(rootBefore)
    expect((await light.as.query(api.modules.people.persons.getMyPerson, {}))?.badges).not.toContain("verified")
    expect(await bells(t, diasporale, light.personId)).toEqual([])
    await settle(t)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("garde le sujet IDN prioritaire même si l'e-mail vérifié change avant l'action", async () => {
    vi.useFakeTimers()
    configure()
    const t = testConvex({ automaticSessions: false })
    const { diasporale } = await seedAll(t)
    const light = await emailMember(t, diasporale)
    await linkIdn(t, light.personId, 1, "GA")
    const seen: Record<string, unknown>[] = []
    fakeConsulate(() => ({ contract: "DIASPORA-ATTESTATION-V1", verified: false, registrationStatus: "none", attestedAt: Date.now() }), seen)
    const { attestationId } = await light.as.mutation(api.modules.diaspora.attestation.requestConsularAttestation, { networkId: diasporale, consent: true })
    await t.mutation(components.betterAuth.adapter.updateOne, { input: { model: "user", where: [{ field: "_id", value: light.userId }], update: { email: "nouvelle.adresse@exemple.test" } } })

    expect(await t.query(internal.modules.diaspora.attestation.attestationRequest, { attestationId })).toMatchObject({ subjectKind: "idnSub", subject: `idn-${light.personId}` })
    await settle(t)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ subjectKind: "idnSub", subject: `idn-${light.personId}` })
    expect(await t.run(async (ctx) => ctx.db.get(attestationId))).toMatchObject({ subjectKind: "idnSub", subjectHash: await sha256Hex(`idn-${light.personId}`) })
  })

  it("confirmée : lien d'attestation (empreinte), poste sur la facette, statut vérifié — et rien d'autre", async () => {
    vi.useFakeTimers()
    configure()
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const ada = await idnMember(t, diasporale)
    const seen: Record<string, unknown>[] = []
    fakeConsulate(
      () => ({
        contract: "DIASPORA-ATTESTATION-V1",
        verified: true,
        countryOfResidence: "FR",
        postSlug: "consulat-general-paris",
        registrationStatus: "active",
        since: Date.UTC(2023, 2, 1),
        attestedAt: Date.now(),
      }),
      seen,
    )
    const { attestationId } = await ada.as.mutation(api.modules.diaspora.attestation.requestConsularAttestation, { networkId: diasporale, consent: true })
    await settle(t)

    // La requête : quatre champs, le sujet IDN, une référence de consentement conforme.
    expect(Object.keys(seen[0] ?? {})).toEqual(["subjectKind", "subject", "consentRef", "requestedAt"])
    expect(seen[0]).toMatchObject({ subjectKind: "idnSub", subject: `idn-${ada.personId}` })
    expect(String(seen[0]?.consentRef)).toMatch(/^consent:[A-Za-z0-9:_-]{8,}$/)

    // La ligne : l'empreinte du sujet, jamais le sujet ; aucune donnée hors contrat.
    const row = await t.run(async (ctx) => ctx.db.get(attestationId))
    expect(row).toMatchObject({ result: "verified", country: "FR", postSlug: "consulat-general-paris", subjectKind: "idnSub" })
    expect(row?.subjectHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(row)).not.toContain(`idn-${ada.personId}`)
    expect(Object.keys(row ?? {}).sort()).toEqual(
      ["_creationTime", "_id", "attestedAt", "consentId", "consentRef", "country", "networkId", "personId", "postSlug", "requestedAt", "respondedAt", "result", "since", "subjectHash", "subjectKind"].sort(),
    )
    const link = await t.run(async (ctx) =>
      ctx.db
        .query("identityLinks")
        .withIndex("by_person_and_provider", (q) => q.eq("personId", ada.personId).eq("provider", "consular_attestation"))
        .unique(),
    )
    expect(link).toMatchObject({ subject: row?.subjectHash, country: "FR", postSlug: "consulat-general-paris" })
    expect(await membership(t, diasporale, ada.personId)).toMatchObject({ status: "verifiee", verifiedBy: "consulat" })
    const mine = await ada.as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporale })
    expect(mine).toMatchObject({ status: "verifiee", badges: ["verified"], attestation: { outcome: "verified", postSlug: "consulat-general-paris" } })
    expect(mine?.facet?.postSlug).toBe("consulat-general-paris")
    // L'issue de SA demande se lit ; celle d'un autre membre n'existe pas pour lui.
    expect(await ada.as.query(api.modules.diaspora.attestation.myAttestationRequest, { networkId: diasporale, attestationId })).toEqual({ result: "verified" })
    const other = await verifiedSponsor(t, diasporale, "auth-autre", "autre")
    const hidden = await refusal(other.as.query(api.modules.diaspora.attestation.myAttestationRequest, { networkId: diasporale, attestationId }))
    expect(hidden.code).toBe("notFound")
    expect(await bells(t, diasporale, ada.personId)).toEqual([{ kind: "attestation_verified", actor: null }])
    const consent = await t.run(async (ctx) => (row ? ctx.db.get(row.consentId) : null))
    expect(consent).toMatchObject({ purpose: "consular_attestation", origin: "prompt", networkId: diasporale })
  })

  it("non confirmée : l'issue est notée, rien n'est posé, sans raison consulaire", async () => {
    vi.useFakeTimers()
    configure()
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const ada = await idnMember(t, diasporale)
    fakeConsulate(() => ({ contract: "DIASPORA-ATTESTATION-V1", verified: false, registrationStatus: "expired", attestedAt: Date.now() }))
    await ada.as.mutation(api.modules.diaspora.attestation.requestConsularAttestation, { networkId: diasporale, consent: true })
    await settle(t)
    expect(await membership(t, diasporale, ada.personId)).toMatchObject({ status: "declaree" })
    const mine = await ada.as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporale })
    expect(mine?.attestation).toMatchObject({ outcome: "not_confirmed", postSlug: null })
    const links = await t.run(async (ctx) => ctx.db.query("identityLinks").take(10))
    expect(links.map((link) => link.provider)).toEqual(["idn"])
    expect(await bells(t, diasporale, ada.personId)).toEqual([{ kind: "attestation_not_confirmed", actor: null }])
  })

  it("une réponse hors contrat est refusée : échec technique, rien de consulaire n'entre", async () => {
    vi.useFakeTimers()
    configure()
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const ada = await idnMember(t, diasporale)
    fakeConsulate(() => ({
      contract: "DIASPORA-ATTESTATION-V1",
      verified: true,
      countryOfResidence: "FR",
      postSlug: "consulat-general-paris",
      registrationStatus: "active",
      attestedAt: Date.now(),
      passportNumber: "jamais",
    }))
    const { attestationId } = await ada.as.mutation(api.modules.diaspora.attestation.requestConsularAttestation, { networkId: diasporale, consent: true })
    await settle(t)
    const row = await t.run(async (ctx) => ctx.db.get(attestationId))
    expect(row).toMatchObject({ result: "failed" })
    expect(row?.country).toBeUndefined()
    expect(JSON.stringify(row)).not.toContain("jamais")
    // Un échec technique ne sonne pas : l'écran le dit déjà.
    expect(await bells(t, diasporale, ada.personId)).toEqual([])
    expect(await membership(t, diasporale, ada.personId)).toMatchObject({ status: "declaree" })
  })

  it("sans configuration du déploiement, rien ne part", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const ada = await idnMember(t, diasporale)
    const fetchMock = fakeConsulate(() => ({}))
    const { attestationId } = await ada.as.mutation(api.modules.diaspora.attestation.requestConsularAttestation, { networkId: diasporale, consent: true })
    await settle(t)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await t.run(async (ctx) => ctx.db.get(attestationId))).toMatchObject({ result: "failed" })
  })

  it("une demande par 24 h ; inutile pour un membre vérifié ; sans IDN, rien à présenter ; le geste est exigé", async () => {
    vi.useFakeTimers()
    configure()
    fakeConsulate(() => ({ contract: "DIASPORA-ATTESTATION-V1", verified: false, registrationStatus: "none", attestedAt: Date.now() }))
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const ada = await idnMember(t, diasporale)
    await ada.as.mutation(api.modules.diaspora.attestation.requestConsularAttestation, { networkId: diasporale, consent: true })
    await settle(t)
    // Tout de suite : le seau de débit (une demande, puis une toutes les huit heures) refuse d'abord.
    const immediate = await refusal(ada.as.mutation(api.modules.diaspora.attestation.requestConsularAttestation, { networkId: diasporale, consent: true }))
    expect(immediate.code).toBe("rateLimited")
    // Neuf heures plus tard, le seau le permet, mais la règle du domaine (24 h) dit quand.
    vi.advanceTimersByTime(9 * 60 * 60 * 1000)
    const again = await refusal(ada.as.mutation(api.modules.diaspora.attestation.requestConsularAttestation, { networkId: diasporale, consent: true }))
    expect(again.app?.appRule).toBe("attestation_too_soon")
    expect(again.app?.appParams.availableAt).toBeGreaterThan(Date.now())

    const verified = await verifiedSponsor(t, diasporale, "auth-verifie", "verifie")
    const notNeeded = await refusal(verified.as.mutation(api.modules.diaspora.attestation.requestConsularAttestation, { networkId: diasporale, consent: true }))
    expect(notNeeded).toEqual({ code: "conflict", app: { appRule: "attestation_not_needed", appParams: {} } })

    const light = await person(t, "auth-leger", "leger")
    await join(light.as, diasporale)
    const unavailable = await refusal(light.as.mutation(api.modules.diaspora.attestation.requestConsularAttestation, { networkId: diasporale, consent: true }))
    expect(unavailable.app?.appRule).toBe("attestation_unavailable")

    await expect(
      light.as.mutation(api.modules.diaspora.attestation.requestConsularAttestation, { networkId: diasporale, consent: false as never }),
    ).rejects.toThrow()
  })
})

/** Les cloches d'une personne dans le réseau, du moteur (genre et acteur seulement). */
async function bells(t: T, networkId: Id<"networks">, personId: Id<"persons">) {
  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("notifications")
      .withIndex("by_network_recipient_dedupKey", (q) => q.eq("networkId", networkId).eq("recipientPersonId", personId))
      .take(20),
  )
  return rows.map((row) => ({ kind: row.kind, actor: row.actorPersonId ?? null }))
}

describe("cloche DIASPORALE (genres de la tranche)", () => {
  it("parrainage reçu (avec le parrain), puis retiré (par lui, ou par la modération sans la désigner)", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const sponsor = await verifiedSponsor(t, diasporale, "auth-parrain", "parrain")
    const light = await person(t, "auth-light", "compte.leger")
    await join(light.as, diasporale)
    const { sponsorshipId } = await sponsor.as.mutation(api.modules.diaspora.membership.sponsor, { networkId: diasporale, handle: "compte.leger" })
    expect(await bells(t, diasporale, light.personId)).toEqual([{ kind: "sponsorship_received", actor: sponsor.personId }])
    await sponsor.as.mutation(api.modules.diaspora.membership.revokeSponsorship, { networkId: diasporale, sponsorshipId })
    expect(await bells(t, diasporale, light.personId)).toContainEqual({ kind: "sponsorship_withdrawn", actor: sponsor.personId })

    const moderator = await verifiedSponsor(t, diasporale, "auth-moderation", "moderation")
    const moderatorRow = await membership(t, diasporale, moderator.personId)
    await t.run(async (ctx) => {
      if (moderatorRow) await ctx.db.patch(moderatorRow._id, { role: "network_moderator" })
    })
    const second = await sponsor.as.mutation(api.modules.diaspora.membership.sponsor, { networkId: diasporale, handle: "compte.leger" })
    await moderator.as.mutation(api.modules.diaspora.membership.revokeSponsorship, {
      networkId: diasporale,
      sponsorshipId: second.sponsorshipId,
      reason: "Retrait décidé par la modération",
    })
    expect(await bells(t, diasporale, light.personId)).toContainEqual({ kind: "sponsorship_withdrawn", actor: null })
    expect((await bells(t, diasporale, light.personId)).some((bell) => bell.actor === moderator.personId)).toBe(false)
  })
})

describe("profil vu par le lecteur (memberFacet, EXF-DG-07)", () => {
  /** Une personne IDN gabonaise (déclarée) résidant dans `country`. */
  async function member(t: T, diasporale: Id<"networks">, handle: string, country: string, facet: Record<string, unknown> = {}) {
    const someone = await person(t, `auth-${handle}`, handle)
    await linkIdn(t, someone.personId, 1, "GA")
    await join(someone.as, diasporale, { countryOfResidence: country, ...facet })
    return someone
  }

  it("chaque champ selon son niveau fin : soi voit tout, le pays voit le pays, l'ailleurs voit le réseau", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const ada = await member(t, diasporale, "ada", "FR", {
      city: "Lyon",
      arrivedAt: 2016,
      helpAvailable: true,
      visibility: { city: "country", arrivedAt: "only_me" },
    })
    const voisin = await member(t, diasporale, "voisin", "FR")
    const ailleurs = await member(t, diasporale, "ailleurs", "BE")
    const attente = await person(t, "auth-attente", "attente")
    await join(attente.as, diasporale)

    const self = await ada.as.query(api.modules.diaspora.profile.memberFacet, { networkId: diasporale, handle: "@ada" })
    expect(self?.facet).toEqual({ countryOfResidence: "FR", city: "Lyon", arrivedAt: 2016, helpAvailable: true })
    // L'aperçu « vu par un membre d'un autre pays » : pour soi seulement.
    expect(self?.preview).toEqual({ countryOfResidence: "FR", helpAvailable: true })

    expect(await voisin.as.query(api.modules.diaspora.profile.memberFacet, { networkId: diasporale, handle: "ada" })).toEqual({
      facet: { countryOfResidence: "FR", city: "Lyon", helpAvailable: true },
      preview: null,
    })
    expect((await ailleurs.as.query(api.modules.diaspora.profile.memberFacet, { networkId: diasporale, handle: "ada" }))?.facet).toEqual({
      countryOfResidence: "FR",
      helpAvailable: true,
    })
    // Un compte en attente n'est pas un membre actif : le niveau « réseau » ne lui ouvre rien.
    expect((await attente.as.query(api.modules.diaspora.profile.memberFacet, { networkId: diasporale, handle: "ada" }))?.facet).toEqual({})
  })

  it("identifiant inconnu, non-membre ou blocage : le même null", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const ada = await member(t, diasporale, "ada", "FR")
    const voisin = await member(t, diasporale, "voisin", "FR")
    await person(t, "auth-dehors", "dehors")
    expect(await voisin.as.query(api.modules.diaspora.profile.memberFacet, { networkId: diasporale, handle: "inconnu" })).toBeNull()
    expect(await voisin.as.query(api.modules.diaspora.profile.memberFacet, { networkId: diasporale, handle: "dehors" })).toBeNull()
    await ada.as.mutation(api.modules.graph.connections.blockPerson, { networkId: diasporale, targetPersonId: voisin.personId })
    expect(await voisin.as.query(api.modules.diaspora.profile.memberFacet, { networkId: diasporale, handle: "ada" })).toBeNull()
  })
})

describe("annuaire opt-in de la tranche (EXF-DG-19, EXF-DG-46)", () => {
  /** Une personne IDN gabonaise (déclarée), au nom affiché choisi, qui entre avec un niveau d'annuaire. */
  async function member(t: T, diasporale: Id<"networks">, handle: string, displayName: string, country: string, level?: "country" | "network") {
    const as = t.withIdentity({ subject: `auth-${handle}` })
    const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName })
    await linkIdn(t, personId, 1, "GA")
    if (level) await as.mutation(api.modules.people.consents.recordConsent, { purpose: "directory", origin: "onboarding", networkId: diasporale })
    await join(as, diasporale, { countryOfResidence: country, city: "Ville" }, level)
    return { as, personId }
  }

  async function search(as: As, diasporale: Id<"networks">, query: string, country?: string) {
    const hits = await as.query(api.modules.diaspora.directory.searchMembers, { networkId: diasporale, query, ...(country ? { country } : {}) })
    return hits.map((hit) => hit.handle).sort()
  }

  async function listedFlag(t: T, diasporale: Id<"networks">, personId: Id<"persons">) {
    return await t.run(async (ctx) => {
      const row = await ctx.db
        .query("peopleDirectory")
        .withIndex("by_network_and_person", (q) => q.eq("networkId", diasporale).eq("personId", personId))
        .unique()
      return row?.listed ?? null
    })
  }

  it("masqué par défaut ; « réseau » se trouve partout, « pays » par les seuls membres du même pays", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const masquee = await member(t, diasporale, "awa.masquee", "Awa Masquée", "FR")
    const reseau = await member(t, diasporale, "awa.reseau", "Awa Réseau", "FR", "network")
    await member(t, diasporale, "awa.pays", "Awa Pays", "FR", "country")
    const lyon = await member(t, diasporale, "lecteur.lyon", "Lecteur Lyon", "FR")
    const bruxelles = await member(t, diasporale, "lecteur.bruxelles", "Lecteur Bruxelles", "BE")

    // Le pré-filtre du moteur suit le choix : posé à l'entrée, jamais d'office.
    expect(await listedFlag(t, diasporale, masquee.personId)).toBe(false)
    expect(await listedFlag(t, diasporale, reseau.personId)).toBe(true)

    expect(await search(lyon.as, diasporale, "Awa")).toEqual(["awa.pays", "awa.reseau"])
    expect(await search(bruxelles.as, diasporale, "awa")).toEqual(["awa.reseau"])
    // Le filtre de pays restreint, il n'ouvre rien.
    expect(await search(bruxelles.as, diasporale, "awa", "FR")).toEqual(["awa.reseau"])
    expect(await search(bruxelles.as, diasporale, "awa", "be")).toEqual([])
    expect(await search(bruxelles.as, diasporale, "awa", "GA")).toEqual([])
    // Un identifiant exact passe par la même règle : masqué reste masqué, comme un inconnu.
    expect(await search(lyon.as, diasporale, "awa.masquee")).toEqual([])
    expect(await search(lyon.as, diasporale, "personne.inconnue")).toEqual([])
    expect(await search(bruxelles.as, diasporale, "@awa.reseau")).toEqual(["awa.reseau"])
  })

  it("rien que la facette projetée pour le lecteur, et ni nom de lecteur trop court ni compte en attente", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const reseau = await member(t, diasporale, "awa.reseau", "Awa Réseau", "FR", "network")
    await reseau.as.mutation(api.modules.diaspora.facet.updateMyFacet, {
      networkId: diasporale,
      facet: { countryOfResidence: "FR", city: "Lyon", visibility: { city: "country" } },
    })
    const bruxelles = await member(t, diasporale, "lecteur.bruxelles", "Lecteur Bruxelles", "BE")
    const [hit] = await bruxelles.as.query(api.modules.diaspora.directory.searchMembers, { networkId: diasporale, query: "Awa" })
    // La ville est réservée au pays : Bruxelles ne la voit pas.
    expect(hit?.facet).toEqual({ countryOfResidence: "FR" })
    expect(Object.keys(hit ?? {}).sort()).toEqual(["avatarUrl", "badges", "displayName", "facet", "handle", "headline", "personId"])

    expect(await search(bruxelles.as, diasporale, "A")).toEqual([])
    const attente = await person(t, "auth-attente", "attente")
    await join(attente.as, diasporale)
    expect(await refusal(search(attente.as, diasporale, "Awa"))).toMatchObject({ code: "statusInsufficient" })
  })

  it("un retrait de consentement compte aussitôt, même par le chemin générique ; « personne » referme le pré-filtre", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const reseau = await member(t, diasporale, "awa.reseau", "Awa Réseau", "FR", "network")
    const lyon = await member(t, diasporale, "lecteur.lyon", "Lecteur Lyon", "FR")
    await reseau.as.mutation(api.modules.people.consents.revokeConsent, { purpose: "directory", networkId: diasporale })
    expect(await search(lyon.as, diasporale, "Awa")).toEqual([])

    await reseau.as.mutation(api.modules.diaspora.facet.setDirectoryVisibility, { networkId: diasporale, level: "hidden" })
    expect(await listedFlag(t, diasporale, reseau.personId)).toBe(false)
    // Revenir : le consentement d'abord, puis le niveau.
    expect(await refusal(reseau.as.mutation(api.modules.diaspora.facet.setDirectoryVisibility, { networkId: diasporale, level: "network" }))).toMatchObject({
      app: { appRule: "consent_directory_required" },
    })
    await reseau.as.mutation(api.modules.people.consents.recordConsent, { purpose: "directory", origin: "settings", networkId: diasporale })
    await reseau.as.mutation(api.modules.diaspora.facet.setDirectoryVisibility, { networkId: diasporale, level: "network" })
    expect(await listedFlag(t, diasporale, reseau.personId)).toBe(true)
    expect(await search(lyon.as, diasporale, "Awa")).toEqual(["awa.reseau"])
  })

  it("un blocage, dans un sens ou dans l'autre, retire la personne ; soi se trouve si on s'est rendu visible ; un départ efface", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const reseau = await member(t, diasporale, "awa.reseau", "Awa Réseau", "FR", "network")
    const lyon = await member(t, diasporale, "lecteur.lyon", "Lecteur Lyon", "FR", "network")
    expect(await search(reseau.as, diasporale, "Awa")).toEqual(["awa.reseau"])
    await reseau.as.mutation(api.modules.graph.connections.blockPerson, { networkId: diasporale, targetPersonId: lyon.personId })
    expect(await search(lyon.as, diasporale, "Awa")).toEqual([])
    expect(await search(reseau.as, diasporale, "Lecteur")).toEqual([])
    await reseau.as.mutation(api.modules.graph.connections.unblockPerson, { networkId: diasporale, targetPersonId: lyon.personId })
    expect(await search(lyon.as, diasporale, "Awa")).toEqual(["awa.reseau"])

    await reseau.as.mutation(api.modules.diaspora.membership.leaveDiasporale, { networkId: diasporale })
    expect(await search(lyon.as, diasporale, "Awa")).toEqual([])
  })
})

describe("suggestions de relations (EXF-DG-18)", () => {
  async function member(
    t: T,
    diasporale: Id<"networks">,
    handle: string,
    facet: Record<string, unknown>,
    level?: "country" | "network",
  ) {
    const as = t.withIdentity({ subject: `auth-${handle}` })
    const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
    await linkIdn(t, personId, 1, "GA")
    if (level) await as.mutation(api.modules.people.consents.recordConsent, { purpose: "directory", origin: "onboarding", networkId: diasporale })
    await join(as, diasporale, facet, level)
    return { as, personId }
  }

  const handles = async (as: As, diasporale: Id<"networks">) =>
    (await as.query(api.modules.diaspora.suggestions.forMe, { networkId: diasporale })).map((item) => item.handle)

  it("même pays et même ville visibles, puis relations communes ; jamais soi, une relation, une demande, un masqué ; « ne plus me proposer » tient", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const lecteur = await member(t, diasporale, "lecteur", { countryOfResidence: "FR", city: "Lyon" })
    await member(t, diasporale, "voisine", { countryOfResidence: "FR", city: "lyon", visibility: { city: "network" } }, "network")
    await member(t, diasporale, "compatriote", { countryOfResidence: "FR" }, "country")
    await member(t, diasporale, "lointain", { countryOfResidence: "BE" }, "network")
    await member(t, diasporale, "discrete", { countryOfResidence: "FR" })
    const ami = await member(t, diasporale, "ami", { countryOfResidence: "FR" }, "network")
    const attendu = await member(t, diasporale, "attendu", { countryOfResidence: "FR" }, "network")
    const commun = await member(t, diasporale, "commun", { countryOfResidence: "BE" }, "network")

    // Le lecteur et « ami » sont liés ; « commun » est lié à « ami » ; le lecteur a demandé « attendu ».
    const accept = async (from: { as: As; personId: Id<"persons"> }) => {
      await from.as.mutation(api.modules.graph.connections.requestConnection, { networkId: diasporale, targetPersonId: ami.personId })
      const pending = await ami.as.query(api.modules.graph.connections.connectionWith, { networkId: diasporale, otherPersonId: from.personId })
      if (pending.state !== "requested_by_them") throw new Error("demande absente")
      await ami.as.mutation(api.modules.graph.connections.respondToConnection, { networkId: diasporale, connectionId: pending.connectionId, accept: true })
    }
    await accept(lecteur)
    await accept(commun)
    await lecteur.as.mutation(api.modules.graph.connections.requestConnection, { networkId: diasporale, targetPersonId: attendu.personId })

    const first = await lecteur.as.query(api.modules.diaspora.suggestions.forMe, { networkId: diasporale })
    expect(first.map((item) => item.handle)).toEqual(["voisine", "commun", "compatriote"])
    expect(first[0]?.reasons).toEqual({ sameCountry: true, sameCity: true, sharedAssociations: 0, mutualConnections: 0 })
    expect(first[1]?.reasons).toEqual({ sameCountry: false, sameCity: false, sharedAssociations: 0, mutualConnections: 1 })
    // Rien que la facette projetée : la ville de « compatriote » n'est pas montrée.
    expect(first[2]?.facet).toEqual({ countryOfResidence: "FR" })

    // « Ne plus me proposer » : le masquage générique du moteur, réversible.
    await lecteur.as.mutation(api.modules.suggestions.suggestions.dismiss, { networkId: diasporale, handle: "voisine" })
    expect(await handles(lecteur.as, diasporale)).toEqual(["commun", "compatriote"])
    await lecteur.as.mutation(api.modules.suggestions.suggestions.restore, { networkId: diasporale, targetPersonId: first[0]!.personId })
    expect(await handles(lecteur.as, diasporale)).toEqual(["voisine", "commun", "compatriote"])
  })

  it("un compte en attente ne reçoit pas de suggestions", async () => {
    const t = testConvex()
    const { diasporale } = await seedAll(t)
    const attente = await person(t, "auth-attente", "attente")
    await join(attente.as, diasporale)
    expect(await refusal(handles(attente.as, diasporale))).toMatchObject({ code: "statusInsufficient" })
  })
})
