/** PA4 — configuration publique des portes, secrets lus uniquement par le serveur. */
import catalog from "../../deploy/catalog.json"
import { demoAccountsAllowed, devToolsAllowed } from "../lib/devTools"

type Env = Record<string, string | undefined>

/**
 * Durée de vie d'un code à usage unique : cinq minutes. LA constante : les greffons OTP
 * (`auth.ts`), le code de développement affiché (`delivery.ts`) et la configuration publique
 * (`platform/authentication.configuration`, EA-08) la lisent ici, jamais une valeur recopiée.
 */
export const OTP_TTL_SECONDS = 300

export function parseOriginList(raw: string | undefined): string[] {
  return [...new Set((raw ?? "").split(/[\s,]+/).flatMap((value) => {
    if (!value) return []
    try {
      const url = new URL(value)
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? [url.origin] : []
    } catch { return [] }
  }))]
}

type Applications = typeof catalog.applications
export type ApplicationKey = { [Key in keyof Applications]: Applications[Key] extends { site_url: string; dev_port: number } ? Key : never }[keyof Applications]

// Seules les applications web ont une origine HTTP. Une entrée native du
// catalogue ne crée ni origine de confiance, ni schéma OAuth autorisé.
const webApplications = Object.entries(catalog.applications).flatMap(([key, app]) =>
  app.platform === "web" && "site_url" in app && "dev_port" in app ? [{ ...app, key: key as ApplicationKey }] : [],
)

/**
 * Les origines SUPPLÉMENTAIRES d'une application du catalogue, déclarées par le déploiement
 * (`APPLICATION_EXTRA_ORIGINS_JSON`, revue CH-815 A1b) : une application servie ailleurs qu'à son
 * `site_url`, typiquement sur un déploiement de démonstration. Jamais une valeur écrite ici.
 *
 * Forme : un objet JSON `{ "<clé d'application WEB du catalogue>": ["https://origine", …] }`, au plus
 * `MAX_EXTRA_ORIGINS_PER_APPLICATION` origines par clé, chacune HTTPS, EXACTE (sans chemin, ni requête,
 * ni fragment, ni identifiants, telle que `URL.origin` l'écrit), ni répétée, ni déjà l'adresse d'une
 * application du catalogue. Une seule faute (JSON illisible, clé inconnue ou native, valeur hors forme)
 * et la variable ENTIÈRE est ignorée : aucune correspondance plutôt qu'une correspondance devinée.
 *
 * La correspondance NOMME l'application d'une origine (sceau de la session IDN, marque du code) ; elle
 * n'ajoute aucune confiance : une origine qui n'est pas aussi dans `TRUSTED_ORIGINS` (ou `SITE_URL`)
 * n'a pas d'application.
 */
export const MAX_EXTRA_ORIGINS_PER_APPLICATION = 8
const MAX_EXTRA_ORIGINS_LENGTH = 8_192

function exactHttpsOrigin(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 256) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password && url.origin === value ? value : null
  } catch { return null }
}

export function extraApplicationOrigins(env: Env = process.env): ReadonlyMap<string, ApplicationKey> {
  const raw = env.APPLICATION_EXTRA_ORIGINS_JSON
  const none = new Map<string, ApplicationKey>()
  if (!raw?.trim() || raw.length > MAX_EXTRA_ORIGINS_LENGTH) return none
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return none }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return none
  const catalogOrigins = new Set(webApplications.flatMap((app) => parseOriginList(app.site_url)))
  const mapping = new Map<string, ApplicationKey>()
  for (const [key, origins] of Object.entries(parsed)) {
    if (!isWebApplicationKey(key) || !Array.isArray(origins) || origins.length === 0 || origins.length > MAX_EXTRA_ORIGINS_PER_APPLICATION) return none
    for (const value of origins) {
      const origin = exactHttpsOrigin(value)
      if (!origin || catalogOrigins.has(origin) || mapping.has(origin)) return none
      mapping.set(origin, key)
    }
  }
  return mapping
}

/**
 * L'application du catalogue servie à cette origine : son adresse publique, son port local quand les
 * outils de développement sont ouverts, ou une origine supplémentaire déclarée par le déploiement ET
 * de confiance (`extraApplicationOrigins`). `null` sinon.
 */
