/** Mes protections personnelles : projection minimale, deux sources paginées sans migration. */
import { paginationOptsValidator, type PaginationResult } from "convex/server"
import { v } from "convex/values"

import type { Id } from "../../_generated/dataModel"
import { networkQuery } from "../../lib/functions"
import { findPublishedPersonByHandle } from "../people/miniProfile"
import { pairBlockState } from "./graph"

export type PersonalBlockDto = { targetPersonId: Id<"persons">; at: number }

const PAGE_MAX = 50
const PAGE_BYTES = 2 * 1024 * 1024

export const paginateMine = networkQuery({
  minStatus: "en_attente",
  args: { source: v.union(v.literal("intents"), v.literal("legacy")), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<PersonalBlockDto>> => {
    const paginationOpts = {
      ...args.paginationOpts,
      numItems: Math.min(Math.max(Math.trunc(args.paginationOpts.numItems), 1), PAGE_MAX),
      maximumBytesRead: Math.min(args.paginationOpts.maximumBytesRead ?? PAGE_BYTES, PAGE_BYTES),
    }
    if (args.source === "intents") {
      const result = await ctx.db.query("personBlocks")
        .withIndex("by_blocker_createdAt", (q) => q.eq("blockerPersonId", ctx.person._id))
        .order("desc")
        .paginate(paginationOpts)
      return { ...result, page: result.page.map((row) => ({ targetPersonId: row.targetPersonId, at: row.createdAt })) }
    }
    const result = await ctx.db.query("connections")
      .withIndex("by_blocker_status_updatedAt", (q) => q.eq("blockedByPersonId", ctx.person._id).eq("status", "blocked"))
      .order("desc")
      .paginate(paginationOpts)
    return {
      ...result,
      page: result.page.map((row) => ({ targetPersonId: row.personIdLow === ctx.person._id ? row.personIdHigh : row.personIdLow, at: row.updatedAt })),
    }
  },
})

/**
 * MON blocage de la personne publiée sous cet identifiant dans le réseau, ou
 * `null` (PF-01). La fiche d'une personne bloquée reste refusée dans les deux
 * sens (`getPublicProfile` rend `null`) ; cette lecture permet seulement à
 * l'AUTEUR du blocage de le lever depuis cette fiche.
 *
 * ⚠️ Aucun oracle : seule MON intention (ou mon marqueur hérité) répond. Un
 * identifiant inconnu, retiré, d'un non-membre, une personne que je n'ai pas
 * bloquée ou qui m'a bloqué : `null`, sans distinction. L'identifiant rendu est
 * celui que `paginateMine` me donne déjà.
 */
export const myBlockByHandle = networkQuery({
  minStatus: "en_attente",
  args: { handle: v.string() },
  returns: v.union(v.null(), v.object({ targetPersonId: v.id("persons") })),
  handler: async (ctx, { handle }) => {
    const person = await findPublishedPersonByHandle(ctx, ctx.networkId, handle)
    if (!person || person._id === ctx.person._id) return null
    const pair = await pairBlockState(ctx, ctx.person._id, person._id)
    return pair.byFirst ? { targetPersonId: person._id } : null
  },
})
