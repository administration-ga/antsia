"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { useCartConnectivity } from "@/components/cart/use-cart-draft"
import { Button, Card } from "@/components/shared/controls"
import { SCREEN_SECTIONS } from "@/components/shared/screen-layout"
import { ShopLink, useShopAction } from "@/components/shops/shop-ui"
import { professionalErrorKey } from "@/lib/professional-form"
import { routes } from "@/lib/routes"
import { ProfessionalFrame, ProfessionalReportButton } from "./profile-fields"

type Collaboration = FunctionReturnType<typeof api.modules.professionals.collaborations.listMine>["page"][number]
type Direction = "received" | "sent"

export function ProfessionalCollaborationsScreen() {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("professionals")
  return <ProfessionalFrame title={t("collaborations.title")} lead={t("collaborations.lead")}><Collaborations key={JSON.stringify([networkId, personId])} /></ProfessionalFrame>
}

function Collaborations() {
  const { t } = useTranslation("professionals")
  const [direction, setDirection] = useState<Direction>("received")
  return <><div className="flex flex-wrap gap-2" role="group" aria-label={t("collaborations.title")}>{(["received", "sent"] as const).map(value => <Button key={value} variant={direction === value ? "primary" : "outline"} aria-pressed={direction === value} onClick={() => setDirection(value)}>{t(value === "received" ? "collaborations.incoming" : "collaborations.outgoing")}</Button>)}</div><CollaborationList key={direction} direction={direction} /><ShopLink href={routes.professionals()}>{t("actions.directory")}</ShopLink></>
}

function CollaborationList({ direction }: { direction: Direction }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("professionals")
  const [cursor, setCursor] = useState<string | null>(null)
  const query = useAuthenticatedConvexQuery(direction === "received" ? api.modules.professionals.collaborations.listIncoming : api.modules.professionals.collaborations.listMine, { networkId, paginationOpts: { cursor, numItems: 12 } })
  if (query.isError) return <div className="grid gap-3"><p role="alert">{t("status.unavailable")}</p><Button variant="outline" onClick={() => { void query.refetch() }}>{t("actions.retry")}</Button></div>
  if (query.isPending || query.data === undefined) return <p role="status">{t("status.loading")}</p>
  return <section className={`${SCREEN_SECTIONS} gap-y-4`} aria-busy={query.isFetching || undefined}>{query.isFetching ? <p role="status" className="col-span-full">{t("status.refreshing")}</p> : null}{query.data.page.length ? query.data.page.map(row => <ProfessionalCollaborationCard key={row.collaborationId} row={row} refreshing={query.isFetching} reread={async () => { const result = await query.refetch(); return !result.isError && result.data !== undefined }} />) : <p role="status" className="col-span-full">{t(query.data.filteredWindow && !query.data.isDone ? "collaborations.filteredWindow" : "collaborations.empty")}</p>}<div className="col-span-full flex flex-wrap gap-2">{!query.data.isDone && query.data.continueCursor ? <Button variant="outline" disabled={query.isFetching} onClick={() => setCursor(query.data!.continueCursor)}>{t("actions.next")}</Button> : null}{cursor ? <Button variant="outline" disabled={query.isFetching} onClick={() => setCursor(null)}>{t("actions.first")}</Button> : null}</div></section>
}

