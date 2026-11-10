import type { CSSProperties } from "react"

type HistoricalVariant = "primary" | "secondary" | "ghost" | "link" | "social"
type ActionRole = "cancel" | "success" | "danger"

const HISTORICAL_STYLES: Record<HistoricalVariant, CSSProperties> = {
  primary: {
    background: "var(--primary-fill)",
    color: "var(--primary-fill-on, var(--on-fill))",
    border: "1px solid var(--primary-fill)",
  },
  secondary: {
    background: "var(--ui2-button-secondary-bg, var(--ink-0))",
    color: "var(--ui2-button-secondary-fg, var(--primary-500))",
    border: "1px solid var(--ui2-button-secondary-border, var(--primary-500))",
  },
  ghost: { background: "transparent", color: "var(--ink-700)", border: "1px solid transparent" },
  link: { background: "transparent", color: "var(--primary-500)", border: "1px solid transparent" },
  social: {
    background: "var(--role-social-fill, var(--primary-fill))",
    color: "var(--role-social-on, var(--primary-fill-on, var(--on-fill)))",
    border: "1px solid transparent",
  },
}

/**
 * Couleur métier opt-in : les sept chartes ANTSIA déclarent les jetons de rôle.
 * Les réseaux consommateurs gardent exactement le fond, l'encre et le contour
 * du bouton qu'ils avaient, y compris les styles posés par l'appelant.
 */
export function themedActionStyle(role: ActionRole, historicalVariant: HistoricalVariant, historicalStyle: CSSProperties = {}): CSSProperties {
  const fallback = { ...HISTORICAL_STYLES[historicalVariant], ...historicalStyle }
  const borderColor = String(fallback.border).replace(/^1px solid /, "")
  const fill = role === "cancel" ? "--esp-action-cancel-bg" : `--esp-action-${role}-fill`
  const foreground = role === "cancel" ? "--esp-action-cancel-fg" : `--esp-action-${role}-on`
  const border = role === "cancel" ? "--esp-action-cancel-border" : fill
  return {
    ...historicalStyle,
    background: `var(${fill}, ${fallback.background})`,
    color: `var(${foreground}, ${fallback.color})`,
    border: `1px solid var(${border}, ${borderColor})`,
  }
}
