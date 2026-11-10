import { notFound } from "next/navigation"
import { MemberMediaScreen } from "@/components/editorial/member-reading"
import { getAppT } from "@/i18n/server"
import { decodeRouteSegment } from "@/lib/route-params"
export function generateMetadata() { return { title: getAppT().t("editorialPublic:title"), robots: { index: false, follow: false } } }
export default async function Page({ params }: { params: Promise<{ handle: string }> }) { const input = await params, handle = decodeRouteSegment(input.handle); if (!handle) notFound(); return <MemberMediaScreen handle={handle} /> }
