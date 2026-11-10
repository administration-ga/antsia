import { notFound } from "next/navigation"
import { MemberProfessionalProfile } from "@/components/professionals/profile-screen"
import { getAppT } from "@/i18n/server"
import { decodeRouteSegment } from "@/lib/route-params"
export function generateMetadata() { return { title: getAppT().t("professionals:profile.title"), robots: { index: false, follow: false } } }
export default async function Page({ params }: { params: Promise<{ handle: string }> }) {
  const handle = decodeRouteSegment((await params).handle)
  if (!handle) notFound()
  return <MemberProfessionalProfile handle={handle} />
}
