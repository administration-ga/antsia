// @vitest-environment edge-runtime
/**
 * Adhésion aux associations DIASPORA.GA (DG-010) : gestes de la personne et des
 * responsables, gardes vivantes, refus indistincts — avec de vraies sessions.
 * Scénarios du plan global : R-G10 (aucun membre sans geste), R-G11 (rôle retiré,
 * accès coupé), R-G14 (aucune liste hors des responsables).
 */
import { engineErrorAppRule, engineErrorCode } from "@antsia/social-contracts/errors"
import { ASSOCIATION_REJECTION_COOLDOWN_MS } from "@diaspora-ga/domain"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { joinDeclaredDiasporaFixture, openNetworkFeatures, testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Member = Awaited<ReturnType<typeof member>>
const NOW = Date.UTC(2026, 9, 18, 10)
const A = api.modules.diaspora.associations
const FIRST = { numItems: 20, cursor: null }

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

/** Un membre déclaré de DIASPORA.GA (lien IDN de garantie 1), au profil publié. */
async function member(t: T, networkId: Id<"networks">, handle: string) {
  const as = t.withIdentity({ subject: `auth-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await t.run(async (ctx) => {
    await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `idn-${personId}`, loa: 1, nationality: "GA", linkedAt: NOW })
  })
  await joinDeclaredDiasporaFixture(as, { networkId, facet: { countryOfResidence: "FR", city: "Lyon" } })
  return { as, personId, handle }
}

async function page(t: T, networkId: Id<"networks">, handle: string, options: { ownerKind?: "association" | "company"; status?: "active" | "inactive" } = {}) {
  return await t.run(async (ctx) => ctx.db.insert("pages", {
    networkId, handle, name: `Page ${handle}`, ownerKind: options.ownerKind ?? "association", trust: "community", trustRank: 0,
    visibility: "network", onRoot: false, status: options.status ?? "active", searchText: handle, createdAt: NOW, updatedAt: NOW,
  }))
}

async function grant(t: T, networkId: Id<"networks">, pageId: Id<"pages">, personId: Id<"persons">, role: "admin" | "signatory", accepted = true) {
  return await t.run(async (ctx) => ctx.db.insert("pageSignatories", {
    networkId, pageId, personId, role, ...(accepted ? { acceptedAt: NOW } : {}), createdAt: NOW, updatedAt: NOW,
  }))
}

async function setStatus(t: T, networkId: Id<"networks">, personId: Id<"persons">, status: "en_attente" | "suspendue") {
  await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships")
      .withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique()
    if (!row) throw new Error("Adhésion de fixture absente")
    await ctx.db.patch(row._id, { status })
  })
}

/** Le code du refus : le refus d'application d'abord, sinon le code du moteur ; `null` sans refus. */
async function refusal(promise: Promise<unknown>) {
  try { await promise } catch (error) { return engineErrorAppRule(error)?.appRule ?? engineErrorCode(error) }
  return null
}

async function params(promise: Promise<unknown>) {
  try { await promise } catch (error) { return engineErrorAppRule(error)?.appParams ?? null }
  return null
}

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  await openNetworkFeatures(t, networkId)
  const admin = await member(t, networkId, "admin.asso")
  const signatory = await member(t, networkId, "signataire.asso")
  const applicant = await member(t, networkId, "demandeuse")
  const other = await member(t, networkId, "autre.membre")
  const pageId = await page(t, networkId, "collectif-test")
  await grant(t, networkId, pageId, admin.personId, "admin")
  await grant(t, networkId, pageId, signatory.personId, "signatory")
  return { t, root, networkId, pageId, admin, signatory, applicant, other }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

function list(f: Fixture, who: Member, status: "requested" | "accepted" | "removed", paginationOpts: { numItems: number; cursor: string | null } = FIRST) {
  return who.as.query(A.associationMembers, { networkId: f.networkId, pageId: f.pageId, status, paginationOpts })
}

function mine(f: Fixture, who: Member, pageId: Id<"pages"> = f.pageId) {
  return who.as.query(A.myAssociationMembership, { networkId: f.networkId, pageId })
}

async function requestAndAccept(f: Fixture, who: Member) {
  const { membershipId, version } = await who.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId: f.pageId })
  const decided = await f.signatory.as.mutation(A.decideAssociationMembership, { networkId: f.networkId, membershipId, decision: "accept", expectedVersion: version })
  return { membershipId, version: decided.version }
}

async function rows(t: T) {
  return await t.run(async (ctx) => ctx.db.query("associationMemberships").take(100))
}

describe("adhésion — gestes de la personne et décision des responsables", () => {
  it("R-G10 : suivre n'est pas adhérer ; aucune adhésion ne naît sans la demande de la personne", async () => {
    const f = await fixture()
    await f.applicant.as.mutation(api.modules.pages.pages.follow, { networkId: f.networkId, handle: "collectif-test" })
    expect(await mine(f, f.applicant)).toEqual({
      pageId: f.pageId,
      membership: null,
      request: { allowed: true, refusal: null, availableAt: null },
      responsibleRole: null,
    })
    expect(await rows(f.t)).toEqual([])
    expect((await list(f, f.admin, "requested")).page).toEqual([])
    expect((await list(f, f.admin, "accepted")).page).toEqual([])

    const { membershipId, version } = await f.applicant.as.mutation(A.requestAssociationMembership, {
      networkId: f.networkId, pageId: f.pageId, message: "  J'arrive à Lyon en janvier.  ",
    })
    expect(version).toBe(1)
    const stored = await rows(f.t)
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ personId: f.applicant.personId, status: "requested", role: "member", requestMessage: "J'arrive à Lyon en janvier." })
    // Une demande n'est pas une adhésion : rien côté adhérents, la demande côté demandes.
    expect((await list(f, f.admin, "accepted")).page).toEqual([])
    expect((await list(f, f.signatory, "requested")).page).toEqual([{
      membershipId, status: "requested", role: "member",
      person: { displayName: "demandeuse", handle: "demandeuse", avatarUrl: null },
      requestMessage: "J'arrive à Lyon en janvier.", decisionReason: null,
      requestedAt: NOW, statusChangedAt: NOW, readmissionAllowed: false, version: 1,
    }])
    // Les deux responsables vivants reçoivent un avis NEUTRE (rédacteur unique du moteur), sans le mot.
    const notices = await f.t.run(async (ctx) => ctx.db.query("notifications").take(5))
    expect(notices).toHaveLength(2)
    expect(JSON.stringify(notices)).not.toContain("J'arrive à Lyon")
  })

  it("accepte à la version lue ; refuse la double demande, la version périmée et la décision rejouée", async () => {
    const f = await fixture()
    const { membershipId } = await f.applicant.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId: f.pageId })
    expect(await refusal(f.applicant.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId: f.pageId }))).toBe("association_request_pending")
    expect(await refusal(f.signatory.as.mutation(A.decideAssociationMembership, { networkId: f.networkId, membershipId, decision: "accept", expectedVersion: 0 }))).toBe("association_version_conflict")
    expect(await f.signatory.as.mutation(A.decideAssociationMembership, { networkId: f.networkId, membershipId, decision: "accept", expectedVersion: 1 })).toEqual({ status: "accepted", version: 2 })
    expect(await refusal(f.admin.as.mutation(A.decideAssociationMembership, { networkId: f.networkId, membershipId, decision: "reject", expectedVersion: 2 }))).toBe("association_not_pending")

    const view = await mine(f, f.applicant)
    expect(view.membership).toEqual({
      membershipId, status: "accepted", role: "member", requestMessage: null, decisionReason: null,
      requestedAt: NOW, statusChangedAt: NOW, readmissionAllowed: false,
    })
    expect(view.request).toEqual({ allowed: false, refusal: "association_already_member", availableAt: null })
    expect(await refusal(f.applicant.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId: f.pageId }))).toBe("association_already_member")
    expect((await list(f, f.admin, "accepted")).page.map((row) => row.person.handle)).toEqual(["demandeuse"])
    expect((await list(f, f.admin, "requested")).page).toEqual([])
    // Qui a décidé reste au journal de la ligne, jamais dans la vue de la personne.
    expect((await rows(f.t))[0]?.decidedByPersonId).toBe(f.signatory.personId)
    expect(JSON.stringify(view)).not.toContain(f.signatory.personId)
  })

  it("refus motivé, délai de sept jours, puis annulation et départ par la personne", async () => {
    const f = await fixture()
    const first = await f.applicant.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId: f.pageId })
    expect(await refusal(f.signatory.as.mutation(A.decideAssociationMembership, {
      networkId: f.networkId, membershipId: first.membershipId, decision: "reject", expectedVersion: 1, reason: "x".repeat(501),
    }))).toBe("association_reason_too_long")
    await f.signatory.as.mutation(A.decideAssociationMembership, {
      networkId: f.networkId, membershipId: first.membershipId, decision: "reject", expectedVersion: 1, reason: "  Effectif complet cette saison  ",
    })
    const rejected = await mine(f, f.applicant)
    expect(rejected.membership).toMatchObject({ status: "rejected", decisionReason: "Effectif complet cette saison" })
    expect(rejected.request).toEqual({ allowed: false, refusal: "association_request_too_soon", availableAt: NOW + ASSOCIATION_REJECTION_COOLDOWN_MS })
    const tooSoon = f.applicant.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId: f.pageId })
    expect(await params(tooSoon)).toEqual({ availableAt: NOW + ASSOCIATION_REJECTION_COOLDOWN_MS })

    // Le refus vieillit (l'horloge reste : une session de test dure sept jours) : une milliseconde
    // avant l'échéance, toujours trop tôt ; à l'échéance, la demande repart.
    const age = async (ms: number) => await f.t.run(async (ctx) => { await ctx.db.patch(first.membershipId, { statusChangedAt: NOW - ms }) })
    await age(ASSOCIATION_REJECTION_COOLDOWN_MS - 1)
    expect(await refusal(f.applicant.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId: f.pageId }))).toBe("association_request_too_soon")
    await age(ASSOCIATION_REJECTION_COOLDOWN_MS)
    const again = await f.applicant.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId: f.pageId })
    expect(again).toEqual({ membershipId: first.membershipId, version: 3 })
    expect((await mine(f, f.applicant)).membership).toMatchObject({ status: "requested", decisionReason: null })

    expect(await f.applicant.as.mutation(A.cancelAssociationMembershipRequest, { networkId: f.networkId, pageId: f.pageId })).toEqual({ version: 4 })
    expect(await refusal(f.applicant.as.mutation(A.cancelAssociationMembershipRequest, { networkId: f.networkId, pageId: f.pageId }))).toBe("association_not_pending")
    expect(await refusal(f.applicant.as.mutation(A.leaveAssociation, { networkId: f.networkId, pageId: f.pageId }))).toBe("association_not_member")
    expect(await refusal(f.other.as.mutation(A.cancelAssociationMembershipRequest, { networkId: f.networkId, pageId: f.pageId }))).toBe("association_not_pending")

    await requestAndAccept(f, f.applicant)
    expect(await f.applicant.as.mutation(A.leaveAssociation, { networkId: f.networkId, pageId: f.pageId })).toEqual({ version: 7 })
    expect((await mine(f, f.applicant)).membership?.status).toBe("left")
    expect(await refusal(f.applicant.as.mutation(A.leaveAssociation, { networkId: f.networkId, pageId: f.pageId }))).toBe("association_not_member")
    // Après un départ, la porte reste ouverte : un nouveau geste, aucune inscription d'office.
    expect((await mine(f, f.applicant)).request.allowed).toBe(true)
  })

  it("exclusion motivée par un administrateur, puis nouvelle demande seulement après sa décision", async () => {
    const f = await fixture()
    const { membershipId, version } = await requestAndAccept(f, f.applicant)
    expect(await refusal(f.signatory.as.mutation(A.removeAssociationMember, { networkId: f.networkId, membershipId, expectedVersion: version, reason: "Propos injurieux répétés" }))).toBe("association_admin_required")
    expect(await refusal(f.admin.as.mutation(A.removeAssociationMember, { networkId: f.networkId, membershipId, expectedVersion: version, reason: "trop bref" }))).toBe("association_reason_required")
    expect(await params(f.admin.as.mutation(A.removeAssociationMember, { networkId: f.networkId, membershipId, expectedVersion: version, reason: "" }))).toEqual({ min: 10 })
    expect(await refusal(f.admin.as.mutation(A.removeAssociationMember, { networkId: f.networkId, membershipId, expectedVersion: version - 1, reason: "Propos injurieux répétés" }))).toBe("association_version_conflict")
    expect(await f.admin.as.mutation(A.removeAssociationMember, { networkId: f.networkId, membershipId, expectedVersion: version, reason: "Propos injurieux répétés" })).toEqual({ status: "removed", version: version + 1 })

    const removed = await mine(f, f.applicant)
    expect(removed.membership).toMatchObject({ status: "removed", decisionReason: "Propos injurieux répétés", readmissionAllowed: false })
    expect(removed.request).toEqual({ allowed: false, refusal: "association_rejoin_blocked", availableAt: null })
    expect(await refusal(f.applicant.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId: f.pageId }))).toBe("association_rejoin_blocked")
    expect((await list(f, f.signatory, "removed")).page).toEqual([expect.objectContaining({ membershipId, decisionReason: "Propos injurieux répétés", version: version + 1 })])

    expect(await refusal(f.signatory.as.mutation(A.allowAssociationReadmission, { networkId: f.networkId, membershipId, expectedVersion: version + 1 }))).toBe("association_admin_required")
    expect(await f.admin.as.mutation(A.allowAssociationReadmission, { networkId: f.networkId, membershipId, expectedVersion: version + 1 })).toEqual({ version: version + 2 })
    expect(await f.admin.as.mutation(A.allowAssociationReadmission, { networkId: f.networkId, membershipId, expectedVersion: version + 2 })).toEqual({ version: version + 2 })
    // L'autorisation n'inscrit personne : la personne reste exclue tant qu'elle ne redemande pas.
    expect((await mine(f, f.applicant)).membership).toMatchObject({ status: "removed", readmissionAllowed: true })
    expect((await list(f, f.admin, "accepted")).page).toEqual([])
    await f.applicant.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId: f.pageId })
    expect((await mine(f, f.applicant)).membership).toMatchObject({ status: "requested", readmissionAllowed: false, decisionReason: null })
  })

  it("on ne s'exclut pas soi-même ; un administrateur adhérent quitte comme tout adhérent", async () => {
    const f = await fixture()
    const own = await requestAndAccept(f, f.admin)
    expect(await refusal(f.admin.as.mutation(A.removeAssociationMember, { networkId: f.networkId, membershipId: own.membershipId, expectedVersion: own.version, reason: "Je me retire du bureau" }))).toBe("association_self_removal")
    expect(await f.admin.as.mutation(A.leaveAssociation, { networkId: f.networkId, pageId: f.pageId })).toEqual({ version: own.version + 1 })
    // Quitter l'association ne retire pas le rôle de signataire de la page (deux choses distinctes).
    expect((await mine(f, f.admin)).responsibleRole).toBe("admin")
  })

  it("rôles d'adhérent : un administrateur nomme un animateur, qui ne gère ni ne lit la liste", async () => {
    const f = await fixture()
    const { membershipId, version } = await requestAndAccept(f, f.applicant)
    expect(await refusal(f.signatory.as.mutation(A.setAssociationMemberRole, { networkId: f.networkId, membershipId, expectedVersion: version, role: "animator" }))).toBe("association_admin_required")
    expect(await f.admin.as.mutation(A.setAssociationMemberRole, { networkId: f.networkId, membershipId, expectedVersion: version, role: "animator" })).toEqual({ role: "animator", version: version + 1 })
    expect(await f.admin.as.mutation(A.setAssociationMemberRole, { networkId: f.networkId, membershipId, expectedVersion: version + 1, role: "animator" })).toEqual({ role: "animator", version: version + 1 })
    expect((await mine(f, f.applicant)).membership?.role).toBe("animator")
    expect(await refusal(list(f, f.applicant, "accepted"))).toBe("notFound")
    expect(await refusal(f.applicant.as.query(A.managedAssociation, { networkId: f.networkId, handle: "collectif-test" }))).toBe("notFound")

    const pending = await f.other.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId: f.pageId })
    expect(await refusal(f.admin.as.mutation(A.setAssociationMemberRole, { networkId: f.networkId, membershipId: pending.membershipId, expectedVersion: 1, role: "animator" }))).toBe("association_not_member")
    expect(await refusal(f.admin.as.mutation(A.allowAssociationReadmission, { networkId: f.networkId, membershipId: pending.membershipId, expectedVersion: 1 }))).toBe("association_not_removed")
    // Partir efface le rôle : une nouvelle adhésion recommence membre.
    await f.applicant.as.mutation(A.leaveAssociation, { networkId: f.networkId, pageId: f.pageId })
    expect((await mine(f, f.applicant)).membership?.role).toBe("member")
  })
})

describe("adhésion — gardes : responsables vivants, réseau, pages et statuts", () => {
  it("R-G14 : la liste n'existe que pour les responsables vivants, jamais pour un autre membre", async () => {
    const f = await fixture()
    await requestAndAccept(f, f.applicant)
    const invited = await member(f.t, f.networkId, "invite.attente")
    await grant(f.t, f.networkId, f.pageId, invited.personId, "signatory", false)
    for (const who of [f.applicant, f.other, invited]) {
      for (const status of ["requested", "accepted", "removed"] as const) expect(await refusal(list(f, who, status))).toBe("notFound")
      expect(await refusal(who.as.query(A.managedAssociation, { networkId: f.networkId, handle: "collectif-test" }))).toBe("notFound")
    }
    // Ma situation ne dit rien des autres : aucune ligne d'autrui, aucun compte.
    expect(await mine(f, f.other)).toEqual({ pageId: f.pageId, membership: null, request: { allowed: true, refusal: null, availableAt: null }, responsibleRole: null })
    expect(await f.signatory.as.query(A.managedAssociation, { networkId: f.networkId, handle: "collectif-test" })).toEqual({ pageId: f.pageId, handle: "collectif-test", name: "Page collectif-test", role: "signatory" })

    const outsider = f.t.withIdentity({ subject: "auth-exterieur" })
    await outsider.mutation(api.modules.people.persons.ensureMyPerson, {})
    expect(await refusal(outsider.query(A.associationMembers, { networkId: f.networkId, pageId: f.pageId, status: "accepted", paginationOpts: FIRST }))).toBe("notFound")
    expect(await refusal(outsider.query(A.myAssociationMembership, { networkId: f.networkId, pageId: f.pageId }))).toBe("notFound")
    expect(await refusal(f.t.query(A.myAssociationMembership, { networkId: f.networkId, pageId: f.pageId }))).toBe("unauthenticated")
  })

  it("R-G11 : un responsable dont le rôle est retiré perd aussitôt la liste et les décisions", async () => {
    const f = await fixture()
    const { membershipId, version } = await f.applicant.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId: f.pageId })
    expect((await list(f, f.signatory, "requested")).page).toHaveLength(1)
    expect((await mine(f, f.signatory)).responsibleRole).toBe("signatory")
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("pageSignatories").withIndex("by_page_person", (q) => q.eq("pageId", f.pageId).eq("personId", f.signatory.personId)).unique()
      if (row) await ctx.db.delete(row._id)
    })
    expect(await refusal(list(f, f.signatory, "requested"))).toBe("notFound")
    expect(await refusal(f.signatory.as.mutation(A.decideAssociationMembership, { networkId: f.networkId, membershipId, decision: "accept", expectedVersion: version }))).toBe("notFound")
    expect((await mine(f, f.signatory)).responsibleRole).toBeNull()

    // Un administrateur suspendu, puis parti du réseau, ne gère plus rien non plus.
    await setStatus(f.t, f.networkId, f.admin.personId, "suspendue")
    expect(await refusal(list(f, f.admin, "requested"))).toBe("membershipSuspended")
    expect(await refusal(f.admin.as.mutation(A.decideAssociationMembership, { networkId: f.networkId, membershipId, decision: "accept", expectedVersion: version }))).toBe("membershipSuspended")
    expect((await rows(f.t))[0]).toMatchObject({ status: "requested", version })
  })

  it("une association sans administrateur vivant ne reçoit aucune demande", async () => {
    const f = await fixture()
    const orphanId = await page(f.t, f.networkId, "amicale-sans-equipe")
    expect((await mine(f, f.applicant, orphanId)).request).toEqual({ allowed: false, refusal: "association_not_managed", availableAt: null })
    expect(await refusal(f.applicant.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId: orphanId }))).toBe("association_not_managed")
    // Un signataire seul ne suffit pas : il faut un administrateur vivant pour garder la main.
    await grant(f.t, f.networkId, orphanId, f.other.personId, "signatory")
    expect((await mine(f, f.applicant, orphanId)).request.refusal).toBe("association_not_managed")
    // L'administrateur qui quitte le réseau laisse l'association sans équipe.
    await f.admin.as.mutation(api.modules.diaspora.membership.leaveDiasporaGa, { networkId: f.networkId })
    expect((await mine(f, f.applicant)).request.refusal).toBe("association_not_managed")
  })

  it("autre réseau, entreprise, page retirée ou inconnue : le même refus indistinct", async () => {
    const f = await fixture()
    const companyId = await page(f.t, f.networkId, "entreprise-test", { ownerKind: "company" })
    await grant(f.t, f.networkId, companyId, f.admin.personId, "admin")
    const inactiveId = await page(f.t, f.networkId, "asso-retiree", { status: "inactive" })
    await grant(f.t, f.networkId, inactiveId, f.admin.personId, "admin")
    const rootPageId = await page(f.t, f.root, "asso-racine")
    await grant(f.t, f.root, rootPageId, f.admin.personId, "admin")
    for (const pageId of [companyId, inactiveId, rootPageId]) {
      expect(await refusal(mine(f, f.applicant, pageId))).toBe("notFound")
      expect(await refusal(f.applicant.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId }))).toBe("notFound")
      expect(await refusal(f.admin.as.query(A.associationMembers, { networkId: f.networkId, pageId, status: "requested", paginationOpts: FIRST }))).toBe("notFound")
    }
    for (const handle of ["entreprise-test", "asso-retiree", "asso-racine", "inconnue"]) {
      expect(await refusal(f.admin.as.query(A.managedAssociation, { networkId: f.networkId, handle }))).toBe("notFound")
    }
    // Depuis la racine ANTSIA, la tranche ne sert rien.
    expect(await refusal(f.applicant.as.query(A.myAssociationMembership, { networkId: f.root, pageId: f.pageId }))).toBe("notFound")
    expect(await refusal(f.applicant.as.mutation(A.requestAssociationMembership, { networkId: f.root, pageId: f.pageId }))).toBe("notFound")
    expect(await refusal(f.admin.as.query(A.associationMembers, { networkId: f.root, pageId: f.pageId, status: "requested", paginationOpts: FIRST }))).toBe("notFound")
    expect(await refusal(f.applicant.as.query(A.myAssociations, { networkId: f.root, paginationOpts: FIRST }))).toBe("notFound")
  })

  it("en attente : pas de demande, mais l'annulation reste possible ; suspendu : refusé partout", async () => {
    const f = await fixture()
    await f.applicant.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId: f.pageId })
    await setStatus(f.t, f.networkId, f.applicant.personId, "en_attente")
    expect((await mine(f, f.applicant)).request).toEqual({ allowed: false, refusal: "status_insufficient", availableAt: null })
    expect(await f.applicant.as.mutation(A.cancelAssociationMembershipRequest, { networkId: f.networkId, pageId: f.pageId })).toEqual({ version: 2 })
    expect(await refusal(f.applicant.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId: f.pageId }))).toBe("statusInsufficient")

    await setStatus(f.t, f.networkId, f.other.personId, "suspendue")
    expect(await refusal(mine(f, f.other))).toBe("membershipSuspended")
    expect(await refusal(f.other.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId: f.pageId }))).toBe("membershipSuspended")
    expect(await refusal(f.other.as.query(A.myAssociations, { networkId: f.networkId, paginationOpts: FIRST }))).toBe("membershipSuspended")
  })

  it("une personne partie du réseau disparaît des listes et ne se décide plus", async () => {
    const f = await fixture()
    const { membershipId } = await f.applicant.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId: f.pageId })
    await f.applicant.as.mutation(api.modules.diaspora.membership.leaveDiasporaGa, { networkId: f.networkId })
    expect((await list(f, f.admin, "requested")).page).toEqual([])
    expect(await refusal(f.admin.as.mutation(A.decideAssociationMembership, { networkId: f.networkId, membershipId, decision: "accept", expectedVersion: 1 }))).toBe("notFound")
  })
})

describe("adhésion — mes associations", () => {
  it("mes seules lignes, des plus récentes aux plus anciennes, paginées, sans association devenue illisible", async () => {
    const f = await fixture()
    const secondId = await page(f.t, f.networkId, "deuxieme-asso")
    await grant(f.t, f.networkId, secondId, f.admin.personId, "admin")
    await requestAndAccept(f, f.applicant)
    vi.setSystemTime(NOW + 1000)
    await f.applicant.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId: secondId, message: "Bonjour" })
    await f.other.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId: f.pageId })

    const all = await f.applicant.as.query(A.myAssociations, { networkId: f.networkId, paginationOpts: FIRST })
    expect(all.page.map((row) => [row.page.handle, row.status])).toEqual([["deuxieme-asso", "requested"], ["collectif-test", "accepted"]])
    expect(all.page[0]).toEqual({ membershipId: expect.any(String), status: "requested", role: "member", decisionReason: null, statusChangedAt: NOW + 1000, page: { pageId: secondId, handle: "deuxieme-asso", name: "Page deuxieme-asso" } })
    const first = await f.applicant.as.query(A.myAssociations, { networkId: f.networkId, paginationOpts: { numItems: 0, cursor: null } })
    expect(first.page).toHaveLength(1)
    expect(first.isDone).toBe(false)
    const rest = await f.applicant.as.query(A.myAssociations, { networkId: f.networkId, paginationOpts: { numItems: 1, cursor: first.continueCursor } })
    expect(rest.page.map((row) => row.page.handle)).toEqual(["collectif-test"])

    await f.t.run(async (ctx) => { await ctx.db.patch(secondId, { status: "inactive" }) })
    expect((await f.applicant.as.query(A.myAssociations, { networkId: f.networkId, paginationOpts: FIRST })).page.map((row) => row.page.handle)).toEqual(["collectif-test"])
    expect((await f.other.as.query(A.myAssociations, { networkId: f.networkId, paginationOpts: FIRST })).page.map((row) => row.status)).toEqual(["requested"])
  })

  it("les listes des responsables sont paginées et bornées", async () => {
    const f = await fixture()
    for (const handle of ["un.membre", "deux.membre", "trois.membre"]) {
      const person = await member(f.t, f.networkId, handle)
      await person.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId: f.pageId })
      vi.setSystemTime(Date.now() + 1)
    }
    const first = await list(f, f.admin, "requested", { numItems: 2, cursor: null })
    expect(first.page.map((row) => row.person.handle)).toEqual(["un.membre", "deux.membre"])
    const next = await list(f, f.admin, "requested", { numItems: 500, cursor: first.continueCursor })
    expect(next.page.map((row) => row.person.handle)).toEqual(["trois.membre"])
    expect(next.isDone).toBe(true)
  })
})
