"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { EDITORIAL_BLOCKS_MAX, EDITORIAL_IMAGES_MAX } from "@antsia/social-domain/editorial"
import { EDITORIAL_IMAGE_CONSENT_VERSION } from "@antsia/social-domain/editorialAssets"
import { isMimeAllowedForUsage, UPLOAD_USAGES } from "@antsia/social-domain/uploadPolicy"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useEffect, useId, useRef, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Button, Card, Field, TextArea, TextInput } from "@/components/shared/controls"
import { useShopDirtyGuard } from "@/components/shops/shop-ui"
import { editorialDraftInput, editorialDraftSchema, editorialDraftValues, editorialImageSchema, editorialLocalPublicationInstant, editorialReasonSchema, editorialWriteInput, type EditorialDraftValues, type EditorialImageValues } from "@/lib/editorial-form"
import { EditorialArticleFields, EditorialDraftPreview, EditorialFrame, EditorialLinks, EditorialOperationStatus, EditorialUnavailable, GuardedEditorialImage, useEditorialOperation, type EditorialAssetView } from "./editorial-fields"

type Editor = NonNullable<FunctionReturnType<typeof api.modules.editorial.read.editor>>
type Media = NonNullable<FunctionReturnType<typeof api.modules.editorial.media.myMedia>>

export function EditorialArticleEditor({ articleId }: { articleId: Id<"editorialArticles"> }) {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("editorial")
  return <EditorialFrame title={t("article.title")} lead={t("article.lead")}><ArticleQuery key={JSON.stringify([networkId, personId, articleId])} articleId={articleId} /></EditorialFrame>
}
function ArticleQuery({ articleId }: { articleId: Id<"editorialArticles"> }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("editorial")
  const query = useAuthenticatedConvexQuery(api.modules.editorial.read.editor, { networkId, articleId })
  const [last, setLast] = useState<Editor | null>(null)
  useEffect(() => { if (!query.isError && !query.isFetching && query.data) setLast(query.data) }, [query.data, query.isError, query.isFetching])
  const head = !query.isError && !query.isFetching && query.data ? query.data : last
  if (!head) return query.isError || !query.isPending && query.data === null ? <EditorialUnavailable retry={() => { void query.refetch() }} /> : <p role="status">{t("status.loading")}</p>
  return <EditorialArticleForm head={head} unavailable={query.isError || query.isPending || query.data === null} refreshing={query.isFetching} reread={async () => { const value = await query.refetch(); return value.isError ? undefined : value.data }} />
}

