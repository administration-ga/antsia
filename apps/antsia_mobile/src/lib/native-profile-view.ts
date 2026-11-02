import { assertHandle } from "@antsia/social-domain/content"
import type { NativeAccountSection } from "./routes"

export const PROFILE_PAGE_SIZE = 20
export const PROFILE_MAX_PAGES = 10
export const PROFILE_MAX_ITEMS = 200
export type NativeProfileGroup = "activity" | "preferences" | "account"
export type NativeProfileEntry = Readonly<{
  id: "bookmarks" | "activities" | "settings" | NativeAccountSection
  group: NativeProfileGroup
  label: string
  hint: string
}>

/** Same groups/order as the Web personal hub; each action is resolved by its caller. */
export const NATIVE_PROFILE_ENTRIES: readonly NativeProfileEntry[] = [
  { id: "bookmarks", group: "activity", label: "bookmarksLabel", hint: "bookmarksHint" },
  { id: "stories", group: "activity", label: "storiesLabel", hint: "storiesHint" },
  { id: "shop", group: "activity", label: "shopLabel", hint: "shopHint" },
  { id: "cart", group: "activity", label: "cartLabel", hint: "cartHint" },
  { id: "purchases", group: "activity", label: "purchasesLabel", hint: "purchasesHint" },
  { id: "orders", group: "activity", label: "ordersLabel", hint: "ordersHint" },
  { id: "payments", group: "activity", label: "paymentsLabel", hint: "paymentsHint" },
  { id: "serviceRequests", group: "activity", label: "serviceRequestsLabel", hint: "serviceRequestsHint" },
  { id: "applications", group: "activity", label: "applicationsLabel", hint: "applicationsHint" },
  { id: "settings", group: "preferences", label: "settings", hint: "settingsHint" },
  { id: "feedPreferences", group: "preferences", label: "feedPreferencesLabel", hint: "feedPreferencesHint" },
  { id: "moderation", group: "account", label: "moderationLabel", hint: "moderationHint" },
  { id: "personalData", group: "account", label: "personalDataLabel", hint: "personalDataHint" },
]

export function nativePublishedProfileHandle(raw: string | undefined): string | null {
  if (!raw) return null
  try { return assertHandle(raw) } catch { return null }
}

/** A late or foreign row may never appear under another person's profile identity. */
export function nativePostsForProfile<T extends { author: { personId: string | null }; page: unknown | null }>(posts: readonly T[], personId: string): T[] {
  return posts.filter(post => post.page === null && post.author.personId === personId)
}

export function nativeBookmarkIdentity(item: {
  author: { displayName: string | null; avatarUrl: string | null }
  page: { name: string; logoUrl: string | null } | null
}, neutralName: string): { name: string; imageUrl: string | null; square: boolean; hasIdentity: boolean } {
  if (item.page) return { name: item.page.name, imageUrl: item.page.logoUrl, square: true, hasIdentity: true }
  const name = item.author.displayName?.trim()
  return { name: name || neutralName, imageUrl: item.author.avatarUrl, square: false, hasIdentity: Boolean(name) }
}

export function nativeProfileText(t: (key: string) => string, key: string, values: Readonly<Record<string, string>> = {}): string {
  return t(`mobile.profile.${key}`).replace(/\{\{(\w+)\}\}/g, (placeholder: string, name: string) => values[name] ?? placeholder)
}
