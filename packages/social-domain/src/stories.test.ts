// Dupliqué de socle/convex/modules/reseauPersonnel/stories.domain.test.ts @ ad2e7fdc2 — adaptations : cas des surfaces `reseau`/`icom` retirés avec elles (une seule borne vidéo, la plus stricte) ; phrases de refus remplacées par le code et les bornes de la violation ; cas de `assertPageAudienceShape` déplacés dans content.test.ts.
/**
 * Domaine pur des STORIES — bornes, forme du média, et LA garde de visibilité.
 */
import { describe, expect, it } from "vitest"

import { POST_IMAGE_MAX_BYTES, POST_VIDEO_MIME_TYPES, POST_VIDEO_UPLOAD_MIME_TYPES } from "./content"
import {
  assertStoryCaption,
  assertStoryMedia,
  isStoryExpired,
  isStoryVisibleTo,
  STORY_ACTIVE_PER_AUTHOR_MAX,
  STORY_CAPTION_MAX_LENGTH,
  STORY_IMAGE_MAX_BYTES,
  STORY_TTL_MS,
  STORY_VIDEO_LIMITS,
  STORY_VIDEO_MAX_BYTES,
  STORY_VIDEO_MAX_DURATION_MS,
  STORY_VIDEO_MIME_TYPES,
  storyExpiresAt,
} from "./stories"
import { DomainViolation } from "./violation"

const IMAGE = { kind: "image" as const, mimeType: "image/jpeg", sizeBytes: 1_000 }
const VIDEO = { kind: "video" as const, mimeType: "video/mp4", sizeBytes: 1_000 }

function violationOf(run: () => unknown): DomainViolation | null {
  try {
    run()
    return null
  } catch (error) {
    return error instanceof DomainViolation ? error : null
  }
}

describe("bornes des stories", () => {
  it("expire à vingt-quatre heures, jamais autrement", () => {
    expect(STORY_TTL_MS).toBe(24 * 60 * 60 * 1000)
    expect(storyExpiresAt(1_000)).toBe(1_000 + STORY_TTL_MS)
  })

  it("expire à l'instant PILE — une seconde de grâce serait une règle de plus", () => {
    const expiresAt = storyExpiresAt(10_000)
    expect(isStoryExpired(expiresAt, expiresAt - 1)).toBe(false)
    expect(isStoryExpired(expiresAt, expiresAt)).toBe(true)
    expect(isStoryExpired(expiresAt, expiresAt + 1)).toBe(true)
  })

  it("garde la borne d'image alignée sur celle des publications", () => {
    expect(STORY_IMAGE_MAX_BYTES).toBe(POST_IMAGE_MAX_BYTES)
  })

  it("borne la vidéo à la limite la plus stricte du socle : 50 Mo, 5 minutes", () => {
    expect(STORY_VIDEO_LIMITS).toEqual({ maxBytes: 50 * 1024 * 1024, maxDurationMs: 5 * 60 * 1000 })
    expect(STORY_VIDEO_MAX_BYTES).toBe(STORY_VIDEO_LIMITS.maxBytes)
    expect(STORY_VIDEO_MAX_DURATION_MS).toBe(STORY_VIDEO_LIMITS.maxDurationMs)
  })

  it("plafonne les stories vivantes d'une personne", () => {
    expect(STORY_ACTIVE_PER_AUTHOR_MAX).toBe(20)
  })
})

describe("assertStoryMedia", () => {
  it("accepte une image et une vidéo aux formats du fil", () => {
    expect(() => assertStoryMedia(IMAGE)).not.toThrow()
    expect(() => assertStoryMedia(VIDEO)).not.toThrow()
  })

  it("refuse un format inconnu", () => {
    expect(() => assertStoryMedia({ ...IMAGE, mimeType: "application/pdf" })).toThrow(DomainViolation)
  })

  it("refuse une image trop lourde et une taille nulle", () => {
    const tooHeavy = violationOf(() => assertStoryMedia({ ...IMAGE, sizeBytes: STORY_IMAGE_MAX_BYTES + 1 }))
    expect(tooHeavy?.code).toBe("STORY_MEDIA_TOO_LARGE")
    expect(tooHeavy?.params).toEqual({ maxMegabytes: 20 })
    expect(() => assertStoryMedia({ ...IMAGE, sizeBytes: 0 })).toThrow(DomainViolation)
  })

  it("borne la vidéo en poids et en durée", () => {
    const { maxBytes, maxDurationMs } = STORY_VIDEO_LIMITS
    expect(() => assertStoryMedia({ ...VIDEO, sizeBytes: maxBytes, durationMs: maxDurationMs })).not.toThrow()
    const heavy = violationOf(() => assertStoryMedia({ ...VIDEO, sizeBytes: maxBytes + 1 }))
    expect(heavy?.code).toBe("STORY_MEDIA_TOO_LARGE")
    expect(heavy?.params).toEqual({ maxMegabytes: 50 })
    const long = violationOf(() => assertStoryMedia({ ...VIDEO, durationMs: maxDurationMs + 1 }))
    expect(long?.code).toBe("STORY_VIDEO_TOO_LONG")
    expect(long?.params).toEqual({ maxMinutes: 5 })
  })

  it("accepte une vidéo sans durée déclarée — le stockage ne la connaît pas", () => {
    expect(() => assertStoryMedia({ ...VIDEO, durationMs: undefined })).not.toThrow()
  })

  it("n'applique la borne de durée qu'aux vidéos", () => {
    expect(() => assertStoryMedia({ ...IMAGE, durationMs: 10 * 60 * 1000 })).not.toThrow()
  })
})

