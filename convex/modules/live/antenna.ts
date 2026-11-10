// Dupliqué de socle/convex/modules/direct/antenna.ts @ ad2e7fdc2 — adaptations : personnes et réseaux — constructeurs `networkQuery`/`networkMutation`, lecteur `directCaller` (un tiers est jugé depuis le réseau de la session, adhésion relue : V35), cibles `targetPersonId`/`personIds`, tables `liveAntennaRequests`/`liveAntennaInvitations`/`liveViewerGrants`/`liveSpeakers` (`networkId` copié de la session sur chaque ligne, champs `inviterPersonId`/`inviteePersonId`), DTO en `personId` ; constantes pures (`ANTENNA_STATE_SCAN`, état d'invitation `AntennaInviteState`, réexporté) importées de `@antsia/social-domain/live/antenna`, réponse de l'hôte par `directAntennaResponseValidator` ; relations lues DANS le réseau de la session (y compris la page de candidats, index `by_network_low_status`/`by_network_high_status`), identifiant public résolu dans ce réseau ; compte « actif » = personne non effacée (`deletionRequestedAt`) ; cible invitable à l'antenne = membre DÉCLARÉE du réseau de la session (`lib/access.memberHasStatus`, comme les appels) — un membre en attente, ou qui n'est plus membre actif, rend `no_profile` : non proposé par `searchInviteCandidates`, invitation refusée du même code, aucune cloche ; nom affiché du profil PUBLIÉ, `null` sans profil (l'écran traduit le nom neutre) ; débits `live.antennaRequest` (par personne) et `live.antennaInvite` (par hôte) qui lèvent `rateLimited` ; cloche `live_antenna_invite` sur le sujet `liveSession` par `notifyPerson`, résolue par `resolveNotifications` ; instant de lecture des quatre queries (`myState`, `hostState`, `searchInviteCandidates`, `inviteStatesForUsers`) fourni par l'écran (`now`, D16) ; refus à CODE de règle (`LIVE_ENDED`, `LIVE_ALREADY_ON_STAGE`, `LIVE_JOIN_AS_VIEWER_FIRST`, `LIVE_HAND_NOT_RECEIVABLE`, `LIVE_ANTENNA_NOT_INVITABLE`, `LIVE_INVITATION_EXPIRED`, `LIVE_INVITATION_NOT_RECEIVABLE`, `LIVE_HOST_STAYS_ON_STAGE`, `LIVE_NOT_ON_STAGE`) et refus de droit `liveRoleRequired` (garde de la fondation) au lieu des phrases ; commentaires rapportés au moteur ; DL-02 : accord à l'enregistrement — `acceptRecording` (débit `live.recordingConsent`, refus `LIVE_ENDED`, `LIVE_NO_RECORDING`), exigé avant la main levée et à toute montée (`LIVE_RECORDING_CONSENT_REQUIRED`).
/**
 * Antenne participative d'un DIRECT : mains levées et invitations explicites.
 * API publique : `api.modules.live.antenna.*`
 *
 * Deux faits durables, deux tables :
 *  · la DEMANDE appartient au spectateur déjà admis dans la salle ;
 *  · l'INVITATION appartient à une relation que l'hôte adresse par handle.
 *
 * Accepter ne transforme jamais le JWT viewer courant. La transaction ouvre
 * d'abord `liveSpeakers`, puis le SFU expulse uniquement les anciennes
 * identités viewer. Le participant demande ensuite un NOUVEAU jeton speaker.
 */
import { ANTENNA_STATE_SCAN, type AntennaInviteState } from "@antsia/social-domain/live/antenna"
import { paginationOptsValidator, type PaginationResult } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { memberHasStatus } from "../../lib/access"
import { failRule } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { isBlockedBetween, isConnectedTo } from "../graph/graph"
import { notifyPerson, resolveNotifications } from "../notifications/notify"
import { findPublishedPersonByHandle, miniProfileCache, type PersonMiniProfile, publishedMiniProfile } from "../people/miniProfile"
import {
  assertVisibleDirectSession,
  banRow,
  directCaller,
  directNotFound,
  type DirectReader,
  directSessionAccessDecision,
  liveSpeakerRow,
  requireDirectPermission,
} from "./access"
import { effectiveDirectInvitationStatus } from "./domain"
import { DIRECT_MAX_SPEAKERS } from "./grants"
import { promoteConsentingSpeakerInvitee } from "./invitees"
import { assertRecordingConsent, recordingConsentRow, writeRecordingConsent } from "./recordingConsent"
import { demoteSpeakerRow, promoteSpeakerRow } from "./speakers"
import { directAntennaResponseValidator } from "./validators"

/**
 * L'état d'une personne vis-à-vis d'une invitation — vocabulaire UNIQUE,
 * défini une fois dans le domaine (`@antsia/social-domain/live/antenna`), source
 * du validateur `directAntennaInviteStateValidator` : deux listes de littéraux
 * divergeraient au premier ajout. Réexporté ici, là où le socle l'exportait.
 */
export type { AntennaInviteState }

type ReadCtx = Pick<QueryCtx, "db" | "storage">
type WriteCtx = Pick<MutationCtx, "db" | "storage" | "scheduler">
type RequestStatus = Doc<"liveAntennaRequests">["status"]
type InvitationStatus = Doc<"liveAntennaInvitations">["status"]

type AntennaProfile = {
  /** `null` = nom neutre (profil non publié) : l'écran le traduit. */
  displayName: string | null
  handle: string | null
  avatarUrl: string | null
}

function toAntennaProfile(profile: PersonMiniProfile): AntennaProfile {
  return {
    displayName: profile.displayName,
    handle: profile.handle,
    avatarUrl: profile.avatarUrl,
  }
}

