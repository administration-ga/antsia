"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { COMMERCE_SERVICE_CONSENTS, COMMERCE_SERVICE_CONTROL_CONTRACT, COMMERCE_SERVICE_CONTROL_CONTRACT_V2, COMMERCE_SERVICE_LIMITS } from "@antsia/social-domain/commerce-services"
import type { ServiceBookingSnapshot, ServiceQuoteResult, ServiceQuotesResult, ServiceRequestDto } from "@convex/modules/shops/serviceRules"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAction } from "convex/react"
import { useLayoutEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Button, type ButtonVariant, Card } from "@/components/shared/controls"
import { useShopAction } from "@/components/shops/shop-ui"
import {
  bookingConsequences, decisionSchema, deviceTimeZone, displayTimeZones, SERVICE_AGENDA_TIME_ZONE, serviceAmount, serviceDateTime,
  serviceTime, serviceZoneName, type DecisionValues,
} from "./service-model"
import { ServiceOrderForm } from "./service-order-screen"
import { ServiceSlotPicker, SlotSummary, type PickedSlot } from "./service-slot-picker"
import { ServiceIntentRecovery, ServiceReviewNotice, useServiceInitialIntent, useServiceReview } from "./service-intent-guard"
import { useCheckoutClock } from "@/components/checkout/use-checkout-clock"

type ReadyQuote = Extract<ServiceQuoteResult, { outcome: "ready" }>["quote"]
type QuoteControlContract = typeof COMMERCE_SERVICE_CONTROL_CONTRACT | typeof COMMERCE_SERVICE_CONTROL_CONTRACT_V2
type QuoteSummary = Extract<ServiceQuotesResult, { outcome: "ready" }>["quotes"][number]

/** Un accord explicite, remis à zéro à chaque nouvelle intention. */
function Decision({ label, submitLabel, pending, onConfirm, variant = "primary", disabled = false }: { label: string; submitLabel: string; pending: boolean; onConfirm: () => void; variant?: ButtonVariant; disabled?: boolean }) {
  const { t } = useTranslation("services")
  const form = useForm<DecisionValues>({ resolver: zodResolver(decisionSchema(t)), defaultValues: { consent: false } })
  const error = form.formState.errors.consent?.message
  return <form noValidate className="grid gap-3" onSubmit={form.handleSubmit(() => { if (disabled || pending || !navigator.onLine) return; form.reset({ consent: false }); onConfirm() })}>
    <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-4" disabled={disabled || pending} aria-invalid={error ? true : undefined} {...form.register("consent")} /><span>{label}</span></label>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <Button type="submit" variant={variant} pending={pending} disabled={disabled}>{submitLabel}</Button>
  </form>
}

// ─── Devis ───────────────────────────────────────────────────────────────────

