// Dupliqué de socle/convex/modules/direct/access.ts @ ad2e7fdc2 — adaptations : personnes et réseaux — toute garde lit la session DANS son réseau (session inconnue ou d'un autre réseau : le même refus indistinct `notFound`) et la décision d'accès exige d'abord que le lecteur soit membre ACTIF du réseau de la session (V35 : le « compte public » du socle devient l'adhésion ; le fait `readerIsMember` — posé par `directCaller` pour la personne d'un constructeur borné — évite de relire une adhésion déjà prouvée) ; un invité ne franchit son invitation que non effacé et membre actif du réseau (`isInviteeAccountEligible(ctx, networkId, personId)`) ; audience « organisation » → `followers` (V36) : page active du réseau de la session, lecteur ABONNÉ ou SIGNATAIRE VIVANT de la page — l'hôte compris —, et une invitation ne la franchit jamais (`inviteePageRequirement`, `isEligibleDirectInvitee({ followersPage })`, `followsOrSignsPage`) ; lien d'invitation par un fil de GROUPE du moteur (`groupThreads`, membre vivant, même réseau, fil non supprimé — la portée « personnel » / « poste » n'existe plus) ; relations lues dans le réseau de la session ; refus à CODE : `notFound` indistinct (`directNotFound`), `liveRoleRequired` (droit de gestion manquant), règles `LIVE_EXCLUDED` et `LIVE_FULL` (jeton) ; `authorizeToken` : identité de l'ACTION (plus de `authSubject` en argument), réseau en argument, adhésion `declaree`, débit `live.token` (D14), rôle de connexion ET personne rendus, nom affiché du profil PUBLIÉ ou `null` (plus de « Participant ») ; D28 : l'admission n'écrit PLUS la session (ni `viewerGrantCount` ni `viewerPresentCount`) — la capacité se juge sur les présents RECOMPTÉS dans la transaction (`countPresentViewers`, rapatriée ici depuis `reap.ts`, dont la lecture de plage sérialise deux entrées sur la dernière place), la première admission d'une personne s'inscrit dans l'agrégat `engineCounters` (`live.viewerGrants:<session>`, lu par `countViewerGrants`), et les compteurs servis vivent dans `liveSessionCounters` (écrivain unique `reap`, lecture `sessionCountersOf`) ; DL-02 : `authorizeToken` refuse un jeton d'intervenant (hôte excepté) sans accord à l'enregistrement d'un direct enregistré (`LIVE_RECORDING_CONSENT_REQUIRED`).
/**
 * LES gardes du direct — voir une session, la gérer, obtenir un jeton.
 *
 * Toute lecture d'une session passe par `assertVisibleDirectSession` ; toute
 * émission de jeton passe par `authorizeToken`. Un seul chemin, une seule
 * règle — la même doctrine que `posts/access.ts`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FAIL-CLOSED, ET DANS CET ORDRE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `authorizeToken` juge dans l'ordre : ADHÉSION → SESSION LIVE DU RÉSEAU →
 * AUDIENCE → BLOCAGE → EXCLUSION → DÉBIT → RÔLE → CAPACITÉ. Le réveil LiveKit
 * vient APRÈS, dans l'action — aucun jeton n'est construit avant que tout soit
 * validé, et un visiteur refusé ne rallume jamais le serveur.
 *
 * ANTI-ÉNUMÉRATION : session inconnue, d'un autre réseau, terminée, hors
 * audience, blocage — TOUJOURS le même refus (`notFound`). Distinguer
 * apprendrait à un curieux qu'un direct réservé existe. Seuls l'exclu (il a VU
 * le direct pour en être exclu) et la salle comble reçoivent un refus explicite.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DEUX GARDES, DEUX QUESTIONS (D-11, ADR-0144)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `assertVisibleDirectSession` répond « ai-je le droit de VOIR ce direct ? » et
 * refuse indistinctement. `requireDirectPermission` répond « ai-je le droit de
 * FAIRE ceci ici ? » et refuse EXPLICITEMENT (`liveRoleRequired`) — l'appelant a
 * déjà franchi la première, la session n'est plus un secret pour lui.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LES COMPTEURS NE S'ÉCRIVENT PAS ICI (D28)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Au socle, l'admission d'un spectateur réécrivait `direct_sessions`
 * (`viewerGrantCount + 1`, `viewerPresentCount + 1`) : le document que toute la
 * salle regarde, réveillé à chaque entrée. Ici, l'admission n'écrit que SA
 * ligne d'admission (et, la première fois, une entrée de l'agrégat des
 * admissions). La capacité se juge sur les présents RECOMPTÉS dans la
 * transaction : la lecture de la plage des présents entre dans l'ensemble lu
 * de chaque admission, et chacune écrit dans la plage lue par l'autre — deux
 * entrées simultanées sur la dernière place se sérialisent (conflit, rejeu,
 * recompte), sans document partagé. Les nombres SERVIS à l'écran vivent dans
 * `liveSessionCounters`, recomposés par le seul `reap`.
 */
