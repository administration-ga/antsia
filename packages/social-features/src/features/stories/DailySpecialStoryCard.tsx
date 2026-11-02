"use client"

import { useRoutes } from "@antsia/api/network"
import { Link } from "@antsia/api/routing"
import type { CommercePrice } from "@antsia/social-domain/commerce/projection"
import { ArrowUpRight } from "lucide-react"
import type { KeyboardEvent } from "react"
import { useTranslation } from "react-i18next"

/** Projection courante relue par le moteur ; aucune donnée de gestion ni copie du catalogue. */
export type DailySpecialStoryOffer = Readonly<{
  shopHandle: string
  shopName: string
  offerRef: string
  title: string
  price: CommercePrice
  day: string
}>

/** Les flèches servent au lecteur quand sa scène a le focus, pas quand on parcourt cette carte. */
function keepCardKeyboard(event: KeyboardEvent<HTMLElement>) {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(event.key)) {
    event.stopPropagation()
  }
}

/** Le plat reste une offre : le lien ouvre sa vraie fiche, où disponibilité et droits sont relus. */
export function DailySpecialStoryCard({ offer, onFocusWithinChange }: {
  offer: DailySpecialStoryOffer
  onFocusWithinChange?: (focused: boolean) => void
}) {
  const { t, i18n } = useTranslation("stories")
  const routes = useRoutes()
  const locale = i18n.resolvedLanguage ?? i18n.language
  const number = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: offer.price.currency,
    currencyDisplay: "code",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  const amount = (value: number) => number.format(value)
  const price = offer.price.mode === "quote" ? t("dailySpecial.onQuote")
    : offer.price.mode === "range" ? t("dailySpecial.priceRange", { min: amount(offer.price.minAmount), max: amount(offer.price.maxAmount) })
      : amount(offer.price.amount)
  const unit = offer.price.mode === "unit" || offer.price.mode === "range" ? offer.price.unit : undefined
  const href = routes.shopOffer?.(offer.shopHandle, offer.offerRef)

  return (
    <article
      className="st-daily-special-card"
      aria-label={t("dailySpecial.cardLabel", { title: offer.title, shop: offer.shopName })}
      data-daily-special-story-card
      onPointerDown={event => event.stopPropagation()}
      onPointerUp={event => event.stopPropagation()}
      onPointerMove={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
      onKeyDown={keepCardKeyboard}
      onFocusCapture={() => onFocusWithinChange?.(true)}
      onBlurCapture={event => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
          onFocusWithinChange?.(false)
        }
      }}
    >
      <div className="st-daily-special-heading">
        <span className="st-daily-special-label">{t("dailySpecial.label")}</span>
        <span className="st-daily-special-shop">{offer.shopName}</span>
      </div>
      <h2 className="st-daily-special-title">{offer.title}</h2>
      <div className="st-daily-special-footer">
        <p className="st-daily-special-price">{unit ? t("dailySpecial.priceUnit", { amount: price, unit }) : price}</p>
        {href ? (
          <Link href={href} className="st-daily-special-order">
            {t("dailySpecial.order")}
            <ArrowUpRight aria-hidden="true" size={17} />
          </Link>
        ) : null}
      </div>
      <p className="st-daily-special-expiry">{t("dailySpecial.untilMidnight")}</p>
    </article>
  )
}
