/**
 * P15 : retrait de candidature selon une politique EXPLICITE, révocation des
 * pièces et effacement. Le retrait est toujours possible pour le candidat :
 * avant tout envoi, il est local et immédiat ; après, un contrôle privé demande
 * à PRO.GA de classer la candidature (si elle est encore ouverte) et de
 * supprimer ses copies de pièces. Une décision déjà prise chez PRO.GA n'est pas
 * réécrite ; les copies et la motivation sont retirées dans tous les cas.
 */
import { makeFunctionReference } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../_generated/server"
import { purgeStoredFile } from "../files/purge"

export const IDLE_AT = Number.MAX_SAFE_INTEGER
export const JOB_APPLICATION_PERSON_PAGE = 50

export const deliverJobApplicationRef = makeFunctionReference<"action", { applicationId: Id<"commerceApplications"> }, null>("modules/shops/jobApplicationTransport:deliver")
export const continueJobRevocationRef = makeFunctionReference<"mutation", { personId: Id<"persons"> }, null>("modules/shops/jobApplicationLifecycle:continueJobRevocation")
const continueJobFileRetirementRef = makeFunctionReference<"mutation", { personId: Id<"persons">; fileId: Id<"commerceApplicationFiles">; cursor: string }, null>("modules/shops/jobApplicationLifecycle:continueJobFileRetirement")

type Application = Doc<"commerceApplications">

/** Aucune copie n'a quitté ANTSIA (jamais envoyée, ou refusée par PRO.GA) : retrait local. */
function withdrawnLocally(row: Application): boolean {
  return row.state === "rejected" || row.dispatchedAt === undefined
}

/**
 * Retire une candidature : motivation, nom civil et octets privés effacés
 * localement tout de suite ; le retrait distant est un état durable distinct.
 * L'incrément de génération invalide toute réponse tardive d'un envoi en cours.
 */
export async function withdrawJobApplication(ctx: MutationCtx, row: Application, reason: "candidate_request" | "erasure"): Promise<Application["state"]> {
  if (row.revokedAt !== undefined) return row.state
  const now = Date.now()
  if (row.state === "withdrawn") {
    // Une ancienne ligne terminale sans marqueur ne doit pas bloquer le parcours d'effacement.
    await ctx.db.patch(row._id, { revokedAt: now, revokeReason: reason, rawBody: undefined, civilName: undefined, motivation: undefined,
      authorizationSessionId: undefined, authorizationAuthUserId: undefined, authorizedAt: undefined, authorizationUntil: undefined,
      authorizationRequired: undefined, leaseSessionId: undefined, unknownConfirmedAt: undefined, unknownRequestSha256: undefined,
      controlBody: undefined, controlExpiresAt: undefined, controlAttachmentRef: undefined, leaseUntil: undefined,
      files: row.files.map((file) => ({ ...file, transfer: "revoked" as const })), nextAttemptAt: IDLE_AT, updatedAt: now })
    return "withdrawn"
  }
  const local = withdrawnLocally(row)
  await ctx.db.patch(row._id, {
    state: local ? "withdrawn" : "withdrawal_pending", revokedAt: now, revokeReason: reason,
    rawBody: undefined, civilName: undefined, motivation: undefined,
    authorizationSessionId: undefined, authorizationAuthUserId: undefined, authorizedAt: undefined, authorizationUntil: undefined,
    authorizationRequired: undefined, leaseSessionId: undefined, unknownConfirmedAt: undefined, unknownRequestSha256: undefined,
    controlBody: undefined, controlExpiresAt: undefined, controlAttachmentRef: undefined,
    files: local ? row.files.map((file) => ({ ...file, transfer: "revoked" as const })) : row.files,
    attempts: 0, nextAttemptAt: local ? IDLE_AT : now, leaseUntil: undefined, generation: row.generation + 1, updatedAt: now,
  })
  if (!local) await ctx.scheduler.runAfter(0, deliverJobApplicationRef, { applicationId: row._id })
  return local ? "withdrawn" : "withdrawal_pending"
}

/**
 * Une pièce retirée par le candidat : jamais envoyée → abandonnée ; déjà copiée
 * chez PRO.GA → révocation privée. La candidature elle-même demeure.
 */
