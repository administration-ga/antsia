/**
 * CC-4 (contrat CONVERSATION-CONTEXTUELLE-V1 §5.8, §10.2, §11.3 ; ADR-0025, D5 amendé option (a)) —
 * l'autorité d'un APPEL contextuel, RELUE à la sonnerie, à l'acceptation, à chaque émission de jeton
 * et à chaque revalidation, sans cache d'une requête à l'autre :
 *
 *   1. la conversation est OUVERTE pour les deux personnes et la phase de l'objet est « engagée »
 *      pour les appels (`callsEngaged`, fourni par la tranche) ;
 *   2. chacune a donné, DANS CE FIL, un accord explicite, jamais prérempli, révocable à tout moment,
 *      lié à l'autorité qui l'a permis (`callAuthorityKey`) : côté page, sa ligne de signataire ET sa
 *      date d'acceptation ; côté personne, sa qualité de partie de l'objet. Une autorité perdue puis
 *      retrouvée produit une autre clé : l'ancien accord ne revit pas (N29) ;
 *   3. en voix de page, le signataire qui consent accepte d'être NOMMÉ dans l'appel ; le demandeur ne
 *      cible qu'un signataire consentant (un autre est indistinct d'un inconnu, D3) ; un signataire
 *      n'appelle qu'en son propre nom ;
 *   4. puis la porte partagée `calls/direct.placeDirectCall` applique toutes ses gardes (blocage,
 *      personne joignable, admission, budget `call.place`), avec D5 (a) : l'accord donné dans CE fil
 *      lève le seul réglage « hors de mes relations : silencieux » ; « ne pas déranger », le silence
 *      de réunion, l'occupation et l'absence connue restent appliqués (relus avant le décrochage).
 *
 * Toute perte de droit (adhésion, signataire, blocage, politique, phase, accord) rend la paire non
 * admise : la porte suivante refuse, et la revalidation arrête l'appel (`finishCall`, qui ferme aussi
 * la salle). Aucune fonction Convex ici : les portes publiques vivent dans `calls.ts`, la revalidation
 * planifiée dans `retention.ts`. Ce fichier n'importe JAMAIS `calls/direct.ts` (aucun cycle
 * d'évaluation avec la porte d'appel) ni `commercialMessaging/**`.
 */
import {
  CONTEXTUAL_TEAM_NOTICE_MAX,
  contextualCallAuthorityKey,
  contextualCallConsentAllowed,
  type ContextualRefusal,
} from "@antsia/social-domain/contextualMessaging"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { evaluateCallAdmission } from "../calls/evaluate"
import { outsideRelationsCallsOf } from "../calls/preferences"
import { type CallEnd, finishCall } from "../calls/state"
import { isBlockedBetween } from "../graph/graph"
import { signatoryRowOf } from "../pages/access"
import { accessForThread, canReadContextualThread, type ContextualAccess, type ContextualReadCtx, withContextualMemo } from "./access"
import { personStateOf } from "./personStates"
import { CONTEXTUAL_REGISTRY, type ContextualRegistry } from "./registry"

/** Appels vivants relus par fil : un seul en principe ; deux referment une ancienne anomalie sans balayage (comme P10). */
const THREAD_LIVE_CALLS_SCAN = 2

/** Accords relus pour composer les cibles d'un demandeur face à une page : vingt cibles au plus, plus sa propre ligne. */
const CALL_TARGETS_SCAN = CONTEXTUAL_TEAM_NOTICE_MAX + 1

/** La fin d'un appel arrêté par la conversation (clôture, retrait, perte de droit) : celle de P10. */
const CONTEXTUAL_CALL_STOP: CallEnd = { callStatus: "ended", endReason: "normal" }

/** La mémoire locale de la requête, réutilisée si elle existe déjà (jamais globale, jamais persistée). */
function memoOf(ctx: ContextualReadCtx): ContextualReadCtx {
  return ctx.contextualMemo !== undefined ? ctx : withContextualMemo(ctx)
}

// ═══════════════════════════════════════════════════════════════
// Accord explicite, lié à l'autorité
// ═══════════════════════════════════════════════════════════════

