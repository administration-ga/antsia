// Dupliqué de socle/packages/agent-features/src/features/notifications/NotificationsCenter.test.tsx @ ad2e7fdc2 — adaptations : RÉÉCRIT pour l'onglet Réseau SEUL, monté dans l'enveloppe du moteur (`renderWithEngine`) avec `notifications.bell.*` et `graph.connections.*` simulées par référence et des lignes au DTO du moteur (sujet `{ kind, id }`, acteur par mini-profil) ; retirés avec l'onglet « Administration » et sa table centrale : l'onglet ouvert d'emblée et son figement (7 cas), les onglets et leurs pastilles (3), les lignes administratives (9) et les états de la liste administrative (4) ; portés : « Tout marquer lu » (3 cas, une seule mutation désormais, refus dit par son code) et la ligne Réseau qui ferme la carte avant de naviguer (adresse de profil injectée) ; les quatre états de liste (chargement, page suivante, chargement de la suite, panne distincte du vide) et les gestes « Marquer lu » / ligne lue sans geste sont portés sur la liste du RÉSEAU ; ajoutés : réseau courant passé aux requêtes, liste vide, publication ouverte sur la page réseau, genres du moteur et nom neutre, statut vivant d'un fichier retenu, et la décision d'une invitation (relecture puis réponse, déjà traitée, conflit, refus de débit qui garde les boutons) ; cas neuf (lot F2) : la page d'un `page_post` est nommée avec son badge calculé.
// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { memoryRouter, renderWithEngine, TEST_NETWORK_ID, TEST_ROUTES } from "../../tests/engine-wrapper"

type PaginationStatus =
	| "LoadingFirstPage"
	| "CanLoadMore"
	| "LoadingMore"
	| "Exhausted"

const mocks = vi.hoisted(() => ({
	unread: { count: 0, capped: false } as { count: number; capped: boolean } | undefined,
	results: [] as unknown[],
	status: "Exhausted" as PaginationStatus,
	loading: false,
	paginationError: false,
	loadMore: vi.fn(),
	queries: [] as { reference: string; args: unknown }[],
	markRead: vi.fn(),
	markAllRead: vi.fn(),
	respond: vi.fn(),
	convexQuery: vi.fn(),
}))

vi.mock("@antsia/api/engine", () => ({
	api: {
		modules: {
			notifications: {
				bell: {
					paginateNotifications: "paginateNotifications",
					unreadCount: "unreadCount",
					markRead: "markRead",
					markAllRead: "markAllRead",
				},
			},
			graph: {
				connections: {
					respondToConnection: "respondToConnection",
					pendingState: "pendingState",
				},
			},
		},
	},
}))

vi.mock("@antsia/api/hooks", () => ({
	useAuthenticatedConvexQuery: (reference: string, args: unknown) => {
		mocks.queries.push({ reference, args })
		return { data: mocks.unread, isLoading: false, isError: false }
	},
	useAuthenticatedPaginatedQuery: (reference: string, args: unknown) => {
		mocks.queries.push({ reference, args })
		if (mocks.paginationError) throw new Error("panne pagination")
		return {
			results: mocks.results,
			status: mocks.status,
			loadMore: mocks.loadMore,
			isLoading: mocks.loading,
		}
	},
}))

vi.mock("convex/react", () => ({
	useMutation: (reference: string) => {
		switch (reference) {
			case "markRead":
				return mocks.markRead
			case "markAllRead":
				return mocks.markAllRead
			case "respondToConnection":
				return mocks.respond
			default:
				return vi.fn().mockResolvedValue(undefined)
		}
	},
	useConvex: () => ({ query: mocks.convexQuery }),
}))

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from "sonner"
import { NotificationsCenter } from "./NotificationsCenter"
import {
	openNotificationCenter,
	readNotificationCenter,
	resetNotificationCenterForTests,
} from "./notification-center-store"

const NOW = 1_800_000_000_000

const EMPTY = /Aucune activité pour le moment/

