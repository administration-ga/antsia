// @vitest-environment jsdom
/**
 * P18b (A19) — aucun formulaire imbriqué : le dépôt d'une pièce n'envoie ni ne
 * valide la candidature ; l'accord et le bouton d'envoi, placés après le
 * gestionnaire de pièces, restent rattachés au formulaire de candidature.
 */
import { createAppI18n } from "@antsia/social-features/i18n"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  generateUploadUrl: vi.fn(),
  registerFile: vi.fn(),
  retireFile: vi.fn(),
  stopClientIntent: vi.fn(),
  refetchFiles: vi.fn(),
  refetchLookup: vi.fn(),
  offerRead: vi.fn(),
  reviewRead: vi.fn(),
  network: { networkId: "network", personId: "person" },
  files: [] as JobFileDto[],
  filesError: false,
  filesPending: false,
  lookupData: undefined as unknown,
  lookupError: false,
  online: true,
  router: { push: vi.fn() },
}))

vi.mock("@antsia/api/engine", () => ({
  api: {
    modules: {
      shops: {
        jobApplications: { apply: "apply", findByIdempotencyKey: "lookup", stopClientIntent: "stopClientIntent" },
        jobFiles: { myFiles: "myFiles", generateUploadUrl: "generateUploadUrl", registerFile: "registerFile", retireFile: "retireFile" },
      },
    },
  },
}))
vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: (ref: string, args: unknown) => ref === "myFiles"
    ? { data: mocks.files, isPending: mocks.filesPending, isFetching: false, isError: mocks.filesError, error: null, refetch: mocks.refetchFiles }
    : { data: args === "skip" ? undefined : mocks.lookupData, isPending: args !== "skip" && mocks.lookupData === undefined && !mocks.lookupError, isFetching: false, isError: args !== "skip" && mocks.lookupError, error: null, refetch: mocks.refetchLookup },
}))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => mocks.network }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useMutation: (reference: "apply" | "generateUploadUrl" | "registerFile" | "retireFile" | "stopClientIntent") => mocks[reference],
}))
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
// La coque membre, importée par `shop-ui` mais jamais rendue par ce formulaire, lit au chargement
// des références du moteur absentes de la maquette partielle ci-dessus (`api.modules.graph…`).
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))

import { appResources } from "@/i18n/resources"
import { JobApplicationForm } from "./job-application-form"
import type { JobDto, JobFileDto } from "./job-model"
import { JobIntentBoundary, useJobReview } from "./job-guards"
import { JOB_INTENT_TTL_MS, jobIntentKey, type JobIntent } from "@/lib/job-intent"
import { routes } from "@/lib/routes"

const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "jobs" })
const JOB = { shopHandle: "atelier", jobRef: "job-1", revision: 1, status: "open", actions: { apply: true } } as JobDto
const FILE: JobFileDto = { fileId: "file-1" as JobFileDto["fileId"], kind: "cv", filename: "CV privé.pdf", byteSize: 128, createdAt: 1, scan: "clean" }
const scope = { networkId: "network", personId: "person", handle: "atelier", jobRef: "job-1" }
const index = (createdAt = Date.now()): JobIntent => ({ ...scope, version: 1, idempotencyKey: "a".repeat(32), createdAt })

let root: Root
let container: HTMLDivElement

async function render(children: ReactNode = <JobApplicationForm job={JOB} />) {
  await act(async () => root.render(<I18nextProvider i18n={i18n}>{children}</I18nextProvider>))
}
function button(key: string) { return [...container.querySelectorAll<HTMLButtonElement>("button")].find((entry) => entry.textContent === i18n.t(key))! }
async function click(key: string) { await act(async () => button(key).click()) }
async function submitApplication() { await act(async () => container.querySelector<HTMLButtonElement>("button[type=submit][form]")!.click()) }
function offerProbe() { mocks.offerRead(); return <p>offre relue</p> }
function ReviewProbe({ condition }: { condition: string }) {
  const review = useJobReview(condition)
  return <><span data-paused={review.paused} /><button onClick={() => review.invalidate()}>invalidate</button><button onClick={() => { void review.refresh(mocks.reviewRead) }}>review</button></>
}


