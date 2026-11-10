// @vitest-environment edge-runtime
/**
 * PG-01 — gouvernance des pages : décideur d'une revendication sans conflit d'intérêts, cloches
 * neutres (invitation à signer, revendication tranchée) dédoublonnées et résolues, console de
 * reprise (administrateur de secours, journal), conservation des pièces d'une demande tranchée.
 */
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { PAGE_CLAIM_EVIDENCE_RETENTION_MS } from "@antsia/social-domain/pages"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, testConvex } from "../../test.setup"
import { notifyPerson } from "../notifications/notify"
import { notificationStillVisible } from "../notifications/policy"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }
type GovernanceKind = "page_signatory_invite" | "page_claim_decided"

const P = api.modules.pages.pages
const C = api.modules.pages.claims
const SIG = api.modules.pages.signatories
const ADMIN = api.modules.pages.admin
const B = api.modules.notifications.bell

const PAGE_NAME = "Association des pêcheurs de Lambaréné"
const REASON = "Statuts déposés et procès-verbal d'élection conformes."
/** Les seules colonnes d'une ligne de cloche de gouvernance : des références, aucun contenu. */
const NOTICE_COLUMNS = ["_creationTime", "_id", "createdAt", "dedupKey", "kind", "networkId", "readAt", "recipientPersonId", "resolution", "resolvedAt", "subjectPageClaimId", "subjectPageId"]

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(Date.UTC(2026, 10, 10, 9, 0, 0))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function seed(t: T) {
  return (await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })).root
}

