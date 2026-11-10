// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/ProfilReseauSection.test.tsx @ ad2e7fdc2 — adaptations : rendu dans l'enveloppe du moteur (`renderWithEngine` : i18n française, réseau et adresses de test, routeur en mémoire dont on relit les navigations) ; ma personne moquée sur `people.persons.getMyPerson` (`published`, `handle`) au lieu de `getMyProfile` + `users.getMe` ; copie lue par `visibilityFacts(t)` / `visibilityActions(t)` ; aperçu « vu par les membres du réseau » vers l'adresse de MA fiche composée par les routes injectées ; le cas « panne du compte » (photo du compte, retirée avec `getMe`) devient « une panne du profil ne masque pas l'éditeur et n'offre aucun aperçu » ; cas neuf : pas d'aperçu d'un profil RETIRÉ (identifiant gardé, fiche fermée) ; cas neuf : « Personnes bloquées » montée après mes listes (PF-01).
// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createAppI18n } from "../../i18n"
import { memoryRouter, renderWithEngine, TEST_ROUTES } from "../../tests/engine-wrapper"

const mocks = vi.hoisted(() => ({
  me: { handle: undefined as string | undefined, published: false } as
    | { handle?: string; published: boolean }
    | undefined,
  meIsError: false,
}))

vi.mock("@antsia/api/engine", () => ({
  api: {
    modules: { people: { persons: { getMyPerson: "getMyPerson" } } },
  },
}))

vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: () => ({
    data: mocks.meIsError ? undefined : mocks.me,
    isLoading: false,
    isError: mocks.meIsError,
    refetch: vi.fn(),
  }),
}))

// Les éditeurs ne sont PAS le sujet : cette section ne les réécrit pas, elle
// les place (cf. l'en-tête du composant).
vi.mock("./ProfilePublicationCard", () => ({
  ProfilePublicationCard: () => <div data-testid="publication-card" />,
}))
vi.mock("./PrivacyLists", () => ({ PrivacyLists: () => <div data-testid="privacy" /> }))
// La liste des blocages a son propre test : ici, on prouve qu'elle est MONTÉE (PF-01).
vi.mock("./BlockedPeopleSection", () => ({ BlockedPeopleSection: () => <div data-testid="blocked-people" /> }))

import { visibilityActions, visibilityFacts } from "./profile-visibility-copy"
import { ProfilReseauSection } from "./ProfilReseauSection"

const t = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "reseau" }).getFixedT("fr")

beforeEach(() => {
  mocks.me = { handle: "m.ndong", published: true }
  mocks.meIsError = false
})
afterEach(cleanup)

describe("ProfilReseauSection — la confidentialité en trois faits (X-07)", () => {
  it("liste EXACTEMENT les trois faits", () => {
    renderWithEngine(<ProfilReseauSection />)
    const facts = visibilityFacts(t)
    for (const fact of facts) {
      expect(screen.getByText(fact.title)).toBeTruthy()
    }
    const items = screen.getAllByRole("listitem")
    expect(items).toHaveLength(facts.length)
  })

  it("dit que la photo et la couverture ne partent QUE par ces boutons", () => {
    const { container } = renderWithEngine(<ProfilReseauSection />)
    expect(container.textContent).toContain("Photo")
    expect(container.textContent).toContain("Couverture")
    expect(container.textContent).not.toContain("ni votre photo")
  })

  it("distingue « hors connexion » du RETRAIT, avec conséquence et réversibilité", () => {
    const { container } = renderWithEngine(<ProfilReseauSection />)
    const actions = visibilityActions(t)
    for (const id of ["hors_connexion", "retrait"] as const) {
      expect(container.textContent).toContain(actions[id].label)
      expect(container.textContent).toContain(actions[id].consequence)
      expect(container.textContent).toContain(actions[id].reversibilite)
    }
  })

  it("offre l'aperçu « vu par les membres du réseau » quand le profil est publié", () => {
    const router = memoryRouter()
    renderWithEngine(<ProfilReseauSection />, { router: router.implementation })
    const bouton = screen.getByRole("button", { name: /vu par les membres du réseau/i })
    bouton.click()
    expect(router.calls).toEqual([
      { method: "push", href: `${TEST_ROUTES.profile("m.ndong")}?apercu=1` },
    ])
  })

  it("n'offre PAS d'aperçu tant que le profil n'a pas d'adresse", () => {
    // Profil jamais publié : promettre un aperçu mènerait sur une fiche qui
    // n'existe pas.
    mocks.me = { published: false }
    renderWithEngine(<ProfilReseauSection />)
    expect(screen.queryByRole("button", { name: /vu par les membres du réseau/i })).toBeNull()
  })

  it("n'offre PAS d'aperçu d'un profil RETIRÉ — l'adresse reste, la fiche est fermée", () => {
    mocks.me = { handle: "m.ndong", published: false }
    renderWithEngine(<ProfilReseauSection />)
    expect(screen.queryByRole("button", { name: /vu par les membres du réseau/i })).toBeNull()
  })

  it("monte « Personnes bloquées » juste après mes listes de confidentialité (PF-01)", () => {
    renderWithEngine(<ProfilReseauSection />)
    const privacy = screen.getByTestId("privacy")
    const blocked = screen.getByTestId("blocked-people")
    expect(privacy.compareDocumentPosition(blocked) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("une panne du profil ne masque pas l'éditeur et n'offre aucun aperçu mort", () => {
    // L'éditeur dit lui-même la panne (sa propre lecture) ; la section ne
    // promet rien qu'elle ne sait pas.
    mocks.meIsError = true
    renderWithEngine(<ProfilReseauSection />)
    expect(screen.getByTestId("publication-card")).toBeTruthy()
    expect(screen.getByTestId("privacy")).toBeTruthy()
    expect(screen.getByTestId("blocked-people")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /vu par les membres du réseau/i })).toBeNull()
  })
})
