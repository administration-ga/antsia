// Dupliqué de socle/packages/agent-features/src/components/espace-kit/EspaceCard.tsx @ ad2e7fdc2 — adaptations : `Card` importé en relatif depuis le paquet (`../components/card`) ; titre, compteur et libellé d'action restent fournis (déjà traduits) par l'appelant ; rendu inchangé. rembourrage de carte opt-in ANTSIA (`--esp-card-padding`), valeurs historiques en repli.
"use client"

import type { ReactNode } from "react"

import { Card } from "../components/card"
import { ESPACE_SURFACE_STYLE } from "./espace-card"

/**
 * La carte de base du kit d'espace : une surface `.esk-card`, un en-tête
 * optionnel (icône, titre, compteur, lien d'action), puis le contenu.
 *
 * Reprend le patron `PanelCard` de `PeoplePanel.tsx` (réseau personnel :
 * surface `Card` du paquet avec `padded={false}`, un `<section>` interne qui
 * porte le vrai rembourrage) — généralisé ici pour être réutilisé hors de la
 * messagerie et du réseau. Aucune chaîne ici : le titre et le libellé
 * d'action arrivent traduits de l'appelant.
 */
export function EspaceCard({
  title,
  count,
  eyebrow = false,
  icon,
  action,
  id,
  children,
}: {
  title: string
  count?: number
  eyebrow?: boolean
  icon?: ReactNode
  action?: { label: string; onClick: () => void }
  id?: string
  children: ReactNode
}) {
  return (
    <Card padded={false} style={ESPACE_SURFACE_STYLE}>
      <section id={id} style={{ padding: eyebrow ? "var(--esp-card-padding, 20px)" : "var(--esp-card-padding, 18px 20px)" }}>
        <header className="esk-card-head">
          {icon ? <span aria-hidden="true">{icon}</span> : null}
          <h2 className={eyebrow ? "esk-eyebrow" : "esk-card-title"}>
            {title}
          </h2>
          {count !== undefined && count > 0 ? (
            <span className="esk-count">{count}</span>
          ) : null}
          {action ? (
            <button
              type="button"
              className="esk-card-action"
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ) : null}
        </header>
        {children}
      </section>
    </Card>
  )
}
