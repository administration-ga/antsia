// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ available: null as boolean | null }))
vi.mock("@antsia/api/routing", () => ({
  Link: ({ children, href, ...props }: import("react").AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a>,
}))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => ({ "icomSpace.label": "Espace de messagerie", "icomSpace.personal": "iCom", "icomSpace.pro": "iCom Pro" })[key] ?? key }) }))
vi.mock("./use-icom-pro", () => ({ useIcomProAvailability: () => state.available }))

import { IcomDockSpaceTitle, IcomSpaceHeading, IcomSpaceSwitch } from "./IcomSpaceSwitch"

afterEach(() => { cleanup(); state.available = null })

describe("ADR-0036 — la pilule iCom | iCom Pro", () => {
  it("marque l'espace courant et rend l'autre en lien", () => {
    render(<IcomSpaceSwitch active="pro" personalHref="/messages" proHref="/messages?espace=pro" />)
    const nav = screen.getByRole("navigation", { name: "Espace de messagerie" })
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toBe("iCom Pro")
    expect(screen.getByRole("link", { name: "iCom" }).getAttribute("href")).toBe("/messages")
    expect(screen.queryByRole("link", { name: "iCom Pro" })).toBeNull()
  })
  it("un segment sans adresse se lit sans naviguer (carte de la colonne droite)", () => {
    render(<IcomSpaceSwitch active="personnel" personalHref={null} proHref="/messages?espace=pro" compact />)
    expect(screen.queryByRole("link", { name: "iCom" })).toBeNull()
    expect(screen.getByRole("link", { name: "iCom Pro" }).getAttribute("href")).toBe("/messages?espace=pro")
    expect(screen.getByRole("navigation").getAttribute("data-compact")).toBe("true")
  })
  it("l'en-tête ne montre la pilule qu'avec une activité pro, ou déjà dans iCom Pro ; le titre reste lu", () => {
    const view = render(<IcomSpaceHeading space="personnel" title="iCom" personalHref="/messages" proHref="/messages?espace=pro" />)
    expect(screen.queryByRole("navigation")).toBeNull()
    expect(screen.getByRole("heading", { level: 1 }).className).toBe("")
    state.available = true
    view.rerender(<IcomSpaceHeading space="personnel" title="iCom" personalHref="/messages" proHref="/messages?espace=pro" />)
    expect(screen.getByRole("navigation", { name: "Espace de messagerie" })).toBeTruthy()
    expect(screen.getByRole("heading", { level: 1 }).className).toBe("sr-only")
    state.available = false
    view.rerender(<IcomSpaceHeading space="pro" title="iCom Pro" personalHref="/messages" proHref="/messages?espace=pro" />)
    expect(screen.getByRole("link", { name: "iCom" })).toBeTruthy()
  })
  it("la carte garde son titre sans activité pro, et montre la pilule sinon", () => {
    const view = render(<IcomDockSpaceTitle title="iCom" proHref="/messages?espace=pro" />)
    expect(screen.getByText("iCom").className).toBe("icom-surface-title")
    state.available = true
    view.rerender(<IcomDockSpaceTitle title="iCom" proHref="/messages?espace=pro" />)
    expect(screen.getByRole("link", { name: "iCom Pro" }).getAttribute("href")).toBe("/messages?espace=pro")
  })
})
