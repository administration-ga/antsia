/**
 * profile-image-crop — ce qui DÉCIDE du recadrage d'une image de profil
 * (lot PF-03, plan 05 ; décision du propriétaire du 9/11/2026, plan
 * directeur § 6.2).
 *
 * Module PUR : ni DOM, ni React. Le cadre (cercle pour la photo, bandeau pour
 * la couverture), le zoom, le déplacement, les gestes du clavier et la
 * position de l'aperçu se calculent ici, testés en `node`.
 *
 * ⚠️ UN SEUL CALCUL pour l'aperçu et pour l'envoi : `cropRectFor` rend la
 * région gardée, en pixels de l'image affichée ; l'aperçu la projette sur son
 * cadre (`cropPreviewStyle`), le module de préparation la dessine sur le canvas
 * (`@antsia/social-features/media-upload`, option `crop`). Ce que la personne
 * voit dans le cadre est donc, au pixel près, ce qui part — puis réduit sous la
 * borne du cadre (1 024 px pour la photo ronde, 2 048 px pour le bandeau).
 *
 * La région est toujours CONTENUE dans l'image : ni bande vide, ni étirement.
 * Au zoom 1, c'est le plus grand rectangle au ratio du cadre qui tient dans
 * l'image ; zoomer le rétrécit autour de son centre.
 *
 * Précédent : `apps/antsia_ga/src/lib/square-image.ts` (logo d'une boutique,
 * même principe d'aperçu par la région source) — il vit dans l'application et
 * ne sert que le carré ; ce module-ci sert les deux cadres du profil.
 */

import { AVATAR_MIME_TYPES } from "@antsia/social-domain/content"
import { isMimeAllowedForUsage, UPLOAD_USAGES } from "@antsia/social-domain/uploadPolicy"
import { megabytes } from "@antsia/social-domain/violation"
import type { TFunction } from "i18next"

import { AVATAR_UPLOAD_MAX_DIMENSION, IMAGE_SOURCE_MAX_BYTES, IMAGE_UPLOAD_MAX_DIMENSION, fitWithin, type ImageCrop } from "../media-upload"

/** Les deux images d'un profil. */
export type ProfileImageKind = "avatar" | "cover"

/** Le cadre d'une image de profil : ratio (largeur / hauteur), forme montrée, borne de sortie. */
export interface ProfileImageFrame {
  readonly aspect: number
  readonly shape: "circle" | "band"
  readonly maxDimension: number
}

/**
 * Les cadres. La photo : un carré, montré en cercle (le médaillon), borné à
 * 1 024 px (`AVATAR_UPLOAD_MAX_DIMENSION`). La couverture : un bandeau 3:1,
 * borné à 2 048 px de large — la bannière de la fiche fait 128 px de haut sur
 * toute la largeur, soit à peu près 3:1 sur un téléphone ; plus large au
 * bureau, elle est centrée (`background-size: cover`). Ratio À VALIDER par le
 * propriétaire.
 */
export const PROFILE_IMAGE_FRAMES: Readonly<Record<ProfileImageKind, ProfileImageFrame>> = {
  avatar: { aspect: 1, shape: "circle", maxDimension: AVATAR_UPLOAD_MAX_DIMENSION },
  cover: { aspect: 3, shape: "band", maxDimension: IMAGE_UPLOAD_MAX_DIMENSION },
}

/** Le zoom le plus fort : la région fait alors le quart du cadre de départ. */
export const PROFILE_CROP_MAX_ZOOM = 4

/** Un cran de zoom au clavier (multiplicatif : chaque cran vaut le même geste). */
export const PROFILE_CROP_ZOOM_STEP = 1.1

/** Un cran de déplacement au clavier : 5 % de la région visible (20 % avec Maj). */
export const PROFILE_CROP_PAN_STEP = 0.05
const PROFILE_CROP_PAN_STEP_LARGE = 0.2

/** Les dimensions de l'image affichée (orientation de l'appareil appliquée). */
export interface CropSource {
  readonly width: number
  readonly height: number
}

/** L'état du recadreur : zoom (1 à 4) et centre de la région, en pixels de l'image. */
export interface CropView {
  readonly zoom: number
  readonly centerX: number
  readonly centerY: number
}

/** Des dimensions d'image utilisables (finies, d'au moins un pixel). */
export function isCropSource(source: CropSource): boolean {
  return Number.isFinite(source.width) && Number.isFinite(source.height) && source.width >= 1 && source.height >= 1
}

/** La région au zoom 1 : le plus grand rectangle au ratio du cadre contenu dans l'image. */
export function baseCropSize(source: CropSource, aspect: number): { width: number; height: number } {
  return source.width / source.height > aspect
    ? { width: source.height * aspect, height: source.height }
    : { width: source.width, height: source.width / aspect }
}

