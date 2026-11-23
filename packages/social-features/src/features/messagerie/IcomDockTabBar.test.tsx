// @vitest-environment jsdom
/**
 * CH-817 — la barre des briques de la carte iCom (bureau) ne montre iAppel que si l'application
 * propose des appels (`callsAvailable`, déclaré au `NetworkProvider`) ; antsia.ga, qui ne déclare
 * rien, garde ses quatre briques.
 */
import { fireEvent, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { EngineRoutes } from "@antsia/api/network"

import { renderWithEngine, TEST_ROUTES } from "../../tests/engine-wrapper"
import { IcomDockTabBar } from "./IcomDockTabBar"

const BADGE = { badge: "3", label: "3 messages vocaux non écoutés" }
/** La navigation par destinations n'est retenue que si l'application sert ses deux destinations propres. */
const DESTINATION_ROUTES: EngineRoutes = { ...TEST_ROUTES, discover: () => "/explorer", me: () => "/moi" }

function tabNames(): string[] {
	return within(screen.getByRole("tablist", { name: "iCom" })).getAllByRole("tab").map((tab) => tab.textContent ?? "")
}

describe("IcomDockTabBar", () => {
	it("appels proposés (déclaration absente, comme antsia.ga) : les quatre briques, inchangées", () => {
		renderWithEngine(<IcomDockTabBar activeTab="ichat" voicemailBadge={null} onSelect={vi.fn()} />)
		expect(tabNames()).toEqual(["iChat", "Statuts", "iAppel", "Relations"])
		expect(screen.getByRole("tab", { name: /iChat/ }).getAttribute("aria-selected")).toBe("true")
	})

	it("appels proposés : iAppel porte la pastille des messages vocaux, avec sa phrase", () => {
		renderWithEngine(<IcomDockTabBar activeTab="iappel" voicemailBadge={BADGE} onSelect={vi.fn()} />, { callsAvailable: true })
		const appels = screen.getByRole("tab", { name: /iAppel.*3 messages vocaux non écoutés/ })
		expect(appels.querySelector(".icom-tab-badge")?.textContent).toBe("3")
		expect(appels.getAttribute("aria-selected")).toBe("true")
	})

	it("appels fermés : iAppel n'est pas une brique, sa pastille n'apparaît nulle part", () => {
		renderWithEngine(<IcomDockTabBar activeTab="ichat" voicemailBadge={BADGE} onSelect={vi.fn()} />, { callsAvailable: false })
		expect(tabNames()).toEqual(["iChat", "Statuts", "Relations"])
		expect(screen.queryByRole("tab", { name: /iAppel/ })).toBeNull()
		expect(screen.queryByText("3 messages vocaux non écoutés")).toBeNull()
	})

	it("appels fermés sous destinations : ni Statuts ni Appels, chaque brique porte le nom de sa vue", () => {
		renderWithEngine(<IcomDockTabBar activeTab="ichat" voicemailBadge={null} onSelect={vi.fn()} />, { callsAvailable: false, navigation: "destinations", routes: DESTINATION_ROUTES })
		expect(tabNames()).toEqual(["Conversations", "Contacts"])
	})

	it("le choix d'une brique est rendu à la carte, qui l'ouvre", () => {
		const onSelect = vi.fn()
		renderWithEngine(<IcomDockTabBar activeTab="ichat" voicemailBadge={null} onSelect={onSelect} />, { callsAvailable: false })
		fireEvent.click(screen.getByRole("tab", { name: /Relations/ }))
		expect(onSelect).toHaveBeenCalledWith("icontact")
	})
})
