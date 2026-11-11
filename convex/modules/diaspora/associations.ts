/**
 * Adhésion aux associations DIASPORALE (DG-010, lot G3 du plan global) — la
 * tranche « adhésion » : demander, annuler, quitter ; décider, exclure (motif
 * obligatoire), nommer un animateur, autoriser une nouvelle demande.
 *
 * - Les règles sont celles du domaine pur (`@diasporale/domain/associations`) ;
 *   chaque écriture suit l'ordre du moteur : adhésion au réseau (constructeur)
 *   → éligibilité → débit (`diaspora.association.membership` ou `.manage`) →
 *   droit sur la ressource.
 * - « Suivre » une page (`pageFollows`) et « adhérer » sont deux gestes : ce
 *   module ne lit ni n'écrit aucun abonnement.
 * - Aucune fonction ne fait naître l'adhésion d'autrui : une ligne naît de la
 *   demande de la personne elle-même (R-G10) ; aucun import n'en écrit.
 * - Les RESPONSABLES sont les signataires VIVANTS de la page, relus à chaque
 *   acte (`liveSignatoryRole`) : un rôle retiré coupe aussitôt l'accès (R-G11).
 *   Pour tout autre membre, la liste n'existe pas : refus indistinct (R-G14).
 * - Aucune coordonnée ni aucun nom stocké : le nom affiché vient du profil
 *   publié, relu à la lecture. Avis neutres par `serviceNotifications.ts`, jamais d'écriture
 *   directe dans `notifications`.
 * - Le groupe privé lié et l'évènement de page attendent le moteur (hors lot).
 */
