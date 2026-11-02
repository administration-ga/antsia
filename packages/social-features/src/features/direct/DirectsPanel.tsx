// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/DirectsPanel.tsx @ ad2e7fdc2 — adaptations : première tranche réécrite sur les trois listes paginées du moteur, réseau et routes injectés, libellés i18n ; création page et métadonnées de conservation sur les vignettes (F3c). ; PA6 : dates et jours civils dans le fuseau personnel du lecteur (repli appareil).
"use client"

import { formatViewerDate } from "@antsia/api/civil-date"
import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { Link } from "@antsia/api/routing"
import { Button } from "@antsia/ui"
import type { FunctionArgs } from "convex/server"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { requestConferenceLaunch } from "../iappel/conference-launch-store"

type Mode = "live" | "replays" | "mine"
type Card = { sessionId: Id<"liveSessions">; title: string; status?: "scheduled" | "live" | "ended"; audience?: string; host?: { displayName: string | null }; durationMs?: number | null; endedAt?: number; replay?: { status: string; egressState: string; publication: string; retentionUntil: number | null } | null }

export function DirectsPanel() {
  const { t } = useTranslation("direct")
  const { networkId } = useNetwork()
  const [mode, setMode] = useState<Mode>("live")
  return (
    <section aria-label={t("directory.title")} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("directory.title")}</h2>
        <Button icon="video" onClick={() => requestConferenceLaunch({ userIds: [] })}>{t("create.title")}</Button>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("directory.filters")}>
        {(["live", "replays", "mine"] as const).map((value) => <Button key={value} variant={mode === value ? "primary" : "ghost"} aria-pressed={mode === value} onClick={() => setMode(value)}>{t(`directory.${value}`)}</Button>)}
      </div>
      <DirectList key={`${networkId}:${mode}`} mode={mode} />
    </section>
  )
}

function DirectList({ mode }: { mode: Mode }) {
  const { t, i18n } = useTranslation("direct")
  const timeZone = useViewerTimeZone()
  const { networkId } = useNetwork()
  const routes = useRoutes()
  const [liveCursor, setLiveCursor] = useState<FunctionArgs<typeof api.modules.live.sessions.listLive>["cursor"]>()
  const [replayCursor, setReplayCursor] = useState<FunctionArgs<typeof api.modules.live.sessions.listReplays>["cursor"]>()
  const [mineCursor, setMineCursor] = useState<FunctionArgs<typeof api.modules.live.sessions.listMinePage>["cursor"]>()
  const [previous, setPrevious] = useState<Card[]>([])
  const live = useAuthenticatedConvexQuery(api.modules.live.sessions.listLive, mode === "live" ? { networkId, cursor: liveCursor, limit: 20 } : "skip")
  const replays = useAuthenticatedConvexQuery(api.modules.live.sessions.listReplays, mode === "replays" ? { networkId, cursor: replayCursor, limit: 20 } : "skip")
  const mine = useAuthenticatedConvexQuery(api.modules.live.sessions.listMinePage, mode === "mine" ? { networkId, cursor: mineCursor, limit: 20 } : "skip")
  const query = mode === "live" ? live : mode === "replays" ? replays : mine
  const items: Card[] = [...new Map([...previous, ...(query.data?.items ?? [])].map((card) => [card.sessionId, card])).values()]
  const more = () => {
    setPrevious(items)
    if (mode === "live" && live.data?.nextCursor) setLiveCursor(live.data.nextCursor)
    if (mode === "replays" && replays.data?.nextCursor) setReplayCursor(replays.data.nextCursor)
    if (mode === "mine" && mine.data?.nextCursor) setMineCursor(mine.data.nextCursor)
  }
  if (query.isError) return <p role="alert">{t("failed")} <Button variant="ghost" onClick={() => void query.refetch()}>{t("retry")}</Button></p>
  return (
    <>
      {query.isPending ? <p role="status">{t("loading")}</p> : null}
      {!query.isPending && !query.isError && items.length === 0 ? <p className="text-sm text-muted-foreground">{t(`directory.empty.${mode}`)}</p> : null}
      <ul className="flex flex-col gap-3">
        {items.map((card) => <li key={card.sessionId} className="rounded-[var(--esp-primitive-card-radius,0.75rem)] border border-[var(--esp-primitive-surface-border,var(--border))] bg-card p-4">
          <Link href={routes.conference(card.sessionId)} className="flex min-h-11 items-center justify-between gap-3 font-medium">
            <span>{card.title}</span><span className="text-sm text-muted-foreground">{t(`status.${card.status ?? (mode === "live" ? "live" : "ended")}`)}</span>
          </Link>
          {card.host ? <p className="text-sm text-muted-foreground">{card.host.displayName ?? t("person")}</p> : null}
          {card.audience ? <p className="text-sm text-muted-foreground">{t(`audience.${card.audience}`)}</p> : null}
          {card.replay ? <div className="flex flex-col gap-1 text-sm"><p>{t(`replay.egress.${card.replay.egressState}`)}</p><p>{t(`replay.publication.${card.replay.publication}`)}</p>{card.replay.retentionUntil ? <p>{t("replay.retention", { date: formatViewerDate(card.replay.retentionUntil, i18n.language, { dateStyle: "long" }, timeZone) })}</p> : null}</div> : null}
          {card.durationMs ? <p className="text-sm text-muted-foreground">{t("replay.durationMinutes", { minutes: Math.max(1, Math.round(card.durationMs / 60_000)) })}</p> : null}
        </li>)}
      </ul>
      {query.data?.nextCursor ? <Button variant="ghost" disabled={query.isFetching} onClick={more}>{t("more")}</Button> : null}
    </>
  )
}
