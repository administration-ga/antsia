// @vitest-environment edge-runtime
/** DP39 : scénarios écrits uniquement ; aucune recette HTTP ni vérification exécutée. */
import { commerceCanonicalJson } from "@antsia/social-domain/commerce/primitives"
import { COMMERCE_SERVICE_NOTICE_CONTRACT, type CommerceServiceNoticeEnvelope, type CommerceServiceNoticeEvent } from "@antsia/social-domain/commerce-service-notices"
import { federationSigningText } from "@antsia/social-domain/federationProtocol"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "../../_generated/api"
import type { Doc } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { commerceNoticeAdmission, commerceNoticeView, commerceNoticeVisible } from "../notifications/commerceAccess"
import { directlyOwned, exportableRecord } from "../people/dataInventory"
import { commerceActivationReady } from "../shops/commerceActivation"
import { federationBodyDigest } from "./signature"

const NOW = Date.UTC(2026, 9, 20, 12), OLD = NOW - 86_400_000
const KEY_NAME = "ANTSIA_FEDERATION_SERVICE_NOTICES_TEST_KEY", KEY = "service-notices-fixture-secret-0123456789"
const SHOP = "pro.ga:structure:01JA00000000000000000000S1", LINK = "pro.ga:commerce_link:01JA00000000000000000000K1"
const APPOINTMENT = "pro.ga:appointment:01JA00000000000000000000A1", OTHER_APPOINTMENT = "pro.ga:appointment:01JA00000000000000000000A2"
const QUOTE = "pro.ga:quote:01JA00000000000000000000Q1", ORDER = "pro.ga:order:01JA00000000000000000000D1"
const SUBJECT = `antsia:sub:${"a".repeat(32)}`, REQUEST_ID = "service-notice-origin-0001", ROW_ID = "service-notice-local-0001"
type Command = Omit<Doc<"commerceServiceCommands">, "_id" | "_creationTime">

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW)
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210"); vi.stubEnv("FEDERATION_ENVIRONMENT", "sandbox"); vi.stubEnv(KEY_NAME, KEY)
  vi.stubEnv("ANTSIA_COMMERCE_ENVIRONMENT", "sandbox"); vi.stubEnv("ANTSIA_COMMERCE_SOURCE", "antsia")
  vi.stubEnv("ANTSIA_COMMERCE_PRO_HTTP_ORIGIN", "http://localhost:4010"); vi.stubEnv("ANTSIA_COMMERCE_PRO_APP_ORIGIN", "http://localhost:4011")
  vi.stubEnv("ANTSIA_COMMERCE_ORIGIN", "http://localhost:3030"); vi.stubEnv("ANTSIA_COMMERCE_KEY_ID", "antsia-service-notices-test"); vi.stubEnv("ANTSIA_COMMERCE_SIGNING_KEY", KEY)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const as = t.withIdentity({ subject: "service-notice-buyer" })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle: "service-notice-buyer", displayName: "Recette" })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  const ids = await t.run(async (ctx) => {
    // Aucune vitrine ni politique ouverte : une obligation historique ne dépend pas d'une nouvelle vente.
    const shopId = await ctx.db.insert("shops", { networkId: root, model: "quote_services", storefront: "draft", visibility: "network", createdAt: OLD, updatedAt: OLD })
    const emitterId = await ctx.db.insert("federationEmitters", { networkId: root, slug: "pro-ga", environment: "sandbox", enabled: true, keyEnvName: KEY_NAME, allowedContracts: [COMMERCE_SERVICE_NOTICE_CONTRACT], revision: 1, createdAt: OLD, updatedAt: OLD })
    const authority = { networkId: root, personId, shopId, handle: "service-notice-shop", source: "antsia", environment: "sandbox" as const, subjectRef: SUBJECT, shopRef: SHOP, linkRef: LINK }
    const requestId = await ctx.db.insert("commerceServiceRequests", {
      ...authority, requestRowId: ROW_ID, mode: "booking", state: "active",
      offerRef: "pro.ga:offer:01JA00000000000000000000V1", offerTitle: "Prestation historique", createdAt: OLD, updatedAt: OLD,
      booking: { appointmentRef: APPOINTMENT, serviceRef: "pro.ga:agenda_service:01JA00000000000000000000V1", serviceLabel: "Prestation", resourceLabel: null,
        startAt: NOW + 3_600_000, endAt: NOW + 7_200_000, timeZone: "Africa/Libreville", state: "requested", holdExpiresAt: OLD + 60_000,
        revision: 1, updatedAt: OLD, cancellation: null, replacementRef: null, replacesRef: null, policy: null, observedAt: OLD },
    })
    const commandId = await ctx.db.insert("commerceServiceCommands", {
      ...authority, requestRowId: ROW_ID, commandId: "service-notice-command-0001", clientRequestId: "service-notice-client-0001", intentDigest: "a".repeat(64),
      sessionDigest: "b".repeat(64), configFingerprint: "c".repeat(64), requestId: REQUEST_ID, bodySha256: "d".repeat(64),
      kind: "booking", state: "accepted", resultRef: APPOINTMENT, issuedAt: OLD, expiresAt: OLD + 60_000, privateUntil: OLD + 1_800_000,
      privatePurgedAt: OLD + 1_800_000, consentTextVersion: "service-notice-consent-fixture", consentedAt: OLD, createdAt: OLD, updatedAt: OLD,
    })
    return { requestId, commandId, shopId, emitterId }
  })
  return { t, root, as, personId, ...ids }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

