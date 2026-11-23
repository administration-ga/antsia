// Dupliqué de socle/convex/lib/contextAudit.ts (avec socle/convex/schemas/auditLog.ts) @ ad2e7fdc2 — adaptations : UNE table `engineAudit` du moteur au lieu d'`auditLog` (et d'`archiveAuditLog`) ; acteur = personne, et QUALITÉ de l'acte (`capacity`) au lieu du contexte institutionnel (organisation, rattachement, affectation, poste) ; réseau de l'acte ; sujet typé (table fermée et identifiant) ; détail plat et borné au lieu de `changes: v.any()` ; `operation` retiré (le verbe canonique dit la nature de l'acte) ; lectures paginées de la console (opérateur) et du réseau (administrateur, modérateur).
/**
 * Le journal des décisions du moteur — écrire, lire.
 *
 * ÉCRIRE : `appendAudit`, DANS la transaction de la décision — une décision
 * annulée n'a pas de ligne, une ligne n'existe pas sans sa décision. Toute
 * mutation de console l'appelle (cliquet `operator-audit`) ; une décision de
 * modération ou de page aussi (tests de chaque module).
 *
 * LIRE : la console lit tout (par réseau, par sujet) ; un administrateur ou un
 * modérateur lit le journal de SON réseau ; l'administration d'un réseau, depuis
 * son application d'administration, le lit filtré par action (ADR-0042, CH-815
 * A6 : section « Journal », dernière décision de chaque module) ; tout autre
 * lecteur reçoit le refus indistinct.
 */
import {
  type AuditAction,
  type AuditCapacity,
  type AuditDetails,
  auditDetailsProblems,
  type AuditSubject,
  isSystemCapacity,
} from "@antsia/social-domain/audit"
import type { MembershipRole } from "@antsia/social-domain/membership"
import { paginationOptsValidator, type PaginationResult } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { notFound } from "../../lib/errors"
import { networkAdminQuery, networkQuery, operatorQuery } from "../../lib/functions"
import { miniProfileCache, type PersonMiniProfile } from "../people/miniProfile"
import { auditActionValidator, auditSubjectTableValidator } from "./tables"

export type AuditEntry = {
  action: AuditAction
  capacity: AuditCapacity
  /** Absent si, et seulement si, la qualité est `system`. */
  actorPersonId?: Id<"persons">
  /** Le réseau de l'acte ; absent pour un acte de plateforme hors réseau. */
  networkId?: Id<"networks">
  subject: AuditSubject
  details?: AuditDetails
  at?: number
}

/** Ajoute la ligne d'une décision au journal. Une ligne incohérente est une faute de programmation : elle lève. */
export async function appendAudit(ctx: Pick<MutationCtx, "db">, entry: AuditEntry): Promise<Id<"engineAudit">> {
  if (isSystemCapacity(entry.capacity) !== (entry.actorPersonId === undefined)) throw new Error("[audit] acteur et qualité incohérents")
  const problems = entry.details ? auditDetailsProblems(entry.details) : []
  if (problems.length > 0) throw new Error(`[audit] détail non conforme : ${problems.join(" ; ")}`)
  return await ctx.db.insert("engineAudit", {
    action: entry.action,
    capacity: entry.capacity,
    ...(entry.actorPersonId ? { actorPersonId: entry.actorPersonId } : {}),
    ...(entry.networkId ? { networkId: entry.networkId } : {}),
    subjectTable: entry.subject.table,
    subjectId: entry.subject.id,
    ...(entry.details && Object.keys(entry.details).length > 0 ? { details: { ...entry.details } } : {}),
    at: entry.at ?? Date.now(),
  })
}

/** La qualité d'un opérateur de plateforme : son rôle. */
export function operatorCapacity(operator: Doc<"operators">): AuditCapacity {
  return operator.role
}

/** La qualité d'un membre qui DÉCIDE dans un réseau ; `null` pour un simple membre. */
export function networkRoleCapacity(role: MembershipRole): AuditCapacity | null {
  return role === "network_admin" || role === "network_moderator" ? role : null
}

export type AuditEntryDto = {
  auditId: Id<"engineAudit">
  action: AuditAction
  capacity: AuditCapacity
  /** `null` pour un acte du système. Nom et identifiant PUBLIÉS seulement. */
  actor: Pick<PersonMiniProfile, "personId" | "displayName" | "handle"> | null
  networkId: Id<"networks"> | null
  subject: AuditSubject
  details: AuditDetails | null
  at: number
}