/** Seule la version enregistrée relue peut faire l'objet d'une décision éditoriale. */
export function EditorialArticleForm({ head, unavailable = false, refreshing = false, reread }: { head: Editor; unavailable?: boolean; refreshing?: boolean; reread: () => Promise<Editor | null | undefined> }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("editorial")
  const operation = useEditorialOperation()
  const save = useMutation(api.modules.editorial.articles.saveDraft)
  const [assetCursor, setAssetCursor] = useState<string | null>(null)
  const [bylineCursor, setBylineCursor] = useState<string | null>(null)
  const media = useAuthenticatedConvexQuery(api.modules.editorial.media.myMedia, unavailable ? "skip" : { networkId, pageId: head.pageId })
  const grants = useAuthenticatedConvexQuery(api.modules.editorial.grants.list, unavailable ? "skip" : { networkId, pageId: head.pageId, paginationOpts: { cursor: bylineCursor, numItems: 12 } })
  const assets = useAuthenticatedConvexQuery(api.modules.editorial.assets.list, unavailable ? "skip" : { networkId, pageId: head.pageId, paginationOpts: { cursor: assetCursor, numItems: 12 } })
  const form = useForm<EditorialDraftValues>({ resolver: zodResolver(editorialDraftSchema(key => t(key))), defaultValues: editorialDraftValues(head.workingVersion) })
  const value = useWatch({ control: form.control }) as EditorialDraftValues
  const selectedIds = [...new Set(value.blocks.flatMap(block => block.type === "image" && /^[A-Za-z0-9_-]{1,128}$/u.test(block.assetId) ? [block.assetId as Id<"editorialAssets">] : []))]
  const selected = useAuthenticatedConvexQuery(api.modules.editorial.assets.resolve, !unavailable && operation.online && selectedIds.length > 0 && selectedIds.length <= EDITORIAL_IMAGES_MAX ? { networkId, pageId: head.pageId, assetIds: selectedIds } : "skip")
  const [revision, setRevision] = useState(head.revision)
  const [saved, setSaved] = useState(false)
  const revisionRef = useRef(revision)
  useEffect(() => { revisionRef.current = revision }, [revision])
  const { reset } = form
  const source = JSON.stringify(head)
  const closed = unavailable || refreshing || media.isError || media.isPending || media.isFetching || !media.data || grants.isError || grants.isPending || grants.isFetching
  useEffect(() => {
    const next = JSON.parse(source) as Editor
    if (!form.formState.isDirty && next.revision >= revisionRef.current && !unavailable && !operation.failure) { reset(editorialDraftValues(next.workingVersion)); setRevision(next.revision) }
  }, [source, form, reset, unavailable, operation.failure])
  const dirty = form.formState.isDirty
  useShopDirtyGuard(dirty)
  const bylines = !grants.isError && !grants.isPending && !grants.isFetching ? (grants.data?.page ?? []).filter(grant => grant.state === "accepted" && grant.bylineConsented && grant.authorityLive).map(grant => ({ grantId: grant.grantId, label: grant.displayName })) : []
  const libraryAssets = !unavailable && operation.online && !assets.isError && !assets.isPending && !assets.isFetching ? assets.data?.page ?? [] : []
  const currentAssets = !unavailable && operation.online && !selected.isError && !selected.isPending && !selected.isFetching ? selected.data ?? [] : []
  const assetChoices = [...currentAssets, ...libraryAssets.filter(asset => !currentAssets.some(item => item.assetId === asset.assetId))]
  const chosenBylineLive = value.byline === "media" || bylines.some(choice => choice.grantId === value.byline)
  const locked = closed || operation.pending || !operation.online || operation.needsReview || revision !== head.revision
  const read = async (replace = true) => {
    if (operation.pending || !navigator.onLine || replace && dirty && !window.confirm(t("status.reloadConfirm"))) return
    const result = await operation.run(async () => {
      const article = await reread()
      if (!article) throw new Error("unavailable")
      // Après un refus de l'éditeur, ses sous-requêtes sont encore en « skip » ;
      // la preuve principale réussie les réactive au rendu suivant.
      if (!unavailable) {
        const sources = await Promise.all([media.refetch(), grants.refetch(), assets.refetch(), ...(selectedIds.length > 0 ? [selected.refetch()] : [])])
        if (sources.some(value => value.isError)) throw new Error("unavailable")
      }
      return article
    })
    if (result) { if (replace) reset(editorialDraftValues(result.workingVersion)); setRevision(result.revision); operation.markReviewed(); setSaved(false) }
  }
  const canAddImage = value.blocks.length < EDITORIAL_BLOCKS_MAX && value.blocks.filter(block => block.type === "image").length < EDITORIAL_IMAGES_MAX
  return <div className="grid min-w-0 gap-5"><EditorialLinks pageId={head.pageId} handle={!closed ? media.data?.handle : undefined} canConfigure={!closed && !!media.data?.permissions.canConfigure} canManageGrants={!closed && !!media.data?.permissions.canManageGrants} /><div className="flex flex-wrap gap-3 text-sm"><p>{t("article.revision", { revision })}</p><p>{t("article.workingVersion", { version: head.workingVersion.versionNumber })}</p><p>{t(`workingStates.${head.workingState}`)}</p><p>{t(`publicationStates.${head.publicationState}`)}</p></div>{head.publishedVersion ? <div className="grid gap-2 rounded-lg bg-muted p-3"><p>{t("article.publishedVersion", { version: head.publishedVersion.versionNumber })}</p>{head.publishedVersion.versionId !== head.workingVersion.versionId ? <p className="text-sm">{t("article.correctionKept")}</p> : null}</div> : <p className="text-sm text-muted-foreground">{t("article.noPublishedVersion")}</p>}{head.reviewNote ? <Card><h2 className="font-semibold">{t("article.reviewNote")}</h2><p className="whitespace-pre-wrap">{head.reviewNote}</p></Card> : null}<EditorialOperationStatus operation={operation} />{closed ? <p role="alert">{t("status.unavailable")}</p> : null}{revision < head.revision ? <p role="status">{t("status.newer")}</p> : null}{revision > head.revision ? <p role="status">{t("status.reviewRequired")}</p> : null}<p role="status" className="text-sm text-muted-foreground">{t(dirty ? "status.dirty" : "status.pristine")}</p>
    <div className="grid min-w-0 gap-6 xl:grid-cols-2"><div className="grid min-w-0 content-start gap-4"><form className="grid min-w-0 gap-4" noValidate onSubmit={event => { void form.handleSubmit(async values => {
      if (locked || !head.permissions.canEdit || !chosenBylineLive) return
      const input = editorialDraftInput(values)
      if (!input) return
      const result = await operation.run(() => save({ networkId, articleId: head.articleId, expectedRevision: revision, input: editorialWriteInput(input) }))
      if (result) { reset(editorialDraftValues(input)); setRevision(result.revision); setSaved(true) }
    })(event) }}><EditorialArticleFields form={form} sections={media.data?.sections ?? []} bylines={bylines} assets={assetChoices} disabled={operation.pending || !head.permissions.canEdit} /><Button type="submit" pending={operation.pending} disabled={locked || !head.permissions.canEdit || !chosenBylineLive}>{t("actions.save")}</Button></form>{saved ? <p role="status">{t("article.saved")}</p> : null}{!head.permissions.canEdit ? <p role="status">{t("article.readOnly")}</p> : null}{!chosenBylineLive ? <p role="status">{t("validation.byline")}</p> : null}{grants.data && !grants.data.isDone ? <Button type="button" variant="outline" disabled={grants.isFetching || operation.pending} onClick={() => setBylineCursor(grants.data!.continueCursor)}>{t("article.moreBylines")}</Button> : null}{bylineCursor ? <Button type="button" variant="outline" disabled={grants.isFetching || operation.pending} onClick={() => setBylineCursor(null)}>{t("actions.first")}</Button> : null}</div>{!closed ? <EditorialDraftPreview value={value} mediaName={media.data!.name} assets={currentAssets} bylines={bylines} /> : null}</div>
    {!closed && head.permissions.canEdit ? <EditorialImageLibrary pageId={head.pageId} assets={libraryAssets} loading={assets.isPending || assets.isFetching} unavailable={assets.isError} disabled={locked} canAdd={canAddImage} onAdd={assetId => { if (!canAddImage || locked) return; const blocks = form.getValues("blocks"); if (blocks.some(block => block.type === "image" && block.assetId === assetId)) return; form.setValue("blocks", [...blocks, { type: "image", assetId }], { shouldDirty: true }) }} refresh={async () => { const result = await assets.refetch(); return !result.isError && result.data !== undefined }} /> : null}<div className="flex flex-wrap gap-2">{assets.data && !assets.data.isDone ? <Button variant="outline" disabled={assets.isFetching || closed} onClick={() => setAssetCursor(assets.data!.continueCursor)}>{t("images.next")}</Button> : null}{assetCursor ? <Button variant="outline" disabled={assets.isFetching || closed} onClick={() => setAssetCursor(null)}>{t("images.first")}</Button> : null}<Button type="button" variant="outline" pending={operation.pending} disabled={!operation.online} onClick={() => { void read() }}>{t("actions.reload")}</Button></div>
    <EditorialWorkflow head={head} disabled={locked || dirty} media={media.data ?? null} reread={async () => { const value = await reread(); return !!value }} onRevision={setRevision} />
    <EditorialHistory articleId={head.articleId} pageId={head.pageId} available={!closed && operation.online} mediaName={media.data?.name ?? ""} bylines={bylines} />
  </div>
}

