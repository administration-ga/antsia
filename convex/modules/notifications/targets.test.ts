// @vitest-environment edge-runtime
/**
 * P14B — destinations TYPÉES relues à la lecture de la cloche et à l'ouverture d'un push.
 * Tests ÉCRITS, NON EXÉCUTÉS (décision du propriétaire du 18/10/2026 : « Continuer sans vérifier »).
 *
 *  - `moderation_decision` d'un dossier SANS propriétaire personnel (contenu porté par une page,
 *    P16) : carte publique de la page et destination « décisions de la page » pour le seul
 *    signataire VIVANT ; ancien signataire : ni carte ni ouverture ; non-signataire : rien,
 *    et sa propre décision personnelle mène à « Mes données » ;
 *  - mise en relation DIASPORALE : sujet générique (nature + référence opaque), module pur.
 */
import { makeFunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, testConvex } from "../../test.setup"
import { isCommerceNotificationKind } from "@antsia/social-domain/commerceNotifications"
import { DIASPORA_COMMUNITY_NOTICE_AUDIENCES, DIASPORA_COMMUNITY_NOTICE_OPENS } from "@antsia/social-domain/notificationOpenTarget"
import { NOTIFICATION_KINDS } from "@antsia/social-domain/notifications"
import { COMMUNITY_NOTICE_AUDIENCES, COMMUNITY_NOTICE_OPENS } from "../diaspora/communityNotifications"
import { notifyPerson } from "./notify"
import { notificationRowCategory } from "./policy"
import { DIASPORA_COMMUNITY_NOTIFICATION_KINDS, DIASPORA_SERVICE_NOTIFICATION_KINDS, isDiasporaCommunityNotificationKind, isDiasporaServiceNotificationKind } from "./tables"
import { diasporaCommunityNoticeTarget, diasporaNoticeTarget } from "./targets"

const doubles = vi.hoisted(() => ({ push: vi.fn(), receipt: vi.fn() }))
vi.mock("./transports", () => ({ deliverPush: doubles.push, readExpoReceipt: doubles.receipt }))

type T = ReturnType<typeof testConvex>
type Net = { networkId: Id<"networks"> }
type BellRow = { notificationId: Id<"notifications">; kind: string; page: { pageId: string; handle: string; name: string } | null; target?: unknown }

const NOW = Date.UTC(2026, 9, 19, 9)
const APPLICATIONS = JSON.stringify([{ applicationId: "antsia_ga", networkSlug: "antsia", origin: "https://antsia.example.test", entryPath: "/fil" }])
const REASON = "Motif de recette strictement confidentiel"
const bellPage = makeFunctionReference<"query", Net & { paginationOpts: { cursor: string | null; numItems: number } }, { page: BellRow[] }>("modules/notifications/bell:paginateNotifications")
const openTarget = makeFunctionReference<"query", Net & { reference: string }, unknown>("modules/notifications/open:resolveOpenTarget")
const subscribe = makeFunctionReference<"mutation", Net & { applicationId: string; deviceId: string; credential: { provider: "expo"; token: string } }, { subscriptionId: Id<"pushSubscriptions"> }>("modules/notifications/pushSubscriptions:subscribe")
const PAGE = { cursor: null, numItems: 10 }

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW)
  vi.stubEnv("NOTIFICATION_APPLICATIONS_JSON", APPLICATIONS)
  doubles.push.mockReset().mockResolvedValue({ status: "sent" })
  doubles.receipt.mockReset().mockResolvedValue({ status: "sent" })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

/** Membre déclarée, profil publié, notifications consenties sur un appareil lié à SA session. */
async function member(t: T, networkId: Id<"networks">, subject: string, handle: string) {
  const sessionId = await createTestSession(t, subject)
  const as = t.withIdentity({ subject, sessionId })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await t.run(async (ctx) => await ctx.db.insert("networkMemberships", { networkId, personId, status: "declaree", role: "member", joinedAt: NOW, statusChangedAt: NOW }))
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.consents.recordConsent, { networkId, purpose: "notifications", origin: "settings" })
  const suffix = handle.replace(/[^A-Za-z0-9]/gu, "_")
  await as.mutation(subscribe, { networkId, applicationId: "antsia_ga", deviceId: `device_${suffix}`, credential: { provider: "expo", token: `ExpoPushToken[token_${suffix}]` } })
  return { as, personId }
}

async function jobFor(t: T, notificationId: Id<"notifications">): Promise<Id<"notificationDeliveryJobs">> {
  const jobs = await t.run(async (ctx) => ctx.db.query("notificationDeliveryJobs").withIndex("by_notification", (q) => q.eq("notificationId", notificationId)).take(5))
  const [job] = jobs
  if (!job) throw new Error("aucun job de livraison")
  return job._id
}

