"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { normalizeProfessionalLanguageCode, PROFESSIONAL_AVAILABILITIES, PROFESSIONAL_COLLABORATION_TYPES, type ProfessionalSearchFilters } from "@antsia/social-domain/professionals"
import { zodResolver } from "@hookform/resolvers/zod"
import type { FunctionReturnType } from "convex/server"
import { useId, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Button, Card, Field, TextInput } from "@/components/shared/controls"
import { SHOP_SELECT_CLASS, ShopLink } from "@/components/shops/shop-ui"
import { professionalSearchFromParams, professionalSearchInput, professionalSearchSchema, professionalSearchValues, type ProfessionalSearchValues } from "@/lib/professional-form"
import { routes } from "@/lib/routes"
import { PROFESSIONAL_LANGUAGES, ProfessionalFrame } from "./profile-fields"

type ProfileCard = FunctionReturnType<typeof api.modules.professionals.read.search>["page"][number]

export function MemberProfessionalDirectory() {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("professionals")
  return <ProfessionalFrame title={t("title")} lead={t("lead")}><ProfessionalDirectory key={JSON.stringify([networkId, personId])} /></ProfessionalFrame>
}

function ProfessionalDirectory() {
  const { t } = useTranslation("professionals")
  const { networkId } = useNetwork()
  const router = useRouter()
  const params = useSearchParams()
  const search = professionalSearchFromParams(params)
  const query = useAuthenticatedConvexQuery(api.modules.professionals.read.search, search ? { networkId, filters: search.filters, paginationOpts: { cursor: search.cursor, numItems: 12 } } : "skip")
  if (!search) return <div className="grid gap-3"><p role="alert">{t("validation.search")}</p><ShopLink href={routes.professionals()}>{t("actions.clear")}</ShopLink></div>
  const ready = !query.isPending && !query.isError && !query.isFetching && query.data !== undefined
  return <>
    <div className="flex flex-wrap gap-2"><ShopLink href={routes.professionalEditor()}>{t("actions.edit")}</ShopLink><ShopLink href={routes.professionalCollaborations()}>{t("actions.collaborations")}</ShopLink></div>
    <ProfessionalDirectoryFilters key={JSON.stringify(search.filters)} filters={search.filters} />
    {query.isError ? <div className="grid gap-3"><p role="alert">{t("status.unavailable")}</p><Button variant="outline" onClick={() => { void query.refetch() }}>{t("actions.retry")}</Button></div> : !ready ? <p role="status">{t("status.loading")}</p> : query.data ? <section className="grid gap-4" aria-busy={query.isFetching || undefined}>{query.isFetching ? <p role="status">{t("status.refreshing")}</p> : null}{query.data.page.length ? <div className="grid min-w-0 gap-4 md:grid-cols-2">{query.data.page.map(profile => <ProfessionalProfileCard key={profile.profileId} profile={profile} />)}</div> : <p role="status">{t(query.data.filteredWindow && !query.data.isDone ? "status.filteredWindow" : "status.empty")}</p>}<div className="flex flex-wrap gap-2">{!query.data.isDone && query.data.continueCursor ? <Button variant="outline" disabled={query.isFetching} onClick={() => router.push(routes.professionals(search.filters, query.data!.continueCursor))}>{t("actions.next")}</Button> : null}{search.cursor ? <Button variant="outline" disabled={query.isFetching} onClick={() => router.push(routes.professionals(search.filters))}>{t("actions.first")}</Button> : null}</div></section> : null}
  </>
}

