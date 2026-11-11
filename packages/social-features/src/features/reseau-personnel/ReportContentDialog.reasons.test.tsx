// @vitest-environment jsdom
/**
 * UM-03 — les motifs du dialogue suivent la nature de l'objet : un poste propose
 * d'abord « Frais demandés au candidat » et « Usurpation d'une entreprise »
 * (le premier sélectionné), puis les motifs de tout objet ; aucune autre nature
 * ne les propose. Les deux libellés existent en français et en anglais.
 */
import type { Id } from "@antsia/api/engine"
import { reportReasonsFor } from "@antsia/social-domain/moderation"
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react"
import { getFunctionName } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import en from "../../i18n/locales/en/reseau.fil.json"
import fr from "../../i18n/locales/fr/reseau.fil.json"
import { renderWithEngine, TEST_NETWORK_ID } from "../../tests/engine-wrapper"

const mocks = vi.hoisted(() => ({
  report: vi.fn(async (): Promise<{ reportId: string; created: boolean; hidden: true }> => ({ reportId: "reports_1", created: true, hidden: true })),
}))

vi.mock("convex/react", () => ({
  useMutation: (ref: never) => {
    const name = getFunctionName(ref)
    if (name !== "modules/moderation/cases:report") throw new Error(`Écriture inattendue : ${name}`)
    return mocks.report
  },
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { ReportContentDialog } from "./ReportContentDialog"
import { ReportTargetDialog } from "./ReportTarget"

const JOB = { kind: "commerceJob", id: "commerceJobHeads_1" as Id<"commerceJobHeads"> } as const
const OFFER = { kind: "commerceOffer", id: "commerceCatalogHeads_1" as Id<"commerceCatalogHeads"> } as const

function optionValues(): string[] {
  return within(screen.getByRole("combobox", { name: /^Motif/ })).getAllByRole("option").map((option) => (option as HTMLOptionElement).value)
}

beforeEach(() => {
  mocks.report.mockReset()
  mocks.report.mockResolvedValue({ reportId: "reports_1", created: true, hidden: true })
})
afterEach(cleanup)

describe("UM-03 — motifs d'un poste", () => {
  it("le poste propose ses deux motifs en tête, le premier sélectionné, puis ceux de tout objet", async () => {
    renderWithEngine(<ReportTargetDialog target={JOB} onClose={() => {}} />)
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Signaler cette offre d’emploi")
    expect(optionValues()).toEqual([...reportReasonsFor("commerceJob")])
    expect(screen.getByRole("option", { name: "Frais demandés au candidat" })).toHaveProperty("selected", true)
    expect(screen.getByRole("option", { name: "Usurpation d'une entreprise" })).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Transmettre" }))
    })
    expect(mocks.report).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, target: JOB, reason: "job_fee_requested" })
  })

  it("le second motif du poste se transmet tel quel", async () => {
    renderWithEngine(<ReportTargetDialog target={JOB} onClose={() => {}} />)
    fireEvent.change(screen.getByRole("combobox", { name: /^Motif/ }), { target: { value: "job_impersonation" } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Transmettre" }))
    })
    expect(mocks.report).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, target: JOB, reason: "job_impersonation" })
  })

  it.each([
    ["l'offre", () => <ReportTargetDialog target={OFFER} onClose={() => {}} />],
    ["la publication", () => <ReportContentDialog kind="publication" onClose={() => {}} onSubmit={() => Promise.resolve()} />],
  ])("%s ne propose aucun motif d'emploi, harcèlement d'abord", (_label, render) => {
    renderWithEngine(render())
    const values = optionValues()
    expect(values).not.toContain("job_fee_requested")
    expect(values).not.toContain("job_impersonation")
    expect(values[0]).toBe("harassment")
    expect(values.at(-1)).toBe("other")
  })

  it("chaque motif proposé à un poste est libellé en français et en anglais", () => {
    for (const reason of reportReasonsFor("commerceJob")) {
      expect((fr.reportContentDialog.reasons as Record<string, string>)[reason], `fr : ${reason}`).toBeTruthy()
      expect((en.reportContentDialog.reasons as Record<string, string>)[reason], `en : ${reason}`).toBeTruthy()
    }
  })
})
