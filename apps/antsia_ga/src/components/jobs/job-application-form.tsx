"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { COMMERCE_JOBS_APPLICATION_CONSENT_VERSION, COMMERCE_JOBS_ATTACHMENT_KINDS, COMMERCE_JOBS_LIMITS } from "@antsia/social-domain/commerce-jobs"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import { FileUp, Send, Trash2 } from "lucide-react"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { normalizeCivilName } from "@antsia/social-domain/civilName"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { Button, Card, Field, TextArea, TextInput } from "@/components/shared/controls"
import { FORM_FIELDS, SCREEN_SECTIONS } from "@/components/shared/screen-layout"
import { SHOP_SELECT_CLASS } from "@/components/shops/shop-ui"
import { JobIntentRecovery, JobReviewNotice, useJobAction, useJobEntryIntent, useJobIntent, useJobReview } from "./job-guards"
import { JOB_FILE_ACCEPT, JOB_FILE_MAX_BYTES, jobApplicationSchema, jobCivilNamePreview, jobFileSizeKb, selectableJobFiles, type JobApplicationInput, type JobApplicationValues, type JobDto, type JobFileDto } from "./job-model"

const uploadResponse = z.object({ storageId: z.string().min(1).max(200) })

/** Mes pièces : dépôt (PDF, 5 Mo, analyse complète), état d'analyse, retrait. Jamais d'adresse de fichier. */
type JobFilesProps = { files: readonly JobFileDto[]; onUploaded?: (fileId: Id<"commerceApplicationFiles">) => void; disabled?: boolean; onReview?: () => Promise<boolean> }
export function JobFilesManager(props: JobFilesProps) {
  const { networkId, personId } = useNetwork()
  return <JobFilesBody key={JSON.stringify([networkId, personId])} {...props} />
}
function JobFilesBody({ files, onUploaded, disabled = false, onReview }: JobFilesProps) {
  const { t } = useTranslation("jobs")
  const { networkId } = useNetwork()
  const generateUploadUrl = useMutation(api.modules.shops.jobFiles.generateUploadUrl)
  const registerFile = useMutation(api.modules.shops.jobFiles.registerFile)
  const retireFile = useMutation(api.modules.shops.jobFiles.retireFile)
  const action = useJobAction()
  const review = useJobReview()
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => { controller.current?.abort() }, [])
  const paused = disabled || review.paused || review.pending
  const kindId = useId(), fileId = useId()
  const schema = useMemo(() => z.object({
    kind: z.enum(COMMERCE_JOBS_ATTACHMENT_KINDS),
    file: z.custom<File>((value) => typeof File !== "undefined" && value instanceof File, t("files.notPdf"))
      .refine((file) => file.type === JOB_FILE_ACCEPT || file.name.toLowerCase().endsWith(".pdf"), t("files.notPdf"))
      .refine((file) => file.size > 0 && file.size <= JOB_FILE_MAX_BYTES, t("files.tooLarge")),
  }), [t])
  type UploadValues = z.infer<typeof schema>
  const form = useForm<UploadValues>({ resolver: zodResolver(schema), defaultValues: { kind: "cv" } })
  const fileError = form.formState.errors.file?.message
  const upload = form.handleSubmit(async (values) => {
    if (paused || !navigator.onLine || !action.current()) return
    const stamp = review.stamp
    const admitted = () => action.current() && review.current(stamp) && navigator.onLine && !disabled
    await action.run(async () => {
      const url = await generateUploadUrl({ networkId })
      if (!admitted()) throw new Error("jobUploadInterrupted")
      const transfer = new AbortController(); controller.current = transfer
      try {
        const response = await fetch(url, { method: "POST", headers: { "Content-Type": JOB_FILE_ACCEPT }, body: values.file, signal: transfer.signal })
        if (!admitted()) throw new Error("jobUploadInterrupted")
        if (!response.ok) throw new Error("upload")
        const { storageId } = uploadResponse.parse(await response.json())
        if (!admitted()) throw new Error("jobUploadInterrupted")
        const result = await registerFile({ networkId, storageId: storageId as Id<"_storage">, kind: values.kind, filename: values.file.name, mimeType: JOB_FILE_ACCEPT })
        if (!admitted()) throw new Error("jobUploadInterrupted")
        return result
      } finally { if (controller.current === transfer) controller.current = null }
    }, (result) => { if (admitted()) { form.reset({ kind: values.kind }); toast.success(t("files.uploaded")); onUploaded?.(result.fileId) } })
  })

  return <section aria-labelledby={`${kindId}-title`} className="grid gap-3">
    <JobReviewNotice review={review} onReview={onReview ?? (async () => false)} />
    <h3 id={`${kindId}-title`} className="font-display text-base font-bold leading-snug">{t("files.title")}</h3>
    <p className="text-sm text-muted-foreground">{t("files.pdfOnly")}</p>
    {files.length === 0 ? <p className="text-sm text-muted-foreground">{t("files.empty")}</p> : <ul className="grid gap-2">{files.map((file) => <li key={file.fileId} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--ui2-card-radius)] border border-border p-4">
      <span className="grid min-w-0 gap-0.5"><span className="font-medium">{file.filename ?? t("files.unnamed")}</span><span className="text-sm text-muted-foreground">{t(`files.kind.${file.kind}`)} · {t("files.size", { size: jobFileSizeKb(file.byteSize) })} · {t(`files.scan.${file.scan}`)}</span></span>
      <Button type="button" variant="danger" pending={action.pending} disabled={paused} onClick={() => { if (!paused && navigator.onLine && action.current() && window.confirm(t("files.retireConfirm")) && navigator.onLine && action.current()) void action.run(async () => await retireFile({ fileId: file.fileId }), () => { toast.success(t("files.retired")) }) }}><Trash2 aria-hidden="true" className="size-4" />{t("files.retire")}</Button>
    </li>)}</ul>}
    <form noValidate onSubmit={(event) => { void upload(event) }} className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] sm:items-end">
      <Field id={kindId} label={t("files.kindLabel")}><select id={kindId} className={SHOP_SELECT_CLASS} disabled={paused || action.pending} {...form.register("kind")}>{COMMERCE_JOBS_ATTACHMENT_KINDS.map((kind) => <option key={kind} value={kind}>{t(`files.kind.${kind}`)}</option>)}</select></Field>
      <Field id={fileId} label={t("files.pick")} error={fileError}><input id={fileId} type="file" accept={JOB_FILE_ACCEPT} disabled={paused || action.pending} aria-invalid={fileError ? true : undefined} aria-describedby={fileError ? `${fileId}-error` : undefined} className="min-h-11 w-full rounded-[var(--esp-field-radius)] border border-input bg-muted px-3 py-2 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => form.setValue("file", event.target.files?.[0] as File, { shouldValidate: true })} /></Field>
      <Button type="submit" variant="outline" pending={action.pending} disabled={paused}><FileUp aria-hidden="true" className="size-4" />{action.pending ? t("files.uploading") : t("files.pick")}</Button>
    </form>
    {action.error ? <p role="alert" className="text-sm text-destructive">{action.error}</p> : null}
  </section>
}

