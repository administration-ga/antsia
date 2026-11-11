// @vitest-environment jsdom
/**
 * IC-03 — dans la fiche d'un groupe iCom, chaque AUTRE membre se signale (profil
 * publié) ou se bloque depuis sa ligne ; ma propre ligne n'offre jamais ce geste.
 * Membres fictifs.
 */
import { cleanup, fireEvent, screen, within } from "@testing-library/react"
import { getFunctionName, type FunctionReference } from "convex/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { renderWithEngine } from "../../tests/engine-wrapper"

const GROUPE = { title: "Comité", memberCount: 3, myRole: "member", description: null, avatarUrl: null, closed: false, createdAt: 1, createdBy: { displayName: "Awa", handle: "awa", avatarUrl: null } }
/** Moi, une personne au profil publié, une personne sans profil publié. */
const MEMBRES = [
	{ personId: "persons_me", label: { displayName: "Moi", handle: "moi", avatarUrl: null }, role: "member", isMe: true, joinedAt: 1 },
	{ personId: "persons_awa", label: { displayName: "Awa NDONG", handle: "awa", avatarUrl: null }, role: "member", isMe: false, joinedAt: 2 },
	{ personId: "persons_sans_profil", label: { displayName: null, handle: null, avatarUrl: null }, role: "member", isMe: false, joinedAt: 3 },
]

const nameOf = (query: unknown) => getFunctionName(query as FunctionReference<"query">)

vi.mock("@antsia/api/hooks", () => ({
	useAuthenticatedConvexQuery: (query: unknown, args: unknown) => ({ data: args === "skip" ? undefined : nameOf(query).includes("listMyConnectionsForGroup") ? [] : GROUPE, isError: false, isLoading: false }),
	useAuthenticatedPaginatedQuery: (query: unknown, args: unknown) => ({ results: args !== "skip" && nameOf(query).includes("paginateGroupMembers") ? MEMBRES : [], status: "Exhausted", loadMore: vi.fn(), isLoading: false }),
	useConvexMutationQuery: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock("./messagerie-styles", () => ({ MessagerieStyles: () => null }))
vi.mock("react-qr-code", () => ({ default: () => null }))

import { MessagerieGroupeInfos } from "./MessagerieGroupeInfos"

afterEach(cleanup)

function fiche() {
	return renderWithEngine(<MessagerieGroupeInfos threadId="groupThreads_1" variant="page" onClose={vi.fn()} onLeft={vi.fn()} />)
}

describe("MessagerieGroupeInfos — signaler ou bloquer un membre (IC-03)", () => {
	it("chaque autre membre porte le geste ; ma ligne, jamais", () => {
		fiche()
		expect(screen.getByRole("button", { name: "Signaler ou bloquer Awa NDONG" })).toBeInTheDocument()
		// Sans profil publié : aucune cible `person` à signaler — bloquer seulement.
		expect(screen.getByRole("button", { name: "Bloquer Personne du réseau" })).toBeInTheDocument()
		expect(screen.queryByRole("button", { name: /^(Signaler ou bloquer|Bloquer) Moi/ })).toBeNull()
	})

	it("le geste ouvre la feuille de la personne : signaler, puis bloquer", () => {
		fiche()
		fireEvent.click(screen.getByRole("button", { name: "Signaler ou bloquer Awa NDONG" }))
		const sheet = screen.getByRole("dialog", { name: "Signaler ou bloquer" })
		expect(within(sheet).getByText("Signaler Awa NDONG")).toBeTruthy()
		expect(within(sheet).getByText("Bloquer Awa NDONG")).toBeTruthy()
	})
})
