/**
 * SU01h — mesures sur ordre du juge (référé numérique, ordonnance n° 0011/PR/2026, art. 39 à 44).
 *
 * L'exploitant exécute une décision « d'heure à heure » (art. 41) et en garde la preuve horodatée.
 * Décision du propriétaire du 9/11/2026 (plan 12, décision 2) : UN opérateur exécute tout de suite,
 * un SECOND confirme ensuite (jamais celui qui a exécuté). Une mesure non confirmée dans le délai
 * (`JUDICIAL_CONFIRMATION_DELAY_MS`) ne se lève pas d'elle-même : la console la signale en alerte.
 *
 * Les sept genres RÉUTILISENT les effets existants : la suspension racine (`people/memberships.ts`), la
 * mise hors ligne d'une page (`pages/admin.ts`), le retrait et le rétablissement de la modération
 * (`./targets.ts`). Le déréférencement, le correctif, l'étiquette, la restriction de fonction et la
 * suspension d'accès sont relus par les gardes (`./judicialHolds.ts`) : rien n'est supprimé.
 *
 * Chaque geste est une `operatorMutation` motivée, débitée et journalisée (`appendAudit`, cliquet
 * `operator-audit`) ; le journal montre qui, quand, quel genre, quelle référence. Le passage d'une minute
 * lève les mesures échues (art. 44 : 72 h au plus) et purge les mesures levées au terme de leur
 * conservation. La personne visée lit la mesure qui la concerne dans « Mes données », sans la référence
 * de l'ordonnance ni l'identité des opérateurs.
 */