export function applicationOfOrigin(origin: string | null | undefined, env: Env = process.env): ApplicationKey | null {
  const [normalized] = parseOriginList(origin ?? "")
  if (!normalized) return null
  const local = devToolsAllowed(env)
  for (const app of webApplications) {
    if (parseOriginList(app.site_url).includes(normalized)) return app.key
    if (local && [`http://localhost:${app.dev_port}`, `http://127.0.0.1:${app.dev_port}`].includes(normalized)) return app.key
  }
  const declared = extraApplicationOrigins(env).get(normalized)
  if (declared === undefined) return null
  const trusted = [...parseOriginList(env.SITE_URL), ...parseOriginList(env.TRUSTED_ORIGINS)]
  return trusted.includes(normalized) ? declared : null
}

export function trustedOrigins(env: Env = process.env): string[] {
  const origins = [...parseOriginList(env.SITE_URL), ...parseOriginList(env.TRUSTED_ORIGINS)]
  for (const app of webApplications) {
    origins.push(...parseOriginList(app.site_url))
    if (devToolsAllowed(env)) origins.push(`http://localhost:${app.dev_port}`, `http://127.0.0.1:${app.dev_port}`)
  }
  return [...new Set(origins)]
}

/** La clé est-elle celle d'une application WEB du catalogue ? */
export function isWebApplicationKey(key: string): key is ApplicationKey {
  return webApplications.some((app) => app.key === key)
}

/** Ce que le catalogue dit d'une application pour l'administration d'un réseau et pour la console. */
type CatalogApplication = { readonly platform: string; readonly administers_network?: string; readonly operator_console?: boolean; readonly entry_path?: string }

/**
 * ADR-0042 — le réseau (son identifiant d'adresse, `slug`) qu'ADMINISTRE une application web du
 * catalogue, déclaré par son champ `administers_network` ; `null` pour toute autre clé (application
 * des membres, console, natif, clé inconnue ou absente). Le catalogue est la seule source : aucune
 * ligne en base, aucun argument d'un client ne fait d'une application une porte d'administration.
 */
export function networkAdministeredBy(application: string | null | undefined, applications: Readonly<Record<string, CatalogApplication>> = catalog.applications): string | null {
  if (!application || !Object.prototype.hasOwnProperty.call(applications, application)) return null
  const app = applications[application]
  return app?.platform === "web" && typeof app.administers_network === "string" && app.administers_network.length > 0 ? app.administers_network : null
}

/**
 * ADR-0042 (CH-815 A6) — ce réseau (son `slug`) a-t-il une application d'administration au
 * catalogue ? Ses décisions ne se prennent alors que là : les fonctions partagées du moteur qui les
 * prenaient depuis l'application des membres le refusent (`lib/networkAdminIdentity.isAdministeredNetwork`).
 */
export function hasNetworkAdministration(networkSlug: string, applications: Readonly<Record<string, CatalogApplication>> = catalog.applications): boolean {
  return Object.keys(applications).some((key) => networkAdministeredBy(key, applications) === networkSlug)
}

/**
 * Revue CH-815, constat F3 — l'application est-elle LA console du moteur ? Une application web du
 * catalogue qui le déclare par `operator_console: true` (la valeur `true` seule) et qui n'administre
 * aucun réseau : les deux autorités ne se confondent jamais. Le catalogue est la seule source, comme
 * pour `administers_network` : aucune ligne en base, aucun argument d'un client ne fait d'une
 * application la console. Seule une preuve de session scellée pour elle ouvre la console
 * (`lib/operatorIdentity.isLiveOperatorSession`) ; une clé absente, inconnue ou native n'est jamais
 * la console (fermé par défaut). Le cliquet `deploy-catalog` n'en admet qu'une.
 */
export function isOperatorConsoleApplication(application: string | null | undefined, applications: Readonly<Record<string, CatalogApplication>> = catalog.applications): boolean {
  if (!application || !Object.prototype.hasOwnProperty.call(applications, application)) return false
  const app = applications[application]
  return app?.platform === "web" && app.operator_console === true && networkAdministeredBy(application, applications) === null
}

/**
 * L'application n'est-elle scellée qu'à son entrée exacte ? Toute application qui administre un réseau
 * (constat F2) et la console du moteur (constat F3) : leur session ouvre une autorité.
 */
function requiresExactEntry(application: string): boolean {
  return networkAdministeredBy(application) !== null || isOperatorConsoleApplication(application)
}

