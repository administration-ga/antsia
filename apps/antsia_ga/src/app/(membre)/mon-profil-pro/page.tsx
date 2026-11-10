import { Suspense } from "react"
import { ProfessionalProfileEditor } from "@/components/professionals/profile-editor"
import { getAppT } from "@/i18n/server"
export function generateMetadata() { return { title: getAppT().t("professionals:editor.title"), robots: { index: false, follow: false } } }
export default function Page() { return <Suspense fallback={<p role="status">{getAppT().t("professionals:status.loading")}</p>}><ProfessionalProfileEditor /></Suspense> }
