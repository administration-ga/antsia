// @vitest-environment jsdom
/**
 * PF-01 — la brique commune du blocage : conséquences dites avant le geste, un
 * seul envoi, refus du moteur dit sans sa trace, suite laissée à la surface.
 */
import type { Id } from "@antsia/api/engine"
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react"
import { getFunctionName } from "convex/server"
import { ConvexError } from "convex/values"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createAppI18n } from "../../i18n"
import { renderWithEngine, TEST_NETWORK_ID } from "../../tests/engine-wrapper"

const mocks = vi.hoisted(() => ({
  block: vi.fn(),
  unblock: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock("convex/react", () => ({
  useMutation: (ref: never) => {
    const name = getFunctionName(ref)
    if (name === "modules/graph/connections:blockPerson") return mocks.block
    if (name === "modules/graph/connections:unblockPerson") return mocks.unblock
    throw new Error(`Mutation inattendue : ${name}`)
  },
}))
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }))

import { BlockPersonDialog } from "./BlockPersonDialog"
import { visibilityAction } from "./profile-visibility-copy"

const t = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "reseau" }).getFixedT("fr")
const TARGET = "persons_awa" as Id<"persons">

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((yes) => { resolve = yes })
  return { promise, resolve }
}

function show(mode: "block" | "unblock" = "block", name: string | null = "Awa NDONG") {
  const onClose = vi.fn()
  const onDone = vi.fn()
  renderWithEngine(<BlockPersonDialog mode={mode} targetPersonId={TARGET} name={name} onClose={onClose} onDone={onDone} />)
  return { onClose, onDone, dialog: screen.getByRole("dialog") }
}

beforeEach(() => {
  mocks.block.mockReset().mockResolvedValue(null)
  mocks.unblock.mockReset().mockResolvedValue(null)
  mocks.success.mockReset()
  mocks.error.mockReset()
})
afterEach(cleanup)

