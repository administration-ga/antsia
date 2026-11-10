// @vitest-environment jsdom
/** MC-02 — l'onglet « Réglages » : réglage par surface, mots bloqués, motif obligatoire, états vide et erreur. */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Policy = { preReview: boolean; maxLinks: number; maxWrites: number; windowMs: number; updatedAt: number }
const state = vi.hoisted(() => ({
  settings: undefined as undefined | { defaults: { preReview: boolean; maxLinks: number; maxWrites: number; windowMs: number }; surfaces: { surface: string; withoutPolicy: "defaults" | "held" | "unchecked"; policy: Policy | null }[] },
  settingsError: null as unknown,
  terms: undefined as undefined | { page: { termId: string; term: string; updatedAt: number }[]; isDone: boolean; continueCursor: string },
  termsError: null as unknown,
  calls: [] as unknown[],
  mutation: vi.fn(),
  success: vi.fn(),
  failure: vi.fn(),
}))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { moderation: { cases: { policies: "policies", blockedTermsPage: "terms", setPolicy: "setPolicy", setBlockedTerm: "setBlockedTerm" }, reviewProjection: { preview: "preview" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "network" }) }))
vi.mock("@antsia/api/viewer-preferences", () => ({ useViewerTimeZone: () => "UTC" }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("@antsia/social-features/reseau-personnel", () => ({ PostMedia: () => null }))
vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: (reference: string, args: unknown) => {
    state.calls.push([reference, args])
    return reference === "policies" ? { data: state.settings, error: state.settingsError, refetch: vi.fn() } : { data: state.terms, error: state.termsError, refetch: vi.fn() }
  },
}))
vi.mock("convex/react", () => ({ useMutation: (reference: string) => (args: unknown) => state.mutation(reference, args) }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "fr" } }) }))
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.failure, info: vi.fn() } }))

import { ModerationGuard } from "./moderation-guard"
import { ModerationSettings } from "./moderation-settings"

let root: Root | undefined
let container: HTMLDivElement
async function mount() { root = createRoot(container); await act(async () => { root?.render(<ModerationGuard><ModerationSettings /></ModerationGuard>) }) }
function form(label: string): HTMLFormElement {
  const found = container.querySelector<HTMLFormElement>(`form[aria-label="${label}"]`)
  if (!found) throw new Error(`Formulaire absent : ${label}`)
  return found
}
async function type(element: HTMLInputElement | HTMLTextAreaElement | null | undefined, text: string) {
  if (!element) throw new Error("Champ absent")
  await act(async () => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, text)
    element.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
async function submit(target: HTMLFormElement) { await act(async () => { target.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })) }) }

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement("div"); document.body.append(container)
  state.settings = {
    defaults: { preReview: false, maxLinks: 2, maxWrites: 30, windowMs: 60_000 },
    surfaces: [
      { surface: "post", withoutPolicy: "defaults", policy: null },
      { surface: "comment", withoutPolicy: "defaults", policy: { preReview: true, maxLinks: 1, maxWrites: 10, windowMs: 120_000, updatedAt: 1_700_000_000_000 } },
      { surface: "commerceOffer", withoutPolicy: "held", policy: null },
      { surface: "diasporaAidQuestion", withoutPolicy: "unchecked", policy: null },
    ],
  }
  state.settingsError = null
  state.terms = { page: [{ termId: "t1", term: "arnaque", updatedAt: 1 }], isDone: true, continueCursor: "" }
  state.termsError = null
  state.calls = []
  state.mutation.mockReset().mockResolvedValue({ policyId: "policy" }); state.success.mockReset(); state.failure.mockReset()
})
afterEach(async () => { await act(async () => { root?.unmount() }); root = undefined; container.remove() })

