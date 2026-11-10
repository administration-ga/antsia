import { deflateSync } from "node:zlib"

import { describe, expect, it } from "vitest"

import { jpegHasGpsMetadata, listImageMetadata, stripImageMetadata, webpIsAnimated } from "./imageMetadata"

// ═══════════════════════════════════════════════════════════════
// Fixtures — de VRAIES images minuscules, et des blocs fabriqués ici
// ═══════════════════════════════════════════════════════════════

/** Un JPEG 2×2 réel (libjpeg-turbo, `cjpeg -quality 90 -optimize`), sans métadonnée : SOI, APP0 JFIF, tables, SOF, SOS, EOI. */
const JPEG_2X2 = Uint8Array.from(
  Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAdEAACAgMAAwAAAAAAAAAAAAABAgADBAUGBxIh/8QAFQEBAQAAAAAAAAAAAAAAAAAABQf/xAAZEQACAwEAAAAAAAAAAAAAAAAAAgEDMnH/2gAMAwEAAhEDEQA/AKb5zx/y+Rz2rtt5vUWWvi1M7vg1FmJQEkn1+mIiTOvC8BX1J//Z",
    "base64",
  ),
)

/** Un WebP 2×2 réel, sans perte (`cwebp -lossless`) : RIFF, un seul morceau VP8L. */
const WEBP_2X2 = Uint8Array.from(
  Buffer.from("UklGRjwAAABXRUJQVlA4TDAAAAAvAUAAAB+goG0bNteHptsgjkCAMhfmcIuYhozdgpjf/Me/CVrdBrIBylRhFtH/2AE=", "base64"),
)

/** Un GIF89a 1×1 réel : en-tête, palette globale de deux couleurs, contrôle graphique, une image, terminateur. */
const GIF_HEADER = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00]
const GIF_GRAPHIC_CONTROL = [0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00]
const GIF_IMAGE = [0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00]
const GIF_LOOP = [0x21, 0xff, 0x0b, ...ascii("NETSCAPE2.0"), 0x03, 0x01, 0x00, 0x00, 0x00]

function ascii(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0))
}

function bytes(...parts: (readonly number[] | Uint8Array)[]): Uint8Array {
  return Uint8Array.from(parts.flatMap((part) => Array.from(part)))
}

/** Les deux octets de longueur d'un segment JPEG (charge + 2). */
function jpegSegment(marker: number, payload: readonly number[]): number[] {
  const length = payload.length + 2
  return [0xff, marker, length >> 8, length & 0xff, ...payload]
}

/**
 * Un segment APP1 EXIF qui porte un bloc GPS : IFD0 avec le fabricant et le
 * pointeur GPS (`0x8825`), IFD GPS avec latitude et longitude (valeurs
 * FICTIVES : 1° 2′ 3″ N, 4° 5′ 6″ E).
 */
function exifGpsSegment(order: "II" | "MM", gpsEntries = 4): number[] {
  const little = order === "II"
  const u16 = (value: number) => (little ? [value & 0xff, value >> 8] : [value >> 8, value & 0xff])
  const u32 = (value: number) => (little ? [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, value >>> 24] : [value >>> 24, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff])
  const entry = (tag: number, type: number, count: number, value: number[]) => [...u16(tag), ...u16(type), ...u32(count), ...value]
  // Plan des décalages (depuis le début de l'en-tête TIFF).
  const ifd0 = 8
  const ifd0Size = 2 + 2 * 12 + 4
  const make = ifd0 + ifd0Size // « Phone\0 », 6 octets
  const gps = make + 6
  const gpsSize = 2 + gpsEntries * 12 + 4
  const latitude = gps + gpsSize
  const longitude = latitude + 24
  const rationals = (a: number, b: number, c: number) => [...u32(a), ...u32(1), ...u32(b), ...u32(1), ...u32(c), ...u32(1)]
  const gpsTable = [
    entry(0x0001, 2, 2, [...ascii("N"), 0, 0, 0]),
    entry(0x0002, 5, 3, u32(latitude)),
    entry(0x0003, 2, 2, [...ascii("E"), 0, 0, 0]),
    entry(0x0004, 5, 3, u32(longitude)),
  ].slice(0, gpsEntries)
  const tiff = [
    ...ascii(order),
    ...u16(42),
    ...u32(ifd0),
    ...u16(2),
    ...entry(0x010f, 2, 6, u32(make)),
    ...entry(0x8825, 4, 1, u32(gps)),
    ...u32(0),
    ...ascii("Phone"),
    0,
    ...u16(gpsTable.length),
    ...gpsTable.flat(),
    ...u32(0),
    ...rationals(1, 2, 3),
    ...rationals(4, 5, 6),
  ]
  return jpegSegment(0xe1, [...ascii("Exif"), 0, 0, ...tiff])
}