import { assertDecisionReason } from "@antsia/social-domain/audit"
import { normalizeHandle } from "@antsia/social-domain/content"
import {
  ARTICLE_44_KINDS,
  isJudicialMeasureLive,
  JUDICIAL_LIFT_CAUSES,
  JUDICIAL_MEASURE_KINDS,
  JUDICIAL_MEASURE_RETENTION_MS,
  JUDICIAL_MEASURE_STATUSES,
  JUDICIAL_NOTICE_KINDS,
  JUDICIAL_REASON_MIN,
  JUDICIAL_TARGET_KINDS,
  type JudicialLiftCause,
  judicialConfirmationDueAt,
  judicialLapseReminderAt,
  judicialMeasureProblem,
  RESTRICTABLE_FEATURES,
} from "@antsia/social-domain/judicialMeasures"
import type { ModerationSurface } from "@antsia/social-domain/moderationPolicy"
import { paginationOptsValidator } from "convex/server"
import { ConvexError, v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc, Id, TableNames } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { getMembership, getRootNetwork } from "../../lib/access"
import { checked, fail, notFound } from "../../lib/errors"
import { networkQuery, operatorMutation, operatorQuery, personQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { literals } from "../../lib/validators"
import { isBlockedBetween } from "../graph/graph"
import { applyPageStatus } from "../pages/admin"
import { findPageByHandle, readablePageByHandle } from "../pages/access"
import { liftRootSuspension, suspendRootMembership } from "../people/memberships"
import { findPublishedPersonByHandle } from "../people/miniProfile"
import { appendAudit, operatorCapacity } from "../platform/audit"
import { canSeePostDoc } from "../posts/access"
import { deferRestorationToJudicialHold, JUDICIAL_HOLD_SCAN_LIMIT, liveJudicialNotices } from "./judicialHolds"
import { contentState, hasLiveGlobalSanction } from "./policy"
import { judicialMeasureTargetValidator, moderationTargetValidator } from "./tables"
import { removeTarget, restoreTarget } from "./targets"

type ReadCtx = Pick<QueryCtx, "db">
type Measure = Doc<"judicialMeasures">
type JudicialTarget = Measure["target"]
type ContentTarget = Exclude<JudicialTarget, { kind: "network" | "person" | "page" }>

const PAGE_MAX = 25
const RUN_BATCH = 10
const PURGE_BATCH = 50
const MY_MEASURES_MAX = 20
const REF_MAX = 200

/** Le correctif ou l'étiquette, tels qu'un écran les affiche au-dessus du contenu ou du profil. */
export const judicialNoticeValidator = v.object({ kind: literals(JUDICIAL_NOTICE_KINDS), text: v.string(), startsAt: v.number() })

/** La table de chaque nature de cible, lue dans le validateur des cibles de la modération (aucune liste recopiée). */
const TARGET_TABLES: ReadonlyMap<string, TableNames> = new Map(moderationTargetValidator.members.map((member): [string, TableNames] => [member.fields.kind.value, member.fields.id.tableName as TableNames]))

/** Le champ qui désigne l'AUTEUR d'un contenu, quand le contenu n'a pas encore d'état de modération qui le porte. */
const OWNER_FIELDS: Partial<Record<ModerationSurface, string>> = {
  post: "authorPersonId", comment: "authorPersonId", story: "authorPersonId", live: "hostPersonId", album: "ownerPersonId",
  event: "organizerPersonId", groupMessage: "senderPersonId", personalMessage: "senderPersonId", commercialMessage: "senderPersonId",
  contextualMessage: "authorPersonId", professionalProfile: "personId", professionalCollaboration: "fromPersonId", serviceReview: "authorPersonId",
  diasporaAidQuestion: "authorPersonId", diasporaAidAnswer: "authorPersonId", diasporaMentorProfile: "personId", diasporaMentoringRequest: "menteePersonId",
  diasporaKitResource: "authorPersonId", diasporaTalentProfile: "personId", diasporaJobApplication: "candidatePersonId",
}

function isContentTarget(target: JudicialTarget): target is ContentTarget {
  return target.kind !== "network" && target.kind !== "person" && target.kind !== "page"
}

const motiveOf = (reason: string) => checked(() => assertDecisionReason(reason, JUDICIAL_REASON_MIN))

type Described = { networkId: Id<"networks">; subjectPersonId?: Id<"persons">; label: string | null; createdAt: number; moderationStatus: Doc<"moderationContentStates">["status"] | null }

/** Ce qu'un opérateur doit voir avant d'exécuter : le réseau, la personne visée, l'état — jamais le corps du contenu. */
async function describeTarget(ctx: ReadCtx, root: Doc<"networks">, target: JudicialTarget): Promise<Described | null> {
  if (target.kind === "network") {
    const network = await ctx.db.get(target.id)
    return network && network.status === "active" ? { networkId: network._id, label: network.name, createdAt: network._creationTime, moderationStatus: null } : null
  }
  const state = await contentState(ctx, target.kind, target.id)
  if (target.kind === "person") {
    const person = await ctx.db.get(target.id)
    if (!person || person.erasedAt !== undefined) return null
    return { networkId: root._id, subjectPersonId: person._id, label: person.handle ? `@${person.handle}` : null, createdAt: person._creationTime, moderationStatus: state?.status ?? null }
  }
  if (target.kind === "page") {
    const page = await ctx.db.get(target.id)
    return page ? { networkId: page.networkId, label: page.handle, createdAt: page._creationTime, moderationStatus: state?.status ?? null } : null
  }
  const doc = (await ctx.db.get(target.id)) as unknown as Record<string, unknown> | null
  if (!doc) return null
  const networkId = typeof doc.networkId === "string" ? ctx.db.normalizeId("networks", doc.networkId) : null
  const field = OWNER_FIELDS[target.kind]
  // Une publication de page appartient à la page : son signataire n'en est pas l'auteur personnel.
  const pageAuthored = target.kind === "post" && doc.pageId !== undefined
  const rawOwner = !pageAuthored && field !== undefined ? doc[field] : undefined
  const fieldOwner = typeof rawOwner === "string" ? ctx.db.normalizeId("persons", rawOwner) : null
  const owner = state?.ownerPersonId ?? fieldOwner ?? undefined
  const author = owner ? await ctx.db.get(owner) : null
  return {
    networkId: networkId ?? state?.networkId ?? root._id,
    ...(owner ? { subjectPersonId: owner } : {}),
    label: author?.handle ? `@${author.handle}` : null,
    createdAt: typeof doc._creationTime === "number" ? doc._creationTime : 0,
    moderationStatus: state?.status ?? null,
  }
}

async function activeOnTarget(ctx: ReadCtx, target: JudicialTarget): Promise<Measure[]> {
  const rows = await ctx.db.query("judicialMeasures").withIndex("by_target_status", (q) => q.eq("targetKind", target.kind).eq("targetId", target.id).eq("status", "active")).take(JUDICIAL_HOLD_SCAN_LIMIT + 1)
  if (rows.length > JUDICIAL_HOLD_SCAN_LIMIT) return fail("policyRefused")
  return rows
}

/** Les effets d'une mesure qui vient d'être exécutée ; ceux déjà en place (compte suspendu, page hors ligne, contenu retiré) ne sont pas à elle. */
async function applyEffects(ctx: MutationCtx, root: Doc<"networks">, kind: Measure["kind"], target: JudicialTarget, described: Described, endsAt: number | undefined, now: number): Promise<Measure["effects"]> {
  const effects = { membershipSuspended: false, pageDeactivated: false, contentRemoved: false }
  if (kind === "suspend_account" && target.kind === "person") {
    const membership = await getMembership(ctx, root._id, target.id)
    if (membership) effects.membershipSuspended = await suspendRootMembership(ctx, membership, endsAt)
  } else if (kind === "suspend_account" && target.kind === "page") {
    const page = await ctx.db.get(target.id)
    if (page?.status === "active") {
      await applyPageStatus(ctx, page, "inactive", now)
      effects.pageDeactivated = true
    }
  } else if (kind === "suspend_content" && isContentTarget(target)) {
    const state = await contentState(ctx, target.kind, target.id)
    // Un contenu en relecture n'est servi à personne : la mesure le tient sans le retirer (la relecture ne le publiera pas).
    if (!state || state.status === "published") {
      await removeTarget(ctx, { target, networkId: described.networkId, ...(described.subjectPersonId ? { ownerPersonId: described.subjectPersonId } : {}) })
      effects.contentRemoved = true
    }
  }
  return effects
}

/**
 * Défaire, à la levée, ce que la mesure a changé — sauf si une AUTRE mesure vivante tient la même
 * cible (elle en reprend la charge), si la modération garde sa propre suspension ou son propre retrait.
 */
async function releaseEffects(ctx: MutationCtx, row: Measure, now: number): Promise<void> {
  const target = row.target
  if (row.effects.membershipSuspended && target.kind === "person") {
    if (await deferRestorationToJudicialHold(ctx, "person", target.id, "suspend_account", "membershipSuspended")) return
    // Une sanction vivante de la modération garde la suspension ; son échéance la lèvera (`refreshSuspension`).
    if (await hasLiveGlobalSanction(ctx, target.id)) return
    const root = await getRootNetwork(ctx)
    const membership = root ? await getMembership(ctx, root._id, target.id) : null
    if (membership?.status === "suspendue") await liftRootSuspension(ctx, membership)
  }
  if (row.effects.pageDeactivated && target.kind === "page") {
    if (await deferRestorationToJudicialHold(ctx, "page", target.id, "suspend_account", "pageDeactivated")) return
    const page = await ctx.db.get(target.id)
    if (page?.status === "inactive") await applyPageStatus(ctx, page, "active", now)
  }
  if (row.effects.contentRemoved && isContentTarget(target)) {
    // Un retrait décidé par la modération demeure ; `restoreTarget` cède aussi à une autre mesure vivante.
    const removing = await ctx.db.query("reports").withIndex("by_target_status", (q) => q.eq("targetKind", target.kind).eq("targetId", target.id).eq("status", "actioned")).take(101)
    if (removing.length > 100 || removing.some((report) => report.removedTarget)) return
    if (!(await ctx.db.get(target.id))) return
    try {
      await restoreTarget(ctx, { target, networkId: row.networkId, ...(row.subjectPersonId ? { ownerPersonId: row.subjectPersonId } : {}) })
    } catch (error) {
      // Un contenu qui ne peut plus être servi (source retirée, offre sortie du catalogue) reste retiré :
      // la levée de la mesure, elle, a lieu (le refus de `restoreTarget` précède toute écriture).
      if (!(error instanceof ConvexError)) throw error
    }
  }
}

async function liftRow(ctx: MutationCtx, row: Measure, lift: { cause: JudicialLiftCause; now: number; personId?: Id<"persons"> }): Promise<void> {
  await ctx.db.patch(row._id, { status: "lifted", liftedAt: lift.now, liftCause: lift.cause, ...(lift.personId ? { liftedByPersonId: lift.personId } : {}), updatedAt: lift.now })
  await releaseEffects(ctx, row, lift.now)
}

/** Console : exécuter une mesure sur ordre, tout de suite. Le second opérateur la confirmera (`confirmMeasure`). */
export const openMeasure = operatorMutation({
  args: {
    kind: literals(JUDICIAL_MEASURE_KINDS),
    target: judicialMeasureTargetValidator,
    orderReference: v.string(),
    startsAt: v.number(),
    endsAt: v.optional(v.number()),
    feature: v.optional(literals(RESTRICTABLE_FEATURES)),
    correctionText: v.optional(v.string()),
    originLabel: v.optional(v.string()),
    reason: v.string(),
  },
  returns: v.object({ measureId: v.id("judicialMeasures"), created: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "operator.judicial", ctx.person._id)
    const reason = motiveOf(args.reason)
    const now = Date.now()
    const orderReference = args.orderReference.trim()
    const correctionText = args.correctionText?.trim()
    const originLabel = args.originLabel?.trim()
    const problem = judicialMeasureProblem({
      kind: args.kind, targetKind: args.target.kind, orderReference, startsAt: args.startsAt,
      ...(args.endsAt !== undefined ? { endsAt: args.endsAt } : {}),
      ...(args.feature !== undefined ? { feature: args.feature } : {}),
      ...(correctionText !== undefined ? { correctionText } : {}),
      ...(originLabel !== undefined ? { originLabel } : {}),
    }, now)
    if (problem) return fail("invalidArgument", { field: problem })
    const root = await getRootNetwork(ctx)
    if (!root) return notFound()
    const described = await describeTarget(ctx, root, args.target)
    if (!described) return notFound()
    // Idempotence : la même mesure (genre, cible, référence) encore active est la réponse — un double clic n'exécute pas deux fois.
    const same = (await activeOnTarget(ctx, args.target)).find((row) => row.kind === args.kind && row.orderReference === orderReference)
    if (same) return { measureId: same._id, created: false }
    const measureId = await ctx.db.insert("judicialMeasures", {
      networkId: described.networkId, kind: args.kind, target: args.target, targetKind: args.target.kind, targetId: args.target.id,
      ...(described.subjectPersonId ? { subjectPersonId: described.subjectPersonId } : {}),
      orderReference,
      ...(args.feature !== undefined ? { feature: args.feature } : {}),
      ...(correctionText !== undefined ? { correctionText } : {}),
      ...(originLabel !== undefined ? { originLabel } : {}),
      status: "active", startsAt: args.startsAt, ...(args.endsAt !== undefined ? { endsAt: args.endsAt } : {}), executedAt: now,
      createdByPersonId: ctx.person._id, effects: { membershipSuspended: false, pageDeactivated: false, contentRemoved: false },
      createdAt: now, updatedAt: now,
    })
    const effects = await applyEffects(ctx, root, args.kind, args.target, described, args.endsAt, now)
    if (effects.membershipSuspended || effects.pageDeactivated || effects.contentRemoved) await ctx.db.patch(measureId, { effects })
    await appendAudit(ctx, {
      action: "judicial.measure_open",
      capacity: operatorCapacity(ctx.operator),
      actorPersonId: ctx.person._id,
      networkId: described.networkId,
      subject: { table: "judicialMeasures", id: measureId },
      details: { reason, kind: args.kind, targetKind: args.target.kind, orderReference, startsAt: args.startsAt, endsAt: args.endsAt ?? null, feature: args.feature ?? null },
      at: now,
    })
    return { measureId, created: true }
  },
})

/** Console : confirmer une mesure exécutée — par un AUTRE opérateur que celui qui l'a exécutée. */
export const confirmMeasure = operatorMutation({
  args: { measureId: v.id("judicialMeasures"), reason: v.string() },
  returns: v.object({ confirmed: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "operator.judicial", ctx.person._id)
    const reason = motiveOf(args.reason)
    const row = await ctx.db.get(args.measureId)
    if (!row) return notFound()
    if (row.status !== "active") return fail("conflict")
    // La double validation : l'exécutant ne se confirme jamais lui-même.
    if (row.createdByPersonId === ctx.person._id) return fail("policyRefused")
    if (row.confirmedAt !== undefined) return { confirmed: false }
    const now = Date.now()
    await ctx.db.patch(row._id, { confirmedAt: now, confirmedByPersonId: ctx.person._id, updatedAt: now })
    await appendAudit(ctx, {
      action: "judicial.measure_confirm",
      capacity: operatorCapacity(ctx.operator),
      actorPersonId: ctx.person._id,
      networkId: row.networkId,
      subject: { table: "judicialMeasures", id: row._id },
      details: { reason, kind: row.kind, orderReference: row.orderReference, lateBy: Math.max(0, now - judicialConfirmationDueAt(row)) },
      at: now,
    })
    return { confirmed: true }
  },
})

/** Console (art. 43) : une action au fond est engagée — le rappel de caducité se tait, la mesure continue. */
export const noteMeritsAction = operatorMutation({
  args: { measureId: v.id("judicialMeasures"), reason: v.string() },
  returns: v.object({ noted: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "operator.judicial", ctx.person._id)
    const reason = motiveOf(args.reason)
    const row = await ctx.db.get(args.measureId)
    if (!row) return notFound()
    if (row.status !== "active") return fail("conflict")
    if (row.meritsActionNotedAt !== undefined) return { noted: false }
    const now = Date.now()
    await ctx.db.patch(row._id, { meritsActionNotedAt: now, updatedAt: now })
    await appendAudit(ctx, {
      action: "judicial.merits_action_note",
      capacity: operatorCapacity(ctx.operator),
      actorPersonId: ctx.person._id,
      networkId: row.networkId,
      subject: { table: "judicialMeasures", id: row._id },
      details: { reason, kind: row.kind, orderReference: row.orderReference },
      at: now,
    })
    return { noted: true }
  },
})

/** Console : lever une mesure avant son échéance (mainlevée, caducité, erreur), motif à l'appui. */
export const liftMeasure = operatorMutation({
  args: { measureId: v.id("judicialMeasures"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "operator.judicial", ctx.person._id)
    const reason = motiveOf(args.reason)
    const row = await ctx.db.get(args.measureId)
    if (!row) return notFound()
    if (row.status !== "active") return fail("conflict")
    const now = Date.now()
    await liftRow(ctx, row, { cause: "operator", now, personId: ctx.person._id })
    await appendAudit(ctx, {
      action: "judicial.measure_lift",
      capacity: operatorCapacity(ctx.operator),
      actorPersonId: ctx.person._id,
      networkId: row.networkId,
      subject: { table: "judicialMeasures", id: row._id },
      details: { reason, kind: row.kind, targetKind: row.targetKind, orderReference: row.orderReference },
      at: now,
    })
    return null
  },
})

/**
 * Le passage d'une minute : lève les mesures échues (l'art. 44 en borne la durée à 72 h), puis purge
 * les mesures levées au terme de leur conservation. Tranches bornées, poursuivies par chaîne.
 */
export const runDueMeasures = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const now = Date.now()
    const due = await ctx.db.query("judicialMeasures").withIndex("by_status_endsAt", (q) => q.eq("status", "active").gte("endsAt", 0).lte("endsAt", now)).take(RUN_BATCH)
    for (const row of due) {
      await liftRow(ctx, row, { cause: "expired", now })
      await appendAudit(ctx, { action: "judicial.measure_expire", capacity: "system", networkId: row.networkId, subject: { table: "judicialMeasures", id: row._id }, details: { kind: row.kind, targetKind: row.targetKind, orderReference: row.orderReference }, at: now })
    }
    const stale = await ctx.db.query("judicialMeasures").withIndex("by_status_liftedAt", (q) => q.eq("status", "lifted").gte("liftedAt", 0).lte("liftedAt", now - JUDICIAL_MEASURE_RETENTION_MS)).take(PURGE_BATCH)
    for (const row of stale) await ctx.db.delete(row._id)
    if (due.length === RUN_BATCH || stale.length === PURGE_BATCH) await ctx.scheduler.runAfter(0, internal.modules.moderation.measures.runDueMeasures, {})
    return null
  },
})

