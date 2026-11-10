"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import type { ProfessionalProfileState } from "@antsia/social-domain/professionals"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { useCartConnectivity } from "@/components/cart/use-cart-draft"
import { Button } from "@/components/shared/controls"
import { ShopLink, useShopAction, useShopDirtyGuard } from "@/components/shops/shop-ui"
import { professionalErrorKey, professionalFormSchema, professionalFormValues, professionalInput, type ProfessionalFormValues } from "@/lib/professional-form"
import { routes } from "@/lib/routes"
import { ProfessionalFrame, ProfessionalProfileFields } from "./profile-fields"

type EditorProfile = FunctionReturnType<typeof api.modules.professionals.profiles.myProfile>

export function ProfessionalProfileEditor() {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("professionals")
  return <ProfessionalFrame title={t("editor.title")} lead={t("editor.lead")}><EditorQueries key={JSON.stringify([networkId, personId])} /></ProfessionalFrame>
}

function EditorQueries() {
  const { networkId } = useNetwork()
  const { t } = useTranslation("professionals")
  const profile = useAuthenticatedConvexQuery(api.modules.professionals.profiles.myProfile, { networkId })
  const [initialized, setInitialized] = useState(false)
  const ready = !profile.isError && !profile.isPending && profile.data !== undefined
  useEffect(() => { if (ready) setInitialized(true) }, [ready])
  if (!initialized) return <div className="grid gap-3">{profile.isError ? <><p role="alert">{t("status.unavailable")}</p><Button variant="outline" onClick={() => { void profile.refetch() }}>{t("actions.retry")}</Button></> : <p role="status">{t("status.loading")}</p>}</div>
  return <ProfessionalEditorForm profile={profile.data ?? null} unavailable={profile.isError || profile.isPending} refreshing={profile.isFetching} reread={async () => { const result = await profile.refetch(); return result.isError || result.data === undefined ? undefined : result.data }} />
}

