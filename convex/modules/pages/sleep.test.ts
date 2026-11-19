// @vitest-environment edge-runtime
/**
 * AS-11a — le sommeil d'une page (décision du 19/11/2026) : un administrateur VIVANT la met en
 * sommeil trente jours ; tout administrateur la réactive tant que l'échéance n'est pas passée ;
 * échue, elle ne se réactive plus depuis la page et rien n'est effacé ; une mesure du juge tient ;
 * l'opérateur reprend la main ; l'équipe est figée (ni habilitation, ni départ, ni revendication) ;
 * chaque geste laisse sa ligne au journal.
 */
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { PAGE_SLEEP_MS } from "@antsia/social-domain/pages"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }

const S = api.modules.pages.sleep
const P = api.modules.pages.pages
const SIG = api.modules.pages.signatories
const C = api.modules.pages.claims
const ADMIN = api.modules.pages.admin

const NOW = Date.UTC(2026, 10, 19, 10)
const DAY = 24 * 3_600_000
const HANDLE = "association-sommeil-recette"
const REASON = "Retrait décidé par l'équipe de la plateforme après examen."

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

/** Un membre de la racine, profil publié. */
async function enter(t: T, rootId: Id<"networks">, handle: string, patch: Partial<Pick<Doc<"networkMemberships">, "role">> = {}): Promise<Person> {
  const as = t.withIdentity({ subject: `as11a-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: rootId })
  if (patch.role !== undefined) {
    await t.run(async (ctx) => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", rootId).eq("personId", personId)).unique()
      if (membership) await ctx.db.patch(membership._id, { role: patch.role })
    })
  }
  return { as, personId, handle }
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  return null
}
/** Le refus d'un appel : la règle du domaine, sinon le code du moteur ; `null` s'il réussit. */
async function refusal(promise: Promise<unknown>): Promise<string | null> {
  const error = await caught(promise)
  if (error === null) return null
  return engineErrorRule(error)?.rule ?? engineErrorCode(error) ?? "unknown"
}

/** Une page posée telle quelle dans un réseau (association « communauté » par défaut). */
async function insertPage(t: T, networkId: Id<"networks">, handle: string, fields: Partial<Pick<Doc<"pages">, "ownerKind" | "trust" | "status">> = {}): Promise<Id<"pages">> {
  return await t.run(async (ctx) => await ctx.db.insert("pages", {
    networkId, handle, name: "Association de recette du sommeil", ownerKind: fields.ownerKind ?? "association", trust: fields.trust ?? "community", trustRank: 0,
    visibility: "network", onRoot: true, status: fields.status ?? "active", searchText: handle, createdAt: NOW, updatedAt: NOW,
  }))
}

async function seat(t: T, networkId: Id<"networks">, pageId: Id<"pages">, person: Person, role: Doc<"pageSignatories">["role"]): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("pageSignatories", { networkId, pageId, personId: person.personId, role, authorityRevision: 0, acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
  })
}

/** La racine, une page d'association et son équipe ACCEPTÉE : deux administratrices, un éditeur, une modératrice, plus un tiers. */
async function fixture() {
  const t = testConvex()
  const { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const admin = await enter(t, root, "sommeil-admin")
  const secondAdmin = await enter(t, root, "sommeil-second-admin")
  const editor = await enter(t, root, "sommeil-editeur")
  const moderator = await enter(t, root, "sommeil-moderatrice")
  const outsider = await enter(t, root, "sommeil-tiers")
  const pageId = await insertPage(t, root, HANDLE)
  await seat(t, root, pageId, admin, "admin")
  await seat(t, root, pageId, secondAdmin, "admin")
  await seat(t, root, pageId, editor, "signatory")
  await seat(t, root, pageId, moderator, "moderator")
  return { t, root, testClosed, pageId, admin, secondAdmin, editor, moderator, outsider }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

async function pageRow(f: Fixture, pageId = f.pageId): Promise<Doc<"pages"> | null> {
  return await f.t.run(async (ctx) => await ctx.db.get(pageId))
}

async function journal(f: Fixture, pageId = f.pageId): Promise<Doc<"engineAudit">[]> {
  return await f.t.run(async (ctx) => await ctx.db.query("engineAudit").withIndex("by_subject_at", (q) => q.eq("subjectTable", "pages").eq("subjectId", pageId)).take(20))
}

async function makeOperator(f: Fixture, person: Person): Promise<void> {
  await f.t.run(async (ctx) => {
    await ctx.db.insert("operators", { personId: person.personId, role: "platform_admin", grantedAt: 1 })
  })
  await createTestOperatorProof(f.t, person.as, person.personId)
}

const sleep = (f: Fixture, who: Person, pageId = f.pageId, networkId = f.root) => who.as.mutation(S.putPageToSleep, { networkId, pageId })
const wake = (f: Fixture, who: Person, pageId = f.pageId) => who.as.mutation(S.wakePage, { networkId: f.root, pageId })
const sleeping = (f: Fixture, who: Person) => who.as.query(S.mySleepingPages, { networkId: f.root })

describe("AS-11a — mettre sa page en sommeil : un administrateur vivant d'une page native, créable par un membre", () => {
  it("l'administratrice l'endort pour trente jours : la page se ferme, l'échéance se pose, le journal le dit", async () => {
    const f = await fixture()
    expect(await sleep(f, f.admin)).toEqual({ sleepEndsAt: NOW + PAGE_SLEEP_MS })
    expect(await pageRow(f)).toMatchObject({ status: "inactive", deactivatedAt: NOW, sleepEndsAt: NOW + PAGE_SLEEP_MS })
    // Absente partout comme une page retirée : la fiche, pour l'équipe comme pour un tiers.
    expect(await f.outsider.as.query(P.getPage, { networkId: f.root, handle: HANDLE })).toBeNull()
    expect(await f.admin.as.query(P.getPage, { networkId: f.root, handle: HANDLE })).toBeNull()
    expect(await f.admin.as.query(P.myPages, { networkId: f.root })).toEqual([])
    expect(await journal(f)).toMatchObject([{ action: "page.sleep", capacity: "page_admin", actorPersonId: f.admin.personId, networkId: f.root, details: { sleepEndsAt: NOW + PAGE_SLEEP_MS } }])
    // Les directs de la page se ferment, comme à tout retrait (écrivain partagé `applyPageStatus`).
    const scheduled = await f.t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").take(50))
    expect(scheduled.some((job) => job.name.includes("closePageDirects"))).toBe(true)
  })

  it("refuse l'éditeur, la modératrice, un tiers, une institution, un reflet, une page d'ailleurs ou déjà retirée", async () => {
    const f = await fixture()
    for (const who of [f.editor, f.moderator, f.outsider]) expect(await refusal(sleep(f, who))).toBe("pageRoleRequired")
    const institution = await insertPage(f.t, f.root, "institution-sommeil", { ownerKind: "institution" })
    await seat(f.t, f.root, institution, f.admin, "admin")
    expect(await refusal(sleep(f, f.admin, institution))).toBe("pageRoleRequired")
    const mirrored = await insertPage(f.t, f.root, "reflet-sommeil")
    await seat(f.t, f.root, mirrored, f.admin, "admin")
    await f.t.run(async (ctx) => {
      const emitterId = await ctx.db.insert("federationEmitters", { networkId: f.root, slug: "source-sommeil", environment: "sandbox", enabled: true, keyEnvName: "TEST_ONLY_KEY", allowedContracts: [], revision: 1, createdAt: 1, updatedAt: 1 })
      await ctx.db.insert("mirrors", { networkId: f.root, emitterId, environment: "sandbox", contract: "test-only", objectRef: "test/page-sommeil", localTable: "pages", localId: mirrored, updatedAt: 1 })
    })
    expect(await refusal(sleep(f, f.admin, mirrored))).toBe("notFound")
    const elsewhere = await insertPage(f.t, f.testClosed, "ailleurs-sommeil")
    await seat(f.t, f.testClosed, elsewhere, f.admin, "admin")
    expect(await refusal(sleep(f, f.admin, elsewhere))).toBe("notFound")
    const retired = await insertPage(f.t, f.root, "retiree-sommeil", { status: "inactive" })
    await seat(f.t, f.root, retired, f.admin, "admin")
    expect(await refusal(sleep(f, f.admin, retired))).toBe("notFound")
    // Rien n'a été écrit sur la page refusée.
    expect(await pageRow(f)).toMatchObject({ status: "active" })
    expect((await pageRow(f))?.sleepEndsAt).toBeUndefined()
    expect(await journal(f)).toEqual([])
  })
})

describe("AS-11a — la liste « En sommeil » de l'équipe et la réactivation", () => {
  it("toute l'équipe voit la page endormie, seul un administrateur peut la réactiver ; un tiers ne voit rien", async () => {
    const f = await fixture()
    await sleep(f, f.admin)
    const card = { pageId: f.pageId, networkId: f.root, handle: HANDLE, name: "Association de recette du sommeil", shortName: null, logoUrl: null, badge: "community", ownerKind: "association", country: null }
    const ends = NOW + PAGE_SLEEP_MS
    expect(await sleeping(f, f.secondAdmin)).toEqual([{ ...card, teamRole: "admin", sleepEndsAt: ends, state: "asleep", canWake: true }])
    expect(await sleeping(f, f.editor)).toEqual([{ ...card, teamRole: "signatory", sleepEndsAt: ends, state: "asleep", canWake: false }])
    expect(await sleeping(f, f.moderator)).toEqual([{ ...card, teamRole: "moderator", sleepEndsAt: ends, state: "asleep", canWake: false }])
    expect(await sleeping(f, f.outsider)).toEqual([])
    expect(await refusal(wake(f, f.editor))).toBe("pageRoleRequired")
    expect(await refusal(wake(f, f.moderator))).toBe("pageRoleRequired")
    expect(await refusal(wake(f, f.outsider))).toBe("notFound")
  })

  it("une AUTRE administratrice la réactive : tout revient, l'échéance s'efface, le journal dit qui", async () => {
    const f = await fixture()
    await sleep(f, f.admin)
    vi.setSystemTime(NOW + 3 * DAY)
    expect(await wake(f, f.secondAdmin)).toEqual({ status: "active" })
    const row = await pageRow(f)
    expect(row).toMatchObject({ status: "active" })
    expect(row?.sleepEndsAt).toBeUndefined()
    expect(row?.deactivatedAt).toBeUndefined()
    expect(await f.outsider.as.query(P.getPage, { networkId: f.root, handle: HANDLE })).toMatchObject({ pageId: f.pageId })
    expect((await f.admin.as.query(P.myPages, { networkId: f.root })).map((page) => page.pageId)).toEqual([f.pageId])
    expect(await sleeping(f, f.admin)).toEqual([])
    expect((await journal(f)).map((line) => [line.action, line.actorPersonId])).toEqual([["page.sleep", f.admin.personId], ["page.wake", f.secondAdmin.personId]])
    expect((await journal(f)).at(-1)).toMatchObject({ capacity: "page_admin", details: { sleepEndsAt: NOW + PAGE_SLEEP_MS } })
    // Réveillée, elle n'est plus en sommeil : un second réveil est un refus indistinct.
    expect(await refusal(wake(f, f.admin))).toBe("notFound")
  })

  it("échue à trente jours : la réactivation est refusée et rien n'est effacé", async () => {
    const f = await fixture()
    await sleep(f, f.admin)
    // Trente jours dépasseraient la session de test : l'échéance est rapprochée à la milliseconde
    // qui suit, ce qui éprouve la même frontière (`now >= sleepEndsAt`).
    const ends = NOW + 1
    await f.t.run(async (ctx) => {
      await ctx.db.patch(f.pageId, { sleepEndsAt: ends })
    })
    expect((await sleeping(f, f.admin))[0]).toMatchObject({ state: "asleep", canWake: true })
    vi.setSystemTime(ends)
    expect((await sleeping(f, f.admin))[0]).toMatchObject({ state: "expired", canWake: false })
    expect(await refusal(wake(f, f.admin))).toBe("PAGE_SLEEP_EXPIRED")
    expect(engineErrorRule(await caught(wake(f, f.secondAdmin)))?.params).toEqual({ days: 30 })
    expect(await pageRow(f)).toMatchObject({ status: "inactive", sleepEndsAt: ends })
    const team = await f.t.run(async (ctx) => await ctx.db.query("pageSignatories").withIndex("by_page_person", (q) => q.eq("pageId", f.pageId)).take(10))
    expect(team).toHaveLength(4)
  })

  it("une mesure du juge sur la page tient : réactivation en conflit, `canWake` faux", async () => {
    const f = await fixture()
    await sleep(f, f.admin)
    await f.t.run(async (ctx) => {
      await ctx.db.insert("judicialMeasures", {
        networkId: f.root, kind: "suspend_account", target: { kind: "page", id: f.pageId }, targetKind: "page", targetId: f.pageId, orderReference: "RG FICTIF 2026/0011",
        status: "active", startsAt: NOW, endsAt: NOW + 10 * DAY, executedAt: NOW, createdByPersonId: f.outsider.personId, effects: { membershipSuspended: false, pageDeactivated: false, contentRemoved: false },
        createdAt: NOW, updatedAt: NOW,
      })
    })
    expect((await sleeping(f, f.admin))[0]).toMatchObject({ state: "asleep", canWake: false })
    expect(await refusal(wake(f, f.admin))).toBe("conflict")
    expect(await pageRow(f)).toMatchObject({ status: "inactive" })
  })
})

describe("AS-11a — l'opérateur reprend la main sur une page en sommeil", () => {
  it("la retirer efface l'échéance (journalisé, `changed: true`) : l'équipe ne la réactive plus", async () => {
    const f = await fixture()
    const operator = await enter(f.t, f.root, "sommeil-operatrice")
    await makeOperator(f, operator)
    await sleep(f, f.admin)
    expect(await operator.as.mutation(ADMIN.setPageStatus, { pageId: f.pageId, status: "inactive", reason: REASON })).toEqual({ changed: true })
    const row = await pageRow(f)
    expect(row).toMatchObject({ status: "inactive", deactivatedAt: NOW })
    expect(row?.sleepEndsAt).toBeUndefined()
    expect((await journal(f)).at(-1)).toMatchObject({ action: "page.status_set", actorPersonId: operator.personId, details: { previousStatus: "inactive", status: "inactive", previousSleepEndsAt: NOW + PAGE_SLEEP_MS } })
    expect(await refusal(wake(f, f.admin))).toBe("notFound")
    expect(await sleeping(f, f.admin)).toEqual([])
    // Rejouée, la décision ne change plus rien.
    expect(await operator.as.mutation(ADMIN.setPageStatus, { pageId: f.pageId, status: "inactive", reason: REASON })).toEqual({ changed: false })
    // La console voit l'état réel : plus d'échéance.
    const listed = await operator.as.query(ADMIN.paginatePages, { networkId: f.root, status: "inactive", paginationOpts: { numItems: 10, cursor: null } })
    expect(listed.page.find((page) => page.pageId === f.pageId)).toMatchObject({ status: "inactive", sleepEndsAt: null })
  })

  it("la rétablir efface aussi l'échéance ; la console montre l'échéance tant qu'elle court", async () => {
    const f = await fixture()
    const operator = await enter(f.t, f.root, "sommeil-operateur")
    await makeOperator(f, operator)
    await sleep(f, f.admin)
    const listed = await operator.as.query(ADMIN.paginatePages, { networkId: f.root, status: "inactive", paginationOpts: { numItems: 10, cursor: null } })
    expect(listed.page.find((page) => page.pageId === f.pageId)).toMatchObject({ sleepEndsAt: NOW + PAGE_SLEEP_MS, deactivatedAt: NOW })
    expect(await operator.as.mutation(ADMIN.setPageStatus, { pageId: f.pageId, status: "active", reason: REASON })).toEqual({ changed: true })
    const row = await pageRow(f)
    expect(row).toMatchObject({ status: "active" })
    expect(row?.sleepEndsAt).toBeUndefined()
  })
})

describe("AS-11a — l'équipe d'une page en sommeil est figée", () => {
  it("ni habilitation, ni départ, ni rôle changé, ni revendication ; tout redevient possible au réveil", async () => {
    const f = await fixture()
    await sleep(f, f.admin)
    expect(await refusal(f.admin.as.mutation(SIG.grantPageRole, { networkId: f.root, pageId: f.pageId, handle: f.outsider.handle, role: "moderator" }))).toBe("notFound")
    expect(await refusal(f.moderator.as.mutation(SIG.revokePageRole, { networkId: f.root, pageId: f.pageId, personId: f.moderator.personId }))).toBe("notFound")
    expect(await refusal(f.admin.as.mutation(SIG.revokePageRole, { networkId: f.root, pageId: f.pageId, personId: f.editor.personId }))).toBe("notFound")
    expect(await refusal(f.outsider.as.mutation(C.requestPageClaim, { networkId: f.root, pageId: f.pageId, evidence: [] }))).toBe("notFound")
    await wake(f, f.admin)
    expect(await f.moderator.as.mutation(SIG.revokePageRole, { networkId: f.root, pageId: f.pageId, personId: f.moderator.personId })).toEqual({ revoked: true })
  })

  it("une revendication en attente ne se valide pas pendant le sommeil ; elle se refuse", async () => {
    const f = await fixture()
    const reviewer = await enter(f.t, f.root, "sommeil-moderation", { role: "network_moderator" })
    // Une page sans administrateur, revendiquée, puis tenue par une administratrice qui l'endort.
    const pageId = await insertPage(f.t, f.root, "association-revendiquee-sommeil")
    const storageId = await f.t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob([new Uint8Array(64)], { type: "application/pdf" }))
      await (ctx.db as unknown as { patch: (table: "_storage", storage: Id<"_storage">, value: { contentType: string }) => Promise<void> }).patch("_storage", id, { contentType: "application/pdf" })
      return id
    })
    const { claimId } = await f.outsider.as.mutation(C.requestPageClaim, { networkId: f.root, pageId, note: "Je préside l'association.", evidence: [{ storageId, mimeType: "application/pdf" }] })
    await seat(f.t, f.root, pageId, f.admin, "admin")
    await sleep(f, f.admin, pageId)
    expect(await refusal(reviewer.as.mutation(C.decidePageClaim, { networkId: f.root, claimId, decision: "approved", reason: "Statuts déposés et conformes." }))).toBe("conflict")
    const team = await f.t.run(async (ctx) => await ctx.db.query("pageSignatories").withIndex("by_page_person", (q) => q.eq("pageId", pageId)).take(10))
    expect(team.map((row) => row.personId)).toEqual([f.admin.personId])
    expect(await reviewer.as.mutation(C.decidePageClaim, { networkId: f.root, claimId, decision: "rejected", reason: "Le mandat présenté est échu." })).toEqual({ status: "rejected" })
  })
})
