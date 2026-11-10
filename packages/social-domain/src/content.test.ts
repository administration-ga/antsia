// Dupliqué de socle/convex/modules/reseauPersonnel/domain.test.ts (l. 64-643 et 733-738 ; plus stories.domain.test.ts, l. 286-345) @ ad2e7fdc2 — adaptations : `ReseauPersonnelViolation` → `DomainViolation` (codes au lieu des phrases) ; cas de l'audience « organisation » et de la portée « mon_administration » retirés avec elles ; le test d'alignement avec le validateur Convex passe côté backend (PA3) ; la forme d'une publication de page n'admet que `public`.
/**
 * Domaine pur des publications — LE test qui tient la règle de fond : un abonné
 * n'est pas une connexion.
 */
import { describe, expect, it } from "vitest"

import {
  addedMentionedIds,
  assertAvatarUpload,
  assertDisplayName,
  assertGroupAudienceShape,
  assertPostReach,
  assertHandle,
  assertHeadline,
  assertPageAudienceShape,
  assertPersonalCommentBody,
  assertPersonalPostBody,
  assertPostContent,
  assertPostMedia,
  assertPostVideoDuration,
  assertShareable,
  FEED_SCOPE_DEFAULT,
  FEED_SCOPES,
  feedAdmissionFor,
  feedReasonFor,
  groupViewingReasonFor,
  isPersonalPostVisibleTo,
  isPersonalReactionKind,
  isProfileDiscoverable,
  isProfilePublished,
  normalizeFeedLanes,
  normalizeHandle,
  PERSONAL_COMMENT_MAX_LENGTH,
  PERSONAL_POST_AUDIENCES,
  PERSONAL_POST_MAX_LENGTH,
  PERSONAL_REACH_AUDIENCES,
  PERSONAL_REACTION_KINDS,
  POST_IMAGE_MAX_BYTES,
  POST_VIDEO_MAX_BYTES,
  POST_VIDEO_MAX_DURATION_MS,
  POST_VIDEO_MIME_TYPES,
  POST_VIDEO_UPLOAD_MIME_TYPES,
} from "./content"
import { STORY_VIDEO_LIMITS } from "./stories"
import { DomainViolation } from "./violation"

function violationOf(run: () => unknown): DomainViolation | null {
  try {
    run()
    return null
  } catch (error) {
    return error instanceof DomainViolation ? error : null
  }
}

describe("visibilité d'une publication, par audience", () => {
  const base = {
    audience: "connections" as const,
    status: "published" as const,
    isAuthor: false,
    isConnected: false,
    isGroupMember: false,
    isBlockedWithAuthor: false,
    isPageAudience: false,
  }

  it("le public est lisible sans aucun lien", () => {
    expect(isPersonalPostVisibleTo({ ...base, audience: "public" })).toBe(true)
  })

  it("l'audience `connections` exige une connexion ACCEPTÉE", () => {
    expect(isPersonalPostVisibleTo(base)).toBe(false)
    expect(isPersonalPostVisibleTo({ ...base, isConnected: true })).toBe(true)
  })

  it("une publication retirée ne reste lisible que par son auteur", () => {
    const removed = { ...base, status: "removed" as const, audience: "public" as const }
    expect(isPersonalPostVisibleTo(removed)).toBe(false)
    expect(isPersonalPostVisibleTo({ ...removed, isConnected: true })).toBe(false)
    expect(isPersonalPostVisibleTo({ ...removed, isAuthor: true })).toBe(true)
  })

  it("l'auteur voit toujours la sienne", () => {
    expect(isPersonalPostVisibleTo({ ...base, isAuthor: true })).toBe(true)
  })

  describe("audience `group`", () => {
    const groupPost = { ...base, audience: "group" as const }

    it("réservée aux membres vivants — ni le public, ni une connexion", () => {
      expect(isPersonalPostVisibleTo(groupPost)).toBe(false)
      // ⚠️ LA garde à ne pas relâcher : être CONNECTÉ à l'auteur n'ouvre pas son groupe.
      expect(isPersonalPostVisibleTo({ ...groupPost, isConnected: true })).toBe(false)
      expect(isPersonalPostVisibleTo({ ...groupPost, isGroupMember: true })).toBe(true)
    })

    it("un blocage ferme la publication même entre co-membres", () => {
      expect(isPersonalPostVisibleTo({ ...groupPost, isGroupMember: true, isBlockedWithAuthor: true })).toBe(false)
    })

    it("l'auteur voit la sienne, retirée comprise", () => {
      expect(isPersonalPostVisibleTo({ ...groupPost, isAuthor: true })).toBe(true)
      expect(isPersonalPostVisibleTo({ ...groupPost, status: "removed", isAuthor: true })).toBe(true)
    })
  })

  describe("audience `followers` (la note aux abonnés d'une page)", () => {
    const note = { ...base, audience: "followers" as const }

    it("réservée aux abonnés et signataires vivants de la page — ni le public, ni une connexion, ni un groupe", () => {
      expect(isPersonalPostVisibleTo(note)).toBe(false)
      expect(isPersonalPostVisibleTo({ ...note, isConnected: true })).toBe(false)
      expect(isPersonalPostVisibleTo({ ...note, isGroupMember: true })).toBe(false)
      expect(isPersonalPostVisibleTo({ ...note, isPageAudience: true })).toBe(true)
    })

    it("retirée, elle ne s'ouvre plus à ses abonnés", () => {
      expect(isPersonalPostVisibleTo({ ...note, status: "removed", isPageAudience: true })).toBe(false)
    })
  })
})