async function membershipOf(t: T, rootId: Id<"networks">, personId: Id<"persons">): Promise<Doc<"networkMemberships">> {
  return await t.run(async (ctx) => (await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", rootId).eq("personId", personId)).unique())!)
}

async function enter(t: T, rootId: Id<"networks">, handle: string, patch: Partial<Pick<Doc<"networkMemberships">, "role" | "status">> = {}): Promise<Person> {
  vi.setSystemTime(Date.now() + 1000)
  const as = t.withIdentity({ subject: `pg01-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: rootId })
  if (Object.keys(patch).length > 0) {
    const membership = await membershipOf(t, rootId, personId)
    await t.run(async (ctx) => { await ctx.db.patch(membership._id, patch) })
  }
  return { as, personId, handle }
}

async function makeOperator(t: T, person: Person, role: "platform_admin" | "platform_operator" = "platform_admin"): Promise<void> {
  await t.run(async (ctx) => { await ctx.db.insert("operators", { personId: person.personId, role, grantedAt: 1 }) })
  await createTestOperatorProof(t, person.as, person.personId)
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try { await promise } catch (error) { return error }
  return null
}
const codeOf = async (promise: Promise<unknown>) => engineErrorCode(await caught(promise))
const ruleOf = async (promise: Promise<unknown>) => engineErrorRule(await caught(promise))?.rule ?? null

async function storeBlob(t: T): Promise<Id<"_storage">> {
  return await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob([new Uint8Array(64)], { type: "application/pdf" }))
    await (ctx.db as unknown as { patch: (table: "_storage", id: Id<"_storage">, value: { contentType: string }) => Promise<void> }).patch("_storage", storageId, { contentType: "application/pdf" })
    return storageId
  })
}

/** Une page de la communauté, sans signataire, dans la racine. */
async function communityPage(t: T, rootId: Id<"networks">, handle: string): Promise<Id<"pages">> {
  return await t.run(async (ctx) => await ctx.db.insert("pages", {
    networkId: rootId, handle, name: PAGE_NAME, ownerKind: "association", trust: "community", trustRank: 0,
    visibility: "network", onRoot: true, status: "active", searchText: `${PAGE_NAME} ${handle}`, createdAt: 1, updatedAt: 1,
  }))
}

async function claim(t: T, person: Person, rootId: Id<"networks">, pageId: Id<"pages">, documents = 1): Promise<Id<"pageClaims">> {
  const evidence = []
  for (let index = 0; index < documents; index += 1) evidence.push({ storageId: await storeBlob(t), mimeType: "application/pdf" })
  return (await person.as.mutation(C.requestPageClaim, { networkId: rootId, pageId, note: "Je préside l'association.", evidence })).claimId
}

async function notices(t: T, rootId: Id<"networks">, personId: Id<"persons">, kind: GovernanceKind): Promise<Doc<"notifications">[]> {
  return await t.run(async (ctx) => (await ctx.db.query("notifications")
    .withIndex("by_network_recipient_createdAt", (q) => q.eq("networkId", rootId).eq("recipientPersonId", personId)).take(50)).filter((row) => row.kind === kind))
}

async function bellItems(rootId: Id<"networks">, who: Person, kind: GovernanceKind) {
  const bell = await who.as.query(B.paginateNotifications, { networkId: rootId, paginationOpts: { cursor: null, numItems: 50 } })
  return bell.page.filter((item) => item.kind === kind)
}

function expectReferencesOnly(row: Doc<"notifications">) {
  expect(row.actorPersonId).toBeUndefined()
  expect(Object.keys(row).every((key) => NOTICE_COLUMNS.includes(key)), Object.keys(row).join(",")).toBe(true)
}

describe("PG-01 — trancher une revendication : la modération du réseau seule, sans conflit d'intérêts", () => {
  it("refuse le demandeur (même modérateur) et tout signataire de la page, même invité ; un modérateur sans lien tranche", async () => {
    const t = testConvex()
    const root = await seed(t)
    const presidente = await enter(t, root, "presidente", { role: "network_moderator" })
    const signer = await enter(t, root, "signataire", { role: "network_moderator" })
    const member = await enter(t, root, "membre")
    const moderator = await enter(t, root, "moderatrice", { role: "network_moderator" })
    const pageId = await communityPage(t, root, "pecheurs-lambarene")
    await t.run(async (ctx) => { await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId: signer.personId, role: "signatory", authorityRevision: 0, createdAt: 1, updatedAt: 1 }) })
    const claimId = await claim(t, presidente, root, pageId)

    for (const who of [presidente, signer]) {
      expect((await who.as.query(C.getPageClaim, { networkId: root, claimId })).canDecide).toBe(false)
      expect(await codeOf(who.as.mutation(C.decidePageClaim, { networkId: root, claimId, decision: "approved", reason: REASON }))).toBe("notFound")
    }
    expect(await codeOf(member.as.mutation(C.decidePageClaim, { networkId: root, claimId, decision: "approved", reason: REASON }))).toBe("notFound")
    expect((await moderator.as.query(C.getPageClaim, { networkId: root, claimId })).canDecide).toBe(true)
    // La file montre la demande au modérateur (la fiche dit s'il peut trancher).
    expect((await signer.as.query(C.paginatePageClaims, { networkId: root, paginationOpts: { numItems: 10, cursor: null } })).page.map((row) => row.claimId)).toEqual([claimId])

    expect(await moderator.as.mutation(C.decidePageClaim, { networkId: root, claimId, decision: "approved", reason: REASON })).toEqual({ status: "approved" })
    // La décision change un FAIT (la confiance) ; le badge, calculé, suit.
    expect(await presidente.as.query(P.getPage, { networkId: root, handle: "pecheurs-lambarene" })).toMatchObject({ badge: "verified", viewer: { role: "admin" } })
    expect((await moderator.as.query(C.getPageClaim, { networkId: root, claimId })).canDecide).toBe(false)
  })
})

describe("PG-01 — cloche « revendication tranchée », au demandeur seul", () => {
  it("validée ou refusée : une ligne sans acteur ni contenu, menée à la page, jamais rouverte au rejeu", async () => {
    const t = testConvex()
    const root = await seed(t)
    const presidente = await enter(t, root, "presidente")
    const moderator = await enter(t, root, "moderatrice", { role: "network_moderator" })
    const curious = await enter(t, root, "curieux")
    const approvedPage = await communityPage(t, root, "pecheurs-lambarene")
    const rejectedPage = await communityPage(t, root, "pecheurs-oyem")
    const approved = await claim(t, presidente, root, approvedPage)
    const rejected = await claim(t, presidente, root, rejectedPage)
    await moderator.as.mutation(C.decidePageClaim, { networkId: root, claimId: approved, decision: "approved", reason: REASON })
    await moderator.as.mutation(C.decidePageClaim, { networkId: root, claimId: rejected, decision: "rejected", reason: "Le mandat présenté est échu." })

    const rows = await notices(t, root, presidente.personId, "page_claim_decided")
    expect(rows.map((row) => row.subjectPageClaimId).sort()).toEqual([approved, rejected].sort())
    for (const row of rows) {
      expectReferencesOnly(row)
      expect(row.dedupKey).toBe(`page_claim_decided|pageClaim:${row.subjectPageClaimId}|-`)
      expect(await t.run((ctx) => notificationStillVisible(ctx, row))).toBe(true)
    }
    expect(await notices(t, root, moderator.personId, "page_claim_decided")).toEqual([])

    const items = await bellItems(root, presidente, "page_claim_decided")
    expect(items).toHaveLength(2)
    for (const item of items) {
      expect(item.actor).toBeNull()
      expect(item.target).toMatchObject({ kind: "page" })
      const text = JSON.stringify(item)
      for (const secret of [PAGE_NAME, REASON, "échu", "approved", "rejected"]) expect(text, secret).not.toContain(secret)
    }
    expect(items.map((item) => item.target && item.target.kind === "page" ? item.target.pageHandle : null).sort()).toEqual(["pecheurs-lambarene", "pecheurs-oyem"])

    // Rejeu : la même ligne, ni rouverte ni redistribuée ; jamais à un tiers.
    const first = rows.find((row) => row.subjectPageClaimId === approved)!
    await t.run(async (ctx) => { await ctx.db.patch(first._id, { readAt: Date.now() }) })
    const replayed = await t.run(async (ctx) => await notifyPerson(ctx, { networkId: root, recipientPersonId: presidente.personId, kind: "page_claim_decided", subject: { pageClaim: approved } }))
    expect(replayed).toBe(first._id)
    expect((await t.run((ctx) => ctx.db.get(first._id)))?.readAt).toBeDefined()
    expect(await t.run(async (ctx) => await notifyPerson(ctx, { networkId: root, recipientPersonId: curious.personId, kind: "page_claim_decided", subject: { pageClaim: approved } }))).toBeNull()
    // Un avis de gouvernance n'a jamais d'acteur.
    expect(await t.run(async (ctx) => await notifyPerson(ctx, { networkId: root, recipientPersonId: presidente.personId, actorPersonId: moderator.personId, kind: "page_claim_decided", subject: { pageClaim: approved } }))).toBeNull()
  })

  it("aucune ligne pour une demande encore en attente", async () => {
    const t = testConvex()
    const root = await seed(t)
    const presidente = await enter(t, root, "presidente")
    const pageId = await communityPage(t, root, "pecheurs-lambarene")
    const claimId = await claim(t, presidente, root, pageId)
    expect(await t.run(async (ctx) => await notifyPerson(ctx, { networkId: root, recipientPersonId: presidente.personId, kind: "page_claim_decided", subject: { pageClaim: claimId } }))).toBeNull()
  })
})

describe("PG-01 — cloche « invitation à signer », résolue à la réponse", () => {
  it("sonne chez la personne invitée, sans acteur ; se résout acceptée, déclinée, annulée ; une nouvelle invitation rafraîchit la ligne", async () => {
    const t = testConvex()
    const root = await seed(t)
    const owner = await enter(t, root, "proprietaire", { status: "verifiee" })
    const awa = await enter(t, root, "awa")
    const bruno = await enter(t, root, "bruno")
    const chloe = await enter(t, root, "chloe")
    const { pageId } = await owner.as.mutation(P.createPage, { networkId: root, name: PAGE_NAME, ownerKind: "association" })
    const handle = (await t.run((ctx) => ctx.db.get(pageId)))!.handle

    // Acceptée.
    await owner.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: awa.handle, role: "signatory" })
    await owner.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: awa.handle, role: "signatory" })
    let rows = await notices(t, root, awa.personId, "page_signatory_invite")
    expect(rows).toHaveLength(1)
    expectReferencesOnly(rows[0]!)
    expect(rows[0]).toMatchObject({ subjectPageId: pageId, dedupKey: `page_signatory_invite|page:${pageId}|-` })
    expect(await t.run((ctx) => notificationStillVisible(ctx, rows[0]!))).toBe(true)
    const [item] = await bellItems(root, awa, "page_signatory_invite")
    expect(item).toMatchObject({ actor: null, resolution: null, target: { kind: "page", pageId, pageHandle: handle } })
    expect(JSON.stringify(item)).not.toContain(PAGE_NAME)
    await awa.as.mutation(SIG.respondToPageInvitation, { networkId: root, pageId, accept: true })
    rows = await notices(t, root, awa.personId, "page_signatory_invite")
    expect(rows[0]).toMatchObject({ resolution: "accepted" })
    expect(rows[0]?.readAt).toBeDefined()
    // Tranchée : plus aucun transport.
    expect(await t.run((ctx) => notificationStillVisible(ctx, rows[0]!))).toBe(false)

    // Déclinée, puis invitée de nouveau : la même ligne, rouverte et neuve.
    await owner.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: bruno.handle, role: "admin" })
    await bruno.as.mutation(SIG.respondToPageInvitation, { networkId: root, pageId, accept: false })
    rows = await notices(t, root, bruno.personId, "page_signatory_invite")
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ resolution: "declined" })
    await owner.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: bruno.handle, role: "signatory" })
    const renewed = await notices(t, root, bruno.personId, "page_signatory_invite")
    expect(renewed).toHaveLength(1)
    expect(renewed[0]?._id).toBe(rows[0]?._id)
    expect(renewed[0]?.resolution).toBeUndefined()
    expect(renewed[0]?.readAt).toBeUndefined()

    // Retirée avant réponse : annulée.
    await owner.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle: chloe.handle, role: "signatory" })
    await owner.as.mutation(SIG.revokePageRole, { networkId: root, pageId, personId: chloe.personId })
    expect(await notices(t, root, chloe.personId, "page_signatory_invite")).toMatchObject([{ resolution: "cancelled" }])
    // Le propriétaire n'est jamais prévenu de son propre geste.
    expect(await notices(t, root, owner.personId, "page_signatory_invite")).toEqual([])
  })

  it("l'habilitation de console sonne aussi, sans nommer l'opérateur", async () => {
    const t = testConvex()
    const root = await seed(t)
    const operator = await enter(t, root, "operatrice")
    const agent = await enter(t, root, "agent")
    await makeOperator(t, operator)
    const pageId = await communityPage(t, root, "pecheurs-lambarene")
    expect(await operator.as.mutation(ADMIN.grantPageAdmin, { pageId, personId: agent.personId, reason: "Habilitation demandée par le bureau." })).toEqual({ invited: true })
    const rows = await notices(t, root, agent.personId, "page_signatory_invite")
    expect(rows).toHaveLength(1)
    expectReferencesOnly(rows[0]!)
  })
})

describe("PG-01 — console de reprise : administrateur de secours, journal", () => {
  it("jamais sur une page qui a un administrateur vivant ; une page abandonnée reçoit un administrateur de secours tracé", async () => {
    const t = testConvex()
    const root = await seed(t)
    const owner = await enter(t, root, "proprietaire", { status: "verifiee" })
    const operator = await enter(t, root, "operatrice")
    const reader = await enter(t, root, "lectrice")
    const rescuer = await enter(t, root, "secours")
    const leaving = await enter(t, root, "partant")
    await makeOperator(t, operator)
    await makeOperator(t, reader, "platform_operator")
    const { pageId } = await owner.as.mutation(P.createPage, { networkId: root, name: PAGE_NAME, ownerKind: "association" })
    const motive = "Le bureau de l'association a changé, demande écrite reçue."

    expect(await operator.as.query(ADMIN.pageGovernance, { pageId })).toEqual({ liveAdmins: 1, pendingAdmins: 0, federated: false })
    expect(await ruleOf(operator.as.mutation(ADMIN.grantRescuePageAdmin, { pageId, personId: rescuer.personId, reason: motive }))).toBe("PAGE_HAS_LIVE_ADMIN")
    expect(await notices(t, root, rescuer.personId, "page_signatory_invite")).toEqual([])

    // L'unique administrateur quitte le réseau : la page n'a plus de gardien vivant.
    const ownerMembership = await membershipOf(t, root, owner.personId)
    await t.run(async (ctx) => { await ctx.db.patch(ownerMembership._id, { status: "partie" }) })
    expect(await operator.as.query(ADMIN.pageGovernance, { pageId })).toEqual({ liveAdmins: 0, pendingAdmins: 0, federated: false })
    // Un opérateur lecteur voit, n'agit pas.
    expect(await codeOf(reader.as.mutation(ADMIN.grantRescuePageAdmin, { pageId, personId: rescuer.personId, reason: motive }))).toBe("operatorRequired")
    expect(await ruleOf(operator.as.mutation(ADMIN.grantRescuePageAdmin, { pageId, personId: rescuer.personId, reason: "court" }))).toBe("DECISION_REASON_LENGTH")
    // La personne désignée doit être membre active du réseau de la page.
    const leavingMembership = await membershipOf(t, root, leaving.personId)
    await t.run(async (ctx) => { await ctx.db.patch(leavingMembership._id, { status: "partie" }) })
    expect(await ruleOf(operator.as.mutation(ADMIN.grantRescuePageAdmin, { pageId, personId: leaving.personId, reason: motive }))).toBe("PAGE_RESCUE_INELIGIBLE")

    expect(await operator.as.mutation(ADMIN.grantRescuePageAdmin, { pageId, personId: rescuer.personId, reason: motive })).toEqual({ invited: true })
    expect(await operator.as.mutation(ADMIN.grantRescuePageAdmin, { pageId, personId: rescuer.personId, reason: motive })).toEqual({ invited: true })
    const journal = await t.run(async (ctx) => (await ctx.db.query("engineAudit").withIndex("by_subject_at", (q) => q.eq("subjectTable", "pages").eq("subjectId", pageId)).take(20)).filter((row) => row.action === "page.signatory_grant"))
    expect(journal).toHaveLength(1)
    expect(journal[0]).toMatchObject({ capacity: "platform_admin", actorPersonId: operator.personId, details: { reason: motive, targetPersonId: rescuer.personId, role: "admin", rescue: true, liveAdmins: 0, invited: true } })
    expect(await operator.as.query(ADMIN.pageGovernance, { pageId })).toEqual({ liveAdmins: 0, pendingAdmins: 1, federated: false })
    expect(await notices(t, root, rescuer.personId, "page_signatory_invite")).toHaveLength(1)

    // Acceptée, l'invitation donne un gardien vivant : un second secours est refusé.
    await rescuer.as.mutation(SIG.respondToPageInvitation, { networkId: root, pageId, accept: true })
    expect(await operator.as.query(ADMIN.pageGovernance, { pageId })).toEqual({ liveAdmins: 1, pendingAdmins: 0, federated: false })
    expect(await ruleOf(operator.as.mutation(ADMIN.grantRescuePageAdmin, { pageId, personId: reader.personId, reason: motive }))).toBe("PAGE_HAS_LIVE_ADMIN")
  })

  it("confiance et adresse : décisions motivées, chacune sa ligne au journal ; un opérateur lecteur n'agit pas", async () => {
    const t = testConvex()
    const root = await seed(t)
    const operator = await enter(t, root, "operatrice")
    const reader = await enter(t, root, "lectrice")
    await makeOperator(t, operator)
    await makeOperator(t, reader, "platform_operator")
    const pageId = await communityPage(t, root, "pecheurs-lambarene")
    expect(await codeOf(reader.as.mutation(ADMIN.setPageTrust, { pageId, trust: "verified", reason: "Pièces vérifiées hors ligne." }))).toBe("operatorRequired")
    expect(await codeOf(reader.as.mutation(ADMIN.setPageHandle, { pageId, handle: "pecheurs-du-lac", reason: "Adresse demandée par le bureau." }))).toBe("operatorRequired")
    await operator.as.mutation(ADMIN.setPageTrust, { pageId, trust: "verified", reason: "Pièces vérifiées hors ligne." })
    await operator.as.mutation(ADMIN.setPageHandle, { pageId, handle: "pecheurs-du-lac", reason: "Adresse demandée par le bureau." })
    const journal = await t.run(async (ctx) => await ctx.db.query("engineAudit").withIndex("by_subject_at", (q) => q.eq("subjectTable", "pages").eq("subjectId", pageId)).take(20))
    expect(journal.map((row) => row.action)).toEqual(["page.trust_set", "page.handle_set"])
    expect(journal[1]).toMatchObject({ details: { previousHandle: "pecheurs-lambarene", handle: "pecheurs-du-lac" } })
  })
})

describe("PG-01 — conservation des pièces d'une revendication tranchée", () => {
  it("purgées au terme de la conservation, par la tâche bornée ; la décision et son motif restent", async () => {
    const t = testConvex()
    const root = await seed(t)
    const presidente = await enter(t, root, "presidente")
    const moderator = await enter(t, root, "moderatrice", { role: "network_moderator" })
    const pageId = await communityPage(t, root, "pecheurs-lambarene")
    const otherPage = await communityPage(t, root, "pecheurs-oyem")
    const claimId = await claim(t, presidente, root, pageId, 2)
    const withdrawn = await claim(t, presidente, root, otherPage)
    await presidente.as.mutation(C.withdrawPageClaim, { networkId: root, claimId: withdrawn })
    const documents = (await t.run((ctx) => ctx.db.get(claimId)))!.evidenceStorageIds
    await moderator.as.mutation(C.decidePageClaim, { networkId: root, claimId, decision: "rejected", reason: "Le mandat présenté est échu." })
    const decided = (await t.run((ctx) => ctx.db.get(claimId)))!
    expect(decided.evidencePurgeAt).toBe(decided.decidedAt! + PAGE_CLAIM_EVIDENCE_RETENTION_MS)
    expect((await t.run((ctx) => ctx.db.get(withdrawn)))?.evidencePurgeAt).toBeUndefined()

    const blobsLeft = async () => await t.run(async (ctx) => {
      const blobs = await Promise.all(documents.map(async (id) => await ctx.db.system.get("_storage", id)))
      const scans = await Promise.all(documents.map(async (id) => await ctx.db.query("fileScans").withIndex("by_storageId", (q) => q.eq("storageId", id)).first()))
      return { blobs: blobs.filter((row) => row !== null).length, scans: scans.filter((row) => row !== null).length }
    })
    expect(await t.mutation(internal.modules.pages.claims.purgeDecidedClaimEvidence, {})).toBe(0)
    expect(await blobsLeft()).toEqual({ blobs: 2, scans: 2 })

    vi.setSystemTime(decided.decidedAt! + PAGE_CLAIM_EVIDENCE_RETENTION_MS + 1)
    expect(await t.mutation(internal.modules.pages.claims.purgeDecidedClaimEvidence, {})).toBe(1)
    expect(await blobsLeft()).toEqual({ blobs: 0, scans: 0 })
    const after = (await t.run((ctx) => ctx.db.get(claimId)))!
    expect(after).toMatchObject({ status: "rejected", decisionReason: "Le mandat présenté est échu.", evidenceStorageIds: [] })
    expect(after.evidencePurgeAt).toBeUndefined()
    // (La session de test expire après 90 jours : la fiche se relit par la base, sans requête authentifiée.)
    expect(await t.mutation(internal.modules.pages.claims.purgeDecidedClaimEvidence, {})).toBe(0)
  })
})
