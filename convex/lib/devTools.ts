/**
 * Outils de DÉVELOPPEMENT — jamais en production.
 *
 * Double garde, comme les graines : la variable `ANTSIA_DEV_TOOLS=true` posée
 * par le propriétaire ET un déploiement LOCAL (backend Convex sur la machine,
 * `CONVEX_CLOUD_URL` en `http://127.0.0.1` ou `http://localhost`). Une variable
 * oubliée sur un déploiement en nuage n'ouvre donc rien.
 *
 * Seule exception, plus étroite : le DÉPLOIEMENT DE DÉMONSTRATION déclaré
 * (`demoDeploymentDeclared`) ouvre les comptes de démonstration d'ANTSIA et de
 * DIASPORALE (ADR-0029, ADR-0038) et la lecture de LEURS codes, rien d'autre (ni
 * origines locales, ni codes des autres adresses, ni cookies non sécurisés).
 */
type Env = Record<string, string | undefined>

/** Le domaine réservé des comptes de démonstration d'ANTSIA (RFC 2606 : jamais routable). */
export const DEMO_EMAIL_DOMAIN = "demo.antsia.test"
/**
 * Le domaine réservé des comptes de démonstration de DIASPORALE (ADR-0038), celui
 * de `diasporaleDemoEmailOf` : le test de la tranche `diaspora` vérifie qu'ils restent égaux.
 */
export const DIASPORALE_DEMO_EMAIL_DOMAIN = "demo.diasporale.test"
/** Les domaines réservés dont le code peut s'afficher sur la démonstration déclarée. */
export const DEMO_EMAIL_DOMAINS = [DEMO_EMAIL_DOMAIN, DIASPORALE_DEMO_EMAIL_DOMAIN] as const

/** Le déploiement courant tourne-t-il sur la machine (backend local) ? */
export function isLocalDeployment(env: Env = process.env): boolean {
  return /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(env.CONVEX_CLOUD_URL ?? "")
}

/** Les outils de développement sont-ils ouverts ici ? */
export function devToolsAllowed(env: Env = process.env): boolean {
  return (env.ANTSIA_DEV_TOOLS ?? env.ANTIA_DEV_TOOLS) === "true" && isLocalDeployment(env)
}

/** Le nom du déploiement Convex en nuage (`https://<nom>.convex.cloud`, région comprise), `null` ailleurs. */
export function cloudDeploymentName(env: Env = process.env): string | null {
  let url: URL
  try {
    url = new URL(env.CONVEX_CLOUD_URL ?? "")
  } catch {
    return null
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password || !url.hostname.endsWith(".convex.cloud")) return null
  const name = url.hostname.split(".")[0] ?? ""
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) ? name : null
}

/**
 * Ce déploiement est-il LE déploiement de démonstration ? Le propriétaire y pose
 * `ANTSIA_DEMO_DEPLOYMENT` au NOM même du déploiement (celui de son
 * `CONVEX_CLOUD_URL`). Une variable recopiée sur un autre déploiement — la
 * production comprise — ne correspond pas à son nom et n'ouvre rien.
 */
export function demoDeploymentDeclared(env: Env = process.env): boolean {
  const declared = env.ANTSIA_DEMO_DEPLOYMENT?.trim()
  const name = cloudDeploymentName(env)
  return Boolean(declared) && name !== null && declared === name
}

/** Les comptes de démonstration (ANTSIA et DIASPORALE) sont-ils ouverts ici ? (développement local ou démonstration déclarée) */
export function demoAccountsAllowed(env: Env = process.env): boolean {
  return devToolsAllowed(env) || demoDeploymentDeclared(env)
}

/** L'adresse est-elle sur un domaine réservé des comptes de démonstration ? */
export function isDemoEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase()
  return DEMO_EMAIL_DOMAINS.some((domain) => normalized.endsWith(`@${domain}`))
}

/** Le code envoyé à cette adresse peut-il s'afficher à l'écran ici ? */
export function demoCodeReadable(email: string, env: Env = process.env): boolean {
  return devToolsAllowed(env) || (demoDeploymentDeclared(env) && isDemoEmail(email))
}
