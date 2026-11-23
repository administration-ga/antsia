/**
 * Réseaux — lecture publique et gestion par la console du moteur (cahier
 * EXF-AN-01). Un réseau se crée, se règle et s'archive SANS déploiement ;
 * jamais il ne se supprime. Chaque geste de console laisse sa trace dans
 * `networkSettingsHistory` (les réglages figés) et dans le journal des
 * décisions du moteur (`engineAudit` : qui, à quel titre, pourquoi).
 */
import { assertDecisionReason } from "@antsia/social-domain/audit"
import { BRAND_NAME } from "@antsia/social-contracts/brand"
import { validateFacetSchema } from "@antsia/social-domain/facets"
import { isValidNetworkSlug, validateNetworkShape, LEGACY_ROOT_NETWORK_SLUG, ROOT_NETWORK_SLUG } from "@antsia/social-domain/network"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { type MutationCtx, query } from "../../_generated/server"
import { checked, fail } from "../../lib/errors"
import { operatorMutation, operatorQuery } from "../../lib/functions"
import { isLiveOperatorSession, requireOperatorSession, requirePlatformAdmin } from "../../lib/operatorIdentity"
import { enforceRateLimit } from "../../lib/rateLimit"
import { findNetworkBySlug } from "../../lib/networkSlug"
import {
  contentVisibilityValidator,
  facetSchemaValidator,
  membershipPolicyValidator,
  networkKindValidator,
  networkSliceValidator,
  networkStatusValidator,
} from "../../lib/validators"
import { appendAudit, operatorCapacity } from "../platform/audit"

/** Projection PUBLIQUE d'un réseau : ce qu'une application doit savoir pour le servir. */
const publicNetworkValidator = v.object({
  _id: v.id("networks"),
  slug: v.string(),
  name: v.string(),
  kind: networkKindValidator,
  parentId: v.optional(v.id("networks")),
  /** Présent : l'entrée et les facettes passent par la tranche nommée, jamais par les chemins génériques. */
  managedBy: v.optional(networkSliceValidator),
  membershipPolicy: membershipPolicyValidator,
  defaultVisibility: contentVisibilityValidator,
  facetSchema: v.optional(facetSchemaValidator),
  reachValues: v.array(v.string()),
  openCountries: v.optional(v.array(v.string())),
  theme: v.string(),
})

function toPublicNetwork(network: Doc<"networks">) {
  const legacyRoot = network.kind === "root" && network.slug === LEGACY_ROOT_NETWORK_SLUG
  return {
    _id: network._id,
    slug: legacyRoot ? ROOT_NETWORK_SLUG : network.slug,
    name: legacyRoot ? BRAND_NAME : network.name,
    kind: network.kind,
    ...(network.parentId ? { parentId: network.parentId } : {}),
    ...(network.managedBy ? { managedBy: network.managedBy } : {}),
    membershipPolicy: network.membershipPolicy,
    defaultVisibility: network.defaultVisibility,
    ...(network.facetSchema ? { facetSchema: network.facetSchema } : {}),
    reachValues: network.reachValues,
    ...(network.openCountries ? { openCountries: network.openCountries } : {}),
    theme: network.theme === LEGACY_ROOT_NETWORK_SLUG ? ROOT_NETWORK_SLUG : network.theme,
  }
}

/**
 * @publicProjection Une application résout son réseau courant par son
 * identifiant public avant toute session (NetworkProvider) ; seule la
 * projection publique des réglages est servie, jamais un membre ni un contenu.
 */
export const getBySlug = query({
  args: { slug: v.string() },
  returns: v.union(publicNetworkValidator, v.null()),
  handler: async (ctx, { slug }) => {
    const network = await findNetworkBySlug(ctx, slug)
    if (!network || network.status !== "active") return null
    return toPublicNetwork(network)
  },
})

/**
 * Fige les réglages d'un réseau dans `networkSettingsHistory`. Partagé avec la tranche qui règle un
 * réseau depuis son administration (CH-815 A3 : `diaspora/networkSettings.setOpenCountry`) : une
 * décision sans cette ligne passerait, pour l'équipement de démonstration, pour « personne n'a décidé ».
 */