/** Une page active, son signataire administrateur, et la décision qui a retiré son contenu (dossier SANS propriétaire personnel). */
async function pageDecision(t: T) {
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const signatory = await member(t, root, "page-signataire", "page.signataire")
  const outsider = await member(t, root, "page-tiers", "page.tiers")
  const { pageId, reportId } = await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", { networkId: root, handle: "page-decisions", name: "Page de recette", description: "Activité de recette", ownerKind: "company", trust: "community", trustRank: 1, visibility: "network", onRoot: true, status: "active", createdByPersonId: signatory.personId, searchText: "page recette", createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId: signatory.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const reportId = await ctx.db.insert("reports", { networkId: root, target: { kind: "page", id: pageId }, targetKind: "page", targetId: pageId, reason: "misleading", level: "network", status: "actioned", removedTarget: true, createdAt: NOW, updatedAt: NOW, reviewedAt: NOW, decisionReason: REASON })
    return { pageId, reportId }
  })
  const notificationId = await t.run(async (ctx) => await notifyPerson({ db: ctx.db, runQuery: ctx.runQuery }, { networkId: root, recipientPersonId: signatory.personId, kind: "moderation_decision", subject: { report: reportId } }))
  if (notificationId === null) throw new Error("avis de fixture refusé par la porte")
  return { root, signatory, outsider, pageId, reportId, notificationId, reference: await jobFor(t, notificationId) }
}

describe("moderation_decision d'un dossier de page — carte et destination pour le signataire VIVANT", () => {
  it("signataire vivant : la cloche projette la carte publique de la page (sans motif) et l'ouverture mène aux décisions de la page", async () => {
    const t = testConvex()
    const { root, signatory, pageId, reference } = await pageDecision(t)
    const bell = await signatory.as.query(bellPage, { networkId: root, paginationOpts: PAGE })
    const row = bell.page.find((item) => item.kind === "moderation_decision")
    expect(row).toMatchObject({ page: { pageId, handle: "page-decisions", name: "Page de recette" }, target: { kind: "pageModerationDecisions", pageId, pageHandle: "page-decisions" } })
    expect(JSON.stringify(bell)).not.toContain(REASON)
    const opened = await signatory.as.query(openTarget, { networkId: root, reference })
    expect(opened).toMatchObject({ channel: "notification", kind: "moderation_decision", subject: { kind: "report" }, actorHandle: null, target: { kind: "pageModerationDecisions", pageId, pageHandle: "page-decisions" } })
    expect(JSON.stringify(opened)).not.toContain(REASON)
  })

  it("ancien signataire : la ligne reste sans carte ni destination ; l'ouverture retombe sur le repli neutre", async () => {
    const t = testConvex()
    const { root, signatory, pageId, reference } = await pageDecision(t)
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("pageSignatories").withIndex("by_page_role", (q) => q.eq("pageId", pageId).eq("role", "admin")).take(5)
      for (const row of rows) await ctx.db.delete(row._id)
    })
    const bell = await signatory.as.query(bellPage, { networkId: root, paginationOpts: PAGE })
    expect(bell.page.find((item) => item.kind === "moderation_decision")).toMatchObject({ page: null, target: null })
    expect(await signatory.as.query(openTarget, { networkId: root, reference })).toBeNull()
  })

  it("non-signataire : n'ouvre pas la référence d'autrui ; sa propre décision personnelle mène à « Mes données », sans carte de page", async () => {
    const t = testConvex()
    const { root, outsider, reference } = await pageDecision(t)
    expect(await outsider.as.query(openTarget, { networkId: root, reference })).toBeNull()
    const personalReport = await t.run(async (ctx) => ctx.db.insert("reports", { networkId: root, target: { kind: "person", id: outsider.personId }, targetKind: "person", targetId: outsider.personId, ownerPersonId: outsider.personId, reason: "spam", level: "network", status: "actioned", createdAt: NOW, updatedAt: NOW, reviewedAt: NOW, decisionReason: REASON }))
    const notificationId = await t.run(async (ctx) => await notifyPerson({ db: ctx.db, runQuery: ctx.runQuery }, { networkId: root, recipientPersonId: outsider.personId, kind: "moderation_decision", subject: { report: personalReport } }))
    if (notificationId === null) throw new Error("avis personnel refusé par la porte")
    const bell = await outsider.as.query(bellPage, { networkId: root, paginationOpts: PAGE })
    expect(bell.page.find((item) => item.kind === "moderation_decision")).toMatchObject({ page: null, target: { kind: "personalDecisions" } })
    expect(await outsider.as.query(openTarget, { networkId: root, reference: await jobFor(t, notificationId) })).toMatchObject({ target: { kind: "personalDecisions" } })
  })
})

