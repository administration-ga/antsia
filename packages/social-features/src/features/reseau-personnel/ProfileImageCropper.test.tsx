// @vitest-environment jsdom

/**
 * ProfileImageCropper — le recadreur du profil (lot PF-03) : nommé, décrit,
 * utilisable au clavier, aperçu = région envoyée, et ses états (chargement,
 * image illisible, image animée, refus dit par l'appelant).
 *
 * `jsdom` ne décode aucune image : le chargement est simulé en posant les
 * dimensions naturelles de l'`<img>` puis en émettant `load` — exactement ce
 * que lit le composant dans un navigateur.
 */
import { act, fireEvent, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderWithEngine } from "../../tests/engine-wrapper"
import { TEST_JPEG_BYTES } from "../../tests/image-runtime"
import type { ImageCrop } from "../media-upload"
import { ProfileImageCropper } from "./ProfileImageCropper"
import { PROFILE_IMAGE_FRAMES, cropPreviewStyle, cropRectFor, initialCropView, zoomCropViewTo } from "./profile-image-crop"

const createObjectURL = URL.createObjectURL
const revokeObjectURL = URL.revokeObjectURL

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:profil")
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = revokeObjectURL
})

/** `Intl` sépare le nombre et « % » par une espace insécable (fine en français) : on la compare comme une espace. */
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, " ")

function photo(name = "IMG_0001.jpg", type = "image/jpeg", bytes: Uint8Array = TEST_JPEG_BYTES): File {
  return new File([bytes as Uint8Array<ArrayBuffer>], name, { type })
}

/** Simule le décodage de l'aperçu : dimensions naturelles, puis `load`. */
async function loadPreview(width = 4032, height = 3024) {
  const image = document.querySelector<HTMLImageElement>('img[src="blob:profil"]')
  if (image === null) throw new Error("aperçu absent")
  Object.defineProperty(image, "naturalWidth", { configurable: true, value: width })
  Object.defineProperty(image, "naturalHeight", { configurable: true, value: height })
  await act(async () => {
    fireEvent.load(image)
    await Promise.resolve()
  })
  return image
}

function renderCropper(overrides: Partial<Omit<Parameters<typeof ProfileImageCropper>[0], "onCancel" | "onConfirm">> = {}) {
  const props = {
    file: photo(),
    kind: "avatar" as const,
    busy: false,
    error: null,
    ...overrides,
    onCancel: vi.fn<() => void>(),
    onConfirm: vi.fn<(crop: ImageCrop | null) => void>(),
  }
  renderWithEngine(<ProfileImageCropper {...props} />)
  return props
}

