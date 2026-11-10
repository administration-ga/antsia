// @vitest-environment jsdom
/** MC-02 — le réglage de modération d'un réseau depuis la console, dans la section des équipes. */
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

const state = vi.hoisted(() => ({ data: {} as Record<string, unknown>, queries: vi.fn(), mutations: vi.fn(), toast: vi.fn() }))
vi.mock("convex/react", () => ({
  useQuery: (reference: Parameters<typeof getFunctionName>[0], args: unknown) => {
    const name = getFunctionName(reference)
    state.queries(name, args)
    return args === "skip" ? undefined : state.data[name]
  },
  useMutation: (reference: Parameters<typeof getFunctionName>[0]) => (args: unknown) => state.mutations(getFunctionName(reference), args),
}))
vi.mock("sonner", () => ({ toast: { success: state.toast, error: state.toast, warning: state.toast, info: state.toast } }))

import { OperationsPanel } from "./console-operations"

let root: Root
let container: HTMLDivElement
const networkId = "network-a" as Id<"networks">
const defaults = { preReview: false, maxLinks: 2, maxWrites: 30, windowMs: 60_000 }

async function render() {
  const i18n = createAppI18n({ locale: "fr", appResources: { fr: { ...appResources.fr, operations: frOperations }, en: { ...appResources.en, operations: enOperations } }, defaultNS: "admin" })
  await act(async () => root.render(<I18nextProvider i18n={i18n}><OperationsPanel section="teams" networkId={networkId} canAdmin={false} /></I18nextProvider>))
}
function form(label: string): HTMLFormElement {
  const found = container.querySelector<HTMLFormElement>(`form[aria-label="${label}"]`)
  if (!found) throw new Error(`Formulaire absent : ${label}`)
  return found
}
async function change(field: HTMLInputElement | HTMLTextAreaElement | null, value: string) {
  if (!field) throw new Error("Champ absent")
  await act(async () => {
    const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value)
    field.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
async function submit(target: HTMLFormElement) { await act(async () => { target.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })) }) }

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  state.data = {
    "modules/platform/console:listTeams": [],
    "modules/platform/console:moderationPolicies": { defaults, surfaces: [{ surface: "post", withoutPolicy: "defaults", policy: null }, { surface: "commerceOffer", withoutPolicy: "held", policy: null }] },
    "modules/platform/console:blockedTerms": { page: [{ termId: "t1", term: "arnaque", updatedAt: 1 }], isDone: true, continueCursor: "" },
  }
  state.queries.mockReset(); state.mutations.mockReset().mockResolvedValue({ policyId: "policy" }); state.toast.mockReset()
  container = document.createElement("div"); document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe("MC-02 — réglages de modération dans la console", () => {
  it("la section des équipes lit les réglages du réseau choisi et dit les défauts du moteur", async () => {
    await render()
    expect(state.queries).toHaveBeenCalledWith("modules/platform/console:moderationPolicies", { networkId })
    expect(state.queries).toHaveBeenCalledWith("modules/platform/console:blockedTerms", { networkId, paginationOpts: { cursor: null, numItems: 20, maximumRowsRead: 50, maximumBytesRead: 262_144 } })
    expect(container.textContent).toContain("Réglages de modération du réseau")
    expect(container.textContent).toContain("Aucun réglage posé : défauts du moteur (relecture préalable : non ; 2 liens au plus ; 30 écritures par 60 s).")
    expect(container.textContent).toContain("arnaque")
  })

  it("l'opérateur enregistre un réglage motivé, fenêtre en millisecondes ; sans motif, rien ne part", async () => {
    await render()
    const policy = form("Réglage de la surface : Publications")
    await submit(policy)
    expect(state.mutations).not.toHaveBeenCalled()
    await change(policy.querySelector<HTMLInputElement>('input[name="maxLinks"]'), "1")
    await change(policy.querySelector<HTMLInputElement>('input[name="windowSeconds"]'), "300")
    await change(policy.querySelector("textarea"), "  Un lien au plus pendant le pilote.  ")
    await submit(policy)
    expect(state.mutations).toHaveBeenCalledWith("modules/platform/console:setModerationPolicy", { networkId, surface: "post", preReview: false, maxLinks: 1, maxWrites: 30, windowMs: 300_000, reason: "Un lien au plus pendant le pilote." })
  })

  it("ajoute un mot bloqué, puis en retire un, chaque fois avec un motif", async () => {
    await render()
    const add = form("Ajouter un mot bloqué")
    await change(add.querySelector<HTMLInputElement>('input[name="term"]'), "Mobile Money")
    await change(add.querySelector("textarea"), "Vague de fraudes signalée.")
    await submit(add)
    expect(state.mutations).toHaveBeenCalledWith("modules/platform/console:setBlockedTerm", { networkId, term: "Mobile Money", active: true, reason: "Vague de fraudes signalée." })
    const trigger = [...container.querySelectorAll("button")].find((button) => button.textContent === "Retirer « arnaque »")
    await act(async () => { trigger?.click() })
    const removal = form("Retirer « arnaque »")
    await change(removal.querySelector("textarea"), "Mot devenu inutile.")
    await submit(removal)
    expect(state.mutations).toHaveBeenLastCalledWith("modules/platform/console:setBlockedTerm", { networkId, term: "arnaque", active: false, reason: "Mot devenu inutile." })
  })
})
