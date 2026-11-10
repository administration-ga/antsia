// Dupliqué de socle/packages/ui-v2/src/components/theme-toggle.tsx @ 25398f565 — adaptations : sélecteur natif nommé plutôt que bascule à deux états ; retour système toujours disponible, état commun du provider, phrases par i18n et jetons du moteur, cible 44 px et focus visible ; ADR-0030 : un second sélecteur, le THÈME, quand l'application nomme ses thèmes (`themeName`) — enregistré sur le compte en session (`useThemeChoice`), sur l'appareil sinon ; angle des champs du système épuré (`--esp-field-radius`), angle d'origine en repli.
"use client"

import { useId } from "react"
import { useTranslation } from "react-i18next"

import { useOptionalAppearance, type AppearanceMode } from "./provider"
import { useThemeChoice } from "./theme-choice"

const LABEL = "grid gap-1.5 px-2.5 py-2 text-sm font-semibold text-foreground"
/* Un champ du système épuré : angle des champs (14 px dans les thèmes ANTSIA), contour de
   contrôle à 3:1 (`--input`, correctifs P18b), gardé par décision du propriétaire. */
const SELECT = "min-h-11 w-full rounded-[var(--esp-field-radius,var(--radius))] border border-input bg-card px-3 text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"

/** Le nuancier complet des réglages possède déjà son choix de thème. */
export function AppearanceControl({ showTheme = true }: { showTheme?: boolean } = {}) {
  const appearance = useOptionalAppearance()
  const choose = useThemeChoice()
  const { t } = useTranslation("shell")
  const id = useId()
  if (appearance === null) return null
  const themeName = appearance.themeName
  /* Le thème ne se propose ici que si l'application en nomme plusieurs : sans nom
     dans la langue de la personne, un identifiant brut n'est pas un choix. */
  const themed = showTheme && themeName !== null && appearance.themes.length > 1
  const selectTheme = choose ?? appearance.setTheme

  return (
    <div className="grid">
      <label htmlFor={id} className={LABEL}>
        <span>{t("appearance.label")}</span>
        <select
          id={id}
          value={appearance.mode}
          onChange={(event) => appearance.setMode(event.currentTarget.value as AppearanceMode)}
          style={{ font: "inherit" }}
          className={SELECT}
        >
          <option value="system">{t("appearance.system")}</option>
          <option value="light">{t("appearance.light")}</option>
          <option value="dark">{t("appearance.dark")}</option>
        </select>
      </label>
      {themed ? (
        <label htmlFor={`${id}-theme`} className={LABEL}>
          <span>{t("appearance.theme")}</span>
          <select
            id={`${id}-theme`}
            value={appearance.theme ?? ""}
            onChange={(event) => selectTheme(event.currentTarget.value)}
            style={{ font: "inherit" }}
            className={SELECT}
          >
            {appearance.themes.map((entry) => (
              <option key={entry.id} value={entry.id}>{themeName(entry.id)}</option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  )
}
