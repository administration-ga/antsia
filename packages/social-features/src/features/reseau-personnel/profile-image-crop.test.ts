import { describe, expect, it } from "vitest"

import { cropWithinSource } from "../media-upload"
import {
  PROFILE_CROP_MAX_ZOOM,
  PROFILE_IMAGE_FRAMES,
  applyCropKeyAction,
  baseCropSize,
  clampCropView,
  cropKeyAction,
  cropOutputSize,
  cropPreviewStyle,
  cropRectFor,
  cropZoomLabel,
  cropZoomPercent,
  dragCropView,
  initialCropView,
  isCropSource,
  pinchZoom,
  zoomCropViewTo,
} from "./profile-image-crop"

const PHONE = { width: 4032, height: 3024 }
const PORTRAIT = { width: 3024, height: 4032 }
const AVATAR = PROFILE_IMAGE_FRAMES.avatar.aspect
const COVER = PROFILE_IMAGE_FRAMES.cover.aspect

/** La région est-elle entièrement dans l'image ? */
function inside(rect: { x: number; y: number; width: number; height: number }, source: { width: number; height: number }): boolean {
  const epsilon = 1e-9
  return rect.x >= -epsilon && rect.y >= -epsilon && rect.x + rect.width <= source.width + epsilon && rect.y + rect.height <= source.height + epsilon
}

describe("profile-image-crop — les cadres", () => {
  it("la photo est un carré montré en cercle, bornée à 1 024 px ; la couverture un bandeau 3:1 à 2 048 px", () => {
    expect(PROFILE_IMAGE_FRAMES.avatar).toEqual({ aspect: 1, shape: "circle", maxDimension: 1024 })
    expect(PROFILE_IMAGE_FRAMES.cover).toEqual({ aspect: 3, shape: "band", maxDimension: 2048 })
  })

  it("au zoom 1, la région est le plus grand rectangle au ratio du cadre qui tient dans l'image", () => {
    expect(baseCropSize(PHONE, AVATAR)).toEqual({ width: 3024, height: 3024 })
    expect(baseCropSize(PORTRAIT, AVATAR)).toEqual({ width: 3024, height: 3024 })
    expect(baseCropSize(PHONE, COVER)).toEqual({ width: 4032, height: 1344 })
    // Une image plus large que 3:1 : toute la hauteur, largeur à 3 fois la hauteur.
    expect(baseCropSize({ width: 8000, height: 1000 }, COVER)).toEqual({ width: 3000, height: 1000 })
  })

  it("rejette des dimensions inutilisables", () => {
    expect(isCropSource(PHONE)).toBe(true)
    expect(isCropSource({ width: 0, height: 10 })).toBe(false)
    expect(isCropSource({ width: Number.NaN, height: 10 })).toBe(false)
  })
})

describe("profile-image-crop — la région, toujours dans l'image, toujours au ratio", () => {
  it("part centrée, au ratio exact du cadre", () => {
    const avatar = cropRectFor(PHONE, AVATAR, initialCropView(PHONE))
    expect(avatar).toEqual({ sourceWidth: 4032, sourceHeight: 3024, x: 504, y: 0, width: 3024, height: 3024 })
    const cover = cropRectFor(PHONE, COVER, initialCropView(PHONE))
    expect(cover).toEqual({ sourceWidth: 4032, sourceHeight: 3024, x: 0, y: 840, width: 4032, height: 1344 })
    expect(cover.width / cover.height).toBe(3)
  })

  it("zoomer rétrécit la région autour de son centre, sans dépasser le zoom maximal", () => {
    const zoomed = zoomCropViewTo(PHONE, AVATAR, initialCropView(PHONE), 2)
    expect(cropRectFor(PHONE, AVATAR, zoomed)).toEqual({ sourceWidth: 4032, sourceHeight: 3024, x: 1260, y: 756, width: 1512, height: 1512 })
    expect(zoomCropViewTo(PHONE, AVATAR, initialCropView(PHONE), 99).zoom).toBe(PROFILE_CROP_MAX_ZOOM)
    expect(zoomCropViewTo(PHONE, AVATAR, initialCropView(PHONE), 0.2).zoom).toBe(1)
    expect(zoomCropViewTo(PHONE, AVATAR, initialCropView(PHONE), Number.NaN).zoom).toBe(1)
  })

  it("un centre hors bornes est ramené : la région ne sort jamais de l'image", () => {
    for (const view of [
      { zoom: 1, centerX: -5000, centerY: 99_999 },
      { zoom: 3, centerX: 0, centerY: 0 },
      { zoom: 3, centerX: 4032, centerY: 3024 },
      { zoom: 1.7, centerX: Number.NaN, centerY: Number.POSITIVE_INFINITY },
    ]) {
      for (const aspect of [AVATAR, COVER]) {
        const rect = cropRectFor(PHONE, aspect, view)
        expect(inside(rect, PHONE)).toBe(true)
        expect(rect.width / rect.height).toBeCloseTo(aspect, 9)
      }
    }
    expect(clampCropView(PHONE, AVATAR, { zoom: 1, centerX: 0, centerY: 0 })).toEqual({ zoom: 1, centerX: 1512, centerY: 1512 })
  })

  it("la région calculée est acceptée telle quelle par le module de préparation (même image)", () => {
    const rect = cropRectFor(PHONE, COVER, { zoom: 1.3, centerX: 1000, centerY: 2900 })
    expect(cropWithinSource(rect, PHONE.width, PHONE.height)).toEqual(rect)
  })
})

