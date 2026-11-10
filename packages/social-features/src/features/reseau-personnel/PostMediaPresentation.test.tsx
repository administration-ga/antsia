// @vitest-environment jsdom
import type { PostMediaDto } from "@antsia/social-contracts/media"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import { createAppI18n } from "../../i18n"
import { PostMedia } from "./PostMedia"
import { frameRatioFor, intrinsicRatio } from "./post-media-frame"

const first: PostMediaDto = { kind: "image", mimeType: "image/jpeg", url: "https://media.example/first.jpg", withheld: null, altText: "Première image", width: 800, height: 1000 }
const second: PostMediaDto = { ...first, url: "https://media.example/second.jpg", altText: "Deuxième image" }

// La même surface sert aussi la carte publique : uniquement i18n, aucun
// NetworkProvider, aucun client Convex, aucun identifiant de stockage.
function renderMedia(media: readonly PostMediaDto[], presentation?: "media" | "classic", locale: "fr" | "en" = "fr") {
  const i18n = createAppI18n({ locale, appResources: { fr: {}, en: {} }, defaultNS: "social" })
  const surface = (items: readonly PostMediaDto[]) => (
    <I18nextProvider i18n={i18n}><PostMedia media={items} presentation={presentation} /></I18nextProvider>
  )
  const view = render(surface(media))
  return { ...view, i18n, replace: (items: readonly PostMediaDto[]) => view.rerender(surface(items)) }
}

describe("Médias P03", () => {
  it("borne les ratios sans utiliser de dimensions invalides", () => {
    expect(frameRatioFor("image", intrinsicRatio(400, 1000))).toBe(4 / 5)
    expect(frameRatioFor("image", intrinsicRatio(4000, 1000))).toBe(1.91)
    expect(frameRatioFor("video", intrinsicRatio(900, 1600))).toBe(9 / 16)
    expect(frameRatioFor("image", intrinsicRatio(0, 1000))).toBe(1)
    expect(frameRatioFor("image", intrinsicRatio(Number.NaN, 1000))).toBe(1)
  })

  it("garde la présentation classique sans opt-in, et ouvre une photo entière avec opt-in", async () => {
    const classic = renderMedia([first])
    expect(screen.queryByRole("button", { name: "Afficher l'image en plein écran" })).toBeNull()
    classic.unmount()

    const view = renderMedia([first], "media")
    expect(view.container.querySelector(".rpm-m-frame")).toHaveStyle({ aspectRatio: "0.8" })
    const opener = screen.getByRole("button", { name: /Afficher l'image en plein écran/ })
    opener.focus()
    fireEvent.click(opener)
    const viewer = await screen.findByRole("dialog", { name: "Image en plein écran" })
    expect(within(viewer).getByRole("img", { name: "Première image" })).toHaveAttribute("src", first.url)
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(opener).toHaveFocus()
  })

  it("parcourt la galerie au clavier et par défilement natif, puis la visionneuse sans changer le média entier", async () => {
    renderMedia([first, second], "media")
    const track = screen.getByRole("region", { name: "Photos de la publication, 2 images" })
    Object.defineProperty(track, "clientWidth", { configurable: true, value: 320 })
    Object.defineProperty(track, "scrollTo", { configurable: true, value: vi.fn(({ left }: ScrollToOptions) => { track.scrollLeft = left ?? 0 }) })

    fireEvent.keyDown(track, { key: "End" })
    expect(track.scrollLeft).toBe(320)
    expect(screen.getByRole("button", { name: "Afficher l'image 2 sur 2" })).toHaveAttribute("aria-current", "true")
    track.scrollLeft = 0
    fireEvent.scroll(track)
    expect(screen.getByRole("button", { name: "Afficher l'image 1 sur 2" })).toHaveAttribute("aria-current", "true")

    fireEvent.click(screen.getByRole("button", { name: /Afficher l'image 1 sur 2 en plein écran/ }))
    const viewer = await screen.findByRole("dialog", { name: "Image 1 sur 2 en plein écran" })
    fireEvent.keyDown(document, { key: "ArrowRight" })
    expect(within(viewer).getByRole("img", { name: "Deuxième image" })).toHaveAttribute("src", second.url)
    fireEvent.error(within(viewer).getByRole("img", { name: "Deuxième image" }))
    expect(within(viewer).getByText("Image indisponible")).toBeInTheDocument()
    fireEvent.keyDown(document, { key: "Home" })
    expect(within(viewer).getByRole("img", { name: "Première image" })).toBeInTheDocument()
  })

  it("ne délivre jamais une URL retenue et reprend un nouveau média après une erreur", () => {
    const view = renderMedia([{ ...first, withheld: "fileQuarantined" }], "media")
    expect(view.container.querySelector("img")).toBeNull()
    expect(screen.queryByRole("button", { name: /Afficher l'image en plein écran/ })).toBeNull()

    view.replace([first])
    fireEvent.error(screen.getByRole("img", { name: "Première image" }))
    expect(screen.getByText("Image indisponible")).toBeInTheDocument()
    view.replace([second])
    expect(screen.getByRole("img", { name: "Deuxième image" })).toHaveAttribute("src", second.url)
    expect(screen.queryByText("Image indisponible")).toBeNull()
  })

  it.each([
    ["media", "fr"], ["classic", "fr"], ["media", "en"], ["classic", "en"],
  ] as const)("dit « analyse impossible » sans clé brute ni média servi (%s, %s)", (presentation, locale) => {
    for (const kind of ["image", "video"] as const) {
      const view = renderMedia([{ ...first, kind, mimeType: kind === "video" ? "video/mp4" : first.mimeType, url: null, withheld: "fileScanUnavailable" }], presentation, locale)
      const message = view.i18n.t("errors:fileScanUnavailable")
      expect(message).not.toBe("fileScanUnavailable")
      expect(screen.getByText(message)).toBeInTheDocument()
      expect(screen.queryByText("fileScanUnavailable")).toBeNull()
      expect(view.container.querySelector("img, video, [src]")).toBeNull()
      view.unmount()
    }
  })

  it("ferme la visionneuse et remet l'index à zéro quand une galerie de même taille remplace la précédente", async () => {
    const view = renderMedia([first, second], "media")
    fireEvent.click(screen.getByRole("button", { name: "Afficher l'image 2 sur 2" }))
    fireEvent.click(screen.getByRole("button", { name: /Afficher l'image 2 sur 2 en plein écran/ }))
    await screen.findByRole("dialog")
    view.replace([{ ...first, url: "https://media.example/new-first.jpg" }, { ...second, url: "https://media.example/new-second.jpg" }])
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("button", { name: "Afficher l'image 1 sur 2" })).toHaveAttribute("aria-current", "true")
  })

  it("garde la vidéo manuelle et en ligne, et ne transmet pas son erreur à la suivante", () => {
    const video: PostMediaDto = { kind: "video", mimeType: "video/mp4", url: "https://media.example/first.mp4", withheld: null, width: 900, height: 1600 }
    const view = renderMedia([video], "media")
    let player = view.container.querySelector("video")!
    expect(player).toHaveAttribute("controls")
    expect(player).toHaveAttribute("playsinline")
    expect(player).toHaveAttribute("preload", "metadata")
    expect(player).not.toHaveAttribute("autoplay")
    fireEvent.error(player)
    expect(screen.getByText("Média indisponible")).toBeInTheDocument()
    view.replace([{ ...video, url: "https://media.example/next.mp4" }])
    player = view.container.querySelector("video")!
    expect(player).toHaveAttribute("src", "https://media.example/next.mp4")
  })
})