import { DIRECT_MAX_VIEWERS_CAP, DIRECT_PRESENCE_TTL_MS, effectiveReplayVisibility, isReplayPublished, isViewerPresent } from "@antsia/social-domain/live/domain"
import { directPermissionsFor, type DirectPermissionKey, type DirectPermissions } from "@antsia/social-domain/live/permissions"
import { v } from "convex/values"

import { canReadModeratedContent } from "../moderation/policy"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { isActiveMember, requireMembership } from "../../lib/access"
import { fail, failRule, notFound } from "../../lib/errors"
import { enforceRateLimit } from "../../lib/rateLimit"
import { isBlockedBetween, isConnectedTo } from "../graph/graph"
import { liveMembershipOrNull } from "../groups/access"
import { liveSignatoryRole } from "../pages/access"
import { isFollowingPage } from "../pages/follows"
import { publishedMiniProfile } from "../people/miniProfile"
import { engineCounters } from "../posts/counters"
import type { DirectConnectionRole } from "./grants"
import { hasRecordingConsent } from "./recordingConsent"
import { directConnectionRoleValidator } from "./validators"

type ReadCtx = Pick<QueryCtx, "db">

/**
 * QUI lit, et DEPUIS quel réseau. `membershipProven` : l'adhésion active de
 * cette personne au réseau est DÉJÀ prouvée (la personne d'un constructeur
 * borné, `directCaller`) — jamais à poser pour un tiers.
 */
export type DirectReader = {
  networkId: Id<"networks">
  personId: Id<"persons">
  membershipProven?: true
}

/**
 * Le lecteur d'une fonction BORNÉE par le réseau (`networkQuery`,
 * `networkMutation`) : la personne du constructeur, dont l'adhésion au réseau
 * de la fonction est prouvée. Le type exige l'adhésion que seuls ces
 * constructeurs posent dans le contexte.
 */
export function directCaller(ctx: {
  networkId: Id<"networks">
  person: Pick<Doc<"persons">, "_id">
  membership: Pick<Doc<"networkMemberships">, "_id">
}): DirectReader {
  return { networkId: ctx.networkId, personId: ctx.person._id, membershipProven: true }
}

/**
 * Faits déjà lus par une page de découverte. Ils ne sont qu'une optimisation :
 * leur absence fait relire la source indexée, leur présence ne change jamais
 * la règle. Les ensembles sont en clés stringifiées, comme les helpers du
 * graphe qui les produisent.
 */
export type DirectAccessFacts = {
  /** Le lecteur est membre active du réseau de la session, déjà prouvé (constructeur). */
  readerIsMember?: boolean
  connectedHostIds?: ReadonlySet<string>
  blockedHostIds?: ReadonlySet<string>
  /**
   * Les pages que le lecteur SUIT dans le réseau (`pages/follows.followedPageIds`,
   * NON tronqué) — à la place des rattachements validés du socle. Le signataire
   * vivant se relit, lui, par candidat.
   */
  followedPageIds?: ReadonlySet<string>
  /**
   * Les sessions où le lecteur est invité VIVANT (ADR-0150), préchargées par
   * `readerInviteeSessionIds`. Vide si la personne ne peut franchir aucune
   * invitation. Absent : la ligne se relit par candidat.
   */
  inviteeSessionIds?: ReadonlySet<string>
}

/** Une décision distincte permet au jeton de garder l'exclusion explicite. */
export type DirectAccessDecision = "allowed" | "outside_audience" | "blocked" | "banned"

/** Le seul refus indistinct que ce module oppose à propos d'une session. */
export function directNotFound(): never {
  return notFound()
}

/**
 * L'intervenant VIVANT (ligne non rétrogradée) d'une session, ou `null`.
 * L'hôte a toujours sa ligne (créée avec la session).
 */
export async function liveSpeakerRow(ctx: ReadCtx, sessionId: Id<"liveSessions">, personId: Id<"persons">): Promise<Doc<"liveSpeakers"> | null> {
  const row = await ctx.db
    .query("liveSpeakers")
    .withIndex("by_session_person", (q) => q.eq("sessionId", sessionId).eq("personId", personId))
    .unique()
  if (!row || row.removedAt !== undefined) return null
  return row
}

/**
 * La LIGNE d'exclusion, levée ou non — la lecture BRUTE.
 *
 * ⚠️ Réservée aux ÉCRIVAINS (exclure, réintégrer) et aux écrans de gestion.
 * Une garde qui l'appellerait refuserait une personne réintégrée : c'est
 * `banRow` qu'il faut, et elle seule.
 */
export async function banRecord(ctx: ReadCtx, sessionId: Id<"liveSessions">, personId: Id<"persons">): Promise<Doc<"liveBans"> | null> {
  return await ctx.db
    .query("liveBans")
    .withIndex("by_session_banned", (q) => q.eq("sessionId", sessionId).eq("bannedPersonId", personId))
    .unique()
}

/**
 * L'exclusion EN VIGUEUR d'une personne, ou `null`.
 *
 * ⚠️ POINT UNIQUE : la décision d'accès, la promotion, l'antenne et la
 * modération lisent toutes ici — c'est ce qui permet à la réintégration de
 * rouvrir TOUTES les portes d'un coup.
 */
