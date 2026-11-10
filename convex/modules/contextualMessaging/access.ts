/**
 * CC-2b (contrat CONVERSATION-CONTEXTUELLE-V1 §4) — l'autorité d'une conversation contextuelle,
 * RELUE à chaque lecture et à chaque écriture, sans cache d'une requête à l'autre :
 *
 *   1. constructeur (`networkQuery` / `networkMutation`) : session, réseau, adhésion ;
 *   2. le fil appartient au réseau courant ;
 *   3. le résolveur de la nature relit l'objet (même réseau, phase connue, clés du fil égales) ;
 *   4. qualité de partie : la personne de l'objet, ou un signataire VIVANT de sa page ;
 *   5. vivacité du lecteur (profil publié, adhésion, consentement `social_profile`) ;
 *   6. visibilité propre de l'objet pour ce lecteur (tranche) ;
 *   7. aucun blocage personnel entre le lecteur et la personne d'en face concernée ;
 *   8. pour une écriture : politique, phase, capacités, statut d'écriture, puis règles du message.
 *
 * Tout échec avant le point 8 est un refus INDISTINCT (`null` ici, `notFound` ou `null` au
 * bord) : identique à un identifiant inventé, à une autre nature ou à un autre réseau. Aucune
 * fonction Convex ici ; aucun import de `commercialMessaging/**` (règles communes composées à
 * partir des mêmes primitives, §11.2) ; aucun import de tranche hors `registry.ts`.
 */
import {
  CONTEXTUAL_MODERATION_SURFACE,
  CONTEXTUAL_READ_MIN_STATUS,
  CONTEXTUAL_RESPONDER_KINDS,
  CONTEXTUAL_WRITE_MIN_STATUS,
  type ContextualCapabilities,
  contextualCapabilities,
  contextualKey,
  type ContextualKind,
  contextualPolicyOpen,
  type ContextualSide,
  contextualViewerSide,
  type ContextualVoice,
  contextualVoiceOf,
  isContextualPartyLive,
  strictestStatus,
} from "@antsia/social-domain/contextualMessaging"
import { isConsentInForce } from "@antsia/social-domain/consent"
import type { ActiveMembershipStatus } from "@antsia/social-domain/membership"
import type { NotificationOpenTarget } from "@antsia/social-domain/notificationOpenTarget"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { memberHasStatus } from "../../lib/access"
import { isBlockedBetween } from "../graph/graph"
import { contentState } from "../moderation/policy"
import { liveSignatoryRole, signatoryRowsOf } from "../pages/access"
import { livePersonProfile } from "../people/miniProfile"
import type { ContextualObjectRef, ContextualReadCtx as ResolverCtx, ContextualSnapshot, ContextualTextRuleInput, ContextualTextRuleResult } from "./contract"
import { CONTEXTUAL_REGISTRY, type ContextualRegistry } from "./registry"

/** Mémoire LOCALE à une requête (une page de liste relit les mêmes personnes) : jamais globale, jamais persistée. */
type RequestMemo = { readonly memo: Map<string, Promise<boolean>> }
export type ContextualReadCtx = Pick<QueryCtx, "db"> & { contextualMemo?: RequestMemo }

export function withContextualMemo<T extends Pick<QueryCtx, "db">>(ctx: T): T & { contextualMemo: RequestMemo } {
  return { ...ctx, contextualMemo: { memo: new Map<string, Promise<boolean>>() } }
}

async function memoized(ctx: ContextualReadCtx, key: string, work: () => Promise<boolean>): Promise<boolean> {
  const memo = ctx.contextualMemo?.memo
  const hit = memo?.get(key)
  if (hit) return await hit
  const pending = work()
  memo?.set(key, pending)
  return await pending
}

/**
 * Le contexte remis au résolveur : la base EN LECTURE seule, y compris à l'exécution (une
 * mutation passe sinon un écrivain). Le résolveur ne reçoit ni stockage, ni planificateur.
 */
