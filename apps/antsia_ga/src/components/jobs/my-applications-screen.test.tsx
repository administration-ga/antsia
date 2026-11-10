// @vitest-environment jsdom
/** P15 : scénarios écrits sans exécution ; relance autorisée par le DTO courant, jamais reconstruction de pièces. */
import type { Id } from "@antsia/api/engine"
import { COMMERCE_JOBS_APPLICATION_CONSENT_VERSION } from "@antsia/social-domain/commerce-jobs"
import { createAppI18n } from "@antsia/social-features/i18n"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { appResources } from "@/i18n/resources"
import type { MyApplication } from "./job-model"

// Seule la frontière du mock accepte cet état hors DTO, pour le scénario de robustesse explicite.
type ApplicationReadFixture = MyApplication | (Omit<MyApplication, "state"> & { state: "unknown" })

const mocks = vi.hoisted(() => ({
  retry: vi.fn(), refreshStatus: vi.fn(), withdraw: vi.fn(), readCurrent: vi.fn(), refetch: vi.fn(),
  network: { networkId: "network-a", personId: "person-a" }, online: true,
  summary: undefined as ApplicationReadFixture | undefined, listError: false, detailsError: false,
}))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: {
  jobApplications: { myApplications: "list", myApplication: "detail", retry: "retry", refreshStatus: "refreshStatus", withdraw: "withdraw" },
  jobFiles: { myFiles: "files", generateUploadUrl: "generateUploadUrl", registerFile: "registerFile", retireFile: "retireFile" },
} } } }))
vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: (ref: string) => {
    const data = ref === "list" ? { page: mocks.summary ? [mocks.summary] : [], isDone: true, continueCursor: "" }
      : ref === "detail" ? { summary: mocks.summary, civilName: { firstName: "Awa", lastName: "NDONG" }, motivation: "Texte privé", consentedAt: Date.UTC(2026, 9, 20, 10) } : []
    return { data, isError: ref === "list" ? mocks.listError : ref === "detail" && mocks.detailsError, isPending: false, isFetching: false, refetch: mocks.refetch }
  },
}))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => mocks.network }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }), useConvex: () => ({ query: mocks.readCurrent }),
  useMutation: (ref: string) => ref === "retry" ? mocks.retry : ref === "refreshStatus" ? mocks.refreshStatus : ref === "withdraw" ? mocks.withdraw : vi.fn(),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))

import { MyApplicationsScreen } from "./my-applications-screen"
const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "jobs" })
const now = Date.UTC(2026, 9, 20, 10)
const application = (retryConsentTextVersion: string | null = null): MyApplication => ({
  applicationId: "application-a" as Id<"commerceApplications">, jobRef: "job-a", jobTitle: "Comptable", shopHandle: "atelier", shopName: "Atelier",
  state: "failed", candidateState: null, rejection: null, remoteUnconfirmed: true,
  submittedAt: null, remoteUpdatedAt: null, createdAt: now, files: [],
  actions: { retry: true, refresh: true, withdraw: true }, retryConsentTextVersion,
})
let root: Root, container: HTMLDivElement
async function render() { await act(async () => root.render(<I18nextProvider i18n={i18n}><MyApplicationsScreen /></I18nextProvider>)) }
function button(key: string) { return [...container.querySelectorAll<HTMLButtonElement>("button")].find((entry) => entry.textContent === i18n.t(key))! }
async function click(key: string) { await act(async () => button(key).click()) }
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  mocks.network = { networkId: "network-a", personId: "person-a" }; mocks.online = true
  mocks.summary = application(); mocks.listError = false; mocks.detailsError = false
  for (const mock of [mocks.retry, mocks.refreshStatus, mocks.withdraw, mocks.readCurrent, mocks.refetch]) mock.mockReset()
  mocks.readCurrent.mockImplementation(async () => ({ summary: mocks.summary }))
  mocks.refetch.mockResolvedValue({ data: [], isError: false })
  vi.spyOn(window.navigator, "onLine", "get").mockImplementation(() => mocks.online)
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks() })

