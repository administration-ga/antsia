// @vitest-environment edge-runtime
/**
 * PF-02 (plan 05) — signaler un profil et un album. Le geste est monté par MC-01 (menu « … » de la fiche
 * d'autrui, bouton de l'album d'autrui) ; ce fichier prouve les critères d'acceptation côté moteur :
 * le dossier arrive dans la file de l'équipe de modération de sa nature, avec son extrait ; le contenu est
 * masqué pour le seul déclarant ; l'auto-signalement est refusé ; un second signalement ne crée aucun
 * doublon ; toute cible hors de l'audience réelle est refusée de façon indistincte ; une décision retire
 * le contenu pour tous.
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }
const M = api.modules.moderation.cases
const A = api.modules.albums.albums
const PREVIEW = api.modules.moderation.reviewProjection.preview
const PAGE = { numItems: 25, cursor: null }

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

async function enter(t: T, root: Id<"networks">, handle: string, role?: "network_moderator" | "network_admin", headline?: string): Promise<Person> {
  const as = t.withIdentity({ subject: `pf02-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle, ...(headline ? { headline } : {}) })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  if (role) await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", root).eq("personId", personId)).unique()
    if (row) await ctx.db.patch(row._id, { role })
  })
  return { as, personId, handle }
}

async function errorCode(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise
    return null
  } catch (error) {
    return engineErrorCode(error) ?? "unknown"
  }
}

/**
 * Un réseau, une personne signalée (et propriétaire d'albums), une déclarante, une tierce, un administrateur
 * qui pose deux équipes — l'une pour les profils, l'autre pour les albums — et une modératrice dans chacune.
 */
async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const owner = await enter(t, root, "proprietaire", undefined, "Photographe à Oyem")
  const reporter = await enter(t, root, "declarante")
  const other = await enter(t, root, "tierce")
  const admin = await enter(t, root, "administrateur", "network_admin")
  const profileModerator = await enter(t, root, "moderatrice-profils")
  const albumModerator = await enter(t, root, "moderatrice-albums")
  const profileTeam = await admin.as.mutation(M.createTeam, { networkId: root, name: "Profils", scope: "person", reason: "Équipe des profils." })
  const albumTeam = await admin.as.mutation(M.createTeam, { networkId: root, name: "Albums", scope: "album", reason: "Équipe des albums." })
  await admin.as.mutation(M.setTeamMember, { networkId: root, teamId: profileTeam.teamId, personId: profileModerator.personId, active: true, reason: "Affectation." })
  await admin.as.mutation(M.setTeamMember, { networkId: root, teamId: albumTeam.teamId, personId: albumModerator.personId, active: true, reason: "Affectation." })
  return { t, root, owner, reporter, other, admin, profileModerator, albumModerator, profileTeamId: profileTeam.teamId, albumTeamId: albumTeam.teamId }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

/** Un album posé tel que le moteur le laisse après publication (une photo comptée, audience choisie). */
async function album(f: Fixture, input: { networkId?: Id<"networks">; status?: "draft" | "published"; audience?: "public" | "connections"; title?: string }): Promise<Id<"albums">> {
  return await f.t.run(async (ctx) => await ctx.db.insert("albums", {
    networkId: input.networkId ?? f.root,
    ownerPersonId: f.owner.personId,
    title: input.title ?? "Marché de Mont-Bouët",
    description: "Étals du samedi",
    audience: input.audience ?? "public",
    status: input.status ?? "published",
    itemCount: 1,
    createdAt: 1,
    updatedAt: 1,
    ...(input.status === "draft" ? {} : { publishedAt: 1 }),
  }))
}