/** Une ligne au DTO de la cloche du moteur. */
function notification(id: string, overrides: Record<string, unknown> = {}) {
	return {
		notificationId: id,
		kind: "post_reaction",
		subject: null,
		createdAt: NOW - 60_000,
		readAt: null,
		resolution: null,
		inviteState: null,
		fileScanStatus: null,
		actor: {
			personId: "persons_awa",
			displayName: "Awa",
			handle: "awa.mba",
			avatarUrl: null,
			badges: [],
		},
		page: null,
		...overrides,
	}
}

function renderedSentence(text: string) {
	return screen.getByText((_content, element) => element?.classList.contains("ntf-sentence") === true && element.textContent === text)
}

function renderCenter() {
	return renderWithEngine(<NotificationsCenter now={NOW} targets={{}} />)
}

/** jsdom ne navigue pas : on retient la navigation native, le gestionnaire React de la ligne s'exécute quand même. */
function holdNavigation(link: HTMLElement) {
	link.addEventListener("click", (event) => event.preventDefault())
}

beforeEach(() => {
	mocks.unread = { count: 0, capped: false }
	mocks.results = []
	mocks.status = "Exhausted"
	mocks.loading = false
	mocks.paginationError = false
	mocks.loadMore.mockReset()
	mocks.queries = []
	mocks.markRead.mockReset().mockResolvedValue({ read: true })
	mocks.markAllRead.mockReset().mockResolvedValue({ marked: 0, pending: false })
	mocks.respond.mockReset().mockResolvedValue({ status: "accepted" })
	mocks.convexQuery
		.mockReset()
		.mockResolvedValue({ status: "requested", iAmRecipient: true })
	vi.mocked(toast.error).mockClear()
	vi.mocked(toast.success).mockClear()
	resetNotificationCenterForTests()
	// Une ouverture réelle de la carte.
	openNotificationCenter()
})

afterEach(() => {
	resetNotificationCenterForTests()
})

describe("NotificationsCenter — une seule source, la cloche du réseau", () => {
	it("passe le réseau COURANT au décompte et à la liste", () => {
		renderCenter()

		expect(mocks.queries).toContainEqual({
			reference: "unreadCount",
			args: { networkId: TEST_NETWORK_ID },
		})
		expect(mocks.queries).toContainEqual({
			reference: "paginateNotifications",
			args: { networkId: TEST_NETWORK_ID },
		})
	})

	it("monte la liste sans onglets ni en-tête propre, et dit la liste vide", () => {
		renderCenter()

		expect(screen.queryByRole("tablist")).toBeNull()
		expect(screen.queryByRole("heading", { name: "Activité" })).toBeNull()
		expect(screen.getByText(EMPTY)).toBeInTheDocument()
	})
})

describe("NotificationsCenter — « Tout marquer lu »", () => {
	it("appelle la mutation du réseau, une seule fois", async () => {
		mocks.unread = { count: 3, capped: false }
		renderCenter()

		// Un seul bouton : la liste est montée sans son propre en-tête.
		expect(
			screen.getAllByRole("button", { name: "Tout marquer lu" }),
		).toHaveLength(1)

		fireEvent.click(screen.getByRole("button", { name: "Tout marquer lu" }))

		expect(mocks.markAllRead).toHaveBeenCalledTimes(1)
		expect(mocks.markAllRead).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID })
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(toast.error).not.toHaveBeenCalled()
	})

	it("dit l'échec — par le code du moteur quand il en rend un", async () => {
		mocks.unread = { count: 1, capped: false }
		mocks.markAllRead
			.mockRejectedValueOnce(new Error("panne"))
			.mockRejectedValueOnce({ data: { code: "rateLimited" } })
		renderCenter()

		fireEvent.click(screen.getByRole("button", { name: "Tout marquer lu" }))
		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith(
				"Le marquage n'a pas pu être enregistré.",
			),
		)

		fireEvent.click(screen.getByRole("button", { name: "Tout marquer lu" }))
		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith(
				"Trop de tentatives. Réessayez dans quelques instants.",
			),
		)
	})

	it("n'est pas proposé quand rien n'est à lire", () => {
		renderCenter()
		expect(screen.queryByRole("button", { name: "Tout marquer lu" })).toBeNull()
	})
})

