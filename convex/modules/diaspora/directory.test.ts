// @vitest-environment edge-runtime
/**
 * Parcourir l'annuaire de DIASPORA.GA par pays et par ville (CH-816, lot P3,
 * `directory.browseMembers`) : la même règle que la recherche pour chaque
 * candidat, les filtres jugés sur la facette projetée pour le lecteur, une page
 * bornée sur un curseur stable, et le lieu de l'index tenu par la tranche
 * (`syncDirectoryPlace`) — rattrapé pour les lignes d'avant le champ
 * (`directoryPlacePatch`, migration `backfillDirectoryPlaces`).
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { DIRECTORY_PAGE_SIZE_MAX } from "@diaspora-ga/domain"
import { describe, expect, it } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { joinDeclaredDiasporaFixture, openNetworkFeatures, testConvex } from "../../test.setup"
import { directoryPlacePatch } from "./facts"

type T = ReturnType<typeof testConvex>
type As = ReturnType<T["withIdentity"]>
type Facet = { countryOfResidence: string; city?: string; visibility?: Record<string, string> }
type Level = "country" | "network"

async function seed(t: T, openCountries: readonly string[] = ["FR", "BE"]) {
  const foundations = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const diaspora = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  await openNetworkFeatures(t, diaspora.network)
  await t.run(async (ctx) => ctx.db.patch(diaspora.network, { openCountries: [...openCountries] }))
  return { root: foundations.root, diasporaGa: diaspora.network }
}

/** Une personne au profil publié, sans adhésion. */
async function person(t: T, handle: string) {
  const as = t.withIdentity({ subject: `auth-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  return { as, personId }
}

async function link(t: T, personId: Id<"persons">, provider: "idn" | "consular_attestation", loa = 1) {
  await t.run(async (ctx) => {
    await ctx.db.insert(
      "identityLinks",
      provider === "idn"
        ? { personId, provider, subject: `idn-${personId}`, loa, nationality: "GA", linkedAt: Date.now() }
        : { personId, provider, subject: `empreinte-${personId}`, country: "FR", postSlug: "consulat-general-paris", linkedAt: Date.now() },
    )
  })
}

/**
 * Un membre qui entre avec sa facette et, s'il le choisit, un niveau d'annuaire
 * (et le consentement qui va avec). `trust` : IDN de niveau 1 (déclaré) par défaut,
 * IDN de niveau 2, attestation consulaire, ou admission fondatrice (EA-01).
 */
async function member(t: T, diasporaGa: Id<"networks">, handle: string, facet: Facet, level?: Level, trust: "idn1" | "idn2" | "consular" | "founder" = "idn1") {
  const someone = await person(t, handle)
  await link(t, someone.personId, "idn", trust === "idn2" ? 2 : 1)
  if (trust === "consular") await link(t, someone.personId, "consular_attestation")
  if (trust === "founder") {
    await t.run(async (ctx) =>
      ctx.db.insert("foundingAdmissions", { networkId: diasporaGa, personId: someone.personId, reason: "Admission fondatrice de démonstration", seniorityWaiver: false, admittedAt: Date.now() }),
    )
  }
  if (level) await someone.as.mutation(api.modules.people.consents.recordConsent, { purpose: "directory", origin: "onboarding", networkId: diasporaGa })
  await joinDeclaredDiasporaFixture(someone.as, {
    networkId: diasporaGa,
    facet: facet as { countryOfResidence: string },
    ...(level ? { directoryVisibility: level } : {}),
  })
  return someone
}

type BrowseArgs = { country: string; city?: string; verifiedOnly?: boolean; cursor?: string | null }

async function browse(as: As, diasporaGa: Id<"networks">, args: BrowseArgs) {
  return await as.query(api.modules.diaspora.directory.browseMembers, { networkId: diasporaGa, ...args })
}

/** Les identifiants d'une page, triés. */
async function handles(as: As, diasporaGa: Id<"networks">, args: BrowseArgs) {
  return (await browse(as, diasporaGa, args)).page.map((entry) => entry.handle).sort()
}

async function refusalCode(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    return engineErrorCode(error)
  }
  throw new Error("aucune erreur levée")
}

async function directoryRow(t: T, networkId: Id<"networks">, personId: Id<"persons">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("peopleDirectory")
      .withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId))
      .unique(),
  )
}

describe("parcourir l'annuaire : la règle de la recherche, candidat par candidat", () => {
  it("masqué absent ; « pays » pour les lecteurs du même pays ; « réseau » pour tout membre ; soi si l'on s'est rendu visible", async () => {
    const t = testConvex()
    const { diasporaGa } = await seed(t)
    await member(t, diasporaGa, "awa.masquee", { countryOfResidence: "FR" })
    await member(t, diasporaGa, "awa.pays", { countryOfResidence: "FR" }, "country")
    await member(t, diasporaGa, "awa.reseau", { countryOfResidence: "FR" }, "network")
    const lyon = await member(t, diasporaGa, "lecteur.lyon", { countryOfResidence: "FR" })
    const bruxelles = await member(t, diasporaGa, "lecteur.bruxelles", { countryOfResidence: "BE" }, "network")

    expect(await handles(lyon.as, diasporaGa, { country: "FR" })).toEqual(["awa.pays", "awa.reseau"])
    expect(await handles(bruxelles.as, diasporaGa, { country: "FR" })).toEqual(["awa.reseau"])
    // Soi : visible de soi-même, parce qu'on l'a choisi.
    expect(await handles(bruxelles.as, diasporaGa, { country: "BE" })).toEqual(["lecteur.bruxelles"])

    const [entry] = (await browse(bruxelles.as, diasporaGa, { country: "FR" })).page
    // Les seuls champs de la recherche : aucune coordonnée, la facette projetée.
    expect(Object.keys(entry ?? {}).sort()).toEqual(["avatarUrl", "badges", "displayName", "facet", "handle", "headline", "personId"])
  })

  it("un profil privé, un blocage dans un sens ou dans l'autre, un départ ou un consentement retiré : absent", async () => {
    const t = testConvex()
    const { diasporaGa } = await seed(t)
    const privee = await member(t, diasporaGa, "awa.privee", { countryOfResidence: "FR" }, "network")
    const bloqueuse = await member(t, diasporaGa, "awa.bloqueuse", { countryOfResidence: "FR" }, "network")
    const bloquee = await member(t, diasporaGa, "awa.bloquee", { countryOfResidence: "FR" }, "network")
    const partante = await member(t, diasporaGa, "awa.partante", { countryOfResidence: "FR" }, "network")
    const retrait = await member(t, diasporaGa, "awa.retrait", { countryOfResidence: "FR" }, "network")
    const lecteur = await member(t, diasporaGa, "lecteur", { countryOfResidence: "FR" })
    expect(await handles(lecteur.as, diasporaGa, { country: "FR" })).toEqual(["awa.bloquee", "awa.bloqueuse", "awa.partante", "awa.privee", "awa.retrait"])

    await privee.as.mutation(api.modules.people.profile.setMyProfilePrivacy, { private: true })
    await bloqueuse.as.mutation(api.modules.graph.connections.blockPerson, { networkId: diasporaGa, targetPersonId: lecteur.personId })
    await lecteur.as.mutation(api.modules.graph.connections.blockPerson, { networkId: diasporaGa, targetPersonId: bloquee.personId })
    await partante.as.mutation(api.modules.diaspora.membership.leaveDiasporaGa, { networkId: diasporaGa })
    // Un retrait par le chemin générique compte aussitôt, sans attendre la tranche.
    await retrait.as.mutation(api.modules.people.consents.revokeConsent, { purpose: "directory", networkId: diasporaGa })
    expect(await handles(lecteur.as, diasporaGa, { country: "FR" })).toEqual([])
  })

  it("un compte en attente ne parcourt pas (le refus de la recherche) ; un pays fermé ou un curseur étranger ne rendent rien", async () => {
    const t = testConvex()
    const { diasporaGa } = await seed(t, ["FR"])
    await member(t, diasporaGa, "awa.reseau", { countryOfResidence: "FR" }, "network")
    await member(t, diasporaGa, "awa.belgique", { countryOfResidence: "BE" }, "network")
    const lecteur = await member(t, diasporaGa, "lecteur", { countryOfResidence: "FR" })
    const attente = await person(t, "attente")
    await joinDeclaredDiasporaFixture(attente.as, { networkId: diasporaGa, facet: { countryOfResidence: "FR" } })

    expect(await refusalCode(browse(attente.as, diasporaGa, { country: "FR" }))).toBe("statusInsufficient")
    // La Belgique n'est pas ouverte : rien, comme un pays vide.
    expect(await browse(lecteur.as, diasporaGa, { country: "BE" })).toEqual({ page: [], isDone: true, continueCursor: "" })
    expect(await browse(lecteur.as, diasporaGa, { country: "GA" })).toEqual({ page: [], isDone: true, continueCursor: "" })
    expect(await browse(lecteur.as, diasporaGa, { country: "FR", cursor: "pas-un-curseur" })).toEqual({ page: [], isDone: true, continueCursor: "" })
    expect(await browse(lecteur.as, diasporaGa, { country: "FR", city: "x".repeat(81) })).toEqual({ page: [], isDone: true, continueCursor: "" })
    expect(await handles(lecteur.as, diasporaGa, { country: " fr " })).toEqual(["awa.reseau"])
  })
})

describe("filtres du parcours : ce que le lecteur voit, jamais plus", () => {
  it("la ville, repliée comme une saisie ; une ville réservée aux relations ne fait pas trouver le membre par sa ville", async () => {
    const t = testConvex()
    const { diasporaGa } = await seed(t)
    await member(t, diasporaGa, "awa.etienne", { countryOfResidence: "FR", city: "Saint-Étienne", visibility: { city: "network" } }, "network")
    // La ville par défaut : réservée aux relations.
    await member(t, diasporaGa, "awa.discrete", { countryOfResidence: "FR", city: "Saint-Étienne" }, "network")
    await member(t, diasporaGa, "awa.lyon", { countryOfResidence: "FR", city: "Lyon", visibility: { city: "network" } }, "network")
    const lecteur = await member(t, diasporaGa, "lecteur", { countryOfResidence: "BE" })

    expect(await handles(lecteur.as, diasporaGa, { country: "FR", city: "  saint etienne " })).toEqual(["awa.etienne"])
    expect(await handles(lecteur.as, diasporaGa, { country: "FR", city: "SAINT-ETIENNE" })).toEqual(["awa.etienne"])
    expect(await handles(lecteur.as, diasporaGa, { country: "FR", city: "Marseille" })).toEqual([])
    // Tout le pays : la discrète paraît, sans sa ville.
    const all = (await browse(lecteur.as, diasporaGa, { country: "FR" })).page
    expect(all.map((entry) => entry.handle).sort()).toEqual(["awa.discrete", "awa.etienne", "awa.lyon"])
    expect(all.find((entry) => entry.handle === "awa.discrete")?.facet).toEqual({ countryOfResidence: "FR" })
  })

  it("un pays réservé aux relations ne fait pas trouver le membre par son pays", async () => {
    const t = testConvex()
    const { diasporaGa } = await seed(t)
    await member(t, diasporaGa, "awa.secrete", { countryOfResidence: "FR", visibility: { countryOfResidence: "connections" } }, "network")
    const lecteur = await member(t, diasporaGa, "lecteur", { countryOfResidence: "BE" })
    expect(await handles(lecteur.as, diasporaGa, { country: "FR" })).toEqual([])
  })

  it("la recherche par nom filtrée par pays juge aussi la facette projetée : un pays masqué ne se révèle pas", async () => {
    const t = testConvex()
    const { diasporaGa } = await seed(t)
    await member(t, diasporaGa, "awa.secrete", { countryOfResidence: "FR", visibility: { countryOfResidence: "connections" } }, "network")
    const lecteur = await member(t, diasporaGa, "lecteur", { countryOfResidence: "BE" })
    const search = async (country?: string) =>
      (await lecteur.as.query(api.modules.diaspora.directory.searchMembers, { networkId: diasporaGa, query: "awa", ...(country ? { country } : {}) })).map((hit) => hit.handle)
    // Listée au niveau « réseau » : trouvée par son nom, sans son pays.
    expect(await search()).toEqual(["awa.secrete"])
    // Filtrer par « France » la révélerait : absente, comme une inconnue.
    expect(await search("FR")).toEqual([])
    expect(await search("BE")).toEqual([])
  })

  it("« vérifiés seulement » : la confiance calculée à la lecture (attestation, identité forte, fondateurs), et le badge le dit", async () => {
    const t = testConvex()
    const { diasporaGa } = await seed(t)
    await member(t, diasporaGa, "awa.consulat", { countryOfResidence: "FR" }, "network", "consular")
    await member(t, diasporaGa, "awa.idn2", { countryOfResidence: "FR" }, "network", "idn2")
    await member(t, diasporaGa, "awa.fondatrice", { countryOfResidence: "FR" }, "network", "founder")
    await member(t, diasporaGa, "awa.declaree", { countryOfResidence: "FR" }, "network")
    const lecteur = await member(t, diasporaGa, "lecteur", { countryOfResidence: "FR" })

    expect(await handles(lecteur.as, diasporaGa, { country: "FR" })).toEqual(["awa.consulat", "awa.declaree", "awa.fondatrice", "awa.idn2"])
    const verified = (await browse(lecteur.as, diasporaGa, { country: "FR", verifiedOnly: true })).page
    expect(verified.map((entry) => entry.handle).sort()).toEqual(["awa.consulat", "awa.fondatrice", "awa.idn2"])
    // Admise par les fondateurs, sans identité forte : « Vérifié » quand même, comme sa propre fiche le dit.
    expect(verified.find((entry) => entry.handle === "awa.fondatrice")?.badges).toEqual(["verified"])
    // Même carte dans la recherche.
    const [hit] = await lecteur.as.query(api.modules.diaspora.directory.searchMembers, { networkId: diasporaGa, query: "awa.fondatrice" })
    expect(hit?.badges).toEqual(["verified"])
  })
})

describe("pagination : vingt au plus, bornée, stable", () => {
  it("vingt par page, sans doublon d'une page à l'autre, `isDone` à la fin", async () => {
    const t = testConvex()
    const { diasporaGa } = await seed(t)
    const expected: string[] = []
    for (let index = 0; index < DIRECTORY_PAGE_SIZE_MAX + 5; index += 1) {
      const handle = `membre.${String(index).padStart(2, "0")}`
      await member(t, diasporaGa, handle, { countryOfResidence: "FR" }, "network")
      expected.push(handle)
    }
    const lecteur = await member(t, diasporaGa, "lecteur", { countryOfResidence: "FR" })

    const first = await browse(lecteur.as, diasporaGa, { country: "FR" })
    expect(first.page).toHaveLength(DIRECTORY_PAGE_SIZE_MAX)
    expect(first.isDone).toBe(false)
    // Des plus récents aux plus anciens.
    expect(first.page[0]?.handle).toBe("membre.24")
    const second = await browse(lecteur.as, diasporaGa, { country: "FR", cursor: first.continueCursor })
    expect(second.page).toHaveLength(5)
    expect(second.isDone).toBe(true)
    expect(second.continueCursor).toBe("")
    const seen = [...first.page, ...second.page].map((entry) => entry.handle)
    expect(new Set(seen).size).toBe(seen.length)
    expect([...seen].sort()).toEqual(expected)
    // La même page relue rend les mêmes cartes.
    expect((await browse(lecteur.as, diasporaGa, { country: "FR", cursor: first.continueCursor })).page.map((entry) => entry.handle)).toEqual(second.page.map((entry) => entry.handle))
  })

  it("la lecture est bornée : des lignes que la règle écarte remplissent une page vide qui annonce sa suite", async () => {
    const t = testConvex()
    const { diasporaGa } = await seed(t)
    await member(t, diasporaGa, "awa.une", { countryOfResidence: "FR" }, "network")
    await member(t, diasporaGa, "awa.deux", { countryOfResidence: "FR" }, "network")
    const lecteur = await member(t, diasporaGa, "lecteur", { countryOfResidence: "FR" })
    // Soixante-dix lignes listées, plus récentes, d'une personne qui n'est pas membre : la règle les écarte toutes.
    const dehors = await person(t, "dehors")
    await t.run(async (ctx) => {
      for (let index = 0; index < 70; index += 1) {
        await ctx.db.insert("peopleDirectory", { networkId: diasporaGa, personId: dehors.personId, searchName: "dehors", listed: true, country: "FR", updatedAt: Date.now() })
      }
    })

    const first = await browse(lecteur.as, diasporaGa, { country: "FR" })
    expect(first).toMatchObject({ page: [], isDone: false })
    expect(first.continueCursor).not.toBe("")
    const second = await browse(lecteur.as, diasporaGa, { country: "FR", cursor: first.continueCursor })
    expect(second.page.map((entry) => entry.handle).sort()).toEqual(["awa.deux", "awa.une"])
    expect(second.isDone).toBe(true)
  })
})

describe("le lieu de l'index, tenu par la tranche", () => {
  it("un déménagement déplace le membre ; « personne » efface son lieu de l'index", async () => {
    const t = testConvex()
    const { diasporaGa } = await seed(t)
    const awa = await member(t, diasporaGa, "awa", { countryOfResidence: "FR", city: "Lyon" }, "network")
    const lecteur = await member(t, diasporaGa, "lecteur", { countryOfResidence: "FR" })
    expect(await directoryRow(t, diasporaGa, awa.personId)).toMatchObject({ listed: true, country: "FR", cityKey: "lyon" })

    await awa.as.mutation(api.modules.diaspora.facet.updateMyFacet, { networkId: diasporaGa, facet: { countryOfResidence: "BE", city: "Liège", visibility: { city: "network" } } })
    expect(await directoryRow(t, diasporaGa, awa.personId)).toMatchObject({ country: "BE", cityKey: "liege" })
    expect(await handles(lecteur.as, diasporaGa, { country: "FR" })).toEqual([])
    expect(await handles(lecteur.as, diasporaGa, { country: "BE", city: "liege" })).toEqual(["awa"])

    await awa.as.mutation(api.modules.diaspora.facet.setDirectoryVisibility, { networkId: diasporaGa, level: "hidden" })
    const row = await directoryRow(t, diasporaGa, awa.personId)
    expect(row?.listed).toBe(false)
    expect(row?.country).toBeUndefined()
    expect(row?.cityKey).toBeUndefined()
  })

  it("rattrapage des lignes d'avant le champ : idempotent, et seulement dans le réseau de la tranche", async () => {
    const t = testConvex()
    const { root, diasporaGa } = await seed(t)
    const awa = await member(t, diasporaGa, "awa", { countryOfResidence: "FR", city: "Lyon" }, "network")
    const masquee = await member(t, diasporaGa, "awa.masquee", { countryOfResidence: "FR" })
    const lecteur = await member(t, diasporaGa, "lecteur", { countryOfResidence: "FR" })
    const row = await directoryRow(t, diasporaGa, awa.personId)
    if (!row) throw new Error("ligne d'annuaire absente")
    // Une ligne listée d'avant le champ : le parcours ne la trouve pas.
    await t.run(async (ctx) => ctx.db.patch(row._id, { country: undefined, cityKey: undefined }))
    expect(await handles(lecteur.as, diasporaGa, { country: "FR" })).toEqual([])

    const rattrape = async (networkId: Id<"networks">, personId: Id<"persons">) =>
      await t.run(async (ctx) => {
        const current = await ctx.db
          .query("peopleDirectory")
          .withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId))
          .unique()
        if (!current) return "sans ligne"
        const patch = await directoryPlacePatch(ctx, current)
        if (patch) await ctx.db.patch(current._id, patch)
        return patch ?? "inchangée"
      })

    expect(await rattrape(diasporaGa, awa.personId)).toEqual({ country: "FR", cityKey: "lyon" })
    expect(await handles(lecteur.as, diasporaGa, { country: "FR" })).toEqual(["awa"])
    expect(await rattrape(diasporaGa, awa.personId)).toBe("inchangée")
    // Masquée : rien à poser ; un lieu resté là par erreur s'efface.
    expect(await rattrape(diasporaGa, masquee.personId)).toBe("inchangée")
    const hidden = await directoryRow(t, diasporaGa, masquee.personId)
    if (!hidden) throw new Error("ligne d'annuaire absente")
    await t.run(async (ctx) => ctx.db.patch(hidden._id, { country: "FR" }))
    expect(await rattrape(diasporaGa, masquee.personId)).toEqual({ country: undefined, cityKey: undefined })
    // La racine ANTSIA n'est pas gouvernée par la tranche : ses lignes ne bougent pas.
    expect(await rattrape(root, awa.personId)).toBe("inchangée")
  })
})
