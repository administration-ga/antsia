// @vitest-environment jsdom
/** P16 : callbacks et motifs protégés par acteur/lecture ; scénarios écrits, non exécutés. */
import type { Id } from "@antsia/api/engine"
import { createAppI18n } from "@antsia/social-features/i18n"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { appResources } from "@/i18n/resources"
const mocks = vi.hoisted(() => ({
  appeal: vi.fn(), toast: vi.fn(), authenticated: true, leaving: false,
  pagesError: false, pagesPending: false, decisionsError: false, decisionsPending: false,
}))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { pages: { pages: { myPages: "pages" } }, moderation: { cases: { pageDecisions: "decisions", fileAppeal: "appeal" } } } } }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (ref: string) => ref === "pages"
  ? { data: [{ pageId: "page-a", name: "Atelier" }], isError: mocks.pagesError, isPending: mocks.pagesPending }
  : { data: { page: [{ reportId: "report-a", status: "actioned", decisionReason: "Motif privé de retrait", appeals: [] }], isDone: true, continueCursor: "" }, isError: mocks.decisionsError, isPending: mocks.decisionsPending } }))
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: mocks.authenticated }), useMutation: () => mocks.appeal }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => mocks.leaving }))
vi.mock("sonner", () => ({ toast: { success: mocks.toast, error: mocks.toast } }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
import { PageModerationDecisions } from "./page-moderation-decisions"
const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "antsia" })
let root: Root, container: HTMLDivElement
async function render(personId = "person-a", networkId = "network-a") {
  await act(async () => root.render(<I18nextProvider i18n={i18n}><PageModerationDecisions personId={personId as Id<"persons">} networkId={networkId as Id<"networks">} /></I18nextProvider>))
}
async function fill() {
  const input = container.querySelector("textarea")!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "Je demande un second examen motivé.")
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
async function submit() { await act(async () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click()) }
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  mocks.appeal.mockReset(); mocks.toast.mockReset(); mocks.authenticated = true; mocks.leaving = false
  mocks.pagesError = false; mocks.pagesPending = false; mocks.decisionsError = false; mocks.decisionsPending = false
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
describe("recours de page sous acteur courant", () => {
  it("envoie le vrai report et son motif, puis confirme uniquement sous le même acteur", async () => {
    mocks.appeal.mockResolvedValue(null)
    await render(); await fill(); await submit()
    expect(mocks.appeal).toHaveBeenCalledWith({ reportId: "report-a", reason: "Je demande un second examen motivé." })
    expect(mocks.toast).toHaveBeenCalledWith(i18n.t("personal.appealSent"))
  })
  it.each([["person-b", "network-a"], ["person-a", "network-b"]])("ignore une réponse tardive après changement d'acteur %s/%s", async (personId, networkId) => {
    let finish!: (result: null) => void
    mocks.appeal.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    await render(); await fill(); await submit(); await render(personId, networkId)
    await act(async () => finish(null))
    expect(mocks.toast).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe("")
  })
  it("ignore une réponse après fermeture et un clic pendant la sortie", async () => {
    let finish!: (result: null) => void
    mocks.appeal.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    await render(); await fill(); await submit()
    await act(async () => root.render(<I18nextProvider i18n={i18n}><p>Autre écran</p></I18nextProvider>))
    await act(async () => finish(null))
    expect(mocks.toast).not.toHaveBeenCalled()
    mocks.appeal.mockReset(); await render(); await fill(); mocks.leaving = true; await submit()
    expect(mocks.appeal).not.toHaveBeenCalled()
  })
  it("le refus ou le chargement masque les anciens motifs et leur formulaire", async () => {
    await render(); expect(container.textContent).toContain("Motif privé de retrait")
    mocks.decisionsError = true; await render()
    expect(container.textContent).not.toContain("Motif privé de retrait"); expect(container.querySelector("form")).toBeNull()
    mocks.decisionsError = false; mocks.decisionsPending = true; await render()
    expect(container.textContent).not.toContain("Motif privé de retrait")
    mocks.decisionsPending = false; mocks.pagesPending = true; await render()
    expect(container.textContent).not.toContain("Atelier")
  })
})
