"use client"

import { COMMERCE_CATALOG_CATEGORIES } from "@antsia/social-domain/commerce/catalogFacets"
import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect, useId, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Button, Field, TextInput } from "@/components/shared/controls"
import { SHOP_SELECT_CLASS } from "@/components/shops/shop-ui"
import { catalogSearch, CATALOG_FACET_PARAMS, type CatalogFilters } from "@/lib/catalog-search"
import { routes } from "@/lib/routes"
import type { CatalogAudience, CatalogPage } from "./catalog-model"
import { MARKETPLACE_COMMERCIAL_MODES, MARKETPLACE_FACETS, MARKETPLACE_FACET_PARAMS, MARKETPLACE_FACET_MAX, MARKETPLACE_QUERY_MAX, MARKETPLACE_QUERY_WORDS_MAX, MARKETPLACE_SORTS, marketplaceQueryWordCount, marketplaceSearch } from "@/lib/marketplace-search"

type FormValues = { type: "" | "product" | "service"; collection: string; query: string; category: string[]; brand: string[]; material: string[]; color: string[]; audience: string[]; serviceMode: string[]; commercialMode: string[]; languageCode: string[]; serviceZone: string[]; minDurationMinutes: string; maxDurationMinutes: string; minPrice: string; maxPrice: string; sort: typeof MARKETPLACE_SORTS[number] }
const textFacetParams = MARKETPLACE_FACET_PARAMS
const choiceClass = "flex min-h-11 min-w-0 items-center gap-3 text-sm"

/**
 * Un seul formulaire sans accès privé, réutilisé par la page membre et le SSR. `variant="sheet"` : le formulaire
 * seul, dans la feuille « Filtrer » du catalogue membre ; `onApplied` la referme une fois la recherche appliquée.
 */
