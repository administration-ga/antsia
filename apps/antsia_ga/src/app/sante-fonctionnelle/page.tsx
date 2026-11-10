import Link from "next/link"

import { getAppT } from "@/i18n/server"
import { computeHealth } from "@antsia/api/health"
import { routes } from "@/lib/routes"
import { PublicAccountTheme } from "@/components/public/public-account-theme"

// Jamais figée au build : la santé décrit le service qui répond.
export const dynamic = "force-dynamic"

export default function HealthPage() {
  const { t } = getAppT()
  const report = computeHealth(
    {
      // Références LITTÉRALES : Next les inscrit au build (jamais `process.env` entier).
      NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
      NEXT_PUBLIC_BUILD_SHA: process.env.NEXT_PUBLIC_BUILD_SHA,
    },
    "antsia-ga",
  )
  return (
    <main id="contenu" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <PublicAccountTheme enabled />
      <h1 className="text-3xl">{t("health.title")}</h1>
      <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 rounded-[var(--ui2-card-radius)] border border-[color:var(--esp-surface-border)] bg-card p-4 text-card-foreground [overflow-wrap:anywhere]">
        <dt className="text-muted-foreground">{t("health.application")}</dt>
        <dd>{report.application}</dd>
        <dt className="text-muted-foreground">{t("health.backend")}</dt>
        <dd data-status={report.backend}>{t(`health.${report.backend}`)}</dd>
        <dt className="text-muted-foreground">{t("health.version")}</dt>
        <dd className="font-mono">{report.version}</dd>
      </dl>
      <Link href={routes.home()}>{t("health.backHome")}</Link>
    </main>
  )
}