/** L'état de départ : toute la place, centré. */
export function initialCropView(source: CropSource): CropView {
  return { zoom: 1, centerX: source.width / 2, centerY: source.height / 2 }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

/** Le zoom ramené entre 1 et le maximum ; une valeur invalide revient à 1. */
export function clampZoom(zoom: number): number {
  return Number.isFinite(zoom) ? clamp(zoom, 1, PROFILE_CROP_MAX_ZOOM) : 1
}

/**
 * L'état ramené dans les bornes : zoom permis, centre tel que la région reste
 * entièrement dans l'image. Tout geste passe par ici.
 */
export function clampCropView(source: CropSource, aspect: number, view: CropView): CropView {
  const zoom = clampZoom(view.zoom)
  const base = baseCropSize(source, aspect)
  const halfWidth = base.width / zoom / 2
  const halfHeight = base.height / zoom / 2
  const centerX = Number.isFinite(view.centerX) ? view.centerX : source.width / 2
  const centerY = Number.isFinite(view.centerY) ? view.centerY : source.height / 2
  return {
    zoom,
    centerX: clamp(centerX, halfWidth, source.width - halfWidth),
    centerY: clamp(centerY, halfHeight, source.height - halfHeight),
  }
}

/**
 * LA région gardée — celle que montre l'aperçu ET que dessine le module de
 * préparation. En pixels de l'image affichée, toujours contenue dans l'image.
 */
export function cropRectFor(source: CropSource, aspect: number, view: CropView): ImageCrop {
  const clamped = clampCropView(source, aspect, view)
  const base = baseCropSize(source, aspect)
  const width = base.width / clamped.zoom
  const height = base.height / clamped.zoom
  return {
    sourceWidth: source.width,
    sourceHeight: source.height,
    x: clamped.centerX - width / 2,
    y: clamped.centerY - height / 2,
    width,
    height,
  }
}

/**
 * Déplacer l'IMAGE d'une distance mesurée sur l'écran (glisser du doigt ou de
 * la souris) : l'image suit le geste, la région part dans l'autre sens.
 * `frameWidth` : la largeur du cadre à l'écran, en pixels CSS.
 */
export function dragCropView(source: CropSource, aspect: number, view: CropView, delta: { dx: number; dy: number }, frameWidth: number): CropView {
  if (!Number.isFinite(frameWidth) || frameWidth <= 0) return clampCropView(source, aspect, view)
  const rect = cropRectFor(source, aspect, view)
  const scale = rect.width / frameWidth
  return clampCropView(source, aspect, {
    zoom: view.zoom,
    centerX: view.centerX - (Number.isFinite(delta.dx) ? delta.dx : 0) * scale,
    centerY: view.centerY - (Number.isFinite(delta.dy) ? delta.dy : 0) * scale,
  })
}

/** Zoomer AUTOUR DU CENTRE de la région, vers un zoom donné (curseur, pincement). */
export function zoomCropViewTo(source: CropSource, aspect: number, view: CropView, zoom: number): CropView {
  return clampCropView(source, aspect, { ...view, zoom: clampZoom(zoom) })
}

/** Le zoom d'un pincement : celui du début du geste, multiplié par l'écart des doigts. */
export function pinchZoom(startZoom: number, startDistance: number, distance: number): number {
  if (!Number.isFinite(startDistance) || !Number.isFinite(distance) || startDistance <= 0 || distance <= 0) return clampZoom(startZoom)
  return clampZoom(startZoom * (distance / startDistance))
}

/** Ce qu'une touche fait au recadreur, ou `null` si elle ne le concerne pas. */
export type CropKeyAction =
  | { kind: "move"; dx: number; dy: number }
  | { kind: "zoom"; factor: number }
  | { kind: "reset" }

/**
 * Le clavier : flèches pour déplacer l'image (5 % de la région, 20 % avec
 * Maj), plus et moins pour zoomer (`+`, `=`, `-`, `_`, pavé numérique
 * compris), `0` pour recentrer. `dx`, `dy` : fractions de la région visible,
 * dans le sens où l'image se déplace.
 */
export function cropKeyAction(key: string, shiftKey: boolean): CropKeyAction | null {
  const step = shiftKey ? PROFILE_CROP_PAN_STEP_LARGE : PROFILE_CROP_PAN_STEP
  switch (key) {
    case "ArrowLeft":
      return { kind: "move", dx: -step, dy: 0 }
    case "ArrowRight":
      return { kind: "move", dx: step, dy: 0 }
    case "ArrowUp":
      return { kind: "move", dx: 0, dy: -step }
    case "ArrowDown":
      return { kind: "move", dx: 0, dy: step }
    case "+":
    case "=":
    case "Add":
      return { kind: "zoom", factor: PROFILE_CROP_ZOOM_STEP }
    case "-":
    case "_":
    case "Subtract":
      return { kind: "zoom", factor: 1 / PROFILE_CROP_ZOOM_STEP }
    case "0":
      return { kind: "reset" }
    default:
      return null
  }
}

/** Appliquer une action du clavier à l'état. */
export function applyCropKeyAction(source: CropSource, aspect: number, view: CropView, action: CropKeyAction): CropView {
  if (action.kind === "reset") return initialCropView(source)
  if (action.kind === "zoom") return zoomCropViewTo(source, aspect, view, view.zoom * action.factor)
  const rect = cropRectFor(source, aspect, view)
  // L'image va dans le sens de la flèche : la région, dans l'autre.
  return clampCropView(source, aspect, {
    zoom: view.zoom,
    centerX: view.centerX - action.dx * rect.width,
    centerY: view.centerY - action.dy * rect.height,
  })
}

/**
 * La position de l'image dans le cadre de l'aperçu, en pourcentages du cadre :
 * la région gardée remplit EXACTEMENT le cadre. C'est la projection de
 * `cropRectFor`, rien d'autre — l'aperçu ne recalcule rien.
 */
export function cropPreviewStyle(rect: ImageCrop): { width: string; height: string; left: string; top: string } {
  const percent = (value: number) => `${String(Math.round(value * 10_000) / 10_000)}%`
  return {
    width: percent((rect.sourceWidth / rect.width) * 100),
    height: percent((rect.sourceHeight / rect.height) * 100),
    left: percent((-rect.x / rect.width) * 100),
    top: percent((-rect.y / rect.height) * 100),
  }
}

/** Les dimensions de l'image envoyée : la région, réduite sous la borne du cadre (jamais agrandie). */
export function cropOutputSize(rect: ImageCrop, frame: ProfileImageFrame): { width: number; height: number } | null {
  return fitWithin(rect.width, rect.height, frame.maxDimension)
}

/** Le zoom en pour cent (150 pour un zoom de 1,5). */
export function cropZoomPercent(view: CropView): number {
  return Math.round(clampZoom(view.zoom) * 100)
}

/**
 * Le zoom dit dans la langue de l'écran (« 150 % », « 150% ») — par `Intl`,
 * jamais par un « % » écrit dans une phrase : c'est une mesure du geste, pas un
 * chiffre public (cliquet `public-communication`).
 */
export function cropZoomLabel(view: CropView, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(cropZoomPercent(view) / 100)
}

// ═══════════════════════════════════════════════════════════════
// Le choix et l'envoi
// ═══════════════════════════════════════════════════════════════

/**
 * Le refus d'une image CHOISIE, avant tout recadrage, ou `null` : un format
 * que le profil n'accepte pas (JPEG, PNG, WebP — `AVATAR_MIME_TYPES`), ou un
 * fichier vide ou trop lourd pour être préparé sur l'appareil
 * (`IMAGE_SOURCE_MAX_BYTES`). La borne de l'usage se juge APRÈS la
 * préparation (`profileImagePreparedRefusal`).
 */
export function profileImageChoiceRefusal(file: { type: string; size: number }, t: TFunction): string | null {
  if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) return t("reseau:shared.avatar.format")
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > IMAGE_SOURCE_MAX_BYTES) {
    return t("rules:UPLOAD_SIZE_OUT_OF_RANGE", { maxMegabytes: megabytes(IMAGE_SOURCE_MAX_BYTES) })
  }
  return null
}

/**
 * Le refus de l'image PRÉPARÉE, ou `null` : la liste blanche et le plafond de
 * l'usage du serveur (`avatar` : 5 Mio ; `cover` : 10 Mio), lus dans la
 * politique de dépôt — les mêmes que la garde, qui relit de toute façon le
 * fichier stocké.
 */
export function profileImagePreparedRefusal(file: { type: string; size: number }, kind: ProfileImageKind, t: TFunction): string | null {
  if (!isMimeAllowedForUsage(kind, file.type)) return t("reseau:shared.avatar.format")
  const { maxBytes } = UPLOAD_USAGES[kind]
  if (file.size > 0 && file.size <= maxBytes) return null
  return kind === "avatar"
    ? t("reseau:shared.avatar.size", { max: megabytes(maxBytes) })
    : t("rules:UPLOAD_SIZE_OUT_OF_RANGE", { maxMegabytes: megabytes(maxBytes) })
}
