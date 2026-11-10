import { resolveEngineNavigation } from "@antsia/api/network"
import { describe, expect, it } from "vitest"
import { analyticsCaptureEndpoint, engineRoutes, isLiveSessionPath, memberDestinationFor, routes, usageScreenForPath } from "./routes"

describe("routes et mesure facultative", () => {
  it("encode chaque segment public et chaque filtre adressable", () => {
    expect(routes.publicProfile("a/b?c")).toBe("/@a%2Fb%3Fc")
    expect(routes.publicAlbum("a/b", "x?y")).toBe("/@a%2Fb/albums/x%3Fy")
    expect(routes.officialPage("a/b")).toBe("/pages/a%2Fb")
    expect(routes.publication("x/y")).toBe("/publications/x%2Fy")
    expect(routes.shopEditor("x/y?z")).toBe("/mes-boutiques/x%2Fy%3Fz")
    expect(routes.storefront("x/y?z")).toBe("/boutique/x%2Fy%3Fz")
    expect(routes.publicStorefront("x/y?z")).toBe("/boutiques/x%2Fy%3Fz")
    expect(routes.checkoutPrepare("x/y?z", "offer/a?b")).toBe("/boutique/x%2Fy%3Fz/preparer/offer%2Fa%3Fb")
    expect(routes.checkoutAttempt("x/y?z")).toBe("/mes-commandes/x%2Fy%3Fz")
    expect(routes.paymentAttempt("x/y?z")).toBe("/mes-paiements/x%2Fy%3Fz")
    expect(routes.paymentReturn("x/y?z")).toBe("/mes-paiements/x%2Fy%3Fz/retour")
    expect(routes.cart()).toBe("/panier")
    expect(routes.purchases()).toBe("/mes-achats")
    expect(routes.purchase("x/y?z")).toBe("/mes-achats/x%2Fy%3Fz")
    expect(routes.savedOffers()).toBe("/mes-favoris")
    expect(routes.tag("école & mer")).toBe("/tags/%C3%A9cole%20%26%20mer")
    const tag = new URL(routes.memberTag("école & mer"), "https://example.test")
    expect(tag.searchParams.get("tag")).toBe("école & mer")
    expect(tag.searchParams.get("portee")).toBe("national")
    const province = new URL(routes.memberProvince("haut-ogooue"), "https://example.test")
    expect(province.searchParams.get("province")).toBe("haut-ogooue")
    expect(province.searchParams.get("portee")).toBe("province")
  })
  it("garde les routes de membre et les portes publiques distinctes", () => {
    expect(routes.publicProfile("awa")).not.toBe(routes.profile("awa"))
    expect(routes.officialPage("radio")).not.toBe(routes.page("radio"))
    expect(engineRoutes.profile("awa")).toBe(routes.profile("awa"))
    expect(engineRoutes.page("radio")).toBe(routes.page("radio"))
    expect(engineRoutes.post?.("x/y?z")).toBe(routes.memberPost("x/y?z"))
    expect(new URL(engineRoutes.post!("x/y?z"), "https://example.test").searchParams.get("post")).toBe("x/y?z")
    expect(routes.authSession()).toBe("/api/auth/get-session")
    expect(routes.publicSessionBridge()).toBe("/api/session-bridge")
    expect(routes.publicStorefront("atelier")).not.toBe(routes.storefront("atelier"))
    expect(routes.shopDirectory()).toBe(`${routes.memberDiscover()}#boutiques`)
    expect(routes.shopLinkCallback()).toBe("/mes-boutiques/liaison/retour")
  })
  it("l'inscription conserve la vraie porte d'authentification et un geste explicite", () => {
    expect(routes.signIn()).toBe("/entrer")
    expect(routes.signIn("sign-up")).toBe("/entrer?inscription=1")
    expect(routes.signedOut(true)).toBe("/entrer?deconnexion=incomplete")
  })
  it("la vue des recours réseau ne transporte jamais un filtre d'équipe", () => {
    const appeal = new URL(routes.moderationView("appeals", "foreign", "opaque"), "https://example.test")
    expect(appeal.searchParams.get("vue")).toBe("appeals")
    expect(appeal.searchParams.has("equipe")).toBe(false)
    expect(appeal.searchParams.get("curseur")).toBe("opaque")
  })
  it("MC-02 : la vue des réglages de modération ne transporte jamais un filtre d'équipe", () => {
    const settings = new URL(routes.moderationView("settings", "foreign", "opaque"), "https://example.test")
    expect(settings.pathname).toBe(routes.moderation())
    expect(settings.searchParams.get("vue")).toBe("settings")
    expect(settings.searchParams.has("equipe")).toBe(false)
  })
  it("les réglages du moteur (rail, menu, rappel du profil) mènent à la page Paramètres, rangée sous Profil", () => {
    expect(engineRoutes.settings?.()).toBe(routes.settings())
    expect(routes.settings()).not.toBe(routes.personalControls())
    expect(memberDestinationFor(routes.settings(), new URLSearchParams(""))).toEqual({ id: "profil", current: "section" })
  })
  it("projette seulement des catégories, sans identifiants privés", () => {
    expect(usageScreenForPath(routes.profile("private.handle"))).toBe("profile")
    expect(usageScreenForPath(routes.conference("secret-id"))).toBe("conference")
    expect(usageScreenForPath(`${routes.messages()}/private-id`)).toBe("messages")
    expect(usageScreenForPath(routes.signIn())).toBeNull()
    expect(usageScreenForPath(routes.welcome())).toBeNull()
    expect(usageScreenForPath("/unknown/private-id")).toBeNull()
  })
  it("refuse des hosts qui ne sont pas des origines HTTPS pures", () => {
    expect(analyticsCaptureEndpoint("https://usage.example.test")).toBe("https://usage.example.test/i/v0/e/")
    for (const host of [undefined, "", "http://usage.example.test", "https://user@usage.example.test", "https://usage.example.test/path", "https://usage.example.test?x=1", "https://usage.example.test#x", " https://usage.example.test"]) expect(analyticsCaptureEndpoint(host)).toBeNull()
  })
})

