import { describe, expect, it } from "vitest"
import { nativeCanonicalPostUrl, nativeMediaCanAdvance, nativePostMetadata, nativePostTextParts, nativeQuoteIntent, nativeReactionPresentation, nativeRelativeTime } from "./feed-presentation"
import fr from "../i18n/feed.fr.json"
import en from "../i18n/feed.en.json"

const postId = "k123456789012345678901234567890123"
const t = (key: string) => (fr as Record<string, string>)[key] ?? key

describe("native feed navigation and windows", () => {
  it("keeps an empty filtered window traversable until the server marks the end", () => {
    expect(nativeMediaCanAdvance([null], "next-window", false)).toBe(true)
    expect(nativeMediaCanAdvance([null], "next-window", true)).toBe(false)
  })
  it("refuses repeated, missing, oversized cursors and a window beyond 200 admitted slots", () => {
    for (const cursor of [null, undefined, "", "x".repeat(8193)]) expect(nativeMediaCanAdvance([null], cursor, false)).toBe(false)
    expect(nativeMediaCanAdvance([null, "same"], "same", false)).toBe(false)
    expect(nativeMediaCanAdvance([null, ...Array.from({ length: 9 }, (_, index) => `window-${index}`)], "more", false)).toBe(false)
  })
  it("builds the existing member post route without changing its audience or copying content", () => {
    expect(nativeCanonicalPostUrl("https://social.example", postId)).toBe(`https://social.example/fil?post=${postId}`)
    expect(nativeCanonicalPostUrl("https://social.example", postId, "/demo")).toBe(`https://social.example/demo/fil?post=${postId}`)
    expect(nativeCanonicalPostUrl("http://localhost:3030", postId)).toBe(`http://localhost:3030/fil?post=${postId}`)
  })
  it("rejects ambiguous origins, credentials, hostile schemes and route injection", () => {
    for (const origin of [undefined, "http://social.example", "javascript:alert(1)", "https://user:secret@social.example", "https://social.example/other", "https://social.example/?token=x", "https://social.example/#x"]) expect(nativeCanonicalPostUrl(origin, postId)).toBeNull()
    for (const id of ["../fil", `${postId}?public=1`, "", "x".repeat(65)]) expect(nativeCanonicalPostUrl("https://social.example", id)).toBeNull()
  })
})

describe("native post text and relative times", () => {
  it("links Unicode tags and published handle syntax without altering surrounding text", () => {
    const body = "Bonjour #Éducation, @jean-remy.ndong !"
    const parts = nativePostTextParts(body)
    expect(parts.map(part => part.text).join("")).toBe(body)
    expect(parts.filter(part => part.kind !== "text")).toEqual([
      { kind: "tag", text: "#Éducation", value: "Éducation" },
      { kind: "mention", text: "@jean-remy.ndong", value: "jean-remy.ndong" },
    ])
  })
  it("does not turn email addresses or embedded punctuation into inferred people", () => {
    const body = "contact@example.ga mot#tag #a #" + "long".repeat(12)
    expect(nativePostTextParts(body)).toEqual([{ kind: "text", text: body, value: "" }])
  })
  it("uses bounded elapsed time instead of negative dates for clock skew", () => {
    const now = Date.UTC(2026, 9, 25, 12)
    expect(nativeRelativeTime(now + 60_000, now, "fr", t)).toBe("à l'instant")
    expect(nativeRelativeTime(now - 59_000, now, "fr", t)).toBe("à l'instant")
    expect(nativeRelativeTime(now - 60_000, now, "fr", t)).toBe("il y a 1 min")
    expect(nativeRelativeTime(now - 3_600_000, now, "fr", t)).toBe("il y a 1 h")
    expect(nativeRelativeTime(now - 86_400_000, now, "fr", t)).toBe("il y a 1 j")
    expect(nativeRelativeTime(Number.NaN, now, "fr", t)).toBe("")
  })
})

