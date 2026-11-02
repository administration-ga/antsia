// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/design-styles.ts @ ad2e7fdc2 — adaptations : déplacé dans la coque (`shell/`) ; styles inchangés, jetons de la charte de base du moteur (`--esp-surface-card`, jetons shadcn) et rayon des surfaces du réseau (`--rp-surface-radius`, couche de communication) ; commentaires rapportés au réseau (plus de maquette iProfil ni de charte de l'espace personnel). ; contour des surfaces posées sur la page lu dans --esp-surface-border, filet d'origine en repli (aucun contour quand le thème distingue déjà la carte du fond) ; système épuré (ADR-0027) : rayons et neutres lus dans des jetons à `initial` (`--ui2-button-radius`, `--ui2-button-outline-*`, `--ui2-card-radius`, `--esp-field-radius`, `--esp-media-radius`), valeurs d'origine en repli ; `RESEAU_ACTION_SHAPE_STYLE`, la géométrie seule, pour les boutons colorés par leur fonction ; publication détachée par un anneau intérieur quand la carte a la couleur du fond (`POST_SURFACE_STYLE`, transparent sinon). cartes et héros : rembourrage opt-in ANTSIA (`--esp-card-padding`), valeurs historiques en repli.
import type { CSSProperties } from "react"

/**
 * Surfaces du réseau.
 *
 * Les couleurs restent volontairement sémantiques : la charte de base du
 * moteur (et le thème du réseau) résout ces rôles en clair comme en sombre.
 */
export const RESEAU_SURFACE_STYLE = {
  background: "var(--esp-surface-card, var(--secondary))",
  /* Aucun filet quand le thème distingue déjà la carte du fond (`--esp-surface-border`). */
  border: "1px solid var(--esp-surface-border, var(--border))",
  /* La page réseau du bureau pose son rayon de surface sur .rp-scope. Le repli
     conserve le contrat historique pour les composants rendus hors page. */
  borderRadius: "var(--rp-surface-radius, 18px)",
  boxShadow: "var(--esp-surface-shadow, none)",
} satisfies CSSProperties

export const RESEAU_CARD_STYLE = {
  ...RESEAU_SURFACE_STYLE,
  padding: "var(--esp-card-padding, 18px 20px)",
} satisfies CSSProperties

/**
 * La surface d'une PUBLICATION du fil — sans filet (décision utilisateur du
 * 2026-08-21) : dans un fil où le média traverse la carte bord à bord, le
 * liseré encadrait chaque publication comme une pièce jointe. La carte se
 * distingue du fond par sa seule surface (parchemin sur blanc en clair,
 * gris relevé sur noir en sombre) et par les gouttières du fil.
 *
 * ⚠️ Réservée aux PUBLICATIONS (PostCard). Les panneaux, rails et cartes
 * d'information du réseau gardent `RESEAU_SURFACE_STYLE` et son filet :
 * ce sont des surfaces de dossier, pas des objets de fil.
 */
export const POST_SURFACE_STYLE = {
  ...RESEAU_SURFACE_STYLE,
  border: "none",
  /* Système épuré (ADR-0027) : quand le thème donne à la carte la couleur du
     fond (Électrique), un anneau intérieur la détache — transparent partout
     ailleurs, sans effet sur la mise en page, et recouvert par un média qui
     traverse la carte bord à bord. */
  boxShadow: "var(--esp-post-shadow, inset 0 0 0 1px var(--esp-surface-border, transparent))",
} satisfies CSSProperties

export const RESEAU_HERO_STYLE = {
  ...RESEAU_SURFACE_STYLE,
  borderRadius: "var(--ui2-card-radius, 20px)",
  padding: "var(--esp-card-padding, 24px)",
} satisfies CSSProperties

export const RESEAU_INNER_CARD_STYLE = {
  background: "var(--card)",
  /* Carte posée sur une carte de même couleur : le filet reste (contour à couleur égale). */
  border: "1px solid var(--border)",
  borderRadius: "var(--esp-media-radius, 16px)",
  boxShadow: "var(--esp-surface-shadow, none)",
} satisfies CSSProperties

export const RESEAU_PRIMARY_ACTION_STYLE = {
  borderRadius: "var(--ui2-button-radius, 11px)",
  padding: "10px 18px",
  fontSize: 13.5,
  fontWeight: 700,
} satisfies CSSProperties

export const RESEAU_SECONDARY_ACTION_STYLE = {
  borderRadius: "var(--ui2-button-radius, 11px)",
  /* Le neutre : gris sans filet dans les thèmes ANTSIA (contour seulement à couleur égale). */
  border: "1px solid var(--ui2-button-outline-border, var(--border))",
  background: "var(--ui2-button-outline-bg, var(--card))",
  color: "var(--muted-foreground)",
  padding: "9px 13px",
  fontSize: 12.5,
  fontWeight: 700,
} satisfies CSSProperties

export const RESEAU_PILL_ACTION_STYLE = {
  borderRadius: 999,
} satisfies CSSProperties

/**
 * La géométrie d'un bouton d'action du réseau, SANS couleur : la variante du
 * bouton (`social`, `message`, `react`, `commerce`…) garde la sienne (ADR-0027).
 */
export const RESEAU_ACTION_SHAPE_STYLE = {
  borderRadius: "var(--ui2-button-radius, 11px)",
  padding: "9px 13px",
  fontSize: 12.5,
  fontWeight: 700,
} satisfies CSSProperties

export const RESEAU_FIELD_STYLE = {
  borderRadius: "var(--esp-field-radius, 12px)",
  border: "1px solid var(--input)",
  background: "var(--card)",
} satisfies CSSProperties
