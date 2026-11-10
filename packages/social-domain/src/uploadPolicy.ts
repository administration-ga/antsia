// Dupliqué de socle/convex/lib/uploadPolicy.ts @ ad2e7fdc2 — adaptations : partie PURE seulement (registre des usages, normalisations, recoupement déclaré ↔ stocké), la lecture de `_storage` reste au backend (`convex/lib/uploadPolicy.ts`) ; usages SOCIAUX seulement (D36 : `media_social` avec GIF, `avatar`, `cover`, `page_logo`, `page_banner`, `page_claim_evidence`, `album_image`, `story_media`, `chat_attachment`, `voice`, `live_recording`), les usages des publications, stories et avatars DÉRIVÉS des constantes du domaine (une seule source : le socle les laissait diverger, d'où l'exception `media_social`) ; libellés retirés ; refus à code de règle (`DomainViolation`) au lieu de chaînes `UPLOAD_*:usage`.
/**
 * Politique de dépôt de fichiers — les règles pures.
 *
 * DEUX TEMPS, ET ILS NE SE REMPLACENT PAS (backend) :
 *   1. `guardUploadUrl(ctx, usage)` — au moment de délivrer l'URL de dépôt :
 *      la surface DÉCLARE son usage, ce qui la rend lisible et verrouillable
 *      par le cliquet `upload-policy` ;
 *   2. `assertStoredUpload(ctx, { storageId, usage, … })` — au rattachement,
 *      quand le fichier est là : ce que le stockage porte RÉELLEMENT est
 *      confronté à l'usage et à la déclaration (`checkStoredUpload`, ici).
 *
 * PAR USAGE, JAMAIS GLOBALEMENT : la liste blanche et le plafond sont attachés
 * à l'usage. Ajouter une surface = ajouter une entrée, pas élargir une entrée.
 * Les écrans lisent ce registre pour refuser AVANT le dépôt (même borne).
 */
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES, POST_IMAGE_MAX_BYTES, POST_IMAGE_MIME_TYPES, POST_VIDEO_MAX_BYTES, POST_VIDEO_MIME_TYPES } from "./content"
import { STORY_VIDEO_MAX_BYTES, STORY_VIDEO_MIME_TYPES } from "./stories"
import { DomainViolation, megabytes } from "./violation"

