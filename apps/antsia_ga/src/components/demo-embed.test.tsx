// @vitest-environment jsdom
import { createAppI18n } from "@antsia/social-features/i18n"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Une entrée de zone doit remplacer le document ; un Link Next serait une régression.
vi.mock("next/link", () => ({ default: () => { throw new Error("La démo exige une navigation document.") } }))
vi.mock("@/lib/sign-out", () => ({ signOutAndRedirect: vi.fn() }))

import { appResources } from "@/i18n/resources"
import { DEMO_BANNER_HEIGHT_PROPERTY } from "@/lib/demo-embed"
import { signOutAndRedirect } from "@/lib/sign-out"
import { routes } from "@/lib/routes"
import { DemoEmbedScreen, DemoEntryLink, DemoModeBanner } from "./demo-embed"

let root: Root | undefined
let container: HTMLDivElement

function enableDemoBuild() {
  vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "/demo")
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://vivid-hedgehog-655.convex.cloud")
}

async function mount(content: ReactNode, locale: "fr" | "en" = "fr") {
  const i18n = createAppI18n({ locale, appResources, defaultNS: "antsia" })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root!.render(<I18nextProvider i18n={i18n}>{content}</I18nextProvider>))
}

beforeEach(() => {
  vi.mocked(signOutAndRedirect).mockReset().mockResolvedValue(undefined)
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubEnv("NEXT_PUBLIC_DEMO_ENTRY_ENABLED", "true")
  vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "")
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://diligent-avocet-585.convex.cloud")
})
afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  container?.remove()
  document.documentElement.style.removeProperty(DEMO_BANNER_HEIGHT_PROPERTY)
  document.documentElement.style.removeProperty("--fixture-unrelated-layout")
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("entrée de démonstration par document", () => {
  it("présente un lien interne /demo sur le site principal", async () => {
    await mount(<DemoEntryLink />)
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/demo")
    expect(container.querySelector("a")?.textContent).toBe("Comptes démo")
    expect(container.querySelector("iframe")).toBeNull()
  })

  it.each(["", "false", "TRUE", "1", " true "])("n'affiche aucun lien si le flag n'est pas exact : %j", async (flag) => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_ENTRY_ENABLED", flag)
    await mount(<DemoEntryLink />)
    expect(container.querySelector("a")).toBeNull()
  })

  it("ne propose pas une entrée récursive dans le build démo", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "/demo")
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://vivid-hedgehog-655.convex.cloud")
    await mount(<DemoEntryLink />)
    expect(container.querySelector("a")).toBeNull()
  })

  it("le site local conserve un lien document lorsqu'il est explicitement activé", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "http://127.0.0.1:3210")
    await mount(<DemoEntryLink />)
    expect(container.querySelector("a")?.getAttribute("href")).toBe(routes.demo())
  })
})