export function QuotePanel({ request }: { request: ServiceRequestDto }) {
  const { networkId, personId } = useNetwork()
  const { t, i18n } = useTranslation("services")
  const locale = i18n.resolvedLanguage ?? "fr"
  const control = useAuthenticatedConvexQuery(api.modules.shops.services.quoteControl, { networkId, requestRowId: request.requestRowId })
  const contract = !control.isError ? control.data?.quoteControlContract : undefined
  const loadQuotes = useAction(api.modules.shops.serviceActions.quotes)
  const action = useShopAction()
  const review = useServiceReview(contract ?? "unavailable")
  const [loaded, setLoaded] = useState<{ contract: QuoteControlContract; result: ServiceQuotesResult } | null>(null)
  const quotes = loaded && loaded.contract === contract ? loaded.result : null
  const [open, setOpen] = useState<string | null>(null)
  const accepted = request.acceptedQuote
  const load = async () => {
    if (!contract || !navigator.onLine) return false
    const result = await action.run(() => loadQuotes({ networkId, requestRowId: request.requestRowId, contract }), result => setLoaded({ contract, result }))
    return result?.outcome === "ready"
  }
  return <Card><section className="grid gap-4" aria-label={t("quotes.title")}>
    <ServiceReviewNotice review={review} onReview={load} />
    <h2 className="mp-subtitle">{t("quotes.title")}</h2>
    {accepted ? <div className="grid gap-1 rounded-[var(--ui2-card-radius)] border border-border p-4 text-sm" role="status">
      <p className="font-medium">{t("quotes.acceptedProof", { version: accepted.quoteVersion, total: serviceAmount(accepted.acceptedTotal.amount, locale), date: serviceDateTime(accepted.acceptedAt, SERVICE_AGENDA_TIME_ZONE, locale) })}</p>
      <p>{accepted.orderRef ? t("quotes.orderOpened") : t("quotes.noOrderYet")}</p>
    </div> : null}
    {request.order ? <OrderSnapshot request={request} /> : null}
    {!request.inquiryRef ? <p className="text-sm text-muted-foreground">{t("quotes.waitingInquiry")}</p> : control.isError ? <div role="alert" className="grid gap-2"><p>{t("quotes.refused")}</p><Button variant="outline" pending={control.isFetching} disabled={!review.online} onClick={() => { if (navigator.onLine) void control.refetch() }}>{t("common.retry")}</Button></div> : !contract ? <p role="status">{t("common.loading")}</p> : <>
      <Button variant="outline" pending={action.pending} disabled={!review.online} onClick={() => { void review.refresh(load) }}>{t(quotes ? "quotes.reload" : "quotes.load")}</Button>
      {quotes && quotes.outcome !== "ready" ? <p role="alert" className="text-sm">{t(quotes.outcome === "refused" ? "quotes.refused" : "common.unavailable")}</p> : null}
      {quotes?.outcome === "ready" ? quotes.quotes.length === 0 ? <p className="text-sm text-muted-foreground">{t("quotes.none")}</p> : <ul className="grid gap-3">{quotes.quotes.map((quote) => <li key={quote.quoteRef}>
        <QuoteSummaryCard quote={quote} />
        {open === quote.quoteRef ? <QuoteDetail key={JSON.stringify([networkId, personId, request.requestRowId, quote.quoteRef, contract])} request={request} quoteRef={quote.quoteRef} contract={contract} onClose={() => setOpen(null)} /> : <Button variant="outline" onClick={() => setOpen(quote.quoteRef)}>{t(quote.acceptable ? "quotes.readAndAccept" : "quotes.read")}</Button>}
      </li>)}</ul> : null}
      {quotes?.outcome === "ready" && quotes.truncated ? <p className="text-xs text-muted-foreground">{t("quotes.truncated")}</p> : null}
      {action.error ? <p role="alert" className="text-sm">{action.error}</p> : null}
    </>}
  </section></Card>
}

function QuoteSummaryCard({ quote }: { quote: QuoteSummary }) {
  const { t, i18n } = useTranslation("services")
  const locale = i18n.resolvedLanguage ?? "fr"
  return <div className="grid gap-1 text-sm">
    <p className="font-medium">{t("quotes.heading", { reference: quote.reference, title: quote.title })}</p>
    <p>{t("quotes.versionTotal", { version: quote.version, total: serviceAmount(quote.total.amount, locale) })}</p>
    <p className="text-muted-foreground">{t(`quoteStates.${quote.state}`)}</p>
    {quote.current ? null : <p className="text-muted-foreground">{t("quotes.superseded")}</p>}
    {quote.validUntil !== null ? <p className="text-muted-foreground">{t("quotes.validUntil", { date: serviceDateTime(quote.validUntil, SERVICE_AGENDA_TIME_ZONE, locale) })}</p> : null}
    {quote.clientRejection ? <p>{t("quotes.rejectedProof", { version: quote.clientRejection.quoteVersion, date: serviceDateTime(quote.clientRejection.rejectedAt, SERVICE_AGENDA_TIME_ZONE, locale) })}</p> : null}
    {quote.clientAcceptance ? <p>{t("quotes.acceptedProof", { version: quote.clientAcceptance.quoteVersion, total: serviceAmount(quote.clientAcceptance.acceptedTotal.amount, locale), date: serviceDateTime(quote.clientAcceptance.acceptedAt, SERVICE_AGENDA_TIME_ZONE, locale) })}</p> : null}
  </div>
}

