import { describe, expect, it } from "vitest"
import { contactRequestSurface } from "./contact-request-model"

const base = {
  shop: { data: { name: "Atelier" }, isError: false },
  offer: { data: { actions: { contact: true } }, isError: false },
  existing: { data: null, isError: false },
  offerScoped: true,
}
describe("U07 : droits de nouveau contact et accès historique séparés", () => {
  it("ouvre le formulaire seulement depuis une offre connue avec contact courant", () => {
    expect(contactRequestSurface(base)).toBe("request")
    expect(contactRequestSurface({ ...base, offerScoped: false })).toBe("unavailable")
    expect(contactRequestSurface({ ...base, offer: { data: { actions: { contact: false } }, isError: false } })).toBe("unavailable")
  })
  it("une lecture inconnue n'est ni une permission ni une absence d'échange", () => {
    expect(contactRequestSurface({ ...base, existing: { data: undefined, isError: false } })).toBe("loading")
    expect(contactRequestSurface({ ...base, offer: { data: undefined, isError: false } })).toBe("loading")
  })
  it("un refus masque un ancien DTO plutôt que l'utiliser comme autorité", () => {
    expect(contactRequestSurface({ ...base, offer: { ...base.offer, isError: true } })).toBe("unavailable")
    expect(contactRequestSurface({ ...base, existing: { data: { threadId: "old" }, isError: true } })).toBe("unavailable")
  })
  it("un échange existant autorisé reste ouvrable après retrait de l'offre ou de la vitrine", () => {
    expect(contactRequestSurface({ ...base, offerScoped: false, shop: { data: null, isError: true }, offer: { data: null, isError: false }, existing: { data: { threadId: "historical" }, isError: false } })).toBe("existing")
  })
  it("une ancienne réponse pendant une lecture initiale ne réouvre pas la demande", () => {
    expect(contactRequestSurface({ ...base, existing: { data: { threadId: "old" }, isError: false, isPending: true } })).toBe("loading")
  })
})
