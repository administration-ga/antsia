import { parseCommerceStorefrontTerms } from "@antsia/social-domain/commerce/storefrontTerms"
import { Receipt, RotateCcw, ShieldCheck, Store, Truck, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

/**
 * Même contenu public pour membre et anonyme ; l'absence n'est jamais une gratuité. Présentées en cartes (la
 * réassurance des ventes privées, 22/10/2026), les cinq rubriques restent toujours là : ce que la boutique a
 * déclaré, sinon « Non renseigné », jamais un engagement supposé. `compact` (colonne étroite du panier) : une
 * seule carte en lignes, comme quand rien n'est publié.
 */
export function StorefrontTerms({ value, locale, t, compact = false }: { value: unknown; locale: string; t: (key: string, options?: Record<string, unknown>) => string; compact?: boolean }) {
  const terms = parseCommerceStorefrontTerms(value)
  const money = (amount: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "XAF", currencyDisplay: "code", maximumFractionDigits: 0 }).format(amount)
  const items: { key: "pickup" | "delivery" | "fees" | "returns" | "warranty"; icon: LucideIcon; content: ReactNode }[] = [
    { key: "pickup", icon: Store, content: terms?.pickup ? <ul className="grid gap-1">{terms.pickup.points.map(point => <li key={point.establishmentRef}>{point.label}</li>)}</ul> : null },
    { key: "delivery", icon: Truck, content: terms?.delivery ? <div className="grid gap-1"><p>{terms.delivery.label}</p><p>{terms.delivery.localities.join(" · ")}</p><p className="font-semibold">{money(terms.delivery.fee.amount)}</p>{terms.delivery.leadTimeDays === undefined ? null : <p>{t("storefrontTerms.leadTime", { count: terms.delivery.leadTimeDays })}</p>}</div> : null },
    { key: "fees", icon: Receipt, content: terms?.fees ? <ul className="grid gap-1">{terms.fees.map((fee, index) => <li key={`${fee.kind}:${index}`}>{fee.label} · {money(fee.amount.amount)}</li>)}</ul> : null },
    { key: "returns", icon: RotateCcw, content: terms?.returns?.summary ?? null },
    { key: "warranty", icon: ShieldCheck, content: terms?.warranty?.summary ?? null },
  ]
  return <section aria-labelledby="storefront-terms-title" className="grid min-w-0 gap-4 [overflow-wrap:anywhere]" data-storefront-terms>
    <div className="grid min-w-0 gap-1"><h2 id="storefront-terms-title" className="mp-subtitle">{t("storefrontTerms.title")}</h2><p className="text-sm text-muted-foreground">{t("storefrontTerms.declared")}</p></div>
    {/* Rien de publié, ou une colonne étroite : les cinq rubriques tiennent dans une seule carte, en lignes. */}
    {terms && !compact ? <dl className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-3 min-[768px]:gap-gutter">
      {items.map(({ key, icon: Icon, content }) => <div key={key} className="grid min-w-0 content-start gap-2 rounded-[var(--ui2-card-radius)] bg-card p-4 text-card-foreground">
        <dt className="flex min-w-0 items-center gap-2 font-semibold"><Icon aria-hidden className="size-5 shrink-0 text-[color:var(--role-commerce-ink,var(--primary))]" />{t(`storefrontTerms.${key}`)}</dt>
        <dd className={`whitespace-pre-wrap text-sm ${content === null ? "text-muted-foreground" : ""}`}>{content ?? t("storefrontTerms.unknown")}</dd>
      </div>)}
    </dl> : <dl className="grid min-w-0 grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-[var(--ui2-card-radius)] bg-card p-4 text-sm text-card-foreground">
      {items.map(({ key, icon: Icon, content }) => <div key={key} className="contents"><dt className="flex min-w-0 items-start gap-2 font-semibold"><Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-[color:var(--role-commerce-ink,var(--primary))]" />{t(`storefrontTerms.${key}`)}</dt><dd className={`min-w-0 whitespace-pre-wrap ${content === null ? "text-muted-foreground" : ""}`}>{content ?? t("storefrontTerms.unknown")}</dd></div>)}
    </dl>}
    {terms ? <p className="text-xs text-muted-foreground">{t("storefrontTerms.updated", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "Africa/Libreville" }).format(terms.publishedAt) })}</p> : null}
  </section>
}
