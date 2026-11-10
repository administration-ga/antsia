// @vitest-environment jsdom
import { act, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CART_CHANGED_EVENT, CART_DRAFT_TTL_MS, cartDraftKey, type CartDraft } from "@/lib/cart-draft"
import { readCartBook, saveCartBookDraft } from "@/lib/cart-book"

const mocks = vi.hoisted(() => ({ network: "network-a", person: "person-a", signingOut: false, namespace: "" }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: mocks.network, personId: mocks.person }) }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => mocks.signingOut }))
vi.mock("@/lib/demo-storage", () => ({ demoStorageNamespace: () => mocks.namespace }))
import { useCartDraft } from "./use-cart-draft"

const NOW = Date.UTC(2026, 9, 21, 16)
type CartHook = ReturnType<typeof useCartDraft>
let root: Root, container: HTMLDivElement, a: CartHook, b: CartHook, active: CartHook
function draft(handle: string, updatedAt = NOW): CartDraft { return { version: 1, networkId: "network-a", personId: "person-a", handle, updatedAt, items: [{ offerRef: `pro.ga:offer:${handle}`, quantity: 1 }], submitted: null } }
function stored() { return readCartBook(sessionStorage, "network-a", "person-a", Date.now()) }
function Probe({ handleA = "atelier", handleB = "epicerie" }: { handleA?: string; handleB?: string }) {
  const sellerA = useCartDraft(handleA), sellerB = useCartDraft(handleB), current = useCartDraft()
  useEffect(() => { a = sellerA; b = sellerB; active = current }, [sellerA, sellerB, current])
  return <p>{current.selectedHandle ?? "empty"}</p>
}
async function render(handleA?: string, handleB?: string) { await act(async () => root.render(<Probe handleA={handleA} handleB={handleB} />)) }
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers(); vi.setSystemTime(NOW)
  mocks.network = "network-a"; mocks.person = "person-a"; mocks.signingOut = false; mocks.namespace = ""
  sessionStorage.clear(); container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); sessionStorage.clear(); vi.clearAllTimers(); vi.useRealTimers() })