import {
  ASSOCIATION_DECISION_REASON_MAX,
  ASSOCIATION_MEMBERSHIP_REFUSALS,
  ASSOCIATION_REMOVAL_REASON_MIN,
  ASSOCIATION_REQUEST_MESSAGE_MAX,
  type AssociationManagementGesture,
  type AssociationMembershipFacts,
  type AssociationMembershipRefusal,
  type AssociationResponsibleRole,
  checkManagementGesture,
  checkMembershipRequest,
  checkSelfWithdrawal,
  isResponsibleRole,
  nextRequestAt,
  parseDecisionReason,
  parseRequestMessage,
  requestStanding,
} from "@diasporale/domain"
import { type PaginationOptions, paginationOptsValidator, paginationResultValidator, type PaginationResult } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { isActiveMember, memberHasStatus } from "../../lib/access"
import { failAppRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { literals } from "../../lib/validators"
import { countLiveAdmins, liveSignatoryRole, readablePageByHandle, readablePageOrNull } from "../pages/access"
import { miniProfileCache } from "../people/miniProfile"
import {
  associationListStatusValidator,
  associationMemberRoleValidator,
  associationMembershipStatusValidator,
  associationResponsibleRoleValidator,
} from "./associationsTables"
import { assertDiasporaNetwork, assertPageOpenTo } from "./facts"
// Avis neutres de la cloche (DG-010), par la porte unique, juste après chaque écriture réussie.
import { noticeAssociationMembershipDecided, noticeAssociationMembershipRequested } from "./serviceNotifications"

/** Une fenêtre de liste : cinquante lignes au plus, deux mégaoctets lus au plus. */
const LIST_PAGE_MAX = 50
const LIST_PAGE_BYTES = 2 * 1024 * 1024

/** La situation avant toute demande : refus du domaine, ou statut insuffisant dans le réseau. */
const requestRefusalValidator = literals([...ASSOCIATION_MEMBERSHIP_REFUSALS, "status_insufficient"] as const)

const ownMembershipValidator = v.object({
  membershipId: v.id("associationMemberships"),
  status: associationMembershipStatusValidator,
  role: associationMemberRoleValidator,
  requestMessage: v.union(v.string(), v.null()),
  /** Le motif d'un refus ou d'une exclusion, lu par la personne concernée ; jamais qui l'a décidé. */
  decisionReason: v.union(v.string(), v.null()),
  requestedAt: v.number(),
  statusChangedAt: v.number(),
  readmissionAllowed: v.boolean(),
})

const myMembershipValidator = v.object({
  pageId: v.id("pages"),
  membership: v.union(ownMembershipValidator, v.null()),
  request: v.object({
    allowed: v.boolean(),
    refusal: v.union(requestRefusalValidator, v.null()),
    availableAt: v.union(v.number(), v.null()),
  }),
  responsibleRole: v.union(associationResponsibleRoleValidator, v.null()),
})

const myAssociationItemValidator = v.object({
  membershipId: v.id("associationMemberships"),
  status: associationMembershipStatusValidator,
  role: associationMemberRoleValidator,
  decisionReason: v.union(v.string(), v.null()),
  statusChangedAt: v.number(),
  page: v.object({ pageId: v.id("pages"), handle: v.string(), name: v.string() }),
})

const memberItemValidator = v.object({
  membershipId: v.id("associationMemberships"),
  status: associationMembershipStatusValidator,
  role: associationMemberRoleValidator,
  /** Le profil PUBLIÉ de la personne (nom neutre `null` sinon) ; aucune coordonnée. */
  person: v.object({
    displayName: v.union(v.string(), v.null()),
    handle: v.union(v.string(), v.null()),
    avatarUrl: v.union(v.string(), v.null()),
  }),
  requestMessage: v.union(v.string(), v.null()),
  decisionReason: v.union(v.string(), v.null()),
  requestedAt: v.number(),
  statusChangedAt: v.number(),
  readmissionAllowed: v.boolean(),
  version: v.number(),
})

const managedAssociationValidator = v.object({
  pageId: v.id("pages"),
  handle: v.string(),
  name: v.string(),
  role: associationResponsibleRoleValidator,
})

export type MyAssociationMembershipDto = typeof myMembershipValidator.type
export type MyAssociationItemDto = typeof myAssociationItemValidator.type
export type AssociationMemberDto = typeof memberItemValidator.type
export type ManagedAssociationDto = typeof managedAssociationValidator.type

type NetworkCtx = QueryCtx & { network: Doc<"networks">; networkId: Id<"networks">; person: Doc<"persons"> }
type MembershipRow = Doc<"associationMemberships">

// ═══════════════════════════════════════════════════════════════
// Gardes
// ═══════════════════════════════════════════════════════════════

/** Refus de conflit (l'état a changé), de saisie, ou de règle : la nature du refus suit le code. */
const CONFLICT_REFUSALS: ReadonlySet<AssociationMembershipRefusal> = new Set([
  "association_request_pending",
  "association_already_member",
  "association_not_pending",
  "association_not_member",
  "association_not_removed",
  "association_version_conflict",
])
const INPUT_REFUSALS: ReadonlySet<AssociationMembershipRefusal> = new Set([
  "association_message_too_long",
  "association_reason_required",
  "association_reason_too_long",
])

function refuseAssociation(code: AssociationMembershipRefusal, params: Record<string, number> = {}): never {
  return failAppRule(code, params, CONFLICT_REFUSALS.has(code) ? "conflict" : INPUT_REFUSALS.has(code) ? "invalidArgument" : "policyRefused")
}

/** Les bornes d'un motif refusé, pour la phrase de l'écran. */
function reasonParams(code: "association_reason_required" | "association_reason_too_long"): Record<string, number> {
  return code === "association_reason_required" ? { min: ASSOCIATION_REMOVAL_REASON_MIN } : { max: ASSOCIATION_DECISION_REASON_MAX }
}

/**
 * La page d'ASSOCIATION lisible d'ici et de CE réseau, ou `null` — page
 * inconnue, retirée, d'un autre réseau ou d'une autre nature : la même réponse.
 */
async function associationPageOrNull(ctx: NetworkCtx, pageId: Id<"pages">): Promise<Doc<"pages"> | null> {
  const page = await readablePageOrNull(ctx, ctx.network, pageId, ctx.person._id)
  return page !== null && page.networkId === ctx.networkId && page.ownerKind === "association" ? page : null
}

/** Le rôle de responsable VIVANT de l'appelant, sinon le refus indistinct (la liste n'existe pas pour lui). */
async function requireResponsible(ctx: NetworkCtx, page: Doc<"pages">): Promise<AssociationResponsibleRole> {
  const role = await liveSignatoryRole(ctx, page, ctx.person._id)
  if (!isResponsibleRole(role)) return notFound()
  return role
}

/** Une association peut-elle traiter une demande ? Il lui faut au moins un administrateur vivant. */
async function isManaged(ctx: NetworkCtx, page: Doc<"pages">): Promise<boolean> {
  return (await countLiveAdmins(ctx, page)) > 0
}

async function membershipRowOf(ctx: NetworkCtx, pageId: Id<"pages">, personId: Id<"persons">): Promise<MembershipRow | null> {
  return await ctx.db
    .query("associationMemberships")
    .withIndex("by_network_and_page_and_person", (q) => q.eq("networkId", ctx.networkId).eq("pageId", pageId).eq("personId", personId))
    .unique()
}

function factsOf(row: MembershipRow | null): AssociationMembershipFacts | null {
  return row ? { status: row.status, statusChangedAt: row.statusChangedAt, readmissionAllowed: row.readmissionAllowedAt !== undefined } : null
}

/** Le motif se lit pour un refus ou une exclusion ; le mot de la demande, tant qu'elle est en cours. */
function shownReason(row: MembershipRow): string | null {
  return row.status === "rejected" || row.status === "removed" ? (row.decisionReason ?? null) : null
}

function bounded(options: PaginationOptions): PaginationOptions {
  return {
    ...options,
    numItems: Math.min(Math.max(Math.trunc(options.numItems), 1), LIST_PAGE_MAX),
    maximumBytesRead: Math.min(options.maximumBytesRead ?? LIST_PAGE_BYTES, LIST_PAGE_BYTES),
  }
}

/**
 * Une ligne gérée par l'appelant : de ce réseau, d'une association lisible dont
 * il est responsable VIVANT, et d'une personne encore membre active du réseau.
 * Sinon, le refus indistinct.
 */
async function managedRow(ctx: NetworkCtx, membershipId: Id<"associationMemberships">): Promise<{ row: MembershipRow; role: AssociationResponsibleRole }> {
  const row = await ctx.db.get(membershipId)
  if (!row || row.networkId !== ctx.networkId) return notFound()
  const page = await associationPageOrNull(ctx, row.pageId)
  if (!page) return notFound()
  const role = await requireResponsible(ctx, page)
  if (!(await isActiveMember(ctx, ctx.networkId, row.personId))) return notFound()
  return { row, role }
}

/** Le geste de gestion, jugé par le domaine sur la ligne relue. */
function judge(gesture: AssociationManagementGesture, context: { row: MembershipRow; role: AssociationResponsibleRole }, expectedVersion: number, actorPersonId: Id<"persons">) {
  const check = checkManagementGesture({
    gesture,
    actorRole: context.role,
    current: context.row.status,
    expectedVersion,
    version: context.row.version,
    isSelf: context.row.personId === actorPersonId,
  })
  if (!check.ok) return refuseAssociation(check.code)
  return check.value
}

// ═══════════════════════════════════════════════════════════════
// Lectures
// ═══════════════════════════════════════════════════════════════

/**
 * Ma situation avec UNE association : ma seule ligne (jamais celle d'autrui),
 * ce que je peux demander, et mon rôle vivant de responsable. Page inconnue,
 * illisible, d'ailleurs ou qui n'est pas une association : refus indistinct.
 */
export const myAssociationMembership = networkQuery({
  minStatus: "en_attente",
  args: { pageId: v.id("pages") },
  returns: myMembershipValidator,
  handler: async (ctx, { pageId }): Promise<MyAssociationMembershipDto> => {
    assertDiasporaNetwork(ctx.network)
    const page = await associationPageOrNull(ctx, pageId)
    if (!page) return notFound()
    const row = await membershipRowOf(ctx, page._id, ctx.person._id)
    const role = await liveSignatoryRole(ctx, page, ctx.person._id)
    const canPublish = await memberHasStatus(ctx, ctx.networkId, ctx.person._id, "declaree")
    // Même ordre que la demande : la capacité de publier (constructeur) avant les règles de l'adhésion.
    const request = canPublish
      ? requestStanding({ previous: factsOf(row), managed: await isManaged(ctx, page) }, Date.now())
      : { allowed: false, refusal: "status_insufficient" as const, availableAt: null }
    return {
      pageId: page._id,
      membership: row
        ? {
          membershipId: row._id,
          status: row.status,
          role: row.role,
          requestMessage: row.status === "requested" ? (row.requestMessage ?? null) : null,
          decisionReason: shownReason(row),
          requestedAt: row.requestedAt,
          statusChangedAt: row.statusChangedAt,
          readmissionAllowed: row.readmissionAllowedAt !== undefined,
        }
        : null,
      request,
      responsibleRole: isResponsibleRole(role) ? role : null,
    }
  },
})

/** Mes adhésions et demandes, les plus récemment changées d'abord ; une association devenue illisible n'y paraît plus. */
export const myAssociations = networkQuery({
  minStatus: "en_attente",
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(myAssociationItemValidator),
  handler: async (ctx, { paginationOpts }): Promise<PaginationResult<MyAssociationItemDto>> => {
    assertDiasporaNetwork(ctx.network)
    const result = await ctx.db
      .query("associationMemberships")
      .withIndex("by_network_and_person_and_statusChangedAt", (q) => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id))
      .order("desc")
      .paginate(bounded(paginationOpts))
    const page: MyAssociationItemDto[] = []
    for (const row of result.page) {
      const association = await associationPageOrNull(ctx, row.pageId)
      if (!association) continue
      page.push({
        membershipId: row._id,
        status: row.status,
        role: row.role,
        decisionReason: shownReason(row),
        statusChangedAt: row.statusChangedAt,
        page: { pageId: association._id, handle: association.handle, name: association.name },
      })
    }
    return { ...result, page }
  },
})

