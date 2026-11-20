/**
 * Choix privés du fil DIASPORA.GA (DG-003).
 *
 * Chaque ligne appartient au lecteur et reste restaurable quand sa cible ne
 * peut plus être montrée. Une marque n'accorde aucun droit de lecture ; une
 * sourdine n'accorde aucun droit d'annuaire. La version du choix est son
 * identifiant : un ancien geste ne retire jamais un choix créé depuis.
 */
import { hasCapability } from "@diaspora-ga/domain"
import { paginationOptsValidator, paginationResultValidator, type PaginationResult } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { pageCardCache, readablePageOrNull } from "../pages/access"
import { miniProfileCache } from "../people/miniProfile"
import { canSeePostDoc } from "../posts/access"
import { directoryReader, listedMemberFor } from "./directory"
import { assertDiasporaNetwork } from "./facts"

const CHOICES_PAGE_MAX = 50
const CHOICES_PAGE_BYTES = 2 * 1024 * 1024

const choiceAuthorValidator = v.object({
  kind: v.union(v.literal("person"), v.literal("page")),
  displayName: v.string(),
  handle: v.union(v.string(), v.null()),
  avatarUrl: v.union(v.string(), v.null()),
})

const choiceFields = {
  at: v.number(),
  postId: v.union(v.id("posts"), v.null()),
  body: v.union(v.string(), v.null()),
  author: v.union(choiceAuthorValidator, v.null()),
}

const hiddenPostChoiceValidator = v.object({ choiceId: v.id("postMarks"), ...choiceFields })
const mutedAuthorChoiceValidator = v.object({ choiceId: v.id("mutes"), ...choiceFields })

export type HiddenPostChoiceDto = typeof hiddenPostChoiceValidator.type
export type MutedAuthorChoiceDto = typeof mutedAuthorChoiceValidator.type
type ChoiceAuthor = typeof choiceAuthorValidator.type

/** Le profil publié n'est résolu qu'APRÈS admission par l'annuaire de ce lecteur. */
async function listedAuthorCache(
  ctx: QueryCtx,
  network: Doc<"networks">,
  readerPersonId: Id<"persons">,
): Promise<(personId: Id<"persons">) => Promise<ChoiceAuthor | null>> {
  const reader = await directoryReader(ctx, network, readerPersonId)
  const eligibleReader = reader && hasCapability(reader.status, "view_directory") ? reader : null
  const profileOf = miniProfileCache(ctx)
  return async (personId) => {
    if (!eligibleReader || !(await listedMemberFor(ctx, network, eligibleReader, personId))) return null
    const profile = await profileOf(personId)
    if (profile.displayName === null) return null
    return { kind: "person", displayName: profile.displayName, handle: profile.handle, avatarUrl: profile.avatarUrl }
  }
}

