"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { useCallback, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, Card, CenteredStatus } from "@/components/shared/controls"
import { ShopFrame, ShopLink, ShopQueryFailure } from "@/components/shops/shop-ui"
import { routes } from "@/lib/routes"
import { JobApplicationForm, type JobApplicationDraft } from "./job-application-form"
import { JobIntentBoundary, useJobAction } from "./job-guards"
import { JobCards, JobDetails } from "./job-card"
import { JOB_PAGE_SIZE, type JobDto } from "./job-model"

/** Les offres OUVERTES d'une vitrine (membre) ; une offre close se lit par son lien, pas dans la liste. */
export function MemberShopJobsScreen({ handle }: { handle: string }) {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("jobs")
  return <ShopFrame title={t("shop.title")} lead={t("shop.lead")}><ShopLink href={routes.storefront(handle)}>{t("shop.backToShop")}</ShopLink><ShopJobsWindow key={`${networkId}:${personId}:${handle}`} handle={handle} /></ShopFrame>
}

function ShopJobsWindow({ handle, preview = false }: { handle: string; preview?: boolean }) {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("jobs")
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const cursor = cursors[cursors.length - 1] ?? null
  const query = useAuthenticatedConvexQuery(api.modules.shops.jobs.listForShop, { networkId, handle, paginationOpts: { cursor, numItems: preview ? 3 : JOB_PAGE_SIZE } })
  const translate = (key: string, options?: Record<string, unknown>) => t(key, options)
  if (query.isError) return preview ? null : <ShopQueryFailure href={routes.storefront(handle)} retry={() => { void query.refetch() }} />
  if (query.isPending || !query.data) return preview ? null : <p role="status" className="text-sm text-muted-foreground">{t("directory.loading")}</p>
  if (preview && query.data.page.length === 0) return null
  return <div className="grid gap-3" aria-busy={query.isFetching || undefined}>
    {query.data.page.length > 0 ? <JobCards jobs={query.data.page} audience="member" locale={i18n.resolvedLanguage ?? "fr"} t={translate} /> : <p className="text-sm text-muted-foreground">{t("shop.empty")}</p>}
    {preview ? <ShopLink href={routes.shopJobs(handle)}>{t("shop.openAll")}</ShopLink>
      : !query.data.isDone ? <Button variant="outline" className="w-full sm:w-auto sm:justify-self-start" onClick={() => setCursors((current) => [...current, query.data?.continueCursor ?? null])}>{t("directory.more")}</Button> : null}
  </div>
}

/** Aperçu sur la vitrine : rendu seulement si l'employeur a des offres ouvertes réellement reçues. */
export function MemberShopJobsPreview({ handle }: { handle: string }) {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("jobs")
  return <section aria-labelledby="member-shop-jobs" className="grid gap-3 empty:hidden"><ShopJobsHeading id="member-shop-jobs" label={t("shop.title")} handle={handle} /><ShopJobsWindow key={`${networkId}:${personId}:${handle}`} handle={handle} preview /></section>
}

function ShopJobsHeading({ id, label, handle }: { id: string; label: string; handle: string }) {
  const { networkId } = useNetwork()
  const query = useAuthenticatedConvexQuery(api.modules.shops.jobs.listForShop, { networkId, handle, paginationOpts: { cursor: null, numItems: 3 } })
  return query.data && query.data.page.length > 0 ? <h2 id={id} className="text-lg font-semibold">{label}</h2> : null
}

/** La fiche membre : contenu public allowlisté, état de MA candidature, formulaire si l'offre reçoit des candidatures. */
export function MemberJobScreen({ handle, jobRef }: { handle: string; jobRef: string }) {
  const { networkId, personId } = useNetwork()
  return <JobIntentBoundary key={`${networkId}:${personId}:${handle}:${jobRef}`} handle={handle} jobRef={jobRef}><MemberJobQuery handle={handle} jobRef={jobRef} /></JobIntentBoundary>
}

function MemberJobQuery({ handle, jobRef }: { handle: string; jobRef: string }) {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("jobs")
  const query = useAuthenticatedConvexQuery(api.modules.shops.jobs.job, { networkId, handle, jobRef })
  const draft = useRef<JobApplicationDraft | undefined>(undefined)
  const saveDraft = useCallback((next: JobApplicationDraft) => { draft.current = next }, [])
  const refreshJob = async () => { const fresh = await query.refetch(); return !fresh.isError && fresh.data?.revision === query.data?.revision && fresh.data?.status === "open" && fresh.data.actions.apply }
  return <ShopFrame title={t("details.title")}><ShopLink href={routes.shopJobs(handle)}>{t("details.backToJobs")}</ShopLink>
    {query.isError ? <ShopQueryFailure href={routes.storefront(handle)} retry={() => { void query.refetch() }} />
      : query.isPending || query.data === undefined ? <CenteredStatus label={t("details.loading")} />
        : query.data === null ? <Card><div className="grid gap-2"><h2 className="text-lg font-semibold">{t("details.unavailableTitle")}</h2><p>{t("details.unavailableBody")}</p><ShopLink href={routes.storefront(handle)}>{t("shop.backToShop")}</ShopLink></div></Card>
          : <JobDetails job={query.data} locale={i18n.resolvedLanguage ?? "fr"} t={(key, options) => t(key, options)} employerHref={routes.storefront(query.data.shopHandle)} heading="h2" actionSlot={<JobApplicationSlot job={query.data} onReview={refreshJob} initialDraft={draft.current} onDraft={saveDraft} />} />}
  </ShopFrame>
}

function JobApplicationSlot({ job, onReview, initialDraft, onDraft }: { job: JobDto; onReview: () => Promise<boolean>; initialDraft?: JobApplicationDraft; onDraft: (draft: JobApplicationDraft) => void }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("jobs")
  const [open, setOpen] = useState(!!initialDraft)
  const action = useJobAction()
  const mine = useAuthenticatedConvexQuery(api.modules.shops.jobApplications.forJob, { networkId, jobRef: job.jobRef })
  if (mine.isError) return <p role="alert">{t("applications.unavailable")}</p>
  if (mine.isPending || mine.data === undefined) return <p role="status">{t("applications.loading")}</p>
  const reread = async () => {
    const [source, current] = await Promise.all([onReview(), mine.refetch()])
    return action.current() && source && !current.isError && current.data !== undefined && (!current.data || ["withdrawn", "rejected", "failed"].includes(current.data.state))
  }
  if (mine.data && mine.data.state !== "withdrawn" && mine.data.state !== "rejected" && mine.data.state !== "failed") {
    return <div className="grid gap-2 border-t border-border pt-4"><p>{t("details.alreadyApplied")}</p><ShopLink href={routes.myApplications()}>{t("details.seeApplication")}</ShopLink></div>
  }
  if (!job.actions.apply) return job.status === "open" ? <p className="border-t border-border pt-4 text-sm text-muted-foreground">{t("details.applicationsClosed")}</p> : null
  return <div className="grid gap-4 border-t border-border pt-4">{open ? <JobApplicationForm job={job} onReview={reread} initialDraft={initialDraft} onDraft={onDraft} /> : <Button type="button" variant="commerce" className="w-full sm:w-auto sm:justify-self-start" onClick={() => setOpen(true)}>{t("details.apply")}</Button>}</div>
}
