// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/Avatar.test.tsx @ ad2e7fdc2 — adaptations : mock de `@antsia/ui` ; photos par adresse relative ; repli public, identité neutre, nouvelle adresse après échec et géométrie des pages.
// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@antsia/ui", () => ({
  Icon: () => <span data-testid="fallback-icon" />,
}))

import { Avatar } from "./Avatar"
import { identityToneStyle } from "./avatar-presentation"

afterEach(cleanup)

describe("Avatar", () => {
  it("charge immédiatement une photo d'identité visible", () => {
    const { container } = render(
      <Avatar
        displayName="Ada Mba"
        avatarUrl="/medias/ada.webp"
      />
    )

    const image = container.querySelector("img")
    expect(image).not.toBeNull()
    expect(image?.getAttribute("loading")).toBe("eager")
    expect(image?.getAttribute("decoding")).toBe("async")
  })

  it("retrouve les initiales et leur teinte publique si la photo échoue", () => {
    const { container } = render(<Avatar displayName="Awa MBA" avatarUrl="/medias/absent.webp" />)
    fireEvent.error(container.querySelector("img")!)
    expect(container.querySelector("img")).toBeNull()
    expect(container.firstElementChild?.textContent).toBe("AM")
    expect(container.firstElementChild?.getAttribute("style")).toContain(identityToneStyle("Awa MBA").background)
  })

  it("essaie la nouvelle photo après l'échec d'une autre adresse", () => {
    const { container, rerender } = render(<Avatar displayName="Awa MBA" avatarUrl="/medias/absent.webp" />)
    fireEvent.error(container.querySelector("img")!)
    rerender(<Avatar displayName="Awa MBA" avatarUrl="/medias/awa.webp" />)
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/medias/awa.webp")
  })

  it("ne montre ni initiales ni variante personnelle sans identité publiée", () => {
    const { container, getByTestId } = render(<Avatar displayName="Awa MBA" hasIdentity={false} />)
    expect(getByTestId("fallback-icon")).toBeDefined()
    expect(container.textContent).not.toContain("AM")
    expect(container.firstElementChild?.getAttribute("style")).toContain("--esp-avatar-neutral-bg")
  })

  it("conserve le format et le rayon d'une grande page avec la nouvelle taille d'initiales", () => {
    const { container } = render(<Avatar displayName="Bibliothèque Akanda" size={104} shape="square" />)
    const style = container.firstElementChild?.getAttribute("style")
    expect(style).toContain("--esp-profile-avatar-size")
    expect(style).toContain("--esp-profile-avatar-page-radius")
    expect(style).toContain("var(--esp-avatar-font-104, 40px)")
  })
})
