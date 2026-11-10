import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

// Racine épinglée sur convex/ : les globs ne dépendent pas du dossier d'appel.
// Fichier à deux points dans son nom : ignoré par le bundler de Convex (comme
// `test.setup.ts` et tous les `*.test.ts`).
const convexRoot = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
  test: {
    name: "convex",
    root: convexRoot,
    include: ["tests/**/*.test.ts", "**/*.test.ts"],
    exclude: ["**/node_modules/**", "_generated/**"],
    // Les tests convex-test déclarent `// @vitest-environment edge-runtime`
    // (environnement proche du sandbox Convex) ; `node` par défaut pour les
    // tests de modules purs, comme au socle (ADR-0003 du socle).
    environment: "node",
    // Un seul processus : contexte partagé et forte pression de swap sur le Mac 16 Go.
    maxWorkers: 1,
    testTimeout: 30_000,
    // Le rappel hors TTY reste dans le processus principal pendant les longs scans convex-test.
    reporters: ["default", fileURLToPath(new URL("../scripts/convex-test-progress-reporter.mjs", import.meta.url))],
    // Les composants montés dans les tests (limiteur de débit) chargent leurs
    // modules par `import.meta.glob` : ils doivent passer par Vite.
    server: { deps: { inline: ["convex-test", "@convex-dev/rate-limiter"] } },
    env: {
      // Les graines s'exécutent dans la suite (déploiement simulé, jamais la production).
      ANTSIA_SEEDS_ALLOWED: "true",
    },
  },
})
