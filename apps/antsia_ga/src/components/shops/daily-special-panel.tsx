"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import type { DailySpecial } from "@antsia/social-domain/dailySpecial"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import { useId, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { Button } from "@/components/shared/controls"
import { useTodaysSpecialRef } from "./daily-special"
import { DailySpecialStoryShare } from "./daily-special-story-share"
import { SHOP_SELECT_CLASS, useShopAction } from "./shop-ui"

/** Les produits du menu, lus par fenêtres de dix comme la liaison des publications. */
const MENU_WINDOW = 10

/**
 * Le plat du jour dans l'éditeur (SU06, gabarit « Alimentation et restauration ») : un produit du menu, annoncé
 * aujourd'hui sur la vitrine et dans l'univers, jusqu'à minuit (Libreville). Le menu vient de la liaison PRO.GA ;
 * le serveur relit l'offre et le droit de gérer à chaque désignation.
 */
export function DailySpecialPanel({ shopId, handle, special, dirty }: { shopId: Id<"shops">; handle: string; special: DailySpecial | null; dirty: boolean }) {
  const { networkId, personId } = useNetwork()
  return <DailySpecialWindows key={JSON.stringify([networkId, personId, shopId, handle])} shopId={shopId} handle={handle} special={special} dirty={dirty} />
}

function DailySpecialWindows({ shopId, handle, special, dirty }: { shopId: Id<"shops">; handle: string; special: DailySpecial | null; dirty: boolean }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("shops")
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const current = useTodaysSpecialRef(special)
  const offers = useAuthenticatedConvexQuery(api.modules.shops.catalog.list, { networkId, handle, kind: "product", paginationOpts: { cursor: cursors.at(-1) ?? null, numItems: MENU_WINDOW } })
  const page = offers.data?.page ?? []
  return <section className="grid gap-4 rounded-xl border border-border bg-background p-4" data-daily-special-panel>
    <h3 className="font-semibold">{t("dailySpecial.title")}</h3>
    <p className="text-sm text-muted-foreground">{t("dailySpecial.lead")}</p>
    {current && special ? <DailySpecialCurrent key={JSON.stringify([current, special.day])} shopId={shopId} handle={handle} offerRef={current} day={special.day} dirty={dirty} /> : <p className="text-sm">{t("dailySpecial.none")}</p>}
    {offers.isError ? <p role="alert" className="text-sm text-muted-foreground">{t("catalog.unavailable")}</p>
      : offers.isPending || !offers.data ? <p role="status" className="text-sm text-muted-foreground">{t("catalog.loading")}</p>
      : page.length === 0 && cursors.length === 1 ? <p className="text-sm text-muted-foreground">{t("dailySpecial.emptyMenu")}</p>
      : <>
        {/* Remonté quand la fenêtre du menu change, pas quand le plat change : la confirmation reste lisible. */}
        <DailySpecialForm key={JSON.stringify(page.map(offer => [offer.offerRef, offer.revision]))} shopId={shopId} dirty={dirty} offers={page.map(offer => ({ offerRef: offer.offerRef, title: offer.title }))} current={current} />
        {cursors.length > 1 || (!offers.data.isDone && offers.data.continueCursor) ? <nav aria-label={t("dailySpecial.pages")} className="flex flex-wrap gap-2">
          {cursors.length > 1 ? <Button type="button" variant="outline" onClick={() => setCursors(previous => previous.slice(0, -1))}>{t("dailySpecial.previous")}</Button> : null}
          {!offers.data.isDone && offers.data.continueCursor ? <Button type="button" variant="outline" onClick={() => { const next = offers.data?.continueCursor; if (next) setCursors(previous => [...previous, next]) }}>{t("dailySpecial.next")}</Button> : null}
        </nav> : null}
      </>}
  </section>
}

/** Le plat annoncé aujourd'hui, par son nom tel que le menu le donne. */
function DailySpecialCurrent({ shopId, handle, offerRef, day, dirty }: { shopId: Id<"shops">; handle: string; offerRef: string; day: string; dirty: boolean }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("shops")
  const query = useAuthenticatedConvexQuery(api.modules.shops.catalog.offer, { networkId, handle, offerRef })
  if (query.isPending) return <p role="status" className="text-sm text-muted-foreground">{t("catalog.loading")}</p>
  const title = query.isError ? null : query.data?.title ?? null
  const available = !query.isError && query.data?.kind === "product" && query.data.media.some(media => media.url !== null && media.withheld === null)
  return <div className="grid gap-3"><p className="text-sm font-medium">{title ? t("dailySpecial.current", { title }) : t("dailySpecial.currentUnavailable")}</p><DailySpecialStoryShare key={available ? "ready" : "unavailable"} shopId={shopId} offerRef={offerRef} day={day} title={title} available={available} dirty={dirty} /></div>
}

function DailySpecialForm({ shopId, dirty, offers, current }: { shopId: Id<"shops">; dirty: boolean; offers: { offerRef: string; title: string }[]; current: string | null }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("shops")
  const action = useShopAction()
  const mutation = useMutation(api.modules.shops.shops.setDailySpecial)
  const id = useId()
  const [saved, setSaved] = useState<"saved" | "cleared" | null>(null)
  const schema = z.object({ offerRef: z.string().min(1, t("dailySpecial.choose")) })
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { offerRef: current && offers.some(offer => offer.offerRef === current) ? current : "" } })
  const error = form.formState.errors.offerRef?.message
  const clear = () => {
    if (dirty) return
    void action.run(() => mutation({ networkId, shopId, offerRef: null }), () => { setSaved("cleared"); form.reset({ offerRef: "" }) })
  }
  return <form className="grid gap-4" onChange={() => setSaved(null)} onSubmit={form.handleSubmit(async (values) => {
    if (dirty) return
    if (!offers.some(offer => offer.offerRef === values.offerRef)) { action.setError(t("catalog.post.selectionChanged")); return }
    await action.run(() => mutation({ networkId, shopId, offerRef: values.offerRef }), () => setSaved("saved"))
  })}>
    <fieldset disabled={dirty || action.pending} className="grid gap-4">
      <div className="grid gap-2">
        <label htmlFor={`${id}-offer`} className="text-sm font-medium">{t("dailySpecial.label")}</label>
        <select id={`${id}-offer`} {...form.register("offerRef")} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} className={SHOP_SELECT_CLASS}>
          <option value="">{t("dailySpecial.choose")}</option>
          {offers.map(offer => <option key={offer.offerRef} value={offer.offerRef}>{offer.title}</option>)}
        </select>
        {error ? <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="commerce" pending={action.pending}>{t("dailySpecial.set")}</Button>
        {current ? <Button type="button" variant="outline" onClick={clear}>{t("dailySpecial.clear")}</Button> : null}
      </div>
    </fieldset>
    {dirty ? <p className="text-sm text-muted-foreground">{t("link.saveFirst")}</p> : null}
    {saved ? <p role="status">{t(saved === "saved" ? "dailySpecial.saved" : "dailySpecial.cleared")}</p> : null}
    {action.error ? <p role="alert" className="text-sm text-destructive">{action.error}</p> : null}
  </form>
}
