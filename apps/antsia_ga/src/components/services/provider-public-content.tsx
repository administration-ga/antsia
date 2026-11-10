import type { Locale } from "@antsia/social-features/i18n"
import type { PublicStorefront } from "@convex/modules/shops/validators"

import type { CatalogPage } from "@/components/shops/catalog-model"
import { getAppT } from "@/i18n/server"
import type { CatalogSearch } from "@/lib/catalog-search"
import { ProviderContent } from "./provider-content"

/** Le chargeur parent a admis ce DTO ; aucun hook de session ni client privé au SSR. */
export function PublicProviderContent({ storefront, catalog, locale, viewer, search }: { storefront: PublicStorefront; catalog: CatalogPage; locale: Locale; viewer: "anonymous" | "authenticated"; search?: CatalogSearch }) {
  const { t } = getAppT(locale)
  return <ProviderContent storefront={storefront} catalog={catalog} audience="public" locale={locale} viewer={viewer} search={search} t={(key, options) => t(`provider:${key}`, options)} shopT={(key, options) => t(`shops:${key}`, options)} />
}
