/**
 * P15 : pièces d'une candidature (CV, lettre, attestation). PDF seul, admis par
 * la garde des fichiers (usage `job_application_document`), analyse COMPLÈTE
 * exigée, jamais servis par URL, ni rattachés à un réseau ni nommés dans la
 * garde. Seul le candidat voit ses pièces (type, nom, taille, état d'analyse) ;
 * elles ne quittent ANTSIA que par le transport privé signé d'une candidature
 * explicite, par empreinte et référence opaque.
 */
import { COMMERCE_JOBS_LIMITS } from "@antsia/social-domain/commerce-jobs"
import { type Infer, v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { fail, notFound } from "../../lib/errors"
import { networkMutation, personMutation, personQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { guardUploadUrl } from "../../lib/uploadPolicy"
import { admitStoredUpload, assertFreshUpload } from "../files/admission"
import { getScanForStorage, getScanStatus, isServableStorage, withheldCodeOf } from "../files/storageGuard"
import { retireApplicationFile } from "./jobApplicationLifecycle"
import { jobAttachmentKindValidator } from "./jobTables"

/** Pièces prêtes conservées par personne : une bibliothèque courte, jamais un stockage. */
export const JOB_FILES_READY_MAX = 10
const FILENAME_MAX = 120

export const jobFileScanValidator = v.union(v.literal("clean"), v.literal("pending"), v.literal("blocked"))
export const jobFileDtoValidator = v.object({
  fileId: v.id("commerceApplicationFiles"), kind: jobAttachmentKindValidator, filename: v.union(v.string(), v.null()),
  byteSize: v.number(), createdAt: v.number(), scan: jobFileScanValidator,
})
export type JobFileDto = Infer<typeof jobFileDtoValidator>

/** Nom d'affichage du candidat, nettoyé : aucun chemin, aucun caractère de contrôle. */
function cleanFilename(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  const name = raw.normalize("NFC").replace(/^.*[\\/]/u, "").trim()
  if (name.length === 0) return undefined
  if (name.length > FILENAME_MAX || /[\u0000-\u001f\u007f]/u.test(name)) return fail("invalidArgument", { field: "filename" })
  return name
}

/** État lisible par le candidat : saine (analyse complète), en analyse, ou bloquée. */
export async function jobFileScanOf(ctx: Pick<QueryCtx, "db">, storageId: Id<"_storage">): Promise<"clean" | "pending" | "blocked"> {
  const status = await getScanStatus(ctx, storageId)
  const scan = await getScanForStorage(ctx, storageId)
  if (status === "clean" && scan?.requiresFullScan === true && scan.av?.verdict === "clean" && await isServableStorage(ctx, storageId)) return "clean"
  if (status === "clean") return "blocked"
  return withheldCodeOf(status) === "fileScanPending" ? "pending" : "blocked"
}

export const generateUploadUrl = networkMutation({
  args: {}, returns: v.string(),
  handler: async (ctx) => {
    const ready = await ctx.db.query("commerceApplicationFiles").withIndex("by_person_state", (q) => q.eq("personId", ctx.person._id).eq("state", "ready")).take(JOB_FILES_READY_MAX)
    if (ready.length >= JOB_FILES_READY_MAX) return fail("policyRefused")
    return await guardUploadUrl(ctx, "job_application_document")
  },
})

/**
 * Rattache un PDF déposé : fraîcheur (jamais le fichier d'autrui), temps 2 de la
 * politique, inscription à l'analyse avec antivirus OBLIGATOIRE. La ligne
 * d'analyse ne porte ni réseau ni nom de fichier : rien d'une candidature ne
 * s'expose dans les files de modération.
 */
export const registerFile = networkMutation({
  writeBucket: "shop.job.file",
  args: { storageId: v.id("_storage"), kind: jobAttachmentKindValidator, filename: v.optional(v.string()), mimeType: v.optional(v.string()) },
  returns: v.object({ fileId: v.id("commerceApplicationFiles") }),
  handler: async (ctx, args) => {
    await assertFreshUpload(ctx, ctx.person._id, args.storageId)
    const filename = cleanFilename(args.filename)
    const ready = await ctx.db.query("commerceApplicationFiles").withIndex("by_person_state", (q) => q.eq("personId", ctx.person._id).eq("state", "ready")).take(JOB_FILES_READY_MAX)
    if (ready.length >= JOB_FILES_READY_MAX) return fail("policyRefused")
    const admitted = await admitStoredUpload(ctx, { storageId: args.storageId, usage: "job_application_document", ...(args.mimeType === undefined ? {} : { mimeType: args.mimeType }) }, { source: "job_application", uploadedByPersonId: ctx.person._id })
    if (admitted.sizeBytes > COMMERCE_JOBS_LIMITS.attachmentBytesMax || !/^[a-f0-9]{64}$/u.test(admitted.sha256)) return fail("invalidArgument", { field: "storageId" })
    await ctx.db.patch(admitted.scanId, { requiresFullScan: true })
    const fileId = await ctx.db.insert("commerceApplicationFiles", {
      networkId: ctx.networkId, personId: ctx.person._id, storageId: args.storageId, kind: args.kind,
      ...(filename === undefined ? {} : { filename }), sha256: admitted.sha256, byteSize: admitted.sizeBytes, state: "ready", createdAt: Date.now(),
    })
    return { fileId }
  },
})

/** @selfScoped La personne lit ses propres pièces de candidature, jamais servies par adresse. */
export const myFiles = personQuery({
  args: {}, returns: v.array(jobFileDtoValidator),
  handler: async (ctx) => {
    // borné : JOB_FILES_READY_MAX pièces prêtes par personne, quota vérifié au dépôt
    const rows = await ctx.db.query("commerceApplicationFiles").withIndex("by_person_state", (q) => q.eq("personId", ctx.person._id).eq("state", "ready")).order("desc").take(JOB_FILES_READY_MAX)
    const files: JobFileDto[] = []
    for (const row of rows) files.push({ fileId: row._id, kind: row.kind, filename: row.filename ?? null, byteSize: row.byteSize, createdAt: row.createdAt, scan: await jobFileScanOf(ctx, row.storageId) })
    return files
  },
})

/**
 * @selfScoped La personne retire sa propre pièce : blob et analyse purgés, copies
 * déjà transmises révoquées par le canal privé, même sans adhésion active.
 */
export const retireFile = personMutation({
  args: { fileId: v.id("commerceApplicationFiles") }, returns: v.null(),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "shop.job.file", ctx.person._id)
    const file: Doc<"commerceApplicationFiles"> | null = await ctx.db.get(args.fileId)
    if (!file || file.personId !== ctx.person._id) return notFound()
    if (!await retireApplicationFile(ctx, file)) return fail("policyRefused")
    return null
  },
})
