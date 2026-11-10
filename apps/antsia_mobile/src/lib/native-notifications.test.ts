import { describe, expect, it, vi } from "vitest"
import { COMMERCE_NOTIFICATION_KINDS } from "@antsia/social-domain/commerceNotifications"
import frMessages from "../i18n/navigation.fr.json"
import enMessages from "../i18n/navigation.en.json"
import { nativeNotificationRoute, nativeNotificationSentence, nativeNotificationWebUrl, type NativeNotification } from "./native-notifications"
const item = (partial: Partial<NativeNotification>): NativeNotification => ({ notificationId: "notification", kind: "post_reaction", subject: null, createdAt: 1, readAt: null, resolution: null, inviteState: null, fileScanStatus: null, actor: null, page: null, ...partial } as NativeNotification)
function translator(messages: Readonly<Record<string, string>>) {
  return (key: string, params?: Record<string, string | number>): string => (messages[key] ?? key).replace(/\{\{(\w+)\}\}/g, (placeholder: string, name: string) => params?.[name] === undefined ? placeholder : String(params[name]))
}
const fr = translator(frMessages), en = translator(enMessages)
const actor = { displayName: "Awa NDONG", handle: "awa.demo" } as NonNullable<NativeNotification["actor"]>
describe("native notification routing", () => {
  it("opens a guarded post by its subject rather than a push job or notification ID", () => {
    expect(nativeNotificationRoute(item({ subject: { kind: "post", id: "post" } }))).toEqual({ name: "post", id: "post" })
    expect(nativeNotificationRoute(item({ subject: null }))).toBeNull()
  })
  it("preserves typed-target precedence and links unsupported activity to the matching live web center", () => {
    const row = item({ target: { kind: "personalDecisions" }, subject: { kind: "post", id: "post" } })
    expect(nativeNotificationRoute(row)).toBeNull()
    expect(nativeNotificationWebUrl(row, "https://site.example", "/demo")).toBe("https://site.example/demo/fil?notifications=1")
    expect(nativeNotificationWebUrl(row, undefined)).toBeNull()
  })
  it("does not invent a destination for security status events or unpublished profiles", () => {
    expect(nativeNotificationRoute(item({ kind: "new_follower" }))).toBeNull()
    expect(nativeNotificationWebUrl(item({ subject: { kind: "fileScan", id: "scan" } }), "https://site.example")).toBeNull()
  })
})

