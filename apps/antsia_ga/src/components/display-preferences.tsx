"use client"

import { AppearanceControl } from "@antsia/social-features/shell/appearance"
import { useTranslation } from "react-i18next"

import { MotifPicker } from "./motif-picker"
import { ThemePicker } from "./theme-picker"

/**
 * L'AFFICHAGE : apparence (système, clair, sombre), thème et motif de fond,
 * trois choix immédiats, sans bouton d'enregistrement. Rendu par la page
 * Paramètres et par « Mes données » (qui reste ouverte à une personne
 * suspendue). `leadingSeparator` : un filet au-dessus du premier bloc, quand
 * l'affichage suit un autre contenu dans la même carte.
 */
export function DisplayPreferences({ leadingSeparator = true }: { leadingSeparator?: boolean }) {
  const { t } = useTranslation("antsia")
  return (
    <>
      <div className={leadingSeparator ? "min-w-0 border-t border-border pt-4" : "min-w-0"}>
        <AppearanceControl showTheme={false} />
        <p className="mt-1 text-xs text-muted-foreground">{t("preferences.appearanceHint")}</p>
      </div>
      <div className="min-w-0 border-t border-border pt-4">
        <ThemePicker />
      </div>
      <div className="min-w-0 border-t border-border pt-4">
        <MotifPicker />
      </div>
    </>
  )
}
