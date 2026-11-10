// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/HandleChoiceCard.tsx @ ad2e7fdc2 — adaptations : l'identifiant se CHOISIT à la publication (rien n'est posé d'office : invariant 7) — la carte n'est plus une confirmation à part (`confirmMyHandle`, retiré du moteur) mais le choix intégré à l'éditeur de `ProfilePublicationCard`, contrôlé par lui (props `displayName`, `value`, `onChoose`, `currentHandle?` au lieu de `currentHandle`, `onConfirmed?`) ; propositions par `people.profile.suggestHandles({ displayName })` à partir du nom SAISI (jamais un état civil), disponibilité de l'identifiant saisi par `people.profile.isHandleAvailable`, toutes deux sur soi et après une pause de frappe (`useDebouncedValue`) ; aucune forme pré-cochée (doctrine gardée) ; textes par l'i18n (`reseau:handleChoiceCard.*`) ; plus de carte imbriquée (le groupe vit dans la carte de l'éditeur).
"use client"

/**
 * Choisir SON identifiant public — au moment de publier.
 *
 * ── Pourquoi ce choix a sa place à lui ────────────────────────────────────
 * L'ADRESSE n'est pas un détail technique : c'est par elle qu'on est trouvé et
 * qu'on se connecte, et elle porte le nom. Le moteur propose des formes à
 * partir du nom affiché que la personne SAISIT (`suggestHandles`) et dit si
 * l'identifiant qu'elle tape est libre POUR ELLE (`isHandleAvailable` : un
 * identifiant porté naguère par une autre personne ne se recycle pas).
 *
 * ⚠️ AUCUNE forme n'est pré-sélectionnée, et c'est le fond de l'écran : les
 * propositions arrivent sans hiérarchie, et en cocher une d'avance ferait du
 * choix une formalité qu'on valide sans lire. Une proposition n'est cochée que
 * si c'est exactement ce que la personne a retenu (ou déjà publié).
 *
 * Le groupe est CONTRÔLÉ par l'éditeur (`ProfilePublicationCard`) : choisir
 * une proposition remplit le champ, et c'est la publication qui confirme.
 * Le serveur reste seul juge à ce moment-là — un identifiant peut être pris
 * entre l'affichage et le clic.
 */

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useDebouncedValue } from "@antsia/ui"
import { useTranslation } from "react-i18next"
import { validateHandle } from "./shared"

/** En deçà, aucune proposition : une lettre seule ne compose pas d'adresse. */
const SUGGEST_MIN_NAME_LENGTH = 2

export interface HandleChoiceCardProps {
  /** Le nom affiché SAISI dans l'éditeur : les propositions en partent. */
  displayName: string
  /** L'identifiant saisi dans l'éditeur (contrôlé par lui). */
  value: string
  /** Retenir une proposition : l'éditeur reprend la valeur. */
  onChoose: (handle: string) => void
  /** L'identifiant déjà publié, s'il y en a un — montré pour ce qu'il est. */
  currentHandle?: string | null
}

export function HandleChoiceCard({
  displayName,
  value,
  onChoose,
  currentHandle = null,
}: HandleChoiceCardProps) {
  const { t } = useTranslation("reseau")
  const name = useDebouncedValue(displayName.trim())
  const suggestions = useAuthenticatedConvexQuery(
    api.modules.people.profile.suggestHandles,
    name.length >= SUGGEST_MIN_NAME_LENGTH ? { displayName: name } : "skip",
  )

  // La disponibilité de ce que la personne TAPE, une fois la frappe posée.
  // Une forme invalide n'est jamais envoyée : le champ dit déjà pourquoi, et
  // le serveur la refuserait par la même règle.
  const typed = value.trim().toLowerCase()
  const settled = useDebouncedValue(typed)
  const isCurrent = currentHandle !== null && settled === currentHandle
  const checkable =
    settled.length > 0 && !isCurrent && validateHandle(settled, t) === null
  const availability = useAuthenticatedConvexQuery(
    api.modules.people.profile.isHandleAvailable,
    checkable ? { handle: settled } : "skip",
  )

  const options = (suggestions.data ?? []).filter((option) => option.available)

  let status: string | null = null
  if (typed.length > 0 && typed === settled) {
    if (isCurrent) status = t("handleChoiceCard.status.current")
    else if (checkable && availability.data !== undefined) {
      status = availability.data.available
        ? t("handleChoiceCard.status.available", { handle: settled })
        : t("handleChoiceCard.status.taken", { handle: settled })
    } else if (checkable && availability.isFetching) {
      status = t("handleChoiceCard.status.checking")
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <fieldset
        style={{
          border: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <legend
          style={{
            padding: 0,
            marginBottom: 6,
            fontSize: 13,
            fontWeight: 700,
            color: "var(--ink-900)",
          }}
        >
          {t("handleChoiceCard.legend")}
        </legend>

        {name.length < SUGGEST_MIN_NAME_LENGTH ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--ink-500)" }}>
            {t("handleChoiceCard.needName")}
          </p>
        ) : suggestions.isLoading ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--ink-500)" }}>
            {t("handleChoiceCard.loading")}
          </p>
        ) : suggestions.isError ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--ink-500)" }}>
            {t("handleChoiceCard.error")}
          </p>
        ) : options.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--ink-500)" }}>
            {t("handleChoiceCard.none")}
          </p>
        ) : (
          options.map((option) => (
            <label
              key={option.handle}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 11px",
                borderRadius: "var(--esp-primitive-chip-radius, 10px)",
                border:
                  typed === option.handle
                    ? "1px solid var(--primary-600)"
                    : "1px solid var(--border)",
                background:
                  typed === option.handle
                    ? "var(--primary-50)"
                    : "var(--card)",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="reseau-handle-choice"
                value={option.handle}
                checked={typed === option.handle}
                onChange={() => onChoose(option.handle)}
              />
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 13.5,
                  color: "var(--ink-900)",
                }}
              >
                @{option.handle}
              </span>
              {option.handle === currentHandle ? (
                <span style={{ fontSize: 12, color: "var(--ink-500)" }}>
                  {t("handleChoiceCard.currentTag")}
                </span>
              ) : null}
            </label>
          ))
        )}
      </fieldset>

      {/* Ce que le serveur dit de l'identifiant tapé — annoncé sans voler le
          focus du champ. */}
      <p
        role="status"
        aria-live="polite"
        style={{ margin: 0, minHeight: 18, fontSize: 12.5, color: "var(--ink-600)" }}
      >
        {status ?? ""}
      </p>
    </div>
  )
}