describe("un abonnement n'ouvre jamais le cercle des connexions", () => {
  // LE test de la règle : si celui-ci tombe, quelqu'un a écrit `isConnected || isFollowing`.
  it("un abonné n'entre pas dans une publication réservée aux connexions", () => {
    expect(feedReasonFor({ isAuthor: false, isConnected: false, isFollowing: true, audience: "connections" })).toBeNull()
  })

  it("un abonné entre dans le public", () => {
    expect(feedReasonFor({ isAuthor: false, isConnected: false, isFollowing: true, audience: "public" })).toBe("follow")
  })

  it("le titre d'entrée le plus fort gagne", () => {
    const all = { isConnected: true, isFollowing: true, audience: "public" as const }
    expect(feedReasonFor({ ...all, isAuthor: true })).toBe("own")
    expect(feedReasonFor({ ...all, isAuthor: false })).toBe("connection")
  })

  it("sans aucun lien, rien n'entre — même du public", () => {
    expect(feedReasonFor({ isAuthor: false, isConnected: false, isFollowing: false, audience: "public" })).toBeNull()
  })
})

describe("bornes de saisie", () => {
  it("refuse une publication vide ou trop longue", () => {
    expect(() => assertPersonalPostBody("   ")).toThrow(DomainViolation)
    expect(() => assertPersonalPostBody("a".repeat(PERSONAL_POST_MAX_LENGTH + 1))).toThrow(DomainViolation)
    expect(assertPersonalPostBody("  bonjour  ")).toBe("bonjour")
  })

  it("un commentaire est plus court qu'une publication", () => {
    expect(PERSONAL_COMMENT_MAX_LENGTH).toBeLessThan(PERSONAL_POST_MAX_LENGTH)
    expect(() => assertPersonalCommentBody("a".repeat(PERSONAL_COMMENT_MAX_LENGTH + 1))).toThrow(DomainViolation)
  })

  it("le nom affiché est borné et rogné, jamais vide", () => {
    expect(assertDisplayName("  Lynda Onanga ")).toBe("Lynda Onanga")
    expect(() => assertDisplayName("   ")).toThrow(DomainViolation)
    expect(violationOf(() => assertDisplayName("x".repeat(121)))?.params).toEqual({ min: 1, max: 120 })
  })

  it("une accroche vide vaut absence, pas chaîne vide", () => {
    expect(assertHeadline("   ")).toBeUndefined()
    expect(assertHeadline(undefined)).toBeUndefined()
    expect(assertHeadline(" Chargée d'études ")).toBe("Chargée d'études")
  })

  it("une violation porte un code de règle et ses bornes, jamais du texte ni la valeur saisie", () => {
    const violation = violationOf(() => assertPersonalPostBody("a".repeat(PERSONAL_POST_MAX_LENGTH + 1)))
    expect(violation?.code).toBe("POST_TOO_LONG")
    expect(violation?.params).toEqual({ max: PERSONAL_POST_MAX_LENGTH })
    expect(violation?.message).toBe("POST_TOO_LONG")
  })
})

