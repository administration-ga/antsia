import type { Id } from "@antsia/api/engine"
import { notFound } from "next/navigation"
import { EditorialTeamScreen } from "@/components/editorial/team-screen"
import { getAppT } from "@/i18n/server"
import { decodeRouteSegment } from "@/lib/route-params"
export function generateMetadata() { return { title: getAppT().t("editorial:home.title"), robots: { index: false, follow: false } } }
export default async function Page({ params }: { params: Promise<{ pageId: string }> }) { const value = decodeRouteSegment((await params).pageId); if (!value || !/^[A-Za-z0-9_-]{1,128}$/u.test(value)) notFound(); return <EditorialTeamScreen pageId={value as Id<"pages">} /> }