/** Lecture précise et décisions explicites ; une réponse incertaine bloque les deux gestes. */
function QuoteDetail({ request, quoteRef, contract, onClose }: { request: ServiceRequestDto; quoteRef: string; contract: QuoteControlContract; onClose: () => void }) {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("services")
  const locale = i18n.resolvedLanguage ?? "fr"
  const read = useAction(api.modules.shops.serviceActions.quote)
  const accept = useAction(api.modules.shops.serviceActions.acceptQuote)
  const reject = useAction(api.modules.shops.serviceActions.rejectQuote)
  const action = useShopAction()
  const [detail, setDetail] = useState<ServiceQuoteResult | null>(null)
  const [readVersion, setReadVersion] = useState(0)
  const intent = useServiceInitialIntent({ mode: "quote_acceptance", handle: request.handle, offerRef: request.offerRef, requestRowId: request.requestRowId })
  const rejection = useServiceInitialIntent({ mode: "quote_rejection", handle: request.handle, offerRef: request.offerRef, requestRowId: request.requestRowId })
  const conditions = JSON.stringify([request.updatedAt, request.state, request.inquiryRef, request.lastCommand])
  const context = useRef(conditions)
  useLayoutEffect(() => { context.current = conditions }, [conditions])
  const decisionLock = useRef(false)
  const review = useServiceReview(conditions)
  const [message, setMessage] = useState<string | null>(null)
  const quote: ReadyQuote | null = detail?.outcome === "ready" ? detail.quote : null
  const now = useCheckoutClock(quote?.validUntil)
  const expired = quote?.validUntil !== null && quote?.validUntil !== undefined && quote.validUntil <= now
  const current = quote?.current === true && ["sent", "viewed", "negotiating"].includes(quote.state)
  const locked = !intent.ready || intent.locked || intent.failed || !rejection.ready || rejection.locked || rejection.failed || review.paused || action.pending
  const load = async () => {
    if (!navigator.onLine || intent.locked || rejection.locked || decisionLock.current) return false
    setMessage(null)
    const expected = context.current
    const result = await action.run(() => read({ networkId, requestRowId: request.requestRowId, quoteRef, contract }))
    if (!result || !action.current() || !navigator.onLine || expected !== context.current) return false
    setDetail(result)
    setReadVersion(version => version + 1)
    return result.outcome === "ready"
  }
  const stopped = () => { decisionLock.current = false; setDetail(null); review.invalidate() }
  return <div className="mt-3 grid gap-3 rounded-[var(--ui2-card-radius)] border border-border p-4">
    <ServiceReviewNotice review={review} onReview={load} />
    <ServiceIntentRecovery intent={intent} onStopped={stopped} />
    <ServiceIntentRecovery intent={rejection} onStopped={stopped} />
    {!detail ? <Button variant="outline" pending={action.pending} disabled={!review.online || !intent.ready || intent.locked || !rejection.ready || rejection.locked} onClick={() => { void review.refresh(load) }}>{t("quotes.loadDetail")}</Button> : <Button variant="outline" pending={action.pending} disabled={!review.online || intent.locked || rejection.locked} onClick={() => { void review.refresh(load) }}>{t("quotes.reloadDetail")}</Button>}
    {detail && detail.outcome !== "ready" ? <p role="alert" className="text-sm">{t(detail.outcome === "refused" ? "quotes.refused" : "common.unavailable")}</p> : null}
    {quote ? <>
      <QuoteSummaryCard quote={quote} />
      {quote.sellerLabel ? <p className="text-sm">{t("quotes.seller", { name: quote.sellerLabel })}</p> : null}
      <table className="w-full text-left text-sm"><caption className="sr-only">{t("quotes.lines")}</caption>
        <thead><tr><th scope="col">{t("quotes.line")}</th><th scope="col">{t("quotes.quantity")}</th><th scope="col">{t("quotes.amount")}</th></tr></thead>
        <tbody>{quote.lines.map((line, index) => <tr key={`${index}:${line.label}`}><td className="break-words py-1 pr-2">{line.label}</td><td className="py-1 pr-2">{t("quotes.lineQuantity", { quantity: line.quantity, unit: serviceAmount(line.unitAmount.amount, locale) })}</td><td className="py-1">{serviceAmount(line.lineAmount.amount, locale)}</td></tr>)}</tbody>
      </table>
      {quote.notes ? <p className="whitespace-pre-line break-words text-sm text-muted-foreground">{quote.notes}</p> : null}
      {quote.acceptable && current && !expired ? <div className="grid gap-2">
        <p className="text-sm" role="status">{t("quotes.recap", { reference: quote.reference, version: quote.version, total: serviceAmount(quote.total.amount, locale) })}</p>
        {/* Accepter le devis, c'est commander : couleur du commerce (ADR-0027). */}
        <Decision key={JSON.stringify(["accept", readVersion, quote.quoteRef, quote.version, quote.total, quote.validUntil, detail?.outcome === "ready" ? detail.consentTextVersion : null, review.stamp])} label={t("consents.quoteAcceptance")} submitLabel={t("quotes.accept")} variant="commerce" pending={action.pending} disabled={locked} onConfirm={() => {
          if (locked || decisionLock.current || !navigator.onLine || !quote.acceptable || !current || quote.validUntil !== null && quote.validUntil <= Date.now() || detail?.outcome !== "ready") return
          decisionLock.current = true
          const clientRequestId = intent.begin()
          if (!clientRequestId) { decisionLock.current = false; return }
          setMessage(null)
          void action.run(() => accept({ networkId, requestRowId: request.requestRowId, quoteRef: quote.quoteRef, quoteVersion: quote.version, acceptedTotal: { ...quote.total }, consentTextVersion: detail.consentTextVersion, clientRequestId }), (result) => {
            if (result.outcome !== "request") setMessage(result.outcome === "refused" ? "quotes.acceptRefused" : "common.unavailable")
            else intent.complete(result.requestRowId)
          })
        }} />
      </div> : <p className="text-sm text-muted-foreground">{t(expired ? "quotes.expired" : "quotes.notAcceptable")}</p>}
      {contract === COMMERCE_SERVICE_CONTROL_CONTRACT_V2 && quote.rejectable === true && current && !expired && detail?.outcome === "ready" && detail.rejectionConsentTextVersion ? <section className="grid gap-3 border-t border-border pt-4" aria-label={t("quotes.rejectTitle")}>
        <h3 className="font-semibold">{t("quotes.rejectTitle")}</h3>
        <p className="text-sm">{t("quotes.rejectRecap", { reference: quote.reference, version: quote.version })}</p>
        <Decision key={JSON.stringify(["reject", readVersion, quote.quoteRef, quote.version, quote.validUntil, detail.rejectionConsentTextVersion, review.stamp])} label={t("consents.quoteRejection")} submitLabel={t("quotes.reject")} variant="outline" pending={action.pending} disabled={locked} onConfirm={() => {
          if (locked || decisionLock.current || !navigator.onLine || contract !== COMMERCE_SERVICE_CONTROL_CONTRACT_V2 || quote.rejectable !== true || !current || quote.validUntil !== null && quote.validUntil <= Date.now() || detail?.outcome !== "ready" || !detail.rejectionConsentTextVersion) return
          decisionLock.current = true
          const clientRequestId = rejection.begin()
          if (!clientRequestId) { decisionLock.current = false; return }
          setMessage(null)
          void action.run(() => reject({ networkId, requestRowId: request.requestRowId, quoteRef: quote.quoteRef, quoteVersion: quote.version, consentTextVersion: detail.rejectionConsentTextVersion!, clientRequestId }), (result) => {
            if (result.outcome !== "request") setMessage(result.outcome === "refused" ? "quotes.rejectRefused" : "common.unavailable")
            else rejection.complete(result.requestRowId)
          })
        }} />
      </section> : null}
    </> : null}
    {message ? <p role="status" className="text-sm">{t(message)}</p> : null}
    {action.error ? <p role="alert" className="text-sm">{action.error}</p> : null}
    <Button variant="outline" onClick={onClose}>{t("common.close")}</Button>
  </div>
}

