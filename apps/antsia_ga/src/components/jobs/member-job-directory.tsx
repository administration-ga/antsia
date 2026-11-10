"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/shared/controls"
import { JobCards } from "./job-card"
import { JOB_PAGE_SIZE } from "./job-model"

/** L'onglet Emplois de Découvrir n'existe que si le moteur confirme de vraies offres reçues et lisibles. */
export function useJobsDiscoverable(): boolean {
  const { networkId } = useNetwork()
  const query = useAuthenticatedConvexQuery(api.modules.shops.jobs.discoverAvailability, { networkId })
  return query.data?.available === true
}

/** Section « Emplois » de Découvrir : rendue seulement avec des offres réelles ; ordre par date, jamais par popularité. */
export function MemberJobDirectory() {
  const { networkId, personId } = useNetwork()
  const available = useJobsDiscoverable()
  if (!available) return null
  return <JobDirectoryWindow key={`${networkId}:${personId}`} />
}

function JobDirectoryWindow() {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("jobs")
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const cursor = cursors[cursors.length - 1] ?? null
  const query = useAuthenticatedConvexQuery(api.modules.shops.jobs.discover, { networkId, paginationOpts: { cursor, numItems: JOB_PAGE_SIZE } })
  const translate = (key: string, options?: Record<string, unknown>) => t(key, options)
  return <section id="emplois" aria-labelledby="member-job-directory" className="flex scroll-mt-24 flex-col gap-4">
    <header className="antsia-page-header"><h2 id="member-job-directory" className="antsia-subtitle">{t("directory.title")}</h2><p className="text-sm text-muted-foreground">{t("directory.lead")}</p></header>
    {query.isError ? <div role="alert" className="grid gap-2"><p>{t("directory.unavailable")}</p><Button variant="outline" className="w-full sm:w-auto sm:justify-self-start" pending={query.isFetching} onClick={() => { void query.refetch() }}>{t("directory.retry")}</Button></div>
      : query.isPending || !query.data ? <p role="status" className="text-sm text-muted-foreground">{t("directory.loading")}</p>
        : <div className="grid gap-3" aria-busy={query.isFetching || undefined}>
          {query.data.page.length > 0 ? <JobCards jobs={query.data.page} audience="member" locale={i18n.resolvedLanguage ?? "fr"} t={translate} /> : <p className="text-sm text-muted-foreground">{t("directory.empty")}</p>}
          {query.data.filteredWindow ? <p className="text-sm text-muted-foreground">{t("directory.filteredWindow")}</p> : null}
          {!query.data.isDone ? <Button variant="outline" className="w-full sm:w-auto sm:justify-self-start" onClick={() => setCursors((current) => [...current, query.data?.continueCursor ?? null])}>{t("directory.more")}</Button> : null}
        </div>}
  </section>
}