export async function banRow(ctx: ReadCtx, sessionId: Id<"liveSessions">, personId: Id<"persons">): Promise<Doc<"liveBans"> | null> {
  const row = await banRecord(ctx, sessionId, personId)
  if (!row || row.liftedAt !== undefined) return null
  return row
}

/** La sourdine de conversation EN VIGUEUR d'une personne, ou `null`. */
export async function chatMuteRow(ctx: ReadCtx, sessionId: Id<"liveSessions">, personId: Id<"persons">): Promise<Doc<"liveChatMutes"> | null> {
  const row = await chatMuteRecord(ctx, sessionId, personId)
  if (!row || row.liftedAt !== undefined) return null
  return row
}

/** La ligne de sourdine, levée ou non — pour les écrivains et les écrans. */
export async function chatMuteRecord(ctx: ReadCtx, sessionId: Id<"liveSessions">, personId: Id<"persons">): Promise<Doc<"liveChatMutes"> | null> {
  return await ctx.db
    .query("liveChatMutes")
    .withIndex("by_session_person", (q) => q.eq("sessionId", sessionId).eq("personId", personId))
    .unique()
}

/** La délégation de gestion VIVANTE d'une personne sur une session, ou `null`. */
export async function liveDelegationRow(ctx: ReadCtx, sessionId: Id<"liveSessions">, personId: Id<"persons">): Promise<Doc<"liveDelegations"> | null> {
  const row = await delegationRecord(ctx, sessionId, personId)
  if (!row || row.revokedAt !== undefined) return null
  return row
}

/** La ligne de délégation, révoquée ou non — pour les écrivains et la console. */
export async function delegationRecord(ctx: ReadCtx, sessionId: Id<"liveSessions">, personId: Id<"persons">): Promise<Doc<"liveDelegations"> | null> {
  return await ctx.db
    .query("liveDelegations")
    .withIndex("by_session_person", (q) => q.eq("sessionId", sessionId).eq("personId", personId))
    .unique()
}

/**
 * CE QUE CETTE PERSONNE PEUT GÉRER sur CETTE session (D-11, ADR-0144).
 *
 * Deux faits, une matrice pure : titulaire du direct, délégation vivante. Ne
 * lève JAMAIS — c'est la lecture que le DTO sert à l'écran. Le refus, lui, est
 * l'affaire de `requireDirectPermission`.
 */
export async function directPermissionsOf(
  ctx: ReadCtx,
  session: Pick<Doc<"liveSessions">, "_id" | "hostPersonId">,
  personId: Id<"persons">,
): Promise<DirectPermissions> {
  if (session.hostPersonId === personId) {
    return directPermissionsFor({ isHost: true, delegation: null })
  }
  // ⚠️ UNE seule lecture, et c'est tout ce que la matrice demande : le rôle
  // publiant n'y entre pas (`permissions.ts`).
  const delegation = await liveDelegationRow(ctx, session._id, personId)
  return directPermissionsFor({
    isHost: false,
    delegation:
      delegation === null
        ? null
        : {
            kind: delegation.kind,
            canAdmitToStage: delegation.canAdmitToStage,
            canExclude: delegation.canExclude,
            canEndOrTransfer: delegation.canEndOrTransfer,
          },
  })
}

/**
 * LA garde de gestion — un seul point de refus pour les neuf gestes.
 *
 * ⚠️ Elle reçoit une session DÉJÀ CHARGÉE et VUE : chaque point d'entrée garde
 * SON `assertVisibleDirectSession` visible. Le refus est EXPLICITE
 * (`liveRoleRequired`), à la différence de `directNotFound()` : l'appelant SAIT
 * que la session existe.
 */
export async function requireDirectPermission(
  ctx: ReadCtx,
  session: Pick<Doc<"liveSessions">, "_id" | "hostPersonId">,
  personId: Id<"persons">,
  key: DirectPermissionKey,
): Promise<DirectPermissions> {
  const permissions = await directPermissionsOf(ctx, session, personId)
  if (!permissions[key]) return fail("liveRoleRequired")
  return permissions
}

/* ═══════════════════════════════════════════════════════════════════════════
 * LES INVITÉS NOMINATIFS (ADR-0150)
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** La ligne d'invitation, retirée ou non — pour les écrivains et la console. */
export async function inviteeRecord(ctx: ReadCtx, sessionId: Id<"liveSessions">, personId: Id<"persons">): Promise<Doc<"liveInvitees"> | null> {
  return await ctx.db
    .query("liveInvitees")
    .withIndex("by_session_person", (q) => q.eq("sessionId", sessionId).eq("personId", personId))
    .unique()
}

/**
 * L'invitation VIVANTE d'une personne, ou `null`.
 *
 * ⚠️ POINT UNIQUE, comme `banRow` : la décision d'accès, le jeton, le replay et
 * la console lisent tous ici.
 */
