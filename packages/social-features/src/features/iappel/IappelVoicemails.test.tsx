// @vitest-environment jsdom
/**
 * IC-02 — la messagerie vocale REÇUE dans le journal d'appels : le filtre et sa
 * pastille, l'écoute servie par la garde (`playbackUrl`), la retenue dite, le
 * passage à « écouté », la suppression confirmée, les états de la liste, et
 * l'absence de ce filtre (comme de sa souscription) dans le journal d'iCom Pro.
 */
import type { CounterpartLabel } from "@antsia/social-contracts/counterpart"
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react"
import { ConvexError } from "convex/values"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
	listing: undefined as unknown,
	listingError: false,
	queryArgs: [] as unknown[],
	playbackUrl: vi.fn(),
	markRead: vi.fn(),
	deleteMine: vi.fn(),
	markSeen: vi.fn(),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
}))

vi.mock("@antsia/api/engine", () => ({
	api: {
		modules: {
			calls: {
				history: { listCallHistory: "history" },
				preferences: { markJournalSeen: "seen" },
				voicemail: { listMine: "voicemails", playbackUrl: "playbackUrl", markRead: "markRead", deleteMine: "deleteMine" },
			},
		},
	},
}))
vi.mock("@antsia/api/hooks", () => ({
	useAuthenticatedConvexQuery: (query: string, args: unknown) => {
		if (query !== "voicemails") return { data: { calls: [], truncated: false }, isLoading: false, isError: false }
		state.queryArgs.push(args)
		if (args === "skip") return { data: undefined, isLoading: false, isError: false }
		return { data: state.listingError ? undefined : state.listing, isLoading: false, isError: state.listingError }
	},
}))
vi.mock("convex/react", () => ({
	useMutation: (name: string) =>
		name === "playbackUrl" ? state.playbackUrl : name === "markRead" ? state.markRead : name === "deleteMine" ? state.deleteMine : state.markSeen,
}))
vi.mock("sonner", () => ({ toast: { success: state.toastSuccess, error: state.toastError } }))

import { renderWithEngine, TEST_NETWORK_ID } from "../../tests/engine-wrapper"
import { IappelJournal } from "./IappelJournal"

const AWA: CounterpartLabel = { displayName: "Awa", handle: "awa", headline: null, avatarUrl: null, source: "published" }
const BRICE: CounterpartLabel = { displayName: "Brice", handle: "brice", headline: null, avatarUrl: null, source: "published" }

function voicemail(over: Record<string, unknown> = {}) {
	return {
		voicemailId: "voicemails_awa",
		from: { personId: "persons_awa", label: AWA },
		durationMs: 15_000,
		isRead: false,
		readAt: null,
		createdAt: Date.now() - 120_000,
		...over,
	}
}

function openVoicemails(props: { family?: "personnel" | "pro" } = {}) {
	renderWithEngine(<IappelJournal onCallBack={vi.fn()} {...props} />)
	fireEvent.click(screen.getByRole("button", { name: /^Messages vocaux/ }))
}

beforeEach(() => {
	vi.resetAllMocks()
	state.listing = { items: [voicemail()], unreadCount: 1 }
	state.listingError = false
	state.queryArgs = []
	Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: vi.fn(() => Promise.resolve()) })
})
afterEach(cleanup)

