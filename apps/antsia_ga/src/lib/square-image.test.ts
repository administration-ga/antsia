import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { calculateSquareCrop, prepareSquareImage, type SquareImageSelection } from "./square-image"

describe("carré source sans bandes", () => {
  it.each([
    [1800, 1200, { left: 300, top: 0, size: 1200 }],
    [1200, 1800, { left: 0, top: 300, size: 1200 }],
    [1200, 1200, { left: 0, top: 0, size: 1200 }],
  ])("centre une photo de %i × %i", (width, height, expected) => {
    expect(calculateSquareCrop(width, height)).toEqual(expected)
  })

  it("déplace et zoome dans l'espace disponible, sans jamais dépasser la photo", () => {
    expect(calculateSquareCrop(1800, 1200, { x: 1, y: 0, zoom: 2 })).toEqual({ left: 1200, top: 0, size: 600 })
    expect(calculateSquareCrop(1800, 1200, { x: -4, y: 7, zoom: 10 })).toEqual({ left: 0, top: 800, size: 400 })
    expect(calculateSquareCrop(1800, 1200, { x: Infinity, y: NaN, zoom: 0 })).toEqual({ left: 300, top: 0, size: 1200 })
    for (const width of [1, 711, 1200]) for (const height of [1, 923, 1800]) for (const zoom of [1, 1.35, 3]) for (const position of [0, 0.5, 1]) {
      const crop = calculateSquareCrop(width, height, { x: position, y: 1 - position, zoom })
      expect(crop.left).toBeGreaterThanOrEqual(0)
      expect(crop.top).toBeGreaterThanOrEqual(0)
      expect(crop.left + crop.size).toBeLessThanOrEqual(width)
      expect(crop.top + crop.size).toBeLessThanOrEqual(height)
    }
  })

  it.each([[0, 1200], [-1, 1200], [1200, 0], [NaN, 1200], [Infinity, 1200], [1.5, 1200], [16_001, 1], [1, 16_001], [8000, 8000]])("refuse les dimensions invalides ou excessives %s × %s", (width, height) => {
    expect(() => calculateSquareCrop(width, height)).toThrow("square_image_invalid")
  })
})

describe("préparation locale du fichier carré", () => {
  const draw = vi.fn()
  const close = vi.fn()
  const decode = vi.fn()
  const encode = vi.fn()
  const context = vi.fn()
  let canvas: { width: number; height: number; getContext: typeof context; toBlob: typeof encode }
  const file = () => new File(["photo"], "devanture.jpeg", { type: "image/jpeg" })
  const selection: SquareImageSelection = { width: 2400, height: 1800, x: 1, y: 0, zoom: 1 }

  beforeEach(() => {
    vi.clearAllMocks()
    context.mockReturnValue({ drawImage: draw })
    encode.mockImplementation((callback: (value: Blob | null) => void) => callback(new Blob(["encoded"], { type: "image/webp" })))
    decode.mockResolvedValue({ width: 2400, height: 1800, close })
    canvas = { width: 0, height: 0, getContext: context, toBlob: encode }
    vi.stubGlobal("createImageBitmap", decode)
    vi.stubGlobal("document", { createElement: vi.fn().mockReturnValue(canvas) })
  })
  afterEach(() => vi.unstubAllGlobals())

  it("réencode le rectangle prévisualisé, orienté, en WebP carré limité à 1200 px et ferme le bitmap", async () => {
    const original = file()
    const prepared = await prepareSquareImage(original, selection)
    expect(decode).toHaveBeenCalledWith(original, { imageOrientation: "from-image" })
    expect(canvas.width).toBe(1200)
    expect(canvas.height).toBe(1200)
    expect(draw).toHaveBeenCalledWith(await decode.mock.results[0]!.value, 600, 0, 1800, 1800, 0, 0, 1200, 1200)
    expect(encode).toHaveBeenCalledWith(expect.any(Function), "image/webp", 0.9)
    expect(prepared).not.toBe(original)
    expect(prepared.name).toBe("devanture-square.webp")
    expect(prepared.type).toBe("image/webp")
    expect(close).toHaveBeenCalledExactlyOnceWith()
  })

  it("n'agrandit pas un petit recadrage et respecte le MIME réellement produit par le navigateur", async () => {
    encode.mockImplementation((callback: (value: Blob | null) => void) => callback(new Blob(["encoded"], { type: "image/png" })))
    const prepared = await prepareSquareImage(file(), { ...selection, zoom: 3 })
    expect(canvas.width).toBe(600)
    expect(canvas.height).toBe(600)
    expect(prepared.name).toBe("devanture-square.png")
    expect(prepared.type).toBe("image/png")
  })

  it("refuse une sélection provenant d'une autre photo et ferme la ressource", async () => {
    await expect(prepareSquareImage(file(), { ...selection, width: 1200 })).rejects.toThrow("square_image_changed")
    expect(draw).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledOnce()
  })

  it.each([null, new Blob([], { type: "image/webp" }), new Blob(["other"], { type: "image/gif" })])("ne renvoie jamais l'original quand l'encodage échoue ou produit un format refusé", async blob => {
    encode.mockImplementation((callback: (value: Blob | null) => void) => callback(blob))
    await expect(prepareSquareImage(file(), selection)).rejects.toThrow("square_image_unavailable")
    expect(close).toHaveBeenCalledOnce()
  })

  it("refuse sans canvas, sans décodeur ou pour un format non accepté", async () => {
    context.mockReturnValue(null)
    await expect(prepareSquareImage(file(), selection)).rejects.toThrow("square_image_unavailable")
    expect(close).toHaveBeenCalledOnce()
    await expect(prepareSquareImage(new File(["svg"], "logo.svg", { type: "image/svg+xml" }), selection)).rejects.toThrow("square_image_invalid")
    await expect(prepareSquareImage(new File([], "empty.jpg", { type: "image/jpeg" }), selection)).rejects.toThrow("square_image_invalid")
    expect(decode).toHaveBeenCalledOnce()
    decode.mockRejectedValue(new Error("decode"))
    await expect(prepareSquareImage(file(), selection)).rejects.toThrow("decode")
  })
})
