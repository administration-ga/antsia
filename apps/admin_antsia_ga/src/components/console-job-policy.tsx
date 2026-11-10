"use client"

import { api, type Id } from "@antsia/api/engine"
import { useMutation, useQuery } from "convex/react"
import { useTranslation } from "react-i18next"
import { commerceActivationReady } from "../../../../convex/modules/shops/commerceActivation"

import { ConsoleDate, LoadingRows, MotiveAction, panelClass } from "./console-operation-controls"

/**
 * P15 — monté uniquement pour canAdmin. Offres d'emploi publiques et
 * candidatures du réseau : fermées par défaut, chaque décision motivée et
 * inscrite au journal ; les candidatures exigent les offres.
 */
export function JobPolicy({ networkId }: { networkId: Id<"networks"> }) {
  const { t } = useTranslation("operations")
  const policy = useQuery(api.modules.shops.jobs.consolePolicy, { networkId })
  const ready = commerceActivationReady("applications")
  const setPolicy = useMutation(api.modules.shops.jobs.setPolicy)
  return <section className={`${panelClass} flex min-w-0 flex-col gap-3`}>
    <h3 className="font-semibold">{t("jobPolicy.title")}</h3>
    <p className="text-sm text-muted-foreground">{t("jobPolicy.lead")}</p>
    <p className="text-sm text-muted-foreground">{t("jobPolicy.linkHint")}</p>
    {!ready ? <p role="note" className="text-sm">{t("jobPolicy.validationMissing")}</p> : null}
    {policy === undefined ? <LoadingRows /> : <>
      <p role="status" className="text-sm">{t(policy.jobs ? "jobPolicy.jobsEnabled" : "jobPolicy.jobsDisabled")}</p>
      <p className="text-sm">{t(!ready ? "jobPolicy.validationBlocked" : policy.applications ? "jobPolicy.applicationsEnabled" : "jobPolicy.applicationsDisabled")}</p>
      {policy.updatedAt !== null ? <p className="text-xs text-muted-foreground">{t("jobPolicy.updated")} <ConsoleDate at={policy.updatedAt} /></p> : null}
      <MotiveAction key={`${networkId}:jobs:${policy.jobs}`} label={t(policy.jobs ? "jobPolicy.disableJobs" : "jobPolicy.enableJobs")} minLength={10} danger={policy.jobs}
        onDecision={(reason) => setPolicy({ networkId, jobsEnabled: !policy.jobs, applicationsEnabled: !policy.jobs && policy.applications, reason })} />
      {policy.jobs ? <MotiveAction key={`${networkId}:applications:${policy.applications}`} label={t(policy.applications ? "jobPolicy.disableApplications" : "jobPolicy.enableApplications")} minLength={10} danger={policy.applications} disabled={!policy.applications && !ready}
        onDecision={(reason) => setPolicy({ networkId, jobsEnabled: true, applicationsEnabled: !policy.applications, reason })} /> : null}
    </>}
  </section>
}
