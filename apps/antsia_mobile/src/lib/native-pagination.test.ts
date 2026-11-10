import { describe, expect, it } from "vitest"
import { canAppendNativeCursor, mergeNativePages, nativeCursorKey } from "./native-pagination"

// P17b : scénarios purs écrits, non exécutés.
describe("pagination native : conserver le contrat du moteur", () => {
  it("conserve les composantes de génération du fil et les deux côtés de la boîte", () => {
    const feed = { publishedAt: 42, postId: "post", strategy: "materialized", generation: 3, windowStart: 7, postCreationTime: 9 }
    expect(JSON.parse(nativeCursorKey(feed))).toEqual(feed)
    expect(nativeCursorKey({ ...feed, generation: 4 })).not.toBe(nativeCursorKey(feed))
    const threads = { low: { at: null, ct: 5 }, high: { at: 10, ct: 2 } }
    expect(JSON.parse(nativeCursorKey(threads))).toEqual(threads)
    expect(nativeCursorKey({ ...threads, high: null })).not.toBe(nativeCursorKey(threads))
  })
  it("une page filtrée vide avec curseur reste parcourable ; seul le contrat de fin conclut", () => {
    const next = { low: { at: 5, ct: 2 }, high: null }
    expect(mergeNativePages([[]], (item: { id: string }) => item.id)).toEqual([])
    expect(canAppendNativeCursor([null], next)).toBe(true)
    expect(canAppendNativeCursor([null], null)).toBe(false)
    expect(canAppendNativeCursor([null], undefined)).toBe(false)
  })
  it("refuse les curseurs déjà montés et borne le nombre de souscriptions", () => {
    const next = { publishedAt: 1, postId: "last" }
    expect(canAppendNativeCursor([null, next], { ...next })).toBe(false)
    expect(canAppendNativeCursor([null], next, 1)).toBe(false)
    expect(canAppendNativeCursor([null], next, 2)).toBe(true)
  })
  it("dédoublonne par identifiant et donne priorité à la page vive la plus récente", () => {
    const rows = mergeNativePages([[{ id: "one", value: "current" }], [{ id: "one", value: "old" }, { id: "two", value: "second" }]], row => row.id)
    expect(rows).toEqual([{ id: "one", value: "current" }, { id: "two", value: "second" }])
    // Un remplacement de page ne conserve pas son ancienne projection retirée.
    expect(mergeNativePages([[], [{ id: "two" }]], row => row.id)).toEqual([{ id: "two" }])
  })
  it("borne les lignes retenues en mémoire, sans inventer un total global", () => {
    const rows = Array.from({ length: 205 }, (_, index) => ({ id: String(index) }))
    expect(mergeNativePages([rows], row => row.id)).toHaveLength(200)
    expect(mergeNativePages([rows], row => row.id, 1)).toEqual([{ id: "0" }])
    expect(mergeNativePages([rows], row => row.id, 0)).toEqual([])
  })
})
