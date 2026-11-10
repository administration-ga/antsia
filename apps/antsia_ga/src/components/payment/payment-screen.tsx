"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import type { PaymentActionResult, PaymentAttempt } from "@convex/modules/shops/paymentRules"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAction } from "convex/react"
import { useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Button, Card, Field } from "@/components/shared/controls"
import { SCREEN_SECTIONS } from "@/components/shared/screen-layout"
import { SHOP_SELECT_CLASS, ShopFrame, ShopLink, useShopAction } from "@/components/shops/shop-ui"
import { routes } from "@/lib/routes"
import { PAYMENT_REFUND_REASONS, paymentRefundSchema, type PaymentRefundReason, type PaymentRefundValues } from "./payment-model"
import { PaymentStatusCard } from "./payment-status-card"
import { useCartConnectivity } from "@/components/cart/use-cart-draft"

const PAGE_SIZE = 10
type RefundIntent = { paymentAttemptId: string; expectedRevision: number; clientRequestId: string; reason: PaymentRefundReason }

function PaymentFailure({ retry }: { retry?: () => void }) {
  const { t } = useTranslation("payment")
  return <Card><div role="alert" className="grid gap-3"><p>{t("unavailable")}</p>{retry ? <Button variant="outline" onClick={retry}>{t("retryRead")}</Button> : null}<ShopLink href={routes.paymentList()}>{t("myPayments")}</ShopLink></div></Card>
}

export function PaymentAttemptScreen({ paymentAttemptId, returnedFromProvider = false }: { paymentAttemptId: string; returnedFromProvider?: boolean }) {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("payment")
  return <ShopFrame title={t(returnedFromProvider ? "returnTitle" : "attemptTitle")}><ShopLink href={routes.paymentList()}>{t("myPayments")}</ShopLink>{returnedFromProvider ? <Card><p role="status">{t("returnNotice")}</p></Card> : null}<PaymentAttemptReader key={JSON.stringify([networkId, personId, paymentAttemptId])} paymentAttemptId={paymentAttemptId} /></ShopFrame>
}

function PaymentAttemptReader({ paymentAttemptId }: { paymentAttemptId: string }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("payment")
  const query = useAuthenticatedConvexQuery(api.modules.shops.payment.getAttempt, { networkId, paymentAttemptId })
  const [closed, setClosed] = useState(false)
  if (closed || query.data === null) return <PaymentFailure />
  if (query.isError) return <PaymentFailure retry={() => { void query.refetch() }} />
  if (query.isPending || query.data === undefined) return <p role="status">{t("loading")}</p>
  return <div className={`${SCREEN_SECTIONS} gap-y-4`}><PaymentStatusCard attempt={query.data} /><PaymentOperations attempt={query.data} refetch={() => { void query.refetch() }} close={() => setClosed(true)} /></div>
}

function PaymentOperations({ attempt, refetch, close }: { attempt: PaymentAttempt; refetch: () => void; close: () => void }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("payment")
  const status = useAction(api.modules.shops.paymentActions.status)
  const retry = useAction(api.modules.shops.paymentActions.retry)
  const requestRefund = useAction(api.modules.shops.paymentActions.requestRefund)
  const action = useShopAction()
  const connectivity = useCartConnectivity()
  const [reviewedGeneration, setReviewedGeneration] = useState(connectivity.generation)
  const paused = !connectivity.online || reviewedGeneration !== connectivity.generation
  const refundRef = useRef<RefundIntent | null>(null)
  const [refundIntent, setRefundIntent] = useState<RefundIntent | null>(null)
  const [uncertain, setUncertain] = useState(false)
  const refundAllowed = attempt.canRequestRefund && attempt.state === "succeeded" && attempt.paymentState === "succeeded" &&
    attempt.observedAt !== null && Number.isSafeInteger(attempt.observedAt) && attempt.observedAt > 0 && !!attempt.paymentRef && !!attempt.orderRef
  const receive = (result: PaymentActionResult) => {
    if (result.outcome === "refused" || result.outcome === "attempt" && result.attempt.paymentAttemptId !== attempt.paymentAttemptId) { close(); return }
    setUncertain(result.outcome !== "attempt")
    if (result.outcome === "attempt" && result.attempt.refundState && result.attempt.refundState !== "none") { refundRef.current = null; setRefundIntent(null) }
    refetch()
  }
  const run = (operation: () => Promise<PaymentActionResult>) => { if (connectivity.online && navigator.onLine) void action.run(operation, receive) }
  const refund = (reason: PaymentRefundReason) => {
    if (refundRef.current || !refundAllowed || paused || !navigator.onLine) return
    const intent = { paymentAttemptId: attempt.paymentAttemptId, expectedRevision: attempt.revision, clientRequestId: crypto.randomUUID(), reason }
    refundRef.current = intent
    setRefundIntent(intent)
    run(() => requestRefund({ networkId, ...intent }))
  }
  const resumeRefund = () => {
    const same = refundRef.current
    if (!same || !connectivity.online || !navigator.onLine) return
    run(async () => {
      // Un statut peut prouver que la demande a déjà abouti ; ne pas en recréer une autre.
      const current = await status({ networkId, paymentAttemptId: attempt.paymentAttemptId })
      if (!action.current() || !navigator.onLine || current.outcome !== "attempt" || current.attempt.paymentAttemptId !== attempt.paymentAttemptId || current.attempt.refundState !== "none" ||
        current.attempt.state !== "succeeded" || current.attempt.paymentState !== "succeeded" || current.attempt.observedAt === null || !current.attempt.canRequestRefund) return current
      return await requestRefund({ networkId, ...same })
    })
  }
  const resumePayment = () => {
    run(async () => {
      const current = await status({ networkId, paymentAttemptId: attempt.paymentAttemptId })
      if (!action.current() || !navigator.onLine || current.outcome !== "attempt" || current.attempt.paymentAttemptId !== attempt.paymentAttemptId || current.attempt.state !== "unknown" || !current.attempt.canRetry) return current
      return await retry({ networkId, paymentAttemptId: attempt.paymentAttemptId })
    })
  }
  return <Card><div className="grid gap-4">
    {!connectivity.online ? <p role="status">{t("cart:offline")}</p> : paused ? <p role="status">{t("purchases:onlineReview")}</p> : null}
    {attempt.canRefresh ? <Button variant="outline" disabled={!connectivity.online} pending={action.pending} onClick={() => run(async () => { const result = await status({ networkId, paymentAttemptId: attempt.paymentAttemptId }); if (action.current() && result.outcome === "attempt" && result.attempt.paymentAttemptId === attempt.paymentAttemptId) setReviewedGeneration(connectivity.generation); return result })}>{t("checkStatus")}</Button> : null}
    {attempt.canRetry ? <Button variant="outline" disabled={!connectivity.online} pending={action.pending} onClick={resumePayment}>{t("retrySameAttempt")}</Button> : null}
    {refundIntent ? <div className="grid gap-3"><p role="status">{t("searchFirst")}</p><Button variant="outline" disabled={!connectivity.online} pending={action.pending} onClick={resumeRefund}>{t("retrySameAttempt")}</Button></div> : refundAllowed ? <PaymentRefundForm key={JSON.stringify([attempt.paymentAttemptId, attempt.revision, connectivity.generation])} pending={action.pending || paused} submit={refund} /> : null}
    {uncertain || action.error ? <p role="alert" className="text-sm text-destructive">{t("actionFailed")}</p> : null}<p className="text-sm text-muted-foreground">{t("noAutomaticCharge")}</p>
  </div></Card>
}

