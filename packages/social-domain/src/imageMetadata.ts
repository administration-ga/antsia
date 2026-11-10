/**
 * imageMetadata — les blocs de MÉTADONNÉES d'une image, lus et retirés octet
 * par octet (lots SD-02 et FP-01 du dossier de finalisation du 9/11/2026).
 *
 * Une photo de téléphone porte, à côté de ses pixels, des blocs que personne
 * ne voit : EXIF (appareil, date, et souvent la POSITION GPS de la prise de
 * vue), XMP, IPTC, commentaires. Ce module sait les reconnaître et les retirer
 * sans décoder l'image, pour quatre formats : JPEG, PNG, WebP et GIF.
 *
 * Deux usages, un seul code :
 *   · l'écran, après le ré-encodage sur canvas
 *     (`@antsia/social-features/media-upload`) : ce qui sort de l'encodeur du
 *     navigateur repasse ici, et AUCUN bloc de métadonnées ne part, quel que
 *     soit le navigateur ; le GIF et le WebP animé, qu'un canvas aplatirait,
 *     ne sont pas ré-encodés : seuls leurs blocs de métadonnées sont retirés ;
 *   · le serveur, dans l'analyse des fichiers (`convex/modules/files/inspect.ts`) :
 *     un JPEG dont le segment APP1 porte un bloc GPS y est SIGNALÉ.
 *
 * ⚠️ Doctrine : une LISTE BLANCHE par format. Ce qui n'est pas reconnu comme
 * nécessaire à l'affichage est retiré ; un fichier mal formé rend `null`, et
 * l'appelant refuse (fail-closed) — jamais « on laisse passer l'original ».
 *
 * ⚠️ Ce module ne garantit rien côté SERVEUR : un client modifié peut envoyer
 * ce qu'il veut. La garantie est celle du client officiel ; le serveur
 * signale (décision 8 du plan 02 : contrôle serveur avec la chaîne des
 * médias du plan 03).
 *
 * TypeScript pur, aucune dépendance, aucun décodage d'image.
 */

/** Les formats dont ce module sait lire et retirer les métadonnées. */
export const IMAGE_METADATA_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const

export type ImageMetadataMimeType = (typeof IMAGE_METADATA_MIME_TYPES)[number]

export function isImageMetadataMimeType(value: string): value is ImageMetadataMimeType {
  return (IMAGE_METADATA_MIME_TYPES as readonly string[]).includes(value)
}

/**
 * Ce que le passage a trouvé : l'image NUE (`bytes`) et le nom des blocs
 * retirés (`removed`, par exemple `jpeg:APP1:Exif`, `png:tEXt`, `gif:comment`).
 */
export interface ImageMetadataScan {
  bytes: Uint8Array
  removed: readonly string[]
}

/**
 * L'image sans ses blocs de métadonnées, ou `null` si le fichier est mal formé
 * ou d'un type non pris en charge — l'appelant REFUSE alors le fichier.
 *
 * Les pixels ne sont pas touchés : les segments de l'image (tables, trames,
 * palettes, animation, profil de couleur) sont recopiés à l'octet. Ce qui suit
 * la fin de l'image (`EOI`, `IEND`, bande-annonce d'un GIF) est retiré aussi :
 * des appareils y rangent des images secondaires ou des métadonnées.
 */
export function stripImageMetadata(bytes: Uint8Array, mimeType: string): Uint8Array | null {
  return scanImageMetadata(bytes, mimeType)?.bytes ?? null
}

/**
 * Le nom des blocs de métadonnées que porte l'image (liste vide : image nue),
 * ou `null` si le fichier est mal formé ou d'un type non pris en charge.
 */
export function listImageMetadata(bytes: Uint8Array, mimeType: string): readonly string[] | null {
  return scanImageMetadata(bytes, mimeType)?.removed ?? null
}

