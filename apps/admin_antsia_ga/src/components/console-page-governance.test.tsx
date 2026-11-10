// @vitest-environment jsdom
/**
 * PG-01 — gouvernance d'une page dans la console : Confiance, Adresse, Administrateur de secours.
 * Chaque geste est motivé (dix caractères au moins), confirmé, et appelle la mutation d'opérateur
 * du moteur (qui écrit la ligne de journal, cliquet `operator-audit`) ; un opérateur lecteur voit
 * sans agir ; le secours n'est proposé qu'à une page sans administrateur actif.
 */
import type { Id } from "@antsia/api/engine"
import { createAppI18n } from "@antsia/social-features/i18n"
import { getFunctionName } from "convex/server"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { appResources } from "@/i18n/resources"
import enOperations from "@/i18n/locales/en/operations.json"
import frOperations from "@/i18n/locales/fr/operations.json"

const state = vi.hoisted(() => ({ data: {} as Record<string, unknown>, queries: vi.fn(), mutation: vi.fn(), toast: vi.fn() }))
vi.mock("convex/react", () => ({
  useQuery: (reference: Parameters<typeof getFunctionName>[0], args: unknown) => {
    const name = getFunctionName(reference)
    state.queries(name, args)
    if (args === "skip") return undefined
    return state.data[name]
  },
  useMutation: () => state.mutation,
}))
vi.mock("sonner", () => ({ toast: { success: state.toast, error: state.toast, warning: state.toast, info: state.toast } }))

import { OperationDraftProvider } from "./console-operation-controls"
import { type GovernedPage, PageGovernancePanel } from "./console-page-governance"

const GOVERNANCE = "modules/pages/admin:pageGovernance"
const FIND = "modules/platform/console:findMember"
const PAGE: GovernedPage = { pageId: "page-1" as Id<"pages">, networkId: "network-a" as Id<"networks">, handle: "pecheurs-lambarene", name: "Association des pêcheurs", ownerKind: "association", trust: "community", status: "active" }
const MOTIVE = "Statuts et procès-verbal vérifiés hors ligne."

let root: Root
let container: HTMLDivElement

async function render(canAdmin: boolean, page: GovernedPage = PAGE) {
  const i18n = createAppI18n({ locale: "fr", appResources: { fr: { ...appResources.fr, operations: frOperations }, en: { ...appResources.en, operations: enOperations } }, defaultNS: "admin" })
  await act(async () => root.render(<I18nextProvider i18n={i18n}><OperationDraftProvider><PageGovernancePanel page={page} canAdmin={canAdmin} /></OperationDraftProvider></I18nextProvider>))
}
function button(label: string) {
  const found = Array.from(container.querySelectorAll("button")).find((element) => element.textContent?.includes(label))
  if (!found) throw new Error(`Missing button ${label}`)
  return found
}
async function changeField(selector: string, value: string) {
  await act(async () => {
    const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector)
    if (!field) throw new Error(`Missing field ${selector}`)
    const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value)
    field.dispatchEvent(new Event("input", { bubbles: true }))
    field.dispatchEvent(new Event("change", { bubbles: true }))
  })
}
async function submitLast() {
  await act(async () => {
    const forms = container.querySelectorAll("form")
    forms[forms.length - 1]?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  state.data = {}
  state.queries.mockReset(); state.mutation.mockReset(); state.toast.mockReset()
  container = document.createElement("div"); document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks() })

describe("PG-01 — onglets de gouvernance", () => {
  it("trois onglets accessibles ; les flèches passent d'un onglet à l'autre", async () => {
    await render(true)
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'))
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Confiance", "Adresse", "Administrateur de secours"])
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true")
    await act(async () => { tabs[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })) })
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Adresse")
    expect(container.textContent).toContain("aucune redirection n’existe")
  })

  it("un opérateur lecteur voit l'état sans agir, ni rechercher de membre", async () => {
    state.data[GOVERNANCE] = { liveAdmins: 0, pendingAdmins: 0, federated: false }
    await render(false)
    expect(container.textContent).toContain("exige le rôle d’administrateur de la plateforme")
    expect(container.querySelector("fieldset")?.disabled).toBe(true)
    expect(button("Poser cette confiance").disabled).toBe(true)
    await act(async () => button("Administrateur de secours").click())
    expect(container.textContent).toContain("Aucun administrateur actif")
    expect(button("Rechercher le membre").disabled).toBe(true)
    expect(state.queries.mock.calls.some(([name, args]) => name === FIND && args !== "skip")).toBe(false)
  })
})