async function operatorRef(ctx: ReadCtx, personId: Id<"persons"> | undefined) {
  if (personId === undefined) return null
  const person = await ctx.db.get(personId)
  return { personId, displayName: person?.displayName ?? null }
}

async function targetLabel(ctx: ReadCtx, target: JudicialTarget): Promise<string | null> {
  if (target.kind === "network") return (await ctx.db.get(target.id))?.name ?? null
  if (target.kind === "person") {
    const person = await ctx.db.get(target.id)
    return person?.handle ? `@${person.handle}` : null
  }
  if (target.kind === "page") return (await ctx.db.get(target.id))?.handle ?? null
  return null
}

async function consoleDto(ctx: ReadCtx, row: Measure, viewerPersonId: Id<"persons">) {
  return {
    measureId: row._id, networkId: row.networkId, networkName: (await ctx.db.get(row.networkId))?.name ?? null,
    kind: row.kind, target: row.target, targetLabel: await targetLabel(ctx, row.target), hasSubject: row.subjectPersonId !== undefined,
    orderReference: row.orderReference, feature: row.feature ?? null, correctionText: row.correctionText ?? null, originLabel: row.originLabel ?? null,
    status: row.status, startsAt: row.startsAt, endsAt: row.endsAt ?? null, executedAt: row.executedAt,
    confirmationDueAt: judicialConfirmationDueAt(row), lapseReminderAt: judicialLapseReminderAt(row),
    createdBy: await operatorRef(ctx, row.createdByPersonId), createdByMe: row.createdByPersonId === viewerPersonId,
    confirmedAt: row.confirmedAt ?? null, confirmedBy: await operatorRef(ctx, row.confirmedByPersonId),
    meritsActionNotedAt: row.meritsActionNotedAt ?? null,
    liftedAt: row.liftedAt ?? null, liftCause: row.liftCause ?? null, liftedBy: await operatorRef(ctx, row.liftedByPersonId),
    effects: row.effects,
  }
}

