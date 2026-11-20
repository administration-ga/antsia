/**
 * Facettes — les attributs d'une personne propres à UN réseau (cahier §4,
 * EXF-AN-04). Un réseau déclare un schéma BORNÉ (jamais un JSON libre) ; les
 * valeurs d'une personne s'y valident ici, côté serveur comme à l'écran. Chaque
 * champ porte sa visibilité ; les projections ne servent que ce qu'elle permet.
 *
 * Exemple (DIASPORA.GA) : `countryOfResidence` (pays ISO ≠ GA, obligatoire),
 * `city`, `postSlug`, `arrivedAt` (année), `helpAvailable` (booléen).
 */

export const FACET_FIELD_KINDS = ["text", "country", "enum", "textList", "year", "boolean"] as const
export type FacetFieldKind = (typeof FACET_FIELD_KINDS)[number]

/** Qui lit un champ : personne (sauf soi), les membres du réseau, ou aussi la racine. */
export const FACET_VISIBILITIES = ["hidden", "network", "root"] as const
export type FacetVisibility = (typeof FACET_VISIBILITIES)[number]

export type FacetField = {
  key: string
  kind: FacetFieldKind
  required: boolean
  /** Visibilité appliquée quand la personne n'a rien choisi. */
  defaultVisibility: FacetVisibility
  /** `text` : longueur maximale ; `textList` : longueur de chaque élément. */
  maxLength?: number
  /** `textList` : nombre maximal d'éléments. */
  maxItems?: number
  /** `enum` : valeurs admises. */
  enumValues?: readonly string[]
  /** `country` / `enum` / `text` : valeurs refusées (ex. GA pour la diaspora). */
  excludedValues?: readonly string[]
}

export type FacetSchema = { fields: readonly FacetField[] }

export type FacetValue = string | number | boolean | string[]
export type FacetValues = Record<string, FacetValue>

/** Bornes d'un schéma : on ne laisse pas un réseau déclarer un formulaire sans fin. */
export const FACET_SCHEMA_LIMITS = { maxFields: 24, maxKeyLength: 40, maxTextLength: 280, maxListItems: 50, maxEnumValues: 100 } as const

const KEY_PATTERN = /^[a-z][a-zA-Z0-9]*$/
const COUNTRY_PATTERN = /^[A-Z]{2}$/

export type FacetSchemaError = {
  key: string
  problem: "duplicate_key" | "invalid_key" | "too_many_fields" | "enum_without_values" | "limit_exceeded"
}

/** Un schéma de facette est-il recevable (console du moteur, PA7) ? */
export function validateFacetSchema(schema: FacetSchema): FacetSchemaError[] {
  const errors: FacetSchemaError[] = []
  if (schema.fields.length > FACET_SCHEMA_LIMITS.maxFields) errors.push({ key: "*", problem: "too_many_fields" })
  const seen = new Set<string>()
  for (const field of schema.fields) {
    if (!KEY_PATTERN.test(field.key) || field.key.length > FACET_SCHEMA_LIMITS.maxKeyLength) errors.push({ key: field.key, problem: "invalid_key" })
    if (seen.has(field.key)) errors.push({ key: field.key, problem: "duplicate_key" })
    seen.add(field.key)
    if (field.kind === "enum" && (field.enumValues?.length ?? 0) === 0) errors.push({ key: field.key, problem: "enum_without_values" })
    if (
      (field.maxLength ?? 0) > FACET_SCHEMA_LIMITS.maxTextLength ||
      (field.maxItems ?? 0) > FACET_SCHEMA_LIMITS.maxListItems ||
      (field.enumValues?.length ?? 0) > FACET_SCHEMA_LIMITS.maxEnumValues
    ) {
      errors.push({ key: field.key, problem: "limit_exceeded" })
    }
  }
  return errors
}

export type FacetValueError = {
  key: string
  problem: "required" | "unknown_field" | "wrong_type" | "too_long" | "too_many_items" | "not_allowed"
}

function validateOne(field: FacetField, value: FacetValue): FacetValueError["problem"] | null {
  const maxText = field.maxLength ?? FACET_SCHEMA_LIMITS.maxTextLength
  switch (field.kind) {
    case "text":
      if (typeof value !== "string") return "wrong_type"
      if (value.length > maxText) return "too_long"
      return field.excludedValues?.includes(value) ? "not_allowed" : null
    case "country":
      if (typeof value !== "string" || !COUNTRY_PATTERN.test(value)) return "wrong_type"
      return field.excludedValues?.includes(value) ? "not_allowed" : null
    case "enum":
      if (typeof value !== "string") return "wrong_type"
      if (!field.enumValues?.includes(value) || field.excludedValues?.includes(value)) return "not_allowed"
      return null
    case "textList":
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return "wrong_type"
      if (value.length > (field.maxItems ?? FACET_SCHEMA_LIMITS.maxListItems)) return "too_many_items"
      return value.some((item) => item.length > maxText) ? "too_long" : null
    case "year":
      return typeof value === "number" && Number.isInteger(value) && value >= 1900 && value <= 2100 ? null : "wrong_type"
    case "boolean":
      return typeof value === "boolean" ? null : "wrong_type"
  }
}

/** Les valeurs d'une personne respectent-elles le schéma du réseau ? */
export function validateFacetValues(schema: FacetSchema, values: FacetValues): FacetValueError[] {
  const errors: FacetValueError[] = []
  const byKey = new Map(schema.fields.map((field) => [field.key, field]))
  for (const key of Object.keys(values)) if (!byKey.has(key)) errors.push({ key, problem: "unknown_field" })
  for (const field of schema.fields) {
    const value = values[field.key]
    const empty = value === undefined || value === "" || (Array.isArray(value) && value.length === 0)
    if (empty) {
      if (field.required) errors.push({ key: field.key, problem: "required" })
      continue
    }
    const problem = validateOne(field, value)
    if (problem) errors.push({ key: field.key, problem })
  }
  return errors
}

export type FacetReader = "self" | "network_member" | "root_member"

/** Le lecteur peut-il voir ce champ ? `self` voit tout ; sinon la visibilité décide. */
export function canReadFacetField(visibility: FacetVisibility, reader: FacetReader): boolean {
  if (reader === "self") return true
  if (visibility === "hidden") return false
  if (visibility === "network") return reader === "network_member"
  return true
}

/** Projection ALLOWLISTÉE des facettes pour un lecteur donné. */
export function projectFacets(
  schema: FacetSchema,
  values: FacetValues,
  visibilities: Readonly<Record<string, FacetVisibility>>,
  reader: FacetReader,
): FacetValues {
  const projected: FacetValues = {}
  for (const field of schema.fields) {
    const value = values[field.key]
    if (value === undefined) continue
    const visibility = visibilities[field.key] ?? field.defaultVisibility
    if (canReadFacetField(visibility, reader)) projected[field.key] = value
  }
  return projected
}
