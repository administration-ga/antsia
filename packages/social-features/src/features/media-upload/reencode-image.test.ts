import { jpegHasGpsMetadata, listImageMetadata } from "@antsia/social-domain/imageMetadata"
import { describe, expect, it } from "vitest"

import { fakeImageRuntime, TEST_JPEG_BYTES, TEST_JPEG_WITH_GPS_BYTES, TEST_PNG_BYTES } from "../../tests/image-runtime"
import { IMAGE_UPLOAD_QUALITY } from "./image-preparation"
import { isPreparedImage, prepareImageForUpload, reencodeImage } from "./reencode-image"

function file(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes as Uint8Array<ArrayBuffer>], name, { type })
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

/** Un GIF 1×1 réel, animé d'une boucle, avec un commentaire et un paquet XMP. */
function gifWithMetadata(): Uint8Array {
  const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0))
  return Uint8Array.from([
    ...ascii("GIF89a"), 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00,
    0x21, 0xff, 0x0b, ...ascii("NETSCAPE2.0"), 0x03, 0x01, 0x00, 0x00, 0x00,
    0x21, 0xfe, 0x0a, ...ascii("Libreville"), 0x00,
    0x21, 0xff, 0x0b, ...ascii("XMP DataXMP"), 0x05, ...ascii("<x:x>"), 0x00,
    0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00,
    0x3b,
  ])
}

describe("prepareImageForUpload — une photo avec GPS ne part jamais avec", () => {
  it("un JPEG de téléphone portant un bloc GPS sort sans APP1, réduit à 2 048 px de plus grand côté", async () => {
    // Pire cas : l'encodeur du navigateur RECOPIERAIT le bloc EXIF de la
    // source (aucun ne le fait, mais le module ne s'y fie pas).
    const runtime = fakeImageRuntime({ width: 4032, height: 3024, output: { bytes: TEST_JPEG_WITH_GPS_BYTES, type: "image/jpeg" } })
    const source = file(TEST_JPEG_WITH_GPS_BYTES, "IMG_0001.jpg", "image/jpeg")
    expect(jpegHasGpsMetadata(TEST_JPEG_WITH_GPS_BYTES)).toBe(true)

    const result = await prepareImageForUpload(source, runtime)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.file).not.toBe(source)
    expect(result.file.type).toBe("image/jpeg")
    expect(result.file.name).toBe("IMG_0001.jpg")
    expect(runtime.canvases).toEqual([{ width: 2048, height: 1536 }])
    expect(Math.max(result.width ?? 0, result.height ?? 0)).toBeLessThanOrEqual(2048)
    expect(runtime.encodings).toEqual([{ type: "image/jpeg", quality: IMAGE_UPLOAD_QUALITY }])
    const sent = await bytesOf(result.file)
    expect(jpegHasGpsMetadata(sent)).toBe(false)
    expect(listImageMetadata(sent, "image/jpeg")).toEqual([])
    // SOI puis l'en-tête JFIF : plus aucun APP1 entre eux.
    expect(Array.from(sent.subarray(0, 4))).toEqual([0xff, 0xd8, 0xff, 0xe0])
    expect(sent.length).toBeLessThan(TEST_JPEG_WITH_GPS_BYTES.length)
    expect(result.originalBytes).toBe(source.size)
    expect(result.preparedBytes).toBe(sent.length)
    expect(isPreparedImage(result.file)).toBe(true)
    expect(isPreparedImage(source)).toBe(false)
    expect(runtime.released).toBe(1)
  })

  it("une photo en hauteur garde son sens : le plus grand côté devient la hauteur", async () => {
    const runtime = fakeImageRuntime({ width: 3024, height: 4032 })
    const result = await prepareImageForUpload(file(TEST_JPEG_BYTES, "portrait.jpg", "image/jpeg"), runtime)
    expect(result.ok).toBe(true)
    expect(runtime.canvases).toEqual([{ width: 1536, height: 2048 }])
  })

  it("une petite photo n'est pas agrandie, mais elle est ré-encodée quand même", async () => {
    const runtime = fakeImageRuntime({ width: 800, height: 600 })
    const result = await prepareImageForUpload(file(TEST_JPEG_BYTES, "petite.jpg", "image/jpeg"), runtime)
    expect(result.ok).toBe(true)
    expect(runtime.canvases).toEqual([{ width: 800, height: 600 }])
    expect(runtime.encodings).toHaveLength(1)
  })

  it("un PNG reste PNG (transparence) ; un WebP non encodable par le navigateur part en PNG", async () => {
    const png = fakeImageRuntime({ width: 100, height: 100 })
    const fromPng = await prepareImageForUpload(file(TEST_PNG_BYTES, "capture.png", "image/png"), png)
    expect(fromPng.ok && fromPng.file.type).toBe("image/png")
    expect(png.encodings[0]?.type).toBe("image/png")

    const webp = fakeImageRuntime({ width: 100, height: 100 })
    const fromWebp = await prepareImageForUpload(file(TEST_PNG_BYTES, "sticker.webp", "image/webp"), webp)
    expect(webp.encodings[0]?.type).toBe("image/webp")
    expect(fromWebp.ok && fromWebp.file.type).toBe("image/png")
    expect(fromWebp.ok && isPreparedImage(fromWebp.file)).toBe(true)
  })

  it("un GIF garde son animation à l'octet ; seuls son commentaire et son XMP partent", async () => {
    const runtime = fakeImageRuntime()
    const gif = gifWithMetadata()
    const result = await prepareImageForUpload(file(gif, "anime.gif", "image/gif"), runtime)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Aucun canvas : l'animation n'est pas aplatie.
    expect(runtime.decoded).toEqual([])
    expect(runtime.canvases).toEqual([])
    const sent = await bytesOf(result.file)
    expect(listImageMetadata(gif, "image/gif")).toEqual(["gif:comment", "gif:application:XMP Data"])
    expect(listImageMetadata(sent, "image/gif")).toEqual([])
    expect(result.width).toBeNull()
    expect(isPreparedImage(result.file)).toBe(true)
  })
})

