// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/useMediaDraft.test.ts @ ad2e7fdc2 — adaptations : refus lus par un `t` français (`rejectionFor(file, existing, limits, t)`) ; tous les cas du socle portés ; cas ajoutés : refus des images seules (albums), plafond et message propres à l'appelant, refus dans la langue de l'écran.
/**
 * Les refus du brouillon de médias — un module PUR, testé en `node` : les
 * règles de sélection ne dépendent d'aucun rendu.
 *
 * ⚠️ Ces règles DOUBLENT celles du serveur, elles ne les remplacent pas : le
 * serveur relit les métadonnées RÉELLES du stockage. Ce qui est testé ici,
 * c'est qu'on n'envoie pas un téléversement voué au refus.
 *
 * Le hook lui-même est vérifié MONTÉ, dans `PostComposer.test.tsx` (jsdom +
 * Testing Library) : reprise du brouillon, téléversement non redoublé,
 * clé d'idempotence conservée sur échec.
 */
import { describe, expect, it } from "vitest"

import { createAppI18n } from "../../i18n"
import { IMAGE_ONLY_ACCEPT, MEDIA_ACCEPT, rejectionFor, type DraftMedia } from "./useMediaDraft"

const t = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "reseau" }).getFixedT("fr")
const tEn = createAppI18n({ locale: "en", appResources: { fr: {}, en: {} }, defaultNS: "reseau" }).getFixedT("en")

const file = (type: string, size = 1000, name = "f"): File =>
  ({ type, size, name }) as File

const draft = (kind: "image" | "video"): DraftMedia => {
  const source = file(kind === "image" ? "image/png" : "video/mp4")
  return {
    localId: `${kind}-1`,
    file: source,
    kind,
    previewUrl: "blob:x",
    altText: "",
    fileName: source.name,
    mimeType: source.type,
    sizeBytes: source.size,
    upload: { status: "pending" },
  }
}

describe("ce que le sélecteur propose", () => {
  it("annonce images ET vidéos acceptées", () => {
    expect(MEDIA_ACCEPT).toContain("image/png")
    expect(MEDIA_ACCEPT).toContain("video/mp4")
    // Un format que le domaine refuse ne doit pas être proposé.
    expect(MEDIA_ACCEPT).not.toContain("image/svg")
  })
})

describe("refus au moment de choisir", () => {
  it("écarte ce qui n'est ni image ni vidéo", () => {
    expect(rejectionFor(file("application/pdf"), [], undefined, t)).toContain("ni une image")
  })

  it("tient la règle « une vidéo est seule »", () => {
    expect(rejectionFor(file("video/mp4"), [draft("image")], undefined, t)).toContain("seule")
    expect(rejectionFor(file("image/png"), [draft("video")], undefined, t)).toContain("seule")
    expect(rejectionFor(file("video/mp4"), [], undefined, t)).toBeNull()
  })

  it("plafonne à quatre médias", () => {
    const four = [draft("image"), draft("image"), draft("image"), draft("image")]
    expect(rejectionFor(file("image/png"), four, undefined, t)).toContain("au plus 4")
    expect(rejectionFor(file("image/png"), four.slice(0, 3), undefined, t)).toBeNull()
  })

  it("écarte ce qui dépasse le poids, en le NOMMANT", () => {
    // Un refus qui ne dit pas QUEL fichier pose problème est inutilisable dès
    // qu'on en a choisi plusieurs.
    const refusal = rejectionFor(
      file("image/png", 21 * 1024 * 1024, "chantier.png"),
      [],
      undefined,
      t,
    )
    expect(refusal).toContain("chantier.png")
    expect(refusal).toContain("20 Mo")
    // EX-17 (décision du 9/11/2026) : la vidéo de publication est bornée à 60 Mio.
    expect(
      rejectionFor(file("video/mp4", 61 * 1024 * 1024, "clip.mp4"), [], undefined, t),
    ).toContain("60 Mo")
    expect(rejectionFor(file("video/mp4", 60 * 1024 * 1024, "clip.mp4"), [], undefined, t)).toBeNull()
  })
})

describe("réglages de l'appelant (albums)", () => {
  it("n'accepte QUE des images quand on le demande — la vidéo seule comprise", () => {
    expect(IMAGE_ONLY_ACCEPT).toContain("image/png")
    expect(IMAGE_ONLY_ACCEPT).not.toContain("video/mp4")
    const refusal = rejectionFor(file("video/mp4", 1000, "clip.mp4"), [], { imagesOnly: true }, t)
    expect(refusal).toContain("clip.mp4")
    expect(refusal).toContain("pas une image")
  })

  it("dit le plafond de l'appelant, avec sa propre phrase", () => {
    const deux = [draft("image"), draft("image")]
    expect(rejectionFor(file("image/png"), deux, { maxCount: 2 }, t)).toContain("au plus 2")
    expect(rejectionFor(file("image/png"), deux, { maxCount: 2, tooManyMessage: (max) => `Plafond : ${max}` }, t)).toBe("Plafond : 2")
  })
})

describe("la langue de l'écran", () => {
  it("dit le refus dans la langue de `t`", () => {
    expect(rejectionFor(file("application/pdf", 10, "plan.pdf"), [], undefined, tEn)).toBe("“plan.pdf” is neither an accepted image nor an accepted video.")
    expect(rejectionFor(file("image/png", 21 * 1024 * 1024, "big.png"), [], undefined, tEn)).toBe("“big.png” exceeds 20 MB.")
  })
})
