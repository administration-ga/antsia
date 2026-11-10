/** MP12 : rédaction native, versions immuables et actes de publication distincts. */
export const EDITORIAL_ROLES = ["author", "editor", "publisher", "media_admin"] as const
export const EDITORIAL_GRANT_STATES = ["invited", "accepted", "declined", "revoked"] as const
export const EDITORIAL_WORKING_STATES = ["draft", "in_review", "changes_requested", "approved", "scheduled"] as const
export const EDITORIAL_PUBLICATION_STATES = ["unpublished", "published", "withdrawn"] as const
export const EDITORIAL_PUBLIC_CONSENT_VERSION = "2026-10-21-mp12-editorial-public-v1"
export const EDITORIAL_BYLINE_CONSENT_VERSION = "2026-10-21-mp12-editorial-byline-v1"
export const EDITORIAL_BLOCKS_MAX = 40
export const EDITORIAL_TEXT_BYTES_MAX = 32768
export const EDITORIAL_IMAGES_MAX = 4
export const EDITORIAL_PAGE_MAX = 12
export const EDITORIAL_GRANTS_MAX = 48
export const EDITORIAL_SCHEDULE_MAX_MS = 90 * 24 * 60 * 60 * 1000
export type EditorialRole = typeof EDITORIAL_ROLES[number]
export type EditorialWorkingState = typeof EDITORIAL_WORKING_STATES[number]
export type EditorialPublicationState = typeof EDITORIAL_PUBLICATION_STATES[number]
export type EditorialSection = { key: string; label: string }
export type EditorialConfigInput = { description: string; sections: EditorialSection[]; visibility: "network" | "public"; publicConsentTextVersion?: typeof EDITORIAL_PUBLIC_CONSENT_VERSION }
export type EditorialBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "link"; label: string; href: string }
  | { type: "image"; assetId: string }
export type EditorialDraftInput = {
  title: string; chapeau: string; sectionKey: string | null
  byline: { kind: "media" } | { kind: "contributor"; grantId: string }
  correctionNotice: string | null; blocks: EditorialBlock[]
}

