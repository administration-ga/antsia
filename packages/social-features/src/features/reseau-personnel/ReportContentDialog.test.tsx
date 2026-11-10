// @vitest-environment jsdom
/**
 * P18b (A03, A07, A30) — le dialogue de signalement est une vraie modale :
 * focus initial sur le motif, reste de la page inerte, Échap qui ferme (sauf
 * pendant la transmission), focus rendu au déclencheur, refus redit DANS le
 * dialogue, précision nommée par son libellé visible.
 */
import { act, fireEvent, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { renderWithEngine } from "../../tests/engine-wrapper"
import { ReportContentDialog, type ReportReason } from "./ReportContentDialog"

function Harness({ onSubmit }: { onSubmit: (reason: ReportReason, note: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Ouvrir le signalement
      </button>
      {open ? <ReportContentDialog kind="publication" onClose={() => setOpen(false)} onSubmit={onSubmit} /> : null}
    </>
  )
}

function openDialog(onSubmit: (reason: ReportReason, note: string) => Promise<void> = () => Promise.resolve()) {
  renderWithEngine(<Harness onSubmit={onSubmit} />)
  const trigger = screen.getByRole("button", { name: "Ouvrir le signalement" })
  trigger.focus()
  fireEvent.click(trigger)
  return { trigger, dialog: screen.getByRole("dialog", { name: "Signaler cette publication" }) }
}

describe("ReportContentDialog (P18b, A03)", () => {
  it.each(["professionalProfile", "professionalCollaboration"] as const)("signale %s sans demander une précision absente du port", async kind => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderWithEngine(<ReportContentDialog kind={kind} allowNote={false} onClose={() => {}} onSubmit={onSubmit} />)
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.getByRole("dialog")).toHaveAccessibleName(kind === "professionalProfile" ? "Signaler ce profil professionnel" : "Signaler cette demande de collaboration")
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Transmettre" })) })
    expect(onSubmit).toHaveBeenCalledWith("harassment", "")
  })

  it.each(["editorialVersion", "editorialMedia"] as const)("signale %s sans demander de précision non transmise", async kind => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderWithEngine(<ReportContentDialog kind={kind} allowNote={false} onClose={() => {}} onSubmit={onSubmit} />)
    expect(screen.getByRole("dialog")).toHaveAccessibleName(kind === "editorialVersion" ? "Signaler cet article" : "Signaler ce média")
    expect(screen.queryByRole("textbox")).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Transmettre" })) })
    expect(onSubmit).toHaveBeenCalledWith("harassment", "")
  })

  it("porte le focus sur le motif, rend la page inerte, puis Échap ferme et rend le focus au déclencheur", () => {
    const { trigger, dialog } = openDialog()

    expect(dialog).toHaveAttribute("aria-modal", "true")
    expect(dialog).toHaveAccessibleDescription(/L’auteur ne connaît pas votre identité/)
    expect(document.activeElement).toBe(screen.getByRole("combobox", { name: /^Motif/ }))
    expect(trigger.closest("[inert]")).not.toBeNull()

    fireEvent.keyDown(document, { key: "Escape" })

    expect(screen.queryByRole("dialog")).toBeNull()
    expect(trigger.closest("[inert]")).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it("la précision facultative est nommée par son libellé visible (A30)", () => {
    openDialog()
    const note = screen.getByRole("textbox", { name: /^Précision facultative/ })
    expect(note).not.toHaveAttribute("aria-label")
  })

  it("un refus est redit dans le dialogue, qui reste ouvert pour un nouvel essai (A07)", async () => {
    const onSubmit = vi.fn(() => Promise.reject(new Error("transmission refusée")))
    openDialog(onSubmit)
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("")

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Transmettre" }))
    })

    expect(onSubmit).toHaveBeenCalledWith("harassment", "")
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("Le signalement n'a pas pu être transmis.")
  })

  it("Échap ne ferme pas le dialogue pendant la transmission, et un double envoi n'en fait qu'un", async () => {
    const onSubmit = vi.fn(() => new Promise<void>(() => {}))
    openDialog(onSubmit)

    await act(async () => {
      const form = screen.getByRole("dialog").querySelector("form")!
      fireEvent.submit(form)
      fireEvent.submit(form)
    })
    fireEvent.keyDown(document, { key: "Escape" })

    expect(onSubmit).toHaveBeenCalledOnce()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("une transmission réussie ferme le dialogue et rend le focus au déclencheur", async () => {
    const { trigger } = openDialog()
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Transmettre" }))
    })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})
