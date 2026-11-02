import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ navigation: "destinations" }) }))
vi.mock("@antsia/social-features/reseau-personnel", () => ({ ReseauAgentPage: () => <main data-feed-content="" /> }))
vi.mock("@/components/member-chrome", () => ({ MemberTopBar: () => <header />, MemberPage: ({ children }: { children: ReactNode }) => children }))
vi.mock("@/components/discovery/member-feed", () => ({ MemberDiscoveryFeed: () => <main data-discovery="" /> }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { FeedScreen } from "./feed-screen"

const viewportMinimum = "min-h-[var(--antsia-workspace-height,100dvh)]"
const desktopHeight = "min-[960px]:h-[var(--antsia-workspace-height,100dvh)]"

afterEach(() => vi.unstubAllEnvs())

describe("hauteur du fil avec notice démo flottante", () => {
  it("garde toute la hauteur sans fixer le fil au téléphone", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "/demo")
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://vivid-hedgehog-655.convex.cloud")
    const html = renderToStaticMarkup(<FeedScreen />)
    expect(html).toContain("--antsia-workspace-height:100dvh")
    expect(html).toContain(viewportMinimum)
    expect(html).toContain(desktopHeight)
    expect(html).not.toMatch(/(?:class="| )h-\[/u)
    expect(html).toContain('data-feed-content=""')
  })

  it.each(["", "/demo"])("conserve 100dvh et le seuil bureau du principal avec basePath %j", (basePath) => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", basePath)
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://diligent-avocet-585.convex.cloud")
    const html = renderToStaticMarkup(<FeedScreen />)
    expect(html).not.toContain('style="')
    expect(html).toContain(viewportMinimum)
    expect(html).toContain(desktopHeight)
    expect(html).toContain('data-feed-content=""')
  })
})