function EditorialHistory({ articleId, pageId, available, mediaName, bylines }: { articleId: Id<"editorialArticles">; pageId: Id<"pages">; available: boolean; mediaName: string; bylines: { grantId: string; label: string }[] }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("editorial")
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)
  const history = useAuthenticatedConvexQuery(api.modules.editorial.read.history, open && available ? { networkId, articleId, paginationOpts: { cursor, numItems: 4 } } : "skip")
  return <details className="min-w-0 rounded-lg border border-border bg-card p-4" onToggle={event => setOpen(event.currentTarget.open)}><summary className="min-h-11 cursor-pointer rounded-lg py-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("history.title")}</summary>{open ? <div className="grid min-w-0 gap-4 pt-3"><p className="text-sm text-muted-foreground">{t("history.readOnly")}</p>{!available ? <p role="status">{t("status.unavailable")}</p> : history.isError ? <EditorialUnavailable retry={() => { void history.refetch() }} /> : history.isPending || history.isFetching || history.data === undefined ? <p role="status">{t("status.loading")}</p> : <>{history.data.page.length ? history.data.page.map(version => <EditorialHistoricalVersion key={version.versionId} version={version} pageId={pageId} available={available} mediaName={mediaName} bylines={bylines} />) : <p role="status">{t("history.empty")}</p>}<div className="flex flex-wrap gap-2">{!history.data.isDone && history.data.continueCursor ? <Button type="button" variant="outline" onClick={() => setCursor(history.data!.continueCursor)}>{t("history.next")}</Button> : null}{cursor ? <Button type="button" variant="outline" onClick={() => setCursor(null)}>{t("history.first")}</Button> : null}</div></>}</div> : null}</details>
}
function EditorialHistoricalVersion({ version, pageId, available, mediaName, bylines }: { version: FunctionReturnType<typeof api.modules.editorial.read.history>["page"][number]; pageId: Id<"pages">; available: boolean; mediaName: string; bylines: { grantId: string; label: string }[] }) {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("editorial")
  const [open, setOpen] = useState(false)
  const assetIds = [...new Set(version.blocks.flatMap(block => block.type === "image" ? [block.assetId] : []))]
  const selected = useAuthenticatedConvexQuery(api.modules.editorial.assets.resolve, open && available && assetIds.length > 0 && assetIds.length <= EDITORIAL_IMAGES_MAX ? { networkId, pageId, assetIds } : "skip")
  const assets = available && !selected.isError && !selected.isPending && !selected.isFetching ? selected.data ?? [] : []
  return <details className="min-w-0 rounded-lg border border-border p-3" onToggle={event => setOpen(event.currentTarget.open)}><summary className="min-h-11 cursor-pointer rounded-lg py-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("history.version", { version: version.versionNumber })} · {version.title}</summary>{open && available ? <div className="grid min-w-0 gap-3 pt-3"><p className="text-sm text-muted-foreground">{t("history.created", { date: new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en" : "fr", { dateStyle: "medium", timeStyle: "short" }).format(version.createdAt) })}</p>{version.moderationStatus === "pending_review" || version.moderationStatus === "removed" ? <p role="status">{t(`history.${version.moderationStatus}`)}</p> : null}<EditorialDraftPreview value={editorialDraftValues(version)} mediaName={mediaName} assets={assets} bylines={bylines} title={t("history.preview")} hint={t("history.readOnly")} /></div> : null}</details>
}

