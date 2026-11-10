import { notFound } from "next/navigation"
import { MemberArticleScreen } from "@/components/editorial/member-reading"
import { getAppT } from "@/i18n/server"
import { decodeRouteSegment } from "@/lib/route-params"
export function generateMetadata() { return { title: getAppT().t("editorialPublic:title"), robots: { index: false, follow: false } } }
export default async function Page({ params }: { params: Promise<{ handle: string; articleKey: string }> }) { const input = await params, handle = decodeRouteSegment(input.handle); const articleKey = decodeRouteSegment(input.articleKey); if (!handle || !articleKey || !/^a-[a-f0-9]{32}$/u.test(articleKey)) notFound(); return <MemberArticleScreen handle={handle} articleKey={articleKey} /> }
