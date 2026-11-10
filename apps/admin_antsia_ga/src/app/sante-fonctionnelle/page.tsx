import { engineAnswered } from "@antsia/api/health"
import { CircleCheck, TriangleAlert } from "lucide-react"
import Link from "next/link"

import { getAppT } from "@/i18n/server"
import { consoleHealthEnv, probeConsoleHealth } from "@/lib/health"
import { routes } from "@/lib/routes"

// Jamais figée au build : la santé décrit le service qui répond.
export const dynamic = "force-dynamic"

/** État RÉEL de la console (EX-03) : la page interroge le moteur, comme la route `/api/sante-fonctionnelle`. */
export default async function HealthPage() {
  const { t } = getAppT()
  const report = await probeConsoleHealth(consoleHealthEnv())
  const { engine } = report
  const StatusIcon = report.status === "ok" ? CircleCheck : TriangleAlert
  return (
    <main id="contenu" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl">{t("health.title")}</h1>
      <div role="status" data-status={report.status} className="flex items-start gap-3">
        <StatusIcon size={24} aria-hidden="true" className={report.status === "ok" ? "mt-0.5 shrink-0 text-success" : "mt-0.5 shrink-0 text-destructive"} />
        <div className="min-w-0">
          <p className="text-lg font-semibold">{t(`health.overall.${report.status}`)}</p>
          <p className="text-muted-foreground">{t(`health.lead.${report.status}`)}</p>
        </div>
      </div>
      <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 rounded-xl bg-card p-6 text-card-foreground [overflow-wrap:anywhere]">
        <dt className="text-muted-foreground">{t("health.application")}</dt>
        <dd>{report.application}</dd>
        <dt className="text-muted-foreground">{t("health.version")}</dt>
        <dd className="font-mono">{report.version}</dd>
        <dt className="text-muted-foreground">{t("health.backend")}</dt>
        <dd data-engine-state={engine.state}>{t(`health.engine.${engine.state}`)}</dd>
        <dt className="text-muted-foreground">{t("health.engineVersion")}</dt>
        <dd className={engine.version ? "font-mono" : undefined}>{engine.version ?? t(engineAnswered(engine) ? "health.undeclared" : "health.unknown")}</dd>
        <dt className="text-muted-foreground">{t("health.serverTime")}</dt>
        <dd>{engine.serverTime ? <time className="font-mono" dateTime={engine.serverTime}>{engine.serverTime}</time> : t("health.unknown")}</dd>
        <dt className="text-muted-foreground">{t("health.latency")}</dt>
        <dd>{engine.latencyMs === null ? t("health.notMeasured") : t("health.latencyValue", { latency: engine.latencyMs })}</dd>
      </dl>
      <Link href={routes.home()}>{t("health.backHome")}</Link>
    </main>
  )
}
