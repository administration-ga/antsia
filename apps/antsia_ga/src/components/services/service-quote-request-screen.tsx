"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { COMMERCE_INQUIRY_CONSENT_VERSION } from "@antsia/social-domain/commerce-inquiry"
import { COMMERCE_SERVICE_LIMITS } from "@antsia/social-domain/commerce-services"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAction } from "convex/react"
import { useEffect, useId, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Button, Card, Field, TextArea, TextInput } from "@/components/shared/controls"
import { FORM_FIELDS, SCREEN_SECTIONS } from "@/components/shared/screen-layout"
import { ShopFrame, ShopLink, ShopQueryFailure, useShopAction } from "@/components/shops/shop-ui"
import { routes } from "@/lib/routes"
import { EMPTY_QUOTE_REQUEST, quoteRequestSchema, serviceToday, type QuoteRequestValues } from "./service-model"
import { ServiceInitialIntentBoundary, ServiceIntentRecovery, ServiceReviewNotice, useServiceEntryIntent, useServiceReview } from "./service-intent-guard"

/** Demander un devis : depuis la conversation commerciale ACCEPTÉE avec cette boutique (P10). */
export function ServiceQuoteRequestScreen({ handle, offerRef }: { handle: string; offerRef: string }) {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("services")
  return <ShopFrame title={t("quote.title")} lead={t("quote.lead")}>
    <div className="flex flex-wrap gap-2"><ShopLink href={routes.shopOffer(handle, offerRef)}>{t("common.backToOffer")}</ShopLink><ShopLink href={routes.serviceRequests()}>{t("requests.title")}</ShopLink></div>
    <ServiceInitialIntentBoundary key={JSON.stringify([networkId, personId, handle, offerRef])} mode="quote" handle={handle} offerRef={offerRef}><QuoteContext handle={handle} offerRef={offerRef} /></ServiceInitialIntentBoundary>
  </ShopFrame>
}

function QuoteContext({ handle, offerRef }: { handle: string; offerRef: string }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("services")
  const offer = useAuthenticatedConvexQuery(api.modules.shops.catalog.offer, { networkId, handle, offerRef })
  const context = useAuthenticatedConvexQuery(api.modules.shops.services.quoteRequestContext, { networkId, handle, offerRef })
  const previous = useRef<{ threadId: Id<"commercialThreads"> } | null>(null)
  if (!offer.isError && !context.isError && context.data?.threadState === "accepted" && context.data.threadId && offer.data?.kind === "service") previous.current = { threadId: context.data.threadId }
  const review = async () => {
    const [freshOffer, freshContext] = await Promise.all([offer.refetch(), context.refetch()])
    return !freshOffer.isError && !freshContext.isError && freshOffer.data?.kind === "service" && freshContext.data?.threadState === "accepted" && !!freshContext.data.threadId
  }
  if (offer.isError || context.isError) return previous.current ? <QuoteRequestForm handle={handle} offerRef={offerRef} offerTitle={t("quote.title")} threadId={previous.current.threadId} attachments={[]} attachmentsTruncated={false} sourceAvailable={false} onReview={review} /> : <ShopQueryFailure href={routes.shopOffer(handle, offerRef)} retry={() => { void offer.refetch(); void context.refetch() }} />
  if (offer.isPending || context.isPending || offer.data === undefined || context.data === undefined) return <p role="status">{t("common.loading")}</p>
  if (offer.data === null || offer.data.kind !== "service" || context.data === null) return <ShopQueryFailure href={routes.shopOffer(handle, offerRef)} />
  const thread = context.data
  if (thread.threadState !== "accepted" || thread.threadId === null) {
    return <Card><div className="grid gap-3">
      <h2 className="text-lg font-semibold">{offer.data.title}</h2>
      <p>{t(thread.threadState === null ? "quote.needConversation" : thread.threadState === "requested" ? "quote.conversationPending" : "quote.conversationClosed")}</p>
      {thread.threadState === null ? <ShopLink variant="message" href={routes.shopContact(handle, offerRef)}>{t("quote.askContact")}</ShopLink> : null}
      {thread.threadId !== null ? <ShopLink variant="message" href={routes.commercialConversation(thread.threadId)}>{t("quote.openConversation")}</ShopLink> : null}
    </div></Card>
  }
  return <QuoteRequestForm handle={handle} offerRef={offerRef} offerTitle={offer.data.title} threadId={thread.threadId} attachments={thread.attachments} attachmentsTruncated={thread.attachmentsTruncated} sourceAvailable onReview={review} />
}

type Attachment = { messageId: Id<"commercialMessages">; createdAt: number; files: Array<{ filename: string; mimeType: string; sizeBytes: number }> }