async function assertLiveAudience(ctx: ReadCtx, reader: DirectReader, sessionId: Id<"liveSessions">): Promise<Doc<"liveSessions">> {
  const session = await assertVisibleDirectSession(ctx, reader, sessionId)
  if (session.status !== "live") {
    return failRule("LIVE_ENDED")
  }
  return session
}

async function assertActiveTarget(ctx: Pick<QueryCtx, "db">, personId: Id<"persons">): Promise<Doc<"persons">> {
  const person = await ctx.db.get(personId)
  if (!person || person.deletionRequestedAt !== undefined) {
    return directNotFound()
  }
  return person
}

async function viewerGrantRow(ctx: Pick<QueryCtx, "db">, sessionId: Id<"liveSessions">, personId: Id<"persons">): Promise<Doc<"liveViewerGrants"> | null> {
  return await ctx.db
    .query("liveViewerGrants")
    .withIndex("by_session_person", (q) => q.eq("sessionId", sessionId).eq("personId", personId))
    .unique()
}

/**
 * La console de l'hôte — tenue par LUI, et parfois seulement pendant le live.
 *
 * ⚠️ Ce helper ne CHARGE PAS la session, et ce n'est pas un oubli : chaque
 * point d'entrée appelle `assertVisibleDirectSession` lui-même, sous les yeux
 * du lecteur. Envelopper la garde d'entrée dans un helper local la rendrait
 * invisible sans rien retirer au code — le pire des deux mondes.
 */
function assertHostConsole(session: Doc<"liveSessions">, personId: Id<"persons">, opts: { requireLive: boolean }): Doc<"liveSessions"> {
  if (session.hostPersonId !== personId) directNotFound()
  if (opts.requireLive && session.status !== "live") directNotFound()
  return session
}

/**
 * La console de l'ANTENNE — l'hôte, ou un délégué portant `admitToStage`.
 *
 * ⚠️ Elle remplace `assertHostConsole` sur les gestes d'ANTENNE (accepter une
 * main, inviter, retirer une invitation), pas sur les lectures qui exposent le
 * RÉSEAU de l'hôte : `searchInviteCandidates` et `inviteStatesForUsers`
 * continuent d'exiger l'hôte lui-même. La liste des relations de quelqu'un est
 * un fait social, et l'éligibilité se juge sur le lien avec l'HÔTE — un
 * délégué y verrait ses propres relations toutes marquées « pas connectée ».
 *
 * ⚠️ Le refus n'est plus le même selon la cause, et c'est voulu : hors live,
 * `directNotFound()` (rien à gérer, la console n'a pas d'objet) ; sans droit,
 * `liveRoleRequired` — l'appelant voit la session, il lui manque un droit, pas
 * une page.
 */
async function assertAntennaConsole(
  ctx: ReadCtx,
  session: Doc<"liveSessions">,
  personId: Id<"persons">,
  opts: { requireLive: boolean },
): Promise<Doc<"liveSessions">> {
  await requireDirectPermission(ctx, session, personId, "admitToStage")
  if (opts.requireLive && session.status !== "live") directNotFound()
  return session
}

/**
 * PEUT-ON inviter cette personne, et sinon POURQUOI — la décision unique.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * UNE SEULE RÈGLE, DEUX LECTEURS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ces conditions vivaient dans le `if` géant d'`inviteByHandle` : l'écran ne
 * pouvait donc RIEN en savoir avant d'essayer, et proposait des personnes que
 * le serveur refusait ensuite sans motif. Extraites ici, elles servent aussi
 * bien la mutation (qui refuse) que la console (qui grise la ligne et le dit).
 *
 * ⚠️ L'ÉLIGIBILITÉ ne s'élargit pas d'un pouce (ADR-0061) : relation acceptée
 * obligatoire, audience relue, blocage et exclusion relus, profil publié et
 * adhésion DÉCLARÉE exigés. La seule chose qui change est qu'on sait DIRE
 * lequel a manqué — et le client regroupe les trois refus sensibles sous un
 * libellé unique.
 *
 * ⚠️ Cette décision ne parle QUE d'éligibilité. Ce qui est déjà ENGAGÉ
 * (invitation en cours, main levée) est une intention, pas un droit : la
 * fusion se fait dans `searchInviteCandidates`, pas ici — sans quoi
 * `inviteUser` refuserait de rejouer une invitation, alors que le rejeu est
 * idempotent depuis le premier jour.
 */
async function assertInvitableTarget(
  ctx: ReadCtx,
  session: Doc<"liveSessions">,
  hostId: Id<"persons">,
  targetPersonId: Id<"persons">,
  profile?: { hasPublishedProfile: boolean },
): Promise<{ state: AntennaInviteState }> {
  if (String(targetPersonId) === String(hostId)) return { state: "self" }

  const person = await ctx.db.get(targetPersonId)
  if (!person || person.deletionRequestedAt !== undefined) {
    return { state: "no_profile" }
  }
  // Le profil PUBLIÉ était exigé par construction (on invitait par handle) :
  // inviter par identifiant ne doit pas ouvrir une porte de plus.
  const resolved = profile ?? (await publishedMiniProfile(ctx, targetPersonId))
  if (!resolved.hasPublishedProfile) return { state: "no_profile" }
  // On ne fait pas sonner qui ne pourra jamais répondre : accepter — et le jeton
  // qui suit — exige une adhésion DÉCLARÉE au réseau de la session. Un membre en
  // attente voit la conférence, il n'y agit pas encore (même aide que les appels,
  // `memberHasStatus`). Il rejoint l'état d'un compte absent, AVANT l'audience :
  // la console ne le propose pas, l'invitation le refuse du même code que tout
  // autre refus, sans en dire la raison.
  if (!(await memberHasStatus(ctx, session.networkId, targetPersonId, "declaree"))) {
    return { state: "no_profile" }
  }

  const decision = await directSessionAccessDecision(ctx, targetPersonId, session)
  if (decision !== "allowed") return { state: decision }
  if (!(await isConnectedTo(ctx, session.networkId, hostId, targetPersonId))) {
    return { state: "not_connected" }
  }
  if (await isBlockedBetween(ctx, hostId, targetPersonId)) {
    return { state: "blocked" }
  }
  if (await banRow(ctx, session._id, targetPersonId)) return { state: "banned" }
  if (await liveSpeakerRow(ctx, session._id, targetPersonId)) {
    return { state: "on_stage" }
  }
  return { state: "eligible" }
}

