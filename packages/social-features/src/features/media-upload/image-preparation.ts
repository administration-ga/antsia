/**
 * image-preparation — ce qui DÉCIDE de la préparation d'une photo avant
 * l'envoi, hors de tout navigateur (lot SD-02, plan 03 ; décision du
 * propriétaire du 9/11/2026).
 *
 * Module PUR : ni DOM, ni React, ni moteur. Les bornes, le format de sortie,
 * le calcul des dimensions, les refus et leurs phrases vivent ici, testés en
 * `node`. L'exécution (décodage, canvas, encodeur) est dans
 * `reencode-image.ts`.
 *
 * Les décisions appliquées :
 *   · ré-encodage SYSTÉMATIQUE de toute photo fixe (JPEG, PNG, WebP) ;
 *   · plus grand côté borné à `IMAGE_UPLOAD_MAX_DIMENSION` (2 048 px) ;
 *   · aucune métadonnée en sortie (le canvas n'en recopie pas, et la sortie de
 *     l'encodeur repasse par `@antsia/social-domain/imageMetadata`) ;
 *   · le GIF et le WebP ANIMÉS ne sont pas ré-encodés (un canvas n'en
 *     garderait que la première image) : leurs pixels partent intacts, leurs
 *     blocs de métadonnées sont retirés ;
 *   · ÉCHEC FERMÉ : tout échec est un refus nommé, jamais l'original.
 *
 * Trois options d'un écran (`ImagePreparationOptions`, lot PF-03), qui ne
 * desserrent rien : un RECADRAGE (la photo et la couverture du profil), un
 * plus grand côté plus PETIT que 2 048 px (les images rondes, sous la borne de
 * 5 Mio de l'usage `avatar`), et la CONVERSION des photos HEIC/HEIF de
 * l'iPhone en JPEG (pièces jointes d'iCom, qui les acceptaient brutes) — par le
 * décodeur du navigateur, refusées s'il ne sait pas les lire.
 */

import { POST_IMAGE_MAX_BYTES, POST_IMAGE_MIME_TYPES } from "@antsia/social-domain/content"
import type { TFunction } from "i18next"

/**
 * Le poids le plus lourd d'une photo CHOISIE qu'un écran accepte de préparer
 * sur l'appareil (lot PF-03) : celui d'une photo de publication
 * (`POST_IMAGE_MAX_BYTES`, 20 Mio), que le composeur du fil juge déjà avant de
 * préparer (FP-01). La borne de l'usage (5 Mio pour une photo de profil, par
 * exemple) se juge ensuite sur l'image PRÉPARÉE : une photo de téléphone de
 * 8 Mio part réduite, au lieu d'être refusée. Au-delà de 20 Mio, le décodage
 * coûterait trop de mémoire sur un téléphone modeste.
 */
export const IMAGE_SOURCE_MAX_BYTES = POST_IMAGE_MAX_BYTES

/** Le plus grand côté d'une photo envoyée, en pixels (décision du 9/11/2026). */
export const IMAGE_UPLOAD_MAX_DIMENSION = 2048

/**
 * Le plus grand côté d'une image RONDE — photo de profil, photo d'un groupe
 * iCom (usage `avatar`, 5 Mio au plus) —, en pixels (lot PF-03).
 *
 * Une borne qu'on peut PROUVER : un PNG RGBA de 1 024 × 1 024 pèse au plus
 * 4 Mio bruts (1 024 × 1 024 × 4 octets, plus un octet de filtre par ligne et
 * l'enveloppe de compression), donc toujours sous les 5 Mio de l'usage, même
 * sans perte. À 2 048 px, ce même PNG pourrait peser 16 Mio et serait refusé
 * par le serveur. Le plus grand médaillon affiché fait 104 px (3 fois plus sur
 * un écran dense) : 1 024 px laissent de la marge. Valeur À VALIDER par le
 * propriétaire.
 */
