import { describe, expect, it } from "vitest"

import {
  isSocialReturnPath,
  engineRoutes,
  offerSelectionFromSearch,
  memberDestinationFor,
  routes,
  specializedDestinationFromLocation,
  specializedDestinationFromSearch,
  specializedDestinationPath,
  specializedShopRoute,
} from "./routes"

const handle = "atelier.ndong"
const offerRef = "pro.ga:offer:01ARZ3NDEKTSV4RRFFQ69G5FAV"
const offer = { kind: "offer" as const, handle, offerRef }

describe("MP01 — routes des espaces spécialisés", () => {
  it("injecte la vraie fiche d'offre dans le lecteur partagé des Stories", () => {
    expect(engineRoutes.shopOffer?.("atelier/partagé", offerRef)).toBe(routes.shopOffer("atelier/partagé", offerRef))
    expect(engineRoutes.shopOffer?.(handle, offerRef)).toContain("pro.ga%3Aoffer%3A")
  })
  it("garde les adresses historiques et reconnaît leurs usages métier", () => {
    expect(routes.storefront(handle)).toBe("/boutique/atelier.ndong")
    expect(routes.publicStorefront(handle)).toBe("/boutiques/atelier.ndong")
    const examples = [
      [routes.storefront(handle), "home"],
      [routes.shopCatalog(handle), "catalog"],
      [routes.shopOffer(handle, offerRef), "offer"],
      [routes.serviceQuote(handle, offerRef), "service"],
      [routes.serviceBooking(handle, offerRef), "service"],
      [routes.serviceOrder(handle, offerRef), "service"],
      [routes.checkoutPrepare(handle, offerRef), "checkout"],
      [routes.shopJobs(handle), "jobs"],
      [routes.shopJob(handle, "job-a"), "jobs"],
      [routes.shopContact(handle), "contact"],
    ] as const
    for (const [href, section] of examples) expect(specializedShopRoute(href)).toEqual({ handle, section })
  })

  it("MP06 : conserve les pages prestataire et leur consultation après connexion", () => {
    const examples = [
      [{ kind: "provider" as const, handle }, routes.provider(handle), "home"],
      [{ kind: "provider_catalog" as const, handle }, routes.providerCatalog(handle), "catalog"],
      [{ kind: "service_offer" as const, handle, offerRef }, routes.providerOffer(handle, offerRef), "offer"],
    ] as const
    for (const [destination, href, section] of examples) {
      const url = new URL(href, "https://example.test")
      expect(specializedShopRoute(url.pathname)).toEqual({ handle, section, provider: true })
      expect(specializedDestinationFromLocation(url.pathname, url.search)).toEqual(destination)
      expect(specializedDestinationPath(destination)).toBe(href)
      const login = new URL(routes.signIn(undefined, undefined, undefined, undefined, destination), url)
      expect(specializedDestinationFromSearch(Object.fromEntries(login.searchParams))).toEqual(destination)
    }
    for (const href of [routes.publicProvider(handle), routes.publicProviderCatalog(handle), routes.publicProviderOffer(handle, offerRef)]) expect(specializedShopRoute(href)).toBeNull()
    for (const payload of [{ kind: "service_offer", handle, offerRef, quantity: 1 }, { kind: "service_offer", handle, offerRef, variantRef: "pro.ga:offer_variant:01ARZ3NDEKTSV4RRFFQ69G5FAV" }, { kind: "provider", handle, action: "booking" }]) expect(specializedDestinationPath(payload)).toBeUndefined()
    for (const path of ["/prestataire/atelier/offres", "/prestataire/atelier/prestations/secret", "/prestataire/atelier%2Fautre", "/prestataire/atelier/offres/a%2Fb"]) expect(specializedShopRoute(path)).toBeNull()
  })

  it("ne transforme ni les outils de gestion ni les portes publiques en coque membre", () => {
    for (const href of [
      routes.feed(), routes.memberDiscover(), routes.myShops(), routes.shopEditor("shop-a"),
      routes.myOrders(), routes.checkoutAttempt("attempt-a"), routes.paymentList(),
      routes.paymentReturn("attempt-a"), routes.serviceRequests(), routes.myApplications(),
      routes.publicStorefront(handle), routes.publicShopCatalog(handle), routes.publicShopOffer(handle, offerRef),
    ]) expect(specializedShopRoute(href)).toBeNull()
  })

  it.each([
    "/boutique/", "/boutique//", "/boutique/.", "/boutique/..", "/boutique/%2e", "/boutique/%2E%2E",
    "/boutique/atelier%2Fautre", "/boutique/atelier%5Cautre", "/boutique/atelier%00", "/boutique/atelier%0a",
    "/boutique/atelier%20ndong", "/boutique/atelier%", "/boutique/atelier/catalogue/autre",
    "/boutique/atelier/contacter/autre", "/boutique/atelier/offres", "/boutique/atelier/inconnu",
    "/boutique/atelier/offres/%2e%2e", "/boutique/atelier/offres/a%2Fb", "/boutique/atelier/offres/a%00b",
    "/boutique/atelier/offres/a/b", "/boutique/atelier?retour=https://example.test",
  ])("refuse un chemin malformé : %s", (href) => {
    expect(specializedShopRoute(href)).toBeNull()
    expect(specializedDestinationFromLocation(href)).toBeUndefined()
  })

  it("restaure une consultation après connexion sans rejouer un engagement", () => {
    expect(specializedDestinationFromLocation(routes.storefront(handle))).toEqual({ kind: "storefront", handle })
    expect(specializedDestinationFromLocation(routes.shopCatalog(handle))).toEqual({ kind: "catalog", handle })
    expect(specializedDestinationFromLocation(routes.shopOffer(handle, offerRef))).toEqual(offer)
    for (const href of [routes.checkoutPrepare(handle, offerRef), routes.serviceQuote(handle, offerRef), routes.serviceBooking(handle, offerRef), routes.serviceOrder(handle, offerRef), routes.shopContact(handle)]) {
      const continuation = specializedDestinationFromLocation(href)
      expect(continuation).toEqual({ kind: "storefront", handle })
      expect(specializedDestinationPath(continuation)).toBe(routes.storefront(handle))
    }
  })

  it("construit seulement les trois destinations de consultation connues", () => {
    expect(specializedDestinationPath({ kind: "storefront", handle })).toBe(routes.storefront(handle))
    expect(specializedDestinationPath({ kind: "catalog", handle })).toBe(routes.shopCatalog(handle))
    expect(specializedDestinationPath(offer)).toBe(routes.shopOffer(handle, offerRef))
    for (const input of [undefined, { kind: "checkout", handle, offerRef }, { kind: "storefront", handle: ".." }, { kind: "offer", handle, offerRef, returnTo: "https://example.test" }]) expect(specializedDestinationPath(input)).toBeUndefined()
  })

  it("conserve la consultation des offres réelles du jeu démo dans la même porte typée", () => {
    const demoOffer = { kind: "offer" as const, handle: "atelier-demo", offerRef: "demo:offer:veste-lin-bleu" }
    const href = routes.shopOffer(demoOffer.handle, demoOffer.offerRef)
    expect(specializedShopRoute(href)).toEqual({ handle: demoOffer.handle, section: "offer" })
    expect(specializedDestinationFromLocation(href)).toEqual(demoOffer)
    expect(specializedDestinationPath(demoOffer)).toBe(href)
    const signIn = new URL(routes.signIn(undefined, undefined, undefined, undefined, demoOffer), "https://example.test")
    expect(specializedDestinationFromSearch(Object.fromEntries(signIn.searchParams))).toEqual(demoOffer)
    expect(specializedDestinationFromLocation(routes.checkoutPrepare(demoOffer.handle, demoOffer.offerRef))).toEqual({ kind: "storefront", handle: demoOffer.handle })
    expect(specializedDestinationPath({ ...demoOffer, offerRef: "demo:offer:../autre" })).toBeUndefined()
  })
})

