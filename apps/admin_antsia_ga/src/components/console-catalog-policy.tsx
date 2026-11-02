"use client"

import { api, type Id } from "@antsia/api/engine"
import { useMutation, useQuery } from "convex/react"
import { useTranslation } from "react-i18next"

import { ConsoleDate, LoadingRows, MotiveAction, panelClass } from "./console-operation-controls"
import { CatalogMapping } from "./console-catalog-mapping"

/**
 * Finitions (DP-37, K-19) — P09, monté uniquement pour canAdmin : la lecture exige l'autorité
 * d'administration de la plateforme. Catalogues reçus de PRO.GA, FERMÉS par défaut ; chaque décision
 * motivée (dix caractères) et inscrite au journal (`catalog.policy_set`). Le rattachement d'une
 * boutique à son émetteur (`catalogControl.configureMapping`) reste une décision distincte.
 */
export function CatalogPolicy({ networkId }: { networkId: Id<"networks"> }) {
  const { t } = useTranslation("operations")
  const policy = useQuery(api.modules.shops.catalogControl.getPolicy, { networkId })
  const setPolicy = useMutation(api.modules.shops.catalogControl.setPolicy)
  return <section className={`${panelClass} flex min-w-0 flex-col gap-3`}>
    <h3 className="font-semibold">{t("catalogPolicy.title")}</h3>
    <p className="text-sm text-muted-foreground">{t("catalogPolicy.lead")}</p>
    <p className="text-sm text-muted-foreground">{t("catalogPolicy.linkHint")}</p>
    <p className="text-sm text-muted-foreground">{t("catalogPolicy.existingHint")}</p>
    {policy === undefined ? <LoadingRows /> : <>
      <p role="status" className="text-sm">{t(policy.enabled ? "catalogPolicy.enabled" : "catalogPolicy.disabled")}</p>
      {policy.updatedAt !== null ? <p className="text-xs text-muted-foreground">{t("catalogPolicy.updated")} <ConsoleDate at={policy.updatedAt} /></p> : null}
      <MotiveAction key={`${networkId}:${policy.enabled}`} label={t(policy.enabled ? "catalogPolicy.disable" : "catalogPolicy.enable")} minLength={10} danger={policy.enabled} onDecision={(reason) => setPolicy({ networkId, enabled: !policy.enabled, reason })} />
    </>}
    <CatalogMapping networkId={networkId} />
  </section>
}
