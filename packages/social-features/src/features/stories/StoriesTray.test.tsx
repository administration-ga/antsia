// Test du moteur (sans équivalent au socle, qui ne montait aucun composant) : la barre de stories branchée sur `stories.stories.tray` — réseau courant et instant ARRONDI passés au serveur, plateau du pas précédent gardé pendant le réabonnement, libellés traduits, auteur sans nom.
// @vitest-environment jsdom

import { fireEvent, screen } from "@testing-library/react"
import { NetworkProvider } from "@antsia/api/network"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createAppI18n } from "../../i18n"
import { renderWithEngine, TEST_NETWORK_ID, TEST_PERSON_ID, TEST_ROUTES } from "../../tests/engine-wrapper"

type TrayArgs = { networkId: string; now: number } | "skip"
type TrayGroupFixture = {
	author: { personId: string; handle: string | null; displayName: string | null; headline: null; avatarUrl: string | null; source: "published" | "unknown" }
	storyCount: number
	unseenCount: number
	latestPublishedAt: number
	cover: { url: string; kind: "image" | "video" }
}

const mocks = vi.hoisted(() => ({
	calls: [] as TrayArgs[],
	/** La réponse du serveur, par instant demandé (`undefined` = en vol). */
	byInstant: new Map<number, { groups: unknown[]; truncated: boolean }>(),
}))

vi.mock("@antsia/api/engine", () => ({
	api: { modules: { stories: { stories: { tray: "tray" } } } },
}))

vi.mock("@antsia/api/hooks", () => ({
	useAuthenticatedConvexQuery: (_reference: string, args: TrayArgs) => {
		mocks.calls.push(args)
		return {
			data: args === "skip" ? undefined : mocks.byInstant.get(args.now),
			isError: false,
		}
	},
}))

import { StoriesTray } from "./StoriesTray"
import { STORY_QUERY_STEP_MS } from "./stories-tray"

const STEP = STORY_QUERY_STEP_MS
const BASE = 4_000 * STEP

function group(handle: string | null, overrides: Partial<TrayGroupFixture> = {}): TrayGroupFixture {
	return {
		author: {
			personId: `person-${handle ?? "anonyme"}`,
			handle,
			displayName: handle === null ? null : `Nom ${handle}`,
			headline: null,
			avatarUrl: null,
			source: handle === null ? "unknown" : "published",
		},
		storyCount: 1,
		unseenCount: 0,
		latestPublishedAt: BASE - 60 * 60_000,
		cover: { url: `${handle ?? "x"}.jpg`, kind: "image" },
		...overrides,
	}
}

function renderTray(now: number, onOpen = vi.fn(), onCreate = vi.fn()) {
	return renderWithEngine(
		<StoriesTray myHandle="moi" now={now} onOpen={onOpen} onCreate={onCreate} />,
	)
}

beforeEach(() => {
	mocks.calls = []
	mocks.byInstant = new Map()
})

