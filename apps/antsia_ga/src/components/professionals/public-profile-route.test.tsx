import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
const mock = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock("@/lib/public-professional-data", () => ({ loadPublicProfessional: mock.load }))
vi.mock("@/lib/server-session", () => ({ getPublicLocale: async () => "fr", configuredMetadataOrigin: () => "https://antsia.ga", getServerViewer: vi.fn(), withinBridgeDeadline: (work: () => Promise<unknown>) => work() }))
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("TEST_NOT_FOUND") } }))
vi.mock("@/components/public/public-shell", () => ({ PUBLIC_LINK:"link", PUBLIC_CTA:"cta", PublicShell: ({viewer,children}:{viewer:string;children:ReactNode}) => <main data-viewer={viewer}>{children}</main> }))
vi.mock("@/components/public/public-status", () => ({ PublicStatus: ({status}:{status:string}) => <p data-status={status}>{status}</p> }))
import { PublicProfessionalMetadata, PublicProfessionalScreen } from "./public-profile-route"
const input = () => ({params:Promise.resolve({handle:"awa.demo"}),searchParams:Promise.resolve({})})
beforeEach(() => mock.load.mockReset())
describe("MP09 : rendu public spécialisé", () => {
  it("omet les sections non partagées et poursuit seulement la consultation après connexion", async () => {
    mock.load.mockResolvedValue({status:"ready",viewer:"anonymous",data:{handle:"awa.demo",displayName:"Awa NDONG"}})
    const html = renderToStaticMarkup(await PublicProfessionalScreen(input()))
    expect(html).toContain("Awa NDONG")
    expect(html).toContain("espaceType=professional")
    expect(html).not.toContain("<form")
    expect(html).not.toContain("Compétences déclarées")
    expect(html).not.toContain("Réalisations")
    expect((html.match(/<h1/g) ?? [])).toHaveLength(1)
  })
  it("sert les seuls champs publics choisis et une adresse canonique stable", async () => {
    mock.load.mockResolvedValue({status:"ready",viewer:"authenticated",data:{handle:"awa.demo",displayName:"Awa NDONG",title:"Photographe",skills:["Portrait"],portfolio:[{title:"Studio",description:"Réalisation déclarée"}]}})
    const html = renderToStaticMarkup(await PublicProfessionalScreen(input()))
    expect(html).toContain("Compétences déclarées")
    expect(html).toContain("Réalisation déclarée")
    expect(html).toContain('href="/professionnels/awa.demo"')
    const metadata = await PublicProfessionalMetadata(input())
    expect(metadata.alternates?.canonical).toBe("https://antsia.ga/pros/awa.demo")
    expect(metadata.robots).toEqual({index:true,follow:true})
  })
  it("ne remplace pas une session refusée par une fiche anonyme et n'indexe pas le refus", async () => {
    mock.load.mockResolvedValue({status:"refused"})
    const html = renderToStaticMarkup(await PublicProfessionalScreen(input()))
    expect(html).toContain('data-status="refused"')
    expect(html).not.toContain("Awa NDONG")
    expect((await PublicProfessionalMetadata(input())).robots).toEqual({index:false,follow:false})
  })
})