/** Le passage complet : image nue et blocs retirés, ou `null`. */
export function scanImageMetadata(bytes: Uint8Array, mimeType: string): ImageMetadataScan | null {
  switch (mimeType) {
    case "image/jpeg":
      return scanJpeg(bytes)
    case "image/png":
      return scanPng(bytes)
    case "image/webp":
      return scanWebp(bytes)
    case "image/gif":
      return scanGif(bytes)
    default:
      return null
  }
}

// ═══════════════════════════════════════════════════════════════
// Lecture d'octets — bornée, jamais au-delà du tampon
// ═══════════════════════════════════════════════════════════════

/** Les octets `[offset, offset + text.length)` valent-ils ce texte ASCII ? */
function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (offset < 0 || offset + text.length > bytes.length) return false
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false
  }
  return true
}

/** Le texte ASCII de `[offset, offset + length)` — pour nommer un bloc. */
function asciiOf(bytes: Uint8Array, offset: number, length: number): string {
  let text = ""
  for (let i = offset; i < offset + length && i < bytes.length; i += 1) text += String.fromCharCode(bytes[i] ?? 0)
  return text
}

function u16be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0)
}

function u32be(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset] ?? 0) << 24) >>> 0) + ((bytes[offset + 1] ?? 0) << 16) + ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0)
}

function u32le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) + ((bytes[offset + 1] ?? 0) << 8) + ((bytes[offset + 2] ?? 0) << 16) + (((bytes[offset + 3] ?? 0) << 24) >>> 0)
}

/** Concatène des morceaux d'un tampon en un seul. */
function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

// ═══════════════════════════════════════════════════════════════
// JPEG — segments, balayages et données entropiques
// ═══════════════════════════════════════════════════════════════

const JPEG_SOI = 0xd8
const JPEG_EOI = 0xd9
const JPEG_SOS = 0xda
const JPEG_COM = 0xfe
const JPEG_APP0 = 0xe0
const JPEG_APP1 = 0xe1
const JPEG_APP2 = 0xe2
const JPEG_APP14 = 0xee
const JPEG_APP15 = 0xef
/** Pseudo-marqueur des données entropiques qui suivent un SOS. */
const JPEG_ENTROPY = -1

/** Un morceau de JPEG, tel que le parcours le rencontre. */
interface JpegSegment {
  /** Le marqueur (`0xE1` pour APP1…), ou `JPEG_ENTROPY` pour des données de balayage. */
  marker: number
  /** Début du morceau (premier `0xFF` du marqueur). */
  start: number
  /** Début de la charge utile (après les deux octets de longueur). */
  payload: number
  /** Fin du morceau (exclue). */
  end: number
}

/** Les marqueurs sans longueur : RSTn et TEM. */
function isStandaloneJpegMarker(marker: number): boolean {
  return (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01
}

/**
 * Tous les morceaux d'un JPEG, de SOI à l'EOI de l'image principale, ou `null`
 * si la structure est rompue ou tronquée. Les balayages (SOS) sont suivis de
 * leurs données entropiques : un `0xFF` y est toujours suivi de `0x00` (octet
 * de bourrage) ou d'un RSTn ; tout autre marqueur clôt le balayage. Un JPEG
 * progressif (plusieurs balayages, tables entre eux) est donc parcouru en
 * entier, et un bloc de métadonnées placé ENTRE deux balayages est vu aussi.
 *
 * `end` est la fin de l'EOI : ce qui suit (images secondaires MPF d'un
 * téléphone, données de constructeur) n'appartient pas à l'image.
 *
 * `untilScan` arrête le parcours au premier SOS (les métadonnées EXIF le
 * précèdent toujours) : la détection du GPS ne dépend pas de la suite du
 * fichier.
 */
function jpegSegments(bytes: Uint8Array, untilScan = false): { segments: JpegSegment[]; end: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== JPEG_SOI) return null
  const segments: JpegSegment[] = []
  let offset = 2
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null
    const start = offset
    // Les octets de bourrage `0xFF` sont permis avant un marqueur.
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
    if (offset >= bytes.length) return null
    const marker = bytes[offset] ?? 0
    offset += 1
    if (marker === 0x00) return null
    if (marker === JPEG_EOI) {
      segments.push({ marker, start, payload: offset, end: offset })
      return { segments, end: offset }
    }
    if (isStandaloneJpegMarker(marker)) {
      segments.push({ marker, start, payload: offset, end: offset })
      continue
    }
    if (offset + 2 > bytes.length) return null
    const length = u16be(bytes, offset)
    if (length < 2 || offset + length > bytes.length) return null
    segments.push({ marker, start, payload: offset + 2, end: offset + length })
    offset += length
    if (marker !== JPEG_SOS) continue
    if (untilScan) return { segments, end: offset }
    const dataStart = offset
    while (offset < bytes.length) {
      if (bytes[offset] === 0xff) {
        const next = bytes[offset + 1]
        if (next === undefined) return null
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
          offset += 2
          continue
        }
        break
      }
      offset += 1
    }
    if (offset >= bytes.length) return null
    segments.push({ marker: JPEG_ENTROPY, start: dataStart, payload: dataStart, end: offset })
  }
  return null
}

