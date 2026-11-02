// @vitest-environment jsdom
// P04 (18/10/2026) : en liste, la carte lue est suivie au défilement et retrouvée au retour (profondeur rechargée, position recalée).
import { act, render, waitFor } from "@testing-library/react"
import type { CSSProperties, ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FeedListReturn, listAnchorOf } from "./FeedListReturn"
import type { FeedRestoreTarget } from "./ImmersiveFeedReader"
import { scrollContainerTop } from "./layout-measure"

/** Une carte dans son enveloppe d'ancre, à une position simulée sous le haut de la fenêtre. */
function Card({ id, top, height = 400 }: { id: string; top: number; height?: number }) {
  return (
    <div className="contents" data-feed-anchor={id}>
      <article
        data-testid={id}
        ref={(element) => {
          if (element === null) return
          element.getBoundingClientRect = () => ({ top, bottom: top + height, left: 0, right: 0, width: 0, height, x: 0, y: top, toJSON: () => ({}) })
        }}
      />
    </div>
  )
}

/** Le haut du centre est à 60 px ; ses deux outils occupent les 192 px suivants. */
function Scroller({ children, pinned = true }: { children?: ReactNode; pinned?: boolean }) {
  return <div
    data-testid="scroller"
    style={{ overflowY: "auto", scrollPaddingTop: "192px", ...(pinned ? { "--rp-composer-height": "100px" } : {}) } as CSSProperties}
    ref={element => {
      if (!element) return
      Object.defineProperty(element, "clientHeight", { configurable: true, value: 700 })
      element.getBoundingClientRect = () => ({ top: 60, bottom: 760, left: 0, right: 800, width: 800, height: 700, x: 0, y: 60, toJSON: () => ({}) })
    }}
  ><div>{children}</div></div>
}

const target: FeedRestoreTarget = { anchorPostId: "posts_c", offset: -40, galleryIndex: null, depth: 2 }

let scrollBy: ReturnType<typeof vi.fn>

beforeEach(() => {
  scrollBy = vi.fn()
  window.scrollBy = scrollBy as unknown as typeof window.scrollBy
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("listAnchorOf", () => {
  it("la première carte encore visible et la position de son bord haut", () => {
    const view = render(
      <div data-testid="root">
        <Card id="posts_a" top={-500} />
        <Card id="posts_b" top={-120} />
        <Card id="posts_c" top={280} />
      </div>,
    )
    const root = view.getByTestId("root")
    expect(listAnchorOf(root, 0)).toEqual({ postId: "posts_b", offset: -120 })
  })

  it("garde le bord historique hors du fil adaptatif malgré un scroll-padding", () => {
    const view = render(<Scroller pinned={false} />)
    expect(scrollContainerTop(view.getByTestId("scroller"))).toBe(60)
    expect(scrollContainerTop(null)).toBe(0)
  })
})

describe("FeedListReturn", () => {
  it("appelle le dernier observateur après son remplacement", async () => {
    const previous = vi.fn()
    const current = vi.fn()
    const ui = (onAnchor: typeof previous) => <div>
      <Card id="posts_b" top={60} />
      <FeedListReturn restore={null} onRestored={vi.fn()} onAnchor={onAnchor} canLoadMore={false} exhausted onLoadMore={vi.fn()} />
    </div>
    const view = render(ui(previous))
    view.rerender(ui(current))
    act(() => { window.dispatchEvent(new Event("scroll")) })
    await waitFor(() => expect(current).toHaveBeenCalledWith({ postId: "posts_b", offset: 60 }))
    expect(previous).not.toHaveBeenCalled()
  })

  it("ignore les cartes entièrement cachées derrière le composeur et la recherche épinglés", async () => {
    const onAnchor = vi.fn()
    const view = render(<Scroller>
      <Card id="posts_hidden" top={80} height={160} />
      <Card id="posts_reading" top={240} />
      <FeedListReturn restore={null} onRestored={vi.fn()} onAnchor={onAnchor} canLoadMore={false} exhausted onLoadMore={vi.fn()} />
    </Scroller>)
    act(() => { view.getByTestId("scroller").dispatchEvent(new Event("scroll")) })
    await waitFor(() => expect(onAnchor).toHaveBeenCalledWith({ postId: "posts_reading", offset: -12 }))
  })

  it("restaure la carte depuis le bord lisible sous les outils, même si leur hauteur a changé", () => {
    const onRestored = vi.fn()
    const view = render(<Scroller>
      <Card id="posts_c" top={500} />
      <FeedListReturn restore={{ ...target, offset: -12 }} onRestored={onRestored} onAnchor={vi.fn()} canLoadMore={false} exhausted onLoadMore={vi.fn()} />
    </Scroller>)
    expect(view.getByTestId("scroller").scrollTop).toBe(260)
    expect(onRestored).toHaveBeenCalledWith("found")
    expect(scrollBy).not.toHaveBeenCalled()
  })

  it("suit la carte lue au défilement de la fenêtre", async () => {
    const onAnchor = vi.fn()
    render(
      <div>
        <Card id="posts_a" top={-500} />
        <Card id="posts_b" top={60} />
        <FeedListReturn restore={null} onRestored={vi.fn()} onAnchor={onAnchor} canLoadMore={false} exhausted onLoadMore={vi.fn()} />
      </div>,
    )
    act(() => {
      window.dispatchEvent(new Event("scroll"))
    })
    await waitFor(() => expect(onAnchor).toHaveBeenCalledWith({ postId: "posts_b", offset: 60 }))
  })

  it("recharge la profondeur jusqu'à retrouver la carte, puis la recale à sa position", () => {
    const onLoadMore = vi.fn()
    const onRestored = vi.fn()
    const view = render(
      <div>
        <Card id="posts_a" top={0} />
        <FeedListReturn restore={target} onRestored={onRestored} onAnchor={vi.fn()} canLoadMore exhausted={false} onLoadMore={onLoadMore} />
      </div>,
    )
    expect(onLoadMore).toHaveBeenCalledTimes(1)
    // La page demandée est en route : on attend sa réponse, sans redemander.
    view.rerender(
      <div>
        <Card id="posts_a" top={0} />
        <FeedListReturn restore={target} onRestored={onRestored} onAnchor={vi.fn()} canLoadMore={false} exhausted={false} onLoadMore={onLoadMore} />
      </div>,
    )
    expect(onLoadMore).toHaveBeenCalledTimes(1)
    // La carte est arrivée, 300 px sous le haut ; elle était à −40 : défilement de 340.
    view.rerender(
      <div>
        <Card id="posts_a" top={0} />
        <Card id="posts_c" top={300} />
        <FeedListReturn restore={target} onRestored={onRestored} onAnchor={vi.fn()} canLoadMore={false} exhausted={false} onLoadMore={onLoadMore} />
      </div>,
    )
    expect(onRestored).toHaveBeenCalledWith("found")
    expect(scrollBy).toHaveBeenCalledWith(0, 340)
  })

  it("une carte qui a quitté un fil terminé ne bloque rien", () => {
    const onRestored = vi.fn()
    render(
      <div>
        <Card id="posts_a" top={0} />
        <FeedListReturn restore={target} onRestored={onRestored} onAnchor={vi.fn()} canLoadMore={false} exhausted onLoadMore={vi.fn()} />
      </div>,
    )
    expect(onRestored).toHaveBeenCalledWith("missing")
  })
})
