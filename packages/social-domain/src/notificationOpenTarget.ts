/**
 * P14B (19/10/2026) — la DESTINATION TYPÉE d'un avis, rendue par le moteur APRÈS relecture (ligne de
 * la cloche, ouverture d'une notification poussée). Des références opaques seulement : jamais une
 * URL, un contenu, un motif, un montant ni un nom. Chaque application compose l'adresse sur SES
 * routes et retombe sur un repli neutre pour une nature qu'elle ne sert pas.
 *
 *  - `serviceRequest` : une demande de service du client (« Mes demandes », P14) ;
 *  - `commercialThread` : la conversation commerciale que l'équipe habilitée lit déjà (P10) ;
 *  - `jobApplication` : la fiche d'une candidature du candidat (« Mes candidatures », P15) ;
 *  - `pageModerationDecisions` : les décisions visant une page dont le lecteur est signataire VIVANT ;
 *  - `personalDecisions` : ses décisions et recours personnels ;
 *  - `personalReports` (SU01d) : ses signalements, leur échéance et leur issue (accusé de
 *    réception, décision) ;
 *  - `diasporaServiceNotice` : un avis de mise en relation DIASPORALE, sujet GÉNÉRIQUE (nature +
 *    référence opaque) que l'application DIASPORALE route elle-même ;
 *  - `diasporaCommunityNotice` (19/10/2026) : un avis de la vie communautaire DIASPORALE (entraide,
 *    mentorat, emploi, kit d'arrivée) — public, objet ouvert et référence opaque, routés par
 *    l'application DIASPORALE ;
 *  - `contextualThread` (CC-2b, ADR-0025) : une conversation contextuelle relue pour CE lecteur
 *    (partie actuelle) — sujet GÉNÉRIQUE (fil, nature, objet, côté, page) que l'application de la
 *    nature route elle-même ; aucune route ANTSIA en V1.
 */
import type { ContextualKind, ContextualSide } from "./contextualMessaging"

export const NOTIFICATION_OPEN_TARGET_KINDS = [
  "serviceRequest",
  "commercialThread",
  "jobApplication",
  "pageModerationDecisions",
  "personalDecisions",
  "personalReports",
  "diasporaServiceNotice",
  "diasporaCommunityNotice",
  "contextualThread",
] as const
export type NotificationOpenTargetKind = (typeof NOTIFICATION_OPEN_TARGET_KINDS)[number]

/** Publics d'un avis de mise en relation DIASPORALE (`SERVICE_NOTICE_AUDIENCES` de la tranche, recopiés à l'identique). */
export const DIASPORA_NOTICE_AUDIENCES = ["requester", "provider", "responsible", "member"] as const
export type DiasporaNoticeAudience = (typeof DIASPORA_NOTICE_AUDIENCES)[number]

/** Natures de sujet d'un avis de mise en relation DIASPORALE (colonnes `subject…Id` de la cloche). */
export const DIASPORA_NOTICE_SUBJECT_KINDS = ["serviceRequest", "associationMembership", "serviceReview"] as const
export type DiasporaNoticeSubjectKind = (typeof DIASPORA_NOTICE_SUBJECT_KINDS)[number]

/** Publics d'un avis communautaire DIASPORALE (`COMMUNITY_NOTICE_AUDIENCES` de la tranche, recopiés à l'identique). */
export const DIASPORA_COMMUNITY_NOTICE_AUDIENCES = ["author", "team", "mentor", "mentee", "candidate"] as const
export type DiasporaCommunityNoticeAudience = (typeof DIASPORA_COMMUNITY_NOTICE_AUDIENCES)[number]

/** Ce qu'ouvre un avis communautaire DIASPORALE (`COMMUNITY_NOTICE_OPENS` de la tranche, recopiés à l'identique). */
export const DIASPORA_COMMUNITY_NOTICE_OPENS = ["aidQuestion", "aidMission", "mentoringRequest", "jobApplication", "kitResource"] as const
export type DiasporaCommunityNoticeOpens = (typeof DIASPORA_COMMUNITY_NOTICE_OPENS)[number]

export type NotificationOpenTarget =
  | { kind: "serviceRequest"; requestRowId: string }
  | { kind: "commercialThread"; threadId: string }
  | { kind: "jobApplication"; applicationId: string }
  | { kind: "pageModerationDecisions"; pageId: string; pageHandle: string }
  | { kind: "personalDecisions" }
  | { kind: "personalReports" }
  | {
      kind: "diasporaServiceNotice"
      audience: DiasporaNoticeAudience
      subjectKind: DiasporaNoticeSubjectKind
      /** Référence opaque du sujet (identifiant du moteur), relue par la tranche avant d'être rendue. */
      subjectId: string
      /** La demande de service concernée, quand le lecteur la lit encore ; `null` sinon. */
      requestId: string | null
      /** L'adresse de la page concernée, si elle se lit encore pour ce lecteur ; `null` sinon. */
      pageHandle: string | null
    }
  | {
      kind: "diasporaCommunityNotice"
      audience: DiasporaCommunityNoticeAudience
      opens: DiasporaCommunityNoticeOpens
      /** Référence opaque de l'objet ouvert (la question, pour une réponse retenue), relue par la tranche. */
      objectId: string
      /** L'adresse de la page concernée, si elle se lit encore pour ce lecteur ; `null` sinon. */
      pageHandle: string | null
    }
  | {
      kind: "contextualThread"
      /** Le fil (identifiant du moteur), lisible par ce lecteur à l'instant. */
      threadId: string
      /** La nature du fil (liste fermée du domaine). */
      contextKind: ContextualKind
      /** L'objet ouvrant (référence opaque), pour composer l'écran de l'objet. */
      objectId: string
      /** Le côté du lecteur (demandeur, ou répondant : page ou mentor). */
      side: ContextualSide
      /** L'adresse de la page répondante si elle est active ; `null` sinon (côté personne compris). */
      pageHandle: string | null
    }
