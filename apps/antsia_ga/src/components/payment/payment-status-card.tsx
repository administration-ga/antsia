"use client"

import { isSigningOutEverywhere } from "@antsia/api/sign-out-everywhere"
import type { PaymentAttempt } from "@convex/modules/shops/paymentRules"
import { useTranslation } from "react-i18next"
import { useEffect, useRef, useState } from "react"
import { useCartConnectivity } from "@/components/cart/use-cart-draft"

import { buttonClassName, Card } from "@/components/shared/controls"
import { ShopLink } from "@/components/shops/shop-ui"
import { routes } from "@/lib/routes"
import { paymentAmount, paymentDate, safeProviderRedirect } from "./payment-model"

/** Les paramètres de navigation n'entrent jamais dans cette projection de faits serveur. */
export function PaymentStatusCard({ attempt, compact = false }: { attempt: PaymentAttempt; compact?: boolean }) {
  const { t, i18n } = useTranslation("payment")
  const locale = i18n.resolvedLanguage ?? "fr"
  const connectivity = useCartConnectivity()
  const observation = useRef({ generation: connectivity.generation, at: attempt.observedAt, revision: attempt.revision })
  if (observation.current.at !== attempt.observedAt || observation.current.revision !== attempt.revision) observation.current = { generation: connectivity.generation, at: attempt.observedAt, revision: attempt.revision }
  const observed = paymentDate(attempt.observedAt, locale)
  const confirmed = attempt.state === "succeeded" && attempt.paymentState === "succeeded" && observed !== null && !!attempt.paymentRef && !!attempt.orderRef
  const state = attempt.state === "succeeded" && !confirmed ? "unknown" : attempt.state
  const paymentState = attempt.paymentState === "succeeded" && !confirmed ? null : attempt.paymentState
  const refundState = attempt.refundState === "confirmed" && observed === null ? null : attempt.refundState
  const providerAction = connectivity.online && observation.current.generation === connectivity.generation && !compact && attempt.canRefresh && !attempt.reviewRequired && attempt.state === "requires_action" && attempt.paymentState === "requires_action" && attempt.action?.kind === "provider_redirect"
  const redirect = providerAction && attempt.action?.kind === "provider_redirect" ? safeProviderRedirect(attempt.action.url) : null
  /**
   * P18b (A18, WCAG 4.1.3) : le passage d'un état à l'autre (« en cours » →
   * « réussi ») ne se faisait qu'en silence. Une région polie PERSISTANTE dit
   * le nouvel état, jamais au premier rendu ; la liste compacte, elle, reste
   * muette (une annonce par ligne serait du bruit).
   */
  const stateLabel = t(`attemptStates.${state}`)
  const announcedState = useRef<string | null>(null)
  const [stateAnnouncement, setStateAnnouncement] = useState("")
  useEffect(() => {
    if (compact) return
    if (announcedState.current === null || announcedState.current === stateLabel) {
      announcedState.current = stateLabel
      return
    }
    announcedState.current = stateLabel
    setStateAnnouncement(t("stateChanged", { state: stateLabel }))
  }, [compact, stateLabel, t])
  return <Card><div className="grid gap-4">
    <h2 className="antsia-subtitle">{stateLabel}</h2>
    {!compact ? <p role="status" className="sr-only">{stateAnnouncement}</p> : null}
    <p className="text-lg font-semibold">{paymentAmount(attempt.amount.amount, locale) ?? t("amountUnknown")}</p>
    {!compact ? <dl className="grid gap-3 sm:grid-cols-2 [&>div]:min-w-0 [&>div]:rounded-[var(--esp-field-radius)] [&>div]:bg-muted [&>div]:p-3">
      <div><dt className="text-sm text-muted-foreground">{t("paymentStatus")}</dt><dd className="font-medium">{paymentState ? t(`paymentStates.${paymentState}`) : t("stateUnknown")}</dd></div>
      <div><dt className="text-sm text-muted-foreground">{t("orderStatus")}</dt><dd className="font-medium">{attempt.orderState ? t(`orderStates.${attempt.orderState}`) : t("stateUnknown")}</dd></div>
      <div><dt className="text-sm text-muted-foreground">{t("stockStatus")}</dt><dd>{attempt.stockState ? t(`stockStates.${attempt.stockState}`) : t("stateUnknown")}</dd></div>
      <div><dt className="text-sm text-muted-foreground">{t("refundStatus")}</dt><dd>{refundState ? t(`refundStates.${refundState}`) : t("stateUnknown")}</dd></div>
    </dl> : null}
    <p className="text-sm text-muted-foreground">{observed ? t("observed", { date: observed }) : t("dateUnknown")}</p>
    {attempt.reviewRequired ? <div role="status" className="grid gap-2 rounded-[var(--ui2-card-radius)] border border-[color:var(--esp-surface-border)] bg-background p-[var(--esp-card-padding,16px)]"><h3 className="font-display text-base font-bold leading-snug">{t("reviewRequired")}</h3><p>{t("reviewHint")}</p></div> : null}
    {state === "unknown" || state === "submitting" || state === "unavailable" ? <p role="status" className="text-sm">{t("searchFirst")}</p> : null}
    {!compact ? <>
      <section className="grid gap-2"><h3 className="font-display text-base font-bold leading-snug">{t("fulfillmentStatus")}</h3><p className="text-sm text-muted-foreground">{t("fulfillmentUnconfirmed")}</p></section>
      <p className="text-sm text-muted-foreground">{t("sellerSettlementNotice")}</p>
      {!connectivity.online ? <p role="status">{t("cart:offline")}</p> : observation.current.generation !== connectivity.generation ? <p role="status">{t("purchases:onlineReview")}</p> : null}
      {providerAction ? <div className="grid gap-2"><p>{t("providerActionLead")}</p>{redirect ? <a className={buttonClassName("commerce")} href={redirect} rel="noopener noreferrer" referrerPolicy="no-referrer" onClick={(event) => { if (isSigningOutEverywhere() || !navigator.onLine) event.preventDefault() }}>{t("providerAction")}</a> : <p role="alert">{t("providerActionUnavailable")}</p>}</div> : null}
      <div className="flex flex-wrap gap-2"><ShopLink href={routes.checkoutAttempt(attempt.checkoutAttemptId)}>{t("backToPreparation")}</ShopLink><ShopLink href={routes.paymentList()}>{t("myPayments")}</ShopLink>{attempt.orderRef ? <ShopLink href={routes.purchase(attempt.paymentAttemptId)}>{t("purchases:title")}</ShopLink> : null}</div>
    </> : <ShopLink href={routes.paymentAttempt(attempt.paymentAttemptId)}>{t("openAttempt")}</ShopLink>}
  </div></Card>
}
