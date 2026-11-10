// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useEffect, useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MessagerieNav } from "./messagerie-views"

const state = vi.hoisted(() => ({ adaptive: true, wide: false, mounts: 0, push: vi.fn(), replace: vi.fn(), register: vi.fn(() => vi.fn()) }))
vi.mock("@antsia/api/network", () => ({
  useNetwork: () => ({ networkId: "network-a", personId: "person-a" }),
  useNetworkNavigationLayout: () => ({ adaptive: state.adaptive, mobile: false }),
  useRoutes: () => ({ home: () => "/fil", messages: () => "/messages", me: () => "/moi" }),
}))
vi.mock("@antsia/api/routing", () => ({
  Link: ({ children, href, ...props }: import("react").AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a>,
  useRouter: () => ({ push: state.push, replace: state.replace }),
  usePathname: () => "/messages",
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("./use-icom-workspace", () => ({ useIcomWorkspaceWide: () => state.wide }))
vi.mock("../iappel/call-host-store", () => ({ registerCallHost: state.register, useCallHostMode: () => "none" }))
vi.mock("./dock-store", () => ({ useDockState: () => ({}) }))
vi.mock("./messagerie-dock", async original => ({ ...(await original<typeof import("./messagerie-dock")>()), draftTextFor: () => "Brouillon en mémoire" }))
vi.mock("./use-infos-panneau", () => ({ useInfosPanneau: () => ({ ouvert: false, ouvrir: vi.fn(), fermer: vi.fn() }) }))
vi.mock("./messagerie-source", () => ({ SOURCE_AGENT: { useUnreadTotals: () => ({ total: { total: 0 } }) } }))
vi.mock("./messagerie-styles", () => ({ MessagerieStyles: () => null }))
vi.mock("../../shell/mobile/mobile-styles", () => ({ ReseauMobileStyles: () => null }))
vi.mock("../../shell/mobile/IcomMobileTabBar", () => ({ IcomMobileTabBar: () => <nav aria-label="Barre iCom historique" /> }))
vi.mock("./MessagerieListView", () => ({ MessagerieListView: ({ nav }: { nav: MessagerieNav }) => <button onClick={() => nav.openConversation("chat:thread-a")}>Ouvrir l’échange</button> }))
vi.mock("./MessagerieConversationView", () => ({ MessagerieConversationView: ({ nav, draft }: { nav: MessagerieNav; draft: string }) => {
  useEffect(() => { state.mounts += 1 }, [])
  const [reply, setReply] = useState("")
  return <><button onClick={nav.back}>Retour à la liste</button><textarea aria-label="Brouillon" defaultValue={draft} /><input aria-label="Réponse locale" value={reply} onChange={(event) => setReply(event.target.value)} /></>
} }))
vi.mock("./MessagerieComposeView", () => ({ MessagerieComposeView: () => <p>Composeur personnel</p> }))
vi.mock("./MessagerieGroupeCompose", () => ({ MessagerieGroupeCompose: () => <p>Composeur groupe</p> }))
vi.mock("./MessagerieGroupeInvite", () => ({ MessagerieGroupeInvite: () => null }))
vi.mock("./IcomRelationsPanel", () => ({ IcomRelationsPanel: () => null }))
vi.mock("./IcomAppelJournal", () => ({ IcomAppelJournal: () => null }))

import { IcomMessagesPage } from "./IcomMessagesPage"
import { __resetListStatesForTests, activateListSession, messagerieListScope, readListState, writeListState } from "./messagerie-list-state"
import { ICOM_WORKSPACE_CSS, ICOM_WORKSPACE_SPLIT_MIN } from "./icom-workspace-styles"

const scope = messagerieListScope("network-a", "person-a", "desktop")
beforeEach(() => {
  state.adaptive = true; state.wide = false; state.mounts = 0
  vi.clearAllMocks(); __resetListStatesForTests(); activateListSession(JSON.stringify(["network-a", "person-a"]))
})
afterEach(() => { cleanup(); __resetListStatesForTests() })

describe("U06 : espace Messages selon la largeur utile", () => {
  it("garde Conversations/Appels/Contacts sans seconde barre iCom sous la navigation adaptative", () => {
    render(<IcomMessagesPage isMobile />)
    for (const name of ["messagerie:icomViews.conversations", "messagerie:icomViews.calls", "messagerie:icomViews.contacts"]) expect(screen.getByRole("link", { name })).toBeTruthy()
    expect(screen.queryByRole("navigation", { name: "Barre iCom historique" })).toBeNull()
    expect(state.register).not.toHaveBeenCalled()
  })
  it("préserve la barre et la présentation historiques sans capacité adaptative", () => {
    state.adaptive = false
    const view = render(<IcomMessagesPage isMobile />)
    expect(screen.getByRole("navigation", { name: "Barre iCom historique" })).toBeTruthy()
    expect(view.container.querySelector('[data-layout="adaptive"]')).toBeNull()
  })
  it("ne place pas l'appel dans un détail masqué, puis garde le même hôte et brouillon au redimensionnement", () => {
    const view = render(<IcomMessagesPage isMobile={false} />)
    expect(state.register).not.toHaveBeenCalled()
    view.rerender(<IcomMessagesPage isMobile={false} conversationKey="chat:thread-a" />)
    expect(state.register).toHaveBeenCalledTimes(1)
    const field = screen.getByRole("textbox", { name: "Brouillon" })
    fireEvent.change(field, { target: { value: "Texte conservé" } })
    state.wide = true
    view.rerender(<IcomMessagesPage isMobile={false} conversationKey="chat:thread-a" />)
    expect(screen.getByRole("textbox", { name: "Brouillon" })).toBe(field)
    expect((field as HTMLTextAreaElement).value).toBe("Texte conservé")
    expect(state.mounts).toBe(1)
    expect(state.register).toHaveBeenCalledTimes(1)
    expect(ICOM_WORKSPACE_SPLIT_MIN).toBe(880)
    expect(ICOM_WORKSPACE_CSS).toContain("@container icom-workspace (min-width: 880px)")
  })
  it("conserve le détail, son état local et son focus entre tablette, téléphone et tablette", () => {
    const view = render(<IcomMessagesPage isMobile={false} conversationKey="chat:thread-a" />)
    const detail = view.container.querySelector(".icom-page-detail")
    const host = view.container.querySelector(".icom-call-host")
    const field = screen.getByRole("textbox", { name: "Brouillon" }) as HTMLTextAreaElement
    const reply = screen.getByRole("textbox", { name: "Réponse locale" }) as HTMLInputElement
    fireEvent.change(field, { target: { value: "Texte conservé au seuil mobile" } })
    fireEvent.change(reply, { target: { value: "Réponse en cours" } })
    field.focus()
    field.setSelectionRange(3, 8)

    for (const isMobile of [true, false]) {
      view.rerender(<IcomMessagesPage isMobile={isMobile} conversationKey="chat:thread-a" />)
      expect(view.container.querySelector(".icom-page-detail")).toBe(detail)
      expect(view.container.querySelector(".icom-call-host")).toBe(host)
      expect(screen.getByRole("textbox", { name: "Brouillon" })).toBe(field)
      expect(screen.getByRole("textbox", { name: "Réponse locale" })).toBe(reply)
      expect(field.value).toBe("Texte conservé au seuil mobile")
      expect(reply.value).toBe("Réponse en cours")
      expect(document.activeElement).toBe(field)
      expect([field.selectionStart, field.selectionEnd]).toEqual([3, 8])
      expect(state.mounts).toBe(1)
      expect(detail?.getAttribute("data-fill")).toBe(isMobile ? "screen" : null)
      fireEvent.click(screen.getByRole("button", { name: "Retour à la liste" }))
      expect(state.push).toHaveBeenLastCalledWith("/messages", { scroll: false })
      // Le clic de test ne change pas la route mockée ; remettre le focus avant le seuil suivant.
      field.focus()
    }
    expect(view.container.querySelectorAll(".icom-page-detail")).toHaveLength(1)
    expect(screen.queryByRole("navigation", { name: "Barre iCom historique" })).toBeNull()
  })
  it("garde la conversation immersive historique hors présentation adaptative", () => {
    state.adaptive = false
    const view = render(<IcomMessagesPage isMobile conversationKey="chat:thread-a" />)
    expect(view.container.querySelector(".icom-messages-page")).toBeNull()
    expect(view.container.querySelector('.msg-panel[data-fill="screen"]')).not.toBeNull()
    expect(screen.getByRole("textbox", { name: "Brouillon" })).toBeTruthy()
    expect(state.register).not.toHaveBeenCalled()
  })
  it("mémorise une référence de retour sans perdre filtre, recherche ou profondeur", () => {
    writeListState(scope, { query: "atelier", filter: "non_lues", loadedThreadCount: 60 })
    render(<IcomMessagesPage isMobile={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir l’échange" }))
    expect(readListState(scope)).toMatchObject({ returnFocusKey: "chat:thread-a", query: "atelier", filter: "non_lues", loadedThreadCount: 60 })
    expect(state.push).toHaveBeenCalledWith("/messages/chat/thread-a", { scroll: false })
  })
})
