// Dupliqué de socle/convex/modules/direct/comments.ts @ ad2e7fdc2 — adaptations : constructeurs `networkMutation` / `networkQuery`, visibilité par le lecteur du réseau (`assertVisibleDirectSession(ctx, directCaller(ctx), …)` : session inconnue, d'un autre réseau ou hors audience → `notFound` indistinct) ; table `liveComments` (avec `networkId`, copié de la session), personne (`authorPersonId`) au lieu de l'utilisateur ; refus à CODE au lieu des phrases : règles `LIVE_NOT_LIVE`, `LIVE_CHAT_CLOSED`, `LIVE_CHAT_MUTED`, corps jugé au bord du domaine (`checked` : `LIVE_COMMENT_EMPTY`, `LIVE_COMMENT_TOO_LONG{max}`), commentaire inconnu ou d'autrui sans droit de modérer → `notFound` ; débit `live.comment` par `enforceRateLimit` (le limiteur `directComment` du socle, mêmes valeurs ; refus `rateLimited` avec délai, plus de phrase) ; auteur nommé par le profil PUBLIÉ du moteur (`people/miniProfile.miniProfileCache` : nom `null` sans profil publié, que l'écran traduit ; photo par la garde de délivrance) ; DTO `authorPersonId` au lieu d'`authorUserId` ; commentaires rapportés au moteur (compteurs dans `liveSessionCounters`, D28) ; DL-03 (plan 04) : chaque commentaire passe la règle de relecture du réseau (`moderateContentWrite`, surface `liveComment`) comme un commentaire du fil — retenu (`pending_review`), il n'est lu que par son auteur et sort des compteurs ; la file relit la garde commune (`canReadModeratedContent` : décision de retrait, masque du déclarant).
/**
 * Les COMMENTAIRES du direct — persistés, bornés, JAMAIS un canal de données.
 * API publique : `api.modules.live.comments.*`
 *
 * Le spectateur n'a AUCUN canal de données LiveKit (`canPublishData: false`,
 * sources vides) : tout passe par Convex, où la garde d'audience est relue à
 * CHAQUE acte et où le seau `live.comment` borne le débit. Trois conséquences
 * voulues :
 *
 *  · un commentaire SURVIT au direct (il porte `offsetMs`, sa position dans
 *    le replay) ;
 *  · l'écran ne rend que la FILE des 40 derniers (`DIRECT_COMMENTS_WINDOW`),
 *    et l'abonnement est OPT-IN côté client (le panneau fermé ne souscrit
 *    pas) ;
 *  · chaque commentaire passe la RÈGLE DE RELECTURE du réseau (DL-03, surface
 *    `liveComment`), comme un commentaire du fil : retenu, il attend la décision
 *    de la modération, visible de son seul auteur et hors des compteurs ;
 *  · le chemin chaud n'écrit JAMAIS la session ni ses compteurs — les compteurs
 *    agrégés sont l'affaire de l'écrivain unique (`reap.recomputeAggregates`,
 *    D28). Un compteur tenu ici aurait réveillé toutes les souscriptions de la
 *    salle à chaque commentaire ; la fenêtre de recomptage est une BORNE
 *    ANNONCÉE (« 1000+ » à l'écran, `AGGREGATE_COMMENTS_SCAN`) plutôt qu'un
 *    plafond muet.
 */
import { v } from "convex/values"

import type { Id } from "../../_generated/dataModel"
import { checked, failRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { canReadModeratedContent, moderateContentWrite } from "../moderation/policy"
import { miniProfileCache } from "../people/miniProfile"
import { assertVisibleDirectSession, chatMuteRow, directCaller, directPermissionsOf } from "./access"
import { assertDirectCommentBody, DIRECT_COMMENTS_WINDOW } from "./domain"

/** Fenêtre brute balayée (les retirés comptent dans l'index, pas à l'écran). */
const COMMENTS_SCAN = 80

/** Écrire un commentaire — session LIVE, chat OUVERT, débit borné, règle de relecture du réseau (DL-03). */
export const send = networkMutation({
  args: {
    sessionId: v.id("liveSessions"),
    body: v.string(),
  },
  handler: async (ctx, args): Promise<{ commentId: Id<"liveComments"> }> => {
    const session = await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId)
    if (session.status !== "live") return failRule("LIVE_NOT_LIVE")
    if (session.chatMode !== "open") return failRule("LIVE_CHAT_CLOSED")
    // La SOURDINE individuelle (D-11) — à distinguer de la fermeture générale
    // juste au-dessus : ici, une seule personne se tait, et le refus le dit.
    // Elle continue de voir, d'entendre et de réagir.
    if (await chatMuteRow(ctx, session._id, ctx.person._id)) return failRule("LIVE_CHAT_MUTED")

    // Le seau — par personne, pas par session : changer de direct ne remet pas
    // le compteur à zéro.
    await enforceRateLimit(ctx, "live.comment", ctx.person._id)

    const body = checked(() => assertDirectCommentBody(args.body))

    const now = Date.now()
    const commentId = await ctx.db.insert("liveComments", {
      networkId: session.networkId,
      sessionId: session._id,
      authorPersonId: ctx.person._id,
      body,
      status: "published",
      // La position dans le replay — figée à l'écriture, c'est un fait.
      offsetMs: Math.max(0, now - (session.startedAt ?? now)),
      createdAt: now,
    })
    // DL-03 — la règle de relecture du réseau (relecture préalable, mots bloqués, liens, cadence), comme
    // un commentaire du fil (`engagement.comment`) : un commentaire RETENU attend la décision de la
    // modération. Aucun texte n'est copié dans l'état de modération ; seule la ligne du commentaire change.
    const admitted = await moderateContentWrite(ctx, { networkId: session.networkId, ownerPersonId: ctx.person._id, kind: "liveComment", id: commentId, text: body })
    if (!admitted) await ctx.db.patch(commentId, { status: "pending_review" })
    return { commentId }
  },
})

