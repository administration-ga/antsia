"use client"

/**
 * SU01d (ordonnance n° 0011/PR/2026, art. 24, 32, 33) — l'alerte d'exploitation des délais légaux,
 * dans « Santé du réseau ». La requête rend les échéances des dossiers encore ouverts ou en examen,
 * à la minute et par fondement légal seulement ; l'écran les compte à son heure, car une requête
 * réactive n'est pas relue quand le temps passe. La file prioritaire des modérateurs reste le lieu
 * du traitement. C'est une donnée d'exploitation : la règle des petites cohortes vise ce qui se
 * publie ou s'exporte (`/transparence`, export agrégé), pas l'état courant des files.
 */
import { api, type Id } from "@antsia/api/engine"
import { REPORT_DEADLINES_ORDINANCE, REPORT_LEGAL_BASES, reportDecisionDelayHours, type ReportLegalBasis } from "@antsia/social-domain/moderation"
import { Button } from "@antsia/ui"
import { useQuery } from "convex/react"
import { AlertTriangle, Scale } from "lucide-react"
import { useId } from "react"
import { useTranslation } from "react-i18next"

import { ConsoleDate, ConsoleQueryBoundary, controlStyle, LoadingRows } from "./console-operation-controls"

/** « Dans les 24 h » : le délai le plus court de l'ordonnance (art. 32 et 33). */
export const LEGAL_DUE_SOON_MS = 24 * 3_600_000

export type LegalDeadlineAlertDto = { limit: number; horizon: number | null; deadlines: readonly { dueAt: number; basis: ReportLegalBasis }[] }
export type LegalDeadlineSummary = {
  overdue: number; overdueExact: boolean
  dueSoon: number; dueSoonExact: boolean
  open: number; openExact: boolean
  oldestOverdueAt: number | null
  overdueByBasis: Record<ReportLegalBasis, number>
}

/**
 * Les comptes de l'alerte à l'instant `now` de l'écran. En retard : échéance atteinte (`dueAt <= now`,
 * comme `reportDeadlineOutcome`). Une lecture bornée laisse hors vue des échéances toutes postérieures
 * ou égales à `horizon` : un compte n'est exact que si sa fenêtre se ferme avant ; sinon, « au moins ».
 * Les retards par fondement partagent l'exactitude des retards.
 */
export function summarizeLegalDeadlines(dto: Pick<LegalDeadlineAlertDto, "horizon" | "deadlines">, now: number): LegalDeadlineSummary {
  const overdueByBasis: Record<ReportLegalBasis, number> = { art24: 0, art32: 0, art33: 0 }
  let overdue = 0
  let dueSoon = 0
  let oldestOverdueAt: number | null = null
  for (const item of dto.deadlines) {
    if (item.dueAt <= now) {
      overdue += 1
      overdueByBasis[item.basis] += 1
      oldestOverdueAt = oldestOverdueAt === null ? item.dueAt : Math.min(oldestOverdueAt, item.dueAt)
    } else if (item.dueAt <= now + LEGAL_DUE_SOON_MS) dueSoon += 1
  }
  const beyond = dto.horizon ?? Number.POSITIVE_INFINITY
  return { overdue, overdueExact: now < beyond, dueSoon, dueSoonExact: now + LEGAL_DUE_SOON_MS < beyond, open: dto.deadlines.length, openExact: dto.horizon === null, oldestOverdueAt, overdueByBasis }
}

/** Une lecture en échec (moteur pas encore publié, panne) ne retire que ce bloc, jamais « Santé du réseau ». */
export function LegalDeadlinesAlert({ networkId, now }: { networkId: Id<"networks">; now: number }) {
  return <ConsoleQueryBoundary fallback={(_error, retry) => <LegalDeadlinesFailure retry={retry} />}><LegalDeadlinesBlock networkId={networkId} now={now} /></ConsoleQueryBoundary>
}

