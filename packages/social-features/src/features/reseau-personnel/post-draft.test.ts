// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/post-draft.test.ts @ ad2e7fdc2 — adaptations : l'audience de page « organisation » devient `followers` (note aux abonnés, domaine du moteur) ; tous les cas du socle portés ; cas ajouté : un brouillon relu qui porte l'ancienne audience « organisation » retombe sur le communiqué.
/**
 * post-draft — le brouillon de publication, ses transitions et sa forme
 * persistée (R-12).
 *
 * Trois invariants portent tout le lot, et chacun a son test :
 *  · la clé d'idempotence ne tourne QU'au succès — un renvoi rejoue, il ne
 *    publie pas deux fois ;
 *  · un média DÉJÀ téléversé ne redevient jamais « à téléverser » — sinon
 *    chaque tentative laisse un blob orphelin ;
 *  · un média dont le fichier a quitté la mémoire est NOMMÉ irrécupérable —
 *    on ne prétend pas avoir sauvegardé ce dont il ne reste que le nom.
 */
import { describe, expect, it } from "vitest"
import {
  POST_DRAFT_SERIAL_VERSION,
  clearDraft,
  draftAddMedia,
  draftFor,
  draftMarkUploadFailed,
  draftMarkUploaded,
  draftRemoveMedia,
  draftRotateKey,
  draftSetAltText,
  draftSetAudience,
  draftSetBody,
  draftSetPageAudience,
  dropDraft,
  emptyDraft,
  initialPostDrafts,
  isDraftEmpty,
  isPostDraftKey,
  isPristine,
  parseDrafts,
  postDraftKey,
  serializeDrafts,
  setComposerOpen,
  unrecoverableMedia,
  updateDraft,
  type PostDraftMedia,
  type PostDraftsState,
} from "./post-draft"

const media = (localId: string, patch: Partial<PostDraftMedia> = {}): PostDraftMedia => ({
  localId,
  kind: "image",
  altText: "",
  fileName: `${localId}.png`,
  mimeType: "image/png",
  sizeBytes: 1024,
  upload: { status: "pending" },
  ...patch,
})

describe("la CIBLE d'un brouillon", () => {
  it("donne une clé par lieu de publication", () => {
    expect(postDraftKey({ kind: "feed" })).toBe("feed")
    expect(postDraftKey({ kind: "group", groupId: "g1" })).toBe("group:g1")
    expect(postDraftKey({ kind: "page", pageId: "p1" })).toBe("page:p1")
  })

  it("reconnaît une clé relue, et rejette le reste", () => {
    expect(isPostDraftKey("feed")).toBe(true)
    expect(isPostDraftKey("group:g1")).toBe(true)
    expect(isPostDraftKey("page:p1")).toBe(true)
    expect(isPostDraftKey("story:s1")).toBe(false)
    expect(isPostDraftKey("group:")).toBe(false)
    expect(isPostDraftKey(":g1")).toBe(false)
    expect(isPostDraftKey("")).toBe(false)
    expect(isPostDraftKey(42)).toBe(false)
  })
})

describe("le brouillon vide", () => {
  it("part sur les défauts les plus restreints du composeur", () => {
    const draft = emptyDraft("k1")
    expect(draft.body).toBe("")
    expect(draft.audience).toBe("connections")
    expect(draft.pageAudience).toBe("public")
    expect(draft.idempotencyKey).toBe("k1")
    expect(draft.media).toEqual([])
    expect(isDraftEmpty(draft)).toBe(true)
  })

  it("n'est PAS vide dès qu'il porte du texte ou un média", () => {
    expect(isDraftEmpty(draftSetBody(emptyDraft("k"), "  "))).toBe(true)
    expect(isDraftEmpty(draftSetBody(emptyDraft("k"), "Bonjour"))).toBe(false)
    expect(isDraftEmpty(draftAddMedia(emptyDraft("k"), [media("m1")]))).toBe(false)
  })
})

describe("les transitions d'un brouillon", () => {
  it("écrivent le corps et les deux audiences, séparément", () => {
    let draft = emptyDraft("k")
    draft = draftSetBody(draft, "Revue des archives")
    draft = draftSetAudience(draft, "public")
    draft = draftSetPageAudience(draft, "followers")
    expect(draft.body).toBe("Revue des archives")
    expect(draft.audience).toBe("public")
    expect(draft.pageAudience).toBe("followers")
  })

  it("rendent la MÊME référence quand rien ne change", () => {
    const draft = draftSetBody(emptyDraft("k"), "x")
    expect(draftSetBody(draft, "x")).toBe(draft)
    expect(draftSetAudience(draft, draft.audience)).toBe(draft)
    expect(draftRemoveMedia(draft, "absent")).toBe(draft)
  })

  it("ajoutent, décrivent et retirent un média", () => {
    let draft = draftAddMedia(emptyDraft("k"), [media("m1"), media("m2")])
    draft = draftSetAltText(draft, "m2", "Salle des archives")
    expect(draft.media.map((m) => m.localId)).toEqual(["m1", "m2"])
    expect(draft.media[1]?.altText).toBe("Salle des archives")
    draft = draftRemoveMedia(draft, "m1")
    expect(draft.media.map((m) => m.localId)).toEqual(["m2"])
  })
})