/** L'association que je gère, désignée par son adresse : responsable vivant seulement, sinon refus indistinct. */
export const managedAssociation = networkQuery({
  minStatus: "en_attente",
  args: { handle: v.string() },
  returns: managedAssociationValidator,
  handler: async (ctx, { handle }): Promise<ManagedAssociationDto> => {
    assertDiasporaNetwork(ctx.network)
    const page = await readablePageByHandle(ctx, ctx.network, handle, ctx.person._id)
    if (!page || page.networkId !== ctx.networkId || page.ownerKind !== "association") return notFound()
    const role = await requireResponsible(ctx, page)
    return { pageId: page._id, handle: page.handle, name: page.name, role }
  },
})

/**
 * Les demandes en attente (les plus anciennes d'abord), les adhérents (par
 * ancienneté) ou les exclusions (les plus récentes d'abord) d'une association —
 * pour ses responsables VIVANTS seulement (R-G14). Une personne partie du
 * réseau ou suspendue n'y paraît pas tant qu'elle n'y est pas revenue.
 */
export const associationMembers = networkQuery({
  minStatus: "en_attente",
  args: { pageId: v.id("pages"), status: associationListStatusValidator, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(memberItemValidator),
  handler: async (ctx, { pageId, status, paginationOpts }): Promise<PaginationResult<AssociationMemberDto>> => {
    assertDiasporaNetwork(ctx.network)
    const page = await associationPageOrNull(ctx, pageId)
    if (!page) return notFound()
    await requireResponsible(ctx, page)
    const result = await ctx.db
      .query("associationMemberships")
      .withIndex("by_network_and_page_and_status_and_statusChangedAt", (q) => q.eq("networkId", ctx.networkId).eq("pageId", page._id).eq("status", status))
      .order(status === "removed" ? "desc" : "asc")
      .paginate(bounded(paginationOpts))
    const profileOf = miniProfileCache(ctx)
    const items: AssociationMemberDto[] = []
    for (const row of result.page) {
      if (!(await isActiveMember(ctx, ctx.networkId, row.personId))) continue
      const profile = await profileOf(row.personId)
      items.push({
        membershipId: row._id,
        status: row.status,
        role: row.role,
        person: { displayName: profile.displayName, handle: profile.handle, avatarUrl: profile.avatarUrl },
        requestMessage: row.status === "requested" ? (row.requestMessage ?? null) : null,
        decisionReason: shownReason(row),
        requestedAt: row.requestedAt,
        statusChangedAt: row.statusChangedAt,
        readmissionAllowed: row.readmissionAllowedAt !== undefined,
        version: row.version,
      })
    }
    return { ...result, page: items }
  },
})

// ═══════════════════════════════════════════════════════════════
// Gestes de la personne
// ═══════════════════════════════════════════════════════════════

/**
 * Demander à adhérer — la capacité de publier (déclarée ou vérifiée), une
 * association active, lisible et gérée, ni adhésion ni demande en cours. Une
 * nouvelle demande suit la règle du domaine (délai après un refus, décision
 * des responsables après une exclusion). Aucun accès anticipé à quoi que ce soit.
 */
export const requestAssociationMembership = networkMutation({
  minStatus: "declaree",
  args: { pageId: v.id("pages"), message: v.optional(v.string()) },
  returns: v.object({ membershipId: v.id("associationMemberships"), version: v.number() }),
  handler: async (ctx, { pageId, message }) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "diaspora.association.membership", ctx.person._id)
    const page = await associationPageOrNull(ctx, pageId)
    if (!page) return notFound()
    // RP-03 : tous les responsables vivants en blocage avec la personne, l'association se tait comme retirée.
    await assertPageOpenTo(ctx, page, ctx.person._id)
    const text = parseRequestMessage(message)
    if (!text.ok) return refuseAssociation(text.code, { max: ASSOCIATION_REQUEST_MESSAGE_MAX })
    const row = await membershipRowOf(ctx, page._id, ctx.person._id)
    const now = Date.now()
    const previous = factsOf(row)
    const check = checkMembershipRequest({ previous, managed: await isManaged(ctx, page) }, now)
    if (!check.ok) return refuseAssociation(check.code, check.code === "association_request_too_soon" ? { availableAt: nextRequestAt(previous) ?? now } : {})
    const requestMessage = text.value === null ? {} : { requestMessage: text.value }
    if (row) {
      const version = row.version + 1
      await ctx.db.patch(row._id, {
        status: "requested",
        role: "member",
        requestMessage: text.value ?? undefined,
        decisionReason: undefined,
        decidedAt: undefined,
        decidedByPersonId: undefined,
        readmissionAllowedAt: undefined,
        requestedAt: now,
        statusChangedAt: now,
        updatedAt: now,
        version,
      })
      await noticeAssociationMembershipRequested(ctx, row._id)
      return { membershipId: row._id, version }
    }
    const membershipId = await ctx.db.insert("associationMemberships", {
      networkId: ctx.networkId,
      pageId: page._id,
      personId: ctx.person._id,
      status: "requested",
      role: "member",
      ...requestMessage,
      requestedAt: now,
      statusChangedAt: now,
      version: 1,
      createdAt: now,
      updatedAt: now,
    })
    await noticeAssociationMembershipRequested(ctx, membershipId)
    return { membershipId, version: 1 }
  },
})

