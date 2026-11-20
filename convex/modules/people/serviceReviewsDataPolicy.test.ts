// @vitest-environment edge-runtime
/** DG-016 : propriété personnelle de l'avis, signature collective de la réponse. */
import { describe, expect, it } from "vitest"

import { anonymizeReferences, directlyOwned, exportableRecord, shapeFor } from "./dataInventory"
import { DATA_TABLE_POLICIES } from "./dataPolicies"

const review = {
  _id: "review", _creationTime: 1, networkId: "diaspora-ga", requestId: "request", bookingId: "booking",
  offerId: "offer", pageId: "page", authorPersonId: "requester", rating: 4, body: "Prestation conforme.",
  proof: "booking_confirmed", consentToPublishAt: 1, version: 1, status: "active", createdAt: 1, updatedAt: 1,
}
const reply = {
  _id: "reply", _creationTime: 1, networkId: "diaspora-ga", reviewId: "review", pageId: "page",
  authorPersonId: "signatory", body: "Merci pour votre retour.", version: 1, status: "active", createdAt: 1, updatedAt: 1,
}

describe("droits sur les données des avis de service", () => {
  it("l'avis appartient au demandeur, sans ouvrir la réponse au signataire", () => {
    expect(directlyOwned("serviceReviews", review, "requester")).toBe(true)
    expect(directlyOwned("serviceReviews", review, "signatory")).toBe(false)
    expect(exportableRecord("serviceReviews", review, "requester")).toMatchObject({ body: review.body })
    expect(exportableRecord("serviceReviews", review, "signatory")).toBeNull()
  })

  it("l'effacement d'un signataire ne possède pas la réponse de la page", () => {
    expect(directlyOwned("serviceReviewReplies", reply, "signatory")).toBe(false)
    expect(exportableRecord("serviceReviewReplies", reply, "signatory")).toBeNull()
    expect(exportableRecord("serviceReviewReplies", reply, "requester")).toBeNull()
  })

  it("anonymise la référence d'audit sans altérer le contenu collectif", () => {
    expect(anonymizeReferences(reply, shapeFor("serviceReviewReplies"), "signatory", "anonymous")).toEqual({
      ...reply, authorPersonId: "anonymous",
    })
  })

  it("la cascade d'effacement suit la demande puis l'avis, jamais le signataire", () => {
    expect(DATA_TABLE_POLICIES.serviceReviews).toEqual({ owners: ["authorPersonId"], parents: ["requestId"] })
    expect(DATA_TABLE_POLICIES.serviceReviewReplies).toEqual({ owners: [], parents: ["reviewId"] })
  })
})