export function ProfessionalCollaborationCard({ row, refreshing = false, reread }: { row: Collaboration; refreshing?: boolean; reread: () => Promise<boolean> }) {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("professionals")
  const router = useRouter()
  const connectivity = useCartConnectivity()
  const liveGeneration = useRef(connectivity.generation)
  useEffect(() => { liveGeneration.current = connectivity.generation }, [connectivity.generation])
  const action = useShopAction()
  const respond = useMutation(api.modules.professionals.collaborations.respond)
  const cancel = useMutation(api.modules.professionals.collaborations.cancel)
  const open = useMutation(api.modules.contextualMessaging.threads.openForObject)
  const [failure, setFailure] = useState<string | null>(null)
  const [changed, setChanged] = useState(false)
  const [needsReview, setNeedsReview] = useState(false)
  const [reviewedGeneration, setReviewedGeneration] = useState(connectivity.generation)
  const locked = action.pending || refreshing || !connectivity.online || needsReview || reviewedGeneration !== connectivity.generation
  const decide = async (decision: "accepted" | "declined" | "cancelled") => {
    if (locked || !navigator.onLine || (decision === "cancelled" ? !row.canCancel : !row.canRespond)) return
    const confirmKey = decision === "accepted" ? "collaborations.acceptConfirm" : decision === "declined" ? "collaborations.declineConfirm" : row.status === "accepted" ? "collaborations.endConfirm" : "collaborations.cancelConfirm"
    if (!window.confirm(t(confirmKey))) return
    const generation = liveGeneration.current
    setFailure(null); setChanged(false)
    const result = await action.run(async () => {
      try {
        const args = { networkId, collaborationId: row.collaborationId, expectedRevision: row.revision }
        if (decision === "cancelled") await cancel(args); else await respond({ ...args, decision })
        return { ok: true as const }
      } catch (error) { return { ok: false as const, key: professionalErrorKey(error) } }
    })
    if (!result || !action.current() || generation !== liveGeneration.current) return
    if (!result.ok) { setFailure(result.key); setNeedsReview(true); return }
    setChanged(true); setNeedsReview(true)
    // La nouvelle permission vient de la relecture, jamais d'une acceptation optimiste locale.
    const fresh = await reread()
    if (action.current() && generation === liveGeneration.current && fresh) setNeedsReview(false)
  }
  const read = async () => {
    if (action.pending || !navigator.onLine) return
    const generation = liveGeneration.current
    const result = await action.run(reread)
    if (result && action.current() && generation === liveGeneration.current) { setFailure(null); setNeedsReview(false); setReviewedGeneration(generation) }
  }
  const openMessages = async () => {
    if (locked || !navigator.onLine || row.status !== "accepted" || row.acceptedSource?.kind !== "professionalCollaboration" || row.acceptedSource.id !== row.collaborationId) return
    const generation = liveGeneration.current
    setFailure(null)
    const result = await action.run(async () => { try { return { ok: true as const, value: await open({ networkId, context: row.acceptedSource! }) } } catch { return { ok: false as const } } })
    if (!result || !action.current() || generation !== liveGeneration.current) return
    const href = result.ok ? routes.professionalConversation(result.value.threadId) : null
    if (href) router.push(href); else { setFailure("collaborations.closedMessaging"); setNeedsReview(true) }
  }
  const other = row.direction === "received" ? row.from : row.to
  return <Card><article className="grid min-w-0 gap-3"><header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="mp-subtitle">{t(row.direction === "received" ? "collaborations.from" : "collaborations.to", { name: other.displayName })}</h2><ShopLink href={routes.professionalProfile(other.handle)}>@{other.handle}</ShopLink></div><p className="rounded-full bg-muted px-3 py-1 text-sm">{t(`collaborations.statuses.${row.status}`)}</p></header><p className="text-sm font-medium">{t(`collaborationTypes.${row.collaborationType}`)}</p><p className="whitespace-pre-wrap">{row.message}</p><div className="flex flex-wrap gap-3 text-xs text-muted-foreground"><p>{t("collaborations.version", { revision: row.revision })}</p><p>{t("collaborations.date", { date: new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en" : "fr", { dateStyle: "medium" }).format(row.proposedAt) })}</p></div>{row.moderationStatus === "pending_review" ? <p role="status">{t("collaborations.pendingReview")}</p> : null}
    <div className="flex flex-wrap gap-2">{row.canRespond ? <><Button disabled={locked} pending={action.pending} onClick={() => { void decide("accepted") }}>{t("actions.accept")}</Button><Button variant="outline" disabled={locked} onClick={() => { void decide("declined") }}>{t("actions.decline")}</Button></> : null}{row.canCancel ? <Button variant="outline" disabled={locked} pending={action.pending} onClick={() => { void decide("cancelled") }}>{t(row.status === "accepted" ? "actions.end" : "actions.cancel")}</Button> : null}{row.status === "accepted" && row.acceptedSource ? <Button variant="outline" disabled={locked} onClick={() => { void openMessages() }}>{t("actions.messages")}</Button> : null}{row.direction === "received" ? <ProfessionalReportButton target={{ kind: "professionalCollaboration", id: row.collaborationId }} /> : null}</div>
    {row.status === "accepted" ? <p className="text-sm text-muted-foreground">{t("collaborations.messagesHint")}</p> : null}{!connectivity.online ? <p role="status">{t("status.offline")}</p> : null}{reviewedGeneration !== connectivity.generation ? <p role="status">{t("status.scopeChanged")}</p> : null}{changed ? <p role="status">{t("collaborations.updated")}</p> : null}{failure || action.error ? <p role="alert" className="text-sm text-destructive">{failure ? t(failure) : t("errors.unavailable")}</p> : null}{needsReview || reviewedGeneration !== connectivity.generation ? <Button variant="outline" pending={action.pending} disabled={!connectivity.online || refreshing} onClick={() => { void read() }}>{t("actions.reload")}</Button> : null}</article></Card>
}
