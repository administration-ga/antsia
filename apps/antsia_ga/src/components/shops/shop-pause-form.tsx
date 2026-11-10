"use client"

import { api } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import { checkShopPauseDay, isShopPaused, SHOP_PAUSE_MAX_DAYS, shopPauseDayBounds, shopPauseReopenDay, shopPauseReopensAt } from "@antsia/social-domain/commerce/shopPause"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import type { TFunction } from "i18next"
import { useId, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { useCheckoutClock } from "@/components/checkout/use-checkout-clock"
import { Button, Field, TextInput } from "@/components/shared/controls"
import type { ShopEditorData } from "./shop-model"
import { useShopAction } from "./shop-ui"

/**
 * Le jour de réouverture, jugé comme le serveur le jugera (règle pure partagée) : requis, au plus tôt demain, au
 * plus tard dans `SHOP_PAUSE_MAX_DAYS` jours, jours civils de Libreville. Les phrases des bornes sont celles des
 * règles du domaine (`rules:SHOP_PAUSE_*`), une seule source de texte.
 */
export function shopPauseSchema(t: TFunction, now: () => number) {
  return z.object({ reopenDay: z.string() }).superRefine((value, context) => {
    const check = value.reopenDay ? checkShopPauseDay(value.reopenDay, now()) : null
    if (check?.ok) return
    const message = check?.reason === "past" ? t("rules:SHOP_PAUSE_END_PAST") : check?.reason === "too_long" ? t("rules:SHOP_PAUSE_TOO_LONG", { days: SHOP_PAUSE_MAX_DAYS }) : t("pause.required")
    context.addIssue({ code: "custom", path: ["reopenDay"], message })
  })
}
type PauseValues = z.infer<ReturnType<typeof shopPauseSchema>>

/**
 * CM-10 — « Fermer temporairement jusqu'au… », à l'étape Publier d'une vitrine PUBLIÉE : la date de réouverture,
 * sa confirmation, et « Rouvrir maintenant » tant que la pause court. Le serveur rejuge droits et bornes ; l'état
 * affiché suit l'échéance stockée, jugée à l'horloge de l'écran (elle se réveille à l'échéance : la boutique
 * rouvre seule, le formulaire le montre sans recharger). Aucun motif libre : la phrase des bandeaux est fixe.
 */
export function ShopPauseForm({ shop }: { shop: ShopEditorData }) {
  const { t } = useTranslation("shops")
  const { networkId } = useNetwork()
  const id = useId()
  const action = useShopAction()
  const pause = useMutation(api.modules.shops.shops.pauseStorefront)
  const resume = useMutation(api.modules.shops.shops.resumeStorefront)
  const [notice, setNotice] = useState<string | null>(null)
  const clock = useCheckoutClock(shop.pausedUntil)
  const pausedUntil = isShopPaused(shop.pausedUntil, clock) ? shop.pausedUntil : null
  const bounds = shopPauseDayBounds(clock)
  const form = useForm<PauseValues>({ resolver: zodResolver(shopPauseSchema(t, () => Date.now())), defaultValues: { reopenDay: pausedUntil === null ? "" : shopPauseReopenDay(pausedUntil) } })
  const error = form.formState.errors.reopenDay?.message
  const submit = form.handleSubmit(async ({ reopenDay }) => {
    setNotice(null)
    const until = shopPauseReopensAt(reopenDay)
    if (until === null || !window.confirm(t("pause.closeConfirm", { until }))) return
    await action.run(() => pause({ networkId, shopId: shop.shopId, reopenDay }), () => { form.reset({ reopenDay }); setNotice(t("pause.saved")) })
  })
  const reopen = () => {
    setNotice(null)
    if (!window.confirm(t("pause.reopenConfirm"))) return
    void action.run(() => resume({ networkId, shopId: shop.shopId }), () => { form.reset({ reopenDay: "" }); setNotice(t("pause.reopened")) })
  }
  return <section className="grid min-w-0 gap-4 rounded-[var(--ui2-card-radius)] border border-border p-4" aria-labelledby={`${id}-title`} data-shop-pause-editor>
    <h3 id={`${id}-title`} className="font-display text-base font-bold leading-snug">{t("pause.editorTitle")}</h3>
    <p className="text-sm text-muted-foreground">{t("pause.editorLead")}</p>
    {pausedUntil !== null ? <p className="font-medium">{t("pause.closedNow", { until: pausedUntil })}</p> : null}
    <form noValidate onSubmit={submit} className="grid min-w-0 gap-4">
      <Field id={`${id}-day`} label={t("pause.reopenDay")} hint={t("pause.reopenHint", { days: SHOP_PAUSE_MAX_DAYS })} error={error}>
        <TextInput id={`${id}-day`} type="date" min={bounds.min} max={bounds.max} disabled={action.pending} aria-invalid={!!error} aria-describedby={error ? `${id}-day-hint ${id}-day-error` : `${id}-day-hint`} {...form.register("reopenDay")} />
      </Field>
      <Button type="submit" variant="outline" pending={action.pending} className="w-full sm:w-auto sm:justify-self-start">{t(pausedUntil === null ? "pause.close" : "pause.change")}</Button>
    </form>
    {pausedUntil !== null ? <Button type="button" variant="outline" pending={action.pending} onClick={reopen} className="w-full sm:w-auto sm:justify-self-start">{t("pause.reopenNow")}</Button> : null}
    {action.error ? <p role="alert" className="text-sm text-destructive">{action.error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </section>
}
