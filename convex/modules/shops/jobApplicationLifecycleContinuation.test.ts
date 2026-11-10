// @vitest-environment edge-runtime
/** Reprise P15 : scénarios écrits, non exécutés. Aucun transport HTTP. */
import { makeFunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { IDLE_AT, retireApplicationFile, revokeJobApplicationsForPerson } from "./jobApplicationLifecycle"

const NOW = Date.UTC(2026, 9, 20, 12)
type Application = Omit<Doc<"commerceApplications">, "_id" | "_creationTime">
const continueFile = makeFunctionReference<"mutation", { personId: Id<"persons">; fileId: Id<"commerceApplicationFiles">; cursor: string }, null>("modules/shops/jobApplicationLifecycle:continueJobFileRetirement")

async function fixture(count: number, patch: Partial<Application> = {}) {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const candidate = t.withIdentity({ subject: "p15-lifecycle-candidate" })
  const personId = await candidate.mutation(api.modules.people.persons.ensureMyPerson, {})
  const other = t.withIdentity({ subject: "p15-lifecycle-other" })
  const otherPersonId = await other.mutation(api.modules.people.persons.ensureMyPerson, {})
  const scope = await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", { networkId: root, handle: "emploi-cycle", name: "Employeur", description: "Offres", ownerKind: "company", trust: "community", trustRank: 1,
      visibility: "network", onRoot: false, status: "active", createdByPersonId: personId, searchText: "employeur", createdAt: NOW, updatedAt: NOW })
    const shopId = await ctx.db.insert("shops", { networkId: root, pageId, preparedByPersonId: personId, model: "quote_services", storefront: "draft", visibility: "network", createdAt: NOW, updatedAt: NOW })
    const emitterId = await ctx.db.insert("federationEmitters", { networkId: root, slug: "pro-lifecycle", environment: "sandbox", enabled: false, keyEnvName: "P15_UNUSED_KEY", allowedContracts: [], revision: 1, createdAt: NOW, updatedAt: NOW })
    const mappingId = await ctx.db.insert("commerceCatalogMappings", { networkId: root, shopId, emitterId, environment: "sandbox", shopRef: "pro.ga:structure:employeur", linkRef: "pro.ga:commerce_link:emploi", enabled: false, generation: 1, createdAt: NOW, updatedAt: NOW })
    const storageId = await ctx.storage.store(new Blob(["%PDF-1.4\nCV\n%%EOF"], { type: "application/pdf" }))
    const fileId = await ctx.db.insert("commerceApplicationFiles", { networkId: root, personId, storageId, kind: "cv", sha256: "a".repeat(64), byteSize: 20, state: "ready", createdAt: NOW })
    return { shopId, mappingId, fileId, storageId }
  })
  const base: Application = {
    networkId: root, personId, shopId: scope.shopId, mappingId: scope.mappingId, jobRef: "pro.ga:job_opening:emploi", shopRef: "pro.ga:structure:employeur", linkRef: "pro.ga:commerce_link:emploi", jobTitle: "Poste",
    source: "antsia", environment: "sandbox", configFingerprint: "fixture", subjectRef: "antsia:candidate:fixture", requestId: "fixture", requestSha256: "b".repeat(64), requestExpiresAt: NOW + 60_000,
    rawBody: "private-signed-body", idempotencyKey: "p15-private-key-fixture", intentionSha256: "c".repeat(64), consentTextVersion: "2026-10-18-p15-v1", consentedAt: NOW,
    civilName: { firstName: "Éloïse", lastName: "NDONG" }, motivation: "Motivation privée", files: [], state: "queued", attempts: 0, nextAttemptAt: IDLE_AT, generation: 1,
    authorizationSessionId: "private-session", authorizationAuthUserId: "private-user", authorizedAt: NOW, authorizationUntil: NOW + 60_000, authorizationRequired: false, leaseSessionId: "private-session",
    createdAt: NOW, updatedAt: NOW,
  }
  const ids = await t.run(async (ctx) => {
    const result: Id<"commerceApplications">[] = []
    for (let i = 0; i < count; i += 1) result.push(await ctx.db.insert("commerceApplications", { ...base, ...patch, requestId: `request-${i}`, idempotencyKey: `private-key-${i}` }))
    const otherId = await ctx.db.insert("commerceApplications", { ...base, personId: otherPersonId, requestId: "other-request", idempotencyKey: "other-private-key" })
    return { result, otherId }
  })
  const rows = () => t.run(async (ctx) => await ctx.db.query("commerceApplications").withIndex("by_person", (q) => q.eq("personId", personId)).take(100))
  return { t, personId, otherPersonId, base, ...scope, ...ids, rows }
}