/** Annuler ma demande en cours. Toujours possible, même devenu « en attente » dans le réseau. */
export const cancelAssociationMembershipRequest = networkMutation({
  minStatus: "en_attente",
  args: { pageId: v.id("pages") },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, { pageId }) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "diaspora.association.membership", ctx.person._id)
    const row = await membershipRowOf(ctx, pageId, ctx.person._id)
    const check = checkSelfWithdrawal("cancel", row?.status ?? null)
    if (!check.ok) return refuseAssociation(check.code)
    // Inatteignable : la règle refuse déjà l'absence de ligne.
    if (!row) return notFound()
    const now = Date.now()
    const version = row.version + 1
    await ctx.db.patch(row._id, { status: check.value, statusChangedAt: now, updatedAt: now, version })
    return { version }
  },
})

/** Quitter une association dont je suis adhérent : mon geste, jamais une décision des responsables. */
export const leaveAssociation = networkMutation({
  minStatus: "en_attente",
  args: { pageId: v.id("pages") },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, { pageId }) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "diaspora.association.membership", ctx.person._id)
    const row = await membershipRowOf(ctx, pageId, ctx.person._id)
    const check = checkSelfWithdrawal("leave", row?.status ?? null)
    if (!check.ok) return refuseAssociation(check.code)
    // Inatteignable : la règle refuse déjà l'absence de ligne.
    if (!row) return notFound()
    const now = Date.now()
    const version = row.version + 1
    await ctx.db.patch(row._id, { status: check.value, role: "member", statusChangedAt: now, updatedAt: now, version })
    return { version }
  },
})

