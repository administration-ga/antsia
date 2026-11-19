// @vitest-environment edge-runtime
/**
 * AS-10 / PG-08 — la garde de l'équipe d'une page (décision du 19/11/2026).
 *
 * Le modérateur d'une page ne parle JAMAIS en son nom : `liveSignatoryRole` le rend nul, et tout
 * lecteur existant reste fermé (défaut fermé). Ce fichier le prouve famille par famille, sur une
 * mutation (ou, pour la messagerie, la lecture de la boîte de la page qui précède toute réponse) :
 * le modérateur ACCEPTÉ est refusé, et un éditeur (`signatory`) ou l'administrateur réussit avec
 * les MÊMES arguments — un refus qui viendrait d'arguments faux ne passerait pas pour une garde.
 * L'éditeur, lui, est refusé en gestion (identité, équipe, revendication). Les droits de toute
 * l'équipe (lire une note aux abonnés) restent ouverts au modérateur.
 */
import { engineErrorAppRule, engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Member = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }

const NOW = Date.UTC(2026, 10, 19, 10)
const HOUR = 3_600_000
const DAY = 24 * HOUR
const FIRST = { numItems: 10, cursor: null }

/** Données fictives, une par famille (mêmes formes que les tests de chaque tranche). */
const SERVICE = {
  title: "Accompagnement aux démarches",
  description: "Aide à constituer un dossier administratif, sur rendez-vous.",
  category: "beauty" as const,
  country: "FR",
  city: "Lyon",
  delivery: "onsite" as const,
  languages: ["fr" as const],
  durationMinutes: 60,
  pricing: { mode: "from" as const, amountMinor: 3000, currency: "EUR" },
}
const JOB = {
  title: "Animateur ou animatrice d'ateliers",
  description: "Animer les ateliers du samedi pour les familles nouvellement arrivées.",
  contract: "cdi" as const,
  country: "FR",
  city: "Lyon",
  workMode: "onsite" as const,
  languages: ["fr" as const],
  payRange: { minMinor: 200000, maxMinor: 240000, currency: "EUR", period: "month" as const },
  closesAt: null,
}
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
const RESOURCE = {
  title: "Ouvrir un compte bancaire à Lyon",
  summary: "Les pièces demandées et les délais habituels pour un premier compte.",
  body: "Prenez rendez-vous en agence avec une pièce d'identité, un justificatif de domicile et votre titre de séjour.",
  category: "banking" as const,
  country: "FR",
  city: "Lyon",
  sourceName: "Portail public d'information bancaire",
  sourceUrl: "https://www.exemple-public.fr/compte",
  lastVerifiedAt: NOW - 2 * DAY,
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

/** Un membre DÉCLARÉ de DIASPORALE (IDN de garantie 1), profil publié. */
async function member(t: T, networkId: Id<"networks">, handle: string): Promise<Member> {
  const as = t.withIdentity({ subject: `team-roles-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await t.run(async (ctx) => {
    await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `team-roles-idn-${personId}`, loa: 1, nationality: "GA", linkedAt: NOW })
  })
  await as.mutation(api.modules.diaspora.membership.joinDiasporale, { networkId, facet: { countryOfResidence: "FR", city: "Lyon" } })
  return { as, personId, handle }
}

/** Le refus d'un appel — règle d'application, règle du domaine, puis code du moteur ; `null` s'il réussit. */
async function refusal(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise
  } catch (error) {
    return engineErrorAppRule(error)?.appRule ?? engineErrorRule(error)?.rule ?? engineErrorCode(error) ?? "unknown"
  }
  return null
}

/** Une association de DIASPORALE et son équipe ACCEPTÉE : une administratrice, un éditeur, une modératrice. */
async function fixture() {
  const t = testConvex()
  await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  const admin = await member(t, networkId, "equipe-admin")
  const editor = await member(t, networkId, "equipe-editeur")
  const moderator = await member(t, networkId, "equipe-moderatrice")
  const outsider = await member(t, networkId, "equipe-tiers")
  const handle = "association-equipe-recette"
  const pageId = await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", {
      networkId, handle, name: "Association de recette", ownerKind: "association", country: "FR", city: "Lyon",
      trust: "community", trustRank: 0, visibility: "network", onRoot: false, status: "active",
      searchText: "association recette", createdAt: NOW, updatedAt: NOW,
    })
    for (const [person, role] of [[admin, "admin"], [editor, "signatory"], [moderator, "moderator"]] as const) {
      await ctx.db.insert("pageSignatories", { networkId, pageId, personId: person.personId, role, acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    }
    await ctx.db.insert("moderationPolicies", { networkId, surface: "event", preReview: false, maxLinks: 2, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    return pageId
  })
  return { t, networkId, pageId, handle, admin, editor, moderator, outsider }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

/** Chaque famille : le geste, joué par une personne ; `allowed` est la personne qui le réussit (éditeur, ou administratrice pour la gestion). */
type Family = { name: string; act: (f: Fixture, who: Member, step: number) => Promise<unknown>; allowed: "editor" | "admin"; moderatorRefusal: string; editorRefusal?: string }

const FAMILIES: Family[] = [
  { name: "publication", allowed: "editor", moderatorRefusal: "pageRoleRequired", act: (f, who, step) => who.as.mutation(api.modules.pages.pages.publishAsPage, { networkId: f.networkId, pageId: f.pageId, body: `Communiqué de l'association ${step}` }) },
  { name: "identité", allowed: "admin", moderatorRefusal: "pageRoleRequired", editorRefusal: "pageRoleRequired", act: (f, who, step) => who.as.mutation(api.modules.pages.identity.updatePageIdentity, { networkId: f.networkId, pageId: f.pageId, description: `Association d'entraide, présentation ${step}.` }) },
  { name: "équipe", allowed: "admin", moderatorRefusal: "pageRoleRequired", editorRefusal: "pageRoleRequired", act: (f, who) => who.as.mutation(api.modules.pages.signatories.grantPageRole, { networkId: f.networkId, pageId: f.pageId, handle: f.outsider.handle, role: "moderator" }) },
  // L'administratrice passe la garde du rôle : seul le défaut de pièces l'arrête (aucun dépôt ici).
  { name: "revendication", allowed: "admin", moderatorRefusal: "PAGE_ALREADY_CLAIMED", editorRefusal: "PAGE_ALREADY_CLAIMED", act: (f, who) => who.as.mutation(api.modules.pages.claims.requestPageClaim, { networkId: f.networkId, pageId: f.pageId, evidence: [] }) },
  { name: "direct", allowed: "editor", moderatorRefusal: "pageRoleRequired", act: (f, who, step) => who.as.mutation(api.modules.live.sessions.create, { networkId: f.networkId, title: `Point de l'association ${step}`, audience: "followers", pageId: f.pageId, chatMode: "open" }) },
  { name: "évènement", allowed: "editor", moderatorRefusal: "association_event_access_required", act: (f, who, step) => who.as.mutation(api.modules.events.pageEvents.create, { networkId: f.networkId, pageId: f.pageId, title: "Rencontre associative", description: "Échange entre membres.", location: "Lyon", startAt: NOW + DAY, endAt: NOW + DAY + 2 * HOUR, timeZone: "Europe/Paris", audience: "association", idempotencyKey: `evenement-equipe-${step}` }) },
  { name: "messagerie", allowed: "editor", moderatorRefusal: "notFound", act: (f, who) => who.as.query(api.modules.contextualMessaging.threads.paginateForPage, { networkId: f.networkId, pageId: f.pageId, paginationOpts: FIRST }) },
  { name: "services", allowed: "editor", moderatorRefusal: "notFound", act: (f, who) => who.as.mutation(api.modules.diaspora.services.createOffer, { networkId: f.networkId, pageId: f.pageId, ...SERVICE, publish: true }) },
  { name: "emplois", allowed: "editor", moderatorRefusal: "notFound", act: (f, who) => who.as.mutation(api.modules.diaspora.jobs.createJobOffer, { networkId: f.networkId, pageId: f.pageId, ...JOB, publish: true }) },
  { name: "entraide", allowed: "editor", moderatorRefusal: "notFound", act: (f, who) => who.as.mutation(api.modules.diaspora.mutualAid.createMission, { networkId: f.networkId, pageId: f.pageId, ...MISSION }) },
  { name: "kit", allowed: "editor", moderatorRefusal: "notFound", act: (f, who) => who.as.mutation(api.modules.diaspora.arrivalKit.proposeResource, { networkId: f.networkId, pageId: f.pageId, ...RESOURCE, submit: false }) },
  {
    name: "adhésions",
    allowed: "editor",
    moderatorRefusal: "notFound",
    act: async (f, who, step) => {
      const applicant = await member(f.t, f.networkId, `candidate-${step}`)
      const row = await applicant.as.mutation(api.modules.diaspora.associations.requestAssociationMembership, { networkId: f.networkId, pageId: f.pageId })
      return await who.as.mutation(api.modules.diaspora.associations.decideAssociationMembership, { networkId: f.networkId, membershipId: row.membershipId, expectedVersion: row.version, decision: "accept" })
    },
  },
]

describe("AS-10 / PG-08 — un modérateur accepté ne parle jamais au nom de la page", () => {
  it.each(FAMILIES.map((family) => [family.name, family] as const))("%s : le modérateur est refusé, l'éditeur ou l'administratrice réussit avec les mêmes arguments", async (_name, family) => {
    const f = await fixture()
    expect(await refusal(family.act(f, f.moderator, 1))).toBe(family.moderatorRefusal)
    if (family.editorRefusal !== undefined) expect(await refusal(family.act(f, f.editor, 2))).toBe(family.editorRefusal)
    const allowed = family.allowed === "admin" ? f.admin : f.editor
    const outcome = await refusal(family.act(f, allowed, 3))
    // La revendication : l'administratrice franchit la garde du rôle, puis bute sur l'absence de pièces.
    expect(outcome).toBe(family.name === "revendication" ? "PAGE_CLAIM_EVIDENCE_COUNT" : null)
  })
})

describe("AS-10 / PG-08 — les droits de toute l'équipe restent ouverts au modérateur", () => {
  it("il lit une note réservée aux abonnés de la page ; un membre qui ne la suit pas non", async () => {
    const f = await fixture()
    const { postId } = await f.admin.as.mutation(api.modules.pages.pages.publishAsPage, { networkId: f.networkId, pageId: f.pageId, body: "Note aux abonnés de l'association", audience: "followers" })
    expect((await f.moderator.as.query(api.modules.posts.posts.getPost, { networkId: f.networkId, postId }))._id).toBe(postId)
    expect(await refusal(f.outsider.as.query(api.modules.posts.posts.getPost, { networkId: f.networkId, postId }))).toBe("notFound")
  })

  it("partie liée comme toute l'équipe : il ne demande pas un service de sa page et ne candidate pas à ses offres d'emploi", async () => {
    const f = await fixture()
    const { offerId } = await f.editor.as.mutation(api.modules.diaspora.services.createOffer, { networkId: f.networkId, pageId: f.pageId, ...SERVICE, publish: true })
    const request = (who: Member, key: string) => who.as.mutation(api.modules.diaspora.serviceRequests.createServiceRequest, {
      networkId: f.networkId, offerId, offerVersion: 1, need: "Constituer un dossier de titre de séjour.", windows: [{ startAt: NOW + DAY, endAt: NOW + DAY + 4 * HOUR }],
      timeZone: "Europe/Paris", shareIdentityWithPage: true, idempotencyKey: key,
    })
    expect(await refusal(request(f.moderator, "6f1c5c2e-2c8e-4a77-9d0e-6a1b2c3d4e01"))).toBe("request_own_page")
    expect(await refusal(request(f.outsider, "6f1c5c2e-2c8e-4a77-9d0e-6a1b2c3d4e02"))).toBeNull()
    const { jobId } = await f.editor.as.mutation(api.modules.diaspora.jobs.createJobOffer, { networkId: f.networkId, pageId: f.pageId, ...JOB, publish: true })
    const apply = (who: Member, key: string) => who.as.mutation(api.modules.diaspora.jobs.applyToJobOffer, {
      networkId: f.networkId, jobId, offerVersion: 1, message: "Bonjour, cinq ans d'animation d'ateliers et l'envie de rejoindre l'association.", shareName: true, shareTalentProfile: false, idempotencyKey: key,
    })
    expect(await refusal(apply(f.moderator, "candidature-equipe-0001"))).toBe("job_application_own_page")
    expect(await refusal(apply(f.outsider, "candidature-equipe-0002"))).toBeNull()
  })

  it("il voit l'équipe et s'en retire ; la page le dit dans `teamRole`, jamais dans `role`", async () => {
    const f = await fixture()
    expect((await f.moderator.as.query(api.modules.pages.signatories.listPageSignatories, { networkId: f.networkId, pageId: f.pageId })).map((row) => row.role)).toEqual(["admin", "signatory", "moderator"])
    expect((await f.moderator.as.query(api.modules.pages.pages.getPage, { networkId: f.networkId, handle: f.handle }))?.viewer).toEqual({ following: false, role: null, teamRole: "moderator" })
    expect(await f.moderator.as.mutation(api.modules.pages.signatories.revokePageRole, { networkId: f.networkId, pageId: f.pageId, personId: f.moderator.personId })).toEqual({ revoked: true })
    expect((await f.moderator.as.query(api.modules.pages.pages.getPage, { networkId: f.networkId, handle: f.handle }))?.viewer).toEqual({ following: false, role: null, teamRole: null })
  })

  it("le dernier administrateur reste protégé : un second administrateur devenu modérateur ne gère plus, la dernière ne part pas", async () => {
    const f = await fixture()
    const second = await member(f.t, f.networkId, "equipe-second-admin")
    await f.t.run(async (ctx) => {
      await ctx.db.insert("pageSignatories", { networkId: f.networkId, pageId: f.pageId, personId: second.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    })
    expect(await f.admin.as.mutation(api.modules.pages.signatories.grantPageRole, { networkId: f.networkId, pageId: f.pageId, handle: second.handle, role: "moderator" })).toMatchObject({ role: "moderator", invited: false })
    expect(await refusal(second.as.mutation(api.modules.pages.signatories.grantPageRole, { networkId: f.networkId, pageId: f.pageId, handle: f.admin.handle, role: "moderator" }))).toBe("pageRoleRequired")
    expect(await refusal(f.admin.as.mutation(api.modules.pages.signatories.revokePageRole, { networkId: f.networkId, pageId: f.pageId, personId: f.admin.personId }))).toBe("PAGE_LAST_ADMIN")
  })
})
