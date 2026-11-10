/** PA5 — contrats purs de livraison : références et compteurs, jamais un contenu social. */
import type { NotificationKind } from "./notifications"
import fr from "./i18n/locales/fr/notificationDelivery.json"
import en from "./i18n/locales/en/notificationDelivery.json"

export const NOTIFICATION_CATEGORIES = ["social", "messages", "calls", "network", "moderation", "files"] as const
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]
export const PUSH_PROVIDERS = ["web", "expo", "fcm", "apns", "apns_voip"] as const
export type PushProvider = (typeof PUSH_PROVIDERS)[number]
export const DEFAULT_WEEKLY_NOTIFICATION_LIMIT = 35
export const MAX_WEEKLY_NOTIFICATION_LIMIT = 100
export const MAX_PUSH_SUBSCRIPTIONS = 16
export const DELIVERY_MAX_ATTEMPTS = 3
export const DELIVERY_LEASE_MS = 60_000
export const DELIVERY_RETENTION_MS = 30 * 86_400_000
export const READ_NOTIFICATION_RETENTION_MS = 180 * 86_400_000
export const UNREAD_NOTIFICATION_RETENTION_MS = 365 * 86_400_000
export const WEEK_MS = 7 * 86_400_000

export function notificationCategory(kind: NotificationKind | "call_incoming"): NotificationCategory {
  if (kind === "commercial_contact" || kind === "contextual_message" || kind === "contextual_closed" || kind === "group_message" || kind === "group_added") return "messages"
  if (kind === "call_missed" || kind === "voicemail_left" || kind === "call_incoming") return "calls"
  if (kind === "moderation_decision" || kind === "report_received" || kind === "report_decided") return "moderation"
  if (kind === "file_withheld") return "files"
  if (["membership_changed", "badge_changed", "attestation_verified", "attestation_not_confirmed", "sponsorship_received", "sponsorship_withdrawn"].includes(kind)) return "network"
  return "social"
}

/** Semaine UTC, lundi 00:00 ; aucune semaine flottante rafraîchie par une écriture. */
export function notificationWeekStart(now: number): number {
  return Math.floor((now + 3 * 86_400_000) / WEEK_MS) * WEEK_MS - 3 * 86_400_000
}

export function notificationExpired(row: { createdAt: number; readAt?: number }, now: number): boolean {
  return row.readAt === undefined ? row.createdAt < now - UNREAD_NOTIFICATION_RETENTION_MS : row.readAt < now - READ_NOTIFICATION_RETENTION_MS
}

export type NeutralNotificationPayload = {
  version: 1
  networkId: string
  reference: string
  count: number
  locale: "fr" | "en"
  url: string
}

/** Seul le nombre d'avis est phrasé ; aucune interpolation de personne ou de contenu. */
export function neutralNotificationMessage(locale: "fr" | "en", count: number): string {
  const value = Number.isFinite(count) ? Math.max(1, Math.min(100, Math.floor(count))) : 1
  const messages = locale === "en" ? en : fr
  return (value === 1 ? messages.notification_one : messages.notification_other).replace("{{count}}", String(value))
}

/** Liste fermée : un appelant ne peut glisser un aperçu dans un champ ajouté. */
export function isNeutralNotificationPayload(value: unknown): value is NeutralNotificationPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return Object.keys(row).sort().join("|") === "count|locale|networkId|reference|url|version"
    && row.version === 1 && typeof row.networkId === "string" && typeof row.reference === "string"
    && typeof row.count === "number" && Number.isInteger(row.count) && row.count > 0 && row.count <= 100
    && (row.locale === "fr" || row.locale === "en") && typeof row.url === "string"
}