/**
 * La clé d'autorité ACTUELLE d'une partie (§5.8) : côté page, sa ligne de signataire et sa date
 * d'acceptation ; côté personne, sa qualité de partie de l'objet (fil et côté). `null` : plus
 * d'autorité, aucun accord ne vaut.
 */
export async function currentCallAuthorityKey(ctx: Pick<QueryCtx, "db">, access: ContextualAccess, personId: Id<"persons">): Promise<string | null> {
  if (access.voice === "page") {
    const page = access.responderPage
    if (page === null) return null
    const row = await signatoryRowOf(ctx, page._id, personId)
    if (row === null || row.acceptedAt === undefined) return null
    return contextualCallAuthorityKey({ kind: "page", signatoryRowId: row._id, acceptedAt: row.acceptedAt })
  }
  return contextualCallAuthorityKey({ kind: "person", contextKey: access.thread.contextKey, side: access.side })
}

/** Son accord EFFECTIF : posé dans ce fil, et lié à l'autorité qu'il a ENCORE. */
export async function effectiveCallConsent(ctx: Pick<QueryCtx, "db">, access: ContextualAccess, personId: Id<"persons">): Promise<boolean> {
  const state = await personStateOf(ctx, access.thread._id, personId)
  if (state?.callsAllowed !== true || state.callAuthorityKey === undefined) return false
  return state.callAuthorityKey === (await currentCallAuthorityKey(ctx, access, personId))
}

/**
 * Le refus explicite de la PHASE pour un accord ou un appel, à une partie (liste fermée, §5.3) :
 * `null` quand la conversation est ouverte et engagée pour les appels. Il ne dit jamais qui a retiré quoi.
 */
export function callPhaseRefusal(access: Pick<ContextualAccess, "capabilities" | "snapshot">): ContextualRefusal | null {
  const { capabilities, snapshot } = access
  if (capabilities.viewState === "open") return snapshot.callsEngaged ? null : "CONTEXT_CALLS_CLOSED"
  if (snapshot.phase === "not_open") return "CONTEXT_NOT_OPEN"
  return capabilities.viewState === "unavailable" ? "CONTEXT_UNAVAILABLE" : "CONTEXT_CLOSED"
}

/** ACTIVER un accord (règle pure du domaine) : conversation ouverte, phase engagée, statut d'écriture. */
export function canActivateCallConsent(access: Pick<ContextualAccess, "capabilities" | "snapshot" | "writeStatusSatisfied">): boolean {
  return contextualCallConsentAllowed({ viewState: access.capabilities.viewState, callsEngaged: access.snapshot.callsEngaged, writeStatusSatisfied: access.writeStatusSatisfied, allowed: true })
}

/** Une partie PRÊTE pour un appel : elle pourrait activer son accord, et son accord est effectif. */
async function partyReadyToCall(ctx: Pick<QueryCtx, "db">, access: ContextualAccess, personId: Id<"persons">): Promise<boolean> {
  return canActivateCallConsent(access) && (await effectiveCallConsent(ctx, access, personId))
}

// ═══════════════════════════════════════════════════════════════
// La paire et la participation (§10.2 : `canParticipateContextualCall`)
// ═══════════════════════════════════════════════════════════════

/**
 * La PAIRE d'un appel contextuel est-elle admise MAINTENANT ? Deux personnes distinctes, de côtés
 * opposés, chacune partie actuelle (relecture complète : objet, adhésion, vivacité, signataire vivant,
 * visibilité, blocage, politique), prête (ouverte, engagée, statut d'écriture, accord effectif), sans
 * blocage entre elles. Tout manquement rend `false`, sans raison.
 */
export async function contextualCallPairAllowed(ctx: ContextualReadCtx, thread: Doc<"contextualThreads">, first: Id<"persons">, second: Id<"persons">, registry: ContextualRegistry = CONTEXTUAL_REGISTRY): Promise<boolean> {
  if (first === second) return false
  const memo = memoOf(ctx)
  const one = await accessForThread(memo, thread, first, registry)
  if (one === null) return false
  const two = await accessForThread(memo, thread, second, registry)
  if (two === null || one.side === two.side) return false
  if (!(await partyReadyToCall(memo, one, first)) || !(await partyReadyToCall(memo, two, second))) return false
  return !(await isBlockedBetween(memo, first, second))
}

