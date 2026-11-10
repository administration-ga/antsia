/** Les curseurs restent des valeurs opaques du moteur ; aucune reconstruction par timestamp. */
export function nativeCursorKey(cursor: unknown): string { return cursor == null ? "first" : JSON.stringify(cursor) ?? "invalid" }
export function canAppendNativeCursor<C>(cursors: readonly (C | null)[], next: C | null | undefined, maxPages = 10): next is C {
  return next != null && cursors.length < maxPages && !cursors.some(cursor => nativeCursorKey(cursor) === nativeCursorKey(next))
}
export function mergeNativePages<T>(pages: readonly (readonly T[])[], id: (item: T) => string, maxItems = 200): T[] {
  if (!Number.isSafeInteger(maxItems) || maxItems <= 0) return []
  const seen = new Set<string>(), result: T[] = []
  for (const page of pages) for (const item of page) {
    const key = id(item)
    if (seen.has(key)) continue
    seen.add(key); result.push(item)
    if (result.length >= maxItems) return result
  }
  return result
}
