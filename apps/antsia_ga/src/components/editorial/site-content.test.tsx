import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { EditorialArticleContent, EditorialMediaContent } from "./site-content"
import { editorialReadingLabels } from "@/lib/editorial-reading"
const labels = editorialReadingLabels(key => key)
describe("MP13 lecture éditoriale structurée", () => {
  it("rend un article, son sommaire, ses crédits et son rectificatif sans exécuter le texte", () => {
    const html = renderToStaticMarkup(<EditorialArticleContent locale="fr" labels={labels} publicView article={{ articleKey: "a-key", mediaHandle: "journal", mediaName: "Journal", title: "Titre", chapeau: "Chapeau", sectionKey: null, sectionLabel: null, byline: { label: "La rédaction", handle: null }, correctionNotice: "Rectificatif daté", versionNumber: 2, publishedAt: 1, updatedAt: 2, blocks: [{ type: "heading", level: 2, text: "Premier" }, { type: "paragraph", text: "<script>contenu</script>" }, { type: "heading", level: 3, text: "Deuxième" }, { type: "list", ordered: true, items: ["Source vérifiée par la rédaction", "Contexte"] }, { type: "image", url: null, withheld: "fileScanPending", altText: "Illustration", credit: "Crédit de recette" }] }} />)
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).toContain('href="#article-section-0"')
    expect(html).toContain("&lt;script&gt;contenu&lt;/script&gt;")
    expect(html).not.toContain("<script>")
    expect(html).toContain("Crédit de recette")
    expect(html).toContain("imagePending")
    expect(html).toContain("Rectificatif daté")
    expect(html).not.toContain("storageId")
  })
  it("continue une fenêtre vide filtrée et conserve la rubrique", () => {
    const html = renderToStaticMarkup(<EditorialMediaContent locale="fr" labels={labels} section="culture" publicView media={{ handle: "journal", name: "Journal", description: "Présentation", sections: [{ key: "culture", label: "Culture" }], articles: { page: [], isDone: false, continueCursor: "cursor", filteredWindow: true } }} />)
    expect(html).toContain("filtered")
    expect(html).toContain("rubrique=culture&amp;curseur=cursor")
    expect(html).toContain('aria-current="page"')
    expect(html).not.toContain("empty")
  })
})

it("ne rend jamais une image retenue même avec une URL contradictoire", () => {
  const html = renderToStaticMarkup(<EditorialArticleContent locale="fr" labels={labels} article={{ articleKey: "a-key", mediaHandle: "journal", mediaName: "Journal", title: "Titre", chapeau: "", sectionKey: null, sectionLabel: null, byline: { label: "Rédaction", handle: null }, correctionNotice: null, versionNumber: 1, publishedAt: 1, updatedAt: 1, blocks: [{ type: "image", url: "https://media.example/withheld.jpg", withheld: "fileScanPending", altText: "Image", credit: "Crédit" }] }} />)
  expect(html).not.toContain("<img")
  expect(html).not.toContain("https://media.example/withheld.jpg")
  expect(html).toContain(labels.imagePending)
})
