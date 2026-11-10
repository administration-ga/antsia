import { engineErrorCode } from "@antsia/social-contracts/errors"
import type { Id } from "@antsia/api/engine"
import {
  editorialHttpsLink, editorialModerationText, editorialSectionKey, editorialText, parseEditorialConfigInput, parseEditorialDraftInput,
  EDITORIAL_BLOCKS_MAX, EDITORIAL_IMAGES_MAX, EDITORIAL_PUBLIC_CONSENT_VERSION, EDITORIAL_ROLES, EDITORIAL_SCHEDULE_MAX_MS, EDITORIAL_TEXT_BYTES_MAX,
  type EditorialBlock, type EditorialConfigInput, type EditorialDraftInput,
} from "@antsia/social-domain/editorial"
import { editorialImageDescription } from "@antsia/social-domain/editorialAssets"
import { z } from "zod"

type Translate = (key: string) => string
function editorialFormText(t: Translate, max: number, multiline = false, required = false) {
  return z.string().max(max, t("validation.length")).refine(value => {
    const text = editorialText(value, max, multiline)
    return text !== null && (!required || text.length > 0)
  }, t(required ? "validation.required" : "validation.text"))
}
export function editorialDraftSchema(t: Translate) {
  const block = z.discriminatedUnion("type", [
    z.object({ type: z.literal("paragraph"), text: editorialFormText(t, 4000, true, true) }).strict(),
    z.object({ type: z.literal("heading"), level: z.union([z.literal(2), z.literal(3)]), text: editorialFormText(t, 180, false, true) }).strict(),
    z.object({ type: z.literal("list"), ordered: z.boolean(), items: z.array(editorialFormText(t, 1000, true, true)).min(1, t("validation.required")).max(12, t("validation.limit")) }).strict(),
    z.object({ type: z.literal("link"), label: editorialFormText(t, 200, false, true), href: z.string().refine(value => editorialHttpsLink(value) !== null, t("validation.link")) }).strict(),
    z.object({ type: z.literal("image"), assetId: z.string().min(1, t("validation.required")).max(128).regex(/^[A-Za-z0-9_-]+$/u, t("validation.text")) }).strict(),
  ])
  return z.object({ title: editorialFormText(t, 180, false, true), chapeau: editorialFormText(t, 500, true),
    sectionKey: z.string().refine(value => !value || editorialSectionKey(value) !== null, t("validation.sectionKey")),
    byline: z.string().min(1, t("validation.byline")).max(128).regex(/^[A-Za-z0-9_-]+$/u, t("validation.byline")),
    correctionNotice: editorialFormText(t, 1000, true), blocks: z.array(block).max(EDITORIAL_BLOCKS_MAX, t("validation.limit")),
  }).strict().superRefine((value, ctx) => {
    const images = value.blocks.filter(item => item.type === "image")
    if (images.length > EDITORIAL_IMAGES_MAX) ctx.addIssue({ code: "custom", path: ["blocks"], message: t("images.limit") })
    if (new Set(images.map(item => item.assetId)).size !== images.length) ctx.addIssue({ code: "custom", path: ["blocks"], message: t("validation.duplicates") })
    if (new TextEncoder().encode(editorialModerationText(value)).byteLength > EDITORIAL_TEXT_BYTES_MAX) ctx.addIssue({ code: "custom", path: ["blocks"], message: t("validation.bytes") })
  })
}
export type EditorialDraftValues = z.infer<ReturnType<typeof editorialDraftSchema>>
export function editorialDraftValues(input?: EditorialDraftInput | null): EditorialDraftValues {
  return { title: input?.title ?? "", chapeau: input?.chapeau ?? "", sectionKey: input?.sectionKey ?? "", byline: input?.byline.kind === "contributor" ? input.byline.grantId : "media",
    correctionNotice: input?.correctionNotice ?? "", blocks: input?.blocks.map(block => block.type === "list" ? { ...block, items: [...block.items] } : { ...block }) ?? [] }
}
export function editorialDraftInput(values: EditorialDraftValues): EditorialDraftInput | null {
  return parseEditorialDraftInput({ title: values.title, chapeau: values.chapeau, sectionKey: values.sectionKey || null,
    byline: values.byline === "media" ? { kind: "media" } : { kind: "contributor", grantId: values.byline }, correctionNotice: values.correctionNotice.trim() || null, blocks: values.blocks })
}
/** Le parseur fermé précède toujours l'adaptation des références aux types du moteur. */
export function editorialWriteInput(input: EditorialDraftInput) {
  return { ...input, byline: input.byline.kind === "media" ? { kind: "media" as const } : { kind: "contributor" as const, grantId: input.byline.grantId as Id<"editorialGrants"> },
    blocks: input.blocks.map(block => block.type === "image" ? { ...block, assetId: block.assetId as Id<"editorialAssets"> } : block) }
}
export function newEditorialBlock(type: "paragraph" | "heading" | "list" | "link"): EditorialBlock {
  switch (type) {
    case "paragraph": return { type, text: "" }
    case "heading": return { type, level: 2, text: "" }
    case "list": return { type, ordered: false, items: [""] }
    case "link": return { type, label: "", href: "" }
  }
}

