/**
 * ADR-0041 — les fonctionnalités activables d'un réseau GOUVERNÉ par une tranche.
 *
 * Un réseau gouverné sert d'emblée son socle (fil, profils, relations, iCom,
 * notifications, réglages, modération). Les fonctionnalités de la liste fermée
 * (`@antsia/social-domain/networkFeatures`) restent dans le code mais FERMÉES sans
 * ligne ; les fonctions qui les servent portent l'option `feature` de leur
 * constructeur et rendent le refus indistinct tant qu'elles le sont. Un module
 * d'AFFICHAGE (`consulateGateway`, CH-863) ne garde aucune fonction : seules sa
 * ligne, sa bascule et son journal vivent ici ; l'application du réseau le lit
 * par `open` et monte, ou non, l'entrée qu'il règle.
 *
 *   open                 un membre : les clés OUVERTES de son réseau (rien d'autre) ;
 *   settings, setFeature l'administrateur du réseau, en session prouvée de l'application
 *                        qui administre ce réseau, accès journalisé (ADR-0042,
 *                        `networkAdminQuery` / `networkAdminMutation`) : l'état des
 *                        clés, la bascule motivée ;
 *   lastDecisions        CH-815 A6, même garde : la dernière décision de chaque clé
 *                        (instant, motif, qualité, acteur publié), lue au journal ;
 *   operatorSettings,    l'opérateur de la plateforme, en secours (console) :
 *   operatorSetFeature   les mêmes, par réseau, administrateur de plateforme.
 *
 * Une bascule : motif d'au moins dix caractères, règle de dépendance (ouvrir exige
 * le parent ouvert, fermer exige les enfants fermés), ligne de journal
 * `network.feature_set` dans la même transaction. Rien à décider (état déjà en
 * place) : aucune écriture, aucune ligne de journal. Fermer ne supprime AUCUNE
 * donnée : rouvrir rend tout ce qui existait. Aucune graine n'ouvre rien.
 */
import { assertDecisionReason } from "@antsia/social-domain/audit"
import {
  assertNetworkFeatureToggle,
  NETWORK_FEATURE_PARENTS,
  NETWORK_FEATURE_REASON_MIN,
  type NetworkFeature,
  SLICE_NETWORK_FEATURES,
  sliceGovernsFeature,
} from "@antsia/social-domain/networkFeatures"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { checked, notFound } from "../../lib/errors"
import { networkAdminMutation, networkAdminQuery, networkQuery, operatorMutation, operatorQuery } from "../../lib/functions"
import { networkFeatureRow, openFeaturesOf } from "../../lib/networkFeatures"
import { requirePlatformAdmin } from "../../lib/operatorIdentity"
import { enforceRateLimit } from "../../lib/rateLimit"
import { networkFeatureValidator } from "../../lib/validators"
import { miniProfileCache } from "../people/miniProfile"
import { appendAudit, operatorCapacity } from "../platform/audit"
import { auditCapacityValidator } from "../platform/tables"

/** Lignes du journal relues au même instant qu'une décision (des actes simultanés au même instant sont rares). */
const SAME_INSTANT_AUDIT_MAX = 50

/** La dernière décision d'une fonctionnalité, telle que l'application d'administration la montre sur sa carte. */
const lastDecisionValidator = v.object({
  feature: networkFeatureValidator,
  /** L'état décidé (celui de la ligne). */
  enabled: v.boolean(),
  at: v.number(),
  reason: v.string(),
  /** À quel titre : `network_admin`, ou le rôle d'opérateur d'une bascule de secours à la console. */
  capacity: auditCapacityValidator,
  /** Nom et identifiant PUBLIÉS seulement, comme le journal de la console ; `null` sans acteur. */
  actor: v.union(v.object({ personId: v.id("persons"), displayName: v.union(v.string(), v.null()), handle: v.union(v.string(), v.null()) }), v.null()),
})

