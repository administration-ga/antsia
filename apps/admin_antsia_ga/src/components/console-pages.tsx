"use client"

import { api, type Id } from "@antsia/api/engine"
import { Badge, Button, Field, Select, TextArea, TextInput } from "@antsia/ui"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery } from "convex/react"
import { Landmark } from "lucide-react"
import { useId, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { ConsoleDate, controlStyle, EmptyRows, inputStyle, LoadingRows, MotiveAction, OperationFailure, panelClass, reasonSchema, useOperation, useOperationDraft, useOperationDraftGuard, useWindowCursor, WindowPagination } from "./console-operation-controls"

import { CommercialContactPolicy } from "./console-commercial-contact"
import { ContextualConversationPolicy } from "./console-contextual-policy"
import { PaymentPolicy } from "./console-payment-policy"
import { ServicePolicy } from "./console-service-policy"
import { JobPolicy } from "./console-job-policy"
import { StorefrontPolicy } from "./console-storefront-policy"
import { CatalogPolicy } from "./console-catalog-policy"
import { CheckoutPolicy } from "./console-checkout-policy"
import { PageGovernancePanel } from "./console-page-governance"

type PageValues = { name: string; handle: string; country: string; reason: string }
function CreateInstitutionPage({ networkId, canAdmin }: { networkId: Id<"networks">; canAdmin: boolean }) {
  const { t } = useTranslation("operations")
  const id = useId()
  const create = useMutation(api.modules.pages.admin.createInstitutionPage)
  const operation = useOperation()
  const form = useForm<PageValues>({ resolver: zodResolver(z.object({
    name: z.string().trim().min(1, t("pages.nameInvalid")).max(120, t("pages.nameInvalid")),
    handle: z.string().trim().min(3, t("pages.handleInvalid")).max(60, t("pages.handleInvalid")).regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u, t("pages.handleInvalid")),
    country: z.string().trim().refine((value) => value === "" || /^[A-Z]{2}$/u.test(value), t("pages.countryInvalid")),
    reason: reasonSchema(t("common.reasonInvalid", { min: 10 }), 10),
  })), defaultValues: { name: "", handle: "", country: "", reason: "" } })
  useOperationDraft(form.formState.isDirty || form.formState.isSubmitting || operation.pending)
  const submit = async (values: PageValues) => {
    if (!canAdmin) return
    const saved = await operation.run(() => create({ networkId, name: values.name, handle: values.handle, ...(values.country ? { country: values.country } : {}), visibility: "network", reason: values.reason }))
    if (saved) form.reset()
  }
  return <form className={`${panelClass} flex min-w-0 flex-col gap-4`} noValidate aria-busy={operation.pending || undefined} onSubmit={(event) => { void form.handleSubmit(submit)(event) }}>
    <h3 className="font-semibold">{t("pages.create")}</h3>
    <p className="text-sm text-muted-foreground">{t("pages.creationHint")}</p>
    <fieldset disabled={operation.pending || !canAdmin} className="flex min-w-0 flex-col gap-4">
      <Field htmlFor={`${id}-name`} label={t("pages.name")} required error={form.formState.errors.name?.message}><TextInput id={`${id}-name`} style={inputStyle} maxLength={120} {...form.register("name")} /></Field>
      <Field htmlFor={`${id}-handle`} label={t("pages.handle")} required error={form.formState.errors.handle?.message}><TextInput id={`${id}-handle`} style={inputStyle} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={60} {...form.register("handle")} /></Field>
      <Field htmlFor={`${id}-country`} label={t("pages.country")} hint={t("pages.countryHint")} error={form.formState.errors.country?.message}><TextInput id={`${id}-country`} style={inputStyle} autoComplete="off" maxLength={2} {...form.register("country")} /></Field>
      <Field htmlFor={`${id}-reason`} label={t("common.reason")} required error={form.formState.errors.reason?.message}><TextArea id={`${id}-reason`} maxLength={500} {...form.register("reason")} /></Field>
    </fieldset>
    <OperationFailure message={operation.error} />
    <Button type="submit" style={controlStyle} disabled={operation.pending || !canAdmin}>{t(operation.pending ? "common.saving" : "pages.create")}</Button>
  </form>
}