function readOnlyCtx(ctx: Pick<QueryCtx, "db">): ResolverCtx {
  const db = ctx.db
  // Seules les lectures du lecteur de base (`get`, `query`, `normalizeId`, `system`) sont remises.
  const reader = { get: db.get.bind(db), query: db.query.bind(db), normalizeId: db.normalizeId.bind(db), system: db.system }
  return { db: reader as unknown as QueryCtx["db"] }
}

// ═══════════════════════════════════════════════════════════════
// Objet ouvrant et résolveur
// ═══════════════════════════════════════════════════════════════

/** La référence typée de l'objet d'un fil ; `null` si les colonnes ne sont pas celles de sa nature. */
export function objectRefOf(thread: Pick<Doc<"contextualThreads">, "kind" | "serviceRequestId" | "mentoringRequestId" | "jobApplicationId" | "professionalCollaborationId">): ContextualObjectRef | null {
  switch (thread.kind) {
    case "diasporaServiceRequest":
      return thread.serviceRequestId !== undefined && thread.mentoringRequestId === undefined && thread.jobApplicationId === undefined && thread.professionalCollaborationId === undefined ? { kind: "diasporaServiceRequest", id: thread.serviceRequestId } : null
    case "diasporaMentoring":
      return thread.mentoringRequestId !== undefined && thread.serviceRequestId === undefined && thread.jobApplicationId === undefined && thread.professionalCollaborationId === undefined ? { kind: "diasporaMentoring", id: thread.mentoringRequestId } : null
    case "diasporaJobApplication":
      return thread.jobApplicationId !== undefined && thread.serviceRequestId === undefined && thread.mentoringRequestId === undefined && thread.professionalCollaborationId === undefined ? { kind: "diasporaJobApplication", id: thread.jobApplicationId } : null
    case "professionalCollaboration":
      return thread.professionalCollaborationId !== undefined && thread.serviceRequestId === undefined && thread.mentoringRequestId === undefined && thread.jobApplicationId === undefined ? { kind: "professionalCollaboration", id: thread.professionalCollaborationId } : null
  }
}

/** Les colonnes de référence d'un objet, telles qu'un fil les porte (exactement une). */
export function referenceColumnsOf(ref: ContextualObjectRef): Pick<Doc<"contextualThreads">, "serviceRequestId" | "mentoringRequestId" | "jobApplicationId" | "professionalCollaborationId"> {
  switch (ref.kind) {
    case "diasporaServiceRequest":
      return { serviceRequestId: ref.id }
    case "diasporaMentoring":
      return { mentoringRequestId: ref.id }
    case "diasporaJobApplication":
      return { jobApplicationId: ref.id }
    case "professionalCollaboration":
      return { professionalCollaborationId: ref.id }
  }
}

/** La clé de contexte d'un objet (`nature:identifiant`). */
export function contextKeyOf(ref: ContextualObjectRef): string | null {
  return contextualKey(ref.kind, ref.id)
}

/** Le fil d'un objet, par sa clé de contexte (une ligne au plus). */
export async function findThreadForObject(ctx: Pick<QueryCtx, "db">, ref: ContextualObjectRef): Promise<Doc<"contextualThreads"> | null> {
  const key = contextKeyOf(ref)
  if (key === null) return null
  return await ctx.db.query("contextualThreads").withIndex("by_contextKey", (q) => q.eq("contextKey", key)).first()
}

