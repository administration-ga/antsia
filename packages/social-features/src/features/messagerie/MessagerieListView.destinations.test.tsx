// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderWithEngine, TEST_NETWORK_ID, TEST_PERSON_ID } from "../../tests/engine-wrapper"

vi.mock("./MessagerieGroupeInvitations", () => ({ MessagerieGroupeInvitations: () => null }))
vi.mock("./messagerie-styles", () => ({ MessagerieStyles: () => null }))
vi.mock("./IcomBrickHeader", () => ({ IcomBrickHeader: ({ actions }: { actions?: ReactNode }) => <div>{actions}</div> }))
vi.mock("../reseau-personnel/Avatar", () => ({ Avatar: () => null }))
vi.mock("./GroupeAvatar", () => ({ GroupeAvatar: () => null }))

import { MessagerieListView } from "./MessagerieListView"
import { __resetListStatesForTests, activateListSession, messagerieListScope, readListState, writeListState } from "./messagerie-list-state"
import type { MessagerieGroupThread, MessagerieSource, MessagerieThread } from "./messagerie-source"

const nav = { openConversation: vi.fn(), openCompose: vi.fn(), openComposeGroupe: vi.fn(), back: vi.fn() }
const scope = messagerieListScope(String(TEST_NETWORK_ID), String(TEST_PERSON_ID), "phone")

function thread(id: string, name: string, unreadCount: number): MessagerieThread {
	return {
		threadId: id, counterpart: { personId: `p-${id}`, handle: id, displayName: name, headline: null, avatarUrl: null, source: "published" },
		lastMessageAt: 1_700_000_000_000, lastMessageText: "Bonjour", lastMessageByMe: false, lastMessageKind: "text", lastMessageAttachmentCount: null,
		lastMessageId: null, lastMessageReadByCounterpart: null, lastMessageDeleted: false, unreadCount, unreadCapped: false,
	} as unknown as MessagerieThread
}

const group = {
	threadId: "group-a", title: "Atelier collectif", avatarUrl: null, activeCall: null,
	lastMessageAt: 1_700_000_000_001, lastMessageText: "Bienvenue", lastMessageByMe: false, lastMessageKind: "text", lastMessageAttachmentCount: null,
	lastMessageDeleted: false, unreadCount: 2, unreadCapped: false,
} as unknown as MessagerieGroupThread

function source({ threads = [thread("read", "Échange déjà lu", 0), thread("unread", "Atelier individuel", 1)], groups = [group], hasMore = false, loadMore = vi.fn() }: {
	threads?: MessagerieThread[]; groups?: MessagerieGroupThread[]; hasMore?: boolean; loadMore?: () => void
} = {}): MessagerieSource {
	const status = { isLoading: false, isError: false, error: null, isFetching: false, enabled: true, refetch: vi.fn() }
	return {
		espace: "personnel", supporteBrouillon: true, supporteGroupes: true,
		useMessageWrites: () => { throw new Error("La liste ne doit pas envoyer de message") },
		useThreads: () => ({ ...status, data: threads }),
		useThreadsPage: () => ({ ...status, data: threads, hasMore, isLoadingMore: false, loadMore }),
		useThreadById: () => ({ data: undefined, isLoading: false, isError: false, enabled: false }),
		useGroupThreads: () => ({ ...status, data: groups }),
		useUnreadTotals: () => ({ directs: { total: 97, capped: false }, groupes: { total: 2, capped: false }, total: { total: 99, capped: true }, isLoading: false, isError: false, refetch: vi.fn() }),
		useStartCall: () => ({ appeler: vi.fn(), isPending: false }),
	}
}

beforeEach(() => {
	vi.clearAllMocks()
	__resetListStatesForTests()
	activateListSession(JSON.stringify([TEST_NETWORK_ID, TEST_PERSON_ID]))
})
afterEach(() => { cleanup(); __resetListStatesForTests() })

