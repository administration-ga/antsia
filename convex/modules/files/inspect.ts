// Dupliqué de socle/convex/modules/fileGuard/inspect.ts @ ad2e7fdc2 — adaptations : copie BINAIRE (octets bruts de contrôle conservés ; `Finding` vient de `./policy`) ; ajout SD-02 : signal `IMAGE_GPS_METADATA` (sévérité `info` : signaler sans refuser) pour un JPEG dont le segment APP1 porte un bloc GPS, lu par `jpegHasGpsMetadata` (`@antsia/social-domain/imageMetadata`).
/**
 * Sentinelle fichiers — INSPECTION DÉTERMINISTE, règle pure (ADR-0160, D4a).
 *
 * Ce module lit des OCTETS et rend des signaux (`Finding[]`). Il ne connaît
 * ni la base, ni le stockage, ni le réseau : il est testable sur des
 * fixtures fabriquées en test (PDF minimal, docx avec `vbaProject.bin`,
 * EICAR, PNG déclaré PDF) et partageable tel quel avec un écran qui voudrait
 * pré-qualifier un fichier avant dépôt.
 *
 * Ce qu'il regarde, et pourquoi :
 *   - le TYPE RÉEL (magic bytes) contre le type DÉCLARÉ — c'est la seule
 *     barrière que `uploadPolicy.ts` ne pouvait pas poser : le MIME de
 *     `_storage` vient de l'en-tête HTTP du client, jamais du contenu ;
 *   - le CONTENU ACTIF d'un PDF (`/JavaScript`, `/Launch`, `/OpenAction`…),
 *     y compris sous forme de noms hex-échappés (`/J#61vaScript`) ;
 *   - les MACROS et objets embarqués d'un document Office (OOXML :
 *     `vbaProject.bin`, `oleObject`, relations externes, champs DDE ; OLE2 :
 *     flux `_VBA_PROJECT`/`Macros`) ;
 *   - les bombes et détournements d'archive (ratio de décompression,
 *     traversée de chemin, exécutable embarqué) ;
 *   - le NOM du fichier (double extension, extension exécutable, caractère
 *     de renversement d'écriture) ;
 *   - la POSITION GPS d'une photo JPEG (segment APP1, EXIF ou XMP) : SIGNALÉE
 *     seulement (lot SD-02, sévérité `info`, aucun verdict changé). Le client
 *     officiel ré-encode les photos avant l'envoi et n'en laisse partir aucune
 *     métadonnée ; ce signal dit qu'un fichier est arrivé autrement (ancien
 *     client, client modifié, autre application du moteur).
 *
 * Limites assumées, écrites ici pour ne pas être redécouvertes : un PDF dont
 * les objets sont dans des flux compressés (`/ObjStm`) cache ses noms à une
 * recherche textuelle — c'est l'antivirus qui prend le relais ; un OOXML
 * n'est lu qu'à travers ses ENTRÉES (`ZipEntryInfo`), fournies par l'appelant
 * (jszip côté action) pour garder ce module sans dépendance.
 */
import { jpegHasGpsMetadata } from "@antsia/social-domain/imageMetadata"

import type { Finding } from "./policy"

/** Une entrée d'archive telle que l'appelant la présente (jszip). */
export interface ZipEntryInfo {
  path: string
  compressedSize: number | null
  uncompressedSize: number | null
  /** Contenu texte, fourni seulement pour les entrées XML raisonnables. */
  readText?: () => Promise<string>
}

export interface InspectionInput {
  bytes: Uint8Array
  declaredMimeType?: string | null
  filename?: string | null
  /** Entrées de l'archive quand les octets commencent par `PK`. */
  zipEntries?: readonly ZipEntryInfo[] | null
}

export interface InspectionReport {
  detectedMimeType: string | null
  findings: Finding[]
}

// ─── Types MIME : normalisation et familles ──────────────────────────────────

/** Sans paramètres (`;codecs=…`), en minuscules, `image/jpg` ramené à `jpeg`. */
export function normalizeMime(mime: string | null | undefined): string | null {
  if (!mime) return null
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? ""
  if (base.length === 0) return null
  if (base === "image/jpg") return "image/jpeg"
  if (base === "audio/mp3") return "audio/mpeg"
  return base
}

