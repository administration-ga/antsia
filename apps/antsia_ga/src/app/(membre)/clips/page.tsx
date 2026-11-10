import type { Metadata } from "next"
import { Suspense } from "react"

import { MediaDiscoveryScreen } from "@/components/discovery/media-discovery-screen"
import { MemberPage } from "@/components/member-chrome"
import { getAppT } from "@/i18n/server"

export function generateMetadata(): Metadata {
  const { t } = getAppT()
  return { title: t("socialExperience:clips") }
}

/** La route reste dans la coque déjà montée : navigation et appel ne se remontent pas. */
export default function ClipsPage() {
  const { t } = getAppT()
  return <MemberPage><Suspense fallback={<p role="status">{t("socialExperience:loading")}</p>}><MediaDiscoveryScreen mode="clips" /></Suspense></MemberPage>
}