export async function recordHistory(
  ctx: MutationCtx,
  network: Doc<"networks">,
  kind: "created" | "updated" | "archived",
  actorPersonId: Id<"persons">,
  reason?: string,
) {
  await ctx.db.insert("networkSettingsHistory", {
    networkId: network._id,
    actorPersonId,
    kind,
    settings: {
      name: network.name,
      membershipPolicy: network.membershipPolicy,
      defaultVisibility: network.defaultVisibility,
      ...(network.facetSchema ? { facetSchema: network.facetSchema } : {}),
      reachValues: network.reachValues,
      ...(network.openCountries ? { openCountries: network.openCountries } : {}),
      theme: network.theme,
      status: network.status,
    },
    ...(reason ? { reason } : {}),
    at: Date.now(),
  })
}

const settingsArgs = {
  name: v.string(),
  membershipPolicy: membershipPolicyValidator,
  defaultVisibility: contentVisibilityValidator,
  facetSchema: v.optional(facetSchemaValidator),
  reachValues: v.array(v.string()),
  openCountries: v.optional(v.array(v.string())),
  theme: v.string(),
}

function assertSettings(args: { name: string; theme: string; reachValues: string[]; facetSchema?: Doc<"networks">["facetSchema"]; openCountries?: string[] }) {
  if (args.name.trim().length < 2 || args.name.length > 60) fail("invalidArgument", { field: "name" })
  if (args.facetSchema && validateFacetSchema(args.facetSchema).length > 0) fail("invalidArgument", { field: "facetSchema" })
  if (args.openCountries && (args.openCountries.length > 249 || new Set(args.openCountries).size !== args.openCountries.length || args.openCountries.some((country) => !/^[A-Z]{2}$/.test(country)))) fail("invalidArgument", { field: "openCountries" })
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(args.theme)) fail("invalidArgument", { field: "theme" })
  if (args.reachValues.length > 50 || new Set(args.reachValues).size !== args.reachValues.length || args.reachValues.some((value) => value.length < 1 || value.length > 80)) fail("invalidArgument", { field: "reachValues" })
}

/**
 * Console : créer un réseau (la racine unique, ou un réseau fermé enfant de la
 * racine). `managedBy` se pose ici, à la naissance, et nulle part ailleurs.
 */
