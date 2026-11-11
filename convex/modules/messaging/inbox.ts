// Dupliqué de socle/convex/modules/reseauPersonnel/messagerie.ts @ ad2e7fdc2 — adaptations : la boîte PERSONNELLE d'un réseau seulement — gardés `assertPeutOuvrirFilPersonnel` (connexion DANS le réseau, ou fil existant), `lastMessageKindOf`, `estDansLaBoitePersonnelle`, `lireCote`/`blocageCache`/`pagePersonnelle` (`paginateMyThreads`), `getThread`, `totalUnread`, `findThreadWithHandle`, `startThreadWithHandle` ; `projeterFil` réécrit (sans poste ni « Poste vacant », interlocuteur par le contrat `counterpartLabel`, jamais d'état civil ni d'e-mail) ; exclus : `getPosteThread`, `listMyPosteThreads`, `projeterMesFils`/`listMyThreads` (la page par activité les remplace), `callByHandle` (→ module des appels) ; `totalUnread` lit le compteur, que le BLOCAGE met à jour à l'écriture (D38 : plus de correction à la lecture) ; refus à code ; débit à l'ouverture d'un fil. ; IC-04 : « lu par l'autre » de l'aperçu servi selon la réciprocité des accusés de lecture (`readReceiptsServed`).
/**
 * La boîte de messagerie PERSONNELLE d'un réseau — la surface, pas le stockage.
 *
 * Elle porte la POLITIQUE de la surface : on écrit aux gens de son réseau avec
 * qui l'on est en relation (ou avec qui un fil existe déjà) ; le BLOCAGE ferme
 * la messagerie dans les deux sens, à l'ouverture comme à la lecture.
 */
