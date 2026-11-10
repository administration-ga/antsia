// ADR-0026 : la mise en page racine place l'amorçage de l'apparence en tête de <head>, avec le nonce de la requête s'il existe.
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({ headers: async () => request.headers }))
vi.mock("@/lib/server-session", () => ({ getPublicLocale: async () => "fr", configuredMetadataOrigin: () => null }))
vi.mock("@/components/providers", () => ({ Providers: ({ children }: { children: ReactNode }) => children }))
// Les feuilles de style ne sont pas l'objet du test (et passeraient par PostCSS).
vi.mock("@livekit/components-styles", () => ({}))
vi.mock("./globals.css", () => ({}))

import { APPEARANCE_BOOT_SCRIPT } from "@/components/appearance-boot-script"
import RootLayout from "./layout"

async function renderLayout() {
  return renderToStaticMarkup(await RootLayout({ children: <main id="contenu" /> }))
}

beforeEach(() => {
  request.headers = new Headers()
})

describe("RootLayout — amorçage de l'apparence", () => {
  it("le script ouvre le <head> de la mise en page (Next y ajoute ensuite ses métadonnées), avant le corps", async () => {
    const html = await renderLayout()
    expect(html).toContain(`<head><script>${APPEARANCE_BOOT_SCRIPT}</script>`)
    expect(html.indexOf("<script>")).toBeLessThan(html.indexOf("<body"))
    // MP04 : le défilement fluide est déclaré à Next, qui le suspend pendant ses navigations.
    expect(html).toMatch(/^<html lang="fr" data-charte="antsia" data-scroll-behavior="smooth">/)
  })

  it("reprend le nonce que le proxy de la CSP à jeton posera sur la requête", async () => {
    request.headers = new Headers({ "x-nonce": "cmVxdWV0ZS0x" })
    const html = await renderLayout()
    expect(html).toContain(`<head><script nonce="cmVxdWV0ZS0x">${APPEARANCE_BOOT_SCRIPT}</script>`)
  })
})