// ─── Commande ────────────────────────────────────────────────────────────────

function OrderSnapshot({ request }: { request: ServiceRequestDto }) {
  const { t, i18n } = useTranslation("services")
  const locale = i18n.resolvedLanguage ?? "fr"
  const order = request.order
  if (!order) return null
  return <div className="grid gap-1 rounded-[var(--ui2-card-radius)] border border-border p-4 text-sm">
    <p className="font-medium">{t(`orderStates.${order.state}`)}</p>
    {order.total ? <p>{t("order.totalLabel", { amount: serviceAmount(order.total.amount, locale) })}</p> : null}
    <p className="text-xs text-muted-foreground">{t("common.observed", { date: serviceDateTime(order.observedAt, SERVICE_AGENDA_TIME_ZONE, locale) })}</p>
  </div>
}

export function OrderPanel({ request }: { request: ServiceRequestDto }) {
  const { t, i18n } = useTranslation("services")
  const locale = i18n.resolvedLanguage ?? "fr"
  const last = request.lastCommand
  const reconfirm = last?.kind === "order" && last.state === "reconfirm" && last.currentUnitAmount && last.currentCatalogRevision !== null ? { amount: last.currentUnitAmount, revision: last.currentCatalogRevision } : null
  return <Card><section className="grid gap-3" aria-label={t("order.panel")}>
    <h2 className="mp-subtitle">{t("order.panel")}</h2>
    {request.order ? <OrderSnapshot request={request} /> : <p className="text-sm text-muted-foreground">{t("order.noOrder")}</p>}
    {reconfirm ? <div className="grid gap-3">
      <p role="status" className="text-sm">{t("order.priceChanged", { amount: serviceAmount(reconfirm.amount.amount, locale) })}</p>
      <ServiceOrderForm handle={request.handle} offerRef={request.offerRef} existingRequestRowId={request.requestRowId} initialQuantity={last?.quantity ?? 1}
        fixedOrder={{ unitAmount: reconfirm.amount, unit: null, catalogRevision: reconfirm.revision, quantityMax: COMMERCE_SERVICE_LIMITS.orderQuantityMax, leadTimeDays: null }} />
    </div> : null}
  </section></Card>
}

