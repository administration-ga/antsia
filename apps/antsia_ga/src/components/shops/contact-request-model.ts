type Read<T> = { data: T | undefined; isError: boolean; isPending?: boolean }

/** Un accès historique frais ne dépend pas de la possibilité de créer une nouvelle demande. */
export function contactRequestSurface({ shop, offer, existing, offerScoped }: {
  shop: Read<object | null>
  offer: Read<{ actions: { contact: boolean } } | null>
  existing: Read<object | null>
  offerScoped: boolean
}): "existing" | "request" | "loading" | "unavailable" {
  if (existing.isError) return "unavailable"
  if (existing.isPending || existing.data === undefined) return "loading"
  if (existing.data !== null) return "existing"
  // La vitrine seule ne projette pas la readiness de contact général.
  if (!offerScoped || shop.isError || offer.isError || shop.data === null || offer.data === null || offer.data?.actions.contact === false) return "unavailable"
  if (shop.isPending || offer.isPending || shop.data === undefined || offer.data === undefined) return "loading"
  return "request"
}
