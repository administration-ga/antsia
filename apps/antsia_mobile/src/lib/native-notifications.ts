import type { FunctionReturnType } from "convex/server"
import type { api } from "@antsia/api/engine"
import { isCommerceNotificationKind, type CommerceNotificationKind } from "@antsia/social-domain/commerceNotifications"
import type { NotificationKind } from "@antsia/social-domain/notifications"
import { nativeWebRoutes, type NativeRoute } from "./routes"
export type NativeNotification = FunctionReturnType<typeof api.modules.notifications.bell.paginateNotifications>["page"][number]
const socialKeys = { post_reaction: "postReaction", post_comment: "postComment", post_share: "postShare", mention: "mention", connection_request: "connectionRequest", connection_accepted: "connectionAccepted", new_follower: "newFollower", group_message: "groupMessage", group_added: "groupAdded", live_started: "liveStarted", live_invite: "liveInvite", live_antenna_invite: "liveAntennaInvite", thematic_group_invite: "thematicGroupInvite", event_invite: "eventInvite", live_replay_published: "liveReplayPublished" } as const satisfies Readonly<Partial<Record<NotificationKind, string>>>
type EngineOnlyKind = Exclude<NotificationKind, keyof typeof socialKeys>

// Same actor/system distinction as the Web notification-targets contract.
const engineKeys: Readonly<Record<EngineOnlyKind, { actor: string | null; system: string | null }>> = {
  commercial_contact: { actor: "commercialContactActor", system: "commercialContact" },
  association_event_reminder: { actor: null, system: "associationEventReminder" },
  association_event_cancelled: { actor: null, system: "associationEventCancelled" },
  association_event_seat_confirmed: { actor: null, system: "associationEventSeatConfirmed" },
  membership_changed: { actor: null, system: "membershipChanged" },
  badge_changed: { actor: null, system: "badgeChanged" },
  moderation_decision: { actor: null, system: "moderationDecision" },
  report_received: { actor: null, system: "reportReceived" },
  report_decided: { actor: null, system: "reportDecided" },
  page_post: { actor: null, system: "pagePost" },
  album_published: { actor: "albumPublished", system: null },
  file_withheld: { actor: null, system: "fileWithheld" },
  call_missed: { actor: "callMissed", system: null },
  voicemail_left: { actor: "voicemailLeft", system: null },
  sponsorship_received: { actor: "sponsorshipReceived", system: null },
  sponsorship_withdrawn: { actor: "sponsorshipWithdrawn", system: "sponsorshipWithdrawnSystem" },
  attestation_verified: { actor: null, system: "attestationVerified" },
  attestation_not_confirmed: { actor: null, system: "attestationNotConfirmed" },
  contextual_message: { actor: "contextualMessage", system: "contextualMessageSystem" },
  contextual_closed: { actor: "contextualClosed", system: "contextualClosedSystem" },
}

// Each commerce kind has a precise system sentence. No actor, private body,
// shop identity, amount or contact is passed to its translator.
const commerceKeys: Readonly<Record<CommerceNotificationKind, string>> = {
  commerce_service_followup_updated: "followupUpdated",
  commerce_service_quote_received: "quoteReceived",
  commerce_service_quote_revised: "quoteRevised",
  commerce_service_booking_confirmed: "bookingConfirmed",
  commerce_service_booking_declined: "bookingDeclined",
  commerce_service_booking_rescheduled: "bookingRescheduled",
  commerce_service_booking_cancelled: "bookingCancelled",
  commerce_service_order_accepted: "orderAccepted",
  commerce_service_order_declined: "orderDeclined",
  commerce_service_quote_accepted: "quoteAccepted",
  commerce_service_booking_held: "bookingHeld",
  commerce_service_booking_client_changed: "bookingClientChanged",
  commerce_service_booking_client_cancelled: "bookingClientCancelled",
  commerce_job_application_updated: "applicationUpdated",
}

function cleanName(value: string | null | undefined): string | null {
  return typeof value === "string" ? value.trim() || null : null
}

export function nativeNotificationSentence(item: NativeNotification, t: (key: string, params?: Record<string, string | number>) => string): string {
  const root = "mobile.notificationUi.notificationTargets."
  if (item.kind === "page_post" || item.kind === "moderation_decision") {
    const pageName = cleanName(item.page?.name)
    if (pageName !== null) return t(root + "sentence." + (item.kind === "page_post" ? "pagePostNamed" : "moderationDecisionPage"), { page: pageName })
  }
  if (isCommerceNotificationKind(item.kind)) return t(root + "sentence.commerce." + commerceKeys[item.kind])
  const actorName = () => cleanName(item.actor?.displayName) ?? t(root + "unknownActor")
  if (Object.hasOwn(socialKeys, item.kind)) return t("mobile.notificationUi.social." + socialKeys[item.kind as keyof typeof socialKeys], { actor: actorName() })
  if (Object.hasOwn(engineKeys, item.kind)) {
    const phrase = engineKeys[item.kind as EngineOnlyKind]
    const hasActor = item.actor !== null && item.actor !== undefined
    if (phrase.actor !== null && (hasActor || phrase.system === null)) return t(root + "sentence." + phrase.actor, { actor: actorName() })
    if (phrase.system !== null) return t(root + "sentence." + phrase.system)
  }
  return t(root + "sentence.other")
}
/** The notification reference is never a token and is never passed to push-job resolution. */
export function nativeNotificationRoute(item: NativeNotification): NativeRoute | null {
  if (item.target) return null // Typed commerce/moderation destinations take precedence.
  if (["connection_accepted", "new_follower", "sponsorship_received"].includes(item.kind)) return item.actor?.handle ? { name: "profile", handle: item.actor.handle } : null
  return item.subject?.kind === "post" ? { name: "post", id: item.subject.id } : null
}
export function nativeNotificationWebUrl(item: NativeNotification, origin: string | undefined, basePath?: "" | "/demo"): string | null {
  if (!origin) return null
  // Keep unsupported destinations in the live web activity center, where each subject is reread.
  return item.target || item.subject && !["post", "fileScan", "report"].includes(item.subject.kind) ? nativeWebRoutes.notifications(origin, basePath) : null
}
