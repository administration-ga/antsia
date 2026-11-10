import { Suspense } from "react"
import { ProfessionalCollaborationsScreen } from "@/components/professionals/collaborations-screen"
import { getAppT } from "@/i18n/server"
export function generateMetadata() { return { title: getAppT().t("professionals:collaborations.title"), robots: { index: false, follow: false } } }
export default function Page() { return <Suspense fallback={<p role="status">{getAppT().t("professionals:status.loading")}</p>}><ProfessionalCollaborationsScreen /></Suspense> }
