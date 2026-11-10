"use client"

import { browserAppPath } from "@/lib/app-path"

import type { CatalogOffer } from "@convex/modules/shops/catalogValidators"
import { zodResolver } from "@hookform/resolvers/zod"
import { Minus, Plus } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useId, useLayoutEffect, useState } from "react"
import { useForm, useWatch, type UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"
import { Button, Field, TextInput } from "@/components/shared/controls"
import { FloatingLayer } from "@/components/shared/floating-layer"
import { useMinWidth } from "@/components/shared/use-min-width"
import { SHOP_SELECT_CLASS, ShopLink } from "@/components/shops/shop-ui"
import { catalogAmount, catalogAvailability, catalogDate } from "@/components/shops/catalog-model"
import { addCartItem } from "@/lib/cart-draft"
import { isDemoCatalogOfferRef } from "@/lib/demo-catalog-projection"
import { initialOfferVariantSelection, offerSelectionMode, offerVariantChoices, resolveOfferVariantSelection, updateOfferOptionSelection, type OfferInitialSelection, type OfferSelectionResult } from "@/lib/offer-variant-selection"
import { routes, specializedDestinationPath } from "@/lib/routes"
import { parseSpecializedDestination } from "@/lib/specialized-navigation"
import { useCartDraft } from "./use-cart-draft"

const demoOffer = (offer: CatalogOffer) => isDemoCatalogOfferRef(offer.offerRef) || offer.offerRef.startsWith("demo:offer:")
type SelectionValues = { options: string[]; variantRef: string; quantity: string }

/**
 * `onAdded` : la surface qui l'ouvre (feuille d'ajout rapide) se referme une fois la ligne enregistrée.
 * `layout="page"` (fiche d'offre) : au téléphone, la quantité et « Ajouter au panier » vivent dans une barre fixe
 * au-dessus de la barre de l'espace (modèle des ventes privées, 22/10/2026) ; dès 768 px, dans la fiche.
 */
export function OfferCartActions({ offer, initialSelection, onAdded, layout = "inline" }: { offer: CatalogOffer; initialSelection?: OfferInitialSelection; onAdded?: () => void; layout?: "inline" | "page" }) {
  const { t } = useTranslation("shops")
  if (isDemoCartOffer(offer)) return <p className="text-sm text-muted-foreground">{t("publicActions.demoNotice")}</p>
  return <OwnedOfferCartActions offer={offer} initialSelection={initialSelection} onAdded={onAdded} layout={layout} />
}

/** Une offre de démonstration n'entre jamais dans un panier. */
export const isDemoCartOffer = demoOffer

function OwnedOfferCartActions({ offer, initialSelection, onAdded, layout }: { offer: CatalogOffer; initialSelection?: OfferInitialSelection; onAdded?: () => void; layout: "inline" | "page" }) {
  const { networkId, personId } = useCartDraft(offer.shopHandle)
  const stamp = JSON.stringify([networkId, personId, offer.offerRef, offer.revision])
  const [firstStamp] = useState(stamp)
  return <OfferCartSelection key={JSON.stringify([stamp, initialSelection])} offer={offer} initialSelection={stamp === firstStamp ? initialSelection : undefined} onAdded={onAdded} layout={layout} />
}

function useOfferSelection(offer: CatalogOffer, initialSelection?: OfferInitialSelection) {
  const { t } = useTranslation("cart")
  const schema = z.object({ options: z.array(z.string()).max(2), variantRef: z.string(), quantity: z.string().regex(/^[1-9]\d{0,2}$/, t("quantityError")) })
  const defaults = initialOfferVariantSelection(offer, initialSelection)
  const form = useForm<SelectionValues>({ resolver: zodResolver(schema), defaultValues: defaults })
  const watched = useWatch({ control: form.control, defaultValue: defaults })
  const values: SelectionValues = { options: watched.options ?? defaults.options, variantRef: watched.variantRef ?? defaults.variantRef, quantity: watched.quantity ?? defaults.quantity }
  const selection = resolveOfferVariantSelection(offer, values)
  return { form, values, selection }
}

function OfferCartSelection({ offer, initialSelection, onAdded, layout = "inline" }: { offer: CatalogOffer; initialSelection?: OfferInitialSelection; onAdded?: () => void; layout?: "inline" | "page" }) {
  const { t } = useTranslation("cart")
  const { t: shopT } = useTranslation("shops")
  const router = useRouter()
  const cart = useCartDraft(offer.shopHandle)
  const [message, setMessage] = useState<string | null>(null)
  const { form, values, selection } = useOfferSelection(offer, initialSelection)
  const formId = useId()
  const wide = useMinWidth(768)
  if (offer.price.mode === "quote" || !offer.variants.length && !["fixed", "unit"].includes(offer.price.mode)) return <p className="text-sm text-muted-foreground">{t("quoteClosed")}</p>
  const docked = layout === "page" && !wide
  const blocked = !cart.ready || !!cart.draft?.submitted || !selection.canAdd || !/^[1-9]\d{0,2}$/u.test(values.quantity)
  return <form id={formId} className="grid w-full gap-3 rounded-[var(--ui2-card-radius)] border border-[color:var(--esp-surface-border)] bg-background p-4" onSubmit={form.handleSubmit((values) => {
    if (!cart.ready) return
    const current = resolveOfferVariantSelection(offer, values)
    if (!current.canAdd) { form.setError("variantRef", { message: shopT(`variantSelection.states.${current.status}`) }); return }
    const result = addCartItem(cart.draft, { networkId: String(cart.networkId), personId: String(cart.personId) }, offer.shopHandle, { offerRef: offer.offerRef, ...(current.variant ? { variantRef: current.variant.variantRef } : {}), quantity: Number(values.quantity) }, Date.now())
    const outcome = result.ok ? cart.save(result.draft) ? "added" : cart.getSaveError() === "drafts_full" ? "drafts_full" : "draftUnavailable" : result.reason
    setMessage(outcome)
    // Ajouté depuis la barre fixe : la confirmation se lit là où l'on regarde, avec l'accès aux paniers.
    if (outcome === "added" && docked) toast.success(t("added"), { action: { label: t("open"), onClick: () => router.push(routes.cart()) } })
    if (outcome === "added") onAdded?.()
  })}>
    <OfferSelectionInputs offer={offer} form={form} values={values} selection={selection} withQuantity={!docked} />
    {/* Ajouter au panier : couleur du commerce (ADR-0027). */}
    {docked ? <OfferBuyBar formId={formId} form={form} quantity={values.quantity} disabled={blocked} /> : <div className="flex flex-wrap gap-2"><Button type="submit" variant="commerce" disabled={blocked}>{t("add")}</Button><ShopLink href={routes.cart()}>{t("open")}</ShopLink></div>}
    {message ? <p role="status" className="text-sm">{t(message)}</p> : null}
  </form>
}

/**
 * La barre d'achat du téléphone : quantité et « Ajouter au panier », posées juste au-dessus de la barre de
 * l'espace (sa hauteur réelle est relue), dans une couche portée. Elle reste liée au formulaire de la fiche par
 * l'attribut `form` : la sélection de variante et la validation restent les siennes. Sa propre hauteur va dans
 * `--space-floating-bar` de l'espace, que la page ajoute à sa marge basse : la fin de la fiche reste lisible.
 */
function OfferBuyBar({ formId, form, quantity, disabled }: { formId: string; form: UseFormReturn<SelectionValues>; quantity: string; disabled: boolean }) {
  const { t } = useTranslation("cart")
  const [bottom, setBottom] = useState(0)
  const [bar, setBar] = useState<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    if (!bar) return
    const space = document.querySelector<HTMLElement>("[data-specialized-space]")
    const measure = () => {
      setBottom(Math.round(space?.querySelector("nav")?.getBoundingClientRect().height ?? 0))
      space?.style.setProperty("--space-floating-bar", `${Math.round(bar.getBoundingClientRect().height)}px`)
    }
    measure()
    window.addEventListener("resize", measure)
    return () => { window.removeEventListener("resize", measure); space?.style.removeProperty("--space-floating-bar") }
  }, [bar])
  const current = /^[1-9]\d{0,2}$/u.test(quantity) ? Number(quantity) : 1
  const step = (delta: number) => form.setValue("quantity", String(Math.min(999, Math.max(1, current + delta))), { shouldValidate: true, shouldDirty: true })
  return <FloatingLayer><div ref={setBar} data-offer-buy-bar style={{ bottom }} className="fixed inset-x-0 z-30 flex items-center gap-3 border-t border-[color:var(--esp-surface-border)] bg-card px-3 py-2 text-card-foreground shadow-[var(--esp-shadow-float)]">
    <div className="flex shrink-0 items-center rounded-[var(--ui2-button-radius)] bg-muted" role="group" aria-label={t("quantity")}>
      <button type="button" aria-label={t("quantityLess")} disabled={current <= 1} onClick={() => step(-1)} className="inline-flex size-11 items-center justify-center rounded-full disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Minus aria-hidden className="size-4" /></button>
      <input form={formId} inputMode="numeric" autoComplete="off" aria-label={t("quantity")} className="w-10 bg-transparent text-center text-base font-semibold focus-visible:outline-none" {...form.register("quantity")} />
      <button type="button" aria-label={t("quantityMore")} disabled={current >= 999} onClick={() => step(1)} className="inline-flex size-11 items-center justify-center rounded-full disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Plus aria-hidden className="size-4" /></button>
    </div>
    <Button type="submit" form={formId} variant="commerce" className="min-w-0 flex-1" disabled={disabled}>{t("add")}</Button>
  </div></FloatingLayer>
}

