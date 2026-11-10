/** MP13 : annuaire de lecture membre ; aucun brouillon ni mandat de rédaction projeté. */
import { parseEditorialConfigInput } from "@antsia/social-domain/editorial"
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import { fail } from "../../lib/errors"
import { networkQuery } from "../../lib/functions"
import { editorialPublicConsentLive } from "./publication"
import { readableEditorialMedia } from "./read"
import { editorialDigest, editorialPageSize } from "./rules"
import { editorialSectionValidator } from "./validators"

const cardValidator = v.object({ handle: v.string(), name: v.string(), description: v.string(), sections: v.array(editorialSectionValidator) })

function readCursor(raw: string | null, scope: string): string | null {
  if (raw === null) return null
  if (!raw || raw.length > 8192) return fail("invalidArgument", { field: "cursor" })
  try {
    const row: unknown = JSON.parse(raw)
    if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).length !== 3 || !("version" in row) || row.version !== 1 || !("scope" in row) || row.scope !== scope || !("cursor" in row) || typeof row.cursor !== "string" || !row.cursor) return fail("invalidArgument", { field: "cursor" })
    return row.cursor
  } catch { return fail("invalidArgument", { field: "cursor" }) }
}

export const list = networkQuery({
  minStatus: "declaree",
  // L'identité reste celle du constructeur ; ce paramètre sépare les caches clients.
  args: { readerScope: v.id("persons"), paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(cardValidator), isDone: v.boolean(), continueCursor: v.string(), filteredWindow: v.boolean() }),
  handler: async (ctx, args) => {
    if (args.readerScope !== ctx.person._id) return fail("invalidArgument")
    const count = editorialPageSize(args.paginationOpts.numItems)
    const scope = await editorialDigest(["editorial-directory-v1", ctx.networkId, ctx.person._id])
    const cursor = readCursor(args.paginationOpts.cursor, scope)
    // Les deux visibilités sont lisibles par les membres ; aucune collecte ni recherche tronquée.
    const window = await ctx.db.query("editorialMedia").withIndex("by_network_updatedAt", q => q.eq("networkId", ctx.networkId)).order("desc")
      .paginate({ cursor, numItems: count, maximumRowsRead: 12, maximumBytesRead: 128 * 1024 })
    const page = []
    for (const candidate of window.page) {
      const live = await readableEditorialMedia(ctx, ctx.networkId, candidate._id, ctx.person._id)
      if (!live || live.media.visibility === "public" && !await editorialPublicConsentLive(ctx, live.media)) continue
      const config = parseEditorialConfigInput({ description: live.media.description, sections: live.media.sections, visibility: live.media.visibility,
        ...(live.media.visibility === "public" ? { publicConsentTextVersion: live.media.publicConsentTextVersion } : {}) })
      if (!config) continue
      page.push({ handle: live.page.handle, name: live.page.name, description: config.description, sections: config.sections })
    }
    return { page, isDone: window.isDone, continueCursor: window.isDone ? "" : JSON.stringify({ version: 1, scope, cursor: window.continueCursor }), filteredWindow: page.length !== window.page.length || !window.isDone && !page.length }
  },
})
