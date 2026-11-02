// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/mobile/PostComposerSheet.test.tsx @ ad2e7fdc2 — adaptations : feuille montée dans l'enveloppe du moteur (`renderWithEngine` : i18n française) ; les deux simulations de `@antsia/ui/overlay` réunies en une (la seconde écrasait la première : `ImmersiveOverlay` n'était plus simulé) ; texte de brouillon sans « note de service » ; les six cas du socle portés.
// @vitest-environment jsdom

/**
 * PostComposerSheet — fermer CONSERVE, abandonner DEMANDE (R-12).
 *
 * Trois choses se vérifient ici, et nulle part ailleurs :
 *  · rouvrir la feuille retrouve le brouillon — c'est ce que la fermeture
 *    détruisait avant que le brouillon ne quitte le composant ;
 *  · « Abandonner le brouillon » n'apparaît QUE s'il y a un brouillon, et se
 *    confirme EN PLACE — un `AlertDialog` imbriqué se rendrait sous la surface
 *    immersive, l'usager cliquerait dans le vide ;
 *  · la demande d'abandon ne survit pas à la fermeture.
 *
 * `ImmersiveOverlay` est simulé à l'IDENTIQUE de son contrat (`open=false` ⇒
 * `null`) : le portail vers `body` et `visualViewport` ne se testent pas ici,
 * mais la sémantique de démontage, elle, EST le sujet.
 */

import { cleanup, fireEvent, screen } from "@testing-library/react"
import type { ButtonHTMLAttributes, ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderWithEngine } from "../../tests/engine-wrapper"

const viewport = vi.hoisted(() => ({ mobile: true }))

vi.mock("@antsia/ui", () => ({
  Button: ({
    children,
    variant: _variant,
    size: _size,
    icon: _icon,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string
    size?: string
    icon?: string
  }) => <button {...props}>{children}</button>,
}))

vi.mock("@antsia/ui/overlay", () => ({
  ImmersiveOverlay: ({
    open,
    children,
  }: {
    open: boolean
    children: ReactNode
  }) => (open ? <div data-testid="overlay">{children}</div> : null),
  useIsReseauMobile: () => viewport.mobile,
}))

/**
 * Le composeur est remplacé par une sonde : ce test porte sur la FEUILLE (son
 * en-tête, ses gestes), pas sur le composeur, qui a le sien
 * (`PostComposer.test.tsx`). La sonde écrit dans le MÊME magasin.
 */
vi.mock("../../features/reseau-personnel/PostComposer", async () => {
  const { postDraftStore, usePostDraft } = await import("../../features/reseau-personnel/post-draft-store")
  return {
    PostComposer: () => {
      const draft = usePostDraft("feed", "sonde")
      // Nom de la sonde (donnée de test), lu par `getByLabelText`.
      const sondeLabel = "Composeur"
      return (
        <>
        <textarea
          aria-label={sondeLabel}
          value={draft.body}
          onChange={(event) => postDraftStore.setBody("feed", event.target.value)}
        />
        <input type="file" aria-label="Média du composeur" />
        </>
      )
    },
  }
})

import { postDraftStore } from "../../features/reseau-personnel/post-draft-store"
import { PostComposerSheet } from "./PostComposerSheet"

const render = renderWithEngine

beforeEach(() => {
  viewport.mobile = true
  postDraftStore.resetForTests()
  window.sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  postDraftStore.resetForTests()
})

describe("sélection de média pendant un changement de taille", () => {
  it.each([true, false])("conserve le champ de fichier et le focus depuis mobile=%s", (mobile) => {
    viewport.mobile = mobile
    const vue = render(<PostComposerSheet open onClose={() => undefined} />)
    const picker = screen.getByLabelText("Média du composeur") as HTMLInputElement
    const editor = screen.getByLabelText("Composeur")
    editor.focus()

    viewport.mobile = !mobile
    vue.rerender(<PostComposerSheet open onClose={() => undefined} />)

    // Le sélecteur natif conserve une référence vers CE nœud pendant son ouverture.
    expect(picker.isConnected).toBe(true)
    expect(screen.getByLabelText("Média du composeur")).toBe(picker)
    expect(document.activeElement).toBe(editor)
    const file = new File(["photo"], "photo.png", { type: "image/png" })
    fireEvent.change(picker, { target: { files: [file] } })
    expect(screen.getByLabelText("Média du composeur")).toHaveProperty("files", [file])

    viewport.mobile = mobile
    vue.rerender(<PostComposerSheet open onClose={() => undefined} />)
    expect(screen.getByLabelText("Média du composeur")).toBe(picker)
    expect(picker.files?.[0]).toBe(file)
  })
})