/** Mes masquages, y compris les choix dont le contenu est désormais inaccessible. */
export const paginateHiddenPosts = networkQuery({
  minStatus: "en_attente",
  args: { expectedPersonId: v.id("persons"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(hiddenPostChoiceValidator),
  handler: async (ctx, { expectedPersonId, paginationOpts }): Promise<PaginationResult<HiddenPostChoiceDto>> => {
    assertDiasporaNetwork(ctx.network)
    if (expectedPersonId !== ctx.person._id) return notFound()
    const result = await ctx.db.query("postMarks")
      .withIndex("by_network_person_kind_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id).eq("kind", "hidden"))
      .order("desc")
      .paginate({
        ...paginationOpts,
        numItems: Math.min(Math.max(Math.trunc(paginationOpts.numItems), 1), CHOICES_PAGE_MAX),
        maximumBytesRead: Math.min(paginationOpts.maximumBytesRead ?? CHOICES_PAGE_BYTES, CHOICES_PAGE_BYTES),
      })
    const reader = { personId: ctx.person._id, network: ctx.network }
    const authorOf = await listedAuthorCache(ctx, ctx.network, ctx.person._id)
    const pageOf = pageCardCache(ctx)
    const page: HiddenPostChoiceDto[] = []
    for (const mark of result.page) {
      const choice: HiddenPostChoiceDto = { choiceId: mark._id, at: mark.createdAt, postId: null, body: null, author: null }
      const post = await ctx.db.get(mark.postId)
      if (!post || !(await canSeePostDoc(ctx, reader, post))) {
        page.push(choice)
        continue
      }
      let author: ChoiceAuthor | null
      if (post.pageId !== undefined) {
        const readablePage = await readablePageOrNull(ctx, ctx.network, post.pageId, ctx.person._id)
        const card = readablePage ? await pageOf(post.pageId) : null
        if (!card) {
          page.push(choice)
          continue
        }
        // La page parle ; aucune identité de son signataire historique ne sort.
        author = { kind: "page", displayName: card.shortName ?? card.name, handle: card.handle, avatarUrl: card.logoUrl }
      } else if (post.authorPersonId !== undefined) {
        author = await authorOf(post.authorPersonId)
      } else {
        author = null
      }
      page.push({ ...choice, postId: post._id, body: post.body, author })
    }
    return { ...result, page }
  },
})

/** Mes sourdines : la cible reste neutre tant que l'annuaire ne la montre pas. */
export const paginateMutedAuthors = networkQuery({
  minStatus: "en_attente",
  args: { expectedPersonId: v.id("persons"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(mutedAuthorChoiceValidator),
  handler: async (ctx, { expectedPersonId, paginationOpts }): Promise<PaginationResult<MutedAuthorChoiceDto>> => {
    assertDiasporaNetwork(ctx.network)
    if (expectedPersonId !== ctx.person._id) return notFound()
    const result = await ctx.db.query("mutes")
      .withIndex("by_network_person_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id))
      .order("desc")
      .paginate({
        ...paginationOpts,
        numItems: Math.min(Math.max(Math.trunc(paginationOpts.numItems), 1), CHOICES_PAGE_MAX),
        maximumBytesRead: Math.min(paginationOpts.maximumBytesRead ?? CHOICES_PAGE_BYTES, CHOICES_PAGE_BYTES),
      })
    const authorOf = await listedAuthorCache(ctx, ctx.network, ctx.person._id)
    const page: MutedAuthorChoiceDto[] = []
    for (const row of result.page) {
      page.push({ choiceId: row._id, at: row.createdAt, postId: null, body: null, author: await authorOf(row.mutedPersonId) })
    }
    return { ...result, page }
  },
})

/** Retire seulement CE masquage du lecteur, même si le contenu n'est plus lisible. */
export const restoreHiddenPost = networkMutation({
  minStatus: "en_attente",
  args: { expectedPersonId: v.id("persons"), choiceId: v.id("postMarks") },
  returns: v.object({ restored: v.boolean() }),
  handler: async (ctx, { expectedPersonId, choiceId }) => {
    assertDiasporaNetwork(ctx.network)
    if (expectedPersonId !== ctx.person._id) return notFound()
    await enforceRateLimit(ctx, "mark.toggle", ctx.person._id)
    const row = await ctx.db.get(choiceId)
    if (!row || row.networkId !== ctx.networkId || row.personId !== ctx.person._id || row.kind !== "hidden") return { restored: false }
    await ctx.db.delete(row._id)
    return { restored: true }
  },
})

/** Retire seulement CETTE sourdine ; une restauration ancienne reste sans effet. */
export const restoreMutedAuthor = networkMutation({
  minStatus: "en_attente",
  args: { expectedPersonId: v.id("persons"), choiceId: v.id("mutes") },
  returns: v.object({ restored: v.boolean() }),
  handler: async (ctx, { expectedPersonId, choiceId }) => {
    assertDiasporaNetwork(ctx.network)
    if (expectedPersonId !== ctx.person._id) return notFound()
    await enforceRateLimit(ctx, "mute.toggle", ctx.person._id)
    const row = await ctx.db.get(choiceId)
    if (!row || row.networkId !== ctx.networkId || row.personId !== ctx.person._id) return { restored: false }
    await ctx.db.delete(row._id)
    return { restored: true }
  },
})
