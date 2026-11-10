"use client"

import { api } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import { effectiveActivityConfiguration, parseActivityConfiguration, type ActivityConfiguration } from "@antsia/social-domain/activityConfiguration"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import { useEffect, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Button } from "@/components/shared/controls"
import { ActivityConfigurationFields } from "./activity-configuration-fields"
import type { ShopEditorData } from "./shop-model"
import { useShopAction } from "./shop-ui"

/** Reprise du brouillon d'activité sans remplacer une saisie par un retour temps réel. */
export function ShopActivityForm({ shop, onDirty, onNext }: { shop: ShopEditorData; onDirty: (value: boolean) => void; onNext: () => void }) {
  const { t } = useTranslation("activityConfiguration")
  const { t: tShops } = useTranslation("shops")
  const { networkId } = useNetwork()
  const action = useShopAction()
  const update = useMutation(api.modules.shops.shops.updateShop)
  const source = effectiveActivityConfiguration((shop as ShopEditorData & { activityConfiguration?: ActivityConfiguration }).activityConfiguration, shop.model)
  const sourceSignature = JSON.stringify(source)
  const schema = z.object({ activityConfiguration: z.custom<ActivityConfiguration>(value => parseActivityConfiguration(value) !== null, t("invalid")) })
  type Values = z.infer<typeof schema>
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { activityConfiguration: source } })
  const [saved, setSaved] = useState(false)
  const dirty = form.formState.isDirty
  useEffect(() => { onDirty(dirty) }, [dirty, onDirty])
  useEffect(() => {
    if (!form.formState.isDirty) form.reset({ activityConfiguration: JSON.parse(sourceSignature) as ActivityConfiguration })
  }, [form, sourceSignature])
  const save = (advance: boolean) => form.handleSubmit(async values => {
    if (!form.formState.isDirty) { if (advance) onNext(); return }
    const payload = { networkId, shopId: shop.shopId, activityConfiguration: values.activityConfiguration }
    await action.run(() => update(payload), () => {
      form.reset(values)
      onDirty(false)
      setSaved(true)
      if (advance) onNext()
    })
  })
  return <form noValidate className="mp-form-grid" onSubmit={save(false)}>
    <h2 className="mp-subtitle">{tShops("steps.activity")}</h2>
    <p>{t("lead")}</p>
    <Controller control={form.control} name="activityConfiguration" render={({ field }) => <ActivityConfigurationFields value={field.value} disabled={action.pending} onChange={value => { setSaved(false); field.onChange(value) }} />} />
    <p className="text-sm text-muted-foreground">{shop.page ? tShops("activity.existingPage", { handle: shop.page.handle }) : tShops("activity.draftPage")}</p>
    <p className="text-sm text-muted-foreground">{t("permissionsHint")}</p>
    {form.formState.errors.activityConfiguration?.message ? <p role="alert" className="text-sm text-destructive">{form.formState.errors.activityConfiguration.message}</p> : null}
    {action.error ? <p role="alert" className="text-sm text-destructive">{action.error}</p> : null}
    <p role="status" className="text-sm text-muted-foreground">{dirty ? t("unsaved") : saved ? t("saved") : ""}</p>
    <div className="flex flex-wrap gap-2"><Button type="submit" pending={action.pending} disabled={!dirty}>{t("save")}</Button><Button type="button" variant="outline" disabled={action.pending} onClick={() => void save(true)()}>{dirty ? t("saveAndContinue") : tShops("steps.presentation")}</Button></div>
  </form>
}
