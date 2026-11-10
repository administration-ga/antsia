"use client"

import type { CommerceOrderView } from "@antsia/social-domain/commerce-orders"
import type { Purchase } from "@convex/modules/shops/purchaseRules"
import { useTranslation } from "react-i18next"
import { paymentAmount, paymentDate } from "@/components/payment/payment-model"
import { Card } from "@/components/shared/controls"
import { ShopLink } from "@/components/shops/shop-ui"
import { routes } from "@/lib/routes"
import { useBusinessAnnouncement } from "@/lib/use-business-announcement"

export function PurchaseCard({ purchase, compact = false }: { purchase: Purchase; compact?: boolean }) {
  const { t, i18n } = useTranslation("purchases")
  const locale = i18n.resolvedLanguage ?? "fr"
  const order = purchase.order
  const date = paymentDate(purchase.observedAt, locale)
  const announcement = useBusinessAnnouncement(purchase.purchaseId, order ? {
    order: order.orderState, payment: order.paymentState, stock: order.stockState, refund: order.refundState, stale: String(purchase.stale),
    fulfillment: order.fulfillment.state,
    receipt: order.receipt && paymentDate(order.receipt.confirmedAt, locale) ? "confirmed" : "unknown",
    settlement: order.settlementState, cancellation: order.cancellationState, return: order.returnState,
    actions: JSON.stringify([...new Set(purchase.pendingActions.map(action => action.state))].sort()),
  } : null, changed => {
    if (!order) return ""
    const parts: string[] = []
    if (changed.includes("stale") && purchase.stale) parts.push(t("stale"))
    for (const kind of ["order", "payment", "stock", "refund"] as const) {
      if (changed.includes(kind)) parts.push(t(`payment:${kind}Status`) + " : " + t(`payment:${kind}States.${order[`${kind}State`]}`))
    }
    if (changed.includes("fulfillment")) parts.push(t("fulfillment") + " : " + t(`fulfillmentStates.${order.fulfillment.state}`))
    if (changed.includes("receipt")) parts.push(order.receipt && paymentDate(order.receipt.confirmedAt, locale) ? t("announcements.receiptConfirmed") : t("receiptUnknown"))
    if (changed.includes("settlement")) parts.push(t(`settlementStates.${order.settlementState}`))
    if (changed.includes("cancellation")) parts.push(t("cancellation") + " : " + t(`cancellationStates.${order.cancellationState}`))
    if (changed.includes("return")) parts.push(t("return") + " : " + t(`returnStates.${order.returnState}`))
    if (changed.includes("actions")) {
      const stateKeys = { accepted: "accepted", unknown: "unknownAction", refused: "refused", not_found: "notFound" } as const
      for (const state of [...new Set(purchase.pendingActions.map(action => action.state))].sort()) parts.push(t(stateKeys[state]))
    }
    return parts.length ? t("announcements.changed", { changes: parts.join(" ; ") }) : ""
  }, !compact)
  const liveStatus = !compact ? <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</p> : null
  if (!order) return <Card><div className="grid gap-3">{liveStatus}<p>{t("noSnapshot")}</p>{compact ? <ShopLink href={routes.purchase(purchase.purchaseId)}>{t("open")}</ShopLink> : null}</div></Card>
  return <Card><div className="grid gap-4">
    {liveStatus}
    <h2 className="text-lg font-semibold break-words">{t("reference", { reference: order.reference })}</h2>
    <p>{order.sellerLabel ? t("seller", { name: order.sellerLabel }) : t("sellerUnknown")}</p>
    <p className="text-lg font-semibold">{paymentAmount(order.amount.amount, locale) ?? t("amountUnknown")}</p>
    <dl className="grid gap-3 sm:grid-cols-2 [&>div]:min-w-0 [&>div]:rounded-[var(--esp-field-radius)] [&>div]:bg-muted [&>div]:p-3">{(["order", "payment", "stock", "refund"] as const).map((kind) => <div key={kind}><dt className="text-sm text-muted-foreground">{t(`payment:${kind}Status`)}</dt><dd>{t(`payment:${kind}States.${order[`${kind}State`]}`)}</dd></div>)}</dl>
    <p className="text-sm text-muted-foreground">{date ? t("observed", { date }) : t("unknown")}</p>
    {purchase.stale ? <p className="text-sm">{t("stale")}</p> : null}
    {compact ? <ShopLink href={routes.purchase(purchase.purchaseId)}>{t("open")}</ShopLink> : <>
      <ul className="grid gap-3">{order.lines.map((line, index) => <li key={index} className="grid gap-1 rounded-[var(--ui2-card-radius)] border border-[color:var(--esp-surface-border)] bg-background p-4"><h3 className="font-display text-base font-bold leading-snug break-words">{line.label}</h3><p className="text-sm">{t("line", { quantity: line.quantity, unit: paymentAmount(line.unitAmount.amount, locale) ?? t("amountUnknown"), amount: paymentAmount(line.lineAmount.amount, locale) ?? t("amountUnknown") })}</p></li>)}</ul>
      <section className="grid gap-2"><h3 className="font-display text-base font-bold leading-snug">{t("fees")}</h3><ul className="grid gap-1 text-sm">{order.fees.map((fee, index) => <li key={index}>{fee.label} : {paymentAmount(fee.amount.amount, locale) ?? t("amountUnknown")}</li>)}</ul></section>
      <section className="grid gap-2"><h3 className="font-display text-base font-bold leading-snug">{t("fulfillment")}</h3><p>{t(`fulfillmentModes.${order.fulfillment.mode}`)}</p><p>{t(`fulfillmentStates.${order.fulfillment.state}`)}</p>{order.fulfillment.locality ? <p>{t("locality", { locality: order.fulfillment.locality })}</p> : null}{order.fulfillment.leadTimeDays !== null ? <p>{t("leadTime", { count: order.fulfillment.leadTimeDays })}</p> : null}</section>
      <section className="grid gap-2"><h3 className="font-display text-base font-bold leading-snug">{t("receipt")}</h3><p>{order.receipt && paymentDate(order.receipt.confirmedAt, locale) ? t("receiptConfirmed", { date: paymentDate(order.receipt.confirmedAt, locale) }) : t("receiptUnknown")}</p><p className="text-sm text-muted-foreground">{t("receiptNotice")}</p></section>
      <section className="grid gap-2"><h3 className="font-display text-base font-bold leading-snug">{t("settlement")}</h3><p>{t(`settlementStates.${order.settlementState}`)}</p><p className="text-sm text-muted-foreground">{t("settlementNotice")}</p></section>
      <dl className="grid gap-3 sm:grid-cols-2 [&>div]:min-w-0 [&>div]:rounded-[var(--esp-field-radius)] [&>div]:bg-muted [&>div]:p-3"><div><dt className="text-sm text-muted-foreground">{t("cancellation")}</dt><dd>{t(`cancellationStates.${order.cancellationState}`)}</dd></div><div><dt className="text-sm text-muted-foreground">{t("return")}</dt><dd>{t(`returnStates.${order.returnState}`)}</dd></div></dl>
      <PurchaseHistory order={order} locale={locale} />
      <ShopLink href={routes.paymentAttempt(purchase.paymentAttemptId)}>{t("payment")}</ShopLink>
    </>}
  </div></Card>
}
function PurchaseHistory({ order, locale }: { order: CommerceOrderView; locale: string }) {
  const { t } = useTranslation("purchases")
  return <section className="grid gap-3"><h3 className="font-display text-base font-bold leading-snug">{t("history")}</h3>{order.history.length ? <ol className="grid gap-3 border-l border-border pl-4">{order.history.map((event, index) => <li key={index}><p>{t(`payment:orderStates.${event.status}`)}</p><p className="text-xs text-muted-foreground">{paymentDate(event.at, locale) ?? t("unknown")}</p></li>)}</ol> : <p>{t("historyEmpty")}</p>}{order.historyTruncated ? <p className="text-sm text-muted-foreground">{t("historyTruncated")}</p> : null}</section>
}
