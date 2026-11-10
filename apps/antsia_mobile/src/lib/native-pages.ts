import { assertPageHandle } from "@antsia/social-domain/pages"
import { nativeCursorKey } from "./native-pagination"

export const NATIVE_PAGE_WINDOW_SIZE = 12
export const NATIVE_PAGE_WINDOWS_MAX = 8
export const NATIVE_PAGE_SEARCH_MAX = 120

/** A route reference is already a handle; never turn a URL or arbitrary title into one. */
export function nativePageHandle(raw: string): string | null {
  const handle = raw.trim().toLowerCase()
  try { return assertPageHandle(handle) === handle ? handle : null } catch { return null }
}

/** The server treats fewer than two characters as the unfiltered directory. */
export function nativePageSearch(raw: string): string {
  const query = raw.normalize("NFC").trim().replace(/\s+/gu, " ").slice(0, NATIVE_PAGE_SEARCH_MAX)
  return query.length >= 2 ? query : ""
}

/** Own pages remain server-provided; a demo persona never supplies an activity link. */
export function nativeAssociationPages<T extends { ownerKind: string; pageId: string; handle: string }>(pages: readonly T[]): T[] {
  const ids = new Set<string>(), handles = new Set<string>(), result: T[] = []
  for (const page of pages) {
    if (page.ownerKind !== "association" || nativePageHandle(page.handle) !== page.handle || ids.has(page.pageId) || handles.has(page.handle)) continue
    ids.add(page.pageId); handles.add(page.handle); result.push(page)
    if (result.length >= 50) break
  }
  return result
}

/** Live replacement of a predecessor invalidates its old descendants, including their subscriptions. */
export function nativeLinkedPageCursors<C, P>(
  requested: readonly (C | null)[],
  read: (cursor: C | null) => P | undefined,
  next: (page: P) => C | null | undefined,
  maximum = NATIVE_PAGE_WINDOWS_MAX,
): (C | null)[] {
  if (requested[0] !== null || !Number.isSafeInteger(maximum) || maximum < 1) return []
  const linked: (C | null)[] = [null]
  for (const cursor of requested.slice(1, maximum)) {
    const previous = read(linked[linked.length - 1] ?? null)
    const expected = previous === undefined ? undefined : next(previous)
    if (cursor === null || expected == null || nativeCursorKey(cursor) !== nativeCursorKey(expected)
      || linked.some(item => nativeCursorKey(item) === nativeCursorKey(cursor))) break
    linked.push(cursor)
  }
  return linked
}

/** A late/wrong page projection cannot appear under another page's identity. */
export function nativePostsForPage<T extends { page: { pageId: string; handle: string } | null }>(items: readonly T[], target: { pageId: string; handle: string }): T[] {
  return items.filter(item => item.page?.pageId === target.pageId && item.page.handle === target.handle)
}

/** follow returns pageId; unfollow intentionally does not. Subject correlation belongs to the captured runtime guard. */
export function nativePageFollowResultMatches(target: { pageId: string; following: boolean }, result: unknown): boolean {
  if (!result || typeof result !== "object" || !("following" in result) || result.following !== target.following) return false
  return !target.following || "pageId" in result && result.pageId === target.pageId
}
