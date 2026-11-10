// @vitest-environment edge-runtime
/** PA4 : préférences explicites, session vivante et absence d'effet sur le profil social. */
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, components } from "../../_generated/api"
import { createTestSession, testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>

async function personFixture(t: T, email = "preferences@example.test") {
  const now = Date.now()
  const user: unknown = await t.mutation(components.betterAuth.adapter.create, {
    input: { model: "user", data: { name: "Nom civil non choisi", email, emailVerified: true, createdAt: now, updatedAt: now } },
  })
  if (typeof user !== "object" || user === null || !("_id" in user) || typeof user._id !== "string") throw new Error("Utilisateur de recette absent")
  const sessionId = await createTestSession(t, user._id)
  const as = t.withIdentity({ subject: user._id, sessionId })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  return { as, personId, sessionId }
}

afterEach(() => vi.useRealTimers())

describe("préférences de ma personne", () => {
  it.each(["fr", "en"] as const)("enregistre la langue %s et le fuseau choisis", async (locale) => {
    const t = testConvex({ automaticSessions: false })
    const person = await personFixture(t)
    expect(await person.as.mutation(api.modules.people.preferences.setMyPreferences, { locale, timeZone: "Africa/Libreville" })).toBeNull()
    expect(await t.run((ctx) => ctx.db.get(person.personId))).toMatchObject({ locale, timeZone: "Africa/Libreville" })
  })

  it("normalise un alias de fuseau IANA au nom canonique", async () => {
    const t = testConvex({ automaticSessions: false })
    const person = await personFixture(t)
    await person.as.mutation(api.modules.people.preferences.setMyPreferences, { locale: "en", timeZone: "US/Eastern" })
    expect((await t.run((ctx) => ctx.db.get(person.personId)))?.timeZone).toBe("America/New_York")
  })

  it.each(["", "   ", "Not/A_Zone", "../Europe/Paris", "x".repeat(101)])("refuse un fuseau illégal sans modifier la personne : %j", async (timeZone) => {
    const t = testConvex({ automaticSessions: false })
    const person = await personFixture(t)
    const before = await t.run((ctx) => ctx.db.get(person.personId))
    await expect(person.as.mutation(api.modules.people.preferences.setMyPreferences, { locale: "fr", timeZone })).rejects.toMatchObject({ data: { code: "invalidArgument", field: "timeZone" } })
    expect(await t.run((ctx) => ctx.db.get(person.personId))).toEqual(before)
  })

  it.each(["de", "FR", "", null])("le validateur refuse une langue hors du contrat : %j", async (locale) => {
    const t = testConvex({ automaticSessions: false })
    const person = await personFixture(t)
    const before = await t.run((ctx) => ctx.db.get(person.personId))
    await expect(person.as.mutation(api.modules.people.preferences.setMyPreferences, { locale, timeZone: "UTC" } as never)).rejects.toThrow()
    expect(await t.run((ctx) => ctx.db.get(person.personId))).toEqual(before)
  })

  it("un appel anonyme ou une session sans personne ne crée aucun profil", async () => {
    const t = testConvex({ automaticSessions: false })
    const args = { locale: "fr" as const, timeZone: "UTC" }
    await expect(t.mutation(api.modules.people.preferences.setMyPreferences, args)).rejects.toMatchObject({ data: { code: "unauthenticated" } })
    const sessionId = await createTestSession(t, "preferences-without-person")
    await expect(t.withIdentity({ subject: "preferences-without-person", sessionId }).mutation(api.modules.people.preferences.setMyPreferences, args)).rejects.toMatchObject({ data: { code: "unauthenticated" } })
    expect(await t.run((ctx) => ctx.db.query("persons").take(2))).toEqual([])
  })

  it("une session révoquée ne peut plus modifier les préférences malgré son JWT", async () => {
    const t = testConvex({ automaticSessions: false })
    const person = await personFixture(t)
    const before = await t.run((ctx) => ctx.db.get(person.personId))
    await t.mutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: person.sessionId }] } })
    await expect(person.as.mutation(api.modules.people.preferences.setMyPreferences, { locale: "en", timeZone: "UTC" })).rejects.toMatchObject({ data: { code: "unauthenticated" } })
    expect(await t.run((ctx) => ctx.db.get(person.personId))).toEqual(before)
  })

  it("reste auto-borné : un identifiant de personne étrangère dans les arguments est refusé", async () => {
    const t = testConvex({ automaticSessions: false })
    const alice = await personFixture(t, "alice.preferences@example.test")
    const bob = await personFixture(t, "bob.preferences@example.test")
    const before = await t.run((ctx) => ctx.db.get(bob.personId))
    await expect(alice.as.mutation(api.modules.people.preferences.setMyPreferences, { locale: "en", timeZone: "UTC", personId: bob.personId } as never)).rejects.toThrow()
    await alice.as.mutation(api.modules.people.preferences.setMyPreferences, { locale: "en", timeZone: "UTC" })
    expect(await t.run((ctx) => ctx.db.get(bob.personId))).toEqual(before)
  })

  it("choisir des préférences ne copie ni nom ni handle et ne crée aucun consentement ou adhésion", async () => {
    const t = testConvex({ automaticSessions: false })
    const person = await personFixture(t)
    await person.as.mutation(api.modules.people.preferences.setMyPreferences, { locale: "fr", timeZone: "UTC" })
    const row = await t.run((ctx) => ctx.db.get(person.personId))
    expect(row?.displayName).toBeUndefined()
    expect(row?.handle).toBeUndefined()
    expect(row?.publishedAt).toBeUndefined()
    expect(await t.run((ctx) => ctx.db.query("consents").take(2))).toEqual([])
    expect(await t.run((ctx) => ctx.db.query("networkMemberships").take(2))).toEqual([])
  })

  it("un enregistrement identique préserve l'horodatage sans réécriture", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    const t = testConvex({ automaticSessions: false })
    const person = await personFixture(t)
    const args = { locale: "en" as const, timeZone: "UTC" }
    await person.as.mutation(api.modules.people.preferences.setMyPreferences, args)
    const before = await t.run((ctx) => ctx.db.get(person.personId))
    vi.setSystemTime(Date.now() + 1000)
    await person.as.mutation(api.modules.people.preferences.setMyPreferences, args)
    expect(await t.run((ctx) => ctx.db.get(person.personId))).toEqual(before)
  })

  it("la limitation de débit s'applique aussi aux préférences", async () => {
    const t = testConvex({ automaticSessions: false })
    const person = await personFixture(t)
    const args = { locale: "fr" as const, timeZone: "UTC" }
    for (let count = 0; count < 10; count++) await person.as.mutation(api.modules.people.preferences.setMyPreferences, args)
    await expect(person.as.mutation(api.modules.people.preferences.setMyPreferences, { locale: "en", timeZone: "UTC" })).rejects.toMatchObject({ data: { code: "rateLimited" } })
    expect((await t.run((ctx) => ctx.db.get(person.personId)))?.locale).toBe("fr")
  })
})