describe("native notification sentences", () => {
  it.each(COMMERCE_NOTIFICATION_KINDS)("phrases %s as a precise system event in both locales", kind => {
    const row = item({ kind, actor: { ...actor, displayName: "ACTEUR PRIVÉ 3 500 XAF" }, page: { name: "Boutique privée" } as NonNullable<NativeNotification["page"]> })
    for (const translate of [fr, en]) {
      const t = vi.fn(translate)
      const sentence = nativeNotificationSentence(row, t)
      expect(sentence).not.toMatch(/^mobile\./)
      expect(sentence).not.toBe(translate("mobile.notificationUi.notificationTargets.sentence.other"))
      expect(sentence).not.toMatch(/ACTEUR|3 500|Boutique privée/)
      expect(t).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/^mobile\.notificationUi\.notificationTargets\.sentence\.commerce\./))
      expect(nativeNotificationSentence(item({ kind, actor: null }), translate)).toBe(sentence)
    }
  })
  it("keeps all commerce events distinct and uses the Web's quote and application phrases", () => {
    expect(new Set(COMMERCE_NOTIFICATION_KINDS.map(kind => nativeNotificationSentence(item({ kind }), fr))).size).toBe(COMMERCE_NOTIFICATION_KINDS.length)
    expect(nativeNotificationSentence(item({ kind: "commerce_service_quote_received" }), fr)).toBe("Un devis vous attend pour votre demande de service.")
    expect(nativeNotificationSentence(item({ kind: "commerce_job_application_updated" }), en)).toBe("Your job application status has changed.")
  })
  it.each([
    ["commercial_contact", "commercialContactActor", "commercialContact"],
    ["contextual_message", "contextualMessage", "contextualMessageSystem"],
    ["contextual_closed", "contextualClosed", "contextualClosedSystem"],
  ] as const satisfies ReadonlyArray<readonly [NativeNotification["kind"], string, string]>)("uses the correct actor or system voice for %s", (kind, actorKey, systemKey) => {
    const prefix = "mobile.notificationUi.notificationTargets.sentence."
    for (const translate of [fr, en]) {
      expect(nativeNotificationSentence(item({ kind, actor }), translate)).toBe(translate(prefix + actorKey, { actor: actor.displayName ?? "" }))
      expect(nativeNotificationSentence(item({ kind, actor: null }), translate)).toBe(translate(prefix + systemKey))
      expect(nativeNotificationSentence(item({ kind, actor: undefined }), translate)).toBe(translate(prefix + systemKey))
      expect(nativeNotificationSentence(item({ kind, actor: { ...actor, displayName: "  " } }), translate)).toBe(translate(prefix + actorKey, { actor: translate("mobile.notificationUi.notificationTargets.unknownActor") }))
    }
  })
  it.each([
    ["association_event_cancelled", "Un événement auquel vous êtes inscrit ou en liste d'attente est annulé.", "An event you registered or are waitlisted for has been cancelled."],
    ["association_event_seat_confirmed", "Une place s'est libérée : votre inscription à un événement est confirmée.", "A place opened up: your registration for an event is confirmed."],
  ] as const)("phrases the page event notice %s as a system event without actor or content", (kind, french, english) => {
    expect(nativeNotificationSentence(item({ kind, actor }), fr)).toBe(french)
    expect(nativeNotificationSentence(item({ kind, actor: null }), en)).toBe(english)
  })
  it("keeps names neutral without a public actor and never names a moderator on a system withdrawal", () => {
    expect(nativeNotificationSentence(item({ kind: "post_comment", actor: { ...actor, displayName: null } }), fr)).toBe("Membre du réseau a commenté votre publication.")
    expect(nativeNotificationSentence(item({ kind: "sponsorship_withdrawn", actor: null }), fr)).toBe("Votre parrainage a été retiré.")
    expect(nativeNotificationSentence(item({ kind: "commercial_contact", actor: { ...actor, displayName: "  Awa NDONG  " } }), fr)).toBe("Nouvelle activité dans votre conversation commerciale avec Awa NDONG.")
  })
  it("names only a server-provided nonblank page for page posts and page moderation notices", () => {
    const page = { name: "  Mairie Démo  " } as NonNullable<NativeNotification["page"]>
    expect(nativeNotificationSentence(item({ kind: "moderation_decision", page }), fr)).toBe("Une décision de modération concerne la page Mairie Démo. Consultez ses décisions et recours.")
    expect(nativeNotificationSentence(item({ kind: "page_post", page: { ...page, name: " " } }), fr)).toBe(fr("mobile.notificationUi.notificationTargets.sentence.pagePost"))
  })
  it("keeps future and inherited property names on the neutral fallback", () => {
    for (const kind of ["future_kind", "toString", "constructor"] as const) {
      // Simulate an unsupported wire value from a newer server at this test
      // boundary only; the production DTO keeps its closed kind union.
      const row = { ...item({}), kind } as unknown as NativeNotification
      expect(nativeNotificationSentence(row, fr)).toBe("Nouvelle activité dans le réseau.")
    }
  })
  it("does not change typed commerce target precedence when its precise sentence is available", () => {
    const row = item({ kind: "commerce_service_quote_received", target: { kind: "personalDecisions" }, subject: { kind: "post", id: "post" } })
    expect(nativeNotificationSentence(row, fr)).toBe("Un devis vous attend pour votre demande de service.")
    expect(nativeNotificationRoute(row)).toBeNull()
    expect(nativeNotificationWebUrl(row, "https://site.example", "/demo")).toBe("https://site.example/demo/fil?notifications=1")
  })
})