/**
 * Formulaire de candidature : nom civil (aperçu normalisé tel que transmis),
 * motivation facultative, pièces prêtes choisies, accord versionné. Une clé
 * d'idempotence persistée avant l'envoi, récupérée avant toute nouvelle intention.
 *
 * ⚠️ AUCUN formulaire imbriqué (P18b, A19). Le dépôt de pièce a son propre
 * `<form>` (`JobFilesManager`) : rendu DANS celui de la candidature, son envoi
 * remontait jusqu'à elle — un simple dépôt validait, voire envoyait, la
 * candidature. Le `<form>` de candidature se ferme donc avant le gestionnaire
 * de pièces ; l'accord et le bouton d'envoi, qui suivent visuellement, lui
 * restent rattachés par l'attribut `form` (même ordre à l'écran, même envoi).
 */
export type JobApplicationDraft = Pick<JobApplicationInput, "firstName" | "lastName" | "motivation" | "fileIds">
type ApplicationFormProps = { job: JobDto; sourceAvailable?: boolean; onReview?: () => Promise<boolean>; initialDraft?: JobApplicationDraft; onDraft?: (draft: JobApplicationDraft) => void }
export function JobApplicationForm(props: ApplicationFormProps) {
  const { networkId, personId } = useNetwork()
  return <JobApplicationFields key={JSON.stringify([networkId, personId, props.job.shopHandle, props.job.jobRef])} {...props} />
}
function JobApplicationFields({ job, sourceAvailable = true, onReview, initialDraft, onDraft }: ApplicationFormProps) {
  const { t } = useTranslation("jobs")
  const { networkId } = useNetwork()
  const apply = useMutation(api.modules.shops.jobApplications.apply)
  const filesQuery = useAuthenticatedConvexQuery(api.modules.shops.jobFiles.myFiles, {})
  const localIntent = useJobIntent(job.shopHandle, job.jobRef)
  const intent = useJobEntryIntent() ?? localIntent
  const action = useJobAction()
  const review = useJobReview(JSON.stringify([job.jobRef, job.revision, job.status, job.actions.apply, sourceAvailable]))
  const [error, setError] = useState<string | null>(null)
  const ids = { first: useId(), last: useId(), motivation: useId(), consent: useId(), form: useId() }
  const schema = useMemo(() => jobApplicationSchema({
    nameRequired: t("apply.nameRequired"), nameTooLong: t("apply.nameTooLong"), nameInvalid: t("apply.nameInvalid"),
    motivationTooLong: t("apply.motivationTooLong"), filesTooMany: t("apply.filesTooMany"), consentRequired: t("apply.consentRequired"),
  }), [t])
  const form = useForm<JobApplicationInput, unknown, JobApplicationValues>({ resolver: zodResolver(schema), defaultValues: { firstName: "", lastName: "", motivation: "", fileIds: [], ...initialDraft, consent: false } })
  const [firstName, lastName, chosen, motivation] = form.watch(["firstName", "lastName", "fileIds", "motivation"])
  useEffect(() => { onDraft?.({ firstName: firstName ?? "", lastName: lastName ?? "", motivation: motivation ?? "", fileIds: [...(chosen ?? [])] }) }, [firstName, lastName, motivation, chosen, onDraft])
  const preview = jobCivilNamePreview(firstName ?? "", lastName ?? "")
  const filesReady = !filesQuery.isError && !filesQuery.isPending && filesQuery.data !== undefined
  const files = selectableJobFiles(filesReady ? filesQuery.data ?? [] : [])
  const conditions = JSON.stringify([job.jobRef, job.revision, COMMERCE_JOBS_APPLICATION_CONSENT_VERSION, firstName, lastName, motivation, chosen, files.map((file) => [file.fileId, file.kind, file.scan])])
  const latestConditions = useRef(conditions); latestConditions.current = conditions
  const { setValue, setError: setFieldError } = form
  useEffect(() => { setValue("consent", false) }, [conditions, review.stamp, setValue])
  const staleSelection = filesReady && (chosen ?? []).some((fileId) => !files.some((file) => file.fileId === fileId))
  useEffect(() => { if (staleSelection) { setFieldError("fileIds", { message: t("recovery.filesStale") }); setValue("consent", false) } }, [staleSelection, setFieldError, setValue, t])
  const locked = !intent.ready || intent.locked || intent.failed || review.paused || !filesReady || !sourceAvailable || !job.actions.apply || job.status !== "open"
  const reread = async () => {
    const fresh = await filesQuery.refetch()
    if (!action.current() || fresh.isError || fresh.data === undefined) return false
    return onReview ? await onReview() : true
  }
  const errors = form.formState.errors
  const submit = form.handleSubmit(async (values) => {
    if (locked || !navigator.onLine || !action.current()) return
    setError(null)
    const stamp = review.stamp, expectedConditions = latestConditions.current
    await action.run(async () => {
      const fresh = await filesQuery.refetch()
      if (!action.current() || !navigator.onLine || !review.current(stamp) || latestConditions.current !== expectedConditions) return null
      if (fresh.isError || fresh.data === undefined) { setError(t("applications.unavailable")); return null }
      const admittedFiles = selectableJobFiles(fresh.data)
      if (new Set(values.fileIds).size !== values.fileIds.length || values.fileIds.some((fileId) => !admittedFiles.some((file) => file.fileId === fileId))) {
        setFieldError("fileIds", { message: t("recovery.filesStale") }); setValue("consent", false); return null
      }
      if (onReview && !await onReview()) return null
      if (!action.current() || !navigator.onLine || !review.current(stamp) || latestConditions.current !== expectedConditions) return null
      const idempotencyKey = intent.begin()
      if (!idempotencyKey) return null
      const civilName = normalizeCivilName({ firstName: values.firstName, lastName: values.lastName })
      return await apply({
        networkId, handle: job.shopHandle, jobRef: job.jobRef, ...civilName,
        ...(values.motivation.length > 0 ? { motivation: values.motivation } : {}),
        fileIds: values.fileIds as Id<"commerceApplicationFiles">[], consent: true, consentTextVersion: COMMERCE_JOBS_APPLICATION_CONSENT_VERSION, idempotencyKey,
      })
    }, (result) => { if (result && action.current()) { toast.success(t("apply.sent")); intent.complete(result.applicationId) } })
  })

  return <Card><section className="grid gap-5" aria-labelledby={`${ids.first}-title`}><JobReviewNotice review={review} onReview={reread} /><JobIntentRecovery intent={intent} onStopped={() => { setValue("consent", false); review.invalidate() }} /><div className={`${SCREEN_SECTIONS} gap-y-5`}><form id={ids.form} noValidate onSubmit={(event) => { void submit(event) }} className="grid min-w-0 gap-4">
    <fieldset disabled={locked || form.formState.isSubmitting} className="grid min-w-0 gap-4">
    <header className="grid min-w-0 gap-2"><h2 id={`${ids.first}-title`} className="text-lg font-semibold">{t("apply.title")}</h2><p className="text-sm text-muted-foreground">{t("apply.lead")}</p></header>
    <div className={`${FORM_FIELDS} gap-y-4`}>
      <Field id={ids.last} label={t("apply.lastName")} error={errors.lastName?.message}><TextInput id={ids.last} autoComplete="family-name" aria-invalid={errors.lastName ? true : undefined} aria-describedby={errors.lastName ? `${ids.last}-error` : undefined} {...form.register("lastName")} /></Field>
      <Field id={ids.first} label={t("apply.firstName")} error={errors.firstName?.message}><TextInput id={ids.first} autoComplete="given-name" aria-invalid={errors.firstName ? true : undefined} aria-describedby={errors.firstName ? `${ids.first}-error` : undefined} {...form.register("firstName")} /></Field>
    </div>
    <p className="text-sm text-muted-foreground">{t("apply.nameHint")}</p>
    {preview ? <p className="text-sm" aria-live="polite">{t("apply.namePreview", { name: preview })}</p> : null}
    <Field id={ids.motivation} label={t("apply.motivation")} hint={t("apply.motivationHint")} error={errors.motivation?.message}><TextArea id={ids.motivation} aria-invalid={errors.motivation ? true : undefined} aria-describedby={errors.motivation ? `${ids.motivation}-error` : `${ids.motivation}-hint`} {...form.register("motivation")} /></Field>
    <fieldset className="grid gap-2"><legend className="text-sm font-medium">{t("apply.files")}</legend><p className="text-sm text-muted-foreground">{t("apply.filesHint")}</p>
      {files.map((file) => <label key={file.fileId} className="flex min-h-11 items-center gap-3 rounded-[var(--ui2-card-radius)] border border-border px-3"><input type="checkbox" value={file.fileId} disabled={!(chosen ?? []).includes(file.fileId) && (chosen ?? []).length >= COMMERCE_JOBS_LIMITS.attachmentsMax} {...form.register("fileIds")} /><span>{file.filename ?? t("files.unnamed")} · {t(`files.kind.${file.kind}`)}</span></label>)}
      {errors.fileIds?.message ? <p role="alert" className="text-sm text-destructive">{errors.fileIds.message}</p> : null}
    </fieldset>
    </fieldset>
  </form>
    {/* HORS du formulaire de candidature : le dépôt de pièce a son propre formulaire (A19). */}
    <JobFilesManager files={filesReady ? filesQuery.data ?? [] : []} disabled={locked} onReview={reread} /></div>
    <section className="grid gap-2 rounded-[var(--ui2-card-radius)] border border-border p-4"><h3 className="font-display text-base font-bold leading-snug">{t("apply.consentTitle")}</h3><p className="text-sm">{t("apply.consentText")}</p>
      <label htmlFor={ids.consent} className="flex min-h-11 items-center gap-3"><input id={ids.consent} form={ids.form} type="checkbox" disabled={locked || form.formState.isSubmitting} aria-invalid={errors.consent ? true : undefined} {...form.register("consent")} /><span>{t("apply.consentLabel")}</span></label>
      {errors.consent?.message ? <p role="alert" className="text-sm text-destructive">{errors.consent.message}</p> : null}
    </section>
    {!filesReady ? <p role="alert" className="text-sm">{t("applications.unavailable")}</p> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {action.error ? <p role="alert" className="text-sm text-destructive">{action.error}</p> : null}
    <Button type="submit" form={ids.form} variant="commerce" pending={form.formState.isSubmitting} disabled={locked} className="w-full sm:w-auto sm:justify-self-start"><Send aria-hidden="true" className="size-4" />{t("apply.submit")}</Button>
  </section></Card>
}
