import { COMMERCE_MAX_AMOUNT_XAF } from "@antsia/social-domain/commerce/primitives"
import type { CatalogOffer } from "@convex/modules/shops/catalogValidators"

export type OfferInitialSelection = { variantRef?: string; quantity?: number }
export type SelectionOffer = Pick<CatalogOffer, "price" | "variants" | "variantAxes" | "availability">
export type OfferVariant = SelectionOffer["variants"][number]
export type OfferSelectionInput = { options: readonly string[]; variantRef?: string }
export type OfferSelectionResult = { status: "selected" | "incomplete" | "unavailable" | "ambiguous" | "notPurchasable"; variant: OfferVariant | null; unitAmount: number | null; unit: string | null; availability: CatalogOffer["availability"]["state"]; canAdd: boolean }

export function offerSelectionMode(offer: SelectionOffer): "none" | "axes" | "flat" | "invalid" {
  if (offer.variantAxes.length > 2) return "invalid"
  if (!offer.variants.length) return offer.variantAxes.length ? "invalid" : "none"
  if (offer.variantAxes.length === 0) return "flat"
  return offer.variants.every(variant => variant.options.length === offer.variantAxes.length && variant.options.every(value => value.length > 0)) ? "axes" : "invalid"
}

function ambiguousVariant(offer: SelectionOffer, variant: OfferVariant): boolean {
  if (offer.variants.filter(candidate => candidate.variantRef === variant.variantRef).length !== 1) return true
  return offerSelectionMode(offer) === "axes" && offer.variants.filter(candidate => JSON.stringify(candidate.options) === JSON.stringify(variant.options)).length !== 1
}
function validAmount(value: number): boolean { return Number.isSafeInteger(value) && value >= 0 && value <= COMMERCE_MAX_AMOUNT_XAF }
function variantAvailable(offer: SelectionOffer, variant: OfferVariant): boolean { return offer.price.mode !== "quote" && offer.availability.state !== "out_of_stock" && variant.availability !== "out_of_stock" && validAmount(variant.amount) && !ambiguousVariant(offer, variant) }

/** Les bornes de début/fin sont déjà appliquées par la projection serveur ; seuls ses candidats sont admis. */
export function offerVariantChoices(offer: SelectionOffer, selected: readonly string[], axis: number): { value: string; disabled: boolean }[] {
  if (offerSelectionMode(offer) !== "axes" || axis < 0 || axis >= offer.variantAxes.length) return []
  const values = [...new Set(offer.variants.map(variant => variant.options[axis]!))]
  const prefixComplete = selected.slice(0, axis).length === axis && selected.slice(0, axis).every(Boolean)
  return values.map(value => ({ value, disabled: !prefixComplete || !offer.variants.some(variant => variant.options[axis] === value && selected.slice(0, axis).every((previous, index) => variant.options[index] === previous) && variantAvailable(offer, variant)) }))
}

/** Une modification ne choisit jamais une autre option à la place de la personne. */
export function updateOfferOptionSelection(offer: SelectionOffer, selected: readonly string[], axis: number, value: string): string[] {
  if (offerSelectionMode(offer) !== "axes" || axis < 0 || axis >= offer.variantAxes.length) return []
  const next = offer.variantAxes.map((_label, index) => selected[index] ?? "")
  if (value && !offerVariantChoices(offer, selected, axis).some(choice => choice.value === value && !choice.disabled)) return next
  next[axis] = value
  for (let index = axis + 1; index < next.length; index += 1) {
    if (!next.slice(0, index).every(Boolean) || !offerVariantChoices(offer, next, index).some(choice => choice.value === next[index] && !choice.disabled)) next[index] = ""
  }
  return next
}

export function resolveOfferVariantSelection(offer: SelectionOffer, input: OfferSelectionInput): OfferSelectionResult {
  const unavailable = (status: OfferSelectionResult["status"], variant: OfferVariant | null = null): OfferSelectionResult => ({ status, variant, unitAmount: variant && validAmount(variant.amount) ? variant.amount : null, unit: variant?.unit ?? (offer.price.mode === "unit" ? offer.price.unit : null), availability: variant?.availability ?? offer.availability.state, canAdd: false })
  const mode = offerSelectionMode(offer)
  if (offer.price.mode === "quote" || mode === "invalid") return unavailable("notPurchasable")
  if (mode === "none") {
    if (input.variantRef || !["fixed", "unit"].includes(offer.price.mode)) return unavailable("notPurchasable")
    const amount = offer.price.mode === "fixed" || offer.price.mode === "unit" ? offer.price.amount : null
    if (amount === null || !validAmount(amount)) return unavailable("notPurchasable")
    return { status: offer.availability.state === "out_of_stock" ? "unavailable" : "selected", variant: null, unitAmount: amount, unit: offer.price.mode === "unit" ? offer.price.unit : null, availability: offer.availability.state, canAdd: offer.availability.state !== "out_of_stock" }
  }
  if (mode === "axes" && (input.options.length !== offer.variantAxes.length || input.options.some(value => !value))) return unavailable("incomplete")
  if (mode === "flat" && !input.variantRef) return unavailable("incomplete")
  const candidates = offer.variants.filter(variant => mode === "flat" ? variant.variantRef === input.variantRef : variant.options.every((value, index) => value === input.options[index]))
  if (candidates.length > 1) return unavailable("ambiguous")
  const variant = candidates[0]
  if (!variant) return unavailable("unavailable")
  if (ambiguousVariant(offer, variant)) return unavailable("ambiguous")
  if (!variantAvailable(offer, variant)) return unavailable("unavailable", variant)
  return { status: "selected", variant, unitAmount: variant.amount, unit: variant.unit ?? (offer.price.mode === "unit" ? offer.price.unit : null), availability: variant.availability ?? offer.availability.state, canAdd: true }
}

export function initialOfferVariantSelection(offer: SelectionOffer, initial: OfferInitialSelection = {}): { options: string[]; variantRef: string; quantity: string } {
  const quantity = Number.isSafeInteger(initial.quantity) && initial.quantity! >= 1 && initial.quantity! <= 999 ? String(initial.quantity) : "1"
  const empty = { options: offer.variantAxes.map(() => ""), variantRef: "", quantity }
  if (!initial.variantRef) return empty
  const variants = offer.variants.filter(variant => variant.variantRef === initial.variantRef)
  const variant = variants[0]
  if (variants.length !== 1 || !variant || !variantAvailable(offer, variant)) return empty
  return { options: [...variant.options], variantRef: variant.variantRef, quantity }
}
