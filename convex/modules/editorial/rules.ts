/** MP12 : normalisation, bornes et empreinte canonique des versions de rédaction. */
import { editorialContent, editorialModerationText, EDITORIAL_PAGE_MAX, EDITORIAL_TEXT_BYTES_MAX, parseEditorialDraftInput } from "@antsia/social-domain/editorial"
import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { fail } from "../../lib/errors"
import type { EditorialAuthority, EditorialDraftWriteInput } from "./validators"

export function editorialExpectedRevision(expected: number, actual: number): void { if (!Number.isSafeInteger(expected) || expected < 0) return fail("invalidArgument"); if (expected !== actual) return fail("conflict") }
export function editorialPageSize(value: number): number { if (!Number.isSafeInteger(value) || value < 1 || value > EDITORIAL_PAGE_MAX) return fail("invalidArgument"); return value }
export function editorialWriteInput(raw: EditorialDraftWriteInput): EditorialDraftWriteInput {
  const parsed = parseEditorialDraftInput(raw)
  if (!parsed) return fail("invalidArgument", { field: "input" })
  const blocks = parsed.blocks.map((block, index) => {
    if (block.type !== "image") return block
    const original = raw.blocks[index]
    if (original?.type !== "image") return fail("invalidArgument")
    return { type: "image" as const, assetId: original.assetId }
  })
  const byline = parsed.byline.kind === "media" ? { kind: "media" as const } : raw.byline.kind === "contributor" ? { kind: "contributor" as const, grantId: raw.byline.grantId } : fail("invalidArgument")
  return { ...parsed, blocks, byline }
}
export async function editorialDigest(value: unknown): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)))
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("")
}
/** Texte intégral de la version et des attestations immuables des images ; aucune URL ou clé stockage. */
export async function editorialVersionModerationText(ctx: Pick<QueryCtx, "db">, input: Pick<Doc<"editorialVersions">, "networkId" | "pageId" | "title" | "chapeau" | "correctionNotice" | "blocks">): Promise<string> {
  const parts = [editorialModerationText(input)]
  for (const block of input.blocks) if (block.type === "image") {
    const asset = await ctx.db.get(block.assetId)
    if (!asset || asset.networkId !== input.networkId || asset.pageId !== input.pageId) return fail("notFound")
    parts.push(asset.altText, asset.credit)
  }
  const text = parts.join("\n")
  if (new TextEncoder().encode(text).byteLength > EDITORIAL_TEXT_BYTES_MAX) return fail("invalidArgument", { field: "blocks" })
  return text
}
export function editorialCanonicalContent(input: EditorialDraftWriteInput) { return editorialContent(input) }
/** La configuration possède sa propre cible de modération : aucun texte public ne se cache derrière celui de la page. */
export function editorialMediaModerationText(input: { description: string; sections: readonly { key: string; label: string }[] }): string { return [input.description, ...input.sections.flatMap(section => [section.key, section.label])].join("\n") }
type EditorialEventAction = Doc<"editorialEvents">["action"]
export async function editorialEvent(ctx: MutationCtx, input: { networkId: Id<"networks">; pageId: Id<"pages">; actorPersonId: Id<"persons">; action: EditorialEventAction; revision: number; articleId?: Id<"editorialArticles">; versionId?: Id<"editorialVersions">; grantId?: Id<"editorialGrants">; authority?: EditorialAuthority }): Promise<void> {
  await ctx.db.insert("editorialEvents", { ...input, createdAt: Date.now() })
}
export const editorialApprovalReset = { approvedByPersonId: undefined, approvedAuthority: undefined, approvedVersionId: undefined, approvedDigest: undefined, approvedAt: undefined, schedule: undefined }
