import { EDITORIAL_PUBLIC_CONSENT_VERSION } from "@antsia/social-domain/editorial"
import { describe, expect, it } from "vitest"

import { editorialConfigInput, editorialConfigSchema, editorialConfigValues, editorialDraftInput, editorialDraftSchema, editorialDraftValues, editorialErrorKey, editorialImageSchema, editorialLocalPublicationInstant, editorialWriteInput, newEditorialBlock } from "./editorial-form"

const t = (key: string) => key
const draft = () => ({ ...editorialDraftValues(), title: "Une enquête", blocks: [{ type: "paragraph" as const, text: "Un article structuré." }] })

describe("MP12 — forme éditoriale structurée", () => {
  it("accepte un article distinct des publications sociales et normalise son texte", () => {
    const values = { ...draft(), title: " Une enquête ", chapeau: " Introduction\r\nSuite ", blocks: [{ type: "paragraph" as const, text: "x".repeat(3000) }] }
    expect(editorialDraftSchema(t).safeParse(values).success).toBe(true)
    expect(editorialDraftInput(values)).toMatchObject({ title: "Une enquête", chapeau: "Introduction\nSuite", sectionKey: null, correctionNotice: null, byline: { kind: "media" } })
  })
  it("refuse HTML, attributs ouverts, embed et blocs inconnus", () => {
    for (const patch of [{ title: "<script>" }, { blocks: [{ type: "html", content: "<p>test</p>" }] }, { blocks: [{ type: "paragraph", text: "Texte", html: true }] },
      { blocks: [{ type: "heading", level: 1, text: "Titre" }] }, { blocks: [{ type: "image", assetId: "asset-a", url: "extra" }] }, { secret: "extra" },
    ]) expect(editorialDraftSchema(t).safeParse({ ...draft(), ...patch }).success).toBe(false)
  })
  it("ferme les liens aux adresses HTTPS publiques et sans authentifiant", () => {
    for (const href of ["javascript:alert(1)", "http://news.example", "https://user:secret@news.example", "https://localhost/a", "https://127.0.0.1/a", "https://[::1]/a", "https://news.example/a b"]) {
      expect(editorialDraftSchema(t).safeParse({ ...draft(), blocks: [{ type: "link", href, label: "Source" }] }).success).toBe(false)
    }
    expect(editorialDraftSchema(t).safeParse({ ...draft(), blocks: [{ type: "link", href: "https://news.example/article", label: "Source" }] }).success).toBe(true)
  })
  it("borne blocs, images uniques et octets UTF8 sans tronquer le contenu", () => {
    for (const blocks of [Array.from({ length: 41 }, () => ({ type: "paragraph", text: "Texte" })), Array.from({ length: 5 }, (_, index) => ({ type: "image", assetId: `image-${index}` })),
      [{ type: "image", assetId: "same" }, { type: "image", assetId: "same" }], Array.from({ length: 10 }, () => ({ type: "paragraph", text: "é".repeat(2000) })),
    ]) expect(editorialDraftSchema(t).safeParse({ ...draft(), blocks }).success).toBe(false)
  })
  it("conserve la correction et les références sans fabriquer de droits de fichier", () => {
    const values = { ...draft(), correctionNotice: "Le chiffre a été corrigé.", byline: "grant-1", blocks: [{ type: "image" as const, assetId: "asset-1" }] }
    const input = editorialDraftInput(values)!
    expect(input).toMatchObject({ correctionNotice: values.correctionNotice, byline: { kind: "contributor", grantId: "grant-1" }, blocks: values.blocks })
    expect(editorialDraftValues(input)).toEqual(values)
    expect(editorialWriteInput(input)).not.toHaveProperty("url")
    expect(newEditorialBlock("list")).toEqual({ type: "list", ordered: false, items: [""] })
  })
})

describe("MP12 — configuration, crédits et accords", () => {
  it("démarre en réseau et exige un accord public neuf même après une configuration publique", () => {
    expect(editorialConfigValues()).toMatchObject({ visibility: "network", publicConsent: false })
    const value = { ...editorialConfigValues(), visibility: "public" as const }
    expect(editorialConfigInput(value)).toBeNull()
    const input = editorialConfigInput({ ...value, publicConsent: true })!
    expect(input.publicConsentTextVersion).toBe(EDITORIAL_PUBLIC_CONSENT_VERSION)
    expect(editorialConfigValues(input).publicConsent).toBe(false)
  })
  it("refuse rubriques dupliquées, adresses instables et dépassements", () => {
    const section = { key: "actualite", label: "Actualité" }
    for (const sections of [[section, section], [section, { key: "autre", label: "ACTUALITÉ" }], [{ key: "Actualité du jour", label: "Nom" }], Array.from({ length: 13 }, (_, index) => ({ key: `r-${index}`, label: `Rubrique ${index}` }))]) {
      expect(editorialConfigSchema(t).safeParse({ ...editorialConfigValues(), sections }).success).toBe(false)
    }
  })
  it("requiert séparément crédit, texte alternatif et accord de publication", () => {
    const valid = { altText: "La rédaction au travail", credit: "Photographe autorisé", rightsConsent: true }
    expect(editorialImageSchema(t).safeParse(valid).success).toBe(true)
    for (const patch of [{ altText: "" }, { credit: "" }, { rightsConsent: false }, { secret: "extra" }]) expect(editorialImageSchema(t).safeParse({ ...valid, ...patch }).success).toBe(false)
  })
  it("traduit le conflit sans dévoiler une erreur interne", () => {
    expect(editorialErrorKey({ data: { code: "conflict", field: "expectedRevision" } })).toBe("errors.conflict")
    expect(editorialErrorKey(new Error("private detail"))).toBe("errors.unavailable")
  })
})

describe("MP12 — programmation explicite", () => {
  it("corrèle les composantes locales et l'instant UTC sans supposer le fuseau de l'appareil", () => {
    const local = "2026-11-12T13:45"
    const expected = new Date(2026, 10, 12, 13, 45).getTime()
    const instant = editorialLocalPublicationInstant(local, expected - 86_400_000)!
    expect(instant.publishAt).toBe(expected)
    expect(instant.utc).toBe(new Date(expected).toISOString())
    expect(instant.timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })
  it("refuse les dates impossibles, passées, hors90jours et les heures sans choix explicite", () => {
    const now = new Date(2026, 9, 21, 12).getTime()
    for (const value of ["", "2026-02-30T12:00", "2026-11-12T24:00", "2026-11-12T13:60", "2026-10-20T10:00", "2027-05-10T10:00", "2026-11-12T13:45Z"]) expect(editorialLocalPublicationInstant(value, now)).toBeNull()
  })
})
