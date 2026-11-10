// Écrit pour le moteur (ADR-0028) : la carte de suggestion de l'écran des chartes — une personne, Suivre et Écrire.
// @vitest-environment jsdom

/**
 * FeedSuggestionCard — ce que la carte promet :
 *
 *  1. elle montre la PREMIÈRE personne proposée par le moteur, sa ligne
 *     d'appoint vraie (adresse, titre) et aucun chiffre inventé ;
 *  2. « Suivre » appelle le geste unilatéral du moteur, par l'adresse publiée ;
 *  3. « Écrire » ouvre le brouillon, et la messagerie au téléphone ;
 *  4. rien à proposer, une politique du réseau ou une panne : aucune carte.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { I18nextProvider } from "react-i18next"

import { createAppI18n } from "../../i18n"

import { memoryRouter, renderWithEngine, TEST_NETWORK_ID } from "../../tests/engine-wrapper"

const mocks = vi.hoisted(() => ({
  suggestions: { data: undefined as unknown[] | undefined, isLoading: false, isError: false },
  queried: vi.fn(),
  follow: vi.fn(),
  openDraft: vi.fn(),
  mobile: true as boolean | null,
}))

vi.mock("@antsia/api/engine", () => ({
  api: { modules: { graph: { follows: { suggestions: "suggestions", follow: "follow" } } } },
}))

vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: (name: string, args: unknown) => {
    mocks.queried(name, args)
    return mocks.suggestions
  },
}))

vi.mock("convex/react", () => ({
  useMutation: () => mocks.follow,
}))

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("@antsia/ui/overlay", () => ({ useIsReseauMobile: () => mocks.mobile }))
vi.mock("../messagerie/dock-store", () => ({ dockStore: { openDraft: mocks.openDraft } }))

import { FeedSuggestionCard } from "./FeedSuggestionCard"

const awa = { personId: "persons_awa", handle: "awa.ndong", displayName: "Awa NDONG", headline: "Port-Gentil", avatarUrl: null, badges: [] }
const jean = { personId: "persons_jean", handle: "jean.mba", displayName: "Jean MBA", headline: null, avatarUrl: null, badges: [] }

beforeEach(() => {
  mocks.suggestions = { data: [awa, jean], isLoading: false, isError: false }
  mocks.queried.mockReset()
  mocks.follow.mockReset()
  mocks.follow.mockResolvedValue({ targetPersonId: "persons_awa", following: true })
  mocks.openDraft.mockReset()
  mocks.mobile = true
})

describe("FeedSuggestionCard — la suggestion des chartes", () => {
  it("montre la première personne proposée, sa ligne vraie et ses deux gestes", () => {
    renderWithEngine(<FeedSuggestionCard />)
    expect(mocks.queried).toHaveBeenCalledWith("suggestions", { networkId: TEST_NETWORK_ID, limit: 3 })
    const card = screen.getByRole("region", { name: "Personne à découvrir : Awa NDONG" })
    expect(card.textContent).toContain("@awa.ndong · Port-Gentil")
    expect(card.textContent).not.toMatch(/en commun/)
    expect(screen.queryByText("Jean MBA")).toBeNull()
    expect(screen.getByRole("link", { name: "Awa NDONG" })).toHaveAttribute("href", "/profil/awa.ndong")
    expect(screen.getByRole("button", { name: "Suivre Awa NDONG" })).toHaveTextContent("Suivre")
    expect(screen.getByRole("button", { name: "Écrire à Awa NDONG" })).toHaveTextContent("Écrire")
  })

  it("charge aussi les vrais libellés anglais du moteur, avec l'identité et les noms accessibles", () => {
    const i18n = createAppI18n({ locale: "en", appResources: { fr: {}, en: {} }, defaultNS: "reseau" })
    renderWithEngine(<I18nextProvider i18n={i18n}><FeedSuggestionCard /></I18nextProvider>)
    expect(screen.getByRole("region", { name: "Person to discover: Awa NDONG" }).textContent).toContain("@awa.ndong · Port-Gentil")
    expect(screen.getByRole("link", { name: "Profile of Awa NDONG" })).toHaveAttribute("href", "/profil/awa.ndong")
    expect(screen.getByRole("button", { name: "Follow Awa NDONG" })).toHaveTextContent("Follow")
    expect(screen.getByRole("button", { name: "Write to Awa NDONG" })).toHaveTextContent("Write")
    expect(i18n.t("feedSuggestion.followed", { name: awa.displayName })).toBe("You follow Awa NDONG.")
    expect(i18n.t("feedSuggestion.followFailed")).toBe("The follow could not be saved.")
  })

  it("Suivre appelle le geste unilatéral du moteur, par l'adresse publiée", async () => {
    renderWithEngine(<FeedSuggestionCard />)
    fireEvent.click(screen.getByRole("button", { name: "Suivre Awa NDONG" }))
    await waitFor(() => expect(mocks.follow).toHaveBeenCalledWith({ networkId: TEST_NETWORK_ID, handle: "awa.ndong" }))
  })

  it("Écrire ouvre le brouillon, et la messagerie de l'application au téléphone", () => {
    const router = memoryRouter()
    renderWithEngine(<FeedSuggestionCard />, { router: router.implementation })
    fireEvent.click(screen.getByRole("button", { name: "Écrire à Awa NDONG" }))
    expect(mocks.openDraft).toHaveBeenCalledWith("awa.ndong")
    expect(router.calls).toEqual([{ method: "push", href: "/messages/a/awa.ndong" }])
  })

  it("au bureau, Écrire ouvre la carte iCom sans quitter la page", () => {
    mocks.mobile = false
    const router = memoryRouter()
    renderWithEngine(<FeedSuggestionCard />, { router: router.implementation })
    fireEvent.click(screen.getByRole("button", { name: "Écrire à Awa NDONG" }))
    expect(mocks.openDraft).toHaveBeenCalledWith("awa.ndong")
    expect(router.calls).toEqual([])
  })

  it.each([
    { label: "rien à proposer", value: { data: [], isLoading: false, isError: false } },
    { label: "chargement", value: { data: undefined, isLoading: true, isError: false } },
    { label: "refus ou panne", value: { data: undefined, isLoading: false, isError: true } },
  ])("$label : aucune carte", ({ value }) => {
    mocks.suggestions = value
    const view = renderWithEngine(<FeedSuggestionCard />)
    expect(view.container.textContent).toBe("")
  })
})
