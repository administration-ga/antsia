// @vitest-environment edge-runtime
/**
 * CC-3a — résolveurs DIASPORA.GA des conversations contextuelles (contrat
 * CONVERSATION-CONTEXTUELLE-V1, ADR-0025) : instantané relu par la tranche, phase sur l'état
 * effectif, visibilité propre (relecture préalable), modération, pays du guichet, règle D8.
 * Les fixtures de membres, de pages et d'offres reprennent celles de `mentoring.test.ts` et
 * `jobs.test.ts` (mêmes données fictives).
 */
import { CONTEXTUAL_KINDS } from "@antsia/social-domain/contextualMessaging"
import { cityKeyOf, jobSearchTextOf } from "@diaspora-ga/domain"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { joinDeclaredDiasporaFixture, openNetworkFeatures, testConvex } from "../../test.setup"
import type { ContextualResolvers } from "../contextualMessaging/contract"
import { DIASPORA_CONVERSATION_CONTEXTS as CONTEXTS } from "./conversationContexts"

/** Les résolveurs vus au type du contrat : `load` et `visibleTo` reçoivent tous leurs paramètres. */
const RESOLVERS: ContextualResolvers = CONTEXTS

type T = ReturnType<typeof testConvex>
type Member = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons"> }

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const NOW = Date.UTC(2026, 9, 19, 10)
const M = api.modules.diaspora.mentoring
const J = api.modules.diaspora.jobs

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