describe("NotificationsCenter — les lignes du réseau", () => {
	it("un lien de ligne ferme la carte AVANT de naviguer, et marque lu en silence", () => {
		mocks.results = [notification("r1", { kind: "new_follower" })]
		renderCenter()
		expect(readNotificationCenter().open).toBe(true)

		const link = screen.getByRole("link", { name: "Voir le profil" })
		expect(link.getAttribute("href")).toBe(TEST_ROUTES.profile("awa.mba"))
		holdNavigation(link)
		fireEvent.click(link)

		// Sous une carte ouverte, `useModalA11y` inerte la page : la destination
		// doit s'ouvrir carte fermée.
		expect(readNotificationCenter().open).toBe(false)
		expect(mocks.markRead).toHaveBeenCalledWith({
			networkId: TEST_NETWORK_ID,
			notificationId: "r1",
		})
	})

	it("dit la ligne et son âge, et ouvre la publication sur la page réseau", () => {
		mocks.results = [
			notification("r2", { subject: { kind: "post", id: "post-9" } }),
		]
		renderCenter()

		expect(renderedSentence("Awa a réagi à votre publication.")).toBeInTheDocument()
		expect(screen.getByText("il y a 1 min")).toBeInTheDocument()
		expect(
			screen.getByRole("link", { name: "Ouvrir" }).getAttribute("href"),
		).toBe(`${TEST_ROUTES.home()}?post=post-9`)
	})

	it("phrase les genres que le moteur ajoute, et nomme sans profil publié par le libellé neutre", () => {
		mocks.results = [
			notification("r3", {
				kind: "call_missed",
				subject: { kind: "call", id: "call-1" },
			}),
			notification("r4", { kind: "attestation_verified", actor: null }),
			notification("r5", {
				kind: "post_comment",
				actor: {
					personId: "persons_x",
					displayName: null,
					handle: null,
					avatarUrl: null,
					badges: [],
				},
			}),
		]
		renderCenter()

		expect(renderedSentence("Awa a cherché à vous joindre.")).toBeInTheDocument()
		expect(
			screen.getByRole("link", { name: "Ouvrir" }).getAttribute("href"),
		).toBe(`${TEST_ROUTES.messages()}?brique=iappel`)
		expect(
			screen.getByText(
				"Votre inscription consulaire est confirmée : votre compte est vérifié.",
			),
		).toBeInTheDocument()
		expect(
			screen.getByText("Membre du réseau a commenté votre publication."),
		).toBeInTheDocument()
	})

	it("une page qui publie est NOMMÉE avec son badge calculé — « Communauté » se dit", () => {
		mocks.results = [
			notification("r7", {
				kind: "page_post",
				actor: null,
				subject: { kind: "post", id: "posts_1" },
				page: {
					pageId: "pages_1",
					networkId: TEST_NETWORK_ID,
					handle: "direction-des-impots",
					name: "Direction des Impôts",
					shortName: null,
					logoUrl: null,
					badge: "community",
					ownerKind: "community",
					country: null,
				},
			}),
		]
		renderCenter()

		expect(renderedSentence("Direction des Impôts a publié.")).toBeInTheDocument()
		expect(screen.getByText("Communauté")).toBeInTheDocument()
		expect(screen.queryByText("Officiel")).toBeNull()
	})

	it("une ligne sans cible, non lue, n'offre que « Marquer lu »", async () => {
		mocks.results = [notification("r6", { kind: "attestation_verified", actor: null })]
		renderCenter()

		expect(screen.queryByRole("link", { name: "Ouvrir" })).toBeNull()
		fireEvent.click(screen.getByRole("button", { name: "Marquer lu" }))

		await waitFor(() =>
			expect(mocks.markRead).toHaveBeenCalledWith({
				networkId: TEST_NETWORK_ID,
				notificationId: "r6",
			}),
		)
		// Marquer lu n'est pas une navigation : la carte reste ouverte.
		expect(readNotificationCenter().open).toBe(true)
	})

	it("une ligne sans cible, déjà lue, n'offre aucun geste", () => {
		mocks.results = [
			notification("r7", { kind: "attestation_verified", actor: null, readAt: NOW - 1_000 }),
		]
		renderCenter()

		expect(screen.queryByRole("button", { name: "Marquer lu" })).toBeNull()
		expect(screen.queryByRole("link", { name: /Ouvrir/ })).toBeNull()
	})

	it("dit l'échec du bouton « Marquer lu »", async () => {
		mocks.markRead.mockRejectedValueOnce(new Error("panne"))
		mocks.results = [notification("r8", { kind: "attestation_verified", actor: null })]
		renderCenter()

		fireEvent.click(screen.getByRole("button", { name: "Marquer lu" }))

		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith(
				"Le marquage n'a pas pu être enregistré.",
			),
		)
	})

	it("un fichier retenu dit son statut VIVANT", () => {
		mocks.results = [
			notification("r9", {
				kind: "file_withheld",
				actor: null,
				subject: { kind: "fileScan", id: "scan-1" },
				fileScanStatus: "clean",
			}),
		]
		renderCenter()

		expect(
			screen.getByText("Un fichier déposé a été retenu par l'analyse de sécurité."),
		).toBeInTheDocument()
		expect(screen.getByText("Ce fichier a depuis été libéré.")).toBeInTheDocument()
	})
})

