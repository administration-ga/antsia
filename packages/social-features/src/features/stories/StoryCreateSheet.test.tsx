// @vitest-environment jsdom
// U03 : scénarios comportementaux écrits, exécution centralisée par le coordinateur.
// SD-02 : la photo passe par la préparation (module `features/media-upload`, décodeur et canvas simulés) ; cas ajoutés : l'octet envoyé est celui du module, jamais l'original, son poids est annoncé, un refus est dit et rien ne part.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { listImageMetadata } from "@antsia/social-domain/imageMetadata"

import { EngineTestWrapper } from "../../tests/engine-wrapper"
import { TEST_JPEG_WITH_GPS_BYTES, testPrepareImage } from "../../tests/image-runtime"
import { isPreparedImage } from "../media-upload"

const mocks = vi.hoisted(() => ({
  generate: vi.fn<(args: unknown) => Promise<string>>(),
  publish: vi.fn<(args: unknown) => Promise<unknown>>(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock("@antsia/api/engine", () => ({ api: { modules: {
  stories: { stories: { publish: "publish" } },
  media: { media: { generateUploadUrl: "upload" } },
} } }))
vi.mock("convex/react", () => ({ useMutation: (ref: string) => ref === "publish" ? mocks.publish : mocks.generate }))
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }))
vi.mock("@antsia/ui/overlay", () => ({
  useIsReseauMobile: () => true,
  ImmersiveOverlay: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div>{children}</div> : null,
}))

import { StoryCreateSheet } from "./StoryCreateSheet"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

/** La photo choisie : un vrai JPEG qui porte un bloc GPS (valeurs fictives). */
function chosenPhoto(): File {
  return new File([TEST_JPEG_WITH_GPS_BYTES as Uint8Array<ArrayBuffer>], "moment.jpg", { type: "image/jpeg" })
}

function choosePhoto(container: HTMLElement, file: File = chosenPhoto()) {
  const input = container.querySelector('input[type="file"]')!
  fireEvent.change(input, { target: { files: [file] } })
}

/** Choisit la photo et attend la fin de sa préparation (poids annoncé). */
async function choosePreparedPhoto(container: HTMLElement) {
  choosePhoto(container)
  await screen.findByText(/^Photo prête à l'envoi/)
}

/** La préparation réelle du module, sur un décodeur et un canvas simulés. */
let prepareImage = testPrepareImage()

beforeEach(() => {
  prepareImage = testPrepareImage()
  mocks.generate.mockReset().mockResolvedValue("/guarded-upload")
  mocks.publish.mockReset().mockResolvedValue({ storyId: "story-fixture" })
  mocks.success.mockReset()
  mocks.error.mockReset()
  const BaseURL = globalThis.URL
  vi.stubGlobal("URL", class extends BaseURL {
    static override createObjectURL = vi.fn(() => "blob:story-fixture")
    static override revokeObjectURL = vi.fn()
  })
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ storageId: "storage-fixture" }) })))
})

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("StoryCreateSheet — admission d'une intention", () => {
  it("verrouille deux appuis dès le premier, avant le retour du téléversement", async () => {
    const pending = deferred<string>()
    mocks.generate.mockReturnValueOnce(pending.promise)
    const view = render(<EngineTestWrapper><StoryCreateSheet open onClose={vi.fn()} prepareImage={prepareImage} /></EngineTestWrapper>)
    await choosePreparedPhoto(view.container)
    const submit = screen.getByRole("button", { name: "Publier l'actu" })
    act(() => { fireEvent.click(submit); fireEvent.click(submit) })
    expect(mocks.generate).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Publication…" })).toHaveAttribute("aria-busy", "true")
    await act(async () => { pending.resolve("/guarded-upload"); await pending.promise })
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1))
  })

  it("après une réponse perdue, reprend la même clé et le même média sans nouveau dépôt", async () => {
    mocks.publish.mockRejectedValueOnce(new Error("response lost"))
    const view = render(<EngineTestWrapper><StoryCreateSheet open onClose={vi.fn()} prepareImage={prepareImage} /></EngineTestWrapper>)
    await choosePreparedPhoto(view.container)
    fireEvent.change(screen.getByLabelText("Légende (facultative)"), { target: { value: "Un moment" } })
    fireEvent.click(screen.getByRole("button", { name: "Publier l'actu" }))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledTimes(1))
    expect(screen.getByLabelText("Légende (facultative)")).toHaveValue("Un moment")
    fireEvent.click(screen.getByRole("button", { name: "Publier l'actu" }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(2))
    expect(mocks.publish.mock.calls[1]?.[0]).toEqual(mocks.publish.mock.calls[0]?.[0])
    expect(mocks.generate).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("changer la légende après un échec crée une autre intention", async () => {
    mocks.publish.mockRejectedValueOnce(new Error("response lost"))
    const view = render(<EngineTestWrapper><StoryCreateSheet open onClose={vi.fn()} prepareImage={prepareImage} /></EngineTestWrapper>)
    await choosePreparedPhoto(view.container)
    fireEvent.click(screen.getByRole("button", { name: "Publier l'actu" }))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByLabelText("Légende (facultative)"), { target: { value: "Une autre intention" } })
    fireEvent.click(screen.getByRole("button", { name: "Publier l'actu" }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(2))
    const first = mocks.publish.mock.calls[0]?.[0] as { idempotencyKey: string }
    const second = mocks.publish.mock.calls[1]?.[0] as { idempotencyKey: string; caption: string }
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey)
    expect(second.caption).toBe("Une autre intention")
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("un retour d'upload de l'ancien acteur ne publie rien dans le nouveau contexte", async () => {
    const pending = deferred<string>()
    mocks.generate.mockReturnValueOnce(pending.promise)
    const close = vi.fn(), published = vi.fn()
    const form = (personId: string) => <EngineTestWrapper personId={personId as never}><StoryCreateSheet open onClose={close} onPublished={published} prepareImage={prepareImage} /></EngineTestWrapper>
    const view = render(form("persons_first"))
    await choosePreparedPhoto(view.container)
    fireEvent.change(screen.getByLabelText("Légende (facultative)"), { target: { value: "Ancien brouillon" } })
    fireEvent.click(screen.getByRole("button", { name: "Publier l'actu" }))
    view.rerender(form("persons_second"))
    expect(screen.getByLabelText("Légende (facultative)")).toHaveValue("")
    await act(async () => { pending.resolve("/old-upload"); await pending.promise })
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.publish).not.toHaveBeenCalled()
    expect(published).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    expect(mocks.success).not.toHaveBeenCalled()
  })
})

