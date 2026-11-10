import { icomProHref } from "@antsia/social-features/features/messagerie/icom-space"

import { Card } from "@/components/shared/controls"
import { routes } from "@/lib/routes"
import { ShopLink, ShopLogo } from "./shop-ui"

/** Ce que « Ma boutique » montre d'une boutique gérée : le résumé que rend `shops.myShops`. */
export type ShopDashboardItem = {
  shopId: string
  name: string | null
  model: "products" | "quote_services"
  storefront: string
  pageHandle: string | null
  logoUrl: string | null
}

type Translate = (key: string, options?: Record<string, unknown>) => string

/**
 * Une boutique dans « Ma boutique » (étude des sept univers, § 12 ; spécification marketplace 02, § 5) : son état,
 * puis ses gestes de gestion — la préparer et la gérer, voir sa vitrine publiée, sa page sociale et ses clients dans
 * iCom Pro. Les écritures commerciales restent des commandes vers PRO.GA, depuis l'éditeur.
 */
export function ShopDashboardCard({ shop, t }: { shop: ShopDashboardItem; t: Translate }) {
  const name = shop.name ?? t("list.untitled")
  return (
    <Card>
      <div className="flex min-w-0 flex-wrap items-start gap-4">
        <ShopLogo url={shop.logoUrl} name={name} />
        <div className="grid min-w-0 flex-1 gap-2">
          <h2 className="mp-subtitle">{name}</h2>
          <p className="text-sm text-muted-foreground">{t(`models.${shop.model}`)} · {t(`states.${shop.storefront}`)}</p>
          <div className="flex flex-wrap gap-2">
            <ShopLink href={routes.shopEditor(shop.shopId)}>{t("list.manage")}</ShopLink>
            {shop.pageHandle && shop.storefront === "published" ? <ShopLink href={routes.storefront(shop.pageHandle)}>{t("storefront.viewStorefront")}</ShopLink> : null}
            {shop.pageHandle ? <ShopLink href={routes.page(shop.pageHandle)}>{t("list.viewPage")}</ShopLink> : null}
            {shop.pageHandle ? <ShopLink href={icomProHref(routes.messages(), shop.shopId)}>{t("list.clients")}</ShopLink> : null}
          </div>
        </div>
      </div>
    </Card>
  )
}
