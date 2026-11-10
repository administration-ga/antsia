"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { useConvex, useMutation } from "convex/react"
import { COMMERCE_JOBS_APPLICATION_CONSENT_VERSION } from "@antsia/social-domain/commerce-jobs"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { RefreshCw, RotateCcw, Undo2 } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button, Card, CenteredStatus } from "@/components/shared/controls"
import { SCREEN_SECTIONS } from "@/components/shared/screen-layout"
import { ShopFrame, ShopLink } from "@/components/shops/shop-ui"
import { routes } from "@/lib/routes"
import { useJobApplicationAnnouncement } from "./job-application-announcement"
import { JobFilesManager } from "./job-application-form"
import { JobReviewNotice, useJobAction, useJobReview } from "./job-guards"
import { JOB_PAGE_SIZE, jobCivilNamePreview, jobInstantText, type MyApplication } from "./job-model"

/**
 * Mes candidatures (Profil) : état de transport, état AUTORISÉ chez l'employeur
 * (jamais une note), retrait toujours possible, relance, actualisation, et mes
 * pièces. Aucune adresse de fichier, aucun frais.
 */
export function MyApplicationsScreen() {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("jobs")
  return <ShopFrame title={t("applications.title")} lead={t("applications.lead")}><MyApplicationsWindow key={`${networkId}:${personId}`} /><MyFiles key={`files:${networkId}:${personId}`} /></ShopFrame>
}

function MyApplicationsWindow() {
  const { networkId } = useNetwork()
  const { t } = useTranslation("jobs")
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const cursor = cursors[cursors.length - 1] ?? null
  const query = useAuthenticatedConvexQuery(api.modules.shops.jobApplications.myApplications, { networkId, paginationOpts: { cursor, numItems: JOB_PAGE_SIZE } })
  if (query.isError) return <Card><div role="alert" className="grid gap-3"><p>{t("applications.unavailable")}</p><Button variant="outline" className="w-full sm:w-auto sm:justify-self-start" onClick={() => { void query.refetch() }}>{t("directory.retry")}</Button></div></Card>
  if (query.isPending || !query.data) return <CenteredStatus label={t("applications.loading")} />
  return <div className="grid gap-3" aria-busy={query.isFetching || undefined}>
    {query.data.page.length === 0 ? <Card><p>{t("applications.empty")}</p></Card> : <ul className={`${SCREEN_SECTIONS} gap-y-3`}>{query.data.page.map((application) => <li key={application.applicationId}><ApplicationCard application={application} /></li>)}</ul>}
    {!query.data.isDone ? <Button variant="outline" className="w-full sm:w-auto sm:justify-self-start" onClick={() => setCursors((current) => [...current, query.data?.continueCursor ?? null])}>{t("applications.more")}</Button> : null}
  </div>
}

