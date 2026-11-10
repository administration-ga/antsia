"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { EDITORIAL_BYLINE_CONSENT_VERSION, EDITORIAL_ROLES } from "@antsia/social-domain/editorial"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useEffect, useId, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import type { z } from "zod"

import { Button, Card, Field, TextInput } from "@/components/shared/controls"
import { SHOP_SELECT_CLASS, ShopLink, useShopDirtyGuard } from "@/components/shops/shop-ui"
import { editorialInviteSchema } from "@/lib/editorial-form"
import { routes } from "@/lib/routes"
import { EditorialFrame, EditorialLinks, EditorialOperationStatus, EditorialUnavailable, useEditorialOperation } from "./editorial-fields"

type Grant = FunctionReturnType<typeof api.modules.editorial.grants.list>["page"][number]
type Media = NonNullable<FunctionReturnType<typeof api.modules.editorial.media.myMedia>>

export function EditorialTeamScreen({ pageId }: { pageId: Id<"pages"> }) {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("editorial")
  return <EditorialFrame title={t("team.title")} lead={t("team.lead")}><TeamQuery key={JSON.stringify([networkId, personId, pageId])} pageId={pageId} /></EditorialFrame>
}
function TeamQuery({ pageId }: { pageId: Id<"pages"> }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("editorial")
  const [cursor, setCursor] = useState<string | null>(null)
  const invite = useMutation(api.modules.editorial.grants.invite)
  const media = useAuthenticatedConvexQuery(api.modules.editorial.media.myMedia, { networkId, pageId })
  const grants = useAuthenticatedConvexQuery(api.modules.editorial.grants.list, { networkId, pageId, paginationOpts: { cursor, numItems: 12 } })
  const read = async () => { const [head, list] = await Promise.all([media.refetch(), grants.refetch()]); return !head.isError && !!head.data && !list.isError && list.data !== undefined }
  if (media.isError || grants.isError) return <EditorialUnavailable retry={() => { void read() }} />
  if (media.isPending || grants.isPending || media.data === undefined || grants.data === undefined) return <p role="status">{t("status.loading")}</p>
  if (!media.data) return <EditorialUnavailable />
  return <div className="grid min-w-0 gap-5"><EditorialLinks pageId={pageId} handle={media.data.handle} canConfigure={media.data.permissions.canConfigure} canManageGrants={media.data.permissions.canManageGrants} /><h2 className="mp-subtitle">{media.data.name}</h2>{media.data.permissions.canManageGrants && media.data.mediaId ? <EditorialInviteForm media={media.data} grants={grants.data.page} refreshing={media.isFetching || grants.isFetching} reread={read} /> : null}{grants.isFetching ? <p role="status">{t("status.refreshing")}</p> : null}{grants.data.page.length ? grants.data.page.map(grant => <EditorialGrantCard key={grant.grantId} grant={grant} refreshing={grants.isFetching || media.isFetching} reread={read} reinvite={media.data!.permissions.canManageGrants && (media.data!.permissions.canGrantPublisher || grant.role === "author" || grant.role === "editor") && (grant.state === "revoked" || grant.state === "declined") ? () => invite({ networkId, pageId, handle: grant.handle, role: grant.role, expectedRevision: grant.revision }) : undefined} />) : <p role="status">{t(grants.data.filteredWindow && !grants.data.isDone ? "desk.filteredWindow" : "team.empty")}</p>}<div className="flex flex-wrap gap-2">{!grants.data.isDone && grants.data.continueCursor ? <Button variant="outline" disabled={grants.isFetching} onClick={() => setCursor(grants.data!.continueCursor)}>{t("actions.next")}</Button> : null}{cursor ? <Button variant="outline" disabled={grants.isFetching} onClick={() => setCursor(null)}>{t("actions.first")}</Button> : null}</div></div>
}

function EditorialInviteForm({ media, grants, refreshing, reread }: { media: Media; grants: Grant[]; refreshing: boolean; reread: () => Promise<boolean> }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("editorial")
  const id = useId()
  const invite = useMutation(api.modules.editorial.grants.invite)
  const operation = useEditorialOperation()
  const schema = editorialInviteSchema(key => t(key))
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { handle: "", role: "author" } })
  const handle = useWatch({ control: form.control, name: "handle" })
  const role = useWatch({ control: form.control, name: "role" })
  const existing = grants.find(grant => grant.handle === handle.trim() && grant.role === role)
  const signature = JSON.stringify([handle.trim(), role])
  const [sent, setSent] = useState<string | null>(null)
  useShopDirtyGuard(form.formState.isDirty && sent !== signature)
  const locked = operation.pending || !operation.online || operation.needsReview || refreshing || !media.permissions.canManageGrants || (role === "publisher" || role === "media_admin") && !media.permissions.canGrantPublisher || sent === signature || !!existing
  return <Card><form className="grid gap-4" noValidate onSubmit={event => { void form.handleSubmit(async values => {
    if (locked) return
    const result = await operation.run(() => invite({ networkId, pageId: media.pageId, handle: values.handle, role: values.role, expectedRevision: 0 }))
    if (result) { setSent(signature); await reread() }
  })(event) }}><h2 className="mp-subtitle">{t("team.invite")}</h2><div className="grid gap-3 sm:grid-cols-2"><Field id={`${id}-handle`} label={t("team.handle")} hint={t("team.handleHint")} error={form.formState.errors.handle?.message}><TextInput id={`${id}-handle`} autoCapitalize="none" spellCheck={false} maxLength={30} {...form.register("handle")} /></Field><Field id={`${id}-role`} label={t("team.role")} error={form.formState.errors.role?.message}><select id={`${id}-role`} className={SHOP_SELECT_CLASS} {...form.register("role")}>{EDITORIAL_ROLES.map(value => <option key={value} value={value} disabled={(value === "publisher" || value === "media_admin") && !media.permissions.canGrantPublisher}>{t(`roles.${value}`)}</option>)}</select></Field></div>{existing ? <p className="text-sm text-muted-foreground">{t(`grantStates.${existing.state}`)}</p> : null}<EditorialOperationStatus operation={operation} />{existing || operation.failure === "errors.conflict" ? <p role="status">{t("team.existingGrantHint")}</p> : null}{sent === signature ? <p role="status">{t("team.invited")}</p> : null}<div className="flex flex-wrap gap-2"><Button type="submit" pending={operation.pending} disabled={locked}>{t("actions.invite")}</Button>{operation.needsReview ? <Button type="button" variant="outline" pending={operation.pending} disabled={!operation.online || refreshing} onClick={() => { void operation.run(async () => ({ ready: await reread() })).then(value => { if (value?.ready) operation.markReviewed() }) }}>{t("actions.reload")}</Button> : null}</div></form></Card>
}

