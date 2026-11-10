/** MP09 : normalisation, révisions et curseurs ; aucune fonction Convex publique. */
import { parseProfessionalProfileInput, type ProfessionalProfileInput } from "@antsia/social-domain/professionals"

import { fail } from "../../lib/errors"
import type { ProfessionalProfileWriteInput } from "./validators"

export const PROFESSIONAL_ROWS_MAX = 128
export const PROFESSIONAL_BYTES_MAX = 256 * 1024
export function expectedProfessionalRevision(value: number, current: number): void {
  if (!Number.isSafeInteger(value) || value < 0) return fail("invalidArgument", { field: "expectedRevision" })
  if (value !== current) return fail("conflict", { field: "expectedRevision" })
}
export function professionalWriteInput(input: ProfessionalProfileWriteInput): ProfessionalProfileInput & { activityPageIds: ProfessionalProfileWriteInput["activityPageIds"] } {
  const parsed = parseProfessionalProfileInput(input)
  if (!parsed) return fail("invalidArgument", { field: "input" })
  return { ...parsed, activityPageIds: [...input.activityPageIds] }
}
export function professionalContent(input: Pick<ProfessionalProfileInput, "title" | "bio" | "skills" | "languageCodes" | "zone" | "availability" | "collaborationTypes" | "portfolio" | "visibility" | "publicFields">) {
  return {
    title: input.title, bio: input.bio, skills: [...input.skills], languageCodes: [...input.languageCodes], zone: input.zone,
    availability: input.availability, collaborationTypes: [...input.collaborationTypes], portfolio: input.portfolio.map(item => ({ title: item.title, description: item.description })),
    visibility: input.visibility, publicFields: [...input.publicFields],
  }
}
export function professionalModerationText(input: Pick<ProfessionalProfileInput, "title" | "bio" | "skills" | "languageCodes" | "zone" | "portfolio">): string {
  return [input.title, input.bio, ...input.skills, ...input.languageCodes, input.zone, ...input.portfolio.flatMap(item => [item.title, item.description])].join("\n")
}
export async function professionalCursorScope(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("")
}
export function professionalPageSize(numItems: number): number {
  if (!Number.isSafeInteger(numItems) || numItems < 1) return fail("invalidArgument", { field: "paginationOpts" })
  return Math.min(numItems, 12)
}
export function readProfessionalCursor(value: string | null, scope: string): string | null {
  if (value === null) return null
  if (!value || value.length > 8192) return fail("invalidArgument", { field: "cursor" })
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("invalidArgument", { field: "cursor" })
    const row = parsed as Record<string, unknown>
    if (Object.keys(row).length !== 3 || row.version !== 1 || row.scope !== scope || typeof row.cursor !== "string" || !row.cursor) return fail("invalidArgument", { field: "cursor" })
    return row.cursor
  } catch { return fail("invalidArgument", { field: "cursor" }) }
}
export function writeProfessionalCursor(cursor: string, scope: string, isDone: boolean): string {
  return isDone ? "" : JSON.stringify({ version: 1, scope, cursor })
}
