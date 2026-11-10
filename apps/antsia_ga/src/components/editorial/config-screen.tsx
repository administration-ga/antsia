"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { EDITORIAL_PUBLIC_CONSENT_VERSION } from "@antsia/social-domain/editorial"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useEffect, useId, useRef, useState } from "react"
import { useFieldArray, useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Button, Card, Field, TextArea, TextInput } from "@/components/shared/controls"
import { SHOP_SELECT_CLASS, useShopDirtyGuard } from "@/components/shops/shop-ui"
import { editorialConfigInput, editorialConfigSchema, editorialConfigValues, type EditorialConfigValues } from "@/lib/editorial-form"
import { EditorialFrame, EditorialLinks, EditorialOperationStatus, EditorialUnavailable, useEditorialOperation } from "./editorial-fields"

type Media = NonNullable<FunctionReturnType<typeof api.modules.editorial.media.myMedia>>

export function EditorialConfigScreen({ pageId }: { pageId: Id<"pages"> }) {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("editorial")
  return <EditorialFrame title={t("config.title")} lead={t("config.lead")}><ConfigQuery key={JSON.stringify([networkId, personId, pageId])} pageId={pageId} /></EditorialFrame>
}
function ConfigQuery({ pageId }: { pageId: Id<"pages"> }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("editorial")
  const query = useAuthenticatedConvexQuery(api.modules.editorial.media.myMedia, { networkId, pageId })
  const [initialized, setInitialized] = useState(false)
  const ready = !query.isPending && !query.isError && !query.isFetching && !!query.data
  useEffect(() => { if (ready) setInitialized(true) }, [ready])
  if (!initialized) return query.isError || !query.isPending && query.data === null ? <EditorialUnavailable retry={() => { void query.refetch() }} /> : <p role="status">{t("status.loading")}</p>
  if (!query.data) return <EditorialUnavailable retry={() => { void query.refetch() }} />
  return <EditorialConfigForm media={query.data} unavailable={query.isError || query.isPending || query.isFetching} reread={async () => { const value = await query.refetch(); return value.isError ? undefined : value.data }} />
}