export const AVATAR_UPLOAD_MAX_DIMENSION = 1024

/** Les photos HEIC/HEIF de l'iPhone, que seul un écran qui l'accepte convertit. */
export const HEIF_IMAGE_TYPES = ["image/heic", "image/heif"] as const

/**
 * Un RECADRAGE : la région gardée, en pixels de l'image AFFICHÉE (orientation
 * de l'appareil appliquée), et les dimensions de l'image sur laquelle elle a
 * été calculée. Si l'image décodée n'a pas ces dimensions, le recadrage n'est
 * pas appliqué à une autre image : la photo est refusée.
 */
export interface ImageCrop {
  readonly sourceWidth: number
  readonly sourceHeight: number
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Ce qu'un écran demande en plus des décisions communes. */
export interface ImagePreparationOptions {
  /** Ne garder que cette région (avant la réduction). Refusé sur une image animée. */
  crop?: ImageCrop
  /** Plus grand côté de sortie ; jamais au-delà de `IMAGE_UPLOAD_MAX_DIMENSION`. */
  maxDimension?: number
  /** Accepter une photo HEIC/HEIF : décodée par le navigateur, rendue en JPEG ; sinon refusée. */
  convertHeif?: boolean
}

/**
 * La qualité d'encodage JPEG et WebP des photos de publication et de Story
 * (0 à 1).
 *
 * Mesurée au lot SD-02 (libjpeg-turbo, l'encodeur de Chrome, sur des photos
 * réduites à 2 048 px) : 0,85 rend 0,3 à 0,9 Mio pour une photo 16:9, et au
 * plus 1,7 Mio pour une photo carrée très granuleuse, contre 0,5 à 2,2 Mio à
 * 0,92 (la qualité des albums, `ALBUM_REENCODE_QUALITY`). Poids cible proposé :
 * 2 Mio par photo — valeur À VALIDER par le propriétaire.
 */
export const IMAGE_UPLOAD_QUALITY = 0.85

/** Les formats qu'un encodeur de canvas sait rendre et que le moteur accepte. */
export const IMAGE_OUTPUT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const

export type ImageOutputType = (typeof IMAGE_OUTPUT_TYPES)[number]

export function isImageOutputType(value: string): value is ImageOutputType {
  return (IMAGE_OUTPUT_TYPES as readonly string[]).includes(value)
}

/** Les photos qu'un composeur prépare : celles du fil et des Stories (`POST_IMAGE_MIME_TYPES`). */
export function isPreparableImageType(mimeType: string): boolean {
  return (POST_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)
}

/**
 * Le ré-encodage d'une photo fixe : le format de sortie, le plus grand côté
 * (`null` : dimensions d'origine — l'album, qui garde son comportement), la
 * qualité (JPEG et WebP ; ignorée pour le PNG, sans perte).
 */
export interface ImageReencodePlan {
  targetType: ImageOutputType
  maxDimension: number | null
  quality: number
  /** La région gardée (PF-03) ; absente : l'image entière. */
  crop?: ImageCrop
}

/** Que faire d'une photo, selon son type déclaré. */
export type ImageUploadPlan =
  | { action: "reencode"; plan: ImageReencodePlan }
  | { action: "strip-animated" }
  | { action: "refuse"; refusal: "unsupported-type" | "not-croppable" }

/**
 * Le plan d'une photo de publication, de Story ou de profil.
 *
 * Chaque format reste dans sa famille : JPEG → JPEG ; PNG → PNG (la
 * transparence est portante, et une capture d'écran garde son texte net) ;
 * WebP → WebP (sa transparence aussi ; un navigateur qui n'encode pas le WebP
 * rend du PNG, accepté de même). Le GIF n'est pas ré-encodé (animé). Un WebP
 * ANIMÉ ne se reconnaît qu'à ses octets : `reencode-image.ts` le détourne vers
 * `strip-animated` avant d'appliquer ce plan.
 */
export function imageUploadPlan(mimeType: string): ImageUploadPlan {
  const plan = (targetType: ImageOutputType): ImageUploadPlan => ({
    action: "reencode",
    plan: { targetType, maxDimension: IMAGE_UPLOAD_MAX_DIMENSION, quality: IMAGE_UPLOAD_QUALITY },
  })
  switch (mimeType) {
    case "image/jpeg":
      return plan("image/jpeg")
    case "image/png":
      return plan("image/png")
    case "image/webp":
      return plan("image/webp")
    case "image/gif":
      return { action: "strip-animated" }
    default:
      return { action: "refuse", refusal: "unsupported-type" }
  }
}

/**
 * Les dimensions de sortie : celles d'origine si elles tiennent sous la borne,
 * sinon réduites en gardant les proportions, le plus grand côté valant
 * exactement la borne. `null` : dimensions invalides (image illisible).
 */
export function fitWithin(
  width: number,
  height: number,
  maxDimension: number | null,
): { width: number; height: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null
  const w = Math.round(width)
  const h = Math.round(height)
  if (maxDimension === null || Math.max(w, h) <= maxDimension) return { width: w, height: h }
  const scale = maxDimension / Math.max(w, h)
  return w >= h
    ? { width: maxDimension, height: Math.max(1, Math.round(h * scale)) }
    : { width: Math.max(1, Math.round(w * scale)), height: maxDimension }
}

/** Le plus grand côté demandé par un écran, ramené sous la borne commune. */
function boundedMaxDimension(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return IMAGE_UPLOAD_MAX_DIMENSION
  return Math.max(1, Math.min(IMAGE_UPLOAD_MAX_DIMENSION, Math.floor(requested)))
}

/**
 * Le plan d'une photo sous les options d'un écran (PF-03) : les décisions de
 * `imageUploadPlan`, plus le recadrage, une borne plus petite, la conversion
 * HEIC/HEIF. Aucune option ne desserre : la borne reste au plus 2 048 px, un
 * type inconnu reste refusé, une image animée n'est jamais recadrée (un canvas
 * n'en garderait que la première image) — elle est refusée.
 */
export function imagePreparationPlan(mimeType: string, options: ImagePreparationOptions = {}): ImageUploadPlan {
  const heif = options.convertHeif === true && (HEIF_IMAGE_TYPES as readonly string[]).includes(mimeType)
  const base: ImageUploadPlan = heif
    ? { action: "reencode", plan: { targetType: "image/jpeg", maxDimension: IMAGE_UPLOAD_MAX_DIMENSION, quality: IMAGE_UPLOAD_QUALITY } }
    : imageUploadPlan(mimeType)
  if (base.action === "strip-animated" && options.crop !== undefined) return { action: "refuse", refusal: "not-croppable" }
  if (base.action !== "reencode") return base
  return {
    action: "reencode",
    plan: {
      ...base.plan,
      maxDimension: boundedMaxDimension(options.maxDimension),
      ...(options.crop === undefined ? {} : { crop: options.crop }),
    },
  }
}

/**
 * Le recadrage, vérifié contre l'image RÉELLEMENT décodée : la région ramenée
 * dans l'image, ou `null` — dimensions qui ne sont pas celles du calcul,
 * nombres invalides, région de moins d'un pixel. `null` refuse la photo.
 */
export function cropWithinSource(crop: ImageCrop, width: number, height: number): ImageCrop | null {
  const values = [crop.sourceWidth, crop.sourceHeight, crop.x, crop.y, crop.width, crop.height, width, height]
  if (!values.every(Number.isFinite)) return null
  if (Math.round(crop.sourceWidth) !== Math.round(width) || Math.round(crop.sourceHeight) !== Math.round(height)) return null
  const x = Math.min(Math.max(0, crop.x), width)
  const y = Math.min(Math.max(0, crop.y), height)
  const w = Math.min(crop.width, width - x)
  const h = Math.min(crop.height, height - y)
  if (w < 1 || h < 1) return null
  return { sourceWidth: width, sourceHeight: height, x, y, width: w, height: h }
}

/** Le nom d'une photo HEIC/HEIF rendue en JPEG : même nom, extension `.jpg`. */
export function heifOutputName(name: string): string {
  const base = name.replace(/\.(heic|heif)$/i, "")
  return `${base.length > 0 ? base : "photo"}.jpg`
}

/**
 * Pourquoi une photo n'a pas été préparée — un code, que l'écran traduit
 * (`imagePreparationRefusalText`). Chacun veut dire : la photo n'est PAS
 * envoyée.
 */
export type ImagePreparationRefusal =
  /** Type que le module ne prépare pas (ni JPEG, ni PNG, ni WebP, ni GIF). */
  | "unsupported-type"
  /** Le navigateur n'a pas pu décoder l'image, ou ses octets sont rompus. */
  | "unreadable"
  /** Pas de canvas 2D (navigateur trop ancien, environnement sans DOM, image trop grande). */
  | "canvas-unavailable"
  /** L'encodeur n'a rien rendu, ou un format que le moteur n'accepte pas. */
  | "encoder-failed"
  /** Un bloc de métadonnées n'a pas pu être retiré de la sortie. */
  | "metadata-remaining"
  /** Un recadrage demandé sur une image animée (PF-03) : il en perdrait l'animation. */
  | "not-croppable"

const REFUSAL_KEYS: Record<ImagePreparationRefusal, string> = {
  "unsupported-type": "reseau:mediaPreparation.refusal.unsupportedType",
  unreadable: "reseau:mediaPreparation.refusal.unreadable",
  "canvas-unavailable": "reseau:mediaPreparation.refusal.canvasUnavailable",
  "encoder-failed": "reseau:mediaPreparation.refusal.encoderFailed",
  "metadata-remaining": "reseau:mediaPreparation.refusal.metadataRemaining",
  "not-croppable": "reseau:mediaPreparation.refusal.notCroppable",
}

/**
 * La phrase d'un refus, dans la langue de l'écran. Clés qualifiées
 * (`reseau:mediaPreparation.*`) : n'importe quel `t` du moteur les résout,
 * quel que soit l'espace de noms de l'écran qui l'appelle.
 */
export function imagePreparationRefusalText(refusal: ImagePreparationRefusal, fileName: string, t: TFunction): string {
  return t(REFUSAL_KEYS[refusal], { name: fileName })
}

const KIBIBYTE = 1024
const MEBIBYTE = 1024 * 1024

/**
 * Un poids, dit dans la langue courante (« 8,2 Mo », « 640 ko » ; « 8.2 MB »
 * en anglais). Base 1 024, comme les bornes du moteur (« 20 Mo » =
 * 20 × 1 024 × 1 024 octets).
 */
export function imageWeightLabel(bytes: number, locale: string): string {
  const size = Math.max(0, bytes)
  if (size >= MEBIBYTE) {
    return new Intl.NumberFormat(locale, { style: "unit", unit: "megabyte", maximumFractionDigits: 1 }).format(size / MEBIBYTE)
  }
  return new Intl.NumberFormat(locale, { style: "unit", unit: "kilobyte", maximumFractionDigits: 0 }).format(Math.max(1, Math.round(size / KIBIBYTE)))
}

/**
 * Ce que l'écran annonce avant l'envoi : le poids d'origine et le poids
 * envoyé, la photo débarrassée de ses informations cachées. `count` accorde la
 * phrase (une photo, plusieurs).
 */
export function imagePreparationSummary(
  input: { count: number; originalBytes: number; preparedBytes: number },
  locale: string,
  t: TFunction,
): string {
  return t("reseau:mediaPreparation.summary", {
    count: input.count,
    before: imageWeightLabel(input.originalBytes, locale),
    after: imageWeightLabel(input.preparedBytes, locale),
  })
}
