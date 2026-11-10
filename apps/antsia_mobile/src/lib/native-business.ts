import type { api } from "@antsia/api/engine"
import { parseCommerceRef } from "@antsia/social-domain/commerce/primitives"
import type { FunctionReturnType } from "convex/server"
import { canAppendNativeCursor } from "./native-pagination"

export type NativeBusinessOffer = NonNullable<FunctionReturnType<typeof api.modules.shops.catalog.offer>>
export type NativeStorefront = NonNullable<FunctionReturnType<typeof api.modules.shops.shops.storefront>>
export type NativeBusinessPrice = NativeBusinessOffer["price"]
export type NativeBusinessFilters = { kind?: "product" | "service"; query?: string; collectionRef?: string; sort: "newest" | "price_asc" | "price_desc" | "relevance" }
export const NATIVE_BUSINESS_PAGE_SIZE = 12
export const NATIVE_BUSINESS_MAX_PAGES = 5

export function nativeBusinessHandle(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,99}$/u.test(value)
}
export function nativeDemoOffer(value: unknown): value is string {
  return typeof value === "string" && /^demo:offer:[a-z0-9][a-z0-9._-]{0,159}$/u.test(value)
}
/** Keep the server reference opaque. A page, URL or storage identifier is never an offer route. */
export function nativeBusinessOfferTarget(handle: unknown, offerRef: unknown): { handle: string; offerRef: string } | null {
  if (!nativeBusinessHandle(handle) || typeof offerRef !== "string") return null
  return nativeDemoOffer(offerRef) || parseCommerceRef(offerRef)?.kind === "offer" ? { handle, offerRef } : null
}
export function nativeBusinessQuery(value: string): string | null {
  if (value.length > 120 || /\p{Cc}/u.test(value)) return null
  const query = value.trim()
  const words = query.match(/[\p{L}\p{N}]+/gu) ?? []
  return query && (words.length === 0 || words.length > 16) ? null : query
}
export function nativeBusinessText(t: (key: string) => string, key: string, values: Readonly<Record<string, string | number>>): string {
  return t(`mobile.business.${key}`).replace(/\{\{(\w+)\}\}/gu, (match, name: string) => String(values[name] ?? match))
}
export function nativeBusinessMoney(amount: number, locale: string): string | null {
  if (!Number.isSafeInteger(amount) || amount < 0) return null
  return new Intl.NumberFormat(locale, { style: "currency", currency: "XAF", currencyDisplay: "code", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)
}
/** XAF amounts are francs, not cents. Quote and range prices remain visibly distinct. */
export function nativeBusinessPrice(price: NativeBusinessPrice, locale: string, t: (key: string) => string): string {
  const missing = t("mobile.business.priceUnavailable")
  if (price.currency !== "XAF") return missing
  if (price.mode === "quote") return t("mobile.business.priceQuote")
  if (price.mode === "range") {
    const min = nativeBusinessMoney(price.minAmount, locale), max = nativeBusinessMoney(price.maxAmount, locale)
    if (!min || !max || price.minAmount > price.maxAmount) return missing
    const amount = nativeBusinessText(t, "priceRange", { min, max })
    return price.unit ? nativeBusinessText(t, "priceUnit", { amount, unit: price.unit }) : amount
  }
  const amount = nativeBusinessMoney(price.amount, locale)
  if (!amount || (price.mode === "unit" && !price.unit.trim())) return missing
  return price.mode === "unit" ? nativeBusinessText(t, "priceUnit", { amount, unit: price.unit }) : amount
}
/** An empty filtered window is not an end marker; repeated cursors and unbounded windows are refused. */
export function nativeBusinessCanAdvance<C>(cursors: readonly (C | null)[], next: C | null | undefined, isDone = false): boolean {
  if (isDone || (typeof next === "string" && (!next || next.length > 8192))) return false
  return canAppendNativeCursor(cursors, next, NATIVE_BUSINESS_MAX_PAGES)
}
/** Recheck the pending state, not the render snapshot: two queued gestures must not adopt one cursor twice. */
export function nativeBusinessAdvance<C>(cursors: (C | null)[], next: C | null | undefined, isDone = false): (C | null)[] {
  return next != null && nativeBusinessCanAdvance(cursors, next, isDone) ? [...cursors, next] : cursors
}
export function nativeBusinessPrevious<C>(cursors: (C | null)[]): (C | null)[] {
  return cursors.length > 1 ? cursors.slice(0, -1) : cursors
}
export function nativeBusinessContactAllowed(offer: Pick<NativeBusinessOffer, "offerRef" | "actions">, demoEnvironment: boolean): boolean {
  return !demoEnvironment && !nativeDemoOffer(offer.offerRef) && (offer.actions.contact || offer.actions.quote || offer.actions.purchase)
}
/** Only an explicit public demo asset may be resolved against the configured public origin. */
export function nativeBusinessMediaUrl(value: string | null, webUrl?: string): string | null {
  if (!value || /[\p{Cc}\s\\]/u.test(value)) return null
  try {
    if (value.startsWith("/")) {
      if (!/^\/demo-media\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp|avif)$/u.test(value) || !webUrl) return null
      const origin = new URL(webUrl)
      if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) return null
      return new URL(value, origin.origin).href
    }
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null
  } catch { return null }
}