describe("liste P05 déclarée par ANTSIA", () => {
	it("filtre les deux familles par les vrais non-lus, conserve les groupes navigables et le plafond serveur", () => {
		renderWithEngine(<MessagerieListView variant="page" nav={nav} unread={99} source={source()} destinationMode stateScope={scope} />)
		const unread = screen.getByRole("button", { name: /Non lues/ })
		expect(unread.textContent).toContain("99+")
		fireEvent.click(unread)
		expect(screen.queryByText("Échange déjà lu")).toBeNull()
		expect(screen.getByText("Atelier individuel")).toBeTruthy()
		expect(screen.getByText("Atelier collectif")).toBeTruthy()
		const groups = screen.getAllByRole("button").find((button) => button.classList.contains("msg-filter-btn") && button.textContent?.startsWith("Groupes"))!
		fireEvent.click(groups)
		expect(screen.queryByText("Atelier individuel")).toBeNull()
		fireEvent.click(screen.getByRole("button", { name: /Atelier collectif/ }))
		expect(nav.openConversation).toHaveBeenCalledWith("groupe:group-a")
		expect(screen.queryByText("Boutiques")).toBeNull()
	})

	it("conserve recherche, filtre et position au retour de la conversation sans stockage navigateur", () => {
		const localSource = source()
		const first = renderWithEngine(<MessagerieListView variant="page" nav={nav} unread={99} source={localSource} destinationMode stateScope={scope} />)
		fireEvent.change(screen.getByRole("searchbox"), { target: { value: "atelier" } })
		fireEvent.click(screen.getByRole("button", { name: /Non lues/ }))
		expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("atelier")
		const body = first.container.querySelector<HTMLDivElement>(".msg-body")!
		body.scrollTop = 240
		fireEvent.scroll(body)
		first.unmount()
		const returned = renderWithEngine(<MessagerieListView variant="page" nav={nav} unread={99} source={localSource} destinationMode stateScope={scope} />)
		expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("atelier")
		expect(screen.getByRole("button", { name: /Non lues/ }).getAttribute("aria-pressed")).toBe("true")
		expect(returned.container.querySelector<HTMLDivElement>(".msg-body")?.scrollTop).toBe(240)
		expect(readListState(scope)).toMatchObject({ query: "atelier", filter: "non_lues", scrollTop: 240 })
	})

	it("annonce la fenêtre des groupes et permet de poursuivre les pages 1:1 même si la première est vide", () => {
		const loadMore = vi.fn()
		renderWithEngine(<MessagerieListView variant="page" nav={nav} unread={99} source={source({ threads: [], groups: [], hasMore: true, loadMore })} destinationMode stateScope={scope} />)
		expect(screen.getByText(/50 premiers renvoyés par le serveur/)).toBeTruthy()
		expect(screen.getByText(/parmi celles déjà chargées/)).toBeTruthy()
		fireEvent.click(screen.getByRole("button", { name: "Charger plus pour chercher" }))
		expect(loadMore).toHaveBeenCalledOnce()
	})

	it("recharge la profondeur précédente avant de terminer la restauration de position", () => {
		writeListState(scope, { loadedThreadCount: 60, scrollTop: 240 })
		const threads = Array.from({ length: 60 }, (_, index) => thread(`thread-${index}`, `Relation ${index}`, 0))
		const loadMore = vi.fn()
		const mounted = renderWithEngine(<MessagerieListView variant="page" nav={nav} unread={99} source={source({ threads: threads.slice(0, 30), groups: [], hasMore: true, loadMore })} destinationMode stateScope={scope} />)
		expect(loadMore).toHaveBeenCalled()
		expect(readListState(scope).loadedThreadCount).toBe(60)
		mounted.rerender(<MessagerieListView variant="page" nav={nav} unread={99} source={source({ threads, groups: [] })} destinationMode stateScope={scope} />)
		expect(mounted.container.querySelector<HTMLDivElement>(".msg-body")?.scrollTop).toBe(240)
		expect(readListState(scope).loadedThreadCount).toBe(60)
	})

	it("conserve les filtres historiques sans la capacité de présentation P05", () => {
		renderWithEngine(<MessagerieListView variant="page" nav={nav} unread={99} source={source()} />)
		expect(screen.getByText("Individuels")).toBeTruthy()
		expect(screen.queryByRole("button", { name: /Non lues/ })).toBeNull()
		expect(screen.queryByText(/50 premiers renvoyés par le serveur/)).toBeNull()
	})

	it("rend le focus à la ligne mémorisée sans changer recherche ou position", () => {
		writeListState(scope, { returnFocusKey: "chat:unread", query: "atelier", scrollTop: 0 })
		renderWithEngine(<MessagerieListView variant="page" nav={nav} unread={99} source={source()} destinationMode stateScope={scope} />)
		expect(document.activeElement).toBe(screen.getByRole("button", { name: /Atelier individuel/ }))
		expect(readListState(scope)).toMatchObject({ returnFocusKey: null, query: "atelier" })
		const search = screen.getByRole("searchbox")
		const description = document.getElementById(search.getAttribute("aria-describedby") ?? "")
		expect(description?.textContent).toContain("50 premiers")
	})
})
