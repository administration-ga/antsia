// @vitest-environment edge-runtime
/** P14, reprise du 20/10 : scénarios écrits seulement ; aucune exécution autorisée. */
import { makeFunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api, internal } from "../../_generated/api"
import type { Doc } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { revokeServicesForPerson } from "./serviceLifecycle"
import { SERVICE_CLOSED_RETENTION_MS } from "./serviceRules"

const NOW = Date.UTC(2026, 9, 20, 12), DAY = 86_400_000, OLD = NOW - 120 * DAY
const closeStale = makeFunctionReference<"mutation", { requestRowId: string }, null>("modules/shops/serviceLifecycle:closeStale")
const purgeClosed = makeFunctionReference<"mutation", { requestRowId: string }, null>("modules/shops/serviceLifecycle:purgeClosed")
type RequestFields = Omit<Doc<"commerceServiceRequests">, "_id" | "_creationTime">
type CommandFields = Omit<Doc<"commerceServiceCommands">, "_id" | "_creationTime">

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW) })
afterEach(() => { vi.useRealTimers() })

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const buyer = t.withIdentity({ subject: "service-lifecycle-buyer" })
  const personId = await buyer.mutation(api.modules.people.persons.ensureMyPerson, {})
  const shopId = await t.run(async (ctx) => await ctx.db.insert("shops", { networkId: root, model: "quote_services", storefront: "draft", visibility: "network", createdAt: OLD, updatedAt: OLD }))
  const base = {
    networkId: root, personId, shopId, handle: "atelier-services", mode: "booking" as const, state: "active" as const,
    offerRef: "pro.ga:offer:01JA00000000000000000000F1", offerTitle: "Prestation",
    source: "antsia", environment: "sandbox" as const, shopRef: "pro.ga:structure:01JA00000000000000000000S1",
    linkRef: "pro.ga:commerce_link:01JA00000000000000000000K1", subjectRef: `antsia:sub:${"a".repeat(26)}`,
    createdAt: OLD, updatedAt: OLD,
  }
  const request = async (patch: Partial<RequestFields> & { requestRowId: string }) =>
    await t.run(async (ctx) => await ctx.db.insert("commerceServiceRequests", { ...base, ...patch }))
  const command = async (patch: Partial<CommandFields> & { requestRowId: string }) =>
    await t.run(async (ctx) => await ctx.db.insert("commerceServiceCommands", {
      networkId: root, personId, shopId, handle: base.handle, source: base.source, environment: base.environment,
      linkRef: base.linkRef, shopRef: base.shopRef, subjectRef: base.subjectRef,
      sessionDigest: "a".repeat(64), configFingerprint: "b".repeat(64), commandId: "lifecycle-command-0001",
      kind: "booking", clientRequestId: "lifecycle-client-0001", intentDigest: "c".repeat(64), requestId: "lifecycle-request-0001",
      bodySha256: "d".repeat(64), issuedAt: OLD, expiresAt: OLD + 60_000, privateUntil: OLD + 30 * 60_000,
      state: "unknown", consentTextVersion: "lifecycle-consent-v1", consentedAt: OLD, createdAt: OLD, updatedAt: OLD,
      ...patch,
    }))
  return { t, personId, request, command }
}
function booking(state: "requested" | "confirmed" | "cancelled_by_pro", startAt = NOW + DAY) {
  return {
    appointmentRef: "pro.ga:appointment:01JA00000000000000000000A1", serviceRef: "pro.ga:agenda_service:01JA00000000000000000000V1",
    serviceLabel: "Prestation", resourceLabel: null, startAt, endAt: startAt + 3_600_000, timeZone: "Africa/Libreville" as const,
    state, holdExpiresAt: state === "requested" ? OLD + 30 * 60_000 : null, revision: 1, updatedAt: OLD,
    cancellation: state === "cancelled_by_pro" ? "professional" as const : null,
    replacementRef: null, replacesRef: null, policy: null, observedAt: OLD,
  }
}

