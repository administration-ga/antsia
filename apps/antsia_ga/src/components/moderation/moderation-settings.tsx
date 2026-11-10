"use client"

/**
 * MC-02 — l'onglet « Réglages » de /moderation, pour le seul administrateur du réseau : par surface,
 * la relecture préalable, le plafond de liens et la cadence ; puis la liste des mots bloqués (ajout,
 * retrait). Chaque changement est motivé et journalisé par le moteur ; aucune donnée de contenu n'est lue.
 */
import { api } from "@antsia/api/engine"
import { formatViewerDate } from "@antsia/api/civil-date"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { DECISION_REASON_MAX } from "@antsia/social-domain/audit"
import { BLOCKED_TERM_LENGTH, BLOCKED_TERMS_ACTIVE_MAX, MODERATION_POLICY_BOUNDS, type ModerationSurface } from "@antsia/social-domain/moderationPolicy"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useId, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { Button, Field, TextArea, TextInput } from "@/components/shared/controls"
import { FORM_FIELDS, SCREEN_SECTIONS } from "@/components/shared/screen-layout"
import { useDecisionOperation } from "./moderation-forms"
import { useModerationDraft, useModerationGuard } from "./moderation-guard"
import { blockedTermSchema, moderationPolicyFormValues, moderationPolicyInput, moderationPolicySchema, moderationReasonSchema, type ModerationPolicyForm } from "./moderation-model"

type Settings = FunctionReturnType<typeof api.modules.moderation.cases.policies>
type SurfaceRow = Settings["surfaces"][number]
const SELECT_CLASS = "min-h-11 w-full rounded-[var(--esp-field-radius)] border border-input bg-muted px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
const SECTION_CLASS = "flex min-w-0 flex-col gap-4 rounded-[var(--ui2-card-radius)] border border-[color:var(--esp-surface-border)] bg-card p-[var(--esp-card-padding,16px)]"

export function ModerationSettings() {
  const { t } = useTranslation("memberNetwork")
  const { networkId } = useNetwork()
  const settings = useAuthenticatedConvexQuery(api.modules.moderation.cases.policies, { networkId })
  if (settings.error) return <div role="alert" className="rounded-xl border border-destructive p-4"><p>{t("common.failed")}</p><Button variant="outline" onClick={() => void settings.refetch()}>{t("common.retry")}</Button></div>
  if (!settings.data) return <p role="status">{t("common.loading")}</p>
  return <div className={`${SCREEN_SECTIONS} gap-y-5`}>
    <PolicySection settings={settings.data} />
    <BlockedTermsSection />
  </div>
}

function PolicySection({ settings }: { settings: Settings }) {
  const { t } = useTranslation("memberNetwork")
  const guard = useModerationGuard()
  const id = useId()
  const [surface, setSurface] = useState<ModerationSurface>(settings.surfaces[0]?.surface ?? "post")
  const row = settings.surfaces.find((item) => item.surface === surface)
  const configured = settings.surfaces.filter((item) => item.policy !== null)
  return <section aria-labelledby={`${id}-title`} className={SECTION_CLASS}>
    <h2 id={`${id}-title`} className="text-xl font-semibold">{t("moderation.policy.title")}</h2>
    <p className="text-sm text-muted-foreground">{t("moderation.policy.lead")}</p>
    <p className="text-sm text-muted-foreground">{t("moderation.policy.exceptions")}</p>
    <Field id={`${id}-surface`} label={t("moderation.policy.surface")}>
      <select id={`${id}-surface`} value={surface} disabled={guard.pending} className={SELECT_CLASS} onChange={(event) => {
        const next = settings.surfaces.find((item) => item.surface === event.target.value)?.surface
        if (next && guard.canLeave()) setSurface(next)
      }}>
        {settings.surfaces.map((item) => <option key={item.surface} value={item.surface}>{t(`moderation.surfaces.${item.surface}`)}{item.policy ? t("moderation.policy.configuredSuffix") : ""}</option>)}
      </select>
    </Field>
    {row ? <PolicyForm key={`${row.surface}:${row.policy?.updatedAt ?? "none"}`} row={row} defaults={settings.defaults} /> : null}
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <h3 className="font-semibold">{t("moderation.policy.configuredTitle")}</h3>
      {configured.length === 0 ? <p role="status" className="text-sm text-muted-foreground">{t("moderation.policy.noneConfigured")}</p> : <ul className="flex flex-col gap-1 text-sm">{configured.map((item) => item.policy ? <li key={item.surface} className="break-words">{t("moderation.policy.summary", { surface: t(`moderation.surfaces.${item.surface}`), review: t(item.policy.preReview ? "moderation.policy.reviewOn" : "moderation.policy.reviewOff"), links: item.policy.maxLinks, writes: item.policy.maxWrites, seconds: Math.round(item.policy.windowMs / 1000) })}</li> : null)}</ul>}
    </div>
  </section>
}

