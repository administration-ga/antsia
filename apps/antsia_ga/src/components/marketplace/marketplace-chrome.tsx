"use client"

import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@antsia/ui/sheet"
import { zodResolver } from "@hookform/resolvers/zod"
import { ChevronUp, Search, ShoppingBag, SlidersHorizontal } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { forwardRef, useEffect, useId, useRef, useState, useSyncExternalStore } from "react"
import { useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { useCartDraft } from "@/components/cart/use-cart-draft"
import { useMemberSession } from "@/components/network-shell"
import { FloatingLayer } from "@/components/shared/floating-layer"
import { useMinWidth } from "@/components/shared/use-min-width"
import { MARKETPLACE_QUERY_MAX, MARKETPLACE_QUERY_WORDS_MAX, marketplaceQueryWordCount, marketplaceSearch, type MarketplaceSearch } from "@/lib/marketplace-search"
import { routes } from "@/lib/routes"
import { MarketplaceFilters } from "./marketplace-filters"

/** Les rayons de premier niveau des produits, dans l'ordre du registre fermé des catégories. */
export const MARKETPLACE_TOP_CATEGORIES = ["fashion", "food", "craft", "electronics", "beauty", "home"] as const
/** `welcome` : l'accueil (le rayon « Maison » porte déjà la clé `home` du registre des catégories). */
export type MarketplacePill = "welcome" | "products" | "services" | "shops" | typeof MARKETPLACE_TOP_CATEGORIES[number]

/** Les rayons que la recherche propose tour à tour : de vrais libellés du registre, jamais des produits inventés. */
const SUGGESTED_CATEGORIES = ["food.groceries", "fashion.women.clothing", "beauty.fragrance", "electronics.phones", "home.decor", "fashion.accessories.jewelry", "food.beverages", "electronics.computers", "beauty.care", "craft.home"] as const

const PILL_CLASS = "inline-flex min-h-11 items-center whitespace-nowrap rounded-[var(--ui2-button-radius)] bg-[var(--esp-chip-bg,var(--muted))] px-4 text-sm font-semibold text-foreground hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-[var(--role-commerce-fill,var(--primary-fill))] aria-[current=page]:text-[color:var(--role-commerce-on,var(--primary-fill-on))]"
const FLOAT_CLASS = "pointer-events-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--ui2-button-radius)] bg-card px-5 text-sm font-semibold text-card-foreground shadow-[var(--esp-shadow-float)] hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/** Mouvement réduit : aucune suggestion qui tourne, aucun défilement animé. */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    callback => { if (typeof window.matchMedia !== "function") return () => undefined; const media = window.matchMedia("(prefers-reduced-motion: reduce)"); media.addEventListener("change", callback); return () => media.removeEventListener("change", callback) },
    () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  )
}

/**
 * L'en-tête de la marketplace (modèle des ventes privées, 22/10/2026) : le salut au nom du membre, ses paniers
 * avec leur nombre de lignes, et la recherche des produits.
 */
export const MarketplaceHeader = forwardRef<HTMLHeadingElement, { query?: string }>(function MarketplaceHeader({ query }, heading) {
  const { t } = useTranslation("marketplace")
  const { person } = useMemberSession()
  const cart = useCartDraft()
  const lines = cart.ready ? cart.drafts.reduce((sum, draft) => sum + draft.items.length, 0) : 0
  return <header className="grid min-w-0 gap-3" data-marketplace-header>
    <div className="flex min-w-0 items-center justify-between gap-3">
      <h1 ref={heading} tabIndex={-1} className="min-w-0 break-words font-display text-2xl font-bold leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{person.displayName ? t("home.greeting", { name: person.displayName }) : t("title")}</h1>
      <Link href={routes.cart()} prefetch={false} aria-label={t("home.cart", { count: lines })} className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ShoppingBag aria-hidden className="size-6" />
        {lines ? <span aria-hidden className="absolute right-0 top-0 inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--role-commerce-fill,var(--primary-fill))] px-1 text-xs font-bold text-[color:var(--role-commerce-on,var(--primary-fill-on))]">{lines}</span> : null}
      </Link>
    </div>
    <MarketplaceSearchField key={query ?? ""} query={query} />
  </header>
})