/** L'instantané de l'objet par le résolveur de SA nature ; `null` si la nature est indisponible. */
export async function loadContextualSnapshot(ctx: Pick<QueryCtx, "db">, ref: ContextualObjectRef, now: number, registry: ContextualRegistry = CONTEXTUAL_REGISTRY): Promise<ContextualSnapshot | null> {
  const reader = readOnlyCtx(ctx)
  switch (ref.kind) {
    case "diasporaServiceRequest": {
      const resolver = registry.diasporaServiceRequest
      return resolver ? await resolver.load(reader, ref.id, now) : null
    }
    case "diasporaMentoring": {
      const resolver = registry.diasporaMentoring
      return resolver ? await resolver.load(reader, ref.id, now) : null
    }
    case "diasporaJobApplication": {
      const resolver = registry.diasporaJobApplication
      return resolver ? await resolver.load(reader, ref.id, now) : null
    }
    case "professionalCollaboration": {
      const resolver = registry.professionalCollaboration
      return resolver ? await resolver.load(reader, ref.id, now) : null
    }
  }
}

/** La visibilité PROPRE de l'objet pour cette personne (règles de la tranche) ; `false` si la nature est indisponible. */
export async function objectVisibleTo(ctx: Pick<QueryCtx, "db">, ref: ContextualObjectRef, personId: Id<"persons">, now: number, registry: ContextualRegistry = CONTEXTUAL_REGISTRY): Promise<boolean> {
  const reader = readOnlyCtx(ctx)
  switch (ref.kind) {
    case "diasporaServiceRequest": {
      const resolver = registry.diasporaServiceRequest
      return resolver ? await resolver.visibleTo(reader, ref.id, personId, now) : false
    }
    case "diasporaMentoring": {
      const resolver = registry.diasporaMentoring
      return resolver ? await resolver.visibleTo(reader, ref.id, personId, now) : false
    }
    case "diasporaJobApplication": {
      const resolver = registry.diasporaJobApplication
      return resolver ? await resolver.visibleTo(reader, ref.id, personId, now) : false
    }
    case "professionalCollaboration": {
      const resolver = registry.professionalCollaboration
      return resolver ? await resolver.visibleTo(reader, ref.id, personId, now) : false
    }
  }
}

/** La règle de texte facultative de la tranche (D8) ; admis quand la nature n'en fournit pas. */
export function sliceTextRule(kind: ContextualKind, input: Omit<ContextualTextRuleInput, "kind">, registry: ContextualRegistry = CONTEXTUAL_REGISTRY): ContextualTextRuleResult {
  switch (kind) {
    case "diasporaServiceRequest": {
      const resolver = registry.diasporaServiceRequest
      return resolver?.textRule ? resolver.textRule({ ...input, kind }) : { ok: true }
    }
    case "diasporaMentoring": {
      const resolver = registry.diasporaMentoring
      return resolver?.textRule ? resolver.textRule({ ...input, kind }) : { ok: true }
    }
    case "diasporaJobApplication": {
      const resolver = registry.diasporaJobApplication
      return resolver?.textRule ? resolver.textRule({ ...input, kind }) : { ok: true }
    }
    case "professionalCollaboration": {
      const resolver = registry.professionalCollaboration
      return resolver?.textRule ? resolver.textRule({ ...input, kind }) : { ok: true }
    }
  }
}

/**
 * La forme d'un instantané est-elle celle de sa nature ? Côté répondant du bon genre (page ou
 * personne) ; jamais une personne répondante identique au demandeur (personne ne parle des deux côtés).
 */
export function snapshotShapeValid(kind: ContextualKind, snapshot: ContextualSnapshot): boolean {
  const expected = CONTEXTUAL_RESPONDER_KINDS[kind]
  if ("pageId" in snapshot.responder) return expected === "page"
  return expected === "person" && snapshot.responder.personId !== snapshot.requester.personId
}

/** Les clés immuables du fil égalent-elles l'objet relu ? Sinon : absente pour tous, sans écriture (N04). */
export function snapshotMatchesThread(snapshot: ContextualSnapshot, thread: Pick<Doc<"contextualThreads">, "kind" | "networkId" | "requesterPersonId" | "responderPageId" | "responderPersonId">): boolean {
  if (!snapshotShapeValid(thread.kind, snapshot)) return false
  if (snapshot.networkId !== thread.networkId || snapshot.requester.personId !== thread.requesterPersonId) return false
  if ("pageId" in snapshot.responder) return thread.responderPageId === snapshot.responder.pageId && thread.responderPersonId === undefined
  return thread.responderPersonId === snapshot.responder.personId && thread.responderPageId === undefined
}

