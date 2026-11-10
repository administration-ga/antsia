"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { COMMERCE_SERVICE_CONSENTS, COMMERCE_SERVICE_LIMITS } from "@antsia/social-domain/commerce-services"
import type { ServiceOptionsResult } from "@convex/modules/shops/serviceRules"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAction } from "convex/react"
import { useEffect, useId, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Button, Card, Field, TextArea, TextInput } from "@/components/shared/controls"
import { FORM_FIELDS, SCREEN_SECTIONS } from "@/components/shared/screen-layout"
import { ShopFrame, ShopLink, useShopAction } from "@/components/shops/shop-ui"
import type { CatalogOffer } from "@/components/shops/catalog-model"
import { routes } from "@/lib/routes"
import { contactNameOf, EMPTY_ORDER, orderSchema, serviceAmount, serviceToday, type OrderValues } from "./service-model"
import { ServiceInitialIntentBoundary, ServiceIntentRecovery, ServiceReviewNotice, useServiceEntryIntent, useServiceInitialIntent, useServiceReview } from "./service-intent-guard"
import { useServiceOptions } from "./use-service-options"
import { ServiceProfileDetails, serviceProfileOf } from "./service-profile-details"

type FixedOrder = NonNullable<Extract<ServiceOptionsResult, { outcome: "ready" }>["fixedOrder"]>
type FixedOrderConditions = Pick<FixedOrder, "unitAmount" | "unit" | "catalogRevision" | "quantityMax" | "leadTimeDays">

/** La révision est celle du snapshot PUBLIC, jamais le compteur interne de l'offre PRO. */
export function publishedPackageQualification(offer: CatalogOffer | null | undefined, fixed: FixedOrderConditions | null, handle: string, offerRef: string): "unavailable" | "unqualified" | "mismatch" | null {
  if (!offer || !fixed || offer.kind !== "service" || offer.shopHandle !== handle || offer.offerRef !== offerRef) return "unavailable"
  const profile = serviceProfileOf(offer)
  if (!profile || !profile.commercialModes.includes("fixed_order") || !profile.deliverables.length) return "unqualified"
  if (offer.revision !== fixed.catalogRevision || offer.variants.length || (offer.price.mode !== "fixed" && offer.price.mode !== "unit")) return "mismatch"
  if (offer.price.amount !== fixed.unitAmount.amount || offer.price.currency !== fixed.unitAmount.currency || (offer.price.mode === "unit" ? offer.price.unit : null) !== fixed.unit || offer.leadTimeDays !== fixed.leadTimeDays) return "mismatch"
  return null
}

/** Commander une prestation à tarif fixe sans créneau : aucune réserve de stock, aucun paiement. */
export function ServiceOrderScreen({ handle, offerRef }: { handle: string; offerRef: string }) {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("services")
  return <ShopFrame title={t("order.title")} lead={t("order.lead")}>
    <div className="flex flex-wrap gap-2"><ShopLink href={routes.shopOffer(handle, offerRef)}>{t("common.backToOffer")}</ShopLink><ShopLink href={routes.serviceRequests()}>{t("requests.title")}</ShopLink></div>
    <ServiceInitialIntentBoundary key={JSON.stringify([networkId, personId, handle, offerRef])} mode="fixed_order" handle={handle} offerRef={offerRef}><OrderOptions handle={handle} offerRef={offerRef} /></ServiceInitialIntentBoundary>
  </ShopFrame>
}

function OrderOptions({ handle, offerRef }: { handle: string; offerRef: string }) {
  const { t } = useTranslation("services")
  const { options, review, read, pending, error } = useServiceOptions(handle, offerRef)
  if (!options && !error && !review.paused) return <p role="status">{t("common.loading")}</p>
  if (!options || options.outcome !== "ready" || !options.fixedOrder) {
    return <Card><div className="grid gap-3" role="alert"><ServiceReviewNotice review={review} onReview={read} /><p>{error ?? t(options?.outcome === "refused" ? "offer.closed" : options?.outcome === "ready" ? "order.notOffered" : "common.unavailable")}</p><Button variant="outline" pending={pending} disabled={!review.online} onClick={() => { void review.refresh(read) }}>{t("offer.retry")}</Button></div></Card>
  }
  return <ServiceOrderForm handle={handle} offerRef={offerRef} fixedOrder={options.fixedOrder} review={review} />
}

