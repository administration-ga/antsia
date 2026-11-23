/**
 * Publications d'EXEMPLE des comptes de démonstration de DIASPORA.GA (CH-817 E4).
 *
 * Les textes, leurs portées, leurs réactions et l'unique commentaire de chacune viennent du
 * domaine (`DIASPORA_GA_DEMO_POSTS`, `@diaspora-ga/domain`) : tout y est fictif et marqué
 * « Démo — ». Ce module les ÉCRIT, à l'équipement de chaque acteur (`demoAccounts.
 * equipMyDemoAccount` planifie `animateActor` après sa transaction), sans graine manuelle :
 * - garde : `demoAccountsAllowed` (développement local ou démonstration déclarée), comme
 *   l'équipement ; ailleurs, production comprise, rien ne s'écrit ;
 * - l'auteur est le compte réservé de l'acteur (`personOfActor` : adresse vérifiée), vivant,
 *   au nom affiché du catalogue (« Prénom NOM », normalisé), au statut EFFECTIF déclaré ou
 *   vérifié (une suspension de la racine vaut partout), sans sanction : « nouveau » et
 *   « leger » ne publient rien ;
 * - une publication s'écrit par le point d'écriture du moteur (`writePost` : invariants,
 *   relecture de modération, diffusion vers les fils, décomptes), audience `public`,
 *   visibilité `network`, dans `diaspora-ga` seulement : jamais à la racine. Portée et pays
 *   comme le composeur (jugés par le domaine, puis la règle de placement de la tranche ; une
 *   publication locale exige un pays ouvert). Au nom d'une page : seulement si les pages sont
 *   ouvertes, par les gardes de la publication de page (page active du réseau, signataire
 *   VIVANT, pays de la page), puis la diffusion aux abonnés, comme `pages.publishAsPage` ;
 * - clé d'idempotence du domaine sur `by_author_and_idempotencyKey` : une publication déjà
 *   écrite, RETIRÉE comprise, n'est jamais recréée ;
 * - réactions et commentaire entre acteurs, posés dès que les deux comptes existent, quel que
 *   soit l'ordre d'équipement (le motif de `ensureDemoBlocks`) : l'animation d'un acteur écrit
 *   ce qui l'implique — ses publications, celles où il réagit ou commente — dès que l'autre
 *   compte est prêt ; jamais entre deux comptes bloqués, jamais sans la garde de lecture,
 *   jamais sur une publication retirée ou retenue en relecture ; un commentaire retiré n'est
 *   jamais recréé. Compteurs par les écrivains du moteur (fragments de réactions, agrégat des
 *   commentaires), relecture de modération du commentaire.
 *
 * Débit : comme la graine de la racine (`convex/seeds/demoContent.ts`), cette écriture INTERNE ne
 * consomme pas les seaux par membre des gestes (`post.publish`, `page.publish`,
 * `reaction.toggle`, `comment.create`) : le budget du visiteur reste entier, et l'écriture est
 * bornée par le catalogue fixe, idempotente, déclenchée par un équipement lui-même limité
 * (`person.write`). La modération des écritures réelles n'est pas touchée : chaque publication et
 * chaque commentaire passent par la même relecture. Aucune cloche pour une réaction ni un
 * commentaire de démonstration (comme la graine) ; la publication de page prévient ses abonnés.
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { normalizeCivilName } from "@antsia/social-domain/civilName"
import { assertPersonalCommentBody, assertPostContent, assertPostReach, PERSONAL_POST_STATUSES, REACH_REQUIRING_COUNTRY } from "@antsia/social-domain/content"
import { assertPageHandle } from "@antsia/social-domain/pages"
import {
  DIASPORA_GA_DEMO_ACTOR_SPECS,
  type DiasporaGaDemoActor,
  type DiasporaGaDemoPost,
  diasporaGaDemoPostIdempotencyKey,
  diasporaGaDemoPostsInvolving,
  type EngineReactionKind,
} from "@diaspora-ga/domain"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../_generated/server"
import { demoAccountsAllowed } from "../../lib/devTools"
import { checked } from "../../lib/errors"
import { isNetworkFeatureOpen } from "../../lib/networkFeatures"
import { isBlockedBetween } from "../graph/graph"
import { assertSocialWriteAllowed, contentState, moderateContentWrite } from "../moderation/policy"
import { enqueueFanout } from "../notifications/fanout"
import { requireManagedPage } from "../pages/access"
import { assertPostDiscussionOpen, canSeePostDoc } from "../posts/access"
import { applyReactionDelta, recordComment } from "../posts/counters"
import { assertPostPlacement, placementOf } from "../posts/placement"
import { writePost } from "../posts/postWrite"
import { demoActorValidator, diasporaGaNetwork, personOfActor } from "./demoAccounts"
import { effectiveStatusIn } from "./facts"

/** Commentaires racines relus au plus, par statut, pour savoir si l'acteur a déjà commenté. */
const ROOT_COMMENTS_SCAN = 200

