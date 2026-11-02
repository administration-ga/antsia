"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import Link from "next/link"
import { useState } from "react"

import { useCartDraft } from "@/components/cart/use-cart-draft"
import { routes } from "@/lib/routes"

/**
 * La marque de l'activité au centre de l'en-tête de son espace (modèle des ventes privées, 22/10/2026) : son logo
 * et son nom, lien vers sa vitrine. Tant que la vitrine n'est pas lue (ou refusée), le libellé de l'espace.
 */
export function SpaceIdentity({ handle, provider, fallback }: { handle: string; provider: boolean; fallback: string }) {
  const { networkId } = useNetwork()
  const query = useAuthenticatedConvexQuery(api.modules.shops.shops.storefront, { networkId, handle })
  const [failedLogo, setFailedLogo] = useState<string | null>(null)
  const shop = query.isError ? null : query.data ?? null
  if (!shop) return <span className="min-w-0 truncate text-sm text-muted-foreground">{fallback}</span>
  const logo = shop.logoUrl && failedLogo !== shop.logoUrl ? shop.logoUrl : null
  return <Link href={provider ? routes.provider(handle) : routes.storefront(handle)} prefetch={false} className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-2 rounded-[var(--ui2-button-radius)] px-2 font-display text-base font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-space-identity>
    {/* eslint-disable-next-line @next/next/no-img-element -- URL fournie par la garde du moteur, pas d'identifiant de stockage client. */}
    {logo ? <img src={logo} alt="" className="size-7 shrink-0 rounded-md object-cover object-center" onError={() => setFailedLogo(logo)} /> : null}
    <span className="min-w-0 truncate">{shop.name}</span>
  </Link>
}

/** Le nombre de lignes de tous les paniers du membre (l'entrée « Panier » de l'espace le dit et le montre). */
export function useCartLines(): number {
  const cart = useCartDraft()
  return cart.ready ? cart.drafts.reduce((sum, draft) => sum + draft.items.length, 0) : 0
}

/** La pastille du nombre de lignes : décorative, le nombre est déjà dans le nom de l'entrée. */
export function SpaceCartCount({ count }: { count: number }) {
  if (!count) return null
  return <span aria-hidden="true" className="absolute right-1 top-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--role-commerce-fill,var(--primary-fill))] px-1 text-xs font-bold text-[color:var(--role-commerce-on,var(--primary-fill-on))] min-[1200px]:static min-[1200px]:ml-auto" data-space-cart-count>{count}</span>
}
