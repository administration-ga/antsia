// @vitest-environment edge-runtime
/**
 * Confiance de la vague H DIASPORA.GA (G9) : signaler, retirer, rétablir et ranger
 * par pays les contenus de l'entraide, du mentorat, du kit d'arrivée et de
 * l'emploi, par la porte UNIQUE de modération du moteur (`moderation/cases`,
 * `moderation/reviewProjection`, guichet `moderationDesk`), avec de vraies
 * sessions (`testConvex`) et le vrai limiteur de débit (cinq signalements au plus
 * par personne et par test : chaque scénario répartit ses déclarants).
 *
 * Exigences couvertes : chaque nature signalée par un lecteur autorisé et refusée
 * à un tiers sans accès ; retrait puis invisibilité dans les listes ;
 * rétablissement ; signalement de son propre contenu refusé ; candidature
 * signalable par l'équipe VIVANTE seulement ; politique de relecture préalable
 * (aucune mise en attente implicite) ; aperçu borné ; pays du guichet.
 * Les crochets d'effacement sont éprouvés par `contentCounters.test.ts`.
 * Données de fixture fictives.
 */
import { engineErrorAppRule, engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { openNetworkFeatures, testConvex } from "../../test.setup"
import { removeTarget, restoreTarget } from "../moderation/targets"
import { APPLICATION_MESSAGE_EXCERPT, MENTORING_GOAL_EXCERPT } from "./moderationTargets"

type T = ReturnType<typeof testConvex>
type Member = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }
type Target = Doc<"reports">["target"]
type Role = Doc<"networkMemberships">["role"]

const NOW = Date.UTC(2026, 9, 19, 10)
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const AID = api.modules.diaspora.mutualAid
const M = api.modules.diaspora.mentoring
const K = api.modules.diaspora.arrivalKit
const J = api.modules.diaspora.jobs
const D = api.modules.diaspora.moderationDesk
const CASES = api.modules.moderation.cases
const PREVIEW = api.modules.moderation.reviewProjection.preview
const FIRST = { numItems: 20, cursor: null }
const ALL = { kind: "all" as const }

const QUESTION = {
  title: "Trouver une colocation à Lyon avant janvier",
  detail: "J'arrive en janvier pour mes études. Quels quartiers conseillez-vous ?",
  theme: "housing" as const,
  country: "FR",
  city: "Lyon",
}
const ANSWER = "La métropole publie une liste de foyers étudiants."
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
const PRESENTATION = "Arrivée à Paris en 2015, j'aide les nouveaux venus à trouver un logement et à faire leurs démarches."
const REQUEST_MESSAGE = "Je viens d'arriver à Paris pour mes études et je cherche des conseils pour le logement."
/** Un objectif plus long que l'extrait de l'aperçu (97 signes, sous le plafond de 120). */
const LONG_GOAL = "Trouver un logement étudiant près de la faculté de Lyon avant la rentrée universitaire de janvier"
const KEY = "2b4a7a0e-6a52-4c8e-9a52-7f1f0b6c2d11"
const OFFER = {
  title: "Cuisinier ou cuisinière en traiteur",
  description: "Préparer les plats du pays pour les commandes de la semaine, en équipe de trois.",
  contract: "cdi" as const,
  country: "BE",
  city: "Bruxelles",
  workMode: "onsite" as const,
  languages: ["fr" as const],
  payRange: null,
  closesAt: null,
}
const APPLICATION_MESSAGE = "Bonjour, cinq ans de cuisine collective et l'envie de rejoindre votre équipe."
/** Un message plus long que l'extrait de l'aperçu (plus de 500 signes, sous le plafond de 3 000). */
const LONG_MESSAGE = Array.from({ length: 8 }, () => APPLICATION_MESSAGE).join(" ")
const TALENT = {
  expectedVersion: null,
  title: "Comptable bilingue",
  skills: ["Comptabilité", "Paie"],
  availability: "one_month" as const,
  languages: ["fr" as const, "en" as const],
  country: "FR",
  visibility: "network" as const,
}

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

