// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ mobile: false as boolean | null, navigation: "destinations", networkId: "antsia", personId: "person-a" }))
vi.mock("@antsia/ui/overlay", () => ({ useIsReseauMobile: () => state.mobile }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => state, useNetworkNavigationLayout: () => ({ adaptive: true, mobile: state.mobile }) }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("./IcomMessagesPage", () => ({ IcomMessagesPage: ({ isMobile, conversationKey, compose }: { isMobile: boolean; conversationKey: string | null; compose?: string }) => <div data-testid="destination" data-mobile={String(isMobile)} data-conversation={conversationKey ?? ""} data-compose={compose ?? ""} /> }))
vi.mock("./MessagerieListPage", () => ({ MessagerieListPage: () => <div data-testid="legacy-list" /> }))
vi.mock("./MessagerieDesktopPage", () => ({ MessagerieDesktopPage: () => <div data-testid="legacy-desktop" /> }))
vi.mock("./MessagerieConversationPage", () => ({ MessagerieConversationPage: () => <div data-testid="legacy-conversation" /> }))
vi.mock("./MessagerieComposePage", () => ({ MessagerieComposePage: () => <div data-testid="legacy-compose" /> }))
vi.mock("./messagerie-styles", () => ({ MessagerieStyles: () => null }))

import { IcomListSessionBoundary, MessagesRoute } from "./MessagesRoute"
import { __resetListStatesForTests, messagerieListScope, readListState, writeListState } from "./messagerie-list-state"

beforeEach(() => { state.mobile = false; state.navigation = "destinations"; state.personId = "person-a"; __resetListStatesForTests() })
afterEach(() => { cleanup(); __resetListStatesForTests() })

describe("aiguillage Messages opt-in P05", () => {
	it.each([true, false])("sert la destination réelle, sans passerelle vers le dock, mobile=%s", (mobile) => {
		state.mobile = mobile
		render(<MessagesRoute kind="chat" id="thread-a" />)
		expect(screen.getByTestId("destination").getAttribute("data-mobile")).toBe(String(mobile))
		expect(screen.getByTestId("destination").getAttribute("data-conversation")).toBe("chat:thread-a")
		expect(screen.queryByTestId("legacy-desktop")).toBeNull()
	})
	it("préserve le composeur de groupe dans la destination", () => {
		render(<MessagesRoute compose="groupe" />)
		expect(screen.getByTestId("destination").getAttribute("data-compose")).toBe("groupe")
	})
	it("garde l’ossature commune tant que la largeur n’est pas connue", () => {
		state.mobile = null
		render(<MessagesRoute />)
		expect(screen.queryByTestId("destination")).toBeNull()
		expect(screen.getByText("messagesRoute.loading")).toBeTruthy()
	})
	it.each([true, false])("garde le parcours historique sans la capacité, mobile=%s", (mobile) => {
		state.mobile = mobile
		state.navigation = "volets"
		render(<MessagesRoute />)
		expect(screen.queryByTestId("destination")).toBeNull()
		expect(screen.getByTestId(mobile ? "legacy-list" : "legacy-desktop")).toBeTruthy()
	})
	it("la frontière persistante purge au changement de personne et à la sortie de session", () => {
		const scopeA = messagerieListScope("antsia", "person-a", "phone")
		const scopeB = messagerieListScope("antsia", "person-b", "phone")
		const mounted = render(<IcomListSessionBoundary />)
		writeListState(scopeA, { query: "ancienne recherche" })
		expect(readListState(scopeA).query).toBe("ancienne recherche")
		state.personId = "person-b"
		mounted.rerender(<IcomListSessionBoundary />)
		writeListState(scopeA, { query: "événement tardif" })
		expect(readListState(scopeA).query).toBe("")
		writeListState(scopeB, { query: "nouvelle recherche" })
		mounted.unmount()
		expect(readListState(scopeB).query).toBe("")
	})
})
