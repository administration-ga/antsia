// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MobileNavigationViewport, usePhoneNavigation } from "./mobile-navigation-viewport"

class Viewport extends EventTarget {
  height = 800
  offsetTop = 0
  scale = 1
}

let viewport: Viewport
let root: Root
let host: HTMLDivElement
const originalViewport = Object.getOwnPropertyDescriptor(window, "visualViewport")

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  viewport = new Viewport()
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport })
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 })
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  document.documentElement.removeAttribute("data-antsia-nav-keyboard")
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  if (originalViewport) Object.defineProperty(window, "visualViewport", originalViewport)
  else Reflect.deleteProperty(window, "visualViewport")
  document.documentElement.removeAttribute("data-antsia-nav-keyboard")
  document.documentElement.style.removeProperty("--vv-height")
  document.documentElement.style.removeProperty("--kb-inset")
  vi.unstubAllGlobals()
})

async function render() {
  await act(async () => root.render(<><MobileNavigationViewport /><input aria-label="Recherche" /><button type="button">Terminer</button></>))
}
const hidden = () => document.documentElement.hasAttribute("data-antsia-nav-keyboard")

describe("dock et clavier virtuel", () => {
  it("ne disparaît pas au défilement ni à une réduction de fenêtre sans saisie", async () => {
    await render()
    viewport.height = 400
    await act(async () => viewport.dispatchEvent(new Event("resize")))
    expect(hidden()).toBe(false)
    await act(async () => viewport.dispatchEvent(new Event("scroll")))
    expect(hidden()).toBe(false)
  })

  it("se retire pendant la saisie avec clavier puis revient sans toucher les variables des overlays", async () => {
    document.documentElement.style.setProperty("--vv-height", "777px")
    document.documentElement.style.setProperty("--kb-inset", "23px")
    await render()
    await act(async () => host.querySelector("input")!.focus())
    viewport.height = 420
    await act(async () => viewport.dispatchEvent(new Event("resize")))
    expect(hidden()).toBe(true)
    expect(document.documentElement.style.getPropertyValue("--vv-height")).toBe("777px")
    expect(document.documentElement.style.getPropertyValue("--kb-inset")).toBe("23px")
    await act(async () => host.querySelector("button")!.focus())
    expect(hidden()).toBe(false)
  })

  it("respecte l'agrandissement et nettoie ses propres effets au démontage", async () => {
    await render()
    await act(async () => host.querySelector("input")!.focus())
    viewport.height = 400
    viewport.scale = 2
    await act(async () => viewport.dispatchEvent(new Event("resize")))
    expect(hidden()).toBe(false)
    viewport.scale = 1
    await act(async () => viewport.dispatchEvent(new Event("resize")))
    expect(hidden()).toBe(true)
    await act(async () => root.render(<p>Autre écran</p>))
    expect(hidden()).toBe(false)
    viewport.height = 300
    viewport.dispatchEvent(new Event("resize"))
    expect(hidden()).toBe(false)
  })

  it("revient quand une navigation retire le champ actif sans événement de clavier", async () => {
    await render()
    await act(async () => host.querySelector("input")!.focus())
    viewport.height = 420
    await act(async () => viewport.dispatchEvent(new Event("resize")))
    expect(hidden()).toBe(true)
    await act(async () => root.render(<><MobileNavigationViewport /><p>Page suivante</p></>))
    expect(hidden()).toBe(false)
  })

  it("garde un repli sans visualViewport et réserve le repère au téléphone", async () => {
    Object.defineProperty(window, "visualViewport", { configurable: true, value: undefined })
    Object.defineProperty(window, "matchMedia", { configurable: true, value: undefined })
    function Probe() { return <span data-phone={usePhoneNavigation()} /> }
    await act(async () => root.render(<><MobileNavigationViewport /><Probe /></>))
    expect(host.querySelector("span")?.getAttribute("data-phone")).toBe("true")
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 834 })
    await act(async () => window.dispatchEvent(new Event("resize")))
    expect(host.querySelector("span")?.getAttribute("data-phone")).toBe("false")
    expect(hidden()).toBe(false)
  })
})
