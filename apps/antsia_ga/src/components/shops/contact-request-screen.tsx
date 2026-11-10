"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { COMMERCIAL_TEXT_MAX, commercialText } from "@antsia/social-domain/commercialContact"
import { useConversationSend } from "@antsia/social-features/features/messagerie/use-conversation-send"
import { zodResolver } from "@hookform/resolvers/zod"
import { useConvexAuth, useMutation } from "convex/react"
import { useRouter } from "next/navigation"
import { useId, useLayoutEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { Button, Card, Field, TextArea } from "@/components/shared/controls"
import { routes } from "@/lib/routes"
import { ShopFrame, ShopLink, ShopQueryFailure, useShopAction, useShopDirtyGuard } from "./shop-ui"
import { useCartConnectivity } from "@/components/cart/use-cart-draft"
import { contactRequestSurface } from "./contact-request-model"

const requestSchema = z.object({ text: z.string().trim().min(1).max(COMMERCIAL_TEXT_MAX).refine((value) => commercialText(value) !== null) })
export function ContactRequestScreen({ handle, offerRef }: { handle: string; offerRef?: string }) {
  const { networkId, personId } = useNetwork()
  return <ContactRequest key={JSON.stringify([networkId, personId, handle, offerRef])} handle={handle} offerRef={offerRef} />
}
function ContactRequest({ handle, offerRef }: { handle: string; offerRef?: string }) {
  const { t } = useTranslation("shops")
  const { t: ux } = useTranslation("commerceExperience")
  const { networkId, personId } = useNetwork()
  const { isAuthenticated } = useConvexAuth()
  const router = useRouter()
  const shop = useAuthenticatedConvexQuery(api.modules.shops.shops.storefront, { networkId, handle })
  const offer = useAuthenticatedConvexQuery(api.modules.shops.catalog.offer, offerRef ? { networkId, handle, offerRef } : "skip")
  const existing = useAuthenticatedConvexQuery(api.modules.commercialMessaging.threads.findMyThread, { networkId, shopHandle: handle, ...(offerRef ? { offerRef } : {}) })
  const request = useMutation(api.modules.commercialMessaging.threads.requestContact)
  const action = useShopAction()
  const sender = useConversationSend(JSON.stringify([networkId, personId]), JSON.stringify(["commerce-request", handle, offerRef ?? null]), isAuthenticated)
  const form = useForm<z.infer<typeof requestSchema>>({ resolver: zodResolver(requestSchema), defaultValues: { text: "" } })
  const id = useId()
  const connectivity = useCartConnectivity()
  const generation = useRef(connectivity.generation)
  useLayoutEffect(() => { generation.current = connectivity.generation }, [connectivity.generation])
  const [reviewedGeneration, setReviewedGeneration] = useState(0)
  const [frozenText, setFrozenText] = useState<string | null>(null)
  const [uncertain, setUncertain] = useState(false)
  const [lookedUp, setLookedUp] = useState(false)
  const [admitted, setAdmitted] = useState(false)
  const admittedRef = useRef(false)
  const reviewRequired = reviewedGeneration !== connectivity.generation
  useShopDirtyGuard(form.formState.isDirty && !action.pending)
  const surface = contactRequestSurface({ shop, offer, existing, offerScoped: !!offerRef })
  const refresh = () => {
    if (!navigator.onLine || !sender.isCurrent()) return
    const expectedGeneration = generation.current
    void action.run(async () => {
      const [freshShop, freshExisting, freshOffer] = await Promise.all([shop.refetch(), existing.refetch(), offerRef ? offer.refetch() : Promise.resolve(null)])
      return contactRequestSurface({ shop: freshShop, existing: freshExisting, offer: freshOffer ?? { data: undefined, isError: false }, offerScoped: !!offerRef })
    }, (next) => {
      if (!sender.isCurrent() || !navigator.onLine || generation.current !== expectedGeneration) return
      if (next === "request" || next === "existing") setReviewedGeneration(expectedGeneration)
      setLookedUp(next === "request")
    })
  }
  const submitRequest = async (values: z.infer<typeof requestSchema>) => {
    if (!navigator.onLine || !connectivity.online || reviewRequired || surface !== "request" || admittedRef.current || uncertain && !lookedUp || !sender.isCurrent()) return
    const text = frozenText ?? values.text
    setFrozenText(text)
    setLookedUp(false)
    const result = await action.run(() => sender.perform({ text, attachments: [], replyTo: null }, (idempotencyKey) => request({ networkId, shopHandle: handle, ...(offerRef ? { offerRef } : {}), text, idempotencyKey })), (result) => {
      if (!sender.isCurrent()) return
      admittedRef.current = true
      setAdmitted(true)
      form.reset({ text: "" })
      router.replace(routes.commercialConversation(result.threadId))
    })
    if (result === undefined && sender.isCurrent()) setUncertain(true)
  }
  return <ShopFrame title={t("contact.ask")} lead={t("contact.request.lead")}><ShopLink href={offerRef ? routes.shopOffer(handle, offerRef) : routes.storefront(handle)}>{t("common.back")}</ShopLink>{surface === "existing" && existing.data ? <Card><div className="grid gap-3"><p>{t("contact.request.existing")}</p><p className="text-sm text-muted-foreground">{ux("contact.existingState", { state: t(`contact.states.${existing.data.state}`) })}</p><ShopLink variant="message" href={routes.commercialConversation(existing.data.threadId)}>{t("contact.request.openExisting")}</ShopLink></div></Card> : surface === "unavailable" ? <ShopQueryFailure href={routes.storefront(handle)} retry={refresh} /> : surface === "loading" ? <p role="status">{t("common.loading")}</p> : <Card><form noValidate className="grid min-w-0 gap-4 [overflow-wrap:anywhere]" onSubmit={(event) => { void form.handleSubmit(submitRequest)(event) }}>
    <h2 className="text-lg font-semibold">{shop.data?.name}</h2>{offer.data ? <p className="text-sm">{t("contact.offerContext", { title: offer.data.title })}</p> : null}
    <p className="text-sm text-muted-foreground">{t("contact.request.explanation")}</p>
    <Field id={id} label={t("contact.request.text")} hint={t("contact.request.hint")} error={form.formState.errors.text ? t("contact.validation.message") : undefined}><TextArea id={id} maxLength={COMMERCIAL_TEXT_MAX} disabled={action.pending} readOnly={frozenText !== null} aria-invalid={!!form.formState.errors.text} aria-describedby={`${id}-hint${form.formState.errors.text ? ` ${id}-error` : ""}`} {...form.register("text")} /></Field>
    {!connectivity.online ? <p role="status" className="text-sm text-muted-foreground">{ux("contact.offline")}</p> : reviewRequired ? <p role="status" className="text-sm text-muted-foreground">{ux("contact.review")}</p> : null}
    {uncertain ? <p role="status" className="text-sm text-muted-foreground">{ux("contact.uncertain")}</p> : null}
    {reviewRequired || uncertain ? <Button type="button" variant="outline" className="min-[768px]:justify-self-start" pending={action.pending} disabled={!connectivity.online || admitted} onClick={refresh}>{ux("contact.refresh")}</Button> : null}
    {action.error ? <p role="alert" className="text-sm text-destructive">{action.error}</p> : null}
    <Button type="submit" variant="send" pending={action.pending} disabled={!connectivity.online || reviewRequired || admitted || uncertain && !lookedUp} className="justify-self-start">{uncertain ? ux("contact.retrySame") : t("contact.request.send")}</Button>
  </form></Card>}</ShopFrame>
}
