// @vitest-environment jsdom
// U03 : scénarios comportementaux écrits, exécution centralisée par le coordinateur.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EngineTestWrapper } from "../../tests/engine-wrapper"

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

function choosePhoto(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]')!
  fireEvent.change(input, { target: { files: [new File(["jpeg"], "moment.jpg", { type: "image/jpeg" })] } })
}

beforeEach(() => {
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
    const view = render(<EngineTestWrapper><StoryCreateSheet open onClose={vi.fn()} /></EngineTestWrapper>)
    choosePhoto(view.container)
    const submit = screen.getByRole("button", { name: "Publier l'actu" })
    act(() => { fireEvent.click(submit); fireEvent.click(submit) })
    expect(mocks.generate).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Publication…" })).toHaveAttribute("aria-busy", "true")
    await act(async () => { pending.resolve("/guarded-upload"); await pending.promise })
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1))
  })

  it("après une réponse perdue, reprend la même clé et le même média sans nouveau dépôt", async () => {
    mocks.publish.mockRejectedValueOnce(new Error("response lost"))
    const view = render(<EngineTestWrapper><StoryCreateSheet open onClose={vi.fn()} /></EngineTestWrapper>)
    choosePhoto(view.container)
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
    const view = render(<EngineTestWrapper><StoryCreateSheet open onClose={vi.fn()} /></EngineTestWrapper>)
    choosePhoto(view.container)
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
    const form = (personId: string) => <EngineTestWrapper personId={personId as never}><StoryCreateSheet open onClose={close} onPublished={published} /></EngineTestWrapper>
    const view = render(form("persons_first"))
    choosePhoto(view.container)
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
