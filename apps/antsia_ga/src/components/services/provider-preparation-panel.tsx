"use client"

import { api, type Id } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import type { FunctionReturnType } from "convex/server"
import { useAction } from "convex/react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { useCartConnectivity } from "@/components/cart/use-cart-draft"
import { useCheckoutClock } from "@/components/checkout/use-checkout-clock"
import { Button } from "@/components/shared/controls"
import { SHOP_ACTION_CLASS } from "@/components/shops/offer-experience-styles"
import { useShopAction } from "@/components/shops/shop-ui"
import { proMerchantTargetHref } from "@/lib/routes"

type PreparationResult = FunctionReturnType<typeof api.modules.shops.merchantPreparationActions.read>

/** Le panneau n'a aucune saisie à préserver : une autre portée invalide toute ancienne lecture. */
export function ProviderPreparationPanel({ shopId, dirty = false }: { shopId: Id<"shops">; dirty?: boolean }) {
  const { networkId, personId } = useNetwork()
  const { online, generation } = useCartConnectivity()
  return <PreparationRead key={JSON.stringify([networkId, personId, shopId, dirty, online, generation])} shopId={shopId} dirty={dirty} online={online} />
}
function PreparationRead({ shopId, dirty, online }: { shopId: Id<"shops">; dirty: boolean; online: boolean }) {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("providerPreparation")
  const load = useAction(api.modules.shops.merchantPreparationActions.read)
  const action = useShopAction()
  const [result, setResult] = useState<PreparationResult | null>(null)
  const preparation = result?.outcome === "ready" ? result.preparation : null
  const now = useCheckoutClock(preparation?.expiresAt)
  const expired = preparation !== null && now >= preparation.expiresAt
  const locale = i18n.resolvedLanguage === "en" ? "en" : "fr"
  const date = (value: number) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Libreville" }).format(value)
  const read = () => {
    if (dirty || !online || !navigator.onLine || action.pending) return
    setResult(null)
    void action.run(() => load({ networkId, shopId }), setResult)
  }
  return <section aria-label={t("title")} className="grid min-w-0 gap-4 rounded-[var(--ui2-card-radius)] border border-border bg-background p-4" data-provider-preparation>
    <header className="grid gap-2"><h3 className="font-display text-base font-bold leading-snug">{t("title")}</h3><p className="text-sm text-muted-foreground">{t("lead")}</p></header>
    <Button type="button" variant="outline" className="justify-self-start" pending={action.pending} disabled={dirty || !online} onClick={read}>{t(result ? "refresh" : "read")}</Button>
    {dirty ? <p role="status" className="text-sm text-muted-foreground">{t("saveFirst")}</p> : !online ? <p role="status" className="text-sm text-muted-foreground">{t("offline")}</p> : action.pending ? <p role="status" className="text-sm text-muted-foreground">{t("loading")}</p> : null}
    {(result && result.outcome !== "ready") || action.error ? <p role="alert" className="text-sm text-muted-foreground">{t("unavailable")}</p> : null}
    {result?.outcome === "ready" && preparation ? <div className="grid min-w-0 gap-4">
      <p className="text-xs text-muted-foreground">{t("checkedAt", { date: date(preparation.checkedAt) })}</p>
      {expired ? <p role="status" className="text-sm">{t("expired")}</p> : <p className="text-xs text-muted-foreground">{t("validUntil", { date: date(preparation.expiresAt) })}</p>}
      <dl className="grid min-w-0 gap-4 sm:grid-cols-2"><div><dt className="font-medium">{t("catalog.title")}</dt><dd className="mt-1 text-sm">{preparation.publishedCatalog.available ? t("catalog.published", { version: preparation.publishedCatalog.revision }) : t("catalog.unpublished")}</dd></div><div><dt className="font-medium">{t("services.title")}</dt><dd className="mt-1 text-sm">{t(preparation.servicesEnabled ? "services.enabled" : "services.disabled")}</dd></div></dl>
      <ul className="grid min-w-0 gap-3 sm:grid-cols-2">{preparation.capabilities.map(capability => {
        const href = !expired && !dirty && online && capability.canOpen && capability.target ? proMerchantTargetHref(result.proAppOrigin, result.proShopRef, capability.target) : null
        return <li key={capability.key} className="grid min-w-0 content-start gap-3 rounded-[var(--ui2-card-radius)] border border-border bg-card p-4"><h4 className="font-semibold">{t(`capabilities.${capability.key}`)}</h4><p className="text-sm text-muted-foreground">{t(expired ? "accessExpired" : capability.canOpen ? "accessAllowed" : "accessUnavailable")}</p>{capability.missing.length ? <ul aria-label={t("missingTitle")} className="list-inside list-disc space-y-1 text-sm">{capability.missing.map(missing => <li key={missing}>{t(`missing.${missing}`)}</li>)}</ul> : null}{href && capability.target ? <a href={href} target="_blank" rel="noopener noreferrer" className={`${SHOP_ACTION_CLASS} justify-self-start`} onClick={event => { if (dirty || !navigator.onLine || Date.now() >= preparation.expiresAt) event.preventDefault() }}>{t(`targets.${capability.target}`)}</a> : null}</li>
      })}</ul>
    </div> : null}
  </section>
}
