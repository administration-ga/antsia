/**
 * reencode-image — préparer une photo AVANT son envoi : ré-encodée, allégée,
 * sans métadonnées (lot SD-02, plan 03 ; branché par FP-01 dans le composeur
 * de publication, à venir pour le profil avec PF-03).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE CONTRAT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `prepareImageForUpload(file)` rend, pour une photo choisie par la personne :
 *   · `{ ok: true, file, … }` — un fichier NEUF, jamais l'original :
 *       – JPEG, PNG, WebP fixes : décodés (orientation de l'appareil
 *         appliquée), redessinés sur un canvas dont le plus grand côté vaut au
 *         plus 2 048 px, ré-encodés dans leur famille (JPEG et WebP à la
 *         qualité `IMAGE_UPLOAD_QUALITY`, PNG sans perte) ;
 *       – GIF et WebP animés : pixels et animation intacts, blocs de
 *         métadonnées retirés (commentaires, XMP, EXIF, texte) ;
 *       – dans tous les cas, la sortie repasse par
 *         `@antsia/social-domain/imageMetadata` : AUCUN bloc de métadonnées
 *         (EXIF, GPS, XMP, IPTC, commentaire, texte PNG) ne part, quel que
 *         soit l'encodeur du navigateur ;
 *   · `{ ok: false, refusal }` — un refus nommé (`ImagePreparationRefusal`),
 *     que l'écran dit par `imagePreparationRefusalText`. ÉCHEC FERMÉ : un
 *     décodage impossible, un canvas absent, un encodeur muet ou une
 *     métadonnée irréductible refusent la photo ; l'original n'est JAMAIS
 *     rendu.
 *
 * Tout fichier rendu par ce module est inscrit dans un registre
 * (`isPreparedImage`) : le brouillon de médias (`useMediaDraft`) et la
 * création de Story refusent d'envoyer une image qui n'y figure pas. Aucun
 * chemin d'envoi ne contourne donc la préparation par oubli.
 *
 * `reencodeImage(file, plan)` est le moteur seul, pour un écran qui fixe son
 * propre plan (l'album : qualité 0,92, dimensions d'origine, GIF refusé).
 *
 * `prepareImageForUpload(file, runtime, options)` (lot PF-03) : le même
 * contrat, sous les options d'un écran (`ImagePreparationOptions`) — la région
 * gardée par le recadreur du profil, un plus grand côté plus petit (images
 * rondes), la conversion HEIC/HEIF en JPEG (pièces jointes d'iCom). Le
 * recadrage est appliqué au DESSIN (`drawImage` à neuf arguments), sur l'image
 * décodée dont les dimensions doivent être celles du calcul ; aucune image
 * intermédiaire n'est encodée.
 *
 * ⚠️ Le serveur ne peut pas en dire autant : un client modifié envoie ce
 * qu'il veut. L'analyse des fichiers SIGNALE un JPEG arrivé avec sa position
 * (`convex/modules/files/inspect.ts`, `IMAGE_GPS_METADATA`).
 *
 * ⚠️ L'exécution (décodage, canvas, encodeur) est INJECTABLE (`ImageRuntime`) :
 * `jsdom` n'a pas de canvas, et c'est ce qui rend le comportement vérifiable
 * sans navigateur. Le défaut, `browserImageRuntime`, est celui du navigateur.
 *
 * Réutilisable par toute application du moteur : `@antsia/social-features/media-upload`.
 */

import { listImageMetadata, stripImageMetadata, webpIsAnimated } from "@antsia/social-domain/imageMetadata"

import {
  cropWithinSource,
  fitWithin,
  HEIF_IMAGE_TYPES,
  heifOutputName,
  imagePreparationPlan,
  isImageOutputType,
  type ImageOutputType,
  type ImagePreparationOptions,
  type ImagePreparationRefusal,
  type ImageReencodePlan,
} from "./image-preparation"

// ═══════════════════════════════════════════════════════════════
// L'exécution, injectable
// ═══════════════════════════════════════════════════════════════

/** Une image décodée, prête à être dessinée. */
export interface DecodedImage {
  /** Dimensions AFFICHÉES (orientation de l'appareil appliquée). */
  readonly width: number
  readonly height: number
  readonly source: CanvasImageSource
  /** Libère la mémoire du décodage. */
  release(): void
}