type Placement = { reach?: string; country?: string }
type ReadyActors = Map<DiasporaGaDemoActor, Doc<"persons"> | null>
export type AnimationResult = { postsCreated: number; reactionsCreated: number; commentsCreated: number }

/** Une garde du moteur posée en question : `false` sur un refus du moteur (code d'erreur connu) ; toute autre erreur remonte. */
async function passes(guard: () => Promise<unknown>): Promise<boolean> {
  try {
    await guard()
    return true
  } catch (error) {
    if (engineErrorCode(error) !== null) return false
    throw error
  }
}

/** Le nom affiché du catalogue, « Prénom NOM », passé par le normaliseur partagé des noms de personnes. */
function catalogueDisplayName(actor: DiasporaGaDemoActor): string | null {
  const profile = DIASPORA_GA_DEMO_ACTOR_SPECS[actor].profile
  if (profile === null) return null
  const name = normalizeCivilName({ firstName: profile.givenNames, lastName: profile.familyName })
  return `${name.firstName} ${name.lastName}`
}

/**
 * L'acteur PRÊT à écrire dans le réseau, ou `null` : son compte réservé (adresse vérifiée), vivant,
 * sous le nom affiché du catalogue (un compte renommé n'écrit plus rien au nom de la démonstration),
 * au statut EFFECTIF déclaré ou vérifié, sans sanction en cours. Lu une fois par animation.
 */
async function readyActor(ctx: MutationCtx, network: Doc<"networks">, actor: DiasporaGaDemoActor, cache: ReadyActors): Promise<Doc<"persons"> | null> {
  if (cache.has(actor)) return cache.get(actor) ?? null
  let ready: Doc<"persons"> | null = null
  const person = await personOfActor(ctx, actor)
  if (person && person.deletionRequestedAt === undefined && person.erasedAt === undefined && person.displayName === catalogueDisplayName(actor)) {
    const { status } = await effectiveStatusIn(ctx, network, person._id)
    if ((status === "declaree" || status === "verifiee") && (await passes(() => assertSocialWriteAllowed(ctx, network._id, person._id)))) ready = person
  }
  cache.set(actor, ready)
  return ready
}

/** Une publication locale ne va que dans un pays ouvert (la garde du composeur, tant que la règle de la tranche ne la porte pas). */
function inOpenCountry(network: Doc<"networks">, placed: Placement): boolean {
  if (placed.reach !== REACH_REQUIRING_COUNTRY) return true
  return placed.country !== undefined && (network.openCountries ?? []).includes(placed.country)
}

/** La portée et le pays d'une publication personnelle, tels que le composeur les envoie, jugés par le domaine. */
function personalPlacement(network: Doc<"networks">, entry: DiasporaGaDemoPost): Placement {
  const { reach, country } = entry.scope
  return checked(() => assertPostReach({ reach, ...(country !== undefined ? { country } : {}), reachValues: network.reachValues }))
}

/** Celle d'une publication de page (`pages.placePagePost`) : le pays de la PAGE pour une publication locale, aucun pour `diaspora`. */
function pagePlacement(network: Doc<"networks">, page: Doc<"pages">, entry: DiasporaGaDemoPost): Placement | null {
  const reach = entry.scope.reach
  if (reach === REACH_REQUIRING_COUNTRY && page.country === undefined) return null
  const country = reach === REACH_REQUIRING_COUNTRY ? page.country : undefined
  return checked(() => assertPostReach({ reach, ...(country !== undefined ? { country } : {}), reachValues: network.reachValues }))
}

/**
 * La page de la démonstration de l'auteur, sous les gardes de la publication de page : créée par
 * lui dans ce réseau (comme `ensureDemoPage`), active, et lui signataire VIVANT
 * (`requireManagedPage`, « signatory » : un modérateur de page ne parle pas en son nom).
 */
