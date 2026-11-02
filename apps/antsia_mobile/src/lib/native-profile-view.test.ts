import { describe, expect, it } from "vitest"
import { canAppendNativeCursor, nativeCursorKey } from "./native-pagination"
import { nativeLinkedPageCursors } from "./native-pages"
import { NATIVE_PROFILE_ENTRIES, PROFILE_MAX_PAGES, nativeBookmarkIdentity, nativePostsForProfile, nativeProfileText, nativePublishedProfileHandle } from "./native-profile-view"

describe("native profile views", () => {
  it("only admits a published-handle reference and never constructs one from a name or URL", () => {
    expect(nativePublishedProfileHandle("  alice.demo ")).toBe("alice.demo")
    for (const handle of [undefined, "", "@alice", "https://example.test/@alice", "Jean Rémy"]) expect(nativePublishedProfileHandle(handle)).toBeNull()
  })
  it("never renders a page or foreign author under a person's wall", () => {
    const own = { author: { personId: "alice" }, page: null }
    expect(nativePostsForProfile([own, { author: { personId: "bob" }, page: null }, { author: { personId: "alice" }, page: { name: "Page" } }, { author: { personId: null }, page: null }], "alice")).toEqual([own])
  })
  it("shows a bookmarked page's identity rather than the signatory, and stays neutral without a public author", () => {
    const author = { displayName: "Signataire", avatarUrl: "author" }
    expect(nativeBookmarkIdentity({ author, page: { name: "Mairie", logoUrl: "page" } }, "Personne du réseau")).toEqual({ name: "Mairie", imageUrl: "page", square: true, hasIdentity: true })
    expect(nativeBookmarkIdentity({ author: { displayName: null, avatarUrl: null }, page: null }, "Personne du réseau")).toEqual({ name: "Personne du réseau", imageUrl: null, square: false, hasIdentity: false })
  })
  it("continues through an empty visible page without rebuilding its opaque cursor", () => {
    const pages = { first: { items: [], next: "opaque-A" }, '"opaque-A"': { items: [], next: "opaque-B" } }
    const read = (cursor: string | null) => pages[nativeCursorKey(cursor) as keyof typeof pages]
    const linked = nativeLinkedPageCursors([null, "opaque-A"], read, page => page.next, PROFILE_MAX_PAGES)
    expect(linked).toEqual([null, "opaque-A"])
    expect(canAppendNativeCursor(linked, read("opaque-A").next, PROFILE_MAX_PAGES)).toBe(true)
    expect(nativeLinkedPageCursors([null, "stale-B"], read, page => page.next, PROFILE_MAX_PAGES)).toEqual([null])
  })
  it("keeps each account entry unique and in a real native or delegated destination", () => {
    expect(new Set(NATIVE_PROFILE_ENTRIES.map(entry => entry.id)).size).toBe(NATIVE_PROFILE_ENTRIES.length)
    expect(NATIVE_PROFILE_ENTRIES.filter(entry => entry.group === "account").map(entry => entry.id)).toEqual(["moderation", "personalData"])
    expect(NATIVE_PROFILE_ENTRIES.some(entry => entry.id === "bookmarks")).toBe(true)
  })
  it("interpolates a translated title while preserving unknown placeholders", () => {
    expect(nativeProfileText(() => "Profil de @{{handle}} · {{other}}", "publicTitle", { handle: "alice" })).toBe("Profil de @alice · {{other}}")
  })
})
