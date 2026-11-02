// @vitest-environment jsdom
import type { Id } from "@antsia/api/engine"
import { render } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { EngineTestWrapper, TEST_NETWORK_ID } from "../../tests/engine-wrapper"
import { storyQueryInstant } from "./stories-tray"

const mocks = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { stories: { stories: { viewers: "viewers" } } } } }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedPaginatedQuery: (...args: unknown[]) => { mocks.query(...args); return { results: [], status: "Exhausted", loadMore: vi.fn() } } }))
vi.mock("@antsia/api/viewer-preferences", () => ({ useViewerTimeZone: () => "Africa/Libreville" }))
vi.mock("@antsia/ui/sheet", () => ({ Sheet: ({ children }: { children: ReactNode }) => children, SheetContent: ({ children }: { children: ReactNode }) => children, SheetHeader: ({ children }: { children: ReactNode }) => children, SheetTitle: ({ children }: { children: ReactNode }) => children }))

import { StoryViewersSheet } from "./StoryViewersSheet"

const NOW = Date.UTC(2026, 9, 24, 10)
const STORY_ID = "stories_test" as Id<"stories">
beforeEach(() => mocks.query.mockClear())

describe("StoryViewersSheet — instant stable de relecture", () => {
  it("n'ouvre aucune lecture avant la feuille, puis transmet l'instant du lecteur", () => {
    const content = (open: boolean, now: number) => <EngineTestWrapper><StoryViewersSheet open={open} onOpenChange={vi.fn()} storyId={STORY_ID} now={now} queryNow={NOW - 30_000} /></EngineTestWrapper>
    const view = render(content(false, NOW))
    expect(mocks.query).not.toHaveBeenCalled()
    view.rerender(content(true, NOW))
    expect(mocks.query).toHaveBeenLastCalledWith("viewers", { networkId: TEST_NETWORK_ID, storyId: STORY_ID, now: NOW - 30_000 }, { initialNumItems: 25 })
    view.rerender(content(true, NOW + 30_000))
    expect(mocks.query.mock.lastCall?.[1]).toEqual({ networkId: TEST_NETWORK_ID, storyId: STORY_ID, now: NOW - 30_000 })
  })

  it("un appel historique sans queryNow fige son repli au montage de la liste", () => {
    const content = (now: number) => <EngineTestWrapper><StoryViewersSheet open onOpenChange={vi.fn()} storyId={STORY_ID} now={now} /></EngineTestWrapper>
    const view = render(content(NOW))
    view.rerender(content(NOW + 60_000))
    expect(mocks.query.mock.lastCall?.[1]).toEqual({ networkId: TEST_NETWORK_ID, storyId: STORY_ID, now: storyQueryInstant(NOW) })
  })
})
