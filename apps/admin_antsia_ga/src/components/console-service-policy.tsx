"use client"

import { api, type Id } from "@antsia/api/engine"
import { useMutation, useQuery } from "convex/react"
import { useTranslation } from "react-i18next"
import { commerceActivationReady } from "../../../../convex/modules/shops/commerceActivation"

import { ConsoleDate, LoadingRows, MotiveAction, panelClass } from "./console-operation-controls"

/** P14 — monté uniquement pour canAdmin : la lecture exige l'autorité d'administration de plateforme. */
export function ServicePolicy({ networkId }: { networkId: Id<"networks"> }) {
  const { t } = useTranslation("operations")
  const policy = useQuery(api.modules.shops.servicePolicy.getPolicy, { networkId })
  const ready = commerceActivationReady("services")
  const setPolicy = useMutation(api.modules.shops.servicePolicy.setPolicy)
  return <section className={`${panelClass} flex min-w-0 flex-col gap-3`}>
    <h3 className="font-semibold">{t("servicePolicy.title")}</h3>
    <p className="text-sm text-muted-foreground">{t("servicePolicy.lead")}</p>
    <p className="text-sm text-muted-foreground">{t("servicePolicy.linkHint")}</p>
    <p className="text-sm text-muted-foreground">{t("servicePolicy.existingHint")}</p>
    {!ready ? <p role="note" className="text-sm">{t("servicePolicy.validationMissing")}</p> : null}
    {policy === undefined ? <LoadingRows /> : <>
      <p role="status" className="text-sm">{t(!ready ? "servicePolicy.validationBlocked" : policy.enabled ? "servicePolicy.enabled" : "servicePolicy.disabled")}</p>
      {policy.updatedAt !== null ? <p className="text-xs text-muted-foreground">{t("servicePolicy.updated")} <ConsoleDate at={policy.updatedAt} /></p> : null}
      <MotiveAction key={`${networkId}:${policy.enabled}`} label={t(policy.enabled ? "servicePolicy.disable" : "servicePolicy.enable")} minLength={10} danger={policy.enabled} disabled={!policy.enabled && !ready} onDecision={(reason) => setPolicy({ networkId, enabled: !policy.enabled, reason })} />
    </>}
  </section>
}