async function invitationRow(ctx: Pick<QueryCtx, "db">, sessionId: Id<"liveSessions">, personId: Id<"persons">): Promise<Doc<"liveAntennaInvitations"> | null> {
  return await ctx.db
    .query("liveAntennaInvitations")
    .withIndex("by_session_invitee", (q) => q.eq("sessionId", sessionId).eq("inviteePersonId", personId))
    .unique()
}

/**
 * L'ÉCRITURE d'une invitation — la seule, partagée par les deux points
 * d'entrée (`inviteUser` et `inviteByHandle`). Elle ne juge rien : l'appelant
 * a déjà tenu `assertAntennaConsole` et `assertInvitableTarget`.
 *
 * ⚠️ Rejouer une invitation ENCORE OUVERTE ne consomme ni quota ni cloche.
 * Une invitation expirée, elle, n'est plus ouverte : la rejouer REPART (même
 * ligne, `updatedAt` remis à maintenant) — l'hôte relance quelqu'un qui n'a
 * jamais répondu, ce n'est pas un doublon.
 */
async function openInvitation(
  ctx: MutationCtx,
  session: Doc<"liveSessions">,
  hostId: Id<"persons">,
  targetPersonId: Id<"persons">,
): Promise<{
  invitationId: Id<"liveAntennaInvitations">
  pending: true
}> {
  const now = Date.now()
  const existing = await invitationRow(ctx, session._id, targetPersonId)
  if (existing && effectiveDirectInvitationStatus(existing, now) === "pending") {
    return { invitationId: existing._id, pending: true }
  }

  // Par HÔTE : un cohôte invite au nom du titulaire, sur le même seau.
  await enforceRateLimit(ctx, "live.antennaInvite", hostId)

  let invitationId: Id<"liveAntennaInvitations">
  if (existing) {
    await ctx.db.patch(existing._id, {
      status: "pending",
      inviterPersonId: hostId,
      updatedAt: now,
    })
    invitationId = existing._id
  } else {
    invitationId = await ctx.db.insert("liveAntennaInvitations", {
      networkId: session.networkId,
      sessionId: session._id,
      inviterPersonId: hostId,
      inviteePersonId: targetPersonId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    })
  }
  await notifyPerson(ctx, {
    networkId: session.networkId,
    recipientPersonId: targetPersonId,
    actorPersonId: hostId,
    kind: "live_antenna_invite",
    subject: { liveSession: session._id },
  })
  return { invitationId, pending: true }
}

/**
 * Relit tout ce qui rend une main encore recevable. L'admission spectateur
 * prouve une entrée passée ; l'audience, le compte et la modération sont relus
 * maintenant, depuis le réseau de la session, car aucun droit social n'est
 * hérité d'hier.
 */
async function assertReceivableRequest(
  ctx: WriteCtx,
  networkId: Id<"networks">,
  sessionId: Id<"liveSessions">,
  personId: Id<"persons">,
): Promise<Doc<"liveSessions">> {
  const session = await assertLiveAudience(ctx, { networkId, personId }, sessionId)
  await assertActiveTarget(ctx, personId)
  if (!(await viewerGrantRow(ctx, sessionId, personId))) {
    return failRule("LIVE_HAND_NOT_RECEIVABLE")
  }
  return session
}

/**
 * Une promotion satisfait toutes les intentions encore ouvertes de la même
 * personne. Sans cette jonction, accepter une invitation pouvait laisser sa
 * main dans la file de l'hôte (et réciproquement) alors qu'elle était déjà à
 * l'antenne.
 *
 * C'est aussi le point UNIQUE où une invitation passe `accepted` — la réponse
 * à l'invitation, la main acceptée par l'hôte, « déjà à l'antenne » y passent
 * tous : la cloche `live_antenna_invite` s'y résout (CH-094), dans la même
 * transaction, sans quoi elle proposerait encore « Accepter » à qui parle déjà.
 */
async function settlePendingIntentsAsAccepted(
  ctx: Pick<MutationCtx, "db">,
  session: Pick<Doc<"liveSessions">, "_id" | "networkId">,
  personId: Id<"persons">,
  updatedAt: number,
): Promise<void> {
  const [request, invitation] = await Promise.all([
    ctx.db
      .query("liveAntennaRequests")
      .withIndex("by_session_person", (q) => q.eq("sessionId", session._id).eq("personId", personId))
      .unique(),
    invitationRow(ctx, session._id, personId),
  ])
  if (request?.status === "pending") {
    await ctx.db.patch(request._id, { status: "accepted", updatedAt })
  }
  if (invitation?.status === "pending") {
    await ctx.db.patch(invitation._id, { status: "accepted", updatedAt })
    await resolveNotifications(ctx, {
      networkId: session.networkId,
      recipientPersonId: personId,
      kind: "live_antenna_invite",
      subject: { liveSession: session._id },
      resolution: "accepted",
      at: updatedAt,
    })
  }
}