// Un chemin d'entrée : des segments de caractères non réservés, sans segment vide, sans barre finale,
// ni requête, ni fragment, ni encodage (la même forme que les chemins sûrs du retour d'un refus IDN).
const ENTRY_PATH = /^(?:\/[A-Za-z0-9._~-]+)+$/

/**
 * Revue CH-815 A1b (constat F2) — le chemin d'ENTRÉE d'une application web du catalogue (`entry_path`),
 * la seule page où elle reçoit le retour d'IDN et son jeton à usage unique ; `null` s'il n'est pas
 * déclaré, ou pas sous la forme d'un chemin simple. Requis pour toute application qui administre un
 * réseau et pour la console du moteur (constat F3), et pour elles seules (cliquet `deploy-catalog`).
 */
export function entryPathOf(application: string | null | undefined, applications: Readonly<Record<string, CatalogApplication>> = catalog.applications): string | null {
  if (!application || !Object.prototype.hasOwnProperty.call(applications, application)) return null
  const app = applications[application]
  return app?.platform === "web" && typeof app.entry_path === "string" && ENTRY_PATH.test(app.entry_path) ? app.entry_path : null
}

const MAX_RETURN_URL_LENGTH = 2_048

/** L'application d'une adresse ABSOLUE de retour : http(s), sans identifiants, d'une origine de confiance au catalogue ; `null` sinon. */
function applicationOfReturnURL(value: unknown, env: Env): ApplicationKey | null {
  if (typeof value !== "string" || value.length > MAX_RETURN_URL_LENGTH) return null
  let url: URL
  try { url = new URL(value) } catch { return null }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return null
  if (!trustedOrigins(env).includes(url.origin)) return null
  return applicationOfOrigin(url.origin, env)
}

/**
 * ADR-0042 — l'application du catalogue où un retour IDN LIVRE la nouvelle session, ou `null`.
 *
 * Établi par la lecture du parcours (Better Auth 1.6, greffon `crossDomain`) et par la recette
 * `idnApplication.test.ts` :
 * - le rappel IDN est une navigation GET du navigateur vers le rappel CENTRAL du moteur
 *   (`redirectURI` : `${SITE_URL}/api/auth/oauth2/callback/idn`). Un navigateur ne met pas d'en-tête
 *   `Origin` sur une navigation GET ; s'il y en avait un, ce serait celui d'IDN ou du site principal,
 *   jamais l'application de départ. L'origine passée à `createAuth` au rappel ne dit donc RIEN de
 *   l'application : elle n'est jamais lue ici ;
 * - l'état OAuth, lui, est enregistré EN BASE par le moteur au départ (`storeStateStrategy:
 *   "database"`), relu et consommé au rappel, jamais pris du navigateur. Son `callbackURL` a été
 *   contrôlé au départ contre les origines de confiance (`originCheck` de Better Auth), rendu absolu
 *   à l'origine de la requête de départ par `crossDomain`, et c'est LUI qui reçoit le jeton à usage
 *   unique de la session (le seul moyen, pour une application web, de la récupérer) : la session
 *   n'existe que dans l'application de cette adresse.
 * D'où la règle : l'application de l'origine EXACTE de `callbackURL` (absolue, http(s), sans
 * identifiants, de confiance, au catalogue) ; une adresse de nouvel utilisateur (`newUserURL`), si
 * elle est donnée, doit mener à la MÊME application (Better Auth y redirige un compte neuf) ; un
 * parcours natif (`antsiaNative`) n'en a aucune. Pour une application qui administre un réseau (constat
 * F2) et pour la console du moteur (constat F3), les trois adresses doivent valoir exactement son entrée
 * (`exactEntryMatches`). Tout le reste rend `null` : la preuve ne vaut alors ni pour l'administration
 * d'un réseau, ni pour la console (fermé par défaut).
 */
export function applicationOfOAuthState(state: unknown, env: Env = process.env): ApplicationKey | null {
  if (!state || typeof state !== "object" || Object.prototype.hasOwnProperty.call(state, "antsiaNative")) return null
  const { callbackURL, newUserURL, errorURL } = state as { callbackURL?: unknown; newUserURL?: unknown; errorURL?: unknown }
  const application = applicationOfReturnURL(callbackURL, env)
  if (application === null || typeof callbackURL !== "string") return null
  if (requiresExactEntry(application)) return exactEntryMatches(application, callbackURL, newUserURL, errorURL) ? application : null
  if (newUserURL !== undefined && newUserURL !== "" && applicationOfReturnURL(newUserURL, env) !== application) return null
  return application
}

