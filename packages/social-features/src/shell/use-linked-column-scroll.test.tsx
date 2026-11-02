// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useLinkedColumnScroll } from "./use-linked-column-scroll"

function Columns({ enabled = true }: { enabled?: boolean }) {
  const { centerRef, contextRef, composerRef, toolsRef } = useLinkedColumnScroll(enabled)
  return <><div ref={centerRef} data-testid="center"><div ref={composerRef} /><section ref={toolsRef} /><div className="fil-imm-scroller" data-testid="immersion" /><textarea data-testid="input" /></div><aside ref={contextRef} data-testid="context" /><nav data-testid="menu" /></>
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function setup(enabled = true) {
  const result = render(<Columns enabled={enabled} />)
  const center = screen.getByTestId("center")
  const context = screen.getByTestId("context")
  Object.defineProperties(context, { clientHeight: { configurable: true, value: 500 }, scrollHeight: { configurable: true, value: 900 } })
  const scrollCenter = (top: number) => { center.scrollTop = top; fireEvent.scroll(center) }
  return { ...result, center, context, scrollCenter }
}

describe("lecture des trois compartiments", () => {
  it("entraîne le contexte puis s'arrête à sa dernière carte pendant que le fil continue", () => {
    const { center, context, scrollCenter } = setup()
    scrollCenter(160)
    expect(context.scrollTop).toBe(160)
    scrollCenter(800)
    expect(context.scrollTop).toBe(400)
    scrollCenter(1600)
    expect(center.scrollTop).toBe(1600)
    expect(context.scrollTop).toBe(400)
    // La remontée répond immédiatement, sans absorber 1 200 px de vide.
    scrollCenter(1500)
    expect(context.scrollTop).toBe(300)
    expect(screen.getByTestId("menu").scrollTop).toBe(0)
  })

  it("laisse le contexte se lire seul et reprend depuis sa position choisie", () => {
    const { center, context, scrollCenter } = setup()
    context.scrollTop = 220
    fireEvent.scroll(context)
    expect(center.scrollTop).toBe(0)
    scrollCenter(60)
    expect(context.scrollTop).toBe(280)
    scrollCenter(0)
    expect(context.scrollTop).toBe(220)
  })

  it("ne déplace ni un contexte court ni un rail masqué sur tablette", () => {
    const { context, scrollCenter } = setup()
    Object.defineProperty(context, "scrollHeight", { value: 300, configurable: true })
    scrollCenter(200)
    expect(context.scrollTop).toBe(0)
    Object.defineProperty(context, "clientHeight", { value: 0, configurable: true })
    context.scrollTop = 70
    scrollCenter(300)
    expect(context.scrollTop).toBe(70)
  })

  it("préserve le comportement historique sans opt-in", () => {
    const { center, context, scrollCenter } = setup(false)
    scrollCenter(100)
    expect(context.scrollTop).toBe(0)
    expect(center.style.getPropertyValue("--rp-composer-height")).toBe("")
  })

  it("suit le lecteur Immersion mais ignore le défilement d'un champ de saisie", () => {
    const { center, context } = setup()
    const immersion = screen.getByTestId("immersion")
    immersion.scrollTop = 150
    fireEvent.scroll(immersion)
    expect(context.scrollTop).toBe(150)
    expect(center.scrollTop).toBe(0)
    const input = screen.getByTestId("input")
    input.scrollTop = 60
    fireEvent.scroll(input)
    expect(context.scrollTop).toBe(150)
  })

  it("actualise les hauteurs d'en-tête après redimensionnement et nettoie l'abonnement", () => {
    let resize: ResizeObserverCallback | undefined
    const disconnect = vi.fn()
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) { resize = callback }
      observe = vi.fn()
      disconnect = disconnect
    })
    const { center, context, scrollCenter, unmount } = setup()
    const composer = center.firstElementChild!
    vi.spyOn(composer, "getBoundingClientRect").mockReturnValue({ height: 140 } as DOMRect)
    resize?.([], {} as ResizeObserver)
    expect(center.style.getPropertyValue("--rp-composer-height")).toBe("140px")
    unmount()
    scrollCenter(200)
    expect(context.scrollTop).toBe(0)
    expect(disconnect).toHaveBeenCalledOnce()
    expect(center.style.getPropertyValue("--rp-composer-height")).toBe("")
  })
})