export type MimeFamily =
  | "pdf"
  | "png"
  | "jpeg"
  | "gif"
  | "webp"
  | "heic"
  | "avif"
  | "zip"
  | "ole2"
  | "mp4"
  | "webm"
  | "ogg"
  | "mpeg-audio"
  | "wav"
  | "avi"
  | "text"
  | "executable"
  | "html"
  | "svg"
  | "script"
  | "archive"
  | "postscript"
  | "unknown"

const OOXML_PREFIX = "application/vnd.openxmlformats-officedocument."
const ODF_PREFIX = "application/vnd.oasis.opendocument."

/** La famille d'un type MIME — c'est elle qu'on compare, pas la chaîne. */
export function mimeFamily(mime: string | null | undefined): MimeFamily {
  const m = normalizeMime(mime)
  if (!m) return "unknown"
  switch (m) {
    case "application/pdf":
      return "pdf"
    case "image/png":
      return "png"
    case "image/jpeg":
      return "jpeg"
    case "image/gif":
      return "gif"
    case "image/webp":
      return "webp"
    case "image/heic":
    case "image/heif":
    case "image/heic-sequence":
    case "image/heif-sequence":
      return "heic"
    case "image/avif":
      return "avif"
    case "application/zip":
    case "application/x-zip-compressed":
    case "application/java-archive":
      return "zip"
    case "application/msword":
    case "application/vnd.ms-excel":
    case "application/vnd.ms-powerpoint":
    case "application/vnd.ms-outlook":
    case "application/x-ole-storage":
    case "application/x-msi":
      return "ole2"
    case "video/mp4":
    case "audio/mp4":
    case "audio/x-m4a":
    case "video/quicktime":
    case "audio/aac":
      return "mp4"
    case "video/webm":
    case "audio/webm":
    case "video/x-matroska":
      return "webm"
    case "audio/ogg":
    case "video/ogg":
    case "application/ogg":
      return "ogg"
    case "audio/mpeg":
      return "mpeg-audio"
    case "audio/wav":
    case "audio/x-wav":
    case "audio/wave":
    case "audio/vnd.wave":
      return "wav"
    case "video/x-msvideo":
      return "avi"
    case "text/plain":
    case "text/markdown":
    case "text/csv":
    case "application/json":
      return "text"
    case "text/html":
    case "application/xhtml+xml":
      return "html"
    case "image/svg+xml":
      return "svg"
    case "application/x-msdownload":
    case "application/x-msdos-program":
    case "application/x-executable":
    case "application/x-elf":
    case "application/x-mach-binary":
    case "application/vnd.microsoft.portable-executable":
      return "executable"
    case "application/x-sh":
    case "application/javascript":
    case "text/javascript":
    case "application/x-bat":
    case "text/x-script":
      return "script"
    case "application/vnd.rar":
    case "application/x-rar-compressed":
    case "application/x-7z-compressed":
    case "application/gzip":
    case "application/x-gzip":
    case "application/x-tar":
    case "application/x-bzip2":
      return "archive"
    case "application/postscript":
      return "postscript"
  }
  if (m.startsWith(OOXML_PREFIX) || m.startsWith(ODF_PREFIX)) return "zip"
  if (m.startsWith("text/")) return "text"
  return "unknown"
}

// ─── Reconnaissance par magic bytes ──────────────────────────────────────────

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[offset + i] !== signature[i]) return false
  }
  return true
}

function ascii(text: string): number[] {
  return Array.from(text, (c) => c.charCodeAt(0))
}

/** Position de `needle` dans `haystack` (recherche naïve bornée), -1 sinon. */
export function indexOfBytes(
  haystack: Uint8Array,
  needle: readonly number[],
  limit = haystack.length
): number {
  const end = Math.min(haystack.length, limit) - needle.length
  outer: for (let i = 0; i <= end; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer
    }
    return i
  }
  return -1
}

