"use client"

import { api } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import { useEffect, useId, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { Button, Field } from "@/components/shared/controls"
import { routes } from "@/lib/routes"
import { publicationActions, type ShopEditorData } from "./shop-model"
import { ShopLink, SHOP_SELECT_CLASS, useShopAction } from "./shop-ui"

const schema = z.object({ publicListing: z.boolean(), visibility: z.enum(["network", "root"]) })
type AudienceValues = z.infer<typeof schema>

export function ShopPublicationForm({ shop, dirty, onDirty, onPrepare }: { shop: ShopEditorData; dirty: boolean; onDirty: (dirty: boolean) => void; onPrepare: () => void }) {
  const { t } = useTranslation("shops")
  const { networkId, personId } = useNetwork()
  const action = useShopAction()
  const audience = useMutation(api.modules.shops.shops.setStorefrontAudience)
  const request = useMutation(api.modules.shops.shops.requestStorefrontPublication)
  const cancel = useMutation(api.modules.shops.shops.cancelPublicationRequest)
  const withdraw = useMutation(api.modules.shops.shops.withdrawStorefront)
  const [notice, setNotice] = useState<string | null>(null)
  const id = useId()
  const form = useForm<AudienceValues>({ resolver: zodResolver(schema), defaultValues: { publicListing: false, visibility: shop.audience.visibility } })
  const selectedVisibility = form.watch("visibility")
  const publicListing = form.watch("publicListing")
  const displayedVersion = shop.audience.currentTextVersion
  const consentStamp = JSON.stringify([networkId, personId, shop.shopId, displayedVersion, selectedVisibility])
  const latestStamp = useRef(consentStamp); latestStamp.current = consentStamp
  const accepted = useRef<{ stamp: string; version: string } | null>(null)
  const consentInput = form.register("publicListing")
  const version = useRef(shop.updatedAt)
  useEffect(() => {
    accepted.current = null
    form.setValue("publicListing", false, { shouldDirty: true })
  }, [consentStamp, form.setValue])
  useEffect(() => { onDirty(form.formState.isDirty) }, [form.formState.isDirty, onDirty])
  useEffect(() => {
    if (version.current === shop.updatedAt) return
    version.current = shop.updatedAt
    if (!form.formState.isDirty) form.reset({ publicListing: false, visibility: shop.audience.visibility })
  }, [shop, form])
  const permissions = publicationActions(shop, dirty || form.formState.isDirty)
  return <section className="grid min-w-0 gap-6" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className="text-lg font-semibold">{t("steps.publish")}</h2>
    <p>{t("publication.summary", { name: shop.name ?? t("list.untitled"), model: t(`models.${shop.model}`) })}</p>
    <p className="font-medium">{t(`states.${shop.storefront.state}`)}</p>
    {shop.storefront.decisionReason ? <p className="whitespace-pre-wrap rounded-[var(--ui2-card-radius)] bg-muted p-4">{shop.storefront.decisionReason}</p> : null}
    <form noValidate className="grid gap-4 rounded-[var(--ui2-card-radius)] border border-border p-4" onSubmit={form.handleSubmit(async (values) => {
      setNotice(null)
      const consent = accepted.current
      if (values.publicListing && (!consent || consent.stamp !== consentStamp || latestStamp.current !== consent.stamp)) {
        form.setError("publicListing", { message: t("publication.consentChanged") }); return
      }
      await action.run(() => audience({ networkId, shopId: shop.shopId, publicListing: values.publicListing, ...(values.publicListing && consent ? { textVersion: consent.version } : {}), ...(!shop.audience.rootNetwork ? { visibility: values.visibility } : {}) }), () => {
        if (latestStamp.current !== consentStamp) return
        accepted.current = null; form.reset({ ...values, publicListing: false }); setNotice(t("publication.audienceSaved"))
      })
    })}>
      <h3 className="font-display text-base font-bold leading-snug">{t("publication.audienceTitle")}</h3>
      <p className="text-sm text-muted-foreground">{t("publication.memberAudience")}</p>
      {!shop.audience.rootNetwork ? <Field id={`${id}-visibility`} label={t("publication.reach")}><select id={`${id}-visibility`} className={SHOP_SELECT_CLASS} disabled={action.pending} {...form.register("visibility")}><option value="network">{t("publication.networkOnly")}</option><option value="root">{t("publication.alsoRoot")}</option></select></Field> : null}
      <label className="flex min-h-11 items-start gap-3"><input type="checkbox" className="mt-1 size-5 shrink-0 accent-primary" disabled={action.pending} aria-describedby={`${id}-consent`} {...consentInput} onChange={(event) => { accepted.current = event.target.checked ? { stamp: consentStamp, version: displayedVersion } : null; void consentInput.onChange(event) }} /><span>{t("publication.publicConsent")}</span></label>
      <p id={`${id}-consent`} className="text-sm text-muted-foreground">{t("publication.consentDetails")}</p>
      <p className="text-sm text-muted-foreground">{t("publication.newConsent")}</p>
      {form.formState.errors.publicListing?.message ? <p role="alert" className="text-sm text-destructive">{form.formState.errors.publicListing.message}</p> : null}
      <p className="text-xs text-muted-foreground">{t("publication.consentVersion", { version: displayedVersion })}</p>
      <p className="text-sm">{t(shop.audience.publicNow ? "publication.publicNow" : "publication.notPublicNow")}</p>
      <Button type="submit" variant="outline" pending={action.pending} disabled={!form.formState.isDirty && !shop.audience.publicListing} className="w-full sm:w-auto sm:justify-self-start">{t(!publicListing && shop.audience.publicListing ? "publication.withdrawPublicConsent" : "publication.saveAudience")}</Button>
    </form>
    {shop.publication.gaps.length > 0 ? <div className="grid gap-2"><p>{t("publication.incomplete")}</p><ul className="list-inside list-disc">{shop.publication.gaps.map((gap) => <li key={gap}>{t(`publication.gaps.${gap}`)}</li>)}</ul><Button type="button" variant="outline" onClick={onPrepare} className="w-full sm:w-auto sm:justify-self-start">{t("publication.prepare")}</Button></div> : null}
    {shop.policy === "closed" ? <div className="grid gap-2 rounded-[var(--ui2-card-radius)] bg-muted p-4"><p>{t("publication.closed")}</p><Button type="button" variant="outline" onClick={onPrepare} className="w-full sm:w-auto sm:justify-self-start">{t("publication.prepare")}</Button></div> : null}
    {dirty || form.formState.isDirty ? <p role="status" className="text-sm">{t("publication.saveFirst")}</p> : null}
    {shop.storefront.state === "suspended" ? <p>{t("publication.suspended")}</p> : null}
    {shop.storefront.state === "pending_review" ? <p>{t("publication.reviewPending")}</p> : null}
    {permissions.request ? <Button type="button" pending={action.pending} onClick={() => void action.run(() => request({ networkId, shopId: shop.shopId }), (result) => setNotice(t(`states.${result.storefront}`)))} className="w-full sm:w-auto sm:justify-self-start">{t(shop.publication.outcome === "admit" ? "publication.publish" : "publication.request")}</Button> : null}
    {permissions.cancel ? <Button type="button" variant="outline" pending={action.pending} onClick={() => void action.run(() => cancel({ networkId, shopId: shop.shopId }), (result) => setNotice(t(`states.${result.storefront}`)))} className="w-full sm:w-auto sm:justify-self-start">{t("publication.cancelRequest")}</Button> : null}
    {permissions.withdraw ? <Button type="button" variant="outline" pending={action.pending} onClick={() => { if (window.confirm(t("publication.withdrawConfirm"))) void action.run(() => withdraw({ networkId, shopId: shop.shopId }), (result) => setNotice(t(`states.${result.storefront}`))) }} className="w-full sm:w-auto sm:justify-self-start">{t("publication.withdraw")}</Button> : null}
    {action.error ? <p role="alert" className="text-sm text-destructive">{action.error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {shop.page && shop.storefront.state === "published" ? <ShopLink href={routes.storefront(shop.page.handle)}>{t("storefront.viewStorefront")}</ShopLink> : null}
  </section>
}
