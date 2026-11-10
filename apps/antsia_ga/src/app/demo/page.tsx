import type { Metadata } from "next"

import { DemoEmbedScreen } from "@/components/demo-embed"
import { getAppT } from "@/i18n/server"

export function generateMetadata(): Metadata {
  const { t } = getAppT()
  return { title: t("demoIntegration.title") }
}

/** Repli du site principal : le relais configuré sert normalement le build isolé. */
export default function DemoPage() {
  return <DemoEmbedScreen />
}
