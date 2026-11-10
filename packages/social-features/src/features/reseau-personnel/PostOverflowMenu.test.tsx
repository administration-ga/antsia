// @vitest-environment jsdom
/**
 * P18b (A01) — le menu « ⋯ » d'une publication au clavier : le focus entre
 * dans le menu à l'ouverture, les flèches le parcourent (tabindex itinérant),
 * Échap et Tab le ferment en rendant le focus au bouton, et le défilement de
 * la page ne le ferme plus tant que son bouton reste visible.
 */
import type { Id } from "@antsia/api/engine"
import { NetworkProvider, type EnginePostPresentation } from "@antsia/api/network"
import { RouterProvider } from "@antsia/api/routing"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createAppI18n } from "../../i18n"
import { memoryRouter, TEST_NETWORK_ID, TEST_PERSON_ID, TEST_ROUTES } from "../../tests/engine-wrapper"
import { PostOverflowMenu } from "./PostOverflowMenu"

const mocks = vi.hoisted(() => ({
  mutation: vi.fn(() => Promise.resolve({ marked: true })),
}))

vi.mock("@antsia/api/engine", () => ({
  api: {
    modules: {
      marks: {
        marks: {
          toggleMark: "toggleMark",
          hidePost: "hidePost",
          unhidePost: "unhidePost",
          muteAuthor: "muteAuthor",
          unmuteAuthor: "unmuteAuthor",
        },
      },
      graph: { connections: { blockPerson: "blockPerson", unblockPerson: "unblockPerson" } },
    },
  },
}))
vi.mock("convex/react", () => ({ useMutation: () => mocks.mutation }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function menuProps(overrides: Partial<Parameters<typeof PostOverflowMenu>[0]> = {}) {
  return {
    postId: "posts_1" as Id<"posts">,
    authorPersonId: "persons_author" as Id<"persons">,
    authorName: "Awa",
    authorKind: "person" as const,
    isOwn: false,
    canPin: false,
    bookmarked: false,
    notifying: false,
    onRemove: vi.fn(),
    onReport: vi.fn(),
    onEdit: vi.fn(),
    onPin: vi.fn(),
    ...overrides,
  }
}

/** Rectangle du bouton, à `top` pixels du haut de la fenêtre (jsdom : 1024 × 768). */
function rect(top: number): DOMRect {
  return {
    top,
    bottom: top + 34,
    left: 300,
    right: 334,
    width: 34,
    height: 34,
    x: 300,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

/**
 * L'enveloppe du moteur, avec la présentation des publications choisie :
 * « media » (ANTSIA) par défaut, « classic » (DIASPORALE, rien de déclaré).
 */
function renderWithEngine(ui: ReactElement, presentation: EnginePostPresentation = "media") {
  const i18n = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "social" })
  return render(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <I18nextProvider i18n={i18n}>
        <RouterProvider implementation={memoryRouter().implementation}>
          <NetworkProvider
            networkId={TEST_NETWORK_ID}
            slug="test"
            personId={TEST_PERSON_ID}
            charte="antsia"
            routes={TEST_ROUTES}
            postPresentation={presentation}
          >
            {children}
          </NetworkProvider>
        </RouterProvider>
      </I18nextProvider>
    ),
  })
}

const trigger = () => screen.getByRole("button", { name: "Autres actions sur cette publication" })

afterEach(() => {
  vi.restoreAllMocks()
})