export async function liveInviteeRow(ctx: ReadCtx, sessionId: Id<"liveSessions">, personId: Id<"persons">): Promise<Doc<"liveInvitees"> | null> {
  const row = await inviteeRecord(ctx, sessionId, personId)
  if (!row || row.revokedAt !== undefined) return null
  return row
}

/**
 * Cette personne peut-elle FRANCHIR une invitation dans ce réseau ? Non
 * effacée, et membre ACTIVE du réseau — la conférence d'un réseau ne s'ouvre
 * pas à un non-membre par la porte d'une liste (V35).
 *
 * ⚠️ Relu à CHAQUE acte, pas seulement à l'ajout : une personne qui quitte le
 * réseau, ou y est suspendue, cesse de franchir ses invitations, sans
 * qu'aucune ligne ne change.
 */
export async function isInviteeAccountEligible(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">): Promise<boolean> {
  const person = await ctx.db.get(personId)
  if (!person || person.deletionRequestedAt !== undefined) return false
  return await isActiveMember(ctx, networkId, personId)
}

/**
 * Est-il membre VIVANT de ce fil de groupe, dans ce réseau ? Un fil inconnu,
 * d'un autre réseau ou en cours de suppression ne prouve rien — la question
 * est une éligibilité, pas une entrée dans la conversation : `false`, jamais
 * de refus.
 *
 * Un fil de groupe du moteur prouve un lien : on n'y entre que par une
 * relation acceptée avec qui y invite (`groups/access.assertAdmissible`).
 */
async function isLiveThreadMember(ctx: ReadCtx, networkId: Id<"networks">, threadId: Id<"groupThreads">, personId: Id<"persons">): Promise<boolean> {
  const thread = await ctx.db.get(threadId)
  if (!thread || thread.networkId !== networkId || thread.deletingAt !== undefined) return false
  return (await liveMembershipOrNull(ctx, threadId, personId)) !== null
}

/**
 * Cette personne est-elle du CERCLE de la page — abonnée, ou signataire VIVANT
 * (habilitation acceptée, page active, membre active du réseau de la page) ?
 * C'est le public de l'audience `followers`, comme celui de la note aux
 * abonnés d'une publication de page. `followed` : les pages suivies déjà lues
 * (non tronquées), sinon l'abonnement se relit.
 */
export async function followsOrSignsPage(
  ctx: ReadCtx,
  page: Doc<"pages">,
  personId: Id<"persons">,
  followed?: ReadonlySet<string>,
): Promise<boolean> {
  const follows = followed !== undefined ? followed.has(String(page._id)) : await isFollowingPage(ctx, page._id, personId)
  if (follows) return true
  return (await liveSignatoryRole(ctx, page, personId)) !== null
}

/**
 * PEUT-ON inviter cette personne à la conférence de CET hôte ? (ADR-0150.)
 *
 * Toujours : pas l'hôte lui-même, une personne qui peut franchir une invitation
 * dans le réseau, aucun blocage entre les deux, et — si la conférence est
 * réservée aux abonnés d'une page — être du cercle de cette page (une
 * invitation ne franchit jamais l'audience `followers`).
 *
 * Puis UN lien, au choix : une relation ACCEPTÉE avec l'hôte dans le réseau, OU
 * la co-appartenance VIVANTE, avec l'hôte, au fil de groupe d'où la conférence
 * est née.
 *
 * ⚠️ Le lien se juge avec l'HÔTE, jamais avec l'appelant : un délégué convie
 * dans le réseau du titulaire, pas dans le sien (même règle que l'antenne).
 *
 * ⚠️ Rend un booléen, et c'est délibéré : l'appelant oppose un refus
 * INDISTINCT. Dire lequel a manqué apprendrait à l'hôte quelque chose sur le
 * lien entre deux personnes.
 */
export async function isEligibleDirectInvitee(
  ctx: ReadCtx,
  input: {
    networkId: Id<"networks">
    hostPersonId: Id<"persons">
    targetPersonId: Id<"persons">
    sourceThreadId: Id<"groupThreads"> | null
    /** La page dont la conférence exige le cercle — `null` hors audience `followers`. */
    followersPage: Doc<"pages"> | null
  },
): Promise<boolean> {
  if (input.targetPersonId === input.hostPersonId) return false
  if (!(await isInviteeAccountEligible(ctx, input.networkId, input.targetPersonId))) return false
  if (await isBlockedBetween(ctx, input.hostPersonId, input.targetPersonId)) return false
  if (input.followersPage !== null && !(await followsOrSignsPage(ctx, input.followersPage, input.targetPersonId))) return false
  if (await isConnectedTo(ctx, input.networkId, input.hostPersonId, input.targetPersonId)) return true
  if (input.sourceThreadId === null) return false
  return (
    (await isLiveThreadMember(ctx, input.networkId, input.sourceThreadId, input.hostPersonId)) &&
    (await isLiveThreadMember(ctx, input.networkId, input.sourceThreadId, input.targetPersonId))
  )
}

