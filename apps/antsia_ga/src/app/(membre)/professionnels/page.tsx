import { Suspense } from "react"
import { MemberProfessionalDirectory } from "@/components/professionals/directory-screen"
import { getAppT } from "@/i18n/server"
export function generateMetadata() { return { title: getAppT().t("professionals:title"), robots: { index: false, follow: false } } }
export default function Page() { return <Suspense fallback={<p role="status">{getAppT().t("professionals:status.loading")}</p>}><MemberProfessionalDirectory /></Suspense> }
