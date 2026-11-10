"use client"

import { editorialHttpsLink, EDITORIAL_BLOCKS_MAX, EDITORIAL_IMAGES_MAX, type EditorialSection } from "@antsia/social-domain/editorial"
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { useFieldArray, useWatch, type FieldPath, type UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { MemberPage } from "@/components/member-chrome"
import { useCartConnectivity } from "@/components/cart/use-cart-draft"
import { Button, Card, Field, TextArea, TextInput } from "@/components/shared/controls"
import { SCREEN_SUBMIT } from "@/components/shared/screen-layout"
import { SHOP_SELECT_CLASS, ShopLink, useShopAction } from "@/components/shops/shop-ui"
import { editorialErrorKey, newEditorialBlock, type EditorialDraftValues } from "@/lib/editorial-form"
import { routes } from "@/lib/routes"

export type EditorialAssetView = { assetId: string; url: string | null; withheld: string | null; altText: string; credit: string }
export type EditorialBylineChoice = { grantId: string; label: string }

/** Le démontage ou un changement de connexion invalide le retour d'un geste ancien. Aucun renvoi automatique. */
export function useEditorialOperation() {
  const action = useShopAction()
  const connectivity = useCartConnectivity()
  const generation = useRef(connectivity.generation)
  useEffect(() => { generation.current = connectivity.generation }, [connectivity.generation])
  const [failure, setFailure] = useState<string | null>(null)
  const [reviewedGeneration, setReviewedGeneration] = useState(connectivity.generation)
  const run = async <T,>(operation: () => Promise<T>): Promise<T | undefined> => {
    if (!connectivity.online || !navigator.onLine || action.pending) return undefined
    const started = generation.current
    setFailure(null)
    const result = await action.run(async () => { try { return { ok: true as const, value: await operation() } } catch (error) { return { ok: false as const, key: editorialErrorKey(error) } } })
    if (!result || !action.current() || started !== generation.current) return undefined
    if (!result.ok) { setFailure(result.key); return undefined }
    return result.value
  }
  return { ...connectivity, pending: action.pending, failure: failure ?? (action.error ? "errors.unavailable" : null), needsReview: reviewedGeneration !== connectivity.generation || failure !== null,
    run, current: (stamp = generation.current) => action.current() && stamp === generation.current && navigator.onLine,
    markReviewed: () => { setReviewedGeneration(generation.current); setFailure(null) } }
}

export function EditorialOperationStatus({ operation }: { operation: ReturnType<typeof useEditorialOperation> }) {
  const { t } = useTranslation("editorial")
  return <>{!operation.online ? <p role="status">{t("status.offline")}</p> : operation.needsReview ? <p role="status">{t("status.reviewRequired")}</p> : null}{operation.failure ? <p role="alert" className="text-sm text-destructive">{t(operation.failure)}</p> : null}</>
}

/** Le bureau, la configuration, l'équipe et l'éditeur d'article occupent toute la colonne de l'espace (`shared/screen-layout`). */
export function EditorialFrame({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return <MemberPage><div className={`mp-page mp-copy grid w-full min-w-0 gap-5 pb-24 [overflow-wrap:anywhere] ${SCREEN_SUBMIT}`}><header className="mp-page-header"><h1 className="mp-title">{title}</h1>{lead ? <p className="text-muted-foreground">{lead}</p> : null}</header>{children}</div></MemberPage>
}
export function EditorialLinks({ pageId, handle, canConfigure = false, canManageGrants = false }: { pageId?: string; handle?: string; canConfigure?: boolean; canManageGrants?: boolean }) {
  const { t } = useTranslation("editorial")
  return <nav aria-label={t("home.title")} className="flex flex-wrap gap-2"><ShopLink href={routes.mediaHome()}>{t("actions.home")}</ShopLink>{pageId ? <ShopLink href={routes.mediaDesk(pageId)}>{t("actions.desk")}</ShopLink> : null}{pageId && canConfigure ? <ShopLink href={routes.mediaConfig(pageId)}>{t("actions.config")}</ShopLink> : null}{pageId && canManageGrants ? <ShopLink href={routes.mediaTeam(pageId)}>{t("actions.team")}</ShopLink> : null}{handle ? <ShopLink href={routes.memberMedia(handle)}>{t("actions.read")}</ShopLink> : null}</nav>
}
export function EditorialUnavailable({ retry }: { retry?: () => void }) {
  const { t } = useTranslation("editorial")
  return <div className="grid gap-3"><p role="alert">{t("status.unavailable")}</p>{retry ? <Button type="button" variant="outline" onClick={retry}>{t("actions.retry")}</Button> : null}</div>
}

/** Champs structurés : aucun code HTML, Markdown libre, embed ou identifiant d'image saisi à la main. */
export function EditorialArticleFields({ form, sections, bylines, assets, disabled = false }: {
  form: UseFormReturn<EditorialDraftValues>; sections: EditorialSection[]; bylines: EditorialBylineChoice[]; assets: EditorialAssetView[]; disabled?: boolean;
}) {
  const { t } = useTranslation("editorial")
  const id = useId()
  const array = useFieldArray({ control: form.control, name: "blocks" })
  const blocks = useWatch({ control: form.control, name: "blocks" })
  const byline = useWatch({ control: form.control, name: "byline" })
  const sectionKey = useWatch({ control: form.control, name: "sectionKey" })
  const [type, setType] = useState<"paragraph" | "heading" | "list" | "link" | "image">("paragraph")
  const imageCount = blocks.filter(block => block.type === "image").length
  const error = (path: FieldPath<EditorialDraftValues>) => form.getFieldState(path, form.formState).error?.message
  return <fieldset disabled={disabled} className="grid min-w-0 gap-4">
    <Field id={`${id}-headline`} label={t("article.headline")} error={error("title")}><TextInput id={`${id}-headline`} maxLength={180} aria-invalid={!!error("title")} {...form.register("title")} /></Field>
    <Field id={`${id}-chapeau`} label={t("article.chapeau")} error={error("chapeau")}><TextArea id={`${id}-chapeau`} maxLength={500} aria-invalid={!!error("chapeau")} {...form.register("chapeau")} /></Field>
    <div className="grid min-w-0 gap-4 sm:grid-cols-2"><Field id={`${id}-section`} label={t("article.section")} error={error("sectionKey")}><select id={`${id}-section`} className={SHOP_SELECT_CLASS} {...form.register("sectionKey")}><option value="">{t("article.noSection")}</option>{sectionKey && !sections.some(section => section.key === sectionKey) ? <option value={sectionKey}>{t("article.sectionToReview")}</option> : null}{sections.map(section => <option key={section.key} value={section.key}>{section.label}</option>)}</select></Field><Field id={`${id}-byline`} label={t("article.byline")} error={error("byline")}><select id={`${id}-byline`} className={SHOP_SELECT_CLASS} {...form.register("byline")}><option value="media">{t("article.mediaByline")}</option>{byline !== "media" && !bylines.some(choice => choice.grantId === byline) ? <option value={byline}>{t("article.bylineToReview")}</option> : null}{bylines.map(choice => <option key={choice.grantId} value={choice.grantId}>{choice.label}</option>)}</select></Field></div>
    <Field id={`${id}-correction`} label={t("article.correction")} hint={t("article.correctionHint")} error={error("correctionNotice")}><TextArea id={`${id}-correction`} maxLength={1000} aria-describedby={`${id}-correction-hint`} aria-invalid={!!error("correctionNotice")} {...form.register("correctionNotice")} /></Field>
    <fieldset className="grid min-w-0 gap-4"><legend className="mp-subtitle">{t("article.body")}</legend><p className="text-sm text-muted-foreground">{t("article.bodyHint")}</p>{array.fields.map((entry, index) => {
      const block = blocks[index]
      if (!block) return null
      return <Card key={entry.id}><div className="grid min-w-0 gap-3"><header className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{t("blocks.number", { number: index + 1, type: t(`blocks.${block.type}`) })}</h3><div className="flex flex-wrap gap-1"><Button type="button" variant="ghost" disabled={index === 0} aria-label={t("blocks.moveUp", { number: index + 1 })} onClick={() => array.move(index, index - 1)}><ArrowUp aria-hidden="true" className="size-4" /></Button><Button type="button" variant="ghost" disabled={index === blocks.length - 1} aria-label={t("blocks.moveDown", { number: index + 1 })} onClick={() => array.move(index, index + 1)}><ArrowDown aria-hidden="true" className="size-4" /></Button><Button type="button" variant="ghost" aria-label={t("blocks.remove", { number: index + 1 })} onClick={() => array.remove(index)}><Trash2 aria-hidden="true" className="size-4" /></Button></div></header>
        {block.type === "paragraph" || block.type === "heading" ? <><Field id={`${id}-block-${index}-text`} label={t("blocks.text", { number: index + 1 })} error={error(`blocks.${index}.text`)}>{block.type === "paragraph" ? <TextArea id={`${id}-block-${index}-text`} maxLength={4000} aria-invalid={!!error(`blocks.${index}.text`)} {...form.register(`blocks.${index}.text`)} /> : <TextInput id={`${id}-block-${index}-text`} maxLength={180} aria-invalid={!!error(`blocks.${index}.text`)} {...form.register(`blocks.${index}.text`)} />}</Field>{block.type === "heading" ? <Field id={`${id}-block-${index}-level`} label={t("blocks.headingLevel", { number: index + 1 })}><select id={`${id}-block-${index}-level`} className={SHOP_SELECT_CLASS} {...form.register(`blocks.${index}.level`, { valueAsNumber: true })}><option value={2}>{t("blocks.heading2")}</option><option value={3}>{t("blocks.heading3")}</option></select></Field> : null}</> : null}
        {block.type === "list" ? <div className="grid gap-3"><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-5 accent-primary" {...form.register(`blocks.${index}.ordered`)} /><span>{t("blocks.ordered")}</span></label>{block.items.map((_item, itemIndex) => <div key={itemIndex} className="grid gap-2"><Field id={`${id}-block-${index}-item-${itemIndex}`} label={t("blocks.item", { number: itemIndex + 1 })} error={error(`blocks.${index}.items.${itemIndex}`)}><TextArea id={`${id}-block-${index}-item-${itemIndex}`} maxLength={1000} aria-invalid={!!error(`blocks.${index}.items.${itemIndex}`)} {...form.register(`blocks.${index}.items.${itemIndex}`)} /></Field><Button type="button" variant="outline" disabled={block.items.length <= 1} onClick={() => form.setValue(`blocks.${index}.items`, block.items.filter((_value, position) => position !== itemIndex), { shouldDirty: true, shouldValidate: true })}>{t("blocks.removeItem", { number: itemIndex + 1 })}</Button></div>)}<Button type="button" variant="outline" disabled={block.items.length >= 12} onClick={() => form.setValue(`blocks.${index}.items`, [...block.items, ""], { shouldDirty: true })}>{t("blocks.addItem")}</Button></div> : null}
        {block.type === "link" ? <><Field id={`${id}-block-${index}-label`} label={t("blocks.linkLabel")} error={error(`blocks.${index}.label`)}><TextInput id={`${id}-block-${index}-label`} maxLength={200} aria-invalid={!!error(`blocks.${index}.label`)} {...form.register(`blocks.${index}.label`)} /></Field><Field id={`${id}-block-${index}-href`} label={t("blocks.linkHref")} hint={t("blocks.linkHint")} error={error(`blocks.${index}.href`)}><TextInput id={`${id}-block-${index}-href`} type="url" maxLength={2048} aria-describedby={`${id}-block-${index}-href-hint`} aria-invalid={!!error(`blocks.${index}.href`)} {...form.register(`blocks.${index}.href`)} /></Field></> : null}
        {block.type === "image" ? <Field id={`${id}-block-${index}-image`} label={t("blocks.imageAsset")} error={error(`blocks.${index}.assetId`)}><select id={`${id}-block-${index}-image`} className={SHOP_SELECT_CLASS} aria-invalid={!!error(`blocks.${index}.assetId`)} {...form.register(`blocks.${index}.assetId`)}><option value="">{t("images.pick")}</option>{block.assetId && !assets.some(asset => asset.assetId === block.assetId) ? <option value={block.assetId}>{t("blocks.missingAsset")}</option> : null}{assets.map(asset => <option key={asset.assetId} value={asset.assetId}>{asset.altText} · {asset.credit}</option>)}</select></Field> : null}
      </div></Card>
    })}{!blocks.length ? <p className="text-sm text-muted-foreground">{t("article.emptyBody")}</p> : null}{error("blocks") ? <p role="alert" className="text-sm text-destructive">{error("blocks")}</p> : null}<div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><Field id={`${id}-add-type`} label={t("blocks.addType")}><select id={`${id}-add-type`} className={SHOP_SELECT_CLASS} value={type} onChange={event => setType(event.target.value as typeof type)}>{(["paragraph", "heading", "list", "link", "image"] as const).map(value => <option key={value} value={value}>{t(`blocks.${value}`)}</option>)}</select></Field><Button type="button" variant="outline" disabled={blocks.length >= EDITORIAL_BLOCKS_MAX || type === "image" && imageCount >= EDITORIAL_IMAGES_MAX} onClick={() => array.append(type === "image" ? { type: "image", assetId: "" } : newEditorialBlock(type))}><Plus aria-hidden="true" className="size-4" />{t("actions.addBlock")}</Button></div></fieldset>
  </fieldset>
}

export function EditorialDraftPreview({ value, assets, mediaName, bylines, title, hint }: { value: EditorialDraftValues; assets: EditorialAssetView[]; mediaName: string; bylines: EditorialBylineChoice[]; title?: string; hint?: string }) {
  const { t } = useTranslation("editorial")
  const byline = value.byline === "media" ? mediaName : bylines.find(choice => choice.grantId === value.byline)?.label
  return <section aria-label={title ?? t("article.preview")} className="grid min-w-0 content-start gap-3"><h2 className="mp-subtitle">{title ?? t("article.preview")}</h2><p className="text-sm text-muted-foreground">{hint ?? t("article.previewHint")}</p><article className="mx-auto grid w-full min-w-0 max-w-prose gap-4 rounded-[var(--ui2-card-radius)] border border-border bg-card p-4 text-card-foreground"><header className="grid gap-3"><h3 className="text-2xl font-semibold">{value.title || t("article.untitled")}</h3>{byline ? <p className="text-sm text-muted-foreground">{byline}</p> : null}{value.chapeau ? <p className="whitespace-pre-wrap text-lg">{value.chapeau}</p> : null}</header>{value.correctionNotice ? <aside className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm"><strong>{t("article.correction")}</strong><p>{value.correctionNotice}</p></aside> : null}{value.blocks.map((block, index) => {
    if (block.type === "paragraph") return <p key={index} className="whitespace-pre-wrap leading-relaxed">{block.text}</p>
    if (block.type === "heading") return block.level === 2 ? <h4 key={index} className="text-xl font-semibold">{block.text}</h4> : <h5 key={index} className="text-lg font-semibold">{block.text}</h5>
    if (block.type === "list") { const List = block.ordered ? "ol" : "ul"; return <List key={index} className={block.ordered ? "list-decimal space-y-2 pl-6" : "list-disc space-y-2 pl-6"}>{block.items.map((item, position) => <li key={position} className="whitespace-pre-wrap">{item}</li>)}</List> }
    if (block.type === "link") { const href = editorialHttpsLink(block.href); return href ? <a key={index} href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">{block.label}</a> : <span key={index}>{block.label}</span> }
    const asset = assets.find(item => item.assetId === block.assetId)
    return <figure key={index} className="grid gap-2">{asset?.url && !asset.withheld ? <GuardedEditorialImage asset={asset} /> : <p role="status" className="rounded-lg bg-muted p-4 text-sm">{t("images.previewUnavailable")}</p>}{asset?.credit ? <figcaption className="text-sm text-muted-foreground">{asset.credit}</figcaption> : null}</figure>
  })}</article></section>
}
export function GuardedEditorialImage({ asset }: { asset: EditorialAssetView }) {
  const { t } = useTranslation("editorial")
  const [failed, setFailed] = useState<string | null>(null)
  if (!asset.url || asset.withheld || failed === asset.url) return <p role="status">{t("images.withheld")}</p>
  // eslint-disable-next-line @next/next/no-img-element -- URL exclusivement fournie par la garde de délivrance éditoriale.
  return <img src={asset.url} alt={asset.altText} className="h-auto max-w-full rounded-lg object-contain" onError={() => setFailed(asset.url)} />
}
