// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import { createAppI18n } from "../../i18n"
import { EngineTestWrapper, TEST_ROUTES } from "../../tests/engine-wrapper"
import { DailySpecialStoryCard, type DailySpecialStoryOffer } from "./DailySpecialStoryCard"
import { StoriesStyles } from "./stories-styles"

const OFFER: DailySpecialStoryOffer = {
  shopHandle: "epicerie/a", shopName: "Épicerie Démo", offerRef: "pro.ga:poisson/fume",
  title: "Poisson fumé", day: "2026-10-24", price: { mode: "fixed", amount: 3500, currency: "XAF" },
}
const SHOP_ROUTES = { ...TEST_ROUTES, shopOffer: (handle: string, ref: string) => `/boutique/${encodeURIComponent(handle)}/offres/${encodeURIComponent(ref)}` }
const normalise = (text: string | null) => text?.replace(/\s/g, " ")

function card({ offer = OFFER, locale = "fr", withRoute = true, children }: { offer?: DailySpecialStoryOffer; locale?: "fr" | "en"; withRoute?: boolean; children?: ReactNode } = {}) {
  const i18n = createAppI18n({ locale, appResources: { fr: {}, en: {} }, defaultNS: "stories" })
  return render(<EngineTestWrapper routes={withRoute ? SHOP_ROUTES : TEST_ROUTES}><I18nextProvider i18n={i18n}><StoriesStyles />{children ?? <DailySpecialStoryCard offer={offer} />}</I18nextProvider></EngineTestWrapper>)
}

describe("DailySpecialStoryCard — offre courante et destination injectée", () => {
  it.each(["fr", "en"] as const)("identifie le plat et sa boutique, avec prix exact et vraie fiche (%s)", locale => {
    card({ locale })
    expect(screen.getByRole("heading", { name: OFFER.title })).toBeInTheDocument()
    expect(screen.getByText(OFFER.shopName)).toBeInTheDocument()
    expect(screen.getByText(locale === "fr" ? "Plat du jour" : "Dish of the day")).toBeInTheDocument()
    expect(screen.getByText(locale === "fr" ? "Jusqu’à minuit à Libreville" : "Until midnight in Libreville")).toBeInTheDocument()
    const link = screen.getByRole("link", { name: locale === "fr" ? "Commander" : "Order" })
    expect(link).toHaveAttribute("href", "/boutique/epicerie%2Fa/offres/pro.ga%3Apoisson%2Ffume")
    expect(normalise(document.querySelector(".st-daily-special-price")?.textContent ?? null)).toBe(locale === "fr" ? "3 500 XAF" : "XAF 3,500")
    expect(getComputedStyle(link).minHeight).toBe("44px")
    expect(getComputedStyle(link).minWidth).toBe("44px")
  })

  it("une fourchette conserve ses deux montants et son unité", () => {
    card({ offer: { ...OFFER, price: { mode: "range", minAmount: 2500, maxAmount: 3500, currency: "XAF", unit: "portion" } } })
    expect(normalise(document.querySelector(".st-daily-special-price")?.textContent ?? null)).toBe("De 2 500 XAF à 3 500 XAF / portion")
  })

  it("un tarif unitaire garde son unité et un montant nul ne devient pas un devis", () => {
    const view = card({ offer: { ...OFFER, price: { mode: "unit", amount: 1500, currency: "XAF", unit: "assiette" } } })
    expect(normalise(document.querySelector(".st-daily-special-price")?.textContent ?? null)).toBe("1 500 XAF / assiette")
    view.unmount()
    card({ offer: { ...OFFER, price: { mode: "fixed", amount: 0, currency: "XAF" } } })
    expect(normalise(document.querySelector(".st-daily-special-price")?.textContent ?? null)).toBe("0 XAF")
  })

  it.each(["fr", "en"] as const)("un devis reste sans montant inventé (%s)", locale => {
    card({ locale, offer: { ...OFFER, price: { mode: "quote", currency: "XAF" } } })
    expect(screen.getByText(locale === "fr" ? "Sur devis" : "On request")).toBeInTheDocument()
    expect(document.querySelector(".st-daily-special-price")?.textContent).not.toMatch(/\d/)
  })

  it("sans capacité de route, rend les faits sans lien de commande inventé", () => {
    card({ withRoute: false })
    expect(screen.getByRole("heading", { name: OFFER.title })).toBeInTheDocument()
    expect(screen.queryByRole("link")).toBeNull()
  })

  it("ne laisse ni le pointeur ni les flèches de la carte engager la scène, mais conserve Échap", () => {
    const down = vi.fn(), up = vi.fn(), move = vi.fn(), click = vi.fn(), key = vi.fn()
    card({ children: <div role="presentation" onPointerDown={down} onPointerUp={up} onPointerMove={move} onClick={click} onKeyDown={key}><DailySpecialStoryCard offer={OFFER} /></div> })
    const link = screen.getByRole("link", { name: "Commander" })
    link.addEventListener("click", event => event.preventDefault())
    fireEvent.pointerDown(link)
    fireEvent.pointerMove(link)
    fireEvent.pointerUp(link)
    fireEvent.click(link)
    for (const value of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown"]) fireEvent.keyDown(link, { key: value })
    expect(down).not.toHaveBeenCalled(); expect(up).not.toHaveBeenCalled(); expect(move).not.toHaveBeenCalled(); expect(click).not.toHaveBeenCalled(); expect(key).not.toHaveBeenCalled()
    fireEvent.keyDown(link, { key: "Escape" })
    expect(key).toHaveBeenCalledOnce()
  })

  it("annonce la pause au focus sans reprendre quand le focus reste dans la carte", () => {
    const focused = vi.fn()
    card({ children: <DailySpecialStoryCard offer={OFFER} onFocusWithinChange={focused} /> })
    const link = screen.getByRole("link", { name: "Commander" })
    const article = screen.getByRole("article")
    fireEvent.focus(link)
    expect(focused).toHaveBeenLastCalledWith(true)
    fireEvent.blur(link, { relatedTarget: article })
    expect(focused).toHaveBeenCalledTimes(1)
    fireEvent.blur(link, { relatedTarget: document.body })
    expect(focused).toHaveBeenLastCalledWith(false)
  })
})