/** Saisie d'un champ non contrôlé (React Hook Form), par le setter natif. */
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

async function fillValidApplication() {
  const [last, first] = [...container.querySelectorAll<HTMLInputElement>("input[autocomplete='family-name'], input[autocomplete='given-name']")]
  await type(last!, "NDONG")
  await type(first!, "Awa")
  await act(async () => container.querySelector<HTMLInputElement>("input[type='checkbox'][form]")!.click())
}

async function chooseAndUploadPdf() {
  const input = container.querySelector<HTMLInputElement>("input[type='file']")!
  const file = new File(["%PDF-1.7"], "cv.pdf", { type: "application/pdf" })
  await act(async () => {
    Object.defineProperty(input, "files", { configurable: true, value: [file] })
    input.dispatchEvent(new Event("change", { bubbles: true }))
  })
  const uploadForm = input.closest("form")!
  await act(async () => {
    uploadForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
  // Laisse aboutir la chaîne asynchrone du dépôt (adresse, envoi, enregistrement).
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  for (const mock of Object.values(mocks)) if (vi.isMockFunction(mock)) mock.mockReset()
  mocks.router.push.mockReset()
  mocks.network = { networkId: "network", personId: "person" }; mocks.files = []; mocks.filesError = false; mocks.filesPending = false; mocks.lookupData = undefined; mocks.lookupError = false; mocks.online = true
  window.sessionStorage.clear()
  vi.spyOn(window.navigator, "onLine", "get").mockImplementation(() => mocks.online)
  mocks.refetchFiles.mockImplementation(async () => ({ data: mocks.files, isError: mocks.filesError }))
  mocks.refetchLookup.mockImplementation(async () => ({ data: mocks.lookupData, isError: mocks.lookupError }))
  mocks.stopClientIntent.mockResolvedValue({ outcome: "stopped" })
  mocks.apply.mockResolvedValue({ applicationId: "application-1" })
  mocks.generateUploadUrl.mockResolvedValue("https://depot.test/televersement")
  mocks.registerFile.mockResolvedValue({ fileId: "file-1" })
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ storageId: "storage-1" }) }))
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.sessionStorage.clear()
})

describe("candidature et dépôt de pièce (P18b, A19)", () => {
  it("rend deux formulaires distincts, jamais l'un dans l'autre", async () => {
    await render()
    expect(container.querySelectorAll("form")).toHaveLength(2)
    expect(container.querySelector("form form")).toBeNull()
  })

  it("un dépôt de pièce n'appelle pas apply, même quand la candidature est valide", async () => {
    await render()
    await fillValidApplication()
    await chooseAndUploadPdf()

    expect(mocks.generateUploadUrl).toHaveBeenCalledOnce()
    expect(mocks.registerFile).toHaveBeenCalledOnce()
    expect(mocks.apply).not.toHaveBeenCalled()
    expect(mocks.router.push).not.toHaveBeenCalled()
  })

  it("un dépôt de pièce ne déclenche pas la validation de la candidature", async () => {
    await render()
    await chooseAndUploadPdf()

    expect(mocks.apply).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain(i18n.t("apply.nameRequired"))
    expect(container.textContent).not.toContain(i18n.t("apply.consentRequired"))
  })

  it("l'accord et le bouton d'envoi, hors du <form>, restent rattachés à la candidature et l'envoient", async () => {
    await render()
    const applicationForm = container.querySelectorAll("form")[0]!
    const submit = container.querySelector<HTMLButtonElement>("button[type='submit'][form]")!
    expect(submit.form).toBe(applicationForm)
    expect(container.querySelector<HTMLInputElement>("input[type='checkbox'][form]")!.form).toBe(applicationForm)

    await fillValidApplication()
    await act(async () => submit.click())
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(mocks.apply).toHaveBeenCalledOnce()
    expect(mocks.apply.mock.calls[0]![0]).toMatchObject({ networkId: "network", handle: "atelier", jobRef: "job-1", firstName: "Awa", lastName: "NDONG", consent: true })
    expect(mocks.generateUploadUrl).not.toHaveBeenCalled()
  })
})

