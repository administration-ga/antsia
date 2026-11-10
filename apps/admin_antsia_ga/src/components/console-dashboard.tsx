"use client"

import { api, type Id } from "@antsia/api/engine"
import { isSigningOutEverywhere } from "@antsia/api/sign-out-everywhere"
import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { validateFacetSchema } from "@antsia/social-domain/facets"
import { isValidNetworkSlug, MEMBERSHIP_POLICIES, CONTENT_VISIBILITIES } from "@antsia/social-domain/network"
import { APPLICATION_THEMES, Button, Field, Select, TextArea, TextInput } from "@antsia/ui"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { ArrowLeft, Globe2, Plus, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { ConsoleQueryBoundary } from "./console-operation-controls"
import { OperationsPanel } from "./console-operations"
import { CONSOLE_SECTIONS, readConsoleState, routes, type ConsoleSection } from "@/lib/routes"

// La frontière vit avec les contrôles partagés, que les panneaux importent sans cycle ; son chemin d'import reste valable.
export { ConsoleQueryBoundary }

export type ConsoleOperator = { admissionId?: Id<"operatorSessionProofs">; personId: Id<"persons">; displayName: string | null; role: "platform_operator" | "platform_admin" }
type NetworkSummary = FunctionReturnType<typeof api.modules.networks.networks.listForConsole>[number]
const SECTIONS = CONSOLE_SECTIONS
type Section = ConsoleSection
const FIELD_CLASS = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
const CONTROL_STYLE = { minHeight: 44 } as const

function useLiveConsoleForm() {
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  return live
}

function QueryFailure({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useTranslation("admin")
  const denied = engineErrorCode(error) === "operatorRequired" || engineErrorCode(error) === "unauthenticated"
  return <section className="space-y-3 rounded-xl border border-border bg-card p-5"><p role="alert">{t(denied ? "session.denied" : "common.loadFailed")}</p><Button style={CONTROL_STYLE} onClick={retry}>{t("session.retry")}</Button></section>
}

/** Structure fermée avant les règles pures du domaine ; aucun JSON arbitraire transmis. */
const facetShape = z.object({
  fields: z.array(z.object({
    key: z.string(),
    kind: z.enum(["text", "country", "enum", "textList", "year", "boolean"]),
    required: z.boolean(),
    defaultVisibility: z.enum(["hidden", "network", "root"]),
    maxLength: z.number().int().positive().optional(),
    maxItems: z.number().int().positive().optional(),
    enumValues: z.array(z.string().max(280)).optional(),
    excludedValues: z.array(z.string().max(280)).max(100).optional(),
  }).strict()).max(24),
}).strict()

export function parseConsoleFacetSchema(input: string) {
  if (input.trim() === "") return undefined
  let value: unknown
  try { value = JSON.parse(input) as unknown } catch { return null }
  const parsed = facetShape.safeParse(value)
  if (!parsed.success || validateFacetSchema(parsed.data).length !== 0) return null
  return parsed.data
}

export function splitConsoleValues(input: string): string[] {
  return [...new Set(input.split(/[,\n]/).map((item) => item.trim()).filter(Boolean))]
}

export function networkFormSchema(labels: { invalid: string; facetInvalid: string; countryInvalid: string; reasonRequired: string }) {
  return z.object({
    slug: z.string().trim().refine(isValidNetworkSlug, labels.invalid),
    name: z.string().trim().min(2, labels.invalid).max(60, labels.invalid),
    membershipPolicy: z.enum(MEMBERSHIP_POLICIES, { errorMap: () => ({ message: labels.invalid }) }),
    defaultVisibility: z.enum(CONTENT_VISIBILITIES, { errorMap: () => ({ message: labels.invalid }) }),
    reachValues: z.string().max(4100, labels.invalid).refine((value) => splitConsoleValues(value).length <= 50 && splitConsoleValues(value).every((item) => item.length <= 80), labels.invalid),
    openCountries: z.string().max(2000, labels.countryInvalid).refine((value) => splitConsoleValues(value).length <= 249 && splitConsoleValues(value).every((country) => /^[A-Z]{2}$/.test(country)), labels.countryInvalid),
    theme: z.string().trim().regex(/^[a-z][a-z0-9-]{0,39}$/, labels.invalid),
    managedBy: z.enum(["generic", "diaspora"], { errorMap: () => ({ message: labels.invalid }) }),
    facetSchema: z.string().max(20_000, labels.facetInvalid).refine((input) => parseConsoleFacetSchema(input) !== null, labels.facetInvalid),
    reason: z.string().trim().min(10, labels.reasonRequired).max(500, labels.reasonRequired),
  })
}

type NetworkValues = z.infer<ReturnType<typeof networkFormSchema>>

function networkDefaults(network?: NetworkSummary): NetworkValues {
  return {
    slug: network?.slug ?? "",
    name: network?.name ?? "",
    membershipPolicy: network?.membershipPolicy ?? "open",
    defaultVisibility: network?.defaultVisibility ?? "network",
    reachValues: network?.reachValues.join(", ") ?? "",
    openCountries: network?.openCountries?.join(", ") ?? "",
    theme: network?.theme ?? "antsia",
    managedBy: network?.managedBy ?? "generic",
    facetSchema: network?.facetSchema ? JSON.stringify(network.facetSchema, null, 2) : "",
    reason: "",
  }
}

/** Un nouvel instantané ne remplace pas une saisie : seul le geste enregistré réinitialise. */
export function NetworkSettingsForm({ network, canAdmin, onCreated, onDirtyChange, onPendingChange }: { network?: NetworkSummary; canAdmin: boolean; onCreated: (id: Id<"networks">) => void; onDirtyChange: (dirty: boolean) => void; onPendingChange?: (pending: boolean) => void }) {
  const { t } = useTranslation("admin")
  const live = useLiveConsoleForm()
  const create = useMutation(api.modules.networks.networks.create)
  const update = useMutation(api.modules.networks.networks.update)
  const id = useId()
  const saving = useRef(false)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const form = useForm<NetworkValues>({
    defaultValues: networkDefaults(network),
    resolver: zodResolver(networkFormSchema({ invalid: t("networks.invalid"), facetInvalid: t("networks.facetInvalid"), countryInvalid: t("networks.countryInvalid"), reasonRequired: t("networks.reasonRequired") })),
    shouldFocusError: true,
  })
  const { errors, isDirty, isSubmitting } = form.formState
  const readOnly = !canAdmin || network?.status === "archived"
  useEffect(() => { onDirtyChange(isDirty && !readOnly); return () => onDirtyChange(false) }, [isDirty, readOnly, onDirtyChange])
  useEffect(() => { onPendingChange?.(isSubmitting); return () => onPendingChange?.(false) }, [isSubmitting, onPendingChange])
  useEffect(() => { if (errors.root?.server) errorRef.current?.focus() }, [errors.root?.server])
  const submit = async (values: NetworkValues) => {
    if (saving.current || readOnly || !live.current) return
    saving.current = true
    form.clearErrors("root.server")
    setNotice(null)
    const facetSchema = parseConsoleFacetSchema(values.facetSchema)
    if (facetSchema === null) { form.setError("facetSchema", { message: t("networks.facetInvalid") }, { shouldFocus: true }); saving.current = false; return }
    const settings = {
      name: values.name,
      membershipPolicy: values.membershipPolicy,
      defaultVisibility: values.defaultVisibility,
      reachValues: splitConsoleValues(values.reachValues),
      openCountries: splitConsoleValues(values.openCountries),
      theme: values.theme,
      ...(facetSchema ? { facetSchema } : {}),
      reason: values.reason,
    }
    try {
      if (network) {
        await update({ networkId: network._id, ...settings })
        if (!live.current) return
        form.reset({ ...values, reason: "" })
        setNotice(t("networks.saved"))
        toast.success(t("networks.saved"))
      } else {
        const createdId = await create({ ...settings, slug: values.slug, kind: "closed", ...(values.managedBy === "diaspora" ? { managedBy: "diaspora" as const } : {}) })
        if (!live.current) return
        form.reset({ ...values, reason: "" })
        onDirtyChange(false)
        onCreated(createdId)
        toast.success(t("networks.created"))
      }
    } catch (failure: unknown) {
      if (!live.current) return
      const code = engineErrorCode(failure)
      const message = code ? t("errors:" + code) : t("common.actionFailed")
      form.setError("root.server", { message })
      toast.error(message)
    } finally { saving.current = false }
  }
  const field = (key: keyof NetworkValues) => id + "-" + key
  return <form noValidate onSubmit={(event) => { void form.handleSubmit(submit)(event) }} className="space-y-5">
    <header className="space-y-2"><h2 className="text-xl font-semibold">{t(network ? "networks.settings" : "networks.createTitle")}</h2><p className="text-sm text-muted-foreground">{t(readOnly ? "networks.readOnly" : network ? "networks.settingsHint" : "networks.createHint")}</p></header>
    {isDirty && !readOnly ? <p role="status" className="rounded-lg bg-muted p-3 text-sm">{t("networks.unsaved")}</p> : null}
    {notice ? <p role="status" className="rounded-lg bg-muted p-3 text-sm">{notice}</p> : null}
    {errors.root?.server?.message ? <p role="alert" ref={errorRef} tabIndex={-1} className="rounded-lg border border-destructive p-3 text-sm text-destructive">{errors.root.server.message}</p> : null}
    <fieldset disabled={readOnly || isSubmitting} className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
      <Field htmlFor={field("slug")} label={t("networks.fields.slug")} hint={t("networks.slugHint")} error={errors.slug?.message} required><TextInput className={FIELD_CLASS} style={CONTROL_STYLE} id={field("slug")} maxLength={32} readOnly={Boolean(network)} {...form.register("slug")} /></Field>
      <Field htmlFor={field("name")} label={t("networks.fields.name")} error={errors.name?.message} required><TextInput className={FIELD_CLASS} style={CONTROL_STYLE} id={field("name")} maxLength={60} {...form.register("name")} /></Field>
      <Field htmlFor={field("membershipPolicy")} label={t("networks.fields.membershipPolicy")} hint={t("networks.policyHint")} error={errors.membershipPolicy?.message}><Select className={FIELD_CLASS} style={CONTROL_STYLE} id={field("membershipPolicy")} {...form.register("membershipPolicy")}>{(network?.kind === "root" ? ["open"] as const : MEMBERSHIP_POLICIES).map((value) => <option key={value} value={value}>{t("networks.policies." + value)}</option>)}</Select></Field>
      <Field htmlFor={field("defaultVisibility")} label={t("networks.fields.defaultVisibility")} hint={t("networks.visibilityHint")} error={errors.defaultVisibility?.message}><Select className={FIELD_CLASS} style={CONTROL_STYLE} id={field("defaultVisibility")} {...form.register("defaultVisibility")}>{(network?.kind === "root" ? ["network"] as const : CONTENT_VISIBILITIES).map((value) => <option key={value} value={value}>{t("networks.visibilities." + value)}</option>)}</Select></Field>
      <Field htmlFor={field("reachValues")} label={t("networks.fields.reachValues")} hint={t("networks.valuesHint")} error={errors.reachValues?.message}><TextInput className={FIELD_CLASS} style={CONTROL_STYLE} id={field("reachValues")} maxLength={4100} {...form.register("reachValues")} /></Field>
      <Field htmlFor={field("openCountries")} label={t("networks.fields.openCountries")} hint={t("networks.countryHint")} error={errors.openCountries?.message}><TextInput className={FIELD_CLASS} style={CONTROL_STYLE} id={field("openCountries")} maxLength={2000} {...form.register("openCountries")} /></Field>
      <Field htmlFor={field("theme")} label={t("networks.fields.theme")} hint={t("networks.themeHint", { themes: APPLICATION_THEMES.join(", ") })} error={errors.theme?.message}><TextInput className={FIELD_CLASS} style={CONTROL_STYLE} id={field("theme")} maxLength={40} {...form.register("theme")} /></Field>
      {!network ? <Field htmlFor={field("managedBy")} label={t("networks.fields.managedBy")} hint={t("networks.managedHint")}><Select className={FIELD_CLASS} style={CONTROL_STYLE} id={field("managedBy")} {...form.register("managedBy")}><option value="generic">{t("networks.admission.generic")}</option><option value="diaspora">{t("networks.admission.diaspora")}</option></Select></Field> : null}
      <div className="min-w-0 sm:col-span-2"><Field htmlFor={field("facetSchema")} label={t("networks.fields.facetSchema")} hint={t("networks.facetHint")} error={errors.facetSchema?.message}><TextArea className={FIELD_CLASS + " font-mono text-xs"} id={field("facetSchema")} rows={8} maxLength={20_000} {...form.register("facetSchema")} /></Field></div>
      {!readOnly ? <div className="min-w-0 sm:col-span-2"><Field htmlFor={field("reason")} label={t("networks.fields.reason")} hint={t("networks.reasonHint")} error={errors.reason?.message} required><TextArea className={FIELD_CLASS} id={field("reason")} rows={3} maxLength={500} {...form.register("reason")} /></Field></div> : null}
    </fieldset>
    {!readOnly ? <Button type="submit" style={{ minHeight: 44, whiteSpace: "normal" }} disabled={isSubmitting} aria-busy={isSubmitting || undefined}>{t(isSubmitting ? "common.saving" : network ? "networks.save" : "networks.create")}</Button> : null}
  </form>
}

type ArchiveRequest = FunctionReturnType<typeof api.modules.networks.networks.listArchiveRequests>[number]
function ArchiveDecision({ request, personId, now, onDirtyChange, onPendingChange }: { request: ArchiveRequest & { networkId: Id<"networks"> }; personId: Id<"persons">; now: number | null; onDirtyChange: (key: string, dirty: boolean) => void; onPendingChange: (key: string, pending: boolean) => void }) {
  const { t, i18n } = useTranslation("admin")
  const live = useLiveConsoleForm()
  const timeZone = useViewerTimeZone()
  const archive = useMutation(api.modules.networks.networks.archive)
  const cancel = useMutation(api.modules.networks.networks.cancelArchiveRequest)
  const id = useId()
  const pending = useRef(false)
  const form = useForm<{ reason: string }>({ defaultValues: { reason: "" }, resolver: zodResolver(z.object({ reason: z.string().trim().min(10, t("networks.reasonRequired")).max(500, t("networks.reasonRequired")) })) })
  const isDirty = form.formState.isDirty
  useEffect(() => { onDirtyChange(request.archiveRequestId, isDirty); return () => onDirtyChange(request.archiveRequestId, false) }, [request.archiveRequestId, isDirty, onDirtyChange])
  useEffect(() => { onPendingChange(request.archiveRequestId, form.formState.isSubmitting); return () => onPendingChange(request.archiveRequestId, false) }, [request.archiveRequestId, form.formState.isSubmitting, onPendingChange])
  const act = (action: "approve" | "cancel") => form.handleSubmit(async ({ reason }) => {
    if (pending.current || !live.current) return
    pending.current = true
    form.clearErrors("root.server")
    try {
      if (action === "approve") await archive({ networkId: request.networkId, archiveRequestId: request.archiveRequestId, reason })
      else await cancel({ archiveRequestId: request.archiveRequestId, reason })
      if (!live.current) return
      toast.success(t(action === "approve" ? "archive.approved" : "archive.cancelled"))
      form.reset({ reason: "" })
    } catch (failure: unknown) {
      if (!live.current) return
      const code = engineErrorCode(failure)
      const message = code ? t("errors:" + code) : t("common.actionFailed")
      form.setError("root.server", { message })
      toast.error(message)
    } finally { pending.current = false }
  })()
  const expired = now !== null && request.expiresAt <= now
  const isOwn = request.requestedByPersonId === personId
  return <article className="space-y-3 rounded-lg border border-border p-4">
    <p className="text-sm font-medium">{t(expired ? "archive.expired" : isOwn ? "archive.own" : "archive.pending")}</p>
    <p className="break-words text-sm">{request.reason}</p>
    <p className="text-xs text-muted-foreground">{t("archive.expires", { at: new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short", timeZone }).format(request.expiresAt), zone: timeZone })}</p>
    {!expired && (request.canApprove || isOwn) ? <form onSubmit={(event) => event.preventDefault()} noValidate className="space-y-3">
      <Field htmlFor={id} label={t("archive.decisionReason")} error={form.formState.errors.reason?.message} required><TextArea className={FIELD_CLASS} rows={3} maxLength={500} id={id} disabled={form.formState.isSubmitting} {...form.register("reason")} /></Field>
      {form.formState.errors.root?.server?.message ? <p role="alert" className="text-sm text-destructive">{form.formState.errors.root.server.message}</p> : null}
      <div className="flex flex-wrap gap-2">{request.canApprove ? <Button type="button" variant="danger" style={{ minHeight: 44, whiteSpace: "normal" }} disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting || undefined} onClick={() => void act("approve")}>{t("archive.approve")}</Button> : null}{isOwn ? <Button type="button" variant="outline" style={{ minHeight: 44, whiteSpace: "normal" }} disabled={form.formState.isSubmitting} onClick={() => void act("cancel")}>{t("archive.cancel")}</Button> : null}</div>
    </form> : null}
  </article>
}

function ArchivePanel({ network, personId, onDirtyChange, onPendingChange }: { network: NetworkSummary; personId: Id<"persons">; onDirtyChange: (dirty: boolean) => void; onPendingChange: (pending: boolean) => void }) {
  const { t } = useTranslation("admin")
  const live = useLiveConsoleForm()
  const requests = useQuery(api.modules.networks.networks.listArchiveRequests, { networkId: network._id })
  const propose = useMutation(api.modules.networks.networks.requestArchive)
  const id = useId()
  const pending = useRef(false)
  const drafts = useRef(new Set<string>())
  const reportDirty = useCallback((key: string, dirty: boolean) => { if (dirty) drafts.current.add(key); else drafts.current.delete(key); onDirtyChange(drafts.current.size > 0) }, [onDirtyChange])
  const decisions = useRef(new Set<string>())
  const reportPending = useCallback((key: string, value: boolean) => { if (value) decisions.current.add(key); else decisions.current.delete(key); onPendingChange(decisions.current.size > 0) }, [onPendingChange])
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const interval = setInterval(tick, 1000)
    return () => { clearTimeout(first); clearInterval(interval) }
  }, [])
  const form = useForm<{ reason: string }>({ defaultValues: { reason: "" }, resolver: zodResolver(z.object({ reason: z.string().trim().min(10, t("networks.reasonRequired")).max(500, t("networks.reasonRequired")) })) })
  const isDirty = form.formState.isDirty
  useEffect(() => { reportDirty("proposal", isDirty); return () => reportDirty("proposal", false) }, [isDirty, reportDirty])
  useEffect(() => { reportPending("proposal", form.formState.isSubmitting); return () => reportPending("proposal", false) }, [form.formState.isSubmitting, reportPending])
  const submit = async ({ reason }: { reason: string }) => {
    if (pending.current || !live.current) return
    pending.current = true
    form.clearErrors("root.server")
    try { await propose({ networkId: network._id, reason }); if (!live.current) return; form.reset({ reason: "" }); toast.success(t("archive.requested")) }
    catch (failure: unknown) {
      if (!live.current) return
      const code = engineErrorCode(failure)
      const message = code ? t("errors:" + code) : t("common.actionFailed")
      form.setError("root.server", { message }); toast.error(message)
    } finally { pending.current = false }
  }
  if (requests === undefined) return <p role="status">{t("common.loading")}</p>
  const ownPending = requests.some((request) => request.requestedByPersonId === personId && request.expiresAt > (now ?? 0))
  return <section className="space-y-4 border-t border-border pt-6">
    <header className="space-y-2"><h3 className="text-lg font-semibold">{t("archive.title")}</h3><p className="text-sm text-muted-foreground">{t("archive.help")}</p></header>
    {!ownPending ? <form onSubmit={(event) => { void form.handleSubmit(submit)(event) }} noValidate className="space-y-3">
      <Field htmlFor={id} label={t("networks.fields.reason")} error={form.formState.errors.reason?.message} required><TextArea className={FIELD_CLASS} id={id} rows={3} maxLength={500} disabled={form.formState.isSubmitting} {...form.register("reason")} /></Field>
      {form.formState.errors.root?.server?.message ? <p role="alert" className="text-sm text-destructive">{form.formState.errors.root.server.message}</p> : null}
      <Button type="submit" variant="outline" style={{ minHeight: 44, whiteSpace: "normal" }} disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting || undefined}>{t("archive.request")}</Button>
    </form> : null}
    {requests.length === 0 ? <p className="text-sm text-muted-foreground">{t("archive.empty")}</p> : requests.map((request) => <ArchiveDecision key={request.archiveRequestId} request={{ ...request, networkId: network._id }} personId={personId} now={now} onDirtyChange={reportDirty} onPendingChange={reportPending} />)}
  </section>
}

function NetworksPanel({ networks, operator, onSelect, onDirtyChange, onPendingChange }: { networks: NetworkSummary[]; operator: ConsoleOperator; onSelect: (id: Id<"networks">) => void; onDirtyChange: (dirty: boolean) => void; onPendingChange: (pending: boolean) => void }) {
  const { t } = useTranslation("admin")
  const [editingId, setEditingId] = useState<Id<"networks"> | "new" | null>(null)
  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState(false)
  const decisions = useRef(new Set<string>())
  const reportPending = useCallback((key: string, value: boolean) => { if (value) decisions.current.add(key); else decisions.current.delete(key); const any = decisions.current.size > 0; setPending(any); onPendingChange(any) }, [onPendingChange])
  const updatePending = useCallback((value: boolean) => reportPending("settings", value), [reportPending])
  const updateArchivePending = useCallback((value: boolean) => reportPending("archive", value), [reportPending])
  const drafts = useRef(new Set<string>())
  const reportDirty = useCallback((key: string, value: boolean) => { if (value) drafts.current.add(key); else drafts.current.delete(key); const any = drafts.current.size > 0; setDirty(any); onDirtyChange(any) }, [onDirtyChange])
  const updateDirty = useCallback((value: boolean) => reportDirty("settings", value), [reportDirty])
  const updateArchiveDirty = useCallback((value: boolean) => reportDirty("archive", value), [reportDirty])
  const edited = editingId && editingId !== "new" ? networks.find((network) => network._id === editingId) : undefined
  const canAdmin = operator.role === "platform_admin"
  const change = (next: Id<"networks"> | "new" | null) => {
    if (pending) return
    if (dirty && !window.confirm(t("networks.leaveConfirm"))) return
    drafts.current.clear(); updateDirty(false); setEditingId(next)
  }
  if (editingId !== null) return <section className="space-y-5 rounded-xl border border-border bg-card p-4 sm:p-6">
    <Button variant="ghost" style={CONTROL_STYLE} disabled={pending} onClick={() => change(null)}><ArrowLeft className="size-4" aria-hidden="true" />{t("networks.back")}</Button>
    {editingId !== "new" && !edited ? <p role="alert">{t("networks.unavailable")}</p> : <NetworkSettingsForm key={editingId} network={edited} canAdmin={canAdmin} onDirtyChange={updateDirty} onPendingChange={updatePending} onCreated={(id) => { onSelect(id); setEditingId(null) }} />}
    {edited?.status === "active" && edited.kind === "closed" && canAdmin ? <ConsoleQueryBoundary fallback={(error, retry) => <QueryFailure error={error} retry={retry} />}><ArchivePanel network={edited} personId={operator.personId} onDirtyChange={updateArchiveDirty} onPendingChange={updateArchivePending} /></ConsoleQueryBoundary> : null}
  </section>
  return <section className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div className="space-y-2"><h2 className="text-2xl">{t("sections.networks")}</h2><p className="max-w-2xl text-sm text-muted-foreground">{t("networks.lead")}</p></div>{canAdmin ? <Button style={CONTROL_STYLE} onClick={() => change("new")}><Plus className="size-4" aria-hidden="true" />{t("networks.create")}</Button> : null}</header>
    {networks.length === 0 ? <p role="status" className="rounded-xl border border-border bg-card p-5">{t("networks.empty")}</p> : <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">{networks.map((network) => <article key={network._id} className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <header className="flex items-start gap-3"><Globe2 aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted-foreground" /><div className="min-w-0"><h3 className="break-words text-lg font-semibold">{network.name}</h3><p className="break-all text-sm text-muted-foreground">{network.slug}</p></div></header>
      <dl className="grid grid-cols-1 gap-2 text-sm"><div><dt className="text-muted-foreground">{t("networks.fields.status")}</dt><dd>{t("networks.statuses." + network.status)}</dd></div><div><dt className="text-muted-foreground">{t("networks.fields.membershipPolicy")}</dt><dd>{t("networks.policies." + network.membershipPolicy)}</dd></div><div><dt className="text-muted-foreground">{t("networks.fields.defaultVisibility")}</dt><dd>{t("networks.visibilities." + network.defaultVisibility)}</dd></div></dl>
      {network.managedBy ? <p className="text-xs text-muted-foreground">{t("networks.admission.diaspora")}</p> : null}
      <Button variant="outline" className="mt-auto" style={{ minHeight: 44, whiteSpace: "normal" }} onClick={() => { onSelect(network._id); change(network._id) }}>{t(canAdmin && network.status === "active" ? "networks.manage" : "networks.view")}</Button>
    </article>)}</div>}
    {networks.length >= 200 ? <p className="text-sm text-muted-foreground">{t("networks.bounded")}</p> : null}
  </section>
}