describe("avis de mise en relation DIASPORALE : le déplacement d'un rendez-vous (SV-03, issue #133)", () => {
  it("deux genres de la mise en relation, distincts de la vie communautaire, du commerce et du domaine commun", () => {
    for (const kind of ["service_booking_reschedule_proposed", "service_booking_rescheduled"] as const) {
      expect(DIASPORA_SERVICE_NOTIFICATION_KINDS, kind).toContain(kind)
      expect(isDiasporaServiceNotificationKind(kind), kind).toBe(true)
      expect(isDiasporaCommunityNotificationKind(kind), kind).toBe(false)
      expect(isCommerceNotificationKind(kind), kind).toBe(false)
      expect((NOTIFICATION_KINDS as readonly string[]).includes(kind), kind).toBe(false)
      // Catégorie de préférences des avis de la tranche : « social », comme les autres genres de la mise en relation.
      expect(notificationRowCategory(kind), kind).toBe("social")
    }
    // Seize genres : onze de la demande et du rendez-vous (absence contestée et déplacement compris), quatre de l'adhésion associative, la réponse à un avis.
    expect(DIASPORA_SERVICE_NOTIFICATION_KINDS).toHaveLength(16)
    expect(new Set(DIASPORA_SERVICE_NOTIFICATION_KINDS).size).toBe(DIASPORA_SERVICE_NOTIFICATION_KINDS.length)
  })
})

describe("diasporaNoticeTarget — sujet générique d'un avis de mise en relation", () => {
  it("nature + référence opaque, public et adresse de page relus par la tranche ; rien sans projection ni sujet", () => {
    const request = "jh7aaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Id<"serviceRequests">
    const membership = "jh7bbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Id<"associationMemberships">
    expect(diasporaNoticeTarget({ subjectServiceRequestId: request, subjectAssociationMembershipId: undefined, subjectServiceReviewId: undefined }, { audience: "provider", requestId: request, pageHandle: "salon-demo" }))
      .toEqual({ kind: "diasporaServiceNotice", audience: "provider", subjectKind: "serviceRequest", subjectId: request, requestId: request, pageHandle: "salon-demo" })
    expect(diasporaNoticeTarget({ subjectServiceRequestId: undefined, subjectAssociationMembershipId: membership, subjectServiceReviewId: undefined }, { audience: "member", requestId: null, pageHandle: "collectif-demo" }))
      .toEqual({ kind: "diasporaServiceNotice", audience: "member", subjectKind: "associationMembership", subjectId: membership, requestId: null, pageHandle: "collectif-demo" })
    expect(diasporaNoticeTarget({ subjectServiceRequestId: request, subjectAssociationMembershipId: undefined, subjectServiceReviewId: undefined }, null)).toBeNull()
    expect(diasporaNoticeTarget({ subjectServiceRequestId: undefined, subjectAssociationMembershipId: undefined, subjectServiceReviewId: undefined }, { audience: "member", requestId: null, pageHandle: null })).toBeNull()
  })
})

describe("avis de la vie communautaire DIASPORALE (délégués par ANTSIA le 19/10/2026)", () => {
  it("les publics et les objets du domaine recopient exactement ceux de la tranche", () => {
    expect([...DIASPORA_COMMUNITY_NOTICE_AUDIENCES]).toEqual([...COMMUNITY_NOTICE_AUDIENCES])
    expect([...DIASPORA_COMMUNITY_NOTICE_OPENS]).toEqual([...COMMUNITY_NOTICE_OPENS])
  })

  it("treize genres propres, distincts de la mise en relation, et le genre « absence contestée » parmi la mise en relation", () => {
    // ET-01 (issue #101) : mission annulée, horaire changé, pour les bénévoles inscrits.
    expect(DIASPORA_COMMUNITY_NOTIFICATION_KINDS).toHaveLength(13)
    for (const kind of DIASPORA_COMMUNITY_NOTIFICATION_KINDS) {
      expect(isDiasporaCommunityNotificationKind(kind), kind).toBe(true)
      expect(isDiasporaServiceNotificationKind(kind), kind).toBe(false)
    }
    expect(isDiasporaServiceNotificationKind("service_no_show_contested")).toBe(true)
    expect(DIASPORA_SERVICE_NOTIFICATION_KINDS).toContain("service_no_show_contested")
    expect(isDiasporaCommunityNotificationKind("post_reaction")).toBe(false)
  })

  it("destination : public, objet ouvert et référence opaque relus par la tranche ; rien sans projection", () => {
    expect(diasporaCommunityNoticeTarget({ audience: "candidate", opens: "jobApplication", objectId: "jh7ccccccccccccccccccccccccccccc", pageHandle: "cabinet-demo" }))
      .toEqual({ kind: "diasporaCommunityNotice", audience: "candidate", opens: "jobApplication", objectId: "jh7ccccccccccccccccccccccccccccc", pageHandle: "cabinet-demo" })
    expect(diasporaCommunityNoticeTarget({ audience: "author", opens: "aidQuestion", objectId: "jh7ddddddddddddddddddddddddddddd", pageHandle: null }))
      .toEqual({ kind: "diasporaCommunityNotice", audience: "author", opens: "aidQuestion", objectId: "jh7ddddddddddddddddddddddddddddd", pageHandle: null })
    expect(diasporaCommunityNoticeTarget(null)).toBeNull()
  })
})
