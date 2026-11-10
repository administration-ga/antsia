"use client"

import { api } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import { COMMERCE_SERVICE_CONSENTS, COMMERCE_SERVICE_LIMITS } from "@antsia/social-domain/commerce-services"
import type { ServiceOptionsResult } from "@convex/modules/shops/serviceRules"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAction } from "convex/react"
import { useEffect, useId, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Button, Card, Field, TextArea, TextInput } from "@/components/shared/controls"
import { SCREEN_SECTIONS } from "@/components/shared/screen-layout"
import { SHOP_SELECT_CLASS, ShopFrame, ShopLink, useShopAction } from "@/components/shops/shop-ui"
import { routes } from "@/lib/routes"
import { bookingSchema, contactNameOf, EMPTY_BOOKING, serviceDurationMinutes, type BookingValues } from "./service-model"
import { ServiceSlotPicker, type PickedSlot } from "./service-slot-picker"
import { ServiceInitialIntentBoundary, ServiceIntentRecovery, ServiceReviewNotice, useServiceEntryIntent, type useServiceReview } from "./service-intent-guard"
import { useServiceOptions } from "./use-service-options"

type Bookable = NonNullable<Extract<ServiceOptionsResult, { outcome: "ready" }>["booking"]>["services"][number]

/** Choisir un créneau : prestation de l'agenda PRO.GA, créneau libre, conséquences, accord. */
export function ServiceBookingScreen({ handle, offerRef }: { handle: string; offerRef: string }) {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("services")
  return <ShopFrame title={t("booking.title")} lead={t("booking.lead")}>
    <div className="flex flex-wrap gap-2"><ShopLink href={routes.shopOffer(handle, offerRef)}>{t("common.backToOffer")}</ShopLink><ShopLink href={routes.serviceRequests()}>{t("requests.title")}</ShopLink></div>
    <ServiceInitialIntentBoundary key={JSON.stringify([networkId, personId, handle, offerRef])} mode="booking" handle={handle} offerRef={offerRef}><BookingOptions handle={handle} offerRef={offerRef} /></ServiceInitialIntentBoundary>
  </ShopFrame>
}

function BookingOptions({ handle, offerRef }: { handle: string; offerRef: string }) {
  const { t } = useTranslation("services")
  const { options, review, read, pending, error } = useServiceOptions(handle, offerRef)
  if (!options && !error && !review.paused) return <p role="status">{t("common.loading")}</p>
  if (!options || options.outcome !== "ready" || !options.booking) {
    return <Card><div className="grid gap-3" role="alert"><ServiceReviewNotice review={review} onReview={read} /><p>{error ?? t(options?.outcome === "refused" ? "offer.closed" : options?.outcome === "ready" ? "booking.notOffered" : "common.unavailable")}</p><Button variant="outline" pending={pending} disabled={!review.online} onClick={() => { void review.refresh(read) }}>{t("offer.retry")}</Button></div></Card>
  }
  return <BookingFlow handle={handle} offerRef={offerRef} services={options.booking.services} review={review} onReview={read} />
}

