import { parseCommerceCatalogFacets } from "@antsia/social-domain/commerce/catalogFacets"
import type { CatalogTranslate } from "./catalog-model"

/** Les seuls attributs publiés par PRO.GA ; texte échappé, aucune permission issue du classement. */
export function OfferFacets({ facets: value, t }: { facets: unknown; t: CatalogTranslate }) {
  const facets = parseCommerceCatalogFacets(value)
  if (!facets) return null
  return <section className="offer-detail-full grid min-w-0 gap-3" aria-label={t("catalog.facets.title")}>
    <h2 className="mp-subtitle">{t("catalog.facets.title")}</h2>
    <p className="text-sm text-muted-foreground">{facets.categoryPath.map(category => t(`catalog.facets.categories.${category}.label`)).join(" / ")}</p>
    {facets.attributes.length ? <dl className="grid gap-4 sm:grid-cols-2">{facets.attributes.map(attribute => <div key={attribute.key} className="min-w-0"><dt className="text-sm font-medium text-muted-foreground">{t(`catalog.facets.attributes.${attribute.key}`)}</dt><dd className="break-words">{attribute.type === "choice" ? t(`catalog.facets.choices.${attribute.key}.${attribute.value}`) : attribute.type === "boolean" ? t(attribute.value ? "catalog.facets.declaredYes" : "catalog.facets.declaredNo") : attribute.type === "number" ? t("catalog.facets.minutes", { count: attribute.value }) : attribute.value}</dd></div>)}</dl> : null}
  </section>
}