describe("StoryCreateSheet — la photo part préparée, jamais telle qu'elle a été choisie (SD-02)", () => {
  it("envoie le fichier du module — ré-encodé, sans métadonnées — et le déclare tel quel", async () => {
    const view = render(<EngineTestWrapper><StoryCreateSheet open onClose={vi.fn()} prepareImage={prepareImage} /></EngineTestWrapper>)
    const original = chosenPhoto()
    choosePhoto(view.container, original)
    await screen.findByText(/^Photo prête à l'envoi/)
    fireEvent.click(screen.getByRole("button", { name: "Publier l'actu" }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1))

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    const sent = init.body as File
    expect(sent).not.toBe(original)
    expect(isPreparedImage(sent)).toBe(true)
    expect(listImageMetadata(new Uint8Array(await sent.arrayBuffer()), "image/jpeg")).toEqual([])
    // Le canvas a été réduit à 2 048 px de plus grand côté.
    expect(prepareImage.runtime.canvases).toEqual([{ width: 2048, height: 1536 }])
    expect((mocks.publish.mock.calls[0]?.[0] as { media: { mimeType: string; sizeBytes: number } }).media).toMatchObject({
      mimeType: "image/jpeg",
      sizeBytes: sent.size,
    })
  })

  it("annonce le poids d'origine et le poids envoyé avant l'envoi", async () => {
    const view = render(<EngineTestWrapper><StoryCreateSheet open onClose={vi.fn()} prepareImage={prepareImage} /></EngineTestWrapper>)
    choosePhoto(view.container)
    const notice = await screen.findByText(/^Photo prête à l'envoi/)
    expect(notice.textContent).toMatch(/ko → \d+[\s\u00a0\u202f]ko, sans ses informations cachées \(lieu, appareil\)\.$/)
    expect(notice).toHaveAttribute("role", "status")
  })

  it("un échec de préparation est dit, et rien n'est publiable ni envoyé", async () => {
    const failing = testPrepareImage({ canvas: "absent" })
    const view = render(<EngineTestWrapper><StoryCreateSheet open onClose={vi.fn()} prepareImage={failing} /></EngineTestWrapper>)
    choosePhoto(view.container)
    expect(await screen.findByText(/Ce navigateur ne peut pas préparer « moment\.jpg »/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Publier l'actu" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Publier l'actu" }))
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.publish).not.toHaveBeenCalled()
  })

  it("l'envoi refuse une image qui ne sort pas du module, même rendue « prête » par une autre préparation", async () => {
    const rogue = vi.fn(async (file: File) => ({ ok: true as const, file, width: 2, height: 2, originalBytes: file.size, preparedBytes: file.size }))
    const view = render(<EngineTestWrapper><StoryCreateSheet open onClose={vi.fn()} prepareImage={rogue} /></EngineTestWrapper>)
    choosePhoto(view.container)
    await screen.findByText(/^Photo prête à l'envoi/)
    fireEvent.click(screen.getByRole("button", { name: "Publier l'actu" }))
    expect(await screen.findByText(/« moment\.jpg » n'est pas passée par la préparation des photos/)).toBeTruthy()
    expect(mocks.generate).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.publish).not.toHaveBeenCalled()
  })

  it("sans injection, la préparation par défaut refuse là où le navigateur ne sait pas décoder (jsdom) : l'original ne part pas", async () => {
    const view = render(<EngineTestWrapper><StoryCreateSheet open onClose={vi.fn()} /></EngineTestWrapper>)
    choosePhoto(view.container)
    expect(await screen.findByText(/« moment\.jpg » n'a pas pu être lue/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Publier l'actu" })).toBeDisabled()
    expect(fetch).not.toHaveBeenCalled()
  })
})