export function CatalogFiltersForm({ handle, filters: search, collections, audience, provider = false, variant = "details", onApplied }: { handle: string; filters: CatalogFilters; collections: CatalogPage["collections"]; audience: CatalogAudience; provider?: boolean; variant?: "details" | "sheet"; onApplied?: () => void }) {
  const { t: shopT } = useTranslation("shops")
  const t = (key: string, options?: Record<string, unknown>) => shopT(`catalog.${key}`, options)
  const { t: marketplaceT } = useTranslation("marketplace")
  const router = useRouter()
  const onApply = (filters: CatalogFilters) => { router.push(provider ? audience === "public" ? routes.publicProviderCatalog(handle, { ...filters, kind: "service" }) : routes.providerCatalog(handle, { ...filters, kind: "service" }) : audience === "public" ? routes.publicShopCatalog(handle, filters) : routes.shopCatalog(handle, filters)); onApplied?.() }
  const id = useId()
  const values = z.array(z.string()).max(MARKETPLACE_FACET_MAX, t("filters.facetInvalid"))
  const schema = z.object({ type: z.enum(["", "product", "service"]), collection: z.string().max(200), query: z.string().max(MARKETPLACE_QUERY_MAX, t("filters.queryInvalid")).refine(value => !/[\p{Cc}\uD800-\uDFFF]/u.test(value) && marketplaceQueryWordCount(value) <= MARKETPLACE_QUERY_WORDS_MAX, t("filters.queryInvalid")), category: values, brand: values, material: values, color: values, audience: values, serviceMode: values, commercialMode: values, languageCode: values, serviceZone: values, minDurationMinutes: z.string().regex(/^\d*$/u, marketplaceT("filters.durationInvalid")), maxDurationMinutes: z.string().regex(/^\d*$/u, marketplaceT("filters.durationInvalid")), minPrice: z.string().regex(/^\d*$/u, t("filters.priceInvalid")), maxPrice: z.string().regex(/^\d*$/u, t("filters.priceInvalid")), sort: z.enum(MARKETPLACE_SORTS) })
  const defaults: FormValues = { type: provider ? "service" : search.kind ?? "", collection: search.collectionRef ?? "", query: search.query ?? "", category: search.category ?? [], brand: search.brand ?? [], material: search.material ?? [], color: search.color ?? [], audience: search.audience ?? [], serviceMode: search.serviceMode ?? [], commercialMode: search.commercialMode ?? [], languageCode: search.languageCode ?? [], serviceZone: search.serviceZone ?? [], minDurationMinutes: search.minDurationMinutes === undefined ? "" : String(search.minDurationMinutes), maxDurationMinutes: search.maxDurationMinutes === undefined ? "" : String(search.maxDurationMinutes), minPrice: search.minPrice === undefined ? "" : String(search.minPrice), maxPrice: search.maxPrice === undefined ? "" : String(search.maxPrice), sort: search.sort ?? (search.query ? "relevance" : "newest") }
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults })
  const watched = useWatch({ control: form.control, defaultValue: defaults })
  const current: FormValues = { type: watched.type ?? defaults.type, collection: watched.collection ?? defaults.collection, query: watched.query ?? defaults.query, category: watched.category ?? defaults.category, brand: watched.brand ?? defaults.brand, material: watched.material ?? defaults.material, color: watched.color ?? defaults.color, audience: watched.audience ?? defaults.audience, serviceMode: watched.serviceMode ?? defaults.serviceMode, commercialMode: watched.commercialMode ?? defaults.commercialMode, languageCode: watched.languageCode ?? defaults.languageCode, serviceZone: watched.serviceZone ?? defaults.serviceZone, minDurationMinutes: watched.minDurationMinutes ?? defaults.minDurationMinutes, maxDurationMinutes: watched.maxDurationMinutes ?? defaults.maxDurationMinutes, minPrice: watched.minPrice ?? defaults.minPrice, maxPrice: watched.maxPrice ?? defaults.maxPrice, sort: watched.sort ?? defaults.sort }
  const hasQuery = current.query.trim().length > 0
  const { setValue } = form
  useEffect(() => {
    if (hasQuery && current.sort !== "relevance") setValue("sort", "relevance")
    if (!hasQuery && current.sort === "relevance") setValue("sort", "newest")
  }, [hasQuery, current.sort, setValue])
  const submit = form.handleSubmit(input => {
    const params: Record<string, string | string[] | undefined> = { type: provider ? "service" : input.type, collection: input.collection, recherche: input.query, prixMin: input.minPrice, prixMax: input.maxPrice, tri: hasQuery ? "relevance" : input.sort, dureeMin: input.minDurationMinutes, dureeMax: input.maxDurationMinutes }
    for (const facet of MARKETPLACE_FACETS) if (input[facet].length) params[CATALOG_FACET_PARAMS[facet]] = input[facet]
    const next = catalogSearch(params)
    if (!next) { form.setError("root", { message: t("filters.invalid") }); return }
    onApply(next)
  })
  const categories = COMMERCE_CATALOG_CATEGORIES.filter(category => !current.type || category.kind === current.type)
  const body = <form className={variant === "sheet" ? "grid min-w-0 gap-5" : "grid min-w-0 gap-5 pt-4 md:grid-cols-2"} onSubmit={submit} noValidate>
    <Field id={`${id}-query`} label={t("filters.query")} hint={t("filters.queryHint")} error={form.formState.errors.query?.message}>
      <TextInput id={`${id}-query`} type="search" maxLength={MARKETPLACE_QUERY_MAX} aria-describedby={`${id}-query-hint`} aria-invalid={!!form.formState.errors.query || undefined} {...form.register("query")} />
    </Field>
    {!provider ? <Field id={`${id}-kind`} label={t("kind")}><select id={`${id}-kind`} className={SHOP_SELECT_CLASS} {...form.register("type")} onChange={event => { form.setValue("type", event.target.value === "product" || event.target.value === "service" ? event.target.value : ""); form.setValue("category", []); form.setValue("audience", []); form.setValue("serviceMode", []); form.setValue("commercialMode", []); form.setValue("languageCode", []); form.setValue("serviceZone", []); form.setValue("minDurationMinutes", ""); form.setValue("maxDurationMinutes", "") }}><option value="">{t("allKinds")}</option><option value="product">{t("kinds.product")}</option><option value="service">{t("kinds.service")}</option></select></Field> : null}
    <Field id={`${id}-collection`} label={t("collections")}><select id={`${id}-collection`} className={SHOP_SELECT_CLASS} {...form.register("collection")}><option value="">{t("allCollections")}</option>{search.collectionRef && !collections.some(item => item.collectionRef === search.collectionRef) ? <option value={search.collectionRef}>{t("selectedCollection")}</option> : null}{collections.map(item => <option key={item.collectionRef} value={item.collectionRef}>{item.label}</option>)}</select></Field>
    <>
      <details data-catalog-categories><summary className="min-h-11 cursor-pointer font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("filters.categories")}</summary><fieldset tabIndex={0} className="grid max-h-64 min-w-0 gap-1 overflow-y-auto overscroll-contain pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><legend className="sr-only">{t("filters.categories")}</legend>{categories.map(category => {
        const checked = current.category.includes(category.key)
        const path = category.key.split(".").map((_segment, index, segments) => shopT(`catalog.facets.categories.${segments.slice(0, index + 1).join(".")}.label`)).join(" / ")
        return <label key={category.key} className={`${choiceClass} ${category.parent === null ? "font-semibold" : category.parent.includes(".") ? "pl-6" : "pl-3"}`}><input type="checkbox" value={category.key} aria-label={path} className="size-5 shrink-0 accent-primary" disabled={!checked && current.category.length >= MARKETPLACE_FACET_MAX} {...form.register("category")} /><span className="break-words">{shopT(`catalog.facets.categories.${category.key}.label`)}</span></label>
      })}</fieldset>{form.formState.errors.category?.message ? <p role="alert" className="text-sm text-destructive">{form.formState.errors.category.message}</p> : null}</details>
      <p className="text-xs text-muted-foreground">{t("filters.multipleHint")}</p>
      {!provider && current.type !== "service" ? (["brand", "material", "color"] as const).map(facet => <TextFacet key={facet} facet={facet} values={current[facet]} onChange={next => form.setValue(facet, next, { shouldValidate: true, shouldDirty: true })} />) : null}
      {(["audience", "serviceMode"] as const).filter(facet => !current.type || (current.type === "product" ? facet === "audience" : facet === "serviceMode")).map(facet => <fieldset key={facet} className="grid min-w-0 gap-1"><legend className="mb-2 font-semibold">{t(`filters.${facet}`)}</legend>{(facet === "serviceMode" ? ["onsite", "remote", "hybrid"] : ["women", "men", "kids", "unisex"]).map(value => <label key={value} className={choiceClass}><input type="checkbox" value={value} className="size-5 shrink-0 accent-primary" {...form.register(facet)} /><span>{shopT(`catalog.facets.choices.${facet}.${value}`)}</span></label>)}</fieldset>)}
      {!current.type || current.type === "service" ? <>
        <fieldset className="grid min-w-0 gap-1"><legend className="mb-2 font-semibold">{marketplaceT("filters.commercialMode")}</legend>{MARKETPLACE_COMMERCIAL_MODES.map(value => <label key={value} className={choiceClass}><input type="checkbox" value={value} className="size-5 shrink-0 accent-primary" {...form.register("commercialMode")} /><span>{marketplaceT(`commercialModes.${value}`)}</span></label>)}</fieldset>
        {(["languageCode", "serviceZone"] as const).map(facet => <TextFacet key={facet} facet={facet} values={current[facet]} onChange={next => form.setValue(facet, next, { shouldValidate: true, shouldDirty: true })} />)}
        <Field id={`${id}-duration-min`} label={marketplaceT("filters.minDurationMinutes")} hint={marketplaceT("filters.durationHint")} error={form.formState.errors.minDurationMinutes?.message}><TextInput id={`${id}-duration-min`} inputMode="numeric" autoComplete="off" aria-invalid={!!form.formState.errors.minDurationMinutes || undefined} {...form.register("minDurationMinutes")} /></Field>
        <Field id={`${id}-duration-max`} label={marketplaceT("filters.maxDurationMinutes")} error={form.formState.errors.maxDurationMinutes?.message}><TextInput id={`${id}-duration-max`} inputMode="numeric" autoComplete="off" aria-invalid={!!form.formState.errors.maxDurationMinutes || undefined} {...form.register("maxDurationMinutes")} /></Field>
      </> : null}
      <Field id={`${id}-min`} label={t("filters.minPrice")} error={form.formState.errors.minPrice?.message}><TextInput id={`${id}-min`} inputMode="numeric" autoComplete="off" aria-invalid={!!form.formState.errors.minPrice || undefined} {...form.register("minPrice")} /></Field>
      <Field id={`${id}-max`} label={t("filters.maxPrice")} error={form.formState.errors.maxPrice?.message}><TextInput id={`${id}-max`} inputMode="numeric" autoComplete="off" aria-invalid={!!form.formState.errors.maxPrice || undefined} {...form.register("maxPrice")} /></Field>
      <p className="text-xs text-muted-foreground">{t("filters.priceHint")}</p>
      <Field id={`${id}-sort`} label={t("filters.sort")}><select id={`${id}-sort`} className={SHOP_SELECT_CLASS} {...form.register("sort")}>{(hasQuery ? ["relevance"] as const : ["newest", "price_asc", "price_desc"] as const).map(sort => <option key={sort} value={sort}>{t(`sorts.${sort}`)}</option>)}</select></Field>
    </>
    {form.formState.errors.root?.message ? <p role="alert" className="text-sm text-destructive">{form.formState.errors.root.message}</p> : null}
    {/* Dans le tiroir, la validation reste visible en bas pendant que les filtres défilent. */}
    <div className={variant === "sheet" ? "sticky bottom-0 z-10 -mx-4 flex flex-wrap gap-2 border-t border-border bg-popover px-4 py-3" : "flex flex-wrap gap-2"} data-filter-actions><Button type="submit" variant="commerce">{t("filters.apply")}</Button><Button type="button" variant="outline" onClick={() => onApply(provider ? { kind: "service" } : {})}>{t("filters.reset")}</Button></div>
  </form>
  if (variant === "sheet") return body
  return <details className="min-w-0 rounded-[var(--ui2-card-radius)] border border-border bg-card p-4"><summary className="min-h-11 cursor-pointer font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("filters.title")}</summary>{body}</details>
}