/**
 * §10.2 — le droit VIVANT d'une personne d'être dans un appel contextuel (sonnerie, décrochage,
 * jeton, état, gestes, avis d'appel) : un tête-à-tête de ce fil, entre ses deux personnes, dont la
 * paire est admise maintenant. Avant le décrochage, l'admission de l'appelé est RELUE (un nouveau
 * « ne pas déranger », une occupation ou une absence connue coupent la sonnerie) ; D5 (a) : seul le
 * réglage « hors de mes relations » est levé par l'accord donné dans ce fil.
 */
export async function canParticipateContextualCall(ctx: ContextualReadCtx, call: Doc<"calls">, personId: Id<"persons">, registry: ContextualRegistry = CONTEXTUAL_REGISTRY): Promise<boolean> {
  const threadId = call.contextualThreadId
  if (threadId === undefined || call.commercialThreadId !== undefined || call.groupThreadId !== undefined) return false
  const callee = call.calleePersonId
  if (call.kind !== "direct" || callee === undefined || (personId !== call.createdByPersonId && personId !== callee)) return false
  const thread = await ctx.db.get(threadId)
  if (thread === null || thread.networkId !== call.networkId) return false
  if (!(await contextualCallPairAllowed(ctx, thread, call.createdByPersonId, callee, registry))) return false
  if (call.status === "active" && call.answeredAt === undefined) {
    const admission = await evaluateCallAdmission(ctx, { networkId: call.networkId, calleePersonId: callee, callerPersonId: call.createdByPersonId, now: Date.now(), viaContextualConsent: true })
    if (!admission.decision.admitted) return false
  }
  return true
}

/**
 * Le JOURNAL et les avis d'un appel contextuel (« le journal rappelle par la conversation ») : une
 * personne de l'appel qui LIT encore le fil. Un ancien participant ne garde rien (§4.3).
 */
export async function contextualCallVisibleTo(ctx: ContextualReadCtx, call: Doc<"calls">, personId: Id<"persons">): Promise<boolean> {
  const threadId = call.contextualThreadId
  if (threadId === undefined || call.commercialThreadId !== undefined) return false
  if (personId !== call.createdByPersonId && personId !== call.calleePersonId) return false
  return await canReadContextualThread(ctx, call.networkId, personId, threadId)
}

// ═══════════════════════════════════════════════════════════════
// Cibles d'un appel
// ═══════════════════════════════════════════════════════════════

/** Une personne d'EN FACE prête à être appelée par ce lecteur : partie actuelle de l'autre côté, prête, sans blocage. */
async function counterpartReady(ctx: ContextualReadCtx, access: ContextualAccess, readerPersonId: Id<"persons">, candidate: Id<"persons">, registry: ContextualRegistry): Promise<boolean> {
  if (candidate === readerPersonId) return false
  const other = await accessForThread(ctx, access.thread, candidate, registry)
  if (other === null || other.side === access.side) return false
  if (!(await partyReadyToCall(ctx, other, candidate))) return false
  return !(await isBlockedBetween(ctx, readerPersonId, candidate))
}

/**
 * Les personnes d'en face que ce lecteur peut appeler maintenant : le demandeur pour le répondant,
 * le mentor pour le mentoré ; face à une page, les signataires CONSENTANTS seulement (vingt au plus),
 * relus un à un. Le lecteur lui-même doit être prêt : l'appelant le vérifie avant.
 */
export async function readyCallTargets(ctx: ContextualReadCtx, access: ContextualAccess, readerPersonId: Id<"persons">, registry: ContextualRegistry = CONTEXTUAL_REGISTRY): Promise<Id<"persons">[]> {
  const memo = memoOf(ctx)
  const { snapshot, thread } = access
  let candidates: Id<"persons">[]
  if (access.side === "responder") candidates = [snapshot.requester.personId]
  else if ("personId" in snapshot.responder) candidates = [snapshot.responder.personId]
  else {
    // borné : les accords posés dans ce fil (une ligne par personne), vingt cibles et la ligne du lecteur.
    const consenting = await ctx.db.query("contextualPersonStates").withIndex("by_thread_calls", (q) => q.eq("threadId", thread._id).eq("callsAllowed", true)).take(CALL_TARGETS_SCAN)
    candidates = consenting.map((row) => row.personId)
  }
  const ready: Id<"persons">[] = []
  for (const candidate of candidates) {
    if (ready.length >= CONTEXTUAL_TEAM_NOTICE_MAX) break
    if (await counterpartReady(memo, access, readerPersonId, candidate, registry)) ready.push(candidate)
  }
  return ready
}

