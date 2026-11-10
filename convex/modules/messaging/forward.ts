// Dupliqué de socle/convex/modules/messagerieScope/transfert.ts @ ad2e7fdc2 — adaptations : la frontière n'est plus « fil de poste / fil personnel » mais le RÉSEAU — source et cible dans le réseau de la fonction appelée, un fil d'un autre réseau dont je suis partie (ou membre) est un refus EXPLICITE (`MESSAGE_FORWARD_CROSS_NETWORK`), jamais un filtrage muet ; deux portes (`forwardMessage` pour une source 1:1, `forwardGroupMessage` pour une source de groupe) et trois cibles (`personal`, `group`, `handle` — `chat` et `thread` renommés) ; pièces RECOPIÉES par la garde du moteur (`verifyDeclaredAttachments` sans acteur : le blob est celui de l'original, relu au stockage, et l'original reste son propriétaire) ; contenu rejugé par le contrat ; un seul point d'insertion par messagerie (`appendPersonalMessage`, `appendGroupMessage` : aperçu, pastille, diffusion, idempotence) ; ressortissants (`isPublicUser`), poste et push retirés (D20) ; débit propre, et celui de l'ouverture d'un fil quand la cible est un identifiant ; refus à code.
/**
 * TRANSFÉRER un message vers une autre conversation du MÊME réseau.
 *
 * Deux surfaces de fuite, fermées ici :
 *  1. **jamais d'un réseau à l'autre** : le réseau de la source et celui de la
 *     cible sont résolus côté SERVEUR (par le fil, jamais par un argument
 *     client), et un écart est un refus explicite ;
 *  2. **le serveur relit CHAQUE pièce** avant de la recopier : son identifiant
 *     vient du message d'origine, jamais du client ; un blob disparu refuse du
 *     même mot qu'un identifiant inventé.
 *
 * Refusés aussi : un message RETIRÉ, MASQUÉ ou effacé de ma vue (le transfert
 * serait le seul endroit où il survivrait), un message dont l'AUTEUR est
 * bloqué, un message qui n'est pas du texte (un appel, un événement : il
 * annonce un fait de SON fil), un destinataire implicite (la cible est TOUJOURS
 * choisie : un fil 1:1, un groupe, ou une personne du réseau par son
 * identifiant, qui ouvre le fil 1:1 s'il n'existe pas — avec les gardes de
 * `startThreadWithHandle`, dans leur ordre).
 *
 * La copie porte `forwardedFrom` — une PROVENANCE, relue à chaque lecture :
 * l'original retiré emporte la marque.
 */
import { assertMessageContent } from "@antsia/social-contracts/messaging"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { checked, failRule, notFound } from "../../lib/errors"
import { networkMutation } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { isBlockedBetween } from "../graph/graph"
import { liveMembershipOrNull, requireLiveMembership } from "../groups/access"
import { appendGroupMessage, findGroupReplay, isVisibleToMember } from "../groups/messages"
import { findPublishedPersonByHandle } from "../people/miniProfile"
import { type StoredAttachment, verifyDeclaredAttachments } from "./attachmentStorage"
import type { ForwardedFrom } from "./forwardedFrom"
import { assertCanOpenPersonalThread } from "./inbox"
import { isPersonalMessageServedTo, requireThread } from "./participation"
import { appendPersonalMessage, ensurePersonalThread, findIdempotentReplay, otherParticipant } from "./threads"

/** La cible d'un transfert — TOUJOURS explicite, jamais « le dernier fil ». */
const forwardTargetValidator = v.union(
  v.object({ kind: v.literal("personal"), threadId: v.id("personalThreads") }),
  v.object({ kind: v.literal("group"), threadId: v.id("groupThreads") }),
  v.object({ kind: v.literal("handle"), handle: v.string() }),
)

type ForwardTarget = { kind: "personal"; threadId: Id<"personalThreads"> } | { kind: "group"; threadId: Id<"groupThreads"> } | { kind: "handle"; handle: string }

const forwardResultValidator = v.union(
  v.object({ target: v.literal("personal"), threadId: v.id("personalThreads"), messageId: v.id("personalMessages"), createdThread: v.boolean(), deduplicated: v.boolean() }),
  v.object({ target: v.literal("group"), threadId: v.id("groupThreads"), messageId: v.id("groupMessages"), createdThread: v.literal(false), deduplicated: v.boolean() }),
)

type ForwardResult =
  | { target: "personal"; threadId: Id<"personalThreads">; messageId: Id<"personalMessages">; createdThread: boolean; deduplicated: boolean }
  | { target: "group"; threadId: Id<"groupThreads">; messageId: Id<"groupMessages">; createdThread: false; deduplicated: boolean }

