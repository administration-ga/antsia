import { assertPostContent, type FeedReason, type PersonalPostAudience, type PersonalReactionKind } from "@antsia/social-domain/content"
import { canAppendNativeCursor } from "./native-pagination"

export function nativeFeedText(t: (key: string) => string, key: string, values: Readonly<Record<string, string | number>> = {}): string {
  return t(`mobile.feedUi.${key}`).replace(/\{\{(\w+)\}\}/gu, (match, name: string) => String(values[name] ?? match))
}

export function nativeRelativeTime(at: number, now: number, locale: string, t: (key: string) => string): string {
  if (!Number.isFinite(at) || !Number.isFinite(now)) return ""
  const minutes = Math.max(0, Math.floor((now - at) / 60_000))
  if (minutes < 1) return nativeFeedText(t, "now")
  if (minutes < 60) return nativeFeedText(t, "minutes", { count: minutes })
  if (minutes < 1440) return nativeFeedText(t, "hours", { count: Math.floor(minutes / 60) })
  if (minutes < 10080) return nativeFeedText(t, "days", { count: Math.floor(minutes / 1440) })
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", ...(new Date(at).getFullYear() === new Date(now).getFullYear() ? {} : { year: "numeric" }) }).format(at)
}

/** The selected kind comes from the guarded DTO; a tap removes that same kind. */
export function nativeReactionPresentation(mine: PersonalReactionKind | null, total: number, t: (key: string) => string) {
  const kind = mine ?? "like", label = nativeFeedText(t, `reaction.${kind}`)
  return { kind, label, selected: mine !== null, toggleKind: kind, accessibilityLabel: total > 0 ? `${label} · ${total}` : label }
}

type NativePostMetadataInput = {
  page: { handle: string } | null
  author: { displayName: string | null; handle: string | null }
  audience: PersonalPostAudience
  reason: FeedReason
  origin: { name: string } | null
  publishedAt: number
}

/** Same projected identity, audience and reading reason as the adaptive Web card. */
export function nativePostMetadata(post: NativePostMetadataInput, now: number, locale: string, t: (key: string) => string) {
  const signer = post.page ? post.author.displayName?.trim() : undefined
  const audience = nativeFeedText(t, `audience.${post.audience}`)
  const reason = nativeFeedText(t, `reason.${post.reason}`)
  const parts = [
    post.page ? nativeFeedText(t, "page") : post.author.handle ? `@${post.author.handle}` : null,
    nativeRelativeTime(post.publishedAt, now, locale, t),
    post.origin ? nativeFeedText(t, "origin", { name: post.origin.name }) : null,
    signer ? nativeFeedText(t, "signedBy", { name: signer }) : null,
    audience,
  ].filter(Boolean)
  return { visible: parts.join(" · "), context: nativeFeedText(t, "context", { audience, reason }) }
}

export type NativeTextPart = { kind: "text" | "tag" | "mention"; text: string; value: string }
export function nativePostTextParts(body: string): NativeTextPart[] {
  const result: NativeTextPart[] = []
  const pattern = /#[\p{L}\p{N}_]{2,30}(?![\p{L}\p{N}_])|@[a-z0-9][a-z0-9._-]{0,99}(?![a-z0-9._-])/gu
  let previous = 0
  for (const match of body.matchAll(pattern)) {
    const index = match.index
    // An address or a word containing @/# is plain text, not an inferred identity.
    if (index > 0 && /[\p{L}\p{N}_@]/u.test(body[index - 1]!)) continue
    if (index > previous) result.push({ kind: "text", text: body.slice(previous, index), value: "" })
    result.push({ kind: match[0].startsWith("#") ? "tag" : "mention", text: match[0], value: match[0].slice(1) })
    previous = index + match[0].length
  }
  if (previous < body.length) result.push({ kind: "text", text: body.slice(previous), value: "" })
  return result
}

/** Filtered empty pages still advance; only the server's end flag closes a window. */
export function nativeMediaCanAdvance(cursors: readonly (string | null)[], next: string | null | undefined, isDone: boolean, maxPages = 10): next is string {
  return !isDone && typeof next === "string" && next.length > 0 && next.length <= 8192 && canAppendNativeCursor(cursors, next, maxPages)
}

export function nativeCanonicalPostUrl(origin: string | undefined, postId: string, basePath?: "/demo"): string | null {
  if (!origin || !/^[a-z0-9]{16,64}$/u.test(postId)) return null
  try {
    const base = new URL(origin)
    const local = base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
    if (base.protocol !== "https:" && !local || base.username || base.password || base.pathname !== "/" || base.search || base.hash) return null
    const url = new URL(`${basePath ?? ""}/fil`, base)
    url.searchParams.set("post", postId)
    return url.href
  } catch { return null }
}

export type NativeQuoteIntent = Readonly<{ owner: string; postId: string; body: string; key: string }>
export function nativeQuoteIntent(previous: NativeQuoteIntent | null, owner: string, postId: string, body: string, createKey: () => string): NativeQuoteIntent | null {
  const normalized = assertPostContent({ body, mediaCount: 0, isShare: true })
  if (previous) return previous.owner === owner && previous.postId === postId && previous.body === normalized ? previous : null
  return { owner, postId, body: normalized, key: createKey() }
}