describe("PF-02 — signaler un profil", () => {
  it("le dossier arrive dans la file de l'équipe des profils, avec son extrait ; la fiche est masquée pour la seule déclarante", async () => {
    const f = await fixture()
    const report = await f.reporter.as.mutation(M.report, { networkId: f.root, target: { kind: "person", id: f.owner.personId }, reason: "impersonation" })
    expect(report).toMatchObject({ created: true, hidden: true })

    // Le dossier : réseau racine, propriétaire = la personne signalée, équipe de sa nature, accusé de réception émis.
    const row = await f.t.run(async (ctx) => await ctx.db.get(report.reportId))
    expect(row).toMatchObject({ networkId: f.root, targetKind: "person", ownerPersonId: f.owner.personId, teamId: f.profileTeamId, level: "team", status: "open", reporterPersonId: f.reporter.personId })
    expect(row?.acknowledgedAt).toBeTypeOf("number")

    // La file de l'équipe des profils le montre ; celle des albums ne le connaît pas.
    const queue = await f.profileModerator.as.query(M.paginateQueue, { networkId: f.root, teamId: f.profileTeamId, paginationOpts: PAGE })
    expect(queue.page.map((item) => item.reportId)).toEqual([report.reportId])
    expect(queue.page[0]).toMatchObject({ target: { kind: "person", id: f.owner.personId }, reason: "impersonation" })
    expect(JSON.stringify(queue.page)).not.toContain(f.reporter.personId)
    const albumQueue = await f.albumModerator.as.query(M.paginateQueue, { networkId: f.root, teamId: f.albumTeamId, paginationOpts: PAGE })
    expect(albumQueue.page).toEqual([])

    // La modération relit le nom affiché et l'accroche, rien d'autre.
    expect(await f.profileModerator.as.query(PREVIEW, { networkId: f.root, reportId: report.reportId })).toMatchObject({ kind: "person", available: true, title: "proprietaire", body: "Photographe à Oyem", media: [] })

    // Le masque : la déclarante ne lit plus la fiche ; la tierce, toujours.
    expect(await f.reporter.as.query(api.modules.people.profile.getPublicProfile, { networkId: f.root, handle: "proprietaire" })).toBe(null)
    expect(await f.other.as.query(api.modules.people.profile.getPublicProfile, { networkId: f.root, handle: "proprietaire" })).toMatchObject({ personId: f.owner.personId })

    // « Mes signalements » le suit.
    const mine = await f.reporter.as.query(M.myReports, { paginationOpts: PAGE })
    expect(mine.page[0]).toMatchObject({ reportId: report.reportId, targetKind: "person", outcome: "pending" })
  })

  it("refuse de signaler sa propre fiche, et un second signalement rend le même dossier", async () => {
    const f = await fixture()
    expect(await errorCode(f.owner.as.mutation(M.report, { networkId: f.root, target: { kind: "person", id: f.owner.personId }, reason: "other" }))).toBe("notFound")
    const first = await f.reporter.as.mutation(M.report, { networkId: f.root, target: { kind: "person", id: f.owner.personId }, reason: "other" })
    const again = await f.reporter.as.mutation(M.report, { networkId: f.root, target: { kind: "person", id: f.owner.personId }, reason: "misinformation" })
    expect(again).toMatchObject({ reportId: first.reportId, created: false })
    const rows = await f.t.run(async (ctx) => await ctx.db.query("reports").withIndex("by_reporter_target", (q) => q.eq("reporterPersonId", f.reporter.personId).eq("targetKind", "person").eq("targetId", f.owner.personId)).take(3))
    expect(rows).toHaveLength(1)
  })

  it("refuse de façon indistincte un profil non publié ou une personne bloquée", async () => {
    const f = await fixture()
    const ghost = f.t.withIdentity({ subject: "pf02-fantome" })
    const ghostId = await ghost.mutation(api.modules.people.persons.ensureMyPerson, {})
    await f.other.as.mutation(api.modules.graph.connections.blockPerson, { networkId: f.root, targetPersonId: f.owner.personId })
    for (const [reporter, personId] of [[f.reporter, ghostId], [f.other, f.owner.personId]] as const) {
      expect(await errorCode(reporter.as.mutation(M.report, { networkId: f.root, target: { kind: "person", id: personId }, reason: "other" }))).toBe("notFound")
    }
  })

  it("la décision de l'équipe retire la fiche pour tous", async () => {
    const f = await fixture()
    const { reportId } = await f.reporter.as.mutation(M.report, { networkId: f.root, target: { kind: "person", id: f.owner.personId }, reason: "impersonation" })
    await f.profileModerator.as.mutation(M.decide, { networkId: f.root, reportId, decision: "actioned", reason: "Usurpation établie.", sanctions: [{ kind: "removal" }] })
    expect(await f.other.as.query(api.modules.people.profile.getPublicProfile, { networkId: f.root, handle: "proprietaire" })).toBe(null)
  })
})