import type { CounterpartLabel } from "@antsia/social-contracts/counterpart"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { failRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { isBlockedBetween, isConnectedTo } from "../graph/graph"
import { findPublishedPersonByHandle, miniProfileCache } from "../people/miniProfile"
import { attachmentFileValidator } from "./attachmentStorage"
import { counterpartOf, readReceiptsServed } from "./participation"
import { findPersonalThread, openOrContinuePersonalThread, otherParticipant, readPersonalUnreadTotal, unreadForThread } from "./threads"

type ReadCtx = Pick<QueryCtx, "db">

/** Fils rendus par page, et plafond dur. */
const THREADS_DEFAULT = 30
const THREADS_MAX = 50
/** Plafond du décompte de non-lus — « 99+ » au-delà. */
const UNREAD_CAP = 99
/** Tours de fusion au plus par appel : une boîte pleine de fils écartés ne coûte pas une lecture non bornée. */
const PAGE_ROUNDS_MAX = 4

/**
 * Ouvrir un fil PERSONNEL exige une relation acceptée DANS le réseau — sauf si
 * le fil existe déjà (la règle vaut pour l'ouverture, jamais rétroactivement).
 * Être dans le même groupe ne suffit pas.
 */
export async function assertCanOpenPersonalThread(ctx: ReadCtx, networkId: Id<"networks">, me: Id<"persons">, other: Id<"persons">): Promise<void> {
  if ((await findPersonalThread(ctx, networkId, me, other)) !== null) return
  if (await isConnectedTo(ctx, networkId, me, other)) return
  failRule("THREAD_RELATION_REQUIRED")
}

export type LastMessageKind = "text" | "voice" | "attachments" | "call" | "system"

/**
 * La nature d'un message pour l'aperçu : un appel est d'abord un appel ; un son
 * se dit vocal. Repli de la colonne dénormalisée du fil, pour une ligne écrite
 * sans elle (événement d'un autre module).
 */
function lastMessageKindOf(message: Doc<"personalMessages">): LastMessageKind {
  if (message.type === "call_started" || message.type === "call_ended") return "call"
  if (message.type === "system") return "system"
  const files = message.attachmentFiles ?? []
  if (files.some((file) => file.mimeType.toLowerCase().startsWith("audio/"))) return "voice"
  if (files.length > 0) return "attachments"
  return "text"
}

export type ThreadDto = {
  threadId: Id<"personalThreads">
  lastMessageAt: number | null
  /** Le texte de l'aperçu (tronqué) ; `null` pour un vocal ou des pièces seules. */
  lastMessageText: string | null
  lastMessageKind: LastMessageKind | null
  lastMessageAttachmentCount: number | null
  lastMessageByMe: boolean
  lastMessageId: Id<"personalMessages"> | null
  /** MON dernier message a-t-il été lu ? `null` quand le dernier n'est pas de moi ; `false` sans accusés actifs des deux côtés (IC-04). */
  lastMessageReadByCounterpart: boolean | null
  /** La dernière LIGNE a été retirée pour tous. */
  lastMessageDeleted: boolean
  unreadCount: number
  unreadCapped: boolean
  counterpart: CounterpartLabel & { personId: Id<"persons"> }
}

/** Le fil appartient-il à la boîte (hors blocage) ? */
function isInInbox(thread: Doc<"personalThreads">): boolean {
  return thread.status === "active"
}

/** UN fil projeté — le corps partagé par la page et l'accès direct. */
async function projectThread(ctx: QueryCtx, thread: Doc<"personalThreads">, me: Id<"persons">, profileOf: ReturnType<typeof miniProfileCache>): Promise<ThreadDto | null> {
  const other = otherParticipant(thread, me)
  if (other === null) return null
  const [counterpart, unread, last] = await Promise.all([
    counterpartOf(ctx, other, profileOf),
    unreadForThread(ctx, thread, me, UNREAD_CAP),
    ctx.db
      .query("personalMessages")
      .withIndex("by_thread_createdAt", (q) => q.eq("threadId", thread._id))
      .order("desc")
      .first(),
  ])
  return {
    threadId: thread._id,
    lastMessageAt: thread.lastMessageAt ?? null,
    lastMessageText: thread.lastMessageText ?? null,
    // L'aperçu du fil fait foi (il se rembobine au retrait) ; la ligne ne sert que de repli.
    lastMessageKind: thread.lastMessageKind ?? (last === null ? null : lastMessageKindOf(last)),
    lastMessageAttachmentCount: thread.lastMessageAttachmentCount ?? null,
    lastMessageByMe: thread.lastMessageByPersonId === me,
    lastMessageId: last?._id ?? null,
    // IC-04 : réciproque — sans accusés actifs des deux côtés, mon dernier message reste « envoyé ».
    lastMessageReadByCounterpart: last !== null && last.senderPersonId === me ? last.readAt !== undefined && (await readReceiptsServed(ctx, thread, me)) : null,
    lastMessageDeleted: last !== null && last.deletedAt !== undefined,
    unreadCount: unread.count,
    unreadCapped: unread.capped,
    counterpart: { ...counterpart, personId: other },
  }
}

// ═══════════════════════════════════════════════════════════════
// La boîte par activité — pages sans doublon ni trou
// ═══════════════════════════════════════════════════════════════
//
// Un fil 1:1 a deux propriétaires ordonnés : « mes fils » est l'UNION de deux
// plages d'index, fusionnées côté serveur avec un curseur PAR CÔTÉ (le
// `lastMessageAt` et le `_creationTime` de la dernière ligne EXAMINÉE). Quand
// un côté a rendu `limit + 1` lignes, rien de plus ancien que sa dernière ligne
// (la FRONTIÈRE) ne s'examine ce tour. Une ligne écartée fait quand même
// avancer son côté : une page peut rendre moins que `limit`, `isDone` seul
// conclut.

const sideCursorValidator = v.union(v.null(), v.object({ at: v.union(v.number(), v.null()), ct: v.number() }))
const pageCursorValidator = v.object({ low: sideCursorValidator, high: sideCursorValidator })

type SideCursor = { at: number | null; ct: number } | null
export type ThreadsPageCursor = { low: SideCursor; high: SideCursor }
type Side = "low" | "high"
type SortKey = { at: number; ct: number; id: string }

function sortKeyOf(thread: Doc<"personalThreads">): SortKey {
  return { at: thread.lastMessageAt ?? Number.NEGATIVE_INFINITY, ct: thread._creationTime, id: thread._id }
}

/** Négatif quand `x` vient AVANT `y` en activité décroissante. */
function compareActivityDesc(x: SortKey, y: SortKey): number {
  if (x.at !== y.at) {
    if (x.at === Number.NEGATIVE_INFINITY) return 1
    if (y.at === Number.NEGATIVE_INFINITY) return -1
    return y.at - x.at
  }
  if (x.ct !== y.ct) return y.ct - x.ct
  return x.id < y.id ? 1 : x.id > y.id ? -1 : 0
}

/** Jusqu'à `n` lignes d'un côté, APRÈS son curseur, par activité décroissante. */
async function readSide(ctx: ReadCtx, side: Side, networkId: Id<"networks">, me: Id<"persons">, cursor: SideCursor, n: number): Promise<Doc<"personalThreads">[]> {
  const threads = ctx.db.query("personalThreads")
  const head = () =>
    side === "low"
      ? threads.withIndex("by_network_low_lastMessageAt", (q) => q.eq("networkId", networkId).eq("personLow", me))
      : threads.withIndex("by_network_high_lastMessageAt", (q) => q.eq("networkId", networkId).eq("personHigh", me))
  const ties = (at: number | undefined, ct: number) =>
    side === "low"
      ? threads.withIndex("by_network_low_lastMessageAt", (q) => q.eq("networkId", networkId).eq("personLow", me).eq("lastMessageAt", at).lt("_creationTime", ct))
      : threads.withIndex("by_network_high_lastMessageAt", (q) => q.eq("networkId", networkId).eq("personHigh", me).eq("lastMessageAt", at).lt("_creationTime", ct))
  const rest = (at: number) =>
    side === "low"
      ? threads.withIndex("by_network_low_lastMessageAt", (q) => q.eq("networkId", networkId).eq("personLow", me).lt("lastMessageAt", at))
      : threads.withIndex("by_network_high_lastMessageAt", (q) => q.eq("networkId", networkId).eq("personHigh", me).lt("lastMessageAt", at))
  if (cursor === null) return await head().order("desc").take(n)
  // La queue des fils sans activité : plus rien de numérique derrière.
  if (cursor.at === null) return await ties(undefined, cursor.ct).order("desc").take(n)
  const tied = await ties(cursor.at, cursor.ct).order("desc").take(n)
  if (tied.length >= n) return tied
  const older = await rest(cursor.at).order("desc").take(n - tied.length)
  return [...tied, ...older]
}

export type ThreadsPage = { items: ThreadDto[]; nextCursor: ThreadsPageCursor | null; isDone: boolean }

/** MES fils du réseau, PAR PAGES d'activité. Sans `cursor` : la première page. */
export const paginateMyThreads = networkQuery({
  args: { cursor: v.optional(v.union(pageCursorValidator, v.null())), limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<ThreadsPage> => {
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? THREADS_DEFAULT), 1), THREADS_MAX)
    const n = limit + 1
    const me = ctx.person._id
    const blockedCache = new Map<string, boolean>()
    const isBlocked = async (other: Id<"persons">) => {
      const hit = blockedCache.get(other)
      if (hit !== undefined) return hit
      const blocked = await isBlockedBetween(ctx, me, other)
      blockedCache.set(other, blocked)
      return blocked
    }
    let cursorLow: SideCursor = args.cursor?.low ?? null
    let cursorHigh: SideCursor = args.cursor?.high ?? null
    const visible: Doc<"personalThreads">[] = []
    let done = false
    for (let round = 0; round < PAGE_ROUNDS_MAX && visible.length < limit && !done; round += 1) {
      const [rowsLow, rowsHigh] = await Promise.all([readSide(ctx, "low", ctx.networkId, me, cursorLow, n), readSide(ctx, "high", ctx.networkId, me, cursorHigh, n)])
      const moreLow = rowsLow.length === n
      const moreHigh = rowsHigh.length === n
      const frontiers: SortKey[] = []
      if (moreLow) frontiers.push(sortKeyOf(rowsLow[rowsLow.length - 1]!))
      if (moreHigh) frontiers.push(sortKeyOf(rowsHigh[rowsHigh.length - 1]!))
      frontiers.sort(compareActivityDesc)
      const frontier = frontiers[0] ?? null
      const merged = [
        ...rowsLow.map((thread) => ({ thread, side: "low" as Side, key: sortKeyOf(thread) })),
        ...rowsHigh.map((thread) => ({ thread, side: "high" as Side, key: sortKeyOf(thread) })),
      ].sort((x, y) => compareActivityDesc(x.key, y.key))
      let allExamined = true
      for (const entry of merged) {
        if (visible.length >= limit || (frontier !== null && compareActivityDesc(entry.key, frontier) > 0)) {
          allExamined = false
          break
        }
        // Examinée : le côté avance, que la ligne soit rendue ou écartée.
        const sideCursor = { at: entry.thread.lastMessageAt ?? null, ct: entry.thread._creationTime }
        if (entry.side === "low") cursorLow = sideCursor
        else cursorHigh = sideCursor
        if (!isInInbox(entry.thread)) continue
        const other = otherParticipant(entry.thread, me)
        if (other === null || (await isBlocked(other))) continue
        visible.push(entry.thread)
      }
      if (allExamined && !moreLow && !moreHigh) done = true
    }
    const profileOf = miniProfileCache(ctx)
    const items: ThreadDto[] = []
    for (const thread of visible) {
      const dto = await projectThread(ctx, thread, me, profileOf)
      if (dto !== null) items.push(dto)
    }
    return { items, nextCursor: done ? null : { low: cursorLow, high: cursorHigh }, isDone: done }
  },
})

