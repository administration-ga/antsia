// @vitest-environment jsdom
// FP-01 : dans le fil, la première image de la PREMIÈRE publication de la PREMIÈRE page se charge tout de suite (eager, priorité haute) ; toutes les autres restent paresseuses.
import type { PostMediaDto } from "@antsia/social-contracts/media"
import type { api } from "@antsia/api/engine"
import type { FunctionReturnType } from "convex/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { renderWithEngine } from "../../tests/engine-wrapper"

type Feed = FunctionReturnType<typeof api.modules.posts.posts.myFeed>
const state = vi.hoisted(() => ({
  data: undefined as Feed | undefined,
  isLoading: false,
  isError: false,
  refetch: vi.fn(async () => undefined),
  prepare: vi.fn(),
}))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: () => state, useConvexMutationQuery: () => ({ mutate: state.prepare }) }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
// La carte réduite à ses médias, posés comme sous la charte d'ANTSIA (ADR-0028).
vi.mock("./PostCard", async () => {
  const { PostMediaPresentation } = await import("./PostMediaPresentation")
  return {
    PostCard: ({ post }: { post: { media: readonly PostMediaDto[] } }) => <PostMediaPresentation media={post.media} bleed={null} primary inset />,
  }
})
vi.mock("./PagesSuggestionsRail", () => ({ PagesSuggestionsRail: () => null }))
vi.mock("./SuggestionsPanel", () => ({ SuggestionsPanel: () => null }))
vi.mock("./FeedClipsRail", () => ({ FeedClipsRail: () => null }))

import { FeedPage } from "./FeedPages"

const photo = (name: string): PostMediaDto => ({ kind: "image", mimeType: "image/jpeg", url: `https://media.example/${name}.jpg`, withheld: null, altText: name, width: 800, height: 600 })
const post = (id: string, media: readonly PostMediaDto[]) => ({ _id: id, body: id, media }) as unknown as Feed["items"][number]

function mount(isFirst: boolean) {
  return renderWithEngine(
    <FeedPage cursor={null} pageIndex={isFirst ? 0 : 1} pageKey="page" nextMountedCursor={undefined} scope="recents" now={0} isFirst={isFirst} isLast interleaveAfter={null} onTag={vi.fn()} onMention={vi.fn()} onTail={vi.fn()} onBoundaryShift={vi.fn()} emptyFallback={null} />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  state.data = { items: [post("posts_1", [photo("a1"), photo("a2")]), post("posts_2", [photo("b1")])], nextCursor: null, lacunar: false }
})

describe("FP-01 — la première image du fil, et elle seule, en priorité", () => {
  it("première page : la première image de la première publication est eager et prioritaire, les autres paresseuses", () => {
    const view = mount(true)
    const images = [...view.container.querySelectorAll("img")]
    expect(images.map((image) => image.getAttribute("alt"))).toEqual(["a1", "a2", "b1"])
    expect(images.map((image) => image.getAttribute("loading"))).toEqual(["eager", "lazy", "lazy"])
    expect(images.map((image) => image.getAttribute("fetchpriority"))).toEqual(["high", null, null])
  })

  it("une page suivante n'a pas d'image prioritaire", () => {
    const view = mount(false)
    const images = [...view.container.querySelectorAll("img")]
    expect(images.map((image) => image.getAttribute("loading"))).toEqual(["lazy", "lazy", "lazy"])
    expect(images.every((image) => !image.hasAttribute("fetchpriority"))).toBe(true)
  })
})
