// @vitest-environment edge-runtime
/**
 * ADR-0042, lot A2 (CH-815) — les pages officielles d'un réseau, par SON administrateur (fiche § 3 :
 * décision du propriétaire du 22/11, « les pages officielles sont créées par le super admin » ;
 * § 4.2, section « Institutions et pages officielles »).
 *
 * Recette d'acceptation, écrite avant le code. `pages/networkAdmin` porte les jumeaux, bornés au
 * réseau de l'administrateur, des pouvoirs de console sur les pages d'institution
 * (`pages/admin.createInstitutionPage`, `grantPageAdmin`) et du sommeil (`pages/sleep`) :
 *
 *   · lister les pages officielles du réseau (état, sommeil compris ; signataire) ;
 *   · créer une page officielle DANS CE RÉSEAU seulement (jamais sur la racine : « Officiel » ne
 *     s'affiche nulle part ailleurs), avec son signataire, membre du réseau à l'identité forte
 *     qu'exige la console (`PAGE_SIGNATORY_IDENTITY_REQUIRED`) ;
 *   · désigner ou remplacer le signataire ; mettre la page en sommeil et la réveiller ;
 *   · chercher un candidat signataire par son identifiant.
 *
 * Pour chaque porte : un membre, un modérateur, un administrateur en session de l'application des
 * membres (par code, ou IDN scellée pour diaspora_ga), l'administrateur d'un autre réseau, et la
 * fonctionnalité `pages` fermée reçoivent le refus du non-membre, sans rien écrire ; la session
 * prouvée et journalisée de l'application d'administration passe, et chaque décision entre au
 * journal à titre de `network_admin`. Aucune réponse ne porte la preuve de session. Le retrait du
 * badge reste à la plateforme (`setPageTrust`). Données de fixture fictives.
 */
import { PAGE_SLEEP_MS } from "@antsia/social-domain/pages"
import { ConvexError } from "convex/values"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import { SEED_CONFIRMATION } from "../seeds/foundations"
import { joinDeclaredDiasporaFixture, openNetworkFeatures, openTestNetworkAdminSession, testConvex } from "../test.setup"

type T = ReturnType<typeof testConvex>
type As = ReturnType<T["withIdentity"]>
type Member = { as: As; personId: Id<"persons"> }
type Role = Doc<"networkMemberships">["role"]

const NOW = Date.UTC(2026, 10, 23, 10)
const PAGE = { cursor: null, numItems: 20 }
const REASON = "Institution reconnue par l'administration du réseau (fixture)."
const MEMBERS_APP = "diaspora_ga"
const REFUSAL = { code: "notFound" }

const NA = api.modules.pages.networkAdmin

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

/** Les données du refus (`ConvexError`), ou `null` si l'appel passe. */
async function refusalOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error instanceof ConvexError ? error.data : { unexpected: String(error) }
  }
  return null
}

/** Aucune réponse ne porte la preuve de session (sujet IDN, session, application). */
function expectNoSessionProof(value: unknown) {
  const text = JSON.stringify(value)
  for (const field of ["adminSession", "idnSubject", "sessionId", "networkAdminAccess", "application"]) expect(text, field).not.toContain(field)
}

