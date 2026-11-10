import { v } from "convex/values"

import { query } from "./_generated/server"

/**
 * Forme d'une version déclarée : celle des étiquettes de construction des sites
 * (`main-<sha12>-production`). Une valeur hors de cette forme n'est pas
 * rendue : la version vaut alors « non déclarée », jamais une valeur inventée.
 */
const DECLARED_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/

/**
 * Version du moteur déclarée à la publication par la variable de déploiement
 * `ANTSIA_ENGINE_VERSION` (posée par le propriétaire, jamais par le code) ;
 * `null` quand elle est absente, vide ou hors forme.
 */
export function declaredEngineVersion(raw: string | undefined): string | null {
  const value = raw?.trim()
  return value && DECLARED_VERSION.test(value) ? value : null
}

/**
 * Sonde de santé du moteur, appelée avec un délai borné par les routes
 * `/api/sante-fonctionnelle` des applications (EX-03) : sa réponse prouve que
 * le moteur exécute une fonction. Ne lit aucune table et ne rend aucune donnée
 * personnelle : l'état, la date du serveur, la version déclarée.
 *
 * `requestedAt` (l'heure de l'appelant) rend chaque appel unique : Convex met en
 * cache le résultat d'une requête qui ne lit aucune table, et `Date.now()`
 * resterait figé à la première exécution (mesuré le 10/11 sur le backend local :
 * trois appels sur quatre secondes, une seule date). Avec un argument nouveau, la
 * fonction s'exécute vraiment à chaque sonde.
 * L'argument reste FACULTATIF : une application qui appelle encore `ping({})`
 * (la route de diasporale.com, écrite avant EX-03) garde une réponse valide ;
 * elle prouve que le moteur répond, mais sa date peut venir du cache.
 * Hors des modules sociaux : ni réseau ni adhésion (cliquet
 * `network-scoped-functions`).
 */
export const ping = query({
  args: { requestedAt: v.optional(v.number()) },
  returns: v.object({
    status: v.literal("ok"),
    serverTime: v.number(),
    engineVersion: v.union(v.string(), v.null()),
  }),
  handler: async () => ({
    status: "ok" as const,
    serverTime: Date.now(),
    engineVersion: declaredEngineVersion(process.env.ANTSIA_ENGINE_VERSION),
  }),
})
