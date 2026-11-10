"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { COMMERCE_ORDER_CANCEL_REASONS, COMMERCE_ORDER_RETURN_REASONS, COMMERCE_ORDER_RECEIPT_TEXT, COMMERCE_ORDER_RECEIPT_VERSION } from "@antsia/social-domain/commerce-orders"
import type { Purchase, PurchaseActionResult } from "@convex/modules/shops/purchaseRules"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAction } from "convex/react"
import { useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useCartConnectivity } from "@/components/cart/use-cart-draft"
import { useCheckoutClock } from "@/components/checkout/use-checkout-clock"
import { paymentDate } from "@/components/payment/payment-model"
import { Button, Card, Field, TextArea } from "@/components/shared/controls"
import { SCREEN_SECTIONS } from "@/components/shared/screen-layout"
import { SHOP_SELECT_CLASS, ShopFrame, ShopLink, useShopAction } from "@/components/shops/shop-ui"
import { routes } from "@/lib/routes"
import { PurchaseCard } from "./purchase-card"
import { PURCHASE_COMMAND_DEFAULTS, purchaseCommandSchema, type PurchaseCommand, type PurchaseCommandValues } from "./purchase-model"
import { ServiceRequestsNotice } from "./service-requests-notice"

function PurchaseFailure() { const { t } = useTranslation("purchases"); return <Card><p role="alert">{t("unavailable")}</p></Card> }
export function PurchasesScreen() {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("purchases")
  return <ShopFrame title={t("title")} lead={t("lead")}><div className="flex flex-wrap gap-2"><ShopLink href={routes.cart()}>{t("cart")}</ShopLink><ShopLink href={routes.myOrders()}>{t("preparations")}</ShopLink></div><ServiceRequestsNotice /><PurchasesWindow key={JSON.stringify([networkId, personId])} /></ShopFrame>
}
function PurchasesWindow() {
  const { networkId } = useNetwork()
  const { t } = useTranslation("purchases")
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const query = useAuthenticatedConvexQuery(api.modules.shops.purchases.listMy, { networkId, paginationOpts: { cursor: cursors.at(-1) ?? null, numItems: 10 } })
  if (query.isError) return <PurchaseFailure />
  if (query.isPending || !query.data) return <p role="status">{t("loading")}</p>
  return <div className="grid gap-4"><p className="text-sm text-muted-foreground">{t("scope", { count: 10 })}</p>{query.data.page.length ? <ul className={`${SCREEN_SECTIONS} gap-y-4`}>{query.data.page.map((purchase) => <li key={purchase.purchaseId}><PurchaseCard purchase={purchase} compact /></li>)}</ul> : <Card><p>{t("empty")}</p></Card>}<nav aria-label={t("pagination")} className="flex flex-wrap gap-3">{cursors.length > 1 ? <Button variant="outline" onClick={() => setCursors((items) => items.slice(0, -1))}>{t("previous")}</Button> : null}{!query.data.isDone ? <Button variant="outline" onClick={() => setCursors((items) => [...items, query.data!.continueCursor])}>{t("next")}</Button> : null}</nav></div>
}
export function PurchaseScreen({ purchaseId }: { purchaseId: string }) {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("purchases")
  return <ShopFrame title={t("detailTitle")}><ShopLink href={routes.purchases()}>{t("back")}</ShopLink><PurchaseReader key={JSON.stringify([networkId, personId, purchaseId])} purchaseId={purchaseId} /></ShopFrame>
}
function PurchaseReader({ purchaseId }: { purchaseId: string }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("purchases")
  const query = useAuthenticatedConvexQuery(api.modules.shops.purchases.get, { networkId, purchaseId })
  const [closed, setClosed] = useState(false)
  if (closed || query.isError || query.data === null) return <PurchaseFailure />
  if (query.isPending || query.data === undefined) return <p role="status">{t("loading")}</p>
  return <div className={`${SCREEN_SECTIONS} gap-y-5`}><PurchaseCard purchase={query.data} /><PurchaseOperations purchase={query.data} close={() => setClosed(true)} refetch={() => { void query.refetch() }} /></div>
}
type PurchaseIntent = { operation: PurchaseCommand; actionId: string; expectedRevision: number; reason: string; text: string; consentTextVersion: string }
function PurchaseOperations({ purchase, close, refetch }: { purchase: Purchase; close: () => void; refetch: () => void }) {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("purchases")
  const connectivity = useCartConnectivity()
  const [reviewedGeneration, setReviewedGeneration] = useState(connectivity.generation)
  const clock = useCheckoutClock(purchase.observedAt ? purchase.observedAt + 5 * 60_000 : null)
  const stale = purchase.stale || purchase.observedAt === null || clock - purchase.observedAt >= 5 * 60_000
  const paused = !connectivity.online || reviewedGeneration !== connectivity.generation || stale || !purchase.available
  const action = useShopAction()
  const refresh = useAction(api.modules.shops.purchasesActions.refresh)
  const status = useAction(api.modules.shops.purchasesActions.actionStatus)
  const retryStored = useAction(api.modules.shops.purchasesActions.retryStored)
  const cancel = useAction(api.modules.shops.purchasesActions.cancel)
  const receipt = useAction(api.modules.shops.purchasesActions.confirmReceipt)
  const requestReturn = useAction(api.modules.shops.purchasesActions.requestReturn)
  const sendMessage = useAction(api.modules.shops.purchasesActions.sendMessage)
  const intentRef = useRef<PurchaseIntent | null>(null)
  const [intent, setIntent] = useState<PurchaseIntent | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const receive = (result: PurchaseActionResult) => {
    if (result.outcome === "refused" || result.outcome === "purchase" && result.purchaseId !== purchase.purchaseId) { close(); return }
    if (result.outcome !== "purchase") { setNotice("unknownAction"); return }
    if (intentRef.current && result.action && result.action.actionId !== intentRef.current.actionId) { close(); return }
    if (result.action?.state === "accepted" || result.action?.state === "refused") { intentRef.current = null; setIntent(null) }
    setNotice(result.action?.state === "accepted" ? "accepted" : result.action?.state === "not_found" ? "notFound" : result.action?.state === "refused" ? "refused" : result.action ? "unknownAction" : null)
    refetch()
  }
  const execute = async (same: PurchaseIntent): Promise<PurchaseActionResult> => {
    const common = { networkId, purchaseId: purchase.purchaseId, actionId: same.actionId, expectedRevision: same.expectedRevision }
    if (same.operation === "cancel_request") return await cancel({ ...common, reason: same.reason as typeof COMMERCE_ORDER_CANCEL_REASONS[number] })
    if (same.operation === "receipt_confirm") return await receipt({ ...common, consentTextVersion: same.consentTextVersion })
    if (same.operation === "return_request") return await requestReturn({ ...common, reason: same.reason as typeof COMMERCE_ORDER_RETURN_REASONS[number] })
    return await sendMessage({ ...common, text: same.text })
  }
  const submit = (operation: PurchaseCommand, values: PurchaseCommandValues) => {
    if (intentRef.current || paused || !navigator.onLine || !purchase.order || !action.current()) return
    const next: PurchaseIntent = { operation, actionId: crypto.randomUUID(), expectedRevision: purchase.order.revision, reason: values.reason, text: values.text, consentTextVersion: COMMERCE_ORDER_RECEIPT_VERSION }
    intentRef.current = next; setIntent(next)
    void action.run(() => execute(next), receive)
  }
  const resume = () => {
    const same = intentRef.current
    if (!same || !connectivity.online || !navigator.onLine) return
    void action.run(async () => {
      const found = await status({ networkId, purchaseId: purchase.purchaseId, actionId: same.actionId })
      if (!action.current() || !navigator.onLine || found.outcome !== "purchase" || found.purchaseId !== purchase.purchaseId || found.action?.actionId !== same.actionId || found.action.state !== "not_found") return found
      return await execute(same)
    }, receive)
  }
  const unresolved = purchase.pendingActions.filter((item) => item.state === "unknown" || item.state === "not_found")
  const order = purchase.order
  return <Card><div className="grid gap-5">
    {!connectivity.online ? <p role="status">{t("offline")}</p> : reviewedGeneration !== connectivity.generation ? <p role="status">{t("onlineReview")}</p> : stale ? <p role="status">{t("stale")}</p> : null}
    <Button variant="outline" pending={action.pending} disabled={!connectivity.online} onClick={() => { if (!navigator.onLine) return; void action.run(() => refresh({ networkId, purchaseId: purchase.purchaseId }), (result) => { receive(result); if (result.outcome === "purchase") setReviewedGeneration(connectivity.generation) }) }}>{t("refresh")}</Button>
    {unresolved.length ? <section className="grid gap-3"><p>{t("pending")}</p>{unresolved.map((item) => <div key={item.actionId} className="grid gap-2 rounded-lg border border-border bg-background p-3"><p>{t(`operations.${item.operation}`)}</p><Button variant="outline" pending={action.pending} disabled={!connectivity.online || !!intent} onClick={() => { if (navigator.onLine) void action.run(() => status({ networkId, purchaseId: purchase.purchaseId, actionId: item.actionId }), receive) }}>{t("actionStatus")}</Button>{item.canRetry ? <Button variant="outline" pending={action.pending} disabled={!connectivity.online || !!intent} onClick={() => { if (navigator.onLine) void action.run(() => retryStored({ networkId, purchaseId: purchase.purchaseId, actionId: item.actionId }), receive) }}>{t("resume")}</Button> : null}</div>)}</section> : null}
    {intent ? <div className="grid gap-3"><p>{t("unknownAction")}</p><Button variant="outline" pending={action.pending} disabled={!connectivity.online} onClick={resume}>{t("resume")}</Button></div> : order && unresolved.length === 0 ? <>
      {order.capabilities.canConfirmReceipt ? <PurchaseCommandForm key={`receipt:${order.revision}:${connectivity.generation}`} operation="receipt_confirm" paused={paused || action.pending} onSubmit={(values) => submit("receipt_confirm", values)} /> : null}
      {order.capabilities.canCancel ? <PurchaseCommandForm key={`cancel:${order.revision}`} operation="cancel_request" paused={paused || action.pending} onSubmit={(values) => submit("cancel_request", values)} /> : null}
      {order.capabilities.canRequestReturn ? <PurchaseCommandForm key={`return:${order.revision}`} operation="return_request" paused={paused || action.pending} onSubmit={(values) => submit("return_request", values)} /> : null}
      {order.capabilities.canRequestRefund ? <ShopLink href={routes.paymentAttempt(purchase.paymentAttemptId)}>{t("refund")}</ShopLink> : null}
      {order.capabilities.canMessage ? <PurchaseCommandForm key={`message:${order.revision}`} operation="support_message" paused={paused || action.pending} onSubmit={(values) => submit("support_message", values)} /> : null}
    </> : null}
    {order ? <section className="grid gap-3"><h2 className="font-semibold">{t("support")}</h2><p className="text-sm text-muted-foreground">{t("supportLead")}</p><ul className="grid gap-3">{order.messages.map((message) => <li key={message.messageRef} className="grid gap-1 rounded-xl border border-border bg-background p-3"><p className="text-xs font-semibold">{t(message.side === "buyer" ? "buyer" : "sellerSide")}</p><p className="whitespace-pre-wrap break-words">{message.text}</p><p className="text-xs text-muted-foreground">{paymentDate(message.createdAt, i18n.resolvedLanguage ?? "fr") ?? t("unknown")}</p></li>)}</ul>{order.messagesTruncated ? <p className="text-sm">{t("messagesTruncated")}</p> : null}</section> : null}
    {notice ? <p role="status">{t(notice)}</p> : null}{action.error ? <p role="alert">{t("actionFailed")}</p> : null}
  </div></Card>
}
function PurchaseCommandForm({ operation, paused, onSubmit }: { operation: PurchaseCommand; paused: boolean; onSubmit: (values: PurchaseCommandValues) => void }) {
  const { t, i18n } = useTranslation("purchases")
  const form = useForm<PurchaseCommandValues>({ resolver: zodResolver(purchaseCommandSchema(operation, t)), defaultValues: PURCHASE_COMMAND_DEFAULTS })
  const reasonChoices = operation === "cancel_request" ? COMMERCE_ORDER_CANCEL_REASONS : COMMERCE_ORDER_RETURN_REASONS
  const title = operation === "receipt_confirm" ? "receiptAction" : operation === "cancel_request" ? "cancelAction" : operation === "return_request" ? "returnAction" : "sendMessage"
  const accepted = form.watch("accepted")
  return <form className="grid gap-3 border-t border-border pt-4" onSubmit={form.handleSubmit((values) => { if (!paused && navigator.onLine) onSubmit(values) })}><h2 className="font-semibold">{t(title)}</h2><fieldset disabled={paused} className="grid min-w-0 gap-3">
    {operation === "receipt_confirm" ? <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-5 shrink-0 accent-primary" {...form.register("accepted")} />{COMMERCE_ORDER_RECEIPT_TEXT[i18n.resolvedLanguage === "en" ? "en" : "fr"]}</label> : operation === "support_message" ? <Field id="purchase-message" label={t("message")} error={form.formState.errors.text?.message}><TextArea id="purchase-message" maxLength={1000} {...form.register("text")} /></Field> : <Field id={`purchase-${operation}-reason`} label={t("reason")} error={form.formState.errors.reason?.message}><select id={`purchase-${operation}-reason`} className={SHOP_SELECT_CLASS} {...form.register("reason")}><option value="">{t("choose")}</option>{reasonChoices.map((reason) => <option key={reason} value={reason}>{t(`${operation === "cancel_request" ? "cancelReasons" : "returnReasons"}.${reason}`)}</option>)}</select></Field>}
    {form.formState.errors.accepted ? <p role="alert" className="text-sm text-destructive">{form.formState.errors.accepted.message}</p> : null}
    <Button type="submit" disabled={paused || operation === "receipt_confirm" && !accepted}>{t(title)}</Button>
  </fieldset>{operation === "receipt_confirm" ? <p className="text-xs text-muted-foreground">{t("receiptNotice")}</p> : operation !== "support_message" ? <p className="text-xs text-muted-foreground">{t("actionNote")}</p> : null}</form>
}
