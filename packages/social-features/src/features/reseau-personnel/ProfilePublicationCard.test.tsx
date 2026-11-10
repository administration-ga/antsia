// @vitest-environment jsdom
import { jpegHasGpsMetadata, listImageMetadata } from "@antsia/social-domain/imageMetadata"
import type { MediaWithheld } from "@antsia/social-contracts/media"
import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { isPreparedImage } from "../media-upload"
import { renderWithEngine } from "../../tests/engine-wrapper"
import { TEST_JPEG_WITH_GPS_BYTES, TEST_PNG_BYTES, testPrepareImageWith, type FakeImageRuntimeOptions } from "../../tests/image-runtime"
import { ProfilePublicationCard } from "./ProfilePublicationCard"

const mocks = vi.hoisted(() => ({
  withheld: "fileScanUnavailable" as MediaWithheld | null,
  profileWithheld: null as MediaWithheld | null,
  success: vi.fn(),
  error: vi.fn(),
  place: vi.fn(),
}))

vi.mock("@antsia/api/engine", () => ({
  api: { modules: { people: {
    persons: { getMyPerson: "getMyPerson" },
    profile: { publishMyProfile: "publishMyProfile", withdrawMyProfile: "withdrawMyProfile", setMyProfilePrivacy: "setMyProfilePrivacy", setMyAvatar: "setMyAvatar", setMyCover: "setMyCover", generateProfileUploadUrl: "generateProfileUploadUrl" },
  } } },
}))
vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: () => ({ isLoading: false, isError: false, data: {
    published: true, private: false, handle: "asted", displayName: "Asted",
    avatar: { url: null, withheld: mocks.profileWithheld }, cover: { url: null, withheld: mocks.profileWithheld },
  } }),
}))
vi.mock("./use-profile-onboarding", () => ({ useProfileOnboardingAccount: () => ({}) }))
vi.mock("convex/react", () => ({
  useMutation: (reference: string) => reference === "generateProfileUploadUrl"
    ? vi.fn(async () => "https://upload.example/profile")
    : reference === "setMyAvatar" || reference === "setMyCover"
      ? mocks.place
      : vi.fn(async () => undefined),
}))
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }))

const createObjectURL = URL.createObjectURL
const revokeObjectURL = URL.revokeObjectURL

beforeEach(() => {
  vi.clearAllMocks()
  mocks.withheld = "fileScanUnavailable"
  mocks.profileWithheld = null
  mocks.place.mockImplementation(async () => ({ url: null, withheld: mocks.withheld }))
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ storageId: "storage_profile" }) })))
  URL.createObjectURL = vi.fn(() => "blob:profil")
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  vi.unstubAllGlobals()
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = revokeObjectURL
})

/** La photo de téléphone de l'essai : un JPEG réel porteur d'un bloc EXIF GPS (valeurs fictives). */
function gpsPhoto(name = "IMG_0001.jpg"): File {
  return new File([TEST_JPEG_WITH_GPS_BYTES as Uint8Array<ArrayBuffer>], name, { type: "image/jpeg" })
}

/** Rend la carte avec la préparation RÉELLE sur un décodeur et un canvas simulés (`jsdom` n'en a pas). */
function renderCard(runtime: FakeImageRuntimeOptions = {}) {
  const prepare = testPrepareImageWith({ width: 4032, height: 3024, ...runtime })
  const view = renderWithEngine(<ProfilePublicationCard prepareImage={prepare} />)
  return { view, prepare }
}

/** Choisit un fichier dans le sélecteur de la photo (0) ou de la couverture (1). */
function choose(view: ReturnType<typeof renderWithEngine>, file: File, inputIndex: 0 | 1 = 0) {
  const input = view.container.querySelectorAll<HTMLInputElement>('input[type="file"]')[inputIndex]!
  fireEvent.change(input, { target: { files: [file] } })
}

/** L'aperçu du recadreur se « décode » : dimensions naturelles, puis `load`. */
async function loadPreview(width = 4032, height = 3024) {
  const image = await waitFor(() => {
    const found = document.querySelector<HTMLImageElement>('img[src="blob:profil"]')
    if (found === null) throw new Error("aperçu absent")
    return found
  })
  Object.defineProperty(image, "naturalWidth", { configurable: true, value: width })
  Object.defineProperty(image, "naturalHeight", { configurable: true, value: height })
  await act(async () => {
    fireEvent.load(image)
    await Promise.resolve()
  })
}

/** Le blob réellement déposé à l'URL de dépôt. */
function postedBody(): File {
  const fetchMock = vi.mocked(fetch)
  expect(fetchMock).toHaveBeenCalledOnce()
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit
  return init.body as File
}