describe("PF-02 — signaler un album", () => {
  it("le dossier arrive dans la file de l'équipe des albums, avec son extrait ; l'album est masqué pour la seule déclarante", async () => {
    const f = await fixture()
    const albumId = await album(f, {})
    const report = await f.reporter.as.mutation(M.report, { networkId: f.root, target: { kind: "album", id: albumId }, reason: "harassment" })
    expect(report).toMatchObject({ created: true, hidden: true })

    // Le dossier : réseau de l'album, propriétaire de l'album, équipe des albums, délai légal du harcèlement.
    const row = await f.t.run(async (ctx) => await ctx.db.get(report.reportId))
    expect(row).toMatchObject({ networkId: f.root, targetKind: "album", ownerPersonId: f.owner.personId, teamId: f.albumTeamId, level: "team", status: "open", legalBasis: "art24" })
    expect(row?.acknowledgedAt).toBeTypeOf("number")

    // La file des délais légaux de l'équipe des albums le montre ; l'équipe des profils, non.
    const queue = await f.albumModerator.as.query(M.deadlineQueue, { networkId: f.root, teamId: f.albumTeamId })
    expect(queue.items.map((item) => item.reportId)).toEqual([report.reportId])
    expect(queue.items[0]).toMatchObject({ target: { kind: "album", id: albumId }, legalBasis: "art24" })
    expect((await f.profileModerator.as.query(M.deadlineQueue, { networkId: f.root, teamId: f.profileTeamId })).items).toEqual([])

    // La modération relit le titre et la description de l'album.
    expect(await f.albumModerator.as.query(PREVIEW, { networkId: f.root, reportId: report.reportId })).toMatchObject({ kind: "album", available: true, title: "Marché de Mont-Bouët", body: "Étals du samedi" })

    // Le masque : ni le lien direct ni la liste des albums de la personne, pour la déclarante seule.
    expect(await f.reporter.as.query(A.getAlbum, { networkId: f.root, albumId })).toBe(null)
    expect((await f.reporter.as.query(A.paginatePersonAlbums, { networkId: f.root, handle: "proprietaire", paginationOpts: PAGE })).page).toEqual([])
    expect(await f.other.as.query(A.getAlbum, { networkId: f.root, albumId })).toMatchObject({ album: { title: "Marché de Mont-Bouët" } })
    expect((await f.other.as.query(A.paginatePersonAlbums, { networkId: f.root, handle: "proprietaire", paginationOpts: PAGE })).page).toHaveLength(1)

    const mine = await f.reporter.as.query(M.myReports, { paginationOpts: PAGE })
    expect(mine.page[0]).toMatchObject({ reportId: report.reportId, targetKind: "album", outcome: "pending" })
  })

  it("refuse de signaler son propre album, et un second signalement rend le même dossier", async () => {
    const f = await fixture()
    const albumId = await album(f, {})
    expect(await errorCode(f.owner.as.mutation(M.report, { networkId: f.root, target: { kind: "album", id: albumId }, reason: "other" }))).toBe("notFound")
    const first = await f.reporter.as.mutation(M.report, { networkId: f.root, target: { kind: "album", id: albumId }, reason: "other" })
    expect(await f.reporter.as.mutation(M.report, { networkId: f.root, target: { kind: "album", id: albumId }, reason: "other" })).toMatchObject({ reportId: first.reportId, created: false })
    const rows = await f.t.run(async (ctx) => await ctx.db.query("reports").withIndex("by_reporter_target", (q) => q.eq("reporterPersonId", f.reporter.personId).eq("targetKind", "album").eq("targetId", albumId)).take(3))
    expect(rows).toHaveLength(1)
  })

  it("refuse de façon indistincte un brouillon, un album réservé aux relations, un album d'un autre réseau ou d'une personne bloquée", async () => {
    const f = await fixture()
    const elsewhere = await f.t.run(async (ctx) => (await ctx.db.query("networks").take(10)).find((network) => network._id !== f.root)?._id)
    if (elsewhere === undefined) throw new Error("La graine des fondations pose un second réseau.")
    const draft = await album(f, { status: "draft" })
    const reserved = await album(f, { audience: "connections" })
    const foreign = await album(f, { networkId: elsewhere })
    for (const albumId of [draft, reserved, foreign]) {
      expect(await errorCode(f.reporter.as.mutation(M.report, { networkId: f.root, target: { kind: "album", id: albumId }, reason: "other" }))).toBe("notFound")
    }
    const open = await album(f, { title: "Ouvert" })
    await f.owner.as.mutation(api.modules.graph.connections.blockPerson, { networkId: f.root, targetPersonId: f.other.personId })
    expect(await errorCode(f.other.as.mutation(M.report, { networkId: f.root, target: { kind: "album", id: open }, reason: "other" }))).toBe("notFound")
    const rows = await f.t.run(async (ctx) => await ctx.db.query("reports").take(5))
    expect(rows).toEqual([])
  })

  it("la décision de l'équipe retire l'album pour tous, sans le supprimer", async () => {
    const f = await fixture()
    const albumId = await album(f, {})
    const { reportId } = await f.reporter.as.mutation(M.report, { networkId: f.root, target: { kind: "album", id: albumId }, reason: "other" })
    await f.albumModerator.as.mutation(M.decide, { networkId: f.root, reportId, decision: "actioned", reason: "Contenu contraire aux règles.", sanctions: [{ kind: "removal" }] })
    expect(await f.other.as.query(A.getAlbum, { networkId: f.root, albumId })).toBe(null)
    expect(await f.t.run(async (ctx) => (await ctx.db.get(albumId))?.status)).toBe("published")
  })
})