/** Un APP1 EXIF SANS bloc GPS (IFD0 : le fabricant seul). */
function exifWithoutGpsSegment(): number[] {
  const tiff = [...ascii("II"), 42, 0, 8, 0, 0, 0, 1, 0, 0x0f, 0x01, 2, 0, 6, 0, 0, 0, 26, 0, 0, 0, 0, 0, 0, 0, ...ascii("Phone"), 0]
  return jpegSegment(0xe1, [...ascii("Exif"), 0, 0, ...tiff])
}

/** Un APP1 XMP qui cite une position. */
function xmpGpsSegment(): number[] {
  return jpegSegment(0xe1, [...ascii("http://ns.adobe.com/xap/1.0/"), 0, ...ascii('<x:xmpmeta><rdf:Description exif:GPSLatitude="1,2N" exif:GPSLongitude="4,5E"/></x:xmpmeta>')])
}

/** Le JPEG réel, avec des segments insérés juste après son APP0 (SOI 2 octets + APP0 18 octets). */
function jpegWith(...segments: number[][]): Uint8Array {
  return bytes(JPEG_2X2.subarray(0, 20), segments.flat(), JPEG_2X2.subarray(20))
}

// ── PNG : de vrais morceaux, CRC compris ──────────────────────────

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(data: readonly number[]): number {
  let c = 0xffffffff
  for (const byte of data) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function be32(value: number): number[] {
  return [value >>> 24, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

function pngChunk(type: string, data: readonly number[]): number[] {
  const body = [...ascii(type), ...data]
  return [...be32(data.length), ...body, ...be32(crc32(body))]
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const PNG_IHDR = pngChunk("IHDR", [...be32(1), ...be32(1), 8, 6, 0, 0, 0])
const PNG_IDAT = pngChunk("IDAT", Array.from(deflateSync(Buffer.from([0, 0xc8, 0x50, 0x28, 0xff]))))
const PNG_IEND = pngChunk("IEND", [])
const PNG_1X1 = bytes(PNG_SIGNATURE, PNG_IHDR, PNG_IDAT, PNG_IEND)

// ── WebP étendu : VP8X + l'image réelle + EXIF + XMP ──────────────

function le32(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, value >>> 24]
}

function riffChunk(type: string, data: readonly number[]): number[] {
  return [...ascii(type), ...le32(data.length), ...data, ...(data.length % 2 === 1 ? [0] : [])]
}

function webp(chunks: number[][]): Uint8Array {
  const body = [...ascii("WEBP"), ...chunks.flat()]
  return bytes(ascii("RIFF"), le32(body.length), body)
}

/** Le morceau VP8L de l'image réelle (après l'en-tête RIFF de 12 octets). */
const WEBP_VP8L = Array.from(WEBP_2X2.subarray(12))

function vp8x(flags: number): number[] {
  return riffChunk("VP8X", [flags, 0, 0, 0, 1, 0, 0, 1, 0, 0])
}

// ═══════════════════════════════════════════════════════════════
// JPEG
// ═══════════════════════════════════════════════════════════════

describe("imageMetadata — JPEG et bloc GPS du segment APP1", () => {
  it("reconnaît un bloc GPS EXIF, dans les deux ordres d'octets", () => {
    expect(jpegHasGpsMetadata(JPEG_2X2)).toBe(false)
    expect(jpegHasGpsMetadata(jpegWith(exifGpsSegment("II")))).toBe(true)
    expect(jpegHasGpsMetadata(jpegWith(exifGpsSegment("MM")))).toBe(true)
  })

  it("reconnaît une position citée par un paquet XMP", () => {
    expect(jpegHasGpsMetadata(jpegWith(xmpGpsSegment()))).toBe(true)
  })

  it("ne signale ni un EXIF sans GPS, ni un IFD GPS vide, ni un fichier qui n'est pas un JPEG", () => {
    expect(jpegHasGpsMetadata(jpegWith(exifWithoutGpsSegment()))).toBe(false)
    expect(jpegHasGpsMetadata(jpegWith(exifGpsSegment("II", 0)))).toBe(false)
    expect(jpegHasGpsMetadata(PNG_1X1)).toBe(false)
    expect(jpegHasGpsMetadata(new Uint8Array())).toBe(false)
  })

  it("la détection ne dépend que de l'en-tête : un JPEG tronqué après le balayage est encore lu", () => {
    const withGps = jpegWith(exifGpsSegment("II"))
    expect(jpegHasGpsMetadata(withGps.subarray(0, withGps.length - 4))).toBe(true)
  })

  it("un JPEG avec GPS ressort SANS segment APP1, l'image recopiée à l'octet", () => {
    const withGps = jpegWith(exifGpsSegment("II"), xmpGpsSegment())
    const stripped = stripImageMetadata(withGps, "image/jpeg")
    expect(stripped).not.toBeNull()
    expect(Array.from(stripped!)).toEqual(Array.from(JPEG_2X2))
    expect(listImageMetadata(stripped!, "image/jpeg")).toEqual([])
    expect(jpegHasGpsMetadata(stripped!)).toBe(false)
  })

  it("nomme et retire EXIF, XMP, IPTC, commentaire et données après l'image", () => {
    const loaded = bytes(
      jpegWith(exifGpsSegment("MM"), xmpGpsSegment(), jpegSegment(0xed, ascii("Photoshop 3.0\0IPTC")), jpegSegment(0xfe, ascii("Libreville"))),
      [0x00, 0x01, 0x02, 0x03],
    )
    expect(listImageMetadata(loaded, "image/jpeg")).toEqual(["jpeg:APP1:Exif", "jpeg:APP1:XMP", "jpeg:APP13", "jpeg:COM", "jpeg:trailer"])
    expect(Array.from(stripImageMetadata(loaded, "image/jpeg")!)).toEqual(Array.from(JPEG_2X2))
  })

  it("garde le profil de couleur (APP2 ICC_PROFILE) et la transformée Adobe (APP14), retire un APP2 étranger", () => {
    const icc = jpegSegment(0xe2, [...ascii("ICC_PROFILE"), 0, 1, 1, 0xaa])
    const adobe = jpegSegment(0xee, [...ascii("Adobe"), 0, 100, 0, 0, 0, 0, 1])
    const mpf = jpegSegment(0xe2, [...ascii("MPF"), 0, 1, 2, 3])
    const stripped = stripImageMetadata(jpegWith(icc, adobe, mpf), "image/jpeg")!
    expect(Array.from(stripped)).toEqual(Array.from(jpegWith(icc, adobe)))
    expect(listImageMetadata(jpegWith(icc, adobe, mpf), "image/jpeg")).toEqual(["jpeg:APP2"])
  })

  it("parcourt les balayages : un commentaire glissé ENTRE deux balayages part aussi, les octets de bourrage restent", () => {
    const sos = jpegSegment(0xda, [1, 1, 0, 0, 63, 0])
    const progressive = bytes(
      [0xff, 0xd8],
      jpegSegment(0xdb, [0, ...new Array(64).fill(1)]),
      sos,
      [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56],
      jpegSegment(0xfe, ascii("entre deux balayages")),
      jpegSegment(0xc4, [0, ...new Array(16).fill(0)]),
      sos,
      [0x78],
      [0xff, 0xd9],
    )
    const expected = bytes(
      [0xff, 0xd8],
      jpegSegment(0xdb, [0, ...new Array(64).fill(1)]),
      sos,
      [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56],
      jpegSegment(0xc4, [0, ...new Array(16).fill(0)]),
      sos,
      [0x78],
      [0xff, 0xd9],
    )
    expect(listImageMetadata(progressive, "image/jpeg")).toEqual(["jpeg:COM"])
    expect(Array.from(stripImageMetadata(progressive, "image/jpeg")!)).toEqual(Array.from(expected))
  })

  it("un JPEG tronqué ou rompu rend null — l'appelant refuse", () => {
    expect(stripImageMetadata(JPEG_2X2.subarray(0, JPEG_2X2.length - 2), "image/jpeg")).toBeNull()
    expect(stripImageMetadata(JPEG_2X2.subarray(0, 40), "image/jpeg")).toBeNull()
    expect(stripImageMetadata(bytes([0xff, 0xd8, 0x00, 0x00]), "image/jpeg")).toBeNull()
    expect(stripImageMetadata(PNG_1X1, "image/jpeg")).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// PNG, WebP, GIF
// ═══════════════════════════════════════════════════════════════

describe("imageMetadata — PNG", () => {
  it("retire eXIf, textes (XMP compris), date et morceaux privés ; garde l'image et sa couleur", () => {
    const loaded = bytes(
      PNG_SIGNATURE,
      PNG_IHDR,
      pngChunk("sRGB", [0]),
      pngChunk("eXIf", [...ascii("MM"), 0, 42]),
      pngChunk("tEXt", [...ascii("Comment"), 0, ...ascii("Libreville")]),
      pngChunk("iTXt", [...ascii("XML:com.adobe.xmp"), 0, 0, 0, 0, 0, ...ascii("<x:xmpmeta/>")]),
      pngChunk("tIME", [0x07, 0xea, 11, 10, 9, 0, 0]),
      pngChunk("iDOT", [0, 0, 0, 1]),
      PNG_IDAT,
      PNG_IEND,
      [1, 2, 3],
    )
    expect(listImageMetadata(loaded, "image/png")).toEqual(["png:eXIf", "png:tEXt", "png:iTXt", "png:tIME", "png:iDOT", "png:trailer"])
    expect(Array.from(stripImageMetadata(loaded, "image/png")!)).toEqual(Array.from(bytes(PNG_SIGNATURE, PNG_IHDR, pngChunk("sRGB", [0]), PNG_IDAT, PNG_IEND)))
  })

  it("une image nue ressort à l'identique ; un PNG sans IEND rend null", () => {
    expect(Array.from(stripImageMetadata(PNG_1X1, "image/png")!)).toEqual(Array.from(PNG_1X1))
    expect(listImageMetadata(PNG_1X1, "image/png")).toEqual([])
    expect(stripImageMetadata(PNG_1X1.subarray(0, PNG_1X1.length - 12), "image/png")).toBeNull()
  })
})

describe("imageMetadata — WebP", () => {
  it("une image simple (VP8L seul) ressort à l'identique", () => {
    expect(Array.from(stripImageMetadata(WEBP_2X2, "image/webp")!)).toEqual(Array.from(WEBP_2X2))
    expect(listImageMetadata(WEBP_2X2, "image/webp")).toEqual([])
  })

  it("retire EXIF et XMP, efface leurs drapeaux et recalcule la taille RIFF", () => {
    const loaded = webp([vp8x(0x08 | 0x04 | 0x10), WEBP_VP8L, riffChunk("EXIF", [...ascii("II"), 42, 0, 1]), riffChunk("XMP ", ascii("<x:xmpmeta/>"))])
    expect(listImageMetadata(loaded, "image/webp")).toEqual(["webp:EXIF", "webp:XMP"])
    const stripped = stripImageMetadata(loaded, "image/webp")!
    expect(Array.from(stripped)).toEqual(Array.from(webp([vp8x(0x10), WEBP_VP8L])))
    expect(stripped[4]! + (stripped[5]! << 8) + (stripped[6]! << 16) + (stripped[7]! << 24)).toBe(stripped.length - 8)
  })

  it("reconnaît un WebP animé (drapeau d'animation de VP8X)", () => {
    expect(webpIsAnimated(webp([vp8x(0x02), riffChunk("ANIM", [0, 0, 0, 0, 0, 0])]))).toBe(true)
    expect(webpIsAnimated(webp([vp8x(0x10), WEBP_VP8L]))).toBe(false)
    expect(webpIsAnimated(WEBP_2X2)).toBe(false)
  })

  it("un WebP sans image ou tronqué rend null", () => {
    expect(stripImageMetadata(webp([vp8x(0), riffChunk("EXIF", [1, 2])]), "image/webp")).toBeNull()
    expect(stripImageMetadata(WEBP_2X2.subarray(0, 30), "image/webp")).toBeNull()
  })
})

describe("imageMetadata — GIF, animation conservée", () => {
  it("garde la boucle d'animation, le contrôle graphique et les images ; retire commentaire, texte brut et XMP", () => {
    const comment = [0x21, 0xfe, 0x0a, ...ascii("Libreville"), 0x00]
    const xmp = [0x21, 0xff, 0x0b, ...ascii("XMP DataXMP"), 0x05, ...ascii("<x:x>"), 0x00]
    const plainText = [0x21, 0x01, 0x0c, ...new Array(12).fill(0), 0x02, ...ascii("Hi"), 0x00]
    const loaded = bytes(GIF_HEADER, GIF_LOOP, comment, xmp, GIF_GRAPHIC_CONTROL, GIF_IMAGE, plainText, GIF_GRAPHIC_CONTROL, GIF_IMAGE, [0x3b], [9, 9])
    expect(listImageMetadata(loaded, "image/gif")).toEqual(["gif:comment", "gif:application:XMP Data", "gif:plainText", "gif:trailer"])
    expect(Array.from(stripImageMetadata(loaded, "image/gif")!)).toEqual(
      Array.from(bytes(GIF_HEADER, GIF_LOOP, GIF_GRAPHIC_CONTROL, GIF_IMAGE, GIF_GRAPHIC_CONTROL, GIF_IMAGE, [0x3b])),
    )
  })

  it("un GIF nu ressort à l'identique ; un GIF tronqué ou sans image rend null", () => {
    const gif = bytes(GIF_HEADER, GIF_GRAPHIC_CONTROL, GIF_IMAGE, [0x3b])
    expect(Array.from(stripImageMetadata(gif, "image/gif")!)).toEqual(Array.from(gif))
    expect(stripImageMetadata(gif.subarray(0, gif.length - 1), "image/gif")).toBeNull()
    expect(stripImageMetadata(bytes(GIF_HEADER, [0x3b]), "image/gif")).toBeNull()
  })
})

describe("imageMetadata — types non pris en charge", () => {
  it("rend null : l'appelant refuse, il ne laisse rien passer", () => {
    expect(stripImageMetadata(JPEG_2X2, "image/heic")).toBeNull()
    expect(listImageMetadata(JPEG_2X2, "image/svg+xml")).toBeNull()
  })
})