describe("assertStoryCaption", () => {
  it("rend la légende nettoyée", () => {
    expect(assertStoryCaption("  Conseil des ministres  ")).toBe("Conseil des ministres")
  })

  it("rend `undefined` pour une légende absente ou blanche", () => {
    expect(assertStoryCaption(undefined)).toBeUndefined()
    expect(assertStoryCaption("   ")).toBeUndefined()
  })

  it("refuse au-delà de deux cents caractères", () => {
    expect(() => assertStoryCaption("a".repeat(STORY_CAPTION_MAX_LENGTH))).not.toThrow()
    expect(() => assertStoryCaption("a".repeat(STORY_CAPTION_MAX_LENGTH + 1))).toThrow(DomainViolation)
  })
})

describe("isStoryVisibleTo", () => {
  const base = {
    audience: "public" as const,
    isAuthor: false,
    isConnected: false,
    isBlockedWithAuthor: false,
    isRemoved: false,
    isExpired: false,
  }

  it("ouvre une story publique à tout membre", () => {
    expect(isStoryVisibleTo(base)).toBe(true)
  })

  it("réserve `connections` aux connexions acceptées", () => {
    expect(isStoryVisibleTo({ ...base, audience: "connections" })).toBe(false)
    expect(isStoryVisibleTo({ ...base, audience: "connections", isConnected: true })).toBe(true)
  })

  it("laisse un abonnement sans effet — suivre n'est pas être connecté", () => {
    // Il n'y a délibérément PAS d'entrée `isFollowing`.
    expect(Object.keys(base)).not.toContain("isFollowing")
  })

  it("ferme une story publique quand il y a blocage", () => {
    expect(isStoryVisibleTo({ ...base, isBlockedWithAuthor: true })).toBe(false)
  })

  it("ferme une story expirée ou retirée pour les autres", () => {
    expect(isStoryVisibleTo({ ...base, isExpired: true })).toBe(false)
    expect(isStoryVisibleTo({ ...base, isRemoved: true })).toBe(false)
  })

  it("laisse l'auteur voir sa story expirée, retirée, ou les deux", () => {
    expect(isStoryVisibleTo({ ...base, isAuthor: true, isExpired: true, isRemoved: true })).toBe(true)
  })

  it("laisse l'auteur voir sa story même bloqué avec le lecteur — c'est lui-même", () => {
    expect(isStoryVisibleTo({ ...base, isAuthor: true, isBlockedWithAuthor: true })).toBe(true)
  })
})

describe("STORY_VIDEO_MIME_TYPES — la garantie « lisible partout »", () => {
  it("MP4 et WebM seulement — depuis SD-03, la même liste pour une NOUVELLE publication ; le .mov ancien reste porté", () => {
    expect([...STORY_VIDEO_MIME_TYPES]).toEqual(["video/mp4", "video/webm"])
    expect([...POST_VIDEO_UPLOAD_MIME_TYPES]).toEqual([...STORY_VIDEO_MIME_TYPES])
    expect([...POST_VIDEO_MIME_TYPES]).toContain("video/quicktime")
  })

  it("assertStoryMedia refuse une vidéo QuickTime (l'écran explique la conversion)", () => {
    expect(violationOf(() => assertStoryMedia({ kind: "video", mimeType: "video/quicktime", sizeBytes: 1_000 }))?.code).toBe(
      "STORY_MEDIA_MIME_INVALID",
    )
  })

  it("assertStoryMedia accepte MP4 et WebM", () => {
    for (const mimeType of STORY_VIDEO_MIME_TYPES) {
      expect(() => assertStoryMedia({ kind: "video", mimeType, sizeBytes: 1_000 })).not.toThrow()
    }
  })
})
