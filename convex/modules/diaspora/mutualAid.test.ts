// @vitest-environment edge-runtime
/**
 * Entraide DIASPORALE (DG-024 a) : questions, réponse retenue, missions
 * bénévoles et inscriptions — gardes du réseau, du statut, des coordonnées et
 * des équipes vivantes, avec de vraies sessions (harnais `testConvex`).
 *
 * Les membres de ces scénarios ont une garantie IDN 2 : ce ne sont pas des
 * comptes légers, le seau renforcé `diaspora.aid.post.reinforced` ne les borne
 * pas (il est éprouvé par le limiteur lui-même). L'horloge reste fixe : une
 * session de test dure sept jours ; un début de mission passé se pose en base.
 */
import { engineErrorAppRule, engineErrorCode } from "@antsia/social-contracts/errors"
import type { AidTheme } from "@diasporale/domain"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Member = Awaited<ReturnType<typeof member>>

const NOW = Date.UTC(2026, 9, 18, 10)
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const AID = api.modules.diaspora.mutualAid
const FIRST = { numItems: 20, cursor: null }

/** Une question fictive complète : chaque test n'en change qu'un trait. */
const QUESTION: { title: string; detail: string; theme: AidTheme; country: string; city: string } = {
  title: "Trouver une colocation à Lyon avant janvier",
  detail: "J'arrive en janvier pour mes études. Quels quartiers conseillez-vous ?",
  theme: "housing",
  country: "FR",
  city: "Lyon",
}

/** Une mission fictive complète. */
const MISSION = {
  title: "Accueillir les nouveaux arrivants à la gare",
  description: "Orienter les étudiants qui arrivent le samedi matin, avec un plan du quartier.",
  country: "FR",
  city: "Lyon",
  area: "Près de la gare Part-Dieu",
  startsAt: NOW + 2 * DAY,
  endsAt: NOW + 2 * DAY + 3 * HOUR,
  timeZone: "Europe/Paris",
  places: 3,
}

const CARD_KEYS = ["answerCount", "author", "city", "country", "createdAt", "detail", "hasAcceptedAnswer", "isMine", "moderation", "questionId", "status", "theme", "title"]

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

