// Dupliqué de socle/packages/ui-v2/src/components/card.tsx @ ad2e7fdc2 — adaptations : en-tête de provenance ; contour lu dans `--esp-surface-border` et rayon dans `--ui2-card-radius` (ADR-0027), filet et rayon d'origine en repli. ombre et rembourrage opt-in ANTSIA (`--esp-surface-shadow`, `--esp-card-padding`), valeurs historiques en repli.
"use client"

import type { CSSProperties, MouseEventHandler, ReactNode } from "react"

export interface CardProps {
  children?: ReactNode
  className?: string
  style?: CSSProperties
  padded?: boolean
  hover?: boolean
  onClick?: MouseEventHandler<HTMLDivElement>
}

export const Card = ({
  children,
  className,
  style,
  padded = true,
  hover = false,
  onClick,
}: CardProps) => (
  <div
    data-slot="card"
    className={className}
    onClick={onClick}
    style={{
      background: "var(--ink-0)",
      // Aucun contour quand le thème distingue déjà la carte du fond (ADR-0027).
      border: "1px solid var(--esp-surface-border, var(--ink-200))",
      borderRadius: "var(--ui2-card-radius, var(--radius-lg))",
      // Les chartes ANTSIA fixent 16 px à toutes les largeurs. Le repli
      // historique garde son rembourrage responsive pour les autres réseaux.
      padding: padded ? "var(--esp-card-padding, var(--ui2-card-pad, 24px))" : 0,
      boxShadow: "var(--esp-surface-shadow, var(--shadow-xs))",
      cursor: hover || onClick ? "pointer" : "default",
      transition: "border-color .12s, box-shadow .12s",
      ...style,
    }}
  >
    {children}
  </div>
)