export type ContextualCallTarget =
  | { readonly kind: "target"; readonly personId: Id<"persons"> }
  /** Cible inconnue, d'un autre côté, ou signataire non consentant : indistinct d'un inconnu. */
  | { readonly kind: "unknown" }
  /** La personne d'en face n'a pas (ou plus) d'accord effectif : refus explicite fermé. */
  | { readonly kind: "consent_required" }
  /** Plusieurs signataires consentants et aucun choisi. */
  | { readonly kind: "ambiguous" }

/**
 * La cible d'un appel lancé par ce lecteur (N31). Le répondant appelle le demandeur, le mentoré son
 * mentor ; face à une page, le demandeur choisit parmi les seuls signataires consentants (un seul :
 * choisi d'office). Un signataire n'appelle jamais au nom d'un autre : l'appelant est toujours la
 * personne de la session, et sa cible ne peut être que le demandeur.
 */
export async function resolveContextualCallTarget(ctx: ContextualReadCtx, access: ContextualAccess, readerPersonId: Id<"persons">, requested: Id<"persons"> | undefined, registry: ContextualRegistry = CONTEXTUAL_REGISTRY): Promise<ContextualCallTarget> {
  const memo = memoOf(ctx)
  const { snapshot } = access
  if (access.side === "responder" || "personId" in snapshot.responder) {
    const counterpart = access.side === "responder" ? snapshot.requester.personId : "personId" in snapshot.responder ? snapshot.responder.personId : null
    if (counterpart === null || (requested !== undefined && requested !== counterpart)) return { kind: "unknown" }
    return (await counterpartReady(memo, access, readerPersonId, counterpart, registry)) ? { kind: "target", personId: counterpart } : { kind: "consent_required" }
  }
  if (requested !== undefined) return (await counterpartReady(memo, access, readerPersonId, requested, registry)) ? { kind: "target", personId: requested } : { kind: "unknown" }
  const targets = await readyCallTargets(memo, access, readerPersonId, registry)
  const [only] = targets
  if (only === undefined) return { kind: "consent_required" }
  return targets.length === 1 ? { kind: "target", personId: only } : { kind: "ambiguous" }
}

// ═══════════════════════════════════════════════════════════════
// Arrêt et revalidation des appels d'un fil
// ═══════════════════════════════════════════════════════════════

/** Les appels VIVANTS d'un fil (un seul en principe). */
export async function liveContextualCalls(ctx: Pick<QueryCtx, "db">, threadId: Id<"contextualThreads">): Promise<Doc<"calls">[]> {
  return await ctx.db.query("calls").withIndex("by_contextual_thread_status", (q) => q.eq("contextualThreadId", threadId).eq("status", "active")).take(THREAD_LIVE_CALLS_SCAN)
}

/** Arrête TOUS les appels vivants d'un fil (clôture par un côté, purge) ; `finishCall` ferme aussi la salle. */
export async function stopContextualThreadCalls(ctx: MutationCtx, threadId: Id<"contextualThreads">): Promise<number> {
  const at = Date.now()
  let stopped = 0
  for (const call of await liveContextualCalls(ctx, threadId)) {
    await finishCall(ctx, call, CONTEXTUAL_CALL_STOP, at)
    stopped += 1
  }
  return stopped
}

/**
 * Revalide les appels vivants d'un fil (retrait d'accord, synchronisation de l'objet) : seuls ceux
 * dont la paire n'est plus admise s'arrêtent. N'échoue jamais pour un refus (crochets de la tranche).
 */
