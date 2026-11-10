// @vitest-environment edge-runtime
/** MP13 : annuaire synthétique, sessions réelles et retraits relus à chaque fenêtre. */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { EDITORIAL_PUBLIC_CONSENT_VERSION } from "@antsia/social-domain/editorial"
import type { PaginationOptions } from "convex/server"
import { describe, expect, it } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"

const first: PaginationOptions = { cursor: null, numItems: 12 }
async function fixture() {
  const t = testConvex(), { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  async function person(handle: string) {
    const as = t.withIdentity({ subject: `editorial-directory-${handle}` })
    const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
    await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
    return { as, personId }
  }
  const owner = await person("directory-owner"), reader = await person("directory-reader"), other = await person("directory-other")
  let sequence = 0
  async function media(options: { networkId?: Id<"networks">; visibility?: "network" | "public"; status?: Doc<"moderationContentStates">["status"]; updatedAt?: number } = {}) {
    const number = ++sequence, networkId = options.networkId ?? root, visibility = options.visibility ?? "network"
    return await t.run(async ctx => {
      const now = Date.now()
      const pageId = await ctx.db.insert("pages", { networkId, handle: `media-recette-${number}`, name: `Média recette ${number}`, ownerKind: "media", trust: "community", trustRank: 0, visibility: "network", onRoot: false, status: "active", createdByPersonId: owner.personId, searchText: `media recette ${number}`, createdAt: now, updatedAt: now })
      const signatoryId = await ctx.db.insert("pageSignatories", { networkId, pageId, personId: owner.personId, role: "admin", acceptedAt: now, authorityRevision: 0, createdAt: now, updatedAt: now })
      const mediaId = await ctx.db.insert("editorialMedia", { networkId, pageId, revision: 1, description: `Description du média ${number}`, sections: [{ key: "actualites", label: "Actualités" }], visibility,
        ...(visibility === "public" ? { publicConsentTextVersion: EDITORIAL_PUBLIC_CONSENT_VERSION, publicConsentedAt: now, publicConsentByPersonId: owner.personId, publicConsentAuthority: { signatoryId, authorityRevision: 0 } } : {}),
        createdByPersonId: owner.personId, createdAt: now, updatedAt: options.updatedAt ?? now + number })
      const stateId = await ctx.db.insert("moderationContentStates", { networkId, targetKind: "editorialMedia", targetId: mediaId, ownerPageId: pageId, status: options.status ?? "published", createdAt: now, updatedAt: now })
      return { pageId, signatoryId, mediaId, stateId, handle: `media-recette-${number}` }
    })
  }
  return { t, root, testClosed, owner, reader, other, media }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
const read = (f: Fixture, paginationOpts: PaginationOptions = first, who = f.reader) => who.as.query(api.modules.editorial.directory.list, { networkId: f.root, readerScope: who.personId, paginationOpts })
async function code(work: Promise<unknown>) { try { await work; return null } catch (error) { return engineErrorCode(error) } }

describe("MP13 — annuaire lecteur de médias", () => {
  it("projette seulement la présentation servable et jamais les preuves, droits ou identifiants internes", async () => {
    const f = await fixture(), item = await f.media({ visibility: "public" })
    expect(await read(f)).toEqual({ page: [{ handle: item.handle, name: "Média recette 1", description: "Description du média 1", sections: [{ key: "actualites", label: "Actualités" }] }], isDone: true, continueCursor: "", filteredWindow: false })
    const encoded = JSON.stringify(await read(f))
    for (const privateValue of [item.mediaId, item.pageId, item.signatoryId, f.owner.personId, EDITORIAL_PUBLIC_CONSENT_VERSION]) expect(encoded).not.toContain(privateValue)
  })

  it("exige une session membre et lie la portée de cache au lecteur authentifié", async () => {
    const f = await fixture()
    const args = { networkId: f.root, readerScope: f.reader.personId, paginationOpts: first }
    expect(await code(f.t.query(api.modules.editorial.directory.list, args))).not.toBeNull()
    expect(await code(f.reader.as.query(api.modules.editorial.directory.list, { ...args, networkId: f.testClosed }))).not.toBeNull()
    expect(await code(f.other.as.query(api.modules.editorial.directory.list, args))).toBe("invalidArgument")
    await f.t.run(async ctx => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", f.root).eq("personId", f.reader.personId)).unique()
      if (row) await ctx.db.patch(row._id, { status: "suspendue" })
    })
    expect(await code(read(f))).toBe("membershipSuspended")
  })

  it("ne rend ni la présentation en relecture ni celle retirée, même à son propriétaire", async () => {
    const f = await fixture()
    await f.media({ status: "pending_review" }); await f.media({ status: "removed" })
    expect((await read(f)).page).toEqual([])
    expect((await read(f, first, f.owner)).page).toEqual([])
  })

  it("relit la page active, sa modération et le dernier administrateur vivant", async () => {
    const f = await fixture(), item = await f.media()
    expect((await read(f)).page).toHaveLength(1)
    await f.t.run(ctx => ctx.db.patch(item.pageId, { status: "inactive" }))
    expect((await read(f)).page).toEqual([])
    await f.t.run(async ctx => {
      await ctx.db.patch(item.pageId, { status: "active" })
      await ctx.db.insert("moderationContentStates", { networkId: f.root, targetKind: "page", targetId: item.pageId, ownerPageId: item.pageId, status: "removed", createdAt: Date.now(), updatedAt: Date.now() })
    })
    expect((await read(f)).page).toEqual([])
    await f.t.run(async ctx => {
      const state = await ctx.db.query("moderationContentStates").withIndex("by_target", q => q.eq("targetKind", "page").eq("targetId", item.pageId)).unique()
      if (state) await ctx.db.patch(state._id, { status: "published" })
      await ctx.db.patch(item.signatoryId, { role: "signatory", authorityRevision: 1 })
    })
    expect((await read(f)).page).toEqual([])
  })

  it("revérifie la capacité média des activités et retire la configuration devenue incompatible", async () => {
    const f = await fixture(), item = await f.media()
    const shopId = await f.t.run(async ctx => {
      await ctx.db.patch(item.pageId, { ownerKind: "company" })
      return ctx.db.insert("shops", { networkId: f.root, pageId: item.pageId, preparedByPersonId: f.owner.personId, model: "products", storefront: "published", visibility: "network", activityConfiguration: { version: 1, capabilities: ["media"], template: "media", blocks: ["publications", "about"] }, createdAt: Date.now(), updatedAt: Date.now() })
    })
    expect((await read(f)).page).toHaveLength(1)
    await f.t.run(ctx => ctx.db.patch(shopId, { activityConfiguration: { version: 1, capabilities: ["products"], template: "general", blocks: ["catalog"] } }))
    expect((await read(f)).page).toEqual([])
  })

  it.each(["consent", "authority"] as const)("retire une diffusion publique après perte de %s sans livrer sa preuve", async change => {
    const f = await fixture(), item = await f.media({ visibility: "public" })
    expect((await read(f)).page).toHaveLength(1)
    await f.t.run(async ctx => {
      if (change === "consent") await ctx.db.patch(item.mediaId, { publicConsentRevokedAt: Date.now() })
      else await ctx.db.patch(item.signatoryId, { authorityRevision: 1 })
    })
    expect((await read(f)).page).toEqual([])
  })

  it("continue après douze médias filtrés, sans mélanger les réseaux ni perdre les éléments suivants", async () => {
    const f = await fixture(), visible = await f.media({ updatedAt: 1 })
    for (let index = 0; index < 12; index++) await f.media({ status: "removed", updatedAt: 100 + index })
    await f.media({ networkId: f.testClosed, updatedAt: 1000 })
    const window = await read(f)
    expect(window).toMatchObject({ page: [], isDone: false, filteredWindow: true })
    expect(window.continueCursor).not.toBe("")
    const next = await read(f, { ...first, cursor: window.continueCursor })
    expect(next.page.map(item => item.handle)).toEqual([visible.handle])
    expect(next.isDone).toBe(true)
    expect(next.continueCursor).toBe("")
    expect(await code(read(f, { ...first, cursor: window.continueCursor }, f.other))).toBe("invalidArgument")
  })

  it("refuse les tailles hors borne, curseurs étrangers ou malformés et présentations non canoniques", async () => {
    const f = await fixture(), item = await f.media()
    for (const numItems of [0, 13, 1.5]) expect(await code(read(f, { ...first, numItems }))).toBe("invalidArgument")
    for (const cursor of ["", "not-json", "x".repeat(8193), JSON.stringify({ version: 1, scope: "foreign", cursor: "cursor" })]) expect(await code(read(f, { ...first, cursor }))).toBe("invalidArgument")
    await f.t.run(ctx => ctx.db.patch(item.mediaId, { description: "<script>non canonique</script>" }))
    expect((await read(f)).page).toEqual([])
  })
})