const SIG = {
  pdf: ascii("%PDF-"),
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpeg: [0xff, 0xd8, 0xff],
  gif87: ascii("GIF87a"),
  gif89: ascii("GIF89a"),
  riff: ascii("RIFF"),
  webp: ascii("WEBP"),
  wave: ascii("WAVE"),
  avi: ascii("AVI "),
  zip: [0x50, 0x4b, 0x03, 0x04],
  zipEmpty: [0x50, 0x4b, 0x05, 0x06],
  zipSpanned: [0x50, 0x4b, 0x07, 0x08],
  ole2: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
  ftyp: ascii("ftyp"),
  ebml: [0x1a, 0x45, 0xdf, 0xa3],
  ogg: ascii("OggS"),
  id3: ascii("ID3"),
  mz: ascii("MZ"),
  elf: [0x7f, 0x45, 0x4c, 0x46],
  shebang: ascii("#!"),
  cafebabe: [0xca, 0xfe, 0xba, 0xbe],
  feedface: [0xfe, 0xed, 0xfa, 0xce],
  feedfacf: [0xfe, 0xed, 0xfa, 0xcf],
  rar: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07],
  sevenZip: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c],
  gzip: [0x1f, 0x8b],
  postscript: ascii("%!PS"),
} as const

const HEIC_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "hevm",
  "hevs",
  "mif1",
  "msf1",
])

function brandAt(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0
  )
}

/** Vrai si le préfixe est de l'UTF-8 valide sans octet nul. */
function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 64 * 1024))
  for (let i = 0; i < sample.length; i += 1) {
    if (sample[i] === 0) return false
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample)
    return true
  } catch {
    // Un échantillon coupé au milieu d'une séquence multi-octets échoue à
    // tort : on retente sans les 3 derniers octets avant de conclure.
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(
        sample.subarray(0, Math.max(0, sample.length - 3))
      )
      return true
    } catch {
      return false
    }
  }
}

function textHead(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, Math.min(bytes.length, 4096)))
    .replace(/^﻿/, "")
    .trimStart()
    .toLowerCase()
}

/**
 * Le type que les OCTETS annoncent, ou `null` si aucune signature connue.
 * Une réponse `null` n'est pas un refus : c'est « rien à confronter ».
 */
export function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return null
  // Le spec PDF tolère jusqu'à 1024 octets avant l'en-tête.
  if (indexOfBytes(bytes, SIG.pdf, 1024 + SIG.pdf.length) >= 0) {
    return "application/pdf"
  }
  if (startsWith(bytes, SIG.png)) return "image/png"
  if (startsWith(bytes, SIG.jpeg)) return "image/jpeg"
  if (startsWith(bytes, SIG.gif87) || startsWith(bytes, SIG.gif89)) return "image/gif"
  if (startsWith(bytes, SIG.riff)) {
    if (startsWith(bytes, SIG.webp, 8)) return "image/webp"
    if (startsWith(bytes, SIG.wave, 8)) return "audio/wav"
    if (startsWith(bytes, SIG.avi, 8)) return "video/x-msvideo"
    return null
  }
  if (
    startsWith(bytes, SIG.zip) ||
    startsWith(bytes, SIG.zipEmpty) ||
    startsWith(bytes, SIG.zipSpanned)
  ) {
    return "application/zip"
  }
  if (startsWith(bytes, SIG.ole2)) return "application/x-ole-storage"
  if (startsWith(bytes, SIG.ftyp, 4)) {
    const brand = brandAt(bytes, 8)
    if (HEIC_BRANDS.has(brand)) return "image/heic"
    if (brand === "avif" || brand === "avis") return "image/avif"
    if (brand === "M4A ") return "audio/mp4"
    return "video/mp4"
  }
  if (startsWith(bytes, SIG.ebml)) return "video/webm"
  if (startsWith(bytes, SIG.ogg)) return "audio/ogg"
  if (startsWith(bytes, SIG.id3)) return "audio/mpeg"
  if (
    bytes.length > 2 &&
    bytes[0] === 0xff &&
    (bytes[1] === 0xfb || bytes[1] === 0xf3 || bytes[1] === 0xf2 || bytes[1] === 0xe3)
  ) {
    return "audio/mpeg"
  }
  if (startsWith(bytes, SIG.mz)) return "application/x-msdownload"
  if (startsWith(bytes, SIG.elf)) return "application/x-elf"
  if (
    startsWith(bytes, SIG.cafebabe) ||
    startsWith(bytes, SIG.feedface) ||
    startsWith(bytes, SIG.feedfacf)
  ) {
    return "application/x-mach-binary"
  }
  if (startsWith(bytes, SIG.rar)) return "application/vnd.rar"
  if (startsWith(bytes, SIG.sevenZip)) return "application/x-7z-compressed"
  if (startsWith(bytes, SIG.gzip)) return "application/gzip"
  if (startsWith(bytes, SIG.postscript)) return "application/postscript"
  if (startsWith(bytes, SIG.shebang)) return "text/x-script"
  if (looksLikeText(bytes)) {
    const head = textHead(bytes)
    if (head.startsWith("<?xml") || head.startsWith("<svg") || head.startsWith("<!doctype") || head.startsWith("<html")) {
      if (head.includes("<svg")) return "image/svg+xml"
      if (head.includes("<html") || head.includes("<!doctype html")) return "text/html"
      return "application/xml"
    }
    return "text/plain"
  }
  return null
}

