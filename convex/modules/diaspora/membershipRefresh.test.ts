// @vitest-environment edge-runtime
/**
 * EA-03 — statut relu quand l'identité change hors de la tranche : `myMembership`
 * dit l'écart (`statusOutdated`) sans rien écrire ; `refreshMyMembership` relit les
 * faits et applique LA règle. Compte léger qui lie IDN → « déclarée » ; niveau IDN
 * relevé avec parrainage → « vérifiée » ; lien révoqué → retombe ; sans écart, rien
 * n'est écrit ; suspendu (ici ou à la racine) et parti inchangés ; autre réseau :
 * refus indistinct.
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { DAY_MS } from "@diaspora-ga/domain"
import { describe, expect, it } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, openNetworkFeatures, testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Person = { readonly as: ReturnType<T["withIdentity"]>; readonly personId: Id<"persons"> }

const MEMBERSHIP = api.modules.diaspora.membership

async function seedAll(t: T) {
  const foundations = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const diaspora = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  await openNetworkFeatures(t, diaspora.network)
  return { root: foundations.root, diasporaGa: diaspora.network }
}

/** Un compte léger entré dans DIASPORA.GA par le vrai accueil, sessions explicites. */
async function member(t: T, diasporaGa: Id<"networks">, handle: string, displayName: string): Promise<Person> {
  const subject = `relecture-${handle}`
  const sessionId = await createTestSession(t, subject)
  const as = t.withIdentity({ subject, sessionId })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName })
  await as.mutation(MEMBERSHIP.joinDiasporaGa, { networkId: diasporaGa, facet: { countryOfResidence: "FR", city: "Lyon" } })
  return { as, personId }
}

/** Un lien IDN posé HORS de la tranche (ce que fait la synchronisation d'identité du moteur). */
async function linkIdn(t: T, personId: Id<"persons">, loa: number): Promise<Id<"identityLinks">> {
  return await t.run(async (ctx) => await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `idn-${personId}`, loa, nationality: "GA", linkedAt: Date.now() }))
}

async function membershipOf(t: T, networkId: Id<"networks">, personId: Id<"persons">): Promise<Doc<"networkMemberships">> {
  const row = await t.run(async (ctx) => await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique())
  if (!row) throw new Error("Adhésion de fixture absente")
  return row
}

async function code(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise
  } catch (error) {
    return engineErrorCode(error)
  }
  throw new Error("aucune erreur levée")
}

async function outdated(who: Person, diasporaGa: Id<"networks">) {
  return (await who.as.query(MEMBERSHIP.myMembership, { networkId: diasporaGa }))?.statusOutdated
}