describe("notice flottante du build démo", () => {
  it("reste absente du site principal", async () => {
    await mount(<DemoModeBanner />)
    expect(container.querySelector("aside")).toBeNull()
    expect(signOutAndRedirect).not.toHaveBeenCalled()
  })

  it("annonce les données fictives sans lien vers un autre compte ni hauteur réservée", async () => {
    enableDemoBuild()
    const observe = vi.fn()
    vi.stubGlobal("ResizeObserver", class { observe = observe })
    document.documentElement.style.setProperty(DEMO_BANNER_HEIGHT_PROPERTY, "27px", "important")
    await mount(<DemoModeBanner />)
    const notice = container.querySelector("aside")!
    expect(notice.getAttribute("aria-label")).toBe("Mode démo")
    expect(notice.classList.contains("fixed")).toBe(true)
    expect(notice.hasAttribute("aria-modal")).toBe(false)
    expect(container.textContent).toContain("Comptes et contenus fictifs, partagés")
    expect(container.textContent).toContain("Votre compte ANTSIA reste séparé")
    expect(container.querySelector("a")).toBeNull()
    expect(container.querySelector("iframe")).toBeNull()
    expect(document.documentElement.style.getPropertyValue(DEMO_BANNER_HEIGHT_PROPERTY)).toBe("27px")
    expect(document.documentElement.style.getPropertyPriority(DEMO_BANNER_HEIGHT_PROPERTY)).toBe("important")
    expect(observe).not.toHaveBeenCalled()
    expect(signOutAndRedirect).not.toHaveBeenCalled()
  })

  it.each([
    "http://localhost:3210",
    "https://diligent-avocet-585.convex.cloud",
    "https://vivid-hedgehog-655.convex.cloud:443",
    "https://vivid-hedgehog-655.convex.cloud.evil.test",
  ])("un backend étranger ou normalisé ne devient pas un build démo : %s", async (backend) => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "/demo")
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", backend)
    await mount(<DemoModeBanner />)
    expect(container.querySelector("aside")).toBeNull()
  })

  it("traduit la notice, la fermeture et la déconnexion en anglais", async () => {
    enableDemoBuild()
    await mount(<DemoModeBanner />, "en")
    expect(container.querySelector("aside")?.getAttribute("aria-label")).toBe("Demo mode")
    expect(container.textContent).toContain("Fictional accounts and content")
    expect(container.querySelector('button[aria-label="Dismiss demo notice"]')).not.toBeNull()
    expect(container.querySelector('button[aria-busy="false"]')?.textContent).toBe("Sign out")
  })

  it("se ferme sans déconnecter ni remonter le contenu de la page", async () => {
    enableDemoBuild()
    await mount(<><DemoModeBanner /><textarea aria-label="Brouillon de recette" defaultValue="Brouillon conservé" /></>)
    const draft = container.querySelector("textarea")!
    const dismiss = container.querySelector<HTMLButtonElement>('button[aria-label="Fermer l’information de démo"]')!
    await act(async () => dismiss.click())
    expect(container.querySelector("aside")).toBeNull()
    expect(container.querySelector("textarea")).toBe(draft)
    expect(draft.value).toBe("Brouillon conservé")
    expect(signOutAndRedirect).not.toHaveBeenCalled()
  })

  it("passe par la vraie déconnexion et bloque les doubles appuis pendant la sortie", async () => {
    enableDemoBuild()
    let finish!: () => void
    vi.mocked(signOutAndRedirect).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
    await mount(<DemoModeBanner />)
    const button = container.querySelector<HTMLButtonElement>('button[aria-busy="false"]')!
    await act(async () => button.click())
    expect(signOutAndRedirect).toHaveBeenCalledOnce()
    expect(button.disabled).toBe(true)
    expect(button.getAttribute("aria-busy")).toBe("true")
    expect(button.textContent).toBe("Déconnexion…")
    await act(async () => button.click())
    expect(signOutAndRedirect).toHaveBeenCalledOnce()
    await act(async () => finish())
  })

  it("signale un échec et permet de réessayer sans prétendre être déconnecté", async () => {
    enableDemoBuild()
    vi.mocked(signOutAndRedirect).mockRejectedValueOnce(new Error("unavailable"))
    await mount(<DemoModeBanner />)
    const button = container.querySelector<HTMLButtonElement>('button[aria-busy="false"]')!
    await act(async () => button.click())
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("La déconnexion n’a pas abouti. Réessayez.")
    expect(button.disabled).toBe(false)
    expect(button.getAttribute("aria-busy")).toBe("false")
    await act(async () => button.click())
    expect(signOutAndRedirect).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })
})

describe("repli fermé de la page démo", () => {
  it("annonce l'indisponibilité sans cadre, redirection ou origine secondaire", async () => {
    await mount(<DemoEmbedScreen />)
    expect(container.querySelector("h1")?.textContent).toBe("Mode démo")
    expect(container.querySelector('[role="status"]')?.textContent).toContain("momentanément indisponible")
    expect(container.querySelector("iframe")).toBeNull()
    expect([...container.querySelectorAll("a")].map((link) => link.getAttribute("href"))).toEqual([routes.signIn()])
  })

  it("traduit aussi le repli en anglais", async () => {
    await mount(<DemoEmbedScreen />, "en")
    expect(container.querySelector("h1")?.textContent).toBe("Demo mode")
    expect(container.querySelector('[role="status"]')?.textContent).toContain("temporarily unavailable")
    expect(container.querySelector("iframe")).toBeNull()
  })
})
