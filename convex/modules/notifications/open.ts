/**
 * P05 (18/10/2026) — la PORTE d'ouverture d'une notification poussée.
 *
 * Le push ne porte qu'une référence opaque (`reference`, l'identifiant du job
 * de livraison) : ni nom, ni aperçu, ni destination privée. Quand la personne
 * touche la notification, le worker Web ouvre l'application sur cette porte,
 * qui RELIT tout au moment de l'ouverture — jamais ce qui était vrai à l'envoi :
 *
 *  1. la SESSION et l'adhésion, par le constructeur (`networkQuery`) ;
 *  2. le DESTINATAIRE : le job appartient à la personne de la session, dans CE
 *     réseau — sinon le même `null` que pour une référence inventée (refus
 *     indistinct : on n'apprend pas qu'un avis existe pour quelqu'un d'autre) ;
 *  3. le SUJET, avec sa garde actuelle (`notificationStillVisible` : adhésion,
 *     blocage, publication, fil, direct) ;
 *  4. l'APPEL : sonne-t-il ENCORE chez moi, à cet instant ?
 *
 * Elle ne marque RIEN comme lu (aucune présomption de lecture à l'ouverture
 * d'une notification) et ne rend aucun contenu : un genre, une référence de
 * sujet, l'identifiant PUBLIÉ de l'acteur quand il en a un. L'écran compose
 * l'adresse (`notificationTarget` du moteur) et retombe sur un repli neutre.
 *
 * P14B (19/10/2026) : `target`, la destination TYPÉE relue à l'instant pour les
 * genres sans sujet commun (`targets.ts`) — la demande du client ou la
 * conversation que l'équipe lit déjà (services P14), la fiche de candidature
 * (P15), les décisions de la page dont le lecteur est signataire VIVANT ou ses
 * décisions personnelles (`moderation_decision`), un sujet générique pour la
 * mise en relation DIASPORALE ; NP-04 : la fiche du groupe d'une invitation
 * (`thematic_group_invite`), relue par la garde de la fiche ; `null` pour tout
 * autre genre.
 */
import { isRingingCallStatus, isTerminalCallStatus } from "@antsia/social-domain/callJournal"
import { NOTIFICATION_SUBJECT_KINDS } from "@antsia/social-domain/notifications"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { networkQuery } from "../../lib/functions"
import { literals } from "../../lib/validators"
import { isLiveMemberOfThreadCall, participationOf } from "../calls/access"
import { canParticipateConversationCall } from "../calls/conversationAccess"
import { isBlockedBetween } from "../graph/graph"
import { publishedMiniProfile } from "../people/miniProfile"
import { subjectOf, subjectRefOf } from "./notify"
import { notificationStillVisible } from "./policy"
import { notificationKindValidator } from "./tables"
import { notificationOpenTargetOf, notificationOpenTargetValidator } from "./targets"

/** Une référence plus longue qu'un identifiant du moteur n'en est pas une : refus sans lecture. */
const REFERENCE_MAX_LENGTH = 64

const openTargetValidator = v.union(
  v.null(),
  /** Un appel : `ringing` dit s'il sonne ENCORE chez moi — l'écran ouvre les appels dans les deux cas. */
  v.object({ channel: v.literal("call"), ringing: v.boolean() }),
  /** Un avis de la cloche : son genre, son sujet (référence seule) et l'acteur PUBLIÉ. */
  v.object({
    channel: v.literal("notification"),
    kind: notificationKindValidator,
    subject: v.union(v.null(), v.object({ kind: literals(NOTIFICATION_SUBJECT_KINDS), id: v.string() })),
    actorHandle: v.union(v.null(), v.string()),
    /** P14B : la destination typée relue (références opaques), `null` sans destination typée. */
    target: notificationOpenTargetValidator,
  }),
)

type ReadCtx = Pick<QueryCtx, "db">

/**
 * L'appel sonne-t-il ENCORE chez `me` ? Mêmes conditions que la liste de ce qui
 * sonne (`calls.ringing.listRinging`) : tête-à-tête qui m'est adressé, pas
 * encore décroché ni quitté ; ticket de groupe `ringing` d'un appel vivant dont
 * je suis membre du fil ; jamais à travers un blocage.
 */
async function ringsFor(ctx: ReadCtx, call: Doc<"calls">, me: Id<"persons">): Promise<boolean> {
  if (call.status !== "active" || isTerminalCallStatus(call.callStatus) || call.createdByPersonId === me) return false
  // CC-4 : le sélecteur unique — un appel de conversation (P10 ou contextuelle) ne sonne que si SA règle l'admet encore.
  if ((await canParticipateConversationCall(ctx, call, me)) === false) return false
  if (await isBlockedBetween(ctx, call.createdByPersonId, me)) return false
  if (call.kind === "direct") {
    if (call.calleePersonId !== me || !isRingingCallStatus(call.callStatus)) return false
    const mine = await participationOf(ctx, call._id, me)
    return mine === null || (mine.joinedAt === undefined && mine.leftAt === undefined)
  }
  const ticket = await ctx.db
    .query("callInvites")
    .withIndex("by_call_person", (q) => q.eq("callId", call._id).eq("personId", me))
    .unique()
  if (!ticket || ticket.status !== "ringing") return false
  return (await isLiveMemberOfThreadCall(ctx, call, me)) !== false
}

/** La destination VIVANTE d'une notification poussée, pour la personne de la session — ou `null`. */
export const resolveOpenTarget = networkQuery({
  // Le jeton d'ouverture renouvelle la clé de lecture côté client : une
  // destination obtenue précédemment ne remplace jamais la relecture réseau.
  // Il ne donne aucun droit et n'est ni enregistré ni transmis au transport.
  args: { reference: v.string(), openingToken: v.optional(v.string()) },
  returns: openTargetValidator,
  handler: async (ctx, args) => {
    if (args.reference.length === 0 || args.reference.length > REFERENCE_MAX_LENGTH) return null
    if (args.openingToken !== undefined && (args.openingToken.length === 0 || args.openingToken.length > 64 || /[^a-zA-Z0-9_-]/.test(args.openingToken))) return null
    const jobId = ctx.db.normalizeId("notificationDeliveryJobs", args.reference)
    if (jobId === null) return null
    const job = await ctx.db.get(jobId)
    const me = ctx.person._id
    if (!job || job.networkId !== ctx.networkId || job.recipientPersonId !== me) return null

    if (job.channel === "call") {
      if (job.callId === undefined) return null
      const call = await ctx.db.get(job.callId)
      // Un appel disparu ou d'un autre réseau : le même repli que tout le reste.
      if (!call || call.networkId !== ctx.networkId) return null
      return { channel: "call" as const, ringing: await ringsFor(ctx, call, me) }
    }

    if (job.channel !== "push" || job.notificationId === undefined) return null
    const row = await ctx.db.get(job.notificationId)
    if (!row || row.networkId !== ctx.networkId || row.recipientPersonId !== me) return null
    if (!(await notificationStillVisible(ctx, row))) return null
    const actor = row.actorPersonId === undefined ? null : await publishedMiniProfile(ctx, row.actorPersonId)
    return {
      channel: "notification" as const,
      kind: row.kind,
      subject: subjectOf(subjectRefOf(row)),
      actorHandle: actor?.handle ?? null,
      target: await notificationOpenTargetOf(ctx, row),
    }
  },
})
