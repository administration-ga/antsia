import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const network = vi.hoisted(() => ({ navigationLayout: undefined as "adaptive" | undefined }))

vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ navigation: "destinations", navigationLayout: network.navigationLayout }) }))
vi.mock("@antsia/social-features/messagerie", () => ({ MessagesRoute: () => <section data-messages-content="" /> }))
vi.mock("@/components/member-chrome", () => ({
  MemberTopBar: ({ onMobile }: { onMobile: string }) => <header data-mobile={onMobile} />,
  MemberPage: ({ children, workspace, immersiveOnPhone }: { children: React.ReactNode; workspace?: boolean; immersiveOnPhone?: boolean }) => <div data-member-page={JSON.stringify({ workspace, immersiveOnPhone })}>{children}</div>,
}))
vi.mock("@/components/shops/contact-messages", () => ({ useCommercialMessages: () => undefined }))
// MP09 : l’injection contextuelle a ses propres tests (messages-screen.test.tsx).
vi.mock("@antsia/social-features/features/messagerie/contextual-entry", () => ({ useContextualMessages: () => undefined }))

import { MessagesScreen } from "./messages-screen"

afterEach(() => {
  vi.unstubAllEnvs()
  network.navigationLayout = undefined
})

describe("messagerie dans l'opt-in adaptatif", () => {
  it("confie la messagerie au cadre borné du membre, détail immersif au téléphone", () => {
    network.navigationLayout = "adaptive"
    const list = renderToStaticMarkup(<MessagesScreen route={{}} />)
    expect(list).toContain(`data-member-page="${JSON.stringify({ workspace: true, immersiveOnPhone: false }).replaceAll('"', "&quot;")}"`)
    expect(list).toContain('data-messages-content=""')
    expect(list).not.toContain("h-dvh")
    const conversation = renderToStaticMarkup(<MessagesScreen route={{ kind: "personne", id: "fixture" }} />)
    expect(conversation).toContain("&quot;immersiveOnPhone&quot;:true")
  })
})

describe("hauteur de la messagerie avec la notice démo flottante", () => {
  it("conserve toute la hauteur sans retrancher la notice flottante dans la zone démo", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "/demo")
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://vivid-hedgehog-655.convex.cloud")
    const html = renderToStaticMarkup(<MessagesScreen route={{}} />)
    expect(html).toContain('class="esp-page-motif flex h-dvh flex-col overflow-hidden bg-background"')
    expect(html).toContain('style="height:100dvh"')
    expect(html).not.toContain("--antsia-demo-banner-height")
    expect(html).toContain('data-mobile="visible"')
    expect(html).toContain('data-messages-content=""')
  })

  it("conserve le masquage de la barre dans une conversation immersive de démo", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "/demo")
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://vivid-hedgehog-655.convex.cloud")
    expect(renderToStaticMarkup(<MessagesScreen route={{ kind: "personne", id: "fixture" }} />)).toContain('data-mobile="hidden"')
  })

  it.each(["", "/demo"])("la hauteur du principal reste 100dvh avec basePath %j", (basePath) => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", basePath)
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://diligent-avocet-585.convex.cloud")
    const html = renderToStaticMarkup(<MessagesScreen route={{}} />)
    expect(html).not.toContain('style="')
    expect(html).toContain('class="esp-page-motif flex h-dvh flex-col overflow-hidden bg-background"')
  })
})
