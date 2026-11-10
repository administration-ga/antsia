"use client"

/**
 * PG-01 (plan 07, plan 13) — reprendre une page depuis la console : trois onglets sur la fiche
 * d'une page de la liste — Confiance (`pages.admin.setPageTrust`), Adresse (`setPageHandle`) et
 * Administrateur de secours (`grantRescuePageAdmin`, état lu par `pageGovernance`). Chaque geste
 * est une décision motivée (dix caractères au moins, la borne du moteur), confirmée avant l'envoi,
 * que le moteur inscrit au journal des décisions. Un opérateur lecteur voit, sans agir.
 */
import { api, type Id } from "@antsia/api/engine"
import { isTrustAllowedForOwner, PAGE_TRUST_LEVELS, type PageOwnerKind, type PageTrust } from "@antsia/social-domain/badges"
import { Button, Field, Select, TextArea, TextInput } from "@antsia/ui"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery } from "convex/react"
import { Search } from "lucide-react"
import { useId, useRef, useState, type KeyboardEvent } from "react"
import { useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { ConsoleQueryBoundary, controlStyle, inputStyle, LoadingRows, OperationFailure, operationError, reasonSchema, useOperation, useOperationDraft, useOperationDraftGuard } from "./console-operation-controls"

/** Même borne que le moteur (`assertDecisionReason(reason, 10)` des gestes de console sur les pages). */
const GOVERNANCE_REASON_MIN = 10
const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u

export type GovernedPage = { pageId: Id<"pages">; networkId: Id<"networks">; handle: string; name: string; ownerKind: PageOwnerKind; trust: PageTrust; status: "active" | "inactive" }

export const GOVERNANCE_TABS = ["trust", "handle", "rescue"] as const
type GovernanceTab = (typeof GOVERNANCE_TABS)[number]

/** Les onglets de gouvernance d'une page : changer d'onglet ne perd aucun brouillon sans accord. */
export function PageGovernancePanel({ page, canAdmin }: { page: GovernedPage; canAdmin: boolean }) {
  const { t } = useTranslation("operations")
  const id = useId()
  const [tab, setTab] = useState<GovernanceTab>("trust")
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const canChange = useOperationDraftGuard()
  const select = (next: GovernanceTab) => { if (next !== tab && canChange()) setTab(next) }
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return
    event.preventDefault()
    const nextIndex = (index + (event.key === "ArrowRight" ? 1 : GOVERNANCE_TABS.length - 1)) % GOVERNANCE_TABS.length
    const next = GOVERNANCE_TABS[nextIndex]!
    if (next !== tab && canChange()) { setTab(next); tabs.current[nextIndex]?.focus() }
  }
  return <section aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-4 rounded-lg border border-border p-3 sm:p-4">
    <h4 id={`${id}-title`} className="break-words font-semibold">{t("pages.governance.title", { name: page.name })}</h4>
    <div role="tablist" aria-label={t("pages.governance.tabs")} className="flex flex-wrap gap-2">
      {GOVERNANCE_TABS.map((value, index) => <Button
        key={value}
        ref={(node) => { tabs.current[index] = node }}
        type="button"
        role="tab"
        id={`${id}-tab-${value}`}
        aria-selected={tab === value}
        aria-controls={`${id}-panel`}
        tabIndex={tab === value ? 0 : -1}
        variant={tab === value ? "primary" : "outline"}
        style={controlStyle}
        onClick={() => select(value)}
        onKeyDown={(event) => keyboard(event, index)}
      >{t(`pages.governance.tab.${value}`)}</Button>)}
    </div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tab}`} className="flex min-w-0 flex-col gap-4">
      {!canAdmin ? <p className="text-sm text-muted-foreground">{t("common.adminRequired")}</p> : null}
      {tab === "trust" ? <TrustForm key={`trust:${page.trust}`} page={page} canAdmin={canAdmin} /> : tab === "handle" ? <HandleForm key={`handle:${page.handle}`} page={page} canAdmin={canAdmin} /> : <ConsoleQueryBoundary fallback={(error, retry) => <div role="alert" className="flex flex-col gap-2 rounded-lg border border-destructive p-3 text-sm"><p>{t("pages.governance.rescue.failed")}</p><p className="text-muted-foreground">{operationError(error, t)}</p><Button variant="outline" style={controlStyle} onClick={retry}>{t("pages.governance.retry")}</Button></div>}><RescuePanel page={page} canAdmin={canAdmin} /></ConsoleQueryBoundary>}
    </div>
  </section>
}

type TrustValues = { trust: PageTrust; reason: string }

/** Confiance : « Officiel » n'est proposé qu'à une institution ; le badge affiché en découle. */
function TrustForm({ page, canAdmin }: { page: GovernedPage; canAdmin: boolean }) {
  const { t } = useTranslation("operations")
  const id = useId()
  const setTrust = useMutation(api.modules.pages.admin.setPageTrust)
  const operation = useOperation()
  const options = PAGE_TRUST_LEVELS.filter((level) => isTrustAllowedForOwner(page.ownerKind, level))
  const form = useForm<TrustValues>({ resolver: zodResolver(z.object({
    trust: z.enum(PAGE_TRUST_LEVELS).refine((value) => isTrustAllowedForOwner(page.ownerKind, value) && value !== page.trust, t("pages.governance.trust.unchanged")),
    reason: reasonSchema(t("common.reasonInvalid", { min: GOVERNANCE_REASON_MIN }), GOVERNANCE_REASON_MIN),
  })), defaultValues: { trust: page.trust, reason: "" } })
  useOperationDraft(form.formState.isDirty || operation.pending, operation.pending)
  const submit = async (values: TrustValues) => {
    if (!canAdmin || !window.confirm(t("pages.governance.trust.confirm", { trust: t(`pages.trust.${values.trust}`) }))) return
    const saved = await operation.run(() => setTrust({ pageId: page.pageId, trust: values.trust, reason: values.reason }), "pages.governance.trust.saved")
    if (saved) form.reset({ trust: values.trust, reason: "" })
  }
  return <form noValidate className="flex min-w-0 flex-col gap-3" aria-busy={operation.pending || undefined} onSubmit={(event) => { void form.handleSubmit(submit)(event) }}>
    <p className="text-sm">{t("pages.governance.trust.current", { trust: t(`pages.trust.${page.trust}`) })}</p>
    <fieldset disabled={!canAdmin || operation.pending} className="flex min-w-0 flex-col gap-3">
      <Field htmlFor={`${id}-trust`} label={t("pages.governance.trust.label")} hint={t("pages.governance.trust.hint")} error={form.formState.errors.trust?.message}>
        <Select id={`${id}-trust`} style={inputStyle} {...form.register("trust")}>{options.map((level) => <option key={level} value={level}>{t(`pages.trust.${level}`)}</option>)}</Select>
      </Field>
      <Field htmlFor={`${id}-reason`} label={t("common.reason")} required hint={t("common.reasonHint")} error={form.formState.errors.reason?.message}><TextArea id={`${id}-reason`} maxLength={500} {...form.register("reason")} /></Field>
    </fieldset>
    <OperationFailure message={operation.error} />
    <Button type="submit" style={controlStyle} disabled={!canAdmin || operation.pending}>{t(operation.pending ? "common.saving" : "pages.governance.trust.submit")}</Button>
  </form>
}

type HandleValues = { handle: string; reason: string }

/** Adresse : l'ancienne n'est ni réservée ni redirigée — l'écran le dit avant la décision. */
function HandleForm({ page, canAdmin }: { page: GovernedPage; canAdmin: boolean }) {
  const { t } = useTranslation("operations")
  const id = useId()
  const setHandle = useMutation(api.modules.pages.admin.setPageHandle)
  const operation = useOperation()
  const form = useForm<HandleValues>({ resolver: zodResolver(z.object({
    handle: z.string().trim().min(3, t("pages.handleInvalid")).max(60, t("pages.handleInvalid")).regex(HANDLE_PATTERN, t("pages.handleInvalid")).refine((value) => value !== page.handle, t("pages.governance.handle.unchanged")),
    reason: reasonSchema(t("common.reasonInvalid", { min: GOVERNANCE_REASON_MIN }), GOVERNANCE_REASON_MIN),
  })), defaultValues: { handle: "", reason: "" } })
  useOperationDraft(form.formState.isDirty || operation.pending, operation.pending)
  const submit = async (values: HandleValues) => {
    const handle = values.handle.trim()
    if (!canAdmin || !window.confirm(t("pages.governance.handle.confirm", { previous: page.handle, handle }))) return
    const saved = await operation.run(() => setHandle({ pageId: page.pageId, handle, reason: values.reason }), "pages.governance.handle.saved")
    if (saved) form.reset({ handle: "", reason: "" })
  }
  return <form noValidate className="flex min-w-0 flex-col gap-3" aria-busy={operation.pending || undefined} onSubmit={(event) => { void form.handleSubmit(submit)(event) }}>
    <p className="break-words text-sm">{t("pages.governance.handle.current", { handle: page.handle })}</p>
    <p className="rounded-lg border border-border bg-muted p-3 text-sm">{t("pages.governance.handle.warning")}</p>
    <fieldset disabled={!canAdmin || operation.pending} className="flex min-w-0 flex-col gap-3">
      <Field htmlFor={`${id}-handle`} label={t("pages.governance.handle.label")} required error={form.formState.errors.handle?.message}><TextInput id={`${id}-handle`} style={inputStyle} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={60} {...form.register("handle")} /></Field>
      <Field htmlFor={`${id}-reason`} label={t("common.reason")} required hint={t("common.reasonHint")} error={form.formState.errors.reason?.message}><TextArea id={`${id}-reason`} maxLength={500} {...form.register("reason")} /></Field>
    </fieldset>
    <OperationFailure message={operation.error} />
    <Button type="submit" variant="danger" style={controlStyle} disabled={!canAdmin || operation.pending}>{t(operation.pending ? "common.saving" : "pages.governance.handle.submit")}</Button>
  </form>
}

/** L'état de gouvernance d'abord : le secours n'est proposé qu'à une page sans administrateur actif. */
function RescuePanel({ page, canAdmin }: { page: GovernedPage; canAdmin: boolean }) {
  const { t } = useTranslation("operations")
  const governance = useQuery(api.modules.pages.admin.pageGovernance, { pageId: page.pageId })
  if (governance === undefined) return <LoadingRows />
  if (governance === null) return <p role="status" className="text-sm text-muted-foreground">{t("pages.governance.rescue.unknown")}</p>
  if (governance.federated) return <p role="status" className="text-sm">{t("pages.governance.rescue.federated")}</p>
  return <div className="flex min-w-0 flex-col gap-3">
    <p className="text-sm text-muted-foreground">{t("pages.governance.rescue.lead")}</p>
    <p role="status" className="text-sm font-medium">{governance.liveAdmins > 0 ? t("pages.governance.rescue.liveAdmins", { count: governance.liveAdmins }) : t("pages.governance.rescue.none")}</p>
    {governance.pendingAdmins > 0 ? <p className="text-sm">{t("pages.governance.rescue.pending", { count: governance.pendingAdmins })}</p> : null}
    {page.status !== "active" ? <p className="text-sm">{t("pages.governance.rescue.inactive")}</p> : governance.liveAdmins === 0 ? <RescueForm page={page} canAdmin={canAdmin} /> : null}
  </div>
}

type FindValues = { handle: string }
type RescueValues = { reason: string }

/** Trouver le membre par son identifiant dans le réseau de la page, puis le désigner, motif à l'appui. */
function RescueForm({ page, canAdmin }: { page: GovernedPage; canAdmin: boolean }) {
  const { t } = useTranslation("operations")
  const id = useId()
  const [searched, setSearched] = useState<string | null>(null)
  const grant = useMutation(api.modules.pages.admin.grantRescuePageAdmin)
  const operation = useOperation()
  const finder = useForm<FindValues>({ resolver: zodResolver(z.object({ handle: z.string().trim().transform((value) => value.replace(/^@/u, "")).pipe(z.string().min(1, t("teams.handleInvalid")).max(64, t("teams.handleInvalid"))) })), defaultValues: { handle: "" } })
  const current = useWatch({ control: finder.control, name: "handle", defaultValue: "" }).trim().replace(/^@/u, "")
  const member = useQuery(api.modules.platform.console.findMember, canAdmin && searched !== null && current === searched ? { networkId: page.networkId, handle: searched } : "skip")
  const form = useForm<RescueValues>({ resolver: zodResolver(z.object({ reason: reasonSchema(t("common.reasonInvalid", { min: GOVERNANCE_REASON_MIN }), GOVERNANCE_REASON_MIN) })), defaultValues: { reason: "" } })
  useOperationDraft(form.formState.isDirty || operation.pending, operation.pending)
  const name = member ? member.displayName ?? t("teams.neutralMember") : ""
  const submit = async (values: RescueValues) => {
    if (!canAdmin || !member || !window.confirm(t("pages.governance.rescue.confirm", { name }))) return
    const saved = await operation.run(() => grant({ pageId: page.pageId, personId: member.personId, reason: values.reason }), null, (result) => {
      toast.success(t(result.invited ? "pages.governance.rescue.invited" : "pages.governance.rescue.promoted"))
    })
    if (saved) { form.reset({ reason: "" }); finder.reset({ handle: "" }); setSearched(null) }
  }
  return <div className="flex min-w-0 flex-col gap-3">
    <form noValidate className="flex min-w-0 flex-col gap-3" onSubmit={(event) => { void finder.handleSubmit(({ handle }) => setSearched(handle))(event) }}>
      <fieldset disabled={!canAdmin || operation.pending} className="flex min-w-0 flex-col gap-3">
        <Field htmlFor={`${id}-member`} label={t("pages.governance.rescue.handle")} hint={t("pages.governance.rescue.handleHint")} error={finder.formState.errors.handle?.message}><TextInput id={`${id}-member`} style={inputStyle} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={64} {...finder.register("handle")} /></Field>
      </fieldset>
      <Button type="submit" variant="outline" style={controlStyle} disabled={!canAdmin || operation.pending}><Search size={16} aria-hidden="true" />{t("pages.governance.rescue.find")}</Button>
    </form>
    {searched !== null && current === searched ? member === undefined ? <LoadingRows /> : member === null ? <p role="status" className="text-sm text-muted-foreground">{t("pages.governance.rescue.notFound")}</p> : <form noValidate className="flex min-w-0 flex-col gap-3" aria-label={t("pages.governance.rescue.designate")} aria-busy={operation.pending || undefined} onSubmit={(event) => { void form.handleSubmit(submit)(event) }}>
      <p className="break-words text-sm">{name} {member.handle ? t("teams.memberHandle", { handle: member.handle }) : null}</p>
      <fieldset disabled={!canAdmin || operation.pending} className="flex min-w-0 flex-col gap-3">
        <Field htmlFor={`${id}-reason`} label={t("common.reason")} required hint={t("common.reasonHint")} error={form.formState.errors.reason?.message}><TextArea id={`${id}-reason`} maxLength={500} {...form.register("reason")} /></Field>
      </fieldset>
      <OperationFailure message={operation.error} />
      <Button type="submit" style={controlStyle} disabled={!canAdmin || operation.pending}>{t(operation.pending ? "common.saving" : "pages.governance.rescue.designate")}</Button>
    </form> : null}
  </div>
}