// ─── Déclaré ↔ détecté ───────────────────────────────────────────────────────

/** Familles dont on sait reconnaître la signature : un « inconnu » y est
 *  un mensonge probable, pas une absence d'information. */
const FAMILIES_WITH_SIGNATURE: ReadonlySet<MimeFamily> = new Set([
  "pdf",
  "png",
  "jpeg",
  "gif",
  "webp",
  "heic",
  "avif",
  "zip",
  "ole2",
  "mp4",
  "webm",
  "ogg",
  "wav",
  "avi",
])

/** Familles dont le CONTENU est actif par nature : jamais tolérées. */
const HOSTILE_FAMILIES: ReadonlySet<MimeFamily> = new Set([
  "executable",
  "html",
  "svg",
  "script",
])

export function mimeMismatchFinding(
  declared: string | null | undefined,
  detected: string | null
): Finding | null {
  const declaredFamily = mimeFamily(declared)
  const detectedFamily = mimeFamily(detected)
  if (HOSTILE_FAMILIES.has(detectedFamily) && declaredFamily !== detectedFamily) {
    return {
      code: detectedFamily === "executable" ? "EXECUTABLE_CONTENT" : "ACTIVE_CONTENT",
      severity: "critical",
      detail: `déclaré ${normalizeMime(declared) ?? "?"}, détecté ${detected}`,
    }
  }
  if (!declared || declaredFamily === "unknown") return null
  if (detected === null) {
    if (FAMILIES_WITH_SIGNATURE.has(declaredFamily) || declaredFamily === "text") {
      return {
        code: "MIME_UNRECOGNIZED",
        severity: "warning",
        detail: `déclaré ${normalizeMime(declared)}, aucune signature reconnue`,
      }
    }
    // MP3 sans ID3 ni synchro en tête : l'encodeur a pu écrire du silence
    // avant la première trame. Un signal, pas un blocage.
    return null
  }
  if (declaredFamily === detectedFamily) return null
  if (declaredFamily === "mpeg-audio" && detectedFamily === "text") return null
  return {
    code: "MIME_MISMATCH",
    severity: declaredFamily === "mpeg-audio" ? "info" : "warning",
    detail: `déclaré ${normalizeMime(declared)}, détecté ${detected}`,
  }
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

const PDF_DEEP_SCAN_MAX_BYTES = 40 * 1024 * 1024

function latin1(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes)
}