async function toDtos(ctx: QueryCtx, rows: Doc<"engineAudit">[]): Promise<AuditEntryDto[]> {
  const profileOf = miniProfileCache(ctx)
  const out: AuditEntryDto[] = []
  for (const row of rows) {
    const actor = row.actorPersonId ? await profileOf(row.actorPersonId) : null
    out.push({
      auditId: row._id,
      action: row.action,
      capacity: row.capacity,
      actor: actor ? { personId: actor.personId, displayName: actor.displayName, handle: actor.handle } : null,
      networkId: row.networkId ?? null,
      subject: { table: row.subjectTable, id: row.subjectId },
      details: row.details ?? null,
      at: row.at,
    })
  }
  return out
}

/** Console : le journal du moteur entier, ou d'un réseau, du plus récent au plus ancien. */
export const paginateAudit = operatorQuery({
  args: { networkId: v.optional(v.id("networks")), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<AuditEntryDto>> => {
    const networkId = args.networkId
    const result =
      networkId === undefined
        ? await ctx.db.query("engineAudit").withIndex("by_at").order("desc").paginate(args.paginationOpts)
        : await ctx.db
            .query("engineAudit")
            .withIndex("by_network_at", (q) => q.eq("networkId", networkId))
            .order("desc")
            .paginate(args.paginationOpts)
    return { ...result, page: await toDtos(ctx, result.page) }
  },
})

/** Console : l'histoire d'un sujet (un réseau, une personne, une analyse de fichier). */
export const paginateSubjectAudit = operatorQuery({
  args: { subjectTable: auditSubjectTableValidator, subjectId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<AuditEntryDto>> => {
    const result = await ctx.db
      .query("engineAudit")
      .withIndex("by_subject_at", (q) => q.eq("subjectTable", args.subjectTable).eq("subjectId", args.subjectId))
      .order("desc")
      .paginate(args.paginationOpts)
    return { ...result, page: await toDtos(ctx, result.page) }
  },
})

/**
 * Le journal de MON réseau — ses administrateurs et ses modérateurs. Tout autre
 * membre reçoit le refus indistinct : savoir qu'un journal existe n'apprend rien,
 * mais savoir qui y figure, si.
 */
export const paginateNetworkAudit = networkQuery({
  minStatus: "declaree",
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<AuditEntryDto>> => {
    if (!networkRoleCapacity(ctx.membership.role)) return notFound()
    const result = await ctx.db
      .query("engineAudit")
      .withIndex("by_network_at", (q) => q.eq("networkId", ctx.networkId))
      .order("desc")
      .paginate(args.paginationOpts)
    return { ...result, page: await toDtos(ctx, result.page) }
  },
})

/** Lignes du journal du réseau relues par fenêtre de la lecture d'administration (l'écran en demande vingt). */
export const NETWORK_ADMIN_AUDIT_WINDOW_MAX = 50

export type NetworkAdminAuditEntryDto = AuditEntryDto & {
  /** Le motif de la décision (`details.reason`), `null` si l'acte n'en porte pas. */
  reason: string | null
}

/**
 * ADR-0042 (CH-815 A6) — le journal de CE réseau pour son administration, depuis son application
 * d'administration (section « Journal », dernière décision de chaque module) : qui a décidé quoi,
 * quand, à quel titre, avec quel motif. Même projection que la console (`toDtos` : nom et
 * identifiant PUBLIÉS de l'acteur, qualité, action, sujet, détail borné, date), plus le motif à part ;
 * aucune donnée de personne au-delà. La plus récente d'abord, fenêtres de 50 lignes au plus.
 * Filtre facultatif par action, appliqué à la fenêtre lue : une fenêtre filtrée peut être vide et
 * annoncer sa suite (`isDone`, `continueCursor`), l'écran demande alors la suivante.
 */
export const paginateNetworkAdminAudit = networkAdminQuery({
  args: { action: v.optional(auditActionValidator), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<NetworkAdminAuditEntryDto>> => {
    const requested = Number.isFinite(args.paginationOpts.numItems) ? Math.trunc(args.paginationOpts.numItems) : 1
    const numItems = Math.max(1, Math.min(NETWORK_ADMIN_AUDIT_WINDOW_MAX, requested))
    const result = await ctx.db
      .query("engineAudit")
      .withIndex("by_network_at", (q) => q.eq("networkId", ctx.networkId))
      .order("desc")
      .paginate({ ...args.paginationOpts, numItems })
    const rows = args.action === undefined ? result.page : result.page.filter((row) => row.action === args.action)
    const page = (await toDtos(ctx, rows)).map((entry) => ({ ...entry, reason: typeof entry.details?.reason === "string" ? entry.details.reason : null }))
    return { ...result, page }
  },
})
