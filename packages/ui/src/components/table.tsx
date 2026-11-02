// Dupliqué de socle/packages/ui-v2/src/components/table.tsx @ ad2e7fdc2 — adaptations : aucune (copie textuelle) ; en-tête de provenance. cadre raccordé aux jetons opt-in ANTSIA de carte et contour, valeurs historiques en repli.
"use client"

import type { CSSProperties, MouseEventHandler, ReactNode } from "react"
import { Icon } from "./icon"

export interface TableProps {
  children: ReactNode
  /** Nom de la région défilable, annoncé au clavier et au lecteur d’écran. */
  ariaLabel?: string
  /** Largeur minimale du tableau seulement ; la page reste toujours bornée. */
  minWidth?: number
}

export const Table = ({
  children,
  ariaLabel = "Tableau de données",
  minWidth,
}: TableProps) => (
  <div
    role="region"
    aria-label={ariaLabel}
    tabIndex={0}
    style={{
      width: "100%",
      maxWidth: "100%",
      minWidth: 0,
      overflowX: "auto",
      overflowY: "visible",
      overscrollBehaviorX: "contain",
      border: "1px solid var(--esp-primitive-surface-border, var(--ink-200))",
      borderRadius: "var(--esp-primitive-card-radius, 8px)",
      background: "var(--ink-0)",
    }}
  >
    <table
      style={{
        width: "100%",
        minWidth,
        borderCollapse: "collapse",
        fontSize: 13,
      }}
    >
      {children}
    </table>
  </div>
)

export interface ThProps {
  children?: ReactNode
  sortable?: boolean
  align?: "left" | "center" | "right"
  /** Portée d'en-tête a11y (RGAA / WCAG) : "col" (par défaut), "row", "colgroup", "rowgroup". */
  scope?: "col" | "row" | "colgroup" | "rowgroup"
  style?: CSSProperties
}

export const Th = ({
  children,
  sortable,
  align = "left",
  scope = "col",
  style,
}: ThProps) => (
  <th
    scope={scope}
    style={{
      textAlign: align,
      padding: "10px 12px",
      fontSize: 11,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      color: "var(--ink-600)",
      borderBottom: "1px solid var(--ink-200)",
      background: "var(--ink-50)",
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {children}
      {sortable && (
        <Icon name="chevronDown" size={11} style={{ color: "var(--ink-400)" }} />
      )}
    </span>
  </th>
)

export interface TdProps {
  children?: ReactNode
  align?: "left" | "center" | "right"
  style?: CSSProperties
  colSpan?: number
}

export const Td = ({ children, align = "left", style, colSpan }: TdProps) => (
  <td
    colSpan={colSpan}
    style={{
      padding: "12px",
      textAlign: align,
      borderBottom: "1px solid var(--ink-150)",
      color: "var(--ink-800)",
      verticalAlign: "middle",
      ...style,
    }}
  >
    {children}
  </td>
)

export interface TrProps {
  children?: ReactNode
  onClick?: MouseEventHandler<HTMLTableRowElement>
  selected?: boolean
}

/**
 * Une ligne cliquable est une commande : sans `tabIndex`/`role`, elle
 * n'existe ni au clavier ni pour un lecteur d'écran — la file d'instruction
 * du back-office n'ouvrait aucun dossier sans souris. Le clavier déclenche la
 * même action que le clic (Entrée et Espace, comme un bouton natif).
 */
export const Tr = ({ children, onClick, selected }: TrProps) => (
  <tr
    onClick={onClick}
    tabIndex={onClick ? 0 : undefined}
    role={onClick ? "button" : undefined}
    onKeyDown={
      onClick
        ? (e) => {
            if (e.key !== "Enter" && e.key !== " ") return
            // Espace fait défiler la page par défaut : la ligne agit, la page
            // ne bouge pas sous les doigts de qui vient de l'activer.
            e.preventDefault()
            onClick(e as unknown as Parameters<typeof onClick>[0])
          }
        : undefined
    }
    style={{
      cursor: onClick ? "pointer" : "default",
      background: selected ? "var(--primary-50)" : "transparent",
    }}
    onMouseEnter={
      onClick
        ? (e) => {
            ;(e.currentTarget as HTMLTableRowElement).style.background = selected
              ? "var(--primary-100)"
              : "var(--ink-50)"
          }
        : undefined
    }
    onMouseLeave={
      onClick
        ? (e) => {
            ;(e.currentTarget as HTMLTableRowElement).style.background = selected
              ? "var(--primary-50)"
              : "transparent"
          }
        : undefined
    }
  >
    {children}
  </tr>
)