/** Console : les mesures actives (ou levées, encore conservées), la plus récente d'abord, avec leur preuve horodatée. */
export const paginateMeasures = operatorQuery({
  args: { status: literals(JUDICIAL_MEASURE_STATUSES), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db.query("judicialMeasures").withIndex("by_status_createdAt", (q) => q.eq("status", args.status)).order("desc").paginate({ ...args.paginationOpts, numItems: Math.max(1, Math.min(PAGE_MAX, args.paginationOpts.numItems)) })
    const page = []
    for (const row of result.page) page.push(await consoleDto(ctx, row, ctx.person._id))
    return { ...result, page }
  },
})

/** Console : l'horloge des mesures actives (au plus 200), pour l'alerte de confirmation et de caducité. */
export const activeMeasureClock = operatorQuery({
  args: {},
  returns: v.object({ measures: v.array(v.object({ measureId: v.id("judicialMeasures"), status: literals(JUDICIAL_MEASURE_STATUSES), startsAt: v.number(), endsAt: v.optional(v.number()), executedAt: v.number(), confirmedAt: v.optional(v.number()), meritsActionNotedAt: v.optional(v.number()) })), truncated: v.boolean() }),
  handler: async (ctx) => {
    const rows = await ctx.db.query("judicialMeasures").withIndex("by_status_createdAt", (q) => q.eq("status", "active")).order("desc").take(201)
    return {
      measures: rows.slice(0, 200).map((row) => ({ measureId: row._id, status: row.status, startsAt: row.startsAt, executedAt: row.executedAt, ...(row.endsAt !== undefined ? { endsAt: row.endsAt } : {}), ...(row.confirmedAt !== undefined ? { confirmedAt: row.confirmedAt } : {}), ...(row.meritsActionNotedAt !== undefined ? { meritsActionNotedAt: row.meritsActionNotedAt } : {}) })),
      truncated: rows.length > 200,
    }
  },
})

