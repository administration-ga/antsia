import { describe, expect, it } from "vitest"
import { nativeAssociationPages, nativeLinkedPageCursors, nativePageFollowResultMatches, nativePageHandle, nativePageSearch, nativePostsForPage } from "./native-pages"
import { nativeCursorKey } from "./native-pagination"

describe("native page references", () => {
  it("normalizes a handle without admitting a URL, path, token or arbitrary page title", () => {
    expect(nativePageHandle("  JEUNES-LAMBARENE  ")).toBe("jeunes-lambarene")
    for (const raw of ["https://example.test/pages/association", "pages/association", "association?token=proof", "Jeunes de Lambaréné", "ab", "a".repeat(61)]) expect(nativePageHandle(raw)).toBeNull()
  })
  it("keeps accents in server search, normalizes Unicode and uses the directory for a one-character term", () => {
    expect(nativePageSearch("  e\u0301ducation   jeunesse  ")).toBe("éducation jeunesse")
    expect(nativePageSearch(" a ")).toBe("")
    expect(nativePageSearch(" ")).toBe("")
    expect(nativePageSearch("a".repeat(130))).toHaveLength(120)
  })
  it("highlights only unique server-provided associations, preserving their order", () => {
    const first = { pageId: "one", handle: "association-one", ownerKind: "association" }
    expect(nativeAssociationPages([
      { pageId: "shop", handle: "shop-one", ownerKind: "company" }, first,
      { ...first }, { ...first, pageId: "duplicate-handle" },
      { pageId: "unsafe", handle: "https://example.test", ownerKind: "association" },
      { pageId: "two", handle: "association-two", ownerKind: "association" },
    ])).toEqual([first, { pageId: "two", handle: "association-two", ownerKind: "association" }])
  })
})

describe("native page cursor ancestry", () => {
  const first = { at: 10, id: "one" }, second = { at: 5, id: "two" }
  const pages = new Map([["first", { next: first }], [nativeCursorKey(first), { next: second }]])
  const read = (cursor: typeof first | null) => pages.get(nativeCursorKey(cursor))
  it("keeps a continuous opaque chain, including a filtered window with no rows", () => {
    expect(nativeLinkedPageCursors([null, first, second], read, page => page.next)).toEqual([null, first, second])
  })
  it("drops old descendants when a live parent changes its cursor or is no longer loaded", () => {
    expect(nativeLinkedPageCursors([null, second], read, page => page.next)).toEqual([null])
    expect(nativeLinkedPageCursors([null, first], () => undefined, () => first)).toEqual([null])
    expect(nativeLinkedPageCursors([null, first], () => ({ next: null }), page => page.next)).toEqual([null])
  })
  it("refuses foreign roots, repeats and requests beyond the subscription bound", () => {
    expect(nativeLinkedPageCursors([first], read, page => page.next)).toEqual([])
    expect(nativeLinkedPageCursors([null, first, first], () => ({ next: first }), page => page.next)).toEqual([null, first])
    expect(nativeLinkedPageCursors([null, first, second], read, page => page.next, 2)).toEqual([null, first])
  })
})

describe("native page identity correlation", () => {
  it("does not show another page's posts even if the handle or page ID alone matches", () => {
    const target = { pageId: "one", handle: "association-one" }
    const accepted = { id: "accepted", page: target }
    expect(nativePostsForPage([
      accepted, { id: "person", page: null },
      { id: "wrong-id", page: { ...target, pageId: "two" } },
      { id: "wrong-handle", page: { ...target, handle: "association-two" } },
    ], target)).toEqual([accepted])
  })
  it("accepts only the requested follow state and correlates a follow response to its page", () => {
    expect(nativePageFollowResultMatches({ pageId: "one", following: true }, { pageId: "one", following: true })).toBe(true)
    expect(nativePageFollowResultMatches({ pageId: "one", following: true }, { pageId: "two", following: true })).toBe(false)
    expect(nativePageFollowResultMatches({ pageId: "one", following: true }, { following: true })).toBe(false)
    expect(nativePageFollowResultMatches({ pageId: "one", following: false }, { following: false })).toBe(true)
    for (const result of [null, { status: true }, { following: true }, { following: "false" }]) expect(nativePageFollowResultMatches({ pageId: "one", following: false }, result)).toBe(false)
  })
})