/**
 * La page dont une conférence exige le cercle de ses invités — celle qui la
 * signe pour l'audience `followers`, aucune sinon (`null`).
 *
 * ⚠️ `undefined` = la conférence est réservée aux abonnés d'une page qui n'est
 * plus active (ou n'est pas du réseau de la session) : personne ne peut plus y
 * être convié, et l'appelant doit refuser.
 */
export async function inviteePageRequirement(
  ctx: ReadCtx,
  session: Pick<Doc<"liveSessions">, "audience" | "pageId" | "networkId">,
): Promise<Doc<"pages"> | null | undefined> {
  if (session.audience !== "followers") return null
  if (session.pageId === undefined) return undefined
  const page = await ctx.db.get(session.pageId)
  if (!page || page.status !== "active" || page.networkId !== session.networkId) return undefined
  return page
}

/**
 * Borne de préchargement des invitations d'un lecteur par page de découverte.
 * Au-delà, l'ensemble serait TRONQUÉ : on renonce alors au préchargement et la
 * décision relit la ligne par candidat — plus cher, jamais faux.
 */
const INVITEE_FACTS_SCAN = 200

/**
 * Les sessions où ce lecteur est invité VIVANT dans le réseau — lues UNE fois
 * par page de découverte, sur l'index `by_network_person_revokedAt`.
 *
 * `undefined` = l'ensemble aurait été tronqué : ne pas précharger. Un ensemble
 * VIDE est rendu d'office pour une personne qui ne peut franchir aucune
 * invitation — la règle reste celle de `readerIsLiveInvitee`.
 */
export async function readerInviteeSessionIds(ctx: ReadCtx, reader: DirectReader): Promise<ReadonlySet<string> | undefined> {
  if (!(await isInviteeAccountEligible(ctx, reader.networkId, reader.personId))) return new Set()
  const rows = await ctx.db
    .query("liveInvitees")
    .withIndex("by_network_person_revokedAt", (q) => q.eq("networkId", reader.networkId).eq("personId", reader.personId).eq("revokedAt", undefined))
    .take(INVITEE_FACTS_SCAN + 1)
  if (rows.length > INVITEE_FACTS_SCAN) return undefined
  return new Set(rows.map((row) => String(row.sessionId)))
}

/**
 * Le lecteur est-il invité VIVANT, et peut-il franchir l'invitation ?
 *
 * ⚠️ LA définition de « invité qui franchit » : la décision d'accès, l'exemption
 * du plafond de spectateurs (`authorizeToken`) et le DTO la lisent toutes ici —
 * une ligne d'invité brute ne confère aucun privilège à qui ne peut plus la
 * franchir.
 */
export async function readerIsLiveInvitee(
  ctx: ReadCtx,
  readerPersonId: Id<"persons">,
  session: Pick<Doc<"liveSessions">, "_id" | "networkId">,
  facts?: DirectAccessFacts,
): Promise<boolean> {
  if (facts?.inviteeSessionIds !== undefined) {
    return facts.inviteeSessionIds.has(String(session._id))
  }
  if ((await liveInviteeRow(ctx, session._id, readerPersonId)) === null) return false
  return await isInviteeAccountEligible(ctx, session.networkId, readerPersonId)
}

async function readerIsConnectedToHost(
  ctx: ReadCtx,
  readerPersonId: Id<"persons">,
  session: Pick<Doc<"liveSessions">, "networkId" | "hostPersonId">,
  facts?: DirectAccessFacts,
): Promise<boolean> {
  if (facts?.connectedHostIds !== undefined) {
    return facts.connectedHostIds.has(String(session.hostPersonId))
  }
  return await isConnectedTo(ctx, session.networkId, readerPersonId, session.hostPersonId)
}

async function readerIsBlockedFromHost(ctx: ReadCtx, readerPersonId: Id<"persons">, hostPersonId: Id<"persons">, facts?: DirectAccessFacts): Promise<boolean> {
  if (facts?.blockedHostIds !== undefined) {
    return facts.blockedHostIds.has(String(hostPersonId))
  }
  return await isBlockedBetween(ctx, readerPersonId, hostPersonId)
}

/**
 * Le lecteur est-il du CERCLE de la page qui signe la session (audience
 * `followers`) ? Page absente, retirée ou d'un autre réseau : non — la
 * conférence disparaît alors pour tous, l'hôte compris.
 */
async function readerFollowsSessionPage(
  ctx: ReadCtx,
  readerPersonId: Id<"persons">,
  session: Pick<Doc<"liveSessions">, "pageId" | "networkId">,
  facts?: DirectAccessFacts,
): Promise<boolean> {
  if (session.pageId === undefined) return false
  const page = await ctx.db.get(session.pageId)
  if (!page || page.status !== "active" || page.networkId !== session.networkId) return false
  return await followsOrSignsPage(ctx, page, readerPersonId, facts?.followedPageIds)
}