async function demoPageOf(ctx: MutationCtx, network: Doc<"networks">, author: Doc<"persons">, actor: DiasporaGaDemoActor): Promise<Doc<"pages"> | null> {
  const spec = DIASPORA_GA_DEMO_ACTOR_SPECS[actor].page
  if (spec === null) return null
  const handle = checked(() => assertPageHandle(spec.handle))
  const page = await ctx.db.query("pages").withIndex("by_handle", (q) => q.eq("handle", handle)).unique()
  if (!page || page.networkId !== network._id || page.createdByPersonId !== author._id) return null
  if (!(await passes(() => requireManagedPage(ctx, { networkId: network._id, personId: author._id }, page._id, "signatory")))) return null
  return page
}

/**
 * La publication d'exemple, retrouvée par sa clé ou écrite par `writePost` ; `null` si elle ne
 * peut pas l'être maintenant (pages fermées, page absente, pays fermé, placement refusé) — un
 * prochain équipement la reprendra. Une publication déjà écrite, retirée comprise, est rendue
 * telle quelle : jamais recréée. Une clé portée ailleurs que dans ce réseau n'est jamais reprise.
 */
async function ensureDemoPost(
  ctx: MutationCtx,
  network: Doc<"networks">,
  entry: DiasporaGaDemoPost,
  author: Doc<"persons">,
  pagesOpen: boolean,
): Promise<{ post: Doc<"posts">; created: boolean } | null> {
  const idempotencyKey = diasporaGaDemoPostIdempotencyKey(entry)
  const existing = await ctx.db
    .query("posts")
    .withIndex("by_author_and_idempotencyKey", (q) => q.eq("authorPersonId", author._id).eq("idempotencyKey", idempotencyKey))
    .unique()
  if (existing) return existing.networkId === network._id ? { post: existing, created: false } : null

  const body = checked(() => assertPostContent({ body: entry.body, mediaCount: 0, isShare: false }))
  let page: Doc<"pages"> | null = null
  let placed: Placement | null
  if (entry.author === "page") {
    if (!pagesOpen) return null
    page = await demoPageOf(ctx, network, author, entry.actor)
    if (!page) return null
    placed = pagePlacement(network, page, entry)
  } else {
    placed = personalPlacement(network, entry)
  }
  if (!placed || !inOpenCountry(network, placed)) return null
  const placement = placed
  if (!(await passes(() => assertPostPlacement(ctx, { network, authorPersonId: author._id, page, ...placementOf(placement) })))) return null

  // Audience publique, visibilité `network` : la publication reste dans DIASPORA.GA (jamais `root`).
  const { postId } = await writePost(ctx, {
    network,
    authorPersonId: author._id,
    body,
    audience: "public",
    visibility: entry.visibility,
    ...placement,
    idempotencyKey,
    ...(page ? { pageId: page._id } : {}),
  })
  // Comme `pages.publishAsPage` : c'est la page qui parle, ses abonnés sont prévenus par lots, chacun re-gardé.
  if (page) await enqueueFanout(ctx, { networkId: page.networkId, kind: "page_post", subject: { post: postId }, source: { kind: "pageFollowers", postId } })
  const post = await ctx.db.get(postId)
  return post ? { post, created: true } : null
}

/** La publication est-elle en ligne : publiée, non retirée, ni retenue ni retirée par la modération ? */
async function isLive(ctx: MutationCtx, post: Doc<"posts">): Promise<boolean> {
  if (post.status !== "published" || post.removedAt !== undefined) return false
  const state = await contentState(ctx, "post", post._id)
  return state === null || state.status === "published"
}

/** Les deux comptes peuvent-ils interagir ici : distincts, non bloqués, et le lecteur voit la publication ? */
async function mayEngage(ctx: MutationCtx, network: Doc<"networks">, post: Doc<"posts">, author: Doc<"persons">, reader: Doc<"persons">): Promise<boolean> {
  if (reader._id === author._id || (await isBlockedBetween(ctx, reader._id, author._id))) return false
  return await canSeePostDoc(ctx, { personId: reader._id, network }, post)
}

/** La réaction déclarée, une seule par personne et par publication : une réaction existante (de tout genre) n'est jamais remplacée. */
async function reactOnce(ctx: MutationCtx, network: Doc<"networks">, post: Doc<"posts">, author: Doc<"persons">, reactor: Doc<"persons">, kind: EngineReactionKind): Promise<boolean> {
  if (!(await mayEngage(ctx, network, post, author, reactor))) return false
  const existing = await ctx.db.query("postReactions").withIndex("by_post_and_person", (q) => q.eq("postId", post._id).eq("personId", reactor._id)).unique()
  if (existing) return false
  await ctx.db.insert("postReactions", { networkId: post.networkId, postId: post._id, personId: reactor._id, kind, createdAt: Date.now() })
  await applyReactionDelta(ctx, post._id, reactor._id, kind, 1)
  return true
}