/**
 * Retirer un commentaire. Son AUTEUR le peut toujours ; les autres doivent
 * porter `moderateChat` — l'hôte, ou un délégué (D-11). Idempotent.
 *
 * ⚠️ La matrice est LUE, pas exigée (`directPermissionsOf`, qui ne lève
 * jamais) : un spectateur qui retire SON commentaire ne doit pas se heurter à
 * un refus de permission avant qu'on ait regardé s'il en est l'auteur.
 */
export const remove = networkMutation({
  writeBucket: "live.moderate",
  args: { commentId: v.id("liveComments") },
  handler: async (ctx, args): Promise<{ removed: true }> => {
    const comment = await ctx.db.get(args.commentId)
    if (!comment) return notFound()
    // La session du commentaire, vue DEPUIS ce réseau : d'un autre réseau, elle
    // est introuvable — et le commentaire avec elle.
    const session = await assertVisibleDirectSession(ctx, directCaller(ctx), comment.sessionId)
    const isAuthor = comment.authorPersonId === ctx.person._id
    if (!isAuthor) {
      const permissions = await directPermissionsOf(ctx, session, ctx.person._id)
      // Refus INDISTINCT conservé : sur un commentaire d'autrui, « vous n'avez
      // pas ce droit » apprendrait au curieux que la ligne existe.
      if (!permissions.moderateChat) return notFound()
    }
    if (comment.status === "removed") return { removed: true }
    await ctx.db.patch(comment._id, {
      status: "removed",
      removedAt: Date.now(),
    })
    return { removed: true }
  },
})

export type DirectCommentDto = {
  commentId: Id<"liveComments">
  authorPersonId: Id<"persons">
  /** Le profil PUBLIÉ de l'auteur ; `displayName: null` = nom neutre, que l'écran traduit. */
  author: { displayName: string | null; handle: string | null; avatarUrl: string | null }
  body: string
  offsetMs: number
  createdAt: number
  isMine: boolean
  /**
   * Cette personne est-elle en SOURDINE ? (D-11)
   *
   * ⚠️ Champ ADDITIF, et `false` pour qui n'a pas `moderateChat` : savoir qui a
   * été réduit au silence est une information de modération, pas un état
   * public. Un « (chat coupé) » lisible de toute la salle serait une sanction
   * publique que personne n'a prononcée.
   */
  mutedForChat: boolean
  /**
   * DL-03 — mon commentaire est RETENU pour relecture : je suis seul à le lire.
   * Toujours `false` pour le commentaire d'autrui (un retenu d'autrui n'est jamais servi).
   */
  pendingReview: boolean
}

/**
 * La FILE — les 40 derniers vivants, du plus ancien au plus récent (l'ordre
 * de lecture d'un chat). L'abonnement à cette query est OPT-IN côté client.
 *
 * DL-03 — « vivant » se juge par lecteur, comme au fil : publié et admis par
 * la garde commune (ni retiré par décision, ni masqué pour qui l'a signalé),
 * ou RETENU et écrit par ce lecteur. Les 80 lignes balayées bornent les
 * lectures (deux par ligne au plus).
 */
export const list = networkQuery({
  args: { sessionId: v.id("liveSessions") },
  handler: async (ctx, args): Promise<DirectCommentDto[]> => {
    const session = await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId)

    const rows = await ctx.db
      .query("liveComments")
      .withIndex("by_session_createdAt", (q) => q.eq("sessionId", session._id))
      .order("desc")
      .take(COMMENTS_SCAN)

    const me = ctx.person._id
    const visible: typeof rows = []
    for (const row of rows) {
      if (visible.length >= DIRECT_COMMENTS_WINDOW) break
      const readable = row.status === "published" || (row.status === "pending_review" && row.authorPersonId === me)
      if (readable && (await canReadModeratedContent(ctx, "liveComment", row._id, me))) visible.push(row)
    }
    const live = visible.reverse()

    // La sourdine n'est lue QUE pour un lecteur qui modère, et une seule fois
    // par personne : la fenêtre fait 40 lignes, souvent de dix personnes.
    const canModerate = (await directPermissionsOf(ctx, session, ctx.person._id)).moderateChat
    const mutedCache = new Map<string, boolean>()
    const isMuted = async (personId: Id<"persons">): Promise<boolean> => {
      if (!canModerate) return false
      const key = String(personId)
      const known = mutedCache.get(key)
      if (known !== undefined) return known
      const muted = (await chatMuteRow(ctx, session._id, personId)) !== null
      mutedCache.set(key, muted)
      return muted
    }

    const profileOf = miniProfileCache(ctx)
    const items: DirectCommentDto[] = []
    for (const row of live) {
      const author = await profileOf(row.authorPersonId)
      items.push({
        commentId: row._id,
        authorPersonId: row.authorPersonId,
        author: {
          displayName: author.displayName,
          handle: author.handle,
          avatarUrl: author.avatarUrl,
        },
        body: row.body,
        offsetMs: row.offsetMs,
        createdAt: row.createdAt,
        isMine: row.authorPersonId === me,
        mutedForChat: await isMuted(row.authorPersonId),
        pendingReview: row.status === "pending_review",
      })
    }
    return items
  },
})
