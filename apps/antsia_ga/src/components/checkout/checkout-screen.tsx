"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import type { CatalogOffer } from "@convex/modules/shops/catalogValidators"
import type { CheckoutActionResult, CheckoutAttempt } from "@convex/modules/shops/checkoutRules"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAction } from "convex/react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Button, Card } from "@/components/shared/controls"
import { SCREEN_SECTIONS } from "@/components/shared/screen-layout"
import { ShopFrame, ShopLink, useShopAction } from "@/components/shops/shop-ui"
import { routes } from "@/lib/routes"
import { PaymentCheckoutPanel } from "@/components/payment/payment-checkout-panel"
import { CheckoutPreparationForm, type CheckoutOptions } from "./checkout-form"
import { CHECKOUT_EXPIRY_WARNING_MS, CHECKOUT_PAGE_SIZE, checkoutAmount, checkoutConsentSchema, checkoutDate, checkoutExpired, checkoutExpiringSoon } from "./checkout-model"
import { CheckoutSummary } from "./checkout-summary"
import { useCheckoutClock } from "./use-checkout-clock"
import { useCartConnectivity } from "@/components/cart/use-cart-draft"

function CheckoutFailure({ retry }: { retry?: () => void }) {
  const { t } = useTranslation("checkout")
  return <Card><div role="alert" className="grid gap-3"><p>{t("unavailable")}</p>{retry ? <Button variant="outline" onClick={retry}>{t("retryRead")}</Button> : null}</div></Card>
}

export function CheckoutPrepareScreen({ handle, offerRef }: { handle: string; offerRef: string }) {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("checkout")
  return <ShopFrame title={t("title")} lead={t("lead")}><div className="flex flex-wrap gap-2"><ShopLink href={routes.shopOffer(handle, offerRef)}>{t("backToOffer")}</ShopLink><ShopLink href={routes.myOrders()}>{t("myOrders")}</ShopLink></div><PreparationContext key={JSON.stringify([networkId, personId, handle, offerRef])} handle={handle} offerRef={offerRef} /></ShopFrame>
}
function PreparationContext({ handle, offerRef }: { handle: string; offerRef: string }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("checkout")
  const query = useAuthenticatedConvexQuery(api.modules.shops.checkout.context, { networkId, handle, offerRef })
  if (query.isError) return <CheckoutFailure retry={() => { void query.refetch() }} />
  if (query.isPending || !query.data) return <p role="status">{t("loading")}</p>
  if (!query.data.available || !query.data.offer) return <CheckoutFailure />
  if (query.data.pending) return <Card><div className="grid gap-3"><p>{t("pendingExists")}</p><ShopLink href={routes.checkoutAttempt(query.data.pending.attemptId)}>{t("openAttempt")}</ShopLink></div></Card>
  return <PreparationOptions handle={handle} offer={query.data.offer} consentTextVersion={query.data.consentTextVersion} refreshContext={async () => { const fresh = await query.refetch(); return !fresh.isError && !!fresh.data?.available && fresh.data.reason === null && !fresh.data.pending }} />
}
function PreparationOptions({ handle, offer, consentTextVersion, refreshContext }: { handle: string; offer: CatalogOffer; consentTextVersion: string; refreshContext: () => Promise<boolean> }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("checkout")
  const router = useRouter()
  const load = useAction(api.modules.shops.checkoutActions.options)
  const prepare = useAction(api.modules.shops.checkoutActions.prepare)
  const action = useShopAction()
  const connectivity = useCartConnectivity()
  const [reviewedGeneration, setReviewedGeneration] = useState<number | null>(null)
  const [options, setOptions] = useState<CheckoutOptions | null>(null)
  const [refused, setRefused] = useState(false)
  return <div className="grid gap-4">{!options || reviewedGeneration !== connectivity.generation ? <Card><div className="grid gap-3"><h2 className="text-lg font-semibold">{offer.title}</h2><p className="text-sm text-muted-foreground">{t("optionsLead")}</p><Button pending={action.pending} disabled={!connectivity.online} variant="outline" onClick={() => { if (!navigator.onLine) return; void action.run(async () => { if (!await refreshContext() || !action.current() || !navigator.onLine) return { outcome: "unavailable" as const }; return await load({ networkId, handle }) }, (result) => { if (result.outcome === "ready") { setRefused(false); setOptions(result); setReviewedGeneration(connectivity.generation) } else { setOptions(null); setRefused(true) } }) }}>{t("loadOptions")}</Button>{refused || action.error ? <p role="alert">{t("optionsUnavailable")}</p> : null}</div></Card> : null}{options ? <CheckoutPreparationForm offer={offer} options={options} consentTextVersion={consentTextVersion} consentEpoch={JSON.stringify([offer.revision, offer.price, connectivity.generation])} suspended={!connectivity.online || reviewedGeneration !== connectivity.generation || action.pending} prepare={(input) => prepare({ networkId, handle, ...input })} onAttempt={(attemptId) => router.push(routes.checkoutAttempt(attemptId))} /> : null}</div>
}

