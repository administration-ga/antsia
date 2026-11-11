/**
 * P15 : projection d'emploi COMMUNE au membre, au SSR public et à la modération.
 * Allowlist du contrat JOBS-V1 : jamais de candidat, de contact, de note RH, de
 * référence de liaison ni de corps signé. Une offre close reste lisible sur un
 * lien connu avec sa clôture ; retirée, elle ne l'est plus. Classement par
 * date de changement, jamais par popularité ni par messages sociaux.
 */
import { COMMERCE_JOBS_SALARY_PERIODS, commerceJobsLibrevilleDate, commerceJobsPublicView, parseCommerceJobsPayload, type CommerceJobsPublished } from "@antsia/social-domain/commerce-jobs"
import { parseCommerceRef } from "@antsia/social-domain/commerce/primitives"
import type { PaginationOptions } from "convex/server"
import { type Infer, v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { fail } from "../../lib/errors"
import { literals } from "../../lib/validators"
import { canReadModeratedContent, contentState } from "../moderation/policy"
import { findPageByHandle, liveSignatoryRole } from "../pages/access"
import { isStorefrontInReadingContext, shopOfPage } from "./access"
import { jobHeadBelongsToCurrent, jobPolicyOf, liveJobMapping, readableJobMapping, type ReadableJobMapping } from "./jobAccess"
import { jobContractTypeValidator } from "./jobTables"

type ReadCtx = Pick<QueryCtx, "db">
export type JobReadContext = { root: Doc<"networks">; readerPersonId?: Id<"persons">; network?: Doc<"networks"> }

export const JOB_PAGE_MAX = 12

export const jobStatusValidator = v.union(v.literal("open"), v.literal("deadline_passed"), v.literal("closed"), v.literal("filled"))
export const jobDtoValidator = v.object({
  jobRef: v.string(), shopHandle: v.string(), shopName: v.string(), title: v.string(), contractType: jobContractTypeValidator,
  headcount: v.number(), description: v.string(), location: v.union(v.string(), v.null()), skills: v.array(v.string()),
  openedOn: v.string(), closesOn: v.union(v.string(), v.null()),
  salary: v.union(v.null(), v.object({
    currency: v.literal("XAF"), minAmount: v.union(v.number(), v.null()), maxAmount: v.union(v.number(), v.null()),
    period: v.union(literals(COMMERCE_JOBS_SALARY_PERIODS), v.null()),
  })),
  status: jobStatusValidator, revision: v.number(), changedAt: v.number(),
  actions: v.object({ apply: v.boolean() }),
})
export type JobDto = Infer<typeof jobDtoValidator>
/**
 * UM-03 : la fiche d'emploi MEMBRE (`shops.jobs.job`) — le DTO commun, plus la cible facultative de son
 * signalement, présente seulement pour un lecteur sans rôle sur la page de l'employeur. Les listes et le SSR
 * public gardent `jobDtoValidator` (lecteurs stricts).
 */
export const memberJobDtoValidator = v.object({
  ...jobDtoValidator.fields,
  reportTarget: v.optional(v.object({ kind: v.literal("commerceJob"), id: v.id("commerceJobHeads") })),
})
export type MemberJobDto = Infer<typeof memberJobDtoValidator>
export const jobListValidator = v.object({ page: v.array(jobDtoValidator), isDone: v.boolean(), continueCursor: v.string(), filteredWindow: v.boolean() })
export type JobList = Infer<typeof jobListValidator>

/** Le dernier contenu PUBLIÉ normalisé, revalidé à l'instant de sa réception (aucune horloge implicite). */
export function jobContentOf(head: Doc<"commerceJobHeads">): CommerceJobsPublished | null {
  if (head.contentJson === undefined) return null
  let value: unknown
  try { value = JSON.parse(head.contentJson) as unknown } catch { return null }
  const parsed = parseCommerceJobsPayload(value, head.objectRef, head.receivedAt)
  return parsed.ok && parsed.value.type === "job.published" ? parsed.value : null
}

async function contextFor(ctx: ReadCtx, context: JobReadContext, shopId: Id<"shops">): Promise<ReadableJobMapping | null> {
  const live = await readableJobMapping(ctx, context.root, shopId, context.readerPersonId)
  return live && (!context.network || await isStorefrontInReadingContext(ctx, live.shop, context.network)) ? live : null
}

/** Projection d'une tête : retrait, prélecture de modération, signalement du lecteur ou ancienne incarnation → rien. */
export async function projectJobHead(ctx: ReadCtx, context: JobReadContext, head: Doc<"commerceJobHeads">, live: ReadableJobMapping): Promise<JobDto | null> {
  if (head.state === "withdrawn" || !jobHeadBelongsToCurrent(head, live)) return null
  if ((await contentState(ctx, "commerceJob", head._id))?.status !== "published" || !await canReadModeratedContent(ctx, "commerceJob", head._id, context.readerPersonId)) return null
  const job = jobContentOf(head)
  if (!job) return null
  const closure = head.state === "closed" ? head.closure === "filled" ? "filled" as const : "closed" as const : null
  const view = commerceJobsPublicView(job, { closure, today: commerceJobsLibrevilleDate(Date.now()) })
  // Candidater n'est proposé qu'aux membres, réseau ouvert, lien `receive_applications` vivant.
  const applications = (await jobPolicyOf(ctx, live.shop.networkId)).applications
  return {
    jobRef: view.jobRef, shopHandle: live.page.handle, shopName: live.page.name, title: view.title, contractType: view.contractType,
    headcount: view.headcount, description: view.description, location: view.location, skills: [...view.skills],
    openedOn: view.openedOn, closesOn: view.closesOn,
    salary: view.salary === null ? null : { currency: view.salary.currency, minAmount: view.salary.minAmount, maxAmount: view.salary.maxAmount, period: view.salary.period },
    status: view.status, revision: view.revision, changedAt: job.changedAt,
    actions: { apply: context.readerPersonId !== undefined && view.status === "open" && applications && live.link.permissions.includes("receive_applications") },
  }
}

export async function resolveShopJob(ctx: ReadCtx, context: JobReadContext, shopId: Id<"shops">, jobRef: string): Promise<{ job: JobDto; head: Doc<"commerceJobHeads">; live: ReadableJobMapping } | null> {
  if (parseCommerceRef(jobRef)?.kind !== "job_opening") return null
  const live = await contextFor(ctx, context, shopId)
  if (!live) return null
  const head = await ctx.db.query("commerceJobHeads").withIndex("by_emitter_object", (q) => q.eq("emitterId", live.mapping.emitterId).eq("objectRef", jobRef)).unique()
  const job = head ? await projectJobHead(ctx, context, head, live) : null
  return head && job ? { job, head, live } : null
}

export async function jobByHandle(ctx: ReadCtx, context: JobReadContext, handle: string, jobRef: string): Promise<JobDto | null> {
  const page = await findPageByHandle(ctx, handle)
  const shop = page ? await shopOfPage(ctx, page._id) : null
  return shop ? (await resolveShopJob(ctx, context, shop._id, jobRef))?.job ?? null : null
}

/** UM-03 : la fiche membre ; signalable par qui ne tient aucun rôle sur la page de l'employeur (ni gérant, ni équipe). */
export async function memberJobByHandle(ctx: ReadCtx, context: JobReadContext & { readerPersonId: Id<"persons"> }, handle: string, jobRef: string): Promise<MemberJobDto | null> {
  const page = await findPageByHandle(ctx, handle)
  const shop = page ? await shopOfPage(ctx, page._id) : null
  const resolved = shop ? await resolveShopJob(ctx, context, shop._id, jobRef) : null
  if (!resolved) return null
  return await liveSignatoryRole(ctx, resolved.live.page, context.readerPersonId) === null ? { ...resolved.job, reportTarget: { kind: "commerceJob", id: resolved.head._id } } : resolved.job
}

function boundedOptions(options: PaginationOptions): PaginationOptions {
  if (!Number.isFinite(options.numItems)) return fail("invalidArgument", { field: "paginationOpts" })
  return { ...options, numItems: Math.min(JOB_PAGE_MAX, Math.max(1, Math.floor(options.numItems))), maximumRowsRead: JOB_PAGE_MAX * 2, maximumBytesRead: 1024 * 1024 }
}

/** Les offres OUVERTES d'une boutique ; une offre close quitte la liste, son lien connu reste lisible. */
export async function listShopJobs(ctx: ReadCtx, context: JobReadContext, handle: string, paginationOpts: PaginationOptions): Promise<JobList> {
  const empty: JobList = { page: [], isDone: true, continueCursor: "", filteredWindow: false }
  const page = await findPageByHandle(ctx, handle)
  const shop = page ? await shopOfPage(ctx, page._id) : null
  const live = shop ? await contextFor(ctx, context, shop._id) : null
  if (!live) return empty
  const window = await ctx.db.query("commerceJobHeads").withIndex("by_network_shop_state_changedAt", (q) => q.eq("networkId", live.shop.networkId).eq("shopId", live.shop._id).eq("state", "active")).order("desc").paginate(boundedOptions(paginationOpts))
  const result: JobDto[] = []
  for (const head of window.page) {
    const job = await projectJobHead(ctx, context, head, live)
    if (job?.status === "open") result.push(job)
  }
  return { page: result, isDone: window.isDone, continueCursor: window.continueCursor, filteredWindow: result.length !== window.page.length }
}

/**
 * Découvrir : offres ouvertes du réseau de lecture (racine : toutes les vitrines
 * lisibles depuis elle). Fenêtre brute bornée, jamais prétendue exhaustive.
 */
export async function discoverJobs(ctx: ReadCtx, context: JobReadContext & { network: Doc<"networks"> }, paginationOpts: PaginationOptions): Promise<JobList> {
  const options = boundedOptions(paginationOpts)
  const window = context.network.kind === "root"
    ? await ctx.db.query("commerceJobHeads").withIndex("by_state_changedAt", (q) => q.eq("state", "active")).order("desc").paginate(options)
    : await ctx.db.query("commerceJobHeads").withIndex("by_network_state_changedAt", (q) => q.eq("networkId", context.network._id).eq("state", "active")).order("desc").paginate(options)
  const lives = new Map<Id<"shops">, ReadableJobMapping | null>()
  const result: JobDto[] = []
  for (const head of window.page) {
    if (!lives.has(head.shopId)) lives.set(head.shopId, await contextFor(ctx, context, head.shopId))
    const live = lives.get(head.shopId)
    const job = live ? await projectJobHead(ctx, context, head, live) : null
    if (job?.status === "open") result.push(job)
  }
  return { page: result, isDone: window.isDone, continueCursor: window.continueCursor, filteredWindow: result.length !== window.page.length }
}

/** L'onglet Emplois n'apparaît que s'il montre de VRAIES offres reçues, lisibles par ce lecteur. */
export async function jobsDiscoverable(ctx: ReadCtx, context: JobReadContext & { network: Doc<"networks"> }): Promise<boolean> {
  const firstWindow = await discoverJobs(ctx, context, { numItems: JOB_PAGE_MAX, cursor: null })
  return firstWindow.page.length > 0
}

/**
 * Extrait public assigné à un modérateur : titre, description, lieu et
 * compétences de l'incarnation COURANTE, rien d'autre (ni corps signé, ni lien).
 */
export async function jobModerationExcerpt(ctx: ReadCtx, networkId: Id<"networks">, headId: Id<"commerceJobHeads">): Promise<{ title: string; body: string } | null> {
  const head = await ctx.db.get(headId)
  if (!head || head.networkId !== networkId || head.state === "withdrawn") return null
  const live = await liveJobMapping(ctx, networkId, head.shopId)
  if (!live?.parentHead || live.parentHead.state !== "active" || head.mappingId !== live.mapping._id || head.mappingGeneration !== live.mapping.generation ||
    head.emitterId !== live.mapping.emitterId || head.shopRef !== live.mapping.shopRef || head.parentActivationRevision !== live.parentHead.activationRevision) return null
  const job = jobContentOf(head)
  if (!job) return null
  return { title: job.title, body: [job.description, job.location ?? "", job.skills.join(", ")].filter((part) => part.length > 0).join("\n") }
}
