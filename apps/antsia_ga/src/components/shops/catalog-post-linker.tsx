"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import { useId, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { Button } from "@/components/shared/controls"
import { SHOP_SELECT_CLASS, useShopAction } from "./shop-ui"

export function CatalogPostLinker({ shopId, handle, dirty }: { shopId: Id<"shops">; handle: string; dirty: boolean }) {
  const { networkId, personId } = useNetwork()
  return <LinkerWindows key={JSON.stringify([networkId, personId, shopId, handle])} shopId={shopId} handle={handle} dirty={dirty} />
}
function LinkerWindows({ shopId, handle, dirty }: { shopId: Id<"shops">; handle: string; dirty: boolean }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("shops")
  const [offerCursors, setOfferCursors] = useState<(string | null)[]>([null])
  const [postCursors, setPostCursors] = useState<(string | null)[]>([null])
  const offers = useAuthenticatedConvexQuery(api.modules.shops.catalog.list, { networkId, handle, paginationOpts: { cursor: offerCursors.at(-1) ?? null, numItems: 10 } })
  const posts = useAuthenticatedConvexQuery(api.modules.shops.catalogPosts.eligiblePosts, { networkId, shopId, paginationOpts: { cursor: postCursors.at(-1) ?? null, numItems: 10 } })
  return <section className="grid gap-4 rounded-[var(--ui2-card-radius)] border border-[color:var(--esp-surface-border)] bg-background p-[var(--esp-card-padding,16px)]"><h3 className="font-display text-base font-bold leading-snug">{t("catalog.post.title")}</h3><p className="text-sm text-muted-foreground">{t("catalog.post.lead")}</p>{offers.isError || posts.isError ? <p role="alert" className="text-sm text-muted-foreground">{t("catalog.unavailable")}</p> : offers.isPending || posts.isPending || !offers.data || !posts.data ? <p role="status">{t("catalog.loading")}</p> : <>
    <PostAssociationForm key={JSON.stringify([offers.data.page.map((offer) => [offer.offerRef, offer.revision]), posts.data.page.map((post) => [post.postId, post.offerRef])])} shopId={shopId} dirty={dirty} offers={offers.data.page.map((offer) => ({ offerRef: offer.offerRef, title: offer.title }))} posts={posts.data.page} />
    <div className="grid gap-3 text-sm"><p>{t("catalog.post.window")}</p><nav aria-label={t("catalog.post.offerPages")} className="flex flex-wrap gap-2">{offerCursors.length > 1 ? <Button type="button" variant="outline" onClick={() => setOfferCursors((current) => current.slice(0, -1))}>{t("catalog.post.previousOffers")}</Button> : null}{!offers.data.isDone && offers.data.continueCursor ? <Button type="button" variant="outline" onClick={() => setOfferCursors((current) => [...current, offers.data!.continueCursor])}>{t("catalog.post.nextOffers")}</Button> : null}</nav><nav aria-label={t("catalog.post.postPages")} className="flex flex-wrap gap-2">{postCursors.length > 1 ? <Button type="button" variant="outline" onClick={() => setPostCursors((current) => current.slice(0, -1))}>{t("catalog.post.previousPosts")}</Button> : null}{!posts.data.isDone && posts.data.continueCursor ? <Button type="button" variant="outline" onClick={() => setPostCursors((current) => [...current, posts.data!.continueCursor])}>{t("catalog.post.nextPosts")}</Button> : null}</nav></div>
  </>}</section>
}
function PostAssociationForm({ shopId, dirty, offers, posts }: { shopId: Id<"shops">; dirty: boolean; offers: { offerRef: string; title: string }[]; posts: { postId: Id<"posts">; body: string; publishedAt: number; offerRef: string | null }[] }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("shops")
  const action = useShopAction()
  const mutation = useMutation(api.modules.shops.catalogPosts.setPostOffer)
  const id = useId()
  const [saved, setSaved] = useState(false)
  const schema = z.object({ offerRef: z.string().min(1, t("catalog.post.chooseOffer")), postId: z.string().min(1, t("catalog.post.choosePost")) })
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { offerRef: "", postId: "" } })
  if (!posts.length) return <p role="status" className="text-sm text-muted-foreground">{t("catalog.post.noPosts")}</p>
  return <form className="antsia-form-grid" onChange={() => setSaved(false)} onSubmit={form.handleSubmit(async (values) => {
    if (dirty) return
    const post = posts.find((item) => item.postId === values.postId)
    const offer = offers.find((item) => item.offerRef === values.offerRef)
    if (!post || !offer) { action.setError(t("catalog.post.selectionChanged")); return }
    await action.run(() => mutation({ networkId, shopId, postId: post.postId, offerRef: offer.offerRef }), () => { setSaved(true); form.reset() })
  })}><fieldset disabled={dirty || action.pending} className="grid gap-4"><div className="grid gap-2"><label htmlFor={`${id}-post`} className="text-sm font-medium">{t("catalog.post.publication")}</label><select id={`${id}-post`} {...form.register("postId")} className={SHOP_SELECT_CLASS}><option value="">{t("catalog.post.choosePost")}</option>{posts.map((post) => <option key={post.postId} value={post.postId}>{post.body.trim().slice(0, 160) || t("catalog.post.mediaPost")}{post.offerRef ? ` · ${t("catalog.post.associated")}` : ""}</option>)}</select>{form.formState.errors.postId ? <p role="alert" className="text-sm text-destructive">{form.formState.errors.postId.message}</p> : null}</div><div className="grid gap-2"><label htmlFor={`${id}-offer`} className="text-sm font-medium">{t("catalog.post.offer")}</label><select id={`${id}-offer`} {...form.register("offerRef")} className={SHOP_SELECT_CLASS}><option value="">{t("catalog.post.chooseOffer")}</option>{offers.map((offer) => <option key={offer.offerRef} value={offer.offerRef}>{offer.title}</option>)}</select>{!offers.length ? <p className="text-sm text-muted-foreground">{t("catalog.post.noOffers")}</p> : null}{form.formState.errors.offerRef ? <p role="alert" className="text-sm text-destructive">{form.formState.errors.offerRef.message}</p> : null}</div></fieldset><div className="flex flex-wrap gap-2"><Button type="submit" pending={action.pending} disabled={dirty || !offers.length}>{t("catalog.post.attach")}</Button><Button type="button" variant="outline" pending={action.pending} disabled={dirty || !form.watch("postId")} onClick={() => {
    if (dirty) return
    const post = posts.find((item) => item.postId === form.getValues("postId"))
    if (!post || !post.offerRef) { action.setError(t("catalog.post.nothingToRemove")); return }
    void action.run(() => mutation({ networkId, shopId, postId: post.postId, offerRef: null }), () => { setSaved(true); form.reset() })
  }}>{t("catalog.post.detach")}</Button></div>{dirty ? <p className="text-sm text-muted-foreground">{t("link.saveFirst")}</p> : null}{saved ? <p role="status">{t("catalog.post.saved")}</p> : null}{action.error ? <p role="alert" className="text-sm text-destructive">{action.error}</p> : null}</form>
}