/**
 * UN fil de MA boîte, par son identifiant (lien profond, notification). `null`
 * sans distinguer : fil inconnu, d'autrui, d'un autre réseau, archivé,
 * correspondant bloqué.
 */
export const getThread = networkQuery({
  args: { threadId: v.id("personalThreads") },
  handler: async (ctx, args): Promise<ThreadDto | null> => {
    const thread = await ctx.db.get(args.threadId)
    if (!thread || thread.networkId !== ctx.networkId || !isInInbox(thread)) return null
    const other = otherParticipant(thread, ctx.person._id)
    if (other === null || (await isBlockedBetween(ctx, ctx.person._id, other))) return null
    return await projectThread(ctx, thread, ctx.person._id, miniProfileCache(ctx))
  },
})

/**
 * La pastille de la messagerie dans ce réseau — la lecture la plus souscrite :
 * UN document, tenu par les points d'écriture (le blocage compris).
 */
export const totalUnread = networkQuery({
  args: {},
  returns: v.object({ total: v.number(), capped: v.boolean() }),
  handler: async (ctx) => {
    const total = await readPersonalUnreadTotal(ctx, ctx.networkId, ctx.person._id)
    return total > UNREAD_CAP ? { total: UNREAD_CAP, capped: true } : { total, capped: false }
  },
})

