"use client"

/**
 * SU01h (plan 12) — « Mesures sur ordre du juge » (référé numérique, ordonnance n° 0011/PR/2026,
 * art. 39 à 44). Un opérateur EXÉCUTE tout de suite (genre, cible vérifiée, référence de l'ordonnance,
 * date d'effet, échéance, motif) ; un SECOND opérateur confirme ensuite — jamais l'exécutant. Une mesure
 * non confirmée dans le délai reste en vigueur et s'affiche en alerte ; le rappel de caducité (art. 43)
 * vient au 28e jour sans action au fond. Chaque geste est une mutation d'opérateur motivée et
 * journalisée (`modules/moderation/measures`) ; la preuve horodatée est le journal de la mesure.
 */
import { api, type Id } from "@antsia/api/engine"
import {
  ARTICLE_44_MAX_MS,
  isArticle44Kind,
  isJudicialConfirmationOverdue,
  isJudicialLapseReminderDue,
  JUDICIAL_CONFIRMATION_DELAY_MS,
  JUDICIAL_CORRECTION_MAX,
  JUDICIAL_CORRECTION_MIN,
  JUDICIAL_LAPSE_REMINDER_MS,
  JUDICIAL_MEASURE_KINDS,
  JUDICIAL_ORDER_REFERENCE_MAX,
  JUDICIAL_ORDER_REFERENCE_MIN,
  JUDICIAL_ORIGIN_LABEL_MAX,
  JUDICIAL_ORIGIN_LABEL_MIN,
  JUDICIAL_REASON_MIN,
  type JudicialMeasureKind,
  type JudicialMeasureTiming,
  type JudicialTargetKind,
  judicialMeasureLatestEnd,
  RESTRICTABLE_FEATURES,
} from "@antsia/social-domain/judicialMeasures"
import { Button, Field, Select, TextArea, TextInput } from "@antsia/ui"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { AlertTriangle, Gavel, Search } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { ConsoleDate, controlStyle, EmptyRows, inputStyle, LoadingRows, MotiveAction, OperationFailure, panelClass, useOperation, useOperationDraft, useWindowCursor, WindowPagination } from "./console-operation-controls"

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const PAGE_SIZE = 10

/** Les cibles que l'écran propose pour chaque genre (le moteur en admet davantage, que l'écran affiche s'il les rencontre). */
export const CONSOLE_TARGETS: Readonly<Record<JudicialMeasureKind, readonly JudicialTargetKind[]>> = {
  suspend_account: ["person", "page"],
  suspend_content: ["post", "comment", "story", "live", "album", "event", "groupMessage", "thematicGroup"],
  delist: ["person", "page", "post"],
  pin_correction: ["person", "page", "post"],
  origin_label: ["person", "page", "post"],
  restrict_feature: ["network"],
  suspend_access: ["network"],
}
const NAMED_TARGETS = new Set<JudicialTargetKind>(["person", "page", "post", "comment", "story", "live", "album", "event", "groupMessage", "thematicGroup", "network"])

type ConsoleMeasure = FunctionReturnType<typeof api.modules.moderation.measures.paginateMeasures>["page"][number]
type Preview = NonNullable<FunctionReturnType<typeof api.modules.moderation.measures.previewTarget>>

/** Une horloge à la minute : les alertes changent avec le temps, sans nouvelle donnée. */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

