// Réécrit d'après socle/packages/agent-features/src/features/messagerie/IcomMobileTabBar.test.tsx @ ad2e7fdc2 — le menu principal de l'espace agent n'existe plus : le premier emplacement est un LIEN fixe vers l'accueil du réseau (le cas « Menu fixe pendant que le niveau de droite bascule » devient « Menu fixe qui ramène à l'accueil, briques défilantes ») ; montage dans l'enveloppe du moteur (routeur, routes et i18n réels) au lieu de simuler le routage, `@antsia/ui` et le chrome de l'espace ; cas ajoutés — adresses injectées, pastilles et leur phrase, repères DOM et seuil mobile.
// @vitest-environment jsdom

import { screen, within } from "@testing-library/react"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { MOBILE_ONLY_CLASS } from "@antsia/ui/overlay"
import { renderWithEngine } from "../../tests/engine-wrapper"
import { IcomMobileTabBar } from "./IcomMobileTabBar"

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

describe("IcomMobileTabBar", () => {
  it("garde Menu fixe, qui ramène à l'accueil du réseau, et les briques à sa droite", () => {
    renderWithEngine(
      <IcomMobileTabBar active="ichat" badges={{ unreadMessages: 2, unseenActus: 1 }} />,
    )

    const menu = screen.getByRole("link", { name: "Revenir au menu principal" })
    // L'accueil de l'APPLICATION (routes de test), jamais une adresse écrite.
    expect(menu.getAttribute("href")).toBe("/fil")
    expect(menu.textContent).toContain("Menu")

    const briques = screen.getByRole("group", { name: "Sous-menus iCom" })
    // Le menu n'est PAS l'une des briques : il ne défile jamais avec elles.
    expect(briques.contains(menu)).toBe(false)
    const liens = within(briques).getAllByRole("link")
    expect(liens.map((lien) => lien.querySelector(".rm-tab-label")?.textContent)).toEqual([
      "iChat",
      "Statuts",
      "iAppel",
      "Relations",
    ])
    expect(
      screen.getByRole("link", { name: /iChat/i }).getAttribute("aria-current"),
    ).toBe("page")
  })

  it("compose les adresses depuis la base de la messagerie — iChat nu, les autres par ?brique=", () => {
    renderWithEngine(<IcomMobileTabBar active="iappel" badges={{}} />)
    const briques = within(screen.getByRole("group", { name: "Sous-menus iCom" }))
    expect(briques.getByRole("link", { name: /iChat/ }).getAttribute("href")).toBe("/messages")
    expect(briques.getByRole("link", { name: /Statuts/ }).getAttribute("href")).toBe("/messages?brique=actus")
    expect(briques.getByRole("link", { name: /iAppel/ }).getAttribute("href")).toBe("/messages?brique=iappel")
    expect(briques.getByRole("link", { name: /Relations/ }).getAttribute("href")).toBe("/messages?brique=icontact")
    expect(briques.getByRole("link", { name: /iAppel/ }).getAttribute("aria-current")).toBe("page")
    expect(briques.getByRole("link", { name: /iChat/ }).getAttribute("aria-current")).toBeNull()
  })

  it("chaque pastille dit sa phrase — jamais un chiffre nu, jamais additionnées", () => {
    renderWithEngine(
      <IcomMobileTabBar active="ichat" badges={{ unreadMessages: 2, unseenActus: 1 }} />,
    )
    // Le nom accessible du lien = libellé visible + phrase `sr-only`.
    expect(screen.getByRole("link", { name: /iChat.*2 messages non lus/ })).toBeTruthy()
    expect(screen.getByRole("link", { name: /Statuts.*1 statut non vu/ })).toBeTruthy()
    expect(screen.getByRole("link", { name: "iAppel" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Relations" })).toBeTruthy()
  })

  it("IC-02 : iAppel porte les messages vocaux non écoutés, avec leur phrase", () => {
    renderWithEngine(
      <IcomMobileTabBar active="ichat" badges={{ unreadMessages: 2, unheardVoicemails: 3 }} />,
    )
    const appels = screen.getByRole("link", { name: /iAppel.*3 messages vocaux non écoutés/ })
    expect(appels.querySelector(".rm-tab-badge")?.textContent).toBe("3")
    expect(screen.getByRole("link", { name: /iChat.*2 messages non lus/ })).toBeTruthy()
  })

  it("porte les repères mesurés par les surfaces flottantes et ne se montre qu'au téléphone", () => {
    renderWithEngine(<IcomMobileTabBar active="ichat" badges={{}} />)
    const barre = screen.getByRole("navigation", { name: "Navigation iCom" })
    expect(barre.hasAttribute("data-mobile-nav")).toBe(true)
    expect(barre.hasAttribute("data-icom-mobile-nav")).toBe(true)
    expect(barre.className).toContain(MOBILE_ONLY_CLASS)
  })
})