describe("navigation par destinations (P02)", () => {
  /** Une requête lue comme la lit la coque (`useSearchParams`). */
  const query = (search: string) => new URLSearchParams(search)

  it("sert les deux destinations propres de l'application, déclarées au moteur", () => {
    expect(routes.memberDiscover()).toBe("/explorer")
    expect(routes.me()).toBe("/moi")
    expect(engineRoutes.discover?.()).toBe(routes.memberDiscover())
    expect(engineRoutes.me?.()).toBe(routes.me())
    // La déclaration de `NetworkShell` est donc RETENUE par le moteur.
    expect(resolveEngineNavigation("destinations", engineRoutes)).toBe("destinations")
  })

  it("Découvrir des membres n'entre pas en collision avec la découverte PUBLIQUE ni avec un profil public", () => {
    expect(routes.memberDiscover()).not.toBe(routes.discover())
    expect(routes.discover()).toBe("/decouvrir")
    // Un segment statique, jamais pris pour un identifiant public (`/@…`).
    expect(routes.memberDiscover().startsWith("/@")).toBe(false)
    expect(routes.me().startsWith("/@")).toBe(false)
    expect(routes.me()).not.toBe(routes.personalControls())
  })

  it("aucune mesure d'usage sur les nouvelles destinations : catégories fermées inchangées", () => {
    expect(usageScreenForPath(routes.memberDiscover())).toBeNull()
    expect(usageScreenForPath(routes.me())).toBeNull()
  })

  it("déclare au moteur l'alias `/direct/…` comme la page de la conférence", () => {
    expect(engineRoutes.conference("s 1")).toBe(routes.conference("s 1"))
    expect(engineRoutes.conferenceAliases?.("s 1")).toEqual([routes.direct("s 1")])
  })

  it("reconnaît les pages de direct, plein écran, sans confondre leur annuaire", () => {
    expect(isLiveSessionPath(routes.direct("s 1"))).toBe(true)
    expect(isLiveSessionPath(routes.conference("s1"))).toBe(true)
    expect(isLiveSessionPath(routes.direct(""))).toBe(false)
    expect(isLiveSessionPath(routes.feed())).toBe(false)
    expect(isLiveSessionPath(routes.me())).toBe(false)
  })

  it("range les pages que seule l'application connaît ; laisse le moteur ranger les autres", () => {
    for (const href of [routes.nationalFeed(), routes.memberProvince("nyanga"), routes.memberTag("école")]) {
      const url = new URL(href, "https://example.test")
      expect(memberDestinationFor(url.pathname, url.searchParams)).toEqual({ id: "decouvrir", current: "section" })
    }
    expect(memberDestinationFor(routes.feedPreferences(), query(""))).toEqual({ id: "profil", current: "section" })
    for (const href of [routes.cart(), routes.purchases(), routes.purchase("private-purchase"), routes.savedOffers()]) expect(memberDestinationFor(href, query(""))).toEqual({ id: "profil", current: "section" })
    expect(memberDestinationFor(routes.moderation(), query("vue=reports"))).toEqual({ id: "profil", current: "section" })
    for (const href of [routes.myShops(), routes.shopEditor("shop-id"), routes.myOrders(), routes.checkoutAttempt("attempt-id"), routes.paymentList(), routes.paymentAttempt("payment-id"), routes.paymentReturn("payment-id")]) {
      expect(memberDestinationFor(href, query(""))).toEqual({ id: "profil", current: "section" })
    }
    expect(memberDestinationFor(routes.storefront("atelier"), query(""))).toEqual({ id: "decouvrir", current: "section" })
    expect(memberDestinationFor(routes.publicStorefront("atelier"), query(""))).toBeUndefined()
    for (const href of [routes.feed(), routes.memberDiscover(), routes.me(), routes.profile("awa"), routes.page("radio"), routes.messages()]) {
      expect(memberDestinationFor(href, query(""))).toBeUndefined()
    }
    expect(memberDestinationFor(routes.feed(), query("tab=groupes"))).toBeUndefined()
  })
})