/** Le fil existant avec cet identifiant, ou `null` — ne crée rien. */
export const findThreadWithHandle = networkQuery({
  args: { handle: v.string() },
  handler: async (ctx, args): Promise<{ threadId: Id<"personalThreads"> } | null> => {
    const found = await findPublishedPersonByHandle(ctx, ctx.networkId, args.handle)
    if (!found || found._id === ctx.person._id) return null
    if (await isBlockedBetween(ctx, ctx.person._id, found._id)) return null
    const thread = await findPersonalThread(ctx, ctx.networkId, ctx.person._id, found._id)
    return thread === null || !isInInbox(thread) ? null : { threadId: thread._id }
  },
})

/**
 * Ouvrir un fil en adressant par identifiant. Gardes, dans cet ordre :
 * identifiant publié introuvable dans le réseau, puis blocage — le MÊME refus,
 * pour qu'aucun ne serve d'oracle ; soi-même (explicite) ; la RELATION (seul
 * refus qui s'explique, et seulement pour un fil NEUF).
 */
export const startThreadWithHandle = networkMutation({
  minStatus: "declaree",
  args: { handle: v.string(), initialMessage: v.string(), initialAttachmentFiles: v.optional(v.array(attachmentFileValidator)), idempotencyKey: v.optional(v.string()) },
  returns: v.object({ threadId: v.id("personalThreads"), messageId: v.id("personalMessages"), created: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "thread.open", ctx.person._id)
    const found = await findPublishedPersonByHandle(ctx, ctx.networkId, args.handle)
    if (!found) return notFound()
    if (found._id === ctx.person._id) return failRule("THREAD_SELF")
    if (await isBlockedBetween(ctx, ctx.person._id, found._id)) return notFound()
    await assertCanOpenPersonalThread(ctx, ctx.networkId, ctx.person._id, found._id)
    return await openOrContinuePersonalThread(ctx, {
      network: ctx.network,
      initiatorPersonId: ctx.person._id,
      targetPersonId: found._id,
      initialMessage: args.initialMessage,
      ...(args.idempotencyKey !== undefined ? { idempotencyKey: args.idempotencyKey } : {}),
      ...(args.initialAttachmentFiles !== undefined ? { initialAttachmentFiles: args.initialAttachmentFiles } : {}),
    })
  },
})
