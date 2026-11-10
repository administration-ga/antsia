import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { routes } from "@/lib/routes"
import type { SpecializedDestination } from "@/lib/specialized-navigation"

vi.mock("@/components/access-home-screen", () => ({
  AccessHomeScreen: ({ intent, signOutIncomplete, specializedDestination, idnReturn }: { intent?: "sign-in" | "sign-up"; signOutIncomplete?: boolean; specializedDestination?: SpecializedDestination; idnReturn?: string | null }) => (
    <main data-intent={intent ?? "sign-in"} data-sign-out-incomplete={String(signOutIncomplete ?? false)} data-specialized={specializedDestination ? JSON.stringify(specializedDestination) : undefined} data-idn-return={idnReturn ?? undefined} />
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

  it("lit le retour d'un refus IDN en refus fermé, sans jamais transmettre la valeur reçue", async () => {
    const read = async (search: Record<string, string | string[]>) => renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve(search) }))
    expect(await read({ error: "access_denied", error_description: "Private detail" })).toContain('data-idn-return="refused"')
    expect(await read({ error: "temporarily_unavailable" })).toContain('data-idn-return="unavailable"')
    expect(await read({ error: "account_not_linked" })).toContain('data-idn-return="accountExists"')
    const injected = await read({ error: "<script>alert(1)</script>" })
    expect(injected).toContain('data-idn-return="failed"')
    expect(injected).not.toContain("script")
    expect(await read({ error: ["access_denied", "login_required"] })).toContain('data-idn-return="failed"')
    expect(await read({ inscription: "1" })).not.toContain("data-idn-return")
    expect(await read({ error_description: "Private detail" })).not.toContain("data-idn-return")
  })
})
