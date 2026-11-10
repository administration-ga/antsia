import { notFound } from "next/navigation"
import { MemberProviderScreen } from "@/components/services/provider-screen"
import { getAppT } from "@/i18n/server"
import { decodeRouteSegment } from "@/lib/route-params"
export function generateMetadata() { return { title: getAppT().t("provider:title"), robots: { index: false, follow: false } } }
export default async function Page({ params }: { params: Promise<{ handle: string }> }) {
  const handle = decodeRouteSegment((await params).handle)
  if (!handle) notFound()
  return <MemberProviderScreen handle={handle} />
}