describe("NotificationsCenter — une invitation de relation se décide sur place", () => {
	function invitation() {
		return notification("c1", {
			kind: "connection_request",
			subject: { kind: "connection", id: "cnx-1" },
			inviteState: { status: "requested", iAmRecipient: true },
		})
	}

	it("relit l'état AVANT de répondre, et dit le résultat sans marquage de plus", async () => {
		mocks.results = [invitation()]
		const router = memoryRouter()
		const onOpenConnection = vi.fn()
		renderWithEngine(<NotificationsCenter now={NOW} targets={{ onOpenConnection }} />, { router: router.implementation })

		expect(renderedSentence("Awa souhaite se connecter avec vous.")).toBeInTheDocument()
		fireEvent.click(screen.getByRole("button", { name: "Confirmer" }))

		expect(await screen.findByText("Connexion acceptée.")).toBeInTheDocument()
		expect(mocks.convexQuery).toHaveBeenCalledWith("pendingState", {
			networkId: TEST_NETWORK_ID,
			connectionId: "cnx-1",
		})
		expect(mocks.respond).toHaveBeenCalledWith({
			networkId: TEST_NETWORK_ID,
			connectionId: "cnx-1",
			accept: true,
		})
		expect(mocks.convexQuery.mock.invocationCallOrder[0] as number).toBeLessThan(
			mocks.respond.mock.invocationCallOrder[0] as number,
		)
		expect(toast.success).toHaveBeenCalledWith("Connexion acceptée.")
		// La transaction qui tranche résout et marque la ligne : rien à ajouter.
		expect(mocks.markRead).not.toHaveBeenCalled()
		expect(router.calls).toEqual([])
		expect(onOpenConnection).not.toHaveBeenCalled()
		expect(readNotificationCenter().open).toBe(true)
		expect(screen.queryByRole("link")).toBeNull()
	})

	it("refuser dit « Invitation déclinée. »", async () => {
		mocks.results = [invitation()]
		renderCenter()

		fireEvent.click(screen.getByRole("button", { name: "Refuser" }))

		expect(await screen.findByText("Invitation déclinée.")).toBeInTheDocument()
		expect(mocks.respond).toHaveBeenCalledWith({
			networkId: TEST_NETWORK_ID,
			connectionId: "cnx-1",
			accept: false,
		})
	})

	it("une invitation tranchée ailleurs entre-temps le dit, sans répondre, et se marque lue", async () => {
		mocks.results = [invitation()]
		mocks.convexQuery.mockResolvedValueOnce({ status: "accepted", iAmRecipient: true })
		renderCenter()

		fireEvent.click(screen.getByRole("button", { name: "Confirmer" }))

		expect(await screen.findByText("Invitation déjà traitée.")).toBeInTheDocument()
		expect(mocks.respond).not.toHaveBeenCalled()
		expect(mocks.markRead).toHaveBeenCalledWith({
			networkId: TEST_NETWORK_ID,
			notificationId: "c1",
		})
	})

	it("un conflit au serveur (tranchée entre la relecture et la réponse) dit « déjà traitée »", async () => {
		mocks.results = [invitation()]
		mocks.respond.mockRejectedValueOnce({ data: { code: "conflict" } })
		renderCenter()

		fireEvent.click(screen.getByRole("button", { name: "Confirmer" }))

		expect(await screen.findByText("Invitation déjà traitée.")).toBeInTheDocument()
		expect(mocks.markRead).toHaveBeenCalledTimes(1)
	})

	it("un refus qui ne dit rien de l'invitation (débit) se dit par son code, et garde les boutons", async () => {
		mocks.results = [invitation()]
		mocks.respond.mockRejectedValueOnce({ data: { code: "rateLimited" } })
		renderCenter()

		fireEvent.click(screen.getByRole("button", { name: "Confirmer" }))

		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith(
				"Trop de tentatives. Réessayez dans quelques instants.",
			),
		)
		expect(screen.getByRole("button", { name: "Confirmer" })).not.toBeDisabled()
		expect(screen.queryByText("Invitation déjà traitée.")).toBeNull()
		expect(mocks.markRead).not.toHaveBeenCalled()
	})

	it.each(["pendingState", "respond"])("une panne technique de %s conserve les deux décisions et la carte", async (step) => {
		mocks.results = [invitation()]
		if (step === "pendingState") mocks.convexQuery.mockRejectedValueOnce(new Error("network timeout"))
		else mocks.respond.mockRejectedValueOnce(new Error("network timeout"))
		renderCenter()
		fireEvent.click(screen.getByRole("button", { name: "Confirmer" }))
		await waitFor(() => expect(toast.error).toHaveBeenCalledWith("La réponse n’a pas pu être enregistrée. Réessayez."))
		expect(screen.getByRole("button", { name: "Confirmer" })).not.toBeDisabled()
		expect(screen.getByRole("button", { name: "Refuser" })).not.toBeDisabled()
		expect(screen.queryByText("Invitation déjà traitée.")).toBeNull()
		expect(mocks.markRead).not.toHaveBeenCalled()
		expect(readNotificationCenter().open).toBe(true)
	})

	it("une invitation déjà tranchée ne propose plus rien, et dit son résultat", () => {
		mocks.results = [
			notification("c2", {
				kind: "connection_request",
				subject: { kind: "connection", id: "cnx-2" },
				resolution: { kind: "declined", at: NOW - 5_000 },
				readAt: NOW - 5_000,
			}),
		]
		renderCenter()

		expect(screen.getByText("Invitation déclinée.")).toBeInTheDocument()
		expect(screen.queryByRole("button", { name: "Confirmer" })).toBeNull()
		expect(screen.queryByRole("button", { name: "Marquer lu" })).toBeNull()
	})
})