describe("ProfileImageCropper — accessible et fidèle", () => {
  it("un dialogue nommé ; un cadre focalisable, nommé, décrit par les gestes du clavier", async () => {
    renderCropper()
    const dialog = screen.getByRole("dialog", { name: "Recadrer votre photo" })
    expect(dialog.getAttribute("aria-modal")).toBe("true")
    const frame = screen.getByRole("application", { name: "Cadre de la photo, en cercle" })
    expect(frame.tabIndex).toBe(0)
    expect(frame.getAttribute("aria-roledescription")).toBe("recadreur")
    const description = document.getElementById(frame.getAttribute("aria-describedby") ?? "")
    expect(description?.textContent).toMatch(/flèches pour déplacer, \+ et − pour zoomer, 0 pour recentrer/)
    // Chargement : dit, et l'envoi attend.
    expect(screen.getByRole("status").textContent).toBe("Chargement de l'image…")
    expect((screen.getByRole("button", { name: "Enregistrer la photo" }) as HTMLButtonElement).disabled).toBe(true)
    await loadPreview()
    expect(screen.queryByText("Chargement de l'image…")).toBeNull()
    expect((screen.getByRole("button", { name: "Enregistrer la photo" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("l'aperçu montre exactement la région envoyée, au zoom 1 puis après « + »", async () => {
    const props = renderCropper()
    const image = await loadPreview()
    const source = { width: 4032, height: 3024 }
    const aspect = PROFILE_IMAGE_FRAMES.avatar.aspect
    const start = cropRectFor(source, aspect, initialCropView(source))
    expect(image.style.width).toBe(cropPreviewStyle(start).width)
    expect(image.style.left).toBe(cropPreviewStyle(start).left)

    const frame = screen.getByRole("application")
    fireEvent.keyDown(frame, { key: "+" })
    const zoomed = cropRectFor(source, aspect, zoomCropViewTo(source, aspect, initialCropView(source), 1.1))
    expect(image.style.width).toBe(cropPreviewStyle(zoomed).width)
    expect(image.style.top).toBe(cropPreviewStyle(zoomed).top)
    // Le zoom au clavier est annoncé.
    expect(screen.getByText((text) => plain(text) === "Zoom : 110 %")).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la photo" }))
    expect(props.onConfirm).toHaveBeenCalledWith(zoomed)
  })

  it("les flèches déplacent l'image, 0 recentre ; le curseur de zoom est nommé et dit sa valeur", async () => {
    const props = renderCropper({ kind: "cover" })
    await loadPreview()
    const frame = screen.getByRole("application", { name: "Cadre de la couverture, en bandeau" })
    const slider = screen.getByRole("slider", { name: "Zoom" })
    fireEvent.change(slider, { target: { value: "2" } })
    expect(plain(slider.getAttribute("aria-valuetext") ?? "")).toBe("200 %")
    fireEvent.keyDown(frame, { key: "ArrowRight" })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la couverture" }))
    const moved = props.onConfirm.mock.calls[0]?.[0] as { x: number; width: number; height: number }
    const source = { width: 4032, height: 3024 }
    const centred = cropRectFor(source, 3, zoomCropViewTo(source, 3, initialCropView(source), 2))
    // L'image va à droite : la région part à gauche de 5 % de sa largeur.
    expect(moved.x).toBeCloseTo(centred.x - 0.05 * centred.width, 6)
    expect(moved.width / moved.height).toBeCloseTo(3, 9)

    fireEvent.keyDown(frame, { key: "0" })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la couverture" }))
    expect(props.onConfirm).toHaveBeenLastCalledWith(cropRectFor(source, 3, initialCropView(source)))
  })

  it("une touche qui ne le concerne pas n'est pas retenue (la saisie et Entrée restent libres)", async () => {
    renderCropper()
    await loadPreview()
    expect(fireEvent.keyDown(screen.getByRole("application"), { key: "a" })).toBe(true)
    expect(fireEvent.keyDown(screen.getByRole("application"), { key: "Enter" })).toBe(true)
  })
})

describe("ProfileImageCropper — les états", () => {
  it("une image illisible est dite ; rien ne peut être envoyé", async () => {
    const props = renderCropper()
    const image = document.querySelector<HTMLImageElement>('img[src="blob:profil"]')
    await act(async () => {
      fireEvent.error(image!)
      await Promise.resolve()
    })
    expect(screen.getByRole("alert").textContent).toMatch(/n'a pas pu être lue : elle ne sera pas envoyée/)
    expect(screen.queryByRole("button", { name: "Enregistrer la photo" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    expect(props.onCancel).toHaveBeenCalledOnce()
    expect(props.onConfirm).not.toHaveBeenCalled()
  })

  it("une image animée part entière, sans recadrage, et le dit", async () => {
    const gif = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
    const props = renderCropper({ file: photo("anime.gif", "image/gif", gif) })
    await loadPreview(480, 270)
    expect(screen.getByText(/Image animée : elle sera envoyée entière, sans recadrage/)).toBeDefined()
    expect(screen.queryByRole("slider")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la photo" }))
    expect(props.onConfirm).toHaveBeenCalledWith(null)
  })

  it("pendant l'envoi : gestes et boutons figés, Échap sans effet ; un refus est annoncé", async () => {
    const props = renderCropper({ busy: true, error: "La préparation de « IMG_0001.jpg » a échoué : cette photo ne sera pas envoyée." })
    await loadPreview()
    expect((screen.getByRole("button", { name: "Préparation et envoi…" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Annuler" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(document, { key: "Escape" })
    expect(props.onCancel).not.toHaveBeenCalled()
    expect(screen.getByRole("alert").textContent).toContain("cette photo ne sera pas envoyée")
  })

  it("Échap annule quand rien ne court", async () => {
    const props = renderCropper()
    await loadPreview()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(props.onCancel).toHaveBeenCalledOnce()
  })

  it("l'URL locale de l'aperçu est révoquée à la fermeture", () => {
    renderWithEngine(<ProfileImageCropper file={photo()} kind="avatar" busy={false} error={null} onCancel={vi.fn()} onConfirm={vi.fn()} />).unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:profil")
  })
})