function BookingFlow({ handle, offerRef, services, review, onReview }: { handle: string; offerRef: string; services: Bookable[]; review: ReturnType<typeof useServiceReview>; onReview: () => Promise<boolean> }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("services")
  const id = useId()
  const book = useAction(api.modules.shops.serviceActions.book)
  const action = useShopAction()
  const [serviceRef, setServiceRef] = useState(services[0]?.serviceRef ?? "")
  const [slot, setSlot] = useState<PickedSlot | null>(null)
  const intent = useServiceEntryIntent()!
  const [failure, setFailure] = useState<string | null>(null)
  const form = useForm<BookingValues>({ resolver: zodResolver(bookingSchema(t)), defaultValues: EMPTY_BOOKING })
  const service = services.find((item) => item.serviceRef === serviceRef) ?? null
  const errors = form.formState.errors
  const { setValue } = form
  const conditions = JSON.stringify([service, slot, review.stamp])
  useEffect(() => { setValue("consent", false) }, [conditions, setValue])
  const locked = !intent.ready || intent.locked || intent.failed || action.pending || review.paused
  const pick = (next: PickedSlot) => { if (!locked) { setSlot(next); form.setValue("consent", false) } }
  const submit = form.handleSubmit((values) => {
    if (locked || !navigator.onLine || !service || !slot || slot.startAt <= Date.now()) return
    const clientRequestId = intent.begin()
    if (!clientRequestId) return
    setFailure(null)
    const contactName = contactNameOf(values)
    void action.run(() => book({
      networkId, handle, offerRef, serviceRef: service.serviceRef, serviceLabel: service.label, resourceRef: slot.resourceRef, startAt: slot.startAt, endAt: slot.endAt,
      consentTextVersion: COMMERCE_SERVICE_CONSENTS.booking.textVersion, clientRequestId, ...(values.note ? { note: values.note } : {}), ...(contactName ? { contactName } : {}),
    }), (result) => {
      if (result.outcome === "request") intent.complete(result.requestRowId)
      else setFailure(result.outcome === "refused" ? "booking.refused" : "common.unavailable")
    })
  })
  return <div className={`${SCREEN_SECTIONS} gap-y-6`}>
    <div className="col-span-full empty:hidden"><ServiceReviewNotice review={review} onReview={onReview} /></div>
    <div className="col-span-full empty:hidden"><ServiceIntentRecovery intent={intent} onStopped={() => { form.setValue("consent", false); review.invalidate() }} /></div>
    <Card><div className="grid gap-3">
      <Field id={`${id}-service`} label={t("booking.service")}><select id={`${id}-service`} className={SHOP_SELECT_CLASS} disabled={locked} value={serviceRef} onChange={(event) => { setServiceRef(event.target.value); setSlot(null); form.setValue("consent", false) }}>{services.map((item) => <option key={item.serviceRef} value={item.serviceRef}>{t("booking.serviceOption", { label: item.label, duration: serviceDurationMinutes(item.durationMinutes, t) })}</option>)}</select></Field>
      {service?.description ? <p className="text-sm text-muted-foreground">{service.description}</p> : null}
      {service ? <ul className="grid gap-1 text-sm">
        <li>{service.autoConfirm ? t("booking.autoConfirm") : t("booking.hold", { duration: serviceDurationMinutes(service.holdMinutes, t) })}</li>
        <li>{service.minNoticeMinutes > 0 ? t("booking.changeNotice", { duration: serviceDurationMinutes(service.minNoticeMinutes, t) }) : t("booking.changeUntilStart")}</li>
        <li>{t("booking.cancelUntilStart")}</li>
        <li>{t("booking.noDeposit")}</li>
      </ul> : null}
    </div></Card>
    {service ? <Card><ServiceSlotPicker key={service.serviceRef} handle={handle} offerRef={offerRef} serviceRef={service.serviceRef} selected={slot} onPick={pick} disabled={locked} onContextChange={() => { setSlot(null); form.setValue("consent", false) }} /></Card> : null}
    {service && slot ? <Card><form noValidate className="grid min-w-0 gap-4" onSubmit={submit} aria-busy={action.pending || undefined}>
      <fieldset disabled={locked} className="grid min-w-0 gap-4">
      <Field id={`${id}-note`} label={t("booking.note")} hint={t("booking.noteHint", { max: COMMERCE_SERVICE_LIMITS.noteMax })} error={errors.note?.message}><TextArea id={`${id}-note`} aria-invalid={errors.note ? true : undefined} {...form.register("note")} /></Field>
      <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="text-sm font-medium sm:col-span-2">{t("contact.legend")}</legend>
        <Field id={`${id}-first`} label={t("contact.firstName")} error={errors.firstName?.message}><TextInput id={`${id}-first`} autoComplete="given-name" {...form.register("firstName")} /></Field>
        <Field id={`${id}-last`} label={t("contact.lastName")} hint={t("contact.lastNameHint")} error={errors.lastName?.message}><TextInput id={`${id}-last`} autoComplete="family-name" {...form.register("lastName")} /></Field>
        <p className="text-xs text-muted-foreground sm:col-span-2">{t("contact.hint")}</p>
      </fieldset>
      <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-4" aria-invalid={errors.consent ? true : undefined} {...form.register("consent")} /><span>{t("consents.booking")}</span></label>
      {errors.consent?.message ? <p role="alert" className="text-sm text-destructive">{errors.consent.message}</p> : null}
      {/* Réserver : couleur du commerce (ADR-0027). */}
      <Button type="submit" variant="commerce" pending={action.pending}>{t("booking.submit")}</Button>
      </fieldset>
      {failure ? <p role="alert">{t(failure)}</p> : null}
      {action.error ? <p role="alert">{action.error}</p> : null}
    </form></Card> : null}
  </div>
}