describe("profile-image-crop — glisser, pincer", () => {
  it("glisser l'image vers la droite déplace la région vers la gauche, à l'échelle du cadre", () => {
    const start = zoomCropViewTo(PHONE, AVATAR, initialCropView(PHONE), 2)
    // Cadre de 300 px pour une région de 1 512 px : 30 px à l'écran = 151,2 px dans l'image.
    const moved = dragCropView(PHONE, AVATAR, start, { dx: 30, dy: -30 }, 300)
    expect(moved.centerX).toBeCloseTo(start.centerX - 151.2, 6)
    expect(moved.centerY).toBeCloseTo(start.centerY + 151.2, 6)
  })

  it("un glisser jusqu'au bord s'arrête au bord ; un cadre sans largeur ne déplace rien", () => {
    const moved = dragCropView(PHONE, AVATAR, initialCropView(PHONE), { dx: 100_000, dy: 0 }, 300)
    expect(cropRectFor(PHONE, AVATAR, moved).x).toBe(0)
    expect(dragCropView(PHONE, AVATAR, initialCropView(PHONE), { dx: 50, dy: 0 }, 0)).toEqual(initialCropView(PHONE))
  })

  it("pincer multiplie le zoom de départ par l'écart des doigts, borné", () => {
    expect(pinchZoom(1, 100, 150)).toBe(1.5)
    expect(pinchZoom(2, 100, 50)).toBe(1)
    expect(pinchZoom(2, 100, 1000)).toBe(PROFILE_CROP_MAX_ZOOM)
    expect(pinchZoom(1.5, 0, 100)).toBe(1.5)
  })
})

describe("profile-image-crop — le clavier", () => {
  it("flèches pour déplacer, plus et moins pour zoomer, 0 pour recentrer", () => {
    expect(cropKeyAction("ArrowLeft", false)).toEqual({ kind: "move", dx: -0.05, dy: 0 })
    expect(cropKeyAction("ArrowDown", true)).toEqual({ kind: "move", dx: 0, dy: 0.2 })
    expect(cropKeyAction("+", false)).toEqual({ kind: "zoom", factor: 1.1 })
    expect(cropKeyAction("=", false)).toEqual({ kind: "zoom", factor: 1.1 })
    expect(cropKeyAction("-", false)).toEqual({ kind: "zoom", factor: 1 / 1.1 })
    expect(cropKeyAction("0", false)).toEqual({ kind: "reset" })
    expect(cropKeyAction("Tab", false)).toBeNull()
    expect(cropKeyAction("Enter", false)).toBeNull()
  })

  it("une flèche déplace l'image de 5 % de la région, dans son sens", () => {
    const start = zoomCropViewTo(PHONE, AVATAR, initialCropView(PHONE), 2)
    const right = applyCropKeyAction(PHONE, AVATAR, start, { kind: "move", dx: 0.05, dy: 0 })
    expect(right.centerX).toBeCloseTo(start.centerX - 0.05 * 1512, 6)
    const zoomedOut = applyCropKeyAction(PHONE, AVATAR, start, { kind: "zoom", factor: 1 / 1.1 })
    expect(zoomedOut.zoom).toBeCloseTo(2 / 1.1, 9)
    expect(applyCropKeyAction(PHONE, AVATAR, right, { kind: "reset" })).toEqual(initialCropView(PHONE))
  })

  it("dit le zoom en pour cent, dans la langue de l'écran", () => {
    expect(cropZoomPercent({ zoom: 1.5, centerX: 0, centerY: 0 })).toBe(150)
    expect(cropZoomPercent({ zoom: 9, centerX: 0, centerY: 0 })).toBe(400)
    const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, " ")
    expect(plain(cropZoomLabel({ zoom: 1.5, centerX: 0, centerY: 0 }, "fr"))).toBe("150 %")
    expect(cropZoomLabel({ zoom: 1.5, centerX: 0, centerY: 0 }, "en")).toBe("150%")
  })
})

describe("profile-image-crop — l'aperçu est la projection exacte de la région envoyée", () => {
  it("la région remplit le cadre : bords de la région = bords du cadre", () => {
    const rect = cropRectFor(PHONE, AVATAR, zoomCropViewTo(PHONE, AVATAR, initialCropView(PHONE), 2))
    const style = cropPreviewStyle(rect)
    expect(style).toEqual({ width: "266.6667%", height: "200%", left: "-83.3333%", top: "-50%" })
    // Relecture : un cadre de 300 px montre l'image à 800 px de large, décalée de 250 px.
    const frame = 300
    const shownWidth = (Number.parseFloat(style.width) / 100) * frame
    const left = (Number.parseFloat(style.left) / 100) * frame
    const scale = shownWidth / PHONE.width
    expect(-left / scale).toBeCloseTo(rect.x, 0)
    expect((frame - left) / scale).toBeCloseTo(rect.x + rect.width, 0)
  })

  it("l'image envoyée est la région réduite sous la borne du cadre, jamais agrandie", () => {
    const avatar = cropRectFor(PHONE, AVATAR, initialCropView(PHONE))
    expect(cropOutputSize(avatar, PROFILE_IMAGE_FRAMES.avatar)).toEqual({ width: 1024, height: 1024 })
    const cover = cropRectFor(PHONE, COVER, initialCropView(PHONE))
    expect(cropOutputSize(cover, PROFILE_IMAGE_FRAMES.cover)).toEqual({ width: 2048, height: 683 })
    const small = cropRectFor({ width: 600, height: 400 }, AVATAR, initialCropView({ width: 600, height: 400 }))
    expect(cropOutputSize(small, PROFILE_IMAGE_FRAMES.avatar)).toEqual({ width: 400, height: 400 })
  })
})
