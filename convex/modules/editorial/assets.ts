/** MP12 : dépôt neuf, crédit et droits explicites ; délivrance exclusivement par la garde des fichiers. */
import { EDITORIAL_ARTICLE_IMAGES_MAX, EDITORIAL_IMAGE_CONSENT_VERSION, EDITORIAL_PAGE_ASSETS_MAX, editorialImageDescription } from "@antsia/social-domain/editorialAssets"
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import type { Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { fail, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { guardUploadUrl } from "../../lib/uploadPolicy"
import { admitStoredUpload, assertFreshUpload } from "../files/admission"
import { assertServableStorage, resolveFileDelivery, withheldCodeOf, withheldCodeValidator } from "../files/storageGuard"
import { requireEditorialRole } from "./access"

export const editorialAssetDtoValidator = v.object({ assetId: v.id("editorialAssets"), url: v.union(v.string(), v.null()), withheld: v.union(withheldCodeValidator, v.null()), altText: v.string(), credit: v.string() })

export async function editorialAssetForReading(ctx: Pick<QueryCtx, "db" | "storage">, input: { networkId: Id<"networks">; pageId: Id<"pages">; assetId: Id<"editorialAssets"> }) {
  const asset = await ctx.db.get(input.assetId)
  if (!asset || asset.networkId !== input.networkId || asset.pageId !== input.pageId || asset.rightsConsentTextVersion !== EDITORIAL_IMAGE_CONSENT_VERSION) return null
  const delivery = await resolveFileDelivery(ctx, asset.storageId)
  return { assetId: asset._id, url: delivery.url, withheld: withheldCodeOf(delivery.scan), altText: asset.altText, credit: asset.credit }
}

/** La publication ne fait jamais passer un média en attente ou venant d'une autre rédaction. */
export async function assertEditorialAssetsForPublication(ctx: Pick<QueryCtx, "db">, input: { networkId: Id<"networks">; pageId: Id<"pages">; assetIds: readonly Id<"editorialAssets">[] }): Promise<void> {
  if (input.assetIds.length > EDITORIAL_ARTICLE_IMAGES_MAX) return fail("invalidArgument")
  for (const assetId of input.assetIds) {
    const asset = await ctx.db.get(assetId)
    if (!asset || asset.networkId !== input.networkId || asset.pageId !== input.pageId || asset.rightsConsentTextVersion !== EDITORIAL_IMAGE_CONSENT_VERSION) return notFound()
    await assertServableStorage(ctx, asset.storageId)
  }
}

async function requireAssetRoom(ctx: Pick<QueryCtx, "db">, pageId: Id<"pages">) {
  const assets = await ctx.db.query("editorialAssets").withIndex("by_page", q => q.eq("pageId", pageId)).take(EDITORIAL_PAGE_ASSETS_MAX + 1)
  if (assets.length >= EDITORIAL_PAGE_ASSETS_MAX) return fail("policyRefused")
}

export const uploadUrl = networkMutation({
  minStatus: "declaree", writeBucket: "editorial.asset.write",
  args: { pageId: v.id("pages") }, returns: v.string(),
  handler: async (ctx, args) => {
    await requireEditorialRole(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.pageId)
    await requireAssetRoom(ctx, args.pageId)
    return guardUploadUrl(ctx, "editorial_image")
  },
})

export const attach = networkMutation({
  minStatus: "declaree", writeBucket: "editorial.asset.write",
  args: { pageId: v.id("pages"), storageId: v.id("_storage"), mimeType: v.string(), altText: v.string(), credit: v.string(), rightsConsentTextVersion: v.string() },
  returns: v.object({ assetId: v.id("editorialAssets") }),
  handler: async (ctx, args) => {
    await requireEditorialRole(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.pageId)
    const altText = editorialImageDescription(args.altText, 300), credit = editorialImageDescription(args.credit, 200)
    if (!altText || !credit || args.rightsConsentTextVersion !== EDITORIAL_IMAGE_CONSENT_VERSION) return fail("invalidArgument")
    await requireAssetRoom(ctx, args.pageId)
    await assertFreshUpload(ctx, ctx.person._id, args.storageId)
    const stored = await admitStoredUpload(ctx, { storageId: args.storageId, usage: "editorial_image", mimeType: args.mimeType }, { source: "editorial", networkId: ctx.networkId, uploadedByPersonId: ctx.person._id })
    const now = Date.now()
    const assetId = await ctx.db.insert("editorialAssets", { networkId: ctx.networkId, pageId: args.pageId, uploadedByPersonId: ctx.person._id,
      storageId: args.storageId, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes, altText, credit, rightsConsentTextVersion: EDITORIAL_IMAGE_CONSENT_VERSION, rightsConsentedAt: now, createdAt: now })
    return { assetId }
  },
})

export const list = networkQuery({
  minStatus: "declaree", args: { pageId: v.id("pages"), paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(editorialAssetDtoValidator), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    await requireEditorialRole(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.pageId)
    if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 20) return fail("invalidArgument")
    const result = await ctx.db.query("editorialAssets").withIndex("by_page", q => q.eq("pageId", args.pageId)).order("desc").paginate({ ...args.paginationOpts, maximumRowsRead: 20, maximumBytesRead: 64 * 1024 })
    const page = []
    for (const asset of result.page) {
      const dto = await editorialAssetForReading(ctx, { networkId: ctx.networkId, pageId: args.pageId, assetId: asset._id })
      if (dto) page.push(dto)
    }
    return { page, isDone: result.isDone, continueCursor: result.continueCursor }
  },
})

/** Les illustrations choisies restent relues lorsque la bibliothèque change de page. */
export const resolve = networkQuery({
  minStatus: "declaree", args: { pageId: v.id("pages"), assetIds: v.array(v.id("editorialAssets")) },
  returns: v.array(editorialAssetDtoValidator),
  handler: async (ctx, args) => {
    await requireEditorialRole(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.pageId)
    if (args.assetIds.length > EDITORIAL_ARTICLE_IMAGES_MAX || new Set(args.assetIds).size !== args.assetIds.length) return fail("invalidArgument")
    const assets = []
    for (const assetId of args.assetIds) {
      const value = await editorialAssetForReading(ctx, { networkId: ctx.networkId, pageId: args.pageId, assetId })
      if (!value) return notFound()
      assets.push(value)
    }
    return assets
  },
})