describe("NotificationsCenter — états de la liste", () => {
	it("dit le chargement de la première page", () => {
		mocks.loading = true
		mocks.status = "LoadingFirstPage"
		renderCenter()

		expect(screen.getByText("Chargement…")).toBeInTheDocument()
	})

	it("charge la page suivante sur « Voir plus d'activité », par pas de 20", () => {
		mocks.results = [notification("b1")]
		mocks.status = "CanLoadMore"
		renderCenter()

		fireEvent.click(screen.getByRole("button", { name: "Voir plus d'activité" }))
		expect(mocks.loadMore).toHaveBeenCalledWith(20)
	})

	it("annonce le chargement de l'activité précédente", () => {
		mocks.results = [notification("b2")]
		mocks.status = "LoadingMore"
		renderCenter()

		expect(
			screen.getByText("Chargement de l'activité précédente…"),
		).toBeInTheDocument()
		expect(screen.queryByRole("button", { name: "Voir plus d'activité" })).toBeNull()
	})

	it("distingue une panne d'une liste vide", () => {
		// React consigne l'erreur rattrapée par la frontière : attendue ici.
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
		mocks.paginationError = true
		renderCenter()

		const alert = screen.getByRole("alert")
		expect(alert.textContent).toContain("Activité indisponible")
		expect(screen.queryByText(EMPTY)).toBeNull()
		consoleError.mockRestore()
	})
})


