"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { PERSONAL_MEETINGS_CLOSED_REASON } from "@antsia/social-domain/personalMeetings"
import { BriefcaseBusiness, LockKeyhole } from "lucide-react"
import Link from "next/link"
import { useId } from "react"
import { useTranslation } from "react-i18next"

import { buttonClassName } from "@/components/shared/button-class"
import { routes } from "@/lib/routes"

/** Une destination informative fermée : aucun formulaire, profil, intérêt ni contact personnel. */
export function PersonalMeetingsEntry() {
  const { t } = useTranslation("personalMeetings")
  const { networkId } = useNetwork()
  const query = useAuthenticatedConvexQuery(api.modules.personalMeetings.capabilities.get, { networkId })
  const confirmed = query.data?.version === 1 && query.data.state === "closed" && query.data.reason === PERSONAL_MEETINGS_CLOSED_REASON &&
    query.data.participation === false && query.data.discovery === false && query.data.interests === false && query.data.contact === false
  const titleId = useId()
  return <section aria-labelledby={titleId} className="grid w-full gap-6 px-4 py-6 sm:max-[768px]:px-6 sm:py-8 lg:gap-8 min-[768px]:px-0">
    <header className="grid gap-3">
      <h1 id={titleId} className="mp-title">{t("title")}</h1>
      <p className="max-w-prose text-muted-foreground">{t("lead")}</p>
    </header>
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      <article className="grid min-w-0 content-start gap-4 rounded-[var(--ui2-card-radius)] border border-border bg-card p-5 text-card-foreground sm:p-6">
        <LockKeyhole aria-hidden="true" className="size-7 text-muted-foreground" />
        <h2 className="mp-subtitle">{t("closed.title")}</h2>
        <p>{t("closed.reason")}</p>
        <p className="text-sm text-muted-foreground">{t("closed.noCollection")}</p>
        <ul className="grid gap-2 text-sm text-muted-foreground">
          {(["participation", "discovery", "interests", "contact"] as const).map(capability => <li key={capability}>{t(`closed.capabilities.${capability}`)}</li>)}
        </ul>
        <p role="status" className="text-sm text-muted-foreground">{t(query.error || query.data && !confirmed ? "status.unavailable" : confirmed ? "status.confirmed" : "status.loading")}</p>
      </article>
      <article className="grid min-w-0 content-start gap-4 rounded-[var(--ui2-card-radius)] border border-border bg-card p-5 text-card-foreground sm:p-6">
        <BriefcaseBusiness aria-hidden="true" className="size-7 text-muted-foreground" />
        <h2 className="mp-subtitle">{t("professional.title")}</h2>
        <p className="text-muted-foreground">{t("professional.description")}</p>
        <Link href={routes.professionals()} className={buttonClassName("outline", "w-full sm:w-auto sm:justify-self-start")}>{t("professional.link")}</Link>
      </article>
    </div>
  </section>
}
