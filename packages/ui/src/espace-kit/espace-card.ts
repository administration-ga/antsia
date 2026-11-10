// Dupliqué de socle/packages/agent-features/src/components/espace-kit/espace-card.ts @ ad2e7fdc2 — adaptations : aucune sur le code (valeurs et jetons inchangés) ; commentaire rapporté au jumeau du moteur (`shell/design-styles` de `@antsia/social-features`) et au cliquet `no-hardcoded-colors`. surfaces et rembourrage opt-in ANTSIA ; carte et média raccordés à leur géométrie, valeurs historiques en repli.
import type { CSSProperties } from "react"

/**
 * Constantes de surface du kit d'espace.
 *
 * Mêmes valeurs que `RESEAU_SURFACE_STYLE` / `RESEAU_CARD_STYLE` /
 * `RESEAU_INNER_CARD_STYLE` de `shell/design-styles` (`@antsia/social-features`,
 * la source pour le réseau). Les deux DOIVENT rester d'accord : un écart entre
 * eux ferait cohabiter deux cartes visuellement différentes dans le même
 * réseau, sans qu'aucun test ne puisse l'attraper (ce sont des styles en
 * ligne faits de jetons, hors de portée du cliquet `no-hardcoded-colors` qui
 * ne voit que les couleurs littérales).
 */
export const ESPACE_SURFACE_STYLE = {
  background: "var(--esp-surface-card, var(--secondary))",
  border: "1px solid var(--esp-primitive-surface-border, var(--border))",
  borderRadius: "var(--esp-primitive-card-radius, 18px)",
  boxShadow: "var(--esp-surface-shadow, none)",
} satisfies CSSProperties

export const ESPACE_CARD_STYLE = {
  ...ESPACE_SURFACE_STYLE,
  padding: "var(--esp-card-padding, 18px 20px)",
} satisfies CSSProperties

export const ESPACE_INNER_CARD_STYLE = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--esp-media-radius, 16px)",
  boxShadow: "var(--esp-surface-shadow, none)",
} satisfies CSSProperties
