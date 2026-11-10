/**
 * P14B — règles pures des avis commerce. Tests ÉCRITS, NON EXÉCUTÉS (décision du propriétaire du
 * 18/10/2026 : « Continuer sans vérifier »).
 */
import { describe, expect, it } from "vitest"

import {
  COMMERCE_NOTICE_AUDIENCE,
  COMMERCE_NOTIFICATION_CATEGORY,
  COMMERCE_NOTIFICATION_KINDS,
  type CommerceNoticeBooking,
  type CommerceServiceObservation,
  commerceServiceObservationNotices,
  isCommerceNoticeTransition,
  isCommerceNotificationKind,
} from "./commerceNotifications"
import { NOTIFICATION_CATEGORIES } from "./notificationDelivery"
import { NOTIFICATION_KINDS } from "./notifications"
import { DIASPORA_NOTICE_AUDIENCES, NOTIFICATION_OPEN_TARGET_KINDS, DIASPORA_COMMUNITY_NOTICE_AUDIENCES, DIASPORA_COMMUNITY_NOTICE_OPENS } from "./notificationOpenTarget"

const A = "pro.ga:appointment:01JA00000000000000000000T1"
const B = "pro.ga:appointment:01JA00000000000000000000T2"
const ORDER = "pro.ga:order:01JA00000000000000000000D1"

function booking(overrides: Partial<CommerceNoticeBooking> = {}): CommerceNoticeBooking {
  return { appointmentRef: A, state: "requested", revision: 1, startAt: 1_000, endAt: 2_000, cancellation: null, ...overrides }
}
function observation(overrides: Partial<CommerceServiceObservation> = {}): CommerceServiceObservation {
  return { booking: null, pendingReplacement: null, order: null, reason: null, ...overrides }
}

describe("genres commerce — liste fermée, publics et catégorie", () => {
  it("chaque genre a un public, un préfixe propre et aucun nom commun avec le domaine", () => {
    for (const kind of COMMERCE_NOTIFICATION_KINDS) {
      expect(kind.startsWith("commerce_"), kind).toBe(true)
      expect(["client", "team", "candidate"]).toContain(COMMERCE_NOTICE_AUDIENCE[kind])
      expect((NOTIFICATION_KINDS as readonly string[]).includes(kind), kind).toBe(false)
      expect(isCommerceNotificationKind(kind)).toBe(true)
    }
    expect(new Set(COMMERCE_NOTIFICATION_KINDS).size).toBe(COMMERCE_NOTIFICATION_KINDS.length)
    expect(isCommerceNotificationKind("service_request_received")).toBe(false)
    expect(isCommerceNotificationKind("toString")).toBe(false)
  })

  it("devis accepté, créneau retenu, changement et annulation du client parlent à l'équipe ; le suivi au candidat", () => {
    expect(COMMERCE_NOTICE_AUDIENCE.commerce_service_quote_accepted).toBe("team")
    expect(COMMERCE_NOTICE_AUDIENCE.commerce_service_booking_held).toBe("team")
    expect(COMMERCE_NOTICE_AUDIENCE.commerce_service_booking_client_changed).toBe("team")
    expect(COMMERCE_NOTICE_AUDIENCE.commerce_service_booking_client_cancelled).toBe("team")
    expect(COMMERCE_NOTICE_AUDIENCE.commerce_service_quote_received).toBe("client")
    expect(COMMERCE_NOTICE_AUDIENCE.commerce_service_order_declined).toBe("client")
    expect(COMMERCE_NOTICE_AUDIENCE.commerce_job_application_updated).toBe("candidate")
  })

  it("la catégorie existe déjà dans les préférences (aucune catégorie nouvelle)", () => {
    expect(NOTIFICATION_CATEGORIES).toContain(COMMERCE_NOTIFICATION_CATEGORY)
    expect(COMMERCE_NOTIFICATION_CATEGORY).toBe("messages")
  })

  it("une transition est une référence ASCII bornée, jamais un texte libre ni un montant formaté", () => {
    expect(isCommerceNoticeTransition(`booking:${A}:r2`)).toBe(true)
    expect(isCommerceNoticeTransition("quote:pro.ga:quote:01JA00000000000000000000Q1:v2")).toBe(true)
    for (const value of ["", ":debut", "booking A", "texte libre é", "45 000 XAF", "x".repeat(161), "a\nb"]) expect(isCommerceNoticeTransition(value), value).toBe(false)
  })

  it("les natures de destination et les publics DIASPORALE sont fermés", () => {
    // CC-2b (ADR-0025) : la conversation contextuelle, sujet générique routé par l'application de la nature.
    // 19/10/2026 : l'avis de la vie communautaire DIASPORALE (entraide, mentorat, emploi, kit d'arrivée).
    // SU01d : « Mes signalements », destination de l'accusé de réception et de la décision au déclarant.
    expect(NOTIFICATION_OPEN_TARGET_KINDS).toEqual(["serviceRequest", "commercialThread", "jobApplication", "pageModerationDecisions", "personalDecisions", "personalReports", "diasporaServiceNotice", "diasporaCommunityNotice", "contextualThread"])
    expect(DIASPORA_NOTICE_AUDIENCES).toEqual(["requester", "provider", "responsible", "member"])
    expect(DIASPORA_COMMUNITY_NOTICE_AUDIENCES).toEqual(["author", "team", "mentor", "mentee", "candidate"])
    expect(DIASPORA_COMMUNITY_NOTICE_OPENS).toEqual(["aidQuestion", "aidMission", "mentoringRequest", "jobApplication", "kitResource"])
  })
})

