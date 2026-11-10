// @vitest-environment jsdom
// Régression du lecteur réel : la pause ne repart pas au changement de format.
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EngineTestWrapper, memoryRouter, TEST_ROUTES } from "../../tests/engine-wrapper"

const NOW = Date.UTC(2026, 9, 21, 12)
const mocks = vi.hoisted(() => ({ mobile: true }))
const adaptiveRoutes = { ...TEST_ROUTES, discover: () => "/explorer", me: () => "/moi" }

vi.mock("@antsia/api/engine", () => ({ api: { modules: {
  stories: { stories: { tray: "tray", myActive: "mine", listByAuthor: "author", markSeen: "seen", remove: "remove" } },
  people: { persons: { getMyPerson: "me" } },
  live: { sessions: { listLive: "live" } },
} } }))

vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: (reference: string, args: unknown) => {
    const data = args === "skip" ? undefined
      : reference === "tray" ? { groups: [{
        author: { personId: "person-me", handle: "awa", displayName: "Awa NDONG", avatarUrl: null, headline: null, source: "published" },
        storyCount: 1, unseenCount: 1, latestPublishedAt: NOW - 1_000,
        cover: { url: "/story.jpg", kind: "image" },
      }], truncated: false }
      : reference === "me" ? { handle: "awa", published: true }
      : reference === "live" ? { items: [] }
      : [{ storyId: "story-one", media: { kind: "image", url: "/story.jpg", withheld: null, mimeType: "image/jpeg" },
        caption: "Une story", audience: "connections", publishedAt: NOW - 1_000, expiresAt: NOW + 86_400_000,
        seen: false, isOwn: true, viewCount: 0 }]
    return { data, isError: false, refetch: vi.fn() }
  },
}))
vi.mock("convex/react", () => ({ useMutation: () => vi.fn().mockResolvedValue(undefined) }))
vi.mock("./StoryCreateSheet", () => ({ StoryCreateSheet: () => null }))
vi.mock("./StoryViewersSheet", () => ({ StoryViewersSheet: () => null }))
vi.mock("@antsia/ui/overlay", () => ({
  useIsReseauMobile: () => mocks.mobile,
  ImmersiveOverlay: ({ open, label, children }: { open: boolean; label: string; children: ReactNode }) =>
    open ? <div role="dialog" aria-label={label}>{children}</div> : null,
}))
vi.mock("../../shell/mobile/VerticalPager", () => ({
  VerticalPager: <T,>({ items, index, renderItem }: {
    items: readonly T[]; index: number; renderItem: (item: T, state: { active: boolean; index: number }) => ReactNode
  }) => <div>{renderItem(items[index]!, { active: true, index })}</div>,
}))

import { StoriesViewerPage } from "./StoriesViewerPage"

beforeEach(() => {
  mocks.mobile = true
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1))
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe("StoriesViewerPage — changements de format", () => {
  it("conserve le média et la pause explicite du téléphone au bureau puis au téléphone", () => {
    const router = memoryRouter({ pathname: "/actus", search: "auteur=awa" })
    const viewer = () => <EngineTestWrapper router={router.implementation} routes={adaptiveRoutes} navigation="destinations" navigationLayout="adaptive"><StoriesViewerPage /></EngineTestWrapper>
    const view = render(viewer())
    const image = screen.getByRole("img", { name: "Une story" })
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    expect(screen.getByRole("button", { name: "Reprendre" })).toBeInTheDocument()

    mocks.mobile = false
    view.rerender(viewer())
    expect(screen.getByRole("img", { name: "Une story" })).toBe(image)
    expect(screen.getByRole("button", { name: "Reprendre" })).toBeInTheDocument()

    mocks.mobile = true
    view.rerender(viewer())
    expect(screen.getByRole("img", { name: "Une story" })).toBe(image)
    expect(screen.getByRole("button", { name: "Reprendre" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Reprendre" }))
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument()
    expect(router.calls).not.toContainEqual({ method: "push", href: "/fil" })
  })

  it("garde le lecteur historique en place au téléphone hors de la navigation adaptative", () => {
    render(<EngineTestWrapper><StoriesViewerPage /></EngineTestWrapper>)
    expect(screen.getByRole("img", { name: "Une story" })).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