describe("NotificationsCenter — présentation sociale et notifications chargées", () => {
	it("montre le portrait public et met le nom de l'acteur en évidence", () => {
		mocks.results = [notification("portrait", {
			subject: { kind: "post", id: "post-portrait" },
			actor: { personId: "persons_awa", displayName: "Awa MBA", handle: "awa.mba", avatarUrl: "/medias/awa.webp", badges: [] },
		})]
		const { container } = renderCenter()
		expect(container.querySelector(".ntf-avatar img")?.getAttribute("src")).toBe("/medias/awa.webp")
		expect(container.querySelector(".ntf-sentence strong")?.textContent).toBe("Awa MBA")
		expect(container.querySelector(".ntf-kind svg")).not.toBeNull()
		expect(container.querySelector("a button")).toBeNull()
	})

	it("ne transforme pas l'acteur d'un avis système en auteur affiché", () => {
		mocks.results = [notification("system", {
			kind: "moderation_decision",
			actor: { personId: "persons_awa", displayName: "Awa MBA", handle: "awa.mba", avatarUrl: "/medias/awa.webp", badges: [] },
		})]
		const { container } = renderCenter()
		expect(container.querySelector(".ntf-avatar img")).toBeNull()
		expect(screen.queryByText("Awa MBA")).toBeNull()
		expect(screen.getByText(/Une décision de modération vous concerne/)).toBeInTheDocument()
	})

	it("distingue les lignes non lues et groupe les dates réelles sans inventer de contenu", () => {
		mocks.results = [notification("recent"), notification("older", { createdAt: NOW - 3 * 24 * 60 * 60 * 1000, readAt: NOW - 1_000 })]
		const { container } = renderCenter()
		expect(screen.getByRole("heading", { name: "Nouveau" })).toBeInTheDocument()
		expect(screen.getByRole("heading", { name: "Plus tôt" })).toBeInTheDocument()
		expect(within(screen.getByRole("region", { name: "Nouveau" })).getByText("il y a 1 min")).toBeInTheDocument()
		expect(container.querySelectorAll("li.ntf-row[data-unread]")).toHaveLength(1)
		expect(screen.getByText("Notification non lue.")).toBeInTheDocument()
	})

	it("filtre les non-lues chargées et garde la pagination d'une page filtrée vide", () => {
		mocks.results = [notification("read", { readAt: NOW - 1_000 })]
		mocks.status = "CanLoadMore"
		renderCenter()
		fireEvent.click(screen.getByRole("button", { name: "Non lues" }))
		expect(screen.getByRole("button", { name: "Non lues" }).getAttribute("aria-pressed")).toBe("true")
		expect(screen.getByText("Aucune notification non lue parmi celles chargées.")).toBeInTheDocument()
		expect(screen.getByText(/Le filtre porte sur les notifications chargées/)).toBeInTheDocument()
		fireEvent.click(screen.getByRole("button", { name: "Voir plus d'activité" }))
		expect(mocks.loadMore).toHaveBeenCalledWith(20)
		fireEvent.click(screen.getByRole("button", { name: "Toutes" }))
		expect(renderedSentence("Awa a réagi à votre publication.")).toBeInTheDocument()
	})
})
