// @vitest-environment jsdom
// Correctif responsive : scénarios écrits, exécution après le codegen central.
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useLayoutEffect, useRef } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => true,
}))

import { VerticalPager } from "./VerticalPager"

const ITEMS = ["A", "B", "C"]
function pager(index: number, onChange = vi.fn(), items = ITEMS) {
  return <VerticalPager items={items} index={index} onIndexChange={onChange} keyExtractor={item => item} ariaLabel="Lecteur" renderItem={item => <button type="button">{item}</button>} />
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("VerticalPager — fenêtre préchargée et focus actif", () => {
  it("garde trois panneaux montés mais un seul exposé aux technologies d'assistance", () => {
    const view = render(pager(1))
    expect(view.container.querySelectorAll("button")).toHaveLength(3)
    expect(screen.getAllByRole("button").map(button => button.textContent)).toEqual(["B"])
    for (const panel of view.container.querySelectorAll('[data-vertical-pager-panel="inactive"]')) {
      expect(panel).toHaveAttribute("inert")
      expect(panel).toHaveAttribute("aria-hidden", "true")
    }
    expect(view.container.querySelector('[data-vertical-pager-panel="active"]')).not.toHaveAttribute("inert")
  })

  it("ramène le focus au pager lorsque son panneau devient inactif", () => {
    const view = render(pager(1))
    screen.getByRole("button", { name: "B" }).focus()
    view.rerender(pager(2))
    expect(screen.getByRole("group", { name: "Lecteur" })).toHaveFocus()
    expect(screen.getAllByRole("button").map(button => button.textContent)).toEqual(["C"])
  })

  it("préserve le focus d'un panneau toujours actif pendant une relecture", () => {
    const view = render(pager(1))
    const button = screen.getByRole("button", { name: "B" })
    button.focus()
    view.rerender(pager(1, vi.fn(), [...ITEMS]))
    expect(button).toHaveFocus()
  })

  it("ne reprend ni un focus extérieur ni un focus volontairement abandonné", () => {
    const content = (index: number) => <><button type="button">Extérieur</button>{pager(index)}</>
    const view = render(content(1))
    screen.getByRole("button", { name: "B" }).focus()
    const outside = screen.getByRole("button", { name: "Extérieur" })
    outside.focus()
    view.rerender(content(2))
    expect(outside).toHaveFocus()
    screen.getByRole("button", { name: "C" }).focus()
    screen.getByRole("button", { name: "C" }).blur()
    view.rerender(content(1))
    expect(screen.getByRole("group", { name: "Lecteur" })).not.toHaveFocus()
    expect(document.body).toHaveFocus()
  })

  it("récupère le focus aussi après le blur natif d'un contrôle désactivé lors du changement", () => {
    function Control({ name, active }: { name: string; active: boolean }) {
      const ref = useRef<HTMLButtonElement>(null)
      // Reproduit le navigateur qui retire le focus avant le layout du pager.
      useLayoutEffect(() => { if (!active) ref.current?.blur() }, [active])
      return <button ref={ref} type="button" disabled={!active}>{name}</button>
    }
    const content = (index: number) => <VerticalPager items={ITEMS} index={index} onIndexChange={vi.fn()} keyExtractor={item => item} ariaLabel="Lecteur" renderItem={(item, state) => <Control name={item} active={state.active} />} />
    const view = render(content(1))
    screen.getByRole("button", { name: "B" }).focus()
    view.rerender(content(2))
    expect(screen.getByRole("group", { name: "Lecteur" })).toHaveFocus()
  })

  it("récupère le focus si le panneau actif est retiré de la fenêtre", () => {
    const view = render(pager(1))
    screen.getByRole("button", { name: "B" }).focus()
    view.rerender(pager(1, vi.fn(), ["A", "C"]))
    expect(screen.getByRole("group", { name: "Lecteur" })).toHaveFocus()
  })

  it("conserve haut/bas sur le pager et laisse les saisies garder leurs propres flèches", () => {
    const change = vi.fn()
    render(<VerticalPager items={ITEMS} index={1} onIndexChange={change} keyExtractor={item => item} ariaLabel="Lecteur" renderItem={item => <input aria-label={`Saisie ${item}`} />} />)
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Saisie B" }), { key: "ArrowDown" })
    expect(change).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole("group", { name: "Lecteur" }), { key: "ArrowDown" })
    expect(change).toHaveBeenLastCalledWith(2)
  })
})
