"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import type { CommerceMoney } from "@antsia/social-domain/commerce/primitives"
import type { PaymentActionResult, PaymentContext } from "@convex/modules/shops/paymentRules"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAction } from "convex/react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { CHECKOUT_EXPIRY_WARNING_MS, checkoutExpiringSoon } from "@/components/checkout/checkout-model"
import { useCheckoutClock } from "@/components/checkout/use-checkout-clock"
import { useCartConnectivity } from "@/components/cart/use-cart-draft"
import { Button, Card } from "@/components/shared/controls"
import { ShopLink, useShopAction } from "@/components/shops/shop-ui"
import { routes } from "@/lib/routes"
import { paymentAmount, paymentConsentSchema, paymentDate } from "./payment-model"

type StartIntent = { checkoutAttemptId: string; expectedTotal: CommerceMoney; consentTextVersion: string; clientRequestId: string; readinessRef: string }
type ReadySummary = { checkoutAttemptId: string; amount: CommerceMoney; beneficiaryLabel: string; providerLabel: string; modes: string[]; consentTextVersion: string; expiresAt: number; readinessRef: string; readinessExpiresAt: number }
const LABELED_MODES = new Set(["mobile_money", "airtel_money", "moov_money", "paypal", "card"])

export function PaymentCheckoutPanel({ checkoutAttemptId }: { checkoutAttemptId: string }) {
  const { networkId, personId } = useNetwork()
  return <PaymentContextReader key={JSON.stringify([networkId, personId, checkoutAttemptId])} checkoutAttemptId={checkoutAttemptId} />
}

function PaymentContextReader({ checkoutAttemptId }: { checkoutAttemptId: string }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("payment")
  const router = useRouter()
  const query = useAuthenticatedConvexQuery(api.modules.shops.payment.context, { networkId, checkoutAttemptId })
  const options = useAction(api.modules.shops.paymentActions.options)
  const start = useAction(api.modules.shops.paymentActions.start)
  const action = useShopAction()
  const connectivity = useCartConnectivity()
  const [reviewedGeneration, setReviewedGeneration] = useState(connectivity.generation)
  const suspended = !connectivity.online || reviewedGeneration !== connectivity.generation
  const [intent, setIntent] = useState<StartIntent | null>(null)
  const intentRef = useRef<StartIntent | null>(null)
  const [closed, setClosed] = useState(false)

  const receive = (result: PaymentActionResult) => {
    if (result.outcome === "attempt" && result.attempt.checkoutAttemptId !== checkoutAttemptId) { setClosed(true); return }
    if (result.outcome === "attempt") router.push(routes.paymentAttempt(result.attempt.paymentAttemptId))
    else if (result.outcome === "refused") setClosed(true)
    void query.refetch()
  }
  const send = (next: StartIntent) => {
    if (intentRef.current || suspended || !navigator.onLine) return
    intentRef.current = next
    setIntent(next)
    void action.run(() => start({ networkId, ...next }), receive)
  }
  const resume = () => {
    const same = intentRef.current
    if (!same || !connectivity.online || !navigator.onLine) return
    void action.run(async (): Promise<PaymentActionResult> => {
      // Toujours rechercher le reçu avant de reprendre la même clé ; jamais de nouvelle intention.
      const current = await query.refetch()
      if (!action.current() || !navigator.onLine || current.isError || !current.data) return { outcome: "unavailable" }
      if (current.data.existing) return { outcome: "attempt", attempt: current.data.existing }
      return await start({ networkId, ...same })
    }, receive)
  }

  const refreshOptions = () => {
    if (!connectivity.online || !navigator.onLine) return
    void action.run(async () => {
      const result = await options({ networkId, checkoutAttemptId })
      if (action.current()) await query.refetch()
      return result
    }, (result) => {
      if (result.outcome === "refused") setClosed(true)
      if (result.outcome === "ready") setReviewedGeneration(connectivity.generation)
    })
  }

  if (closed || query.isError || query.data === null) return <Card><div role="alert" className="grid gap-3"><p>{t("unavailable")}</p>{!closed ? <Button variant="outline" onClick={() => { void query.refetch() }}>{t("retryRead")}</Button> : null}</div></Card>
  if (query.isPending || query.data === undefined) return <p role="status">{t("loading")}</p>
  const context: PaymentContext = query.data
  if (context.existing) return <Card><div className="grid gap-3"><h2 className="antsia-subtitle">{t("title")}</h2><p>{t("existingAttempt")}</p><ShopLink href={routes.paymentAttempt(context.existing.paymentAttemptId)}>{t("openAttempt")}</ShopLink></div></Card>
  if (intent) return <Card><div className="grid gap-3"><h2 className="antsia-subtitle">{t("title")}</h2><p role="status">{t("uncertain")}</p><p className="text-sm text-muted-foreground">{t("searchFirst")}</p>{!connectivity.online ? <p role="status">{t("cart:offline")}</p> : null}<Button variant="outline" disabled={!connectivity.online} pending={action.pending} onClick={resume}>{t("sameStart")}</Button><ShopLink href={routes.paymentList()}>{t("myPayments")}</ShopLink>{action.error ? <p role="alert" className="text-sm text-destructive">{t("actionFailed")}</p> : null}</div></Card>
  if (!context.available || context.reason !== null || !context.amount || paymentAmount(context.amount.amount, "fr") === null || context.amount.currency !== "XAF" || context.amount.amount <= 0 ||
    !context.beneficiaryLabel || !context.beneficiaryLabel.trim() || !context.providerLabel || !context.providerLabel.trim() || !context.modes.length || context.modes.some((mode) => !mode.trim()) ||
    !context.expiresAt || paymentDate(context.expiresAt, "fr") === null || !context.readinessRef || !context.readinessExpiresAt || paymentDate(context.readinessExpiresAt, "fr") === null) {
    return <Card><div className="grid gap-3"><h2 className="antsia-subtitle">{t("title")}</h2><p role="status">{t(context.reason === "provider_not_configured" ? "providerUnconfigured" : context.available ? "providerDetailsUnavailable" : "unavailable")}</p>{context.reason === "refresh_required" ? <Button variant="outline" disabled={!connectivity.online} pending={action.pending} onClick={refreshOptions}>{t("refreshOptions")}</Button> : null}{action.error ? <p role="alert" className="text-sm text-destructive">{t("actionFailed")}</p> : null}</div></Card>
  }
  const summary: ReadySummary = { checkoutAttemptId, amount: context.amount, beneficiaryLabel: context.beneficiaryLabel, providerLabel: context.providerLabel, modes: context.modes,
    consentTextVersion: context.consentTextVersion, expiresAt: context.expiresAt, readinessRef: context.readinessRef, readinessExpiresAt: context.readinessExpiresAt }
  return <PaymentConsentForm key={JSON.stringify([summary, connectivity.generation])} summary={summary} suspended={suspended} online={connectivity.online} pending={action.pending} send={send} refreshOptions={refreshOptions} />
}