describe("paniers par vendeur dans la session", () => {
  it("migre à la lecture un vrai panier V1 et préserve ses lignes", async () => {
    sessionStorage.setItem(cartDraftKey("network-a", "person-a"), JSON.stringify(draft("atelier")))
    await render()
    expect(a.ready).toBe(true)
    expect(a.draft).toEqual(draft("atelier"))
    expect(b.draft).toBeNull()
    expect(active.selectedHandle).toBe("atelier")
    expect(JSON.parse(sessionStorage.getItem(cartDraftKey("network-a", "person-a"))!).version).toBe(2)
  })

  it("deux instances enregistrent deux vendeurs dans la même action sans écrasement", async () => {
    await render()
    const saveA = a.save, saveB = b.save
    await act(async () => { expect(saveA(draft("atelier"))).toBe(true); expect(saveB(draft("epicerie"))).toBe(true) })
    expect(a.draft?.handle).toBe("atelier"); expect(b.draft?.handle).toBe("epicerie")
    expect(active.drafts.map(entry => entry.handle)).toEqual(["atelier", "epicerie"])
    expect(active.selectedHandle).toBe("epicerie")
    await act(async () => { expect(active.select("atelier")).toBe(true) })
    expect(active.draft?.handle).toBe("atelier")
    expect(stored()?.drafts).toEqual([draft("atelier"), draft("epicerie")])
  })

  it("annonce le plafond sans évincer et libère uniquement un vendeur explicitement retiré", async () => {
    for (let index = 0; index < 8; index++) saveCartBookDraft(sessionStorage, "network-a", "person-a", draft(`seller-${index}`), `seller-${index}`, NOW)
    await render("ninth", "seller-0")
    await act(async () => { expect(a.save(draft("ninth"))).toBe(false); expect(a.getSaveError()).toBe("drafts_full") })
    expect(a.saveError).toBe("drafts_full")
    expect(stored()?.drafts).toHaveLength(8)
    await act(async () => { expect(b.save(null)).toBe(true) })
    expect(stored()?.drafts.map(entry => entry.handle)).toEqual(Array.from({ length: 7 }, (_, i) => `seller-${i + 1}`))
    await act(async () => { expect(a.save(draft("ninth"))).toBe(true) })
    expect(a.saveError).toBeNull(); expect(stored()?.drafts).toHaveLength(8)
  })

  it("refuse une réponse ancienne après changement d'acteur, réseau, vendeur ou sélection", async () => {
    await render()
    await act(async () => { a.save(draft("atelier")); b.save(draft("epicerie")) })
    const previousSelectionSave = active.save
    await act(async () => { active.select("atelier") })
    expect(previousSelectionSave(draft("epicerie"))).toBe(false)
    expect(stored()?.selectedHandle).toBe("atelier")
    const previousHandleSave = a.save
    await render("nouveau")
    expect(previousHandleSave(draft("atelier"))).toBe(false)
    const previousOwnerSave = b.save
    mocks.person = "person-b"; await render("nouveau")
    expect(previousOwnerSave(draft("epicerie"))).toBe(false)
    expect(active.drafts).toEqual([])
    const previousNetworkSave = active.save
    mocks.network = "network-b"; await render("nouveau")
    expect(previousNetworkSave({ ...draft("nouveau"), personId: "person-b" })).toBe(false)
    expect(sessionStorage.getItem(cartDraftKey("network-b", "person-b"))).toBeNull()
    expect(stored()?.drafts.map(entry => entry.handle)).toEqual(["atelier", "epicerie"])
  })

  it("bloque la sortie et ne réadopte pas un brouillon purgé depuis une fermeture ancienne", async () => {
    await render()
    await act(async () => { a.save(draft("atelier")) })
    const previous = a.save
    mocks.signingOut = true
    expect(previous(draft("atelier"))).toBe(false)
    sessionStorage.clear()
    await act(async () => { window.dispatchEvent(new Event(CART_CHANGED_EVENT)) })
    mocks.signingOut = false
    await act(async () => { expect(previous(draft("atelier"))).toBe(false) })
    expect(sessionStorage.length).toBe(0)
  })

  it("expire successivement les paniers et conserve les espaces démo et réel séparés", async () => {
    saveCartBookDraft(sessionStorage, "network-a", "person-a", draft("atelier", NOW - CART_DRAFT_TTL_MS + 1000), "atelier", NOW)
    saveCartBookDraft(sessionStorage, "network-a", "person-a", draft("epicerie"), "epicerie", NOW)
    await render()
    expect(active.drafts).toHaveLength(2)
    await act(async () => { vi.advanceTimersByTime(1020) })
    expect(a.draft).toBeNull(); expect(b.draft?.handle).toBe("epicerie")
    await act(async () => { vi.advanceTimersByTime(CART_DRAFT_TTL_MS - 1000) })
    expect(active.drafts).toEqual([])
    vi.setSystemTime(NOW)
    mocks.namespace = "antsia-demo-scope:"; await render()
    expect(active.drafts).toEqual([])
    await act(async () => { a.save(draft("atelier")) })
    expect(sessionStorage.getItem("antsia-demo-scope:antsia:cart:network-a:person-a")).not.toBeNull()
    expect(sessionStorage.getItem("antsia:cart:network-a:person-a")).not.toBeNull()
  })

  it("conserve le V1 quand la migration est bloquée et refuse un nouvel envoi non sauvegardé", async () => {
    const raw = JSON.stringify(draft("atelier"))
    const storage = window.sessionStorage
    storage.setItem(cartDraftKey("network-a", "person-a"), raw)
    const blocked: Storage = { get length() { return storage.length }, key: storage.key.bind(storage), clear: storage.clear.bind(storage), getItem: storage.getItem.bind(storage), removeItem: storage.removeItem.bind(storage), setItem: () => { throw new Error("quota") } }
    vi.spyOn(window, "sessionStorage", "get").mockReturnValue(blocked)
    await render()
    expect(a.draft).toEqual(draft("atelier"))
    await act(async () => { expect(b.save(draft("epicerie"))).toBe(false) })
    expect(b.getSaveError()).toBe("storage_unavailable")
    expect(storage.getItem(cartDraftKey("network-a", "person-a"))).toBe(raw)
  })
})
