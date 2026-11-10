"use client"

import { api, type Id } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import {
  normalizeProfessionalLanguageCode, PROFESSIONAL_AVAILABILITIES, PROFESSIONAL_COLLABORATION_TYPES,
  PROFESSIONAL_PROFILE_CONSENT_VERSION, PROFESSIONAL_PUBLIC_CONSENT_VERSION, PROFESSIONAL_PUBLIC_FIELDS,
  PROFESSIONAL_VISIBILITIES, professionalTextKey,
} from "@antsia/social-domain/professionals"
import { Plus, X } from "lucide-react"
import { useMutation } from "convex/react"
import { useEffect, useId, useState, type ReactNode } from "react"
import { useController, useFieldArray, useWatch, type UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { ReportContentDialog } from "@antsia/social-features/features/reseau-personnel/report-content-entry"

import { MemberPage } from "@/components/member-chrome"
import { Button, Card, Field, TextArea, TextInput } from "@/components/shared/controls"
import { FORM_FIELDS, SCREEN_SECTIONS, SCREEN_SUBMIT } from "@/components/shared/screen-layout"
import { SHOP_SELECT_CLASS, useShopAction } from "@/components/shops/shop-ui"
import type { ProfessionalFormValues } from "@/lib/professional-form"

export const PROFESSIONAL_LANGUAGES = ["fr", "en", "es", "pt", "ar", "de", "zh"] as const
const CHECK_CLASS = "flex min-h-11 items-center gap-3 rounded-lg px-2 py-1 text-sm focus-within:ring-2 focus-within:ring-ring"
export type ManagedProfessionalActivity = { pageId: string; handle: string; name: string }

/** L'annuaire, la fiche, l'éditeur et les collaborations occupent toute la colonne de l'espace (`shared/screen-layout`). */
export function ProfessionalFrame({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return <MemberPage><div className={`mp-page mp-copy grid w-full min-w-0 gap-5 pb-24 [overflow-wrap:anywhere] ${SCREEN_SUBMIT}`}><header className="mp-page-header"><h1 className="mp-title">{title}</h1>{lead ? <p className="text-muted-foreground">{lead}</p> : null}</header>{children}</div></MemberPage>
}

export function ProfessionalReportButton({ target }: { target: { kind: "professionalProfile"; id: Id<"professionalProfiles"> } | { kind: "professionalCollaboration"; id: Id<"professionalCollaborations"> } }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("professionals")
  const report = useMutation(api.modules.moderation.cases.report)
  const action = useShopAction()
  const [open, setOpen] = useState(false)
  const [reported, setReported] = useState(false)
  return <><Button type="button" variant="outline" disabled={reported} onClick={() => setOpen(true)}>{t(reported ? "actions.reported" : "actions.report")}</Button>{open ? <ReportContentDialog kind={target.kind} allowNote={false} onClose={() => setOpen(false)} onSubmit={async reason => {
    if (!action.current() || !navigator.onLine) throw new Error(t("errors.unavailable"))
    await report({ networkId, target, reason })
    if (action.current()) setReported(true)
  }} /> : null}</>
}

/** Une seule forme à tous les formats. Les réalisations sont textuelles, sans pièce jointe ni lien externe. */
export function ProfessionalProfileFields({ form, activities, activitiesPending, activitiesError, loadActivities, hasMoreActivities, firstActivities, hasEarlierActivities, disabled = false }: {
  form: UseFormReturn<ProfessionalFormValues>; activities: ManagedProfessionalActivity[]; activitiesPending?: boolean; activitiesError?: boolean;
  loadActivities?: () => void; hasMoreActivities?: boolean; firstActivities?: () => void; hasEarlierActivities?: boolean; disabled?: boolean;
}) {
  const { t } = useTranslation("professionals")
  const id = useId()
  const watched = useWatch({ control: form.control })
  const portfolio = useFieldArray({ control: form.control, name: "portfolio" })
  const errors = form.formState.errors
  const { setValue } = form
  const changedFields = JSON.stringify([watched.title, watched.bio, watched.zone, watched.skills, watched.languageCodes, watched.availability,
    watched.collaborationTypes, watched.portfolio, watched.activityPageIds, watched.visibility, watched.publicFields])
  useEffect(() => { setValue("participationConsent", false); setValue("publicConsent", false) }, [changedFields, setValue])
  const publicFields = watched.publicFields ?? []
  const selectedActivities = watched.activityPageIds ?? []
  const collaborationTypes = watched.collaborationTypes ?? []
  return <fieldset disabled={disabled} className={`${SCREEN_SECTIONS} gap-y-5`}>
    <div className="grid min-w-0 content-start gap-5">
      <div className={`${FORM_FIELDS} gap-y-4`}>
        <Field id={`${id}-title`} label={t("fields.title")} hint={t("fields.titleHint")} error={errors.title?.message}><TextInput id={`${id}-title`} maxLength={120} aria-describedby={`${id}-title-hint`} aria-invalid={!!errors.title} {...form.register("title")} /></Field>
        <Field id={`${id}-zone`} label={t("fields.zone")} hint={t("fields.zoneHint")} error={errors.zone?.message}><TextInput id={`${id}-zone`} maxLength={120} aria-describedby={`${id}-zone-hint`} aria-invalid={!!errors.zone} {...form.register("zone")} /></Field>
      </div>
      <Field id={`${id}-bio`} label={t("fields.bio")} hint={t("fields.bioHint")} error={errors.bio?.message}><TextArea id={`${id}-bio`} maxLength={1600} aria-describedby={`${id}-bio-hint`} aria-invalid={!!errors.bio} {...form.register("bio")} /></Field>
      <div className={`${FORM_FIELDS} gap-y-5`}><ProfessionalTokens form={form} name="skills" /><ProfessionalTokens form={form} name="languageCodes" /></div>
      <div className={`${FORM_FIELDS} gap-y-5`}>
        <Field id={`${id}-availability`} label={t("fields.availability")} error={errors.availability?.message}><select id={`${id}-availability`} className={SHOP_SELECT_CLASS} {...form.register("availability")}>{PROFESSIONAL_AVAILABILITIES.map(value => <option key={value} value={value}>{t(`availability.${value}`)}</option>)}</select></Field>
        <fieldset className="grid content-start gap-1"><legend className="text-sm font-medium">{t("fields.collaborationTypes")}</legend>{PROFESSIONAL_COLLABORATION_TYPES.map(value => <label key={value} className={CHECK_CLASS}><input type="checkbox" className="size-5 shrink-0 accent-primary" checked={collaborationTypes.includes(value)} onChange={event => setValue("collaborationTypes", event.target.checked ? [...collaborationTypes, value] : collaborationTypes.filter(item => item !== value), { shouldDirty: true, shouldValidate: true })} /><span>{t(`collaborationTypes.${value}`)}</span></label>)}</fieldset>
      </div>
    </div>
    <div className="grid min-w-0 content-start gap-5">
      <Card><fieldset className="grid min-w-0 gap-4"><legend className="mp-subtitle">{t("fields.portfolio")}</legend><p className="text-sm text-muted-foreground">{t("fields.portfolioHint")}</p>
        {portfolio.fields.map((item, index) => <div key={item.id} className="grid gap-3 rounded-lg border border-border p-3"><Field id={`${id}-portfolio-${index}-title`} label={t("fields.portfolioTitle", { number: index + 1 })} error={errors.portfolio?.[index]?.title?.message}><TextInput id={`${id}-portfolio-${index}-title`} maxLength={120} aria-invalid={!!errors.portfolio?.[index]?.title} {...form.register(`portfolio.${index}.title`)} /></Field><Field id={`${id}-portfolio-${index}-description`} label={t("fields.portfolioDescription", { number: index + 1 })} error={errors.portfolio?.[index]?.description?.message}><TextArea id={`${id}-portfolio-${index}-description`} maxLength={500} aria-invalid={!!errors.portfolio?.[index]?.description} {...form.register(`portfolio.${index}.description`)} /></Field><Button type="button" variant="outline" onClick={() => portfolio.remove(index)}>{t("actions.removePortfolio", { number: index + 1 })}</Button></div>)}
        <Button type="button" variant="outline" disabled={portfolio.fields.length >= 6} onClick={() => portfolio.append({ title: "", description: "" })}><Plus aria-hidden="true" className="size-4" />{t("actions.addPortfolio")}</Button>{errors.portfolio?.root?.message ? <p role="alert">{errors.portfolio.root.message}</p> : null}
      </fieldset></Card>
      <fieldset className="grid min-w-0 gap-2"><legend className="mp-subtitle">{t("fields.activities")}</legend><p className="text-sm text-muted-foreground">{t("fields.activitiesHint")}</p>{activities.map(activity => <label key={activity.pageId} className={CHECK_CLASS}><input type="checkbox" className="size-5 shrink-0 accent-primary" checked={selectedActivities.includes(activity.pageId)} disabled={!selectedActivities.includes(activity.pageId) && selectedActivities.length >= 6} onChange={event => setValue("activityPageIds", event.target.checked ? [...selectedActivities, activity.pageId] : selectedActivities.filter(item => item !== activity.pageId), { shouldDirty: true, shouldValidate: true })} /><span>{activity.name} <span className="text-muted-foreground">@{activity.handle}</span></span></label>)}
        {selectedActivities.filter(pageId => !activities.some(activity => activity.pageId === pageId)).map((pageId, index) => <div key={pageId} className="flex flex-wrap items-center gap-2 text-sm"><span>{t("fields.unavailableActivity", { number: index + 1 })}</span><Button type="button" variant="outline" onClick={() => setValue("activityPageIds", selectedActivities.filter(item => item !== pageId), { shouldDirty: true })}>{t("fields.removeActivity", { number: index + 1 })}</Button></div>)}
        {activitiesPending ? <p role="status">{t("status.loading")}</p> : activitiesError ? <p role="alert">{t("status.unavailable")}</p> : !activities.length ? <p className="text-sm text-muted-foreground">{t("profile.emptyActivities")}</p> : null}{loadActivities && (activitiesError || hasMoreActivities) ? <Button type="button" variant="outline" pending={activitiesPending} onClick={loadActivities}>{t(activitiesError ? "actions.retry" : "actions.next")}</Button> : null}{firstActivities && hasEarlierActivities ? <Button type="button" variant="outline" disabled={activitiesPending} onClick={firstActivities}>{t("actions.first")}</Button> : null}{errors.activityPageIds?.message ? <p role="alert">{errors.activityPageIds.message}</p> : null}
      </fieldset>
      <Card><div className="grid min-w-0 gap-4"><Field id={`${id}-visibility`} label={t("fields.visibility")} hint={t("fields.visibilityHint")}><select id={`${id}-visibility`} className={SHOP_SELECT_CLASS} aria-describedby={`${id}-visibility-hint`} {...form.register("visibility")}>{PROFESSIONAL_VISIBILITIES.map(value => <option key={value} value={value}>{t(`visibility.${value}`)}</option>)}</select></Field>
        <fieldset className="grid gap-1"><legend className="text-sm font-medium">{t("fields.publicFields")}</legend><p className="text-sm text-muted-foreground">{t("fields.publicFieldsHint")}</p><div className="grid sm:grid-cols-2">{PROFESSIONAL_PUBLIC_FIELDS.map(value => <label key={value} className={CHECK_CLASS}><input type="checkbox" className="size-5 shrink-0 accent-primary" checked={publicFields.includes(value)} onChange={event => setValue("publicFields", event.target.checked ? [...publicFields, value] : publicFields.filter(item => item !== value), { shouldDirty: true, shouldValidate: true })} /><span>{t(`publicFields.${value}`)}</span></label>)}</div></fieldset>
        {watched.visibility === "public" ? <div className="grid gap-1"><label className={CHECK_CLASS}><input type="checkbox" className="size-5 shrink-0 accent-primary" aria-invalid={!!errors.publicConsent} {...form.register("publicConsent")} /><span>{t("consent.public")}</span></label><p className="text-xs text-muted-foreground">{t("consent.version", { version: PROFESSIONAL_PUBLIC_CONSENT_VERSION })}</p><p className="text-sm text-muted-foreground">{t("consent.publicReset")}</p>{errors.publicConsent?.message ? <p role="alert" className="text-sm text-destructive">{errors.publicConsent.message}</p> : null}</div> : null}
      </div></Card>
      <div className="grid gap-1"><label className={CHECK_CLASS}><input type="checkbox" className="size-5 shrink-0 accent-primary" aria-invalid={!!errors.participationConsent} {...form.register("participationConsent")} /><span>{t("consent.participation")}</span></label><p className="text-xs text-muted-foreground">{t("consent.version", { version: PROFESSIONAL_PROFILE_CONSENT_VERSION })}</p>{errors.participationConsent?.message ? <p role="alert" className="text-sm text-destructive">{errors.participationConsent.message}</p> : null}</div>
    </div>
  </fieldset>
}

function ProfessionalTokens({ form, name }: { form: UseFormReturn<ProfessionalFormValues>; name: "skills" | "languageCodes" }) {
  const { t } = useTranslation("professionals")
  const id = useId()
  const { field, fieldState } = useController({ control: form.control, name })
  const language = name === "languageCodes"
  const [entry, setEntry] = useState("")
  const [selectedLanguage, setSelectedLanguage] = useState<string>("fr")
  const [error, setError] = useState<string | null>(null)
  const values = field.value
  const add = () => {
    const raw = language && selectedLanguage !== "other" ? selectedLanguage : entry.normalize("NFC").trim().replace(/\s+/gu, " ")
    const value = language ? normalizeProfessionalLanguageCode(raw) : raw
    if (!value || value.length > (language ? 35 : 60)) { setError(t(language ? "validation.language" : "validation.text")); return }
    if (values.some(item => professionalTextKey(item) === professionalTextKey(value))) { setError(t("validation.duplicates")); return }
    if (values.length >= (language ? 6 : 12)) { setError(t("validation.limit")); return }
    field.onChange([...values, value]); setEntry(""); setError(null)
  }
  return <div className="grid min-w-0 content-start gap-2"><Field id={id} label={t(language ? "fields.languages" : "fields.skills")} hint={t(language ? "fields.languageHint" : "fields.skillsHint")} error={error ?? fieldState.error?.message}>
    {language ? <select id={id} className={SHOP_SELECT_CLASS} value={selectedLanguage} aria-describedby={`${id}-hint`} onChange={event => { setSelectedLanguage(event.target.value); setError(null) }}>{[...PROFESSIONAL_LANGUAGES, "other"].map(code => <option key={code} value={code}>{t(`languages.${code}`)}</option>)}</select> : <TextInput id={id} aria-label={t("fields.skillEntry")} value={entry} maxLength={60} aria-describedby={`${id}-hint`} onChange={event => setEntry(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); add() } }} />}
  </Field>{language && selectedLanguage === "other" ? <Field id={`${id}-other`} label={t("fields.languageCode")}><TextInput id={`${id}-other`} value={entry} maxLength={35} autoCapitalize="none" spellCheck={false} onChange={event => setEntry(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); add() } }} /></Field> : null}
    <Button type="button" variant="outline" disabled={values.length >= (language ? 6 : 12)} onClick={add}><Plus aria-hidden="true" className="size-4" />{t(language ? "fields.languageEntry" : "fields.skillEntry")}</Button>
    <ul className="flex min-w-0 flex-wrap gap-2">{values.map(value => <li key={value} className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted px-3 text-sm"><span>{language && PROFESSIONAL_LANGUAGES.some(code => code === value) ? t(`languages.${value}`) : value}</span><button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("actions.remove", { item: language && PROFESSIONAL_LANGUAGES.some(code => code === value) ? t(`languages.${value}`) : value })} onClick={() => { field.onChange(values.filter(item => item !== value)); setError(null) }}><X aria-hidden="true" className="size-4" /></button></li>)}</ul>
  </div>
}
