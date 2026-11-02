import { notFound } from "next/navigation"
import { effectiveActivityConfiguration } from "@antsia/social-domain/activityConfiguration"
import { MemberCatalogScreen } from "@/components/shops/catalog-member-screen"
import { getAppT } from "@/i18n/server"
import { catalogSearch } from "@/lib/catalog-search"
import { decodeRouteSegment } from "@/lib/route-params"
import { loadPublicStorefront } from "@/lib/public-shops-data"
import { getPublicLocale } from "@/lib/server-session"

/** Un titre Menu seulement quand le gabarit est déjà public ; aucun détail de boutique privée dans le document. */
export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const [locale, { handle: rawHandle }] = await Promise.all([getPublicLocale(), params])
  const { t } = getAppT(locale)
  const handle = decodeRouteSegment(rawHandle)
  const storefront = handle ? await loadPublicStorefront(handle) : null
  const food = storefront?.status === "ready" && storefront.data ? effectiveActivityConfiguration(storefront.data.activityConfiguration, storefront.data.model).template === "food" : false
  return { title: t(food ? "shops:food.menu" : "shops:catalog.title"), robots: { index: false, follow: false } }
}
export default async function Page({ params, searchParams }: { params: Promise<{ handle: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const handle = decodeRouteSegment((await params).handle)
  if (!handle) notFound()
  return <MemberCatalogScreen handle={handle} search={catalogSearch(await searchParams)} />
}
