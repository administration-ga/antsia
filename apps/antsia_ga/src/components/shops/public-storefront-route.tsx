import { notFound } from "next/navigation"
import { effectiveActivityConfiguration } from "@antsia/social-domain/activityConfiguration"

import { PublicShell } from "@/components/public/public-shell"
import { PublicStatus } from "@/components/public/public-status"
import { getAppT } from "@/i18n/server"
import { publicMetadata, publicSearch } from "@/lib/public-data"
import { loadPublicDailySpecial, loadPublicStorefront, loadPublicStorefrontPause } from "@/lib/public-shops-data"
import { loadPublicCatalog } from "@/lib/public-catalog-data"
import { decodeRouteSegment } from "@/lib/route-params"
import { routes } from "@/lib/routes"
import { getPublicLocale } from "@/lib/server-session"
import { PublicStorefrontCard } from "./public-storefront-card"
import { PublicCatalogPreview } from "./catalog-public-route"

export type PublicStorefrontProps = {
  params: Promise<{ handle: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

async function storefrontRequest(props: PublicStorefrontProps) {
  const handle = decodeRouteSegment((await props.params).handle)
  const { handoff } = publicSearch(await props.searchParams ?? {})
  return { handle, handoff }
}

export async function PublicStorefrontMetadata(props: PublicStorefrontProps) {
  const locale = await getPublicLocale()
  const { t } = getAppT(locale)
  const { handle, handoff } = await storefrontRequest(props)
  const result = handle ? await loadPublicStorefront(handle, handoff) : null
  if (result?.status !== "ready" || !result.data) {
    return publicMetadata(t("shops:publicStorefront.unavailableTitle"), t("shops:publicStorefront.unavailableBody"), routes.home(), false)
  }
  const storefront = result.data
  return publicMetadata(storefront.name, storefront.description?.replace(/\s+/g, " ").slice(0, 180) ?? t("shops:publicStorefront.descriptionFallback", { name: storefront.name }), routes.publicStorefront(storefront.handle))
}

export async function PublicStorefrontScreen(props: PublicStorefrontProps) {
  const { handle, handoff } = await storefrontRequest(props)
  if (!handle) notFound()
  const locale = await getPublicLocale()
  const result = await loadPublicStorefront(handle, handoff)
  if (result.status !== "ready") return <PublicShell viewer={result.status}><PublicStatus status={result.status} locale={locale} /></PublicShell>
  if (!result.data) notFound()
  const food = effectiveActivityConfiguration(result.data.activityConfiguration, result.data.model).template === "food"
  const [catalog, special, pause] = await Promise.all([
    result.data.blocks.some((block) => block === "catalog" || block === "services") ? loadPublicCatalog(handle, {}, null, handoff) : null,
    food ? loadPublicDailySpecial(handle, handoff) : null,
    // CM-10 : facultatif ; sans réponse (ancien backend, panne), la vitrine s'affiche simplement sans bandeau.
    loadPublicStorefrontPause(handle, handoff),
  ])
  if (catalog && catalog.status !== "ready") return <PublicShell viewer={catalog.status}><PublicStatus status={catalog.status} locale={locale} /></PublicShell>
  if (special?.status === "refused" || special?.status === "handoff") return <PublicShell viewer={special.status}><PublicStatus status={special.status} locale={locale} /></PublicShell>
  return <PublicShell viewer={result.viewer} specialized={{ kind: "storefront", handle }} food={food}><PublicStorefrontCard storefront={result.data} locale={locale} dailySpecial={special?.status === "ready" ? special.data : null} pause={pause.status === "ready" ? pause.data : null} catalog={catalog?.status === "ready" ? <PublicCatalogPreview page={catalog.data} handle={handle} locale={locale} food={food} /> : undefined} /></PublicShell>
}
