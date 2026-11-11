// @vitest-environment edge-runtime
/**
 * EA-01 — membres fondateurs admis par décision tracée : admission puis page et
 * parrainage immédiats si la dispense est accordée ; sans dispense, l'ancienneté
 * reste exigée ; retrait qui fait retomber le statut selon les faits restants ;
 * refus hors opérateur (décisions et lecture de la console) ; chaque décision au
 * journal du moteur ; plafond tenu ; rien
 * d'office ; départ qui éteint l'admission ; la racine jamais élevée par la
 * décision. Sessions réelles (Better Auth), jamais un contournement des gardes.
 */
import { engineErrorAppRule, engineErrorCode } from "@antsia/social-contracts/errors"
import { FOUNDING_COHORT_MAX } from "@diasporale/domain"
import { describe, expect, it } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, createTestSession, testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Person = { readonly as: ReturnType<T["withIdentity"]>; readonly personId: Id<"persons"> }

const FOUNDERS = api.modules.diaspora.founders
const REASON = "Présidente d'une association relais du pilote France."

async function seedAll(t: T) {
  const foundations = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const diaspora = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  return { root: foundations.root, diasporale: diaspora.network }
}

/** Une personne aux sessions explicites, profil publié et consentement au profil social (sans adhésion). */
async function person(t: T, handle: string, displayName: string): Promise<Person> {
  const subject = `fondateurs-${handle}`
  const sessionId = await createTestSession(t, subject)
  const as = t.withIdentity({ subject, sessionId })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName })
  return { as, personId }
}

/** Un compte léger entré dans DIASPORALE par le vrai accueil : « en attente », sauf faits déjà posés. */
async function member(t: T, diasporale: Id<"networks">, handle: string, displayName: string): Promise<Person> {
  const someone = await person(t, handle, displayName)
  await someone.as.mutation(api.modules.diaspora.membership.joinDiasporale, { networkId: diasporale, facet: { countryOfResidence: "FR", city: "Nantes" } })
  return someone
}

/** Un opérateur de plateforme vivant (ligne `operators`) avec sa preuve de session, sans adhésion à DIASPORALE. */
async function operator(t: T, handle = "operatrice.pilote"): Promise<Person> {
  const someone = await person(t, handle, "Clarisse MBÉI")
  await t.run(async (ctx) => {
    await ctx.db.insert("operators", { personId: someone.personId, role: "platform_operator", grantedAt: Date.now() })
  })
  await createTestOperatorProof(t, someone.as, someone.personId)
  return someone
}

/** Les décisions du journal du moteur sur une personne (action, acteur, détail). */
async function auditOf(t: T, personId: Id<"persons">) {
  return await t.run(async (ctx) => (await ctx.db.query("engineAudit").take(200))
    .filter((row) => row.subjectTable === "persons" && row.subjectId === personId)
    .map((row) => ({ action: row.action, actorPersonId: row.actorPersonId, details: row.details })))
}

async function membershipOf(t: T, networkId: Id<"networks">, personId: Id<"persons">): Promise<Doc<"networkMemberships">> {
  const row = await t.run(async (ctx) => await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique())
  if (!row) throw new Error("Adhésion de fixture absente")
  return row
}

async function admissionsOf(t: T, diasporale: Id<"networks">, personId: Id<"persons">) {
  return await t.run(async (ctx) => await ctx.db.query("foundingAdmissions").withIndex("by_network_and_person", (q) => q.eq("networkId", diasporale).eq("personId", personId)).take(10))
}

async function refusal(promise: Promise<unknown>): Promise<{ code: string | null; appRule: string | null; limit: number | null }> {
  try {
    await promise
  } catch (error) {
    const app = engineErrorAppRule(error)
    const limit = app?.appParams?.limit
    return { code: engineErrorCode(error) ?? null, appRule: app?.appRule ?? null, limit: typeof limit === "number" ? limit : null }
  }
  throw new Error("aucune erreur levée")
}

/** La décision prise par la console, au nom de la personne connectée (un opérateur, ou non). */
function admit(by: Person, args: { networkId: Id<"networks">; personId: Id<"persons">; seniorityWaiver?: boolean; reason?: string }) {
  return by.as.mutation(FOUNDERS.admitFoundingMember, { reason: REASON, seniorityWaiver: true, ...args })
}