// ─── Rendez-vous ─────────────────────────────────────────────────────────────

function BookingCard({ booking, title }: { booking: ServiceBookingSnapshot; title: string }) {
  const { t, i18n } = useTranslation("services")
  const locale = i18n.resolvedLanguage ?? "fr"
  const [zones] = useState(() => displayTimeZones(deviceTimeZone(), booking.startAt))
  const consequences = bookingConsequences(booking)
  return <div className="grid gap-1 rounded-[var(--ui2-card-radius)] border border-border p-4 text-sm">
    <p className="font-medium">{title}</p>
    <p>{booking.serviceLabel}</p>
    {zones.map((zone) => <p key={zone}>{t("booking.when", { start: serviceDateTime(booking.startAt, zone, locale), end: serviceTime(booking.endAt, zone, locale), zone: serviceZoneName(booking.startAt, zone, locale) })}</p>)}
    {booking.resourceLabel ? <p>{t("slots.resource", { resource: booking.resourceLabel })}</p> : null}
    <p className="font-medium">{t(`bookingStates.${booking.state}`)}</p>
    {booking.cancellation ? <p>{t(`cancellations.${booking.cancellation}`)}</p> : null}
    {booking.holdExpiresAt !== null ? <p>{t("booking.heldUntil", { date: serviceDateTime(booking.holdExpiresAt, SERVICE_AGENDA_TIME_ZONE, locale) })}</p> : null}
    {consequences.observed ? <ul className="grid gap-1 text-muted-foreground">
      <li>{consequences.changeUntil !== null ? t("booking.changeUntil", { date: serviceDateTime(consequences.changeUntil, SERVICE_AGENDA_TIME_ZONE, locale) }) : t("booking.changeClosed")}</li>
      <li>{consequences.cancelUntil !== null ? t("booking.cancelUntil", { date: serviceDateTime(consequences.cancelUntil, SERVICE_AGENDA_TIME_ZONE, locale) }) : t("booking.cancelClosed")}</li>
      {consequences.changeRequiresConfirmation ? <li>{t("booking.changeNeedsConfirmation")}</li> : null}
      <li>{t("booking.noDeposit")}</li>
    </ul> : <p className="text-muted-foreground">{t("booking.policyUnknown")}</p>}
    <p className="text-xs text-muted-foreground">{t("common.observed", { date: serviceDateTime(booking.observedAt, SERVICE_AGENDA_TIME_ZONE, locale) })}</p>
  </div>
}

