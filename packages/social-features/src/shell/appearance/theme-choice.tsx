"use client"

import { createContext, type ReactNode, useContext } from "react"

/** Choisir un thème : appliqué tout de suite, enregistré là où l'application le décide. */
export type ThemeChoice = (theme: string) => void

const ThemeChoiceContext = createContext<ThemeChoice | null>(null)

/**
 * Le choix de thème EN SESSION, fourni par l'application (enregistré sur le compte
 * puis appliqué à l'appareil, ADR-0026) : `null` hors session ou sans fournisseur,
 * et les sélecteurs — Préférences > Thème, le rail (`AppearanceControl`) —
 * retombent sur la mémoire de l'appareil (`setTheme` du fournisseur d'apparence).
 */
export function useThemeChoice(): ThemeChoice | null {
  return useContext(ThemeChoiceContext)
}

/** Monté par l'application sous sa session ; `choose` nul hors session. */
export function ThemeChoiceProvider({ choose, children }: { choose: ThemeChoice | null; children: ReactNode }) {
  return <ThemeChoiceContext.Provider value={choose}>{children}</ThemeChoiceContext.Provider>
}
