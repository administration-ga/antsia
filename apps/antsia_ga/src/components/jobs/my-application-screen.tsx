"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { useTranslation } from "react-i18next"

import { Button, Card, CenteredStatus } from "@/components/shared/controls"
import { ShopFrame, ShopLink } from "@/components/shops/shop-ui"
import { routes } from "@/lib/routes"
import { jobInstantText } from "./job-model"
import { useJobApplicationAnnouncement } from "./job-application-announcement"

/**
 * P14B : la fiche d'UNE candidature, destination ciblée d'un avis (« l'état de votre
 * candidature a changé »). Le serveur relit le candidat à chaque lecture (`myApplication`) ;
 * candidature d'autrui, d'un autre réseau ou référence inconnue : le même repli neutre.
 * L'état montré est l'état AUTORISÉ, jamais un motif ; les gestes (retirer, relancer,
 * actualiser) restent dans « Mes candidatures ».
 */
export function MyApplicationScreen({ applicationId }: { applicationId: string }) {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("jobs")
  return <ShopFrame title={t("applications.detailTitle")}>
    <ShopLink href={routes.myApplications()}>{t("applications.title")}</ShopLink>
    <ApplicationReader key={JSON.stringify([networkId, personId, applicationId])} applicationId={applicationId} />
  </ShopFrame>
}

function ApplicationReader({ applicationId }: { applicationId: string }) {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("jobs")
  const locale = i18n.resolvedLanguage ?? "fr"
  // Identifiant venu de l'adresse : le validateur du serveur refuse toute autre forme (même repli).
  const query = useAuthenticatedConvexQuery(api.modules.shops.jobApplications.myApplication, { networkId, applicationId: applicationId as Id<"commerceApplications"> })
  const announcement = useJobApplicationAnnouncement(!query.isError && !query.isPending ? query.data?.summary ?? null : null)
  if (query.isError) {
    return <Card><div role="alert" className="grid gap-3">
      <p>{t("applications.detailUnavailable")}</p>
      <Button variant="outline" className="w-full sm:w-auto sm:justify-self-start" onClick={() => { void query.refetch() }}>{t("directory.retry")}</Button>
    </div></Card>
  }
  if (query.isPending || query.data === undefined) return <CenteredStatus label={t("applications.loading")} />
  if (query.data === null) return <Card><p role="alert">{t("applications.detailUnavailable")}</p></Card>
  const application = query.data.summary
  const status = application.state === "submitted" && application.candidateState
    ? t(`applications.candidateState.${application.candidateState}`)
    : t(`applications.state.${application.state}`)
  return <Card><article className="grid gap-3" aria-busy={query.isFetching || undefined}>
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</p>
    <header className="grid min-w-0 gap-2">
      <h2 className="text-lg font-semibold">{application.jobTitle}</h2>
      {application.shopName ? <p className="text-sm text-muted-foreground">{t("applications.employer", { name: application.shopName })}</p> : null}
    </header>
    <p className="font-medium">{status}</p>
    {application.rejection ? <p className="text-sm">{t(`applications.rejection.${application.rejection}`)}</p> : null}
    {application.remoteUnconfirmed ? <p className="text-sm text-muted-foreground">{t("applications.remoteUnconfirmed")}</p> : null}
    <div className="grid gap-1 text-sm text-muted-foreground">
      <p>{t("applications.createdAt", { date: jobInstantText(application.createdAt, locale) })}</p>
      {application.submittedAt !== null ? <p>{t("applications.submittedAt", { date: jobInstantText(application.submittedAt, locale) })}</p> : null}
      {application.remoteUpdatedAt !== null && application.remoteUpdatedAt !== application.submittedAt ? <p>{t("applications.updatedAt", { date: jobInstantText(application.remoteUpdatedAt, locale) })}</p> : null}
    </div>
    <div className="flex flex-wrap gap-2">
      {application.shopHandle ? <ShopLink href={routes.shopJob(application.shopHandle, application.jobRef)}>{t("applications.openJob")}</ShopLink> : null}
      <ShopLink href={routes.myApplications()}>{t("applications.detailManage")}</ShopLink>
    </div>
  </article></Card>
}