function ApplicationCard({ application }: { application: MyApplication }) {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("jobs")
  const locale = i18n.resolvedLanguage ?? "fr"
  const withdraw = useMutation(api.modules.shops.jobApplications.withdraw)
  const retry = useMutation(api.modules.shops.jobApplications.retry)
  const refresh = useMutation(api.modules.shops.jobApplications.refreshStatus)
  const action = useJobAction()
  const review = useJobReview()
  const convex = useConvex()
  const [notice, setNotice] = useState<string | null>(null)
  const readCurrent = async () => {
    if (!navigator.onLine || !action.current()) return null
    const current = await convex.query(api.modules.shops.jobApplications.myApplication, { networkId, applicationId: application.applicationId })
    return action.current() && navigator.onLine && current?.summary.applicationId === application.applicationId ? current : null
  }
  const reread = async () => {
    if (!navigator.onLine || !action.current()) return false
    await refresh({ networkId, applicationId: application.applicationId })
    return !!await readCurrent()
  }
  const retryCurrent = (consentTextVersion?: string) => {
    if (review.paused || !navigator.onLine) return
    void action.run(async () => {
      const current = await readCurrent()
      if (!current || !current.summary.actions.retry) return
      const required = current.summary.retryConsentTextVersion
      if (required !== application.retryConsentTextVersion || required !== null && (required !== consentTextVersion || required !== COMMERCE_JOBS_APPLICATION_CONSENT_VERSION)) { setNotice("recovery.retryChanged"); return }
      await retry({ networkId, applicationId: application.applicationId, ...(required !== null ? { consentTextVersion: required } : {}) })
    })
  }
  const [details, setDetails] = useState(false)
  const status = application.state === "submitted" && application.candidateState ? t(`applications.candidateState.${application.candidateState}`) : t(`applications.state.${application.state}`)
  const announcement = useJobApplicationAnnouncement(application, true)
  return <Card><article className="grid gap-3">
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</p>
    <JobReviewNotice review={review} onReview={reread} />
    <header className="grid min-w-0 gap-2"><h2 className="text-lg font-semibold">{application.jobTitle}</h2>{application.shopName ? <p className="text-sm text-muted-foreground">{t("applications.employer", { name: application.shopName })}</p> : null}</header>
    <p className="font-medium">{status}</p>
    {application.rejection ? <p className="text-sm">{t(`applications.rejection.${application.rejection}`)}</p> : null}
    {application.remoteUnconfirmed ? <p className="text-sm text-muted-foreground">{t("applications.remoteUnconfirmed")}</p> : null}
    <div className="grid gap-1 text-sm text-muted-foreground">
      <p>{t("applications.createdAt", { date: jobInstantText(application.createdAt, locale) })}</p>
      {application.submittedAt !== null ? <p>{t("applications.submittedAt", { date: jobInstantText(application.submittedAt, locale) })}</p> : null}
      {application.remoteUpdatedAt !== null && application.remoteUpdatedAt !== application.submittedAt ? <p>{t("applications.updatedAt", { date: jobInstantText(application.remoteUpdatedAt, locale) })}</p> : null}
    </div>
    {application.files.length > 0 ? <ul className="grid gap-1 text-sm">{application.files.map((file) => <li key={file.fileId}>{t(`files.kind.${file.kind}`)} · {t(`applications.transfer.${file.transfer}`)}</li>)}</ul> : null}
    <div className="flex flex-wrap gap-2">
      {application.shopHandle ? <ShopLink href={routes.shopJob(application.shopHandle, application.jobRef)}>{t("applications.openJob")}</ShopLink> : null}
      {application.actions.refresh ? <Button type="button" variant="outline" pending={action.pending} disabled={!review.online} onClick={() => { if (navigator.onLine) void action.run(async () => await refresh({ networkId, applicationId: application.applicationId }), () => { toast.success(t("applications.refreshRequested")) }) }}><RefreshCw aria-hidden="true" className="size-4" />{t("applications.refresh")}</Button> : null}
      {application.actions.retry && application.retryConsentTextVersion === null ? <Button type="button" variant="outline" pending={action.pending} disabled={review.paused} onClick={() => retryCurrent()}><RotateCcw aria-hidden="true" className="size-4" />{t("applications.retry")}</Button> : null}
      {application.actions.withdraw ? <Button type="button" variant="ghost" pending={action.pending} disabled={review.paused} onClick={() => { if (!review.paused && navigator.onLine && action.current() && window.confirm(t("applications.withdrawConfirm")) && navigator.onLine && action.current()) void action.run(async () => await withdraw({ applicationId: application.applicationId }), () => { toast.success(t("applications.withdrawn")) }) }}><Undo2 aria-hidden="true" className="size-4" />{t("applications.withdraw")}</Button> : null}
      <Button type="button" variant="ghost" aria-expanded={details} onClick={() => setDetails((value) => !value)}>{t(details ? "applications.hideDetails" : "applications.details")}</Button>
    </div>
    {application.actions.retry && application.retryConsentTextVersion !== null ? application.retryConsentTextVersion === COMMERCE_JOBS_APPLICATION_CONSENT_VERSION ? <RetryConsent key={JSON.stringify([application.applicationId, application.retryConsentTextVersion, application.state, application.remoteUpdatedAt, review.stamp])} version={application.retryConsentTextVersion} paused={review.paused || action.pending} onConfirm={() => retryCurrent(application.retryConsentTextVersion!)} /> : <p role="alert">{t("recovery.retryChanged")}</p> : null}
    {notice ? <p role="status">{t(notice)}</p> : null}
    {action.error ? <p role="alert" className="text-sm text-destructive">{action.error}</p> : null}
    {details ? <ApplicationDetails applicationId={application.applicationId} /> : null}
  </article></Card>
}