describe("handle — une adresse, pas un nom", () => {
  it("normalise la casse et les espaces", () => {
    expect(normalizeHandle("  A.Ndong  ")).toBe("a.ndong")
    expect(assertHandle("A.Ndong")).toBe("a.ndong")
  })

  it("refuse les longueurs hors bornes", () => {
    expect(() => assertHandle("ab")).toThrow(DomainViolation)
    expect(() => assertHandle("a".repeat(31))).toThrow(DomainViolation)
  })

  it("refuse ce qui n'est pas une adresse", () => {
    // Les homoglyphes Unicode fabriquent des adresses qui se ressemblent sans
    // être les mêmes : le jeu de caractères reste ASCII.
    expect(() => assertHandle("a ndong")).toThrow(DomainViolation)
    expect(() => assertHandle("ndоng")).toThrow(DomainViolation) // « о » cyrillique
    expect(() => assertHandle(".ndong")).toThrow(DomainViolation)
    expect(() => assertHandle("ndong.")).toThrow(DomainViolation)
    expect(assertHandle("a_n-d.o1")).toBe("a_n-d.o1")
  })
})

describe("profil publié, profil découvrable", () => {
  it("publié tant qu'il n'est pas retiré ; découvrable s'il est aussi non privé", () => {
    expect(isProfilePublished({})).toBe(true)
    expect(isProfilePublished({ withdrawnAt: 1 })).toBe(false)
    expect(isProfileDiscoverable({})).toBe(true)
    expect(isProfileDiscoverable({ privateAt: 1 })).toBe(false)
    expect(isProfileDiscoverable({ withdrawnAt: 1 })).toBe(false)
  })
})

describe("réactions", () => {
  it("reconnaît les genres du domaine, et eux seuls", () => {
    for (const kind of PERSONAL_REACTION_KINDS) expect(isPersonalReactionKind(kind)).toBe(true)
    expect(isPersonalReactionKind("colere")).toBe(false)
  })
})

describe("médias", () => {
  const image = { kind: "image" as const, mimeType: "image/png", sizeBytes: 1000 }
  const video = { kind: "video" as const, mimeType: "video/mp4", sizeBytes: 1000 }

  it("accepte jusqu'à quatre images", () => {
    expect(() => assertPostMedia([image, image, image, image])).not.toThrow()
    expect(() => assertPostMedia([image, image, image, image, image])).toThrow(DomainViolation)
  })

  it("une vidéo est SEULE dans sa publication", () => {
    expect(() => assertPostMedia([video])).not.toThrow()
    expect(() => assertPostMedia([video, image])).toThrow(DomainViolation)
    expect(() => assertPostMedia([video, video])).toThrow(DomainViolation)
  })

  it("refuse un type qui n'est pas celui annoncé", () => {
    expect(() => assertPostMedia([{ ...image, mimeType: "text/plain" }])).toThrow(DomainViolation)
    // Une image envoyée sous le genre « vidéo » ne passe pas davantage.
    expect(() => assertPostMedia([{ ...video, mimeType: "image/png" }])).toThrow(DomainViolation)
  })

  it("refuse au-delà des bornes de poids", () => {
    expect(() => assertPostMedia([{ ...image, sizeBytes: POST_IMAGE_MAX_BYTES + 1 }])).toThrow(DomainViolation)
    expect(() => assertPostMedia([{ ...image, sizeBytes: 0 }])).toThrow(DomainViolation)
    expect(violationOf(() => assertPostMedia([{ ...image, sizeBytes: POST_IMAGE_MAX_BYTES + 1 }]))?.params).toEqual({ maxMegabytes: 20 })
  })

  it("EX-17 — une vidéo de publication va jusqu'à 60 Mio, pas un octet de plus", () => {
    expect(() => assertPostMedia([{ ...video, sizeBytes: POST_VIDEO_MAX_BYTES }])).not.toThrow()
    expect(violationOf(() => assertPostMedia([{ ...video, sizeBytes: POST_VIDEO_MAX_BYTES + 1 }]))).toMatchObject({ code: "POST_MEDIA_TOO_LARGE", params: { maxMegabytes: 60 } })
    expect(() => assertPostMedia([{ ...video, sizeBytes: 100 * 1024 * 1024 }])).toThrow(DomainViolation)
  })

  it("borne le texte alternatif", () => {
    expect(() => assertPostMedia([{ ...image, altText: "a".repeat(301) }])).toThrow(DomainViolation)
  })
})