/** L'état d'une fonctionnalité, tel que le bureau et la console le montrent. */
const featureStateValidator = v.object({
  feature: networkFeatureValidator,
  /** La décision posée (fermée sans ligne). */
  enabled: v.boolean(),
  /** L'état servi : décision ouverte ET parent ouvert. */
  open: v.boolean(),
  /** La fonctionnalité qu'elle exige ouverte, ou `null`. */
  requires: v.union(networkFeatureValidator, v.null()),
  updatedAt: v.union(v.number(), v.null()),
})

const setResultValidator = v.object({ changed: v.boolean() })

type FeatureState = { feature: NetworkFeature; enabled: boolean; open: boolean; requires: NetworkFeature | null; updatedAt: number | null }

/** Les fonctionnalités que la tranche du réseau gouverne, une ligne chacune ; aucune pour un réseau sans tranche. */
async function featureStates(ctx: Pick<QueryCtx, "db">, network: Doc<"networks">): Promise<FeatureState[]> {
  if (network.managedBy === undefined) return []
  const open = await openFeaturesOf(ctx, network)
  const states: FeatureState[] = []
  for (const feature of SLICE_NETWORK_FEATURES[network.managedBy]) {
    const row = await networkFeatureRow(ctx, network._id, feature)
    states.push({ feature, enabled: row?.enabled === true, open: open.includes(feature), requires: NETWORK_FEATURE_PARENTS[feature], updatedAt: row?.updatedAt ?? null })
  }
  return states
}

type FeatureWrite = {
  readonly network: Doc<"networks">
  readonly feature: NetworkFeature
  readonly enabled: boolean
  readonly updatedByPersonId: Id<"persons">
}

/**
 * L'écriture d'une bascule, sans garde ni journal (l'appelant porte les siens) :
 * réseau actif et fonctionnalité gouvernée par sa tranche, sinon refus indistinct ;
 * rien n'est écrit quand l'état demandé est déjà en place ; sinon la règle de
 * dépendance, puis la ligne.
 */
async function writeNetworkFeature(ctx: MutationCtx, input: FeatureWrite): Promise<{ changed: boolean; at: number }> {
  if (input.network.status !== "active" || !sliceGovernsFeature(input.network.managedBy, input.feature)) return notFound()
  const now = Date.now()
  const row = await networkFeatureRow(ctx, input.network._id, input.feature)
  if ((row?.enabled === true) === input.enabled) return { changed: false, at: now }
  const open = await openFeaturesOf(ctx, input.network)
  checked(() => assertNetworkFeatureToggle({ feature: input.feature, enabled: input.enabled, open }))
  const fields = { networkId: input.network._id, feature: input.feature, enabled: input.enabled, updatedAt: now, updatedByPersonId: input.updatedByPersonId }
  if (row) await ctx.db.patch(row._id, fields)
  else await ctx.db.insert("networkFeatures", fields)
  return { changed: true, at: now }
}

/** Les clés OUVERTES de mon réseau, dans l'ordre des clés : ce que l'application monte, rien de plus. */
export const open = networkQuery({
  args: {},
  returns: v.array(networkFeatureValidator),
  handler: async (ctx) => await openFeaturesOf(ctx, ctx.network),
})

/**
 * L'administrateur du réseau : l'état de chaque fonctionnalité. Tout autre membre, et l'administrateur
 * hors d'une session prouvée et journalisée de l'application d'administration : le refus indistinct
 * (garde du constructeur, ADR-0042).
 */
export const settings = networkAdminQuery({
  args: {},
  returns: v.array(featureStateValidator),
  handler: async (ctx) => await featureStates(ctx, ctx.network),
})

/**
 * CH-815 A6 — la dernière décision de chaque fonctionnalité du réseau, pour les cartes de la section
 * « Modules » de l'application d'administration : l'état décidé, l'instant, le motif, la qualité et
 * l'acteur (profil publié seulement). Lecture bornée, sans nouvel index : pour chaque ligne de
 * `networkFeatures` du réseau (une par clé de sa tranche au plus), les lignes du journal du réseau AU
 * MÊME INSTANT (`by_network_at`, `at === updatedAt`, l'instant que la bascule écrit aux deux), dont on
 * garde la dernière `network.feature_set` de cette clé. Un module jamais décidé (aucune ligne), ou
 * dont la ligne n'a pas de décision au journal (posée hors bascule), n'y figure pas. Même garde que
 * `settings` (ADR-0042) ; rien de la preuve de session n'est rendu.
 */
