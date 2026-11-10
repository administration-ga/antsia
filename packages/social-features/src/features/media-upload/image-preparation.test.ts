import { describe, expect, it } from "vitest"

import { createAppI18n } from "../../i18n"
import {
  AVATAR_UPLOAD_MAX_DIMENSION,
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
  isPreparableImageType,
  type ImagePreparationRefusal,
} from "./image-preparation"

const i18n = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "stories" })
const t = i18n.getFixedT("fr")
const tEn = i18n.getFixedT("en")

/** `Intl` sépare le nombre et l'unité par une espace insécable (fine en français) : on la compare comme une espace. */
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, " ")

describe("image-preparation — les décisions du 9/11/2026", () => {
  it("borne le plus grand côté à 2 048 px", () => {
    expect(IMAGE_UPLOAD_MAX_DIMENSION).toBe(2048)
    expect(IMAGE_UPLOAD_QUALITY).toBeGreaterThan(0)
    expect(IMAGE_UPLOAD_QUALITY).toBeLessThan(1)
  })

  it("ré-encode toute photo FIXE dans sa famille, à la borne et à la qualité des publications", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"] as const) {
      expect(imageUploadPlan(type)).toEqual({
        action: "reencode",
        plan: { targetType: type, maxDimension: IMAGE_UPLOAD_MAX_DIMENSION, quality: IMAGE_UPLOAD_QUALITY },
      })
    }
  })

  it("ne ré-encode pas le GIF (animé) : ses métadonnées seules partent", () => {
    expect(imageUploadPlan("image/gif")).toEqual({ action: "strip-animated" })
  })

  it("refuse ce qu'il ne sait pas préparer, au lieu de le laisser passer", () => {
    for (const type of ["image/heic", "image/svg+xml", "video/mp4", ""]) {
      expect(imageUploadPlan(type)).toEqual({ action: "refuse", refusal: "unsupported-type" })
    }
  })

  it("prépare exactement les photos du fil et des Stories", () => {
    expect(["image/jpeg", "image/png", "image/webp", "image/gif"].every(isPreparableImageType)).toBe(true)
    expect(isPreparableImageType("video/mp4")).toBe(false)
  })
})

describe("image-preparation — dimensions de sortie", () => {
  it("réduit une photo de téléphone au plus grand côté de 2 048 px, proportions gardées", () => {
    expect(fitWithin(4032, 3024, 2048)).toEqual({ width: 2048, height: 1536 })
    expect(fitWithin(3024, 4032, 2048)).toEqual({ width: 1536, height: 2048 })
    expect(fitWithin(8000, 1000, 2048)).toEqual({ width: 2048, height: 256 })
    expect(fitWithin(5000, 5000, 2048)).toEqual({ width: 2048, height: 2048 })
  })

  it("n'agrandit jamais une petite image, et garde les dimensions d'origine sans borne", () => {
    expect(fitWithin(1200, 800, 2048)).toEqual({ width: 1200, height: 800 })
    expect(fitWithin(2048, 1000, 2048)).toEqual({ width: 2048, height: 1000 })
    expect(fitWithin(9000, 6000, null)).toEqual({ width: 9000, height: 6000 })
  })

  it("une bande très fine garde au moins un pixel ; des dimensions invalides rendent null", () => {
    expect(fitWithin(100_000, 10, 2048)).toEqual({ width: 2048, height: 1 })
    expect(fitWithin(0, 100, 2048)).toBeNull()
    expect(fitWithin(Number.NaN, 100, 2048)).toBeNull()
  })
})