function notice(patch: Partial<CommerceServiceNoticeEvent> = {}, eventId = "service-notice-event-0001"): CommerceServiceNoticeEnvelope {
  const payload: CommerceServiceNoticeEvent = { type: "service.followup.changed", environment: "sandbox", subjectRef: SUBJECT, shopRef: SHOP, originRequestId: REQUEST_ID,
    objectKind: "appointment", objectRef: APPOINTMENT, revision: 2, changedAt: NOW, ...patch }
  return { contract: COMMERCE_SERVICE_NOTICE_CONTRACT, eventId, version: 1, objectRef: payload.objectRef, payload }
}
async function post(f: Fixture, envelope = notice(), headers: Record<string, string> = {}) {
  const rawBody = commerceCanonicalJson(envelope)!, timestamp = String(Math.floor(Date.now() / 1000))
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const signature = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(federationSigningText("sandbox", timestamp, rawBody)))), (byte) => byte.toString(16).padStart(2, "0")).join("")
  return await f.t.fetch("/federation/inbox", { method: "POST", body: rawBody, headers: { "Content-Type": "application/json", "x-antsia-emitter": "pro-ga", "x-antsia-environment": "sandbox", "x-antsia-timestamp": timestamp, "x-antsia-signature": signature, ...headers } })
}
async function rows(f: Fixture) {
  return await f.t.run(async (ctx) => ({
    notices: await ctx.db.query("commerceServiceFollowupNotices").take(30), notifications: await ctx.db.query("notifications").take(30),
    receipts: await ctx.db.query("federationInboxReceipts").take(30), letters: await ctx.db.query("federationDeadLetters").take(30),
    request: await ctx.db.get(f.requestId), command: await ctx.db.get(f.commandId),
  }))
}
async function patchCommand(f: Fixture, patch: Partial<Command>) { await f.t.run(async (ctx) => await ctx.db.patch(f.commandId, patch)) }

