"use client"

/**
 * SU01d (ordonnance n° 0011/PR/2026, art. 24, 32, 33) — la file prioritaire des modérateurs :
 * les dossiers à délai légal, l'échéance la plus proche d'abord, chacun avec son fondement, son
 * chronomètre (reste ou retard), son échéance et l'état de l'accusé de réception. Le temps de
 * l'écran avance seul ; la base n'est relue que par la requête réactive.
 */
import { api, type Id } from "@antsia/api/engine"
import { formatViewerDate } from "@antsia/api/civil-date"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { CONTENT_REPORT_REASONS, type ReportLegalBasis } from "@antsia/social-domain/moderation"
import type { FunctionReturnType } from "convex/server"
import Link from "next/link"
import { useEffect, useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shared/controls"
import { routes } from "@/lib/routes"
import { ReportDecision } from "./moderation-forms"
import { deadlineCountdown } from "./moderation-model"

export type ModerationQueueRow = FunctionReturnType<typeof api.modules.moderation.cases.deadlineQueue>["items"][number]

/** Le temps de l'écran, rafraîchi toutes les 30 s : le chronomètre suit sans relire la base. */
export function useModerationClock(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

/** Le délai légal d'un dossier : fondement, reste ou retard, échéance, accusé de réception. */
export function DeadlineBadge({ basis, dueAt, acknowledgedAt, now }: { basis: ReportLegalBasis; dueAt: number; acknowledgedAt: number | null; now: number }) {
  const { t, i18n } = useTranslation("memberNetwork")
  const timeZone = useViewerTimeZone()
  const countdown = deadlineCountdown(dueAt, now)
  const duration = countdown.hours > 0
    ? t("moderation.deadlines.hoursMinutes", { hours: countdown.hours, minutes: countdown.minutes })
    : t("moderation.deadlines.minutes", { minutes: countdown.minutes })
  const format = (at: number) => formatViewerDate(at, i18n.language, { dateStyle: "medium", timeStyle: "short" }, timeZone)
  return <div className={`flex flex-col gap-1 rounded-lg border p-3 text-sm ${countdown.overdue ? "border-destructive" : "border-border"}`}>
    <p className="font-medium">{t(`moderation.deadlines.basis.${basis}`)}</p>
    <p role="timer" className={countdown.overdue ? "font-semibold text-destructive" : "font-semibold"}>{t(countdown.overdue ? "moderation.deadlines.overdue" : "moderation.deadlines.remaining", { duration })}</p>
    <p className="text-muted-foreground"><time dateTime={new Date(dueAt).toISOString()}>{t("moderation.deadlines.dueAt", { date: format(dueAt) })}</time></p>
    <p className="text-muted-foreground">{acknowledgedAt !== null ? t("moderation.deadlines.acknowledged", { date: format(acknowledgedAt) }) : t("moderation.deadlines.notAcknowledged")}</p>
  </div>
}

/** Un dossier d'une file : surface, référence, date, motif, délai légal éventuel et décision. */
export function ReportArticle({ row, now }: { row: ModerationQueueRow; now?: number }) {
  const { t, i18n } = useTranslation("memberNetwork")
  const timeZone = useViewerTimeZone()
  const reason = (CONTENT_REPORT_REASONS as readonly string[]).includes(row.reason) ? t(`reseau:reportContentDialog.reasons.${row.reason}`) : row.reason
  return <article className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
    <h3 className="text-lg font-semibold">{t(`moderation.surfaces.${row.target.kind}`)}</h3>
    <p className="break-words text-sm text-muted-foreground">{t("moderation.reference", { reference: row.target.id })}</p>
    {row.target.kind === "post" ? <Link href={routes.memberPost(row.target.id)} className="inline-flex min-h-11 items-center self-start rounded-lg px-3 text-sm underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("moderation.openPost")}</Link> : null}
    <time dateTime={new Date(row.createdAt).toISOString()} className="text-sm text-muted-foreground">{formatViewerDate(row.createdAt, i18n.language, { dateStyle: "medium", timeStyle: "short" }, timeZone)}</time>
    <p className="break-words whitespace-pre-wrap">{t("moderation.reportReason", { reason })}</p>
    {row.legalBasis !== null && row.dueAt !== null ? <DeadlineBadge basis={row.legalBasis} dueAt={row.dueAt} acknowledgedAt={row.acknowledgedAt} now={now ?? Date.now()} /> : null}
    <ReportDecision reportId={row.reportId} />
  </article>
}

/** La file prioritaire d'un réseau ou d'une équipe, bornée aux 50 échéances les plus proches. */
export function DeadlineQueue({ teamId }: { teamId?: Id<"moderationTeams"> }) {
  const { t } = useTranslation("memberNetwork")
  const { networkId } = useNetwork()
  const now = useModerationClock()
  const headingId = useId()
  const queue = useAuthenticatedConvexQuery(api.modules.moderation.cases.deadlineQueue, { networkId, ...(teamId ? { teamId } : {}) })
  if (queue.error) return <div role="alert" className="rounded-xl border border-destructive p-4"><p>{t("common.failed")}</p><Button variant="outline" onClick={() => void queue.refetch()}>{t("common.retry")}</Button></div>
  if (!queue.data) return <p role="status">{t("common.loading")}</p>
  const { items, truncated } = queue.data
  const overdue = items.filter((row) => row.dueAt !== null && row.dueAt < now).length
  return <section aria-labelledby={headingId} className="flex flex-col gap-3">
    <header className="flex flex-col gap-1">
      <h2 id={headingId} className="text-xl font-semibold">{t("moderation.deadlines.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("moderation.deadlines.lead")}</p>
    </header>
    {items.length === 0
      ? <p role="status" className="rounded-xl border border-border bg-card p-5 text-muted-foreground">{t("moderation.deadlines.empty")}</p>
      : <p role="status" className="flex flex-wrap gap-x-1 text-sm font-medium">
        <span>{t("moderation.deadlines.summary", { count: items.length })}</span>
        {overdue > 0 ? <span className="text-destructive">{t("moderation.deadlines.overdueCount", { count: overdue })}</span> : null}
      </p>}
    {items.map((row) => <ReportArticle key={row.reportId} row={row} now={now} />)}
    {truncated ? <p className="text-sm text-muted-foreground">{t("moderation.deadlines.truncated")}</p> : null}
  </section>
}
