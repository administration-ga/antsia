"use client"

import { useTranslation } from "react-i18next"

import { Card } from "@/components/shared/controls"
import { ShopLink } from "@/components/shops/shop-ui"
import { routes } from "@/lib/routes"

/**
 * P14B : Mes achats ne liste que les achats PAYÉS (tentatives P12 liées à une vraie commande).
 * Les prestations à tarif fixe et les devis acceptés (P14, sans paiement ni acompte) vivent
 * dans « Mes demandes » : un renvoi distinct, sans les mêler aux achats ni simuler un état de
 * paiement.
 */
export function ServiceRequestsNotice() {
  const { t } = useTranslation("purchases")
  return <Card><section aria-labelledby="purchases-service-requests-title" className="grid gap-2">
    <h2 id="purchases-service-requests-title" className="antsia-subtitle">{t("serviceRequests.title")}</h2>
    <p className="text-sm text-muted-foreground">{t("serviceRequests.lead")}</p>
    <ShopLink href={routes.serviceRequests()}>{t("serviceRequests.open")}</ShopLink>
  </section></Card>
}