describe("MC-02 — réglage par surface", () => {
  it("lit les réglages du seul réseau courant, sans équipe, et dit la règle d'une surface sans réglage", async () => {
    await mount()
    expect(state.calls[0]).toEqual(["policies", { networkId: "network" }])
    expect(state.calls).toContainEqual(["terms", { networkId: "network", paginationOpts: { numItems: 20, cursor: null, maximumRowsRead: 50, maximumBytesRead: 262_144 } }])
    expect(container.textContent).toContain("moderation.policy.withoutDefaults")
    expect(container.querySelector<HTMLInputElement>('input[name="maxLinks"]')?.value).toBe("2")
    expect(container.querySelector<HTMLInputElement>('input[name="windowSeconds"]')?.value).toBe("60")
    // Les surfaces réglées sont récapitulées ; les autres disent leur règle réelle (défauts, relecture d'office, aucune règle).
    expect(container.textContent).toContain("moderation.policy.summary")
    for (const [surface, phrase] of [["comment", "moderation.policy.explicit"], ["commerceOffer", "moderation.policy.withoutHeld"], ["diasporaAidQuestion", "moderation.policy.withoutUnchecked"]] as const) {
      await act(async () => { const select = container.querySelector<HTMLSelectElement>("select"); if (select) { select.value = surface; select.dispatchEvent(new Event("change", { bubbles: true })) } })
      expect(container.textContent).toContain(phrase)
    }
  })

  it("enregistre un réglage motivé, fenêtre convertie en millisecondes et motif nettoyé", async () => {
    await mount()
    const policy = form("moderation.policy.formLabel")
    await act(async () => { policy.querySelector<HTMLInputElement>('input[name="preReview"]')?.click() })
    await type(policy.querySelector<HTMLInputElement>('input[name="maxLinks"]'), "1")
    await type(policy.querySelector<HTMLInputElement>('input[name="maxWrites"]'), "20")
    await type(policy.querySelector<HTMLInputElement>('input[name="windowSeconds"]'), "120")
    await type(policy.querySelector("textarea"), "  Relecture pendant le pilote.  ")
    await submit(policy)
    expect(state.mutation).toHaveBeenCalledWith("setPolicy", { networkId: "network", surface: "post", preReview: true, maxLinks: 1, maxWrites: 20, windowMs: 120_000, reason: "Relecture pendant le pilote." })
    expect(state.success).toHaveBeenCalled()
  })

  it("refuse sans appel un motif absent ou une valeur hors des bornes du moteur", async () => {
    await mount()
    const policy = form("moderation.policy.formLabel")
    await submit(policy)
    expect(state.mutation).not.toHaveBeenCalled()
    expect(container.textContent).toContain("moderation.reasonInvalid")
    await type(policy.querySelector("textarea"), "Motif suffisant.")
    for (const [name, value] of [["maxLinks", "21"], ["maxWrites", "0"], ["windowSeconds", ""]] as const) {
      await type(policy.querySelector<HTMLInputElement>(`input[name="${name}"]`), value)
      await submit(policy)
      expect(state.mutation).not.toHaveBeenCalled()
    }
    expect(container.textContent).toContain("moderation.policy.maxLinksInvalid")
  })

  it("une panne de lecture se dit et se réessaie, sans formulaire", async () => {
    state.settingsError = new Error("indisponible")
    await mount()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("common.failed")
    expect(container.querySelector("form")).toBeNull()
  })
})

describe("MC-02 — mots bloqués", () => {
  it("ajoute un mot actif avec son motif ; un mot trop court ne part pas", async () => {
    await mount()
    const add = form("moderation.terms.addLabel")
    await type(add.querySelector<HTMLInputElement>('input[name="term"]'), " é ")
    await type(add.querySelector("textarea"), "Vague de fraudes signalée.")
    await submit(add)
    expect(state.mutation).not.toHaveBeenCalled()
    expect(container.textContent).toContain("moderation.terms.termInvalid")
    await type(add.querySelector<HTMLInputElement>('input[name="term"]'), "Mobile Money")
    await submit(add)
    expect(state.mutation).toHaveBeenCalledWith("setBlockedTerm", { networkId: "network", term: "Mobile Money", active: true, reason: "Vague de fraudes signalée." })
  })

  it("retire un mot après un motif, dans un formulaire distinct de son déclencheur", async () => {
    await mount()
    const trigger = [...container.querySelectorAll("button")].find((button) => button.textContent === "moderation.terms.remove")
    await act(async () => { trigger?.click() })
    const removal = form("moderation.terms.removeLabel")
    await submit(removal)
    expect(state.mutation).not.toHaveBeenCalled()
    await type(removal.querySelector("textarea"), "Mot devenu inutile.")
    await submit(removal)
    expect(state.mutation).toHaveBeenCalledWith("setBlockedTerm", { networkId: "network", term: "arnaque", active: false, reason: "Mot devenu inutile." })
  })

  it("dit une liste vide, et une panne de la liste sans masquer l'ajout", async () => {
    state.terms = { page: [], isDone: true, continueCursor: "" }
    await mount()
    expect(container.textContent).toContain("moderation.terms.empty")
    await act(async () => { root?.unmount() }); root = undefined
    state.termsError = new Error("indisponible")
    await mount()
    expect(container.textContent).toContain("common.retry")
    expect(container.querySelector('form[aria-label="moderation.terms.addLabel"]')).not.toBeNull()
  })
})
