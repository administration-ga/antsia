// @vitest-environment edge-runtime
/**
 * ADR-0044 (lot M1) — le pré-remplissage ÉPHÉMÈRE de l'accueil : écrit par le seul rappel OIDC,
 * gardé 24 h, relu par la seule personne de la session, effacé à la publication de son profil.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { IDN_PREFILL_TTL_MS } from "./idnPrefill"

type T = ReturnType<typeof testConvex>

afterEach(() => vi.useRealTimers())

const AWA = { givenNames: "Gaëlle Awa", familyName: "MOUSSAVOU-NZÉ", idnIdentifier: "moussavounze.awa" }

async function rowOf(t: T, authUserId: string) {
  return await t.run(async (ctx) => await ctx.db.query("idnPrefills").withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId)).unique())
}

/** Un moteur avec sa racine : publier un profil exige le réseau racine. */
async function seededConvex(): Promise<T> {
  const t = testConvex()
  await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  return t
}

/** Une personne déjà publiée, titulaire d'un identifiant donné. */
async function publishedHolder(t: T, subject: string, handle: string): Promise<Id<"persons">> {
  const as = t.withIdentity({ subject })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: "Titulaire" })
  return personId
}

describe("myEntryPrefill — ce que l'accueil propose avant le geste", () => {
  it("compose le nom civil au serveur et donne la disponibilité des seuls candidats de l'appelant", async () => {
    const t = await seededConvex()
    await publishedHolder(t, "idn-prefill-holder", "awa")
    await t.mutation(internal.modules.people.idnPrefill.recordIdnPrefill, { authUserId: "idn-prefill-awa", ...AWA })
    const as = t.withIdentity({ subject: "idn-prefill-awa" })
    await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    expect(await as.query(api.modules.people.idnPrefill.myEntryPrefill, {})).toEqual({
      displayName: "MOUSSAVOU-NZÉ Gaëlle Awa",
      handles: [
        { handle: "awa", available: false },
        { handle: "moussavounze.awa", available: true },
        { handle: "gaelle", available: true },
        { handle: "gaelle.moussavounze", available: true },
        { handle: "moussavounze.gaelle", available: true },
        { handle: "gaelleawa.moussavounze", available: true },
      ],
      residence: null,
    })
  })

  it("NOM(S) en capitales puis Prénom(s), par le normaliseur partagé", async () => {
    const t = testConvex()
    await t.mutation(internal.modules.people.idnPrefill.recordIdnPrefill, { authUserId: "idn-prefill-ndong", givenNames: "jean-rémy ÉLOÏSE", familyName: "ndong mba" })
    const as = t.withIdentity({ subject: "idn-prefill-ndong" })
    await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    const prefill = await as.query(api.modules.people.idnPrefill.myEntryPrefill, {})
    expect(prefill?.displayName).toBe("NDONG MBA Jean-Rémy Éloïse")
    expect(prefill?.residence).toBeNull()
  })

  it("l'identifiant IDN seul : aucun nom affiché inventé, l'identifiant proposé", async () => {
    const t = testConvex()
    await t.mutation(internal.modules.people.idnPrefill.recordIdnPrefill, { authUserId: "idn-prefill-only-id", idnIdentifier: "ndong.paul" })
    const as = t.withIdentity({ subject: "idn-prefill-only-id" })
    await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    expect(await as.query(api.modules.people.idnPrefill.myEntryPrefill, {})).toEqual({ displayName: null, handles: [{ handle: "ndong.paul", available: true }], residence: null })
  })

  it("aucun compte IDN (entrée par code) : null", async () => {
    const t = testConvex()
    const as = t.withIdentity({ subject: "idn-prefill-otp" })
    await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    expect(await as.query(api.modules.people.idnPrefill.myEntryPrefill, {})).toBeNull()
  })

  it("la ligne d'une autre personne : null, et elle reste à sa titulaire", async () => {
    const t = testConvex()
    await t.mutation(internal.modules.people.idnPrefill.recordIdnPrefill, { authUserId: "idn-prefill-someone", ...AWA })
    const as = t.withIdentity({ subject: "idn-prefill-intruder" })
    await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    expect(await as.query(api.modules.people.idnPrefill.myEntryPrefill, {})).toBeNull()
    expect(await rowOf(t, "idn-prefill-someone")).not.toBeNull()
  })

  it("une ligne échue (24 h) : null, même avant la purge", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    await t.mutation(internal.modules.people.idnPrefill.recordIdnPrefill, { authUserId: "idn-prefill-expired", ...AWA })
    const as = t.withIdentity({ subject: "idn-prefill-expired" })
    await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    expect(await as.query(api.modules.people.idnPrefill.myEntryPrefill, {})).not.toBeNull()
    vi.setSystemTime(Date.now() + IDN_PREFILL_TTL_MS)
    expect(await as.query(api.modules.people.idnPrefill.myEntryPrefill, {})).toBeNull()
    expect(await rowOf(t, "idn-prefill-expired")).not.toBeNull()
  })

  it("un profil déjà publié : null (l'identité n'a plus d'objet)", async () => {
    const t = await seededConvex()
    await publishedHolder(t, "idn-prefill-published", "deja.publie")
    await t.run(async (ctx) => await ctx.db.insert("idnPrefills", { authUserId: "idn-prefill-published", ...AWA, observedAt: Date.now(), expiresAt: Date.now() + IDN_PREFILL_TTL_MS }))
    const as = t.withIdentity({ subject: "idn-prefill-published" })
    expect(await as.query(api.modules.people.idnPrefill.myEntryPrefill, {})).toBeNull()
  })
})

