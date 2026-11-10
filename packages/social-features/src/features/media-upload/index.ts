/**
 * media-upload — préparer une photo avant l'envoi (lot SD-02 ; options d'un
 * écran — recadrage, borne plus petite, conversion HEIC/HEIF — au lot PF-03).
 *
 * Point d'entrée public : `@antsia/social-features/media-upload`. Le contrat
 * est écrit en tête de `reencode-image.ts` ; les décisions (bornes, formats,
 * refus, phrases) dans `image-preparation.ts`.
 */
export {
  browserImageRuntime,
  isAnimatedImage,
  isPreparedImage,
  prepareImageForUpload,
  reencodeImage,
  type DecodedImage,
  type ImageCanvas,
  type ImageDrawingContext,
  type ImagePreparation,
  type ImageRuntime,
  type PrepareImage,
  type PrepareImageWith,
} from "./reencode-image"
export {
  AVATAR_UPLOAD_MAX_DIMENSION,
  HEIF_IMAGE_TYPES,
  IMAGE_OUTPUT_TYPES,
  IMAGE_SOURCE_MAX_BYTES,
  IMAGE_UPLOAD_MAX_DIMENSION,
  IMAGE_UPLOAD_QUALITY,
  cropWithinSource,
  fitWithin,
  heifOutputName,
  imagePreparationPlan,
  imagePreparationRefusalText,
  imagePreparationSummary,
  imageUploadPlan,
  imageWeightLabel,
  isImageOutputType,
  isPreparableImageType,
  type ImageCrop,
  type ImageOutputType,
  type ImagePreparationOptions,
  type ImagePreparationRefusal,
  type ImageReencodePlan,
  type ImageUploadPlan,
} from "./image-preparation"