export function CheckoutAttemptScreen({ attemptId }: { attemptId: string }) {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("checkout")
  return <ShopFrame title={t("attemptTitle")}><ShopLink href={routes.myOrders()}>{t("myOrders")}</ShopLink><AttemptQuery key={JSON.stringify([networkId, personId, attemptId])} attemptId={attemptId} /></ShopFrame>
}
function AttemptQuery({ attemptId }: { attemptId: string }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("checkout")
  const [closed, setClosed] = useState(false)
  const query = useAuthenticatedConvexQuery(api.modules.shops.checkout.getAttempt, { networkId, attemptId })
  if (closed) return <CheckoutFailure />
  if (query.isError) return <CheckoutFailure retry={() => { void query.refetch() }} />
  if (query.isPending || query.data === undefined) return <p role="status">{t("loading")}</p>
  if (!query.data) return <CheckoutFailure />
  return <AttemptDetails attempt={query.data} refetch={() => { void query.refetch() }} onRefused={() => setClosed(true)} />
}
function AttemptDetails({ attempt, refetch, onRefused }: { attempt: CheckoutAttempt; refetch: () => void; onRefused: () => void }) {
  const { t, i18n } = useTranslation("checkout")
  const locale = i18n.resolvedLanguage ?? "fr"
  const now = useCheckoutClock(attempt.expiresAt, CHECKOUT_EXPIRY_WARNING_MS)
  const reserved = attempt.state === "held" || attempt.state === "reconfirm"
  const expired = reserved && checkoutExpired(attempt.expiresAt, now)
  const state = expired ? "expired" : attempt.state
  // P18b (A17) : la réserve s'annonce AVANT son échéance ; le moteur n'offre
  // aucune prolongation, l'écran n'en simule donc aucune.
  const expiringSoon = reserved && !expired && checkoutExpiringSoon(attempt.expiresAt, now)
  const expiryWarning = expiringSoon && attempt.expiresAt ? t("expiringSoon", { date: checkoutDate(attempt.expiresAt, locale) }) : ""
  return <div className={`${SCREEN_SECTIONS} gap-y-5`}><Card><div className="grid gap-3"><h2 className="text-xl font-semibold">{t(`states.${state}`)}</h2><p role="status">{t(`${state}Hint`)}</p>{expiryWarning ? <p className="text-sm font-semibold">{expiryWarning}</p> : null}<p role="status" className="sr-only">{expiryWarning}</p><p className="text-sm text-muted-foreground">{t("created", { date: checkoutDate(attempt.createdAt, locale) })}</p><p className="text-sm text-muted-foreground">{t("updated", { date: checkoutDate(attempt.updatedAt, locale) })}</p><ShopLink href={routes.storefront(attempt.handle)}>{t("backToShop")}</ShopLink></div></Card>{attempt.result ? <CheckoutSummary result={attempt.result} expected={attempt.expectedLines} expectedFees={attempt.expectedFees} expectedPolicyVersion={attempt.expectedPolicyVersion} compare={attempt.state === "reconfirm"} /> : null}<AttemptActions key={JSON.stringify([attempt.attemptId, attempt.updatedAt, attempt.state, attempt.result?.total.amount, attempt.consentTextVersion])} attempt={attempt} expired={expired} refetch={refetch} onRefused={onRefused} /><PaymentCheckoutPanel checkoutAttemptId={attempt.attemptId} /></div>
}
function AttemptActions({ attempt, expired, refetch, onRefused }: { attempt: CheckoutAttempt; expired: boolean; refetch: () => void; onRefused: () => void }) {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("checkout")
  const router = useRouter()
  const status = useAction(api.modules.shops.checkoutActions.status)
  const retry = useAction(api.modules.shops.checkoutActions.retry)
  const release = useAction(api.modules.shops.checkoutActions.release)
  const reconfirm = useAction(api.modules.shops.checkoutActions.reconfirm)
  const action = useShopAction()
  const connectivity = useCartConnectivity()
  const [reviewedGeneration, setReviewedGeneration] = useState(connectivity.generation)
  const paused = !connectivity.online || reviewedGeneration !== connectivity.generation
  const decision = useForm<{ accepted: boolean }>({ resolver: zodResolver(checkoutConsentSchema(t)), defaultValues: { accepted: false } })
  const releaseDecision = useForm<{ accepted: boolean }>({ resolver: zodResolver(checkoutConsentSchema(t)), defaultValues: { accepted: false } })
  const { reset: resetDecision } = decision
  const { reset: resetRelease } = releaseDecision
  useEffect(() => { resetDecision({ accepted: false }); resetRelease({ accepted: false }) }, [connectivity.generation, resetDecision, resetRelease])
  const consent = decision.watch("accepted")
  const releaseConsent = releaseDecision.watch("accepted")
  const [refused, setRefused] = useState(false)
  const [reconfirmKey] = useState(() => crypto.randomUUID())
  const run = (operation: () => Promise<CheckoutActionResult>, review = false) => {
    if (!connectivity.online || !navigator.onLine) return
    void action.run(operation, (result) => {
      decision.reset({ accepted: false })
      releaseDecision.reset({ accepted: false })
      if (result.outcome !== "attempt") { setRefused(true); onRefused() }
      else if (result.attemptId !== attempt.attemptId) router.push(routes.checkoutAttempt(result.attemptId))
      else if (review) setReviewedGeneration(connectivity.generation)
      refetch()
    })
  }
  const confirm = decision.handleSubmit(() => {
    if (!consent || !attempt.result || expired || checkoutExpired(attempt.expiresAt) || refused || paused) return
    const acceptedTotal = attempt.result.total
    run(() => reconfirm({ networkId, attemptId: attempt.attemptId, consentTextVersion: attempt.consentTextVersion, clientRequestId: reconfirmKey, acceptedTotal }))
  })
  const abandon = releaseDecision.handleSubmit(() => {
    if (releaseConsent && !refused && !paused) run(() => release({ networkId, attemptId: attempt.attemptId }))
  })
  return <Card><div className="grid gap-4">
    {!connectivity.online ? <p role="status">{t("cart:offline")}</p> : paused ? <p role="status">{t("cart:refreshRequired")}</p> : null}
    <Button variant="outline" pending={action.pending} disabled={!connectivity.online} onClick={() => run(() => status({ networkId, attemptId: attempt.attemptId }), true)}>{t("refreshStatus")}</Button>
    {attempt.canRetry && !expired ? <Button variant="outline" pending={action.pending} disabled={refused || paused} onClick={() => { if (!paused) run(() => retry({ networkId, attemptId: attempt.attemptId })) }}>{t("retryAttempt")}</Button> : null}
    {attempt.canReconfirm && attempt.result && !expired ? <form onSubmit={confirm} className="grid gap-3">
      <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-5 shrink-0 accent-primary" disabled={action.pending || refused || paused} {...decision.register("accepted")} />{t("reconfirmConsent", { amount: checkoutAmount(attempt.result.total.amount, i18n.resolvedLanguage ?? "fr") })}</label>
      <p className="text-xs text-muted-foreground">{t("consentVersion", { version: attempt.consentTextVersion })}</p>
      {decision.formState.errors.accepted ? <p role="alert" className="text-sm text-destructive">{decision.formState.errors.accepted.message}</p> : null}
      {/* Reconfirmer les conditions d'achat : couleur du commerce (ADR-0027). */}
      <Button type="submit" variant="commerce" pending={action.pending} disabled={!consent || refused || paused}>{t("reconfirm")}</Button>
    </form> : null}
    {attempt.canRelease ? <form onSubmit={abandon} className="grid gap-3 border-t border-border pt-4">
      <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-5 shrink-0 accent-primary" disabled={action.pending || refused || paused} {...releaseDecision.register("accepted")} />{t("releaseConsent")}</label>
      {releaseDecision.formState.errors.accepted ? <p role="alert" className="text-sm text-destructive">{releaseDecision.formState.errors.accepted.message}</p> : null}
      <Button type="submit" variant="outline" pending={action.pending} disabled={!releaseConsent || refused || paused}>{t("release")}</Button>
    </form> : null}
    {refused ? <p role="alert">{t("refused")}</p> : null}{action.error ? <p role="alert" className="text-sm text-destructive">{t("failed")}</p> : null}
    <p className="text-sm text-muted-foreground">{t("noPayment")}</p>
  </div></Card>
}