function PageList({ networkId, status, canAdmin }: { networkId: Id<"networks">; status: "active" | "inactive"; canAdmin: boolean }) {
  const { t } = useTranslation("operations")
  const window = useWindowCursor()
  // PG-01 : une seule fiche de gouvernance ouverte à la fois ; la fermer ne perd aucun brouillon sans accord.
  const [governed, setGoverned] = useState<Id<"pages"> | null>(null)
  const canChange = useOperationDraftGuard()
  const governanceId = useId()
  const pages = useQuery(api.modules.pages.admin.paginatePages, { networkId, status, paginationOpts: { cursor: window.cursor, numItems: 20, maximumRowsRead: 50, maximumBytesRead: 524_288 } })
  const setStatus = useMutation(api.modules.pages.admin.setPageStatus)
  return <div className="flex flex-col gap-4">
    {pages === undefined ? <LoadingRows /> : pages.page.length === 0 ? <EmptyRows done={pages.isDone} /> : <ul className="flex min-w-0 flex-col gap-4">{pages.page.map((page) => <li key={page.pageId} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-semibold">{page.name}</h3><Badge tone={page.trust === "official" ? "primary" : "neutral"}>{t(`pages.trust.${page.trust}`)}</Badge></div>
      <p className="break-words text-sm text-muted-foreground">{t("pages.address", { handle: page.handle })}</p>
      <p className="text-xs text-muted-foreground">{t(`pages.status.${page.status}`)} · <ConsoleDate at={page.createdAt} /></p>
      {canAdmin ? <MotiveAction label={t(page.status === "active" ? "pages.deactivate" : "pages.reactivate")} minLength={10} danger={page.status === "active"} onDecision={(reason) => setStatus({ pageId: page.pageId, status: page.status === "active" ? "inactive" : "active", reason })} /> : null}
      <Button type="button" variant="outline" style={controlStyle} aria-expanded={governed === page.pageId} aria-controls={governed === page.pageId ? `${governanceId}-${page.pageId}` : undefined} onClick={() => { if (canChange()) setGoverned(governed === page.pageId ? null : page.pageId) }}>{t(governed === page.pageId ? "pages.governance.close" : "pages.governance.open")}</Button>
      {governed === page.pageId ? <div id={`${governanceId}-${page.pageId}`}><PageGovernancePanel page={page} canAdmin={canAdmin} /></div> : null}
    </li>)}</ul>}
    <WindowPagination window={window} result={pages} />
  </div>
}

export function PagesPanel({ networkId, canAdmin }: { networkId: Id<"networks">; canAdmin: boolean }) {
  const { t } = useTranslation("operations")
  const id = useId()
  const [status, setStatus] = useState<"active" | "inactive">("active")
  const canChange = useOperationDraftGuard()
  return <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,.6fr)]">
    <section className={`${panelClass} flex min-w-0 flex-col gap-4`}>
      <h2 className="flex items-center gap-2 text-xl font-semibold"><Landmark size={22} aria-hidden="true" />{t("pages.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("pages.lead")}</p>
      <Field htmlFor={id} label={t("pages.filter")}><Select id={id} style={inputStyle} value={status} onChange={(event) => { const next = event.target.value === "inactive" ? "inactive" : "active"; if (next !== status && canChange()) setStatus(next) }}><option value="active">{t("pages.status.active")}</option><option value="inactive">{t("pages.status.inactive")}</option></Select></Field>
      <PageList key={status} networkId={networkId} status={status} canAdmin={canAdmin} />
    </section>
    <div className="flex min-w-0 flex-col gap-5"><CommercialContactPolicy networkId={networkId} canAdmin={canAdmin} /><ContextualConversationPolicy networkId={networkId} canAdmin={canAdmin} /><StorefrontPolicy networkId={networkId} canAdmin={canAdmin} />{canAdmin ? <><CatalogPolicy networkId={networkId} /><CheckoutPolicy networkId={networkId} /><PaymentPolicy networkId={networkId} /><ServicePolicy networkId={networkId} /><JobPolicy networkId={networkId} /><CreateInstitutionPage networkId={networkId} canAdmin={canAdmin} /></> : <p className={`${panelClass} text-sm text-muted-foreground`}>{t("common.adminRequired")}</p>}</div>
  </div>
}
