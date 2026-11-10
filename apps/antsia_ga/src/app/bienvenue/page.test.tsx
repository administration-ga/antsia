import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { routes } from "@/lib/routes"
import type { SpecializedDestination } from "@/lib/specialized-navigation"

vi.mock("@/components/welcome-screen", () => ({
  WelcomeScreen: (props: Record<string, unknown>) => <main data-screen="welcome" data-props={JSON.stringify(props)} />,
}))
vi.mock("@/components/access-home-screen", () => ({
  AccessHomeScreen: () => { throw new Error("L’accueil authentifié ne doit pas remonter la porte de connexion") },
}))
vi.mock("@/i18n/server", () => ({ getAppT: () => ({ t: (key: string) => key }) }))

import WelcomePage, { generateMetadata } from "./page"

describe("route bienvenue — accueil authentifié", () => {
  it("monte l’accueil existant au lieu de boucler vers la connexion", async () => {
    const html = renderToStaticMarkup(await WelcomePage({}))
    expect(html).toContain('data-screen="welcome"')
    expect(html).toContain('data-props="{}"')
    expect(generateMetadata().title).toBe("welcome.title")
  })

  it("conserve les références de publication, notification et contact valides", async () => {
    const html = renderToStaticMarkup(await WelcomePage({ searchParams: Promise.resolve({
      publication: "publication_1", notification: "notification_1", contactBoutique: "atelier.ndong",
      contactOffre: "pro.ga:offer:01JA00000000000000000000F1",
    }) }))
    expect(html).toContain('&quot;publicPostId&quot;:&quot;publication_1&quot;')
    expect(html).toContain('&quot;notificationReference&quot;:&quot;notification_1&quot;')
    expect(html).toContain('&quot;shopContact&quot;:{&quot;kind&quot;:&quot;shop_contact&quot;,&quot;handle&quot;:&quot;atelier.ndong&quot;,&quot;offerRef&quot;:&quot;pro.ga:offer:01JA00000000000000000000F1&quot;}')
  })

  it("conserve seulement la destination spécialisée validée", async () => {
    const destination: SpecializedDestination = { kind: "catalog", handle: "atelier.ndong" }
    const search = Object.fromEntries(new URLSearchParams(routes.signIn(undefined, undefined, undefined, undefined, destination).split("?")[1]))
    const html = renderToStaticMarkup(await WelcomePage({ searchParams: Promise.resolve(search) }))
    expect(html).toContain('&quot;specializedDestination&quot;:{&quot;kind&quot;:&quot;catalog&quot;,&quot;handle&quot;:&quot;atelier.ndong&quot;}')
    const invalid = renderToStaticMarkup(await WelcomePage({ searchParams: Promise.resolve({ ...search, espaceBoutique: "../atelier" }) }))
    expect(invalid).not.toContain("specializedDestination")
  })

  it("refuse les références invalides ou répétées sans changer d’écran", async () => {
    const html = renderToStaticMarkup(await WelcomePage({ searchParams: Promise.resolve({
      publication: ["publication_1", "publication_2"], notification: "../notification",
      contactBoutique: "../atelier", inscription: "1", deconnexion: "incomplete",
    }) }))
    expect(html).toContain('data-screen="welcome"')
    expect(html).toContain('data-props="{}"')
  })
})