/** `datetime-local` du navigateur ↔ instant. */
export function toLocalInput(at: number): string {
  const date = new Date(at)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
export function fromLocalInput(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const at = new Date(value).getTime()
  return Number.isFinite(at) ? at : null
}

function useTargetLabel() {
  const { t } = useTranslation("operations")
  return (kind: JudicialTargetKind) => NAMED_TARGETS.has(kind) ? t(`measures.targets.${kind}`) : t(`surfaces.${kind}`)
}

function timingOf(measure: { status: "active" | "lifted"; startsAt: number; endsAt?: number | null; executedAt: number; confirmedAt?: number | null; meritsActionNotedAt?: number | null }): JudicialMeasureTiming {
  return { status: measure.status, startsAt: measure.startsAt, executedAt: measure.executedAt, ...(measure.endsAt != null ? { endsAt: measure.endsAt } : {}), ...(measure.confirmedAt != null ? { confirmedAt: measure.confirmedAt } : {}), ...(measure.meritsActionNotedAt != null ? { meritsActionNotedAt: measure.meritsActionNotedAt } : {}) }
}

/** L'alerte de la console : mesures à confirmer hors délai, caducités à vérifier. Rien s'il n'y a rien. */
export function JudicialMeasureAlert({ onOpen }: { onOpen?: () => void }) {
  const { t } = useTranslation("operations")
  const clock = useQuery(api.modules.moderation.measures.activeMeasureClock, {})
  const now = useMinuteClock()
  if (!clock) return null
  const overdue = clock.measures.filter((measure) => isJudicialConfirmationOverdue(timingOf(measure), now)).length
  const lapse = clock.measures.filter((measure) => isJudicialLapseReminderDue(timingOf(measure), now)).length
  if (overdue === 0 && lapse === 0) return null
  return <section role="alert" className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive p-4 text-sm">
    <div className="flex min-w-0 items-start gap-2"><AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" /><div className="min-w-0 space-y-1">
      {overdue > 0 ? <p>{t("measures.alerts.confirmationOverdue", { count: overdue, hours: JUDICIAL_CONFIRMATION_DELAY_MS / HOUR_MS })}</p> : null}
      {lapse > 0 ? <p>{t("measures.alerts.lapseDue", { count: lapse, days: JUDICIAL_LAPSE_REMINDER_MS / DAY_MS })}</p> : null}
      {clock.truncated ? <p className="text-muted-foreground">{t("measures.alerts.truncated")}</p> : null}
    </div></div>
    {onOpen ? <Button variant="outline" style={controlStyle} onClick={onOpen}>{t("measures.alerts.open")}</Button> : null}
  </section>
}

type OpenValues = { kind: JudicialMeasureKind; targetKind: string; ref: string; orderReference: string; startsAt: string; endsAt: string; feature: string; correctionText: string; originLabel: string; reason: string }

export function openMeasureSchema(messages: { required: string; reference: string; startsAt: string; endsAt: string; endsAtArt44: string; feature: string; correction: string; origin: string; reason: string }, now: () => number) {
  return z.object({
    kind: z.enum(JUDICIAL_MEASURE_KINDS),
    targetKind: z.string(),
    ref: z.string().trim().max(200, messages.required),
    orderReference: z.string().trim().min(JUDICIAL_ORDER_REFERENCE_MIN, messages.reference).max(JUDICIAL_ORDER_REFERENCE_MAX, messages.reference).refine((value) => !/[\r\n\t]/.test(value), messages.reference),
    startsAt: z.string(),
    endsAt: z.string(),
    feature: z.string(),
    correctionText: z.string(),
    originLabel: z.string(),
    reason: z.string().trim().min(JUDICIAL_REASON_MIN, messages.reason).max(500, messages.reason),
  }).superRefine((values, issues) => {
    const startsAt = fromLocalInput(values.startsAt)
    if (startsAt === null || startsAt > now() + 5 * 60_000 || startsAt < now() - 31 * DAY_MS) issues.addIssue({ code: "custom", path: ["startsAt"], message: messages.startsAt })
    const endsAt = values.endsAt === "" ? null : fromLocalInput(values.endsAt)
    const art44 = isArticle44Kind(values.kind)
    if (values.endsAt !== "" && (endsAt === null || endsAt <= now() || (startsAt !== null && endsAt <= startsAt))) issues.addIssue({ code: "custom", path: ["endsAt"], message: messages.endsAt })
    else if (art44 && endsAt === null) issues.addIssue({ code: "custom", path: ["endsAt"], message: messages.endsAtArt44 })
    else if (endsAt !== null && startsAt !== null && endsAt > judicialMeasureLatestEnd(values.kind, startsAt)) issues.addIssue({ code: "custom", path: ["endsAt"], message: art44 ? messages.endsAtArt44 : messages.endsAt })
    if (values.kind === "restrict_feature" && !(RESTRICTABLE_FEATURES as readonly string[]).includes(values.feature)) issues.addIssue({ code: "custom", path: ["feature"], message: messages.feature })
    const correction = values.correctionText.trim()
    if (values.kind === "pin_correction" && (correction.length < JUDICIAL_CORRECTION_MIN || correction.length > JUDICIAL_CORRECTION_MAX)) issues.addIssue({ code: "custom", path: ["correctionText"], message: messages.correction })
    const origin = values.originLabel.trim()
    if (values.kind === "origin_label" && (origin.length < JUDICIAL_ORIGIN_LABEL_MIN || origin.length > JUDICIAL_ORIGIN_LABEL_MAX || /[\r\n\t]/.test(origin))) issues.addIssue({ code: "custom", path: ["originLabel"], message: messages.origin })
    if (!CONSOLE_TARGETS[values.kind].includes(values.targetKind as JudicialTargetKind)) issues.addIssue({ code: "custom", path: ["targetKind"], message: messages.required })
    if (values.targetKind !== "network" && values.ref.trim() === "") issues.addIssue({ code: "custom", path: ["ref"], message: messages.required })
  })
}

function TargetPreview({ preview }: { preview: Preview }) {
  const { t } = useTranslation("operations")
  const targetLabel = useTargetLabel()
  return <dl className="grid min-w-0 gap-2 rounded-lg bg-muted p-3 text-sm sm:grid-cols-2">
    <div className="min-w-0"><dt className="text-muted-foreground">{t("measures.open.previewTarget")}</dt><dd className="break-words">{targetLabel(preview.target.kind)}{preview.label ? ` · ${preview.label}` : ""}</dd></div>
    <div className="min-w-0"><dt className="text-muted-foreground">{t("measures.card.network")}</dt><dd className="break-words">{preview.networkName ?? t("measures.card.unknown")}</dd></div>
    <div className="min-w-0"><dt className="text-muted-foreground">{t("measures.open.previewCreated")}</dt><dd><ConsoleDate at={preview.createdAt} /></dd></div>
    <div className="min-w-0"><dt className="text-muted-foreground">{t("measures.open.previewState")}</dt><dd>{t(`measures.states.${preview.moderationStatus ?? "none"}`)}</dd></div>
    {preview.activeMeasures > 0 ? <p className="sm:col-span-2">{t("measures.open.previewActive", { count: preview.activeMeasures })}</p> : null}
    <p className="break-all font-mono text-xs text-muted-foreground sm:col-span-2" translate="no">{preview.target.id}</p>
  </dl>
}

/** Exécuter une mesure : la cible est VÉRIFIÉE avant que le bouton d'exécution ne s'ouvre. */
export function OpenMeasureForm({ networkId, onDone }: { networkId?: Id<"networks">; onDone: () => void }) {
  const { t } = useTranslation("operations")
  const id = useId()
  const targetLabel = useTargetLabel()
  const operation = useOperation()
  const open = useMutation(api.modules.moderation.measures.openMeasure)
  const [searched, setSearched] = useState<{ kind: JudicialTargetKind; ref: string } | null>(null)
  const form = useForm<OpenValues>({
    resolver: zodResolver(openMeasureSchema({
      required: t("measures.open.invalid.required"), reference: t("measures.open.invalid.reference", { min: JUDICIAL_ORDER_REFERENCE_MIN, max: JUDICIAL_ORDER_REFERENCE_MAX }),
      startsAt: t("measures.open.invalid.startsAt"), endsAt: t("measures.open.invalid.endsAt"), endsAtArt44: t("measures.open.invalid.endsAtArt44", { hours: ARTICLE_44_MAX_MS / HOUR_MS }),
      feature: t("measures.open.invalid.feature"), correction: t("measures.open.invalid.correction", { min: JUDICIAL_CORRECTION_MIN, max: JUDICIAL_CORRECTION_MAX }),
      origin: t("measures.open.invalid.origin", { min: JUDICIAL_ORIGIN_LABEL_MIN, max: JUDICIAL_ORIGIN_LABEL_MAX }), reason: t("common.reasonInvalid", { min: JUDICIAL_REASON_MIN }),
    }, () => Date.now())),
    defaultValues: { kind: "suspend_account", targetKind: "person", ref: "", orderReference: "", startsAt: toLocalInput(Date.now()), endsAt: "", feature: "", correctionText: "", originLabel: "", reason: "" },
  })
  const kind = useWatch({ control: form.control, name: "kind", defaultValue: "suspend_account" })
  const targetKind = useWatch({ control: form.control, name: "targetKind", defaultValue: "person" }) as JudicialTargetKind
  const ref = useWatch({ control: form.control, name: "ref", defaultValue: "" }).trim()
  const networkTarget = targetKind === "network"
  const currentRef = networkTarget ? networkId ?? "" : ref
  useOperationDraft(form.formState.isDirty || operation.pending, operation.pending)
  // Un genre change ses cibles : la première proposée est retenue si l'ancienne n'y est plus.
  useEffect(() => {
    if (!CONSOLE_TARGETS[kind].includes(targetKind)) form.setValue("targetKind", CONSOLE_TARGETS[kind][0] ?? "person", { shouldDirty: true })
  }, [kind, targetKind, form])
  // Une cible de réseau est le réseau choisi dans la colonne : vérifiée sans geste.
  useEffect(() => { if (networkTarget) setSearched(networkId ? { kind: "network", ref: networkId } : null) }, [networkTarget, networkId])
  const fresh = searched !== null && searched.kind === targetKind && searched.ref === currentRef
  const preview = useQuery(api.modules.moderation.measures.previewTarget, fresh && searched ? { kind: searched.kind, ref: searched.ref } : "skip")
  const submit = async (values: OpenValues) => {
    if (!fresh || !preview) return
    const startsAt = fromLocalInput(values.startsAt)
    if (startsAt === null) return
    const endsAt = values.endsAt === "" ? undefined : fromLocalInput(values.endsAt) ?? undefined
    const done = await operation.run(() => open({
      kind: values.kind, target: preview.target, orderReference: values.orderReference.trim(), startsAt,
      ...(endsAt !== undefined ? { endsAt } : {}),
      ...(values.kind === "restrict_feature" ? { feature: values.feature as (typeof RESTRICTABLE_FEATURES)[number] } : {}),
      ...(values.kind === "pin_correction" ? { correctionText: values.correctionText.trim() } : {}),
      ...(values.kind === "origin_label" ? { originLabel: values.originLabel.trim() } : {}),
      reason: values.reason,
    }), "measures.open.executed")
    if (done) { form.reset(); setSearched(null); onDone() }
  }
  const errors = form.formState.errors
  return <form noValidate aria-labelledby={`${id}-title`} aria-busy={operation.pending || undefined} className="flex min-w-0 flex-col gap-4 rounded-lg border border-border p-4" onSubmit={(event) => { void form.handleSubmit(submit)(event) }}>
    <h3 id={`${id}-title`} className="font-semibold">{t("measures.open.title")}</h3>
    <p className="text-sm text-muted-foreground">{t("measures.open.lead")}</p>
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      <Field htmlFor={`${id}-kind`} label={t("measures.open.kind")} required hint={t(`measures.kindHints.${kind}`)}><Select id={`${id}-kind`} style={inputStyle} disabled={operation.pending} {...form.register("kind")}>{JUDICIAL_MEASURE_KINDS.map((item) => <option key={item} value={item}>{t(`measures.kinds.${item}`)}</option>)}</Select></Field>
      <Field htmlFor={`${id}-target-kind`} label={t("measures.open.targetKind")} required error={errors.targetKind?.message}><Select id={`${id}-target-kind`} style={inputStyle} disabled={operation.pending} {...form.register("targetKind")}>{CONSOLE_TARGETS[kind].map((item) => <option key={item} value={item}>{targetLabel(item)}</option>)}</Select></Field>
    </div>
    {networkTarget ? (networkId ? null : <p role="alert" className="text-sm">{t("measures.open.networkMissing")}</p>) : <div className="flex min-w-0 flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1"><Field htmlFor={`${id}-ref`} label={t("measures.open.ref")} required hint={t(targetKind === "person" || targetKind === "page" ? "measures.open.refHintHandle" : "measures.open.refHintId")} error={errors.ref?.message}><TextInput id={`${id}-ref`} style={inputStyle} autoComplete="off" maxLength={200} disabled={operation.pending} {...form.register("ref")} /></Field></div>
      <Button type="button" variant="outline" style={controlStyle} disabled={operation.pending || ref === ""} onClick={() => setSearched({ kind: targetKind, ref })}><Search size={16} aria-hidden="true" />{t("measures.open.verify")}</Button>
    </div>}
    {fresh ? preview === undefined ? <LoadingRows /> : preview === null ? <p role="alert" className="text-sm">{t("measures.open.previewNone")}</p> : <TargetPreview preview={preview} /> : null}
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      <Field htmlFor={`${id}-reference`} label={t("measures.open.orderReference")} required hint={t("measures.open.orderReferenceHint")} error={errors.orderReference?.message}><TextInput id={`${id}-reference`} style={inputStyle} autoComplete="off" maxLength={JUDICIAL_ORDER_REFERENCE_MAX} disabled={operation.pending} {...form.register("orderReference")} /></Field>
      {kind === "restrict_feature" ? <Field htmlFor={`${id}-feature`} label={t("measures.open.feature")} required error={errors.feature?.message}><Select id={`${id}-feature`} style={inputStyle} disabled={operation.pending} {...form.register("feature")}><option value="">{t("measures.open.featureChoose")}</option>{RESTRICTABLE_FEATURES.map((item) => <option key={item} value={item}>{t(`measures.features.${item}`)}</option>)}</Select></Field> : null}
      <Field htmlFor={`${id}-starts`} label={t("measures.open.startsAt")} required hint={t("measures.open.startsAtHint")} error={errors.startsAt?.message}><TextInput id={`${id}-starts`} type="datetime-local" style={inputStyle} disabled={operation.pending} {...form.register("startsAt")} /></Field>
      <Field htmlFor={`${id}-ends`} label={t("measures.open.endsAt")} required={isArticle44Kind(kind)} hint={t(isArticle44Kind(kind) ? "measures.open.endsAtHintArt44" : "measures.open.endsAtHint", { hours: ARTICLE_44_MAX_MS / HOUR_MS })} error={errors.endsAt?.message}><TextInput id={`${id}-ends`} type="datetime-local" style={inputStyle} disabled={operation.pending} {...form.register("endsAt")} /></Field>
    </div>
    {kind === "pin_correction" ? <Field htmlFor={`${id}-correction`} label={t("measures.open.correctionText")} required hint={t("measures.open.correctionHint")} error={errors.correctionText?.message}><TextArea id={`${id}-correction`} maxLength={JUDICIAL_CORRECTION_MAX} disabled={operation.pending} {...form.register("correctionText")} /></Field> : null}
    {kind === "origin_label" ? <Field htmlFor={`${id}-origin`} label={t("measures.open.originLabel")} required hint={t("measures.open.originHint")} error={errors.originLabel?.message}><TextInput id={`${id}-origin`} style={inputStyle} maxLength={JUDICIAL_ORIGIN_LABEL_MAX} disabled={operation.pending} {...form.register("originLabel")} /></Field> : null}
    <Field htmlFor={`${id}-reason`} label={t("common.reason")} required hint={t("common.reasonHint")} error={errors.reason?.message}><TextArea id={`${id}-reason`} maxLength={500} disabled={operation.pending} {...form.register("reason")} /></Field>
    <OperationFailure message={operation.error} />
    <div className="flex flex-wrap gap-2">
      <Button type="submit" variant="primary" style={controlStyle} disabled={operation.pending || !fresh || !preview}><Gavel size={16} aria-hidden="true" />{t(operation.pending ? "common.saving" : "measures.open.submit")}</Button>
      <Button type="button" variant="ghost" style={controlStyle} disabled={operation.pending} onClick={() => { form.reset(); setSearched(null); onDone() }}>{t("common.cancel")}</Button>
    </div>
  </form>
}

/** La preuve horodatée : le journal de la mesure, ligne par ligne (qui, quand, quoi, quelle référence). */
function MeasureJournal({ measureId }: { measureId: Id<"judicialMeasures"> }) {
  const { t } = useTranslation("operations")
  const window = useWindowCursor()
  const result = useQuery(api.modules.platform.audit.paginateSubjectAudit, { subjectTable: "judicialMeasures", subjectId: measureId, paginationOpts: { cursor: window.cursor, numItems: 20, maximumRowsRead: 50, maximumBytesRead: 262_144 } })
  return <div className="flex min-w-0 flex-col gap-3">
    {result === undefined ? <LoadingRows /> : result.page.length === 0 ? <EmptyRows done={result.isDone} /> : <ol className="flex min-w-0 flex-col gap-2">{result.page.map((entry) => <li key={entry.auditId} className="min-w-0 border-t border-border pt-2 text-sm">
      <p><span className="font-mono text-xs" translate="no">{entry.action}</span> · <ConsoleDate at={entry.at} /></p>
      <p className="break-words text-muted-foreground">{entry.actor?.displayName ?? t(entry.capacity === "system" ? "audit.system" : "audit.hiddenActor")}</p>
      {typeof entry.details?.reason === "string" ? <p className="whitespace-pre-wrap break-words">{entry.details.reason}</p> : null}
    </li>)}</ol>}
    <WindowPagination window={window} result={result} />
  </div>
}

export function MeasureCard({ measure, now }: { measure: ConsoleMeasure; now: number }) {
  const { t } = useTranslation("operations")
  const targetLabel = useTargetLabel()
  const [journal, setJournal] = useState(false)
  const confirm = useMutation(api.modules.moderation.measures.confirmMeasure)
  const lift = useMutation(api.modules.moderation.measures.liftMeasure)
  const merits = useMutation(api.modules.moderation.measures.noteMeritsAction)
  const timing = timingOf(measure)
  const overdue = isJudicialConfirmationOverdue(timing, now)
  const lapse = isJudicialLapseReminderDue(timing, now)
  const active = measure.status === "active"
  return <li className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-4">
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-2">
      <h3 className="break-words font-semibold">{t(`measures.kinds.${measure.kind}`)}</h3>
      <span className="text-xs text-muted-foreground">{t(active ? "measures.card.active" : "measures.card.lifted")}</span>
    </header>
    {overdue ? <p role="status" className="rounded-lg border border-destructive p-2 text-sm">{t("measures.card.confirmationOverdue")}</p> : null}
    {lapse ? <p role="status" className="rounded-lg border border-destructive p-2 text-sm">{t("measures.card.lapseDue", { days: JUDICIAL_LAPSE_REMINDER_MS / DAY_MS })}</p> : null}
    <dl className="grid min-w-0 gap-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
      <div className="min-w-0"><dt className="text-muted-foreground">{t("measures.card.target")}</dt><dd className="break-words">{targetLabel(measure.target.kind)}{measure.targetLabel ? ` · ${measure.targetLabel}` : ""}<span className="block break-all font-mono text-xs text-muted-foreground" translate="no">{measure.target.id}</span></dd></div>
      <div className="min-w-0"><dt className="text-muted-foreground">{t("measures.card.network")}</dt><dd className="break-words">{measure.networkName ?? t("measures.card.unknown")}</dd></div>
      <div className="min-w-0"><dt className="text-muted-foreground">{t("measures.card.reference")}</dt><dd className="break-words" translate="no">{measure.orderReference}</dd></div>
      <div className="min-w-0"><dt className="text-muted-foreground">{t("measures.card.startsAt")}</dt><dd><ConsoleDate at={measure.startsAt} /></dd></div>
      <div className="min-w-0"><dt className="text-muted-foreground">{t("measures.card.executedAt")}</dt><dd><ConsoleDate at={measure.executedAt} />{measure.createdBy?.displayName ? ` · ${measure.createdBy.displayName}` : ""}</dd></div>
      <div className="min-w-0"><dt className="text-muted-foreground">{t("measures.card.endsAt")}</dt><dd>{measure.endsAt !== null ? <ConsoleDate at={measure.endsAt} /> : t("measures.card.noEnd")}</dd></div>
      <div className="min-w-0"><dt className="text-muted-foreground">{t("measures.card.confirmation")}</dt><dd>{measure.confirmedAt !== null ? <><ConsoleDate at={measure.confirmedAt} />{measure.confirmedBy?.displayName ? ` · ${measure.confirmedBy.displayName}` : ""}</> : <>{t("measures.card.confirmBefore")} <ConsoleDate at={measure.confirmationDueAt} /></>}</dd></div>
      {measure.feature ? <div className="min-w-0"><dt className="text-muted-foreground">{t("measures.card.feature")}</dt><dd>{t(`measures.features.${measure.feature}`)}</dd></div> : null}
      {measure.meritsActionNotedAt !== null ? <div className="min-w-0"><dt className="text-muted-foreground">{t("measures.card.merits")}</dt><dd><ConsoleDate at={measure.meritsActionNotedAt} /></dd></div> : null}
      {measure.liftedAt !== null ? <div className="min-w-0"><dt className="text-muted-foreground">{t("measures.card.liftedAt")}</dt><dd><ConsoleDate at={measure.liftedAt} /> · {measure.liftCause === "expired" ? t("measures.card.liftedExpired") : measure.liftedBy?.displayName ?? t("audit.hiddenActor")}</dd></div> : null}
    </dl>
    {measure.correctionText ? <blockquote className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm"><p className="mb-1 text-xs text-muted-foreground">{t("measures.card.correction")}</p>{measure.correctionText}</blockquote> : null}
    {measure.originLabel ? <p className="break-words rounded-lg bg-muted p-3 text-sm"><span className="block text-xs text-muted-foreground">{t("measures.card.origin")}</span>{measure.originLabel}</p> : null}
    {active ? <div className="flex flex-wrap gap-3">
      {measure.confirmedAt === null ? measure.createdByMe ? <p className="text-sm text-muted-foreground">{t("measures.card.confirmOwn")}</p> : <MotiveAction label={t("measures.card.confirm")} minLength={JUDICIAL_REASON_MIN} successKey="measures.card.confirmed" onDecision={(reason) => confirm({ measureId: measure.measureId, reason })} /> : null}
      {measure.meritsActionNotedAt === null ? <MotiveAction label={t("measures.card.noteMerits")} minLength={JUDICIAL_REASON_MIN} successKey="measures.card.meritsNoted" onDecision={(reason) => merits({ measureId: measure.measureId, reason })} /> : null}
      <MotiveAction label={t("measures.card.lift")} danger minLength={JUDICIAL_REASON_MIN} successKey="measures.card.liftDone" onDecision={(reason) => lift({ measureId: measure.measureId, reason })} />
    </div> : null}
    <Button variant="ghost" style={controlStyle} aria-expanded={journal} onClick={() => setJournal((value) => !value)}>{t(journal ? "measures.card.journalHide" : "measures.card.journal")}</Button>
    {journal ? <MeasureJournal measureId={measure.measureId} /> : null}
  </li>
}

function MeasureList({ status }: { status: "active" | "lifted" }) {
  const window = useWindowCursor()
  const now = useMinuteClock()
  const result = useQuery(api.modules.moderation.measures.paginateMeasures, { status, paginationOpts: { cursor: window.cursor, numItems: PAGE_SIZE } })
  return <div className="flex min-w-0 flex-col gap-4">
    {result === undefined ? <LoadingRows /> : result.page.length === 0 ? <EmptyRows done={result.isDone} /> : <ul className="flex min-w-0 flex-col gap-4">{result.page.map((measure) => <MeasureCard key={measure.measureId} measure={measure} now={now} />)}</ul>}
    <WindowPagination window={window} result={result} />
  </div>
}

export function MeasuresPanel({ networkId }: { networkId?: Id<"networks"> }) {
  const { t } = useTranslation("operations")
  const [status, setStatus] = useState<"active" | "lifted">("active")
  const [opening, setOpening] = useState(false)
  return <section className={`${panelClass} flex min-w-0 flex-col gap-4`}>
    <h2 className="flex items-center gap-2 text-xl font-semibold"><Gavel size={22} aria-hidden="true" />{t("measures.title")}</h2>
    <p className="text-sm text-muted-foreground">{t("measures.lead")}</p>
    <p className="rounded-lg bg-muted p-3 text-sm">{t("measures.rules", { hours: JUDICIAL_CONFIRMATION_DELAY_MS / HOUR_MS, max: ARTICLE_44_MAX_MS / HOUR_MS, days: JUDICIAL_LAPSE_REMINDER_MS / DAY_MS })}</p>
    <JudicialMeasureAlert />
    {opening ? <OpenMeasureForm networkId={networkId} onDone={() => setOpening(false)} /> : <Button variant="primary" style={controlStyle} className="self-start" onClick={() => setOpening(true)}><Gavel size={16} aria-hidden="true" />{t("measures.open.show")}</Button>}
    <div role="group" aria-label={t("measures.tabs.label")} className="flex flex-wrap gap-2">
      {(["active", "lifted"] as const).map((item) => <Button key={item} variant={status === item ? "outline" : "ghost"} style={controlStyle} aria-pressed={status === item} onClick={() => setStatus(item)}>{t(`measures.tabs.${item}`)}</Button>)}
    </div>
    <MeasureList key={status} status={status} />
  </section>
}
