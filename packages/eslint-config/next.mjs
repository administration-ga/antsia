// Dupliqué de socle/packages/eslint-config/next.mjs @ ad2e7fdc2 — adaptations : provenance ; message de `react-markdown` pointé vers le futur rendu sûr du moteur ; imports inter-produits interdits (`@workspace/*`, `_generated` étrangers) en plus du cliquet `no-cross-product-imports`.
import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

/**
 * Config ESLint partagée (flat) pour les applications Next et les paquets React
 * du moteur ANTSIA (antsia_ga, admin_antsia_ga, social-features, ui, api, et les
 * applications externes comme diaspora_ga).
 *
 * = preset Next officiel (core-web-vitals + typescript) — qui enregistre déjà le
 *   plugin `jsx-a11y` — + le socle « pipeline vert » du socle administration.ga
 *   (mêmes sévérités : le code dupliqué arrive avec ses habitudes, la dette se
 *   resserre par décision, pas par surprise) + un palier d'accessibilité explicite.
 *
 * ⚠️ eslint ^9 UNIQUEMENT : eslint-plugin-react (via eslint-config-next 16.x)
 * appelle encore `context.getFilename()`, supprimée dans eslint 10.
 */
export const crossProductRestrictions = {
  paths: [
    {
      name: "react-markdown",
      message:
        "Import direct interdit (XSS). Passer par le rendu Markdown assaini du moteur (arrive avec la messagerie, PA6).",
    },
  ],
  patterns: [
    {
      group: ["@workspace/*"],
      message:
        "Aucun paquet du socle administration.ga dans le moteur (étanchéité, règle 4 de duplication) : on copie le code, on ne l'importe pas.",
    },
    {
      group: ["**/ADMINISTRATION_GA/**", "**/GABON_DIPLOMATIE/**", "**/gabon-diplomatie/**"],
      message: "Aucun import d'un autre dépôt du programme (étanchéité).",
    },
  ],
}

export default defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    rules: {
      "no-restricted-imports": ["error", crossProductRestrictions],

      // ── Socle « pipeline vert » (repris à l'identique du socle) ──────
      "react/no-unescaped-entities": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-this-alias": "warn",
      "react/no-children-prop": "warn",
      "react-hooks/rules-of-hooks": "warn",
      "@next/next/no-html-link-for-pages": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/set-state-in-render": "warn",
      "react-hooks/use-memo": "warn",
      "react-hooks/static-components": "warn",

      // ── Accessibilité (jsx-a11y) — palier "warn" ──────────────────────
      "jsx-a11y/alt-text": "warn",
      "jsx-a11y/anchor-has-content": "warn",
      "jsx-a11y/anchor-is-valid": "warn",
      "jsx-a11y/aria-activedescendant-has-tabindex": "warn",
      "jsx-a11y/aria-props": "warn",
      "jsx-a11y/aria-proptypes": "warn",
      "jsx-a11y/aria-role": "warn",
      "jsx-a11y/aria-unsupported-elements": "warn",
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/heading-has-content": "warn",
      "jsx-a11y/interactive-supports-focus": "warn",
      "jsx-a11y/label-has-associated-control": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/role-has-required-aria-props": "warn",
      "jsx-a11y/role-supports-aria-props": "warn",
      "jsx-a11y/tabindex-no-positive": "warn",
    },
  },

  globalIgnores([".next/**", "out/**", "build/**", "dist/**", "next-env.d.ts", "coverage/**"]),
])
