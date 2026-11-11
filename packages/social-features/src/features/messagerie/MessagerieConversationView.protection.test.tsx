// @vitest-environment jsdom
/**
 * IC-03 — l'en-tête d'un fil à deux de la boîte personnelle porte « Signaler ou
 * bloquer » la personne en face ; ni un groupe (chaque membre se règle depuis la
 * fiche), ni un brouillon (rien n'est parti), ni une carte repliée. Bloquer
 * referme le fil : la vue revient en arrière (`nav.back`).
 *
 * Même harnais que `source-writes.test.tsx` : la vue montée avec une source
 * injectée, l'en-tête et le menu remplacés par des sondes qui rendent ce qu'ils
 * reçoivent.
 */
import type { Id } from "@antsia/api/engine"
import { cleanup, screen } from "@testing-library/react"
import { getFunctionName } from "convex/server"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderWithEngine } from "../../tests/engine-wrapper"
import type { PersonProtectionMenuProps } from "./PersonProtectionMenu"

const mocks = vi.hoisted(() => ({
	group: false,
	empty: [] as unknown[],
	menus: [] as PersonProtectionMenuProps[],
	groupData: { title: "Équipe", myRole: "member", memberCount: 2, activeCall: null, pinnedMessage: null },
}))

vi.mock("@antsia/api/hooks", () => ({
	useConvexMutationQuery: () => ({ isPending: false, mutateAsync: async () => null }),
	useAuthenticatedConvexQuery: (reference: Parameters<typeof getFunctionName>[0]) => {
		const name = getFunctionName(reference)
		const data = name.endsWith(":getGroupThread") && mocks.group
			? mocks.groupData
			: name.endsWith(":listTyping") || name.endsWith(":listGroupTyping") ? mocks.empty : undefined
		return { data, isLoading: false, isError: false, isFetching: false, error: null, refetch: vi.fn() }
	},
}))
vi.mock("convex/react", async (importOriginal) => ({
	...await importOriginal<typeof import("convex/react")>(),
	useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
	usePaginatedQuery: () => ({ results: mocks.empty, status: "Exhausted", loadMore: vi.fn() }),
}))
vi.mock("@antsia/ui/overlay", () => ({ useVisualViewport: () => undefined }))
vi.mock("../iappel/presence-dot", () => ({
	useConnectionsPresence: () => ({ presenceOf: () => null }),
	PresenceDot: () => null,
}))
vi.mock("../iappel/use-launch-conference", () => ({
	useConferenceLaunchAvailable: () => false,
	useLaunchConference: () => vi.fn(),
}))
vi.mock("./use-draft-existing-thread", () => ({ useOpenExistingThreadForDraft: () => undefined }))
vi.mock("./MessageComposer", () => ({ MessageComposer: () => null }))
// L'en-tête rend ce qu'il reçoit à l'emplacement de protection, et rien d'autre.
vi.mock("./ConversationHeader", () => ({
	ConversationHeader: (props: { protection?: ReactNode }) => <div data-testid="header">{props.protection}</div>,
}))
vi.mock("./PersonProtectionMenu", () => ({
	PersonProtectionMenu: (props: PersonProtectionMenuProps) => {
		mocks.menus.push(props)
		return <span data-testid="protection" />
	},
}))
vi.mock("./messagerie-styles", () => ({ MessagerieStyles: () => null }))
vi.mock("./MessagerieGroupeInfos", () => ({ MessagerieGroupeInfos: () => null }))
vi.mock("./ForwardMessageSheet", () => ({ ForwardMessageSheet: () => null }))
vi.mock("./NewMessagesPill", () => ({ NewMessagesPill: () => null }))

import { MessagerieConversationView } from "./MessagerieConversationView"
import { SOURCE_AGENT, type MessagerieSource } from "./messagerie-source"

const DIRECT_THREAD = "thread-direct" as Id<"personalThreads">
const GROUP_THREAD = "thread-group" as Id<"groupThreads">
const AWA = "persons_awa" as Id<"persons">
/** Le nom de la personne en face : une donnée du test, pas un texte d'interface. */
const NAME = "Awa NDONG"

function thread(source: "published" | "unknown") {
	return {
		threadId: DIRECT_THREAD,
		counterpart: { personId: AWA, displayName: source === "published" ? NAME : null, handle: source === "published" ? "awa" : null, headline: null, avatarUrl: null, source },
		lastMessageAt: 1,
		unreadCount: 0,
	}
}

function injectedSource(counterpart: "published" | "unknown"): MessagerieSource {
	return {
		...SOURCE_AGENT,
		useThreads: () => ({ data: [thread(counterpart)] as never, isLoading: false, isError: false, error: null, refetch: vi.fn(), isFetching: false, enabled: true }),
		useThreadById: () => ({ data: undefined, isLoading: false, isError: false, enabled: false }),
		useGroupThreads: () => ({ data: [], isLoading: false, isError: false, error: null, refetch: vi.fn(), isFetching: false, enabled: true }),
		useStartCall: () => ({ isPending: false, appeler: async () => { throw new Error("appel hors recette") } }),
	}
}

function mount(options: { kind?: "chat" | "groupe" | "draft"; counterpart?: "published" | "unknown"; open?: boolean } = {}) {
	const kind = options.kind ?? "chat"
	mocks.group = kind === "groupe"
	const nav = { back: vi.fn(), openConversation: vi.fn(), openCompose: vi.fn(), openComposeGroupe: vi.fn() }
	renderWithEngine(<MessagerieConversationView
		conversationKey={kind === "draft" ? "draft:awa" : kind === "groupe" ? `groupe:${GROUP_THREAD}` : `chat:${DIRECT_THREAD}`}
		variant="page"
		nav={nav}
		draft=""
		open={options.open ?? true}
		source={injectedSource(options.counterpart ?? "published")}
	/>)
	return { nav }
}

beforeEach(() => {
	mocks.menus = []
	mocks.group = false
})
afterEach(cleanup)

describe("MessagerieConversationView — « Signaler ou bloquer » dans l'en-tête (IC-03)", () => {
	it("un fil à deux : la personne en face, signalable si son profil est publié ; bloquer fait revenir en arrière", () => {
		const { nav } = mount()
		expect(screen.getByTestId("protection")).toBeInTheDocument()
		const menu = mocks.menus.at(-1)
		expect(menu).toMatchObject({ personId: AWA, name: NAME, canReport: true, triggerName: NAME })
		expect(menu?.onBlocked).toBe(nav.back)
	})

	it("un correspondant sans profil publié : bloquer seulement (aucune cible `person` à signaler)", () => {
		mount({ counterpart: "unknown" })
		expect(mocks.menus.at(-1)).toMatchObject({ personId: AWA, name: null, canReport: false })
	})

	it("ni dans un groupe, ni dans un brouillon, ni sur une carte repliée", () => {
		for (const options of [{ kind: "groupe" as const }, { kind: "draft" as const }, { open: false }]) {
			mount(options)
			expect(screen.getByTestId("header")).toBeInTheDocument()
			expect(screen.queryByTestId("protection")).toBeNull()
			cleanup()
		}
		expect(mocks.menus).toEqual([])
	})
})