describe("l'idempotence — la clé ne tourne QU'au succès", () => {
  it("survit à un échec de téléversement", () => {
    let state = initialPostDrafts()
    state = updateDraft(state, "feed", "k1", (d) => draftSetBody(d, "Essai"))
    state = updateDraft(state, "feed", "ignoree", (d) =>
      draftAddMedia(d, [media("m1")]),
    )
    const before = draftFor(state, "feed", "x").idempotencyKey
    state = updateDraft(state, "feed", "ignoree", (d) =>
      draftMarkUploadFailed(d, "m1"),
    )
    expect(draftFor(state, "feed", "x").idempotencyKey).toBe(before)
    expect(before).toBe("k1")
  })

  it("est renouvelée par le vidage qui suit une publication", () => {
    let state = updateDraft(initialPostDrafts(), "feed", "k1", (d) =>
      draftSetBody(d, "Publiée"),
    )
    state = clearDraft(state, "feed", "k2")
    const draft = draftFor(state, "feed", "x")
    expect(draft.idempotencyKey).toBe("k2")
    expect(draft.body).toBe("")
    expect(isDraftEmpty(draft)).toBe(true)
  })

  it("se renouvelle aussi à la demande explicite, jamais autrement", () => {
    const draft = draftRotateKey(emptyDraft("k1"), "k2")
    expect(draft.idempotencyKey).toBe("k2")
  })
})

describe("la reprise d'un envoi — aucun doublon de téléversement", () => {
  it("garde le storageId d'un média déjà téléversé", () => {
    let draft = draftAddMedia(emptyDraft("k"), [media("m1")])
    draft = draftMarkUploaded(draft, "m1", "storage-1", 1_000)
    expect(draft.media[0]?.upload).toEqual({
      status: "uploaded",
      storageId: "storage-1",
      uploadedAt: 1_000,
    })
    // ⚠️ Le défaut d'origine : un échec ULTÉRIEUR de la publication remettait
    // tout à zéro et faisait re-téléverser l'octet au renvoi.
    draft = draftMarkUploadFailed(draft, "m1")
    expect(draft.media[0]?.upload).toEqual({
      status: "uploaded",
      storageId: "storage-1",
      uploadedAt: 1_000,
    })
  })

  it("marque en échec un média jamais téléversé", () => {
    let draft = draftAddMedia(emptyDraft("k"), [media("m1")])
    draft = draftMarkUploadFailed(draft, "m1")
    expect(draft.media[0]?.upload).toEqual({ status: "failed" })
  })
})

describe("ce qui n'a PAS survécu au rechargement", () => {
  const absent = () => false
  const present = () => true

  it("nomme les médias à resélectionner", () => {
    const draft = draftAddMedia(emptyDraft("k"), [
      media("m1"),
      media("m2", {
        upload: { status: "uploaded", storageId: "s", uploadedAt: 1 },
      }),
    ])
    expect(unrecoverableMedia(draft, absent).map((m) => m.localId)).toEqual(["m1"])
    // Un média téléversé n'est PAS perdu : son octet est au stockage.
    expect(unrecoverableMedia(draft, present)).toEqual([])
  })

  it("ne signale rien quand les fichiers sont encore là", () => {
    const draft = draftAddMedia(emptyDraft("k"), [media("m1")])
    expect(unrecoverableMedia(draft, present)).toEqual([])
  })
})

describe("la collection de brouillons", () => {
  it("sépare les cibles — un texte de groupe ne fuit pas dans le fil", () => {
    let state = updateDraft(initialPostDrafts(), "feed", "k1", (d) =>
      draftSetBody(d, "Pour le fil"),
    )
    state = updateDraft(state, "group:g1", "k2", (d) =>
      draftSetBody(d, "Pour le groupe"),
    )
    expect(draftFor(state, "feed", "x").body).toBe("Pour le fil")
    expect(draftFor(state, "group:g1", "x").body).toBe("Pour le groupe")
    expect(draftFor(state, "page:p1", "neuve").idempotencyKey).toBe("neuve")
  })

  it("retient l'ouverture du composeur", () => {
    const state = setComposerOpen(initialPostDrafts(), true)
    expect(state.composerOpen).toBe(true)
    expect(setComposerOpen(state, true)).toBe(state)
    expect(setComposerOpen(state, false).composerOpen).toBe(false)
  })

  it("distingue « rien d'écrit » de « des brouillons existent »", () => {
    const vierge = updateDraft(initialPostDrafts(), "feed", "k", (d) => d)
    expect(isPristine(vierge)).toBe(true)
    const ecrit = updateDraft(vierge, "feed", "k", (d) => draftSetBody(d, "a"))
    expect(isPristine(ecrit)).toBe(false)
  })

  it("efface une ligne à l'abandon", () => {
    const state = updateDraft(initialPostDrafts(), "feed", "k", (d) =>
      draftSetBody(d, "a"),
    )
    expect(dropDraft(state, "feed").drafts.feed).toBeUndefined()
    expect(dropDraft(state, "absent")).toBe(state)
  })
})