function ProfessionalDirectoryFilters({ filters }: { filters: ProfessionalSearchFilters }) {
  const { t } = useTranslation("professionals")
  const router = useRouter()
  const id = useId()
  const form = useForm<ProfessionalSearchValues>({ resolver: zodResolver(professionalSearchSchema(key => t(key))), defaultValues: professionalSearchValues(filters) })
  const languages = useWatch({ control: form.control, name: "languageCodes" })
  const types = useWatch({ control: form.control, name: "collaborationTypes" })
  const skills = useWatch({ control: form.control, name: "skills" })
  const zone = useWatch({ control: form.control, name: "zone" })
  const availability = useWatch({ control: form.control, name: "availability" })
  const advanced = useRef<HTMLDetailsElement>(null)
  const activeCount = skills.split(",").filter(value => value.trim()).length + languages.length + types.length + Number(!!zone.trim()) + Number(!!availability)
  const [otherLanguage, setOtherLanguage] = useState("")
  const clear = () => {
    form.reset(professionalSearchValues({}))
    setOtherLanguage("")
    if (advanced.current) advanced.current.open = false
    router.push(routes.professionals())
  }
  return <Card><form className="grid min-w-0 gap-3" onSubmit={event => { void form.handleSubmit(value => { const next = professionalSearchInput(value); if (next) router.push(routes.professionals(next)) }, errors => {
    const first = (["skills", "languageCodes", "zone", "availability", "collaborationTypes"] as const).find(key => errors[key])
    if (first && advanced.current) { advanced.current.open = true; advanced.current.querySelector<HTMLElement>(`[name="${first}"]`)?.focus() }
  })(event) }} noValidate><h2 className="mp-subtitle">{t("directory.filters")}</h2><div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
    <Field id={`${id}-query`} label={t("directory.query")} hint={t("directory.queryHint")} error={form.formState.errors.query?.message}><TextInput id={`${id}-query`} maxLength={120} aria-describedby={`${id}-query-hint`} aria-invalid={!!form.formState.errors.query} {...form.register("query")} /></Field>
    <div className="flex flex-wrap gap-2 sm:pt-6"><Button type="submit">{t("actions.search")}</Button><Button type="button" variant="outline" onClick={clear}>{t("actions.clear")}</Button></div>
  </div><details ref={advanced} className="min-w-0 border-t border-border"><summary className="min-h-11 cursor-pointer rounded-lg py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("directory.advancedFilters", { count: activeCount })}</summary><div className="grid min-w-0 gap-4 pt-2"><div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <Field id={`${id}-skills`} label={t("directory.skills")} hint={t("directory.skillsHint")} error={form.formState.errors.skills?.message}><TextInput id={`${id}-skills`} maxLength={365} aria-describedby={`${id}-skills-hint`} aria-invalid={!!form.formState.errors.skills} {...form.register("skills")} /></Field>
    <Field id={`${id}-zone`} label={t("directory.zone")} error={form.formState.errors.zone?.message}><TextInput id={`${id}-zone`} maxLength={120} aria-invalid={!!form.formState.errors.zone} {...form.register("zone")} /></Field>
    <Field id={`${id}-availability`} label={t("directory.availability")}><select id={`${id}-availability`} className={SHOP_SELECT_CLASS} {...form.register("availability")}><option value="">{t("directory.all")}</option>{PROFESSIONAL_AVAILABILITIES.map(value => <option key={value} value={value}>{t(`availability.${value}`)}</option>)}</select></Field>
  </div><div className="grid min-w-0 gap-4 sm:grid-cols-2"><fieldset><legend className="text-sm font-medium">{t("fields.languages")}</legend><div className="grid grid-cols-2">{[...new Set([...PROFESSIONAL_LANGUAGES, ...languages])].map(code => <label key={code} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5 accent-primary" checked={languages.includes(code)} disabled={!languages.includes(code) && languages.length >= 6} onChange={event => form.setValue("languageCodes", event.target.checked ? [...languages, code] : languages.filter(value => value !== code), { shouldDirty: true })} /><span>{PROFESSIONAL_LANGUAGES.some(value => value === code) ? t(`languages.${code}`) : code}</span></label>)}</div><div className="grid gap-2"><Field id={`${id}-other-language`} label={t("fields.languageCode")} hint={t("fields.languageHint")} error={form.formState.errors.languageCodes?.message}><TextInput id={`${id}-other-language`} maxLength={35} value={otherLanguage} autoCapitalize="none" spellCheck={false} onChange={event => setOtherLanguage(event.target.value)} /></Field><Button type="button" variant="outline" disabled={languages.length >= 6} onClick={() => {
      const code = normalizeProfessionalLanguageCode(otherLanguage.trim())
      if (!code) { form.setError("languageCodes", { type: "validate", message: t("validation.language") }); return }
      if (!languages.includes(code)) form.setValue("languageCodes", [...languages, code], { shouldDirty: true })
      form.clearErrors("languageCodes"); setOtherLanguage("")
    }}>{t("fields.languageEntry")}</Button></div></fieldset><fieldset><legend className="text-sm font-medium">{t("directory.type")}</legend>{PROFESSIONAL_COLLABORATION_TYPES.map(type => <label key={type} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5 accent-primary" checked={types.includes(type)} onChange={event => form.setValue("collaborationTypes", event.target.checked ? [...types, type] : types.filter(value => value !== type), { shouldDirty: true })} /><span>{t(`collaborationTypes.${type}`)}</span></label>)}</fieldset></div></div></details></form></Card>
}

function ProfessionalProfileCard({ profile }: { profile: ProfileCard }) {
  const { t } = useTranslation("professionals")
  return <Card><article className="grid min-w-0 gap-3"><header><h2 className="mp-subtitle">{profile.displayName}</h2><p className="text-sm text-muted-foreground">@{profile.handle}</p></header><p className="font-medium">{profile.title}</p><p className="text-sm">{t(`availability.${profile.availability}`)}{profile.zone ? <span> · {profile.zone}</span> : null}</p>{profile.skills.length ? <ul className="flex flex-wrap gap-2">{profile.skills.map(skill => <li key={skill} className="rounded-full bg-muted px-3 py-1 text-sm">{skill}</li>)}</ul> : null}<p className="text-xs text-muted-foreground">{t("status.declared")}</p><ShopLink href={routes.professionalProfile(profile.handle)}>{t("actions.view")}</ShopLink></article></Card>
}
