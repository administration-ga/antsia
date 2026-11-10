// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ search: "", list: vi.fn(), push: vi.fn(), replace: vi.fn() }))
vi.mock("@antsia/api/network", () => ({
  useNetwork: () => ({ networkId: "network-a", personId: "person-a" }),
  useNetworkNavigationLayout: () => ({ adaptive: true, mobile: false }),
  useRoutes: () => ({ home: () => "/fil", messages: () => "/messages", me: () => "/moi" }),
}))
vi.mock("@antsia/api/routing", () => ({
  Link: ({ children, href, ...props }: import("react").AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a>,
  useRouter: () => ({ push: state.push, replace: state.replace }),
  usePathname: () => "/messages",
  useSearchParams: () => new URLSearchParams(state.search),
}))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("./IcomSpaceSwitch", () => ({ IcomSpaceHeading: ({ space, proHref }: { space: string; proHref: string }) => <h1 data-space={space} data-pro-href={proHref}>{space}</h1> }))
vi.mock("./use-icom-workspace", () => ({ useIcomWorkspaceWide: () => true }))
vi.mock("../iappel/call-host-store", () => ({ registerCallHost: () => vi.fn(), useCallHostMode: () => "none" }))
vi.mock("./dock-store", () => ({ useDockState: () => ({}) }))
vi.mock("./use-infos-panneau", () => ({ useInfosPanneau: () => ({ ouvert: false, ouvrir: vi.fn(), fermer: vi.fn() }) }))
vi.mock("./messagerie-source", () => ({ SOURCE_AGENT: { useUnreadTotals: () => ({ total: { total: 0 } }) } }))
vi.mock("./messagerie-styles", () => ({ MessagerieStyles: () => null }))
vi.mock("./MessagerieListView", () => ({ MessagerieListView: (props: { renderCommercialList?: unknown; renderContextualList?: unknown }) => { state.list(props); return <p>Liste personnelle</p> } }))
vi.mock("./MessagerieConversationView", () => ({ MessagerieConversationView: () => <p>Conversation personnelle</p> }))
vi.mock("./MessagerieComposeView", () => ({ MessagerieComposeView: () => null }))
vi.mock("./MessagerieGroupeCompose", () => ({ MessagerieGroupeCompose: () => null }))
vi.mock("./MessagerieGroupeInvite", () => ({ MessagerieGroupeInvite: () => null }))
vi.mock("./IcomRelationsPanel", () => ({ IcomRelationsPanel: ({ mode, journal }: { mode: string; journal?: (controls: ReactNode) => ReactNode }) => <div data-mode={mode}>{journal?.(null)}</div> }))
vi.mock("./IcomAppelJournal", () => ({ IcomAppelJournal: ({ family }: { family?: string }) => <p data-family={family ?? "tout"}>Journal</p> }))

import { IcomMessagesPage, type IcomProInjection } from "./IcomMessagesPage"
import { __resetListStatesForTests, activateListSession } from "./messagerie-list-state"

const commercial = { renderList: () => <p>Boutiques</p>, renderConversation: (id: string) => <p>Conversation boutique {id}</p> }
const contextual = { renderList: () => <p>Mises en relation</p>, renderConversation: (id: string) => <p>Mise en relation {id}</p> }
const pro: IcomProInjection = { renderConversations: (activity) => <p>Conversations pro {activity ?? "défaut"}</p>, renderContacts: () => <p>Contacts pro</p> }

beforeEach(() => { state.search = ""; vi.clearAllMocks(); __resetListStatesForTests(); activateListSession(JSON.stringify(["network-a", "person-a"])) })
afterEach(() => { cleanup(); __resetListStatesForTests() })

describe("ADR-0036 — iCom et iCom Pro dans la page de messagerie", () => {
  it("iCom : la liste personnelle n'offre plus les boutiques ni les mises en relation", () => {
    render(<IcomMessagesPage isMobile={false} commercial={commercial} contextual={contextual} pro={pro} />)
    expect(screen.getByRole("heading", { level: 1 }).getAttribute("data-space")).toBe("personnel")
    expect(screen.getByText("Liste personnelle")).toBeTruthy()
    expect(state.list).toHaveBeenLastCalledWith(expect.objectContaining({ renderCommercialList: undefined, renderContextualList: undefined }))
  })
  it("iCom Pro : conversations par activité, adresse des vues avec espace=pro", () => {
    state.search = "espace=pro&activite=achats"
    render(<IcomMessagesPage isMobile={false} commercial={commercial} contextual={contextual} pro={pro} />)
    expect(screen.getByRole("heading", { level: 1 }).getAttribute("data-space")).toBe("pro")
    expect(screen.getByText("Conversations pro achats")).toBeTruthy()
    expect(screen.queryByText("Liste personnelle")).toBeNull()
    expect(screen.getByRole("link", { name: "messagerie:icomViews.contacts" }).getAttribute("href")).toBe("/messages?brique=icontact&espace=pro")
  })
  it("iCom Pro : contacts pro et journal des appels pro ; iCom : journal personnel", () => {
    state.search = "espace=pro&brique=icontact"
    const view = render(<IcomMessagesPage isMobile={false} commercial={commercial} contextual={contextual} pro={pro} />)
    expect(screen.getByText("Contacts pro")).toBeTruthy()
    cleanup()
    state.search = "espace=pro&brique=iappel"
    render(<IcomMessagesPage isMobile={false} commercial={commercial} contextual={contextual} pro={pro} />)
    expect(screen.getByText("Journal").getAttribute("data-family")).toBe("pro")
    cleanup()
    state.search = "brique=iappel"
    render(<IcomMessagesPage isMobile={false} commercial={commercial} contextual={contextual} pro={pro} />)
    expect(screen.getByText("Journal").getAttribute("data-family")).toBe("personnel")
    void view
  })
  it("une conversation de boutique ouvre iCom Pro, même sans paramètre", () => {
    render(<IcomMessagesPage isMobile={false} conversationKey="commerce:thread-1" commercial={commercial} contextual={contextual} pro={pro} />)
    expect(screen.getByRole("heading", { level: 1 }).getAttribute("data-space")).toBe("pro")
    expect(screen.getByText("Conversation boutique thread-1")).toBeTruthy()
  })
  it("sans injection iCom Pro (DIASPORALE), la messagerie unique reste telle quelle", () => {
    state.search = "espace=pro&brique=iappel"
    render(<IcomMessagesPage isMobile={false} commercial={commercial} contextual={contextual} />)
    expect(screen.getByRole("heading", { level: 1 }).getAttribute("data-space")).toBeNull()
    expect(screen.getByText("Journal").getAttribute("data-family")).toBe("tout")
  })
})