const IMAGES = ["image/jpeg", "image/png", "image/webp"] as const
const GIF = ["image/gif"] as const
const PHOTOS_IPHONE = ["image/heic", "image/heif"] as const
const PDF = ["application/pdf"] as const
const AUDIO = ["audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav"] as const
const VIDEO = ["video/mp4", "video/webm"] as const
const BUREAUTIQUE = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const
const PRESENTATION = [
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const

/** Mébioctet binaire : le même compte que les écrans. */
const MO = 1024 * 1024

export type UploadUsageSpec = {
  /** Liste BLANCHE de types MIME. Jamais de liste noire. */
  readonly mimeTypes: readonly string[]
  /** Plafond en octets pour CET usage. */
  readonly maxBytes: number
}

/**
 * Le registre des usages sociaux du moteur. Publications, stories et avatars
 * reprennent les bornes du DOMAINE (`content`, `stories`) : la plus large des
 * deux natures (image, vidéo) borne le dépôt, la règle fine par nature est
 * appliquée ensuite par le domaine (`assertPostMedia`, `assertStoryMedia`).
 */
export const UPLOAD_USAGES = {
  /** Média d'une publication (images, GIF, vidéos). */
  media_social: { mimeTypes: [...POST_IMAGE_MIME_TYPES, ...POST_VIDEO_MIME_TYPES], maxBytes: Math.max(POST_IMAGE_MAX_BYTES, POST_VIDEO_MAX_BYTES) },
  /** Photo de profil, avatar de groupe. */
  avatar: { mimeTypes: AVATAR_MIME_TYPES, maxBytes: AVATAR_MAX_BYTES },
  /** Image de couverture d'un profil, d'un groupe ou d'un évènement. */
  cover: { mimeTypes: IMAGES, maxBytes: 10 * MO },
  /** Logo d'une page. */
  page_logo: { mimeTypes: IMAGES, maxBytes: 5 * MO },
  /** Bannière d'une page. */
  page_banner: { mimeTypes: IMAGES, maxBytes: 10 * MO },
  /** Pièce d'une revendication de page (statuts, récépissé, mandat) : document ou photo. */
  page_claim_evidence: { mimeTypes: [...PDF, ...IMAGES], maxBytes: 10 * MO },
  /** MP12 : illustration éditoriale, sans GIF, SVG ni vidéo. */
  editorial_image: { mimeTypes: IMAGES, maxBytes: 8 * MO },
  /** Photo d'un album. */
  album_image: { mimeTypes: [...IMAGES, ...GIF, ...PHOTOS_IPHONE], maxBytes: 20 * MO },
  /** Média d'une story : la borne vidéo la plus stricte du socle (50 Mo). */
  story_media: { mimeTypes: [...POST_IMAGE_MIME_TYPES, ...STORY_VIDEO_MIME_TYPES], maxBytes: Math.max(POST_IMAGE_MAX_BYTES, STORY_VIDEO_MAX_BYTES) },
  /** Pièce jointe d'une conversation (documents et médias). */
  chat_attachment: {
    mimeTypes: [...PDF, ...IMAGES, ...GIF, ...PHOTOS_IPHONE, ...VIDEO, ...AUDIO, "audio/aac", ...BUREAUTIQUE, ...PRESENTATION, "text/plain"],
    maxBytes: 25 * MO,
  },
  /** Message vocal. */
  voice: { mimeTypes: [...AUDIO, "audio/aac"], maxBytes: 25 * MO },
  /** Enregistrement d'un direct, rapatrié PAR LE SERVEUR (jamais un dépôt client). */
  live_recording: { mimeTypes: [...VIDEO, ...AUDIO], maxBytes: 4 * 1024 * MO },
  /** P15 : CV et pièces d'une candidature — PDF seul, 5 Mio (borne COMMAND §6.9), analyse complète exigée. */
  job_application_document: { mimeTypes: PDF, maxBytes: 5 * MO },
} as const satisfies Record<string, UploadUsageSpec>

export type UploadUsage = keyof typeof UPLOAD_USAGES

export const UPLOAD_USAGE_NAMES = Object.keys(UPLOAD_USAGES) as UploadUsage[]

/** Métadonnées déclarées par le client. Ce qui n'est pas déclaré est LU dans le stockage. */
export type DeclaredUpload<StorageId extends string = string> = {
  storageId: StorageId
  usage: UploadUsage
  mimeType?: string
  sizeBytes?: number
  /** Base64 (forme native Convex) ou hexadécimal. */
  sha256?: string
}

/** Ce que le stockage dit du fichier : la source de vérité. */
export type StoredFacts = {
  contentType?: string | null
  size: number
  sha256: string
}

/** Les métadonnées RÉELLES, que l'appelant écrit en base (jamais celles du client). */
export type StoredUpload<StorageId extends string = string> = {
  storageId: StorageId
  mimeType: string
  sizeBytes: number
  sha256: string
}

/** Un type MIME sans paramètres, en minuscules, `image/jpg` ramené à `image/jpeg`. */
export function normalizeMimeType(raw: string | undefined | null): string | null {
  if (!raw) return null
  const base = raw.split(";")[0]?.trim().toLowerCase() ?? ""
  if (base.length === 0) return null
  return base === "image/jpg" ? "image/jpeg" : base
}

/** Ce type est-il dans la liste blanche de l'usage ? */
export function isMimeAllowedForUsage(usage: UploadUsage, mime: string | undefined | null): boolean {
  const normalized = normalizeMimeType(mime)
  if (!normalized) return false
  return (UPLOAD_USAGES[usage].mimeTypes as readonly string[]).includes(normalized)
}

/** Normalise une empreinte (base64 de Convex ou hexadécimal) vers l'hexadécimal minuscule. */
export function normalizeSha256(raw: string): string | null {
  if (/^[a-f0-9]{64}$/i.test(raw)) return raw.toLowerCase()
  try {
    const bytes = Uint8Array.from(atob(raw), (char) => char.charCodeAt(0))
    if (bytes.length !== 32) return null
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  } catch {
    return null
  }
}

/**
 * Confronte le fichier stocké à l'usage annoncé et à la déclaration. Refuse,
 * dans cet ordre :
 *   - type hors de la liste blanche de l'usage (`UPLOAD_TYPE_NOT_ALLOWED`) ;
 *   - taille nulle, non entière, ou au-dessus du plafond (`UPLOAD_SIZE_OUT_OF_RANGE`) ;
 *   - désaccord entre ce que le client déclare et ce que le stockage porte
 *     (`UPLOAD_MISMATCH` : type, taille ou empreinte).
 *
 * Le type du STOCKAGE fait foi ; sans lui, le type déclaré sert de repli
 * (les fichiers du harnais de test n'en portent aucun) — et l'inspection des
 * octets le confronte de toute façon avant toute délivrance (garde fail-closed).
 */
export function checkStoredUpload<StorageId extends string>(
  declared: DeclaredUpload<StorageId>,
  stored: StoredFacts,
): StoredUpload<StorageId> {
  const spec: UploadUsageSpec = UPLOAD_USAGES[declared.usage]
  const mimeType = normalizeMimeType(stored.contentType) ?? normalizeMimeType(declared.mimeType)
  if (!mimeType || !isMimeAllowedForUsage(declared.usage, mimeType)) {
    throw new DomainViolation("UPLOAD_TYPE_NOT_ALLOWED")
  }
  if (!Number.isInteger(stored.size) || stored.size < 1 || stored.size > spec.maxBytes) {
    throw new DomainViolation("UPLOAD_SIZE_OUT_OF_RANGE", { maxMegabytes: megabytes(spec.maxBytes) })
  }
  const declaredMime = normalizeMimeType(declared.mimeType)
  if (declaredMime !== null && declaredMime !== mimeType) throw new DomainViolation("UPLOAD_MISMATCH")
  if (declared.sizeBytes !== undefined && declared.sizeBytes !== stored.size) throw new DomainViolation("UPLOAD_MISMATCH")
  const storedSha = normalizeSha256(stored.sha256)
  if (declared.sha256 !== undefined) {
    const declaredSha = normalizeSha256(declared.sha256)
    if (!declaredSha || !storedSha || declaredSha !== storedSha) throw new DomainViolation("UPLOAD_MISMATCH")
  }
  return { storageId: declared.storageId, mimeType, sizeBytes: stored.size, sha256: storedSha ?? stored.sha256 }
}
