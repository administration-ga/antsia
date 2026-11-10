// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { StoryRing } from "./StoryRing"

describe("StoryRing — repli du média servi", () => {
  it("une image en échec rend les initiales et une nouvelle URL peut être chargée", () => {
    const view = render(<StoryRing state="unseen" displayName="Awa NDONG" coverUrl="/story-one" />)
    const first = view.container.querySelector("img")!
    expect(first).toHaveAttribute("alt", "")
    expect(view.container.firstElementChild).toHaveAttribute("aria-hidden", "true")
    fireEvent.error(first)
    expect(view.container.querySelector("img")).toBeNull()
    expect(view.container).toHaveTextContent("AN")
    view.rerender(<StoryRing state="seen" displayName="Awa NDONG" coverUrl="/story-two" />)
    expect(view.container.querySelector("img")).toHaveAttribute("src", "/story-two")
  })
})