describe("reprise et garde de candidature (P15, scénarios non exécutés)", () => {
  it("écrit l'index minimal avant apply et n'y copie aucune donnée civile ni pièce", async () => {
    mocks.apply.mockImplementation(async (args: { idempotencyKey: string }) => {
      expect(JSON.parse(window.sessionStorage.getItem(jobIntentKey(scope))!)).toMatchObject({ ...scope, idempotencyKey: args.idempotencyKey })
      expect(window.sessionStorage.getItem(jobIntentKey(scope))).not.toMatch(/NDONG|Awa|motivation|fileIds|consent/u)
      return { applicationId: "application-1", state: "queued" }
    })
    await render(); await fillValidApplication(); await submitApplication()
    expect(mocks.apply).toHaveBeenCalledOnce()
    expect(mocks.router.push).toHaveBeenCalledWith(routes.jobApplication("application-1"))
  })

  it("si la persistance échoue, n'envoie rien", async () => {
    await render(); await fillValidApplication()
    // Le constructeur global Storage peut différer de celui du sessionStorage fourni par jsdom.
    const storagePrototype = Object.getPrototypeOf(window.sessionStorage) as Storage
    const setItem = vi.spyOn(storagePrototype, "setItem").mockImplementation(() => { throw new Error("quota") })
    await submitApplication()
    expect(setItem).toHaveBeenCalledOnce()
    expect(mocks.apply).not.toHaveBeenCalled()
    expect(container.textContent).toContain(i18n.t("recovery.storageUnavailable"))
  })

  it("une réponse perdue gèle le corps et conserve la même clé, même après un autre clic", async () => {
    mocks.apply.mockRejectedValue(new Error("responseLost"))
    await render(); await fillValidApplication(); await submitApplication()
    const raw = window.sessionStorage.getItem(jobIntentKey(scope))
    expect(raw).not.toBeNull()
    expect(container.querySelector("fieldset[disabled]")).not.toBeNull()
    await submitApplication()
    expect(mocks.apply).toHaveBeenCalledOnce()
    expect(window.sessionStorage.getItem(jobIntentKey(scope))).toBe(raw)
    expect(mocks.router.push).not.toHaveBeenCalled()
  })

  it("après recharge, retrouve une candidature avant de monter la lecture d'offre, même si elle a fermé", async () => {
    window.sessionStorage.setItem(jobIntentKey(scope), JSON.stringify(index()))
    mocks.lookupData = { outcome: "application", applicationId: "application-1" }
    const Probe = offerProbe
    await render(<JobIntentBoundary handle="atelier" jobRef="job-1"><Probe /></JobIntentBoundary>)
    expect(mocks.offerRead).not.toHaveBeenCalled()
    expect(mocks.router.push).toHaveBeenCalledWith(routes.jobApplication("application-1"))
  })

  it("une clé expirée reste en récupération ; une erreur de lookup ne permet ni clôture ni nouvelle offre", async () => {
    const raw = JSON.stringify(index(Date.now() - JOB_INTENT_TTL_MS - 1))
    window.sessionStorage.setItem(jobIntentKey(scope), raw); mocks.lookupError = true
    const Probe = offerProbe
    await render(<JobIntentBoundary handle="atelier" jobRef="job-1"><Probe /></JobIntentBoundary>)
    expect(mocks.offerRead).not.toHaveBeenCalled()
    expect(button("recovery.stop")).toBeUndefined()
    expect(window.sessionStorage.getItem(jobIntentKey(scope))).toBe(raw)
    expect(mocks.stopClientIntent).not.toHaveBeenCalled()
  })

  it("absence lue : seule la clôture certaine libère le formulaire ; une candidature concurrente garde priorité", async () => {
    window.sessionStorage.setItem(jobIntentKey(scope), JSON.stringify(index()))
    mocks.lookupData = { outcome: "absent" }
    mocks.stopClientIntent.mockRejectedValueOnce(new Error("lostFence"))
      .mockResolvedValueOnce({ outcome: "application", applicationId: "application-race" })
      .mockResolvedValueOnce({ outcome: "stopped" })
    const Probe = offerProbe
    await render(<JobIntentBoundary handle="atelier" jobRef="job-1"><Probe /></JobIntentBoundary>)
    await click("recovery.stop")
    expect(mocks.offerRead).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem(jobIntentKey(scope))).not.toBeNull()
    await click("recovery.stop")
    expect(mocks.router.push).toHaveBeenCalledWith(routes.jobApplication("application-race"))
    expect(mocks.offerRead).not.toHaveBeenCalled()
    // La navigation est simulée : la dernière réponse certaine permet de relire l'offre.
    await click("recovery.stop")
    expect(mocks.offerRead).toHaveBeenCalled()
    expect(window.sessionStorage.getItem(jobIntentKey(scope))).toBeNull()
  })

  it("index corrompu : ferme l'envoi et offre seulement la voie privée Mes candidatures", async () => {
    window.sessionStorage.setItem(jobIntentKey(scope), "{")
    const Probe = offerProbe
    await render(<JobIntentBoundary handle="atelier" jobRef="job-1"><Probe /></JobIntentBoundary>)
    expect(mocks.offerRead).not.toHaveBeenCalled()
    expect(container.textContent).toContain(i18n.t("recovery.storageUnavailable"))
    expect(container.querySelector("a")?.getAttribute("href")).toBe(routes.myApplications())
    expect(mocks.apply).not.toHaveBeenCalled()
  })

  it("pièce sélectionnée devenue retenue : affiche un refus explicite et ne l'omet jamais d'un envoi", async () => {
    mocks.files = [FILE]
    await render()
    await act(async () => container.querySelector<HTMLInputElement>('input[value="file-1"]')!.click())
    await fillValidApplication()
    // La source servie au clic est plus récente que la liste affichée.
    mocks.refetchFiles.mockResolvedValue({ data: [{ ...FILE, scan: "blocked" }], isError: false })
    await submitApplication()
    expect(container.textContent).toContain(i18n.t("recovery.filesStale"))
    expect(container.querySelector<HTMLInputElement>("input[type=checkbox][form]")!.checked).toBe(false)
    expect(mocks.apply).not.toHaveBeenCalled()
  })

  it("refus ou chargement des pièces : ne montre aucun ancien nom de fichier et ferme l'envoi", async () => {
    mocks.files = [FILE]; mocks.filesError = true
    await render()
    expect(container.textContent).not.toContain(FILE.filename)
    expect(container.querySelector<HTMLButtonElement>("button[type=submit][form]")!.disabled).toBe(true)
    mocks.filesError = false; mocks.filesPending = true; await render()
    expect(container.textContent).not.toContain(FILE.filename)
    expect(mocks.apply).not.toHaveBeenCalled()
  })

  it("change de personne pendant apply : ignore la réponse et sa navigation, sans reprendre l'ancienne saisie", async () => {
    let finish!: (value: { applicationId: string }) => void
    mocks.apply.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    await render(); await fillValidApplication(); await submitApplication()
    expect(mocks.apply).toHaveBeenCalledOnce()
    mocks.network = { networkId: "network", personId: "other" }; await render()
    await act(async () => finish({ applicationId: "application-old" }))
    expect(mocks.router.push).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLInputElement>("input[autocomplete=given-name]")!.value).toBe("")
    expect(window.sessionStorage.getItem(jobIntentKey(scope))).not.toBeNull()
  })

  it("change d'acteur entre URL et POST : aucun transfert ni enregistrement", async () => {
    let finish!: (url: string) => void
    mocks.generateUploadUrl.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    await render(); await chooseAndUploadPdf()
    mocks.network = { networkId: "other", personId: "other" }; await render()
    await act(async () => finish("https://depot.test/televersement"))
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.registerFile).not.toHaveBeenCalled()
  })

  it("change d'acteur entre POST et register : aucun rattachement de pièce à la nouvelle personne", async () => {
    let finish!: (response: unknown) => void
    vi.mocked(fetch).mockImplementation(() => new Promise((resolve) => { finish = resolve as typeof finish }))
    await render(); await chooseAndUploadPdf()
    expect(fetch).toHaveBeenCalledOnce()
    mocks.network = { networkId: "network", personId: "other" }; await render()
    await act(async () => finish({ ok: true, json: async () => ({ storageId: "old-storage" }) }))
    expect(mocks.registerFile).not.toHaveBeenCalled()
  })

  it("hors ligne conserve la saisie mémoire, suspend les écritures et exige relecture puis nouvel accord au retour", async () => {
    await render(); await fillValidApplication()
    await act(async () => { mocks.online = false; window.dispatchEvent(new Event("offline")) })
    await submitApplication()
    expect(mocks.apply).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLInputElement>("input[autocomplete=given-name]")!.value).toBe("Awa")
    await act(async () => { mocks.online = true; window.dispatchEvent(new Event("online")) })
    expect(container.querySelector<HTMLButtonElement>("button[type=submit][form]")!.disabled).toBe(true)
    expect(container.querySelector<HTMLInputElement>("input[type=checkbox][form]")!.checked).toBe(false)
    await click("recovery.review")
    expect(mocks.refetchFiles).toHaveBeenCalled()
    expect(container.querySelector<HTMLButtonElement>("button[type=submit][form]")!.disabled).toBe(false)
    expect(mocks.apply).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLInputElement>("input[type=checkbox][form]")!.checked).toBe(false)
  })
})