/** Ce que le module utilise d'un contexte 2D. */
export interface ImageDrawingContext {
  imageSmoothingEnabled: boolean
  imageSmoothingQuality: ImageSmoothingQuality
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void
  /** La forme à neuf arguments : une région de la source (le recadrage du profil, PF-03). */
  drawImage(image: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void
}

/** Ce que le module utilise d'un canvas. */
export interface ImageCanvas {
  getContext(contextId: "2d"): ImageDrawingContext | null
  toBlob(callback: (blob: Blob | null) => void, type: string, quality: number): void
}

/** Le décodeur et le canvas — ceux du navigateur, ou ceux d'un test. */
export interface ImageRuntime {
  /** Décode l'image ; LÈVE si elle est illisible. */
  decode(file: Blob): Promise<DecodedImage>
  /** Un canvas 2D aux dimensions données, ou `null` s'il n'en existe pas. */
  createCanvas(width: number, height: number): ImageCanvas | null
}

/**
 * Le navigateur : décodage par un élément `<img>`, qui applique l'orientation
 * de l'appareil (`image-orientation: from-image`, défaut des trois moteurs
 * depuis 2020) aux dimensions comme au dessin — l'EXIF retiré ensuite, la photo
 * ne se retrouve pas couchée.
 */
export const browserImageRuntime: ImageRuntime = {
  async decode(file) {
    if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
      throw new Error("decoder unavailable")
    }
    const url = URL.createObjectURL(file)
    const image = document.createElement("img")
    image.decoding = "async"
    image.src = url
    try {
      await image.decode()
    } catch (error) {
      URL.revokeObjectURL(url)
      throw error
    }
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      source: image,
      release: () => {
        URL.revokeObjectURL(url)
        image.removeAttribute("src")
      },
    }
  },
  createCanvas(width, height) {
    if (typeof document === "undefined") return null
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    return canvas
  },
}

// ═══════════════════════════════════════════════════════════════
// Le registre des fichiers préparés
// ═══════════════════════════════════════════════════════════════

/**
 * Un registre GLOBAL (clé `Symbol.for`) : deux copies de ce module dans un même
 * bundle partagent la même liste, comme la porte de sortie de session.
 * `WeakSet` : un fichier abandonné n'est pas retenu en mémoire.
 */
const PREPARED_REGISTRY = Symbol.for("@antsia/social-features/media-upload/prepared-images")

function preparedRegistry(): WeakSet<Blob> {
  const holder = globalThis as typeof globalThis & { [PREPARED_REGISTRY]?: WeakSet<Blob> }
  holder[PREPARED_REGISTRY] ??= new WeakSet<Blob>()
  return holder[PREPARED_REGISTRY]
}

/** Ce fichier est-il sorti de ce module (ré-encodé ou nettoyé) ? */
export function isPreparedImage(file: Blob): boolean {
  return preparedRegistry().has(file)
}

// ═══════════════════════════════════════════════════════════════
// Le résultat
// ═══════════════════════════════════════════════════════════════

/** Une photo prête à l'envoi, ou le refus nommé. */
export type ImagePreparation =
  | {
      ok: true
      /** Le fichier NEUF à envoyer — jamais l'original. */
      file: File
      /** Dimensions envoyées (`null` pour une image animée, laissée telle quelle). */
      width: number | null
      height: number | null
      originalBytes: number
      preparedBytes: number
    }
  | { ok: false; refusal: ImagePreparationRefusal }

/** La signature d'une préparation — injectable dans les écrans. */
export type PrepareImage = (file: File) => Promise<ImagePreparation>

/** Une préparation sous les options d'un écran (PF-03) — injectable de même. */
export type PrepareImageWith = (file: File, options: ImagePreparationOptions) => Promise<ImagePreparation>

const refuse = (refusal: ImagePreparationRefusal): ImagePreparation => ({ ok: false, refusal })

/**
 * Le nom du fichier envoyé : celui d'origine, sauf pour une photo HEIC/HEIF
 * rendue en JPEG (son extension suit son nouveau format).
 */
function preparedName(original: File, type: string): string {
  return (HEIF_IMAGE_TYPES as readonly string[]).includes(original.type) && type === "image/jpeg" ? heifOutputName(original.name) : original.name
}

/**
 * Le fichier final : les octets SANS métadonnées, vérifiés une seconde fois,
 * puis inscrits au registre. Un échec du nettoyage refuse la photo.
 */
function finalize(
  original: File,
  bytes: Uint8Array,
  type: string,
  dimensions: { width: number; height: number } | null,
): ImagePreparation {
  const stripped = stripImageMetadata(bytes, type)
  if (stripped === null) return refuse("unreadable")
  const remaining = listImageMetadata(stripped, type)
  if (remaining === null || remaining.length > 0) return refuse("metadata-remaining")
  const file = new File([stripped as Uint8Array<ArrayBuffer>], preparedName(original, type), { type })
  preparedRegistry().add(file)
  return {
    ok: true,
    file,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    originalBytes: original.size,
    preparedBytes: file.size,
  }
}