/**
 * Console : vérifier la cible AVANT d'exécuter — un profil ou une page par son adresse, un réseau par
 * son identifiant court, tout autre contenu par son identifiant. Le corps du contenu n'est jamais rendu.
 */
export const previewTarget = operatorQuery({
  args: { kind: literals(JUDICIAL_TARGET_KINDS), ref: v.string() },
  returns: v.union(v.null(), v.object({ target: judicialMeasureTargetValidator, networkId: v.id("networks"), networkName: v.union(v.string(), v.null()), label: v.union(v.string(), v.null()), createdAt: v.number(), moderationStatus: v.union(v.literal("published"), v.literal("pending_review"), v.literal("removed"), v.null()), activeMeasures: v.number() })),
  handler: async (ctx, args) => {
    const ref = args.ref.trim()
    if (ref.length === 0 || ref.length > REF_MAX) return null
    const root = await getRootNetwork(ctx)
    if (!root) return null
    let target: JudicialTarget | null = null
    if (args.kind === "network") {
      const network = await ctx.db.query("networks").withIndex("by_slug", (q) => q.eq("slug", ref.toLowerCase())).unique()
      const id = network?._id ?? ctx.db.normalizeId("networks", ref)
      target = id ? { kind: "network", id } : null
    } else if (args.kind === "person") {
      const person = await ctx.db.query("persons").withIndex("by_handle", (q) => q.eq("handle", normalizeHandle(ref.replace(/^@/, "")))).unique()
      const id = person?._id ?? ctx.db.normalizeId("persons", ref)
      target = id ? { kind: "person", id } : null
    } else if (args.kind === "page") {
      const page = await findPageByHandle(ctx, ref.replace(/^@/, ""))
      const id = page?._id ?? ctx.db.normalizeId("pages", ref)
      target = id ? { kind: "page", id } : null
    } else {
      const table = TARGET_TABLES.get(args.kind)
      const id = table ? ctx.db.normalizeId(table, ref) : null
      target = id ? ({ kind: args.kind, id } as unknown as JudicialTarget) : null
    }
    if (!target) return null
    const described = await describeTarget(ctx, root, target)
    if (!described) return null
    const active = await ctx.db.query("judicialMeasures").withIndex("by_target_status", (q) => q.eq("targetKind", target.kind).eq("targetId", target.id).eq("status", "active")).take(JUDICIAL_HOLD_SCAN_LIMIT + 1)
    return { target, networkId: described.networkId, networkName: (await ctx.db.get(described.networkId))?.name ?? null, label: described.label, createdAt: described.createdAt, moderationStatus: described.moderationStatus, activeMeasures: active.length }
  },
})

