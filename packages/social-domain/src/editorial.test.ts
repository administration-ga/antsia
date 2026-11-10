import { describe, expect, it } from "vitest"
import { EDITORIAL_PUBLIC_CONSENT_VERSION, editorialContent, editorialHttpsLink, editorialModerationText, parseEditorialConfigInput, parseEditorialDraftInput, type EditorialDraftInput } from "./editorial"

const draft = (extra: Partial<EditorialDraftInput> = {}): EditorialDraftInput => ({ title: "Les nouvelles de Libreville", chapeau: "Le contexte de cette information.", sectionKey: "actualites", byline: { kind: "media" }, correctionNotice: null, blocks: [{ type: "paragraph", text: "Un texte original." }], ...extra })
describe("MP12 — contrat de rédaction fermé", () => {
  it("normalise les textes et conserve l'ordre éditorial des rubriques et blocs", () => {
    expect(parseEditorialConfigInput({ description: "  Notre rédaction  ", visibility: "network", sections: [{ key: "culture", label: "Culture" }, { key: "actualites", label: "Actualités" }] })).toMatchObject({ description: "Notre rédaction", sections: [{ key: "culture" }, { key: "actualites" }] })
    expect(parseEditorialDraftInput(draft({ title: "  Enque\u0302te  ", blocks: [{ type: "heading", level: 2, text: "Le contexte" }, { type: "list", ordered: true, items: ["Premier point", "Second point"] }, { type: "link", label: "La source", href: "https://example.org/source" }, { type: "image", assetId: "asset_1" }] }))).toMatchObject({ title: "Enquête", blocks: [{ type: "heading" }, { type: "list" }, { type: "link" }, { type: "image" }] })
  })
  it("exige le consentement public dédié et refuse les rubriques ambiguës", () => {
    const input = { description: "Rédaction", visibility: "public", sections: [] }
    expect(parseEditorialConfigInput(input)).toBeNull()
    expect(parseEditorialConfigInput({ ...input, publicConsentTextVersion: EDITORIAL_PUBLIC_CONSENT_VERSION })).not.toBeNull()
    expect(parseEditorialConfigInput({ ...input, visibility: "network", publicConsentTextVersion: EDITORIAL_PUBLIC_CONSENT_VERSION })).toBeNull()
    for (const sections of [[{ key: "news", label: "A" }, { key: "news", label: "B" }], [{ key: "news", label: "Culture" }, { key: "other", label: "culture" }], [{ key: "News", label: "A" }], Array.from({ length: 13 }, (_, i) => ({ key: `r-${i}`, label: `Rubrique ${i}` }))]) expect(parseEditorialConfigInput({ description: "", visibility: "network", sections })).toBeNull()
  })
  it.each(["http://example.org", "javascript:alert(1)", "https://user:pass@example.org/", "https://127.0.0.1/", "https://localhost/", "https://example.org/\n", "https://example.org/\\test"])("refuse le lien %s", href => { expect(editorialHttpsLink(href)).toBeNull() })
  it("refuse HTML, contrôles, prototypes, getters, clés privées et champs étrangers à un bloc", () => {
    expect(parseEditorialDraftInput({ ...draft(), contact: "privé" })).toBeNull()
    expect(parseEditorialDraftInput(draft({ title: "<script>" }))).toBeNull()
    expect(parseEditorialDraftInput(draft({ title: "Texte\u202E" }))).toBeNull()
    expect(parseEditorialDraftInput(Object.create(draft()))).toBeNull()
    expect(parseEditorialDraftInput({ ...draft(), get title() { throw new Error("jamais exécuté") } })).toBeNull()
    expect(parseEditorialDraftInput({ ...draft(), byline: { kind: "media", grantId: undefined } })).toBeNull()
    expect(parseEditorialDraftInput({ ...draft(), blocks: [{ type: "paragraph", text: "Texte", assetId: "asset_1" }] })).toBeNull()
    expect(parseEditorialDraftInput({ ...draft(), blocks: [{ type: "image", assetId: "asset_1", storageId: "secret" }] })).toBeNull()
  })
  it("borne les textes en octets UTF8, le nombre de blocs et quatre images distinctes", () => {
    expect(parseEditorialDraftInput(draft({ blocks: Array.from({ length: 40 }, () => ({ type: "paragraph", text: "x" })) }))).not.toBeNull()
    expect(parseEditorialDraftInput(draft({ blocks: Array.from({ length: 41 }, () => ({ type: "paragraph", text: "x" })) }))).toBeNull()
    expect(parseEditorialDraftInput(draft({ blocks: Array.from({ length: 5 }, (_, i) => ({ type: "image", assetId: `asset_${i}` })) }))).toBeNull()
    expect(parseEditorialDraftInput(draft({ blocks: [{ type: "image", assetId: "asset_1" }, { type: "image", assetId: "asset_1" }] }))).toBeNull()
    expect(parseEditorialDraftInput(draft({ blocks: Array.from({ length: 4 }, () => ({ type: "paragraph", text: "界".repeat(3000) })) }))).toBeNull()
    expect(parseEditorialDraftInput(draft({ blocks: [{ type: "list", ordered: false, items: [] }] }))).toBeNull()
  })
  it("ne tronque pas la dernière clause et produit un contenu canonique indépendant de l'ordre des clés", () => {
    const input = draft({ blocks: [{ type: "paragraph", text: "x".repeat(4000) }, { type: "paragraph", text: "Dernière clause à modérer." }] })
    const parsed = parseEditorialDraftInput(input)!
    expect(editorialModerationText(parsed)).toContain("Dernière clause à modérer.")
    expect(JSON.stringify(editorialContent(parsed))).toBe(JSON.stringify(editorialContent({ blocks: input.blocks.map(block => block.type === "paragraph" ? { text: block.text, type: "paragraph" } : block), correctionNotice: input.correctionNotice, byline: input.byline, sectionKey: input.sectionKey, chapeau: input.chapeau, title: input.title })))
  })
})