export function editorialConfigSchema(t: Translate) {
  return z.object({ description: editorialFormText(t, 1600, true), sections: z.array(z.object({
    key: z.string().refine(value => editorialSectionKey(value) !== null, t("validation.sectionKey")), label: editorialFormText(t, 60, false, true),
  }).strict()).max(12, t("validation.limit")).refine(values => new Set(values.map(item => item.key)).size === values.length && new Set(values.map(item => item.label.normalize("NFC").trim().toLocaleLowerCase("fr"))).size === values.length, t("validation.duplicates")),
    visibility: z.enum(["network", "public"]), publicConsent: z.boolean(),
  }).strict().refine(value => value.visibility !== "public" || value.publicConsent, { path: ["publicConsent"], message: t("validation.publicConsent") })
}
export type EditorialConfigValues = z.infer<ReturnType<typeof editorialConfigSchema>>
export function editorialConfigValues(input?: Pick<EditorialConfigInput, "description" | "sections" | "visibility"> | null): EditorialConfigValues {
  return { description: input?.description ?? "", sections: input?.sections.map(section => ({ ...section })) ?? [], visibility: input?.visibility ?? "network", publicConsent: false }
}
export function editorialConfigInput(value: EditorialConfigValues): EditorialConfigInput | null {
  if (value.visibility === "public" && !value.publicConsent) return null
  return parseEditorialConfigInput({ description: value.description, sections: value.sections, visibility: value.visibility,
    ...(value.visibility === "public" ? { publicConsentTextVersion: EDITORIAL_PUBLIC_CONSENT_VERSION } : {}) })
}
export function editorialImageSchema(t: Translate) {
  return z.object({ altText: z.string().refine(value => editorialImageDescription(value, 300) !== null, t("validation.required")),
    credit: z.string().refine(value => editorialImageDescription(value, 200) !== null, t("validation.required")),
    rightsConsent: z.boolean().refine(value => value, t("validation.imageConsent")),
  }).strict()
}
export type EditorialImageValues = z.infer<ReturnType<typeof editorialImageSchema>>
export function editorialInviteSchema(t: Translate) {
  return z.object({ handle: z.string().trim().min(3, t("validation.required")).max(30).regex(/^[a-z0-9][a-z0-9._]*[a-z0-9]$/u, t("validation.text")), role: z.enum(EDITORIAL_ROLES) }).strict()
}
export function editorialReasonSchema(t: Translate) { return z.object({ text: editorialFormText(t, 1000, true, true) }).strict() }

/** Le fuseau de l'appareil et l'instant absolu sont présentés à l'utilisateur avant sa confirmation. */
export function editorialLocalPublicationInstant(value: string, now: number): { publishAt: number; utc: string; timeZone: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u.exec(value)
  if (!match) return null
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number]
  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null
  const date = new Date(year, month - 1, day, hour, minute)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute) return null
  const publishAt = date.getTime()
  if (!Number.isFinite(now) || publishAt <= now || publishAt > now + EDITORIAL_SCHEDULE_MAX_MS) return null
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (!timeZone) return null
  return { publishAt, utc: date.toISOString(), timeZone }
}
export function editorialErrorKey(error: unknown): string {
  switch (engineErrorCode(error)) {
    case "conflict": return "errors.conflict"
    case "rateLimited": return "errors.rateLimited"
    case "consentRequired": return "errors.consent"
    default: return "errors.unavailable"
  }
}