async function bytesOf(blob: Blob): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await blob.arrayBuffer())
  } catch {
    return null
  }
}

/** `canvas.toBlob` en promesse — `null` si l'encodeur ne rend rien ou lève. */
function encode(canvas: ImageCanvas, type: ImageOutputType, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), type, quality)
    } catch {
      resolve(null)
    }
  })
}

// ═══════════════════════════════════════════════════════════════
// Le moteur et la préparation
// ═══════════════════════════════════════════════════════════════

/**
 * Ré-encode une photo FIXE selon un plan : décodage, réduction éventuelle,
 * encodage, retrait de toute métadonnée de la sortie.
 *
 * Le format rendu est celui de l'ENCODEUR (un navigateur qui n'encode pas le
 * WebP rend du PNG) s'il fait partie des formats acceptés, sinon refus. Le
 * fichier garde le nom d'origine (une photo HEIC/HEIF rendue en JPEG prend
 * l'extension `.jpg`).
 *
 * Avec un recadrage (`plan.crop`), seule la région est dessinée, puis réduite
 * sous la borne du plan ; une région calculée sur d'autres dimensions que
 * celles de l'image décodée refuse la photo (`unreadable`).
 */
export async function reencodeImage(
  file: File,
  plan: ImageReencodePlan,
  runtime: ImageRuntime = browserImageRuntime,
): Promise<ImagePreparation> {
  let decoded: DecodedImage
  try {
    decoded = await runtime.decode(file)
  } catch {
    return refuse("unreadable")
  }
  try {
    const crop = plan.crop === undefined ? null : cropWithinSource(plan.crop, decoded.width, decoded.height)
    if (plan.crop !== undefined && crop === null) return refuse("unreadable")
    const size = crop === null ? fitWithin(decoded.width, decoded.height, plan.maxDimension) : fitWithin(crop.width, crop.height, plan.maxDimension)
    if (size === null) return refuse("unreadable")
    const canvas = runtime.createCanvas(size.width, size.height)
    const context = canvas?.getContext("2d") ?? null
    if (canvas === null || context === null) return refuse("canvas-unavailable")
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = "high"
    try {
      if (crop === null) context.drawImage(decoded.source, 0, 0, size.width, size.height)
      else context.drawImage(decoded.source, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height)
    } catch {
      return refuse("canvas-unavailable")
    }
    const blob = await encode(canvas, plan.targetType, plan.quality)
    if (blob === null || blob.size === 0) return refuse("encoder-failed")
    const type = blob.type === "" ? plan.targetType : blob.type
    if (!isImageOutputType(type)) return refuse("encoder-failed")
    const bytes = await bytesOf(blob)
    if (bytes === null) return refuse("encoder-failed")
    return finalize(file, bytes, type, size)
  } finally {
    decoded.release()
  }
}

/**
 * Prépare une photo de publication, de Story ou de profil selon les décisions
 * du 9/11/2026 (`imageUploadPlan`), sous les options éventuelles d'un écran
 * (`imagePreparationPlan`, PF-03). Voir le contrat en tête de fichier.
 *
 * Sans options, le comportement est celui du lot SD-02, à l'identique.
 */
export async function prepareImageForUpload(
  file: File,
  runtime: ImageRuntime = browserImageRuntime,
  options: ImagePreparationOptions = {},
): Promise<ImagePreparation> {
  const decision = imagePreparationPlan(file.type, options)
  if (decision.action === "refuse") return refuse(decision.refusal)
  if (decision.action === "strip-animated" || file.type === "image/webp") {
    const bytes = await bytesOf(file)
    if (bytes === null) return refuse("unreadable")
    const animated = decision.action === "strip-animated" || webpIsAnimated(bytes)
    // Un WebP animé ne se reconnaît qu'à ses octets : un recadrage demandé sur
    // lui est refusé ici, comme sur un GIF (il en perdrait l'animation).
    if (animated) return options.crop === undefined ? finalize(file, bytes, file.type, null) : refuse("not-croppable")
  }
  if (decision.action !== "reencode") return refuse("unsupported-type")
  return reencodeImage(file, decision.plan, runtime)
}

/**
 * Une image ANIMÉE (GIF, WebP animé) ? Elle ne se recadre pas : l'écran la
 * prépare sans recadrage (`prepareImageForUpload` en garde l'animation et en
 * retire les métadonnées). Un fichier illisible rend `false` ; sa préparation
 * le refusera ensuite.
 */
export async function isAnimatedImage(file: Blob): Promise<boolean> {
  if (file.type === "image/gif") return true
  if (file.type !== "image/webp") return false
  const bytes = await bytesOf(file)
  return bytes !== null && webpIsAnimated(bytes)
}
