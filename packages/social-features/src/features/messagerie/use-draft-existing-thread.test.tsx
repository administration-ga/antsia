// @vitest-environment jsdom
/**
 * « Écrire » vers une personne avec qui un fil existe déjà ouvre CE fil, pas une
 * conversation vide (constat de DIASPORA.GA, 16/10/2026).
 */
import { act } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { memoryRouter, renderWithEngine, TEST_NETWORK_ID, TEST_ROUTES } from "../../tests/engine-wrapper"

const mocks = vi.hoisted(() => ({
  found: null as { threadId: string } | null,
  args: [] as unknown[],
}))

vi.mock("@antsia/api/engine", () => ({
  api: { modules: { messaging: { inbox: { findThreadWithHandle: "findThreadWithHandle" } } } },
}))
vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: (_reference: string, args: unknown) => {
    mocks.args.push(args)
    return { data: args === "skip" ? undefined : mocks.found, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }
  },
}))

import { activeKey } from "./messagerie-dock"
import { dockStore, useDockState } from "./dock-store"
import { useOpenExistingThreadForDraft } from "./use-draft-existing-thread"
import type { MessagerieVariant } from "./messagerie-views"

function Probe({ handle, variant }: { handle: string | null; variant: MessagerieVariant }) {
  useOpenExistingThreadForDraft(handle, variant)
  return <output>{activeKey(useDockState()) ?? "aucune"}</output>
}

beforeEach(() => {
  mocks.found = null
  mocks.args = []
})

describe("useOpenExistingThreadForDraft", () => {
  it("un fil existe : le brouillon devient ce fil (son historique), dans le réseau courant", () => {
    mocks.found = { threadId: "fil-awa" }
    act(() => dockStore.openDraft("awa.demo"))

    const { container } = renderWithEngine(<Probe handle="awa.demo" variant="dock" />)

    expect(mocks.args).toContainEqual({ networkId: TEST_NETWORK_ID, handle: "awa.demo" })
    expect(container.textContent).toBe("chat:fil-awa")
  })

  it("aucun fil : le brouillon reste un brouillon", () => {
    act(() => dockStore.openDraft("kofi.demo"))

    const { container } = renderWithEngine(<Probe handle="kofi.demo" variant="dock" />)

    expect(container.textContent).toBe("draft:kofi.demo")
  })

  it("sur la page, l'adresse est REMPLACÉE par celle du fil (jamais empilée)", () => {
    mocks.found = { threadId: "fil-awa" }
    act(() => dockStore.openDraft("awa.demo"))
    const router = memoryRouter({ pathname: `${TEST_ROUTES.messages()}/a/awa.demo` })

    renderWithEngine(<Probe handle="awa.demo" variant="page" />, { router: router.implementation })

    expect(router.calls).toEqual([{ method: "replace", href: `${TEST_ROUTES.messages()}/chat/fil-awa` }])
  })

  it("hors d'un brouillon (fil ou groupe), rien n'est demandé", () => {
    renderWithEngine(<Probe handle={null} variant="dock" />)

    expect(mocks.args).toEqual(["skip"])
  })
})