/** Formulaire partagé avec la reconfirmation d'un nouveau tarif (`existingRequestRowId`). */
export function ServiceOrderForm({ handle, offerRef, fixedOrder, existingRequestRowId, initialQuantity, review: inheritedReview }: { handle: string; offerRef: string; fixedOrder: FixedOrderConditions; existingRequestRowId?: string; initialQuantity?: number; review?: ReturnType<typeof useServiceReview> }) {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("services")
  const { t: providerT } = useTranslation("provider")
  const catalog = useAuthenticatedConvexQuery(api.modules.shops.catalog.offer, { networkId, handle, offerRef })
  const id = useId()
  const order = useAction(api.modules.shops.serviceActions.orderService)
  const options = useAction(api.modules.shops.serviceActions.options)
  const action = useShopAction()
  const localIntent = useServiceInitialIntent({ mode: "fixed_order", handle, offerRef, ...(existingRequestRowId ? { requestRowId: existingRequestRowId } : {}) })
  const intent = useServiceEntryIntent() ?? localIntent
  const sourceSignature = JSON.stringify(fixedOrder)
  const [reviewed, setReviewed] = useState<{ sourceSignature: string; fixedOrder: FixedOrderConditions | null } | null>(null)
  const currentFixedOrder = reviewed?.sourceSignature === sourceSignature ? reviewed.fixedOrder : fixedOrder
  const displayed = currentFixedOrder ?? fixedOrder
  const offer = !catalog.isError && !catalog.isPending ? catalog.data : null
  const qualification = publishedPackageQualification(offer, currentFixedOrder, handle, offerRef)
  const localReview = useServiceReview()
  const review = inheritedReview ?? localReview
  const [failure, setFailure] = useState<string | null>(null)
  const [readVersion, setReadVersion] = useState(0)
  const [agreedConditions, setAgreedConditions] = useState<string | null>(null)
  const form = useForm<OrderValues>({ resolver: zodResolver(orderSchema(t, displayed.quantityMax)), defaultValues: { ...EMPTY_ORDER, quantity: String(initialQuantity ?? 1) } })
  const { setValue } = form
  const conditions = JSON.stringify([currentFixedOrder, offer?.offerRef, offer?.shopHandle, offer?.revision, offer?.price, offer?.serviceProfile, offer?.leadTimeDays, qualification, catalog.isError, catalog.isFetching, review.stamp, readVersion])
  useEffect(() => { setValue("consent", false); setAgreedConditions(null) }, [conditions, setValue])
  const locked = !intent.ready || intent.locked || intent.failed || action.pending || review.paused || qualification !== null || catalog.isFetching
  const reread = async () => {
    if (!navigator.onLine || intent.locked || action.pending || catalog.isFetching) return false
    setReviewed({ sourceSignature, fixedOrder: null })
    setValue("consent", false); setAgreedConditions(null); setReadVersion(version => version + 1)
    const result = await action.run(async () => {
      const [remote, publication] = await Promise.all([options({ networkId, handle, offerRef }), catalog.refetch()])
      return { remote, publication }
    })
    if (!result || !action.current() || !navigator.onLine) return false
    const fixed = result.remote.outcome === "ready" && result.remote.offerRef === offerRef ? result.remote.fixedOrder : null
    const qualified = !result.publication.isError && publishedPackageQualification(result.publication.data, fixed, handle, offerRef) === null
    setReviewed({ sourceSignature, fixedOrder: qualified ? fixed : null })
    return qualified
  }
  const errors = form.formState.errors
  const locale = i18n.resolvedLanguage ?? "fr"
  const quantity = Number(useWatch({ control: form.control, name: "quantity", defaultValue: String(initialQuantity ?? 1) }))
  const total = Number.isSafeInteger(quantity) && quantity > 0 ? quantity * displayed.unitAmount.amount : null
  const submit = form.handleSubmit((values) => {
    if (locked || !navigator.onLine || agreedConditions !== conditions || publishedPackageQualification(offer, currentFixedOrder, handle, offerRef) !== null || !currentFixedOrder) return
    const clientRequestId = intent.begin()
    if (!clientRequestId) return
    setFailure(null)
    const contactName = contactNameOf(values)
    void action.run(() => order({
      networkId, handle, offerRef, quantity: Number(values.quantity), expectedUnitAmount: { ...currentFixedOrder.unitAmount }, expectedCatalogRevision: currentFixedOrder.catalogRevision, publishedPackage: true,
      consentTextVersion: COMMERCE_SERVICE_CONSENTS.service_order.textVersion, clientRequestId,
      ...(values.desiredDate ? { desiredDate: values.desiredDate } : {}), ...(values.note ? { note: values.note } : {}), ...(contactName ? { contactName } : {}),
      ...(existingRequestRowId ? { existingRequestRowId } : {}),
    }), (result) => {
      if (result.outcome === "request") intent.complete(result.requestRowId)
      else setFailure(result.outcome === "refused" ? "order.refused" : "common.unavailable")
    })
  })
  return <Card><form noValidate className={`${SCREEN_SECTIONS} gap-y-4`} onSubmit={submit} aria-busy={action.pending || undefined}>
    <div className="col-span-full empty:hidden"><ServiceReviewNotice review={review} onReview={reread} /></div>
    <section className="grid min-w-0 gap-4" aria-label={t("order.publishedConditions")}>
      <h2 className="mp-subtitle">{t("order.publishedConditions")}</h2>
      {catalog.isPending || action.pending || catalog.isFetching ? <p role="status">{t("order.conditionsLoading")}</p> : qualification !== null || catalog.isError ? <p role="status" className="text-sm text-muted-foreground">{t(`order.conditions.${catalog.isError ? "unavailable" : qualification ?? "unavailable"}`)}</p> : offer ? <><p className="text-sm">{t("order.publicRevision", { version: offer.revision })}</p><ServiceProfileDetails offer={offer} locale={locale} t={(key, values) => providerT(key, values)} /></> : null}
      <Button type="button" variant="outline" pending={action.pending || catalog.isFetching} disabled={!review.online || intent.locked} onClick={() => { void review.refresh(reread) }}>{t("order.rereadConditions")}</Button>
    </section>
    <div className="col-span-full empty:hidden"><ServiceIntentRecovery intent={intent} onStopped={() => { form.setValue("consent", false); review.invalidate() }} /></div>
    <fieldset disabled={locked} className="grid min-w-0 gap-4">
    <p className="text-lg font-semibold">{displayed.unit ? t("offer.fixedPriceUnit", { amount: serviceAmount(displayed.unitAmount.amount, locale), unit: displayed.unit }) : t("offer.fixedPrice", { amount: serviceAmount(displayed.unitAmount.amount, locale) })}</p>
    {displayed.leadTimeDays !== null ? <p className="text-sm text-muted-foreground">{t("order.leadTime", { count: displayed.leadTimeDays })}</p> : <p className="text-sm text-muted-foreground">{t("order.noPublishedLeadTime")}</p>}
    <div className={`${FORM_FIELDS} gap-y-4`}>
      <Field id={`${id}-quantity`} label={t("order.quantity")} hint={t("order.quantityHint", { max: displayed.quantityMax })} error={errors.quantity?.message}><TextInput id={`${id}-quantity`} inputMode="numeric" autoComplete="off" aria-invalid={errors.quantity ? true : undefined} {...form.register("quantity")} /></Field>
      <Field id={`${id}-date`} label={t("order.desiredDate")} hint={t("order.desiredDateHint")} error={errors.desiredDate?.message}><TextInput id={`${id}-date`} type="date" min={serviceToday()} aria-invalid={errors.desiredDate ? true : undefined} {...form.register("desiredDate")} /></Field>
    </div>
    <Field id={`${id}-note`} label={t("order.note")} hint={t("order.noteHint", { max: COMMERCE_SERVICE_LIMITS.noteMax })} error={errors.note?.message}><TextArea id={`${id}-note`} aria-invalid={errors.note ? true : undefined} {...form.register("note")} /></Field>
    <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="text-sm font-medium sm:col-span-2">{t("contact.legend")}</legend>
      <Field id={`${id}-first`} label={t("contact.firstName")} error={errors.firstName?.message}><TextInput id={`${id}-first`} autoComplete="given-name" {...form.register("firstName")} /></Field>
      <Field id={`${id}-last`} label={t("contact.lastName")} hint={t("contact.lastNameHint")} error={errors.lastName?.message}><TextInput id={`${id}-last`} autoComplete="family-name" {...form.register("lastName")} /></Field>
      <p className="text-xs text-muted-foreground sm:col-span-2">{t("contact.hint")}</p>
    </fieldset>
    {total !== null ? <p role="status" className="font-medium">{t("order.total", { amount: serviceAmount(total, locale) })}</p> : null}
    <p className="text-xs text-muted-foreground">{t("order.noStock")}</p>
    <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-4" aria-invalid={errors.consent ? true : undefined} {...form.register("consent", { onChange: event => setAgreedConditions(event.target.checked ? conditions : null) })} /><span>{t("consents.serviceOrder")}</span></label>
    {errors.consent?.message ? <p role="alert" className="text-sm text-destructive">{errors.consent.message}</p> : null}
    {/* Commander : couleur du commerce (ADR-0027). */}
    <Button type="submit" variant="commerce" pending={action.pending}>{t(existingRequestRowId ? "order.reconfirm" : "order.submit")}</Button>
    </fieldset>
    {failure ? <p role="alert" className="col-span-full">{t(failure)}</p> : null}
    {action.error ? <p role="alert" className="col-span-full">{action.error}</p> : null}
  </form></Card>
}
