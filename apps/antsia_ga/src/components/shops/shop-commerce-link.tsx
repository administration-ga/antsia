"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { COMMERCE_LINK_PERMISSIONS } from "@antsia/social-domain/commerce/command"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAction, useMutation } from "convex/react"
import { useId } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Button } from "@/components/shared/controls"
import { useShopAction } from "./shop-ui"

const linkForm = z.object({ permissions: z.array(z.enum(COMMERCE_LINK_PERMISSIONS)).min(1), consent: z.literal(true) })
type LinkForm = z.input<typeof linkForm>

/** Autorisation volontaire ; la signature machine et les preuves restent au serveur. */
export function ShopCommerceLink({ shopId, dirty = false }: { shopId: Id<"shops">; dirty?: boolean }) {
  const { t } = useTranslation("shops")
  const { networkId } = useNetwork()
  const query = useAuthenticatedConvexQuery(api.modules.shops.commerceLinks.linkStatus, { networkId, shopId })
  const begin = useAction(api.modules.shops.commerceLinkActions.beginLink)
  const revoke = useMutation(api.modules.shops.commerceLinks.revokeLink)
  const action = useShopAction()
  const id = useId()
  const form = useForm<LinkForm>({ resolver: zodResolver(linkForm), defaultValues: { permissions: ["catalog_drafts", "publish_catalog"], consent: undefined } })

  return <section aria-labelledby={`${id}-title`} className="grid gap-4 rounded-[var(--ui2-card-radius)] border border-[color:var(--esp-surface-border)] bg-background p-[var(--esp-card-padding,16px)]">
    <h3 id={`${id}-title`} className="font-display text-base font-bold leading-snug">{t("link.title")}</h3>
    <p className="text-sm text-muted-foreground">{t("link.lead")}</p>
    {query.isError ? <div role="alert" className="grid gap-2"><p>{t("link.loadError")}</p><Button type="button" variant="outline" onClick={() => void query.refetch()}>{t("common.retry")}</Button></div> : !query.data ? <p role="status">{t("common.loading")}</p> : <>
      {query.data.link ? <div className="grid gap-3">
        <p role="status" className="font-medium">{t(`link.states.${query.data.link.state}`)}</p>
        <ul className="list-inside list-disc text-sm">{query.data.link.permissions.map((permission) => <li key={permission}>{t(`link.permissions.${permission}`)}</li>)}</ul>
        <p className="text-sm text-muted-foreground">{t("link.noSales")}</p>
        {query.data.link.state === "suspended" ? <p className="text-sm text-muted-foreground">{t("link.relinkAfterRevoke")}</p> : null}
        {query.data.link.state !== "revoked" ? <Button type="button" variant="outline" pending={action.pending} className="w-full sm:w-auto sm:justify-self-start" onClick={() => {
          if (!window.confirm(t("link.revokeConfirm"))) return
          void action.run(() => revoke({ networkId, shopId }))
        }}>{t("link.revoke")}</Button> : null}
      </div> : null}
      {!query.data.available ? <p role="status" className="text-sm text-muted-foreground">{t(query.data.reason === "page_required" ? "link.pageRequired" : "link.unavailable")}</p> : !query.data.link || query.data.link.state === "revoked" ? <form noValidate className="antsia-form-grid" onSubmit={form.handleSubmit(async (values) => {
        if (dirty || !query.data?.available) return
        const consentTextVersion = query.data.consentTextVersion
        await action.run(() => begin({ networkId, shopId, requestedPermissions: [...values.permissions].sort(), consentTextVersion }), (result) => {
          if (result.outcome === "ready") window.location.assign(result.authorizationUrl)
          else action.setError(t("link.unavailable"))
        })
      })}>
        <fieldset disabled={action.pending || dirty} className="grid gap-2">
          <legend className="mb-2 font-medium">{t("link.permissionsTitle")}</legend>
          {COMMERCE_LINK_PERMISSIONS.map((permission) => <label key={permission} className="flex min-h-11 items-start gap-3 rounded-[var(--ui2-card-radius)] border border-border p-[var(--esp-card-padding,16px)]"><input type="checkbox" value={permission} className="mt-1 size-4 accent-primary" {...form.register("permissions")} /><span className="text-sm">{t(`link.permissions.${permission}`)}</span></label>)}
        </fieldset>
        {form.formState.errors.permissions ? <p role="alert" className="text-sm text-destructive">{t("link.choosePermission")}</p> : null}
        <label className="flex min-h-11 items-start gap-3"><input type="checkbox" disabled={action.pending || dirty} className="mt-1 size-4 accent-primary" {...form.register("consent")} /><span className="text-sm">{t("link.consent", { version: query.data.consentTextVersion })}</span></label>
        {form.formState.errors.consent ? <p role="alert" className="text-sm text-destructive">{t("link.consentRequired")}</p> : null}
        {query.data.pending ? <div className="grid gap-2"><p role="status" className="text-sm text-muted-foreground">{t("link.pending")}</p><Button type="button" variant="outline" pending={action.pending} className="w-full sm:w-auto sm:justify-self-start" onClick={() => { void action.run(() => revoke({ networkId, shopId })) }}>{t("link.cancelPending")}</Button></div> : null}
        {dirty ? <p role="status" className="text-sm text-muted-foreground">{t("link.saveFirst")}</p> : null}
        <Button type="submit" pending={action.pending} disabled={dirty} className="w-full sm:w-auto sm:justify-self-start">{t("link.begin")}</Button>
      </form> : null}
    </>}
    {action.error ? <p role="alert" className="text-sm text-destructive">{action.error}</p> : null}
  </section>
}