describe("StoriesTray — branchement sur le plateau du moteur", () => {
	it("passe le réseau courant et l'instant ARRONDI au pas, jamais l'horloge brute", () => {
		mocks.byInstant.set(BASE, { groups: [], truncated: false })
		renderTray(BASE + 123_456)
		expect(mocks.calls.at(-1)).toEqual({ networkId: TEST_NETWORK_ID, now: BASE })
	})

	it("ne rend rien tant que le premier plateau n'est pas arrivé", () => {
		const { container } = renderTray(BASE)
		expect(container.querySelector(".st-tray")).toBeNull()
	})

	it("rend la tuile de création puis les vignettes, nommées pour un lecteur d'écran", () => {
		mocks.byInstant.set(BASE, {
			groups: [group("marie", { unseenCount: 1 }), group("moi", { storyCount: 2 })],
			truncated: false,
		})
		const onOpen = vi.fn()
		const onCreate = vi.fn()
		renderTray(BASE, onOpen, onCreate)

		const tiles = screen.getAllByRole("button")
		expect(tiles.map((tile) => tile.getAttribute("aria-label"))).toEqual([
			"Publier une actu",
			"Votre actu, 2 actus, il y a 1 h",
			"Actus de Nom marie, 1 actu, 1 non vue, il y a 1 h",
		])
		expect(screen.getByRole("group", { name: "Actus" })).toBeInTheDocument()
		expect(screen.getByText("Vous")).toBeInTheDocument()

		fireEvent.click(tiles[0]!)
		expect(onCreate).toHaveBeenCalledTimes(1)
		fireEvent.click(tiles[2]!)
		expect(onOpen).toHaveBeenCalledWith("marie")
	})

	it("nomme par le libellé neutre un auteur que le moteur ne nomme pas", () => {
		mocks.byInstant.set(BASE, { groups: [group(null)], truncated: false })
		renderTray(BASE)
		expect(screen.getByText("Membre du réseau")).toBeInTheDocument()
	})

	it("garde le plateau du pas précédent pendant que le pas suivant s'abonne", () => {
		mocks.byInstant.set(BASE, { groups: [group("marie")], truncated: false })
		const view = renderTray(BASE + 1_000)
		expect(screen.getByText("Nom marie")).toBeInTheDocument()

		// Le pas suivant : sa réponse est encore en vol — la rangée ne disparaît pas.
		view.rerender(<StoriesTray myHandle="moi" now={BASE + STEP + 1_000} onOpen={vi.fn()} onCreate={vi.fn()} />)
		expect(mocks.calls.at(-1)).toEqual({ networkId: TEST_NETWORK_ID, now: BASE + STEP })
		expect(screen.getByText("Nom marie")).toBeInTheDocument()

		// Puis il répond : c'est lui qui s'affiche.
		mocks.byInstant.set(BASE + STEP, { groups: [group("paul")], truncated: false })
		view.rerender(<StoriesTray myHandle="moi" now={BASE + STEP + 2_000} onOpen={vi.fn()} onCreate={vi.fn()} />)
		expect(screen.queryByText("Nom marie")).toBeNull()
		expect(screen.getByText("Nom paul")).toBeInTheDocument()
	})

	it("rend une vignette vidéo dans un élément vidéo muet", () => {
		mocks.byInstant.set(BASE, {
			groups: [group("marie", { cover: { url: "clip.mp4", kind: "video" } })],
			truncated: false,
		})
		const { container } = renderTray(BASE)
		const video = container.querySelector("video.st-card-media")
		expect(video).not.toBeNull()
		expect(video?.getAttribute("src")).toBe("clip.mp4#t=0.1")
	})

	it.each([
		{ locale: "fr" as const, label: "Actus", create: "Publier une actu", author: /^Actus de Nom marie/ },
		{ locale: "en" as const, label: "Stories", create: "Post a story", author: /^Stories by Nom marie/ },
	])("garde les séries lisibles sans geste de création ($locale)", ({ locale, label, create, author }) => {
		mocks.byInstant.set(BASE, { groups: [group("marie")], truncated: false })
		const onOpen = vi.fn()
		const onCreate = vi.fn()
		const i18n = createAppI18n({ locale, appResources: { fr: {}, en: {} }, defaultNS: "social" })
		renderWithEngine(
			<I18nextProvider i18n={i18n}>
				<StoriesTray myHandle="moi" now={BASE} canCreate={false} onOpen={onOpen} onCreate={onCreate} />
			</I18nextProvider>,
		)

		expect(screen.getByRole("group", { name: label })).toBeInTheDocument()
		expect(screen.queryByRole("button", { name: create })).not.toBeInTheDocument()
		fireEvent.click(screen.getByRole("button", { name: author }))
		expect(onOpen).toHaveBeenCalledExactlyOnceWith("marie")
		expect(onCreate).not.toHaveBeenCalled()
	})

	it("ne rend pas un bandeau vide lorsque la création est refusée", () => {
		mocks.byInstant.set(BASE, { groups: [], truncated: false })
		const { container } = renderWithEngine(
			<StoriesTray myHandle="moi" now={BASE} canCreate={false} onOpen={vi.fn()} onCreate={vi.fn()} />,
		)
		expect(container.querySelector(".st-tray")).toBeNull()
	})

	it.each(["personne", "réseau"] as const)("ne garde pas le plateau d'un autre lecteur au changement de %s", (scope) => {
		const scopedTray = (changed: boolean) => (
			<NetworkProvider
				networkId={changed && scope === "réseau" ? "networks_other" as typeof TEST_NETWORK_ID : TEST_NETWORK_ID}
				personId={changed && scope === "personne" ? "persons_other" as typeof TEST_PERSON_ID : TEST_PERSON_ID}
				slug="stories-scope"
				charte="antsia"
				routes={TEST_ROUTES}
			>
				<StoriesTray myHandle="moi" now={BASE} canCreate={false} onOpen={vi.fn()} onCreate={vi.fn()} />
			</NetworkProvider>
		)
		mocks.byInstant.set(BASE, { groups: [group("marie")], truncated: false })
		const view = renderWithEngine(scopedTray(false))
		expect(screen.getByText("Nom marie")).toBeInTheDocument()

		mocks.byInstant.clear()
		view.rerender(scopedTray(true))
		expect(screen.queryByText("Nom marie")).not.toBeInTheDocument()
		view.rerender(scopedTray(false))
		expect(screen.queryByText("Nom marie")).not.toBeInTheDocument()

		mocks.byInstant.set(BASE, { groups: [group("paul")], truncated: false })
		view.rerender(scopedTray(false))
		expect(screen.getByText("Nom paul")).toBeInTheDocument()
	})
})