/** Un membre déclaré de DIASPORALE (lien IDN de garantie 2), au profil publié. */
async function member(t: T, networkId: Id<"networks">, handle: string) {
  const as = t.withIdentity({ subject: `auth-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await t.run(async (ctx) => {
    await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `idn-${personId}`, loa: 2, nationality: "GA", linkedAt: NOW })
  })
  await as.mutation(api.modules.diaspora.membership.joinDiasporale, { networkId, facet: { countryOfResidence: "FR", city: "Lyon" } })
  return { as, personId, handle }
}

async function page(t: T, networkId: Id<"networks">, handle: string, options: { ownerKind?: Doc<"pages">["ownerKind"]; status?: Doc<"pages">["status"] } = {}) {
  return await t.run(async (ctx) => ctx.db.insert("pages", {
    networkId, handle, name: `Page ${handle}`, ownerKind: options.ownerKind ?? "association", trust: "community", trustRank: 0,
    visibility: "network", onRoot: false, status: options.status ?? "active", searchText: handle, createdAt: NOW, updatedAt: NOW,
  }))
}

async function grant(t: T, networkId: Id<"networks">, pageId: Id<"pages">, personId: Id<"persons">, role: "admin" | "signatory", accepted = true) {
  return await t.run(async (ctx) => ctx.db.insert("pageSignatories", {
    networkId, pageId, personId, role, ...(accepted ? { acceptedAt: NOW } : {}), createdAt: NOW, updatedAt: NOW,
  }))
}

async function setStatus(t: T, networkId: Id<"networks">, personId: Id<"persons">, status: "en_attente" | "suspendue") {
  await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships")
      .withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique()
    if (!row) throw new Error("Adhésion de fixture absente")
    await ctx.db.patch(row._id, { status })
  })
}

/** Le code du refus : le refus d'application d'abord, sinon le code du moteur ; `null` sans refus. */
async function refusal(promise: Promise<unknown>): Promise<string | null> {
  try { await promise } catch (error) { return engineErrorAppRule(error)?.appRule ?? engineErrorCode(error) }
  return null
}

async function failure(promise: Promise<unknown>): Promise<{ code: string | null; appRule: string | null }> {
  try { await promise } catch (error) { return { code: engineErrorCode(error), appRule: engineErrorAppRule(error)?.appRule ?? null } }
  return { code: null, appRule: null }
}

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  const asker = await member(t, networkId, "demandeuse")
  const helper = await member(t, networkId, "aidante")
  const other = await member(t, networkId, "autre.membre")
  const admin = await member(t, networkId, "admin.asso")
  const pageId = await page(t, networkId, "collectif-entraide")
  await grant(t, networkId, pageId, admin.personId, "admin")
  return { t, root, networkId, pageId, asker, helper, other, admin }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

async function ask(f: Fixture, who: Member, change: Partial<typeof QUESTION> = {}) {
  return await who.as.mutation(AID.askQuestion, { networkId: f.networkId, ...QUESTION, ...change })
}

async function answer(f: Fixture, who: Member, questionId: Id<"aidQuestions">, body = "La métropole publie une liste de foyers étudiants.") {
  return await who.as.mutation(AID.answerQuestion, { networkId: f.networkId, questionId, body })
}

function list(f: Fixture, who: Member, args: { country?: string; city?: string; status?: "open" | "resolved" | "closed" } = {}) {
  return who.as.query(AID.listQuestions, { networkId: f.networkId, country: args.country ?? "FR", ...(args.city !== undefined ? { city: args.city } : {}), status: args.status ?? "open", paginationOpts: FIRST })
}

function item(f: Fixture, who: Member, itemId: string) {
  return who.as.query(AID.aidItem, { networkId: f.networkId, itemId })
}

async function question(f: Fixture, who: Member, questionId: Id<"aidQuestions">) {
  const found = await item(f, who, questionId)
  if (found?.kind !== "question") throw new Error("Question de fixture introuvable")
  return found.question
}

async function mission(f: Fixture, who: Member, missionId: Id<"aidMissions">) {
  const found = await item(f, who, missionId)
  if (found?.kind !== "mission") throw new Error("Mission de fixture introuvable")
  return found.mission
}

async function createMission(f: Fixture, change: Partial<typeof MISSION> = {}, pageId: Id<"pages"> = f.pageId, who: Member = f.admin) {
  return await who.as.mutation(AID.createMission, { networkId: f.networkId, pageId, ...MISSION, ...change })
}

function signUp(f: Fixture, who: Member, missionId: Id<"aidMissions">, shareNameWithTeam = true) {
  return who.as.mutation(AID.signUpForMission, { networkId: f.networkId, missionId, shareNameWithTeam })
}

/**
 * L'état de modération d'un contenu, posé directement (relecture préalable ou retrait) : l'état
 * écrit à la publication est réécrit, sans compteur ni avis (ceux du moteur sont éprouvés ailleurs).
 */
async function moderate(
  f: Fixture,
  targetKind: "diasporaAidQuestion" | "diasporaAidAnswer" | "diasporaAidMission",
  targetId: string,
  status: "pending_review" | "removed",
  owner: { ownerPersonId?: Id<"persons">; ownerPageId?: Id<"pages"> },
) {
  await f.t.run(async (ctx) => {
    const existing = await ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", targetKind).eq("targetId", targetId)).unique()
    if (existing) await ctx.db.patch(existing._id, { status, updatedAt: NOW })
    else await ctx.db.insert("moderationContentStates", { networkId: f.networkId, targetKind, targetId, ...owner, status, createdAt: NOW, updatedAt: NOW })
  })
}

describe("entraide — questions", () => {
  it("pose, liste par pays et par ville saisie, projection allowlistée sans identifiant de personne", async () => {
    const f = await fixture()
    const lyon = await ask(f, f.asker)
    vi.setSystemTime(NOW + 1000)
    const france = await ask(f, f.asker, { title: "Ouvrir un compte bancaire sans fiche de paie", theme: "procedures", city: "" })
    const belgium = await ask(f, f.helper, { title: "Abonnement de transport à Bruxelles", theme: "transport", country: "be", city: "Bruxelles" })
    expect(lyon.version).toBe(1)

    const all = await list(f, f.other)
    expect(all.page.map((row) => row.questionId)).toEqual([france.questionId, lyon.questionId])
    expect(Object.keys(all.page[1]!).sort()).toEqual(CARD_KEYS)
    expect(all.page[1]).toMatchObject({
      title: QUESTION.title, theme: "housing", country: "FR", city: "Lyon", status: "open", answerCount: 0, hasAcceptedAnswer: false,
      author: { displayName: "demandeuse", handle: "demandeuse" }, isMine: false, createdAt: NOW,
    })
    expect(all.page[0]).toMatchObject({ city: null, theme: "procedures" })
    // Aucune personne ne sort par identifiant : ni l'autrice, ni le lecteur.
    expect(JSON.stringify(all)).not.toContain(f.asker.personId)
    expect(JSON.stringify(all)).not.toContain(f.other.personId)

    // La ville saisie se replie ; une ville filtre, elle n'ouvre rien.
    expect((await list(f, f.other, { city: " LYON " })).page.map((row) => row.questionId)).toEqual([lyon.questionId])
    expect((await list(f, f.other, { city: "Marseille" })).page).toEqual([])
    expect((await list(f, f.other, { country: "BE" })).page.map((row) => row.questionId)).toEqual([belgium.questionId])
    expect((await list(f, f.other, { status: "resolved" })).page).toEqual([])
    expect((await list(f, f.asker)).page.every((row) => row.isMine)).toBe(true)

    const detail = await question(f, f.other, lyon.questionId)
    expect(detail).toMatchObject({ version: 1, editedAt: null, acceptedAnswer: null, canAnswer: true, canEdit: false, isMine: false })
    expect(await question(f, f.asker, lyon.questionId)).toMatchObject({ canEdit: true, isMine: true })
    expect(await item(f, f.other, "pas-un-identifiant")).toBeNull()

    const mine = await f.asker.as.query(AID.myQuestions, { networkId: f.networkId, paginationOpts: FIRST })
    expect(mine.page.map((row) => row.questionId)).toEqual([france.questionId, lyon.questionId])
    // Aucune cloche écrite par la tranche (rédacteur unique du moteur).
    expect(await f.t.run(async (ctx) => ctx.db.query("notifications").take(5))).toEqual([])
  })

  it("coordonnées, adresse exacte, Gabon : refus fermés du domaine ; rien n'est écrit", async () => {
    const f = await fixture()
    expect(await failure(ask(f, f.asker, { detail: "Appelez-moi au 06 12 34 56 78 pour en parler." }))).toEqual({ code: "invalidArgument", appRule: "aid_contact_forbidden" })
    expect(await failure(ask(f, f.asker, { detail: "Je loge au 12 rue des Lilas, qui connaît le quartier ?" }))).toEqual({ code: "invalidArgument", appRule: "aid_address_forbidden" })
    expect(await failure(ask(f, f.asker, { title: "Écrivez à moi@exemple.fr" }))).toEqual({ code: "invalidArgument", appRule: "aid_contact_forbidden" })
    expect(await failure(ask(f, f.asker, { country: "GA" }))).toEqual({ code: "invalidArgument", appRule: "aid_country_is_home" })
    expect(await failure(ask(f, f.asker, { title: "Aide" }))).toEqual({ code: "invalidArgument", appRule: "aid_title_too_short" })
    expect(await f.t.run(async (ctx) => ctx.db.query("aidQuestions").take(5))).toEqual([])

    const { questionId } = await ask(f, f.asker)
    expect(await failure(answer(f, f.helper, questionId, "Écris-moi sur www.exemple.org"))).toEqual({ code: "invalidArgument", appRule: "aid_contact_forbidden" })
    expect(await failure(answer(f, f.helper, questionId, " a "))).toEqual({ code: "invalidArgument", appRule: "aid_answer_too_short" })
    expect(await failure(f.asker.as.query(AID.listQuestions, { networkId: f.networkId, country: "GA", status: "open", paginationOpts: FIRST }))).toEqual({ code: "invalidArgument", appRule: "aid_country_is_home" })
    expect((await question(f, f.asker, questionId)).answerCount).toBe(0)
  })

  it("modifier sa question à la version lue ; un tiers ne modifie rien ; la ville vide s'efface", async () => {
    const f = await fixture()
    const { questionId } = await ask(f, f.asker)
    const edit = { networkId: f.networkId, questionId, title: "Trouver une colocation à Villeurbanne", detail: "", theme: "housing" as const, city: "" }
    expect(await refusal(f.helper.as.mutation(AID.updateQuestion, { ...edit, expectedVersion: 1 }))).toBe("aid_not_author")
    expect(await refusal(f.asker.as.mutation(AID.updateQuestion, { ...edit, expectedVersion: 0 }))).toBe("aid_version_conflict")
    expect(await f.asker.as.mutation(AID.updateQuestion, { ...edit, expectedVersion: 1 })).toEqual({ version: 2 })
    const stored = await f.t.run(async (ctx) => ctx.db.get(questionId))
    expect(stored).toMatchObject({ title: "Trouver une colocation à Villeurbanne", detail: "", country: "FR", version: 2, editedAt: NOW })
    expect(stored?.city).toBeUndefined()
    expect(stored?.cityKey).toBeUndefined()
    expect((await list(f, f.helper, { city: "Lyon" })).page).toEqual([])
    expect(await refusal(f.asker.as.mutation(AID.updateQuestion, { ...edit, detail: "Mon numéro : 07 11 22 33 44", expectedVersion: 2 }))).toBe("aid_contact_forbidden")
  })
})

describe("entraide — réponses et réponse retenue", () => {
  it("l'autrice retient UNE réponse, en change, la retire ; un tiers est refusé", async () => {
    const f = await fixture()
    const { questionId } = await ask(f, f.asker)
    const first = await answer(f, f.helper, questionId)
    vi.setSystemTime(NOW + 1000)
    const second = await answer(f, f.other, questionId, "Le CROUS ouvre ses demandes au printemps.")
    expect((await question(f, f.asker, questionId)).answerCount).toBe(2)

    // Retenir la réponse d'autrui sur la question d'autrui : refusé, même à la bonne version.
    expect(await failure(f.other.as.mutation(AID.acceptAnswer, { networkId: f.networkId, questionId, answerId: first.answerId, expectedVersion: 1 }))).toEqual({ code: "policyRefused", appRule: "aid_not_author" })
    expect(await failure(f.helper.as.mutation(AID.unacceptAnswer, { networkId: f.networkId, questionId, expectedVersion: 1 }))).toEqual({ code: "policyRefused", appRule: "aid_not_author" })

    expect(await f.asker.as.mutation(AID.acceptAnswer, { networkId: f.networkId, questionId, answerId: first.answerId, expectedVersion: 1 })).toEqual({ version: 2 })
    const resolved = await question(f, f.other, questionId)
    expect(resolved).toMatchObject({ status: "resolved", hasAcceptedAnswer: true, version: 2 })
    expect(resolved.acceptedAnswer).toMatchObject({ answerId: first.answerId, isAccepted: true, author: { displayName: "aidante", handle: "aidante" } })
    expect((await list(f, f.other, { status: "resolved" })).page.map((row) => row.questionId)).toEqual([questionId])
    expect((await list(f, f.other)).page).toEqual([])

    // Une seule réponse retenue : en retenir une autre la remplace ; rejouer la même ne change rien.
    expect(await refusal(f.asker.as.mutation(AID.acceptAnswer, { networkId: f.networkId, questionId, answerId: second.answerId, expectedVersion: 1 }))).toBe("aid_version_conflict")
    expect(await f.asker.as.mutation(AID.acceptAnswer, { networkId: f.networkId, questionId, answerId: second.answerId, expectedVersion: 2 })).toEqual({ version: 3 })
    expect(await f.asker.as.mutation(AID.acceptAnswer, { networkId: f.networkId, questionId, answerId: second.answerId, expectedVersion: 3 })).toEqual({ version: 3 })
    const answers = await f.other.as.query(AID.listAnswers, { networkId: f.networkId, questionId, paginationOpts: FIRST })
    expect(answers.page.map((row) => [row.answerId, row.isAccepted])).toEqual([[first.answerId, false], [second.answerId, true]])

    // Une réponse d'une autre question ne se retient pas ici.
    const elsewhere = await ask(f, f.other, { title: "Inscrire un enfant à l'école en cours d'année", theme: "schooling" })
    const foreign = await answer(f, f.helper, elsewhere.questionId)
    expect(await failure(f.asker.as.mutation(AID.acceptAnswer, { networkId: f.networkId, questionId, answerId: foreign.answerId, expectedVersion: 3 }))).toEqual({ code: "conflict", appRule: "aid_answer_unavailable" })

    // Révocable : ne plus retenir rouvre la question ; deux fois, c'est l'état qui refuse.
    expect(await f.asker.as.mutation(AID.unacceptAnswer, { networkId: f.networkId, questionId, expectedVersion: 3 })).toEqual({ version: 4 })
    expect(await question(f, f.helper, questionId)).toMatchObject({ status: "open", acceptedAnswer: null, hasAcceptedAnswer: false })
    expect(await refusal(f.asker.as.mutation(AID.unacceptAnswer, { networkId: f.networkId, questionId, expectedVersion: 4 }))).toBe("aid_question_not_resolved")
  })

  it("la réponse retenue ne se modifie plus ; retirée par son autrice, la question redevient ouverte", async () => {
    const f = await fixture()
    const { questionId } = await ask(f, f.asker)
    const kept = await answer(f, f.helper, questionId)
    const extra = await answer(f, f.helper, questionId, "Pense aussi aux résidences associatives.")
    await f.asker.as.mutation(AID.acceptAnswer, { networkId: f.networkId, questionId, answerId: kept.answerId, expectedVersion: 1 })

    expect(await refusal(f.helper.as.mutation(AID.updateAnswer, { networkId: f.networkId, answerId: kept.answerId, expectedVersion: 1, body: "Texte changé après coup." }))).toBe("aid_answer_locked")
    expect(await refusal(f.other.as.mutation(AID.updateAnswer, { networkId: f.networkId, answerId: extra.answerId, expectedVersion: 1, body: "Texte d'un tiers." }))).toBe("aid_not_author")
    expect(await f.helper.as.mutation(AID.updateAnswer, { networkId: f.networkId, answerId: extra.answerId, expectedVersion: 1, body: "Pense aussi aux foyers de jeunes travailleurs." })).toEqual({ version: 2 })
    expect(await refusal(f.helper.as.mutation(AID.updateAnswer, { networkId: f.networkId, answerId: extra.answerId, expectedVersion: 1, body: "Écrasement tardif." }))).toBe("aid_version_conflict")

    expect(await f.helper.as.mutation(AID.withdrawAnswer, { networkId: f.networkId, answerId: kept.answerId, expectedVersion: 1 })).toEqual({ version: 2 })
    const reopened = await question(f, f.asker, questionId)
    expect(reopened).toMatchObject({ status: "open", acceptedAnswer: null, answerCount: 1, version: 3 })
    expect((await f.asker.as.query(AID.listAnswers, { networkId: f.networkId, questionId, paginationOpts: FIRST })).page.map((row) => row.answerId)).toEqual([extra.answerId])
    expect(await refusal(f.helper.as.mutation(AID.withdrawAnswer, { networkId: f.networkId, answerId: kept.answerId, expectedVersion: 2 }))).toBe("aid_answer_withdrawn")
    expect(await refusal(f.asker.as.mutation(AID.acceptAnswer, { networkId: f.networkId, questionId, answerId: kept.answerId, expectedVersion: 3 }))).toBe("aid_answer_unavailable")
  })

  it("close : plus aucune réponse ; retirée : la question n'est plus servie à personne", async () => {
    const f = await fixture()
    const { questionId } = await ask(f, f.asker)
    const reply = await answer(f, f.helper, questionId)
    expect(await refusal(f.helper.as.mutation(AID.closeQuestion, { networkId: f.networkId, questionId, expectedVersion: 1 }))).toBe("aid_not_author")
    expect(await f.asker.as.mutation(AID.closeQuestion, { networkId: f.networkId, questionId, expectedVersion: 1 })).toEqual({ version: 2 })
    expect(await question(f, f.helper, questionId)).toMatchObject({ status: "closed", canAnswer: false })
    expect(await failure(answer(f, f.other, questionId))).toEqual({ code: "conflict", appRule: "aid_question_closed" })
    expect(await refusal(f.helper.as.mutation(AID.updateAnswer, { networkId: f.networkId, answerId: reply.answerId, expectedVersion: 1, body: "Ajout après la clôture." }))).toBe("aid_question_closed")
    expect((await list(f, f.helper, { status: "closed" })).page.map((row) => row.questionId)).toEqual([questionId])

    expect(await f.asker.as.mutation(AID.withdrawQuestion, { networkId: f.networkId, questionId, expectedVersion: 2 })).toEqual({ version: 3 })
    expect(await item(f, f.helper, questionId)).toBeNull()
    expect(await item(f, f.asker, questionId)).toBeNull()
    expect((await list(f, f.helper, { status: "closed" })).page).toEqual([])
    expect((await f.asker.as.query(AID.myQuestions, { networkId: f.networkId, paginationOpts: FIRST })).page).toEqual([])
    expect(await refusal(f.helper.as.query(AID.listAnswers, { networkId: f.networkId, questionId, paginationOpts: FIRST }))).toBe("notFound")
    expect(await refusal(answer(f, f.helper, questionId))).toBe("notFound")
  })

  it("un blocage, dans un sens ou dans l'autre, écarte l'autre personne de la lecture et des réponses", async () => {
    const f = await fixture()
    const { questionId } = await ask(f, f.asker)
    const reply = await answer(f, f.other, questionId)
    await f.t.run(async (ctx) => {
      await ctx.db.insert("personBlocks", { networkId: f.networkId, blockerPersonId: f.asker.personId, targetPersonId: f.helper.personId, createdAt: NOW, updatedAt: NOW })
    })
    expect((await list(f, f.helper)).page).toEqual([])
    expect(await item(f, f.helper, questionId)).toBeNull()
    expect(await refusal(answer(f, f.helper, questionId))).toBe("notFound")
    // L'autre membre, lui, lit la question et sa réponse.
    expect((await list(f, f.other)).page.map((row) => row.questionId)).toEqual([questionId])
    expect((await f.asker.as.query(AID.listAnswers, { networkId: f.networkId, questionId, paginationOpts: FIRST })).page.map((row) => row.answerId)).toEqual([reply.answerId])
  })
})

describe("entraide — gardes du réseau et du statut", () => {
  it("autre réseau, session absente : refus indistinct ou session requise", async () => {
    const f = await fixture()
    const { questionId } = await ask(f, f.asker)
    expect(await refusal(f.asker.as.query(AID.listQuestions, { networkId: f.root, country: "FR", status: "open", paginationOpts: FIRST }))).toBe("notFound")
    expect(await refusal(f.asker.as.query(AID.aidItem, { networkId: f.root, itemId: questionId }))).toBe("notFound")
    expect(["notFound", "statusInsufficient"]).toContain(await refusal(f.asker.as.mutation(AID.askQuestion, { networkId: f.root, ...QUESTION })))
    expect(await refusal(f.admin.as.query(AID.listMissions, { networkId: f.root, country: "FR", from: NOW, paginationOpts: FIRST }))).toBe("notFound")
    expect(await refusal(f.t.query(AID.listQuestions, { networkId: f.networkId, country: "FR", status: "open", paginationOpts: FIRST }))).toBe("unauthenticated")
    const outsider = f.t.withIdentity({ subject: "auth-exterieur" })
    await outsider.mutation(api.modules.people.persons.ensureMyPerson, {})
    expect(await refusal(outsider.query(AID.aidItem, { networkId: f.networkId, itemId: questionId }))).toBe("notFound")
  })

  it("en attente : lire oui ; poser, répondre, s'inscrire non ; retirer sa question reste possible", async () => {
    const f = await fixture()
    const { questionId } = await ask(f, f.asker)
    const { missionId } = await createMission(f)
    await setStatus(f.t, f.networkId, f.asker.personId, "en_attente")
    expect((await list(f, f.asker)).page.map((row) => row.questionId)).toEqual([questionId])
    expect(await question(f, f.asker, questionId)).toMatchObject({ canAnswer: false, canEdit: false })
    expect((await mission(f, f.asker, missionId)).signup).toEqual({ allowed: false, refusal: "status_insufficient" })
    expect(await refusal(ask(f, f.asker, { title: "Une seconde question en attente" }))).toBe("statusInsufficient")
    expect(await refusal(answer(f, f.asker, questionId))).toBe("statusInsufficient")
    expect(await refusal(signUp(f, f.asker, missionId))).toBe("statusInsufficient")
    expect(await f.asker.as.mutation(AID.withdrawQuestion, { networkId: f.networkId, questionId, expectedVersion: 1 })).toEqual({ version: 2 })

    await setStatus(f.t, f.networkId, f.other.personId, "suspendue")
    expect(await refusal(list(f, f.other))).toBe("membershipSuspended")
    expect(await refusal(signUp(f, f.other, missionId))).toBe("membershipSuspended")
  })
})

describe("entraide — missions bénévoles", () => {
  it("une association vivante propose ; entreprise, page retirée, invitation en attente ou non-signataire refusés", async () => {
    const f = await fixture()
    const created = await createMission(f)
    expect(created.version).toBe(1)
    expect(await mission(f, f.other, created.missionId)).toMatchObject({
      title: MISSION.title, city: "Lyon", area: "Près de la gare Part-Dieu", places: 3, signupCount: 0, status: "open", signedUp: false,
      cancelReason: null, canManage: false, signup: { allowed: true, refusal: null }, page: { handle: "collectif-entraide", ownerKind: "association", badge: "community" },
    })
    expect((await mission(f, f.admin, created.missionId)).canManage).toBe(true)

    const companyId = await page(f.t, f.networkId, "entreprise-entraide", { ownerKind: "company" })
    await grant(f.t, f.networkId, companyId, f.admin.personId, "admin")
    expect(await failure(createMission(f, {}, companyId))).toEqual({ code: "policyRefused", appRule: "aid_page_kind_not_allowed" })
    const closedId = await page(f.t, f.networkId, "asso-retiree", { status: "inactive" })
    await grant(f.t, f.networkId, closedId, f.admin.personId, "admin")
    expect(await refusal(createMission(f, {}, closedId))).toBe("notFound")
    expect(await refusal(createMission(f, {}, f.pageId, f.other))).toBe("notFound")
    await grant(f.t, f.networkId, f.pageId, f.helper.personId, "signatory", false)
    expect(await refusal(createMission(f, {}, f.pageId, f.helper))).toBe("notFound")

    // Les pages au nom desquelles proposer : l'association vivante seulement.
    expect(await f.admin.as.query(AID.missionPages, { networkId: f.networkId })).toEqual([
      { pageId: f.pageId, handle: "collectif-entraide", name: "Page collectif-entraide", country: null, city: null },
    ])
    expect(await f.helper.as.query(AID.missionPages, { networkId: f.networkId })).toEqual([])

    // Les règles du domaine : début passé, coordonnées, places.
    expect(await failure(createMission(f, { startsAt: NOW - HOUR, endsAt: NOW }))).toEqual({ code: "invalidArgument", appRule: "aid_mission_start_past" })
    expect(await failure(createMission(f, { description: "Contactez le responsable au 06 12 34 56 78." }))).toEqual({ code: "invalidArgument", appRule: "aid_contact_forbidden" })
    expect(await failure(createMission(f, { places: 0 }))).toEqual({ code: "invalidArgument", appRule: "aid_mission_places_invalid" })
    expect(await failure(createMission(f, { area: "Au 5 rue de la République" }))).toEqual({ code: "invalidArgument", appRule: "aid_address_forbidden" })
  })

  it("s'inscrire : consentement explicite, une seule fois, places relues ; complète puis rouverte au retrait", async () => {
    const f = await fixture()
    const { missionId } = await createMission(f, { places: 1 })
    expect(await failure(signUp(f, f.helper, missionId, false))).toEqual({ code: "invalidArgument", appRule: "aid_signup_consent_required" })
    expect(await signUp(f, f.helper, missionId)).toEqual({ status: "full", signupCount: 1 })
    expect(await failure(signUp(f, f.helper, missionId))).toEqual({ code: "conflict", appRule: "aid_signup_exists" })
    expect(await failure(signUp(f, f.other, missionId))).toEqual({ code: "conflict", appRule: "aid_mission_full" })
    expect(await mission(f, f.other, missionId)).toMatchObject({ status: "full", signupCount: 1, signup: { allowed: false, refusal: "aid_mission_full" } })
    expect(await mission(f, f.helper, missionId)).toMatchObject({ signedUp: true, signup: { allowed: false, refusal: "aid_signup_exists" } })
    // Une mission complète quitte la liste des missions à venir.
    expect((await f.other.as.query(AID.listMissions, { networkId: f.networkId, country: "FR", from: NOW, paginationOpts: FIRST })).page).toEqual([])

    const stored = await f.t.run(async (ctx) => ctx.db.query("aidMissionSignups").take(5))
    expect(stored).toEqual([expect.objectContaining({ personId: f.helper.personId, status: "confirmed", nameConsentAt: NOW, signedUpAt: NOW })])

    expect(await f.helper.as.mutation(AID.withdrawFromMission, { networkId: f.networkId, missionId })).toEqual({ status: "open", signupCount: 0 })
    expect(await failure(f.helper.as.mutation(AID.withdrawFromMission, { networkId: f.networkId, missionId }))).toEqual({ code: "conflict", appRule: "aid_signup_missing" })
    expect(await signUp(f, f.other, missionId)).toEqual({ status: "full", signupCount: 1 })
    const mine = await f.other.as.query(AID.mySignups, { networkId: f.networkId, paginationOpts: FIRST })
    expect(mine.page.map((row) => [row.missionId, row.signedUp])).toEqual([[missionId, true]])
    expect((await f.helper.as.query(AID.mySignups, { networkId: f.networkId, paginationOpts: FIRST })).page).toEqual([])
  })

  it("la liste des bénévoles : équipe vivante seulement, noms publiés avec consentement, aucune coordonnée", async () => {
    const f = await fixture()
    const { missionId } = await createMission(f)
    await signUp(f, f.helper, missionId)
    const volunteers = await f.admin.as.query(AID.missionVolunteers, { networkId: f.networkId, missionId, paginationOpts: FIRST })
    expect(volunteers.page).toEqual([{ signupId: expect.any(String), person: { displayName: "aidante", handle: "aidante" }, signedUpAt: NOW }])
    expect(JSON.stringify(volunteers)).not.toContain(f.helper.personId)

    await grant(f.t, f.networkId, f.pageId, f.other.personId, "signatory", false)
    for (const who of [f.helper, f.other, f.asker]) {
      expect(await refusal(who.as.query(AID.missionVolunteers, { networkId: f.networkId, missionId, paginationOpts: FIRST }))).toBe("notFound")
      expect(await refusal(who.as.query(AID.pageMissions, { networkId: f.networkId, pageId: f.pageId, paginationOpts: FIRST }))).toBe("notFound")
    }
    // Un rôle retiré coupe aussitôt la liste.
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("pageSignatories").withIndex("by_page_person", (q) => q.eq("pageId", f.pageId).eq("personId", f.admin.personId)).unique()
      if (row) await ctx.db.delete(row._id)
    })
    expect(await refusal(f.admin.as.query(AID.missionVolunteers, { networkId: f.networkId, missionId, paginationOpts: FIRST }))).toBe("notFound")
    expect((await mission(f, f.admin, missionId)).canManage).toBe(false)
  })

  it("modifier, clore, annuler : version lue, places jamais sous les inscrits, motif lu par les inscrits", async () => {
    const f = await fixture()
    const { missionId } = await createMission(f)
    await signUp(f, f.helper, missionId)
    await signUp(f, f.other, missionId)
    const edit = { networkId: f.networkId, missionId, ...MISSION }
    expect(await refusal(f.helper.as.mutation(AID.updateMission, { ...edit, expectedVersion: 1 }))).toBe("notFound")
    expect(await failure(f.admin.as.mutation(AID.updateMission, { ...edit, places: 1, expectedVersion: 1 }))).toEqual({ code: "conflict", appRule: "aid_mission_places_below_signups" })
    expect(await f.admin.as.mutation(AID.updateMission, { ...edit, places: 2, expectedVersion: 1 })).toEqual({ version: 2, status: "full" })
    expect(await refusal(f.admin.as.mutation(AID.updateMission, { ...edit, places: 5, expectedVersion: 1 }))).toBe("aid_version_conflict")
    // Sans lieu approximatif ni fin : les deux champs s'effacent (la mission est replanifiée, encore future).
    const { endsAt: _withoutEnd, ...open } = edit
    expect(await f.admin.as.mutation(AID.updateMission, { ...open, places: 5, area: "", expectedVersion: 2 })).toEqual({ version: 3, status: "open" })
    expect(await mission(f, f.other, missionId)).toMatchObject({ area: null, endsAt: null, places: 5, status: "open" })

    expect(await f.admin.as.mutation(AID.closeMission, { networkId: f.networkId, missionId, expectedVersion: 3 })).toEqual({ version: 4 })
    expect(await failure(signUp(f, f.asker, missionId))).toEqual({ code: "conflict", appRule: "aid_mission_closed" })
    expect(await refusal(f.admin.as.mutation(AID.updateMission, { ...edit, expectedVersion: 4 }))).toBe("aid_mission_closed")
    // Une mission close garde ses inscrits ; se retirer reste possible.
    expect(await f.other.as.mutation(AID.withdrawFromMission, { networkId: f.networkId, missionId })).toEqual({ status: "closed", signupCount: 1 })

    expect(await failure(f.admin.as.mutation(AID.cancelMission, { networkId: f.networkId, missionId, expectedVersion: 4, reason: "Appelez le 06 12 34 56 78" }))).toEqual({ code: "invalidArgument", appRule: "aid_contact_forbidden" })
    expect(await f.admin.as.mutation(AID.cancelMission, { networkId: f.networkId, missionId, expectedVersion: 4, reason: "  Salle indisponible  " })).toEqual({ version: 5 })
    expect(await mission(f, f.helper, missionId)).toMatchObject({ status: "cancelled", cancelReason: "Salle indisponible", signedUp: true, signup: { allowed: false, refusal: "aid_signup_exists" } })
    expect(await refusal(f.admin.as.mutation(AID.cancelMission, { networkId: f.networkId, missionId, expectedVersion: 5 }))).toBe("aid_mission_cancelled")

    const listed = await f.admin.as.query(AID.pageMissions, { networkId: f.networkId, pageId: f.pageId, paginationOpts: FIRST })
    expect(listed.page.map((row) => [row.missionId, row.status])).toEqual([[missionId, "cancelled"]])
  })

  it("une mission commencée ferme inscriptions et retraits et quitte la liste ; une page retirée l'emporte", async () => {
    const f = await fixture()
    const soon = await createMission(f)
    vi.setSystemTime(NOW + 1000)
    const later = await createMission(f, { title: "Préparer le repas de la soirée culturelle", startsAt: NOW + 3 * DAY, endsAt: NOW + 3 * DAY + HOUR, city: "Villeurbanne" })
    await signUp(f, f.helper, soon.missionId)
    const listed = await f.other.as.query(AID.listMissions, { networkId: f.networkId, country: "FR", from: NOW, paginationOpts: FIRST })
    expect(listed.page.map((row) => row.missionId)).toEqual([soon.missionId, later.missionId])
    expect((await f.other.as.query(AID.listMissions, { networkId: f.networkId, country: "FR", city: "villeurbanne", from: NOW, paginationOpts: FIRST })).page.map((row) => row.missionId)).toEqual([later.missionId])

    await f.t.run(async (ctx) => { await ctx.db.patch(soon.missionId, { startsAt: NOW - HOUR }) })
    expect(await failure(signUp(f, f.other, soon.missionId))).toEqual({ code: "conflict", appRule: "aid_mission_started" })
    expect(await failure(f.helper.as.mutation(AID.withdrawFromMission, { networkId: f.networkId, missionId: soon.missionId }))).toEqual({ code: "conflict", appRule: "aid_mission_started" })
    expect((await f.other.as.query(AID.listMissions, { networkId: f.networkId, country: "FR", from: NOW - DAY, paginationOpts: FIRST })).page.map((row) => row.missionId)).toEqual([later.missionId])

    await f.t.run(async (ctx) => { await ctx.db.patch(f.pageId, { status: "inactive" }) })
    expect(await item(f, f.other, later.missionId)).toBeNull()
    expect((await f.other.as.query(AID.listMissions, { networkId: f.networkId, country: "FR", from: NOW, paginationOpts: FIRST })).page).toEqual([])
    expect((await f.helper.as.query(AID.mySignups, { networkId: f.networkId, paginationOpts: FIRST })).page).toEqual([])
  })
})

describe("entraide — l'état de modération, dans les seules vues de gestion (G9)", () => {
  it("question : son autrice en lit l'état dans « Mes questions » et sa fiche ; un tiers et la liste publique, jamais", async () => {
    const f = await fixture()
    const { questionId } = await ask(f, f.asker)
    const mine = async () => (await f.asker.as.query(AID.myQuestions, { networkId: f.networkId, paginationOpts: FIRST })).page.map((row) => [row.questionId, row.moderation])

    // Publiée : « publiée » pour son autrice ; rien pour un tiers, rien dans la liste publique, même pour elle.
    expect(await mine()).toEqual([[questionId, "published"]])
    expect(await question(f, f.asker, questionId)).toMatchObject({ isMine: true, moderation: "published" })
    expect(await question(f, f.other, questionId)).toMatchObject({ isMine: false, moderation: null })
    expect((await list(f, f.asker)).page.map((row) => [row.questionId, row.moderation])).toEqual([[questionId, null]])
    expect((await list(f, f.other)).page.map((row) => [row.questionId, row.moderation])).toEqual([[questionId, null]])

    // En relecture préalable : servie à sa seule autrice, qui en lit l'état ; la liste publique ne le dit pas.
    await moderate(f, "diasporaAidQuestion", questionId, "pending_review", { ownerPersonId: f.asker.personId })
    expect(await mine()).toEqual([[questionId, "pending_review"]])
    expect(await question(f, f.asker, questionId)).toMatchObject({ moderation: "pending_review", canEdit: true })
    expect((await list(f, f.asker)).page.map((row) => [row.questionId, row.moderation])).toEqual([[questionId, null]])
    expect(await item(f, f.other, questionId)).toBeNull()

    // Retirée : l'autrice la garde, avec son état, sans modification ni réponse ; personne d'autre ne la lit.
    await moderate(f, "diasporaAidQuestion", questionId, "removed", { ownerPersonId: f.asker.personId })
    expect(await mine()).toEqual([[questionId, "removed"]])
    expect(await question(f, f.asker, questionId)).toMatchObject({ moderation: "removed", canEdit: false, canAnswer: false })
    expect((await list(f, f.asker)).page).toEqual([])
    expect(await item(f, f.other, questionId)).toBeNull()
  })

  it("réponse : son auteur en lit l'état dans la liste et comme réponse retenue ; l'autrice de la question et un tiers, jamais", async () => {
    const f = await fixture()
    const { questionId } = await ask(f, f.asker)
    const reviewed = await answer(f, f.helper, questionId)
    vi.setSystemTime(NOW + 1000)
    const plain = await answer(f, f.other, questionId, "Le CROUS ouvre ses demandes au printemps.")
    await moderate(f, "diasporaAidAnswer", reviewed.answerId, "pending_review", { ownerPersonId: f.helper.personId })
    const answers = async (who: Member) => (await who.as.query(AID.listAnswers, { networkId: f.networkId, questionId, paginationOpts: FIRST })).page.map((row) => [row.answerId, row.moderation])

    // En relecture : servie à son seul auteur, qui en lit l'état ; la réponse d'autrui ne lui en dit rien.
    expect(await answers(f.helper)).toEqual([[reviewed.answerId, "pending_review"], [plain.answerId, null]])
    expect(await answers(f.other)).toEqual([[plain.answerId, "published"]])
    expect(await answers(f.asker)).toEqual([[plain.answerId, null]])

    // Retenue, la réponse ne dit son état qu'à son auteur, sur la fiche de la question.
    await f.asker.as.mutation(AID.acceptAnswer, { networkId: f.networkId, questionId, answerId: plain.answerId, expectedVersion: 1 })
    expect((await question(f, f.other, questionId)).acceptedAnswer).toMatchObject({ answerId: plain.answerId, isMine: true, moderation: "published" })
    expect((await question(f, f.asker, questionId)).acceptedAnswer).toMatchObject({ answerId: plain.answerId, isMine: false, moderation: null })

    // Retirée par la modération, la réponse n'est plus servie à personne, pas même à son auteur.
    await moderate(f, "diasporaAidAnswer", reviewed.answerId, "removed", { ownerPersonId: f.helper.personId })
    expect(await answers(f.helper)).toEqual([[plain.answerId, null]])
  })

  it("mission : l'équipe vivante en lit l'état dans ses missions et leur fiche ; un bénévole, un tiers et la liste publique, jamais", async () => {
    const f = await fixture()
    const { missionId } = await createMission(f)
    await signUp(f, f.helper, missionId)
    const team = async () => (await f.admin.as.query(AID.pageMissions, { networkId: f.networkId, pageId: f.pageId, paginationOpts: FIRST })).page.map((row) => [row.missionId, row.moderation])
    const signups = async () => (await f.helper.as.query(AID.mySignups, { networkId: f.networkId, paginationOpts: FIRST })).page.map((row) => [row.missionId, row.moderation])

    // Publiée : « publiée » pour l'équipe ; rien pour le bénévole, rien pour un tiers ni dans la liste publique.
    expect(await team()).toEqual([[missionId, "published"]])
    expect(await mission(f, f.admin, missionId)).toMatchObject({ canManage: true, moderation: "published" })
    expect(await mission(f, f.other, missionId)).toMatchObject({ canManage: false, moderation: null })
    expect(await mission(f, f.helper, missionId)).toMatchObject({ signedUp: true, moderation: null })
    expect(await signups()).toEqual([[missionId, null]])
    const upcoming = await f.other.as.query(AID.listMissions, { networkId: f.networkId, country: "FR", from: NOW, paginationOpts: FIRST })
    expect(upcoming.page.map((row) => [row.missionId, row.moderation])).toEqual([[missionId, null]])

    // En relecture, puis retirée : contenu de la PAGE, servi à sa seule équipe, qui en lit l'état.
    await moderate(f, "diasporaAidMission", missionId, "pending_review", { ownerPageId: f.pageId })
    expect(await team()).toEqual([[missionId, "pending_review"]])
    expect(await mission(f, f.admin, missionId)).toMatchObject({ moderation: "pending_review" })
    expect(await item(f, f.other, missionId)).toBeNull()
    await moderate(f, "diasporaAidMission", missionId, "removed", { ownerPageId: f.pageId })
    expect(await team()).toEqual([[missionId, "removed"]])
    expect(await mission(f, f.admin, missionId)).toMatchObject({ canManage: true, moderation: "removed" })
    expect(await item(f, f.helper, missionId)).toBeNull()
    expect(await signups()).toEqual([])
  })
})

describe("entraide — listes bornées", () => {
  it("pagine de façon stable, cinquante lignes au plus, sans doublon ni question d'un autre réseau", async () => {
    const f = await fixture()
    const created: Id<"aidQuestions">[] = []
    for (let index = 0; index < 25; index += 1) {
      created.push(await f.t.run(async (ctx) => ctx.db.insert("aidQuestions", {
        networkId: f.networkId, authorPersonId: f.asker.personId, title: `Question fictive ${index}`, detail: "", theme: "daily_life", country: "FR",
        status: "open", answerCount: 0, version: 1, createdAt: NOW + index, updatedAt: NOW + index,
      })))
    }
    await f.t.run(async (ctx) => ctx.db.insert("aidQuestions", {
      networkId: f.root, authorPersonId: f.asker.personId, title: "Question d'un autre réseau", detail: "", theme: "daily_life", country: "FR",
      status: "open", answerCount: 0, version: 1, createdAt: NOW, updatedAt: NOW,
    }))
    const seen: string[] = []
    let cursor: string | null = null
    let pages = 0
    do {
      const result: { page: { questionId: string }[]; isDone: boolean; continueCursor: string } = await f.other.as.query(AID.listQuestions, { networkId: f.networkId, country: "FR", status: "open", paginationOpts: { numItems: 10, cursor } })
      seen.push(...result.page.map((row) => row.questionId))
      cursor = result.isDone ? null : result.continueCursor
      pages += 1
    } while (cursor !== null && pages < 10)
    expect(seen).toEqual([...created].reverse())
    expect((await f.other.as.query(AID.listQuestions, { networkId: f.networkId, country: "FR", status: "open", paginationOpts: { numItems: 500, cursor: null } })).page).toHaveLength(25)
    expect((await f.other.as.query(AID.listQuestions, { networkId: f.networkId, country: "FR", status: "open", paginationOpts: { numItems: 0, cursor: null } })).page).toHaveLength(1)
  })
})

describe("entraide — retrouver une question : thème, mots, sans réponse (ET-04)", () => {
  function find(f: Fixture, who: Member, args: { theme?: string; query?: string; unanswered?: boolean; city?: string; status?: "open" | "resolved" | "closed" }) {
    return who.as.query(AID.listQuestions, {
      networkId: f.networkId,
      country: "FR",
      status: args.status ?? "open",
      ...(args.city !== undefined ? { city: args.city } : {}),
      ...(args.theme !== undefined ? { theme: args.theme } : {}),
      ...(args.query !== undefined ? { query: args.query } : {}),
      ...(args.unanswered !== undefined ? { unanswered: args.unanswered } : {}),
      paginationOpts: FIRST,
    })
  }
  const ids = (result: { page: { questionId: string }[] }) => result.page.map((row) => row.questionId)

  it("un thème, « sans réponse » et des mots restreignent ; la question écrite porte son texte cherché, sans auteur ni coordonnée", async () => {
    const f = await fixture()
    const housing = await ask(f, f.asker)
    const papers = await ask(f, f.asker, { title: "Renouveler un titre de séjour étudiant", detail: "Quelles pièces apporter à la préfecture ?", theme: "procedures", city: "Paris" })
    const health = await ask(f, f.other, { title: "Trouver un médecin traitant", detail: "", theme: "health" })
    await answer(f, f.helper, health.questionId)

    expect(ids(await find(f, f.helper, { theme: "procedures" }))).toEqual([papers.questionId])
    expect(ids(await find(f, f.helper, { theme: "procedures", city: "Lyon" }))).toEqual([])
    // Sans réponse : la question de santé a reçu une réponse publiée, elle sort de la vue.
    expect(ids(await find(f, f.helper, { unanswered: true }))).toEqual([papers.questionId, housing.questionId])
    expect(ids(await find(f, f.helper, { unanswered: true, city: "Paris" }))).toEqual([papers.questionId])
    // Les mots sont repliés des deux côtés : sans accents, la ponctuation compte pour une espace.
    expect(ids(await find(f, f.helper, { query: "Préfecture" }))).toEqual([papers.questionId])
    expect(ids(await find(f, f.helper, { query: "sejour", theme: "housing" }))).toEqual([])
    expect(ids(await find(f, f.helper, { query: "colocation", city: "Paris" }))).toEqual([])
    expect(ids(await find(f, f.helper, { query: "medecin", unanswered: true }))).toEqual([])
    // Un caractère : aucune recherche, la liste reste celle des filtres.
    expect(ids(await find(f, f.helper, { query: "a" }))).toEqual([health.questionId, papers.questionId, housing.questionId])

    const stored = await f.t.run(async (ctx) => ctx.db.get(papers.questionId))
    expect(stored?.searchText).toBe("renouveler un titre de sejour etudiant quelles pieces apporter a la prefecture")
    await f.asker.as.mutation(AID.updateQuestion, { networkId: f.networkId, questionId: papers.questionId, expectedVersion: 1, title: "Renouveler une carte de résident", detail: "", theme: "procedures" })
    expect(ids(await find(f, f.helper, { query: "prefecture" }))).toEqual([])
    expect(ids(await find(f, f.helper, { query: "resident" }))).toEqual([papers.questionId])
  })

  it("un auteur bloqué et une question en relecture restent absents des résultats ; thème inconnu et texte trop long refusés", async () => {
    const f = await fixture()
    const blocked = await ask(f, f.helper, { title: "Colocation près de la gare", detail: "" })
    const reviewed = await ask(f, f.other, { title: "Colocation à partager en janvier", detail: "" })
    const plain = await ask(f, f.asker)
    await f.t.run(async (ctx) => {
      await ctx.db.insert("personBlocks", { networkId: f.networkId, blockerPersonId: f.asker.personId, targetPersonId: f.helper.personId, createdAt: NOW, updatedAt: NOW })
    })
    await moderate(f, "diasporaAidQuestion", reviewed.questionId, "pending_review", { ownerPersonId: f.other.personId })

    expect(ids(await find(f, f.asker, { query: "colocation" }))).toEqual([plain.questionId])
    expect(ids(await find(f, f.asker, { theme: "housing" }))).toEqual([plain.questionId])
    expect(ids(await find(f, f.asker, { unanswered: true }))).toEqual([plain.questionId])
    // Un tiers qui n'a rien bloqué lit les deux questions publiées, jamais celle en relecture ; son autrice, seule, la retrouve.
    expect(ids(await find(f, f.admin, { query: "colocation" })).sort()).toEqual([blocked.questionId, plain.questionId].sort())
    expect(ids(await find(f, f.other, { query: "colocation" })).sort()).toEqual([blocked.questionId, reviewed.questionId, plain.questionId].sort())

    expect(await refusal(find(f, f.asker, { theme: "sports" }))).toBe("aid_theme_invalid")
    expect(await refusal(find(f, f.asker, { query: "x".repeat(101) }))).toBe("aid_query_too_long")
  })
})

describe("entraide — les prochaines missions sur la fiche d'une association (ET-09)", () => {
  const upcoming = (f: Fixture, who: Member, pageId: Id<"pages"> = f.pageId, limit?: number) =>
    who.as.query(AID.upcomingPageMissions, { networkId: f.networkId, pageId, ...(limit !== undefined ? { limit } : {}) })

  it("ouvertes et à venir seulement, des plus proches aux plus lointaines ; en relecture, annulée ou passée : absente", async () => {
    const f = await fixture()
    const later = await createMission(f, { title: "Collecte de fournitures scolaires", startsAt: NOW + 5 * DAY, endsAt: NOW + 5 * DAY + 2 * HOUR })
    const soon = await createMission(f)
    const reviewed = await createMission(f, { title: "Atelier de rédaction de CV", startsAt: NOW + 3 * DAY, endsAt: NOW + 3 * DAY + HOUR })
    const cancelled = await createMission(f, { title: "Visite du quartier pour les nouveaux", startsAt: NOW + 4 * DAY, endsAt: NOW + 4 * DAY + HOUR })
    const past = await createMission(f, { title: "Permanence d'accueil du samedi", startsAt: NOW + 6 * DAY, endsAt: NOW + 6 * DAY + HOUR })
    await moderate(f, "diasporaAidMission", reviewed.missionId, "pending_review", { ownerPageId: f.pageId })
    await f.admin.as.mutation(AID.cancelMission, { networkId: f.networkId, missionId: cancelled.missionId, expectedVersion: 1, reason: "" })
    await f.t.run(async (ctx) => { await ctx.db.patch(past.missionId, { startsAt: NOW - HOUR, endsAt: undefined }) })
    await signUp(f, f.helper, soon.missionId)

    expect((await upcoming(f, f.helper)).map((card) => [card.missionId, card.signedUp, card.moderation])).toEqual([[soon.missionId, true, null], [later.missionId, false, null]])
    // L'équipe ne lit pas non plus la mission en relecture ici : elle la garde dans sa gestion.
    expect((await upcoming(f, f.admin)).map((card) => card.missionId)).toEqual([soon.missionId, later.missionId])
    expect((await upcoming(f, f.other, f.pageId, 1)).map((card) => card.missionId)).toEqual([soon.missionId])
  })

  it("une page qui n'est pas une association, d'un autre réseau ou retirée : refus indistinct ; une page sans mission : liste vide", async () => {
    const f = await fixture()
    const company = await page(f.t, f.networkId, "entreprise-locale", { ownerKind: "company" })
    const removed = await page(f.t, f.networkId, "association-retiree", { status: "inactive" })
    const elsewhere = await page(f.t, f.root, "association-ailleurs")
    expect(await upcoming(f, f.other)).toEqual([])
    expect(await refusal(upcoming(f, f.other, company))).toBe("notFound")
    expect(await refusal(upcoming(f, f.other, removed))).toBe("notFound")
    expect(await refusal(upcoming(f, f.other, elsewhere))).toBe("notFound")
  })
})
