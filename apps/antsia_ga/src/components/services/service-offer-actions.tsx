"use client"

import { useNetwork } from "@antsia/api/network"
import type { CatalogOffer } from "@convex/modules/shops/catalogValidators"
import { CalendarClock, FileText, ShoppingBag } from "lucide-react"
import Link from "next/link"
import { useTranslation } from "react-i18next"

import { Button, buttonClassName } from "@/components/shared/controls"
import { ShopLink } from "@/components/shops/shop-ui"
import { ServiceReviewNotice } from "./service-intent-guard"
import { useServiceOptions } from "./use-service-options"
import { routes } from "@/lib/routes"
import { serviceAmount } from "./service-model"

// Devis, créneau, prestation : couleur du commerce (ADR-0027), sur la facture commune des boutons.
const ACTION_LINK = buttonClassName("commerce")

/**
 * Les parcours d'une offre de SERVICE, tels que PRO.GA les sert pour cette personne : devis,
 * créneau, prestation à tarif fixe. Aucun bouton n'est montré sans réponse corrélée ; aucun
 * paiement ni acompte n'est proposé.
 */
export function ServiceOfferActions({ offer }: { offer: CatalogOffer }) {
  const { networkId, personId } = useNetwork()
  return <ServiceOfferOptions key={JSON.stringify([networkId, personId, offer.shopHandle, offer.offerRef, offer.revision])} offer={offer} />
}

function ServiceOfferOptions({ offer }: { offer: CatalogOffer }) {
  const { t, i18n } = useTranslation("services")
  const { options, review, read, pending, error } = useServiceOptions(offer.shopHandle, offer.offerRef)
  const locale = i18n.resolvedLanguage ?? "fr"
  if (!options && !error && !review.paused) return <p role="status" className="text-sm text-muted-foreground">{t("offer.loading")}</p>
  if (!options || options.outcome !== "ready") {
    return <div className="grid gap-2" role="status">
      <ServiceReviewNotice review={review} onReview={read} />
      <p className="text-sm text-muted-foreground">{t(options?.outcome === "refused" ? "offer.closed" : "offer.unavailable")}</p>
      <div className="flex flex-wrap gap-2"><Button variant="outline" pending={pending} disabled={!review.online} onClick={() => { void review.refresh(read) }}>{t("offer.retry")}</Button><ShopLink href={routes.serviceRequests()}>{t("requests.title")}</ShopLink></div>
    </div>
  }
  const modes = [options.quote.available, options.booking !== null, options.fixedOrder !== null].filter(Boolean).length
  return <section aria-label={t("offer.title")} className="grid w-full gap-3 rounded-[var(--ui2-card-radius)] border border-[color:var(--esp-surface-border)] bg-background p-4">
    <ServiceReviewNotice review={review} onReview={read} />
    <h2 className="text-lg font-semibold">{t("offer.title")}</h2>
    {modes === 0 ? <p className="text-sm text-muted-foreground">{t("offer.none")}</p> : review.paused ? null : <div className="flex flex-wrap gap-3">
      {options.quote.available ? <Link className={ACTION_LINK} href={routes.serviceQuote(offer.shopHandle, offer.offerRef)}><FileText aria-hidden="true" className="size-4" />{t("offer.quote")}</Link> : null}
      {options.booking ? <Link className={ACTION_LINK} href={routes.serviceBooking(offer.shopHandle, offer.offerRef)}><CalendarClock aria-hidden="true" className="size-4" />{t("offer.booking")}</Link> : null}
      {options.fixedOrder ? <Link className={ACTION_LINK} href={routes.serviceOrder(offer.shopHandle, offer.offerRef)}><ShoppingBag aria-hidden="true" className="size-4" />{t("offer.order")}</Link> : null}
    </div>}
    {options.fixedOrder ? <p className="text-sm">{options.fixedOrder.unit ? t("offer.fixedPriceUnit", { amount: serviceAmount(options.fixedOrder.unitAmount.amount, locale), unit: options.fixedOrder.unit }) : t("offer.fixedPrice", { amount: serviceAmount(options.fixedOrder.unitAmount.amount, locale) })}</p> : null}
    <p className="text-xs text-muted-foreground">{t("offer.noPayment")}</p>
    <ShopLink href={routes.serviceRequests()}>{t("requests.title")}</ShopLink>
  </section>
}
