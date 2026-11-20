/** Mesure facultative : seules les catégories publiques déclarées peuvent sortir. */
export const USAGE_SCREENS = [
  "feed", "profile", "page", "albums", "groups", "events", "messages", "stories", "conference", "data",
] as const
export type UsageScreen = (typeof USAGE_SCREENS)[number]
export type UsageLocale = "fr" | "en"
export const USAGE_FUNNEL_STEPS = ["entry_started", "profile_completed", "membership_joined", "entry_completed"] as const
export type UsageFunnelStep = (typeof USAGE_FUNNEL_STEPS)[number]

// Une forme de slug seule accepterait aussi certains identifiants internes.
// Chaque nouveau réseau mesurable nécessite une admission explicite ici.
export const PUBLIC_USAGE_NETWORKS = ["antsia", "diaspora-ga", "administration"] as const

export interface PostHogConfiguration {
  /** Adresse complète de capture, injectée par l'application. */
  endpoint: string
  /** Jeton public du projet, jamais une clé personnelle PostHog. */
  projectToken: string
  /** Origine canonique d'un relais UE déclaré par le propriétaire ; aucune origine implicite. */
  euRelayOrigin?: string
}

export interface UsagePayload {
  token: string
  event: "screen_viewed"
  properties: {
    distinct_id: string
    screen: UsageScreen
    network: (typeof PUBLIC_USAGE_NETWORKS)[number]
    locale: UsageLocale
    $process_person_profile: false
    $geoip_disable: true
  }
}

export function isUsageScreen(value: unknown): value is UsageScreen {
  return typeof value === "string" && USAGE_SCREENS.some((screen) => screen === value)
}

export function isUsageNetwork(value: unknown): value is (typeof PUBLIC_USAGE_NETWORKS)[number] {
  return typeof value === "string" && PUBLIC_USAGE_NETWORKS.some((network) => network === value)
}

export function isUsageLocale(value: unknown): value is UsageLocale {
  return value === "fr" || value === "en"
}

export function isUsageFunnelStep(value: unknown): value is UsageFunnelStep {
  return typeof value === "string" && USAGE_FUNNEL_STEPS.some(step => step === value)
}

function isProjectToken(value: unknown): value is string {
  return typeof value === "string"
    && /^phc_[A-Za-z0-9]{20,128}$/.test(value)
    && !/^phc_(?:placeholder|replace|example|your|insert|change|todo|test)/i.test(value)
}

export function resolvePostHogConfiguration(value: unknown): PostHogConfiguration | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null
  const fields = value as Record<string, unknown>
  if (typeof fields.endpoint !== "string" || !isProjectToken(fields.projectToken)) return null
  if (/\s|\?|#/.test(fields.endpoint)) return null
  try {
    const endpoint = new URL(fields.endpoint)
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/i/v0/e/" || endpoint.href !== fields.endpoint) return null
    let euRelayOrigin: string | undefined
    if (fields.euRelayOrigin !== undefined) {
      if (typeof fields.euRelayOrigin !== "string") return null
      const relay = new URL(fields.euRelayOrigin)
      if (relay.protocol !== "https:" || relay.username || relay.password || relay.origin !== fields.euRelayOrigin) return null
      euRelayOrigin = relay.origin
    }
    const euCloud = endpoint.hostname === "eu.i.posthog.com" && endpoint.port === ""
    if (!euCloud && endpoint.origin !== euRelayOrigin) return null
    return { endpoint: endpoint.href, projectToken: fields.projectToken, ...(euRelayOrigin ? { euRelayOrigin } : {}) }
  } catch {
    return null
  }
}

export type UsageFunnelPayload = {
  token: string
  event: "onboarding_step"
  properties: Omit<UsagePayload["properties"], "screen"> & { step: UsageFunnelStep }
}

/** Même projection fermée que les écrans ; aucun résultat métier, durée libre ou identité ajouté. */
export function createUsageFunnelPayload(value: unknown): UsageFunnelPayload | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null
  const fields = value as Record<string, unknown>
  if (!isUsageFunnelStep(fields.step)) return null
  const validated = createUsagePayload({ ...fields, screen: "data" })
  if (!validated) return null
  return {
    token: validated.token, event: "onboarding_step",
    properties: {
      distinct_id: validated.properties.distinct_id, step: fields.step,
      network: validated.properties.network, locale: validated.properties.locale,
      $process_person_profile: false, $geoip_disable: true,
    },
  }
}

/** Projection explicite : aucune propriété arbitraire ne traverse le transport. */
export function createUsagePayload(value: unknown): UsagePayload | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null
  const fields = value as Record<string, unknown>
  if (!isProjectToken(fields.projectToken)
    || typeof fields.distinctId !== "string"
    || !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(fields.distinctId)
    || !isUsageScreen(fields.screen)
    || !isUsageNetwork(fields.networkSlug)
    || !isUsageLocale(fields.locale)) return null
  return {
    token: fields.projectToken,
    event: "screen_viewed",
    properties: {
      distinct_id: fields.distinctId,
      screen: fields.screen,
      network: fields.networkSlug,
      locale: fields.locale,
      $process_person_profile: false,
      $geoip_disable: true,
    },
  }
}