/** Une personne au profil publié ; IDN à la garantie demandée (`null` : aucun lien IDN). */
async function person(t: T, handle: string, loa: 1 | 2 | null = 2): Promise<Member> {
  const as = t.withIdentity({ subject: `a2-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  if (loa !== null) {
    await t.run(async (ctx) => {
      await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `idn-${personId}`, loa, nationality: "GA", linkedAt: NOW })
    })
  }
  return { as, personId }
}

/** Un membre de DIASPORA.GA, au rôle de réseau demandé ; sa session est celle de l'application des membres. */
async function member(t: T, networkId: Id<"networks">, handle: string, role?: Role, loa: 1 | 2 = 2): Promise<Member> {
  const someone = await person(t, handle, loa)
  await joinDeclaredDiasporaFixture(someone.as, { networkId, facet: { countryOfResidence: "FR" } })
  if (role) await setRole(t, networkId, someone.personId, role)
  return someone
}

async function setRole(t: T, networkId: Id<"networks">, personId: Id<"persons">, role: Role) {
  await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique()
    if (!row) throw new Error("Adhésion de fixture absente")
    await ctx.db.patch(row._id, { role })
  })
}

/** Une page d'institution « Officiel » posée d'avance dans un réseau, avec son administrateur accepté. */
async function seededOfficialPage(t: T, networkId: Id<"networks">, handle: string, adminPersonId: Id<"persons">) {
  return await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", {
      networkId, handle, name: `Institution ${handle}`, ownerKind: "institution", trust: "official", trustRank: 2, country: "FR",
      visibility: "network", onRoot: false, status: "active", searchText: handle, createdAt: NOW - 10, updatedAt: NOW - 10,
    })
    await ctx.db.insert("pageSignatories", { networkId, pageId, personId: adminPersonId, role: "admin", authorityRevision: 0, acceptedAt: NOW - 5, createdAt: NOW - 10, updatedAt: NOW - 5 })
    return pageId
  })
}

/** Une page d'association créée par un membre : jamais une page officielle. */
async function seededMemberPage(t: T, networkId: Id<"networks">, handle: string) {
  return await t.run(async (ctx) => await ctx.db.insert("pages", {
    networkId, handle, name: `Association ${handle}`, ownerKind: "association", trust: "community", trustRank: 0, country: "FR",
    visibility: "network", onRoot: false, status: "active", searchText: handle, createdAt: NOW - 20, updatedAt: NOW - 20,
  }))
}

async function fixture() {
  const t = testConvex()
  const { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  await openNetworkFeatures(t, network)
  const reader = await member(t, network, "lectrice.a2")
  const moderator = await member(t, network, "moderatrice.a2", "network_moderator")
  const admin = await member(t, network, "admin.a2", "network_admin")
  const signatory = await member(t, network, "signataire.a2")
  const successor = await member(t, network, "successeur.a2")
  const weak = await member(t, network, "garantie.faible.a2", undefined, 1)
  const outsider = await person(t, "hors.reseau.a2")
  // L'administrateur d'un AUTRE réseau (la racine), simple membre de DIASPORA.GA.
  const otherAdmin = await member(t, network, "admin.racine.a2")
  await setRole(t, root, otherAdmin.personId, "network_admin")
  const pageId = await seededOfficialPage(t, network, "institution-a2", signatory.personId)
  const rootPageId = await seededOfficialPage(t, root, "institution-racine-a2", signatory.personId)
  const memberPageId = await seededMemberPage(t, network, "association-a2")
  const adminApp = await openTestNetworkAdminSession(t, admin.as, admin.personId, network)
  const refused: Record<string, Member> = {
    "membre, session de l'application des membres": reader,
    "membre, session IDN de l'application d'administration": { personId: reader.personId, as: await openTestNetworkAdminSession(t, reader.as, reader.personId, network, { logged: false }) },
    "modérateur, session de l'application des membres": moderator,
    "modérateur, session IDN de l'application d'administration": { personId: moderator.personId, as: await openTestNetworkAdminSession(t, moderator.as, moderator.personId, network, { logged: false }) },
    "administrateur, session par code de l'application des membres": admin,
    "administrateur, session IDN de l'application des membres": { personId: admin.personId, as: await openTestNetworkAdminSession(t, admin.as, admin.personId, network, { application: MEMBERS_APP, logged: false }) },
    "administrateur d'un autre réseau, session IDN de l'application d'administration": { personId: otherAdmin.personId, as: await openTestNetworkAdminSession(t, otherAdmin.as, otherAdmin.personId, network, { logged: false }) },
  }
  return { t, root, testClosed, network, reader, moderator, admin, signatory, successor, weak, outsider, otherAdmin, pageId, rootPageId, memberPageId, adminApp, refused }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

/** Les portes du lot, pour une session et un réseau. */
function doors(f: Fixture, as: As, networkId: Id<"networks"> = f.network) {
  return {
    officialPages: () => as.query(NA.officialPages, { networkId, paginationOpts: PAGE }),
    signatoryCandidate: () => as.query(NA.signatoryCandidate, { networkId, handle: "@successeur.a2" }),
    createOfficialPage: () => as.mutation(NA.createOfficialPage, { networkId, name: "Consulat général (fixture)", country: "FR", signatoryPersonId: f.successor.personId, reason: REASON }),
    designateSignatory: () => as.mutation(NA.designateSignatory, { networkId, pageId: f.pageId, personId: f.successor.personId, reason: REASON }),
    sleepOfficialPage: () => as.mutation(NA.sleepOfficialPage, { networkId, pageId: f.pageId, reason: REASON }),
    wakeOfficialPage: () => as.mutation(NA.wakeOfficialPage, { networkId, pageId: f.pageId, reason: REASON }),
  }
}

/** Ce que les portes du lot écrivent : pages, équipes, journal. */
async function writes(f: Fixture) {
  return await f.t.run(async (ctx) => ({
    pages: (await ctx.db.query("pages").withIndex("by_network_status_trustRank_createdAt", (q) => q.eq("networkId", f.network)).take(50)).map((row) => [row.handle, row.status, row.sleepEndsAt ?? null]),
    team: (await ctx.db.query("pageSignatories").withIndex("by_page_role", (q) => q.eq("pageId", f.pageId)).take(20)).map((row) => [row.personId, row.role, row.acceptedAt ?? null]),
    audit: (await ctx.db.query("engineAudit").withIndex("by_network_at", (q) => q.eq("networkId", f.network)).take(200)).length,
  }))
}

/** Les lignes de journal des pages du réseau. */
async function pageDecisions(f: Fixture) {
  return await f.t.run(async (ctx) =>
    (await ctx.db.query("engineAudit").withIndex("by_network_at", (q) => q.eq("networkId", f.network)).take(200))
      .filter((row) => row.action.startsWith("page."))
      .map((row) => ({ action: row.action, capacity: row.capacity, actorPersonId: row.actorPersonId, subject: { table: row.subjectTable, id: row.subjectId }, details: row.details })),
  )
}

async function closePages(f: Fixture) {
  await f.t.run(async (ctx) => {
    const row = await ctx.db.query("networkFeatures").withIndex("by_network_feature", (q) => q.eq("networkId", f.network).eq("feature", "pages")).first()
    if (row) await ctx.db.patch(row._id, { enabled: false })
  })
}

describe("A2 — seule l'application d'administration, en session prouvée, gère les pages officielles du réseau", () => {
  it("chaque porte refuse membre, modérateur, administrateur en session des membres et administrateur d'un autre réseau, sans rien écrire", async () => {
    const f = await fixture()
    const before = await writes(f)
    for (const [label, who] of Object.entries(f.refused)) {
      for (const [door, call] of Object.entries(doors(f, who.as))) expect(await refusalOf(call()), `${label} — ${door}`).toEqual(REFUSAL)
    }
    expect(await writes(f)).toEqual(before)
  })

  it("module « pages » fermé : la session d'administration reçoit le refus indistinct, sans rien écrire", async () => {
    const f = await fixture()
    await closePages(f)
    const before = await writes(f)
    for (const [door, call] of Object.entries(doors(f, f.adminApp))) expect(await refusalOf(call()), door).toEqual(REFUSAL)
    expect(await writes(f)).toEqual(before)
  })

  it("une session d'administration de DIASPORA.GA ne gère rien ailleurs : racine et autre réseau, refus indistinct", async () => {
    const f = await fixture()
    await setRole(f.t, f.root, f.admin.personId, "network_admin")
    for (const networkId of [f.root, f.testClosed]) {
      for (const [door, call] of Object.entries(doors(f, f.adminApp, networkId))) expect(await refusalOf(call()), `${networkId} — ${door}`).toEqual(REFUSAL)
    }
  })

  it("le retrait du badge reste à la plateforme : setPageTrust refuse la session d'administration du réseau", async () => {
    const f = await fixture()
    const refusal = await refusalOf(f.adminApp.mutation(api.modules.pages.admin.setPageTrust, { pageId: f.pageId, trust: "community", reason: REASON }))
    expect(refusal).not.toBeNull()
    expect((await f.t.run(async (ctx) => await ctx.db.get(f.pageId)))?.trust).toBe("official")
  })
})

describe("A2 — créer une page officielle dans ce réseau, avec son signataire", () => {
  it("la page naît « Officiel » dans DIASPORA.GA seulement, son signataire invité ; deux lignes au journal à titre de network_admin", async () => {
    const f = await fixture()
    const created = await f.adminApp.mutation(api.modules.pages.networkAdmin.createOfficialPage, {
      networkId: f.network, name: "Consulat général (fixture)", shortName: "CG", description: "Page officielle de fixture.", country: "FR",
      signatoryPersonId: f.successor.personId, reason: REASON,
    })
    expect(created).toEqual({ pageId: expect.any(String), handle: "consulat-general-fixture" })
    expectNoSessionProof(created)
    const page = await f.t.run(async (ctx) => await ctx.db.get(created.pageId))
    expect(page).toMatchObject({ networkId: f.network, ownerKind: "institution", trust: "official", trustRank: 2, visibility: "network", onRoot: false, status: "active", country: "FR", shortName: "CG" })
    expect(page?.importRef).toBeUndefined()
    const team = await f.t.run(async (ctx) => await ctx.db.query("pageSignatories").withIndex("by_page_role", (q) => q.eq("pageId", created.pageId)).take(10))
    expect(team.map((row) => [row.personId, row.role, row.acceptedAt ?? null])).toEqual([[f.successor.personId, "admin", null]])
    // L'invitation attend la réponse de la personne désignée.
    const invitations = await f.successor.as.query(api.modules.pages.signatories.myPageInvitations, { networkId: f.network })
    expect(invitations.map((row) => [row.page.pageId, row.role])).toEqual([[created.pageId, "admin"]])
    const journal = (await pageDecisions(f)).filter((row) => row.subject.id === created.pageId)
    expect(journal).toEqual(expect.arrayContaining([
      { action: "page.create_official", capacity: "network_admin", actorPersonId: f.admin.personId, subject: { table: "pages", id: created.pageId }, details: expect.objectContaining({ reason: REASON, handle: "consulat-general-fixture" }) },
      { action: "page.signatory_grant", capacity: "network_admin", actorPersonId: f.admin.personId, subject: { table: "pages", id: created.pageId }, details: expect.objectContaining({ reason: REASON, targetPersonId: f.successor.personId, role: "admin", invited: true }) },
    ]))
    expect(journal).toHaveLength(2)
  })

  it("« Officiel » ne s'affiche que dans son réseau : lisible depuis DIASPORA.GA, introuvable depuis la racine", async () => {
    const f = await fixture()
    const { handle } = await f.adminApp.mutation(NA.createOfficialPage, { networkId: f.network, name: "Ambassade (fixture)", signatoryPersonId: f.successor.personId, reason: REASON })
    expect((await f.reader.as.query(api.modules.pages.pages.getPage, { networkId: f.network, handle }))?.badge).toBe("official")
    expect(await f.reader.as.query(api.modules.pages.pages.getPage, { networkId: f.root, handle })).toBeNull()
  })

  it("la porte n'accepte ni règle de visibilité ni référence d'import : la racine reste hors d'atteinte", async () => {
    const f = await fixture()
    const before = await writes(f)
    const base = { networkId: f.network, name: "Institution racine (fixture)", signatoryPersonId: f.successor.personId, reason: REASON }
    await expect(f.adminApp.mutation(NA.createOfficialPage, { ...base, visibility: "root" } as never)).rejects.toThrow()
    await expect(f.adminApp.mutation(NA.createOfficialPage, { ...base, importRef: "contrat:fixture" } as never)).rejects.toThrow()
    expect(await writes(f)).toEqual(before)
  })

  it("signataire sous la garantie exigée : PAGE_SIGNATORY_IDENTITY_REQUIRED ; non-membre : refus indistinct ; rien n'est créé", async () => {
    const f = await fixture()
    const before = await writes(f)
    const create = (signatoryPersonId: Id<"persons">) => f.adminApp.mutation(NA.createOfficialPage, { networkId: f.network, name: "Institution refusée (fixture)", signatoryPersonId, reason: REASON })
    expect(await refusalOf(create(f.weak.personId))).toEqual({ code: "invalidArgument", rule: "PAGE_SIGNATORY_IDENTITY_REQUIRED", params: {} })
    expect(await refusalOf(create(f.outsider.personId))).toEqual(REFUSAL)
    expect(await writes(f)).toEqual(before)
  })

  it("motif de moins de dix caractères : refusé par la règle du motif, rien n'est créé", async () => {
    const f = await fixture()
    const before = await writes(f)
    const refusal = await refusalOf(f.adminApp.mutation(NA.createOfficialPage, { networkId: f.network, name: "Institution (fixture)", signatoryPersonId: f.successor.personId, reason: "Court" }))
    expect(refusal).toMatchObject({ code: "invalidArgument" })
    expect(await writes(f)).toEqual(before)
  })
})

describe("A2 — lister, chercher un candidat, désigner ou remplacer le signataire", () => {
  it("la liste rend les pages officielles du réseau, leur état et leur signataire — jamais une page de membre ni d'un autre réseau", async () => {
    const f = await fixture()
    const listed = await f.adminApp.query(NA.officialPages, { networkId: f.network, paginationOpts: PAGE })
    expect(listed.page).toEqual([{
      pageId: f.pageId, name: "Institution institution-a2", handle: "institution-a2", country: "FR", state: "active", sleepEndsAt: null,
      signatory: { personId: f.signatory.personId, handle: "signataire.a2", displayName: "signataire.a2", accepted: true }, createdAt: NOW - 10,
    }])
    expectNoSessionProof(listed)
  })

  it("le candidat se cherche par son identifiant : membre publié du réseau, sinon null", async () => {
    const f = await fixture()
    expect(await f.adminApp.query(NA.signatoryCandidate, { networkId: f.network, handle: "@successeur.a2" })).toEqual({ personId: f.successor.personId, handle: "successeur.a2", displayName: "successeur.a2" })
    expect(await f.adminApp.query(NA.signatoryCandidate, { networkId: f.network, handle: "hors.reseau.a2" })).toBeNull()
    expect(await f.adminApp.query(NA.signatoryCandidate, { networkId: f.network, handle: "personne.inconnue" })).toBeNull()
  })

  it("remplacer le signataire : le successeur est invité, l'ancien retiré ; deux lignes au journal à titre de network_admin", async () => {
    const f = await fixture()
    const result = await f.adminApp.mutation(NA.designateSignatory, { networkId: f.network, pageId: f.pageId, personId: f.successor.personId, replacesPersonId: f.signatory.personId, reason: REASON })
    expect(result).toEqual({ invited: true, replaced: true })
    expect((await writes(f)).team).toEqual([[f.successor.personId, "admin", null]])
    const listed = await f.adminApp.query(NA.officialPages, { networkId: f.network, paginationOpts: PAGE })
    expect(listed.page[0]?.signatory).toEqual({ personId: f.successor.personId, handle: "successeur.a2", displayName: "successeur.a2", accepted: false })
    // Le successeur accepte : il signe désormais pour la page.
    await f.successor.as.mutation(api.modules.pages.signatories.respondToPageInvitation, { networkId: f.network, pageId: f.pageId, accept: true })
    expect((await f.adminApp.query(NA.officialPages, { networkId: f.network, paginationOpts: PAGE })).page[0]?.signatory?.accepted).toBe(true)
    const journal = await pageDecisions(f)
    expect(journal).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "page.signatory_grant", capacity: "network_admin", actorPersonId: f.admin.personId, details: expect.objectContaining({ reason: REASON, targetPersonId: f.successor.personId, role: "admin" }) }),
      expect.objectContaining({ action: "page.signatory_revoke", capacity: "network_admin", actorPersonId: f.admin.personId, details: expect.objectContaining({ reason: REASON, targetPersonId: f.signatory.personId, role: "admin" }) }),
    ]))
  })

  it("désigner : garantie insuffisante refusée ; page de membre ou d'un autre réseau, refus indistinct ; rien n'est écrit", async () => {
    const f = await fixture()
    const before = await writes(f)
    expect(await refusalOf(f.adminApp.mutation(NA.designateSignatory, { networkId: f.network, pageId: f.pageId, personId: f.weak.personId, reason: REASON }))).toEqual({ code: "invalidArgument", rule: "PAGE_SIGNATORY_IDENTITY_REQUIRED", params: {} })
    expect(await refusalOf(f.adminApp.mutation(NA.designateSignatory, { networkId: f.network, pageId: f.pageId, personId: f.outsider.personId, reason: REASON }))).toEqual(REFUSAL)
    expect(await refusalOf(f.adminApp.mutation(NA.designateSignatory, { networkId: f.network, pageId: f.memberPageId, personId: f.successor.personId, reason: REASON }))).toEqual(REFUSAL)
    expect(await refusalOf(f.adminApp.mutation(NA.designateSignatory, { networkId: f.network, pageId: f.rootPageId, personId: f.successor.personId, reason: REASON }))).toEqual(REFUSAL)
    expect(await writes(f)).toEqual(before)
  })
})

describe("A2 — mettre en sommeil et réveiller une page officielle (règles du sommeil, aucun état nouveau)", () => {
  it("le sommeil ferme la page trente jours ; le réveil la rend ; chaque geste au journal à titre de network_admin", async () => {
    const f = await fixture()
    expect(await f.adminApp.mutation(NA.sleepOfficialPage, { networkId: f.network, pageId: f.pageId, reason: REASON })).toEqual({ sleepEndsAt: NOW + PAGE_SLEEP_MS })
    expect((await f.t.run(async (ctx) => await ctx.db.get(f.pageId)))).toMatchObject({ status: "inactive", sleepEndsAt: NOW + PAGE_SLEEP_MS })
    expect(await f.reader.as.query(api.modules.pages.pages.getPage, { networkId: f.network, handle: "institution-a2" })).toBeNull()
    const asleep = await f.adminApp.query(NA.officialPages, { networkId: f.network, status: "inactive", paginationOpts: PAGE })
    expect(asleep.page.map((row) => [row.pageId, row.state, row.sleepEndsAt])).toEqual([[f.pageId, "asleep", NOW + PAGE_SLEEP_MS]])
    expect(await f.adminApp.mutation(NA.wakeOfficialPage, { networkId: f.network, pageId: f.pageId, reason: REASON })).toEqual({ status: "active" })
    const woken = await f.t.run(async (ctx) => await ctx.db.get(f.pageId))
    expect(woken?.status).toBe("active")
    expect(woken?.sleepEndsAt).toBeUndefined()
    const journal = (await pageDecisions(f)).filter((row) => row.action === "page.sleep" || row.action === "page.wake")
    expect(journal).toEqual([
      { action: "page.sleep", capacity: "network_admin", actorPersonId: f.admin.personId, subject: { table: "pages", id: f.pageId }, details: { reason: REASON, sleepEndsAt: NOW + PAGE_SLEEP_MS } },
      { action: "page.wake", capacity: "network_admin", actorPersonId: f.admin.personId, subject: { table: "pages", id: f.pageId }, details: { reason: REASON, sleepEndsAt: NOW + PAGE_SLEEP_MS } },
    ])
  })

  it("échu, le sommeil se lève encore par l'administration du réseau (la décision humaine de sortie)", async () => {
    const f = await fixture()
    await f.adminApp.mutation(NA.sleepOfficialPage, { networkId: f.network, pageId: f.pageId, reason: REASON })
    vi.setSystemTime(NOW + PAGE_SLEEP_MS + 1)
    // Trente jours ont passé : l'administrateur rentre par une session neuve de l'application d'administration.
    const later = await openTestNetworkAdminSession(f.t, f.admin.as, f.admin.personId, f.network)
    expect((await later.query(NA.officialPages, { networkId: f.network, status: "inactive", paginationOpts: PAGE })).page[0]?.state).toBe("expired")
    expect(await later.mutation(NA.wakeOfficialPage, { networkId: f.network, pageId: f.pageId, reason: REASON })).toEqual({ status: "active" })
  })

  it("une page retirée par la plateforme ne se réveille pas d'ici ; une page déjà en sommeil ne se rendort pas", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => {
      await ctx.db.patch(f.pageId, { status: "inactive", deactivatedAt: NOW - 1 })
    })
    expect(await refusalOf(f.adminApp.mutation(NA.wakeOfficialPage, { networkId: f.network, pageId: f.pageId, reason: REASON }))).toEqual(REFUSAL)
    expect((await f.adminApp.query(NA.officialPages, { networkId: f.network, status: "inactive", paginationOpts: PAGE })).page[0]?.state).toBe("withdrawn")
    expect(await refusalOf(f.adminApp.mutation(NA.sleepOfficialPage, { networkId: f.network, pageId: f.pageId, reason: REASON }))).toEqual(REFUSAL)
  })

  it("une page de membre ne s'endort pas d'ici : refus indistinct", async () => {
    const f = await fixture()
    expect(await refusalOf(f.adminApp.mutation(NA.sleepOfficialPage, { networkId: f.network, pageId: f.memberPageId, reason: REASON }))).toEqual(REFUSAL)
  })
})
