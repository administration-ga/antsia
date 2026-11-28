// Dupliqué de socle/packages/agent-features/src/features/messagerie/MessagerieListView.test.tsx @ ad2e7fdc2 — adaptations : montage dans l'enveloppe du moteur (`renderWithEngine` : i18n fr, réseau, routes) ; fils au DTO du moteur (`threadId`, `counterpart.personId`, sans `poste`) ; références simulées du moteur ; `@antsia/ui` non simulé (vrais `Alert`/`Button`) ; cas de la source de poste (« une liste désactivée n'attend rien ») porté sur une source factice désactivée, la source de poste étant retirée ; deux cas ajoutés — aperçu d'un vocal et correspondant sans nom ; les sept autres cas tels quels.
// @vitest-environment jsdom

/**
 * MessagerieListView montée — IC-06 / IC-07 (Lot 02 du socle, 2026-09-06).
 *
 * Quatre affirmations que seul un montage prouve : une panne se DIT (et se
 * réessaie), une panne après des données ne les efface pas, une liste
 * désactivée n'affiche aucun squelette, et la pastille porte le décompte du
 * SERVEUR — pas la somme de la page rendue.
 */

import { cleanup, fireEvent, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { renderWithEngine } from "../../tests/engine-wrapper"

vi.mock("@antsia/api/engine", async (importOriginal) => {
	const original = await importOriginal<typeof import("@antsia/api/engine")>()
	const modules = original.api.modules
	return {
		...original,
		api: {
			modules: {
				messaging: {
					inbox: {
						paginateMyThreads: "paginateMyThreads",
						getThread: "getThread",
						totalUnread: "totalUnread",
						startThreadWithHandle: modules.messaging.inbox.startThreadWithHandle,
					},
					messages: modules.messaging.messages,
					typing: modules.messaging.typing,
					pins: modules.messaging.pins,
					reactions: modules.messaging.reactions,
					forward: modules.messaging.forward,
				},
				groups: {
					threads: {
						paginateMyGroupThreads: "paginateMyGroupThreads",
						totalUnread: "groupesTotalUnread",
						markGroupRead: modules.groups.threads.markGroupRead,
					},
					messages: modules.groups.messages,
					typing: modules.groups.typing,
				},
				calls: { direct: { callMember: "callMember" } },
			},
		},
	}
})

vi.mock("@antsia/api/hooks", () => ({
	useAuthenticatedConvexQuery: () => ({
		data: undefined,
		isLoading: true,
		isFetching: true,
		isError: false,
		error: null,
		refetch: vi.fn(),
	}),
	useConvexMutationQuery: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock("./MessagerieGroupeInvitations", () => ({
	MessagerieGroupeInvitations: () => null,
}))
vi.mock("./messagerie-styles", () => ({ MessagerieStyles: () => null }))
vi.mock("./IcomBrickHeader", () => ({
	IcomBrickHeader: ({ actions }: { actions?: ReactNode }) => (
		<div>{actions}</div>
	),
}))
vi.mock("../reseau-personnel/Avatar", () => ({ Avatar: () => null }))
vi.mock("./GroupeAvatar", () => ({ GroupeAvatar: () => null }))

import { IcomContactToolsProvider } from "./IcomContactActions"
import { MessagerieListView } from "./MessagerieListView"
import type { MessagerieSource, MessagerieThread } from "./messagerie-source"

const NAV = {
	openCompose: vi.fn(),
	openComposeGroupe: vi.fn(),
	openConversation: vi.fn(),
	back: vi.fn(),
}

function fil(
	id: string,
	nom: string | null,
	unread = 0,
	surcharge: Partial<MessagerieThread> = {},
): MessagerieThread {
	return {
		threadId: id,
		counterpart: {
			personId: `p-${id}`,
			displayName: nom,
			handle: nom === null ? null : nom.toLowerCase(),
			headline: null,
			avatarUrl: null,
			source: nom === null ? "unknown" : "published",
		},
		lastMessageAt: 1_700_000_000_000,
		lastMessageText: "Bonjour",
		lastMessageByMe: false,
		lastMessageKind: "text",
		lastMessageAttachmentCount: null,
		lastMessageId: null,
		lastMessageReadByCounterpart: null,
		lastMessageDeleted: false,
		unreadCount: unread,
		unreadCapped: false,
		...surcharge,
	} as unknown as MessagerieThread
}

/** Une source injectable — la vue en accepte une, on n'a rien à mocker. */
function sourceFactice(
	surcharge: {
		fils?: MessagerieThread[] | undefined
		threadsEnErreur?: boolean
		threadsEnAttente?: boolean
		hasMore?: boolean
		directs?: { total: number; capped: boolean }
		groupesNonLus?: { total: number; capped: boolean }
		refetch?: () => void
		loadMore?: () => void
		groupesDesactives?: boolean
	} = {},
): MessagerieSource {
	const liste = {
		data: surcharge.fils,
		isLoading: surcharge.threadsEnAttente ?? false,
		isError: surcharge.threadsEnErreur ?? false,
		error: surcharge.threadsEnErreur === true ? new Error("panne") : null,
		refetch: surcharge.refetch ?? vi.fn(),
		isFetching: false,
		enabled: true,
	}
	return {
		espace: "personnel",
		useMessageWrites: () => { throw new Error("La liste ne doit monter aucune écriture de conversation") },
		useThreads: () => liste,
		useThreadsPage: () => ({
			...liste,
			hasMore: surcharge.hasMore ?? false,
			loadMore: surcharge.loadMore ?? vi.fn(),
			isLoadingMore: false,
		}),
		useThreadById: () => ({
			data: undefined,
			isLoading: false,
			isError: false,
			enabled: false,
		}),
		useGroupThreads: () =>
			surcharge.groupesDesactives === true
				? {
						// Une query DÉSACTIVÉE (TanStack v5 : `pending` sans rien
						// demander) — rien n'est attendu.
						data: [],
						isLoading: true,
						isError: false,
						error: null,
						refetch: vi.fn(),
						isFetching: false,
						enabled: false,
					}
				: {
						data: [],
						isLoading: false,
						isError: false,
						error: null,
						refetch: vi.fn(),
						isFetching: false,
						enabled: true,
					},
		useUnreadTotals: () => ({
			directs: surcharge.directs ?? { total: 0, capped: false },
			groupes: surcharge.groupesNonLus ?? { total: 0, capped: false },
			total: surcharge.directs ?? { total: 0, capped: false },
			isLoading: false,
			isError: false,
			refetch: vi.fn(),
		}),
		supporteBrouillon: true,
		supporteGroupes: true,
		useStartCall: () => ({ appeler: vi.fn(), isPending: false }),
	}
}

afterEach(cleanup)

describe("MessagerieListView — la panne se dit, le vide ne la déguise pas", () => {
	it("une panne sans données rend le bandeau et Réessayer relance la lecture", () => {
		const refetch = vi.fn()
		renderWithEngine(
			<MessagerieListView
				variant="page"
				nav={NAV}
				unread={0}
				source={sourceFactice({ fils: [], threadsEnErreur: true, refetch })}
			/>,
		)

		expect(screen.getByText("Conversations indisponibles")).toBeTruthy()
		// Le mensonge d'avant : « Aucune conversation… » sur une boîte en panne.
		expect(screen.queryByText(/Aucune conversation pour le moment/)).toBeNull()
		fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
		expect(refetch).toHaveBeenCalledTimes(1)
	})

	it("une panne APRÈS des données conserve la liste et pose un bandeau", () => {
		renderWithEngine(
			<MessagerieListView
				variant="page"
				nav={NAV}
				unread={0}
				source={sourceFactice({
					fils: [fil("c1", "Awa Mba")],
					threadsEnErreur: true,
				})}
			/>,
		)

		expect(screen.getByText("Conversations partiellement à jour")).toBeTruthy()
		expect(screen.getByText("Awa Mba")).toBeTruthy()
	})

	it("la pastille porte le décompte du SERVEUR, pas la somme de la page", () => {
		// La page rendue ne porte AUCUN non-lu : additionner ses lignes
		// afficherait « rien à lire » sur une boîte qui en compte sept.
		renderWithEngine(
			<MessagerieListView
				variant="page"
				nav={NAV}
				unread={7}
				source={sourceFactice({
					fils: [fil("c1", "Awa Mba", 0)],
					directs: { total: 7, capped: false },
				})}
			/>,
		)

		expect(
			screen.getByRole("button", {
				name: "Conversations individuelles, 7 messages non lus",
			}),
		).toBeTruthy()
	})

	it("« Charger plus » n'apparaît que s'il reste des conversations", () => {
		const loadMore = vi.fn()
		const { rerender } = renderWithEngine(
			<MessagerieListView
				variant="page"
				nav={NAV}
				unread={0}
				source={sourceFactice({ fils: [fil("c1", "Awa Mba")], hasMore: false })}
			/>,
		)
		expect(screen.queryByText("Charger plus de conversations")).toBeNull()

		rerender(
			<MessagerieListView
				variant="page"
				nav={NAV}
				unread={0}
				source={sourceFactice({
					fils: [fil("c1", "Awa Mba")],
					hasMore: true,
					loadMore,
				})}
			/>,
		)
		fireEvent.click(screen.getByText("Charger plus de conversations"))
		expect(loadMore).toHaveBeenCalledTimes(1)
	})

	it("une recherche sans résultat AVOUE qu'elle n'a pas tout chargé", () => {
		const loadMore = vi.fn()
		renderWithEngine(
			<MessagerieListView
				variant="page"
				nav={NAV}
				unread={0}
				source={sourceFactice({
					fils: [fil("c1", "Awa Mba")],
					hasMore: true,
					loadMore,
				})}
			/>,
		)

		fireEvent.change(screen.getByLabelText("Rechercher une conversation"), {
			target: { value: "Ndong" },
		})
		expect(screen.getByText(/parmi celles déjà chargées/)).toBeTruthy()
		fireEvent.click(screen.getByText("Charger plus pour chercher"))
		expect(loadMore).toHaveBeenCalledTimes(1)
	})

	it("ouvrir une ligne ouvre la conversation de SON fil (clé du moteur)", () => {
		const nav = { ...NAV, openConversation: vi.fn() }
		renderWithEngine(
			<MessagerieListView
				variant="page"
				nav={nav}
				unread={0}
				source={sourceFactice({ fils: [fil("t42", "Awa Mba")] })}
			/>,
		)
		fireEvent.click(screen.getByText("Awa Mba"))
		expect(nav.openConversation).toHaveBeenCalledWith("chat:t42")
	})
})

describe("MessagerieListView — ce que dit une ligne", () => {
	it("un vocal se dit vocal, jamais « aucun message »", () => {
		renderWithEngine(
			<MessagerieListView
				variant="page"
				nav={NAV}
				unread={0}
				source={sourceFactice({
					fils: [
						fil("c1", "Awa Mba", 0, {
							lastMessageText: null,
							lastMessageKind: "voice",
							lastMessageAttachmentCount: 1,
						}),
					],
				})}
			/>,
		)
		expect(screen.getByText(/Message vocal/)).toBeTruthy()
		expect(screen.queryByText(/Aucun message pour l'instant/)).toBeNull()
	})

	it("un correspondant sans nom porte le libellé neutre", () => {
		renderWithEngine(
			<MessagerieListView
				variant="page"
				nav={NAV}
				unread={0}
				source={sourceFactice({ fils: [fil("c1", null)] })}
			/>,
		)
		expect(screen.getByText("Membre du réseau")).toBeTruthy()
	})
})

describe("MessagerieListView — la pastille de présence n'invente rien", () => {
	it("sans `presenceOf`, aucune ligne ne porte de pastille", () => {
		renderWithEngine(
			<MessagerieListView
				variant="window"
				nav={NAV}
				unread={0}
				source={sourceFactice({ fils: [fil("c1", "Awa Mba")] })}
			/>,
		)

		expect(screen.getByText("Awa Mba")).toBeTruthy()
		expect(screen.queryByText("— En ligne")).toBeNull()
	})

	it("l'état rendu accompagne le nom, en toutes lettres", () => {
		// Un point coloré ne dit rien à qui ne distingue pas les nuances : le
		// libellé voyage avec lui (`PresenceDot`).
		renderWithEngine(
			<MessagerieListView
				variant="window"
				nav={NAV}
				unread={0}
				source={sourceFactice({
					fils: [fil("c1", "Awa Mba"), fil("c2", "Paul Obame")],
				})}
				presenceOf={(personId) => (personId === "p-c1" ? "available" : null)}
			/>,
		)

		// Une présence non partagée rend `null` : pas de pastille, jamais une
		// pastille « hors ligne » inventée.
		expect(screen.getAllByText("— En ligne")).toHaveLength(1)
		expect(screen.queryByText("— Hors ligne")).toBeNull()
	})
})

describe("une liste désactivée n'attend rien", () => {
	it("des groupes désactivés ne rendent aucun squelette", () => {
		// La boîte est chargée et VIDE ; la liste des groupes n'est pas armée.
		// Avant IC-07, `{data: [], isLoading: false}` passait, mais rien ne
		// DISAIT que la liste n'était pas armée.
		renderWithEngine(
			<MessagerieListView
				variant="page"
				nav={NAV}
				unread={0}
				source={sourceFactice({ fils: [], groupesDesactives: true })}
			/>,
		)

		expect(screen.queryByText("Chargement…")).toBeNull()
		expect(screen.getByText(/Aucune conversation\. Utilisez/)).toBeTruthy()
	})
})

it("rend les deux raccourcis explicites et propose de chercher ou inviter depuis une boîte vide", () => {
  const nav = { ...NAV, openCompose: vi.fn(), openComposeGroupe: vi.fn() }
  renderWithEngine(
    <IcomContactToolsProvider value={{
      findMembers: origin => `/annuaire?depuis=${origin}`,
      inviteButton: <button type="button">Inviter un contact</button>,
      shareLink: vi.fn(),
    }}>
      <MessagerieListView variant="page" nav={nav} unread={0} source={sourceFactice({ fils: [] })} />
    </IcomContactToolsProvider>,
  )
  fireEvent.click(screen.getByText("Nouveau message"))
  fireEvent.click(screen.getByText("Nouveau groupe"))
  expect(nav.openCompose).toHaveBeenCalledTimes(1)
  expect(nav.openComposeGroupe).toHaveBeenCalledTimes(1)
  expect(screen.getByRole("link", { name: "Trouver des membres" }).getAttribute("href")).toBe("/annuaire?depuis=message")
  expect(screen.getByRole("button", { name: "Inviter un contact" })).toBeTruthy()
})
