import Link from "next/link"
import { notFound } from "next/navigation"

import { PUBLIC_CTA, PUBLIC_LINK, PublicShell } from "@/components/public/public-shell"
import { PublicStatus } from "@/components/public/public-status"
import { getAppT } from "@/i18n/server"
import { publicMetadata, publicSearch } from "@/lib/public-data"
import { loadPublicJob } from "@/lib/public-jobs-data"
import { decodeRouteSegment } from "@/lib/route-params"
import { routes } from "@/lib/routes"
import { getPublicLocale } from "@/lib/server-session"
import { JobDetails } from "./job-card"

type Props = { params: Promise<{ handle: string; jobRef: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }

async function input(props: Props) {
  const params = await props.params
  const search = await props.searchParams ?? {}
  return { handle: decodeRouteSegment(params.handle), jobRef: decodeRouteSegment(params.jobRef), handoff: publicSearch(search).handoff }
}

/** Une offre close reste lisible par son lien connu, sans être indexée ; une offre retirée ou inconnue n'a aucune fiche. */
export async function PublicJobMetadata(props: Props) {
  const { t } = getAppT(await getPublicLocale())
  const { handle, jobRef, handoff } = await input(props)
  const result = handle && jobRef ? await loadPublicJob(handle, jobRef, handoff) : null
  if (result?.status !== "ready" || !result.data) return publicMetadata(t("jobs:details.unavailableTitle"), t("jobs:details.unavailableBody"), routes.home(), false)
  return publicMetadata(result.data.title, result.data.description.replace(/\s+/g, " ").slice(0, 180) || t("jobs:details.descriptionMeta"), routes.publicShopJob(result.data.shopHandle, result.data.jobRef), result.data.status === "open")
}

/** SSR anonyme sous projection explicite : même DTO que le membre, aucun candidat, aucun frais. */
export async function PublicJobScreen(props: Props) {
  const { handle, jobRef, handoff } = await input(props)
  if (!handle || !jobRef) notFound()
  const locale = await getPublicLocale()
  const { t } = getAppT(locale)
  const result = await loadPublicJob(handle, jobRef, handoff)
  if (result.status !== "ready") return <PublicShell viewer={result.status}><PublicStatus status={result.status} locale={locale} /></PublicShell>
  if (!result.data) notFound()
  const job = result.data
  const applyHref = result.viewer === "authenticated" ? routes.shopJob(job.shopHandle, job.jobRef) : routes.signIn()
  return <PublicShell viewer={result.viewer}><div className="antsia-page antsia-copy mx-auto w-full max-w-5xl">
    <Link href={routes.publicStorefront(job.shopHandle)} prefetch={false} className={`${PUBLIC_LINK} justify-self-start`}>{t("jobs:shop.backToShop")}</Link>
    <JobDetails job={job} locale={locale} t={(key, options) => t(`jobs:${key}`, options)} employerHref={routes.publicStorefront(job.shopHandle)}
      actionSlot={job.status === "open" ? <Link href={applyHref} prefetch={false} className={`${PUBLIC_CTA} justify-self-start`}>{t(result.viewer === "authenticated" ? "jobs:details.apply" : "jobs:details.signInToApply")}</Link> : undefined} />
  </div></PublicShell>
}
