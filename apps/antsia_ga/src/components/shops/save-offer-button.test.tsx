// @vitest-environment jsdom
/** CM-09 : le bouton « Enregistrer » à bascule (état, nom, envoi, retour en cas de refus) ; aucun navigateur réel. */
import { ConvexError } from "convex/values"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  saved: undefined as boolean | undefined,
  save: vi.fn<(args: unknown) => Promise<unknown>>(),
  remove: vi.fn<(args: unknown) => Promise<unknown>>(),
  success: vi.fn(),
  failure: vi.fn(),
  queries: [] as unknown[],
}))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: { savedOffers: { isSaved: "isSaved", save: "save", remove: "remove" } } } } }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (query: string, args: unknown) => { state.queries.push([query, args]); return { data: state.saved, isPending: state.saved === undefined, isError: false } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "network-fixture", personId: "reader-fixture" }) }))
vi.mock("convex/react", () => ({ useMutation: (reference: string) => reference === "save" ? state.save : state.remove }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.failure } }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => options ? `${key}:${JSON.stringify(options)}` : key }) }))

import { SaveOfferButton } from "./save-offer-button"

const OFFER = { shopHandle: "epicerie-moussavou-demo", offerRef: "demo:offer:riz-parfume", title: "Riz parfumé — Démo" }
const ARGS = { networkId: "network-fixture", handle: OFFER.shopHandle, offerRef: OFFER.offerRef }
let root: Root | undefined
let container: HTMLDivElement

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  state.saved = false
  state.queries.length = 0
  for (const mock of [state.save, state.remove, state.success, state.failure]) mock.mockReset()
  container = document.createElement("div")
  document.body.append(container)
})
afterEach(() => { act(() => root?.unmount()); root = undefined; container.remove() })

function mount(layout?: "overlay" | "inline") {
  act(() => { root = createRoot(container); root.render(<SaveOfferButton offer={OFFER} layout={layout} />) })
  return container.querySelector<HTMLButtonElement>("button[data-save-offer]")!
}

describe("CM-09 — bouton « Enregistrer »", () => {
  it("lit l'état de MA ligne pour cette offre, et reste inactif tant qu'il est inconnu", () => {
    state.saved = undefined
    const button = mount()
    expect(state.queries).toContainEqual(["isSaved", ARGS])
    expect(button.disabled).toBe(true)
    expect(button.getAttribute("aria-pressed")).toBe("false")
  })

  it("pastille de carte : nom qui nomme l'offre, bascule tout de suite, enregistre et l'annonce", async () => {
    let resolve: (value: unknown) => void = () => undefined
    state.save.mockReturnValue(new Promise((done) => { resolve = done }))
    const button = mount()
    expect(button.getAttribute("aria-label")).toBe(`saved.saveNamed:${JSON.stringify({ title: OFFER.title })}`)
    expect(button.className).toContain("size-11")
    await act(async () => { button.click() })
    expect(state.save).toHaveBeenCalledWith(ARGS)
    expect(button.getAttribute("aria-pressed")).toBe("true")
    expect(button.getAttribute("aria-label")).toBe(`saved.savedNamed:${JSON.stringify({ title: OFFER.title })}`)
    // Un second appui pendant l'envoi ne renvoie rien et ne fait pas perdre le focus.
    await act(async () => { button.click() })
    expect(state.save).toHaveBeenCalledTimes(1)
    expect(button.disabled).toBe(false)
    await act(async () => { resolve({ saved: true }) })
    expect(state.success).toHaveBeenCalledWith("saved.added", expect.objectContaining({ action: expect.objectContaining({ label: "saved.open" }) }))
  })

  it("une offre déjà enregistrée se retire ; un refus du moteur rend l'état d'origine et se dit", async () => {
    state.saved = true
    state.remove.mockResolvedValue({ saved: false })
    const button = mount()
    expect(button.getAttribute("aria-pressed")).toBe("true")
    await act(async () => { button.click() })
    expect(state.remove).toHaveBeenCalledWith(ARGS)
    expect(state.success).toHaveBeenCalledWith("saved.removed")

    state.saved = false
    state.save.mockRejectedValue(new ConvexError({ code: "policyRefused", appRule: "saved_offer_quota", appParams: { max: 200 } }))
    act(() => root?.unmount())
    const again = mount()
    await act(async () => { again.click() })
    expect(state.failure).toHaveBeenCalledWith('saved.errors.saved_offer_quota:{"max":200}')
    expect(again.getAttribute("aria-pressed")).toBe("false")
  })

  it("bouton de fiche : texte visible « Enregistrer » puis « Enregistré », sans nom remplacé", async () => {
    state.save.mockResolvedValue({ saved: true })
    const button = mount("inline")
    expect(button.textContent).toBe("saved.save")
    expect(button.hasAttribute("aria-label")).toBe(false)
    await act(async () => { button.click() })
    state.saved = true
    act(() => root?.render(<SaveOfferButton offer={OFFER} layout="inline" />))
    expect(button.textContent).toBe("saved.savedState")
    expect(button.getAttribute("aria-pressed")).toBe("true")
  })
})