/** Cette fonction ne s'exécute qu'après l'admission de ConsoleSession. */
function AdmittedWorkspace({ operator }: { operator: ConsoleOperator }) {
  const { t } = useTranslation("admin")
  const networks = useQuery(api.modules.networks.networks.listForConsole, {})
  const [section, setSection] = useState<Section>("networks")
  const [selectedId, setSelectedId] = useState("")
  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState(false)
  const [locationReady, setLocationReady] = useState(false)
  const locationInitialised = useRef(false)
  const allowDocumentExit = useRef(false)
  const contentRef = useRef<HTMLDivElement>(null)
  // Aucun paramètre brut n'est jamais converti en Id, ni envoyé à une requête.
  const selected = networks?.find((network) => network._id === selectedId)

  useEffect(() => {
    if (networks === undefined || locationInitialised.current) return
    locationInitialised.current = true
    const requested = readConsoleState(window.location.search)
    const canonicalId = requested.networkId ? networks.find((network) => network._id === requested.networkId)?._id ?? "" : networks.find((network) => network.status === "active")?._id ?? networks[0]?._id ?? ""
    setSection(requested.section)
    setSelectedId(canonicalId)
    setLocationReady(true)
    window.history.replaceState(window.history.state, "", routes.consoleState(requested.section, canonicalId || undefined))
    if (requested.networkId && !canonicalId) toast.error(t("networks.unavailable"))
  }, [networks, t])

  useEffect(() => { if (locationReady) contentRef.current?.focus() }, [section, locationReady])

  useEffect(() => {
    if (!locationReady) return
    const onPopState = () => {
      const requested = readConsoleState(window.location.search)
      const leavingPage = window.location.pathname !== routes.home()
      const canonicalId = requested.networkId ? networks?.find((network) => network._id === requested.networkId)?._id ?? "" : ""
      const changing = leavingPage || requested.section !== section || canonicalId !== selectedId
      if (changing && (pending || (dirty && !window.confirm(t("networks.leaveConfirm"))))) {
        window.history.pushState(window.history.state, "", routes.consoleState(section, selectedId || undefined))
        return
      }
      if (!changing) return
      setDirty(false)
      if (leavingPage) return
      setSection(requested.section)
      setSelectedId(canonicalId)
      if (requested.networkId && !canonicalId) toast.error(t("networks.unavailable"))
      window.history.replaceState(window.history.state, "", routes.consoleState(requested.section, canonicalId || undefined))
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [dirty, pending, section, selectedId, locationReady, networks, t])

  useEffect(() => {
    if (!dirty && !pending) return
    allowDocumentExit.current = false
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (isSigningOutEverywhere() || allowDocumentExit.current) return
      event.preventDefault()
      event.returnValue = ""
    }
    const leaveLink = (event: MouseEvent) => {
      if (isSigningOutEverywhere() || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      if (!(event.target instanceof Element)) return
      const link = event.target.closest<HTMLAnchorElement>("a[href]")
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return
      let target: URL
      try { target = new URL(link.href, window.location.href) } catch { return }
      if (target.origin === window.location.origin && target.pathname === window.location.pathname && target.search === window.location.search) return
      if (pending || !window.confirm(t("networks.leaveConfirm"))) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      allowDocumentExit.current = true
      setDirty(false)
    }
    window.addEventListener("beforeunload", beforeUnload)
    document.addEventListener("click", leaveLink, true)
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", leaveLink, true) }
  }, [dirty, pending, t])

  const navigate = (nextSection: Section, nextId: string) => {
    window.history.pushState(window.history.state, "", routes.consoleState(nextSection, nextId || undefined))
    setDirty(false)
    setSection(nextSection)
    setSelectedId(nextId)
  }
  const changeSection = (next: Section) => {
    if (next === section) return
    if (pending) return
    if (dirty && !window.confirm(t("networks.leaveConfirm"))) return
    navigate(next, selectedId)
  }
  const changeNetwork = (nextId: string) => {
    if (nextId === selectedId || !networks?.some((network) => network._id === nextId)) return
    if (pending) return
    if (dirty && !window.confirm(t("networks.leaveConfirm"))) return
    navigate(section, nextId)
  }
  if (networks === undefined || !locationReady) return <p role="status">{t("common.loading")}</p>
  return <div className="grid min-w-0 gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
    {pending ? <p role="status" className="rounded-lg border border-border bg-muted p-3 text-sm lg:col-span-2">{t("common.pendingNavigation")}</p> : null}
    <aside className="space-y-4"><nav aria-label={t("console.navigation")} className="hidden flex-col gap-1 lg:flex">{SECTIONS.map((item) => <button key={item} type="button" disabled={pending} onClick={() => changeSection(item)} aria-current={item === section ? "page" : undefined} className={"min-h-11 rounded-lg px-3 py-2 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 " + (section === item ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{t("sections." + item)}</button>)}</nav><div className="lg:hidden"><Field label={t("console.navigation")}><Select style={CONTROL_STYLE} className={FIELD_CLASS} value={section} disabled={pending} onChange={(event) => { const next = SECTIONS.find((value) => value === event.target.value); if (next) changeSection(next) }}>{SECTIONS.map((item) => <option key={item} value={item}>{t("sections." + item)}</option>)}</Select></Field></div>{section !== "networks" ? <><Field label={t("console.network")}><Select style={CONTROL_STYLE} className={FIELD_CLASS} value={selected?._id ?? ""} disabled={pending} onChange={(event) => changeNetwork(event.target.value)}><option value="" disabled>{t("console.selectNetwork")}</option>{networks.map((network) => <option key={network._id} value={network._id}>{network.name + (network.status === "archived" ? " · " + t("networks.statuses.archived") : "")}</option>)}</Select></Field><p className="text-xs text-muted-foreground">{t("console.networkHint")}</p></> : null}</aside>
    <div ref={contentRef} tabIndex={-1} role="region" aria-label={t("sections." + section)} className="min-w-0 focus-visible:outline-2 focus-visible:outline-offset-4">
      <ConsoleQueryBoundary key={section} fallback={(error, retry) => <QueryFailure error={error} retry={retry} />}>{section === "networks" ? <NetworksPanel networks={networks} operator={operator} onSelect={(id) => navigate(section, id)} onDirtyChange={setDirty} onPendingChange={setPending} /> : <OperationsPanel section={section} networkId={selected?._id} canAdmin={operator.role === "platform_admin"} onDirtyChange={setDirty} onPendingChange={setPending} />}</ConsoleQueryBoundary>
    </div>
  </div>
}

export function ConsoleDashboard({ operator, sessionExit }: { operator: ConsoleOperator; sessionExit: ReactNode }) {
  const { t } = useTranslation("admin")
  return <main id="contenu" className="mx-auto flex min-h-dvh w-full max-w-[96rem] flex-col gap-6 px-3 py-5 sm:px-6 lg:px-8">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5"><div className="min-w-0 space-y-2"><p className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground"><ShieldCheck aria-hidden="true" className="size-4" />{t("home.eyebrow")}</p><h1 className="break-words text-2xl sm:text-3xl">{t("home.title")}</h1><p className="text-sm text-muted-foreground">{t("console.role." + operator.role)}{operator.displayName ? " · " + operator.displayName : ""}</p></div>{sessionExit}</header>
    <ConsoleQueryBoundary fallback={(error, retry) => <QueryFailure error={error} retry={retry} />}><AdmittedWorkspace operator={operator} /></ConsoleQueryBoundary>
    <footer className="mt-auto border-t border-border pt-4"><Link className="inline-flex min-h-11 items-center rounded-md text-sm underline focus-visible:outline-2 focus-visible:outline-offset-4" href={routes.health()}>{t("home.healthLink")}</Link></footer>
  </main>
}
