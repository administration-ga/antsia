// Matchers DOM de testing-library (`toHaveAttribute`…) et démontage entre deux
// cas : seuls les tests en jsdom montent des composants.
import "@testing-library/jest-dom/vitest"

import { afterEach } from "vitest"

/**
 * Node 25 expose un `localStorage` expérimental sans méthodes, qui masque celui de jsdom :
 * on pose alors un stockage en mémoire conforme (rien ne change sous Node 22).
 *
 * Bloc repris tel quel de `../DIASPORA_GA/packages/diaspora-ga-features/vitest.setup.ts` (même
 * bloc dans `../DIASPORA_GA/apps/diaspora_ga/vitest.setup.ts` ; arbre de travail DIASPORA.GA du
 * 19/10/2026, non commité) : les deux produits gardent le même comportement de test. Cause :
 * l'environnement jsdom de Vitest ne recopie sur le global que les clés de fenêtre qu'il n'a
 * pas déjà (hors une liste fixe sans `localStorage`) ; sans `--localstorage-file`, l'accesseur
 * de Node 25 rend un objet vide et reste en place, `window` étant le global lui-même.
 */
function memoryStorage(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() {
      return entries.size
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => {
      entries.delete(key)
    },
    setItem: (key, value) => {
      entries.set(key, String(value))
    },
  }
}
for (const target of new Set<object>([globalThis, ...(typeof window === "undefined" ? [] : [window])])) {
  const current = (target as { localStorage?: Partial<Storage> }).localStorage
  if (current !== undefined && typeof current.clear !== "function") {
    Object.defineProperty(target, "localStorage", { configurable: true, value: memoryStorage() })
  }
}

afterEach(async () => {
  if (typeof document === "undefined") return
  const { cleanup } = await import("@testing-library/react")
  cleanup()
})
