/**
 * P14B — destinations TYPÉES d'un avis servies par ANTSIA (cloche et porte d'ouverture). Tests
 * ÉCRITS, NON EXÉCUTÉS (décision du propriétaire du 18/10/2026 : « Continuer sans vérifier »).
 */
import { createAppI18n } from "@antsia/social-features/i18n"
import { notificationTarget } from "@antsia/social-features/notifications"
import { describe, expect, it } from "vitest"

import { appResources } from "@/i18n/resources"
import { engineRoutes, memberDestinationFor, pageDecisionsAnchor, routes } from "./routes"

const t = createAppI18n({ locale: "fr", appResources, defaultNS: "notifications" }).getFixedT("fr")

describe("P14B — routes des destinations typées", () => {
  it("chaque destination typée a sa route, injectée telle quelle dans le moteur", () => {
    expect(routes.jobApplication("candidature/1")).toBe("/mes-candidatures/candidature%2F1")
    expect(routes.pageModerationDecisions("page-1")).toBe(`${routes.personalControls()}#${pageDecisionsAnchor("page-1")}`)
    expect(engineRoutes.serviceRequest?.("demande-1")).toBe(routes.serviceRequest("demande-1"))
    expect(engineRoutes.jobApplication?.("candidature-1")).toBe(routes.jobApplication("candidature-1"))
    expect(engineRoutes.pageModerationDecisions?.("page-1")).toBe(routes.pageModerationDecisions("page-1"))
    expect(engineRoutes.personalDecisions?.()).toBe(routes.personalControls())
  })

  it("la fiche d'une candidature relève de Profil, comme Mes candidatures et Mes demandes", () => {
    const search = new URLSearchParams()
    expect(memberDestinationFor(routes.jobApplication("candidature-1"), search)).toEqual({ id: "profil", current: "section" })
    expect(memberDestinationFor(routes.myApplications(), search)).toEqual({ id: "profil", current: "section" })
    expect(memberDestinationFor(routes.serviceRequest("demande-1"), search)).toEqual({ id: "profil", current: "section" })
  })

  it("la cible typée se compose sur les routes de l'application, jamais sur une adresse fournie", () => {
    expect(notificationTarget({ kind: "commerce_service_booking_confirmed", target: { kind: "serviceRequest", requestRowId: "demande-1" } }, engineRoutes, t)?.href).toBe(routes.serviceRequest("demande-1"))
    expect(notificationTarget({ kind: "commerce_job_application_updated", target: { kind: "jobApplication", applicationId: "candidature-1" } }, engineRoutes, t)?.href).toBe(routes.jobApplication("candidature-1"))
    expect(notificationTarget({ kind: "moderation_decision", target: { kind: "pageModerationDecisions", pageId: "page-1", pageHandle: "page-demo" } }, engineRoutes, t)?.href).toBe(routes.pageModerationDecisions("page-1"))
    expect(notificationTarget({ kind: "moderation_decision", target: { kind: "personalDecisions" } }, engineRoutes, t)?.href).toBe(routes.personalControls())
    // PG-01 : invitation à signer et revendication tranchée mènent à la page, relue par le serveur.
    expect(notificationTarget({ kind: "page_signatory_invite", target: { kind: "page", pageId: "page-1", pageHandle: "pecheurs-lambarene" } }, engineRoutes, t)?.href).toBe(routes.page("pecheurs-lambarene"))
    expect(notificationTarget({ kind: "page_claim_decided", target: { kind: "page", pageId: "page-1", pageHandle: "pecheurs-lambarene" } }, engineRoutes, t)?.href).toBe(routes.page("pecheurs-lambarene"))
  })
})
