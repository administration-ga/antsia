/**
 * ANTSIA seulement : createAppI18n remplace un namespace entier (fusion shallow).
 * Chaque namespace adapté est donc recomposé intégralement, sans partager ses objets
 * mutables avec le moteur. Aucune réécriture par recherche/remplacement de texte.
 */
type Namespace = Readonly<Record<string, unknown>>

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function copy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copy)
  if (record(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]))
  return value
}

function mergeNamespace(base: Namespace, overrides: Namespace): Record<string, unknown> {
  const result = Object.fromEntries(Object.entries(base).map(([key, value]) => [key, copy(value)]))
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(base, key)) throw new Error(`Unknown ANTSIA translation override: ${key}`)
    const original = base[key]
    if (record(original) && record(value)) result[key] = mergeNamespace(original, value)
    else {
      if (typeof original !== "string" || typeof value !== "string") throw new Error(`Invalid ANTSIA translation override: ${key}`)
      result[key] = value
    }
  }
  return result
}

export function composeAntsiaEngineOverrides(
  engine: Readonly<Record<string, Namespace>>,
  overrides: Readonly<Record<string, Namespace>>,
): Record<string, Record<string, unknown>> {
  return Object.fromEntries(Object.entries(overrides).map(([namespace, values]) => {
    const base = engine[namespace]
    if (!base) throw new Error(`Unknown ANTSIA translation namespace: ${namespace}`)
    return [namespace, mergeNamespace(base, values)]
  }))
}
