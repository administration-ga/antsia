// @vitest-environment jsdom
// IM-01 (issue antsia#100, lot IC-04) : la fiche d'un groupe ne propose d'appel que si l'application en
// déclare (`callsAvailable`) ; absente, rien ne change. Les autres actions rapides demeurent.
import { cleanup, screen } from "@testing-library/react"
import { getFunctionName, type FunctionReference } from "convex/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { renderWithEngine } from "../../tests/engine-wrapper"

const GROUPE = { title: "Comité", memberCount: 3, myRole: "member", description: null, avatarUrl: null, closed: false, createdAt: 1, createdBy: { displayName: "Awa", handle: "awa", avatarUrl: null } }

vi.mock("@antsia/api/hooks", () => ({
	useAuthenticatedConvexQuery: (_query: unknown, args: unknown) => ({ data: args === "skip" ? undefined : GROUPE_OR_LIST(_query), isError: false, isLoading: false }),
	useAuthenticatedPaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: vi.fn(), isLoading: false }),
	useConvexMutationQuery: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock("./messagerie-styles", () => ({ MessagerieStyles: () => null }))
vi.mock("react-qr-code", () => ({ default: () => null }))

/** La fiche lit le groupe, puis mes relations (liste vide ici). */
function GROUPE_OR_LIST(query: unknown) {
	return getFunctionName(query as FunctionReference<"query">).includes("listMyConnectionsForGroup") ? [] : GROUPE
}

import { MessagerieGroupeInfos } from "./MessagerieGroupeInfos"

afterEach(cleanup)

function fiche(options: { callsAvailable?: boolean } = {}) {
	return renderWithEngine(
		<MessagerieGroupeInfos threadId="groupThreads_1" variant="page" onClose={vi.fn()} onLeft={vi.fn()} onStartAudio={vi.fn()} onStartVideo={vi.fn()} />,
		options,
	)
}

describe("MessagerieGroupeInfos — appels déclarés par l'application (IM-01)", () => {
	it("par défaut, la fiche propose l'appel audio et vidéo du groupe", () => {
		fiche()
		expect(screen.getByRole("button", { name: "Audio" })).toBeInTheDocument()
		expect(screen.getByRole("button", { name: "Vidéo" })).toBeInTheDocument()
	})

	it("déclarée fermée : ni audio ni vidéo ; ajouter et rechercher restent", () => {
		fiche({ callsAvailable: false })
		expect(screen.queryByRole("button", { name: "Audio" })).toBeNull()
		expect(screen.queryByRole("button", { name: "Vidéo" })).toBeNull()
		expect(screen.getByRole("button", { name: "Rechercher" })).toBeInTheDocument()
	})
})
