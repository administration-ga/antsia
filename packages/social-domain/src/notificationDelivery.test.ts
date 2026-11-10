import { describe, expect, it } from "vitest"
import { isNeutralNotificationPayload, neutralNotificationMessage, notificationCategory, notificationExpired, notificationWeekStart, READ_NOTIFICATION_RETENTION_MS, UNREAD_NOTIFICATION_RETENTION_MS, WEEK_MS } from "./notificationDelivery"

describe("livraison neutre", () => {
  it("classe les genres de réseau sans mélanger appels et messages", () => {
    expect(notificationCategory("membership_changed")).toBe("network")
    expect(notificationCategory("moderation_decision")).toBe("moderation")
    // SU01d : l'accusé de réception et la décision au déclarant suivent la même catégorie.
    expect(notificationCategory("report_received")).toBe("moderation")
    expect(notificationCategory("report_decided")).toBe("moderation")
    expect(notificationCategory("call_incoming")).toBe("calls")
    expect(notificationCategory("group_message")).toBe("messages")
    expect(notificationCategory("post_comment")).toBe("social")
  })
  it("borne et localise seulement un compteur", () => {
    expect(neutralNotificationMessage("fr", 1)).toContain("1 nouvelle notification")
    expect(neutralNotificationMessage("en", 2)).toContain("2 new notifications")
    expect(neutralNotificationMessage("en", 500)).toContain("100 new notifications")
  })
  it("refuse un payload enrichi par du contenu", () => {
    const payload = { version: 1, networkId: "n", reference: "r", count: 1, locale: "fr", url: "https://example.test" }
    expect(isNeutralNotificationPayload(payload)).toBe(true)
    for (const key of ["body", "title", "email", "actor", "reason", "content", "preview"]) expect(isNeutralNotificationPayload({ ...payload, [key]: "secret" })).toBe(false)
  })
  it("la semaine commence lundi et ne glisse pas à chaque réservation", () => {
    const monday = Date.UTC(2026, 9, 12)
    expect(notificationWeekStart(monday + WEEK_MS - 1)).toBe(monday)
    expect(notificationWeekStart(monday + WEEK_MS)).toBe(monday + WEEK_MS)
  })
  it("lue : 180 jours depuis lecture ; jamais lue : 365 depuis création", () => {
    const now = Date.UTC(2026, 9, 16)
    expect(notificationExpired({ createdAt: 0, readAt: now }, now)).toBe(false)
    expect(notificationExpired({ createdAt: 0, readAt: now - READ_NOTIFICATION_RETENTION_MS }, now)).toBe(false)
    expect(notificationExpired({ createdAt: 0, readAt: now - READ_NOTIFICATION_RETENTION_MS - 1 }, now)).toBe(true)
    expect(notificationExpired({ createdAt: now - UNREAD_NOTIFICATION_RETENTION_MS }, now)).toBe(false)
    expect(notificationExpired({ createdAt: now - UNREAD_NOTIFICATION_RETENTION_MS - 1 }, now)).toBe(true)
  })
})
