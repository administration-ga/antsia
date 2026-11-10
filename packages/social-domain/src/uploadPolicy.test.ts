// Dupliqué de socle/convex/tests/uploadPolicy.test.ts @ ad2e7fdc2 — adaptations : partie pure (`checkStoredUpload` au lieu du contexte stubbé, la lecture de `_storage` est testée côté backend) ; usages sociaux ; refus à code de règle ; `tryStoredUpload` retiré.
import { describe, expect, it } from "vitest"

import { AVATAR_MAX_BYTES, POST_IMAGE_MAX_BYTES, POST_VIDEO_MAX_BYTES } from "./content"
import { FILE_GUARD_MAX_INSPECT_BYTES } from "./filePolicy"
import { STORY_VIDEO_MAX_BYTES } from "./stories"
import { checkStoredUpload, isMimeAllowedForUsage, normalizeMimeType, normalizeSha256, SERVER_PRODUCED_UPLOAD_USAGES, UPLOAD_USAGE_NAMES, UPLOAD_USAGES } from "./uploadPolicy"
import { DomainViolation } from "./violation"

const STORAGE_ID = "kg2fake000000000000000000000"
const PNG_32 = { contentType: "image/png", size: 32_000, sha256: "a".repeat(64) }

function violationOf(run: () => unknown): DomainViolation | null {
  try {
    run()
  } catch (error) {
    if (error instanceof DomainViolation) return error
    throw error
  }
  return null
}

describe("normalizeSha256", () => {
  it("laisse passer l'hexadécimal et le met en minuscules", () => {
    expect(normalizeSha256("A".repeat(64))).toBe("a".repeat(64))
  })

  it("convertit la forme base64 native de Convex vers l'hexadécimal", () => {
    const base64 = btoa(String.fromCharCode(...new Uint8Array(32).fill(0xab)))
    expect(normalizeSha256(base64)).toBe("ab".repeat(32))
  })

  it("refuse une empreinte qui ne fait pas 32 octets, ou illisible", () => {
    expect(normalizeSha256(btoa("trop court"))).toBeNull()
    expect(normalizeSha256("%%%")).toBeNull()
  })
})

describe("normalizeMimeType", () => {
  it("retire les paramètres, met en minuscules, ramène image/jpg à image/jpeg", () => {
    expect(normalizeMimeType("Audio/WebM;codecs=opus")).toBe("audio/webm")
    expect(normalizeMimeType("image/jpg")).toBe("image/jpeg")
    expect(normalizeMimeType(" ")).toBeNull()
    expect(normalizeMimeType(undefined)).toBeNull()
  })
})

describe("checkStoredUpload — la liste blanche est attachée à l'USAGE", () => {
  it("accepte une image pour un avatar", () => {
    const result = checkStoredUpload({ storageId: STORAGE_ID, usage: "avatar" }, PNG_32)
    expect(result.mimeType).toBe("image/png")
    expect(result.sizeBytes).toBe(32_000)
  })

  it("refuse la MÊME image pour un usage qui ne l'admet pas", () => {
    expect(violationOf(() => checkStoredUpload({ storageId: STORAGE_ID, usage: "voice" }, PNG_32))?.code).toBe("UPLOAD_TYPE_NOT_ALLOWED")
  })

  it("refuse un exécutable annoncé comme une image", () => {
    const stored = { contentType: "application/x-msdownload", size: 4_000, sha256: "b".repeat(64) }
    expect(violationOf(() => checkStoredUpload({ storageId: STORAGE_ID, usage: "avatar", mimeType: "image/png" }, stored))?.code).toBe(
      "UPLOAD_TYPE_NOT_ALLOWED",
    )
  })
})

