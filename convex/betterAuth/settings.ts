/** PA4 — configuration publique des portes, secrets lus uniquement par le serveur. */
import catalog from "../../deploy/catalog.json"
import { demoAccountsAllowed, devToolsAllowed } from "../lib/devTools"

type Env = Record<string, string | undefined>

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
 * L'application du catalogue servie à cette origine : son adresse publique, ou son
 * port local quand les outils de développement sont ouverts. `null` sinon.
 */
export function applicationOfOrigin(origin: string | null | undefined, env: Env = process.env): ApplicationKey | null {
  const [normalized] = parseOriginList(origin ?? "")
  if (!normalized) return null
  const local = devToolsAllowed(env)
  for (const app of webApplications) {
    if (parseOriginList(app.site_url).includes(normalized)) return app.key
    if (local && [`http://localhost:${app.dev_port}`, `http://127.0.0.1:${app.dev_port}`].includes(normalized)) return app.key
  }
  return null
}

export function trustedOrigins(env: Env = process.env): string[] {
  const origins = [...parseOriginList(env.SITE_URL), ...parseOriginList(env.TRUSTED_ORIGINS)]
  for (const app of webApplications) {
    origins.push(...parseOriginList(app.site_url))
    if (devToolsAllowed(env)) origins.push(`http://localhost:${app.dev_port}`, `http://127.0.0.1:${app.dev_port}`)
  }
  return [...new Set(origins)]
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
