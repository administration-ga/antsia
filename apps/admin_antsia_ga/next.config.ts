import { createEngineNextConfig } from "@antsia/api/next-config"
import type { NextConfig } from "next"

/**
 * Configuration Next.js 16 de l'application — commune au moteur
 * (`@antsia/api/next-config`) : racine ECOSYSTEMES, sortie standalone, paquets
 * du moteur en sources, en-têtes de sécurité, déploiement Convex lu dans
 * `ANTSIA/.env.local` en développement et dans les ARG du Dockerfile en production.
 *
 * Un seul écart avec le moteur (revue CH-815, constat F3 ; même motif
 * qu'admin.diaspora.ga) : `Referrer-Policy` vaut `no-referrer` sur toutes les
 * routes. Le retour d'IDN arrive sur `/entrer` avec le jeton à usage unique de la
 * session dans l'adresse ; aucune requête ne doit emporter cette adresse, même un
 * instant. Les autres en-têtes du moteur (CSP comprise) restent tels quels, dans
 * leur ordre.
 */
const engineConfig = createEngineNextConfig({ appDir: process.cwd() })

const REFERRER_POLICY = { key: "Referrer-Policy", value: "no-referrer" } as const
/** La source « toutes les routes » de la configuration commune. */
const EVERY_ROUTE = "/(.*)"

type HeaderRule = Awaited<ReturnType<NonNullable<NextConfig["headers"]>>>[number]

/** La politique du moteur remplacée à sa place, ou ajoutée si la règle n'en porte pas. */
function withNoReferrer(headers: HeaderRule["headers"]): HeaderRule["headers"] {
  const replaced = headers.map((header) => (header.key.toLowerCase() === "referrer-policy" ? { ...REFERRER_POLICY } : header))
  return replaced.some((header) => header.key === REFERRER_POLICY.key) ? replaced : [...replaced, { ...REFERRER_POLICY }]
}

const config: NextConfig = {
  ...engineConfig,
  async headers() {
    const rules = (await engineConfig.headers?.()) ?? []
    const covered = rules.some((rule) => rule.source === EVERY_ROUTE && rule.has === undefined && rule.missing === undefined)
    return [
      ...rules.map((rule) => ({ ...rule, headers: withNoReferrer(rule.headers) })),
      ...(covered ? [] : [{ source: EVERY_ROUTE, headers: [{ ...REFERRER_POLICY }] }]),
    ]
  },
}

export default config
