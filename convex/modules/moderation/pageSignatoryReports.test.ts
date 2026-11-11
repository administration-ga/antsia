// @vitest-environment edge-runtime
/**
 * antsia#114, point 2 (MD-02 de DIASPORALE) — un signataire VIVANT d'une page, quel que soit son rôle
 * (administrateur ou signataire), n'ouvre aucun dossier sur ce qui parle au nom de SA page, même par un appel
 * direct à `moderation.cases.report` : la page elle-même, un évènement qu'elle organise, une publication en sa
 * voix. Le refus est indistinct (`notFound`, comme une cible inconnue). Un membre sans rôle signale ; une
 * personne qui s'est retirée de la page, ou dont l'invitation attend, n'a plus (ou pas encore) de voix et
 * signale comme tout lecteur.
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons"> }
type Target = { kind: "page"; id: Id<"pages"> } | { kind: "event"; id: Id<"events"> } | { kind: "post"; id: Id<"posts"> }
const M = api.modules.moderation.cases
const NOW = Date.UTC(2026, 10, 11, 10)
const HOUR = 3_600_000

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function errorCode(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise
    return null
  } catch (error) {
    return engineErrorCode(error) ?? "unknown"
  }
}

/** Une personne publiée ; `join` la fait entrer dans le réseau visé (la racine, ou DIASPORALE). */
async function person(t: T, handle: string, join: (as: Person["as"], personId: Id<"persons">) => Promise<unknown>): Promise<Person> {
  const as = t.withIdentity({ subject: `md02-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await join(as, personId)
  return { as, personId }
}

/**
 * La page et son équipe : une administratrice, un signataire, une rédactrice (signataire, autrice des
 * publications : son refus tient déjà à l'auto-signalement), une personne qui s'est retirée de l'équipe, une
 * invitée qui n'a pas encore accepté — et un membre sans rôle. La page n'a pas de créateur posé : aucun refus
 * ne vient de la règle du propriétaire.
 */
async function team(t: T, networkId: Id<"networks">, join: (as: Person["as"], personId: Id<"persons">) => Promise<unknown>, prefix: string, ownerKind: "association" | "company") {
  const admin = await person(t, `${prefix}-admin`, join)
  const signatory = await person(t, `${prefix}-signataire`, join)
  const writer = await person(t, `${prefix}-redactrice`, join)
  const retired = await person(t, `${prefix}-retire`, join)
  const invited = await person(t, `${prefix}-invitee`, join)
  const member = await person(t, `${prefix}-membre`, join)
  const pageId = await t.run(async (ctx) => {
    const network = await ctx.db.get(networkId)
    const pageId = await ctx.db.insert("pages", { networkId, handle: `${prefix}-page`, name: "Page de recette", ownerKind, trust: "community", trustRank: 0, visibility: "network", onRoot: network?.kind === "root", status: "active", searchText: `page de recette ${prefix}`, createdAt: NOW, updatedAt: NOW })
    for (const [who, role] of [[admin, "admin"], [signatory, "signatory"], [writer, "signatory"], [retired, "signatory"]] as const) {
      await ctx.db.insert("pageSignatories", { networkId, pageId, personId: who.personId, role, acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    }
    await ctx.db.insert("pageSignatories", { networkId, pageId, personId: invited.personId, role: "admin", grantedByPersonId: admin.personId, createdAt: NOW, updatedAt: NOW })
    // Publications et évènements de la page publiés sans relecture préalable, comme sous une politique ouverte.
    for (const surface of ["post", "event"] as const) {
      await ctx.db.insert("moderationPolicies", { networkId, surface, preReview: false, maxLinks: 2, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    }
    return pageId
  })
  // Le retrait est le geste réel : la personne quitte elle-même l'équipe de la page.
  expect(await retired.as.mutation(api.modules.pages.signatories.revokePageRole, { networkId, pageId, personId: retired.personId })).toEqual({ revoked: true })
  return { admin, signatory, writer, retired, invited, member, pageId }
}

/** Chaque rôle vivant est refusé, de façon indistincte ; un membre sans rôle, une personne retirée et une invitée signalent. */
async function expectSignatoriesRefused(t: T, networkId: Id<"networks">, f: Awaited<ReturnType<typeof team>>, target: Target): Promise<void> {
  for (const who of [f.admin, f.signatory]) {
    expect(await errorCode(who.as.mutation(M.report, { networkId, target, reason: "other" }))).toBe("notFound")
  }
  // La rédactrice : signataire elle aussi (et, pour une publication, autrice) — refusée.
  expect(await errorCode(f.writer.as.mutation(M.report, { networkId, target, reason: "other" }))).toBe("notFound")
  // `notFound`, le code d'une cible inconnue : rien ne distingue « c'est la vôtre » de « elle n'existe pas » ; aucun dossier.
  const before = await t.run(async (ctx) => await ctx.db.query("reports").take(50))
  expect(before.filter((row) => row.targetId === target.id)).toEqual([])
  for (const who of [f.member, f.retired, f.invited]) {
    const report = await who.as.mutation(M.report, { networkId, target, reason: "other" })
    expect(report).toMatchObject({ created: true, hidden: true })
  }
  const after = await t.run(async (ctx) => await ctx.db.query("reports").take(50))
  expect(after.filter((row) => row.targetId === target.id).map((row) => row.reporterPersonId).sort()).toEqual([f.member.personId, f.retired.personId, f.invited.personId].sort())
}

describe("#114, point 2 — un signataire ne signale ni sa page ni ses publications", () => {
  async function rootFixture() {
    const t = testConvex()
    const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
    const join = (as: Person["as"]) => as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
    const f = await team(t, root, join, "racine", "company")
    const { postId } = await f.writer.as.mutation(api.modules.pages.pages.publishAsPage, { networkId: root, pageId: f.pageId, body: "Annonce de la page" })
    return { t, root, ...f, postId }
  }

  it("la page elle-même : administratrice et signataire refusés, membre, retiré et invitée admis", async () => {
    const f = await rootFixture()
    await expectSignatoriesRefused(f.t, f.root, f, { kind: "page", id: f.pageId })
  })

  it("une publication en voix de la page : tout signataire refusé, pas seulement son autrice", async () => {
    const f = await rootFixture()
    // La publication est lisible par le membre : le refus des signataires ne tient pas à l'audience.
    expect(await f.member.as.query(api.modules.posts.posts.getPost, { networkId: f.root, postId: f.postId })).toMatchObject({ _id: f.postId })
    await expectSignatoriesRefused(f.t, f.root, f, { kind: "post", id: f.postId })
  })

  it("le chemin historique de la carte (`moderation.reportPost`) applique la même règle", async () => {
    const f = await rootFixture()
    const reportPost = api.modules.moderation.moderation.reportPost
    for (const who of [f.admin, f.signatory, f.writer]) {
      expect(await errorCode(who.as.mutation(reportPost, { networkId: f.root, postId: f.postId, reason: "other" }))).toBe("notFound")
    }
    expect(await f.t.run(async (ctx) => await ctx.db.query("contentReports").take(5))).toEqual([])
    expect(await f.member.as.mutation(reportPost, { networkId: f.root, postId: f.postId, reason: "other" })).toMatchObject({ created: true, hidden: true })
    expect(await f.retired.as.mutation(reportPost, { networkId: f.root, postId: f.postId, reason: "other" })).toMatchObject({ created: true, hidden: true })
  })

  it("une publication personnelle d'un signataire reste signalable par ses co-signataires", async () => {
    const f = await rootFixture()
    const { postId } = await f.writer.as.mutation(api.modules.posts.posts.publish, { networkId: f.root, body: "Mon avis personnel" })
    expect(await f.admin.as.mutation(M.report, { networkId: f.root, target: { kind: "post", id: postId }, reason: "other" })).toMatchObject({ created: true })
  })
})

describe("#114, point 2 — un signataire ne signale pas un évènement de sa page", () => {
  it("évènement de page de DIASPORALE : administratrice et signataire refusés, membre, retiré et invitée admis", async () => {
    const t = testConvex()
    await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
    const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
    const join = async (as: Person["as"], personId: Id<"persons">) => {
      await t.run((ctx) => ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `md02-idn-${personId}`, loa: 2, nationality: "GA", linkedAt: NOW }))
      await as.mutation(api.modules.diaspora.membership.joinDiasporale, { networkId, facet: { countryOfResidence: "FR", city: "Lyon" } })
    }
    const f = await team(t, networkId, join, "diaspora", "association")
    const start = NOW + 2 * HOUR
    const { eventId } = await f.admin.as.mutation(api.modules.events.pageEvents.create, { networkId, pageId: f.pageId, title: "Rencontre associative", description: "Échanges et projets", location: "Lyon", startAt: start, endAt: start + HOUR, timeZone: "Europe/Paris", audience: "network", idempotencyKey: "md02-evenement" })
    await expectSignatoriesRefused(t, networkId, f, { kind: "event", id: eventId })
  })
})