describe("StoriesTray — médaillons déclarés par l'application (ADR-0027)", () => {
	function ringsTray(onOpen = vi.fn(), onCreate = vi.fn(), myAvatarUrl: string | null = null) {
		return (
			<NetworkProvider networkId={TEST_NETWORK_ID} personId={TEST_PERSON_ID} slug="stories-rings" charte="antsia" routes={TEST_ROUTES} storiesPresentation="rings">
				<StoriesTray myHandle="moi" myAvatarUrl={myAvatarUrl} now={BASE} onOpen={onOpen} onCreate={onCreate} />
			</NetworkProvider>
		)
	}

	it("par défaut, les cartes : rien ne change pour une application qui ne déclare rien", () => {
		mocks.byInstant.set(BASE, { groups: [group("marie")], truncated: false })
		renderTray(BASE)
		expect(screen.getByRole("group").getAttribute("data-presentation")).toBe("cards")
		expect(document.querySelector(".st-card")).not.toBeNull()
		expect(document.querySelector(".st-ring-tile")).toBeNull()
	})

	it("des médaillons ronds dans leur anneau, le prénom dessous ; « Vous » et son « + » en tête", () => {
		const onOpen = vi.fn()
		const onCreate = vi.fn()
		mocks.byInstant.set(BASE, {
			groups: [
				group("awa", { unseenCount: 1, author: { ...group("awa").author, displayName: "Awa NDONG" } }),
				group("jr", { author: { ...group("jr").author, displayName: "Jean-Rémy ÉLOÏSE" } }),
			],
			truncated: false,
		})
		renderWithEngine(ringsTray(onOpen, onCreate))
		const tray = screen.getByRole("group")
		expect(tray.getAttribute("data-presentation")).toBe("rings")
		expect(document.querySelector(".st-card")).toBeNull()
		expect([...tray.querySelectorAll(".st-ring-name")].map((name) => name.textContent)).toEqual(["Vous", "Awa", "Jean-Rémy"])
		expect(tray.querySelector(".st-tray-create .st-ring-plus")).not.toBeNull()
		// L'anneau dit toujours vu / pas vu : celui de la série à voir porte le dégradé.
		expect(tray.querySelectorAll(".esp-story-ring")).toHaveLength(1)
		expect(tray.querySelectorAll(".esp-story-ring-seen")).toHaveLength(1)
		// Mêmes gestes et mêmes noms accessibles que les cartes.
		fireEvent.click(screen.getByRole("button", { name: /Awa NDONG/ }))
		expect(onOpen).toHaveBeenCalledWith("awa")
		fireEvent.click(tray.querySelector<HTMLButtonElement>(".st-tray-create")!)
		expect(onCreate).toHaveBeenCalledTimes(1)
	})

	it("ma série en ligne rejoint « Vous » : une seule tuile, le médaillon l'ouvre, le « + » en crée une", () => {
		const onOpen = vi.fn()
		const onCreate = vi.fn()
		mocks.byInstant.set(BASE, {
			groups: [
				group("awa", { unseenCount: 1, author: { ...group("awa").author, displayName: "Awa NDONG" } }),
				group("moi", { author: { ...group("moi").author, displayName: "OKA Tech" } }),
			],
			truncated: false,
		})
		renderWithEngine(ringsTray(onOpen, onCreate))
		const tray = screen.getByRole("group")
		// « Vous » une seule fois, en tête.
		expect([...tray.querySelectorAll(".st-ring-name")].map((name) => name.textContent)).toEqual(["Vous", "Awa"])
		expect(tray.querySelector(".st-tray-create")).toBeNull()
		// Ma série dans le dégradé du thème, jamais l'anneau pâle.
		const own = tray.querySelector(".st-ring-own")!
		expect(own.querySelector(".esp-story-ring")).not.toBeNull()
		expect(tray.querySelector(".esp-story-ring-self")).toBeNull()
		expect(own.textContent).toContain("OT")
		// Deux boutons frères, jamais l'un dans l'autre.
		const open = screen.getByRole("button", { name: /Votre actu/ })
		const create = screen.getByRole("button", { name: "Publier une actu" })
		expect(open.contains(create)).toBe(false)
		fireEvent.click(open)
		expect(onOpen).toHaveBeenCalledWith("moi")
		fireEvent.click(create)
		expect(onCreate).toHaveBeenCalledTimes(1)
		expect(onOpen).toHaveBeenCalledTimes(1)
	})

	it("l'ordre suit l'état vu de chaque auteur", () => {
		const awa = group("awa", { unseenCount: 1, author: { ...group("awa").author, displayName: "Awa NDONG" } })
		const eloise = group("eloise", { author: { ...group("eloise").author, displayName: "Éloïse MBA" } })
		mocks.byInstant.set(BASE, { groups: [awa, eloise], truncated: false })
		const view = renderWithEngine(ringsTray())
		expect([...document.querySelectorAll(".st-ring-name")].map((name) => name.textContent)).toEqual(["Vous", "Awa", "Éloïse"])

		mocks.byInstant.set(BASE, { groups: [{ ...awa, unseenCount: 0 }, { ...eloise, unseenCount: 1 }], truncated: false })
		view.rerender(ringsTray())
		expect([...document.querySelectorAll(".st-ring-name")].map((name) => name.textContent)).toEqual(["Vous", "Éloïse", "Awa"])
		const seenAwa = screen.getByRole("button", { name: /Awa NDONG/ })
		expect(seenAwa.querySelector(".esp-story-ring-seen")).not.toBeNull()
		expect(screen.getByRole("button", { name: /Éloïse MBA/ }).querySelector(".esp-story-ring")).not.toBeNull()
	})

	it("« Vous » sans série garde sa photo valide, une silhouette en cas d'erreur et reprend une nouvelle URL", () => {
		mocks.byInstant.set(BASE, { groups: [], truncated: false })
		const view = renderWithEngine(ringsTray(vi.fn(), vi.fn(), "/my-portrait"))
		const create = screen.getByRole("button", { name: "Publier une actu" })
		expect(create.querySelector("img")).toHaveAttribute("src", "/my-portrait")
		expect(create.querySelector(".st-tray-disc svg")).toBeNull()
		expect(document.querySelector(".st-tray-ring")).toBeNull()

		fireEvent.error(create.querySelector("img")!)
		expect(create.querySelector("img")).toBeNull()
		expect(create.querySelector(".st-tray-disc svg")).not.toBeNull()
		view.rerender(ringsTray(vi.fn(), vi.fn(), "/new-portrait"))
		expect(create.querySelector("img")).toHaveAttribute("src", "/new-portrait")
		expect([...document.querySelectorAll(".st-ring-name")].map((name) => name.textContent)).toEqual(["Vous"])
	})

	it("les médaillons emploient le portrait publié et gardent une silhouette à un auteur sans nom", () => {
		mocks.byInstant.set(BASE, {
			groups: [
				group("awa", { author: { ...group("awa").author, displayName: "Awa NDONG", avatarUrl: "/awa-portrait" } }),
				group(null),
			],
			truncated: false,
		})
		renderWithEngine(ringsTray())
		const awa = screen.getByRole("button", { name: /Awa NDONG/ })
		expect(awa.querySelector("img")).toHaveAttribute("src", "/awa-portrait")
		const unknown = screen.getByRole("button", { name: /Membre du réseau/ })
		expect(unknown.querySelector("svg")).not.toBeNull()
	})

	it("sans droit de créer, ma série garde « Vous » sans « + »", () => {
		mocks.byInstant.set(BASE, { groups: [group("moi")], truncated: false })
		renderWithEngine(
			<NetworkProvider networkId={TEST_NETWORK_ID} personId={TEST_PERSON_ID} slug="stories-rings" charte="antsia" routes={TEST_ROUTES} storiesPresentation="rings">
				<StoriesTray myHandle="moi" now={BASE} onOpen={vi.fn()} onCreate={vi.fn()} canCreate={false} />
			</NetworkProvider>,
		)
		expect([...document.querySelectorAll(".st-ring-name")].map((name) => name.textContent)).toEqual(["Vous"])
		expect(document.querySelector(".st-ring-plus")).toBeNull()
	})

	it("sépare la cible de publication de sa pastille et du bouton de consultation, tous deux accessibles au clavier", () => {
		const onOpen = vi.fn()
		const onCreate = vi.fn()
		mocks.byInstant.set(BASE, { groups: [group("moi")], truncated: false })
		renderWithEngine(ringsTray(onOpen, onCreate))

		const open = screen.getByRole("button", { name: /Votre actu/ })
		const create = screen.getByRole("button", { name: "Publier une actu" })
		const own = document.querySelector(".st-ring-own")!
		const mark = create.querySelector("span.st-ring-plus")!
		expect(own.querySelectorAll("button")).toHaveLength(2)
		expect(own.querySelector("button button")).toBeNull()
		expect(create.parentElement).toBe(open.parentElement)
		expect(create).toHaveClass("st-ring-plus-button")
		expect(create).not.toHaveClass("st-ring-plus")
		expect(mark).toHaveAttribute("aria-hidden", "true")

		open.focus()
		expect(open).toHaveFocus()
		create.focus()
		expect(create).toHaveFocus()
		fireEvent.click(mark)
		expect(onCreate).toHaveBeenCalledTimes(1)
		expect(onOpen).not.toHaveBeenCalled()
		fireEvent.click(open)
		expect(onOpen).toHaveBeenCalledExactlyOnceWith("moi")
		expect(onCreate).toHaveBeenCalledTimes(1)
	})
})