describe("accord lié aux informations relues", () => {
  it("une ancienne réponse ne valide jamais une nouvelle révision pendant la relecture", async () => {
    let finish!: (ready: boolean) => void
    mocks.reviewRead.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    await render(<ReviewProbe condition="revision-1" />)
    await act(async () => [...container.querySelectorAll("button")].find((entry) => entry.textContent === "invalidate")!.click())
    await act(async () => [...container.querySelectorAll("button")].find((entry) => entry.textContent === "review")!.click())
    await render(<ReviewProbe condition="revision-2" />)
    await act(async () => finish(true))
    expect(container.querySelector("[data-paused]")!.getAttribute("data-paused")).toBe("true")
  })
  it("une modification de révision ou de sélection annule l'accord déjà donné", async () => {
    mocks.files = [FILE]
    await render(); await fillValidApplication()
    expect(container.querySelector<HTMLInputElement>("input[type=checkbox][form]")!.checked).toBe(true)
    await act(async () => container.querySelector<HTMLInputElement>('input[value="file-1"]')!.click())
    expect(container.querySelector<HTMLInputElement>("input[type=checkbox][form]")!.checked).toBe(false)
    await act(async () => container.querySelector<HTMLInputElement>("input[type=checkbox][form]")!.click())
    await render(<JobApplicationForm job={{ ...JOB, revision: 2 }} />)
    expect(container.querySelector<HTMLInputElement>("input[type=checkbox][form]")!.checked).toBe(false)
    expect(container.querySelector<HTMLButtonElement>("button[type=submit][form]")!.disabled).toBe(true)
  })
})
