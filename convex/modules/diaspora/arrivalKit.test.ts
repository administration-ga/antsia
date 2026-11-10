// @vitest-environment edge-runtime
/**
 * Kit d'arrivée DIASPORALE (DG-024 b) : proposer, relire par une AUTRE personne habilitée,
 * publier, marquer « à revoir », signaler une information périmée, retirer — avec de
 * vraies sessions et le vrai limiteur de débit. Scénarios exigés : relecture par
 * l'auteur refusée, adresse non https refusée, double signalement, ancienneté → à
 * revoir, autre réseau, statut insuffisant ; plus la page officielle, le cycle et les
 * versions, la visibilité et le plafond.
 */
import { engineErrorAppRule, engineErrorCode } from "@antsia/social-contracts/errors"
import { ARRIVAL_KIT_OUTDATED_FLAG_THRESHOLD, ARRIVAL_KIT_RESOURCES_PER_PROPOSER_MAX, DAY_MS } from "@diasporale/domain"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Member = Awaited<ReturnType<typeof member>>
type Fixture = Awaited<ReturnType<typeof fixture>>
type ResourceFields = Omit<Doc<"kitResources">, "_id" | "_creationTime">

const NOW = Date.UTC(2026, 9, 18, 10)
const K = api.modules.diaspora.arrivalKit
const FIRST = { numItems: 20, cursor: null }

