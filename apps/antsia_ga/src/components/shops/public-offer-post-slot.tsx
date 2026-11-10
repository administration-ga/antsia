import type { Locale } from "@antsia/social-features/i18n"
import { getAppT } from "@/i18n/server"
import { loadPublicPostOffer } from "@/lib/public-catalog-data"
import type { CatalogOffer } from "./catalog-model"
import { OfferCard } from "./offer-card"

export function PublicCatalogOfferCard({ offer, locale, compact = false }: { offer: CatalogOffer; locale: Locale; compact?: boolean }) {
  const { t } = getAppT(locale)
  return <OfferCard offer={offer} audience="public" locale={locale} t={(key, options) => t(`shops:${key}`, options)} compact={compact} />
}

/** SSR uniquement : aucun fournisseur membre, donnée privée ou chute en anonyme. */
export async function PublicOfferPostSlot({ postId, locale }: { postId: string; locale: Locale }) {
  const result = await loadPublicPostOffer(postId)
  if (result.status !== "ready" || !result.data) return null
  const { t } = getAppT(locale)
  return <aside aria-label={t("shops:catalog.attachedOffer")} className="grid min-w-0 gap-2 px-3 pb-3 sm:px-4 sm:pb-4"><p className="text-xs font-semibold text-muted-foreground">{t("shops:catalog.attachedOffer")}</p><PublicCatalogOfferCard offer={result.data} locale={locale} compact /></aside>
}