describe("relance privée et accord courant", () => {
  it("une reprise exacte avec un état inconnu relit la candidature puis réutilise son identifiant sans nouvel accord ni contenu", async () => {
    mocks.summary = { ...application(), state: "unknown" }
    await render(); await click("applications.retry")
    expect(mocks.readCurrent).toHaveBeenCalledWith("detail", { networkId: "network-a", applicationId: "application-a" })
    expect(mocks.retry).toHaveBeenCalledExactlyOnceWith({ networkId: "network-a", applicationId: "application-a" })
    expect(container.querySelector("input[type=checkbox]")).toBeNull()
  })
  it("un nouveau corps autorisé exige un accord décoché et transmet seulement la version exacte", async () => {
    mocks.summary = application(COMMERCE_JOBS_APPLICATION_CONSENT_VERSION)
    await render()
    const checkbox = container.querySelector<HTMLInputElement>("input[type=checkbox]")!
    expect(checkbox.checked).toBe(false)
    expect(button("applications.retry").disabled).toBe(true)
    await act(async () => checkbox.click())
    await click("applications.retry")
    expect(mocks.retry).toHaveBeenCalledExactlyOnceWith({ networkId: "network-a", applicationId: "application-a", consentTextVersion: COMMERCE_JOBS_APPLICATION_CONSENT_VERSION })
    expect(container.querySelector<HTMLInputElement>("input[type=checkbox]")!.checked).toBe(false)
  })
  it("une version inconnue ou devenue différente entre affichage et clic ferme la relance", async () => {
    mocks.summary = application("version-inconnue")
    await render()
    expect(button("applications.retry")).toBeUndefined()
    expect(container.textContent).toContain(i18n.t("recovery.retryChanged"))
    mocks.summary = application(); await render()
    mocks.readCurrent.mockResolvedValue({ summary: application(COMMERCE_JOBS_APPLICATION_CONSENT_VERSION) })
    await click("applications.retry")
    expect(mocks.retry).not.toHaveBeenCalled()
    expect(container.textContent).toContain(i18n.t("recovery.retryChanged"))
  })
  it("une lecture refusée, un identifiant différent ou un droit perdu n'envoie aucune relance", async () => {
    await render()
    mocks.readCurrent.mockRejectedValueOnce(new Error("accessDenied"))
    await click("applications.retry")
    mocks.readCurrent.mockResolvedValueOnce({ summary: { ...application(), applicationId: "other" } })
    await click("applications.retry")
    mocks.readCurrent.mockResolvedValueOnce({ summary: { ...application(), actions: { retry: false, refresh: false, withdraw: false } } })
    await click("applications.retry")
    expect(mocks.retry).not.toHaveBeenCalled()
  })
  it("changement de personne pendant la relecture : aucune commande pour la nouvelle session", async () => {
    let finish!: (value: { summary: MyApplication }) => void
    mocks.readCurrent.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    await render(); await click("applications.retry")
    mocks.network = { networkId: "network-b", personId: "person-b" }; mocks.summary = undefined; await render()
    await act(async () => finish({ summary: application() }))
    expect(mocks.retry).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain("Comptable")
  })
  it("hors ligne : aucune relance, actualisation ou retrait ; le retour exige relecture avant nouvel accord", async () => {
    mocks.summary = application(COMMERCE_JOBS_APPLICATION_CONSENT_VERSION)
    await render()
    await act(async () => container.querySelector<HTMLInputElement>("input[type=checkbox]")!.click())
    await act(async () => { mocks.online = false; window.dispatchEvent(new Event("offline")) })
    for (const key of ["applications.retry", "applications.refresh", "applications.withdraw"]) {
      expect(button(key).disabled).toBe(true); await click(key)
    }
    expect(mocks.retry).not.toHaveBeenCalled(); expect(mocks.refreshStatus).not.toHaveBeenCalled(); expect(mocks.withdraw).not.toHaveBeenCalled()
    await act(async () => { mocks.online = true; window.dispatchEvent(new Event("online")) })
    expect(button("applications.retry").disabled).toBe(true)
    expect(container.querySelector<HTMLInputElement>("input[type=checkbox]")!.checked).toBe(false)
    await click("recovery.review")
    expect(mocks.refreshStatus).toHaveBeenCalledOnce()
    expect(mocks.retry).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLInputElement>("input[type=checkbox]")!.checked).toBe(false)
  })
  it("refus de lecture : masque l'ancien dossier et ses données transmises", async () => {
    await render(); await click("applications.details")
    expect(container.textContent).toContain("Texte privé")
    mocks.detailsError = true; await render()
    expect(container.textContent).not.toContain("Texte privé")
    expect(container.textContent).not.toContain("NDONG")
    mocks.listError = true; await render()
    expect(container.textContent).not.toContain("Comptable")
    expect(button("applications.retry")).toBeUndefined()
  })
})