describe("thème de ma personne", () => {
  it("enregistre le thème seul, sans écrire de langue ni de fuseau que la personne n'a pas choisis", async () => {
    const t = testConvex({ automaticSessions: false })
    const person = await personFixture(t)
    expect(await person.as.mutation(api.modules.people.preferences.setMyPreferences, { theme: "foret" })).toBeNull()
    const row = await t.run((ctx) => ctx.db.get(person.personId))
    expect(row?.theme).toBe("foret")
    expect(row?.locale).toBeUndefined()
    expect(row?.timeZone).toBeUndefined()
    expect(await t.run((ctx) => ctx.db.query("consents").take(2))).toEqual([])
  })

  it("la langue et le fuseau enregistrés ensuite laissent le thème intact, et inversement", async () => {
    const t = testConvex({ automaticSessions: false })
    const person = await personFixture(t)
    await person.as.mutation(api.modules.people.preferences.setMyPreferences, { theme: "lagon" })
    await person.as.mutation(api.modules.people.preferences.setMyPreferences, { locale: "en", timeZone: "Africa/Libreville" })
    expect(await t.run((ctx) => ctx.db.get(person.personId))).toMatchObject({ theme: "lagon", locale: "en", timeZone: "Africa/Libreville" })
    await person.as.mutation(api.modules.people.preferences.setMyPreferences, { theme: "gaboma" })
    expect(await t.run((ctx) => ctx.db.get(person.personId))).toMatchObject({ theme: "gaboma", locale: "en", timeZone: "Africa/Libreville" })
  })

  it("le thème du compte revient avec ma fiche, et seulement quand il a été choisi", async () => {
    const t = testConvex({ automaticSessions: false })
    const person = await personFixture(t)
    expect(await person.as.query(api.modules.people.persons.getMyPerson, {})).not.toHaveProperty("theme")
    await person.as.mutation(api.modules.people.preferences.setMyPreferences, { theme: "corail" })
    expect(await person.as.query(api.modules.people.persons.getMyPerson, {})).toMatchObject({ theme: "corail" })
  })

  it.each(["antsia", "atlantique", "indigo", "hibiscus", "encre", "mandarine"])("un ancien identifiant (%s, ADR-0027) reste valide en base et se lit comme le thème par défaut", async (legacy) => {
    const t = testConvex({ automaticSessions: false })
    const person = await personFixture(t)
    // Écrit tel quel, comme un compte qui l'avait choisi avant le 19/10 : le validateur de la table l'accepte.
    await t.run((ctx) => ctx.db.patch(person.personId, { theme: legacy as never }))
    expect((await t.run((ctx) => ctx.db.get(person.personId)))?.theme).toBe(legacy)
    expect(await person.as.query(api.modules.people.persons.getMyPerson, {})).toMatchObject({ theme: "gaboma" })
    await expect(person.as.mutation(api.modules.people.preferences.setMyPreferences, { theme: legacy } as never)).rejects.toThrow()
  })

  it.each(["rose", "Foret", "antsia-foret", "antsia", "mandarine", "", null, 3])("le validateur refuse un thème hors du contrat : %j", async (theme) => {
    const t = testConvex({ automaticSessions: false })
    const person = await personFixture(t)
    const before = await t.run((ctx) => ctx.db.get(person.personId))
    await expect(person.as.mutation(api.modules.people.preferences.setMyPreferences, { theme } as never)).rejects.toThrow()
    expect(await t.run((ctx) => ctx.db.get(person.personId))).toEqual(before)
  })

  it("un appel sans aucune préférence est refusé", async () => {
    const t = testConvex({ automaticSessions: false })
    const person = await personFixture(t)
    const before = await t.run((ctx) => ctx.db.get(person.personId))
    await expect(person.as.mutation(api.modules.people.preferences.setMyPreferences, {})).rejects.toMatchObject({ data: { code: "invalidArgument", field: "preferences" } })
    expect(await t.run((ctx) => ctx.db.get(person.personId))).toEqual(before)
  })

  it("un appel anonyme ou une session révoquée n'enregistre aucun thème", async () => {
    const t = testConvex({ automaticSessions: false })
    await expect(t.mutation(api.modules.people.preferences.setMyPreferences, { theme: "soleil" })).rejects.toMatchObject({ data: { code: "unauthenticated" } })
    const person = await personFixture(t)
    await t.mutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: person.sessionId }] } })
    await expect(person.as.mutation(api.modules.people.preferences.setMyPreferences, { theme: "soleil" })).rejects.toMatchObject({ data: { code: "unauthenticated" } })
    expect((await t.run((ctx) => ctx.db.get(person.personId)))?.theme).toBeUndefined()
  })

  it("le même thème préserve l'horodatage sans réécriture", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    const t = testConvex({ automaticSessions: false })
    const person = await personFixture(t)
    await person.as.mutation(api.modules.people.preferences.setMyPreferences, { theme: "electrique" })
    const before = await t.run((ctx) => ctx.db.get(person.personId))
    vi.setSystemTime(Date.now() + 1000)
    await person.as.mutation(api.modules.people.preferences.setMyPreferences, { theme: "electrique" })
    expect(await t.run((ctx) => ctx.db.get(person.personId))).toEqual(before)
  })

  it("le thème a son propre budget : le parcourir n'épuise pas celui de la langue et du fuseau", async () => {
    const t = testConvex({ automaticSessions: false })
    const person = await personFixture(t)
    const themes = ["gaboma", "soleil", "corail", "electrique"] as const
    for (let count = 0; count < 20; count++) await person.as.mutation(api.modules.people.preferences.setMyPreferences, { theme: themes[count % themes.length] })
    await expect(person.as.mutation(api.modules.people.preferences.setMyPreferences, { theme: "foret" })).rejects.toMatchObject({ data: { code: "rateLimited" } })
    expect((await t.run((ctx) => ctx.db.get(person.personId)))?.theme).toBe("electrique")
    await person.as.mutation(api.modules.people.preferences.setMyPreferences, { locale: "en", timeZone: "UTC" })
    expect((await t.run((ctx) => ctx.db.get(person.personId)))?.locale).toBe("en")
  })

  it("le budget de la langue et du fuseau épuisé n'empêche pas de choisir un thème", async () => {
    const t = testConvex({ automaticSessions: false })
    const person = await personFixture(t)
    for (let count = 0; count < 10; count++) await person.as.mutation(api.modules.people.preferences.setMyPreferences, { locale: "fr", timeZone: "UTC" })
    await expect(person.as.mutation(api.modules.people.preferences.setMyPreferences, { locale: "en", timeZone: "UTC", theme: "lagon" })).rejects.toMatchObject({ data: { code: "rateLimited" } })
    expect((await t.run((ctx) => ctx.db.get(person.personId)))?.theme).toBeUndefined()
    await person.as.mutation(api.modules.people.preferences.setMyPreferences, { theme: "lagon" })
    expect((await t.run((ctx) => ctx.db.get(person.personId)))?.theme).toBe("lagon")
  })
})