/** Un membre à identité forte (IDN loa 2), profil publié, facette diaspora en France. */
async function member(t: T, networkId: Id<"networks">, handle: string, displayName = handle): Promise<Member> {
  const as = t.withIdentity({ subject: `auth-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName })
  await t.run(async (ctx) => {
    await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `idn-${personId}`, loa: 2, nationality: "GA", linkedAt: NOW })
  })
  await joinDeclaredDiasporaFixture(as, { networkId, facet: { countryOfResidence: "FR", city: "Paris" } })
  return { as, personId }
}

async function base() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  await openNetworkFeatures(t, networkId)
  return { t, root, networkId }
}

/** L'état de modération d'un contenu, posé directement (relecture préalable ou retrait). */
async function moderate(t: T, networkId: Id<"networks">, targetKind: "diasporaMentoringRequest" | "diasporaMentorProfile" | "diasporaJobApplication" | "diasporaJobOffer", targetId: string, status: "pending_review" | "removed", owner: { ownerPersonId?: Id<"persons">; ownerPageId?: Id<"pages"> }) {
  await t.run(async (ctx) => {
    const existing = await ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", targetKind).eq("targetId", targetId)).unique()
    if (existing) await ctx.db.patch(existing._id, { status, updatedAt: NOW })
    else await ctx.db.insert("moderationContentStates", { networkId, targetKind, targetId, ...owner, status, createdAt: NOW, updatedAt: NOW })
  })
}

describe("résolveurs DIASPORA.GA — forme", () => {
  it("une entrée par nature V1 du moteur, chacune avec sa règle de texte", () => {
    expect(Object.keys(CONTEXTS).sort()).toEqual([...CONTEXTUAL_KINDS].sort())
    for (const kind of CONTEXTUAL_KINDS) {
      expect(CONTEXTS[kind].kind).toBe(kind)
      expect(typeof CONTEXTS[kind].textRule).toBe("function")
    }
  })

  it("D8 : adresse exacte refusée en voix de personne, admise en voix de page ; coordonnées permises", () => {
    const address = "Rendez-vous au 12 rue de la Paix"
    expect(CONTEXTS.diasporaMentoring.textRule({ text: address, kind: "diasporaMentoring", side: "responder", voice: "person" })).toEqual({ ok: false, code: "context_address_forbidden" })
    expect(CONTEXTS.diasporaServiceRequest.textRule({ text: address, kind: "diasporaServiceRequest", side: "requester", voice: "person" })).toEqual({ ok: false, code: "context_address_forbidden" })
    expect(CONTEXTS.diasporaServiceRequest.textRule({ text: address, kind: "diasporaServiceRequest", side: "responder", voice: "page" })).toEqual({ ok: true })
    expect(CONTEXTS.diasporaJobApplication.textRule({ text: "Appelez-moi au 06 12 34 56 78", kind: "diasporaJobApplication", side: "requester", voice: "person" })).toEqual({ ok: true })
  })
})

describe("mentorat — instantané et visibilité", () => {
  async function mentoring() {
    const b = await base()
    const mentor = await member(b.t, b.networkId, "awa", "Awa OGOOUÉ")
    const mentee = await member(b.t, b.networkId, "yannick", "Yannick NYANGA")
    const { mentorId } = await mentor.as.mutation(M.becomeMentor, {
      networkId: b.networkId, domains: ["housing"], presentation: "Arrivée à Paris en 2015, j'aide les nouveaux venus à trouver un logement.",
      languages: ["fr"], country: "FR", city: "Paris 11e", availability: "Le soir en semaine", maxActiveMentees: 2, consent: true,
    })
    const { requestId } = await mentee.as.mutation(M.requestMentoring, {
      networkId: b.networkId, mentorId, domain: "housing", goal: "Trouver un logement étudiant",
      message: "Je viens d'arriver à Paris pour mes études et je cherche des conseils pour le logement.",
      wishedSlots: [{ startAt: NOW + DAY, endAt: NOW + DAY + HOUR }], timeZone: "Europe/Paris", shareWithMentor: true, idempotencyKey: "mentorat-contexte-0001",
    })
    return { ...b, mentor, mentee, mentorId, requestId }
  }

  it("envoyée : jamais ouverte ; acceptée : engagée, mentoré face au mentor, guichet du pays du profil", async () => {
    const f = await mentoring()
    const load = () => f.t.run(async (ctx) => await RESOLVERS.diasporaMentoring.load(ctx, f.requestId, Date.now()))
    expect(await load()).toMatchObject({ phase: "not_open", callsEngaged: false })

    await f.mentor.as.mutation(M.acceptMentoringRequest, { networkId: f.networkId, requestId: f.requestId })
    expect(await load()).toEqual({
      networkId: f.networkId,
      requester: { personId: f.mentee.personId },
      responder: { personId: f.mentor.personId },
      phase: "open",
      callsEngaged: true,
      responderFirst: false,
      attachments: { requester: true, responder: true },
      writeMinStatus: { requester: "declaree", responder: "declaree" },
      moderationCountry: "FR",
    })

    await f.mentee.as.mutation(M.closeMentorship, { networkId: f.networkId, requestId: f.requestId })
    expect(await load()).toMatchObject({ phase: "closed", callsEngaged: false, attachments: { requester: false, responder: false } })
  })

  it("une demande envoyée dont l'échéance est passée reste « jamais ouverte » (état effectif)", async () => {
    const f = await mentoring()
    const later = await f.t.run(async (ctx) => await RESOLVERS.diasporaMentoring.load(ctx, f.requestId, NOW + 30 * DAY))
    expect(later?.phase).toBe("not_open")
  })

  it("le profil du mentor ou la demande retirés par la modération ferment ; la lecture reste possible", async () => {
    const f = await mentoring()
    await f.mentor.as.mutation(M.acceptMentoringRequest, { networkId: f.networkId, requestId: f.requestId })
    await moderate(f.t, f.networkId, "diasporaMentorProfile", f.mentorId, "removed", { ownerPersonId: f.mentor.personId })
    const loaded = await f.t.run(async (ctx) => await RESOLVERS.diasporaMentoring.load(ctx, f.requestId, NOW))
    expect(loaded?.phase).toBe("closed")
    expect(await f.t.run(async (ctx) => await RESOLVERS.diasporaMentoring.visibleTo(ctx, f.requestId, f.mentor.personId, NOW))).toBe(true)
  })

  it("en relecture préalable : visible de la personne mentorée seule, absente pour le mentor", async () => {
    const f = await mentoring()
    await moderate(f.t, f.networkId, "diasporaMentoringRequest", f.requestId, "pending_review", { ownerPersonId: f.mentee.personId })
    const visible = (personId: Id<"persons">) => f.t.run(async (ctx) => await RESOLVERS.diasporaMentoring.visibleTo(ctx, f.requestId, personId, NOW))
    expect(await visible(f.mentee.personId)).toBe(true)
    expect(await visible(f.mentor.personId)).toBe(false)
  })

  it("un objet absent rend null et n'est visible de personne", async () => {
    const f = await mentoring()
    await f.t.run(async (ctx) => { await ctx.db.delete(f.requestId) })
    expect(await f.t.run(async (ctx) => await RESOLVERS.diasporaMentoring.load(ctx, f.requestId, NOW))).toBeNull()
    expect(await f.t.run(async (ctx) => await RESOLVERS.diasporaMentoring.visibleTo(ctx, f.requestId, f.mentee.personId, NOW))).toBe(false)
  })
})

describe("candidature — instantané et visibilité", () => {
  async function application() {
    const b = await base()
    const pro = await member(b.t, b.networkId, "pro.recrute", "Nadia MPASSA")
    const candidate = await member(b.t, b.networkId, "candidate.demo", "Mireille IVINDO")
    const pageId = await b.t.run(async (ctx) => ctx.db.insert("pages", {
      networkId: b.networkId, handle: "traiteur-paris-demo", name: "Page traiteur-paris-demo", ownerKind: "company", trust: "community", trustRank: 0,
      country: "FR", visibility: "network", onRoot: false, status: "active", searchText: "traiteur-paris-demo", createdAt: NOW, updatedAt: NOW,
    }))
    await b.t.run(async (ctx) => { await ctx.db.insert("pageSignatories", { networkId: b.networkId, pageId, personId: pro.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW }) })
    const title = "Cuisinier ou cuisinière en traiteur"
    const description = "Préparer les plats du pays pour les commandes de la semaine, en équipe de trois."
    const jobId = await b.t.run(async (ctx) => ctx.db.insert("jobOffers", {
      networkId: b.networkId, pageId, contract: "cdi", country: "SN", workMode: "onsite", languages: ["fr"], status: "open", version: 1,
      publishedAt: NOW, createdAt: NOW, updatedAt: NOW, title, description, city: "Dakar", cityKey: cityKeyOf("Dakar"),
      searchText: jobSearchTextOf({ title, description, city: "Dakar" }),
    }))
    const { applicationId } = await candidate.as.mutation(J.applyToJobOffer, {
      networkId: b.networkId, jobId, offerVersion: 1, message: "Bonjour, cinq ans de cuisine collective et l'envie de rejoindre votre équipe.",
      shareName: true, shareTalentProfile: false, idempotencyKey: "candidature-contexte-0001",
    })
    return { ...b, pro, candidate, pageId, jobId, applicationId }
  }

  it("envoyée : jamais ouverte ; présélectionnée : engagée, face à la page, guichet du pays de l'offre", async () => {
    const f = await application()
    const load = () => f.t.run(async (ctx) => await RESOLVERS.diasporaJobApplication.load(ctx, f.applicationId, NOW))
    expect(await load()).toMatchObject({ phase: "not_open" })

    await f.pro.as.mutation(J.shortlistJobApplication, { networkId: f.networkId, applicationId: f.applicationId })
    expect(await load()).toEqual({
      networkId: f.networkId,
      requester: { personId: f.candidate.personId },
      responder: { pageId: f.pageId },
      phase: "open",
      callsEngaged: true,
      responderFirst: false,
      attachments: { requester: true, responder: true },
      writeMinStatus: { requester: "declaree", responder: "declaree" },
      moderationCountry: "SN",
    })
  })

  it("clore l'offre ne ferme rien (D6) ; l'offre retirée par la modération ferme", async () => {
    const f = await application()
    await f.pro.as.mutation(J.shortlistJobApplication, { networkId: f.networkId, applicationId: f.applicationId })
    await f.t.run(async (ctx) => { await ctx.db.patch(f.jobId, { status: "closed", closedAt: NOW, updatedAt: NOW }) })
    const load = () => f.t.run(async (ctx) => await RESOLVERS.diasporaJobApplication.load(ctx, f.applicationId, NOW))
    expect((await load())?.phase).toBe("open")
    await moderate(f.t, f.networkId, "diasporaJobOffer", f.jobId, "removed", { ownerPageId: f.pageId })
    expect((await load())?.phase).toBe("closed")
  })

  it("non retenue : fermée ; en relecture préalable : visible de la personne qui candidate seule", async () => {
    const f = await application()
    await moderate(f.t, f.networkId, "diasporaJobApplication", f.applicationId, "pending_review", { ownerPersonId: f.candidate.personId })
    const visible = (personId: Id<"persons">) => f.t.run(async (ctx) => await RESOLVERS.diasporaJobApplication.visibleTo(ctx, f.applicationId, personId, NOW))
    expect(await visible(f.candidate.personId)).toBe(true)
    expect(await visible(f.pro.personId)).toBe(false)

    await f.pro.as.mutation(J.markJobApplicationNotSelected, { networkId: f.networkId, applicationId: f.applicationId })
    expect((await f.t.run(async (ctx) => await RESOLVERS.diasporaJobApplication.load(ctx, f.applicationId, NOW)))?.phase).toBe("closed")
  })

  it("hors d'un réseau de la tranche : null", async () => {
    const f = await application()
    await f.t.run(async (ctx) => { await ctx.db.patch(f.applicationId, { networkId: f.root }) })
    expect(await f.t.run(async (ctx) => await RESOLVERS.diasporaJobApplication.load(ctx, f.applicationId, NOW))).toBeNull()
    expect(await f.t.run(async (ctx) => await RESOLVERS.diasporaJobApplication.visibleTo(ctx, f.applicationId, f.candidate.personId, NOW))).toBe(false)
  })
})
