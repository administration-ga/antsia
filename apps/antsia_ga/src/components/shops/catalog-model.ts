import type { CatalogOffer } from "@convex/modules/shops/catalogValidators"
import type { CommercePrice } from "@antsia/social-domain/commerce/projection"

export type { CatalogOffer }
export type CatalogPage = { page: CatalogOffer[]; continueCursor: string; isDone: boolean; collections: { collectionRef: string; label: string }[]; filteredWindow: boolean; indexStatus?: "building" | "ready" }
export type CatalogTranslate = (key: string, options?: Record<string, unknown>) => string
export type CatalogAudience = "member" | "public"

export function catalogAmount(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "XAF", currencyDisplay: "code", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)
}

/** Une fourchette/devis ne devient jamais un montant exact à payer. */
export function catalogPrice(price: CommercePrice, locale: string, t: CatalogTranslate): string {
  if (price.mode === "quote") return t("catalog.onQuote")
  const value = price.mode === "range"
    ? t("catalog.priceRange", { min: catalogAmount(price.minAmount, locale), max: catalogAmount(price.maxAmount, locale) })
    : catalogAmount(price.amount, locale)
  const unit = price.mode === "unit" || price.mode === "range" ? price.unit : undefined
  return unit ? t("catalog.priceUnit", { amount: value, unit }) : value
}

/** Une variante sans unité propre conserve l'unité exacte du tarif unitaire. */
export function catalogVariantPrice(price: CommercePrice, variant: CatalogOffer["variants"][number], locale: string, t: CatalogTranslate): string {
  const unit = variant.unit ?? (price.mode === "unit" ? price.unit : null)
  const amount = catalogAmount(variant.amount, locale)
  return unit ? t("catalog.priceUnit", { amount, unit }) : amount
}

export function catalogAvailability(availability: CatalogOffer["availability"], t: CatalogTranslate, state = availability.state, nowMs = Date.now()): string {
  if (state === null) return t("catalog.availability.notShared")
  if (availability.stale || (availability.updatedAt !== null && nowMs - availability.updatedAt > 15 * 60 * 1000)) return t("catalog.availability.stale")
  if (availability.updatedAt === null || state === "unknown") return t("catalog.availability.unknown")
  return t(`catalog.availability.${state}`)
}

export function catalogDate(value: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Libreville" }).format(value)
}
