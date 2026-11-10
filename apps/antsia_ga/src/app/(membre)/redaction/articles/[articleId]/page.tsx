import type { Id } from "@antsia/api/engine"
import { notFound } from "next/navigation"
import { EditorialArticleEditor } from "@/components/editorial/article-editor"
import { getAppT } from "@/i18n/server"
import { decodeRouteSegment } from "@/lib/route-params"
export function generateMetadata() { return { title: getAppT().t("editorial:home.title"), robots: { index: false, follow: false } } }
export default async function Page({ params }: { params: Promise<{ articleId: string }> }) { const value = decodeRouteSegment((await params).articleId); if (!value || !/^[A-Za-z0-9_-]{1,128}$/u.test(value)) notFound(); return <EditorialArticleEditor articleId={value as Id<"editorialArticles">} /> }
