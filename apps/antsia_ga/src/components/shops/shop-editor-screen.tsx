"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button, Card, CenteredStatus } from "@/components/shared/controls"
import { routes } from "@/lib/routes"
import { EDITOR_STEPS, type EditorStep, type ShopEditorData } from "./shop-model"
import { effectiveActivityConfiguration } from "@antsia/social-domain/activityConfiguration"
import { ShopActivityForm } from "./shop-activity-form"
import { ShopPresentationForm } from "./shop-presentation-form"
import { ShopImageGuide } from "./shop-image-guide"
import { MerchantPaymentPreparationPanel } from "../payment/merchant-payment-preparation-panel"
import { ProviderPreparationPanel } from "../services/provider-preparation-panel"
import { ShopCommerceLink } from "./shop-commerce-link"
import { CatalogReconcilePanel } from "./catalog-reconcile-panel"
import { CatalogCategoryNotice } from "./catalog-category-notice"
import { CatalogPostLinker } from "./catalog-post-linker"
import { DailySpecialPanel } from "./daily-special-panel"
import { ContactTeamPanel } from "./contact-team-panel"
import { ShopPublicationForm } from "./shop-publication-form"
import { ShopFrame, ShopLink, ShopQueryFailure, useShopDirtyGuard } from "./shop-ui"

export function ShopEditorScreen({ shopId }: { shopId: string }) {
  const { networkId, personId } = useNetwork()
  return <ShopEditorQuery key={`${networkId}:${personId}:${shopId}`} shopId={shopId} />
}
function ShopEditorQuery({ shopId }: { shopId: string }) {
  const { t } = useTranslation("shops")
  const { networkId } = useNetwork()
  const query = useAuthenticatedConvexQuery(api.modules.shops.shops.getMyShop, { networkId, shopId: shopId as Id<"shops"> })
  return <ShopFrame title={t("editor.title")} lead={t("editor.lead")}><ShopLink href={routes.myShops()}>{t("list.title")}</ShopLink>{query.isError ? <ShopQueryFailure href={routes.myShops()} retry={() => void query.refetch()} /> : query.data === undefined ? <CenteredStatus label={t("common.loading")} /> : query.data === null ? <ShopQueryFailure href={routes.myShops()} /> : <ShopEditor shop={query.data} />}</ShopFrame>
}

