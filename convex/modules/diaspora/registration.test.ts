// @vitest-environment edge-runtime
import { afterEach, expect, it, vi } from "vitest"
import { api, components, internal } from "../../_generated/api"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, testConvex } from "../../test.setup"

async function account(phoneVerified: boolean, idnNationality?: string) {
  const t = testConvex({ automaticSessions: false })
  await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  const now = Date.now()
  const user = await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: {
    email: "citoyenne@example.org", emailVerified: true, name: "Marie", phoneNumber: "+24177000000", phoneNumberVerified: phoneVerified,
    createdAt: now, updatedAt: now,
  } } })
  if (!user || typeof user._id !== "string") throw new Error("Compte de test manquant")
  const sessionId = await createTestSession(t, user._id, now + 12 * 24 * 60 * 60 * 1000)
  const as = t.withIdentity({ subject: user._id, sessionId })
  if (idnNationality) {
    await t.mutation(components.betterAuth.adapter.create, { input: { model: "account", data: {
      userId: user._id, accountId: "idn-test", providerId: "idn", createdAt: now, updatedAt: now,
    } } })
    await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: "idn-test", loa: 1, nationality: idnNationality })
  }
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle: "marie.ndong", displayName: "Marie NDONG" })
  return { t, as, personId, networkId: network }
}

const phoneRegistration = { firstName: "marie", lastName: "ndong", declaredGabonese: true as const }
const facet = { countryOfResidence: "FR" }

it("refuse une session e-mail seule même si elle soumet la déclaration téléphone", async () => {
  const { as, networkId } = await account(false)
  await expect(as.query(api.modules.diaspora.membership.checkRegistration, { networkId })).rejects.toThrow(/gabonese_nationality_required/)
  await expect(as.mutation(api.modules.diaspora.membership.joinDiasporaGa, { networkId, facet, phoneRegistration })).rejects.toThrow(/verified_phone_required/)
})

it("un numéro confirmé et une déclaration admettent une seule fois, sans niveau 2 présumé", async () => {
  const { t, as, networkId, personId } = await account(true)
  await expect(as.query(api.modules.diaspora.membership.checkRegistration, { networkId })).rejects.toThrow(/gabonese_nationality_required/)
  expect(await as.query(api.modules.diaspora.membership.checkRegistration, { networkId, phoneRegistration })).toBeNull()
  const args = { networkId, facet, phoneRegistration }
  expect(await as.mutation(api.modules.diaspora.membership.joinDiasporaGa, args)).toMatchObject({ status: "en_attente" })
  expect(await as.mutation(api.modules.diaspora.membership.joinDiasporaGa, args)).toMatchObject({ status: "en_attente" })
  const row = await t.run(ctx => ctx.db.query("memberPrivacy").withIndex("by_network_and_person", q => q.eq("networkId", networkId).eq("personId", personId)).unique())
  expect(row?.phoneRegistration).toMatchObject({ firstName: "Marie", lastName: "NDONG", nationality: "GA" })
})

it("refuse une identité étrangère même si le téléphone est vérifié", async () => {
  const { as, networkId } = await account(true, "FR")
  await expect(as.mutation(api.modules.diaspora.membership.joinDiasporaGa, { networkId, facet, phoneRegistration })).rejects.toThrow(/gabonese_nationality_required/)
})

it("accepte le Gabon issu de la preuve IDN sans formulaire téléphone", async () => {
  const { as, networkId } = await account(false, "GAB")
  expect(await as.mutation(api.modules.diaspora.membership.joinDiasporaGa, { networkId, facet })).toMatchObject({ status: "declaree" })
})

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })

it("détecte une inscription consulaire ultérieure sur le même sujet, sans confirmer sur erreur technique", async () => {
  vi.useFakeTimers()
  vi.stubEnv("CONSULAT_PASS_ISSUER", "https://consulat.example.test")
  vi.stubEnv("DIASPORA_PASS_APP_ORIGIN", "https://diaspora.ga")
  vi.stubEnv("DIASPORA_PASS_SECRET", "test-strictly-private-server-key-of-sufficient-length")
  const { t, as, networkId, personId } = await account(false, "GAB")
  const relay = vi.fn(async () => Response.json({ verified: false }))
  vi.stubGlobal("fetch", relay)
  const row = () => t.run(ctx => ctx.db.query("memberPrivacy").withIndex("by_network_and_person", q => q.eq("networkId", networkId).eq("personId", personId)).unique())
  const complete = async () => {
    const requestId = (await row())?.consulateLookup?.requestId
    if (!requestId) throw new Error("Contrôle attendu")
    await t.action(internal.modules.diaspora.consulateLookup.fetchMembership, { networkId, personId, requestId })
  }
  expect(relay).not.toHaveBeenCalled()
  await as.mutation(api.modules.diaspora.membership.joinDiasporaGa, { networkId, facet })
  await complete()
  expect(relay).toHaveBeenCalledWith(new URL("https://consulat.example.test/diaspora/session/membership"), expect.objectContaining({
    headers: expect.objectContaining({ Authorization: "Bearer test-strictly-private-server-key-of-sufficient-length" }),
    body: JSON.stringify({ idn: "idn-test" }),
  }))
  const check = () => as.query(api.modules.diaspora.membership.myMembership, { networkId })
  expect(await check()).toMatchObject({ status: "declaree", statusOutdated: false })
  vi.setSystemTime(Date.now() + 16 * 60 * 1000)
  expect(await check()).toMatchObject({ statusOutdated: true })
  await as.mutation(api.modules.diaspora.membership.refreshMyMembership, { networkId })
  relay.mockRejectedValueOnce(new Error("Service momentanément indisponible"))
  await complete()
  expect(await check()).toMatchObject({ status: "declaree", statusOutdated: false })
  vi.setSystemTime(Date.now() + 16 * 60 * 1000)
  await as.mutation(api.modules.diaspora.membership.refreshMyMembership, { networkId })
  relay.mockResolvedValueOnce(Response.json({ verified: true }))
  await complete()
  expect(await check()).toMatchObject({ status: "verifiee", statusOutdated: false })
  const sponsor = () => as.query(api.modules.diaspora.membership.sponsorDashboard, { networkId })
  const approved = await sponsor()
  expect(approved).toMatchObject({ eligible: true, code: expect.any(String) })
  vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000)
  await as.mutation(api.modules.diaspora.membership.refreshMyMembership, { networkId })
  relay.mockResolvedValueOnce(new Response(null, { status: 503 }))
  await complete()
  expect(await check()).toMatchObject({ status: "verifiee", statusOutdated: false })
  expect((await sponsor()).code).toEqual(approved.code)
})
