"use client"
import { useStableConvexAuth } from "@antsia/api/hooks"
import { formatViewerDate } from "@antsia/api/civil-date"
import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { BRAND_NAME } from "@antsia/social-contracts/brand"
import { ROOT_NETWORK_SLUG } from "@antsia/social-domain/network"
import { zodResolver } from "@hookform/resolvers/zod"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { useConvex, useMutation, usePaginatedQuery, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { Download, LogOut, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CONTENT_REPORT_REASONS } from "@antsia/social-domain/moderation"
import { useEffect, useId, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"
import { Button, Card, CenteredStatus, Field, TextArea, TextInput } from "./shared/controls"
import { NotificationControls } from "./notification-controls"
import { PreferencesControls } from "./preferences-controls"
import { AnalyticsControls } from "./analytics-controls"
import { PersonalCommerceControls } from "./personal-commerce-controls"
import { ErasureCommerceNotice } from "./erasure-commerce-notice"
import { PageModerationDecisions } from "./page-moderation-decisions"
import { PublicAgentControls } from "./public-agent-controls"
import { PERSONAL_REPORTS_ANCHOR, routes } from "@/lib/routes"
import { signOutAndRedirect } from "@/lib/sign-out"

function AppealForm({ reportId }: { reportId: Id<"reports"> }) {
  const { t } = useTranslation("antsia")
  const appeal = useMutation(api.modules.moderation.cases.fileAppeal)
  const form = useForm<{ reason: string }>({ resolver: zodResolver(z.object({ reason: z.string().trim().min(10, t("personal.appealHint")).max(500, t("personal.appealHint")) })), defaultValues: { reason: "" } })
  return <form className="flex flex-col gap-3" noValidate onSubmit={form.handleSubmit(async ({ reason }) => {
    try { await appeal({ reportId, reason }); form.reset(); toast.success(t("personal.appealSent")) }
    catch { toast.error(t("personal.error")) }
  })}>
    <Field id={`appeal-${reportId}`} label={t("personal.appealLabel")} hint={t("personal.appealHint")} error={form.formState.errors.reason?.message}>
      <TextArea id={`appeal-${reportId}`} aria-invalid={Boolean(form.formState.errors.reason)} aria-describedby={`appeal-${reportId}-hint${form.formState.errors.reason ? ` appeal-${reportId}-error` : ""}`} maxLength={500} {...form.register("reason")} disabled={form.formState.isSubmitting} />
    </Field>
    <Button variant="outline" pending={form.formState.isSubmitting} type="submit">{t("personal.appeal")}</Button>
  </form>
}

function Decisions() {
  const { t } = useTranslation("antsia")
  const { results, status, loadMore } = usePaginatedQuery(api.modules.moderation.cases.myDecisions, {}, { initialNumItems: 10 })
  return <Card><h2 className="mb-4 text-xl font-semibold">{t("personal.decisionsTitle")}</h2>
    {status === "LoadingFirstPage" ? <p role="status">{t("personal.loading")}</p> : !results.length ? <p className="text-muted-foreground">{t("personal.noDecisions")}</p> : null}
    <div className="flex flex-col gap-4">{results.map((decision) => <article key={decision.reportId} className="rounded-[var(--ui2-card-radius)] border border-border p-4">
      <p className="font-medium">{t(`personal.statuses.${decision.status}`)}</p>
      {decision.decisionReason ? <p className="my-3 break-words text-sm">{decision.decisionReason}</p> : null}
      {decision.status === "actioned" && decision.appeals.length < 2 ? <AppealForm reportId={decision.reportId} /> : null}
    </article>)}</div>
    {status === "CanLoadMore" || status === "LoadingMore" ? <Button className="mt-4" variant="ghost" pending={status === "LoadingMore"} onClick={() => loadMore(10)}>{t("personal.loadMore")}</Button> : null}
  </Card>
}

/**
 * SU01d (ordonnance n° 0011/PR/2026, art. 24) — MES signalements : l'accusé de réception,
 * l'échéance légale et l'issue pour le contenu. Ni l'auteur, ni la sanction, ni le motif écrit
 * par la modération. Ouverte par l'accusé de réception et par l'avis de décision (`#mes-signalements`).
 */
function Reports() {
  const { t, i18n } = useTranslation("antsia")
  const timeZone = useViewerTimeZone()
  const headingId = useId()
  const { results, status, loadMore } = usePaginatedQuery(api.modules.moderation.cases.myReports, {}, { initialNumItems: 10 })
  const loaded = status !== "LoadingFirstPage"
  // La section n'existe qu'après chargement : l'ouverture d'un avis la place et lui donne le focus.
  useEffect(() => {
    if (!loaded || window.location.hash.slice(1) !== PERSONAL_REPORTS_ANCHOR) return
    const section = document.getElementById(PERSONAL_REPORTS_ANCHOR)
    if (!section) return
    section.scrollIntoView({ block: "start" })
    section.focus({ preventScroll: true })
  }, [loaded])
  const format = (at: number) => formatViewerDate(at, i18n.language, { dateStyle: "medium", timeStyle: "short" }, timeZone)
  return <section id={PERSONAL_REPORTS_ANCHOR} tabIndex={-1} aria-labelledby={headingId} className="scroll-mt-24 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <Card><h2 id={headingId} className="text-xl font-semibold">{t("personal.reportsTitle")}</h2>
      <p className="mb-4 mt-3 text-sm text-muted-foreground">{t("personal.reportsLead")}</p>
      {!loaded ? <p role="status">{t("personal.loading")}</p> : !results.length ? <p className="text-muted-foreground">{t("personal.noReports")}</p> : null}
      <div className="flex flex-col gap-4">{results.map((report) => <article key={report.reportId} className="flex flex-col gap-1 rounded-[var(--ui2-card-radius)] border border-border p-4 text-sm">
        <p className="text-base font-medium">{t(`personal.reportOutcomes.${report.outcome}`)}</p>
        <p>{t((CONTENT_REPORT_REASONS as readonly string[]).includes(report.reason) ? `reseau:reportContentDialog.reasons.${report.reason}` : "reseau:reportContentDialog.reasons.other")} · {t(`memberNetwork:moderation.surfaces.${report.targetKind}`)}</p>
        <p className="text-muted-foreground">{t("personal.reportedOn", { date: format(report.createdAt) })}</p>
        {report.acknowledgedAt !== null ? <p className="text-muted-foreground">{t("personal.reportAcknowledgedOn", { date: format(report.acknowledgedAt) })}</p> : null}
        {report.legalBasis !== null && report.dueAt !== null ? <p className="text-muted-foreground">{t(`memberNetwork:moderation.deadlines.basis.${report.legalBasis}`)} — {t("personal.reportDueBy", { date: format(report.dueAt) })}</p> : null}
        {report.decidedAt !== null ? <p className="text-muted-foreground">{t("personal.reportDecidedOn", { date: format(report.decidedAt) })}</p> : null}
      </article>)}</div>
      {status === "CanLoadMore" || status === "LoadingMore" ? <Button className="mt-4" variant="ghost" pending={status === "LoadingMore"} onClick={() => loadMore(10)}>{t("personal.loadMore")}</Button> : null}
    </Card>
  </section>
}

function DataRights() {
  const { t, i18n } = useTranslation("antsia")
  const timeZone = useViewerTimeZone()
  const convex = useConvex()
  const job = useQuery(api.modules.people.erasure.myErasure, {})
  const exportData = useMutation(api.modules.people.erasure.exportMyData)
  const erase = useMutation(api.modules.people.erasure.requestErasure)
  const cancel = useMutation(api.modules.people.erasure.cancelErasure)
  const [exporting, setExporting] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [progress, setProgress] = useState({ max: 1, value: 0 })
  const generation = useRef(0)
  useEffect(() => () => { generation.current += 1 }, [])
  const word = t("personal.confirmWord")
  const form = useForm<{ confirmation: string }>({ resolver: zodResolver(z.object({ confirmation: z.string().refine((value) => value === word, t("personal.confirmError")) })), defaultValues: { confirmation: "" } })
  return <>
    <Card><h2 className="text-xl font-semibold">{t("personal.exportTitle")}</h2><p className="my-3 text-sm text-muted-foreground">{t("personal.exportLead")}</p>
      <Button pending={exporting} onClick={async () => {
        const current = ++generation.current
        setExporting(true)
        try {
          const result = await exportData({})
          let tableIndex = 0, cursor: string | null = null, bytes = 0
          const chunks: string[] = [JSON.stringify({ table: "authentication", record: JSON.parse(result.accountJson) })]
          for (let pageNumber = 0; pageNumber < 5_000; pageNumber++) {
            if (generation.current !== current) return
            const page: FunctionReturnType<typeof api.modules.people.erasure.exportMyDataPage> = await convex.query(api.modules.people.erasure.exportMyDataPage, { exportId: result.exportId, tableIndex, cursor })
            if (generation.current !== current) return
            const records: unknown = JSON.parse(page.json)
            if (!Array.isArray(records)) throw new Error("Invalid export")
            for (const record of records) {
              const chunk = JSON.stringify({ table: page.table, record })
              bytes += new TextEncoder().encode(chunk).byteLength
              if (bytes > 64 * 1024 * 1024) throw new Error("Export exceeds browser capacity")
              chunks.push(chunk)
            }
            setProgress({ max: result.tableCount, value: page.nextTableIndex })
            if (page.done) {
              const url = URL.createObjectURL(new Blob([`[${chunks.join(",")}]`], { type: "application/json" }))
              const anchor = document.createElement("a")
              anchor.href = url; anchor.download = `${BRAND_NAME.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`
              document.body.append(anchor); anchor.click(); anchor.remove()
              setTimeout(() => URL.revokeObjectURL(url), 1_000)
              toast.success(t("personal.exportDone")); return
            }
            tableIndex = page.nextTableIndex; cursor = page.cursor
          }
          throw new Error("Export page limit")
        } catch { if (generation.current === current) toast.error(t("personal.error")) }
        finally { if (generation.current === current) setExporting(false) }
      }}><Download aria-hidden="true" className="size-4" />{t(exporting ? "personal.exporting" : "personal.export")}</Button>
      {exporting ? <progress className="mt-3 w-full" max={progress.max} value={progress.value} aria-label={t("personal.exporting")} /> : null}
    </Card>
    <Card><h2 className="text-xl font-semibold">{t("personal.eraseTitle")}</h2><p className="my-3 text-sm text-muted-foreground">{t("personal.eraseLead")}</p><ErasureCommerceNotice />
      {job === undefined ? <p role="status">{t("personal.loading")}</p> : job ? <>
        <p role="status" className="mb-4">{t("personal.eraseRequested", { date: formatViewerDate(job.dueAt, i18n.language, { dateStyle: "long" }, timeZone) })}</p>
        <Button variant="outline" pending={canceling} disabled={!job.canCancel} onClick={async () => { setCanceling(true); try { await cancel({}); toast.success(t("personal.eraseCancelled")) } catch { toast.error(t("personal.error")) } finally { setCanceling(false) } }}>{t("personal.cancelErase")}</Button>
      </> : <form className="flex flex-col gap-3" noValidate onSubmit={form.handleSubmit(async () => {
        try { await erase({ confirmation: "DELETE_MY_ANTSIA_ACCOUNT" }); form.reset() } catch { toast.error(t("personal.error")) }
      })}>
        <Field id="erase-confirmation" label={t("personal.confirmLabel", { word })} error={form.formState.errors.confirmation?.message}>
          <TextInput id="erase-confirmation" autoComplete="off" disabled={form.formState.isSubmitting} aria-invalid={Boolean(form.formState.errors.confirmation)} {...form.register("confirmation")} />
        </Field>
        <Button variant="danger" type="submit" pending={form.formState.isSubmitting}>{t("personal.erase")}</Button>
      </form>}
    </Card>
  </>
}

/** La porte personnelle n'exige pas une adhésion active : la suspension n'efface pas les recours. */
export function PersonalControls() {
  const { t } = useTranslation("antsia")
  const auth = useStableConvexAuth(), router = useRouter()
  const person = useQuery(api.modules.people.persons.getMyPerson, auth.isAuthenticated ? {} : "skip")
  const memberships = useQuery(api.modules.people.memberships.myMemberships, auth.isAuthenticated ? {} : "skip")
  const root = useQuery(api.modules.networks.networks.getBySlug, { slug: ROOT_NETWORK_SLUG })
  const [leaving, setLeaving] = useState(false)
  useEffect(() => { if (auth.isUnauthenticated) router.replace(routes.signIn()) }, [auth.isUnauthenticated, router])
  if (!auth.isAuthenticated || !person) return <CenteredStatus label={t("session.checking")} />
  const active = root && memberships?.some((membership) => membership.networkId === root._id && ["en_attente", "declaree", "verifiee"].includes(membership.status))
  return <div className="esp-page-motif min-h-dvh bg-background text-foreground">
    <header className="border-b border-border"><nav className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3" aria-label={t("nav.label")}>
      <Link href={routes.feed()} className="font-semibold">{BRAND_NAME}</Link><Button variant="ghost" pending={leaving} onClick={async () => { setLeaving(true); await signOutAndRedirect() }}><LogOut aria-hidden="true" className="size-4" />{t("nav.signOut")}</Button>
    </nav></header>
    <main id="contenu" tabIndex={-1} className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
      <header><ShieldCheck aria-hidden="true" className="mb-3 size-6 text-primary" /><h1 className="text-3xl">{t("personal.title")}</h1><p className="mt-3 text-muted-foreground">{t("personal.lead")}</p><Link className="mt-4 inline-flex min-h-11 items-center text-sm underline" href={routes.feed()}>{t("personal.home")}</Link></header>
      <PreferencesControls /><PublicAgentControls key={`${person._id}:agent`} /><AnalyticsControls /><PersonalCommerceControls key={`${person._id}:commerce`} personId={person._id} /><DataRights /><Decisions /><Reports />
      {root && active ? <PageModerationDecisions key={`${person._id}:pages`} networkId={root._id} personId={person._id} /> : null}
      {root && memberships?.some((membership) => membership.networkId === root._id) ? <NotificationControls networkId={root._id} canActivate={Boolean(active)} /> : null}
    </main>
  </div>
}
