"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { effectiveActivityConfiguration } from "@antsia/social-domain/activityConfiguration"
import { useTranslation } from "react-i18next"

import { ShopFrame, ShopLink, ShopQueryFailure } from "@/components/shops/shop-ui"
import { routes } from "@/lib/routes"
import { ProviderContent } from "./provider-content"

export function MemberProviderScreen({ handle }: { handle: string }) {
  const { networkId, personId } = useNetwork()
  return <ProviderQuery key={JSON.stringify([networkId, personId, handle])} handle={handle} />
}
function ProviderQuery({ handle }: { handle: string }) {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("provider")
  const { t: shopT } = useTranslation("shops")
  const storefront = useAuthenticatedConvexQuery(api.modules.shops.shops.storefront, { networkId, handle })
  const catalog = useAuthenticatedConvexQuery(api.modules.shops.catalog.list, { networkId, handle, kind: "service", paginationOpts: { cursor: null, numItems: 12 } })
  const directory = routes.marketplace({ view: "services" })
  const failed = storefront.isError || catalog.isError
  const ready = !storefront.isPending && !catalog.isPending && storefront.data !== undefined && catalog.data !== undefined
  const eligible = storefront.data && effectiveActivityConfiguration(storefront.data.activityConfiguration, storefront.data.model).capabilities.includes("services")
  return <ShopFrame title={t("title")} lead={t("lead")}><ShopLink href={directory}>{t("actions.directory")}</ShopLink>{failed ? <ShopQueryFailure href={directory} retry={() => { void storefront.refetch(); void catalog.refetch() }} /> : !ready ? <p role="status">{t("status.loading")}</p> : !storefront.data || !eligible || !catalog.data ? <ShopQueryFailure href={directory} /> : <div aria-busy={storefront.isFetching || catalog.isFetching || undefined}>{storefront.isFetching || catalog.isFetching ? <p role="status" className="text-sm text-muted-foreground">{t("status.refreshing")}</p> : null}<ProviderContent storefront={storefront.data} catalog={catalog.data} audience="member" locale={i18n.resolvedLanguage === "en" ? "en" : "fr"} viewer="authenticated" t={(key, options) => t(key, options)} shopT={(key, options) => shopT(key, options)} /></div>}</ShopFrame>
}