describe("SD-03 — une vidéo de publication se lit partout et sa durée déclarée est bornée", () => {
  const video = { kind: "video" as const, mimeType: "video/mp4", sizeBytes: 1000 }

  it("une NOUVELLE vidéo est MP4 ou WebM ; le .mov de l'iPhone ne passe plus, mais reste porté par les lignes anciennes", () => {
    expect([...POST_VIDEO_UPLOAD_MIME_TYPES]).toEqual(["video/mp4", "video/webm"])
    expect([...POST_VIDEO_MIME_TYPES]).toEqual(["video/mp4", "video/webm", "video/quicktime"])
    expect(() => assertPostMedia([video])).not.toThrow()
    expect(() => assertPostMedia([{ ...video, mimeType: "video/webm" }])).not.toThrow()
    expect(violationOf(() => assertPostMedia([{ ...video, mimeType: "video/quicktime" }]))?.code).toBe("POST_MEDIA_MIME_INVALID")
  })

  it("la borne de durée reprend celle des Stories — cinq minutes", () => {
    expect(POST_VIDEO_MAX_DURATION_MS).toBe(5 * 60_000)
    expect(POST_VIDEO_MAX_DURATION_MS).toBe(STORY_VIDEO_LIMITS.maxDurationMs)
  })

  it("accepte une durée dans la borne, la borne comprise", () => {
    expect(() => assertPostVideoDuration([{ ...video, durationMs: 12_401 }])).not.toThrow()
    expect(() => assertPostVideoDuration([{ ...video, durationMs: POST_VIDEO_MAX_DURATION_MS }])).not.toThrow()
  })

  it("refuse au-delà, en nommant la borne", () => {
    expect(violationOf(() => assertPostVideoDuration([{ ...video, durationMs: POST_VIDEO_MAX_DURATION_MS + 1 }]))).toMatchObject({
      code: "POST_VIDEO_TOO_LONG",
      params: { maxMinutes: 5 },
    })
  })

  it("une durée ABSENTE passe : un front ancien n'en déclare aucune, le poids reste la borne relue", () => {
    expect(() => assertPostVideoDuration([video])).not.toThrow()
    expect(() => assertPostVideoDuration([])).not.toThrow()
  })

  it("une durée négative ou illisible ne se tient pas pour une durée dans la borne", () => {
    for (const durationMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(violationOf(() => assertPostVideoDuration([{ ...video, durationMs }]))?.code).toBe("POST_VIDEO_TOO_LONG")
    }
  })

  it("une image ne porte pas de durée à juger", () => {
    expect(() => assertPostVideoDuration([{ kind: "image", durationMs: POST_VIDEO_MAX_DURATION_MS * 10 }])).not.toThrow()
  })
})

describe("contenu d'une publication, dans son ensemble", () => {
  it("une photo sans légende est une publication légitime", () => {
    expect(assertPostContent({ body: "  ", mediaCount: 1, isShare: false })).toBe("")
  })

  it("un partage sans mot en est une aussi", () => {
    expect(assertPostContent({ body: "", mediaCount: 0, isShare: true })).toBe("")
  })

  it("mais un texte vide sans rien d'autre n'en est pas une", () => {
    expect(() => assertPostContent({ body: "   ", mediaCount: 0, isShare: false })).toThrow(DomainViolation)
  })

  it("un partage n'embarque JAMAIS ses propres médias", () => {
    expect(() => assertPostContent({ body: "mon avis", mediaCount: 1, isShare: true })).toThrow(DomainViolation)
  })
})

describe("partage", () => {
  it("seule une publication ouverte à tous les membres se partage", () => {
    expect(() => assertShareable({ audience: "public", status: "published" })).not.toThrow()
    expect(() => assertShareable({ audience: "connections", status: "published" })).toThrow(DomainViolation)
    expect(() => assertShareable({ audience: "public", status: "removed" })).toThrow(DomainViolation)
  })

  it("une publication de groupe ne se partage jamais", () => {
    expect(() => assertShareable({ audience: "group", status: "published" })).toThrow(DomainViolation)
  })
})

describe("photo de profil", () => {
  it("accepte JPEG, PNG et WebP sous 5 Mo", () => {
    expect(() => assertAvatarUpload({ mimeType: "image/png", sizeBytes: 1000 })).not.toThrow()
    expect(() => assertAvatarUpload({ mimeType: "image/gif", sizeBytes: 1000 })).toThrow(DomainViolation)
    expect(() => assertAvatarUpload({ mimeType: "image/png", sizeBytes: 6 * 1024 * 1024 })).toThrow(DomainViolation)
  })
})

