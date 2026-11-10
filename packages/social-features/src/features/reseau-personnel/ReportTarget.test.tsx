// @vitest-environment jsdom
/**
 * MC-01 — la brique commune « Signaler depuis n'importe quel objet » : un titre
 * par nature en français et en anglais, l'appel au moteur avec le réseau courant
 * et la cible telle quelle, l'accusé dit par un toast (envoi neuf ou déjà
 * signalé), le refus redit dans la boîte qui reste ouverte, le bouton figé
 * après l'envoi.
 */
import type { Id } from "@antsia/api/engine"
import { act, cleanup, fireEvent, screen } from "@testing-library/react"
import { getFunctionName } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import en from "../../i18n/locales/en/reseau.fil.json"
import fr from "../../i18n/locales/fr/reseau.fil.json"
import { renderWithEngine, TEST_NETWORK_ID } from "../../tests/engine-wrapper"

const mocks = vi.hoisted(() => ({
  report: vi.fn(async (_args: unknown): Promise<{ reportId: string; created: boolean; hidden: true }> => ({ reportId: "reports_1", created: true, hidden: true })),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock("convex/react", () => ({
  useMutation: (ref: never) => {
    const name = getFunctionName(ref)
    if (name !== "modules/moderation/cases:report") throw new Error(`Écriture inattendue : ${name}`)
    return mocks.report
  },
}))
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }))

import { REPORT_DIALOG_KINDS, REPORT_TARGET_KINDS } from "./report-target"
import { ReportTargetButton, ReportTargetDialog } from "./ReportTarget"

const GROUP = { kind: "thematicGroup", id: "thematicGroups_1" as Id<"thematicGroups"> } as const
const MESSAGE = { kind: "personalMessage", id: "personalMessages_1" as Id<"personalMessages"> } as const

beforeEach(() => {
  mocks.report.mockReset()
  mocks.report.mockResolvedValue({ reportId: "reports_1", created: true, hidden: true })
  mocks.success.mockReset()
  mocks.error.mockReset()
})
afterEach(cleanup)

describe("report-target — les natures et leurs titres", () => {
  it("couvre les treize objets de la liste du plan, et titre chacun en français et en anglais", () => {
    expect(REPORT_TARGET_KINDS).toHaveLength(13)
    const titles = (catalog: { reportContentDialog: { title: Record<string, string> } }) => catalog.reportContentDialog.title
    for (const kind of REPORT_DIALOG_KINDS) {
      expect(titles(fr)[kind], `fr : ${kind}`).toMatch(/^Signaler /)
      expect(titles(en)[kind], `en : ${kind}`).toMatch(/^Report /)
    }
  })
})

describe("ReportTargetButton — signaler un objet en une ligne", () => {
  it("ouvre la boîte titrée par la nature, transmet la cible au moteur, dit l'accusé puis se fige", async () => {
    renderWithEngine(<ReportTargetButton target={GROUP} />)
    const button = screen.getByRole("button", { name: "Signaler" })
    expect(button).toHaveAttribute("aria-haspopup", "dialog")
    fireEvent.click(button)
    const dialog = screen.getByRole("dialog", { name: "Signaler ce groupe" })
    expect(dialog).toHaveAccessibleDescription(/accusé de réception, puis la décision/)
    // Le port polymorphe ne transporte que le motif : aucune précision demandée.
    expect(screen.queryByRole("textbox")).toBeNull()
    fireEvent.change(screen.getByRole("combobox", { name: /^Motif/ }), { target: { value: "hate" } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Transmettre" }))
    })
    expect(mocks.report).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, target: GROUP, reason: "hate" })
    expect(mocks.success).toHaveBeenCalledWith("Signalement transmis. Ce contenu est masqué pour vous ; l’accusé de réception arrive dans vos notifications.")
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("button", { name: "Signalé" })).toBeDisabled()
  })

  it("dit « déjà signalé » quand le moteur rejoue un dossier existant", async () => {
    mocks.report.mockResolvedValue({ reportId: "reports_1", created: false, hidden: true })
    const onReported = vi.fn()
    renderWithEngine(<ReportTargetDialog target={MESSAGE} onClose={() => {}} onReported={onReported} />)
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Signaler ce message")
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Transmettre" }))
    })
    expect(mocks.report).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, target: MESSAGE, reason: "harassment" })
    expect(mocks.success).toHaveBeenCalledWith("Vous aviez déjà signalé ce contenu. Son suivi est dans « Mes données et mes recours ».")
    expect(onReported).toHaveBeenCalledWith("already")
  })

  it("un refus du moteur se dit (toast et alerte dans la boîte), qui reste ouverte, sans accusé", async () => {
    mocks.report.mockRejectedValue(new Error("refus"))
    const onClose = vi.fn()
    renderWithEngine(<ReportTargetDialog target={GROUP} onClose={onClose} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Transmettre" }))
    })
    expect(mocks.error).toHaveBeenCalledWith("Le signalement n'a pas pu être transmis.")
    expect(mocks.success).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("Le signalement n'a pas pu être transmis.")
  })
})