// ═══════════════════════════════════════════════════════════════
// Gestes des responsables
// ═══════════════════════════════════════════════════════════════

/** Accepter ou refuser une demande (tout responsable vivant), à la version lue ; un refus peut être motivé. */
export const decideAssociationMembership = networkMutation({
  minStatus: "declaree",
  args: {
    membershipId: v.id("associationMemberships"),
    decision: v.union(v.literal("accept"), v.literal("reject")),
    expectedVersion: v.number(),
    reason: v.optional(v.string()),
  },
  returns: v.object({ status: associationMembershipStatusValidator, version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "diaspora.association.manage", ctx.person._id)
    const managed = await managedRow(ctx, args.membershipId)
    const status = judge(args.decision, managed, args.expectedVersion, ctx.person._id)
    let decisionReason: string | null = null
    if (args.decision === "reject") {
      const reason = parseDecisionReason(args.reason, { required: false })
      if (!reason.ok) return refuseAssociation(reason.code, reasonParams(reason.code))
      decisionReason = reason.value
    }
    const now = Date.now()
    const version = managed.row.version + 1
    await ctx.db.patch(managed.row._id, {
      status,
      role: "member",
      decisionReason: decisionReason ?? undefined,
      decidedAt: now,
      decidedByPersonId: ctx.person._id,
      statusChangedAt: now,
      updatedAt: now,
      version,
    })
    await noticeAssociationMembershipDecided(ctx, managed.row._id, ctx.person._id)
    return { status, version }
  },
})