describe("guarded post identity and selected reaction", () => {
  it("names the actual Support reaction and removes the same kind instead of inventing a Like", () => {
    expect(nativeReactionPresentation("soutien", 3, t)).toEqual({ kind: "soutien", label: "Soutien", selected: true, toggleKind: "soutien", accessibilityLabel: "Soutien · 3" })
    expect(nativeReactionPresentation("bravo", 8, t).label).toBe("Bravo")
    expect(nativeReactionPresentation("instructif", 1, t).label).toBe("Instructif")
  })
  it("only offers Like as the default when the server says no personal reaction exists", () => {
    const reaction = nativeReactionPresentation(null, 0, t)
    expect(reaction.selected).toBe(false)
    expect(reaction.toggleKind).toBe("like")
    expect(reaction.accessibilityLabel).toBe("J’aime")
  })
  it("shows the page, projected signatory and actual audience using the Web wording", () => {
    const now = Date.UTC(2026, 9, 25, 12)
    expect(nativePostMetadata({ page: { handle: "boutique.demo" }, author: { displayName: "Patrick", handle: "patrick.demo" }, publishedAt: now - 3 * 86_400_000, origin: null, audience: "public", reason: "page" }, now, "fr", t)).toEqual({
      visible: "Page · il y a 3 j · Publié par Patrick · Tout le réseau",
      context: "Tout le réseau. Page suivie.",
    })
  })
  it("does not invent a signatory for a withdrawn profile or a personal post", () => {
    const now = Date.UTC(2026, 9, 25, 12)
    const base = { author: { displayName: null, handle: null }, publishedAt: now, origin: null, audience: "followers" as const, reason: "page" as const }
    expect(nativePostMetadata({ ...base, page: { handle: "page" } }, now, "fr", t).visible).toBe("Page · à l'instant · Réservé aux abonnés")
    const personal = nativePostMetadata({ ...base, page: null, author: { displayName: "Patrick", handle: "patrick.demo" }, audience: "connections", reason: "connection" }, now, "fr", t)
    expect(personal.visible).toBe("@patrick.demo · à l'instant · Mes connexions")
    expect(personal.context).toBe("Mes connexions. Une de vos connexions.")
    expect(personal.visible).not.toContain("Publié par")
  })
  it("attributes a reflected post to its projected network without adding an external identity", () => {
    const now = Date.UTC(2026, 9, 25, 12)
    const metadata = nativePostMetadata({ page: null, author: { displayName: null, handle: null }, publishedAt: now, origin: { name: "Diaspora" }, audience: "group", reason: "group" }, now, "fr", t)
    expect(metadata.visible).toBe("à l'instant · Publié depuis Diaspora · Groupe")
    expect(metadata.context).toBe("Groupe. Membre du groupe.")
  })
})

describe("explicit quote retry ownership", () => {
  it("admits an empty quote and freezes its key across an uncertain retry", () => {
    const first = nativeQuoteIntent(null, "network:person:session", postId, "", () => "first-key")
    expect(first?.body).toBe("")
    expect(nativeQuoteIntent(first, "network:person:session", postId, "", () => "another-key")).toBe(first)
  })
  it("cannot adopt an earlier intent for another session, post or changed body", () => {
    const first = nativeQuoteIntent(null, "owner", postId, " Bonjour ", () => "stable-key")
    expect(first?.body).toBe("Bonjour")
    expect(nativeQuoteIntent(first, "new-owner", postId, "Bonjour", () => "new")).toBeNull()
    expect(nativeQuoteIntent(first, "owner", "other-post", "Bonjour", () => "new")).toBeNull()
    expect(nativeQuoteIntent(first, "owner", postId, "Changed", () => "new")).toBeNull()
  })
  it("applies the engine post bound before allocating an idempotency key", () => {
    let allocated = false
    expect(() => nativeQuoteIntent(null, "owner", postId, "x".repeat(2001), () => { allocated = true; return "key" })).toThrow()
    expect(allocated).toBe(false)
  })
})

it("keeps the native feed dictionaries complete in both supported languages", () => {
  expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort())
})