const personalMeasureValidator = v.object({
  measureId: v.id("judicialMeasures"), kind: literals(JUDICIAL_MEASURE_KINDS), targetKind: literals(JUDICIAL_TARGET_KINDS),
  status: literals(JUDICIAL_MEASURE_STATUSES), startsAt: v.number(), endsAt: v.union(v.number(), v.null()),
  liftedAt: v.union(v.number(), v.null()), liftCause: v.union(literals(JUDICIAL_LIFT_CAUSES), v.null()),
  feature: v.union(literals(RESTRICTABLE_FEATURES), v.null()), correctionText: v.union(v.string(), v.null()), originLabel: v.union(v.string(), v.null()),
  networkName: v.union(v.string(), v.null()),
})

/** Ce que la personne lit d'une mesure : le genre, la cible, les dates, le texte affiché — ni la référence de l'ordonnance, ni l'opérateur. */
function personalDto(row: Measure, networkName: string | null) {
  return {
    measureId: row._id, kind: row.kind, targetKind: row.targetKind, status: row.status, startsAt: row.startsAt, endsAt: row.endsAt ?? null,
    liftedAt: row.liftedAt ?? null, liftCause: row.liftCause ?? null, feature: row.feature ?? null,
    correctionText: row.correctionText ?? null, originLabel: row.originLabel ?? null, networkName,
  }
}

