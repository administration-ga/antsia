import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { routes } from "@/lib/routes"
import type { SpecializedDestination } from "@/lib/specialized-navigation"

vi.mock("@/components/access-home-screen", () => ({
  AccessHomeScreen: ({ intent, signOutIncomplete, specializedDestination }: { intent?: "sign-in" | "sign-up"; signOutIncomplete?: boolean; specializedDestination?: SpecializedDestination }) => (
    <main data-intent={intent ?? "sign-in"} data-sign-out-incomplete={String(signOutIncomplete ?? false)} data-specialized={specializedDestination ? JSON.stringify(specializedDestination) : undefined} />
  ),
}))
vi.mock("@/i18n/server", () => ({ getAppT: () => ({ t: (key: string) => key }) }))

import SignInPage from "./page"

describe("route d'accès — intentions explicites", () => {
  it("ouvre la connexion sans paramètre", async () => {
    const html = renderToStaticMarkup(await SignInPage({}))
    expect(html).toContain('data-intent="sign-in"')
    expect(html).toContain('data-sign-out-incomplete="false"')
  })

  it("ouvre directement l'inscription avec inscription=1", async () => {
    const html = renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({ inscription: "1" }) }))
    expect(html).toContain('data-intent="sign-up"')
    expect(html).toContain('data-sign-out-incomplete="false"')
  })

  it("passe l'état de déconnexion incomplète à la porte d'accès", async () => {
    const html = renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({ deconnexion: "incomplete" }) }))
    expect(html).toContain('data-intent="sign-in"')
    expect(html).toContain('data-sign-out-incomplete="true"')
  })

  it("conserve les deux intentions lorsqu'elles sont présentes ensemble", async () => {
    const html = renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({ inscription: "1", deconnexion: "incomplete" }) }))
    expect(html).toContain('data-intent="sign-up"')
    expect(html).toContain('data-sign-out-incomplete="true"')
  })

  it("ne transforme pas une autre valeur de paramètre en intention", async () => {
    const html = renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({ inscription: "0", deconnexion: "complete" }) }))
    expect(html).toContain('data-intent="sign-in"')
    expect(html).toContain('data-sign-out-incomplete="false"')
  })

  it("transmet seulement une destination spécialisée validée", async () => {
    const destination: SpecializedDestination = { kind: "catalog", handle: "atelier.ndong" }
    const search = Object.fromEntries(new URLSearchParams(routes.signIn(undefined, undefined, undefined, undefined, destination).split("?")[1]))
    const html = renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve(search) }))
    expect(html).toContain('data-specialized="{&quot;kind&quot;:&quot;catalog&quot;,&quot;handle&quot;:&quot;atelier.ndong&quot;}"')
    const invalid = renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({ ...search, espaceBoutique: "../atelier" }) }))
    expect(invalid).not.toContain("data-specialized")
  })
})