describe("checkStoredUpload — le stockage prime sur la déclaration", () => {
  it("refuse une taille déclarée qui ne correspond pas au fichier déposé", () => {
    const stored = { contentType: "image/png", size: 4_000_000, sha256: "c".repeat(64) }
    expect(violationOf(() => checkStoredUpload({ storageId: STORAGE_ID, usage: "avatar", sizeBytes: 12_000 }, stored))?.code).toBe("UPLOAD_MISMATCH")
  })

  it("refuse un type déclaré qui ne correspond pas au fichier déposé", () => {
    expect(violationOf(() => checkStoredUpload({ storageId: STORAGE_ID, usage: "avatar", mimeType: "image/jpeg" }, PNG_32))?.code).toBe("UPLOAD_MISMATCH")
  })

  it("refuse une empreinte déclarée qui ne correspond pas, ou illisible", () => {
    expect(violationOf(() => checkStoredUpload({ storageId: STORAGE_ID, usage: "avatar", sha256: "d".repeat(64) }, PNG_32))?.code).toBe("UPLOAD_MISMATCH")
    expect(violationOf(() => checkStoredUpload({ storageId: STORAGE_ID, usage: "avatar", sha256: "zz" }, PNG_32))?.code).toBe("UPLOAD_MISMATCH")
  })

  it("retourne les métadonnées RÉELLES, pas celles du client", () => {
    const result = checkStoredUpload({ storageId: STORAGE_ID, usage: "avatar", mimeType: "image/png", sizeBytes: 32_000, sha256: "A".repeat(64) }, PNG_32)
    expect(result).toEqual({ storageId: STORAGE_ID, mimeType: "image/png", sizeBytes: 32_000, sha256: "a".repeat(64) })
  })

  it("garde l'empreinte brute quand elle n'est pas normalisable", () => {
    expect(checkStoredUpload({ storageId: STORAGE_ID, usage: "avatar" }, { ...PNG_32, sha256: "brute" }).sha256).toBe("brute")
  })

  it("sans type au stockage, le type déclaré sert de repli ; sans aucun type, refus", () => {
    const untyped = { size: 1_000, sha256: "e".repeat(64) }
    expect(checkStoredUpload({ storageId: STORAGE_ID, usage: "avatar", mimeType: "image/png" }, untyped).mimeType).toBe("image/png")
    expect(violationOf(() => checkStoredUpload({ storageId: STORAGE_ID, usage: "avatar" }, untyped))?.code).toBe("UPLOAD_TYPE_NOT_ALLOWED")
  })
})

describe("checkStoredUpload — le plafond est celui de l'usage", () => {
  it("refuse au-dessus du plafond de l'usage, avec la borne en Mo", () => {
    const stored = { contentType: "image/png", size: UPLOAD_USAGES.avatar.maxBytes + 1, sha256: "f".repeat(64) }
    const violation = violationOf(() => checkStoredUpload({ storageId: STORAGE_ID, usage: "avatar" }, stored))
    expect(violation?.code).toBe("UPLOAD_SIZE_OUT_OF_RANGE")
    expect(violation?.params).toEqual({ maxMegabytes: 5 })
  })

  it("refuse un fichier vide", () => {
    const stored = { contentType: "image/png", size: 0, sha256: "f".repeat(64) }
    expect(violationOf(() => checkStoredUpload({ storageId: STORAGE_ID, usage: "avatar" }, stored))?.code).toBe("UPLOAD_SIZE_OUT_OF_RANGE")
  })

  it("accepte la même taille sous un usage au plafond plus haut", () => {
    const size = UPLOAD_USAGES.avatar.maxBytes + 1
    expect(checkStoredUpload({ storageId: STORAGE_ID, usage: "media_social" }, { contentType: "image/png", size, sha256: "f".repeat(64) }).sizeBytes).toBe(size)
  })
})

