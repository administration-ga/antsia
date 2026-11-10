import type { Metadata } from "next"
import { MarketplaceScreen } from "@/components/marketplace/marketplace-screen"
import { getAppT } from "@/i18n/server"
import { marketplaceSearch } from "@/lib/marketplace-search"

export function generateMetadata(): Metadata {
  const { t } = getAppT()
  return { title: t("marketplace:title") }
}

/** Sans paramètre : l'accueil de la marketplace ; sinon, les résultats de la recherche portée par l'URL. */
export default async function MarketplacePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  return <MarketplaceScreen search={marketplaceSearch(params)} home={Object.keys(params).length === 0} />
}
