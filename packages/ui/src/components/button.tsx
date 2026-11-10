// Dupliqué de socle/packages/ui-v2/src/components/button.tsx @ ad2e7fdc2 — adaptations : en-tête de provenance ; système épuré et couleurs par fonction (ADR-0027) lus dans des jetons à `initial`, repli sur les valeurs d'origine (rayon `--ui2-button-radius`, neutre « outline » et secondaire sans filet, texte de l'aplat d'identité `--primary-fill-on`, variantes `social`, `message`, `react`, `commerce` ; texte posé sur Valider et Supprimer `--role-success-on`, `--role-danger-on`).
"use client"

import type { ButtonHTMLAttributes, CSSProperties, ReactNode, Ref } from "react"
import { Icon, type IconName } from "./icon"

/**
 * `social` (Suivre), `message` (Écrire, tonal), `react` (J'aime) et `commerce`
 * (Acheter, Participer) prennent la couleur de leur fonction quand le thème la
 * déclare (ADR-0027) ; sinon, ils retombent sur l'identité (`primary`) ou, pour
 * `message`, sur le secondaire.
 */
type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "success" | "link" | "social" | "message" | "react" | "commerce"
type Size = "sm" | "md" | "lg"

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * React 19 transmet `ref` comme une prop ordinaire à un composant fonction :
   * `...rest` la pose déjà sur le `<button>`. La déclarer ici ne change rien à
   * l'exécution, elle dit au typage ce qui se passe (un déclencheur qui doit
   * REPRENDRE le focus à la fermeture d'une carte en a besoin — GroupsPanel).
   */
  ref?: Ref<HTMLButtonElement>
  variant?: Variant
  size?: Size
  icon?: IconName
  iconRight?: IconName
  children?: ReactNode
}

const BASE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  fontFamily: "inherit",
  fontWeight: 600,
  fontSize: 14,
  padding: "8px 16px",
  // Passe par un JETON plutôt que par une valeur en dur, pour une raison
  // mécanique : ces styles sont appliqués EN LIGNE, et un style en ligne
  // l'emporte sur toute règle de feuille de style, quelle que soit sa
  // spécificité. Le plancher tactile de 44 px du socle mobile
  // (`@workspace/ui/styles/mobile.css`) ne pouvait donc pas s'appliquer ici :
  // mesuré, les commandes ui-v2 restaient à 36-39 px de haut au téléphone.
  // Une propriété personnalisée, elle, se résout par la cascade — une requête
  // média peut la déplacer, ce qu'un style en ligne ne saurait faire.
  minHeight: "var(--ui2-button-min-h, 36px)",
  // Un angle par élément (ADR-0027) : la pilule des thèmes ANTSIA, 6 px ailleurs.
  borderRadius: "var(--ui2-button-radius, 6px)",
  border: "1px solid transparent",
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "background .12s, border-color .12s, color .12s",
  letterSpacing: "0.01em",
}

const VARIANTS: Record<Variant, CSSProperties> = {
  primary: {
    background: "var(--primary-fill)",
    // Une identité claire (turquoise, mandarine) porte un texte foncé : jeton propre à l'aplat.
    color: "var(--primary-fill-on, var(--on-fill))",
    border: "1px solid var(--primary-fill)",
  },
  // Contour seulement à couleur égale : les thèmes ANTSIA en font un bouton tonal sans filet.
  secondary: {
    background: "var(--ui2-button-secondary-bg, var(--ink-0))",
    color: "var(--ui2-button-secondary-fg, var(--primary-500))",
    border: "1px solid var(--ui2-button-secondary-border, var(--primary-500))",
  },
  ghost: { background: "transparent", color: "var(--ink-700)", border: "1px solid transparent" },
  // Le neutre (Annuler) : gris, sans filet, dans les thèmes ANTSIA.
  outline: {
    background: "var(--ui2-button-outline-bg, var(--ink-0))",
    color: "var(--ui2-button-outline-fg, var(--ink-800))",
    border: "1px solid var(--ui2-button-outline-border, var(--ink-300))",
  },
  // Valider et Supprimer : chacun son texte sur l'aplat (ADR-0027) ; l'aplat est déjà
  // celui de la fonction dans les thèmes ANTSIA (`--danger-fill`, `--success-fill`).
  danger: {
    background: "var(--danger-fill)",
    color: "var(--role-danger-on, var(--on-fill))",
    border: "1px solid var(--danger-fill)",
  },
  success: {
    background: "var(--success-fill)",
    color: "var(--role-success-on, var(--on-fill))",
    border: "1px solid var(--success-fill)",
  },
  link: {
    background: "transparent",
    color: "var(--primary-500)",
    border: "1px solid transparent",
    // ⚠️ Ces deux lignes ÉCRASENT `--ui2-button-min-h` de la base : le spread
    // ci-dessous applique la variante APRÈS elle. Elles passent donc par leurs
    // propres jetons, sans quoi un bouton « lien » reste hors du plancher
    // tactile quoi que dise la feuille de style.
    padding: "var(--ui2-button-link-pad, 0px)",
    minHeight: "var(--ui2-button-link-min-h, auto)",
  },
  // ── Une couleur par fonction (ADR-0027) ──
  social: {
    background: "var(--role-social-fill, var(--primary-fill))",
    color: "var(--role-social-on, var(--primary-fill-on, var(--on-fill)))",
    border: "1px solid transparent",
  },
  message: {
    background: "var(--role-message-soft, var(--ui2-button-secondary-bg, var(--ink-0)))",
    color: "var(--role-message-ink, var(--ui2-button-secondary-fg, var(--primary-500)))",
    border: "1px solid var(--role-message-soft, var(--ui2-button-secondary-border, var(--primary-500)))",
  },
  react: {
    background: "var(--role-react-fill, var(--primary-fill))",
    color: "var(--role-react-on, var(--primary-fill-on, var(--on-fill)))",
    border: "1px solid transparent",
  },
  commerce: {
    background: "var(--role-commerce-fill, var(--primary-fill))",
    color: "var(--role-commerce-on, var(--primary-fill-on, var(--on-fill)))",
    border: "1px solid transparent",
  },
}

const SIZES: Record<Size, CSSProperties> = {
  // Même piège que `link`, et il mordait plus large : la taille est étalée en
  // DERNIER, donc `size="sm"` figeait 32 px sur tous les boutons compacts —
  // c'est-à-dire la quasi-totalité des rails et des panneaux latéraux.
  sm: {
    padding: "6px 12px",
    minHeight: "var(--ui2-button-sm-min-h, 32px)",
    fontSize: 13,
  },
  md: {},
  // `lg` est DÉJÀ au-dessus du plancher : le figer serait sans effet, et le
  // faire varier le ferait rétrécir au téléphone.
  lg: { padding: "12px 24px", minHeight: 48, fontSize: 16 },
}

export const Button = ({
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  children,
  style,
  ...rest
}: ButtonProps) => (
  <button {...rest} style={{ ...BASE, ...VARIANTS[variant], ...SIZES[size], ...style }}>
    {icon && <Icon name={icon} size={size === "lg" ? 18 : 15} />}
    {children}
    {iconRight && <Icon name={iconRight} size={size === "lg" ? 18 : 15} />}
  </button>
)
