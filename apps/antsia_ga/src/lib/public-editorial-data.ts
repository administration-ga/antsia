import { api } from "@convex/_generated/api"
import type { EditorialPublishedArticle, EditorialPublishedMedia } from "@convex/modules/editorial/validators"
import { editorialHttpsLink } from "@antsia/social-domain/editorial"
import { cache } from "react"
import { z } from "zod"
import { projected } from "./public-data"

const sectionKey = z.string().max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
const section = z.object({ key: sectionKey, label: z.string().min(1).max(60) }).strict()
const key = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/u)
const handle = z.string().min(1).max(80)
const timestamp = z.number().int().nonnegative()
const card = z.object({ articleKey: key, title: z.string().min(1).max(180), chapeau: z.string().max(500), sectionKey: sectionKey.nullable(), sectionLabel: z.string().max(60).nullable(), publishedAt: timestamp, versionNumber: z.number().int().positive(), correctionNotice: z.string().max(1000).nullable() }).strict()
export const editorialPublishedMediaSchema: z.ZodType<EditorialPublishedMedia> = z.object({
  handle, name: z.string().min(1).max(200), description: z.string().max(1600), sections: z.array(section).max(12),
  articles: z.object({ page: z.array(card).max(12), isDone: z.boolean(), continueCursor: z.string().max(8192), filteredWindow: z.boolean() }).strict(),
}).strict()
const block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: z.string().min(1).max(4000) }).strict(),
  z.object({ type: z.literal("heading"), level: z.union([z.literal(2), z.literal(3)]), text: z.string().min(1).max(180) }).strict(),
  z.object({ type: z.literal("list"), ordered: z.boolean(), items: z.array(z.string().min(1).max(1000)).min(1).max(12) }).strict(),
  z.object({ type: z.literal("link"), label: z.string().min(1).max(200), href: z.string().max(2048).refine(value => editorialHttpsLink(value) === value) }).strict(),
  z.object({ type: z.literal("image"), url: z.string().url().nullable(), withheld: z.enum(["fileScanPending", "fileScanUnavailable", "fileQuarantined"]).nullable(), altText: z.string().min(1).max(300), credit: z.string().min(1).max(200) }).strict(),
])
export const editorialPublishedArticleSchema: z.ZodType<EditorialPublishedArticle> = z.object({
  articleKey: key, mediaHandle: handle, mediaName: z.string().min(1).max(200), title: z.string().min(1).max(180), chapeau: z.string().max(500),
  sectionKey: sectionKey.nullable(), sectionLabel: z.string().max(60).nullable(), byline: z.object({ label: z.string().min(1).max(200), handle: handle.nullable() }).strict(),
  correctionNotice: z.string().max(1000).nullable(), blocks: z.array(block).max(40), versionNumber: z.number().int().positive(), publishedAt: timestamp, updatedAt: timestamp,
}).strict().refine(value => value.blocks.every(item => item.type !== "image" || item.withheld === null || item.url === null)).refine(value => value.blocks.filter(item => item.type === "image").length <= 4 && new TextEncoder().encode(JSON.stringify(value.blocks)).byteLength <= 40 * 1024)

/** Reprise du transport SSR commun : aucun repli anonyme après refus de session. */
export const loadPublicEditorialMedia = cache((handle: string, section?: string, cursor?: string | null, handoff = false) => projected(api.modules.public.editorial.media, { handle, paginationOpts: { cursor: cursor ?? null, numItems: 12 }, ...(section ? { section } : {}) }, editorialPublishedMediaSchema.nullable(), handoff))
export const loadPublicEditorialArticle = cache((handle: string, articleKey: string, handoff = false) => projected(api.modules.public.editorial.article, { handle, articleKey }, editorialPublishedArticleSchema.nullable(), handoff))
