// @vitest-environment jsdom
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ navigation: "destinations", navigationLayout: "adaptive", contextual: { renderList: vi.fn(), renderConversation: vi.fn() }, commercial: {}, route: vi.fn(), inject: vi.fn() }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ navigation: state.navigation, navigationLayout: state.navigationLayout }) }))
vi.mock("@antsia/social-features/features/messagerie/contextual-entry", () => ({ useContextualMessages: (options: unknown) => { state.inject(options); return state.contextual } }))
vi.mock("@antsia/social-features/messagerie", () => ({ MessagesRoute: (props: unknown) => { state.route(props); return <div>iCom</div> } }))
vi.mock("@/components/icom-pro/icom-pro-conversations", () => ({ IcomProConversations: ({ activity }: { activity: string | null }) => <p>Conversations pro {activity}</p> }))
vi.mock("@/components/icom-pro/icom-pro-contacts", () => ({ IcomProContacts: () => <p>Contacts pro</p> }))
vi.mock("@/components/shops/contact-messages", () => ({ useCommercialMessages: () => state.commercial }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main>, MemberTopBar: () => <nav /> }))

import { MessagesScreen } from "./messages-screen"

let root: Root | undefined
let container: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement("div"); document.body.append(container)
  state.route.mockClear(); state.inject.mockClear()
})
afterEach(async () => { await act(async () => { root?.unmount() }); root = undefined; container.remove() })

describe("MP09 — iCom professionnel réellement injecté dans ANTSIA", () => {
  it.each(["adaptive", "legacy"])("branche liste et conversation dans la coque %s sans remplacer le canal commercial", async layout => {
    state.navigationLayout = layout
    root = createRoot(container)
    await act(async () => { root?.render(<MessagesScreen route={{ kind: "mise-en-relation", id: "contextual-thread" }} />) })
    expect(state.inject).toHaveBeenCalledWith({ kind: "professionalCollaboration" })
    expect(state.route).toHaveBeenLastCalledWith({ kind: "mise-en-relation", id: "contextual-thread", contextual: state.contextual, commercial: state.commercial, pro: expect.objectContaining({ renderConversations: expect.any(Function), renderContacts: expect.any(Function) }) })
    expect(container.textContent).toContain("iCom")
  })

  it("ADR-0036 : injecte iCom Pro — conversations par activité et contacts pro", async () => {
    state.navigationLayout = "adaptive"
    root = createRoot(container)
    await act(async () => { root?.render(<MessagesScreen route={{}} />) })
    const props = state.route.mock.lastCall?.[0] as { pro: { renderConversations: (activity: string | null) => ReactNode; renderContacts: () => ReactNode } }
    const probe = document.createElement("div"); document.body.append(probe)
    const probeRoot = createRoot(probe)
    await act(async () => { probeRoot.render(<>{props.pro.renderConversations("achats")}{props.pro.renderContacts()}</>) })
    expect(probe.textContent).toContain("Conversations pro achats")
    expect(probe.textContent).toContain("Contacts pro")
    await act(async () => { probeRoot.unmount() }); probe.remove()
  })
})
