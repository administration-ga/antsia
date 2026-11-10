import { describe, expect, it } from "vitest"
import { catalogOfferFixture, catalogVariantFixture, VARIANT_REF } from "@/components/shops/__tests__/catalog-fixtures"
import { initialOfferVariantSelection, offerSelectionMode, offerVariantChoices, resolveOfferVariantSelection, updateOfferOptionSelection } from "./offer-variant-selection"

const V2 = "pro.ga:offer_variant:01JA00000000000000000000V2"
const V3 = "pro.ga:offer_variant:01JA00000000000000000000V3"
function clothing() {
  return catalogOfferFixture({ variantAxes: ["Couleur", "Taille"], variants: [catalogVariantFixture({ options: ["Rouge", "S"], amount: 12000 }), catalogVariantFixture({ variantRef: V2, label: "Rouge M", options: ["Rouge", "M"], amount: 13000, availability: "out_of_stock" }), catalogVariantFixture({ variantRef: V3, label: "Bleu L", options: ["Bleu", "L"], amount: 14000, unit: "pièce" })] })
}

describe("MP05c — sélection progressive sur les seules variantes publiées", () => {
  it("attend le premier axe et désactive les combinaisons sans variante disponible", () => {
    const offer = clothing()
    expect(offerSelectionMode(offer)).toBe("axes")
    expect(offerVariantChoices(offer, [], 0)).toEqual([{ value: "Rouge", disabled: false }, { value: "Bleu", disabled: false }])
    expect(offerVariantChoices(offer, [], 1).every(choice => choice.disabled)).toBe(true)
    expect(offerVariantChoices(offer, ["Rouge", ""], 1)).toEqual([{ value: "S", disabled: false }, { value: "M", disabled: true }, { value: "L", disabled: true }])
    expect(resolveOfferVariantSelection(offer, { options: ["Rouge", ""] })).toMatchObject({ status: "incomplete", canAdd: false, unitAmount: null })
  })
  it("changer la couleur efface la taille incompatible et ne choisit pas la suivante", () => {
    const offer = clothing()
    expect(updateOfferOptionSelection(offer, ["Rouge", "S"], 0, "Bleu")).toEqual(["Bleu", ""])
    expect(updateOfferOptionSelection(offer, ["", ""], 1, "S")).toEqual(["", ""])
    expect(updateOfferOptionSelection(offer, ["Rouge", "S"], 0, "Inconnue")).toEqual(["Rouge", "S"])
    expect(updateOfferOptionSelection(offer, ["Rouge", "S"], 0, "")).toEqual(["", ""])
  })
  it("retient exactement la référence, le prix, l'unité et la disponibilité choisis", () => {
    const offer = clothing()
    expect(resolveOfferVariantSelection(offer, { options: ["Bleu", "L"] })).toMatchObject({ status: "selected", canAdd: true, unitAmount: 14000, unit: "pièce", availability: "in_stock", variant: { variantRef: V3 } })
    expect(resolveOfferVariantSelection(offer, { options: ["Rouge", "M"] })).toMatchObject({ status: "unavailable", canAdd: false })
    expect(resolveOfferVariantSelection(offer, { options: ["Bleu", "S"] })).toMatchObject({ status: "unavailable", canAdd: false })
  })
  it("refuse un couple d'options ambigu même lorsqu'une seule variante annonce du stock", () => {
    const offer = clothing()
    offer.variants.push(catalogVariantFixture({ variantRef: V2, options: ["Rouge", "S"], availability: "out_of_stock" }))
    expect(resolveOfferVariantSelection(offer, { options: ["Rouge", "S"] })).toMatchObject({ status: "ambiguous", canAdd: false })
    expect(offerVariantChoices(offer, [], 0).find(choice => choice.value === "Rouge")?.disabled).toBe(true)
  })
  it("le repli plat exige une référence unique et n'admet pas une option retirée", () => {
    const offer = catalogOfferFixture({ variantAxes: [], variants: [catalogVariantFixture({ options: [] })] })
    expect(offerSelectionMode(offer)).toBe("flat")
    expect(resolveOfferVariantSelection(offer, { options: [] }).status).toBe("incomplete")
    expect(resolveOfferVariantSelection(offer, { options: [], variantRef: VARIANT_REF })).toMatchObject({ canAdd: true, variant: { variantRef: VARIANT_REF } })
    offer.variants.push(catalogVariantFixture({ options: [] }))
    expect(resolveOfferVariantSelection(offer, { options: [], variantRef: VARIANT_REF })).toMatchObject({ status: "ambiguous", canAdd: false })
  })
  it("des axes sans candidat ou une forme incohérente n'autorisent pas le prix de base", () => {
    const offer = clothing()
    expect(offerSelectionMode({ ...offer, variants: [] })).toBe("invalid")
    expect(resolveOfferVariantSelection({ ...offer, variants: [] }, { options: [] }).canAdd).toBe(false)
    expect(offerSelectionMode({ ...offer, variantAxes: ["A", "B", "C"] })).toBe("invalid")
    expect(offerSelectionMode({ ...offer, variants: [catalogVariantFixture({ options: ["Rouge"] })] })).toBe("invalid")
  })
  it("une offre simple conserve son prix exact mais refuse épuisement et devis", () => {
    const offer = catalogOfferFixture({ variantAxes: [], variants: [], price: { mode: "unit", currency: "XAF", amount: 1000, unit: "mètre" } })
    expect(resolveOfferVariantSelection(offer, { options: [] })).toMatchObject({ canAdd: true, unitAmount: 1000, unit: "mètre" })
    expect(resolveOfferVariantSelection({ ...offer, availability: { ...offer.availability, state: "out_of_stock" } }, { options: [] }).canAdd).toBe(false)
    expect(resolveOfferVariantSelection({ ...offer, price: { mode: "quote", currency: "XAF" } }, { options: [] }).canAdd).toBe(false)
    expect(resolveOfferVariantSelection({ ...offer, price: { mode: "range", currency: "XAF", minAmount: 1000, maxAmount: 2000 } }, { options: [] }).canAdd).toBe(false)
  })
  it("restaure seulement une référence encore présente et disponible, sans déduire un choix", () => {
    const offer = clothing()
    expect(initialOfferVariantSelection(offer)).toEqual({ options: ["", ""], variantRef: "", quantity: "1" })
    expect(initialOfferVariantSelection(offer, { variantRef: V3, quantity: 3 })).toEqual({ options: ["Bleu", "L"], variantRef: V3, quantity: "3" })
    expect(initialOfferVariantSelection(offer, { variantRef: V2, quantity: 1000 })).toEqual({ options: ["", ""], variantRef: "", quantity: "1" })
    expect(initialOfferVariantSelection({ ...offer, variants: offer.variants.filter(variant => variant.variantRef !== V3) }, { variantRef: V3, quantity: 2 })).toEqual({ options: ["", ""], variantRef: "", quantity: "2" })
  })
  it("un état inconnu demeure indicatif et ne se transforme pas en stock prouvé", () => {
    const offer = clothing()
    offer.variants[0]!.availability = "unknown"
    expect(resolveOfferVariantSelection(offer, { options: ["Rouge", "S"] })).toMatchObject({ canAdd: true, availability: "unknown" })
  })
})