describe("prepareImageForUpload — ÉCHEC FERMÉ : un refus, jamais l'original", () => {
  it("un fichier illisible est refusé", async () => {
    const result = await prepareImageForUpload(file(new Uint8Array([1, 2, 3]), "casse.jpg", "image/jpeg"), fakeImageRuntime({ decodeFails: true }))
    expect(result).toEqual({ ok: false, refusal: "unreadable" })
  })

  it("un canvas indisponible est refusé, avec ou sans contexte 2D", async () => {
    const runtime = fakeImageRuntime({ canvas: "absent" })
    expect(await prepareImageForUpload(file(TEST_JPEG_BYTES, "a.jpg", "image/jpeg"), runtime)).toEqual({ ok: false, refusal: "canvas-unavailable" })
    expect(runtime.released).toBe(1)
    expect(await prepareImageForUpload(file(TEST_JPEG_BYTES, "a.jpg", "image/jpeg"), fakeImageRuntime({ canvas: "no-context" }))).toEqual({
      ok: false,
      refusal: "canvas-unavailable",
    })
  })

  it("un encodeur muet, ou qui rend un format refusé, est refusé", async () => {
    expect(await prepareImageForUpload(file(TEST_JPEG_BYTES, "a.jpg", "image/jpeg"), fakeImageRuntime({ output: null }))).toEqual({ ok: false, refusal: "encoder-failed" })
    expect(
      await prepareImageForUpload(file(TEST_JPEG_BYTES, "a.jpg", "image/jpeg"), fakeImageRuntime({ output: { bytes: TEST_JPEG_BYTES, type: "image/bmp" } })),
    ).toEqual({ ok: false, refusal: "encoder-failed" })
  })

  it("une sortie d'encodeur rompue est refusée (le nettoyage ne la lit pas)", async () => {
    const result = await prepareImageForUpload(
      file(TEST_JPEG_BYTES, "a.jpg", "image/jpeg"),
      fakeImageRuntime({ output: { bytes: TEST_JPEG_BYTES.subarray(0, 100), type: "image/jpeg" } }),
    )
    expect(result).toEqual({ ok: false, refusal: "unreadable" })
  })

  it("un GIF tronqué est refusé ; un type non pris en charge aussi, sans rien décoder", async () => {
    const gif = gifWithMetadata()
    expect(await prepareImageForUpload(file(gif.subarray(0, gif.length - 1), "a.gif", "image/gif"), fakeImageRuntime())).toEqual({ ok: false, refusal: "unreadable" })
    const runtime = fakeImageRuntime()
    expect(await prepareImageForUpload(file(TEST_JPEG_BYTES, "a.heic", "image/heic"), runtime)).toEqual({ ok: false, refusal: "unsupported-type" })
    expect(runtime.decoded).toEqual([])
  })
})

describe("reencodeImage — le moteur seul, sous le plan d'un écran (l'album)", () => {
  it("garde les dimensions d'origine quand le plan ne borne pas, à la qualité demandée", async () => {
    const runtime = fakeImageRuntime({ width: 6000, height: 4000 })
    const result = await reencodeImage(file(TEST_JPEG_WITH_GPS_BYTES, "album.jpg", "image/jpeg"), { targetType: "image/jpeg", maxDimension: null, quality: 0.92 }, runtime)
    expect(result.ok).toBe(true)
    expect(runtime.canvases).toEqual([{ width: 6000, height: 4000 }])
    expect(runtime.encodings).toEqual([{ type: "image/jpeg", quality: 0.92 }])
    if (result.ok) expect(listImageMetadata(await bytesOf(result.file), "image/jpeg")).toEqual([])
  })
})