describe("BlockPersonDialog — bloquer", () => {
  it("dit la conséquence, la réversibilité et où lever le blocage AVANT le geste", () => {
    const { dialog } = show()
    const action = visibilityAction("bloquer", t)
    expect(dialog).toHaveAttribute("aria-modal", "true")
    expect(dialog).toHaveAccessibleName("Bloquer Awa NDONG ?")
    expect(dialog).toHaveAccessibleDescription(action.consequence)
    expect(within(dialog).getByText(action.reversibilite)).toBeTruthy()
    expect(within(dialog).getByText(t("reseau:personBlock.listHint"))).toBeTruthy()
    expect(mocks.block).not.toHaveBeenCalled()
  })

  it("un seul envoi au moteur, puis toast, suite de la surface et fermeture", async () => {
    const pending = deferred()
    mocks.block.mockReturnValue(pending.promise)
    const { onClose, onDone } = show()
    const confirm = screen.getByRole("button", { name: "Bloquer" })
    act(() => { confirm.click(); confirm.click() })
    expect(mocks.block).toHaveBeenCalledExactlyOnceWith({ networkId: TEST_NETWORK_ID, targetPersonId: TARGET })
    expect(confirm).toBeDisabled()
    expect(confirm).toHaveAttribute("aria-busy", "true")
    // Échap pendant l'envoi ne ferme rien : le geste est en cours.
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onClose).not.toHaveBeenCalled()
    await act(async () => { pending.resolve(); await pending.promise })
    expect(mocks.success).toHaveBeenCalledWith("Vous avez bloqué Awa NDONG.")
    expect(onDone).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("un refus du moteur se dit par son code, jamais par sa trace ; la boîte reste ouverte pour réessayer", async () => {
    mocks.block.mockRejectedValueOnce(new ConvexError({ code: "rateLimited", message: "TRACE_PRIVEE" }))
    const { onClose, onDone } = show()
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Bloquer" })) })
    expect(mocks.error).toHaveBeenCalledTimes(1)
    expect(mocks.error.mock.calls[0]![0]).toBe(t("errors:rateLimited"))
    expect(mocks.error.mock.calls[0]![0]).not.toContain("TRACE_PRIVEE")
    expect(onClose).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Bloquer" })).not.toBeDisabled()
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Bloquer" })) })
    expect(mocks.block).toHaveBeenCalledTimes(2)
    expect(onDone).toHaveBeenCalledOnce()
  })

  it("la surface démontée pendant l'envoi (fiche refusée, publication retirée) : le succès se dit et la suite a lieu", async () => {
    const pending = deferred()
    mocks.block.mockReturnValue(pending.promise)
    const onClose = vi.fn()
    const onDone = vi.fn()
    const view = renderWithEngine(<BlockPersonDialog mode="block" targetPersonId={TARGET} name="Awa NDONG" onClose={onClose} onDone={onDone} />)
    fireEvent.click(screen.getByRole("button", { name: "Bloquer" }))
    view.unmount()
    await act(async () => { pending.resolve(); await pending.promise })
    expect(mocks.success).toHaveBeenCalledWith("Vous avez bloqué Awa NDONG.")
    expect(onDone).toHaveBeenCalledOnce()
  })

  it("une panne inattendue reste générique", async () => {
    mocks.block.mockRejectedValueOnce(new Error("PANNE_PRIVEE"))
    show()
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Bloquer" })) })
    expect(mocks.error).toHaveBeenCalledWith(t("reseau:personBlock.blockFailed"))
  })

  it.each(["cancel", "escape"] as const)("la fermeture (%s) ne bloque personne", (method) => {
    const { onClose } = show()
    if (method === "escape") fireEvent.keyDown(document, { key: "Escape" })
    else fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(mocks.block).not.toHaveBeenCalled()
  })

  it("sans nom connu, dit « cette personne »", () => {
    const { dialog } = show("block", null)
    expect(dialog).toHaveAccessibleName("Bloquer cette personne ?")
  })
})

describe("BlockPersonDialog — débloquer", () => {
  it("dit que rien n'est rétabli et appelle le seul déblocage", async () => {
    const { dialog, onClose } = show("unblock", "@awa")
    expect(dialog).toHaveAccessibleName("Débloquer @awa ?")
    expect(dialog).toHaveAccessibleDescription(t("reseau:peoplePanel.blocks.confirmBody"))
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Débloquer" })) })
    expect(mocks.unblock).toHaveBeenCalledExactlyOnceWith({ networkId: TEST_NETWORK_ID, targetPersonId: TARGET })
    expect(mocks.block).not.toHaveBeenCalled()
    expect(mocks.success).toHaveBeenCalledWith("Blocage retiré.")
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe("BlockPersonDialog — signaler d'abord (IC-03)", () => {
  it("la surface qui sait aussi signaler : la boîte dit l'ordre et propose « Signaler d'abord », sans rien bloquer", () => {
    const onReportFirst = vi.fn()
    const onClose = vi.fn()
    renderWithEngine(<BlockPersonDialog mode="block" targetPersonId={TARGET} name="Awa NDONG" onClose={onClose} onReportFirst={onReportFirst} />)
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByText(t("reseau:personBlock.reportFirstHint"))).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("button", { name: "Signaler d'abord" }))
    expect(onReportFirst).toHaveBeenCalledOnce()
    expect(mocks.block).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it("sans `onReportFirst` (fiche, publication) et au déblocage, rien de plus n'est dit", () => {
    const first = show()
    expect(within(first.dialog).queryByText(t("reseau:personBlock.reportFirstHint"))).toBeNull()
    expect(within(first.dialog).queryByRole("button", { name: "Signaler d'abord" })).toBeNull()
    cleanup()
    renderWithEngine(<BlockPersonDialog mode="unblock" targetPersonId={TARGET} name="Awa NDONG" onClose={vi.fn()} onReportFirst={vi.fn()} />)
    expect(screen.queryByRole("button", { name: "Signaler d'abord" })).toBeNull()
  })
})