describe("image-preparation — ce que l'écran dit", () => {
  it("chaque refus a sa phrase, en français et en anglais, qui nomme le fichier", () => {
    const refusals: ImagePreparationRefusal[] = ["unsupported-type", "unreadable", "canvas-unavailable", "encoder-failed", "metadata-remaining", "not-croppable"]
    for (const refusal of refusals) {
      const fr = imagePreparationRefusalText(refusal, "photo.jpg", t)
      const en = imagePreparationRefusalText(refusal, "photo.jpg", tEn)
      expect(fr).toContain("« photo.jpg »")
      expect(fr).toMatch(/ne sera pas envoyée/)
      expect(en).toContain("“photo.jpg”")
      expect(en).toMatch(/will not be sent/)
    }
  })

  it("dit les poids dans la langue courante, en base 1 024 comme les bornes du moteur", () => {
    expect(plain(imageWeightLabel(8.2 * 1024 * 1024, "fr"))).toBe("8,2 Mo")
    expect(plain(imageWeightLabel(640 * 1024, "fr"))).toBe("640 ko")
    expect(plain(imageWeightLabel(8.2 * 1024 * 1024, "en"))).toBe("8.2 MB")
    expect(plain(imageWeightLabel(10, "fr"))).toBe("1 ko")
  })

  it("annonce le poids avant l'envoi, accordé au nombre de photos", () => {
    expect(plain(imagePreparationSummary({ count: 1, originalBytes: 8.2 * 1024 * 1024, preparedBytes: 640 * 1024 }, "fr", t))).toBe(
      "Photo prête à l'envoi : 8,2 Mo → 640 ko, sans ses informations cachées (lieu, appareil).",
    )
    expect(plain(imagePreparationSummary({ count: 3, originalBytes: 20 * 1024 * 1024, preparedBytes: 2 * 1024 * 1024 }, "fr", t))).toMatch(/^3 photos prêtes à l'envoi : 20 Mo → 2 Mo/)
    expect(plain(imagePreparationSummary({ count: 1, originalBytes: 2048, preparedBytes: 1024 }, "en", tEn))).toBe(
      "Photo ready to send: 2 kB → 1 kB, without its hidden information (location, device).",
    )
  })
})

describe("image-preparation — les options d'un écran (PF-03), qui ne desserrent rien", () => {
  const crop = { sourceWidth: 4032, sourceHeight: 3024, x: 504, y: 0, width: 3024, height: 3024 }

  it("sans option, le plan est exactement celui du lot SD-02", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "video/mp4"]) {
      expect(imagePreparationPlan(type)).toEqual(imageUploadPlan(type))
    }
  })

  it("une image ronde est bornée à 1 024 px : un PNG RGBA de cette taille tient sous les 5 Mio de l'usage avatar", () => {
    expect(AVATAR_UPLOAD_MAX_DIMENSION).toBe(1024)
    expect(AVATAR_UPLOAD_MAX_DIMENSION * AVATAR_UPLOAD_MAX_DIMENSION * 4 + AVATAR_UPLOAD_MAX_DIMENSION).toBeLessThan(5 * 1024 * 1024)
    expect(imagePreparationPlan("image/png", { maxDimension: AVATAR_UPLOAD_MAX_DIMENSION })).toEqual({
      action: "reencode",
      plan: { targetType: "image/png", maxDimension: 1024, quality: IMAGE_UPLOAD_QUALITY },
    })
  })

  it("une borne demandée au-delà de 2 048 px, ou invalide, reste à 2 048 px", () => {
    for (const maxDimension of [4096, Number.POSITIVE_INFINITY, Number.NaN]) {
      const plan = imagePreparationPlan("image/jpeg", { maxDimension })
      expect(plan.action === "reencode" && plan.plan.maxDimension).toBe(IMAGE_UPLOAD_MAX_DIMENSION)
    }
  })

  it("le recadrage voyage dans le plan d'une photo fixe", () => {
    expect(imagePreparationPlan("image/jpeg", { crop, maxDimension: 1024 })).toEqual({
      action: "reencode",
      plan: { targetType: "image/jpeg", maxDimension: 1024, quality: IMAGE_UPLOAD_QUALITY, crop },
    })
  })

  it("un GIF ne se recadre pas : refusé, jamais aplati en silence", () => {
    expect(imagePreparationPlan("image/gif", { crop })).toEqual({ action: "refuse", refusal: "not-croppable" })
    expect(imagePreparationPlan("image/gif")).toEqual({ action: "strip-animated" })
  })

  it("HEIC et HEIF : convertis en JPEG seulement si l'écran le demande, sinon refusés comme avant", () => {
    for (const type of ["image/heic", "image/heif"]) {
      expect(imagePreparationPlan(type)).toEqual({ action: "refuse", refusal: "unsupported-type" })
      expect(imagePreparationPlan(type, { convertHeif: true })).toEqual({
        action: "reencode",
        plan: { targetType: "image/jpeg", maxDimension: IMAGE_UPLOAD_MAX_DIMENSION, quality: IMAGE_UPLOAD_QUALITY },
      })
    }
    expect(imagePreparationPlan("image/svg+xml", { convertHeif: true })).toEqual({ action: "refuse", refusal: "unsupported-type" })
  })

  it("une photo HEIC rendue en JPEG prend l'extension .jpg", () => {
    expect(heifOutputName("IMG_0042.HEIC")).toBe("IMG_0042.jpg")
    expect(heifOutputName("souvenir.heif")).toBe("souvenir.jpg")
    expect(heifOutputName(".heic")).toBe("photo.jpg")
  })
})

describe("image-preparation — le recadrage vérifié contre l'image décodée", () => {
  it("une région calculée sur cette image est gardée telle quelle", () => {
    const crop = { sourceWidth: 1200, sourceHeight: 800, x: 200, y: 0, width: 800, height: 800 }
    expect(cropWithinSource(crop, 1200, 800)).toEqual(crop)
  })

  it("une région qui déborde est ramenée dans l'image", () => {
    expect(cropWithinSource({ sourceWidth: 1200, sourceHeight: 800, x: -10, y: 700, width: 600, height: 300 }, 1200, 800)).toEqual({
      sourceWidth: 1200,
      sourceHeight: 800,
      x: 0,
      y: 700,
      width: 600,
      height: 100,
    })
  })

  it("refuse une région calculée sur une AUTRE image, invalide ou plus petite qu'un pixel", () => {
    expect(cropWithinSource({ sourceWidth: 800, sourceHeight: 1200, x: 0, y: 0, width: 800, height: 800 }, 1200, 800)).toBeNull()
    expect(cropWithinSource({ sourceWidth: 1200, sourceHeight: 800, x: Number.NaN, y: 0, width: 800, height: 800 }, 1200, 800)).toBeNull()
    expect(cropWithinSource({ sourceWidth: 1200, sourceHeight: 800, x: 1200, y: 0, width: 800, height: 800 }, 1200, 800)).toBeNull()
    expect(cropWithinSource({ sourceWidth: 1200, sourceHeight: 800, x: 0, y: 0, width: 0.5, height: 800 }, 1200, 800)).toBeNull()
  })
})
