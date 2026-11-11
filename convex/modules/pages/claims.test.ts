// @vitest-environment edge-runtime
/**
 * Revendications de page (EXF-AN-17) — tests neufs : le socle n'avait pas de
 * revendication. Le patron d'audit des décisions de modération est repris
 * (`moderation.report_decide` → `page.claim_decide`). AS-01 : l'équipe de modération compétente
 * pour les pages instruit aussi ; l'échéance de suppression des pièces est servie.
 */
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { PAGE_CLAIM_EVIDENCE_RETENTION_MS } from "@antsia/social-domain/pages"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }

const P = api.modules.pages.pages
const C = api.modules.pages.claims
const ADMIN = api.modules.pages.admin
const CASES = api.modules.moderation.cases

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(Date.UTC(2026, 9, 15, 11, 0, 0))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function seed(t: T) {
  return await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
}

async function enter(t: T, rootId: Id<"networks">, handle: string, role: "member" | "network_moderator" | "network_admin" = "member"): Promise<Person> {
  vi.setSystemTime(Date.now() + 1000)
  const as = t.withIdentity({ subject: `auth-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: rootId })
  if (role !== "member") {
    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("networkMemberships")
        .withIndex("by_network_and_person", (q) => q.eq("networkId", rootId).eq("personId", personId))
        .unique()
      await ctx.db.patch(membership!._id, { role })
    })
  }
  return { as, personId, handle }
}

async function makeOperator(t: T, person: Person): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("operators", { personId: person.personId, role: "platform_admin", grantedAt: 1 })
  })
  await createTestOperatorProof(t, person.as, person.personId)
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  return null
}

const codeOf = async (promise: Promise<unknown>) => engineErrorCode(await caught(promise))
const ruleOf = async (promise: Promise<unknown>) => engineErrorRule(await caught(promise))?.rule ?? null

/** Un dépôt RÉEL du harnais, avec son type (le patch système le pose). */
async function storeBlob(t: T, contentType: string): Promise<Id<"_storage">> {
  return await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob([new Uint8Array(64)], { type: contentType }))
    await (ctx.db as unknown as { patch: (table: "_storage", id: Id<"_storage">, value: { contentType: string }) => Promise<void> }).patch("_storage", storageId, { contentType })
    return storageId
  })
}

/** Une association IMPORTÉE, non revendiquée (aucun signataire), dans la racine. */
async function unclaimedAssociation(t: T, rootId: Id<"networks">, handle = "association-de-lyon"): Promise<{ pageId: Id<"pages">; handle: string }> {
  const pageId = await t.run(
    async (ctx) =>
      await ctx.db.insert("pages", {
        networkId: rootId,
        handle,
        name: "Association de Lyon",
        ownerKind: "association",
        trust: "community",
        trustRank: 0,
        visibility: "network",
        onRoot: true,
        status: "active",
        importRef: `import-${handle}`,
        searchText: `Association de Lyon ${handle}`,
        createdAt: 1,
        updatedAt: 1,
      }),
  )
  return { pageId, handle }
}

async function claim(t: T, person: Person, networkId: Id<"networks">, pageId: Id<"pages">, documents = 1) {
  const evidence = []
  for (let index = 0; index < documents; index += 1) evidence.push({ storageId: await storeBlob(t, "application/pdf"), mimeType: "application/pdf" })
  return await person.as.mutation(C.requestPageClaim, { networkId, pageId, note: "Je préside l'association.", evidence })
}

describe("revendiquer une page", () => {
  it("une page non revendiquée se revendique avec ses pièces ; une seule demande en attente ; la file est celle de la modération", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const presidente = await enter(t, root, "presidente")
    const moderator = await enter(t, root, "moderatrice", "network_moderator")
    const { pageId } = await unclaimedAssociation(t, root)
    const { claimId } = await claim(t, presidente, root, pageId, 2)
    expect(await ruleOf(claim(t, presidente, root, pageId))).toBe("PAGE_CLAIM_PENDING")
    expect(await codeOf(presidente.as.query(C.paginatePageClaims, { networkId: root, paginationOpts: { numItems: 10, cursor: null } }))).toBe("notFound")
    const queue = await moderator.as.query(C.paginatePageClaims, { networkId: root, paginationOpts: { numItems: 10, cursor: null } })
    expect(queue.page).toMatchObject([{ claimId, status: "pending", evidenceCount: 2, note: "Je préside l'association.", claimant: { handle: "presidente" }, page: { pageId } }])
    // Les pièces : servies par la garde, retenues tant que l'analyse n'a pas parlé.
    const detail = await moderator.as.query(C.getPageClaim, { networkId: root, claimId })
    expect(detail.evidence).toEqual([
      { url: null, withheld: "fileScanPending" },
      { url: null, withheld: "fileScanPending" },
    ])
    expect((await presidente.as.query(C.paginateMyPageClaims, { networkId: root, paginationOpts: { numItems: 10, cursor: null } })).page.map((row) => row.claimId)).toEqual([claimId])
  })

  it("une page officielle ne se revendique pas ; une page tenue, par l'un de ses administrateurs seulement ; une vérifiée, jamais", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const operator = await enter(t, root, "operatrice")
    await makeOperator(t, operator)
    const official = await operator.as.mutation(ADMIN.createInstitutionPage, { networkId: root, name: "Consulat de Lyon", reason: "Import du poste consulaire." })
    expect(await ruleOf(claim(t, bob, root, official.pageId))).toBe("PAGE_NOT_CLAIMABLE")
    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("networkMemberships")
        .withIndex("by_network_and_person", (q) => q.eq("networkId", root).eq("personId", alice.personId))
        .unique()
      await ctx.db.patch(membership!._id, { status: "verifiee" })
    })
    const held = await alice.as.mutation(P.createPage, { networkId: root, name: "Entreprise Alice", ownerKind: "company" })
    expect(await ruleOf(claim(t, bob, root, held.pageId))).toBe("PAGE_ALREADY_CLAIMED")
    expect((await claim(t, alice, root, held.pageId)).claimId).toBeDefined()
    await operator.as.mutation(ADMIN.setPageTrust, { pageId: held.pageId, trust: "verified", reason: "Registre du commerce vérifié." })
    expect(await ruleOf(claim(t, bob, root, held.pageId))).toBe("PAGE_ALREADY_VERIFIED")
  })

  it("les pièces : une à cinq, dépôts NEUFS du demandeur, d'un type admis", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const presidente = await enter(t, root, "presidente")
    const other = await enter(t, root, "autre")
    const { pageId } = await unclaimedAssociation(t, root)
    expect(await ruleOf(presidente.as.mutation(C.requestPageClaim, { networkId: root, pageId, evidence: [] }))).toBe("PAGE_CLAIM_EVIDENCE_COUNT")
    const executable = await storeBlob(t, "application/x-msdownload")
    expect(await ruleOf(presidente.as.mutation(C.requestPageClaim, { networkId: root, pageId, evidence: [{ storageId: executable, mimeType: "application/x-msdownload" }] }))).toBe(
      "UPLOAD_TYPE_NOT_ALLOWED",
    )
    // Une pièce déjà admise pour un autre dossier n'est plus « neuve ».
    const { claimId } = await claim(t, other, root, pageId)
    const used = await t.run(async (ctx) => (await ctx.db.get(claimId))!.evidenceStorageIds[0]!)
    expect(await codeOf(presidente.as.mutation(C.requestPageClaim, { networkId: root, pageId, evidence: [{ storageId: used, mimeType: "application/pdf" }] }))).toBe("notFound")
  })
})

describe("trancher une revendication", () => {
  it("validée : le demandeur devient administrateur, la page devient « Vérifié » ; la décision est motivée, tracée et définitive", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const presidente = await enter(t, root, "presidente")
    const moderator = await enter(t, root, "moderatrice", "network_moderator")
    const { pageId, handle } = await unclaimedAssociation(t, root)
    const { claimId } = await claim(t, presidente, root, pageId)
    expect(await codeOf(presidente.as.mutation(C.decidePageClaim, { networkId: root, claimId, decision: "approved", reason: "Je me valide." }))).toBe("notFound")
    expect(await ruleOf(moderator.as.mutation(C.decidePageClaim, { networkId: root, claimId, decision: "approved", reason: "ok" }))).toBe("DECISION_REASON_LENGTH")
    expect(await moderator.as.mutation(C.decidePageClaim, { networkId: root, claimId, decision: "approved", reason: "Statuts et mandat conformes." })).toEqual({ status: "approved" })
    expect(await presidente.as.query(P.getPage, { networkId: root, handle })).toMatchObject({ badge: "verified", viewer: { role: "admin" } })
    expect(await codeOf(moderator.as.mutation(C.decidePageClaim, { networkId: root, claimId, decision: "rejected", reason: "Changement d'avis." }))).toBe("conflict")
    const journal = await t.run(async (ctx) => await ctx.db.query("engineAudit").withIndex("by_subject_at", (q) => q.eq("subjectTable", "pageClaims").eq("subjectId", claimId)).take(5))
    expect(journal).toMatchObject([
      { action: "page.claim_decide", capacity: "network_moderator", actorPersonId: moderator.personId, details: { decision: "approved", previousTrust: "community", trust: "verified" } },
    ])
    // Plus revendicable : elle est vérifiée.
    const other = await enter(t, root, "autre")
    expect(await ruleOf(claim(t, other, root, pageId))).toBe("PAGE_ALREADY_VERIFIED")
  })

  it("rejetée : la page reste telle quelle ; la fiche se lit par la modération et le demandeur, personne d'autre", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const presidente = await enter(t, root, "presidente")
    const moderator = await enter(t, root, "moderatrice", "network_moderator")
    const curious = await enter(t, root, "curieux")
    const { pageId, handle } = await unclaimedAssociation(t, root)
    const { claimId } = await claim(t, presidente, root, pageId)
    expect(await codeOf(curious.as.query(C.getPageClaim, { networkId: root, claimId }))).toBe("notFound")
    await moderator.as.mutation(C.decidePageClaim, { networkId: root, claimId, decision: "rejected", reason: "Le mandat présenté est échu." })
    expect(await presidente.as.query(C.getPageClaim, { networkId: root, claimId })).toMatchObject({ status: "rejected", decisionReason: "Le mandat présenté est échu." })
    expect(await curious.as.query(P.getPage, { networkId: root, handle })).toMatchObject({ badge: "community", viewer: { role: null } })
  })

  it("retirer sa demande en attente purge ses pièces ; une demande tranchée ne se retire plus", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const presidente = await enter(t, root, "presidente")
    const { pageId } = await unclaimedAssociation(t, root)
    const { claimId } = await claim(t, presidente, root, pageId, 2)
    const documents = await t.run(async (ctx) => (await ctx.db.get(claimId))!.evidenceStorageIds)
    expect(await presidente.as.mutation(C.withdrawPageClaim, { networkId: root, claimId })).toEqual({ withdrawn: true })
    expect(await presidente.as.mutation(C.withdrawPageClaim, { networkId: root, claimId })).toEqual({ withdrawn: false })
    const left = await t.run(async (ctx) => {
      const blobs = await Promise.all(documents.map(async (id) => await ctx.db.system.get("_storage", id)))
      const scans = await Promise.all(documents.map(async (id) => await ctx.db.query("fileScans").withIndex("by_storageId", (q) => q.eq("storageId", id)).first()))
      return { blobs: blobs.filter((row) => row !== null).length, scans: scans.filter((row) => row !== null).length, kept: (await ctx.db.get(claimId))!.evidenceStorageIds.length }
    })
    expect(left).toEqual({ blobs: 0, scans: 0, kept: 0 })
  })
})

describe("AS-01 — l'équipe de modération du réseau instruit les revendications", () => {
  const FIRST = { numItems: 10, cursor: null }
  const REASON = "Statuts déposés et procès-verbal d'élection conformes."

  /** Une équipe de modération, créée et peuplée par l'administration du réseau (chemins réels du moteur). */
  async function createTeam(admin: Person, rootId: Id<"networks">, name: string, scope?: "page" | "post"): Promise<Id<"moderationTeams">> {
    return (await admin.as.mutation(CASES.createTeam, { networkId: rootId, name, ...(scope ? { scope } : {}), reason: "Équipe de la recette AS-01." })).teamId
  }
  async function setMember(admin: Person, rootId: Id<"networks">, teamId: Id<"moderationTeams">, person: Person, active: boolean): Promise<void> {
    await admin.as.mutation(CASES.setTeamMember, { networkId: rootId, teamId, personId: person.personId, active, reason: "Nomination de la recette AS-01." })
  }
  /**
   * Ce que la personne obtient de la file et de la fiche (`admitted`, le code du refus, ou `unexpected` pour
   * une erreur hors moteur), et ce que lui dit `myPageClaimReview` (l'onglet de `/moderation`).
   */
  async function reach(who: Person, rootId: Id<"networks">, claimId: Id<"pageClaims">) {
    const outcome = async (promise: Promise<unknown>) => {
      try {
        await promise
        return "admitted"
      } catch (error) {
        return engineErrorCode(error) ?? "unexpected"
      }
    }
    return {
      queue: await outcome(who.as.query(C.paginatePageClaims, { networkId: rootId, paginationOpts: FIRST })),
      detail: await outcome(who.as.query(C.getPageClaim, { networkId: rootId, claimId })),
      review: (await who.as.query(C.myPageClaimReview, { networkId: rootId })).canReview,
    }
  }

  it("le membre actif de l'équipe vivante lit la file, la fiche et ses pièces, et tranche ; le journal dit sa qualité et son équipe", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const admin = await enter(t, root, "administratrice", "network_admin")
    const presidente = await enter(t, root, "presidente")
    const teammate = await enter(t, root, "equipiere")
    const curious = await enter(t, root, "curieux")
    const teamId = await createTeam(admin, root, "Équipe générale")
    await setMember(admin, root, teamId, teammate, true)
    const { pageId, handle } = await unclaimedAssociation(t, root)
    const { claimId } = await claim(t, presidente, root, pageId)

    expect((await teammate.as.query(C.paginatePageClaims, { networkId: root, paginationOpts: FIRST })).page.map((row) => row.claimId)).toEqual([claimId])
    const detail = await teammate.as.query(C.getPageClaim, { networkId: root, claimId })
    expect(detail).toMatchObject({ claimId, status: "pending", canDecide: true, evidencePurgeAt: null, evidence: [{ url: null, withheld: "fileScanPending" }] })
    // Un tiers du réseau, hors équipe : le refus indistinct, partout.
    expect(await reach(curious, root, claimId)).toEqual({ queue: "notFound", detail: "notFound", review: false })
    expect(await reach(teammate, root, claimId)).toEqual({ queue: "admitted", detail: "admitted", review: true })
    expect(await codeOf(curious.as.mutation(C.decidePageClaim, { networkId: root, claimId, decision: "approved", reason: REASON }))).toBe("notFound")

    expect(await teammate.as.mutation(C.decidePageClaim, { networkId: root, claimId, decision: "approved", reason: REASON })).toEqual({ status: "approved" })
    expect(await curious.as.query(P.getPage, { networkId: root, handle })).toMatchObject({ badge: "verified" })
    const journal = await t.run(async (ctx) => await ctx.db.query("engineAudit").withIndex("by_subject_at", (q) => q.eq("subjectTable", "pageClaims").eq("subjectId", claimId)).take(5))
    expect(journal).toMatchObject([{ action: "page.claim_decide", capacity: "moderation_team_member", actorPersonId: teammate.personId, details: { decision: "approved", teamId } }])
  })

  it("équipe d'une autre nature, équipe générale quand une équipe « page » existe, membre retiré, équipe éteinte : aucune compétence ; le rôle de réseau reste admis", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const admin = await enter(t, root, "administratrice", "network_admin")
    const presidente = await enter(t, root, "presidente")
    const postsOnly = await enter(t, root, "publications")
    const generalist = await enter(t, root, "generaliste")
    const pagesMember = await enter(t, root, "pages")
    const moderator = await enter(t, root, "moderatrice", "network_moderator")
    const postsTeam = await createTeam(admin, root, "Équipe des publications", "post")
    const generalTeam = await createTeam(admin, root, "Équipe générale")
    await setMember(admin, root, postsTeam, postsOnly, true)
    await setMember(admin, root, generalTeam, generalist, true)
    const { pageId } = await unclaimedAssociation(t, root)
    const { claimId } = await claim(t, presidente, root, pageId)
    const ADMITTED = { queue: "admitted", detail: "admitted", review: true }
    const REFUSED = { queue: "notFound", detail: "notFound", review: false }

    // Sans équipe « page » : l'équipe générale reçoit les pages ; l'équipe des publications, jamais.
    expect(await reach(postsOnly, root, claimId)).toEqual(REFUSED)
    expect(await codeOf(postsOnly.as.mutation(C.decidePageClaim, { networkId: root, claimId, decision: "approved", reason: REASON }))).toBe("notFound")
    expect(await reach(generalist, root, claimId)).toEqual(ADMITTED)

    // Une équipe « page » existe : elle seule reçoit les pages (comme un signalement de page), l'équipe générale plus.
    const pagesTeam = await createTeam(admin, root, "Équipe des pages", "page")
    await setMember(admin, root, pagesTeam, pagesMember, true)
    expect(await reach(generalist, root, claimId)).toEqual(REFUSED)
    expect(await reach(pagesMember, root, claimId)).toEqual(ADMITTED)
    // Le rôle de réseau reste admis, dans aucune équipe ; l'administration aussi.
    expect(await reach(moderator, root, claimId)).toEqual(ADMITTED)
    expect(await reach(admin, root, claimId)).toEqual(ADMITTED)
    expect((await moderator.as.query(C.getPageClaim, { networkId: root, claimId })).canDecide).toBe(true)

    // Membre retiré de l'équipe : plus rien.
    await setMember(admin, root, pagesTeam, pagesMember, false)
    expect(await reach(pagesMember, root, claimId)).toEqual(REFUSED)
    expect(await codeOf(pagesMember.as.mutation(C.decidePageClaim, { networkId: root, claimId, decision: "approved", reason: REASON }))).toBe("notFound")

    // L'équipe « page » éteinte, l'équipe générale reprend les pages ; éteinte à son tour, plus personne par équipe.
    await t.run(async (ctx) => { await ctx.db.patch(pagesTeam, { active: false }) })
    expect(await reach(generalist, root, claimId)).toEqual(ADMITTED)
    await t.run(async (ctx) => { await ctx.db.patch(generalTeam, { active: false }) })
    expect(await reach(generalist, root, claimId)).toEqual(REFUSED)
    expect(await codeOf(generalist.as.mutation(C.decidePageClaim, { networkId: root, claimId, decision: "approved", reason: REASON }))).toBe("notFound")
    expect(await t.run(async (ctx) => (await ctx.db.get(claimId))!.status)).toBe("pending")
  })

  it("le conflit d'intérêts vaut aussi pour l'équipe : le demandeur et un signataire, même invité, sont refusés comme un tiers", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const admin = await enter(t, root, "administratrice", "network_admin")
    const presidente = await enter(t, root, "presidente")
    const signer = await enter(t, root, "signataire")
    const teammate = await enter(t, root, "equipiere")
    const curious = await enter(t, root, "curieux")
    const teamId = await createTeam(admin, root, "Équipe des pages", "page")
    for (const person of [presidente, signer, teammate]) await setMember(admin, root, teamId, person, true)
    const { pageId } = await unclaimedAssociation(t, root)
    // Une invitation à signer, encore en attente (aucune acceptation) : elle suffit au conflit.
    await t.run(async (ctx) => { await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId: signer.personId, role: "signatory", authorityRevision: 0, createdAt: 1, updatedAt: 1 }) })
    const { claimId } = await claim(t, presidente, root, pageId)

    for (const who of [presidente, signer]) {
      expect((await who.as.query(C.getPageClaim, { networkId: root, claimId })).canDecide).toBe(false)
      expect(await codeOf(who.as.mutation(C.decidePageClaim, { networkId: root, claimId, decision: "approved", reason: REASON }))).toBe("notFound")
    }
    // Le même refus que pour un tiers hors équipe : rien ne dit pourquoi.
    expect(await codeOf(curious.as.mutation(C.decidePageClaim, { networkId: root, claimId, decision: "approved", reason: REASON }))).toBe("notFound")
    expect((await teammate.as.query(C.getPageClaim, { networkId: root, claimId })).canDecide).toBe(true)
    expect(await teammate.as.mutation(C.decidePageClaim, { networkId: root, claimId, decision: "rejected", reason: "Le mandat présenté est échu." })).toEqual({ status: "rejected" })
  })

  it("l'échéance de suppression des pièces se lit par le demandeur et par la modération ; aucune tant que la demande est en attente ou retirée", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const admin = await enter(t, root, "administratrice", "network_admin")
    const presidente = await enter(t, root, "presidente")
    const teammate = await enter(t, root, "equipiere")
    const moderator = await enter(t, root, "moderatrice", "network_moderator")
    const teamId = await createTeam(admin, root, "Équipe des pages", "page")
    await setMember(admin, root, teamId, teammate, true)
    const decidedPage = await unclaimedAssociation(t, root, "association-de-lyon")
    const pendingPage = await unclaimedAssociation(t, root, "association-de-lille")
    const withdrawnPage = await unclaimedAssociation(t, root, "association-de-nantes")
    const { claimId } = await claim(t, presidente, root, decidedPage.pageId, 2)
    const pending = (await claim(t, presidente, root, pendingPage.pageId)).claimId
    const withdrawn = (await claim(t, presidente, root, withdrawnPage.pageId)).claimId
    await presidente.as.mutation(C.withdrawPageClaim, { networkId: root, claimId: withdrawn })
    await teammate.as.mutation(C.decidePageClaim, { networkId: root, claimId, decision: "rejected", reason: "Le mandat présenté est échu." })
    const decidedAt = (await t.run(async (ctx) => (await ctx.db.get(claimId))!.decidedAt))!
    const purgeAt = decidedAt + PAGE_CLAIM_EVIDENCE_RETENTION_MS

    const mine = (await presidente.as.query(C.paginateMyPageClaims, { networkId: root, paginationOpts: FIRST })).page
    expect(Object.fromEntries(mine.map((row) => [row.claimId, row.evidencePurgeAt]))).toEqual({ [claimId]: purgeAt, [pending]: null, [withdrawn]: null })
    for (const who of [presidente, teammate, moderator]) {
      expect(await who.as.query(C.getPageClaim, { networkId: root, claimId })).toMatchObject({ status: "rejected", evidenceCount: 2, evidencePurgeAt: purgeAt })
    }
    expect((await teammate.as.query(C.paginatePageClaims, { networkId: root, status: "rejected", paginationOpts: FIRST })).page).toMatchObject([{ claimId, evidencePurgeAt: purgeAt }])
    expect((await moderator.as.query(C.getPageClaim, { networkId: root, claimId: pending })).evidencePurgeAt).toBeNull()
  })
})
