// @vitest-environment jsdom
/**
 * P18b (A15) — `.msg-tool-btn`, les gestes du canal commercial, existe enfin
 * dans la feuille de la messagerie : 44 px au moins, jetons de la charte (clair
 * et sombre), anneau de focus, survol et désactivé, aucune couleur littérale.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react"
import { act, createElement } from "react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ decide: vi.fn(), canDecide: true }))
vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}))
vi.mock("./commercial-messaging-source", () => ({
  COMMERCIAL_MESSAGING_SOURCE: {
    useThread: () => ({ data: { threadId: "commercial-test", revision: 3, state: "pending", viewerKind: "shop", unread: false, shop: { name: "Boutique de démonstration", handle: "boutique-demo" }, requester: { displayName: "Acheteur de démonstration", handle: null }, offer: null, respondents: [], callConsent: false, capabilities: { canDecide: state.canDecide, canBlock: false, canClose: false, canSetCallConsent: false, canCall: false, canSend: false } } }),
    useMessages: () => ({ data: { page: [], isDone: true, continueCursor: "" } }),
    useWrites: () => ({ decide: state.decide }),
  },
  orderedCommercialMessages: (messages: unknown[]) => messages,
}))

import { createAppI18n } from "../../i18n"
import { renderWithEngine } from "../../tests/engine-wrapper"
import { CommercialConversationView } from "./CommercialConversationView"

import { MESSAGERIE_STYLES_CSS } from "./messagerie-styles"

const CSS = MESSAGERIE_STYLES_CSS.replace(/\/\*[\s\S]*?\*\//g, "")
const block = (selector: string) => {
  const start = CSS.indexOf(`${selector} {`)
  expect(start, `${selector} introuvable`).toBeGreaterThan(-1)
  return CSS.slice(start, CSS.indexOf("}", start))
}

describe(".msg-tool-btn (P18b, A15)", () => {
  it("cible d'au moins 44 px, sur les jetons de la charte", () => {
    const rule = block(".msg-tool-btn")
    expect(rule).toMatch(/min-height:\s*44px;/)
    expect(rule).toMatch(/min-width:\s*44px;/)
    expect(rule).toMatch(/border:\s*1px solid var\(--input\);/)
    expect(rule).toMatch(/background:\s*var\(--card\);/)
    expect(rule).toMatch(/border-radius:\s*10px;/)
    expect(rule).toMatch(/color:\s*var\(--card-foreground\);/)
    expect(rule).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i)
  })

  it("états focus, survol et désactivé", () => {
    expect(block(".msg-tool-btn:focus-visible")).toMatch(/outline:\s*2px solid var\(--ring\);/)
    expect(CSS).toMatch(/\.msg-tool-btn:hover:not\(:disabled\)\s*\{\s*background:\s*var\(--muted\);\s*\}/)
    expect(CSS).toMatch(/\.msg-tool-btn:disabled\s*\{[^}]*cursor:\s*not-allowed;/)
  })

  // La feuille actuelle garde des boutons neutres. La distinction du geste ne dépend
  // jamais d'une couleur supposée : éprouver les vrais libellés et handlers du composant.
  it("accepte la demande et bloque les deux gestes pendant son admission", async () => {
    let finish!: () => void
    state.decide.mockReturnValue(new Promise<void>((resolve) => { finish = resolve }))
    mountCommercial()
    const accept = screen.getByRole("button", { name: "Accepter" })
    const decline = screen.getByRole("button", { name: "Refuser" })
    expect(accept).toHaveClass("msg-tool-btn")
    expect(decline).toHaveClass("msg-tool-btn")
    fireEvent.click(accept)
    expect(state.decide).toHaveBeenCalledExactlyOnceWith({ threadId: "commercial-test", expectedRevision: 3, decision: "accept" })
    expect(accept).toBeDisabled()
    expect(decline).toBeDisabled()
    fireEvent.click(decline)
    expect(state.decide).toHaveBeenCalledTimes(1)
    await act(async () => finish())
    await waitFor(() => expect(accept).toBeEnabled())
  })

  it("refuse seulement après confirmation, permet d'annuler et masque les gestes sans droit", async () => {
    const view = mountCommercial()
    fireEvent.click(screen.getByRole("button", { name: "Refuser" }))
    expect(state.decide).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    expect(screen.queryByRole("button", { name: "Confirmer" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Refuser" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirmer" }))
    await waitFor(() => expect(state.decide).toHaveBeenCalledExactlyOnceWith({ threadId: "commercial-test", expectedRevision: 3, decision: "decline" }))
    await waitFor(() => expect(screen.queryByRole("button", { name: "Confirmer" })).not.toBeInTheDocument())
    view.unmount()
    state.canDecide = false
    mountCommercial()
    expect(screen.queryByRole("button", { name: "Accepter" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Refuser" })).not.toBeInTheDocument()
  })
})

beforeEach(() => { state.decide.mockReset().mockResolvedValue(undefined); state.canDecide = true })
function mountCommercial() {
  const i18n = createAppI18n({ locale: "fr", appResources: { fr: { shops: { contact: { accept: "Accepter", decline: "Refuser", cancel: "Annuler", confirm: { action: "Confirmer" } } } }, en: {} }, defaultNS: "shops" })
  return renderWithEngine(createElement(I18nextProvider, { i18n }, createElement(CommercialConversationView, { threadId: "commercial-test", onBack: vi.fn() })))
}