// ═══════════════════════════════════════════════════════════════
// Politique et vivacité
// ═══════════════════════════════════════════════════════════════

/** La politique d'une nature dans un réseau : FERMÉE sans ligne (§5.9). */
export async function contextualPolicyEnabled(ctx: ContextualReadCtx, networkId: Id<"networks">, kind: ContextualKind): Promise<boolean> {
  return await memoized(ctx, `policy:${networkId}:${kind}`, async () => {
    const row = await ctx.db.query("contextualPolicies").withIndex("by_network_kind", (q) => q.eq("networkId", networkId).eq("kind", kind)).first()
    return contextualPolicyOpen(row)
  })
}

/**
 * Une personne VIVANTE pour la conversation (règle de `livingMember` de P10, composée des mêmes
 * primitives sans importer P10) : profil publié et non effacé, adhésion au statut demandé
 * (suspension racine et sanction globale comprises), consentement `social_profile` en vigueur.
 */
export async function livingParty(ctx: ContextualReadCtx, networkId: Id<"networks">, personId: Id<"persons">, minStatus: ActiveMembershipStatus): Promise<boolean> {
  return await memoized(ctx, `living:${networkId}:${personId}:${minStatus}`, async () => {
    const profileLive = (await livePersonProfile(ctx, personId)) !== null
    if (!profileLive) return false
    const memberAtRequiredStatus = await memberHasStatus(ctx, networkId, personId, minStatus)
    if (!memberAtRequiredStatus) return false
    // borné : même borne que l'historique des consentements ; un dépassement ferme l'admission.
    const records = await ctx.db.query("consents").withIndex("by_person_and_purpose", (q) => q.eq("personId", personId).eq("purpose", "social_profile")).take(101)
    const socialProfileConsentInForce = records.length <= 100 && isConsentInForce(records.filter((record) => record.networkId === undefined || record.networkId === networkId), "social_profile")
    return isContextualPartyLive({ profileLive, memberAtRequiredStatus, socialProfileConsentInForce })
  })
}

/**
 * Un membre de l'équipe qui peut parler au demandeur : signature VIVANTE sur la page (page active
 * et native, signature acceptée, membre actif, identité forte pour une page officielle), personne
 * vivante, aucun blocage avec le demandeur. Le demandeur lui-même n'en est jamais (§3.3).
 */
export async function liveTeamMember(ctx: ContextualReadCtx, networkId: Id<"networks">, page: Doc<"pages">, personId: Id<"persons">, requesterPersonId: Id<"persons">): Promise<boolean> {
  if (personId === requesterPersonId) return false
  if ((await liveSignatoryRole(ctx, page, personId)) === null) return false
  if (!(await livingParty(ctx, networkId, personId, CONTEXTUAL_READ_MIN_STATUS))) return false
  return !(await isBlockedBetween(ctx, personId, requesterPersonId))
}

/** Le côté répondant a-t-il au moins une personne vivante habilitée ? */
export async function responderAvailable(ctx: ContextualReadCtx, networkId: Id<"networks">, snapshot: ContextualSnapshot, page: Doc<"pages"> | null): Promise<boolean> {
  if ("personId" in snapshot.responder) return await livingParty(ctx, networkId, snapshot.responder.personId, CONTEXTUAL_READ_MIN_STATUS)
  if (page === null) return false
  const requesterPersonId = snapshot.requester.personId
  return await memoized(ctx, `team:${networkId}:${page._id}:${requesterPersonId}`, async () => {
    // borné : plafond des signataires d'une page (`signatoryRowsOf`).
    for (const row of await signatoryRowsOf(ctx, page._id)) {
      if (row.acceptedAt === undefined) continue
      if (await liveTeamMember(ctx, networkId, page, row.personId, requesterPersonId)) return true
    }
    return false
  })
}