type SearchValues = { query: string }

/** La recherche des produits : sa suggestion tourne sur de vrais rayons tant que le champ est vide et sans focus. */
function MarketplaceSearchField({ query }: { query?: string }) {
  const { t, i18n } = useTranslation("marketplace")
  const { t: shopT } = useTranslation("shops")
  const router = useRouter()
  const id = useId()
  const reduce = usePrefersReducedMotion()
  const [focused, setFocused] = useState(false)
  const [turn, setTurn] = useState(0)
  const schema = z.object({ query: z.string().max(MARKETPLACE_QUERY_MAX, t("filters.queryInvalid")).refine(value => !/[\p{Cc}\uD800-\uDFFF]/u.test(value) && marketplaceQueryWordCount(value) <= MARKETPLACE_QUERY_WORDS_MAX, t("filters.queryInvalid")) })
  const form = useForm<SearchValues>({ resolver: zodResolver(schema), defaultValues: { query: query ?? "" } })
  const value = useWatch({ control: form.control, name: "query" }) ?? ""
  const resting = !reduce && !focused && !value
  useEffect(() => {
    if (!resting) return
    const timer = window.setInterval(() => setTurn(current => (current + 1) % SUGGESTED_CATEGORIES.length), 3200)
    return () => window.clearInterval(timer)
  }, [resting])
  const term = shopT(`catalog.facets.categories.${SUGGESTED_CATEGORIES[turn]}.label`).toLocaleLowerCase(i18n.resolvedLanguage ?? "fr")
  const submit = form.handleSubmit(input => {
    const next = marketplaceSearch({ vue: "produits", recherche: input.query })
    if (!next) { form.setError("query", { message: t("filters.queryInvalid") }); return }
    router.push(next.query ? routes.marketplace(next) : routes.marketplace({ view: "products" }))
  })
  const error = form.formState.errors.query?.message
  return <form role="search" onSubmit={submit} noValidate className="grid min-w-0 gap-1">
    <label htmlFor={id} className="sr-only">{t("home.searchLabel")}</label>
    <div className="relative min-w-0">
      <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
      <input id={id} type="search" enterKeyHint="search" autoComplete="off" maxLength={MARKETPLACE_QUERY_MAX} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} placeholder={reduce ? t("filters.query") : t("home.searchSuggestion", { term })} {...form.register("query", { onBlur: () => setFocused(false) })} onFocus={() => setFocused(true)} className="min-h-12 w-full min-w-0 rounded-[var(--ui2-button-radius)] border border-input bg-card pl-12 pr-4 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
    </div>
    {error ? <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p> : null}
  </form>
}

/**
 * Les rayons qui défilent : Accueil, Produits, les six rayons de premier niveau, Services et Boutiques. Une
 * recherche en cours suit le changement de rayon ou de vue (MP04 : la recherche se conserve) ; les autres filtres
 * repartent de zéro.
 */
export function MarketplacePills({ active, query }: { active: MarketplacePill | null; query?: string }) {
  const { t } = useTranslation("marketplace")
  const { t: shopT } = useTranslation("shops")
  const kept = query ? { query } : {}
  const pills: { id: MarketplacePill; href: string; label: string }[] = [
    { id: "welcome", href: routes.marketplaceHome(), label: t("home.pills.home") },
    { id: "products", href: routes.marketplace({ view: "products", ...kept }), label: t("views.products") },
    ...MARKETPLACE_TOP_CATEGORIES.map(key => ({ id: key, href: routes.marketplace({ view: "products", category: [key], ...kept }), label: shopT(`catalog.facets.categories.${key}.label`) })),
    { id: "services", href: routes.marketplace({ view: "services", ...kept }), label: t("views.services") },
    { id: "shops", href: routes.marketplace({ view: "shops", ...kept }), label: t("views.shops") },
  ]
  return <nav aria-label={t("home.pills.label")} className="min-w-0 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-marketplace-pills>
    <ul className="flex w-max gap-2">{pills.map(pill => <li key={pill.id}><Link href={pill.href} prefetch={false} aria-current={active === pill.id ? "page" : undefined} className={PILL_CLASS}>{pill.label}</Link></li>)}</ul>
  </nav>
}