/**
 * Faut-il GARDER ce morceau ? Liste blanche : APP0 JFIF/JFXX (en-tête de
 * format), APP2 ICC_PROFILE (profil de couleur), APP14 Adobe (transformée de
 * couleur), et tout morceau qui n'est ni une application ni un commentaire
 * (tables, trame, balayages, données, redémarrages, EOI). Tout APP1 part —
 * EXIF, XMP et XMP étendu —, comme APP13 (Photoshop/IPTC, qui peut porter un
 * lieu en clair), les autres APPn et COM, où qu'ils soient.
 */
function keepJpegSegment(bytes: Uint8Array, segment: JpegSegment): boolean {
  const { marker, payload } = segment
  if (marker === JPEG_COM) return false
  if (marker < JPEG_APP0 || marker > JPEG_APP15) return true
  if (marker === JPEG_APP0) return asciiAt(bytes, payload, "JFIF\0") || asciiAt(bytes, payload, "JFXX\0")
  if (marker === JPEG_APP2) return asciiAt(bytes, payload, "ICC_PROFILE\0")
  if (marker === JPEG_APP14) return asciiAt(bytes, payload, "Adobe")
  return false
}

function jpegSegmentName(bytes: Uint8Array, segment: JpegSegment): string {
  if (segment.marker === JPEG_COM) return "jpeg:COM"
  const app = `jpeg:APP${segment.marker - JPEG_APP0}`
  if (segment.marker === JPEG_APP1) {
    if (asciiAt(bytes, segment.payload, "Exif\0")) return `${app}:Exif`
    if (isXmpPacket(bytes, segment)) return `${app}:XMP`
  }
  return app
}

/** Le JPEG sans métadonnées : SOI, puis les morceaux gardés jusqu'à l'EOI inclus. */
function scanJpeg(bytes: Uint8Array): ImageMetadataScan | null {
  const parsed = jpegSegments(bytes)
  if (!parsed) return null
  const parts: Uint8Array[] = [bytes.subarray(0, 2)]
  const removed: string[] = []
  for (const segment of parsed.segments) {
    if (keepJpegSegment(bytes, segment)) parts.push(bytes.subarray(segment.start, segment.end))
    else removed.push(jpegSegmentName(bytes, segment))
  }
  if (parsed.end < bytes.length) removed.push("jpeg:trailer")
  return { bytes: concat(parts), removed }
}

/**
 * Le JPEG porte-t-il un bloc GPS dans un segment APP1 ?
 *
 * Deux formes sont reconnues, avant le premier balayage :
 *   · EXIF : l'IFD0 de l'en-tête TIFF pointe (étiquette `0x8825`) vers un IFD
 *     GPS qui porte au moins une entrée ;
 *   · XMP (tout autre APP1 : XMP et XMP étendu) : le paquet cite
 *     `GPSLatitude` ou `GPSLongitude`.
 * Un fichier mal formé rend `false` : ce n'est qu'un signal (l'analyse lève
 * déjà `MIME_UNRECOGNIZED` ou `MIME_MISMATCH` pour un JPEG rompu).
 */
