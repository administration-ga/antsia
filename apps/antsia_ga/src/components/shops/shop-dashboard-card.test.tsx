import { renderToStaticMarkup } from "react-dom/server"
import { createAppI18n } from "@antsia/social-features/i18n"
import { describe, expect, it } from "vitest"

import { appResources } from "@/i18n/resources"
import { routes } from "@/lib/routes"
import { ShopDashboardCard, type ShopDashboardItem } from "./shop-dashboard-card"

const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "shops" })
const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, { ns: "shops", ...options })
const SHOP: ShopDashboardItem = { shopId: "shop-test", name: "Épicerie test", model: "products", storefront: "published", pageHandle: "epicerie-test", logoUrl: null }
const links = (shop: ShopDashboardItem) => [...renderToStaticMarkup(<ShopDashboardCard shop={shop} t={t} />).matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gu)].map((match) => [match[2] ?? "", (match[1] ?? "").replaceAll("&amp;", "&")])

describe("ShopDashboardCard — « Ma boutique »", () => {
  it("une boutique publiée : la gérer, voir sa vitrine, sa page et ses clients dans iCom Pro", () => {
    expect(links(SHOP)).toEqual([
      ["Préparer et gérer", routes.shopEditor("shop-test")],
      ["Voir la vitrine", routes.storefront("epicerie-test")],
      ["Voir ma page", routes.page("epicerie-test")],
      ["Mes clients", "/messages?espace=pro&activite=shop-test"],
    ])
  })

  it("un brouillon sans page : seulement la préparer, jamais une vitrine ou des clients inventés", () => {
    expect(links({ ...SHOP, storefront: "draft", pageHandle: null, name: null })).toEqual([["Préparer et gérer", routes.shopEditor("shop-test")]])
    expect(renderToStaticMarkup(<ShopDashboardCard shop={{ ...SHOP, storefront: "draft", pageHandle: null, name: null }} t={t} />)).toContain("Activité en préparation")
  })
})