export function ShopEditor({ shop }: { shop: ShopEditorData }) {
  const { t } = useTranslation("shops")
  const id = useId()
  const [step, setStep] = useState<EditorStep>("activity")
  const [presentationDirty, setPresentationDirty] = useState(false)
  const [activityDirty, setActivityDirty] = useState(false)
  const [audienceDirty, setAudienceDirty] = useState(false)
  const dirty = presentationDirty || activityDirty || audienceDirty
  useShopDirtyGuard(dirty)
  /**
   * P18b (A14, WCAG 2.4.3) : changer d'étape DEPUIS un panneau masquait le
   * bouton qui avait le focus, et le focus tombait sur `<body>`. Le titre du
   * panneau ouvert le reçoit désormais ; tout changement d'étape s'annonce
   * (« Étape 2 sur 4 : … ») par une région polie persistante.
   */
  const panels = useRef<Partial<Record<EditorStep, HTMLDivElement | null>>>({})
  const focusHeading = useRef(false)
  const [stepAnnouncement, setStepAnnouncement] = useState("")
  const goTo = (next: EditorStep, moveFocus: boolean) => {
    focusHeading.current = moveFocus
    setStep(next)
    setStepAnnouncement(t("editor.stepPosition", { current: EDITOR_STEPS.indexOf(next) + 1, total: EDITOR_STEPS.length, name: t(`steps.${next}`) }))
  }
  useEffect(() => {
    if (!focusHeading.current) return
    focusHeading.current = false
    const heading = panels.current[step]?.querySelector<HTMLElement>("h2, h3")
    if (!heading) return
    if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1")
    heading.focus()
  }, [step])
  const panel = (item: EditorStep) => ({ id: `${id}-${item}`, hidden: step !== item })
  return <div className="mp-page">
    <div className="flex flex-wrap items-center gap-3"><h2 className="mp-subtitle">{shop.name ?? t("list.untitled")}</h2><span className="rounded-[var(--ui2-badge-radius)] bg-muted px-3 py-1 text-sm">{t(`states.${shop.storefront.state}`)}</span></div>
    <nav aria-label={t("editor.steps")} className="overflow-x-auto"><ol className="flex w-max min-w-full gap-2">{EDITOR_STEPS.map((item, index) => <li key={item} className="flex-1"><Button type="button" variant={step === item ? "primary" : "outline"} className="w-full aria-[current=step]:bg-[var(--esp-tab-active-bg)] aria-[current=step]:text-[color:var(--esp-tab-active-fg)] aria-[current=step]:hover:bg-[var(--esp-tab-active-bg)]" aria-current={step === item ? "step" : undefined} aria-controls={`${id}-${item}`} onClick={() => goTo(item, false)}>{index + 1}. {t(`steps.${item}`)}</Button></li>)}</ol></nav>
    <Card><div {...panel("activity")} ref={node => { panels.current.activity = node }}><ShopActivityForm shop={shop} onDirty={setActivityDirty} onNext={() => goTo("presentation", true)} /></div><div {...panel("presentation")} ref={node => { panels.current.presentation = node }}><ShopPresentationForm shop={shop} onDirty={setPresentationDirty} /></div><div {...panel("offers")} ref={node => { panels.current.offers = node }}><ShopOffers shop={shop} dirty={dirty} onPrepare={() => goTo("presentation", true)} /></div><div {...panel("publish")} ref={node => { panels.current.publish = node }}><ShopPublicationForm shop={shop} dirty={presentationDirty || activityDirty} onDirty={setAudienceDirty} onPrepare={() => goTo("presentation", true)} /></div></Card>
    <p role="status" className="sr-only">{stepAnnouncement}</p>
    {dirty ? <p role="status" className="text-sm text-muted-foreground">{t("editor.unsaved")}</p> : null}
    <ContactTeamPanel shopId={shop.shopId} />
  </div>
}

function ShopOffers({ shop, dirty, onPrepare }: { shop: ShopEditorData; dirty: boolean; onPrepare: () => void }) {
  const { t } = useTranslation("shops")
  const configuration = effectiveActivityConfiguration(shop.activityConfiguration, shop.model)
  return <section className="grid gap-4"><h2 className="mp-subtitle">{t("steps.offers")}</h2>{configuration.capabilities.includes("products") ? <p>{t("offers.products")}</p> : null}{configuration.capabilities.includes("services") ? <p>{t("offers.services")}</p> : null}<p className="text-sm text-muted-foreground">{t("offers.authority")}</p><ShopImageGuide products /><ShopCommerceLink shopId={shop.shopId} dirty={dirty} /><CatalogReconcilePanel shopId={shop.shopId} dirty={dirty} /><CatalogCategoryNotice shopId={shop.shopId} />{configuration.capabilities.some(capability => capability === "products" || capability === "services") ? <MerchantPaymentPreparationPanel shopId={shop.shopId} dirty={dirty} /> : null}{configuration.capabilities.includes("services") ? <ProviderPreparationPanel shopId={shop.shopId} dirty={dirty} /> : null}{shop.page ? <CatalogPostLinker shopId={shop.shopId} handle={shop.page.handle} dirty={dirty} /> : null}{shop.page && configuration.template === "food" ? <DailySpecialPanel shopId={shop.shopId} handle={shop.page.handle} special={shop.dailySpecial} dirty={dirty} /> : null}<ul className="grid gap-2">{shop.blocks.map((block) => <li key={block.id} className="rounded-[var(--ui2-card-radius)] border border-border p-4"><span className="font-medium">{t(`blocks.${block.id}`)}</span><p className="text-sm text-muted-foreground">{t(`blockStates.${block.state}`)}</p></li>)}</ul><p>{t("offers.checkoutTitle")}</p><ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">{shop.checkout.missing.map((missing) => <li key={missing}>{t(`checkout.${missing}`)}</li>)}</ol><Button type="button" variant="outline" onClick={onPrepare} className="w-full sm:w-auto sm:justify-self-start">{t("publication.prepare")}</Button></section>
}
