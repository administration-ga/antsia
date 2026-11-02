// Dupliqué de socle/packages/ui-v2/src/components/skeleton.tsx @ ad2e7fdc2 — adaptations : aucune (copie textuelle) ; en-tête de provenance. carte statistique raccordée aux jetons opt-in ANTSIA de carte, contour et rembourrage, valeurs historiques en repli.
"use client"

import type { CSSProperties, ReactNode } from "react"
import { Card } from "./card"
import { Table, Th, Td, Tr } from "./table"

/**
 * Primitives de chargement (skeletons) pour les écrans authentifiés réactifs
 * (ADR-0014). Le shimmer est porté par la classe `.gc-skeleton` (tokens.css),
 * theme-aware et désactivée sous `prefers-reduced-motion`.
 *
 * Tous ces blocs sont purement décoratifs → `aria-hidden`. Pense à donner au
 * conteneur de la zone en chargement un `aria-busy="true"` côté écran.
 */

export interface SkeletonProps {
  width?: number | string
  height?: number | string
  radius?: number | string
  circle?: boolean
  style?: CSSProperties
}

/** Bloc de chargement animé. */
export const Skeleton = ({
  width = "100%",
  height = 14,
  radius,
  circle = false,
  style,
}: SkeletonProps) => (
  <span
    aria-hidden="true"
    className="gc-skeleton"
    style={{
      display: "block",
      width,
      height,
      borderRadius: circle ? "50%" : (radius ?? "var(--radius-sm)"),
      flexShrink: 0,
      ...style,
    }}
  />
)

export interface SkeletonTextProps {
  lines?: number
  gap?: number
  lastWidth?: number | string
  lineHeight?: number
  style?: CSSProperties
}

/** Plusieurs lignes de texte simulées ; la dernière est plus courte. */
export const SkeletonText = ({
  lines = 3,
  gap = 8,
  lastWidth = "60%",
  lineHeight = 12,
  style,
}: SkeletonTextProps) => (
  <span
    aria-hidden="true"
    style={{ display: "flex", flexDirection: "column", gap, ...style }}
  >
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton
        key={i}
        height={lineHeight}
        width={i === lines - 1 ? lastWidth : "100%"}
      />
    ))}
  </span>
)

export interface SkeletonCardProps {
  lines?: number
  style?: CSSProperties
  children?: ReactNode
}

/** Carte de chargement — même cadre visuel que <Card>. */
export const SkeletonCard = ({ lines = 3, style, children }: SkeletonCardProps) => (
  <Card style={style}>
    {children ?? (
      <span
        aria-hidden="true"
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <Skeleton height={16} width="40%" />
        <SkeletonText lines={lines} />
      </span>
    )}
  </Card>
)

/** Carte statistique de chargement — mêmes dimensions que <StatCard>. */
export const SkeletonStatCard = ({ style }: { style?: CSSProperties }) => (
  <div
    aria-hidden="true"
    style={{
      background: "var(--ink-0)",
      border: "1px solid var(--esp-primitive-surface-border, var(--ink-200))",
      borderRadius: "var(--esp-primitive-card-radius, 8px)",
      padding: "var(--esp-card-padding, 20px)",
      display: "flex",
      flexDirection: "column",
      gap: 10,
      ...style,
    }}
  >
    <Skeleton height={12} width="55%" />
    <Skeleton height={28} width="35%" />
  </div>
)

export interface SkeletonTableProps {
  rows?: number
  columns?: number
  /** En-têtes réels (rendus en <Th>) ; si fourni, fixe aussi le nb de colonnes. */
  headers?: ReactNode[]
}

/** Tableau de chargement — réutilise <Table>/<Th>/<Td>. */
export const SkeletonTable = ({ rows = 5, columns = 4, headers }: SkeletonTableProps) => {
  const colCount = headers?.length ?? columns
  return (
    <Table>
      {headers && (
        <thead>
          <tr>
            {headers.map((h, i) => (
              <Th key={i} scope="col">
                {h}
              </Th>
            ))}
          </tr>
        </thead>
      )}
      <tbody aria-busy="true">
        {Array.from({ length: rows }).map((_, r) => (
          <Tr key={r}>
            {Array.from({ length: colCount }).map((_, c) => (
              <Td key={c}>
                <Skeleton height={12} width={c === 0 ? "70%" : "45%"} />
              </Td>
            ))}
          </Tr>
        ))}
      </tbody>
    </Table>
  )
}