// ═══════════════════════════════════════════════════════════════
// Accès
// ═══════════════════════════════════════════════════════════════

export type ContextualParty = { readonly side: ContextualSide; readonly page: Doc<"pages"> | null }

/** La qualité de partie (§4.2, point 4) : demandeur d'abord ; côté page, signataire VIVANT au moment de l'accès. */
export async function partyOf(ctx: ContextualReadCtx, snapshot: ContextualSnapshot, personId: Id<"persons">): Promise<ContextualParty | null> {
  const page = "pageId" in snapshot.responder ? await ctx.db.get(snapshot.responder.pageId) : null
  const viewerIsLiveResponderSignatory = page !== null && personId !== snapshot.requester.personId && (await liveSignatoryRole(ctx, page, personId)) !== null
  const side = contextualViewerSide({
    viewerPersonId: personId,
    requesterPersonId: snapshot.requester.personId,
    ...("personId" in snapshot.responder ? { responderPersonId: snapshot.responder.personId } : {}),
    viewerIsLiveResponderSignatory,
  })
  return side === null ? null : { side, page }
}

/**
 * Blocage personnel (§3.4) : face à une PAGE, seul le signataire bloqué ou bloquant perd l'accès ;
 * entre deux personnes (mentorat), la conversation est absente pour les deux.
 */
export async function blockedForParty(ctx: ContextualReadCtx, snapshot: ContextualSnapshot, side: ContextualSide, personId: Id<"persons">): Promise<boolean> {
  if (side === "responder") return await isBlockedBetween(ctx, personId, snapshot.requester.personId)
  return "personId" in snapshot.responder ? await isBlockedBetween(ctx, personId, snapshot.responder.personId) : false
}

/** L'autre côté, vu d'une partie, a-t-il au moins une personne vivante habilitée ? */
export async function counterpartAvailableFor(ctx: ContextualReadCtx, networkId: Id<"networks">, snapshot: ContextualSnapshot, party: ContextualParty): Promise<boolean> {
  return party.side === "requester"
    ? await responderAvailable(ctx, networkId, snapshot, party.page)
    : await livingParty(ctx, networkId, snapshot.requester.personId, CONTEXTUAL_READ_MIN_STATUS)
}

export type ContextualAccess = {
  readonly thread: Doc<"contextualThreads">
  readonly ref: ContextualObjectRef
  readonly snapshot: ContextualSnapshot
  readonly side: ContextualSide
  /** La voix dans laquelle CE lecteur parle. */
  readonly voice: ContextualVoice
  /** La page répondante relue (côté page), sinon `null`. */
  readonly responderPage: Doc<"pages"> | null
  readonly policyOpen: boolean
  readonly counterpartAvailable: boolean
  readonly writeStatusSatisfied: boolean
  readonly capabilities: ContextualCapabilities
}

