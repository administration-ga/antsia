// Dupliqué de socle/convex/functions/meetings.ts (avec socle/convex/modules/reseauPersonnel/messagerie.ts, l. 1039-1110, `callByHandle`) @ ad2e7fdc2 — adaptations : la personne appelée est rendue (`calleePersonId`, connue même d'un appel adressé par identifiant public : l'écran d'appel la nomme et la suit) ; l. 1863-1993 (`callCitizenById`) et `callByHandle` FUSIONNÉS en `callMember` — une seule porte, la cible désignée par sa personne (journal, grille) ou par son identifiant public, un seul budget (`call.place`) ; verrous « agent » levés (V01 délai de rattachement → statut d'adhésion par le constructeur ; V02 « les ressortissants ne peuvent pas appeler », V03 et V07 « l'appelé doit être affilié » retirés : un membre déclaré appelle un membre déclaré du réseau) ; l'appelé est JOIGNABLE (profil publié, non effacé, membre déclaré du réseau) et sans blocage, sinon le refus indistinct (D13) ; `endStaleCalls` → `reapStaleCallsOf` (lecture indexée bornée, D11, D27) ; admission par le pont du moteur ; titre non stocké ; salle `call-…` ; lignes de participation (D27) ; fin de sonnerie programmée ; messagerie vocale jamais offerte sur « hors de mes relations » (décision 6d du socle, désormais tenue par le serveur).
/**
 * Appels — APPELER UN MEMBRE, en tête-à-tête.
 *
 * C'est un appel, pas une réunion : il entre dans la machine d'états
 * (`initiating`, puis `ringing` quand l'appelant a rejoint sa salle), il sonne
 * dans sa fenêtre, il se décroche. Un refus d'admission n'est PAS une exception :
 * l'appel est inscrit déjà terminé, des deux côtés, et la raison est RENDUE.
 */
import { type Infer, v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { failRule, notFound } from "../../lib/errors"
import { networkMutation } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { isBlockedBetween } from "../graph/graph"
import { callRoomName, reachablePerson } from "./access"
import { reapStaleCallsOf } from "./cleanup"
import { callConversationOf, conversationFieldsOf } from "./conversation"
import { conversationCallPairAllowed } from "./conversationAccess"
import { evaluateCallAdmission, insertRefusedCall } from "./evaluate"
import { scheduleDirectRingExpiry } from "./ringExpiry"
import { activeCallSession } from "./deviceOwnership"
import { callAdmissionReasonValidator, callMediaTypeValidator } from "./validators"

/** Qui l'on appelle : sa personne, ou son identifiant public. */
export const callTargetValidator = v.union(v.object({ personId: v.id("persons") }), v.object({ handle: v.string() }))

export const directCallResultValidator = v.union(
    v.object({ admitted: v.literal(true), callId: v.id("calls"), calleePersonId: v.id("persons"), roomName: v.string(), mediaType: callMediaTypeValidator }),
    v.object({ admitted: v.literal(false), callId: v.id("calls"), calleePersonId: v.id("persons"), reason: callAdmissionReasonValidator, voicemailOffered: v.boolean() }),
  )
export type DirectCallResult = Infer<typeof directCallResultValidator>
export const callMember = networkMutation({
  args: { target: callTargetValidator, mediaType: v.optional(callMediaTypeValidator) },
  returns: directCallResultValidator,
  handler: placeDirectCall,
})

/**
 * Porte partagée ; seuls les wrappers de conversation ajoutent leur contexte — `commercialThreadId`
 * (P10, `commercialMessaging/calls.startCall`) ou `contextualThreadId` (CC-4,
 * `contextualMessaging/calls.start`), jamais les deux (sélecteur `conversation.ts` : refus indistinct).
 * Toutes les gardes s'appliquent à chacun ; D5 (a) : un appel contextuel, dont la paire exige les
 * accords des deux personnes dans ce fil, lève le seul réglage « hors de mes relations » de l'appelé.
 */
export async function placeDirectCall(
  ctx: MutationCtx & { networkId: Id<"networks">; person: Doc<"persons"> },
  args: { target: Infer<typeof callTargetValidator>; mediaType?: Infer<typeof callMediaTypeValidator>; commercialThreadId?: Id<"commercialThreads">; contextualThreadId?: Id<"contextualThreads"> },
): Promise<DirectCallResult> {
    const me = ctx.person._id
    await enforceRateLimit(ctx, "call.place", me)
    const callee = await reachablePerson(ctx, ctx.networkId, args.target)
    if (callee === null) return notFound()
    if (callee._id === me) return failRule("CALL_SELF")
    // Bloqué, dans un sens ou dans l'autre : le même refus qu'un inconnu.
    if (await isBlockedBetween(ctx, me, callee._id)) return notFound()
    // Le sélecteur unique : au plus UN contexte de conversation, dont la paire est relue dans CE réseau.
    const conversation = callConversationOf(args)
    if (!(await conversationCallPairAllowed(ctx, ctx.networkId, conversation, me, callee._id))) return notFound()

    const now = Date.now()
    const ownerSessionId = await activeCallSession(ctx)
    const mediaType = args.mediaType ?? "audio"
    await reapStaleCallsOf(ctx, ctx.networkId, me, now)
    const roomName = callRoomName("direct", now)

    const admission = await evaluateCallAdmission(ctx, { networkId: ctx.networkId, calleePersonId: callee._id, callerPersonId: me, now, ...(conversation.kind === "contextual" ? { viaContextualConsent: true } : {}) })
    if (!admission.decision.admitted) {
      const reason = admission.decision.reason
      const callId = await insertRefusedCall(ctx, { networkId: ctx.networkId, callerId: me, calleeId: callee._id, roomName, mediaType, reason, now, ...conversationFieldsOf(conversation) })
      // Sur « hors de mes relations », aucune messagerie vocale : ce serait le contournement du réglage.
      // Une conversation (P10, contextuelle) n'en offre jamais : elle n'ouvre pas la messagerie vocale personnelle.
      return { admitted: false as const, callId, calleePersonId: callee._id, reason, voicemailOffered: conversation.kind === "none" && admission.voicemailEnabled && reason !== "outside_relations" }
    }

    const callId = await ctx.db.insert("calls", {
      networkId: ctx.networkId,
      kind: "direct",
      status: "active",
      callStatus: "initiating",
      roomName,
      systemCallUuid: crypto.randomUUID(),
      createdByPersonId: me,
      calleePersonId: callee._id,
      mediaType,
      maxParticipants: 2,
      startedAt: now,
      ...conversationFieldsOf(conversation),
      ...(admission.calleeEngaged ? { calleeEngagedAtCreate: true } : {}),
    })
    // L'appelant est dans sa salle dès la création ; l'appelé y entrera en décrochant.
    await ctx.db.insert("callParticipants", { networkId: ctx.networkId, callId, personId: me, role: "host", joinedAt: now, ownerSessionId })
    await ctx.db.insert("callParticipants", { networkId: ctx.networkId, callId, personId: callee._id, role: "participant" })
    await scheduleDirectRingExpiry(ctx, { callId, startedAt: now, now })
    return { admitted: true as const, callId, calleePersonId: callee._id, roomName, mediaType }
}