/**
 * LA décision canonique de visibilité d'une session.
 *
 * Ordre fail-closed : adhésion au réseau de la session (V35) → audience (page
 * active et cercle de la page compris, V36) → blocage → exclusion. L'hôte ne
 * contourne que les liens personnels : une conférence réservée aux abonnés
 * d'une page disparaît aussi pour lui si la page est retirée ou s'il n'en est
 * plus ni abonné ni signataire.
 *
 * ⚠️ L'INVITÉ NOMINATIF (ADR-0150) franchit l'audience `connections` et
 * `invitees` (et `public`, qui n'a rien à franchir) — JAMAIS `followers`, jugée
 * avant lui. Il ne franchit ni le blocage ni l'exclusion, jugés après ; ni un
 * départ du réseau, relu avec sa ligne. Pour `connections`, la relation est
 * testée D'ABORD (ensemble souvent préchargé) : la ligne d'invité n'est lue que
 * pour qui n'est pas en relation.
 */
export async function directSessionAccessDecision(
  ctx: ReadCtx,
  readerPersonId: Id<"persons">,
  session: Doc<"liveSessions">,
  facts?: DirectAccessFacts,
): Promise<DirectAccessDecision> {
  if (!(await canReadModeratedContent(ctx, "live", session._id, readerPersonId))) return "outside_audience"
  if (facts?.readerIsMember !== true && !(await isActiveMember(ctx, session.networkId, readerPersonId))) {
    return "outside_audience"
  }

  if (session.audience === "followers" && !(await readerFollowsSessionPage(ctx, readerPersonId, session, facts))) {
    return "outside_audience"
  }

  const isHost = session.hostPersonId === readerPersonId
  if (isHost) return "allowed"

  if (
    session.audience === "connections" &&
    !(await readerIsConnectedToHost(ctx, readerPersonId, session, facts)) &&
    !(await readerIsLiveInvitee(ctx, readerPersonId, session, facts))
  ) {
    return "outside_audience"
  }
  if (session.audience === "invitees" && !(await readerIsLiveInvitee(ctx, readerPersonId, session, facts))) {
    return "outside_audience"
  }
  if (await readerIsBlockedFromHost(ctx, readerPersonId, session.hostPersonId, facts)) {
    return "blocked"
  }
  if ((await banRow(ctx, session._id, readerPersonId)) !== null) {
    return "banned"
  }
  return "allowed"
}

/**
 * Même décision pour la copie durable. La visibilité du replay peut fermer un
 * direct public aux seules relations ; elle ne peut jamais élargir la session.
 * Toute lecture d'URL et toute vignette replay passent par ici.
 */
export async function directReplayAccessDecision(
  ctx: ReadCtx,
  readerPersonId: Id<"persons">,
  session: Doc<"liveSessions">,
  facts?: DirectAccessFacts,
): Promise<DirectAccessDecision> {
  const sessionDecision = await directSessionAccessDecision(ctx, readerPersonId, session, facts)
  if (sessionDecision !== "allowed") return sessionDecision
  if (session.hostPersonId === readerPersonId) return "allowed"

  /**
   * ⚠️ ADR-0158 — TANT QUE L'HÔTE N'A PAS PUBLIÉ, PERSONNE D'AUTRE NE LIT.
   * `undecided` et `private` referment la lecture à l'audience ENTIÈRE, quelle
   * que soit la visibilité choisie. Le refus est le même que hors audience :
   * indistinct, exprès.
   */
  if (!isReplayPublished(session)) return "outside_audience"

  const visibility = effectiveReplayVisibility(session)
  // `followers` et `invitees` : la décision de session vient d'admettre le
  // lecteur dans ce cercle — le replay lui est réservé, à lui et à l'hôte.
  if (visibility === "public" || visibility === "followers" || visibility === "invitees") {
    return "allowed"
  }
  if (await readerIsConnectedToHost(ctx, readerPersonId, session, facts)) {
    return "allowed"
  }
  // Un replay refermé sur les relations reste ouvert à qui y était INVITÉ
  // (ADR-0150, D) : restreindre la copie durable ne retire pas la personne
  // qu'on avait conviée à l'original.
  return (await readerIsLiveInvitee(ctx, readerPersonId, session, facts)) ? "allowed" : "outside_audience"
}

/**
 * Résout une session ET vérifie que ce lecteur a le droit de la voir
 * MAINTENANT, depuis SON réseau.
 *
 * Même ordre que le jeton (adhésion → audience → blocage → exclusion), sans
 * l'exigence « live » : une page de direct terminé reste visible de son
 * audience (c'est là que vit le replay). Session inconnue ou d'un autre
 * réseau : le refus indistinct. Le lien est relu à l'acte — une relation
 * rompue referme le direct qu'elle ouvrait.
 */
export async function assertVisibleDirectSession(ctx: ReadCtx, reader: DirectReader, sessionId: Id<"liveSessions">): Promise<Doc<"liveSessions">> {
  const session = await ctx.db.get(sessionId)
  if (session === null || session.networkId !== reader.networkId) return directNotFound()
  const decision = await directSessionAccessDecision(ctx, reader.personId, session, {
    readerIsMember: reader.membershipProven === true,
  })
  if (decision !== "allowed") return directNotFound()
  return session
}