export const lastDecisions = networkAdminQuery({
  args: {},
  returns: v.array(lastDecisionValidator),
  handler: async (ctx) => {
    if (ctx.network.managedBy === undefined) return []
    const profileOf = miniProfileCache(ctx)
    const out = []
    for (const feature of SLICE_NETWORK_FEATURES[ctx.network.managedBy]) {
      const row = await networkFeatureRow(ctx, ctx.networkId, feature)
      if (!row) continue
      const sameInstant = await ctx.db
        .query("engineAudit")
        .withIndex("by_network_at", (q) => q.eq("networkId", ctx.networkId).eq("at", row.updatedAt))
        .take(SAME_INSTANT_AUDIT_MAX)
      // L'index range les actes d'un même instant dans l'ordre d'écriture : la dernière bascule l'emporte.
      const decision = sameInstant.filter((entry) => entry.action === "network.feature_set" && entry.details?.feature === feature).at(-1)
      const reason = decision?.details?.reason
      if (!decision || typeof reason !== "string") continue
      const actor = decision.actorPersonId ? await profileOf(decision.actorPersonId) : null
      out.push({
        feature,
        enabled: row.enabled,
        at: decision.at,
        reason,
        capacity: decision.capacity,
        actor: actor ? { personId: actor.personId, displayName: actor.displayName, handle: actor.handle } : null,
      })
    }
    return out
  },
})

/** L'administrateur du réseau ouvre ou ferme une fonctionnalité : motif, règle de dépendance, journal. */
export const setFeature = networkAdminMutation({
  args: { feature: networkFeatureValidator, enabled: v.boolean(), reason: v.string() },
  returns: setResultValidator,
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "moderation.decide", ctx.person._id)
    const reason = checked(() => assertDecisionReason(args.reason, NETWORK_FEATURE_REASON_MIN))
    const { changed, at } = await writeNetworkFeature(ctx, { network: ctx.network, feature: args.feature, enabled: args.enabled, updatedByPersonId: ctx.person._id })
    if (!changed) return { changed: false }
    await appendAudit(ctx, {
      action: "network.feature_set",
      capacity: "network_admin",
      actorPersonId: ctx.person._id,
      networkId: ctx.networkId,
      subject: { table: "networks", id: ctx.networkId },
      details: { reason, feature: args.feature, enabled: args.enabled },
      at,
    })
    return { changed: true }
  },
})

/** Console : l'état des fonctionnalités d'un réseau actif. */
export const operatorSettings = operatorQuery({
  args: { networkId: v.id("networks") },
  returns: v.array(featureStateValidator),
  handler: async (ctx, args) => {
    const network = await ctx.db.get(args.networkId)
    if (network === null || network.status !== "active") return notFound()
    return await featureStates(ctx, network)
  },
})

/** Console, en secours : un administrateur de plateforme ouvre ou ferme une fonctionnalité d'un réseau gouverné. */
export const operatorSetFeature = operatorMutation({
  args: { networkId: v.id("networks"), feature: networkFeatureValidator, enabled: v.boolean(), reason: v.string() },
  returns: setResultValidator,
  handler: async (ctx, args) => {
    requirePlatformAdmin(ctx)
    await enforceRateLimit(ctx, "operator.network", ctx.person._id)
    const reason = checked(() => assertDecisionReason(args.reason, NETWORK_FEATURE_REASON_MIN))
    const network = await ctx.db.get(args.networkId)
    if (network === null) return notFound()
    const { changed, at } = await writeNetworkFeature(ctx, { network, feature: args.feature, enabled: args.enabled, updatedByPersonId: ctx.person._id })
    if (!changed) return { changed: false }
    await appendAudit(ctx, {
      action: "network.feature_set",
      capacity: operatorCapacity(ctx.operator),
      actorPersonId: ctx.person._id,
      networkId: network._id,
      subject: { table: "networks", id: network._id },
      details: { reason, feature: args.feature, enabled: args.enabled },
      at,
    })
    return { changed: true }
  },
})