async function retireFilePage(ctx: MutationCtx, personId: Id<"persons">, fileId: Id<"commerceApplicationFiles">, cursor: string | null): Promise<void> {
  // borné : cinquante candidatures par transaction ; le curseur reste stable quand leur état change.
  const result = await ctx.db.query("commerceApplications").withIndex("by_person", (q) => q.eq("personId", personId))
    .paginate({ numItems: JOB_APPLICATION_PERSON_PAGE, cursor })
  const now = Date.now()
  for (const row of result.page) {
    if (row.revokedAt !== undefined || row.state === "withdrawn" || row.state === "rejected" || !row.files.some((file) => file.fileId === fileId)) continue
    const files = row.files.map((file) => file.fileId !== fileId ? file
      : { ...file, transfer: file.transfer === "stored" || (row.dispatchedAt !== undefined && file.transfer !== "revoked") ? "revoke_pending" as const : "revoked" as const, attempts: 0 })
    const pending = files.some((file) => file.transfer === "revoke_pending")
    await ctx.db.patch(row._id, { files, ...(pending && row.state === "submitted" ? { nextAttemptAt: now } : {}), updatedAt: now })
    if (pending && row.state === "submitted") await ctx.scheduler.runAfter(0, deliverJobApplicationRef, { applicationId: row._id })
  }
  if (!result.isDone) await ctx.scheduler.runAfter(0, continueJobFileRetirementRef, { personId, fileId, cursor: result.continueCursor })
}

export async function retireFileFromApplications(ctx: MutationCtx, personId: Id<"persons">, fileId: Id<"commerceApplicationFiles">): Promise<boolean> {
  await retireFilePage(ctx, personId, fileId, null)
  return true
}

/** Le fichier est déjà retiré : une page suivante ne rouvre jamais son admission. */
export const continueJobFileRetirement = internalMutation({
  args: { personId: v.id("persons"), fileId: v.id("commerceApplicationFiles"), cursor: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId)
    if (file && file.personId !== args.personId) return null
    await retireFilePage(ctx, args.personId, args.fileId, args.cursor)
    return null
  },
})

/** Retrait d'une pièce par le candidat : blob et ligne d'analyse purgés, plus aucune transmission. */
export async function retireApplicationFile(ctx: MutationCtx, file: Doc<"commerceApplicationFiles">): Promise<boolean> {
  if (file.state === "retired") return true
  await ctx.db.patch(file._id, { state: "retired", retiredAt: Date.now() })
  // La porte du fichier ferme immédiatement, même si ses références nécessitent plusieurs pages.
  await retireFileFromApplications(ctx, file.personId, file._id)
  await purgeStoredFile(ctx, file.storageId)
  return true
}

/**
 * Avant l'effacement générique : chaque candidature est retirée. Le travail est
 * terminé quand aucune n'attend plus de retrait distant ; un retrait distant
 * épuisé (tentatives bornées) laisse une trace `remoteUnconfirmed` et ne bloque
 * pas indéfiniment le droit à l'effacement.
 */
export async function revokeJobApplicationsForPerson(ctx: MutationCtx, personId: Id<"persons">): Promise<boolean> {
  const rows = await ctx.db.query("commerceApplications").withIndex("by_person_revoked", (q) => q.eq("personId", personId).eq("revokedAt", undefined)).take(JOB_APPLICATION_PERSON_PAGE + 1)
  for (const row of rows.slice(0, JOB_APPLICATION_PERSON_PAGE)) {
    await withdrawJobApplication(ctx, row, "erasure")
  }
  // Les lignes traitées sortent du premier index ; attendre les ACK ne masque pas la page suivante.
  const pending = await ctx.db.query("commerceApplications").withIndex("by_person_state", (q) => q.eq("personId", personId).eq("state", "withdrawal_pending")).first()
  return rows.length <= JOB_APPLICATION_PERSON_PAGE && pending === null
}

export const continueJobRevocation = internalMutation({
  args: { personId: v.id("persons") }, returns: v.null(),
  handler: async (ctx, args) => {
    const person = await ctx.db.get(args.personId)
    if (person?.deletionRequestedAt === undefined) return null
    if (!await revokeJobApplicationsForPerson(ctx, args.personId)) await ctx.scheduler.runAfter(60_000, continueJobRevocationRef, args)
    return null
  },
})
