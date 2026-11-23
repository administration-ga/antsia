import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

/**
 * Revue CH-815 F3 — le gabarit racine de la console pose `<meta name="referrer" content="no-referrer">`
 * en tête de `<head>`, en plus de l'en-tête `Referrer-Policy` (`next.config.ts`) : l'adresse d'entrée
 * porte un instant le jeton à usage unique de la session.
 */
vi.mock("@/i18n/server", () => ({ getAppT: () => ({ locale: "fr", t: (key: string) => key }) }))
vi.mock("@/components/providers", () => ({ Providers: (props: { children: ReactNode }) => props.children }))
// La feuille de styles (Tailwind, PostCSS) n'est pas l'objet du test.
vi.mock("./globals.css", () => ({}))

import RootLayout from "./layout"

describe("gabarit racine de la console", () => {
  it("la balise referrer est la première de <head>, une seule fois", () => {
    const html = renderToStaticMarkup(RootLayout({ children: <p>contenu</p> }))
    const head = /<head>([\s\S]*?)<\/head>/.exec(html)?.[1] ?? ""
    expect(head.startsWith('<meta name="referrer" content="no-referrer"/>')).toBe(true)
    expect(html.match(/name="referrer"/g)).toHaveLength(1)
  })
})