type NetworkCtx = MutationCtx & { networkId: Id<"networks">; person: Doc<"persons"> }

/** Ce que la source donne à la copie — relu côté serveur, jamais reçu du client. */
type Payload = { content: string; files: readonly StoredAttachment[]; forwardedFrom: ForwardedFrom; idempotencyKey: string | undefined }

/**
 * Le fil personnel où je suis partie, DANS le réseau appelé. Un fil d'un AUTRE
 * réseau dont je suis partie se refuse explicitement — je le connais, le dire
 * ne révèle rien ; tout le reste est le refus indistinct de la garde du fil.
 */
async function requirePersonalThreadHere(ctx: NetworkCtx, threadId: Id<"personalThreads">): Promise<Doc<"personalThreads">> {
  const thread = await ctx.db.get(threadId)
  if (thread !== null && thread.networkId !== ctx.networkId && otherParticipant(thread, ctx.person._id) !== null) return failRule("MESSAGE_FORWARD_CROSS_NETWORK")
  return (await requireThread(ctx, ctx.networkId, threadId, ctx.person._id)).thread
}

/** Le groupe où je suis membre vivant, DANS le réseau appelé — même règle. */
async function requireGroupHere(ctx: NetworkCtx, threadId: Id<"groupThreads">): Promise<{ thread: Doc<"groupThreads">; member: Doc<"groupMembers"> }> {
  const thread = await ctx.db.get(threadId)
  if (thread !== null && thread.networkId !== ctx.networkId && (await liveMembershipOrNull(ctx, threadId, ctx.person._id)) !== null) return failRule("MESSAGE_FORWARD_CROSS_NETWORK")
  return await requireLiveMembership(ctx, ctx.networkId, threadId, ctx.person._id)
}

/** Les pièces de la source, relues au stockage SANS acteur : une copie n'est pas un dépôt. */
async function copyAttachments(ctx: NetworkCtx, files: readonly StoredAttachment[], source: "message" | "group"): Promise<StoredAttachment[] | undefined> {
  return await verifyDeclaredAttachments(
    ctx,
    files.map((file) => ({ storageId: file.storageId, filename: file.filename, mimeType: file.mimeType, sizeBytes: file.sizeBytes, ...(file.durationMs !== undefined ? { durationMs: file.durationMs } : {}) })),
    { networkId: ctx.networkId, source },
  )
}

/**
 * Livre la copie à sa cible, résolue côté serveur. `personal` : un fil où je
 * suis partie, actif ; `group` : un groupe où je suis membre vivant, ouvert ;
 * `handle` : les gardes de `startThreadWithHandle` mot pour mot — identifiant
 * publié dans le réseau puis blocage (le MÊME refus), soi-même, relation pour un
 * fil NEUF — puis le fil, continué ou créé.
 */
async function deliver(ctx: NetworkCtx, to: ForwardTarget, payload: Payload): Promise<ForwardResult> {
  if (to.kind === "group") {
    const { thread, member } = await requireGroupHere(ctx, to.threadId)
    if (thread.closedAt !== undefined) return failRule("GROUP_CLOSED")
    const replay = await findGroupReplay(ctx, thread._id, payload.idempotencyKey)
    if (replay) return { target: "group", threadId: thread._id, messageId: replay._id, createdThread: false, deduplicated: true }
    const attachmentFiles = await copyAttachments(ctx, payload.files, "group")
    const messageId = await appendGroupMessage(ctx, thread, member, {
      content: payload.content,
      ...(attachmentFiles ? { attachmentFiles } : {}),
      ...(payload.idempotencyKey !== undefined ? { idempotencyKey: payload.idempotencyKey } : {}),
      forwardedFrom: payload.forwardedFrom,
    })
    return { target: "group", threadId: thread._id, messageId, createdThread: false, deduplicated: false }
  }
  let thread: Doc<"personalThreads">
  let created = false
  if (to.kind === "personal") {
    thread = await requirePersonalThreadHere(ctx, to.threadId)
    if (thread.status !== "active") return failRule("THREAD_ARCHIVED")
  } else {
    const found = await findPublishedPersonByHandle(ctx, ctx.networkId, to.handle)
    if (!found) return notFound()
    if (found._id === ctx.person._id) return failRule("THREAD_SELF")
    if (await isBlockedBetween(ctx, ctx.person._id, found._id)) return notFound()
    await assertCanOpenPersonalThread(ctx, ctx.networkId, ctx.person._id, found._id)
    ;({ thread, created } = await ensurePersonalThread(ctx, ctx.networkId, ctx.person._id, found._id))
  }
  const replay = created ? null : await findIdempotentReplay(ctx, thread._id, payload.idempotencyKey)
  if (replay) return { target: "personal", threadId: thread._id, messageId: replay._id, createdThread: false, deduplicated: true }
  const attachmentFiles = await copyAttachments(ctx, payload.files, "message")
  const messageId = await appendPersonalMessage(ctx, thread, {
    senderPersonId: ctx.person._id,
    content: payload.content,
    ...(attachmentFiles ? { attachmentFiles } : {}),
    ...(payload.idempotencyKey !== undefined ? { idempotencyKey: payload.idempotencyKey } : {}),
    forwardedFrom: payload.forwardedFrom,
  })
  return { target: "personal", threadId: thread._id, messageId, createdThread: created, deduplicated: false }
}