export function BookingPanel({ request }: { request: ServiceRequestDto }) {
  const { t } = useTranslation("services")
  const [mode, setMode] = useState<"none" | "change" | "cancel">("none")
  const booking = request.booking
  return <Card><section className="grid gap-4" aria-label={t("booking.panel")}>
    <h2 className="mp-subtitle">{t("booking.panel")}</h2>
    {booking ? <BookingCard booking={booking} title={t("booking.current")} /> : <p className="text-sm text-muted-foreground">{t("booking.none")}</p>}
    {request.pendingReplacement ? <><BookingCard booking={request.pendingReplacement} title={t("booking.replacement")} /><p className="text-sm">{t("booking.replacementHint")}</p></> : null}
    {booking ? <div className="flex flex-wrap gap-2">
      {request.canChange ? <Button variant={mode === "change" ? "primary" : "outline"} aria-expanded={mode === "change"} onClick={() => setMode(mode === "change" ? "none" : "change")}>{t("change.open")}</Button> : null}
      {request.canCancel ? <Button variant={mode === "cancel" ? "primary" : "outline"} aria-expanded={mode === "cancel"} onClick={() => setMode(mode === "cancel" ? "none" : "cancel")}>{t("cancel.open")}</Button> : null}
    </div> : null}
    {booking && mode === "change" && request.canChange ? <ReschedulePanel request={request} booking={booking} onDone={() => setMode("none")} /> : null}
    {booking && mode === "cancel" && request.canCancel ? <CancelPanel request={request} booking={booking} onDone={() => setMode("none")} /> : null}
  </section></Card>
}

function ReschedulePanel({ request, booking, onDone }: { request: ServiceRequestDto; booking: ServiceBookingSnapshot; onDone: () => void }) {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("services")
  const locale = i18n.resolvedLanguage ?? "fr"
  const reschedule = useAction(api.modules.shops.serviceActions.reschedule)
  const refresh = useAction(api.modules.shops.serviceActions.refresh)
  const action = useShopAction()
  const [slot, setSlot] = useState<PickedSlot | null>(null)
  const intent = useServiceInitialIntent({ mode: "booking_change", handle: request.handle, offerRef: request.offerRef, requestRowId: request.requestRowId })
  const review = useServiceReview()
  const deadline = booking.policy?.changeUntil ?? null
  const now = useCheckoutClock(deadline)
  const locked = !intent.ready || intent.locked || intent.failed || review.paused || action.pending || deadline === null || now >= deadline
  const [message, setMessage] = useState<string | null>(null)
  return <div className="grid gap-4 rounded-[var(--ui2-card-radius)] border border-border p-4">
    <ServiceReviewNotice review={review} onReview={async () => await refresh({ networkId, requestRowId: request.requestRowId }) === "updated"} />
    <ServiceIntentRecovery intent={intent} onStopped={() => { setSlot(null); review.invalidate() }} />
    <ServiceSlotPicker handle={request.handle} offerRef={request.offerRef} serviceRef={booking.serviceRef} selected={slot} disabled={locked} onContextChange={() => setSlot(null)} onPick={(next) => { if (!locked) setSlot(next) }} />
    {slot && booking.revision !== null ? <div className="grid gap-3">
      <SlotSummary slot={slot} zone={SERVICE_AGENDA_TIME_ZONE} />
      <ul className="grid gap-1 text-sm">
        <li>{t("change.keepCurrent", { start: serviceDateTime(booking.startAt, SERVICE_AGENDA_TIME_ZONE, locale) })}</li>
        <li>{booking.policy?.changeRequiresConfirmation ? t("change.needsConfirmation") : t("change.immediate")}</li>
        <li>{t("booking.noDeposit")}</li>
      </ul>
      <Decision key={JSON.stringify([booking.revision, booking.policy, slot, review.stamp])} label={t("consents.bookingChange")} submitLabel={t("change.submit")} pending={action.pending} disabled={locked} onConfirm={() => {
        const revision = booking.revision
        if (revision === null || locked || !navigator.onLine || slot.startAt <= Date.now() || deadline === null || Date.now() >= deadline) return
        const clientRequestId = intent.begin()
        if (!clientRequestId) return
        setMessage(null)
        void action.run(() => reschedule({ networkId, requestRowId: request.requestRowId, startAt: slot.startAt, endAt: slot.endAt, resourceRef: slot.resourceRef, expectedRevision: revision, consentTextVersion: COMMERCE_SERVICE_CONSENTS.booking_change.textVersion, clientRequestId }), (result) => {
          if (result.outcome === "request") { intent.complete(result.requestRowId); if (result.state === "accepted") onDone() }
          else setMessage(result.outcome === "refused" ? "change.refused" : "common.unavailable")
        })
      }} />
    </div> : null}
    {message ? <p role="alert" className="text-sm">{t(message)}</p> : null}
    {action.error ? <p role="alert" className="text-sm">{action.error}</p> : null}
  </div>
}