export function EditorialImageLibrary({ pageId, assets, loading, unavailable, disabled, canAdd, onAdd, refresh }: {
  pageId: Id<"pages">; assets: EditorialAssetView[]; loading: boolean; unavailable: boolean; disabled: boolean; canAdd: boolean; onAdd: (assetId: string) => void; refresh: () => Promise<boolean>;
}) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("editorial")
  const id = useId()
  const operation = useEditorialOperation()
  const uploadUrl = useMutation(api.modules.editorial.assets.uploadUrl)
  const attach = useMutation(api.modules.editorial.assets.attach)
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const form = useForm<EditorialImageValues>({ resolver: zodResolver(editorialImageSchema(key => t(key))), defaultValues: { altText: "", credit: "", rightsConsent: false } })
  const watched = useWatch({ control: form.control })
  const stamp = JSON.stringify([watched.altText, watched.credit, file?.name, file?.size, file?.lastModified, operation.generation])
  const { setValue } = form
  useEffect(() => { setValue("rightsConsent", false) }, [stamp, setValue])
  const locked = disabled || operation.pending || !operation.online || operation.needsReview
  return <Card><div className="grid min-w-0 gap-4"><h2 className="mp-subtitle">{t("images.title")}</h2><p className="text-sm text-muted-foreground">{t("images.lead")}</p><EditorialOperationStatus operation={operation} />{loading ? <p role="status">{t("status.loading")}</p> : unavailable ? <EditorialUnavailable /> : assets.length ? <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">{assets.map(asset => <figure key={asset.assetId} className="grid min-w-0 content-start gap-2 rounded-lg border border-border p-3"><GuardedEditorialImage asset={asset} /><figcaption className="grid gap-1 text-sm"><p>{asset.altText}</p><p className="text-muted-foreground">{asset.credit}</p></figcaption><Button type="button" variant="outline" disabled={locked || !canAdd} onClick={() => onAdd(asset.assetId)}>{t("images.add")}</Button></figure>)}</div> : <p>{t("images.empty")}</p>}{!canAdd ? <p role="status">{t("images.limit")}</p> : null}<form className="grid min-w-0 gap-4 border-t border-border pt-4" noValidate onSubmit={event => { void form.handleSubmit(async values => {
    if (locked || !file) return
    const generation = operation.generation
    const result = await operation.run(async () => {
      const url = await uploadUrl({ networkId, pageId })
      if (!operation.current(generation)) throw new Error("scopeChanged")
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file })
      if (!response.ok || !operation.current(generation)) throw new Error("upload")
      const parsed = z.object({ storageId: z.string().min(1).max(128) }).strict().parse(await response.json())
      if (!operation.current(generation)) throw new Error("scopeChanged")
      return attach({ networkId, pageId, storageId: parsed.storageId as Id<"_storage">, mimeType: file.type, altText: values.altText, credit: values.credit, rightsConsentTextVersion: EDITORIAL_IMAGE_CONSENT_VERSION })
    })
    if (result) { setFile(null); if (input.current) input.current.value = ""; form.reset({ altText: "", credit: "", rightsConsent: false }); setUploaded(true); await refresh() }
  })(event) }}><fieldset disabled={operation.pending || disabled} className="grid min-w-0 gap-3"><Field id={`${id}-file`} label={t("images.pick")} hint={t("images.fileHint")} error={fileError ? t("images.invalid") : undefined}><input id={`${id}-file`} ref={input} type="file" accept={UPLOAD_USAGES.editorial_image.mimeTypes.join(",")} className="min-h-11 w-full rounded-lg border border-input bg-muted p-3 text-sm" aria-describedby={`${id}-file-hint`} onChange={event => {
    const next = event.target.files?.[0] ?? null
    const valid = !!next && isMimeAllowedForUsage("editorial_image", next.type) && next.size > 0 && next.size <= UPLOAD_USAGES.editorial_image.maxBytes
    setFile(valid ? next : null); setFileError(!!next && !valid); setUploaded(false); setValue("rightsConsent", false)
  }} /></Field><Field id={`${id}-alt`} label={t("images.alt")} hint={t("images.altHint")} error={form.formState.errors.altText?.message}><TextInput id={`${id}-alt`} maxLength={300} aria-describedby={`${id}-alt-hint`} {...form.register("altText")} /></Field><Field id={`${id}-credit`} label={t("images.credit")} hint={t("images.creditHint")} error={form.formState.errors.credit?.message}><TextInput id={`${id}-credit`} maxLength={200} aria-describedby={`${id}-credit-hint`} {...form.register("credit")} /></Field><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-5 accent-primary" {...form.register("rightsConsent")} /><span>{t("images.consent")}</span></label><p className="text-xs text-muted-foreground">{t("config.consentVersion", { version: EDITORIAL_IMAGE_CONSENT_VERSION })}</p>{form.formState.errors.rightsConsent?.message ? <p role="alert">{form.formState.errors.rightsConsent.message}</p> : null}<Button type="submit" pending={operation.pending} disabled={locked || !file}>{t("images.upload")}</Button></fieldset></form>{uploaded ? <p role="status">{t("images.uploaded")}</p> : null}<Button type="button" variant="outline" pending={operation.pending} disabled={!operation.online || disabled} onClick={() => { void operation.run(async () => ({ ready: await refresh() })).then(value => { if (value?.ready) operation.markReviewed() }) }}>{t("images.refresh")}</Button></div></Card>
}

