// @vitest-environment edge-runtime
/**
 * Réseaux GOUVERNÉS par une tranche (`networks.managedBy`) : leurs règles
 * d'admission sont propres à l'application (DIASPORA.GA : nationalité,
 * parrainage, attestation consulaire). Les chemins génériques refusent d'y
 * entrer et d'y régler une facette ; la tranche admet par les aides partagées
 * (`modules/people/admission`), qui tiennent les invariants ; quitter reste
 * toujours possible.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import { admitToNetwork, setDirectoryListed, writeNetworkFacet } from "../modules/people/admission"
import { SEED_CONFIRMATION } from "../seeds/foundations"
import { createTestOperatorProof, testConvex } from "../test.setup"

type T = ReturnType<typeof testConvex>

async function seedWithManagedNetwork(t: T) {
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const managed = await t.run(async (ctx) => {
    const now = Date.now()
    return await ctx.db.insert("networks", {
      slug: "gouverne-test",
      kind: "closed",
      parentId: root,
      managedBy: "diaspora",
      name: "Réseau gouverné de test",
      membershipPolicy: "declared_or_verified",
      defaultVisibility: "network",
      facetSchema: {
        fields: [
          { key: "countryOfResidence", kind: "country", required: true, defaultVisibility: "network", excludedValues: ["GA"] },
          { key: "postSlug", kind: "text", required: false, defaultVisibility: "network", maxLength: 60 },
        ],
      },
      reachValues: ["local", "diaspora"],
      openCountries: ["FR"],
      theme: "antsia",
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
  })
  return { root, managed }
}

/** Une personne qui a choisi son profil et consenti au profil social. */
async function onboardedPerson(t: T, subject: string, handle: string) {
  const as = t.withIdentity({ subject })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await t.run(async (ctx) => {
    await ctx.db.patch(personId, { handle, displayName: handle, publishedAt: Date.now() })
  })
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  return { as, personId }
}

/** Ce que ferait la tranche après SES contrôles : admettre (attestation consulaire) et poser la facette prouvée. */
async function admitAsSlice(t: T, networkId: Id<"networks">, rootId: Id<"networks">, personId: Id<"persons">) {
  return await t.run(async (ctx) => {
    const network = await ctx.db.get(networkId)
    const root = await ctx.db.get(rootId)
    if (!network || !root) throw new Error("réseaux absents")
    const admitted = await admitToNetwork(ctx, {
      personId,
      network,
      root,
      entry: "verifiee",
      evidence: { strongIdentity: false, externalVerification: true, sponsored: false },
      verifiedBy: "consulat",
    })
    await writeNetworkFacet(ctx, network, personId, { values: { countryOfResidence: "FR", postSlug: "paris" }, visibilities: {} })
    return admitted
  })
}

async function membershipOf(t: T, networkId: Id<"networks">, personId: Id<"persons">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("networkMemberships")
      .withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId))
      .unique(),
  )
}

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (error) {
    const data = (error as { data?: { code?: string } }).data
    return data?.code ?? `non-moteur: ${String(error)}`
  }
  return "aucune erreur"
}

describe("réseau gouverné par une tranche : les chemins génériques ne le contournent pas", () => {
  it("la projection publique nomme la tranche qui gouverne ; la racine n'en a aucune", async () => {
    const t = testConvex()
    await seedWithManagedNetwork(t)
    expect(await t.query(api.modules.networks.networks.getBySlug, { slug: "gouverne-test" })).toMatchObject({ managedBy: "diaspora" })
    expect(await t.query(api.modules.networks.networks.getBySlug, { slug: "antsia" })).not.toHaveProperty("managedBy")
  })

  it("entrer par le chemin générique est refusé, sans rien poser (même pas la racine)", async () => {
    const t = testConvex()
    const { root, managed } = await seedWithManagedNetwork(t)
    const { as, personId } = await onboardedPerson(t, "auth-g1", "candidate")
    expect(
      await errorCode(
        as.mutation(api.modules.people.memberships.joinNetwork, {
          networkId: managed,
          facet: { values: { countryOfResidence: "FR", postSlug: "paris" }, visibilities: {} },
        }),
      ),
    ).toBe("policyRefused")
    expect(await membershipOf(t, managed, personId)).toBeNull()
    expect(await membershipOf(t, root, personId)).toBeNull()
  })

  it("la tranche admet par les aides partagées : adhésion dérivée vers la racine, source de vérification nommée", async () => {
    const t = testConvex()
    const { root, managed } = await seedWithManagedNetwork(t)
    const { as, personId } = await onboardedPerson(t, "auth-g2", "attestee")
    expect(await admitAsSlice(t, managed, root, personId)).toEqual({ status: "verifiee", rootStatus: "verifiee" })
    expect(await membershipOf(t, managed, personId)).toMatchObject({ status: "verifiee", verifiedBy: "consulat" })
    expect(await membershipOf(t, root, personId)).toMatchObject({ status: "verifiee", verifiedBy: "consulat", derivedFrom: managed })
    expect(await as.query(api.modules.people.facets.myFacet, { networkId: managed })).toMatchObject({ values: { countryOfResidence: "FR", postSlug: "paris" } })
  })

  it("un membre ne règle pas lui-même sa facette dans un réseau gouverné (le poste vient de l'attestation)", async () => {
    const t = testConvex()
    const { root, managed } = await seedWithManagedNetwork(t)
    const { as, personId } = await onboardedPerson(t, "auth-g3", "membre.gouverne")
    await admitAsSlice(t, managed, root, personId)
    expect(
      await errorCode(
        as.mutation(api.modules.people.facets.setMyFacet, { networkId: managed, values: { countryOfResidence: "FR", postSlug: "rome" }, visibilities: {} }),
      ),
    ).toBe("policyRefused")
    expect(await as.query(api.modules.people.facets.myFacet, { networkId: managed })).toMatchObject({ values: { postSlug: "paris" } })
  })

  it("quitter reste toujours possible, et ne retire pas la racine", async () => {
    const t = testConvex()
    const { root, managed } = await seedWithManagedNetwork(t)
    const { as, personId } = await onboardedPerson(t, "auth-g4", "partante")
    await admitAsSlice(t, managed, root, personId)
    await as.mutation(api.modules.people.memberships.leaveNetwork, { networkId: managed })
    expect((await membershipOf(t, managed, personId))?.status).toBe("partie")
    expect((await membershipOf(t, root, personId))?.status).toBe("verifiee")
  })

  it("une facette mal formée est refusée aussi par l'aide partagée (champ nommé, jamais la valeur)", async () => {
    const t = testConvex()
    const { managed } = await seedWithManagedNetwork(t)
    const { personId } = await onboardedPerson(t, "auth-g5", "facette.fausse")
    const attempt = t.run(async (ctx) => {
      const network = await ctx.db.get(managed)
      if (!network) throw new Error("réseau absent")
      await writeNetworkFacet(ctx, network, personId, { values: { countryOfResidence: "FR" }, visibilities: { inconnu: "root" } })
    })
    expect(await errorCode(attempt)).toBe("invalidArgument")
  })
})

