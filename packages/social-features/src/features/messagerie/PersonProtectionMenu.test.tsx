// @vitest-environment jsdom
/**
 * IC-03 — « Signaler ou bloquer » une personne depuis iCom : la feuille dit
 * l'ordre, chaque geste ouvre la boîte de sa brique commune (MC-01, PF-01), et
 * « Signaler d'abord » envoie le signalement AVANT de revenir au blocage.
 */
import type { Id } from "@antsia/api/engine"
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react"
import { getFunctionName } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderWithEngine, TEST_NETWORK_ID } from "../../tests/engine-wrapper"

const mocks = vi.hoisted(() => ({
	report: vi.fn(),
	block: vi.fn(),
	order: [] as string[],
	success: vi.fn(),
	error: vi.fn(),
}))

vi.mock("convex/react", async (importOriginal) => ({
	...(await importOriginal<typeof import("convex/react")>()),
	useMutation: (ref: never) => {
		const name = getFunctionName(ref)
		if (name === "modules/moderation/cases:report") return mocks.report
		if (name === "modules/graph/connections:blockPerson") return mocks.block
		if (name === "modules/graph/connections:unblockPerson") return vi.fn()
		throw new Error(`Mutation inattendue : ${name}`)
	},
}))
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }))

import { PersonProtectionMenu } from "./PersonProtectionMenu"

const PERSON = "persons_awa" as Id<"persons">
/** Un nom de personne : une donnée du test, pas un texte d'interface. */
const NAME = "Awa NDONG"

beforeEach(() => {
	mocks.order = []
	mocks.report.mockReset().mockImplementation(async () => {
		mocks.order.push("report")
		return { reportId: "reports_1", created: true, hidden: true }
	})
	mocks.block.mockReset().mockImplementation(async () => {
		mocks.order.push("block")
		return null
	})
	mocks.success.mockReset()
	mocks.error.mockReset()
})
afterEach(cleanup)

function mount(options: { canReport?: boolean; name?: string | null } = {}) {
	const onBlocked = vi.fn()
	renderWithEngine(
		<PersonProtectionMenu
			personId={PERSON}
			name={options.name === undefined ? NAME : options.name}
			canReport={options.canReport ?? true}
			triggerName={options.name ?? NAME}
			onBlocked={onBlocked}
		/>,
	)
	return { onBlocked }
}

function openSheet(trigger = `Signaler ou bloquer ${NAME}`, title = "Signaler ou bloquer") {
	fireEvent.click(screen.getByRole("button", { name: trigger }))
	return screen.getByRole("dialog", { name: title })
}

describe("PersonProtectionMenu — la feuille", () => {
	it("signaler PUIS bloquer, nommés, et l'ordre dit à l'écran", () => {
		mount()
		const sheet = openSheet()
		expect(within(sheet).getByText("Pour faire les deux, signalez d'abord : une fois bloquée, la personne ne peut plus être signalée.")).toBeTruthy()
		const entries = within(sheet).getAllByRole("button").filter((button) => button.textContent?.startsWith("Signaler ") || button.textContent?.startsWith("Bloquer "))
		expect(entries.map((button) => button.querySelector(".msg-row-name")?.textContent)).toEqual([`Signaler ${NAME}`, `Bloquer ${NAME}`])
	})

	it("sans profil publié : bloquer seul, sans phrase d'ordre ni « Signaler d'abord »", () => {
		mount({ canReport: false, name: null })
		// Ni le bouton ni la feuille ne promettent un signalement que le moteur refuserait.
		expect(screen.queryByRole("button", { name: `Signaler ou bloquer ${NAME}` })).toBeNull()
		const sheet = openSheet(`Bloquer ${NAME}`, "Bloquer")
		expect(within(sheet).queryByText(/signalez d'abord/)).toBeNull()
		expect(within(sheet).queryByText(/^Signaler/)).toBeNull()
		fireEvent.click(within(sheet).getByText("Bloquer cette personne"))
		const dialog = screen.getByRole("dialog", { name: "Bloquer cette personne ?" })
		expect(within(dialog).queryByRole("button", { name: "Signaler d'abord" })).toBeNull()
	})
})

describe("PersonProtectionMenu — les gestes", () => {
	it("« Signaler » envoie la cible `person` au moteur, puis plus rien ne reste ouvert", async () => {
		mount()
		fireEvent.click(within(openSheet()).getByText(`Signaler ${NAME}`))
		const dialog = screen.getByRole("dialog", { name: "Signaler ce profil" })
		await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Transmettre" })) })
		expect(mocks.report).toHaveBeenCalledExactlyOnceWith({ networkId: TEST_NETWORK_ID, target: { kind: "person", id: PERSON }, reason: "harassment" })
		expect(mocks.block).not.toHaveBeenCalled()
		expect(screen.queryByRole("dialog", { name: "Signaler ce profil" })).toBeNull()
		expect(screen.queryByRole("dialog", { name: `Bloquer ${NAME} ?` })).toBeNull()
	})

	it("« Bloquer » demande confirmation ; « Signaler d'abord » signale, revient au blocage, puis bloque — dans cet ordre", async () => {
		const { onBlocked } = mount()
		fireEvent.click(within(openSheet()).getByText(`Bloquer ${NAME}`))
		const confirmation = screen.getByRole("dialog", { name: `Bloquer ${NAME} ?` })
		expect(mocks.block).not.toHaveBeenCalled()

		fireEvent.click(within(confirmation).getByRole("button", { name: "Signaler d'abord" }))
		const report = screen.getByRole("dialog", { name: "Signaler ce profil" })
		await act(async () => { fireEvent.click(within(report).getByRole("button", { name: "Transmettre" })) })

		// Le signalement parti, la confirmation revient — sans proposer de signaler une seconde fois.
		const again = screen.getByRole("dialog", { name: `Bloquer ${NAME} ?` })
		expect(within(again).queryByRole("button", { name: "Signaler d'abord" })).toBeNull()
		await act(async () => { fireEvent.click(within(again).getByRole("button", { name: "Bloquer" })) })

		expect(mocks.order).toEqual(["report", "block"])
		expect(mocks.block).toHaveBeenCalledExactlyOnceWith({ networkId: TEST_NETWORK_ID, targetPersonId: PERSON })
		expect(mocks.success).toHaveBeenCalledWith(`Vous avez bloqué ${NAME}.`)
		expect(onBlocked).toHaveBeenCalledOnce()
		expect(screen.queryByRole("dialog", { name: `Bloquer ${NAME} ?` })).toBeNull()
	})

	it("un signalement abandonné ramène à la confirmation, qui le propose encore ; annuler ne bloque personne", () => {
		const { onBlocked } = mount()
		fireEvent.click(within(openSheet()).getByText(`Bloquer ${NAME}`))
		fireEvent.click(within(screen.getByRole("dialog", { name: `Bloquer ${NAME} ?` })).getByRole("button", { name: "Signaler d'abord" }))
		fireEvent.click(within(screen.getByRole("dialog", { name: "Signaler ce profil" })).getByRole("button", { name: "Annuler" }))
		const back = screen.getByRole("dialog", { name: `Bloquer ${NAME} ?` })
		expect(within(back).getByRole("button", { name: "Signaler d'abord" })).toBeTruthy()
		fireEvent.click(within(back).getByRole("button", { name: "Annuler" }))
		expect(screen.queryByRole("dialog", { name: `Bloquer ${NAME} ?` })).toBeNull()
		expect(mocks.report).not.toHaveBeenCalled()
		expect(mocks.block).not.toHaveBeenCalled()
		expect(onBlocked).not.toHaveBeenCalled()
	})
})
