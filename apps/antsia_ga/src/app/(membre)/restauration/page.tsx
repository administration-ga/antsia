import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { FoodUniverseScreen } from "@/components/universes/food-universe-screen"
import { getAppT } from "@/i18n/server"
import { foodUniverseSearch } from "@/lib/food-universe-search"

export function generateMetadata(): Metadata {
  const { t } = getAppT()
  return { title: t("marketplace:food.title") }
}

/** L'univers « Alimentation et restauration » : les adresses du réseau et ce qu'on peut y commander. */
export default async function FoodUniversePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = foodUniverseSearch(await searchParams)
  if (!search) notFound()
  return <FoodUniverseScreen search={search} />
}
