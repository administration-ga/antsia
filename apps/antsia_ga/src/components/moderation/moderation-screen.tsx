"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import type { ModerationSurface } from "@antsia/social-domain/moderationPolicy"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useId } from "react"
import { useTranslation } from "react-i18next"
import { MemberPage } from "@/components/member-chrome"
import { Button, Field } from "@/components/shared/controls"
import { routes } from "@/lib/routes"
import { DeadlineQueue, ReportArticle } from "./deadline-queue"
import { ModerationGuard, useModerationGuard } from "./moderation-guard"
import { PendingDecision } from "./moderation-forms"
import { moderationWindow, type ModerationView } from "./moderation-model"
import { NetworkAppealRows } from "./network-appeals"

export type ModerationSearch = { view?: string | string[]; team?: string | string[]; cursor?: string | string[] }

export function ModerationScreen({ search }: { search: ModerationSearch }) {
  return <ModerationGuard><MemberPage><ModerationContent search={search} /></MemberPage></ModerationGuard>
}

function ModerationContent({ search }: { search: ModerationSearch }) {
  const { t } = useTranslation("memberNetwork")
  const { networkId } = useNetwork()
  const router = useRouter()
  const guard = useModerationGuard()
  const id = useId()
  const capacity = useAuthenticatedConvexQuery(api.modules.moderation.cases.myCapacity, { networkId })
  if (capacity.error) return <div role="alert"><h1 className="text-2xl font-semibold">{t("moderation.title")}</h1><p>{t("common.failed")}</p><Button variant="outline" onClick={() => void capacity.refetch()}>{t("common.retry")}</Button></div>
  if (!capacity.data) return <p role="status">{t("common.loading")}</p>
  if (!capacity.data.networkWide && capacity.data.teams.length === 0) return <div className="flex flex-col gap-4"><h1 className="text-2xl font-semibold">{t("moderation.title")}</h1><p role="status">{t("moderation.noCapacity")}</p><Link href={routes.feed()} className="inline-flex min-h-11 items-center self-start rounded-lg px-3 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("discovery.back")}</Link></div>
  const window = moderationWindow(search, capacity.data)
  const team = capacity.data.teams.find((item) => item.teamId === window.team)
  const navigate = (view: ModerationView, teamId?: string, cursor?: string) => { if (guard.canLeave()) router.push(routes.moderationView(view, teamId, cursor)) }
  const views: ModerationView[] = ["reports", "pending"]
  if (capacity.data.canReviewAppeals) views.push("appeals")

  return <div className="flex flex-col gap-5 pb-[env(safe-area-inset-bottom)]">
    <header className="flex flex-col gap-2"><h1 className="text-2xl font-semibold">{t("moderation.title")}</h1><p className="text-sm text-muted-foreground">{t("moderation.lead")}</p></header>
    {window.view !== "appeals" ? <Field id={id} label={t("moderation.team")}>
      <select id={id} value={window.team ?? ""} disabled={guard.pending} className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => navigate(window.view, event.target.value || undefined)}>
        <option value="" disabled={!capacity.data.networkWide}>{t(capacity.data.networkWide ? "moderation.networkWide" : "moderation.chooseTeam")}</option>
        {capacity.data.teams.map((item) => <option key={item.teamId} value={item.teamId}>{item.name} — {t(item.scope ? `moderation.surfaces.${item.scope}` : "moderation.allSurfaces")}</option>)}
      </select>
    </Field> : null}
    <nav aria-label={t("moderation.views")} className="flex flex-wrap gap-2">
      {views.map((view) => <Button key={view} variant={window.view === view ? "primary" : "outline"} aria-current={window.view === view ? "page" : undefined} disabled={guard.pending} onClick={() => navigate(view, view === "appeals" ? undefined : window.team)}>{t(`moderation.${view}`)}</Button>)}
    </nav>
    {/* SU01d : la file prioritaire des délais légaux précède la file ordinaire des signalements. */}
    {window.valid && window.view === "reports" ? <DeadlineQueue key={`deadlines:${window.team ?? "network"}`} teamId={team?.teamId} /> : null}
    {!window.valid ? <p role="alert" className="rounded-xl border border-border bg-muted p-4">{t("moderation.invalidSelection")}</p> : window.view === "appeals" ? <NetworkAppealRows key={`appeals:${window.cursor ?? "first"}`} cursor={window.cursor} onFirst={() => navigate("appeals")} onNext={(cursor) => navigate("appeals", undefined, cursor)} /> : <ModerationRows key={`${window.view}:${window.team ?? "network"}:${window.cursor ?? "first"}`} view={window.view} teamId={team?.teamId} cursor={window.cursor} onFirst={() => navigate(window.view, window.team)} onNext={(cursor) => navigate(window.view, window.team, cursor)} />}
  </div>
}

