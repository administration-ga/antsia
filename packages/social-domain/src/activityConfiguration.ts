/** MP02 : présentation d'une activité, sans permission commerciale ni donnée économique. */
export const ACTIVITY_CONFIGURATION_VERSION = 1 as const
export const ACTIVITY_CAPABILITIES = ["products", "services", "media"] as const
/** `food` : l'univers « Alimentation et restauration » (étude des sept univers, § 5.4 et § 7.4), distinct de la mode. */
export const ACTIVITY_TEMPLATES = ["general", "fashion", "food", "artisan", "local", "expert", "media"] as const
export const ACTIVITY_BLOCKS = ["catalog", "services", "publications", "about"] as const
export type ActivityCapability = typeof ACTIVITY_CAPABILITIES[number]
export type ActivityTemplate = typeof ACTIVITY_TEMPLATES[number]
export type ActivityBlock = typeof ACTIVITY_BLOCKS[number]
export type ActivityConfiguration = { version: 1; capabilities: ActivityCapability[]; template: ActivityTemplate; blocks: ActivityBlock[] }

function uniqueValues<T extends string>(value: unknown, allowed: readonly T[]): value is T[] {
  return Array.isArray(value) && value.length > 0 && value.length <= allowed.length
    && value.every(item => typeof item === "string" && allowed.includes(item as T)) && new Set(value).size === value.length
}

/** Contrat fermé ; ordre des blocs conservé, capacités normalisées dans l'ordre du contrat. */
export function parseActivityConfiguration(raw: unknown): ActivityConfiguration | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  const keys = Object.keys(value)
  if (keys.length !== 4 || keys.some(key => !["version", "capabilities", "template", "blocks"].includes(key)) || value.version !== ACTIVITY_CONFIGURATION_VERSION
    || !uniqueValues(value.capabilities, ACTIVITY_CAPABILITIES) || !uniqueValues(value.blocks, ACTIVITY_BLOCKS)
    || typeof value.template !== "string" || !ACTIVITY_TEMPLATES.includes(value.template as ActivityTemplate)) return null
  if (value.blocks.includes("catalog") && !value.capabilities.includes("products") || value.blocks.includes("services") && !value.capabilities.includes("services")) return null
  const capabilities = value.capabilities
  return { version: ACTIVITY_CONFIGURATION_VERSION, capabilities: ACTIVITY_CAPABILITIES.filter(capability => capabilities.includes(capability)), template: value.template as ActivityTemplate, blocks: [...value.blocks] }
}

/** Les lignes historiques gardent leur rendu et leur modèle ; aucun backfill imposé. */
export function effectiveActivityConfiguration(raw: unknown, legacyModel: "products" | "quote_services"): ActivityConfiguration {
  return parseActivityConfiguration(raw) ?? (legacyModel === "quote_services"
    ? { version: 1, capabilities: ["services"], template: "local", blocks: ["services", "publications", "about"] }
    : { version: 1, capabilities: ["products"], template: "general", blocks: ["catalog", "publications", "about"] })
}

/** Configurer un bloc ne le rend pas visible : il doit aussi avoir un contenu autorisé. */
export function visibleActivityBlocks(configuration: ActivityConfiguration, available: readonly ActivityBlock[]): ActivityBlock[] {
  return configuration.blocks.filter(block => available.includes(block)
    && (block !== "catalog" || configuration.capabilities.includes("products"))
    && (block !== "services" || configuration.capabilities.includes("services")))
}