/** Une ressource fictive complète : chaque test n'en change qu'un trait. */
const RESOURCE = {
  title: "Ouvrir un compte bancaire à Paris",
  summary: "Les pièces demandées et les délais habituels pour un premier compte.",
  body: "Prenez rendez-vous en agence avec une pièce d'identité, un justificatif de domicile et votre titre de séjour.",
  category: "banking",
  country: "FR",
  city: "Paris",
  sourceName: "Portail public d'information bancaire",
  sourceUrl: "https://www.exemple-public.fr/compte?utm_source=lettre&ref=kit",
  lastVerifiedAt: NOW - 2 * DAY_MS,
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

/**
 * Un membre de DIASPORALE au profil publié : déclaré (IDN de garantie 1 par défaut),
 * ou vérifié par une attestation consulaire.
 */
async function member(t: T, networkId: Id<"networks">, handle: string, options: { verified?: boolean; loa?: number } = {}) {
  const as = t.withIdentity({ subject: `auth-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await t.run(async (ctx) => {
    await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `idn-${personId}`, loa: options.loa ?? 1, nationality: "GA", linkedAt: NOW })
    if (options.verified) {
      await ctx.db.insert("identityLinks", {
        personId, provider: "consular_attestation", subject: `empreinte-${personId}`, country: "FR", postSlug: "consulat-general-paris", linkedAt: NOW,
      })
    }
  })
  await as.mutation(api.modules.diaspora.membership.joinDiasporale, { networkId, facet: { countryOfResidence: "FR", city: "Paris" } })
  return { as, personId, handle }
}

async function page(
  t: T,
  networkId: Id<"networks">,
  handle: string,
  options: { ownerKind?: Doc<"pages">["ownerKind"]; trust?: Doc<"pages">["trust"] } = {},
): Promise<Id<"pages">> {
  const trust = options.trust ?? "community"
  return await t.run(async (ctx) => ctx.db.insert("pages", {
    networkId,
    handle,
    name: `Page ${handle}`,
    ownerKind: options.ownerKind ?? "association",
    trust,
    trustRank: trust === "official" ? 2 : trust === "verified" ? 1 : 0,
    country: "FR",
    visibility: "network",
    onRoot: false,
    status: "active",
    searchText: handle,
    createdAt: NOW,
    updatedAt: NOW,
  }))
}

async function sign(t: T, networkId: Id<"networks">, pageId: Id<"pages">, personId: Id<"persons">, role: "admin" | "signatory", accepted = true) {
  await t.run(async (ctx) => {
    await ctx.db.insert("pageSignatories", { networkId, pageId, personId, role, ...(accepted ? { acceptedAt: NOW } : {}), createdAt: NOW, updatedAt: NOW })
  })
}

async function setStatus(t: T, networkId: Id<"networks">, personId: Id<"persons">, status: "en_attente" | "suspendue") {
  await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships")
      .withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique()
    if (!row) throw new Error("Adhésion de fixture absente")
    await ctx.db.patch(row._id, { status })
  })
}

/** Une ressource posée directement (autre réseau, plafond) : mêmes champs que l'écriture du moteur. */
async function insertResource(t: T, networkId: Id<"networks">, authorId: Id<"persons">, overrides: Partial<ResourceFields> = {}): Promise<Id<"kitResources">> {
  return await t.run(async (ctx) => ctx.db.insert("kitResources", {
    networkId,
    authorPersonId: authorId,
    proposedByPersonId: authorId,
    revisedByPersonId: authorId,
    title: "Ressource fictive",
    summary: "Un résumé fictif assez long pour la règle.",
    body: "Un contenu fictif assez long pour la règle du domaine, sans aucune coordonnée.",
    category: "procedures",
    country: "FR",
    cityKey: "",
    sourceName: "Source fictive",
    sourceUrl: "https://www.exemple-public.fr/",
    lastVerifiedAt: NOW - DAY_MS,
    status: "published",
    listed: true,
    revision: 1,
    version: 1,
    outdatedFlags: 0,
    revisedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }))
}

/** L'état de modération d'une ressource, posé directement (relecture préalable ou retrait), comme le décide la modération du moteur. */
async function moderate(
  t: T,
  networkId: Id<"networks">,
  resourceId: Id<"kitResources">,
  status: "pending_review" | "removed",
  owner: { ownerPersonId: Id<"persons"> } | { ownerPageId: Id<"pages"> },
) {
  await t.run(async (ctx) => {
    const existing = await ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", "diasporaKitResource").eq("targetId", resourceId)).unique()
    if (existing) await ctx.db.patch(existing._id, { status, updatedAt: NOW })
    else await ctx.db.insert("moderationContentStates", { networkId, targetKind: "diasporaKitResource", targetId: resourceId, ...owner, status, createdAt: NOW, updatedAt: NOW })
  })
}

/** Le code du refus : le refus d'application d'abord, sinon le code du moteur ; `null` sans refus. */
async function refusal(promise: Promise<unknown>) {
  try { await promise } catch (error) { return engineErrorAppRule(error)?.appRule ?? engineErrorCode(error) }
  return null
}

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  const author = await member(t, networkId, "autrice.kit")
  const reviewer = await member(t, networkId, "relectrice.kit", { verified: true })
  const reader = await member(t, networkId, "lecteur.kit")
  const other = await member(t, networkId, "autre.kit")
  return { t, root, networkId, author, reviewer, reader, other }
}

function propose(f: Fixture, who: Member, overrides: Partial<typeof RESOURCE> & { pageId?: Id<"pages"> } = {}, submit = true) {
  return who.as.mutation(K.proposeResource, { networkId: f.networkId, ...RESOURCE, ...overrides, submit })
}

/** Proposée par `who`, publiée par la relectrice vérifiée de la fixture. */
async function publish(f: Fixture, who: Member = f.author, overrides: Partial<typeof RESOURCE> & { pageId?: Id<"pages"> } = {}) {
  const { resourceId, version } = await propose(f, who, overrides)
  const reviewed = await f.reviewer.as.mutation(K.reviewResource, { networkId: f.networkId, resourceId, expectedVersion: version, decision: "publish" })
  return { resourceId, version: reviewed.version }
}

function list(f: Fixture, who: Member, args: { networkId?: Id<"networks">; city?: string; nationalOnly?: boolean; category?: string } = {}) {
  return who.as.query(K.listResources, { networkId: f.networkId, country: "FR", paginationOpts: FIRST, ...args })
}

function detail(f: Fixture, who: Member, resourceId: string) {
  return who.as.query(K.getResource, { networkId: f.networkId, resourceId })
}

function queue(f: Fixture, who: Member) {
  return who.as.query(K.reviewQueue, { networkId: f.networkId, country: "FR", paginationOpts: FIRST })
}

describe("kit d'arrivée — proposer, relire, publier", () => {
  it("une version soumise n'entre dans le kit qu'après la relecture d'une autre personne ; auteur, relecteur et dates sont exposés", async () => {
    const f = await fixture()
    const proposed = await propose(f, f.author)
    expect({ version: proposed.version, revision: proposed.revision, status: proposed.status }).toEqual({ version: 1, revision: 1, status: "submitted" })
    const { resourceId } = proposed
    // Soumise : ni dans le kit, ni lisible par un lecteur, même par son identifiant.
    expect((await list(f, f.reader)).page).toEqual([])
    expect(await detail(f, f.reader, resourceId)).toBeNull()
    // La file du pays la montre à la relectrice habilitée.
    expect((await queue(f, f.reviewer)).page.map((item) => [item.resourceId, item.status, item.submittedAt])).toEqual([[resourceId, "submitted", NOW]])
    expect((await detail(f, f.reviewer, resourceId))?.viewer).toEqual({ canManage: false, canReview: true, canFlag: false, hasFlagged: false })

    vi.setSystemTime(NOW + 60_000)
    expect(await f.reviewer.as.mutation(K.reviewResource, { networkId: f.networkId, resourceId, expectedVersion: 1, decision: "publish" })).toEqual({ version: 2, status: "published" })
    const cards = (await list(f, f.reader, { city: " paris " })).page
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      resourceId,
      status: "published",
      reviewCause: null,
      category: "banking",
      country: "FR",
      city: "Paris",
      official: false,
      lastVerifiedAt: NOW - 2 * DAY_MS,
      revisedAt: NOW,
      reviewedAt: NOW + 60_000,
      carrier: { kind: "person", person: { displayName: "autrice.kit", handle: "autrice.kit" } },
    })
    const seen = await detail(f, f.reader, resourceId)
    expect(seen).toMatchObject({
      sourceName: "Portail public d'information bancaire",
      // Les identifiants de suivi sont retirés avant l'écriture.
      sourceUrl: "https://www.exemple-public.fr/compte?ref=kit",
      reviewer: { displayName: "relectrice.kit", handle: "relectrice.kit" },
      statusReason: null,
      outdatedFlags: null,
      viewer: { canManage: false, canReview: false, canFlag: true, hasFlagged: false },
    })
    // Aucun identifiant de personne dans la projection.
    expect(JSON.stringify(seen)).not.toContain(f.author.personId)
    expect(JSON.stringify(seen)).not.toContain(f.reviewer.personId)
    // L'autrice gère, sans pouvoir relire ni signaler.
    expect((await detail(f, f.author, resourceId))?.viewer).toEqual({ canManage: true, canReview: false, canFlag: false, hasFlagged: false })
    // Le journal garde la décision ; l'autrice l'apprend par UN avis neutre du rédacteur unique,
    // sans acteur stocké : le relecteur n'y est pas nommé.
    const journal = await f.t.run(async (ctx) => ctx.db.query("kitResourceReviews").take(10))
    expect(journal.map((row) => [row.outcome, row.revision, row.reviewerPersonId])).toEqual([["published", 1, f.reviewer.personId]])
    const notices = await f.t.run(async (ctx) => ctx.db.query("notifications").take(5))
    expect(notices.map((row) => [row.kind, row.recipientPersonId, row.actorPersonId ?? null, row.subjectKitResourceId])).toEqual([["kit_resource_reviewed", f.author.personId, null, resourceId]])
  })

  it("une ville saisie lit ses ressources ; « national » ne lit que les ressources de tout le pays ; la rubrique restreint", async () => {
    const f = await fixture()
    const paris = await publish(f)
    const national = await publish(f, f.author, { title: "Les numéros d'urgence en France", category: "emergency", city: "", body: "Le 112 répond partout en Europe ; le 15 pour une urgence médicale, le 18 pour les pompiers." })
    expect((await list(f, f.reader)).page.map((card) => card.resourceId).sort()).toEqual([paris.resourceId, national.resourceId].sort())
    expect((await list(f, f.reader, { city: "Paris" })).page.map((card) => card.resourceId)).toEqual([paris.resourceId])
    expect((await list(f, f.reader, { nationalOnly: true })).page.map((card) => [card.resourceId, card.city])).toEqual([[national.resourceId, null]])
    expect((await list(f, f.reader, { category: "emergency" })).page.map((card) => card.resourceId)).toEqual([national.resourceId])
    expect((await list(f, f.reader, { city: "Lyon" })).page).toEqual([])
    expect(await refusal(list(f, f.reader, { category: "sports" }))).toBe("arrival_kit_category_invalid")
    expect(await refusal(f.reader.as.query(K.listResources, { networkId: f.networkId, country: "GA", paginationOpts: FIRST }))).toBe("arrival_kit_country_is_home")
  })

  it("relecture par l'auteur refusée ; l'équipe de la page qui porte la ressource ne la relit pas non plus", async () => {
    const f = await fixture()
    const verifiedAuthor = await member(f.t, f.networkId, "autrice.verifiee", { verified: true })
    const own = await propose(f, verifiedAuthor)
    expect(await refusal(verifiedAuthor.as.mutation(K.reviewResource, { networkId: f.networkId, resourceId: own.resourceId, expectedVersion: own.version, decision: "publish" })))
      .toBe("arrival_kit_review_own_resource")
    // Sa propre file ne la lui montre pas ; une autre relectrice la voit.
    expect((await queue(f, verifiedAuthor)).page.map((item) => item.resourceId)).not.toContain(own.resourceId)
    expect((await queue(f, f.reviewer)).page.map((item) => item.resourceId)).toContain(own.resourceId)

    const pageId = await page(f.t, f.networkId, "amicale-kit")
    await sign(f.t, f.networkId, pageId, f.author.personId, "admin")
    await sign(f.t, f.networkId, pageId, f.reviewer.personId, "signatory")
    const carried = await propose(f, f.author, { pageId })
    expect(await refusal(f.reviewer.as.mutation(K.reviewResource, { networkId: f.networkId, resourceId: carried.resourceId, expectedVersion: carried.version, decision: "publish" })))
      .toBe("arrival_kit_review_own_resource")
    const outsider = await member(f.t, f.networkId, "relecteur.externe", { verified: true })
    expect(await outsider.as.mutation(K.reviewResource, { networkId: f.networkId, resourceId: carried.resourceId, expectedVersion: carried.version, decision: "publish" }))
      .toEqual({ version: 2, status: "published" })
    expect((await list(f, f.reader)).page.find((card) => card.resourceId === carried.resourceId)?.carrier).toMatchObject({ kind: "page", page: { handle: "amicale-kit", badge: "community" } })
  })

  it("adresse de source non https refusée ; adresse locale et coordonnées refusées ; rien n'est écrit", async () => {
    const f = await fixture()
    expect(await refusal(propose(f, f.author, { sourceUrl: "http://www.exemple-public.fr/compte" }))).toBe("arrival_kit_source_url_not_https")
    expect(await refusal(propose(f, f.author, { sourceUrl: "javascript:alert(1)" }))).toBe("arrival_kit_source_url_not_https")
    expect(await refusal(propose(f, f.author, { sourceUrl: "https://localhost/compte" }))).toBe("arrival_kit_source_url_invalid")
    expect(await refusal(propose(f, f.author, { title: "Appelez le 06 12 34 56 78" }))).toBe("arrival_kit_contact_details_forbidden")
    expect(await refusal(propose(f, f.author, { category: "sports" }))).toBe("arrival_kit_category_invalid")
    expect(await refusal(propose(f, f.author, { country: "GA" }))).toBe("arrival_kit_country_is_home")
    expect(await f.t.run(async (ctx) => ctx.db.query("kitResources").take(5))).toEqual([])

    // La même règle à la modification : la version lue reste intacte.
    const { resourceId, version } = await propose(f, f.author, {}, false)
    expect(await refusal(f.author.as.mutation(K.updateResource, { networkId: f.networkId, resourceId, expectedVersion: version, ...RESOURCE, sourceUrl: "http://www.exemple-public.fr/", submit: true })))
      .toBe("arrival_kit_source_url_not_https")
    expect(await detail(f, f.author, resourceId)).toMatchObject({ version: 1, revision: 1, status: "draft" })
  })
})

describe("kit d'arrivée — qui relit, qui propose", () => {
  it("relit un membre vérifié ou le signataire vivant d'une page ; un membre déclaré sans page ne voit ni la file ni la soumission", async () => {
    const f = await fixture()
    const { resourceId, version } = await propose(f, f.author)
    expect(await refusal(queue(f, f.reader))).toBe("arrival_kit_reviewer_not_eligible")
    // La soumission n'existe pas pour lui : refus indistinct.
    expect(await refusal(f.reader.as.mutation(K.reviewResource, { networkId: f.networkId, resourceId, expectedVersion: version, decision: "publish" }))).toBe("notFound")
    expect(await f.reader.as.query(K.myKitStanding, { networkId: f.networkId })).toEqual({ canPropose: true, canReview: false, carrierPages: [] })

    // Une invitation non acceptée ne donne rien ; une habilitation acceptée, si.
    const pageId = await page(f.t, f.networkId, "collectif-relecture")
    await sign(f.t, f.networkId, pageId, f.reader.personId, "signatory", false)
    expect((await f.reader.as.query(K.myKitStanding, { networkId: f.networkId })).canReview).toBe(false)
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("pageSignatories").withIndex("by_page_person", (q) => q.eq("pageId", pageId).eq("personId", f.reader.personId)).unique()
      if (row) await ctx.db.patch(row._id, { acceptedAt: NOW })
    })
    const standing = await f.reader.as.query(K.myKitStanding, { networkId: f.networkId })
    expect(standing.canReview).toBe(true)
    expect(standing.carrierPages.map((card) => card.handle)).toEqual(["collectif-relecture"])
    expect((await queue(f, f.reader)).page.map((item) => item.resourceId)).toEqual([resourceId])
    expect(await f.reader.as.mutation(K.reviewResource, { networkId: f.networkId, resourceId, expectedVersion: version, decision: "publish" })).toEqual({ version: 2, status: "published" })
  })

  it("statut insuffisant : un membre en attente lit le kit, mais ne propose, ne signale ni ne relit", async () => {
    const f = await fixture()
    const { resourceId } = await publish(f)
    const waiting = await member(f.t, f.networkId, "en.attente")
    await setStatus(f.t, f.networkId, waiting.personId, "en_attente")
    expect((await list(f, waiting)).page.map((card) => card.resourceId)).toEqual([resourceId])
    expect((await detail(f, waiting, resourceId))?.viewer).toEqual({ canManage: false, canReview: false, canFlag: false, hasFlagged: false })
    expect(await waiting.as.query(K.myKitStanding, { networkId: f.networkId })).toEqual({ canPropose: false, canReview: false, carrierPages: [] })
    expect(await refusal(propose(f, waiting))).toBe("statusInsufficient")
    expect(await refusal(waiting.as.mutation(K.flagResourceOutdated, { networkId: f.networkId, resourceId, revision: 1, reason: "link_broken" }))).toBe("statusInsufficient")
    expect(await refusal(queue(f, waiting))).toBe("arrival_kit_reviewer_not_eligible")
  })

  it("autre réseau : refus indistinct, et aucune ressource d'ailleurs ne se lit d'ici", async () => {
    const f = await fixture()
    expect(await refusal(list(f, f.reader, { networkId: f.root }))).toBe("notFound")
    expect(["notFound", "statusInsufficient"]).toContain(await refusal(f.author.as.mutation(K.proposeResource, { networkId: f.root, ...RESOURCE, submit: true })))
    const foreign = await insertResource(f.t, f.root, f.author.personId)
    expect(await detail(f, f.reader, foreign)).toBeNull()
    expect((await list(f, f.reader)).page).toEqual([])
    expect(await refusal(f.reviewer.as.mutation(K.markResourceForReview, { networkId: f.networkId, resourceId: foreign, expectedVersion: 1, reason: "Les tarifs ont changé cette année." }))).toBe("notFound")
    expect(await refusal(f.reader.as.mutation(K.flagResourceOutdated, { networkId: f.networkId, resourceId: foreign, revision: 1, reason: "other" }))).toBe("notFound")
    expect(await refusal(f.author.as.mutation(K.withdrawResource, { networkId: f.networkId, resourceId: foreign, expectedVersion: 1 }))).toBe("notFound")
    // Un identifiant illisible rend le même `null`.
    expect(await detail(f, f.reader, "identifiant-inconnu")).toBeNull()
  })

  it("une page officielle le dit sur ses ressources ; une page de communauté ou une personne, jamais ; une entreprise ne porte rien", async () => {
    const f = await fixture()
    const agent = await member(f.t, f.networkId, "agent.poste", { loa: 2 })
    const post = await page(f.t, f.networkId, "poste-consulaire-kit", { ownerKind: "institution", trust: "official" })
    await sign(f.t, f.networkId, post, agent.personId, "admin")
    const fromPost = await publish(f, agent, { pageId: post, title: "S'inscrire au registre consulaire", category: "procedures", city: "" })
    const collective = await page(f.t, f.networkId, "collectif-kit")
    await sign(f.t, f.networkId, collective, f.author.personId, "admin")
    const fromCollective = await publish(f, f.author, { pageId: collective, title: "Trouver une colocation à Paris", category: "housing" })
    const personal = await publish(f, f.other, { title: "Se repérer dans les transports", category: "transport" })

    const cards = new Map((await list(f, f.reader)).page.map((card) => [card.resourceId, card]))
    expect(cards.get(fromPost.resourceId)).toMatchObject({ official: true, carrier: { kind: "page", page: { handle: "poste-consulaire-kit", badge: "official", ownerKind: "institution" } } })
    expect(cards.get(fromCollective.resourceId)).toMatchObject({ official: false, carrier: { kind: "page", page: { handle: "collectif-kit", badge: "community" } } })
    expect(cards.get(personal.resourceId)).toMatchObject({ official: false, carrier: { kind: "person", person: { handle: "autre.kit" } } })
    expect((await agent.as.query(K.myKitStanding, { networkId: f.networkId })).carrierPages.map((card) => [card.handle, card.badge])).toEqual([["poste-consulaire-kit", "official"]])

    const company = await page(f.t, f.networkId, "entreprise-kit", { ownerKind: "company" })
    await sign(f.t, f.networkId, company, f.author.personId, "admin")
    expect(await refusal(propose(f, f.author, { pageId: company }))).toBe("arrival_kit_page_kind_not_allowed")
    // Une page dont on n'est pas signataire : refus indistinct.
    expect(await refusal(propose(f, f.reader, { pageId: collective }))).toBe("notFound")
    // Une page retirée ne porte plus rien : sa ressource quitte le kit (jamais rabattue sur son signataire).
    await f.t.run(async (ctx) => { await ctx.db.patch(collective, { status: "inactive" }) })
    expect((await list(f, f.reader)).page.map((card) => card.resourceId)).not.toContain(fromCollective.resourceId)
    expect(await detail(f, f.reader, fromCollective.resourceId)).toBeNull()
  })
})

describe("kit d'arrivée — signalements et ancienneté", () => {
  it("double signalement refusé ; au seuil, la ressource se lit « à revoir » ; une nouvelle version repart sans signalement", async () => {
    const f = await fixture()
    const { resourceId } = await publish(f)
    const flag = (who: Member, reason: string, revision = 1) => who.as.mutation(K.flagResourceOutdated, { networkId: f.networkId, resourceId, revision, reason })
    expect(await flag(f.reader, "link_broken")).toEqual({ outdatedFlags: 1, status: "published" })
    expect(await refusal(flag(f.reader, "information_changed"))).toBe("arrival_kit_already_flagged")
    expect((await detail(f, f.reader, resourceId))?.viewer).toMatchObject({ canFlag: false, hasFlagged: true })
    expect(await refusal(flag(f.author, "link_broken"))).toBe("arrival_kit_flag_own_resource")
    expect(await refusal(flag(f.other, "spam"))).toBe("arrival_kit_outdated_reason_invalid")
    expect(await refusal(flag(f.other, "other", 2))).toBe("arrival_kit_version_conflict")

    expect(await flag(f.other, "information_changed")).toEqual({ outdatedFlags: 2, status: "published" })
    const third = await member(f.t, f.networkId, "troisieme.kit")
    expect(await flag(third, "service_closed")).toEqual({ outdatedFlags: ARRIVAL_KIT_OUTDATED_FLAG_THRESHOLD, status: "needs_review" })
    expect((await list(f, f.reader)).page[0]).toMatchObject({ resourceId, status: "needs_review", reviewCause: "flags" })
    // Le compte se lit par qui gère ou relit, jamais par un lecteur.
    expect((await detail(f, f.author, resourceId))?.outdatedFlags).toBe(3)
    expect((await detail(f, f.reviewer, resourceId))?.outdatedFlags).toBe(3)
    expect((await detail(f, f.reader, resourceId))?.outdatedFlags).toBeNull()
    // Un signalement ne périme pas la version de la ligne : l'autrice modifie à la version lue.
    const current = await detail(f, f.author, resourceId)
    expect(current?.version).toBe(2)
    const updated = await f.author.as.mutation(K.updateResource, {
      networkId: f.networkId, resourceId, expectedVersion: 2, ...RESOURCE, summary: "Les pièces demandées, les délais et les frais habituels pour un premier compte.", submit: true,
    })
    expect(updated).toEqual({ version: 3, revision: 2, status: "submitted" })
    expect((await list(f, f.reader)).page).toEqual([])
    await f.reviewer.as.mutation(K.reviewResource, { networkId: f.networkId, resourceId, expectedVersion: 3, decision: "publish" })
    expect((await list(f, f.reader)).page[0]).toMatchObject({ resourceId, status: "published", revision: 2, reviewCause: null })
    expect(await flag(f.reader, "other", 2)).toEqual({ outdatedFlags: 1, status: "published" })
    expect(await f.t.run(async (ctx) => ctx.db.query("kitOutdatedFlags").take(10))).toHaveLength(4)
  })

  it("ancienneté : douze mois après la vérification déclarée, la ressource se lit « à revoir » ; une vérification trop ancienne ou future est refusée", async () => {
    const f = await fixture()
    expect(await refusal(propose(f, f.author, { lastVerifiedAt: Date.UTC(2025, 9, 1) }))).toBe("arrival_kit_verified_at_too_old")
    expect(await refusal(propose(f, f.author, { lastVerifiedAt: NOW + 3 * DAY_MS }))).toBe("arrival_kit_verified_at_in_future")
    const { resourceId } = await publish(f)
    expect((await list(f, f.reader)).page[0]).toMatchObject({ resourceId, status: "published", reviewCause: null })
    // La vérification vieillit (l'horloge reste : une session de test dure sept jours).
    await f.t.run(async (ctx) => { await ctx.db.patch(resourceId, { lastVerifiedAt: Date.UTC(2025, 8, 1) }) })
    expect((await list(f, f.reader)).page[0]).toMatchObject({ resourceId, status: "needs_review", reviewCause: "age", reviewDueAt: Date.UTC(2026, 8, 1) })
    expect((await detail(f, f.reader, resourceId))?.status).toBe("needs_review")

    // Un brouillon dont la vérification a vieilli ne se soumet pas tel quel.
    const draft = await propose(f, f.author, {}, false)
    await f.t.run(async (ctx) => { await ctx.db.patch(draft.resourceId, { lastVerifiedAt: Date.UTC(2025, 8, 1) }) })
    expect(await refusal(f.author.as.mutation(K.submitResource, { networkId: f.networkId, resourceId: draft.resourceId, expectedVersion: draft.version }))).toBe("arrival_kit_verified_at_too_old")
  })
})

describe("kit d'arrivée — cycle, versions et retrait", () => {
  it("renvoi motivé à la version lue ; brouillon invisible d'autrui ; nouvelle soumission ; retrait terminal", async () => {
    const f = await fixture()
    const { resourceId } = await propose(f, f.author)
    const reason = "Précisez les pièces demandées pour un étudiant."
    const review = (who: Member, expectedVersion: number, decision: "publish" | "return", text?: string) =>
      who.as.mutation(K.reviewResource, { networkId: f.networkId, resourceId, expectedVersion, decision, ...(text === undefined ? {} : { reason: text }) })
    expect(await refusal(review(f.reviewer, 0, "return", reason))).toBe("arrival_kit_version_conflict")
    expect(await refusal(review(f.reviewer, 1, "return"))).toBe("arrival_kit_reason_too_short")
    expect(await review(f.reviewer, 1, "return", `  ${reason}  `)).toEqual({ version: 2, status: "draft" })
    // L'autrice lit le motif ; qui a renvoyé n'est pas nommé.
    expect(await detail(f, f.author, resourceId)).toMatchObject({ status: "draft", statusReason: reason, reviewer: null, viewer: { canManage: true, canReview: false } })
    expect(await detail(f, f.reader, resourceId)).toBeNull()
    expect(await refusal(review(f.reviewer, 2, "publish"))).toBe("notFound")

    expect(await f.author.as.mutation(K.submitResource, { networkId: f.networkId, resourceId, expectedVersion: 2 })).toEqual({ version: 3, status: "submitted" })
    expect(await refusal(f.author.as.mutation(K.submitResource, { networkId: f.networkId, resourceId, expectedVersion: 3 }))).toBe("arrival_kit_transition_invalid")
    // Une autre personne ne modifie ni ne retire : refus indistinct.
    expect(await refusal(f.other.as.mutation(K.withdrawResource, { networkId: f.networkId, resourceId, expectedVersion: 3 }))).toBe("notFound")
    expect(await refusal(f.other.as.mutation(K.updateResource, { networkId: f.networkId, resourceId, expectedVersion: 3, ...RESOURCE, submit: false }))).toBe("notFound")

    expect(await f.author.as.mutation(K.withdrawResource, { networkId: f.networkId, resourceId, expectedVersion: 3 })).toEqual({ version: 4, status: "archived" })
    expect(await refusal(f.author.as.mutation(K.updateResource, { networkId: f.networkId, resourceId, expectedVersion: 4, ...RESOURCE, submit: true }))).toBe("arrival_kit_archived")
    expect((await detail(f, f.author, resourceId))?.viewer.canManage).toBe(false)
    expect((await f.author.as.query(K.myResources, { networkId: f.networkId, paginationOpts: FIRST })).page.map((item) => [item.resourceId, item.status])).toEqual([[resourceId, "archived"]])
    expect((await f.other.as.query(K.myResources, { networkId: f.networkId, paginationOpts: FIRST })).page).toEqual([])
    const journal = await f.t.run(async (ctx) => ctx.db.query("kitResourceReviews").withIndex("by_resource_and_createdAt", (q) => q.eq("resourceId", resourceId)).take(10))
    expect(journal.map((row) => [row.outcome, row.reason])).toEqual([["returned", reason]])
  })

  it("marquer « à revoir » : une relecture habilitée, motif obligatoire ; la ressource reste lue, avec son avertissement", async () => {
    const f = await fixture()
    const { resourceId, version } = await publish(f)
    const second = await member(f.t, f.networkId, "relecteur.second", { verified: true })
    const reason = "Les tarifs ont changé cette année."
    const mark = (who: Member, expectedVersion: number, text: string) => who.as.mutation(K.markResourceForReview, { networkId: f.networkId, resourceId, expectedVersion, reason: text })
    expect(await refusal(mark(second, version, "court"))).toBe("arrival_kit_reason_too_short")
    expect(await refusal(mark(f.reader, version, reason))).toBe("arrival_kit_reviewer_not_eligible")
    expect(await refusal(mark(f.author, version, reason))).toBe("arrival_kit_reviewer_not_eligible")
    expect(await mark(second, version, reason)).toEqual({ version: version + 1, status: "needs_review" })
    expect((await list(f, f.reader)).page[0]).toMatchObject({ resourceId, status: "needs_review", reviewCause: "reviewer" })
    expect((await detail(f, f.reader, resourceId))?.statusReason).toBeNull()
    expect((await detail(f, f.author, resourceId))?.statusReason).toBe(reason)
    expect(await refusal(mark(second, version + 1, reason))).toBe("arrival_kit_transition_invalid")
    const journal = await f.t.run(async (ctx) => ctx.db.query("kitResourceReviews").withIndex("by_resource_and_createdAt", (q) => q.eq("resourceId", resourceId)).take(10))
    expect(journal.map((row) => row.outcome)).toEqual(["published", "needs_review"])
  })

  it("une personne garde au plus trente ressources non archivées ; une ressource archivée ne compte plus", async () => {
    const f = await fixture()
    for (let index = 0; index < ARRIVAL_KIT_RESOURCES_PER_PROPOSER_MAX; index += 1) {
      await insertResource(f.t, f.networkId, f.author.personId, { status: "draft", listed: false, title: `Brouillon fictif ${index}` })
    }
    expect(await refusal(propose(f, f.author))).toBe("arrival_kit_resource_limit_reached")
    await f.t.run(async (ctx) => {
      const one = await ctx.db.query("kitResources").withIndex("by_network_proposer_status", (q) => q.eq("networkId", f.networkId).eq("proposedByPersonId", f.author.personId).eq("status", "draft")).first()
      if (one) await ctx.db.patch(one._id, { status: "archived", archivedAt: NOW })
    })
    expect((await propose(f, f.author)).status).toBe("submitted")
  })
})

describe("kit d'arrivée — état de modération (G9), dit à qui gère seulement", () => {
  it("l'autrice lit « en relecture préalable » puis « retirée » dans sa fiche et ses propositions ; un tiers ne lit jamais l'état", async () => {
    const f = await fixture()
    const { resourceId } = await publish(f)
    const mine = async () => (await f.author.as.query(K.myResources, { networkId: f.networkId, paginationOpts: FIRST })).page.map((item) => [item.resourceId, item.moderation])
    // Publiée dès l'écriture (aucune politique du réseau) : l'autrice le lit ; la relectrice et un lecteur, jamais.
    expect((await detail(f, f.author, resourceId))?.moderation).toBe("published")
    expect(await mine()).toEqual([[resourceId, "published"]])
    expect((await detail(f, f.reviewer, resourceId))?.moderation).toBeNull()
    expect((await detail(f, f.reader, resourceId))?.moderation).toBeNull()
    // Le kit public ne porte pas l'état.
    expect((await list(f, f.reader)).page[0]).not.toHaveProperty("moderation")

    await moderate(f.t, f.networkId, resourceId, "pending_review", { ownerPersonId: f.author.personId })
    expect((await detail(f, f.author, resourceId))?.moderation).toBe("pending_review")
    expect(await mine()).toEqual([[resourceId, "pending_review"]])
    // En relecture préalable, la ressource n'est servie à aucun tiers : ni fiche, ni état.
    expect(await detail(f, f.reviewer, resourceId)).toBeNull()
    expect(await detail(f, f.reader, resourceId)).toBeNull()

    await moderate(f.t, f.networkId, resourceId, "removed", { ownerPersonId: f.author.personId })
    expect(await detail(f, f.author, resourceId)).toMatchObject({ resourceId, moderation: "removed", viewer: { canManage: true } })
    expect(await mine()).toEqual([[resourceId, "removed"]])
    expect(await detail(f, f.reader, resourceId)).toBeNull()
    expect((await list(f, f.reader)).page).toEqual([])
  })

  it("portée par une page : son équipe vivante lit l'état ; qui ne signe plus la page ne le lit pas, et ne garde que ce que le kit public lui sert", async () => {
    const f = await fixture()
    const pageId = await page(f.t, f.networkId, "collectif-moderation")
    await sign(f.t, f.networkId, pageId, f.author.personId, "admin")
    await sign(f.t, f.networkId, pageId, f.other.personId, "signatory")
    const { resourceId } = await publish(f, f.author, { pageId, title: "Trouver une colocation à Paris", category: "housing" })
    expect((await detail(f, f.other, resourceId))?.moderation).toBe("published")

    // L'autrice ne signe plus la page : elle ne gère plus la ressource, qui reste dans ses propositions sans état.
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("pageSignatories").withIndex("by_page_person", (q) => q.eq("pageId", pageId).eq("personId", f.author.personId)).unique()
      if (row) await ctx.db.patch(row._id, { acceptedAt: undefined })
    })
    const mine = async () => (await f.author.as.query(K.myResources, { networkId: f.networkId, paginationOpts: FIRST })).page.map((item) => [item.resourceId, item.moderation])
    expect(await mine()).toEqual([[resourceId, null]])
    expect((await detail(f, f.author, resourceId))?.moderation).toBeNull()

    // L'état appartient à la page : son équipe le lit ; l'ancienne signataire ne lit plus rien de la ressource.
    await moderate(f.t, f.networkId, resourceId, "pending_review", { ownerPageId: pageId })
    expect((await detail(f, f.other, resourceId))?.moderation).toBe("pending_review")
    expect(await mine()).toEqual([])
    expect(await detail(f, f.author, resourceId)).toBeNull()

    await moderate(f.t, f.networkId, resourceId, "removed", { ownerPageId: pageId })
    expect(await detail(f, f.other, resourceId)).toMatchObject({ resourceId, moderation: "removed", viewer: { canManage: true } })
    expect(await mine()).toEqual([])
    expect(await detail(f, f.reader, resourceId)).toBeNull()
  })
})

describe("kit d'arrivée — chercher par mots (ET-04)", () => {
  const found = async (f: Fixture, who: Member, args: { query: string; city?: string; nationalOnly?: boolean; category?: string }) =>
    (await who.as.query(K.listResources, { networkId: f.networkId, country: "FR", paginationOpts: FIRST, ...args })).page.map((card) => card.resourceId)

  it("le titre et le résumé se cherchent, repliés ; la zone et la rubrique restreignent ; une soumission non relue reste absente", async () => {
    const f = await fixture()
    const paris = await publish(f)
    const national = await publish(f, f.author, { title: "Les numéros d'urgence en France", summary: "Qui appeler, et quand : SAMU, pompiers, police.", category: "emergency", city: "", body: "Le 112 répond partout en Europe ; le 15 pour une urgence médicale, le 18 pour les pompiers." })
    const pending = await propose(f, f.author, { title: "Ouvrir un compte en ligne", summary: "Les banques en ligne et leurs pièces demandées." })

    expect(await found(f, f.reader, { query: "Pièces" })).toEqual([paris.resourceId])
    expect(await found(f, f.reader, { query: "samu" })).toEqual([national.resourceId])
    expect(await found(f, f.reader, { query: "samu", city: "Paris" })).toEqual([])
    expect(await found(f, f.reader, { query: "samu", nationalOnly: true })).toEqual([national.resourceId])
    expect(await found(f, f.reader, { query: "compte", category: "emergency" })).toEqual([])
    // Le contenu entier n'est pas cherché : seuls le titre et le résumé le sont.
    expect(await found(f, f.reader, { query: "agence" })).toEqual([])
    expect(await found(f, f.reader, { query: "en ligne" })).not.toContain(pending.resourceId)

    const stored = await f.t.run(async (ctx) => ctx.db.get(paris.resourceId))
    expect(stored?.searchText).toBe("ouvrir un compte bancaire a paris les pieces demandees et les delais habituels pour un premier compte")
    expect(await refusal(found(f, f.reader, { query: "x".repeat(101) }))).toBe("arrival_kit_query_too_long")
  })

  it("une ressource en relecture de modération ne se trouve pas ; une autre version suit son nouveau texte", async () => {
    const f = await fixture()
    const paris = await publish(f)
    await moderate(f.t, f.networkId, paris.resourceId, "pending_review", { ownerPersonId: f.author.personId })
    expect(await found(f, f.reader, { query: "bancaire" })).toEqual([])
    await moderate(f.t, f.networkId, paris.resourceId, "removed", { ownerPersonId: f.author.personId })
    expect(await found(f, f.reader, { query: "bancaire" })).toEqual([])

    const second = await publish(f, f.other, { title: "Assurance habitation étudiante", summary: "Les garanties exigées par un bailleur pour un studio." })
    expect(await found(f, f.reader, { query: "bailleur" })).toEqual([second.resourceId])
  })
})
