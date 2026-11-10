// @vitest-environment jsdom
import { act, type AnchorHTMLAttributes, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  person: "reader", online: true,
  shop: { name: "Atelier" } as object | null,
  offer: { title: "Sac", actions: { contact: true } } as object | null,
  existing: null as object | null,
  existingError: false,
  request: vi.fn(), replace: vi.fn(), read: vi.fn(),
}))
vi.mock("@antsia/api/engine", () => ({ api: { modules: {
  shops: { shops: { storefront: "shop" }, catalog: { offer: "offer" } },
  commercialMessaging: { threads: { findMyThread: "existing", requestContact: "request" } },
} } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "root", personId: state.person }) }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (key: string) => {
  const read = () => ({ data: key === "shop" ? state.shop : key === "offer" ? state.offer : state.existing, isError: key === "existing" && state.existingError, isPending: false })
  return { ...read(), refetch: async () => { state.read(key); return read() } }
} }))
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: true }), useMutation: () => state.request }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace }) }))
vi.mock("next/link", () => ({ default: ({ children, href, prefetch, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => { void prefetch; return <a href={href} {...rest}>{children}</a> } }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { ContactRequestScreen } from "./contact-request-screen"

let owner = 0
let root: Root
let container: HTMLDivElement
async function render() { await act(async () => root.render(<ContactRequestScreen handle="atelier" offerRef="offer-a" />)) }
const button = (label: string) => [...container.querySelectorAll("button")].find(node => node.textContent === label)!
const textField = () => container.querySelector("textarea")!
const existingLink = () => [...container.querySelectorAll("a")].find(node => node.textContent === "contact.request.openExisting")
async function click(label: string) { await act(async () => button(label).click()) }
async function typeText(value: string) {
  await act(async () => {
    const field = textField()
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, value)
    field.dispatchEvent(new Event("input", { bubbles: true }))
    field.dispatchEvent(new Event("change", { bubbles: true }))
  })
}
async function connection(online: boolean) { await act(async () => { state.online = online; window.dispatchEvent(new Event(online ? "online" : "offline")) }) }
beforeEach(() => {
  vi.clearAllMocks(); owner += 1
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
  state.person = `reader-${owner}`; state.online = true; state.shop = { name: "Atelier" }
  state.offer = { title: "Sac", actions: { contact: true } }; state.existing = null; state.existingError = false
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => state.online })
  state.request.mockReset().mockResolvedValue({ threadId: "thread-a", messageId: "message-a", deduplicated: false })
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe("U07 : demande commerciale réelle", () => {
  it("garde le texte hors ligne, puis attend une relecture explicite sans envoyer au retour du réseau", async () => {
    await render()
    await typeText("Bonjour, quelle est la matière ?")
    await connection(false)
    expect(button("contact.request.send").disabled).toBe(true)
    expect(textField().value).toBe("Bonjour, quelle est la matière ?")
    await connection(true)
    expect(state.request).not.toHaveBeenCalled()
    expect(button("contact.request.send").disabled).toBe(true)
    await click("contact.refresh")
    expect(button("contact.request.send").disabled).toBe(false)
    await click("contact.request.send")
    expect(state.request).toHaveBeenCalledTimes(1)
  })

  it("cherche l'échange après réponse perdue, puis reprend la même clé et le même corps", async () => {
    state.request.mockRejectedValueOnce(new Error("connection_lost"))
    await render()
    await typeText("Question conservée")
    await click("contact.request.send")
    expect(container.textContent).toContain("contact.uncertain")
    expect(textField().readOnly).toBe(true)
    expect(button("contact.retrySame").disabled).toBe(true)
    const first = state.request.mock.calls[0]?.[0] as { idempotencyKey: string; text: string }
    expect(first.text).toBe("Question conservée")
    await click("contact.refresh")
    expect(button("contact.retrySame").disabled).toBe(false)
    expect(state.read).toHaveBeenCalledWith("existing")
    await click("contact.retrySame")
    expect(state.request).toHaveBeenCalledTimes(2)
    expect(state.request.mock.calls[1]?.[0]).toEqual(first)
    expect(state.replace).toHaveBeenCalledTimes(1)
  })

  it("ignore une réponse de l'ancienne personne et ne reprend pas son texte", async () => {
    let complete: (value: { threadId: string; messageId: string; deduplicated: boolean }) => void = () => undefined
    state.request.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    await render()
    await typeText("Texte de l’ancien acteur")
    await click("contact.request.send")
    expect(state.request).toHaveBeenCalledTimes(1)
    state.person = "new-reader"
    await render()
    await act(async () => { complete({ threadId: "old-thread", messageId: "old-message", deduplicated: false }); await Promise.resolve() })
    expect(state.replace).not.toHaveBeenCalled()
    expect(textField().value).toBe("")
  })

  it("un échange autorisé reste ouvrable après retrait, mais un DTO en erreur reste masqué", async () => {
    state.shop = null; state.offer = null; state.existing = { threadId: "historical", state: "blocked" }
    await render()
    expect(existingLink()).toBeDefined()
    expect(textField()).toBeNull()
    state.existingError = true
    await render()
    expect(existingLink()).toBeUndefined()
    expect(textField()).toBeNull()
  })
})