describe("DP39 — signal signé neutre et idempotent", () => {
  it("écrit un avis non lu, ouvre la fiche existante et ne rafraîchit AUCUN état métier", async () => {
    const f = await fixture(), before = await rows(f), response = await post(f)
    expect(response.status).toBe(202)
    expect(await response.json()).toMatchObject({ status: "applied", applicationStatus: "applied" })
    const after = await rows(f)
    expect(after.request).toEqual(before.request); expect(after.command).toEqual(before.command)
    expect(after.notices).toHaveLength(1); expect(after.letters).toEqual([])
    const notifications = after.notifications.filter((row) => row.kind === "commerce_service_followup_updated")
    expect(notifications).toHaveLength(1)
    const notification = notifications[0]!
    expect(notification.readAt).toBeUndefined(); expect(notification.actorPersonId).toBeUndefined()
    expect(notification.subjectCommerceServiceRequestId).toBe(f.requestId)
    expect(await f.t.run(async (ctx) => await commerceNoticeView(ctx, notification))).toEqual({ audience: "client", target: { kind: "serviceRequest", requestRowId: ROW_ID } })
    expect(commerceActivationReady("services")).toBe(false)
    expect(await f.t.run(async (ctx) => await ctx.db.query("commerceServicePolicies").take(1))).toEqual([])
  })

  it("rejoue les mêmes faits avec un nouvel eventId sans rouvrir ni redistribuer la cloche", async () => {
    const f = await fixture()
    await post(f)
    const first = (await rows(f)).notifications.find((row) => row.kind === "commerce_service_followup_updated")!
    await f.t.run(async (ctx) => await ctx.db.patch(first._id, { readAt: NOW }))
    const before = await rows(f)
    expect((await post(f)).status).toBe(200)
    expect(await (await post(f, notice({}, "service-notice-event-0002"))).json()).toMatchObject({ status: "applied" })
    const after = await rows(f)
    expect(after.notices).toEqual(before.notices); expect(after.notifications).toEqual(before.notifications)
  })

  it("la même révision avec d'autres faits est un conflit personnel, sans corps en DLQ", async () => {
    const f = await fixture()
    await post(f)
    const before = await rows(f)
    expect(await (await post(f, notice({ changedAt: NOW - 1 }, "service-notice-conflict-0002"))).json()).toMatchObject({ status: "discarded", applicationStatus: "rejected" })
    const after = await rows(f)
    expect(after.notices).toEqual(before.notices); expect(after.notifications).toEqual(before.notifications); expect(after.letters).toEqual([])
  })

  it("une ancienne révision est sans effet ; une nouvelle ne confirme pas le rendez-vous", async () => {
    const f = await fixture()
    await post(f, notice({ revision: 4 }, "service-notice-revision-0004"))
    const before = await rows(f)
    expect(await (await post(f, notice({ revision: 3, changedAt: OLD }, "service-notice-revision-0003"))).json()).toMatchObject({ status: "applied" })
    expect((await rows(f)).notices).toEqual(before.notices)
    await post(f, notice({ revision: 5 }, "service-notice-revision-0005"))
    const after = await rows(f)
    expect(after.notices).toHaveLength(2); expect(after.request).toEqual(before.request)
    expect(after.request?.booking?.state).toBe("requested"); expect(after.request?.booking?.observedAt).toBe(OLD)
  })
})