describe("MP01 — continuation de connexion et retour social fermés", () => {
  it("MP04 conserve les facettes de marketplace au retour sans ouvrir des paramètres libres", () => {
    const href = routes.marketplace({ view: "products", category: ["fashion.women", "fashion.men"], material: ["Lin", "Coton"], minPrice: 2500 })
    expect(isSocialReturnPath(href)).toBe(true)
    const current = new URL(href, "https://example.test")
    expect(memberDestinationFor(current.pathname, current.searchParams)).toEqual({ id: "decouvrir", current: "section" })
    expect(isSocialReturnPath(routes.marketplace({ view: "services", serviceMode: ["remote"] }))).toBe(true)
    expect(isSocialReturnPath(`${href}&retour=https%3A%2F%2Fexample.test`)).toBe(false)
    expect(isSocialReturnPath(`${href}&vue=services`)).toBe(false)
    expect(isSocialReturnPath(`${routes.marketplace()}&categorie=private-unknown`)).toBe(false)
  })
  it("conserve les anciennes entrées sans ajouter de paramètre", () => {
    expect(routes.signIn()).toBe("/entrer")
    expect(routes.signIn("sign-up")).toBe("/entrer?inscription=1")
    expect(routes.welcome()).toBe("/bienvenue")
    expect(routes.signIn(undefined, "post-a")).toBe("/entrer?publication=post-a")
  })

  it("relit une intention de consultation typée aux deux portes", () => {
    const signIn = new URL(routes.signIn(undefined, undefined, undefined, undefined, offer), "https://example.test")
    const welcome = new URL(routes.welcome(undefined, undefined, undefined, offer), "https://example.test")
    for (const url of [signIn, welcome]) {
      expect(specializedDestinationFromSearch(Object.fromEntries(url.searchParams))).toEqual(offer)
      expect([...url.searchParams.keys()]).toEqual(["espaceType", "espaceBoutique", "espaceOffre"])
    }
  })

  it("garde la priorité publication, notification puis contact sur l'espace", () => {
    const contact = { kind: "shop_contact" as const, handle, offerRef }
    const cases = [
      [routes.signIn(undefined, "post-a", "notice-a", contact, offer), routes.signIn(undefined, "post-a")],
      [routes.signIn(undefined, undefined, "notice-a", contact, offer), routes.signIn(undefined, undefined, "notice-a")],
      [routes.signIn(undefined, undefined, undefined, contact, offer), routes.signIn(undefined, undefined, undefined, contact)],
      [routes.welcome("post-a", "notice-a", contact, offer), routes.welcome("post-a")],
      [routes.welcome(undefined, "notice-a", contact, offer), routes.welcome(undefined, "notice-a")],
      [routes.welcome(undefined, undefined, contact, offer), routes.welcome(undefined, undefined, contact)],
    ]
    for (const [actual, previous] of cases) expect(actual).toBe(previous)
  })

  it.each([
    { espaceType: ["storefront", "offer"], espaceBoutique: handle },
    { espaceType: "storefront", espaceBoutique: [handle, "autre"] },
    { espaceType: "offer", espaceBoutique: handle, espaceOffre: [offerRef, offerRef] },
    { espaceType: "storefront", espaceBoutique: "../autre" },
    { espaceType: "storefront", espaceBoutique: ".." },
    { espaceType: "storefront", espaceBoutique: "https://example.test" },
    { espaceType: "offer", espaceBoutique: handle, espaceOffre: "https://example.test" },
    { espaceType: "preparer", espaceBoutique: handle, espaceOffre: offerRef },
  ])("refuse les paramètres répétés, les actes et les destinations arbitraires", (search) => {
    expect(specializedDestinationFromSearch(search)).toBeUndefined()
  })

  it("admet seulement des origines sociales et leurs filtres publics connus", () => {
    for (const href of [routes.feed(), routes.memberPost("post-a"), routes.nationalFeed(), routes.memberTag("mode"), `${routes.memberDiscover()}?q=mode#boutiques`, routes.clips("awa.demo"), routes.stories(), routes.profile("awa.demo"), routes.page(handle)]) expect(isSocialReturnPath(href)).toBe(true)
  })

  it.each([
    "https://example.test", "//example.test/fil", "javascript:alert(1)", "/\\example.test/fil", "/fil\n",
    "/fil?retour=https://example.test", "/fil?post=a&post=b", "/explorer?q=a&q=b", "/fil?token=secret",
    "/fil?contact=secret", "/rencontres?preferences=secret", "/messages/secret", "/mes-paiements/secret",
    "/boutique/atelier", "/profil/..", "/page/atelier%2Fautre", "/fil/../fil", "/fil?post=%0a",
    `/fil?tag=${"a".repeat(1025)}`, `/explorer#${"a".repeat(161)}`,
  ])("refuse un retour externe, privé ou ambigu : %s", (href) => {
    expect(isSocialReturnPath(href)).toBe(false)
  })
})


