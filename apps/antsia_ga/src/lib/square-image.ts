/** Le recadrage reste sur l'appareil : aucun original n'est envoyé pour préparer le carré. */
export type SquareImageSelection = Readonly<{
  width: number
  height: number
  /** Position dans l'espace restant après recadrage, de 0 (début) à 1 (fin). */
  x: number
  y: number
  zoom: number
}>

export type SquareCrop = Readonly<{ left: number; top: number; size: number }>

export const SQUARE_IMAGE_OUTPUT_MAX = 1200
const SOURCE_DIMENSION_MAX = 16_000
const SOURCE_PIXELS_MAX = 40_000_000
const INPUT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const OUTPUT_EXTENSIONS: Readonly<Record<string, string>> = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" }

function bounded(value: number | undefined, minimum: number, maximum: number, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback
}

/** Rectangle source toujours contenu dans l'image, sans étirement ni ajout de bandes. */
export function calculateSquareCrop(width: number, height: number, selection: Partial<Pick<SquareImageSelection, "x" | "y" | "zoom">> = {}): SquareCrop {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > SOURCE_DIMENSION_MAX || height > SOURCE_DIMENSION_MAX || width * height > SOURCE_PIXELS_MAX) throw new Error("square_image_invalid")
  const size = Math.min(width, height) / bounded(selection.zoom, 1, 3, 1)
  return {
    left: (width - size) * bounded(selection.x, 0, 1, 0.5),
    top: (height - size) * bounded(selection.y, 0, 1, 0.5),
    size,
  }
}

/**
 * Applique exactement le carré prévisualisé. Le décodage applique l'orientation de la photo,
 * le réencodage retire ses métadonnées et n'agrandit jamais un petit original.
 * Un échec refuse la préparation : jamais de retour silencieux au fichier non recadré.
 */
export async function prepareSquareImage(file: File, selection: SquareImageSelection): Promise<File> {
  if (!INPUT_TYPES.has(file.type) || file.size <= 0) throw new Error("square_image_invalid")
  const crop = calculateSquareCrop(selection.width, selection.height, selection)
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  try {
    // Une sélection d'un ancien fichier ne doit jamais être appliquée à un autre original.
    if (bitmap.width !== selection.width || bitmap.height !== selection.height) throw new Error("square_image_changed")
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = Math.max(1, Math.min(SQUARE_IMAGE_OUTPUT_MAX, Math.floor(crop.size)))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("square_image_unavailable")
    context.drawImage(bitmap, crop.left, crop.top, crop.size, crop.size, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.9))
    if (!blob || blob.size === 0 || !OUTPUT_EXTENSIONS[blob.type]) throw new Error("square_image_unavailable")
    const basename = file.name.replace(/\.[^.]*$/, "") || "image"
    return new File([blob], `${basename}-square.${OUTPUT_EXTENSIONS[blob.type]}`, { type: blob.type })
  } finally {
    bitmap.close()
  }
}