export function jpegHasGpsMetadata(bytes: Uint8Array): boolean {
  const parsed = jpegSegments(bytes, true)
  if (!parsed) return false
  for (const segment of parsed.segments) {
    if (segment.marker !== JPEG_APP1) continue
    if (asciiAt(bytes, segment.payload, "Exif\0\0")) {
      if (exifHasGps(bytes, segment.payload + 6, segment.end)) return true
    } else if (xmpHasGps(bytes, segment.payload, segment.end)) return true
  }
  return false
}

/** L'en-tête TIFF à `tiff` (jusqu'à `end`) mène-t-il à un IFD GPS non vide ? */
function exifHasGps(bytes: Uint8Array, tiff: number, end: number): boolean {
  if (tiff + 8 > end) return false
  const little = asciiAt(bytes, tiff, "II")
  if (!little && !asciiAt(bytes, tiff, "MM")) return false
  const u16 = (offset: number) => (little ? (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) : u16be(bytes, offset))
  const u32 = (offset: number) => (little ? u32le(bytes, offset) : u32be(bytes, offset))
  if (u16(tiff + 2) !== 42) return false
  const ifd0 = tiff + u32(tiff + 4)
  if (ifd0 + 2 > end) return false
  const count = u16(ifd0)
  for (let k = 0; k < count; k += 1) {
    const entry = ifd0 + 2 + k * 12
    if (entry + 12 > end) return false
    if (u16(entry) !== 0x8825) continue
    const gps = tiff + u32(entry + 8)
    if (gps + 2 > end) return false
    return u16(gps) > 0
  }
  return false
}

/**
 * Un APP1 qui n'est pas EXIF est-il un paquet XMP ? Il porte l'élément racine
 * `x:xmpmeta` (son en-tête est l'URI d'espace de noms d'Adobe, un identifiant
 * que l'on ne compare pas : le texte du paquet suffit).
 */
function isXmpPacket(bytes: Uint8Array, segment: JpegSegment): boolean {
  return asciiOf(bytes, segment.payload, segment.end - segment.payload).includes("xmpmeta")
}

/** Le paquet XMP cite-t-il une coordonnée GPS ? */
function xmpHasGps(bytes: Uint8Array, start: number, end: number): boolean {
  const packet = asciiOf(bytes, start, end - start)
  return packet.includes("GPSLatitude") || packet.includes("GPSLongitude")
}

// ═══════════════════════════════════════════════════════════════
// PNG — morceaux (chunks) jusqu'à IEND
// ═══════════════════════════════════════════════════════════════

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const

/**
 * Les morceaux ANNEXES gardés : transparence, couleur, gamma, profil, densité,
 * animation (APNG). Les morceaux CRITIQUES (initiale majuscule : IHDR, PLTE,
 * IDAT, IEND) le sont toujours. Partent : `eXIf`, `tEXt`, `zTXt`, `iTXt`
 * (XMP compris), `tIME`, et tout morceau privé inconnu.
 */
const PNG_KEPT_ANCILLARY = new Set([
  "tRNS",
  "cHRM",
  "gAMA",
  "iCCP",
  "sBIT",
  "sRGB",
  "cICP",
  "mDCV",
  "cLLI",
  "bKGD",
  "hIST",
  "pHYs",
  "sPLT",
  "acTL",
  "fcTL",
  "fdAT",
])