function PolicyStatus({ row, defaults }: { row: SurfaceRow; defaults: Settings["defaults"] }) {
  const { t, i18n } = useTranslation("memberNetwork")
  const timeZone = useViewerTimeZone()
  if (row.policy) return <p role="status" className="text-sm">{t("moderation.policy.explicit", { date: formatViewerDate(row.policy.updatedAt, i18n.language, { dateStyle: "medium", timeStyle: "short" }, timeZone) })}</p>
  if (row.withoutPolicy === "held") return <p role="status" className="text-sm">{t("moderation.policy.withoutHeld")}</p>
  if (row.withoutPolicy === "unchecked") return <p role="status" className="text-sm">{t("moderation.policy.withoutUnchecked")}</p>
  return <p role="status" className="text-sm">{t("moderation.policy.withoutDefaults", { review: t(defaults.preReview ? "moderation.policy.reviewOn" : "moderation.policy.reviewOff"), links: defaults.maxLinks, writes: defaults.maxWrites, seconds: Math.round(defaults.windowMs / 1000) })}</p>
}

function PolicyForm({ row, defaults }: { row: SurfaceRow; defaults: Settings["defaults"] }) {
  const { t } = useTranslation("memberNetwork")
  const { networkId } = useNetwork()
  const save = useMutation(api.modules.moderation.cases.setPolicy)
  const { run, pending, error, errorRef } = useDecisionOperation()
  const id = useId()
  const bounds = MODERATION_POLICY_BOUNDS
  const initial = moderationPolicyFormValues(row.policy ?? defaults)
  const form = useForm<ModerationPolicyForm>({
    resolver: zodResolver(moderationPolicySchema({
      reason: t("moderation.reasonInvalid", { min: 3, max: DECISION_REASON_MAX }),
      maxLinks: t("moderation.policy.maxLinksInvalid", { min: bounds.maxLinks.min, max: bounds.maxLinks.max }),
      maxWrites: t("moderation.policy.maxWritesInvalid", { min: bounds.maxWrites.min, max: bounds.maxWrites.max }),
      window: t("moderation.policy.windowInvalid", { min: bounds.windowMs.min / 1000, max: bounds.windowMs.max / 1000 }),
    })),
    defaultValues: initial,
  })
  useModerationDraft(form.formState.isDirty)
  const errors = form.formState.errors
  const numberField = (name: "maxLinks" | "maxWrites" | "windowSeconds", label: string, hint: string, min: number, max: number) => <Field id={`${id}-${name}`} label={label} hint={hint} error={errors[name]?.message}>
    <TextInput id={`${id}-${name}`} type="number" inputMode="numeric" min={min} max={max} step={1} aria-invalid={!!errors[name]} aria-describedby={`${id}-${name}-hint${errors[name] ? ` ${id}-${name}-error` : ""}`} {...form.register(name, { valueAsNumber: true })} />
  </Field>
  return <form noValidate className="flex min-w-0 flex-col gap-4" aria-label={t("moderation.policy.formLabel", { surface: t(`moderation.surfaces.${row.surface}`) })} onSubmit={form.handleSubmit((value) => run(() => save({ networkId, ...moderationPolicyInput(row.surface, value) }), () => form.reset({ ...value, reason: "" })))}>
    <PolicyStatus row={row} defaults={defaults} />
    <fieldset disabled={pending} className="flex min-w-0 flex-col gap-4">
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-4 accent-primary" {...form.register("preReview")} />{t("moderation.policy.preReview")}</label>
      <div className={`${FORM_FIELDS} gap-y-4`}>
        {numberField("maxLinks", t("moderation.policy.maxLinks"), t("moderation.policy.maxLinksHint"), bounds.maxLinks.min, bounds.maxLinks.max)}
        {numberField("maxWrites", t("moderation.policy.maxWrites"), t("moderation.policy.maxWritesHint"), bounds.maxWrites.min, bounds.maxWrites.max)}
        {numberField("windowSeconds", t("moderation.policy.window"), t("moderation.policy.windowHint"), bounds.windowMs.min / 1000, bounds.windowMs.max / 1000)}
      </div>
      <Field id={`${id}-reason`} label={t("moderation.reason")} error={errors.reason?.message}><TextArea id={`${id}-reason`} maxLength={DECISION_REASON_MAX} aria-invalid={!!errors.reason} aria-describedby={errors.reason ? `${id}-reason-error` : undefined} {...form.register("reason")} /></Field>
      <Button type="submit" className="self-start" pending={pending}>{t("moderation.policy.save")}</Button>
    </fieldset>
    {error ? <p ref={errorRef} role="alert" tabIndex={-1} className="rounded-[var(--ui2-card-radius)] border border-destructive p-4 text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{error}</p> : null}
  </form>
}

function BlockedTermsSection() {
  const { t } = useTranslation("memberNetwork")
  const { networkId } = useNetwork()
  const guard = useModerationGuard()
  const id = useId()
  const [cursor, setCursor] = useState<string | null>(null)
  const terms = useAuthenticatedConvexQuery(api.modules.moderation.cases.blockedTermsPage, { networkId, paginationOpts: { numItems: 20, cursor, maximumRowsRead: 50, maximumBytesRead: 262_144 } })
  const move = (next: string | null) => { if (guard.canLeave()) setCursor(next) }
  return <section aria-labelledby={`${id}-title`} className={SECTION_CLASS}>
    <h2 id={`${id}-title`} className="text-xl font-semibold">{t("moderation.terms.title")}</h2>
    <p className="text-sm text-muted-foreground">{t("moderation.terms.lead", { max: BLOCKED_TERMS_ACTIVE_MAX })}</p>
    <AddBlockedTerm />
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <h3 className="font-semibold">{t("moderation.terms.listTitle")}</h3>
      {terms.error ? <div role="alert" className="flex flex-col gap-2"><p>{t("common.failed")}</p><Button variant="outline" className="self-start" onClick={() => void terms.refetch()}>{t("common.retry")}</Button></div>
        : !terms.data ? <p role="status">{t("common.loading")}</p>
        : <>
          {terms.data.page.length === 0 ? <p role="status" className="text-sm text-muted-foreground">{t(terms.data.isDone ? "moderation.terms.empty" : "moderation.emptyWindow")}</p> : <ul className="flex flex-col gap-3">{terms.data.page.map((row) => <BlockedTermRow key={row.termId} term={row.term} />)}</ul>}
          <nav aria-label={t("moderation.terms.pagination")} className="flex flex-wrap items-center justify-between gap-2">
            {cursor ? <Button variant="outline" disabled={guard.pending} onClick={() => move(null)}>{t("common.firstPage")}</Button> : <span />}
            {!terms.data.isDone ? <Button variant="outline" disabled={guard.pending || !terms.data.continueCursor || terms.data.continueCursor === cursor} onClick={() => { if (terms.data) move(terms.data.continueCursor) }}>{t("common.next")}</Button> : <p role="status" className="text-sm text-muted-foreground">{t("common.end")}</p>}
          </nav>
        </>}
    </div>
  </section>
}

function AddBlockedTerm() {
  const { t } = useTranslation("memberNetwork")
  const { networkId } = useNetwork()
  const setTerm = useMutation(api.modules.moderation.cases.setBlockedTerm)
  const { run, pending, error, errorRef } = useDecisionOperation()
  const id = useId()
  const form = useForm<{ term: string; reason: string }>({
    resolver: zodResolver(blockedTermSchema({ term: t("moderation.terms.termInvalid", { min: BLOCKED_TERM_LENGTH.min, max: BLOCKED_TERM_LENGTH.max }), reason: t("moderation.reasonInvalid", { min: 3, max: DECISION_REASON_MAX }) })),
    defaultValues: { term: "", reason: "" },
  })
  useModerationDraft(form.formState.isDirty)
  const errors = form.formState.errors
  return <form noValidate className="flex min-w-0 flex-col gap-4" aria-label={t("moderation.terms.addLabel")} onSubmit={form.handleSubmit((value) => run(() => setTerm({ networkId, term: value.term, active: true, reason: value.reason.trim() }), () => form.reset()))}>
    <fieldset disabled={pending} className="flex min-w-0 flex-col gap-4">
      <Field id={`${id}-term`} label={t("moderation.terms.term")} hint={t("moderation.terms.termHint", { min: BLOCKED_TERM_LENGTH.min, max: BLOCKED_TERM_LENGTH.max })} error={errors.term?.message}><TextInput id={`${id}-term`} autoComplete="off" spellCheck={false} maxLength={BLOCKED_TERM_LENGTH.max + 20} aria-invalid={!!errors.term} aria-describedby={`${id}-term-hint${errors.term ? ` ${id}-term-error` : ""}`} {...form.register("term")} /></Field>
      <Field id={`${id}-reason`} label={t("moderation.reason")} error={errors.reason?.message}><TextArea id={`${id}-reason`} maxLength={DECISION_REASON_MAX} aria-invalid={!!errors.reason} aria-describedby={errors.reason ? `${id}-reason-error` : undefined} {...form.register("reason")} /></Field>
      <Button type="submit" className="self-start" pending={pending}>{t("moderation.terms.add")}</Button>
    </fieldset>
    {error ? <p ref={errorRef} role="alert" tabIndex={-1} className="rounded-[var(--ui2-card-radius)] border border-destructive p-4 text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{error}</p> : null}
  </form>
}

function BlockedTermRow({ term }: { term: string }) {
  const { t } = useTranslation("memberNetwork")
  const [open, setOpen] = useState(false)
  return <li className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-3">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <span className="break-all font-medium" translate="no">{term}</span>
      {!open ? <Button variant="outline" onClick={() => setOpen(true)}>{t("moderation.terms.remove")}</Button> : null}
    </div>
    {open ? <RemoveBlockedTerm term={term} onClose={() => setOpen(false)} /> : null}
  </li>
}

function RemoveBlockedTerm({ term, onClose }: { term: string; onClose: () => void }) {
  const { t } = useTranslation("memberNetwork")
  const { networkId } = useNetwork()
  const setTerm = useMutation(api.modules.moderation.cases.setBlockedTerm)
  const { run, pending, error, errorRef } = useDecisionOperation()
  const id = useId()
  const form = useForm<{ reason: string }>({ resolver: zodResolver(z.object({ reason: moderationReasonSchema(t("moderation.reasonInvalid", { min: 3, max: DECISION_REASON_MAX })) })), defaultValues: { reason: "" } })
  useModerationDraft(form.formState.isDirty)
  const errors = form.formState.errors
  return <form noValidate className="flex min-w-0 flex-col gap-3" aria-label={t("moderation.terms.removeLabel", { term })} onSubmit={form.handleSubmit((value) => run(() => setTerm({ networkId, term, active: false, reason: value.reason.trim() }), onClose))}>
    <fieldset disabled={pending} className="flex min-w-0 flex-col gap-3">
      <Field id={`${id}-reason`} label={t("moderation.reason")} error={errors.reason?.message}><TextArea id={`${id}-reason`} maxLength={DECISION_REASON_MAX} aria-invalid={!!errors.reason} aria-describedby={errors.reason ? `${id}-reason-error` : undefined} {...form.register("reason")} /></Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" pending={pending}>{t("moderation.terms.confirmRemove")}</Button>
        <Button type="button" variant="ghost" onClick={onClose}>{t("moderation.terms.cancel")}</Button>
      </div>
    </fieldset>
    {error ? <p ref={errorRef} role="alert" tabIndex={-1} className="rounded-[var(--ui2-card-radius)] border border-destructive p-4 text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{error}</p> : null}
  </form>
}