/** Les noms PDF admettent `#XX` : `/J#61vaScript` vaut `/JavaScript`. */
export function decodePdfNameEscapes(text: string): string {
  return text.replace(/#([0-9a-fA-F]{2})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  )
}

export function inspectPdf(bytes: Uint8Array): Finding[] {
  const findings: Finding[] = []
  if (bytes.length > PDF_DEEP_SCAN_MAX_BYTES) {
    findings.push({
      code: "PDF_DEEP_SCAN_SKIPPED",
      severity: "info",
      detail: "fichier trop volumineux pour l'inspection des actions",
    })
    return findings
  }
  const text = decodePdfNameEscapes(latin1(bytes))
  const has = (re: RegExp) => re.test(text)

  const js = has(/\/JavaScript\b/) || has(/\/JS\b/)
  const auto = has(/\/OpenAction\b/) || has(/\/AA\b/)

  if (has(/\/Launch\b/)) {
    findings.push({
      code: "PDF_LAUNCH_ACTION",
      severity: "critical",
      detail: "action /Launch (exécution d'un programme)",
    })
  }
  if (js && auto) {
    findings.push({
      code: "PDF_AUTO_JAVASCRIPT",
      severity: "critical",
      detail: "JavaScript déclenché à l'ouverture (/OpenAction ou /AA)",
    })
  } else if (js) {
    findings.push({
      code: "PDF_JAVASCRIPT",
      severity: "warning",
      detail: "le document contient du JavaScript",
    })
  } else if (auto) {
    findings.push({
      code: "PDF_OPEN_ACTION",
      severity: "info",
      detail: "action à l'ouverture sans script",
    })
  }
  if (has(/\/EmbeddedFiles?\b/)) {
    findings.push({
      code: "PDF_EMBEDDED_FILE",
      severity: "warning",
      detail: "fichier embarqué dans le PDF",
    })
  }
  if (has(/\/RichMedia\b/)) {
    findings.push({
      code: "PDF_RICH_MEDIA",
      severity: "warning",
      detail: "contenu RichMedia (Flash/vidéo interactive)",
    })
  }
  if (has(/\/SubmitForm\b/) || has(/\/ImportData\b/)) {
    findings.push({
      code: "PDF_FORM_EXFILTRATION",
      severity: "warning",
      detail: "formulaire qui soumet ou importe des données",
    })
  }
  if (has(/\/XFA\b/)) {
    findings.push({ code: "PDF_XFA_FORM", severity: "info" })
  }
  if (has(/\/Encrypt\b/)) {
    findings.push({
      code: "PDF_ENCRYPTED",
      severity: "info",
      detail: "PDF chiffré : l'antivirus ne voit pas l'intérieur",
    })
  }
  if (!/%%EOF/.test(text.slice(-2048))) {
    findings.push({ code: "PDF_NO_EOF", severity: "info" })
  }
  return findings
}

// ─── Archives ZIP et documents Office (OOXML / ODF) ─────────────────────────

const ZIP_MAX_ENTRIES = 5000
const ZIP_BOMB_MIN_UNCOMPRESSED = 50 * 1024 * 1024
const ZIP_BOMB_RATIO = 100
const ZIP_ENTRY_TEXT_MAX_BYTES = 8 * 1024 * 1024
const EXECUTABLE_EXTENSIONS = /\.(exe|bat|cmd|com|scr|pif|js|jse|vbs|vbe|ps1|psm1|msi|jar|hta|lnk|dll|sh|cpl|reg|wsf|wsh)$/i
const NESTED_ARCHIVE_EXTENSIONS = /\.(zip|rar|7z|gz|tgz|bz2|iso|cab)$/i

type OoxmlKind = "docx" | "xlsx" | "pptx" | null

function ooxmlKindOf(paths: readonly string[]): OoxmlKind {
  if (paths.some((p) => p === "word/document.xml")) return "docx"
  if (paths.some((p) => p === "xl/workbook.xml")) return "xlsx"
  if (paths.some((p) => p === "ppt/presentation.xml")) return "pptx"
  return null
}

function declaredOoxmlKind(mime: string | null | undefined): OoxmlKind {
  const m = normalizeMime(mime)
  if (m === `${OOXML_PREFIX}wordprocessingml.document`) return "docx"
  if (m === `${OOXML_PREFIX}spreadsheetml.sheet`) return "xlsx"
  if (m === `${OOXML_PREFIX}presentationml.presentation`) return "pptx"
  return null
}

async function readEntryText(entry: ZipEntryInfo): Promise<string | null> {
  if (!entry.readText) return null
  if ((entry.uncompressedSize ?? 0) > ZIP_ENTRY_TEXT_MAX_BYTES) return null
  try {
    return await entry.readText()
  } catch {
    return null
  }
}

export async function inspectZipEntries(
  entries: readonly ZipEntryInfo[],
  declaredMimeType: string | null | undefined
): Promise<Finding[]> {
  const findings: Finding[] = []
  const paths = entries.map((e) => e.path)

  if (entries.length > ZIP_MAX_ENTRIES) {
    findings.push({
      code: "ZIP_TOO_MANY_ENTRIES",
      severity: "warning",
      detail: `${entries.length} entrées`,
    })
  }

  let compressed = 0
  let uncompressed = 0
  for (const entry of entries) {
    compressed += entry.compressedSize ?? 0
    uncompressed += entry.uncompressedSize ?? 0
    const normalized = entry.path.replace(/\\/g, "/")
    if (
      normalized.startsWith("/") ||
      /^[a-zA-Z]:/.test(normalized) ||
      normalized.split("/").includes("..")
    ) {
      findings.push({
        code: "ZIP_PATH_TRAVERSAL",
        severity: "critical",
        detail: entry.path,
      })
    }
    if (EXECUTABLE_EXTENSIONS.test(normalized)) {
      findings.push({
        code: "ZIP_EXECUTABLE_ENTRY",
        severity: "critical",
        detail: entry.path,
      })
    } else if (NESTED_ARCHIVE_EXTENSIONS.test(normalized)) {
      findings.push({
        code: "ZIP_NESTED_ARCHIVE",
        severity: "warning",
        detail: entry.path,
      })
    }
    if (/vbaProject\.bin$/i.test(normalized) || /vbaData\.xml$/i.test(normalized)) {
      findings.push({
        code: "OOXML_MACROS",
        severity: "critical",
        detail: entry.path,
      })
    }
    if (/\/embeddings\//i.test(normalized) || /oleObject\d*\.bin$/i.test(normalized)) {
      findings.push({
        code: "OOXML_EMBEDDED_OBJECT",
        severity: "warning",
        detail: entry.path,
      })
    }
    if (/\/activeX\//i.test(normalized)) {
      findings.push({
        code: "OOXML_ACTIVEX",
        severity: "warning",
        detail: entry.path,
      })
    }
    if (/^xl\/externalLinks\//i.test(normalized)) {
      findings.push({
        code: "OOXML_EXTERNAL_LINK",
        severity: "warning",
        detail: entry.path,
      })
    }
    if (/^Basic\//.test(normalized) || /^Scripts\//.test(normalized)) {
      findings.push({
        code: "ODF_MACROS",
        severity: "critical",
        detail: entry.path,
      })
    }
  }

  if (
    uncompressed > ZIP_BOMB_MIN_UNCOMPRESSED &&
    uncompressed / Math.max(compressed, 1) > ZIP_BOMB_RATIO
  ) {
    findings.push({
      code: "ZIP_BOMB",
      severity: "critical",
      detail: `${uncompressed} octets décompressés pour ${compressed} compressés`,
    })
  }

  const kind = ooxmlKindOf(paths)
  const declaredKind = declaredOoxmlKind(declaredMimeType)
  if (declaredKind && kind && declaredKind !== kind) {
    findings.push({
      code: "OOXML_KIND_MISMATCH",
      severity: "warning",
      detail: `déclaré ${declaredKind}, contenu ${kind}`,
    })
  }

  for (const entry of entries) {
    const normalized = entry.path.replace(/\\/g, "/")
    if (normalized === "[Content_Types].xml") {
      const text = await readEntryText(entry)
      if (text && /vbaProject|macroEnabled/i.test(text)) {
        findings.push({
          code: "OOXML_MACROS",
          severity: "critical",
          detail: "[Content_Types].xml déclare un projet VBA",
        })
      }
      continue
    }
    if (/\.rels$/i.test(normalized)) {
      const text = await readEntryText(entry)
      if (!text) continue
      const relations = text.match(/<Relationship\b[^>]*\/?>/g) ?? []
      for (const relation of relations) {
        if (!/TargetMode\s*=\s*"External"/i.test(relation)) continue
        if (/Type\s*=\s*"[^"]*\/hyperlink"/i.test(relation)) continue
        const target = /Target\s*=\s*"([^"]*)"/i.exec(relation)?.[1] ?? "?"
        findings.push({
          code: "OOXML_EXTERNAL_RELATIONSHIP",
          severity: "warning",
          detail: `${entry.path} → ${target.slice(0, 120)}`,
        })
      }
      continue
    }
    if (/^(word\/document\.xml|word\/settings\.xml|xl\/workbook\.xml)$/.test(normalized)) {
      const text = await readEntryText(entry)
      if (!text) continue
      if (/DDEAUTO\b/i.test(text) || /<w:instrText[^>]*>[^<]*\bDDE\b/i.test(text) || /w:instr\s*=\s*"[^"]*\bDDE\b/i.test(text)) {
        findings.push({
          code: "OOXML_DDE",
          severity: "critical",
          detail: entry.path,
        })
      }
      if (/\b(INCLUDEPICTURE|INCLUDETEXT)\b[^<]*https?:/i.test(text)) {
        findings.push({
          code: "OOXML_REMOTE_INCLUDE",
          severity: "warning",
          detail: entry.path,
        })
      }
      continue
    }
    if (normalized === "content.xml" || normalized === "settings.xml") {
      const text = await readEntryText(entry)
      if (text && /script:event-listener|<office:scripts>[^]*<script:/i.test(text)) {
        findings.push({
          code: "ODF_MACROS",
          severity: "critical",
          detail: entry.path,
        })
      }
      continue
    }
    if (normalized === "mimetype") {
      const text = await readEntryText(entry)
      const declared = normalizeMime(declaredMimeType)
      if (text && declared?.startsWith(ODF_PREFIX) && text.trim() !== declared) {
        findings.push({
          code: "ODF_KIND_MISMATCH",
          severity: "warning",
          detail: `déclaré ${declared}, contenu ${text.trim().slice(0, 80)}`,
        })
      }
    }
  }

  return dedupeFindings(findings)
}