function CancelPanel({ request, booking, onDone }: { request: ServiceRequestDto; booking: ServiceBookingSnapshot; onDone: () => void }) {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("services")
  const locale = i18n.resolvedLanguage ?? "fr"
  const cancel = useAction(api.modules.shops.serviceActions.cancel)
  const refresh = useAction(api.modules.shops.serviceActions.refresh)
  const action = useShopAction()
  const intent = useServiceInitialIntent({ mode: "booking_cancel", handle: request.handle, offerRef: request.offerRef, requestRowId: request.requestRowId })
  const review = useServiceReview()
  const deadline = booking.policy?.cancelUntil ?? null
  const now = useCheckoutClock(deadline)
  const locked = !intent.ready || intent.locked || intent.failed || review.paused || deadline === null || now >= deadline
  const [message, setMessage] = useState<string | null>(null)
  const revision = booking.revision
  return <div className="grid gap-3 rounded-[var(--ui2-card-radius)] border border-border p-4">
    <ServiceReviewNotice review={review} onReview={async () => await refresh({ networkId, requestRowId: request.requestRowId }) === "updated"} />
    <ServiceIntentRecovery intent={intent} onStopped={() => review.invalidate()} />
    <ul className="grid gap-1 text-sm">
      <li>{t("cancel.consequence", { start: serviceDateTime(booking.startAt, SERVICE_AGENDA_TIME_ZONE, locale) })}</li>
      {request.pendingReplacement ? <li>{t("cancel.replacementToo")}</li> : null}
      <li>{t("booking.noDeposit")}</li>
    </ul>
    {revision !== null ? <Decision key={JSON.stringify([revision, booking.policy, request.pendingReplacement, review.stamp])} label={t("consents.bookingCancel")} submitLabel={t("cancel.submit")} pending={action.pending} disabled={locked} onConfirm={() => {
      if (locked || !navigator.onLine || deadline === null || Date.now() >= deadline) return
      const clientRequestId = intent.begin()
      if (!clientRequestId) return
      setMessage(null)
      void action.run(() => cancel({ networkId, requestRowId: request.requestRowId, expectedRevision: revision, consentTextVersion: COMMERCE_SERVICE_CONSENTS.booking_cancel.textVersion, clientRequestId }), (result) => {
        if (result.outcome === "request") { intent.complete(result.requestRowId); if (result.state === "accepted") onDone() }
        else setMessage(result.outcome === "refused" ? "cancel.refused" : "common.unavailable")
      })
    }} /> : <p className="text-sm text-muted-foreground">{t("booking.policyUnknown")}</p>}
    {message ? <p role="alert" className="text-sm">{t(message)}</p> : null}
    {action.error ? <p role="alert" className="text-sm">{action.error}</p> : null}
  </div>
}