function PaymentRefundForm({ pending, submit }: { pending: boolean; submit: (reason: PaymentRefundReason) => void }) {
  const { t } = useTranslation("payment")
  const form = useForm<PaymentRefundValues>({ resolver: zodResolver(paymentRefundSchema(t)), defaultValues: { accepted: false } })
  const accepted = form.watch("accepted")
  return <form className="grid gap-4 border-t border-border pt-4" onSubmit={form.handleSubmit((values) => { if (!pending && values.accepted) submit(values.reason) })}>
    <h3 className="font-display text-base font-bold leading-snug">{t("refundTitle")}</h3><p>{t("refundLead")}</p>
    <Field id="payment-refund-reason" label={t("refundReason")} error={form.formState.errors.reason?.message}><select id="payment-refund-reason" className={SHOP_SELECT_CLASS} disabled={pending} {...form.register("reason")}><option value="">{t("validationRefundReason")}</option>{PAYMENT_REFUND_REASONS.map((reason) => <option key={reason} value={reason}>{t(`refundReasons.${reason}`)}</option>)}</select></Field>
    <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-5 shrink-0 accent-primary" disabled={pending} {...form.register("accepted")} />{t("refundConsent")}</label>{form.formState.errors.accepted ? <p role="alert" className="text-sm text-destructive">{form.formState.errors.accepted.message}</p> : null}
    <Button type="submit" pending={pending} disabled={!accepted}>{t("requestRefund")}</Button><p className="text-sm text-muted-foreground">{t("refundNoGuarantee")}</p>
  </form>
}

export function PaymentListScreen() {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("payment")
  return <ShopFrame title={t("listTitle")} lead={t("listLead")}><ShopLink href={routes.myOrders()}>{t("backToOrders")}</ShopLink><PaymentListReader key={JSON.stringify([networkId, personId])} /></ShopFrame>
}
function PaymentListReader() {
  const { networkId } = useNetwork()
  const { t } = useTranslation("payment")
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const cursor = cursors[cursors.length - 1] ?? null
  const query = useAuthenticatedConvexQuery(api.modules.shops.payment.listMy, { networkId, paginationOpts: { cursor, numItems: PAGE_SIZE } })
  if (query.isError) return <PaymentFailure retry={() => { void query.refetch() }} />
  if (query.isPending || !query.data) return <p role="status">{t("loading")}</p>
  return <div className="grid gap-4"><p className="text-sm text-muted-foreground">{t("pageScope", { count: PAGE_SIZE })}</p>{query.data.page.length ? <ul className={`${SCREEN_SECTIONS} gap-y-4`}>{query.data.page.map((attempt) => <li key={attempt.paymentAttemptId}><PaymentStatusCard attempt={attempt} compact /></li>)}</ul> : <Card><p>{t("empty")}</p></Card>}<nav aria-label={t("pagination")} className="flex flex-wrap gap-3">{cursors.length > 1 ? <Button variant="outline" onClick={() => setCursors((previous) => previous.slice(0, -1))}>{t("previous")}</Button> : null}{!query.data.isDone && query.data.continueCursor ? <Button variant="outline" onClick={() => setCursors((previous) => [...previous, query.data!.continueCursor])}>{t("next")}</Button> : null}</nav></div>
}
