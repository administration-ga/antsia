/**
 * UM-03 — signaler une offre d'emploi : sur la fiche MEMBRE, « Signaler » quand le moteur rend la cible (offre
 * d'autrui), jamais pour l'employeur ni son équipe ; sur la fiche PUBLIQUE, une invitation à se connecter pour un
 * lecteur anonyme, même sur une offre close ; partout, le rappel « Un recruteur ne vous demandera jamais
 * d'argent » (clé `details.noFees`).
 */
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { I18nextProvider } from "react-i18next"
import { createAppI18n } from "@antsia/social-features/i18n"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ job: null as unknown, loadPublicJob: vi.fn() }))
vi.mock("@antsia/social-features/features/reseau-personnel/report-content-entry", () => ({
  ReportTargetButton: ({ target }: { target: { kind: string; id: string } }) => <button type="button" data-report-target={`${target.kind}:${target.id}`}>Signaler</button>,
}))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: { jobs: { job: "job", listForShop: "listForShop" }, jobApplications: { forJob: "forJob" }, shops: { storefrontPause: "pause" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "root", personId: "reader" }) }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (reference: string) => ({ data: reference === "job" ? mocks.job : null, isError: false, isPending: false, isFetching: false, refetch: vi.fn() }) }))
vi.mock("@/components/jobs/job-guards", () => ({
  JobIntentBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
  useJobAction: () => ({ current: () => true, run: vi.fn(), pending: false, error: null }),
}))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: true }), useMutation: () => vi.fn() }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("@/lib/public-jobs-data", () => ({ loadPublicJob: mocks.loadPublicJob }))
vi.mock("@/lib/server-session", () => ({ getPublicLocale: async () => "fr", configuredMetadataOrigin: () => "https://antsia.ga", getServerViewer: vi.fn(), withinBridgeDeadline: (work: () => Promise<unknown>) => work() }))
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("TEST_NOT_FOUND") }, useRouter: () => ({ push: vi.fn() }), useSearchParams: () => null }))
vi.mock("@/components/public/public-shell", () => ({ PUBLIC_CTA: "public-cta", PUBLIC_LINK: "public-link", PublicShell: ({ viewer, children }: { viewer: string; children: ReactNode }) => <main data-viewer={viewer}>{children}</main> }))
vi.mock("@/components/public/public-status", () => ({ PublicStatus: ({ status }: { status: string }) => <p data-status={status}>{status}</p> }))

import type { Id } from "@antsia/api/engine"
import { appResources } from "@/i18n/resources"
import { routes } from "@/lib/routes"
import { PublicJobScreen } from "./job-public-route"
import type { JobDto } from "./job-model"
import { MemberJobScreen } from "./member-shop-jobs-screen"

const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "jobs" })
function html(children: ReactNode) { return renderToStaticMarkup(<I18nextProvider i18n={i18n}>{children}</I18nextProvider>) }
const JOB_REF = "pro.ga:job_opening:01JA00000000000000000000J1"
const JOB: JobDto = {
  jobRef: JOB_REF, shopHandle: "atelier", shopName: "Atelier des rives", title: "Vendeur en boutique", contractType: "cdi", headcount: 1,
  description: "Accueil et conseil de la clientèle.", location: "Libreville", skills: ["Vente"], openedOn: "2026-11-11", closesOn: "2026-12-31",
  salary: null, status: "open", revision: 1, changedAt: 1_792_281_600_000, actions: { apply: false },
}
const TARGET = { kind: "commerceJob" as const, id: "commerceJobHeads_1" as Id<"commerceJobHeads"> }
const NO_FEES = "Un recruteur ne vous demandera jamais d’argent"
const props = () => ({ params: Promise.resolve({ handle: "atelier", jobRef: JOB_REF }), searchParams: Promise.resolve({}) })

beforeEach(() => {
  mocks.job = null
  mocks.loadPublicJob.mockReset()
  mocks.loadPublicJob.mockResolvedValue({ status: "ready", viewer: "anonymous", data: JOB })
})

describe("UM-03 — fiche d'emploi membre", () => {
  it("l'offre d'autrui porte « Signaler », après le rappel « aucun frais »", () => {
    mocks.job = { ...JOB, reportTarget: TARGET }
    const value = html(<MemberJobScreen handle="atelier" jobRef={JOB_REF} />)
    expect(value).toContain(`data-report-target="commerceJob:${TARGET.id}"`)
    expect(value).toContain(NO_FEES)
    expect(value.indexOf("data-report-target")).toBeGreaterThan(value.indexOf("data-job-no-fees"))
  })

  it("l'employeur et son équipe (aucune cible) : aucun bouton, le rappel reste", () => {
    mocks.job = JOB
    const value = html(<MemberJobScreen handle="atelier" jobRef={JOB_REF} />)
    expect(value).toContain("Vendeur en boutique")
    expect(value).toContain(NO_FEES)
    expect(value).not.toContain("data-report-target")
  })
})

describe("UM-03 — fiche d'emploi publique", () => {
  it("sans compte : « Se connecter pour signaler cette offre », même sur une offre close", async () => {
    for (const status of ["open", "filled"] as const) {
      mocks.loadPublicJob.mockResolvedValue({ status: "ready", viewer: "anonymous", data: { ...JOB, status } })
      const value = renderToStaticMarkup(await PublicJobScreen(props()))
      const invite = /<a[^>]*data-public-report[^>]*>/.exec(value)?.[0] ?? ""
      expect(invite).toContain(`href="${routes.signIn()}"`)
      expect(value).toContain("Se connecter pour signaler cette offre")
      expect(value).toContain(NO_FEES)
    }
  })

  it("connecté : aucune invitation (on signale depuis la fiche membre)", async () => {
    mocks.loadPublicJob.mockResolvedValue({ status: "ready", viewer: "authenticated", data: JOB })
    const value = renderToStaticMarkup(await PublicJobScreen(props()))
    expect(value).not.toContain("data-public-report")
    expect(value).toContain(routes.shopJob("atelier", JOB_REF))
  })
})
