"use client"

import type { CatalogOffer } from "@convex/modules/shops/catalogValidators"
import { Minus, Plus, Trash2 } from "lucide-react"
import Link from "next/link"
import { useId, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { checkoutAmount } from "@/components/checkout/checkout-model"
import { OfferMedia } from "@/components/shops/offer-media"
import type { CartItem } from "@/lib/cart-draft"
import { routes } from "@/lib/routes"

/** Les lignes du panier : une colonne, deux dès que la leur dépasse 56 rem ; l'écart suit la gouttière dès 768 px. */
export const CART_LINES = "grid min-w-0 gap-3 min-[768px]:gap-gutter @min-[56rem]:grid-cols-2"
const STEP_BUTTON = "inline-flex size-11 items-center justify-center rounded-full disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/**
 * La page d'un panier, sur le modèle des ventes privées (décision du propriétaire du 22/10/2026). Au téléphone, une
 * colonne dans l'ordre de lecture : les lignes (`main`, la barre de validation collée en bas), le récapitulatif et
 * les conditions (`aside`), l'étape de remise (`after`), puis d'autres produits (`more`). Dès 1 024 px, le
 * récapitulatif tient une colonne à droite, collée sous l'en-tête, à côté des lignes et de la remise. Les lignes
 * lisent la largeur de leur colonne (`CART_LINES`) : deux par rangée sur grand écran.
 */
export function CartLayout({ main, aside, after, more }: { main: ReactNode; aside: ReactNode; after: ReactNode; more: ReactNode }) {
  return <div className="grid min-w-0 gap-6 min-[1024px]:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] min-[1024px]:gap-x-gutter" data-cart>
    <div className="@container grid min-w-0 content-start gap-4 min-[1024px]:col-start-1 min-[1024px]:row-start-1">{main}</div>
    <aside className="grid min-w-0 content-start gap-4 min-[1024px]:sticky min-[1024px]:top-24 min-[1024px]:col-start-2 min-[1024px]:row-span-2 min-[1024px]:row-start-1 min-[1024px]:self-start">{aside}</aside>
    <div className="grid min-w-0 content-start gap-4 empty:hidden min-[1024px]:col-start-1 min-[1024px]:row-start-2">{after}</div>
    {more ? <div className="min-w-0 empty:hidden min-[1024px]:col-span-full">{more}</div> : null}
  </div>
}

/**
 * Une ligne du panier : la photo et le nom mènent à la fiche ; la variante choisie, le prix exact et le montant de
 * la ligne ; la quantité en − / + (ou saisie, validée en quittant le champ) ; la corbeille retire la ligne.
 */
export function CartLine({ item, offer, available, locked, locale, update, remove }: { item: CartItem; offer: CatalogOffer | null; available: boolean; locked: boolean; locale: string; update: (quantity: number) => void; remove: () => void }) {
  const { t } = useTranslation("cart")
  const { t: shopT } = useTranslation("shops")
  const [quantity, setQuantity] = useState(String(item.quantity))
  const valid = /^[1-9]\d{0,2}$/.test(quantity)
  const variant = offer?.variants.find((entry) => entry.variantRef === item.variantRef)
  const amount = variant?.amount ?? (offer?.price.mode === "fixed" || offer?.price.mode === "unit" ? offer.price.amount : null)
  const unit = variant?.unit ?? (offer?.price.mode === "unit" ? offer.price.unit : null)
  const title = offer?.title ?? t("missing")
  const href = offer ? routes.shopOffer(offer.shopHandle, offer.offerRef) : null
  const commit = () => { if (!locked && valid && Number(quantity) !== item.quantity) update(Number(quantity)) }
  const step = (delta: number) => {
    const next = Math.min(999, Math.max(1, item.quantity + delta))
    setQuantity(String(next))
    if (!locked && next !== item.quantity) update(next)
  }
  const media = <OfferMedia media={offer?.media[0]} title={title} t={(key, options) => shopT(key, options)} className="aspect-square bg-background" />
  return <article className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-3 rounded-[var(--ui2-card-radius)] bg-card p-3 text-card-foreground min-[768px]:grid-cols-[6rem_minmax(0,1fr)_auto] min-[768px]:items-center" data-cart-line>
    {href ? <Link href={href} prefetch={false} tabIndex={-1} aria-hidden="true" className="min-w-0">{media}</Link> : <div className="min-w-0">{media}</div>}
    <div className="grid min-w-0 content-start gap-1">
      <h3 className="text-base font-semibold leading-snug">{href ? <Link href={href} prefetch={false} className="rounded-sm text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{title}</Link> : title}</h3>
      {variant ? <p className="text-sm text-muted-foreground">{variant.label}</p> : null}
      {amount !== null ? <p className={item.quantity > 1 ? "text-sm" : "font-bold text-[color:var(--role-commerce-ink,var(--foreground))]"}>{unit ? t("unit", { amount: checkoutAmount(amount, locale), unit }) : checkoutAmount(amount, locale)}</p> : null}
      {/* Le montant de la ligne n'est dit que s'il diffère du prix unitaire. */}
      {amount !== null && item.quantity > 1 ? <p className="font-bold text-[color:var(--role-commerce-ink,var(--foreground))]">{t("line", { amount: checkoutAmount(amount * item.quantity, locale) })}</p> : null}
      {!available ? <p role="status" className="text-sm">{t("missing")}</p> : null}
    </div>
    <form className="col-span-full flex flex-wrap items-center justify-between gap-3 min-[768px]:col-span-1 min-[768px]:justify-end" onSubmit={(event) => { event.preventDefault(); commit() }}>
      <div role="group" aria-label={t("quantity")} className="flex items-center rounded-[var(--ui2-button-radius)] bg-muted">
        <button type="button" aria-label={t("quantityLess")} disabled={locked || item.quantity <= 1} onClick={() => step(-1)} className={STEP_BUTTON}><Minus aria-hidden className="size-4" /></button>
        <input value={quantity} disabled={locked} inputMode="numeric" autoComplete="off" aria-label={t("quantity")} aria-invalid={!valid} onChange={(event) => setQuantity(event.target.value)} onBlur={commit} className="w-12 bg-transparent text-center text-base font-semibold focus-visible:outline-none" />
        <button type="button" aria-label={t("quantityMore")} disabled={locked || item.quantity >= 999} onClick={() => step(1)} className={STEP_BUTTON}><Plus aria-hidden className="size-4" /></button>
      </div>
      <button type="button" aria-label={t("removeNamed", { title })} disabled={locked} onClick={remove} className={`${STEP_BUTTON} text-destructive hover:bg-muted`}><Trash2 aria-hidden className="size-5" /></button>
    </form>
    {!valid ? <p role="alert" className="col-span-full text-sm">{t("quantityError")}</p> : null}
  </article>
}

/**
 * Le récapitulatif : le nombre d'articles et leur montant au prix exact. Les frais et le total définitifs ne sont
 * connus qu'avec le mode de remise et la réponse du vendeur : rien n'est annoncé avant. Au bureau, la validation y
 * vit ; au téléphone aussi (`everywhere`) une fois l'étape de remise ouverte, la barre du bas ayant laissé place.
 */
export function CartSummary({ articles, amount, locale, everywhere, children }: { articles: number; amount: number | null; locale: string; everywhere: boolean; children: ReactNode }) {
  const { t } = useTranslation("cart")
  const id = useId()
  return <section aria-labelledby={id} className="grid min-w-0 gap-3 rounded-[var(--ui2-card-radius)] bg-card p-4 text-card-foreground" data-cart-summary>
    <h2 id={id} className="mp-subtitle">{t("summaryTitle")}</h2>
    <p className="text-sm text-muted-foreground">{t("articles", { count: articles })}</p>
    {amount !== null ? <p className="flex flex-wrap items-baseline justify-between gap-x-3"><span>{t("itemsAmount")}</span><span className="font-display text-2xl font-bold">{checkoutAmount(amount, locale)}</span></p> : <p className="text-sm">{t("notExact")}</p>}
    <p className="text-xs text-muted-foreground">{t("feesLater")}</p>
    <div className={everywhere ? "grid" : "grid max-[1023px]:hidden"}>{children}</div>
  </section>
}

/**
 * La barre du téléphone : collée au bas de l'écran (au-dessus de la barre d'onglets) tant que les lignes défilent,
 * elle se pose après elles. Le nombre d'articles, leur montant et la validation, comme le récapitulatif.
 */
export function CartBar({ articles, amount, locale, children }: { articles: number; amount: number | null; locale: string; children: ReactNode }) {
  const { t } = useTranslation("cart")
  return <div className="sticky bottom-[calc(var(--esp-reseau-tabbar-inset)+env(safe-area-inset-bottom,0px)+0.5rem)] z-20 flex min-w-0 items-center gap-3 rounded-[var(--ui2-card-radius)] bg-card p-3 text-card-foreground shadow-[var(--esp-shadow-float)] min-[960px]:bottom-2 min-[1024px]:hidden" data-cart-bar>
    <div className="grid min-w-0 flex-1 gap-0.5"><span className="truncate text-xs text-muted-foreground">{t("articles", { count: articles })}</span>{amount !== null ? <span className="truncate font-display text-lg font-bold">{checkoutAmount(amount, locale)}</span> : null}</div>
    <div className="grid shrink-0">{children}</div>
  </div>
}