/** Lever MA main — spectateur déjà admis, une ligne par session/personne. */
export const raiseHand = networkMutation({
  args: { sessionId: v.id("liveSessions") },
  handler: async (ctx, args): Promise<{ requestId: Id<"liveAntennaRequests">; pending: true }> => {
    const session = await assertLiveAudience(ctx, directCaller(ctx), args.sessionId)
    if (session.hostPersonId === ctx.person._id || (await liveSpeakerRow(ctx, session._id, ctx.person._id))) {
      return failRule("LIVE_ALREADY_ON_STAGE")
    }
    if (!(await viewerGrantRow(ctx, session._id, ctx.person._id))) {
      return failRule("LIVE_JOIN_AS_VIEWER_FIRST")
    }
    // DL-02 — demander la parole dans un direct ENREGISTRÉ, c'est demander à y
    // être enregistré : l'accord vient AVANT la main, pour que l'hôte ne reçoive
    // jamais une main qu'il ne pourrait pas accepter (`promoteSpeakerRow` exige
    // le même accord au moment de la montée).
    await assertRecordingConsent(ctx, session, ctx.person._id)

    const existing = await ctx.db
      .query("liveAntennaRequests")
      .withIndex("by_session_person", (q) => q.eq("sessionId", session._id).eq("personId", ctx.person._id))
      .unique()
    // Rejouer la même intention active ne consomme ni quota ni écriture.
    if (existing?.status === "pending") {
      return { requestId: existing._id, pending: true }
    }

    // Par PERSONNE : changer de direct ne contourne pas la limite.
    await enforceRateLimit(ctx, "live.antennaRequest", ctx.person._id)

    const now = Date.now()
    if (existing) {
      await ctx.db.patch(existing._id, { status: "pending", updatedAt: now })
      return { requestId: existing._id, pending: true }
    }
    const requestId = await ctx.db.insert("liveAntennaRequests", {
      networkId: session.networkId,
      sessionId: session._id,
      personId: ctx.person._id,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    })
    return { requestId, pending: true }
  },
})

/** Annuler MA main — live seulement, idempotent si elle n'est plus active. */
export const cancelHand = networkMutation({
  writeBucket: "live.leave",
  args: { sessionId: v.id("liveSessions") },
  handler: async (ctx, args): Promise<{ cancelled: boolean }> => {
    const session = await assertLiveAudience(ctx, directCaller(ctx), args.sessionId)
    if (await liveSpeakerRow(ctx, args.sessionId, ctx.person._id)) {
      await settlePendingIntentsAsAccepted(ctx, session, ctx.person._id, Date.now())
      return { cancelled: false }
    }
    const row = await ctx.db
      .query("liveAntennaRequests")
      .withIndex("by_session_person", (q) => q.eq("sessionId", args.sessionId).eq("personId", ctx.person._id))
      .unique()
    if (!row || row.status !== "pending") return { cancelled: false }
    await ctx.db.patch(row._id, {
      status: "cancelled",
      updatedAt: Date.now(),
    })
    return { cancelled: true }
  },
})

export type MyAntennaState = {
  live: boolean
  request: {
    requestId: Id<"liveAntennaRequests">
    status: RequestStatus
  } | null
  invitation: {
    invitationId: Id<"liveAntennaInvitations">
    status: InvitationStatus
  } | null
  shouldJoinAsSpeaker: boolean
}

/**
 * MON état uniquement — jamais la file ni l'identité d'un tiers.
 *
 * `now` : l'instant de lecture, fourni par l'écran (arrondi par lui : la
 * souscription reste cachable) — c'est lui qui fait passer une invitation
 * sans réponse à `expired`, sans qu'aucune écriture n'ait lieu.
 */
export const myState = networkQuery({
  args: { sessionId: v.id("liveSessions"), now: v.number() },
  handler: async (ctx, args): Promise<MyAntennaState> => {
    const session = await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId)
    const [request, invitation, speaker] = await Promise.all([
      ctx.db
        .query("liveAntennaRequests")
        .withIndex("by_session_person", (q) => q.eq("sessionId", args.sessionId).eq("personId", ctx.person._id))
        .unique(),
      invitationRow(ctx, args.sessionId, ctx.person._id),
      liveSpeakerRow(ctx, args.sessionId, ctx.person._id),
    ])
    return {
      live: session.status === "live",
      request: request ? { requestId: request._id, status: request.status } : null,
      // Le statut EFFECTIF, jamais celui de la ligne : une invitation
      // périmée doit cesser de proposer « Accepter » sans attendre qu'une
      // écriture passe par là.
      invitation: invitation
        ? {
            invitationId: invitation._id,
            status: effectiveDirectInvitationStatus(invitation, args.now),
          }
        : null,
      shouldJoinAsSpeaker: session.status === "live" && speaker !== null && session.hostPersonId !== ctx.person._id,
    }
  },
})

export type HostAntennaState = {
  status: Doc<"liveSessions">["status"]
  requests: {
    requestId: Id<"liveAntennaRequests">
    personId: Id<"persons">
    profile: AntennaProfile
  }[]
  invitations: {
    invitationId: Id<"liveAntennaInvitations">
    status: InvitationStatus
    personId: Id<"persons">
    profile: AntennaProfile
  }[]
  speakers: {
    personId: Id<"persons">
    isHost: boolean
    profile: AntennaProfile
  }[]
}

/**
 * La console de l'antenne — bornée, filtrée à nouveau au moment de la lecture.
 *
 * ⚠️ Le NOM reste `hostState` : des écrans et cinq fichiers de test l'appellent
 * ainsi. Ce qui a changé le 2026-09-07, c'est le lecteur : l'hôte, ou un
 * délégué portant `admitToStage`.
 */
