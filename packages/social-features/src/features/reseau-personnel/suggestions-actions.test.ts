// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/suggestions-actions.test.ts @ ad2e7fdc2 — adaptations : libellés lus dans l'i18n du moteur (`t` français, passé en dernier paramètre ; `busy` explicite pour `relationActionLabel`) ; cas neuf : les mêmes états se disent en anglais avec les mêmes clés ; tous les cas du socle gardés ; ADR-0037 : clé du geste Suivre et cartes retenues après un suivi.
import { describe, expect, it } from "vitest"

import { createAppI18n } from "../../i18n"
import {
  connectButtonLabel,
  followActionKey,
  offersInvitationAnswer,
  relationActionDisabled,
  relationActionLabel,
  suggestionActionState,
  visibleSuggestions,
  withRetainedSuggestions,
} from "./suggestions-actions"

const t = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "reseau" }).getFixedT("fr")
const tEn = createAppI18n({ locale: "en", appResources: { fr: {}, en: {} }, defaultNS: "reseau" }).getFixedT("en")

describe("suggestionActionState", () => {
  it("idle par défaut — rien en cours, rien d'abouti", () => {
    expect(suggestionActionState("alice", null, new Set())).toBe("idle")
  })

  it("busy uniquement pour le handle EN COURS d'appel", () => {
    expect(suggestionActionState("alice", "alice", new Set())).toBe("busy")
    expect(suggestionActionState("bob", "alice", new Set())).toBe("idle")
  })

  it("done l'emporte sur busy — l'action est déjà aboutie", () => {
    expect(suggestionActionState("alice", "alice", new Set(["alice"]))).toBe("done")
  })

  it("done indépendant du handle occupé par ailleurs", () => {
    expect(suggestionActionState("alice", "bob", new Set(["alice"]))).toBe("done")
  })
})

describe("visibleSuggestions", () => {
  const items = [{ handle: "alice" }, { handle: "bob" }]

  it("retire uniquement les personnes masquées pour la session", () => {
    expect(visibleSuggestions(items, new Set(["alice"]))).toEqual([{ handle: "bob" }])
  })

  it("aucune suppression → la liste reste intacte", () => {
    expect(visibleSuggestions(items, new Set())).toEqual(items)
  })

  it("ne mute pas le tableau reçu", () => {
    const copy = [...items]
    visibleSuggestions(items, new Set(["alice"]))
    expect(items).toEqual(copy)
  })
})

describe("connectButtonLabel", () => {
  it("présente l'action réciproque avec un état d'attente explicite", () => {
    expect(connectButtonLabel("idle", t)).toBe("Se connecter")
    expect(connectButtonLabel("busy", t)).toBe("Connexion…")
  })

  it("confirme la demande une fois partie", () => {
    expect(connectButtonLabel("done", t)).toBe("Demande envoyée")
  })

  it("se dit dans la langue de l'écran, avec les mêmes clés", () => {
    expect(connectButtonLabel("idle", tEn)).toBe("Connect")
    expect(connectButtonLabel("done", tEn)).toBe("Request sent")
  })
})

describe("l'état relationnel vient du SERVEUR (R-05)", () => {
  it("« Demande envoyée » survit au rechargement — plus un `useState`", () => {
    // Le défaut : au montage suivant, l'état local était perdu et la carte
    // reproposait « Se connecter » alors que la demande était en base.
    expect(relationActionLabel("requested_by_me", false, t)).toBe("Demande envoyée")
    expect(relationActionDisabled("requested_by_me")).toBe(true)
  })

  it("une invitation REÇUE ne se répond pas par une seconde demande", () => {
    expect(relationActionLabel("requested_by_them", false, t)).toBe("Invitation reçue")
    expect(relationActionDisabled("requested_by_them")).toBe(true)
    expect(offersInvitationAnswer("requested_by_them")).toBe(true)
  })

  it("sans demande en attente, le geste reste ouvert", () => {
    expect(relationActionLabel("none", false, t)).toBe("Se connecter")
    expect(relationActionDisabled("none")).toBe(false)
    expect(offersInvitationAnswer("none")).toBe(false)
    expect(offersInvitationAnswer("requested_by_me")).toBe(false)
  })

  it("l'aller-retour en cours se dit, sans effacer l'état serveur", () => {
    expect(relationActionLabel("none", true, t)).toBe("Connexion…")
    expect(relationActionDisabled("none", true)).toBe(true)
    // `busy` ne peut pas rendre un état serveur plus permissif.
    expect(relationActionLabel("requested_by_me", true, t)).toBe("Demande envoyée")
  })
})

describe("Suivre ou être ami (ADR-0037)", () => {
  it("Suivre, Suivre en retour quand la personne vous suit, Suivi une fois suivie", () => {
    expect(followActionKey({ following: false, followsYou: false })).toBe("follow")
    expect(followActionKey({ following: false, followsYou: true })).toBe("followBack")
    expect(followActionKey({ following: true, followsYou: true })).toBe("following")
    expect(followActionKey({ following: true, followsYou: false })).toBe("following")
  })

  it("une carte suivie reste à sa place quand le catalogue l'écarte, jamais en double", () => {
    const row = (handle: string) => ({ handle })
    const served = [row("a"), row("c"), row("d")]
    expect(withRetainedSuggestions(served, [{ row: row("b"), index: 1 }]).map((item) => item.handle)).toEqual(["a", "b", "c", "d"])
    // Le serveur la rend de nouveau (suivi retiré) : elle n'est pas doublée.
    expect(withRetainedSuggestions([row("a"), row("b"), row("c")], [{ row: row("b"), index: 1 }]).map((item) => item.handle)).toEqual(["a", "b", "c"])
    // Une place au-delà de la liste tombe à la fin ; deux cartes gardent leur ordre.
    expect(withRetainedSuggestions([row("a")], [{ row: row("z"), index: 9 }, { row: row("y"), index: 0 }]).map((item) => item.handle)).toEqual(["y", "a", "z"])
  })
})