/** Consultation seule : aucun fournisseur réseau, stockage de panier ou appel métier privé. */
export function PublicOfferSelection({ offer, viewer, initialSelection }: { offer: CatalogOffer; viewer: "anonymous" | "authenticated"; initialSelection?: OfferInitialSelection }) {
  const { t } = useTranslation("shops")
  if (demoOffer(offer)) return <p className="text-sm text-muted-foreground">{t("publicActions.demoNotice")}</p>
  if (offer.kind !== "product" || offer.price.mode === "quote") return null
  return <PublicOfferSelectionForm key={JSON.stringify([offer.offerRef, offer.revision, initialSelection])} offer={offer} viewer={viewer} initialSelection={initialSelection} />
}

function PublicOfferSelectionForm({ offer, viewer, initialSelection }: { offer: CatalogOffer; viewer: "anonymous" | "authenticated"; initialSelection?: OfferInitialSelection }) {
  const { t } = useTranslation("shops")
  const { form, values, selection } = useOfferSelection(offer, initialSelection)
  const quantity = /^[1-9]\d{0,2}$/u.test(values.quantity) ? Number(values.quantity) : undefined
  const destination = quantity === undefined ? undefined : parseSpecializedDestination({ kind: "offer", handle: offer.shopHandle, offerRef: offer.offerRef, ...(selection.canAdd && selection.variant ? { variantRef: selection.variant.variantRef } : {}), quantity })
  const href = destination ? viewer === "authenticated" ? specializedDestinationPath(destination) : routes.signIn(undefined, undefined, undefined, undefined, destination) : undefined
  return <form className="grid min-w-0 gap-3" onSubmit={event => event.preventDefault()}>
    <OfferSelectionInputs offer={offer} form={form} values={values} selection={selection} />
    {href ? <Link href={href} prefetch={false} className="inline-flex min-h-11 items-center justify-center rounded-[var(--ui2-button-radius)] border border-border bg-card px-4 py-2 text-center font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("publicActions.chooseOptions")}</Link> : null}
    <p className="text-xs text-muted-foreground">{t(viewer === "authenticated" ? "publicActions.memberNotice" : "publicActions.signInNotice")}</p>
  </form>
}

function OfferSelectionInputs({ offer, form, values, selection, withQuantity = true }: { offer: CatalogOffer; form: UseFormReturn<SelectionValues>; values: SelectionValues; selection: OfferSelectionResult; withQuantity?: boolean }) {
  const { t } = useTranslation("cart")
  const { t: shopT, i18n } = useTranslation("shops")
  const id = useId()
  const locale = i18n.resolvedLanguage ?? "fr"
  const mode = offerSelectionMode(offer)
  return <>
    {mode === "axes" ? offer.variantAxes.map((axis, index) => <Field key={`${index}:${axis}`} id={`${id}-axis-${index}`} label={axis}><select id={`${id}-axis-${index}`} name={`options.${index}`} className={SHOP_SELECT_CLASS} value={values.options[index] ?? ""} disabled={index > 0 && !values.options.slice(0, index).every(Boolean)} onChange={event => { form.setValue("options", updateOfferOptionSelection(offer, values.options, index, event.target.value), { shouldValidate: true, shouldDirty: true }); form.clearErrors("variantRef") }}><option value="">{t("choose")}</option>{offerVariantChoices(offer, values.options, index).map(choice => <option key={choice.value} value={choice.value} disabled={choice.disabled}>{choice.value}{choice.disabled ? ` — ${shopT("variantSelection.unavailableOption")}` : ""}</option>)}</select></Field>) : mode === "flat" ? <Field id={`${id}-variant`} label={t("variant")}><select id={`${id}-variant`} className={SHOP_SELECT_CLASS} {...form.register("variantRef")}><option value="">{t("choose")}</option>{offer.variants.map((variant, index) => <option key={`${variant.variantRef}:${index}`} value={variant.variantRef} disabled={!resolveOfferVariantSelection(offer, { options: [], variantRef: variant.variantRef }).canAdd}>{variant.label}</option>)}</select></Field> : null}
    {withQuantity ? <Field id={`${id}-quantity`} label={t("quantity")} error={form.formState.errors.quantity?.message ?? (!/^[1-9]\d{0,2}$/u.test(values.quantity) ? t("quantityError") : undefined)}><TextInput id={`${id}-quantity`} inputMode="numeric" autoComplete="off" aria-invalid={!/^[1-9]\d{0,2}$/u.test(values.quantity) || undefined} {...form.register("quantity")} /></Field> : null}
    <div className="grid gap-1 rounded-[var(--ui2-card-radius)] bg-muted p-3 text-sm" aria-live="polite" data-offer-selection-summary>
      {selection.status !== "selected" ? <p>{shopT(`variantSelection.states.${selection.status}`)}</p> : null}
      {selection.unitAmount !== null ? <p className="font-semibold">{shopT("variantSelection.price")} : {catalogAmount(selection.unitAmount, locale)}{selection.unit ? ` / ${selection.unit}` : ""}</p> : null}
      <p>{catalogAvailability(offer.availability, (key, options) => shopT(key, options), selection.availability)}</p>
      {offer.availability.updatedAt !== null ? <p>{shopT("catalog.availability.updated", { date: catalogDate(offer.availability.updatedAt, locale) })}</p> : null}
      <p className="text-xs text-muted-foreground">{shopT("variantSelection.indicative")}</p>
    </div>
    {form.formState.errors.variantRef?.message ? <p role="alert" className="text-sm text-destructive">{form.formState.errors.variantRef.message}</p> : null}
  </>
}

export function OfferShareButton({ handle, offerRef, kind = "product" }: { handle: string; offerRef: string; kind?: "product" | "service" }) {
  const { t } = useTranslation("cart")
  const [message, setMessage] = useState<string | null>(null)
  return <div className="grid gap-2"><Button variant="outline" onClick={async () => {
    try {
      const origin = process.env.NEXT_PUBLIC_SITE_URL
      if (!origin) { setMessage("shareUnavailable"); return }
      const parsed = new URL(origin)
      if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && parsed.protocol === "http:" && parsed.hostname === "localhost")) { setMessage("shareUnavailable"); return }
      const url = new URL(browserAppPath(kind === "service" ? routes.publicProviderOffer(handle, offerRef) : routes.publicShopOffer(handle, offerRef)), parsed.origin).href
      if (navigator.share) await navigator.share({ url })
      else { await navigator.clipboard.writeText(url); setMessage("copied") }
    } catch { setMessage("shareUnavailable") }
  }}>{t("shareOffer")}</Button><p className="text-xs text-muted-foreground">{message ? t(message) : t("shareNotice")}</p></div>
}