describe("feedAdmissionFor — la garde d'audience ne se relâche jamais", () => {
  const AUCUN_LIEN = { isAuthor: false, isConnected: false, isFollowing: false } as const

  it("REFUSE une publication `connections` à qui n'est pas connecté — dans TOUTES les portées", () => {
    for (const scope of FEED_SCOPES) {
      expect(feedAdmissionFor({ ...AUCUN_LIEN, scope, isFollowing: true, audience: "connections" })).toBeNull()
    }
  })

  it("REFUSE une publication de GROUPE dans toutes les portées — l'auteur compris", () => {
    for (const scope of FEED_SCOPES) {
      expect(feedAdmissionFor({ isAuthor: true, isConnected: true, isFollowing: true, scope, audience: "group" })).toBeNull()
    }
  })

  it("laisse passer une `connections` à une connexion acceptée", () => {
    for (const scope of FEED_SCOPES) {
      expect(feedAdmissionFor({ ...AUCUN_LIEN, scope, isConnected: true, audience: "connections" })).toBe("connection")
    }
  })

  it("laisse toujours passer l'auteur sur ses propres publications", () => {
    for (const scope of FEED_SCOPES) {
      expect(feedAdmissionFor({ ...AUCUN_LIEN, scope, isAuthor: true, audience: "connections" })).toBe("own")
    }
  })

  it("« Pour vous » rend EXACTEMENT ce que rend feedReasonFor", () => {
    for (const isAuthor of [false, true]) {
      for (const isConnected of [false, true]) {
        for (const isFollowing of [false, true]) {
          for (const audience of ["public", "connections"] as const) {
            const input = { isAuthor, isConnected, isFollowing, audience }
            expect(feedAdmissionFor({ ...input, scope: "pour_vous" })).toBe(feedReasonFor(input))
          }
        }
      }
    }
  })

  it("« Récents » ouvre le public d'un inconnu, là où « Pour vous » le refuse", () => {
    const inconnu = { ...AUCUN_LIEN, audience: "public" } as const
    expect(feedAdmissionFor({ ...inconnu, scope: "pour_vous" })).toBeNull()
    expect(feedAdmissionFor({ ...inconnu, scope: "recents" })).toBe("public")
  })

  it("déclare EXACTEMENT deux portées, et « pour_vous » par défaut", () => {
    expect([...FEED_SCOPES]).toEqual(["pour_vous", "recents"])
    expect(FEED_SCOPE_DEFAULT).toBe("pour_vous")
  })
})

describe("audiences — le vocabulaire reste séparé", () => {
  it("la PORTÉE ne connaît ni `group` ni `followers`, les PUBLICATIONS si (`followers` pour les pages seules)", () => {
    expect([...PERSONAL_REACH_AUDIENCES]).toEqual(["public", "connections"])
    expect([...PERSONAL_POST_AUDIENCES]).toEqual(["public", "connections", "group", "followers"])
  })
})

describe("invariant de forme d'une publication de groupe", () => {
  it("groupId présent SI ET SEULEMENT SI audience `group`", () => {
    expect(() => assertGroupAudienceShape({ audience: "group", hasGroup: true })).not.toThrow()
    expect(() => assertGroupAudienceShape({ audience: "public", hasGroup: false })).not.toThrow()
    expect(() => assertGroupAudienceShape({ audience: "group", hasGroup: false })).toThrow(DomainViolation)
    expect(() => assertGroupAudienceShape({ audience: "connections", hasGroup: true })).toThrow(DomainViolation)
  })
})

describe("titre de lecture d'une publication de groupe", () => {
  it("la sienne ou celle d'un membre — jamais un lien maquillé", () => {
    expect(groupViewingReasonFor({ isAuthor: true })).toBe("own")
    expect(groupViewingReasonFor({ isAuthor: false })).toBe("group")
  })
})