// ─── OLE2 (doc / xls / ppt historiques) ──────────────────────────────────────

function utf16le(text: string): number[] {
  const out: number[] = []
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    out.push(code & 0xff, code >> 8)
  }
  return out
}

const OLE_MACRO_MARKERS = ["_VBA_PROJECT", "Macros", "VBA_PROJECT_CUR"].map(utf16le)
const OLE_PACKAGE_MARKER = utf16le("Ole10Native")

export function inspectOle2(bytes: Uint8Array): Finding[] {
  const findings: Finding[] = []
  if (OLE_MACRO_MARKERS.some((marker) => indexOfBytes(bytes, marker) >= 0)) {
    findings.push({
      code: "OLE_MACROS",
      severity: "critical",
      detail: "flux VBA présent dans le conteneur OLE2",
    })
  }
  if (indexOfBytes(bytes, OLE_PACKAGE_MARKER) >= 0) {
    findings.push({
      code: "OLE_EMBEDDED_PACKAGE",
      severity: "warning",
      detail: "objet Ole10Native embarqué",
    })
  }
  if (indexOfBytes(bytes, ascii("DDEAUTO")) >= 0 || indexOfBytes(bytes, utf16le("DDEAUTO")) >= 0) {
    findings.push({
      code: "OLE_DDE",
      severity: "critical",
      detail: "champ DDEAUTO",
    })
  }
  return findings
}

