// Écrit pour le moteur (lot P02 de l'étude social-commerce du 18/10/2026) : l'en-tête du téléphone sous la navigation par destinations — la recherche et la cloche restent, la porte d'iCom et la pastille du profil (destinations de la barre) quittent l'en-tête ; ADR-0028 : l'en-tête des chartes (recherche, cloche, messages).
// @vitest-environment jsdom

import { NetworkProvider, type EngineRoutes } from "@antsia/api/network"
import { RouterProvider } from "@antsia/api/routing"
import { fireEvent, render, screen } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import { createAppI18n } from "../../i18n"
import { memoryRouter, TEST_NETWORK_ID, TEST_PERSON_ID, TEST_ROUTES } from "../../tests/engine-wrapper"

/* La cloche a sa tranche : réduite ici à un repère, pour vérifier qu'elle RESTE. */
const BELL = vi.hoisted(() => ({ label: "Cloche simulée" }))
vi.mock("../../features/notifications/NotificationBell", () => ({
  NotificationBell: () => <button type="button">{BELL.label}</button>,
}))

import { ReseauMobileHeader } from "./ReseauMobileHeader"

const ROUTES: EngineRoutes = { ...TEST_ROUTES, discover: () => "/explorer", me: () => "/moi" }

describe("ReseauMobileHeader — navigation par destinations (P02)", () => {
  it("garde la recherche et la cloche, sans la porte d'iCom ni la pastille du profil", () => {
    const onSearch = vi.fn()
    const i18n = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "social" })
    render(
      <I18nextProvider i18n={i18n}>
        <RouterProvider implementation={memoryRouter({ pathname: TEST_ROUTES.home() }).implementation}>
          <NetworkProvider networkId={TEST_NETWORK_ID} slug="test" personId={TEST_PERSON_ID} charte="antsia" routes={ROUTES} navigation="destinations">
            <ReseauMobileHeader
              onSearch={onSearch}
              searchQuery=""
              profileHref={TEST_ROUTES.profile("awa.ndong")}
              avatarUrl={null}
              displayName="Awa Ndong"
              unreadMessages={2}
            />
          </NetworkProvider>
        </RouterProvider>
      </I18nextProvider>,
    )
    expect(screen.queryByRole("link", { name: /Ouvrir iCom/ })).toBeNull()
    expect(screen.queryByRole("link", { name: "Voir mon profil" })).toBeNull()
    expect(screen.getByRole("button", { name: BELL.label })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir la recherche" }))
    fireEvent.change(screen.getByRole("searchbox", { name: "Chercher dans les publications" }), { target: { value: "santé" } })
    fireEvent.click(screen.getByRole("button", { name: "Lancer la recherche" }))
    expect(onSearch).toHaveBeenCalledWith("santé")
  })

  function header(wordmark?: string) {
    const i18n = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "social" })
    return (
      <I18nextProvider i18n={i18n}>
        <RouterProvider implementation={memoryRouter({ pathname: TEST_ROUTES.home() }).implementation}>
          <NetworkProvider networkId={TEST_NETWORK_ID} slug="test" personId={TEST_PERSON_ID} charte="antsia" routes={ROUTES} navigation="destinations" wordmark={wordmark}>
            <ReseauMobileHeader onSearch={vi.fn()} searchQuery="" profileHref={null} avatarUrl={null} displayName="Awa Ndong" />
          </NetworkProvider>
        </RouterProvider>
      </I18nextProvider>
    )
  }

  it("la marque déclarée par l'application, et son point, remplacent le libellé neutre (ADR-0027)", () => {
    const view = render(header("ANTSIA"))
    const wordmark = view.container.querySelector(".rm-wordmark")!
    expect(wordmark.textContent).toBe("ANTSIA")
    expect(wordmark.hasAttribute("data-brand")).toBe(true)
    expect(wordmark.querySelector(".rm-wordmark-dot")?.getAttribute("aria-hidden")).toBe("true")
    // Un libellé visuel, jamais un second titre.
    expect(view.container.querySelector("h1")).toBeNull()
  })

  it("l'en-tête des chartes (ADR-0028) : recherche, cloche, messages dans cet ordre, sans bascule clair/sombre", () => {
    const i18n = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "social" })
    const view = render(
      <I18nextProvider i18n={i18n}>
        <RouterProvider implementation={memoryRouter({ pathname: TEST_ROUTES.home() }).implementation}>
          <NetworkProvider networkId={TEST_NETWORK_ID} slug="test" personId={TEST_PERSON_ID} charte="antsia" routes={ROUTES} navigation="destinations" postPresentation="charte" wordmark="ANTSIA">
            <ReseauMobileHeader onSearch={vi.fn()} searchQuery="" profileHref={TEST_ROUTES.profile("awa.ndong")} avatarUrl={null} displayName="Awa Ndong" unreadMessages={2} />
          </NetworkProvider>
        </RouterProvider>
      </I18nextProvider>,
    )
    const header = view.container.querySelector("header")!
    expect(header.getAttribute("data-presentation")).toBe("charte")
    const search = screen.getByRole("button", { name: "Ouvrir la recherche" })
    const bell = screen.getByRole("button", { name: BELL.label })
    // La porte des messages reste, pastille comprise, même sous les destinations.
    const messages = screen.getByRole("link", { name: "Ouvrir iCom — 2 conversations non lues" })
    expect(messages).toHaveAttribute("href", TEST_ROUTES.messages())
    expect(header.querySelectorAll("button, a")).toHaveLength(3)
    expect(search.compareDocumentPosition(bell) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(bell.compareDocumentPosition(messages) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(screen.queryByRole("button", { name: /sombre/i })).toBeNull()
    expect(screen.queryByRole("link", { name: "Voir mon profil" })).toBeNull()
  })

  it("sans marque déclarée, le libellé neutre du moteur, sans point", () => {
    const view = render(header())
    const wordmark = view.container.querySelector(".rm-wordmark")!
    expect(wordmark.textContent).toBe("Réseau")
    expect(wordmark.hasAttribute("data-brand")).toBe(false)
    expect(wordmark.querySelector(".rm-wordmark-dot")).toBeNull()
  })

  it("U09 : sous l'opt-in adaptatif, aucune porte Messages, même avec l'en-tête des chartes", () => {
    const i18n = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "social" })
    render(
      <I18nextProvider i18n={i18n}>
        <RouterProvider implementation={memoryRouter({ pathname: TEST_ROUTES.home() }).implementation}>
          <NetworkProvider networkId={TEST_NETWORK_ID} slug="test" personId={TEST_PERSON_ID} charte="antsia" routes={ROUTES} navigation="destinations" navigationLayout="adaptive" postPresentation="charte" wordmark="ANTSIA">
            <ReseauMobileHeader onSearch={vi.fn()} searchQuery="" profileHref={null} avatarUrl={null} displayName="Awa Ndong" unreadMessages={3} />
          </NetworkProvider>
        </RouterProvider>
      </I18nextProvider>,
    )
    expect(screen.queryByRole("link", { name: /Ouvrir iCom/ })).toBeNull()
    expect(screen.getByRole("button", { name: BELL.label })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Ouvrir la recherche" })).toBeTruthy()
  })
})
