// @vitest-environment jsdom
/** K12/AC03 : annonces seulement, scénarios écrits sans exécution des gestes P15. */
import type { Id } from "@antsia/api/engine"
import { createAppI18n } from "@antsia/social-features/i18n"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { appResources } from "@/i18n/resources"
import type { MyApplication } from "./job-model"

const mocks = vi.hoisted(() => ({
  rows: [] as MyApplication[], error: false, detailError: false, fetching: false,
  network: { networkId: "network-a", personId: "person-a" },
  command: vi.fn(), readCurrent: vi.fn(), run: vi.fn(), refetch: vi.fn(),
}))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: {
  jobApplications: { myApplications: "list", myApplication: "detail", retry: "retry", refreshStatus: "refresh", withdraw: "withdraw" },
  jobFiles: { myFiles: "files" },
} } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => mocks.network }))
vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: (ref: string) => ({
    data: ref === "list" ? { page: mocks.rows, isDone: true, continueCursor: "" }
      : ref === "detail" ? mocks.rows[0] ? { summary: mocks.rows[0], civilName: { firstName: "Awa", lastName: "NDONG" }, motivation: "Motivation privée", consentedAt: 1000 } : null
      : [],
    isError: ref === "list" ? mocks.error : ref === "detail" && mocks.detailError, isPending: false, isFetching: mocks.fetching, refetch: mocks.refetch,
  }),
}))
vi.mock("convex/react", () => ({
  useMutation: (ref: string) => (args: unknown) => mocks.command(ref, args),
  useConvex: () => ({ query: mocks.readCurrent }),
}))
vi.mock("./job-guards", () => ({
  useJobAction: () => ({ pending: false, error: null, current: () => true, run: mocks.run }),
  useJobReview: () => ({ paused: false, online: true, stamp: "same" }),
  JobReviewNotice: () => null,
}))
vi.mock("./job-application-form", () => ({ JobFilesManager: () => null }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { MyApplicationsScreen } from "./my-applications-screen"
import { MyApplicationScreen } from "./my-application-screen"
const languages = {
  fr: createAppI18n({ locale: "fr", appResources, defaultNS: "jobs" }),
  en: createAppI18n({ locale: "en", appResources, defaultNS: "jobs" }),
}
const NOW = Date.UTC(2026, 9, 20, 10)
const application = (overrides: Partial<MyApplication> = {}): MyApplication => ({
  applicationId: "application-a" as Id<"commerceApplications">, jobRef: "private-job", jobTitle: "Titre privé",
  shopHandle: "atelier", shopName: "Employeur privé", state: "queued", candidateState: null, rejection: null,
  remoteUnconfirmed: false, submittedAt: null, remoteUpdatedAt: null, createdAt: NOW,
  files: [], retryConsentTextVersion: null, actions: { retry: false, refresh: false, withdraw: false }, ...overrides,
})
let root: Root, container: HTMLDivElement
async function render(locale: "fr" | "en" = "fr") {
  await act(async () => root.render(<I18nextProvider i18n={languages[locale]}><MyApplicationsScreen /></I18nextProvider>))
}
async function renderIndividual() {
  await act(async () => root.render(<I18nextProvider i18n={languages.fr}><MyApplicationScreen applicationId="application-a" /></I18nextProvider>))
}
const regions = () => [...container.querySelectorAll('[role="status"].sr-only')]
const region = () => regions()[0]
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  mocks.rows = [application()]; mocks.error = false; mocks.detailError = false; mocks.fetching = false
  mocks.network = { networkId: "network-a", personId: "person-a" }
  for (const mock of [mocks.command, mocks.readCurrent, mocks.run, mocks.refetch]) mock.mockClear()
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe("candidature : annonces métier sans données du dossier", () => {
  it("la première lecture monte une région polie vide sans lancer de commande", async () => {
    await render()
    expect(region()?.textContent).toBe("")
    expect(region()?.getAttribute("aria-live")).toBe("polite")
    expect(region()?.getAttribute("aria-atomic")).toBe("true")
    expect(mocks.command).not.toHaveBeenCalled(); expect(mocks.readCurrent).not.toHaveBeenCalled()
  })
  it.each(["fr", "en"] as const)("annonce la candidature puis son état autorisé en %s", async locale => {
    await render(locale)
    const host = region(), i18n = languages[locale]
    mocks.rows = [application({ state: "submitted", candidateState: "received", submittedAt: NOW })]
    await render(locale)
    expect(region()).toBe(host)
    expect(region()?.textContent).toContain(i18n.t("applications.candidateState.received"))
    mocks.rows = [application({ state: "submitted", candidateState: "in_review", remoteUpdatedAt: NOW + 1000 })]
    await render(locale)
    expect(region()?.textContent).toContain(i18n.t("applications.candidateState.in_review"))
    for (const privateText of ["Titre privé", "Employeur privé", "private-job", "application-a", "Awa", "NDONG", "Motivation privée"]) expect(region()?.textContent).not.toContain(privateText)
  })
  it("un poll, ses nouvelles dates et les détails personnels ne réannoncent pas le même état", async () => {
    await render()
    mocks.rows = [application({ state: "submitted", candidateState: "in_review" })]; await render()
    const host = region(), node = host?.firstChild, text = host?.textContent
    mocks.fetching = true
    mocks.rows = [application({ state: "submitted", candidateState: "in_review", createdAt: NOW + 1, submittedAt: NOW + 2, remoteUpdatedAt: NOW + 3 })]
    await render()
    const details = [...container.querySelectorAll("button")].find(button => button.textContent === languages.fr.t("applications.details"))!
    await act(async () => details.click())
    expect(container.textContent).toContain("Motivation privée")
    expect(region()).toBe(host); expect(region()?.textContent).toBe(text); expect(region()?.firstChild).toBe(node)
    mocks.fetching = false; await render()
    expect(region()?.firstChild).toBe(node)
  })
  it("annonce le refus fermé et la réserve distante sans en déduire une suppression chez PRO.GA", async () => {
    await render()
    mocks.rows = [application({ state: "rejected", rejection: "job_closed", remoteUnconfirmed: true })]
    await render()
    expect(region()?.textContent).toContain(languages.fr.t("applications.rejection.job_closed"))
    expect(region()?.textContent).toContain(languages.fr.t("applications.remoteUnconfirmed"))
    mocks.rows = [application({ state: "rejected", rejection: "job_closed", remoteUnconfirmed: false })]
    await render()
    expect(region()?.textContent).toBe(languages.fr.t("applications.announcements.changed", { changes: languages.fr.t("applications.announcements.remoteUpdated") }))
  })
  it("annonce le transfert du CV sans identifiant et ignore le réordonnancement des pièces", async () => {
    const cv: MyApplication["files"][number] = { fileId: "private-cv-id" as Id<"commerceApplicationFiles">, kind: "cv", transfer: "pending" }
    const certificate: MyApplication["files"][number] = { fileId: "private-certificate-id" as Id<"commerceApplicationFiles">, kind: "certificate", transfer: "stored" }
    mocks.rows = [application({ files: [cv, certificate] })]; await render()
    mocks.rows = [application({ files: [{ ...cv, transfer: "stored" }, certificate] })]; await render()
    expect(region()?.textContent).toContain(languages.fr.t("files.kind.cv"))
    expect(region()?.textContent).toContain(languages.fr.t("applications.transfer.stored"))
    expect(region()?.textContent).not.toContain("private-cv-id")
    const node = region()?.firstChild
    mocks.rows = [application({ files: [certificate, { ...cv, transfer: "stored" }] })]; await render()
    expect(region()?.firstChild).toBe(node)
    mocks.rows = [application({ files: [certificate, { ...cv, transfer: "failed" }] })]; await render()
    expect(region()?.textContent).toContain(languages.fr.t("applications.transfer.failed"))
  })
  it("une nouvelle ligne de pagination reste silencieuse au montage", async () => {
    await render()
    mocks.rows = [application(), application({ applicationId: "application-b" as Id<"commerceApplications">, state: "submitted", candidateState: "received" })]
    await render()
    expect(regions()).toHaveLength(2)
    for (const host of regions()) expect(host.textContent).toBe("")
  })
  it("une lecture refusée retire l'ancien message ; la relecture et le nouvel acteur repartent muets", async () => {
    await render()
    mocks.rows = [application({ state: "submitted", candidateState: "received" })]; await render()
    expect(region()?.textContent).not.toBe("")
    mocks.error = true; await render()
    expect(regions()).toHaveLength(0); expect(container.textContent).not.toContain("Titre privé")
    mocks.error = false; await render(); expect(region()?.textContent).toBe("")
    mocks.network = { networkId: "network-b", personId: "person-b" }
    mocks.rows = [application({ state: "withdrawn", candidateState: "withdrawn" })]
    await render(); expect(region()?.textContent).toBe("")
    expect(mocks.command).not.toHaveBeenCalled(); expect(mocks.run).not.toHaveBeenCalled()
  })
})

describe("destination individuelle de notification", () => {
  it("partage la région stable sans annoncer premier snapshot, dates ni simple chargement", async () => {
    mocks.rows = []
    await renderIndividual()
    expect(regions()).toHaveLength(0)
    mocks.rows = [application({ state: "submitted", candidateState: "received" })]
    await renderIndividual()
    const host = region()
    expect(host?.textContent).toBe("")
    mocks.rows = [application({ state: "submitted", candidateState: "in_review" })]
    await renderIndividual()
    expect(region()).toBe(host)
    expect(region()?.textContent).toContain(languages.fr.t("applications.candidateState.in_review"))
    const node = region()?.firstChild
    mocks.fetching = true
    mocks.rows = [application({ state: "submitted", candidateState: "in_review", remoteUpdatedAt: NOW + 5000 })]
    await renderIndividual()
    expect(region()?.firstChild).toBe(node)
    expect(mocks.command).not.toHaveBeenCalled()
  })
  it("masque l'ancien message après refus puis réinitialise le suivi au changement d'acteur", async () => {
    await renderIndividual()
    mocks.rows = [application({ state: "rejected", rejection: "job_closed" })]
    await renderIndividual()
    expect(region()?.textContent).toContain(languages.fr.t("applications.rejection.job_closed"))
    mocks.detailError = true
    await renderIndividual()
    expect(regions()).toHaveLength(0); expect(container.textContent).not.toContain("Titre privé")
    mocks.detailError = false
    await renderIndividual()
    expect(region()?.textContent).toBe("")
    mocks.network = { networkId: "network-b", personId: "person-b" }
    mocks.rows = [application({ state: "withdrawn", candidateState: "withdrawn", remoteUnconfirmed: true })]
    await renderIndividual()
    expect(region()?.textContent).toBe("")
    expect(mocks.command).not.toHaveBeenCalled()
  })
})