/**
 * @selfScoped SU01h — les mesures sur ordre qui visent la personne de la session (même suspendue), la
 * plus récente d'abord, et les mesures générales de l'art. 44 en vigueur sur ses réseaux.
 */
export const myJudicialMeasures = personQuery({
  args: {},
  returns: v.object({ personal: v.array(personalMeasureValidator), general: v.array(personalMeasureValidator) }),
  handler: async (ctx) => {
    const now = Date.now()
    const rows = await ctx.db.query("judicialMeasures").withIndex("by_subject_createdAt", (q) => q.eq("subjectPersonId", ctx.person._id)).order("desc").take(MY_MEASURES_MAX)
    const personal = rows.map((row) => personalDto(row, null))
    const general = []
    for (const kind of ARTICLE_44_KINDS) {
      // borné : quelques mesures générales à la fois, au plus vingt par genre.
      const active = await ctx.db.query("judicialMeasures").withIndex("by_kind_status", (q) => q.eq("kind", kind).eq("status", "active")).take(MY_MEASURES_MAX)
      for (const row of active) {
        if (row.target.kind !== "network" || !isJudicialMeasureLive(row, now)) continue
        const network = await ctx.db.get(row.target.id)
        if (!network || (network.kind !== "root" && !(await getMembership(ctx, network._id, ctx.person._id)))) continue
        general.push(personalDto(row, network.name))
      }
    }
    return { personal, general }
  },
})

