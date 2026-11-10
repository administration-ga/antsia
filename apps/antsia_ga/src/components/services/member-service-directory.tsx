"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import Link from "next/link"
import { useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/shared/controls"
import { OfferCard } from "@/components/shops/offer-card"
import { SHOP_ACTION_CLASS } from "@/components/shops/offer-experience-styles"
import { routes } from "@/lib/routes"

/** Une fenêtre non terminale ou un index en cours ne prouve pas une absence globale. */
export function useServicesDiscoverable(): boolean {
  const { networkId } = useNetwork()
  const query = useAuthenticatedConvexQuery(api.modules.shops.marketplace.search, { networkId, kind: "service", paginationOpts: { cursor: null, numItems: 1 } })
  const demo = useAuthenticatedConvexQuery(api.modules.shops.marketplace.demoSelection, { networkId, kind: "service" })
  return !query.isError && !!query.data && (query.data.indexStatus === "building" || query.data.page.length > 0 || !query.data.isDone) || !demo.isError && !!demo.data?.length
}

export function MemberServiceDirectory() {
  const { networkId, personId } = useNetwork()
  return <ServiceWindows key={JSON.stringify([networkId, personId])} />
}

/** L'annuaire utilise l'index paginé partagé, sans échantillon limité de boutiques. */
function ServiceWindows() {
  const { networkId } = useNetwork()
  const { t } = useTranslation("provider")
  const { t: marketplaceT } = useTranslation("marketplace")
  const { t: shopT, i18n } = useTranslation("shops")
  const id = useId()
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const query = useAuthenticatedConvexQuery(api.modules.shops.marketplace.search, { networkId, kind: "service", paginationOpts: { cursor: cursors.at(-1) ?? null, numItems: 12 } })
  const demo = useAuthenticatedConvexQuery(api.modules.shops.marketplace.demoSelection, { networkId, kind: "service" })
  const result = query.data
  const cards = (offers: NonNullable<typeof result>["page"]) => <ul className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">{offers.map(offer => <li key={`${offer.shopHandle}:${offer.offerRef}`} className="min-w-0"><OfferCard offer={offer} audience="member" locale={i18n.resolvedLanguage ?? "fr"} t={(key, options) => shopT(key, options)} /></li>)}</ul>
  return <section id="services" aria-labelledby={id} className="scroll-mt-24 grid min-w-0 gap-4">
    <header className="grid gap-2"><h2 id={id} className="mp-subtitle">{t("directory.title")}</h2><p className="text-sm text-muted-foreground">{t("directory.lead")}</p><Link href={routes.marketplace({ view: "services" })} className={`${SHOP_ACTION_CLASS} justify-self-start`}>{t("directory.all")}</Link></header>
    {query.isError ? <div role="alert" className="grid gap-3"><p>{marketplaceT("results.failed")}</p><Button variant="outline" pending={query.isFetching} onClick={() => { void query.refetch() }}>{t("actions.retry")}</Button></div> : query.isPending || !result ? <p role="status">{t("status.loading")}</p> : result.indexStatus !== "ready" ? <p role="status">{t("status.building")}</p> : <div className="grid min-w-0 gap-4" aria-busy={query.isFetching || undefined}>
      {result.page.length ? cards(result.page) : <p role="status" className="text-sm text-muted-foreground">{marketplaceT(result.isDone ? "results.empty" : "results.window")}</p>}
      {result.filteredWindow ? <p className="text-sm text-muted-foreground">{marketplaceT("results.filtered")}</p> : null}
      {cursors.length > 1 || !result.isDone && result.continueCursor ? <nav aria-label={marketplaceT("results.pagination")} className="flex flex-wrap gap-3">{cursors.length > 1 ? <Button variant="outline" onClick={() => setCursors(previous => previous.slice(0, -1))}>{t("actions.previous")}</Button> : null}{!result.isDone && result.continueCursor ? <Button variant="outline" onClick={() => setCursors(previous => [...previous, result.continueCursor])}>{marketplaceT("results.next")}</Button> : null}</nav> : null}
    </div>}
    {!demo.isError && !demo.isPending && demo.data?.length ? <section className="grid min-w-0 gap-4 border-t border-border pt-4" data-service-demo><h3 className="mp-subtitle">{t("directory.demo")}</h3><p className="text-sm text-muted-foreground">{t("directory.demoNotice")}</p>{cards(demo.data)}</section> : null}
  </section>
}