/** Un membre DÉCLARÉ de DIASPORA.GA (IDN de garantie 2 : seaux ordinaires), au profil publié, résidant en France. */
async function member(t: T, networkId: Id<"networks">, handle: string, role?: Role): Promise<Member> {
  const as = t.withIdentity({ subject: `g9-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await t.run(async (ctx) => {
    await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `idn-${personId}`, loa: 2, nationality: "GA", linkedAt: NOW })
  })
  await as.mutation(api.modules.diaspora.membership.joinDiasporaGa, { networkId, facet: { countryOfResidence: "FR", city: "Lyon" } })
  if (role) {
    await t.run(async (ctx) => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique()
      if (!row) throw new Error("Adhésion de fixture absente")
      await ctx.db.patch(row._id, { role })
    })
  }
  return { as, personId, handle }
}

async function page(t: T, networkId: Id<"networks">, handle: string, ownerKind: Doc<"pages">["ownerKind"], country: string): Promise<Id<"pages">> {
  return await t.run(async (ctx) => ctx.db.insert("pages", {
    networkId, handle, name: `Page ${handle}`, ownerKind, trust: "community", trustRank: 0, country,
    visibility: "network", onRoot: false, status: "active", searchText: handle, createdAt: NOW, updatedAt: NOW,
  }))
}

async function sign(t: T, networkId: Id<"networks">, pageId: Id<"pages">, personId: Id<"persons">, accepted = true): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("pageSignatories", { networkId, pageId, personId, role: "admin", ...(accepted ? { acceptedAt: NOW } : {}), createdAt: NOW, updatedAt: NOW })
  })
}

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  await openNetworkFeatures(t, networkId)
  const author = await member(t, networkId, "autrice.g9")
  const reader = await member(t, networkId, "lectrice.g9")
  const stranger = await member(t, networkId, "tiers.g9")
  const team = await member(t, networkId, "equipe.g9")
  const moderator = await member(t, networkId, "moderatrice.g9", "network_moderator")
  const admin = await member(t, networkId, "admin.g9", "network_admin")
  const association = await page(t, networkId, "asso-g9", "association", "FR")
  const company = await page(t, networkId, "entreprise-g9", "company", "BE")
  await sign(t, networkId, association, team.personId)
  await sign(t, networkId, company, team.personId)
  return { t, root, networkId, author, reader, stranger, team, moderator, admin, association, company }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

/** Le code fermé d'un refus : celui de la tranche s'il existe, sinon celui du moteur ; `null` sans refus. */
async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try { await promise } catch (error) { return engineErrorAppRule(error)?.appRule ?? engineErrorCode(error) }
  return null
}

function report(f: Fixture, who: Member, target: Target, networkId: Id<"networks"> = f.networkId) {
  return who.as.mutation(CASES.report, { networkId, target, reason: "harassment" })
}

/** Retrait motivé par la mutation EXISTANTE du moteur (aucune sanction : le contenu seul est retiré). */
function decideRemoval(f: Fixture, reportId: Id<"reports">, decider: Member = f.moderator) {
  return decider.as.mutation(CASES.decide, { networkId: f.networkId, reportId, decision: "actioned", reason: "Retrait après examen contradictoire.", sanctions: [] })
}

async function reportRow(f: Fixture, reportId: Id<"reports">) {
  return await f.t.run(async (ctx) => ctx.db.get(reportId))
}

async function stateOf(f: Fixture, kind: Target["kind"], id: string) {
  return await f.t.run(async (ctx) => ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", kind).eq("targetId", id)).unique())
}

async function setMembership(f: Fixture, who: Member, patch: { status?: "en_attente"; role?: Role }) {
  await f.t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.networkId).eq("personId", who.personId)).unique()
    if (!row) throw new Error("Adhésion de fixture absente")
    await ctx.db.patch(row._id, patch)
  })
}

async function ask(f: Fixture, change: Partial<typeof QUESTION> = {}) {
  return await f.author.as.mutation(AID.askQuestion, { networkId: f.networkId, ...QUESTION, ...change })
}

function listQuestions(f: Fixture, who: Member) {
  return who.as.query(AID.listQuestions, { networkId: f.networkId, country: "FR", status: "open", paginationOpts: FIRST })
}

function listAnswers(f: Fixture, who: Member, questionId: Id<"aidQuestions">) {
  return who.as.query(AID.listAnswers, { networkId: f.networkId, questionId, paginationOpts: FIRST })
}

function mentorArgs(networkId: Id<"networks">) {
  return {
    networkId, domains: ["housing", "admin"], presentation: PRESENTATION, languages: ["fr", "en"], country: "FR",
    city: "Paris 11e", availability: "Le soir en semaine", maxActiveMentees: 2, consent: true,
  }
}

function requestArgs(networkId: Id<"networks">, mentorId: Id<"mentorProfiles">, goal = "Trouver un logement étudiant") {
  return {
    networkId, mentorId, domain: "housing", goal, message: REQUEST_MESSAGE, wishedSlots: [{ startAt: NOW + DAY, endAt: NOW + DAY + HOUR }],
    timeZone: "Europe/Paris", shareWithMentor: true, idempotencyKey: KEY,
  }
}

function offerArgs(f: Fixture, change: Partial<typeof OFFER> = {}, publish = true) {
  return { networkId: f.networkId, pageId: f.company, ...OFFER, ...change, publish }
}

function applyArgs(f: Fixture, jobId: Id<"jobOffers">, change: { message?: string; shareTalentProfile?: boolean; idempotencyKey?: string } = {}) {
  return {
    networkId: f.networkId, jobId, offerVersion: 1, message: change.message ?? APPLICATION_MESSAGE, shareName: true,
    shareTalentProfile: change.shareTalentProfile ?? false, idempotencyKey: change.idempotencyKey ?? "candidature-g9-0001",
  }
}

/** Une ressource du kit PUBLIC posée directement : personnelle (autrice) par défaut, ou portée par une page. */
async function kitResource(f: Fixture, options: { pageId?: Id<"pages">; status?: "draft" | "published"; country?: string } = {}): Promise<Id<"kitResources">> {
  const status = options.status ?? "published"
  return await f.t.run(async (ctx) => ctx.db.insert("kitResources", {
    networkId: f.networkId,
    ...(options.pageId ? { pageId: options.pageId } : { authorPersonId: f.author.personId }),
    proposedByPersonId: options.pageId ? f.team.personId : f.author.personId,
    revisedByPersonId: options.pageId ? f.team.personId : f.author.personId,
    title: "Ouvrir un compte bancaire à Paris",
    summary: "Les pièces demandées et les délais habituels pour un premier compte.",
    body: "Prenez rendez-vous en agence avec une pièce d'identité et un justificatif de domicile.",
    category: "banking",
    country: options.country ?? "FR",
    cityKey: "",
    sourceName: "Portail public fictif",
    sourceUrl: "https://www.exemple-public.fr/",
    lastVerifiedAt: NOW - 2 * DAY,
    status,
    listed: status === "published",
    revision: 1,
    version: 1,
    outdatedFlags: 0,
    revisedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  }))
}

// ═══════════════════════════════════════════════════════════════
// Signaler : l'audience réelle, le propriétaire, les refus
// ═══════════════════════════════════════════════════════════════

describe("signaler — chaque nature par qui la lit, jamais son propre contenu", () => {
  it("entraide : question, réponse et mission ; l'autrice, l'auteur de la réponse et l'équipe sont refusés, un tiers bloqué et un autre réseau aussi", async () => {
    const f = await fixture()
    const { questionId } = await ask(f)
    const { answerId } = await f.reader.as.mutation(AID.answerQuestion, { networkId: f.networkId, questionId, body: ANSWER })
    const { missionId } = await f.team.as.mutation(AID.createMission, { networkId: f.networkId, pageId: f.association, ...MISSION })
    const question = { kind: "diasporaAidQuestion" as const, id: questionId }
    const answer = { kind: "diasporaAidAnswer" as const, id: answerId }
    const mission = { kind: "diasporaAidMission" as const, id: missionId }

    // Son propre contenu : refus indistinct (le moteur pour une personne, la tranche pour l'équipe d'une page).
    expect(await codeOf(report(f, f.author, question))).toBe("notFound")
    expect(await codeOf(report(f, f.reader, answer))).toBe("notFound")
    expect(await codeOf(report(f, f.team, mission))).toBe("notFound")

    // Lecteurs autorisés : le dossier porte le réseau, la cible et son propriétaire (personne, ou page sans personne).
    const onQuestion = await report(f, f.reader, question)
    expect(onQuestion).toMatchObject({ created: true, hidden: true })
    expect(await reportRow(f, onQuestion.reportId)).toMatchObject({
      networkId: f.networkId, target: question, targetKind: "diasporaAidQuestion", targetId: questionId,
      ownerPersonId: f.author.personId, reporterPersonId: f.reader.personId, status: "open", level: "network",
    })
    const onAnswer = await report(f, f.author, answer)
    expect(await reportRow(f, onAnswer.reportId)).toMatchObject({ target: answer, ownerPersonId: f.reader.personId })
    const onMission = await report(f, f.stranger, mission)
    const missionRow = await reportRow(f, onMission.reportId)
    expect(missionRow).toMatchObject({ target: mission, targetKind: "diasporaAidMission", status: "open" })
    expect(missionRow?.ownerPersonId).toBeUndefined()
    // Un second signalement se dédoublonne ; signaler, c'est aussi ne plus voir.
    expect(await report(f, f.reader, question)).toMatchObject({ reportId: onQuestion.reportId, created: false })
    expect((await listQuestions(f, f.reader)).page).toEqual([])
    expect((await listQuestions(f, f.stranger)).page.map((row) => row.questionId)).toEqual([questionId])

    // Un tiers écarté par l'autrice (blocage) ne lit pas la question : refus indistinct.
    await f.t.run(async (ctx) => {
      await ctx.db.insert("personBlocks", { networkId: f.networkId, blockerPersonId: f.author.personId, targetPersonId: f.stranger.personId, createdAt: NOW, updatedAt: NOW })
    })
    expect(await codeOf(report(f, f.stranger, question))).toBe("notFound")
    // Depuis un autre réseau (la racine), aucune cible de la vague H ne se résout.
    expect(await codeOf(report(f, f.admin, mission, f.root))).toBe("notFound")
    expect(await f.t.run(async (ctx) => ctx.db.query("reports").take(10))).toHaveLength(3)
  })

  it("mentorat : le profil par qui le trouve ; la demande par son MENTOR seul ; un profil en pause ne se signale plus", async () => {
    const f = await fixture()
    const { mentorId } = await f.author.as.mutation(M.becomeMentor, mentorArgs(f.networkId))
    const { requestId } = await f.reader.as.mutation(M.requestMentoring, requestArgs(f.networkId, mentorId))
    const profile = { kind: "diasporaMentorProfile" as const, id: mentorId }
    const request = { kind: "diasporaMentoringRequest" as const, id: requestId }

    expect(await codeOf(report(f, f.author, profile))).toBe("notFound")
    // Le mentoré est le propriétaire de sa demande ; un tiers ne la lit pas.
    expect(await codeOf(report(f, f.reader, request))).toBe("notFound")
    expect(await codeOf(report(f, f.stranger, request))).toBe("notFound")

    const onProfile = await report(f, f.stranger, profile)
    expect(await reportRow(f, onProfile.reportId)).toMatchObject({ target: profile, ownerPersonId: f.author.personId })
    expect((await f.stranger.as.query(M.searchMentors, { networkId: f.networkId, country: "FR", paginationOpts: FIRST })).page).toEqual([])
    expect((await f.reader.as.query(M.searchMentors, { networkId: f.networkId, country: "FR", paginationOpts: FIRST })).page.map((row) => row.mentorId)).toEqual([mentorId])
    const onRequest = await report(f, f.author, request)
    expect(await reportRow(f, onRequest.reportId)).toMatchObject({ target: request, ownerPersonId: f.reader.personId })
    // Signalée par le mentor : elle quitte SA boîte, pas la vue du mentoré.
    expect((await f.author.as.query(M.mentorMentoringRequests, { networkId: f.networkId, paginationOpts: FIRST })).page).toEqual([])
    expect((await f.reader.as.query(M.menteeMentoringRequests, { networkId: f.networkId, paginationOpts: FIRST })).page.map((row) => row.requestId)).toEqual([requestId])

    // En pause, le profil ne se lit plus par un tiers : il ne se signale plus.
    await f.author.as.mutation(M.setMentorState, { networkId: f.networkId, expectedVersion: 1, state: "paused" })
    expect(await codeOf(report(f, f.moderator, profile))).toBe("notFound")
  })

  it("kit d'arrivée : une ressource du kit public ; un brouillon non ; l'autrice et l'équipe de la page porteuse non plus", async () => {
    const f = await fixture()
    const personal = await kitResource(f)
    const carried = await kitResource(f, { pageId: f.association })
    const draft = await kitResource(f, { status: "draft" })

    expect(await codeOf(report(f, f.author, { kind: "diasporaKitResource", id: personal }))).toBe("notFound")
    expect(await codeOf(report(f, f.team, { kind: "diasporaKitResource", id: carried }))).toBe("notFound")
    expect(await codeOf(report(f, f.stranger, { kind: "diasporaKitResource", id: draft }))).toBe("notFound")

    const onPersonal = await report(f, f.reader, { kind: "diasporaKitResource", id: personal })
    expect(await reportRow(f, onPersonal.reportId)).toMatchObject({ ownerPersonId: f.author.personId })
    const onCarried = await report(f, f.reader, { kind: "diasporaKitResource", id: carried })
    expect((await reportRow(f, onCarried.reportId))?.ownerPersonId).toBeUndefined()
    // Le déclarant ne les lit plus ; les autres membres, toujours.
    expect((await f.reader.as.query(K.listResources, { networkId: f.networkId, country: "FR", paginationOpts: FIRST })).page).toEqual([])
    expect((await f.stranger.as.query(K.listResources, { networkId: f.networkId, country: "FR", paginationOpts: FIRST })).page.map((row) => row.resourceId).sort())
      .toEqual([personal, carried].sort())
  })

  it("emploi : l'offre ouverte ; le profil de talent pour qui voit l'annuaire ; la candidature par l'équipe VIVANTE seule", async () => {
    const f = await fixture()
    const { jobId } = await f.team.as.mutation(J.createJobOffer, offerArgs(f))
    const { jobId: draftId } = await f.team.as.mutation(J.createJobOffer, offerArgs(f, { title: "Commis de cuisine en extra" }, false))
    const { talentId } = await f.author.as.mutation(J.saveMyTalentProfile, { networkId: f.networkId, ...TALENT })
    const { applicationId } = await f.author.as.mutation(J.applyToJobOffer, applyArgs(f, jobId, { shareTalentProfile: true }))
    const offer = { kind: "diasporaJobOffer" as const, id: jobId }
    const talent = { kind: "diasporaTalentProfile" as const, id: talentId }
    const application = { kind: "diasporaJobApplication" as const, id: applicationId }

    // Son propre contenu : l'équipe pour l'offre de sa page, la personne pour son profil et sa candidature.
    expect(await codeOf(report(f, f.team, offer))).toBe("notFound")
    expect(await codeOf(report(f, f.author, talent))).toBe("notFound")
    expect(await codeOf(report(f, f.author, application))).toBe("notFound")
    // Hors audience : un brouillon ; une candidature pour un membre hors de l'équipe ou une invitation non acceptée ;
    // un talent pour un membre redevenu « en attente » (sans droit de voir l'annuaire).
    expect(await codeOf(report(f, f.reader, { kind: "diasporaJobOffer", id: draftId }))).toBe("notFound")
    expect(await codeOf(report(f, f.reader, application))).toBe("notFound")
    await sign(f.t, f.networkId, f.company, f.stranger.personId, false)
    expect(await codeOf(report(f, f.stranger, application))).toBe("notFound")
    await setMembership(f, f.stranger, { status: "en_attente" })
    expect(await codeOf(report(f, f.stranger, talent))).toBe("notFound")

    const onOffer = await report(f, f.reader, offer)
    const offerRow = await reportRow(f, onOffer.reportId)
    expect(offerRow).toMatchObject({ target: offer, targetKind: "diasporaJobOffer" })
    expect(offerRow?.ownerPersonId).toBeUndefined()
    const onTalent = await report(f, f.reader, talent)
    expect(await reportRow(f, onTalent.reportId)).toMatchObject({ target: talent, ownerPersonId: f.author.personId })
    const onApplication = await report(f, f.team, application)
    expect(await reportRow(f, onApplication.reportId)).toMatchObject({ target: application, ownerPersonId: f.author.personId })
    // Signalée par ce signataire : elle quitte sa boîte ; la personne garde la vue de sa candidature.
    expect((await f.team.as.query(J.jobOfferApplications, { networkId: f.networkId, jobId, paginationOpts: FIRST })).page).toEqual([])
    expect((await f.author.as.query(J.myJobApplications, { networkId: f.networkId, paginationOpts: FIRST })).page.map((row) => row.applicationId)).toEqual([applicationId])
  })
})

// ═══════════════════════════════════════════════════════════════
// Retirer, masquer, rétablir
// ═══════════════════════════════════════════════════════════════

describe("retrait — invisibilité publique, vue privée, rétablissement", () => {
  it("une question retirée quitte les listes et la fiche publiques, reste dans la vue de son autrice sans modification possible ; rétablie, elle revient", async () => {
    const f = await fixture()
    const { questionId } = await ask(f)
    const target = { kind: "diasporaAidQuestion" as const, id: questionId }
    const { reportId } = await report(f, f.reader, target)
    expect(await decideRemoval(f, reportId)).toEqual({ status: "actioned" })
    expect(await stateOf(f, "diasporaAidQuestion", questionId)).toMatchObject({ status: "removed", ownerPersonId: f.author.personId })

    expect((await listQuestions(f, f.stranger)).page).toEqual([])
    expect(await f.stranger.as.query(AID.aidItem, { networkId: f.networkId, itemId: questionId })).toBeNull()
    expect(await codeOf(listAnswers(f, f.stranger, questionId))).toBe("notFound")
    expect(await codeOf(f.stranger.as.mutation(AID.answerQuestion, { networkId: f.networkId, questionId, body: ANSWER }))).toBe("notFound")

    // La vue privée de l'autrice : sa question, sans réponse ni modification proposées.
    expect((await f.author.as.query(AID.myQuestions, { networkId: f.networkId, paginationOpts: FIRST })).page.map((row) => row.questionId)).toEqual([questionId])
    expect(await f.author.as.query(AID.aidItem, { networkId: f.networkId, itemId: questionId })).toMatchObject({ kind: "question", question: { questionId, canEdit: false, canAnswer: false } })
    expect(await codeOf(f.author.as.mutation(AID.updateQuestion, {
      networkId: f.networkId, questionId, expectedVersion: 1, title: "Trouver une colocation à Villeurbanne", detail: "", theme: "housing", city: "",
    }))).toBe("policyRefused")
    expect((await f.t.run(async (ctx) => ctx.db.get(questionId)))?.version).toBe(1)

    // Rétablie (recours admis, retrait temporaire échu) : elle revient pour le public ; le déclarant ne la revoit pas.
    await f.t.run(async (ctx) => { await restoreTarget(ctx, { target, networkId: f.networkId, ownerPersonId: f.author.personId }) })
    expect((await listQuestions(f, f.stranger)).page.map((row) => row.questionId)).toEqual([questionId])
    expect(await f.stranger.as.query(AID.aidItem, { networkId: f.networkId, itemId: questionId })).toMatchObject({ kind: "question", question: { questionId, canAnswer: true } })
    expect((await listQuestions(f, f.reader)).page).toEqual([])
  })

  it("une réponse retenue retirée est décomptée et libère la question ; le recours la rétablit et la recompte ; un retrait de son autrice ne décompte pas deux fois", async () => {
    const f = await fixture()
    const { teamId } = await f.admin.as.mutation(CASES.createTeam, { networkId: f.networkId, name: "Entraide (fixture)", scope: "diasporaAidAnswer", reason: "Ouverture de la modération de l'entraide." })
    const { questionId } = await ask(f)
    const kept = await f.reader.as.mutation(AID.answerQuestion, { networkId: f.networkId, questionId, body: ANSWER })
    vi.setSystemTime(NOW + 1000)
    const extra = await f.stranger.as.mutation(AID.answerQuestion, { networkId: f.networkId, questionId, body: "Le CROUS ouvre ses demandes au printemps." })
    await f.author.as.mutation(AID.acceptAnswer, { networkId: f.networkId, questionId, answerId: kept.answerId, expectedVersion: 1 })
    const target = { kind: "diasporaAidAnswer" as const, id: kept.answerId }
    const { reportId } = await report(f, f.moderator, target)
    expect(await reportRow(f, reportId)).toMatchObject({ teamId, level: "team", ownerPersonId: f.reader.personId })
    await f.admin.as.mutation(CASES.decide, { networkId: f.networkId, reportId, decision: "actioned", reason: "Réponse trompeuse retirée après examen.", sanctions: [] })

    // Décomptée et plus retenue : la question redevient ouverte, sa version avance.
    const reopened = await f.t.run(async (ctx) => ctx.db.get(questionId))
    expect(reopened).toMatchObject({ status: "open", answerCount: 1, version: 3 })
    expect(reopened?.acceptedAnswerId).toBeUndefined()
    expect((await listAnswers(f, f.stranger, questionId)).page.map((row) => row.answerId)).toEqual([extra.answerId])
    expect((await listAnswers(f, f.reader, questionId)).page.map((row) => row.answerId)).toEqual([extra.answerId])
    expect(await codeOf(f.author.as.mutation(AID.acceptAnswer, { networkId: f.networkId, questionId, answerId: kept.answerId, expectedVersion: 3 }))).toBe("aid_answer_unavailable")
    // Un second retrait de la même cible ne décompte rien.
    await f.t.run(async (ctx) => { await removeTarget(ctx, { target, networkId: f.networkId, ownerPersonId: f.reader.personId }) })
    expect(await f.t.run(async (ctx) => ctx.db.get(questionId))).toMatchObject({ answerCount: 1, version: 3 })

    // Recours de l'autrice de la réponse, admis par une AUTRE administration : rétablie, recomptée, jamais retenue d'office.
    const { appealId } = await f.reader.as.mutation(CASES.fileAppeal, { reportId, reason: "Ma réponse cite une source publique." })
    const secondAdmin = await member(f.t, f.networkId, "admin2.g9", "network_admin")
    await secondAdmin.as.mutation(CASES.reviewNetworkAppeal, { networkId: f.networkId, appealId, overturn: true, reason: "Recours admis : la source est publique." })
    expect(await stateOf(f, "diasporaAidAnswer", kept.answerId)).toMatchObject({ status: "published" })
    const restored = await f.t.run(async (ctx) => ctx.db.get(questionId))
    expect(restored).toMatchObject({ status: "open", answerCount: 2, version: 3 })
    expect(restored?.acceptedAnswerId).toBeUndefined()
    expect((await listAnswers(f, f.stranger, questionId)).page.map((row) => row.answerId)).toEqual([kept.answerId, extra.answerId])

    // Retirée par la modération, puis retirée par son autrice : un seul décompte.
    await f.t.run(async (ctx) => { await removeTarget(ctx, { target, networkId: f.networkId, ownerPersonId: f.reader.personId }) })
    expect(await f.t.run(async (ctx) => ctx.db.get(questionId))).toMatchObject({ answerCount: 1 })
    await f.reader.as.mutation(AID.withdrawAnswer, { networkId: f.networkId, answerId: kept.answerId, expectedVersion: 1 })
    expect(await f.t.run(async (ctx) => ctx.db.get(questionId))).toMatchObject({ answerCount: 1 })
  })

  it("une mission et une offre retirées quittent les listes et refusent inscription et candidature ; l'équipe garde sa gestion et ne tranche pas", async () => {
    const f = await fixture()
    const { missionId } = await f.team.as.mutation(AID.createMission, { networkId: f.networkId, pageId: f.association, ...MISSION })
    const { jobId } = await f.team.as.mutation(J.createJobOffer, offerArgs(f))
    const missionState = await stateOf(f, "diasporaAidMission", missionId)
    expect(missionState).toMatchObject({ status: "published", ownerPageId: f.association })
    expect(missionState?.ownerPersonId).toBeUndefined()
    expect(await stateOf(f, "diasporaJobOffer", jobId)).toMatchObject({ status: "published", ownerPageId: f.company })
    const onMission = await report(f, f.reader, { kind: "diasporaAidMission", id: missionId })
    const onOffer = await report(f, f.reader, { kind: "diasporaJobOffer", id: jobId })

    // Devenu modérateur du réseau, le signataire ne tranche pas le contenu de sa page (refus du moteur).
    await setMembership(f, f.team, { role: "network_moderator" })
    expect(await codeOf(decideRemoval(f, onMission.reportId, f.team))).toBe("notFound")
    await decideRemoval(f, onMission.reportId)
    await decideRemoval(f, onOffer.reportId)

    expect((await f.stranger.as.query(AID.listMissions, { networkId: f.networkId, country: "FR", from: NOW, paginationOpts: FIRST })).page).toEqual([])
    expect(await f.stranger.as.query(AID.aidItem, { networkId: f.networkId, itemId: missionId })).toBeNull()
    expect(await codeOf(f.stranger.as.mutation(AID.signUpForMission, { networkId: f.networkId, missionId, shareNameWithTeam: true }))).toBe("notFound")
    expect((await f.stranger.as.query(J.searchJobOffers, { networkId: f.networkId, paginationOpts: FIRST })).page).toEqual([])
    expect(await f.stranger.as.query(J.getJobOffer, { networkId: f.networkId, jobId })).toBeNull()
    expect(await codeOf(f.stranger.as.mutation(J.applyToJobOffer, applyArgs(f, jobId, { idempotencyKey: "candidature-g9-0002" })))).toBe("notFound")

    // La gestion de l'équipe reste entière ; modifier ce qui est retiré est refusé, clore reste possible.
    expect((await f.team.as.query(AID.pageMissions, { networkId: f.networkId, pageId: f.association, paginationOpts: FIRST })).page.map((row) => row.missionId)).toEqual([missionId])
    expect(await f.team.as.query(AID.aidItem, { networkId: f.networkId, itemId: missionId })).toMatchObject({ kind: "mission", mission: { missionId, canManage: true } })
    expect(await f.team.as.query(J.getJobOffer, { networkId: f.networkId, jobId })).toMatchObject({ jobId, viewerCanManage: true })
    expect(await codeOf(f.team.as.mutation(AID.updateMission, { networkId: f.networkId, missionId, expectedVersion: 1, ...MISSION, places: 4 }))).toBe("policyRefused")
    expect(await codeOf(f.team.as.mutation(J.updateJobOffer, { networkId: f.networkId, jobId, expectedVersion: 1, ...OFFER, title: "Cuisinier en traiteur (temps plein)" }))).toBe("policyRefused")
    expect(await f.team.as.mutation(AID.closeMission, { networkId: f.networkId, missionId, expectedVersion: 1 })).toEqual({ version: 2 })
  })

  it("une demande de mentorat retirée est déclinée par le système : la boîte du mentor se libère, le mentoré en garde la vue, rétablir ne la rouvre pas", async () => {
    const f = await fixture()
    const { mentorId } = await f.author.as.mutation(M.becomeMentor, mentorArgs(f.networkId))
    const { requestId } = await f.reader.as.mutation(M.requestMentoring, requestArgs(f.networkId, mentorId))
    expect(await stateOf(f, "diasporaMentoringRequest", requestId)).toMatchObject({ status: "published", ownerPersonId: f.reader.personId })
    const target = { kind: "diasporaMentoringRequest" as const, id: requestId }
    const { reportId } = await report(f, f.author, target)
    // Signalée : le mentor ne la lit plus et ne l'accepte pas.
    expect(await f.author.as.query(M.getMentoringRequest, { networkId: f.networkId, requestId })).toBeNull()
    expect(await codeOf(f.author.as.mutation(M.acceptMentoringRequest, { networkId: f.networkId, requestId }))).toBe("notFound")

    await decideRemoval(f, reportId)
    expect(await f.t.run(async (ctx) => ctx.db.get(requestId))).toMatchObject({ status: "declined", closedBy: "system", closedAt: NOW })
    expect((await f.author.as.query(M.myMentorProfile, { networkId: f.networkId }))?.pendingRequests).toBe(0)
    expect((await f.reader.as.query(M.menteeMentoringRequests, { networkId: f.networkId, paginationOpts: FIRST })).page).toEqual([expect.objectContaining({ requestId, status: "declined" })])
    expect(await f.reader.as.query(M.getMentoringRequest, { networkId: f.networkId, requestId })).toMatchObject({ requestId, status: "declined", closedBy: "system" })

    await f.t.run(async (ctx) => { await restoreTarget(ctx, { target, networkId: f.networkId, ownerPersonId: f.reader.personId }) })
    expect(await f.t.run(async (ctx) => ctx.db.get(requestId))).toMatchObject({ status: "declined", closedBy: "system" })
  })

  it("un profil de talent retiré quitte la recherche et les candidatures ; une candidature retirée quitte la boîte de toute l'équipe ; la personne garde ses vues", async () => {
    const f = await fixture()
    const colleague = await member(f.t, f.networkId, "equipe2.g9")
    await sign(f.t, f.networkId, f.company, colleague.personId)
    const { jobId } = await f.team.as.mutation(J.createJobOffer, offerArgs(f))
    const { talentId } = await f.author.as.mutation(J.saveMyTalentProfile, { networkId: f.networkId, ...TALENT })
    const { applicationId } = await f.author.as.mutation(J.applyToJobOffer, applyArgs(f, jobId, { shareTalentProfile: true }))
    const received = (who: Member) => who.as.query(J.jobOfferApplications, { networkId: f.networkId, jobId, paginationOpts: FIRST })
    expect((await received(f.team)).page[0]).toMatchObject({ applicationId, talentProfile: { title: TALENT.title } })
    expect((await f.stranger.as.query(J.searchTalents, { networkId: f.networkId, country: "FR", paginationOpts: FIRST })).page.map((row) => row.talentId)).toEqual([talentId])

    const onTalent = await report(f, f.reader, { kind: "diasporaTalentProfile", id: talentId })
    await decideRemoval(f, onTalent.reportId)
    expect((await f.stranger.as.query(J.searchTalents, { networkId: f.networkId, country: "FR", paginationOpts: FIRST })).page).toEqual([])
    expect((await received(f.team)).page[0]).toMatchObject({ applicationId, talentProfile: null })
    expect(await f.author.as.query(J.myTalentProfile, { networkId: f.networkId })).toMatchObject({ talentId })
    expect(await codeOf(f.author.as.mutation(J.saveMyTalentProfile, { networkId: f.networkId, ...TALENT, expectedVersion: 1, title: "Comptable trilingue" }))).toBe("policyRefused")

    const onApplication = await report(f, f.team, { kind: "diasporaJobApplication", id: applicationId })
    expect((await received(colleague)).page.map((row) => row.applicationId)).toEqual([applicationId])
    await decideRemoval(f, onApplication.reportId)
    expect((await received(colleague)).page).toEqual([])
    expect((await f.author.as.query(J.myJobApplications, { networkId: f.networkId, paginationOpts: FIRST })).page.map((row) => row.applicationId)).toEqual([applicationId])
  })

  it("une ressource retirée quitte le kit public et la fiche ; son autrice la garde, sans pouvoir la modifier ni la soumettre", async () => {
    const f = await fixture()
    const resourceId = await kitResource(f)
    const { reportId } = await report(f, f.reader, { kind: "diasporaKitResource", id: resourceId })
    await decideRemoval(f, reportId)
    expect((await f.stranger.as.query(K.listResources, { networkId: f.networkId, country: "FR", paginationOpts: FIRST })).page).toEqual([])
    expect(await f.stranger.as.query(K.getResource, { networkId: f.networkId, resourceId })).toBeNull()
    expect(await codeOf(f.stranger.as.mutation(K.flagResourceOutdated, { networkId: f.networkId, resourceId, revision: 1, reason: "link_broken" }))).toBe("notFound")
    expect(await f.author.as.query(K.getResource, { networkId: f.networkId, resourceId })).toMatchObject({ resourceId, viewer: { canManage: true } })
    expect((await f.author.as.query(K.myResources, { networkId: f.networkId, paginationOpts: FIRST })).page.map((row) => row.resourceId)).toEqual([resourceId])
    expect(await codeOf(f.author.as.mutation(K.updateResource, {
      networkId: f.networkId, resourceId, expectedVersion: 1, title: "Ouvrir un compte bancaire à Lyon", summary: "Les pièces demandées et les délais habituels pour un premier compte.",
      body: "Prenez rendez-vous en agence avec une pièce d'identité et un justificatif de domicile.", category: "banking", country: "FR",
      sourceName: "Portail public fictif", sourceUrl: "https://www.exemple-public.fr/", lastVerifiedAt: NOW - DAY, submit: true,
    }))).toBe("policyRefused")
  })
})

// ═══════════════════════════════════════════════════════════════
// Politique : visible dès l'écriture, sauf politique explicite
// ═══════════════════════════════════════════════════════════════

describe("politique — aucune mise en attente implicite", () => {
  it("sans politique explicite pour la surface : publié dès l'écriture, même avec un terme bloqué du réseau ; l'état porte la personne ou la page", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => { await ctx.db.insert("blockedTerms", { networkId: f.networkId, term: "arnaque", active: true, updatedAt: NOW }) })
    const { questionId } = await ask(f)
    vi.setSystemTime(NOW + 1000)
    const flagged = await ask(f, { title: "Une arnaque au logement à Lyon ?" })
    const { missionId } = await f.team.as.mutation(AID.createMission, { networkId: f.networkId, pageId: f.association, ...MISSION })
    expect(await stateOf(f, "diasporaAidQuestion", questionId)).toMatchObject({ networkId: f.networkId, status: "published", ownerPersonId: f.author.personId })
    expect(await stateOf(f, "diasporaAidQuestion", flagged.questionId)).toMatchObject({ status: "published" })
    const missionState = await stateOf(f, "diasporaAidMission", missionId)
    expect(missionState).toMatchObject({ status: "published", ownerPageId: f.association })
    expect(missionState?.ownerPersonId).toBeUndefined()
    expect((await listQuestions(f, f.stranger)).page.map((row) => row.questionId)).toEqual([flagged.questionId, questionId])
    expect((await f.stranger.as.query(AID.listMissions, { networkId: f.networkId, country: "FR", from: NOW, paginationOpts: FIRST })).page.map((row) => row.missionId)).toEqual([missionId])
  })

  it("avec une politique explicite : en relecture, servi à sa seule autrice (aucune dérogation de modérateur dans la liste) ; approuvé, il paraît", async () => {
    const f = await fixture()
    await f.admin.as.mutation(CASES.setPolicy, {
      networkId: f.networkId, surface: "diasporaAidQuestion", preReview: true, maxLinks: 2, maxWrites: 10, windowMs: 60_000, reason: "Relecture préalable de l'entraide au lancement.",
    })
    const { questionId } = await ask(f)
    const target = { kind: "diasporaAidQuestion" as const, id: questionId }
    expect(await stateOf(f, "diasporaAidQuestion", questionId)).toMatchObject({ status: "pending_review", ownerPersonId: f.author.personId })
    expect((await listQuestions(f, f.author)).page.map((row) => row.questionId)).toEqual([questionId])
    expect((await listQuestions(f, f.stranger)).page).toEqual([])
    expect((await listQuestions(f, f.moderator)).page).toEqual([])
    expect(await f.stranger.as.query(AID.aidItem, { networkId: f.networkId, itemId: questionId })).toBeNull()
    expect(await codeOf(report(f, f.stranger, target))).toBe("notFound")

    const stored = await f.t.run(async (ctx) => ctx.db.get(questionId))
    if (!stored) throw new Error("Question de fixture absente")
    expect(await f.moderator.as.query(PREVIEW, { networkId: f.networkId, target })).toEqual({ kind: "diasporaAidQuestion", available: true, title: stored.title, body: stored.detail, media: [] })
    await f.moderator.as.mutation(CASES.reviewContent, { networkId: f.networkId, target, approve: true, reason: "Question conforme après relecture." })
    expect(await stateOf(f, "diasporaAidQuestion", questionId)).toMatchObject({ status: "published" })
    expect((await listQuestions(f, f.stranger)).page.map((row) => row.questionId)).toEqual([questionId])
  })
})

// ═══════════════════════════════════════════════════════════════
// Aperçu borné
// ═══════════════════════════════════════════════════════════════

describe("aperçu — borné, sans personne ni pièce privée", () => {
  it("candidature : un extrait du message, jamais le message entier ni la personne ni le profil joint ; demande : l'objectif tronqué", async () => {
    const f = await fixture()
    const { jobId } = await f.team.as.mutation(J.createJobOffer, offerArgs(f))
    await f.author.as.mutation(J.saveMyTalentProfile, { networkId: f.networkId, ...TALENT })
    const { applicationId } = await f.author.as.mutation(J.applyToJobOffer, applyArgs(f, jobId, { message: LONG_MESSAGE, shareTalentProfile: true, idempotencyKey: "candidature-g9-0003" }))
    const onApplication = await report(f, f.team, { kind: "diasporaJobApplication", id: applicationId })
    const stored = await f.t.run(async (ctx) => ctx.db.get(applicationId))
    if (!stored) throw new Error("Candidature de fixture absente")
    expect(stored.message.length).toBeGreaterThan(APPLICATION_MESSAGE_EXCERPT)
    const preview = await f.moderator.as.query(PREVIEW, { networkId: f.networkId, reportId: onApplication.reportId })
    expect(preview).toEqual({ kind: "diasporaJobApplication", available: true, title: null, body: stored.message.slice(0, APPLICATION_MESSAGE_EXCERPT), media: [] })
    const serialized = JSON.stringify(preview)
    for (const secret of [f.author.personId, f.author.handle, TALENT.title, stored.offerTitle, applicationId, jobId]) expect(serialized).not.toContain(secret)
    expect(await codeOf(f.reader.as.query(PREVIEW, { networkId: f.networkId, reportId: onApplication.reportId }))).toBe("notFound")

    const { mentorId } = await f.author.as.mutation(M.becomeMentor, mentorArgs(f.networkId))
    const { requestId } = await f.reader.as.mutation(M.requestMentoring, requestArgs(f.networkId, mentorId, LONG_GOAL))
    const onRequest = await report(f, f.author, { kind: "diasporaMentoringRequest", id: requestId })
    const request = await f.t.run(async (ctx) => ctx.db.get(requestId))
    if (!request) throw new Error("Demande de fixture absente")
    expect(request.goal.length).toBeGreaterThan(MENTORING_GOAL_EXCERPT)
    const requestPreview = await f.moderator.as.query(PREVIEW, { networkId: f.networkId, reportId: onRequest.reportId })
    expect(requestPreview).toEqual({ kind: "diasporaMentoringRequest", available: true, title: null, body: request.goal.slice(0, MENTORING_GOAL_EXCERPT), media: [] })
    for (const secret of [request.message.slice(0, 24), f.reader.personId, f.reader.handle]) expect(JSON.stringify(requestPreview)).not.toContain(secret)
  })
})

// ═══════════════════════════════════════════════════════════════
// Guichet : le pays de chaque nature
// ═══════════════════════════════════════════════════════════════

describe("guichet — le pays que porte chaque contenu, jamais le pays de résidence d'une personne", () => {
  it("range les neuf natures par la zone de leur contenu ; la page porteuse fait du signataire une partie ; la relecture préalable aussi", async () => {
    const f = await fixture()
    // Toutes les personnes de la fixture résident en France (facette) : aucun dossier n'en hérite.
    const ids = await f.t.run(async (ctx) => {
      const questionId = await ctx.db.insert("aidQuestions", {
        networkId: f.networkId, authorPersonId: f.author.personId, title: "Abonnement de transport à Bruxelles", detail: "", theme: "transport", country: "BE",
        status: "open", answerCount: 1, version: 1, createdAt: NOW, updatedAt: NOW,
      })
      const answerId = await ctx.db.insert("aidAnswers", { networkId: f.networkId, questionId, authorPersonId: f.reader.personId, body: "La carte se demande en ligne.", status: "published", version: 1, createdAt: NOW, updatedAt: NOW })
      const missionId = await ctx.db.insert("aidMissions", {
        networkId: f.networkId, pageId: f.association, title: "Collecte de vêtements à Berlin", description: "Trier les dons de vêtements d'hiver avec l'équipe.",
        country: "DE", city: "Berlin", cityKey: "berlin", startsAt: NOW + 2 * DAY, timeZone: "Europe/Berlin", places: 5, signupCount: 0, status: "open", version: 1, createdAt: NOW, updatedAt: NOW,
      })
      const mentorId = await ctx.db.insert("mentorProfiles", {
        networkId: f.networkId, personId: f.author.personId, state: "active", domains: ["housing"], presentation: PRESENTATION, languages: ["fr"], country: "SN",
        availability: "Le soir en semaine", maxActiveMentees: 2, version: 1, optedInAt: NOW, listedAt: NOW, createdAt: NOW, updatedAt: NOW,
      })
      const requestId = await ctx.db.insert("mentoringRequests", {
        networkId: f.networkId, mentorProfileId: mentorId, mentorPersonId: f.author.personId, menteePersonId: f.reader.personId, domain: "housing",
        goal: "Trouver un logement à Dakar", message: REQUEST_MESSAGE, wishedSlots: [], timeZone: "Europe/Paris", status: "sent", consentAt: NOW,
        idempotencyKey: KEY, idempotencyFingerprint: "empreinte-fictive", expiresAt: NOW + 14 * DAY, slotVersion: 0, createdAt: NOW, updatedAt: NOW,
      })
      const jobId = await ctx.db.insert("jobOffers", {
        networkId: f.networkId, pageId: f.company, title: OFFER.title, description: OFFER.description, contract: "cdi", country: "BE", workMode: "onsite",
        languages: ["fr"], status: "open", searchText: "cuisinier traiteur", version: 1, publishedAt: NOW, createdAt: NOW, updatedAt: NOW,
      })
      const applicationId = await ctx.db.insert("jobApplications", {
        networkId: f.networkId, offerId: jobId, pageId: f.company, candidatePersonId: f.author.personId, offerTitle: OFFER.title, offerVersion: 1,
        message: APPLICATION_MESSAGE, status: "sent", identityConsentAt: NOW, shareTalentProfile: false, idempotencyKey: "candidature-g9-0004",
        idempotencyFingerprint: "empreinte-fictive", createdAt: NOW, updatedAt: NOW,
      })
      const talentId = await ctx.db.insert("talentProfiles", {
        networkId: f.networkId, personId: f.reader.personId, title: "Comptable bilingue", skills: ["Paie"], searchText: "comptable bilingue paie",
        availability: "one_month", languages: ["fr"], country: "SE", visibility: "network", status: "active", version: 1, createdAt: NOW, updatedAt: NOW,
      })
      return { questionId, answerId, missionId, mentorId, requestId, jobId, applicationId, talentId }
    })
    const resourceId = await kitResource(f, { country: "CA" })
    const targets: Target[] = [
      { kind: "diasporaAidQuestion", id: ids.questionId },
      { kind: "diasporaAidAnswer", id: ids.answerId },
      { kind: "diasporaAidMission", id: ids.missionId },
      { kind: "diasporaMentorProfile", id: ids.mentorId },
      { kind: "diasporaMentoringRequest", id: ids.requestId },
      { kind: "diasporaKitResource", id: resourceId },
      { kind: "diasporaJobOffer", id: ids.jobId },
      { kind: "diasporaTalentProfile", id: ids.talentId },
      { kind: "diasporaJobApplication", id: ids.applicationId },
    ]
    for (const [index, target] of targets.entries()) {
      const createdAt = NOW + index + 1
      await f.t.run(async (ctx) => {
        await ctx.db.insert("reports", { networkId: f.networkId, target, targetKind: target.kind, targetId: target.id, reason: "harassment", level: "network", status: "open", createdAt, updatedAt: createdAt })
      })
    }
    const queue = (who: Member, zone: typeof ALL | { kind: "country"; country: string }) =>
      who.as.query(D.queue, { networkId: f.networkId, expectedPersonId: who.personId, zone, paginationOpts: FIRST })

    const all = await queue(f.moderator, ALL)
    expect(Object.fromEntries(all.items.map((row) => [row.surface, row.country]))).toEqual({
      diasporaAidQuestion: "BE",
      diasporaAidAnswer: "BE",
      diasporaAidMission: "DE",
      diasporaMentorProfile: "SN",
      diasporaMentoringRequest: "SN",
      diasporaKitResource: "CA",
      diasporaJobOffer: "BE",
      diasporaTalentProfile: "SE",
      diasporaJobApplication: "BE",
    })
    expect((await queue(f.moderator, { kind: "country", country: "FR" })).items).toEqual([])
    expect((await queue(f.moderator, { kind: "country", country: "SN" })).items.map((row) => row.surface)).toEqual(["diasporaMentorProfile", "diasporaMentoringRequest"])
    expect((await queue(f.moderator, { kind: "country", country: "BE" })).items.map((row) => row.surface)).toEqual(["diasporaAidQuestion", "diasporaAidAnswer", "diasporaJobOffer", "diasporaJobApplication"])
    // Aucun déclarant, auteur, candidat ni corps de contenu dans la file.
    for (const secret of [f.author.personId, f.reader.personId, REQUEST_MESSAGE, APPLICATION_MESSAGE]) expect(JSON.stringify(all)).not.toContain(secret)

    // Le signataire des pages porteuses (mission, offre, candidature) est partie au dossier.
    await setMembership(f, f.team, { role: "network_moderator" })
    const asTeam = await queue(f.team, ALL)
    expect(Object.fromEntries(asTeam.items.map((row) => [row.surface, row.party]))).toMatchObject({
      diasporaAidMission: "page", diasporaJobOffer: "page", diasporaJobApplication: "page", diasporaAidQuestion: null, diasporaKitResource: null,
    })

    // La relecture préalable se range de même (ici : le pays déclaré du profil de talent).
    await f.t.run(async (ctx) => {
      await ctx.db.insert("moderationContentStates", { networkId: f.networkId, targetKind: "diasporaTalentProfile", targetId: ids.talentId, ownerPersonId: f.reader.personId, status: "pending_review", createdAt: NOW, updatedAt: NOW })
    })
    const pending = await f.moderator.as.query(D.pendingQueue, { networkId: f.networkId, expectedPersonId: f.moderator.personId, zone: { kind: "country", country: "SE" }, paginationOpts: FIRST })
    expect(pending.items).toEqual([{ target: { kind: "diasporaTalentProfile", id: ids.talentId }, surface: "diasporaTalentProfile", country: "SE", teamName: null, updatedAt: NOW, party: null }])
  })
})
