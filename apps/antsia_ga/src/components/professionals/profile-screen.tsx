"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { parseProfessionalCollaborationMessage, PROFESSIONAL_COLLABORATION_TYPES } from "@antsia/social-domain/professionals"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useEffect, useId, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { useCartConnectivity } from "@/components/cart/use-cart-draft"
import { Button, Card, Field, TextArea } from "@/components/shared/controls"
import { SCREEN_SECTIONS } from "@/components/shared/screen-layout"
import { SHOP_SELECT_CLASS, ShopLink, useShopAction, useShopDirtyGuard } from "@/components/shops/shop-ui"
import { professionalErrorKey } from "@/lib/professional-form"
import { routes } from "@/lib/routes"
import { PROFESSIONAL_LANGUAGES, ProfessionalFrame, ProfessionalReportButton } from "./profile-fields"

type MemberProfile = NonNullable<FunctionReturnType<typeof api.modules.professionals.read.getByHandle>>

export function MemberProfessionalProfile({ handle }: { handle: string }) {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("professionals")
  return <ProfessionalFrame title={t("profile.title")}><ProfileQuery key={JSON.stringify([networkId, personId, handle])} handle={handle} /></ProfessionalFrame>
}

function ProfileQuery({ handle }: { handle: string }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("professionals")
  const query = useAuthenticatedConvexQuery(api.modules.professionals.read.getByHandle, { networkId, handle })
  if (query.isError) return <div className="grid gap-3"><p role="alert">{t("status.unavailable")}</p><Button variant="outline" onClick={() => { void query.refetch() }}>{t("actions.retry")}</Button></div>
  if (query.isPending || query.data === undefined) return <p role="status">{t("status.loading")}</p>
  if (!query.data) return <p role="alert">{t("status.unavailable")}</p>
  return <div aria-busy={query.isFetching || undefined}>{query.isFetching ? <p role="status">{t("status.refreshing")}</p> : null}<ProfessionalProfileContent profile={query.data} refreshing={query.isFetching} /></div>
}

export function ProfessionalProfileContent({ profile, refreshing = false }: { profile: MemberProfile; refreshing?: boolean }) {
  const { t } = useTranslation("professionals")
  return <div className={`${SCREEN_SECTIONS} gap-y-5`}>
    <Card className="col-span-full"><div className="grid gap-3"><header><h2 className="mp-subtitle">{profile.displayName}</h2><p className="text-sm text-muted-foreground">@{profile.handle}</p></header><p className="text-lg font-medium">{profile.title}</p><p>{t(`availability.${profile.availability}`)}{profile.zone ? <span> · {profile.zone}</span> : null}</p><p className="text-sm text-muted-foreground">{t("status.declared")}</p><div className="flex flex-wrap gap-2"><ShopLink href={routes.profile(profile.handle)}>{t("actions.socialProfile")}</ShopLink>{profile.isMe ? <ShopLink href={routes.professionalEditor()}>{t("actions.edit")}</ShopLink> : <ProfessionalReportButton target={{ kind: "professionalProfile", id: profile.profileId }} />}</div></div></Card>
    <Card><div className="grid gap-3"><h2 className="mp-subtitle">{t("profile.about")}</h2><p className="whitespace-pre-wrap">{profile.bio || t("profile.emptyAbout")}</p></div></Card>
    <div className="grid min-w-0 gap-4 md:grid-cols-2"><Card><div className="grid gap-3"><h2 className="mp-subtitle">{t("profile.skills")}</h2><ul className="flex flex-wrap gap-2">{profile.skills.map(skill => <li key={skill} className="rounded-full bg-muted px-3 py-1 text-sm">{skill}</li>)}</ul></div></Card><Card><div className="grid gap-3"><h2 className="mp-subtitle">{t("profile.languages")}</h2><ul>{profile.languageCodes.map(code => <li key={code}>{PROFESSIONAL_LANGUAGES.some(item => item === code) ? t(`languages.${code}`) : code}</li>)}</ul></div></Card></div>
    <Card><div className="grid gap-4"><h2 className="mp-subtitle">{t("profile.portfolio")}</h2>{profile.portfolio.length ? profile.portfolio.map((item, index) => <article key={index} className="grid gap-2 border-t border-border pt-3"><h3 className="font-medium">{item.title}</h3><p className="whitespace-pre-wrap text-sm">{item.description}</p></article>) : <p className="text-sm text-muted-foreground">{t("profile.emptyPortfolio")}</p>}</div></Card>
    <Card><div className="grid gap-3"><h2 className="mp-subtitle">{t("profile.activities")}</h2>{profile.activities.length ? <ul className="grid gap-2 sm:grid-cols-2">{profile.activities.map(activity => <li key={`${activity.kind}:${activity.handle}`}><ShopLink href={activity.kind === "shop" ? routes.storefront(activity.handle) : routes.page(activity.handle)}>{activity.name}</ShopLink></li>)}</ul> : <p className="text-sm text-muted-foreground">{t("profile.emptyActivities")}</p>}</div></Card>
    <Card><div className="grid gap-3"><h2 className="mp-subtitle">{t("profile.collaborations")}</h2>{profile.collaborationTypes.length ? <ul className="flex flex-wrap gap-2">{profile.collaborationTypes.map(value => <li key={value} className="rounded-full bg-muted px-3 py-1 text-sm">{t(`collaborationTypes.${value}`)}</li>)}</ul> : <p>{t("profile.noCollaboration")}</p>}{profile.canPropose ? <ProfessionalProposalForm profile={profile} disabled={refreshing} /> : !profile.isMe ? <p className="text-sm text-muted-foreground">{t("profile.proposalUnavailable")}</p> : null}</div></Card>
    <div className="col-span-full grid"><ShopLink href={routes.professionals()}>{t("actions.directory")}</ShopLink></div>
  </div>
}