/** L'acteur a-t-il déjà un commentaire racine sous cette publication, retiré compris ? Lecture bornée par statut. */
async function hasRootComment(ctx: MutationCtx, postId: Id<"posts">, personId: Id<"persons">): Promise<boolean> {
  for (const status of PERSONAL_POST_STATUSES) {
    const rows = await ctx.db
      .query("postComments")
      .withIndex("by_post_parent_status_createdAt", (q) => q.eq("postId", postId).eq("parentCommentId", undefined).eq("status", status))
      .take(ROOT_COMMENTS_SCAN)
    if (rows.some((row) => row.authorPersonId === personId)) return true
  }
  return false
}

/** Le commentaire déclaré, une fois : discussion ouverte, relecture de modération, agrégat des commentaires. Retiré, il n'est jamais recréé. */
async function commentOnce(ctx: MutationCtx, network: Doc<"networks">, post: Doc<"posts">, author: Doc<"persons">, commenter: Doc<"persons">, text: string): Promise<boolean> {
  if (!(await mayEngage(ctx, network, post, author, commenter))) return false
  if (!(await passes(() => assertPostDiscussionOpen(ctx, post)))) return false
  if (await hasRootComment(ctx, post._id, commenter._id)) return false
  const body = checked(() => assertPersonalCommentBody(text))
  const now = Date.now()
  const commentId = await ctx.db.insert("postComments", { networkId: post.networkId, postId: post._id, authorPersonId: commenter._id, body, status: "published", createdAt: now, updatedAt: now })
  const admitted = await moderateContentWrite(ctx, { networkId: post.networkId, ownerPersonId: commenter._id, kind: "comment", id: commentId, text: body })
  if (admitted) await recordComment(ctx, { _id: commentId, postId: post._id, createdAt: now })
  return true
}

/**
 * Anime un acteur : ses publications d'exemple, puis, sur chaque publication qui l'implique, les
 * réactions et le commentaire des acteurs déjà prêts. Planifiée par l'équipement (et, pour le
 * filleul déclaré par son parrain, par l'équipement du parrain). Idempotente : rejouée, elle ne
 * double rien ; chaque écriture repasse ses gardes. Rend ce qu'elle a écrit cette fois-ci.
 */
export const animateActor = internalMutation({
  args: { actor: demoActorValidator },
  returns: v.object({ postsCreated: v.number(), reactionsCreated: v.number(), commentsCreated: v.number() }),
  handler: async (ctx, { actor }): Promise<AnimationResult> => {
    const result: AnimationResult = { postsCreated: 0, reactionsCreated: 0, commentsCreated: 0 }
    if (!demoAccountsAllowed()) return result
    const network = await diasporaGaNetwork(ctx)
    // Défense en profondeur : une publication de démonstration n'est jamais écrite à la racine.
    if (!network || network.kind === "root") return result
    const ready: ReadyActors = new Map()
    // L'acteur animé n'est pas prêt (nouveau, léger, suspendu, hors du réseau) : rien ne s'écrit pour lui.
    if (!(await readyActor(ctx, network, actor, ready))) return result
    const pagesOpen = await isNetworkFeatureOpen(ctx, network, "pages")
    for (const entry of diasporaGaDemoPostsInvolving(actor)) {
      const author = await readyActor(ctx, network, entry.actor, ready)
      if (!author) continue
      const outcome = await ensureDemoPost(ctx, network, entry, author, pagesOpen)
      if (!outcome) continue
      if (outcome.created) result.postsCreated += 1
      if (!(await isLive(ctx, outcome.post))) continue
      for (const reaction of entry.reactions) {
        const reactor = await readyActor(ctx, network, reaction.actor, ready)
        if (reactor && (await reactOnce(ctx, network, outcome.post, author, reactor, reaction.kind))) result.reactionsCreated += 1
      }
      if (entry.comment) {
        const commenter = await readyActor(ctx, network, entry.comment.actor, ready)
        if (commenter && (await commentOnce(ctx, network, outcome.post, author, commenter, entry.comment.body))) result.commentsCreated += 1
      }
    }
    return result
  },
})
