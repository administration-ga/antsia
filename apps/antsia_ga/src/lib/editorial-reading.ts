import type { EditorialReadingLabels } from "@/components/editorial/site-content"

export type EditorialReadingSearch = { section?: string; cursor: string | null }
export function editorialReadingSearch(params: Record<string, string | string[] | undefined>): EditorialReadingSearch | null {
  if (Object.keys(params).some(key => !["rubrique", "curseur", "ott"].includes(key))) return null
  const section = params.rubrique, cursor = params.curseur
  if (section !== undefined && (typeof section !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(section) || section.length > 60)) return null
  if (cursor !== undefined && (typeof cursor !== "string" || !cursor.length || cursor.length > 8192 || /[\u0000-\u001f\u007f]/u.test(cursor))) return null
  return { ...(section ? { section } : {}), cursor: cursor ?? null }
}
export function editorialReadingLabels(t: (key: string) => string): EditorialReadingLabels {
  return Object.fromEntries((["all", "read", "empty", "filtered", "next", "first", "corrected", "correction", "byline", "contents", "imagePending", "imageUnavailable", "credit", "back", "about", "publicNotice"] as const).map(key => [key, t(key)])) as EditorialReadingLabels
}