function withdraw(by: Person, args: { networkId: Id<"networks">; personId: Id<"persons">; reason?: string }) {
  return by.as.mutation(FOUNDERS.withdrawFoundingMember, { reason: "Compte signalé comme compromis par l'association.", ...args })
}

describe("EA-01 — admission fondatrice par décision tracée", () => {
  it("avec dispense : vérifiée par décision, badge, page créée et parrainage immédiat ; la racine n'est pas élevée", async () => {
    const t = testConvex({ automaticSessions: false })
    const { root, diasporale } = await seedAll(t)
    const op = await operator(t)
    const ada = await member(t, diasporale, "ada.fondatrice", "Ada MOUSSAVOU")
    const bea = await member(t, diasporale, "bea.filleule", "Béa NZAMBA")
    expect((await membershipOf(t, diasporale, ada.personId)).status).toBe("en_attente")
    const rootBefore = await membershipOf(t, root, ada.personId)

    const admitted = await admit(op, { networkId: diasporale, personId: ada.personId })
    expect(admitted.status).toBe("verifiee")
    expect(await membershipOf(t, diasporale, ada.personId)).toMatchObject({ status: "verifiee", verifiedBy: "operator" })
    const [row] = await admissionsOf(t, diasporale, ada.personId)
    expect(row).toMatchObject({ _id: admitted.admissionId, networkId: diasporale, personId: ada.personId, reason: REASON, seniorityWaiver: true, admittedByPersonId: op.personId })
    expect(row?.withdrawnAt).toBeUndefined()
    // La décision entre au journal du moteur, sujet la personne, motif et dispense au détail.
    expect(await auditOf(t, ada.personId)).toEqual([{ action: "diaspora.founder_admit", actorPersonId: op.personId, details: { reason: REASON, seniorityWaiver: true } }])
    // La décision est celle de DIASPORALE : l'adhésion ANTSIA garde son statut.
    expect((await membershipOf(t, root, ada.personId)).status).toBe(rootBefore.status)

    const mine = await ada.as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporale })
    expect(mine).toMatchObject({ status: "verifiee", badges: ["verified"] })
    expect(mine?.capabilities).toEqual(expect.arrayContaining(["create_page", "sponsor"]))

    // La page d'une association, puis le parrainage d'un second compte, le jour même.
    await ada.as.mutation(api.modules.pages.pages.createPage, { networkId: diasporale, name: "Association des Gabonais de Nantes", ownerKind: "association" })
    expect(await ada.as.query(api.modules.diaspora.membership.sponsorDashboard, { networkId: diasporale })).toMatchObject({ eligible: true, refusal: null })
    await ada.as.mutation(api.modules.diaspora.membership.sponsor, { networkId: diasporale, handle: "bea.filleule" })
    expect(await membershipOf(t, diasporale, bea.personId)).toMatchObject({ status: "declaree", sponsorPersonId: ada.personId })
  })

  it("sans dispense : vérifiée, mais l'ancienneté de 30 jours reste exigée pour parrainer", async () => {
    const t = testConvex({ automaticSessions: false })
    const { diasporale } = await seedAll(t)
    const op = await operator(t)
    const ada = await member(t, diasporale, "ada.fondatrice", "Ada MOUSSAVOU")
    await member(t, diasporale, "bea.filleule", "Béa NZAMBA")
    expect((await admit(op, { networkId: diasporale, personId: ada.personId, seniorityWaiver: false })).status).toBe("verifiee")
    expect(await ada.as.query(api.modules.diaspora.membership.sponsorDashboard, { networkId: diasporale })).toMatchObject({ eligible: false, refusal: "sponsor_too_recent" })
    expect((await refusal(ada.as.mutation(api.modules.diaspora.membership.sponsor, { networkId: diasporale, handle: "bea.filleule" }))).appRule).toBe("sponsor_too_recent")
  })

  it("le retrait fait retomber le statut selon les faits restants ; la décision et son retrait restent au journal", async () => {
    const t = testConvex({ automaticSessions: false })
    const { diasporale } = await seedAll(t)
    const op = await operator(t)
    const light = await member(t, diasporale, "ada.legere", "Ada MOUSSAVOU")
    const declared = await person(t, "carl.declare", "Carl ESSONO")
    await t.run(async (ctx) => {
      await ctx.db.insert("identityLinks", { personId: declared.personId, provider: "idn", subject: `idn-${declared.personId}`, loa: 1, nationality: "GA", linkedAt: Date.now() })
    })
    await declared.as.mutation(api.modules.diaspora.membership.joinDiasporale, { networkId: diasporale, facet: { countryOfResidence: "FR" } })
    expect((await membershipOf(t, diasporale, declared.personId)).status).toBe("declaree")

    for (const who of [light, declared]) await admit(op, { networkId: diasporale, personId: who.personId })
    expect((await withdraw(op, { networkId: diasporale, personId: light.personId })).status).toBe("en_attente")
    expect((await withdraw(op, { networkId: diasporale, personId: declared.personId })).status).toBe("declaree")
    expect(await declared.as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporale })).toMatchObject({ status: "declaree", badges: ["community"] })

    const [row] = await admissionsOf(t, diasporale, light.personId)
    expect(row).toMatchObject({ reason: REASON, withdrawnBy: "operator", withdrawnByPersonId: op.personId, withdrawalReason: "Compte signalé comme compromis par l'association." })
    expect(row?.withdrawnAt).toEqual(expect.any(Number))
    expect((await auditOf(t, light.personId)).map((entry) => [entry.action, entry.details])).toEqual([
      ["diaspora.founder_admit", { reason: REASON, seniorityWaiver: true }],
      ["diaspora.founder_withdraw", { reason: "Compte signalé comme compromis par l'association.", cause: "operator" }],
    ])
    // Un second retrait n'a rien à retirer ; une nouvelle décision rouvre une ligne, la première reste.
    expect(await refusal(withdraw(op, { networkId: diasporale, personId: light.personId }))).toMatchObject({ code: "notFound", appRule: "founding_not_admitted" })
    await admit(op, { networkId: diasporale, personId: light.personId })
    expect(await admissionsOf(t, diasporale, light.personId)).toHaveLength(2)
  })

  it("refus hors opérateur : un membre, un opérateur révoqué ; la console aussi ; autre réseau : refus indistinct", async () => {
    const t = testConvex({ automaticSessions: false })
    const { root, diasporale } = await seedAll(t)
    const op = await operator(t)
    const ada = await member(t, diasporale, "ada.fondatrice", "Ada MOUSSAVOU")
    const intruder = await member(t, diasporale, "intrus.membre", "Marc OKOUMA")
    const revoked = await operator(t, "ancien.operateur")
    await t.run(async (ctx) => {
      const row = await ctx.db.query("operators").withIndex("by_person", (q) => q.eq("personId", revoked.personId)).unique()
      if (row) await ctx.db.patch(row._id, { revokedAt: Date.now() })
    })

    for (const who of [intruder, revoked]) {
      expect((await refusal(admit(who, { networkId: diasporale, personId: ada.personId }))).code).toBe("operatorRequired")
    }
    await admit(op, { networkId: diasporale, personId: ada.personId })
    expect((await refusal(withdraw(intruder, { networkId: diasporale, personId: ada.personId }))).code).toBe("operatorRequired")
    expect(await admissionsOf(t, diasporale, ada.personId)).toHaveLength(1)
    expect((await refusal(admit(op, { networkId: root, personId: ada.personId }))).code).toBe("notFound")

    // La console : réservée aux opérateurs vivants ; un autre réseau ne se lit pas.
    expect((await refusal(intruder.as.query(api.modules.diaspora.founders.listFoundingAdmissions, { networkId: diasporale }))).code).toBe("operatorRequired")
    const cohort = await op.as.query(api.modules.diaspora.founders.listFoundingAdmissions, { networkId: diasporale })
    expect(cohort).toMatchObject({ cohortMax: FOUNDING_COHORT_MAX, withdrawn: [] })
    expect(cohort.active).toEqual([
      expect.objectContaining({ personId: ada.personId, person: { handle: "ada.fondatrice", displayName: "Ada MOUSSAVOU" }, reason: REASON, seniorityWaiver: true, admittedByPersonId: op.personId, withdrawnAt: null }),
    ])
    expect((await refusal(op.as.query(api.modules.diaspora.founders.listFoundingAdmissions, { networkId: root }))).code).toBe("notFound")
  })

  it("plafond tenu, rien d'office, une seule admission en vigueur, motif exigé", async () => {
    const t = testConvex({ automaticSessions: false })
    const { root, diasporale } = await seedAll(t)
    const op = await operator(t)
    const ada = await member(t, diasporale, "ada.fondatrice", "Ada MOUSSAVOU")
    const suspended = await member(t, diasporale, "marc.suspendu", "Marc OKOUMA")
    const outsider = await person(t, "brice.dehors", "Brice MOUNDOUNGA")

    // Rien d'office : sans adhésion, ou suspendue (ici ou à la racine), la personne n'est pas admissible.
    expect(await refusal(admit(op, { networkId: diasporale, personId: outsider.personId }))).toMatchObject({ code: "notFound", appRule: "founding_target_not_member" })
    const rootRow = await membershipOf(t, root, suspended.personId)
    await t.run(async (ctx) => { await ctx.db.patch(rootRow._id, { status: "suspendue", statusBeforeSuspension: rootRow.status === "verifiee" ? "verifiee" : "declaree" }) })
    expect((await refusal(admit(op, { networkId: diasporale, personId: suspended.personId }))).appRule).toBe("founding_target_not_member")
    expect(await refusal(admit(op, { networkId: diasporale, personId: ada.personId, reason: "court" }))).toMatchObject({ code: "invalidArgument" })

    // La cohorte pleine : les admissions en vigueur atteignent le plafond.
    const filler = await t.run(async (ctx) => {
      const ids: Id<"foundingAdmissions">[] = []
      for (let index = 0; index < FOUNDING_COHORT_MAX; index += 1) {
        ids.push(await ctx.db.insert("foundingAdmissions", { networkId: diasporale, personId: op.personId, reason: REASON, seniorityWaiver: false, admittedAt: Date.now() }))
      }
      return ids
    })
    expect(await refusal(admit(op, { networkId: diasporale, personId: ada.personId }))).toEqual({ code: "conflict", appRule: "founding_cohort_full", limit: FOUNDING_COHORT_MAX })
    expect(await admissionsOf(t, diasporale, ada.personId)).toEqual([])
    // Une place libérée par un retrait se reprend ; une admission en vigueur ne se double pas.
    await t.run(async (ctx) => { await ctx.db.patch(filler[0]!, { withdrawnAt: Date.now(), withdrawnBy: "operator", withdrawnByPersonId: op.personId, withdrawalReason: REASON }) })
    expect((await admit(op, { networkId: diasporale, personId: ada.personId })).status).toBe("verifiee")
    await t.run(async (ctx) => { await ctx.db.patch(filler[1]!, { withdrawnAt: Date.now(), withdrawnBy: "operator", withdrawnByPersonId: op.personId, withdrawalReason: REASON }) })
    expect(await refusal(admit(op, { networkId: diasporale, personId: ada.personId }))).toMatchObject({ code: "conflict", appRule: "founding_already_admitted" })
  })

  it("le départ éteint l'admission ; au retour, il faut une nouvelle décision", async () => {
    const t = testConvex({ automaticSessions: false })
    const { diasporale } = await seedAll(t)
    const op = await operator(t)
    const ada = await member(t, diasporale, "ada.fondatrice", "Ada MOUSSAVOU")
    await admit(op, { networkId: diasporale, personId: ada.personId })
    await ada.as.mutation(api.modules.diaspora.membership.leaveDiasporale, { networkId: diasporale })
    const [row] = await admissionsOf(t, diasporale, ada.personId)
    expect(row).toMatchObject({ withdrawnBy: "departure" })
    expect(row?.withdrawnAt).toEqual(expect.any(Number))
    expect(row?.withdrawnByPersonId).toBeUndefined()
    const back = await ada.as.mutation(api.modules.diaspora.membership.joinDiasporale, { networkId: diasporale, facet: { countryOfResidence: "FR" } })
    expect(back.status).toBe("en_attente")
  })
})
