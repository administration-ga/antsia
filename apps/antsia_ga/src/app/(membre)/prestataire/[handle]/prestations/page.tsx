import { notFound } from "next/navigation"
import { MemberCatalogScreen } from "@/components/shops/catalog-member-screen"
import { getAppT } from "@/i18n/server"
import { catalogSearch } from "@/lib/catalog-search"
import { decodeRouteSegment } from "@/lib/route-params"
export function generateMetadata() { return { title: getAppT().t("provider:sections.services"), robots: { index: false, follow: false } } }
export default async function Page({ params, searchParams }: { params: Promise<{ handle: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const handle = decodeRouteSegment((await params).handle)
  if (!handle) notFound()
  return <MemberCatalogScreen handle={handle} search={catalogSearch(await searchParams)} provider />
}