function QuoteRequestForm({ handle, offerRef, offerTitle, threadId, attachments, attachmentsTruncated, sourceAvailable, onReview }: { handle: string; offerRef: string; offerTitle: string; threadId: Id<"commercialThreads">; attachments: Attachment[]; attachmentsTruncated: boolean; sourceAvailable: boolean; onReview: () => Promise<boolean> }) {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("services")
  const id = useId()
  const submit = useAction(api.modules.shops.serviceActions.requestQuote)
  const action = useShopAction()
  const intent = useServiceEntryIntent()!
  const review = useServiceReview(JSON.stringify([threadId, sourceAvailable, attachments]))
  const [failure, setFailure] = useState<string | null>(null)
  const form = useForm<QuoteRequestValues>({ resolver: zodResolver(quoteRequestSchema(t)), defaultValues: EMPTY_QUOTE_REQUEST })
  const { setValue } = form
  useEffect(() => { setValue("consent", false) }, [review.stamp, setValue])
  const locked = !intent.ready || intent.locked || intent.failed || action.pending || review.paused || !sourceAvailable
  const chosen = form.watch("attachmentMessageIds")
  const chosenFiles = attachments.filter((item) => chosen.includes(item.messageId)).reduce((sum, item) => sum + item.files.length, 0)
  const errors = form.formState.errors
  const locale = i18n.resolvedLanguage ?? "fr"
  const onSubmit = form.handleSubmit((values) => {
    if (locked || !navigator.onLine) return
    if (chosenFiles > COMMERCE_SERVICE_LIMITS.quoteAttachmentsMax) { form.setError("attachmentMessageIds", { message: t("validation.attachments") }); return }
    const ids = attachments.filter((item) => values.attachmentMessageIds.includes(item.messageId)).map((item) => item.messageId)
    const clientRequestId = intent.begin()
    if (!clientRequestId) return
    setFailure(null)
    void action.run(() => submit({
      networkId, handle, offerRef, threadId, need: values.need, attachmentMessageIds: ids, consentTextVersion: COMMERCE_INQUIRY_CONSENT_VERSION, clientRequestId,
      ...(values.constraints ? { constraints: values.constraints } : {}), ...(values.desiredDate ? { desiredDate: values.desiredDate } : {}), ...(values.quantity ? { quantity: Number(values.quantity) } : {}),
    }), (result) => {
      if (result.outcome === "request") intent.complete(result.requestRowId)
      else setFailure(result.outcome === "refused" ? "quote.refused" : "common.unavailable")
    })
  })
  return <Card><form noValidate className="grid min-w-0 gap-4" onSubmit={onSubmit} aria-busy={action.pending || undefined}>
    <ServiceReviewNotice review={review} onReview={onReview} />
    <ServiceIntentRecovery intent={intent} onStopped={() => { form.setValue("consent", false); review.invalidate() }} />
    <fieldset disabled={locked} className="grid min-w-0 gap-4">
    <h2 className="text-lg font-semibold">{offerTitle}</h2>
    <p className="text-sm text-muted-foreground">{t("quote.formLead")}</p>
    <div className={`${SCREEN_SECTIONS} gap-y-4`}>
      <Field id={`${id}-need`} label={t("quote.need")} hint={t("quote.needHint", { max: COMMERCE_SERVICE_LIMITS.quoteNeedMax })} error={errors.need?.message}><TextArea id={`${id}-need`} aria-invalid={errors.need ? true : undefined} aria-describedby={`${id}-need-hint`} {...form.register("need")} /></Field>
      <Field id={`${id}-constraints`} label={t("quote.constraints")} hint={t("quote.constraintsHint")} error={errors.constraints?.message}><TextArea id={`${id}-constraints`} aria-invalid={errors.constraints ? true : undefined} {...form.register("constraints")} /></Field>
    </div>
    <div className={`${FORM_FIELDS} gap-y-4`}>
      <Field id={`${id}-date`} label={t("quote.desiredDate")} hint={t("quote.desiredDateHint")} error={errors.desiredDate?.message}><TextInput id={`${id}-date`} type="date" min={serviceToday()} aria-invalid={errors.desiredDate ? true : undefined} {...form.register("desiredDate")} /></Field>
      <Field id={`${id}-quantity`} label={t("quote.quantity")} error={errors.quantity?.message}><TextInput id={`${id}-quantity`} inputMode="numeric" autoComplete="off" aria-invalid={errors.quantity ? true : undefined} {...form.register("quantity")} /></Field>
    </div>
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">{t("quote.attachments")}</legend>
      <p className="text-xs text-muted-foreground">{t("quote.attachmentsHint", { max: COMMERCE_SERVICE_LIMITS.quoteAttachmentsMax })}</p>
      {attachments.length === 0 ? <p className="text-sm text-muted-foreground">{t("quote.noAttachments")}</p> : <ul className="grid gap-2">{attachments.map((item) => <li key={item.messageId}>
        <label className="flex min-h-11 items-start gap-3 rounded-[var(--ui2-card-radius)] border border-border p-4">
          <input type="checkbox" value={item.messageId} className="mt-1 size-4" {...form.register("attachmentMessageIds")} />
          <span className="grid gap-1 text-sm"><span>{t("quote.attachmentSent", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(item.createdAt) })}</span>{item.files.map((file) => <span key={`${item.messageId}:${file.filename}`} className="break-all text-muted-foreground">{file.filename}</span>)}</span>
        </label>
      </li>)}</ul>}
      {attachmentsTruncated ? <p className="text-xs text-muted-foreground">{t("quote.attachmentsTruncated")}</p> : null}
      {errors.attachmentMessageIds?.message ? <p role="alert" className="text-sm text-destructive">{errors.attachmentMessageIds.message}</p> : null}
    </fieldset>
    <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-4" aria-invalid={errors.consent ? true : undefined} {...form.register("consent")} /><span>{t("quote.consent")}</span></label>
    {errors.consent?.message ? <p role="alert" className="text-sm text-destructive">{errors.consent.message}</p> : null}
    <p className="text-xs text-muted-foreground">{t("quote.privacy")}</p>
    {/* Demander un devis : couleur du commerce (ADR-0027). */}
    <Button type="submit" variant="commerce" pending={action.pending}>{t("quote.submit")}</Button>
    </fieldset>
    {failure ? <p role="alert">{t(failure)}</p> : null}
    {action.error ? <p role="alert">{action.error}</p> : null}
    <ShopLink href={routes.commercialConversation(threadId)}>{t("quote.openConversation")}</ShopLink>
  </form></Card>
}
