import type { CSSProperties } from "react"

/** Actions sociales compactes (Suivre, Ajouter, Écrire, Accepter…) : angle modéré
 * ANTSIA, repli du réseau consommateur. La couleur reste portée par la variante
 * métier du bouton. Les filtres et la navigation gardent leur propre géométrie.
 *
 * Hauteur de 25 px (étude du 22/10/2026, décision du propriétaire : « divise-les
 * par deux », 44 px auparavant). Elle reste au-dessus du minimum de 24 px des
 * cibles (WCAG 2.2, 2.5.8). Le libellé peut passer à la ligne au zoom : la hauteur
 * est un minimum, jamais une hauteur figée. */
export const COMPACT_SOCIAL_ACTION_STYLE: CSSProperties = {
  borderRadius: "var(--esp-social-action-radius, var(--ui2-button-radius, 6px))",
  minHeight: 25,
  padding: "3px 10px",
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1.25,
  whiteSpace: "normal",
  textAlign: "center",
}