describe("sérialisation VERSIONNÉE", () => {
  function complet(): PostDraftsState {
    let state = setComposerOpen(initialPostDrafts(), true)
    state = updateDraft(state, "feed", "k1", (d) =>
      draftAddMedia(draftSetBody(d, "Texte"), [
        media("m1", {
          altText: "Une salle",
          upload: { status: "uploaded", storageId: "s1", uploadedAt: 7 },
        }),
      ]),
    )
    return state
  }

  it("fait l'aller-retour sans rien perdre de sérialisable", () => {
    const state = complet()
    expect(parseDrafts(serializeDrafts(state))).toEqual(state)
  })

  it("SD-03 — garde la durée mesurée d'une vidéo, oublie une durée illisible, n'en invente pas pour une image", () => {
    const video = (localId: string, durationMs: unknown) => ({
      ...media(localId, { kind: "video", fileName: `${localId}.mp4`, mimeType: "video/mp4" }),
      durationMs,
    })
    const raw = JSON.stringify({
      v: POST_DRAFT_SERIAL_VERSION,
      composerOpen: false,
      drafts: { feed: { ...emptyDraft("k"), media: [video("v1", 12_401), video("v2", "long"), video("v3", -5), { ...media("i1"), durationMs: 3_000 }] } },
    })
    const kept = parseDrafts(raw).drafts.feed?.media ?? []
    expect(kept.map((item) => [item.localId, item.durationMs])).toEqual([
      ["v1", 12_401],
      ["v2", undefined],
      ["v3", undefined],
      ["i1", undefined],
    ])
    expect(kept[1]).not.toHaveProperty("durationMs")
  })

  it("refuse une version antérieure, et retombe sur l'état neuf", () => {
    const ancien = JSON.stringify({
      v: POST_DRAFT_SERIAL_VERSION - 1,
      composerOpen: true,
      drafts: { feed: emptyDraft("k") },
    })
    expect(parseDrafts(ancien)).toEqual(initialPostDrafts())
  })

  it("survit à un contenu abîmé, vide ou absent", () => {
    expect(parseDrafts(null)).toEqual(initialPostDrafts())
    expect(parseDrafts("")).toEqual(initialPostDrafts())
    expect(parseDrafts("{pas du json")).toEqual(initialPostDrafts())
    expect(parseDrafts("[]")).toEqual(initialPostDrafts())
  })

  it("écarte une clé de cible inconnue et un brouillon sans clé d'idempotence", () => {
    const raw = JSON.stringify({
      v: POST_DRAFT_SERIAL_VERSION,
      composerOpen: false,
      drafts: {
        "story:s1": emptyDraft("k"),
        feed: { body: "orphelin", media: [] },
        "group:g1": emptyDraft("k2"),
      },
    })
    const parsed = parseDrafts(raw)
    expect(Object.keys(parsed.drafts)).toEqual(["group:g1"])
  })

  it("écarte un média abîmé sans perdre le brouillon", () => {
    const raw = JSON.stringify({
      v: POST_DRAFT_SERIAL_VERSION,
      composerOpen: false,
      drafts: {
        feed: {
          ...emptyDraft("k"),
          media: [
            media("m1"),
            { localId: "m2", kind: "gif", upload: { status: "pending" } },
            {
              localId: "m3",
              kind: "image",
              fileName: "a.png",
              mimeType: "image/png",
              sizeBytes: 1,
              upload: { status: "uploaded" },
            },
          ],
        },
      },
    })
    const parsed = parseDrafts(raw)
    expect(parsed.drafts.feed?.media.map((m) => m.localId)).toEqual(["m1"])
  })

  it("ramène une audience inconnue au défaut le plus restreint", () => {
    const raw = JSON.stringify({
      v: POST_DRAFT_SERIAL_VERSION,
      composerOpen: false,
      drafts: {
        feed: { ...emptyDraft("k"), audience: "tout-le-monde", pageAudience: "x" },
      },
    })
    const parsed = parseDrafts(raw)
    expect(parsed.drafts.feed?.audience).toBe("connections")
    expect(parsed.drafts.feed?.pageAudience).toBe("public")
  })

  it("garde la note aux abonnés, et ramène l'ancienne « organisation » au communiqué", () => {
    const raw = JSON.stringify({
      v: POST_DRAFT_SERIAL_VERSION,
      composerOpen: false,
      drafts: {
        "page:p1": { ...emptyDraft("k1"), pageAudience: "followers" },
        "page:p2": { ...emptyDraft("k2"), pageAudience: "organisation" },
      },
    })
    const parsed = parseDrafts(raw)
    expect(parsed.drafts["page:p1"]?.pageAudience).toBe("followers")
    // L'audience « organisation » n'existe pas dans le moteur : défaut de la page.
    expect(parsed.drafts["page:p2"]?.pageAudience).toBe("public")
  })

  it("ne rouvre pas une feuille que personne n'a demandée", () => {
    const raw = JSON.stringify({
      v: POST_DRAFT_SERIAL_VERSION,
      drafts: {},
    })
    expect(parseDrafts(raw).composerOpen).toBe(false)
  })
})