// ─── Photos : position GPS (SD-02) ──────────────────────────────────────────

/**
 * Le signal d'un JPEG qui porte encore sa position GPS (segment APP1, EXIF ou
 * XMP). Sévérité `info` : le verdict ne change pas (mode « signaler » du lot
 * SD-02, décision 8 du plan 02) — le refus viendra avec la chaîne des médias
 * du plan 03, une fois tous les clients passés au ré-encodage.
 */
export function inspectJpegMetadata(bytes: Uint8Array): Finding[] {
  return jpegHasGpsMetadata(bytes)
    ? [{ code: "IMAGE_GPS_METADATA", severity: "info", detail: "position GPS dans le segment APP1 (EXIF ou XMP)" }]
    : []
}

// ─── Nom de fichier ──────────────────────────────────────────────────────────

const DOCUMENT_EXTENSIONS = "pdf|docx?|xlsx?|pptx?|odt|ods|odp|jpe?g|png|gif|webp|heic|txt|md|csv|mp4|mp3|wav|m4a|webm|ogg"
const DOUBLE_EXTENSION = new RegExp(`\\.(${DOCUMENT_EXTENSIONS})\\.(exe|bat|cmd|com|scr|pif|js|jse|vbs|vbe|ps1|msi|jar|hta|lnk|dll|sh)$`, "i")

