import { describe, expect, it } from "vitest"

import { routes } from "@/lib/routes"
import { activeSpecializedDestination } from "./specialized-navigation-state"

const shop = [
  { id: "home", href: routes.storefront("atelier") },
  { id: "catalog", href: routes.shopCatalog("atelier") },
  { id: "cart", href: routes.cart() },
  { id: "social", href: routes.page("atelier") },
]
const provider = [
  { id: "providerHome", href: routes.provider("atelier") },
  { id: "services", href: routes.providerCatalog("atelier") },
  { id: "requests", href: routes.serviceRequests() },
]

describe("repère de la navigation métier", () => {
  it("garde l'accueil exact mais range la fiche d'un produit sous son menu", () => {
    expect(activeSpecializedDestination("shop", routes.storefront("atelier"), shop)).toBe("home")
    expect(activeSpecializedDestination("shop", routes.shopOffer("atelier", "pro.ga:offer:riz"), shop)).toBe("catalog")
    expect(activeSpecializedDestination("shop", routes.shopCatalog("atelier"), shop)).toBe("catalog")
  })

  it("garde les prestations actives pendant la consultation et le choix d'un service", () => {
    expect(activeSpecializedDestination("provider", routes.providerOffer("atelier", "pro.ga:offer:soin"), provider)).toBe("services")
    expect(activeSpecializedDestination("provider", routes.serviceQuote("atelier", "pro.ga:offer:soin"), provider)).toBe("services")
    expect(activeSpecializedDestination("provider", routes.serviceBooking("atelier", "pro.ga:offer:soin"), provider)).toBe("services")
    expect(activeSpecializedDestination("provider", routes.serviceRequests(), provider)).toBe("requests")
  })

  it("distingue découvrir un professionnel et préparer son propre profil", () => {
    const links = [{ id: "directory", href: routes.professionals() }, { id: "profile", href: routes.professionalEditor() }, { id: "collaborations", href: routes.professionalCollaborations() }]
    expect(activeSpecializedDestination("professional", routes.professionalProfile("awa.ndong"), links)).toBe("directory")
    expect(activeSpecializedDestination("professional", routes.professionalEditor(), links)).toBe("profile")
    expect(activeSpecializedDestination("professional", routes.professionalCollaborations(), links)).toBe("collaborations")
  })

  it("choisit la sous-rubrique exacte de la rédaction avant son parent", () => {
    const links = [{ id: "desk", href: routes.mediaDesk("page-a") }, { id: "config", href: routes.mediaConfig("page-a") }, { id: "team", href: routes.mediaTeam("page-a") }]
    expect(activeSpecializedDestination("media", routes.mediaConfig("page-a"), links)).toBe("config")
    expect(activeSpecializedDestination("media", `${routes.mediaTeam("page-a")}/detail`, links)).toBe("team")
    expect(activeSpecializedDestination("media", routes.feed(), links)).toBeNull()
  })
})