function TextFacet({ facet, values, onChange }: { facet: "brand" | "material" | "color" | "languageCode" | "serviceZone"; values: string[]; onChange: (values: string[]) => void }) {
  const { t: shopT } = useTranslation("shops")
  const { t: marketplaceT } = useTranslation("marketplace")
  const t = (key: string, options?: Record<string, unknown>) => facet === "languageCode" || facet === "serviceZone" ? marketplaceT(key, options) : shopT(`catalog.${key}`, options)
  const id = useId()
  const [entry, setEntry] = useState("")
  const [invalid, setInvalid] = useState(false)
  const add = () => {
    const parsed = marketplaceSearch({ vue: facet === "languageCode" || facet === "serviceZone" ? "services" : "produits", [textFacetParams[facet]]: [...values, entry] })
    const next = parsed?.[facet]
    if (!next) { setInvalid(true); return }
    onChange(next); setEntry(""); setInvalid(false)
  }
  return <fieldset className="grid min-w-0 gap-2"><legend className="mb-2 font-semibold">{t(`filters.${facet}`)}</legend>
    {facet === "languageCode" ? <><label className="sr-only" htmlFor={`${id}-language`}>{t("filters.chooseLanguage")}</label><select id={`${id}-language`} className={SHOP_SELECT_CLASS} value="" disabled={values.length >= MARKETPLACE_FACET_MAX} onChange={event => {
      const next = marketplaceSearch({ vue: "services", langue: [...values, event.target.value] })?.languageCode
      if (!next) { setInvalid(true); return }
      onChange(next); setInvalid(false)
    }}><option value="">{t("filters.chooseLanguage")}</option>{(["fr", "en", "es", "pt", "ar", "zh"] as const).filter(code => !values.includes(code)).map(code => <option key={code} value={code}>{t(`languageNames.${code}`)}</option>)}</select><p className="text-xs text-muted-foreground">{t("filters.otherLanguageHint")}</p></> : null}
    <div className="flex min-w-0 flex-wrap gap-2"><label className="sr-only" htmlFor={id}>{t("filters.addValue", { facet: t(`filters.${facet}`) })}</label><TextInput id={id} value={entry} maxLength={facet === "serviceZone" ? 120 : facet === "languageCode" ? 35 : 80} disabled={values.length >= MARKETPLACE_FACET_MAX} className="min-w-0 flex-1 basis-32" aria-invalid={invalid || undefined} onChange={event => { setEntry(event.target.value); setInvalid(false) }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); add() } }} /><Button type="button" variant="outline" aria-label={t("filters.addValue", { facet: t(`filters.${facet}`) })} disabled={values.length >= MARKETPLACE_FACET_MAX || !entry.trim()} onClick={add}>{t("filters.add")}</Button></div>
    {values.length ? <ul className="flex min-w-0 flex-wrap gap-2">{values.map(value => <li key={value} className="min-w-0"><button type="button" className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border border-border bg-muted px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("filters.remove", { value })} onClick={() => onChange(values.filter(current => current !== value))}><span className="break-words">{facet === "languageCode" ? t(`languageNames.${value}`, { defaultValue: value }) : value}</span><span aria-hidden>×</span></button></li>)}</ul> : null}
    {invalid ? <p role="alert" className="text-sm text-destructive">{t("filters.facetInvalid")}</p> : null}
  </fieldset>
}
