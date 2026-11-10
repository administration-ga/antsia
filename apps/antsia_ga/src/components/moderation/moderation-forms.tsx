"use client"

import { api, type Id } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { DECISION_REASON_MAX } from "@antsia/social-domain/audit"
import type { ModerationSurface } from "@antsia/social-domain/moderationPolicy"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import { useEffect, useId, useRef, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"
import { Button, Field, TextArea, TextInput } from "@/components/shared/controls"
import { useModerationDraft, useModerationGuard } from "./moderation-guard"
import { MODERATION_ACTIONS, moderationDecisionInput, moderationDecisionSchema, moderationReasonSchema, type ModerationAction } from "./moderation-model"
import { ModerationPreview, moderationSourceProof, useModerationPreview } from "./moderation-preview"

function useDecisionOperation() {
  const { t } = useTranslation("memberNetwork")
  const guard = useModerationGuard()
  const live = useRef(true)
  const [error, setError] = useState<string | null>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  useEffect(() => { if (error) errorRef.current?.focus({ preventScroll: true }) }, [error])
  const run = async (task: () => Promise<unknown>, saved: () => void, confirm?: () => boolean) => {
    if (!live.current || !guard.acquire()) return
    if (confirm && !confirm()) { guard.release(); return }
    setError(null)
    try {
      await task()
      if (live.current) { saved(); toast.success(t("moderation.saved")) }
    } catch (failure) {
      if (live.current) {
        const rule = engineErrorRule(failure), code = engineErrorCode(failure)
        const message = rule ? t(`rules:${rule.rule}`, rule.params) : code ? t(`errors:${code}`) : t("common.failed")
        setError(message); toast.error(message)
      }
    } finally { guard.release() }
  }
  return { run, pending: guard.pending, error, errorRef }
}

export function ReportDecision({ reportId }: { reportId: Id<"reports"> }) {
  const { t } = useTranslation("memberNetwork")
  const { networkId } = useNetwork()
  const timeZone = useViewerTimeZone()
  const decide = useMutation(api.modules.moderation.cases.decide)
  const { run, pending, error, errorRef } = useDecisionOperation()
  const preview = useModerationPreview({ reportId })
  const sourceProof = moderationSourceProof(preview.data)
  const requiresSourceProof = preview.data?.kind === "editorialVersion" || preview.data?.kind === "editorialMedia"
  const sourceReady = !requiresSourceProof || preview.data?.available === true && sourceProof !== null
  const id = useId()
  const form = useForm<{ action: ModerationAction; reason: string; until: string }>({ resolver: zodResolver(moderationDecisionSchema(t("moderation.reasonInvalid", { min: 3, max: DECISION_REASON_MAX }), t("moderation.durationInvalid"), timeZone)), defaultValues: { action: "dismissed", reason: "", until: "" } })
  const action = useWatch({ control: form.control, name: "action" })
  useModerationDraft(form.formState.isDirty)
  return <form className="flex flex-col gap-3" onSubmit={form.handleSubmit((value) => {
    if (preview.error || !preview.data || !sourceReady || (!preview.data.available && value.action !== "dismissed")) return
    return run(() => decide({ networkId, reportId, ...moderationDecisionInput(value, timeZone), ...(requiresSourceProof ? sourceProof : {}) }), () => form.reset(), value.action === "removal" || value.action === "suspension" ? () => window.confirm(t(`moderation.confirm.${value.action}`)) : undefined)
  })}>
    <ModerationPreview query={preview} allowDismiss={!requiresSourceProof} />
    <fieldset disabled={pending || !!preview.error || !preview.data || !sourceReady} className="flex min-w-0 flex-col gap-3">
      <Field id={`${id}-action`} label={t("moderation.action")}><select id={`${id}-action`} {...form.register("action")} className="min-h-11 w-full rounded-[var(--esp-field-radius)] border border-input bg-muted px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{MODERATION_ACTIONS.map((value) => <option key={value} value={value} disabled={!preview.data?.available && value !== "dismissed"}>{t(`moderation.actions.${value}`)}</option>)}</select></Field>
      {action === "suspension" ? <><p className="text-sm text-muted-foreground">{t("moderation.globalSuspension")}</p><Field id={`${id}-until`} label={t("moderation.until", { timeZone })} error={form.formState.errors.until?.message}><TextInput id={`${id}-until`} type="datetime-local" aria-invalid={!!form.formState.errors.until} aria-describedby={form.formState.errors.until ? `${id}-until-error` : undefined} {...form.register("until")} /></Field></> : null}
      <Field id={`${id}-reason`} label={t("moderation.reason")} error={form.formState.errors.reason?.message}><TextArea id={`${id}-reason`} maxLength={DECISION_REASON_MAX} aria-invalid={!!form.formState.errors.reason} aria-describedby={form.formState.errors.reason ? `${id}-reason-error` : undefined} {...form.register("reason")} /></Field>
      <Button type="submit" variant={action === "removal" || action === "suspension" ? "danger" : action === "dismissed" ? "success" : "primary"} pending={pending} disabled={!preview.data?.available && action !== "dismissed"}>{t(`moderation.submit.${action}`)}</Button>
    </fieldset>
    {error ? <p ref={errorRef} role="alert" tabIndex={-1} className="rounded-[var(--ui2-card-radius)] border border-destructive p-4 text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{error}</p> : null}
  </form>
}

export function PendingDecision({ targetKind, targetId }: { targetKind: ModerationSurface; targetId: string }) {
  const { t } = useTranslation("memberNetwork")
  const { networkId } = useNetwork()
  const review = useMutation(api.modules.moderation.cases.reviewContent)
  const { run, pending, error, errorRef } = useDecisionOperation()
  const preview = useModerationPreview({ target: { kind: targetKind, id: targetId } })
  const sourceProof = moderationSourceProof(preview.data)
  const requiresSourceProof = targetKind === "commerceStorefront" || targetKind === "commerceOffer" || targetKind === "professionalProfile" || targetKind === "professionalCollaboration" || targetKind === "editorialVersion" || targetKind === "editorialMedia"
  const previewAvailable = !preview.error && preview.data?.available === true && preview.data.kind === targetKind && (!requiresSourceProof || sourceProof !== null)
  const id = useId()
  const form = useForm<{ reason: string; approve: "approve" | "reject" }>({ resolver: zodResolver(z.object({ reason: moderationReasonSchema(t("moderation.reasonInvalid", { min: 3, max: DECISION_REASON_MAX })), approve: z.enum(["approve", "reject"]) })), defaultValues: { reason: "", approve: "approve" } })
  const decision = useWatch({ control: form.control, name: "approve" })
  useModerationDraft(form.formState.isDirty)
  return <form className="flex flex-col gap-3" onSubmit={form.handleSubmit((value) => {
    if (!previewAvailable) return
    return run(() => review({ networkId, target: { kind: targetKind, id: targetId } as Parameters<typeof review>[0]["target"], approve: value.approve === "approve", reason: value.reason, ...(requiresSourceProof ? sourceProof : {}) }), () => form.reset(), value.approve === "reject" ? () => window.confirm(t("moderation.confirm.reject")) : undefined)
  })}>
    <ModerationPreview query={preview} />
    <fieldset disabled={pending || !previewAvailable} className="flex min-w-0 flex-col gap-3">
      <Field id={`${id}-decision`} label={t("moderation.action")}><select id={`${id}-decision`} {...form.register("approve")} className="min-h-11 w-full rounded-[var(--esp-field-radius)] border border-input bg-muted px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="approve">{t("moderation.approve")}</option><option value="reject">{t("moderation.reject")}</option></select></Field>
      <Field id={`${id}-reason`} label={t("moderation.reason")} error={form.formState.errors.reason?.message}><TextArea id={`${id}-reason`} maxLength={DECISION_REASON_MAX} aria-invalid={!!form.formState.errors.reason} aria-describedby={form.formState.errors.reason ? `${id}-reason-error` : undefined} {...form.register("reason")} /></Field>
      <Button type="submit" variant={decision === "approve" ? "success" : "danger"} pending={pending}>{t(decision === "approve" ? "moderation.submit.approve" : "moderation.submit.reject")}</Button>
    </fieldset>
    {error ? <p ref={errorRef} role="alert" tabIndex={-1} className="rounded-[var(--ui2-card-radius)] border border-destructive p-4 text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{error}</p> : null}
  </form>
}

export function AppealDecision({ appealId, canDecide }: { appealId: Id<"appeals">; canDecide: boolean }) {
  const { t } = useTranslation("memberNetwork")
  const { networkId } = useNetwork()
  const review = useMutation(api.modules.moderation.cases.reviewNetworkAppeal)
  const { run, pending, error, errorRef } = useDecisionOperation()
  const id = useId()
  const form = useForm<{ reason: string; decision: "uphold" | "overturn" }>({ resolver: zodResolver(z.object({ reason: moderationReasonSchema(t("moderation.reasonInvalid", { min: 3, max: DECISION_REASON_MAX })), decision: z.enum(["uphold", "overturn"]) })), defaultValues: { reason: "", decision: "uphold" } })
  const decision = useWatch({ control: form.control, name: "decision" })
  useModerationDraft(form.formState.isDirty)
  return <form className="flex flex-col gap-3" onSubmit={form.handleSubmit((value) => {
    if (!canDecide) return
    return run(() => review({ networkId, appealId, overturn: value.decision === "overturn", reason: value.reason }), () => form.reset(), () => window.confirm(t(`moderation.confirm.${value.decision}`)))
  })}>
    {!canDecide ? <p id={`${id}-independence`} role="status" className="rounded-[var(--ui2-card-radius)] border border-transparent bg-muted p-4 text-sm">{t("moderation.anotherDecider")}</p> : null}
    <fieldset disabled={pending || !canDecide} aria-describedby={!canDecide ? `${id}-independence` : undefined} className="flex min-w-0 flex-col gap-3">
      <Field id={`${id}-decision`} label={t("moderation.action")}><select id={`${id}-decision`} {...form.register("decision")} className="min-h-11 w-full rounded-[var(--esp-field-radius)] border border-input bg-muted px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="uphold">{t("moderation.uphold")}</option><option value="overturn">{t("moderation.overturn")}</option></select></Field>
      <Field id={`${id}-reason`} label={t("moderation.reason")} error={form.formState.errors.reason?.message}><TextArea id={`${id}-reason`} maxLength={DECISION_REASON_MAX} aria-invalid={!!form.formState.errors.reason} aria-describedby={form.formState.errors.reason ? `${id}-reason-error` : undefined} {...form.register("reason")} /></Field>
      <Button type="submit" variant={decision === "overturn" ? "outline" : "success"} pending={pending}>{t(`moderation.submit.${decision}`)}</Button>
    </fieldset>
    {error ? <p ref={errorRef} role="alert" tabIndex={-1} className="rounded-[var(--ui2-card-radius)] border border-destructive p-4 text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{error}</p> : null}
  </form>
}