/** Une réponse temps réel ne remplace jamais une saisie modifiée ; les transitions concernent seulement la version enregistrée. */
export function ProfessionalEditorForm({ profile, unavailable = false, refreshing = false, reread }: {
  profile: EditorProfile; unavailable?: boolean; refreshing?: boolean; reread: () => Promise<EditorProfile | undefined>;
}) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("professionals")
  const connectivity = useCartConnectivity()
  const liveGeneration = useRef(connectivity.generation)
  useEffect(() => { liveGeneration.current = connectivity.generation }, [connectivity.generation])
  const action = useShopAction()
  const saveProfile = useMutation(api.modules.professionals.profiles.saveProfile)
  const setState = useMutation(api.modules.professionals.profiles.setState)
  const [activityCursor, setActivityCursor] = useState<string | null>(null)
  const activities = useAuthenticatedConvexQuery(api.modules.professionals.read.managedActivities, { networkId, paginationOpts: { cursor: activityCursor, numItems: 12 } })
  const [base, setBase] = useState({ revision: profile?.revision ?? 0, state: profile?.state ?? "draft", title: profile?.title ?? "" })
  const baseRef = useRef(base)
  useEffect(() => { baseRef.current = base }, [base])
  const [failure, setFailure] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [reviewedGeneration, setReviewedGeneration] = useState(connectivity.generation)
  const form = useForm<ProfessionalFormValues>({ resolver: zodResolver(professionalFormSchema(key => t(key))), defaultValues: professionalFormValues(profile) })
  const { reset, setValue } = form
  const dirty = form.formState.isDirty
  useShopDirtyGuard(dirty)
  const source = JSON.stringify(profile)
  useEffect(() => {
    if (!form.formState.isDirty && !conflict && !unavailable) {
      const next = JSON.parse(source) as EditorProfile
      if ((next?.revision ?? 0) < baseRef.current.revision) return
      reset(professionalFormValues(next))
      setBase({ revision: next?.revision ?? 0, state: next?.state ?? "draft", title: next?.title ?? "" })
    }
  }, [source, form, reset, conflict, unavailable])
  useEffect(() => { setValue("participationConsent", false); setValue("publicConsent", false) }, [connectivity.generation, setValue])
  const needsReview = reviewedGeneration !== connectivity.generation
  const newer = (profile?.revision ?? 0) > base.revision
  const waitingForSavedRevision = (profile?.revision ?? 0) < base.revision
  const locked = action.pending || unavailable || refreshing || !connectivity.online || needsReview || conflict || newer || waitingForSavedRevision
  const absorb = (next: EditorProfile) => {
    reset(professionalFormValues(next)); setBase({ revision: next?.revision ?? 0, state: next?.state ?? "draft", title: next?.title ?? "" })
    setConflict(false); setFailure(null); setSuccess(null); setReviewedGeneration(connectivity.generation)
  }
  const read = async () => {
    if (!connectivity.online || action.pending || dirty && !window.confirm(t("status.reloadConfirm"))) return
    const generation = liveGeneration.current
    setFailure(null); setSuccess(null); setValue("participationConsent", false); setValue("publicConsent", false)
    const result = await action.run(async () => ({ profile: await reread() }))
    if (!result || !action.current() || generation !== liveGeneration.current) return
    if (result.profile === undefined) { setFailure("errors.unavailable"); return }
    absorb(result.profile)
  }
  const save = async (values: ProfessionalFormValues) => {
    if (locked || !navigator.onLine) return
    const input = professionalInput(values)
    if (!input) return
    const generation = liveGeneration.current
    setFailure(null); setSuccess(null)
    const result = await action.run(async () => {
      try { return { ok: true as const, value: await saveProfile({ networkId, expectedRevision: base.revision, input: { ...input, activityPageIds: input.activityPageIds.map(id => id as Id<"pages">) } }) } }
      catch (error) { return { ok: false as const, key: professionalErrorKey(error) } }
    })
    if (!result || !action.current() || generation !== liveGeneration.current) return
    if (!result.ok) { setFailure(result.key); setConflict(result.key === "errors.conflict"); return }
    reset({ ...values, participationConsent: false, publicConsent: false })
    setBase({ revision: result.value.revision, state: result.value.state, title: input.title }); setSuccess("status.saved")
  }
  const changeState = async (state: ProfessionalProfileState) => {
    if (locked || dirty || base.revision === 0 || !navigator.onLine || state === "published" && (!base.title || !window.confirm(t("editor.publishConfirm")))) return
    const generation = liveGeneration.current
    setFailure(null); setSuccess(null)
    const result = await action.run(async () => {
      try { return { ok: true as const, value: await setState({ networkId, expectedRevision: base.revision, state }) } }
      catch (error) { return { ok: false as const, key: professionalErrorKey(error) } }
    })
    if (!result || !action.current() || generation !== liveGeneration.current) return
    if (!result.ok) { setFailure(result.key); setConflict(result.key === "errors.conflict"); return }
    setBase(previous => ({ ...previous, revision: result.value.revision, state: result.value.state })); setSuccess("status.changed")
  }
  return <div className="grid min-w-0 gap-4">
    <div className="flex flex-wrap items-center gap-3"><p className="font-medium">{t(`states.${base.state}`)}</p><p className="text-sm text-muted-foreground">{t(base.revision ? "status.revision" : "status.notCreated", { revision: base.revision })}</p></div>
    <p role="status" className="text-sm text-muted-foreground">{t(dirty ? "status.dirty" : "status.pristine")}</p>
    {!connectivity.online ? <p role="status">{t("status.offline")}</p> : needsReview ? <p role="status">{t("status.scopeChanged")}</p> : null}
    {newer ? <p role="status">{t("status.incomingChange")}</p> : null}{unavailable ? <p role="alert">{t("status.unavailable")}</p> : null}{failure || action.error ? <p role="alert" className="text-sm text-destructive">{failure ? t(failure) : t("errors.unavailable")}</p> : null}{success ? <p role="status">{t(success)}</p> : null}
    {waitingForSavedRevision ? <p role="status">{t("status.reviewRequired")}</p> : null}
    {base.state === "published" && dirty ? <p role="status">{t("editor.publishedEdit")}</p> : null}
    <form className="grid min-w-0 gap-5" onSubmit={event => { void form.handleSubmit(save)(event) }} noValidate><ProfessionalProfileFields form={form} disabled={action.pending} activities={!activities.isError && !activities.isPending && !activities.isFetching ? activities.data?.page ?? [] : []} activitiesPending={activities.isPending || activities.isFetching} activitiesError={activities.isError} hasMoreActivities={!!activities.data && !activities.data.isDone} hasEarlierActivities={activityCursor !== null} firstActivities={() => setActivityCursor(null)} loadActivities={() => { if (activities.isError) void activities.refetch(); else if (activities.data && !activities.data.isDone) setActivityCursor(activities.data.continueCursor) }} /><Button type="submit" pending={action.pending} disabled={locked}>{t("actions.save")}</Button></form>
    <div className="grid gap-3 border-t border-border pt-4"><p className="text-sm text-muted-foreground">{t(dirty ? "editor.saveBeforePublish" : !base.title ? "editor.publishNeedsTitle" : "editor.moderation")}</p><div className="flex flex-wrap gap-2">{base.state !== "published" ? <Button type="button" disabled={locked || dirty || !base.revision || !base.title} onClick={() => { void changeState("published") }}>{t("actions.publish")}</Button> : <Button type="button" variant="outline" disabled={locked || dirty} onClick={() => { void changeState("paused") }}>{t("actions.pause")}</Button>}{base.revision && base.state !== "draft" ? <Button type="button" variant="outline" disabled={locked || dirty} onClick={() => { void changeState("draft") }}>{t("actions.draft")}</Button> : null}<Button type="button" variant="outline" pending={action.pending} disabled={!connectivity.online || refreshing} onClick={() => { void read() }}>{t("actions.reload")}</Button></div></div>
    <div className="flex flex-wrap gap-2"><ShopLink href={routes.professionals()}>{t("actions.directory")}</ShopLink><ShopLink href={routes.professionalCollaborations()}>{t("actions.collaborations")}</ShopLink></div>
  </div>
}