function PaymentConsentForm({ summary, pending, send, refreshOptions, suspended, online }: { summary: ReadySummary; pending: boolean; send: (intent: StartIntent) => void; refreshOptions: () => void; suspended: boolean; online: boolean }) {
  const { t, i18n } = useTranslation("payment")
  const locale = i18n.resolvedLanguage ?? "fr"
  const deadline = Math.min(summary.expiresAt, summary.readinessExpiresAt)
  const now = useCheckoutClock(deadline, CHECKOUT_EXPIRY_WARNING_MS)
  const expired = now >= deadline
  // P18b (A17) : l'échéance s'annonce AVANT d'être atteinte. Quand c'est
  // l'accord de paiement qui expire le premier, le geste existant de reprise
  // (« Recharger les conditions de paiement ») est offert ; la réserve, elle,
  // ne se prolonge pas — l'écran le dit, sans fausse prolongation.
  const readinessFirst = summary.readinessExpiresAt < summary.expiresAt
  const expiringSoon = !expired && checkoutExpiringSoon(deadline, now)
  const expiryWarning = expiringSoon ? t(readinessFirst ? "expiringSoon" : "expiringSoonReserve", { date: paymentDate(deadline, locale) ?? t("dateUnknown") }) : ""
  const form = useForm<{ accepted: boolean }>({ resolver: zodResolver(paymentConsentSchema(t)), defaultValues: { accepted: false } })
  const accepted = form.watch("accepted")
  const submit = form.handleSubmit(() => {
    if (!accepted || expired || Date.now() >= deadline || pending || suspended || !navigator.onLine) return
    send({ checkoutAttemptId: summary.checkoutAttemptId, expectedTotal: { ...summary.amount }, consentTextVersion: summary.consentTextVersion, readinessRef: summary.readinessRef, clientRequestId: crypto.randomUUID() })
  })
  return <Card><form onSubmit={submit} className="antsia-form-grid"><h2 className="antsia-subtitle">{t("startTitle")}</h2><p>{t("startLead")}</p>
    <dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-sm text-muted-foreground">{t("amount")}</dt><dd className="text-lg font-semibold">{paymentAmount(summary.amount.amount, locale) ?? t("amountUnknown")}</dd></div><div><dt className="text-sm text-muted-foreground">{t("beneficiary")}</dt><dd className="break-words font-semibold">{summary.beneficiaryLabel}</dd></div><div><dt className="text-sm text-muted-foreground">{t("provider")}</dt><dd>{summary.providerLabel}</dd></div></dl>
    <p className="text-sm">{t("expires", { date: paymentDate(deadline, locale) ?? t("dateUnknown") })}</p>
    {expiryWarning ? <div className="grid gap-2"><p className="text-sm font-semibold">{expiryWarning}</p>{readinessFirst && !suspended ? <Button type="button" variant="outline" disabled={!online} pending={pending} onClick={refreshOptions} className="w-full sm:w-auto sm:justify-self-start">{t("refreshOptions")}</Button> : null}</div> : null}
    <p role="status" className="sr-only">{expiryWarning}</p>
    <section className="grid gap-2"><h3 className="font-display text-base font-bold leading-snug">{t("modes")}</h3><ul className="flex flex-wrap gap-2 text-sm">{summary.modes.map((mode) => <li key={mode} className="rounded-[var(--ui2-card-radius)] border border-[color:var(--esp-surface-border)] bg-background px-3 py-2">{t(`modeLabels.${LABELED_MODES.has(mode) ? mode : "other"}`)}</li>)}</ul></section>
    <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-5 shrink-0 accent-primary" disabled={pending || expired || suspended} {...form.register("accepted")} />{t("consent")}</label>
    <p className="text-xs text-muted-foreground">{t("consentVersion", { version: summary.consentTextVersion })}</p>{form.formState.errors.accepted ? <p role="alert" className="text-sm text-destructive">{form.formState.errors.accepted.message}</p> : null}
    {!online ? <p role="status">{t("cart:offline")}</p> : null}{expired || suspended && online ? <><p role="status">{t(expired ? "readyExpired" : "cart:refreshRequired")}</p><Button type="button" variant="outline" disabled={!online} pending={pending} onClick={refreshOptions}>{t("refreshOptions")}</Button></> : null}<Button type="submit" variant="commerce" pending={pending} disabled={!accepted || expired || suspended}>{t("start")}</Button><p className="text-sm text-muted-foreground">{t("noAutomaticCharge")}</p>
  </form></Card>
}
