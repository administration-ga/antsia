import { describe, expect, it } from "vitest"

import { ASSOCIATION_EVENT_NOTICE_KINDS, isAssociationEventNoticeKind, isPageGovernanceNoticeKind, NOTIFICATION_KINDS, NOTIFICATION_SUBJECT_KINDS, notificationDedupKey, notificationResolutionPrefix, notificationSubjectKey, PAGE_GOVERNANCE_NOTICE_KINDS } from "./notifications"

describe("cloche — clés de dédoublonnage et de résolution", () => {
  it("le sujet s'écrit `nature:identifiant`, l'absence `-`", () => {
    expect(notificationSubjectKey({ kind: "post", id: "p1" })).toBe("post:p1")
    expect(notificationSubjectKey(null)).toBe("-")
  })

  it("la clé est `genre|sujet|acteur`, l'acteur absent s'écrit `-`", () => {
    expect(notificationDedupKey("post_reaction", { kind: "post", id: "p1" }, "a1")).toBe("post_reaction|post:p1|a1")
    expect(notificationDedupKey("file_withheld", { kind: "fileScan", id: "s1" }, null)).toBe("file_withheld|fileScan:s1|-")
  })

  it("les genres sans sujet de la tranche diaspora : un retrait par la modération ne désigne personne", () => {
    expect(notificationDedupKey("sponsorship_received", null, "parrain")).toBe("sponsorship_received|-|parrain")
    expect(notificationDedupKey("sponsorship_withdrawn", null, null)).toBe("sponsorship_withdrawn|-|-")
    expect(notificationDedupKey("attestation_not_confirmed", null, null)).toBe("attestation_not_confirmed|-|-")
  })

  it("la session de direct est un sujet : une invitation à l'antenne se résout sur la session, quel que soit l'invitant", () => {
    const session = { kind: "liveSession", id: "s1" } as const
    expect(notificationSubjectKey(session)).toBe("liveSession:s1")
    expect(notificationDedupKey("live_antenna_invite", session, "hote")).toBe("live_antenna_invite|liveSession:s1|hote")
    const prefix = notificationResolutionPrefix("live_antenna_invite", session)
    expect(notificationDedupKey("live_antenna_invite", session, "cohote").startsWith(prefix)).toBe(true)
    expect(notificationDedupKey("live_invite", session, "hote").startsWith(prefix)).toBe(false)
  })

  it("le préfixe de résolution couvre toutes les lignes du sujet, quel que soit l'acteur", () => {
    const prefix = notificationResolutionPrefix("connection_request", { kind: "connection", id: "c1" })
    expect(notificationDedupKey("connection_request", { kind: "connection", id: "c1" }, "x").startsWith(prefix)).toBe(true)
    expect(notificationDedupKey("connection_request", { kind: "connection", id: "c10" }, "x").startsWith(prefix)).toBe(false)
  })

  it("les décisions désignent un signalement, jamais un motif ni un contenu", () => {
    expect(notificationDedupKey("moderation_decision", { kind: "report", id: "r1" }, null)).toBe("moderation_decision|report:r1|-")
    expect(notificationDedupKey("membership_changed", null, null)).toBe("membership_changed|-|-")
    expect(notificationDedupKey("badge_changed", null, null)).toBe("badge_changed|-|-")
  })
})

describe("avis d'un événement de page (DG-023, EV-03)", () => {
  it("rappel, annulation et place confirmée : trois genres du domaine commun, et eux seuls", () => {
    expect([...ASSOCIATION_EVENT_NOTICE_KINDS]).toEqual(["association_event_reminder", "association_event_cancelled", "association_event_seat_confirmed"])
    for (const kind of ASSOCIATION_EVENT_NOTICE_KINDS) {
      expect((NOTIFICATION_KINDS as readonly string[]).includes(kind), kind).toBe(true)
      expect(isAssociationEventNoticeKind(kind), kind).toBe(true)
    }
    for (const kind of ["event_invite", "aid_mission_signup", "toString", ""]) expect(isAssociationEventNoticeKind(kind), kind).toBe(false)
  })

  it("la clé désigne l'événement et le destinataire seul, sans acteur : un rejeu retrouve la même ligne", () => {
    const event = { kind: "event", id: "ev1" } as const
    expect(notificationDedupKey("association_event_cancelled", event, null)).toBe("association_event_cancelled|event:ev1|-")
    expect(notificationDedupKey("association_event_seat_confirmed", event, null)).toBe("association_event_seat_confirmed|event:ev1|-")
  })
})

describe("avis de gouvernance d'une page (PG-01)", () => {
  it("invitation à signer et revendication tranchée : deux genres du domaine commun, et eux seuls", () => {
    expect([...PAGE_GOVERNANCE_NOTICE_KINDS]).toEqual(["page_signatory_invite", "page_claim_decided"])
    for (const kind of PAGE_GOVERNANCE_NOTICE_KINDS) {
      expect((NOTIFICATION_KINDS as readonly string[]).includes(kind), kind).toBe(true)
      expect(isPageGovernanceNoticeKind(kind), kind).toBe(true)
    }
    for (const kind of ["thematic_group_invite", "page_post", "association_event_cancelled", "toString", ""]) expect(isPageGovernanceNoticeKind(kind), kind).toBe(false)
    expect(NOTIFICATION_SUBJECT_KINDS).toContain("page")
    expect(NOTIFICATION_SUBJECT_KINDS).toContain("pageClaim")
  })

  it("la clé désigne la page ou la revendication, sans acteur ; la résolution vise la page de l'invitation", () => {
    expect(notificationDedupKey("page_signatory_invite", { kind: "page", id: "p1" }, null)).toBe("page_signatory_invite|page:p1|-")
    expect(notificationDedupKey("page_claim_decided", { kind: "pageClaim", id: "c1" }, null)).toBe("page_claim_decided|pageClaim:c1|-")
    expect(notificationResolutionPrefix("page_signatory_invite", { kind: "page", id: "p1" })).toBe("page_signatory_invite|page:p1|")
  })
})