describe("P14 — le temps local ne termine pas un engagement distant", () => {
  it("conserve un rendez-vous confirmé sans observation depuis plus de 90 jours", async () => {
    const { t, request } = await fixture()
    const id = await request({ requestRowId: "lifecycle-booking-0001", booking: booking("confirmed") })
    await t.mutation(closeStale, { requestRowId: "lifecycle-booking-0001" })
    const row = await t.run(async (ctx) => await ctx.db.get(id))
    expect(row?.state).toBe("active")
    expect(row?.purgeAt).toBeUndefined()
    expect(row?.booking?.observedAt).toBe(OLD)
  })
  it("ne déduit ni expiration ni confirmation d'une ancienne retenue locale", async () => {
    const { t, request } = await fixture()
    const id = await request({ requestRowId: "lifecycle-hold-0001", booking: booking("requested", OLD + DAY) })
    await t.mutation(closeStale, { requestRowId: "lifecycle-hold-0001" })
    const row = await t.run(async (ctx) => await ctx.db.get(id))
    expect(row?.state).toBe("active")
    expect(row?.booking?.state).toBe("requested")
  })
  it("conserve une commande de prestation ou devis encore ouverte", async () => {
    const { t, request } = await fixture()
    const id = await request({ requestRowId: "lifecycle-order-0001", mode: "fixed_order", order: {
      orderRef: "pro.ga:order:01JA00000000000000000000D1", state: "in_progress", revision: 1,
      total: { amount: 1500, currency: "XAF" }, updatedAt: OLD, observedAt: OLD,
    } })
    await t.mutation(closeStale, { requestRowId: "lifecycle-order-0001" })
    expect((await t.run(async (ctx) => await ctx.db.get(id)))?.state).toBe("active")
  })
  it("garde consultable une intention inconnue dont le corps et l'expiration ont disparu", async () => {
    const { t, request, command } = await fixture()
    const id = await request({ requestRowId: "lifecycle-lost-0001", state: "pending" })
    const commandId = await command({ requestRowId: "lifecycle-lost-0001", rawBody: undefined, privatePurgedAt: OLD + DAY })
    await t.mutation(closeStale, { requestRowId: "lifecycle-lost-0001" })
    expect((await t.run(async (ctx) => await ctx.db.get(id)))?.state).toBe("pending")
    expect((await t.run(async (ctx) => await ctx.db.get(commandId)))?.state).toBe("unknown")
  })
  it("ferme une reconfirmation réellement sans effet, sans inventer de commande", async () => {
    const { t, request, command } = await fixture()
    const id = await request({ requestRowId: "lifecycle-noeffect-0001", mode: "fixed_order", state: "pending" })
    await command({ requestRowId: "lifecycle-noeffect-0001", kind: "order", state: "reconfirm" })
    await t.mutation(closeStale, { requestRowId: "lifecycle-noeffect-0001" })
    const row = await t.run(async (ctx) => await ctx.db.get(id))
    expect(row?.state).toBe("failed")
    expect(row?.order).toBeUndefined()
    expect(row?.purgeAt).toBe(NOW + SERVICE_CLOSED_RETENTION_MS)
  })
  it("purge seulement après une terminaison observée et sa durée de conservation", async () => {
    const { t, request, command } = await fixture()
    const id = await request({ requestRowId: "lifecycle-terminal-0001", booking: booking("cancelled_by_pro") })
    const commandId = await command({ requestRowId: "lifecycle-terminal-0001", state: "accepted", resultRef: "pro.ga:appointment:01JA00000000000000000000A1" })
    await t.mutation(closeStale, { requestRowId: "lifecycle-terminal-0001" })
    expect((await t.run(async (ctx) => await ctx.db.get(id)))?.state).toBe("closed")
    vi.setSystemTime(NOW + SERVICE_CLOSED_RETENTION_MS + 1)
    await t.mutation(purgeClosed, { requestRowId: "lifecycle-terminal-0001" })
    expect(await t.run(async (ctx) => await ctx.db.get(id))).toBeNull()
    expect(await t.run(async (ctx) => await ctx.db.get(commandId))).toBeNull()
  })
  it("protège une trace encore présente close par l'ancien traitement d'inactivité", async () => {
    const { t, request } = await fixture()
    const id = await request({ requestRowId: "lifecycle-legacy-0001", state: "closed", reason: "inactive", purgeAt: NOW - 1, booking: booking("confirmed") })
    await t.mutation(purgeClosed, { requestRowId: "lifecycle-legacy-0001" })
    const row = await t.run(async (ctx) => await ctx.db.get(id))
    expect(row?.state).toBe("active")
    expect(row?.purgeAt).toBeUndefined()
    expect(row?.booking?.observedAt).toBe(OLD)
  })
  it("protège aussi l'ancienne clôture d'une réponse inconnue", async () => {
    const { t, request, command } = await fixture()
    const id = await request({ requestRowId: "lifecycle-unknown-0001", state: "failed", reason: "abandoned", purgeAt: NOW - 1 })
    await command({ requestRowId: "lifecycle-unknown-0001" })
    await t.mutation(purgeClosed, { requestRowId: "lifecycle-unknown-0001" })
    expect((await t.run(async (ctx) => await ctx.db.get(id)))?.state).toBe("pending")
  })
  it("révoque les baux de session et références de pièces avec les corps privés", async () => {
    const { t, personId, command } = await fixture()
    const id = await command({ requestRowId: "lifecycle-erasure-0001", kind: "inquiry", rawBody: '{"need":"private fixture"}',
      privatePurgedAt: undefined, leaseToken: "lease-private-fixture", leaseUntil: NOW + 30_000,
      leaseSessionDigest: "e".repeat(64), lookupSessionDigest: "f".repeat(64), inquiryAttachmentMessageIds: [],
    })
    await t.run(async (ctx) => { await revokeServicesForPerson(ctx, personId) })
    const row = await t.run(async (ctx) => await ctx.db.get(id))
    expect(row?.rawBody).toBeUndefined()
    expect(row?.leaseToken).toBeUndefined()
    expect(row?.leaseSessionDigest).toBeUndefined()
    expect(row?.lookupSessionDigest).toBeUndefined()
    expect(row?.inquiryAttachmentMessageIds).toBeUndefined()
    expect(row?.cancelledAt).toBe(NOW)
  })
})
