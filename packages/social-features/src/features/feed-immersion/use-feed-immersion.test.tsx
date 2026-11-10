// @vitest-environment jsdom
// P04 (18/10/2026) : la surface du fil — position retenue et rétablie au retour, suivie d'un mode à l'autre, jamais lue par une autre personne.
import type { Id } from "@antsia/api/engine"
import { NetworkProvider, type EngineFeedPresentation } from "@antsia/api/network"
import { RouterProvider } from "@antsia/api/routing"
import { act, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { memoryRouter, TEST_NETWORK_ID, TEST_PERSON_ID, TEST_ROUTES } from "../../tests/engine-wrapper"
import { __resetFeedReturnForTests, activateFeedReturnSession, feedReturnOwner, feedReturnScope, readFeedReturn } from "./feed-return-memory"
import { useFeedImmersion } from "./use-feed-immersion"
import { __resetFeedModeMemoryForTests } from "./use-feed-mode"

const state = vi.hoisted(() => ({ mobile: true as boolean | null }))

vi.mock("@antsia/ui/overlay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@antsia/ui/overlay")>()),
  useIsReseauMobile: () => state.mobile,
}))
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => false,
}))

const PERSON_B = "persons_b" as Id<"persons">

function wrapperFor(options: { feedPresentation?: EngineFeedPresentation; personId?: Id<"persons"> } = {}) {
  const router = memoryRouter().implementation
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <RouterProvider implementation={router}>
        <NetworkProvider
          networkId={TEST_NETWORK_ID}
          slug="test"
          personId={options.personId ?? TEST_PERSON_ID}
          charte="antsia"
          routes={TEST_ROUTES}
          feedPresentation={options.feedPresentation ?? "immersive"}
        >
          {children}
        </NetworkProvider>
      </RouterProvider>
    )
  }
}

const ownerA = feedReturnOwner(TEST_NETWORK_ID, TEST_PERSON_ID)

beforeEach(() => {
  __resetFeedReturnForTests()
  __resetFeedModeMemoryForTests()
  window.localStorage.clear()
  state.mobile = true
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 })
  activateFeedReturnSession(ownerA)
})

describe("useFeedImmersion", () => {
  it("rend null sans déclaration de l'application", () => {
    const { result } = renderHook(() => useFeedImmersion({ feedId: "fil:pour_vous", depth: 1 }), { wrapper: wrapperFor({ feedPresentation: "list" }) })
    expect(result.current).toBeNull()
  })

  it("une vue qui n'est pas un fil (recherche) n'est ni immersive ni mémorisée", () => {
    const { result } = renderHook(() => useFeedImmersion({ feedId: null, depth: 1 }), { wrapper: wrapperFor() })
    expect(result.current?.immersive).toBe(false)
    expect(result.current?.restore).toBeNull()
  })

  it("retient la publication lue avec sa profondeur et son image, puis la rétablit au retour", () => {
    const first = renderHook(() => useFeedImmersion({ feedId: "fil:pour_vous", depth: 3 }), { wrapper: wrapperFor() })
    expect(first.result.current?.immersive).toBe(true)
    act(() => {
      first.result.current?.surfaceMemory.reportGalleryIndex("posts_9", 2)
      first.result.current?.recordSlotAnchor({ postId: "posts_9", offset: 120 })
    })
    expect(readFeedReturn(feedReturnScope(ownerA, "fil:pour_vous"), Date.now())).toMatchObject({ anchorPostId: "posts_9", offset: 120, offsetKind: "slot", galleryIndex: 2, depth: 3 })
    first.unmount()

    // Retour depuis une offre, des commentaires ou un profil : la surface se remonte.
    const back = renderHook(() => useFeedImmersion({ feedId: "fil:pour_vous", depth: 1 }), { wrapper: wrapperFor() })
    expect(back.result.current?.restore).toEqual({ anchorPostId: "posts_9", offset: 120, galleryIndex: 2, depth: 3 })
    expect(back.result.current?.surfaceMemory.initialGalleryIndex("posts_9")).toBe(2)
    expect(back.result.current?.surfaceMemory.initialGalleryIndex("posts_1")).toBeNull()
    act(() => back.result.current?.onRestored("found"))
    expect(back.result.current?.restore).toBeNull()
  })

  it("un décalage ne se lit que dans le mode qui l'a mesuré", () => {
    const first = renderHook(() => useFeedImmersion({ feedId: "fil:pour_vous", depth: 1 }), { wrapper: wrapperFor() })
    act(() => first.result.current?.recordListAnchor({ postId: "posts_4", offset: -80 }))
    first.unmount()
    const back = renderHook(() => useFeedImmersion({ feedId: "fil:pour_vous", depth: 1 }), { wrapper: wrapperFor() })
    // Mesuré en liste, rétabli en immersion : la publication, sans décalage.
    expect(back.result.current?.restore).toMatchObject({ anchorPostId: "posts_4", offset: 0 })
  })

  it("changer de mode garde la publication lue", () => {
    const { result } = renderHook(() => useFeedImmersion({ feedId: "fil:pour_vous", depth: 2 }), { wrapper: wrapperFor() })
    act(() => result.current?.recordSlotAnchor({ postId: "posts_7", offset: 0 }))
    expect(result.current?.restore).toBeNull()
    act(() => result.current?.changeMode("list"))
    expect(result.current?.immersive).toBe(false)
    expect(result.current?.restore).toMatchObject({ anchorPostId: "posts_7" })
  })

  it("Clips garde son mode sans modifier celui du fil", () => {
    const first = renderHook(() => useFeedImmersion({ feedId: "fil:pour_vous", depth: 1 }), { wrapper: wrapperFor() })
    act(() => first.result.current?.changeMode("list"))
    const clips = renderHook(() => useFeedImmersion({ feedId: "clips", depth: 1, surface: "clips" }), { wrapper: wrapperFor() })
    expect(clips.result.current?.immersive).toBe(true)
    act(() => clips.result.current?.changeMode("list"))
    expect(first.result.current?.immersive).toBe(false)
    act(() => first.result.current?.changeMode("immersive"))
    expect(clips.result.current?.immersive).toBe(false)
    expect(Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index)).every(key => key?.startsWith("antsia:test:"))).toBe(true)
  })

  it("une session remplacée (autre personne) ne rétablit jamais la position de la précédente", () => {
    const first = renderHook(() => useFeedImmersion({ feedId: "fil:pour_vous", depth: 1 }), { wrapper: wrapperFor() })
    act(() => first.result.current?.recordSlotAnchor({ postId: "posts_9", offset: 0 }))
    first.unmount()
    activateFeedReturnSession(feedReturnOwner(TEST_NETWORK_ID, PERSON_B))
    const other = renderHook(() => useFeedImmersion({ feedId: "fil:pour_vous", depth: 1 }), { wrapper: wrapperFor({ personId: PERSON_B }) })
    expect(other.result.current?.restore).toBeNull()
  })
})