describe("DP39 — corrélation exacte avant toute notice", () => {
  it.each([
    { originRequestId: "another-origin-request-0001" }, { subjectRef: `antsia:sub:${"b".repeat(32)}` },
    { shopRef: "pro.ga:structure:01JA00000000000000000000S2" }, { objectRef: OTHER_APPOINTMENT },
    { objectKind: "order" as const, objectRef: ORDER },
  ])("refuse la charge hors engagement %j", async (patch) => {
    const f = await fixture()
    expect(await (await post(f, notice(patch))).json()).toMatchObject({ status: "discarded" })
    const after = await rows(f)
    expect(after.notices).toEqual([]); expect(after.notifications).toEqual([]); expect(after.letters).toEqual([])
  })

  it.each(["source", "person", "link", "network"] as const)("ne rattache pas une commande divergente (%s)", async (mismatch) => {
    const f = await fixture()
    await f.t.run(async (ctx) => {
      if (mismatch === "source") await ctx.db.patch(f.commandId, { source: "another-source" })
      if (mismatch === "person") {
        const other = await ctx.db.insert("persons", { authUserId: "another-service-notice-person", createdAt: NOW, updatedAt: NOW })
        await ctx.db.patch(f.commandId, { personId: other })
      }
      if (mismatch === "link") await ctx.db.patch(f.commandId, { linkRef: "pro.ga:commerce_link:01JA00000000000000000000K2" })
      if (mismatch === "network") {
        const other = await ctx.db.insert("networks", { slug: "service-notice-other", name: "Autre réseau", kind: "root", status: "active", membershipPolicy: "open", defaultVisibility: "network", reachValues: [], theme: "antsia", createdAt: NOW, updatedAt: NOW })
        await ctx.db.patch(f.commandId, { networkId: other })
      }
    })
    expect(await (await post(f)).json()).toMatchObject({ status: "discarded" })
    const after = await rows(f)
    expect(after.notices).toEqual([]); expect(after.notifications).toEqual([]); expect(after.letters).toEqual([])
  })

  it("un résultat perdu UNKNOWN signale un objet sans le rattacher comme réussite", async () => {
    const f = await fixture()
    await patchCommand(f, { state: "unknown", resultRef: undefined, lookupState: "unknown", leaseUntil: OLD })
    await f.t.run(async (ctx) => await ctx.db.patch(f.requestId, { booking: undefined, state: "pending" }))
    const before = await rows(f)
    expect(await (await post(f)).json()).toMatchObject({ status: "applied" })
    const after = await rows(f)
    expect(after.request).toEqual(before.request); expect(after.command).toEqual(before.command)
    expect(after.command?.state).toBe("unknown"); expect(after.command?.resultRef).toBeUndefined()
  })

  it("le même requestId d'un autre réseau ne fait pas collision avec la commande du destinataire", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => {
      const otherNetwork = await ctx.db.insert("networks", { slug: "service-notice-collision", name: "Autre réseau", kind: "root", status: "active", membershipPolicy: "open", defaultVisibility: "network", reachValues: [], theme: "antsia", createdAt: NOW, updatedAt: NOW })
      const command = await ctx.db.get(f.commandId)
      if (!command) throw new Error("Missing fixture command")
      const { _id: _commandId, _creationTime: _created, ...fields } = command
      await ctx.db.insert("commerceServiceCommands", { ...fields, networkId: otherNetwork, commandId: "service-notice-other-network-command", subjectRef: `antsia:sub:${"b".repeat(32)}` })
    })
    expect(await (await post(f)).json()).toMatchObject({ status: "applied" })
    const after = await rows(f)
    expect(after.notices).toHaveLength(1); expect(after.notices[0]?.networkId).toBe(f.root)
    expect(after.notifications.filter((row) => row.kind === "commerce_service_followup_updated")).toHaveLength(1)
    expect(after.letters).toEqual([])
  })

  it.each(["running", "lease", "rejected"] as const)("un objet encore inconnu ne signale rien pour %s", async (state) => {
    const f = await fixture()
    await patchCommand(f, { state: state === "rejected" ? "rejected" : "unknown", resultRef: undefined, lookupState: state === "running" ? "in_progress" : "unknown", leaseUntil: state === "lease" ? NOW + 30_000 : OLD })
    await f.t.run(async (ctx) => await ctx.db.patch(f.requestId, { booking: undefined }))
    expect(await (await post(f)).json()).toMatchObject({ status: "discarded" })
    expect((await rows(f)).notices).toEqual([])
  })

  it("le premier devis est lié à l'inquiry, pas au resultRef d'inquiry pris pour un devis", async () => {
    const f = await fixture()
    const inquiry = "pro.ga:inquiry:01JA00000000000000000000I1"
    await patchCommand(f, { kind: "inquiry", resultRef: inquiry })
    await f.t.run(async (ctx) => await ctx.db.patch(f.requestId, { mode: "quote", booking: undefined, inquiryRef: inquiry }))
    expect(await (await post(f, notice({ objectKind: "quote", objectRef: QUOTE }))).json()).toMatchObject({ status: "applied" })
    expect((await rows(f)).request?.acceptedQuote).toBeUndefined()
  })

  it("une commande fixe et un devis accepté ne sont pas interchangeables", async () => {
    const f = await fixture()
    await patchCommand(f, { kind: "order", resultRef: ORDER })
    await f.t.run(async (ctx) => await ctx.db.patch(f.requestId, { mode: "fixed_order", booking: undefined }))
    expect(await (await post(f, notice({ objectKind: "order", objectRef: ORDER }))).json()).toMatchObject({ status: "applied" })
    expect(await (await post(f, notice({ objectKind: "quote", objectRef: QUOTE }, "service-notice-wrong-kind-0002"))).json()).toMatchObject({ status: "discarded" })
  })
})