describe("assertPageAudienceShape", () => {
  const page = { audience: "public" as const, hasPage: true, hasGroup: false, hasShare: false }

  it("accepte une publication de page publique, hors groupe, hors partage", () => {
    expect(() => assertPageAudienceShape(page)).not.toThrow()
  })

  it("n'impose rien à une publication SANS page — sauf l'audience des abonnés, qui n'appartient qu'aux pages", () => {
    expect(() => assertPageAudienceShape({ audience: "connections", hasPage: false, hasGroup: false, hasShare: true })).not.toThrow()
    expect(violationOf(() => assertPageAudienceShape({ audience: "followers", hasPage: false, hasGroup: false, hasShare: false }))?.code).toBe("POST_FOLLOWERS_REQUIRES_PAGE")
  })

  it("accepte la note aux abonnés d'une page", () => {
    expect(() => assertPageAudienceShape({ ...page, audience: "followers" })).not.toThrow()
  })

  it("refuse une page qui publierait pour ses connexions, ou dans un groupe par l'audience", () => {
    expect(violationOf(() => assertPageAudienceShape({ ...page, audience: "group" }))?.code).toBe("PAGE_POST_AUDIENCE_INVALID")
  })

  it("refuse une page qui publierait pour ses connexions", () => {
    expect(violationOf(() => assertPageAudienceShape({ ...page, audience: "connections" }))?.code).toBe("PAGE_POST_AUDIENCE_INVALID")
  })

  it("refuse une publication de page dans un groupe", () => {
    expect(violationOf(() => assertPageAudienceShape({ ...page, hasGroup: true }))?.code).toBe("PAGE_POST_FORBIDS_GROUP")
  })

  it("refuse qu'une page partage la publication d'un tiers", () => {
    expect(violationOf(() => assertPageAudienceShape({ ...page, hasShare: true }))?.code).toBe("PAGE_POST_FORBIDS_SHARE")
  })

  it("porte un code de violation distinct par interdit", () => {
    const codes = [{ ...page, audience: "connections" as const }, { ...page, hasGroup: true }, { ...page, hasShare: true }].map(
      (input) => violationOf(() => assertPageAudienceShape(input))?.code ?? null,
    )
    expect(new Set(codes).size).toBe(3)
    expect(codes).not.toContain(null)
  })
})

describe("addedMentionedIds — les seules personnes à notifier lors d'une édition", () => {
  it("rend les nouvelles, dans l'ordre de la nouvelle version, sans les déjà citées", () => {
    expect(addedMentionedIds(["a", "b"], ["c", "a", "d"])).toEqual(["c", "d"])
    expect(addedMentionedIds(undefined, ["a"])).toEqual(["a"])
    expect(addedMentionedIds(["a"], [])).toEqual([])
  })
})

describe("portée et pays d'une publication (réseaux à portées)", () => {
  const reachValues = ["local", "diaspora"] as const
  const ruleOf = (run: () => unknown): string | null => {
    try {
      run()
      return null
    } catch (error) {
      return (error as { code?: string }).code ?? "inconnu"
    }
  }

  it("une portée déclarée par le réseau passe ; le pays est rendu en majuscules", () => {
    expect(assertPostReach({ reach: "diaspora", reachValues })).toEqual({ reach: "diaspora" })
    expect(assertPostReach({ reach: "local", country: " fr ", reachValues })).toEqual({ reach: "local", country: "FR" })
    expect(assertPostReach({ reachValues })).toEqual({})
  })

  it("une portée inconnue, un pays mal formé, une portée locale sans pays sont refusés", () => {
    expect(ruleOf(() => assertPostReach({ reach: "monde", reachValues }))).toBe("POST_REACH_INVALID")
    expect(ruleOf(() => assertPostReach({ reach: "diaspora", reachValues: [] }))).toBe("POST_REACH_INVALID")
    expect(ruleOf(() => assertPostReach({ country: "FRA", reachValues }))).toBe("POST_COUNTRY_INVALID")
    expect(ruleOf(() => assertPostReach({ reach: "local", reachValues }))).toBe("POST_COUNTRY_REQUIRED")
  })
})

describe("les voies du fil", () => {
  const reaches = ["local", "diaspora"]
  const ruleOf = (run: () => unknown) => {
    try {
      run()
    } catch (error) {
      return error instanceof DomainViolation ? error.code : "autre"
    }
    return null
  }

  it("normalise le pays, écarte les doublons, garde l'ordre", () => {
    expect(normalizeFeedLanes([{ reach: "local", country: " fr " }, { reach: "diaspora" }, { reach: "local", country: "FR" }], reaches)).toEqual([{ reach: "local", country: "FR" }, { reach: "diaspora" }])
  })

  it("refuse une portée que le réseau ne déclare pas, un pays mal formé, aucune voie ou plus de quatre", () => {
    expect(ruleOf(() => normalizeFeedLanes([{ reach: "monde" }], reaches))).toBe("POST_REACH_INVALID")
    expect(ruleOf(() => normalizeFeedLanes([{ reach: "local", country: "France" }], reaches))).toBe("POST_COUNTRY_INVALID")
    expect(ruleOf(() => normalizeFeedLanes([], reaches))).toBe("FEED_LANES_INVALID")
    expect(ruleOf(() => normalizeFeedLanes(Array.from({ length: 5 }, () => ({ reach: "diaspora" })), reaches))).toBe("FEED_LANES_INVALID")
  })
})

