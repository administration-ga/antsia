"use client"

/**
 * MC-02 — le réglage de modération d'un réseau depuis la console : par surface, la relecture préalable,
 * le plafond de liens et la cadence ; puis les mots bloqués (ajout, retrait). Même projection et mêmes
 * bornes que l'onglet « Réglages » de l'administrateur du réseau ; chaque décision de l'opérateur est
 * motivée et inscrite au journal à sa qualité.
 */
import { api, type Id } from "@antsia/api/engine"
import { admissibleBlockedTerm, BLOCKED_TERM_LENGTH, BLOCKED_TERMS_ACTIVE_MAX, MODERATION_POLICY_BOUNDS, type ModerationSurface } from "@antsia/social-domain/moderationPolicy"
import { Button, Field, Select, TextArea, TextInput } from "@antsia/ui"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { ShieldAlert } from "lucide-react"
import { useId, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { ConsoleDate, controlStyle, EmptyRows, inputStyle, LoadingRows, MotiveAction, OperationFailure, panelClass, reasonSchema, useOperation, useOperationDraft, useOperationDraftGuard, useWindowCursor, WindowPagination } from "./console-operation-controls"

type Settings = FunctionReturnType<typeof api.modules.platform.console.moderationPolicies>
type SurfaceRow = Settings["surfaces"][number]
type PolicyValues = { preReview: boolean; maxLinks: number; maxWrites: number; windowSeconds: number; reason: string }
const bounds = MODERATION_POLICY_BOUNDS

function whole(min: number, max: number, message: string) {
  return z.number({ invalid_type_error: message, required_error: message }).int(message).min(min, message).max(max, message)
}

function PolicyForm({ networkId, row, defaults }: { networkId: Id<"networks">; row: SurfaceRow; defaults: Settings["defaults"] }) {
  const { t } = useTranslation("operations")
  const id = useId()
  const save = useMutation(api.modules.platform.console.setModerationPolicy)
  const operation = useOperation()
  const initial = row.policy ?? defaults
  const form = useForm<PolicyValues>({
    resolver: zodResolver(z.object({
      preReview: z.boolean(),
      maxLinks: whole(bounds.maxLinks.min, bounds.maxLinks.max, t("moderationPolicy.numberInvalid", { min: bounds.maxLinks.min, max: bounds.maxLinks.max })),
      maxWrites: whole(bounds.maxWrites.min, bounds.maxWrites.max, t("moderationPolicy.numberInvalid", { min: bounds.maxWrites.min, max: bounds.maxWrites.max })),
      windowSeconds: whole(bounds.windowMs.min / 1000, bounds.windowMs.max / 1000, t("moderationPolicy.numberInvalid", { min: bounds.windowMs.min / 1000, max: bounds.windowMs.max / 1000 })),
      reason: reasonSchema(t("common.reasonInvalid", { min: 3 })),
    })),
    defaultValues: { preReview: initial.preReview, maxLinks: initial.maxLinks, maxWrites: initial.maxWrites, windowSeconds: Math.round(initial.windowMs / 1000), reason: "" },
  })
  useOperationDraft(form.formState.isDirty || form.formState.isSubmitting || operation.pending, operation.pending)
  const errors = form.formState.errors
  const submit = async (values: PolicyValues) => {
    const saved = await operation.run(() => save({ networkId, surface: row.surface, preReview: values.preReview, maxLinks: values.maxLinks, maxWrites: values.maxWrites, windowMs: values.windowSeconds * 1000, reason: values.reason.trim() }))
    if (saved) form.reset({ ...values, reason: "" })
  }
  const status = row.policy
    ? <>{t("moderationPolicy.explicit")} <ConsoleDate at={row.policy.updatedAt} /></>
    : t(row.withoutPolicy === "held" ? "moderationPolicy.withoutHeld" : row.withoutPolicy === "unchecked" ? "moderationPolicy.withoutUnchecked" : "moderationPolicy.withoutDefaults", { review: t(defaults.preReview ? "moderationPolicy.reviewOn" : "moderationPolicy.reviewOff"), links: defaults.maxLinks, writes: defaults.maxWrites, seconds: Math.round(defaults.windowMs / 1000) })
  return <form className="flex min-w-0 flex-col gap-4" noValidate aria-label={t("moderationPolicy.formLabel", { surface: t(`surfaces.${row.surface}`) })} aria-busy={operation.pending || undefined} onSubmit={(event) => { void form.handleSubmit(submit)(event) }}>
    <p role="status" className="text-sm">{status}</p>
    <fieldset disabled={operation.pending} className="flex min-w-0 flex-col gap-4">
      <label className="flex min-h-11 items-center gap-3" htmlFor={`${id}-preReview`}><input id={`${id}-preReview`} type="checkbox" className="h-5 w-5" {...form.register("preReview")} />{t("moderationPolicy.preReview")}</label>
      <div className="grid min-w-0 gap-4 sm:grid-cols-3">
        <Field htmlFor={`${id}-maxLinks`} label={t("moderationPolicy.maxLinks")} hint={t("moderationPolicy.maxLinksHint")} error={errors.maxLinks?.message}><TextInput id={`${id}-maxLinks`} type="number" inputMode="numeric" min={bounds.maxLinks.min} max={bounds.maxLinks.max} step={1} style={inputStyle} {...form.register("maxLinks", { valueAsNumber: true })} /></Field>
        <Field htmlFor={`${id}-maxWrites`} label={t("moderationPolicy.maxWrites")} hint={t("moderationPolicy.maxWritesHint")} error={errors.maxWrites?.message}><TextInput id={`${id}-maxWrites`} type="number" inputMode="numeric" min={bounds.maxWrites.min} max={bounds.maxWrites.max} step={1} style={inputStyle} {...form.register("maxWrites", { valueAsNumber: true })} /></Field>
        <Field htmlFor={`${id}-windowSeconds`} label={t("moderationPolicy.window")} hint={t("moderationPolicy.windowHint")} error={errors.windowSeconds?.message}><TextInput id={`${id}-windowSeconds`} type="number" inputMode="numeric" min={bounds.windowMs.min / 1000} max={bounds.windowMs.max / 1000} step={1} style={inputStyle} {...form.register("windowSeconds", { valueAsNumber: true })} /></Field>
      </div>
      <Field htmlFor={`${id}-reason`} label={t("common.reason")} required hint={t("common.reasonHint")} error={errors.reason?.message}><TextArea id={`${id}-reason`} maxLength={500} {...form.register("reason")} /></Field>
    </fieldset>
    <OperationFailure message={operation.error} />
    <Button type="submit" style={controlStyle} disabled={operation.pending}>{t(operation.pending ? "common.saving" : "moderationPolicy.save")}</Button>
  </form>
}

function PolicySection({ networkId, settings }: { networkId: Id<"networks">; settings: Settings }) {
  const { t } = useTranslation("operations")
  const id = useId()
  const canChange = useOperationDraftGuard()
  const [surface, setSurface] = useState<ModerationSurface>(settings.surfaces[0]?.surface ?? "post")
  const row = settings.surfaces.find((item) => item.surface === surface)
  const configured = settings.surfaces.filter((item) => item.policy !== null)
  return <section className={`${panelClass} flex min-w-0 flex-col gap-4`} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className="flex items-center gap-2 text-xl font-semibold"><ShieldAlert size={22} aria-hidden="true" />{t("moderationPolicy.title")}</h2>
    <p className="text-sm text-muted-foreground">{t("moderationPolicy.lead")}</p>
    <p className="text-sm text-muted-foreground">{t("moderationPolicy.exceptions")}</p>
    <Field htmlFor={`${id}-surface`} label={t("moderationPolicy.surface")}><Select id={`${id}-surface`} style={inputStyle} value={surface} onChange={(event) => {
      const next = settings.surfaces.find((item) => item.surface === event.target.value)?.surface
      if (next && canChange()) setSurface(next)
    }}>{settings.surfaces.map((item) => <option key={item.surface} value={item.surface}>{t(`surfaces.${item.surface}`)}{item.policy ? t("moderationPolicy.configuredSuffix") : ""}</option>)}</Select></Field>
    {row ? <PolicyForm key={`${row.surface}:${row.policy?.updatedAt ?? "none"}`} networkId={networkId} row={row} defaults={settings.defaults} /> : null}
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <h3 className="font-semibold">{t("moderationPolicy.configuredTitle")}</h3>
      {configured.length === 0 ? <p role="status" className="text-sm text-muted-foreground">{t("moderationPolicy.noneConfigured")}</p> : <ul className="flex flex-col gap-1 text-sm">{configured.map((item) => item.policy ? <li key={item.surface} className="break-words">{t("moderationPolicy.summary", { surface: t(`surfaces.${item.surface}`), review: t(item.policy.preReview ? "moderationPolicy.reviewOn" : "moderationPolicy.reviewOff"), links: item.policy.maxLinks, writes: item.policy.maxWrites, seconds: Math.round(item.policy.windowMs / 1000) })}</li> : null)}</ul>}
    </div>
  </section>
}

function AddTerm({ networkId }: { networkId: Id<"networks"> }) {
  const { t } = useTranslation("operations")
  const id = useId()
  const setTerm = useMutation(api.modules.platform.console.setBlockedTerm)
  const operation = useOperation()
  const termMessage = t("moderationPolicy.termInvalid", { min: BLOCKED_TERM_LENGTH.min, max: BLOCKED_TERM_LENGTH.max })
  const form = useForm<{ term: string; reason: string }>({
    resolver: zodResolver(z.object({ term: z.string().refine((value) => admissibleBlockedTerm(value) !== null, termMessage), reason: reasonSchema(t("common.reasonInvalid", { min: 3 })) })),
    defaultValues: { term: "", reason: "" },
  })
  useOperationDraft(form.formState.isDirty || form.formState.isSubmitting || operation.pending, operation.pending)
  const submit = async (values: { term: string; reason: string }) => {
    if (await operation.run(() => setTerm({ networkId, term: values.term, active: true, reason: values.reason.trim() }))) form.reset()
  }
  return <form className="flex min-w-0 flex-col gap-4" noValidate aria-label={t("moderationPolicy.addLabel")} aria-busy={operation.pending || undefined} onSubmit={(event) => { void form.handleSubmit(submit)(event) }}>
    <fieldset disabled={operation.pending} className="flex min-w-0 flex-col gap-4">
      <Field htmlFor={`${id}-term`} label={t("moderationPolicy.term")} required hint={t("moderationPolicy.termHint", { min: BLOCKED_TERM_LENGTH.min, max: BLOCKED_TERM_LENGTH.max })} error={form.formState.errors.term?.message}><TextInput id={`${id}-term`} style={inputStyle} autoComplete="off" spellCheck={false} maxLength={BLOCKED_TERM_LENGTH.max + 20} {...form.register("term")} /></Field>
      <Field htmlFor={`${id}-reason`} label={t("common.reason")} required hint={t("common.reasonHint")} error={form.formState.errors.reason?.message}><TextArea id={`${id}-reason`} maxLength={500} {...form.register("reason")} /></Field>
    </fieldset>
    <OperationFailure message={operation.error} />
    <Button type="submit" style={controlStyle} disabled={operation.pending}>{t(operation.pending ? "common.saving" : "moderationPolicy.add")}</Button>
  </form>
}

function TermsSection({ networkId }: { networkId: Id<"networks"> }) {
  const { t } = useTranslation("operations")
  const id = useId()
  const window = useWindowCursor()
  const terms = useQuery(api.modules.platform.console.blockedTerms, { networkId, paginationOpts: { cursor: window.cursor, numItems: 20, maximumRowsRead: 50, maximumBytesRead: 262_144 } })
  const setTerm = useMutation(api.modules.platform.console.setBlockedTerm)
  return <section className={`${panelClass} flex min-w-0 flex-col gap-4`} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className="text-xl font-semibold">{t("moderationPolicy.termsTitle")}</h2>
    <p className="text-sm text-muted-foreground">{t("moderationPolicy.termsLead", { max: BLOCKED_TERMS_ACTIVE_MAX })}</p>
    <AddTerm networkId={networkId} />
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <h3 className="font-semibold">{t("moderationPolicy.activeTerms")}</h3>
      {terms === undefined ? <LoadingRows /> : terms.page.length === 0 ? <EmptyRows done={terms.isDone} /> : <ul className="flex min-w-0 flex-col gap-3">{terms.page.map((row) => <li key={row.termId} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-3">
        <p className="break-all font-medium" translate="no">{row.term}</p>
        <MotiveAction label={t("moderationPolicy.remove", { term: row.term })} danger onDecision={(reason) => setTerm({ networkId, term: row.term, active: false, reason })} />
      </li>)}</ul>}
      <WindowPagination window={window} result={terms} />
    </div>
  </section>
}

export function ModerationPolicyPanel({ networkId }: { networkId: Id<"networks"> }) {
  const settings = useQuery(api.modules.platform.console.moderationPolicies, { networkId })
  if (settings === undefined) return <LoadingRows />
  return <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,.8fr)]">
    <PolicySection networkId={networkId} settings={settings} />
    <TermsSection networkId={networkId} />
  </div>
}
