/**
 * media-upload — préparer une photo avant l'envoi (lot SD-02).
 *
 * Point d'entrée public : `@antsia/social-features/media-upload`. Le contrat
 * est écrit en tête de `reencode-image.ts` ; les décisions (bornes, formats,
 * refus, phrases) dans `image-preparation.ts`.
 */
export {
  browserImageRuntime,
  isPreparedImage,
  prepareImageForUpload,
  reencodeImage,
  type DecodedImage,
  type ImageCanvas,
  type ImageDrawingContext,
  type ImagePreparation,
  type ImageRuntime,
  type PrepareImage,
} from "./reencode-image"
export {
  IMAGE_OUTPUT_TYPES,
  IMAGE_UPLOAD_MAX_DIMENSION,
  IMAGE_UPLOAD_QUALITY,
  fitWithin,
  imagePreparationRefusalText,
  imagePreparationSummary,
  imageUploadPlan,
  imageWeightLabel,
  isImageOutputType,
  isPreparableImageType,
  type ImageOutputType,
  type ImagePreparationRefusal,
  type ImageReencodePlan,
  type ImageUploadPlan,
} from "./image-preparation"