function scanPng(bytes: Uint8Array): ImageMetadataScan | null {
  if (bytes.length < PNG_SIGNATURE.length) return null
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) if (bytes[i] !== PNG_SIGNATURE[i]) return null
  const parts: Uint8Array[] = [bytes.subarray(0, PNG_SIGNATURE.length)]
  const removed: string[] = []
  let offset: number = PNG_SIGNATURE.length
  while (offset + 12 <= bytes.length) {
    const length = u32be(bytes, offset)
    const end = offset + 12 + length
    if (end > bytes.length) return null
    const type = asciiOf(bytes, offset + 4, 4)
    const critical = type.charCodeAt(0) >= 0x41 && type.charCodeAt(0) <= 0x5a
    if (critical || PNG_KEPT_ANCILLARY.has(type)) parts.push(bytes.subarray(offset, end))
    else removed.push(`png:${type}`)
    offset = end
    if (type === "IEND") {
      if (offset < bytes.length) removed.push("png:trailer")
      return { bytes: concat(parts), removed }
    }
  }
  // Pas d'IEND : fichier tronqué.
  return null
}

// ═══════════════════════════════════════════════════════════════
// WebP — morceaux RIFF
// ═══════════════════════════════════════════════════════════════

/** Les morceaux gardés : image (VP8, VP8L, ALPH), animation, profil, en-tête étendu. */
const WEBP_KEPT_CHUNKS = new Set(["VP8 ", "VP8L", "VP8X", "ALPH", "ANIM", "ANMF", "ICCP"])

/** Les drapeaux EXIF (0x08) et XMP (0x04) de l'en-tête étendu `VP8X`. */
const WEBP_VP8X_METADATA_FLAGS = 0x08 | 0x04
/** Le drapeau d'animation de l'en-tête étendu `VP8X`. */
const WEBP_VP8X_ANIMATION_FLAG = 0x02

/**
 * Le WebP est-il ANIMÉ ? Un canvas n'en garderait que la première image :
 * comme le GIF, il ne se ré-encode pas, on n'en retire que les métadonnées.
 */
export function webpIsAnimated(bytes: Uint8Array): boolean {
  if (bytes.length < 21 || !asciiAt(bytes, 0, "RIFF") || !asciiAt(bytes, 8, "WEBP") || !asciiAt(bytes, 12, "VP8X")) return false
  return ((bytes[20] ?? 0) & WEBP_VP8X_ANIMATION_FLAG) !== 0
}

function scanWebp(bytes: Uint8Array): ImageMetadataScan | null {
  if (bytes.length < 20 || !asciiAt(bytes, 0, "RIFF") || !asciiAt(bytes, 8, "WEBP")) return null
  const riffEnd = Math.min(bytes.length, 8 + u32le(bytes, 4))
  const parts: Uint8Array[] = []
  const removed: string[] = []
  let offset = 12
  let image = false
  while (offset + 8 <= riffEnd) {
    const type = asciiOf(bytes, offset, 4)
    const size = u32le(bytes, offset + 4)
    const end = offset + 8 + size + (size % 2)
    if (offset + 8 + size > riffEnd) return null
    if (WEBP_KEPT_CHUNKS.has(type)) {
      if (type === "VP8X") {
        const copy = bytes.slice(offset, offset + 8 + size)
        if (copy.length > 8) copy[8] = (copy[8] ?? 0) & ~WEBP_VP8X_METADATA_FLAGS
        parts.push(copy)
        if (size % 2 === 1) parts.push(new Uint8Array(1))
      } else {
        parts.push(bytes.subarray(offset, Math.min(end, bytes.length)))
        if (end > bytes.length) parts.push(new Uint8Array(end - bytes.length))
      }
      if (type === "VP8 " || type === "VP8L" || type === "ANMF") image = true
    } else {
      removed.push(`webp:${type.trim()}`)
    }
    offset = end
  }
  if (!image) return null
  if (riffEnd < bytes.length) removed.push("webp:trailer")
  const body = concat(parts)
  const header = new Uint8Array(12)
  header.set(bytes.subarray(0, 4), 0)
  const riffSize = body.length + 4
  header[4] = riffSize & 0xff
  header[5] = (riffSize >>> 8) & 0xff
  header[6] = (riffSize >>> 16) & 0xff
  header[7] = (riffSize >>> 24) & 0xff
  header.set(bytes.subarray(8, 12), 8)
  return { bytes: concat([header, body]), removed }
}