/**
 * Le correctif épinglé et l'étiquette d'origine d'une publication, d'un profil ou d'une page que le
 * lecteur peut voir ; rien sinon (refus indistinct : une liste vide). Les avis se lisent d'abord (un
 * index) : la visibilité de la cible n'est relue que s'il y en a.
 */
export const judicialNotices = networkQuery({
  args: { target: v.union(v.object({ kind: v.literal("post"), id: v.id("posts") }), v.object({ kind: v.literal("person"), handle: v.string() }), v.object({ kind: v.literal("page"), handle: v.string() })) },
  returns: v.array(judicialNoticeValidator),
  handler: async (ctx, args) => {
    const target = args.target
    if (target.kind === "post") {
      const notices = await liveJudicialNotices(ctx, "post", target.id)
      if (notices.length === 0) return []
      const post = await ctx.db.get(target.id)
      return post && await canSeePostDoc(ctx, { personId: ctx.person._id, network: ctx.network }, post) ? notices : []
    }
    if (target.handle.length > REF_MAX) return []
    if (target.kind === "person") {
      const person = await findPublishedPersonByHandle(ctx, ctx.networkId, target.handle)
      if (!person) return []
      const notices = await liveJudicialNotices(ctx, "person", person._id)
      return notices.length > 0 && (person._id === ctx.person._id || !(await isBlockedBetween(ctx, ctx.person._id, person._id))) ? notices : []
    }
    const page = await readablePageByHandle(ctx, ctx.network, target.handle, ctx.person._id)
    return page ? await liveJudicialNotices(ctx, "page", page._id) : []
  },
})

const VISIBLE_NOTICE_SCAN = 200
const postNoticeValidator = v.object({ postId: v.id("posts"), kind: literals(JUDICIAL_NOTICE_KINDS), text: v.string(), startsAt: v.number() })

/**
 * Les avis vivants des publications que le lecteur peut voir, en UNE lecture partagée par toutes les
 * cartes du fil (mêmes arguments, un seul abonnement) : rien n'est lu par carte. Les mesures de ce
 * genre sont rares ; au-delà de la borne, les plus anciennes ne sont pas relues ici.
 */
export const visiblePostNotices = networkQuery({
  args: {},
  returns: v.array(postNoticeValidator),
  handler: async (ctx) => {
    const now = Date.now()
    const reader = { personId: ctx.person._id, network: ctx.network }
    const notices = []
    for (const kind of JUDICIAL_NOTICE_KINDS) {
      const rows = await ctx.db.query("judicialMeasures").withIndex("by_kind_status", (q) => q.eq("kind", kind).eq("status", "active")).order("desc").take(VISIBLE_NOTICE_SCAN)
      for (const row of rows) {
        if (row.target.kind !== "post" || !isJudicialMeasureLive(row, now)) continue
        const text = row.kind === "pin_correction" ? row.correctionText : row.originLabel
        if (text === undefined) continue
        const post = await ctx.db.get(row.target.id)
        if (!post || !(await canSeePostDoc(ctx, reader, post))) continue
        notices.push({ postId: post._id, kind, text, startsAt: row.startsAt })
      }
    }
    return notices.sort((left, right) => left.startsAt - right.startsAt)
  },
})