describe("fermer conserve le brouillon", () => {
  it("retrouve le texte à la réouverture", () => {
    const premier = render(<PostComposerSheet open onClose={() => undefined} />)
    fireEvent.change(screen.getByLabelText("Composeur"), {
      target: { value: "Compte rendu" },
    })
    // Fermer DÉMONTE l'enfant (contrat d'ImmersiveOverlay, inchangé).
    premier.rerender(<PostComposerSheet open={false} onClose={() => undefined} />)
    expect(screen.queryByTestId("overlay")).toBeNull()

    premier.rerender(<PostComposerSheet open onClose={() => undefined} />)
    expect(screen.getByDisplayValue("Compte rendu")).toBeTruthy()
  })
})

describe("« Abandonner le brouillon »", () => {
  it("n'est offert que s'il y a quelque chose à abandonner", () => {
    const vue = render(<PostComposerSheet open onClose={() => undefined} />)
    expect(screen.queryByRole("button", { name: "Abandonner le brouillon" })).toBeNull()

    fireEvent.change(screen.getByLabelText("Composeur"), {
      target: { value: "Un texte" },
    })
    expect(screen.getByRole("button", { name: "Abandonner le brouillon" })).toBeTruthy()
    vue.unmount()
  })

  it("se confirme EN PLACE, sans seconde surface", () => {
    render(<PostComposerSheet open onClose={() => undefined} />)
    fireEvent.change(screen.getByLabelText("Composeur"), {
      target: { value: "À jeter" },
    })

    fireEvent.click(screen.getByRole("button", { name: "Abandonner le brouillon" }))
    // Toujours UNE surface montée : la confirmation est dans l'en-tête.
    expect(screen.getAllByTestId("overlay")).toHaveLength(1)
    expect(screen.getByRole("status").textContent).toContain("Confirmez l'abandon")
    expect(screen.getByRole("button", { name: "Confirmer l'abandon" })).toBeTruthy()
    // Le brouillon est encore là tant qu'on n'a pas confirmé.
    expect(screen.getByDisplayValue("À jeter")).toBeTruthy()
  })

  it("revient en arrière sans rien perdre", () => {
    render(<PostComposerSheet open onClose={() => undefined} />)
    fireEvent.change(screen.getByLabelText("Composeur"), {
      target: { value: "Conservé" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Abandonner le brouillon" }))
    fireEvent.click(screen.getByRole("button", { name: "Revenir" }))

    expect(screen.getByDisplayValue("Conservé")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Abandonner le brouillon" })).toBeTruthy()
  })

  it("vide le brouillon ET referme la feuille une fois confirmé", () => {
    const onClose = vi.fn()
    const vue = render(<PostComposerSheet open onClose={onClose} />)
    fireEvent.change(screen.getByLabelText("Composeur"), {
      target: { value: "Adieu" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Abandonner le brouillon" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirmer l'abandon" }))

    expect(onClose).toHaveBeenCalledTimes(1)
    vue.rerender(<PostComposerSheet open onClose={onClose} />)
    expect(screen.getByLabelText("Composeur")).toHaveProperty("value", "")
    expect(screen.queryByRole("button", { name: "Abandonner le brouillon" })).toBeNull()
  })

  it("ne rouvre pas sur la confirmation après une fermeture", () => {
    const vue = render(<PostComposerSheet open onClose={() => undefined} />)
    fireEvent.change(screen.getByLabelText("Composeur"), {
      target: { value: "Repris plus tard" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Abandonner le brouillon" }))

    vue.rerender(<PostComposerSheet open={false} onClose={() => undefined} />)
    vue.rerender(<PostComposerSheet open onClose={() => undefined} />)

    expect(screen.queryByRole("button", { name: "Confirmer l'abandon" })).toBeNull()
    expect(screen.getByRole("button", { name: "Abandonner le brouillon" })).toBeTruthy()
  })
})