describe("registre des usages", () => {
  it("n'expose aucune liste blanche vide ni plafond nul", () => {
    for (const usage of UPLOAD_USAGE_NAMES) {
      expect(UPLOAD_USAGES[usage].mimeTypes.length, `${usage} sans type autorisé`).toBeGreaterThan(0)
      expect(UPLOAD_USAGES[usage].maxBytes, `${usage} sans plafond`).toBeGreaterThan(0)
    }
  })

  it("n'autorise nulle part un type exécutable ou de script", () => {
    // Liste noire employée ICI seulement, en contrôle du registre.
    const interdits = ["application/x-msdownload", "application/x-sh", "application/javascript", "text/html", "image/svg+xml"]
    for (const usage of UPLOAD_USAGE_NAMES) {
      for (const mime of interdits) expect(isMimeAllowedForUsage(usage, mime), `${usage} autorise ${mime}`).toBe(false)
    }
  })

  it("les médias sociaux admettent le GIF (D36)", () => {
    expect(isMimeAllowedForUsage("media_social", "image/gif")).toBe(true)
    expect(isMimeAllowedForUsage("avatar", "image/gif")).toBe(false)
  })

  it("les usages des publications, stories et avatars suivent les bornes du domaine (une seule source)", () => {
    expect(UPLOAD_USAGES.media_social.maxBytes).toBe(Math.max(POST_IMAGE_MAX_BYTES, POST_VIDEO_MAX_BYTES))
    // SD-03 : le .mov n'entre plus à l'envoi d'une publication (le composeur le convertit).
    expect(isMimeAllowedForUsage("media_social", "video/quicktime")).toBe(false)
    expect(isMimeAllowedForUsage("media_social", "video/mp4")).toBe(true)
    expect(isMimeAllowedForUsage("media_social", "video/webm")).toBe(true)
    expect(isMimeAllowedForUsage("media_social", "application/pdf")).toBe(false)
    expect(UPLOAD_USAGES.story_media.maxBytes).toBe(STORY_VIDEO_MAX_BYTES)
    expect(isMimeAllowedForUsage("story_media", "video/quicktime")).toBe(false)
    expect(UPLOAD_USAGES.avatar.maxBytes).toBe(AVATAR_MAX_BYTES)
  })

  it("EX-17 — aucun usage de membre ne dépasse le plafond d'analyse de la garde ; seul le serveur va au-delà", () => {
    const serverProduced: readonly string[] = SERVER_PRODUCED_UPLOAD_USAGES
    for (const usage of UPLOAD_USAGE_NAMES) {
      if (serverProduced.includes(usage)) continue
      expect(UPLOAD_USAGES[usage].maxBytes, `${usage} dépasse le plafond d'analyse`).toBeLessThanOrEqual(FILE_GUARD_MAX_INSPECT_BYTES)
    }
    // L'exception est nommée, et elle est réelle : sans elle, la liste serait vide de sens.
    expect(serverProduced).toEqual(["live_recording"])
    expect(UPLOAD_USAGES.live_recording.maxBytes).toBeGreaterThan(FILE_GUARD_MAX_INSPECT_BYTES)
  })

  it("EX-17 — la vidéo de publication est bornée à 60 Mio, et le dépôt d'un média social avec elle", () => {
    expect(POST_VIDEO_MAX_BYTES).toBe(60 * 1024 * 1024)
    expect(UPLOAD_USAGES.media_social.maxBytes).toBe(FILE_GUARD_MAX_INSPECT_BYTES)
    const over = { contentType: "video/mp4", size: FILE_GUARD_MAX_INSPECT_BYTES + 1, sha256: "f".repeat(64) }
    expect(violationOf(() => checkStoredUpload({ storageId: STORAGE_ID, usage: "media_social" }, over))).toMatchObject({ code: "UPLOAD_SIZE_OUT_OF_RANGE", params: { maxMegabytes: 60 } })
    expect(checkStoredUpload({ storageId: STORAGE_ID, usage: "media_social" }, { ...over, size: FILE_GUARD_MAX_INSPECT_BYTES }).sizeBytes).toBe(FILE_GUARD_MAX_INSPECT_BYTES)
  })
})
