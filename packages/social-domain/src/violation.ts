/**
 * Violation d'une règle du domaine — remplace `ReseauPersonnelViolation` et
 * `ReseauAlbumsViolation` du socle.
 *
 * Le domaine ne parle pas : il lève le CODE de la règle enfreinte et ses
 * paramètres (bornes, jamais une valeur saisie). Le texte vit dans les locales
 * de l'écran (`errors` → `rules.<code>`, fr et en, interpolation des
 * paramètres). Au bord, une fonction Convex traduit la violation en
 * `invalidArgument` portant `{ rule, params }` (`convex/lib/errors.ts`).
 *
 * Les codes reprennent ceux du socle : un écran porté et un test porté les
 * reconnaissent tels quels.
 */
export const DOMAIN_RULES = [
  // Médias et contenu d'une publication
  "AVATAR_MIME_INVALID",
  "AVATAR_TOO_LARGE",
  "POST_MEDIA_TOO_MANY",
  "POST_VIDEO_MUST_BE_ALONE",
  "POST_MEDIA_MIME_INVALID",
  "POST_MEDIA_TOO_LARGE",
  "POST_MEDIA_ALT_TOO_LONG",
  "POST_VIDEO_TOO_LONG",
  "POST_SHARE_WITH_MEDIA",
  "POST_EMPTY",
  "POST_TOO_LONG",
  "POST_NOT_SHAREABLE",
  "POST_SHARE_IN_GROUP",
  "POST_PIN_GROUP",
  "POST_REACH_INVALID",
  "POST_COUNTRY_INVALID",
  "FEED_LANES_INVALID",
  "POST_COUNTRY_REQUIRED",
  "COMMENT_EMPTY",
  "COMMENT_TOO_LONG",
  // Profil
  "HANDLE_LENGTH",
  "HANDLE_CHARSET",
  "DISPLAY_NAME_LENGTH",
  "HEADLINE_TOO_LONG",
  "CONNECTION_MESSAGE_TOO_LONG",
  // Forme d'une publication de groupe ou de page
  "POST_GROUP_REQUIRED",
  "POST_GROUP_FORBIDDEN",
  "PAGE_POST_AUDIENCE_INVALID",
  "PAGE_POST_FORBIDS_GROUP",
  "PAGE_POST_FORBIDS_SHARE",
  "POST_FOLLOWERS_REQUIRES_PAGE",
  "POST_PIN_PAGE",
  // Pages : identité, nature, confiance, signataires, revendications
  "PAGE_HANDLE_LENGTH",
  "PAGE_HANDLE_CHARSET",
  "PAGE_NAME_LENGTH",
  "PAGE_SHORT_NAME_TOO_LONG",
  "PAGE_DESCRIPTION_TOO_LONG",
  "PAGE_CITY_INVALID",
  "PAGE_CITY_TOO_LONG",
  "PAGE_ASSOCIATION_TYPE_INVALID",
  "PAGE_SECTOR_INVALID",
  "PAGE_OWNER_KIND_RESERVED",
  "PAGE_TRUST_NOT_ALLOWED",
  "PAGE_SIGNATORIES_FULL",
  "PAGE_LAST_ADMIN",
  "PAGE_SIGNATORY_IDENTITY_REQUIRED",
  "PAGE_COUNTRY_REQUIRED",
  "PAGE_NOT_CLAIMABLE",
  "PAGE_ALREADY_VERIFIED",
  "PAGE_ALREADY_CLAIMED",
  "PAGE_CLAIM_PENDING",
  "PAGE_CLAIM_EVIDENCE_COUNT",
  "PAGE_CLAIM_NOTE_TOO_LONG",
  // Albums
  "ALBUM_TITLE_REQUIRED",
  "ALBUM_TITLE_TOO_LONG",
  "ALBUM_DESCRIPTION_TOO_LONG",
  "ALBUM_CAPTION_TOO_LONG",
  "ALBUM_ALT_TOO_LONG",
  "ALBUM_ITEMS_EMPTY",
  "ALBUM_BATCH_TOO_LARGE",
  "ALBUM_MEDIA_MIME_INVALID",
  "ALBUM_MEDIA_TOO_LARGE",
  "ALBUM_FULL",
  "ALBUM_EMPTY",
  "ALBUM_NOT_PUBLISHED",
  "ALBUM_REORDER_MISMATCH",
  // Groupes thématiques
  "GROUP_NAME_LENGTH",
  "GROUP_DESCRIPTION_TOO_LONG",
  "GROUP_OWNER_CANNOT_LEAVE",
  "GROUP_RULES_TOO_LONG",
  "GROUP_RULES_NOT_ACCEPTED",
  "GROUP_TRANSFER_TARGET_INELIGIBLE",
  // Évènements
  "EVENT_TITLE_LENGTH",
  "EVENT_DESCRIPTION_TOO_LONG",
  "EVENT_LOCATION_TOO_LONG",
  "EVENT_WINDOW_INVALID",
  "EVENT_TOO_LONG",
  "EVENT_TIMEZONE_INVALID",
  "EVENT_CANCELLED",
  // Stories
  "STORY_MEDIA_MIME_INVALID",
  "STORY_MEDIA_TOO_LARGE",
  "STORY_VIDEO_TOO_LONG",
  "STORY_CAPTION_TOO_LONG",
  "STORY_ACTIVE_LIMIT",
  // Dépôt de fichiers (politique par usage)
  "UPLOAD_TYPE_NOT_ALLOWED",
  "UPLOAD_SIZE_OUT_OF_RANGE",
  "UPLOAD_MISMATCH",
  // Décisions (console, modération) : le motif
  "DECISION_REASON_LENGTH",
  // Rôles d'un réseau (EX-08) : un réseau qui a un administrateur vivant en garde toujours un
  "NETWORK_LAST_ADMIN",
  // Messagerie : pièces jointes
  "ATTACHMENTS_TOO_MANY",
  "ATTACHMENT_TYPE_NOT_ALLOWED",
  "ATTACHMENT_TOO_LARGE",
  "ATTACHMENT_DURATION_NOT_AUDIO",
  "VOICE_DURATION_INVALID",
  "VOICE_TOO_LONG",
  // Messagerie : messages et fils
  "MESSAGE_EMPTY",
  "MESSAGE_TOO_LONG",
  "MESSAGE_EDIT_WINDOW_EXPIRED",
  "MESSAGE_ALREADY_DELETED",
  "MESSAGE_PIN_NOT_TEXT",
  "MESSAGE_PIN_DELETED",
  "MESSAGE_FORWARD_NOT_TEXT",
  "MESSAGE_FORWARD_UNAVAILABLE",
  "MESSAGE_FORWARD_CROSS_NETWORK",
  "THREAD_RELATION_REQUIRED",
  "THREAD_ARCHIVED",
  "THREAD_SELF",
  "MESSAGE_NOT_EDITABLE",
  // Conversations de groupe
  "GROUP_TOO_FEW_MEMBERS",
  "GROUP_FULL",
  "GROUP_SELF_MEMBER",
  "GROUP_CLOSED",
  // Appels (tête-à-tête, groupe, réglages, messagerie vocale)
  "CALL_SELF",
  "CALL_ENDED",
  "CALL_NOT_LIVE",
  "CALL_GROUP_NO_HOLD",
  "CALL_DECLINE_NOTE_TOO_LONG",
  "CALL_DND_PAST",
  "CALL_DND_TOO_LONG",
  "GROUP_CALL_TOO_FEW",
  "GROUP_CALL_SELECTION_TOO_LARGE",
  "GROUP_CALL_THREAD_TOO_LARGE",
  "GROUP_CALL_FULL",
  "GROUP_CALL_INVITES_EXHAUSTED",
  "GROUP_CALL_ALREADY_IN",
  "VOICEMAIL_DISABLED",
  "VOICEMAIL_DURATION",
  "VOICEMAIL_DIRECT_ONLY",
  // Direct (conférences en direct) : la session, sa forme et son jeton
  "LIVE_TITLE_REQUIRED",
  "LIVE_TITLE_TOO_LONG",
  "LIVE_FOLLOWERS_REQUIRES_PAGE",
  "LIVE_INVITEES_NOT_ANNOUNCED",
  "LIVE_ENDED",
  "LIVE_NOT_LIVE",
  "LIVE_FULL",
  "LIVE_EXCLUDED",
  // Direct : les invités nominatifs
  "LIVE_INVITEES_TOO_MANY",
  "LIVE_SPEAKER_INVITEES_TOO_MANY",
  "LIVE_INVITEE_NOT_ELIGIBLE",
  "LIVE_INVITEE_LIST_NOT_ELIGIBLE",
  "LIVE_INVITEE_CHECK_TOO_MANY",
  // Direct : l'antenne (mains levées, invitations, intervenants)
  "LIVE_ALREADY_ON_STAGE",
  "LIVE_JOIN_AS_VIEWER_FIRST",
  "LIVE_HAND_NOT_RECEIVABLE",
  "LIVE_ANTENNA_NOT_INVITABLE",
  "LIVE_INVITATION_EXPIRED",
  "LIVE_INVITATION_NOT_RECEIVABLE",
  "LIVE_NOT_ON_STAGE",
  "LIVE_TARGET_NOT_ON_STAGE",
  "LIVE_HOST_STAYS_ON_STAGE",
  "LIVE_STAGE_FULL",
  "LIVE_TARGET_CANNOT_JOIN_STAGE",
  "LIVE_PROMOTE_CONNECTIONS_ONLY",
  "LIVE_TARGET_EXCLUDED",
  "LIVE_HOST_MUTES_SELF",
  // Direct : l'accord explicite à l'enregistrement avant de prendre l'antenne (DL-02)
  "LIVE_RECORDING_CONSENT_REQUIRED",
  // Direct : la conversation, la modération, les délégations
  "LIVE_COMMENT_EMPTY",
  "LIVE_COMMENT_TOO_LONG",
  "LIVE_CHAT_CLOSED",
  "LIVE_CHAT_MUTED",
  "LIVE_SELF_EXCLUDE",
  "LIVE_SELF_MUTE",
  "LIVE_HOST_NOT_MODERATABLE",
  "LIVE_NOT_DELEGABLE",
  "LIVE_DELEGATIONS_FULL",
  // Direct : la rediffusion
  "LIVE_REPLAY_VISIBILITY_WIDENS",
  "LIVE_REPLAY_VISIBILITY_FOLLOWERS",
  "LIVE_REPLAY_VISIBILITY_INVITEES",
  "LIVE_REPLAY_DECISION_AFTER_END",
  "LIVE_NO_RECORDING",
  "LIVE_REPLAY_WITHDRAWN",
  "LIVE_REPLAY_RETRY_AFTER_END",
  "LIVE_REPLAY_NOTHING_TO_RETRY",
  "LIVE_REPLAY_NOT_STARTED",
  "LIVE_REPLAY_UNAVAILABLE",
  // Conversations contextuelles (CC-1, contrat CONVERSATION-CONTEXTUELLE-V1 §5.3, ADR-0025 accepté) :
  // refus EXPLICITES réservés à une partie actuelle ; un tiers reçoit toujours `notFound`.
  "CONTEXT_NOT_OPEN",
  "CONTEXT_CLOSED",
  "CONTEXT_UNAVAILABLE",
  "CONTEXT_WAITING_RESPONDER",
  "CONTEXT_ATTACHMENTS_CLOSED",
  "CONTEXT_CALLS_CLOSED",
  "CONTEXT_CALL_CONSENT_REQUIRED",
  "CONTEXT_IDEMPOTENCY_CONFLICT",
  "CONTEXT_TEXT_CONTROL",
] as const
export type DomainRule = (typeof DOMAIN_RULES)[number]

/** Paramètres d'une violation : des bornes, jamais une valeur saisie par la personne. */
export type DomainRuleParams = Readonly<Record<string, number>>

export class DomainViolation extends Error {
  constructor(
    readonly code: DomainRule,
    readonly params: DomainRuleParams = {},
  ) {
    super(code)
    this.name = "DomainViolation"
  }
}

export function isDomainViolation(error: unknown): error is DomainViolation {
  return error instanceof DomainViolation
}

/** Octets → mébioctets entiers, pour les paramètres de taille (« 20 Mo »). */
export function megabytes(bytes: number): number {
  return Math.round(bytes / (1024 * 1024))
}
