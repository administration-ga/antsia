"use client"

import { api, type Id } from "@antsia/api/engine"
import { useMutation, useQuery } from "convex/react"
import { useTranslation } from "react-i18next"
import { commerceActivationReady } from "../../../../convex/modules/shops/commerceActivation"

import { ConsoleDate, LoadingRows, MotiveAction, panelClass } from "./console-operation-controls"

/** Monté uniquement pour canAdmin : la lecture exige l'autorité d'administration de plateforme. */
export function PaymentPolicy({ networkId }: { networkId: Id<"networks"> }) {
  const { t } = useTranslation("operations")
  const policy = useQuery(api.modules.shops.paymentPolicy.getPolicy, { networkId })
  const ready = commerceActivationReady("payments")
  const setPolicy = useMutation(api.modules.shops.paymentPolicy.setPolicy)
  return <section className={`${panelClass} flex min-w-0 flex-col gap-3`}>
    <h3 className="font-semibold">{t("paymentPolicy.title")}</h3>
    <p className="text-sm text-muted-foreground">{t("paymentPolicy.lead")}</p>
    <p className="text-sm text-muted-foreground">{t("paymentPolicy.providerHint")}</p>
    <p className="text-sm text-muted-foreground">{t("paymentPolicy.existingHint")}</p>
    {!ready ? <p role="note" className="text-sm">{t("paymentPolicy.validationMissing")}</p> : null}
    {policy === undefined ? <LoadingRows /> : <>
      <p role="status" className="text-sm">{t(!ready ? "paymentPolicy.validationBlocked" : policy.enabled ? "paymentPolicy.enabled" : "paymentPolicy.disabled")}</p>
      {policy.updatedAt !== null ? <p className="text-xs text-muted-foreground">{t("paymentPolicy.updated")} <ConsoleDate at={policy.updatedAt} /></p> : null}
      <MotiveAction key={`${networkId}:${policy.enabled}`} label={t(policy.enabled ? "paymentPolicy.disable" : "paymentPolicy.enable")} minLength={10} danger={policy.enabled} disabled={!policy.enabled && !ready} onDecision={(reason) => setPolicy({ networkId, enabled: !policy.enabled, reason })} />
    </>}
  </section>
}