function EditorialWorkflow({ head, disabled, media, reread, onRevision }: { head: Editor; disabled: boolean; media: Media | null; reread: () => Promise<boolean>; onRevision: (revision: number) => void }) {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("editorial")
  const operation = useEditorialOperation()
  const submit = useMutation(api.modules.editorial.articles.submit)
  const requestChanges = useMutation(api.modules.editorial.articles.requestChanges)
  const approve = useMutation(api.modules.editorial.articles.approve)
  const publish = useMutation(api.modules.editorial.articles.publish)
  const schedule = useMutation(api.modules.editorial.articles.schedule)
  const cancelSchedule = useMutation(api.modules.editorial.articles.cancelSchedule)
  const withdraw = useMutation(api.modules.editorial.articles.withdraw)
  const locked = disabled || operation.pending || !operation.online || operation.needsReview
  const needsCorrection = !!head.publishedVersion && head.workingVersion.versionId !== head.publishedVersion.versionId && !head.workingVersion.correctionNotice
  const args = { networkId, articleId: head.articleId, expectedRevision: head.revision }
  const apply = async (kind: "submit" | "approve" | "publish" | "cancelSchedule") => {
    const allowed = kind === "submit" ? head.permissions.canSubmit : kind === "approve" ? head.permissions.canApprove : kind === "publish" ? head.permissions.canPublish : head.permissions.canCancelSchedule
    if (locked || !allowed || (kind === "approve" || kind === "publish") && needsCorrection || !window.confirm(t(`workflow.${kind}Confirm`))) return
    const mutation = kind === "submit" ? submit : kind === "approve" ? approve : kind === "publish" ? publish : cancelSchedule
    const result = await operation.run(() => mutation(args))
    if (result) { onRevision(result.revision); await reread() }
  }
  const localLabel = (publishAt: number) => new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en" : "fr", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset" }).format(publishAt)
  return <Card><section className="grid min-w-0 gap-4"><h2 className="mp-subtitle">{t("workflow.title")}</h2><p className="text-sm text-muted-foreground">{t("workflow.lead")}</p><EditorialOperationStatus operation={operation} />{needsCorrection ? <p role="status">{t("workflow.missingCorrection")}</p> : null}{media && head.publicationState === "published" ? <p className="text-sm text-muted-foreground">{t("article.correctionKept")}</p> : null}<div className="flex flex-wrap gap-2">{head.permissions.canSubmit ? <Button disabled={locked} onClick={() => { void apply("submit") }}>{t("actions.submit")}</Button> : null}{head.permissions.canApprove ? <Button disabled={locked || needsCorrection} onClick={() => { void apply("approve") }}>{t("actions.approve")}</Button> : null}{head.permissions.canPublish ? <Button disabled={locked || needsCorrection} onClick={() => { void apply("publish") }}>{t("actions.publish")}</Button> : null}{head.permissions.canCancelSchedule ? <Button variant="outline" disabled={locked} onClick={() => { void apply("cancelSchedule") }}>{t("actions.cancelSchedule")}</Button> : null}</div>{head.scheduledAt ? <p>{t("article.scheduledAt", { date: localLabel(head.scheduledAt) })}</p> : null}
    {head.permissions.canRequestChanges ? <EditorialReasonForm label={t("workflow.note")} actionLabel={t("actions.requestChanges")} disabled={locked} onSubmit={async note => {
      if (locked || !window.confirm(t("workflow.requestChangesConfirm"))) return false
      const result = await operation.run(() => requestChanges({ ...args, note }))
      if (!result) return false
      onRevision(result.revision); await reread(); return true
    }} /> : null}{head.permissions.canSchedule ? <EditorialScheduleForm disabled={locked || needsCorrection} onSubmit={async value => {
      if (locked || needsCorrection || !window.confirm(t("workflow.scheduleConfirm", { local: localLabel(value.publishAt), utc: value.utc }))) return false
      const result = await operation.run(() => schedule({ ...args, publishAt: value.publishAt }))
      if (!result) return false
      onRevision(result.revision); await reread(); return true
    }} /> : null}{head.permissions.canWithdraw ? <EditorialReasonForm label={t("workflow.reason")} actionLabel={t("actions.withdraw")} disabled={locked} onSubmit={async reason => {
      if (locked || !window.confirm(t("workflow.withdrawConfirm"))) return false
      const result = await operation.run(() => withdraw({ ...args, reason }))
      if (!result) return false
      onRevision(result.revision); await reread(); return true
    }} /> : null}{operation.needsReview ? <Button type="button" variant="outline" pending={operation.pending} disabled={!operation.online || disabled} onClick={() => { void operation.run(async () => ({ ready: await reread() })).then(value => { if (value?.ready) operation.markReviewed() }) }}>{t("workflow.reload")}</Button> : null}</section></Card>
}
function EditorialReasonForm({ label, actionLabel, disabled, onSubmit }: { label: string; actionLabel: string; disabled: boolean; onSubmit: (text: string) => Promise<boolean> }) {
  const { t } = useTranslation("editorial")
  const id = useId()
  const form = useForm<{ text: string }>({ resolver: zodResolver(editorialReasonSchema(key => t(key))), defaultValues: { text: "" } })
  return <form noValidate className="grid gap-3 border-t border-border pt-4" onSubmit={event => { void form.handleSubmit(async value => { if (!disabled && await onSubmit(value.text)) form.reset({ text: "" }) })(event) }}><Field id={id} label={label} error={form.formState.errors.text?.message}><TextArea id={id} maxLength={1000} disabled={disabled} {...form.register("text")} /></Field><Button type="submit" variant="outline" disabled={disabled}>{actionLabel}</Button></form>
}
function EditorialScheduleForm({ disabled, onSubmit }: { disabled: boolean; onSubmit: (value: NonNullable<ReturnType<typeof editorialLocalPublicationInstant>>) => Promise<boolean> }) {
  const { t, i18n } = useTranslation("editorial")
  const id = useId()
  const schema = z.object({ localTime: z.string().refine(value => editorialLocalPublicationInstant(value, Date.now()) !== null, t("validation.schedule")) }).strict()
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { localTime: "" } })
  const selected = useWatch({ control: form.control, name: "localTime" })
  const instant = editorialLocalPublicationInstant(selected, Date.now())
  const locale = i18n.resolvedLanguage === "en" ? "en" : "fr"
  return <form noValidate className="grid gap-3 border-t border-border pt-4" onSubmit={event => { void form.handleSubmit(async value => {
    const current = editorialLocalPublicationInstant(value.localTime, Date.now())
    if (!disabled && current && await onSubmit(current)) form.reset({ localTime: "" })
  })(event) }}><Field id={id} label={t("workflow.schedule")} hint={t("workflow.scheduleHint")} error={form.formState.errors.localTime?.message}><TextInput id={id} type="datetime-local" step={60} disabled={disabled} aria-describedby={`${id}-hint`} {...form.register("localTime")} /></Field><p className="text-sm text-muted-foreground">{t("workflow.timeZone", { zone: Intl.DateTimeFormat().resolvedOptions().timeZone })}</p>{instant ? <p role="status" className="text-sm">{t("workflow.instant", { local: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(instant.publishAt), utc: instant.utc })}</p> : null}<Button type="submit" variant="outline" disabled={disabled}>{t("actions.schedule")}</Button></form>
}
