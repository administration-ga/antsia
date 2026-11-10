import { describe, expect, it, vi } from "vitest"
vi.mock("./public-data", () => ({ projected: vi.fn() }))
import { editorialPublishedArticleSchema, editorialPublishedMediaSchema } from "./public-editorial-data"
const article = { articleKey: `a-${"a".repeat(32)}`, mediaHandle: "journal", mediaName: "Le journal", title: "Titre", chapeau: "Chapeau", sectionKey: null, sectionLabel: null, byline: { label: "La rédaction", handle: null }, correctionNotice: null, blocks: [{ type: "paragraph", text: "Texte publié" }], versionNumber: 1, publishedAt: 1, updatedAt: 1 }
describe("MP13 projection SSR fermée", () => {
  it("refuse les champs internes et les blocs libres même sur une réponse prétendue publiée", () => {
    expect(editorialPublishedArticleSchema.safeParse(article).success).toBe(true)
    for (const extra of [{ workingVersionId: "private" }, { grantId: "private" }, { authorPersonId: "private" }]) expect(editorialPublishedArticleSchema.safeParse({ ...article, ...extra }).success).toBe(false)
    for (const block of [{ type: "html", text: "<script>bad</script>" }, { type: "link", label: "Lien", href: "javascript:alert(1)" }, { type: "image", storageId: "private", altText: "image", credit: "credit" }]) expect(editorialPublishedArticleSchema.safeParse({ ...article, blocks: [block] }).success).toBe(false)
  })
  it("conserve le média retenu avec ses crédits mais ne reçoit pas de référence de stockage", () => {
    const image = { type: "image", url: null, withheld: "fileScanPending", altText: "Illustration", credit: "La rédaction" }
    expect(editorialPublishedArticleSchema.safeParse({ ...article, blocks: [image] }).success).toBe(true)
    expect(editorialPublishedArticleSchema.safeParse({ ...article, blocks: [{ ...image, storageId: "private" }] }).success).toBe(false)
  })
  it("borne la une et refuse l'ajout de brouillons ou de journaux internes", () => {
    const media = { handle: "journal", name: "Journal", description: "", sections: [], articles: { page: [], isDone: false, continueCursor: "cursor", filteredWindow: true } }
    expect(editorialPublishedMediaSchema.safeParse(media).success).toBe(true)
    expect(editorialPublishedMediaSchema.safeParse({ ...media, drafts: [] }).success).toBe(false)
  })
})

it("refuse une URL de fichier retenu même si le reste de la projection est valide", () => {
  for (const withheld of ["fileScanPending", "fileScanUnavailable", "fileQuarantined"]) expect(editorialPublishedArticleSchema.safeParse({ ...article, blocks: [{ type: "image", url: "https://media.example/withheld.jpg", withheld, altText: "Image", credit: "Crédit" }] }).success).toBe(false)
})
