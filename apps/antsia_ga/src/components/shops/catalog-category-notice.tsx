"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { useId } from "react"
import { useTranslation } from "react-i18next"

/** Le chemin lisible d'une clé de taxonomie : « Électronique / Téléphones ». */
export function useCategoryPathLabel(): (key: string) => string {
  const { t } = useTranslation("shops")
  return (key) => key.split(".").map((_segment, index, segments) => t(`catalog.facets.categories.${segments.slice(0, index + 1).join(".")}.label`)).join(" / ")
}

/**
 * CM-02 — le motif lisible par les gérants : les offres de leur catalogue PRO.GA refusées pour leur catégorie
 * interdite, et la catégorie réglementée qui fait relire leur vitrine. Rien ne s'affiche tant que la liste ne
 * frappe aucune offre (liste vide aujourd'hui) : aucun avertissement inventé.
 */
export function CatalogCategoryNotice({ shopId, only }: { shopId: Id<"shops">; only?: "regulated" }) {
  const { t, i18n } = useTranslation("shops")
  const { networkId } = useNetwork()
  const id = useId()
  const label = useCategoryPathLabel()
  const query = useAuthenticatedConvexQuery(api.modules.shops.catalogControl.categoryRulings, { networkId, shopId })
  if (query.isError || !query.data) return null
  const { regulatedCategory, refusals, truncated } = query.data
  const refused = only === "regulated" ? [] : refusals
  if (regulatedCategory === null && refused.length === 0) return null
  const date = (value: number) => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "fr", { dateStyle: "medium", timeZone: "Africa/Libreville" }).format(value)
  return <section aria-labelledby={`${id}-title`} data-catalog-category-notice className="grid gap-3 rounded-[var(--ui2-card-radius)] border border-[color:var(--esp-surface-border)] bg-background p-[var(--esp-card-padding,16px)]">
    <h3 id={`${id}-title`} className="font-display text-base font-bold leading-snug">{t("catalog.categoryRules.title")}</h3>
    {regulatedCategory !== null ? <p role="status" className="rounded-[var(--ui2-card-radius)] bg-muted p-4 text-sm">{t("catalog.categoryRules.regulated", { category: label(regulatedCategory) })}</p> : null}
    {refused.length > 0 ? <>
      <p className="text-sm text-muted-foreground">{t("catalog.categoryRules.refusedLead")}</p>
      <ul className="grid min-w-0 gap-2">{refused.map((refusal) => <li key={refusal.offerRef} className="grid min-w-0 gap-1 rounded-[var(--ui2-card-radius)] border border-border p-3">
        <span className="break-words font-medium">{t("catalog.categoryRules.refusedCategory", { category: label(refusal.categoryKey) })}</span>
        <span className="break-all text-xs text-muted-foreground">{t("catalog.categoryRules.reference", { reference: refusal.offerRef })}</span>
        <span className="text-xs text-muted-foreground">{t(refusal.withdrewReflection ? "catalog.categoryRules.withdrawnOn" : "catalog.categoryRules.refusedOn", { date: date(refusal.refusedAt) })}</span>
      </li>)}</ul>
      {truncated ? <p className="text-xs text-muted-foreground">{t("catalog.categoryRules.truncated", { limit: refused.length })}</p> : null}
      <p className="text-sm text-muted-foreground">{t("catalog.categoryRules.howToFix")}</p>
    </> : null}
  </section>
}