// ═══════════════════════════════════════════════════════════════
// GIF — blocs et extensions, animation conservée
// ═══════════════════════════════════════════════════════════════

const GIF_EXTENSION = 0x21
const GIF_IMAGE = 0x2c
const GIF_TRAILER = 0x3b
const GIF_GRAPHIC_CONTROL = 0xf9
const GIF_APPLICATION = 0xff
const GIF_COMMENT = 0xfe
const GIF_PLAIN_TEXT = 0x01

/** Les seules extensions d'application gardées : le nombre de boucles d'une animation. */
const GIF_LOOP_APPLICATIONS = ["NETSCAPE2.0", "ANIMEXTS1.0"] as const

/** La fin d'une suite de sous-blocs (le bloc de taille nulle compris), ou `null`. */
function gifSubBlocksEnd(bytes: Uint8Array, offset: number): number | null {
  let cursor = offset
  while (cursor < bytes.length) {
    const size = bytes[cursor] ?? 0
    cursor += 1 + size
    if (size === 0) return cursor
  }
  return null
}

/**
 * Le GIF sans ses blocs de métadonnées : les images, palettes et contrôles
 * d'animation sont recopiés à l'octet (l'animation est intacte) ; partent les
 * commentaires, le texte brut, et toute extension d'application autre que la
 * boucle (XMP, profil ICC, extensions privées). Ce qui suit le terminateur
 * est retiré.
 */
function scanGif(bytes: Uint8Array): ImageMetadataScan | null {
  if (bytes.length < 13 || !(asciiAt(bytes, 0, "GIF87a") || asciiAt(bytes, 0, "GIF89a"))) return null
  const packed = bytes[10] ?? 0
  let offset = 13 + (packed & 0x80 ? 3 * 2 ** ((packed & 0x07) + 1) : 0)
  if (offset > bytes.length) return null
  const parts: Uint8Array[] = [bytes.subarray(0, offset)]
  const removed: string[] = []
  let image = false
  while (offset < bytes.length) {
    const introducer = bytes[offset]
    if (introducer === GIF_TRAILER) {
      parts.push(bytes.subarray(offset, offset + 1))
      if (offset + 1 < bytes.length) removed.push("gif:trailer")
      return image ? { bytes: concat(parts), removed } : null
    }
    if (introducer === GIF_IMAGE) {
      if (offset + 10 > bytes.length) return null
      const local = bytes[offset + 9] ?? 0
      const dataStart = offset + 10 + (local & 0x80 ? 3 * 2 ** ((local & 0x07) + 1) : 0) + 1
      const end = gifSubBlocksEnd(bytes, dataStart)
      if (end === null) return null
      parts.push(bytes.subarray(offset, end))
      image = true
      offset = end
      continue
    }
    if (introducer === GIF_EXTENSION) {
      const label = bytes[offset + 1] ?? -1
      const end = gifSubBlocksEnd(bytes, offset + 2)
      if (end === null) return null
      if (label === GIF_GRAPHIC_CONTROL) parts.push(bytes.subarray(offset, end))
      else if (label === GIF_APPLICATION && (bytes[offset + 2] ?? 0) === 11 && GIF_LOOP_APPLICATIONS.some((name) => asciiAt(bytes, offset + 3, name))) {
        parts.push(bytes.subarray(offset, end))
      } else {
        removed.push(
          label === GIF_COMMENT
            ? "gif:comment"
            : label === GIF_PLAIN_TEXT
              ? "gif:plainText"
              : label === GIF_APPLICATION
                ? `gif:application:${asciiOf(bytes, offset + 3, 8).trim()}`
                : `gif:extension:${label}`,
        )
      }
      offset = end
      continue
    }
    return null
  }
  // Pas de terminateur : fichier tronqué.
  return null
}