export function EditorialConfigForm({ media, unavailable = false, reread }: { media: Media; unavailable?: boolean; reread: () => Promise<Media | null | undefined> }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("editorial")
  const id = useId()
  const operation = useEditorialOperation()
  const save = useMutation(api.modules.editorial.media.saveConfig)
  const form = useForm<EditorialConfigValues>({ resolver: zodResolver(editorialConfigSchema(key => t(key))), defaultValues: editorialConfigValues(media) })
  const array = useFieldArray({ control: form.control, name: "sections" })
  const content = useWatch({ control: form.control })
  const contentKey = JSON.stringify([content.description, content.sections, content.visibility, operation.generation])
  const [revision, setRevision] = useState(media.revision)
  const revisionRef = useRef(revision)
  useEffect(() => { revisionRef.current = revision }, [revision])
  const [saved, setSaved] = useState(false)
  const source = JSON.stringify(media)
  const { reset, setValue } = form
  useEffect(() => { setValue("publicConsent", false) }, [contentKey, setValue])
  useEffect(() => {
    const next = JSON.parse(source) as Media
    if (!form.formState.isDirty && next.revision >= revisionRef.current && !unavailable && !operation.failure) { reset(editorialConfigValues(next)); setRevision(next.revision) }
  }, [source, form, reset, unavailable, operation.failure])
  const dirty = form.formState.isDirty
  useShopDirtyGuard(dirty)
  const locked = unavailable || operation.pending || !operation.online || operation.needsReview || revision !== media.revision || !media.permissions.canConfigure
  const read = async () => {
    if (operation.pending || !navigator.onLine || dirty && !window.confirm(t("status.reloadConfirm"))) return
    setValue("publicConsent", false)
    const value = await operation.run(async () => ({ media: await reread() }))
    if (value?.media) { reset(editorialConfigValues(value.media)); setRevision(value.media.revision); operation.markReviewed(); setSaved(false) }
  }
  return <div className="grid min-w-0 gap-4"><EditorialLinks pageId={media.pageId} handle={media.handle} canConfigure={media.permissions.canConfigure} canManageGrants={media.permissions.canManageGrants} /><h2 className="mp-subtitle">{media.name}</h2><p className="text-sm text-muted-foreground">{t("article.revision", { revision })}</p>{!media.mediaId ? <p role="status">{t("config.required")}</p> : null}<EditorialOperationStatus operation={operation} />{unavailable ? <p role="alert">{t("status.unavailable")}</p> : null}{revision < media.revision ? <p role="status">{t("status.newer")}</p> : null}<p role="status" className="text-sm text-muted-foreground">{t(dirty ? "status.dirty" : "status.pristine")}</p>
    <form noValidate className="grid min-w-0 gap-5" onSubmit={event => { void form.handleSubmit(async values => {
      if (locked) return
      const input = editorialConfigInput(values)
      if (!input) return
      const result = await operation.run(() => save({ networkId, pageId: media.pageId, expectedRevision: revision, input }))
      if (result) { reset({ ...values, publicConsent: false }); setRevision(result.revision); setSaved(true) }
    })(event) }}><fieldset disabled={operation.pending || !media.permissions.canConfigure} className="grid gap-4"><Field id={`${id}-description`} label={t("config.description")} hint={t("config.descriptionHint")} error={form.formState.errors.description?.message}><TextArea id={`${id}-description`} maxLength={1600} aria-describedby={`${id}-description-hint`} {...form.register("description")} /></Field><Card><fieldset className="grid gap-4"><legend className="mp-subtitle">{t("config.sections")}</legend><p className="text-sm text-muted-foreground">{t("config.sectionHint")}</p>{array.fields.map((section, index) => <div key={section.id} className="grid gap-3 border-t border-border pt-3"><div className="grid gap-3 sm:grid-cols-2"><Field id={`${id}-section-${index}-key`} label={t("config.sectionKey", { number: index + 1 })} hint={t("config.sectionKeyHint")} error={form.formState.errors.sections?.[index]?.key?.message}><TextInput id={`${id}-section-${index}-key`} maxLength={60} autoCapitalize="none" spellCheck={false} {...form.register(`sections.${index}.key`)} /></Field><Field id={`${id}-section-${index}-label`} label={t("config.sectionLabel", { number: index + 1 })} error={form.formState.errors.sections?.[index]?.label?.message}><TextInput id={`${id}-section-${index}-label`} maxLength={60} {...form.register(`sections.${index}.label`)} /></Field></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={index === 0} onClick={() => array.move(index, index - 1)}>{t("config.moveUp", { number: index + 1 })}</Button><Button type="button" variant="outline" disabled={index === array.fields.length - 1} onClick={() => array.move(index, index + 1)}>{t("config.moveDown", { number: index + 1 })}</Button><Button type="button" variant="outline" onClick={() => array.remove(index)}>{t("actions.removeSection", { number: index + 1 })}</Button></div></div>)}{form.formState.errors.sections?.message || form.formState.errors.sections?.root?.message ? <p role="alert">{form.formState.errors.sections.message ?? form.formState.errors.sections.root?.message}</p> : null}<Button type="button" variant="outline" disabled={array.fields.length >= 12} onClick={() => array.append({ key: "", label: "" })}>{t("actions.addSection")}</Button></fieldset></Card><Field id={`${id}-visibility`} label={t("config.visibility")}><select id={`${id}-visibility`} className={SHOP_SELECT_CLASS} {...form.register("visibility")}><option value="network">{t("config.network")}</option><option value="public">{t("config.public")}</option></select></Field>{content.visibility === "public" ? <div className="grid gap-2"><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-5 accent-primary" {...form.register("publicConsent")} /><span>{t("config.publicConsent")}</span></label><p className="text-xs text-muted-foreground">{t("config.consentVersion", { version: EDITORIAL_PUBLIC_CONSENT_VERSION })}</p>{form.formState.errors.publicConsent?.message ? <p role="alert">{form.formState.errors.publicConsent.message}</p> : null}</div> : null}<Button type="submit" pending={operation.pending} disabled={locked}>{t("actions.saveConfig")}</Button></fieldset></form>{saved ? <p role="status">{t("config.saved")}</p> : null}{!media.permissions.canConfigure ? <p role="status">{t("status.noPermission")}</p> : null}<Button type="button" variant="outline" pending={operation.pending} disabled={!operation.online} onClick={() => { void read() }}>{t("actions.reload")}</Button></div>
}