export const hostState = networkQuery({
  args: { sessionId: v.id("liveSessions"), now: v.number() },
  handler: async (ctx, args): Promise<HostAntennaState> => {
    const session = await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId)
    await requireDirectPermission(ctx, session, ctx.person._id, "admitToStage")

    const rows = await ctx.db
      .query("liveAntennaRequests")
      .withIndex("by_session_status_updatedAt", (q) => q.eq("sessionId", session._id).eq("status", "pending"))
      .order("desc")
      .take(ANTENNA_STATE_SCAN)
    const requests: HostAntennaState["requests"] = []
    for (const row of rows) {
      try {
        // Le demandeur est relu depuis le réseau de la session : adhésion,
        // audience, blocage et exclusion, comme s'il demandait maintenant.
        await assertLiveAudience(ctx, { networkId: session.networkId, personId: row.personId }, session._id)
        await assertActiveTarget(ctx, row.personId)
        if (!(await viewerGrantRow(ctx, session._id, row.personId))) continue
        // Une promotion issue de l'API Direct historique peut précéder la
        // réponse Antenne. Ne jamais laisser un speaker dans la file viewer.
        if (await liveSpeakerRow(ctx, session._id, row.personId)) continue
        requests.push({
          requestId: row._id,
          personId: row.personId,
          profile: toAntennaProfile(await publishedMiniProfile(ctx, row.personId)),
        })
      } catch {
        // Une rupture d'accès retire silencieusement la cible de la console.
      }
    }

    // Cinq lectures indexées et bornées : l'hôte voit aussi les réponses ET
    // ce qu'il a retiré, sans transformer cette console en historique sans
    // fin. L'HISTORIQUE n'est pas la CAPACITÉ : aucune de ces lignes ne prend
    // une place à l'antenne, qui se compte sur `liveSpeakers` vivants.
    // ⚠️ Le groupe `expired` est lu bien que RIEN ne l'écrive aujourd'hui
    // (l'expiration est dérivée, cf. `domain.ts`) : une ligne posée par un
    // seed ou une migration doit rester visible plutôt que disparaître.
    const invitationGroups = await Promise.all(
      (["pending", "accepted", "declined", "revoked", "expired"] as const).map((status) =>
        ctx.db
          .query("liveAntennaInvitations")
          .withIndex("by_session_status_updatedAt", (q) => q.eq("sessionId", session._id).eq("status", status))
          .order("desc")
          .take(ANTENNA_STATE_SCAN),
      ),
    )
    const invitationRows = invitationGroups
      .flat()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, ANTENNA_STATE_SCAN)
    const invitations: HostAntennaState["invitations"] = []
    for (const row of invitationRows) {
      const person = await ctx.db.get(row.inviteePersonId)
      if (
        !person ||
        person.deletionRequestedAt !== undefined ||
        (await directSessionAccessDecision(ctx, row.inviteePersonId, session)) !== "allowed" ||
        // ⚠️ Le lien jugé est celui de l'HÔTE, jamais celui du lecteur : un
        // délégué verrait sinon disparaître toutes les invitations envoyées
        // à des relations qu'il ne partage pas.
        !(await isConnectedTo(ctx, session.networkId, session.hostPersonId, row.inviteePersonId)) ||
        (await isBlockedBetween(ctx, session.hostPersonId, row.inviteePersonId)) ||
        (await banRow(ctx, session._id, row.inviteePersonId))
      ) {
        continue
      }
      invitations.push({
        invitationId: row._id,
        status: effectiveDirectInvitationStatus(row, args.now),
        personId: row.inviteePersonId,
        profile: toAntennaProfile(await publishedMiniProfile(ctx, row.inviteePersonId)),
      })
    }

    const speakerRows = await ctx.db
      .query("liveSpeakers")
      .withIndex("by_session_removedAt", (q) => q.eq("sessionId", session._id).eq("removedAt", undefined))
      .take(DIRECT_MAX_SPEAKERS)
    const speakers: HostAntennaState["speakers"] = []
    for (const row of speakerRows) {
      if ((await directSessionAccessDecision(ctx, row.personId, session)) !== "allowed") {
        continue
      }
      speakers.push({
        personId: row.personId,
        isHost: row.role === "host",
        profile: toAntennaProfile(await publishedMiniProfile(ctx, row.personId)),
      })
    }

    return { status: session.status, requests, invitations, speakers }
  },
})

/** Accepter/refuser une main — permission `admitToStage`, atomique avec le rôle. */
export const respondToRequest = networkMutation({
  writeBucket: "live.respond",
  args: {
    requestId: v.id("liveAntennaRequests"),
    response: directAntennaResponseValidator,
  },
  handler: async (ctx, args): Promise<{ changed: boolean; promoted: boolean }> => {
    const row = await ctx.db.get(args.requestId)
    if (!row) return directNotFound()
    const session = await assertVisibleDirectSession(ctx, directCaller(ctx), row.sessionId)
    await requireDirectPermission(ctx, session, ctx.person._id, "admitToStage")
    if (row.status !== "pending") {
      return { changed: false, promoted: false }
    }

    // Même pour refuser, relire la session : aucune transition ne survit à
    // la fin du direct et une cible devenue invisible sort silencieusement.
    const liveSession = await assertReceivableRequest(ctx, session.networkId, session._id, row.personId)
    if (await liveSpeakerRow(ctx, liveSession._id, row.personId)) {
      await settlePendingIntentsAsAccepted(ctx, liveSession, row.personId, Date.now())
      return { changed: true, promoted: false }
    }
    if (args.response === "declined") {
      await ctx.db.patch(row._id, {
        status: "declined",
        updatedAt: Date.now(),
      })
      return { changed: true, promoted: false }
    }

    const promoted = await promoteSpeakerRow(ctx, liveSession, row.personId)
    await settlePendingIntentsAsAccepted(ctx, liveSession, row.personId, Date.now())
    return { changed: true, promoted }
  },
})

/** Le refus opposé à une invitation impossible — UN seul code, exprès. */
function cannotInvite(): never {
  return failRule("LIVE_ANTENNA_NOT_INVITABLE")
}

/**
 * Inviter une relation par IDENTIFIANT — le point d'entrée de la console.
 *
 * C'est la même invitation qu'`inviteByHandle`, sans le détour par le handle :
 * la console choisit une LIGNE (elle connaît déjà l'identifiant), plus une
 * chaîne à ressaisir. Les règles sont exactement les mêmes, tenues au même
 * endroit (`assertInvitableTarget`), et le refus reste INDISTINCT — l'écran
 * sait déjà pourquoi, par `searchInviteCandidates`, et n'a pas besoin que le
 * code le lui apprenne.
 */