describe("DP39 — refus privés, session d'ouverture et effacement", () => {
  it("refuse signature, contrat ou environnement non admis avant reçu", async () => {
    const f = await fixture()
    expect((await post(f, notice(), { "x-antsia-signature": "0".repeat(64) })).status).toBe(401)
    expect((await post(f, notice({ environment: "production" }))).status).toBe(401)
    await f.t.run(async (ctx) => await ctx.db.patch(f.emitterId, { allowedContracts: [] }))
    expect((await post(f)).status).toBe(401)
    const after = await rows(f)
    expect(after.receipts).toEqual([]); expect(after.notices).toEqual([]); expect(after.letters).toEqual([])
  })

  it("un autre émetteur même signé, ou une source locale absente, ne crée rien", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => await ctx.db.patch(f.emitterId, { slug: "another-emitter" }))
    expect(await (await post(f, notice(), { "x-antsia-emitter": "another-emitter" })).json()).toMatchObject({ status: "discarded" })
    await f.t.run(async (ctx) => await ctx.db.patch(f.emitterId, { slug: "pro-ga" }))
    vi.stubEnv("ANTSIA_COMMERCE_SOURCE", undefined)
    expect(await (await post(f, notice({}, "service-notice-no-config-0002"))).json()).toMatchObject({ status: "discarded" })
    const after = await rows(f)
    expect(after.notices).toEqual([]); expect(after.notifications).toEqual([]); expect(after.letters).toEqual([])
  })

  it.each(["withdrawn", "erasing", "erased", "membership"] as const)("un destinataire %s ne reçoit aucune copie personnelle en DLQ", async (reason) => {
    const f = await fixture()
    await f.t.run(async (ctx) => {
      if (reason === "withdrawn") await ctx.db.patch(f.requestId, { cancelledAt: NOW })
      if (reason === "erasing") await ctx.db.patch(f.personId, { deletionRequestedAt: NOW })
      if (reason === "erased") await ctx.db.patch(f.personId, { erasedAt: NOW })
      if (reason === "membership") {
        const member = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.root).eq("personId", f.personId)).unique()
        await ctx.db.patch(member!._id, { status: "suspendue", statusChangedAt: NOW })
      }
    })
    expect(await (await post(f)).json()).toMatchObject({ status: "discarded" })
    const after = await rows(f)
    expect(after.notices).toEqual([]); expect(after.notifications).toEqual([]); expect(after.letters).toEqual([])
  })

  it("l'ouverture relit l'autorité ; une autre personne ne lit pas la demande", async () => {
    const f = await fixture()
    await post(f)
    const notification = (await rows(f)).notifications.find((row) => row.kind === "commerce_service_followup_updated")!
    expect(await f.t.run(async (ctx) => await commerceNoticeVisible(ctx, notification))).toBe(true)
    const other = f.t.withIdentity({ subject: "service-notice-non-owner" })
    await other.mutation(api.modules.people.persons.ensureMyPerson, {})
    await other.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    await other.mutation(api.modules.people.profile.publishMyProfile, { handle: "service-notice-non-owner", displayName: "Autre recette" })
    await other.mutation(api.modules.people.memberships.joinNetwork, { networkId: f.root })
    expect(await other.query(api.modules.shops.services.myRequest, { networkId: f.root, requestRowId: ROW_ID })).toBeNull()
    await f.t.run(async (ctx) => await ctx.db.patch(f.requestId, { cancelledAt: NOW }))
    expect(await f.t.run(async (ctx) => await commerceNoticeView(ctx, notification))).toBeNull()
    expect(await f.t.run(async (ctx) => await commerceNoticeVisible(ctx, notification))).toBe(false)
  })

  it("l'avis ne fournit aucune session : sa fiche refuse la session supprimée", async () => {
    const f = await fixture()
    await post(f)
    expect(await f.as.query(api.modules.shops.services.myRequest, { networkId: f.root, requestRowId: ROW_ID })).not.toBeNull()
    await f.t.mutation(components.betterAuth.adapter.deleteMany, {
      input: { model: "session", where: [{ field: "userId", value: "service-notice-buyer" }] },
      paginationOpts: { cursor: null, numItems: 20 },
    })
    await expect(f.as.query(api.modules.shops.services.myRequest, { networkId: f.root, requestRowId: ROW_ID })).rejects.toThrow()
    expect((await rows(f)).request?.booking?.observedAt).toBe(OLD)
  })

  it("une transition fabriquée ne passe pas notifyPerson ; le registre appartient au seul demandeur", async () => {
    const f = await fixture()
    expect(await f.t.run(async (ctx) => await commerceNoticeAdmission(ctx, f.root, f.personId, "commerce_service_followup_updated", { commerceServiceRequest: f.requestId }, `followup:${"f".repeat(64)}`))).toBeNull()
    await post(f)
    const ledger = (await rows(f)).notices[0]!
    expect(directlyOwned("commerceServiceFollowupNotices", ledger, f.personId)).toBe(true)
    expect(directlyOwned("commerceServiceFollowupNotices", ledger, "another-person")).toBe(false)
    expect(exportableRecord("commerceServiceFollowupNotices", ledger, f.personId)).toBeNull()
    expect(ledger.payloadSha256).toBe(await federationBodyDigest(commerceCanonicalJson(notice().payload)!))
    expect(ledger).not.toHaveProperty("rawBody"); expect(ledger).not.toHaveProperty("subjectRef")
  })
})