export function inspectFilename(filename: string | null | undefined): Finding[] {
  if (!filename) return []
  const findings: Finding[] = []
  const name = filename.trim()
  if (/[‪-‮⁦-⁩]/.test(name)) {
    findings.push({
      code: "FILENAME_BIDI_OVERRIDE",
      severity: "critical",
      detail: "caractère de renversement d'écriture (masque l'extension réelle)",
    })
  }
  if (DOUBLE_EXTENSION.test(name)) {
    findings.push({
      code: "FILENAME_DOUBLE_EXTENSION",
      severity: "critical",
      detail: name.slice(-40),
    })
  } else if (EXECUTABLE_EXTENSIONS.test(name)) {
    findings.push({
      code: "FILENAME_EXECUTABLE_EXTENSION",
      severity: "critical",
      detail: name.slice(-40),
    })
  }
  // eslint-disable-next-line no-control-regex
  if (/[ -]/.test(name)) {
    findings.push({ code: "FILENAME_CONTROL_CHARS", severity: "warning" })
  }
  return findings
}

// ─── Orchestration ───────────────────────────────────────────────────────────

function dedupeFindings(findings: readonly Finding[]): Finding[] {
  const seen = new Set<string>()
  const out: Finding[] = []
  for (const finding of findings) {
    const key = `${finding.code}|${finding.detail ?? ""}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(finding)
  }
  return out
}

/**
 * Toute l'inspection déterministe, dans l'ordre : type réel, contenu actif
 * par famille, nom. Ne lève jamais — un fichier qui fait échouer une
 * inspection est un signal, pas une exception.
 */
export async function runDeterministicInspection(
  input: InspectionInput
): Promise<InspectionReport> {
  const findings: Finding[] = []
  const { bytes } = input
  if (bytes.length === 0) {
    return {
      detectedMimeType: null,
      findings: [{ code: "EMPTY_FILE", severity: "warning" }],
    }
  }

  const detectedMimeType = sniffMime(bytes)
  const mismatch = mimeMismatchFinding(input.declaredMimeType, detectedMimeType)
  if (mismatch) findings.push(mismatch)

  const family = mimeFamily(detectedMimeType)
  try {
    if (family === "pdf") {
      findings.push(...inspectPdf(bytes))
    } else if (family === "zip") {
      if (input.zipEntries) {
        findings.push(...(await inspectZipEntries(input.zipEntries, input.declaredMimeType)))
      } else {
        findings.push({
          code: "ZIP_UNREADABLE",
          severity: "warning",
          detail: "archive impossible à lister",
        })
      }
    } else if (family === "ole2") {
      findings.push(...inspectOle2(bytes))
    } else if (family === "jpeg") {
      findings.push(...inspectJpegMetadata(bytes))
    }
  } catch (err) {
    findings.push({
      code: "INSPECTION_FAILED",
      severity: "warning",
      detail: err instanceof Error ? err.message.slice(0, 200) : String(err),
    })
  }

  findings.push(...inspectFilename(input.filename))
  return { detectedMimeType, findings: dedupeFindings(findings) }
}