export const inviteUser = networkMutation({
  args: {
    sessionId: v.id("liveSessions"),
    targetPersonId: v.id("persons"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    invitationId: Id<"liveAntennaInvitations">
    pending: true
  }> => {
    const session = await assertAntennaConsole(ctx, await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId), ctx.person._id, { requireLive: true })
    // ⚠️ L'éligibilité se juge sur le lien avec l'HÔTE (ADR-0061), pas avec
    // l'appelant : un cohôte invite les relations du titulaire du direct.
    const decision = await assertInvitableTarget(ctx, session, session.hostPersonId, args.targetPersonId)
    if (decision.state !== "eligible") cannotInvite()
    return await openInvitation(ctx, session, session.hostPersonId, args.targetPersonId)
  },
})

/**
 * Inviter une relation publiée par HANDLE — jamais une présence LiveKit.
 * Une ligne pending rejouée est idempotente et ne rafraîchit pas la cloche.
 *
 * ⚠️ EXPORT CONSERVÉ (des écrans et des tests l'appellent) : il ne fait plus
 * que résoudre le handle — dans le réseau de la session —, puis passer par la
 * MÊME décision et la MÊME écriture qu'`inviteUser`. Deux chemins d'invitation
 * qui jugeraient séparément finiraient par diverger — c'est exactement ce
 * qu'on retire ici.
 */
export const inviteByHandle = networkMutation({
  args: { sessionId: v.id("liveSessions"), handle: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    invitationId: Id<"liveAntennaInvitations">
    pending: true
  }> => {
    const session = await assertAntennaConsole(ctx, await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId), ctx.person._id, { requireLive: true })
    const found = await findPublishedPersonByHandle(ctx, session.networkId, args.handle)
    if (!found) return cannotInvite()
    const decision = await assertInvitableTarget(ctx, session, session.hostPersonId, found._id)
    if (decision.state !== "eligible") cannotInvite()
    return await openInvitation(ctx, session, session.hostPersonId, found._id)
  },
})

/**
 * RETIRER une invitation encore ouverte — l'hôte change d'avis, et cela ne
 * doit pas s'afficher comme un refus de l'invité.
 *
 * Idempotente : une invitation déjà répondue, retirée ou périmée n'est pas
 * réécrite (`changed: false`). Rien n'est libéré au passage — une invitation
 * n'a jamais tenu de place.
 *
 * La cloche de l'invité se résout `cancelled` dans la même transaction
 * (CH-094) : une offre retirée ne doit plus proposer « Accepter ».
 */
export const revokeInvitation = networkMutation({
  writeBucket: "live.manage",
  args: { invitationId: v.id("liveAntennaInvitations") },
  handler: async (ctx, args): Promise<{ changed: boolean }> => {
    const row = await ctx.db.get(args.invitationId)
    if (!row) return directNotFound()
    const session = await assertAntennaConsole(ctx, await assertVisibleDirectSession(ctx, directCaller(ctx), row.sessionId), ctx.person._id, { requireLive: false })
    const now = Date.now()
    const status = effectiveDirectInvitationStatus(row, now)
    if (status !== "pending") return { changed: false }
    await ctx.db.patch(row._id, { status: "revoked", updatedAt: now })
    await resolveNotifications(ctx, {
      networkId: session.networkId,
      recipientPersonId: row.inviteePersonId,
      kind: "live_antenna_invite",
      subject: { liveSession: row.sessionId },
      resolution: "cancelled",
      at: now,
    })
    return { changed: true }
  },
})

/** Une personne proposée à l'antenne, telle que la console la rend. */
export type AntennaInviteCandidate = {
  personId: Id<"persons">
  /** `null` = nom neutre (profil non publié) : l'écran le traduit. */
  displayName: string | null
  handle: string | null
  avatarUrl: string | null
  headline: string | null
  state: AntennaInviteState
  /** L'invitation en cours, quand il y en a une — pour la retirer. */
  invitationId: Id<"liveAntennaInvitations"> | null
}

/**
 * L'INTENTION déjà exprimée par-dessus l'éligibilité.
 *
 * Ordre volontaire : une invitation vivante (envoyée, acceptée, refusée) prime
 * sur une main levée, parce que c'est le geste de l'HÔTE et que c'est celui
 * qu'il doit pouvoir retirer. Une invitation retirée ou périmée ne dit plus
 * rien : la personne redevient invitable, et c'est précisément la différence
 * entre l'historique et la capacité.
 */
function overlayIntent(
  state: AntennaInviteState,
  invitation: Doc<"liveAntennaInvitations"> | null,
  request: Doc<"liveAntennaRequests"> | null,
  now: number,
): { state: AntennaInviteState; invitationId: Id<"liveAntennaInvitations"> | null } {
  if (state !== "eligible") {
    return { state, invitationId: null }
  }
  const status = invitation ? effectiveDirectInvitationStatus(invitation, now) : null
  if (invitation && status === "pending") {
    return { state: "invited_pending", invitationId: invitation._id }
  }
  if (invitation && status === "accepted") {
    return { state: "invited_accepted", invitationId: invitation._id }
  }
  if (request?.status === "pending") {
    return { state: "hand_raised", invitationId: null }
  }
  if (invitation && status === "declined") {
    return { state: "invited_declined", invitationId: invitation._id }
  }
  return { state: "eligible", invitationId: null }
}

