// @vitest-environment jsdom
/**
 * CC-5 → CC-6 — le point d'injection `MessagesRoute` (prop `contextual`) dans les DEUX navigations
 * (écrit le 19/10/2026, NON EXÉCUTÉ : « Continuer sans vérifier »). Sans injection, rien de
 * contextuel n'existe ; avec, la conversation se rend en page et la liste reçoit le filtre.
 */
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  mobile: false as boolean | null,
  navigation: "destinations",
  networkId: "diasporale",
  personId: "person-a",
  pageProps: null as { conversationKey: string | null; contextual?: unknown } | null,
  listProps: null as { contextual?: unknown } | null,
}))
vi.mock("@antsia/ui/overlay", () => ({ useIsReseauMobile: () => state.mobile }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => state, useNetworkNavigationLayout: () => ({ adaptive: false, mobile: state.mobile }) }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("./IcomMessagesPage", () => ({
  IcomMessagesPage: (props: { conversationKey: string | null; contextual?: unknown }) => {
    state.pageProps = props
    return <div data-testid="destination" data-conversation={props.conversationKey ?? ""} />
  },
}))
vi.mock("./MessagerieListPage", () => ({
  MessagerieListPage: (props: { contextual?: unknown }) => {
    state.listProps = props
    return <div data-testid="legacy-list" />
  },
}))
vi.mock("./MessagerieDesktopPage", () => ({ MessagerieDesktopPage: () => <div data-testid="legacy-desktop" /> }))
vi.mock("./MessagerieConversationPage", () => ({ MessagerieConversationPage: () => <div data-testid="legacy-conversation" /> }))
vi.mock("./MessagerieComposePage", () => ({ MessagerieComposePage: () => <div data-testid="legacy-compose" /> }))
vi.mock("./messagerie-styles", () => ({ MessagerieStyles: () => null }))

import { MessagesRoute } from "./MessagesRoute"

const contextual = {
  renderList: (query: string) => <div data-testid="contextual-list">{query}</div>,
  renderConversation: (threadId: string) => <div data-testid="contextual-conversation">{threadId}</div>,
}

beforeEach(() => {
  state.mobile = false
  state.navigation = "destinations"
  state.pageProps = null
  state.listProps = null
})
afterEach(() => cleanup())

describe("injection contextuelle de MessagesRoute (CC-5)", () => {
  it("destinations : la conversation contextuelle est adressée et l'injection transmise", () => {
    render(<MessagesRoute kind="mise-en-relation" id="thread-a" contextual={contextual} />)
    expect(screen.getByTestId("destination").getAttribute("data-conversation")).toBe("contexte:thread-a")
    expect(state.pageProps?.contextual).toBe(contextual)
  })

  it("destinations sans injection : l'adresse ne désigne aucune conversation", () => {
    render(<MessagesRoute kind="mise-en-relation" id="thread-a" />)
    expect(screen.getByTestId("destination").getAttribute("data-conversation")).toBe("")
  })

  it.each([true, false])("volets : la conversation se rend EN PAGE, jamais dans le dock personnel (mobile=%s)", (mobile) => {
    state.mobile = mobile
    state.navigation = "volets"
    render(<MessagesRoute kind="mise-en-relation" id="thread-a" contextual={contextual} />)
    expect(screen.getByTestId("contextual-conversation").textContent).toBe("thread-a")
    expect(screen.queryByTestId("legacy-desktop")).toBeNull()
    expect(screen.queryByTestId("legacy-conversation")).toBeNull()
  })

  it("volets sans injection : rien, ni dock ni conversation personnelle", () => {
    state.navigation = "volets"
    const { container } = render(<MessagesRoute kind="mise-en-relation" id="thread-a" />)
    expect(container.textContent).toBe("")
    expect(screen.queryByTestId("legacy-desktop")).toBeNull()
  })

  it("volets au téléphone : la liste reçoit l'injection (filtre « Mises en relation », journal)", () => {
    state.mobile = true
    state.navigation = "volets"
    render(<MessagesRoute contextual={contextual} />)
    expect(screen.getByTestId("legacy-list")).toBeTruthy()
    expect(state.listProps?.contextual).toBe(contextual)
  })
})