describe("PostOverflowMenu au clavier (P18b, A01)", () => {
  it("ouvre avec le focus sur la première entrée, la parcourt aux flèches et Échap rend le focus", () => {
    renderWithEngine(<PostOverflowMenu {...menuProps()} />)
    fireEvent.click(trigger())

    const items = screen.getAllByRole("menuitem")
    // Enregistrer, suivre, masquer, sourdine, bloquer l'auteur (PF-01), signaler.
    expect(items).toHaveLength(6)
    expect(document.activeElement).toBe(items[0])
    expect(items[0]).toHaveAttribute("tabindex", "0")
    expect(items[1]).toHaveAttribute("tabindex", "-1")
    expect(trigger()).toHaveAttribute("aria-expanded", "true")
    expect(trigger()).toHaveAttribute("aria-controls", screen.getByRole("menu").id)

    fireEvent.keyDown(items[0]!, { key: "ArrowDown" })
    expect(document.activeElement).toBe(items[1])
    expect(items[1]).toHaveAttribute("tabindex", "0")
    expect(items[0]).toHaveAttribute("tabindex", "-1")
    fireEvent.keyDown(items[1]!, { key: "End" })
    expect(document.activeElement).toBe(items[5])
    fireEvent.keyDown(items[5]!, { key: "ArrowDown" })
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(items[0]!, { key: "ArrowUp" })
    expect(document.activeElement).toBe(items[5])
    fireEvent.keyDown(items[5]!, { key: "Home" })
    expect(document.activeElement).toBe(items[0])

    fireEvent.keyDown(items[0]!, { key: "Escape" })
    expect(screen.queryByRole("menu")).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it("Flèche haut sur le bouton ouvre sur la dernière entrée : Signaler, atteint au clavier", () => {
    const onReport = vi.fn()
    renderWithEngine(<PostOverflowMenu {...menuProps({ onReport })} />)
    fireEvent.keyDown(trigger(), { key: "ArrowUp" })

    const last = screen.getAllByRole("menuitem").at(-1)!
    expect(document.activeElement).toBe(last)
    expect(last).toHaveAccessibleName(/^Signaler/)

    fireEvent.click(last)
    expect(onReport).toHaveBeenCalledOnce()
    expect(screen.queryByRole("menu")).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it("Tab ferme le menu et rend le focus au bouton, d'où la tabulation repart", () => {
    renderWithEngine(<PostOverflowMenu {...menuProps()} />)
    fireEvent.click(trigger())
    fireEvent.keyDown(document.activeElement!, { key: "Tab" })

    expect(screen.queryByRole("menu")).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it("Échap dans le menu ne se propage pas aux surfaces modales sous-jacentes", () => {
    const onDocumentKey = vi.fn()
    document.addEventListener("keydown", onDocumentKey)
    try {
      renderWithEngine(<PostOverflowMenu {...menuProps()} />)
      fireEvent.click(trigger())
      fireEvent.keyDown(screen.getAllByRole("menuitem")[0]!, { key: "Escape" })

      expect(screen.queryByRole("menu")).toBeNull()
      expect(onDocumentKey).not.toHaveBeenCalled()
    } finally {
      document.removeEventListener("keydown", onDocumentKey)
    }
  })

  it("présentation historique : le défilement ferme le menu comme avant, en rendant le focus au bouton", () => {
    renderWithEngine(<PostOverflowMenu {...menuProps()} />, "classic")
    const button = trigger()
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue(rect(400))
    fireEvent.click(button)
    const menu = screen.getByRole("menu")
    expect(document.activeElement).toBe(screen.getAllByRole("menuitem")[0])

    // Le menu qui défile lui-même ne se ferme pas, même ici.
    act(() => {
      menu.dispatchEvent(new Event("scroll"))
    })
    expect(screen.getByRole("menu")).toBe(menu)

    act(() => {
      window.dispatchEvent(new Event("scroll"))
    })
    expect(screen.queryByRole("menu")).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it("présentation « media » : le défilement ne ferme plus le menu tant que son bouton reste visible", () => {
    renderWithEngine(<PostOverflowMenu {...menuProps()} />)
    const button = trigger()
    const measure = vi.spyOn(button, "getBoundingClientRect").mockReturnValue(rect(400))
    fireEvent.click(button)
    const menu = screen.getByRole("menu")
    const first = screen.getAllByRole("menuitem")[0]!

    // La page (ou la colonne) défile : le menu reste ouvert, contre son bouton.
    act(() => {
      window.dispatchEvent(new Event("scroll"))
    })
    expect(screen.getByRole("menu")).toBe(menu)
    expect(document.activeElement).toBe(first)

    // Le menu défile lui-même (ancré par le bas) : il reste ouvert.
    act(() => {
      menu.dispatchEvent(new Event("scroll"))
    })
    expect(screen.getByRole("menu")).toBe(menu)

    // Le bouton quitte la fenêtre : le menu se ferme, le focus revient au bouton.
    measure.mockReturnValue(rect(-200))
    act(() => {
      window.dispatchEvent(new Event("scroll"))
    })
    expect(screen.queryByRole("menu")).toBeNull()
    expect(document.activeElement).toBe(button)
  })
})

describe("PostOverflowMenu — bloquer l'auteur (PF-01)", () => {
  it("un seul filet avant les gestes graves ; « Bloquer » ouvre la confirmation commune, puis le moteur", async () => {
    mocks.mutation.mockClear()
    renderWithEngine(<PostOverflowMenu {...menuProps()} />)
    fireEvent.click(trigger())
    expect(document.body.querySelectorAll(".rp-of-sep")).toHaveLength(1)
    fireEvent.click(screen.getByRole("menuitem", { name: /^Bloquer Awa/ }))
    expect(screen.queryByRole("menu")).toBeNull()
    const dialog = screen.getByRole("dialog", { name: "Bloquer Awa ?" })
    expect(mocks.mutation).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Bloquer" }))
    })
    expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith({ networkId: TEST_NETWORK_ID, targetPersonId: "persons_author" })
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it.each([
    ["une page", { authorKind: "page" as const }],
    ["sa propre publication", { isOwn: true }],
    ["un reflet sans signataire local", { authorPersonId: null }],
  ])("ne propose pas de bloquer sur %s", (_label, overrides) => {
    renderWithEngine(<PostOverflowMenu {...menuProps(overrides)} />)
    fireEvent.click(trigger())
    expect(screen.queryByRole("menuitem", { name: /^Bloquer/ })).toBeNull()
  })
})