async function candidateFor(
  ctx: ReadCtx,
  session: Doc<"liveSessions">,
  hostId: Id<"persons">,
  targetPersonId: Id<"persons">,
  profileOf: ReturnType<typeof miniProfileCache>,
  now: number,
): Promise<AntennaInviteCandidate> {
  const profile = await profileOf(targetPersonId)
  const base = await assertInvitableTarget(ctx, session, hostId, targetPersonId, profile)
  const [invitation, request] = await Promise.all([
    invitationRow(ctx, session._id, targetPersonId),
    ctx.db
      .query("liveAntennaRequests")
      .withIndex("by_session_person", (q) => q.eq("sessionId", session._id).eq("personId", targetPersonId))
      .unique(),
  ])
  const merged = overlayIntent(base.state, invitation, request, now)
  return {
    personId: targetPersonId,
    displayName: profile.displayName,
    handle: profile.handle,
    avatarUrl: profile.avatarUrl,
    headline: profile.headline,
    state: merged.state,
    invitationId: merged.invitationId,
  }
}

/** Le terme de recherche, appliqué au NOM et à l'identifiant, sans casse. */
function matchesCandidateQuery(candidate: AntennaInviteCandidate, needle: string): boolean {
  if (needle.length === 0) return true
  return (candidate.displayName ?? "").toLowerCase().includes(needle) || (candidate.handle ?? "").toLowerCase().includes(needle)
}

/**
 * QUI l'hôte peut inviter — une page de ses relations DANS le réseau de la
 * session, avec leur état.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI UNE QUERY DE PLUS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La console tirait un annuaire conçu pour les GROUPES, borné à 200, trié par
 * nom, sans recherche et sans état — et le collait dans un `<datalist>`.
 * Au-delà de 200 relations, la 201ᵉ n'existait plus ; et rien à l'écran ne
 * distinguait une personne invitable d'une personne déjà à l'antenne, déjà
 * invitée ou exclue.
 *
 * ⚠️ UNE seule `.paginate()` par exécution (règle Convex) : le côté de la
 * paire canonique est un ARGUMENT. Le client tient les deux curseurs et
 * fusionne.
 *
 * ⚠️ Le filtre `query` s'applique DANS la page : une page peut donc revenir
 * courte, voire vide, sans que la liste soit finie (`isDone` fait foi). C'est
 * le prix d'une source ordonnée par lien, et c'est ce qui garde la lecture
 * bornée.
 *
 * ⚠️ Hôte SEUL : la liste des relations de quelqu'un est un fait social. Le
 * refus est celui de tout le module — indistinct.
 */
export const searchInviteCandidates = networkQuery({
  args: {
    sessionId: v.id("liveSessions"),
    side: v.union(v.literal("low"), v.literal("high")),
    query: v.string(),
    now: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args): Promise<PaginationResult<AntennaInviteCandidate>> => {
    const session = assertHostConsole(await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId), ctx.person._id, { requireLive: false })
    // Hors live, il n'y a personne à inviter — et le dire par une page vide
    // vaut mieux qu'un refus : la console reste lisible quand le direct finit.
    if (session.status !== "live") {
      return { page: [], isDone: true, continueCursor: "" }
    }

    const me = ctx.person._id
    const result =
      args.side === "low"
        ? await ctx.db
            .query("connections")
            .withIndex("by_network_low_status", (q) => q.eq("networkId", session.networkId).eq("personIdLow", me).eq("status", "accepted"))
            .order("desc")
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("connections")
            .withIndex("by_network_high_status", (q) => q.eq("networkId", session.networkId).eq("personIdHigh", me).eq("status", "accepted"))
            .order("desc")
            .paginate(args.paginationOpts)

    const needle = args.query.trim().replace(/^@/, "").toLowerCase()
    const profileOf = miniProfileCache(ctx)
    const page: AntennaInviteCandidate[] = []
    for (const connection of result.page) {
      const otherPersonId = connection.personIdLow === me ? connection.personIdHigh : connection.personIdLow
      const candidate = await candidateFor(ctx, session, me, otherPersonId, profileOf, args.now)
      // Un profil dépublié n'a pas de nom à chercher, et un membre qui n'est pas
      // (ou plus) DÉCLARÉ ne pourrait pas répondre : on ne les propose pas — la
      // même vérification que l'invitation, lue dans `assertInvitableTarget`.
      if (candidate.state === "no_profile") continue
      if (!matchesCandidateQuery(candidate, needle)) continue
      page.push(candidate)
    }
    return { ...result, page }
  },
})

/**
 * L'état d'invitation de personnes DÉJÀ à l'écran — les auteurs de
 * commentaires, et rien d'autre.
 *
 * Le bouton « Inviter à l'antenne » d'un commentaire s'affichait dès qu'un
 * handle existait : sur un direct PUBLIC, il était donc offert à des gens hors
 * du réseau de l'hôte, qui recevaient un refus après le clic. La console
 * connaît les états par `searchInviteCandidates` ; la conversation, elle, part
 * d'auteurs quelconques — d'où cette lecture ponctuelle, BORNÉE à la fenêtre
 * de commentaires.
 */
export const inviteStatesForUsers = networkQuery({
  args: {
    sessionId: v.id("liveSessions"),
    personIds: v.array(v.id("persons")),
    now: v.number(),
  },
  handler: async (ctx, args): Promise<{ personId: Id<"persons">; state: AntennaInviteState }[]> => {
    const session = assertHostConsole(await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId), ctx.person._id, { requireLive: false })
    if (session.status !== "live") return []

    const profileOf = miniProfileCache(ctx)
    const seen = new Set<string>()
    const out: { personId: Id<"persons">; state: AntennaInviteState }[] = []
    for (const personId of args.personIds.slice(0, ANTENNA_STATE_SCAN)) {
      if (seen.has(String(personId))) continue
      seen.add(String(personId))
      const candidate = await candidateFor(ctx, session, ctx.person._id, personId, profileOf, args.now)
      out.push({ personId, state: candidate.state })
    }
    return out
  },
})