function ModerationRows({ view, teamId, cursor, onFirst, onNext }: { view: Exclude<ModerationView, "appeals">; teamId?: Id<"moderationTeams">; cursor: string | null; onFirst: () => void; onNext: (cursor: string) => void }) {
  const { t } = useTranslation("memberNetwork")
  const { networkId } = useNetwork()
  const guard = useModerationGuard()
  const paginationOpts = { numItems: 20, cursor, maximumRowsRead: 50, maximumBytesRead: 262_144 }
  const args = { networkId, ...(teamId ? { teamId } : {}), paginationOpts }
  // SU01d : la file ordinaire écarte les dossiers à délai légal, présentés par la file prioritaire.
  const reports = useAuthenticatedConvexQuery(api.modules.moderation.cases.paginateQueue, view === "reports" ? { ...args, lane: "ordinary" as const } : "skip")
  const pending = useAuthenticatedConvexQuery(api.modules.moderation.cases.paginatePending, view === "pending" ? args : "skip")
  const data = view === "reports" ? reports.data : pending.data
  const error = view === "reports" ? reports.error : pending.error
  if (error) return <div role="alert" className="rounded-xl border border-destructive p-4"><p>{t("common.failed")}</p><Button variant="outline" onClick={() => void (view === "reports" ? reports.refetch() : pending.refetch())}>{t("common.retry")}</Button></div>
  if (!data) return <p role="status">{t("common.loading")}</p>
  return <>
    {view === "reports" ? <h2 className="text-xl font-semibold">{t("moderation.deadlines.ordinaryTitle")}</h2> : null}
    {data.page.length === 0 ? <p role="status" className="rounded-xl border border-border bg-card p-5 text-muted-foreground">{t(data.isDone ? "moderation.empty" : "moderation.emptyWindow")}</p> : null}
    {view === "reports" ? reports.data?.page.map((row) => <ReportArticle key={row.reportId} row={row} />) : pending.data?.page.map((row) => <article key={row.stateId} className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5"><h2 className="text-lg font-semibold">{t(`moderation.surfaces.${row.targetKind}`)}</h2><p className="break-words text-sm text-muted-foreground">{t("moderation.reference", { reference: row.targetId })}</p>{row.targetKind === "post" ? <Link href={routes.memberPost(row.targetId)} className="inline-flex min-h-11 items-center self-start rounded-lg px-3 text-sm underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("moderation.openPost")}</Link> : null}<PendingDecision targetKind={row.targetKind as ModerationSurface} targetId={row.targetId} /></article>)}
    <nav aria-label={t("moderation.pagination")} className="flex flex-wrap items-center justify-between gap-2">
      {cursor ? <Button variant="outline" disabled={guard.pending} onClick={onFirst}>{t("common.firstPage")}</Button> : <span />}
      {!data.isDone ? <Button variant="outline" disabled={guard.pending || !data.continueCursor || data.continueCursor === cursor} onClick={() => onNext(data.continueCursor)}>{t("common.next")}</Button> : <p role="status" className="text-sm text-muted-foreground">{t("common.end")}</p>}
    </nav>
  </>
}
