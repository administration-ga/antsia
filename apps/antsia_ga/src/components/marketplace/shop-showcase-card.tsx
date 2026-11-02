"use client"

import type { api } from "@antsia/api/engine"
import type { FunctionReturnType } from "convex/server"
import Image from "next/image"
import Link from "next/link"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { routes } from "@/lib/routes"

export type ShowcaseStorefront = FunctionReturnType<typeof api.modules.shops.marketplaceShops.search>["page"][number]

/**
 * La grande carte d'une boutique (modèle des ventes privées, décision du propriétaire du 22/10/2026) : la
 * bannière de sa page en photo, le logo et le nom en haut, la spécialité (ou le modèle) en bas à gauche, et en
 * bas à droite les seules mentions RÉELLES — badge de confiance calculé par le moteur et zone servie. Sans
 * bannière (ou tant que le moteur ne la sert pas), un fond neutre porte le logo et le nom.
 */
export function ShopShowcaseCard({ storefront, eager = false }: { storefront: ShowcaseStorefront; eager?: boolean }) {
  const { t } = useTranslation("shops")
  const [failedBanner, setFailedBanner] = useState<string | null>(null)
  const banner = storefront.bannerUrl && failedBanner !== storefront.bannerUrl ? storefront.bannerUrl : null
  const onPhoto = banner !== null
  const ink = onPhoto ? "text-[color:var(--esp-on-banner)]" : "text-foreground"
  return <article data-shop-card className="min-w-0">
    <Link href={routes.storefront(storefront.handle)} prefetch={false} aria-label={t("storefront.viewNamed", { name: storefront.name })} className="relative block aspect-[16/9] overflow-hidden rounded-[var(--ui2-card-radius)] bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      {banner ? <>
        <Image unoptimized src={banner} alt="" fill sizes="(min-width: 1200px) 30vw, (min-width: 768px) 45vw, 100vw" loading={eager ? "eager" : "lazy"} className="object-cover" onError={() => setFailedBanner(banner)} />
        {/* Voile de lecture : texte clair lisible sur toute photo, sans couleur hors des jetons. */}
        <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(to_bottom,var(--ui2-scrim)_0%,transparent_42%,transparent_58%,var(--ui2-scrim)_100%)]" />
      </> : null}
      <span className="absolute inset-x-0 top-0 flex flex-col items-center gap-2 p-4 text-center">
        <ShowcaseLogo url={storefront.logoUrl} name={storefront.name} large={!onPhoto} />
        <span className={`line-clamp-2 break-words font-display text-xl font-bold leading-tight min-[480px]:text-2xl ${ink}`}>{storefront.name}</span>
      </span>
      <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
        <span className={`min-w-0 break-words text-xs font-bold uppercase tracking-wide min-[480px]:text-sm ${ink}`}>{storefront.specialty ?? t(`models.${storefront.model}`)}</span>
        <span className="flex shrink-0 flex-col items-end gap-1.5">
          <span className={SHOWCASE_TAG}>{t(`badges.${storefront.badge}`)}</span>
          {storefront.serviceArea ? <span className={`${SHOWCASE_TAG} max-w-[11rem] truncate`}>{storefront.serviceArea}</span> : null}
        </span>
      </span>
    </Link>
  </article>
}

const SHOWCASE_TAG = "rounded-[var(--esp-chip-radius,var(--radius-md))] bg-card px-2 py-1 text-xs font-semibold uppercase text-card-foreground"

/** Le logo de la page, sinon son initiale : jamais d'image inventée. */
function ShowcaseLogo({ url, name, large }: { url: string | null; name: string; large: boolean }) {
  const [failed, setFailed] = useState<string | null>(null)
  const size = large ? "size-16" : "size-12"
  // eslint-disable-next-line @next/next/no-img-element -- URL fournie par la garde du moteur, pas d'identifiant de stockage client.
  if (url && failed !== url) return <img src={url} alt="" className={`${size} shrink-0 rounded-[var(--esp-avatar-page-radius)] object-cover object-center`} onError={() => setFailed(url)} />
  return large ? <span aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-[var(--esp-avatar-page-radius)] bg-card font-display text-2xl font-bold text-foreground">{Array.from(name).at(0) ?? ""}</span> : null
}