describe("EA-03 — statut relu quand l'identité change", () => {
  it("un compte léger qui lie IDN : l'écart est dit sans rien écrire, la relecture le rend « déclarée »", async () => {
    const t = testConvex({ automaticSessions: false })
    const { diasporaGa } = await seedAll(t)
    const ada = await member(t, diasporaGa, "ada.legere", "Ada MOUSSAVOU")
    expect(await outdated(ada, diasporaGa)).toBe(false)
    await linkIdn(t, ada.personId, 1)
    expect(await ada.as.query(MEMBERSHIP.myMembership, { networkId: diasporaGa })).toMatchObject({ status: "en_attente", statusOutdated: true })
    expect((await membershipOf(t, diasporaGa, ada.personId)).status).toBe("en_attente")
    expect(await ada.as.mutation(MEMBERSHIP.refreshMyMembership, { networkId: diasporaGa })).toEqual({ status: "declaree", changed: true })
    expect(await ada.as.query(MEMBERSHIP.myMembership, { networkId: diasporaGa })).toMatchObject({ status: "declaree", statusOutdated: false })
  })

  it("un niveau IDN relevé avec un parrainage : « vérifiée » ; le lien révoqué : le statut retombe", async () => {
    const t = testConvex({ automaticSessions: false })
    const { diasporaGa } = await seedAll(t)
    const sponsor = await member(t, diasporaGa, "parrain.ancien", "Patrice MBOUMBA")
    await t.run(async (ctx) => {
      await ctx.db.insert("identityLinks", { personId: sponsor.personId, provider: "consular_attestation", subject: `empreinte-${sponsor.personId}`, country: "FR", linkedAt: Date.now() })
    })
    expect(await sponsor.as.mutation(MEMBERSHIP.refreshMyMembership, { networkId: diasporaGa })).toEqual({ status: "verifiee", changed: true })
    const row = await membershipOf(t, diasporaGa, sponsor.personId)
    await t.run(async (ctx) => { await ctx.db.patch(row._id, { statusChangedAt: Date.now() - 31 * DAY_MS }) })

    const bea = await member(t, diasporaGa, "bea.idn", "Béa NZAMBA")
    const link = await linkIdn(t, bea.personId, 1)
    await bea.as.mutation(MEMBERSHIP.refreshMyMembership, { networkId: diasporaGa })
    await sponsor.as.mutation(MEMBERSHIP.sponsor, { networkId: diasporaGa, handle: "bea.idn" })
    expect((await membershipOf(t, diasporaGa, bea.personId)).status).toBe("declaree")

    await t.run(async (ctx) => { await ctx.db.patch(link, { loa: 2 }) })
    expect(await outdated(bea, diasporaGa)).toBe(true)
    expect(await bea.as.mutation(MEMBERSHIP.refreshMyMembership, { networkId: diasporaGa })).toEqual({ status: "verifiee", changed: true })

    await t.run(async (ctx) => { await ctx.db.patch(link, { revokedAt: Date.now() }) })
    expect(await outdated(bea, diasporaGa)).toBe(true)
    expect(await bea.as.mutation(MEMBERSHIP.refreshMyMembership, { networkId: diasporaGa })).toEqual({ status: "declaree", changed: true })
    expect(await bea.as.query(MEMBERSHIP.myMembership, { networkId: diasporaGa })).toMatchObject({ status: "declaree", statusOutdated: false })
  })

  it("sans écart, la relecture n'écrit rien", async () => {
    const t = testConvex({ automaticSessions: false })
    const { diasporaGa } = await seedAll(t)
    const ada = await member(t, diasporaGa, "ada.legere", "Ada MOUSSAVOU")
    const before = await membershipOf(t, diasporaGa, ada.personId)
    expect(await ada.as.mutation(MEMBERSHIP.refreshMyMembership, { networkId: diasporaGa })).toEqual({ status: "en_attente", changed: false })
    const after = await membershipOf(t, diasporaGa, ada.personId)
    expect([after.status, after.statusChangedAt, after.verifiedBy]).toEqual([before.status, before.statusChangedAt, before.verifiedBy])
  })

  it("suspendu ici, suspendu à la racine et parti restent inchangés, quels que soient les faits", async () => {
    const t = testConvex({ automaticSessions: false })
    const { root, diasporaGa } = await seedAll(t)
    const suspended = await member(t, diasporaGa, "marc.suspendu", "Marc OKOUMA")
    const rootSuspended = await member(t, diasporaGa, "christelle.racine", "Christelle IVANGA")
    const gone = await member(t, diasporaGa, "yannick.parti", "Yannick MBADINGA")
    const here = await membershipOf(t, diasporaGa, suspended.personId)
    const atRoot = await membershipOf(t, root, rootSuspended.personId)
    await t.run(async (ctx) => {
      await ctx.db.patch(here._id, { status: "suspendue", statusBeforeSuspension: "en_attente" })
      await ctx.db.patch(atRoot._id, { status: "suspendue", statusBeforeSuspension: "declaree" })
    })
    await gone.as.mutation(MEMBERSHIP.leaveDiasporaGa, { networkId: diasporaGa })
    for (const who of [suspended, rootSuspended, gone]) await linkIdn(t, who.personId, 2)

    for (const who of [suspended, rootSuspended]) {
      expect(await who.as.query(MEMBERSHIP.myMembership, { networkId: diasporaGa })).toMatchObject({ status: "suspendue", statusOutdated: false })
    }
    for (const who of [suspended, rootSuspended, gone]) {
      expect(await code(who.as.mutation(MEMBERSHIP.refreshMyMembership, { networkId: diasporaGa }))).toBe("notFound")
    }
    expect((await membershipOf(t, diasporaGa, suspended.personId)).status).toBe("suspendue")
    expect((await membershipOf(t, diasporaGa, rootSuspended.personId)).status).toBe("en_attente")
    expect((await membershipOf(t, diasporaGa, gone.personId)).status).toBe("partie")
  })

  it("un autre réseau que celui de la tranche : refus indistinct", async () => {
    const t = testConvex({ automaticSessions: false })
    const { root, diasporaGa } = await seedAll(t)
    const ada = await member(t, diasporaGa, "ada.legere", "Ada MOUSSAVOU")
    expect(await code(ada.as.mutation(MEMBERSHIP.refreshMyMembership, { networkId: root }))).toBe("notFound")
  })
})