describe("journal d'appels — le filtre « Messages vocaux »", () => {
	it("lit MA messagerie du réseau courant, compte les non-écoutés, et ne rend la liste qu'au filtre", () => {
		state.listing = {
			items: [voicemail(), voicemail({ voicemailId: "voicemails_brice", from: { personId: "persons_brice", label: BRICE }, isRead: true, readAt: Date.now() - 60_000, durationMs: 62_000 })],
			unreadCount: 1,
		}
		renderWithEngine(<IappelJournal onCallBack={vi.fn()} />)
		expect(state.queryArgs).toContainEqual({ networkId: TEST_NETWORK_ID, limit: 50 })
		// Le chiffre est décoratif ; le nom accessible porte la phrase (`sr-only`).
		const filter = screen.getByRole("button", { name: /^Messages vocaux\s*1 message vocal non écouté$/ })
		expect(screen.queryByRole("list", { name: "Messages vocaux reçus" })).toBeNull()

		fireEvent.click(filter)
		expect(filter.getAttribute("aria-pressed")).toBe("true")
		const rows = within(screen.getByRole("list", { name: "Messages vocaux reçus" })).getAllByRole("listitem")
		expect(rows).toHaveLength(2)
		expect(rows[0]?.textContent).toContain("Awa")
		expect(rows[0]?.textContent).toContain("Message vocal · 00:15 · Non écouté")
		expect(rows[1]?.textContent).toContain("Brice")
		expect(rows[1]?.textContent).toContain("01:02")
		expect(rows[1]?.textContent).not.toContain("Non écouté")
		// Seul un message non écouté propose « Marquer comme écouté ».
		expect(screen.getByRole("button", { name: "Marquer le message de Awa comme écouté" })).toBeTruthy()
		expect(screen.queryByRole("button", { name: "Marquer le message de Brice comme écouté" })).toBeNull()
	})

	it("Écouter : l'URL vient de la garde, le lecteur natif paraît, et la première lecture marque le message écouté", async () => {
		state.playbackUrl.mockResolvedValue({ url: "blob:voicemail-awa", withheld: null })
		openVoicemails()
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Écouter le message de Awa" }))
		})
		expect(state.playbackUrl).toHaveBeenCalledExactlyOnceWith({ networkId: TEST_NETWORK_ID, voicemailId: "voicemails_awa" })
		const player = screen.getByLabelText("Message vocal de Awa")
		expect(player.tagName).toBe("AUDIO")
		expect(player.getAttribute("src")).toBe("blob:voicemail-awa")
		expect(player.hasAttribute("controls")).toBe(true)
		expect(state.markRead).not.toHaveBeenCalled()

		await act(async () => {
			fireEvent.play(player)
		})
		expect(state.markRead).toHaveBeenCalledExactlyOnceWith({ networkId: TEST_NETWORK_ID, voicemailId: "voicemails_awa" })
	})

	it("un enregistrement que la garde retient le DIT, sans lecteur, et l'écoute reste à réessayer", async () => {
		state.playbackUrl.mockResolvedValue({ url: null, withheld: "fileScanPending" })
		openVoicemails()
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Écouter le message de Awa" }))
		})
		expect(screen.getByRole("status").textContent).toBe("Analyse de sécurité en cours : le fichier sera disponible dans quelques instants.")
		expect(screen.queryByLabelText("Message vocal de Awa")).toBeNull()
		expect(screen.getByRole("button", { name: "Écouter le message de Awa" })).toBeTruthy()
		expect(state.markRead).not.toHaveBeenCalled()
	})

	it("« Marquer comme écouté » passe par le serveur, sans écouter", async () => {
		state.markRead.mockResolvedValue(null)
		openVoicemails()
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Marquer le message de Awa comme écouté" }))
		})
		expect(state.markRead).toHaveBeenCalledExactlyOnceWith({ networkId: TEST_NETWORK_ID, voicemailId: "voicemails_awa" })
		expect(state.playbackUrl).not.toHaveBeenCalled()
	})

	it("Supprimer demande d'abord confirmation ; Annuler ne supprime rien ; confirmer supprime et le dit", async () => {
		state.deleteMine.mockResolvedValue(null)
		openVoicemails()
		const remove = screen.getByRole("button", { name: "Supprimer le message de Awa" })
		fireEvent.click(remove)
		expect(remove.getAttribute("aria-pressed")).toBe("true")
		let confirmation = screen.getByRole("group", { name: "Supprimer définitivement le message vocal de Awa ? Il ne pourra pas être récupéré." })
		fireEvent.click(within(confirmation).getByRole("button", { name: "Annuler" }))
		expect(screen.queryByRole("group", { name: /Supprimer définitivement/ })).toBeNull()
		expect(state.deleteMine).not.toHaveBeenCalled()

		fireEvent.click(remove)
		confirmation = screen.getByRole("group", { name: /Supprimer définitivement/ })
		await act(async () => {
			fireEvent.click(within(confirmation).getByRole("button", { name: "Supprimer" }))
		})
		expect(state.deleteMine).toHaveBeenCalledExactlyOnceWith({ networkId: TEST_NETWORK_ID, voicemailId: "voicemails_awa" })
		expect(state.toastSuccess).toHaveBeenCalledExactlyOnceWith("Message vocal supprimé.")
	})

	it("le refus indistinct du serveur se dit sans détail : le message n'est plus disponible", async () => {
		state.deleteMine.mockRejectedValue(new ConvexError({ code: "notFound" }))
		openVoicemails()
		fireEvent.click(screen.getByRole("button", { name: "Supprimer le message de Awa" }))
		await act(async () => {
			fireEvent.click(within(screen.getByRole("group", { name: /Supprimer définitivement/ })).getByRole("button", { name: "Supprimer" }))
		})
		expect(state.toastError).toHaveBeenCalledExactlyOnceWith("Ce message vocal n'est plus disponible.")
		expect(state.toastSuccess).not.toHaveBeenCalled()
	})

	it("états de la liste : chargement, erreur, vide", () => {
		state.listing = undefined
		openVoicemails()
		expect(screen.getByRole("status").textContent).toBe("Chargement de vos messages vocaux…")
		cleanup()

		state.listingError = true
		openVoicemails()
		expect(screen.getByRole("alert").textContent).toBe("Vos messages vocaux n'ont pas pu être chargés. Réessayez dans un instant.")
		cleanup()

		state.listingError = false
		state.listing = { items: [], unreadCount: 0 }
		openVoicemails()
		expect(screen.getByText(/^Aucun message vocal\./)).toBeTruthy()
		// Sans non-écouté, le filtre ne porte aucune pastille.
		expect(screen.getByRole("button", { name: "Messages vocaux" })).toBeTruthy()
	})

	it("iCom Pro : ni filtre « Messages vocaux », ni souscription à la messagerie vocale", () => {
		renderWithEngine(<IappelJournal onCallBack={vi.fn()} family="pro" />)
		expect(screen.queryByRole("button", { name: /^Messages vocaux/ })).toBeNull()
		expect(state.queryArgs.length).toBeGreaterThan(0)
		expect(state.queryArgs.every((args) => args === "skip")).toBe(true)
	})
})
