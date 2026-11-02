// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { StoriesStyles } from "./stories-styles"

describe("stories — géométrie des médaillons", () => {
  it("garde les cartes historiques et applique les mesures du canevas aux seuls médaillons", () => {
    const view = render(<>
      <StoriesStyles />
      <div className="st-tray" data-presentation="cards"><button className="st-tray-tile" /></div>
      <div className="st-tray" data-presentation="rings"><button className="st-tray-tile"><span className="st-ring-tile"><span className="st-tray-ring"><span className="st-tray-disc" /></span></span><span className="st-ring-name" /></button></div>
    </>)
    const cards = view.container.querySelector<HTMLElement>('[data-presentation="cards"]')!
    const rings = view.container.querySelector<HTMLElement>('[data-presentation="rings"]')!
    expect(getComputedStyle(cards).gap).toBe("8px")
    expect(getComputedStyle(cards.querySelector("button")!).width).toBe("112px")
    expect(getComputedStyle(rings).gap).toBe("10px")
    expect(getComputedStyle(rings).padding).toBe("4px 2px 8px")
    const ring = getComputedStyle(rings.querySelector(".st-tray-ring")!)
    expect([ring.width, ring.height, ring.padding]).toEqual(["60px", "60px", "2.5px"])
    expect(getComputedStyle(rings.querySelector(".st-tray-disc")!).borderWidth).toBe("2.5px")
    const name = getComputedStyle(rings.querySelector(".st-ring-name")!)
    expect([name.maxWidth, name.fontSize]).toEqual(["64px", "12px"])
  })

  it("sépare la pastille de 22 px de sa cible interactive de 44 px", () => {
    const view = render(<>
      <StoriesStyles />
      <div className="st-tray" data-presentation="rings"><span className="st-ring-self"><button type="button" aria-label="Créer une actu" className="st-ring-plus-button"><span className="st-ring-plus" /></button></span></div>
    </>)
    const own = getComputedStyle(view.container.querySelector(".st-ring-self")!)
    expect([own.width, own.height]).toEqual(["60px", "60px"])
    const target = view.getByRole("button", { name: "Créer une actu" })
    const button = getComputedStyle(target)
    expect([button.width, button.height, button.boxSizing]).toEqual(["44px", "44px", "border-box"])
    expect([button.position, button.right, button.bottom]).toEqual(["absolute", "-13px", "-13px"])
    expect(button.backgroundColor).toBe("rgba(0, 0, 0, 0)")
    expect(button.borderStyle).toBe("none")
    target.focus()
    expect(target).toHaveFocus()
    // React 19 hisse cette feuille (href/precedence) dans head.
    const css = [...document.querySelectorAll("style")].map((sheet) => sheet.textContent).join("\n")
    expect(css).toMatch(/\.st-ring-plus-button:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--ring\);[^}]*outline-offset:\s*3px;/)
    expect(css).not.toContain(".st-ring-plus-button::before")
    const mark = getComputedStyle(view.container.querySelector(".st-ring-plus")!)
    expect([mark.width, mark.height]).toEqual(["22px", "22px"])
    expect(mark.pointerEvents).toBe("none")
    expect(mark.boxSizing).toBe("border-box")
    expect([mark.right, mark.bottom]).toEqual(["11px", "11px"])
    // Le bord visuel est inchangé : -13 px du bouton + 11 px de son enfant = -2 px.
    expect(parseFloat(button.right) + parseFloat(mark.right)).toBe(-2)
  })
})