export function CheckoutOrdersScreen() {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("checkout")
  return <ShopFrame title={t("ordersTitle")} lead={t("ordersLead")}><OrdersPage key={JSON.stringify([networkId, personId])} /></ShopFrame>
}
function OrdersPage() {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("checkout")
  const locale = i18n.resolvedLanguage ?? "fr"
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const cursor = cursors[cursors.length - 1] ?? null
  const query = useAuthenticatedConvexQuery(api.modules.shops.checkout.listMy, { networkId, paginationOpts: { cursor, numItems: CHECKOUT_PAGE_SIZE } })
  if (query.isError) return <CheckoutFailure retry={() => { void query.refetch() }} />
  if (query.isPending || !query.data) return <p role="status">{t("loading")}</p>
  return <div className="grid gap-4"><p className="text-sm text-muted-foreground">{t("scope", { count: CHECKOUT_PAGE_SIZE })}</p>{query.data.page.length ? <ul className={`${SCREEN_SECTIONS} gap-y-4`}>{query.data.page.map((attempt) => <li key={attempt.attemptId}><OrderRow attempt={attempt} locale={locale} /></li>)}</ul> : <Card><p>{t("empty")}</p></Card>}<nav aria-label={t("pagination")} className="flex flex-wrap gap-3">{cursors.length > 1 ? <Button variant="outline" onClick={() => setCursors((previous) => previous.slice(0, -1))}>{t("previous")}</Button> : null}{!query.data.isDone && query.data.continueCursor ? <Button variant="outline" onClick={() => setCursors((previous) => [...previous, query.data!.continueCursor])}>{t("next")}</Button> : null}</nav></div>
}
function OrderRow({ attempt, locale }: { attempt: CheckoutAttempt; locale: string }) {
  const { t } = useTranslation("checkout")
  const now = useCheckoutClock(attempt.expiresAt)
  const state = (attempt.state === "held" || attempt.state === "reconfirm") && checkoutExpired(attempt.expiresAt, now) ? "expired" : attempt.state
  return <Card><div className="grid gap-2"><p className="font-semibold">{t(`states.${state}`)}</p>{attempt.result?.lines.map((line, index) => <p key={index}>{line.label} × {line.quantity}</p>)}{attempt.result ? <p>{t("total")} : {checkoutAmount(attempt.result.total.amount, locale)}</p> : null}<p className="text-sm text-muted-foreground">{t("created", { date: checkoutDate(attempt.createdAt, locale) })}</p>{attempt.expiresAt ? <p className="text-sm">{t("expires", { date: checkoutDate(attempt.expiresAt, locale) })}</p> : null}<ShopLink href={routes.checkoutAttempt(attempt.attemptId)}>{t("openAttempt")}</ShopLink></div></Card>
}