async function listedIn(t: T, networkId: Id<"networks">, personId: Id<"persons">): Promise<boolean | undefined> {
  return await t.run(async (ctx) => {
    const row = await ctx.db
      .query("peopleDirectory")
      .withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId))
      .unique()
    return row?.listed
  })
}

describe("annuaire d'un réseau gouverné : opt-in, servi par la tranche", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("les chemins génériques refusent de chercher et de suggérer ; un membre n'est listé qu'après son choix", async () => {
    const t = testConvex()
    const { root, managed } = await seedWithManagedNetwork(t)
    const reader = await onboardedPerson(t, "auth-lecteur", "lecteur")
    const member = await onboardedPerson(t, "auth-discret", "membre.discret")
    await admitAsSlice(t, managed, root, reader.personId)
    await admitAsSlice(t, managed, root, member.personId)

    expect(await errorCode(reader.as.query(api.modules.people.directory.searchPeople, { networkId: managed, query: "membre" }))).toBe("policyRefused")
    expect(await errorCode(reader.as.query(api.modules.graph.follows.suggestions, { networkId: managed }))).toBe("policyRefused")
    // Masqué par défaut dans le réseau gouverné ; la racine, générique, suit le profil découvrable.
    expect(await listedIn(t, managed, member.personId)).toBe(false)
    expect(await listedIn(t, root, member.personId)).toBe(true)

    await t.run(async (ctx) => setDirectoryListed(ctx, managed, member.personId, true))
    expect(await listedIn(t, managed, member.personId)).toBe(true)
    await t.run(async (ctx) => setDirectoryListed(ctx, managed, member.personId, false))
    expect(await listedIn(t, managed, member.personId)).toBe(false)
  })

  it("un retour après départ ne reprend pas l'ancien choix ; la resynchronisation corrige les lignes déjà écrites", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const { root, managed } = await seedWithManagedNetwork(t)
    const member = await onboardedPerson(t, "auth-revenant", "revenant")
    await admitAsSlice(t, managed, root, member.personId)
    await t.run(async (ctx) => setDirectoryListed(ctx, managed, member.personId, true))
    await member.as.mutation(api.modules.people.memberships.leaveNetwork, { networkId: managed })
    await admitAsSlice(t, managed, root, member.personId)
    expect((await membershipOf(t, managed, member.personId))?.directoryListed).toBeUndefined()
    expect(await listedIn(t, managed, member.personId)).toBe(false)

    // Une ligne écrite sous l'ancienne règle (listée sans choix) : la resynchronisation la referme.
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("peopleDirectory")
        .withIndex("by_network_and_person", (q) => q.eq("networkId", managed).eq("personId", member.personId))
        .unique()
      if (row) await ctx.db.patch(row._id, { listed: true })
    })
    await t.mutation(internal.modules.people.directory.resyncNetworkDirectory, { networkId: managed })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await listedIn(t, managed, member.personId)).toBe(false)
  })
})

describe("console : la tranche se pose à la naissance du réseau, jamais sur la racine", () => {
  it("un opérateur crée un réseau gouverné ; une racine gouvernée est refusée", async () => {
    const t = testConvex()
    const operator = await onboardedPerson(t, "auth-gop", "operateur.g")
    await t.run(async (ctx) => {
      await ctx.db.insert("operators", { personId: operator.personId, role: "platform_admin", grantedAt: Date.now() })
    })
    await createTestOperatorProof(t, operator.as, operator.personId)
    const settings = { name: "Réseau", membershipPolicy: "open" as const, defaultVisibility: "network" as const, reachValues: [], theme: "antsia" }
    expect(
      await errorCode(operator.as.mutation(api.modules.networks.networks.create, { slug: "racine-gouvernee", kind: "root", managedBy: "diaspora", ...settings })),
    ).toBe("invalidArgument")
    await operator.as.mutation(api.modules.networks.networks.create, { slug: "antsia", kind: "root", ...settings })
    await operator.as.mutation(api.modules.networks.networks.create, {
      slug: "gouverne-console",
      kind: "closed",
      managedBy: "diaspora",
      ...settings,
      membershipPolicy: "declared_or_verified",
    })
    expect(await t.query(api.modules.networks.networks.getBySlug, { slug: "gouverne-console" })).toMatchObject({ managedBy: "diaspora" })
  })
})