describe("P15 — progression des retraits et effacements", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW) })
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

  it("efface les textes et preuves privées des 53 candidatures sans rester sur les 50 premières", async () => {
    const f = await fixture(53)
    expect(await f.t.run(async (ctx) => await revokeJobApplicationsForPerson(ctx, f.personId))).toBe(false)
    expect((await f.rows()).filter((row) => row.revokedAt !== undefined)).toHaveLength(50)
    expect(await f.t.run(async (ctx) => await revokeJobApplicationsForPerson(ctx, f.personId))).toBe(true)
    for (const row of await f.rows()) {
      expect(row.state).toBe("withdrawn")
      expect(row.civilName).toBeUndefined(); expect(row.motivation).toBeUndefined(); expect(row.rawBody).toBeUndefined()
      expect(row.authorizationSessionId).toBeUndefined(); expect(row.authorizationAuthUserId).toBeUndefined(); expect(row.leaseSessionId).toBeUndefined()
      expect(row.authorizedAt).toBeUndefined(); expect(row.authorizationUntil).toBeUndefined()
    }
    expect((await f.t.run(async (ctx) => await ctx.db.get(f.otherId)))?.civilName).toEqual(f.base.civilName)
  })

  it("retire aussi la page suivante pendant que les premiers retraits attendent PRO.GA", async () => {
    const f = await fixture(52, { state: "submitted", dispatchedAt: NOW, applicationRef: "pro.ga:job_application:fixture" })
    expect(await f.t.run(async (ctx) => await revokeJobApplicationsForPerson(ctx, f.personId))).toBe(false)
    expect(await f.t.run(async (ctx) => await revokeJobApplicationsForPerson(ctx, f.personId))).toBe(false)
    expect((await f.rows()).every((row) => row.revokedAt === NOW && row.state === "withdrawal_pending")).toBe(true)
    // ACK simulé : aucun appel de transport ni effacement d'une ligne pour débloquer la lecture.
    await f.t.run(async (ctx) => { for (const id of f.result) await ctx.db.patch(id, { state: "withdrawn" }) })
    expect(await f.t.run(async (ctx) => await revokeJobApplicationsForPerson(ctx, f.personId))).toBe(true)
  })

  it("répare le marqueur d'une ancienne candidature retirée sans réémettre de retrait distant", async () => {
    const f = await fixture(1, { state: "withdrawn", remoteUnconfirmed: true })
    expect(await f.t.run(async (ctx) => await revokeJobApplicationsForPerson(ctx, f.personId))).toBe(true)
    const [row] = await f.rows()
    expect(row?.revokedAt).toBe(NOW); expect(row?.remoteUnconfirmed).toBe(true)
    expect(row?.rawBody).toBeUndefined(); expect(row?.civilName).toBeUndefined(); expect(row?.authorizationSessionId).toBeUndefined()
  })

  it("ferme immédiatement la pièce puis révoque ses références au-delà de la première page", async () => {
    const f = await fixture(53, { state: "submitted", dispatchedAt: NOW })
    const file = { fileId: f.fileId, attachmentRef: "antsia:file:fixture", kind: "cv" as const, sha256: "a".repeat(64), byteSize: 20, transfer: "stored" as const, attempts: 0 }
    await f.t.run(async (ctx) => { for (const id of f.result) await ctx.db.patch(id, { files: [file] }); await ctx.db.patch(f.otherId, { files: [file] }) })
    const firstPage = await f.t.run(async (ctx) => await ctx.db.query("commerceApplications").withIndex("by_person", (q) => q.eq("personId", f.personId)).paginate({ numItems: 50, cursor: null }))
    expect(await f.t.run(async (ctx) => { const row = await ctx.db.get(f.fileId); return row ? await retireApplicationFile(ctx, row) : false })).toBe(true)
    expect(await f.t.run(async (ctx) => (await ctx.db.get(f.fileId))?.state)).toBe("retired")
    expect(await f.t.run(async (ctx) => await ctx.storage.get(f.storageId))).toBeNull()
    expect((await f.rows()).filter((row) => row.files[0]?.transfer === "revoke_pending")).toHaveLength(50)
    await f.t.mutation(continueFile, { personId: f.personId, fileId: f.fileId, cursor: firstPage.continueCursor })
    expect((await f.rows()).every((row) => row.files[0]?.transfer === "revoke_pending")).toBe(true)
    expect((await f.t.run(async (ctx) => await ctx.db.get(f.otherId)))?.files[0]?.transfer).toBe("stored")
  })

  it("refuse une continuation de retrait sous un autre propriétaire", async () => {
    const f = await fixture(1, { state: "submitted", dispatchedAt: NOW })
    await f.t.mutation(continueFile, { personId: f.otherPersonId, fileId: f.fileId, cursor: "invalide" })
    expect((await f.rows())[0]?.state).toBe("submitted")
    expect(await f.t.run(async (ctx) => (await ctx.db.get(f.fileId))?.state)).toBe("ready")
  })
})