describe("analyse des images du profil", () => {
  it.each([[0, "Enregistrer la photo"], [1, "Enregistrer la couverture"]] as const)(
    "ne présente pas une analyse indisponible comme une image mise à jour (entrée %s)",
    async (inputIndex, confirm) => {
      const { view } = renderCard()
      choose(view, gpsPhoto(), inputIndex)
      await loadPreview()
      fireEvent.click(screen.getByRole("button", { name: confirm }))
      await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("L'analyse de sécurité n'a pas pu être terminée. Le fichier reste indisponible jusqu'à sa vérification."))
      expect(mocks.place).toHaveBeenCalledOnce()
      expect(mocks.success).not.toHaveBeenCalled()
      // Le recadreur s'est refermé une fois l'image posée.
      expect(screen.queryByRole("dialog")).toBeNull()
    },
  )

  it("distingue une analyse indisponible d'une photo ou couverture bloquée dans le profil", () => {
    mocks.profileWithheld = "fileScanUnavailable"
    renderCard()
    expect(screen.getAllByText("L'analyse de sécurité n'a pas pu être terminée. Le fichier reste indisponible jusqu'à sa vérification.")).toHaveLength(2)
    expect(screen.queryByText(/a été bloquée par l'analyse de sécurité/)).toBeNull()
  })
})

describe("PF-03 — la photo recadrée part sans position GPS, jamais l'original", () => {
  it("une photo GPS : le blob déposé est l'image préparée, carrée, à 1 024 px, sans aucune métadonnée", async () => {
    // Pire cas : l'encodeur RECOPIERAIT le bloc EXIF de la source.
    const { view, prepare } = renderCard({ output: { bytes: TEST_JPEG_WITH_GPS_BYTES, type: "image/jpeg" } })
    const original = gpsPhoto()
    expect(jpegHasGpsMetadata(TEST_JPEG_WITH_GPS_BYTES)).toBe(true)
    choose(view, original)
    expect(screen.getByRole("dialog", { name: "Recadrer votre photo" })).toBeDefined()
    // Rien n'est parti au choix : seul le geste d'envoi dépose.
    expect(fetch).not.toHaveBeenCalled()
    await loadPreview()
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la photo" }))
    await waitFor(() => expect(mocks.place).toHaveBeenCalledOnce())

    const body = postedBody()
    expect(body).not.toBe(original)
    expect(isPreparedImage(body)).toBe(true)
    const sent = new Uint8Array(await body.arrayBuffer())
    expect(jpegHasGpsMetadata(sent)).toBe(false)
    expect(listImageMetadata(sent, "image/jpeg")).toEqual([])
    // La région de l'aperçu (carré centré) est celle qui a été dessinée, réduite à 1 024 px.
    expect(prepare.runtime.draws).toEqual([[504, 0, 3024, 3024, 0, 0, 1024, 1024]])
    expect(mocks.place).toHaveBeenCalledWith({ storageId: "storage_profile", mimeType: "image/jpeg" })
  })

  it("la couverture : un bandeau 3:1 borné à 2 048 px, posée par setMyCover", async () => {
    mocks.withheld = null
    const { view, prepare } = renderCard()
    choose(view, gpsPhoto("couverture.jpg"), 1)
    await loadPreview()
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la couverture" }))
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Couverture mise à jour."))
    expect(prepare.runtime.canvases).toEqual([{ width: 2048, height: 683 }])
    expect(prepare.runtime.draws).toEqual([[0, 840, 4032, 1344, 0, 0, 2048, 683]])
  })

  it("un ré-encodage impossible refuse le fichier : rien n'est déposé, le refus est dit dans le recadreur", async () => {
    const { view } = renderCard({ output: null })
    choose(view, gpsPhoto())
    await loadPreview()
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la photo" }))
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("La préparation de « IMG_0001.jpg » a échoué : cette photo ne sera pas envoyée."),
    )
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.place).not.toHaveBeenCalled()
    // Le recadreur reste ouvert : on peut annuler ou choisir une autre image.
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("un canvas indisponible refuse aussi, sans jamais retomber sur l'original", async () => {
    const { view } = renderCard({ canvas: "absent" })
    choose(view, gpsPhoto())
    await loadPreview()
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la photo" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Ce navigateur ne peut pas préparer « IMG_0001.jpg »/))
    expect(fetch).not.toHaveBeenCalled()
  })

  it("un format refusé ne s'ouvre pas au recadrage ; une photo de 8 Mio, réduite à l'envoi, est acceptée", async () => {
    const { view } = renderCard()
    choose(view, new File(["gif"], "anime.gif", { type: "image/gif" }))
    expect(mocks.error).toHaveBeenCalledWith("Formats acceptés : JPEG, PNG ou WebP.")
    expect(screen.queryByRole("dialog")).toBeNull()
    // Au-delà de 5 Mio, la photo était refusée AVANT ; c'est désormais l'image préparée qui est jugée.
    const heavy = new File([new Uint8Array(8 * 1024 * 1024)], "lourde.jpg", { type: "image/jpeg" })
    choose(view, heavy)
    expect(screen.getByRole("dialog", { name: "Recadrer votre photo" })).toBeDefined()
  })

  it("un fichier trop lourd pour être préparé sur l'appareil est refusé au choix", () => {
    const { view } = renderCard()
    choose(view, new File([new Uint8Array(21 * 1024 * 1024)], "enorme.png", { type: "image/png" }))
    expect(mocks.error).toHaveBeenCalledWith("Ce fichier est vide ou dépasse la taille autorisée (20 Mo).")
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("annuler le recadrage n'envoie rien", async () => {
    const { view } = renderCard()
    choose(view, gpsPhoto())
    await loadPreview()
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.place).not.toHaveBeenCalled()
  })

  it("le zoom choisi au clavier est celui de l'image envoyée", async () => {
    const { view, prepare } = renderCard({ width: 1200, height: 1200 })
    choose(view, new File([TEST_PNG_BYTES as Uint8Array<ArrayBuffer>], "capture.png", { type: "image/png" }))
    await loadPreview(1200, 1200)
    const frame = screen.getByRole("application", { name: "Cadre de la photo, en cercle" })
    fireEvent.keyDown(frame, { key: "+" })
    fireEvent.keyDown(frame, { key: "+" })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la photo" }))
    await waitFor(() => expect(mocks.place).toHaveBeenCalledOnce())
    const [draw] = prepare.runtime.draws
    // Deux crans de 1,1 : la région fait 1 200 / 1,21 px, centrée, et sort sans agrandissement.
    expect(draw?.[2]).toBeCloseTo(1200 / 1.21, 6)
    expect(draw?.[0]).toBeCloseTo((1200 - 1200 / 1.21) / 2, 6)
    expect(mocks.place).toHaveBeenCalledWith({ storageId: "storage_profile", mimeType: "image/png" })
  })
})