describe("MP05 — reprise de sélection sans achat implicite", () => {
  const variantRef = "pro.ga:offer_variant:01JA00000000000000000000V1"
  it("transmet variante et quantité à travers connexion et consultation seulement", () => {
    const destination = { ...offer, variantRef, quantity: 2 }
    const url = new URL(routes.signIn(undefined, undefined, undefined, undefined, destination), "https://example.test")
    expect(specializedDestinationFromSearch(Object.fromEntries(url.searchParams))).toEqual(destination)
    const member = new URL(specializedDestinationPath(destination)!, "https://example.test")
    expect(member.pathname).toBe(routes.shopOffer(handle, offerRef))
    expect([...member.searchParams.keys()]).toEqual(["variante", "quantite"])
    expect(offerSelectionFromSearch(handle, offerRef, Object.fromEntries(member.searchParams))).toEqual({ variantRef, quantity: 2 })
    expect(specializedDestinationFromLocation(member.pathname, member.search)).toEqual(destination)
    expect(routes.publicShopOffer(handle, offerRef, { variantRef, quantity: 2 })).toContain("?variante=")
  })
  it.each(["0", "1000", "1.5", "01", "NaN", ["1", "2"]])("refuse la quantité malformée %s", quantity => {
    expect(specializedDestinationFromSearch({ espaceType: "offer", espaceBoutique: handle, espaceOffre: offerRef, espaceQuantite: quantity })).toBeUndefined()
  })
  it("refuse références étrangères, paramètres répétés et actes automatiques", () => {
    expect(offerSelectionFromSearch(handle, offerRef, { variante: "pro.ga:offer:01JA00000000000000000000V1" })).toBeUndefined()
    expect(offerSelectionFromSearch(handle, offerRef, { variante: [variantRef, variantRef] })).toBeUndefined()
    expect(offerSelectionFromSearch(handle, offerRef, { variante: variantRef, acheter: "1" })).toBeUndefined()
    expect(specializedDestinationFromSearch({ espaceType: "storefront", espaceBoutique: handle, espaceVariante: variantRef })).toBeUndefined()
  })
})
