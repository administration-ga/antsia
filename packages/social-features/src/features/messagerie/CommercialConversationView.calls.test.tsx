// @vitest-environment jsdom
// IM-01 (issue antsia#100, lot IC-04) : une conversation de boutique ne montre l'accord et les boutons
// d'appel que si l'application déclare des appels (`callsAvailable`) ; absente, rien ne change.
// Les textes de la boutique vivent dans l'application (espace `shops`) : l'enveloppe du moteur rend
// leurs clés, que ce test lit telles quelles.
import { cleanup, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { renderWithEngine } from "../../tests/engine-wrapper"

const THREAD = {
	threadId: "commercialThreads_1",
	state: "accepted",
	viewerKind: "requester",
	shop: { shopId: "shops_1", name: "Atelier Mbolo", handle: "atelier-mbolo" },
	requester: { displayName: "Moi", handle: "moi" },
	respondents: [{ personId: "persons_2", displayName: "Awa", handle: "awa", callConsent: true }],
	capabilities: { canDecide: false, canBlock: false, canClose: false, canSend: false, canAttach: false, canSetCallConsent: true, canCall: true },
	callConsent: true,
	offer: null,
	revision: 1,
	lastMessageAt: 1,
	unread: false,
}

vi.mock("./commercial-messaging-source", async (importOriginal) => ({
	...(await importOriginal<typeof import("./commercial-messaging-source")>()),
	COMMERCIAL_MESSAGING_SOURCE: {
		useThread: () => ({ data: THREAD, isError: false, refetch: vi.fn() }),
		useMessages: () => ({ data: { page: [], isDone: true, continueCursor: "" }, isError: false, isFetching: false, refetch: vi.fn() }),
		useWrites: () => ({ read: vi.fn(async () => null), consent: vi.fn(), call: vi.fn() }),
	},
}))
vi.mock("convex/react", async (importOriginal) => ({
	...(await importOriginal<typeof import("convex/react")>()),
	useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}))
vi.mock("./MessageComposer", () => ({ MessageComposer: () => null }))

import { CommercialConversationView } from "./CommercialConversationView"

afterEach(cleanup)

describe("CommercialConversationView — appels déclarés par l'application (IM-01)", () => {
	it("par défaut, l'accord et les boutons d'appel du fil sont proposés", () => {
		renderWithEngine(<CommercialConversationView threadId="commercialThreads_1" onBack={vi.fn()} />)
		expect(screen.getByRole("checkbox", { name: "contact.calls.consent" })).toBeInTheDocument()
		expect(screen.getByRole("button", { name: "contact.calls.audio" })).toBeInTheDocument()
	})

	it("déclarée fermée : ni accord ni bouton d'appel ; la conversation reste", () => {
		renderWithEngine(<CommercialConversationView threadId="commercialThreads_1" onBack={vi.fn()} />, { callsAvailable: false })
		expect(screen.queryByRole("checkbox", { name: "contact.calls.consent" })).toBeNull()
		expect(screen.queryByRole("button", { name: "contact.calls.audio" })).toBeNull()
		expect(screen.queryByRole("button", { name: "contact.calls.video" })).toBeNull()
		expect(screen.getByText("contact.privateChannel")).toBeInTheDocument()
	})
})
