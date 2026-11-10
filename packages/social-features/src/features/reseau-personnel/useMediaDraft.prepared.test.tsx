// @vitest-environment jsdom

/**
 * useMediaDraft — UNE IMAGE BRUTE NE PASSE PAS (lot FP-01).
 *
 * Le brouillon de médias est le seul chemin d'envoi des photos de publication
 * et d'album : une image qui ne sort pas du module de préparation
 * (`features/media-upload`) y est refusée à l'ajout, et l'envoi la refuse
 * encore si elle y est entrée par un autre chemin (magasin écrit directement).
 */
import { act, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EngineTestWrapper, TEST_PERSON_ID } from "../../tests/engine-wrapper"
import { testPrepareImage } from "../../tests/image-runtime"
import { postDraftKey } from "./post-draft"
import { configurePostDraftStorage, postDraftStore } from "./post-draft-store"
import { useMediaDraft } from "./useMediaDraft"

const FEED = postDraftKey({ kind: "feed" })

function wrapper({ children }: { children: ReactNode }) {
  return <EngineTestWrapper>{children}</EngineTestWrapper>
}

function raw(name: string, type = "image/png"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type })
}

beforeEach(() => {
  postDraftStore.resetForTests()
  window.sessionStorage.clear()
  vi.stubGlobal("URL", { createObjectURL: (file: File) => `blob:${file.name}`, revokeObjectURL: () => undefined })
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ storageId: "storage-1" }) })))
})

afterEach(() => {
  vi.unstubAllGlobals()
  postDraftStore.resetForTests()
})

describe("useMediaDraft — l'ajout refuse une image qui ne sort pas du module de préparation", () => {
  it("une image brute est refusée et nommée ; une image préparée entre", async () => {
    const { result } = renderHook(() => useMediaDraft(), { wrapper })
    act(() => result.current.add([raw("brute.png")]))
    expect(result.current.items).toHaveLength(0)
    expect(result.current.rejection).toBe("« brute.png » n'est pas passée par la préparation des photos : elle ne sera pas envoyée.")

    const prepared = await testPrepareImage()(raw("propre.png"))
    if (!prepared.ok) throw new Error("préparation attendue")
    act(() => result.current.add([prepared.file]))
    expect(result.current.items.map((item) => item.fileName)).toEqual(["propre.png"])
    expect(result.current.rejection).toBeNull()
  })

  it("une vidéo n'est pas concernée", () => {
    const { result } = renderHook(() => useMediaDraft(), { wrapper })
    act(() => result.current.add([raw("clip.mp4", "video/mp4")]))
    expect(result.current.items.map((item) => item.kind)).toEqual(["video"])
  })
})

describe("useMediaDraft — l'envoi refuse une image brute, quel que soit son chemin d'entrée", () => {
  it("une image écrite directement au magasin n'est pas téléversée : refus nommé, rien ne part", async () => {
    configurePostDraftStorage("antsia:test:")
    postDraftStore.setScope(TEST_PERSON_ID)
    postDraftStore.addMedia(FEED, [
      {
        meta: { localId: "brute", kind: "image", altText: "", fileName: "brute.png", mimeType: "image/png", sizeBytes: 3, upload: { status: "pending" } },
        file: raw("brute.png"),
        previewUrl: "blob:brute",
      },
    ])
    const generate = vi.fn(async () => "adresse-de-depot")
    const { result } = renderHook(() => useMediaDraft({ kind: "feed" }), { wrapper })
    expect(result.current.items).toHaveLength(1)

    let failure: unknown = null
    await act(async () => {
      await result.current.upload(generate).catch((error: unknown) => {
        failure = error
      })
    })

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe("« brute.png » n'est pas passée par la préparation des photos : elle ne sera pas envoyée.")
    expect(generate).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(result.current.items[0]?.upload.status).toBe("failed")
  })
})