describe("PG-01 — confiance", () => {
  it("« Officiel » n'est pas proposé à une association ; motif borné, confirmation, mutation d'opérateur", async () => {
    state.mutation.mockResolvedValue({ changed: true })
    await render(true)
    expect(Array.from(container.querySelectorAll("option")).map((option) => option.textContent)).toEqual(["Vérifié", "Communauté"])
    await changeField('[name="trust"]', "verified")
    await changeField('[name="reason"]', "Trop bref")
    await submitLast()
    expect(state.mutation).not.toHaveBeenCalled()
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false)
    await changeField('[name="reason"]', MOTIVE)
    await submitLast()
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("« Vérifié »"))
    expect(state.mutation).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    await submitLast()
    expect(state.mutation).toHaveBeenCalledWith({ pageId: "page-1", trust: "verified", reason: MOTIVE })
    expect(state.toast).toHaveBeenCalledWith("Confiance posée et inscrite au journal.")
  })

  it("la confiance actuelle n'est pas une décision", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true)
    await render(true)
    await changeField('[name="reason"]', MOTIVE)
    await submitLast()
    expect(state.mutation).not.toHaveBeenCalled()
    expect(container.textContent).toContain("Choisissez une confiance différente de l’actuelle.")
  })
})

describe("PG-01 — adresse", () => {
  it("prévient que les anciens liens cessent d'aboutir, refuse la même adresse, puis change l'adresse motivée", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true)
    state.mutation.mockResolvedValue({ handle: "pecheurs-du-lac" })
    await render(true)
    await act(async () => button("Adresse").click())
    expect(container.textContent).toContain("Adresse actuelle : pecheurs-lambarene")
    await changeField('[name="handle"]', "pecheurs-lambarene")
    await changeField('[name="reason"]', MOTIVE)
    await submitLast()
    expect(state.mutation).not.toHaveBeenCalled()
    await changeField('[name="handle"]', "pecheurs-du-lac")
    await submitLast()
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("« pecheurs-du-lac »"))
    expect(state.mutation).toHaveBeenCalledWith({ pageId: "page-1", handle: "pecheurs-du-lac", reason: MOTIVE })
    expect(state.toast).toHaveBeenCalledWith("Adresse changée et inscrite au journal.")
  })
})

describe("PG-01 — administrateur de secours", () => {
  it("une page qui a un administrateur actif n'offre aucun secours", async () => {
    state.data[GOVERNANCE] = { liveAdmins: 1, pendingAdmins: 0, federated: false }
    await render(true)
    await act(async () => button("Administrateur de secours").click())
    expect(state.queries).toHaveBeenCalledWith(GOVERNANCE, { pageId: "page-1" })
    expect(container.textContent).toContain("Cette page a 1 administrateur actif : le secours ne s’applique pas.")
    expect(container.textContent).not.toContain("Rechercher le membre")
  })

  it("une page reflétée ou retirée ne se reprend pas ici", async () => {
    state.data[GOVERNANCE] = { liveAdmins: 0, pendingAdmins: 0, federated: true }
    await render(true)
    await act(async () => button("Administrateur de secours").click())
    expect(container.textContent).toContain("Page reflétée")
    await act(async () => root.unmount())
    root = createRoot(container)
    state.data[GOVERNANCE] = { liveAdmins: 0, pendingAdmins: 0, federated: false }
    await render(true, { ...PAGE, status: "inactive" })
    await act(async () => button("Administrateur de secours").click())
    expect(container.textContent).toContain("Rétablissez la page")
    expect(container.textContent).not.toContain("Rechercher le membre")
  })

  it("une page abandonnée : le membre trouvé dans le réseau de la page est désigné, motif et confirmation à l'appui", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true)
    state.data[GOVERNANCE] = { liveAdmins: 0, pendingAdmins: 0, federated: false }
    state.data[FIND] = { personId: "person-bob", handle: "bob", displayName: "Bob NZE" }
    state.mutation.mockResolvedValue({ invited: true })
    await render(true)
    await act(async () => button("Administrateur de secours").click())
    await changeField('[name="handle"]', "@bob")
    await act(async () => button("Rechercher le membre").click())
    expect(state.queries).toHaveBeenCalledWith(FIND, { networkId: "network-a", handle: "bob" })
    expect(container.textContent).toContain("Bob NZE")
    await changeField('[name="reason"]', "Trop bref")
    await submitLast()
    expect(state.mutation).not.toHaveBeenCalled()
    await changeField('[name="reason"]', "Le bureau élu a demandé la reprise de la page par écrit.")
    await submitLast()
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Bob NZE"))
    expect(state.mutation).toHaveBeenCalledWith({ pageId: "page-1", personId: "person-bob", reason: "Le bureau élu a demandé la reprise de la page par écrit." })
    expect(state.toast).toHaveBeenCalledWith("Invitation envoyée et inscrite au journal.")
  })
})