export const create = operatorMutation({
  args: { slug: v.string(), kind: networkKindValidator, managedBy: v.optional(networkSliceValidator), reason: v.optional(v.string()), ...settingsArgs },
  returns: v.id("networks"),
  handler: async (ctx, args) => {
    requirePlatformAdmin(ctx)
    await enforceRateLimit(ctx, "operator.network", ctx.person._id)
    if (!isValidNetworkSlug(args.slug)) fail("invalidArgument", { field: "slug" })
    assertSettings(args)
    const existing = await ctx.db
      .query("networks")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique()
    if (existing) fail("conflict")
    const root = await ctx.db
      .query("networks")
      .withIndex("by_kind_and_status", (q) => q.eq("kind", "root").eq("status", "active"))
      .unique()
    if (args.kind === "root" && root) fail("conflict")
    const parentId = args.kind === "root" ? null : (root?._id ?? null)
    if (args.kind === "closed" && !parentId) fail("invalidArgument", { field: "kind" })
    // La racine est ouverte à toute personne : aucune tranche ne la gouverne.
    if (args.kind === "root" && args.managedBy) fail("invalidArgument", { field: "managedBy" })
    const shapeErrors = validateNetworkShape({
      kind: args.kind,
      parentId,
      membershipPolicy: args.membershipPolicy,
      defaultVisibility: args.defaultVisibility,
    })
    if (shapeErrors.length > 0) fail("invalidArgument", { field: shapeErrors[0] })
    const motive = args.reason === undefined ? undefined : checked(() => assertDecisionReason(args.reason as string, 3))
    const now = Date.now()
    const networkId = await ctx.db.insert("networks", {
      slug: args.slug,
      kind: args.kind,
      ...(parentId ? { parentId } : {}),
      ...(args.managedBy ? { managedBy: args.managedBy } : {}),
      name: args.name.trim(),
      membershipPolicy: args.membershipPolicy,
      defaultVisibility: args.defaultVisibility,
      ...(args.facetSchema ? { facetSchema: args.facetSchema } : {}),
      reachValues: args.reachValues,
      ...(args.openCountries ? { openCountries: args.openCountries } : {}),
      theme: args.theme,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    const created = await ctx.db.get(networkId)
    if (created) await recordHistory(ctx, created, "created", ctx.person._id, motive)
    await appendAudit(ctx, {
      action: "network.create",
      capacity: operatorCapacity(ctx.operator),
      actorPersonId: ctx.person._id,
      networkId,
      subject: { table: "networks", id: networkId },
      details: { slug: args.slug, kind: args.kind, ...(args.managedBy ? { managedBy: args.managedBy } : {}), ...(motive ? { reason: motive } : {}) },
    })
    return networkId
  },
})

/** Console : régler un réseau (politique, visibilité par défaut, facettes, portées, pays, thème). */
export const update = operatorMutation({
  args: { networkId: v.id("networks"), ...settingsArgs, reason: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { networkId, reason, ...settings }) => {
    requirePlatformAdmin(ctx)
    await enforceRateLimit(ctx, "operator.network", ctx.person._id)
    const network = await ctx.db.get(networkId)
    if (!network || network.status !== "active") fail("notFound")
    assertSettings(settings)
    const shapeErrors = validateNetworkShape({
      kind: network.kind,
      parentId: network.parentId ?? null,
      membershipPolicy: settings.membershipPolicy,
      defaultVisibility: settings.defaultVisibility,
    })
    if (shapeErrors.length > 0) fail("invalidArgument", { field: shapeErrors[0] })
    // Motif facultatif pour un réglage ; donné, il est borné comme tout motif.
    const motive = reason === undefined || reason.trim() === "" ? undefined : checked(() => assertDecisionReason(reason, 1))
    await ctx.db.patch(networkId, { ...settings, facetSchema: settings.facetSchema, openCountries: settings.openCountries, name: settings.name.trim(), updatedAt: Date.now() })
    const updated = await ctx.db.get(networkId)
    if (updated) await recordHistory(ctx, updated, "updated", ctx.person._id, motive)
    await appendAudit(ctx, {
      action: "network.update",
      capacity: operatorCapacity(ctx.operator),
      actorPersonId: ctx.person._id,
      networkId,
      subject: { table: "networks", id: networkId },
      ...(motive ? { details: { reason: motive } } : {}),
    })
    return null
  },
})

/** Console : archiver un réseau fermé (jamais la racine, jamais une suppression). */
export const archive = operatorMutation({
  args: { networkId: v.id("networks"), reason: v.string(), archiveRequestId: v.optional(v.id("networkArchiveRequests")) },
  returns: v.null(),
  handler: async (ctx, { networkId, reason, archiveRequestId }) => {
    requirePlatformAdmin(ctx)
    await enforceRateLimit(ctx, "operator.network", ctx.person._id)
    const network = await ctx.db.get(networkId)
    if (!network || network.status !== "active") fail("notFound")
    if (network.kind === "root") fail("invalidArgument", { field: "kind" })
    const motive = checked(() => assertDecisionReason(reason, 10))
    const request = archiveRequestId ? await ctx.db.get(archiveRequestId) : null
    if (!request || request.networkId !== networkId || request.status !== "pending" || request.expiresAt <= Date.now() || !request.requestedByPersonId || request.requestedByPersonId === ctx.person._id || request.expectedUpdatedAt !== network.updatedAt) return fail("policyRefused")
    const latest = await ctx.db.query("networkSettingsHistory").withIndex("by_network_and_at", (q) => q.eq("networkId", networkId)).order("desc").take(1)
    if (latest[0]?._id !== request.settingsVersion) return fail("conflict")
    const requestedByPersonId = request.requestedByPersonId
    const requester = await ctx.db.get(requestedByPersonId)
    const requesterOperator = await ctx.db.query("operators").withIndex("by_person", (q) => q.eq("personId", requestedByPersonId)).unique()
    const proof = await ctx.db.get(request.requesterSessionProofId)
    if (!requester || requester.deletionRequestedAt !== undefined || requester.erasedAt !== undefined || requesterOperator?.role !== "platform_admin" || requesterOperator.revokedAt !== undefined || !await isLiveOperatorSession(ctx, requester, proof)) return fail("policyRefused")
    const now = Date.now()
    await ctx.db.patch(request._id, { status: "approved", approvedByPersonId: ctx.person._id, decidedAt: now })
    await ctx.db.patch(networkId, { status: "archived", archivedAt: now, updatedAt: now })
    const archived = await ctx.db.get(networkId)
    if (archived) await recordHistory(ctx, archived, "archived", ctx.person._id, motive)
    await appendAudit(ctx, {
      action: "network.archive",
      capacity: operatorCapacity(ctx.operator),
      actorPersonId: ctx.person._id,
      networkId,
      subject: { table: "networks", id: networkId },
      details: { reason: motive, requestReason: request.reason, archiveRequestId: request._id },
      at: now,
    })
    return null
  },
})

export const requestArchive = operatorMutation({
  args: { networkId: v.id("networks"), reason: v.string() },
  returns: v.object({ archiveRequestId: v.id("networkArchiveRequests") }),
  handler: async (ctx, args) => {
    requirePlatformAdmin(ctx)
    const network = await ctx.db.get(args.networkId)
    if (!network || network.status !== "active") return fail("notFound")
    if (network.kind !== "closed") return fail("invalidArgument", { field: "kind" })
    const reason = checked(() => assertDecisionReason(args.reason, 10))
    const proof = await requireOperatorSession(ctx, ctx.person)
    const latest = await ctx.db.query("networkSettingsHistory").withIndex("by_network_and_at", (q) => q.eq("networkId", network._id)).order("desc").take(1)
    const now = Date.now()
    const requests = await ctx.db.query("networkArchiveRequests").withIndex("by_network_status_expiry", (q) => q.eq("networkId", network._id).eq("status", "pending").gt("expiresAt", now)).take(51)
    const duplicate = requests.find((row) => row.requestedByPersonId === ctx.person._id && row.requesterSessionProofId === proof._id && row.reason === reason && row.expectedUpdatedAt === network.updatedAt && row.settingsVersion === latest[0]?._id)
    if (duplicate) return { archiveRequestId: duplicate._id }
    if (requests.length >= 50) return fail("policyRefused")
    const archiveRequestId = await ctx.db.insert("networkArchiveRequests", { networkId: network._id, requestedByPersonId: ctx.person._id, requesterSessionProofId: proof._id, reason, expectedUpdatedAt: network.updatedAt, ...(latest[0] ? { settingsVersion: latest[0]._id } : {}), status: "pending", requestedAt: now, expiresAt: now + 15 * 60_000 })
    await appendAudit(ctx, { action: "network.archive_request", capacity: operatorCapacity(ctx.operator), actorPersonId: ctx.person._id, networkId: network._id, subject: { table: "networkArchiveRequests", id: archiveRequestId }, details: { reason } })
    return { archiveRequestId }
  },
})

export const listArchiveRequests = operatorQuery({
  args: { networkId: v.id("networks") },
  handler: async (ctx, args) => {
    const requests = await ctx.db.query("networkArchiveRequests").withIndex("by_network_status_expiry", (q) => q.eq("networkId", args.networkId).eq("status", "pending").gt("expiresAt", Date.now())).take(51)
    if (requests.length > 50) return fail("policyRefused")
    return requests.map((row) => ({ archiveRequestId: row._id, requestedByPersonId: row.requestedByPersonId ?? null, reason: row.reason, expiresAt: row.expiresAt, canApprove: ctx.operator.role === "platform_admin" && row.requestedByPersonId !== undefined && row.requestedByPersonId !== ctx.person._id && row.expiresAt > Date.now() }))
  },
})

export const cancelArchiveRequest = operatorMutation({
  args: { archiveRequestId: v.id("networkArchiveRequests"), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    requirePlatformAdmin(ctx)
    const reason = checked(() => assertDecisionReason(args.reason, 3))
    const row = await ctx.db.get(args.archiveRequestId)
    if (!row || row.status !== "pending") return fail("notFound")
    await ctx.db.patch(row._id, { status: "cancelled", decidedAt: Date.now() })
    await appendAudit(ctx, { action: "network.archive_cancel", capacity: operatorCapacity(ctx.operator), actorPersonId: ctx.person._id, networkId: row.networkId, subject: { table: "networkArchiveRequests", id: row._id }, details: { reason } })
    return null
  },
})

/** Console : liste des réseaux (actifs puis archivés), bornée. */
export const listForConsole = operatorQuery({
  args: {},
  returns: v.array(v.object({ ...publicNetworkValidator.fields, status: networkStatusValidator })),
  handler: async (ctx) => {
    const active = await ctx.db
      .query("networks")
      .withIndex("by_kind_and_status", (q) => q.eq("kind", "root").eq("status", "active"))
      .take(1)
    const closedActive = await ctx.db
      .query("networks")
      .withIndex("by_kind_and_status", (q) => q.eq("kind", "closed").eq("status", "active"))
      .take(200)
    const archived = await ctx.db
      .query("networks")
      .withIndex("by_kind_and_status", (q) => q.eq("kind", "closed").eq("status", "archived"))
      .take(200)
    return [...active, ...closedActive, ...archived].map((network) => ({ ...toPublicNetwork(network), status: network.status }))
  },
})