function ProfessionalProposalForm({ profile, disabled }: { profile: MemberProfile; disabled: boolean }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("professionals")
  const id = useId()
  const connectivity = useCartConnectivity()
  const liveGeneration = useRef(connectivity.generation)
  useEffect(() => { liveGeneration.current = connectivity.generation }, [connectivity.generation])
  const action = useShopAction()
  const propose = useMutation(api.modules.professionals.collaborations.propose)
  const [failure, setFailure] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const schema = z.object({ collaborationType: z.enum(PROFESSIONAL_COLLABORATION_TYPES).refine(value => profile.collaborationTypes.includes(value), t("validation.text")), message: z.string().max(600, t("validation.length")).refine(value => parseProfessionalCollaborationMessage(value) !== null, t("validation.required")) }).strict()
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { collaborationType: profile.collaborationTypes[0] ?? "project", message: "" } })
  useShopDirtyGuard(form.formState.isDirty && !sent)
  useEffect(() => { if (!connectivity.online) setFailure(null) }, [connectivity.online])
  const submit = async (value: z.infer<typeof schema>) => {
    if (disabled || action.pending || !profile.canPropose || !navigator.onLine) return
    const generation = liveGeneration.current
    setFailure(null); setSent(false)
    const result = await action.run(async () => { try { await propose({ networkId, toHandle: profile.handle, collaborationType: value.collaborationType, message: value.message }); return { ok: true as const } } catch (error) { return { ok: false as const, key: professionalErrorKey(error) } } })
    if (!result || !action.current() || liveGeneration.current !== generation) return
    if (result.ok) setSent(true); else setFailure(result.key)
  }
  return <form className="grid min-w-0 gap-4 border-t border-border pt-4" noValidate onSubmit={event => { void form.handleSubmit(submit)(event) }}><p className="text-sm text-muted-foreground">{t("profile.proposalLead")}</p><fieldset disabled={disabled || action.pending || !connectivity.online || sent} className="grid min-w-0 gap-4"><Field id={`${id}-type`} label={t("directory.type")} error={form.formState.errors.collaborationType?.message}><select id={`${id}-type`} className={SHOP_SELECT_CLASS} {...form.register("collaborationType")}>{profile.collaborationTypes.map(value => <option key={value} value={value}>{t(`collaborationTypes.${value}`)}</option>)}</select></Field><Field id={`${id}-message`} label={t("profile.message")} hint={t("profile.messageHint")} error={form.formState.errors.message?.message}><TextArea id={`${id}-message`} maxLength={600} aria-describedby={`${id}-message-hint`} aria-invalid={!!form.formState.errors.message} {...form.register("message")} /></Field><Button type="submit" pending={action.pending}>{t("actions.propose")}</Button></fieldset>{!connectivity.online ? <p role="status">{t("status.offline")}</p> : null}{failure || action.error ? <p role="alert">{failure ? t(failure) : t("errors.unavailable")}</p> : null}{sent ? <><p role="status">{t("profile.proposed")}</p><ShopLink href={routes.professionalCollaborations()}>{t("actions.collaborations")}</ShopLink></> : null}</form>
}
