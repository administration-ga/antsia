// Règles React/TypeScript partagées ; les primitives de cette app sont React Native.
import { defineConfig, globalIgnores } from "eslint/config"
import react from "@antsia/eslint-config/react"
import { crossProductRestrictions } from "@antsia/eslint-config/next"

export default defineConfig([
  ...react.map((config) => "ignores" in config && Object.keys(config).every((key) => key === "ignores" || key === "name") ? config : {
    ...config,
    files: config.files ?? ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
  }),
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs", globals: { __dirname: "readonly", process: "readonly" } },
    rules: { "no-undef": "error", "no-unused-vars": "warn" },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          ...crossProductRestrictions.paths,
          { name: "@antsia/api", message: "Utiliser les sous-exports natifs ; le barrel contient des accès DOM et SSO Web." },
          { name: "@antsia/ui", message: "Utiliser les jetons natifs explicites ; les primitives du barrel sont DOM." },
          { name: "react-dom", message: "React DOM ne fait pas partie de cette application native." },
        ],
        patterns: [...crossProductRestrictions.patterns, { group: ["next", "next/*", "react-dom/*"], message: "Aucun import Next ou React DOM dans le client natif." }],
      }],
      "no-restricted-globals": ["error", "window", "document", "localStorage", "sessionStorage"],
    },
  },
  globalIgnores(["android/**", "ios/**", ".expo/**", "dist/**", "coverage/**"]),
])