/** Exclure un adhérent : un administrateur de la page, motif obligatoire ; on ne s'exclut pas soi-même (on quitte). */
export const removeAssociationMember = networkMutation({
  minStatus: "declaree",
  args: { membershipId: v.id("associationMemberships"), expectedVersion: v.number(), reason: v.string() },
  returns: v.object({ status: associationMembershipStatusValidator, version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "diaspora.association.manage", ctx.person._id)
    const managed = await managedRow(ctx, args.membershipId)
    const status = judge("remove", managed, args.expectedVersion, ctx.person._id)
    const reason = parseDecisionReason(args.reason, { required: true })
    if (!reason.ok) return refuseAssociation(reason.code, reasonParams(reason.code))
    const now = Date.now()
    const version = managed.row.version + 1
    await ctx.db.patch(managed.row._id, {
      status,
      role: "member",
      decisionReason: reason.value ?? undefined,
      decidedAt: now,
      decidedByPersonId: ctx.person._id,
      readmissionAllowedAt: undefined,
      statusChangedAt: now,
      updatedAt: now,
      version,
    })
    await noticeAssociationMembershipDecided(ctx, managed.row._id, ctx.person._id)
    return { status, version }
  },
})

/** Nommer un adhérent animateur, ou le repasser membre : un administrateur de la page ; rejouer le même rôle ne fait rien. */
export const setAssociationMemberRole = networkMutation({
  minStatus: "declaree",
  args: { membershipId: v.id("associationMemberships"), expectedVersion: v.number(), role: associationMemberRoleValidator },
  returns: v.object({ role: associationMemberRoleValidator, version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "diaspora.association.manage", ctx.person._id)
    const managed = await managedRow(ctx, args.membershipId)
    judge("set_role", managed, args.expectedVersion, ctx.person._id)
    if (managed.row.role === args.role) return { role: args.role, version: managed.row.version }
    const version = managed.row.version + 1
    await ctx.db.patch(managed.row._id, { role: args.role, updatedAt: Date.now(), version })
    return { role: args.role, version }
  },
})

/**
 * Autoriser une personne exclue à demander de nouveau : une DÉCISION d'un
 * administrateur de la page. Elle n'inscrit personne : la personne garde le
 * geste de redemander. Rejouer l'autorisation ne fait rien.
 */
export const allowAssociationReadmission = networkMutation({
  minStatus: "declaree",
  args: { membershipId: v.id("associationMemberships"), expectedVersion: v.number() },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "diaspora.association.manage", ctx.person._id)
    const managed = await managedRow(ctx, args.membershipId)
    judge("allow_readmission", managed, args.expectedVersion, ctx.person._id)
    if (managed.row.readmissionAllowedAt !== undefined) return { version: managed.row.version }
    const now = Date.now()
    const version = managed.row.version + 1
    await ctx.db.patch(managed.row._id, { readmissionAllowedAt: now, updatedAt: now, version })
    return { version }
  },
})
