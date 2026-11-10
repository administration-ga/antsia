// Dupliqué de socle/convex/modules/reseauPersonnel/notifications.ts (l. 54-126, genres, résolutions et clé de sujet) @ ad2e7fdc2 — adaptations : règles PURES sorties du backend ; genres du moteur (le direct s'appelle `live`, l'évènement personnel `event`, l'avis de la garde des fichiers `file_withheld`) ; sujet en forme générique `{ kind, id }` ; sujet « session de direct » (`liveSession`, le `subjectDirectSessionId` du socle) rétabli avec le module `live` (lot 16).
/**
 * La cloche sociale — genres, résolutions et clés de dédoublonnage.
 *
 * TROIS règles, toutes anti-fuite :
 *  1. aucun CORPS de contenu n'est recopié : la ligne ne porte que le genre, la
 *     référence du sujet et l'acteur — le contenu est RELU AVEC SA GARDE à
 *     l'ouverture ;
 *  2. dédoublonnage par `genre|sujet|acteur` : le même acteur qui réagit deux
 *     fois REMPLACE sa notification au lieu d'empiler ;
 *  3. jamais soi-même, jamais le refus : refuser une demande n'émet rien.
 */

export const NOTIFICATION_KINDS = [
  "post_reaction",
  "post_comment",
  /** Quelqu'un a PARTAGÉ ma publication : le sujet est MA publication. */
  "post_share",
  /** Citation par `@identifiant` — « vous a cité », pas « a commenté ». */
  "mention",
  "connection_request",
  "connection_accepted",
  "new_follower",
  /** Conversation de groupe : le sujet est le FIL, jamais un message. */
  "group_message",
  "commercial_contact",
  /**
   * Conversation contextuelle (CC-1, ADR-0025) : un nouveau message. Le sujet est le FIL ;
   * en voix de page, aucun acteur (la page parle, le signataire n'est jamais montré au demandeur).
   */
  "contextual_message",
  /** Conversation contextuelle : un côté a clos le fil (D12). Les transitions de l'objet gardent leurs propres avis. */
  "contextual_closed",
  "group_added",
  /** Un direct a COMMENCÉ (jamais à la programmation). */
  "live_started",
  "live_antenna_invite",
  "live_invite",
  "live_replay_published",
  "thematic_group_invite",
  "event_invite",
  /** Rappel personnel d'un événement de page, sans contenu dans la notification. */
  "association_event_reminder",
  /** Une page que je suis a publié : le sujet est la PUBLICATION, sans acteur (c'est la page qui parle). */
  "page_post",
  /** Une personne que je suis a publié un album (première publication seulement) : le sujet est l'ALBUM. */
  "album_published",
  /** La garde des fichiers retient un fichier déposé (bloqué, ou analyse en échec). */
  "file_withheld",
  /**
   * Un appel a été écarté par MES réglages (ne pas déranger, réunion, ligne
   * occupée) ou n'a pu sonner nulle part (hors ligne) : le sujet est l'APPEL,
   * l'acteur l'appelant. Ni pour « hors de mes relations » (notifier chaque
   * inconnu annulerait le réglage), ni pour une simple sonnerie sans réponse.
   */
  "call_missed",
  /** Un message vocal m'a été laissé : le sujet est le MESSAGE, l'acteur son auteur. */
  "voicemail_left",
  // Tranche `diaspora` (émis par `convex/modules/diaspora/`), tous sans sujet.
  /** Parrainé : l'acteur est le parrain. */
  "sponsorship_received",
  /** Parrainage retiré : l'acteur est le parrain s'il retire lui-même, ABSENT si c'est la modération. */
  "sponsorship_withdrawn",
  /** L'attestation consulaire a confirmé : le statut est passé « vérifiée ». Sans acteur. */
  "attestation_verified",
  /** L'attestation n'a pas confirmé — sans acteur, sans aucune raison consulaire. */
  "attestation_not_confirmed",
  "membership_changed",
  "badge_changed",
  "moderation_decision",
  /** SU01d : l'accusé de réception d'un signalement, au DÉCLARANT seul (ordonnance 0011, art. 24). Sans acteur ; le sujet est le dossier. */
  "report_received",
  /** SU01d : une décision a été prise sur son signalement, au DÉCLARANT seul. Sans acteur ; l'effet se lit dans « Mes signalements ». */
  "report_decided",
] as const

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

/**
 * Ce qu'est DEVENUE une notification actionnable — posé par le serveur dans la
 * transaction qui tranche, jamais par un écran. « Lu » n'a jamais voulu dire
 * « traité ».
 */
export const NOTIFICATION_RESOLUTIONS = ["accepted", "declined", "maybe", "cancelled", "expired"] as const

export type NotificationResolution = (typeof NOTIFICATION_RESOLUTIONS)[number]

/**
 * Les natures de SUJET d'une notification — une référence, jamais un contenu.
 * `liveSession` : la session de direct que désignent `live_started`,
 * `live_invite`, `live_antenna_invite` et `live_replay_published` — relue avec
 * sa garde à l'ouverture (la page de conférence sert le direct ou sa rediffusion).
 */
export const NOTIFICATION_SUBJECT_KINDS = ["post", "connection", "fileScan", "thematicGroup", "groupThread", "commercialThread", "contextualThread", "event", "album", "call", "voicemail", "liveSession", "report"] as const

export type NotificationSubjectKind = (typeof NOTIFICATION_SUBJECT_KINDS)[number]

export type NotificationSubject = { kind: NotificationSubjectKind; id: string }

/**
 * La chaîne de sujet de la clé de dédoublonnage. UNE seule définition, partagée
 * par l'émission et la résolution : les deux doivent désigner la même ligne.
 */
export function notificationSubjectKey(subject: NotificationSubject | null): string {
  return subject === null ? "-" : `${subject.kind}:${subject.id}`
}

/** `genre|sujet|acteur` — l'acteur absent (avis du système) s'écrit `-`. */
export function notificationDedupKey(kind: NotificationKind, subject: NotificationSubject | null, actorId: string | null): string {
  return `${kind}|${notificationSubjectKey(subject)}|${actorId ?? "-"}`
}

/** Le préfixe commun à toutes les lignes d'un genre et d'un sujet, quel que soit l'acteur. */
export function notificationResolutionPrefix(kind: NotificationKind, subject: NotificationSubject): string {
  return `${kind}|${notificationSubjectKey(subject)}|`
}

/** Au-delà, la cloche dit « 99+ » : compter plus loin ne change rien à l'écran. */
export const NOTIFICATION_UNREAD_CAP = 99