describe("commerceServiceObservationNotices — décisions du professionnel seulement", () => {
  it("créneau retenu puis confirmé : un avis « confirmé », clé par référence et révision", () => {
    expect(commerceServiceObservationNotices(observation({ booking: booking() }), observation({ booking: booking({ state: "confirmed", revision: 2 }) })))
      .toEqual([{ kind: "commerce_service_booking_confirmed", transition: `booking:${A}:r2` }])
  })

  it("refus par le professionnel ≠ expiration du créneau", () => {
    expect(commerceServiceObservationNotices(observation({ booking: booking() }), observation({ booking: booking({ state: "cancelled_by_pro", cancellation: "professional", revision: 2 }) })))
      .toEqual([{ kind: "commerce_service_booking_declined", transition: `booking:${A}:r2` }])
    expect(commerceServiceObservationNotices(observation({ booking: booking() }), observation({ booking: booking({ state: "cancelled_by_pro", cancellation: "expired", revision: 2 }) }))).toEqual([])
  })

  it("annulation par le professionnel d'un rendez-vous confirmé ; celle du client ne lui est jamais annoncée", () => {
    const confirmed = booking({ state: "confirmed", revision: 2 })
    expect(commerceServiceObservationNotices(observation({ booking: confirmed }), observation({ booking: booking({ state: "cancelled_by_pro", cancellation: "professional", revision: 3 }) })))
      .toEqual([{ kind: "commerce_service_booking_cancelled", transition: `booking:${A}:r3` }])
    expect(commerceServiceObservationNotices(observation({ booking: confirmed }), observation({ booking: booking({ state: "cancelled_by_client", cancellation: "client", revision: 3 }) }))).toEqual([])
  })

  it("déplacement par le professionnel : même rendez-vous, révision supérieure, nouvel horaire ; jamais depuis un instantané provisoire", () => {
    const confirmed = booking({ state: "confirmed", revision: 2 })
    expect(commerceServiceObservationNotices(observation({ booking: confirmed }), observation({ booking: booking({ state: "confirmed", revision: 3, startAt: 5_000, endAt: 6_000 }) })))
      .toEqual([{ kind: "commerce_service_booking_rescheduled", transition: `booking:${A}:r3` }])
    expect(commerceServiceObservationNotices(observation({ booking: booking({ state: "confirmed", revision: null }) }), observation({ booking: booking({ state: "confirmed", revision: 3, startAt: 5_000 }) }))).toEqual([])
    // Même horaire, révision supérieure (autre détail servi) : rien à annoncer.
    expect(commerceServiceObservationNotices(observation({ booking: confirmed }), observation({ booking: booking({ state: "confirmed", revision: 3 }) }))).toEqual([])
  })

  it("le changement du client lui-même (échange immédiat) n'est pas annoncé au client", () => {
    expect(commerceServiceObservationNotices(observation({ booking: booking({ state: "confirmed", revision: 2 }) }), observation({ booking: booking({ appointmentRef: B, state: "confirmed", revision: 1 }) }))).toEqual([])
  })

  it("remplacement en attente tranché : confirmé (il devient le rendez-vous tenu) ou refusé ; expiré : rien", () => {
    const held = booking({ state: "confirmed", revision: 2 })
    const replacement = booking({ appointmentRef: B, state: "requested", revision: 1 })
    expect(commerceServiceObservationNotices(observation({ booking: held, pendingReplacement: replacement }), observation({ booking: booking({ appointmentRef: B, state: "confirmed", revision: 2 }) })))
      .toEqual([{ kind: "commerce_service_booking_confirmed", transition: `booking:${B}:r2` }])
    expect(commerceServiceObservationNotices(observation({ booking: held, pendingReplacement: replacement }), observation({ booking: held, reason: "change_declined" })))
      .toEqual([{ kind: "commerce_service_booking_declined", transition: `booking:${B}:declined` }])
    expect(commerceServiceObservationNotices(observation({ booking: held, pendingReplacement: replacement }), observation({ booking: held, reason: "change_expired" }))).toEqual([])
  })

  it("commande de prestation : acceptée depuis « en attente », refusée ou annulée ; état inchangé ou révision ancienne : rien", () => {
    const pending = { orderRef: ORDER, state: "pending" as const, revision: 1 }
    expect(commerceServiceObservationNotices(observation({ order: pending }), observation({ order: { orderRef: ORDER, state: "confirmed", revision: 2 } })))
      .toEqual([{ kind: "commerce_service_order_accepted", transition: `order:${ORDER}:r2` }])
    expect(commerceServiceObservationNotices(observation({ order: pending }), observation({ order: { orderRef: ORDER, state: "cancelled", revision: 2 } })))
      .toEqual([{ kind: "commerce_service_order_declined", transition: `order:${ORDER}:r2` }])
    expect(commerceServiceObservationNotices(observation({ order: pending }), observation({ order: pending }))).toEqual([])
    expect(commerceServiceObservationNotices(observation({ order: { orderRef: ORDER, state: "confirmed", revision: 3 } }), observation({ order: { orderRef: ORDER, state: "cancelled", revision: 2 } }))).toEqual([])
  })

  it("aucune transition rendue ne porte de montant, de nom ni de texte : seulement références et révisions", () => {
    const notices = [
      ...commerceServiceObservationNotices(observation({ booking: booking() }), observation({ booking: booking({ state: "confirmed", revision: 2 }) })),
      ...commerceServiceObservationNotices(observation({ order: { orderRef: ORDER, state: "pending", revision: 1 } }), observation({ order: { orderRef: ORDER, state: "confirmed", revision: 2 } })),
    ]
    for (const notice of notices) expect(isCommerceNoticeTransition(notice.transition), notice.transition).toBe(true)
  })
})
