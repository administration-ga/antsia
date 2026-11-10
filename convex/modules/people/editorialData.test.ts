import { describe, expect, it } from "vitest"
import { anonymizeReferences, directlyOwned, exportableRecord, referencesIn, shapeFor } from "./dataInventory"

const base = { _id: "record", _creationTime: 1, networkId: "network", createdAt: 1, updatedAt: 2 }
describe("MP12 : contenu collectif de rédaction et données personnelles", () => {
  it("exporte seulement l'acte propre d'annonce et conserve la discussion collective à l'effacement", () => {
    const row = { ...base, pageId: "page", articleId: "article", postId: "post", announcedByPersonId: "a", announcedAt: 3, updatedByPersonId: "b", commentsEnabled: true, revision: 2 }
    expect(exportableRecord("editorialSocialLinks", row, "a")).toMatchObject({ articleId: "article", postId: "post", announcedAt: 3 })
    expect(exportableRecord("editorialSocialLinks", row, "a")).not.toHaveProperty("commentsEnabled")
    expect(exportableRecord("editorialSocialLinks", row, "a")).not.toHaveProperty("updatedByPersonId")
    expect(exportableRecord("editorialSocialLinks", row, "b")).toBeNull()
    expect(directlyOwned("editorialSocialLinks", row, "a")).toBe(false)
    expect(anonymizeReferences(row, shapeFor("editorialSocialLinks"), "a", "anonymous")).toMatchObject({ announcedByPersonId: "anonymous", postId: "post", commentsEnabled: true })
  })
  it("une signature ne donne pas l'export du texte d'article ou d'un brouillon d'autrui", () => {
    const row = { ...base, articleId: "article", pageId: "page", authorPersonId: "a", versionNumber: 3, digest: "hash", title: "Texte de la page", blocks: [{ type: "paragraph", text: "Brouillon collectif" }] }
    expect(exportableRecord("editorialVersions", row, "a")).toMatchObject({ versionNumber: 3, digest: "hash" })
    expect(exportableRecord("editorialVersions", row, "a")).not.toHaveProperty("blocks")
    expect(exportableRecord("editorialVersions", row, "a")).not.toHaveProperty("title")
    expect(exportableRecord("editorialVersions", row, "b")).toBeNull()
    expect(directlyOwned("editorialVersions", row, "a")).toBe(false)
    expect(anonymizeReferences(row, shapeFor("editorialVersions"), "a", "anonymous")).toMatchObject({ authorPersonId: "anonymous", blocks: row.blocks })
  })
  it("l'invitant ne reçoit ni refus ni identité ou préférences du destinataire", () => {
    const row = { ...base, pageId: "page", personId: "b", invitedByPersonId: "a", state: "declined", role: "author", authority: { signatoryId: "secret-proof", authorityRevision: 9 }, bylineConsentTextVersion: "version", bylineConsentedAt: 4 }
    const inviter = exportableRecord("editorialGrants", row, "a")
    expect(inviter).toMatchObject({ role: "author", pageId: "page" })
    expect(inviter).not.toHaveProperty("state")
    expect(inviter).not.toHaveProperty("personId")
    expect(inviter).not.toHaveProperty("bylineConsentedAt")
    expect(exportableRecord("editorialGrants", row, "b")).toMatchObject({ state: "declined", bylineConsentedAt: 4 })
    expect(exportableRecord("editorialGrants", row, "b")).not.toHaveProperty("authority")
    expect(directlyOwned("editorialGrants", row, "b")).toBe(true)
    expect(directlyOwned("editorialGrants", row, "a")).toBe(false)
  })
  it("le fichier suit son déposant sans faire disparaître l'article de page", () => {
    const asset = { ...base, uploadedByPersonId: "a", pageId: "page", storageId: "blob", altText: "Illustration", credit: "Rédaction", rightsConsentTextVersion: "version", rightsConsentedAt: 1 }
    expect(directlyOwned("editorialAssets", asset, "a")).toBe(true)
    expect(directlyOwned("editorialArticles", { ...base, createdByPersonId: "a" }, "a")).toBe(false)
    expect(referencesIn(asset, shapeFor("editorialAssets"))).toContainEqual({ table: "_storage", id: "blob" })
    expect(exportableRecord("editorialAssets", asset, "a")).not.toHaveProperty("storageId")
    expect(exportableRecord("editorialAssets", asset, "b")).toBeNull()
  })
  it("n'exporte que son propre acte éditorial et son consentement", () => {
    const event = { ...base, actorPersonId: "a", action: "requested_changes", authority: { signatoryId: "proof", authorityRevision: 1 }, note: "Message d'une autre personne" }
    expect(exportableRecord("editorialEvents", event, "a")).toMatchObject({ action: "requested_changes" })
    expect(exportableRecord("editorialEvents", event, "a")).not.toHaveProperty("note")
    expect(exportableRecord("editorialEvents", event, "b")).toBeNull()
    expect(exportableRecord("editorialMedia", { ...base, publicConsentByPersonId: "a", publicConsentedAt: 1, description: "Contenu collectif", publicConsentAuthority: "private-proof" }, "a")).toMatchObject({ publicConsentedAt: 1 })
    expect(exportableRecord("editorialMedia", { ...base, publicConsentByPersonId: "a", description: "Contenu collectif" }, "a")).not.toHaveProperty("description")
  })
})