/**
 * Revue CH-815 A1b (constat F2), étendue à la console (constat F3) — une application qui ADMINISTRE un
 * réseau, ou la console du moteur, n'est scellée que si les TROIS adresses de retour enregistrées au départ
 * (`callbackURL`, `newUserURL`, `errorURL`) valent EXACTEMENT son origine suivie de son chemin d'entrée
 * (`entry_path`), sans requête ni fragment : le jeton à usage unique de la session n'atterrit alors que sur
 * sa page d'entrée, qui l'échange et l'efface. Une adresse absente ne vaut pas l'entrée (Better Auth
 * complète une adresse d'erreur absente par la sienne, au rappel central) ; un chemin d'entrée non déclaré
 * ne scelle rien (fermé par défaut).
 */
function exactEntryMatches(application: ApplicationKey, callbackURL: string, newUserURL: unknown, errorURL: unknown): boolean {
  const entryPath = entryPathOf(application)
  if (entryPath === null) return false
  const entry = `${new URL(callbackURL).origin}${entryPath}`
  return callbackURL === entry && newUserURL === entry && errorURL === entry
}

function secureEndpoint(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password && !url.hash ? url.href : undefined
  } catch { return undefined }
}

export function idnConfiguration(env: Env = process.env) {
  const issuer = secureEndpoint(env.IDN_ISSUER)
  const discoveryUrl = secureEndpoint(env.IDN_DISCOVERY_URL)
  if (!env.IDN_CLIENT_ID?.trim() || !env.IDN_CLIENT_SECRET?.trim() || (!issuer && !discoveryUrl)) return null
  return { clientId: env.IDN_CLIENT_ID, clientSecret: env.IDN_CLIENT_SECRET, ...(issuer ? { issuer } : {}), ...(discoveryUrl ? { discoveryUrl } : {}) }
}

export function smsConfiguration(env: Env = process.env) {
  const endpoint = secureEndpoint(env.SMS_ENDPOINT)
  return env.SMS_PROVIDER === "webhook" && endpoint && env.SMS_API_KEY?.trim() ? { endpoint, apiKey: env.SMS_API_KEY } : null
}

export function authenticationConfiguration(env: Env = process.env) {
  const localCodes = devToolsAllowed(env)
  // Les comptes de démonstration entrent par code e-mail même sans service de courriel :
  // leur code s'affiche à l'écran (`demoCodeReadable`), toute autre adresse exige Resend.
  const demoAccounts = demoAccountsAllowed(env)
  const allowed = trustedOrigins(env)
  return {
    idn: idnConfiguration(env) !== null,
    emailOtp: localCodes || demoAccounts || Boolean(env.RESEND_API_KEY?.trim() && env.RESEND_FROM_ADDRESS?.trim()),
    smsOtp: localCodes || smsConfiguration(env) !== null,
    localCodes,
    demoAccounts,
    trustedOrigins: allowed,
    applications: webApplications.map((app) => ({
      key: app.key,
      origin: localCodes ? `http://localhost:${app.dev_port}` : new URL(app.site_url).origin,
    })).filter((app) => allowed.includes(app.origin)),
  }
}

export const isE164Phone = (phone: string) => /^\+[1-9]\d{7,14}$/.test(phone)

/** Aucun champ civil ne passe dans la personne ni dans le composant Better Auth. */
export function idnProfileProof(profile: Record<string, unknown>) {
  if (typeof profile.sub !== "string" || !profile.sub.trim() || profile.sub.length > 256 ||
      typeof profile.email !== "string" || !profile.email.includes("@") || profile.email_verified !== true) throw new Error("idnInvalidProfile")
  const loa = profile.loa
  if (loa !== undefined && loa !== 1 && loa !== 2 && loa !== 3) throw new Error("idnInvalidProfile")
  const profileType = profile.profile_type
  if (profileType !== undefined && profileType !== "citizen" && profileType !== "resident" && profileType !== "visitor" && profileType !== "developer") throw new Error("idnInvalidProfile")
  return {
    subject: profile.sub,
    ...(loa !== undefined ? { loa } : {}),
    ...(typeof profile.nationality === "string" && profile.nationality.length <= 64 ? { nationality: profile.nationality } : {}),
    ...(profileType !== undefined ? { profileType } : {}),
  }
}
