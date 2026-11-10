"use client"

import { api, type Id } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import { COMMERCE_PAYMENT_PREPARATION_RAILS, type CommercePaymentPreparationMissing, type CommercePaymentPreparationPolicy, type CommercePaymentPreparationRailState } from "@antsia/social-domain/commerce-payment-preparation"
import type { FunctionReturnType } from "convex/server"
import { useAction } from "convex/react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { useCartConnectivity } from "@/components/cart/use-cart-draft"
import { useCheckoutClock } from "@/components/checkout/use-checkout-clock"
import { Button } from "@/components/shared/controls"
import { SHOP_ACTION_CLASS } from "@/components/shops/offer-experience-styles"
import { useShopAction } from "@/components/shops/shop-ui"
import { proFinancialPreparationHref } from "@/lib/routes"

type PaymentPreparationResult = FunctionReturnType<typeof api.modules.shops.paymentPreparationActions.read>
type Translate = (key: string, values?: Record<string, unknown>) => string

/** Une nouvelle portée ou une édition invalide toute lecture financière précédente. */
export function MerchantPaymentPreparationPanel({ shopId, dirty = false }: { shopId: Id<"shops">; dirty?: boolean }) {
  const { networkId, personId } = useNetwork()
  const { online, generation } = useCartConnectivity()
  return <PreparationRead key={JSON.stringify([networkId, personId, shopId, dirty, online, generation])} shopId={shopId} dirty={dirty} online={online} />
}
function PreparationRead({ shopId, dirty, online }: { shopId: Id<"shops">; dirty: boolean; online: boolean }) {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("paymentPreparation")
  const load = useAction(api.modules.shops.paymentPreparationActions.read)
  const action = useShopAction()
  const [result, setResult] = useState<PaymentPreparationResult | null>(null)
  const preparation = result?.outcome === "ready" ? result.preparation : null
  const now = useCheckoutClock(preparation?.expiresAt)
  const expired = preparation !== null && now >= preparation.expiresAt
  const locale = i18n.resolvedLanguage === "en" ? "en" : "fr"
  const date = (value: number) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Libreville" }).format(value)
  const country = (value: string | null) => {
    if (value === null) return t("scope.unknown")
    try { return new Intl.DisplayNames([locale], { type: "region" }).of(value) ?? value } catch { return value }
  }
  const read = () => {
    if (dirty || !online || !navigator.onLine || action.pending) return
    setResult(null)
    void action.run(() => load({ networkId, shopId }), setResult)
  }
  const translate: Translate = (key, values) => t(key, values)
  const href = !expired && !dirty && online && result?.outcome === "ready" && preparation?.target ? proFinancialPreparationHref(result.proAppOrigin, result.proShopRef, preparation.target) : null
  return <section aria-label={t("title")} className="grid min-w-0 gap-4 rounded-[var(--ui2-card-radius)] border border-border bg-background p-4 [overflow-wrap:anywhere]" data-payment-preparation>
    <header className="grid gap-2"><h3 className="font-display text-base font-bold leading-snug">{t("title")}</h3><p className="text-sm text-muted-foreground">{t("lead")}</p></header>
    <Button type="button" variant="outline" className="justify-self-start" pending={action.pending} disabled={dirty || !online} onClick={read}>{t(result ? "refresh" : "read")}</Button>
    {dirty ? <p role="status" className="text-sm text-muted-foreground">{t("saveFirst")}</p> : !online ? <p role="status" className="text-sm text-muted-foreground">{t("offline")}</p> : action.pending ? <p role="status" className="text-sm text-muted-foreground">{t("loading")}</p> : null}
    {(result && result.outcome !== "ready") || action.error ? <p role="alert" className="text-sm text-muted-foreground">{t("unavailable")}</p> : null}
    {!preparation ? <div className="grid gap-2"><p className="text-sm font-medium">{t("rails.title")}</p><ul aria-label={t("rails.title")} className="flex flex-wrap gap-2">{COMMERCE_PAYMENT_PREPARATION_RAILS.map(rail => <li key={rail} className="rounded-full border border-border px-3 py-2 text-sm">{t(`rails.names.${rail}`)}</li>)}</ul><p className="text-xs text-muted-foreground">{t("unverified")}</p></div> : null}
    {result?.outcome === "ready" && preparation ? <div className="grid min-w-0 gap-6">
      <div className="grid gap-2"><p className="text-xs text-muted-foreground">{t("checkedAt", { date: date(preparation.checkedAt) })}</p>{expired ? <p role="status" className="text-sm font-medium">{t("expired")}</p> : <p className="text-xs text-muted-foreground">{t("validUntil", { date: date(preparation.expiresAt) })}</p>}</div>
      <dl className="grid min-w-0 gap-4 sm:grid-cols-2"><div><dt className="font-medium">{t("scope.environment")}</dt><dd className="mt-1 text-sm">{t(`scope.environments.${preparation.environment}`)}</dd></div><div><dt className="font-medium">{t("scope.currency")}</dt><dd className="mt-1 text-sm">{preparation.currency}</dd></div><div><dt className="font-medium">{t("scope.platformCountry")}</dt><dd className="mt-1 text-sm">{country(preparation.countryScope.platformCountry)}</dd></div><div><dt className="font-medium">{t("scope.sellerCountry")}</dt><dd className="mt-1 text-sm">{country(preparation.countryScope.sellerCountry)}</dd></div></dl>
      <section className="grid min-w-0 content-start gap-3 rounded-[var(--ui2-card-radius)] border border-border bg-card p-4" data-payment-collection><h4 className="font-semibold">{t("collection.title")}</h4><p role="status" className="text-sm font-medium">{t(expired ? "expiredStatus" : `collection.${preparation.collection.state}`)}</p><MissingSteps values={preparation.collection.missing} t={translate} /></section>
      <PolicySummary policy={preparation.policy} expired={expired} locale={locale} t={translate} />
      <section className="grid min-w-0 gap-4" data-payment-refund><h4 className="font-semibold">{t("refund.title")}</h4><p className="text-sm text-muted-foreground">{t("refund.hint")}</p><ul className="grid min-w-0 gap-4 sm:grid-cols-2">{preparation.rails.map(rail => <li key={rail.rail} className="min-w-0"><RailSummary rail={rail} expired={expired} t={translate} /></li>)}</ul></section>
      <section className="grid min-w-0 content-start gap-3 rounded-[var(--ui2-card-radius)] border border-border bg-card p-4" data-payment-payout><h4 className="font-semibold">{t("payout.title")}</h4><p className="text-sm font-medium">{t(expired ? "expiredStatus" : `payout.${preparation.payout.state}`)}</p><MissingSteps values={preparation.payout.missing} t={translate} /></section>
      <section className="grid min-w-0 gap-3" data-payment-beneficiary><h4 className="font-semibold">{t("beneficiary.title")}</h4><p className="text-sm">{t(expired ? "expiredStatus" : `beneficiary.states.${preparation.beneficiary.state}`)}</p>{!expired && preparation.beneficiary.label ? <p className="break-words text-sm">{preparation.beneficiary.label}</p> : null}</section>
      {href ? <a href={href} target="_blank" rel="noopener noreferrer" className={`${SHOP_ACTION_CLASS} justify-self-start`} onClick={event => { if (dirty || !navigator.onLine || Date.now() >= preparation.expiresAt) event.preventDefault() }}>{t("openPro")}</a> : null}
    </div> : null}
  </section>
}
function MissingSteps({ values, t }: { values: readonly CommercePaymentPreparationMissing[]; t: Translate }) {
  return values.length ? <ul aria-label={t("missingTitle")} className="list-inside list-disc space-y-1 text-sm text-muted-foreground">{values.map(value => <li key={value}>{t(`missing.${value}`)}</li>)}</ul> : null
}
function PolicySummary({ policy, expired, locale, t }: { policy: CommercePaymentPreparationPolicy | null; expired: boolean; locale: string; t: Translate }) {
  const share = (basisPoints: number | null) => basisPoints === null ? t("policy.shareUnknown") : new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(basisPoints / 10_000)
  return <section className="grid min-w-0 gap-4 rounded-[var(--ui2-card-radius)] border border-border bg-card p-4" data-payment-policy><h4 className="font-semibold">{t("policy.title")}</h4>
    {policy ? <dl className="grid min-w-0 gap-3 sm:grid-cols-2"><div><dt className="text-sm font-medium">{t("policy.textVersion")}</dt><dd className="mt-1 break-words text-sm">{policy.textVersion}</dd></div><div><dt className="text-sm font-medium">{t("policy.revision")}</dt><dd className="mt-1 text-sm">{policy.revision}</dd></div><div><dt className="text-sm font-medium">{t("policy.platformRevision")}</dt><dd className="mt-1 text-sm">{policy.platformRevision}</dd></div><div><dt className="text-sm font-medium">{t("policy.mode")}</dt><dd className="mt-1 text-sm">{t(`policy.modes.${policy.mode}`)}</dd></div></dl> : <p className="text-sm text-muted-foreground">{t("policy.none")}</p>}
    <div className="grid gap-2" data-payment-allocation><h5 className="font-semibold">{t("allocation.title")}</h5>{policy ? <dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-sm">{t("allocation.platform")}</dt><dd className="mt-1 font-medium">{share(policy.platformBps)}</dd></div><div><dt className="text-sm">{t("allocation.seller")}</dt><dd className="mt-1 font-medium">{share(policy.sellerBps)}</dd></div></dl> : <p className="text-sm text-muted-foreground">{t("allocation.unknown")}</p>}</div>
    {policy ? <><p role="status" className="text-sm">{t(expired ? "expiredStatus" : policy.accepted ? "policy.accepted" : "policy.notAccepted")}</p>{policy.acceptanceRevision !== null ? <p className="text-sm text-muted-foreground">{t("policy.acceptanceRevision", { revision: policy.acceptanceRevision })}</p> : null}</> : null}
  </section>
}

function RailSummary({ rail, expired, t }: { rail: CommercePaymentPreparationRailState; expired: boolean; t: Translate }) {
  return <article className="grid h-full min-w-0 content-start gap-3 rounded-[var(--ui2-card-radius)] border border-border bg-card p-4" data-payment-rail={rail.rail}><h5 className="font-semibold">{t(`rails.names.${rail.rail}`)}</h5><p className="text-sm font-medium">{t(expired ? "expiredStatus" : rail.qualified ? "rails.qualified" : "rails.unqualified")}</p><dl className="grid min-w-0 gap-3 sm:grid-cols-2">{(["collect", "lookup", "refund", "payout"] as const).map(capability => <div key={capability}><dt className="text-sm">{t(`rails.capabilities.${capability}`)}</dt><dd className="mt-1 text-sm text-muted-foreground">{t(expired ? "expiredStatus" : rail.capabilities[capability] ? "rails.supported" : "rails.unsupported")}</dd></div>)}</dl><MissingSteps values={rail.missing} t={t} /></article>
}