/* ═══════════════════════════════════════════════════════════════════════════
 * LES COMPTEURS (D28) — lus ici, écrits par le seul `reap`
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Les compteurs servis d'une session (`liveSessionCounters`). */
export type DirectSessionCounts = {
  viewerGrantCount: number
  viewerPresentCount: number
  commentCount: number
  reactionCount: number
}

/** Les compteurs d'une session ; ligne absente (jamais recomposée) = tout à zéro. */
export async function sessionCountersOf(ctx: ReadCtx, sessionId: Id<"liveSessions">): Promise<DirectSessionCounts> {
  const row = await ctx.db
    .query("liveSessionCounters")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .unique()
  return {
    viewerGrantCount: row?.viewerGrantCount ?? 0,
    viewerPresentCount: row?.viewerPresentCount ?? 0,
    commentCount: row?.commentCount ?? 0,
    reactionCount: row?.reactionCount ?? 0,
  }
}

/** L'espace de noms des admissions d'une session dans l'agrégat : une entrée par personne admise, à vie. */
const viewerGrantsOf = (sessionId: Id<"liveSessions">) => `live.viewerGrants:${sessionId}`

/** Combien de personnes DISTINCTES ont été admises comme spectateurs depuis le début — sans balayage. */
export async function countViewerGrants(ctx: Pick<QueryCtx, "runQuery">, sessionId: Id<"liveSessions">): Promise<number> {
  return await engineCounters.count(ctx, { namespace: viewerGrantsOf(sessionId) })
}

type CountedGrant = Pick<Doc<"liveViewerGrants">, "_id" | "sessionId" | "firstGrantedAt">

/** Inscrit une admission dans l'agrégat (première admission d'une personne). Idempotent. */
export async function recordViewerGrant(ctx: MutationCtx, grant: CountedGrant): Promise<void> {
  await engineCounters.insertIfDoesNotExist(ctx, { namespace: viewerGrantsOf(grant.sessionId), key: grant.firstGrantedAt, id: grant._id })
}

/** Retire une admission de l'agrégat (effacement de la ligne). Idempotent. */
export async function unrecordViewerGrant(ctx: MutationCtx, grant: CountedGrant): Promise<void> {
  await engineCounters.deleteIfExists(ctx, { namespace: viewerGrantsOf(grant.sessionId), key: grant.firstGrantedAt, id: grant._id })
}

/**
 * Les spectateurs EN LIGNE d'une session, comptés par une lecture BORNÉE.
 *
 * ⚠️ Le point de lecture est UNIQUE, partagé par l'admission (`authorizeToken`)
 * et la recomposition (`reap`) : deux lectures différentes, ce serait une salle
 * pleine pour l'un et libre pour l'autre au même instant.
 *
 * ⚠️ Bornée à `DIRECT_MAX_VIEWERS_CAP + 1` (1001) — jamais un `.collect()` : la
 * fenêtre ne contient que les lignes battues dans les 90 dernières secondes,
 * c'est-à-dire de l'ordre de la salle elle-même. La saturer demanderait plus de
 * mille personnes entrées ou sorties d'un même direct en une minute et demie ;
 * le compte serait alors une BORNE BASSE (une admission de trop, jamais un
 * refus injuste), corrigée à la recomposition suivante.
 *
 * `by_session_lastSeenAt` écarte d'emblée les admissions jamais battues (leur
 * `lastSeenAt` absent précède toute borne `.gte`) ; le filtre ne retire plus
 * que les départs volontaires et les baux tout juste expirés.
 */
export async function countPresentViewers(ctx: ReadCtx, sessionId: Id<"liveSessions">, now: number): Promise<number> {
  const rows = await ctx.db
    .query("liveViewerGrants")
    .withIndex("by_session_lastSeenAt", (q) => q.eq("sessionId", sessionId).gte("lastSeenAt", now - DIRECT_PRESENCE_TTL_MS))
    .take(DIRECT_MAX_VIEWERS_CAP + 1)
  return rows.filter((row) => isViewerPresent(row, now)).length
}

/**
 * L'ADMISSION d'un spectateur — sa ligne, et rien d'autre (D28).
 *
 * Trois chemins, et l'ordre compte :
 *  · déjà là (bail vivant) → on rafraîchit SA ligne, sans recompte : redemander
 *    un jeton après une coupure ne consomme rien ;
 *  · revenu (bail expiré ou départ enregistré) → il faut une place, mais la
 *    personne est déjà comptée parmi les admis ;
 *  · nouveau → une place ET une admission de plus (l'agrégat).
 *
 * La capacité se juge sur les présents RECOMPTÉS ici : la plage lue
 * (`countPresentViewers`) est celle où chaque admission écrit, ce qui sérialise
 * deux entrées concurrentes sur la dernière place. Un invité VIVANT qui peut
 * franchir son invitation est EXEMPTÉ du plafond (ADR-0150, C) : on ne convie
 * pas nommément quelqu'un pour lui fermer la porte parce que le public est venu
 * nombreux — sa ligne n'est lue que salle comble.
 *
 * ⚠️ Le jeton POSE le bail (`lastSeenAt`) sans attendre le premier battement :
 * ouvrir une salle prend quelques secondes, et la place doit être tenue pendant
 * ce temps. Un jeton dont la connexion échoue n'est jamais battu — sa place
 * revient d'elle-même au TTL.
 */