/** Relecture complète d'un fil pour une personne ; `null` pour tout non-partie (refus indistinct). */
export async function accessForThread(ctx: ContextualReadCtx, thread: Doc<"contextualThreads">, personId: Id<"persons">, registry: ContextualRegistry = CONTEXTUAL_REGISTRY): Promise<ContextualAccess | null> {
  const ref = objectRefOf(thread)
  if (ref === null) return null
  const now = Date.now()
  const snapshot = await loadContextualSnapshot(ctx, ref, now, registry)
  if (snapshot === null || !snapshotMatchesThread(snapshot, thread)) return null
  const party = await partyOf(ctx, snapshot, personId)
  if (party === null) return null
  if (!(await livingParty(ctx, thread.networkId, personId, CONTEXTUAL_READ_MIN_STATUS))) return null
  if (!(await objectVisibleTo(ctx, ref, personId, now, registry))) return null
  if (await blockedForParty(ctx, snapshot, party.side, personId)) return null
  const policyOpen = await contextualPolicyEnabled(ctx, thread.networkId, thread.kind)
  const counterpartAvailable = await counterpartAvailableFor(ctx, thread.networkId, snapshot, party)
  const writeStatusSatisfied = await memberHasStatus(ctx, thread.networkId, personId, strictestStatus(CONTEXTUAL_WRITE_MIN_STATUS, snapshot.writeMinStatus[party.side]))
  const capabilities = contextualCapabilities({
    phase: snapshot.phase,
    closedBySide: thread.closedCause === "side",
    policyOpen,
    counterpartAvailable,
    side: party.side,
    responderFirst: snapshot.responderFirst,
    firstWordAcquired: thread.responderSpokeAt !== undefined,
    attachments: snapshot.attachments,
    writeStatusSatisfied,
  })
  return { thread, ref, snapshot, side: party.side, voice: contextualVoiceOf(thread.kind, party.side), responderPage: party.page, policyOpen, counterpartAvailable, writeStatusSatisfied, capabilities }
}

/** Relecture d'un fil désigné par identifiant, dans CE réseau. */
export async function contextualThreadAccess(ctx: ContextualReadCtx, input: { networkId: Id<"networks">; personId: Id<"persons">; threadId: Id<"contextualThreads"> }, registry: ContextualRegistry = CONTEXTUAL_REGISTRY): Promise<ContextualAccess | null> {
  const thread = await ctx.db.get(input.threadId)
  if (thread === null || thread.networkId !== input.networkId) return null
  return await accessForThread(ctx, thread, input.personId, registry)
}

/** Aide offerte à la cloche et à la modération (§10.2) : relecture complète, en booléen. */
export async function canReadContextualThread(ctx: ContextualReadCtx, networkId: Id<"networks">, personId: Id<"persons">, threadId: Id<"contextualThreads">): Promise<boolean> {
  return (await contextualThreadAccess(ctx, { networkId, personId, threadId })) !== null
}

/**
 * La destination TYPÉE d'un avis contextuel (cloche, ouverture d'un push), RELUE pour son
 * destinataire : partie actuelle, fil lisible maintenant ; sinon `null` (repli neutre). Un sujet
 * générique — fil, nature, objet, côté, page active — que l'application de la nature route
 * elle-même ; jamais un contenu, un nom ni une URL.
 */
export async function contextualNotificationTarget(
  ctx: ContextualReadCtx,
  row: Pick<Doc<"notifications">, "networkId" | "recipientPersonId" | "subjectContextualThreadId">,
): Promise<Extract<NotificationOpenTarget, { kind: "contextualThread" }> | null> {
  if (row.subjectContextualThreadId === undefined) return null
  const access = await contextualThreadAccess(ctx, { networkId: row.networkId, personId: row.recipientPersonId, threadId: row.subjectContextualThreadId })
  if (access === null) return null
  const page = access.responderPage
  return {
    kind: "contextualThread",
    threadId: access.thread._id,
    contextKind: access.thread.kind,
    objectId: access.ref.id,
    side: access.side,
    pageHandle: page !== null && page.status === "active" ? page.handle : null,
  }
}

// ═══════════════════════════════════════════════════════════════
// Messages : visibilité de modération
// ═══════════════════════════════════════════════════════════════

/** L'émetteur d'un message : l'auteur en voix de personne, le signataire qui a porté la voix de page. */
export function messageEmitterOf(message: Pick<Doc<"contextualMessages">, "voice" | "authorPersonId" | "pageSpeakerPersonId">): Id<"persons"> | null {
  return (message.voice === "person" ? message.authorPersonId : message.pageSpeakerPersonId) ?? null
}