export function EditorialGrantCard({ grant, refreshing = false, reread, reinvite }: { grant: Grant; refreshing?: boolean; reread: () => Promise<boolean>; reinvite?: () => Promise<FunctionReturnType<typeof api.modules.editorial.grants.invite>> }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("editorial")
  const operation = useEditorialOperation()
  const respond = useMutation(api.modules.editorial.grants.respond)
  const revoke = useMutation(api.modules.editorial.grants.revoke)
  const [bylineConsent, setBylineConsent] = useState(false)
  const [changed, setChanged] = useState(false)
  const [completedRevision, setCompletedRevision] = useState<number | null>(null)
  useEffect(() => { setBylineConsent(false) }, [grant.grantId, grant.revision, operation.generation])
  const locked = refreshing || operation.pending || !operation.online || operation.needsReview || completedRevision === grant.revision
  const decide = async (decision: "accepted" | "declined" | "revoked") => {
    if (locked || (decision === "revoked" ? !grant.canRevoke : !grant.canRespond)) return
    if (!window.confirm(t(decision === "accepted" ? "team.acceptConfirm" : decision === "declined" ? "team.declineConfirm" : "team.revokeConfirm"))) return
    const result = await operation.run(async () => {
      if (decision === "revoked") await revoke({ networkId, grantId: grant.grantId, expectedRevision: grant.revision })
      else await respond({ networkId, grantId: grant.grantId, expectedRevision: grant.revision, accept: decision === "accepted", ...(decision === "accepted" && bylineConsent ? { bylineConsentTextVersion: EDITORIAL_BYLINE_CONSENT_VERSION } : {}) })
      return true
    })
    if (result) { setCompletedRevision(grant.revision); setChanged(true); setBylineConsent(false); await reread() }
  }
  return <Card><article className="grid min-w-0 gap-3"><header><p className="text-sm font-medium">{grant.mediaName}</p><h3 className="font-semibold">{grant.displayName}</h3><p className="text-sm text-muted-foreground">@{grant.handle}</p></header><p>{t(`roles.${grant.role}`)} · {t(`grantStates.${grant.state}`)}</p><p className="text-xs text-muted-foreground">{t("article.revision", { revision: grant.revision })}</p>{grant.state === "accepted" ? <p className="text-sm text-muted-foreground">{t(grant.bylineConsented && grant.authorityLive ? "team.bylineAllowed" : "team.bylineClosed")}</p> : null}{grant.canRespond ? <div className="grid gap-2"><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-5 accent-primary" checked={bylineConsent} disabled={locked} onChange={event => setBylineConsent(event.target.checked)} /><span>{t("team.bylineConsent")}</span></label><p className="text-sm text-muted-foreground">{t("team.bylineHint")}</p><p className="text-xs text-muted-foreground">{t("config.consentVersion", { version: EDITORIAL_BYLINE_CONSENT_VERSION })}</p></div> : null}<EditorialOperationStatus operation={operation} />{changed ? <p role="status">{t("team.changed")}</p> : null}<div className="flex flex-wrap gap-2">{grant.canRespond ? <><Button disabled={locked} pending={operation.pending} onClick={() => { void decide("accepted") }}>{t("actions.accept")}</Button><Button variant="outline" disabled={locked} onClick={() => { void decide("declined") }}>{t("actions.decline")}</Button></> : null}{reinvite ? <Button variant="outline" disabled={locked} onClick={() => {
    if (locked || !window.confirm(t("team.reinviteConfirm", { name: grant.displayName }))) return
    void operation.run(reinvite).then(async result => { if (result) { setCompletedRevision(grant.revision); setChanged(true); await reread() } })
  }}>{t("actions.reinvite")}</Button> : null}{grant.canRevoke ? <Button variant="outline" disabled={locked} onClick={() => { void decide("revoked") }}>{t("actions.revoke")}</Button> : null}{grant.state === "accepted" && grant.authorityLive ? <ShopLink href={routes.mediaDesk(grant.pageId)}>{t("actions.desk")}</ShopLink> : null}{operation.needsReview ? <Button variant="outline" pending={operation.pending} disabled={!operation.online || refreshing} onClick={() => { void operation.run(async () => ({ ready: await reread() })).then(value => { if (value?.ready) operation.markReviewed() }) }}>{t("actions.reload")}</Button> : null}</div></article></Card>
}
