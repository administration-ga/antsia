"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { effectiveActivityConfiguration } from "@antsia/social-domain/activityConfiguration"
import { AppearanceToggle } from "@antsia/social-features/shell/appearance"
import { icomProHref } from "@antsia/social-features/features/messagerie/icom-space"
import { cn } from "@antsia/ui/lib/cn"
import { ArrowLeft, House, LayoutGrid, MessageCircle, ShoppingBag, CalendarCheck, UsersRound, UserRound, BriefcaseBusiness, Handshake, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { routes, type SpecializedShopRoute } from "@/lib/routes"
import { useSpecializedNavigation } from "./specialized-navigation"
import { usePhoneNavigation } from "./mobile-navigation-viewport"
import { activeSpecializedDestination } from "./specialized-navigation-state"
import { SpaceCartCount, SpaceIdentity, useCartLines } from "./specialized-space-identity"

const NAV_ITEM = "flex min-h-11 min-w-11 items-center justify-center gap-3 rounded-[var(--ui2-button-radius)] px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-[var(--role-commerce-fill)] aria-[current=page]:text-[color:var(--role-commerce-on)] min-[1200px]:justify-start"

/** Une navigation métier : barre basse téléphone, rail tablette et bureau. */
export function SpecializedPage({ space, children }: { space: SpecializedShopRoute; children: ReactNode }) {
  const { t } = useTranslation("specializedSpaces")
  const lines = useCartLines()
  const provider = space.provider === true || space.section === "service"
  const { networkId } = useNetwork()
  const storefront = useAuthenticatedConvexQuery(api.modules.shops.shops.storefront, provider ? "skip" : { networkId, handle: space.handle })
  const food = !provider && !storefront.isError && storefront.data ? effectiveActivityConfiguration(storefront.data.activityConfiguration, storefront.data.model).template === "food" : false
  const { t: shopT } = useTranslation("shops")
  const links = provider ? [
    { id: "providerHome", href: routes.provider(space.handle), icon: House },
    { id: "services", href: routes.providerCatalog(space.handle), icon: LayoutGrid },
    { id: "requests", href: routes.serviceRequests(), icon: CalendarCheck },
    { id: "social", href: routes.page(space.handle), icon: UsersRound },
  ] as const : [
    { id: "home", href: routes.storefront(space.handle), icon: House },
    { id: "catalog", href: routes.shopCatalog(space.handle), icon: LayoutGrid },
    { id: "cart", href: routes.cart(), icon: ShoppingBag },
    { id: "social", href: routes.page(space.handle), icon: UsersRound },
  ] as const
  const label = t(provider ? "serviceSpace" : "shopSpace")
  return <SpecializedFrame kind={provider ? "provider" : "shop"} label={label} identity={<SpaceIdentity handle={space.handle} provider={provider} fallback={label} />} links={links.map(link => link.id === "cart" ? { ...link, label: lines ? t("nav.cartCount", { count: lines }) : t("nav.cart"), badge: lines } : { ...link, label: link.id === "catalog" && food ? shopT("food.menu") : t(`nav.${link.id}`), ...(link.id === "social" ? { shortLabel: t("mobile.social") } : link.id === "providerHome" ? { shortLabel: t("mobile.home") } : link.id === "requests" ? { shortLabel: t("mobile.requests") } : {}) })}>{children}</SpecializedFrame>
}

export function SpecializedProfessionalPage({ children }: { children: ReactNode }) {
  const { t } = useTranslation("specializedSpaces")
  const links = [
    { id: "directory", label: t("professionalNav.directory"), href: routes.professionals(), icon: UsersRound },
    { id: "profile", label: t("professionalNav.profile"), shortLabel: t("mobile.profile"), href: routes.professionalEditor(), icon: UserRound },
    { id: "collaborations", label: t("professionalNav.collaborations"), shortLabel: t("mobile.collaborations"), href: routes.professionalCollaborations(), icon: Handshake },
    { id: "activities", label: t("professionalNav.activities"), shortLabel: t("mobile.activities"), href: routes.myShops(), icon: BriefcaseBusiness },
  ]
  return <SpecializedFrame kind="professional" label={t("professionalSpace")} links={links}>{children}</SpecializedFrame>
}

export function SpecializedEditorialPage({ children }: { children: ReactNode }) {
  const { t } = useTranslation("specializedSpaces")
  const pathname = usePathname()
  const match = /^\/redaction\/([A-Za-z0-9_-]{1,128})(?:\/(?:configuration|equipe))?$/u.exec(pathname)
  const pageId = match?.[1] === "articles" ? null : match?.[1]
  const links = pageId ? [
    { id: "desk", label: t("editorialNav.desk"), href: routes.mediaDesk(pageId), icon: LayoutGrid },
    { id: "config", label: t("editorialNav.config"), href: routes.mediaConfig(pageId), icon: BriefcaseBusiness },
    { id: "team", label: t("editorialNav.team"), href: routes.mediaTeam(pageId), icon: UsersRound },
    { id: "media", label: t("editorialNav.media"), shortLabel: t("mobile.media"), href: routes.mediaHome(), icon: House },
  ] : [
    { id: "media", label: t("editorialNav.media"), shortLabel: t("mobile.media"), href: routes.mediaHome(), icon: House },
    { id: "discover", label: t("editorialNav.discover"), href: routes.press(), icon: LayoutGrid },
    { id: "activities", label: t("editorialNav.activities"), shortLabel: t("mobile.activities"), href: routes.myShops(), icon: BriefcaseBusiness },
    { id: "messages", label: t("messages"), href: icomProHref(routes.messages()), icon: MessageCircle },
  ]
  return <SpecializedFrame kind="media" label={t("editorialSpace")} links={links}>{children}</SpecializedFrame>
}

type SpaceLink = { id: string; label: string; shortLabel?: string; href: string; icon: LucideIcon; badge?: number }
/**
 * Même coque responsive ; les destinations restent explicites pour chaque spécialité.
 * Gouttière unique (règle des pages de membre, 22/10/2026) : dès 768 px, la marge
 * extérieure, l'écart entre le rail et le contenu et le retrait de la barre valent le
 * jeton `--spacing-gutter` (16 px, puis 24 px dès 1 200 px), sans largeur maximale.
 * Le téléphone garde sa barre basse et ses retraits (12 px, 24 px dès `sm`).
 * ⚠️ Tailwind 4 émet `sm:` (en rem) APRÈS `min-[768px]:` (en px) : un `sm:px-6` libre
 * l'emporterait à toutes les largeurs, d'où `sm:max-[768px]:`. Une barre fixe posée sur la
 * barre basse (achat d'une fiche) déclare sa hauteur dans `--space-floating-bar` (0 par défaut).
 */
function SpecializedFrame({ kind, label, identity, links, children }: { kind: "shop" | "provider" | "professional" | "media"; label: string; identity?: ReactNode; links: readonly SpaceLink[]; children: ReactNode }) {
  const { t } = useTranslation("specializedSpaces")
  const pathname = usePathname()
  const back = useSpecializedNavigation()
  const phone = usePhoneNavigation()
  const active = activeSpecializedDestination(kind, pathname, links)
  return <div className="min-h-dvh bg-background text-foreground [--space-floating-bar:0px]" data-specialized-space={kind}>
    <header className="sticky top-0 z-30 border-b border-[color:var(--esp-surface-border)] bg-background/95 backdrop-blur">
      <div className="flex min-h-16 w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 sm:max-[768px]:px-6 min-[768px]:px-gutter">
        <Link href={back.href} scroll={false} onClick={back.prepareReturn} className="inline-flex min-h-11 items-center gap-2 rounded-[var(--ui2-button-radius)] px-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft className="size-4 shrink-0" aria-hidden="true" /><span className={identity ? "max-[639px]:sr-only" : undefined}>{t("returnToAntsia")}</span></Link>
        {/* La marque de l'activité au centre (boutique, prestataire) ; au téléphone, le retour se réduit alors à sa flèche. */}
        {identity ? <div className="flex min-w-0 flex-1 justify-center">{identity}</div> : <span className="hidden min-w-0 truncate text-sm text-muted-foreground sm:inline">{label}</span>}
        <div className="flex items-center gap-1"><Link href={icomProHref(routes.messages())} aria-label={t("messages")} className={NAV_ITEM}><MessageCircle aria-hidden="true" className="size-5" /></Link><AppearanceToggle /></div>
      </div>
    </header>
    <div className="w-full min-[768px]:grid min-[768px]:grid-cols-[96px_minmax(0,1fr)] min-[768px]:gap-gutter min-[768px]:px-gutter min-[1200px]:grid-cols-[208px_minmax(0,1fr)]">
      <nav aria-label={t("navigation")} data-antsia-mobile-navigation data-mobile-nav={phone ? "" : undefined} className="min-[768px]:sticky min-[768px]:top-20 min-[768px]:flex min-[768px]:h-fit min-[768px]:flex-col min-[768px]:self-start min-[768px]:px-0 min-[768px]:py-3">
        <div className="contents" data-navigation-dock>
          {links.map(({ id, href, label, shortLabel, icon: Icon, badge }) => {
            const visibleLabel = id === "cart" ? t("nav.cart") : label
            const compactLabel = shortLabel ?? visibleLabel
            return <Link key={id} href={href} aria-label={label} aria-current={active === id ? "page" : undefined} data-destination-item={id} className={cn(NAV_ITEM, "relative flex-col gap-1 min-[1200px]:flex-row min-[1200px]:gap-3")}>
              <span data-destination-icon className="relative inline-flex shrink-0 items-center justify-center"><Icon aria-hidden="true" className="size-5 shrink-0" /></span>
              {compactLabel === visibleLabel ? <span data-destination-label className="text-xs min-[768px]:sr-only min-[1200px]:not-sr-only min-[1200px]:text-sm">{visibleLabel}</span> : <><span data-destination-label className="text-xs min-[768px]:hidden">{compactLabel}</span><span data-destination-desktop-label className="hidden text-sm min-[1200px]:inline">{visibleLabel}</span></>}
              {badge ? <SpaceCartCount count={badge} /> : null}
            </Link>
          })}
        </div>
      </nav>
      <main id="contenu" tabIndex={-1} className="min-w-0 px-3 py-5 pb-[calc(88px+var(--space-floating-bar,0px)+env(safe-area-inset-bottom,0px))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring sm:max-[768px]:px-6 min-[768px]:px-0 min-[768px]:pb-8">{children}</main>
    </div>
  </div>
}