/** Ce qui a été transmis : SES données (nom normalisé, motivation), effacées par un retrait. */
function ApplicationDetails({ applicationId }: { applicationId: Id<"commerceApplications"> }) {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("jobs")
  const query = useAuthenticatedConvexQuery(api.modules.shops.jobApplications.myApplication, { networkId, applicationId })
  if (query.isError || query.isPending || !query.data) return null
  return <div className="grid gap-2 border-t border-border pt-3 text-sm"><dl className="grid gap-2">
    <div><dt className="font-medium">{t("applications.sentName")}</dt><dd>{query.data.civilName ? jobCivilNamePreview(query.data.civilName.firstName, query.data.civilName.lastName) : t("applications.withdrawn")}</dd></div>
    <div><dt className="font-medium">{t("applications.sentMotivation")}</dt><dd className="whitespace-pre-wrap">{query.data.motivation ?? t("applications.noMotivation")}</dd></div>
  </dl>
    {/* L'accord reste daté même après un retrait : c'est la trace du geste du candidat. */}
    <p className="text-muted-foreground">{t("applications.consentGiven", { date: jobInstantText(query.data.consentedAt, i18n.resolvedLanguage ?? "fr") })}</p>
  </div>
}

function MyFiles() {
  const { t } = useTranslation("jobs")
  const action = useJobAction()
  const query = useAuthenticatedConvexQuery(api.modules.shops.jobFiles.myFiles, {})
  if (query.isError) return <Card><p role="alert">{t("applications.unavailable")}</p></Card>
  if (query.isPending || query.data === undefined) return <CenteredStatus label={t("applications.loading")} />
  return <Card><JobFilesManager files={query.data} onReview={async () => { const fresh = await query.refetch(); return action.current() && !fresh.isError && fresh.data !== undefined }} /></Card>
}

function RetryConsent({ version, paused, onConfirm }: { version: string; paused: boolean; onConfirm: () => void }) {
  const { t } = useTranslation("jobs")
  const form = useForm<{ accepted: boolean }>({ resolver: zodResolver(z.object({ accepted: z.boolean().refine(Boolean, t("apply.consentRequired")) })), defaultValues: { accepted: false } })
  const accepted = form.watch("accepted")
  return <form className="grid gap-3" onSubmit={form.handleSubmit(() => { if (!paused && navigator.onLine) { form.reset({ accepted: false }); onConfirm() } })}>
    <h3 className="font-display text-base font-bold leading-snug">{t("recovery.retryTitle")}</h3><p className="text-sm">{t("recovery.retryLead")}</p><p className="text-sm">{t("apply.consentText")}</p>
    <label className="flex min-h-11 items-start gap-3"><input type="checkbox" className="mt-1 size-4" disabled={paused} {...form.register("accepted")} /><span>{t("apply.consentLabel")}</span></label>
    <p className="text-xs text-muted-foreground">{t("recovery.consentVersion", { version })}</p>
    <Button type="submit" variant="commerce" disabled={paused || !accepted}>{t("applications.retry")}</Button>
    {form.formState.errors.accepted ? <p role="alert">{form.formState.errors.accepted.message}</p> : null}
  </form>
}
