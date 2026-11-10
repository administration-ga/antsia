import { BriefcaseBusiness, CalendarClock, MapPin, Users } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { SCREEN_SECTIONS } from "@/components/shared/screen-layout"
import { routes } from "@/lib/routes"
import { jobDateText, jobSalaryText, jobStatusNoticeKey, type JobDto, type JobTranslate } from "./job-model"

export type JobAudience = "member" | "public"
const CARD_LINK = "grid min-h-11 gap-2 rounded-xl border border-border bg-card p-4 text-card-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/** Une offre dans une liste : intitulé, employeur, contrat, lieu, échéance, rémunération déclarée. */
export function JobCard({ job, audience, locale, t }: { job: JobDto; audience: JobAudience; locale: string; t: JobTranslate }) {
  const href = audience === "member" ? routes.shopJob(job.shopHandle, job.jobRef) : routes.publicShopJob(job.shopHandle, job.jobRef)
  return <Link href={href} prefetch={false} className={CARD_LINK}>
    <span className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-base font-semibold">{job.title}</span><span className="text-sm text-muted-foreground">{t(`contract.${job.contractType}`)}</span></span>
    <span className="text-sm text-muted-foreground">{job.shopName}</span>
    <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      <span className="inline-flex items-center gap-1"><MapPin aria-hidden="true" className="size-4 shrink-0" />{job.location ?? t("details.locationUnknown")}</span>
      <span className="inline-flex items-center gap-1"><CalendarClock aria-hidden="true" className="size-4 shrink-0" />{job.closesOn ? jobDateText(job.closesOn, locale) : t("details.noDeadline")}</span>
    </span>
    <span className="text-sm">{jobSalaryText(job.salary, locale, t)}</span>
  </Link>
}

export function JobCards({ jobs, audience, locale, t }: { jobs: readonly JobDto[]; audience: JobAudience; locale: string; t: JobTranslate }) {
  return <ul className={`${SCREEN_SECTIONS} gap-y-3`}>{jobs.map((job) => <li key={`${job.shopHandle}:${job.jobRef}`}><JobCard job={job} audience={audience} locale={locale} t={t} /></li>)}</ul>
}

/** La fiche : allowlist publique seulement, clôture affichée, aucun frais, aucun classement. */
export function JobDetails({ job, locale, t, actionSlot, employerHref, heading = "h1" }: { job: JobDto; locale: string; t: JobTranslate; actionSlot?: ReactNode; employerHref?: string; heading?: "h1" | "h2" }) {
  const notice = jobStatusNoticeKey(job.status)
  const Heading = heading
  return <article className="grid gap-5 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm sm:p-6">
    <header className="grid gap-2">
      <p className="text-sm font-medium text-muted-foreground">{t(`status.${job.status}`)}</p>
      <Heading className="text-2xl font-semibold tracking-tight">{job.title}</Heading>
      <p className="text-sm">{employerHref ? <Link href={employerHref} prefetch={false} className="underline underline-offset-4">{job.shopName}</Link> : job.shopName}</p>
    </header>
    {notice ? <p role="status" className="rounded-lg border border-border bg-muted p-3 text-sm">{t(notice)}</p> : null}
    <dl className="grid gap-3 sm:grid-cols-2">
      <JobFact icon={<BriefcaseBusiness aria-hidden="true" className="size-4" />} label={t("details.contractType")} value={t(`contract.${job.contractType}`)} />
      <JobFact icon={<MapPin aria-hidden="true" className="size-4" />} label={t("details.location")} value={job.location ?? t("details.locationUnknown")} />
      <JobFact icon={<Users aria-hidden="true" className="size-4" />} label={t("details.headcount")} value={String(job.headcount)} />
      <JobFact icon={<CalendarClock aria-hidden="true" className="size-4" />} label={t("details.closesOn")} value={job.closesOn ? jobDateText(job.closesOn, locale) : t("details.noDeadline")} />
      <JobFact label={t("details.openedOn")} value={jobDateText(job.openedOn, locale)} />
      <JobFact label={t("details.salary")} value={jobSalaryText(job.salary, locale, t)} />
    </dl>
    <section className="grid gap-2"><h2 className="text-lg font-semibold">{t("details.skills")}</h2>{job.skills.length > 0 ? <ul className="flex flex-wrap gap-2">{job.skills.map((skill) => <li key={skill} className="rounded-full border border-border px-3 py-1 text-sm">{skill}</li>)}</ul> : <p className="text-sm text-muted-foreground">{t("details.skillsNone")}</p>}</section>
    {job.description ? <section className="grid gap-2"><h2 className="text-lg font-semibold">{t("details.description")}</h2><p className="whitespace-pre-wrap">{job.description}</p></section> : null}
    <p className="text-sm text-muted-foreground">{t("details.noFees")}</p>
    {actionSlot}
  </article>
}

function JobFact({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return <div className="grid gap-1"><dt className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground">{icon}{label}</dt><dd>{value}</dd></div>
}
