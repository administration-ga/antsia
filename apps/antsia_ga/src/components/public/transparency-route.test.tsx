import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ transparency: vi.fn(), deadlines: vi.fn() }))
vi.mock("@/components/access-home-screen", () => ({ AccessHomeScreen: () => <div data-access-home="true" /> }))
vi.mock("@/lib/server-session", () => ({ getPublicLocale: async () => "fr" }))
vi.mock("@/lib/public-data", () => ({
  loadPublicTransparency: mocks.transparency,
  loadPublicTransparencyDeadlines: mocks.deadlines,
  publicSearch: (search: Record<string, unknown>) => ({ cursor: null, handoff: Object.hasOwn(search, "ott") }),
}))
vi.mock("./public-shell", () => ({ PublicShell: ({ children }: { children: React.ReactNode }) => <div data-public-shell="true">{children}</div> }))
vi.mock("./public-status", () => ({ PublicStatus: ({ status }: { status: string }) => <div data-public-status={status} /> }))

import { TransparencyScreen } from "./public-routes"

const DAY = 86_400_000
const start = Date.UTC(2026, 9, 21)
const periods = [start, start - DAY, start - 2 * DAY]
const transparency = { status: "ready", viewer: "anonymous", data: { threshold: 5, periods: periods.map((periodStart) => ({ periodStart, periodEnd: periodStart + DAY, cases: 12 })) } }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transparency.mockResolvedValue(transparency)
})

describe("/transparence — délais légaux tenus (SU01d)", () => {
  it("dit les délais de l'ordonnance, lus depuis la règle, et les échéances de chaque période publiée", async () => {
    mocks.deadlines.mockResolvedValue({ status: "ready", viewer: "anonymous", data: { threshold: 5, periods: [
      { periodStart: periods[0], periodEnd: periods[0]! + DAY, legal: { met: 7, missed: null } },
      { periodStart: periods[1], periodEnd: periods[1]! + DAY, legal: null },
      { periodStart: periods[2], periodEnd: periods[2]! + DAY, legal: { met: null, missed: 6 } },
    ] } })
    const html = renderToStaticMarkup(await TransparencyScreen({}))
    expect(html).toContain("Délais légaux (ordonnance n° 0011/PR/2026)")
    expect(html).toContain("une décision sous 72 h")
    expect(html).toContain("un retrait sous 24 h")
    expect(html).toContain("Échéances légales : 7 dans le délai · moins de 5 hors délai")
    expect(html).toContain("Échéances légales : moins de 5 dans le délai · 6 hors délai")
    // Une période qui ne publie pas ses échéances n'en dit rien ; ses totaux restent.
    expect(html.match(/Échéances légales :/g)).toHaveLength(2)
    expect(html.match(/12 dossiers/g)).toHaveLength(3)
  })

  it("indisponibles, les échéances s'effacent sans retirer les totaux", async () => {
    mocks.deadlines.mockResolvedValue({ status: "unavailable" })
    const html = renderToStaticMarkup(await TransparencyScreen({}))
    expect(html).toContain("12 dossiers")
    expect(html).not.toContain("Délais légaux")
    expect(html).not.toContain("Échéances légales")
  })

  it("un OTT garde le passage sans rien rendre des mesures", async () => {
    mocks.transparency.mockResolvedValue({ status: "handoff" })
    mocks.deadlines.mockResolvedValue({ status: "handoff" })
    const html = renderToStaticMarkup(await TransparencyScreen({ searchParams: Promise.resolve({ ott: "jeton-prive" }) }))
    expect(html).toContain('data-public-status="handoff"')
    expect(html).not.toContain("jeton-prive")
    expect(mocks.deadlines).toHaveBeenCalledWith(true)
  })
})
