// Dupliqué de socle/convex/modules/reseauPersonnel/media.ts @ ad2e7fdc2 — adaptations : garde des fichiers du moteur (fraîcheur, puis admission SOUS LA POLITIQUE de l'usage — l'exception `media_social` du socle disparaît, D36 : les usages suivent désormais les bornes du domaine) ; déclaration du client confrontée au stockage (type et poids) ; URL d'upload sous adhésion, usage déclaré et débit ; DTO du contrat `@antsia/social-contracts/media` avec la retenue nommée (fail-closed) au lieu d'omettre le média ; personnes et réseaux.
/**
 * Médias des publications, stories et albums — la doctrine des octets.
 *
 * Trois règles qui ne se négocient pas :
 *  · une URL ne sort QUE par la garde des fichiers (`resolveFileDelivery`), et
 *    seulement sur des lignes dont la visibilité est DÉJÀ jugée par l'appelant ;
 *  · jamais d'identifiant de stockage dans un DTO — l'URL, ou la retenue ;
 *  · jamais d'URL persistée — elle expire ; la ligne garde la référence privée.
 *
 * Un média DÉCLARÉ est un DÉPÔT : fichier neuf (`assertFreshUpload`), puis
 * politique de son usage et inscription à l'analyse au nom de l'acteur
 * (`admitStoredUpload`). Les bornes fines par nature (vidéo seule, durée,
 * texte alternatif) restent au domaine, chez l'appelant (`assertPostMedia`…).
 */
import type { MediaWithheld, PostMediaDto } from "@antsia/social-contracts/media"
import type { UploadUsage } from "@antsia/social-domain/uploadPolicy"
import { type Infer, v } from "convex/values"

import type { Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { networkMutation } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { guardUploadUrl } from "../../lib/uploadPolicy"
import { literals } from "../../lib/validators"
import { admitStoredUpload, assertFreshUpload } from "../files/admission"
import type { FileScanSource } from "../files/policy"
import { resolveFileDelivery, withheldCodeOf, withheldCodeValidator } from "../files/storageGuard"

export const MEDIA_KINDS = ["image", "video"] as const

export const mediaKindValidator = literals(MEDIA_KINDS)

/** Ce qu'une ligne (publication, story, album) porte d'un média — vérifié au stockage. */
export const storedMediaValidator = v.object({
  storageId: v.id("_storage"),
  kind: mediaKindValidator,
  mimeType: v.string(),
  sizeBytes: v.number(),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  durationMs: v.optional(v.number()),
  altText: v.optional(v.string()),
})

export type StoredMedia = Infer<typeof storedMediaValidator>

/**
 * Ce que le client DÉCLARE d'un média, avant que le stockage ne tranche.
 * `width`/`height`/`durationMs` restent déclarés : le stockage ne les connaît
 * pas, ils ne servent qu'au rendu (rapport d'aspect), jamais à une décision.
 */
export const declaredMediaValidator = v.object({
  storageId: v.id("_storage"),
  kind: mediaKindValidator,
  mimeType: v.string(),
  sizeBytes: v.number(),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  durationMs: v.optional(v.number()),
  altText: v.optional(v.string()),
})

export type DeclaredMedia = Infer<typeof declaredMediaValidator>

/** Le DTO d'un média (`PostMediaDto`) : URL par la garde, ou la retenue nommée. */
export const postMediaDtoValidator = v.object({
  url: v.union(v.string(), v.null()),
  withheld: v.union(withheldCodeValidator, v.null()),
  kind: mediaKindValidator,
  mimeType: v.string(),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  durationMs: v.optional(v.number()),
  altText: v.optional(v.string()),
})

/** Usages de dépôt d'un média de réseau (les images de profil passent par `people/profile`). */
export const NETWORK_MEDIA_USAGES = ["media_social", "story_media", "album_image"] as const satisfies readonly UploadUsage[]

/**
 * Résout les médias d'une ligne en DTO. À n'appeler QUE sur des lignes dont la
 * visibilité est déjà jugée. Un média retenu par la garde garde sa place, sans
 * URL, avec la raison : l'écran montre « analyse en cours » ou « bloqué ».
 */
export async function resolvePostMediaDtos(ctx: Pick<QueryCtx, "db" | "storage">, media: readonly StoredMedia[] | undefined, importing?: { status: "pending" | "failed"; items: readonly Omit<StoredMedia, "storageId" | "sizeBytes">[] }): Promise<PostMediaDto[]> {
  if (importing) return importing.items.map((item) => ({ ...item, url: null, withheld: importing.status === "pending" ? "fileScanPending" as const : "fileQuarantined" as const }))
  if (!media || media.length === 0) return []
  const resolved: PostMediaDto[] = []
  for (const item of media) {
    const delivery = await resolveFileDelivery(ctx, item.storageId)
    const withheld: MediaWithheld | null = withheldCodeOf(delivery.scan)
    resolved.push({
      url: delivery.url,
      withheld,
      kind: item.kind,
      mimeType: item.mimeType,
      ...(item.width !== undefined ? { width: item.width } : {}),
      ...(item.height !== undefined ? { height: item.height } : {}),
      ...(item.durationMs !== undefined ? { durationMs: item.durationMs } : {}),
      ...(item.altText !== undefined ? { altText: item.altText } : {}),
    })
  }
  return resolved
}

/**
 * La VÉRITÉ DU STOCKAGE écrase le déclaré, média par média — partagé par tous
 * les écrivains de médias du réseau (publication, story, album). Le fichier
 * d'autrui se refuse comme un identifiant inventé (`notFound`) ; le sien déjà
 * joint se nomme (`conflict`) ; une déclaration qui ment (type, poids) est
 * refusée (`UPLOAD_MISMATCH`).
 */
export async function verifyDeclaredMedia(
  ctx: MutationCtx,
  args: {
    actorPersonId: Id<"persons">
    networkId: Id<"networks">
    usage: UploadUsage
    source: FileScanSource
    declared: readonly DeclaredMedia[]
  },
): Promise<StoredMedia[]> {
  const verified: StoredMedia[] = []
  for (const item of args.declared) {
    await assertFreshUpload(ctx, args.actorPersonId, item.storageId)
    const stored = await admitStoredUpload(
      ctx,
      { storageId: item.storageId, usage: args.usage, mimeType: item.mimeType, sizeBytes: item.sizeBytes },
      { source: args.source, networkId: args.networkId, uploadedByPersonId: args.actorPersonId },
    )
    const altText = item.altText?.trim()
    verified.push({
      storageId: item.storageId,
      kind: item.kind,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      ...(item.width !== undefined ? { width: item.width } : {}),
      ...(item.height !== undefined ? { height: item.height } : {}),
      ...(item.durationMs !== undefined ? { durationMs: item.durationMs } : {}),
      ...(altText ? { altText } : {}),
    })
  }
  return verified
}

/**
 * URL de dépôt d'un média dans un réseau. Le fichier déposé n'existe pour
 * PERSONNE tant qu'une écriture ne l'a pas vérifié et embarqué sur une ligne :
 * une URL de dépôt ne publie rien.
 */
export const generateUploadUrl = networkMutation({
  args: { usage: literals(NETWORK_MEDIA_USAGES) },
  returns: v.string(),
  handler: async (ctx, { usage }) => {
    await enforceRateLimit(ctx, "upload.url", ctx.person._id)
    return await guardUploadUrl(ctx, usage)
  },
})
