"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import { useRouter } from "next/navigation"
import { useId } from "react"
import { effectiveActivityConfiguration } from "@antsia/social-domain/activityConfiguration"
import { ActivityConfigurationFields } from "./activity-configuration-fields"
import { useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Button, Card, CenteredStatus, Field, TextInput } from "@/components/shared/controls"
import { SCREEN_SECTIONS } from "@/components/shared/screen-layout"
import { routes } from "@/lib/routes"
import { SHOP_FORM_LIMITS, startShopSchema, type StartShopValues } from "./shop-model"
import { ShopDashboardCard } from "./shop-dashboard-card"
import { ShopFrame, ShopLink, ShopQueryFailure, SHOP_SELECT_CLASS, useShopAction, useShopDirtyGuard } from "./shop-ui"

export function MyShopsScreen() {
  const { networkId, personId } = useNetwork()
  return <MyShopsContent key={`${networkId}:${personId}`} />
}

function MyShopsContent() {
  const { t } = useTranslation("shops")
  const { networkId } = useNetwork()
  const shops = useAuthenticatedConvexQuery(api.modules.shops.shops.myShops, { networkId })
  return <ShopFrame title={t("list.title")} lead={t("list.lead")}>
    <ShopLink href={routes.me()}>{t("common.profile")}</ShopLink>
    <div className={`${SCREEN_SECTIONS} gap-y-5`}>
      <div className="grid min-w-0 content-start gap-5">
        {shops.isError ? <ShopQueryFailure href={routes.me()} retry={() => void shops.refetch()} /> : shops.data === undefined ? <CenteredStatus label={t("common.loading")} /> : <>
          {shops.data.items.length === 0 ? <Card><p>{t("list.empty")}</p></Card> : <ul className={`${SCREEN_SECTIONS} gap-y-3`}>{shops.data.items.map((shop) => <li key={shop.shopId}><ShopDashboardCard shop={{ ...shop, shopId: String(shop.shopId) }} t={(key, options) => t(key, options)} /></li>)}</ul>}
          {shops.data.truncated ? <p role="status" className="text-sm text-muted-foreground">{t("list.truncated")}</p> : null}
        </>}
      </div>
      <StartShopForm />
    </div>
  </ShopFrame>
}

function StartShopForm() {
  const { t } = useTranslation("shops")
  const { networkId } = useNetwork()
  const router = useRouter()
  const id = useId()
  const action = useShopAction()
  const start = useMutation(api.modules.shops.shops.startShop)
  const pages = useAuthenticatedConvexQuery(api.modules.shops.shops.eligibleShopPages, { networkId })
  const form = useForm<StartShopValues>({ resolver: zodResolver(startShopSchema(t)), defaultValues: { model: "products", activityConfiguration: effectiveActivityConfiguration(undefined, "products"), name: "", pageId: "" } })
  const pageId = useWatch({ control: form.control, name: "pageId" })
  const configuration = useWatch({ control: form.control, name: "activityConfiguration" })
  useShopDirtyGuard(form.formState.isDirty)
  return <Card><form noValidate aria-labelledby={`${id}-title`} className="mp-form-grid" onSubmit={form.handleSubmit(async (values) => {
    if (values.pageId && (pages.isError || !pages.data?.items.some((page) => page.pageId === values.pageId))) { form.setError("pageId", { message: t("start.pageUnavailable") }); return }
    await action.run(() => start({ networkId, model: values.model, activityConfiguration: values.activityConfiguration, ...(values.pageId ? { pageId: values.pageId as Id<"pages"> } : { name: values.name }) }), (created) => router.push(routes.shopEditor(String(created.shopId))))
  })}>
    <h2 id={`${id}-title`} className="mp-subtitle">{t("start.title")}</h2>
    <p className="text-sm text-muted-foreground">{t("start.lead")}</p>
    <ActivityConfigurationFields value={effectiveActivityConfiguration(configuration, "products")} disabled={action.pending} onChange={(next) => {
      form.setValue("activityConfiguration", next, { shouldDirty: true, shouldValidate: true })
      form.setValue("model", next.capabilities.includes("products") ? "products" : next.capabilities.includes("services") ? "quote_services" : "products", { shouldDirty: true })
    }} />
    <Field id={`${id}-page`} label={t("start.page")} hint={t("start.pageHint")} error={form.formState.errors.pageId?.message}>
      <select id={`${id}-page`} className={SHOP_SELECT_CLASS} disabled={action.pending || pages.data === undefined || pages.isError} aria-describedby={`${id}-page-hint`} {...form.register("pageId")}><option value="">{t("start.newDraft")}</option>{!pages.isError ? pages.data?.items.map((page) => <option key={page.pageId} value={page.pageId}>{page.name} · @{page.handle}</option>) : null}</select>
    </Field>
    {pages.isError ? <div role="status"><p>{t("start.pagesError")}</p><Button type="button" variant="ghost" onClick={() => void pages.refetch()}>{t("common.retry")}</Button></div> : pages.data?.truncated ? <p role="status" className="text-sm text-muted-foreground">{t("start.pagesTruncated")}</p> : null}
    {!pageId ? <Field id={`${id}-name`} label={t("fields.name")} error={form.formState.errors.name?.message}><TextInput id={`${id}-name`} autoComplete="organization" maxLength={SHOP_FORM_LIMITS.nameMax} disabled={action.pending} aria-invalid={Boolean(form.formState.errors.name)} {...form.register("name")} /></Field> : null}
    {action.error ? <p role="alert" className="text-sm text-destructive">{action.error}</p> : null}
    <Button type="submit" pending={action.pending} className="w-full sm:w-auto sm:justify-self-start">{t(action.pending ? "start.creating" : "start.submit")}</Button>
  </form></Card>
}
