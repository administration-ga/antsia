import { effectiveActivityConfiguration } from "@antsia/social-domain/activityConfiguration"
import { notFound } from "next/navigation"

import { PublicShell } from "@/components/public/public-shell"
import { PublicStatus } from "@/components/public/public-status"
import { getAppT } from "@/i18n/server"
import { loadPublicCatalog } from "@/lib/public-catalog-data"
import { publicMetadata, publicSearch } from "@/lib/public-data"
import { loadPublicStorefront } from "@/lib/public-shops-data"
import { decodeRouteSegment } from "@/lib/route-params"
import { routes } from "@/lib/routes"
import { getPublicLocale } from "@/lib/server-session"
import type { PublicStorefrontProps } from "../shops/public-storefront-route"
import { PublicProviderContent } from "./provider-public-content"

async function request(props: PublicStorefrontProps) {
  const handle = decodeRouteSegment((await props.params).handle)
  return { handle, handoff: publicSearch(await props.searchParams ?? {}).handoff }
}

export async function PublicProviderMetadata(props: PublicStorefrontProps) {
  const { t } = getAppT(await getPublicLocale())
  const { handle, handoff } = await request(props)
  const result = handle ? await loadPublicStorefront(handle, handoff) : null
  if (result?.status !== "ready" || !result.data || !effectiveActivityConfiguration(result.data.activityConfiguration, result.data.model).capabilities.includes("services")) return publicMetadata(t("provider:title"), t("provider:status.unavailable"), routes.home(), false)
  return publicMetadata(result.data.name, result.data.description?.replace(/\s+/g, " ").slice(0, 180) ?? t("provider:lead"), routes.publicProvider(result.data.handle))
}

/** Même projection publique et même garde de transfert que les boutiques. */
export async function PublicProviderScreen(props: PublicStorefrontProps) {
  const { handle, handoff } = await request(props)
  if (!handle) notFound()
  const locale = await getPublicLocale()
  const shop = await loadPublicStorefront(handle, handoff)
  if (shop.status !== "ready") return <PublicShell viewer={shop.status}><PublicStatus status={shop.status} locale={locale} /></PublicShell>
  if (!shop.data || !effectiveActivityConfiguration(shop.data.activityConfiguration, shop.data.model).capabilities.includes("services")) notFound()
  const catalog = await loadPublicCatalog(handle, { kind: "service" }, null, handoff)
  if (catalog.status !== "ready") return <PublicShell viewer={catalog.status}><PublicStatus status={catalog.status} locale={locale} /></PublicShell>
  return <PublicShell viewer={catalog.viewer} specialized={{ kind: "provider", handle }}><div className="mp-page mp-copy mx-auto w-full max-w-5xl"><PublicProviderContent storefront={shop.data} catalog={catalog.data} locale={locale} viewer={catalog.viewer} /></div></PublicShell>
}
