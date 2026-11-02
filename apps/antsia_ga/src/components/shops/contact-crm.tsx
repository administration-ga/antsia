"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { COMMERCE_INQUIRY_CONSENT_VERSION } from "@antsia/social-domain/commerce-inquiry"
import type { CommercialThread } from "@antsia/social-features/messagerie"
import { sendIntentFor, type SendIntent } from "@antsia/social-features/features/messagerie/messagerie-send-intent"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import { useId, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { Button, Field, TextArea, TextInput } from "@/components/shared/controls"
import { useShopAction } from "./shop-ui"

const schema = z.object({ selectedText: z.string().trim().min(1).max(2000), displayName: z.string().trim().max(80).refine((value) => !/[\r\n\u0000-\u001f]/u.test(value)), accepted: z.boolean().refine((value) => value) })
export function ContactCrm({ thread }: { thread: CommercialThread }) {
  if (thread.viewerKind !== "requester") return null
  return <RequesterCrm key={thread.threadId} thread={thread} />
}
function RequesterCrm({ thread }: { thread: CommercialThread }) {
  const { t, i18n } = useTranslation("shops")
  const { networkId } = useNetwork()
  const timeZone = useViewerTimeZone()
  const id = useId()
  const transfer = useAuthenticatedConvexQuery(api.modules.commercialMessaging.crm.getMyTransfer, { networkId, threadId: thread.threadId })
  const submit = useMutation(api.modules.commercialMessaging.crm.submitToCrm)
  const withdraw = useMutation(api.modules.commercialMessaging.crm.withdrawCrmConsent)
  const retry = useMutation(api.modules.commercialMessaging.crm.retryTransfer)
  const action = useShopAction()
  const [admission, setAdmission] = useState<Exclude<NonNullable<typeof transfer.data>["state"], "none"> | null>(null)
  const [saved, setSaved] = useState(false)
  const intent = useRef<SendIntent | null>(null)
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { selectedText: "", displayName: "", accepted: false } })
  const state = transfer.data?.state === "none" ? admission ?? "none" : transfer.data?.state ?? admission ?? undefined
  const existing = state !== undefined && state !== "none"
  // Seule une demande enregistrée porte texte choisi, alias et dates : la réponse « none » n'a que sa version.
  const recorded = transfer.data?.state === "none" ? undefined : transfer.data
  const date = (value: number) => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "fr", { dateStyle: "medium", timeStyle: "short", timeZone }).format(value)
  return <section className="grid gap-3 rounded-[var(--ui2-card-radius)] border border-border p-[var(--esp-card-padding,16px)]" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className="antsia-subtitle">{t("contact.crm.title")}</h2><p className="text-sm text-muted-foreground">{t("contact.crm.help")}</p>
    {transfer.isError ? <div role="alert" className="grid gap-2"><p>{t("contact.crm.unavailable")}</p><Button variant="outline" onClick={() => void transfer.refetch()}>{t("common.retry")}</Button></div> : null}
    {state === undefined && !transfer.isError ? <p role="status">{t("common.loading")}</p> : null}
    {state !== undefined ? <p role="status" className="text-sm">{t(`contact.crm.states.${state}`)}</p> : null}
    {transfer.data ? <dl className="grid gap-1 text-xs text-muted-foreground"><div><dt className="inline">{t("contact.crm.version")} </dt><dd className="inline">{transfer.data.textVersion}</dd></div>{recorded?.consentedAt !== undefined ? <div><dt className="inline">{t("contact.crm.consentedAt")} </dt><dd className="inline">{date(recorded.consentedAt)}</dd></div> : null}{recorded?.revokedAt !== undefined ? <div><dt className="inline">{t("contact.crm.revokedAt")} </dt><dd className="inline">{date(recorded.revokedAt)}</dd></div> : null}</dl> : null}
    {existing && recorded?.selectedText ? <details className="rounded-[var(--ui2-card-radius)] bg-background p-[var(--esp-card-padding,16px)]"><summary className="min-h-11 cursor-pointer text-sm">{t("contact.crm.chosenData")}</summary><p className="whitespace-pre-wrap break-words text-sm">{recorded.selectedText}</p>{recorded.displayName ? <p className="mt-2 text-sm">{t("contact.crm.aliasValue", { name: recorded.displayName })}</p> : null}</details> : null}
    {existing && recorded?.revokedAt === undefined && state !== "withdrawn" && state !== "withdrawal_pending" ? <Button type="button" variant="outline" pending={action.pending} className="w-full sm:w-auto sm:justify-self-start" onClick={() => void action.run(() => withdraw({ networkId, threadId: thread.threadId }), () => { form.reset({ selectedText: "", displayName: "", accepted: false }); intent.current = null; setSaved(true) })}>{t("contact.crm.withdraw")}</Button> : null}
    {state === "failed" || state === "withdrawal_pending" ? <Button type="button" variant="outline" pending={action.pending} className="w-full sm:w-auto sm:justify-self-start" onClick={() => void action.run(() => retry({ networkId, threadId: thread.threadId }), () => setSaved(true))}>{t("contact.crm.retry")}</Button> : null}
    {state === "none" && transfer.data?.textVersion !== COMMERCE_INQUIRY_CONSENT_VERSION ? <p role="status" className="text-sm">{t("contact.crm.versionChanged")}</p> : null}
    {state === "none" && thread.state === "accepted" && !transfer.isError && transfer.data?.textVersion === COMMERCE_INQUIRY_CONSENT_VERSION ? <form noValidate className="grid gap-3" onSubmit={form.handleSubmit(async (values) => {
      const next = sendIntentFor(intent.current, { conversation: `${networkId}:${thread.threadId}:crm`, text: JSON.stringify([values.selectedText, values.displayName]), attachments: [], replyTo: null }, () => crypto.randomUUID())
      intent.current = next
      await action.run(() => submit({ networkId, threadId: thread.threadId, selectedText: values.selectedText, ...(values.displayName ? { displayName: values.displayName } : {}), consent: true, textVersion: COMMERCE_INQUIRY_CONSENT_VERSION, idempotencyKey: next.key }), (result) => { form.reset({ selectedText: "", displayName: "", accepted: false }); setAdmission(result.state); setSaved(true) })
    })}>
      <Field id={`${id}-text`} label={t("contact.crm.selectedText")} hint={t("contact.crm.textHint")} error={form.formState.errors.selectedText ? t("contact.validation.message") : undefined}><TextArea id={`${id}-text`} maxLength={2000} disabled={action.pending} aria-invalid={!!form.formState.errors.selectedText} aria-describedby={`${id}-text-hint${form.formState.errors.selectedText ? ` ${id}-text-error` : ""}`} {...form.register("selectedText")} /></Field>
      <Field id={`${id}-alias`} label={t("contact.crm.alias")} hint={t("contact.crm.aliasHint")} error={form.formState.errors.displayName ? t("contact.validation.alias") : undefined}><TextInput id={`${id}-alias`} maxLength={80} autoComplete="off" disabled={action.pending} aria-invalid={!!form.formState.errors.displayName} aria-describedby={`${id}-alias-hint${form.formState.errors.displayName ? ` ${id}-alias-error` : ""}`} {...form.register("displayName")} /></Field>
      <label className="flex min-h-11 items-start gap-3 rounded-[var(--ui2-card-radius)] border border-border p-[var(--esp-card-padding,16px)]"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" disabled={action.pending} aria-invalid={!!form.formState.errors.accepted} aria-describedby={form.formState.errors.accepted ? `${id}-consent-error` : undefined} {...form.register("accepted")} /><span className="text-sm">{t("contact.crm.consent")}</span></label>
      {form.formState.errors.accepted ? <p id={`${id}-consent-error`} role="alert" className="text-sm text-destructive">{t("contact.validation.consent")}</p> : null}
      <Button type="submit" pending={action.pending} className="w-full sm:w-auto sm:justify-self-start">{t("contact.crm.submit")}</Button>
    </form> : null}
    {action.error ? <p role="alert" className="text-sm text-destructive">{action.error}</p> : null}{saved ? <p role="status" className="text-sm">{t("contact.crm.recorded")}</p> : null}
  </section>
}
