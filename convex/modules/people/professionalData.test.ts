import { describe, expect, it } from "vitest"
import { directlyOwned, exportableRecord, referencesIn, shapeFor } from "./dataInventory"

const base = { _id: "record", _creationTime: 1, networkId: "network", createdAt: 1, updatedAt: 2 }
describe("MP09 : données professionnelles personnelles", () => {
  it("exporte son profil et ses choix, sans index technique ni profil d'autrui", () => {
    const row = { ...base, personId: "a", title: "Photographe", publicFields: ["title"], searchText: "technical", publicConsentAt: 2 }
    const own = exportableRecord("professionalProfiles", row, "a")
    expect(own).toMatchObject({ title: "Photographe", publicFields: ["title"], publicConsentAt: 2 })
    expect(own).not.toHaveProperty("searchText")
    expect(exportableRecord("professionalProfiles", row, "b")).toBeNull()
  })
  it("n'exporte pas le refus reçu ni le message écrit par l'autre partie", () => {
    const row = { ...base, fromPersonId: "a", toPersonId: "b", message: "Proposition privée", collaborationType: "project", status: "declined", respondedAt: 2, cooldownUntil: 999 }
    const sender = exportableRecord("professionalCollaborations", row, "a")
    expect(sender).toHaveProperty("message", row.message)
    expect(sender).not.toHaveProperty("status")
    expect(sender).not.toHaveProperty("respondedAt")
    expect(sender).not.toHaveProperty("cooldownUntil")
    const recipient = exportableRecord("professionalCollaborations", row, "b")
    expect(recipient).toMatchObject({ decision: "declined", respondedAt: 2 })
    expect(recipient).not.toHaveProperty("message")
    expect(recipient).not.toHaveProperty("fromPersonId")
    expect(exportableRecord("professionalCollaborations", row, "c")).toBeNull()
  })
  it("exporte l'annulation seulement à la partie qui l'a décidée", () => {
    const row = { ...base, fromPersonId: "a", toPersonId: "b", status: "cancelled", cancelledByPersonId: "b", cancelledAt: 3, respondedAt: 2 }
    expect(exportableRecord("professionalCollaborations", row, "a")).not.toHaveProperty("cancelledAt")
    expect(exportableRecord("professionalCollaborations", row, "b")).toMatchObject({ cancelledAt: 3, respondedAt: 2 })
  })
  it("efface la proposition pour l'une ou l'autre partie, pas pour un tiers", () => {
    const row = { ...base, fromPersonId: "a", toPersonId: "b" }
    expect(directlyOwned("professionalCollaborations", row, "a")).toBe(true)
    expect(directlyOwned("professionalCollaborations", row, "b")).toBe(true)
    expect(directlyOwned("professionalCollaborations", row, "c")).toBe(false)
  })
  it("le contexte iCom suit sa proposition sans exporter celle-ci", () => {
    const row = { ...base, kind: "professionalCollaboration", professionalCollaborationId: "proposal", requesterPersonId: "a", responderPersonId: "b", status: "open", sourceText: "foreign" }
    expect(referencesIn(row, shapeFor("contextualThreads"))).toContainEqual({ table: "professionalCollaborations", id: "proposal" })
    expect(exportableRecord("contextualThreads", row, "a")).not.toHaveProperty("sourceText")
    expect(exportableRecord("contextualThreads", row, "c")).toBeNull()
  })
})
