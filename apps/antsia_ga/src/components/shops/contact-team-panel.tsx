"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import type { CommercialShopId } from "@antsia/social-features/messagerie"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import { useId, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { Button, Card } from "@/components/shared/controls"
import { ContactInbox } from "./contact-inbox"
import { SHOP_SELECT_CLASS, useShopAction } from "./shop-ui"
import { useCartConnectivity } from "@/components/cart/use-cart-draft"

const RIGHTS = ["canRead", "canReply", "canDecide", "canCall"] as const
const schema = z.object({ personId: z.string().min(1), canRead: z.boolean(), canReply: z.boolean(), canDecide: z.boolean(), canCall: z.boolean() }).refine((value) => value.canRead || (!value.canReply && !value.canDecide && !value.canCall), { path: ["canRead"] })
export function ContactTeamPanel({ shopId }: { shopId: CommercialShopId }) {
  const { networkId, personId } = useNetwork()
  return <ContactTeam key={JSON.stringify([networkId, personId, shopId])} shopId={shopId} />
}
function ContactTeam({ shopId }: { shopId: CommercialShopId }) {
  const { t } = useTranslation("shops")
  const { t: ux } = useTranslation("commerceExperience")
  const { networkId } = useNetwork()
  const id = useId()
  const team = useAuthenticatedConvexQuery(api.modules.commercialMessaging.team.list, { networkId, shopId })
  const settings = useAuthenticatedConvexQuery(api.modules.commercialMessaging.settings.get, { networkId, shopId })
  const grant = useMutation(api.modules.commercialMessaging.team.grant)
  const revoke = useMutation(api.modules.commercialMessaging.team.revoke)
  const setAcceptRequests = useMutation(api.modules.commercialMessaging.settings.setAcceptRequests)
  const action = useShopAction()
  const [saved, setSaved] = useState(false)
  const [search, setSearch] = useState("")
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { personId: "", canRead: true, canReply: false, canDecide: false, canCall: false } })
  const canRead = useWatch({ control: form.control, name: "canRead" })
  const connectivity = useCartConnectivity()
  if (team.isError || settings.isError) return <Card><div role="alert" className="grid gap-3"><p>{t("contact.team.unavailable")}</p><Button variant="outline" disabled={!connectivity.online} onClick={() => { void team.refetch(); void settings.refetch() }}>{t("common.retry")}</Button></div></Card>
  if (!team.data || !settings.data) return <Card><p role="status">{t("common.loading")}</p></Card>
  return <Card><div className="grid min-w-0 gap-4 [overflow-wrap:anywhere]"><h2 className="text-xl font-semibold">{t("contact.team.title")}</h2><p className="text-sm text-muted-foreground">{t("contact.team.help")}</p><p className="text-sm text-muted-foreground">{ux("contact.teamContext")}</p>
    {team.isError || settings.isError ? <div role="alert" className="grid gap-2"><p>{t("contact.team.unavailable")}</p><Button variant="outline" onClick={() => { void team.refetch(); void settings.refetch() }}>{t("common.retry")}</Button></div> : null}
    {settings.data ? <><label className="flex min-h-11 items-start gap-3"><input type="checkbox" className="mt-1 size-4 accent-primary" checked={settings.data.acceptRequests} disabled={action.pending || !connectivity.online || !settings.data.canManage} onChange={(event) => void action.run(() => setAcceptRequests({ networkId, shopId, acceptRequests: event.target.checked }), () => setSaved(true))} /><span>{t("contact.team.openRequests")}</span></label>{!settings.data.networkEnabled ? <p role="status" className="text-sm text-muted-foreground">{t("contact.team.networkClosed")}</p> : null}</> : null}
    {team.data ? <><ul className="grid gap-2">{team.data.items.map((item) => <li key={item.personId} className="grid gap-2 rounded-xl border border-border p-3"><p className="font-medium">{item.displayName ?? item.handle ?? t("contact.person")}</p><p className="text-xs text-muted-foreground">{t(item.revoked ? "contact.team.revoked" : item.accepted ? "contact.team.active" : "contact.team.waiting")}</p><p className="text-xs">{RIGHTS.filter((right) => item[right]).map((right) => t(`contact.team.rights.${right}`)).join(" · ")}</p>{team.data?.canManage && !item.revoked ? confirmRevoke === String(item.personId) ? <div className="grid gap-2"><p className="text-sm">{t("contact.team.confirmRevoke")}</p><div className="flex flex-wrap gap-2"><Button variant="outline" pending={action.pending} disabled={!connectivity.online} onClick={() => void action.run(() => revoke({ networkId, shopId, personId: item.personId }), () => { setConfirmRevoke(null); setSaved(true) })}>{t("contact.confirm.action")}</Button><Button variant="ghost" disabled={action.pending || !connectivity.online} onClick={() => setConfirmRevoke(null)}>{t("contact.cancel")}</Button></div></div> : <Button variant="outline" disabled={action.pending || !connectivity.online} className="justify-self-start" onClick={() => setConfirmRevoke(String(item.personId))}>{t("contact.team.revoke")}</Button> : null}</li>)}</ul>
      {team.data.canManage ? <form noValidate className="grid gap-3 rounded-xl border border-border p-4" onSubmit={form.handleSubmit(async (values) => {
        if (!navigator.onLine || !team.data?.canManage || !settings.data?.canManage) return
        const candidate = team.data.candidates.find((item) => String(item.personId) === values.personId)
        if (!candidate) { action.setError(t("contact.team.selectionChanged")); return }
        await action.run(() => grant({ networkId, shopId, personId: candidate.personId, canRead: values.canRead, canReply: values.canReply, canDecide: values.canDecide, canCall: values.canCall }), () => { form.reset({ personId: "", canRead: true, canReply: false, canDecide: false, canCall: false }); setSaved(true) })
      })}><label htmlFor={`${id}-person`} className="grid gap-2 text-sm font-medium">{t("contact.team.person")}<select id={`${id}-person`} className={SHOP_SELECT_CLASS} disabled={action.pending || !connectivity.online} aria-invalid={!!form.formState.errors.personId} {...form.register("personId")}><option value="">{t("contact.team.choose")}</option>{team.data.candidates.map((item) => <option key={item.personId} value={item.personId}>{item.displayName ?? item.handle ?? t("contact.person")}</option>)}</select></label><fieldset className="grid gap-2" disabled={action.pending || !connectivity.online}><legend className="mb-2 text-sm font-medium">{t("contact.team.permissions")}</legend>{RIGHTS.map((right) => <label key={right} className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-4 accent-primary" disabled={right !== "canRead" && !canRead} {...form.register(right, right === "canRead" ? { onChange: (event: { target: { checked: boolean } }) => { if (!event.target.checked) { form.setValue("canReply", false); form.setValue("canDecide", false); form.setValue("canCall", false) } } } : undefined)} /><span>{t(`contact.team.rights.${right}`)}</span></label>)}</fieldset>{form.formState.errors.personId || form.formState.errors.canRead ? <p role="alert" className="text-sm text-destructive">{t("contact.team.selectionChanged")}</p> : null}<Button type="submit" pending={action.pending} disabled={!connectivity.online} className="justify-self-start">{t("contact.team.grant")}</Button></form> : null}
      {team.data.truncated ? <p className="text-xs text-muted-foreground">{t("contact.team.truncated")}</p> : null}
    </> : null}
    {action.error ? <p role="alert" className="text-sm text-destructive">{action.error}</p> : null}{saved ? <p role="status">{t("contact.recorded")}</p> : null}
    <label className="grid gap-2 text-sm font-medium">{t("contact.inbox.search")}<input type="search" className={SHOP_SELECT_CLASS} maxLength={120} value={search} onChange={(event) => setSearch(event.target.value)} /></label><ContactInbox shopId={shopId} query={search} />
  </div></Card>
}