async function admitViewer(ctx: MutationCtx, session: Doc<"liveSessions">, personId: Id<"persons">): Promise<void> {
  const now = Date.now()
  const prior = await ctx.db
    .query("liveViewerGrants")
    .withIndex("by_session_person", (q) => q.eq("sessionId", session._id).eq("personId", personId))
    .unique()

  if (prior !== null && isViewerPresent(prior, now)) {
    // `leftAt: undefined` : un onglet fermé puis rouvert dans la minute est un retour.
    await ctx.db.patch(prior._id, { lastGrantedAt: now, lastSeenAt: now, leftAt: undefined })
    return
  }

  const present = await countPresentViewers(ctx, session._id, now)
  if (present >= session.maxViewers && !(await readerIsLiveInvitee(ctx, personId, session))) {
    return failRule("LIVE_FULL")
  }

  if (prior !== null) {
    await ctx.db.patch(prior._id, { lastGrantedAt: now, lastSeenAt: now, leftAt: undefined })
    return
  }
  const grantId = await ctx.db.insert("liveViewerGrants", {
    networkId: session.networkId,
    sessionId: session._id,
    personId,
    firstGrantedAt: now,
    lastGrantedAt: now,
    lastSeenAt: now,
  })
  await recordViewerGrant(ctx, { _id: grantId, sessionId: session._id, firstGrantedAt: now })
}

/**
 * Autorise (ou refuse) l'émission d'un jeton — appelée par l'action du jeton
 * (`livekitActions.requestDirectToken`), JAMAIS exposée au client.
 *
 * La personne est celle de l'IDENTITÉ de l'action (Convex la transmet à
 * `runMutation`), jamais un argument. Rend tout ce que l'action doit savoir, et
 * RIEN d'autre : salle, rôle de connexion, personne (attributs du participant)
 * et nom affiché (`null` sans profil publié : l'action n'en pose pas).
 *
 * C'est une MUTATION interne, pas une query : l'admission d'un spectateur
 * s'écrit dans LA MÊME transaction que l'accord, et le débit s'y consomme.
 */
export const authorizeToken = internalMutation({
  args: { networkId: v.id("networks"), sessionId: v.id("liveSessions") },
  returns: v.object({
    roomName: v.string(),
    role: directConnectionRoleValidator,
    personId: v.id("persons"),
    displayName: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args): Promise<{ roomName: string; role: DirectConnectionRole; personId: Id<"persons">; displayName: string | null }> => {
    // ── 1. ADHÉSION — la personne de la session, membre déclarée du réseau (suspension, départ : refus du constructeur).
    const { person } = await requireMembership(ctx, args.networkId, "declaree")

    // ── 2. SESSION LIVE, DE CE RÉSEAU — inconnue, d'ailleurs ou terminée : le MÊME refus.
    const session = await ctx.db.get(args.sessionId)
    if (!session || session.networkId !== args.networkId || session.status !== "live") return directNotFound()

    // ── 3-5. AUDIENCE → BLOCAGE → EXCLUSION.
    const decision = await directSessionAccessDecision(ctx, person._id, session, { readerIsMember: true })
    // L'exclu a vu le direct pour en être exclu : ce refus peut rester explicite.
    if (decision === "banned") return failRule("LIVE_EXCLUDED")
    if (decision !== "allowed") return directNotFound()

    // ── DÉBIT (D14) — après la visibilité, avant tout réveil du serveur multimédia.
    await enforceRateLimit(ctx, "live.token", person._id)

    // ── 6. RÔLE — la base durable décide : hôte et promus publient, le reste regarde.
    const isHost = session.hostPersonId === person._id
    const speaker = await liveSpeakerRow(ctx, session._id, person._id)
    const role: DirectConnectionRole = isHost || speaker !== null ? "speaker" : "viewer"
    // DL-02 — SECOND VERROU : aucun jeton d'intervenant sans accord à
    // l'enregistrement d'un direct enregistré. Toute montée l'exige déjà
    // (`promoteSpeakerRow`) ; ce verrou tient aussi une ligne d'intervenant
    // antérieure à cet accord. L'hôte en est exempté : il a consenti en
    // cochant « Enregistrer » à la création, qui écrit sa ligne.
    if (role === "speaker" && !isHost && !(await hasRecordingConsent(ctx, session, person._id))) {
      return failRule("LIVE_RECORDING_CONSENT_REQUIRED")
    }

    // ── 7. CAPACITÉ — spectateurs seuls (les intervenants sont bornés à 8 à la promotion).
    if (role === "viewer") await admitViewer(ctx, session, person._id)

    // Le nom affiché vient du profil PUBLIÉ (opt-in) — jamais d'un état civil.
    const profile = await publishedMiniProfile(ctx, person._id)
    return { roomName: session.roomName, role, personId: person._id, displayName: profile.hasPublishedProfile ? profile.displayName : null }
  },
})
