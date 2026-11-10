import { DOMAIN_RULES, type DomainRule, type DomainRuleParams } from "@antsia/social-domain/violation"

/**
 * Codes d'erreur du moteur, partagés par le serveur (qui les lève dans une
 * `ConvexError`) et les applications (qui les traduisent : espace de noms
 * i18n `errors`, une clé par code — cliquet `i18n-locales`).
 *
 * REFUS INDISTINCT (invariant 8) : partout où l'existence d'une ressource est
 * une information — handle inconnu, profil privé, blocage, contenu hors réseau,
 * réseau dont on n'est pas membre —, le serveur rend `notFound`, et rien d'autre.
 */
export const ENGINE_ERROR_CODES = [
  "unauthenticated",
  "notFound",
  "rateLimited",
  "invalidArgument",
  "conflict",
  "handleUnavailable",
  "membershipSuspended",
  "statusInsufficient",
  "operatorRequired",
  "policyRefused",
  "consentRequired",
  "profileRequired",
  // Garde des fichiers : un fichier RETENU (analyse en cours, analyse impossible, ou bloqué).
  "fileScanPending",
  "fileScanUnavailable",
  "fileQuarantined",
  // Groupe thématique : la fiche est découvrable, agir y exige d'en être membre — et parfois un rôle.
  "groupMembershipRequired",
  "groupRoleRequired",
  // Évènement : le voir suffit à en être, en disposer est à l'organisateur seul.
  "eventOrganizerRequired",
  // Page : la lire suffit à la suivre ; parler en son nom exige d'en être signataire vivant, la gérer d'en être administrateur.
  "pageRoleRequired",
  // Serveur des appels et des directs : non configuré (variables absentes), injoignable, ou sans machine disponible.
  "mediaServerNotConfigured",
  "mediaServerUnavailable",
  "mediaServerNoCapacity",
  // Direct : la conférence est visible, mais le rôle de l'appelant (hôte, délégation) ne porte pas ce geste de gestion.
  "liveRoleRequired",
] as const
export type EngineErrorCode = (typeof ENGINE_ERROR_CODES)[number]

/**
 * Refus MÉTIER d'une application servie par le moteur (DIASPORALE…), levé par
 * sa tranche `convex/modules/<tranche>` : un code de l'ensemble FERMÉ de
 * l'application (`sponsor_too_recent`), traduit par elle dans son propre espace
 * de noms — jamais une phrase, jamais une valeur saisie. `rule` reste réservé
 * aux règles du domaine du moteur (`DOMAIN_RULES`).
 */
export const APP_RULE_PATTERN = /^[a-z][a-z0-9_]{1,63}$/

/** Paramètres d'un refus d'application : des nombres seulement (quotas, dates en millisecondes). */
export type AppRuleParams = Readonly<Record<string, number>>

export function isAppRule(value: unknown): value is string {
  return typeof value === "string" && APP_RULE_PATTERN.test(value)
}

export type EngineErrorData = {
  code: EngineErrorCode
  /** Pour `rateLimited` : délai avant nouvel essai, en millisecondes. */
  retryAfterMs?: number
  /** Pour `invalidArgument` : le champ fautif (jamais une valeur). */
  field?: string
  /**
   * Pour `invalidArgument` levé par une règle du domaine : son code (espace de
   * noms i18n `rules`) et ses bornes, paramètres d'interpolation du texte.
   */
  rule?: DomainRule
  params?: DomainRuleParams
  /** Refus métier d'une application (voir `APP_RULE_PATTERN`) et ses paramètres. */
  appRule?: string
  appParams?: AppRuleParams
}

export function isEngineErrorCode(value: unknown): value is EngineErrorCode {
  return typeof value === "string" && (ENGINE_ERROR_CODES as readonly string[]).includes(value)
}

/** Lit le code d'une erreur reçue du serveur (forme `ConvexError` : `{ data }`). */
export function engineErrorCode(error: unknown): EngineErrorCode | null {
  if (typeof error === "object" && error !== null && "data" in error) {
    const data = (error as { data: unknown }).data
    if (typeof data === "object" && data !== null && "code" in data) {
      const code = (data as { code: unknown }).code
      return isEngineErrorCode(code) ? code : null
    }
  }
  return null
}

/** Les données d'une erreur reçue du serveur (forme `ConvexError` : `{ data }`), si c'est un objet. */
function errorData(error: unknown): Record<string, unknown> | null {
  if (typeof error !== "object" || error === null || !("data" in error)) return null
  const data = (error as { data: unknown }).data
  return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null
}

/** Ne garde que les paramètres numériques (une valeur d'un autre type n'est jamais interpolée). */
function numericParams(params: unknown): Record<string, number> {
  const safe: Record<string, number> = {}
  if (typeof params === "object" && params !== null) {
    for (const [key, value] of Object.entries(params)) if (typeof value === "number" && Number.isFinite(value)) safe[key] = value
  }
  return safe
}

/** Lit la règle du domaine enfreinte, quand le serveur en a nommé une connue. */
export function engineErrorRule(error: unknown): { rule: DomainRule; params: DomainRuleParams } | null {
  const data = errorData(error)
  const rule = data?.rule
  if (typeof rule !== "string" || !(DOMAIN_RULES as readonly string[]).includes(rule)) return null
  return { rule: rule as DomainRule, params: numericParams(data?.params) }
}

/**
 * Lit le refus métier d'une application, quand le serveur en a nommé un bien
 * formé ; l'application vérifie ensuite qu'il appartient à SON ensemble fermé.
 */
export function engineErrorAppRule(error: unknown): { appRule: string; appParams: AppRuleParams } | null {
  const data = errorData(error)
  const appRule = data?.appRule
  if (!isAppRule(appRule)) return null
  return { appRule, appParams: numericParams(data?.appParams) }
}