describe("recordIdnPrefill — l'écriture du rappel OIDC", () => {
  it("garde 24 h, et un nouveau retour d'IDN remplace la ligne au lieu d'en ajouter une", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const first = Date.now()
    await t.mutation(internal.modules.people.idnPrefill.recordIdnPrefill, { authUserId: "idn-prefill-renew", ...AWA })
    expect(await rowOf(t, "idn-prefill-renew")).toMatchObject({ ...AWA, observedAt: first, expiresAt: first + IDN_PREFILL_TTL_MS })
    vi.setSystemTime(first + 60_000)
    await t.mutation(internal.modules.people.idnPrefill.recordIdnPrefill, { authUserId: "idn-prefill-renew", idnIdentifier: "moussavounze.awa" })
    const renewed = await rowOf(t, "idn-prefill-renew")
    expect(renewed).toMatchObject({ idnIdentifier: "moussavounze.awa", observedAt: first + 60_000, expiresAt: first + 60_000 + IDN_PREFILL_TTL_MS })
    expect(renewed?.givenNames).toBeUndefined()
    expect(renewed?.familyName).toBeUndefined()
    expect(await t.run(async (ctx) => (await ctx.db.query("idnPrefills").take(5)).length)).toBe(1)
  })

  it("n'écrit aucun nom pour une personne dont le profil est déjà publié", async () => {
    const t = await seededConvex()
    await publishedHolder(t, "idn-prefill-already", "deja.la")
    await t.mutation(internal.modules.people.idnPrefill.recordIdnPrefill, { authUserId: "idn-prefill-already", ...AWA })
    expect(await rowOf(t, "idn-prefill-already")).toBeNull()
  })

  it("n'écrit rien pour une personne dont l'effacement est demandé", async () => {
    const t = testConvex()
    const as = t.withIdentity({ subject: "idn-prefill-leaving" })
    const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    await t.run(async (ctx) => await ctx.db.patch(personId, { deletionRequestedAt: Date.now() }))
    await t.mutation(internal.modules.people.idnPrefill.recordIdnPrefill, { authUserId: "idn-prefill-leaving", ...AWA })
    expect(await rowOf(t, "idn-prefill-leaving")).toBeNull()
  })

  it("une valeur hors bornes est écartée au serveur, sans lever", async () => {
    const t = testConvex()
    await t.mutation(internal.modules.people.idnPrefill.recordIdnPrefill, { authUserId: "idn-prefill-bounds", givenNames: "A".repeat(101), familyName: "NDONG", idnIdentifier: "Pas Un Identifiant" })
    const row = await rowOf(t, "idn-prefill-bounds")
    expect(row).toMatchObject({ familyName: "NDONG" })
    expect(row?.givenNames).toBeUndefined()
    expect(row?.idnIdentifier).toBeUndefined()
  })
})

describe("cycle de vie : la publication efface l'identité, la purge quotidienne le reste", () => {
  it("publishMyProfile efface la part d'identité du pré-remplissage", async () => {
    const t = await seededConvex()
    await t.mutation(internal.modules.people.idnPrefill.recordIdnPrefill, { authUserId: "idn-prefill-publish", ...AWA })
    const as = t.withIdentity({ subject: "idn-prefill-publish" })
    await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    await as.mutation(api.modules.people.profile.publishMyProfile, { handle: "moussavounze.awa", displayName: "MOUSSAVOU-NZÉ Gaëlle Awa" })
    expect(await rowOf(t, "idn-prefill-publish")).toBeNull()
    expect(await as.query(api.modules.people.idnPrefill.myEntryPrefill, {})).toBeNull()
  })

  it("la purge retire les lignes échues et garde les vivantes", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    await t.mutation(internal.modules.people.idnPrefill.recordIdnPrefill, { authUserId: "idn-prefill-old", ...AWA })
    vi.setSystemTime(Date.now() + IDN_PREFILL_TTL_MS - 1_000)
    await t.mutation(internal.modules.people.idnPrefill.recordIdnPrefill, { authUserId: "idn-prefill-fresh", ...AWA })
    vi.setSystemTime(Date.now() + 1_000)
    await t.mutation(internal.modules.people.idnPrefill.purgeExpiredIdnPrefills, {})
    expect(await rowOf(t, "idn-prefill-old")).toBeNull()
    expect(await rowOf(t, "idn-prefill-fresh")).not.toBeNull()
  })
})
