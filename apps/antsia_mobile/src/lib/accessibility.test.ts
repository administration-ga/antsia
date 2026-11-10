import { describe, expect, it } from "vitest"
import { nativeCallPresentation, nativeControlState, nativeFieldLabel, nativeModalOpens, nativePagingAllowed } from "./accessibility"

// P18 : scénarios purs écrits, non exécutés ; aucun SDK ni appareil simulé.
describe("accessibilité native : états et présentation", () => {
  it("un geste en attente reste occupé et désactivé, sans perdre les choix faux explicites", () => {
    expect(nativeControlState({ pending: true, selected: false, checked: false })).toEqual({
      disabled: true, busy: true, selected: false, checked: false,
    })
  })
  it("distingue indisponibilité et attente et n'invente pas une sélection", () => {
    expect(nativeControlState({ disabled: true })).toEqual({ disabled: true, busy: false })
    expect(nativeControlState({})).toEqual({ disabled: false, busy: false })
    expect(nativeControlState({ selected: true, checked: true })).toEqual({
      disabled: false, busy: false, selected: true, checked: true,
    })
  })
  it("relie le message d'erreur au nom du champ sans en fabriquer lorsqu'il est absent", () => {
    expect(nativeFieldLabel("Code", "Saisissez six chiffres")).toBe("Code. Saisissez six chiffres")
    expect(nativeFieldLabel("Code")).toBe("Code")
    expect(nativeFieldLabel("Code", "")).toBe("Code")
  })
  it("ne permet la pagination par écran que pour un choix immersif adapté", () => {
    const window = { reducedMotion: false, fontScale: 1, viewportHeight: 640 }
    expect(nativePagingAllowed({ ...window, immersive: true })).toBe(true)
    expect(nativePagingAllowed({ ...window, immersive: false })).toBe(false)
  })
  it("garde un défilement continu avec réduction des mouvements ou texte agrandi", () => {
    const input = { immersive: true, reducedMotion: false, fontScale: 1, viewportHeight: 640 }
    expect(nativePagingAllowed({ ...input, reducedMotion: true })).toBe(false)
    expect(nativePagingAllowed({ ...input, fontScale: 2 })).toBe(false)
    expect(nativePagingAllowed({ ...input, fontScale: 1.3 })).toBe(true)
  })
  it("ne fige pas les petites fenêtres et refuse les dimensions inconnues", () => {
    const input = { immersive: true, reducedMotion: false, fontScale: 1, viewportHeight: 640 }
    expect(nativePagingAllowed({ ...input, viewportHeight: 479 })).toBe(false)
    expect(nativePagingAllowed({ ...input, viewportHeight: 480 })).toBe(true)
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(nativePagingAllowed({ ...input, fontScale: value })).toBe(false)
      expect(nativePagingAllowed({ ...input, viewportHeight: value })).toBe(false)
    }
  })
  it("masque la surface en arrière-plan ou sans appel, même avec un ancien choix réduit", () => {
    expect(nativeCallPresentation({ foreground: false, phase: "connected", minimized: false, busy: true })).toBe("hidden")
    expect(nativeCallPresentation({ foreground: true, phase: "idle", minimized: true, busy: true })).toBe("hidden")
  })
  it("réserve la pastille aux appels encore occupés et présente la fermeture en modale", () => {
    expect(nativeCallPresentation({ foreground: true, phase: "connected", minimized: true, busy: true })).toBe("pill")
    expect(nativeCallPresentation({ foreground: true, phase: "ended", minimized: true, busy: false })).toBe("modal")
    expect(nativeCallPresentation({ foreground: true, phase: "ringing", minimized: false, busy: true })).toBe("modal")
  })
  it("une phase ou un thème modifié dans la même modale ne redemande pas le focus initial", () => {
    expect(nativeModalOpens("hidden", "modal")).toBe(true)
    expect(nativeModalOpens("modal", "modal")).toBe(false)
    expect(nativeModalOpens("modal", "pill")).toBe(false)
    expect(nativeModalOpens("modal", "hidden")).toBe(false)
  })
  it("la restauration volontaire de la pastille ouvre une nouvelle présentation modale", () => {
    expect(nativeModalOpens("pill", "modal")).toBe(true)
    expect(nativeModalOpens("pill", "pill")).toBe(false)
    expect(nativeModalOpens("hidden", "pill")).toBe(false)
  })
})