/** La pastille active d'une recherche (la recherche saisie n'y change rien) : une vue, ou un seul rayon de produits. */
export function activeMarketplacePill(search: MarketplaceSearch): MarketplacePill | null {
  if (search.view === "shops") return "shops"
  const filtered = search.brand || search.material || search.color || search.audience || search.serviceMode || search.commercialMode || search.languageCode || search.serviceZone || search.minPrice !== undefined || search.maxPrice !== undefined || search.minDurationMinutes !== undefined || search.maxDurationMinutes !== undefined
  if (filtered) return null
  if (search.view === "services") return search.category ? null : "services"
  if (!search.category) return "products"
  const [only] = search.category
  return search.category.length === 1 ? MARKETPLACE_TOP_CATEGORIES.find(key => key === only) ?? null : null
}

/**
 * Le bouton « Filtrer » et sa feuille (en bas au téléphone, à droite dès 768 px) : le formulaire de filtres de la
 * marketplace, inchangé. Au téléphone et à la tablette, le bouton flotte au-dessus de la barre d'onglets (couche
 * portée, jamais cadrée par un conteneur) ; dès 1 024 px, il prend place dans la barre d'outils de l'écran.
 */
export function MarketplaceFilterSheet({ search, count, onApply, onApplied }: { search: MarketplaceSearch; count: number; onApply: (search: MarketplaceSearch) => void; onApplied?: () => void }) {
  const { t } = useTranslation("marketplace")
  const [open, setOpen] = useState(false)
  const applied = useRef(false)
  const wide = useMinWidth(768)
  const desktop = useMinWidth(1024)
  const label = count ? t("home.filterCount", { count }) : t("home.filter")
  const trigger = <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)} className={desktop ? "inline-flex min-h-11 items-center gap-2 rounded-[var(--ui2-button-radius)] bg-[var(--esp-chip-bg,var(--muted))] px-4 text-sm font-semibold hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : FLOAT_CLASS}><SlidersHorizontal aria-hidden className="size-4" />{label}</button>
  return <Sheet open={open} onOpenChange={setOpen}>
    {desktop ? trigger : <FloatingLayer><div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--esp-reseau-tabbar-inset)_+_env(safe-area-inset-bottom,0px)_+_0.75rem)] z-20 flex justify-center px-16 min-[768px]:bottom-6" data-marketplace-filter-float>{trigger}</div></FloatingLayer>}
    {/* Fermée par une recherche appliquée, la feuille rend le focus à l'écran (son titre) plutôt qu'au bouton ; fermée sans choix, au bouton. */}
    <SheetContent side={wide ? "right" : "bottom"} closeLabel={t("home.close")} className="sm:max-w-md" onCloseAutoFocus={event => { if (!applied.current) return; applied.current = false; event.preventDefault(); onApplied?.() }}>
      <SheetHeader><SheetTitle>{t("filters.title")}</SheetTitle></SheetHeader>
      <SheetBody className="overflow-y-auto overscroll-contain px-4 pb-0"><MarketplaceFilters search={search} onApply={next => { applied.current = true; setOpen(false); onApply(next) }} /></SheetBody>
    </SheetContent>
  </Sheet>
}

/** Le retour en haut, après un écran de défilement ; au téléphone, au-dessus de la barre d'onglets. */
export function MarketplaceBackToTop() {
  const { t } = useTranslation("marketplace")
  const reduce = usePrefersReducedMotion()
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const update = () => setVisible(window.scrollY > window.innerHeight)
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => window.removeEventListener("scroll", update)
  }, [])
  if (!visible) return null
  return <FloatingLayer><div className="pointer-events-none fixed bottom-[calc(var(--esp-reseau-tabbar-inset)_+_env(safe-area-inset-bottom,0px)_+_0.75rem)] right-3 z-20 min-[768px]:bottom-6 min-[768px]:right-[var(--spacing-gutter)]">
    <button type="button" aria-label={t("home.backToTop")} onClick={() => window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" })} className={`${FLOAT_CLASS} size-12 px-0`}><ChevronUp aria-hidden className="size-5" /></button>
  </div></FloatingLayer>
}