function LegalDeadlinesHeading({ id }: { id: string }) {
  const { t } = useTranslation("operations")
  return <h3 id={id} className="flex items-center gap-2 text-lg font-semibold"><Scale size={20} className="shrink-0" aria-hidden="true" />{t("health.legal.title")}</h3>
}

function LegalDeadlinesFailure({ retry }: { retry: () => void }) {
  const { t } = useTranslation("operations")
  const headingId = useId()
  return <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-4">
    <LegalDeadlinesHeading id={headingId} />
    <p role="alert" className="text-sm">{t("health.legal.failed")}</p>
    <div><Button type="button" variant="outline" style={controlStyle} onClick={retry}>{t("session.retry", { ns: "admin" })}</Button></div>
  </section>
}

/** Le bloc d'alerte, lu en direct et compté à l'heure `now` de « Santé du réseau ». */
function LegalDeadlinesBlock({ networkId, now }: { networkId: Id<"networks">; now: number }) {
  const { t, i18n } = useTranslation("operations")
  const headingId = useId()
  const result = useQuery(api.modules.platform.console.legalDeadlineAlert, { networkId })
  const number = new Intl.NumberFormat(i18n.language)
  const summary = result === undefined ? null : summarizeLegalDeadlines(result, now)
  // Hors de la lecture bornée, « au moins 0 » ne dirait rien : le compte est alors indéterminé.
  const count = (value: number, exact: boolean) => exact ? number.format(value) : value === 0 ? t("health.legal.undetermined") : t("health.legal.atLeast", { value: number.format(value) })
  const overdue = summary !== null && summary.overdue > 0
  return <section aria-labelledby={headingId} className={`flex min-w-0 flex-col gap-4 rounded-lg border p-4 ${overdue ? "border-destructive" : "border-border"}`}>
    <LegalDeadlinesHeading id={headingId} />
    <p className="text-sm text-muted-foreground">{t("health.legal.lead", { ordinance: REPORT_DEADLINES_ORDINANCE })}</p>
    {result === undefined || summary === null ? <LoadingRows /> : <>
      {overdue
        ? <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive p-3 text-sm"><AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" /><span className="min-w-0 break-words">{t("health.legal.overdue", { value: count(summary.overdue, summary.overdueExact) })}{summary.oldestOverdueAt !== null ? <> {t("health.legal.oldest")} <ConsoleDate at={summary.oldestOverdueAt} /></> : null}</span></p>
        : <p role="status" className="text-sm">{t("health.legal.noneOverdue")}</p>}
      <dl className="grid min-w-0 gap-3 sm:grid-cols-3">{([["overdue", summary.overdue, summary.overdueExact], ["dueSoon", summary.dueSoon, summary.dueSoonExact], ["open", summary.open, summary.openExact]] as const).map(([key, value, exact]) => <div key={key} className="min-w-0 rounded-lg border border-border p-3"><dt className="text-sm text-muted-foreground">{t(`health.legal.metrics.${key}`)}</dt><dd className="mt-1 break-words text-2xl font-semibold tabular-nums">{count(value, exact)}</dd></div>)}</dl>
      {overdue ? <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-medium">{t("health.legal.byBasis")}</p>
        <dl className="grid min-w-0 gap-3 sm:grid-cols-3">{REPORT_LEGAL_BASES.map((basis) => <div key={basis} className="min-w-0"><dt className="text-xs text-muted-foreground">{t(`health.legal.basis.${basis}`, { hours: reportDecisionDelayHours(basis) })}</dt><dd className="mt-1 break-words font-medium tabular-nums">{count(summary.overdueByBasis[basis], summary.overdueExact)}</dd></div>)}</dl>
      </div> : null}
      {result.horizon !== null ? <p className="text-xs text-muted-foreground">{t("health.legal.bounded", { limit: result.limit })}</p> : null}
    </>}
    <p className="text-xs text-muted-foreground">{t("health.legal.clockHint")}</p>
  </section>
}