/** Débit du transfert ; ouvrir un fil par un transfert reste ouvrir un fil : un seul budget, quel que soit le chemin. */
async function forwardBudget(ctx: NetworkCtx, to: ForwardTarget): Promise<void> {
  await enforceRateLimit(ctx, "message.forward", ctx.person._id)
  if (to.kind === "handle") await enforceRateLimit(ctx, "thread.open", ctx.person._id)
}

/**
 * Transférer un message d'un fil 1:1 vers un fil 1:1, un groupe, ou une
 * personne du réseau. L'écran propose, le serveur décide : participation au
 * fil source, état du message, réseau des deux bouts, existence réelle des
 * pièces et politique de la cible sont rejugés ici.
 */
export const forwardMessage = networkMutation({
  minStatus: "declaree",
  args: { messageId: v.id("personalMessages"), to: forwardTargetValidator, idempotencyKey: v.optional(v.string()) },
  returns: forwardResultValidator,
  handler: async (ctx, args) => {
    await forwardBudget(ctx, args.to)
    const source = await ctx.db.get(args.messageId)
    if (!source) return notFound()
    // Lire la source, c'est être partie à SON fil, sans blocage avec son auteur
    // (dans un fil 1:1, l'auteur est moi ou l'autre participant : la garde du fil suffit).
    const sourceThread = await requirePersonalThreadHere(ctx, source.threadId)
    // MC-01 : un message retiré par la modération, ou que j'ai signalé, ne revit pas ailleurs.
    if (!(await isPersonalMessageServedTo(ctx, source, ctx.person._id))) return notFound()
    if (source.type !== undefined && source.type !== "text") return failRule("MESSAGE_FORWARD_NOT_TEXT")
    if (source.deletedAt !== undefined) return failRule("MESSAGE_FORWARD_UNAVAILABLE")
    const files = source.attachmentFiles ?? []
    const content = checked(() => assertMessageContent(source.content ?? "", files.length > 0))
    return await deliver(ctx, args.to, { content, files, forwardedFrom: { kind: "personal", threadId: sourceThread._id, messageId: source._id }, idempotencyKey: args.idempotencyKey })
  },
})

/**
 * Transférer un message d'un GROUPE — mêmes cibles, mêmes gardes ; la lecture
 * de la source se prouve par l'appartenance VIVANTE au groupe, et le message
 * doit m'être servi (ni d'avant mon arrivée, ni effacé, ni masqué).
 */
export const forwardGroupMessage = networkMutation({
  minStatus: "declaree",
  args: { messageId: v.id("groupMessages"), to: forwardTargetValidator, idempotencyKey: v.optional(v.string()) },
  returns: forwardResultValidator,
  handler: async (ctx, args) => {
    await forwardBudget(ctx, args.to)
    const source = await ctx.db.get(args.messageId)
    if (!source) return notFound()
    const { thread: sourceThread, member } = await requireGroupHere(ctx, source.threadId)
    if (!(await isVisibleToMember(ctx, source, member))) return notFound()
    if (source.type !== "text") return failRule("MESSAGE_FORWARD_NOT_TEXT")
    if (source.deletedAt !== undefined) return failRule("MESSAGE_FORWARD_UNAVAILABLE")
    // Le corps d'un auteur bloqué ne m'est pas servi : il ne revit pas ailleurs.
    if (source.senderPersonId !== ctx.person._id && (await isBlockedBetween(ctx, ctx.person._id, source.senderPersonId))) return failRule("MESSAGE_FORWARD_UNAVAILABLE")
    const files = source.attachmentFiles ?? []
    const content = checked(() => assertMessageContent(source.content ?? "", files.length > 0))
    return await deliver(ctx, args.to, { content, files, forwardedFrom: { kind: "group", threadId: sourceThread._id, messageId: source._id }, idempotencyKey: args.idempotencyKey })
  },
})