function record(raw: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const prototype: unknown = Object.getPrototypeOf(raw)
  if (prototype !== Object.prototype && prototype !== null) return null
  for (const key of Reflect.ownKeys(raw)) {
    if (typeof key !== "string" || !required.includes(key) && !optional.includes(key)) return null
    const descriptor = Object.getOwnPropertyDescriptor(raw, key)
    if (!descriptor || descriptor.get !== undefined || descriptor.set !== undefined) return null
  }
  return required.every(key => Object.prototype.hasOwnProperty.call(raw, key)) ? raw as Record<string, unknown> : null
}
function array(raw: unknown, max: number): unknown[] | null {
  if (!Array.isArray(raw) || raw.length > max || Object.getPrototypeOf(raw) !== Array.prototype) return null
  if (Reflect.ownKeys(raw).some(key => key !== "length" && (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= raw.length))) return null
  for (let i = 0; i < raw.length; i += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, String(i))
    if (!descriptor || descriptor.get !== undefined || descriptor.set !== undefined) return null
  }
  return raw
}
export function editorialText(raw: unknown, max: number, multiline = false): string | null {
  if (typeof raw !== "string" || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069\uD800-\uDFFF<>]/u.test(raw) || !multiline && /[\r\n\t]/u.test(raw)) return null
  const normalized = raw.normalize("NFC").replace(/\r\n?/gu, "\n").trim()
  const value = multiline ? normalized : normalized.replace(/\s+/gu, " ")
  return value.length <= max ? value : null
}
function id(raw: unknown): string | null { return typeof raw === "string" && raw.length > 0 && raw.length <= 128 && /^[A-Za-z0-9_-]+$/u.test(raw) ? raw : null }
export function editorialSectionKey(raw: unknown): string | null { return typeof raw === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(raw) && raw.length <= 60 ? raw : null }
export function editorialHttpsLink(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 2048 || raw !== raw.trim() || /[\s\p{Cc}\p{Cf}\\<>]/u.test(raw)) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname || url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local") || /^[\d.]+$/u.test(url.hostname) || url.hostname.includes(":")) return null
    return url.href
  } catch { return null }
}
export function parseEditorialConfigInput(raw: unknown): EditorialConfigInput | null {
  const row = record(raw, ["description", "sections", "visibility"], ["publicConsentTextVersion"])
  if (!row) return null
  const description = editorialText(row.description, 1600, true), entries = array(row.sections, 12)
  if (description === null || !entries || row.visibility !== "network" && row.visibility !== "public") return null
  if (row.visibility === "public" ? row.publicConsentTextVersion !== EDITORIAL_PUBLIC_CONSENT_VERSION : row.publicConsentTextVersion !== undefined) return null
  const sections: EditorialSection[] = []
  for (const entry of entries) {
    const item = record(entry, ["key", "label"])
    const key = item && editorialSectionKey(item.key), label = item && editorialText(item.label, 60)
    if (!key || !label || sections.some(section => section.key === key || section.label.toLocaleLowerCase("fr") === label.toLocaleLowerCase("fr"))) return null
    sections.push({ key, label })
  }
  return { description, sections, visibility: row.visibility, ...(row.visibility === "public" ? { publicConsentTextVersion: EDITORIAL_PUBLIC_CONSENT_VERSION } : {}) }
}
export function parseEditorialDraftInput(raw: unknown): EditorialDraftInput | null {
  const row = record(raw, ["title", "chapeau", "sectionKey", "byline", "correctionNotice", "blocks"])
  if (!row) return null
  const title = editorialText(row.title, 180), chapeau = editorialText(row.chapeau, 500, true)
  const correctionNotice = row.correctionNotice === null ? null : editorialText(row.correctionNotice, 1000, true)
  const sectionKey = row.sectionKey === null ? null : editorialSectionKey(row.sectionKey)
  const entries = array(row.blocks, EDITORIAL_BLOCKS_MAX)
  if (!title || chapeau === null || row.correctionNotice !== null && !correctionNotice || row.sectionKey !== null && !sectionKey || !entries) return null
  const bylineRow = record(row.byline, ["kind"], ["grantId"])
  if (!bylineRow) return null
  let byline: EditorialDraftInput["byline"]
  if (bylineRow.kind === "media" && record(row.byline, ["kind"])) byline = { kind: "media" }
  else if (bylineRow.kind === "contributor" && record(row.byline, ["kind", "grantId"]) && id(bylineRow.grantId)) byline = { kind: "contributor", grantId: id(bylineRow.grantId)! }
  else return null
  const blocks: EditorialBlock[] = []
  let images = 0
  for (const entry of entries) {
    const item = record(entry, ["type"], ["text", "level", "ordered", "items", "label", "href", "assetId"])
    if (!item) return null
    if (item.type === "paragraph" && record(entry, ["type", "text"])) {
      const text = editorialText(item.text, 4000, true); if (!text) return null
      blocks.push({ type: "paragraph", text })
    } else if (item.type === "heading" && record(entry, ["type", "level", "text"]) && (item.level === 2 || item.level === 3)) {
      const text = editorialText(item.text, 180); if (!text) return null
      blocks.push({ type: "heading", level: item.level, text })
    } else if (item.type === "list" && record(entry, ["type", "ordered", "items"]) && typeof item.ordered === "boolean") {
      const items = array(item.items, 12)?.map(value => editorialText(value, 1000, true))
      if (!items?.length || !items.every((value): value is string => !!value)) return null
      blocks.push({ type: "list", ordered: item.ordered, items })
    } else if (item.type === "link" && record(entry, ["type", "label", "href"])) {
      const label = editorialText(item.label, 200), href = editorialHttpsLink(item.href); if (!label || !href) return null
      blocks.push({ type: "link", label, href })
    } else if (item.type === "image" && record(entry, ["type", "assetId"])) {
      const assetId = id(item.assetId); if (!assetId || ++images > EDITORIAL_IMAGES_MAX || blocks.some(block => block.type === "image" && block.assetId === assetId)) return null
      blocks.push({ type: "image", assetId })
    } else return null
  }
  const result = { title, chapeau, sectionKey, byline, correctionNotice, blocks }
  return new TextEncoder().encode(editorialModerationText(result)).byteLength <= EDITORIAL_TEXT_BYTES_MAX ? result : null
}
export function editorialModerationText(input: Pick<EditorialDraftInput, "title" | "chapeau" | "correctionNotice" | "blocks">): string {
  return [input.title, input.chapeau, input.correctionNotice ?? "", ...input.blocks.flatMap(block => block.type === "paragraph" || block.type === "heading" ? [block.text] : block.type === "list" ? block.items : block.type === "link" ? [block.label, block.href] : [])].join("\n")
}
/** Projection canonique : l'ordre des clés de stockage n'affecte pas l'idempotence ou l'empreinte. */
export function editorialContent(input: EditorialDraftInput): EditorialDraftInput {
  return { title: input.title, chapeau: input.chapeau, sectionKey: input.sectionKey,
    byline: input.byline.kind === "media" ? { kind: "media" } : { kind: "contributor", grantId: input.byline.grantId },
    correctionNotice: input.correctionNotice, blocks: input.blocks.map(block => block.type === "paragraph" ? { type: block.type, text: block.text } : block.type === "heading" ? { type: block.type, level: block.level, text: block.text } : block.type === "list" ? { type: block.type, ordered: block.ordered, items: [...block.items] } : block.type === "link" ? { type: block.type, label: block.label, href: block.href } : { type: block.type, assetId: block.assetId }) }
}
