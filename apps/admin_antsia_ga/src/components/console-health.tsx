"use client"

import { api, type Id } from "@antsia/api/engine"
import { Button } from "@antsia/ui"
import { useMutation, useQuery } from "convex/react"
import { Activity, AlertTriangle, RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { LegalDeadlinesAlert } from "./console-legal-deadlines"
import { ConsoleDate, controlStyle, LoadingRows, OperationFailure, panelClass, useOperation } from "./console-operation-controls"

const metricKeys = ["members", "openReports", "openAppeals", "pendingFiles", "deadLetters"] as const
export function HealthPanel({ networkId }: { networkId: Id<"networks"> }) {
  const { t, i18n } = useTranslation("operations")
  const metrics = useQuery(api.modules.platform.console.getMetrics, { networkId })
  const operational = useQuery(api.modules.platform.operationalHealth.get, { networkId })
  const refresh = useMutation(api.modules.platform.console.refreshMetrics)
  const operation = useOperation()
  const [clock, setClock] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const number = new Intl.NumberFormat(i18n.language)
  return <section className={`${panelClass} flex min-w-0 flex-col gap-5`}>
    <h2 className="flex items-center gap-2 text-xl font-semibold"><Activity size={22} aria-hidden="true" />{t("health.title")}</h2>
    <p className="text-sm text-muted-foreground">{t("health.lead")}</p>
    <LegalDeadlinesAlert networkId={networkId} now={clock} />
    {metrics === undefined ? <LoadingRows /> : metrics === null ? <p role="status">{t("health.notGenerated")}</p> : metrics.status === "building" ? <p role="status" className="rounded-lg bg-muted p-4">{t("health.building")}</p> : <>
      {metrics.generatedAt !== null ? <p className="text-sm text-muted-foreground">{t("health.generated")} <ConsoleDate at={metrics.generatedAt} /></p> : <p role="status">{t("health.dateMissing")}</p>}
      <dl className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">{metricKeys.map((key) => <div key={key} className="rounded-lg border border-border p-4"><dt className="text-sm text-muted-foreground">{t(`health.metrics.${key}`)}</dt><dd className="mt-2 text-3xl font-semibold tabular-nums">{number.format(metrics.counts[key])}</dd></div>)}</dl>
    </>}
    <OperationFailure message={operation.error} />
    <Button type="button" style={controlStyle} disabled={operation.pending || metrics === undefined || metrics?.status === "building"} onClick={() => { void operation.run(() => refresh({ networkId }), "health.queued") }}><RefreshCw size={16} aria-hidden="true" />{t(operation.pending ? "common.saving" : "health.refresh")}</Button>
    <p className="text-xs text-muted-foreground">{t("health.snapshotHint")}</p>
    <section className="flex min-w-0 flex-col gap-4 border-t border-border pt-5" aria-label={t("health.operational.title")}>
      <h3 className="text-lg font-semibold">{t("health.operational.title")}</h3>
      <p className="text-sm text-muted-foreground">{t("health.operational.lead")}</p>
      {operational === undefined ? <LoadingRows /> : operational === null ? <p role="status">{t("health.operational.notGenerated")}</p> : <>
        <p className="text-sm text-muted-foreground">{t("health.operational.observed")} <ConsoleDate at={operational.observedAt} /></p>
        <p className="text-sm text-muted-foreground">{t("health.operational.window")} <ConsoleDate at={operational.windowStart} /> — <ConsoleDate at={operational.windowEnd} /></p>
        <p className="text-sm">{t("health.operational.scanned", { count: operational.scanned, limit: operational.scanLimit })}</p>
        <p role="status" className="rounded-lg bg-muted p-3 text-sm">{t(`health.operational.${operational.coverage}`)}</p>
        {operational.stale || clock - operational.observedAt > 15 * 60 * 1000 ? <p role="status" className="rounded-lg border border-border p-3 text-sm">{t("health.operational.stale")}</p> : null}
        {operational.warning ? <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive p-3 text-sm"><AlertTriangle size={18} className="shrink-0" aria-hidden="true" />{t("health.operational.warning", { count: operational.failed })}</p> : <p role="status" className="text-sm">{t("health.operational.noneObserved")}</p>}
        <dl className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">{(["failed", "pending", "inProgress", "successful", "canceled"] as const).map(key => <div key={key} className="rounded-lg border border-border p-3"><dt className="text-sm text-muted-foreground">{t(`health.operational.metrics.${key}`)}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{number.format(operational[key])}</dd></div>)}</dl>
      </>}
      <p className="text-xs text-muted-foreground">{t("health.operational.synchronousNotMeasured")}</p>
    </section>
  </section>
}