/**
 * Ce que la modération laisse lire à CE lecteur (§8) : un message retiré est retenu pour tous ;
 * en relecture, il n'est lu que de son auteur (voix de personne) ou de l'équipe de la page (voix
 * de page), jamais de l'autre côté ; une personne qui l'a signalé ne le relit plus.
 */
export async function contextualMessageReadable(ctx: Pick<QueryCtx, "db">, message: Doc<"contextualMessages">, access: Pick<ContextualAccess, "side">, personId: Id<"persons">): Promise<boolean> {
  const state = await contentState(ctx, CONTEXTUAL_MODERATION_SURFACE, message._id)
  if (state?.status === "removed") return false
  if (state?.status === "pending_review") {
    const ownView = message.voice === "person" ? message.authorPersonId === personId : access.side === "responder"
    if (!ownView) return false
  }
  const reported = await ctx.db.query("reports").withIndex("by_reporter_target", (q) => q.eq("reporterPersonId", personId).eq("targetKind", CONTEXTUAL_MODERATION_SURFACE).eq("targetId", message._id)).first()
  return reported === null
}

/** Aide offerte à la modération (§10.2) : le message est-il lu ACTUELLEMENT par cette personne ? */
export async function canReadContextualMessage(ctx: ContextualReadCtx, networkId: Id<"networks">, personId: Id<"persons">, messageId: Id<"contextualMessages">): Promise<boolean> {
  const message = await ctx.db.get(messageId)
  if (message === null || message.networkId !== networkId || message.deletedAt !== undefined) return false
  const access = await contextualThreadAccess(ctx, { networkId, personId, threadId: message.threadId })
  return access !== null && (await contextualMessageReadable(ctx, message, access, personId))
}

/**
 * Le guichet : une partie au fil, ou un signataire VIVANT de la page répondante, ne tranche
 * jamais un dossier de ce fil (§8, règle DIASPORALE étendue). Lu sur les clés immuables du fil :
 * la règle tient même quand l'objet n'est plus lisible.
 */
export async function contextualDecisionConflict(ctx: Pick<QueryCtx, "db">, messageId: string, actorPersonId: Id<"persons">): Promise<boolean> {
  const id = ctx.db.normalizeId("contextualMessages", messageId)
  const message = id === null ? null : await ctx.db.get(id)
  if (message === null) return false
  if (message.authorPersonId === actorPersonId || message.pageSpeakerPersonId === actorPersonId) return true
  const thread = await ctx.db.get(message.threadId)
  if (thread === null) return false
  if (thread.requesterPersonId === actorPersonId || thread.responderPersonId === actorPersonId) return true
  const page = thread.responderPageId === undefined ? null : await ctx.db.get(thread.responderPageId)
  return page !== null && (await liveSignatoryRole(ctx, page, actorPersonId)) !== null
}

/**
 * Faits de guichet d'un message contextuel, pour la tranche (CC-3b, pays du guichet) : la nature
 * DÉRIVÉE du fil, le pays de l'objet fourni par la tranche, et les pages dont les signataires ne
 * décident pas. Jamais une liste de participants, jamais un contenu.
 */
export async function contextualModerationFacts(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, messageId: Id<"contextualMessages">, registry: ContextualRegistry = CONTEXTUAL_REGISTRY): Promise<{ kind: ContextualKind; country: string | null; pageIds: Id<"pages">[] } | null> {
  const message = await ctx.db.get(messageId)
  if (message === null || message.networkId !== networkId) return null
  const thread = await ctx.db.get(message.threadId)
  if (thread === null || thread.networkId !== networkId) return null
  const ref = objectRefOf(thread)
  const snapshot = ref === null ? null : await loadContextualSnapshot(ctx, ref, Date.now(), registry)
  const country = snapshot !== null && snapshotMatchesThread(snapshot, thread) ? snapshot.moderationCountry : null
  return { kind: thread.kind, country, pageIds: thread.responderPageId === undefined ? [] : [thread.responderPageId] }
}
