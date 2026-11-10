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
 */

import { POST_IMAGE_MIME_TYPES } from "@antsia/social-domain/content"
import type { TFunction } from "i18next"

/** Le plus grand côté d'une photo envoyée, en pixels (décision du 9/11/2026). */
export const IMAGE_UPLOAD_MAX_DIMENSION = 2048

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
}

/** Que faire d'une photo, selon son type déclaré. */
export type ImageUploadPlan =
  | { action: "reencode"; plan: ImageReencodePlan }
  | { action: "strip-animated" }
  | { action: "refuse"; refusal: "unsupported-type" }

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

const REFUSAL_KEYS: Record<ImagePreparationRefusal, string> = {
  "unsupported-type": "reseau:mediaPreparation.refusal.unsupportedType",
  unreadable: "reseau:mediaPreparation.refusal.unreadable",
  "canvas-unavailable": "reseau:mediaPreparation.refusal.canvasUnavailable",
  "encoder-failed": "reseau:mediaPreparation.refusal.encoderFailed",
  "metadata-remaining": "reseau:mediaPreparation.refusal.metadataRemaining",
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