export async function revalidateContextualThreadCalls(ctx: MutationCtx, threadId: Id<"contextualThreads">, registry: ContextualRegistry = CONTEXTUAL_REGISTRY): Promise<number> {
  const calls = await liveContextualCalls(ctx, threadId)
  if (calls.length === 0) return 0
  const memo = withContextualMemo(ctx)
  let stopped = 0
  for (const call of calls) {
    if (await canParticipateContextualCall(memo, call, call.createdByPersonId, registry)) continue
    await finishCall(ctx, call, CONTEXTUAL_CALL_STOP, Date.now())
    stopped += 1
  }
  return stopped
}

// ═══════════════════════════════════════════════════════════════
// Projection pour le lecteur (§10.1 : capacités, accord, cibles ; D5 amendé : effet de SES réglages)
// ═══════════════════════════════════════════════════════════════

export type ContextualCallView = {
  /** Son PROPRE accord effectif ; jamais celui de l'autre côté. */
  readonly callConsent: boolean
  /** Activer (conversation ouverte, phase engagée, statut d'écriture) ou retirer (toujours). */
  readonly canSetCallConsent: boolean
  /** Il peut lancer un appel maintenant : accords effectifs des deux côtés, aucun appel vivant dans le fil. */
  readonly canCall: boolean
  /** Signataires consentants, servis au seul demandeur face à une page, quand l'appel est possible. */
  readonly callTargets: readonly Id<"persons">[]
}

export async function contextualCallView(ctx: ContextualReadCtx, access: ContextualAccess, personId: Id<"persons">, registry: ContextualRegistry = CONTEXTUAL_REGISTRY): Promise<ContextualCallView> {
  const callConsent = await effectiveCallConsent(ctx, access, personId)
  const canActivate = canActivateCallConsent(access)
  const closed: ContextualCallView = { callConsent, canSetCallConsent: callConsent || canActivate, canCall: false, callTargets: [] }
  if (!callConsent || !canActivate) return closed
  const targets = await readyCallTargets(memoOf(ctx), access, personId, registry)
  if (targets.length === 0 || (await liveContextualCalls(ctx, access.thread._id)).length > 0) return closed
  const facingPage = access.side === "requester" && "pageId" in access.snapshot.responder
  return { callConsent, canSetCallConsent: true, canCall: true, callTargets: facingPage ? targets : [] }
}

/**
 * D5 amendé : l'effet de SES PROPRES réglages d'appel sur ce fil, sans rien révéler de ceux de l'autre
 * côté. « Hors de mes relations : silencieux » ne s'applique pas à un accord donné dans ce fil ;
 * « ne pas déranger », le silence de réunion et « occupé » s'appliquent toujours.
 */
export type ContextualCallSettings = {
  /** Son réglage « hors de mes relations : silencieux » est actif, et il ne s'applique pas à son accord dans CE fil. */
  readonly outsideRelationsSilenceWaived: boolean
  /** Fin de son « ne pas déranger » posé (toujours appliqué), `null` sans silence ; l'écran compare à son horloge. */
  readonly dndUntil: number | null
  /** Son silence automatique de réunion est activé (toujours appliqué pendant un évènement accepté). */
  readonly meetingSilence: boolean
  /** Il a coupé le signal d'appel en attente : déjà en ligne, il est indiqué « occupé ». */
  readonly callWaitingOff: boolean
  /** Il a coupé la sonnerie poussée hors de l'onglet. */
  readonly incomingPushOff: boolean
}

export async function viewerCallSettings(ctx: Pick<QueryCtx, "db">, personId: Id<"persons">): Promise<ContextualCallSettings> {
  const prefs = await ctx.db.query("callPreferences").withIndex("by_person", (q) => q.eq("personId", personId)).unique()
  return {
    // IC-04 : le réglage EFFECTIF — `silent` aussi pour qui ne l'a jamais posé (défaut du moteur).
    outsideRelationsSilenceWaived: outsideRelationsCallsOf(prefs) === "silent",
    dndUntil: prefs?.dnd?.until ?? null,
    meetingSilence: prefs?.autoMeetingDnd?.enabled === true,
    callWaitingOff: prefs?.callWaiting === false,
    incomingPushOff: prefs?.pushIncoming === false,
  }
}