/** Répondre à MON invitation — accepter ouvre le rôle, jamais la caméra. */
export const respondToInvitation = networkMutation({
  writeBucket: "live.respond",
  args: {
    invitationId: v.id("liveAntennaInvitations"),
    response: directAntennaResponseValidator,
  },
  handler: async (ctx, args): Promise<{ changed: boolean; promoted: boolean }> => {
    const row = await ctx.db.get(args.invitationId)
    if (!row || row.inviteePersonId !== ctx.person._id) return directNotFound()
    const session = await assertLiveAudience(ctx, directCaller(ctx), row.sessionId)
    if (row.status !== "pending") {
      return { changed: false, promoted: false }
    }
    // ⚠️ REFUSER, sans rien écrire. Une mutation qui lève annule ses propres
    // écritures : marquer la ligne `expired` ICI serait perdu avec le refus.
    // L'expiration n'a pas besoin d'être stockée — toutes les lectures la
    // dérivent (`effectiveDirectInvitationStatus`), et la relance de l'hôte
    // rouvre la même ligne. Le motif, lui, doit être dit : « plus rien ne se
    // passe » n'apprend rien à qui vient de cliquer « Accepter ».
    if (effectiveDirectInvitationStatus(row, Date.now()) === "expired") {
      return failRule("LIVE_INVITATION_EXPIRED")
    }
    await assertActiveTarget(ctx, ctx.person._id)
    if (
      !(await isConnectedTo(ctx, session.networkId, ctx.person._id, session.hostPersonId)) ||
      (await isBlockedBetween(ctx, ctx.person._id, session.hostPersonId)) ||
      (await banRow(ctx, session._id, ctx.person._id))
    ) {
      return failRule("LIVE_INVITATION_NOT_RECEIVABLE")
    }
    if (await liveSpeakerRow(ctx, session._id, ctx.person._id)) {
      await settlePendingIntentsAsAccepted(ctx, session, ctx.person._id, Date.now())
      return { changed: true, promoted: false }
    }

    if (args.response === "declined") {
      const now = Date.now()
      await ctx.db.patch(row._id, {
        status: "declined",
        updatedAt: now,
      })
      // Ma cloche se résout avec ma réponse (CH-094) — l'accord, lui, passe
      // par `settlePendingIntentsAsAccepted`, ci-dessous comme au-dessus.
      await resolveNotifications(ctx, {
        networkId: session.networkId,
        recipientPersonId: ctx.person._id,
        kind: "live_antenna_invite",
        subject: { liveSession: session._id },
        resolution: "declined",
        at: now,
      })
      return { changed: true, promoted: false }
    }

    const promoted = await promoteSpeakerRow(ctx, session, ctx.person._id)
    await settlePendingIntentsAsAccepted(ctx, session, ctx.person._id, Date.now())
    return { changed: true, promoted }
  },
})

/**
 * ACCEPTER l'enregistrement de ce direct (DL-02) — MON accord explicite et
 * horodaté, avant de prendre l'antenne d'un direct enregistré.
 *
 * Ordre du moteur : ADHÉSION (constructeur) → VISIBILITÉ (refus indistinct) →
 * ÉLIGIBILITÉ (direct à venir ou en cours, ET enregistré : une session non
 * enregistrée ne stocke aucun accord, `LIVE_NO_RECORDING`) → DÉBIT
 * (`live.recordingConsent`, seul un accord NOUVEAU le consomme) → DROIT (on
 * n'accorde que pour soi : aucun argument ne désigne une autre personne).
 *
 * Idempotente : rejouée, elle rend l'horodatage du PREMIER accord.
 *
 * L'invité intervenant d'un direct en cours monte dans la même transaction
 * (`promoted: true`) : sa place ne l'attendait que pour cet accord. Les autres
 * chemins (main levée, invitation à l'antenne) restent des gestes à part — cet
 * accord ne fait monter personne d'autre.
 *
 * ⚠️ Aucun retrait d'accord n'est offert : rendre l'antenne (`leaveAntenna`)
 * arrête de capter la personne, mais ce qui a déjà été enregistré reste dans la
 * rediffusion, dont l'hôte décide. L'écran le dit sans promettre davantage.
 */
export const acceptRecording = networkMutation({
  args: { sessionId: v.id("liveSessions") },
  handler: async (ctx, args): Promise<{ acceptedAt: number; promoted: boolean }> => {
    const session = await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId)
    if (session.status === "ended") return failRule("LIVE_ENDED")
    if (!session.replayRequested) return failRule("LIVE_NO_RECORDING")

    const existing = await recordingConsentRow(ctx, session._id, ctx.person._id)
    let acceptedAt: number
    if (existing !== null) {
      acceptedAt = existing.acceptedAt
    } else {
      // Par PERSONNE : changer de direct ne remet pas le compteur à zéro.
      await enforceRateLimit(ctx, "live.recordingConsent", ctx.person._id)
      acceptedAt = (await writeRecordingConsent(ctx, session, ctx.person._id, Date.now())).acceptedAt
    }
    const promoted = await promoteConsentingSpeakerInvitee(ctx, session, ctx.person._id)
    return { acceptedAt, promoted }
  },
})

/** Quitter volontairement l'antenne — intervenant seul, jamais l'hôte. */
export const leaveAntenna = networkMutation({
  writeBucket: "live.leave",
  args: { sessionId: v.id("liveSessions") },
  handler: async (ctx, args): Promise<{ left: true }> => {
    const session = await assertLiveAudience(ctx, directCaller(ctx), args.sessionId)
    if (session.hostPersonId === ctx.person._id) {
      return failRule("LIVE_HOST_STAYS_ON_STAGE")
    }
    const speaker = await liveSpeakerRow(ctx, session._id, ctx.person._id)
    if (!speaker || speaker.role !== "speaker") {
      return failRule("LIVE_NOT_ON_STAGE")
    }
    await demoteSpeakerRow(ctx, session, ctx.person._id)
    return { left: true }
  },
})
