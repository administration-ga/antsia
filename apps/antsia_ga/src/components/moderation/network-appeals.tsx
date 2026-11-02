"use client"

import { api } from "@antsia/api/engine"
import { formatViewerDate } from "@antsia/api/civil-date"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shared/controls"
import { AppealDecision } from "./moderation-forms"
import { useModerationGuard } from "./moderation-guard"

/** Le recours présente les motifs et sanctions, jamais le contenu ou des identités. */
export function NetworkAppealRows({ cursor, onFirst, onNext }: { cursor: string | null; onFirst: () => void; onNext: (cursor: string) => void }) {
  const { t, i18n } = useTranslation("memberNetwork")
  const { networkId } = useNetwork()
  const timeZone = useViewerTimeZone()
  const guard = useModerationGuard()
  const query = useAuthenticatedConvexQuery(api.modules.moderation.networkAppeals.paginate, { networkId, paginationOpts: { numItems: 20, cursor, maximumRowsRead: 50, maximumBytesRead: 262_144 } })
  if (query.error) return <div role="alert" className="rounded-[var(--ui2-card-radius)] border border-destructive p-[var(--esp-card-padding,16px)]"><p>{t("common.failed")}</p><Button variant="outline" onClick={() => void query.refetch()}>{t("common.retry")}</Button></div>
  const data = query.data
  if (!data) return <p role="status">{t("common.loading")}</p>
  const date = (at: number) => formatViewerDate(at, i18n.language, { dateStyle: "medium", timeStyle: "short" }, timeZone)
  return <>
    <p className="text-sm text-muted-foreground">{t("moderation.appealScope")}</p>
    {data.page.length === 0 ? <p role="status" className="rounded-[var(--ui2-card-radius)] border border-[color:var(--esp-surface-border)] bg-card p-[var(--esp-card-padding,16px)] text-muted-foreground">{t(data.isDone ? "moderation.empty" : "moderation.emptyWindow")}</p> : data.page.map((row) => <article key={row.appealId} className="flex min-w-0 flex-col gap-3 rounded-[var(--ui2-card-radius)] border border-[color:var(--esp-surface-border)] bg-card p-[var(--esp-card-padding,16px)] ">
      <h2 className="antsia-subtitle ">{t("moderation.appealTitle")}</h2>
      <time dateTime={new Date(row.createdAt).toISOString()} className="text-sm text-muted-foreground">{date(row.createdAt)}</time>
      <p className="break-words whitespace-pre-wrap">{t("moderation.appealReason", { reason: row.reason })}</p>
      <p className="break-words whitespace-pre-wrap text-sm text-muted-foreground">{row.decisionReason ? t("moderation.initialReason", { reason: row.decisionReason }) : t("moderation.initialReasonMissing")}</p>
      <section aria-label={t("moderation.initialSanctions")} className="flex flex-col gap-2 text-sm">
        {row.sanctions.length === 0 ? <p>{t("moderation.noSanctions")}</p> : <ul className="list-inside list-disc">{row.sanctions.map((sanction, index) => <li key={`${sanction.kind}:${index}`}>{t(`moderation.sanctions.${sanction.kind}`)}{sanction.until === null ? null : t("moderation.sanctionUntil", { date: date(sanction.until) })}</li>)}</ul>}
      </section>
      <AppealDecision appealId={row.appealId} canDecide={row.canDecide} />
    </article>)}
    <nav aria-label={t("moderation.pagination")} className="flex flex-wrap items-center justify-between gap-2">
      {cursor ? <Button variant="outline" disabled={guard.pending} onClick={onFirst}>{t("common.firstPage")}</Button> : <span />}
      {!data.isDone ? <Button variant="outline" disabled={guard.pending || !data.continueCursor || data.continueCursor === cursor} onClick={() => onNext(data.continueCursor)}>{t("common.next")}</Button> : <p role="status" className="text-sm text-muted-foreground">{t("common.end")}</p>}
    </nav>
  </>
}
